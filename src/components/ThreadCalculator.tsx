import React, { useState, useEffect } from "react";
import { X, Copy, Check, FileCode, HelpCircle, ArrowRight, Settings, Info, Play, RotateCw, Trash2 } from "lucide-react";

interface ThreadCalculatorProps {
  onClose: () => void;
  onInsertCode: (code: string) => void;
  isHighContrast?: boolean;
}

export const ThreadCalculator: React.FC<ThreadCalculatorProps> = ({
  onClose,
  onInsertCode,
  isHighContrast = false,
}) => {
  // Advanced G76 Thread Calculator state variables
  const [threadProfile, setThreadProfile] = useState<"metrica" | "whitworth" | "npt" | "unf_unc">("metrica");
  const [threadDirection, setThreadDirection] = useState<"externa" | "interna">("externa");
  const [threadTaper, setThreadTaper] = useState<"paralela" | "conica">("paralela");
  const [threadStarts, setThreadStarts] = useState<number>(1);
  const [threadPasses, setThreadPasses] = useState<number>(10);

  // Unit and TPI (Threads Per Inch)
  const [tpi, setTpi] = useState<string>("11");

  // Geometry
  const [calcPitch, setCalcPitch] = useState<number>(1.5); // Passo P (mm)
  const [calcDia, setCalcDia] = useState<number>(20.0);   // Diâmetro Nominal Ø (mm)
  const [zStart, setZStart] = useState<string>("5.0");      // Z Aproximação
  const [zEnd, setZEnd] = useState<string>("-20.0");       // Z Final

  // Fine parameters
  const [g76_m, setG76_M] = useState<string>("01");      // Passes de mola
  const [g76_s, setG76_S] = useState<string>("10");      // Saída angular
  const [g76_a, setG76_A] = useState<string>("60");      // Ângulo filete
  const [g76_q_min, setG76_QMin] = useState<number>(100); // Passo mínimo em mícrons
  const [g76_r_fin, setG76_RFin] = useState<number>(0.02); // Passe de acabamento em mm

  // Calculated Outputs
  const [outputThreadHeight, setOutputThreadHeight] = useState<number>(0); // microns
  const [outputThreadRoot, setOutputThreadRoot] = useState<number>(0);   // mm
  const [copied, setCopied] = useState<boolean>(false);

  // Auxiliary string states for fluid text input
  const [threadStartsStr, setThreadStartsStr] = useState<string>("1");
  const [calcPitchStr, setCalcPitchStr] = useState<string>("1.5");
  const [calcDiaStr, setCalcDiaStr] = useState<string>("20.0");
  const [threadPassesStr, setThreadPassesStr] = useState<string>("10");
  const [g76_r_finStr, setG76_RFinStr] = useState<string>("0.02");
  const [g76_q_minStr, setG76_QMinStr] = useState<string>("100");

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar tudo nesta tela?")) {
      setThreadStarts(1);
      setThreadPasses(10);
      setTpi("");
      setCalcPitch(0);
      setCalcDia(0);
      setZStart("");
      setZEnd("");
      setG76_M("00");
      setG76_S("00");
      setG76_A("60");
      setG76_QMin(0);
      setG76_RFin(0);

      setThreadStartsStr("");
      setCalcPitchStr("");
      setCalcDiaStr("");
      setThreadPassesStr("");
      setG76_RFinStr("");
      setG76_QMinStr("");
    }
  };

  // Sync profile options
  useEffect(() => {
    if (threadProfile === "whitworth") {
      setG76_A("55");
      setTpi("11");
      const pitch = parseFloat((25.4 / 11).toFixed(4));
      setCalcPitch(pitch);
      setCalcPitchStr(pitch.toString());
    } else if (threadProfile === "npt") {
      setG76_A("60");
      setThreadTaper("conica");
      setTpi("11.5");
      const pitch = parseFloat((25.4 / 11.5).toFixed(4));
      setCalcPitch(pitch);
      setCalcPitchStr(pitch.toString());
    } else if (threadProfile === "unf_unc") {
      setG76_A("60");
      setTpi("14");
      const pitch = parseFloat((25.4 / 14).toFixed(4));
      setCalcPitch(pitch);
      setCalcPitchStr(pitch.toString());
    } else {
      setG76_A("60");
    }
  }, [threadProfile]);

  // Handle changes
  const handleTpiChange = (valStr: string) => {
    setTpi(valStr);
    const sanitized = valStr.replace(",", ".");
    const val = parseFloat(sanitized);
    if (val > 0) {
      const pitch = parseFloat((25.4 / val).toFixed(4));
      setCalcPitch(pitch);
      setCalcPitchStr(pitch.toString());
    }
  };

  const handleThreadStartsChange = (valStr: string) => {
    setThreadStartsStr(valStr);
    const parsed = parseInt(valStr);
    if (!isNaN(parsed)) {
      setThreadStarts(parsed);
    } else {
      setThreadStarts(0);
    }
  };

  const handlePitchInputChange = (valStr: string) => {
    setCalcPitchStr(valStr);
    const normalized = valStr.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      setCalcPitch(parsed);
      if (threadProfile !== "metrica" && parsed > 0) {
        setTpi((25.4 / parsed).toFixed(2));
      }
    } else {
      setCalcPitch(0);
    }
  };

  const handleDiaInputChange = (valStr: string) => {
    setCalcDiaStr(valStr);
    const normalized = valStr.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      setCalcDia(parsed);
    } else {
      setCalcDia(0);
    }
  };

  const handleThreadPassesChange = (valStr: string) => {
    setThreadPassesStr(valStr);
    const parsed = parseInt(valStr);
    if (!isNaN(parsed)) {
      setThreadPasses(parsed);
    } else {
      setThreadPasses(0);
    }
  };

  const handleRFinChange = (valStr: string) => {
    setG76_RFinStr(valStr);
    const normalized = valStr.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      setG76_RFin(parsed);
    } else {
      setG76_RFin(0);
    }
  };

  const handleQMinChange = (valStr: string) => {
    setG76_QMinStr(valStr);
    const normalized = valStr.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      // If user inputs a millimeter value (e.g. 0.01, 0.1, 0.05 or with a decimal point), convert to microns
      if (parsed < 1.0 || valStr.includes(".") || valStr.includes(",")) {
        setG76_QMin(Math.round(parsed * 1000));
      } else {
        setG76_QMin(Math.round(parsed));
      }
    } else {
      setG76_QMin(0);
    }
  };

  // Calculations
  useEffect(() => {
    if (calcPitch > 0) {
      let multiplier = 0.65;
      if (threadProfile === "whitworth") {
        multiplier = 0.6403;
      } else if (threadProfile === "npt") {
        multiplier = 0.866;
      } else if (threadProfile === "unf_unc") {
        multiplier = 0.61343;
      }
      const height = Math.round(multiplier * calcPitch * 1000); // microns
      setOutputThreadHeight(height);

      if (calcDia > 0) {
        let minorDia = calcDia;
        if (threadDirection === "externa") {
          minorDia = calcDia - 2 * (height / 1000);
        } else {
          minorDia = calcDia - 1.0825 * calcPitch; // internal minor diameter
        }
        setOutputThreadRoot(parseFloat(minorDia.toFixed(3)));
      }
    } else {
      setOutputThreadHeight(0);
      setOutputThreadRoot(0);
    }
  }, [calcPitch, calcDia, threadProfile, threadDirection]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate dynamic G-code preview (real-time G76 lines)
  const generateGCode = (): string => {
    if (calcPitch <= 0 || calcDia <= 0) return "; Insira dados válidos de Passo e Diâmetro";

    let multiplier = 0.65;
    let angle = "60";
    if (threadProfile === "whitworth") {
      multiplier = 0.6403;
      angle = "55";
    } else if (threadProfile === "npt") {
      multiplier = 0.866;
      angle = "60";
    } else if (threadProfile === "unf_unc") {
      multiplier = 0.61343;
      angle = "60";
    } else {
      multiplier = 0.65;
      angle = g76_a;
    }

    const parsedZStart = parseFloat(String(zStart).replace(",", ".")) || 0;
    const parsedZEnd = parseFloat(String(zEnd).replace(",", ".")) || 0;

    const h_mm = multiplier * calcPitch;
    const h_microns = Math.round(h_mm * 1000);

    let finalX = calcDia;
    if (threadDirection === "externa") {
      finalX = calcDia - 2 * h_mm;
    } else {
      finalX = calcDia;
    }
    const finalXStr = finalX.toFixed(2);

    const q_first = Math.round(h_microns / Math.sqrt(threadPasses));
    const taperAngle = 1.7833; // standard 1:16 conicity is 1.7833 deg
    const isConic = threadTaper === "conica" || threadProfile === "npt";

    let gcodeLines: string[] = [];
    const labelProfile = threadProfile === "npt" 
      ? `NPT Cônica (${tpi} FPP/TPI)` 
      : threadProfile === "whitworth" 
        ? `Whitworth (${tpi} FPP/TPI)` 
        : threadProfile === "unf_unc"
          ? `UNF / UNC (${tpi} FPP/TPI)`
          : `Métrica`;
    
    gcodeLines.push(`; ROSCA G76: M${calcDia}x${calcPitch.toFixed(2)} (${labelProfile})`);
    gcodeLines.push(`; Tipo: ${threadDirection === "externa" ? "Externa" : "Interna"} | Entradas: ${threadStarts} | Passadas: ${threadPasses}`);
    
    const approachDia = threadDirection === "externa" 
      ? Math.round(calcDia + 4) 
      : Math.round(calcDia - calcPitch - 4);

    for (let i = 0; i < threadStarts; i++) {
      const currentZStart = parsedZStart + i * calcPitch;
      const zTravel = Math.abs(currentZStart - parsedZEnd);
      
      let taperRStr = "";
      if (isConic) {
        const angleInRad = (taperAngle * Math.PI) / 180;
        const rVal = Math.tan(angleInRad) * zTravel;
        const rSigned = threadDirection === "externa" ? -rVal : rVal;
        taperRStr = ` R${rSigned.toFixed(3)}`;
      }

      const lead = calcPitch * threadStarts;

      gcodeLines.push(`; --- Entrada ${i + 1} de ${threadStarts} ---`);
      gcodeLines.push(`G00 X${approachDia.toFixed(2)} Z${currentZStart.toFixed(2)};`);
      gcodeLines.push(`G76 P${g76_m}${g76_s}${angle} Q${g76_q_min} R${g76_r_fin.toFixed(2)};`);
      gcodeLines.push(`G76 X${finalXStr} Z${parsedZEnd.toFixed(2)}${taperRStr} P${h_microns} Q${q_first} F${lead.toFixed(2)};`);
    }

    return gcodeLines.join("\n");
  };

  const codePreview = generateGCode();

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isHighContrast ? "bg-white text-black font-semibold" : "bg-[#0b0b0e] text-zinc-100"}`}>
        {/* Content Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          
          {/* Panel 1: Controls & Inputs (col-span-5) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Settings className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Parâmetros do Ciclo</h4>
            </div>

            {/* Form layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* Profile select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Perfil de Rosca</label>
                <select
                  value={threadProfile}
                  onChange={(e) => setThreadProfile(e.target.value as any)}
                  className="bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-2.5 py-2 text-xs font-mono outline-none"
                >
                  <option value="metrica">Métrica ISO (60°)</option>
                  <option value="whitworth">Whitworth (55°)</option>
                  <option value="npt">NPT Cônica (60° - 1:16)</option>
                  <option value="unf_unc">UNF / UNC (Polegadas 60°)</option>
                </select>
              </div>

              {/* Direction select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Direção</label>
                <select
                  value={threadDirection}
                  onChange={(e) => setThreadDirection(e.target.value as any)}
                  className="bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-2.5 py-2 text-xs font-mono outline-none"
                >
                  <option value="externa">Rosca Externa</option>
                  <option value="interna">Rosca Interna</option>
                </select>
              </div>

              {/* Taper type */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Tipo de Percurso</label>
                <select
                  value={threadTaper}
                  disabled={threadProfile === "npt"}
                  onChange={(e) => setThreadTaper(e.target.value as any)}
                  className="bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-2.5 py-2 text-xs font-mono outline-none disabled:opacity-50"
                >
                  <option value="paralela">Cilíndrica / Paralela</option>
                  <option value="conica">Cônica (1:16 / 1.78°)</option>
                </select>
              </div>

              {/* Thread starts */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Nº de Entradas (Starts)</label>
                <input
                  type="text"
                  value={threadStartsStr}
                  onChange={(e) => handleThreadStartsChange(e.target.value)}
                  placeholder="Ex: 1"
                  className="bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                />
              </div>

              {/* Condicional de Polegada: Fios por Polegada (TPI/FPP) */}
              {(threadProfile === "whitworth" || threadProfile === "npt" || threadProfile === "unf_unc") && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono uppercase text-[#00f3ff] font-bold">
                    Fios por Polegada (FPP / TPI)
                  </label>
                  <input
                    type="text"
                    value={tpi}
                    onChange={(e) => handleTpiChange(e.target.value)}
                    className="bg-[#121216] border border-cyan-500/40 focus:border-cyan-400 text-cyan-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                    placeholder="Ex: 11"
                  />
                </div>
              )}

              {/* Pitch P */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                  {threadProfile !== "metrica" ? "Passo P (mm) (Calculado)" : "Passo P (mm)"}
                </label>
                <input
                  type="text"
                  value={calcPitchStr}
                  onChange={(e) => handlePitchInputChange(e.target.value)}
                  placeholder="Ex: 1.5"
                  className={`bg-[#121216] border focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none ${
                    threadProfile !== "metrica" ? "border-zinc-800 text-zinc-350" : "border-zinc-800 text-zinc-100"
                  }`}
                />
              </div>

              {/* Nominal Dia */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Diâmetro Nominal Ø (mm)</label>
                <input
                  type="text"
                  value={calcDiaStr}
                  onChange={(e) => handleDiaInputChange(e.target.value)}
                  placeholder="Ex: 20"
                  className="bg-[#121216] border border-zinc-800 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                />
              </div>

              {/* Z Start */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-[#00f3ff] font-bold">Z Aproximação (Inicial)</label>
                <input
                  type="text"
                  value={zStart}
                  onChange={(e) => setZStart(e.target.value)}
                  className="bg-[#121216] border border-cyan-500/40 focus:border-cyan-400 text-cyan-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                  placeholder="Ex: 5.0"
                />
              </div>

              {/* Z End */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-[#00f3ff] font-bold">Z Final da Rosca</label>
                <input
                  type="text"
                  value={zEnd}
                  onChange={(e) => setZEnd(e.target.value)}
                  className="bg-[#121216] border border-cyan-500/40 focus:border-cyan-400 text-cyan-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                  placeholder="Ex: -20.0"
                />
              </div>
            </div>

            {/* Fine parameters toggles in nested block */}
            <div className="p-3 bg-[#111115] border border-zinc-800 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Passes Mola (m)</label>
                <select
                  value={g76_m}
                  onChange={(e) => setG76_M(e.target.value)}
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                >
                  <option value="01">01 Passe</option>
                  <option value="02">02 Passes</option>
                  <option value="03">03 Passes</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Saída Angular (s)</label>
                <select
                  value={g76_s}
                  onChange={(e) => setG76_S(e.target.value)}
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                >
                  <option value="00">00 (Sem Saída)</option>
                  <option value="10">10 (1.0 x Passo)</option>
                  <option value="15">15 (1.5 x Passo)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Ângulo Filete (a)</label>
                <select
                  value={g76_a}
                  disabled={threadProfile === "whitworth" || threadProfile === "npt" || threadProfile === "unf_unc"}
                  onChange={(e) => setG76_A(e.target.value)}
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400 disabled:opacity-50"
                >
                  <option value="60">60 Graus</option>
                  <option value="55">55 Graus</option>
                  <option value="30">30 Graus</option>
                  <option value="29">29 Graus</option>
                  <option value="00">00 Graus</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1 font-bold">Nº Passadas (N)</label>
                <input
                  type="text"
                  value={threadPassesStr}
                  onChange={(e) => handleThreadPassesChange(e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1 font-bold">Passe Acab. R</label>
                <input
                  type="text"
                  value={g76_r_finStr}
                  onChange={(e) => handleRFinChange(e.target.value)}
                  placeholder="Ex: 0.02"
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1 font-bold">Prof. Mínima Q (mm ou μ)</label>
                <input
                  type="text"
                  value={g76_q_minStr}
                  onChange={(e) => handleQMinChange(e.target.value)}
                  placeholder="Ex: 100 ou 0.1"
                  className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Explanatory Info Box for Passes de Mola */}
            <div className="p-3.5 rounded-xl bg-cyan-950/15 border border-cyan-500/20 flex flex-col gap-2 mt-1">
              <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                O que é o "Passe Mola" (Parâmetro m no G76)?
              </span>
              <p className="text-[10px] text-zinc-300 leading-relaxed font-sans">
                Os <strong>Passes de Mola (Spring Passes)</strong> são passadas de acabamento adicionais que a ferramenta realiza <strong>sem incrementar a profundidade de corte (sem avanço radial)</strong>.
              </p>
              <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                Durante a usinagem, a ferramenta e o material sofrem leve flexão elástica devido à pressão de corte. Os passes de mola passam "limpando" o canal para <strong>eliminar rebarbas, corrigir pequenas deformações e garantir o diâmetro exato</strong>, evitando que a rosca prenda ao ser rosqueada.
              </p>
            </div>
          </div>

          {/* Panel 2: SVG Thread Profile Illustration (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <Play className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Visualização de Rosca G76</h4>
            </div>

            <div className="flex-1 bg-[#121217] rounded-xl border border-zinc-800 p-4 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
              <svg viewBox="0 0 200 200" className="w-full max-w-[240px] aspect-square">
                {/* Outer bounding material */}
                <path d="M 10,40 L 40,40 L 50,70 L 60,40 L 70,70 L 80,40 L 90,70 L 100,40 L 110,70 L 120,40 L 130,70 L 140,40 L 170,40 L 170,160 L 10,160 Z" 
                      fill="url(#metalPattern)" stroke="#3f3f46" strokeWidth="1" />
                
                {/* Symmetrical centerline */}
                <line x1="5" y1="100" x2="195" y2="100" stroke="#ef4444" strokeWidth="1" strokeDasharray="5,3" opacity="0.5" />

                {/* Diameter lines */}
                {/* Nominal Dia D */}
                <line x1="175" y1="40" x2="175" y2="160" stroke="#e0f2fe" strokeWidth="1" opacity="0.3" strokeDasharray="3,3" />
                
                {/* Root minor diameter */}
                <line x1="90" y1="70" x2="190" y2="70" stroke="#00f3ff" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />
                
                {/* Highlight Thread Height (h) on the crest/root */}
                <line x1="150" y1="40" x2="150" y2="70" stroke="#10b981" strokeWidth="1.5" markerStart="url(#greenHead)" markerEnd="url(#greenHead)" />
                <text x="155" y="59" fill="#10b981" fontSize="8" fontFamily="monospace" fontWeight="bold">h: {outputThreadHeight}μ</text>

                {/* Label Pitch (P) */}
                <line x1="70" y1="30" x2="90" y2="30" stroke="#f59e0b" strokeWidth="1" markerStart="url(#amberHead)" markerEnd="url(#amberHead)" />
                <text x="80" y="24" fill="#f59e0b" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Passo: {calcPitch.toFixed(2)}mm</text>

                {/* Major Diameter Label */}
                <line x1="15" y1="130" x2="15" y2="40" stroke="#ef4444" strokeWidth="1" markerEnd="url(#redHead)" />
                <text x="22" y="115" fill="#ef4444" fontSize="8" fontFamily="monospace" fontWeight="bold">Ø Nominal: {calcDia}mm</text>

                {/* Minor root diameter label */}
                <text x="22" y="140" fill="#00f3ff" fontSize="8" fontFamily="monospace" fontWeight="bold">Ø Fundo X: {outputThreadRoot}mm</text>

                {/* G76 Multi-passes layers visualization inside the crest thread root */}
                <line x1="42" y1="46" x2="48" y2="64" stroke="#d4d4d8" strokeWidth="0.8" strokeDasharray="1,1" />
                <line x1="44" y1="52" x2="46" y2="58" stroke="#00f3ff" strokeWidth="0.8" />
                <line x1="46" y1="58" x2="48" y2="64" stroke="#e11d48" strokeWidth="0.8" />

                {/* Definitions */}
                <defs>
                  <linearGradient id="metalPattern" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#27272a" />
                    <stop offset="55%" stopColor="#3f3f46" />
                    <stop offset="100%" stopColor="#18181b" />
                  </linearGradient>

                  <marker id="greenHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#10b981" />
                  </marker>

                  <marker id="amberHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#f59e0b" />
                  </marker>

                  <marker id="redHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#ef4444" />
                  </marker>
                </defs>
              </svg>

              {/* Dynamic G76 formula details summary info box */}
              <div className="mt-3 p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-900 w-full text-[10px] leading-relaxed font-mono flex flex-col gap-1 text-zinc-400">
                <div className="flex justify-between">
                  <span>Altura do filete h:</span>
                  <span className="text-emerald-400">{outputThreadHeight} mícrons ({ (outputThreadHeight/1000).toFixed(3) } mm)</span>
                </div>
                <div className="flex justify-between">
                  <span>1ª Passada Q (profundidade):</span>
                  <span className="text-purple-400">Q{Math.round(outputThreadHeight / Math.sqrt(threadPasses))}μ</span>
                </div>
                <div className="flex justify-between">
                  <span>Diâmetro Fundo X:</span>
                  <span className="text-cyan-400">Ø {outputThreadRoot} mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3: LIVE G-Code Generator Output & Copy/Insert Actions (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-800">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Pré-visualização G76</h4>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-[220px]">
              <span className="text-[9px] font-mono text-zinc-400 uppercase">Bloco Atualizado em Tempo Real:</span>
              <div className="flex-1 bg-[#050508] border border-zinc-850 rounded-xl p-3 font-mono text-xs text-cyan-400 leading-relaxed overflow-y-auto whitespace-pre-wrap select-text relative">
                <button
                  onClick={() => handleCopyCode(codePreview)}
                  className="absolute top-2 right-2 p-1.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded transition text-zinc-400 hover:text-white"
                  title="Copiar G-Code"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {codePreview}
              </div>

              <div className="flex flex-col gap-2 mt-auto font-sans">
                <button
                  onClick={() => {
                    onInsertCode(codePreview);
                    onClose();
                  }}
                  className="w-full bg-cyan-400 hover:bg-cyan-350 text-zinc-950 font-black py-3 px-4 rounded-xl transition uppercase text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Inserir Ciclo G76</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold py-2.5 px-4 rounded-xl transition text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>

        </div>
    </div>
  );
};
