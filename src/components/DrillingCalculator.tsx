import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, Play, Settings, ArrowRight, HelpCircle, Trash2 } from "lucide-react";

interface DrillingCalculatorProps {
  onClose: () => void;
  onInsertCode: (code: string) => void;
  isHighContrast?: boolean;
}

export const DrillingCalculator: React.FC<DrillingCalculatorProps> = ({
  onClose,
  onInsertCode,
  isHighContrast = false,
}) => {
  // Input states as strings to support easy typing of negative signs (-) and decimals (.)
  const [zFinal, setZFinal] = useState<string>("-30.0");       // Z posição final do furo (absoluto)
  const [rStart, setRStart] = useState<string>("2.0");          // R plano de referência para início
  const [peckMm, setPeckMm] = useState<string>("5.0");          // Q valor de incremento por picada em mm
  const [dwellMs, setDwellMs] = useState<string>("0");          // P tempo de permanência opcional (ms)
  const [feedRate, setFeedRate] = useState<string>("0.12");     // F avanço de trabalho (mm/volta)
  const [spindleSpeed, setSpindleSpeed] = useState<string>("1200"); // S RPM sugerido
  
  const [copied, setCopied] = useState<boolean>(false);

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar tudo nesta tela?")) {
      setZFinal("");
      setRStart("");
      setPeckMm("");
      setDwellMs("");
      setFeedRate("");
      setSpindleSpeed("");
    }
  };

  // Sync peck in mm to microns using useMemo for zero-lag reactivity
  const computedQMicrons = React.useMemo(() => {
    const val = parseFloat(peckMm.replace(",", ".")) || 0;
    return Math.round(val * 1000);
  }, [peckMm]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate dynamic G-code based on inputs
  const generateGCode = (): string => {
    const pZ = parseFloat(zFinal.replace(",", ".")) || 0;
    const pR = parseFloat(rStart.replace(",", ".")) || 0;
    const pF = parseFloat(feedRate.replace(",", ".")) || 0;
    const pS = parseFloat(spindleSpeed.replace(",", ".")) || 0;
    const pDwell = parseInt(dwellMs) || 0;

    let lines: string[] = [];
    lines.push(`; --- CICLO DE FURAÇÃO DE PRECISSÃO G83 ---`);
    lines.push(`; Furo final: Z${pZ.toFixed(2)} | Avanço: F${pF.toFixed(2)} | Q: ${peckMm}mm (${computedQMicrons} micra)`);
    
    // Safety & spindle start
    if (pS > 0) {
      lines.push(`G97 S${Math.round(pS)} M03; (Ativar rotação direta constante)`);
    }
    
    // Safety positioning
    lines.push(`G00 X0.0 Z${pR.toFixed(2)} M08; (Aproximação na linha de centro com refrigerante)`);
    
    // G83 line
    let g83Line = `G83 Z${pZ.toFixed(3)} Q${computedQMicrons}`;
    if (pDwell > 0) {
      g83Line += ` P${pDwell}`;
    }
    if (pR !== 0) {
      g83Line += ` R${pR.toFixed(3)}`;
    }
    g83Line += ` F${pF.toFixed(3)};`;
    
    lines.push(g83Line);
    lines.push(`G80; (Cancela o ciclo de furação ativa)`);
    lines.push(`G00 Z20.0 M09; (Recuo seguro de saída e desliga refrigerante)`);

    return lines.join("\n");
  };

  const codePreview = generateGCode();

  // Parse for preview visualization bounds
  const parsedZ = parseFloat(zFinal.replace(",", ".")) || -30;
  const parsedR = parseFloat(rStart.replace(",", ".")) || 2;
  const parsedPeck = parseFloat(peckMm.replace(",", ".")) || 5;

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isHighContrast ? "bg-white text-black font-semibold" : "bg-[#0b0b0e] text-zinc-100"}`}>
        {/* Content Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          
          {/* Panel 1: Settings and Inputs (col-span-5) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Settings className="w-4 h-4 text-[#00f3ff]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#00f3ff]">Parâmetros do Ciclo G83</h4>
            </div>

            {/* Inputs Group */}
            <div className="grid grid-cols-2 gap-4">
              {/* Z Final Depth */}
              <div className="flex flex-col gap-1 col-span-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Z Final da Furação (Z)</span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">{zFinal} mm</span>
                </div>
                <input
                  type="text"
                  value={zFinal}
                  onChange={(e) => setZFinal(e.target.value)}
                  placeholder="Ex: -30.0"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
                <span className="text-[9px] text-zinc-500 font-mono">Posição absoluta do fundo do furo (geralmente negativo).</span>
              </div>

              {/* R Reference Plane */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Plano Retração (R)</span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">{rStart} mm</span>
                </div>
                <input
                  type="text"
                  value={rStart}
                  onChange={(e) => setRStart(e.target.value)}
                  placeholder="Ex: 2.0"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
                <span className="text-[9px] text-zinc-500 font-mono">Plano de início seguro.</span>
              </div>

              {/* Peck increment (mm) */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Passe Picada (Q) mm</span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">{peckMm} mm</span>
                </div>
                <input
                  type="text"
                  value={peckMm}
                  onChange={(e) => setPeckMm(e.target.value)}
                  placeholder="Ex: 5.0"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
                <span className="text-[9px] text-zinc-500 font-mono">Incremento por mergulho.</span>
              </div>

              {/* Dwell time (P) optional */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Tempo Espera (P) ms</span>
                  <span className="text-[10px] font-mono text-zinc-400">{dwellMs} ms</span>
                </div>
                <input
                  type="text"
                  value={dwellMs}
                  onChange={(e) => setDwellMs(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
                <span className="text-[9px] text-zinc-500 font-mono">Opcional. Ex: 500 para 0.5s.</span>
              </div>

              {/* Feed rate (F) */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Avanço F (mm/v)</span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">F{feedRate}</span>
                </div>
                <input
                  type="text"
                  value={feedRate}
                  onChange={(e) => setFeedRate(e.target.value)}
                  placeholder="Ex: 0.12"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
                <span className="text-[9px] text-zinc-500 font-mono">Velocidade de avanço.</span>
              </div>

              {/* Spindle speed (S) suggestions */}
              <div className="flex flex-col gap-1 col-span-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Velocidade de Rotação (S)</span>
                  <span className="text-[10px] font-mono text-orange-400 font-bold">{spindleSpeed} RPM</span>
                </div>
                <input
                  type="text"
                  value={spindleSpeed}
                  onChange={(e) => setSpindleSpeed(e.target.value)}
                  placeholder="Ex: 1200"
                  className="w-full bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono outline-none transition"
                />
              </div>
            </div>

            {/* Calculations results block */}
            <div className="mt-2 p-4 rounded-xl bg-[#111115] border border-zinc-800 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Valor de Conversão Fanuc</span>
              <div className="bg-[#0b0b0e] p-3 rounded-lg border border-zinc-850 flex justify-between items-center">
                <div>
                  <span className="text-[9px] text-zinc-400 uppercase font-sans block">Incremento Q em Milésimos</span>
                  <span className="text-[#00f3ff] font-mono font-black text-lg">Q{computedQMicrons}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-zinc-400 uppercase font-sans block">Significado técnico</span>
                  <span className="text-zinc-400 font-mono text-xs">{peckMm} mm por picada</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 leading-snug mt-1 leading-normal font-sans">
                💡 <strong>Por que milésimos?</strong> O comando Fanuc interpreta valores sem ponto decimal nos ciclos G74 e G83 como milésimos de milímetro (microns). Logo, <strong>5.0 mm = Q5000</strong>.
              </p>
            </div>
          </div>

          {/* Panel 2: Interactive SVG Illustration (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Play className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Cinemática da Furação G83</h4>
            </div>

            <div className="flex-1 bg-[#121217] rounded-xl border border-zinc-800 p-4 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
              <svg viewBox="0 0 200 200" className="w-full max-w-[240px] aspect-square">
                {/* Workpiece block */}
                <rect x="10" y="50" width="130" height="100" fill="url(#metalMaterial)" stroke="#47475a" strokeWidth="1.5" />
                
                {/* Pre-drawn hole according to Z Final depth */}
                {/* Visual limit of the hole */}
                <path d={`M 140,85 L ${140 + Math.min(100, Math.abs(parsedZ) * 2.5)},85 L ${140 + Math.min(100, Math.abs(parsedZ) * 2.5) + 8},100 L ${140 + Math.min(100, Math.abs(parsedZ) * 2.5)},115 L 140,115 Z`} fill="#050508" stroke="#333" strokeWidth="1" />
                
                {/* Center line */}
                <line x1="5" y1="100" x2="195" y2="100" stroke="#ff2a2a" strokeWidth="1" strokeDasharray="5,3" opacity="0.4" />

                {/* Retract Reference Plane R */}
                <line x1={140 + (parsedR * 2.5)} y1="40" x2={140 + (parsedR * 2.5)} y2="160" stroke="#10b981" strokeWidth="1.2" strokeDasharray="3,3" />
                <text x={140 + (parsedR * 2.5) + 3} y="48" fill="#10b981" fontSize="8" fontFamily="monospace" fontWeight="bold">R (Z{parsedR})</text>

                {/* Drill bit tool */}
                {/* Animates or aligns with reference points */}
                <g transform="translate(4, 0)">
                  {/* Tool body */}
                  <rect x="155" y="92" width="35" height="16" fill="#64748b" stroke="#475569" strokeWidth="1" />
                  {/* Tool tip */}
                  <path d="M 155,92 L 145,100 L 155,108 Z" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
                  {/* Drill spiral lines */}
                  <path d="M 160,92 L 155,108 M 168,92 L 163,108 M 176,92 L 171,108" stroke="#475569" strokeWidth="1" />
                </g>

                {/* Peck movement indicators (arrows) */}
                {/* Draws a loop indicating peck pecking */}
                <path d="M 150,130 L 130,130 M 130,130 L 155,130" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerStart="url(#peckForward)" markerEnd="url(#retractBack)" />
                <text x="110" y="142" fill="#f59e0b" fontSize="8" fontFamily="monospace" fontWeight="bold">Q ({parsedPeck}mm)</text>

                {/* G83 Loop indicator (Cycle goes deep, then retracts entirely to R) */}
                <path d="M 170,15 A 15,15 0 0,0 140,30" fill="none" stroke="#00f3ff" strokeWidth="1" markerEnd="url(#cyanArrow)" />
                <text x="135" y="16" fill="#00f3ff" fontSize="8" fontFamily="monospace" fontWeight="bold">Retração Completa ao R</text>

                {/* Z Final Marker */}
                <line x1={140 + Math.abs(parsedZ) * 2.5} y1="75" x2={140 + Math.abs(parsedZ) * 2.5} y2="125" stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
                <text x={140 + Math.abs(parsedZ) * 2.5 - 20} y="138" fill="#ef4444" fontSize="8" fontFamily="monospace" fontWeight="bold">Z{parsedZ}</text>

                {/* Defs */}
                <defs>
                  <linearGradient id="metalMaterial" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#2e3039" />
                    <stop offset="35%" stopColor="#4c4f5c" />
                    <stop offset="50%" stopColor="#1a1c23" />
                    <stop offset="65%" stopColor="#4c4f5c" />
                    <stop offset="100%" stopColor="#15161c" />
                  </linearGradient>

                  <marker id="peckForward" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 10 2 L 0 5 L 10 8 z" fill="#f59e0b" />
                  </marker>
                  
                  <marker id="retractBack" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#f59e0b" />
                  </marker>

                  <marker id="cyanArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#00f3ff" />
                  </marker>
                </defs>
              </svg>

              <div className="absolute bottom-2 left-2 right-2 text-center">
                <span className="text-[10px] text-zinc-500 font-mono">Furação Central de Picada com Retração para Alívio de Cavacos</span>
              </div>
            </div>
          </div>

          {/* Panel 3: G-Code Preview & Actions (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Código G-Code</h4>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-[220px]">
              <span className="text-[9px] font-mono text-zinc-400 uppercase">Bloco G83 Gerado:</span>
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
