import React, { useRef, useEffect, useState, useMemo } from "react";
import { Play, Pause, AlertTriangle, Square, ChevronRight, SkipForward, HelpCircle, Sun, Moon, Ruler, Compass, Snowflake, Target, Clock, Gauge, Lock, Unlock } from "lucide-react";
import { GCodeCommand, SimulationPlotItem, Point2D } from "../types";
import { calculateCycleTimeDetailed, formatCycleTime, loadMachineParams, saveMachineParams, MachineParams } from "../utils/cycleTimeCalculator";
import { ResizableBox } from "./ResizableBox";
import { CycleTimePanel } from "./CycleTimePanel";

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
  bgColor?: string; // Cor de fundo do gráfico escolhida em "Aparência" (opcional)
  cursorStyle?: CursorStyle; // cores e tamanho da mira e do quadradinho do desenho (Aparência)
  // Painel ▶ Programa da peça: escolher a REGIÃO de cada operação clicando na peça e mostrar as regiões
  regiaoModo?: "cf" | "linha" | null; // cf = toque no começo e no fim | linha = toque em cada linha do perfil
  onRegiaoPick?: (r: { z: number; x: number; za?: number; zb?: number }) => void;
  regioes?: { cor: string; faixas: [number, number][]; ativa: boolean }[];
  fixComando?: { seq: number; zones: { lado: 1 | 2; za: number; zb: number; d: number }[] } | null; // painel liga/desliga fixações
  partLayers?: { id: string; label: string; color: string; dashed: boolean; curves: { x: number; z: number }[][] }[]; // Peça e bruto do STEP
  onInsertPoint?: (x: number, z: number) => void; // PG: ponto tocado no perfil vai para o programa
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
  bgColor,
  cursorStyle,
  regiaoModo,
  onRegiaoPick,
  regioes,
  fixComando,
  partLayers,
  onInsertPoint,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Touch references for zooming/panning on mobile and tablet
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(8);
  const touchStartPanRef = useRef<Point2D>({ x: 0, y: 0 });
  const touchDragStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const isTouchPanningRef = useRef<boolean>(false);
  const touchHasMovedRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<Point2D>({ x: 0, y: 0 });
  
  // Transform / Camera State
  const [zoom, setZoom] = useState<number>(8);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const [isThemeDark, setIsThemeDark] = useState<boolean>(true);
  // Se uma cor de fundo foi escolhida em "Aparência", ajusta linhas/textos do gráfico para manter contraste
  useEffect(() => {
    if (!bgColor) return;
    const h = bgColor.replace("#", "");
    if (h.length !== 6) return;
    const lum = 0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16);
    setIsThemeDark(lum < 140);
  }, [bgColor]);
  // cores e tamanho da mira / quadradinho do desenho (vem da janela "Aparência")
  const cur: CursorStyle = { ...CURSOR_STYLE_PADRAO, ...(cursorStyle || {}) };

  // Measuring overlay states
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [isMeasuringAngle, setIsMeasuringAngle] = useState<boolean>(false);
  const [angleStartLine, setAngleStartLine] = useState<SimulationPlotItem | null>(null);
  const [angleEndLine, setAngleEndLine] = useState<SimulationPlotItem | null>(null);
  
  const [measureStartPoint, setMeasureStartPoint] = useState<{ latheX: number; latheZ: number; canvasX: number; canvasY: number } | null>(null);
  const [measureEndPoint, setMeasureEndPoint] = useState<{ latheX: number; latheZ: number; canvasX: number; canvasY: number } | null>(null);
  const [mousePos, setMousePos] = useState<Point2D | null>(null);
  const [measurePanelPos, setMeasurePanelPos] = useState<Point2D>({ x: 12, y: 100 });
  const [isDraggingMeasurePanel, setIsDraggingMeasurePanel] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<Point2D>({ x: 0, y: 0 });

  // High precision mouse hover / snap coordinate tracking ("Mirinha")
  interface HoveredPointInfo {
    canvasX: number;
    canvasY: number;
    latheX: number;
    latheZ: number;
    gcodeLine: number;
    gcodeText: string;
    isVertex?: boolean;
    plotItem?: SimulationPlotItem;
    partLayer?: string; // "PEÇA" ou "BRUTO" quando a mira está numa linha do STEP
  }
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointInfo | null>(null);
  // PG: tocar em pontos da peça e levar para o programa
  const [pgMode, setPgMode] = useState<boolean>(false);
  // Traços de movimento de usinagem do programa: ligado/desligado (fica gravado no aparelho)
  const [showToolpath, setShowToolpath] = useState<boolean>(() => {
    try { return localStorage.getItem("cnc_showToolpath") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("cnc_showToolpath", showToolpath ? "1" : "0"); } catch {}
  }, [showToolpath]);
  const [pgMsg, setPgMsg] = useState<string | null>(null);
  // ===== FIXAÇÃO (zona proibida): onde a peça é presa no lado 1 e no lado 2 =====
  type FixZone = { lado: 1 | 2; za: number; zb: number; d: number };
  const [fixMode, setFixMode] = useState<boolean>(false);
  const [fixZones, setFixZones] = useState<FixZone[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("cnc_fixacoes2D") || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  const [fixLado, setFixLado] = useState<1 | 2>(() => {
    try { return localStorage.getItem("cnc_fixLado2D") === "2" ? 2 : 1; } catch { return 1; }
  });
  const [fixFolga, setFixFolga] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem("cnc_fixFolga2D") || "1"); return isNaN(v) ? 1 : v; } catch { return 1; }
  });
  const [fixDraft, setFixDraft] = useState<{ z: number; d: number } | null>(null); // 1º toque (começo da pega)
  const [fixMsg, setFixMsg] = useState<string | null>(null);
  // painel ▶ Programa da peça manda ligar/desligar as fixações
  useEffect(() => {
    if (fixComando) setFixZones(fixComando.zones);
  }, [fixComando ? fixComando.seq : -1]);
  useEffect(() => {
    try {
      localStorage.setItem("cnc_fixacoes2D", JSON.stringify(fixZones));
      localStorage.setItem("cnc_fixLado2D", String(fixLado));
      localStorage.setItem("cnc_fixFolga2D", String(fixFolga));
    } catch { /* sem armazenamento */ }
  }, [fixZones, fixLado, fixFolga]);
  const [showMirinha, setShowMirinha] = useState<boolean>(() => {
    return localStorage.getItem("cnc_showMirinha2D") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("cnc_showMirinha2D", String(showMirinha));
  }, [showMirinha]);

  // MIRA FIXA: 1º clique no botão Mira = painel fica FIXO na tela e pode ser arrastado; 2º clique = desliga
  const [miraFixa, setMiraFixa] = useState<boolean>(() => localStorage.getItem("cnc_miraFixa2D") === "true");
  const [miraPos, setMiraPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const v = localStorage.getItem("cnc_miraPos2D");
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  const [miraUltimoPonto, setMiraUltimoPonto] = useState<HoveredPointInfo | null>(null);
  const miraDragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => { localStorage.setItem("cnc_miraFixa2D", String(miraFixa)); }, [miraFixa]);
  useEffect(() => { if (miraPos) localStorage.setItem("cnc_miraPos2D", JSON.stringify(miraPos)); }, [miraPos]);
  // Guarda o último ponto mirado, para o painel fixo continuar mostrando quando o dedo/mouse sai do gráfico
  useEffect(() => { if (hoveredPoint) setMiraUltimoPonto(hoveredPoint); }, [hoveredPoint]);

  // Arrastar o painel fixo da Mira para qualquer lugar do gráfico
  const handleMiraPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget;
    const parent = box.offsetParent as HTMLElement | null;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    miraDragRef.current = { dx: e.clientX - br.left, dy: e.clientY - br.top };
    if (!miraPos) setMiraPos({ x: br.left - pr.left, y: br.top - pr.top });
    try { box.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.stopPropagation();
  };
  const handleMiraPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!miraDragRef.current) return;
    const parent = e.currentTarget.offsetParent as HTMLElement | null;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const x = Math.max(0, Math.min(pr.width - 40, e.clientX - pr.left - miraDragRef.current.dx));
    const y = Math.max(0, Math.min(pr.height - 30, e.clientY - pr.top - miraDragRef.current.dy));
    setMiraPos({ x, y });
    e.stopPropagation();
  };
  const handleMiraPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    miraDragRef.current = null;
    e.stopPropagation();
  };

  // Playback Driver State
  const [driverSpeed, setDriverSpeed] = useState<number>(70); // 0 to 100
  const [driverTick, setDriverTick] = useState<number>(-1); // Represents active simulated line ID
  const [linesWithDrawing, setLinesWithDrawing] = useState<number[]>([]);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 500, height: 450 });

  // Freeze Graphic State ("Congelar Gráfico")
  const [isFrozen, setIsFrozen] = useState<boolean>(false);

  // ===== DESENHO NO GRÁFICO (Linha, Círculo, Arco, Ponto e Cota inteligente — igual SolidWorks) =====
  const [sketchOpen, setSketchOpen] = useState<boolean>(false);
  const [sketchTool, setSketchTool] = useState<SketchTool>("none");
  const [sketchEnts, setSketchEnts] = useState<SketchEnt[]>(() => {
    try { return JSON.parse(localStorage.getItem("cnc_sketch2D") || "[]"); } catch { return []; }
  });
  const [sketchDraft, setSketchDraft] = useState<SkPt[]>([]);
  const [sketchHover, setSketchHover] = useState<{ p: SkPt; tag?: string; snapped?: boolean; vertex?: boolean } | null>(null);
  const [sketchDim, setSketchDim] = useState<{ id: string; left: number; top: number; a: string; b: string; labelA: string; labelB?: string } | null>(null);
  const sketchHistRef = useRef<SketchEnt[][]>([]);
  useEffect(() => {
    try { localStorage.setItem("cnc_sketch2D", JSON.stringify(sketchEnts)); } catch {}
  }, [sketchEnts]);
  const sketchPush = () => {
    sketchHistRef.current.push(sketchEnts);
    if (sketchHistRef.current.length > 60) sketchHistRef.current.shift();
  };
  const sketchView = (cnv: HTMLCanvasElement): SketchView => ({
    oX: cnv.width / 2 + 50 + panX,
    oY: cnv.height / 2 + 50 + panY,
    zoom,
    s: simInvertZ ? -1 : 1,
  });
  // Ponto do desenho: gruda nas pontas/centros, nas linhas da peça (STEP) e trava H / V / paralela
  const sketchPick = (mx: number, my: number, cnv: HTMLCanvasElement): { p: SkPt; tag?: string; snapped?: boolean; vertex?: boolean } => {
    const T = sketchView(cnv);
    const draftAsPts: SketchEnt[] = sketchDraft.map((p, i) => ({ id: "d" + i, type: "point", p: [p] }));
    const k = skSnapKey(sketchEnts.concat(draftAsPts), mx, my, T, 10);
    if (k) return { p: k, snapped: true, vertex: true }; // ponta / centro do desenho = canto
    const ps = findPartSnap(mx, my, cnv, 10);
    if (ps) return { p: skToWorld(ps.canvasX, ps.canvasY, T), snapped: true, vertex: !!ps.isVertex }; // gruda na linha da peça (em cima ou no espelho de baixo)
    const raw = skToWorld(mx, my, T);
    if (sketchTool === "line" && sketchDraft.length) return skInferLine(sketchDraft[sketchDraft.length - 1], raw, sketchEnts);
    return { p: raw };
  };
  const sketchCanvasXY = (e: { clientX: number; clientY: number }) => {
    const cnv = canvasRef.current;
    if (!cnv) return null;
    const rc = cnv.getBoundingClientRect();
    return {
      cnv,
      mx: rc.width > 0 ? ((e.clientX - rc.left) / rc.width) * cnv.width : 0,
      my: rc.height > 0 ? ((e.clientY - rc.top) / rc.height) * cnv.height : 0,
      cssX: e.clientX - rc.left,
      cssY: e.clientY - rc.top,
      cssW: rc.width,
    };
  };
  const sketchSetTool = (t: SketchTool) => {
    setSketchTool(t);
    setSketchDraft([]);
    setSketchDim(null);
    setSketchHover(null);
    if (t !== "none") { setPgMode(false); setIsMeasuring(false); setIsMeasuringAngle(false); }
  };
  const sketchToggleMenu = () => {
    const v = !sketchOpen;
    setSketchOpen(v);
    if (!v) sketchSetTool("none");
  };
  const handleSketchClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = sketchCanvasXY(e);
    if (!c) return;
    const { cnv, mx, my } = c;
    if (sketchTool === "dim" || sketchTool === "erase") {
      const hit = skHit(sketchEnts, mx, my, sketchView(cnv), 12);
      if (!hit) { setSketchDim(null); return; }
      if (sketchTool === "erase") {
        sketchPush();
        setSketchEnts((arr) => arr.filter((x) => x.id !== hit.id));
        return;
      }
      const m = skMeasure(hit);
      const fmt = (v: number) => String(parseFloat(v.toFixed(3)));
      setSketchDim({
        id: hit.id,
        left: Math.max(4, Math.min(c.cssX + 12, c.cssW - 200)),
        top: Math.max(4, c.cssY - 10),
        a: fmt(m.a),
        b: m.b !== undefined ? fmt(m.b) : "",
        labelA: m.labelA,
        labelB: m.labelB,
      });
      return;
    }
    const sp = sketchPick(mx, my, cnv).p;
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const add = (ent: Omit<SketchEnt, "id">) => { sketchPush(); setSketchEnts((arr) => [...arr, { ...ent, id: newId() }]); };
    if (sketchTool === "point") { add({ type: "point", p: [sp] }); return; }
    const d = [...sketchDraft, sp];
    if (sketchTool === "line") {
      if (d.length >= 2) {
        const a = d[d.length - 2];
        if (Math.hypot(sp.z - a.z, sp.r - a.r) < 1e-6) { setSketchDraft([]); return; } // tocou 2x no mesmo ponto: para
        add({ type: "line", p: [a, sp] });
        setSketchDraft([sp]); // continua emendando a próxima linha (igual SolidWorks)
      } else setSketchDraft(d);
      return;
    }
    if (sketchTool === "circle") {
      if (d.length >= 2) {
        if (Math.hypot(d[1].z - d[0].z, d[1].r - d[0].r) > 1e-6) add({ type: "circle", p: [d[0], d[1]] });
        setSketchDraft([]);
      } else setSketchDraft(d);
      return;
    }
    if (sketchTool === "arc") {
      if (d.length >= 3) { add({ type: "arc", p: [d[0], d[1], d[2]] }); setSketchDraft([]); }
      else setSketchDraft(d);
    }
  };
  const applySketchDim = () => {
    if (!sketchDim) return;
    const a = skParse(sketchDim.a);
    const b = sketchDim.b !== "" ? skParse(sketchDim.b) : undefined;
    if (!isFinite(a)) return;
    sketchPush();
    setSketchEnts((arr) => skApplyDim(arr, sketchDim.id, a, b));
    setSketchDim(null);
  };
  const sketchUndo = () => {
    const prev = sketchHistRef.current.pop();
    if (prev) setSketchEnts(prev);
    setSketchDraft([]);
    setSketchDim(null);
  };
  // Esc: 1º para a linha que está desenhando, 2º solta a ferramenta
  useEffect(() => {
    if (sketchTool === "none") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (sketchDraft.length) setSketchDraft([]);
      else { setSketchTool("none"); setSketchHover(null); }
      setSketchDim(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sketchTool, sketchDraft.length]);

  // Cycle Time Calibration Factor (Potentiometer percentage: 20% to 180%, default 100%)
  const [cycleTimeFactor, setCycleTimeFactor] = useState<number>(() => {
    const saved = localStorage.getItem("cnc_cycleTimeFactor");
    return saved ? parseInt(saved, 10) : 100;
  });

  const [isCycleTimeLocked, setIsCycleTimeLocked] = useState<boolean>(() => {
    return localStorage.getItem("cnc_cycleTimeLocked") === "true";
  });

  useEffect(() => {
    localStorage.setItem("cnc_cycleTimeFactor", String(cycleTimeFactor));
  }, [cycleTimeFactor]);

  useEffect(() => {
    localStorage.setItem("cnc_cycleTimeLocked", String(isCycleTimeLocked));
  }, [isCycleTimeLocked]);

  // Compute Base Physical Cycle Time and Calibrated Adjusted Cycle Time
  // Parâmetros da máquina (rápidos, trocas, troca de peça...) - salvos no tablet
  const [machineParams, setMachineParams] = useState<MachineParams>(() => loadMachineParams());
  const [showCyclePanel, setShowCyclePanel] = useState<boolean>(false);
  const handleChangeMachineParams = (p: MachineParams) => {
    setMachineParams(p);
    saveMachineParams(p);
  };

  const cycleTimeDetails = useMemo(() => {
    return calculateCycleTimeDetailed(gcodeText, undefined, undefined, machineParams);
  }, [gcodeText, machineParams]);

  const adjustedCycleTimeSec = useMemo(() => {
    return cycleTimeDetails.totalSeconds * (cycleTimeFactor / 100);
  }, [cycleTimeDetails, cycleTimeFactor]);

  const formattedCycleTime = useMemo(() => {
    return formatCycleTime(adjustedCycleTimeSec, false);
  }, [adjustedCycleTimeSec]);

  const formattedCycleTimeTenths = useMemo(() => {
    return formatCycleTime(adjustedCycleTimeSec, true);
  }, [adjustedCycleTimeSec]);

  // Zoom no scroll do mouse — suave (estilo SolidWorks): junta os "cliques" da rodinha
  // e aplica uma vez por quadro de tela, com zoom proporcional ao giro (touchpad fica fino)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const wheelAccRef = useRef<{ dy: number; x: number; y: number; raf: number }>({ dy: 0, x: 0, y: 0, raf: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault(); // não deixa a página rolar junto com o zoom
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33; // rolagem por linhas
      else if (e.deltaMode === 2) dy *= 400; // rolagem por página
      if (!dy) return;
      const acc = wheelAccRef.current;
      const rect = canvas.getBoundingClientRect();
      acc.dy += dy;
      acc.x = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * canvas.width : 0;
      acc.y = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * canvas.height : 0;
      if (acc.raf) return;
      acc.raf = requestAnimationFrame(() => {
        const a = wheelAccRef.current;
        a.raf = 0;
        const d = Math.max(-500, Math.min(500, a.dy));
        a.dy = 0;
        if (!d) return;
        const prevZoom = zoomRef.current;
        // 1 clique normal da rodinha (100) = cerca de 15% de zoom, igual antes
        const newZoom = Math.min(Math.max(prevZoom * Math.exp(-d * 0.0014), 0.2), 5000); // zoom máximo bem maior (para ver chanfros e raios pequenos de perto)
        if (newZoom === prevZoom) return;
        zoomRef.current = newZoom;
        const cX = canvas.width / 2 + 50;
        const cY = canvas.height / 2 + 50;
        const k = 1 - newZoom / prevZoom; // mantém parado o ponto que está embaixo do mouse
        setPanX((p) => p + (a.x - cX - p) * k);
        setPanY((p) => p + (a.y - cY - p) * k);
        setZoom(newZoom);
      });
    };
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  });

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (sketchTool !== "none" && e.button === 0) return; // desenhando: botão esquerdo desenha, botão do meio move
    // Check if middle click or standard click
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  // Touch handlers for mobile and tablet zooming/panning
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    touchHasMovedRef.current = false;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      isTouchPanningRef.current = true;
      touchDragStartRef.current = { x: touch.clientX - panX, y: touch.clientY - panY };
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      isTouchPanningRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
      touchStartPanRef.current = { x: panX, y: panY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.touches.length === 1 && isTouchPanningRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      
      if (Math.hypot(dx, dy) > 5) {
        touchHasMovedRef.current = true;
      }

      if (touchHasMovedRef.current) {
        if (e.cancelable) {
          e.preventDefault();
        }
        setPanX(touch.clientX - touchDragStartRef.current.x);
        setPanY(touch.clientY - touchDragStartRef.current.y);
        setHoveredPoint(null);
      }
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      touchHasMovedRef.current = true;
      if (e.cancelable) {
        e.preventDefault();
      }

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (currentDist === 0) return;

      const zoomFactor = currentDist / touchStartDistRef.current;
      
      setZoom((prevZoom) => {
        const newZoom = Math.min(Math.max(touchStartZoomRef.current * zoomFactor, 0.2), 5000);
        if (newZoom === prevZoom) return prevZoom;

        const rect = canvas.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        
        const canvasX = midX - rect.left;
        const canvasY = midY - rect.top;

        const cX = canvas.width / 2 + 50;
        const cY = canvas.height / 2 + 50;

        const initPanX = touchStartPanRef.current.x;
        const initPanY = touchStartPanRef.current.y;
        const initZoom = touchStartZoomRef.current;

        setPanX(initPanX + (canvasX - cX - initPanX) * (1 - newZoom / initZoom));
        setPanY(initPanY + (canvasY - cY - initPanY) * (1 - newZoom / initZoom));

        return newZoom;
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (touchHasMovedRef.current && e.cancelable) {
      e.preventDefault();
    }

    if (e.touches.length === 0) {
      isTouchPanningRef.current = false;
      touchStartDistRef.current = null;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      isTouchPanningRef.current = true;
      touchDragStartRef.current = { x: touch.clientX - panX, y: touch.clientY - panY };
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      isTouchPanningRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
      touchStartPanRef.current = { x: panX, y: panY };
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

  // Mira nas linhas da PEÇA / BRUTO (STEP): acha o ponto mais perto e diz o que é (diâmetro, face, chanfro/cone, raio)
  const findPartSnap = (mouseX: number, mouseY: number, canvas: HTMLCanvasElement, maxDist: number) => {
    if (!partLayers || !partLayers.length) return null;
    const zDirSign = simInvertZ ? -1 : 1;
    const originX = canvas.width / 2 + 50 + panX;
    const originY = canvas.height / 2 + 50 + panY;
    let bestD = maxDist;
    let best: { cx: number; cy: number; layer: string; curve: { x: number; z: number }[]; sgn: number } | null = null;
    for (const L of partLayers) {
      for (const c of L.curves) {
        for (const sgn of [1, -1]) {
          for (let i = 0; i < c.length - 1; i++) {
            const x1 = originX + c[i].z * zoom * zDirSign;
            const y1 = originY - sgn * (c[i].x / 2) * zoom;
            const x2 = originX + c[i + 1].z * zoom * zDirSign;
            const y2 = originY - sgn * (c[i + 1].x / 2) * zoom;
            const res = getDistanceToSegment(mouseX, mouseY, x1, y1, x2, y2);
            if (res.distance < bestD) {
              bestD = res.distance;
              best = { cx: res.x, cy: res.y, layer: L.label, curve: c, sgn };
            }
          }
        }
      }
    }
    if (!best) return null;
    const c = best.curve;
    let cx = best.cx;
    let cy = best.cy;
    let isVertex = false;
    // encaixa nas pontas da linha (cantos da peça)
    for (const p of [c[0], c[c.length - 1]]) {
      const px = originX + p.z * zoom * zDirSign;
      const py = originY - best.sgn * (p.x / 2) * zoom;
      if (Math.hypot(px - cx, py - cy) < 8) {
        cx = px;
        cy = py;
        isVertex = true;
      }
    }
    const latheZ = (cx - originX) / (zoom * zDirSign);
    const latheX = Math.abs((cy - originY) / zoom) * 2;
    const f3 = (n: number) => n.toFixed(3);
    let desc = "";
    if (c.length > 2) {
      // arco: raio pela circunferência que passa pelo início, meio e fim
      const a = c[0];
      const m = c[Math.floor(c.length / 2)];
      const b = c[c.length - 1];
      const ax = a.z, ay = a.x / 2, bx = m.z, by = m.x / 2, qx = b.z, qy = b.x / 2;
      const dd = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
      let R = 0;
      if (Math.abs(dd) > 1e-9) {
        const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / dd;
        const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / dd;
        R = Math.hypot(ax - ux, ay - uy);
      }
      desc = `RAIO R${f3(R)}`;
    } else {
      const p = c[0];
      const q = c[1];
      const dz = Math.abs(q.z - p.z);
      const dr = Math.abs(q.x - p.x) / 2;
      if (dz < 1e-4) desc = `FACE Z${f3(p.z)} (Ø${f3(Math.min(p.x, q.x))} a Ø${f3(Math.max(p.x, q.x))})`;
      else if (dr < 1e-4) desc = `DIÂMETRO Ø${f3(p.x)} (comprimento ${f3(dz)})`;
      else desc = `CHANFRO/CONE ${((Math.atan2(dr, dz) * 180) / Math.PI).toFixed(2)}° (Ø${f3(Math.min(p.x, q.x))} a Ø${f3(Math.max(p.x, q.x))})`;
    }
    return { canvasX: cx, canvasY: cy, latheX, latheZ, isVertex, layer: best.layer, desc, dist: bestD };
  };
  // MIRA / PG: junta as linhas da PEÇA (STEP) e as linhas/pontas do DESENHO; cantos e pontas têm prioridade
  type PickSnap = { canvasX: number; canvasY: number; latheX: number; latheZ: number; isVertex: boolean; desc: string; layer: string; dist: number; score: number };
  const findPickSnap = (mx: number, my: number, cnv: HTMLCanvasElement, maxDist: number): PickSnap | null => {
    let best: PickSnap | null = null;
    const take = (r: PickSnap) => {
      if (!best || r.score < best.score) best = r;
    };
    const ps = findPartSnap(mx, my, cnv, maxDist);
    if (ps) take({ canvasX: ps.canvasX, canvasY: ps.canvasY, latheX: ps.latheX, latheZ: ps.latheZ, isVertex: ps.isVertex, desc: ps.desc, layer: ps.layer, dist: ps.dist, score: ps.isVertex ? -100 + ps.dist : ps.dist });
    if (sketchEnts && sketchEnts.length) {
      const T = sketchView(cnv);
      const kp = skSnapKey(sketchEnts, mx, my, T, 14);
      if (kp) {
        const s = skToScreen(kp, T);
        const d = Math.hypot(s.x - mx, s.y - my);
        take({ canvasX: s.x, canvasY: s.y, latheX: Math.abs(kp.r) * 2, latheZ: kp.z, isVertex: true, desc: "DESENHO: ponta / canto", layer: "DESENHO", dist: d, score: -100 + d });
      }
      sketchEnts.forEach((en) => {
        if (en.type !== "line" || en.p.length < 2) return;
        const a = skToScreen(en.p[0], T);
        const b = skToScreen(en.p[1], T);
        const res = getDistanceToSegment(mx, my, a.x, a.y, b.x, b.y);
        if (res.distance < maxDist) {
          const w = skToWorld(res.x, res.y, T);
          take({ canvasX: res.x, canvasY: res.y, latheX: Math.abs(w.r) * 2, latheZ: w.z, isVertex: false, desc: "DESENHO: linha", layer: "DESENHO", dist: res.distance, score: res.distance });
        }
      });
    }
    return best as PickSnap | null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
      setHoveredPoint(null);
      return;
    }

    // Desenho ligado: só acompanha o ponto do mouse (com imã)
    if (sketchTool !== "none") {
      const c = sketchCanvasXY(e);
      if (c) setSketchHover(sketchPick(c.mx, c.my, c.cnv));
      return;
    }

    if (!showMirinha && !pgMode && !fixMode && !regiaoModo) {
      if (hoveredPoint) setHoveredPoint(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * canvas.width : 0;
    const mouseY = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * canvas.height : 0;

    if (isMeasuring || isMeasuringAngle) {
      setMousePos({ x: mouseX, y: mouseY });
    }

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

    // Linhas da peça/bruto (STEP) também entram na mira; vale a que estiver mais perto (no PG, sempre a peça)
    const partSnap = findPickSnap(mouseX, mouseY, canvas, pgMode ? 45 : 35); // peça (STEP) + desenho
    if (partSnap && (pgMode || fixMode || !!regiaoModo || !closestItem || partSnap.dist < minDistance)) {
      setHoveredPoint({
        canvasX: partSnap.canvasX,
        canvasY: partSnap.canvasY,
        latheX: partSnap.latheX,
        latheZ: partSnap.latheZ,
        gcodeLine: -1,
        gcodeText: partSnap.desc,
        isVertex: partSnap.isVertex,
        partLayer: partSnap.layer,
      });
      return;
    }

    if (closestItem) {
      const x1 = originX + closestItem.z1 * zoom * zDirSign;
      const y1 = originY - closestItem.x1 * zoom;
      const x2 = originX + closestItem.z2 * zoom * zDirSign;
      const y2 = originY - closestItem.x2 * zoom;

      const distToP1 = Math.hypot(closestPoint.x - x1, closestPoint.y - y1);
      const distToP2 = Math.hypot(closestPoint.x - x2, closestPoint.y - y2);

      let isVertex = false;
      let snapX = closestPoint.x;
      let snapY = closestPoint.y;

      if (distToP1 < 8) {
        snapX = x1;
        snapY = y1;
        isVertex = true;
      } else if (distToP2 < 8) {
        snapX = x2;
        snapY = y2;
        isVertex = true;
      }

      // Calculate lathe coordinate of the exact snapped point
      const latheZ = (snapX - originX) / (zoom * zDirSign);
      const latheRadius = -(snapY - originY) / zoom;
      const latheX = latheRadius * 2; // Diameter

      // Find original line text
      const lines = gcodeText.split("\n");
      const lineIdx = Math.floor(closestItem.linhaId);
      const rawText = lines[lineIdx] || "";

      setHoveredPoint({
        canvasX: snapX,
        canvasY: snapY,
        latheX,
        latheZ,
        gcodeLine: lineIdx,
        gcodeText: rawText.trim(),
        isVertex,
        plotItem: closestItem
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
  function parseGCode(): { plotList: SimulationPlotItem[]; activeLineIndexes: number[]; error?: string } {
    try {
    const lines = gcodeText.split("\n");
    let currentGMode = 0; // Standard travel G00
    let lastG71_Line1: { u: number; r: number; lineIndex: number } | null = null;
    let lastG74_Line1: { r: number; lineIndex: number } | null = null;
    let commands: GCodeCommand[] = [];
    let skipTarget: number | null = null;

    // First, pass to gather clean commands
    lines.forEach((lineText, idx) => {
      let trimmed = lineText.trim();
      if (trimmed.startsWith(";")) return; // Skip complete comment lines starting with semicolon
      let clean = trimmed.replace(/\(.*?\)/g, "").trim(); // Remove brackets comments
      if (!clean) return;

      // Check if we are currently skipping because of a previous GOTO
      if (skipTarget !== null) {
        // Look for the sequence block starting with N target
        const matchN = clean.match(/N\s*(\d+)/i);
        if (matchN && parseInt(matchN[1], 10) === skipTarget) {
          // Found target block! Stop skipping and process this N line
          skipTarget = null;
        } else {
          // Still skipping
          return;
        }
      }

      // Check if this line itself triggers a GOTO jump
      const gotoMatch = clean.match(/GOTO\s*(\d+)/i);
      if (gotoMatch) {
        const targetNum = parseInt(gotoMatch[1], 10);
        // Ensure the target N exists ahead in the program so we don't skip forever on a typo
        let targetExists = false;
        for (let j = idx + 1; j < lines.length; j++) {
          const checkTrimmed = lines[j].trim();
          const checkClean = checkTrimmed.replace(/\(.*?\)/g, "").trim();
          const checkN = checkClean.match(/N\s*(\d+)/i);
          if (checkN && parseInt(checkN[1], 10) === targetNum) {
            targetExists = true;
            break;
          }
        }
        if (targetExists) {
          skipTarget = targetNum;
          return; // Skip the GOTO command line itself
        }
      }

      const gMatches = clean.match(/G\s*(\d+)/g);
      if (gMatches) {
        gMatches.forEach((gStr) => {
          const num = parseInt(gStr.replace("G", "").trim(), 10);
          if ([0, 1, 2, 3, 70, 71, 74, 75, 76, 80, 83, 84, 96, 97].includes(num)) {
            currentGMode = num;
          }
        });
      }

      // Modifier ,R and ,C for chamfers/radii
      const commaRMatch = clean.match(/,R\s*(-?\d*\.?\d+)/i);
      const commaCMatch = clean.match(/,C\s*(-?\d*\.?\d+)/i);
      const temp = clean.replace(/,[RC]\s*-?\d*\.?\d+/gi, "");

      const isG4Dwell = /G\s*0?4(?![0-9])/i.test(clean);

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
        x: (matchX && !isG4Dwell) ? parseFloat(matchX[1]) : null,
        z: matchZ ? parseFloat(matchZ[1]) : null,
        r: matchR ? parseFloat(matchR[1]) : null,
        commaR: commaRMatch ? parseFloat(commaRMatch[1]) : null,
        commaC: commaCMatch ? parseFloat(commaCMatch[1]) : null,
        n: matchN ? parseInt(matchN[1], 10) : null,
        p: matchP ? parseInt(matchP[1], 10) : null,
        q: matchQ ? parseInt(matchQ[1], 10) : null,
        u: (matchU && !isG4Dwell) ? parseFloat(matchU[1]) : null,
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

    const renderStandardMove = (cmd: GCodeCommand, forceColor?: string, idOffset: number = 0, cmdIndex?: number) => {
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
          const currentIdx = cmdIndex !== undefined ? cmdIndex : commands.indexOf(cmd);
          const nextIdx = commands.findIndex((c, idx) => idx > currentIdx && (c.x !== null || c.z !== null));
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
                  radius: safeVal, color: moveColor, linhaId: cmd.linhaOriginal + 0.5 + idOffset,
                });
              } else {
                plotList.push({
                  type: "line", x1: p1x, z1: p1z, x2: p2x, z2: p2z,
                  color: moveColor, linhaId: cmd.linhaOriginal + 0.5 + idOffset,
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
        } else if (cmd.mode === 0 && Math.abs(tx - cx) > 1e-6 && Math.abs(tz - cz) > 1e-6) {
          // G00 NÃO-LINEAR (padrão Fanuc): os dois eixos andam juntos a 45° até um terminar, depois o outro segue reto
          const d = Math.min(Math.abs(tx - cx), Math.abs(tz - cz));
          const mx = cx + Math.sign(tx - cx) * d;
          const mz = cz + Math.sign(tz - cz) * d;
          plotList.push({ type: "line", x1: cx, z1: cz, x2: mx, z2: mz, color: moveColor, linhaId: cmd.linhaOriginal + idOffset });
          plotList.push({ type: "line", x1: mx, z1: mz, x2: tx, z2: tz, color: moveColor, linhaId: cmd.linhaOriginal + idOffset + 0.0001 });
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
            renderStandardMove(profileCmd, "#39ff14", 0.01 * (k - pIdx), k);
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

            // Reconstruct the programmed profile, including chamfers (,C) and radii (,R)
            for (let k = pIdx; k <= qIdx; k++) {
              const contCmd = commands[k];
              const targetX = contCmd.x !== null ? contCmd.x / 2 : px;
              const targetZ = contCmd.z !== null ? contCmd.z : pz;

              const isSingle = (contCmd.x !== null && contCmd.z === null) || (contCmd.z !== null && contCmd.x === null);
              const hasModifiers = isSingle && (contCmd.commaR !== null || contCmd.commaC !== null);

              if (hasModifiers) {
                const val = contCmd.commaR !== null ? contCmd.commaR : contCmd.commaC;
                // Find next coordinate change in profile
                let nextCmd: GCodeCommand | undefined = undefined;
                for (let nextK = k + 1; nextK <= qIdx; nextK++) {
                  if (commands[nextK].x !== null || commands[nextK].z !== null) {
                    nextCmd = commands[nextK];
                    break;
                  }
                }

                if (nextCmd && val !== null) {
                  const tx = targetX;
                  const tz = targetZ;
                  const nx = nextCmd.x !== null ? nextCmd.x / 2 : tx;
                  const nz = nextCmd.z !== null ? nextCmd.z : tz;

                  const dx1 = tx - px;
                  const dz1 = tz - pz;
                  const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);

                  const dx2 = nx - tx;
                  const dz2 = nz - tz;
                  const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

                  if (len1 > 0 && len2 > 0) {
                    const safeVal = Math.min(val, len1, len2);
                    const p1x = tx - (dx1 / len1) * safeVal;
                    const p1z = tz - (dz1 / len1) * safeVal;
                    const p2x = tx + (dx2 / len2) * safeVal;
                    const p2z = tz + (dz2 / len2) * safeVal;

                    profilePoints.push({ x: p1x, y: p1z });

                    if (contCmd.commaR !== null) {
                      // Approximate arc mid-point for radius calculation
                      const arcMidX = p1x * 0.25 + tx * 0.5 + p2x * 0.25;
                      const arcMidZ = p1z * 0.25 + tz * 0.5 + p2z * 0.25;
                      profilePoints.push({ x: arcMidX, y: arcMidZ });
                    }

                    profilePoints.push({ x: p2x, y: p2z });
                    px = p2x;
                    pz = p2z;
                    continue;
                  }
                }
              }

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

            const radAllowance = Math.abs(allowanceU) / 2;
            const limitX = isInternal 
              ? Math.max(...profilePoints.map((pt) => pt.x)) - radAllowance
              : Math.min(...profilePoints.map((pt) => pt.x)) + radAllowance;

            let passX = isInternal ? startX + absDepth : startX - absDepth;
            let passCount = 1;
            let lastToolX = startX;
            let lastToolZ = startZ;

            const isBetween = (val: number, a: number, b: number) => 
              val >= Math.min(a, b) - 0.001 && val <= Math.max(a, b) + 0.001;

            const getProfileIntersectionZ = (targetX: number): number | null => {
              // Traverse backwards to find the profile coordinate at targetX
              for (let k = profilePoints.length - 1; k > 0; k--) {
                const p1 = profilePoints[k - 1];
                const p2 = profilePoints[k];

                // Skip cylinder segments (constant X) if the tool coordinate targetX is on or past them
                if (Math.abs(p1.x - p2.x) < 0.001) {
                  const cylinderRadius = p1.x;
                  if (isInternal) {
                    // Internal boring: skip if targetX is on/outside the cylinder
                    if (targetX >= cylinderRadius - 0.001) continue;
                  } else {
                    // External turning: skip if targetX is on/inside the cylinder
                    if (targetX <= cylinderRadius + 0.001) continue;
                  }
                }

                if (isBetween(targetX, p1.x, p2.x)) {
                  if (Math.abs(p1.x - p2.x) < 0.001) return p2.y;
                  const factor = (targetX - p1.x) / (p2.x - p1.x);
                  return p1.y + factor * (p2.y - p1.y);
                }
              }
              return null;
            };

              // ===== G71 COMO NA MÁQUINA (Fanuc) =====
              // Cada passe: G00 em X até a profundidade -> G01 em Z até o perfil (+ sobremetal) -> recuo 45° (R)
              // -> G00 de volta ao Z inicial. No fim: passe seguindo o perfil (+U/2, +W) e volta ao ponto inicial.
              // Tipo II (1º bloco do perfil com X e Z): desbasta também os rebaixos.
              const tipo2 = commands[pIdx].x !== null && commands[pIdx].z !== null;
              const sgn = isInternal ? -1 : 1;
              const RAP = "#ff2a2a";
              const CUT = "#00f3ff";
              let seq = 0;
              const push = (x1: number, z1: number, x2: number, z2: number, color: string) => {
                if (Math.abs(x1 - x2) < 1e-7 && Math.abs(z1 - z2) < 1e-7) return;
                seq++;
                plotList.push({ type: "line", x1, z1, x2, z2, color, linhaId: cmd.linhaOriginal + seq * 0.0001 });
              };
              const offPts = profilePoints.map((pt) => ({ x: pt.x + sgn * radAllowance, y: pt.y + allowanceW }));
              const trechos = (xp: number): [number, number][] => {
                const dentro = (px: number) => (isInternal ? px > xp + 1e-6 : px < xp - 1e-6);
                const res: [number, number][] = [];
                let ini: number | null = dentro(offPts[0].x) ? startZ : null;
                for (let k = 0; k < offPts.length - 1; k++) {
                  const a = offPts[k];
                  const b = offPts[k + 1];
                  const da = dentro(a.x);
                  const db = dentro(b.x);
                  if (da !== db) {
                    const zc = Math.abs(b.x - a.x) < 1e-9 ? a.y : a.y + ((xp - a.x) / (b.x - a.x)) * (b.y - a.y);
                    if (!da && db) ini = zc;
                    else if (ini !== null) { res.push([ini, zc]); ini = null; }
                  }
                }
                if (ini !== null) res.push([ini, offPts[offPts.length - 1].y]);
                return tipo2 ? res : res.slice(0, 1);
              };
              const limiteX = isInternal ? Math.max(...offPts.map((p) => p.x)) : Math.min(...offPts.map((p) => p.x));
              let xp = startX;
              let curX = startX;
              let curZ = startZ;
              let guard = 0;
              while (guard++ < 1000 && absDepth > 0.0001) {
                xp = isInternal ? xp + absDepth : xp - absDepth;
                if (isInternal ? xp >= limiteX - 1e-6 : xp <= limiteX + 1e-6) break;
                const ts = trechos(xp);
                ts.forEach(([za, zb], idx) => {
                  if (Math.abs(curZ - za) > 1e-6) { push(curX, curZ, curX, za, RAP); curZ = za; }
                  push(curX, curZ, xp, za, idx === 0 && Math.abs(za - startZ) < 1e-6 ? RAP : CUT);
                  push(xp, za, xp, zb, CUT);
                  const rx = xp + sgn * retractR;
                  const rz = zb + retractR;
                  push(xp, zb, rx, rz, RAP);
                  curX = rx;
                  curZ = rz;
                });
                if (ts.length) { push(curX, curZ, curX, startZ, RAP); curZ = startZ; }
              }
              push(curX, curZ, offPts[0].x, startZ, RAP);
              let lx = offPts[0].x;
              let lz = startZ;
              offPts.forEach((pt) => { push(lx, lz, pt.x, pt.y, CUT); lx = pt.x; lz = pt.y; });
              push(lx, lz, startX, lz, RAP);
              push(startX, lz, startX, startZ, RAP);
              if (!activeLineIndexes.includes(cmd.linhaOriginal)) activeLineIndexes.push(cmd.linhaOriginal);
            
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

          let passesCount = 5; // Simplified visualization passes

          // Try to extract from P and Q of the G76 line (second block)
          if (cmd.p && cmd.q) {
            const calculatedPasses = Math.round(Math.pow(cmd.p / cmd.q, 2));
            if (calculatedPasses > 0 && calculatedPasses < 100) {
              passesCount = calculatedPasses;
            }
          }

          // Also scan comments in a small window around the command to check if "Passadas: " is specified
          for (let j = Math.max(0, i - 4); j <= Math.min(commands.length - 1, i + 4); j++) {
            const text = commands[j].text || "";
            const passMatch = text.match(/Passadas:\s*(\d+)/i);
            if (passMatch) {
              const pVal = parseInt(passMatch[1], 10);
              if (pVal > 0 && pVal < 100) {
                passesCount = pVal;
                break;
              }
            }
          }

          const depthPerPass = threadHeight / passesCount;
          const stepId = cmd.linhaOriginal;
          const taperR = cmd.r !== null ? cmd.r : 0; // Pedido 4: ler o valor de R do bloco G76

          for (let p = 1; p <= passesCount; p++) {
            // Fanuc G76 constant volume formula: depth = threadHeight * sqrt(p / passesCount)
            const passDepth = threadHeight * Math.sqrt(p / passesCount);
            const passRadius = isInternal ? crestRadius + passDepth : crestRadius - passDepth;
            const passId = stepId + p * 0.01;

            // Pedido 4: inclinar a rosca cônica de acordo com o R e o comprimento (invertendo a inclinação conforme pedido do usuário)
            const passRadiusStart = passRadius + taperR;
            const passRadiusEnd = passRadius;

            // Rapid to pass radius
            plotList.push({
              type: "line", x1: cx, z1: startZ, x2: passRadiusStart, z2: startZ,
              color: "#ff2a2a", linhaId: passId,
            });

            // Thread feed pass
            plotList.push({
              type: "line", x1: passRadiusStart, z1: startZ, x2: passRadiusEnd, z2: endZ,
              color: "#ff8c00", linhaId: passId + 0.005,
            });

            // Diagonal/Rapid retract to clearance
            plotList.push({
              type: "line", x1: passRadiusEnd, z1: endZ, x2: cx, z2: endZ,
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
      // ===== G83 (furação com pica-pau) / G84 (macho) — como a máquina: volta ao ponto inicial a cada bicada =====
      if ((cmd.mode === 83 || cmd.mode === 84) && cmd.z !== null) {
        const x0 = cmd.x !== null ? cmd.x / 2 : cx;
        const z0 = cz;
        const zf = cmd.z;
        let k = 0;
        const seg = (x1: number, z1: number, x2: number, z2: number, color: string) => {
          k++;
          plotList.push({ type: "line", x1, z1, x2, z2, color, linhaId: cmd.linhaOriginal + k * 0.0001 });
        };
        if (Math.abs(x0 - cx) > 1e-6) seg(cx, cz, x0, cz, "#ff2a2a");
        const qmm = cmd.q !== null ? cmd.q / 1000 : 0;
        if (cmd.mode === 84 || qmm <= 0) {
          seg(x0, z0, x0, zf, "#39ff14");
          seg(x0, zf, x0, z0, cmd.mode === 84 ? "#39ff14" : "#ff2a2a");
        } else {
          let z = z0;
          let guardD = 0;
          while (z > zf + 1e-6 && guardD++ < 500) {
            const alvo = Math.max(zf, z - qmm);
            if (z < z0 - 1e-6) seg(x0, z0, x0, z + 0.3, "#ff2a2a");
            seg(x0, z < z0 - 1e-6 ? z + 0.3 : z0, x0, alvo, "#39ff14");
            seg(x0, alvo, x0, z0, "#ff2a2a");
            z = alvo;
          }
        }
        cx = x0;
        cz = z0;
        if (!activeLineIndexes.includes(cmd.linhaOriginal)) activeLineIndexes.push(cmd.linhaOriginal);
        continue;
      }
      renderStandardMove(cmd, undefined, 0, i);
    }

    return { plotList, activeLineIndexes };
  } catch (err: any) {
      console.warn("GCode Parser Error: ", err);
      return { plotList: [], activeLineIndexes: [], error: "Erro ao compilar o ciclo atual. Continue digitando." };
    }
  };

  // Lê o programa só quando o texto muda (antes relia a cada movimento do mouse/zoom = travava)
  const { plotList, activeLineIndexes, error: parseError } = useMemo(() => parseGCode(), [gcodeText, simInvertZ]);
  // COLISÃO: movimentos do programa (inclusive G00) que entram na fixação do lado ativo (+ folga)
  const fixHits = useMemo(() => {
    const zone = fixZones.find((f) => f.lado === fixLado);
    const hits: { idx: number; linha: number }[] = [];
    if (!zone) return hits;
    const a = zone.za - fixFolga;
    const b = zone.zb + fixFolga;
    plotList.forEach((it, idx) => {
      const lo = Math.min(it.z1, it.z2);
      const hi = Math.max(it.z1, it.z2);
      if (hi >= a && lo <= b) hits.push({ idx, linha: it.linhaId });
    });
    return hits;
  }, [plotList, fixZones, fixLado, fixFolga]);

  const toggleFrozen = () => {
    setIsFrozen(!isFrozen);
  };

  // Dynamic tool position calculation for the HUD overlay (Diameter, Z)
  let toolX = 0;
  let toolZ = 0;
  if (plotList.length > 0) {
    toolX = plotList[0].x1;
    toolZ = plotList[0].z1;
    for (const item of plotList) {
      if (isFrozen) {
        if (item.linhaId <= activeLine) {
          toolX = item.x2;
          toolZ = item.z2;
        }
      } else {
        if (driverTick === -1 || item.linhaId <= driverTick) {
          toolX = item.x2;
          toolZ = item.z2;
        }
      }
    }
  }

  useEffect(() => {
    if (!isFrozen && onError && parseError) {
      onError(parseError);
    }
  }, [parseError, onError, isFrozen]);

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

    // Linhas da PEÇA (cheia) e do BRUTO (tracejada) importados do STEP, por baixo do caminho da ferramenta
    if (partLayers && partLayers.length) {
      ctx.save();
      partLayers.forEach((L) => {
        ctx.strokeStyle = L.color === "auto" ? (isThemeDark ? "rgba(203, 213, 225, 0.9)" : "rgba(51, 65, 85, 0.9)") : L.color;
        ctx.lineWidth = L.dashed ? 1.3 : 1.6;
        ctx.setLineDash(L.dashed ? [6, 4] : []);
        for (const sgn of [1, -1]) {
          ctx.globalAlpha = sgn === 1 ? 1 : 0.4; // metade de baixo (espelho) mais clara
          L.curves.forEach((c) => {
            ctx.beginPath();
            c.forEach((p, i) => {
              const px = originX + p.z * zoom * zDirSign;
              const py = originY - sgn * (p.x / 2) * zoom;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.stroke();
          });
        }
      });
      ctx.restore();
    }

    // DESENHO do usuário (Linha / Círculo / Arco / Ponto / Cotas)
    if (sketchEnts.length || sketchDraft.length || sketchTool !== "none") {
      drawSketchLayer(ctx, sketchEnts, { oX: originX, oY: originY, zoom, s: zDirSign }, sketchTool, sketchDraft, sketchHover, sketchDim ? sketchDim.id : null, isThemeDark, cur);
    }

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
      if (!isFrozen && driverTick !== -1 && item.linhaId > driverTick) {
        return;
      }

      // Convert lathe model coordinates to Canvas pixels
      const startPlotX = originX + item.z1 * zoom * zDirSign;
      const startPlotY = originY - item.x1 * zoom;
      const endPlotX = originX + item.z2 * zoom * zDirSign;
      const endPlotY = originY - item.x2 * zoom;

      // Track last tool point for crosshair
      if (isFrozen) {
        if (item.linhaId <= activeLine) {
          currentAnimationX = item.x2;
          currentAnimationZ = item.z2;
        }
      } else {
        if (item.linhaId <= driverTick || driverTick === -1) {
          currentAnimationX = item.x2;
          currentAnimationZ = item.z2;
        }
      }
      if (!showToolpath) return; // traços de usinagem desligados (botão no canto de baixo do simulador)

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
        if (item.xc !== undefined && item.zc !== undefined) {
          const cornerPlotX = originX + item.zc * zoom * zDirSign;
          const cornerPlotY = originY - item.xc * zoom;
          ctx.quadraticCurveTo(cornerPlotX, cornerPlotY, endPlotX, endPlotY);
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
      // Crosshair target (+30% size)
      ctx.moveTo(activeToolX - 6.5, activeToolY);
      ctx.lineTo(activeToolX + 6.5, activeToolY);
      ctx.moveTo(activeToolX, activeToolY - 6.5);
      ctx.lineTo(activeToolX, activeToolY + 6.5);
      ctx.stroke();

      // Draw small cutting tip triangle
      ctx.fillStyle = "rgba(255, 235, 59, 0.4)";
      ctx.beginPath();
      ctx.moveTo(activeToolX, activeToolY);
      ctx.lineTo(activeToolX - 5 * zDirSign, activeToolY - 10);
      ctx.lineTo(activeToolX - 10 * zDirSign, activeToolY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ===== FIXAÇÃO: faixa vermelha (zona proibida) + castanhas + movimentos que batem =====
    fixZones.forEach((f) => {
      const ativa = f.lado === fixLado;
      const fol = ativa ? fixFolga : 0;
      const xa = originX + (f.za - fol) * zoom * zDirSign;
      const xb = originX + (f.zb + fol) * zoom * zDirSign;
      const left = Math.min(xa, xb);
      const w = Math.abs(xb - xa);
      ctx.save();
      ctx.fillStyle = ativa ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.08)";
      ctx.fillRect(left, 0, w, canvas.height);
      const r = (f.d / 2) * zoom;
      const jaw = Math.max(10, r * 0.6);
      const xz1 = originX + f.za * zoom * zDirSign;
      const xz2 = originX + f.zb * zoom * zDirSign;
      const jl = Math.min(xz1, xz2);
      const jw = Math.abs(xz2 - xz1);
      ctx.fillStyle = ativa ? "rgba(239,68,68,0.55)" : "rgba(148,163,184,0.3)";
      ctx.fillRect(jl, originY - r - jaw, jw, jaw);
      ctx.fillRect(jl, originY + r, jw, jaw);
      ctx.strokeStyle = ativa ? "#ef4444" : "#94a3b8";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(left, 0, w, canvas.height);
      ctx.setLineDash([]);
      ctx.fillStyle = ativa ? "#fca5a5" : "#cbd5e1";
      ctx.font = "bold 11px monospace";
      ctx.fillText("FIXAÇÃO LADO " + f.lado + (ativa ? "" : " (inativa)"), left + 4, 16);
      ctx.restore();
    });
    if (fixHits.length) {
      ctx.save();
      ctx.strokeStyle = "#ff1f1f";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 8;
      fixHits.forEach((h) => {
        const it = plotList[h.idx];
        if (!it) return;
        ctx.beginPath();
        ctx.moveTo(originX + it.z1 * zoom * zDirSign, originY - it.x1 * zoom);
        ctx.lineTo(originX + it.z2 * zoom * zDirSign, originY - it.x2 * zoom);
        ctx.stroke();
      });
      ctx.restore();
    }
    // ===== REGIÕES das operações (painel ▶ Programa da peça): linhas da peça pintadas na cor da operação =====
    if (regioes && regioes.length && partLayers && partLayers.length) {
      const pecaL = partLayers.find((Lr) => Lr.id === "peca") || partLayers[0];
      regioes.forEach((rg) => {
        if (!rg.faixas.length) return;
        ctx.save();
        ctx.strokeStyle = rg.cor;
        ctx.lineWidth = rg.ativa ? 5 : 3;
        ctx.globalAlpha = rg.ativa ? 0.95 : 0.5;
        ctx.lineCap = "round";
        pecaL.curves.forEach((c) => {
          for (let i = 0; i < c.length - 1; i++) {
            const a = c[i];
            const b = c[i + 1];
            const zm = (a.z + b.z) / 2;
            if (!rg.faixas.some(([za, zb]) => zm >= Math.min(za, zb) - 1e-6 && zm <= Math.max(za, zb) + 1e-6)) continue;
            for (const sgn of [1, -1]) {
              ctx.beginPath();
              ctx.moveTo(originX + a.z * zoom * zDirSign, originY - sgn * (a.x / 2) * zoom);
              ctx.lineTo(originX + b.z * zoom * zDirSign, originY - sgn * (b.x / 2) * zoom);
              ctx.stroke();
            }
          }
        });
        ctx.restore();
      });
    }
    if (fixMode && fixDraft) {
      const px = originX + fixDraft.z * zoom * zDirSign;
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Hover/Snap Target ("Mira")
    if ((showMirinha || pgMode || fixMode || !!regiaoModo) && hoveredPoint) { // no PG a mira aparece sempre
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

      // Draw the reticle circle (+30% size increase)
      ctx.setLineDash([]);
      ctx.strokeStyle = hoveredPoint.isVertex ? cur.miraCanto : cur.miraLinha; // cores escolhidas em Aparência
      ctx.lineWidth = hoveredPoint.isVertex ? 2 : 1.2;
      ctx.beginPath();
      const circleRadius = (hoveredPoint.isVertex ? 9 : 5.5) * (cur.miraTam / 100); // tamanho escolhido em Aparência
      ctx.arc(hoveredPoint.canvasX, hoveredPoint.canvasY, circleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs inside reticle (+30% size increase)
      ctx.beginPath();
      const crosshairLength = (hoveredPoint.isVertex ? 14 : 9) * (cur.miraTam / 100);
      ctx.moveTo(hoveredPoint.canvasX - crosshairLength, hoveredPoint.canvasY);
      ctx.lineTo(hoveredPoint.canvasX + crosshairLength, hoveredPoint.canvasY);
      ctx.moveTo(hoveredPoint.canvasX, hoveredPoint.canvasY - crosshairLength);
      ctx.lineTo(hoveredPoint.canvasX, hoveredPoint.canvasY + crosshairLength);
      ctx.stroke();

      // A small glowing center dot (+30% size increase)
      ctx.fillStyle = hoveredPoint.isVertex ? cur.miraCanto : cur.miraLinha === CURSOR_STYLE_PADRAO.miraLinha ? "#39ff14" : cur.miraLinha;
      ctx.beginPath();
      const dotRadius = (hoveredPoint.isVertex ? 3 : 2) * (cur.miraTam / 100);
      ctx.arc(hoveredPoint.canvasX, hoveredPoint.canvasY, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw Measurement Overlays (Ruler)
    if (isMeasuring) {
      ctx.save();

      // Determine points
      const p1CanvasX = measureStartPoint 
        ? originX + measureStartPoint.latheZ * zoom * zDirSign 
        : null;
      const p1CanvasY = measureStartPoint 
        ? originY - (measureStartPoint.latheX / 2) * zoom 
        : null;

      let p2CanvasX: number | null = null;
      let p2CanvasY: number | null = null;

      if (measureEndPoint) {
        p2CanvasX = originX + measureEndPoint.latheZ * zoom * zDirSign;
        p2CanvasY = originY - (measureEndPoint.latheX / 2) * zoom;
      } else if (measureStartPoint && mousePos) {
        if (hoveredPoint) {
          p2CanvasX = hoveredPoint.canvasX;
          p2CanvasY = hoveredPoint.canvasY;
        } else {
          p2CanvasX = mousePos.x;
          p2CanvasY = mousePos.y;
        }
      }

      // Draw dashed preview or solid connection line
      if (p1CanvasX !== null && p1CanvasY !== null && p2CanvasX !== null && p2CanvasY !== null) {
        ctx.strokeStyle = "#ec4899"; // Vibrant Pink/Rose
        ctx.lineWidth = 1.5;
        if (!measureEndPoint) {
          ctx.setLineDash([4, 4]); // Dashed line for preview
        } else {
          ctx.setLineDash([]); // Solid line
        }

        // 1. Draw Direct Connection Line
        ctx.beginPath();
        ctx.moveTo(p1CanvasX, p1CanvasY);
        ctx.lineTo(p2CanvasX, p2CanvasY);
        ctx.stroke();

        // 2. Draw Dimension leader lines (orthogonal triangle showing delta Z and delta X)
        ctx.strokeStyle = "rgba(236, 72, 153, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);

        // Draw horizontal line from P1 to corner (P2.z, P1.x)
        ctx.beginPath();
        ctx.moveTo(p1CanvasX, p1CanvasY);
        ctx.lineTo(p2CanvasX, p1CanvasY);
        ctx.stroke();

        // Draw vertical line from corner (P2.z, P1.x) to P2
        ctx.beginPath();
        ctx.moveTo(p2CanvasX, p1CanvasY);
        ctx.lineTo(p2CanvasX, p2CanvasY);
        ctx.stroke();

        // Draw text along horizontal delta Z dimension
        const midZ_X = (p1CanvasX + p2CanvasX) / 2;
        const midZ_Y = p1CanvasY - 6;
        const dzVal = measureEndPoint 
          ? (measureEndPoint.latheZ - measureStartPoint.latheZ) 
          : (hoveredPoint ? hoveredPoint.latheZ - measureStartPoint.latheZ : (p2CanvasX - originX) / (zoom * zDirSign) - measureStartPoint.latheZ);
        
        ctx.fillStyle = isThemeDark ? "#111116" : "#ffffff";
        ctx.font = "bold 9px monospace";
        const dzText = `ΔZ: ${dzVal.toFixed(2)}`;
        const dzWidth = ctx.measureText(dzText).width;
        ctx.fillRect(midZ_X - dzWidth / 2 - 3, midZ_Y - 7, dzWidth + 6, 11);
        ctx.fillStyle = "#f59e0b"; // Orange/Amber
        ctx.textAlign = "center";
        ctx.fillText(dzText, midZ_X, midZ_Y + 1);

        // Draw text along vertical delta X dimension
        const midX_X = p2CanvasX + 8;
        const midX_Y = (p1CanvasY + p2CanvasY) / 2;
        const dxVal = measureEndPoint
          ? (measureEndPoint.latheX - measureStartPoint.latheX)
          : (hoveredPoint ? hoveredPoint.latheX - measureStartPoint.latheX : (-(p2CanvasY - originY) / zoom * 2) - measureStartPoint.latheX);

        ctx.fillStyle = isThemeDark ? "#111116" : "#ffffff";
        const dxText = `ΔX: Ø${dxVal.toFixed(2)}`;
        const dxWidth = ctx.measureText(dxText).width;
        ctx.fillRect(midX_X - 1, midX_Y - 6, dxWidth + 4, 11);
        ctx.fillStyle = "#22c55e"; // Green
        ctx.textAlign = "left";
        ctx.fillText(dxText, midX_X + 1, midX_Y + 2);
      }

      // Draw P1 Marker
      if (p1CanvasX !== null && p1CanvasY !== null) {
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.arc(p1CanvasX, p1CanvasY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("1", p1CanvasX, p1CanvasY);
      }

      // Draw P2 Marker
      if (measureEndPoint && p2CanvasX !== null && p2CanvasY !== null) {
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.arc(p2CanvasX, p2CanvasY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("2", p2CanvasX, p2CanvasY);
      }

      ctx.restore();
    }

    // Draw Angular Measurement Overlays
    if (isMeasuringAngle) {
      ctx.save();

      // Draw subtle dashed highlight over hovered line segment
      if (hoveredPoint && hoveredPoint.plotItem) {
        const hItem = hoveredPoint.plotItem;
        const hx1 = originX + hItem.z1 * zoom * zDirSign;
        const hy1 = originY - hItem.x1 * zoom;
        const hx2 = originX + hItem.z2 * zoom * zDirSign;
        const hy2 = originY - hItem.x2 * zoom;
        
        ctx.strokeStyle = "rgba(236, 72, 153, 0.5)";
        ctx.lineWidth = 4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx1, hy1);
        ctx.lineTo(hx2, hy2);
        ctx.stroke();
      }

      // Draw first selected segment (hot pink)
      if (angleStartLine) {
        const s1x = originX + angleStartLine.z1 * zoom * zDirSign;
        const s1y = originY - angleStartLine.x1 * zoom;
        const s2x = originX + angleStartLine.z2 * zoom * zDirSign;
        const s2y = originY - angleStartLine.x2 * zoom;

        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(s1x, s1y);
        ctx.lineTo(s2x, s2y);
        ctx.stroke();

        // Marker for Line 1
        const mid1X = (s1x + s2x) / 2;
        const mid1Y = (s1y + s2y) / 2;
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.arc(mid1X, mid1Y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("R1", mid1X, mid1Y);
      }

      // Draw second selected segment (neon cyan)
      if (angleEndLine) {
        const e1x = originX + angleEndLine.z1 * zoom * zDirSign;
        const e1y = originY - angleEndLine.x1 * zoom;
        const e2x = originX + angleEndLine.z2 * zoom * zDirSign;
        const e2y = originY - angleEndLine.x2 * zoom;

        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(e1x, e1y);
        ctx.lineTo(e2x, e2y);
        ctx.stroke();

        // Marker for Line 2
        const mid2X = (e1x + e2x) / 2;
        const mid2Y = (e1y + e2y) / 2;
        ctx.fillStyle = "#0ea5e9";
        ctx.beginPath();
        ctx.arc(mid2X, mid2Y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("R2", mid2X, mid2Y);
      }

      // Draw arc at intersection / common vertex if it exists
      if (angleStartLine && angleEndLine) {
        const p1a = { z: angleStartLine.z1, x: angleStartLine.x1 };
        const p1b = { z: angleStartLine.z2, x: angleStartLine.x2 };
        const p2a = { z: angleEndLine.z1, x: angleEndLine.x1 };
        const p2b = { z: angleEndLine.z2, x: angleEndLine.x2 };

        let commonVertex = null;
        let otherP1 = null;
        let otherP2 = null;
        const tol = 0.01;

        if (Math.hypot(p1b.z - p2a.z, p1b.x - p2a.x) < tol) {
          commonVertex = p1b;
          otherP1 = p1a;
          otherP2 = p2b;
        } else if (Math.hypot(p1a.z - p2a.z, p1a.x - p2a.x) < tol) {
          commonVertex = p1a;
          otherP1 = p1b;
          otherP2 = p2b;
        } else if (Math.hypot(p1b.z - p2b.z, p1b.x - p2b.x) < tol) {
          commonVertex = p1b;
          otherP1 = p1a;
          otherP2 = p2a;
        } else if (Math.hypot(p1a.z - p2b.z, p1a.x - p2b.x) < tol) {
          commonVertex = p1a;
          otherP1 = p1b;
          otherP2 = p2a;
        }

        if (commonVertex && otherP1 && otherP2) {
          const vCanvasX = originX + commonVertex.z * zoom * zDirSign;
          const vCanvasY = originY - commonVertex.x * zoom;
          
          const p1CanvasX = originX + otherP1.z * zoom * zDirSign;
          const p1CanvasY = originY - otherP1.x * zoom;
          
          const p2CanvasX = originX + otherP2.z * zoom * zDirSign;
          const p2CanvasY = originY - otherP2.x * zoom;
          
          const a1 = Math.atan2(p1CanvasY - vCanvasY, p1CanvasX - vCanvasX);
          const a2 = Math.atan2(p2CanvasY - vCanvasY, p2CanvasX - vCanvasX);
          
          let diff = a2 - a1;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          
          const theta = Math.abs(diff);
          const isThetaAcute = theta <= Math.PI / 2;

          // Sector 1: angle theta (between a1 and a2)
          // Drawn with radius 28 if acute (green), radius 38 if obtuse (orange)
          ctx.strokeStyle = isThetaAcute ? "#39ff14" : "#f97316";
          ctx.lineWidth = isThetaAcute ? 2.5 : 2;
          ctx.beginPath();
          ctx.arc(vCanvasX, vCanvasY, isThetaAcute ? 28 : 38, a1, a1 + diff, diff < 0);
          ctx.stroke();

          // Sector 2: angle Math.PI - theta (supplementary, between a2 and a1_ext)
          // Drawn with radius 38 if acute (green), radius 28 if obtuse (orange)
          const a1_ext = a1 + Math.PI;
          let diff2 = a1_ext - a2;
          while (diff2 < -Math.PI) diff2 += Math.PI * 2;
          while (diff2 > Math.PI) diff2 -= Math.PI * 2;

          ctx.strokeStyle = isThetaAcute ? "#f97316" : "#39ff14";
          ctx.lineWidth = isThetaAcute ? 2 : 2.5;
          ctx.beginPath();
          ctx.arc(vCanvasX, vCanvasY, isThetaAcute ? 38 : 28, a2, a2 + diff2, diff2 < 0);
          ctx.stroke();

          // Draw yellow vertex dot
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(vCanvasX, vCanvasY, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  };

  // Resize listener using ResizeObserver to handle container-specific resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasSize({
          width: entry.contentRect.width || 500,
          height: entry.contentRect.height || 450,
        });
      }
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever canvas size or any simulation variables change
  useEffect(() => {
    drawSimulation();
  }, [
    showToolpath,
    fixZones,
    fixLado,
    fixFolga,
    fixDraft,
    fixHits,
    fixMode,
    regioes,
    regiaoModo,
    cursorStyle,
    canvasSize,
    gcodeText,
    partLayers,
    zoom,
    panX,
    panY,
    simInvertZ,
    driverTick,
    activeLine,
    isThemeDark,
    hoveredPoint,
    showMirinha,
    isMeasuring,
    isMeasuringAngle,
    angleStartLine,
    angleEndLine,
    measureStartPoint,
    measureEndPoint,
    mousePos,
    isFrozen,
    sketchEnts,
    sketchDraft,
    sketchHover,
    sketchTool,
    sketchDim,
  ]);

  // Click on Canvas toolpath to highlight editor line
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (sketchTool !== "none") { handleSketchClick(e); return; } // ferramenta de desenho ligada
    // PAINEL: escolhendo a REGIÃO de uma operação (começo/fim ou linha por linha)
    if (regiaoModo && onRegiaoPick) {
      const cnv = canvasRef.current;
      if (!cnv) return;
      const rct = cnv.getBoundingClientRect();
      const mx = rct.width > 0 ? ((e.clientX - rct.left) / rct.width) * cnv.width : 0;
      const my = rct.height > 0 ? ((e.clientY - rct.top) / rct.height) * cnv.height : 0;
      if (regiaoModo === "linha") {
        // acha a LINHA (ou arco) do perfil mais perto do toque e manda o começo e o fim dela em Z
        if (!partLayers || !partLayers.length) return;
        const pecaL = partLayers.find((Lr) => Lr.id === "peca") || partLayers[0];
        const zDir = simInvertZ ? -1 : 1;
        const oX = cnv.width / 2 + 50 + panX;
        const oY = cnv.height / 2 + 50 + panY;
        let melhor: { x: number; z: number }[] | null = null;
        let bd = 45;
        for (const c of pecaL.curves) {
          for (const sgn of [1, -1]) {
            for (let i = 0; i < c.length - 1; i++) {
              const res = getDistanceToSegment(mx, my, oX + c[i].z * zoom * zDir, oY - sgn * (c[i].x / 2) * zoom, oX + c[i + 1].z * zoom * zDir, oY - sgn * (c[i + 1].x / 2) * zoom);
              if (res.distance < bd) { bd = res.distance; melhor = c; }
            }
          }
        }
        const m = melhor as { x: number; z: number }[] | null;
        if (m) {
          const zs = m.map((p) => p.z);
          onRegiaoPick({ z: (Math.min(...zs) + Math.max(...zs)) / 2, x: Math.max(...m.map((p) => p.x)), za: Math.min(...zs), zb: Math.max(...zs) });
        }
        return;
      }
      const g = findPickSnap(mx, my, cnv, 45);
      if (g) onRegiaoPick({ z: g.latheZ, x: g.latheX });
      else {
        const w = skToWorld(mx, my, sketchView(cnv));
        onRegiaoPick({ z: w.z, x: Math.abs(w.r) * 2 });
      }
      return;
    }
    // FIXAÇÃO: 1º toque = começo da pega, 2º toque = fim da pega (no lado escolhido)
    if (fixMode) {
      const cnv = canvasRef.current;
      if (!cnv) return;
      const rct = cnv.getBoundingClientRect();
      const mx = rct.width > 0 ? ((e.clientX - rct.left) / rct.width) * cnv.width : 0;
      const my = rct.height > 0 ? ((e.clientY - rct.top) / rct.height) * cnv.height : 0;
      const g = findPickSnap(mx, my, cnv, 45);
      let z = 0;
      let d = 0;
      if (g) {
        z = g.latheZ;
        d = g.latheX;
      } else {
        const w = skToWorld(mx, my, sketchView(cnv));
        z = w.z;
        d = Math.abs(w.r) * 2;
      }
      if (!fixDraft) {
        setFixDraft({ z, d });
        setFixMsg("Começo da pega em Z" + z.toFixed(3) + ". Agora toque no FIM da pega.");
        return;
      }
      const nova: FixZone = { lado: fixLado, za: Math.min(fixDraft.z, z), zb: Math.max(fixDraft.z, z), d: Math.max(fixDraft.d, d) };
      setFixZones((arr) => [...arr.filter((f) => f.lado !== fixLado), nova]);
      setFixDraft(null);
      setFixMsg("Lado " + fixLado + ": pega de Z" + nova.za.toFixed(3) + " a Z" + nova.zb.toFixed(3) + " (" + (nova.zb - nova.za).toFixed(2) + " mm, Ø" + nova.d.toFixed(2) + ")");
      setTimeout(() => setFixMsg(null), 4000);
      return;
    }
    // PG ligado: o ponto tocado no perfil da peça vira uma linha do programa
    if (pgMode) {
      const cnv = canvasRef.current;
      if (!cnv) return;
      const rct = cnv.getBoundingClientRect();
      const mx = rct.width > 0 ? ((e.clientX - rct.left) / rct.width) * cnv.width : 0;
      const my = rct.height > 0 ? ((e.clientY - rct.top) / rct.height) * cnv.height : 0;
      // Mesmo ponto que a mira mostra: linhas da PEÇA (STEP) e do DESENHO; cantos e pontas têm prioridade
      const g = findPickSnap(mx, my, cnv, 45);
      const got = g ? { x: g.latheX, z: g.latheZ } : null;
      if (got && onInsertPoint) {
        onInsertPoint(got.x, got.z);
        setPgMsg(`X${got.x.toFixed(3)} Z${got.z.toFixed(3)} foi para o programa`);
      } else {
        setPgMsg(
          (partLayers && partLayers.length) || (sketchEnts && sketchEnts.length)
            ? "toque em cima de uma linha da peça ou do desenho"
            : "anexe o STEP da peça ou desenhe o perfil primeiro"
        );
      }
      setTimeout(() => setPgMsg(null), 2500);
      return;
    }

    if (isMeasuring) {
      let clickedPoint: { latheX: number; latheZ: number; canvasX: number; canvasY: number } | null = null;
      if (hoveredPoint) {
        clickedPoint = {
          latheX: hoveredPoint.latheX,
          latheZ: hoveredPoint.latheZ,
          canvasX: hoveredPoint.canvasX,
          canvasY: hoveredPoint.canvasY,
        };
      } else {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const mouseX = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * canvas.width : 0;
          const mouseY = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * canvas.height : 0;
          const zDirSign = simInvertZ ? -1 : 1;
          const originX = canvas.width / 2 + 50 + panX;
          const originY = canvas.height / 2 + 50 + panY;
          const latheZ = (mouseX - originX) / (zoom * zDirSign);
          const latheRadius = -(mouseY - originY) / zoom;
          const latheX = latheRadius * 2;
          clickedPoint = {
            latheX,
            latheZ,
            canvasX: mouseX,
            canvasY: mouseY,
          };
        }
      }

      if (clickedPoint) {
        if (!measureStartPoint || (measureStartPoint && measureEndPoint)) {
          setMeasureStartPoint(clickedPoint);
          setMeasureEndPoint(null);
        } else {
          setMeasureEndPoint(clickedPoint);
        }
      }
      return;
    }

    if (isMeasuringAngle) {
      if (hoveredPoint && hoveredPoint.plotItem) {
        const item = hoveredPoint.plotItem;
        if (!angleStartLine || (angleStartLine && angleEndLine)) {
          setAngleStartLine(item);
          setAngleEndLine(null);
        } else {
          if (angleStartLine.linhaId !== item.linhaId) {
            setAngleEndLine(item);
          } else {
            setAngleStartLine(null);
            setAngleEndLine(null);
          }
        }
      } else {
        setAngleStartLine(null);
        setAngleEndLine(null);
      }
      return;
    }

    if (hoveredPoint) {
      if (hoveredPoint.gcodeLine >= 0) onLineChange(hoveredPoint.gcodeLine);
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

  // Handle window drag events for measuring panel
  useEffect(() => {
    if (!isDraggingMeasurePanel) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;

      const container = canvasRef.current?.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        // Constrain so it stays within the container's bounds
        newX = Math.max(0, Math.min(newX, rect.width - 256)); // width is 256px (w-64)
        newY = Math.max(0, Math.min(newY, rect.height - 180)); // estimated height
      }

      setMeasurePanelPos({ x: newX, y: newY });
    };

    const handleWindowMouseUp = () => {
      setIsDraggingMeasurePanel(false);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDraggingMeasurePanel, dragOffset]);

  const handleMeasurePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsDraggingMeasurePanel(true);
    setDragOffset({
      x: e.clientX - measurePanelPos.x,
      y: e.clientY - measurePanelPos.y
    });
    e.stopPropagation();
  };

  const toggleMeasuring = () => {
    setIsMeasuring((prev) => {
      const newVal = !prev;
      if (newVal) {
        setIsMeasuringAngle(false); // Disable angular
        setAngleStartLine(null);
        setAngleEndLine(null);
        setIsDriverActive(false); // Pause driver when measuring starts
        setMeasurePanelPos({ x: 12, y: 100 }); // reset position to default
      } else {
        setMeasureStartPoint(null);
        setMeasureEndPoint(null);
        setMousePos(null);
      }
      return newVal;
    });
  };

  const toggleMeasuringAngle = () => {
    setIsMeasuringAngle((prev) => {
      const newVal = !prev;
      if (newVal) {
        setIsMeasuring(false); // Disable linear
        setMeasureStartPoint(null);
        setMeasureEndPoint(null);
        setMousePos(null);
        setIsDriverActive(false); // Pause driver when measuring starts
        setMeasurePanelPos({ x: 12, y: 100 }); // reset position to default
      } else {
        setAngleStartLine(null);
        setAngleEndLine(null);
      }
      return newVal;
    });
  };

  // Handle Play/Pause
  const togglePlay = () => {
    if (isMeasuring) {
      setIsMeasuring(false);
      setMeasureStartPoint(null);
      setMeasureEndPoint(null);
      setMousePos(null);
    }
    if (isMeasuringAngle) {
      setIsMeasuringAngle(false);
      setAngleStartLine(null);
      setAngleEndLine(null);
    }
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
    if (isMeasuring) {
      setIsMeasuring(false);
      setMeasureStartPoint(null);
      setMeasureEndPoint(null);
      setMousePos(null);
    }
    if (isMeasuringAngle) {
      setIsMeasuringAngle(false);
      setAngleStartLine(null);
      setAngleEndLine(null);
    }
  };

  const handleStepForward = () => {
    if (isMeasuring) {
      setIsMeasuring(false);
      setMeasureStartPoint(null);
      setMeasureEndPoint(null);
      setMousePos(null);
    }
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
      {/* Painel de detalhes do Tempo de Ciclo (abre ao tocar no tempo) */}
      {showCyclePanel && (
        <CycleTimePanel
          details={cycleTimeDetails}
          factorPercent={cycleTimeFactor}
          params={machineParams}
          onChangeParams={handleChangeMachineParams}
          onClose={() => setShowCyclePanel(false)}
        />
      )}

      {/* Title Bar */}
      <div className={`flex flex-wrap justify-between items-center px-3 py-1.5 border-b gap-2 min-w-0 transition-colors duration-300 ${
        isHighContrast ? "bg-zinc-200 border-black" : isThemeDark ? "bg-[#1e1e24] border-zinc-800" : "bg-zinc-100 border-zinc-200"
      }`}>
        <div className="flex flex-wrap items-center gap-2 md:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-2 w-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" />
            <h3 className="font-display font-medium text-xs tracking-wider uppercase shrink-0">
              Simulador Gráfico 2D
            </h3>
          </div>

          {/* Discrete Cycle Time Display + Potentiometer */}
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 bg-[#101016] border border-amber-500/30 rounded-lg px-2 py-0.5 text-xs font-mono shrink-0">
            <div 
            onClick={() => setShowCyclePanel(true)}
            className="flex items-center gap-1.5 text-amber-400 font-bold cursor-pointer hover:brightness-125 shrink-0"
              title={`Tempo de Ciclo Calibrado: ${formattedCycleTimeTenths}\n• Usinagem em Corte (G1/G2/G3/Ciclos): ${(cycleTimeDetails.feedSeconds * (cycleTimeFactor / 100)).toFixed(1)}s\n• Movimentos Rápidos (G00): ${(cycleTimeDetails.rapidSeconds * (cycleTimeFactor / 100)).toFixed(1)}s\n• Trocas e Pausas (T/M/G4): ${(cycleTimeDetails.delaySeconds * (cycleTimeFactor / 100)).toFixed(1)}s`}
            >
              <Clock size={13} className="text-amber-400 animate-pulse shrink-0" />
              <span className="text-[10px] text-zinc-400 uppercase font-sans tracking-tight shrink-0">Tempo Ciclo:</span>
              <span className="text-amber-300 font-black text-xs tracking-widest shrink-0">{formattedCycleTimeTenths}</span>
            </div>

            <span className="hidden sm:inline-block w-[1px] h-3.5 bg-zinc-800 my-auto" />

            <div className="flex items-center gap-1.5 shrink-0" title={isCycleTimeLocked ? "Calibração travada pelo cadeado. Clique para destravar e alterar." : "Ajuste o potenciômetro % para calibrar o tempo real da máquina"}>
              <Gauge size={12} className={isCycleTimeLocked ? "text-amber-400" : "text-cyan-400"} />
              <input
                type="range"
                min="20"
                max="180"
                step="1"
                value={cycleTimeFactor}
                disabled={isCycleTimeLocked}
                onChange={(e) => setCycleTimeFactor(parseInt(e.target.value, 10))}
                className={`w-10 md:w-14 h-1 rounded-lg appearance-none ${
                  isCycleTimeLocked 
                    ? "bg-zinc-800 opacity-40 cursor-not-allowed accent-amber-500" 
                    : "bg-zinc-800 cursor-pointer accent-[#00f3ff]"
                }`}
              />
              
              {/* Direct Number Input Box */}
              <div className={`flex items-center border rounded px-1 py-0.2 ${
                isCycleTimeLocked 
                  ? "bg-amber-950/30 border-amber-500/40 text-amber-300" 
                  : "bg-zinc-900 border-zinc-700 text-cyan-400 hover:border-cyan-500/60"
              }`}>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={cycleTimeFactor}
                  disabled={isCycleTimeLocked}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setCycleTimeFactor(Math.max(1, Math.min(300, val)));
                    }
                  }}
                  className={`w-7 bg-transparent text-center font-bold text-[11px] focus:outline-none font-mono ${
                    isCycleTimeLocked ? "cursor-not-allowed text-amber-300" : "text-cyan-400"
                  }`}
                />
                <span className="text-[10px] font-bold opacity-80">%</span>
              </div>

              {/* Padlock Lock/Unlock Button */}
              <button
                type="button"
                onClick={() => setIsCycleTimeLocked(!isCycleTimeLocked)}
                className={`p-1 rounded transition border cursor-pointer ${
                  isCycleTimeLocked
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                    : "bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-cyan-300 hover:border-cyan-500/40"
                }`}
                title={
                  isCycleTimeLocked
                    ? "Cadeado TRAVADO: Porcentagem mantida fixa mesmo ao carregar outros programas. Clique para destravar."
                    : "Cadeado DESTRAVADO: Clique para travar esta porcentagem de calibração."
                }
              >
                {isCycleTimeLocked ? <Lock size={11} className="text-amber-400" /> : <Unlock size={11} className="text-zinc-400" />}
              </button>

              {/* Reset to 100% Button */}
              {cycleTimeFactor !== 100 && (
                <button
                  type="button"
                  onClick={() => setCycleTimeFactor(100)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-900/80 transition cursor-pointer"
                  title="Redefinir para 100% (Tempo Base)"
                >
                  100%
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center shrink-0">
          {/* Mira 2D ON/OFF Toggle */}
          <button
            onClick={() => {
              // Ciclo do botão: MIRA ON -> MIRA FIXA (painel fixo e arrastável) -> MIRA OFF -> MIRA ON
              if (showMirinha && !miraFixa) setMiraFixa(true);
              else if (showMirinha && miraFixa) {
                setMiraFixa(false);
                setShowMirinha(false);
              } else setShowMirinha(true);
            }}
            className={`px-2 py-1 text-[10px] font-bold rounded border uppercase flex items-center gap-1.5 transition cursor-pointer ${
              showMirinha
                ? "bg-cyan-950/50 text-cyan-400 border-cyan-400/60 shadow-[0_0_8px_rgba(0,243,255,0.2)]"
                : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Mira: 1º toque = painel FIXO (arraste para onde quiser) | 2º toque = desliga | 3º toque = liga de novo"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Mira {!showMirinha ? "OFF" : miraFixa ? "📌 FIXA" : "ON"}</span>
          </button>

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
              setZoom(z => Math.min(5000, z * 1.25));
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
            {/* PG: ligado, cada toque num ponto da peça vira uma linha G01 X.. Z.. no programa */}
            <button
              onClick={() => { setPgMode((v) => !v); setFixMode(false); setFixDraft(null); }}
              className={`text-[10px] font-bold border px-2 py-1 rounded transition ${
                pgMode ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
              title="PG: ligado, cada toque num ponto do perfil da peça vira uma linha G01 X.. Z.. no programa (logo abaixo da linha do cursor)"
            >
              PG
            </button>
            {/* FIX: marcar onde a peça é presa (zona proibida para qualquer ferramenta) */}
            <button
              onClick={() => { setFixMode((v) => !v); setFixDraft(null); setFixMsg(null); setPgMode(false); }}
              className={`text-[10px] font-bold border px-2 py-1 rounded transition ${
                fixMode ? "bg-red-500/20 text-red-300 border-red-500/60" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
              title="FIX: toque no começo e no fim de onde a placa / pinça / contrafuso pega a peça. Essa área vira zona proibida: movimento que passar ali fica vermelho (colisão)"
            >
              FIX
            </button>
        </div>
      </div>

      {/* Actual Graphics Canvas */}
      <div className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none">
          {/* Ferramentas de DESENHO (aparecem/somem pelo botão de lápis lá embaixo) */}
          {sketchOpen && (
            <SketchToolbar
              tool={sketchTool}
              onTool={sketchSetTool}
              onUndo={sketchUndo}
              onClear={() => { sketchPush(); setSketchEnts([]); setSketchDraft([]); setSketchDim(null); }}
              onFinish={() => setSketchDraft([])}
              hasDraft={sketchDraft.length > 0}
              count={sketchEnts.length}
            />
          )}
          {/* Liga / desliga os traços de movimento de usinagem do programa (peça STEP e desenho continuam aparecendo) */}
          <div
            className="absolute left-2 bottom-2 z-30 p-1 rounded-lg bg-black/70 border border-zinc-700 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowToolpath((v) => !v)}
              title={showToolpath ? "Traços de usinagem LIGADOS (toque para esconder)" : "Traços de usinagem DESLIGADOS (toque para mostrar)"}
              className={
                "w-9 h-9 rounded-md flex items-center justify-center border transition " +
                (showToolpath
                  ? "bg-emerald-900/60 text-emerald-300 border-emerald-500/70 shadow-[0_0_8px_rgba(16,185,129,0.35)]"
                  : "bg-[#1e1e24]/90 text-zinc-500 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300")
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18h5l3-6h4l3-6h3" strokeDasharray={showToolpath ? undefined : "3 3"} />
                {!showToolpath && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          {/* Caixinha da Cota inteligente: digita a medida e a linha/círculo/arco muda de tamanho */}
          {sketchDim && (
            <div
              className="absolute z-40 bg-zinc-900/95 border border-amber-500/60 rounded-lg shadow-xl p-2 text-[11px] text-zinc-200 font-sans w-48"
              style={{ left: sketchDim.left, top: sketchDim.top }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-amber-300 mb-1">Cota inteligente</div>
              <label className="flex items-center justify-between gap-2 mb-1">
                <span>{sketchDim.labelA}</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={sketchDim.a}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSketchDim({ ...sketchDim, a: e.target.value })}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applySketchDim(); if (e.key === "Escape") setSketchDim(null); }}
                  className="w-20 bg-black border border-zinc-600 rounded px-1.5 py-1 text-right font-mono text-amber-200 focus:outline-none focus:border-amber-400"
                />
              </label>
              {sketchDim.labelB && (
                <label className="flex items-center justify-between gap-2 mb-1">
                  <span>{sketchDim.labelB}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sketchDim.b}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setSketchDim({ ...sketchDim, b: e.target.value })}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applySketchDim(); if (e.key === "Escape") setSketchDim(null); }}
                    className="w-20 bg-black border border-zinc-600 rounded px-1.5 py-1 text-right font-mono text-amber-200 focus:outline-none focus:border-amber-400"
                  />
                </label>
              )}
              <div className="flex gap-1 mt-1.5">
                <button onClick={applySketchDim} className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-2 py-1">OK</button>
                <button onClick={() => setSketchDim(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 rounded px-2 py-1">Cancelar</button>
              </div>
            </div>
          )}
        {parseError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/80 border border-red-500/50 text-red-400 px-4 py-2 rounded shadow-lg text-xs pointer-events-none z-20 flex items-center gap-2">
             <AlertTriangle size={14} />
             {parseError}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={(e) => { if ((e.relatedTarget as HTMLElement | null)?.closest?.("[data-resize-handle]")) return; setHoveredPoint(null); }}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="w-full h-full block touch-none"
          style={{ touchAction: 'none', ...(bgColor ? { background: bgColor } : {}) }}
        />

        {/* Aviso do PG (ponto levado para o programa) */}
        {pgMode && (
          <div className={`absolute top-12 left-1/2 -translate-x-1/2 z-40 text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none ${pgMsg ? "bg-emerald-600 text-white" : "bg-black/70 text-emerald-300"}`}>
            {pgMsg ? `PG: ${pgMsg}` : "PG ligado: toque nos pontos do perfil da peça"}
          </div>
        )}
          {/* Painel da FIXAÇÃO (zona proibida) */}
          {fixMode && (
            <div
              className="absolute top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 bg-black/85 border border-red-500/60 rounded-lg px-2 py-1 text-[11px] font-bold text-red-200 shadow-lg">
                <span>FIXAÇÃO</span>
                {([1, 2] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => { setFixLado(l); setFixDraft(null); }}
                    className={`px-2 py-0.5 rounded border ${fixLado === l ? "bg-red-600 text-white border-red-400" : "border-zinc-600 text-zinc-300 hover:border-zinc-400"}`}
                  >
                    Lado {l}
                  </button>
                ))}
                <label className="flex items-center gap-1 text-zinc-300 font-semibold" title="Distância mínima que a ferramenta deve ficar da fixação">
                  Folga
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={fixFolga}
                    onChange={(e) => { const v = parseFloat(e.target.value); setFixFolga(isNaN(v) ? 0 : v); }}
                    className="w-12 bg-zinc-900 border border-zinc-600 rounded px-1 text-white"
                  />
                  mm
                </label>
                {fixZones.some((f) => f.lado === fixLado) && (
                  <button
                    onClick={() => { setFixZones((arr) => arr.filter((f) => f.lado !== fixLado)); setFixDraft(null); }}
                    className="px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:border-red-400"
                    title="Apagar a fixação deste lado"
                  >
                    Apagar
                  </button>
                )}
              </div>
              <div className="bg-black/75 text-red-200 text-[11px] font-semibold px-2 py-1 rounded pointer-events-none">
                {fixMsg || (fixDraft ? "Toque no FIM da pega na peça" : "Toque no COMEÇO da pega (lado " + fixLado + ") na peça")}
              </div>
            </div>
          )}
          {/* Aviso de COLISÃO com a fixação (aparece sempre que tiver) */}
          {fixHits.length > 0 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 bg-red-600/95 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none animate-pulse">
              ⚠ COLISÃO: {fixHits.length} movimento(s) entram na fixação do lado {fixLado} — 1º na linha {Math.floor(fixHits[0].linha) + 1}
            </div>
          )}

        {/* Precise Snapping Target Tooltip (Fixed at Bottom-Left as requested) */}
        {showMirinha && (hoveredPoint || (miraFixa && miraUltimoPonto)) && !isMeasuring && !isMeasuringAngle && (() => {
          const pt = (hoveredPoint || miraUltimoPonto) as HoveredPointInfo;
          const posicionada = miraFixa && miraPos;
          return (
          <ResizableBox
            id="sim2d_mira"
            anchor={posicionada ? "tl" : "bl"}
            style={posicionada ? { left: miraPos!.x, top: miraPos!.y } : undefined}
            onPointerDown={miraFixa ? handleMiraPointerDown : undefined}
            onPointerMove={miraFixa ? handleMiraPointerMove : undefined}
            onPointerUp={miraFixa ? handleMiraPointerUp : undefined}
            onPointerCancel={miraFixa ? handleMiraPointerUp : undefined}
            className={`absolute ${posicionada ? "" : "bottom-4 left-4"} ${miraFixa ? "pointer-events-auto cursor-move touch-none" : "pointer-events-none"} bg-[#111116]/95 backdrop-blur border-2 border-cyan-400 rounded-xl p-4 font-mono shadow-2xl z-30 select-none min-w-[300px] max-w-[400px] flex flex-col gap-2 text-left animate-in fade-in duration-100`}>
            <div className="flex justify-between items-center border-b border-zinc-700/80 pb-1.5 text-zinc-300 font-bold text-xs tracking-wider">
            <span>{pt.partLayer ? pt.partLayer : `LINHA ${pt.gcodeLine + 1}`}{miraFixa && <span className="ml-2 text-amber-400">📌 FIXA · arraste</span>}</span>
              <span className="text-cyan-400 font-black text-xs flex items-center gap-1.5">
                <Target className="w-4 h-4 text-cyan-400" /> MIRA
              </span>
            </div>
            <div className="text-white font-sans font-black py-0.5 text-base tracking-wide truncate max-w-[370px]">
              {pt.gcodeText}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mt-1 border-t border-zinc-700/80 pt-2 text-zinc-300 font-bold">
              <div>X: <span className="text-[#39ff14] font-black text-base ml-1">Ø {pt.latheX.toFixed(3)}</span></div>
              <div>Z: <span className="text-orange-400 font-black text-base ml-1">{pt.latheZ.toFixed(3)}</span></div>
            </div>
          </ResizableBox>
          );
        })()}

        {/* Real-time coordinates HUD overlays */}
        {!isMeasuring && !isMeasuringAngle && (
          <ResizableBox id="sim2d_coordenadas" anchor="tl" className="absolute top-3 left-3 bg-black/80 backdrop-blur border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 flex flex-col gap-0.5">
            <div className="flex justify-between gap-4">
              <span>DIÂMETRO X:</span>
              <span className="text-[#39ff14] font-bold">Ø {(toolX * 2).toFixed(3)} mm</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>POSIÇÃO Z:</span>
              <span className="text-orange-400 font-bold">Z {toolZ.toFixed(3)} mm</span>
            </div>
          </ResizableBox>
        )}

        {/* Helper overlay displaying interactive tip */}
        <div className="absolute top-3 right-3 bg-black/80 border border-zinc-800 rounded px-2.5 py-1 text-[10px] text-zinc-500 font-mono hidden sm:block">
          💡 Botão central + arrastar para mover | Scroll para Zoom
        </div>

        {/* Measuring mode info floating box */}
        {isMeasuring && (
          <ResizableBox id="sim2d_regua" anchor="tl" 
            onMouseDown={handleMeasurePanelMouseDown}
            style={{ left: `${measurePanelPos.x}px`, top: `${measurePanelPos.y}px` }}
            className="absolute bg-[#111116]/95 border border-pink-500 rounded-lg p-3 font-mono text-[11px] shadow-2xl z-40 select-none w-64 text-left cursor-grab active:cursor-grabbing"
          >
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5 mb-2 font-bold text-[10px] tracking-wider text-pink-400">
              <span className="flex items-center gap-1.5">
                <Ruler size={12} className="animate-pulse" />
                RÉGUA DE MEDIÇÃO
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setMeasureStartPoint(null);
                  setMeasureEndPoint(null);
                }}
                className="text-[9px] text-zinc-500 hover:text-zinc-300 underline font-sans"
              >
                Limpar
              </button>
            </div>
            {!measureStartPoint ? (
              <div className="text-zinc-500 text-[10px] py-1 leading-relaxed font-sans">
                Clique em qualquer ponto do perfil ou do gráfico para marcar o <b>Ponto 1</b>.
              </div>
            ) : !measureEndPoint ? (
              <div className="flex flex-col gap-2">
                <div className="text-zinc-300 text-[10px]">
                  <span className="text-pink-400 font-bold">Ponto 1:</span> X Ø {measureStartPoint.latheX.toFixed(3)} | Z {measureStartPoint.latheZ.toFixed(3)}
                </div>
                <div className="text-zinc-400 text-[10px] animate-pulse font-sans">
                  Clique em outro ponto para marcar o <b>Ponto 2</b> e ver a distância.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1 border-b border-zinc-800/40 pb-1.5 text-[9px] text-zinc-400">
                  <div><span className="text-pink-400 font-bold">P1:</span> X Ø{measureStartPoint.latheX.toFixed(2)} Z{measureStartPoint.latheZ.toFixed(2)}</div>
                  <div><span className="text-pink-400 font-bold">P2:</span> X Ø{measureEndPoint.latheX.toFixed(2)} Z{measureEndPoint.latheZ.toFixed(2)}</div>
                </div>
                
                <div className="flex justify-between py-0.5 border-b border-zinc-800/30">
                  <span className="text-zinc-400">ΔX (Diâmetro):</span>
                  <span className="text-[#39ff14] font-bold">
                    Ø {(measureEndPoint.latheX - measureStartPoint.latheX).toFixed(3)} mm
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-800/30">
                  <span className="text-zinc-400">ΔX (Raio):</span>
                  <span className="text-[#39ff14]/80 font-bold">
                    {((measureEndPoint.latheX - measureStartPoint.latheX) / 2).toFixed(3)} mm
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">ΔZ (Eixo Z):</span>
                  <span className="text-orange-400 font-bold">
                    {(measureEndPoint.latheZ - measureStartPoint.latheZ).toFixed(3)} mm
                  </span>
                </div>
              </div>
            )}
          </ResizableBox>
        )}

        {/* Measuring Angle mode info floating box */}
        {isMeasuringAngle && (
          <ResizableBox id="sim2d_angulo" anchor="tl" 
            onMouseDown={handleMeasurePanelMouseDown}
            style={{ left: `${measurePanelPos.x}px`, top: `${measurePanelPos.y}px` }}
            className="absolute bg-[#111116]/95 border border-amber-500 rounded-lg p-3 font-mono text-[11px] shadow-2xl z-40 select-none w-64 text-left cursor-grab active:cursor-grabbing"
          >
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5 mb-2 font-bold text-[10px] tracking-wider text-amber-400">
              <span className="flex items-center gap-1.5">
                <Compass size={12} className="animate-pulse" />
                RÉGUA ANGULAR
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setAngleStartLine(null);
                  setAngleEndLine(null);
                }}
                className="text-[9px] text-zinc-500 hover:text-zinc-300 underline font-sans"
              >
                Limpar
              </button>
            </div>
            {!angleStartLine ? (
              <div className="text-zinc-500 text-[10px] py-1 leading-relaxed font-sans">
                Clique em qualquer reta do perfil no gráfico para marcar a <b>Reta 1 (R1)</b>.
              </div>
            ) : !angleEndLine ? (
              <div className="flex flex-col gap-2">
                <div className="text-zinc-300 text-[10px] truncate">
                  <span className="text-pink-400 font-bold">Reta 1 (R1):</span> {angleStartLine.text || `L${Math.floor(angleStartLine.linhaId)}`}
                </div>
                <div className="text-zinc-400 text-[10px] animate-pulse font-sans">
                  Clique em outra reta para marcar a <b>Reta 2 (R2)</b> e medir o ângulo.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-0.5 border-b border-zinc-800/40 pb-1.5 text-[9px] text-zinc-400">
                  <div className="truncate"><span className="text-pink-400 font-bold">R1:</span> {angleStartLine.text || `L${Math.floor(angleStartLine.linhaId)}`}</div>
                  <div className="truncate"><span className="text-[#0ea5e9] font-bold">R2:</span> {angleEndLine.text || `L${Math.floor(angleEndLine.linhaId)}`}</div>
                </div>
                
                {(() => {
                  const dz1 = angleStartLine.z2 - angleStartLine.z1;
                  const dx1 = angleStartLine.x2 - angleStartLine.x1;
                  const dz2 = angleEndLine.z2 - angleEndLine.z1;
                  const dx2 = angleEndLine.x2 - angleEndLine.x1;

                  const l1 = Math.hypot(dz1, dx1);
                  const l2 = Math.hypot(dz2, dx2);

                  if (l1 <= 0.0001 || l2 <= 0.0001) {
                    return <div className="text-rose-400 font-bold text-center">Erro: reta sem comprimento</div>;
                  }

                  const dot = dz1 * dz2 + dx1 * dx2;
                  const cosTheta = Math.max(-1, Math.min(1, dot / (l1 * l2)));
                  const angleRad = Math.acos(cosTheta);
                  const angleDeg = angleRad * (180 / Math.PI);
                  const suppDeg = 180 - angleDeg;

                  const angleMin = Math.min(angleDeg, suppDeg);
                  const angleMax = Math.max(angleDeg, suppDeg);

                  return (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between py-0.5 border-b border-zinc-800/30">
                        <span className="text-zinc-400">Ângulo Agudo:</span>
                        <span className="text-[#39ff14] font-bold">
                          {angleMin.toFixed(2)}°
                        </span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-zinc-400">Ângulo Obtuso:</span>
                        <span className="text-orange-400 font-bold">
                          {angleMax.toFixed(2)}°
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </ResizableBox>
        )}
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

          <button
            onClick={toggleMeasuring}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition border ${
              isMeasuring
                ? "bg-pink-950/40 text-pink-400 border-pink-500/50 animate-pulse"
                : "bg-[#1e1e24] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-850"
            }`}
            title="Régua de Medição (Dois Pontos)"
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleMeasuringAngle}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition border ${
              isMeasuringAngle
                ? "bg-amber-950/40 text-amber-400 border-amber-500/50 animate-pulse"
                : "bg-[#1e1e24] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-850"
            }`}
            title="Régua Angular (Medir ângulo entre duas retas)"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleFrozen}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition border ${
              isFrozen
                ? "bg-blue-950/40 text-blue-400 border-blue-500/50 animate-pulse font-bold"
                : "bg-[#1e1e24] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-850"
            }`}
            title="Congelar Gráfico (Manter desenho estático ao editar o código)"
          >
            <Snowflake className={`w-3.5 h-3.5 ${isFrozen ? 'animate-spin-slow' : ''}`} />
          </button>

          {/* DESENHAR no gráfico: mostra / esconde as ferramentas (Linha, Círculo, Arco, Ponto, Cota) */}
          <button
            onClick={sketchToggleMenu}
            className={"w-7 h-7 rounded-md flex items-center justify-center transition border " + (sketchOpen
              ? "bg-sky-950/60 text-sky-300 border-sky-500/50 font-bold"
              : "bg-[#1e1e24] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-850")}
            title="Desenhar no gráfico (Linha, Círculo, Arco, Ponto e Cota inteligente) — mostra / esconde as ferramentas"
          >
            <SketchIcon k="pen" />
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


/* =====================================================================================
 * DESENHO (ESBOÇO) NO GRÁFICO 2D — igual ao SolidWorks
 * Ferramentas: Linha, Círculo, Arco (3 pontos), Ponto e Cota inteligente
 * Os pontos ficam guardados em medida REAL: z = comprimento, r = raio (no torno X = 2·r)
 * ===================================================================================== */
// Aparência da MIRA e do QUADRADINHO do desenho (escolhida em "Aparência", fica salva no tablet)
export interface CursorStyle {
  miraLinha: string; // cor da mira em cima de uma linha
  miraCanto: string; // cor da mira num canto / emenda do perfil
  miraTam: number; // tamanho da mira em %
  quadLinha: string; // cor do quadradinho do desenho em cima de uma linha
  quadCanto: string; // cor do quadradinho num canto / emenda do perfil
  quadTam: number; // tamanho do quadradinho em %
}
export const CURSOR_STYLE_PADRAO: CursorStyle = { miraLinha: "#00f3ff", miraCanto: "#ffea00", miraTam: 100, quadLinha: "#f97316", quadCanto: "#22c55e", quadTam: 100 };
export type SketchTool = "none" | "line" | "circle" | "arc" | "point" | "dim" | "erase";
export interface SkPt { z: number; r: number }
export interface SketchEnt {
  id: string;
  type: "line" | "circle" | "arc" | "point";
  p: SkPt[]; // linha: [início, fim] | círculo: [centro, ponto da borda] | arco: [início, fim, ponto do meio] | ponto: [p]
  showDim?: boolean; // depois da Cota inteligente a medida fica escrita no desenho
}
export interface SketchView { oX: number; oY: number; zoom: number; s: number }

const skToScreen = (p: SkPt, T: SketchView) => ({ x: T.oX + p.z * T.zoom * T.s, y: T.oY - p.r * T.zoom });
export const skToWorld = (px: number, py: number, T: SketchView): SkPt => ({ z: (px - T.oX) / (T.zoom * T.s), r: (T.oY - py) / T.zoom });
const skDist = (a: SkPt, b: SkPt) => Math.hypot(b.z - a.z, b.r - a.r);
const skFmt = (v: number, d = 2) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d);
export const skParse = (s: string) => parseFloat(String(s).replace(",", "."));

// Centro e raio do arco que passa por 3 pontos
const skCircle3 = (a: SkPt, b: SkPt, c: SkPt) => {
  const d = 2 * (a.z * (b.r - c.r) + b.z * (c.r - a.r) + c.z * (a.r - b.r));
  if (Math.abs(d) < 1e-9) return null; // pontos em linha reta: não dá arco
  const a2 = a.z * a.z + a.r * a.r, b2 = b.z * b.z + b.r * b.r, c2 = c.z * c.z + c.r * c.r;
  const z = (a2 * (b.r - c.r) + b2 * (c.r - a.r) + c2 * (a.r - b.r)) / d;
  const r = (a2 * (c.z - b.z) + b2 * (a.z - c.z) + c2 * (b.z - a.z)) / d;
  return { c: { z, r }, R: Math.hypot(a.z - z, a.r - r) };
};

// Pontos ao longo do arco (início -> passando pelo meio -> fim)
const skArcPts = (p0: SkPt, p1: SkPt, pm: SkPt, n = 48): SkPt[] | null => {
  const k = skCircle3(p0, pm, p1);
  if (!k) return null;
  const ang = (p: SkPt) => Math.atan2(p.r - k.c.r, p.z - k.c.z);
  const TWO = Math.PI * 2;
  const norm = (v: number) => ((v % TWO) + TWO) % TWO;
  const a0 = ang(p0), a1 = ang(p1), am = ang(pm);
  let sweep = norm(a1 - a0);
  if (norm(am - a0) > sweep) sweep = sweep - TWO; // o meio fica do outro lado: gira ao contrário
  const out: SkPt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push({ z: k.c.z + k.R * Math.cos(a), r: k.c.r + k.R * Math.sin(a) });
  }
  return out;
};

const skCirclePts = (c: SkPt, e: SkPt, n = 72): SkPt[] => {
  const R = skDist(c, e);
  const out: SkPt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ z: c.z + R * Math.cos(a), r: c.r + R * Math.sin(a) });
  }
  return out;
};

const skEntPolyline = (e: SketchEnt): SkPt[] => {
  if (e.type === "line") return e.p;
  if (e.type === "circle") return skCirclePts(e.p[0], e.p[1]);
  if (e.type === "arc") return skArcPts(e.p[0], e.p[1], e.p[2]) || [e.p[0], e.p[1]];
  return e.p;
};

// Pontos "imã": pontas, meio das linhas, centros e pontos soltos
const skKeyPoints = (ents: SketchEnt[]): SkPt[] => {
  const out: SkPt[] = [];
  ents.forEach((e) => {
    if (e.type === "line") {
      out.push(e.p[0], e.p[1], { z: (e.p[0].z + e.p[1].z) / 2, r: (e.p[0].r + e.p[1].r) / 2 });
    } else if (e.type === "circle") {
      out.push(e.p[0]);
    } else if (e.type === "arc") {
      out.push(e.p[0], e.p[1]);
      const k = skCircle3(e.p[0], e.p[2], e.p[1]);
      if (k) out.push(k.c);
    } else out.push(e.p[0]);
  });
  return out;
};

// Acha o ponto mais perto (imã). Devolve null se nada estiver perto.
export const skSnapKey = (ents: SketchEnt[], px: number, py: number, T: SketchView, maxPx = 10): SkPt | null => {
  let best: SkPt | null = null;
  let bd = maxPx;
  skKeyPoints(ents).forEach((p) => {
    const s = skToScreen(p, T);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bd) { bd = d; best = p; }
  });
  return best;
};

// Linha: trava Horizontal / Vertical / Paralela a outra linha (como o SolidWorks faz)
export const skInferLine = (a: SkPt, raw: SkPt, ents: SketchEnt[]): { p: SkPt; tag?: string } => {
  const dz = raw.z - a.z, dr = raw.r - a.r;
  const L = Math.hypot(dz, dr);
  if (L < 1e-9) return { p: raw };
  const deg = (Math.atan2(dr, dz) * 180) / Math.PI;
  const off = (target: number) => { let d = Math.abs(((deg - target) % 180 + 180) % 180); return Math.min(d, 180 - d); };
  if (off(0) < 3) return { p: { z: raw.z, r: a.r }, tag: "H" };
  if (off(90) < 3) return { p: { z: a.z, r: raw.r }, tag: "V" };
  for (const e of ents) {
    if (e.type !== "line") continue;
    const ez = e.p[1].z - e.p[0].z, er = e.p[1].r - e.p[0].r;
    const el = Math.hypot(ez, er);
    if (el < 1e-9) continue;
    const ed = (Math.atan2(er, ez) * 180) / Math.PI;
    if (off(ed) < 2.5) {
      const ux = ez / el, ur = er / el;
      const t = dz * ux + dr * ur; // projeta na direção da outra linha
      return { p: { z: a.z + ux * t, r: a.r + ur * t }, tag: "∥" };
    }
  }
  return { p: raw };
};

// Toque/clique em cima de qual desenho?
export const skHit = (ents: SketchEnt[], px: number, py: number, T: SketchView, maxPx = 10): SketchEnt | null => {
  let best: SketchEnt | null = null;
  let bd = maxPx;
  const segD = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
    const vx = x2 - x1, vy = y2 - y1;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((x - x1) * vx + (y - y1) * vy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy));
  };
  ents.forEach((e) => {
    const pts = skEntPolyline(e).map((p) => skToScreen(p, T));
    let d = Infinity;
    if (pts.length === 1) d = Math.hypot(px - pts[0].x, py - pts[0].y);
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segD(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
    if (d < bd) { bd = d; best = e; }
  });
  return best;
};

// Valores que a Cota inteligente mostra/edita
export const skMeasure = (e: SketchEnt): { a: number; b?: number; labelA: string; labelB?: string } => {
  if (e.type === "line") {
    const dz = e.p[1].z - e.p[0].z, dr = e.p[1].r - e.p[0].r;
    return { a: Math.hypot(dz, dr), b: (Math.atan2(dr, dz) * 180) / Math.PI, labelA: "Comprimento (mm)", labelB: "Ângulo (°)" };
  }
  if (e.type === "circle") return { a: skDist(e.p[0], e.p[1]) * 2, labelA: "Diâmetro Ø (mm)" };
  if (e.type === "arc") {
    const k = skCircle3(e.p[0], e.p[2], e.p[1]);
    return { a: k ? k.R : 0, labelA: "Raio R (mm)" };
  }
  return { a: e.p[0].r * 2, b: e.p[0].z, labelA: "X (diâmetro)", labelB: "Z" };
};

// Aplica a nova medida (a primeira ponta fica parada, a outra se move — e quem estava ligado nela vai junto)
export const skApplyDim = (ents: SketchEnt[], id: string, a: number, b?: number): SketchEnt[] => {
  const e = ents.find((x) => x.id === id);
  if (!e || !isFinite(a)) return ents;
  const same = (p: SkPt, q: SkPt) => Math.abs(p.z - q.z) < 1e-6 && Math.abs(p.r - q.r) < 1e-6;
  if (e.type === "line") {
    if (a <= 0) return ents;
    const old = e.p[1];
    const cur = skMeasure(e);
    const angDeg = b !== undefined && isFinite(b) ? b : (cur.b as number);
    const ang = (angDeg * Math.PI) / 180;
    const np: SkPt = { z: e.p[0].z + a * Math.cos(ang), r: e.p[0].r + a * Math.sin(ang) };
    // Quem estava ligado na ponta que mexeu vai junto:
    // - desenho JÁ COTADO anda inteiro (mantém a medida, igual SolidWorks)
    // - desenho sem cota só estica até a nova ponta
    const dz = np.z - old.z, dr = np.r - old.r;
    const out = ents.map((x) => ({ ...x, p: x.p.slice() }));
    const main = out.find((x) => x.id === id)!;
    main.p = [main.p[0], np];
    main.showDim = true;
    const done = new Set<string>([id]);
    const queue: SkPt[] = [old];
    while (queue.length) {
      const pt = queue.shift()!;
      out.forEach((x) => {
        if (done.has(x.id)) return;
        const hitIdx = x.p.map((q, i) => (same(q, pt) ? i : -1)).filter((i) => i >= 0);
        if (!hitIdx.length) return;
        done.add(x.id);
        if (x.showDim && x.type !== "point") {
          x.p.forEach((q, i) => { if (!hitIdx.includes(i)) queue.push({ ...q }); });
          x.p = x.p.map((q) => ({ z: q.z + dz, r: q.r + dr }));
        } else {
          x.p = x.p.map((q, i) => (hitIdx.includes(i) ? { z: q.z + dz, r: q.r + dr } : q));
        }
      });
    }
    return out;
  }
  if (e.type === "circle") {
    if (a <= 0) return ents;
    const c = e.p[0], ed = e.p[1];
    const L = skDist(c, ed) || 1;
    const R = a / 2;
    const np: SkPt = { z: c.z + ((ed.z - c.z) / L) * R, r: c.r + ((ed.r - c.r) / L) * R };
    return ents.map((x) => (x.id === id ? { ...x, p: [c, np], showDim: true } : x));
  }
  if (e.type === "arc") {
    const [p0, p1, pm] = e.p;
    const k = skCircle3(p0, pm, p1);
    const cz = p1.z - p0.z, cr = p1.r - p0.r;
    const cl = Math.hypot(cz, cr);
    if (!k || cl < 1e-9) return ents;
    const h = cl / 2;
    const R = Math.max(a, h);
    const M = { z: (p0.z + p1.z) / 2, r: (p0.r + p1.r) / 2 };
    const nz = -cr / cl, nr = cz / cl; // normal da corda
    const side = Math.sign((pm.z - M.z) * nz + (pm.r - M.r) * nr) || 1;
    const oldSag = Math.hypot(pm.z - M.z, pm.r - M.r);
    const isMajor = oldSag > k.R + 1e-9; // arco maior que meia-volta
    const sag = isMajor ? R + Math.sqrt(R * R - h * h) : R - Math.sqrt(R * R - h * h);
    const nm: SkPt = { z: M.z + nz * sag * side, r: M.r + nr * sag * side };
    return ents.map((x) => (x.id === id ? { ...x, p: [p0, p1, nm], showDim: true } : x));
  }
  // ponto: digita X (diâmetro) e Z
  const np: SkPt = { z: b !== undefined && isFinite(b) ? b : e.p[0].z, r: a / 2 };
  return ents.map((x) => (x.id === id ? { ...x, p: [np] } : x));
};

// Desenha tudo no gráfico
export const drawSketchLayer = (
  ctx: CanvasRenderingContext2D,
  ents: SketchEnt[],
  T: SketchView,
  tool: SketchTool,
  draft: SkPt[],
  hover: { p: SkPt; tag?: string; snapped?: boolean; vertex?: boolean } | null,
  selId: string | null,
  dark: boolean,
  cur: CursorStyle = CURSOR_STYLE_PADRAO // cores e tamanho do quadradinho (Aparência)
) => {
  const LINE = dark ? "#38bdf8" : "#0369a1";
  const SEL = "#f472b6";
  const DIM = dark ? "#fbbf24" : "#b45309";
  const PREV = dark ? "#a5f3fc" : "#0e7490";
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const poly = (pts: SkPt[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const s = skToScreen(p, T); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
    ctx.stroke();
  };
  const dot = (p: SkPt, color: string, size = 3) => {
    const s = skToScreen(p, T);
    ctx.fillStyle = color;
    ctx.fillRect(s.x - size, s.y - size, size * 2, size * 2);
  };
  const label = (txt: string, x: number, y: number, color: string) => {
    ctx.font = "bold 11px ui-monospace, monospace";
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)";
    ctx.fillRect(x - w / 2 - 3, y - 9, w + 6, 14);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(txt, x, y + 2);
    ctx.textAlign = "left";
  };

  // 1) Desenhos prontos
  ents.forEach((e) => {
    const col = e.id === selId ? SEL : LINE;
    ctx.strokeStyle = col;
    ctx.lineWidth = e.id === selId ? 2.4 : 1.8;
    if (e.type === "point") {
      dot(e.p[0], col, 3.5);
    } else {
      poly(skEntPolyline(e));
      if (e.type === "line") { dot(e.p[0], col, 2.5); dot(e.p[1], col, 2.5); }
      if (e.type === "circle") dot(e.p[0], col, 2);
      if (e.type === "arc") { dot(e.p[0], col, 2.5); dot(e.p[1], col, 2.5); }
    }
    // Cota fixa
    if (e.showDim) {
      const m = skMeasure(e);
      if (e.type === "line") {
        const a = skToScreen(e.p[0], T), b = skToScreen(e.p[1], T);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        const off = 16;
        const s = ny > 0 ? -1 : 1; // cota sempre por cima da linha
        ctx.strokeStyle = DIM;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + nx * off * s * 1.3, a.y + ny * off * s * 1.3);
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + nx * off * s * 1.3, b.y + ny * off * s * 1.3);
        ctx.moveTo(a.x + nx * off * s, a.y + ny * off * s); ctx.lineTo(b.x + nx * off * s, b.y + ny * off * s);
        ctx.stroke();
        label(skFmt(m.a), (a.x + b.x) / 2 + nx * off * s, (a.y + b.y) / 2 + ny * off * s, DIM);
      } else if (e.type === "circle") {
        const c = skToScreen(e.p[0], T);
        label("Ø" + skFmt(m.a), c.x, c.y - skDist(e.p[0], e.p[1]) * T.zoom - 10, DIM);
      } else if (e.type === "arc") {
        const s = skToScreen(e.p[2], T);
        label("R" + skFmt(m.a), s.x, s.y - 12, DIM);
      }
    }
  });

  // 2) Prévia do que está sendo desenhado
  const hp = hover ? hover.p : null;
  if (draft.length && hp) {
    ctx.strokeStyle = PREV;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    if (tool === "line") {
      const a = draft[draft.length - 1];
      poly([a, hp]);
      const dz = hp.z - a.z, dr = hp.r - a.r;
      const s = skToScreen(hp, T);
      label(skFmt(Math.hypot(dz, dr)) + "  ∠" + skFmt((Math.atan2(dr, dz) * 180) / Math.PI, 1) + "°" + (hover && hover.tag ? "  " + hover.tag : ""), s.x + 40, s.y - 16, PREV);
    } else if (tool === "circle") {
      poly(skCirclePts(draft[0], hp));
      const s = skToScreen(hp, T);
      label("Ø" + skFmt(skDist(draft[0], hp) * 2), s.x + 30, s.y - 16, PREV);
    } else if (tool === "arc") {
      if (draft.length === 1) poly([draft[0], hp]);
      else {
        const pts = skArcPts(draft[0], draft[1], hp);
        if (pts) {
          poly(pts);
          const k = skCircle3(draft[0], hp, draft[1]);
          const s = skToScreen(hp, T);
          if (k) label("R" + skFmt(k.R), s.x + 30, s.y - 16, PREV);
        } else poly([draft[0], draft[1]]);
      }
    }
    ctx.setLineDash([]);
  }
  draft.forEach((p) => dot(p, PREV, 3));

  // 3) Cursor do desenho (mostra X em diâmetro e Z, igual ao torno)
  if (hp && tool !== "none" && tool !== "dim" && tool !== "erase") {
    const s = skToScreen(hp, T);
    // quadradinho: em cima de uma linha = cor "na linha"; em canto/emenda do perfil = outra cor e maior (igual à mira)
    const vtx = !!(hover && hover.snapped && hover.vertex);
    ctx.strokeStyle = hover && hover.snapped ? (vtx ? cur.quadCanto : cur.quadLinha) : PREV;
    ctx.lineWidth = vtx ? 2 : 1.2;
    const q = (vtx ? 8 : 5) * (cur.quadTam / 100);
    if (hover && hover.snapped) ctx.strokeRect(s.x - q, s.y - q, q * 2, q * 2);
    else { ctx.beginPath(); ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7); ctx.stroke(); }
    if (!draft.length) label("X" + skFmt(hp.r * 2, 3) + " Z" + skFmt(hp.z, 3), s.x + 62, s.y + 22, PREV);
  }
  ctx.restore();
};

// Ícones simples (desenhados aqui mesmo, sem depender de biblioteca)
const SkIcon: React.FC<{ k: string }> = ({ k }) => {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "line") return (<svg {...p}><line x1="5" y1="19" x2="19" y2="5" /><circle cx="5" cy="19" r="1.6" fill="currentColor" /><circle cx="19" cy="5" r="1.6" fill="currentColor" /></svg>);
  if (k === "circle") return (<svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></svg>);
  if (k === "arc") return (<svg {...p}><path d="M4 18 A 9 9 0 0 1 20 18" /><circle cx="4" cy="18" r="1.6" fill="currentColor" /><circle cx="20" cy="18" r="1.6" fill="currentColor" /><circle cx="12" cy="9.3" r="1.6" fill="currentColor" /></svg>);
  if (k === "point") return (<svg {...p}><rect x="9" y="9" width="6" height="6" fill="currentColor" /></svg>);
  if (k === "dim") return (<svg {...p}><line x1="4" y1="20" x2="4" y2="10" /><line x1="20" y1="20" x2="20" y2="10" /><line x1="4" y1="13" x2="20" y2="13" /><polyline points="7 10 4 13 7 16" /><polyline points="17 10 20 13 17 16" /><line x1="9" y1="5" x2="15" y2="5" /></svg>);
  if (k === "erase") return (<svg {...p}><path d="M20 20H9l-5-5 10-10 7 7-6 6" /><line x1="9" y1="10" x2="15" y2="16" /></svg>);
  if (k === "undo") return (<svg {...p}><polyline points="9 14 4 9 9 4" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>);
  if (k === "trash") return (<svg {...p}><polyline points="4 7 20 7" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>);
  if (k === "ok") return (<svg {...p}><polyline points="5 12 10 17 19 7" /></svg>);
  if (k === "pen") return (<svg {...p} width={14} height={14}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
  return null;
};
export const SketchIcon = SkIcon;

// Barra de ferramentas do desenho (aparece/some pelo botão de lápis lá embaixo)
export const SketchToolbar: React.FC<{
  tool: SketchTool;
  onTool: (t: SketchTool) => void;
  onUndo: () => void;
  onClear: () => void;
  onFinish: () => void;
  hasDraft: boolean;
  count: number;
}> = ({ tool, onTool, onUndo, onClear, onFinish, hasDraft, count }) => {
  const items: { k: SketchTool; title: string }[] = [
    { k: "dim", title: "Cota inteligente — toque na linha, círculo ou arco e digite a medida" },
    { k: "line", title: "Linha — toque no início e no fim (continua emendando; toque 2x no mesmo ponto ou Esc para parar)" },
    { k: "circle", title: "Círculo — toque no centro e depois na borda" },
    { k: "arc", title: "Arco 3 pontos — toque no início, no fim e depois na curva" },
    { k: "point", title: "Ponto" },
  ];
  const btn = "w-9 h-9 rounded-md flex items-center justify-center border transition";
  const on = "bg-sky-900/70 text-sky-200 border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.35)]";
  const off = "bg-[#1e1e24]/90 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-white";
  return (
    <div
      className="absolute left-2 top-16 z-30 flex flex-col gap-1 p-1 rounded-lg bg-black/70 border border-zinc-700 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button key={it.k} title={it.title} onClick={() => onTool(tool === it.k ? "none" : it.k)} className={btn + " " + (tool === it.k ? on : off)}>
          <SkIcon k={it.k} />
        </button>
      ))}
      <div className="h-px bg-zinc-700 my-0.5" />
      {hasDraft && (
        <button title="Concluir (parar a linha)" onClick={onFinish} className={btn + " bg-emerald-900/70 text-emerald-200 border-emerald-500"}>
          <SkIcon k="ok" />
        </button>
      )}
      <button title="Apagar um desenho (toque nele)" onClick={() => onTool(tool === "erase" ? "none" : "erase")} className={btn + " " + (tool === "erase" ? "bg-rose-900/70 text-rose-200 border-rose-400" : off)}>
        <SkIcon k="erase" />
      </button>
      <button title="Desfazer" onClick={onUndo} className={btn + " " + off}>
        <SkIcon k="undo" />
      </button>
      <button
        title="Limpar todo o desenho"
        onClick={() => { if (count && window.confirm("Apagar todo o desenho do gráfico?")) onClear(); }}
        className={btn + " " + off}
      >
        <SkIcon k="trash" />
      </button>
    </div>
  );
};
