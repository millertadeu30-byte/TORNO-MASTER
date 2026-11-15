export interface MaquinaDNA {
  id: string;
  nome: string;
  comando: string;
  perfil: string;
  status: "PRONTA" | "EM CADASTRO";
  canais: number;
  suico: boolean;
  diamMaxBarra?: number;
}

export const MAQUINAS_DNA: MaquinaDNA[] = [
  { id: "TBSY", nome: "Ergomat TBSy 60 (N09)", comando: "GE Fanuc 31i-A", perfil: "ERGOMAT_TBS_31iA", status: "PRONTA", canais: 2, suico: false, diamMaxBarra: 60 },
  { id: "STAR_SR16_N06", nome: "Star SR-16 (N06)", comando: "Fanuc 18i-TB", perfil: "STAR_18iTB", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 16 },
  { id: "STAR_SR16_N07", nome: "Star SR-16 (N07)", comando: "Fanuc 18i-TB", perfil: "STAR_18iTB", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 16 },
  { id: "STAR_SR20J_N08", nome: "Star SR-20J (N08)", comando: "Fanuc 18i-TB", perfil: "STAR_18iTB", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 20 },
  { id: "STAR_SB20R_N11", nome: "Star SB-20R (N11)", comando: "Fanuc 0i-TF", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 20 },
  { id: "STAR_SB20R_N13", nome: "Star SB-20R (N13)", comando: "Fanuc 0i-TF", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 20 },
  { id: "STAR_N19", nome: "Star SR-20R (N19)", comando: "Fanuc 0i-TF Plus", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 20 },
  { id: "STAR_SR38_N14", nome: "Star SR-38 (N14)", comando: "Fanuc 31i-B5", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 38 },
  { id: "STAR_N17", nome: "Star SR-32J III (N17)", comando: "Fanuc 32i-B", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 32 },
  { id: "STAR_32R_N10", nome: "Star SR-32J III (N10)", comando: "Fanuc 32i-B", perfil: "STAR_G266", status: "PRONTA", canais: 2, suico: true, diamMaxBarra: 32 },
  { id: "INDEX_ABC", nome: "Index ABC", comando: "Fanuc 31i-B", perfil: "INDEX_31iB", status: "PRONTA", canais: 3, suico: false, diamMaxBarra: 42 },
  { id: "INDEX_C100", nome: "Index C100", comando: "Fanuc 31i-B", perfil: "INDEX_31iB", status: "EM CADASTRO", canais: 3, suico: false },
  { id: "TND180_N03", nome: "Ergomat TND 180 (N03)", comando: "Siemens Sinumerik", perfil: "SIEMENS_TND180", status: "PRONTA", canais: 1, suico: false, diamMaxBarra: 42 },
  { id: "TND180_N04", nome: "Ergomat TND 180 (N04)", comando: "Siemens Sinumerik", perfil: "SIEMENS_TND180", status: "PRONTA", canais: 1, suico: false, diamMaxBarra: 42 },
];
