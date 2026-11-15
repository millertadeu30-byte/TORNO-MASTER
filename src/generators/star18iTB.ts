import { MAQUINAS_DNA } from "../data/maquinasDNA";

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
  transZ?: number;
  recuoTroca?: {
    modo?: "G53" | "G0_ABS" | "X_FIXO";
    x?: number;
    z?: number;
    xCanal2?: number;
    zCanal2?: number;
    zFrontal?: number;
  };
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

export function emitirContornoArcos(
  out: string[],
  pts: StarTMPt[],
  zCoord: (zGeo: number) => number,
  fmtFn: (n: number) => string,
  mode: "fanuc" | "siemens",
  fAcab: number,
  opts?: { n1?: number | null; n2?: number | null; xSaida?: number; emitStart?: boolean }
) {
  if (!pts.length) return;
  const clean: { u: number; v: number; x: number }[] = [];
  for (const pt of pts) {
    const u = zCoord(pt.z);
    const v = pt.x / 2;
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(u - prev.u, v - prev.v) > 1e-5) {
      clean.push({ u, v, x: pt.x });
    }
  }
  if (!clean.length) return;

  if (opts?.emitStart !== false) {
    out.push((opts?.n1 ? "N" + opts.n1 + " " : "") + "G0X" + fmtFn(clean[0].x));
    out.push("G1Z" + fmtFn(clean[0].u) + "F" + fmtFn(fAcab));
  } else {
    out.push("G1Z" + fmtFn(clean[0].u) + "F" + fmtFn(fAcab));
  }

  const fitCircle = (a: { u: number; v: number }, b: { u: number; v: number }, c: { u: number; v: number }) => {
    const d = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v));
    if (Math.abs(d) < 1e-9) return null;
    const a2 = a.u * a.u + a.v * a.v;
    const b2 = b.u * b.u + b.v * b.v;
    const c2 = c.u * c.u + c.v * c.v;
    const cu = (a2 * (b.v - c.v) + b2 * (c.v - a.v) + c2 * (a.v - b.v)) / d;
    const cv = (a2 * (c.u - b.u) + b2 * (a.u - c.u) + c2 * (b.u - a.u)) / d;
    const R = Math.hypot(a.u - cu, a.v - cv);
    if (!isFinite(R) || R < 0.1 || R > 250) return null;
    return { cu, cv, R };
  };

  let i = 0;
  while (i < clean.length - 1) {
    let bestJ = -1;
    let bestR = 0;
    let bestCross = 0;

    const maxJ = Math.min(clean.length - 1, i + 250);
    for (let j = i + 2; j <= maxJ; j++) {
      const m = Math.floor((i + j) / 2);
      const circ = fitCircle(clean[i], clean[m], clean[j]);
      const chord = Math.hypot(clean[j].u - clean[i].u, clean[j].v - clean[i].v);
      if (!circ) {
        if (chord > 0.35 && j - i >= 5) break;
        continue;
      }
      // Require >= 5 points (4 sub-segments) so a long straight line + 1 corner vertex never fits a fake circle
      if (j - i < 4) continue;
      // Reject if any sub-segment is a long straight chord whose circular sagitta would exceed 0.015mm
      const maxChordForArc = Math.max(0.25, Math.sqrt(0.12 * circ.R));
      let hasLongStraightSeg = false;
      for (let k = i; k < j; k++) {
        const segLen = Math.hypot(clean[k + 1].u - clean[k].u, clean[k + 1].v - clean[k].v);
        if (segLen > maxChordForArc || (segLen > 0.25 && segLen > 0.35 * chord)) {
          hasLongStraightSeg = true;
          break;
        }
      }
      if (hasLongStraightSeg) {
        if (j - i >= 5) break;
        continue;
      }
      let maxErr = 0;
      for (let k = i; k <= j; k++) {
        const err = Math.abs(Math.hypot(clean[k].u - circ.cu, clean[k].v - circ.cv) - circ.R);
        if (err > maxErr) {
          maxErr = err;
          if (maxErr > 0.008) break;
        }
      }
      if (maxErr > 0.008) {
        if (chord > 0.35 && j - i >= 5) break;
        continue;
      }
      // Sweep angle and sagitta check
      if (chord > 2 * circ.R - 1e-4) break;
      const sweep = 2 * Math.asin(Math.min(1, chord / (2 * circ.R)));
      if (sweep > (Math.PI * 165) / 180) break;
      // Ensure turning direction is consistent across sub-chords
      const du = clean[j].u - clean[i].u;
      const dv = clean[j].v - clean[i].v;
      const sagitta =
        chord > 1e-6
          ? Math.abs((clean[m].u - clean[i].u) * dv - (clean[m].v - clean[i].v) * du) / chord
          : 0;
      const cross =
        (clean[m].u - clean[i].u) * (clean[j].v - clean[m].v) -
        (clean[m].v - clean[i].v) * (clean[j].u - clean[m].u);
      let dirOk = Math.abs(cross) > 1e-7;
      if (dirOk) {
        for (let k = i + 1; k < j; k++) {
          const cLocal =
            (clean[k].u - clean[k - 1].u) * (clean[k + 1].v - clean[k].v) -
            (clean[k].v - clean[k - 1].v) * (clean[k + 1].u - clean[k].u);
          if (cLocal * cross < -1e-6) {
            dirOk = false;
            break;
          }
        }
      }
      if (!dirOk) {
        if (chord > 0.35 && j - i >= 5) break;
        continue;
      }
      if (chord >= 0.2 && sagitta >= 0.015 && sweep >= 0.12) {
        bestJ = j;
        bestR = circ.R;
        bestCross = cross;
      }
    }

    if (bestJ > i + 1) {
      const target = clean[bestJ];
      const chord = Math.hypot(target.u - clean[i].u, target.v - clean[i].v);
      let rEmit = Math.round(bestR * 1000) / 1000;
      if (2 * rEmit < chord + 0.002) {
        rEmit = Math.ceil((chord / 2 + 0.002) * 1000) / 1000;
      }
      const gArc = bestCross > 0 ? "G3" : "G2";
      if (mode === "siemens") {
        out.push(`${gArc}X${fmtFn(target.x)}Z${fmtFn(target.u)}CR=${fmtFn(rEmit)}`);
      } else {
        out.push(`${gArc}X${fmtFn(target.x)}Z${fmtFn(target.u)}R${fmtFn(rEmit)}`);
      }
      i = bestJ;
      continue;
    }

    // Siemens 45° chamfer detection when not inside an arc
    if (mode === "siemens" && i + 2 < clean.length) {
      const pPrev = clean[i];
      const pCur = clean[i + 1];
      const pNext = clean[i + 2];
      const dx1 = Math.abs(pCur.x - pPrev.x);
      const dz1 = Math.abs(pCur.u - pPrev.u);
      const dx2 = Math.abs(pNext.x - pCur.x);
      const dz2 = Math.abs(pNext.u - pCur.u);
      const isChamfer45 =
        dx1 > 0.05 &&
        dz1 > 0.05 &&
        dz1 <= 5 &&
        Math.abs(dx1 / 2 - dz1) < 0.02 &&
        ((i === 0 && dx2 < 0.02 && dz2 > 0.05) || (i > 0 && dz2 < 0.02 && dx2 > 0.05));
      if (isChamfer45) {
        if (i === 0) {
          out[out.length - 1] = `G1Z${fmtFn(pPrev.u)}CHF=${fmtFn(dz1)}F${fmtFn(fAcab)}`;
          out.push(`G1X${fmtFn(pCur.x)}Z${fmtFn(pCur.u)}`);
          i += 1;
          continue;
        } else {
          out.push(`G1X${fmtFn(pCur.x)}Z${fmtFn(pCur.u)}CHF=${fmtFn(dz1)}`);
          out.push(`G1X${fmtFn(pNext.x)}Z${fmtFn(pNext.u)}`);
          i += 2;
          continue;
        }
      }
    }

    const nxt = clean[i + 1];
    out.push("G1X" + fmtFn(nxt.x) + "Z" + fmtFn(nxt.u));
    i++;
  }

  if (opts?.xSaida !== undefined) {
    out.push((opts?.n2 ? "N" + opts.n2 + " " : "") + "G1X" + fmtFn(opts.xSaida));
  }
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

export function detectarCanaisStar(iv: StarTMIntervalo[]) {
  return perfilMono(iv, false, false).canais;
}

export function planoCanalStar(
  geo: StarTMGeo,
  c: { zStart: number; zEnd: number; topo: number },
  L: number,
  lc: number,
  bD: number
) {
  const xi = (q: StarTMIntervalo, z: number) =>
    q.zA - q.zB < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((q.zA - z) / (q.zA - q.zB)) * (q.xb - q.xa);
  const maxEntre = (zL: number, zR: number) => {
    let m = 0;
    if (zL < geo.zBack - lc - 1e-6) m = bD;
    for (const q of geo.ext) {
      const a = Math.min(zR, q.zA);
      const b = Math.max(zL, q.zB);
      if (a - b < 1e-6) continue;
      m = Math.max(m, xi(q, a), xi(q, b));
    }
    return m;
  };
  const xMono = (z: number) => maxEntre(z, geo.zFront);
  const fundoEm = (z: number) => maxEntre(z - L, z);
  const passo = Math.max(0.2, L * 0.8);
  const cand: number[] = [];
  geo.ext.forEach((q) => {
    if (q.zB < c.zEnd - 1e-6 || q.zA > c.zStart + 1e-6) return;
    if (Math.min(q.xa, q.xb) >= xMono(q.zA) - 0.01) return;
    const ini = q.zA;
    const fim = q.zB + L;
    if (fim >= ini - 1e-6) {
      cand.push(fundoEm(fim) < fundoEm(ini) - 1e-6 ? fim : ini);
      return;
    }
    for (let z = ini; z > fim + 1e-6; z -= passo) cand.push(z);
    cand.push(fim);
  });
  const merg: { z: number; d: number }[] = [];
  cand
    .sort((a, b) => b - a)
    .forEach((z) => {
      const r = Math.round(z * 1000) / 1000;
      if (merg.some((m) => Math.abs(m.z - r) < 0.01)) return;
      const d = fundoEm(r);
      if (d < xMono(r - L) - 0.01) merg.push({ z: r, d });
    });
  const grupos: { z: number; d: number }[][] = [];
  merg.forEach((m) => {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g[g.length - 1].d - m.d) < 1e-3 && g[g.length - 1].z - m.z <= L + 1e-6) g.push(m);
    else grupos.push([m]);
  });
  const xSeg = Math.min(bD, Math.max(c.topo, maxEntre(c.zEnd - L, c.zStart))) + 2;
  return { grupos, xSeg };
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
  const corteOp = ativos.find((o) => o.tipo === "corte");
  const largCorte = corteOp ? (corteOp.p.larg !== undefined ? corteOp.p.larg : 3) : 3;
  const dnaRecuo = cfg.maqId ? MAQUINAS_DNA.find((m) => m.id === cfg.maqId)?.recuoTroca : undefined;
  const xSegCfg = cfg.recuoTroca?.x ?? dnaRecuo?.x;
  const zFrontalCfg = cfg.recuoTroca?.zFrontal ?? dnaRecuo?.zFrontal;
  // Suíço: Z0 na face escolhida da barra (+ deslocamento da origem 1), Z positivo entra na peça
  const deslH1 = cfg.origens?.[0]?.desl ?? cfg.zero?.offsetZ ?? 0;
  const zH1 = (zGeo: number) => geo.zFront - zGeo + deslH1;
  // H2 (contrafuso): Z0 na face traseira (corte), Z positivo entra pela traseira da peça
  const zH2 = (zGeo: number) => zGeo - geo.zBack;

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
    const desc = (op.nomeFerr || DESC_TIPO[op.tipo] || op.tipo).toUpperCase().replace(/[()]/g, "");
    if (!fxs.length) {
      lines.push(`(PENDENCIA: ${desc} SEM REGIAO MARCADA - OPERACAO COMENTADA)`);
      return lines;
    }

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

    const aprox = p.apz !== undefined ? p.apz : 2;
    const xSeg = xSegCfg !== undefined && isFinite(xSegCfg) ? xSegCfg : bD + 2;
    const zCoord = (zGeo: number) => (canal === "H2" ? zH2(zGeo) : zH1(zGeo));
    const zFrontClear = zCoord(canal === "H2" ? geo.zBack : geo.zFront) - Math.max(1, aprox);

    // Impossibility guards: comment out instead of emitting colliding toolpath
    if (op.tipo === "furo") {
      const dBroca = p.d ?? 0;
      if (dBroca <= 0) {
        lines.push(`(PENDENCIA: ${desc} - INFORMAR DIAMETRO DA BROCA - OPERACAO COMENTADA)`);
        return lines;
      }
      if (geo.intDmin > 0 && dBroca > geo.intDmin + 0.05) {
        lines.push(`(PENDENCIA: ${desc} - BROCA D${fmt(dBroca)} MAIOR QUE FURO D${fmt(geo.intDmin)} - OPERACAO COMENTADA)`);
        return lines;
      }
    }
    if (op.tipo === "desbInt" || op.tipo === "acabInt" || op.tipo === "canalInt" || op.tipo === "roscaInt") {
      if (!geo.int.length || !subIntervalos(geo.int, fxs).length) {
        lines.push(`(PENDENCIA: ${desc} - SEM PERFIL INTERNO NA REGIAO - OPERACAO COMENTADA)`);
        return lines;
      }
      const dSegChk = op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin;
      const bm = p.bm ?? 0;
      const fb = p.fb ?? 0.5;
      if (bm > 0 && bm + fb > dSegChk + (op.tipo === "desbInt" ? 2 * Math.max(0.05, p.ap ?? 1) : 0) + 1e-6) {
        lines.push(`(PENDENCIA: ${desc} - BARRA D${fmt(bm)} NAO CABE NO FURO D${fmt(dSegChk)} - OPERACAO COMENTADA)`);
        return lines;
      }
    }

    let movInicialEmitido = false;
    const g0Inicial = (xVal: number, zVal: number) => {
      if (!movInicialEmitido) {
        movInicialEmitido = true;
        lines.push("G0X" + fmt(xVal) + "Z" + fmt(zVal) + "T" + tNum);
      } else {
        lines.push("G0X" + fmt(xVal) + "Z" + fmt(zVal));
      }
    };
    // Posicionamento seguro para ferramentas frontais / internas: mantém X acima da barra até Z chegar à frente da peça
    const g0FrontalSeguro = (xTarget: number, zTarget: number) => {
      const zSafe = Math.min(zFrontClear, zTarget);
      g0Inicial(bD + 1, zSafe);
      lines.push("G0X" + fmt(xTarget));
      if (zTarget > zSafe + 1e-4) lines.push("G0Z" + fmt(zTarget));
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
      g0Inicial(xi, Math.min(zFrontClear, zStartS - 1));
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
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", fAc, { n1, n2, xSaida: xSai });
          } else {
            const uOff = Math.max(0, p.u ?? 0.4);
            const wOff = Math.max(0, p.w ?? 0.1);
            const rawMono = perfilMono(s, false, false).pts;
            const rawOff = rawMono.map((q) => ({ x: q.x + uOff, z: q.z + wOff }));
            const compOff = compensarRaio(rawOff, p.rp ?? 0.4, false);
            const xMin = Math.min(...compOff.map((q) => q.x), ...rawOff.map((q) => q.x));
            let xp = bD;
            let gXp = 0;
            while (gXp++ < 1000 && xp > xMin + 1e-6) {
              const nx = Math.max(xMin, xp - 2 * apDesb);
              if (nx >= xp - 1e-6) break;
              xp = nx;
              const zlComp = zOndeAlvo(compOff, xp + 1e-6, false);
              const zlRaw = zOndeAlvo(rawOff, xp + 1e-6, false);
              const zl = Math.max(zlComp, zlRaw);
              if (zl >= pts[0].z - 1e-4) continue;
              const xRet = Math.min(bD + 1, xp + Math.min(2 * apDesb, 1.5));
              const zEndS = zCoord(zl);
              lines.push("G0X" + fmt(xp));
              lines.push("G1Z" + fmt(zEndS) + "F" + fmt(p.f ?? 0.25));
              lines.push("G1X" + fmt(xRet) + "Z" + fmt(zEndS - 0.5));
              lines.push("G0Z" + fmt(zStartS));
            }
          }
        } else {
          const c = ciclosH1["E" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.1, { xSaida: xSai });
          }
        }
      }
    } else if (op.tipo === "canal" || op.tipo === "canalInt") {
      const interno = op.tipo === "canalInt";
      const srcIv = interno ? geo.int : geo.ext;
      const s = subIntervalos(srcIv, fxs);
      const larg = Math.max(0.5, p.larg ?? 3);
      const passoZ = (p.ps ?? 0) > 0 ? p.ps : larg * 0.8;
      const pk = (p.pk ?? 1) > 0 ? p.pk : 1;
      if (interno) {
        const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const dFundo = s.length
          ? Math.max(...s.map((q) => Math.max(q.xa, q.xb)))
          : geo.intDmin + 2;
        const xStart = Math.max(1, geo.intDmin - 1);
        const zIniS = zCoord(zIni);
        emitSpindle(lines, p, Math.max(geo.intDmin, 2), 1, acionada);
        g0FrontalSeguro(xStart, zIniS);
        if (op.ciclo) {
          lines.push("G75R" + fmt(p.re ?? 0.5));
          lines.push("G75X" + fmt(dFundo) + "Z" + fmt(zCoord(zFim)) + "P" + Math.round(pk * 1000) + "Q" + Math.round(passoZ * 1000) + "F" + fmt(p.f ?? 0.05));
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
        lines.push("G0Z" + fmt(zFrontClear));
      } else {
        let canais = s.length ? perfilMono(s, false, false).canais : [];
        if (!canais.length && s.length) {
          canais = [{
            zStart: s[0].zA,
            zEnd: s[s.length - 1].zB,
            fundo: Math.min(...s.map((q) => Math.min(q.xa, q.xb))),
            topo: Math.max(...s.map((q) => Math.max(q.xa, q.xb))),
          }];
        }
        canais = canais.filter((c) => !(Math.abs(c.zEnd - geo.zBack) < 1e-3 && c.zStart - c.zEnd <= larg + 1e-6));
        const planos = canais.map((c) => planoCanalStar(geo, c, larg, largCorte, bD));
        const temGrupos = planos.some((pl) => pl.grupos.length > 0);
        if (!temGrupos) {
          lines.push(`(CANAL: NADA PARA CORTAR SEM INVADIR FLANCOS COM BEDAME L${fmt(larg)})`);
        } else {
          const xStart = bD + 1;
          emitSpindle(lines, p, bD, 1, acionada);
          let primeiroMov = true;
          planos.forEach((pl) => {
            pl.grupos.forEach((g) => {
              const ziS = zCoord(g[0].z);
              const zfS = zCoord(g[g.length - 1].z);
              const fundo = g[0].d;
              if (primeiroMov) {
                primeiroMov = false;
                if (ziS > zFrontClear + 1e-4) {
                  g0Inicial(xStart, zFrontClear);
                  lines.push("G0Z" + fmt(ziS));
                } else {
                  g0Inicial(xStart, ziS);
                }
              } else {
                lines.push("G0Z" + fmt(ziS));
              }
              if (op.ciclo) {
                lines.push("G75R" + fmt(p.re ?? 0.5));
                lines.push(
                  "G75X" +
                    fmt(fundo) +
                    "Z" +
                    fmt(zfS) +
                    "P" +
                    Math.round(pk * 1000) +
                    "Q" +
                    Math.round(passoZ * 1000) +
                    "F" +
                    fmt(p.f ?? 0.05)
                );
              } else {
                const stepZ = zfS >= ziS ? Math.max(0.2, passoZ) : -Math.max(0.2, passoZ);
                let zCur = ziS;
                let gC = 0;
                while (gC++ < 200) {
                  lines.push("G0Z" + fmt(zCur));
                  lines.push("G1X" + fmt(fundo) + "F" + fmt(p.f ?? 0.05));
                  lines.push("G0X" + fmt(xStart));
                  if (Math.abs(zCur - zfS) < 1e-4) break;
                  zCur = stepZ > 0 ? Math.min(zfS, zCur + stepZ) : Math.max(zfS, zCur + stepZ);
                }
              }
            });
          });
        }
      }
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
        g0FrontalSeguro(xStart, zEntry);
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
      g0FrontalSeguro(0, zEntry);
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
      g0FrontalSeguro(0, zEntry);
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
      g0FrontalSeguro(0, zEntry);
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
        g0FrontalSeguro(xEnt, zStartS);

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
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.2, { n1, n2, xSaida: xEnt });
          } else {
            const uOff = Math.max(0, p.u ?? 0.3);
            const wOff = Math.max(0, p.w ?? 0.1);
            const rawMono = perfilMono(s, true, false).pts;
            const rawOff = rawMono.map((q) => ({ x: Math.max(0.5, q.x - uOff), z: q.z + wOff }));
            const compOff = compensarRaio(rawOff, p.rp ?? 0.4, true);
            const xMaxInt = Math.max(...compOff.map((q) => q.x), ...rawOff.map((q) => q.x));
            let xp = dSeg;
            let gXp = 0;
            while (gXp++ < 1000 && xp < xMaxInt - 1e-6) {
              const nx = Math.min(xMaxInt, xp + 2 * apDesb);
              if (nx <= xp + 1e-6) break;
              xp = nx;
              const zlComp = zOndeAlvo(compOff, xp - 1e-6, true);
              const zlRaw = zOndeAlvo(rawOff, xp - 1e-6, true);
              const zl = Math.max(zlComp, zlRaw);
              if (zl >= pts[0].z - 1e-4) continue;
              const xRet = Math.max(1, xp - Math.min(2 * apDesb, 1.5));
              const zEndS = zCoord(zl);
              lines.push("G0X" + fmt(xp));
              lines.push("G1Z" + fmt(zEndS) + "F" + fmt(p.f ?? 0.2));
              lines.push("G1X" + fmt(xRet) + "Z" + fmt(zEndS - 0.5));
              lines.push("G0Z" + fmt(zStartS));
            }
          }
        } else {
          const c = ciclosH1["I" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.08, { xSaida: xEnt });
          }
        }
        lines.push("G0Z" + fmt(zFrontClear));
      }
    }

    if (acionada) {
      lines.push("M9");
      lines.push("M38");
    }

    const isSB20R = ["STAR_SB20R_N11", "STAR_SB20R_N13", "STAR_N19"].includes(cfg.maqId || "");
    if (isSB20R && canal === "H1") {
      if (frontalH1) {
        const zFr = zFrontalCfg !== undefined && isFinite(zFrontalCfg) ? zFrontalCfg : -3;
        const zFrStr = Number.isInteger(zFr) ? String(zFr) : fmt(zFr);
        lines.push("G0Z" + zFrStr);
        lines.push("G0X0");
        lines.push("G0T0");
        lines.push("M101");
      } else {
        const xRet = xSegCfg !== undefined && isFinite(xSegCfg) && xSegCfg > 0 ? xSegCfg : bD + 1.4;
        lines.push("G0X" + (Number.isInteger(xRet) ? String(xRet) : fmt(xRet)));
        lines.push("G0Z-1.0");
        lines.push("G97");
        lines.push("G0T0");
        lines.push("M101");
      }
    } else if (frontalH1) {
      const zFr = zFrontalCfg !== undefined && isFinite(zFrontalCfg) ? zFrontalCfg : -5;
      const zFrStr = Number.isInteger(zFr) ? String(zFr) : fmt(zFr);
      if (Math.abs(zFr + 1) < 1e-6) {
        lines.push("G0Z" + zFrStr + "T0");
      } else {
        lines.push("G0Z" + zFrStr);
      }
      lines.push("M1");
    } else if (canal === "H2") {
      lines.push("G0Z" + fmt(Math.min(-5.0, zFrontClear)));
      lines.push("M1");
    } else {
      lines.push("G0X" + (Number.isInteger(xSeg) ? String(xSeg) : fmt(xSeg)));
      lines.push("T0M1");
    }
    return lines;
  };

  return { gerarOpLinhas, ferramentasUsadas, deslH1 };
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
  const { gerarOpLinhas, deslH1 } = criarEmissorOpsStar(ops, geo, cfg);
  const compCorte = Math.max(0.1, geo.L + deslH1);

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
    const cursoZ = cfg.cursoCab && cfg.cursoCab > 0 ? cfg.cursoCab : compCorte + largCorte;
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
  h1.push(`G0X${fmt(bD + 1)}Z${fmt(compCorte + largCorte)}T1`);
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
