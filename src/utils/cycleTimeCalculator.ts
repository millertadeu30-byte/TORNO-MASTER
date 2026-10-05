import { SimulationPlotItem } from "../types";

export interface CycleTimeBreakdown {
  totalSeconds: number;
  rapidSeconds: number;
  feedSeconds: number;
  delaysSeconds: number;
  formatted: string;
}

interface CommandBlock {
  lineNumber: number;
  cleanText: string;
  gCodes: number[];
  mCodes: number[];
  x: number | null;
  z: number | null;
  r: number | null;
  p: number | null;
  q: number | null;
  u: number | null;
  w: number | null;
  f: number | null;
  s: number | null;
  t: string | null;
  n: number | null;
}

/**
 * Calculates estimated cycle time in seconds for CNC Lathe G-code program
 * with modal state progression, feeds (G94/G95), speeds (G96/G97),
 * canned roughing/finishing cycles (G70, G71, G74, G75, G76), tool changes,
 * and rapid positioning.
 */
export function calculateCycleTime(
  gcodeText: string,
  _plotList?: SimulationPlotItem[]
): number {
  if (!gcodeText || !gcodeText.trim()) return 0;

  const lines = gcodeText.split("\n");
  const blocks: CommandBlock[] = [];

  // Parse blocks line by line preserving sequential modal order
  lines.forEach((lineText, idx) => {
    let clean = lineText.replace(/\(.*?\)/g, "").trim();
    if (!clean || clean.startsWith(";")) return;

    // Remove inline comments starting with ;
    const semiIdx = clean.indexOf(";");
    if (semiIdx !== -1) clean = clean.substring(0, semiIdx).trim();
    if (!clean) return;

    const gMatches = Array.from(clean.matchAll(/\bG(\d+)\b/gi)).map((m) => parseInt(m[1], 10));
    const mMatches = Array.from(clean.matchAll(/\bM(\d+)\b/gi)).map((m) => parseInt(m[1], 10));

    const matchX = clean.match(/\bX\s*(-?\d*\.?\d+)/i);
    const matchZ = clean.match(/\bZ\s*(-?\d*\.?\d+)/i);
    const matchR = clean.match(/\bR\s*(-?\d*\.?\d+)/i);
    const matchP = clean.match(/\bP\s*(\d+)/i);
    const matchQ = clean.match(/\bQ\s*(\d+)/i);
    const matchU = clean.match(/\bU\s*(-?\d*\.?\d+)/i);
    const matchW = clean.match(/\bW\s*(-?\d*\.?\d+)/i);
    const matchF = clean.match(/\bF\s*(-?\d*\.?\d+)/i);
    const matchS = clean.match(/\bS\s*(\d+)/i);
    const matchT = clean.match(/\b(T\d{2,4})\b/i);
    const matchN = clean.match(/\bN\s*(\d+)/i);

    blocks.push({
      lineNumber: idx,
      cleanText: clean,
      gCodes: gMatches,
      mCodes: mMatches,
      x: matchX ? parseFloat(matchX[1]) : null,
      z: matchZ ? parseFloat(matchZ[1]) : null,
      r: matchR ? parseFloat(matchR[1]) : null,
      p: matchP ? parseInt(matchP[1], 10) : null,
      q: matchQ ? parseInt(matchQ[1], 10) : null,
      u: matchU ? parseFloat(matchU[1]) : null,
      w: matchW ? parseFloat(matchW[1]) : null,
      f: matchF ? Math.abs(parseFloat(matchF[1])) : null,
      s: matchS ? Math.abs(parseFloat(matchS[1])) : null,
      t: matchT ? matchT[1].toUpperCase() : null,
      n: matchN ? parseInt(matchN[1], 10) : null,
    });
  });

  // Simulation parameters & modal states
  let currentGMode = 0; // 0=G00, 1=G01, 2=G02, 3=G03
  let isG95 = true; // Default mm/rev in lathe (G95 / G99)
  let isG96 = false; // Default G97 RPM mode
  let currentFeed = 0.20; // Default mm/rev
  let currentSpindle = 1200; // Default RPM or m/min CSS
  let maxRPM = 3000; // Default G50 max RPM
  const rapidFeed = 20000; // Rapid rate in mm/min (standard CNC lathe parameter)

  let currentX = 0; // Diameter
  let currentZ = 0; // Z
  let lastTool: string | null = null;

  let totalTimeSec = 0;

  // Last G71/G74/G75/G76 line 1 params
  let lastG71_Line1: { u: number; r: number } | null = null;

  // Helper function to calculate feed velocity in mm/min
  const getFeedVelocityMMMin = (fVal: number | null, dia1: number, dia2: number): number => {
    const f = fVal !== null && fVal > 0 ? fVal : currentFeed;
    if (!isG95) {
      // G94 mode: feed rate is directly mm/min
      return Math.max(1, f);
    }

    // G95 mode: feed is mm/rev -> Velocity = F * RPM
    let rpm = currentSpindle;
    if (isG96) {
      const avgDia = Math.max(2.0, (Math.abs(dia1) + Math.abs(dia2)) / 2);
      const computedRPM = (currentSpindle * 1000) / (Math.PI * avgDia);
      rpm = Math.min(computedRPM, maxRPM);
    }

    rpm = Math.max(50, rpm);
    return Math.max(1, f * rpm);
  };

  // Process blocks sequentially
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const b = blocks[bIdx];

    // Check modal G-codes
    if (b.gCodes.includes(94) || b.gCodes.includes(98)) isG95 = false;
    if (b.gCodes.includes(95) || b.gCodes.includes(99)) isG95 = true;
    if (b.gCodes.includes(96)) isG96 = true;
    if (b.gCodes.includes(97)) isG96 = false;

    // Check G50 / G92 Max RPM
    if ((b.gCodes.includes(50) || b.gCodes.includes(92)) && b.s !== null) {
      maxRPM = Math.max(100, b.s);
    } else if (b.s !== null) {
      currentSpindle = Math.max(10, b.s);
    }

    // Check Feed F
    if (b.f !== null) {
      currentFeed = b.f;
    }

    // Tool Change delay
    if (b.t && b.t !== lastTool) {
      lastTool = b.t;
      totalTimeSec += 2.0; // 2s tool turret index
    }

    // Spindle start M3 / M4
    if (b.mCodes.includes(3) || b.mCodes.includes(4)) {
      totalTimeSec += 1.5; // 1.5s spindle ramp up
    }

    // Dwell G04 / G4
    if (b.gCodes.includes(4)) {
      if (b.p !== null) {
        totalTimeSec += b.p > 50 ? b.p / 1000 : b.p;
      } else if (b.u !== null) {
        totalTimeSec += Math.abs(b.u);
      } else if (b.x !== null) {
        totalTimeSec += Math.abs(b.x);
      } else {
        totalTimeSec += 1.0;
      }
      continue;
    }

    // Update active G mode
    for (const g of b.gCodes) {
      if ([0, 1, 2, 3, 70, 71, 74, 75, 76].includes(g)) {
        currentGMode = g;
      }
    }

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
          const tx = profBlock.x !== null ? profBlock.x : px;
          const tz = profBlock.z !== null ? profBlock.z : pz;

          const dxRad = Math.abs(tx - px) / 2;
          const dz = Math.abs(tz - pz);
          const dist = Math.sqrt(dxRad * dxRad + dz * dz);

          if (dist > 0.0001) {
            const vel = getFeedVelocityMMMin(g70Feed, px, tx);
            totalTimeSec += (dist / vel) * 60;
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
        lastG71_Line1 = { u: Math.abs(b.u), r: Math.abs(b.r) };
        continue;
      }

      // Line 2: G71 P... Q... U... W... F...
      if (b.p !== null && b.q !== null) {
        const depthCutU = lastG71_Line1 ? lastG71_Line1.u : (b.u !== null ? Math.abs(b.u) : 2.5);
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
              minProfX = Math.min(minProfX, blk.x);
              maxProfX = Math.max(maxProfX, blk.x);
            }
            if (blk.z !== null) {
              endProfZ = blk.z;
            }
          }

          const totalRadialDepth = Math.max(0.5, Math.abs(currentX - minProfX) / 2);
          const numPasses = Math.max(1, Math.ceil(totalRadialDepth / Math.max(0.1, depthCutU)));
          const zTravel = Math.max(1, Math.abs(endProfZ - startProfZ));

          // Each pass = Feed Z + Rapid Retract R + Rapid Z Back
          const vel = getFeedVelocityMMMin(g71Feed, currentX, minProfX);
          const timePerFeedPass = (zTravel / vel) * 60;
          const timePerRapidRetract = ((zTravel + retractR * 2) / rapidFeed) * 60;

          totalTimeSec += numPasses * (timePerFeedPass + timePerRapidRetract);
        }
        continue;
      }
    }

    // CANNED CYCLE: G74 PECK DRILLING
    if (currentGMode === 74) {
      if (b.z !== null) {
        const peckQ = b.q ? b.q / 1000 : 3.0;
        const totalZ = Math.abs(b.z - currentZ);
        const numPecks = Math.max(1, Math.ceil(totalZ / peckQ));
        const g74Feed = b.f !== null ? b.f : currentFeed;

        const vel = getFeedVelocityMMMin(g74Feed, currentX, currentX);
        const timeFeed = (totalZ / vel) * 60;
        const timeRapidRetracts = numPecks * ((peckQ * 2) / rapidFeed) * 60;

        totalTimeSec += timeFeed + timeRapidRetracts;
        currentZ = b.z;
        continue;
      }
    }

    // CANNED CYCLE: G75 GROOVING
    if (currentGMode === 75) {
      if (b.x !== null) {
        const g75Feed = b.f !== null ? b.f : currentFeed;
        const depthX = Math.abs(b.x - currentX) / 2;
        const shiftZ = b.z !== null ? Math.abs(b.z - currentZ) : 0;
        const numPlunges = b.q ? Math.max(1, Math.ceil(shiftZ / (b.q / 1000))) : 1;

        const vel = getFeedVelocityMMMin(g75Feed, currentX, b.x);
        const timePlungeFeed = ((depthX * numPlunges) / vel) * 60;
        const timePlungeRapid = ((depthX * numPlunges) / rapidFeed) * 60;

        totalTimeSec += timePlungeFeed + timePlungeRapid;
        if (b.x !== null) currentX = b.x;
        if (b.z !== null) currentZ = b.z;
        continue;
      }
    }

    // CANNED CYCLE: G76 THREADING
    if (currentGMode === 76) {
      if (b.x !== null && b.z !== null) {
        const pitch = b.f !== null ? b.f : 1.5;
        const threadLen = Math.abs(b.z - currentZ);
        const numPasses = 8;

        let rpm = currentSpindle;
        if (isG96) {
          const avgDia = Math.max(5.0, (Math.abs(currentX) + Math.abs(b.x)) / 2);
          rpm = Math.min((currentSpindle * 1000) / (Math.PI * avgDia), maxRPM);
        }
        rpm = Math.max(100, rpm);

        const threadFeedMMMin = pitch * rpm;
        const timePerPassFeed = (threadLen / threadFeedMMMin) * 60;
        const timePerPassRapid = (threadLen / rapidFeed) * 60;

        totalTimeSec += numPasses * (timePerPassFeed + timePerPassRapid);
        currentX = b.x;
        currentZ = b.z;
        continue;
      }
    }

    // STANDARD G00 / G01 / G02 / G03 MOVEMENTS
    if (b.x !== null || b.z !== null) {
      const targetX = b.x !== null ? b.x : currentX;
      const targetZ = b.z !== null ? b.z : currentZ;

      const dxRad = Math.abs(targetX - currentX) / 2;
      const dz = Math.abs(targetZ - currentZ);
      let distMM = Math.sqrt(dxRad * dxRad + dz * dz);

      if (b.r !== null && (currentGMode === 2 || currentGMode === 3)) {
        const chord = distMM;
        const rVal = Math.abs(b.r) || 1;
        const angle = 2 * Math.asin(Math.min(1, chord / (2 * rVal)));
        distMM = rVal * angle;
      }

      if (distMM > 0.0001) {
        if (currentGMode === 0) {
          // Rapid movement (G00)
          totalTimeSec += (distMM / rapidFeed) * 60;
        } else {
          // Feed movement (G01 / G02 / G03)
          const moveFeed = b.f !== null ? b.f : currentFeed;
          const vel = getFeedVelocityMMMin(moveFeed, currentX, targetX);
          totalTimeSec += (distMM / vel) * 60;
        }
      }

      currentX = targetX;
      currentZ = targetZ;
    }
  }

  return totalTimeSec;
}

/**
 * Formats total seconds into HH:MM:SS string format e.g. "00:01:25"
 */
export function formatCycleTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00:00";
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}
