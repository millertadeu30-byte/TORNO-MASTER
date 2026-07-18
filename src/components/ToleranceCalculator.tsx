import React, { useState, useEffect } from "react";
import { Info, Check, ArrowRight, Layers, HelpCircle, FileText } from "lucide-react";
import { ISO_RANGES, getRangeIndex, SHAFT_TOLERANCES, HOLE_TOLERANCES } from "../data/isoTolerances";

interface ToleranceCalculatorProps {
  onClose?: () => void;
  onInsertCode?: (code: string) => void;
  isHighContrast?: boolean;
}

type ActiveTab = "cota_ideal" | "ajuste_press" | "iso_tolerances";

export function ToleranceCalculator({ onClose, onInsertCode, isHighContrast }: ToleranceCalculatorProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("cota_ideal");

  // TAB 1: Cota Ideal State
  const [dMaxStr, setDMaxStr] = useState<string>("20.030");
  const [dMinStr, setDMinStr] = useState<string>("19.990");
  const [cotaIdealResult, setCotaIdealResult] = useState<number | null>(20.010);

  // TAB 2: Ajuste com Interferência State
  const [fMaxStr, setFMaxStr] = useState<string>("25.21");
  const [fMinStr, setFMinStr] = useState<string>("25.00");
  const [eMaxStr, setEMaxStr] = useState<string>("25.41");
  const [eMinStr, setEMinStr] = useState<string>("25.28");

  // TAB 3: ISO Tolerances State
  const [nominalStr, setNominalStr] = useState<string>("25");
  const [selectedHoleClass, setSelectedHoleClass] = useState<string>("H7");
  const [selectedShaftClass, setSelectedShaftClass] = useState<string>("g6");
  const [isoCalcMode, setIsoCalcMode] = useState<"both" | "hole" | "shaft">("both");

  // Calculate Tab 1: Cota Ideal
  useEffect(() => {
    const dMax = parseFloat(dMaxStr.replace(",", "."));
    const dMin = parseFloat(dMinStr.replace(",", "."));
    if (!isNaN(dMax) && !isNaN(dMin)) {
      setCotaIdealResult((dMax + dMin) / 2);
    } else {
      setCotaIdealResult(null);
    }
  }, [dMaxStr, dMinStr]);

  // Calculate Tab 2: Fit with Interference or Clearance
  const calculateFit = (fMaxVal: number, fMinVal: number, eMaxVal: number, eMinVal: number) => {
    // Normalize in case user inverted the inputs
    const fMin = Math.min(fMaxVal, fMinVal);
    const fMax = Math.max(fMaxVal, fMinVal);
    const eMin = Math.min(eMaxVal, eMinVal);
    const eMax = Math.max(eMaxVal, eMinVal);

    let fitType: "folga" | "interferencia" | "transicao" = "transicao";
    let maxInterference = 0;
    let minInterference = 0;
    let maxClearance = 0;
    let minClearance = 0;

    if (eMin >= fMax) {
      // Pure interference fit (Ajuste com interferência / atrito total)
      fitType = "interferencia";
      maxInterference = eMax - fMin;
      minInterference = eMin - fMax;
    } else if (fMin >= eMax) {
      // Pure clearance fit (Ajuste com folga / livre sem atrito)
      fitType = "folga";
      maxClearance = fMax - eMin;
      minClearance = fMin - eMax;
    } else {
      // Transition fit (Ajuste de transição / incerto)
      fitType = "transicao";
      maxInterference = eMax - fMin; // When shaft is largest and hole is smallest
      maxClearance = fMax - eMin;    // When hole is largest and shaft is smallest
    }

    return {
      fitType,
      maxInterference,
      minInterference,
      maxClearance,
      minClearance,
    };
  };

  const getTab2Data = () => {
    const fMax = parseFloat(fMaxStr.replace(",", "."));
    const fMin = parseFloat(fMinStr.replace(",", "."));
    const eMax = parseFloat(eMaxStr.replace(",", "."));
    const eMin = parseFloat(eMinStr.replace(",", "."));

    if (isNaN(fMax) || isNaN(fMin) || isNaN(eMax) || isNaN(eMin)) {
      return null;
    }
    return calculateFit(fMax, fMin, eMax, eMin);
  };

  const fitData = getTab2Data();

  // Calculate Tab 3: ISO ABNT NBR/ISO 286 Tolerances
  const queryIsoTolerance = (type: "hole" | "shaft", nominal: number, className: string) => {
    const idx = getRangeIndex(nominal);
    if (idx === -1) return null;

    const list = type === "hole" ? HOLE_TOLERANCES : SHAFT_TOLERANCES;
    const key = type === "hole" ? className : className.toLowerCase();
    const deviations = list[key];

    if (!deviations || !deviations[idx]) return null;

    const [upperMicrons, lowerMicrons] = deviations[idx];
    const upperMm = upperMicrons / 1000;
    const lowerMm = lowerMicrons / 1000;

    const limitMax = nominal + upperMm;
    const limitMin = nominal + lowerMm;
    const ideal = (limitMax + limitMin) / 2;

    return {
      range: ISO_RANGES[idx].label,
      upperMicrons,
      lowerMicrons,
      upperMm,
      lowerMm,
      limitMax,
      limitMin,
      ideal,
    };
  };

  const nominalVal = parseFloat(nominalStr.replace(",", "."));
  const isNominalValid = !isNaN(nominalVal) && nominalVal > 1 && nominalVal <= 250;

  const holeResult = isNominalValid ? queryIsoTolerance("hole", nominalVal, selectedHoleClass) : null;
  const shaftResult = isNominalValid ? queryIsoTolerance("shaft", nominalVal, selectedShaftClass) : null;

  // Auto-calculated combined fit from ISO tab
  const getCombinedIsoFit = () => {
    if (!holeResult || !shaftResult) return null;
    return calculateFit(holeResult.limitMax, holeResult.limitMin, shaftResult.limitMax, shaftResult.limitMin);
  };
  const combinedIsoFit = getCombinedIsoFit();

  const handleInsert = (value: number) => {
    if (onInsertCode) {
      onInsertCode(value.toFixed(4));
    }
  };

  return (
    <div className={`p-5 flex flex-col h-full overflow-y-auto ${isHighContrast ? "bg-white text-black" : "bg-[#141419] text-zinc-300"}`}>
      
      {/* Tab Selectors */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab("cota_ideal")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer uppercase font-mono ${
            activeTab === "cota_ideal"
              ? "bg-[#00f3ff]/15 text-[#00f3ff] border border-[#00f3ff]/30 shadow-[0_0_15px_rgba(0,243,255,0.1)]"
              : "bg-[#1d1d24] border border-zinc-800 hover:text-zinc-200 text-zinc-400"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Cota Ideal (Cota Média)
        </button>

        <button
          onClick={() => setActiveTab("ajuste_press")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer uppercase font-mono ${
            activeTab === "ajuste_press"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              : "bg-[#1d1d24] border border-zinc-800 hover:text-zinc-200 text-zinc-400"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Ajuste Folga / Interferência
        </button>

        <button
          onClick={() => setActiveTab("iso_tolerances")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer uppercase font-mono ${
            activeTab === "iso_tolerances"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
              : "bg-[#1d1d24] border border-zinc-800 hover:text-zinc-200 text-zinc-400"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Tolerâncias ISO (ABNT)
        </button>
      </div>

      {/* TAB 1 CONTENT: Cota Ideal */}
      {activeTab === "cota_ideal" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch flex-1">
          {/* Form */}
          <div className="bg-[#1b1b22] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-zinc-800 pb-2">
                <Info className="w-4 h-4 text-[#00f3ff]" />
                <h3 className="font-mono text-sm font-bold uppercase text-zinc-200">Definição de Cota Ideal</h3>
              </div>
              <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                Na usinagem CNC de precisão, programar pela <strong>Cota Média (Cota Ideal)</strong> evita desvios. 
                Ao calcular o ponto médio da tolerância, você garante que as peças fiquem exatamente no centro da tolerância dimensional, prevenindo rejeições por desgaste da ferramenta.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono mb-1.5">
                    Cota / Dimensão Máxima (mm)
                  </label>
                  <input
                    type="text"
                    value={dMaxStr}
                    onChange={(e) => setDMaxStr(e.target.value)}
                    className="w-full bg-[#101014] text-zinc-100 px-3 py-2 text-sm rounded-lg border border-zinc-800 focus:border-[#00f3ff] focus:outline-none"
                    placeholder="Ex: 20.030"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono mb-1.5">
                    Cota / Dimensão Mínima (mm)
                  </label>
                  <input
                    type="text"
                    value={dMinStr}
                    onChange={(e) => setDMinStr(e.target.value)}
                    className="w-full bg-[#101014] text-zinc-100 px-3 py-2 text-sm rounded-lg border border-zinc-800 focus:border-[#00f3ff] focus:outline-none"
                    placeholder="Ex: 19.990"
                  />
                </div>
              </div>

              {/* Theoretical formula representation */}
              <div className="bg-[#121217] p-3 rounded-lg border border-zinc-850 text-center font-mono text-[11px] text-zinc-400">
                <div className="font-bold text-zinc-300 uppercase tracking-widest text-[9px] mb-1 text-left">Fórmula da Cota Ideal</div>
                <div className="inline-block border-b border-zinc-700 pb-1 px-4 mb-1">
                  D<sub>máx</sub> + D<sub>mín</sub>
                </div>
                <div>2</div>
              </div>
            </div>

            {cotaIdealResult !== null && (
              <div className="mt-5 pt-4 border-t border-zinc-800">
                <div className="text-[10px] font-bold text-[#00f3ff] uppercase tracking-wider font-mono mb-1">Cota Ideal Calculada (Cota Média)</div>
                <div className="flex items-end justify-between bg-[#121216] border border-[#00f3ff]/20 p-3 rounded-xl">
                  <span className="text-3xl font-black font-mono text-[#00f3ff]">
                    {cotaIdealResult.toFixed(4)} <span className="text-sm font-normal">mm</span>
                  </span>
                  <button
                    onClick={() => handleInsert(cotaIdealResult)}
                    className="px-3 py-2 bg-[#00f3ff]/15 hover:bg-[#00f3ff] text-[#00f3ff] hover:text-zinc-950 font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer uppercase"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Inserir no Editor
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Graphic/Visual Representation */}
          <div className="bg-[#16161d] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <div className="flex flex-col h-full justify-between gap-4">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Representação Gráfica da Tolerância</span>
              
              {/* Dynamic bar display */}
              <div className="flex-1 flex flex-col justify-center items-center py-6">
                <div className="w-full max-w-xs bg-zinc-900 border border-zinc-850 h-28 rounded-xl relative overflow-hidden p-3 flex flex-col justify-between shadow-inner">
                  {/* Max Limit label */}
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400 border-b border-dashed border-emerald-500/20 pb-1">
                    <span>Máximo:</span>
                    <span className="font-bold text-emerald-400">{parseFloat(dMaxStr.replace(",", ".")).toFixed(4)} mm</span>
                  </div>

                  {/* Ideal line indicator */}
                  <div className="relative h-6 flex items-center justify-center">
                    <div className="absolute inset-y-0 w-0.5 bg-cyan-400 z-10 shadow-[0_0_8px_#00f3ff]"></div>
                    <div className="absolute inset-x-12 h-1.5 bg-cyan-400/25 rounded"></div>
                    <span className="z-20 bg-zinc-950 text-[#00f3ff] border border-cyan-400/40 px-2 py-0.5 rounded font-mono text-[9px] font-bold">
                      COTA IDEAL: {cotaIdealResult !== null ? cotaIdealResult.toFixed(4) : "---"} mm
                    </span>
                  </div>

                  {/* Min Limit label */}
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400 border-t border-dashed border-red-500/20 pt-1">
                    <span>Mínimo:</span>
                    <span className="font-bold text-red-400">{parseFloat(dMinStr.replace(",", ".")).toFixed(4)} mm</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#1d1d25]/50 p-3.5 rounded-lg border border-zinc-800 text-xs leading-relaxed text-zinc-400">
                💡 <strong className="text-zinc-200">Dica Prática:</strong> Ao tornear ou fresar, ajuste sua ferramenta mirando sempre na cota ideal calculada. Isso dá à sua máquina a máxima margem de segurança para desvios positivos ou negativos antes de perder a peça.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 CONTENT: Ajuste com Interferência ou Folga */}
      {activeTab === "ajuste_press" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch flex-1">
          {/* Inputs Panel */}
          <div className="bg-[#1b1b22] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3 border-b border-zinc-800 pb-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <h3 className="font-mono text-sm font-bold uppercase text-zinc-200">Dimensões do Acoplamento</h3>
              </div>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Insira as dimensões reais ou de tolerância do <strong>Furo (Hole)</strong> e do <strong>Eixo (Shaft)</strong> para determinar o tipo de acoplamento mecânico (com atrito sob pressão ou folga livre).
              </p>

              <div className="space-y-4">
                {/* Hole Form */}
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
                  <div className="text-[10px] font-bold text-zinc-200 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block"></span>
                    Dimensões do Furo (Fêmea)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-mono uppercase mb-1">Furo Máximo (mm)</label>
                      <input
                        type="text"
                        value={fMaxStr}
                        onChange={(e) => setFMaxStr(e.target.value)}
                        className="w-full bg-[#101014] text-zinc-100 px-2.5 py-1.5 text-xs rounded border border-zinc-800 focus:border-emerald-500 focus:outline-none"
                        placeholder="Ex: 25.21"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-mono uppercase mb-1">Furo Mínimo (mm)</label>
                      <input
                        type="text"
                        value={fMinStr}
                        onChange={(e) => setFMinStr(e.target.value)}
                        className="w-full bg-[#101014] text-zinc-100 px-2.5 py-1.5 text-xs rounded border border-zinc-800 focus:border-emerald-500 focus:outline-none"
                        placeholder="Ex: 25.00"
                      />
                    </div>
                  </div>
                </div>

                {/* Shaft Form */}
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
                  <div className="text-[10px] font-bold text-zinc-200 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                    Dimensões do Eixo (Macho)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-mono uppercase mb-1">Eixo Máximo (mm)</label>
                      <input
                        type="text"
                        value={eMaxStr}
                        onChange={(e) => setEMaxStr(e.target.value)}
                        className="w-full bg-[#101014] text-zinc-100 px-2.5 py-1.5 text-xs rounded border border-zinc-800 focus:border-emerald-500 focus:outline-none"
                        placeholder="Ex: 25.41"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-mono uppercase mb-1">Eixo Mínimo (mm)</label>
                      <input
                        type="text"
                        value={eMinStr}
                        onChange={(e) => setEMinStr(e.target.value)}
                        className="w-full bg-[#101014] text-zinc-100 px-2.5 py-1.5 text-xs rounded border border-zinc-800 focus:border-emerald-500 focus:outline-none"
                        placeholder="Ex: 25.28"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#121217] p-3 rounded-lg border border-zinc-850 text-[10px] font-mono text-zinc-400 space-y-1">
              <div>📏 <strong className="text-zinc-300">Regra de Acoplamento:</strong></div>
              <div>• Eixo maior que Furo = <span className="text-red-400 font-bold">Interferência (Pressão / Atrito)</span></div>
              <div>• Furo maior que Eixo = <span className="text-emerald-400 font-bold">Folga (Montagem Deslizante)</span></div>
            </div>
          </div>

          {/* Results Visual Panel */}
          <div className="bg-[#16161d] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            {fitData ? (
              <div className="flex flex-col h-full justify-between gap-4">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono block mb-2">Resultado da Análise</span>
                  
                  {/* Badge for fit type */}
                  {fitData.fitType === "interferencia" && (
                    <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-3 rounded-xl flex flex-col gap-1">
                      <div className="font-bold text-sm uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                        Ajuste com Interferência Máxima (Prensado)
                      </div>
                      <div className="text-[10px] text-zinc-400">Montagem sob pressão / atrito total. Requer prensa hidráulica ou indução térmica.</div>
                    </div>
                  )}

                  {fitData.fitType === "folga" && (
                    <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl flex flex-col gap-1">
                      <div className="font-bold text-sm uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                        Ajuste com Folga Livre (Deslizante)
                      </div>
                      <div className="text-[10px] text-zinc-400">Montagem livre sem resistência. Excelente para eixos rotativos, mancais ou guias.</div>
                    </div>
                  )}

                  {fitData.fitType === "transicao" && (
                    <div className="bg-amber-500/15 border border-amber-500/30 text-amber-400 p-3 rounded-xl flex flex-col gap-1">
                      <div className="font-bold text-sm uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                        Ajuste de Transição / Incerto (Híbrido)
                      </div>
                      <div className="text-[10px] text-zinc-400">Pode gerar folga ou leve interferência dependendo da variação real das peças.</div>
                    </div>
                  )}
                </div>

                {/* Values columns */}
                <div className="grid grid-cols-2 gap-3 my-2">
                  <div className="bg-[#121216] border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[9px] font-mono text-zinc-400 uppercase">Valores de Interferência</span>
                    <div className="flex flex-col mt-1 font-mono">
                      <div className="flex justify-between border-b border-zinc-850 py-1">
                        <span className="text-[10px] text-zinc-500">Máxima:</span>
                        <span className="text-red-400 font-bold">{fitData.maxInterference > 0 ? `${fitData.maxInterference.toFixed(3)} mm` : "N/A"}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[10px] text-zinc-500">Mínima:</span>
                        <span className="text-red-300 font-bold">{fitData.minInterference > 0 ? `${fitData.minInterference.toFixed(3)} mm` : "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#121216] border border-zinc-800 p-3 rounded-xl">
                    <span className="text-[9px] font-mono text-zinc-400 uppercase">Valores de Folga</span>
                    <div className="flex flex-col mt-1 font-mono">
                      <div className="flex justify-between border-b border-zinc-850 py-1">
                        <span className="text-[10px] text-zinc-500">Máxima:</span>
                        <span className="text-emerald-400 font-bold">{fitData.maxClearance > 0 ? `${fitData.maxClearance.toFixed(3)} mm` : "N/A"}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[10px] text-zinc-500">Mínima:</span>
                        <span className="text-emerald-300 font-bold">{fitData.minClearance > 0 ? `${fitData.minClearance.toFixed(3)} mm` : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic fit schematic drawing */}
                <div className="h-20 bg-zinc-950 rounded-xl relative border border-zinc-850 overflow-hidden flex items-center justify-around">
                  <div className="w-1/3 text-center border-r border-zinc-850 p-2">
                    <div className="text-[8px] text-zinc-500 font-mono uppercase">Diâmetro Furo</div>
                    <div className="text-xs font-bold text-cyan-400 font-mono">
                      {((parseFloat(fMaxStr) + parseFloat(fMinStr)) / 2).toFixed(3)} mm
                    </div>
                  </div>
                  <div className="text-center font-mono text-zinc-400 text-xs px-2">
                    <ArrowRight className={`w-4 h-4 mx-auto mb-1 ${
                      fitData.fitType === "interferencia" ? "text-red-400" : fitData.fitType === "folga" ? "text-emerald-400" : "text-amber-400"
                    }`} />
                    <span className="text-[9px] uppercase font-bold tracking-wider">
                      {fitData.fitType}
                    </span>
                  </div>
                  <div className="w-1/3 text-center border-l border-zinc-850 p-2">
                    <div className="text-[8px] text-zinc-500 font-mono uppercase">Diâmetro Eixo</div>
                    <div className="text-xs font-bold text-amber-500 font-mono">
                      {((parseFloat(eMaxStr) + parseFloat(eMinStr)) / 2).toFixed(3)} mm
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col justify-center items-center h-full text-zinc-500 text-xs gap-2 py-10">
                <Info className="w-8 h-8 text-zinc-650" />
                <span>Insira valores válidos acima para ver os cálculos de acoplamento</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3 CONTENT: Tolerâncias ISO / ABNT */}
      {activeTab === "iso_tolerances" && (
        <div className="flex flex-col gap-5 flex-1">
          {/* Query Inputs */}
          <div className="bg-[#1b1b22] border border-zinc-800 p-4 rounded-xl">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono mb-1.5">
                  Diâmetro Nominal Ø (mm)
                </label>
                <input
                  type="number"
                  min="1.01"
                  max="250"
                  step="0.01"
                  value={nominalStr}
                  onChange={(e) => setNominalStr(e.target.value)}
                  className="w-full bg-[#101014] text-zinc-100 px-3 py-2 text-xs rounded-lg border border-zinc-800 focus:border-amber-400 focus:outline-none font-mono"
                  placeholder="Ex: 25"
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono mb-1.5">
                  Tolerância Furo (Ex: H7, E8)
                </label>
                <select
                  value={selectedHoleClass}
                  onChange={(e) => setSelectedHoleClass(e.target.value)}
                  className="w-full bg-[#101014] text-zinc-100 px-3 py-2 text-xs rounded-lg border border-zinc-800 focus:border-amber-400 focus:outline-none font-mono"
                >
                  {Object.keys(HOLE_TOLERANCES).sort().map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono mb-1.5">
                  Tolerância Eixo (Ex: g6, h7)
                </label>
                <select
                  value={selectedShaftClass}
                  onChange={(e) => setSelectedShaftClass(e.target.value.toLowerCase())}
                  className="w-full bg-[#101014] text-zinc-100 px-3 py-2 text-xs rounded-lg border border-zinc-800 focus:border-amber-400 focus:outline-none font-mono"
                >
                  {Object.keys(SHAFT_TOLERANCES).sort().map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  disabled={!isNominalValid}
                  onClick={() => {
                    // Quick prefill of tab 2 inputs based on tab 3 results
                    if (holeResult && shaftResult) {
                      setFMaxStr(holeResult.limitMax.toFixed(4));
                      setFMinStr(holeResult.limitMin.toFixed(4));
                      setEMaxStr(shaftResult.limitMax.toFixed(4));
                      setEMinStr(shaftResult.limitMin.toFixed(4));
                      setActiveTab("ajuste_press");
                    }
                  }}
                  className={`w-full py-2 text-xs font-bold rounded-lg transition uppercase font-mono cursor-pointer ${
                    isNominalValid
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-zinc-950"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-850"
                  }`}
                >
                  Comparar Acoplamento
                </button>
              </div>
            </div>
            {!isNominalValid && (
              <div className="text-[10px] text-red-400 font-mono mt-2">
                ⚠️ Diâmetro Nominal deve ser maior que 1mm e menor ou igual a 250mm (conforme limite das tabelas ABNT).
              </div>
            )}
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* HOLE CARDS */}
            <div className="bg-[#1b1b22] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00f3ff]"></span>
                    <span className="font-mono text-sm font-bold text-zinc-100">FURO Ø {nominalVal} <span className="text-[#00f3ff] font-black">{selectedHoleClass}</span></span>
                  </div>
                  <span className="text-[9px] bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 px-2 py-0.5 rounded font-mono">CONFORME TABELA</span>
                </div>

                {holeResult ? (
                  <div className="space-y-3 font-mono">
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Classe de Dimensão:</span>
                      <span className="text-zinc-200 font-bold">{holeResult.range}</span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Afastamento Superior (ES):</span>
                      <span className="text-emerald-400 font-bold">
                        {holeResult.upperMicrons >= 0 ? `+${holeResult.upperMicrons}` : holeResult.upperMicrons} µm 
                        <span className="text-[10px] text-zinc-500 ml-1">({holeResult.upperMm >= 0 ? `+${holeResult.upperMm.toFixed(4)}` : holeResult.upperMm.toFixed(4)}mm)</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Afastamento Inferior (EI):</span>
                      <span className="text-[#00f3ff] font-bold">
                        {holeResult.lowerMicrons >= 0 ? `+${holeResult.lowerMicrons}` : holeResult.lowerMicrons} µm
                        <span className="text-[10px] text-zinc-500 ml-1">({holeResult.lowerMm >= 0 ? `+${holeResult.lowerMm.toFixed(4)}` : holeResult.lowerMm.toFixed(4)}mm)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="bg-[#121216] p-2 rounded-lg text-center border border-zinc-850">
                        <span className="text-[8px] text-zinc-500 uppercase block">Furo Máximo</span>
                        <span className="text-xs font-black text-emerald-400">{holeResult.limitMax.toFixed(4)} mm</span>
                      </div>
                      <div className="bg-[#121216] p-2 rounded-lg text-center border border-zinc-850">
                        <span className="text-[8px] text-zinc-500 uppercase block">Furo Mínimo</span>
                        <span className="text-xs font-black text-[#00f3ff]">{holeResult.limitMin.toFixed(4)} mm</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 font-mono text-center py-6">Sem dados cadastrados para essa combinação.</div>
                )}
              </div>

              {holeResult && (
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-zinc-500 uppercase font-mono">Cota Ideal Furo</span>
                    <span className="text-sm font-black text-[#00f3ff] font-mono">{holeResult.ideal.toFixed(4)} mm</span>
                  </div>
                  <button
                    onClick={() => handleInsert(holeResult.ideal)}
                    className="px-2.5 py-1.5 bg-[#00f3ff]/10 hover:bg-[#00f3ff] text-[#00f3ff] hover:text-zinc-950 font-mono text-[10px] font-bold rounded transition"
                  >
                    Inserir Cota Ideal Furo
                  </button>
                </div>
              )}
            </div>

            {/* SHAFT CARDS */}
            <div className="bg-[#1b1b22] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="font-mono text-sm font-bold text-zinc-100">EIXO Ø {nominalVal} <span className="text-amber-400 font-black">{selectedShaftClass}</span></span>
                  </div>
                  <span className="text-[9px] bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 px-2 py-0.5 rounded font-mono">CONFORME TABELA</span>
                </div>

                {shaftResult ? (
                  <div className="space-y-3 font-mono">
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Classe de Dimensão:</span>
                      <span className="text-zinc-200 font-bold">{shaftResult.range}</span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Afastamento Superior (es):</span>
                      <span className="text-emerald-400 font-bold">
                        {shaftResult.upperMicrons >= 0 ? `+${shaftResult.upperMicrons}` : shaftResult.upperMicrons} µm
                        <span className="text-[10px] text-zinc-500 ml-1">({shaftResult.upperMm >= 0 ? `+${shaftResult.upperMm.toFixed(4)}` : shaftResult.upperMm.toFixed(4)}mm)</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-zinc-850 py-1.5">
                      <span className="text-zinc-400">Afastamento Inferior (ei):</span>
                      <span className="text-[#00f3ff] font-bold">
                        {shaftResult.lowerMicrons >= 0 ? `+${shaftResult.lowerMicrons}` : shaftResult.lowerMicrons} µm
                        <span className="text-[10px] text-zinc-500 ml-1">({shaftResult.lowerMm >= 0 ? `+${shaftResult.lowerMm.toFixed(4)}` : shaftResult.lowerMm.toFixed(4)}mm)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="bg-[#121216] p-2 rounded-lg text-center border border-zinc-850">
                        <span className="text-[8px] text-zinc-500 uppercase block">Eixo Máximo</span>
                        <span className="text-xs font-black text-emerald-400">{shaftResult.limitMax.toFixed(4)} mm</span>
                      </div>
                      <div className="bg-[#121216] p-2 rounded-lg text-center border border-zinc-850">
                        <span className="text-[8px] text-zinc-500 uppercase block">Eixo Mínimo</span>
                        <span className="text-xs font-black text-[#00f3ff]">{shaftResult.limitMin.toFixed(4)} mm</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 font-mono text-center py-6">Sem dados cadastrados para essa combinação.</div>
                )}
              </div>

              {shaftResult && (
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-zinc-500 uppercase font-mono">Cota Ideal Eixo</span>
                    <span className="text-sm font-black text-amber-500 font-mono">{shaftResult.ideal.toFixed(4)} mm</span>
                  </div>
                  <button
                    onClick={() => handleInsert(shaftResult.ideal)}
                    className="px-2.5 py-1.5 bg-[#00f3ff]/10 hover:bg-[#00f3ff] text-[#00f3ff] hover:text-zinc-950 font-mono text-[10px] font-bold rounded transition"
                  >
                    Inserir Cota Ideal Eixo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Automatic fit diagnostics if both are found */}
          {holeResult && shaftResult && combinedIsoFit && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
              <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-widest block mb-2">✦ Diagnóstico de Acoplamento Gerado por Tabela</span>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-zinc-200">
                    Ajuste ISO Requerido: <span className="text-amber-400 font-mono">Ø{nominalVal} {selectedHoleClass}/{selectedShaftClass}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {combinedIsoFit.fitType === "interferencia" && "🔴 Acoplamento com Interferência (Prensado/Atrito total de NBR)."}
                    {combinedIsoFit.fitType === "folga" && "🟢 Acoplamento com Folga NBR (Montagem mecânica suave/livre)."}
                    {combinedIsoFit.fitType === "transicao" && "🟡 Acoplamento de Transição (Ajuste incerto, montagem deslizante sob ajuste fino)."}
                  </div>
                </div>

                <div className="flex gap-4 font-mono text-xs text-zinc-300">
                  {combinedIsoFit.maxInterference > 0 && (
                    <div>
                      <span className="text-[9px] text-zinc-500 block uppercase">Interferência Máx.</span>
                      <span className="text-red-400 font-bold">{combinedIsoFit.maxInterference.toFixed(3)} mm</span>
                    </div>
                  )}
                  {combinedIsoFit.maxClearance > 0 && (
                    <div>
                      <span className="text-[9px] text-zinc-500 block uppercase">Folga Máx.</span>
                      <span className="text-emerald-400 font-bold">{combinedIsoFit.maxClearance.toFixed(3)} mm</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
