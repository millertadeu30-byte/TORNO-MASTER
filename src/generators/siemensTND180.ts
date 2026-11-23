import {
  StarTMOp,
  StarTMGeo,
  StarGerarCfg,
  StarTMPt,
  StarTMIntervalo,
  StarTMFaixa,
  DESC_TIPO_STAR,
  emitirContornoArcos,
  detectarCanaisStar,
  planoCanalStar,
  criarEmissorOpsStar,
} from "./star18iTB";
import { MAQUINAS_DNA } from "../data/maquinasDNA";

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
  // REGIÃO ESCOLHIDA ALÉM DO FIM DA PEÇA ("termina em Z" depois do fim): o perfil CONTINUA reto no último Ø até o Z escolhido
  const naoVert = iv.filter((q) => q.zA - q.zB > 1e-9);
  if (naoVert.length && uni.length) {
    const zTras = Math.min(...naoVert.map((q) => q.zB));
    const qT = naoVert.find((q) => Math.abs(q.zB - zTras) < 1e-9)!;
    const zLo = Math.min(...uni.map((u) => u[0]));
    if (zLo < zTras - 1e-3 && uni.some((u) => u[0] < zTras - 1e-3 && u[1] >= zTras - 1e-6)) {
      for (let k = r.length - 1; k >= 0; k--) if (r[k].zA - r[k].zB < 1e-9 && Math.abs(r[k].zA - zTras) < 1e-6) r.splice(k, 1);
      r.push({ zA: zTras, zB: zLo, xa: qT.xb, xb: qT.xb });
    }
  }
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
  emitirContornoArcos(out, pts, zCoord, fmt, "siemens", fAcab, { emitStart: false });
}

export function tmGerarSiemensTND180(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): SiemensGerarResult {
  const nmBruto = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const nm = nmBruto || "PECA";
  const mpfNome = `${nm}.MPF`;

  const origs = cfg.origens || [];
  const ativos = ops.filter((o) => o.ativo);
  // RESTO DE OPERAÇÃO: mesma conta do motor único (o que a(s) operação(ões) do campo "Resto" deixou(aram) na peça)
  let emiResto: ReturnType<typeof criarEmissorOpsStar> | null = null;
  try { emiResto = criarEmissorOpsStar(ops, geo, cfg); } catch { emiResto = null; }
  const restoExtS = (o: StarTMOp) => { try { return emiResto ? emiResto.restoExtOp(o) : null; } catch { return null; } };
  const restoIntS = (o: StarTMOp) => { try { return emiResto ? emiResto.restoIntOp(o) : null; } catch { return null; } };
  // RESTO no CANAL: o bedame desce em G0 até 0,5 acima do material que a operação do "Resto" deixou (na largura do bedame)
  const xRestoC = (o: StarTMOp, zProg: number, larg: number, xTopo: number, zMap: (z: number) => number) => {
    const r = restoExtS(o);
    if (!r) return xTopo;
    const z0 = zMap(0), k = zMap(1) - z0;
    if (Math.abs(k) < 1e-9) return xTopo;
    const zg = (zProg - z0) / k;
    let mx = 0;
    for (let d = -larg; d <= larg + 1e-9; d += 0.05) mx = Math.max(mx, r.nivel(zg + d));
    return Math.min(xTopo, mx + 0.5);
  };

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
  const transZVal = cfg.transZ !== undefined && isFinite(cfg.transZ) ? fmt(cfg.transZ) : "0.0";
  const dnaRecuo = MAQUINAS_DNA.find((m) => m.id === (cfg.maqId || "TND180_N03"))?.recuoTroca;
  const fmtS = (n: number) => (Number.isInteger(n) ? String(n) : fmt(n));
  const recX = fmtS(cfg.recuoTroca?.x ?? dnaRecuo?.x ?? 150);
  const recZ = fmtS(cfg.recuoTroca?.z ?? dnaRecuo?.z ?? 150);

  // Torno normal: Z0 na face da frente da peça, Z negativo entra na peça (nunca soma deslocamento do painel Peça)
  const zS = (zGeo: number) => zGeo - geo.zFront;

  const out: string[] = [];
  const W = (l: string) => out.push(l);

  W(`%_N_${nm}_MPF`);
  W(`;$PATH=/_N_WKS_DIR/_N_${nm}_WPD`);
  W("INICIO:");
  W(`G0G90G53X${recX}Z${recZ}T0D0M9`);
  W(`TRANS Z${transZVal}`);
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
    if ((cfg as any).soloId && op.id !== (cfg as any).soloId) return; // simular só esta operação
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

    if (op.tipo === "furo") {
      const dBroca = p.d ?? 0;
      if (dBroca <= 0) {
        W(`;PENDENCIA: ${desc} - INFORMAR DIAMETRO DA BROCA`);
        return;
      }
      // menor Ø interno DENTRO da região da furação (não o menor furo da peça inteira)
      const dLimFuro = (() => { let mm = Infinity; for (const q of geo.int) { if (Math.abs(q.zA - q.zB) < 1e-6) continue; const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB); for (const fr of (op.faixas || [])) { const a = Math.max(lo, Math.min(fr[0], fr[1])), b = Math.min(hi, Math.max(fr[0], fr[1])); if (b - a < 1e-6) continue; const xz = (z: number) => q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa); mm = Math.min(mm, xz(a), xz(b)); } } return isFinite(mm) ? mm : geo.intDmin; })();
      if (dLimFuro > 0 && dBroca > dLimFuro + 0.05) {
        W(`;PENDENCIA: ${desc} - BROCA D${fmt(dBroca)} MAIOR QUE FURO D${fmt(dLimFuro)}`);
        return;
      }
    }
    if (op.tipo === "desbInt" || op.tipo === "acabInt" || op.tipo === "canalInt" || op.tipo === "roscaInt") {
      if (!geo.int.length || !subIntervalos(geo.int, fxs).length) {
        W(`;PENDENCIA: ${desc} - SEM PERFIL INTERNO NA REGIAO`);
        return;
      }
      const dSegChk = (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin; // furo já aberto (pré-furo da operação anterior) vale para TODAS as internas
      const bm = p.bm ?? 0;
      const fb = p.fb ?? 0.5;
      if (bm > 0 && bm + fb > dSegChk + (op.tipo === "desbInt" ? 2 * Math.max(0.05, p.ap ?? 1) : 0) + 1e-6) {
        W(`;PENDENCIA: ${desc} - BARRA D${fmt(bm)} NAO CABE NO FURO D${fmt(dSegChk)}`);
        return;
      }
    }

    W(`N${nBloco}G0G90G53X${recX}Z${recZ}T0D0`);
    W(`TRANS Z${transZVal}`);
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

    // PONTO A PONTO: caminho RÍGIDO pelos pontos clicados (na ordem), igual ao motor único das outras máquinas
    const ppPts = (((op as any).pontos || []) as { z: number; x: number }[]).filter((q) => isFinite(q.z) && isFinite(q.x));
    if (ppPts.length >= 2 && !["furo", "centro", "corte", "roscaExt", "roscaInt", "macho"].includes(op.tipo)) {
      const intPP = ["desbInt", "acabInt", "canalInt"].includes(op.tipo);
      const fPP = p.f ?? 0.1;
      const xSegPP = intPP ? Math.max(0, Math.min(...ppPts.map((q) => q.x)) - 1) : Math.max(bD + 1, Math.max(...ppPts.map((q) => q.x)) + 1);
      
      W(";PONTO A PONTO - " + ppPts.length + " PONTOS - CAMINHO RIGIDO NA ORDEM DOS CLIQUES");
      const p1 = ppPts[0];
      // chega em G0 até 0,5 do bruto (externo) ou do pré-furo (interno) - ou direto no ponto 1 se ele já está no ar - e entra em G1
      // RESTO: G0 até 0,5 do que a operação do "Resto" deixou no ponto 1 (0 = do bruto / pré-furo)
      const rIpp = intPP ? restoIntS(op) : null;
      const rEpp = intPP ? null : restoExtS(op);
      const dAbPP = rIpp && rIpp.dMin > 0 ? rIpp.dMin : (p.d0 ?? 0) > 0 ? (p.d0 as number) : 0;
      const xAp = intPP ? (dAbPP > 0 ? Math.min(p1.x, dAbPP - 0.5) : p1.x) : Math.max(p1.x, Math.min(bD, rEpp ? rEpp.nivel(p1.z) : bD) + 0.5);
      W("G0X" + fmt(xSegPP) + "Z" + fmt(zFrontClear));
      W("G0Z" + fmt(zS(p1.z)));
      W("G0X" + fmt(xAp));
      const semF = !(Math.abs(xAp - p1.x) > 1e-4);
      if (!semF) W("G1X" + fmt(p1.x) + "F" + fmt(fPP));
      for (let i = 1; i < ppPts.length; i++) W("G1X" + fmt(ppPts[i].x) + "Z" + fmt(zS(ppPts[i].z)) + (i === 1 && semF ? "F" + fmt(fPP) : ""));
      W("G0X" + fmt(xSegPP));
      W("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "face") {
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
          // REBAIXOS / MERGULHOS (mesma regra consolidada da TBSy): "Entrar nos rebaixos = 1" -> depois do desbaste por fora
          // (com ou sem ciclo) desbasta os rebaixos entrando pela rampa já usinada, sempre no sentido do cabeçote,
          // respeitando o ângulo da pastilha e o raio da ponta. O que a pastilha não alcança fica para o bedame.
          const fazerRebaixos = () => {
            if (p.real !== 1) return;
            const angR = (p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27;
            const rpR = p.rp ?? 0.4;
            const alvo = compensarRaio(limitaMergulho(perfilMono(s, false, true), angR), rpR, false);
            const env = compensarRaio(perfilMono(s, false, false), rpR, false);
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
            const xSafe = bD + 2;
            const rebs: [number, number][] = [];
            let ini = -1;
            ZG.forEach((_z, i) => {
              const fundo = TA[i] < MA[i] - 0.02;
              if (fundo && ini < 0) ini = i;
              if ((!fundo || i === ZG.length - 1) && ini >= 0) { rebs.push([ini, fundo ? i : i - 1]); ini = -1; }
            });
            if (rebs.length) W("; MERGULHO LIMITADO A " + fmt(angR) + " GRAUS - O QUE A PASTILHA NAO ALCANCA SOBRA PARA O BEDAME");
            rebs.forEach(([i0, i1], ir) => {
              const idx: number[] = [];
              for (let i = i0; i <= i1; i++) idx.push(i);
              const topo = Math.max(...idx.map((i) => MA[i]));
              const fundoMin = Math.min(...idx.map((i) => TA[i]));
              W("; REBAIXO " + (ir + 1) + " Z" + fmt(zS(ZG[i0])) + " A Z" + fmt(zS(ZG[i1])) + " - ENTRA PELA RAMPA, SEMPRE NO SENTIDO DA PLACA");
              W("G0X" + fmt(xSafe));
              W("G0Z" + fmt(zS(ZG[i0])));
              let curX = MA[i0] + 0.5;
              let curZi = i0;
              W("G0X" + fmt(curX));
              let L = topo;
              let g = 0;
              while (g++ < 500 && L > fundoMin + 1e-6) {
                const prevL = L;
                L = Math.max(fundoMin, L - dAp);
                const runs: [number, number][] = [];
                let a = -1;
                idx.forEach((i, k) => {
                  const corta = TA[i] < L - 1e-6 && MA[i] > L + 1e-6;
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
                  W("G0X" + fmt(H));
                  W("G0Z" + fmt(zS(ZG[ie])));
                  W("G0X" + fmt(xEnt + 0.2));
                  W("G1X" + fmt(xEnt) + "F" + fmt(fR));
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
                  for (let k = 1; k < rs.length; k++) W("G1X" + fmt(rs[k].x) + "Z" + fmt(zS(rs[k].z)));
                  W("G1Z" + fmt(zS(ZG[ib])));
                  curX = Math.min(L + r1, prevL);
                  curZi = ib;
                  W("G1X" + fmt(curX) + " ;SOBE DENTRO DA AREA JA USINADA");
                });
              }
              W("G0X" + fmt(xSafe) + " ;SAI DO REBAIXO POR CIMA");
            });
          };
          const uOff = Math.max(0, p.u ?? 0.4);
          const wOff = Math.max(0, p.w ?? 0.1);
          const rawMono = perfilMono(s, false, false);
          const rawOff = rawMono.map((q) => ({ x: q.x + uOff, z: q.z + wOff }));
          const compOff = compensarRaio(rawOff, p.rp ?? 0.4, false);
          const xMin = Math.min(...compOff.map((q) => q.x), ...rawOff.map((q) => q.x));
            // degraus retos da peça (+ sobremetal): o passe PARA neles (ex.: Ø28,4 + 0,4 = Ø28,8), igual à TBSy
            const platE = Array.from(new Set(compOff.filter((q, k) => k < compOff.length - 1 && Math.abs(compOff[k + 1].x - q.x) < 2e-3 && Math.abs(compOff[k + 1].z - q.z) > 0.05).map((q) => Math.round(q.x * 1000) / 1000)));
          const rEdS = restoExtS(op);
          if (rEdS) W(";RESTO DA " + rEdS.nome + ": PASSES SO ONDE ELA DEIXOU MATERIAL");
          let xp = bD;
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
            // RESTO: o passe só corta onde a operação do "Resto" deixou material acima dele; até lá vai em G0
            let zMatR = pts[0].z;
            if (rEdS) { let achou = false; for (let zz = pts[0].z; zz >= zl - 1e-9; zz -= 0.05) { if (rEdS.nivel(zz) > xp + 1e-6) { zMatR = zz; achou = true; break; } } if (!achou) continue; }
            const zEndS = zS(zl);
            const xRet = Math.min(bD + 2, xp + Math.min(2 * apDesb, 1.5));
            W(`G0X${fmt(xp)}`);
            if (zMatR < pts[0].z - 0.5) W(`G0Z${fmt(zS(zMatR + 0.5))}`);
            W(`G1Z${fmt(zEndS)}F${fmt(p.f ?? 0.25)}`);
            W(`G1X${fmt(xRet)}Z${fmt(zEndS + 0.5)}`);
            W(`G0Z${fmt(zStart)}`);
          }
          W(`G0X${fmt(bD + 2)}`);
          fazerRebaixos();
        } else {
          W(`G0X${fmt(pts[0].x)}`);
          emitirContornoSiemens(out, pts, zS, p.f ?? 0.1);
          W(`G1X${fmt(xSai)}`);
        }
      }
    } else if (op.tipo === "canal" || op.tipo === "canalInt") {
      const interno = op.tipo === "canalInt";
      const s = subIntervalos(interno ? geo.int : geo.ext, fxs);
      const larg = Math.max(0.5, p.larg ?? 3);
      const passoZ = (p.ps ?? 0) > 0 ? p.ps : larg * 0.8;
      const pk = (p.pk ?? 1) > 0 ? p.pk : 0;
      const re = Math.max(0.2, p.re ?? 0.5);
      const xStart = interno ? Math.max(1, geo.intDmin - 1) : bD + 2;
      if (interno) {
        const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const dFundo = s.length
          ? Math.max(...s.map((q) => Math.max(q.xa, q.xb)))
          : geo.intDmin + 2;
        W(`G0X${fmt(bD + 2)}Z${fmt(zFrontClear)}M7`);
        W(`G0X${fmt(xStart)}`);
        if (Math.abs(zS(zIni) - zFrontClear) > 1e-4) W(`G0Z${fmt(zS(zIni))}`);
        let zCur = zIni;
        let gC = 0;
        while (gC++ < 200) {
          W(`G0Z${fmt(zS(zCur))}`);
          if (pk > 0) {
            let xCur = xStart;
            let gP = 0;
            while (gP++ < 200 && xCur < dFundo - 1e-4) {
              xCur = Math.min(dFundo, xCur + 2 * pk);
              W(`G1X${fmt(xCur)}F${fmt(p.f ?? 0.05)}`);
              if (xCur < dFundo - 1e-4) {
                W(`G0X${fmt(Math.max(xStart, xCur - 2 * re))}`);
              }
            }
          } else {
            W(`G1X${fmt(dFundo)}F${fmt(p.f ?? 0.05)}`);
          }
          W(`G0X${fmt(xStart)}`);
          if (zCur <= zFim + 1e-4) break;
          zCur = Math.max(zFim, zCur - passoZ);
        }
        W(`G0Z${fmt(zFrontClear)}`);
      } else {
        let canais = s.length ? detectarCanaisStar(s) : [];
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
          W(`;CANAL: NADA PARA CORTAR SEM INVADIR FLANCOS COM BEDAME L${fmt(larg)}`);
        } else {
          let primeiroMov = true;
          planos.forEach((pl) => {
            pl.grupos.forEach((g) => {
              const zStartG = zS(g[0].z);
              const zEndG = zS(g[g.length - 1].z);
              const dFundoG = g[0].d;
              if (primeiroMov) {
                primeiroMov = false;
                W(`G0X${fmt(xStart)}Z${fmt(Math.max(zFrontClear, zStartG))}M7`);
                if (zStartG < zFrontClear - 1e-4) W(`G0Z${fmt(zStartG)}`);
              }
              const stepZ = zEndG <= zStartG ? -Math.max(0.2, passoZ) : Math.max(0.2, passoZ);
              let zCur = zStartG;
              let gC = 0;
              while (gC++ < 200) {
                W(`G0Z${fmt(zCur)}`);
                const xIniC = xRestoC(op, zCur, larg, xStart, zS);
                if (xIniC < xStart - 1e-4) W(`G0X${fmt(xIniC)}`);
                if (pk > 0) {
                  let xCur = xIniC;
                  let gP = 0;
                  while (gP++ < 200 && xCur > dFundoG + 1e-4) {
                    xCur = Math.max(dFundoG, xCur - 2 * pk);
                    W(`G1X${fmt(xCur)}F${fmt(p.f ?? 0.05)}`);
                    if (xCur > dFundoG + 1e-4) {
                      W(`G0X${fmt(Math.min(xStart, xCur + 2 * re))}`);
                    }
                  }
                } else {
                  W(`G1X${fmt(dFundoG)}F${fmt(p.f ?? 0.05)}`);
                }
                W(`G0X${fmt(xStart)}`);
                if (Math.abs(zCur - zEndG) < 1e-4) break;
                zCur = stepZ < 0 ? Math.max(zEndG, zCur + stepZ) : Math.min(zEndG, zCur + stepZ);
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
      const q1 = Math.max(0.05, p.q ?? 0.25);
      const xStart = interno ? Math.max(2, (p.d0 ?? 0) > 0 ? p.d0 - 2 : dNom - 2) : dNom + 3;
      const nPasses = Math.max(2, Math.min(30, Math.ceil(h / q1) + 1));
      const zEntry = zS(zIni) + aprox;
      if (interno) {
        W(`G0X${fmt(bD + 2)}Z${fmt(zFrontClear)}M7`);
        W(`G0X${fmt(xStart)}`);
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
      W(`G0X${fmt(bD + 2)}Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      W("G0X0");
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
      W(`G0X${fmt(bD + 2)}Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      W("G0X0");
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
      W(`G0X${fmt(bD + 2)}Z${fmt(Math.max(zFrontClear, zEntry))}M7`);
      W("G0X0");
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
        const rIdS = op.tipo === "desbInt" ? restoIntS(op) : null; // RESTO: começa do Ø que a operação do "Resto" já abriu
      const dSeg = rIdS && rIdS.dMin > 0 ? rIdS.dMin : op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin;
        const xEnt = Math.max(1, dSeg - ((p.fi ?? 1) > 0 ? p.fi : 1));
        const zStart = zS(pts[0].z) + aprox;
        W(`G0X${fmt(bD + 2)}Z${fmt(Math.max(zFrontClear, zStart))}M7`);
        W(`G0X${fmt(xEnt)}`);
        if (zStart < zFrontClear - 1e-4) W(`G0Z${fmt(zStart)}`);
        if (op.tipo === "desbInt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
          const uOff = Math.max(0, p.u ?? 0.3);
          const wOff = Math.max(0, p.w ?? 0.1);
          const rawMono = perfilMono(s, true, false);
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
            const zEndS = zS(zl);
            const xRet = Math.max(1, xp - Math.min(2 * apDesb, 1.5));
            W(`G0X${fmt(xp)}Z${fmt(zStart)}`);
            W(`G1Z${fmt(zEndS)}F${fmt(p.f ?? 0.2)}`);
            W(`G1X${fmt(xRet)}Z${fmt(zEndS + 0.5)}`);
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

  });

  // Corte e fim
  const dMenor = geo.int.length > 0 ? Math.max(0, geo.intDmin) : Math.max(0, Math.min(geo.dTras, bD));
  W(`N${nBloco}G0G90G53X${recX}Z${recZ}T0D0`);
  W(`TRANS Z${transZVal}`);
  W("G95");
  W(`T${tBedame}D1 ;(BEDAME)`);
  W(`G96S${vcCorte}M4LIMS=${limCorte}`);
  W(`G0X${fmt(bD + 2)}Z2.0M7`);
  W(`G0Z-${fmt(geo.L)}`);
  W(`G1X${fmt(dMenor + 2)}F.05M94`);
  W("G1X-2.8F.03");
  W(`G0X${fmt(bD + 2)}M95`);
  W(`G0G53G90X${recX}Z${recZ}T0D0`);
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
