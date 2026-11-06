import { SimulationPlotItem } from "../types";

/* =====================================================================================
 * CALCULADORA DE TEMPO DE CICLO - TORNO CNC (padrão Fanuc / Romi / Mazak "sistema A")
 * -------------------------------------------------------------------------------------
 * Como funciona (resumo para quem não é programador):
 *  1. Lê o programa linha por linha, como o comando da máquina faz.
 *  2. Para cada movimento calcula:  TEMPO = DISTÂNCIA ÷ VELOCIDADE.
 *     - Corte (G01/G02/G03): velocidade = avanço (mm/rot) × rotação (RPM).
 *       Em G96 (velocidade de corte constante) a rotação muda conforme o diâmetro,
 *       então o corte é dividido em pedacinhos e cada pedaço usa a rotação real
 *       daquele diâmetro (limitada pelo G50 / rotação máxima).
 *     - Rápido (G00): cada eixo anda sozinho na sua velocidade máxima; vale o eixo
 *       mais demorado + um tempinho de aceleração/frenagem.
 *  3. Ciclos fixos são "desmontados" passe a passe, igual a máquina executa:
 *     G71 / G72 (desbaste), G73 (repetição de perfil), G70 (acabamento),
 *     G74 / G75 (pica-pau / canais), G76 / G92 / G32 (roscas), G90 / G94 (ciclos simples).
 *  4. Soma as paradas: troca de ferramenta, partida/parada do fuso, G04 (tempo de espera).
 *  5. Separa tudo por FERRAMENTA, para saber quanto cada uma "custa" no ciclo.
 * ===================================================================================== */

/** Parâmetros da máquina (ficam salvos no tablet e podem ser ajustados na tela) */
export interface MachineParams {
  rapidX: number; // Avanço rápido do eixo X (m/min)
  rapidZ: number; // Avanço rápido do eixo Z (m/min)
  rapidY: number; // Avanço rápido do eixo Y (m/min)
  toolChangeSec: number; // Tempo de troca (giro da torre) por ferramenta (s)
  spindleStartSec: number; // Tempo para o fuso acelerar até a rotação (M03/M04) (s)
  spindleStopSec: number; // Tempo para o fuso parar (M05) (s)
  maxRPM: number; // Rotação máxima da máquina (quando o programa não tem G50 S...)
  partLoadSec: number; // Tempo de troca de peça (descarga + carga + fechar placa) (s)
  shiftHours: number; // Horas do turno (para calcular peças por turno)
  g70FeedFromCycle: number; // 1 = o F escrito na linha do G70 manda no acabamento | 0 = regra Fanuc pura (vale o F do perfil)
}

export const DEFAULT_MACHINE_PARAMS: MachineParams = {
  rapidX: 20,
  rapidZ: 24,
  rapidY: 12,
  toolChangeSec: 2.0,
  spindleStartSec: 1.5,
  spindleStopSec: 1.0,
  maxRPM: 4000,
  partLoadSec: 30,
  shiftHours: 8,
  g70FeedFromCycle: 1,
};

const MACHINE_PARAMS_KEY = "cnc_machineParams";

/** Lê os parâmetros da máquina salvos no tablet (ou os valores padrão) */
export function loadMachineParams(): MachineParams {
  try {
    const raw = localStorage.getItem(MACHINE_PARAMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged: MachineParams = { ...DEFAULT_MACHINE_PARAMS };
      (Object.keys(DEFAULT_MACHINE_PARAMS) as (keyof MachineParams)[]).forEach((k) => {
        const v = Number(parsed[k]);
        if (!isNaN(v) && v >= 0) merged[k] = v;
      });
      return merged;
    }
  } catch {
    /* sem armazenamento disponível */
  }
  return { ...DEFAULT_MACHINE_PARAMS };
}

/** Salva os parâmetros da máquina no tablet */
export function saveMachineParams(p: MachineParams): void {
  try {
    localStorage.setItem(MACHINE_PARAMS_KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento disponível */
  }
}

/** Tempo de uma ferramenta dentro do ciclo */
export interface ToolTimeRow {
  key: string; // Ex.: "T01"
  tool: string; // Ex.: "T0101"
  label: string; // Ex.: "DESBASTE EXTERNO"
  feedSeconds: number; // Tempo cortando
  rapidSeconds: number; // Tempo em rápido
  delaySeconds: number; // Trocas, fuso, G04
  totalSeconds: number;
}

export interface CycleTimeBreakdown {
  totalSeconds: number;
  feedSeconds: number;
  rapidSeconds: number;
  delaySeconds: number;
  formatted: string;
  formattedTenths: string;
  perTool: ToolTimeRow[];
  warnings: string[];
}

interface CommandBlock {
  lineNumber: number;
  cleanText: string;
  comment: string;
  gCodes: number[];
  mCodes: number[];
  x: number | null;
  y: number | null;
  z: number | null;
  r: number | null;
  i: number | null;
  k: number | null;
  d: number | null;
  p: number | null;
  pRaw: string | null;
  q: number | null;
  u: number | null;
  v: number | null;
  w: number | null;
  f: number | null;
  s: number | null;
  t: string | null;
  n: number | null;
}

/** Um ponto/segmento do perfil (P...Q) */
interface ProfSeg {
  x1: number; z1: number; x2: number; z2: number; // X em DIÂMETRO
  rapid: boolean;
  arcR: number | null; // raio do arco (se G02/G03)
  f: number | null; // avanço programado dentro do perfil (vale no G70)
  s: number | null;
}

/**
 * Lê o valor numérico de uma letra (ex.: F.22 -> 0.22, X-15.5 -> -15.5, Z.5 -> 0.5)
 */
function extractValue(text: string, letter: string): number | null {
  const regex = new RegExp(`${letter}\\s*(-?(?:\\d+\\.\\d*|\\d+|\\.\\d+))`, "i");
  const m = text.match(regex);
  if (m) {
    const val = parseFloat(m[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

function extractRaw(text: string, letter: string): string | null {
  const regex = new RegExp(`${letter}\\s*(-?(?:\\d+\\.\\d*|\\d+|\\.\\d+))`, "i");
  const m = text.match(regex);
  return m ? m[1] : null;
}

/** Todos os códigos G da linha (ex.: G99G96 -> [99, 96]) */
function extractGCodes(text: string): number[] {
  const matches = Array.from(text.matchAll(/G\s*(\d+(?:\.\d+)?)/gi));
  return matches.map((m) => parseFloat(m[1]));
}

/** Todos os códigos M da linha (ex.: M3 M08 -> [3, 8]) */
function extractMCodes(text: string): number[] {
  const matches = Array.from(text.matchAll(/M\s*(\d+)/gi));
  return matches.map((m) => parseInt(m[1], 10));
}

/** Ferramenta chamada (ex.: T0101 -> "T0101") */
function extractTool(text: string): string | null {
  const m = text.match(/T\s*(\d{1,4})/i);
  return m ? `T${m[1]}` : null;
}

/** Chave da ferramenta: T0101 -> T01 | T1 -> T01 | T12 -> T12 */
function toolKey(tool: string): string {
  const digits = tool.replace(/\D/g, "");
  const num = digits.length >= 3 ? digits.slice(0, digits.length - 2) : digits;
  return "T" + String(parseInt(num || "0", 10)).padStart(2, "0");
}

/**
 * Calcula o tempo de ciclo detalhado do programa.
 * @param gcodeText       Texto do programa
 * @param rapidFeedMMin   (compatibilidade) Avanço rápido em m/min - usado só se não houver parâmetros da máquina
 * @param _plotList       (não usado - mantido por compatibilidade)
 * @param machineParams   Parâmetros da máquina (se não informado, lê os salvos no tablet)
 */
export function calculateCycleTimeDetailed(
  gcodeText: string,
  rapidFeedMMin?: number,
  _plotList?: SimulationPlotItem[],
  machineParams?: MachineParams
): CycleTimeBreakdown {
  const empty: CycleTimeBreakdown = {
    totalSeconds: 0,
    feedSeconds: 0,
    rapidSeconds: 0,
    delaySeconds: 0,
    formatted: "00:00:00",
    formattedTenths: "00:00:00.0",
    perTool: [],
    warnings: [],
  };
  if (!gcodeText || !gcodeText.trim()) return empty;

  const mp: MachineParams = machineParams ? { ...machineParams } : loadMachineParams();
  if (!machineParams && rapidFeedMMin !== undefined && rapidFeedMMin > 0 && rapidFeedMMin !== 24) {
    mp.rapidZ = rapidFeedMMin;
    mp.rapidX = rapidFeedMMin;
  }
  const vRapidX = Math.max(1, mp.rapidX) * 1000 / 60; // mm/s (no raio)
  const vRapidZ = Math.max(1, mp.rapidZ) * 1000 / 60; // mm/s
  const vRapidY = Math.max(1, mp.rapidY) * 1000 / 60; // mm/s
  const RAPID_ACCEL_SEC = 0.08; // aceleração + frenagem de cada movimento rápido
  const warnings: string[] = [];

  // ---------------------------------------------------------------- 1) LEITURA
  const lines = gcodeText.split("\n");
  const blocks: CommandBlock[] = [];
  const toolNames: Record<string, string> = {}; // T01 -> "DESBASTE EXTERNO"
  let lastOpComment = "";

  lines.forEach((lineText, idx) => {
    const comments = Array.from(lineText.matchAll(/\(([^)]*)\)/g)).map((m) => m[1].trim());
    let clean = lineText.replace(/\(.*?\)/g, "");
    const semiIdx = clean.indexOf(";");
    if (semiIdx !== -1) clean = clean.substring(0, semiIdx);
    clean = clean.trim();
    // Linha O (número do programa) e % não são movimentos
    if (/^O\d+/i.test(clean) || clean === "%") clean = "";

    // Nomes das ferramentas vindos dos comentários: (T0101 - DESBASTE EXTERNO)
    comments.forEach((c) => {
      const tm = c.match(/^T\s*(\d{1,4})\s*[-–:=]?\s*(.*)$/i);
      if (tm && tm[2]) {
        const k = toolKey("T" + tm[1]);
        if (!toolNames[k]) toolNames[k] = tm[2].trim();
      }
    });

    if (!clean) {
      if (comments.length) lastOpComment = comments[comments.length - 1];
      return;
    }

    const tool = extractTool(clean);
    if (tool) {
      const k = toolKey(tool);
      if (!toolNames[k]) {
        if (comments.length) toolNames[k] = comments.join(" ");
        else if (lastOpComment) toolNames[k] = lastOpComment;
      }
    }

    const matchP = extractValue(clean, "P");
    const matchQ = extractValue(clean, "Q");
    const matchF = extractValue(clean, "F");
    const matchS = extractValue(clean, "S");
    const matchN = clean.match(/^\s*N\s*(\d+)/i) || clean.match(/N\s*(\d+)/i);

    blocks.push({
      lineNumber: idx,
      cleanText: clean,
      comment: comments.join(" "),
      gCodes: extractGCodes(clean),
      mCodes: extractMCodes(clean),
      x: extractValue(clean, "X"),
      y: extractValue(clean, "Y"),
      z: extractValue(clean, "Z"),
      r: extractValue(clean, "R"),
      i: extractValue(clean, "I"),
      k: extractValue(clean, "K"),
      d: extractValue(clean, "D"),
      p: matchP !== null ? Math.round(matchP) : null,
      pRaw: extractRaw(clean, "P"),
      q: matchQ !== null ? Math.round(matchQ) : null,
      u: extractValue(clean, "U"),
      v: extractValue(clean, "V"),
      w: extractValue(clean, "W"),
      f: matchF !== null ? Math.abs(matchF) : null,
      s: matchS !== null ? Math.abs(matchS) : null,
      t: tool,
      n: matchN ? parseInt(matchN[1], 10) : null,
    });
  });

  // ---------------------------------------------------------------- 2) ESTADO DA MÁQUINA
  let motionMode = 0; // 0,1,2,3 (G00..G03)
  let cycleMode: number | null = null; // ciclo modal ativo (90, 92, 94) para linhas seguintes
  // Ciclo de furação ativo (G83/G84/G85 frontal | G87/G88/G89 radial) até o G80 ou um G00/G01
  let drillCycle: { g: number; zInit: number; xInit: number; depthTarget: number; r: number; q: number; p: number; f: number } | null = null;
  let isFeedPerRev = true; // G99/G95 = mm/rot (padrão torno) | G98/G94 = mm/min
  let isCSS = false; // G96 = velocidade de corte constante
  let isMetric = true;
  let currentFeed = 0.15;
  let currentS = 1000; // RPM (G97) ou m/min (G96)
  let maxRPM = Math.max(100, mp.maxRPM);
  let spindleOn = false;
  let lastG97RPM = 0;

  let curX = 0; // diâmetro
  let curY = 0;
  let curZ = 0;

  // Parâmetros da 1ª linha dos ciclos de 2 linhas
  let g71L1: { d: number; e: number } | null = null;
  let g72L1: { d: number; e: number } | null = null;
  let g73L1: { i: number; k: number; n: number } | null = null;
  let g74e = 0.5;
  let g75e = 0.5;
  let g76L1: { m: number; qmin: number; d: number } | null = null;
  let threadCycle: { pitch: number } | null = null; // G92 modal
  let simpleCycleFeed = 0.2;
  // Memória dos ciclos simples modais (G90/G92/G94)
  const cycleState: { lastX: number | null; lastZ: number | null } = { lastX: null, lastZ: null };
  // Tempo de partida do fuso que pertence à próxima ferramenta (M03 antes do T)
  let pendingToolDelay = 0;

  let feedSeconds = 0;
  let rapidSeconds = 0;
  let delaySeconds = 0;

  // ---- Separação por ferramenta
  const perTool: Record<string, ToolTimeRow> = {};
  const toolOrder: string[] = [];
  let curToolKey = "INICIO";
  const ensureTool = (key: string, tool: string) => {
    if (!perTool[key]) {
      perTool[key] = {
        key,
        tool,
        label: key === "INICIO" ? "Sem ferramenta (T) chamada" : toolNames[key] || "",
        feedSeconds: 0,
        rapidSeconds: 0,
        delaySeconds: 0,
        totalSeconds: 0,
      };
      toolOrder.push(key);
    }
  };
  const addFeed = (s: number) => {
    if (!(s > 0) || !isFinite(s)) return;
    feedSeconds += s;
    ensureTool(curToolKey, curToolKey);
    perTool[curToolKey].feedSeconds += s;
  };
  const addRapid = (s: number) => {
    if (!(s > 0) || !isFinite(s)) return;
    rapidSeconds += s;
    ensureTool(curToolKey, curToolKey);
    perTool[curToolKey].rapidSeconds += s;
  };
  const addDelay = (s: number) => {
    if (!(s > 0) || !isFinite(s)) return;
    delaySeconds += s;
    ensureTool(curToolKey, curToolKey);
    perTool[curToolKey].delaySeconds += s;
  };

  // ---- Rotação real em um diâmetro (G96 limitado pelo G50)
  const rpmAt = (dia: number): number => {
    if (isCSS) {
      const d = Math.max(0.5, Math.abs(dia));
      return Math.max(20, Math.min((currentS * 1000) / (Math.PI * d), maxRPM));
    }
    return Math.max(20, Math.min(currentS, maxRPM));
  };

  /**
   * Tempo de CORTE de uma reta/arco (de diâmetro x1 até x2).
   * Em G96 divide em pedaços para usar a rotação de cada diâmetro.
   */
  const cutTime = (len: number, x1: number, x2: number, f: number): number => {
    if (len <= 0.0001) return 0;
    let feed = f > 0 ? f : currentFeed;
    if (!isMetric) feed *= 25.4;
    if (!isFeedPerRev) {
      return len / (Math.max(0.1, feed) / 60) + 0.002; // mm/min
    }
    const steps = isCSS && Math.abs(x2 - x1) > 0.01 ? 24 : 1;
    let t = 0;
    for (let i = 0; i < steps; i++) {
      const dMid = x1 + ((x2 - x1) * (i + 0.5)) / steps;
      const v = (Math.max(0.0001, feed) * rpmAt(dMid)) / 60; // mm/s
      t += len / steps / v;
    }
    return t + 0.002; // processamento do bloco
  };

  /** Tempo de RÁPIDO (cada eixo anda independente; vale o mais lento) */
  const rapidTime = (dxDia: number, dz: number, dy: number = 0): number => {
    const tx = Math.abs(dxDia) / 2 / vRapidX;
    const tz = Math.abs(dz) / vRapidZ;
    const ty = Math.abs(dy) / vRapidY;
    const t = Math.max(tx, tz, ty);
    return t > 0.00001 ? t + RAPID_ACCEL_SEC : 0;
  };

  const scaleOf = () => (isMetric ? 1 : 25.4);

  /** Monta o perfil N(P)...N(Q) como lista de segmentos (X em diâmetro) */
  const buildProfile = (pN: number, qN: number, startX: number, startZ: number) => {
    const pIdx = blocks.findIndex((blk) => blk.n === pN);
    const qIdx = blocks.findIndex((blk, i) => i >= pIdx && blk.n === qN);
    if (pIdx === -1 || qIdx === -1 || qIdx < pIdx) return null;
    const sc = scaleOf();
    const segs: ProfSeg[] = [];
    let px = startX;
    let pz = startZ;
    let mode = motionMode;
    for (let k = pIdx; k <= qIdx; k++) {
      const blk = blocks[k];
      for (const g of blk.gCodes) if ([0, 1, 2, 3].includes(g)) mode = g;
      let tx = px;
      let tz = pz;
      if (blk.x !== null) tx = blk.x * sc;
      else if (blk.u !== null) tx = px + blk.u * sc;
      if (blk.z !== null) tz = blk.z * sc;
      else if (blk.w !== null) tz = pz + blk.w * sc;
      let arcR: number | null = null;
      if (mode === 2 || mode === 3) {
        if (blk.r !== null) arcR = Math.abs(blk.r) * sc;
        else if (blk.i !== null || blk.k !== null) arcR = Math.hypot((blk.i || 0) * sc, (blk.k || 0) * sc);
      }
      if (Math.abs(tx - px) > 0.00001 || Math.abs(tz - pz) > 0.00001) {
        segs.push({ x1: px, z1: pz, x2: tx, z2: tz, rapid: mode === 0, arcR, f: blk.f, s: blk.s });
      }
      px = tx;
      pz = tz;
    }
    return { segs, pIdx, qIdx };
  };

  /** Comprimento real de um segmento (reta ou arco) */
  const segLen = (s: ProfSeg): number => {
    const chord = Math.hypot((s.x2 - s.x1) / 2, s.z2 - s.z1);
    if (s.arcR && s.arcR > 0) {
      const ang = 2 * Math.asin(Math.min(1, chord / (2 * s.arcR)));
      return s.arcR * ang;
    }
    return chord;
  };

  /**
   * Para um nível de diâmetro "level", acha até onde (em Z) o passe longitudinal vai
   * antes de encostar no perfil (perfil já deslocado pelo sobremetal).
   * O passe sai do Z de partida e anda para Z-; ele para no PRIMEIRO ponto do perfil
   * que cruza esse diâmetro (o cruzamento com o maior Z). Funciona com o perfil
   * escrito em qualquer sentido (face -> placa ou placa -> face), externo ou interno.
   */
  const zLimitAtX = (segs: ProfSeg[], level: number, _dirX: number, fallbackZ: number): number => {
    let best: number | null = null;
    for (const s of segs) {
      const lo = Math.min(s.x1, s.x2) - 1e-6;
      const hi = Math.max(s.x1, s.x2) + 1e-6;
      if (level < lo || level > hi) continue;
      let z: number;
      if (Math.abs(s.x2 - s.x1) < 1e-9) z = Math.max(s.z1, s.z2);
      else z = s.z1 + (s.z2 - s.z1) * ((level - s.x1) / (s.x2 - s.x1));
      if (best === null || z > best) best = z;
    }
    return best === null ? fallbackZ : best;
  };

  /**
   * Para um nível de Z, até onde (em X) o passe de faceamento (G72) vai antes de encostar no perfil.
   * O passe sai do X de partida (diâmetro maior) e vem descendo; para no cruzamento com o maior X.
   */
  const xLimitAtZ = (segs: ProfSeg[], level: number, _dirZ: number, fallbackX: number): number => {
    let best: number | null = null;
    for (const s of segs) {
      const lo = Math.min(s.z1, s.z2) - 1e-6;
      const hi = Math.max(s.z1, s.z2) + 1e-6;
      if (level < lo || level > hi) continue;
      let x: number;
      if (Math.abs(s.z2 - s.z1) < 1e-9) x = Math.max(s.x1, s.x2);
      else x = s.x1 + (s.x2 - s.x1) * ((level - s.z1) / (s.z2 - s.z1));
      if (best === null || x > best) best = x;
    }
    return best === null ? fallbackX : best;
  };

  /** Executa o perfil inteiro em corte (G70 / passe final do G71/G72 / G73) */
  const runProfile = (segs: ProfSeg[], feed: number, useProfileFS: boolean, forceFeed: boolean = false) => {
    const savedS = currentS;
    const savedF = currentFeed;
    let f = feed;
    for (const s of segs) {
      if (useProfileFS && s.s !== null) currentS = s.s;
      if (useProfileFS && s.f !== null && !forceFeed) f = s.f;
      if (s.rapid) addRapid(rapidTime(s.x2 - s.x1, s.z2 - s.z1));
      else addFeed(cutTime(segLen(s), s.x1, s.x2, f));
    }
    if (!useProfileFS) {
      currentS = savedS;
      currentFeed = savedF;
    }
  };

  /** Segmentos do perfil sem o movimento de aproximação (do ponto de partida até o bloco P) */
  const withoutApproach = (segs: ProfSeg[], x0: number, z0: number, dx: number, dz: number) =>
    segs.length > 1 && Math.abs(segs[0].x1 - (x0 + dx)) < 1e-6 && Math.abs(segs[0].z1 - (z0 + dz)) < 1e-6 ? segs.slice(1) : segs;

  // ---------------------------------------------------------------- 3) EXECUÇÃO
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const b = blocks[bIdx];
    const sc = scaleOf();

    // Fim de programa: M30 / M02 / M99 -> o resto não é executado
    if (b.mCodes.includes(30) || b.mCodes.includes(2) || b.mCodes.includes(99)) {
      if (b.mCodes.includes(5) && spindleOn) {
        addDelay(mp.spindleStopSec);
        spindleOn = false;
      }
      break;
    }

    if (b.gCodes.includes(20)) isMetric = false;
    if (b.gCodes.includes(21)) isMetric = true;

    const hasXZ = (b.x !== null || b.u !== null) && (b.z !== null || b.w !== null);
    const hasMotionG = b.gCodes.some((g) => [0, 1, 2, 3].includes(g));

    // Modos de avanço
    if (b.gCodes.includes(98)) isFeedPerRev = false;
    if (b.gCodes.includes(99) || b.gCodes.includes(95)) isFeedPerRev = true;
    if (b.gCodes.includes(94) && !(hasXZ && !hasMotionG)) isFeedPerRev = false;
    if (b.gCodes.includes(96)) isCSS = true;
    if (b.gCodes.includes(97)) isCSS = false;

    // G50 S / G92 S = rotação máxima (sem movimento)
    const isG50 = b.gCodes.includes(50);
    const isG92Limit = b.gCodes.includes(92) && b.s !== null && b.x === null && b.u === null;
    if ((isG50 || isG92Limit) && b.s !== null) {
      maxRPM = Math.max(100, b.s);
    } else if (b.s !== null) {
      // Mudança grande de rotação com o fuso girando (G97) também gasta tempo de aceleração
      const newS = Math.max(1, b.s);
      if (spindleOn && !isCSS && lastG97RPM > 0 && !b.mCodes.includes(3) && !b.mCodes.includes(4)) {
        const diff = Math.abs(Math.min(newS, maxRPM) - lastG97RPM);
        addDelay((diff / Math.max(1, maxRPM)) * mp.spindleStartSec);
      }
      currentS = newS;
      if (!isCSS) lastG97RPM = Math.min(newS, maxRPM);
    }
    if (b.f !== null && b.f > 0 && !b.gCodes.some((g) => [70, 71, 72, 73, 74, 75, 76].includes(g))) {
      currentFeed = b.f;
    }

    // Troca de ferramenta
    if (b.t) {
      const k = toolKey(b.t);
      if (k !== "T00" && k !== curToolKey) {
        curToolKey = k;
        ensureTool(k, b.t);
        if (!perTool[k].label && toolNames[k]) perTool[k].label = toolNames[k];
        addDelay(mp.toolChangeSec);
        if (pendingToolDelay > 0) {
          addDelay(pendingToolDelay);
          pendingToolDelay = 0;
        }
      }
    }

    // Fuso
    if (b.mCodes.includes(3) || b.mCodes.includes(4)) {
      const target = isCSS ? rpmAt(curX || 50) : Math.min(currentS, maxRPM);
      const startT = mp.spindleStartSec * Math.max(0.35, Math.min(1, target / maxRPM));
      // Se a próxima linha chama ferramenta nova, o tempo vai para ela
      let toolAhead = false;
      if (!b.t) {
        for (let la = bIdx + 1; la < Math.min(blocks.length, bIdx + 4); la++) {
          const nb = blocks[la];
          if (nb.t && toolKey(nb.t) !== curToolKey && toolKey(nb.t) !== "T00") { toolAhead = true; break; }
          if (nb.x !== null || nb.z !== null || nb.u !== null || nb.w !== null) break;
        }
      }
      if (toolAhead) pendingToolDelay += startT;
      else addDelay(startT);
      spindleOn = true;
      if (!isCSS) lastG97RPM = Math.min(currentS, maxRPM);
    }
    if (b.mCodes.includes(5) && spindleOn) {
      addDelay(mp.spindleStopSec);
      spindleOn = false;
    }

    // G04 - tempo de espera
    if (b.gCodes.includes(4)) {
      if (b.pRaw !== null) {
        const pv = parseFloat(b.pRaw);
        addDelay(b.pRaw.includes(".") ? pv : pv / 1000);
      } else if (b.x !== null) addDelay(Math.abs(b.x));
      else if (b.u !== null) addDelay(Math.abs(b.u));
      else addDelay(0.5);
      continue;
    }

    // G28 / G30 - retorno à referência (posição da máquina desconhecida: conta só a aceleração)
    if (b.gCodes.includes(28) || b.gCodes.includes(30)) {
      addRapid(RAPID_ACCEL_SEC * 2);
      continue;
    }
    // G50 X.. Z.. / G10 = ajuste de coordenadas (sem movimento)
    if (isG50 || b.gCodes.includes(10)) continue;

    // Modo de movimento
    for (const g of b.gCodes) {
      if ([0, 1, 2, 3].includes(g)) {
        motionMode = g;
        cycleMode = null;
        threadCycle = null;
        drillCycle = null; // G00/G01/G02/G03 cancelam o ciclo de furação (mesmo grupo do G80)
      }
    }

    // ============ G70 - ACABAMENTO
    if (b.gCodes.includes(70)) {
      if (b.p !== null && b.q !== null) {
        const prof = buildProfile(b.p, b.q, curX, curZ);
        if (prof) {
          const startX = curX;
          const startZ = curZ;
          // Avanço do acabamento: se a linha do G70 tem F (e a opção está ligada), ele vale para TODO o perfil.
          // Senão vale a regra Fanuc: o F escrito dentro do perfil (blocos P...Q).
          const g70F = b.f !== null && mp.g70FeedFromCycle !== 0;
          runProfile(prof.segs, b.f !== null ? b.f : currentFeed, true, g70F);
          const last = prof.segs[prof.segs.length - 1];
          if (last) addRapid(rapidTime(startX - last.x2, startZ - last.z2));
          curX = startX;
          curZ = startZ;
        } else warnings.push(`Linha ${b.lineNumber + 1}: G70 não achou os blocos N${b.p} / N${b.q}`);
      }
      continue;
    }

    // ============ G71 - DESBASTE LONGITUDINAL
    if (b.gCodes.includes(71)) {
      if (b.p === null || b.q === null) {
        // 1ª linha: G71 U(prof. por lado) R(recuo)
        g71L1 = { d: Math.abs(b.u ?? 2) * sc, e: Math.abs(b.r ?? 0.5) * sc };
        continue;
      }
      let depth = g71L1 ? g71L1.d : 2;
      let ret = g71L1 ? g71L1.e : 0.5;
      if (!g71L1 && b.d !== null) depth = (b.d >= 100 ? b.d / 1000 : b.d) * sc; // formato de 1 linha (D)
      depth = Math.max(0.05, depth);
      ret = Math.max(0.05, ret);
      const feed = b.f !== null ? b.f : currentFeed;
      const du = (b.u ?? 0) * sc; // sobremetal em X (diâmetro, com sinal)
      const dw = (b.w ?? 0) * sc; // sobremetal em Z
      const prof = buildProfile(b.p, b.q, curX, curZ);
      if (!prof || prof.segs.length === 0) {
        warnings.push(`Linha ${b.lineNumber + 1}: G71 não achou os blocos N${b.p} / N${b.q}`);
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      // Perfil deslocado pelo sobremetal (onde o desbaste realmente para)
      const shifted: ProfSeg[] = prof.segs.map((s) => ({ ...s, x1: s.x1 + du, x2: s.x2 + du, z1: s.z1 + dw, z2: s.z2 + dw }));
      const body = withoutApproach(shifted, X0, Z0, du, dw);
      const xs = body.flatMap((s) => [s.x1, s.x2]);
      const zEnd = shifted[shifted.length - 1].z2;
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const external = Math.abs(X0 - minX) >= Math.abs(X0 - maxX);
      const dirX = external ? -1 : 1;
      const targetX = external ? minX : maxX;
      const totalRadial = Math.abs(X0 - targetX) / 2;
      const passes = Math.max(1, Math.ceil(totalRadial / depth - 0.0001));

      let level = X0;
      for (let pIdx = 1; pIdx <= passes; pIdx++) {
        const prevLevel = level;
        level = pIdx === passes ? targetX : X0 + dirX * 2 * depth * pIdx;
        const zLim = zLimitAtX(body, level, dirX, zEnd);
        const len = Math.abs(zLim - Z0);
        addRapid(rapidTime(level - prevLevel, 0)); // entrada em X
        addFeed(cutTime(len, level, level, feed)); // corte em Z
        addRapid(rapidTime(2 * ret, ret)); // recuo 45°
        addRapid(rapidTime(0, len + ret)); // volta em Z até o início
      }
      // Passe final seguindo o contorno (deixa só o sobremetal do G70)
      runProfile(shifted, feed, false);
      addRapid(rapidTime(X0 - shifted[shifted.length - 1].x2, Z0 - zEnd));
      curX = X0;
      curZ = Z0;
      // A máquina pula o perfil e continua depois do bloco Q
      if (prof.pIdx > bIdx) bIdx = prof.qIdx;
      continue;
    }

    // ============ G72 - DESBASTE TRANSVERSAL (faceamento)
    if (b.gCodes.includes(72)) {
      if (b.p === null || b.q === null) {
        g72L1 = { d: Math.abs(b.w ?? 2) * sc, e: Math.abs(b.r ?? 0.5) * sc };
        continue;
      }
      let depth = g72L1 ? g72L1.d : 2;
      if (!g72L1 && b.d !== null) depth = (b.d >= 100 ? b.d / 1000 : b.d) * sc;
      depth = Math.max(0.05, depth);
      const ret = Math.max(0.05, g72L1 ? g72L1.e : 0.5);
      const feed = b.f !== null ? b.f : currentFeed;
      const du = (b.u ?? 0) * sc;
      const dw = (b.w ?? 0) * sc;
      const prof = buildProfile(b.p, b.q, curX, curZ);
      if (!prof || prof.segs.length === 0) {
        warnings.push(`Linha ${b.lineNumber + 1}: G72 não achou os blocos N${b.p} / N${b.q}`);
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      const shifted: ProfSeg[] = prof.segs.map((s) => ({ ...s, x1: s.x1 + du, x2: s.x2 + du, z1: s.z1 + dw, z2: s.z2 + dw }));
      const body = withoutApproach(shifted, X0, Z0, du, dw);
      const zs = body.flatMap((s) => [s.z1, s.z2]);
      const xEnd = shifted[shifted.length - 1].x2;
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const dirZ = Math.abs(Z0 - minZ) >= Math.abs(Z0 - maxZ) ? -1 : 1;
      const targetZ = dirZ < 0 ? minZ : maxZ;
      const total = Math.abs(Z0 - targetZ);
      const passes = Math.max(1, Math.ceil(total / depth - 0.0001));
      let level = Z0;
      for (let pIdx = 1; pIdx <= passes; pIdx++) {
        const prev = level;
        level = pIdx === passes ? targetZ : Z0 + dirZ * depth * pIdx;
        const xLim = xLimitAtZ(body, level, dirZ, xEnd);
        const lenR = Math.abs(X0 - xLim) / 2;
        addRapid(rapidTime(0, level - prev));
        addFeed(cutTime(lenR, X0, xLim, feed));
        addRapid(rapidTime(2 * ret, ret));
        addRapid(rapidTime(X0 - xLim, 0));
      }
      runProfile(shifted, feed, false);
      addRapid(rapidTime(X0 - xEnd, Z0 - shifted[shifted.length - 1].z2));
      curX = X0;
      curZ = Z0;
      if (prof.pIdx > bIdx) bIdx = prof.qIdx;
      continue;
    }

    // ============ G73 - REPETIÇÃO DE PERFIL (peças forjadas / fundidas)
    if (b.gCodes.includes(73)) {
      if (b.p === null || b.q === null) {
        g73L1 = { i: Math.abs(b.u ?? 0) * sc, k: Math.abs(b.w ?? 0) * sc, n: Math.max(1, Math.round(b.r ?? 1)) };
        continue;
      }
      const reps = g73L1 ? g73L1.n : Math.max(1, Math.round(b.d ?? 1));
      const feed = b.f !== null ? b.f : currentFeed;
      const prof = buildProfile(b.p, b.q, curX, curZ);
      if (!prof || prof.segs.length === 0) {
        warnings.push(`Linha ${b.lineNumber + 1}: G73 não achou os blocos N${b.p} / N${b.q}`);
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      const last = prof.segs[prof.segs.length - 1];
      for (let r = 0; r < reps; r++) {
        runProfile(prof.segs, feed, false);
        addRapid(rapidTime(X0 - last.x2, Z0 - last.z2));
      }
      curX = X0;
      curZ = Z0;
      if (prof.pIdx > bIdx) bIdx = prof.qIdx;
      continue;
    }

    // ============ G74 - FURAÇÃO PICA-PAU / CANAL FRONTAL
    if (b.gCodes.includes(74)) {
      if (b.z === null && b.w === null) {
        g74e = Math.abs(b.r ?? 0.5) * sc;
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      const tX = b.x !== null ? b.x * sc : b.u !== null ? X0 + b.u * sc : X0;
      const tZ = b.z !== null ? b.z * sc : Z0 + (b.w ?? 0) * sc;
      const feed = b.f !== null ? b.f : currentFeed;
      const depth = Math.abs(tZ - Z0);
      const peck = b.q !== null && b.q > 0 ? (b.q / 1000) * sc : depth; // Q em mícrons
      const shiftR = b.p !== null && b.p > 0 ? (b.p / 1000) * sc : 0; // P em mícrons (raio)
      const radialTotal = Math.abs(tX - X0) / 2;
      const positions = shiftR > 0 && radialTotal > 0 ? Math.ceil(radialTotal / shiftR - 0.0001) + 1 : 1;
      const pecks = Math.max(1, Math.ceil(depth / Math.max(0.01, peck) - 0.0001));
      for (let i = 0; i < positions; i++) {
        const xi = positions > 1 ? X0 + ((tX - X0) * i) / (positions - 1) : X0;
        addFeed(cutTime(depth, xi, xi, feed));
        addRapid((pecks - 1) * rapidTime(0, 2 * g74e)); // quebra-cavaco
        addRapid(rapidTime(0, depth)); // volta
        if (i < positions - 1) addRapid(rapidTime((tX - X0) / (positions - 1), 0));
      }
      addRapid(rapidTime(X0 - tX, 0));
      curX = X0;
      curZ = Z0;
      continue;
    }

    // ============ G75 - CANAIS (PICA-PAU EM X)
    if (b.gCodes.includes(75)) {
      if (b.x === null && b.u === null) {
        g75e = Math.abs(b.r ?? 0.5) * sc;
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      const tX = b.x !== null ? b.x * sc : X0 + (b.u ?? 0) * sc;
      const tZ = b.z !== null ? b.z * sc : b.w !== null ? Z0 + b.w * sc : Z0;
      const feed = b.f !== null ? b.f : currentFeed;
      const depthR = Math.abs(tX - X0) / 2;
      const peck = b.p !== null && b.p > 0 ? (b.p / 1000) * sc : depthR; // P em mícrons (raio)
      const shiftZ = b.q !== null && b.q > 0 ? (b.q / 1000) * sc : 0; // Q em mícrons
      const zTotal = Math.abs(tZ - Z0);
      const plunges = shiftZ > 0 && zTotal > 0 ? Math.ceil(zTotal / shiftZ - 0.0001) + 1 : 1;
      const pecks = Math.max(1, Math.ceil(depthR / Math.max(0.01, peck) - 0.0001));
      for (let i = 0; i < plunges; i++) {
        addFeed(cutTime(depthR, X0, tX, feed));
        addRapid((pecks - 1) * rapidTime(2 * 2 * g75e, 0)); // quebra-cavaco
        addRapid(rapidTime(tX - X0, 0)); // sai do canal
        if (i < plunges - 1) addRapid(rapidTime(0, (tZ - Z0) / (plunges - 1)));
      }
      addRapid(rapidTime(0, Z0 - tZ));
      curX = X0;
      curZ = Z0;
      continue;
    }

    // ============ G76 - ROSCA EM VÁRIOS PASSES
    if (b.gCodes.includes(76)) {
      const hasTarget = (b.x !== null || b.u !== null) && (b.z !== null || b.w !== null);
      if (!hasTarget) {
        // 1ª linha: G76 P(mm rr aa) Q(prof. mínima µm) R(sobremetal acabamento mm)
        let m = 1;
        if (b.pRaw) {
          const digits = b.pRaw.replace(/\D/g, "").padStart(6, "0");
          m = Math.max(1, parseInt(digits.slice(0, 2), 10) || 1);
        }
        g76L1 = { m, qmin: b.q !== null ? (b.q / 1000) * sc : 0.05, d: Math.abs(b.r ?? 0.05) * sc };
        continue;
      }
      const X0 = curX;
      const Z0 = curZ;
      const tX = b.x !== null ? b.x * sc : X0 + (b.u ?? 0) * sc;
      const tZ = b.z !== null ? b.z * sc : Z0 + (b.w ?? 0) * sc;
      const pitch = (b.f ?? b.k ?? 1.5) * sc;
      // Altura do filete (P em µm) e 1ª profundidade (Q em µm). Formato antigo: K / D
      let height = b.p !== null ? (b.p / 1000) * sc : Math.abs(X0 - tX) / 2 * 0.6;
      let firstDepth = b.q !== null ? (b.q / 1000) * sc : height / 3;
      if (b.p === null && b.k !== null && b.f !== null) height = Math.abs(b.k) * (b.k > 10 ? 0.001 : 1) * sc;
      if (b.q === null && b.d !== null) firstDepth = Math.abs(b.d) * (b.d > 10 ? 0.001 : 1) * sc;
      const finishPasses = g76L1 ? g76L1.m : 1;
      const qmin = g76L1 ? g76L1.qmin : 0.05;
      const finishAllow = g76L1 ? g76L1.d : 0.05;
      // Passes de desbaste com área constante: profundidade = Δd × √n (padrão Fanuc)
      let passes = 0;
      let cur = 0;
      const roughTarget = Math.max(0.01, height - finishAllow);
      while (cur < roughTarget - 0.0001 && passes < 200) {
        passes++;
        cur = Math.min(roughTarget, Math.max(firstDepth * Math.sqrt(passes), cur + qmin));
      }
      const totalPasses = passes + finishPasses;
      const threadLen = Math.abs(tZ - Z0);
      const dia = Math.min(X0, tX + 2 * height);
      const rpm = rpmAt(dia);
      const passFeedTime = threadLen / ((pitch * rpm) / 60);
      const syncWait = (60 / rpm) * 0.5; // espera do sinal de 1 volta do fuso
      const passRapid = rapidTime(X0 - tX, 0) * 2 + rapidTime(0, threadLen);
      addFeed(totalPasses * (passFeedTime + syncWait));
      addRapid(totalPasses * passRapid);
      curX = X0;
      curZ = Z0;
      continue;
    }

    // ============ G83 / G84 / G85 (furação frontal) e G87 / G88 / G89 (furação radial) - ferramenta acionada
    // G80 cancela. As linhas seguintes só com posição (X / Z / C) repetem o furo em outro lugar.
    if (b.gCodes.includes(80)) drillCycle = null;
    const drillG = b.gCodes.find((g) => [83, 84, 85, 87, 88, 89].includes(g));
    if (drillG !== undefined) {
      drillCycle = { g: drillG, zInit: curZ, xInit: curX, depthTarget: [83, 84, 85].includes(drillG) ? curZ : curX, r: 0, q: 0, p: 0, f: currentFeed };
    }
    const hasC = /C\s*-?\d/i.test(b.cleanText);
    if (drillCycle && (drillG !== undefined || ((b.x !== null || b.u !== null || b.z !== null || b.w !== null || hasC) && !hasMotionG))) {
      const dc = drillCycle;
      const axial = [83, 84, 85].includes(dc.g);
      if (b.r !== null) dc.r = Math.abs(b.r) * sc; // R no torno = incremental (ponto inicial -> plano R)
      if (b.q !== null) dc.q = (b.q / 1000) * sc; // Q em mícrons
      if (b.pRaw !== null) dc.p = b.pRaw.includes(".") ? parseFloat(b.pRaw) : parseFloat(b.pRaw) / 1000;
      if (b.f !== null && b.f > 0) dc.f = b.f;
      // Posição do furo e profundidade
      let posX = curX;
      let posZ = curZ;
      if (axial) {
        if (b.x !== null) posX = b.x * sc;
        else if (b.u !== null) posX = curX + b.u * sc;
        if (b.z !== null) dc.depthTarget = b.z * sc;
        else if (b.w !== null) dc.depthTarget = dc.zInit + b.w * sc;
        posZ = dc.zInit;
      } else {
        if (b.z !== null) posZ = b.z * sc;
        else if (b.w !== null) posZ = curZ + b.w * sc;
        if (b.x !== null) dc.depthTarget = b.x * sc;
        else if (b.u !== null) dc.depthTarget = dc.xInit + b.u * sc;
        posX = dc.xInit;
      }
      // Vai até a posição do furo (e gira o eixo C, se tiver)
      addRapid(rapidTime(posX - curX, posZ - curZ));
      if (hasC) addDelay(0.3);
      const total = axial ? Math.abs(dc.depthTarget - dc.zInit) : Math.abs(dc.depthTarget - dc.xInit) / 2;
      const depth = Math.max(0, total - dc.r);
      const rpm = Math.max(20, Math.min(currentS, maxRPM)); // ferramenta acionada: rotação fixa
      let f = dc.f;
      if (!isMetric) f *= 25.4;
      const vel = isFeedPerRev ? (f * rpm) / 60 : f / 60; // mm/s
      const tFeed = vel > 0 ? depth / vel : 0;
      const vR = axial ? vRapidZ : vRapidX;
      addRapid(dc.r > 0 ? dc.r / vR + RAPID_ACCEL_SEC : 0); // inicial -> plano R
      if (dc.g === 83 || dc.g === 87) {
        addFeed(tFeed);
        const step = dc.q > 0 ? dc.q : depth;
        const n = Math.max(1, Math.ceil(depth / Math.max(0.01, step) - 0.0001));
        // a cada picada volta ao plano R e retorna em rápido
        addRapid((step * n * (n - 1)) / vR + (n - 1) * 2 * RAPID_ACCEL_SEC);
        addRapid(depth / vR + RAPID_ACCEL_SEC);
      } else if (dc.g === 84 || dc.g === 88) {
        addFeed(tFeed * 2); // entra e sai no avanço (macho)
        addDelay(0.6); // inversão do giro no fundo e no plano R
      } else {
        addFeed(tFeed * 2); // G85 / G89: entra e sai no avanço
      }
      if (dc.p > 0) addDelay(dc.p);
      addRapid(dc.r > 0 ? dc.r / vR + RAPID_ACCEL_SEC : 0); // volta ao ponto inicial
      curX = posX;
      curZ = posZ;
      continue;
    }

    // ============ G92 (rosca simples) / G32 (rosca bloco a bloco) / G90 / G94 (ciclos simples)
    const isG92Thread = b.gCodes.includes(92) && !isG92Limit && (b.x !== null || b.u !== null);
    if (isG92Thread) {
      cycleMode = 92;
      threadCycle = { pitch: (b.f ?? threadCycle?.pitch ?? 1.5) * sc };
    }
    const isG90Cycle = b.gCodes.includes(90) && hasXZ && !hasMotionG;
    const isG94Cycle = b.gCodes.includes(94) && hasXZ && !hasMotionG;
    if (isG90Cycle) cycleMode = 90;
    if (isG94Cycle) cycleMode = 94;
    if (b.f !== null && (isG90Cycle || isG94Cycle)) simpleCycleFeed = b.f;

    if (cycleMode !== null && (b.x !== null || b.u !== null || b.z !== null || b.w !== null) && !hasMotionG) {
      // Ciclo simples modal: a linha só com X (ou Z) repete o ciclo
      const X0 = curX;
      const Z0 = curZ;
      // Os ciclos usam o ponto de partida guardado: tool volta sempre a (X0, Z0)
      const tX = b.x !== null ? b.x * sc : b.u !== null ? X0 + b.u * sc : (cycleState.lastX ?? X0);
      const tZ = b.z !== null ? b.z * sc : b.w !== null ? Z0 + b.w * sc : (cycleState.lastZ ?? Z0);
      cycleState.lastX = tX;
      cycleState.lastZ = tZ;
      if (cycleMode === 92 && threadCycle) {
        const len = Math.abs(tZ - Z0);
        const rpm = rpmAt(tX);
        addFeed(len / ((threadCycle.pitch * rpm) / 60) + (60 / rpm) * 0.5);
        addRapid(rapidTime(X0 - tX, 0) * 2 + rapidTime(0, len));
      } else if (cycleMode === 90) {
        const len = Math.abs(tZ - Z0);
        addRapid(rapidTime(X0 - tX, 0));
        addFeed(cutTime(len, tX, tX, simpleCycleFeed));
        addFeed(cutTime(Math.abs(X0 - tX) / 2, tX, X0, simpleCycleFeed));
        addRapid(rapidTime(0, len));
      } else if (cycleMode === 94) {
        const lenR = Math.abs(X0 - tX) / 2;
        addRapid(rapidTime(0, tZ - Z0));
        addFeed(cutTime(lenR, X0, tX, simpleCycleFeed));
        addFeed(cutTime(Math.abs(Z0 - tZ), tX, tX, simpleCycleFeed));
        addRapid(rapidTime(X0 - tX, 0));
      }
      continue;
    }

    // ============ MOVIMENTOS NORMAIS G00 / G01 / G02 / G03 / G32
    let tX = curX;
    let tY = curY;
    let tZ = curZ;
    let hasMove = false;
    if (b.x !== null) { tX = b.x * sc; hasMove = true; }
    else if (b.u !== null) { tX = curX + b.u * sc; hasMove = true; }
    if (b.y !== null) { tY = b.y * sc; hasMove = true; }
    else if (b.v !== null) { tY = curY + b.v * sc; hasMove = true; }
    if (b.z !== null) { tZ = b.z * sc; hasMove = true; }
    else if (b.w !== null) { tZ = curZ + b.w * sc; hasMove = true; }

    if (hasMove) {
      cycleState.lastX = null;
      cycleState.lastZ = null;
      const dxRad = (tX - curX) / 2;
      const dy = tY - curY;
      const dz = tZ - curZ;
      let dist = Math.sqrt(dxRad * dxRad + dy * dy + dz * dz);
      if (motionMode === 2 || motionMode === 3) {
        let rad: number | null = null;
        if (b.r !== null) rad = Math.abs(b.r) * sc;
        else if (b.i !== null || b.k !== null) rad = Math.hypot((b.i || 0) * sc, (b.k || 0) * sc);
        if (rad && rad > 0) dist = rad * 2 * Math.asin(Math.min(1, dist / (2 * rad)));
      }
      if (dist > 0.0001) {
        if (b.gCodes.includes(32)) {
          const pitch = (b.f ?? currentFeed) * sc;
          const rpm = rpmAt(tX);
          addFeed(dist / ((pitch * rpm) / 60) + (60 / rpm) * 0.5);
        } else if (motionMode === 0) {
          addRapid(rapidTime(tX - curX, dz, dy));
        } else {
          addFeed(cutTime(dist, curX, tX, b.f !== null ? b.f : currentFeed));
        }
      }
      curX = tX;
      curY = tY;
      curZ = tZ;
    }
  }

  const totalSec = feedSeconds + rapidSeconds + delaySeconds;
  const rows = toolOrder
    .map((k) => {
      const r = perTool[k];
      r.totalSeconds = r.feedSeconds + r.rapidSeconds + r.delaySeconds;
      if (!r.label && toolNames[k]) r.label = toolNames[k];
      return r;
    })
    .filter((r) => r.totalSeconds > 0.05);

  return {
    totalSeconds: totalSec,
    feedSeconds,
    rapidSeconds,
    delaySeconds,
    formatted: formatCycleTime(totalSec, false),
    formattedTenths: formatCycleTime(totalSec, true),
    perTool: rows,
    warnings,
  };
}

export function calculateCycleTime(
  gcodeText: string,
  rapidFeedMMin?: number,
  plotList?: SimulationPlotItem[]
): number {
  return calculateCycleTimeDetailed(gcodeText, rapidFeedMMin, plotList).totalSeconds;
}

/**
 * Formata segundos em HH:MM:SS (ex.: "00:01:25") ou HH:MM:SS.d (ex.: "00:01:25.4")
 */
export function formatCycleTime(totalSeconds: number, showTenths: boolean = false): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return showTenths ? "00:00:00.0" : "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  if (showTenths) {
    return `${hh}:${mm}:${ss}.${tenths}`;
  }
  return `${hh}:${mm}:${ss}`;
}
