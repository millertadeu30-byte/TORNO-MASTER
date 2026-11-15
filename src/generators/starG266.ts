import {
  StarTMOp,
  StarTMGeo,
  StarGerarCfg,
  StarGerarResult,
  fmtStar,
  criarEmissorOpsStar,
  extrairSincronismosStar,
} from "./star18iTB";

export function validarSincronismoStarG266(h1Lines: string[], h2Lines: string[]): string | null {
  const s1 = extrairSincronismosStar(h1Lines);
  const s2 = extrairSincronismosStar(h2Lines);
  if (!s1.length || !s2.length) return "Erro de sincronismo (G266): M200 obrigatório nos dois canais.";
  if (s1[0] !== "M200" || s2[0] !== "M200") return "Erro de sincronismo (G266): M200 deve ser o primeiro código nos dois canais.";
  const dup1 = s1.find((c, i) => s1.indexOf(c) !== i);
  if (dup1) return `Erro de sincronismo (G266): ${dup1} repetido no HEAD1.`;
  const dup2 = s2.find((c, i) => s2.indexOf(c) !== i);
  if (dup2) return `Erro de sincronismo (G266): ${dup2} repetido no HEAD2.`;
  if (s1.length !== s2.length) {
    return `Erro de sincronismo (G266): quantidade diferente entre HEAD1 (${s1.join(", ")}) e HEAD2 (${s2.join(", ")}).`;
  }
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) {
      return `Erro de sincronismo (G266): ordem divergente entre HEAD1 (${s1.join(", ")}) e HEAD2 (${s2.join(", ")}).`;
    }
  }
  return null;
}

export function tmGerarStarG266(ops: StarTMOp[], geo: StarTMGeo, cfg: StarGerarCfg): StarGerarResult {
  const nmBruto = (cfg.nome || "PECA").trim().toUpperCase().replace(/[^A-Z0-9_\- ]/g, "_");
  const nm = nmBruto || "PECA";
  const mProg = nm.match(/^O(\d{4,})$/);
  const progId = mProg ? "O" + mProg[1] : "O0001";
  const bD = cfg.bD;
  const ativos = ops.filter((o) => o.ativo);

  if (cfg.maqId === "STAR_SR38_N14") {
    const pedeEixoB = ativos.some(
      (o) => (o.p.eixoB ?? 0) !== 0 || /EIXO\s*B|\bSTOPPER\b|\bB\s*-?\d/i.test(o.nomeFerr || "")
    );
    if (pedeEixoB) {
      return {
        textos: ["", ""],
        nomes: [progId, progId + ".P-2"],
        doisCanais: true,
        erro: "Star SR-38 (N14): operações com eixo B / stopper ainda não são suportadas; use apenas operações normais.",
      };
    }
  }

  const corteOp = ativos.find((o) => o.tipo === "corte");
  const largCorte = corteOp ? (corteOp.p.larg !== undefined ? corteOp.p.larg : 3) : 3;
  const rpmCorte = corteOp
    ? (corteOp.p.mr === 1 && (corteOp.p.rpm ?? 0) > 0
        ? Math.round(corteOp.p.rpm)
        : Math.min(cfg.rpmMax || 3000, Math.round(((corteOp.p.vc ?? 100) * 1000) / (Math.PI * Math.max(bD, 1)))))
    : 1500;
  const limCorte = corteOp && (corteOp.p.lim ?? 0) > 0 ? Math.round(corteOp.p.lim) : cfg.rpmMax || 3000;
  const fCorte = corteOp && (corteOp.p.f ?? 0) > 0 ? corteOp.p.f : 0.05;
  const kBedame = cfg.ladoBedameK !== undefined ? cfg.ladoBedameK : (corteOp && corteOp.p.ref === 1 ? -17 : 0);
  const { gerarOpLinhas, ferramentasUsadas, deslH1 } = criarEmissorOpsStar(ops, geo, cfg);
  const compCorte = Math.max(0.1, geo.L + deslH1);
  const cursoCab = cfg.cursoCab && cfg.cursoCab > 0 ? cfg.cursoCab : compCorte + largCorte;
  const subPega = cfg.maqId === "STAR_N17" ? "7000" : "8000";
  const opsH1 = ativos.filter((o) => o.tipo !== "corte" && (o.cab || "H1") === "H1");
  const opsH2 = ativos.filter((o) => o.tipo !== "corte" && o.cab === "H2");

  const linhasOpsH1: string[] = [];
  opsH1.forEach((op) => {
    const linhasOp = gerarOpLinhas(op, "H1");
    linhasOp.forEach((l) => linhasOpsH1.push(l.replace(/\bG4X/g, "G4U")));
  });

  const linhasOpsH2: string[][] = [];
  opsH2.forEach((op) => {
    const linhasOp = gerarOpLinhas(op, "H2");
    if (linhasOp.length) {
      linhasOpsH2.push(linhasOp.map((l) => l.replace(/\bG4X/g, "G4U")));
    }
  });

  // Lista única de ferramentas em comentário (inclui T100 do bedame)
  const listaFerrMap = new Map<number, { tNum: number; desc: string; vu: number }>();
  listaFerrMap.set(100, { tNum: 100, desc: "BEDAME", vu: Math.round(corteOp?.p.vu ?? 500) });
  ferramentasUsadas.forEach((f) => {
    const code = f.tNum * 100;
    if (!listaFerrMap.has(code)) {
      listaFerrMap.set(code, { tNum: code, desc: f.desc, vu: f.vu });
    }
  });

  const h1: string[] = [];
  const h2: string[] = [];

  // HEAD1 (arquivo SEM sufixo, ex.: O0001)
  h1.push("%");
  h1.push(`${progId}(${nm})`);
  h1.push("(HEAD 1)");
  listaFerrMap.forEach((f) => {
    h1.push(`(T${f.tNum} - ${f.desc} V.U= ${f.vu})`);
  });
  h1.push("M9");
  h1.push("M38");
  h1.push("G0G99G97G40M5");
  h1.push(
    `G266A${fmtStar(bD)}W${fmtStar(compCorte)}S${rpmCorte}X-1.5Z${fmtStar(cursoCab)}F${fmtStar(fCorte)}B${fmtStar(largCorte)}K${kBedame}`
  );
  h1.push("(A:DIAMETRO DA BARRA)");
  h1.push("(W:COMPRIMENTO DA PECA)");
  h1.push("(S:RPM - CUT OFF)");
  h1.push("(X:POSICAO FINAL - CUT OFF)");
  h1.push("(Z=CURSO CABECOTE PRINC.)");
  h1.push("(F:AVANCO PROGRAMADO DE CUT OFF)");
  h1.push("(B:LARGURA DO BEDAME)");
  h1.push("#521=[#530+#528](PART LENGTH+CUTOFF WIDTH)");
  h1.push("G125(AJUSTE PONTO ZERO)");
  h1.push("G300(AUTO CUT OFF)");
  h1.push("M5");
  h1.push("M11");
  h1.push("G98G1Z0F5000T0");
  h1.push("G4U.2");
  h1.push("M10");
  h1.push("M200");
  h1.push("M20");
  h1.push("G0Z-.5");
  h1.push("G4U.2");
  h1.push("G18");
  h1.push("G0G40G97G99M3S500");
  h1.push("T100");
  h1.push(`G0X${fmtStar(bD + 10)}Z-.5`);
  h1.push("M27");

  linhasOpsH1.forEach((l) => h1.push(l));

  // Corte HEAD1 + sincronismo série M300..M305
  h1.push("M300");
  h1.push("(CORTE)");
  h1.push("T100");
  h1.push("/M25");
  h1.push(`G50S${limCorte}`);
  h1.push(`G99G97M3S${rpmCorte}`);
  h1.push("G0X[#531+1]Z#521T1");
  h1.push("M82");
  h1.push("M301");
  h1.push("M302");
  h1.push("M303");
  h1.push("M40");
  h1.push("M304");
  h1.push(`G1X-1.5F${fmtStar(fCorte)}`);
  h1.push("M305");
  h1.push("M41");
  h1.push("M83");
  h1.push("M80");
  h1.push(`/M98P${subPega}`);
  h1.push("M81");
  h1.push("M99");
  h1.push("%");

  // HEAD2 (arquivo com sufixo .P-2, ex.: O0001.P-2)
  const pegaDist = Math.max(1, cfg.pega2 ?? 10);
  h2.push("%");
  h2.push(`${progId}(${nm})`);
  h2.push("(HEAD2)");
  h2.push("G99G97G40M5");
  h2.push("G28W0");
  h2.push("T0");
  h2.push("T2000(POSICAO DO CONTRA-FUSO ALINHADO A BUCHA DE GUIA)");
  h2.push("G130(MODIF.DO SISTEMA DE COORDENADA G266 OFF)");
  h2.push("M200");
  h2.push("M20");

  linhasOpsH2.forEach((linhasOp) => {
    h2.push("/M75");
    linhasOp.forEach((l) => h2.push(l.startsWith("/") ? l : "/" + l));
    h2.push("/M76");
  });

  h2.push("T2000");
  h2.push("M300");
  h2.push("G900J50(VERIFICA TEM PECA NO CONTRA FUSO)");
  h2.push("T2000");
  h2.push("M11");
  h2.push("M82");
  h2.push("M301");
  h2.push("G131(MODIF.DO SISTEMA DE COORDENADA G266 ON)");
  h2.push("G0G98Z-1.5");
  h2.push("M68");
  h2.push("M14");
  h2.push(`G1Z${fmtStar(pegaDist)}F350`);
  h2.push("M69");
  h2.push("M10");
  h2.push("M15");
  h2.push("M302");
  h2.push("M303");
  h2.push("M40");
  h2.push("M304");
  h2.push("M305");
  h2.push("M41");
  h2.push("M83");
  h2.push("G28W0.0");
  h2.push("M5");
  h2.push("G130");
  h2.push("N50");
  h2.push("M99");
  h2.push("%");

  const erroSinc = validarSincronismoStarG266(h1, h2);
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
