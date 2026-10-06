import { SimulationPlotItem } from "../types";

export interface CycleTimeBreakdown {
  totalSeconds: number;
  feedSeconds: number;
  rapidSeconds: number;
  delaySeconds: number;
  formatted: string;
  formattedTenths: string;
}

interface CommandBlock {
  lineNumber: number;
  cleanText: string;
  gCodes: number[];
  mCodes: number[];
  x: number | null;
  y: number | null;
  z: number | null;
  r: number | null;
  p: number | null;
  q: number | null;
  u: number | null;
  v: number | null;
  w: number | null;
  f: number | null;
  s: number | null;
  t: string | null;
  n: number | null;
}

/**
 * Extracts floating point or decimal number value for a given letter address
 * e.g., F.22 -> 0.22, F.1 -> 0.1, F0.2 -> 0.2, X-15.5 -> -15.5, Z.5 -> 0.5
 * Handles concatenated/unspaced G-code strings strictly with period (.) decimal notation according to ISO CNC standards.
 */
function extractValue(text: string, letter: string): number | null {
  const regex = new RegExp(`${letter}\\s*(-?(?:\\d+\\.\\d*|\\d+|\\.\\d+))`, "i");
  const m = text.match(regex);
  if (m) {
    const val = parseFloat(m[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Extracts all G-codes present on a line (e.g. G99G96 -> [99, 96])
 */
function extractGCodes(text: string): number[] {
  const matches = Array.from(text.matchAll(/G\s*(\d+(?:\.\d+)?)/gi));
  return matches.map((m) => parseFloat(m[1]));
}

/**
 * Extracts all M-codes present on a line (e.g. M3, M08, M09, M5 -> [3, 8, 9, 5])
 */
function extractMCodes(text: string): number[] {
  const matches = Array.from(text.matchAll(/M\s*(\d+)/gi));
  return matches.map((m) => parseInt(m[1], 10));
}

/**
 * Extracts tool call (e.g. T2, T02, T0202, T0101 -> "T2")
 */
function extractTool(text: string): string | null {
  const m = text.match(/T\s*(\d{1,4})/i);
  return m ? `T${parseInt(m[1], 10)}` : null;
}

/**
 * Calculates detailed cycle time breakdown in seconds for CNC Lathe G-code program
 * with realistic machine kinematics, feeds (G94/G95/G98/G99), speeds (G96/G97),
 * canned cycles (G70, G71, G74, G75, G76), tool changes, and machine G0 rapid speed.
 */
export function calculateCycleTimeDetailed(
  gcodeText: string,
  rapidFeedMMin: number = 24, // Machine G0 rapid speed in m/min (e.g. 24 m/min)
  _plotList?: SimulationPlotItem[]
): CycleTimeBreakdown {
  if (!gcodeText || !gcodeText.trim()) {
    return {
      totalSeconds: 0,
      feedSeconds: 0,
      rapidSeconds: 0,
      delaySeconds: 0,
      formatted: "00:00:00",
      formattedTenths: "00:00:00.0",
    };
  }

  const lines = gcodeText.split("\n");
  const blocks: CommandBlock[] = [];

  // Parse blocks line by line preserving sequential modal order
  lines.forEach((lineText, idx) => {
    let clean = lineText.replace(/\(.*?\)/g, ""); // Remove (comment)
    const semiIdx = clean.indexOf(";");
    if (semiIdx !== -1) clean = clean.substring(0, semiIdx); // Remove ; comment
    clean = clean.trim();
    if (!clean) return;

    const gMatches = extractGCodes(clean);
    const mMatches = extractMCodes(clean);

    const matchX = extractValue(clean, "X");
    const matchY = extractValue(clean, "Y");
    const matchZ = extractValue(clean, "Z");
    const matchR = extractValue(clean, "R");
    const matchP = extractValue(clean, "P");
    const matchQ = extractValue(clean, "Q");
    const matchU = extractValue(clean, "U");
    const matchV = extractValue(clean, "V");
    const matchW = extractValue(clean, "W");
    const matchF = extractValue(clean, "F");
    const matchS = extractValue(clean, "S");
    const matchT = extractTool(clean);

    const matchN = clean.match(/N\s*(\d+)/i);

    blocks.push({
      lineNumber: idx,
      cleanText: clean,
      gCodes: gMatches,
      mCodes: mMatches,
      x: matchX,
      y: matchY,
      z: matchZ,
      r: matchR,
      p: matchP !== null ? Math.round(matchP) : null,
      q: matchQ !== null ? Math.round(matchQ) : null,
      u: matchU,
      v: matchV,
      w: matchW,
      f: matchF !== null ? Math.abs(matchF) : null,
      s: matchS !== null ? Math.abs(matchS) : null,
      t: matchT,
      n: matchN ? parseInt(matchN[1], 10) : null,
    });
  });

  // Simulation parameters & modal states
  let currentGMode = 0; // 0=G00, 1=G01, 2=G02, 3=G03
  let isG95 = true; // Default mm/rev in lathe (G95 / G99)
  let isG96 = false; // Default G97 RPM mode
  let isMetric = true; // G21 mm vs G20 inch
  let currentFeed = 0.15; // Default mm/rev
  let currentSpindle = 1200; // Default RPM or m/min CSS
  let maxRPM = 4000; // Default G50 max RPM (standard CNC lathe limit)
  
  // Rapid speed in mm/min (converted from machine m/min, e.g. 24 m/min = 24000 mm/min)
  const rapidFeedMMMin = Math.max(1000, rapidFeedMMin * 1000);

  let currentX = 0; // Diameter in mm
  let currentY = 0; // Y in mm
  let currentZ = 0; // Z in mm
  let lastTool: string | null = null;

  let feedSeconds = 0;
  let rapidSeconds = 0;
  let delaySeconds = 0;

  // Last G71/G74/G75/G76 line 1 params
  let lastG71_Line1: { u: number; r: number } | null = null;

  // Helper function to calculate feed velocity in mm/min
  const getFeedVelocityMMMin = (fVal: number | null, dia1: number, dia2: number): number => {
    let f = fVal !== null && fVal > 0 ? fVal : currentFeed;
    if (!isMetric) f *= 25.4; // Convert inch/rev or inch/min to mm

    if (!isG95) {
      // G94/G98 mode: feed rate is directly mm/min (or inch/min)
      return Math.max(0.1, f);
    }

    // G95/G99 mode: feed is mm/rev -> Feed Velocity (mm/min) = F * RPM
    let rpm = currentSpindle;
    if (isG96) {
      const avgDia = Math.max(1.0, (Math.abs(dia1) + Math.abs(dia2)) / 2);
      const computedRPM = (currentSpindle * 1000) / (Math.PI * avgDia);
      rpm = Math.min(computedRPM, maxRPM);
    } else {
      rpm = Math.min(currentSpindle, maxRPM);
    }

    rpm = Math.max(20, rpm);
    return Math.max(0.1, f * rpm);
  };

  // Helper to calculate exact physical move time (distMM / feedVelocityMMPerSec)
  const calculateMoveTimeSec = (distMM: number, feedVelocityMMMin: number, isRapid: boolean): number => {
    if (distMM <= 0.0001) return 0;

    const vNominalMMPerSec = feedVelocityMMMin / 60;
    if (vNominalMMPerSec <= 0.0001) return 0;

    const travelTime = distMM / vNominalMMPerSec;
    // 1ms overhead per block for feed moves, 5ms for rapid positioning
    return travelTime + (isRapid ? 0.005 : 0.001);
  };

  // Process blocks sequentially
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const b = blocks[bIdx];

    // Check G20 / G21 Metric vs Inch
    if (b.gCodes.includes(20)) isMetric = false;
    if (b.gCodes.includes(21)) isMetric = true;

    // Check modal G-codes
    if (b.gCodes.includes(94) || b.gCodes.includes(98)) isG95 = false;
    if (b.gCodes.includes(95) || b.gCodes.includes(99)) isG95 = true;
    if (b.gCodes.includes(96)) isG96 = true;
    if (b.gCodes.includes(97)) isG96 = false;

    // Check G50 / G92 Max RPM vs Spindle Speed
    const isG50_G92 = b.gCodes.includes(50) || b.gCodes.includes(92);
    if (isG50_G92 && b.s !== null) {
      maxRPM = Math.max(100, b.s);
    } else if (b.s !== null) {
      currentSpindle = Math.max(10, b.s);
    }

    // Check Feed F
    if (b.f !== null && b.f > 0) {
      currentFeed = b.f;
    }

    // Tool Change delay
    if (b.t && b.t !== lastTool) {
      lastTool = b.t;
      delaySeconds += 2.0; // 2s tool turret index
    }

    // Spindle start M3 / M4
    if (b.mCodes.includes(3) || b.mCodes.includes(4)) {
      delaySeconds += 1.5; // 1.5s spindle ramp up
    }

    // Dwell G04 / G4
    if (b.gCodes.includes(4)) {
      if (b.p !== null) {
        delaySeconds += b.p > 50 ? b.p / 1000 : b.p;
      } else if (b.u !== null) {
        delaySeconds += Math.abs(b.u);
      } else if (b.x !== null) {
        delaySeconds += Math.abs(b.x);
      } else {
        delaySeconds += 1.0;
      }
      continue;
    }

    // Update active G mode
    for (const g of b.gCodes) {
      if ([0, 1, 2, 3, 70, 71, 74, 75, 76].includes(g)) {
        currentGMode = g;
      }
    }

    const scale = isMetric ? 1.0 : 25.4;

    // CANNED CYCLE: G70 FINISHING
    if (currentGMode === 70 && b.p !== null && b.q !== null) {
      const pNum = b.p;
      const qNum = b.q;
      const g70Feed = b.f !== null ? b.f : currentFeed;

      // Locate profile blocks from N pNum to N qNum
      const pIdx = blocks.findIndex((blk) => blk.n === pNum);
      const qIdx = blocks.findIndex((blk) => blk.n === qNum);

      if (pIdx !== -1 && qIdx !== -1 && qIdx >= pIdx) {
        let px = currentX;
        let pz = currentZ;

        for (let k = pIdx; k <= qIdx; k++) {
          const profBlock = blocks[k];
          let tx = px;
          let tz = pz;

          if (profBlock.x !== null) tx = profBlock.x * scale;
          else if (profBlock.u !== null) tx = px + profBlock.u * scale;

          if (profBlock.z !== null) tz = profBlock.z * scale;
          else if (profBlock.w !== null) tz = pz + profBlock.w * scale;

          const dxRad = Math.abs(tx - px) / 2;
          const dz = Math.abs(tz - pz);
          const dist = Math.sqrt(dxRad * dxRad + dz * dz);

          if (dist > 0.0001) {
            const vel = getFeedVelocityMMMin(g70Feed, px, tx);
            feedSeconds += calculateMoveTimeSec(dist, vel, false);
          }

          px = tx;
          pz = tz;
        }

        currentX = px;
        currentZ = pz;
      }
      continue;
    }

    // CANNED CYCLE: G71 ROUGHING
    if (currentGMode === 71) {
      // Line 1: G71 U... R...
      if (b.u !== null && b.r !== null && b.p === null) {
        lastG71_Line1 = { u: Math.abs(b.u) * scale, r: Math.abs(b.r) * scale };
        continue;
      }

      // Line 2: G71 P... Q... U... W... F...
      if (b.p !== null && b.q !== null) {
        const depthCutU = lastG71_Line1 ? lastG71_Line1.u : (b.u !== null ? Math.abs(b.u) * scale : 2.5);
        const retractR = lastG71_Line1 ? lastG71_Line1.r : 1.0;
        const g71Feed = b.f !== null ? b.f : currentFeed;

        const pIdx = blocks.findIndex((blk) => blk.n === b.p);
        const qIdx = blocks.findIndex((blk) => blk.n === b.q);

        if (pIdx !== -1 && qIdx !== -1 && qIdx >= pIdx) {
          // Find max/min profile X and Z span
          let minProfX = currentX;
          let maxProfX = currentX;
          let startProfZ = currentZ;
          let endProfZ = currentZ;

          for (let k = pIdx; k <= qIdx; k++) {
            const blk = blocks[k];
            if (blk.x !== null) {
              minProfX = Math.min(minProfX, blk.x * scale);
              maxProfX = Math.max(maxProfX, blk.x * scale);
            }
            if (blk.z !== null) {
              endProfZ = blk.z * scale;
            }
          }

          const totalRadialDepth = Math.max(0.5, Math.abs(currentX - minProfX) / 2);
          const numPasses = Math.max(1, Math.ceil(totalRadialDepth / Math.max(0.1, depthCutU)));
          const zTravel = Math.max(1, Math.abs(endProfZ - startProfZ));

          const vel = getFeedVelocityMMMin(g71Feed, currentX, minProfX);
          const timePerFeedPass = calculateMoveTimeSec(zTravel, vel, false);
          const timePerRapidRetract = calculateMoveTimeSec(zTravel + retractR * 2, rapidFeedMMMin, true);

          feedSeconds += numPasses * timePerFeedPass;
          rapidSeconds += numPasses * timePerRapidRetract;
        }
        continue;
      }
    }

    // CANNED CYCLE: G74 PECK DRILLING
    if (currentGMode === 74) {
      if (b.z !== null || b.w !== null) {
        const targetZ = b.z !== null ? b.z * scale : currentZ + (b.w ? b.w * scale : 0);
        const peckQ = b.q ? (b.q / 1000) * scale : 3.0;
        const totalZ = Math.abs(targetZ - currentZ);
        const numPecks = Math.max(1, Math.ceil(totalZ / peckQ));
        const g74Feed = b.f !== null ? b.f : currentFeed;

        const vel = getFeedVelocityMMMin(g74Feed, currentX, currentX);
        const timeFeed = calculateMoveTimeSec(totalZ, vel, false);
        const timeRapidRetracts = numPecks * calculateMoveTimeSec(peckQ * 2, rapidFeedMMMin, true);

        feedSeconds += timeFeed;
        rapidSeconds += timeRapidRetracts;
        currentZ = targetZ;
        continue;
      }
    }

    // CANNED CYCLE: G75 GROOVING
    if (currentGMode === 75) {
      if (b.x !== null || b.u !== null) {
        const targetX = b.x !== null ? b.x * scale : currentX + (b.u ? b.u * scale : 0);
        const targetZ = b.z !== null ? b.z * scale : currentZ + (b.w ? b.w * scale : 0);

        const g75Feed = b.f !== null ? b.f : currentFeed;
        const depthX = Math.abs(targetX - currentX) / 2;
        const shiftZ = Math.abs(targetZ - currentZ);
        const numPlunges = b.q ? Math.max(1, Math.ceil(shiftZ / ((b.q / 1000) * scale))) : 1;

        const vel = getFeedVelocityMMMin(g75Feed, currentX, targetX);
        const timePlungeFeed = numPlunges * calculateMoveTimeSec(depthX, vel, false);
        const timePlungeRapid = numPlunges * calculateMoveTimeSec(depthX, rapidFeedMMMin, true);

        feedSeconds += timePlungeFeed;
        rapidSeconds += timePlungeRapid;
        currentX = targetX;
        currentZ = targetZ;
        continue;
      }
    }

    // CANNED CYCLE: G76 THREADING
    if (currentGMode === 76) {
      if ((b.x !== null || b.u !== null) && (b.z !== null || b.w !== null)) {
        const targetX = b.x !== null ? b.x * scale : currentX + (b.u ? b.u * scale : 0);
        const targetZ = b.z !== null ? b.z * scale : currentZ + (b.w ? b.w * scale : 0);

        const pitch = b.f !== null ? b.f * scale : 1.5;
        const threadLen = Math.abs(targetZ - currentZ);
        const numPasses = 8;

        let rpm = currentSpindle;
        if (isG96) {
          const avgDia = Math.max(5.0, (Math.abs(currentX) + Math.abs(targetX)) / 2);
          rpm = Math.min((currentSpindle * 1000) / (Math.PI * avgDia), maxRPM);
        }
        rpm = Math.max(100, rpm);

        const threadFeedMMMin = pitch * rpm;
        const timePerPassFeed = calculateMoveTimeSec(threadLen, threadFeedMMMin, false);
        const timePerPassRapid = calculateMoveTimeSec(threadLen, rapidFeedMMMin, true);

        feedSeconds += numPasses * timePerPassFeed;
        rapidSeconds += numPasses * timePerPassRapid;
        currentX = targetX;
        currentZ = targetZ;
        continue;
      }
    }

    // STANDARD G00 / G01 / G02 / G03 MOVEMENTS
    let targetX = currentX;
    let targetY = currentY;
    let targetZ = currentZ;
    let hasMove = false;

    if (b.x !== null) {
      targetX = b.x * scale;
      hasMove = true;
    } else if (b.u !== null && !isG50_G92) {
      targetX = currentX + b.u * scale;
      hasMove = true;
    }

    if (b.y !== null) {
      targetY = b.y * scale;
      hasMove = true;
    } else if (b.v !== null) {
      targetY = currentY + b.v * scale;
      hasMove = true;
    }

    if (b.z !== null) {
      targetZ = b.z * scale;
      hasMove = true;
    } else if (b.w !== null) {
      targetZ = currentZ + b.w * scale;
      hasMove = true;
    }

    if (hasMove) {
      const dxRad = Math.abs(targetX - currentX) / 2;
      const dy = Math.abs(targetY - currentY);
      const dz = Math.abs(targetZ - currentZ);
      let distMM = Math.sqrt(dxRad * dxRad + dy * dy + dz * dz);

      if (b.r !== null && (currentGMode === 2 || currentGMode === 3)) {
        const chord = distMM;
        const rVal = Math.abs(b.r) * scale || 1;
        const angle = 2 * Math.asin(Math.min(1, chord / (2 * rVal)));
        distMM = rVal * angle;
      }

      if (distMM > 0.0001) {
        if (currentGMode === 0) {
          // Rapid movement (G00)
          rapidSeconds += calculateMoveTimeSec(distMM, rapidFeedMMMin, true);
        } else {
          // Feed movement (G01 / G02 / G03)
          const moveFeed = b.f !== null ? b.f : currentFeed;
          const vel = getFeedVelocityMMMin(moveFeed, currentX, targetX);
          feedSeconds += calculateMoveTimeSec(distMM, vel, false);
        }
      }

      currentX = targetX;
      currentY = targetY;
      currentZ = targetZ;
    }
  }

  const totalSec = feedSeconds + rapidSeconds + delaySeconds;

  return {
    totalSeconds: totalSec,
    feedSeconds,
    rapidSeconds,
    delaySeconds,
    formatted: formatCycleTime(totalSec, false),
    formattedTenths: formatCycleTime(totalSec, true),
  };
}

export function calculateCycleTime(
  gcodeText: string,
  rapidFeedMMin: number = 24,
  plotList?: SimulationPlotItem[]
): number {
  return calculateCycleTimeDetailed(gcodeText, rapidFeedMMin, plotList).totalSeconds;
}

/**
 * Formats total seconds into HH:MM:SS string format e.g. "00:01:25" or "00:01:25.4"
 */
export function formatCycleTime(totalSeconds: number, showTenths: boolean = false): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return showTenths ? "00:00:00.0" : "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  if (showTenths) {
    return `${hh}:${mm}:${ss}.${tenths}`;
  }
  return `${hh}:${mm}:${ss}`;
}
