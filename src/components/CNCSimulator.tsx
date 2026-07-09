import React, { useRef, useEffect, useState } from "react";
import { Play, Pause, AlertTriangle, Square, ChevronRight, SkipForward, HelpCircle, Sun, Moon } from "lucide-react";
import { GCodeCommand, SimulationPlotItem, Point2D } from "../types";

interface CNCSimulatorProps {
  gcodeText: string;
  activeLine: number;
  onLineChange: (lineIdx: number) => void;
  simInvertZ: boolean;
  onToggleZInvert: () => void;
  isDriverActive: boolean;
  setIsDriverActive: (val: boolean) => void;
  isHighContrast: boolean;
  onError?: (error: string) => void;
}

export const CNCSimulator: React.FC<CNCSimulatorProps> = ({
  gcodeText,
  activeLine,
  onLineChange,
  simInvertZ,
  onToggleZInvert,
  isDriverActive,
  setIsDriverActive,
  isHighContrast,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Transform / Camera State
  const [zoom, setZoom] = useState<number>(8);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const [isThemeDark, setIsThemeDark] = useState<boolean>(true);

  // High precision mouse hover / snap coordinate tracking ("Mirinha")
  interface HoveredPointInfo {
    canvasX: number;
    canvasY: number;
    latheX: number;
    latheZ: number;
    gcodeLine: number;
    gcodeText: string;
  }
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointInfo | null>(null);

  // Playback Driver State
  const [driverSpeed, setDriverSpeed] = useState<number>(70); // 0 to 100
  const [driverTick, setDriverTick] = useState<number>(-1); // Represents active simulated line ID
  const [linesWithDrawing, setLinesWithDrawing] = useState<number[]>([]);
  const [toolPos, setToolPos] = useState<Point2D>({ x: 0, y: 0 }); // In absolute lathe coords (Radius, Z)

  // Zoom on scroll wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const deltaY = e.deltaY;
    if (deltaY === 0) return;
    
    // deltaY < 0 is scroll up (zoom in)
    const zoomFactor = deltaY < 0 ? 1.15 : (1 / 1.15);
    
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.2), 300);
      if (newZoom === prevZoom) return prevZoom;
      
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const cX = canvas.width / 2 + 50;
        const cY = canvas.height / 2 + 50;
        
        setPanX(prevPanX => prevPanX + (mouseX - cX - prevPanX) * (1 - newZoom / prevZoom));
        setPanY(prevPanY => prevPanY + (mouseY - cY - prevPanY) * (1 - newZoom / prevZoom));
      }
      
      return newZoom;
    });
  };

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Check if middle click or standard click
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const getDistanceToSegment = (mx: number, my: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = mx - x1;
    const B = my - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = mx - xx;
    const dy = my - yy;
    return {
      distance: Math.sqrt(dx * dx + dy * dy),
      x: xx,
      y: yy
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
      setHoveredPoint(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zDirSign = simInvertZ ? -1 : 1;
    const originX = canvas.width / 2 + 50 + panX;
    const originY = canvas.height / 2 + 50 + panY;

    let closestItem: any = null;
    let minDistance = 35; // Snapping radius of 35px
    let closestPoint = { x: 0, y: 0 };

    plotList.forEach((item) => {
      // Future simulation items should not be snapable if we are paused/stopped in the middle of playback
      if (driverTick !== -2 && driverTick !== -1 && item.linhaId > driverTick) {
        return;
      }

      const x1 = originX + item.z1 * zoom * zDirSign;
      const y1 = originY - item.x1 * zoom;
      const x2 = originX + item.z2 * zoom * zDirSign;
      const y2 = originY - item.x2 * zoom;

      const res = getDistanceToSegment(mouseX, mouseY, x1, y1, x2, y2);
      if (res.distance < minDistance) {
        minDistance = res.distance;
        closestItem = item;
        closestPoint = { x: res.x, y: res.y };
      }
    });

    if (closestItem) {
      // Calculate lathe coordinate of the exact snapped point
      const latheZ = (closestPoint.x - originX) / (zoom * zDirSign);
      const latheRadius = -(closestPoint.y - originY) / zoom;
      const latheX = latheRadius * 2; // Diameter

      // Find original line text
      const lines = gcodeText.split("\n");
      const lineIdx = Math.floor(closestItem.linhaId);
      const rawText = lines[lineIdx] || "";

      setHoveredPoint({
        canvasX: closestPoint.x,
        canvasY: closestPoint.y,
        latheX,
        latheZ,
        gcodeLine: lineIdx,
        gcodeText: rawText.trim()
      });
    } else {
      setHoveredPoint(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleResetView = () => {
    const pList = parseGCode().plotList;
    if (pList.length === 0) {
      setZoom(8);
      setPanX(0);
      setPanY(0);
      return;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pList.forEach((p: any) => {
      minX = Math.min(minX, p.x1, p.x2);
      maxX = Math.max(maxX, p.x1, p.x2);
      minZ = Math.min(minZ, p.z1, p.z2);
      maxZ = Math.max(maxZ, p.z1, p.z2);
    });
    if (minX === Infinity) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.width;
    const ch = canvas.height;
    
    const dx = Math.abs(maxZ - minZ) || 1;
    const dy = Math.abs(maxX - minX) || 1;
    
    const zoomX = (cw - 40) / dx;
    const zoomY = (ch - 40) / dy;
    const newZoom = Math.max(0.5, Math.min(zoomX, zoomY, 30));
    setZoom(newZoom);
    
    const zCenter = (minZ + maxZ) / 2;
    const xCenter = (minX + maxX) / 2;
    
    const newPanX = -zCenter * newZoom * (simInvertZ ? -1 : 1) - 50;
    const newPanY = xCenter * newZoom - 50;
    
    setPanX(newPanX);
    setPanY(newPanY);
  };

  // Dynamic G-Code parsing & Rendering
  const parseGCode = (): { plotList: SimulationPlotItem[]; activeLineIndexes: number[]; error?: string } => {
    try {
    const lines = gcodeText.split("\n");
    let currentGMode = 0; // Standard travel G00
    let lastG71_Line1: { u: number; r: number; lineIndex: number } | null = null;
    let lastG74_Line1: { r: number; lineIndex: number } | null = null;
    let commands: GCodeCommand[] = [];

    // First, pass to gather clean commands
    lines.forEach((lineText, idx) => {
      let clean = lineText.replace(/\(.*?\)/g, "").trim(); // Remove brackets comments
      if (!clean) return;

      const gMatches = clean.match(/G\s*(\d+)/g);
      if (gMatches) {
        gMatches.forEach((gStr) => {
          const num = parseInt(gStr.replace("G", "").trim(), 10);
          if ([0, 1, 2, 3, 70, 71, 74, 75, 76, 96, 97].includes(num)) {
            currentGMode = num;
          }
        });
      }

      // Modifier ,R and ,C for chamfers/radii
      const commaRMatch = clean.match(/,R\s*(-?\d*\.?\d+)/i);
      const commaCMatch = clean.match(/,C\s*(-?\d*\.?\d+)/i);
      const temp = clean.replace(/,[RC]\s*-?\d*\.?\d+/gi, "");

      const matchX = temp.match(/X\s*(-?\d*\.?\d+)/i);
      const matchZ = temp.match(/Z\s*(-?\d*\.?\d+)/i);
      const matchR = temp.match(/R\s*(-?\d*\.?\d+)/i);
      const matchN = clean.match(/N\s*(\d+)/i);
      const matchP = clean.match(/P\s*(\d+)/i);
      const matchQ = clean.match(/Q\s*(\d+)/i);
      const matchU = clean.match(/U\s*(-?\d*\.?\d+)/i);
      const matchW = clean.match(/W\s*(-?\d*\.?\d+)/i);
      const matchF = clean.match(/F\s*(-?\d*\.?\d+)/i);

      const cmd: GCodeCommand = {
        mode: currentGMode,
        x: matchX ? parseFloat(matchX[1]) : null,
        z: matchZ ? parseFloat(matchZ[1]) : null,
        r: matchR ? parseFloat(matchR[1]) : null,
        commaR: commaRMatch ? parseFloat(commaRMatch[1]) : null,
        commaC: commaCMatch ? parseFloat(commaCMatch[1]) : null,
        n: matchN ? parseInt(matchN[1], 10) : null,
        p: matchP ? parseInt(matchP[1], 10) : null,
        q: matchQ ? parseInt(matchQ[1], 10) : null,
        u: matchU ? parseFloat(matchU[1]) : null,
        w: matchW ? parseFloat(matchW[1]) : null,
        f: matchF ? parseFloat(matchF[1]) : null,
        text: clean,
        linhaOriginal: idx,
      };

      commands.push(cmd);
    });

    // Determine absolute coordinate paths (X represents Diameter, divide by 2 for radius)
    let cx = 0;
    let cz = 0;
    let firstX = null;
    let firstZ = null;

    // Spot first absolute position
    for (const cmd of commands) {
      if (cmd.x !== null) {
        firstX = cmd.x;
      }
      if (cmd.z !== null) {
        firstZ = cmd.z;
      }
      if (firstX !== null && firstZ !== null) break;
    }

    cx = firstX !== null ? firstX / 2 : 0;
    cz = firstZ !== null ? firstZ : 0;

    const plotList: SimulationPlotItem[] = [];
    const activeLineIndexes: number[] = [];
    let skipUntil_N: number | null = null;

    const renderStandardMove = (cmd: GCodeCommand, forceColor?: string, idOffset: number = 0) => {
      if (cmd.x !== null || cmd.z !== null) {
        const tx = cmd.x !== null ? cmd.x / 2 : cx;
        const tz = cmd.z !== null ? cmd.z : cz;
        const isSingle = (cmd.x !== null && cmd.z === null) || (cmd.z !== null && cmd.x === null);
        const hasModifiers = isSingle && (cmd.commaR !== null || cmd.commaC !== null);

        // Movement Color (G00 Rapid = Red, G01/G02/G03 Feed = Green)
        const moveColor = forceColor || (cmd.mode === 0 ? "#ff2a2a" : "#39ff14");

        if (hasModifiers) {
          const val = cmd.commaR !== null ? cmd.commaR : cmd.commaC;
          // Look ahead to blend with next movement within commands
          const nextIdx = commands.findIndex((c, idx) => idx > commands.indexOf(cmd) && (c.x !== null || c.z !== null));
          const nextCmd = nextIdx !== -1 ? commands[nextIdx] : undefined;
          
          if (nextCmd) {
            const nx = nextCmd.x !== null ? nextCmd.x / 2 : tx;
            const nz = nextCmd.z !== null ? nextCmd.z : tz;

            const dx1 = tx - cx;
            const dz1 = tz - cz;
            const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);

            const dx2 = nx - tx;
            const dz2 = nz - tz;
            const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

            if (len1 > 0 && len2 > 0 && val !== null) {
              const safeVal = Math.min(val, len1, len2);
              const p1x = tx - (dx1 / len1) * safeVal;
              const p1z = tz - (dz1 / len1) * safeVal;
              const p2x = tx + (dx2 / len2) * safeVal;
              const p2z = tz + (dz2 / len2) * safeVal;

              plotList.push({
                type: "line", x1: cx, z1: cz, x2: p1x, z2: p1z,
                color: moveColor, linhaId: cmd.linhaOriginal + idOffset,
              });

              if (cmd.commaR !== null) {
                plotList.push({
                  type: "arcTo", x1: p1x, z1: p1z, xc: tx, zc: tz, x2: p2x, z2: p2z,
                  radius: safeVal, color: "#00f3ff", linhaId: cmd.linhaOriginal + 0.5 + idOffset,
                });
              } else {
                plotList.push({
                  type: "line", x1: p1x, z1: p1z, x2: p2x, z2: p2z,
                  color: "#00f3ff", linhaId: cmd.linhaOriginal + 0.5 + idOffset,
                });
              }

              cx = p2x;
              cz = p2z;
              if (!activeLineIndexes.includes(cmd.linhaOriginal)) activeLineIndexes.push(cmd.linhaOriginal);
              return;
            }
          }
        }

        if (cmd.mode === 2 || cmd.mode === 3) {
          plotList.push({
            type: "arc", x1: cx, z1: cz, x2: tx, z2: tz, radius: cmd.r || 5, isG3: simInvertZ ? (cmd.mode === 2) : (cmd.mode === 3),
            color: forceColor || "#00f3ff", linhaId: cmd.linhaOriginal + idOffset,
          });
        } else {
          plotList.push({
            type: "line", x1: cx, z1: cz, x2: tx, z2: tz,
            color: moveColor, linhaId: cmd.linhaOriginal + idOffset,
          });
        }

        cx = tx;
        cz = tz;
        if (!activeLineIndexes.includes(cmd.linhaOriginal)) activeLineIndexes.push(cmd.linhaOriginal);
      }
    };

    // Second pass: trace toolpath segments
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];

      if (skipUntil_N !== null) {
        if (cmd.n === skipUntil_N) {
          skipUntil_N = null;
        }
        continue;
      }

      // G70 FINISHING CYCLE
      if (cmd.mode === 70 && cmd.p !== null && cmd.q !== null) {
        const pIdx = commands.findIndex((c) => c.n === cmd.p);
        const qIdx = commands.findIndex((c) => c.n === cmd.q);
        if (pIdx !== -1 && qIdx !== -1 && qIdx >= pIdx) {
          const startX = cx;
          const startZ = cz;
          
          // Rapid to start of profile
          const firstProfileCmd = commands[pIdx];
          const profStartX = firstProfileCmd.x !== null ? firstProfileCmd.x / 2 : cx;
          const profStartZ = firstProfileCmd.z !== null ? firstProfileCmd.z : cz;
          
          plotList.push({
            type: "line", x1: cx, z1: cz, x2: profStartX, z2: profStartZ,
            color: "#ff2a2a", linhaId: cmd.linhaOriginal + 0.001,
          });
          cx = profStartX;
          cz = profStartZ;

          // Trace profile
          for (let k = pIdx; k <= qIdx; k++) {
            const profileCmd = { ...commands[k], linhaOriginal: cmd.linhaOriginal };
            renderStandardMove(profileCmd, "#39ff14", 0.01 * (k - pIdx));
          }

          // Return to start position of G70
          plotList.push({
            type: "line", x1: cx, z1: cz, x2: startX, z2: startZ,
            color: "#ff2a2a", linhaId: cmd.linhaOriginal + 0.99,
          });
          cx = startX;
          cz = startZ;
        }
        if (!activeLineIndexes.includes(cmd.linhaOriginal)) activeLineIndexes.push(cmd.linhaOriginal);
        continue;
      }

      // G71 ROUGHING CYCLE DECODING
      if (cmd.mode === 71) {
        if (cmd.u !== null && cmd.r !== null && cmd.p === null) {
          lastG71_Line1 = { u: cmd.u, r: Math.abs(cmd.r), lineIndex: cmd.linhaOriginal };
          continue;
        }

        if (cmd.p !== null && cmd.q !== null && lastG71_Line1) {
          const pBlock = cmd.p;
          const qBlock = cmd.q;
          const depthU = lastG71_Line1.u;
          const retractR = lastG71_Line1.r;
          const allowanceU = cmd.u !== null ? cmd.u : 0;
          const allowanceW = cmd.w !== null ? cmd.w : 0;

          // Locate contour lines
          const pIdx = commands.findIndex((c) => c.n === pBlock);
          const qIdx = commands.findIndex((c) => c.n === qBlock);

          if (pIdx !== -1 && qIdx !== -1 && qIdx > pIdx) {
            const profilePoints: Point2D[] = [];
            let px = cx;
            let pz = cz;

            // Reconstruct the raw programmed profile
            for (let k = pIdx; k <= qIdx; k++) {
              const contCmd = commands[k];
              const targetX = contCmd.x !== null ? contCmd.x / 2 : px;
              const targetZ = contCmd.z !== null ? contCmd.z : pz;
              profilePoints.push({ x: targetX, y: targetZ });
              px = targetX;
              pz = targetZ;
            }

            // Generate cyan roughing slices
            const startX = cx; // Raw stock diameter
            const startZ = cz;
            const endZ = profilePoints[profilePoints.length - 1].y;
            const isInternal = depthU < 0 || allowanceU < 0; // Bore vs Turn
            const absDepth = Math.abs(depthU);

            let passX = isInternal ? startX + absDepth : startX - absDepth;
            const limitX = isInternal 
              ? Math.max(...profilePoints.map((pt) => pt.x)) 
              : Math.min(...profilePoints.map((pt) => pt.x));

            let passCount = 1;

            const isBetween = (val: number, a: number, b: number) => 
              val >= Math.min(a, b) - 0.001 && val <= Math.max(a, b) + 0.001;

            const getProfileIntersectionZ = (targetX: number): number | null => {
              // Traverse backwards to find the profile coordinate at targetX
              for (let k = profilePoints.length - 1; k > 0; k--) {
                const p1 = profilePoints[k - 1];
                const p2 = profilePoints[k];
                if (isBetween(targetX, p1.x, p2.x)) {
                  if (Math.abs(p1.x - p2.x) < 0.001) return p2.y;
                  const factor = (targetX - p1.x) / (p2.x - p1.x);
                  return p1.y + factor * (p2.y - p1.y);
                }
              }
              return null;
            };

            while ((!isInternal && passX >= limitX) || (isInternal && passX <= limitX)) {
              if (absDepth <= 0.0001) break; // SAFETY
              if (passCount > 1000) break; // SAFETY
              // Find Z boundary for this depth pass
              const intersectionZ = getProfileIntersectionZ(passX + (isInternal ? -allowanceU / 2 : allowanceU / 2));
              const zLimit = intersectionZ !== null ? intersectionZ + allowanceW : endZ;

              // Step ID
              const stepId = cmd.linhaOriginal + passCount * 0.001;

              // Draw cut pass (cyan)
              plotList.push({
                type: "line",
                x1: isInternal ? passX - absDepth : passX + absDepth,
                z1: startZ,
                x2: passX,
                z2: startZ,
                color: "#00f3ff",
                linhaId: stepId,
              });

              plotList.push({
                type: "line",
                x1: passX,
                z1: startZ,
                x2: passX,
                z2: zLimit,
                color: "#00f3ff",
                linhaId: stepId + 0.0002,
              });

              // Draw diagonal retract
              plotList.push({
                type: "line",
                x1: passX,
                z1: zLimit,
                x2: isInternal ? passX - retractR : passX + retractR,
                z2: zLimit + retractR,
                color: "#00f3ff",
                linhaId: stepId + 0.0004,
              });

              if (!activeLineIndexes.includes(cmd.linhaOriginal)) {
                activeLineIndexes.push(cmd.linhaOriginal);
              }

              passX = isInternal ? passX + absDepth : passX - absDepth;
              passCount++;
            }
            
            // Skip the profile blocks in main execution
            skipUntil_N = qBlock;
          }
          lastG71_Line1 = null;
        }
        continue;
      }

      // G74 CYCLE (FURAÇÃO/CANAL FACIAL COM QUEBRA DE CAVACO) DECODING
      if (cmd.mode === 74) {
        if (cmd.r !== null && cmd.x === null && cmd.z === null) {
          lastG74_Line1 = { r: Math.abs(cmd.r), lineIndex: cmd.linhaOriginal };
          if (!activeLineIndexes.includes(cmd.linhaOriginal)) {
            activeLineIndexes.push(cmd.linhaOriginal);
          }
          continue;
        }

        if (cmd.x !== null || cmd.z !== null) {
          const targetX = cmd.x !== null ? cmd.x / 2 : cx;
          const targetZ = cmd.z !== null ? cmd.z : cz;
          const peckIncZ = cmd.q ? cmd.q / 1000 : 9999; // Microns to mm (peck in Z)
          const stepX = cmd.p ? cmd.p / 1000 : 0; // Microns to mm (step in X)

          let retractR = 1.0; // Default retract/relief in Z
          if (lastG74_Line1) {
            retractR = lastG74_Line1.r;
          } else if (cmd.r !== null) {
            retractR = Math.abs(cmd.r);
          }

          const originalX = cx;
          const originalZ = cz;

          let currentX = cx;
          const shiftXDir = targetX < cx ? -1 : 1;
          let passCount = 1;

          while (true) {
            if (passCount > 1000) break; // SAFETY
            let currentZ = originalZ;
            const plungeZDir = targetZ < originalZ ? -1 : 1;
            let peckCount = 0;

            // If we are on a subsequent pass in X, rapid move to the new X
            if (passCount > 1) {
              plotList.push({
                type: "line",
                x1: currentX - shiftXDir * stepX,
                z1: originalZ,
                x2: currentX,
                z2: originalZ,
                color: "#ff2a2a",
                linhaId: cmd.linhaOriginal + passCount * 0.01,
              });
            }

            // Pecking inside Z
            while ((plungeZDir < 0 && currentZ > targetZ) || (plungeZDir > 0 && currentZ < targetZ)) {
              if (peckCount > 2000) break; // SAFETY
              const nextZ = plungeZDir < 0
                ? Math.max(currentZ - peckIncZ, targetZ)
                : Math.min(currentZ + peckIncZ, targetZ);
              const stepId = cmd.linhaOriginal + passCount * 0.01 + peckCount * 0.0001;

              // Plunge Cut (solid green for active feed)
              plotList.push({
                type: "line",
                x1: currentX,
                z1: currentZ,
                x2: currentX,
                z2: nextZ,
                color: "#39ff14",
                linhaId: stepId,
              });

              currentZ = nextZ;

              // Micro-retract/relief in Z if we haven't reached targetZ yet
              if ((plungeZDir < 0 && currentZ > targetZ) || (plungeZDir > 0 && currentZ < targetZ)) {
                // Respect the R retract value!
                const reliefZ = currentZ + (plungeZDir < 0 ? retractR : -retractR);
                
                // Draw retract in Z (rapid red)
                plotList.push({
                  type: "line",
                  x1: currentX,
                  z1: currentZ,
                  x2: currentX,
                  z2: reliefZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00003,
                });

                // Draw return to depth (rapid red)
                plotList.push({
                  type: "line",
                  x1: currentX,
                  z1: reliefZ,
                  x2: currentX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00006,
                });
              }
              peckCount++;
            }

            // When it finishes at targetZ, it retracts at 45 degrees according to R
            const reliefZ = targetZ + (plungeZDir < 0 ? retractR : -retractR);
            const reliefX = stepX > 0 ? currentX - shiftXDir * retractR : currentX;

            // Retract at 45 degrees
            plotList.push({
              type: "line",
              x1: currentX,
              z1: targetZ,
              x2: reliefX,
              z2: reliefZ,
              color: "#ff2a2a",
              linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.007,
            });

            // Then return back to originalZ (rapid traverse)
            plotList.push({
              type: "line",
              x1: reliefX,
              z1: reliefZ,
              x2: reliefX,
              z2: originalZ,
              color: "#ff2a2a",
              linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.008,
            });

            // If no X stepover is needed or we reached/passed targetX, we finish
            if (stepX === 0 || Math.abs(currentX - targetX) < 0.001) break;

            // Next X
            const nextX = shiftXDir < 0
              ? Math.max(currentX - stepX, targetX)
              : Math.min(currentX + stepX, targetX);
            
            if (Math.abs(currentX - nextX) < 0.001) break;
            currentX = nextX;
            passCount++;
          }

          // Return tool to original start coordinate (cx, cz)
          plotList.push({
            type: "line",
            x1: currentX,
            z1: originalZ,
            x2: originalX,
            z2: originalZ,
            color: "#ff2a2a",
            linhaId: cmd.linhaOriginal + 0.99,
          });

          cx = originalX;
          cz = originalZ;
          if (!activeLineIndexes.includes(cmd.linhaOriginal)) {
            activeLineIndexes.push(cmd.linhaOriginal);
          }
          lastG74_Line1 = null;
        }
        continue;
      }

      // G75 CYCLE (CANALETAS) DECODING
      if (cmd.mode === 75) {
        if (cmd.x !== null || cmd.z !== null) {
          const targetX = cmd.x !== null ? cmd.x / 2 : cx;
          const targetZ = cmd.z !== null ? cmd.z : cz;
          const peckInc = cmd.p ? cmd.p / 1000 : 999; // Microns to mm
          const stepZ = cmd.q ? cmd.q / 1000 : 0;

          let retractR = 1; // Default retract
          const prevCmd = commands[i - 1];
          const isSingleLineG75 = !(prevCmd && prevCmd.mode === 75 && prevCmd.r !== null && prevCmd.x === null && prevCmd.z === null);
          if (!isSingleLineG75 && prevCmd) {
             retractR = prevCmd.r !== null ? prevCmd.r : 1;
          } else if (cmd.r !== null) {
             retractR = cmd.r;
          }

          const originalX = cx;
          const originalZ = cz;

          // Draw the canal plunge passes
          let currentZ = cz;
          let passCount = 1;

          while (true) {
            if (passCount > 1000) break; // SAFETY
            let currentX = originalX;
            const plungeXDir = targetX < originalX ? -1 : 1;
            let peckCount = 0;

            if (passCount > 1) {
                plotList.push({
                    type: "line",
                    x1: originalX,
                    z1: currentZ + stepZ,
                    x2: originalX,
                    z2: currentZ,
                    color: "#ff2a2a",
                    linhaId: cmd.linhaOriginal + passCount * 0.01,
                });
            }

            while ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
              if (peckCount > 2000) break; // SAFETY
              const nextX = plungeXDir < 0 
                ? Math.max(currentX - peckInc, targetX) 
                : Math.min(currentX + peckInc, targetX);
              const stepId = cmd.linhaOriginal + passCount * 0.01 + peckCount * 0.0001;

              // Plunge Cut (solid green for active feed)
              plotList.push({
                type: "line",
                x1: currentX,
                z1: currentZ,
                x2: nextX,
                z2: currentZ,
                color: "#39ff14",
                linhaId: stepId,
              });

              currentX = nextX;

              // Micro-retract
              if ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
                if (isSingleLineG75) {
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ,
                      x2: currentX,
                      z2: currentZ + Math.abs(retractR),
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00002,
                    });
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ + Math.abs(retractR),
                      x2: originalX,
                      z2: currentZ + Math.abs(retractR),
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00004,
                    });
                    plotList.push({
                      type: "line",
                      x1: originalX,
                      z1: currentZ + Math.abs(retractR),
                      x2: originalX,
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00006,
                    });
                    plotList.push({
                      type: "line",
                      x1: originalX,
                      z1: currentZ,
                      x2: currentX,
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00008,
                    });
                } else {
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ,
                      x2: currentX + (plungeXDir < 0 ? retractR : -retractR),
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00005,
                    });
                    currentX += (plungeXDir < 0 ? retractR : -retractR);
                }
              }
              peckCount++;
            }

            // Return plunge tool to outer clearance
            if (isSingleLineG75) {
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ,
                  x2: targetX,
                  z2: currentZ + Math.abs(retractR),
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.008,
                });
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ + Math.abs(retractR),
                  x2: originalX,
                  z2: currentZ + Math.abs(retractR),
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.009,
                });
                plotList.push({
                  type: "line",
                  x1: originalX,
                  z1: currentZ + Math.abs(retractR),
                  x2: originalX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.010,
                });
            } else {
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ,
                  x2: originalX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.009,
                });
            }

            if (stepZ === 0 || currentZ === targetZ) break;
            currentZ = Math.max(currentZ - stepZ, targetZ);
            passCount++;
          }

          plotList.push({
             type: "line",
             x1: originalX,
             z1: currentZ,
             x2: originalX,
             z2: originalZ,
             color: "#ff2a2a",
             linhaId: cmd.linhaOriginal + 0.99
          });

          cx = originalX;
          cz = originalZ;
          if (!activeLineIndexes.includes(cmd.linhaOriginal)) {
            activeLineIndexes.push(cmd.linhaOriginal);
          }
        }
        continue;
      }

      // G76 CYCLE (ROSCA MULTIPLA) DECODING
      if (cmd.mode === 76) {
        if (cmd.x !== null && cmd.z !== null) {
          const minorDia = cmd.x;
          const threadLen = cmd.z;
          const pitch = cmd.f || 1.5;

          const threadHeight = cmd.p ? cmd.p / 1000 : pitch * 0.65;
          const isInternal = cx < minorDia / 2;
          const rootRadius = minorDia / 2; 
          const crestRadius = isInternal ? rootRadius - threadHeight : rootRadius + threadHeight;
          
          const startZ = cz;
          const endZ = threadLen;

          const passesCount = 5; // Simplified visualization passes
          const depthPerPass = threadHeight / passesCount;
          const stepId = cmd.linhaOriginal;

          for (let p = 1; p <= passesCount; p++) {
            const passRadius = isInternal ? crestRadius + (p * depthPerPass) : crestRadius - (p * depthPerPass);
            const passId = stepId + p * 0.01;

            // Rapid to pass radius
            plotList.push({
              type: "line", x1: cx, z1: startZ, x2: passRadius, z2: startZ,
              color: "#ff2a2a", linhaId: passId,
            });

            // Thread feed pass
            plotList.push({
              type: "line", x1: passRadius, z1: startZ, x2: passRadius, z2: endZ,
              color: "#ff8c00", linhaId: passId + 0.005,
            });

            // Diagonal/Rapid retract to clearance
            plotList.push({
              type: "line", x1: passRadius, z1: endZ, x2: cx, z2: endZ,
              color: "#ff2a2a", linhaId: passId + 0.008,
            });

            // Rapid return to startZ
            plotList.push({
              type: "line", x1: cx, z1: endZ, x2: cx, z2: startZ,
              color: "#ff2a2a", linhaId: passId + 0.009,
            });
          }

          cz = startZ;
          if (!activeLineIndexes.includes(cmd.linhaOriginal)) {
            activeLineIndexes.push(cmd.linhaOriginal);
          }
        }
        continue;
      }

      // STANDARD G00/G01/G02/G03 LINEAR & CIRCULAR ACTIONS
      renderStandardMove(cmd);
    }

    return { plotList, activeLineIndexes };
  } catch (err: any) {
      console.warn("GCode Parser Error: ", err);
      return { plotList: [], activeLineIndexes: [], error: "Erro ao compilar o ciclo atual. Continue digitando." };
    }
  };

  const { plotList, activeLineIndexes, error: parseError } = parseGCode();

  useEffect(() => {
    if (onError && parseError) {
      onError(parseError);
    }
  }, [parseError, onError]);

  // Draw simulation loop
  const drawSimulation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic scale and coordinates
    const zDirSign = simInvertZ ? -1 : 1; // Z moves left (-) or right (+)
    const originX = canvas.width / 2 + 50 + panX;
    const originY = canvas.height / 2 + 50 + panY;

    // Draw Axes (X+ pointing up, Z+/Z- horizontal)
    ctx.strokeStyle = isThemeDark ? "#2a2a35" : "#e0e0ea";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(canvas.width, originY);
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, canvas.height);
    ctx.stroke();

    // Draw grid marks
    ctx.fillStyle = isThemeDark ? "#555" : "#aaa";
    ctx.font = "9px monospace";
    ctx.fillText("X+ (Diâmetro)", originX + 10, 15);
    ctx.fillText(simInvertZ ? "Z- (Cabeçote)" : "Z+ (Eixo)", canvas.width - 85, originY - 8);

    // Draw Workpiece Stock Outline Representation (Simple raw metal silhouette block)
    ctx.fillStyle = isThemeDark ? "rgba(40, 40, 50, 0.25)" : "rgba(220, 220, 230, 0.5)";
    ctx.beginPath();
    // Assuming standard stock: length 120, outer diameter 100 (radius 50)
    const stockLength = 100 * zoom;
    const stockRadius = 50 * zoom;
    ctx.rect(originX - stockLength * (simInvertZ ? -1 : 1), originY - stockRadius, stockLength * (simInvertZ ? -1 : 1), stockRadius * 2);
    ctx.fill();

    // Workpiece Chuck Jaws (Castanha do Torno)
    ctx.fillStyle = isThemeDark ? "#202026" : "#ccd";
    ctx.strokeStyle = isThemeDark ? "#3f3f4f" : "#99a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const chuckX = originX - stockLength * (simInvertZ ? -1 : 1);
    ctx.rect(chuckX - 20 * (simInvertZ ? -1 : 1), originY - stockRadius - 15, 20 * (simInvertZ ? -1 : 1), 15);
    ctx.rect(chuckX - 20 * (simInvertZ ? -1 : 1), originY + stockRadius, 20 * (simInvertZ ? -1 : 1), 15);
    ctx.fill();
    ctx.stroke();

    // Helper: draw arc curves on canvas
    const drawArcCurve = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      radius: number,
      isG3: boolean
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2 * radius || dist === 0) {
        ctx.lineTo(x2, y2);
        return;
      }
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const h = Math.sqrt(radius * radius - (dist / 2) * (dist / 2));
      const nx = -dy / dist;
      const ny = dx / dist;

      // Center coords of the circle
      const cx = isG3 ? mx - h * nx : mx + h * nx;
      const cy = isG3 ? my - h * ny : my + h * ny;

      ctx.arc(
        cx,
        cy,
        radius,
        Math.atan2(y1 - cy, x1 - cx),
        Math.atan2(y2 - cy, x2 - cx),
        isG3
      );
    };

    // Plot G-code paths
    let currentAnimationX = plotList.length > 0 ? plotList[0].x1 : 0;
    let currentAnimationZ = plotList.length > 0 ? plotList[0].z1 : 0;

    plotList.forEach((item) => {
      // If the user just typed and simulation is waiting for Play, don't draw
      if (driverTick === -2) {
        return;
      }

      // If we are executing step by step (even paused), filter future strokes
      if (driverTick !== -1 && item.linhaId > driverTick) {
        return;
      }

      // Convert lathe model coordinates to Canvas pixels
      const startPlotX = originX + item.z1 * zoom * zDirSign;
      const startPlotY = originY - item.x1 * zoom;
      const endPlotX = originX + item.z2 * zoom * zDirSign;
      const endPlotY = originY - item.x2 * zoom;

      // Track last tool point for crosshair
      if (item.linhaId <= driverTick || driverTick === -1) {
        currentAnimationX = item.x2;
        currentAnimationZ = item.z2;
      }

      ctx.beginPath();
      
      // Normalize neon colors to professional, eye-friendly engineering colors
      let drawColor = item.color;
      if (item.color === "#ff2a2a") {
        drawColor = "#ef4444"; // Clean, high-contrast Red for Rapid G00 positioning
      } else if (item.color === "#39ff14") {
        drawColor = "#22c55e"; // Professional Green for G01/Feed cutting paths
      } else if (item.color === "#00f3ff") {
        drawColor = "#0ea5e9"; // Eye-safe Sky Blue for Arcs/Helper indicators
      } else if (item.color === "#ff8c00") {
        drawColor = "#f59e0b"; // Standard Amber/Orange for threading passes
      }
      
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = Math.floor(item.linhaId) === Math.floor(activeLine) ? 3.5 : 2;

      // Keep shadow blur disabled for professional, razor-sharp vector lines
      ctx.shadowBlur = 0;

      if (item.type === "line" || item.type === "thread") {
        ctx.moveTo(startPlotX, startPlotY);
        ctx.lineTo(endPlotX, endPlotY);
        ctx.stroke();
      } else if (item.type === "arc") {
        ctx.moveTo(startPlotX, startPlotY);
        if (item.radius && item.radius > 0) {
          drawArcCurve(
            startPlotX,
            startPlotY,
            endPlotX,
            endPlotY,
            item.radius * zoom,
            item.isG3 || false
          );
        } else {
          ctx.lineTo(endPlotX, endPlotY);
        }
        ctx.stroke();
      } else if (item.type === "arcTo") {
        ctx.moveTo(startPlotX, startPlotY);
        if (item.xc !== undefined && item.zc !== undefined && item.radius) {
          const cornerPlotX = originX + item.zc * zoom * zDirSign;
          const cornerPlotY = originY - item.xc * zoom;
          ctx.arcTo(cornerPlotX, cornerPlotY, endPlotX, endPlotY, item.radius * zoom);
        }
        ctx.stroke();
      }
    });

    // Reset shadow blur
    ctx.shadowBlur = 0;

    if (driverTick !== -2) {
      // Draw the yellow target tool point (Virtual cutting insert)
      const activeToolX = originX + currentAnimationZ * zoom * zDirSign;
      const activeToolY = originY - currentAnimationX * zoom;

      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Crosshair target
      ctx.moveTo(activeToolX - 8, activeToolY);
      ctx.lineTo(activeToolX + 8, activeToolY);
      ctx.moveTo(activeToolX, activeToolY - 8);
      ctx.lineTo(activeToolX, activeToolY + 8);
      ctx.stroke();

      // Draw small cutting tip triangle
      ctx.fillStyle = "rgba(255, 235, 59, 0.4)";
      ctx.beginPath();
      ctx.moveTo(activeToolX, activeToolY);
      ctx.lineTo(activeToolX - 6 * zDirSign, activeToolY - 12);
      ctx.lineTo(activeToolX - 12 * zDirSign, activeToolY - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Draw Hover/Snap Target ("Mirinha")
    if (hoveredPoint) {
      ctx.save();
      ctx.strokeStyle = isThemeDark ? "rgba(0, 243, 255, 0.4)" : "rgba(0, 150, 200, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Horizontal line back to Z-axis
      ctx.beginPath();
      ctx.moveTo(hoveredPoint.canvasX, hoveredPoint.canvasY);
      ctx.lineTo(originX, hoveredPoint.canvasY);
      ctx.stroke();

      // Vertical line back to X-axis
      ctx.beginPath();
      ctx.moveTo(hoveredPoint.canvasX, hoveredPoint.canvasY);
      ctx.lineTo(hoveredPoint.canvasX, originY);
      ctx.stroke();

      // Draw the reticle circle
      ctx.setLineDash([]);
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hoveredPoint.canvasX, hoveredPoint.canvasY, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs inside reticle
      ctx.beginPath();
      ctx.moveTo(hoveredPoint.canvasX - 12, hoveredPoint.canvasY);
      ctx.lineTo(hoveredPoint.canvasX + 12, hoveredPoint.canvasY);
      ctx.moveTo(hoveredPoint.canvasX, hoveredPoint.canvasY - 12);
      ctx.lineTo(hoveredPoint.canvasX, hoveredPoint.canvasY + 12);
      ctx.stroke();

      // A small glowing center dot
      ctx.fillStyle = "#39ff14";
      ctx.beginPath();
      ctx.arc(hoveredPoint.canvasX, hoveredPoint.canvasY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Save actual lathe coordinates in state for HUD
    // Use setTimeout to avoid state updates during render or ResizeObserver layout callbacks
    const newX = currentAnimationX * 2;
    const newZ = currentAnimationZ;
    setTimeout(() => {
      setToolPos({ x: newX, y: newZ });
    }, 0);
  };

  // Resize listener using ResizeObserver to handle container-specific resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const observer = new ResizeObserver(() => {
      canvas.width = canvas.parentElement?.clientWidth || 500;
      canvas.height = canvas.parentElement?.clientHeight || 450;
      drawSimulation();
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [gcodeText, zoom, panX, panY, simInvertZ, driverTick, activeLine, isThemeDark, hoveredPoint]);

  // Click on Canvas toolpath to highlight editor line
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredPoint) {
      onLineChange(hoveredPoint.gcodeLine);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zDirSign = simInvertZ ? -1 : 1;
    const originX = canvas.width / 2 + 50 + panX;
    const originY = canvas.height / 2 + 50 + panY;

    let closestLineId = -1;
    let minDistance = 15; // Max snapping pixels

    plotList.forEach((item) => {
      const endPlotX = originX + item.z2 * zoom * zDirSign;
      const endPlotY = originY - item.x2 * zoom;

      const dist = Math.hypot(mouseX - endPlotX, mouseY - endPlotY);
      if (dist < minDistance) {
        minDistance = dist;
        closestLineId = Math.floor(item.linhaId);
      }
    });

    if (closestLineId !== -1) {
      onLineChange(closestLineId);
    }
  };

  // Collect lines that actually produce drawing movements for single block stepping
  useEffect(() => {
    const linesWithContent: number[] = [];
    plotList.forEach((item) => {
      if (!linesWithContent.includes(item.linhaId)) {
        linesWithContent.push(item.linhaId);
      }
    });
    linesWithContent.sort((a, b) => a - b);
    setLinesWithDrawing(linesWithContent);
  }, [gcodeText]);

  // Reset and clear simulation on code change
  useEffect(() => {
    setIsDriverActive(false);
    setDriverTick(-1);
  }, [gcodeText, setIsDriverActive]);

  // Playback Driver Clock Timer
  useEffect(() => {
    if (!isDriverActive) return;

    const delay = Math.max(50, (100 - driverSpeed) * 15);
    const interval = setInterval(() => {
      if (linesWithDrawing.length === 0) {
        setIsDriverActive(false);
        return;
      }

      setDriverTick((currentTick) => {
        let currentIdx = linesWithDrawing.findIndex((l) => l > currentTick);
        if (currentIdx === -1) {
          return -1;
        }
        return linesWithDrawing[currentIdx];
      });
    }, delay);

    return () => clearInterval(interval);
  }, [isDriverActive, driverSpeed, linesWithDrawing]);

  // Synchronize active line on driver clock tick safely outside state updater to avoid rendering conflicts
  useEffect(() => {
    if (isDriverActive && driverTick !== -1) {
      onLineChange(driverTick);
    }
  }, [driverTick, isDriverActive, onLineChange]);

  // Synchronize driverTick when activeLine changes externally (e.g. user clicked editor)
  useEffect(() => {
    if (!isDriverActive && activeLine >= 0 && Math.floor(activeLine) !== Math.floor(driverTick)) {
       // Find the closest line in linesWithDrawing
       const match = linesWithDrawing.find(l => Math.floor(l) === Math.floor(activeLine));
       if (match !== undefined) {
          setDriverTick(match);
       } else {
          setDriverTick(activeLine);
       }
    }
  }, [activeLine, isDriverActive, linesWithDrawing]);

  // Turn off driver when execution finishes
  useEffect(() => {
    if (isDriverActive && driverTick === -1 && linesWithDrawing.length > 0) {
      setIsDriverActive(false);
    }
  }, [driverTick, isDriverActive, linesWithDrawing, setIsDriverActive]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (isDriverActive) {
      setIsDriverActive(false);
    } else {
      setIsDriverActive(true);
      // Start from cursor or beginning
      if (driverTick < 0 || driverTick >= linesWithDrawing[linesWithDrawing.length - 1]) {
        const startLine = linesWithDrawing.includes(activeLine) ? activeLine : linesWithDrawing[0] || 0;
        setDriverTick(startLine);
        onLineChange(startLine);
      }
    }
  };

  const handleStop = () => {
    setIsDriverActive(false);
    setDriverTick(-1);
    onLineChange(0);
  };

  const handleStepForward = () => {
    setIsDriverActive(false);
    if (linesWithDrawing.length === 0) return;

    let nextIdx = linesWithDrawing.findIndex((l) => l > driverTick);
    if (nextIdx === -1) {
      nextIdx = 0;
    }
    const targetLine = linesWithDrawing[nextIdx];
    setDriverTick(targetLine);
    onLineChange(targetLine);
  };

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden border transition-colors duration-300 ${
        isHighContrast 
          ? "bg-white border-black text-black"
          : isThemeDark 
            ? "bg-[#14141a] border-zinc-800 text-zinc-100" 
            : "bg-zinc-50 border-zinc-200 text-zinc-800"
      }`}
    >
      {/* Title Bar */}
      <div className={`flex justify-between items-center px-4 py-2 border-b transition-colors duration-300 ${
        isHighContrast ? "bg-zinc-200 border-black" : isThemeDark ? "bg-[#1e1e24] border-zinc-800" : "bg-zinc-100 border-zinc-200"
      }`}>
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" />
          <h3 className="font-display font-medium text-xs tracking-wider uppercase">
            Simulador Gráfico 2D
          </h3>
        </div>
        <div className="flex gap-2 items-center">
          {/* Theme switcher */}
          <button
            onClick={() => setIsThemeDark(!isThemeDark)}
            className={`p-1.5 rounded transition ${
              isThemeDark ? "text-yellow-400 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {isThemeDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Coordinate system inversion (Swiss Mode) */}
          <button
            onClick={onToggleZInvert}
            className={`px-2 py-1 text-[10px] font-bold rounded border uppercase flex items-center gap-1 transition ${
              simInvertZ
                ? "bg-cyan-950/40 text-cyan-400 border-cyan-400/50"
                : "bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
            title="Inverter eixo Z para usinagem em Torno Suíço / Cabeçote Móvel"
          >
            Sincro Z {simInvertZ ? "Suíço" : "Padrão"}
          </button>
          
          <button
            onClick={() => {
              setZoom(z => Math.min(300, z * 1.25));
            }}
            className="text-[12px] font-bold border border-zinc-700 hover:border-zinc-400 hover:bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"
            title="Mais Zoom"
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(z => Math.max(0.2, z / 1.25));
            }}
            className="text-[12px] font-bold border border-zinc-700 hover:border-zinc-400 hover:bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"
            title="Menos Zoom"
          >
            -
          </button>
          <button
            onClick={handleResetView}
            className="text-[10px] font-semibold border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded text-zinc-400"
          >
            Enquadrar
          </button>
        </div>
      </div>

      {/* Actual Graphics Canvas */}
      <div className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none">
        {parseError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/80 border border-red-500/50 text-red-400 px-4 py-2 rounded shadow-lg text-xs pointer-events-none z-20 flex items-center gap-2">
             <AlertTriangle size={14} />
             {parseError}
          </div>
        )}
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setHoveredPoint(null)}
          onClick={handleCanvasClick}
          className="w-full h-full block"
        />

        {/* Precise Snapping Target Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-[#111116]/95 border border-cyan-400 rounded-lg p-2.5 font-mono text-[11px] shadow-2xl z-30 select-none max-w-[260px] transition-all duration-75 flex flex-col gap-1 text-left"
            style={{
              left: `${hoveredPoint.canvasX + 15}px`,
              top: `${hoveredPoint.canvasY + 15}px`,
              transform: hoveredPoint.canvasX + 280 > (canvasRef.current?.width || 0) ? 'translateX(-115%)' : '',
            }}
          >
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1 text-zinc-500 font-bold text-[9px] tracking-wider">
              <span>LINHA {hoveredPoint.gcodeLine + 1}</span>
              <span className="text-cyan-400">MIRINHA</span>
            </div>
            <div className="text-zinc-200 font-sans font-bold py-0.5 truncate max-w-[230px]">
              {hoveredPoint.gcodeText}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] mt-1 border-t border-zinc-800/50 pt-1 text-zinc-400">
              <div>X: <span className="text-[#39ff14] font-bold">Ø {hoveredPoint.latheX.toFixed(3)}</span></div>
              <div>Z: <span className="text-orange-400 font-bold">{hoveredPoint.latheZ.toFixed(3)}</span></div>
            </div>
          </div>
        )}

        {/* Real-time coordinates HUD overlays */}
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 flex flex-col gap-0.5">
          <div className="flex justify-between gap-4">
            <span>DIÂMETRO X:</span>
            <span className="text-[#39ff14] font-bold">Ø {toolPos.x.toFixed(3)} mm</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>POSIÇÃO Z:</span>
            <span className="text-orange-400 font-bold">Z {toolPos.y.toFixed(3)} mm</span>
          </div>
        </div>

        {/* Helper overlay displaying interactive tip */}
        <div className="absolute top-3 right-3 bg-black/80 border border-zinc-800 rounded px-2.5 py-1 text-[10px] text-zinc-500 font-mono hidden sm:block">
          💡 Botão central + arrastar para mover | Scroll para Zoom
        </div>
      </div>

      {/* CNC Driver Controls panel */}
      <div className={`py-1.5 px-3 border-t flex items-center justify-between gap-3 transition-colors duration-300 ${
        isThemeDark ? "bg-[#101014] border-zinc-900" : "bg-zinc-100 border-zinc-200"
      }`}>
        {/* Playback Buttons */}
        <div className="flex gap-1.5">
          <button
            onClick={togglePlay}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition border ${
              isDriverActive
                ? "bg-amber-950/20 text-amber-400 border-amber-500/30"
                : "bg-[#1e1e24] hover:bg-zinc-800 text-[#39ff14] border-zinc-850 hover:border-[#39ff14]"
            }`}
            title="Executar Simulação Automática"
          >
            {isDriverActive ? <Pause className="w-3.5 h-3.5 fill-amber-400" /> : <Play className="w-3.5 h-3.5 fill-[#39ff14]" />}
          </button>
          
          <button
            onClick={handleStop}
            className="w-7 h-7 bg-[#1e1e24] hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-md flex items-center justify-center transition"
            title="Parar e Retornar ao Início"
          >
            <Square className="w-3 h-3 fill-zinc-400" />
          </button>

          <button
            onClick={handleStepForward}
            className="w-7 h-7 bg-[#1e1e24] hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-md flex items-center justify-center transition"
            title="Executar Bloco a Bloco (Single Block)"
          >
            <SkipForward className="w-3 h-3" />
          </button>
        </div>

        {/* Playback speed dial */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 tracking-tight">POTENCIÔMETRO:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={driverSpeed}
            onChange={(e) => setDriverSpeed(parseInt(e.target.value, 10))}
            className="w-20 md:w-28 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#00f3ff]"
          />
          <span className="text-[10px] font-mono font-bold text-[#00f3ff] w-8 text-right">
            {driverSpeed}%
          </span>
        </div>
      </div>
    </div>
  );
};
