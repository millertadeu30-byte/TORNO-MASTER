import React, { useMemo, useState } from "react";
import { Copy, Check, CornerDownLeft, Info } from "lucide-react";

/* =====================================================================================
 * GERADOR DE CICLOS FANUC (TORNO - padrão "sistema A": Romi, Ergomat, Nardini, Index...)
 * -------------------------------------------------------------------------------------
 * Você escolhe o ciclo, preenche os campos (com explicação de cada um) e o programa
 * é montado na hora. Botão "Inserir no programa" coloca o código no editor ativo.
 * ===================================================================================== */

interface CycleGeneratorProps {
  onInsertCode: (code: string) => void;
}

type FieldType = "num" | "texto" | "perfil" | "opcao";

interface Field {
  k: string;
  label: string;
  def: string;
  unit?: string;
  help: string;
  type?: FieldType;
  options?: { v: string; label: string }[];
  /** Mostra o campo só quando a condição for verdadeira (ex.: TPI só em rosca em polegada) */
  show?: (v: Record<string, string>) => boolean;
}

interface CycleDef {
  id: string;
  code: string;
  name: string;
  group: string;
  summary: string;
  fields: Field[];
  generate: (v: Record<string, string>) => string[];
}

// ---------------------------------------------------------------- utilidades
const num = (s: string | undefined, def = 0): number => {
  if (s === undefined) return def;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? def : n;
};

/** Número no formato do comando (sempre com ponto decimal): 20 -> "20.0", -2.5 -> "-2.5" */
const fm = (n: number): string => {
  let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (s === "-0.0") s = "0.0";
  return s;
};

/** mm -> mícrons inteiros (P/Q dos ciclos): 1.5 -> 1500 */
const um = (mm: number): number => Math.round(Math.abs(mm) * 1000);

/** Lê o perfil digitado: uma linha por ponto, ex.: "X24 Z-2" ou "24 -2" */
const parseProfile = (txt: string): { x: number; z: number }[] => {
  const pts: { x: number; z: number }[] = [];
  let lx: number | null = null;
  let lz: number | null = null;
  txt.split("\n").forEach((raw) => {
    const line = raw.trim().toUpperCase();
    if (!line) return;
    const mx = line.match(/X\s*(-?\d*\.?\d+)/);
    const mz = line.match(/Z\s*(-?\d*\.?\d+)/);
    let x: number | null = mx ? parseFloat(mx[1]) : null;
    let z: number | null = mz ? parseFloat(mz[1]) : null;
    if (!mx && !mz) {
      const nums = line.replace(",", ".").match(/-?\d*\.?\d+/g);
      if (nums && nums.length >= 2) {
        x = parseFloat(nums[0]);
        z = parseFloat(nums[1]);
      }
    }
    if (x === null) x = lx;
    if (z === null) z = lz;
    if (x === null || z === null) return;
    pts.push({ x, z });
    lx = x;
    lz = z;
  });
  return pts;
};

/**
 * Monta os blocos do perfil N(início)...N(fim).
 * longitudinal (G71/G73): 1º bloco só em X (G00 X..), depois G01 Z..
 * transversal (G72): 1º bloco só em Z (G00 Z..), depois G01 X..
 */
const profileBlocks = (pts: { x: number; z: number }[], ns: number, nf: number, fFin: number, transversal: boolean): string[] => {
  if (pts.length < 2) return ["(ATENCAO: DIGITE PELO MENOS 2 PONTOS NO PERFIL)"];
  const out: string[] = [];
  const p0 = pts[0];
  if (transversal) {
    out.push(`G00 Z${fm(p0.z)};`);
    out.push(`G01 X${fm(p0.x)} F${fm(fFin)};`);
  } else {
    out.push(`G00 X${fm(p0.x)};`);
    out.push(`G01 Z${fm(p0.z)} F${fm(fFin)};`);
  }
  let px = p0.x;
  let pz = p0.z;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    let s = "G01";
    if (Math.abs(p.x - px) > 0.0001) s += ` X${fm(p.x)}`;
    if (Math.abs(p.z - pz) > 0.0001) s += ` Z${fm(p.z)}`;
    if (s === "G01") continue;
    out.push(s + ";");
    px = p.x;
    pz = p.z;
  }
  out[0] = `N${ns} ` + out[0];
  out[out.length - 1] = `N${nf} ` + out[out.length - 1];
  return out;
};

const SIM_NAO = [
  { v: "sim", label: "Sim" },
  { v: "nao", label: "Não" },
];

const TIPO_ROSCA = [
  { v: "externa", label: "Externa" },
  { v: "interna", label: "Interna" },
];

// ---------------------------------------------------------------- roscas (perfis)
const PERFIL_ROSCA = [
  { v: "metrica", label: "Métrica ISO 60° (paralela)" },
  { v: "unc", label: "UNC / UNF polegada 60° (paralela)" },
  { v: "bsp", label: "BSP / Whitworth 55° (paralela)" },
  { v: "bspt", label: "BSPT 55° CÔNICA 1:16 (tubo)" },
  { v: "npt", label: "NPT 60° CÔNICA 1:16 (tubo)" },
];
const isPolegada = (v: Record<string, string>) => v.perfil !== undefined && v.perfil !== "metrica";
const isConica = (v: Record<string, string>) => v.perfil === "bspt" || v.perfil === "npt";
/** +1 = SUBIDA (diâmetro aumenta indo para a placa) | -1 = DESCIDA (diâmetro diminui indo para a placa) */
const coneSign = (v: Record<string, string>) => (v.sentido === "descida" ? -1 : 1);

/**
 * Geometria da rosca conforme o perfil:
 * - passo: métrica = mm | polegada = 25,4 ÷ fios por polegada
 * - h (altura do filete no raio): métrica ext 0,65P / int 0,5413P | UNC ext 0,6134P / int 0,5413P
 *   Whitworth/BSP/BSPT 0,6403P | NPT 0,8P
 * - cônicas 1:16 no diâmetro => o raio muda 1/32 por mm de comprimento
 */
const threadGeom = (v: Record<string, string>) => {
  const ext = v.tipo !== "interna";
  const perfil = v.perfil || "metrica";
  const tpi = Math.max(1, num(v.tpi, 14));
  const pitch = perfil === "metrica" ? Math.max(0.2, num(v.p, 1.5)) : 25.4 / tpi;
  let k = ext ? 0.65 : 0.5413;
  if (perfil === "unc") k = ext ? 0.6134 : 0.5413;
  if (perfil === "bsp" || perfil === "bspt") k = 0.6403;
  if (perfil === "npt") k = 0.8;
  const angle = perfil === "bsp" || perfil === "bspt" ? "55" : "60";
  const conica = perfil === "bspt" || perfil === "npt";
  const nome =
    perfil === "metrica" ? `M${fm(num(v.d))}x${fm(pitch)}` : `${PERFIL_ROSCA.find((x) => x.v === perfil)?.label.split(" ")[0]} ${fm(tpi)} FIOS/POL`;
  return { ext, perfil, pitch, h: k * pitch, angle, conica, tan: 1 / 32, nome };
};

/** Campos comuns das roscas (perfil, diâmetro, passo / fios por polegada) */
const THREAD_FIELDS: Field[] = [
  { k: "s", label: "Rotação", def: "600", unit: "rpm", help: "G97 S... (rosca SEMPRE com rotação fixa)." },
  { k: "perfil", label: "Perfil da rosca", def: "metrica", type: "opcao", options: PERFIL_ROSCA, help: "As CÔNICAS (BSPT e NPT) saem com o R do cone calculado sozinho." },
  { k: "tipo", label: "Tipo", def: "externa", type: "opcao", options: TIPO_ROSCA, help: "Externa (macho/parafuso) ou interna (fêmea/porca)." },
  { k: "d", label: "Diâmetro", def: "20", unit: "mm", help: "Paralela: diâmetro nominal (maior). CÔNICA: diâmetro maior da rosca na FACE da peça (Z0). Ex.: 1/2\" BSPT ≈ 20,96 | 1/2\" NPT ≈ 21,3." },
  { k: "p", label: "Passo", def: "1.5", unit: "mm", help: "Passo da rosca métrica.", show: (v) => !isPolegada(v) },
  { k: "tpi", label: "Fios por polegada", def: "14", unit: "fios/pol", help: "Ex.: 1/2\" BSP/BSPT = 14 | 1/2\" NPT = 14 | 1/4\" NPT = 18 | 1\" NPT = 11,5.", show: isPolegada },
  {
    k: "sentido",
    label: "Sentido do cone",
    def: "subida",
    type: "opcao",
    options: [
      { v: "subida", label: "SUBIDA - diâmetro aumenta indo para a placa (R negativo)" },
      { v: "descida", label: "DESCIDA - diâmetro diminui indo para a placa (R positivo)" },
    ],
    help: "Inverte o sinal do R do cone. Macho de tubo (externa) normalmente é SUBIDA; fêmea de tubo (interna) normalmente é DESCIDA.",
    show: isConica,
  },
  { k: "zi", label: "Z de partida", def: "5", unit: "mm", help: "Comece pelo menos 3 passos antes da peça (aceleração do eixo)." },
  { k: "z", label: "Z final", def: "-20", unit: "mm", help: "Fim da rosca." },
];

/**
 * Para rosca cônica: diâmetro maior no Z final e o R (diferença de raio entre o início e o fim do corte).
 * SUBIDA: o diâmetro AUMENTA indo para a placa => R negativo. DESCIDA: o diâmetro DIMINUI indo para a placa => R positivo.
 */
const taperInfo = (v: Record<string, string>, g: ReturnType<typeof threadGeom>) => {
  const d0 = num(v.d, 20);
  const zi = num(v.zi, 5);
  const zf = num(v.z, -20);
  if (!g.conica) return { majorEnd: d0, rStr: "" };
  const sign = coneSign(v);
  const majorEnd = d0 + sign * 2 * g.tan * Math.abs(zf - 0);
  const r = -sign * g.tan * Math.abs(zi - zf);
  return { majorEnd, rStr: ` R${fm(r)}` };
};

// ---------------------------------------------------------------- ciclos
export const CYCLES: CycleDef[] = [
  {
    id: "g71",
    code: "G71",
    name: "Desbaste longitudinal",
    group: "Torneamento",
    summary: "Tira o material em passes paralelos ao eixo Z, seguindo o perfil que você digitar. Termina com o G70 (acabamento).",
    fields: [
      { k: "s", label: "Rotação desbaste", def: "1500", unit: "rpm", help: "G97 S... rotação fixa do desbaste." },
      { k: "xi", label: "X de partida (Ø)", def: "82", unit: "mm", help: "Diâmetro onde a ferramenta para antes do ciclo. Um pouco MAIOR que o material bruto." },
      { k: "zi", label: "Z de partida", def: "2", unit: "mm", help: "Posição em Z antes do ciclo, fora da peça (ex.: 2 mm da face)." },
      { k: "u", label: "Profundidade por passe", def: "2.5", unit: "mm raio", help: "G71 U (1ª linha): quanto corta por passe, medido no RAIO." },
      { k: "r", label: "Recuo", def: "1.0", unit: "mm", help: "G71 R (1ª linha): quanto a ferramenta afasta depois de cada passe." },
      { k: "du", label: "Sobremetal X (Ø)", def: "0.4", unit: "mm", help: "G71 U (2ª linha): material que sobra no DIÂMETRO para o acabamento. Interno = negativo." },
      { k: "dw", label: "Sobremetal Z", def: "0.1", unit: "mm", help: "G71 W (2ª linha): material que sobra nas faces para o acabamento." },
      { k: "f", label: "Avanço desbaste", def: "0.25", unit: "mm/rot", help: "F do desbaste (vale nos passes do G71)." },
      { k: "ns", label: "N início do perfil", def: "10", help: "Número do 1º bloco do perfil (P)." },
      { k: "nf", label: "N fim do perfil", def: "20", help: "Número do último bloco do perfil (Q)." },
      { k: "acab", label: "Incluir G70 (acabamento)", def: "sim", type: "opcao", options: SIM_NAO, help: "Coloca o G70 logo depois, usando o mesmo perfil." },
      { k: "fa", label: "Avanço acabamento", def: "0.12", unit: "mm/rot", help: "F do G70 (acabamento)." },
      { k: "perfil", label: "Perfil final da peça", def: "X20 Z0\nX24 Z-2\nX24 Z-20\nX30 Z-20\nX36 Z-30\nX36 Z-45\nX52 Z-45\nX52 Z-60\nX80 Z-60", type: "perfil", help: "Um ponto por linha (X em diâmetro), do lado da face indo para a placa. Ex.: X24 Z-2" },
    ],
    generate: (v) => {
      const pts = parseProfile(v.perfil);
      const ns = Math.round(num(v.ns, 10));
      const nf = Math.round(num(v.nf, 20));
      const L = [
        "(G71 - DESBASTE LONGITUDINAL)",
        `G97 S${Math.round(num(v.s, 1500))} M03;`,
        `G00 X${fm(num(v.xi))} Z${fm(num(v.zi))} M08;`,
        `G71 U${fm(num(v.u))} R${fm(num(v.r))};`,
        `G71 P${ns} Q${nf} U${fm(num(v.du))} W${fm(num(v.dw))} F${fm(num(v.f))};`,
        ...profileBlocks(pts, ns, nf, num(v.fa, 0.12), false),
      ];
      if (pts.length && num(v.xi) < Math.max(...pts.map((p) => p.x)) && num(v.du) >= 0)
        L.push("(ATENCAO: X DE PARTIDA MENOR QUE O MAIOR DIAMETRO DO PERFIL)");
      if (v.acab === "sim") L.push(`G70 P${ns} Q${nf} F${fm(num(v.fa, 0.12))};`);
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g72",
    code: "G72",
    name: "Desbaste transversal (faceamento)",
    group: "Torneamento",
    summary: "Tira o material em passes de faceamento (paralelos ao eixo X). Bom para peças curtas e de diâmetro grande. Termina com G70.",
    fields: [
      { k: "s", label: "Rotação desbaste", def: "1200", unit: "rpm", help: "G97 S... rotação fixa do desbaste." },
      { k: "xi", label: "X de partida (Ø)", def: "84", unit: "mm", help: "Diâmetro de partida, um pouco maior que o bruto." },
      { k: "zi", label: "Z de partida", def: "2", unit: "mm", help: "Z de partida, fora da face." },
      { k: "w", label: "Profundidade por passe", def: "2.0", unit: "mm", help: "G72 W (1ª linha): quanto corta em Z por passe." },
      { k: "r", label: "Recuo", def: "1.0", unit: "mm", help: "G72 R (1ª linha): afastamento depois de cada passe." },
      { k: "du", label: "Sobremetal X (Ø)", def: "0.4", unit: "mm", help: "G72 U (2ª linha): sobra no diâmetro." },
      { k: "dw", label: "Sobremetal Z", def: "0.2", unit: "mm", help: "G72 W (2ª linha): sobra nas faces." },
      { k: "f", label: "Avanço desbaste", def: "0.25", unit: "mm/rot", help: "F do desbaste." },
      { k: "ns", label: "N início do perfil", def: "30", help: "P do ciclo." },
      { k: "nf", label: "N fim do perfil", def: "40", help: "Q do ciclo." },
      { k: "acab", label: "Incluir G70 (acabamento)", def: "sim", type: "opcao", options: SIM_NAO, help: "Coloca o G70 logo depois." },
      { k: "fa", label: "Avanço acabamento", def: "0.12", unit: "mm/rot", help: "F do G70." },
      { k: "perfil", label: "Perfil final da peça", def: "X80 Z-25\nX60 Z-15\nX60 Z-8\nX40 Z-8\nX30 Z0\nX30 Z2", type: "perfil", help: "No G72 o perfil começa no ponto MAIS FUNDO (lado da placa, diâmetro maior) e vem até a face. Um ponto por linha." },
    ],
    generate: (v) => {
      const pts = parseProfile(v.perfil);
      const ns = Math.round(num(v.ns, 30));
      const nf = Math.round(num(v.nf, 40));
      const L = [
        "(G72 - DESBASTE TRANSVERSAL / FACEAMENTO)",
        `G97 S${Math.round(num(v.s, 1200))} M03;`,
        `G00 X${fm(num(v.xi))} Z${fm(num(v.zi))} M08;`,
        `G72 W${fm(num(v.w))} R${fm(num(v.r))};`,
        `G72 P${ns} Q${nf} U${fm(num(v.du))} W${fm(num(v.dw))} F${fm(num(v.f))};`,
        ...profileBlocks(pts, ns, nf, num(v.fa, 0.12), true),
      ];
      if (v.acab === "sim") L.push(`G70 P${ns} Q${nf} F${fm(num(v.fa, 0.12))};`);
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g73",
    code: "G73",
    name: "Repetição de perfil (forjados / fundidos)",
    group: "Torneamento",
    summary: "Repete o perfil várias vezes, chegando mais perto a cada passe. Ideal para peça bruta que já vem com o formato aproximado.",
    fields: [
      { k: "s", label: "Rotação", def: "1200", unit: "rpm", help: "G97 S..." },
      { k: "xi", label: "X de partida (Ø)", def: "60", unit: "mm", help: "Diâmetro de partida, fora do bruto." },
      { k: "zi", label: "Z de partida", def: "3", unit: "mm", help: "Z de partida." },
      { k: "i", label: "Material total em X", def: "3.0", unit: "mm raio", help: "G73 U (1ª linha): espessura total a remover em X (raio)." },
      { k: "k", label: "Material total em Z", def: "1.0", unit: "mm", help: "G73 W (1ª linha): espessura total a remover em Z." },
      { k: "n", label: "Número de passes", def: "3", help: "G73 R (1ª linha): quantas vezes o perfil é repetido." },
      { k: "du", label: "Sobremetal X (Ø)", def: "0.4", unit: "mm", help: "G73 U (2ª linha)." },
      { k: "dw", label: "Sobremetal Z", def: "0.1", unit: "mm", help: "G73 W (2ª linha)." },
      { k: "f", label: "Avanço desbaste", def: "0.25", unit: "mm/rot", help: "F dos passes." },
      { k: "ns", label: "N início do perfil", def: "50", help: "P do ciclo." },
      { k: "nf", label: "N fim do perfil", def: "60", help: "Q do ciclo." },
      { k: "acab", label: "Incluir G70 (acabamento)", def: "sim", type: "opcao", options: SIM_NAO, help: "Coloca o G70 logo depois." },
      { k: "fa", label: "Avanço acabamento", def: "0.12", unit: "mm/rot", help: "F do G70." },
      { k: "perfil", label: "Perfil final da peça", def: "X20 Z0\nX30 Z-5\nX30 Z-20\nX44 Z-30\nX44 Z-45\nX56 Z-50", type: "perfil", help: "Um ponto por linha, da face para a placa." },
    ],
    generate: (v) => {
      const pts = parseProfile(v.perfil);
      const ns = Math.round(num(v.ns, 50));
      const nf = Math.round(num(v.nf, 60));
      const L = [
        "(G73 - REPETICAO DE PERFIL)",
        `G97 S${Math.round(num(v.s, 1200))} M03;`,
        `G00 X${fm(num(v.xi))} Z${fm(num(v.zi))} M08;`,
        `G73 U${fm(num(v.i))} W${fm(num(v.k))} R${Math.max(1, Math.round(num(v.n, 3)))};`,
        `G73 P${ns} Q${nf} U${fm(num(v.du))} W${fm(num(v.dw))} F${fm(num(v.f))};`,
        ...profileBlocks(pts, ns, nf, num(v.fa, 0.12), false),
      ];
      if (v.acab === "sim") L.push(`G70 P${ns} Q${nf} F${fm(num(v.fa, 0.12))};`);
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g90",
    code: "G90",
    name: "Torneamento simples (passe a passe)",
    group: "Torneamento",
    summary: "Ciclo de 1 linha: entra em X, corta em Z, sai e volta. Cada linha seguinte só com X faz mais um passe. Aceita cone com R.",
    fields: [
      { k: "s", label: "Rotação", def: "1500", unit: "rpm", help: "G97 S..." },
      { k: "xb", label: "Diâmetro do bruto", def: "50", unit: "mm", help: "Diâmetro do material antes de usinar." },
      { k: "xf", label: "Diâmetro final", def: "40", unit: "mm", help: "Diâmetro que você quer no final." },
      { k: "zi", label: "Z de partida", def: "2", unit: "mm", help: "Z antes da peça." },
      { k: "z", label: "Z final do corte", def: "-30", unit: "mm", help: "Até onde corta em Z." },
      { k: "ap", label: "Profundidade por passe", def: "1.5", unit: "mm raio", help: "Quanto desce por passe (no raio)." },
      { k: "r", label: "Cone (R)", def: "0", unit: "mm raio", help: "0 = cilíndrico. Para cone: diferença de RAIO entre o início e o fim do corte (negativo quando o diâmetro aumenta para a placa)." },
      { k: "f", label: "Avanço", def: "0.25", unit: "mm/rot", help: "F do corte." },
    ],
    generate: (v) => {
      const xb = num(v.xb, 50);
      const xf = num(v.xf, 40);
      const ap = Math.max(0.05, num(v.ap, 1.5));
      const r = num(v.r, 0);
      const L = [
        "(G90 - TORNEAMENTO SIMPLES)",
        `G97 S${Math.round(num(v.s, 1500))} M03;`,
        `G00 X${fm(xb + 2)} Z${fm(num(v.zi))} M08;`,
      ];
      const xs: number[] = [];
      let x = xb;
      while (x - 2 * ap > xf + 0.0001) {
        x -= 2 * ap;
        xs.push(x);
      }
      xs.push(xf);
      xs.forEach((xx, i) => {
        if (i === 0) L.push(`G90 X${fm(xx)} Z${fm(num(v.z))}${Math.abs(r) > 0.0001 ? ` R${fm(r)}` : ""} F${fm(num(v.f))};`);
        else L.push(`X${fm(xx)};`);
      });
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g94",
    code: "G94",
    name: "Faceamento simples (passe a passe)",
    group: "Torneamento",
    summary: "Ciclo de 1 linha para facear: entra em Z, corta em X até o centro (ou diâmetro final), sai e volta. Cada linha só com Z faz mais um passe.",
    fields: [
      { k: "s", label: "Rotação", def: "1200", unit: "rpm", help: "G97 S... (ou use G96 na sua máquina)." },
      { k: "xb", label: "Diâmetro do bruto", def: "50", unit: "mm", help: "Diâmetro externo da peça." },
      { k: "xf", label: "Diâmetro final da face", def: "-1", unit: "mm", help: "Até onde vai em X. Use -1 para passar do centro e não deixar 'pino'." },
      { k: "zi", label: "Z de partida", def: "2", unit: "mm", help: "Z antes da face." },
      { k: "zf", label: "Z final da face", def: "-3", unit: "mm", help: "Cota final da face." },
      { k: "ap", label: "Profundidade por passe", def: "1.0", unit: "mm", help: "Quanto avança em Z por passe." },
      { k: "f", label: "Avanço", def: "0.2", unit: "mm/rot", help: "F do faceamento." },
    ],
    generate: (v) => {
      const zi = num(v.zi, 2);
      const zf = num(v.zf, -3);
      const ap = Math.max(0.05, num(v.ap, 1));
      const L = [
        "(G94 - FACEAMENTO SIMPLES)",
        `G97 S${Math.round(num(v.s, 1200))} M03;`,
        `G00 X${fm(num(v.xb, 50) + 2)} Z${fm(zi)} M08;`,
      ];
      const zs: number[] = [];
      let z = Math.min(zi, 0);
      while (z - ap > zf + 0.0001) {
        z -= ap;
        zs.push(z);
      }
      zs.push(zf);
      zs.forEach((zz, i) => {
        if (i === 0) L.push(`G94 X${fm(num(v.xf, -1))} Z${fm(zz)} F${fm(num(v.f))};`);
        else L.push(`Z${fm(zz)};`);
      });
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g75",
    code: "G75",
    name: "Canal radial (pica-pau em X)",
    group: "Canais e furação",
    summary: "Abre canal no diâmetro em pica-pau (quebra cavaco). Se o canal for mais largo que o bedame, faz vários mergulhos indo para a placa.",
    fields: [
      { k: "s", label: "Rotação", def: "800", unit: "rpm", help: "G97 S... (bedame pede rotação menor)." },
      { k: "xi", label: "X de aproximação (Ø)", def: "40", unit: "mm", help: "Diâmetro um pouco acima da peça, onde o bedame para antes de mergulhar." },
      { k: "z", label: "Z do 1º mergulho", def: "-18", unit: "mm", help: "Posição Z da referência do bedame no 1º mergulho. O canal cresce para o lado da placa (Z-)." },
      { k: "larg", label: "Largura do canal", def: "3", unit: "mm", help: "Largura final do canal." },
      { k: "lf", label: "Largura do bedame", def: "3", unit: "mm", help: "Largura da pastilha." },
      { k: "xf", label: "Diâmetro do fundo", def: "20", unit: "mm", help: "Diâmetro no fundo do canal." },
      { k: "p", label: "Profundidade por picada", def: "1.5", unit: "mm raio", help: "G75 P (em mícrons): quanto entra antes de recuar para quebrar o cavaco." },
      { k: "r", label: "Recuo da picada", def: "0.5", unit: "mm", help: "G75 R (1ª linha)." },
      { k: "f", label: "Avanço", def: "0.08", unit: "mm/rot", help: "F do mergulho." },
    ],
    generate: (v) => {
      const larg = num(v.larg, 3);
      const lf = Math.max(0.5, num(v.lf, 3));
      const z = num(v.z, -18);
      const extra = Math.max(0, larg - lf);
      const zEnd = z - extra;
      const step = Math.max(0.1, lf * 0.8); // mergulhos com 20% de sobreposição
      const L = [
        "(G75 - CANAL RADIAL EM PICA-PAU)",
        `G97 S${Math.round(num(v.s, 800))} M03;`,
        `G00 X${fm(num(v.xi))} Z${fm(z)} M08;`,
        `G75 R${fm(num(v.r, 0.5))};`,
        extra > 0.0001
          ? `G75 X${fm(num(v.xf))} Z${fm(zEnd)} P${um(num(v.p, 1.5))} Q${um(step)} F${fm(num(v.f))};`
          : `G75 X${fm(num(v.xf))} Z${fm(z)} P${um(num(v.p, 1.5))} F${fm(num(v.f))};`,
        `G00 X${fm(num(v.xi) + 60)} M09; (SAIR PRIMEIRO EM X!)`,
        "G00 Z200.0;",
      ];
      if (larg < lf) L.splice(1, 0, "(ATENCAO: CANAL MAIS ESTREITO QUE O BEDAME)");
      return L;
    },
  },
  {
    id: "g74",
    code: "G74",
    name: "Furação pica-pau no centro / canal frontal",
    group: "Canais e furação",
    summary: "Fura no centro (X0) com broca fixa na torre, recuando a cada picada para tirar o cavaco. Com X e P também abre canal frontal largo.",
    fields: [
      { k: "s", label: "Rotação", def: "800", unit: "rpm", help: "G97 S... (sempre rotação fixa para furar)." },
      { k: "zi", label: "Z de aproximação", def: "2", unit: "mm", help: "Z antes da face." },
      { k: "z", label: "Profundidade final (Z)", def: "-30", unit: "mm", help: "Z do fundo do furo (sem contar a ponta da broca)." },
      { k: "q", label: "Picada", def: "5", unit: "mm", help: "G74 Q (em mícrons): quanto entra em cada picada." },
      { k: "r", label: "Recuo da picada", def: "0.5", unit: "mm", help: "G74 R (1ª linha): recuo para quebrar o cavaco." },
      { k: "f", label: "Avanço", def: "0.1", unit: "mm/rot", help: "F da furação." },
    ],
    generate: (v) => [
      "(G74 - FURACAO PICA-PAU NO CENTRO)",
      `G97 S${Math.round(num(v.s, 800))} M03;`,
      `G00 X0.0 Z${fm(num(v.zi, 2))} M08;`,
      `G74 R${fm(num(v.r, 0.5))};`,
      `G74 Z${fm(num(v.z, -30))} Q${um(num(v.q, 5))} F${fm(num(v.f, 0.1))};`,
      "G00 Z200.0 M09;",
    ],
  },
  {
    id: "g83",
    code: "G83 / G84 / G85",
    name: "Furação, macho e alargador (ferramenta acionada)",
    group: "Canais e furação",
    summary: "Ciclos de furação na face com ferramenta acionada (motorizada). G83 = pica-pau, G84 = rosca com macho, G85 = alargar/mandrilar. Cancela com G80.",
    fields: [
      { k: "tipo", label: "Ciclo", def: "83", type: "opcao", options: [
        { v: "83", label: "G83 - furação pica-pau" },
        { v: "84", label: "G84 - rosca com macho" },
        { v: "85", label: "G85 - alargar / mandrilar" },
      ], help: "Escolha o ciclo." },
      { k: "x", label: "X do furo (Ø)", def: "0", unit: "mm", help: "Diâmetro onde fica o furo (0 = centro)." },
      { k: "c", label: "Ângulo C", def: "", unit: "graus", help: "Posição angular (eixo C). Deixe vazio se não usar eixo C." },
      { k: "zi", label: "Z de aproximação", def: "3", unit: "mm", help: "Z antes da face. O ciclo volta para cá no final." },
      { k: "z", label: "Profundidade final (Z)", def: "-20", unit: "mm", help: "Z do fundo." },
      { k: "q", label: "Picada (só G83)", def: "5", unit: "mm", help: "Q em mícrons: quanto entra em cada picada." },
      { k: "p", label: "Tempo no fundo", def: "0", unit: "ms", help: "P: espera no fundo do furo, em milissegundos (0 = sem espera)." },
      { k: "f", label: "Avanço (G84 = passo do macho)", def: "0.1", unit: "mm/rot", help: "No G84 o F é o PASSO do macho (ex.: M8 = 1.25), com avanço por rotação (G99)." },
    ],
    generate: (v) => {
      const t = v.tipo || "83";
      const c = v.c !== undefined && v.c.trim() !== "" ? ` C${fm(num(v.c))}` : "";
      const p = Math.round(num(v.p, 0));
      const q = t === "83" ? ` Q${um(num(v.q, 5))}` : "";
      const L = [
        `(G${t} - ${t === "83" ? "FURACAO PICA-PAU" : t === "84" ? "ROSCA COM MACHO" : "ALARGAR / MANDRILAR"} - FERRAMENTA ACIONADA)`,
        "(LIGUE A FERRAMENTA ACIONADA AQUI - O CODIGO M VARIA: CONFIRA NO MANUAL DA MAQUINA)",
      ];
      if (t === "84") L.push("G99; (AVANCO POR ROTACAO: F = PASSO DO MACHO)");
      L.push(`G00 X${fm(num(v.x, 0))}${c} Z${fm(num(v.zi, 3))} M08;`);
      L.push(`G${t} X${fm(num(v.x, 0))}${c} Z${fm(num(v.z, -20))}${q}${p > 0 ? ` P${p}` : ""} F${fm(num(v.f, 0.1))};`);
      L.push("G80; (CANCELA O CICLO)");
      L.push("G00 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g92",
    code: "G92",
    name: "Rosca simples (passe a passe) - paralela ou cônica",
    group: "Roscas",
    summary: "Cada linha é um passe de rosca. O gerador calcula os diâmetros de cada passe com área de cavaco constante (mais fundo no começo, mais leve no fim) + passe de mola. Em BSPT/NPT sai o R do cone.",
    fields: [
      ...THREAD_FIELDS,
      { k: "n", label: "Número de passes", def: "8", help: "Passes de corte (sem contar o passe de mola)." },
    ],
    generate: (v) => {
      const g = threadGeom(v);
      const n = Math.max(1, Math.round(num(v.n, 8)));
      const { majorEnd, rStr } = taperInfo(v, g);
      // Diâmetros no Z FINAL (o R cuida do cone)
      const start = g.ext ? majorEnd : majorEnd - 2 * g.h;
      const zi = num(v.zi, 5);
      const L = [
        `(G92 - ROSCA ${g.ext ? "EXTERNA" : "INTERNA"} ${g.nome}${g.conica ? " CONICA 1:16" : ""} - ${n} PASSES)`,
        `G97 S${Math.round(num(v.s, 600))} M03;`,
        `G00 X${fm(g.ext ? Math.max(num(v.d), majorEnd) + 4 : Math.min(num(v.d), majorEnd) - 2 * g.h - 2)} Z${fm(zi)} M08;`,
      ];
      for (let i = 1; i <= n; i++) {
        const k = g.h * Math.sqrt(i / n);
        const x = g.ext ? start - 2 * k : start + 2 * k;
        L.push(i === 1 ? `G92 X${fm(x)} Z${fm(num(v.z, -20))}${rStr} F${fm(g.pitch)};` : `X${fm(x)};`);
      }
      L.push(`X${fm(g.ext ? start - 2 * g.h : start + 2 * g.h)}; (PASSE DE MOLA)`);
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
  {
    id: "g76",
    code: "G76",
    name: "Rosca automática (2 linhas) - paralela ou cônica",
    group: "Roscas",
    summary: "O comando calcula sozinho todos os passes. Aceita métrica, polegada (UNC/UNF, BSP), CÔNICAS de tubo (BSPT e NPT, com o R do cone calculado) e várias entradas.",
    fields: [
      ...THREAD_FIELDS,
      { k: "entradas", label: "Número de entradas", def: "1", help: "Rosca de várias entradas: o F vira o avanço (passo × entradas) e cada entrada começa deslocada 1 passo em Z." },
      { k: "n", label: "Passes de desbaste (aprox.)", def: "10", help: "Usado para calcular a 1ª profundidade (Q)." },
      { k: "m", label: "Passes de mola", def: "2", help: "G76 P(mm....): repetições do último passe." },
      { k: "qmin", label: "Profundidade mínima", def: "0.1", unit: "mm", help: "G76 Q (1ª linha) em mícrons." },
      { k: "rf", label: "Sobremetal de acabamento", def: "0.05", unit: "mm", help: "G76 R (1ª linha)." },
    ],
    generate: (v) => {
      const g = threadGeom(v);
      const n = Math.max(1, Math.round(num(v.n, 10)));
      const ent = Math.max(1, Math.round(num(v.entradas, 1)));
      const rf = Math.max(0, num(v.rf, 0.05));
      const { majorEnd, rStr } = taperInfo(v, g);
      const xRoot = g.ext ? majorEnd - 2 * g.h : majorEnd;
      const q1 = Math.max(1, um(g.h - rf) / Math.sqrt(n));
      const m = String(Math.max(1, Math.min(99, Math.round(num(v.m, 2))))).padStart(2, "0");
      const zi = num(v.zi, 5);
      const zf = num(v.z, -20);
      const lead = g.pitch * ent;
      const L = [
        `(G76 - ROSCA ${g.ext ? "EXTERNA" : "INTERNA"} ${g.nome}${g.conica ? " CONICA 1:16" : ""}${ent > 1 ? ` - ${ent} ENTRADAS` : ""})`,
        `G97 S${Math.round(num(v.s, 600))} M03;`,
      ];
      const xApp = g.ext ? Math.max(num(v.d), majorEnd) + 4 : Math.min(num(v.d), majorEnd) - 2 * g.h - 2;
      for (let e = 0; e < ent; e++) {
        const z0 = zi + e * g.pitch;
        // No cone, o R depende do comprimento do corte (cada entrada começa num Z diferente)
        const r = g.conica ? ` R${fm(-coneSign(v) * g.tan * Math.abs(z0 - zf))}` : rStr;
        if (ent > 1) L.push(`(ENTRADA ${e + 1} DE ${ent})`);
        L.push(`G00 X${fm(xApp)} Z${fm(z0)}${e === 0 ? " M08" : ""};`);
        L.push(`G76 P${m}10${g.angle} Q${um(num(v.qmin, 0.1))} R${fm(rf)};`);
        L.push(`G76 X${fm(xRoot)} Z${fm(zf)} P${um(g.h)} Q${Math.round(q1)}${r} F${fm(lead)};`);
      }
      L.push("G00 X200.0 Z200.0 M09;");
      return L;
    },
  },
];

// ---------------------------------------------------------------- componente
export const CycleGenerator: React.FC<CycleGeneratorProps> = ({ onInsertCode }) => {
  const [cycleId, setCycleId] = useState<string>("g71");
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  const cycle = CYCLES.find((c) => c.id === cycleId) || CYCLES[0];
  const vals: Record<string, string> = useMemo(() => {
    const base: Record<string, string> = {};
    cycle.fields.forEach((f) => (base[f.k] = f.def));
    return { ...base, ...(values[cycle.id] || {}) };
  }, [cycle, values]);

  const code = useMemo(() => {
    try {
      return cycle.generate(vals).join("\n");
    } catch {
      return "(ERRO AO GERAR - CONFIRA OS CAMPOS)";
    }
  }, [cycle, vals]);

  const setVal = (k: string, v: string) => {
    setValues((prev) => ({ ...prev, [cycle.id]: { ...(prev[cycle.id] || {}), [k]: v } }));
  };

  const groups = Array.from(new Set(CYCLES.map((c) => c.group)));

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 text-zinc-200 font-sans">
      {/* Lista de ciclos */}
      <div className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800 p-3 overflow-y-auto flex md:flex-col gap-1.5 overflow-x-auto">
        {groups.map((g) => (
          <div key={g} className="flex md:flex-col gap-1.5 shrink-0">
            <div className="hidden md:block text-[10px] uppercase tracking-wider font-bold text-zinc-500 mt-2 mb-0.5">{g}</div>
            {CYCLES.filter((c) => c.group === g).map((c) => (
              <button
                key={c.id}
                onClick={() => setCycleId(c.id)}
                className={`text-left text-xs px-2.5 py-2 rounded-lg border transition shrink-0 ${
                  c.id === cycle.id
                    ? "bg-cyan-950/40 text-cyan-300 border-cyan-500/50 font-bold"
                    : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="font-mono font-black mr-1.5">{c.code}</span>
                <span className="hidden md:inline">{c.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Campos + código */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            <span className="font-mono text-cyan-400 mr-2">{cycle.code}</span>
            {cycle.name}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{cycle.summary}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {cycle.fields.filter((f) => !f.show || f.show(vals)).map((f) => (
            <label key={f.k} className={`flex flex-col gap-1 ${f.type === "perfil" ? "sm:col-span-2" : ""}`} title={f.help}>
              <span className="text-[11px] font-bold text-zinc-400 flex items-center gap-1">
                {f.label}
                {f.unit && <span className="text-zinc-600 font-normal">({f.unit})</span>}
              </span>
              {f.type === "opcao" ? (
                <select
                  value={vals[f.k]}
                  onChange={(e) => setVal(f.k, e.target.value)}
                  className="bg-[#0d0d11] border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500"
                >
                  {(f.options || []).map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "perfil" ? (
                <textarea
                  value={vals[f.k]}
                  onChange={(e) => setVal(f.k, e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="bg-[#0d0d11] border border-zinc-800 rounded-md px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <input
                  value={vals[f.k]}
                  onChange={(e) => setVal(f.k, e.target.value)}
                  inputMode={f.type === "texto" ? "text" : "decimal"}
                  className="bg-[#0d0d11] border border-zinc-800 rounded-md px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500"
                />
              )}
              <span className="text-[10px] text-zinc-500 leading-snug">{f.help}</span>
            </label>
          ))}
        </div>

        <div className="border border-zinc-800 rounded-lg bg-[#0b0b0f]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Programa gerado</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(code);
                  } catch {
                    /* sem área de transferência */
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <button
                onClick={() => {
                  onInsertCode(code);
                  setInserted(true);
                  setTimeout(() => setInserted(false), 1500);
                }}
                className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30"
              >
                {inserted ? <Check className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                {inserted ? "Inserido!" : "Inserir no programa"}
              </button>
            </div>
          </div>
          <pre className="p-3 text-[13px] font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed select-text">{code}</pre>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-zinc-500 leading-snug">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Formato Fanuc "sistema A" (o mais comum em tornos: G50 = rotação máxima, G92 = rosca simples, G98/G99 = avanço).
            Sempre confira o programa no simulador antes de rodar na máquina.
          </span>
        </div>
      </div>
    </div>
  );
};

export default CycleGenerator;
