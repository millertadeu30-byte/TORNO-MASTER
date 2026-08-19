import React, { Component, useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  RotateCcw,
  Box,
  Eye,
  EyeOff,
  Grid,
  Maximize2,
  Minimize2,
  X,
  Compass,
  Activity,
  Gauge,
  Ruler,
  Snowflake,
  Sun,
  Moon,
  Target,
} from "lucide-react";

interface CNCSimulator3DProps {
  gcodeText: string;
  activeLine: number;
  onLineChange: (lineIdx: number) => void;
  isHighContrast?: boolean;
  onClose?: () => void;
}

interface Point3D {
  x: number; // Diameter/Radius X
  y: number; // Y axis height
  z: number; // Z axis length
  c: number; // C axis rotary angle in degrees
  line: number;
  isRapid: boolean;
  rawText: string;
}

const CNCSimulator3DContent: React.FC<CNCSimulator3DProps> = ({
  gcodeText,
  activeLine,
  onLineChange,
  isHighContrast = false,
  onClose,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // 3D Objects references
  const cAxisGroupRef = useRef<THREE.Group | null>(null);
  const xAxisRef = useRef<THREE.Line | null>(null);
  const yAxisRef = useRef<THREE.Line | null>(null);
  const zAxisRef = useRef<THREE.Line | null>(null);
  const cRingRef = useRef<THREE.Line | null>(null);
  const toolGroupRef = useRef<THREE.Group | null>(null);
  const toolProjectionsGroupRef = useRef<THREE.Group | null>(null);
  const pathLinesGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Simulation State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [simSpeed, setSimSpeed] = useState<number>(70); // %
  const [cameraView, setCameraView] = useState<"iso" | "front" | "side" | "top">("iso");
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(!isHighContrast);

  // Visibility Controls for Clean Screen (Eixos X, Y, Z, C, Grade & Mirinha)
  const [showAxisX, setShowAxisX] = useState<boolean>(true);
  const [showAxisY, setShowAxisY] = useState<boolean>(true);
  const [showAxisZ, setShowAxisZ] = useState<boolean>(true);
  const [showAxisC, setShowAxisC] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showMirinha, setShowMirinha] = useState<boolean>(true);

  // Hover & Mirinha Screen Overlay State
  const [hoveredPoint, setHoveredPoint] = useState<(Point3D & { idx: number }) | null>(null);
  const [mirinhaScreenPos, setMirinhaScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);

  // Freeze Graphic State ("Congelar Gráfico")
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const frozenGcodeRef = useRef<string>(gcodeText);

  if (!isFrozen) {
    frozenGcodeRef.current = gcodeText;
  }
  const effectiveGcode = isFrozen ? frozenGcodeRef.current : gcodeText;

  // Measuring overlay states (Régua de Medição 3D & Régua Angular 3D)
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [isMeasuringAngle, setIsMeasuringAngle] = useState<boolean>(false);
  const [measurePoint1, setMeasurePoint1] = useState<Point3D | null>(null);
  const [measurePoint2, setMeasurePoint2] = useState<Point3D | null>(null);

  // Orbit Controls State
  const isMouseDownRef = useRef<boolean>(false);
  const isRightClickRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -25));
  const cameraDistanceRef = useRef<number>(180);
  const cameraAnglesRef = useRef<{ theta: number; phi: number }>({
    theta: Math.PI / 4,
    phi: Math.PI / 3,
  });

  const isInternalStepRef = useRef<boolean>(false);

  // Parse G-code for 3D trajectory (X, Y, Z, C)
  const trajectoryPoints = useMemo<Point3D[]>(() => {
    if (!effectiveGcode) return [];

    const lines = effectiveGcode.split("\n");
    const points: Point3D[] = [];

    let curX = 40; // Default X (diameter)
    let curY = 0;  // Default Y
    let curZ = 5;  // Default Z
    let curC = 0;  // Default C angle
    let curRapid = true;

    // First start point
    points.push({ x: curX, y: curY, z: curZ, c: curC, line: 0, isRapid: true, rawText: "INÍCIO" });

    lines.forEach((lineText, idx) => {
      // Remove comments ( ... ) or ; ...
      const cleanLine = lineText.split(";")[0].replace(/\([^)]*\)/g, "").trim().toUpperCase();
      if (!cleanLine) return;

      // Check for G04 / G4 dwell command (e.g., G4 X.3, G04 X0.5, G4 U0.5, G4 P1000)
      const isG4Dwell = /G\s*0?4(?![0-9])/i.test(cleanLine);

      // Check motion modal
      if (cleanLine.includes("G00") || cleanLine.includes("G0")) curRapid = true;
      if (cleanLine.includes("G01") || cleanLine.includes("G1") || cleanLine.includes("G02") || cleanLine.includes("G2") || cleanLine.includes("G03") || cleanLine.includes("G3")) {
        curRapid = false;
      }

      let moved = false;

      // Extract coordinates ONLY if line is NOT a G04 / G4 dwell command
      if (!isG4Dwell) {
        // Extract X value (Assume Diameter value in lathe programming)
        const xMatch = cleanLine.match(/(?<![A-Z])X\s*([-+]?\d*\.?\d+)/);
        if (xMatch) {
          curX = parseFloat(xMatch[1]);
          moved = true;
        }

        // Extract Y value
        const yMatch = cleanLine.match(/(?<![A-Z])Y\s*([-+]?\d*\.?\d+)/);
        if (yMatch) {
          curY = parseFloat(yMatch[1]);
          moved = true;
        }

        // Extract Z value
        const zMatch = cleanLine.match(/(?<![A-Z])Z\s*([-+]?\d*\.?\d+)/);
        if (zMatch) {
          curZ = parseFloat(zMatch[1]);
          moved = true;
        }

        // Extract C value
        const cMatch = cleanLine.match(/(?<![A-Z])C\s*([-+]?\d*\.?\d+)/);
        if (cMatch) {
          curC = parseFloat(cMatch[1]);
          moved = true;
        }

        // Incremental U (X diameter) and W (Z) if not a cycle line
        if (!cleanLine.includes("G71") && !cleanLine.includes("G72") && !cleanLine.includes("G73") && !cleanLine.includes("G76")) {
          const uMatch = cleanLine.match(/(?<![A-Z])U\s*([-+]?\d*\.?\d+)/);
          if (uMatch) {
            curX += parseFloat(uMatch[1]);
            moved = true;
          }
          const wMatch = cleanLine.match(/(?<![A-Z])W\s*([-+]?\d*\.?\d+)/);
          if (wMatch) {
            curZ += parseFloat(wMatch[1]);
            moved = true;
          }
        }
      }

      // Always push point for each line so all blocks in the program can be stepped and highlighted
      points.push({
        x: curX,
        y: curY,
        z: curZ,
        c: curC,
        line: idx,
        isRapid: curRapid,
        rawText: cleanLine,
      });
    });

    return points;
  }, [effectiveGcode]);

  // Active current 3D Point
  const currentPoint = useMemo(() => {
    if (trajectoryPoints.length === 0) {
      return { x: 40, y: 0, z: 5, c: 0, line: 0, isRapid: true, rawText: "" };
    }
    const idx = Math.min(Math.max(0, currentStepIdx), trajectoryPoints.length - 1);
    return trajectoryPoints[idx];
  }, [trajectoryPoints, currentStepIdx]);

  // Sync external activeLine from editor click with 3D step
  useEffect(() => {
    if (activeLine >= 0 && trajectoryPoints.length > 0 && !isInternalStepRef.current) {
      const matchIdx = trajectoryPoints.findIndex((p) => p.line >= activeLine);
      if (matchIdx !== -1) {
        setCurrentStepIdx(matchIdx);
      }
    }
    isInternalStepRef.current = false;
  }, [activeLine, trajectoryPoints]);

  // Step change helper that syncs line back to editor
  const handleStepChange = (newStepIdx: number) => {
    const clamped = Math.min(Math.max(0, newStepIdx), trajectoryPoints.length - 1);
    setCurrentStepIdx(clamped);
    const point = trajectoryPoints[clamped];
    if (point && point.line >= 0) {
      isInternalStepRef.current = true;
      onLineChange(point.line);
    }
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    handleStepChange(currentStepIdx + 1);
  };

  const handleStop = () => {
    setIsPlaying(false);
    handleStepChange(0);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentStepIdx >= trajectoryPoints.length - 1) {
        handleStepChange(0);
      }
      setIsPlaying(true);
    }
  };

  const toggleMeasuring = () => {
    setIsMeasuring((prev) => {
      const next = !prev;
      if (next) setIsMeasuringAngle(false);
      setMeasurePoint1(null);
      setMeasurePoint2(null);
      return next;
    });
  };

  const toggleMeasuringAngle = () => {
    setIsMeasuringAngle((prev) => {
      const next = !prev;
      if (next) setIsMeasuring(false);
      setMeasurePoint1(null);
      setMeasurePoint2(null);
      return next;
    });
  };

  // Setup Three.js Scene, Camera, Lighting & Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkTheme ? 0x0b0b12 : 0xf1f5f9);
    sceneRef.current = scene;

    // 2. Cameras (Perspective for 3D Iso, Orthographic for 2D Frente/Lado/Topo)
    const perspectiveCam = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
    perspectiveCameraRef.current = perspectiveCam;

    const frustumSize = 180;
    const aspect = width / height;
    const orthographicCam = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -10000,
      10000
    );
    orthographicCameraRef.current = orthographicCam;

    cameraRef.current = perspectiveCam;
    updateCameraPosition();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(100, 150, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);

    // 5. Grid Helper (Lathe / Milling Workspace)
    const gridHelper = new THREE.GridHelper(300, 30, 0x3f3f46, 0x27272a);
    gridHelper.position.set(0, 0, -50);
    gridHelper.rotation.x = Math.PI / 2; // Flat on Z plane
    gridHelper.visible = showGrid;
    gridHelperRef.current = gridHelper;
    scene.add(gridHelper);

    // 6. C-Axis Group & Central Guide Axes (X, Y, Z lines)
    const cAxisGroup = new THREE.Group();
    cAxisGroupRef.current = cAxisGroup;
    scene.add(cAxisGroup);

    // Z-Axis Line (Cyan/Blue - Spindle axis)
    const zAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -150),
      new THREE.Vector3(0, 0, 150),
    ]);
    const zAxisMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 });
    const zAxisLine = new THREE.Line(zAxisGeo, zAxisMat);
    zAxisLine.visible = showAxisZ;
    zAxisRef.current = zAxisLine;
    cAxisGroup.add(zAxisLine);

    // X-Axis Line (Red - Diameter axis)
    const xAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-80, 0, 0),
      new THREE.Vector3(80, 0, 0),
    ]);
    const xAxisMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    const xAxisLine = new THREE.Line(xAxisGeo, xAxisMat);
    xAxisLine.visible = showAxisX;
    xAxisRef.current = xAxisLine;
    cAxisGroup.add(xAxisLine);

    // Y-Axis Line (Yellow - Milling vertical height axis)
    const yAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -60, 0),
      new THREE.Vector3(0, 60, 0),
    ]);
    const yAxisMat = new THREE.LineBasicMaterial({ color: 0xeab308, linewidth: 2 });
    const yAxisLine = new THREE.Line(yAxisGeo, yAxisMat);
    yAxisLine.visible = showAxisY;
    yAxisRef.current = yAxisLine;
    cAxisGroup.add(yAxisLine);

    // C-Axis Reference Ring (Dashed Ring with Angle Ticks)
    const ringRadius = 40;
    const ringSegments = 64;
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= ringSegments; i++) {
      const theta = (i / ringSegments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(ringRadius * Math.cos(theta), ringRadius * Math.sin(theta), 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 2,
      gapSize: 2,
    });
    const cRingLine = new THREE.Line(ringGeo, ringMat);
    cRingLine.computeLineDistances();
    cRingLine.visible = showAxisC;
    cRingRef.current = cRingLine;
    cAxisGroup.add(cRingLine);

    // 7. Tool Tip Group & Reticle ("Mirinha 3D")
    const toolGroup = new THREE.Group();
    toolGroupRef.current = toolGroup;
    scene.add(toolGroup);

    // Tool cursor glowing sphere (Ultra bright neon magenta core)
    const sphereGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xff007f,
      emissive: 0xff007f,
      emissiveIntensity: 1.2,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    toolGroup.add(sphereMesh);

    // Target Reticle Ring ("Mirinha") for tool position (bright neon green ring)
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const theta = (i / 32) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(1.6 * Math.cos(theta), 1.6 * Math.sin(theta), 0));
    }
    const ringReticleGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ringReticleMat = new THREE.LineBasicMaterial({ color: 0x39ff14, linewidth: 2 });
    const ringReticle = new THREE.Line(ringReticleGeo, ringReticleMat);
    toolGroup.add(ringReticle);

    // 3D Crosshair for tool position (bright electric yellow cross)
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.8, 0, 0),
      new THREE.Vector3(2.8, 0, 0),
      new THREE.Vector3(0, -2.8, 0),
      new THREE.Vector3(0, 2.8, 0),
      new THREE.Vector3(0, 0, -2.8),
      new THREE.Vector3(0, 0, 2.8),
    ]);
    const crossMat = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 2 });
    const crossLines = new THREE.LineSegments(crossGeo, crossMat);
    toolGroup.add(crossLines);

    // 8. Tool Projections Group (3D Dashed guide lines from tool to axes)
    const projectionsGroup = new THREE.Group();
    toolProjectionsGroupRef.current = projectionsGroup;
    scene.add(projectionsGroup);

    // 9. Trajectory Group
    const pathLinesGroup = new THREE.Group();
    pathLinesGroupRef.current = pathLinesGroup;
    scene.add(pathLinesGroup);

    // 9. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // 10. Resize Observer
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || 500;
      const h = container.clientHeight || 450;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (rendererRef.current) {
        if (rendererRef.current.domElement && container && container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Update scene background color when theme toggles
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.background = new THREE.Color(isDarkTheme ? 0x0b0b12 : 0xf1f5f9);
  }, [isDarkTheme]);

  // Update Grid & Axes (X, Y, Z, C) visibility independently
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    if (xAxisRef.current) xAxisRef.current.visible = showAxisX;
  }, [showAxisX]);

  useEffect(() => {
    if (yAxisRef.current) yAxisRef.current.visible = showAxisY;
  }, [showAxisY]);

  useEffect(() => {
    if (zAxisRef.current) zAxisRef.current.visible = showAxisZ;
  }, [showAxisZ]);

  useEffect(() => {
    if (cRingRef.current) cRingRef.current.visible = showAxisC;
  }, [showAxisC]);

  // Orbit / Pan / Zoom Mouse Events
  const handlePointerDown = (e: React.PointerEvent) => {
    isMouseDownRef.current = true;
    isRightClickRef.current = e.button === 2 || e.shiftKey;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const updateCameraPosition = useCallback(() => {
    const container = mountRef.current;
    if (!container || !perspectiveCameraRef.current || !orthographicCameraRef.current) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;
    const aspect = width / height;
    const dist = cameraDistanceRef.current;
    const target = cameraTargetRef.current;

    if (cameraView === "iso") {
      const camera = perspectiveCameraRef.current;
      cameraRef.current = camera;
      camera.aspect = aspect;
      camera.up.set(0, 1, 0);

      const { theta, phi } = cameraAnglesRef.current;
      camera.position.x = target.x + dist * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + dist * Math.cos(phi);
      camera.position.z = target.z + dist * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    } else {
      const camera = orthographicCameraRef.current;
      cameraRef.current = camera;

      const s = dist * 0.8;
      camera.left = (-s * aspect) / 2;
      camera.right = (s * aspect) / 2;
      camera.top = s / 2;
      camera.bottom = -s / 2;
      camera.near = -10000;
      camera.far = 10000;

      if (cameraView === "front") {
        // Vista Frontal (Face X-Y do Torno)
        camera.up.set(0, 1, 0);
        camera.position.set(target.x, target.y, target.z + 500);
        camera.lookAt(target.x, target.y, target.z);
      } else if (cameraView === "side") {
        // Vista Lateral (Perfil X-Z do Torno - Ortográfica total sem qualquer inclinação!)
        camera.up.set(1, 0, 0); // Eixo X (Diâmetro) fica apontado para CIMA na tela
        camera.position.set(target.x, target.y + 500, target.z); // Visão ortográfica direta ao longo do Eixo Y
        camera.lookAt(target.x, target.y, target.z);
      } else if (cameraView === "top") {
        // Vista Superior (Plano Y-Z do Torno)
        camera.up.set(0, 1, 0);
        camera.position.set(target.x + 500, target.y, target.z);
        camera.lookAt(target.x, target.y, target.z);
      }

      camera.updateProjectionMatrix();
    }

    updateMirinhaScreenPos();
  }, [cameraView]);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMouseDownRef.current) return;

    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;

    if (isRightClickRef.current) {
      // Arrastar conjunto inteiro no gráfico sem limites (Screen-space panning)
      const camera = cameraRef.current;
      if (camera) {
        camera.updateMatrixWorld(true);
        const matrix = camera.matrixWorld;
        const rightVector = new THREE.Vector3(matrix.elements[0], matrix.elements[1], matrix.elements[2]).normalize();
        const upVector = new THREE.Vector3(matrix.elements[4], matrix.elements[5], matrix.elements[6]).normalize();

        const panSpeed = cameraDistanceRef.current * 0.0012;

        cameraTargetRef.current.addScaledVector(rightVector, -deltaX * panSpeed);
        cameraTargetRef.current.addScaledVector(upVector, deltaY * panSpeed);
      }
    } else {
      // Rotacionar em 3D (Se estiver em vista 2D ortográfica, alterna para 3D "iso" suavemente)
      if (cameraView !== "iso") {
        setCameraView("iso");
      }

      // Rotação proporcional e ultra suave ao arrastar com o botão esquerdo
      const rotateSpeed = 0.005;
      cameraAnglesRef.current.theta -= deltaX * rotateSpeed;
      cameraAnglesRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, cameraAnglesRef.current.phi - deltaY * rotateSpeed)
      );
    }

    updateCameraPosition();
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    isMouseDownRef.current = false;
    isRightClickRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.12 : 0.88;
    // Zoom sem limites (de 0.01 a 100000)
    cameraDistanceRef.current = Math.max(0.01, Math.min(100000, cameraDistanceRef.current * zoomFactor));
    updateCameraPosition();
  };

  // Update Mirinha Screen Overlay Position (Tracks active tool or hovered vertex)
  const updateMirinhaScreenPos = useCallback(() => {
    if (!cameraRef.current || !mountRef.current) return;

    const targetPt = hoveredPoint || currentPoint;
    if (!targetPt) {
      setMirinhaScreenPos(null);
      return;
    }

    const vec = new THREE.Vector3(targetPt.x / 2, targetPt.y, targetPt.z);
    vec.project(cameraRef.current);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    if (!width || !height) return;

    const sx = (vec.x * 0.5 + 0.5) * width;
    const sy = (-vec.y * 0.5 + 0.5) * height;

    if (isNaN(sx) || isNaN(sy)) {
      setMirinhaScreenPos(null);
      return;
    }

    setMirinhaScreenPos({
      x: sx,
      y: sy,
      visible: vec.z < 1 && sx >= -150 && sx <= width + 150 && sy >= -150 && sy <= height + 150,
    });
  }, [hoveredPoint, currentPoint]);

  useEffect(() => {
    updateCameraPosition();
  }, [cameraView, updateCameraPosition]);

  // Update 3D Projection Lines from Tool/Hover Point to Origin Axes
  useEffect(() => {
    if (!toolProjectionsGroupRef.current) return;
    const projGroup = toolProjectionsGroupRef.current;
    while (projGroup.children.length > 0) {
      projGroup.remove(projGroup.children[0]);
    }

    if (!showMirinha) return;

    const targetPt = hoveredPoint || currentPoint;
    if (!targetPt) return;

    const { x, y, z } = targetPt;
    const wx = x / 2;
    const wy = y;
    const wz = z;

    // Line to Z-Y center (0, wy, wz)
    if (showAxisX && Math.abs(wx) > 0.05) {
      const lineXGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, wy, wz),
        new THREE.Vector3(wx, wy, wz),
      ]);
      const lineXMat = new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 2, gapSize: 2 });
      const lineX = new THREE.Line(lineXGeo, lineXMat);
      lineX.computeLineDistances();
      projGroup.add(lineX);
    }

    // Line to X-Z plane (wx, 0, wz)
    if (showAxisY && Math.abs(wy) > 0.05) {
      const lineYGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wx, 0, wz),
        new THREE.Vector3(wx, wy, wz),
      ]);
      const lineYMat = new THREE.LineDashedMaterial({ color: 0xeab308, dashSize: 2, gapSize: 2 });
      const lineY = new THREE.Line(lineYGeo, lineYMat);
      lineY.computeLineDistances();
      projGroup.add(lineY);
    }

    // Line to Face Z=0 plane (wx, wy, 0)
    if (showAxisZ && Math.abs(wz) > 0.05) {
      const lineZGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wx, wy, 0),
        new THREE.Vector3(wx, wy, wz),
      ]);
      const lineZMat = new THREE.LineDashedMaterial({ color: 0x06b6d4, dashSize: 2, gapSize: 2 });
      const lineZ = new THREE.Line(lineZGeo, lineZMat);
      lineZ.computeLineDistances();
      projGroup.add(lineZ);
    }

    updateMirinhaScreenPos();
  }, [currentPoint, hoveredPoint, showMirinha, showAxisX, showAxisY, showAxisZ, updateMirinhaScreenPos]);

  // Handle Canvas Mouse Move Hover Snap
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMouseDownRef.current) {
      updateMirinhaScreenPos();
      return;
    }

    if (!mountRef.current || !cameraRef.current || trajectoryPoints.length === 0) return;

    const rect = mountRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    let closestPt: (Point3D & { idx: number }) | null = null;
    let minDistance = 45; // Generous 45px snap radius for easy vertex snapping

    // 1. Check ALL trajectory vertices in the program (no step limits)
    for (let i = 0; i < trajectoryPoints.length; i++) {
      const pt = trajectoryPoints[i];
      const vec = new THREE.Vector3(pt.x / 2, pt.y, pt.z);
      vec.project(cameraRef.current);

      const px = (vec.x * 0.5 + 0.5) * width;
      const py = (-vec.y * 0.5 + 0.5) * height;

      if (vec.z < 1) {
        const dist = Math.hypot(px - mouseX, py - mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          closestPt = { ...pt, idx: i };
        }
      }
    }

    // 2. Fallback: If no vertex is within range, check intermediate segment points
    if (!closestPt) {
      let minSegDist = 35;
      for (let i = 0; i < trajectoryPoints.length - 1; i++) {
        const p1 = trajectoryPoints[i];
        const p2 = trajectoryPoints[i + 1];

        // Sample 5 points along each segment
        for (let t = 0.2; t <= 0.8; t += 0.2) {
          const interpX = p1.x + (p2.x - p1.x) * t;
          const interpY = p1.y + (p2.y - p1.y) * t;
          const interpZ = p1.z + (p2.z - p1.z) * t;

          const vec = new THREE.Vector3(interpX / 2, interpY, interpZ);
          vec.project(cameraRef.current);

          const px = (vec.x * 0.5 + 0.5) * width;
          const py = (-vec.y * 0.5 + 0.5) * height;

          if (vec.z < 1) {
            const dist = Math.hypot(px - mouseX, py - mouseY);
            if (dist < minSegDist) {
              minSegDist = dist;
              closestPt = {
                ...p2,
                x: interpX,
                y: interpY,
                z: interpZ,
                idx: i + 1,
              };
            }
          }
        }
      }
    }

    setHoveredPoint(closestPt);
  };

  const handleCanvasClick = () => {
    if (hoveredPoint && hoveredPoint.line >= 0) {
      setCurrentStepIdx(hoveredPoint.idx);
      onLineChange(hoveredPoint.line);
    }
  };

  // Re-draw 3D Toolpath trajectories incrementally step-by-step as program advances
  useEffect(() => {
    if (!pathLinesGroupRef.current || trajectoryPoints.length < 2) return;

    const pathGroup = pathLinesGroupRef.current;
    // Clear old children
    while (pathGroup.children.length > 0) {
      pathGroup.remove(pathGroup.children[0]);
    }

    // Only render segments up to currentStepIdx (progressive drawing step-by-step)
    const maxIdx = Math.min(currentStepIdx, trajectoryPoints.length - 1);

    for (let i = 0; i < maxIdx; i++) {
      const p1 = trajectoryPoints[i];
      const p2 = trajectoryPoints[i + 1];

      // Convert Lathe X (diameter) to 3D Radius position (X_radius = X_diam / 2)
      const v1 = new THREE.Vector3(p1.x / 2, p1.y, p1.z);
      const v2 = new THREE.Vector3(p2.x / 2, p2.y, p2.z);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);

      if (p2.isRapid) {
        const mat = new THREE.LineDashedMaterial({
          color: 0xeab308, // Gold / Yellow
          dashSize: 3,
          gapSize: 2,
        });
        const line = new THREE.Line(lineGeo, mat);
        line.computeLineDistances();
        pathGroup.add(line);
      } else {
        const isYMove = Math.abs(p2.y - p1.y) > 0.001;
        const mat = new THREE.LineBasicMaterial({
          color: isYMove ? 0x00f3ff : 0x10b981, // Cyan for Y-milling, Emerald green for regular feed
          linewidth: isYMove ? 3 : 2,
        });
        const line = new THREE.Line(lineGeo, mat);
        pathGroup.add(line);
      }
    }
  }, [trajectoryPoints, currentStepIdx]);

  // Update Tool Position & C-Axis Ring in 3D Scene
  useEffect(() => {
    if (!toolGroupRef.current) return;

    const { x, y, z, c } = currentPoint;

    // Tool Position: X is radius = X_diam / 2
    toolGroupRef.current.position.set(x / 2, y, z);

    // C-axis Rotation: Rotate C-Axis Reference Ring around Z axis (radians)
    if (cAxisGroupRef.current) {
      const cRad = (c * Math.PI) / 180;
      cAxisGroupRef.current.rotation.z = cRad;
    }
  }, [currentPoint]);

  // Automatic Playback Timer
  useEffect(() => {
    if (!isPlaying || simSpeed <= 0) return;

    const intervalMs = Math.max(15, Math.round(15000 / simSpeed));
    const timer = setInterval(() => {
      setCurrentStepIdx((prev) => {
        if (prev >= trajectoryPoints.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        const nextIdx = prev + 1;
        const targetPoint = trajectoryPoints[nextIdx];
        if (targetPoint && targetPoint.line >= 0) {
          isInternalStepRef.current = true;
          onLineChange(targetPoint.line);
        }
        return nextIdx;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, simSpeed, trajectoryPoints.length, onLineChange]);

  // Handle Preset Camera Views
  const handleSetCameraView = (view: "iso" | "front" | "side" | "top") => {
    setCameraView(view);
    if (view === "iso") {
      cameraAnglesRef.current = { theta: Math.PI / 4, phi: Math.PI / 3 };
      cameraDistanceRef.current = 180;
      cameraTargetRef.current.set(0, 0, -25);
    } else if (view === "front") {
      // Vista Frontal (Face X-Y do Torno)
      cameraAnglesRef.current = { theta: 0, phi: Math.PI / 2 };
      cameraDistanceRef.current = 160;
      cameraTargetRef.current.set(0, 0, 0);
    } else if (view === "side") {
      // Vista Lateral (Perfil X-Z do Torno)
      cameraAnglesRef.current = { theta: Math.PI / 2, phi: 0.05 };
      cameraDistanceRef.current = 180;
      cameraTargetRef.current.set(0, 0, -25);
    } else if (view === "top") {
      // Vista Superior (Plano Y-Z do Torno)
      cameraAnglesRef.current = { theta: Math.PI / 2, phi: Math.PI / 2 };
      cameraDistanceRef.current = 180;
      cameraTargetRef.current.set(0, 0, -25);
    }
    updateCameraPosition();
  };

  return (
    <div className={`relative flex flex-col h-full w-full rounded-xl overflow-hidden border shadow-2xl transition-all ${
      isDarkTheme ? "bg-zinc-950 border-zinc-700 text-white" : "bg-slate-100 border-slate-300 text-slate-900"
    }`}>
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#171722] border-b border-zinc-800 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Box className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-xs tracking-wide uppercase text-amber-300 flex items-center gap-1.5">
              <span>Simulador Gráfico 3D</span>
              <span className="bg-cyan-500/20 text-cyan-400 text-[9px] px-1.5 py-0.2 rounded border border-cyan-500/30">
                4 EIXOS (X, Y, Z, C)
              </span>
            </h3>
            <p className="text-[10px] text-zinc-400 font-sans">
              Centro de Usinagem & Torno com Ferramenta Acionada
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Preset View Controls */}
          <div className="flex items-center bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-semibold">
            <button
              onClick={() => handleSetCameraView("iso")}
              className={`px-2 py-0.5 rounded transition ${cameraView === "iso" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"}`}
              title="Vista Isométrica 3D"
            >
              3D
            </button>
            <button
              onClick={() => handleSetCameraView("front")}
              className={`px-2 py-0.5 rounded transition ${cameraView === "front" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"}`}
              title="Vista Frontal (Face X-Y)"
            >
              Frente
            </button>
            <button
              onClick={() => handleSetCameraView("side")}
              className={`px-2 py-0.5 rounded transition ${cameraView === "side" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"}`}
              title="Vista Lateral (Perfil X-Z)"
            >
              Lado
            </button>
            <button
              onClick={() => handleSetCameraView("top")}
              className={`px-2 py-0.5 rounded transition ${cameraView === "top" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"}`}
              title="Vista Superior (Plano Y-Z)"
            >
              Topo
            </button>
          </div>

          {/* Individual Axis Toggles in Header */}
          <div className="hidden lg:flex items-center bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-semibold">
            <button
              onClick={() => setShowAxisX(!showAxisX)}
              className={`px-1.5 py-0.5 rounded transition ${showAxisX ? "bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Exibir / Ocultar Eixo X (Vermelho)"
            >
              X
            </button>
            <button
              onClick={() => setShowAxisY(!showAxisY)}
              className={`px-1.5 py-0.5 rounded transition ${showAxisY ? "bg-yellow-500/20 text-yellow-400 font-bold border border-yellow-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Exibir / Ocultar Eixo Y (Amarelo)"
            >
              Y
            </button>
            <button
              onClick={() => setShowAxisZ(!showAxisZ)}
              className={`px-1.5 py-0.5 rounded transition ${showAxisZ ? "bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Exibir / Ocultar Eixo Z (Ciano)"
            >
              Z
            </button>
            <button
              onClick={() => setShowAxisC(!showAxisC)}
              className={`px-1.5 py-0.5 rounded transition ${showAxisC ? "bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Exibir / Ocultar Eixo C (Anel Azul)"
            >
              C
            </button>
          </div>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1 px-2 rounded-lg border text-[10px] font-sans font-bold transition flex items-center gap-1 ${
              showGrid
                ? "bg-amber-950/60 text-amber-300 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Exibir / Ocultar Grade de Fundo 3D"
          >
            <Grid className="w-3 h-3" />
            <span className="hidden sm:inline">Grade</span>
          </button>

          {/* Toggle Mirinha Button */}
          <button
            onClick={() => setShowMirinha(!showMirinha)}
            className={`p-1 px-2 rounded-lg border text-[10px] font-sans font-bold transition flex items-center gap-1.5 cursor-pointer ${
              showMirinha
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Ligar / Desligar Mirinha de Seleção de Coordenadas 3D"
          >
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Mirinha</span>
            <span className={`text-[8px] px-1 py-0.2 rounded font-extrabold ${showMirinha ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>
              {showMirinha ? "ON" : "OFF"}
            </span>
          </button>

          {/* Theme Toggle & Fit Camera */}
          <button
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-amber-400 transition"
            title={isDarkTheme ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
          >
            {isDarkTheme ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>

          <button
            onClick={() => handleSetCameraView("iso")}
            className="p-1 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition text-[10px] font-sans font-bold flex items-center gap-1"
            title="Enquadrar Visão 3D"
          >
            <Maximize2 className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Enquadrar</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition"
              title="Fechar Simulador 3D"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3D WebGL Canvas Area */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          handlePointerMove(e);
          handleCanvasMouseMove(e);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
        className="flex-1 relative cursor-grab active:cursor-grabbing min-h-0 select-none overflow-hidden"
      >
        {/* Mirinha Overlay (Retículo de Alvo no Canvas - Ultra Chamativa Rosa Neon/Amarelo) */}
        {showMirinha && mirinhaScreenPos && mirinhaScreenPos.visible && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {/* Linha Guia Horizontal Tracejada em Rosa Neon */}
            <div
              className="absolute border-b border-dashed border-pink-500/80 w-full drop-shadow-[0_0_6px_rgba(255,0,127,0.9)]"
              style={{ top: `${mirinhaScreenPos.y}px`, left: 0 }}
            />
            {/* Linha Guia Vertical Tracejada em Rosa Neon */}
            <div
              className="absolute border-r border-dashed border-pink-500/80 h-full drop-shadow-[0_0_6px_rgba(255,0,127,0.9)]"
              style={{ left: `${mirinhaScreenPos.x}px`, top: 0 }}
            />

            {/* Retículo Mirinha do Alvo (Alta Visibilidade Rosa Fuchsia + Amarelo Elétrico) */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-75"
              style={{ left: `${mirinhaScreenPos.x}px`, top: `${mirinhaScreenPos.y}px` }}
            >
              <svg className="w-8 h-8 text-pink-500 animate-pulse drop-shadow-[0_0_12px_rgba(255,0,127,1)]" viewBox="0 0 40 40">
                {/* Anel Externo Rosa Neon */}
                <circle cx="20" cy="20" r="15" fill="none" stroke="#ff007f" strokeWidth="2" strokeDasharray="4 2" />
                {/* Anel Interno Amarelo Elétrico */}
                <circle cx="20" cy="20" r="8" fill="none" stroke="#ffea00" strokeWidth="2" />
                {/* Ponto Central Verde Limão */}
                <circle cx="20" cy="20" r="3" fill="#39ff14" />
                {/* Miras do Quadrante Rosa Fuchsia */}
                <line x1="2" y1="20" x2="11" y2="20" stroke="#ff007f" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="29" y1="20" x2="38" y2="20" stroke="#ff007f" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="20" y1="2" x2="20" y2="11" stroke="#ff007f" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="20" y1="28" x2="20" y2="38" stroke="#ff007f" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}

        {/* Painel Esquerdo Fixo: DRO + Caixa de Posição da Mirinha (Foto 2) */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2.5 pointer-events-none select-none min-w-[195px] max-w-[230px]">
          {/* DRO Overlay (Leitura de Posição dos 4 Eixos + Linha Atual) */}
          {(() => {
            const curPt = currentPoint || { x: 0, y: 0, z: 0, c: 0, line: 0, rawText: "" };
            const cx = typeof curPt.x === "number" && !isNaN(curPt.x) ? curPt.x : 0;
            const cy = typeof curPt.y === "number" && !isNaN(curPt.y) ? curPt.y : 0;
            const cz = typeof curPt.z === "number" && !isNaN(curPt.z) ? curPt.z : 0;
            const cc = typeof curPt.c === "number" && !isNaN(curPt.c) ? curPt.c : 0;
            const cLine = typeof curPt.line === "number" && !isNaN(curPt.line) ? curPt.line : 0;
            const cRawText = curPt.rawText || "N000";

            return (
              <div className="bg-[#0f0f16]/90 backdrop-blur-md border border-zinc-800/80 rounded-xl p-2.5 shadow-xl font-mono text-left">
                <div className="text-[9px] uppercase tracking-wider text-amber-400 font-bold mb-1.5 flex items-center justify-between border-b border-zinc-800 pb-1">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
                    POSIÇÃO DIGITAL (DRO)
                  </span>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] px-1 py-0.2 rounded font-extrabold font-mono">
                    L{cLine + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-rose-400 font-bold text-[10px]">EIXO X:</span>
                    <span className="font-mono text-zinc-100 font-semibold">Ø {cx.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-400 font-bold text-[10px]">EIXO Y:</span>
                    <span className="font-mono text-emerald-300 font-extrabold bg-emerald-950/60 px-1 rounded border border-emerald-500/30">
                      {cy >= 0 ? `+${cy.toFixed(3)}` : cy.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold text-[10px]">EIXO Z:</span>
                    <span className="font-mono text-zinc-100 font-semibold">{cz.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sky-400 font-bold text-[10px]">EIXO C:</span>
                    <span className="font-mono text-amber-300 font-bold">{cc.toFixed(1)}°</span>
                  </div>
                </div>

                <div className="mt-2 pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-400 truncate flex items-center justify-between gap-1">
                  <span className="text-amber-400 font-bold font-mono">LINHA N{cLine + 1}:</span>
                  <span className="text-cyan-300 font-mono font-bold truncate">{cRawText}</span>
                </div>
              </div>
            );
          })()}

          {/* Caixa Fixa da Mirinha de Posição / Ponto Selecionado (Indicação Foto 2) */}
          {showMirinha && (() => {
            const activePt = hoveredPoint || currentPoint || { x: 0, y: 0, z: 0, c: 0, line: 0, rawText: "" };
            const ptX = typeof activePt.x === "number" && !isNaN(activePt.x) ? activePt.x : 0;
            const ptY = typeof activePt.y === "number" && !isNaN(activePt.y) ? activePt.y : 0;
            const ptZ = typeof activePt.z === "number" && !isNaN(activePt.z) ? activePt.z : 0;
            const ptC = typeof activePt.c === "number" && !isNaN(activePt.c) ? activePt.c : 0;
            const ptLine = typeof activePt.line === "number" && !isNaN(activePt.line) ? activePt.line : 0;
            const ptRawText = activePt.rawText || "";

            return (
              <div className="bg-[#090912]/95 border border-cyan-500/70 rounded-xl p-2.5 shadow-[0_0_20px_rgba(0,243,255,0.2)] backdrop-blur-md font-mono text-[10px] text-left">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mb-1.5 font-bold text-[9px] text-yellow-400 tracking-wider">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />
                    {hoveredPoint ? "🎯 PONTO SELECIONADO" : "🎯 MIRINHA DE POSIÇÃO 3D"}
                  </span>
                  <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[9px] px-1 py-0.2 rounded font-extrabold shrink-0">
                    N{ptLine + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-rose-400 font-bold text-[10px]">EIXO X:</span>
                    <span className="font-mono text-zinc-100 font-semibold">Ø {ptX.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-400 font-bold text-[10px]">EIXO Y:</span>
                    <span className="font-mono text-emerald-300 font-extrabold bg-emerald-950/60 px-1 rounded border border-emerald-500/30">
                      {ptY >= 0 ? `+${ptY.toFixed(3)}` : ptY.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold text-[10px]">EIXO Z:</span>
                    <span className="font-mono text-zinc-100 font-semibold">{ptZ.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sky-400 font-bold text-[10px]">EIXO C:</span>
                    <span className="font-mono text-amber-300 font-bold">{ptC.toFixed(1)}°</span>
                  </div>
                </div>

                <div className="mt-2 pt-1 border-t border-zinc-800/80 text-[10px] text-amber-300 font-bold truncate flex items-center justify-between gap-1">
                  <span className="text-amber-400 font-bold font-mono shrink-0">LINHA N{ptLine + 1}:</span>
                  <span className="text-cyan-300 font-mono font-bold truncate">{ptRawText || "N/A"}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Floating 3D Measurement Result Box */}
        {isMeasuring && (
          <div className="absolute top-3 right-3 z-20 bg-[#111118]/95 border border-pink-500/70 rounded-xl p-3 font-mono text-[11px] shadow-2xl select-none w-64 text-left">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5 mb-2 font-bold text-[10px] tracking-wider text-pink-400">
              <span className="flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 animate-pulse text-pink-400" />
                RÉGUA DE MEDIÇÃO 3D
              </span>
              <button
                onClick={() => {
                  setMeasurePoint1(null);
                  setMeasurePoint2(null);
                }}
                className="text-[9px] text-zinc-400 hover:text-white underline font-sans cursor-pointer"
              >
                Limpar
              </button>
            </div>

            {!measurePoint1 ? (
              <div className="text-zinc-400 text-[10px] py-1 leading-relaxed font-sans">
                Avance nos blocos ⏭ para selecionar o <b>Ponto 1 (P1)</b> e clique em 'Marcar P1'.
              </div>
            ) : !measurePoint2 ? (
              <div className="flex flex-col gap-1.5 font-sans">
                <div className="text-pink-400 font-bold text-[10px] truncate">
                  P1 (L{measurePoint1.line + 1}): X Ø{measurePoint1.x.toFixed(3)} Y{measurePoint1.y.toFixed(3)} Z{measurePoint1.z.toFixed(3)}
                </div>
                <div className="text-zinc-300 text-[10px] animate-pulse">
                  Avance para outro bloco ⏭ e clique em 'Marcar P2'.
                </div>
                <button
                  onClick={() => setMeasurePoint2(currentPoint)}
                  className="mt-1 bg-pink-600 hover:bg-pink-500 text-white font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
                >
                  Marcar P2 (Posição Atual L{currentPoint.line + 1})
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-[10px]">
                <div className="grid grid-cols-2 gap-1 border-b border-zinc-800/60 pb-1 text-[9px] text-zinc-400">
                  <div><span className="text-pink-400 font-bold">P1:</span> L{measurePoint1.line + 1}</div>
                  <div><span className="text-pink-400 font-bold">P2:</span> L{measurePoint2.line + 1}</div>
                </div>

                <div className="flex justify-between py-0.5 border-b border-zinc-800/40">
                  <span className="text-zinc-400">ΔX (Diâmetro):</span>
                  <span className="text-[#39ff14] font-bold">Ø {(measurePoint2.x - measurePoint1.x).toFixed(3)} mm</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-800/40">
                  <span className="text-zinc-400">ΔX (Raio):</span>
                  <span className="text-[#39ff14]/80 font-bold">{((measurePoint2.x - measurePoint1.x) / 2).toFixed(3)} mm</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-800/40">
                  <span className="text-zinc-400">ΔY (Eixo Y):</span>
                  <span className="text-cyan-400 font-bold">{(measurePoint2.y - measurePoint1.y).toFixed(3)} mm</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-800/40">
                  <span className="text-zinc-400">ΔZ (Eixo Z):</span>
                  <span className="text-amber-400 font-bold">{(measurePoint2.z - measurePoint1.z).toFixed(3)} mm</span>
                </div>
                <div className="flex justify-between py-1 bg-pink-950/40 px-1.5 rounded border border-pink-500/30 mt-1">
                  <span className="text-pink-300 font-bold">Distância 3D:</span>
                  <span className="text-pink-200 font-bold">
                    {Math.hypot((measurePoint2.x - measurePoint1.x) / 2, measurePoint2.y - measurePoint1.y, measurePoint2.z - measurePoint1.z).toFixed(3)} mm
                  </span>
                </div>
              </div>
            )}

            {!measurePoint1 && (
              <button
                onClick={() => setMeasurePoint1(currentPoint)}
                className="mt-2 w-full bg-pink-600 hover:bg-pink-500 text-white font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
              >
                Marcar P1 (Posição Atual L{currentPoint.line + 1})
              </button>
            )}
          </div>
        )}

        {/* Floating 3D Angular Measurement Result Box */}
        {isMeasuringAngle && (
          <div className="absolute top-3 right-3 z-20 bg-[#111118]/95 border border-amber-500/70 rounded-xl p-3 font-mono text-[11px] shadow-2xl select-none w-64 text-left">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5 mb-2 font-bold text-[10px] tracking-wider text-amber-400">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                RÉGUA ANGULAR 3D
              </span>
              <button
                onClick={() => {
                  setMeasurePoint1(null);
                  setMeasurePoint2(null);
                }}
                className="text-[9px] text-zinc-400 hover:text-white underline font-sans cursor-pointer"
              >
                Limpar
              </button>
            </div>

            {!measurePoint1 ? (
              <div className="text-zinc-400 text-[10px] py-1 leading-relaxed font-sans">
                Avance até a primeira posição ⏭ e clique em 'Marcar Ponto Inicial (V1)'.
              </div>
            ) : !measurePoint2 ? (
              <div className="flex flex-col gap-1.5 font-sans">
                <div className="text-amber-400 font-bold text-[10px] truncate">
                  V1 (L{measurePoint1.line + 1}): X{measurePoint1.x.toFixed(1)}, Y{measurePoint1.y.toFixed(1)}, Z{measurePoint1.z.toFixed(1)}
                </div>
                <button
                  onClick={() => setMeasurePoint2(currentPoint)}
                  className="mt-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
                >
                  Marcar V2 (Posição Atual L{currentPoint.line + 1})
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 text-[10px]">
                {(() => {
                  const dx = (measurePoint2.x - measurePoint1.x) / 2;
                  const dy = measurePoint2.y - measurePoint1.y;
                  const dz = measurePoint2.z - measurePoint1.z;
                  const angleDeg = Math.atan2(Math.abs(dx), Math.abs(dz || 0.001)) * (180 / Math.PI);
                  const angle3D = Math.atan2(Math.hypot(dx, dy), Math.abs(dz || 0.001)) * (180 / Math.PI);

                  return (
                    <>
                      <div className="flex justify-between py-1 border-b border-zinc-800/40">
                        <span className="text-zinc-400">Ângulo XZ (Inclin.):</span>
                        <span className="text-amber-300 font-bold">{angleDeg.toFixed(2)}°</span>
                      </div>
                      <div className="flex justify-between py-1 bg-amber-950/40 px-1.5 rounded border border-amber-500/30">
                        <span className="text-amber-300 font-bold">Ângulo Relativo 3D:</span>
                        <span className="text-amber-200 font-bold">{angle3D.toFixed(2)}°</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {!measurePoint1 && (
              <button
                onClick={() => setMeasurePoint1(currentPoint)}
                className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-1 px-2 rounded text-[10px] transition cursor-pointer"
              >
                Marcar Ponto Inicial V1
              </button>
            )}
          </div>
        )}

        {/* 3D Legend Controls Instruction */}
        <div className="absolute bottom-3 left-3 z-10 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[9px] text-zinc-400 font-mono border border-zinc-800/60 pointer-events-none">
          🖱️ Botão Esquerdo + Arrastar: Rotacionar 3D | Botão Direito / Shift: Mover | Scroll: Zoom
        </div>

        {/* Ticar e Ocultar Eixos Individuais (X, Y, Z, C) e Grade (Fotos 2 & 3) */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-wrap items-center gap-2.5 bg-[#0f0f16]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-800/90 shadow-2xl text-[10px] font-mono select-none">
          <label className="flex items-center gap-1 cursor-pointer text-rose-400 hover:text-rose-300 transition" title="Exibir/Ocultar Eixo X">
            <input
              type="checkbox"
              checked={showAxisX}
              onChange={(e) => setShowAxisX(e.target.checked)}
              className="accent-rose-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">Eixo X</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer text-yellow-400 hover:text-yellow-300 transition" title="Exibir/Ocultar Eixo Y">
            <input
              type="checkbox"
              checked={showAxisY}
              onChange={(e) => setShowAxisY(e.target.checked)}
              className="accent-yellow-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">Eixo Y</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer text-cyan-400 hover:text-cyan-300 transition" title="Exibir/Ocultar Eixo Z">
            <input
              type="checkbox"
              checked={showAxisZ}
              onChange={(e) => setShowAxisZ(e.target.checked)}
              className="accent-cyan-400 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">Eixo Z</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer text-sky-400 hover:text-sky-300 transition" title="Exibir/Ocultar Eixo C">
            <input
              type="checkbox"
              checked={showAxisC}
              onChange={(e) => setShowAxisC(e.target.checked)}
              className="accent-sky-400 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">Eixo C</span>
          </label>

          <span className="text-zinc-700">|</span>

          <label className="flex items-center gap-1 cursor-pointer text-amber-300 hover:text-amber-200 transition" title="Exibir/Ocultar Grade 3D">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="accent-amber-400 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">Grade</span>
          </label>

          <span className="text-zinc-700">|</span>

          <label className="flex items-center gap-1 cursor-pointer text-emerald-400 hover:text-emerald-300 transition" title="Exibir/Ocultar Mirinha (Retículo de Coordenadas)">
            <input
              type="checkbox"
              checked={showMirinha}
              onChange={(e) => setShowMirinha(e.target.checked)}
              className="accent-emerald-400 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className="font-bold">🎯 Mirinha</span>
          </label>
        </div>
      </div>

      {/* Bottom Control Playback & Tools Bar (Mesmas funções do 2D - Foto 2) */}
      <div className="p-2.5 bg-[#171722] border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          {/* Play / Pause */}
          <button
            onClick={handleTogglePlay}
            className={`p-2 rounded-lg font-bold transition flex items-center justify-center text-xs shadow-lg ${
              isPlaying
                ? "bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/20"
                : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20"
            }`}
            title={isPlaying ? "Pausar Simulação" : "Simular 3D"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          {/* Stop / Parar */}
          <button
            onClick={handleStop}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-300 border border-zinc-700 transition text-xs flex items-center justify-center"
            title="Parar e voltar ao início"
          >
            <Square className="w-3.5 h-3.5 fill-current text-red-400" />
          </button>

          {/* Single Block (Avançar Bloco) */}
          <button
            onClick={handleStepForward}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition text-xs flex items-center justify-center"
            title="Avançar 1 Bloco (Single Block) e destacar linha no programa"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Régua de Medição (Dois Pontos) */}
          <button
            onClick={toggleMeasuring}
            className={`p-2 rounded-lg transition border flex items-center justify-center ${
              isMeasuring
                ? "bg-pink-950/40 text-pink-400 border-pink-500/60 animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.3)]"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
            }`}
            title="Régua de Medição 3D (Medir distância entre dois pontos)"
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>

          {/* Régua Angular */}
          <button
            onClick={toggleMeasuringAngle}
            className={`p-2 rounded-lg transition border flex items-center justify-center ${
              isMeasuringAngle
                ? "bg-amber-950/40 text-amber-400 border-amber-500/60 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
            }`}
            title="Régua Angular 3D (Medir ângulo entre pontos)"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>

          {/* Congelar Gráfico */}
          <button
            onClick={() => setIsFrozen(!isFrozen)}
            className={`p-2 rounded-lg transition border flex items-center justify-center ${
              isFrozen
                ? "bg-blue-950/40 text-blue-400 border-blue-500/60 animate-pulse font-bold shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
            }`}
            title="Congelar Gráfico 3D (Manter desenho estático ao editar o código)"
          >
            <Snowflake className={`w-3.5 h-3.5 ${isFrozen ? "animate-spin-slow text-blue-400" : ""}`} />
          </button>
        </div>

        {/* Timeline Slider */}
        <div className="flex-1 flex items-center gap-2 min-w-[100px] max-w-xs">
          <input
            type="range"
            min={0}
            max={Math.max(0, trajectoryPoints.length - 1)}
            value={currentStepIdx}
            onChange={(e) => handleStepChange(parseInt(e.target.value, 10))}
            className="flex-1 accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap">
            {currentStepIdx + 1}/{trajectoryPoints.length}
          </span>
        </div>

        {/* Potenciômetro de Velocidade (0% a 100%) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-400 tracking-tight flex items-center gap-1 select-none">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            POTENCIÔMETRO:
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={simSpeed}
            onChange={(e) => setSimSpeed(parseInt(e.target.value, 10))}
            className="w-20 md:w-28 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400 hover:accent-amber-300 transition"
            title="Ajustar velocidade da simulação (0% a 100%)"
          />
          <span className="text-[10px] font-mono font-bold text-amber-400 w-8 text-right">
            {simSpeed}%
          </span>
        </div>
      </div>
    </div>
  );
};

interface CNCSimulator3DErrorBoundaryState {
  hasError: boolean;
  error: string;
}

// React Error Boundary Wrapper for 3D Renderer (Prevents white screen on WebGL/render errors)
class CNCSimulator3DErrorBoundary extends Component<
  CNCSimulator3DProps,
  CNCSimulator3DErrorBoundaryState
> {
  public declare props: CNCSimulator3DProps;
  public declare state: CNCSimulator3DErrorBoundaryState;
  public declare setState: (state: Partial<CNCSimulator3DErrorBoundaryState>) => void;

  constructor(props: CNCSimulator3DProps) {
    super(props);
    this.state = {
      hasError: false,
      error: "",
    };
  }

  public static getDerivedStateFromError(error: Error): CNCSimulator3DErrorBoundaryState {
    return { hasError: true, error: error?.message || "Erro de renderização WebGL / 3D." };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Erro no Simulador 3D:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-[#0b0b12] text-white p-6 text-center border border-zinc-800 rounded-xl select-none">
          <div className="p-3 bg-red-500/20 text-red-400 rounded-full mb-3 border border-red-500/30">
            <Box className="w-8 h-8 animate-pulse" />
          </div>
          <h3 className="text-sm font-bold text-red-400 mb-1 uppercase tracking-wider">
            Simulador 3D - Recuperação de Erro
          </h3>
          <p className="text-xs text-zinc-400 mb-4 max-w-md font-mono">
            {this.state.error}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: "" })}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition shadow-lg flex items-center gap-1.5"
            >
              🔄 Recarregar Simulador 3D
            </button>
            {this.props.onClose && (
              <button
                onClick={this.props.onClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-lg text-xs transition"
              >
                Ocultar 3D
              </button>
            )}
          </div>
        </div>
      );
    }
    return <CNCSimulator3DContent {...this.props} />;
  }
}

export const CNCSimulator3D: React.FC<CNCSimulator3DProps> = (props) => {
  return <CNCSimulator3DErrorBoundary {...props} />;
};
