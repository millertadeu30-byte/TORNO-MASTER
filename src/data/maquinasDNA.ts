export interface RecuoTroca {
  modo: "G53" | "G0_ABS" | "X_FIXO";
  x?: number;
  z?: number;
  xCanal2?: number;
  zCanal2?: number;
  zFrontal?: number;
  linhasModelo?: string[];
  origem?: string;
  aprendido: boolean;
}

export interface MaquinaDNA {
  id: string;
  nome: string;
  comando: string;
  perfil: string;
  status: "PRONTA" | "EM CADASTRO";
  canais: number;
  suico: boolean;
  diamMaxBarra?: number;
  recuoTroca: RecuoTroca;
}

export const MAQUINAS_DNA: MaquinaDNA[] = [
  {
    id: "TBSY",
    nome: "Ergomat TBSy 60 (N09)",
    comando: "GE Fanuc 31i-A",
    perfil: "ERGOMAT_TBS_31iA",
    status: "PRONTA",
    canais: 2,
    suico: false,
    diamMaxBarra: 60,
    recuoTroca: {
      modo: "G53",
      x: 320,
      z: 100,
      xCanal2: 235,
      zCanal2: 280,
      linhasModelo: [
        "G0G53X320Z100V350 / N{n}G0G53X320M89 + G0G53Z100 (HEAD1)",
        "G0G53X235Z280Y0 / N{n}G0G53X235Z270Y0 (HEAD2)",
      ],
      origem: "CU2540E1.P-2 / TAMPA_JU / BUCHA_JU.P-2",
      aprendido: true,
    },
  },
  {
    id: "STAR_SR16_N06",
    nome: "Star SR-16 (N06)",
    comando: "Fanuc 18i-TB",
    perfil: "STAR_18iTB",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 16,
    recuoTroca: {
      modo: "X_FIXO",
      x: 20,
      zFrontal: -1,
      linhasModelo: ["G0X20 / T0M1 (tornear)", "G0Z-1T0 / M1 (frontal)"],
      origem: "Programa real SR-16 (N06/N07)",
      aprendido: true,
    },
  },
  {
    id: "STAR_SR16_N07",
    nome: "Star SR-16 (N07)",
    comando: "Fanuc 18i-TB",
    perfil: "STAR_18iTB",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 16,
    recuoTroca: {
      modo: "X_FIXO",
      x: 20,
      zFrontal: -1,
      linhasModelo: ["G0X20 / T0M1 (tornear)", "G0Z-1T0 / M1 (frontal)"],
      origem: "Programa real SR-16 (N06/N07)",
      aprendido: true,
    },
  },
  {
    id: "STAR_SR20J_N08",
    nome: "Star SR-20J (N08)",
    comando: "Fanuc 18i-TB",
    perfil: "STAR_18iTB",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 20,
    recuoTroca: {
      modo: "X_FIXO",
      x: 40,
      zFrontal: -5,
      linhasModelo: ["G0X40 / T0M1 (tornear)", "G0Z-5 / M1 (frontal)"],
      origem: "Programa real SR-20J (N08)",
      aprendido: true,
    },
  },
  {
    id: "STAR_SB20R_N11",
    nome: "Star SB-20R (N11)",
    comando: "Fanuc 0i-TF",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 20,
    recuoTroca: {
      modo: "X_FIXO",
      zFrontal: -3,
      linhasModelo: [
        "G0X{barra+1.4} / G0Z-1.0 / G97 / G0T0 / M101 (tornear)",
        "G0Z-3 / G0X0 / G0T0 / M101 (frontal)",
      ],
      origem: "O0001 (PC11906, STAR 20R)",
      aprendido: true,
    },
  },
  {
    id: "STAR_SB20R_N13",
    nome: "Star SB-20R (N13)",
    comando: "Fanuc 0i-TF",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 20,
    recuoTroca: {
      modo: "X_FIXO",
      zFrontal: -3,
      linhasModelo: [
        "G0X{barra+1.4} / G0Z-1.0 / G97 / G0T0 / M101 (tornear)",
        "G0Z-3 / G0X0 / G0T0 / M101 (frontal)",
      ],
      origem: "O0001 (PC11906, STAR 20R)",
      aprendido: true,
    },
  },
  {
    id: "STAR_N19",
    nome: "Star SR-20R (N19)",
    comando: "Fanuc 0i-TF Plus",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 20,
    recuoTroca: {
      modo: "X_FIXO",
      zFrontal: -3,
      linhasModelo: [
        "G0X{barra+1.4} / G0Z-1.0 / G97 / G0T0 / M101 (tornear)",
        "G0Z-3 / G0X0 / G0T0 / M101 (frontal)",
      ],
      origem: "O0001 (PC11906, STAR 20R)",
      aprendido: true,
    },
  },
  {
    id: "STAR_SR38_N14",
    nome: "Star SR-38 (N14)",
    comando: "Fanuc 31i-B5",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 38,
    recuoTroca: {
      modo: "X_FIXO",
      x: 30,
      zFrontal: -5,
      linhasModelo: ["G0X30 / T0M1 (tornear)", "G0Z-5 / M1 (frontal)"],
      origem: "Programa real SR-38 (N14)",
      aprendido: true,
    },
  },
  {
    id: "STAR_N17",
    nome: "Star SR-32J III (N17)",
    comando: "Fanuc 32i-B",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 32,
    recuoTroca: {
      modo: "X_FIXO",
      x: 50,
      zFrontal: -5,
      linhasModelo: ["G0X50 / T0M1 (tornear)", "G0Z-5 / M1 (frontal)"],
      origem: "PC111091",
      aprendido: true,
    },
  },
  {
    id: "STAR_32R_N10",
    nome: "Star SR-32J III (N10)",
    comando: "Fanuc 32i-B",
    perfil: "STAR_G266",
    status: "PRONTA",
    canais: 2,
    suico: true,
    diamMaxBarra: 32,
    recuoTroca: {
      modo: "X_FIXO",
      x: 50,
      zFrontal: -5,
      linhasModelo: ["G0X50 / T0M1 (tornear)", "G0Z-5 / M1 (frontal)"],
      origem: "PC111091",
      aprendido: true,
    },
  },
  {
    id: "INDEX_ABC",
    nome: "Index ABC",
    comando: "Fanuc 31i-B",
    perfil: "INDEX_31iB",
    status: "PRONTA",
    canais: 3,
    suico: false,
    diamMaxBarra: 42,
    recuoTroca: {
      modo: "G53",
      x: 330,
      z: 160,
      xCanal2: 270,
      zCanal2: 380,
      linhasModelo: ["G53X330 / G53Z160 (O2000)", "G53Z380 / G53X270 (O1000)"],
      origem: "PC11166",
      aprendido: true,
    },
  },
  {
    id: "INDEX_C100",
    nome: "Index C100",
    comando: "Fanuc 31i-B",
    perfil: "INDEX_31iB",
    status: "EM CADASTRO",
    canais: 3,
    suico: false,
    recuoTroca: {
      modo: "G53",
      origem: "Em cadastro",
      aprendido: false,
    },
  },
  {
    id: "TND180_N03",
    nome: "Ergomat TND 180 (N03)",
    comando: "Siemens Sinumerik",
    perfil: "SIEMENS_TND180",
    status: "PRONTA",
    canais: 1,
    suico: false,
    diamMaxBarra: 42,
    recuoTroca: {
      modo: "G53",
      x: 150,
      z: 150,
      linhasModelo: ["G0G90G53X150Z150T0D0"],
      origem: "PL1109 / cabeçalho padrão",
      aprendido: true,
    },
  },
  {
    id: "TND180_N04",
    nome: "Ergomat TND 180 (N04)",
    comando: "Siemens Sinumerik",
    perfil: "SIEMENS_TND180",
    status: "PRONTA",
    canais: 1,
    suico: false,
    diamMaxBarra: 42,
    recuoTroca: {
      modo: "G53",
      x: 150,
      z: 150,
      linhasModelo: ["G0G90G53X150Z150T0D0"],
      origem: "PL1109 / cabeçalho padrão",
      aprendido: true,
    },
  },
];

