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
  espelharXLinhas,
  blocosOpsGerados,
  criarEmissorOpsStar,
} from "./star18iTB";
import { MAQUINAS_DNA } from "../data/maquinasDNA";

export interface IndexGerarResult {
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

const pad2 = (n: number) => String(Math.max(1, Math.min(99, Math.round(n)))).padStart(2, "0");
const pad3 = (n: number) => String(Math.max(1, Math.min(999, Math.round(n)))).padStart(3, "0");

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

function faixaPadraoIndex(tipo: StarTMOp["tipo"], geo: StarTMGeo, p: Record<string, number>): StarTMFaixa[] | null {
  if (tipo === "face") return [[geo.zFront, geo.zFront + (p.sobre !== undefined ? p.sobre : 0.5)]];
  if (tipo === "centro") return [[geo.zFront - (p.prof !== undefined ? p.prof : 2), geo.zFront]];
  if (tipo === "corte") return [[geo.zBack, geo.zBack]];
  return null;
}

const SYNC_INDEX_ESPERADOS = [
  "M2010",
  "M2020",
  "M2025",
  "M2030",
  "M2031",
  "M2032",
  "M2049",
  "M2050",
  "M2051",
  "M2059",
  "M2060",
  "M2061",
  "M2070",
  "M2080",
];

function extrairSincronismosIndex(linhas: string[]): string[] {
  const res: string[] = [];
  for (const ln of linhas) {
    const semCom = ln.split(";")[0].replace(/\([^)]*\)/g, "").trim().toUpperCase();
    if (!semCom) continue;
    const matches = semCom.matchAll(/(?<![A-Z0-9])M(20\d{2})(?!\d)/g);
    for (const m of matches) res.push("M" + m[1]);
  }
  return res;
}

export function validarSincronismoIndexABC(o2000Lines: string[], o1000Lines: string[]): string | null {
  const s2 = extrairSincronismosIndex(o2000Lines);
  const s1 = extrairSincronismosIndex(o1000Lines);
  if (!s2.length || !s1.length) {
    return "Erro de sincronismo (Index ABC): códigos M2010..M2080 obrigatórios em O2000 e O1000.";
  }
  const dup2 = s2.find((c, i) => s2.indexOf(c) !== i);
  if (dup2) return `Erro de sincronismo (Index ABC): ${dup2} repetido em O2000.`;
  const dup1 = s1.find((c, i) => s1.indexOf(c) !== i);
  if (dup1) return `Erro de sincronismo (Index ABC): ${dup1} repetido em O1000.`;
  if (s2.length !== s1.length) {
    return `Erro de sincronismo (Index ABC): quantidade diferente entre O2000 (${s2.join(", ")}) e O1000 (${s1.join(", ")}).`;
  }
  for (let i = 0; i < s2.length; i++) {
    if (s2[i] !== s1[i]) {
      return `Erro de sincronismo (Index ABC): ordem divergente entre O2000 (${s2.join(", ")}) e O1000 (${s1.join(", ")}).`;
    }
  }
  for (const esp of SYNC_INDEX_ESPERADOS) {
    if (!s2.includes(esp)) {
      return `Erro de sincronismo (Index ABC): código obrigatório ${esp} ausente.`;
    }
  }
  return null;
}

function resolverFerrIndex(
  ferr: string,
  carro: 1 | 2 | 3,
  reservadas: number[],
  fallbackRef: { next: number }
): { tCode: string; pos: number } {
  const up = (ferr || "").toUpperCase().trim();
  const m6 = up.match(/^T([123])(\d{2})(\d{3})$/);
  if (m6 && Number(m6[1]) === carro) {
    const pos = parseInt(m6[2], 10);
    if (!reservadas.includes(pos)) return { tCode: up, pos };
  }
  const m4 = up.match(/^T(\d{2})/);
  let pos = m4 ? parseInt(m4[1], 10) : 0;
  if (!(pos >= 1 && pos <= 12) || reservadas.includes(pos)) {
    while (reservadas.includes(fallbackRef.next)) fallbackRef.next++;
    pos = fallbackRef.next++;
  }
  const corr = carro * 10 + (pos % 10);
  return { tCode: `T${carro}${pad2(pos)}${pad3(corr)}`, pos };
}

export function tmGerarIndexABC(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): IndexGerarResult {
  const nmBruto = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_\- ]/g, "_");
  const nm = nmBruto || "PECA";
  const bD = cfg.bD;
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
  const corteOp = ativos.find((o) => o.tipo === "corte");
  const largCorte = corteOp ? (corteOp.p.larg !== undefined ? corteOp.p.larg : 3) : 3;
  const fCorte = corteOp && (corteOp.p.f ?? 0) > 0 ? corteOp.p.f : 0.02;
  const vcCorte = corteOp && (corteOp.p.vc ?? 0) > 0 ? Math.round(corteOp.p.vc) : 100;
  const limCorte = corteOp && (corteOp.p.lim ?? 0) > 0 ? Math.round(corteOp.p.lim) : cfg.rpmMax || 3000;
  const rpmCorte =
    corteOp && corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0
      ? Math.round(corteOp.p.rpm)
      : Math.min(limCorte, Math.round((vcCorte * 1000) / (Math.PI * Math.max(bD, 1))));
  const pegaDist = Math.max(1, cfg.pega2 ?? 10);
  const dnaRecuo = MAQUINAS_DNA.find((m) => m.id === (cfg.maqId || "INDEX_ABC"))?.recuoTroca;
  const fmtIdx = (n: number) => (Number.isInteger(n) ? String(n) : fmt(n));
  const x2000 = fmtIdx(cfg.recuoTroca?.x ?? dnaRecuo?.x ?? 330);
  const z2000 = fmtIdx(cfg.recuoTroca?.z ?? dnaRecuo?.z ?? 160);
  const z2000Bar = Number(z2000) === 160 ? "170" : z2000;
  const x1000 = fmtIdx(cfg.recuoTroca?.xCanal2 ?? dnaRecuo?.xCanal2 ?? 270);
  const z1000 = fmtIdx(cfg.recuoTroca?.zCanal2 ?? dnaRecuo?.zCanal2 ?? 380);

  // Torno normal: Z0 na face da frente da peça, Z negativo entra na peça (nunca soma deslocamento do painel Peça)
  const zMain = (zGeo: number) => zGeo - geo.zFront;
  // Fuso síncrono (lado 2): Z0 na face traseira, Z negativo entra na peça
  const zSync = (zGeo: number) => geo.zBack - zGeo;

  let nIdx = 1;
  const ciclos: Record<string, { p: number; q: number; rp?: number }> = {};
  const acabExtOp = ativos.find((o) => o.tipo === "acabExt" && (o.cab || "H1") === "H1");

  const nextPosC2 = { next: 1 };
  const nextPosC1 = { next: 1 };
  const nextPosC3 = { next: 1 };

  const coolantOn: Record<1 | 2 | 3, string> = { 1: "M1801", 2: "M1802", 3: "M1813" };
  const coolantOff: Record<1 | 2 | 3, string> = { 1: "M1901", 2: "M1902", 3: "M1913" };

  const emitOpIndex = (op: StarTMOp, carro: 1 | 2 | 3, fuso: "principal" | "sincrono"): string[] => { const rOp = espelharXLinhas(emitOpIndexBase(op, carro, fuso), (op.p.espX ?? 0) === 1); blocosOpsGerados[op.id] = rOp; return rOp; };
  const emitOpIndexBase = (op: StarTMOp, carro: 1 | 2 | 3, fuso: "principal" | "sincrono"): string[] => {
    const lines: string[] = [];
    const p = op.p;
    const fxs = op.faixas.length ? op.faixas : faixaPadraoIndex(op.tipo, geo, p) || [];
    if (!fxs.length) return lines;

    const reservadas = carro === 2 ? [5] : carro === 1 ? [7, 8] : [];
    const nextRef = carro === 2 ? nextPosC2 : carro === 1 ? nextPosC1 : nextPosC3;
    const { tCode, pos } = resolverFerrIndex(op.ferr, carro, reservadas, nextRef);
    const desc = (op.nomeFerr || DESC_TIPO_STAR[op.tipo] || op.tipo).toUpperCase().replace(/[()]/g, "").replace(/\s+/g, "*");
    if (op.tipo === "furo") {
      const dBroca = p.d ?? 0;
      if (dBroca <= 0) return [`(PENDENCIA: ${desc} - INFORMAR DIAMETRO DA BROCA)`];
      // menor Ø interno DENTRO da região da furação (não o menor furo da peça inteira)
      const dLimFuro = (() => { let mm = Infinity; for (const q of geo.int) { if (Math.abs(q.zA - q.zB) < 1e-6) continue; const lo = Math.min(q.zA, q.zB), hi = Math.max(q.zA, q.zB); for (const fr of (op.faixas || [])) { const a = Math.max(lo, Math.min(fr[0], fr[1])), b = Math.min(hi, Math.max(fr[0], fr[1])); if (b - a < 1e-6) continue; const xz = (z: number) => q.xa + ((z - q.zA) / (q.zB - q.zA)) * (q.xb - q.xa); mm = Math.min(mm, xz(a), xz(b)); } } return isFinite(mm) ? mm : geo.intDmin; })();
      if (dLimFuro > 0 && dBroca > dLimFuro + 0.05) {
        return [`(PENDENCIA: ${desc} - BROCA D${fmt(dBroca)} MAIOR QUE FURO D${fmt(dLimFuro)})`];
      }
    }
    if (op.tipo === "desbInt" || op.tipo === "acabInt" || op.tipo === "canalInt" || op.tipo === "roscaInt") {
      if (!geo.int.length || !subIntervalos(geo.int, fxs).length) {
        return [`(PENDENCIA: ${desc} - SEM PERFIL INTERNO NA REGIAO)`];
      }
      const dSegChk = (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin; // furo já aberto (pré-furo da operação anterior) vale para TODAS as internas
      const bm = p.bm ?? 0;
      const fb = p.fb ?? 0.5;
      if (bm > 0 && bm + fb > dSegChk + (op.tipo === "desbInt" ? 2 * Math.max(0.05, p.ap ?? 1) : 0) + 1e-6) {
        return [`(PENDENCIA: ${desc} - BARRA D${fmt(bm)} NAO CABE NO FURO D${fmt(dSegChk)})`];
      }
    }
    const aprox = p.apz !== undefined ? p.apz : 2;
    const zCoord = (zGeo: number) => (fuso === "sincrono" ? zSync(zGeo) : zMain(zGeo));

    lines.push(`N${pos}(${desc})`);
    lines.push(tCode);
    lines.push(fuso === "sincrono" ? "G9590A3" : "G9590A1");
    lines.push("G95");

    const emitSpindle = (dRef: number, padrao: number) => {
      const modo = p.mr !== undefined ? p.mr : padrao;
      if (fuso === "sincrono") {
        const rpm =
          (p.rpm ?? 0) > 0
            ? Math.round(p.rpm)
            : Math.min(cfg.rpmMax || 3000, Math.round(((p.vc ?? 150) * 1000) / (Math.PI * Math.max(dRef, 1))));
        lines.push(`G97S1=${rpm}M103`);
      } else if (modo === 1) {
        const rpm =
          (p.rpm ?? 0) > 0
            ? Math.round(p.rpm)
            : Math.min(cfg.rpmMax || 3000, Math.round(((p.vc ?? 150) * 1000) / (Math.PI * Math.max(dRef, 1))));
        lines.push(`G97S4=${rpm}M403`);
      } else {
        const lim = (p.lim ?? 0) > 0 ? Math.round(p.lim) : cfg.rpmMax || 3000;
        lines.push(`G92S=${lim}`);
        lines.push(`G96S4=${Math.round(p.vc ?? 180)}M403`);
      }
    };

    const cool = coolantOn[carro];
    const coolStop = coolantOff[carro];
    let coolEmitido = false;
    const g0Cool = (xVal: number, zVal: number) => {
      if (!coolEmitido) {
        coolEmitido = true;
        lines.push(`G0X${fmt(xVal)}Z${fmt(zVal)}${cool}`);
      } else {
        lines.push(`G0X${fmt(xVal)}Z${fmt(zVal)}`);
      }
    };

    const zFrontClear = zCoord(fuso === "sincrono" ? geo.zBack : geo.zFront) + Math.max(2, aprox);
    const g0FrontalSeguro = (xTarget: number, zTarget: number) => {
      const zSafe = Math.max(zFrontClear, zTarget);
      g0Cool(bD + 4, zSafe);
      lines.push(`G0X${fmt(xTarget)}`);
      if (zTarget < zSafe - 1e-4) lines.push(`G0Z${fmt(zTarget)}`);
    };

    // PONTO A PONTO: caminho RÍGIDO pelos pontos clicados (na ordem), igual ao motor único das outras máquinas
    const ppPts = (((op as any).pontos || []) as { z: number; x: number }[]).filter((q) => isFinite(q.z) && isFinite(q.x));
    if (ppPts.length >= 2 && !["furo", "centro", "corte", "roscaExt", "roscaInt", "macho"].includes(op.tipo)) {
      const intPP = ["desbInt", "acabInt", "canalInt"].includes(op.tipo);
      const fPP = p.f ?? 0.1;
      const xSegPP = intPP ? Math.max(0, Math.min(...ppPts.map((q) => q.x)) - 1) : Math.max(bD + 1, Math.max(...ppPts.map((q) => q.x)) + 1);
      emitSpindle(intPP ? Math.max(...ppPts.map((q) => q.x)) : bD, 0);
      lines.push("(PONTO A PONTO - " + ppPts.length + " PONTOS - CAMINHO RIGIDO NA ORDEM DOS CLIQUES)");
      const p1 = ppPts[0];
      // chega em G0 até 0,5 do bruto (externo) ou do pré-furo (interno) - ou direto no ponto 1 se ele já está no ar - e entra em G1
      // RESTO: G0 até 0,5 do que a operação do "Resto" deixou no ponto 1 (0 = do bruto / pré-furo)
      const rIpp = intPP ? restoIntS(op) : null;
      const rEpp = intPP ? null : restoExtS(op);
      const dAbPP = rIpp && rIpp.dMin > 0 ? rIpp.dMin : (p.d0 ?? 0) > 0 ? (p.d0 as number) : 0;
      const xAp = intPP ? (dAbPP > 0 ? Math.min(p1.x, dAbPP - 0.5) : p1.x) : Math.max(p1.x, Math.min(bD, rEpp ? rEpp.nivel(p1.z) : bD) + 0.5);
      g0Cool(xSegPP, zFrontClear);
      lines.push("G0Z" + fmt(zCoord(p1.z)));
      lines.push("G0X" + fmt(xAp));
      const semF = !(Math.abs(xAp - p1.x) > 1e-4);
      if (!semF) lines.push("G1X" + fmt(p1.x) + "F" + fmt(fPP));
      for (let i = 1; i < ppPts.length; i++) lines.push("G1X" + fmt(ppPts[i].x) + "Z" + fmt(zCoord(ppPts[i].z)) + (i === 1 && semF ? "F" + fmt(fPP) : ""));
      lines.push("G0X" + fmt(xSegPP));
      lines.push("G0Z" + fmt(zFrontClear));
    } else if (op.tipo === "face") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zTopo = zIni - zFim < 0.001 ? zFim + (p.sobre ?? 0.5) : zIni;
      const xi = (p.xi ?? 0) > 0 ? p.xi : bD + 4;
      const xf = p.xf !== undefined ? p.xf : -1.6;
      const apFace = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
      emitSpindle(bD, 0);
      g0Cool(Math.max(xi, bD + 4), Math.max(zFrontClear, zCoord(zTopo) + aprox));
      if (zCoord(zTopo) + aprox < zFrontClear - 1e-4) lines.push(`G0Z${fmt(zCoord(zTopo) + aprox)}`);
      if (xi < bD + 4) lines.push(`G0X${fmt(xi)}`);
      const passos: number[] = [];
      let z = zTopo;
      let g = 0;
      while (g++ < 500 && z - apFace > zFim + 1e-6) {
        z -= apFace;
        passos.push(z);
      }
      passos.push(zFim);
      passos.forEach((zp) => {
        lines.push(`G0Z${fmt(zCoord(zp))}`);
        lines.push(`G1X${fmt(xf)}F${fmt(p.f ?? 0.15)}`);
        lines.push(`G0Z${fmt(zCoord(zp) + 0.5)}`);
        lines.push(`G0X${fmt(xi)}`);
      });
    } else if (op.tipo === "desbExt" || op.tipo === "acabExt") {
      let s = subIntervalos(geo.ext, fxs);
      let gS = 0;
      while (gS++ < 500 && s.length > 1 && s[0].zA - s[0].zB < 1e-9) s = s.slice(1);
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbExt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, false, real), angM), p.rp ?? 0.4, false);
        const zStart = zCoord(pts[0].z) + aprox;
        const xSai = Math.max(bD + 4, pts[pts.length - 1].x + 1);
        emitSpindle(bD, 0);
        g0Cool(bD + 4, Math.max(zFrontClear, zStart));
        if (zStart < zFrontClear - 1e-4) lines.push(`G0Z${fmt(zStart)}`);
        const chave = `${carro}_${fuso}_${JSON.stringify(fxs)}`;
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
            const xSafe = bD + 4;
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
              lines.push("(REBAIXO " + (ir + 1) + " Z" + fmt(zCoord(ZG[i0])) + " A Z" + fmt(zCoord(ZG[i1])) + " - ENTRA PELA RAMPA, SEMPRE NO SENTIDO DA PLACA)");
              lines.push("G0X" + fmt(xSafe));
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
                  lines.push("G1X" + fmt(curX) + "(SOBE DENTRO DA AREA JA USINADA)");
                });
              }
              lines.push("G0X" + fmt(xSafe) + "(SAI DO REBAIXO POR CIMA)");
            });
          };
          if (op.ciclo) {
            const n1 = nIdx * 100;
            const n2 = n1 + 50;
            nIdx++;
            ciclos["E" + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
            lines.push(`G71U${fmt(apDesb)}R0.5`);
            lines.push(`G71P${n1}Q${n2}U${fmt(p.u ?? 0.4)}W${fmt(p.w ?? 0.1)}F${fmt(p.f ?? 0.25)}`);
            const fAc = acabExtOp ? acabExtOp.p.f ?? 0.1 : 0.1;
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", fAc, { n1, n2, xSaida: xSai });
            fazerRebaixos();
          } else {
            const uOff = Math.max(0, p.u ?? 0.4);
            const wOff = Math.max(0, p.w ?? 0.1);
            const rawMono = perfilMono(s, false, false);
            const rawOff = rawMono.map((q) => ({ x: q.x + uOff, z: q.z + wOff }));
            const compOff = compensarRaio(rawOff, p.rp ?? 0.4, false);
            const xMin = Math.min(...compOff.map((q) => q.x), ...rawOff.map((q) => q.x));
            // degraus retos da peça (+ sobremetal): o passe PARA neles (ex.: Ø28,4 + 0,4 = Ø28,8), igual à TBSy
            const platE = Array.from(new Set(compOff.filter((q, k) => k < compOff.length - 1 && Math.abs(compOff[k + 1].x - q.x) < 2e-3 && Math.abs(compOff[k + 1].z - q.z) > 0.05).map((q) => Math.round(q.x * 1000) / 1000)));
            const rEdS = restoExtS(op);
            if (rEdS) lines.push("(RESTO DA " + rEdS.nome + ": PASSES SO ONDE ELA DEIXOU MATERIAL)");
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
              const zEndS = zCoord(zl);
              const xRet = Math.min(bD + 4, xp + Math.min(2 * apDesb, 1.5));
              lines.push(`G0X${fmt(xp)}`);
              if (zMatR < pts[0].z - 0.5) lines.push(`G0Z${fmt(zCoord(zMatR + 0.5))}`);
              lines.push(`G1Z${fmt(zEndS)}F${fmt(p.f ?? 0.25)}`);
              lines.push(`G1X${fmt(xRet)}Z${fmt(zEndS + 0.5)}`);
              lines.push(`G0Z${fmt(zStart)}`);
            }
            fazerRebaixos();
          }
        } else {
          const c = ciclos["E" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push(`G70P${c.p}Q${c.q}`);
          } else {
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.1, { xSaida: xSai });
          }
        }
      }
    } else if (op.tipo === "canal" || op.tipo === "canalInt") {
      const interno = op.tipo === "canalInt";
      const s = subIntervalos(interno ? geo.int : geo.ext, fxs);
      const larg = Math.max(0.5, p.larg ?? 3);
      const passoZ = (p.ps ?? 0) > 0 ? p.ps : larg * 0.8;
      const pk = (p.pk ?? 1) > 0 ? p.pk : 1;
      const xStart = interno ? Math.max(1, geo.intDmin - 1) : bD + 4;
      emitSpindle(interno ? Math.max(geo.intDmin, 2) : bD, 1);
      if (interno) {
        const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
        const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
        const dFundo = s.length
          ? Math.max(...s.map((q) => Math.max(q.xa, q.xb)))
          : geo.intDmin + 2;
        g0FrontalSeguro(xStart, zCoord(zIni));
        if (op.ciclo) {
          lines.push(`G75R${fmt(p.re ?? 0.5)}`);
          lines.push(
            `G75X${fmt(dFundo)}Z${fmt(zCoord(zFim))}P${Math.round(pk * 1000)}Q${Math.round(passoZ * 1000)}F${fmt(p.f ?? 0.05)}`
          );
        } else {
          const zA = zCoord(zIni);
          const zB = zCoord(zFim);
          const stepZ = zB <= zA ? -Math.max(0.2, passoZ) : Math.max(0.2, passoZ);
          let zCur = zA;
          let gC = 0;
          while (gC++ < 200) {
            lines.push(`G0Z${fmt(zCur)}`);
            lines.push(`G1X${fmt(dFundo)}F${fmt(p.f ?? 0.05)}`);
            lines.push(`G0X${fmt(xStart)}`);
            if (Math.abs(zCur - zB) < 1e-4) break;
            zCur = stepZ < 0 ? Math.max(zB, zCur + stepZ) : Math.min(zB, zCur + stepZ);
          }
        }
        lines.push(`G0Z${fmt(zFrontClear)}`);
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
          lines.push(`(CANAL: NADA PARA CORTAR SEM INVADIR FLANCOS COM BEDAME L${fmt(larg)})`);
        } else {
          let primeiroMov = true;
          planos.forEach((pl) => {
            pl.grupos.forEach((g) => {
              const ziS = zCoord(g[0].z);
              const zfS = zCoord(g[g.length - 1].z);
              const fundo = g[0].d;
              if (primeiroMov) {
                primeiroMov = false;
                g0Cool(xStart, Math.max(zFrontClear, ziS));
                if (ziS < zFrontClear - 1e-4) lines.push(`G0Z${fmt(ziS)}`);
              } else {
                lines.push(`G0Z${fmt(ziS)}`);
              }
              if (op.ciclo) {
                lines.push(`G75R${fmt(p.re ?? 0.5)}`);
                lines.push(
                  `G75X${fmt(fundo)}Z${fmt(zfS)}P${Math.round(pk * 1000)}Q${Math.round(passoZ * 1000)}F${fmt(p.f ?? 0.05)}`
                );
              } else {
                const stepZ = zfS <= ziS ? -Math.max(0.2, passoZ) : Math.max(0.2, passoZ);
                let zCur = ziS;
                let gC = 0;
                while (gC++ < 200) {
                  lines.push(`G0Z${fmt(zCur)}`);
                  const xIniC = xRestoC(op, zCur, larg, xStart, zCoord);
                  if (xIniC < xStart - 1e-4) lines.push(`G0X${fmt(xIniC)}`);
                  lines.push(`G1X${fmt(fundo)}F${fmt(p.f ?? 0.05)}`);
                  lines.push(`G0X${fmt(xStart)}`);
                  if (Math.abs(zCur - zfS) < 1e-4) break;
                  zCur = stepZ < 0 ? Math.max(zfS, zCur + stepZ) : Math.min(zfS, zCur + stepZ);
                }
              }
            });
          });
        }
      }
    } else if (op.tipo === "roscaExt" || op.tipo === "roscaInt") {
      // Sistema B: G92 é limite de rotação; rosca sempre via G76
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
      const zEntry = zCoord(zIni) + aprox;
      lines.push(fuso === "sincrono" ? `G97S1=${rpmRosca}M103` : `G97S4=${rpmRosca}M403`);
      if (interno) {
        g0FrontalSeguro(xStart, zEntry);
      } else {
        g0Cool(Math.max(bD + 4, xStart), Math.max(zFrontClear, zEntry));
        if (zEntry < zFrontClear - 1e-4) lines.push(`G0Z${fmt(zEntry)}`);
        if (xStart < bD + 4) lines.push(`G0X${fmt(xStart)}`);
      }
      lines.push("G76P020060Q50R0.05");
      lines.push(
        `G76X${fmt(dFinal)}Z${fmt(zCoord(zFim))}P${Math.round(h * 1000)}Q${Math.round(q1 * 1000)}F${fmt(passo)}`
      );
      if (interno) lines.push(`G0Z${fmt(zFrontClear)}`);
    } else if (op.tipo === "centro") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zCoord(zIni) + aprox;
      const rpmC = Math.round(p.rpm ?? 1500);
      lines.push(fuso === "sincrono" ? `G97S1=${rpmC}M103` : `G97S4=${rpmC}M403`);
      g0FrontalSeguro(0, zEntry);
      lines.push(`G1Z${fmt(zCoord(zFim))}F${fmt(p.f ?? 0.08)}`);
      lines.push(`G0Z${fmt(Math.max(zFrontClear, zEntry))}`);
    } else if (op.tipo === "furo") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zIniS = zCoord(zIni);
      const zFimS = zCoord(zFim);
      const zEntry = zIniS + aprox;
      const qMm = Math.max(0.5, p.q ?? 5);
      const rpmF = Math.round(p.rpm ?? 1200);
      lines.push(fuso === "sincrono" ? `G97S1=${rpmF}M103` : `G97S4=${rpmF}M403`);
      g0FrontalSeguro(0, zEntry);
      if (op.ciclo) {
        lines.push(`G83Z${fmt(zFimS)}Q${Math.round(qMm * 1000)}F${fmt(p.f ?? 0.1)}`);
        lines.push("G80");
      } else {
        let zCur = zIniS;
        let g = 0;
        while (g++ < 500 && zCur > zFimS + 1e-6) {
          zCur = Math.max(zFimS, zCur - qMm);
          lines.push(`G1Z${fmt(zCur)}F${fmt(p.f ?? 0.1)}`);
          lines.push(`G0Z${fmt(zEntry)}`);
          if (zCur > zFimS + 1e-6) lines.push(`G0Z${fmt(Math.min(zIniS + 0.5, zCur + 0.5))}`);
        }
      }
      if (zEntry < zFrontClear - 1e-4) lines.push(`G0Z${fmt(zFrontClear)}`);
    } else if (op.tipo === "macho") {
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zEntry = zCoord(zIni) + aprox;
      const rpmM = Math.round(p.rpm ?? 300);
      lines.push(fuso === "sincrono" ? `G97S1=${rpmM}M103` : `G97S4=${rpmM}M403`);
      g0FrontalSeguro(0, zEntry);
      lines.push(`G84Z${fmt(zCoord(zFim))}F${fmt(p.passo ?? 1.5)}`);
      lines.push("G80");
      if (zEntry < zFrontClear - 1e-4) lines.push(`G0Z${fmt(zFrontClear)}`);
    } else if (op.tipo === "desbInt" || op.tipo === "acabInt") {
      const s = subIntervalos(geo.int, fxs);
      if (s.length) {
        const real = p.real === 1 && !(op.tipo === "desbInt" && op.ciclo);
        const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90;
        const pts = compensarRaio(limitaMergulho(perfilMono(s, true, real), angM), p.rp ?? 0.4, true);
        const rIdS = op.tipo === "desbInt" ? restoIntS(op) : null; // RESTO: começa do Ø que a operação do "Resto" já abriu
      const dSeg = rIdS && rIdS.dMin > 0 ? rIdS.dMin : op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : geo.intDmin;
        const xEnt = Math.max(1, dSeg - ((p.fi ?? 1) > 0 ? p.fi : 1));
        const zStart = zCoord(pts[0].z) + aprox;
        emitSpindle(Math.max(dSeg, 2), 0);
        g0FrontalSeguro(xEnt, zStart);
        const chave = `${carro}_${fuso}_${JSON.stringify(fxs)}`;
        if (op.tipo === "desbInt") {
          const apDesb = Math.max(0.05, (p.ap ?? 1) > 0 ? p.ap : 1);
          if (op.ciclo) {
            const n1 = nIdx * 100;
            const n2 = n1 + 50;
            nIdx++;
            ciclos["I" + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
            lines.push(`G71U${fmt(apDesb)}R0.5`);
            lines.push(`G71P${n1}Q${n2}U-${fmt(p.u ?? 0.3)}W${fmt(p.w ?? 0.1)}F${fmt(p.f ?? 0.2)}`);
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.2, { n1, n2, xSaida: xEnt });
          } else {
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
              const zEndS = zCoord(zl);
              const xRet = Math.max(1, xp - Math.min(2 * apDesb, 1.5));
              lines.push(`G0X${fmt(xp)}Z${fmt(zStart)}`);
              lines.push(`G1Z${fmt(zEndS)}F${fmt(p.f ?? 0.2)}`);
              lines.push(`G1X${fmt(xRet)}Z${fmt(zEndS + 0.5)}`);
              lines.push(`G0Z${fmt(zStart)}`);
            }
          }
        } else {
          const c = ciclos["I" + chave + (real ? "R" : "")];
          const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6;
          if (op.ciclo && c && mesmoRaio) {
            lines.push(`G70P${c.p}Q${c.q}`);
          } else {
            emitirContornoArcos(lines, pts, zCoord, fmt, "fanuc", p.f ?? 0.08, { xSaida: xEnt });
          }
        }
        lines.push(`G0Z${fmt(zFrontClear)}`);
      }
    }

    lines.push(`G0X${fmt(bD + 4)}${coolStop}`);
    if (carro === 2) {
      lines.push(`G53X${x2000}`);
      lines.push(`G53Z${z2000}`);
    } else {
      lines.push(`G53Z${z1000}`);
      lines.push(`G53X${x1000}`);
    }
    lines.push("G97G95");
    return lines;
  };

  // Distribuição de operações: H1 -> O2000 (carro 2), exceto se usuário informar carro 1 explícito (T1xxxxx) -> O1000 carro 1; H2 -> O1000 (carro 3)
  const isCarro1Explicito = (o: StarTMOp) => /^T1\d{5}$/i.test((o.ferr || "").trim());
  const opsLado1 = ativos.filter((o) => o.tipo !== "corte" && (o.cab || "H1") === "H1" && !isCarro1Explicito(o));
  const opsCarro1 = ativos.filter((o) => o.tipo !== "corte" && (o.cab || "H1") === "H1" && isCarro1Explicito(o));
  const opsLado2 = ativos.filter((o) => o.tipo !== "corte" && o.cab === "H2");

  // ========== O2000 (Lado 1 / Fuso principal - Carro 2) ==========
  const o2000: string[] = [];
  o2000.push("%");
  o2000.push(`O2000(${nm})`);
  o2000.push("(REV_1)");
  o2000.push("G8100");
  o2000.push("H1.0060");
  o2000.push("M368");
  o2000.push("N99(RETORNO*TROCA*BARRA)");
  o2000.push(`G53X${x2000}`);
  o2000.push(`G53Z${z2000Bar}`);
  o2000.push("M2010");
  o2000.push("G65P8420(LEITURA*POSICAO*ATUAL)");
  o2000.push("M2020");
  o2000.push("N21(TOP)");
  o2000.push("(ALIMENTAR*BARRA)");
  o2000.push("T205025");
  o2000.push("G9590A1");
  o2000.push("G0Z15");
  o2000.push("X35");
  o2000.push("/1N7M169(ABRIR*PINCA)");
  o2000.push("/1N8M1580(AVANCAR*BARRA)");
  o2000.push("G4X1");
  o2000.push("G97");
  o2000.push("G94G1Z.6F2500");
  o2000.push("M168(FECHAR*PINCA)");
  o2000.push("G0Z10");
  o2000.push("G0X40");
  o2000.push(`G53X${x2000}`);
  o2000.push(`G53Z${z2000}`);
  o2000.push("G97G95");
  o2000.push("M2025");

  opsLado1.forEach((op) => {
    if ((cfg as any).soloId && op.id !== (cfg as any).soloId) return; // simular só esta operação
    emitOpIndex(op, 2, "principal").forEach((l) => o2000.push(l));
  });

  o2000.push("M2030");
  o2000.push("M2031");
  o2000.push("M2032");
  o2000.push("M2049");

  // Corte no O2000
  const ferrCorte = resolverFerrIndex(corteOp?.ferr || "", 2, [5], nextPosC2);
  o2000.push(`N${ferrCorte.pos}(BEDAME)`);
  o2000.push(ferrCorte.tCode);
  o2000.push("G9590A1");
  o2000.push("G95");
  if (corteOp && corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0) {
    o2000.push(`G97S4=${rpmCorte}M403`);
  } else {
    o2000.push(`G92S=${limCorte}`);
    o2000.push(`G96S4=${vcCorte}M403`);
  }
  o2000.push(`G0X${fmt(bD + 4)}Z2.0M1802`);
  o2000.push(`G0Z-${fmt(geo.L)}`);
  o2000.push(`G0X${fmt(bD + 2)}`);
  o2000.push("M2050");
  o2000.push(`G1G95X-3.F${fmt(fCorte)}`);
  o2000.push("M2051");
  o2000.push("M2059");
  o2000.push(`G0X${fmt(bD + 4)}M1902`);
  o2000.push("M2060");
  o2000.push("G8129");
  o2000.push("M105M405");
  o2000.push(`G53X${x2000}`);
  o2000.push("M2061");
  o2000.push(`G53Z${z2000Bar}`);
  o2000.push("M1581");
  o2000.push("G4X.5");
  o2000.push("M2070");
  o2000.push("G9392");
  o2000.push("IF[#1015EQ1]GOTO99");
  o2000.push("M2080");
  o2000.push("M30");
  o2000.push("%");

  // ========== O1000 (Lado 2 / Fuso síncrono + Descarga - Carros 1 e 3) ==========
  const o1000: string[] = [];
  o1000.push("%");
  o1000.push(`O1000(${nm})`);
  o1000.push("(REV_1)");
  o1000.push("G8100(INICIO PGM)");
  o1000.push("H1.0060(PRESSAO FUSO PRINCIPAL)");
  o1000.push("H3.0032(PRESSAO PICKUP)");
  o1000.push("N99(DESVIO*CARREGAR*BARRA)");
  o1000.push(`G53X${x1000}Z${z1000}(PTO TROCA)`);
  o1000.push("M2010");
  o1000.push("G65P8420(LEITURA*POSICAO*ATUAL)");
  o1000.push("M2020");
  o1000.push("G8130(ATIVAR*SINCRONO)");
  o1000.push("M2025");

  opsLado2.forEach((op) => {
    if ((cfg as any).soloId && op.id !== (cfg as any).soloId) return; // simular só esta operação
    emitOpIndex(op, 3, "sincrono").forEach((l) => o1000.push(l));
  });

  o1000.push("G8131");
  o1000.push("M2030");
  o1000.push("N7(DESCARREGAR*PECA)");
  o1000.push("T107000");
  o1000.push("G9590A1");
  o1000.push("M1805");
  o1000.push("G8132A0X130Z380Q1.5");
  o1000.push("M1607");
  o1000.push("M1905");
  o1000.push("M368");
  o1000.push("M1908");
  o1000.push(`G53Z${z1000}`);
  o1000.push(`G53X${x1000}`);
  o1000.push("G97G95");
  o1000.push("M2031");
  o1000.push("M2032");

  opsCarro1.forEach((op) => {
    if ((cfg as any).soloId && op.id !== (cfg as any).soloId) return; // simular só esta operação
    emitOpIndex(op, 1, "principal").forEach((l) => o1000.push(l));
  });

  o1000.push("M2049");
  o1000.push("N8(POSICIONAR*SINCRONO)");
  o1000.push("T108008");
  o1000.push("G9590A1");
  o1000.push("G0Z20");
  o1000.push("X0");
  o1000.push("G8128A0W0D1500S0U0R3");
  o1000.push("M369");
  o1000.push("G4X1");
  o1000.push("G94");
  o1000.push(`G31P98Q20Z-${fmt(pegaDist)}F500`);
  o1000.push("M368(FECHAR PINCA)");
  o1000.push("G4X1");
  o1000.push("G0G90");
  o1000.push("M2050");
  o1000.push("M2051");
  o1000.push("G94");
  o1000.push("G31P98Q20Z-10F500");
  o1000.push("M2059");
  o1000.push("M2060");
  o1000.push("G8129A1Z20");
  o1000.push(`G53Z${z1000}M405`);
  o1000.push("M2061");
  o1000.push(`G53X${x1000}`);
  o1000.push("M2070");
  o1000.push("G97G95");
  o1000.push("G9392");
  o1000.push("IF[#1015EQ1]GOTO99");
  o1000.push("M2080");
  o1000.push("M30");
  o1000.push("%");

  const erroSinc = validarSincronismoIndexABC(o2000, o1000);
  if (erroSinc) {
    return {
      textos: ["", ""],
      nomes: ["O2000", "O1000"],
      doisCanais: true,
      erro: erroSinc,
    };
  }

  return {
    textos: [o2000.join("\n"), o1000.join("\n")],
    nomes: ["O2000", "O1000"],
    doisCanais: true,
  };
}
