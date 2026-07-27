export interface HandoutItem {
  id: string;
  code: string;
  label?: string;
  desc: string;
  category: "Funções G" | "Ciclos INDEX" | "Parâmetros O8090" | "Comandos Especiais" | "Exemplo Prático";
  modal?: boolean;
  details?: string[];
}

export const FUNCOES_G: HandoutItem[] = [
  { id: "g00", code: "G00", desc: "Movimento rápido (Posicionamento rápido)", category: "Funções G", modal: true },
  { id: "g01", code: "G01", desc: "Movimento com avanço programado (Interpolação linear)", category: "Funções G", modal: true },
  { id: "g02", code: "G02", desc: "Movimento circular sentido horário (Interpolação circular CW)", category: "Funções G", modal: true },
  { id: "g03", code: "G03", desc: "Movimento circular sentido anti-horário (Interpolação circular CCW)", category: "Funções G", modal: true },
  { id: "g04", code: "G04", desc: "Tempo de permanência (Dwell)", category: "Funções G" },
  { id: "g07", code: "G07", desc: "Interpolação com eixo fictício", category: "Funções G" },
  { id: "g07_1", code: "G07.1", label: "G07.1 (G107)", desc: "Interpolação cilíndrica", category: "Funções G" },
  { id: "g09", code: "G09", desc: "Parada de precisão", category: "Funções G" },
  { id: "g10", code: "G10", desc: "Entrada de dados por meio do programa", category: "Funções G" },
  { id: "g11", code: "G11", desc: "Fim do modo 'Entrada de dados por meio do programa'", category: "Funções G" },
  { id: "g12_1", code: "G12.1", label: "G12.1 (G112)", desc: "Ativar interpolação polar (TRANSMIT.)", category: "Funções G" },
  { id: "g13_1", code: "G13.1", label: "G13.1 (G113)", desc: "Desativar interpolação polar (TRANSMIT.)", category: "Funções G" },
  { id: "g17", code: "G17", desc: "Seleção do plano XpYp", category: "Funções G" },
  { id: "g18", code: "G18", desc: "Seleção do plano ZpXp", category: "Funções G" },
  { id: "g19", code: "G19", desc: "Seleção do plano YpZp", category: "Funções G" },
  { id: "g20", code: "G20", desc: "Dimensões em polegadas", category: "Funções G" },
  { id: "g21_dim", code: "G21", desc: "Dimensões em milímetros", category: "Funções G" },
  { id: "g25", code: "G25", desc: "Desativar monitoramento da rotação do fuso", category: "Funções G" },
  { id: "g26", code: "G26", desc: "Ativar monitoramento da rotação do fuso", category: "Funções G" },
  { id: "g21_g78_g92", code: "G21 / G78 / G92", desc: "Ciclo de rosca (variantes dependendo do comando)", category: "Funções G" },
  { id: "g33_g32", code: "G33 / G32", desc: "Rosqueamento com passo constante", category: "Funções G" },
  { id: "g34", code: "G34", desc: "Rosqueamento com passo variável", category: "Funções G" },
  { id: "g40", code: "G40", desc: "Cancelamento da correção de raio de corte", category: "Funções G" },
  { id: "g41", code: "G41", desc: "Correção do raio de corte à esquerda", category: "Funções G" },
  { id: "g42", code: "G42", desc: "Correção do raio de corte à direita", category: "Funções G" },
  { id: "g50_4", code: "G50.4", desc: "Desligar acoplamento eletrônico de eixos (Controle síncrono)", category: "Funções G" },
  { id: "g51_4", code: "G51.4", desc: "Ligar acoplamento eletrônico de eixos (Controle síncrono)", category: "Funções G" },
  { id: "g52", code: "G52", desc: "Definir o sistema de coordenadas local", category: "Funções G" },
  { id: "g53", code: "G53", desc: "Avanço rápido referente ao sistema de coordenadas da máquina", category: "Funções G" },
  { id: "g59", code: "G59", desc: "Seleção do sistema de coordenadas da peça de trabalho 6", category: "Funções G" },
  { id: "g61", code: "G61", desc: "Modo de parada de precisão", category: "Funções G" },
  { id: "g63", code: "G63", desc: "Modo de perfuração de rosca", category: "Funções G" },
  { id: "g65", code: "G65", desc: "Chamada de macro", category: "Funções G" },
  { id: "g66", code: "G66", desc: "Chamada modal de macro A", category: "Funções G" },
  { id: "g66_1", code: "G66.1", desc: "Chamada local de macro B", category: "Funções G" },
  { id: "g67", code: "G67", desc: "Fim da chamada modal de macro A/B", category: "Funções G" },
  { id: "g70_g72", code: "G70 / G72", desc: "Ciclo de acabamento", category: "Funções G" },
  { id: "g71_g73", code: "G71 / G73", desc: "Ciclo de desbaste longitudinal", category: "Funções G" },
  { id: "g71_g72_g74", code: "G71 / G72 / G74", desc: "Ciclo de desbaste faceamento", category: "Funções G" },
  { id: "g73_g75", code: "G73 / G75", desc: "Ciclo de desbaste paralelo ao contorno", category: "Funções G" },
  { id: "g74_g76", code: "G74 / G76", desc: "Ciclo de furação profunda / ciclo canal frontal", category: "Funções G" },
  { id: "g75_g77", code: "G75 / G77", desc: "Ciclo canal radial / ciclo faceamento", category: "Funções G" },
  { id: "g76_g78", code: "G76 / G78", desc: "Ciclo de rosca", category: "Funções G" },
  { id: "g80", code: "G80", desc: "Cancelar ciclo de furação", category: "Funções G" },
  { id: "g83", code: "G83", desc: "Ciclo de furação longitudinal", category: "Funções G" },
  { id: "g84", code: "G84", desc: "Ciclo de perfuração de rosca em direção Z", category: "Funções G" },
  { id: "g87", code: "G87", desc: "Ciclo de furação radial", category: "Funções G" },
  { id: "g88", code: "G88", desc: "Ciclo de perfuração de rosca em direção X", category: "Funções G" },
  { id: "g90", code: "G90", desc: "Programação em medidas absolutas", category: "Funções G" },
  { id: "g91", code: "G91", desc: "Programação em medidas incrementais", category: "Funções G" },
  { id: "g92_g50", code: "G92 / G50", desc: "Limite de rotação máxima do fuso", category: "Funções G" },
  { id: "g93", code: "G93", desc: "Avanço recíproco ao tempo", category: "Funções G" },
  { id: "g94_g98", code: "G94 / G98", desc: "Avanço em mm/min (milímetros por minuto)", category: "Funções G" },
  { id: "g95_g99", code: "G95 / G99", desc: "Avanço em mm/rotação (milímetros por rotação)", category: "Funções G" },
  { id: "g96", code: "G96", desc: "Velocidade de corte constante (m/min)", category: "Funções G", modal: true },
  { id: "g97", code: "G97", desc: "Fim da velocidade de corte constante (Ativa RPM fixo)", category: "Funções G", modal: true }
];

export const CICLOS_INDEX: HandoutItem[] = [
  { id: "idx_g8100", code: "G8100", desc: "Posição inicial (Ciclo de retorno ou macro de segurança)", category: "Ciclos INDEX" },
  { id: "idx_g8113", code: "G8113", desc: "Deslocamento contra encosto fixo (Somente INDEX ABC)", category: "Ciclos INDEX" },
  { id: "idx_g8117", code: "G8117", desc: "Deslocamento no fuso principal Liga/Desliga", category: "Ciclos INDEX" },
  { id: "idx_g8118", code: "G8118", desc: "Movimento pendular do fuso", category: "Ciclos INDEX" },
  { id: "idx_g8127", code: "G8127", desc: "Puxar/empurrar peça com o contra fuso e determinar novo ponto zero da peça", category: "Ciclos INDEX" },
  { id: "idx_g8128", code: "G8128", desc: "Recebimento da peça de usinagem com a ajuda do contrafuso", category: "Ciclos INDEX" },
  { id: "idx_g8129", code: "G8129", desc: "Posicionar o contrafuso na posição de recuo", category: "Ciclos INDEX" },
  { id: "idx_g8130", code: "G8130", desc: "Seleção 'Usinagem do lado traseiro'", category: "Ciclos INDEX" },
  { id: "idx_g8131", code: "G8131", desc: "Desativação 'Usinagem do lado traseiro'", category: "Ciclos INDEX" },
  { id: "idx_g8132", code: "G8132", desc: "Retirada da peça de usinagem no contrafuso ou no fuso sincronizado", category: "Ciclos INDEX" },
  { id: "idx_g8133", code: "G8133", desc: "Retirada da peça restante no fuso principal", category: "Ciclos INDEX" },
  { id: "idx_g8135", code: "G8135", desc: "Eixo C com eixo redondo (Sincronismo ou modo C)", category: "Ciclos INDEX" },
  { id: "idx_g8136", code: "G8136", desc: "Fresagem de curso de cilindro", category: "Ciclos INDEX" },
  { id: "idx_g8137", code: "G8137", desc: "Usinagem axial (Furação/Fresamento na face)", category: "Ciclos INDEX" },
  { id: "idx_g8138", code: "G8138", desc: "Usinagem radial (Furação/Fresamento no diâmetro externo)", category: "Ciclos INDEX" },
  { id: "idx_g8140", code: "G8140", desc: "Selecionar eixo C e posicionar angularmente", category: "Ciclos INDEX" },
  { id: "idx_g8145", code: "G8145", desc: "Troca de barras (em comandos com monitor de 10\")", category: "Ciclos INDEX" },
  { id: "idx_g8146", code: "G8146", desc: "Sincronismo entre canais de NC através da posição dos eixos", category: "Ciclos INDEX" },
  { id: "idx_g8148", code: "G8148", desc: "Fresar roscar e tornear arestas múltiplas LIGAR", category: "Ciclos INDEX" },
  { id: "idx_g8149", code: "G8149", desc: "Fresar rosca e tornear arestas múltiplas DESLIGAR", category: "Ciclos INDEX" },
  { id: "idx_g8151", code: "G8151", desc: "Carregar dados do contra ponta", category: "Ciclos INDEX" },
  { id: "idx_g8185", code: "G8185", desc: "Troca de barras (em comandos com monitor de 15\")", category: "Ciclos INDEX" },
  { id: "idx_g8222", code: "G8222", desc: "Acoplamento eletrônico entre Fuso Principal e Fuso de Ferramentas", category: "Ciclos INDEX" },
  { id: "idx_g8225", code: "G8225", desc: "Acoplamento de eixo sobreposto LIGAR/DESLIGAR", category: "Ciclos INDEX" },
  { id: "idx_g8420", code: "G8420", desc: "Leitura de posicionamento atual de eixos", category: "Ciclos INDEX" },
  { id: "idx_g9392", code: "G9392", desc: "Verificar início subsequente", category: "Ciclos INDEX" },
  { id: "idx_g9590", code: "G9590", desc: "Ativar deslocamentos do ponto zero (G59)", category: "Ciclos INDEX" }
];

export const PARAMETROS_O8090: HandoutItem[] = [
  {
    id: "param_a",
    code: "A",
    label: "A - Tipo de decurso",
    desc: "Determina se a rosca é interna ou externa e o diâmetro a programar.",
    category: "Parâmetros O8090",
    details: [
      "A0: Rosca interna.",
      "A1: Rosca externa com diâmetro programado com o parâmetro D.",
      "A2: Diâmetro da rosca pode ser programado com o parâmetro E.",
      "Nota: Com A0 ambos os parâmetros (D e E) devem ser programados. Nos demais, dependendo da programação, um dos dois pode ser omitido."
    ]
  },
  {
    id: "param_d",
    code: "D",
    label: "D - Diâmetro externo",
    desc: "Diâmetro externo da rosca.",
    category: "Parâmetros O8090",
    details: ["Os movimentos de entrada e saída são gerados de forma helicoidal pelo ciclo, dependendo da combinação programada entre D e E."]
  },
  {
    id: "param_e",
    code: "E",
    label: "E - Diâmetro interno",
    desc: "Diâmetro interno da rosca (diâmetro do pré-furo).",
    category: "Parâmetros O8090",
    details: ["Os movimentos de entrada e saída são gerados pelo ciclo, baseados na relação D e E."]
  },
  {
    id: "param_i",
    code: "I",
    label: "I - Centro da abscissa",
    desc: "Determina a coordenada do centro da rosca na abscissa do plano ativo (X no plano G17, ou correspondente em G19).",
    category: "Parâmetros O8090"
  },
  {
    id: "param_j",
    code: "J",
    label: "J - Centro da ordenada",
    desc: "Determina a coordenada do centro da rosca na ordenada do plano ativo (Y no plano G17, ou correspondente em G19).",
    category: "Parâmetros O8090"
  },
  {
    id: "param_m",
    code: "M",
    label: "M - Plano de referência",
    desc: "Ponto inicial absoluto do ciclo de rosca no plano longitudinal (Z).",
    category: "Parâmetros O8090",
    details: ["O plano de referência é o ponto de partida do avanço de usinagem helicoidal. Depende da seleção prévia do plano (G17/G18/G19)."]
  },
  {
    id: "param_u",
    code: "U",
    label: "U - Profundidade absoluta",
    desc: "Profundidade final da rosca programada de forma absoluta.",
    category: "Parâmetros O8090",
    details: ["Mutualmente exclusivo ou alternativo ao parâmetro W (profundidade relativa)."]
  },
  {
    id: "param_w",
    code: "W",
    label: "W - Profundidade relativa",
    desc: "Profundidade final da rosca programada de forma incremental/relativa ao plano de referência M.",
    category: "Parâmetros O8090"
  },
  {
    id: "param_k",
    code: "K",
    label: "K - Passo por revolução",
    desc: "Indica o passo físico da rosca (ex: 1.5 para rosca M14x1.5).",
    category: "Parâmetros O8090",
    details: ["Deve ser introduzido sempre como valor absoluto positivo (sem sinal)."]
  },
  {
    id: "param_h",
    code: "H",
    label: "H - Plano de retorno",
    desc: "Coordenada longitudinal de retorno seguro da ferramenta (absoluto).",
    category: "Parâmetros O8090",
    details: ["O plano de retorno seguro H deve estar sempre posicionado antes do plano de referência M."]
  },
  {
    id: "param_s",
    code: "S",
    label: "S - Distância de segurança",
    desc: "Margem de aproximação segura antes de iniciar a usinagem.",
    category: "Parâmetros O8090",
    details: ["Atua em conjunto com o plano de referência. Introdução sempre sem sinal."]
  },
  {
    id: "param_f",
    code: "F",
    label: "F - Avanço de usinagem",
    desc: "Avanço de corte programado em mm/min.",
    category: "Parâmetros O8090",
    details: [
      "O ciclo transfere o avanço ideal para a ferramenta de fresamento de rosca.",
      "O avanço é reduzido automaticamente no movimento de entrada e saída.",
      "O curso de retorno para o ponto de partida ocorre fora do trajeto helicoidal em avanço rápido (G0)."
    ]
  },
  {
    id: "param_r",
    code: "R",
    label: "R - Direção de usinagem",
    desc: "Define o sentido da interpolação helicoidal (G02 ou G03).",
    category: "Parâmetros O8090",
    details: [
      "R2: Direção de usinagem G02 (sentido horário).",
      "R3: Direção de usinagem G03 (sentido anti-horário).",
      "Nota: Se o parâmetro R não for programado, o ciclo assume automaticamente o sentido G03 (anti-horário)."
    ]
  }
];

export const COMANDOS_ESPECIAIS: HandoutItem[] = [
  { id: "sp_g8100", code: "G8100", desc: "Cancela todas as funções ativas de ciclos (Macro Inicial de segurança)", category: "Comandos Especiais" },
  { 
    id: "sp_zmw1", 
    code: "[#ZMW1]=231.2", 
    label: "[#ZMW1]=231.2 (94 + COMP. PEÇA FORA)", 
    desc: "Define variável de controle ZMW1 para comprimento da peça fora da pinça no Canal 1 (94 + COMP. PEÇA FORA).", 
    category: "Comandos Especiais", 
    details: [
      "Fórmula de Cálculo: [#ZMW1] = 94 + Comprimento da Peça para Fora.",
      "Constante de Placa (Placa de referência / Cabeçote): 94mm.",
      "Valor de Exemplo: 231.2mm (calculado como 94 + 137.2mm de peça externa)."
    ] 
  },
  { 
    id: "sp_zmw3", 
    code: "[#ZMW3]=113.824", 
    label: "[#ZMW3]=113.824 (94 + COMP. PEÇA FORA)", 
    desc: "Define variável de controle ZMW3 para comprimento da peça fora no Canal 3 (94 + COMP. PEÇA FORA).", 
    category: "Comandos Especiais", 
    details: [
      "Fórmula de Cálculo: [#ZMW3] = 94 + Comprimento da Peça para Fora.",
      "Constante de Placa (Placa de referência / Contra-fuso): 94mm.",
      "Valor de Exemplo: 113.824mm (calculado como 94 + 19.824mm de peça externa)."
    ] 
  },
  { id: "sp_h1", code: "H1.0060", desc: "Código de pressão de aperto do fuso (spindle)", category: "Comandos Especiais" },
  { id: "sp_m2005", code: "M2005P123", desc: "Código de Sincronismo entre Canais com sufixo P123", category: "Comandos Especiais" },
  { id: "sp_g65_8420", code: "G65P8420", desc: "Chamada de Macro para verificar se tem barra no alimentador", category: "Comandos Especiais" },
  { id: "sp_t105", code: "T105005", desc: "Chamada de Tope (encosto de barras / referenciador)", category: "Comandos Especiais" },
  { id: "sp_g9590", code: "G9590A1", desc: "Ativação de ponto zero de trabalho G59", category: "Comandos Especiais" },
  { id: "sp_m169", code: "/1N6M169", desc: "Linha condicional para abrir a pinça de fixação A no Canal 1", category: "Comandos Especiais" },
  { id: "sp_av_alim", code: "/1N8G1G94Z0.2M999...F8000", label: "/1N8G1G94Z0.2M999M1591F8000", desc: "Ativação condicional e avanço seguro para ligar alimentador automático de barras", category: "Comandos Especiais" },
  { id: "sp_m168", code: "M168", desc: "Comando para fechar a pinça de fixação A", category: "Comandos Especiais" },
  { id: "sp_g0_g95", code: "G0G95Z20.", desc: "Movimento rápido em modo de avanço por rotação até a coordenada segura Z20.", category: "Comandos Especiais" },
  { id: "sp_g96_m403", code: "G96S4=200M403", desc: "Define velocidade de corte de 200 m/min no fuso principal (S4) com rotação ligada", category: "Comandos Especiais" },
  { id: "sp_m1801", code: "M1801", desc: "Ligar refrigeração com fluxo de óleo de corte", category: "Comandos Especiais" },
  { id: "sp_g53_r1", code: "G53X260Y0", desc: "Recuo seguro no sistema de coordenadas da máquina para ponto de troca da torre (Revólver 1)", category: "Comandos Especiais" },
  { id: "sp_g8140", code: "G8140W0S4", desc: "Posicionamento angular e ativação do eixo C do fuso principal", category: "Comandos Especiais" },
  { id: "sp_g8138", code: "G8138", desc: "Ativação do eixo Y (ou modo onde X opera em raio)", category: "Comandos Especiais" },
  { id: "sp_g1_g94", code: "G1G94Y-25F500(1)", desc: "Avanço linear condicional de -25mm a 500 mm/min no eixo Y", category: "Comandos Especiais" },
  { id: "sp_g8135", code: "G8135", desc: "Ativar fuso síncrono / eixos C sincronizados eletronicamente", category: "Comandos Especiais" },
  { id: "sp_t101", code: "T101001", label: "T101001 (Chamada de Ferramenta)", desc: "Seleciona ferramenta T1 na torre com corretores de geometria e desgaste 01", category: "Comandos Especiais" },
  { id: "sp_m1850", code: "M1850", desc: "Ligar bomba secundária de refrigeração 2", category: "Comandos Especiais" },
  { id: "sp_m1813", code: "M1813", desc: "Ligar refrigeração por óleo sob alta pressão", category: "Comandos Especiais" },
  { id: "sp_m1803", code: "M1803", desc: "Ligar óleo reverso (fluxo reverso do óleo para limpeza/evacuação)", category: "Comandos Especiais" },
  { id: "sp_g9392", code: "G9392Q99", desc: "Retorno seguro ao início do programa (modo N99 / contínuo)", category: "Comandos Especiais" },
  { id: "sp_g8137_w30", code: "G8137A0W30", desc: "Ativar Y virtual / usinagem axial com deslocamento longitudinal de 30mm", category: "Comandos Especiais" },
  { id: "sp_g8137_w210", code: "G8137A0W210", desc: "Posicionar fuso ou Y virtual em avanço de usinagem até a coordenada longitudinal 210mm", category: "Comandos Especiais" },
  { id: "sp_3n51", code: "/3N51T301000", desc: "Chamada condicional de ferramenta T30 no fuso traseiro (Canal 3)", category: "Comandos Especiais" },
  { id: "sp_m1807", code: "/3N52(M1807)", desc: "Ligar refrigeração por óleo contra o fuso (Canal 3)", category: "Comandos Especiais" },
  {
    id: "sp_g8132_retirada",
    code: "/3N53G8132...",
    label: "/3N53G8132A0C-16D120E1300H62W60",
    desc: "Ciclo completo de retirada de peça no contrafuso com eixos síncronos.",
    category: "Comandos Especiais",
    details: [
      "A=0: Pega e descarrega a peça na esteira imediatamente.",
      "A=1: Pega e aguarda comandos adicionais.",
      "C=-16: Coordenada de posicionamento do pega.",
      "D=120: Posição segura para retirada da peça da pinça.",
      "E=1300: Coordenada de descarte de peça na esteira.",
      "H=62: Altura do centro do mordente para ajuste seguro.",
      "W=60: Coordenada de posicionamento angular/linear do sub-eixo C."
    ]
  },
  { id: "sp_m325", code: "/3N54M325", desc: "Verificar fixação física e pressão da peça na pinça (Canal 3)", category: "Comandos Especiais" },
  { id: "sp_m1907", code: "/3N55M1907", desc: "Habilitar acoplamento de rotação entre fusos e alinhamento angular", category: "Comandos Especiais" },
  {
    id: "sp_g8128_recebimento",
    code: "/3N57G8128...",
    label: "/3N57G8128A0W0D0R19S-110U5H94",
    desc: "Ciclo automático de recebimento de peça com auxílio do contrafuso.",
    category: "Comandos Especiais",
    details: [
      "A=0: Descolar contra fuso sobre a peça de trabalho A.",
      "W=0: Deslocamento angular de ajuste.",
      "D=0: Posição angular de pega do sub-eixo C.",
      "R=19: Tipo de pega (sentido rotacionando, em parada de precisão ou angularmente posicionada).",
      "S=-110: Comprimento/extensão física da pega.",
      "U=5: Distância de aproximação rápida incremental.",
      "H=94: Comprimento físico da placa (Sempre ajustado em 94)."
    ]
  },
  { id: "sp_m161", code: "/3N61G8129A1", desc: "Cancela o recebimento/pega de peça ativo", category: "Comandos Especiais" },
  { id: "sp_g8185_barra", code: "G8185A1D100S1.5", desc: "Ciclo de troca de barras automática com rotação pendente e temporizada", category: "Comandos Especiais" }
];

export const EXEMPLO_PRATICO = {
  title: "Exemplo Prático: Rosca Interna no Fuso Principal",
  subtitle: "Usinagem de rosca M14x1.5 com fresamento helicoidal e fuso síncrono (Plano G19, Revólver 1)",
  code: `%
O0014
(Fresamento)
T3003
G9590A1
G8138
G0X20Z2
M103S1=1500
G1G94M1801
(Fresamento de rosca/interna/G19/ M14x1,5)
G65P8090A0D14E12.4I0J-20M12.5W2.5R2K1.5H18.5F300
G8135
G53X250M105
G53Z300
M99
%`,
  steps: [
    { line: "% / O0014", desc: "Cabeçalho do programa CNC com número do programa O0014." },
    { line: "(Fresamento)", desc: "Comentário indicando o início do subgrupo de operações de fresamento." },
    { line: "T3003", desc: "Chamada do conjunto ferramenta de fresar roscas (T30) com corretores ativos." },
    { line: "G9590A1", desc: "Ativação do deslocamento de ponto zero (Work Offset) na coordenada G59." },
    { line: "G8138", desc: "Habilita a usinagem radial (eixo Y ativado e plano de corte configurado)." },
    { line: "G0X20Z2", desc: "Aproximação rápida segura até diâmetro X20 e coordenada de face Z2." },
    { line: "M103S1=1500", desc: "Aciona rotação da ferramenta acionada a 1500 RPM no fuso ativo." },
    { line: "G1G94M1801", desc: "Trabalha com avanço por minuto (G94), avança de forma linear de aproximação e liga o óleo de corte (M1801)." },
    { line: "G65P8090...", desc: "Chamada de Macro do ciclo de fresar roscas O8090: Interna (A0), Diâmetro externo 14mm (D14), Diâmetro interno 12.4mm (E12.4), Centro I0 J-20, Plano de referência Z12.5, Avanço incremental 2.5mm, Sentido G02 (R2), Passo 1.5mm (K1.5), Retorno seguro H18.5, Avanço F300." },
    { line: "G8135", desc: "Retorna para o modo de sincronismo de eixos C e fuso principal." },
    { line: "G53X250M105", desc: "Recuo rápido para ponto de troca em X250 e desliga a rotação da ferramenta acionada (M105)." },
    { line: "G53Z300", desc: "Recuo longitudinal rápido e seguro em Z300." },
    { line: "M99", desc: "Fim do subprograma / retorno do ciclo." }
  ]
};
