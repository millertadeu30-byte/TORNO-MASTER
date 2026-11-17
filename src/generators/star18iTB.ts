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
  | "corte"
  | "alargador"
  | "recartilhado"
  | "canalFrontal"
  | "furoRadial"
  | "furoAxial"
  | "fresaFaces";

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
  soloId?: string; // simular só esta operação (as outras ficam só no cálculo)
  cursoCab?: number;
  compW?: number; // W do G266 (comprimento da peça; editável)
  brutoDz?: number; // face do BRUTO à frente do zero da peça (mm): aproximação e faceamento do H1 respeitam o bruto
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

function faixaPadraoStar(tipo: StarTMOpTipo, geo: StarTMGeo, p: Record<string, number>, cab?: string): StarTMFaixa[] | null {
  // faceamento no HEAD 2 (contrafuso) é na face do CORTE (lado de trás da peça)
  if (tipo === "face" && cab === "H2") return [[geo.zBack - (p.sobre !== undefined ? p.sobre : 0.5), geo.zBack]];
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

const FRONTAIS_H1: StarTMOpTipo[] = ["centro", "furo", "desbInt", "acabInt", "canalInt", "roscaInt", "macho", "alargador", "canalFrontal", "furoAxial"];
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
  alargador: "ALARGADOR",
  recartilhado: "RECARTILHADO",
  canalFrontal: "CANAL FRONTAL",
  furoRadial: "FURO RADIAL ACIONADA",
  furoAxial: "FURO AXIAL ACIONADA",
  fresaFaces: "FRESA FACES ACIONADA",
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
  // H2 (contrafuso) = "G54 do Head 2": Z0 na face escolhida na origem do contrafuso (padrão: face cortada/traseira)
  // + deslocamento para dentro da peça; Z positivo entra na peça a partir dessa face
  const origH2 = (cfg.origens || []).find((o, j) => j > 0 && o.fuso === "contrafuso");
  const faceH1 = cfg.zero?.face ?? cfg.origens?.[0]?.face ?? "direita";
  const h2NaFrente = !!origH2 && origH2.face === faceH1; // zero do Head 2 na mesma face do Head 1 (raro)
  const deslH2 = origH2 ? (origH2.desl || 0) : 0;
  const zH2 = (zGeo: number) => (h2NaFrente ? geo.zFront - deslH2 - zGeo : zGeo - (geo.zBack + deslH2));

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

  const gerarOpLinhas = (op: StarTMOp, canal: "H1" | "H2"): string[] => { const rOp = espelharXLinhas(gerarOpLinhasBase(op, canal), (op.p.espX ?? 0) === 1); blocosOpsGerados[op.id] = rOp; return rOp; };
  // HEAD 2 ESPELHADO: a peça é virada (a face do CORTE vira a "frente"), assim TODA a lógica do H1
  // (furação, encabeçar, desbaste, acabamento, canal, aproximações, recuos) vale igual no H2, com Z0 = zero do Head 2.
  const geoBaseStar = geo;
  const sFH2 = geo.zFront + geo.zBack;
  const espIvH2 = (lst: StarTMIntervalo[]): StarTMIntervalo[] => lst.map((q) => ({ zA: sFH2 - q.zB, zB: sFH2 - q.zA, xa: q.xb, xb: q.xa })).reverse();
  const geoEspH2: StarTMGeo = { ...geo, ext: espIvH2(geo.ext), int: espIvH2(geo.int), intZmin: sFH2 - geo.intZmax, intZmax: sFH2 - geo.intZmin };
  // RESTO DE OPERAÇÃO: Ø que a operação nº "rs" deixou em cada Z (externo). null = do bruto
  // RESTO com VÁRIAS operações ("6,7"): lista dos nº digitados no campo (0 / vazio = do bruto)
  const listaRs = (o: StarTMOp): number[] => {
    const txt = (o as any).rsTxt !== undefined && String((o as any).rsTxt).trim() !== "" ? String((o as any).rsTxt) : String(o.p.rs ?? 0).replace(".", ","); // 6.7 digitado como número = "6,7"
    return Array.from(new Set(txt.split(/[,;\s+]+/).map((t) => parseInt(t, 10)).filter((n) => n > 0)));
  };
  const restoExtUm = (nRs: number, opAtual: StarTMOp, canal: "H1" | "H2", geoC: StarTMGeo, espH2: boolean): { nivel: (z: number) => number; nome: string } | null => {
    if (!(nRs > 0)) return null;
    const ref = ops[nRs - 1];
    if (!ref || !ref.ativo || ref === opAtual || !(ref.tipo === "desbExt" || ref.tipo === "acabExt" || ref.tipo === "canal" || ref.tipo === "face")) return null;
    if ((ref.cab ?? "H1") !== (opAtual.cab ?? "H1")) return null;
    const po = ref.p;
    const fxRaw = ref.faixas.length ? ref.faixas : faixaPadraoStar(ref.tipo, geo, po, ref.cab) || [];
    const sF = geo.zFront + geo.zBack;
    const fxo = espH2 ? fxRaw.map((fx) => [sF - Math.max(fx[0], fx[1]), sF - Math.min(fx[0], fx[1])] as StarTMFaixa) : fxRaw;
    let so = subIntervalos(geoC.ext, fxo);
    if (so.length && ref.tipo !== "face") { const [aX, bX] = pontosXZ(po, fxo); so = estenderIntervalos(cortarIntervalosXZ(so, aX, bX), po, false); } // o que a operação de referência fez de verdade (X de começo/fim e extensão)
    if (!so.length) return null;
    const zMax = Math.max(...so.map((q) => Math.max(q.zA, q.zB))), zMin = Math.min(...so.map((q) => Math.min(q.zA, q.zB)));
    if (ref.tipo === "face") return { nivel: (z: number) => (z > zMax + 1e-6 ? 0 : bD), nome: "OP " + nRs };
    const realO = po.real === 1 || ref.tipo === "canal";
    const angO = realO ? ((po.ang ?? 0) > 0 ? po.ang : PASTILHA_ANG[po.pas ?? 2] ?? 27) : 90;
    const ptsO = ref.tipo === "canal" ? perfilMono(so, false, true).pts : compensarRaio(limitaMergulho(perfilMono(so, false, realO).pts, angO), po.rp ?? 0.4, false);
    const sobre = ref.tipo === "desbExt" ? Math.max(0, po.u ?? 0.4) : 0;
    const valEm = (z: number) => {
      let vv = -Infinity;
      for (let i = 0; i < ptsO.length - 1; i++) {
        const a = ptsO[i], b = ptsO[i + 1];
        const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
        if (z < lo - 1e-9 || z > hi + 1e-9) continue;
        vv = Math.max(vv, hi - lo < 1e-9 ? Math.max(a.x, b.x) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
      }
      return vv;
    };
    return { nivel: (z: number) => { if (z > zMax + 1e-6 || z < zMin - 1e-6) return bD; const v = valEm(z); return v > -Infinity ? Math.min(bD, v + sobre) : bD; }, nome: "OP " + nRs };
  };
  // VÁRIAS operações: o material que sobrou é o que NENHUMA delas tirou (externo: o menor Ø que alguma deixou em cada Z)
  const perfilRestoExt = (opAtual: StarTMOp, canal: "H1" | "H2", geoC: StarTMGeo, espH2: boolean): { nivel: (z: number) => number; nome: string } | null => {
    const rs = listaRs(opAtual).map((n) => restoExtUm(n, opAtual, canal, geoC, espH2)).filter((r): r is { nivel: (z: number) => number; nome: string } => !!r);
    if (!rs.length) return null;
    if (rs.length === 1) return rs[0];
    return { nivel: (z: number) => Math.min(...rs.map((r) => r.nivel(z))), nome: rs.map((r) => r.nome).join(" + ") };
  };
  // RESTO DE OPERAÇÃO (interno): menor Ø já ABERTO pela operação nº "rs" (furação / desbaste / acabamento interno). null = do bruto
  const restoIntUm = (nRs: number, opAtual: StarTMOp, geoC: StarTMGeo, espH2: boolean): { dMin: number; nome: string } | null => {
    if (!(nRs > 0)) return null;
    const ref = ops[nRs - 1];
    if (!ref || !ref.ativo || ref === opAtual || (ref.cab ?? "H1") !== (opAtual.cab ?? "H1")) return null;
    if (ref.tipo === "furo") return (ref.p.d ?? 0) > 0 ? { dMin: ref.p.d, nome: "OP " + nRs } : null;
    if (!(ref.tipo === "desbInt" || ref.tipo === "acabInt" || ref.tipo === "canalInt")) return null;
    const sF = geo.zFront + geo.zBack;
    const fxo = espH2 ? ref.faixas.map((fx) => [sF - Math.max(fx[0], fx[1]), sF - Math.min(fx[0], fx[1])] as StarTMFaixa) : ref.faixas;
    const so = subIntervalos(geoC.int, fxo);
    if (!so.length) return null;
    const dPerf = Math.min(...so.filter((q) => Math.abs(q.zA - q.zB) > 1e-6).map((q) => Math.min(q.xa, q.xb)));
    const sobre = ref.tipo === "desbInt" ? Math.max(0, ref.p.u ?? 0.3) : 0;
    return isFinite(dPerf) ? { dMin: Math.max(0.5, dPerf - sobre), nome: "OP " + nRs } : null;
  };
  // VÁRIAS operações (interno): vale o MAIOR furo que alguma delas já abriu
  const perfilRestoInt = (opAtual: StarTMOp, geoC: StarTMGeo, espH2: boolean): { dMin: number; nome: string } | null => {
    const rs = listaRs(opAtual).map((n) => restoIntUm(n, opAtual, geoC, espH2)).filter((r): r is { dMin: number; nome: string } => !!r);
    if (!rs.length) return null;
    return { dMin: Math.max(...rs.map((r) => r.dMin)), nome: rs.map((r) => r.nome).join(" + ") };
  };
  const gerarOpLinhasBase = (opIn: StarTMOp, canal: "H1" | "H2"): string[] => {
    const espH2 = canal === "H2" && !h2NaFrente;
    const geo = espH2 ? geoEspH2 : geoBaseStar;
    const op: StarTMOp = espH2 && (opIn.faixas.length || opIn.p.zp0 !== undefined) ? { ...opIn, p: opIn.p.zp0 !== undefined ? { ...opIn.p, zp0: sFH2 - opIn.p.zp0 } : opIn.p, faixas: opIn.faixas.map((fx) => [sFH2 - Math.max(fx[0], fx[1]), sFH2 - Math.min(fx[0], fx[1])] as StarTMFaixa) } : opIn;
    const lines: string[] = [];
    const p = op.p;
    const fxs = op.faixas.length ? op.faixas : faixaPadraoStar(op.tipo, geo, p, espH2 ? undefined : op.cab) || [];
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
    const zCoord = (zGeo: number) => (canal === "H2" ? (espH2 ? geoBaseStar.zFront - zGeo - deslH2 : zH2(zGeo)) : zH1(zGeo));
    const dzBruto = canal === "H2" ? 0 : Math.max(0, cfg.brutoDz ?? 0); // H1: a face do bruto pode estar à frente do zero
    const zFrontClear = zCoord(canal === "H2" && !espH2 ? geo.zBack : geo.zFront) - Math.max(1, aprox) - dzBruto;

    // Impossibility guards: comment out instead of emitting colliding toolpath
    if (op.tipo === "furo") {
      const dBroca = p.d ?? 0;
      if (dBroca <= 0) {
        lines.push(`(PENDENCIA: ${desc} - INFORMAR DIAMETRO DA BROCA - OPERACAO COMENTADA)`);
        return lines;
      }
      // menor Ø interno DENTRO da região da furação (não o menor furo da peça inteira)
      const dLimFuro = (() => { let mm = Infinity; for (const q of geo.int) { if (Math.abs(q.zA - q.zB) < 1e-6) continue; const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB); for (const fr of (op.faixas || [])) { const a = Math.max(lo, Math.min(fr[0], fr[1])), b = Math.min(hi, Math.max(fr[0], fr[1])); if (b - a < 1e-6) continue; const xz = (z: number) => q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa); mm = Math.min(mm, xz(a), xz(b)); } } return isFinite(mm) ? mm : geo.intDmin; })();
      if (dLimFuro > 0 && dBroca > dLimFuro + 0.05) {
        lines.push(`(PENDENCIA: ${desc} - BROCA D${fmt(dBroca)} MAIOR QUE FURO D${fmt(dLimFuro)} - OPERACAO COMENTADA)`);
        return lines;
      }
    }
    if (op.tipo === "desbInt" || op.tipo === "acabInt" || op.tipo === "canalInt" || op.tipo === "roscaInt") {
      if (!geo.int.length || !subIntervalos(geo.int, fxs).length) {
        lines.push(`(PENDENCIA: ${desc} - SEM PERFIL INTERNO NA REGIAO - OPERACAO COMENTADA)`);
        return lines;
      }
      const dSegChk = (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin; // furo já aberto (pré-furo da operação anterior) vale para TODAS as internas
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

    const acionada = (p.acionada ?? 0) === 1 || op.tipo === "furoRadial" || op.tipo === "furoAxial" || op.tipo === "fresaFaces"; // ferramenta acionada (M36 / G98 mm/min)
    ferramentasUsadas.push({ tNum, desc, vu: Math.round(p.vu ?? 500) });
    lines.push("T" + tNum + "00(" + desc + ")");
    lines.push("/M25");

    if (op.tipo === "face") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      // Z do programa: o lado de FORA (sobremetal) é o MENOR Z — vale para o H1 (face da frente) e o H2 (face do corte)
        const zcIniF = zCoord(zIni), zcFimF = zCoord(zFim);
      const restoF = perfilRestoExt(opIn, canal, geo, espH2);
        if (restoF) lines.push("(RESTO DA " + restoF.nome + ": FACEIA A PARTIR DO D QUE ELA DEIXOU)");
        const xi = (p.xi ?? 0) > 0 ? p.xi : restoF ? Math.min(bD + 1, restoF.nivel(geo.zFront - 0.01) + 1) : bD + 1;
      const xf = p.xf !== undefined ? p.xf : -1.6;
      const apFace = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
      emitSpindle(lines, p, bD, 0, acionada);
      const zEndS = Math.max(zcIniF, zcFimF);
        const zStartS0 = Math.abs(zcIniF - zcFimF) < 0.001 ? zEndS - (p.sobre ?? 0.5) : Math.min(zcIniF, zcFimF);
      // BRUTO: faceamento da frente começa na face do bruto (não corta tudo de uma vez)
      const zStartS = dzBruto > 0 && Math.abs(zFim - geo.zFront) < 1e-3 ? Math.min(zStartS0, zCoord(geo.zFront) - dzBruto) : zStartS0;
      if (zStartS < zStartS0 - 1e-6) lines.push("(FACEIA A PARTIR DA FACE DO BRUTO - " + fmt(dzBruto) + " MM A FRENTE DO ZERO)");
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
      if (op.tipo === "desbExt") { const [aX, bX] = pontosXZ(p, fxs); const sX = cortarIntervalosXZ(s, aX, bX); if (sX !== s) { lines.push(msgXZ(p)); s = sX; } } // X de começo / fim (acabamento já faz pelo cortarPerfilPontos)
      s = estenderIntervalos(s, p, false); // ESTENDER início / fim do percurso
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbExt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, false, real).pts, angM), p.rp ?? 0.4, false);
        const zStartS = zCoord(pts[0].z) - aprox;
        const xSai = Math.max(bD + 1, pts[pts.length - 1].x + 1);
          // RESTO (acabamento): chega em G0 só 0,5 mm acima do que a operação indicada deixou (0 = do bruto)
          const restoA = op.tipo === "acabExt" ? perfilRestoExt(opIn, canal, geo, espH2) : null;
          let xChegada = bD + 1;
          if (restoA) {
            let mxA = pts[0].x;
            for (let zz = pts[0].z; zz >= pts[pts.length - 1].z - 1e-9; zz -= 0.05) mxA = Math.max(mxA, restoA.nivel(zz));
            xChegada = Math.min(bD + 1, mxA + 0.5);
            lines.push("(RESTO DA " + restoA.nome + ": CHEGA EM G0 PERTO DO QUE ELA DEIXOU)");
          }
        emitSpindle(lines, p, bD, 0, acionada);
        if (zStartS > zFrontClear + 1e-4) {
          g0Inicial(xChegada, zFrontClear);
          lines.push("G0Z" + fmt(zStartS));
        } else {
          g0Inicial(xChegada, zStartS);
        }

        const chave = JSON.stringify(fxs);
        if (op.tipo === "desbExt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1.5) > 0 ? p.ap : 1.5);
          // REBAIXOS / MERGULHOS (mesma regra consolidada da TBSy): "Entrar nos rebaixos = 1" -> depois do desbaste por fora
          // (com ou sem ciclo) desbasta os rebaixos entrando pela rampa já usinada, sempre no sentido do cabeçote,
          // respeitando o ângulo da pastilha e o raio da ponta. O que a pastilha não alcança fica para o bedame.
          const fazerRebaixos = () => {
            if (p.real !== 1) return;
          const iniRb = lines.length; // limpeza no fim: tira G0 repetido / para onde já está
            const angR = (p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27;
            const rpR = p.rp ?? 0.4;
            const alvo = compensarRaio(limitaMergulho(perfilMono(s, false, true).pts, angR), rpR, false);
            const env = compensarRaio(perfilMono(s, false, false).pts, rpR, false);
            const U = Math.max(0, p.u ?? 0.4);
            const Wd = Math.max(0, p.w ?? 0.1);
            const fR = p.f ?? 0.25;
            const valEm = (lst: { x: number; z: number }[], z: number) => {
              let v = -Infinity;
              for (let i = 0; i < lst.length - 1; i++) {
                const a = lst[i], b = lst[i + 1];
                const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
                if (z < lo - 1e-9 || z > hi + 1e-9) continue;
                v = Math.max(v, hi - lo < 1e-9 ? Math.max(a.x, b.x) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
              }
              return v;
            };
            const comSobre = (lst: { x: number; z: number }[], z: number) => {
              let m = -Infinity;
              [-Wd, -Wd / 2, 0, Wd / 2, Wd].forEach((dz) => { m = Math.max(m, valEm(lst, z + dz)); });
              return m + U;
            };
            const passo = 0.02;
            const zS0 = s[0].zA, zFimR = s[s.length - 1].zB;
            const ZG: number[] = [];
            for (let z = zS0; z >= zFimR - 1e-9 && ZG.length < 20000; z -= passo) ZG.push(z);
            const TA = ZG.map((z) => comSobre(alvo, z));
            const MA = ZG.map((z) => comSobre(env, z));
            const dAp = Math.max(0.02, 2 * apDesb);
            const r1 = Math.min(1, dAp * 0.8);
            const xSafe = bD + 1;
            const rebs: [number, number][] = [];
            let ini = -1;
            ZG.forEach((_z, i) => {
              const fundo = TA[i] < MA[i] - 0.02;
              if (fundo && ini < 0) ini = i;
              if ((!fundo || i === ZG.length - 1) && ini >= 0) { rebs.push([ini, fundo ? i : i - 1]); ini = -1; }
            });
            if (rebs.length) lines.push("(MERGULHO LIMITADO A " + fmt(angR) + " GRAUS - O QUE A PASTILHA NAO ALCANCA SOBRA PARA O BEDAME)");
            rebs.forEach(([i0, i1], ir) => {
              const idx: number[] = [];
              for (let i = i0; i <= i1; i++) idx.push(i);
              const topo = Math.max(...idx.map((i) => MA[i]));
              const fundoMin = Math.min(...idx.map((i) => TA[i]));
              lines.push("(REBAIXO " + (ir + 1) + " Z" + fmt(zCoord(ZG[i0])) + " A Z" + fmt(zCoord(ZG[i1])) + " - ENTRA PELA RAMPA, SEMPRE NO SENTIDO DO CABECOTE)");
              if (ir === 0) { let hT0 = -Infinity; for (let i = 0; i <= i0; i++) hT0 = Math.max(hT0, MA[i] + 0.5); lines.push("G0X" + fmt(Math.min(xSafe, hT0))); } // só 0,5 mm acima do perfil já desbastado (sem subir até a barra)
              lines.push("G0Z" + fmt(zCoord(ZG[i0])));
              let curX = MA[i0] + 0.5;
              let curZi = i0;
              lines.push("G0X" + fmt(curX));
              let L = topo;
              let g = 0;
              while (g++ < 500 && L > fundoMin + 1e-6) {
                const prevL = L;
                L = Math.max(fundoMin, L - dAp);
                const runs: [number, number][] = [];
                let a = -1;
                idx.forEach((i, k) => {
                  const corta = TA[i] < L + 1e-6 && MA[i] > L + 1e-6; // inclui o próprio fundo (rebaixo mais raso que 1 passe também é cortado)
                  if (corta && a < 0) a = i;
                  if ((!corta || k === idx.length - 1) && a >= 0) { runs.push([a, corta ? i : i - 1]); a = -1; }
                });
                runs.forEach(([ia, ib]) => {
                  let ie = ia;
                  let gIe = 0;
                  while (gIe++ < 500 && ie - 1 >= i0 && TA[ie - 1] < prevL - 1e-6) ie--;
                  if (ie - 1 >= i0) ie--;
                  const xEnt = Math.min(prevL, TA[ie]);
                  let H = Math.max(prevL, curX);
                  for (let i = Math.min(curZi, ie); i <= Math.max(curZi, ie); i++) H = Math.max(H, TA[i] + 0.5);
                  H = Math.min(H, xSafe);
                  lines.push("G0X" + fmt(H));
                  lines.push("G0Z" + fmt(zCoord(ZG[ie])));
                  lines.push("G0X" + fmt(xEnt + 0.2));
                  lines.push("G1X" + fmt(xEnt) + "F" + fmt(fR));
                  const ramp: { x: number; z: number }[] = [{ x: xEnt, z: ZG[ie] }];
                  for (let i = ie + 1; i <= ia; i++) ramp.push({ x: Math.max(L, Math.min(prevL, TA[i])), z: ZG[i] });
                  ramp.push({ x: L, z: ZG[ia] });
                  const rs: { x: number; z: number }[] = [];
                  ramp.forEach((q) => {
                    if (rs.length >= 2) {
                      const u = rs[rs.length - 2], v = rs[rs.length - 1];
                      if (Math.abs((v.x - u.x) * (q.z - u.z) - (v.z - u.z) * (q.x - u.x)) < 1e-4) rs.pop();
                    }
                    rs.push(q);
                  });
                  for (let k = 1; k < rs.length; k++) lines.push("G1X" + fmt(rs[k].x) + "Z" + fmt(zCoord(rs[k].z)));
                  lines.push("G1Z" + fmt(zCoord(ZG[ib])));
                  curX = Math.min(L + r1, prevL);
                  curZi = ib;
                  lines.push("G0X" + fmt(curX) + "(SOBE EM G0 - AREA JA USINADA)");
                });
              }
              {
            // sai do rebaixo só até 0,5 mm acima do perfil JÁ DESBASTADO até o próximo rebaixo (igual ao H1, sem subir até a barra)
            const prox = rebs[ir + 1];
            if (prox) {
              let hT = -Infinity;
              for (let i = i0; i <= prox[0]; i++) hT = Math.max(hT, MA[i] + 0.5);
              lines.push("G0X" + fmt(Math.min(xSafe, hT)) + "(SAI DO REBAIXO - VAI PARA O PROXIMO)");
            } else lines.push("G0X" + fmt(xSafe) + "(SAI DO REBAIXO POR CIMA)");
          }
            });
            {
            let cx: number | null = null, cz: number | null = null;
            const novas: string[] = [];
            for (const l of lines.slice(iniRb)) {
              const m0 = /^G0(X(-?[\d.]+))?(Z(-?[\d.]+))?(\(.*\))?$/.exec(l);
              if (m0 && (m0[2] !== undefined || m0[4] !== undefined)) {
                const nx = m0[2] !== undefined ? parseFloat(m0[2]) : cx, nz = m0[4] !== undefined ? parseFloat(m0[4]) : cz;
                if (nx !== null && nz !== null && cx !== null && cz !== null && Math.abs(nx - cx) < 1e-4 && Math.abs(nz - cz) < 1e-4 && !m0[5]) continue;
                cx = nx; cz = nz; novas.push(l); continue;
              }
              const mx = /X(-?[\d.]+)/.exec(l), mz = /Z(-?[\d.]+)/.exec(l);
              if (/^G[01]/.test(l)) { if (mx) cx = parseFloat(mx[1]); if (mz) cz = parseFloat(mz[1]); }
              novas.push(l);
            }
            lines.splice(iniRb, lines.length - iniRb, ...novas);
          }
        };
          if (op.ciclo) {
            const n1 = nIdx * 100;
            const n2 = n1 + 50;
            nIdx++;
            ciclosH1["E" + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
            lines.push("G71U" + fmt(apDesb) + "R0.5");
            lines.push("G71P" + n1 + "Q" + n2 + "U" + fmt(p.u ?? 0.4) + "W" + fmt(-(p.w ?? 0.1)) + "F" + fmt(p.f ?? 0.25));
            const fAc = acabExtOp ? acabExtOp.p.f ?? 0.1 : 0.1;
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", fAc, { n1, n2, xSaida: xSai });
            fazerRebaixos();
          } else {
            const uOff = Math.max(0, p.u ?? 0.4);
            const wOff = Math.max(0, p.w ?? 0.1);
            const rawMono = perfilMono(s, false, false).pts;
            const rawOff = rawMono.map((q) => ({ x: q.x + uOff, z: q.z + wOff }));
            const compOff = compensarRaio(rawOff, p.rp ?? 0.4, false);
            const xMin = Math.min(...compOff.map((q) => q.x), ...rawOff.map((q) => q.x));
            // degraus retos da peça (+ sobremetal): o passe PARA neles (ex.: Ø28,4 + 0,4 = Ø28,8), igual à TBSy
            const platE = Array.from(new Set(compOff.filter((q, k) => k < compOff.length - 1 && Math.abs(compOff[k + 1].x - q.x) < 2e-3 && Math.abs(compOff[k + 1].z - q.z) > 0.05).map((q) => Math.round(q.x * 1000) / 1000)));
            const restoE = perfilRestoExt(opIn, canal, geo, espH2);
            if (restoE) lines.push("(RESTO DA " + restoE.nome + ": SO CORTA O MATERIAL QUE ELA DEIXOU)");
            let xp = restoE ? Math.min(bD, Math.max(...Array.from({ length: 200 }, (_, i) => restoE.nivel(pts[0].z - ((pts[0].z - pts[pts.length - 1].z) * i) / 199)))) + 2 * Math.max(0.05, (p.ap ?? 1.5) > 0 ? p.ap : 1.5) - 1e-6 : bD;
            if (restoE) xp = Math.min(bD, xp);
            let gXp = 0;
            while (gXp++ < 1000 && xp > xMin + 1e-6) {
              let nx = Math.max(xMin, xp - 2 * apDesb);
              const plS = platE.filter((pv) => pv < xp - 1e-6 && pv > nx + 1e-6);
              if (plS.length) nx = Math.max(...plS);
              if (nx >= xp - 1e-6) break;
              xp = nx;
              const zlComp = zOndeAlvo(compOff, xp + 0.005, false); // tolerância: o passe no diâmetro reto (+ sobremetal) vai até o fim do degrau, não para no começo dele
              const zlRaw = zOndeAlvo(rawOff, xp + 1e-6, false);
              const zl = Math.max(zlComp, zlRaw);
              if (zl >= pts[0].z - 1e-4) continue;
              const xRet = Math.min(bD + 1, xp + Math.min(2 * apDesb, 1.5));
              const zEndS = zCoord(zl);
              if (restoE) {
                // RESTO: só onde a operação de referência deixou material acima deste passe (o resto já está limpo)
                const trechos: [number, number][] = [];
                let zA: number | null = null, zUlt = pts[0].z;
                for (let zz = pts[0].z; zz >= zl - 1e-9; zz -= 0.05) {
                  const tem = restoE.nivel(zz) > xp + 0.01;
                  if (tem && zA === null) zA = Math.min(pts[0].z, zz + 0.05);
                  if (!tem && zA !== null) { trechos.push([zA, zz]); zA = null; }
                  zUlt = zz;
                }
                if (zA !== null) trechos.push([zA, zl]);
                void zUlt;
                trechos.forEach(([ta, tb]) => {
                  const zIniT = Math.max(zStartS, zCoord(ta) - 0.5); // chega em G0 0,5 mm antes do material que sobrou
                  lines.push("G0Z" + fmt(zIniT));
                  lines.push("G0X" + fmt(xp));
                  lines.push("G1Z" + fmt(zCoord(tb)) + "F" + fmt(p.f ?? 0.25));
                  lines.push("G1X" + fmt(xRet) + "Z" + fmt(zCoord(tb) - 0.5));
                });
                if (trechos.length) lines.push("G0Z" + fmt(zStartS));
                continue;
              }
              lines.push("G0X" + fmt(xp));
              lines.push("G1Z" + fmt(zEndS) + "F" + fmt(p.f ?? 0.25));
              lines.push("G1X" + fmt(xRet) + "Z" + fmt(zEndS - 0.5));
              lines.push("G0Z" + fmt(zStartS));
            }
            fazerRebaixos();
          }
        } else {
          const c = ciclosH1["E" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            const ptsAc = cortarPerfilPontos(pts, (p.xI ?? 0) > 0 ? { x: p.xI, z: Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1]))) } : undefined, (p.xF ?? 0) > 0 ? { x: p.xF, z: Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1]))) } : undefined);
              const zHiAc = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
              // clicou FORA da peça (no ar): a ferramenta chega em G0 exatamente ali, sem tocar, e entra em G1 no perfil
              const cliqueFora = (p.xI ?? 0) > 0 && p.xI / 2 > rPecaExtStar(geo, zHiAc) + 0.01;
              if ((cliqueFora || ptsAc !== pts) && ptsAc.length >= 2) {
                // começa EXATAMENTE no ponto escolhido: chega em G0 0,5 mm fora da peça (do lado livre) e entra em G1
                const apA = cliqueFora ? { x: p.xI, z: zHiAc } : aproximacaoExternaStar(ptsAc, geo);
                lines.push("(COMECA NO PONTO ESCOLHIDO X" + fmt(apA.x) + " Z" + fmt(zCoord(apA.z)) + " - TERMINA X" + fmt(ptsAc[ptsAc.length - 1].x) + " Z" + fmt(zCoord(ptsAc[ptsAc.length - 1].z)) + ")");
                lines.push("G0Z" + fmt(zCoord(apA.z)));
                lines.push("G0X" + fmt(apA.x));
                lines.push("G1X" + fmt(ptsAc[0].x) + "Z" + fmt(zCoord(ptsAc[0].z)) + "F" + fmt(p.f ?? 0.1));
                emitirContornoArcos(lines, ptsAc, zCoord, fmt, "fanuc", p.f ?? 0.1, { xSaida: xSai, emitStart: false });
              } else {
                emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.1, { xSaida: xSai });
              }
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
          const restoCI = perfilRestoInt(opIn, geo, espH2);
          if (restoCI) lines.push("(RESTO DA " + restoCI.nome + ": CANAL INTERNO A PARTIR DO D" + fmt(restoCI.dMin) + ")");
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
            if (restoCI && restoCI.dMin - 0.5 > xStart) lines.push("G0X" + fmt(restoCI.dMin - 0.5)); // RESTO: rápido até 0,5 mm do Ø já aberto
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
          planos.forEach((pl, ip) => {
            // SEM CICLO (mesma regra consolidada da TBSy): segue o perfil, só onde tem material que sobrou,
            // bedame com lado de referência, sobremetal X/Z, incremento por passada, pica-pau, anda em Z sempre no X maior
            // e respeita o ponto de aproximação X/Z digitado na operação
            if (!op.ciclo) {
              const cc = canais[ip];
              if (!cc) return;
              const Lb = larg;
              const ladoEsq = p.ref === 1;
              const sx = p.sx ?? 0.2;
              const sz = p.sz ?? 0.1;
              const inc = (p.inc ?? 0) > 0 ? p.inc : Math.max(Lb * 0.8, 0.1);
              const xiq = (q: { zA: number; zB: number; xa: number; xb: number }, zz: number) => (q.zA - q.zB < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((q.zA - zz) / (q.zA - q.zB)) * (q.xb - q.xa));
              const maxEntre = (zL: number, zR: number) => {
                let mm = 0;
                if (zL < geo.zBack - largCorte - 1e-6) mm = bD;
                for (const q of geo.ext) {
                  const a = Math.min(zR, q.zA);
                  const b = Math.max(zL, q.zB);
                  if (a - b < 1e-3) continue; // só encostando na lateral do bedame (sobremetal Z = 0) não é material
                      // FACE (linha em pé) só encostando na lateral do bedame não é material (sobremetal Z = 0 encosta na face)
                      if (Math.abs(q.zA - q.zB) < 1e-6 && (q.zA >= zR - 1e-3 || q.zA <= zL + 1e-3)) continue;
                  mm = Math.max(mm, xiq(q, a), xiq(q, b));
                }
                return mm;
              };
              const zProg = (zR: number) => (ladoEsq ? zR - Lb : zR);
              const xSeg = pl.xSeg;
              let zIniR = cc.zStart;
              const naTraseira = Math.abs(cc.zEnd - geo.zBack) < 1e-3;
              let zFimR = Math.min(cc.zStart, naTraseira ? Math.max(cc.zEnd, geo.zBack - largCorte + Lb + sz) : cc.zEnd + Lb);
                  // ONDE O BEDAME CABE DE VERDADE: a região pode incluir chanfros/raios na boca do canal.
                  // Anda da ponta para dentro enquanto o "fundo alcançável" desce; para no 1º ponto em que a lateral do bedame
                  // encosta na parede (ex.: canal de 2,0 com bedame de 2,0 -> uma posição só, encostada nas duas paredes)
                  const acharPonta = (fn: (z: number) => number, zDe: number, zAte: number) => {
                    const st = zAte < zDe ? -0.01 : 0.01;
                    let z = zDe, v = fn(z), gA = 0, best = zDe, bv = v, desceu = false;
                    while (gA++ < 5000) {
                      const nz = z + st;
                      if ((st < 0 && nz < zAte - 1e-9) || (st > 0 && nz > zAte + 1e-9)) break;
                      const nv = fn(nz);
                      if (nv > v + 1e-4) break; // começou a subir: passou do fundo
                      if (desceu && nv > v - 1e-4) break; // 1º PATAMAR depois de descer (degrau ou fundo): começa ali
                      z = nz; v = nv;
                      if (nv < bv - 1e-4) { bv = nv; best = nz; desceu = true; }
                    }
                    return Math.round(best * 1000) / 1000;
                  };
                  const zIniOrig = zIniR, zFimOrig = zFimR;
                  // o DESBASTE do canal passa pela região inteira (cada posição só até onde o bedame cabe: chanfro, degrau, fundo);
                  // o fundo exato e os chanfros ficam para o acabamento
                  if (!naTraseira && zIniR > zFimR) {
                    const fSob = (zR: number) => maxEntre(zR - Lb - sz, zR + sz);
                    const zA1 = acharPonta(fSob, zIniR, zFimR), zB1 = acharPonta(fSob, zFimR, zIniR);
                    if (zA1 >= zB1) { zIniR = zA1; zFimR = zB1; } else { const zMeio = fSob(zA1) <= fSob(zB1) ? zA1 : zB1; zIniR = zMeio; zFimR = zMeio; }
                  }
              const posR: number[] = [];
              let gPos = 0;
              // no lado do corte: os passos normais vão só até o bedame encostar no fim da peça;
              // só a ÚLTIMA posição entra na largura do corte (onde ainda tem barra)
              const zLimNormal = naTraseira ? Math.max(zFimR, Math.min(cc.zStart, cc.zEnd + Lb)) : zFimR;
              for (let zz = zIniR; gPos++ < 5000 && zz > zLimNormal + 1e-6; zz -= inc) posR.push(zz);
              if (zLimNormal > zFimR + 1e-6) posR.push(zLimNormal);
              posR.push(zFimR);
                  const candW: number[] = [];
              // posições ENCOSTADAS nas faces (parede + sobremetal Z): o bedame começa colado na face, sem invadir
              // (ex.: face em Z13,7 + 0,1 -> bedame de 4 mm ocupa Z13,8 a Z17,8)
              geo.ext.forEach((q) => {
                if (Math.abs(q.zA - q.zB) > 0.02) return;
                const zw = q.zA;
                [zw - sz - 0.002, zw + Lb + sz + 0.002, zw - sz, zw + Lb + sz].forEach((zc) => { if (zc <= zIniR + 1e-6 && zc >= zFimR - 1e-6) candW.push(zc); });
              });
              // paredes que aparecem como "degrau" entre dois trechos (o Ø muda no mesmo Z) também viram posição encostada
                  for (let iw = 0; iw + 1 < geo.ext.length; iw++) {
                    const q1 = geo.ext[iw], q2 = geo.ext[iw + 1];
                    if (Math.abs(q1.zB - q2.zA) > 1e-6 || Math.abs(q1.xb - q2.xa) < 0.05) continue;
                    const zw = q1.zB;
                    [zw - sz, zw + Lb + sz].forEach((zc) => { if (zc <= zIniR + 1e-6 && zc >= zFimR - 1e-6) candW.push(zc); });
                  }
                  // MERGULHOS = INCREMENTO POR PASSADA no trajeto escolhido. Encostado em parede só entra se o incremento deixaria
                  // material grosso para o acabamento (> 1 mm no Ø) ou se o bedame não alcançaria aquele fundo
                  {
                    const dEm = (zR: number) => maxEntre(zR - Lb - sz, zR + sz);
                    const melhorEm = (zg: number, lst: number[]) => { let m = Infinity; for (const zp of lst) if (zg <= zp + 1e-6 && zg >= zp - Lb - 1e-6) m = Math.min(m, dEm(zp)); return m; };
                    candW.sort((a1, b1) => b1 - a1).forEach((zc) => {
                      const dc = dEm(zc);
                      let precisa = false;
                      for (let s = 1; s < 20 && !precisa; s++) { const zg = zc - (Lb * s) / 20; if (melhorEm(zg, posR) > dc + 1.0) precisa = true; }
                      if (precisa) posR.push(zc);
                    });
                  }
                  posR.sort((pa, pb) => pb - pa);
              const posU = posR.filter((zp, k) => k === 0 || Math.abs(zp - posR[k - 1]) > 0.01);
              const passoX = (p.pk ?? 0) > 0 ? 2 * p.pk : 1e9;
              const fz = p.f ?? 0.05;
              // MATERIAL QUE SOBROU: nível em cada Z depois das operações anteriores (desbaste/acabamento externos do mesmo cabeçote)
              const iOp = ativos.indexOf(op);
              const antes = ativos.slice(0, iOp > 0 ? iOp : 0).filter((o) => (o.tipo === "desbExt" || o.tipo === "acabExt") && (o.cab ?? "H1") === canal);
              const valEmP = (lst: { x: number; z: number }[], z: number) => {
                let vv = -Infinity;
                for (let i = 0; i < lst.length - 1; i++) {
                  const a = lst[i], b = lst[i + 1];
                  const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
                  if (z < lo - 1e-9 || z > hi + 1e-9) continue;
                  vv = Math.max(vv, hi - lo < 1e-9 ? Math.max(a.x, b.x) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
                }
                return vv;
              };
              const perfisAntes = antes.map((o) => {
                const po = o.p;
                const fxo0 = o.faixas.length ? o.faixas : faixaPadraoStar(o.tipo, geoBaseStar, po, o.cab) || [];
                  const fxo = espH2 ? fxo0.map((fx) => [sFH2 - Math.max(fx[0], fx[1]), sFH2 - Math.min(fx[0], fx[1])] as StarTMFaixa) : fxo0; // H2: peça virada
                const so = subIntervalos(geo.ext, fxo);
                if (!so.length) return null;
                const realO = po.real === 1;
                const angO = realO ? ((po.ang ?? 0) > 0 ? po.ang : PASTILHA_ANG[po.pas ?? 2] ?? 27) : 90;
                const ptsO = compensarRaio(limitaMergulho(perfilMono(so, false, realO).pts, angO), po.rp ?? 0.4, false);
                // o sobremetal deixado pelo desbaste é do acabamento: para o canal conta como já usinado até o sobremetal do canal
                const sobre = o.tipo === "desbExt" ? Math.min(Math.max(0, po.u ?? 0.4), sx) : 0;
                return { ptsO, sobre, zMax: Math.max(...so.map((q) => q.zA)), zMin: Math.min(...so.map((q) => q.zB)) };
              }).filter((x): x is { ptsO: { x: number; z: number }[]; sobre: number; zMax: number; zMin: number } => !!x);
              const restoC = perfilRestoExt(opIn, canal, geo, espH2);
                  if (restoC) lines.push("(RESTO DA " + restoC.nome + ": CANAL SO ONDE ELA DEIXOU MATERIAL)");
                  const nivelBase = (z: number) => {
                let n = bD;
                for (const pa of perfisAntes) {
                  if (z > pa.zMax + 1e-6 || z < pa.zMin - 1e-6) continue;
                  const vv = valEmP(pa.ptsO, z);
                  if (vv > -Infinity) n = Math.min(n, vv + pa.sobre);
                }
                return n;
              };
              const nivel = (z: number) => (restoC ? restoC.nivel(z) : bD); // RESTO = 0 -> sempre do BRUTO (a barra). Só olha outra operação quando o nº dela é informado
                  void nivelBase;
                  const nivelSpan = (zR: number) => {
                let n = -Infinity;
                for (let zz = zR - Lb - sz; zz <= zR + sz + 1e-9; zz += 0.05) n = Math.max(n, nivel(zz));
                return n;
              };
              const uteis = posU.filter((zR) => nivelSpan(zR) > maxEntre(zR - Lb - sz, zR + sz) + sx + 0.05);
              if (!uteis.length) { lines.push("(CANAL Z" + fmt(zCoord(zIniR)) + " A Z" + fmt(zCoord(zFimR)) + ": NADA PARA CORTAR - JA USINADO)"); return; }
              lines.push("(CANAL SEM CICLO - BEDAME L" + fmt(Lb) + " - REFERENCIA LADO " + (ladoEsq ? "2" : "1 - FRENTE") + " - SOBREMETAL X" + fmt(sx) + " Z" + fmt(sz) + ")");
              const apX = (p.ax ?? 0) > 0 ? Math.max(p.ax, xSeg) : bD + 1;
              const apZ = (p.ax ?? 0) > 0 && p.az !== undefined ? p.az : zCoord(zProg(uteis[0]));
              if (primeiroMov) {
                primeiroMov = false;
                if (apZ > zFrontClear + 1e-4) { g0Inicial(apX, zFrontClear); lines.push("G0Z" + fmt(apZ)); } else g0Inicial(apX, apZ);
              } else {
                lines.push("G0X" + fmt(apX));
                lines.push("G0Z" + fmt(apZ));
              }
              const xSegC = Math.max(xSeg, bD + 1); // X seguro do canal nunca abaixo da barra
              lines.push("G0X" + fmt(Math.max(xSegC, nivelSpan(uteis[0]) + 1.0)));
              uteis.forEach((zR, kU) => {
                const d = maxEntre(zR - Lb - sz, zR + sz) + sx;
                lines.push("G0Z" + fmt(zCoord(zProg(zR))) + "(ANDA EM Z SEMPRE NO X MAIOR)");
                let x = nivelSpan(zR) + 1.0; // G0 até 1 mm (no X) acima do material que sobrou, depois G1
                lines.push("G0X" + fmt(x));
                let gPk = 0;
                while (gPk++ < 2000 && x > d + 1e-6) {
                  const nx = Math.max(d, x - passoX);
                  lines.push("G1X" + fmt(nx) + "F" + fmt(fz));
                  if (nx >= x - 1e-6) break;
                  x = nx;
                  if (x > d + 1e-6) { lines.push("G0X" + fmt(x + 0.5) + "(PICA-PAU)"); lines.push("G1X" + fmt(x)); }
                }
                // sobe só 1 mm acima do material que ainda existe na próxima posição (o resto já foi usinado); no fim volta ao X seguro
                const zNx = uteis[kU + 1];
                lines.push("G0X" + fmt(zNx === undefined ? xSegC : Math.max(nivelSpan(zNx), d) + 1.0));
              });
              // PASSE DE ACABAMENTO NO PERFIL (bedame com a largura real): desce na parede 1, anda no fundo seguindo o perfil e sobe na parede 2
                  if ((p.acab ?? 0) === 1) {
                    const fa = p.fa ?? 0.03;
                    const fFin = (zR: number) => maxEntre(zR - Lb, zR);
                    let zA0 = zIniOrig, zB0 = zFimOrig;
                    if (!naTraseira && zA0 > zB0) {
                      const a1 = acharPonta(fFin, zIniOrig, zFimOrig), b1 = acharPonta(fFin, zFimOrig, zIniOrig);
                      if (a1 >= b1) { zA0 = a1; zB0 = b1; } else { const m1 = fFin(a1) <= fFin(b1) ? a1 : b1; zA0 = m1; zB0 = m1; }
                    } else { zA0 = zIniR; zB0 = zFimR; }
                    const fundoEm = (zR: number) => maxEntre(zR - Lb, zR);
                    // caminho do acabamento: CHANFRO/RAIO da boca (canto do bedame seguindo a peça) -> desce na parede 1 -> fundo -> sobe na parede 2 -> chanfro/raio do outro lado
                    const pf: { z: number; x: number }[] = [];
                    const eps = 0.002;
                    if (zIniOrig > zA0 + 0.01) {
                      for (let zR = zIniOrig; zR > zA0 + eps + 1e-9; zR -= 0.02) pf.push({ z: zR, x: fundoEm(zR) });
                      pf.push({ z: zA0, x: fundoEm(zA0 + eps) });
                    }
                    const nP = Math.max(1, Math.ceil(Math.abs(zA0 - zB0) / 0.05));
                    for (let k = 0; k <= nP; k++) { const zR = zA0 + ((zB0 - zA0) * k) / nP; pf.push({ z: zR, x: fundoEm(zR) }); }
                    if (zFimOrig < zB0 - 0.01) {
                      pf.push({ z: zB0, x: fundoEm(zB0 - eps) });
                      for (let zR = zB0 - eps; zR > zFimOrig - 1e-9; zR -= 0.02) pf.push({ z: zR, x: fundoEm(zR) });
                      pf.push({ z: zFimOrig, x: fundoEm(zFimOrig) });
                    }
                    // SEM INVADIR: entre dois pontos, se no meio a peça "sobe" acima da reta (parede/canto), anda em degrau pelo X maior
                    {
                      const pfS: { z: number; x: number }[] = [];
                      for (let i = 0; i < pf.length; i++) {
                        const q = pf[i];
                        if (i > 0) {
                          const a0 = pf[i - 1];
                          if (Math.abs(q.z - a0.z) > 1e-6) {
                            let fMax = -Infinity, invade = false;
                            for (let s = 1; s < 8; s++) {
                              const zz = a0.z + ((q.z - a0.z) * s) / 8;
                              const fz = fundoEm(zz);
                              fMax = Math.max(fMax, fz);
                              if (fz > a0.x + ((q.x - a0.x) * s) / 8 + 0.002) invade = true;
                            }
                            if (invade) {
                              const h = Math.max(a0.x, q.x, fMax);
                              if (h > a0.x + 1e-4) pfS.push({ z: a0.z, x: h });
                              pfS.push({ z: q.z, x: h });
                            }
                          }
                        }
                        pfS.push(q);
                      }
                      pf.splice(0, pf.length, ...pfS);
                    }
                    const pr: { z: number; x: number }[] = [];
                    pf.forEach((q) => { if (pr.length && Math.abs(pr[pr.length - 1].z - q.z) < 1e-4 && Math.abs(pr[pr.length - 1].x - q.x) < 1e-4) return; if (pr.length >= 2) { const u = pr[pr.length - 2], v = pr[pr.length - 1]; if (Math.abs((v.x - u.x) * (q.z - u.z) - (v.z - u.z) * (q.x - u.x)) < 1e-4 && (v.x - u.x) * (q.x - v.x) + (v.z - u.z) * (q.z - v.z) > 0) pr.pop(); } pr.push(q); }); // só junta reta que continua no mesmo sentido (desce/sobe na parede fica)
                    { const [aX, bX] = pontosXZ(p, fxs, Lb); const prX = cortarPtsXZ(pr, aX, bX); if (prX !== pr && prX.length >= 2) { lines.push(msgXZ(p)); pr.splice(0, pr.length, ...prX); } } // X de começo / fim do contorno do canal (Z do fim = canto direito do bedame)
{ const eiL = Number(p.eiL) || 0, efL = Number(p.efL) || 0; const ang = (v: any) => (Math.max(0, Math.min(90, Number(v) || 0)) * Math.PI) / 180; if (eiL > 0 && pr.length) { const a = ang(p.eiA); const q = pr[0]; pr.unshift({ z: q.z + eiL * Math.cos(a), x: q.x + 2 * eiL * Math.sin(a) }); } if (efL > 0 && pr.length) { const a = ang(p.efA); const q = pr[pr.length - 1]; pr.push({ z: q.z - efL * Math.cos(a), x: q.x + 2 * efL * Math.sin(a) }); } } // ESTENDER início / fim do contorno do canal
const zPA = pr[0].z, zPB = pr[pr.length - 1].z;
                    const topoA = Math.max(nivelSpan(zPA), pr[0].x) + 0.5;
                    const topoB = Math.max(nivelSpan(zPB), pr[pr.length - 1].x) + 0.5;
                    lines.push("(ACABAMENTO DO CANAL NO PERFIL - BEDAME L" + fmt(Lb) + ")");
                    lines.push("G0Z" + fmt(zCoord(zProg(zPA))));
                    lines.push("G0X" + fmt(topoA));
                    lines.push("G1X" + fmt(pr[0].x) + "F" + fmt(fa));
                    for (let k = 1; k < pr.length; k++) lines.push("G1X" + fmt(pr[k].x) + "Z" + fmt(zCoord(zProg(pr[k].z))));
                    lines.push("G1X" + fmt(topoB));
                  }
                  lines.push("G0X" + fmt(xSegC));
              return;
            }
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
      // ROSCA: tipo (métrica / NPT / BSPT / BSP / UN), passo por fios/pol, altura pela norma, CONE pela região (sobe ou desce),
        // número de passadas com área constante, passes de acabamento (mola), entrada pelo flanco, DIREITA ou ESQUERDA (de trás para a frente)
        const tipoR = Math.round(p.nr ?? 0);
        const ang55 = tipoR === 2 || tipoR === 3;
        const passo = tipoR === 0 ? Math.max(0.2, p.passo ?? 1.5) : 25.4 / Math.max(1, p.tpi ?? 18);
        const hNorma = tipoR === 1 ? 0.8 * passo : ang55 ? 0.640327 * passo : passo * (interno ? 0.5413 : 0.6134);
        const h = (p.h ?? 0) > 0 ? p.h : hNorma;
        const nPR = Math.max(1, Math.round(p.np ?? 8));
        const nMola = Math.max(0, Math.min(99, Math.round(p.pm ?? 1)));
        const esquerda = Math.round(p.lh ?? 0) === 1;
        const dEmR = (z: number) => {
          for (const q of s) {
            const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB);
            if (hi - lo < 1e-9) continue;
            if (z >= lo - 1e-6 && z <= hi + 1e-6) return q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa);
          }
          return dNom;
        };
        // o CONE vem da LINHA MAIS LONGA da região (o flanco da rosca), não das pontas — chanfro ou raio no começo/fim não entortam a rosca
        let ivLongo: StarTMIntervalo | null = null;
        for (const q of s) { if (Math.abs(q.zA - q.zB) > 1e-9 && (!ivLongo || Math.abs(q.zA - q.zB) > Math.abs(ivLongo.zA - ivLongo.zB))) ivLongo = q; }
        const dLinhaR = (zg: number) => (ivLongo ? ivLongo.xa + ((zg - ivLongo.zA) / (ivLongo.zB - ivLongo.zA)) * (ivLongo.xb - ivLongo.xa) : dEmR(zg));
        const dIniR = dLinhaR(zIni), dFimR = dLinhaR(zFim);
        const nEnt = Math.max(1, Math.min(9, Math.round(p.ne ?? 1)));
        const avancoR = passo * nEnt; // F = passo x nº de entradas
        const usaQ = nEnt > 1 && Math.round(p.se ?? 0) === 1; // entradas no MESMO ponto, separadas pelo ângulo Q (só G92: o G76 fica desligado, nele o Q é a 1ª passada)
        const zcIR = zCoord(zIni), zcFR = zCoord(zFim);
        const kCone = Math.abs(zcFR - zcIR) > 1e-6 ? (dFimR - dIniR) / (zcFR - zcIR) : 0; // quanto o Ø muda por mm de Z
        const cone = Math.abs(kCone) > 1e-4;
        const dPerfilEm = (zProg: number) => dIniR + kCone * (zProg - zcIR);
        const sgR = interno ? 1 : -1;
        const xStartAuto = interno ? Math.max(2, (p.d0 ?? 0) > 0 ? p.d0 - 2 : Math.min(dIniR, dFimR) - 2) : Math.max(dIniR, dFimR) + 3;
        // Ø de recuo de cada passe: o usuário pode editar (0 = automático)
        const xStart = (p.xr ?? 0) > 0 ? p.xr : xStartAuto;
        const xRecuoRuim = (p.xr ?? 0) > 0 && (interno ? p.xr > Math.min(dIniR, dFimR) - 0.2 : p.xr < Math.max(dIniR, dFimR) + 0.2);
        const rpmRosca = Math.round(p.rpm ?? (interno ? 600 : 800));
        const zEntry = zCoord(zIni) - aprox;
        // ESQUERDA: começa ATRÁS da rosca e corta para a frente. Folga atrás limitada pelo ressalto (não bate no degrau)
        let zIniCiclo = zEntry, zFimCiclo = zcFR;
        if (esquerda) {
          let zLimG = zFim - aprox;
          if (!interno) {
            for (let zg = zFim - 0.05; zg >= zFim - aprox - 1e-9; zg -= 0.05) {
              let m = 0;
              for (const q of geo.ext) {
                const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB);
                if (zg < lo - 1e-9 || zg > hi + 1e-9) continue;
                m = Math.max(m, hi - lo < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((zg - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa));
              }
              if (m > xStart - 0.5) { zLimG = zg + 0.3; break; }
            }
          }
          zIniCiclo = zCoord(Math.min(zFim - 0.05, zLimG));
          zFimCiclo = zcIR;
  // no G76 o próprio comando desloca pelo flanco (para trás): desconta para não passar do limite do ressalto
  if (op.ciclo) zIniCiclo = Math.max(zcFR + 0.05, zIniCiclo - h * Math.tan((27.5 * Math.PI) / 180));
        }
        const nomesR = ["METRICA", "NPT", "BSPT", "BSP", "UN"];
        lines.push("(ROSCA " + (esquerda ? "ESQUERDA " : "") + (nomesR[tipoR] || "METRICA") + " PASSO " + fmt(passo) + (tipoR > 0 ? " = " + fmt(p.tpi ?? 18) + " FIOS/POL" : "") + " ALTURA " + fmt(h) + (cone ? " CONICA " + ((interno ? -kCone : kCone) > 0 ? "SUBINDO" : "DESCENDO") : " PARALELA") + " - " + nPR + " PASSADAS + " + nMola + " ACAB." + (nEnt > 1 ? " - " + nEnt + " ENTRADAS, AVANCO " + fmt(avancoR) : "") + ")");
        if (esquerda && Math.abs(zIniCiclo - zcFR) < passo) lines.push("(ATENCAO: POUCA FOLGA ATRAS DA ROSCA ESQUERDA - " + fmt(Math.abs(zIniCiclo - zcFR)) + " MM - CONFERIR SAIDA)");
        if (xRecuoRuim) lines.push("(ATENCAO: O DE RECUO X" + fmt(xStart) + " ESTA DENTRO DO MATERIAL DA ROSCA - CONFERIR)");
        lines.push("G99G97S" + rpmRosca + "M3");
        if (interno) {
          g0FrontalSeguro(xStart, zEntry);
          if (esquerda) lines.push("G0Z" + fmt(zIniCiclo));
        } else {
          g0Inicial(Math.max(bD + 1, xStart), Math.min(zFrontClear, zEntry));
          if (esquerda) lines.push("G0Z" + fmt(zIniCiclo));
          else if (zEntry > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEntry));
          if (xStart < bD + 1) lines.push("G0X" + fmt(xStart));
        }
        const rConeEntre = (zS: number) => (cone ? (dPerfilEm(zS) - dPerfilEm(zFimCiclo)) / 2 : 0); // R = raio no início − raio no fim
        const dFinalCiclo = dPerfilEm(zFimCiclo) + sgR * 2 * h;
        // VÁRIAS ENTRADAS: cada entrada começa 1 passo deslocada em Z (para o lado livre), o avanço F = passo x entradas
        const ladoLivre = esquerda ? -1 : 1;
        for (let en = 0; en < nEnt; en++) {
          const zE = usaQ ? zIniCiclo : zIniCiclo - ladoLivre * en * passo;
          if (nEnt > 1) {
            lines.push("(ENTRADA " + (en + 1) + " DE " + nEnt + (usaQ ? " - ANGULO " + fmt((en * 360) / nEnt) + " GRAUS (Q)" : "") + ")");
            if (esquerda && en > 0 && !usaQ) lines.push("(ATENCAO: ENTRADA " + (en + 1) + " COMECA " + fmt(en * passo) + " MM MAIS ATRAS - CONFERIR FOLGA DO RESSALTO)");
            lines.push("G0Z" + fmt(zE));
          }
          if (op.ciclo && !usaQ) {
            // G76 (2 linhas): P mm rr aa = passes de acabamento / sem chanfro de saída / ângulo (55 = entrada pelo flanco)
            const q1 = h / Math.sqrt(nPR); // 1ª passada para dar exatamente o nº de passadas pedido (área constante)
            lines.push("G76P" + String(nMola).padStart(2, "0") + "00" + "55" + "Q50R0.02");
            lines.push("G76X" + fmt(dFinalCiclo) + "Z" + fmt(zFimCiclo) + (cone ? "R" + fmt(rConeEntre(zE)) : "") + "P" + Math.round(h * 1000) + "Q" + Math.round(q1 * 1000) + "F" + fmt(avancoR));
          } else {
            // G92 passada por passada (G92 faz CÔNICA com R): área constante + flanco modificado
            const angF = ((ang55 ? 27.5 : 30) - 1) * Math.PI / 180;
            const sentidoAvanco = Math.sign(zFimCiclo - zE) || 1;
            for (let kk = 1; kk <= nPR + nMola; kk++) {
              const prof = h * Math.sqrt(Math.min(kk, nPR) / nPR);
              const zS = esquerda ? zE + sentidoAvanco * (h - prof) * Math.tan(angF) : zE - sentidoAvanco * prof * Math.tan(angF);
              lines.push("G0Z" + fmt(zS));
              lines.push("G92X" + fmt(dPerfilEm(zFimCiclo) + sgR * 2 * prof) + "Z" + fmt(zFimCiclo) + (cone ? "R" + fmt(rConeEntre(zS)) : "") + "F" + fmt(avancoR) + (usaQ ? "Q" + Math.round((en * 360000) / nEnt) : ""));
            }
          }
        }
        if (esquerda && !interno) lines.push("G0X" + fmt(Math.max(bD + 1, xStart)));
        if (interno) lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "alargador") {
        // ALARGADOR: entra em G1 até o fundo e volta em G1 (não sai em rápido para não riscar o furo)
        const zIniA = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFimA = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const zEntryA = zCoord(zIniA) - aprox;
        lines.push("G99G97S" + Math.round(p.rpm ?? 400) + "M3");
        g0FrontalSeguro(0, zEntryA);
        lines.push("G1Z" + fmt(zCoord(zFimA)) + "F" + fmt(p.f ?? 0.1));
        lines.push("G1Z" + fmt(zEntryA) + "F" + fmt((p.fr ?? 0) > 0 ? p.fr : 2 * (p.f ?? 0.1)));
      } else if (op.tipo === "recartilhado") {
        // RECARTILHADO: penetra no Ø e anda em Z pela região
        const zIniK = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFimK = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const sK = subIntervalos(geo.ext, fxs);
        const dK = sK.length ? Math.max(...sK.map((q) => Math.max(q.xa, q.xb))) : geo.dMax;
        const zEK = zCoord(zIniK) - aprox;
        lines.push("G99G97S" + Math.round(p.rpm ?? 300) + "M3");
        g0Inicial(bD + 1, Math.min(zFrontClear, zEK));
        if (zEK > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zEK));
        lines.push("G0X" + fmt(dK + 0.5));
        lines.push("G1X" + fmt(dK - Math.max(0, p.pr ?? 0.3)) + "F" + fmt(p.fp ?? 0.05));
        lines.push("G1Z" + fmt(zCoord(zFimK)) + "F" + fmt(p.f ?? 0.15));
        lines.push("G0X" + fmt(bD + 1));
      } else if (op.tipo === "canalFrontal") {
        // CANAL FRONTAL (G74): ferramenta axial, referência na borda de FORA do canal
        const zIniF = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFimF = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const largF = Math.max(0.3, p.larg ?? 1.5);
        const dE = p.de ?? 12, dI = p.di ?? 8;
        const xFimF = Math.min(dE, dI + 2 * largF);
        const zEF = zCoord(zIniF) - aprox;
        lines.push("(CANAL FRONTAL D" + fmt(dE) + " A D" + fmt(dI) + " - FERRAMENTA L" + fmt(largF) + " REFERENCIA NA BORDA DE FORA - CONFERIR)");
        lines.push("G99G97S" + Math.round(p.rpm ?? 800) + "M3");
        g0FrontalSeguro(dE, zEF);
        lines.push("G74R0.5");
        lines.push("G74X" + fmt(xFimF) + "Z" + fmt(zCoord(zFimF)) + "P" + Math.round(largF * 0.8 * 1000) + "Q" + Math.round(Math.max(0.1, p.pk ?? 0.5) * 1000) + "F" + fmt(p.f ?? 0.03));
      } else if (op.tipo === "furoRadial" || op.tipo === "furoAxial" || op.tipo === "fresaFaces") {
        // FERRAMENTA ACIONADA (eixo C indexado). Avanço em mm/min (G98). CONFERIR na máquina os códigos de C e do eixo Y.
        const zIniC = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFimC = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const fC = Math.max(1, p.f ?? 60);
        emitSpindle(lines, p, bD, 0, true);
        const rPecaC = (zg: number) => { let m = 0; for (const q of geo.ext) { const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB); if (zg < lo - 1e-9 || zg > hi + 1e-9) continue; m = Math.max(m, (hi - lo < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((zg - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa)) / 2); } return m; };
        if (op.tipo === "furoRadial") {
          const nF = Math.max(1, Math.round(p.nf ?? 1));
          const zC = (zIniC + zFimC) / 2;
          const dEm = 2 * rPecaC(zC);
          const xF = (p.xf ?? 0) > 0 ? p.xf : 0;
          const qR = (p.q ?? 1) > 0 ? 2 * p.q : 1e9;
          lines.push("(FURO RADIAL D" + fmt(p.d ?? 3) + " EM Z" + fmt(zCoord(zC)) + " - " + nF + " FURO(S) - ATE D" + fmt(xF) + " - CONFERIR C/ACIONADA)");
          g0Inicial(bD + 2, Math.min(zFrontClear, zCoord(zC)));
          if (zCoord(zC) > zFrontClear + 1e-4) lines.push("G0Z" + fmt(zCoord(zC)));
          for (let k = 0; k < nF; k++) {
            lines.push("G0C" + fmt(((p.a0 ?? 0) + (k * 360) / nF) % 360));
            lines.push("G0X" + fmt(dEm + 1));
            let x = dEm + 1, gR = 0;
            while (gR++ < 500 && x > xF + 1e-6) {
              const nx = Math.max(xF, x - qR);
              lines.push("G1X" + fmt(nx) + "F" + fmt(fC));
              x = nx;
              if (x > xF + 1e-6) { lines.push("G0X" + fmt(dEm + 1)); lines.push("G0X" + fmt(x + 0.3)); }
            }
            lines.push("G0X" + fmt(bD + 2));
          }
        } else if (op.tipo === "furoAxial") {
          const nF = Math.max(1, Math.round(p.nf ?? 4));
          const pcd = Math.max(0, p.pcd ?? 10);
          const zEA = zCoord(zIniC) - aprox;
          const zFA = zCoord(zFimC);
          const qA = (p.q ?? 1) > 0 ? p.q : 1e9;
          lines.push("(FURO AXIAL D" + fmt(p.d ?? 3) + " NO CIRCULO D" + fmt(pcd) + " - " + nF + " FUROS - CONFERIR C/ACIONADA)");
          g0FrontalSeguro(pcd, zEA);
          for (let k = 0; k < nF; k++) {
            lines.push("G0C" + fmt(((p.a0 ?? 0) + (k * 360) / nF) % 360));
            let z = zEA, gA = 0;
            while (gA++ < 500 && z < zFA - 1e-6) {
              const nz = Math.min(zFA, z + qA);
              lines.push("G1Z" + fmt(nz) + "F" + fmt(fC));
              z = nz;
              if (z < zFA - 1e-6) { lines.push("G0Z" + fmt(zEA)); lines.push("G0Z" + fmt(z - 0.3)); }
            }
            lines.push("G0Z" + fmt(zEA));
          }
        } else {
          // FRESAR FACES: fresa radial com eixo Y; cada face no ângulo C, passes em X até a medida, varrendo em Y
          const facesOp = [1, 2, 3, 4, 6, 8][Math.max(0, Math.min(5, Math.round(p.nfc ?? 3)))];
          const sF = Math.max(0.5, p.s ?? 10);
          const dfF = Math.max(0.5, p.df ?? 6);
          const apF = Math.max(0.05, p.ap ?? 0.5);
          const R0 = bD / 2;
          const yLim = Math.sqrt(Math.max(0, R0 * R0 - (sF / 2) * (sF / 2))) + dfF / 2 + 1;
          const larguraZ = Math.abs(zIniC - zFimC);
          const zsF: number[] = [];
          if (larguraZ <= dfF + 1e-6) zsF.push((zIniC + zFimC) / 2);
          else { const nZ = Math.ceil((larguraZ - dfF) / (0.7 * dfF)) + 1; for (let k = 0; k < nZ; k++) zsF.push(zIniC - dfF / 2 - ((larguraZ - dfF) * k) / (nZ - 1)); }
          lines.push("(FRESAR " + facesOp + " FACE(S) - MEDIDA " + fmt(sF) + " - FRESA D" + fmt(dfF) + (larguraZ < dfF - 1e-6 ? " - ATENCAO: FRESA MAIOR QUE A REGIAO EM Z" : "") + " - CONFERIR EIXO Y/C)");
          g0Inicial(bD + 2, Math.min(zFrontClear, zCoord(zsF[0])));
          for (let fc = 0; fc < facesOp; fc++) {
            lines.push("G0C" + fmt(((p.a0 ?? 0) + (fc * 360) / facesOp) % 360));
            for (const zc of zsF) {
              lines.push("G0X" + fmt(bD + 2));
              lines.push("G0Z" + fmt(zCoord(zc)) + "Y" + fmt(-yLim));
              let r = R0, lado = 1, gF = 0;
              while (gF++ < 500 && r > sF / 2 + 1e-6) {
                r = Math.max(sF / 2, r - apF);
                lines.push("G0X" + fmt(2 * r));
                lines.push("G1Y" + fmt(lado * yLim) + "F" + fmt(fC));
                lado = -lado;
              }
              lines.push("G0X" + fmt(bD + 2));
            }
          }
          lines.push("G0Y0");
        }
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
      const qMm = (p.q ?? 5) > 0 ? Math.max(0.1, p.q) : 5; // igual à TBSy
      lines.push("G99G97S" + Math.round(p.rpm ?? 1200) + "M3");
      g0FrontalSeguro(0, zEntry);
      if (op.ciclo) {
        // Q em milésimos (ex.: Q40000 = 40mm)
        lines.push("G83Z" + fmt(zFimS) + "Q" + Math.round(qMm * 1000) + "F" + fmt(p.f ?? 0.1));
        lines.push("G80");
      } else {
        let zCur = zIniS;
        // 1º Z para ENCABEÇAR com avanço próprio; depois segue o pica-pau / avanço normal
        if ((p.z1 ?? 0) > 0) { zCur = Math.min(zFimS, zIniS + p.z1); lines.push("G1Z" + fmt(zCur) + "F" + fmt(p.f1 ?? 0.05) + "(ENCABECAR)"); }
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
      const s0Int = subIntervalos(geo.int, fxs);
        const zFundoS0 = s0Int.length ? Math.min(...s0Int.map((q) => Math.min(q.zA, q.zB))) : 0;
        // a FACE do fundo NÃO entra no contorno: quem faceia o fundo é o bloco FUNDO (respeita a barra, a folga e o recuo X)
        let s = s0Int.filter((q) => !(Math.abs(q.zA - q.zB) < 1e-6 && Math.abs(q.zA - zFundoS0) < 1e-4));
      { const [aX, bX] = pontosXZ(p, fxs); const sX = cortarIntervalosXZ(s, aX, bX); if (sX !== s) { lines.push(msgXZ(p)); s = sX; } } // X de começo / fim
          s = estenderIntervalos(s, p, true); // ESTENDER início / fim do percurso
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbInt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, true, real).pts, angM), p.rp ?? 0.4, true);
        const restoDI = op.tipo === "desbInt" ? perfilRestoInt(opIn, geo, espH2) : null;
          if (restoDI) lines.push("(RESTO DA " + restoDI.nome + ": COMECA DO D" + fmt(restoDI.dMin) + " QUE ELA ABRIU)");
          const dSeg = restoDI ? restoDI.dMin : (op.tipo === "desbInt" || op.tipo === "acabInt") && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin; // furo já aberto (pré-furo da operação anterior)
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
          // ACABAMENTO sem desbaste antes: tira primeiro o CONE da ponta da broca (senão o contorno bate no fundo), depois faz o contorno
          const emitirConeAntes = () => {
            if (!((p.cn0 ?? 0) === 1 && p.zp0 !== undefined && dSeg > 0)) return;
            const zFundoC = Math.min(...s.map((q) => Math.min(q.zA, q.zB)));
            const xsC: number[] = [];
            for (const q of geo.int) {
              if (Math.abs(q.zA - q.zB) < 1e-6) continue;
              if (Math.abs(q.zA - zFundoC) < 1e-4) xsC.push(q.xa);
              if (Math.abs(q.zB - zFundoC) < 1e-4) xsC.push(q.xb);
            }
            const xInC = xsC.length >= 2 ? Math.min(...xsC) : 0;
            const angC = (p.pa0 ?? 120) > 0 ? (p.pa0 ?? 120) : 120;
            const tgC = Math.tan(((angC / 2) * Math.PI) / 180);
            const zPontaC = p.zp0 ?? zFundoC;
            const zOmbroC = zPontaC + dSeg / 2 / tgC;
            if (!(zOmbroC > zFundoC + 0.01)) return;
            const bmC = p.bm ?? 0;
            if (!(bmC > 0)) { lines.push("(PENDENCIA: CONE DA PONTA DA BROCA NO FUNDO - INFORMAR O DIAMETRO DA BARRA PARA FACEAR SEM BATER)"); return; }
            const xAlvoC = Math.max(xInC, 2 * bmC - dSeg + (p.fb ?? 0.5) + Math.max(0, p.fi ?? 1), (p.xff ?? 0) > 0 ? p.xff : -Infinity);
            const xIniC = dSeg;
            const apInC = p.ap ?? 1;
            const apZC = Math.max(0.05, apInC > 0 ? apInC : 1);
            const rBC = (zg: number) => Math.max(0, (zg - zPontaC) * tgC);
            lines.push("(CONE DA PONTA DA BROCA " + fmt(angC) + " GRAUS: MATERIAL DE Z" + fmt(zCoord(zOmbroC)) + " ATE Z" + fmt(zCoord(zFundoC)) + " - PASSES LONGITUDINAIS ANTES DO CONTORNO)");
            lines.push("G0X" + fmt(xEnt));
            lines.push("G0Z" + fmt(zCoord(zOmbroC) - 0.5));
            const nPC = Math.max(1, Math.ceil((xIniC - xAlvoC) / (2 * apZC) - 1e-6));
            for (let k = 0; k <= nPC; k++) {
              const xpC = xAlvoC + ((xIniC - xAlvoC) * k) / nPC;
              const zcC = zPontaC + xpC / 2 / tgC;
              if (k > 0) lines.push("G0Z" + fmt(zCoord(zOmbroC) - 0.5));
              lines.push("G0X" + fmt(xpC));
              lines.push("G0Z" + fmt(zCoord(Math.min(zcC, zOmbroC)) - 0.5));
              lines.push("G1Z" + fmt(zCoord(zFundoC)) + "F" + fmt(p.f ?? 0.08));
              lines.push("G1X" + fmt(Math.max(0.5, xpC - 1)) + "Z" + fmt(zCoord(zFundoC) - 0.5));
            }
            lines.push("G0Z" + fmt(zCoord(zOmbroC) - 0.5));
            lines.push("G0X" + fmt(xEnt));
            lines.push("G0Z" + fmt(zStartS));
          };
          if (op.tipo === "acabInt") emitirConeAntes();
          const c = ciclosH1["I" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push("G70P" + c.p + "Q" + c.q);
          } else {
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.08, { xSaida: xEnt });
          }
        }
        // FUNDO DO FURO (face no fim da região, Head 1): faceia a partir do furo JÁ ABERTO (pré-furo) para o centro
        // até onde a barra deixa sem a COSTA da ferramenta pegar na parede: Ø mín = 2 x Ø barra − Ø aberto + folga
        if (canal === "H1" || espH2) {
          const faces = s0Int.filter((q) => Math.abs(q.zA - q.zB) < 1e-6); // a face do fundo saiu do contorno (s), mas é ELA que o bloco FUNDO faceia
          const zFundo = Math.min(zFundoS0, ...s.map((q) => Math.min(q.zA, q.zB)));
          const fF = faces.find((q) => Math.abs(q.zA - zFundo) < 1e-4) || (() => {
          // a face do fundo é o degrau entre dois trechos do furo (o Ø muda no mesmo Z)
          const xsF: number[] = [];
          for (const q of geo.int) {
            if (Math.abs(q.zA - q.zB) < 1e-6) continue;
            if (Math.abs(q.zA - zFundo) < 1e-4) xsF.push(q.xa);
            if (Math.abs(q.zB - zFundo) < 1e-4) xsF.push(q.xb);
          }
          // FURO CEGO: só a parede chega no fundo e nada do furo passa dele -> a face do fundo vai do centro (Ø0) até a parede
          if (xsF.length === 1 && zFundo > geo.zBack + 1e-3 && !geo.int.some((q) => Math.min(q.zA, q.zB) < zFundo - 1e-4)) return { zA: zFundo, zB: zFundo, xa: 0, xb: xsF[0] };
          if (xsF.length < 2) return undefined;
          const loF = Math.min(...xsF), hiF = Math.max(...xsF);
          return hiF - loF > 0.05 ? { zA: zFundo, zB: zFundo, xa: loF, xb: hiF } : undefined;
        })();
          if (fF) {
            const xIn = Math.min(fF.xa, fF.xb);
            const xOut = Math.max(fF.xa, fF.xb);
            const dAberto = dSeg;
            const bmB = p.bm ?? 0;
            const fbB = p.fb ?? 0.5;
            const sobreZ = op.tipo === "desbInt" ? Math.max(0, p.w ?? 0.1) : 0;
            const sobreX = op.tipo === "desbInt" ? Math.max(0, p.u ?? 0.3) : 0;
            if (!(bmB > 0)) {
              lines.push("(FUNDO Z" + fmt(zCoord(zFundo)) + ": INFORMAR O DIAMETRO DA BARRA PARA CALCULAR ATE ONDE FACEIA - FUNDO NAO USINADO)");
            } else {
              const xMinBarra = 2 * bmB - dAberto + fbB + Math.max(0, p.fi ?? 1); // costa da barra não passa da parede do outro lado (com folga e recuo X)
              const xAlvo = Math.max(xIn, xMinBarra, (p.xff ?? 0) > 0 ? p.xff : -Infinity);
              const xIni = Math.min(xOut, dAberto) - sobreX;
              if (xAlvo < xIni - 0.05) {
                const zF = zCoord(zFundo + sobreZ);
                lines.push("(FUNDO Z" + fmt(zCoord(zFundo)) + ": FACEIA DE D" + fmt(xIni) + " ATE D" + fmt(xAlvo) + (xAlvo > xIn + 0.01 ? " - LIMITE PELA BARRA D" + fmt(bmB) + " NO FURO ABERTO D" + fmt(dAberto) : "") + ")");
                // PONTA DA BROCA (furação anterior foi com a PONTA no fundo): o Ø cheio só existe até o OMBRO da broca;
            // entre o ombro e a ponta sobra um anel CÔNICO de material -> faceia em passes de Z (sem bater o fundo de uma vez)
            const temCone = (p.cn0 ?? 0) === 1 && p.zp0 !== undefined && dAberto > 0;
            const angPonta = (p.pa0 ?? 120) > 0 ? (p.pa0 ?? 120) : 120;
            const tgP = Math.tan(((angPonta / 2) * Math.PI) / 180);
            const zPontaG = p.zp0 ?? zFundo;
            const zOmbroG = zPontaG + dAberto / 2 / tgP;
            const zAlvoG = zFundo + sobreZ;
            const rBrocaEm = (zg: number) => Math.max(0, (zg - zPontaG) * tgP);
            let saiuCone = false;
            if (op.tipo === "desbInt" && temCone && zOmbroG > zAlvoG + 0.01) {
              const apInG = p.ap ?? 1;
              const apZ = Math.max(0.05, apInG > 0 ? apInG : 1);
              // LONGITUDINAL (nunca transversal): passes em Z, do Ø menor para o maior, cada um até o fundo
              const nP = Math.max(1, Math.ceil((xIni - xAlvo) / (2 * apZ) - 1e-6));
              lines.push("(CONE DA PONTA DA BROCA " + fmt(angPonta) + " GRAUS: MATERIAL DE Z" + fmt(zCoord(zOmbroG)) + " ATE Z" + fmt(zCoord(zFundo)) + " - PASSES LONGITUDINAIS D" + fmt(xAlvo) + " ATE D" + fmt(xIni) + ")");
              for (let k = 0; k <= nP; k++) {
                const xp = xAlvo + ((xIni - xAlvo) * k) / nP;
                const zcG = zPontaG + xp / 2 / tgP; // onde a broca deixou material neste Ø
                if (k > 0) lines.push("G0Z" + fmt(zCoord(zOmbroG) - 0.5));
                lines.push("G0X" + fmt(xp));
                lines.push("G0Z" + fmt(zCoord(Math.min(zcG, zOmbroG)) - 0.5));
                lines.push("G1Z" + fmt(zCoord(zAlvoG)) + "F" + fmt(p.f ?? 0.1));
                lines.push("G1X" + fmt(Math.max(0.5, xp - 1)) + "Z" + fmt(zCoord(zAlvoG) - 0.5));
              }
              saiuCone = true;
            } else if (op.tipo === "acabInt" && lines.length >= 2 && lines[lines.length - 2] === "G1X" + fmt(xEnt)) {
              // ACABAMENTO: o contorno já chegou no canto do fundo -> segue em G1 descendo a face (sem recuar em Z)
              lines.splice(lines.length - 2, 1);
              lines.push("G1X" + fmt(xAlvo));
            } else {
              lines.push("G0X" + fmt(xEnt));
              lines.push("G0Z" + fmt(zF - 0.5));
              lines.push("G0X" + fmt(xIni));
              lines.push("G1Z" + fmt(zF) + "F" + fmt(p.f ?? 0.1));
              lines.push("G1X" + fmt(xAlvo));
            }
                if (!saiuCone) {
              lines.push("G0Z" + fmt(zF - 0.3));
              // sai reto em Z (o furo é sempre maior que o Ø do fundo daqui para a frente) - sem subir X
            }
              } else {
                lines.push("(FUNDO Z" + fmt(zCoord(zFundo)) + ": BARRA D" + fmt(bmB) + " NO FURO D" + fmt(dAberto) + " NAO ALCANCA FACEAR - SO ATE D" + fmt(xMinBarra) + ")");
              }
            }
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
  // simular só um acabamento: linha a linha (o G70 dependeria do G71 do desbaste, que não vai para o programa)
  if (cfg.soloId) ops = ops.map((o) => (o.id === cfg.soloId && (o.tipo === "acabExt" || o.tipo === "acabInt") ? { ...o, ciclo: false } : o));
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
    if (cfg.soloId && op.id !== cfg.soloId) return; // simular só esta operação
    const linhasOp = gerarOpLinhas(op, "H1");
    linhasOp.forEach((l) => h1.push(l));
  });

  h1.push("T100(BEDAME)");
  h1.push("/M25");
  h1.push(`G99G97S${rpmCorte}M3`);
  h1.push(corteOp && (!cfg.soloId || corteOp.id === cfg.soloId) ? `G0X${fmt(bD + 1)}Z${fmt(compCorte + largCorte)}T1` : "(CORTE DESTICADO NA ARVORE - SEM MOVIMENTO DE CORTE - CONFERIR)");
  h1.push(sincPega);
  h1.push("M82");
  h1.push("M40");
  if (corteOp && (!cfg.soloId || corteOp.id === cfg.soloId)) h1.push(`G1X-1.5F${fmt(fCorte)}`);
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
    if (cfg.soloId && op.id !== cfg.soloId) return;
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

// ESPELHO X (por operação): a ferramenta trabalha do OUTRO lado do centro (X negativo).
// Troca o sinal de X/U (e dos recuos), troca G2<->G3, inverte o sobremetal U do G71/G73 e o R de cone (G90/G92/G76).
// Não mexe: profundidade do G71 (1ª linha), raios R de arco, comentários.
export function espelharXLinhas(linhas: string[], ligar: boolean): string[] {
  if (!ligar || !linhas.length) return linhas;
  const out: string[] = ["(ESPELHO X - FERRAMENTA DO OUTRO LADO DO CENTRO / X NEGATIVO)"];
  for (const l of linhas) {
    if (/^\s*[#(%]/.test(l)) { out.push(l); continue; }
    const ci = l.indexOf("(");
    const code = ci >= 0 ? l.slice(0, ci) : l;
    const com = ci >= 0 ? l.slice(ci) : "";
    const up = code.toUpperCase();
    const manterU = /G71/.test(up) && !/P\d/.test(up); // G71U(prof.)R(retração): não inverte
    const rCone = /G9[02]|G76/.test(up) && /X/.test(up); // R de cone só nos ciclos de rosca/G90 com X
    let c = code.replace(/([XUR])(-?)(\d+\.?\d*|\.\d+)/g, (m: string, w: string, sg: string, v: string) => {
      if (w === "U" && manterU) return m;
      if (w === "R" && !rCone) return m;
      if (parseFloat(v) === 0) return m;
      return w + (sg ? "" : "-") + v;
    });
    c = c.replace(/(^|[^0-9.])G0?([23])(?![0-9.])/g, (_m: string, pre: string, d: string) => pre + "G" + (d === "2" ? "3" : "2"));
    out.push(c + com);
  }
  return out;
}

// Corta o perfil para começar/terminar no PONTO escolhido (X e Z) — segue a linha da peça entre eles
// X Ø DE COMEÇO / FIM: o ponto (X, Z) escolhido marca ONDE no perfil a operação começa e termina.
// Só vale se o ponto estiver EM CIMA do perfil (até 0,3 mm); clicado no ar = automático pelo Z (como sempre foi).
type StarPtXZ = { x: number; z: number };
function cortarIntervalosXZ(s: StarTMIntervalo[], a?: StarPtXZ, b?: StarPtXZ, tol = 0.3): StarTMIntervalo[] {
  if (!s.length || (!a && !b)) return s;
  const pt = (q: StarTMIntervalo, t: number) => ({ x: q.xa + t * (q.xb - q.xa), z: q.zA + t * (q.zB - q.zA) });
  const proj = (P: StarPtXZ) => {
    let best = { d: Infinity, i: 0, t: 0 };
    s.forEach((q, i) => {
      const ar = q.xa / 2, dr = q.xb / 2 - ar, dz = q.zB - q.zA, L2 = dr * dr + dz * dz;
      let t = L2 > 1e-12 ? ((P.x / 2 - ar) * dr + (P.z - q.zA) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(P.x / 2 - (ar + t * dr), P.z - (q.zA + t * dz));
      if (d < best.d - 1e-9) best = { d, i, t };
    });
    return best.d <= tol ? best : null;
  };
  const A = a ? proj(a) : null;
  const B = b ? proj(b) : null;
  if (!A && !B) return s;
  const iA = A ? A.i : 0, tA = A ? A.t : 0, iB = B ? B.i : s.length - 1, tB = B ? B.t : 1;
  if (iA + tA >= iB + tB - 1e-9) return s;
  const r: StarTMIntervalo[] = [];
  for (let i = iA; i <= iB; i++) {
    const q = s[i];
    const P0 = pt(q, i === iA ? tA : 0), P1 = pt(q, i === iB ? tB : 1);
    if (Math.hypot(P1.x - P0.x, P1.z - P0.z) < 1e-6) continue;
    r.push({ ...q, xa: P0.x, zA: P0.z, xb: P1.x, zB: P1.z });
  }
  return r.length ? r : s;
}
function cortarPtsXZ<T extends StarPtXZ>(pts: T[], a?: StarPtXZ, b?: StarPtXZ, tol = 0.3): T[] {
  if (pts.length < 2 || (!a && !b)) return pts;
  const proj = (P: StarPtXZ) => {
    let best = { d: Infinity, i: 0, t: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const ar = pts[i].x / 2, dr = pts[i + 1].x / 2 - ar, dz = pts[i + 1].z - pts[i].z, L2 = dr * dr + dz * dz;
      let t = L2 > 1e-12 ? ((P.x / 2 - ar) * dr + (P.z - pts[i].z) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(P.x / 2 - (ar + t * dr), P.z - (pts[i].z + t * dz));
      if (d < best.d - 1e-9) best = { d, i, t };
    }
    return best.d <= tol ? best : null;
  };
  const A = a ? proj(a) : null;
  const B = b ? proj(b) : null;
  if (!A && !B) return pts;
  const L = pts.length - 1;
  const iA = A ? A.i : 0, tA = A ? A.t : 0, iB = B ? B.i : L - 1, tB = B ? B.t : 1;
  if (iA + tA >= iB + tB - 1e-9) return pts;
  const P = (i: number, t: number): T => ({ ...pts[i], x: pts[i].x + t * (pts[i + 1].x - pts[i].x), z: pts[i].z + t * (pts[i + 1].z - pts[i].z) });
  const out: T[] = [P(iA, tA)];
  for (let k = iA + 1; k <= iB; k++) out.push(pts[k]);
  out.push(P(iB, tB));
  return out.filter((q, k) => k === 0 || Math.hypot(q.x - out[k - 1].x, q.z - out[k - 1].z) > 1e-6);
}
// pontos do X de começo / fim da operação (Z = começo / fim da região)
function pontosXZ(p: any, fxs: StarTMFaixa[], dzFim = 0): [StarPtXZ | undefined, StarPtXZ | undefined] {
  if (!fxs.length) return [undefined, undefined];
  const zI = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
  const zF = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
  return [(p.xI ?? 0) > 0 ? { x: p.xI, z: zI } : undefined, (p.xF ?? 0) > 0 ? { x: p.xF, z: zF + dzFim } : undefined];
}
const msgXZ = (p: any) => "(COMECA/TERMINA NO PONTO ESCOLHIDO" + ((p.xI ?? 0) > 0 ? " - INICIO D" + fmt(p.xI) : "") + ((p.xF ?? 0) > 0 ? " - FIM D" + fmt(p.xF) : "") + ")";

// ESTENDER INÍCIO / FIM DO PERCURSO (como nos CAM): prolonga o perfil escolhido antes do começo e depois do fim,
// com o comprimento (mm) e o ângulo (graus a partir do eixo Z: 0 = reto em Z para fora, 90 = sobe reto em X) de cada operação.
function estenderIntervalos(s: StarTMIntervalo[], p: any, interno: boolean): StarTMIntervalo[] {
  if (!s.length) return s;
  const sg = interno ? -1 : 1; // externo: sai para o Ø maior | interno: sai para o centro (sempre para o lado sem material)
  const ang = (v: any) => (Math.max(0, Math.min(90, Number(v) || 0)) * Math.PI) / 180;
  let r = s;
  const eiL = Number(p.eiL) || 0, efL = Number(p.efL) || 0;
  if (eiL > 0) { const a = ang(p.eiA); const q = r[0]; r = [{ ...q, zA: q.zA + eiL * Math.cos(a), zB: q.zA, xa: Math.max(0, q.xa + sg * 2 * eiL * Math.sin(a)), xb: q.xa }, ...r]; }
  if (efL > 0) { const a = ang(p.efA); const q = r[r.length - 1]; r = [...r, { ...q, zA: q.zB, zB: q.zB - efL * Math.cos(a), xa: q.xb, xb: Math.max(0, q.xb + sg * 2 * efL * Math.sin(a)) }]; }
  return r;
}
function cortarPerfilPontos(pts: StarTMPt[], a?: { x: number; z: number }, b?: { x: number; z: number }): StarTMPt[] {
  if (pts.length < 2 || (!a && !b)) return pts;
  const proj = (q: { x: number; z: number }) => {
    let best = { d: Infinity, i: 0, t: 0, x: pts[0].x, z: pts[0].z };
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const ar = A.x / 2, br = B.x / 2, qr = q.x / 2;
      const dr = br - ar, dz = B.z - A.z;
      const L2 = dr * dr + dz * dz;
      let tt = L2 > 1e-12 ? ((qr - ar) * dr + (q.z - A.z) * dz) / L2 : 0;
      tt = Math.max(0, Math.min(1, tt));
      const pr = ar + tt * dr, pz = A.z + tt * dz;
      const d = Math.hypot(qr - pr, q.z - pz);
      if (d < best.d - 1e-9) best = { d, i, t: tt, x: 2 * pr, z: pz };
    }
    return best;
  };
  const L = pts.length - 1;
  const ini = a ? proj(a) : { d: 0, i: 0, t: 0, x: pts[0].x, z: pts[0].z };
  const fim = b ? proj(b) : { d: 0, i: L - 1, t: 1, x: pts[L].x, z: pts[L].z };
  if (ini.i + ini.t >= fim.i + fim.t - 1e-9) return pts;
  if (ini.i === 0 && ini.t < 1e-6 && fim.i === L - 1 && fim.t > 1 - 1e-6) return pts;
  const out: StarTMPt[] = [{ ...pts[0], x: ini.x, z: ini.z }];
  for (let k = ini.i + 1; k <= fim.i; k++) out.push(pts[k]);
  out.push({ ...pts[0], x: fim.x, z: fim.z });
  return out;
}

// Ponto de chegada 0,5 mm FORA da peça, do lado livre da linha onde começa (externo)
function aproximacaoExternaStar(pts: StarTMPt[], geo: StarTMGeo): { x: number; z: number } {
  const p0 = pts[0], p1 = pts[1];
  const r0 = p0.x / 2;
  let dr = p1.x / 2 - r0, dz = p1.z - p0.z;
  const Ln = Math.hypot(dr, dz) || 1;
  dr /= Ln; dz /= Ln;
  const rPeca = (z: number) => {
    let m = 0;
    for (const q of geo.ext) {
      const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB);
      if (z < lo - 1e-9 || z > hi + 1e-9) continue;
      const xv = hi - lo < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa);
      m = Math.max(m, xv / 2);
    }
    return m;
  };
  const cands = [{ r: r0 + 0.5 * dz, z: p0.z - 0.5 * dr }, { r: r0 - 0.5 * dz, z: p0.z + 0.5 * dr }];
  const fora = cands.filter((c) => c.r > rPeca(c.z) + 1e-3);
  const esc = fora.length ? fora.reduce((u, v) => (u.r >= v.r ? u : v)) : { r: r0 + 0.5, z: p0.z };
  return { x: Math.max(2 * esc.r, 0.5), z: esc.z };
}

// raio da peça (externo) num Z — maior valor (na face pega o lado maior)
function rPecaExtStar(geo: StarTMGeo, z: number): number {
  let m = 0;
  for (const q of geo.ext) {
    const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB);
    if (z < lo - 1e-9 || z > hi + 1e-9) continue;
    const xv = hi - lo < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa);
    m = Math.max(m, xv / 2);
  }
  return m;
}

// Linhas geradas por operação (id -> linhas). O painel usa para OCULTAR o traço de uma ferramenta no simulador.
export const blocosOpsGerados: Record<string, string[]> = {};


// =====================================================================================================
// ERGOMAT TBSy 60 (N09) - 2 CANAIS, MESMO MOTOR ÚNICO (cálculo da Star), só a ESCRITA é da TBSy
// Padrão aprendido dos programas reais TC103003 e CORPO_25 (arquivo .P-2 = H1 / sem extensão = H2):
//  TI1  = torre inferior, programa H1, fuso principal G54 (Z- entra na peça), troca G0G53X320(M89)/G0G53Z100
//  TS2  = torre superior, programa H2, fuso principal G54 (X NEGATIVO, Z- entra na peça), troca G0G53X235Z280Y0
//  HIBO = torre superior T521/T522/T523, programa H2, contrafuso G55 (Z+ entra pela face do corte), S2
//  CORTE = sempre pelo V1 (bedame de cima), no H1; o contrafuso (T101 na TS2) pega a peça antes do corte
// =====================================================================================================
export type TbsyPosto = "TI1" | "TS2" | "HIBO";
export function postoTbsy(op: StarTMOp): TbsyPosto {
  const p = (op as any).posto;
  if (p === "TI1" || p === "TS2" || p === "HIBO") return p;
  return (op.cab ?? "H1") === "H2" ? "TS2" : "TI1";
}
function traduzTbsy(ls: string[], o: { flipZ: boolean; negX: boolean; zMap: (z: number) => number; posto: TbsyPosto; g: string; aprox: string }): string[] {
  const f = fmt;
  const out: string[] = [];
  let lim: string | null = null;
  let primeiroMov = true;
  let primeiroG1 = true;
  const troca = o.flipZ !== o.negX; // espelhar um eixo inverte o sentido do arco
  const sp = o.posto === "HIBO" ? "S2=" : "S1=";
  const mGiro = o.posto === "HIBO" ? "M23" : "M3";
  const zC = (c: string) => (o.flipZ && !/SOBREMETAL/.test(c) ? c.replace(/\bZ(-?\d+(?:\.\d+)?)/g, (_m, v) => "Z" + f(o.zMap(parseFloat(v)))) : c);
  ls.forEach((l0) => {
    let l = l0.trim();
    if (!l) return;
    const pula = l.startsWith("/");
    if (pula) l = l.slice(1).trim();
    if (/^\(.*\)$/.test(l)) { out.push(zC(l)); return; }
    const ip = l.indexOf("(");
    const com = ip >= 0 ? zC(l.slice(ip)) : "";
    const cod = (ip >= 0 ? l.slice(0, ip) : l).trim();
    if (/^T\d+$/.test(cod) || cod === "M25" || /^T0M0?1$/.test(cod) || /^M0?1$/.test(cod) || cod === "G0T0" || cod === "M101" || cod === "G97") return;
    let mm: RegExpMatchArray | null;
    if ((mm = cod.match(/^G50S(\d+)$/))) { lim = mm[1]; return; }
    if ((mm = cod.match(/^G99G96S(\d+)M3$/))) { out.push("G96" + mGiro + sp + mm[1]); if (lim) out.push("G92S=" + lim); lim = null; return; }
    if ((mm = cod.match(/^G99G97S(\d+)M3$/))) { out.push("G97" + sp + mm[1] + mGiro); return; }
    const pal: string[] = cod.match(/[A-Z][-+]?[\d.]*/g) || [];
    const temPQ = pal.some((w) => w[0] === "P") && pal.some((w) => w[0] === "Q");
    const g76 = pal.includes("G76");
    const temZ = pal.some((w) => w[0] === "Z");
    const w: string[] = [];
    let mov = false, g1 = false, pausa = false;
    pal.forEach((p) => {
      const L = p[0];
      const v = p.slice(1);
      if (L === "G") {
        const g = parseFloat(v);
        if (g === 0 || g === 1) { w.push("G" + g); mov = true; if (g === 1) g1 = true; }
        else if (g === 2 || g === 3) { w.push(troca ? (g === 2 ? "G3" : "G2") : "G" + g); mov = true; g1 = true; }
        else { if (g === 4) pausa = true; w.push(p); }
      } else if (v === "") w.push(p);
      else if (L === "X") w.push((pausa ? "U" : "X") + f(!pausa && o.negX ? -parseFloat(v) : parseFloat(v)));
      else if (L === "Z") w.push("Z" + f(o.flipZ ? o.zMap(parseFloat(v)) : parseFloat(v)));
      else if (L === "K" || L === "W") w.push(L + f(o.flipZ ? -parseFloat(v) : parseFloat(v)));
      else if (L === "I" || (L === "U" && temPQ) || (L === "R" && g76 && temZ)) w.push(L + f(o.negX ? -parseFloat(v) : parseFloat(v)));
      else if (L === "T") { /* a TBSy chama a ferramenta na linha T própria */ }
      else w.push(p);
    });
    if (!w.length) return;
    if (mov && primeiroMov) { const iG0 = w.indexOf("G0"); if (iG0 >= 0) w.splice(iG0 + 1, 0, o.g); else w.unshift(o.g); w.push(o.aprox); primeiroMov = false; }
    if (g1 && primeiroG1) { const iG = w.findIndex((x) => /^G[123]$/.test(x)); if (iG >= 0) w.splice(iG + 1, 0, "G95"); primeiroG1 = false; }
    out.push((pula ? "/" : "") + w.join("") + com);
  });
  return out;
}
export function tmGerarErgomatTBSY(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): StarGerarResult {
  const f = fmt;
  const nm = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, "_") || "PECA";
  const bD = cfg.bD;
  // motor único SEM o recuo X320 da DNA dentro da operação (a TBSy faz a troca segura pelo G53 aqui embaixo)
  const { gerarOpLinhas, deslH1 } = criarEmissorOpsStar(ops, geo, { ...cfg, maqId: undefined, recuoTroca: undefined });
  const zH1map = (z: number) => geo.zFront + deslH1 - z; // Z da Star (+ entra) -> Z da TBSy G54 (- entra)
  const ativos = ops.filter((o) => o.ativo && o.tipo !== "corte" && (!cfg.soloId || o.id === cfg.soloId));
  const corteOp = ops.find((o) => o.ativo && o.tipo === "corte");
  const tCod = (op: StarTMOp) => { const n = parseInt(String(op.ferr || "").replace(/\D/g, ""), 10); return isFinite(n) && n > 0 ? n : 0; };
  const desc = (op: StarTMOp) => (op.nomeFerr || DESC_TIPO[op.tipo] || op.tipo).toUpperCase().replace(/[()]/g, "");
  const nSeq = (t: number) => (t >= 100 ? Math.floor(t / 100) : t);
  const corpoOp = (op: StarTMOp, posto: TbsyPosto) => {
    const ls = gerarOpLinhas(op, posto === "HIBO" ? "H2" : "H1");
    const r = traduzTbsy(ls, posto === "TI1" ? { flipZ: true, negX: false, zMap: zH1map, posto, g: "G54", aprox: "M7M87" } : posto === "TS2" ? { flipZ: true, negX: true, zMap: zH1map, posto, g: "G54", aprox: "M57" } : { flipZ: false, negX: false, zMap: (z) => z, posto, g: "G55", aprox: "M107" });
    blocosOpsGerados[op.id] = r;
    return r;
  };
  // grupos na ORDEM da árvore: HIBO roda em paralelo no início (peça anterior no contrafuso);
  // cada sequência de TS2 vira uma "janela" em que o H1 fica recuado esperando (sincronismo)
  type Bloco = { tipo: "TI1" | "TS2"; ops: StarTMOp[] };
  const blocos: Bloco[] = [];
  const hibo: StarTMOp[] = [];
  ativos.forEach((op) => {
    const pt = postoTbsy(op);
    if (pt === "HIBO") { hibo.push(op); return; }
    const ult = blocos[blocos.length - 1];
    if (ult && ult.tipo === pt) ult.ops.push(op); else blocos.push({ tipo: pt, ops: [op] });
  });
  const JANELAS: [number, number][] = [[280, 285], [290, 295], [300, 305]];
  const nJan = blocos.filter((b) => b.tipo === "TS2").length;
  if (nJan > JANELAS.length) return { textos: ["", ""], nomes: [nm + ".P-2", nm], doisCanais: true, erro: "TBSy: no máximo " + JANELAS.length + " trechos separados de TS2 (agrupe as operações da torre superior em sequência)." };
  const faceOp = ativos.find((o) => o.tipo === "face" && postoTbsy(o) === "TI1");
  const sobreFace = (cfg.brutoDz ?? 0) > 0 ? cfg.brutoDz! : faceOp ? (faceOp.p.sobre ?? 0.3) : 0.3;
  const h1: string[] = [];
  const h2: string[] = [];
  // ---------------- H1 (.P-2): TI1 + V1 ----------------
  h1.push("%", "<" + nm + ">", "(GERADO PELO TORNO MASTER - CONFERIR ANTES DE RODAR)", "(G54 = FUSO PRINCIPAL / V1 = BEDAME DE CORTE)");
  h1.push("G0G53X320Z100V350", "M250");
  h1.push("(NAO SIMULAR - TOPE DA BARRA)", "T808(TOPE - CONFERIR POSICAO)", "G0G54Z10", "/G0X0", "/G1G94Z-12F3000(CONFERIR)", "M260", "/G65P9500", "M270", "/M11", "G4U0.5", "G1G94Z10F3000", "Z" + f(sobreFace), "M10", "G4U0.5", "G0Z10", "(FIM NAO SIMULAR)");
  // ---------------- H2 (sem extensão): HIBO + TS2 + contrafuso ----------------
  h2.push("%", "<" + nm + ">", "(GERADO PELO TORNO MASTER - CONFERIR ANTES DE RODAR)", "(G54 = FUSO PRINCIPAL / G55 = CONTRAFUSO - HIBO)");
  h2.push("G0G53X235Z280Y0", "M250", "M260", "/G65P9500", "M270");
  let primeiraHibo = true;
  hibo.forEach((op) => {
    const t = tCod(op);
    if (!(t % 100 >= 21 && t % 100 <= 23)) h2.push("(ATENCAO: HIBO TRABALHA SO NAS POSICOES 21 22 23 - CONFERIR " + (op.ferr || "") + ")");
    // 1ª ferramenta do HIBO: T5 + 21/22/23 (dá o "tombo" na torre); as próximas só T21, T22 ou T23
    const nnH = t % 100;
    const tH = (primeiraHibo ? "T5" : "T") + String(nnH).padStart(2, "0");
    primeiraHibo = false;
    h2.push("", "N" + nnH + "G0G53X235Z280Y0", tH + "(" + desc(op) + ")");
    // face / centro / furação marcada na FRENTE da peça: no HIBO vale a FACE DO CORTE (espelha a região)
    const sFh = geo.zFront + geo.zBack;
    const hiH = op.faixas.length ? Math.max(...op.faixas.map((g) => Math.max(g[0], g[1]))) : NaN;
    if (["face", "centro", "furo", "macho", "alargador"].includes(op.tipo) && hiH >= geo.zFront - 0.05) op = { ...op, faixas: op.faixas.map(([x1, x2]) => [sFh - Math.max(x1, x2), sFh - Math.min(x1, x2)] as StarTMFaixa) };
    corpoOp(op, "HIBO").forEach((l) => h2.push(l));
    h2.push("M25M109", "G4U.5");
  });
  // tira do contrafuso a peça da volta anterior
  h2.push("", "N1G0G53X235Z280Y0", "(NAO SIMULAR - EXPULSAR PECA DO CONTRAFUSO)", "T101", "(EXPULSAR PECA)", "M64", "G0G53X259Y0Z200.", "G0G53Z90(CONFERIR)", "M111", "G4U.5", "M110", "G0G53Z200.M65", "(FIM NAO SIMULAR)");
  let primeiraTI1 = true;
  let jan = 0;
  blocos.forEach((b) => {
    if (b.tipo === "TI1") {
      b.ops.forEach((op) => {
        const t = tCod(op);
        h1.push("");
        if (primeiraTI1) { h1.push("N" + nSeq(t) + "G0G53X320"); primeiraTI1 = false; } else h1.push("N" + nSeq(t) + "G0G53X320M89");
        h1.push("G0G53Z100", "T" + t + "(" + desc(op) + ")");
        corpoOp(op, "TI1").forEach((l) => h1.push(l));
      });
    } else {
      const [mA, mB] = JANELAS[jan++];
      // H1 recua e espera a torre superior trabalhar no fuso principal
      h1.push("", "G0G53X320M89", "G0G53Z100", "M" + mA, "(ESPERA A TORRE SUPERIOR - TS2)", "M" + mB);
      h2.push("", "M" + mA);
      b.ops.forEach((op) => {
        const t = tCod(op);
        h2.push("", "N" + nSeq(t) + "G0G53X235Z280Y0", "T" + t + "(" + desc(op) + ")");
        corpoOp(op, "TS2").forEach((l) => h2.push(l));
      });
      h2.push("G0G53X235Z280Y0", "M" + mB);
    }
  });
  // ---------------- CORTE pelo V1 + contrafuso pega a peça ----------------
  const rpmC = corteOp ? (corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0 ? Math.round(corteOp.p.rpm) : Math.min(cfg.rpmMax || 3000, Math.round(((corteOp.p.vc ?? 100) * 1000) / (Math.PI * Math.max(bD, 1))))) : 1500;
  const fC = corteOp && (corteOp.p.f ?? 0) > 0 ? corteOp.p.f : 0.05;
  const xfC = corteOp && corteOp.p.xf !== undefined ? corteOp.p.xf : -1.5;
  const pega = Math.max(1, cfg.pega2 ?? 8);
  h1.push("", "N11G0G53X320M89", "G0G53Z100", "M310", "(CORTE)", "M390", "S1=" + rpmC + "M3", "M395", "G0G53X320Z100V350M7", "M400", "M410");
  if (corteOp && (!cfg.soloId || corteOp.id === cfg.soloId)) h1.push("G0G54V" + f(Math.ceil(bD + 4)), "G95G1V" + f(xfC) + "F" + f(fC));
  else h1.push("(CORTE DESTICADO NA ARVORE - SEM MOVIMENTO DO V1 - CONFERIR)");
  h1.push("M415", "M420", "G0G53V350M9", "M30", "%");
  h2.push("", "N11G53X235Z300Y0M59", "M310", "(NAO SIMULAR - CONTRAFUSO PEGA A PECA)", "T101(AGARRAR)", "M390", "S1=" + rpmC + "M3", "S2=" + rpmC + "M24", "M395", "M45", "M400", "G0G54X0Y0.Z18M111", "G4U1.5", "G1G94Z-" + f(pega) + "F4000", "M110", "M410", "M415", "G1W2", "M420", "G1Z10", "M46", "G0G53X235Z280Y0M25", "M30", "%");
  return { textos: [h1.join("\n"), h2.join("\n")], nomes: [nm + ".P-2", nm], doisCanais: true };
}
