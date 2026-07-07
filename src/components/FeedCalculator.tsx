import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, HelpCircle, ArrowRight, Settings, Play, Trash2 } from "lucide-react";

interface FeedCalculatorProps {
  onClose: () => void;
  onInsertCode: (code: string) => void;
  isHighContrast?: boolean;
}

export const FeedCalculator: React.FC<FeedCalculatorProps> = ({
  onClose,
  onInsertCode,
  isHighContrast = false,
}) => {
  // Inputs & Mode
  const [calcMode, setCalcMode] = useState<"vf" | "f">("vf");
  const [feedRate, setFeedRate] = useState<number>(0.2); // f (mm/rot)
  const [rpmVal, setRpmVal] = useState<number>(1145); // N (RPM)
  const [linearFeed, setLinearFeed] = useState<number>(229); // Vf (mm/min)
  
  const [copied, setCopied] = useState<boolean>(false);

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar tudo nesta tela?")) {
      setFeedRate(0);
      setRpmVal(0);
      setLinearFeed(0);
    }
  };

  // Recalculate values based on mode
  useEffect(() => {
    if (calcMode === "vf") {
      if (feedRate > 0 && rpmVal > 0) {
        setLinearFeed(Math.round(feedRate * rpmVal));
      } else {
        setLinearFeed(0);
      }
    }
  }, [feedRate, rpmVal, calcMode]);

  useEffect(() => {
    if (calcMode === "f") {
      if (linearFeed > 0 && rpmVal > 0) {
        setFeedRate(parseFloat((linearFeed / rpmVal).toFixed(4)));
      } else {
        setFeedRate(0);
      }
    }
  }, [linearFeed, rpmVal, calcMode]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate dynamic G-code preview based on current inputs
  const generateGCode = (): string => {
    let lines: string[] = [];
    if (calcMode === "vf") {
      lines.push(`; CALCULADORA AVANÇO (Direto): f = ${feedRate.toFixed(3)} mm/volta | Spindle = ${rpmVal} RPM`);
      lines.push(`; Avanço Linear calculado: Vf = ${linearFeed} mm/min`);
      lines.push(`G95; (Ativar modo de avanço por rotação F em mm/volta)`);
      lines.push(`F${feedRate.toFixed(3)}; (Definir taxa de avanço para ${feedRate.toFixed(3)} mm/volta)`);
    } else {
      lines.push(`; CALCULADORA AVANÇO (Inverso): Vf = ${linearFeed} mm/min | Spindle = ${rpmVal} RPM`);
      lines.push(`; Avanço por Volta calculado: f = ${feedRate.toFixed(4)} mm/volta`);
      lines.push(`G95; (Ativar modo de avanço por rotação F em mm/volta)`);
      lines.push(`F${feedRate.toFixed(4)}; (Definir taxa de avanço para ${feedRate.toFixed(4)} mm/volta)`);
    }
    return lines.join("\n");
  };

  const codePreview = generateGCode();

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isHighContrast ? "bg-white text-black font-semibold" : "bg-[#0b0b0e] text-zinc-100"}`}>
        {/* Content Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          
          {/* Panel 1: Settings and Inputs (col-span-5) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Settings className="w-4 h-4 text-[#39ff14]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#39ff14]">Variáveis de Avanço</h4>
            </div>

            {/* Seleção do Modo de Cálculo */}
            <div className="flex gap-2 p-1 bg-[#121216] border border-zinc-850 rounded-lg">
              <button
                type="button"
                onClick={() => setCalcMode("vf")}
                className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer text-center ${
                  calcMode === "vf"
                    ? "bg-[#39ff14]/15 text-[#39ff14] border border-[#39ff14]/30"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                Direto: f ➔ Vf (mm/min)
              </button>
              <button
                type="button"
                onClick={() => setCalcMode("f")}
                className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer text-center ${
                  calcMode === "f"
                    ? "bg-[#39ff14]/15 text-[#39ff14] border border-[#39ff14]/30"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                Inverso: Vf ➔ f (mm/rot)
              </button>
            </div>

            {/* Inputs Group */}
            <div className="flex flex-col gap-5">
              {calcMode === "vf" ? (
                /* Feedrate per rev (f) */
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold text-[#39ff14]">Avanço por Volta (f)</span>
                    <span className="text-[10px] font-mono text-[#39ff14] font-bold">{feedRate.toFixed(3)} mm/rot</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    max="10.0"
                    value={feedRate}
                    onChange={(e) => setFeedRate(Math.max(0.001, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#121216] border border-zinc-800 focus:border-[#39ff14] rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                  />
                </div>
              ) : (
                /* Linear Feedrate (Vf) */
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold text-[#39ff14]">Avanço Linear da Mesa (Vf)</span>
                    <span className="text-[10px] font-mono text-[#39ff14] font-bold">{linearFeed} mm/min</span>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="20000"
                    value={linearFeed}
                    onChange={(e) => setLinearFeed(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-[#121216] border border-zinc-800 focus:border-[#39ff14] rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                  />
                </div>
              )}

              {/* Spindle speed N */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Velocidade de Rotação (N)</span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">{rpmVal} RPM</span>
                </div>
                <input
                  type="number"
                  value={rpmVal}
                  onChange={(e) => setRpmVal(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-[#39ff14] rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
              </div>
            </div>

            {/* Calculations results block */}
            <div className="mt-3 p-4 rounded-xl bg-[#111115] border border-zinc-800 flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                {calcMode === "vf" ? "Resultado Avanço Linear" : "Resultado Avanço por Volta"}
              </span>
              <div className="bg-[#0b0b0e] p-4 rounded-lg border border-zinc-850 text-center">
                <span className="text-[9px] text-zinc-400 uppercase font-sans">
                  {calcMode === "vf" ? "Avanço Linear da Mesa (Vf)" : "Avanço por Volta Calculado (f)"}
                </span>
                <div className="text-[#39ff14] font-mono font-black text-xl md:text-2xl mt-0.5">
                  {calcMode === "vf" ? (
                    <>
                      {linearFeed} <span className="text-xs">mm/min</span>
                    </>
                  ) : (
                    <>
                      {feedRate.toFixed(4)} <span className="text-xs">mm/rot</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 italic mt-1 leading-snug font-sans">
                Fórmula de Cálculo:{" "}
                {calcMode === "vf" ? (
                  <code className="text-cyan-400 bg-zinc-950 px-1 rounded">Vf = f * N</code>
                ) : (
                  <code className="text-cyan-400 bg-zinc-950 px-1 rounded">f = Vf / N</code>
                )}
              </div>
            </div>
          </div>

          {/* Panel 2: Interactive SVG Illustration (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Play className="w-4 h-4 text-[#39ff14]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#39ff14]">Dinâmica do Avanço</h4>
            </div>

            <div className="flex-1 bg-[#121217] rounded-xl border border-zinc-800 p-4 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
              <svg viewBox="0 0 200 200" className="w-full max-w-[240px] aspect-square">
                {/* Lathe Spindle Chuck left base */}
                <rect x="5" y="60" width="30" height="80" fill="#2d2d38" rx="2" stroke="#47475a" strokeWidth="2" />
                <rect x="35" y="75" width="10" height="50" fill="#1e1e24" stroke="#47475a" strokeWidth="2" />

                {/* Chuck Jaws */}
                <rect x="25" y="55" width="20" height="20" fill="#3d3d4b" stroke="#5d5d6d" strokeWidth="1.5" />
                <rect x="25" y="125" width="20" height="20" fill="#3d3d4b" stroke="#5d5d6d" strokeWidth="1.5" />

                {/* Workpiece cylinder */}
                <rect x="45" y="80" width="100" height="40" fill="url(#metalGrad)" stroke="#5d5d6d" strokeWidth="1.5" />

                {/* Helical feed groove visualization */}
                <path d="M 45,80 L 55,120 M 55,80 L 65,120 M 65,80 L 75,120 M 75,80 L 85,120 M 85,80 L 95,120 M 95,80 L 105,120 M 105,80 L 115,120" 
                      fill="none" stroke="#2a2a35" strokeWidth="1.5" opacity="0.4" />

                {/* Spindle Rotation N */}
                <path d="M 65,65 A 15,15 0 0,1 85,65" fill="none" stroke="#10b981" strokeWidth="2" markerEnd="url(#gArrow)" />
                <text x="75" y="55" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  N: {rpmVal} RPM
                </text>

                {/* Cutting tool positioned on the bar */}
                <path d="M 115,120 L 125,135 L 135,120 Z" fill="#ef4444" stroke="#f87171" strokeWidth="1" />
                <rect x="121" y="135" width="8" height="25" fill="#3f3f46" stroke="#52525b" />

                {/* Z Feed Arrow (Leftwards direction) */}
                <line x1="125" y1="145" x2="85" y2="145" stroke="#39ff14" strokeWidth="2" markerEnd="url(#vArrow)" />
                
                {/* Label of Feed f */}
                <text x="105" y="138" fill="#39ff14" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  f: {feedRate.toFixed(4)} mm/rot
                </text>

                <text x="105" y="160" fill="#22d3ee" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  Vf: {linearFeed} mm/min
                </text>

                {/* Definitions */}
                <defs>
                  <linearGradient id="metalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#78716c" />
                    <stop offset="30%" stopColor="#d6d3d1" />
                    <stop offset="50%" stopColor="#44403c" />
                    <stop offset="70%" stopColor="#d6d3d1" />
                    <stop offset="100%" stopColor="#1c1917" />
                  </linearGradient>

                  <marker id="gArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                  </marker>

                  <marker id="vArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#39ff14" />
                  </marker>
                </defs>
              </svg>

              <div className="absolute bottom-2 left-2 right-2 text-center">
                <span className="text-[10px] text-zinc-500 font-mono">Usinagem de Torneamento Longitudinal por Raio (Compensação f)</span>
              </div>
            </div>
          </div>

          {/* Panel 3: G-Code Preview & Actions (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <FileCode className="w-4 h-4 text-[#39ff14]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#39ff14]">Código G-Code</h4>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-[220px]">
              <span className="text-[9px] font-mono text-zinc-400 uppercase">Bloco Gerado Dinamicamente:</span>
              <div className="flex-1 bg-[#050508] border border-zinc-850 rounded-xl p-3 font-mono text-xs text-emerald-400 leading-normal overflow-y-auto whitespace-pre-wrap select-text relative">
                <button
                  onClick={() => handleCopyCode(codePreview)}
                  className="absolute top-2 right-2 p-1.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded transition text-zinc-400 hover:text-white"
                  title="Copiar Código"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {codePreview}
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                <button
                  onClick={() => {
                    onInsertCode(codePreview);
                    onClose();
                  }}
                  className="w-full bg-[#39ff14]/85 hover:bg-[#39ff14] text-zinc-950 font-black py-3 px-4 rounded-xl transition uppercase text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Inserir no Programa</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold py-2.5 px-4 rounded-xl transition text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>

        </div>
    </div>
  );
};
