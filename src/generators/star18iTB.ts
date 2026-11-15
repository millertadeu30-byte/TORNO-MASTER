export type StarTMPt = { x: number; z: number };
export type StarTMIntervalo = { zA: number; zB: number; xa: number; xb: number };
export type StarTMFaixa = [number, number];
export type StarTMOpTipo =
  | "face"
  | "desbExt"
  | "acabExt"
  | "canal"
  | "canalInt"
  | "roscaExt"
  | "centro"
  | "furo"
  | "desbInt"
  | "acabInt"
  | "roscaInt"
  | "macho"
  | "corte";

export interface StarTMOp {
  id: string;
  tipo: StarTMOpTipo;
  ativo: boolean;
  ferr: string;
  ciclo: boolean;
  cor: string;
  faixas: StarTMFaixa[];
  p: Record<string, number>;
  nomeFerr?: string;
  cab?: "H1" | "H2";
  cicloSel?: string;
  orig?: number;
}

export type StarTMGeo = {
  ext: StarTMIntervalo[];
  int: StarTMIntervalo[];
  zFront: number;
  zBack: number;
  L: number;
  dMax: number;
  dTras: number;
  intZmin: number;
  intZmax: number;
  intDmin: number;
};

export type StarTMOrigem = {
  g: string;
  fuso: "principal" | "contrafuso";
  tipo: "normal" | "suico";
  face: "direita" | "esquerda";
  desl: number;
};

export interface StarGerarCfg {
  nome: string;
  bD: number;
  rpmMax: number;
  material: string;
  origens?: StarTMOrigem[];
  zero?: { face: "direita" | "esquerda"; offsetZ: number };
  maqId?: string;
  pega2?: number;
  cursoCab?: number;
  ladoBedameK?: number;
  estTope?: number;
  estBedame?: number;
}

export interface StarGerarResult {
  textos: [string, string];
  nomes: [string, string];
  doisCanais: true;
  erro?: string;
}

const PASTILHA_ANG = [0, 27, 27, 50];

const fmt = (n: number) => {
  let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (s === "-0.0") s = "0.0";
  return s;
};
export const fmtStar = fmt;

function subIntervalos(iv: StarTMIntervalo[], faixas: StarTMFaixa[]): StarTMIntervalo[] {
  const fx = faixas.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((p1, p2) => p1[0] - p2[0]);
  const uni: number[][] = [];
  fx.forEach((g) => {
    const u = uni[uni.length - 1];
    if (u && g[0] <= u[1] + 1e-6) u[1] = Math.max(u[1], g[1]);
    else uni.push([g[0], g[1]]);
  });
  const r: StarTMIntervalo[] = [];
  iv.forEach((q) => {
    if (q.zA - q.zB < 1e-9) {
      if (uni.some((u) => q.zA >= u[0] - 1e-6 && q.zA <= u[1] + 1e-6)) r.push(q);
      return;
    }
    const xz = (z: number) => q.xa + ((q.zA - z) / (q.zA - q.zB)) * (q.xb - q.xa);
    uni.forEach((u) => {
      const a = Math.min(q.zA, u[1]);
      const b = Math.max(q.zB, u[0]);
      if (a - b > 1e-4) r.push(a === q.zA && b === q.zB ? q : { ...q, zA: a, zB: b, xa: xz(a), xb: xz(b) });
    });
  });
  return r;
}

function perfilMono(iv: StarTMIntervalo[], interno: boolean, real = false) {
  let cur = interno ? Infinity : 0;
  const mono: StarTMIntervalo[] = [];
  const canais: { zStart: number; zEnd: number; fundo: number; topo: number }[] = [];
  let ab: { zStart: number; zEnd: number; fundo: number; topo: number } | null = null;
  iv.forEach((s) => {
    const na = real ? s.xa : interno ? Math.min(s.xa, cur) : Math.max(s.xa, cur);
    const nb = real ? s.xb : interno ? Math.min(s.xb, na) : Math.max(s.xb, na);
    cur = nb;
    mono.push({ zA: s.zA, zB: s.zB, xa: na, xb: nb });
    if (!interno) {
      const afunda = s.xa < na - 0.01 || s.xb < nb - 0.01;
      if (afunda) {
        if (!ab) ab = { zStart: s.zA, zEnd: s.zB, fundo: Math.min(s.xa, s.xb), topo: nb };
        else {
          ab.zEnd = s.zB;
          ab.fundo = Math.min(ab.fundo, s.xa, s.xb);
          ab.topo = Math.max(ab.topo, nb);
        }
      } else if (ab) {
        canais.push(ab);
        ab = null;
      }
    }
  });
  if (ab) canais.push(ab);
  const pts: StarTMPt[] = [];
  mono.forEach((s) => {
    if (!pts.length) pts.push({ x: s.xa, z: s.zA });
    else if (Math.abs(pts[pts.length - 1].x - s.xa) > 1e-3 || Math.abs(pts[pts.length - 1].z - s.zA) > 1e-3) {
      pts.push({ x: s.xa, z: s.zA });
    }
    pts.push({ x: s.xb, z: s.zB });
  });
  const simp: StarTMPt[] = [];
  pts.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-6) simp.pop();
    }
    simp.push(p);
  });
  return { pts: simp, canais };
}

function limitaMergulho(pts: StarTMPt[], angGraus: number): StarTMPt[] {
  if (!(angGraus >= 0) || angGraus >= 89.9 || pts.length < 2) return pts;
  const k = 2 * Math.tan((angGraus * Math.PI) / 180);
  const am: StarTMPt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.abs(a.z - b.z) / 0.02));
    for (let j = 0; j < n; j++) am.push({ z: a.z + ((b.z - a.z) * j) / n, x: a.x + ((b.x - a.x) * j) / n });
  }
  am.push(pts[pts.length - 1]);
  const out: StarTMPt[] = [];
  am.forEach((p, i) => {
    if (!i) {
      out.push({ z: p.z, x: p.x });
      return;
    }
    const q = out[out.length - 1];
    out.push({ z: p.z, x: Math.max(p.x, q.x - k * Math.max(0, q.z - p.z)) });
  });
  const simp: StarTMPt[] = [];
  out.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-5) simp.pop();
    }
    simp.push(p);
  });
  return simp;
}

function compensarRaio(pts: StarTMPt[], r: number, interno: boolean): StarTMPt[] {
  if (!(r > 0) || pts.length < 2) return pts;
  const z0 = pts[0].z;
  const zE = pts[pts.length - 1].z;
  const segs: [StarTMPt, StarTMPt][] = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  const profAt = (z: number) => {
    let v = interno ? Infinity : -Infinity;
    let achou = false;
    for (const [a, b] of segs) {
      const lo = Math.min(a.z, b.z);
      const hi = Math.max(a.z, b.z);
      if (z < lo - 1e-9 || z > hi + 1e-9) continue;
      achou = true;
      const x =
        hi - lo < 1e-9 ? (interno ? Math.min(a.x, b.x) : Math.max(a.x, b.x)) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x);
      v = interno ? Math.min(v, x) : Math.max(v, x);
    }
    if (!achou) return z < zE ? pts[pts.length - 1].x : pts[0].x;
    return v;
  };
  const vz = pts.map((p) => p.z);
  const centroX = (cz: number) => {
    let m = interno ? Infinity : -Infinity;
    const am: number[] = [];
    for (let z = cz - r; z <= cz + r + 1e-9; z += 0.01) am.push(z);
    am.push(cz + r);
    vz.forEach((z) => {
      if (z >= cz - r - 1e-9 && z <= cz + r + 1e-9) am.push(z);
    });
    am.forEach((z) => {
      const x = profAt(z);
      if (!isFinite(x)) return;
      const h = 2 * Math.sqrt(Math.max(0, r * r - (z - cz) * (z - cz)));
      m = interno ? Math.min(m, x - h) : Math.max(m, x + h);
    });
    return m;
  };
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const ini = z0 + r;
  const czs = new Set<number>();
  for (let z = ini; z >= zE + r - 1e-9; z -= 0.02) czs.add(r4(z));
  czs.add(r4(zE + r));
  vz.forEach((z) =>
    [z + r, z - r, z, z + r - 0.0005, z - r + 0.0005].forEach((c) => {
      if (c <= ini + 1e-9 && c >= zE + r - 1e-9) czs.add(r4(c));
    })
  );
  const out: StarTMPt[] = [];
  Array.from(czs)
    .sort((a, b) => b - a)
    .forEach((cz) => {
      const c = centroX(cz);
      if (!isFinite(c)) return;
      out.push({ z: cz - r, x: interno ? c + 2 * r : c - 2 * r });
    });
  const simp: StarTMPt[] = [];
  out.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-5) simp.pop();
    }
    simp.push(p);
  });
  return simp.length >= 2 ? simp : pts;
}

function zOndeAlvo(pts: StarTMPt[], xAlvo: number, interno: boolean) {
  const passou = (x: number) => (interno ? x <= xAlvo : x >= xAlvo);
  if (passou(pts[0].x)) return pts[0].z;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!passou(a.x) && passou(b.x)) {
      if (Math.abs(b.x - a.x) < 1e-9) return a.z;
      return a.z + ((xAlvo - a.x) / (b.x - a.x)) * (b.z - a.z);
    }
  }
  return pts[pts.length - 1].z;
}

function faixaPadraoStar(tipo: StarTMOpTipo, geo: StarTMGeo, p: Record<string, number>): StarTMFaixa[] | null {
  if (tipo === "face") return [[geo.zFront, geo.zFront + (p.sobre !== undefined ? p.sobre : 0.5)]];
  if (tipo === "centro") return [[geo.zFront - (p.prof !== undefined ? p.prof : 2), geo.zFront]];
  if (tipo === "corte") return [[geo.zBack, geo.zBack]];
  return null;
}

function extrairNumeroFerr(ferr: string): number {
  const m = (ferr || "").toUpperCase().match(/T(\d+)/);
  if (!m) return 0;
  const s = m[1];
  if (s.length >= 4) return parseInt(s.slice(0, 2), 10) || 0;
  return parseInt(s, 10) || 0;
}

const FRONTAIS_H1: StarTMOpTipo[] = ["centro", "furo", "desbInt", "acabInt", "canalInt", "roscaInt", "macho"];
const FRONTAL_PADRAO: Partial<Record<StarTMOpTipo, number>> = {
  centro: 11,
  furo: 12,
  desbInt: 13,
  acabInt: 14,
  roscaInt: 15,
  canalInt: 16,
  macho: 17,
};

const DESC_TIPO: Record<StarTMOpTipo, string> = {
  face: "FACEAMENTO",
  desbExt: "DESBASTE EXTERNO",
  acabExt: "ACABAMENTO EXTERNO",
  canal: "CANAL EXTERNO",
  canalInt: "CANAL INTERNO",
  roscaExt: "ROSCA EXTERNA",
  centro: "FURO DE CENTRO",
  furo: "FURACAO",
  desbInt: "DESBASTE INTERNO",
  acabInt: "ACABAMENTO INTERNO",
  roscaInt: "ROSCA INTERNA",
  macho: "MACHO RIGIDO",
  corte: "BEDAME",
};

export const DESC_TIPO_STAR = DESC_TIPO;

export function extrairSincronismosStar(linhas: string[]): string[] {
  const res: string[] = [];
  for (const ln of linhas) {
    const semCom = ln.split(";")[0].replace(/\([^)]*\)/g, "").trim().toUpperCase();
    if (!semCom) continue;
    const matches = semCom.matchAll(/(?<![A-Z0-9])M(2\d{2}|3\d{2})(?!\d)/g);
    for (const m of matches) res.push("M" + m[1]);
  }
  return res;
}

function extrairSincronismos(linhas: string[]): string[] {
  const res: string[] = [];
  for (const ln of linhas) {
    const semCom = ln.split(";")[0].replace(/\([^)]*\)/g, "").trim().toUpperCase();
    if (!semCom) continue;
    const matches = semCom.matchAll(/(?<![A-Z0-9])M(2\d{2})(?!\d)/g);
    for (const m of matches) res.push("M" + m[1]);
  }
  return res;
}

export function validarSincronismoStar(h1Lines: string[], h2Lines: string[]): string | null {
  const s1 = extrairSincronismos(h1Lines);
  const s2 = extrairSincronismos(h2Lines);
  if (!s1.length || !s2.length) return "Erro de sincronismo: M200 obrigatório nos dois canais.";
  if (s1[0] !== "M200" || s2[0] !== "M200") return "Erro de sincronismo: M200 deve ser o primeiro código nos dois canais.";
  const dup1 = s1.find((c, i) => s1.indexOf(c) !== i);
  if (dup1) return `Erro de sincronismo: ${dup1} repetido no HEAD1.`;
  const dup2 = s2.find((c, i) => s2.indexOf(c) !== i);
  if (dup2) return `Erro de sincronismo: ${dup2} repetido no HEAD2.`;
  if (s1.length !== s2.length) {
    return `Erro de sincronismo: quantidade diferente entre HEAD1 (${s1.join(", ")}) e HEAD2 (${s2.join(", ")}).`;
  }
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) {
      return `Erro de sincronismo: ordem divergente entre HEAD1 (${s1.join(", ")}) e HEAD2 (${s2.join(", ")}).`;
    }
  }
  return null;
}

export function criarEmissorOpsStar(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg) {
  const bD = cfg.bD;
  const ativos = ops.filter((o) => o.ativo);
  const origs = cfg.origens || [];
  const offZ = (op: StarTMOp) => {
    const og = origs[(op.orig || 1) - 1] || origs[0];
    return og ? og.desl || 0 : 0;
  };
  // Suíço: Z0 na face da peça, Z positivo entra na peça
  const zH1 = (zGeo: number, op?: StarTMOp) => geo.zFront - zGeo + (op ? offZ(op) : 0);
  // H2 (contrafuso): Z0 na face traseira (corte), Z positivo entra pela traseira da peça
  const zH2 = (zGeo: number, op?: StarTMOp) => zGeo - geo.zBack + (op ? offZ(op) : 0);

  const emitSpindle = (out: string[], p: Record<string, number>, dRef: number, padrao: number, acionada = false) => {
    if (acionada) {
      const rpmA = (p.rpm ?? 0) > 0 ? Math.round(p.rpm) : 2000;
      out.push("M5");
      out.push("G98M36S" + rpmA);
      out.push("M8");
      if (p.ang !== undefined) out.push("G0C" + fmt(p.ang));
      return;
    }
    const modo = p.mr !== undefined ? p.mr : padrao;
    if (modo === 1) {
      const rpm =
        (p.rpm ?? 0) > 0
          ? Math.round(p.rpm)
          : Math.min(cfg.rpmMax || 3000, Math.round(((p.vc ?? 150) * 1000) / (Math.PI * Math.max(dRef, 1))));
      out.push("G99G97S" + rpm + "M3");
    } else {
      const lim = (p.lim ?? 0) > 0 ? Math.round(p.lim) : cfg.rpmMax || 3000;
      out.push("G50S" + lim);
      out.push("G99G96S" + Math.round(p.vc ?? 180) + "M3");
    }
  };

  let nIdx = 1;
  let nextH2Tool = 21;
  const ciclosH1: Record<string, { p: number; q: number; rp?: number }> = {};
  const acabExtOp = ativos.find((o) => o.tipo === "acabExt" && (o.cab || "H1") === "H1");
  const ferramentasUsadas: { tNum: number; desc: string; vu: number }[] = [];

  const gerarOpLinhas = (op: StarTMOp, canal: "H1" | "H2"): string[] => {
    const lines: string[] = [];
    const p = op.p;
    const fxs = op.faixas.length ? op.faixas : faixaPadraoStar(op.tipo, geo, p) || [];
    if (!fxs.length) return lines;

    const frontalH1 = canal === "H1" && FRONTAIS_H1.includes(op.tipo);
    const parsedT = extrairNumeroFerr(op.ferr);
    let tNum: number;
    if (canal === "H2") {
      tNum = parsedT >= 21 && parsedT <= 29 ? parsedT : Math.min(29, nextH2Tool++);
    } else if (frontalH1) {
      tNum = parsedT >= 11 && parsedT <= 19 ? parsedT : (FRONTAL_PADRAO[op.tipo] ?? 11);
    } else {
      tNum = parsedT >= 2 && parsedT <= 10 ? parsedT : 2;
    }

    const desc = (op.nomeFerr || DESC_TIPO[op.tipo] || op.tipo).toUpperCase().replace(/[()]/g, "");
    const aprox = p.apz !== undefined ? p.apz : 2;
    const xSeg = bD + 2;
    const zCoord = (zGeo: number) => (canal === "H2" ? zH2(zGeo, op) : zH1(zGeo, op));
    const zFrontClear = zCoord(canal === "H2" ? geo.zBack : geo.zFront) - Math.max(1, aprox);

    let movInicialEmitido = false;
    const g0Inicial = (xVal: number, zVal: number) => {
      if (!movInicialEmitido) {
        movInicialEmitido = true;
        lines.push("G0X" + fmt(xVal) + "Z" + fmt(zVal) + "T" + tNum);
      } else {
        lines.push("G0X" + fmt(xVal) + "Z" + fmt(zVal));
      }
    };

    const acionada = (p.acionada ?? 0) === 1;
    ferramentasUsadas.push({ tNum, desc, vu: Math.round(p.vu ?? 500) });
    lines.push("T" + tNum + "00(" + desc + ")");
    lines.push("/M25");

    if (op.tipo === "face") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zTopo = zIni - zFim < 0.001 ? zFim + (p.sobre ?? 0.5) : zIni;
      const xi = (p.xi ?? 0) > 0 ? p.xi : bD + 1;
      const xf = p.xf !== undefined ? p.xf : -1.6;
      const apFace = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
      emitSpindle(lines, p, bD, 0, acionada);
      const zStartS = zCoord(zTopo);
      const zEndS = zCoord(zFim);
      const passos: number[] = [];
      let zz = zStartS;
      let g = 0;
      while (g++ < 500 && zz + apFace < zEndS - 1e-6) {
        zz += apFace;
        passos.push(zz);
      }
      passos.push(zEndS);
      g0Inicial(xi, zStartS - 1);
      passos.forEach((zp) => {
        lines.push("G0Z" + fmt(zp));
        lines.push("G1X" + fmt(xf) + "F" + fmt(p.f ?? 0.15));
        lines.push("G0Z" + fmt(zp - 0.5));
        lines.push("G0X" + fmt(xi));
      });
    } else if (op.tipo === "desbExt" || op.tipo === "acabExt") {
      let s = subIntervalos(geo.ext, fxs);
      let gS = 0;
      while (gS++ < 500 && s.length > 1 && s[0].zA - s[0].zB < 1e-9) s = s.slice(1);
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbExt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, false, real).pts, angM), p.rp ?? 0.4, false);
        const zStartS = zCoord(pts[0].z) - aprox;
        const xSai = Math.max(bD + 1, pts[pts.length - 1].x + 1);
        emitSpindle(lines, p, bD, 0, acionada);
        if (zStartS > zFrontClear + 1e-4) {
          g0Inicial(bD + 1, zFrontClear);
          lines.push("G0Z" + fmt(zStartS));
        } else {
          g0Inicial(bD + 1, zStartS);
        }

        const chave = JSON.stringify(fxs);
        if (op.tipo === "desbExt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1.5) > 0 ? p.ap : 1.5);
          if (op.ciclo) {
            const n1 = nIdx * 100;
            const n2 = n1 + 50;
            nIdx++;
            ciclosH1["E" + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
            lines.push("G71U" + fmt(apDesb) + "R0.5");
            lines.push("G71P" + n1 + "Q" + n2 + "U" + fmt(p.u ?? 0.4) + "W" + fmt(-(p.w ?? 0.1)) + "F" + fmt(p.f ?? 0.25));
            const fAc = acabExtOp ? acabExtOp.p.f ?? 0.1 : 0.1;
            lines.push("N" + n1 + "G0X" + fmt(pts[0].x));
            lines.push("G1Z" + fmt(zCoord(pts[0].z)) + "F" + fmt(fAc));
            for (let k = 1; k < pts.length; k++) {
              lines.push("G1X" + fmt(pts[k].x) + "Z" + fmt(zCoord(pts[k].z)));
            }
            lines.push("N" + n2 + "G1X" + fmt(xSai));
          } else {
            const mono = real ? compensarRaio(perfilMono(s, false, false).pts, p.rp ?? 0.4, false) : pts;
            const monoU = mono.map((q) => ({ x: q.x + (p.u ?? 0.4), z: q.z }));
            const xMin = Math.min(...monoU.map((q) => q.x));
            let xp = bD;
            let gXp = 0;
            while (gXp++ < 1000 && xp > xMin + 1e-6) {
              const nx = Math.max(xMin, xp - 2 * apDesb);
              if (nx >= xp - 1e-6) break;
              xp = nx;
              const zl = zOndeAlvo(monoU, xp + 1e-6, false);
              if (zl >= pts[0].z - 1e-6) continue;
              lines.push("G0X" + fmt(xp) + "Z" + fmt(zStartS));
              lines.push("G1Z" + fmt(zCoord(zl) - (p.w ?? 0.1)) + "F" + fmt(p.f ?? 0.25));
              lines.push("G1X" + fmt(xp + 1));
              lines.push("G0Z" + fmt(zStartS));
            }
          }
        } else {
          const c = ciclosH1["E" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            lines.push("G0X" + fmt(pts[0].x));
            lines.push("G1Z" + fmt(zCoord(pts[0].z)) + "F" + fmt(p.f ?? 0.1));
            for (let k = 1; k < pts.length; k++) {
              lines.push("G1X" + fmt(pts[k].x) + "Z" + fmt(zCoord(pts[k].z)));
            }
            lines.push("G1X" + fmt(xSai));
          }
        }
      }
    } else if (op.tipo === "canal" || op.tipo === "canalInt") {
      const interno = op.tipo === "canalInt";
      const srcIv = interno ? geo.int : geo.ext;
      const s = subIntervalos(srcIv, fxs);
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const dFundo = s.length
        ? interno
          ? Math.max(...s.map((q) => Math.max(q.xa, q.xb)))
          : Math.min(...s.map((q) => Math.min(q.xa, q.xb)))
        : interno
          ? geo.intDmin + 2
          : Math.max(2, geo.dMax - 4);
      const larg = Math.max(0.5, p.larg ?? 3);
      const passoZ = (p.ps ?? 0) > 0 ? p.ps : larg * 0.8;
      const pk = (p.pk ?? 1) > 0 ? p.pk : 1;
      const xStart = interno ? Math.max(2, geo.intDmin - 1) : bD + 1;
      const zIniS = zCoord(zIni);
      emitSpindle(lines, p, interno ? Math.max(geo.intDmin, 2) : bD, 1, acionada);
      if (interno) {
        g0Inicial(xStart, zFrontClear);
        if (Math.abs(zIniS - zFrontClear) > 1e-4) lines.push("G0Z" + fmt(zIniS));
      } else {
        g0Inicial(xStart, Math.min(zFrontClear, zIniS));
        if (zIniS > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zIniS));
      }
      if (op.ciclo) {
        lines.push("G75R" + fmt(p.re ?? 0.5));
        lines.push(
          "G75X" +
            fmt(dFundo) +
            "Z" +
            fmt(zCoord(zFim)) +
            "P" +
            Math.round(pk * 1000) +
            "Q" +
            Math.round(passoZ * 1000) +
            "F" +
            fmt(p.f ?? 0.05)
        );
      } else {
        const zA = zCoord(zIni);
        const zB = zCoord(zFim);
        const stepZ = zB >= zA ? Math.max(0.2, passoZ) : -Math.max(0.2, passoZ);
        let zCur = zA;
        let gC = 0;
        while (gC++ < 200) {
          lines.push("G0Z" + fmt(zCur));
          lines.push("G1X" + fmt(dFundo) + "F" + fmt(p.f ?? 0.05));
          lines.push("G0X" + fmt(xStart));
          if (Math.abs(zCur - zB) < 1e-4) break;
          zCur = stepZ > 0 ? Math.min(zB, zCur + stepZ) : Math.max(zB, zCur + stepZ);
        }
      }
      if (interno) lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "roscaExt" || op.tipo === "roscaInt") {
      const interno = op.tipo === "roscaInt";
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const s = subIntervalos(interno ? geo.int : geo.ext, fxs);
      const dNom = s.length
        ? interno
          ? Math.max(...s.map((q) => Math.max(q.xa, q.xb)))
          : Math.min(...s.map((q) => Math.min(q.xa, q.xb)))
        : interno
          ? Math.max(geo.intDmin, 10)
          : geo.dMax;
      const passo = Math.max(0.2, p.passo ?? 1.5);
      const h = (p.h ?? 0) > 0 ? p.h : passo * (interno ? 0.541 : 0.613);
      const dFinal = interno ? dNom + 2 * h : dNom - 2 * h;
      const q1 = Math.max(0.05, p.q ?? 0.25);
      const xStart = interno ? Math.max(2, (p.d0 ?? 0) > 0 ? p.d0 - 2 : dNom - 2) : dNom + 3;
      const rpmRosca = Math.round(p.rpm ?? (interno ? 600 : 800));
      const zEntry = zCoord(zIni) - aprox;
      lines.push("G99G97S" + rpmRosca + "M3");
      if (interno) {
        g0Inicial(xStart, zFrontClear);
        if (Math.abs(zEntry - zFrontClear) > 1e-4) lines.push("G0Z" + fmt(zEntry));
      } else {
        g0Inicial(Math.max(bD + 1, xStart), Math.min(zFrontClear, zEntry));
        if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEntry));
        if (xStart < bD + 1) lines.push("G0X" + fmt(xStart));
      }
      if (op.ciclo) {
        lines.push("G76P020060Q50R0.05");
        lines.push(
          "G76X" +
            fmt(dFinal) +
            "Z" +
            fmt(zCoord(zFim)) +
            "P" +
            Math.round(h * 1000) +
            "Q" +
            Math.round(q1 * 1000) +
            "F" +
            fmt(passo)
        );
      } else {
        // Fanuc Sistema A: G92 é ciclo de rosca
        const nPasses = Math.max(2, Math.min(30, Math.ceil(h / q1) + 1));
        for (let k = 1; k <= nPasses; k++) {
          const frac = Math.sqrt(k / nPasses);
          const xPasse = interno ? dNom + 2 * h * frac : dNom - 2 * h * frac;
          if (k === 1) lines.push("G92X" + fmt(xPasse) + "Z" + fmt(zCoord(zFim)) + "F" + fmt(passo));
          else lines.push("X" + fmt(xPasse));
        }
      }
      if (interno) lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "centro") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zCoord(zIni) - aprox;
      lines.push("G99G97S" + Math.round(p.rpm ?? 1500) + "M3");
      g0Inicial(0, Math.min(zFrontClear, zEntry));
      if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEntry));
      lines.push("G1Z" + fmt(zCoord(zFim)) + "F" + fmt(p.f ?? 0.08));
      lines.push("G0Z" + fmt(Math.min(zFrontClear, zEntry)));
    } else if (op.tipo === "furo") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zIniS = zCoord(zIni);
      const zFimS = zCoord(zFim);
      const zEntry = zIniS - aprox;
      const qMm = Math.max(0.5, p.q ?? 5);
      lines.push("G99G97S" + Math.round(p.rpm ?? 1200) + "M3");
      g0Inicial(0, Math.min(zFrontClear, zEntry));
      if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEntry));
      if (op.ciclo) {
        // Q em milésimos (ex.: Q40000 = 40mm)
        lines.push("G83Z" + fmt(zFimS) + "Q" + Math.round(qMm * 1000) + "F" + fmt(p.f ?? 0.1));
        lines.push("G80");
      } else {
        let zCur = zIniS;
        let g = 0;
        while (g++ < 500 && zCur < zFimS - 1e-6) {
          zCur = Math.min(zFimS, zCur + qMm);
          lines.push("G1Z" + fmt(zCur) + "F" + fmt(p.f ?? 0.1));
          lines.push("G0Z" + fmt(zEntry));
          if (zCur < zFimS - 1e-6) lines.push("G0Z" + fmt(Math.max(zIniS - 0.5, zCur - 0.5)));
        }
      }
      if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "macho") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zCoord(zIni) - aprox;
      lines.push("M29S" + Math.round(p.rpm ?? 300));
      g0Inicial(0, Math.min(zFrontClear, zEntry));
      if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEntry));
      lines.push("G84Z" + fmt(zCoord(zFim)) + "F" + fmt(p.passo ?? 1.5));
      lines.push("G80");
      if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "desbInt" || op.tipo === "acabInt") {
      const s = subIntervalos(geo.int, fxs);
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbInt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, true, real).pts, angM), p.rp ?? 0.4, true);
        const dSeg = op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin;
        const xEnt = Math.max(1, dSeg - ((p.fi ?? 1) > 0 ? p.fi : 1));
        const zStartS = zCoord(pts[0].z) - aprox;
        emitSpindle(lines, p, Math.max(dSeg, 2), 0, acionada);
        g0Inicial(xEnt, Math.min(zFrontClear, zStartS));
        if (zStartS > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zStartS));

        const chave = JSON.stringify(fxs);
        if (op.tipo === "desbInt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
          if (op.ciclo) {
            const n1 = nIdx * 100;
            const n2 = n1 + 50;
            nIdx++;
            ciclosH1["I" + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
            lines.push("G71U" + fmt(apDesb) + "R0.5");
            lines.push("G71P" + n1 + "Q" + n2 + "U-" + fmt(p.u ?? 0.3) + "W" + fmt(-(p.w ?? 0.1)) + "F" + fmt(p.f ?? 0.2));
            lines.push("N" + n1 + "G0X" + fmt(pts[0].x));
            lines.push("G1Z" + fmt(zCoord(pts[0].z)) + "F" + fmt(p.f ?? 0.2));
            for (let k = 1; k < pts.length; k++) {
              lines.push("G1X" + fmt(pts[k].x) + "Z" + fmt(zCoord(pts[k].z)));
            }
            lines.push("N" + n2 + "G1X" + fmt(xEnt));
          } else {
            const xMaxInt = Math.max(...pts.map((q) => q.x)) - (p.u ?? 0.3);
            let xp = dSeg;
            let gXp = 0;
            while (gXp++ < 1000 && xp < xMaxInt - 1e-6) {
              const nx = Math.min(xMaxInt, xp + 2 * apDesb);
              if (nx <= xp + 1e-6) break;
              xp = nx;
              const zl = zOndeAlvo(pts, xp - 1e-6, true);
              lines.push("G0X" + fmt(xp) + "Z" + fmt(zStartS));
              lines.push("G1Z" + fmt(zCoord(zl) - (p.w ?? 0.1)) + "F" + fmt(p.f ?? 0.2));
              lines.push("G1X" + fmt(Math.max(1, xp - 1)));
              lines.push("G0Z" + fmt(zStartS));
            }
          }
        } else {
          const c = ciclosH1["I" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            lines.push("G0X" + fmt(pts[0].x));
            lines.push("G1Z" + fmt(zCoord(pts[0].z)) + "F" + fmt(p.f ?? 0.08));
            for (let k = 1; k < pts.length; k++) {
              lines.push("G1X" + fmt(pts[k].x) + "Z" + fmt(zCoord(pts[k].z)));
            }
            lines.push("G1X" + fmt(xEnt));
          }
        }
        lines.push("G0Z" + fmt(zFrontClear));
      }
    }

    if (acionada) {
      lines.push("M9");
      lines.push("M38");
    }

    if (frontalH1 || canal === "H2") {
      lines.push("G0Z" + fmt(Math.min(-5.0, zFrontClear)));
      lines.push("M1");
    } else {
      lines.push("G0X" + fmt(xSeg));
      lines.push("T0M1");
    }
    return lines;
  };

  return { gerarOpLinhas, ferramentasUsadas };
}

export function tmGerarStar18iTB(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): StarGerarResult {
  const nmBruto = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_\- ]/g, "_");
  const nm = nmBruto || "PECA";
  const mProg = nm.match(/^O(\d{4,})$/);
  const progId = mProg ? "O" + mProg[1] : "O0001";
  const bD = cfg.bD;
  const sr20j = cfg.maqId === "STAR_SR20J_N08";
  const ativos = ops.filter((o) => o.ativo);
  const corteOp = ativos.find((o) => o.tipo === "corte");
  const largCorte = corteOp ? (corteOp.p.larg !== undefined ? corteOp.p.larg : 3) : 3;
  const rpmCorte = corteOp
    ? (corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0
        ? Math.round(corteOp.p.rpm)
        : Math.min(cfg.rpmMax || 3000, Math.round(((corteOp.p.vc ?? 100) * 1000) / (Math.PI * Math.max(bD, 1)))))
    : 1500;
  const fCorte = corteOp && (corteOp.p.f ?? 0) > 0 ? corteOp.p.f : 0.05;
  const { gerarOpLinhas } = criarEmissorOpsStar(ops, geo, cfg);

  const opsH1 = ativos.filter((o) => o.tipo !== "corte" && (o.cab || "H1") === "H1");
  const opsH2 = ativos.filter((o) => o.tipo !== "corte" && o.cab === "H2");

  const h1: string[] = [];
  const h2: string[] = [];
  const sincPega = "M210";

  // HEAD1 (arquivo SEM sufixo, ex.: O0001)
  h1.push("%");
  h1.push(`${progId}(${nm})`);
  h1.push("M38");
  h1.push("M9");
  h1.push("G99G97G80G40");
  h1.push(`#531=${fmt(bD)} (DIAM. BARRA)`);
  h1.push("#2601=0.0");
  h1.push("IF[#5041GT0]GOTO1000");
  h1.push("M5");
  h1.push("M11");
  h1.push("G4X1");
  if (sr20j) {
    const cursoZ = cfg.cursoCab && cfg.cursoCab > 0 ? cfg.cursoCab : geo.L + largCorte;
    h1.push("G28W0T0");
    h1.push("G0W" + fmt(cursoZ));
    h1.push("G120Z0");
  } else {
    h1.push("G0Z0T0");
  }
  h1.push("M10");
  h1.push("G4X1");
  h1.push("M200");
  h1.push("M20");
  h1.push("T100");
  h1.push("G0X" + fmt(bD + 2));
  h1.push("M27");

  opsH1.forEach((op) => {
    const linhasOp = gerarOpLinhas(op, "H1");
    linhasOp.forEach((l) => h1.push(l));
  });

  h1.push("T100(BEDAME)");
  h1.push("/M25");
  h1.push(`G99G97S${rpmCorte}M3`);
  h1.push(`G0X${fmt(bD + 1)}Z-1.0T1`);
  h1.push(`G0Z${fmt(geo.L + largCorte)}`);
  h1.push(sincPega);
  h1.push("M82");
  h1.push("M40");
  h1.push(`G1X-1.5F${fmt(fCorte)}`);
  h1.push("M41");
  h1.push("M83");
  h1.push("M5");
  h1.push("M80");
  h1.push("/M98P8000");
  h1.push("M81");
  h1.push("M99");
  h1.push("N1000");
  h1.push("T200");
  h1.push("T100");
  h1.push(`G99G97S${rpmCorte}M3`);
  h1.push("M25");
  h1.push(`G0X${fmt(bD + 0.5)}T1`);
  h1.push("G1X-1.5F.05");
  h1.push("M5");
  h1.push("M99");
  h1.push("%");

  // HEAD2 (arquivo com sufixo .P-2, ex.: O0001.P-2)
  const pegaDist = Math.max(1, cfg.pega2 ?? 10);
  h2.push("%");
  h2.push(`${progId}(${nm})`);
  h2.push("M5");
  h2.push("G99G97G80G40");
  if (sr20j) {
    h2.push("G0Z0T0");
    h2.push("T2000");
  } else {
    h2.push("G28W0T0");
  }
  h2.push("M200");
  h2.push("M20");

  opsH2.forEach((op) => {
    const linhasOp = gerarOpLinhas(op, "H2");
    if (!linhasOp.length) return;
    h2.push("/M75");
    linhasOp.forEach((l) => h2.push(l.startsWith("/") ? l : "/" + l));
    h2.push("/M76");
  });

  h2.push(sincPega);
  h2.push("G0Z0T0");
  h2.push(`S${rpmCorte}M4`);
  h2.push("M82");
  h2.push("M11");
  h2.push("G0Z-2.0");
  h2.push("M68");
  h2.push("M14");
  h2.push(`G98G1W${fmt(pegaDist)}F2000`);
  h2.push("M15");
  h2.push("M10");
  h2.push("M69");
  h2.push("M40");
  h2.push("M41");
  h2.push("M68");
  h2.push("G1G99W-3.0F.04");
  h2.push("M69");
  h2.push("M83");
  h2.push("G0Z0T0M5");
  h2.push("M99");
  h2.push("%");

  const erroSinc = validarSincronismoStar(h1, h2);
  if (erroSinc) {
    return {
      textos: ["", ""],
      nomes: [progId, progId + ".P-2"],
      doisCanais: true,
      erro: erroSinc,
    };
  }

  return {
    textos: [h1.join("\n"), h2.join("\n")],
    nomes: [progId, progId + ".P-2"],
    doisCanais: true,
  };
}
