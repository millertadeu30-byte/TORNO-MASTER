import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, HelpCircle, ArrowRight, Settings, Play, Trash2 } from "lucide-react";

interface RPMCalculatorProps {
  onClose: () => void;
  onInsertCode: (code: string) => void;
  isHighContrast?: boolean;
}

export const RPMCalculator: React.FC<RPMCalculatorProps> = ({
  onClose,
  onInsertCode,
  isHighContrast = false,
}) => {
  // Mode Selection: Vc -> RPM or RPM -> Vc
  const [mode, setMode] = useState<"calc_rpm" | "calc_vc">("calc_rpm");

  // Inputs
  const [vcInput, setVcInput] = useState<number>(180);
  const [diaInput, setDiaInput] = useState<number>(50);
  const [rpmInput, setRpmInput] = useState<number>(1145);

  // Outputs
  const [resultRpm, setResultRpm] = useState<number>(0);
  const [resultVc, setResultVc] = useState<number>(0);
  
  const [copied, setCopied] = useState<boolean>(false);

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar tudo nesta tela?")) {
      setVcInput(0);
      setDiaInput(0);
      setRpmInput(0);
      setG50Limit(0);
    }
  };

  // Spindle maximum clamp speed limit (G50 / G92 S)
  const [g50Limit, setG50Limit] = useState<number>(3000);

  // Recalculate values
  useEffect(() => {
    if (mode === "calc_rpm") {
      if (vcInput > 0 && diaInput > 0) {
        const rpm = Math.round((vcInput * 1000) / (Math.PI * diaInput));
        setResultRpm(rpm);
      } else {
        setResultRpm(0);
      }
    }
  }, [vcInput, diaInput, mode]);

  useEffect(() => {
    if (mode === "calc_vc") {
      if (rpmInput > 0 && diaInput > 0) {
        const vc = Math.round((Math.PI * diaInput * rpmInput) / 1000);
        setResultVc(vc);
      } else {
        setResultVc(0);
      }
    }
  }, [rpmInput, diaInput, mode]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate dynamic G-code preview based on current inputs
  const generateGCode = (): string => {
    const vc = mode === "calc_rpm" ? vcInput : resultVc;
    const rpm = mode === "calc_rpm" ? resultRpm : rpmInput;
    const d = diaInput;

    let lines: string[] = [];
    lines.push(`; CALCULADORA RPM: Ø ${d}mm | Vc ${vc}m/min`);
    lines.push(`G50 S${g50Limit}; (Limitar rotação máxima do cabeçote em ${g50Limit} RPM)`);
    if (mode === "calc_rpm") {
      lines.push(`G96 S${vc} M03; (Ativar velocidade de corte constante Vc = ${vc} m/min)`);
    } else {
      lines.push(`G97 S${rpm} M03; (Ativar rotação constante N = ${rpm} RPM)`);
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
              <Settings className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Parâmetros de Entrada</h4>
            </div>

            {/* Toggle calculation mode */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase text-zinc-400">Modo de Cálculo</label>
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-lg ${isHighContrast ? "bg-zinc-100 border border-zinc-300" : "bg-[#14141a]"}`}>
                <button
                  onClick={() => setMode("calc_rpm")}
                  className={`text-[10px] font-bold py-2 rounded transition ${
                    mode === "calc_rpm"
                      ? isHighContrast
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-500/20 text-emerald-400 font-extrabold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  RPM a partir de Vc
                </button>
                <button
                  onClick={() => setMode("calc_vc")}
                  className={`text-[10px] font-bold py-2 rounded transition ${
                    mode === "calc_vc"
                      ? isHighContrast
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-500/20 text-emerald-400 font-extrabold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Vc a partir de RPM
                </button>
              </div>
            </div>

            {/* Inputs Group */}
            <div className="flex flex-col gap-4">
              {/* Diameter of Workpiece */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Diâmetro Ø da Peça (D)</span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">{diaInput} mm</span>
                </div>
                <input
                  type="number"
                  value={diaInput}
                  onChange={(e) => setDiaInput(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-emerald-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
              </div>

              {/* Cutting Speed input if mode === calc_rpm */}
              {mode === "calc_rpm" ? (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">Velocidade de Corte (Vc)</span>
                    <span className="text-[10px] font-mono text-amber-400 font-bold">{vcInput} m/min</span>
                  </div>
                  <input
                    type="number"
                    value={vcInput}
                    onChange={(e) => setVcInput(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#121216] border border-zinc-800 focus:border-emerald-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">Rotações Desejadas (N)</span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">{rpmInput} RPM</span>
                  </div>
                  <input
                    type="number"
                    value={rpmInput}
                    onChange={(e) => setRpmInput(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#121216] border border-zinc-800 focus:border-emerald-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                  />
                </div>
              )}

              {/* G50 Spindle Clamp speed limit */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Rotação Máxima do Spindle (G50 Limit)</span>
                  <span className="text-[10px] font-mono text-red-400 font-bold">{g50Limit} RPM</span>
                </div>
                <input
                  type="number"
                  value={g50Limit}
                  onChange={(e) => setG50Limit(Math.max(100, parseInt(e.target.value) || 3000))}
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-emerald-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
              </div>
            </div>

            {/* Calculations results block */}
            <div className="mt-3 p-4 rounded-xl bg-[#111115] border border-zinc-800 flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Resultados Calculados</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0b0b0e] p-3 rounded-lg border border-zinc-850 text-center">
                  <span className="text-[9px] text-zinc-400 uppercase font-sans">Rotação N</span>
                  <div className="text-emerald-400 font-mono font-black text-lg md:text-xl mt-0.5">
                    {mode === "calc_rpm" ? resultRpm : rpmInput} <span className="text-xs">RPM</span>
                  </div>
                </div>
                <div className="bg-[#0b0b0e] p-3 rounded-lg border border-zinc-850 text-center">
                  <span className="text-[9px] text-zinc-400 uppercase font-sans">Velocidade Vc</span>
                  <div className="text-amber-400 font-mono font-black text-lg md:text-xl mt-0.5">
                    {mode === "calc_rpm" ? vcInput : resultVc} <span className="text-xs">m/min</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 italic mt-1 leading-snug font-sans">
                Fórmula de Cálculo: <code className="text-cyan-400 bg-zinc-950 px-1 rounded">N = (Vc * 1000) / (π * D)</code>
              </div>
            </div>
          </div>

          {/* Panel 2: Interactive SVG Illustration (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Play className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Ilustração da Cinemática</h4>
            </div>

            <div className="flex-1 bg-[#121217] rounded-xl border border-zinc-800 p-4 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
              {/* Spinning Spindle graphic using SVG */}
              <svg viewBox="0 0 200 200" className="w-full max-w-[240px] aspect-square">
                {/* Lathe Spindle Chuck left base */}
                <rect x="10" y="50" width="35" height="100" fill="#2d2d38" rx="2" stroke="#47475a" strokeWidth="2" />
                <rect x="45" y="70" width="10" height="60" fill="#1e1e24" stroke="#47475a" strokeWidth="2" />
                
                {/* Chuck Jaws top and bottom */}
                <rect x="35" y="45" width="25" height="25" fill="#3d3d4b" stroke="#5d5d6d" strokeWidth="1.5" />
                <rect x="35" y="130" width="25" height="25" fill="#3d3d4b" stroke="#5d5d6d" strokeWidth="1.5" />

                {/* Rotating Workpiece bar */}
                <rect x="55" y="75" width="90" height="50" fill="url(#metalGradient)" stroke="#5d5d6d" strokeWidth="1.5" />

                {/* Center line */}
                <line x1="5" y1="100" x2="195" y2="100" stroke="#ff2a2a" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.6" />

                {/* Diameter Dimension line */}
                <line x1="145" y1="75" x2="145" y2="125" stroke="#00f3ff" strokeWidth="1.5" markerStart="url(#cyanArrow)" markerEnd="url(#cyanArrow)" />
                <text x="152" y="104" fill="#00f3ff" fontSize="9" fontFamily="monospace" fontWeight="bold">Ø {diaInput}mm</text>

                {/* Tool Insert approaching */}
                <path d="M 115,145 L 125,120 L 135,145 Z" fill="#ef4444" stroke="#f87171" strokeWidth="1" />
                <rect x="121" y="145" width="8" height="35" fill="#3f3f46" stroke="#52525b" />

                {/* Tool path feed arrow */}
                <path d="M 125,150 L 125,128" fill="none" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#redArrow)" />

                {/* Velocity Indicator Vc */}
                <text x="140" y="155" fill="#f59e0b" fontSize="9" fontFamily="monospace" fontWeight="bold">Vc: {mode === "calc_rpm" ? vcInput : resultVc} m/min</text>

                {/* Spinning motion arrows */}
                <path d="M 85,60 A 20,20 0 0,1 115,60" fill="none" stroke="#10b981" strokeWidth="2" markerEnd="url(#greenArrow)" strokeDasharray="3,2" />
                <text x="100" y="50" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  N: {mode === "calc_rpm" ? resultRpm : rpmInput} RPM
                </text>

                {/* SVG Definitions */}
                <defs>
                  <linearGradient id="metalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#8e9099" />
                    <stop offset="30%" stopColor="#d1d5db" />
                    <stop offset="50%" stopColor="#4b5563" />
                    <stop offset="70%" stopColor="#d1d5db" />
                    <stop offset="100%" stopColor="#1f2937" />
                  </linearGradient>
                  
                  <marker id="cyanArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#00f3ff" />
                  </marker>
                  
                  <marker id="redArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#ef4444" />
                  </marker>

                  <marker id="greenArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                  </marker>
                </defs>
              </svg>

              <div className="absolute bottom-2 left-2 right-2 text-center">
                <span className="text-[10px] text-zinc-500 font-mono">Usinagem de Torneamento de Diâmetro Ø com Ferramenta Externa</span>
              </div>
            </div>
          </div>

          {/* Panel 3: G-Code Preview & Actions (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Código G-Code</h4>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-[220px]">
              <span className="text-[9px] font-mono text-zinc-400 uppercase">Bloco Gerado Dinamicamente:</span>
              <div className="flex-1 bg-[#050508] border border-zinc-850 rounded-xl p-3 font-mono text-xs text-cyan-400 leading-normal overflow-y-auto whitespace-pre-wrap select-text relative">
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
                  className="w-full bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-black py-3 px-4 rounded-xl transition uppercase text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer"
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
