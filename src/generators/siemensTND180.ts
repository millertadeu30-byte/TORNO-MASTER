import {
  StarTMOp,
  StarTMGeo,
  StarGerarCfg,
  StarTMPt,
  StarTMIntervalo,
  StarTMFaixa,
  DESC_TIPO_STAR,
} from "./star18iTB";

export interface SiemensGerarResult {
  textos: [string, string];
  nomes: [string, string];
  doisCanais: false;
  unicoCanal: true;
  erro?: string;
}

const PASTILHA_ANG = [0, 27, 27, 50];

const fmt = (n: number) => {
  let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (s === "-0.0") s = "0.0";
  return s;
};

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
  iv.forEach((s) => {
    const na = real ? s.xa : interno ? Math.min(s.xa, cur) : Math.max(s.xa, cur);
    const nb = real ? s.xb : interno ? Math.min(s.xb, na) : Math.max(s.xb, na);
    cur = nb;
    mono.push({ zA: s.zA, zB: s.zB, xa: na, xb: nb });
  });
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
  return simp;
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

function extrairEstacao(ferr: string, fallback: number): number {
  const m = (ferr || "").toUpperCase().match(/T(\d+)/);
  if (!m) return fallback;
  const s = m[1];
  const n = s.length >= 4 ? parseInt(s.slice(0, 2), 10) : parseInt(s, 10);
  return n > 0 ? n : fallback;
}

function faixaPadraoSiemens(tipo: StarTMOp["tipo"], geo: StarTMGeo, p: Record<string, number>): StarTMFaixa[] | null {
  if (tipo === "face") return [[geo.zFront, geo.zFront + (p.sobre !== undefined ? p.sobre : 0.5)]];
  if (tipo === "centro") return [[geo.zFront - (p.prof !== undefined ? p.prof : 2), geo.zFront]];
  if (tipo === "corte") return [[geo.zBack, geo.zBack]];
  return null;
}

function emitirContornoSiemens(
  out: string[],
  pts: StarTMPt[],
  zCoord: (zGeo: number) => number,
  fAcab: number
) {
  if (!pts.length) return;
  out.push(`G1Z${fmt(zCoord(pts[0].z))}F${fmt(fAcab)}`);
  let i = 1;
  while (i < pts.length) {
    const pPrev = pts[i - 1];
    const pCur = pts[i];
    const pNext = i + 1 < pts.length ? pts[i + 1] : null;
    if (pNext) {
      const dx1 = Math.abs(pCur.x - pPrev.x);
      const dz1 = Math.abs(pCur.z - pPrev.z);
      const dx2 = Math.abs(pNext.x - pCur.x);
      const dz2 = Math.abs(pNext.z - pCur.z);
      // Detecta chanfro a 45° entre segmentos ortogonais e emite CHF= no bloco da quina
      const isChamfer45 =
        dx1 > 0.05 &&
        dz1 > 0.05 &&
        dz1 <= 5 &&
        Math.abs(dx1 / 2 - dz1) < 0.02 &&
        ((i === 1 && dx2 < 0.02 && dz2 > 0.05) || (i > 1 && dz2 < 0.02 && dx2 > 0.05));
      if (isChamfer45) {
        const cornerZ = i === 1 ? zCoord(pPrev.z) : zCoord(pCur.z);
        const cornerX = i === 1 ? pPrev.x : pPrev.x;
        if (i === 1) {
          out[out.length - 1] = `G1Z${fmt(cornerZ)}CHF=${fmt(dz1)}F${fmt(fAcab)}`;
          out.push(`G1X${fmt(pCur.x)}Z${fmt(zCoord(pCur.z))}`);
        } else {
          out.push(`G1X${fmt(cornerX)}Z${fmt(cornerZ)}CHF=${fmt(dz1)}`);
          out.push(`G1X${fmt(pNext.x)}Z${fmt(zCoord(pNext.z))}`);
          i += 2;
          continue;
        }
        i++;
        continue;
      }
    }
    out.push(`G1X${fmt(pCur.x)}Z${fmt(zCoord(pCur.z))}`);
    i++;
  }
}

export function tmGerarSiemensTND180(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): SiemensGerarResult {
  const nmBruto = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const nm = nmBruto || "PECA";
  const mpfNome = `${nm}.MPF`;

  const origs = cfg.origens || [];
  const ativos = ops.filter((o) => o.ativo);

  const temH2OuLado2 = ativos.some((o) => {
    if (o.cab === "H2") return true;
    const og = origs[(o.orig || 1) - 1] || origs[0];
    return og?.fuso === "contrafuso";
  });
  if (temH2OuLado2) {
    return {
      textos: ["", ""],
      nomes: [mpfNome, mpfNome],
      doisCanais: false,
      unicoCanal: true,
      erro: "Ergomat TND 180 tem apenas 1 canal (sem H2/contrafuso). Remova ou mude as operações do H2/lado 2 para H1.",
    };
  }

  const bD = cfg.bD;
  const corteOp = ativos.find((o) => o.tipo === "corte");
  const faceOp = ativos.find((o) => o.tipo === "face");
  const largCorte = corteOp ? (corteOp.p.larg !== undefined ? corteOp.p.larg : 3) : 3;
  const fCorte = corteOp && (corteOp.p.f ?? 0) > 0 ? corteOp.p.f : 0.05;
  const vcCorte = corteOp && (corteOp.p.vc ?? 0) > 0 ? Math.round(corteOp.p.vc) : 100;
  const limCorte = corteOp && (corteOp.p.lim ?? 0) > 0 ? Math.round(corteOp.p.lim) : cfg.rpmMax || 3000;
  const rpmCortePonta = corteOp
    ? (corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0
        ? Math.round(corteOp.p.rpm)
        : Math.min(limCorte, Math.round((vcCorte * 1000) / (Math.PI * Math.max(bD, 1)))))
    : 1200;
  const sobreFace = faceOp ? (faceOp.p.sobre !== undefined ? faceOp.p.sobre : 0.5) : 0.5;
  const tBedame = cfg.estBedame && cfg.estBedame > 0 ? Math.round(cfg.estBedame) : extrairEstacao(corteOp?.ferr || "", 4);
  const tTope = cfg.estTope && cfg.estTope > 0 ? Math.round(cfg.estTope) : (tBedame === 12 ? 11 : 12);
  const zeroPeca = fmt(origs[0]?.desl ?? 0);

  // Torno normal: Z0 na face da peça, Z negativo entra na peça
  const zS = (zGeo: number) => zGeo - geo.zFront;
  const transOp = (op: StarTMOp) => {
    const og = origs[(op.orig || 1) - 1] || origs[0];
    return fmt(og ? og.desl || 0 : 0);
  };

  const out: string[] = [];
  const W = (l: string) => out.push(l);

  W(`%_N_${nm}_MPF`);
  W(`;$PATH=/_N_WKS_DIR/_N_${nm}_WPD`);
  W("INICIO:");
  W("G0G90G53X150Z150T0D0M9");
  W(`TRANS Z${zeroPeca}`);
  W("G95");
  W(`R0=${fmt(bD)} ;DIAM. DA BARRA`);
  W(`R1=${fmt(geo.L)} ;COMPRIMENTO DA PECA`);
  W(`R2=${tTope} ;NUMERO DA ESTACAO DO TOPE`);
  W(`R3=${tBedame} ;NUMERO DA ESTACAO DO BEDAME`);
  W("R4=4 ;SENTIDO DE GIRO BEDAME");
  W(`R5=${fmt(fCorte)} ;AVANCO PARA O BEDAME`);
  W(`R6=${fmt(sobreFace)} ;SOBREMETAL PARA FACEAR APOS ALIMENTACAO`);
  W(`R7=${fmt(largCorte)} ;LARGURA BEDAME`);
  W(`R8=${rpmCortePonta} ;ROTACAO PARA BEDAME NO CORTE DA PONTA DA BARRA`);
  W("R9=3 ;ESPESSURA PARA CORTE");
  W("ALIMENTACAOERGOMAT ;NOME DO SUB PROGRAMA");

  let nBloco = 10;
  let estFallback = 1;
  const opsPrincipais = ativos.filter((o) => o.tipo !== "corte");

  opsPrincipais.forEach((op) => {
    const p = op.p;
    const fxs = op.faixas.length ? op.faixas : faixaPadraoSiemens(op.tipo, geo, p) || [];
    if (!fxs.length) return;

    while (estFallback === tBedame || estFallback === tTope) estFallback++;
    const tEst = extrairEstacao(op.ferr, estFallback++);
    const desc = (op.nomeFerr || DESC_TIPO_STAR[op.tipo] || op.tipo).toUpperCase().replace(/[();]/g, "");
    const aprox = p.apz !== undefined ? p.apz : 2;
    const vc = Math.round(p.vc ?? 180);
    const lim = (p.lim ?? 0) > 0 ? Math.round(p.lim) : cfg.rpmMax || 3000;
    const rpm = (p.rpm ?? 0) > 0 ? Math.round(p.rpm) : 1200;

    W(`N${nBloco}G0G90G53X150Z150T0D0`);
    W(`TRANS Z${transOp(op)}`);
    W("G95");
    W(`T${tEst}D1 ;(${desc})`);
    nBloco += 10;

    if (op.tipo === "centro" || op.tipo === "furo" || op.tipo === "macho") {
      W(`G97S${rpm}M3`);
    } else if (op.tipo === "roscaExt" || op.tipo === "roscaInt") {
      W(`G97S${Math.round(p.rpm ?? (op.tipo === "roscaInt" ? 600 : 800))}M4`);
    } else if (p.mr === 1 && (p.rpm ?? 0) > 0) {
      W(`G97S${Math.round(p.rpm)}M4`);
    } else {
      W(`G96S${vc}M4LIMS=${lim}`);
    }

    const zFrontClear = zS(geo.zFront) + Math.max(1, aprox);

    if (op.tipo === "face") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zTopo = zIni - zFim < 0.001 ? zFim + (p.sobre ?? 0.5) : zIni;
      const xi = (p.xi ?? 0) > 0 ? p.xi : bD + 2;
      const xf = p.xf !== undefined ? p.xf : -1.6;
      const apFace = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
      W(`G0X${fmt(Math.max(xi, bD + 2))}Z${fmt(Math.max(zFrontClear, zS(zTopo) + aprox))}M7`);
      if (zS(zTopo) + aprox < zFrontClear - 1e-4) W(`G0Z${fmt(zS(zTopo) + aprox)}`);
      if (xi < bD + 2) W(`G0X${fmt(xi)}`);
      const passos: number[] = [];
      let z = zTopo;
      let g = 0;
      while (g++ < 500 && z - apFace > zFim + 1e-6) {
        z -= apFace;
        passos.push(z);
      }
      passos.push(zFim);
      passos.forEach((zp) => {
        W(`G0Z${fmt(zS(zp))}`);
        W(`G1X${fmt(xf)}F${fmt(p.f ?? 0.15)}`);
        W(`G0Z${fmt(zS(zp) + 0.5)}`);
        W(`G0X${fmt(xi)}`);
      });
    } else if (op.tipo === "desbExt" || op.tipo === "acabExt") {
      let s = subIntervalos(geo.ext, fxs);
      let gS = 0;
      while (gS++ < 500 && s.length > 1 && s[0].zA - s[0].zB < 1e-9) s = s.slice(1);
      if (s.length) {
        const real = p.real === 1;
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, false, real), angM), p.rp ?? 0.4, false);
        const zStart = zS(pts[0].z) + aprox;
        const xSai = Math.max(bD + 2, pts[pts.length - 1].x + 1);
        W(`G0X${fmt(bD + 2)}Z${fmt(Math.max(zFrontClear, zStart))}M7`);
        if (zStart < zFrontClear - 1e-4) W(`G0Z${fmt(zStart)}`);
        if (op.tipo === "desbExt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1.5) > 0 ? p.ap : 1.5);
          const mono = real ? compensarRaio(perfilMono(s, false, false), p.rp ?? 0.4, false) : pts;
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
            W(`G0X${fmt(xp)}Z${fmt(zStart)}`);
            W(`G1Z${fmt(zS(zl) + (p.w ?? 0.1))}F${fmt(p.f ?? 0.25)}`);
            W(`G1X${fmt(xp + 1)}`);
            W(`G0Z${fmt(zStart)}`);
          }
          W(`G0X${fmt(bD + 2)}`);
        } else {
          W(`G0X${fmt(pts[0].x)}`);
          emitirContornoSiemens(out, pts, zS, p.f ?? 0.1);
          W(`G1X${fmt(xSai)}`);
        }
      }
    } else if (op.tipo === "canal" || op.tipo === "canalInt") {
      const interno = op.tipo === "canalInt";
      const s = subIntervalos(interno ? geo.int : geo.ext, fxs);
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
      const pk = (p.pk ?? 1) > 0 ? p.pk : 0;
      const re = Math.max(0.2, p.re ?? 0.5);
      const xStart = interno ? Math.max(2, geo.intDmin - 1) : bD + 2;
      if (interno) {
        W(`G0X${fmt(xStart)}Z${fmt(zFrontClear)}M7`);
        if (Math.abs(zS(zIni) - zFrontClear) > 1e-4) W(`G0Z${fmt(zS(zIni))}`);
      } else {
        W(`G0X${fmt(xStart)}Z${fmt(Math.max(zFrontClear, zS(zIni)))}M7`);
        if (zS(zIni) < zFrontClear - 1e-4) W(`G0Z${fmt(zS(zIni))}`);
      }
      let zCur = zIni;
      let gC = 0;
      while (gC++ < 200) {
        W(`G0Z${fmt(zS(zCur))}`);
        if (pk > 0) {
          let xCur = xStart;
          let gP = 0;
          while (gP++ < 200 && (interno ? xCur < dFundo - 1e-4 : xCur > dFundo + 1e-4)) {
            xCur = interno ? Math.min(dFundo, xCur + 2 * pk) : Math.max(dFundo, xCur - 2 * pk);
            W(`G1X${fmt(xCur)}F${fmt(p.f ?? 0.05)}`);
            if (interno ? xCur < dFundo - 1e-4 : xCur > dFundo + 1e-4) {
              W(`G0X${fmt(interno ? Math.max(xStart, xCur - 2 * re) : Math.min(xStart, xCur + 2 * re))}`);
            }
          }
        } else {
          W(`G1X${fmt(dFundo)}F${fmt(p.f ?? 0.05)}`);
        }
        W(`G0X${fmt(xStart)}`);
        if (zCur <= zFim + 1e-4) break;
        zCur = Math.max(zFim, zCur - passoZ);
      }
      if (interno) W(`G0Z${fmt(zFrontClear)}`);
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
      const q1 = Math.max(0.05, p.q ?? 0.25);
      const xStart = interno ? Math.max(2, (p.d0 ?? 0) > 0 ? p.d0 - 2 : dNom - 2) : dNom + 3;
      const nPasses = Math.max(2, Math.min(30, Math.ceil(h / q1) + 1));
      const zEntry = zS(zIni) + aprox;
      if (interno) {
        W(`G0X${fmt(xStart)}Z${fmt(zFrontClear)}M7`);
        if (Math.abs(zEntry - zFrontClear) > 1e-4) W(`G0Z${fmt(zEntry)}`);
      } else {
        W(`G0X${fmt(Math.max(bD + 2, xStart))}Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
        if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zEntry)}`);
        if (xStart < bD + 2) W(`G0X${fmt(xStart)}`);
      }
      for (let k = 1; k <= nPasses; k++) {
        const frac = Math.sqrt(k / nPasses);
        const xPasse = interno ? dNom + 2 * h * frac : dNom - 2 * h * frac;
        W(`G0X${fmt(xPasse)}`);
        W(`G33Z${fmt(zS(zFim))}K${fmt(passo)}`);
        W(`G0X${fmt(xStart)}`);
        W(`G0Z${fmt(zEntry)}`);
      }
      if (interno) W(`G0Z${fmt(zFrontClear)}`);
      else W(`G0X${fmt(Math.max(bD + 2, xStart))}`);
    } else if (op.tipo === "centro") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zS(zIni) + aprox;
      W(`G0X0Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zEntry)}`);
      W(`G1Z${fmt(zS(zFim))}F${fmt(p.f ?? 0.08)}`);
      W(`G0Z${fmt(Math.max(zFrontClear, zEntry))}`);
    } else if (op.tipo === "furo") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zIniS = zS(zIni);
      const zFimS = zS(zFim);
      const zEntry = zIniS + aprox;
      const qMm = Math.max(0.5, p.q ?? 5);
      W(`G0X0Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zEntry)}`);
      let zCur = zIniS;
      let g = 0;
      while (g++ < 500 && zCur > zFimS + 1e-6) {
        zCur = Math.max(zFimS, zCur - qMm);
        W(`G1Z${fmt(zCur)}F${fmt(p.f ?? 0.1)}`);
        W(`G0Z${fmt(zEntry)}`);
        if (zCur > zFimS + 1e-6) W(`G0Z${fmt(Math.min(zIniS + 0.5, zCur + 0.5))}`);
      }
      if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zFrontClear)}`);
    } else if (op.tipo === "macho") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zS(zIni) + aprox;
      const passo = Math.max(0.2, p.passo ?? 1.5);
      W(`G0X0Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zEntry)}`);
      W(`G1Z${fmt(zS(zFim))}F${fmt(passo)}`);
      W("M4");
      W(`G1Z${fmt(zEntry)}F${fmt(passo)}`);
      if (zEntry < zFrontClear - 1e-4) W(`G0Z${fmt(zFrontClear)}`);
    } else if (op.tipo === "desbInt" || op.tipo === "acabInt") {
      const s = subIntervalos(geo.int, fxs);
      if (s.length) {
        const real = p.real === 1;
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, true, real), angM), p.rp ?? 0.4, true);
        const dSeg = op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin;
        const xEnt = Math.max(1, dSeg - ((p.fi ?? 1) > 0 ? p.fi : 1));
        const zStart = zS(pts[0].z) + aprox;
        W(`G0X${fmt(xEnt)}Z${fmt(Math.max(zFrontClear, zStart))}M7`);
        if (zStart < zFrontClear - 1e-4) W(`G0Z${fmt(zStart)}`);
        if (op.tipo === "desbInt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
          const xMaxInt = Math.max(...pts.map((q) => q.x)) - (p.u ?? 0.3);
          let xp = dSeg;
          let gXp = 0;
          while (gXp++ < 1000 && xp < xMaxInt - 1e-6) {
            const nx = Math.min(xMaxInt, xp + 2 * apDesb);
            if (nx <= xp + 1e-6) break;
            xp = nx;
            const zl = zOndeAlvo(pts, xp - 1e-6, true);
            W(`G0X${fmt(xp)}Z${fmt(zStart)}`);
            W(`G1Z${fmt(zS(zl) + (p.w ?? 0.1))}F${fmt(p.f ?? 0.2)}`);
            W(`G1X${fmt(Math.max(1, xp - 1))}`);
            W(`G0Z${fmt(zStart)}`);
          }
        } else {
          W(`G0X${fmt(pts[0].x)}`);
          emitirContornoSiemens(out, pts, zS, p.f ?? 0.08);
          W(`G1X${fmt(xEnt)}`);
          W(`G0Z${fmt(zStart)}`);
        }
        W(`G0Z${fmt(zFrontClear)}`);
      }
    }

    W(`G0X${fmt(Math.max(50, bD + 4))}`);
  });

  // Corte e fim
  const dMenor = geo.int.length > 0 ? Math.max(0, geo.intDmin) : Math.max(0, Math.min(geo.dTras, bD));
  W(`N${nBloco}G0G90G53X150Z150T0D0`);
  W(`TRANS Z${zeroPeca}`);
  W("G95");
  W(`T${tBedame}D1 ;(BEDAME)`);
  W(`G96S${vcCorte}M4LIMS=${limCorte}`);
  W(`G0X${fmt(bD + 2)}Z2.0M7`);
  W(`G0Z-${fmt(geo.L)}`);
  W(`G1X${fmt(dMenor + 2)}F.05M94`);
  W("G1X-2.8F.03");
  W(`G0X${fmt(bD + 2)}M95`);
  W("G0G53G90X150Z150T0D0");
  W("R22=R22+R23");
  W("IF R21==R22 GOTOF FINAL");
  W("GOTOB INICIO");
  W("FINAL:");
  W("MSG");
  W("M5");
  W("M0");
  W("M30");

  return {
    textos: [out.join("\n"), ""],
    nomes: [mpfNome, mpfNome],
    doisCanais: false,
    unicoCanal: true,
  };
}
