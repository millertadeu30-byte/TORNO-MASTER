export interface SenaiManualChapter {
  id: string;
  title: string;
  category: string;
  slides: string; // Range of slides or source reference
  description: string;
  content: string; // Markdown or rich text content
  formula?: string;
  examples?: {
    title: string;
    description: string;
    code: string;
    imageRef?: string;
    points?: { pt: string; x: string; z: string }[];
  }[];
  calculators?: {
    type: "pythagoras" | "trig" | "thread-inch" | "coordinate-mode";
    label: string;
  }[];
}

export const SENAI_MANUAL_CHAPTERS: SenaiManualChapter[] = [
  {
    id: "intro-coords",
    title: "1. Introdução & Sistemas de Coordenadas",
    category: "Coordenadas",
    slides: "Slides 1 a 17",
    description: "Conceitos de Torno CNC, Torre Traseira vs Dianteira, Zero Peça, e Sistemas de Coordenadas Absolutas e Incrementais.",
    content: `O torno CNC é uma máquina ferramenta que permite a usinagem de peças cilíndricas com altíssimo grau de precisão. Toda a movimentação da ferramenta de corte é controlada por meio de coordenadas cartesianas transmitidas ao comando computadorizado.

### Os Eixos no Torno CNC
* **Eixo X**: Refere-se à medida transversal (diâmetro da peça). Sempre lembre que as coordenadas de X são expressas no diâmetro (a máquina converte o raio automaticamente).
* **Eixo Z**: Refere-se à medida longitudinal (comprimento da peça, paralelo ao eixo da árvore).

### Tipos de Torre
* **Torre Traseira (Esquerda)**: Padrão universal. As ferramentas estão alocadas na parte do fundo da máquina. Sentido positivo de X (+) aponta para cima (afastando-se do operador).
* **Torre Dianteira (Direita)**: Comum em tornos convencionais adaptados. Sentido positivo de X (+) aponta para baixo (aproximando-se do operador).

### Zero-Peça (Origem X0, Z0)
Origem estabelecida em função da peça para facilitar a programação:
1. **Origem na Face da Peça**: Padrão mais utilizado. Facilita o controle das medidas, pois todo comprimento interno à peça é negativo (-Z).
2. **Origem no Fundo (Encosto das Castanhas)**: Útil em peças muito longas onde o comprimento total bruto pode variar.

### Coordenadas Absolutas (G90) vs Incrementais (G91)
* **Coordenadas Absolutas (G90)**: Todas as posições são referenciadas em relação a uma única origem física pré-estabelecida (Zero-Peça X0, Z0).
* **Coordenadas Incrementais (G91 / U & W)**: A posição atual da ferramenta funciona como uma nova origem. O próximo movimento é medido pela distância a ser percorrida (U para incremento em X e W para incremento em Z).`,
    examples: [
      {
        title: "Origem no Fundo da Peça (Absoluto)",
        description: "Programação absoluta tomando como X0 Z0 o encosto das castanhas da placa.",
        code: "(Origem no Fundo);\nPONTO A: X=0.0   Z=30.0;\nPONTO B: X=30.0  Z=30.0;\nPONTO C: X=50.0  Z=20.0;\nPONTO D: X=70.0  Z=20.0;\nPONTO E: X=80.0  Z=15.0;\nPONTO F: X=80.0  Z=0.0;",
        points: [
          { pt: "A", x: "0", z: "30" },
          { pt: "B", x: "30", z: "30" },
          { pt: "C", x: "50", z: "20" },
          { pt: "D", x: "70", z: "20" },
          { pt: "E", x: "80", z: "15" },
          { pt: "F", x: "80", z: "0" }
        ]
      },
      {
        title: "Origem na Face da Peça (Absoluto)",
        description: "Programação absoluta tomando como X0 Z0 a face frontal acabada da peça.",
        code: "(Origem na Face);\nPONTO A: X=0.0   Z=0.0;\nPONTO B: X=30.0  Z=0.0;\nPONTO C: X=50.0  Z=-10.0;\nPONTO D: X=70.0  Z=-10.0;\nPONTO E: X=80.0  Z=-15.0;\nPONTO F: X=80.0  Z=-30.0;",
        points: [
          { pt: "A", x: "0", z: "0" },
          { pt: "B", x: "30", z: "0" },
          { pt: "C", x: "50", z: "-10" },
          { pt: "D", x: "70", z: "-10" },
          { pt: "E", x: "80", z: "-15" },
          { pt: "F", x: "80", z: "-30" }
        ]
      },
      {
        title: "Programação Incremental (A para F)",
        description: "A cada deslocamento, define-se apenas a distância incremental percorrida (U para X e W para Z).",
        code: "(Movimento incremental ponto a ponto);\nDE A PARA B: U=30.0  W=0.0;\nDE B PARA C: U=20.0  W=-10.0;\nDE C PARA D: U=20.0  W=0.0;\nDE D PARA E: U=10.0  W=-5.0;\nDE E PARA F: U=0.0   W=-15.0;"
      }
    ],
    calculators: [
      { type: "coordinate-mode", label: "Comparar Absoluto vs Incremental" }
    ]
  },
  {
    id: "basic-functions",
    title: "2. Funções Básicas G00, G01 e Parâmetros (N, F, T)",
    category: "Funções Básicas",
    slides: "Slides 18 a 28",
    description: "Uso das funções básicas de posicionamento rápido, avanço de trabalho linear e parâmetros fundamentais.",
    content: `### Parâmetros de Comando Importantes
* **Código N**: Identifica sequencialmente os blocos de programa (ex: N10, N20). Seu uso é opcional e opcionalmente ignorável pelo controle.
* **Código Barra (/)**: Colocado no início do bloco. Se a opção 'SALTAR BLOCO' estiver ativa no painel do torno, esse bloco é ignorado. Exemplo: \`/M00 (parada para inspeção)\`.
* **Código F**: Velocidade de avanço de trabalho. Geralmente mm/rotação (G95) ou mm/min (G94).
* **Código T**: Seleciona a ferramenta e seu respectivo corretor geométrico de desgaste. Formato de 4 dígitos: \`T_ _ _ _\` (ex: T0101). Os dois primeiros indicam o número físico na torre; os dois últimos indicam a posição do corretor de presets. \`T00\` desabilita todas as ferramentas.

### Movimentos de Interpolação
* **Função G00**: Posicionamento rápido (aproximação e recuo). Utiliza a velocidade máxima de translação dos eixos (ex: 10m/min). Não recomendada para processos de corte de material.
  * **Sintaxe**: \`G00 X_ Z_;\`
* **Função G01**: Interpolação linear controlada pelo avanço F. Utilizada para usinagem real de perfis retilíneos ou cônicos com avanço constante.
  * **Sintaxe**: \`G01 X_ Z_ F_;\``,
    examples: [
      {
        title: "Exercício 16 - Desbaste Ponto a Ponto",
        description: "Exemplo de programa completo resolvido para usinagem escalonada de tarugo Ø48mm em desbaste ponto a ponto com profundidade AP de 1mm por passada.",
        code: "N10 G00 X150. Z150. (Ponto de Troca);\nN20 G00 X46. Z5. (Aproximacao rápida);\nN30 G01 X46. Z-48.5 F0.2 (Passada 1);\nN40 G01 X50. Z-48.5 (Subida lateral);\nN50 G00 X50. Z2. (Recuo de retorno);\nN60 G00 X44.5 Z2.;\nN70 G01 X44.5 Z-48.5 F0.2 (Passada 2);\nN80 G01 X50. Z-48.5;\nN90 G00 X50. Z2.;\nN100 G00 X42.5 Z2.;\nN110 G01 X42.5 Z-28.5 F0.2 (Passada 3);\nN120 G01 X46. Z-28.5;\nN130 G00 X46. Z2.;"
      }
    ]
  },
  {
    id: "circular-chanfer",
    title: "3. Interpolação Circular G02, G03, Chanfros e Raios",
    category: "Interpolação Circular",
    slides: "Slides 29 a 42",
    description: "Cálculo e programação de arcos circulares no sentido horário/anti-horário e comandos diretos de quebra de cantos.",
    content: `As funções **G02** e **G03** permitem usinar geometrias circulares (raios e cavidades convexas/côncavas).

### Sentido de Rotação (Normas)
* **G02**: Interpolação circular no **sentido horário**.
* **G03**: Interpolação circular no **sentido anti-horário**.

*Nota*: No torno com torre traseira clássica, o sentido visual pode parecer invertido. No painel adaptado Centur 30D (Siemens), por convenção, utiliza-se G03 para horário e G02 para anti-horário.

### Estruturas de Programação
Existem duas formas de programar arcos circulares:
1. **Através do Raio (R)**:
   * **Sintaxe**: \`G02/G03 X_ Z_ R_ F_;\` (Útil para arcos de até 180°).
2. **Através do Centro do Arco (I, K)**:
   * **Sintaxe**: \`G02/G03 X_ Z_ I_ K_ F_;\`
   * **I**: Coordenada incremental do centro do arco em relação ao início, no eixo X (medida em raio!).
   * **K**: Coordenada incremental do centro do arco em relação ao início, no eixo Z.

### Quebra de Canto Direta (,C e ,R)
Muitos comandos modernos permitem chanfrar ou arredondar cantos retos sem precisar calcular coordenadas trigonométricas intermediárias, bastando inserir no final do bloco do ponto de interseção:
* **,C**: Define o valor do **chanfro** (ex: \`G01 X20. Z-10. ,C1.0\` usina chanfro de 1x45°).
* **,R**: Define o valor do **raio de arredondamento** (ex: \`G01 X40. ,R1.5\` cria canto arredondado de R=1.5mm).`,
    examples: [
      {
        title: "Arredondamento e Chanfro (,R / ,C)",
        description: "Uso do comando simplificado para usinar a peça do Exercício 12 (Slide 42).",
        code: "N10 G00 X150. Z150.;\nN20 G00 X0. Z5. T0101;\nN30 G01 X0. Z0. F0.2 (Faceamento);\nN40 G01 X16. ,C0.5 (Chanfro de entrada);\nN50 G01 Z-11.;\nN60 G01 X23. ,R2.5 (Arredondamento de canto R2.5);\nN70 G01 Z-26.;\nN80 G01 X27.4 ,C1.0;\nN90 G01 Z-41. ,R1.0;\nN100 G01 X37.4 ,C2.0;\nN110 G01 Z-54. ,R5.0;\nN120 G01 X59. ,R2.5;\nN130 G01 X70. Z-76.;"
      },
      {
        title: "Usinagem Circular (G02/G03 com R)",
        description: "Exercício 10 (Slide 35) corrigido com interpolações circulares G02 e G03.",
        code: "N10 G00 X150. Z150.;\nN20 G00 X6. Z1.;\nN30 G01 X10. Z-1. F0.2 (Chanfro);\nN40 G01 X10. Z-9.;\nN50 G03 X16. Z-12. R3. (Arco anti-horario de R3);\nN60 G01 X16. Z-15.;\nN75 G02 X26. Z-20. R5. (Arco horario de R5);\nN80 G03 X30. Z-22. R2. (Arco anti-horario de R2);\nN90 G01 X30. Z-40.;\nN100 G01 X34. Z-40.;\nN110 G03 X50. Z-48. R8. (Arco anti-horario de R8);"
      }
    ]
  },
  {
    id: "tool-compensation",
    title: "4. Compensação de Raio de Ferramenta (G40, G41, G42)",
    category: "Compensação de Raio",
    slides: "Slides 43 a 48",
    description: "Entenda por que e como utilizar a compensação de ponta da pastilha para garantir dimensões precisas em cones e raios.",
    content: `As ferramentas de torno não possuem pontas perfeitamente vivas; elas possuem uma geometria esférica (raio de ponta, comumente 0.4mm, 0.8mm ou 1.2mm). Sem compensação de raio, superfícies cônicas e raios perdem as medidas exatas do projeto por erros de tangência geométrica.

### Funções de Compensação
* **G40**: **Cancela** a compensação de raio. Função modal ativa ao iniciar a máquina.
* **G41**: Ativa a **compensação à esquerda** do perfil (usada em torneamentos internos).
* **G42**: Ativa a **compensação à direita** do perfil (usada em torneamentos externos comuns).

### Como Configurar no Torno
Para a correta compensação pela CPU do comando, o operador deve cadastrar na tabela de corretores da máquina:
1. **O valor do Raio (R)** da pastilha instalada (ex: \`0.8\`).
2. **O quadrante/orientação da ferramenta (T)**. Para ferramentas externas comuns de torre traseira, o quadrante padrão é **3** (torneamento esquerdo) ou **8** (faceamento). Para internas é **1** or **2**.

### Regra de Ouro da Ativação
A compensação de raio deve sempre ser ativada e desativada em um movimento rápido de aproximação/afastamento em G00 linear. O deslocamento nesse bloco de ativação deve ser maior que o dobro do raio do inserto geométrico para evitar alarmes de colisão (ex: mover pelo menos 2mm).`,
    examples: [
      {
        title: "Ativação Externa (G42)",
        description: "Sequência correta de faceamento, aproximação com ativação de compensação de raio externa (G42) e cancelamento no recuo rápido (G40).",
        code: "N60 G00 X34. Z0 M08;\nN70 G01 X-2. F0.2 (Faceia a peca);\nN80 G00 X27. Z2. (Afasta a ponta);\nN90 G42 (Ativa compensacao de raio a direita);\nN100 G01 X27. Z0 F0.2;\nN110 X30. (Usinagem);\nN120 X50. Z-10.;\nN130 X70.;\nN140 G03 X80. Z-15. R5.;\nN150 G01 X80. Z-17.;\nN160 X84.;\nN170 G40 G00 X150. Z150. T0100 (Cancela a compensacao e recua);"
      }
    ]
  },
  {
    id: "headers-speeds",
    title: "5. Estruturas, Cabeçalho, G54 e Velocidades (G92, G96, G97)",
    category: "Estruturas e Velocidades",
    slides: "Slides 49 a 60",
    description: "Estruturação de cabeçalhos padrão FANUC/Siemens e controle da velocidade de corte (VCC) versus rotação fixa (RPM).",
    content: `Toda programação estruturada requer uma sequência lógica e instruções iniciais de cabeçalho seguras para evitar flutuações e colisões.

### Cabeçalhos Padrão de Inicialização
* **FANUC**:
  \`\`\`
  N10 G21 G40 G90 G95;
  \`\`\`
* **SIEMENS 828D**: Requer habilitar a linguagem ISO antes:
  \`\`\`
  N10 G291;
  N20 G21 G40 G90 G95;
  \`\`\`

### Modos de Velocidades e Rotações (Código S)
1. **Velocidade de Corte Constante - G96 (VCC)**:
   * **Sintaxe**: \`G96 S200 M03;\` (onde S é a velocidade em metros/minuto, ex: 200m/min).
   * À medida que a ferramenta se aproxima do centro da peça (diâmetros menores), o fuso do torno acelera (RPM sobe) para manter a velocidade tangencial idêntica. Essencial para acabamento fino e vida útil de insertos.
2. **Limite de Rotação - G92**:
   * **Sintaxe**: \`G92 S3500;\` (Fixa o fuso a no máximo 3500 RPM).
   * **Obrigatório** usar em conjunto com G96 para prevenir aceleração descontrolada em X=0, evitando perigo de a peça se soltar do mandril pela força centrífuga.
3. **Rotação Fixa Direta - G97 (RPM)**:
   * **Sintaxe**: \`G97 S1500 M03;\` (Gira fuso fixamente a 1500 RPM).
   * Recomendada para ciclos de furação axial, roscamentos e usinagens pesadas.`,
    examples: [
      {
        title: "Sequência Completa de Programação",
        description: "Esqueleto padrão FANUC passo a passo para usinar um perfil cilíndrico completo.",
        code: "N10 G21 G40 G90 G95; (Cabecalho);\nN20 T00 (Desabilita corretores);\nN30 G54 G00 X150. Z150. (Ponto de troca seguro);\nN40 T0101 (Troca para ferramenta 1 e corretor 1);\nN50 G92 S3000 (Limita rotacao maxima em 3000 RPM);\nN60 G96 S250 M04 (Ativa VCC 250m/min e gira placa sentido horario);\nN70 G00 X64. Z5. M08 (Aproxima e liga refrigeracao);\nN80 G01 Z0. F0.2 (Faceamento inicial);\n...\nN180 G00 G40 X150. Z150. T0100 M09 (Desliga refrigeracao, cancela G42 e recua);\nN190 M30 (Fim de programa);"
      }
    ]
  },
  {
    id: "turning-cycles",
    title: "6. Ciclos Automáticos de Desbaste e Acabamento (G71, G72, G73, G70)",
    category: "Ciclos de Torneamento",
    slides: "Slides 61 a 76",
    description: "Domine a programação simplificada de desbastes em poucas linhas usando os ciclos FANUC longitudinal (G71), transversal (G72) e cópia de perfil (G73).",
    content: `Os ciclos automáticos reduzem dezenas de linhas de programação manual ponto-a-ponto para apenas duas linhas de comandos parametrizados.

### 1. Ciclo de Desbaste Longitudinal (G71)
Remove o excesso de diâmetro externo/interno em passes cilíndricos paralelos ao eixo Z.
* **1ª Linha**: \`G71 U_ R_;\`
  * **U**: Profundidade radial de corte por passada (em raio, ex: U2.0 remove 4mm no diâmetro por passe).
  * **R**: Distância radial de recuo rápido para alívio no retorno.
* **2ª Linha**: \`G71 P_ Q_ U_ W_ F_;\`
  * **P / Q**: Número sequencial do bloco inicial (N_) e final (N_) do perfil acabado.
  * **U**: Sobremetal deixado para o acabamento fino no diâmetro (eixo X).
  * **W**: Sobremetal deixado para o acabamento fino na face frontal (eixo Z).
  * **F**: Velocidade de avanço durante o ciclo de desbaste bruto.

### 2. Ciclo de Desbaste Transversal / Faceamento (G72)
Remove material em passes consecutivos de faceamento, perpendiculares ao eixo de rotação. Muito usado em flanges.
* **Sintaxe**:
  \`G72 W_ R_;\`
  \`G72 P_ Q_ U_ W_ F_;\`
  * **W (1ª linha)**: Profundidade de corte por passada linear no eixo Z.

### 3. Ciclo de Cópia de Perfil (G73)
Segue exatamente a curvatura do contorno final, recuando passes paralelos. Essencial para usinar peças pré-forjadas ou fundidas.
* **Sintaxe**:
  \`G73 U_ W_ R_;\`
  \`G73 P_ Q_ U_ W_ F_;\`
  * **U (1ª linha)**: Sobremetal total no eixo X.
  * **W (1ª linha)**: Sobremetal total no eixo Z.
  * **R (1ª linha)**: Número total de passadas para dividir o perfil bruto.

### 4. Ciclo de Acabamento (G70)
Executa a passada final para limpar o sobremetal (U/W) deixado pelos ciclos G71/G72/G73 anteriores.
* **Sintaxe**: \`G70 P_ Q_ F_;\``,
    examples: [
      {
        title: "Exemplo Prático Completo (G71 + G70)",
        description: "Usinagem da peça do Exercício 1 (Slide 69) usando o ciclo G71.",
        code: "O0001 (EXERCICIO 1);\nN10 G21 G40 G90 G95;\nN30 G54 G0 X150. Z150. T00;\nN40 T0101 (FERRAMENTA DESBASTE);\nN50 G96 S300 M04;\nN60 G92 S3000;\nN70 G0 X62. Z4. M08 (Aproximacao inicial);\nN80 G71 U2.0 R2.0 (2mm de profundidade radial, recuo 2mm);\nN90 G71 P100 Q220 U1.0 W0.15 F0.3;\nN100 G00 X-1.6 Z4. (Inicio do perfil acabado);\nN110 G01 X-1.6 Z0. F0.12;\nN120 X15. Z0.;\nN130 X20. Z-2.5;\nN140 Z-29.;\nN150 G02 X26. Z-32. R3.;\nN160 G01 X34. Z-32.;\nN170 X40. Z-35.;\nN180 Z-53.;\nN190 G02 X50. Z-58. R5.;\nN200 G01 X54. Z-58.;\nN210 X60. Z-61.;\nN220 X62. Z-61.;\nN225 G42 (Ativa compensacao antes do acabamento);\nN230 G70 P100 Q220 F0.15 (Executa o acabamento final);\nN240 G00 G40 X150. Z150. T0100 M09;\nN250 M30;"
      }
    ]
  },
  {
    id: "grooving-drilling",
    title: "7. Ciclo de Canais e Furação G75, G74, G83, G84, G85",
    category: "Canais e Furação",
    slides: "Slides 77 a 105",
    description: "Programação de canais em diâmetro ou face, furação axial intermitente (pica-pau), rosca com macho rígido e mandrilamento.",
    content: `### 1. Ciclo de Canais e Faceamento (G75)
Usa o bedame para abrir canais (canaletas ou alívios) em passes radiais paralelos:
* **1ª Linha**: \`G75 R_;\` (onde R é o recuo rápido radial para quebra de cavaco).
* **2ª Linha**: \`G75 X_ Z_ P_ Q_ F_;\`
  * **X**: Diâmetro do fundo do canal acabado.
  * **Z**: Comprimento lateral final (para canais de largura maior que a pastilha do bedame).
  * **P**: Incremento de penetração radial em microns (ex: P1500 = 1.5mm em raio).
  * **Q**: Deslocamento lateral de transpasse do bedame em microns.

### 2. Ciclo de Furação Axial Progressiva (G74)
Ideal para furos profundos de fuso com quebra-cavaco axial automático.
* **1ª Linha**: \`G74 R_;\` (onde R é o recuo axial de alívio rápido).
* **2ª Linha**: \`G74 Z_ Q_ F_;\`
  * **Z**: Profundidade final axial do furo.
  * **Q**: Incremento de penetração por picada em microns (ex: Q6000 = 6mm de furação profunda por ciclo).

### 3. Ciclo de Furação Rápida Pica-Pau (G83)
Furação com descarga de cavaco inteiramente fora do furo a cada avanço:
* **Sintaxe**: \`G83 Z_ Q_ P_ R_ F_;\`
  * **Q**: Profundidade incremental por penetração (em microns).
  * **P**: Tempo de permanência no fundo (em milissegundos).
  * **R**: Plano de aproximação de segurança (onde inicia a furação controlada).
* **G80**: Cancela todos os ciclos de furação ativos.

### 4. Rosca com Macho Rígido (G84 e CYCLE84)
* **G84**: Ativa rosqueamento direto com macho rígido em tornos Fanuc. Requer ativação prévia de macho rígido com código \`M29\`.
  * **Sintaxe**: \`G97 S500 M03; M29; G84 Z_ F_;\` (onde F é exatamente o passo nominal da rosca, ex: F1.5).
* **CYCLE84**: Ciclo específico de macho rígido em sistemas CNC Siemens 828D.

### 5. Mandrilar / Alargamento (G85)
Penetra com avanço controlado e retorna também com avanço controlado, garantindo alisamento e retificação interna do furo.
* **Sintaxe**: \`G85 Z_ F_;\``,
    examples: [
      {
        title: "Ciclo de Canais G75",
        description: "Exercício 18 (Slide 81) resolvido demonstrando o ciclo de furação e canais G75 com bedame de 4mm.",
        code: "N190 G00 X150. Z150. T0100 (Desbaste finalizado);\nN200 T0202 (BEDAME 4MM);\nN210 G97 S1500 M04;\nN220 G00 X52. Z-7. M08 (Posicionamento inicial);\nN230 G01 X27. F0.1 (Canaleta 1);\nN240 G01 X52. F0.2 (Retorno);\n...\nN400 G00 X52. Z-21.5 (Aproxima para o ciclo amplo);\nN410 G75 R2.0;\nN420 G75 X41. Z-29.5 P2000 Q8000 F0.1;\nN430 T00 M09;\nN440 G00 X150. Z150.;\nN450 M30;"
      },
      {
        title: "Furação Sequencial Completa G83",
        description: "Execução passo a passo de furos escalonados com brocas progressivas usando G83 (Slide 93).",
        code: "N10 G21 G40 G90 G95;\nN30 G54 G00 X150. Z150. T00 M08;\nN40 T0101 (BROCA CENTRO);\nN50 G97 S3000 M03;\nN60 G00 X0. Z3.;\nN70 G83 Z-5. Q7000 R-2. F0.15;\nN75 G80 M09;\nN80 G00 X150. Z150. T0100;\nN90 T0505 (BROCA DIA 28);\nN100 G97 S680 M03;\nN110 G00 X0. Z3. M08;\nN120 G83 Z-35. Q10000 P1500 R-2. F0.12;\nN125 G80;"
      }
    ]
  },
  {
    id: "threading-cycles",
    title: "8. Ciclos de Roscamento G78, G33, G76, NPT e Polegada",
    category: "Ciclos de Rosca",
    slides: "Slides 120 a 156",
    description: "Teoria, fórmulas de filetes e programação de roscas normais, de múltiplas entradas, cônicas NPT e passo em polegada.",
    content: `Roscamento no torno CNC requer perfeita sincronização digital entre o fuso da árvore e o avanço linear de Z.

### 1. Roscamento Semi-Automático (G78)
Executa passadas lineares repetidas em blocos subsequentes, onde o operador dita apenas os diâmetros (X) de descida adicionais:
* **Sintaxe**: \`G78 X_ Z_ F_;\` (onde F é o passo nominal da rosca, ex: F2.0).
* Cada diâmetro subsequente é declarado em um bloco simples.

### 2. Roscamento Passo a Passo (G33)
Usado para roscas especiais de múltiplas entradas, exigindo a declaração explícita de todos os pontos de penetração e ângulos de sincronização no cabeçote.
* **Sintaxe**: \`G33 X_ Z_ Q_ F_;\` (Q define o ângulo incremental em milésimos de graus para defasagem das entradas, ex: Q180000 para duas entradas).

### 3. Roscamento Automático Múltiplo (G76)
É o ciclo mais completo e industrial do torno. Calcula e divide todos os passes de desbaste e acabamento da rosca.
* **1ª Linha**: \`G76 P(m)(s)(a) Q_ R_;\`
  * **m**: Número de repetições do último passe de acabamento (ex: 02).
  * **s**: Saída angular no final do fuso (ex: 10 = saída em chanfro a 45°).
  * **a**: Ângulo do flanco do filete (60° para rosca Métrica ISO, 55° para Whitworth).
  * **Q**: Profundidade mínima de passe radial admissível em microns (ex: Q100 = 0.1mm).
  * **R**: Sobremetal final de acabamento (ex: R0.05).
* **2ª Linha**: \`G76 X_ Z_ R_ P_ Q_ F_;\`
  * **X / Z**: Diâmetro do fundo e comprimento final da rosca.
  * **R (2ª linha)**: Valor incremental da conicidade do filete (zero para rosca reta).
  * **P**: Altura total radial do filete em microns (Fórmula: \`P = 0.65 * passo\`, em raio. Ex: passo 1.5mm -> P = 0.65 * 1.5 = 0.975mm -> P975).
  * **Q**: Profundidade de corte do primeiro passe em microns (ex: Q250).
  * **F**: Passo da rosca (mm/volta).

### 4. Roscas em Polegada (FPP)
Exigem conversão direta antes da inserção de parâmetros:
* **Diâmetro**: Multiplica o valor em polegadas por \`25.4\` para obter diâmetro em milímetros.
* **Passo (F)**: Divide \`25.4\` pelo número de fios por polegada (FPP). Exemplo: 12fpp -> \`25.4 / 12 = 2.116mm\`.`,
    examples: [
      {
        title: "Rosca Métrica Direta G76 (M25x2.0)",
        description: "Ciclo automático FANUC completo para abrir rosca externa reta M25 passo 2.0 (Slide 137).",
        code: "N30 T0303 (FERRAMENTA ROSCA);\nN40 G97 S1000 M03;\nN50 G00 X29. Z4.;\n(Linha 1: acabamento 02 vezes, saida de fuso 10, flanco 60);\nN60 G76 P021060 Q100 R0.1;\n(Linha 2: Final X=22.4, Altura do filete=1300, Primeiro passe=392, Passo=2.0);\nN70 G76 X22.4 Z-26.5 P1300 Q392 F2.0;\nN80 G00 X190. Z200. T00;\nN90 M30;"
      },
      {
        title: "Rosca Cônica NPT G76 (14 fios/pol)",
        description: "Cálculo e usinagem de rosca NPT em cone usando compensação de conicidade R no G76 (Slide 156).",
        code: "O053 (CICLO G76 ROSCA CONICA NPT);\nN10 G21 G40 G90 G95;\nN20 G55 G0 X150. Z150. T00;\nN30 T0505 (FERR ROSCA);\nN40 G97 S600 M03;\nN50 G00 X47. Z5.;\nN60 G76 P030060 Q00 R0.1;\n(R-1.089 indica inclinacao incremental negativa externa);\nN70 G76 X41.31 Z-30. P1570 Q405 R-1.089 F1.814;\nN80 G00 X150. Z150. T00;\nN90 M30;"
      }
    ]
  },
  {
    id: "trig-math",
    title: "9. Trigonometria e Matemática de Oficina",
    category: "Trigonometria",
    slides: "Slides 106 a 115",
    description: "Uso do Teorema de Pitágoras e das razões trigonométricas para deduzir diâmetros, ângulos e pontos tangenciais de usinagem.",
    content: `Na programação de perfis que possuem cones ou raios, muitas coordenadas não são fornecidas diretamente pelo desenho técnico. O programador deve dominar a trigonometria para encontrar esses pontos.

### 1. Teorema de Pitágoras
Útil em triângulos retângulos quando se conhecem dois lados do triângulo e deseja-se encontrar o terceiro.
* **Fórmula**: \\(H^2 = C_1^2 + C_2^2\\)
  * **Hipotenusa (H)**: Lado oposto ao ângulo reto (geralmente o raio físico ou hipotenusa de cone).
  * **Catetos (C1, C2)**: Lados adjacentes ao ângulo reto.

### 2. Funções Trigonométricas (Sen, Cos, Tan)
Usadas para encontrar lados desconhecidos quando conhecemos um ângulo (graus) e pelo menos um lado:
* **Seno (Sen)**: \\(\\text{Seno } \\alpha = \\frac{\\text{Cateto Oposto}}{\\text{Hipotenusa}}\\)
* **Cosseno (Cos)**: \\(\\text{Cosseno } \\alpha = \\frac{\\text{Cateto Adjacente}}{\\text{Hipotenusa}}\\)
* **Tangente (Tan)**: \\(\\text{Tangente } \\alpha = \\frac{\\text{Cateto Oposto}}{\\text{Cateto Adjacente}}\\)

### Exemplo Prático de Ângulo
Deseja-se usinar um cone de 30° com comprimento Z=15mm. Qual a variação no diâmetro X?
1. \\(\\text{Tan } 30^\\circ = \\frac{\\text{Cateto Oposto}}{\\text{Cateto Adjacente}} = \\frac{\\Delta X/2}{15}\\)
2. \\(0.577 = \\frac{\\Delta X/2}{15}\\)
3. \\(\\Delta X/2 = 15 \\times 0.577 = 8.655\\text{mm} \\) (em raio)
4. \\(\\Delta X = 17.31\\text{mm} \\) (variação no diâmetro)

Sempre multiplique o cateto oposto por 2 para obter a variação diametral!`,
    calculators: [
      { type: "pythagoras", label: "Calculadora Teorema de Pitágoras" },
      { type: "trig", label: "Calculadora de Funções Trigonométricas (Deg)" }
    ]
  },
  {
    id: "exercises-senai",
    title: "10. Exercícios de Integração & Tarefa Somativa",
    category: "Provas e Exercícios",
    slides: "Slides 157 a 163",
    description: "Provas oficiais do SENAI integrando desbaste, acabamento, canais, furações progressivas e roscas em ambos os lados da peça.",
    content: `Estes exercícios representam o ápice do aprendizado do torneiro mecânico no SENAI, integrando todas as funções estudadas no curso em um único programa complexo de usinagem real.

### Exercício de Integração Completo (Pág. 37 do PDF)
Usinagem de eixo complexo com canais internos, furação axial progressiva de broca de centro e broca Ø20mm, mandrilamento e rosca interna.
* **Ferramentas Utilizadas**:
  * T0101: Desbaste e Acabamento Externo.
  * T0202: Broca de Centro.
  * T0303: Broca Ø20mm.
  * T0404: Ferramenta de Tornear Interno (Desbaste e Acabamento).
  * T0505: Bedame Interno de 3mm.
  * T0606: Ferramenta de Roscar Interno.
  * T0707: Bedame Externo de 3mm.
  * T0808: Ferramenta de Roscar Externo M20x1.

### Tarefa Somativa Oficial SENAI (Pág. 43 do PDF)
Peça completa usinada em ambos os lados (1º Lado e 2º Lado), contendo raios de concavidade interna R13, canais e roscas externas. Ideal para exercitar o refixamento físico e mudança do zero-peça G54.`,
    examples: [
      {
        title: "Gabarito - Exercício Pág. 37 (1º Lado)",
        description: "Gabarito oficial resolvido passo a passo da primeira fase do Exercício 37 para simulação no torno master.",
        code: "O0098 (C5F - EXERCICIO PAG 37);\nN10 G21 G40 G90 G95;\nN20 G54 G0 X150. Z150. T00;\nN30 T0101 M08 (DESBASTE EXT);\nN40 G96 S250 M04;\nN50 G92 S2500;\nN60 G0 X52. Z5.;\nN70 G71 U1.0 R1.0;\nN80 G71 P90 Q160 U1.0 W0.1 F0.25;\nN90 G00 X-0.8;\nN100 G01 Z0. F0.12;\nN110 X44.;\nN120 X48. Z-2.;\nN130 Z-8.7;\nN140 G02 X48. Z-25.3 R13.;\nN150 G01 Z-58.;\nN160 X52.;\nN170 G0 X150. Z150. T00 M09;\nN180 T0202 M08 (BROCA CENTRO);\nN190 G97 S1500 M03;\nN200 G0 X0. Z5.;\nN210 G01 Z-8. F0.13;\nN220 G01 Z5. F0.3;\nN230 G0 X150. Z150. T00 M09;\nN240 T0303 M08 (BROCA DIA 20);\nN250 G97 S800 M03;\nN260 G0 X0. Z5.;\nN270 G83 Z-39.8 Q5000 P1000 R-2. F0.08;\nN280 G80;\nN290 G0 X150. Z150. T00 M09;"
      },
      {
        title: "Gabarito - Tarefa Somativa (1º Lado)",
        description: "Solução completa da somativa oficial de laboratório CNC do SENAI.",
        code: "O0025 (TAREFA SOMATIVA 1 LADO);\nN10 G21 G40 G90 G95;\nN20 G54 G0 X150. Z150. T00;\nN30 T0101 M07 (FERR EXT);\nN40 G96 S300 M04;\nN50 G92 S3000;\nN60 G0 X64. Z6.;\nN70 G71 U1.0 R1.0;\nN80 G71 P90 Q160 U1.0 W0.1 F0.25;\nN90 G0 X-0.8;\nN100 G01 Z0. F0.15;\nN110 X58.;\nN120 X60. Z-1.;\nN130 Z-6.69;\nN140 G02 X60. Z-23.31 R13.;\nN150 G01 Z-40.;\nN160 X64.;\nN170 G0 X180. Z180. T00 M09;"
      }
    ]
  }
];
