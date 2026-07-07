export interface CNCTemplate {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const CNC_TEMPLATES: CNCTemplate[] = [
  {
    id: "completo",
    title: "Eixo Completo (G71, G75, G76)",
    description: "Programa completo contendo desbaste longitudinal, canaletas de alívio e rosqueamento externo M24.",
    code: `O1001 (EIXO COMPLETO MASTER CNC);
(FERRAMENTAS);
(T0101 - DESBASTE EXTERNO);
(T0202 - ACABAMENTO EXTERNO);
(T0303 - CANALETAS G75);
(T0404 - ROSCA EXTERNA G76);

G21 G40 G90 G95;
G54 (ZERO PECA);

(OP1 - DESBASTE EXTERNO G71);
G97 S1500 M03;
T0101;
G00 X82.0 Z2.0 M08;
G71 U2.5 R1.0;
G71 P10 Q20 U0.4 W0.1 F0.25;
N10 G00 X20.0;
G01 Z0.0 F0.15;
G01 X24.0 Z-2.0;
G01 Z-20.0;
G01 X30.0;
G01 X36.0 Z-30.0;
G01 Z-45.0;
G01 X48.0;
G01 X52.0 Z-47.0;
G01 Z-60.0;
G01 X80.0;
N20 G01 Z-75.0;
G00 X200.0 Z200.0 M09;
M05;

(OP2 - ACABAMENTO COM G70);
G96 S220 M03;
T0202;
G00 X82.0 Z2.0 M08;
G70 P10 Q20 F0.12;
G00 X200.0 Z200.0 M09;
M05;

(OP3 - CANAL DE ALIVIO G75);
G97 S800 M03;
T0303 (BEDAME 3.0MM);
G00 X40.0 Z-18.0 M08;
G75 R1.0;
G75 X20.0 Z-18.0 P1500 F0.08;
G00 X200.0 Z200.0 M09;
M05;

(OP4 - ROSCAGEM G76 M24X1.5);
G97 S600 M03;
T0404;
G00 X28.0 Z5.0 M08;
G76 P021060 Q100 R0.05;
G76 X22.05 Z-15.0 P975 Q250 F1.5;
G00 X200.0 Z200.0 M09;
M30;`
  },
  {
    id: "desbaste-g71",
    title: "Desbaste Longitudinal (G71)",
    description: "Ciclo G71 para desbaste rápido de múltiplos diâmetros escalonados e chanfros de entrada.",
    code: `O1002 (DESBASTE ESCALONADO G71);
G21 G40 G90;
G54;
T0101 (DESBASTE R=0.8);
G96 S180 M03;
G00 X105.0 Z2.0 M08;

(G71 U=PROFUNDIDADE CORTE, R=RECUO);
G71 U3.0 R1.5;
(P, Q=BLOCOS INICIO/FIM, U, W=SOBRAS);
G71 P100 Q200 U0.6 W0.2 F0.28;

N100 G00 X25.0;
G01 Z0.0 F0.15;
G01 X30.0 Z-2.5;
G01 Z-25.0;
G01 X50.0;
G01 Z-45.0;
G01 X70.0;
G01 X80.0 Z-50.0;
G01 Z-70.0;
N200 G01 X100.0;

G00 X200.0 Z200.0 M09;
M30;`
  },
  {
    id: "interno-g71",
    title: "Usinagem Interna G71 (Boring)",
    description: "Ciclo G71 para furação interna e mandrilamento com sobras positivas ou negativas.",
    code: `O1003 (DESBASTE INTERNO BORING);
G21 G40 G90;
G54;
(T0202 - BARRA DE MANDRILAR RELEVO);
G97 S1100 M03;
G00 X22.0 Z3.0 M08;

(U NEGATIVO PARA DESBASTE INTERNO / EXPANSAO);
G71 U-1.8 R0.8;
G71 P30 Q40 U-0.4 W0.1 F0.2;

N30 G00 X50.0;
G01 Z0.0 F0.12;
G01 X44.0 Z-3.0;
G01 Z-20.0;
G01 X38.0 Z-35.0;
G01 Z-50.0;
N40 G01 X25.0;

G00 Z10.0 M09;
G00 X200.0 Z200.0;
M30;`
  },
  {
    id: "canais-g75",
    title: "Ciclo de Canais (G75)",
    description: "Demonstração do ciclo G75 em modo furação pica-pau (2 linhas) e desbaste longitudinal em largura.",
    code: `O1004 (CICLO DE CANAIS G75);
G21 G40 G90;
G54;
T0303 (BEDAME LARGURA 4.0MM);
G97 S700 M03;

(EXEMPLO 1: PICAPAU SIMPLES - 1 CANAL);
G00 X52.0 Z-15.0 M08;
G75 R0.5;
G75 X30.0 Z-15.0 P2000 F0.08;

(EXEMPLO 2: CANALETAS MULTIPLAS);
G00 X52.0 Z-30.0;
G75 R0.5;
G75 X35.0 Z-42.0 P2500 Q4000 F0.1;

G00 X150.0 Z150.0 M09;
M30;`
  },
  {
    id: "rosca-g76",
    title: "Ciclo de Rosca Múltipla (G76)",
    description: "Ciclo automático G76 de duas linhas abrindo uma rosca fina métrica externa M30x2.0.",
    code: `O1005 (ROSCAGEM G76 M30X2.0);
G21 G40 G90;
G54;
T0404 (ROSCA EXTERNA DE 60 GRAUS);
G97 S500 M03;
G00 X35.0 Z6.0 M08;

(P: REPETICOES/SAIDA ANGULAR/ANGULO FILETE);
G76 P011060 Q120 R0.03;
(X: DIAMETRO FUNDO, Z: COMPRIMENTO);
(P: ALTURA FILETE MICRONS, Q: PROFUNDIDADE 1A PASSADA);
G76 X27.4 Z-25.0 P1300 Q300 F2.0;

G00 X150.0 Z150.0 M09;
M30;`
  },
  {
    id: "furacao-g74",
    title: "Furação e Canal Facial (G74)",
    description: "Demonstração do ciclo G74 com furação profunda no centro (X0) e canal axial de face largo com passo lateral P.",
    code: `O1006 (CICLO DE FACE G74);
G21 G40 G90;
G54;
T0303 (BEDAME FACIAL DE 4.0MM);
G97 S1000 M03;

(APROXIMACAO EM X=50.0 Z=2.0);
G00 X50.0 Z2.0 M08;

(EXEMPLO DE CANAL AXIAL LARGO NA FACE DA PECA);
G74 R1.0;
G74 X20.0 Z-20.0 P1500 Q5000 F0.12;

G00 X150.0 Z150.0 M09;
M30;`
  }
];
