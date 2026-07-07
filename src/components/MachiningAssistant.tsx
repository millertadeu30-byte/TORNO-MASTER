import React, { useState, useEffect, useRef } from "react";
import { Search, Calculator, Wrench, ChevronRight, HelpCircle, Copy, CheckCircle2, BookOpen, FileText, UploadCloud, Send, Trash2, AlertTriangle, Hexagon } from "lucide-react";

interface TableData {
  nome: string;
  dados: string[][];
}

interface ManualFile {
  id: string;
  name: string;
  type: "pdf" | "ppt" | "docx" | "txt";
  size: string;
  source: string;
  summary: string;
}

interface ChatMessage {
  sender: "user" | "ia";
  text: string;
  timestamp: string;
}

interface GCodeDiagnosticError {
  code: string;
  lineIndex: number;
  lineText: string;
  title: string;
  description: string;
  explanation: string;
  suggestedFix: string;
  applyFix: (currentCode: string) => string;
}

interface MachiningAssistantProps {
  onClose: () => void;
  onInsertCode: (codeToInsert: string) => void;
  onUpdateCode?: (newCode: string) => void;
  activeGCode?: string;
  isHighContrast: boolean;
  diagnosticError: string | null;
  onOpenCalculator?: (type: "rpm" | "feed" | "thread" | "polygon" | "drilling") => void;
}

const PRELOADED_MANUALS: ManualFile[] = [
  {
    id: "m-senai",
    name: "Material_Didatico_SENAI_CNC_Torneamento.pdf",
    type: "pdf",
    size: "15.2 MB",
    source: "SENAI - Antonio Devisate",
    summary: "Material oficial do SENAI abordando sistemas de coordenadas (G90/G91), compensação de raio (G40, G41, G42), cálculos trigonométricos e todos os ciclos de usinagem: Desbaste (G71, G72, G73), Acabamento (G70), Furação (G74, G83), Canais (G75), Roscamento (G33, G78, G76), Macho rígido (G84) e Mandrilamento (G85). Útil como referência técnica principal."
  },
  {
    id: "m1",
    name: "Manual_Fanuc_Series_Oi-TF_Ciclos.pdf",
    type: "pdf",
    size: "4.2 MB",
    source: "Pré-carregado",
    summary: "Manual detalhado de programação Fanuc Série Oi-TF. Abrange os ciclos G71 (Desbaste longitudinal com duas linhas de comando, detalhando o parâmetro U de profundidade e P/Q de blocos), G72 (Faceamento automático), G73 (Cópia de perfil), G75 (Ciclo de furação e canais em eixos X/Z), e G76 (Ciclo de roscagem múltipla com duas linhas, onde P define a saída angular de acabamento e filete, Q é o passe mínimo e F o passo)."
  },
  {
    id: "m2",
    name: "Manual_Torneamento_Sandvik_Parametros.pdf",
    type: "pdf",
    size: "8.7 MB",
    source: "Pré-carregado",
    summary: "Catálogo técnico Sandvik Coromant de torneamento geral. Fornece recomendações de Velocidade de Corte (Vc) de 150 a 300 m/min para aços de baixo carbono (SAE 1020), 120 a 200 m/min para aços liga (SAE 4140) e avanços recomendados (fn) de 0.15 a 0.45 mm/volta para pastilhas com raio de ponta de 0.8 mm (ex: TNMG 160408)."
  },
  {
    id: "m3",
    name: "PowerPoint_Programacao_Torno_Romi_CNC.pptx",
    type: "ppt",
    size: "14.5 MB",
    source: "Pré-carregado",
    summary: "Apresentação de treinamento das máquinas CNC Romi. Cobre comandos básicos de torre, troca de ferramentas (T0101), sentido de rotação M03/M04, controle de rotação constante G97 ou velocidade de corte constante G96 limitando o giro máximo com G92 S3000. Descreve a estrutura de cabeçalho e fim de programa padrão (M30)."
  }
];

export interface SenaiTopic {
  id: string;
  category: string;
  title: string;
  code: string;
  syntax: string;
  explanation: string;
  practicalUse: string;
  details: string;
}

export const SENAI_MANUAL_TOPICS: SenaiTopic[] = [
  {
    id: "head",
    category: "Estrutura",
    title: "Cabeçalho Padrão SENAI",
    code: "N10",
    syntax: "N10 G21 G40 G90 G95 G99;",
    explanation: "Define as condições iniciais de segurança e parâmetros globais de usinagem.",
    practicalUse: "Obrigatório no início de qualquer programa conforme as diretrizes oficiais do SENAI. Evita colisões ao garantir que compensações estejam desligadas.",
    details: "• G21: Programação em milímetros (padrão métrico).\n• G40: Cancela compensação de raio da ponta da ferramenta ativa.\n• G90: Sistema de coordenadas em modo absoluto (todas as medidas partem do zero-peça).\n• G95: Avanço por rotação (f em mm/rot), permitindo que a velocidade de corte ajuste o avanço dinamicamente."
  },
  {
    id: "g54",
    category: "Coordenadas",
    title: "Zero Peça (Origem de Trabalho)",
    code: "G54",
    syntax: "G54 X0.0 Z0.0;",
    explanation: "Ativa as coordenadas da origem de trabalho (zero-peça) cadastradas no controle.",
    practicalUse: "Posiciona a ferramenta de forma que a face frontal e o centro da peça acabada sejam a referência (X=0, Z=0) para todos os cálculos seguintes do programa.",
    details: "• Deve ser inserido imediatamente após a aproximação rápida.\n• Todo deslocamento incremental ou absoluto subsequente utiliza esta origem de trabalho registrada na placa do torno."
  },
  {
    id: "g96",
    category: "Velocidades",
    title: "Velocidade de Corte Constante (VCC)",
    code: "G96",
    syntax: "G96 S180 M03;",
    explanation: "Mantém a velocidade de corte constante ajustando a rotação (RPM) conforme a ferramenta se aproxima ou se afasta do centro.",
    practicalUse: "Melhora o acabamento superficial e aumenta drasticamente a vida útil da pastilha de metal duro, pois o torque e o atrito se mantêm lineares.",
    details: "• S180: Define a velocidade de corte (Vc) em 180 metros por minuto.\n• À medida que o diâmetro da peça diminui durante a usinagem, o controle eleva o RPM automaticamente."
  },
  {
    id: "g92",
    category: "Velocidades",
    title: "Limite de Rotação Máxima",
    code: "G92",
    syntax: "G92 S3000;",
    explanation: "Estabelece um teto seguro para a rotação da árvore durante o uso do comando G96.",
    practicalUse: "Evita que a rotação aumente excessivamente em diâmetros muito pequenos ou no centro da peça, prevenindo acidentes, quebra de pastilhas ou vibrações excessivas.",
    details: "• S3000: Fixa o limite máximo de rotação segura em 3000 RPM.\n• Deve ser declarado antes do comando G96 no bloco."
  },
  {
    id: "g97",
    category: "Velocidades",
    title: "Rotação Constante Fixa (RPM)",
    code: "G97",
    syntax: "G97 S1200 M03;",
    explanation: "Ativa a rotação fixa direta sem variação em relação ao diâmetro usinado.",
    practicalUse: "Indispensável para furações de centro, roscamentos rígidos ou operações onde a placa deve manter um giro perfeitamente linear.",
    details: "• S1200: Fixa a placa a exatamente 1200 RPM.\n• Desativa automaticamente o comando de velocidade de corte constante G96."
  },
  {
    id: "g41-g42",
    category: "Compensação",
    title: "Compensação de Raio de Ponta",
    code: "G41 / G42",
    syntax: "G00 X20.0 Z2.0 G42 T0101;\n...\nG40 G00 X100.0 Z100.0 T0100;",
    explanation: "Compensa o raio esférico da ponta da ferramenta de corte para que o contorno usinado corresponda exatamente ao desenho técnico.",
    practicalUse: "Elimina discrepâncias dimensionais em superfícies cônicas e raios/cantos arredondados provocados pela geometria da pastilha.",
    details: "• G42: Compensação à direita do perfil usinado (torneamento externo comum).\n• G41: Compensação à esquerda do perfil (torneamento interno/furos).\n• G40: Cancela a compensação. Obrigatório desativar no momento de afastar a ferramenta antes da troca."
  },
  {
    id: "g71",
    category: "Ciclos de Torneamento",
    title: "Ciclo de Desbaste Longitudinal",
    code: "G71",
    syntax: "G71 U2.0 R1.0;\nG71 P10 Q20 U0.4 W0.2 F0.25;",
    explanation: "Remove o excesso de material em passes lineares paralelos ao eixo de rotação Z.",
    practicalUse: "Ideal para reduzir o diâmetro de tarugos brutos de forma rápida e segura com apenas duas linhas de comando.",
    details: "• U (1ª linha): Profundidade radial de corte por passada (ex: U2.0 = 2mm de profundidade).\n• R (1ª linha): Afastamento rápido de retorno após cada corte.\n• P: Número do bloco inicial do perfil de contorno (ex: N10).\n• Q: Número do bloco final do perfil (ex: N20).\n• U (2ª linha): Sobremetal para acabamento no eixo X (diâmetro).\n• W (2ª linha): Sobremetal para acabamento no eixo Z.\n• F: Avanço de torneamento por rotação."
  },
  {
    id: "g72",
    category: "Ciclos de Torneamento",
    title: "Ciclo de Desbaste Transversal",
    code: "G72",
    syntax: "G72 W1.5 R1.0;\nG72 P10 Q20 U0.4 W0.2 F0.22;",
    explanation: "Remove material em passes consecutivos de faceamento, perpendiculares ao eixo de rotação.",
    practicalUse: "Recomendado para peças com diâmetro maior que o comprimento ou desbastes acentuados de face frontal.",
    details: "• W (1ª linha): Profundidade de corte por passe ao longo do eixo Z.\n• R (1ª linha): Recuo de retorno rápido.\n• Parâmetros P, Q, U, W e F seguem o mesmo padrão do G71."
  },
  {
    id: "g73",
    category: "Ciclos de Torneamento",
    title: "Ciclo de Cópia de Perfil",
    code: "G73",
    syntax: "G73 U3.0 W2.0 R5;\nG73 P10 Q20 U0.4 W0.2 F0.25;",
    explanation: "Usinagem paralela ao contorno final da peça, repetindo o contorno deslocado.",
    practicalUse: "Altamente eficiente para usinar peças pré-moldadas, forjadas ou fundidas que já possuem formato aproximado ao contorno acabado.",
    details: "• U (1ª linha): Distância total de remoção no eixo X (raio).\n• W (1ª linha): Distância total de remoção no eixo Z.\n• R (1ª linha): Número total de passes de divisão da cópia."
  },
  {
    id: "g70",
    category: "Ciclos de Torneamento",
    title: "Ciclo de Acabamento Final",
    code: "G70",
    syntax: "G70 P10 Q20 F0.12;",
    explanation: "Executa a usinagem final contornando o perfil de acabamento em apenas uma passada.",
    practicalUse: "Remove o sobremetal (U/W) deixado pelos ciclos G71/G72/G73 aplicando parâmetros ideais de acabamento fino.",
    details: "• P/Q: Definem o intervalo de blocos de perfil que foi declarado anteriormente.\n• Limpa automaticamente todos os sobremetais de forma contínua."
  },
  {
    id: "g75",
    category: "Ciclos de Canais",
    title: "Ciclo de Canais e Faceamento (Quebra-Cavaco)",
    code: "G75",
    syntax: "G75 R0.5;\nG75 X20.0 Z-30.0 P1500 Q2000 F0.08;",
    explanation: "Abre canais ou canais axiais de forma intermitente (pica-pau) para quebrar cavacos e aliviar a ferramenta.",
    practicalUse: "Previne o superaquecimento do bedame e acúmulo de cavacos embolados no torno, garantindo ranhuras perfeitamente concêntricas.",
    details: "• R (1ª linha): Recuo radial rápido de alívio.\n• X: Diâmetro final do fundo do canal.\n• Z: Posição final lateral de canais largos.\n• P: Incremento radial de corte em microns (ex: P1500 = 1.5mm).\n• Q: Deslocamento lateral entre canais em microns.\n• F: Avanço de corte radial."
  },
  {
    id: "g74",
    category: "Ciclos de Furação",
    title: "Ciclo de Furação Axial Progressiva",
    code: "G74",
    syntax: "G74 R1.0;\nG74 Z-50.0 Q5000 F0.12;",
    explanation: "Executa furações na linha de centro com penetração profunda e alívios constantes.",
    practicalUse: "Evita o travamento de brocas dentro de furos profundos através do recuo de quebra de cavaco automático.",
    details: "• R (1ª linha): Recuo rápido para quebra de cavaco.\n• Z: Profundidade final do furo.\n• Q: Profundidade incremental por picada em microns (ex: Q5000 = 5.0mm).\n• F: Avanço de penetração axial."
  },
  {
    id: "g76",
    category: "Ciclos de Rosca",
    title: "Ciclo de Roscamento Automático",
    code: "G76",
    syntax: "G76 P021060 Q100 R0.05;\nG76 X18.4 Z-25.0 P920 Q250 F1.5;",
    explanation: "Abre roscas retas ou cônicas de forma automática com penetrações progressivas e acabamentos.",
    practicalUse: "Cria roscas industriais métricas ou em polegada com total precisão de flanco, ângulo e profundidade.",
    details: "• P (1ª linha): Define repetições de acabamento (ex: 02), saída angular (ex: 10) e ângulo do filete (60 para rosca métrica).\n• Q (1ª linha): Passe radial de corte mínimo em microns.\n• R (1ª linha): Profundidade final da passada de acabamento.\n• X: Diâmetro final do fundo do filete.\n• Z: Comprimento final da rosca.\n• P (2ª linha): Altura radial total do filete em microns (h = 0.65 * passo).\n• Q (2ª linha): Profundidade da primeira penetração de corte em microns.\n• F: Passo da rosca em mm."
  },
  {
    id: "m03-m04",
    category: "Funções Auxiliares",
    title: "Sentido de Rotação da Árvore",
    code: "M03 / M04",
    syntax: "M03 S1500;\nM04 S1500;\nM05;",
    explanation: "Controla a ativação e direção de rotação da placa principal do torno.",
    practicalUse: "Configura a rotação correta baseada no tipo de ferramenta de corte (direita ou esquerda) e na fixação do inserto.",
    details: "• M03: Rotação no sentido horário para ferramentas normais à direita.\n• M04: Rotação anti-horária.\n• M05: Desliga completamente a árvore principal."
  },
  {
    id: "m08-m09",
    category: "Funções Auxiliares",
    title: "Comando de Fluido de Refrigeração",
    code: "M08 / M09",
    syntax: "M08;\nM09;",
    explanation: "Controla a bomba de fluido refrigerante sobre a zona de corte.",
    practicalUse: "Lubrifica a interface ferramenta-peça para reduzir o desgaste térmico e ajudar no escoamento dos cavacos de dentro do corte.",
    details: "• M08: Ativa o esguicho de óleo solúvel ou emulsão sintética.\n• M09: Encerra o fluxo de refrigeração."
  },
  {
    id: "m30",
    category: "Funções Auxiliares",
    title: "Fim de Programa e Retorno",
    code: "M30",
    syntax: "M30;",
    explanation: "Finaliza o ciclo ativo de usinagem e limpa as variáveis temporárias de corte.",
    practicalUse: "Para todos os motores auxiliares (árvore, refrigeração), reseta os ponteiros do controle e move a leitura para o primeiro bloco, deixando a máquina pronta para a próxima peça.",
    details: "• Deve obrigatoriamente ser a última instrução gravada no código.\n• Desliga todos os periféricos de forma segura."
  }
];

export const MachiningAssistant: React.FC<MachiningAssistantProps> = ({
  onClose,
  onInsertCode,
  onUpdateCode,
  activeGCode = "",
  isHighContrast,
  diagnosticError,
  onOpenCalculator,
}) => {
  const [tables, setTables] = useState<TableData[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>(" ");
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<GCodeDiagnosticError | null>(null);

  // Advanced CNC G-code diagnostics
  const getGCodeDiagnostics = (): GCodeDiagnosticError[] => {
    const lines = activeGCode.split("\n");
    const diagnostics: GCodeDiagnosticError[] = [];
    let lastG71_Line1Index: number | null = null;
    let lastG76_Line1Index: number | null = null;
    let lastG75_Line1Index: number | null = null;
    let lastG74_Line1Index: number | null = null;

    lines.forEach((lineText, idx) => {
      const clean = lineText.replace(/\(.*?\)/g, "").trim();
      if (!clean) return;

      // G71 Checks
      if (clean.includes("G71")) {
        const hasU = /U\s*(-?\d*\.?\d+)/i.test(clean);
        const hasR = /R\s*(-?\d*\.?\d+)/i.test(clean);
        const hasP = /P\s*(\d+)/i.test(clean);
        const hasQ = /Q\s*(\d+)/i.test(clean);

        if (hasU && hasR && !hasP && !hasQ) {
          lastG71_Line1Index = idx;
        } else if (hasP && hasQ) {
          if (lastG71_Line1Index === null) {
            diagnostics.push({
              code: "ERR_G71_BLOCK1_MISSING",
              lineIndex: idx,
              lineText: lineText,
              title: "G71: Primeira linha do ciclo ausente",
              description: "O ciclo G71 requer uma linha anterior contendo a profundidade de corte (U) e recuo (R).",
              explanation: "No controle Fanuc/ISO, o ciclo G71 é definido em duas linhas. A primeira linha configura a profundidade por passada (U) e o valor de recuo após cada passada (R). Sem ela, a máquina não sabe quanto material remover em cada etapa.",
              suggestedFix: `Inserir 'G71 U2.0 R1.0;' antes da linha ${idx + 1}.`,
              applyFix: (code) => {
                const codeLines = code.split("\n");
                codeLines.splice(idx, 0, "G71 U2.0 R1.0;");
                return codeLines.join("\n");
              }
            });
          }

          const pMatch = clean.match(/P\s*(\d+)/i);
          const qMatch = clean.match(/Q\s*(\d+)/i);
          if (pMatch && qMatch) {
            const pNum = pMatch[1];
            const qNum = qMatch[1];
            const hasNStart = lines.some(l => new RegExp(`^\\s*N${pNum}\\b`, "i").test(l));
            const hasNEnd = lines.some(l => new RegExp(`^\\s*N${qNum}\\b`, "i").test(l));

            if (!hasNStart || !hasNEnd) {
              diagnostics.push({
                code: "ERR_G71_CONTOUR_N_MISSING",
                lineIndex: idx,
                lineText: lineText,
                title: `G71: Blocos N${pNum} ou N${qNum} não encontrados`,
                description: `Os blocos de início (N${pNum}) ou fim (N${qNum}) definidos em P e Q não existem no programa.`,
                explanation: `Os parâmetros P e Q do ciclo G71 indicam respectivamente os números de bloco onde o perfil de acabamento começa e termina. A máquina lerá as coordenadas compreendidas entre esses blocos para realizar os passes de desbaste. Certifique-se de que as linhas correspondentes possuam a identificação N correspondente.`,
                suggestedFix: `Inserir identificadores N${pNum} e N${qNum} no início e fim do perfil de acabamento.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  let insertedN1 = false;
                  let insertedN2 = false;
                  for (let k = idx + 1; k < codeLines.length; k++) {
                    const cl = codeLines[k].trim();
                    if (cl && !cl.startsWith("(") && !insertedN1) {
                      codeLines[k] = `N${pNum} ` + codeLines[k];
                      insertedN1 = true;
                      continue;
                    }
                    if (cl && (cl.includes("G00") || cl.includes("G28") || cl.includes("M09") || cl.includes("M30") || cl.includes("M05")) && insertedN1 && !insertedN2) {
                      codeLines[k - 1] = `N${qNum} ` + codeLines[k - 1];
                      insertedN2 = true;
                      break;
                    }
                  }
                  return codeLines.join("\n");
                }
              });
            }
          }
        }
      }

      // G75 Checks
      if (clean.includes("G75")) {
        const hasR = /R\s*(-?\d*\.?\d+)/i.test(clean);
        const hasX = /X\s*(-?\d*\.?\d+)/i.test(clean);
        const hasZ = /Z\s*(-?\d*\.?\d+)/i.test(clean);
        const hasP = /P\s*(\d+)/i.test(clean);
        const hasQ = /Q\s*(\d+)/i.test(clean);

        if (hasR && !hasX && !hasZ) {
          lastG75_Line1Index = idx;
        } else if (hasX || hasZ) {
          if (lastG75_Line1Index === null) {
            diagnostics.push({
              code: "ERR_G75_BLOCK1_MISSING",
              lineIndex: idx,
              lineText: lineText,
              title: "G75: Primeira linha de retração ausente",
              description: "O ciclo de canais G75 requer uma linha anterior contendo o recuo da ferramenta (G75 R...).",
              explanation: "O ciclo Fanuc de duas linhas G75 necessita que a primeira linha defina o valor do recuo incremental (R) para alívio de cavacos a cada picada. Sem isso, a ferramenta pode quebrar por acúmulo de cavaco no canal.",
              suggestedFix: `Inserir 'G75 R0.5;' antes da linha ${idx + 1}.`,
              applyFix: (code) => {
                const codeLines = code.split("\n");
                codeLines.splice(idx, 0, "G75 R0.5;");
                return codeLines.join("\n");
              }
            });
          }

          const pMatch = clean.match(/P\s*(\d*\.?\d+)/i);
          if (pMatch) {
            const pValue = parseFloat(pMatch[1]);
            if (pValue < 10 && pValue > 0) {
              diagnostics.push({
                code: "ERR_G75_PECK_NOT_MICRONS",
                lineIndex: idx,
                lineText: lineText,
                title: "G75: Incremento P deve ser em mícrons",
                description: `Valor P${pValue} detectado. No ciclo G75, P deve ser especificado em mícrons. P${pValue} equivale a apenas ${pValue/1000}mm.`,
                explanation: `No CNC Fanuc, o incremento de profundidade de corte 'P' deve ser informado como um número inteiro sem ponto decimal representando mícrons. Por exemplo, para avançar 1.5mm por picada, use P1500 em vez de P1.5. Valores muito baixos provocam loops infinitos e travam a simulação.`,
                suggestedFix: `Substituir 'P${pMatch[1]}' por 'P${Math.round(pValue * 1000)}'.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  codeLines[idx] = codeLines[idx].replace(/P\s*[\d.]+/i, `P${Math.round(pValue * 1000)}`);
                  return codeLines.join("\n");
                }
              });
            }
          } else if (!hasP) {
            diagnostics.push({
              code: "ERR_G75_PECK_MISSING",
              lineIndex: idx,
              lineText: lineText,
              title: "G75: Incremento radial P ausente",
              description: "Falta o parâmetro P (incremento de profundidade por picada em mícrons).",
              explanation: "Sem o parâmetro P, o controle não sabe qual profundidade de avanço radial aplicar antes de recuar para quebrar o cavaco. Isso causa erro de sintaxe no comando.",
              suggestedFix: "Adicionar P1500 (1.5mm por picada) à linha G75.",
              applyFix: (code) => {
                const codeLines = code.split("\n");
                codeLines[idx] = codeLines[idx].replace(/G75/i, "G75").replace(";", " P1500;");
                return codeLines.join("\n");
              }
            });
          }
        }
      }

      // G74 Checks
      if (clean.includes("G74")) {
        const hasR = /R\s*(-?\d*\.?\d+)/i.test(clean);
        const hasX = /X\s*(-?\d*\.?\d+)/i.test(clean);
        const hasZ = /Z\s*(-?\d*\.?\d+)/i.test(clean);
        const hasP = /P\s*(\d+)/i.test(clean);
        const hasQ = /Q\s*(\d+)/i.test(clean);

        if (hasR && !hasX && !hasZ) {
          lastG74_Line1Index = idx;
        } else if (hasX || hasZ) {
          if (lastG74_Line1Index === null && !hasR) {
            diagnostics.push({
              code: "ERR_G74_RETRACT_MISSING",
              lineIndex: idx,
              lineText: lineText,
              title: "G74: Retração (R) não encontrada",
              description: "O ciclo G74 requer o valor de retração R para quebra de cavaco, seja na mesma linha ou em linha prévia.",
              explanation: "O ciclo de furação / canal frontal G74 precisa do parâmetro R para afastar a ferramenta após cada penetração, aliviando o cavaco. Sem ele, o ciclo pode causar danos na peça ou quebra da ferramenta.",
              suggestedFix: `Adicionar R1.0 ao comando G74.`,
              applyFix: (code) => {
                const codeLines = code.split("\n");
                codeLines[idx] = codeLines[idx].replace(/G74/i, "G74").replace(";", " R1.0;");
                return codeLines.join("\n");
              }
            });
          }

          const qMatch = clean.match(/Q\s*(\d*\.?\d+)/i);
          if (qMatch) {
            const qValue = parseFloat(qMatch[1]);
            if (qValue < 10 && qValue > 0) {
              diagnostics.push({
                code: "ERR_G74_PECK_NOT_MICRONS",
                lineIndex: idx,
                lineText: lineText,
                title: "G74: Incremento Q deve ser em mícrons",
                description: `Valor Q${qValue} detectado. No ciclo G74, Q deve ser em mícrons. Q${qValue} equivale a apenas ${qValue/1000}mm.`,
                explanation: `No CNC Fanuc, o incremento de profundidade de corte 'Q' no ciclo G74 deve ser informado como um número inteiro sem ponto decimal representando mícrons. Por exemplo, para avançar 5mm por picada, use Q5000 em vez de Q5.0.`,
                suggestedFix: `Substituir 'Q${qMatch[1]}' por 'Q${Math.round(qValue * 1000)}'.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  codeLines[idx] = codeLines[idx].replace(/Q\s*[\d.]+/i, `Q${Math.round(qValue * 1000)}`);
                  return codeLines.join("\n");
                }
              });
            }
          }

          const pMatch = clean.match(/P\s*(\d*\.?\d+)/i);
          if (pMatch) {
            const pValue = parseFloat(pMatch[1]);
            if (pValue < 10 && pValue > 0) {
              diagnostics.push({
                code: "ERR_G74_STEP_NOT_MICRONS",
                lineIndex: idx,
                lineText: lineText,
                title: "G74: Deslocamento lateral P deve ser em mícrons",
                description: `Valor P${pValue} detectado. No ciclo G74, o passo lateral P deve ser em mícrons. P${pValue} equivale a apenas ${pValue/1000}mm.`,
                explanation: `No ciclo G74, o deslocamento radial 'P' deve ser em mícrons e sem ponto decimal. Para deslocar 1.5mm, use P1500 em vez de P1.5.`,
                suggestedFix: `Substituir 'P${pMatch[1]}' por 'P${Math.round(pValue * 1000)}'.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  codeLines[idx] = codeLines[idx].replace(/P\s*[\d.]+/i, `P${Math.round(pValue * 1000)}`);
                  return codeLines.join("\n");
                }
              });
            }
          }
        }
      }

      // G76 Checks
      if (clean.includes("G76")) {
        const hasP_6digits = /P\s*(\d{6})/i.test(clean);
        const hasX = /X\s*(-?\d*\.?\d+)/i.test(clean);
        const hasZ = /Z\s*(-?\d*\.?\d+)/i.test(clean);
        const hasQ = /Q\s*(\d+)/i.test(clean);

        if (hasP_6digits && !hasX && !hasZ) {
          lastG76_Line1Index = idx;
        } else if (hasX || hasZ) {
          if (lastG76_Line1Index === null) {
            diagnostics.push({
              code: "ERR_G76_BLOCK1_MISSING",
              lineIndex: idx,
              lineText: lineText,
              title: "G76: Primeira linha de parâmetro ausente",
              description: "O ciclo de rosca G76 requer o bloco de configuração inicial (G76 P011060 Q100 R0.05).",
              explanation: "No controle Fanuc/ISO de duas linhas, a primeira linha G76 define o número de repetições de acabamento, a saída angular (chanfro) da rosca, o ângulo do filete (geralmente 60 para rosca métrica), o passe de profundidade mínima (Q) e a sobrecarga de acabamento (R).",
              suggestedFix: `Inserir 'G76 P011060 Q100 R0.05;' antes da linha ${idx + 1}.`,
              applyFix: (code) => {
                const codeLines = code.split("\n");
                codeLines.splice(idx, 0, "G76 P011060 Q100 R0.05;");
                return codeLines.join("\n");
              }
            });
          }

          const pMatch = clean.match(/P\s*(\d*\.?\d+)/i);
          if (pMatch) {
            const pValue = parseFloat(pMatch[1]);
            if (pValue < 10 && pValue > 0) {
              diagnostics.push({
                code: "ERR_G76_HEIGHT_NOT_MICRONS",
                lineIndex: idx,
                lineText: lineText,
                title: "G76: Altura do filete P deve ser em mícrons",
                description: `Valor P${pValue} detectado. No ciclo G76, a altura do filete P deve ser em mícrons. P${pValue} equivale a apenas ${pValue/1000}mm de altura.`,
                explanation: `No CNC, o parâmetro 'P' da segunda linha do ciclo G76 é a altura radial total do filete da rosca em mícrons (sem ponto decimal). Para uma rosca métrica comum com altura de 0.975mm, use P975 em vez de P0.975.`,
                suggestedFix: `Substituir 'P${pMatch[1]}' por 'P${Math.round(pValue * 1000)}'.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  codeLines[idx] = codeLines[idx].replace(/P\s*[\d.]+/i, `P${Math.round(pValue * 1000)}`);
                  return codeLines.join("\n");
                }
              });
            }
          }

          const qMatch = clean.match(/Q\s*(\d*\.?\d+)/i);
          if (qMatch) {
            const qValue = parseFloat(qMatch[1]);
            if (qValue < 10 && qValue > 0) {
              diagnostics.push({
                code: "ERR_G76_FIRSTPASS_NOT_MICRONS",
                lineIndex: idx,
                lineText: lineText,
                title: "G76: Primeira passada Q deve ser em mícrons",
                description: `Valor Q${qValue} detectado. No ciclo G76, a profundidade da primeira passada Q deve ser em mícrons.`,
                explanation: `O parâmetro 'Q' define a profundidade de corte na primeira passada da rosca em mícrons (milésimos de milímetro, sem ponto). Por exemplo, use Q250 para uma profundidade de corte inicial de 0.25mm por raio.`,
                suggestedFix: `Substituir 'Q${qMatch[1]}' por 'Q${Math.round(qValue * 1000)}'.`,
                applyFix: (code) => {
                  const codeLines = code.split("\n");
                  codeLines[idx] = codeLines[idx].replace(/Q\s*[\d.]+/i, `Q${Math.round(qValue * 1000)}`);
                  return codeLines.join("\n");
                }
              });
            }
          }
        }
      }
    });

    return diagnostics;
  };

  const activeDiagnostics = getGCodeDiagnostics();

  // Library & Chat States
  const [activeMode, setActiveMode] = useState<"tables" | "library" | "senai-book">("senai-book");
  const [bookSearchQuery, setBookSearchQuery] = useState<string>("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("head");
  const [manuals, setManuals] = useState<ManualFile[]>(PRELOADED_MANUALS);
  const [selectedManualId, setSelectedManualId] = useState<string>("m1");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: "ia",
      text: "Olá! Sou o **Torno Master IA**. \n\nSelecione um dos manuais técnicos ao lado como referência. Posso responder qualquer dúvida técnica, decodificar ciclos (como G71, G75, G76), ajudar a corrigir erros nos seus programas e ensinar as sintaxes corretas baseadas nos manuais e PDFs de engenharia!\n\n*Como posso ajudar você hoje?*",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Calculator states
  const [calcType, setCalcType] = useState<"rpm" | "feed" | "thread">("rpm");
  const [calcVc, setCalcVc] = useState<string>("180");
  const [calcDia, setCalcDia] = useState<string>("50");
  const [calcRpm, setCalcRpm] = useState<string>("1145");
  const [calcFeed, setCalcFeed] = useState<string>("0.2");
  const [calcPitch, setCalcPitch] = useState<string>("1.5");
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // RPM calculator Mode: 'calc_rpm' (Vc -> RPM) or 'calc_vc' (RPM -> Vc)
  const [rpmMode, setRpmMode] = useState<"calc_rpm" | "calc_vc">("calc_rpm");

  // Advanced G76 Thread Calculator states
  const [threadDirection, setThreadDirection] = useState<"externa" | "interna">("externa");
  const [threadTaper, setThreadTaper] = useState<"paralela" | "conica">("paralela");
  const [threadStarts, setThreadStarts] = useState<number>(1);
  const [threadProfile, setThreadProfile] = useState<"metrica" | "whitworth" | "npt">("metrica");
  const [threadPasses, setThreadPasses] = useState<number>(10);
  const [zStart, setZStart] = useState<string>("5.0");
  const [zEnd, setZEnd] = useState<string>("-30.0");
  const [g76_m, setG76_M] = useState<string>("01");
  const [g76_s, setG76_S] = useState<string>("10");
  const [g76_a, setG76_A] = useState<string>("60");
  const [g76_q_min, setG76_QMin] = useState<string>("100");
  const [g76_r_fin, setG76_RFin] = useState<string>("0.05");

  // Outputs
  const [outputRpm, setOutputRpm] = useState<number>(0);
  const [outputVc, setOutputVc] = useState<number>(180);
  const [outputVf, setOutputVf] = useState<number>(0);
  const [outputThreadHeight, setOutputThreadHeight] = useState<number>(0);
  const [outputThreadRoot, setOutputThreadRoot] = useState<number>(0);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Fetch tables on mount
  useEffect(() => {
    setSearchQuery("");
    fetch("/api/tables")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setTables(data);
        setLoading(false);
      })
      .catch(() => {
        // Fallback static data if backend offline
        setTables(STATIC_FALLBACK_TABLES);
        setLoading(false);
      });
  }, []);

  // Compute RPM
  useEffect(() => {
    const vc = parseFloat(calcVc) || 0;
    const dia = parseFloat(calcDia) || 0;
    if (vc > 0 && dia > 0) {
      const rpm = Math.round((vc * 1000) / (Math.PI * dia));
      setOutputRpm(rpm);
    } else {
      setOutputRpm(0);
    }
  }, [calcVc, calcDia]);

  // Compute Feed Speed
  useEffect(() => {
    const f = parseFloat(calcFeed) || 0;
    const rpm = parseFloat(calcRpm) || 0;
    if (f > 0 && rpm > 0) {
      setOutputVf(Math.round(f * rpm));
    } else {
      setOutputVf(0);
    }
  }, [calcFeed, calcRpm]);

  // Compute Thread Depth
  useEffect(() => {
    const p = parseFloat(calcPitch) || 0;
    const dia = parseFloat(calcDia) || 0;
    if (p > 0) {
      let multiplier = 0.65;
      if (threadProfile === "whitworth") {
        multiplier = 0.6403;
      } else if (threadProfile === "npt") {
        multiplier = 0.866;
      }
      const height = Math.round(multiplier * p * 1000); // in microns
      setOutputThreadHeight(height);
      if (dia > 0) {
        let minorDia = dia;
        if (threadDirection === "externa") {
          minorDia = dia - 2 * (height / 1000);
        } else {
          minorDia = dia - 1.0825 * p; // standard minor diameter for internal threads
        }
        setOutputThreadRoot(parseFloat(minorDia.toFixed(3)));
      }
    } else {
      setOutputThreadHeight(0);
      setOutputThreadRoot(0);
    }
  }, [calcPitch, calcDia, threadProfile, threadDirection]);

  // Compute VC from RPM
  useEffect(() => {
    const rpm = parseFloat(calcRpm) || 0;
    const dia = parseFloat(calcDia) || 0;
    if (rpm > 0 && dia > 0) {
      const vc = Math.round((Math.PI * dia * rpm) / 1000);
      setOutputVc(vc);
    } else {
      setOutputVc(0);
    }
  }, [calcRpm, calcDia]);

  const generateG76GCode = () => {
    const pitch = parseFloat(calcPitch) || 0;
    const dia = parseFloat(calcDia) || 0;
    const z_start = parseFloat(zStart) || 0;
    const z_end = parseFloat(zEnd) || 0;
    
    if (pitch <= 0 || dia <= 0) return "; Insira dados válidos de Passo e Diâmetro";

    // 1. Determine profile multiplier & thread angle
    let multiplier = 0.65;
    let angle = "60";
    if (threadProfile === "whitworth") {
      multiplier = 0.6403;
      angle = "55";
    } else if (threadProfile === "npt") {
      multiplier = 0.866;
      angle = "60";
    } else {
      // Metric
      multiplier = 0.65;
      angle = g76_a;
    }

    // 2. Thread height (radius) in mm and microns
    const h_mm = multiplier * pitch;
    const h_microns = Math.round(h_mm * 1000);

    // 3. Final X diameter
    let finalX = dia;
    if (threadDirection === "externa") {
      finalX = dia - 2 * h_mm;
    } else {
      finalX = dia;
    }
    const finalXStr = finalX.toFixed(2);

    // 4. First pass depth
    const q_first = Math.round(h_microns / Math.sqrt(threadPasses));

    // 5. Conicity
    const taperAngle = threadProfile === "npt" ? 1.7833 : 1.7833; // standard 1:16 conicity is 1.7833 deg
    const isConic = threadTaper === "conica" || threadProfile === "npt";

    // 6. Assemble lines
    let gcodeLines: string[] = [];
    gcodeLines.push(`; ROSCA G76: M${dia}x${pitch} (${threadProfile === "npt" ? "NPT Cônica" : threadProfile === "whitworth" ? "Whitworth" : "Métrica"})`);
    gcodeLines.push(`; Tipo: ${threadDirection === "externa" ? "Externa" : "Interna"} | Entradas: ${threadStarts} | Passadas: ${threadPasses}`);
    
    // Safety approach diameter
    const approachDia = threadDirection === "externa" 
      ? Math.round(dia + 4) 
      : Math.round(dia - pitch - 4);

    for (let i = 0; i < threadStarts; i++) {
      const currentZStart = z_start + i * pitch;
      const zTravel = Math.abs(currentZStart - z_end);
      
      let taperRStr = "";
      if (isConic) {
        const angleInRad = (taperAngle * Math.PI) / 180;
        const rVal = Math.tan(angleInRad) * zTravel;
        const rSigned = threadDirection === "externa" ? -rVal : rVal;
        taperRStr = ` R${rSigned.toFixed(3)}`;
      }

      const lead = pitch * threadStarts;

      gcodeLines.push(`; --- Entrada ${i + 1} de ${threadStarts} ---`);
      gcodeLines.push(`G00 X${approachDia.toFixed(2)} Z${currentZStart.toFixed(2)};`);
      gcodeLines.push(`G76 P${g76_m}${g76_s}${angle} Q${g76_q_min} R${g76_r_fin};`);
      gcodeLines.push(`G76 X${finalXStr} Z${z_end.toFixed(2)}${taperRStr} P${h_microns} Q${q_first} F${lead.toFixed(3)};`);
    }

    return gcodeLines.join("\n");
  };

  const handleInsertCalculated = (code: string) => {
    onInsertCode(code);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleUploadManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const extension = file.name.split(".").pop()?.toLowerCase();
    const type = ["pdf", "ppt", "pptx", "doc", "docx", "txt"].includes(extension || "")
      ? (extension?.startsWith("ppt") ? "ppt" : (extension?.startsWith("doc") ? "docx" : (extension === "pdf" ? "pdf" : "txt"))) as any
      : "pdf";

    const newManual: ManualFile = {
      id: "uploaded-" + Date.now(),
      name: file.name,
      type: type,
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      source: "Upload Manual",
      summary: `Manual técnico carregado pelo usuário: ${file.name}. Contém informações de usinagem, parâmetros, códigos G e ciclos específicos.`
    };

    setManuals(prev => [...prev, newManual]);
    setSelectedManualId(newManual.id);
  };

  const handleSendChatMessage = (textToSend?: string) => {
    const promptText = textToSend || userPrompt;
    if (!promptText.trim()) return;

    if (!textToSend) {
      setUserPrompt("");
    }

    // Add user message
    const newMsg: ChatMessage = {
      sender: "user",
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMsg]);
    setChatLoading(true);

    const activeManual = manuals.find(m => m.id === selectedManualId);
    const documentContext = activeManual ? `${activeManual.name} (Resumo Técnico: ${activeManual.summary})` : "";

    fetch("/api/gemini/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: promptText,
        documentContext: documentContext,
        activeGCode: activeGCode || ""
      })
    })
      .then(res => res.json())
      .then(data => {
        setChatLoading(false);
        if (data.sucesso) {
          setChatMessages(prev => [...prev, {
            sender: "ia",
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        } else {
          setChatMessages(prev => [...prev, {
            sender: "ia",
            text: `⚠️ Erro na resposta: ${data.msg || "Erro desconhecido."}\n\n*Dica: Certifique-se de configurar a chave GEMINI_API_KEY no painel de Secrets.*`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        }
      })
      .catch(() => {
        setChatLoading(false);
        setChatMessages(prev => [...prev, {
          sender: "ia",
          text: `⚠️ Erro de rede ou servidor ao conectar com o serviço de IA. Use o token de demonstração correto ou verifique o log do servidor.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      });
  };

  const activeTable = tables[activeTab];

  return (
    <>
      <div className={`w-full h-full flex flex-col overflow-hidden ${isHighContrast ? 'bg-white text-black' : 'bg-[#1e1e24] text-zinc-100'}`}>
        
        {/* Advanced CNC G-code Diagnostics */}
        {activeDiagnostics.length > 0 ? (
          <div className={`p-4 border-b flex flex-col gap-3 overflow-y-auto max-h-[220px] shrink-0 ${isHighContrast ? 'bg-red-50 border-red-500 text-red-900' : 'bg-red-950/20 border-red-900/40 text-red-200'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <span>Diagnóstico de Sintaxe: {activeDiagnostics.length} erro(s) de ciclo detectado(s)</span>
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Analítico G71 / G75 / G76</span>
                </h3>
                <p className="text-xs text-zinc-450">Análise estrutural e de parâmetros conforme as diretrizes oficiais de programação Fanuc e SENAI.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeDiagnostics.map((err, dIdx) => (
                <div key={dIdx} className={`p-3 rounded-lg border flex flex-col justify-between ${isHighContrast ? 'bg-white border-red-400 text-black' : 'bg-[#18181c] border-zinc-800 text-zinc-100'}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                        {err.code}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Linha {err.lineIndex + 1}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs mb-1 text-red-400">{err.title}</h4>
                    <p className="text-[11px] text-zinc-400 font-mono bg-zinc-950/40 p-1.5 rounded border border-zinc-900 overflow-x-auto whitespace-nowrap mb-1.5">
                      {err.lineText}
                    </p>
                    <p className="text-xs leading-snug text-zinc-350 opacity-90">{err.description}</p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-2 border-t border-zinc-800/50">
                    <button
                      onClick={() => setSelectedDiagnostic(err)}
                      className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${isHighContrast ? 'bg-zinc-200 hover:bg-zinc-300 text-black' : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-200'}`}
                    >
                      Explicar Sintaxe
                    </button>
                    {onUpdateCode && (
                      <button
                        onClick={() => {
                          const updated = err.applyFix(activeGCode);
                          onUpdateCode(updated);
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition ${isHighContrast ? 'bg-black hover:bg-zinc-800 text-white' : 'bg-cyan-500 hover:bg-cyan-450 text-black'}`}
                      >
                        Auto-Fix
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          diagnosticError && (
            <div className="bg-red-900/50 border-b border-red-500/50 p-4 flex items-center justify-between text-red-200 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Erro de compilação: {diagnosticError}</span>
              </div>
              <p className="text-xs text-zinc-450">Continue editando o seu código para reativar o gráfico do simulador.</p>
            </div>
          )
        )}
        <div className={`px-6 py-4 border-b flex justify-between items-center ${isHighContrast ? 'bg-zinc-200 border-black' : 'bg-[#25252f] border-zinc-800'}`}>
          <div className="flex items-center gap-3">
            <Wrench className={`w-6 h-6 ${isHighContrast ? 'text-black' : 'text-cyan-400'}`} />
            <div>
              <h2 className={`font-display font-bold text-lg ${isHighContrast ? 'text-black' : 'text-zinc-100'}`}>
                Programador Virtual & Tabelas Técnicas
              </h2>
              <p className={`text-xs ${isHighContrast ? 'text-zinc-700' : 'text-zinc-400'}`}>
                Assistente de cálculo, manual de programação SENAI e tabelas de parâmetros técnicos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition text-xs font-semibold px-3 ${isHighContrast ? 'bg-zinc-300 text-black hover:bg-zinc-400' : 'text-zinc-400 hover:text-red-400 bg-zinc-800 hover:bg-zinc-800/80'}`}
          >
            Fechar Assistant
          </button>
        </div>

        {/* Content body split layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Left Sidebar Menu */}
          <div className="w-64 border-r border-zinc-800 bg-[#16161c] p-4 overflow-y-auto flex flex-col gap-4">
            
            {/* Manuais & Consultas */}
            <div>
              <h4 className="text-xs font-bold text-cyan-400 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Manuais & Consultas
              </h4>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setActiveMode("senai-book");
                    setBookSearchQuery("");
                    setSelectedTopicId("head");
                  }}
                  className={`w-full text-left text-xs p-2.5 rounded-lg border transition font-bold flex items-center gap-2 ${
                    activeMode === "senai-book"
                      ? "bg-[#00f3ff]/10 text-[#00f3ff] border-[#00f3ff]/40 shadow-sm font-black"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  📖 Livro de Consulta SENAI
                </button>
                <button
                  onClick={() => {
                    setActiveMode("library");
                  }}
                  className={`w-full text-left text-xs p-2.5 rounded-lg border transition font-bold flex items-center gap-2 ${
                    activeMode === "library"
                      ? "bg-purple-950/20 text-purple-400 border-purple-500/30 font-black"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  💬 Conversar com a IA
                </button>
              </div>
            </div>

            {/* References list */}
            <div>
              <h4 className="text-xs font-bold text-zinc-500 tracking-wider mb-2 uppercase">
                Tabelas Técnicas
              </h4>
              <div className="flex flex-col gap-1.5">
                {loading ? (
                  <div className="text-xs text-zinc-600 animate-pulse">Carregando tabelas...</div>
                ) : (
                  tables.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveMode("tables");
                        setActiveTab(idx);
                        setSearchQuery("");
                      }}
                      className={`text-left text-xs p-2.5 rounded-lg border transition font-medium overflow-hidden text-ellipsis whitespace-nowrap ${
                        activeMode === "tables" && activeTab === idx
                          ? "bg-cyan-950/20 text-cyan-400 border-cyan-400/40 font-bold"
                          : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📁 {t.nome}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Calculators Shortcuts */}
            <div>
              <h4 className="text-xs font-bold text-zinc-500 tracking-wider mb-2 uppercase">
                Calculadoras CNC
              </h4>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    if (onOpenCalculator) {
                      onOpenCalculator("rpm");
                    } else {
                      setActiveMode("tables");
                      setCalcType("rpm");
                    }
                  }}
                  className={`text-left text-xs p-2.5 rounded-lg border transition flex items-center gap-2 ${
                    activeMode === "tables" && calcType === "rpm"
                      ? "bg-emerald-950/20 text-emerald-400 border-emerald-400/40 font-bold"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Rotações (RPM / G96)
                </button>

                <button
                  onClick={() => {
                    if (onOpenCalculator) {
                      onOpenCalculator("feed");
                    } else {
                      setActiveMode("tables");
                      setCalcType("feed");
                    }
                  }}
                  className={`text-left text-xs p-2.5 rounded-lg border transition flex items-center gap-2 ${
                    activeMode === "tables" && calcType === "feed"
                      ? "bg-emerald-950/20 text-emerald-400 border-emerald-400/40 font-bold"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Avanço Linear (Vf)
                </button>

                <button
                  onClick={() => {
                    if (onOpenCalculator) {
                      onOpenCalculator("thread");
                    } else {
                      setActiveMode("tables");
                      setCalcType("thread");
                    }
                  }}
                  className={`text-left text-xs p-2.5 rounded-lg border transition flex items-center gap-2 ${
                    activeMode === "tables" && calcType === "thread"
                      ? "bg-emerald-950/20 text-emerald-400 border-emerald-400/40 font-bold"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Rosca G76 Calculada
                </button>

                <button
                  onClick={() => {
                    if (onOpenCalculator) {
                      onOpenCalculator("drilling");
                    }
                  }}
                  className="text-left text-xs p-2.5 rounded-lg border border-zinc-800 transition flex items-center gap-2 bg-[#1f1f26] text-zinc-400 hover:text-zinc-200"
                >
                  <Calculator className="w-3.5 h-3.5 text-[#00f3ff]" />
                  Ciclo de Furação G83
                </button>

                <button
                  onClick={() => {
                    if (onOpenCalculator) {
                      onOpenCalculator("polygon");
                    }
                  }}
                  className="text-left text-xs p-2.5 rounded-lg border border-zinc-800 transition flex items-center gap-2 bg-[#1f1f26] text-zinc-400 hover:text-zinc-200"
                >
                  <Hexagon className="w-3.5 h-3.5 text-[#00f3ff]" />
                  Calculadora Polígono (G12.1)
                </button>
              </div>
            </div>

          </div>

          {/* Right main panel split */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[#0d0d11]">
            {activeMode === "senai-book" ? (
              <div className="flex-1 flex flex-col overflow-hidden h-full">
                
                {/* Book Header */}
                <div className="mb-4 flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#00f3ff]" />
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                        Livro de Consulta Digital - SENAI CNC
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Digite termos com a lupa para pesquisar capítulos de torneamento ISO Fanuc.
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 bg-cyan-950/40 text-cyan-400 border border-cyan-800/20 rounded font-mono font-bold uppercase">
                    Norma SENAI / ISO / Fanuc
                  </span>
                </div>

                {/* Main panel split: Left list of chapters / Right detailed handbook page */}
                <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
                  
                  {/* Sub Left list (Scrollable) */}
                  <div className="w-[260px] shrink-0 flex flex-col gap-2.5 h-full border-r border-zinc-800/60 pr-4">
                    {/* Search Field with magnifying glass */}
                    <div className="relative shrink-0">
                      <Search className="absolute left-2.5 top-2.5 text-zinc-550 w-3.5 h-3.5" />
                      <input
                        type="text"
                        value={bookSearchQuery}
                        onChange={(e) => setBookSearchQuery(e.target.value)}
                        placeholder="Buscar com lupa..."
                        className="w-full bg-[#131317] border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-cyan-400 font-sans"
                      />
                    </div>

                    {/* Topics List */}
                    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                      {SENAI_MANUAL_TOPICS.filter((t) => {
                        const q = bookSearchQuery.toLowerCase();
                        return (
                          t.title.toLowerCase().includes(q) ||
                          t.code.toLowerCase().includes(q) ||
                          t.explanation.toLowerCase().includes(q) ||
                          t.category.toLowerCase().includes(q)
                        );
                      }).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTopicId(t.id)}
                          className={`text-left p-2 rounded-lg border transition text-xs flex items-start gap-2.5 ${
                            selectedTopicId === t.id
                              ? "bg-cyan-950/20 text-[#00f3ff] border-cyan-400/40"
                              : "bg-[#111116] border-zinc-850/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <span className="font-mono text-[9px] bg-zinc-900 px-1.5 py-0.5 rounded font-black text-cyan-400 shrink-0">
                            {t.code}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate text-zinc-200">{t.title}</div>
                            <div className="text-[9px] text-zinc-550 truncate uppercase font-semibold">{t.category}</div>
                          </div>
                        </button>
                      ))}
                      {SENAI_MANUAL_TOPICS.filter((t) => {
                        const q = bookSearchQuery.toLowerCase();
                        return (
                          t.title.toLowerCase().includes(q) ||
                          t.code.toLowerCase().includes(q) ||
                          t.explanation.toLowerCase().includes(q) ||
                          t.category.toLowerCase().includes(q)
                        );
                      }).length === 0 && (
                        <div className="text-zinc-600 text-center py-6 text-[11px] font-mono">
                          Nenhum tópico encontrado com esta palavra.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sub Right Detailed handbook page */}
                  <div className="flex-1 overflow-y-auto bg-[#131318] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between h-full min-h-0">
                    {(() => {
                      const topic = SENAI_MANUAL_TOPICS.find(t => t.id === selectedTopicId);
                      if (!topic) return <div className="text-zinc-500 text-center py-12 text-xs font-mono">Selecione um tópico para consultar</div>;

                      return (
                        <div className="flex flex-col gap-4 h-full">
                          
                          {/* Breadcrumb & Title */}
                          <div className="flex items-center justify-between pb-2 border-b border-zinc-900 shrink-0">
                            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">
                              Manual Prático • {topic.category}
                            </span>
                            <span className="text-[9px] font-mono font-black text-[#00f3ff] bg-cyan-950/30 px-2.5 py-0.5 rounded-md border border-cyan-400/20">
                              CÓDIGO {topic.code}
                            </span>
                          </div>

                          <div className="space-y-1 shrink-0">
                            <h3 className="text-base font-display font-black text-zinc-100 flex items-center gap-2">
                              📖 {topic.title}
                            </h3>
                            <p className="text-xs text-zinc-400 font-mono italic">
                              {topic.explanation}
                            </p>
                          </div>

                          {/* Syntax Section */}
                          <div className="bg-[#0b0b0e] border border-cyan-400/20 rounded-xl p-4 font-mono shrink-0">
                            <div className="text-[9px] text-cyan-400/60 uppercase font-black tracking-wider mb-2">
                              ESTRUTURA DE PROGRAMAÇÃO RECOMENDADA PELO SENAI:
                            </div>
                            <div className="text-xs text-[#00f3ff] font-black select-text whitespace-pre-wrap leading-relaxed">
                              {topic.syntax}
                            </div>
                          </div>

                          {/* Technical details Grid */}
                          <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-850/50 overflow-y-auto max-h-[140px]">
                            <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-2 font-mono">
                              Significado dos Parâmetros & Detalhes Técnicos:
                            </div>
                            <div className="text-xs text-zinc-350 leading-relaxed font-mono whitespace-pre-line">
                              {topic.details}
                            </div>
                          </div>

                          {/* Practical tips */}
                          <div className="bg-emerald-950/10 border-l-4 border-emerald-500 p-4 rounded-r-xl shrink-0">
                            <div className="text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-1 font-mono">
                              Anotações de Prática Mecânica (Oficina):
                            </div>
                            <p className="text-xs text-zinc-300 leading-relaxed">
                              {topic.practicalUse}
                            </p>
                          </div>

                          {/* Bottom Action Button */}
                          <div className="mt-auto pt-4 border-t border-zinc-900 flex justify-end shrink-0">
                            <button
                              onClick={() => {
                                handleInsertCalculated(topic.syntax);
                              }}
                              className="bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-black py-2 px-4 rounded-lg text-xs uppercase tracking-wider flex items-center gap-2 transition"
                            >
                              <span>⚡ Inserir Código de Exemplo</span>
                            </button>
                          </div>

                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>
            ) : activeMode === "tables" ? (
              <>
                {/* CNC Interactive calculators at top */}
                <div className="mb-6 p-4 bg-[#1b1b21] rounded-xl border border-zinc-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[11px] font-bold text-[#00f3ff] uppercase tracking-wider font-mono">
                      Calculadora Rápida {calcType === "rpm" ? "RPM / G96" : calcType === "feed" ? "Avanço Vf" : "Rosca G76"}
                    </span>
                    <button
                      onClick={() => {
                        if (onOpenCalculator) {
                          onOpenCalculator(calcType === "rpm" ? "rpm" : calcType === "feed" ? "feed" : "thread");
                        }
                      }}
                      className="px-3 py-1 bg-[#00f3ff]/20 hover:bg-[#00f3ff] text-[#00f3ff] hover:text-zinc-950 rounded text-[10px] font-mono transition uppercase font-extrabold flex items-center gap-1.5"
                    >
                      <span>🔍 Abrir em Tela Cheia (Com Ilustrações)</span>
                    </button>
                  </div>
                  {calcType === "rpm" && (
                    <div className="flex flex-col gap-3">
                      {/* Sub-toggle */}
                      <div className="flex gap-2 p-0.5 bg-[#14141a] rounded-lg border border-zinc-800 max-w-sm">
                        <button
                          onClick={() => setRpmMode("calc_rpm")}
                          className={`flex-1 py-1 px-3 text-[10px] font-bold rounded transition-colors ${
                            rpmMode === "calc_rpm"
                              ? "bg-[#00f3ff]/10 text-[#00f3ff] font-extrabold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Calcular RPM (A partir de Vc)
                        </button>
                        <button
                          onClick={() => setRpmMode("calc_vc")}
                          className={`flex-1 py-1 px-3 text-[10px] font-bold rounded transition-colors ${
                            rpmMode === "calc_vc"
                              ? "bg-[#00f3ff]/10 text-[#00f3ff] font-extrabold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Calcular Vc (A partir de RPM)
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center font-mono">
                        {rpmMode === "calc_rpm" ? (
                          <>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                                Vel. de Corte Vc (m/min)
                              </label>
                              <input
                                type="number"
                                value={calcVc}
                                onChange={(e) => setCalcVc(e.target.value)}
                                className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1 font-sans">
                                Diâmetro Ø da Peça (mm)
                              </label>
                              <input
                                type="number"
                                value={calcDia}
                                onChange={(e) => setCalcDia(e.target.value)}
                                className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                              />
                            </div>
                            <div className="bg-[#0f0f13] p-2 rounded border border-zinc-800/60 flex flex-col justify-center text-center">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase font-sans">Resultado RPM</span>
                              <span className="text-emerald-400 font-mono font-bold text-base">
                                {outputRpm} RPM
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 font-sans">
                              <button
                                onClick={() => handleInsertCalculated(`G96 S${calcVc} M03; (Ativar VCC a ${calcVc}m/min)`)}
                                className="text-left text-[10px] bg-[#222] hover:bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded transition flex items-center justify-between border border-zinc-800"
                              >
                                <span>Gerar VCC (G96)</span>
                                <ChevronRight className="w-3 h-3 text-[#39ff14]" />
                              </button>
                              <button
                                onClick={() => handleInsertCalculated(`G97 S${outputRpm} M03; (Ativar Rotação Fixa)`)}
                                className="text-left text-[10px] bg-[#222] hover:bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded transition flex items-center justify-between border border-zinc-800"
                              >
                                <span>Gerar RPM Fixo (G97)</span>
                                <ChevronRight className="w-3 h-3 text-[#39ff14]" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                                Rotações N (RPM)
                              </label>
                              <input
                                type="number"
                                value={calcRpm}
                                onChange={(e) => setCalcRpm(e.target.value)}
                                className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1 font-sans">
                                Diâmetro Ø da Peça (mm)
                              </label>
                              <input
                                type="number"
                                value={calcDia}
                                onChange={(e) => setCalcDia(e.target.value)}
                                className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                              />
                            </div>
                            <div className="bg-[#0f0f13] p-2 rounded border border-zinc-800/60 flex flex-col justify-center text-center">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase font-sans">Resultado Vc (Velocidade)</span>
                              <span className="text-emerald-400 font-mono font-bold text-base">
                                {outputVc} m/min
                              </span>
                            </div>
                            <div className="font-sans">
                              <button
                                onClick={() => handleInsertCalculated(`G96 S${outputVc} M03; (Ativar VCC com Vc de ${outputVc} m/min)`)}
                                className="w-full text-center text-xs bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-bold py-2.5 px-3 rounded-lg transition"
                              >
                                Inserir Vc G96 no G-Code
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {calcType === "feed" && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                          Avanço f (mm/rot)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={calcFeed}
                          onChange={(e) => setCalcFeed(e.target.value)}
                          className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                          Rotações N (RPM)
                        </label>
                        <input
                          type="number"
                          value={calcRpm}
                          onChange={(e) => setCalcRpm(e.target.value)}
                          className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div className="bg-[#0f0f13] p-2 rounded border border-zinc-800/60 flex flex-col justify-center text-center">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Avanço Linear (Vf)</span>
                        <span className="text-emerald-400 font-mono font-bold text-base">
                          {outputVf} mm/min
                        </span>
                      </div>
                      <div>
                        <button
                          onClick={() => handleInsertCalculated(`F${calcFeed}; (Avanço de ${calcFeed} mm/rot)`)}
                          className="w-full text-center text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg transition"
                        >
                          Inserir Avanço f no G-Code
                        </button>
                      </div>
                    </div>
                  )}

                  {calcType === "thread" && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                          Rosca Completa G76 (Métrica, Whitworth, NPT Cônica)
                        </span>
                        <span className="text-[10px] text-zinc-500 italic">
                          Calcula diâmetro final, profundidades de corte e conicitais
                        </span>
                      </div>

                      {/* Line 1: Toggles for Profile, Direction, Taper */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Perfil da Rosca
                          </label>
                          <select
                            value={threadProfile}
                            onChange={(e) => {
                              const prof = e.target.value as any;
                              setThreadProfile(prof);
                              if (prof === "npt") {
                                setThreadTaper("conica");
                              }
                            }}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          >
                            <option value="metrica">Métrica ISO (60°)</option>
                            <option value="whitworth">Whitworth (55°)</option>
                            <option value="npt">NPT Cônica (60° - 1:16)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Direção / Tipo
                          </label>
                          <select
                            value={threadDirection}
                            onChange={(e) => setThreadDirection(e.target.value as any)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          >
                            <option value="externa">Rosca Externa</option>
                            <option value="interna">Rosca Interna</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Tipo de Percurso
                          </label>
                          <select
                            value={threadTaper}
                            disabled={threadProfile === "npt"}
                            onChange={(e) => setThreadTaper(e.target.value as any)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
                          >
                            <option value="paralela">Cilíndrica / Paralela</option>
                            <option value="conica">Cônica (1:16 / 1.78°)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Nº de Entradas (Starts)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={threadStarts}
                            onChange={(e) => setThreadStarts(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2.5 py-1 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>
                      </div>

                      {/* Line 2: Nominal values & coordinates */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Passo P (mm)
                          </label>
                          <input
                            type="number"
                            step="0.05"
                            value={calcPitch}
                            onChange={(e) => setCalcPitch(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2.5 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Diâmetro Nominal Ø (mm)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={calcDia}
                            onChange={(e) => setCalcDia(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2.5 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Z Aproximação (Inicial)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={zStart}
                            onChange={(e) => setZStart(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2.5 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-1 font-mono">
                            Z Final da Rosca
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={zEnd}
                            onChange={(e) => setZEnd(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-100 px-2.5 py-1.5 rounded border border-zinc-800 text-xs outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>
                      </div>

                      {/* Line 3: Fine G76 properties */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#111116] p-3 rounded-lg border border-zinc-800">
                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1 font-mono">
                            Passes Mola (m)
                          </label>
                          <select
                            value={g76_m}
                            onChange={(e) => setG76_M(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                          >
                            <option value="01">01 Passe</option>
                            <option value="02">02 Passes</option>
                            <option value="03">03 Passes</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1 font-mono">
                            Saída Angular (s)
                          </label>
                          <select
                            value={g76_s}
                            onChange={(e) => setG76_S(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                          >
                            <option value="00">00 (Sem Saída)</option>
                            <option value="10">10 (1.0 x Passo)</option>
                            <option value="15">15 (1.5 x Passo)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1 font-mono">
                            Ângulo Filete (a)
                          </label>
                          <select
                            value={g76_a}
                            onChange={(e) => setG76_A(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-300 px-2 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                          >
                            <option value="60">60 Graus</option>
                            <option value="55">55 Graus</option>
                            <option value="30">30 Graus</option>
                            <option value="29">29 Graus</option>
                            <option value="00">00 Graus</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1 font-mono">
                            Nº Passadas (N)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={threadPasses}
                            onChange={(e) => setThreadPasses(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-[#0d0d11] text-zinc-300 px-2.5 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1 font-mono">
                            Passe Acab. R (mm)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={g76_r_fin}
                            onChange={(e) => setG76_RFin(e.target.value)}
                            className="w-full bg-[#0d0d11] text-zinc-300 px-2.5 py-1 rounded border border-zinc-850 text-xs font-mono outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>

                      {/* Line 4: Result summary & Insert button */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-8 grid grid-cols-3 gap-2">
                          <div className="bg-[#0f0f13] p-1.5 rounded border border-zinc-800 text-center flex flex-col justify-center">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase leading-tight font-sans">Altura h (Filete)</span>
                            <span className="text-emerald-400 font-mono font-black text-xs sm:text-sm">
                              {outputThreadHeight}μ
                            </span>
                          </div>

                          <div className="bg-[#0f0f13] p-1.5 rounded border border-zinc-800 text-center flex flex-col justify-center">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase leading-tight font-sans">
                              {threadDirection === "externa" ? "Diâmetro Fundo X" : "Diâmetro Furo X"}
                            </span>
                            <span className="text-[#00f3ff] font-mono font-black text-xs sm:text-sm">
                              Ø {outputThreadRoot}
                            </span>
                          </div>

                          <div className="bg-[#0f0f13] p-1.5 rounded border border-zinc-800 text-center flex flex-col justify-center">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase leading-tight font-sans">1ª Passada (Q)</span>
                            <span className="text-purple-400 font-mono font-black text-xs sm:text-sm">
                              Q{Math.round(outputThreadHeight / Math.sqrt(threadPasses))}μ
                            </span>
                          </div>
                        </div>

                        <div className="md:col-span-4">
                          <button
                            onClick={() => handleInsertCalculated(generateG76GCode())}
                            className="w-full text-center text-xs bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-extrabold py-2 px-3 rounded-lg transition uppercase tracking-wider"
                          >
                            Inserir Ciclo G76
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick-filter Search Box */}
                <div className="relative mb-4">
                  <span className="absolute left-3.5 top-2.5 text-zinc-500">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtre as linhas da tabela aberta (ex: M12, HSS, TNMG, Alumínio)..."
                    className="w-full bg-[#1b1b21] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Main database table rendering */}
                <div className="flex-1 overflow-auto border border-zinc-800 bg-[#070709] rounded-xl relative">
                  {activeTable ? (
                    <table className="w-full border-collapse font-mono text-xs text-left text-zinc-300">
                      <thead className="sticky top-0 bg-[#16161c] text-cyan-400 border-b border-zinc-800 z-10 font-sans">
                        <tr>
                          {activeTable.dados[0]?.map((header, hIdx) => (
                            <th key={hIdx} className="p-3 border border-zinc-800 font-bold tracking-wide">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeTable.dados.slice(1).map((row, rIdx) => {
                          const matchText = row.join(" ").toLowerCase();
                          if (searchQuery && !matchText.includes(searchQuery.toLowerCase())) {
                            return null;
                          }

                          return (
                            <tr
                              key={rIdx}
                              className="hover:bg-zinc-800/45 border-b border-zinc-800 transition"
                            >
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-2.5 border border-zinc-800">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                      Nenhuma tabela selecionada
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* PDF & PowerPoint Document Library View */
              <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden h-full">
                
                {/* Left Column: List of manuals and folder instructions */}
                <div className="w-full md:w-[280px] shrink-0 flex flex-col gap-3 h-full overflow-y-auto">
                  {/* Instructions on where to place actual files */}
                  <div className="bg-[#1e1e24]/70 p-3.5 rounded-xl border border-dashed border-zinc-700 text-[11px] text-zinc-400">
                    <h5 className="font-bold text-[#00f3ff] uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                      <span>📁 Onde Colocar Seus Arquivos?</span>
                    </h5>
                    <p className="leading-relaxed">
                      Para que seus manuais e apresentações em <strong className="text-white">PDF</strong> ou <strong className="text-white">PowerPoint (.pptx)</strong> fiquem salvos permanentemente na base de conhecimento, coloque os arquivos na pasta do projeto:
                    </p>
                    <div className="bg-[#0c0c0f] p-1.5 rounded font-mono text-[9px] text-emerald-400 my-1.5 border border-zinc-800 break-all select-all">
                      /public/manuais/
                    </div>
                    <p className="leading-relaxed">
                      Eles serão indexados de forma definitiva e lidos pelo assistente de Inteligência Artificial para conferência e validação de ciclos de torneamento.
                    </p>
                  </div>

                  {/* Manual selector */}
                  <div className="bg-[#131318] p-3 rounded-xl border border-zinc-800 flex flex-col gap-2 flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Biblioteca Ativa ({manuals.length})
                      </span>
                      <label className="text-[10px] font-semibold text-[#00f3ff] hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                        <UploadCloud className="w-3.5 h-3.5" />
                        Carregar Novo
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                          className="hidden"
                          onChange={handleUploadManual}
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[160px] md:max-h-none flex-1">
                      {manuals.map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedManualId(m.id)}
                          className={`text-left p-2.5 rounded-lg border text-[11px] transition flex flex-col gap-1 relative overflow-hidden group ${
                            selectedManualId === m.id
                              ? "bg-cyan-950/25 border-cyan-400/50 text-zinc-100"
                              : "bg-[#1e1e24] border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <FileText className={`w-3.5 h-3.5 shrink-0 ${selectedManualId === m.id ? "text-[#00f3ff]" : "text-zinc-500"}`} />
                            <span className="truncate pr-4">{m.name}</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono mt-0.5">
                            <span>{m.size}</span>
                            <span className="bg-zinc-800 px-1 rounded text-zinc-400">{m.source}</span>
                          </div>
                          {m.source !== "Pré-carregado" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setManuals(prev => prev.filter(x => x.id !== m.id));
                                if (selectedManualId === m.id) setSelectedManualId("m1");
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 rounded transition text-red-400 hover:text-red-300"
                              title="Remover documento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: AI Manual Copilot Console */}
                <div className="flex-1 flex flex-col bg-[#131318] border border-zinc-800 rounded-xl overflow-hidden h-full">
                  {/* Chat header */}
                  <div className="bg-[#1b1b21] px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-[#39ff14] animate-pulse" />
                      <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                        Assistente Técnico de Ciclos IA (Torno Master)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
                      Lendo: {manuals.find(m => m.id === selectedManualId)?.name}
                    </span>
                  </div>

                  {/* Messages log */}
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 font-mono text-xs min-h-0">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col max-w-[90%] rounded-xl p-3 leading-relaxed whitespace-pre-wrap ${
                          msg.sender === "user"
                            ? "bg-cyan-950/20 border border-cyan-800/40 text-zinc-100 self-end ml-12"
                            : "bg-zinc-900 border border-zinc-800 text-zinc-300 self-start mr-12"
                        }`}
                      >
                        <div className="text-[9px] text-zinc-500 font-bold mb-1 uppercase tracking-wider">
                          {msg.sender === "user" ? "👤 Operador CNC" : "🤖 Torno Master IA"} • {msg.timestamp}
                        </div>
                        <div className="text-[11px] leading-relaxed select-text">{msg.text}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 self-start mr-12 rounded-xl p-3 flex items-center gap-2 animate-pulse">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce delay-75" />
                        <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce delay-150" />
                        <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce delay-300" />
                        <span className="text-[10px]">Torno Master IA decodificando manuais...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Quick-select prompts */}
                  <div className="px-4 py-2 border-t border-zinc-900/60 flex flex-wrap gap-1.5 bg-[#0b0b0f] select-none">
                    {[
                      { label: "❓ Ciclo G76", text: "Como programar o ciclo de roscagem múltipla G76 com o manual selecionado?" },
                      { label: "❓ Erros G71", text: "Quais os erros mais comuns na furação interna com G71?" },
                      { label: "❓ Parâmetros AISI 1045", text: "Quais velocidades de corte recomendadas para desbaste de AISI 1045?" }
                    ].map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChatMessage(s.text)}
                        className="text-[10px] bg-zinc-800 hover:bg-zinc-700 border border-zinc-800 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded transition"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Input form */}
                  <div className="p-3 bg-[#17171e] border-t border-zinc-800 flex gap-2">
                    <textarea
                      value={userPrompt}
                      onChange={(e) => setUserPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChatMessage();
                        }
                      }}
                      placeholder="Digite sua dúvida de G-Code ou ciclos técnicos... Ex: Como usar o G75 pica-pau?"
                      className="flex-1 bg-[#0b0b0d] border border-zinc-800 focus:border-cyan-500 rounded-lg p-2 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none resize-none h-11"
                    />
                    <button
                      onClick={() => handleSendChatMessage()}
                      disabled={!userPrompt.trim() || chatLoading}
                      className="bg-[#00f3ff] hover:bg-[#00f3ff]/90 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold px-4 rounded-lg transition flex items-center justify-center text-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Diagnostic Detail Modal */}
      {selectedDiagnostic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl border p-6 flex flex-col shadow-2xl relative ${isHighContrast ? 'bg-white border-black text-black' : 'bg-[#1e1e24] border-cyan-400/35 text-zinc-100 shadow-cyan-950/20'}`}>
            <button
              onClick={() => setSelectedDiagnostic(null)}
              className={`absolute top-4 right-4 p-1 rounded-lg hover:bg-zinc-850/20 ${isHighContrast ? 'text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <Trash2 className="w-5 h-5 rotate-45" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500 shrink-0" />
              <div>
                <span className="font-mono text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  {selectedDiagnostic.code}
                </span>
                <h3 className="font-display font-bold text-lg mt-1">{selectedDiagnostic.title}</h3>
              </div>
            </div>

            <div className="space-y-4 text-sm leading-relaxed overflow-y-auto max-h-[60vh] pr-2">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Código com erro (Linha {selectedDiagnostic.lineIndex + 1}):</span>
                <p className="font-mono text-xs bg-zinc-950 p-2.5 rounded mt-1 overflow-x-auto whitespace-nowrap text-red-400 border border-red-900/30">
                  {selectedDiagnostic.lineText}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">O que está errado?</span>
                <p className={`mt-1 ${isHighContrast ? 'text-zinc-850' : 'text-zinc-300'}`}>
                  {selectedDiagnostic.description}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Manual de Referência Técnica (Sintaxe Fanuc/ISO):</span>
                <div className={`mt-1.5 p-3.5 rounded-lg border font-mono text-xs ${isHighContrast ? 'bg-zinc-50 border-zinc-350' : 'bg-[#131317] border-zinc-800 text-cyan-300'}`}>
                  {selectedDiagnostic.code.startsWith("ERR_G71") && (
                    <>
                      <p className="font-bold text-zinc-100 mb-1">// SINTAXE DO CICLO DE DESBASTE G71</p>
                      <p className="text-yellow-400">G71 U[profundidade] R[recuo];</p>
                      <p className="text-yellow-400">G71 P[N_inicial] Q[N_final] U[sobra_X] W[sobra_Z] F[avanço];</p>
                      <p className="mt-2 text-zinc-450 leading-normal">// Onde:</p>
                      <p className="text-zinc-450 leading-normal">U (1ª linha): Profundidade de corte radial por passada (ex: U2.0 = 2mm)</p>
                      <p className="text-zinc-450 leading-normal">R: Valor de afastamento rápido para retorno da ferramenta (ex: R1.0)</p>
                      <p className="text-zinc-450 leading-normal">P: Número do bloco de início do perfil de acabamento (N10)</p>
                      <p className="text-zinc-450 leading-normal">Q: Número do bloco de fim do perfil de acabamento (N20)</p>
                    </>
                  )}
                  {selectedDiagnostic.code.startsWith("ERR_G74") && (
                    <>
                      <p className="font-bold text-zinc-100 mb-1">// SINTAXE DO CICLO DE FURAÇÃO/CANAL FACIAL G74</p>
                      <p className="text-yellow-400">G74 R[recuo_cavaco];</p>
                      <p className="text-yellow-400">G74 X[diam_final] Z[compr_final] P[passo_X_microns] Q[picada_Z_microns] F[avanço];</p>
                      <p className="mt-2 text-zinc-450 leading-normal">// Onde:</p>
                      <p className="text-zinc-450 leading-normal">R: Recuo rápido de alívio para quebra de cavaco (ex: R1.0 = 1mm)</p>
                      <p className="text-zinc-450 leading-normal">Z: Coordenada final de profundidade axial no canal/furo</p>
                      <p className="text-zinc-450 leading-normal">Q: Profundidade incremental por penetração em MÍCRONS (ex: Q5000 = 5.0mm)</p>
                      <p className="text-zinc-450 leading-normal">P: Deslocamento radial incremental em MÍCRONS para canais largos (ex: P1500 = 1.5mm)</p>
                    </>
                  )}
                  {selectedDiagnostic.code.startsWith("ERR_G75") && (
                    <>
                      <p className="font-bold text-zinc-100 mb-1">// SINTAXE DO CICLO DE CANAIS G75</p>
                      <p className="text-yellow-400">G75 R[recuo_cavaco];</p>
                      <p className="text-yellow-400">G75 X[diam_fundo] Z[compr_final] P[picada_microns] Q[passo_lateral] F[avanço];</p>
                      <p className="mt-2 text-zinc-450 leading-normal">// Onde:</p>
                      <p className="text-zinc-450 leading-normal">R: Recuo de alívio rápido após cada picada de corte (ex: R0.5)</p>
                      <p className="text-zinc-450 leading-normal">P: Incremento radial de corte por picada em MÍCRONS (ex: P1500 = 1.5mm)</p>
                      <p className="text-zinc-450 leading-normal">Q: Deslocamento lateral de corte para canais largos (ex: Q3000 = 3.0mm)</p>
                    </>
                  )}
                  {selectedDiagnostic.code.startsWith("ERR_G76") && (
                    <>
                      <p className="font-bold text-zinc-100 mb-1">// SINTAXE DO CICLO DE ROSCA G76</p>
                      <p className="text-yellow-400">G76 P[aabbcc] Q[min_cut] R[finish_allowance];</p>
                      <p className="text-yellow-400">G76 X[diam_fundo] Z[compr_rosca] P[altura_filete] Q[prim_passe] F[passo];</p>
                      <p className="mt-2 text-zinc-450 leading-normal">// Onde:</p>
                      <p className="text-zinc-450 leading-normal">P (2ª linha): Altura radial total do filete da rosca em MÍCRONS (ex: P975 = 0.975mm)</p>
                      <p className="text-zinc-450 leading-normal">Q (2ª linha): Profundidade da primeira passada em MÍCRONS (ex: Q250 = 0.25mm)</p>
                      <p className="text-zinc-450 leading-normal">F: Passo da rosca em milímetros (ex: F1.5 = passo de 1.5mm)</p>
                    </>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Explicação Técnica Detalhada:</span>
                <p className={`mt-1 leading-relaxed ${isHighContrast ? 'text-zinc-800' : 'text-zinc-300'}`}>
                  {selectedDiagnostic.explanation}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sugestão de Correção:</span>
                <p className="mt-1 font-semibold text-cyan-400 font-mono text-xs">
                  {selectedDiagnostic.suggestedFix}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setSelectedDiagnostic(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition ${isHighContrast ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-200'}`}
              >
                Voltar
              </button>
              {onUpdateCode && (
                <button
                  onClick={() => {
                    const updated = selectedDiagnostic.applyFix(activeGCode);
                    onUpdateCode(updated);
                    setSelectedDiagnostic(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition ${isHighContrast ? 'bg-black text-white' : 'bg-cyan-500 text-black font-bold'}`}
                >
                  Aplicar Auto-Fix
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Fallback technical engineering tables in case API is unavailable on cold starts
const STATIC_FALLBACK_TABLES: TableData[] = [
  {
    nome: "Roscas Métricas ISO (Passo Grosso)",
    dados: [
      ["Rosca", "Passo (P) mm", "Diâmetro Furo (mm)", "Diâmetro Broca Recomendada", "Profundidade Filete (h)"],
      ["M3", "0.50", "2.50", "Broca Ø 2.5 mm", "0.307"],
      ["M4", "0.70", "3.30", "Broca Ø 3.3 mm", "0.429"],
      ["M5", "0.80", "4.20", "Broca Ø 4.2 mm", "0.491"],
      ["M6", "1.00", "5.00", "Broca Ø 5.0 mm", "0.613"],
      ["M8", "1.25", "6.80", "Broca Ø 6.8 mm", "0.767"],
      ["M10", "1.50", "8.50", "Broca Ø 8.5 mm", "0.920"],
      ["M12", "1.75", "10.20", "Broca Ø 10.2 mm", "1.074"],
      ["M16", "2.00", "14.00", "Broca Ø 14.0 mm", "1.227"],
      ["M20", "2.50", "17.50", "Broca Ø 17.5 mm", "1.534"]
    ]
  },
  {
    nome: "Roscas Polegada Whitworth (BSW)",
    dados: [
      ["Diâmetro Nominal", "Fios por Polegada (FPP)", "Diâmetro Furo (mm)", "Broca Recomendada", "Passo Equivalente (mm)"],
      ["1/8\"", "40", "2.50", "Broca Ø 2.5 mm", "0.635"],
      ["1/4\"", "20", "5.10", "Broca Ø 5.1 mm", "1.270"],
      ["3/8\"", "16", "7.90", "Broca Ø 7.9 mm", "1.587"],
      ["1/2\"", "12", "10.50", "Broca Ø 10.5 mm", "2.116"],
      ["5/8\"", "11", "13.50", "Broca Ø 13.5 mm", "2.309"],
      ["3/4\"", "10", "16.50", "Broca Ø 16.5 mm", "2.540"]
    ]
  }
];
