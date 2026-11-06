import React, { useState } from "react";
import { Clock, X, Settings, RotateCcw, AlertTriangle, Factory } from "lucide-react";
import {
  CycleTimeBreakdown,
  MachineParams,
  DEFAULT_MACHINE_PARAMS,
  formatCycleTime,
} from "../utils/cycleTimeCalculator";
import { ResizableBox } from "./ResizableBox";

/**
 * Painel "Tempo de Ciclo" (abre ao tocar no tempo de ciclo do simulador)
 * - Mostra o tempo total, corte / rápido / paradas
 * - Tempo de cada FERRAMENTA (quanto cada uma pesa no ciclo)
 * - Produção: tempo por peça (com troca de peça), peças por hora e por turno
 * - Parâmetros da máquina (ficam salvos no tablet)
 * Obs.: os tempos já vêm multiplicados pela calibração % do potenciômetro.
 */
interface CycleTimePanelProps {
  details: CycleTimeBreakdown;
  factorPercent: number;
  params: MachineParams;
  onChangeParams: (p: MachineParams) => void;
  onClose: () => void;
}

const fmt = (sec: number) => {
  if (!isFinite(sec) || sec <= 0) return "0,0 s";
  if (sec < 60) return `${sec.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m} min ${s.toFixed(0).padStart(2, "0")} s`;
};

const PARAM_FIELDS: { key: keyof MachineParams; label: string; unit: string; step: number }[] = [
  { key: "rapidX", label: "Avanço rápido X", unit: "m/min", step: 1 },
  { key: "rapidZ", label: "Avanço rápido Z", unit: "m/min", step: 1 },
  { key: "rapidY", label: "Avanço rápido Y", unit: "m/min", step: 1 },
  { key: "toolChangeSec", label: "Troca de ferramenta", unit: "s", step: 0.1 },
  { key: "spindleStartSec", label: "Partida do fuso (M03/M04)", unit: "s", step: 0.1 },
  { key: "spindleStopSec", label: "Parada do fuso (M05)", unit: "s", step: 0.1 },
  { key: "maxRPM", label: "Rotação máxima da máquina", unit: "rpm", step: 100 },
  { key: "partLoadSec", label: "Troca de peça (carga/descarga)", unit: "s", step: 1 },
  { key: "shiftHours", label: "Horas do turno", unit: "h", step: 0.5 },
];

export const CycleTimePanel: React.FC<CycleTimePanelProps> = ({ details, factorPercent, params, onChangeParams, onClose }) => {
  const [showParams, setShowParams] = useState(false);
  const k = factorPercent / 100;

  const total = details.totalSeconds * k;
  const feed = details.feedSeconds * k;
  const rapid = details.rapidSeconds * k;
  const delay = details.delaySeconds * k;
  const perPiece = total + params.partLoadSec;
  const piecesHour = perPiece > 0 ? 3600 / perPiece : 0;
  const piecesShift = piecesHour * params.shiftHours;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const maxTool = Math.max(0.0001, ...details.perTool.map((t) => t.totalSeconds * k));

  const setParam = (key: keyof MachineParams, raw: string) => {
    const v = parseFloat(raw.replace(",", "."));
    if (isNaN(v) || v < 0) return;
    onChangeParams({ ...params, [key]: v });
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-16 px-3 bg-black/30"
      onClick={onClose}
    >
      <ResizableBox
        id="painel_tempo_ciclo"
        anchor="tl"
        className="relative w-full max-w-[560px] max-h-[80vh] overflow-y-auto bg-white text-zinc-800 border border-zinc-300 rounded-xl shadow-2xl font-sans select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="sticky top-0 bg-white border-b border-zinc-200 px-4 py-3 flex items-center justify-between z-10">
          <span className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Tempo de Ciclo
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 text-zinc-500" title="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Total */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wide font-bold text-zinc-500">Ciclo da peça (programa)</div>
              <div className="text-3xl font-black font-mono text-zinc-900">{formatCycleTime(total, true)}</div>
            </div>
            <div className="text-[11px] text-zinc-500 text-right leading-snug">
              Calculado: {formatCycleTime(details.totalSeconds, true)}
              <br />
              Calibração: <b className={factorPercent === 100 ? "text-emerald-600" : "text-amber-600"}>{factorPercent}%</b>
            </div>
          </div>

          {/* Corte / Rápido / Paradas */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { t: "Corte", v: feed, c: "bg-emerald-500", d: "G01/G02/G03 e ciclos" },
              { t: "Rápido", v: rapid, c: "bg-sky-500", d: "G00 e retornos" },
              { t: "Paradas", v: delay, c: "bg-amber-500", d: "Troca de T, fuso, G04" },
            ].map((x) => (
              <div key={x.t} className="border border-zinc-200 rounded-lg p-2.5" title={x.d}>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase">
                  <span className={`w-2 h-2 rounded-full ${x.c}`} /> {x.t}
                </div>
                <div className="text-base font-black font-mono text-zinc-900">{fmt(x.v)}</div>
                <div className="text-[11px] text-zinc-500">{pct(x.v).toFixed(0)}%</div>
              </div>
            ))}
          </div>

          {/* Produção */}
          <div className="border border-zinc-200 rounded-lg p-3 bg-zinc-50">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase mb-2">
              <Factory className="w-3.5 h-3.5" /> Produção
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[11px] text-zinc-500">Tempo por peça</div>
                <div className="font-black font-mono text-zinc-900">{formatCycleTime(perPiece, false)}</div>
                <div className="text-[10px] text-zinc-400">ciclo + {params.partLoadSec}s troca</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Peças / hora</div>
                <div className="font-black font-mono text-emerald-700 text-lg">{piecesHour.toFixed(1).replace(".", ",")}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Peças / turno ({params.shiftHours}h)</div>
                <div className="font-black font-mono text-emerald-700 text-lg">{Math.floor(piecesShift)}</div>
              </div>
            </div>
          </div>

          {/* Por ferramenta */}
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase mb-1.5">Tempo por ferramenta</div>
            {details.perTool.length === 0 ? (
              <div className="text-xs text-zinc-500">Nenhum movimento encontrado no programa.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {details.perTool.map((t) => {
                  const tot = t.totalSeconds * k;
                  return (
                    <div key={t.key} className="border border-zinc-200 rounded-lg px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono font-black text-sm text-zinc-900 mr-2">{t.key === "INICIO" ? "—" : t.tool}</span>
                          <span className="text-xs text-zinc-600 truncate">{t.label}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-black text-sm text-zinc-900">{fmt(tot)}</span>
                          <span className="text-[11px] text-zinc-500 ml-1.5">{pct(tot).toFixed(0)}%</span>
                        </div>
                      </div>
                      {/* Barra: verde = corte, azul = rápido, laranja = paradas */}
                      <div className="mt-1.5 h-2 rounded-full bg-zinc-100 overflow-hidden flex" style={{ width: `${Math.max(4, (tot / maxTool) * 100)}%` }}>
                        <div className="bg-emerald-500 h-full" style={{ width: `${(t.feedSeconds / Math.max(0.0001, t.totalSeconds)) * 100}%` }} />
                        <div className="bg-sky-500 h-full" style={{ width: `${(t.rapidSeconds / Math.max(0.0001, t.totalSeconds)) * 100}%` }} />
                        <div className="bg-amber-500 h-full" style={{ width: `${(t.delaySeconds / Math.max(0.0001, t.totalSeconds)) * 100}%` }} />
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1 flex gap-3">
                        <span>Corte {fmt(t.feedSeconds * k)}</span>
                        <span>Rápido {fmt(t.rapidSeconds * k)}</span>
                        <span>Paradas {fmt(t.delaySeconds * k)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Avisos */}
          {details.warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-2.5 text-xs text-amber-800 flex flex-col gap-1">
              {details.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}

          {/* Parâmetros da máquina */}
          <div className="border border-zinc-200 rounded-lg">
            <button
              onClick={() => setShowParams(!showParams)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 rounded-lg"
            >
              <span className="flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Parâmetros da máquina
              </span>
              <span className="text-zinc-400">{showParams ? "▲" : "▼"}</span>
            </button>
            {showParams && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                {PARAM_FIELDS.filter((f) => f.key !== "g70FeedFromCycle").map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-600">{f.label}</span>
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={f.step}
                        value={params[f.key]}
                        onChange={(e) => setParam(f.key, e.target.value)}
                        className="w-20 border border-zinc-300 rounded px-1.5 py-1 text-right font-mono focus:outline-none focus:border-violet-500"
                      />
                      <span className="w-10 text-zinc-400">{f.unit}</span>
                    </span>
                  </label>
                ))}
                <label className="flex items-start gap-2 text-xs mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={params.g70FeedFromCycle !== 0}
                    onChange={(e) => onChangeParams({ ...params, g70FeedFromCycle: e.target.checked ? 1 : 0 })}
                    className="mt-0.5 accent-violet-600"
                  />
                  <span className="text-zinc-600 leading-snug">
                    G70: o avanço <b>F da linha do G70</b> vale para todo o acabamento{" "}
                    <span className="text-zinc-400">(desmarcado = regra Fanuc: vale o F escrito dentro do perfil)</span>
                  </span>
                </label>
                <button
                  onClick={() => onChangeParams({ ...DEFAULT_MACHINE_PARAMS })}
                  className="self-start mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 border border-zinc-300 rounded px-2 py-1 hover:bg-zinc-100"
                >
                  <RotateCcw className="w-3 h-3" /> Restaurar padrão
                </button>
                <p className="text-[10px] text-zinc-500 leading-snug">
                  Pegue os valores no manual da máquina. Ficam salvos neste tablet. Se o tempo calculado bater com o
                  tempo real da máquina, deixe a calibração em 100%.
                </p>
              </div>
            )}
          </div>
        </div>
      </ResizableBox>
    </div>
  );
};

export default CycleTimePanel;
