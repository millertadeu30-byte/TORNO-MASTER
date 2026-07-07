import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, Hexagon, Info, CornerDownLeft, Settings, RotateCw, ShieldAlert, ZoomIn, ZoomOut, Trash2 } from "lucide-react";

interface PolygonCalculatorProps {
  onClose: () => void;
  onInsertCode: (code: string) => void;
  isHighContrast?: boolean;
}

type PolyType = "face" | "vertice" | "quadrado";

interface TableRow {
  name: string;
  x: number;
  c: number;
  r: number | null;
  desc: string;
}

export const PolygonCalculator: React.FC<PolygonCalculatorProps> = ({
  onClose,
  onInsertCode,
  isHighContrast = false,
}) => {
  // Configs
  const [polyType, setPolyType] = useState<PolyType>("face");
  
  // Interactive Bidirectional Inputs
  const [diamSext, setDiamSext] = useState<number>(31.2);
  const [diamBarra, setDiamBarra] = useState<number>(36.0);
  
  // Cutter & Corner Inputs (The only edited ones according to user)
  const [diamFresa, setDiamFresa] = useState<number>(16.0);
  const [quebraCantos, setQuebraCantos] = useState<number>(2.0);
  
  // Cutting Data (Dynamic G-code fields)
  const [toolNumber, setToolNumber] = useState<string>("T0909");
  const [spindle, setSpindle] = useState<number>(4000);
  const [feed, setFeed] = useState<number>(400);
  const [depthZ, setDepthZ] = useState<string>("-15");

  const [copied, setCopied] = useState<boolean>(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(5.0, Number((prev + 0.1).toFixed(1))));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))));
  };

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar tudo nesta tela?")) {
      setDiamSext(0);
      setDiamBarra(0);
      setDiamFresa(0);
      setQuebraCantos(0);
      setToolNumber("");
      setSpindle(0);
      setFeed(0);
      setDepthZ("");
    }
  };

  // Constants
  const CONST_HEX = 1.154;
  const CONST_SQR = 1.414;

  const currentConstant = polyType === "quadrado" ? CONST_SQR : CONST_HEX;

  // Bidirectional calculations
  const handleSextChange = (val: number) => {
    setDiamSext(val);
    setDiamBarra(Number((val * currentConstant).toFixed(2)));
  };

  const handleBarraChange = (val: number) => {
    setDiamBarra(val);
    setDiamSext(Number((val / currentConstant).toFixed(2)));
  };

  // Sync values on type change
  useEffect(() => {
    // Keep flat size and recalculate bar size
    setDiamBarra(Number((diamSext * currentConstant).toFixed(2)));
  }, [polyType]);

  // Geometric math for coordinates
  const getTableRows = (): TableRow[] => {
    const rows: TableRow[] = [];
    const S = diamSext;
    const R = quebraCantos > 0 ? quebraCantos : null;

    if (polyType === "face") {
      const Rext = S / Math.sqrt(3);
      const halfC = Rext * 0.5;

      rows.push(
        { name: "1", x: S, c: 0, r: null, desc: "Entrada na face plana principal" },
        { name: "2", x: S, c: Number(halfC.toFixed(3)), r: R, desc: "Canto plano superior direito" },
        { name: "3", x: 0, c: Number(Rext.toFixed(3)), r: R, desc: "Canto superior (vértice)" },
        { name: "4", x: -S, c: Number(halfC.toFixed(3)), r: R, desc: "Canto superior esquerdo" },
        { name: "5", x: -S, c: Number(-halfC.toFixed(3)), r: R, desc: "Canto inferior esquerdo" },
        { name: "6", x: 0, c: Number(-Rext.toFixed(3)), r: R, desc: "Canto inferior (vértice)" },
        { name: "7", x: S, c: Number(-halfC.toFixed(3)), r: R, desc: "Canto inferior direito" },
        { name: "8", x: S, c: Number(halfC.toFixed(3)), r: null, desc: "Fechamento do sextavado" }
      );
    } else if (polyType === "vertice") {
      const Rext = S / Math.sqrt(3);
      const halfC = S * 0.5;

      rows.push(
        { name: "1", x: Number((2 * Rext).toFixed(3)), c: 0, r: R, desc: "Vértice inicial à direita" },
        { name: "2", x: Number(Rext.toFixed(3)), c: Number(halfC.toFixed(3)), r: R, desc: "Vértice superior direito" },
        { name: "3", x: Number(-Rext.toFixed(3)), c: Number(halfC.toFixed(3)), r: R, desc: "Vértice superior esquerdo" },
        { name: "4", x: Number((-2 * Rext).toFixed(3)), c: 0, r: R, desc: "Vértice esquerdo" },
        { name: "5", x: Number(-Rext.toFixed(3)), c: Number(-halfC.toFixed(3)), r: R, desc: "Vértice inferior esquerdo" },
        { name: "6", x: Number(Rext.toFixed(3)), c: Number(-halfC.toFixed(3)), r: R, desc: "Vértice inferior direito" },
        { name: "7", x: Number((2 * Rext).toFixed(3)), c: 0, r: null, desc: "Fechamento do perfil no vértice" }
      );
    } else {
      // Quadrado (Square)
      const halfC = S * 0.5;

      rows.push(
        { name: "1", x: S, c: 0, r: null, desc: "Entrada na face plana direita" },
        { name: "2", x: S, c: Number(halfC.toFixed(3)), r: R, desc: "Vértice superior direito" },
        { name: "3", x: -S, c: Number(halfC.toFixed(3)), r: R, desc: "Vértice superior esquerdo" },
        { name: "4", x: -S, c: Number(-halfC.toFixed(3)), r: R, desc: "Vértice inferior esquerdo" },
        { name: "5", x: S, c: Number(-halfC.toFixed(3)), r: R, desc: "Vértice inferior direito" },
        { name: "6", x: S, c: Number(halfC.toFixed(3)), r: null, desc: "Fechamento do quadrado" }
      );
    }
    return rows;
  };

  const tableRows = getTableRows();

  // Generate CNC program matching user's template structure precisely
  const generateGCode = (): string => {
    let pgm = `G54G0X150Z150\n`;
    pgm += `${toolNumber}\n`;
    pgm += `G97/S${spindle}M15 (liga ferr. acionada sentido horario)\n`;
    pgm += `M19 (orienta eixo c)\n`;
    pgm += `G28\n`;
    pgm += `G0C0\n`;
    pgm += `G94 (mm por minutos)\n`;
    pgm += `M86 (liga o freio com baixo torque para o eixo árvore)\n`;
    
    // Safety clearance approach
    const clearanceX = Number((diamBarra + diamFresa + 10).toFixed(1));
    const entryX = Number((diamBarra + diamFresa + 5).toFixed(1));
    
    const parsedDepthZ = parseFloat(String(depthZ).replace(",", ".")) || 0;

    pgm += `G0X${entryX}Z0M8\n`;
    pgm += `G1Z${parsedDepthZ}F400\n`;
    pgm += `G12.1 ( Ativa coordenadas polares)\n`;

    // Active coordinates loop with G42 Cutter Compensation
    tableRows.forEach((row, idx) => {
      const isFirst = idx === 0;
      const gComp = isFirst ? "G42G1" : "G1";
      const rSuffix = row.r !== null ? `,R${row.r}` : "";
      const fSuffix = isFirst ? `F${feed}` : "";
      
      pgm += `${gComp}X${row.x.toFixed(3)}C${row.c.toFixed(3)}${rSuffix}${fSuffix ? " " + fSuffix : ""}\n`;
    });

    // Exit & Cancellation
    pgm += `G40G1X${clearanceX}C0F600\n`;
    pgm += `G13.1 ( Desativa coordenadas polares)\n`;
    pgm += `M17 (desliga rotativa)\n`;
    pgm += `M18 (desliga orientação eixo arvore)\n`;
    pgm += `G95\n`;
    pgm += `G54G0X150Z150M5\n\n`;
    pgm += `M30`;

    return pgm;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateGCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    onInsertCode(generateGCode());
    onClose();
  };

  // Big, professional 2D work rendering
  const renderSVGPreview = () => {
    const size = 360;
    const cx = size / 2;
    const cy = size / 2;
    
    // Outer scale mapping
    const maxDimension = Math.max(diamBarra, diamSext + diamFresa) * 1.25;
    const scale = ((size / 2) / (maxDimension / 2)) * zoom;

    const toX = (val: number) => cx + val * scale;
    const toY = (val: number) => cy - val * scale;

    const barRadius = (diamBarra / 2) * scale;

    // Draw the actual milled polygon points
    const vertices: [number, number][] = [];
    if (polyType === "face") {
      const Rext = diamSext / Math.sqrt(3);
      for (let angle = 30; angle < 390; angle += 60) {
        const rad = (angle * Math.PI) / 180;
        vertices.push([Rext * Math.cos(rad), Rext * Math.sin(rad)]);
      }
    } else if (polyType === "vertice") {
      const Rext = diamSext / Math.sqrt(3);
      for (let angle = 0; angle < 360; angle += 60) {
        const rad = (angle * Math.PI) / 180;
        vertices.push([Rext * Math.cos(rad), Rext * Math.sin(rad)]);
      }
    } else {
      const rSqr = (diamSext / 2) / Math.cos(Math.PI / 4);
      for (let angle = 45; angle < 360; angle += 90) {
        const rad = (angle * Math.PI) / 180;
        vertices.push([rSqr * Math.cos(rad), rSqr * Math.sin(rad)]);
      }
    }

    const pointsStr = vertices.map(([vx, vy]) => `${toX(vx)},${toY(vy)}`).join(" ");

    // Highlight dot & cutter representation on hover
    let hoveredCutter: React.ReactNode = null;
    let hoveredPointDot: React.ReactNode = null;

    if (hoveredRow !== null) {
      const row = tableRows[hoveredRow];
      const drawX = row.x / 2; // Diameter to Radius convert
      const drawY = row.c;

      const px = toX(drawX);
      const py = toY(drawY);

      hoveredPointDot = (
        <circle cx={px} cy={py} r="6" fill="#ef4444" className="animate-ping" />
      );

      const toolRadius = (diamFresa / 2) * scale;
      hoveredCutter = (
        <g>
          <circle
            cx={px}
            cy={py}
            r={toolRadius}
            fill="#ef4444"
            fillOpacity="0.18"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4,3"
          />
          <circle cx={px} cy={py} r="3" fill="#ef4444" />
        </g>
      );
    }

    return (
      <svg className="w-full h-full select-none" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="metalGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={isHighContrast ? "#f4f4f5" : "#1b1b24"} />
            <stop offset="90%" stopColor={isHighContrast ? "#e4e4e7" : "#121217"} />
            <stop offset="100%" stopColor={isHighContrast ? "#cbd5e1" : "#08080a"} />
          </radialGradient>
        </defs>

        {/* Technical Coordinate axes */}
        <line x1="0" y1={cy} x2={size} y2={cy} stroke={isHighContrast ? "#cbd5e1" : "#242435"} strokeWidth="1" strokeDasharray="3,3" />
        <line x1={cx} y1="0" x2={cx} y2={size} stroke={isHighContrast ? "#cbd5e1" : "#242435"} strokeWidth="1" strokeDasharray="3,3" />

        {/* Standard raw bar circle */}
        <circle
          cx={cx}
          cy={cy}
          r={barRadius}
          fill="url(#metalGrad)"
          stroke={isHighContrast ? "#94a3b8" : "#3f3f56"}
          strokeWidth="2.5"
        />

        {/* Original workpiece border warning */}
        <circle
          cx={cx}
          cy={cy}
          r={barRadius}
          fill="none"
          stroke={isHighContrast ? "#000" : "#ff9e00"}
          strokeOpacity="0.25"
          strokeWidth="1"
          strokeDasharray="5,4"
        />

        {/* Finished Milled Polygon layout */}
        <polygon
          points={pointsStr}
          fill="none"
          stroke={isHighContrast ? "#2563eb" : "#00f3ff"}
          strokeWidth="3"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* Draw vertices coordinates */}
        {(() => {
          const uniquePoints: {
            x: number;
            c: number;
            names: string[];
            indices: number[];
          }[] = [];

          tableRows.forEach((row, idx) => {
            const existing = uniquePoints.find(
              p => Math.abs(p.x - row.x) < 0.05 && Math.abs(p.c - row.c) < 0.05
            );
            if (existing) {
              existing.names.push(row.name);
              existing.indices.push(idx);
            } else {
              uniquePoints.push({
                x: row.x,
                c: row.c,
                names: [row.name],
                indices: [idx],
              });
            }
          });

          return uniquePoints.map((pt) => {
            const drawX = pt.x / 2;
            const drawY = pt.c;
            const px = toX(drawX);
            const py = toY(drawY);

            // Any of the grouped points hovered?
            const isHovered = pt.indices.some(idx => hoveredRow === idx);

            // Generate label text, e.g. "2/8: X16.00 C4.62"
            const labelNames = pt.names.join("/");
            const labelCoords = `X${pt.x.toFixed(2)} C${pt.c.toFixed(2)}`;
            const labelText = `${labelNames}: ${labelCoords}`;

            // Calculate angle from center for radial offset of labels
            const angle = Math.atan2(drawY, drawX);
            const dist = 14; // spacing from green dot
            const pxText = px + Math.cos(angle) * dist;
            const pyText = py - Math.sin(angle) * dist;

            // Determine text anchor
            let textAnchor = "middle";
            if (Math.cos(angle) > 0.3) {
              textAnchor = "start";
            } else if (Math.cos(angle) < -0.3) {
              textAnchor = "end";
            }

            // Determine vertical baseline shift
            let dy = "0.35em"; // central
            if (Math.sin(angle) > 0.5) {
              dy = "-0.2em"; // shift up
            } else if (Math.sin(angle) < -0.5) {
              dy = "0.8em"; // shift down
            }

            return (
              <g
                key={labelNames}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRow(pt.indices[0])}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={isHovered ? "6" : "4.5"}
                  fill={isHovered ? "#ef4444" : isHighContrast ? "#1d4ed8" : "#39ff14"}
                  stroke={isHighContrast ? "#fff" : "#000"}
                  strokeWidth="1.5"
                  className="transition-all duration-150"
                />
                <text
                  x={pxText}
                  y={pyText}
                  textAnchor={textAnchor}
                  dy={dy}
                  fill={isHovered ? "#ef4444" : isHighContrast ? "#0f172a" : "#39ff14"}
                  stroke={isHighContrast ? "#ffffff" : "#000000"}
                  strokeWidth="3.5"
                  paintOrder="stroke fill"
                  strokeLinejoin="round"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="black"
                  className="drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)]"
                >
                  {labelText}
                </text>
              </g>
            );
          });
        })()}

        {/* Direction Indicator C+ (Spindle orientation) */}
        <path
          d={`M ${cx + barRadius + 20},${cy} A ${barRadius + 20},${barRadius + 20} 0 0,0 ${cx + (barRadius + 20) * Math.cos(Math.PI/4)},${cy - (barRadius + 20) * Math.sin(Math.PI/4)}`}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          markerEnd="url(#redArrow)"
          strokeDasharray="4,2.5"
        />
        <text
          x={cx + (barRadius + 25) * Math.cos(Math.PI/6)}
          y={cy - (barRadius + 25) * Math.sin(Math.PI/6)}
          fill="#ef4444"
          fontSize="12"
          fontWeight="bold"
          fontFamily="monospace"
        >
          C+
        </text>

        {/* Coordinate Axis Labels */}
        <text x={size - 20} y={cy + 15} fill={isHighContrast ? "#475569" : "#64748b"} fontSize="10" fontFamily="monospace" fontWeight="bold">X+</text>
        <text x="10" y={cy + 15} fill={isHighContrast ? "#475569" : "#64748b"} fontSize="10" fontFamily="monospace" fontWeight="bold">X-</text>
        <text x={cx + 8} y="20" fill={isHighContrast ? "#475569" : "#64748b"} fontSize="10" fontFamily="monospace" fontWeight="bold">C+</text>
        <text x={cx + 8} y={size - 10} fill={isHighContrast ? "#475569" : "#64748b"} fontSize="10" fontFamily="monospace" fontWeight="bold">C-</text>

        {/* Overlays on Hover */}
        {hoveredCutter}
        {hoveredPointDot}

        {/* SVG Defs */}
        <defs>
          <marker id="redArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
        </defs>
      </svg>
    );
  };

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isHighContrast ? "bg-white text-black" : "bg-[#0b0b0e] text-zinc-100"}`}>
        {/* Content Body split in 3 panels */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          
          {/* Panel 1: User-Edited Fields only (lg:col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Settings className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Variáveis do Polígono</h4>
            </div>

            {/* Geometria de Polígono */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase text-zinc-400">Geometria e Alinhamento</label>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a]"}`}>
                <button
                  onClick={() => setPolyType("face")}
                  className={`text-[10px] font-bold py-2 rounded transition ${
                    polyType === "face"
                      ? isHighContrast
                        ? "bg-cyan-600 text-white"
                        : "bg-cyan-500/20 text-[#00f3ff]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Sext. Face
                </button>
                <button
                  onClick={() => setPolyType("vertice")}
                  className={`text-[10px] font-bold py-2 rounded transition ${
                    polyType === "vertice"
                      ? isHighContrast
                        ? "bg-cyan-600 text-white"
                        : "bg-cyan-500/20 text-[#00f3ff]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Sext. Vértice
                </button>
                <button
                  onClick={() => setPolyType("quadrado")}
                  className={`text-[10px] font-bold py-2 rounded transition ${
                    polyType === "quadrado"
                      ? isHighContrast
                        ? "bg-cyan-600 text-white"
                        : "bg-cyan-500/20 text-[#00f3ff]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Quadrado
                </button>
              </div>
            </div>

            {/* Bidirectional Linking: Diam Sextavado & Diam Barra */}
            <div className={`p-3 rounded-xl border flex flex-col gap-3.5 ${
              isHighContrast ? "bg-zinc-50 border-zinc-300" : "bg-[#101015] border-zinc-850"
            }`}>
              {/* Diameter S (Hex/Square Flat size) */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className={isHighContrast ? "text-zinc-700" : "text-zinc-300 font-bold"}>
                    {polyType === "quadrado" ? "DIÂMETRO DO QUADRADO (S):" : "DIÂMETRO DO SEXTAVADO (S):"}
                  </span>
                  <span className="font-bold text-[#00f3ff]">{diamSext}mm</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  value={diamSext}
                  onChange={(e) => handleSextChange(parseFloat(e.target.value) || 0)}
                  className={`text-xs px-3 py-2 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#181820] border border-zinc-800 text-white focus:border-[#00f3ff]/50"
                  }`}
                />
              </div>

              {/* Dynamic Constant Indicator */}
              <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-mono italic">
                <span className="h-px bg-zinc-800 flex-1" />
                <span>Constante: {currentConstant}</span>
                <span className="h-px bg-zinc-800 flex-1" />
              </div>

              {/* Diameter Barra B (Workpiece diameter) */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className={isHighContrast ? "text-zinc-700" : "text-zinc-300 font-bold"}>DIÂMETRO DA BARRA (B):</span>
                  <span className="font-bold text-cyan-400">{diamBarra}mm</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  value={diamBarra}
                  onChange={(e) => handleBarraChange(parseFloat(e.target.value) || 0)}
                  className={`text-xs px-3 py-2 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#181820] border border-zinc-800 text-white focus:border-[#00f3ff]/50"
                  }`}
                />
              </div>
            </div>

            {/* Cutter & Corners */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Diâm. da Fresa</label>
                <input
                  type="number"
                  step="1"
                  value={diamFresa}
                  onChange={(e) => setDiamFresa(parseFloat(e.target.value) || 0)}
                  className={`text-xs px-3 py-2 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Arredondamento (,R)</label>
                <input
                  type="number"
                  step="0.5"
                  value={quebraCantos}
                  onChange={(e) => setQuebraCantos(parseFloat(e.target.value) || 0)}
                  className={`text-xs px-3 py-2 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
            </div>

            {/* Technical Cutting Parameters */}
            <div className={`p-3 rounded-xl border grid grid-cols-2 gap-3.5 ${
              isHighContrast ? "bg-zinc-50 border-zinc-200" : "bg-[#101015] border-zinc-850"
            }`}>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase text-zinc-400">Ferramenta (T)</label>
                <input
                  type="text"
                  value={toolNumber}
                  onChange={(e) => setToolNumber(e.target.value)}
                  className={`text-xs px-2.5 py-1.5 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase text-zinc-400 font-bold text-yellow-500">Rotação (S) RPM</label>
                <input
                  type="number"
                  value={spindle}
                  onChange={(e) => setSpindle(parseInt(e.target.value) || 0)}
                  className={`text-xs px-2.5 py-1.5 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase text-zinc-400">Avanço F mm/min</label>
                <input
                  type="number"
                  value={feed}
                  onChange={(e) => setFeed(parseInt(e.target.value) || 0)}
                  className={`text-xs px-2.5 py-1.5 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase text-zinc-400 font-bold text-cyan-450">Profundidade Z</label>
                <input
                  type="text"
                  value={depthZ}
                  onChange={(e) => setDepthZ(e.target.value)}
                  placeholder="Ex: -15"
                  className={`text-xs px-2.5 py-1.5 rounded font-mono ${
                    isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a] border border-zinc-850 text-white"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Panel 2: Big 2D Workpiece Graphic (lg:col-span-5) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-between border-l border-r border-zinc-800/40 px-5">
            <div className="w-full flex justify-between items-center pb-2 border-b border-zinc-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <RotateCw className="w-4 h-4 animate-spin-slow text-[#00f3ff]" />
                <span>Perfil 2D de Usinagem</span>
              </h4>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">Zoom Adaptado</span>
            </div>

            {/* Huge rendering area */}
            <div className={`relative w-full aspect-square rounded-2xl p-4 flex items-center justify-center my-auto shadow-inner overflow-hidden ${
              isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#07070a] border border-zinc-850"
            }`}>
              {renderSVGPreview()}

              {/* Floating Zoom Controls */}
              <div className={`absolute bottom-4 right-4 flex items-center gap-1 p-1.5 rounded-lg shadow-lg backdrop-blur-sm z-10 border ${
                isHighContrast
                  ? "bg-white/90 border-zinc-300 text-zinc-800"
                  : "bg-zinc-900/80 border-zinc-800/80 text-white"
              }`}>
                <button
                  onClick={handleZoomOut}
                  title="Diminuir Zoom (-)"
                  className={`p-1.5 rounded transition-colors ${
                    isHighContrast
                      ? "hover:bg-zinc-100 text-zinc-700 hover:text-black"
                      : "hover:bg-zinc-800/80 text-zinc-300 hover:text-white"
                  }`}
                  id="btn-zoom-out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(1.0)}
                  title="Resetar Zoom para 100%"
                  className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                    isHighContrast
                      ? "hover:bg-zinc-100 text-zinc-500 hover:text-black"
                      : "hover:bg-zinc-800/80 text-zinc-400 hover:text-white"
                  }`}
                  id="btn-zoom-reset"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  title="Aumentar Zoom (+)"
                  className={`p-1.5 rounded transition-colors ${
                    isHighContrast
                      ? "hover:bg-zinc-100 text-zinc-700 hover:text-black"
                      : "hover:bg-zinc-800/80 text-zinc-300 hover:text-white"
                  }`}
                  id="btn-zoom-in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[10px] text-zinc-400 italic bg-[#101015] p-2.5 rounded-lg border border-zinc-850 w-full mt-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Dica: Mova o mouse sobre as coordenadas na tabela ao lado para visualizar o diâmetro da ferramenta tocando o ponto!</span>
            </div>
          </div>

          {/* Panel 3: Coordinate Readouts (lg:col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden">
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Pontos do Perfil</h4>
            
            <div className={`flex-1 overflow-auto rounded-xl border ${
              isHighContrast ? "border-zinc-300 bg-white" : "border-zinc-850 bg-[#0c0c10]"
            }`}>
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className={`border-b ${isHighContrast ? "bg-zinc-200 border-zinc-300 text-black" : "bg-[#14141a] border-zinc-850 text-zinc-400"}`}>
                    <th className="p-2.5 font-bold text-center">PONTO</th>
                    <th className="p-2.5 font-bold text-center">X (Diâm)</th>
                    <th className="p-2.5 font-bold text-center">C (Lin)</th>
                    <th className="p-2.5 font-bold text-center">RAIO</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => {
                    const isHovered = hoveredRow === idx;
                    return (
                      <tr
                        key={row.name + idx}
                        onMouseEnter={() => setHoveredRow(idx)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className={`border-b transition-colors cursor-pointer ${
                          isHovered
                            ? isHighContrast
                              ? "bg-cyan-100 text-black font-bold"
                              : "bg-cyan-950/40 text-[#00f3ff]"
                            : isHighContrast
                              ? "border-zinc-250 text-zinc-900"
                              : "border-zinc-900 text-zinc-350 hover:bg-zinc-900/30"
                        }`}
                      >
                        <td className="p-2.5 text-center font-bold text-cyan-400">{row.name}</td>
                        <td className="p-2.5 text-center font-bold">{row.x.toFixed(3)}</td>
                        <td className="p-2.5 text-center font-bold">{row.c.toFixed(3)}</td>
                        <td className="p-2.5 text-center font-mono text-purple-400 font-extrabold">
                          {row.r !== null ? `,R${row.r}` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Bottom Generated G-Code & Actions */}
        <div className={`p-4 border-t flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 ${
          isHighContrast ? "border-black bg-zinc-100" : "border-zinc-900 bg-[#0f0f14]"
        }`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#39ff14] mb-1.5 font-mono">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span>PROGRAMA G-CODE COMPATÍVEL FANUC / MITSUBISHI (INTERPOLAÇÃO POLAR G12.1)</span>
            </div>
            <pre className={`text-[9.5px] font-mono p-3 rounded-lg overflow-x-auto border max-h-[110px] whitespace-pre select-text ${
              isHighContrast ? "bg-zinc-200 border-zinc-400 text-black" : "bg-[#050507] border-zinc-850 text-zinc-350"
            }`}>
              {generateGCode()}
            </pre>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className={`text-xs font-bold py-2 px-3 rounded-lg border transition-all duration-200 flex items-center justify-center gap-1.5 ${
                copied
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : isHighContrast
                    ? "bg-zinc-200 hover:bg-zinc-300 text-black border-zinc-400"
                    : "bg-[#181820] hover:bg-[#20202a] text-zinc-300 border-zinc-800"
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>

            <button
              onClick={handleInsert}
              className={`text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 shadow-lg transition-all duration-200 ${
                isHighContrast
                  ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                  : "bg-cyan-400 hover:bg-cyan-350 text-black font-extrabold shadow-cyan-950/20 hover:scale-[1.01]"
              }`}
            >
              <CornerDownLeft className="w-4 h-4" />
              <span>Inserir no Editor</span>
            </button>
          </div>
        </div>
    </div>
  );
};
