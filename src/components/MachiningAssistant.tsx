import React, { useState, useEffect, useRef } from "react";
import { Search, Calculator, Wrench, ChevronRight, ChevronLeft, HelpCircle, Copy, CheckCircle2, BookOpen, FileText, UploadCloud, Send, Trash2, AlertTriangle, Hexagon, X, Lock, ArrowRight } from "lucide-react";
import { SENAI_MANUAL_CHAPTERS, SenaiManualChapter } from "../data/senaiManual";
import FloatingCalculator from "./FloatingCalculator";
import { 
  fetchExperiencesFromCloud, 
  saveExperienceToCloud, 
  deleteExperienceFromCloud, 
  fetchBlockedTokensFromCloud, 
  saveBlockedTokensToCloud,
  ExperienceData 
} from "../lib/firebase";
import { getClients } from "../lib/licensing";

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
  onToggleFloatingCalculator?: () => void;
  isFloatingCalculatorOpen?: boolean;
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

const parseLocaleFloat = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  const normalized = val.toString().replace(",", ".");
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

export function mmToFractionalInch(mmValue: number): string {
  if (isNaN(mmValue) || mmValue <= 0) return "";
  const inches = mmValue / 25.4;
  
  const wholeInches = Math.floor(inches);
  const fraction = inches - wholeInches;
  
  // Find the closest fraction with denominator 64, 32, 16, 8, 4, 2
  const denominators = [2, 4, 8, 16, 32, 64];
  let bestDiff = Infinity;
  let bestNum = 0;
  let bestDen = 1;
  
  for (const den of denominators) {
    const num = Math.round(fraction * den);
    const approxFraction = num / den;
    const diff = Math.abs(fraction - approxFraction);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNum = num;
      bestDen = den;
    }
  }
  
  // Simplify fraction
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  };
  
  let num = bestNum;
  let den = bestDen;
  const common = gcd(num, den);
  if (common > 0) {
    num /= common;
    den /= common;
  }
  
  let finalWhole = wholeInches;
  let finalFractionStr = "";
  
  if (num === den && num > 0) {
    finalWhole += 1;
  } else if (num > 0) {
    finalFractionStr = `${num}/${den}`;
  }
  
  let result = "";
  if (finalWhole > 0) {
    result = `${finalWhole}`;
    if (finalFractionStr) {
      result += ` e ${finalFractionStr}`;
    }
  } else if (finalFractionStr) {
    result = finalFractionStr;
  } else {
    result = "0";
  }
  
  return result + '"';
}

export function fractionalInchToMm(inchStr: string): number {
  if (!inchStr) return 0;
  const cleaned = inchStr.trim()
    .replace(/"/g, "")
    .replace(/e/g, " ")
    .replace(/-/g, " ")
    .replace(/\+/g, " ")
    .replace(",", ".");
  
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned) * 25.4;
  }
  
  const normalized = cleaned.replace(/(\d+)\.(\d+\/\d+)/, "$1 $2");
  const parts = normalized.split(/\s+/).filter(Boolean);
  let totalInches = 0;
  
  if (parts.length === 1) {
    const part = parts[0];
    if (part.includes("/")) {
      const fracParts = part.split("/");
      if (fracParts.length === 2) {
        const num = parseFloat(fracParts[0]);
        const den = parseFloat(fracParts[1]);
        if (den > 0) {
          totalInches = num / den;
        }
      }
    } else {
      totalInches = parseFloat(part);
    }
  } else if (parts.length === 2) {
    const whole = parseFloat(parts[0]);
    const frac = parts[1];
    if (frac.includes("/")) {
      const fracParts = frac.split("/");
      if (fracParts.length === 2) {
        const num = parseFloat(fracParts[0]);
        const den = parseFloat(fracParts[1]);
        if (den > 0) {
          totalInches = whole + (num / den);
        }
      }
    }
  }
  
  return parseFloat((totalInches * 25.4).toFixed(3));
}

export const MachiningAssistant: React.FC<MachiningAssistantProps> = ({
  onClose,
  onInsertCode,
  onUpdateCode,
  activeGCode = "",
  isHighContrast,
  diagnosticError,
  onOpenCalculator,
  onToggleFloatingCalculator,
  isFloatingCalculatorOpen,
}) => {
  const [tables, setTables] = useState<TableData[]>(STATIC_FALLBACK_TABLES);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>(" ");
  const [loading, setLoading] = useState<boolean>(false);
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
      let trimmed = lineText.trim();
      if (trimmed.startsWith(";")) return;
      const clean = trimmed.replace(/\(.*?\)/g, "").trim();
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

  // Floating Calculator & Chat States
  const [localFloatingCalcOpen, setLocalFloatingCalcOpen] = useState<boolean>(false);
  const isFloatingCalcOpen = isFloatingCalculatorOpen !== undefined ? isFloatingCalculatorOpen : localFloatingCalcOpen;
  const setIsFloatingCalcOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    if (onToggleFloatingCalculator) {
      onToggleFloatingCalculator();
    } else {
      if (typeof val === "function") {
        setLocalFloatingCalcOpen(val);
      } else {
        setLocalFloatingCalcOpen(val);
      }
    }
  };
  const [activeMode, setActiveMode] = useState<"tables" | "senai-book" | "network-usinagem">("tables");
  
  // NETWORK USINAGEM STATES
  const [experiences, setExperiences] = useState<ExperienceData[]>([]);
  const [blockedTokens, setBlockedTokens] = useState<string[]>([]);
  const [loadingExperiences, setLoadingExperiences] = useState<boolean>(false);
  const [experiencesSearchQuery, setExperiencesSearchQuery] = useState<string>("");
  const [selectedExperience, setSelectedExperience] = useState<ExperienceData | null>(null);
  
  // Custom confirmation states to bypass blocked browser confirm() inside iframe
  const [confirmDeleteExp, setConfirmDeleteExp] = useState<ExperienceData | null>(null);
  const [confirmBlockUser, setConfirmBlockUser] = useState<{ token: string; name: string; shouldBlock: boolean } | null>(null);
  
  const [showAddExperienceForm, setShowAddExperienceForm] = useState<boolean>(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState<boolean>(false);
  const [passwordVerified, setPasswordVerified] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string>("");
  const [verifiedUser, setVerifiedUser] = useState<any | null>(null);
  
  const [newExpTitle, setNewExpTitle] = useState<string>("");
  const [newExpMessage, setNewExpMessage] = useState<string>("");
  const [newExpImage, setNewExpImage] = useState<string>("");
  const [postingExperience, setPostingExperience] = useState<boolean>(false);
  const [postingError, setPostingError] = useState<string>("");

  const loadExperiences = async () => {
    setLoadingExperiences(true);
    try {
      const exps = await fetchExperiencesFromCloud();
      const blocked = await fetchBlockedTokensFromCloud();
      setExperiences(exps);
      setBlockedTokens(blocked);
      if (exps.length > 0) {
        setSelectedExperience(exps[0]);
      } else {
        setSelectedExperience(null);
      }
    } catch (err) {
      console.error("Erro ao carregar rede de usinagem:", err);
    } finally {
      setLoadingExperiences(false);
    }
  };

  useEffect(() => {
    if (activeMode === "network-usinagem") {
      loadExperiences();
    }
  }, [activeMode]);

  const handleVerifyPassword = () => {
    const clients = getClients();
    const currentToken = localStorage.getItem("cnc_token") || "";
    const entered = passwordInput.trim();

    if (!entered) {
      setPasswordError("Por favor, digite a sua senha de acesso.");
      return;
    }

    // Match password: match both token and password
    const matched = clients.find(c => 
      (c.token === currentToken && c.password === entered) || 
      (c.token === entered && c.token === currentToken)
    );

    if (!matched) {
      setPasswordError("Senha incorreta! Digite a mesma senha que você usou para fazer login.");
      return;
    }

    if (blockedTokens.includes(matched.token)) {
      setPasswordError("Acesso Negado: Esta senha foi bloqueada pelo administrador para postagem de novas experiências.");
      return;
    }

    if (matched.blockSharing) {
      setPasswordError("Acesso Negado: Sua licença possui o bloqueio de compartilhamento de experiências ativo.");
      return;
    }

    setVerifiedUser(matched);
    setPasswordVerified(true);
    setShowPasswordDialog(false);
    setPasswordError("");
  };

  const handleSubmitExperience = async () => {
    if (!newExpTitle.trim() || !newExpMessage.trim()) {
      setPostingError("Título e mensagem são campos obrigatórios.");
      return;
    }

    const newExp: ExperienceData = {
      title: newExpTitle.trim(),
      message: newExpMessage.trim(),
      userName: verifiedUser?.name || localStorage.getItem("cnc_clientName") || "Operador CNC",
      userToken: verifiedUser?.token || localStorage.getItem("cnc_token") || "",
      image: newExpImage || undefined,
      createdAt: new Date().toISOString()
    };

    setPostingExperience(true);
    setPostingError("");
    try {
      const expId = await saveExperienceToCloud(newExp);
      if (expId) {
        setNewExpTitle("");
        setNewExpMessage("");
        setNewExpImage("");
        setPasswordVerified(false);
        setVerifiedUser(null);
        setShowAddExperienceForm(false);
        await loadExperiences();
      } else {
        setPostingError("Não foi possível registrar no Firestore. Verifique sua conexão.");
      }
    } catch (err) {
      console.error(err);
      setPostingError("Erro ao salvar experiência. Verifique as configurações de rede.");
    } finally {
      setPostingExperience(false);
    }
  };

  const [bookSearchQuery, setBookSearchQuery] = useState<string>("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("head");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("all");
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);

  // Generate slides from chapters dynamically
  const slides = React.useMemo(() => {
    const slidesList: any[] = [];
    let globalSlideNum = 1;
    
    SENAI_MANUAL_CHAPTERS.forEach((chapter) => {
      // 1. Cover slide
      slidesList.push({
        id: `${chapter.id}-cover`,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        category: chapter.category,
        slideRange: chapter.slides,
        title: chapter.title,
        content: chapter.description,
        isExample: false,
        slideNumber: globalSlideNum++,
      });

      // 2. Main content pages (Split by ### headers)
      if (chapter.content) {
        const sections = chapter.content.split("###").map(s => s.trim()).filter(Boolean);
        sections.forEach((section, idx) => {
          const lines = section.split("\n");
          const slideTitle = lines[0].replace(/[*#]/g, "").trim();
          const slideBody = lines.slice(1).join("\n").trim();
          slidesList.push({
            id: `${chapter.id}-content-${idx}`,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            category: chapter.category,
            slideRange: chapter.slides,
            title: slideTitle,
            content: slideBody,
            isExample: false,
            slideNumber: globalSlideNum++,
          });
        });
      }

      // 3. Examples
      if (chapter.examples) {
        chapter.examples.forEach((ex, idx) => {
          slidesList.push({
            id: `${chapter.id}-example-${idx}`,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            category: chapter.category,
            slideRange: chapter.slides,
            title: `Exercício: ${ex.title}`,
            content: ex.description,
            isExample: true,
            exampleCode: ex.code,
            examplePoints: ex.points,
            slideNumber: globalSlideNum++,
          });
        });
      }
    });

    return slidesList;
  }, []);

  // Filter slides by chapter and search query
  const filteredSlides = React.useMemo(() => {
    const removeAccents = (str: string) => {
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    };

    return slides.filter((slide) => {
      if (selectedChapterId !== "all" && slide.chapterId !== selectedChapterId) {
        return false;
      }
      const query = removeAccents(bookSearchQuery.trim());
      if (!query) return true;
      return (
        removeAccents(slide.chapterTitle).includes(query) ||
        removeAccents(slide.category).includes(query) ||
        removeAccents(slide.title).includes(query) ||
        removeAccents(slide.content).includes(query) ||
        (slide.exampleCode && removeAccents(slide.exampleCode).includes(query))
      );
    });
  }, [slides, selectedChapterId, bookSearchQuery]);

  // Clamp currentSlideIndex when filtered content changes
  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [selectedChapterId, bookSearchQuery]);

  // Helper to render slide body text with nice typography
  const renderSlideContent = (text: string) => {
    const lines = text.split("\n");
    return (
      <div className="space-y-3 text-zinc-800 leading-relaxed text-sm md:text-base font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-2" />;

          // Check if it's a list item
          const isBullet = trimmed.startsWith("*") || trimmed.startsWith("-");
          const isNumbered = /^\d+\./.test(trimmed);

          let content = trimmed;
          if (isBullet) {
            content = trimmed.substring(1).trim();
          } else if (isNumbered) {
            content = trimmed.replace(/^\d+\./, "").trim();
          }

          // Parse bold text **text** and inline code `code`
          const parseInline = (str: string) => {
            const parts: React.ReactNode[] = [];
            let current = str;
            let key = 0;

            while (current.length > 0) {
              const boldIdx = current.indexOf("**");
              const codeIdx = current.indexOf("`");

              if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
                if (boldIdx > 0) {
                  parts.push(current.substring(0, boldIdx));
                }
                const endBold = current.indexOf("**", boldIdx + 2);
                if (endBold !== -1) {
                  parts.push(
                    <strong key={key++} className="font-extrabold text-zinc-950">
                      {current.substring(boldIdx + 2, endBold)}
                    </strong>
                  );
                  current = current.substring(endBold + 2);
                } else {
                  parts.push(current.substring(boldIdx));
                  break;
                }
              } else if (codeIdx !== -1) {
                if (codeIdx > 0) {
                  parts.push(current.substring(0, codeIdx));
                }
                const endCode = current.indexOf("`", codeIdx + 1);
                if (endCode !== -1) {
                  parts.push(
                    <code key={key++} className="bg-zinc-100 text-[#005fb8] px-1.5 py-0.5 rounded font-mono text-xs border border-zinc-200">
                      {current.substring(codeIdx + 1, endCode)}
                    </code>
                  );
                  current = current.substring(endCode + 1);
                } else {
                  parts.push(current.substring(codeIdx));
                  break;
                }
              } else {
                parts.push(current);
                break;
              }
            }
            return parts;
          };

          if (isBullet) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-[#005fb8] font-bold text-lg leading-none select-none">•</span>
                <span className="flex-1">{parseInline(content)}</span>
              </div>
            );
          }

          if (isNumbered) {
            const numberMatch = trimmed.match(/^(\d+)\./);
            const num = numberMatch ? numberMatch[1] : "1";
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-[#005fb8] font-bold font-mono text-sm leading-6 select-none">{num}.</span>
                <span className="flex-1">{parseInline(content)}</span>
              </div>
            );
          }

          return <p key={idx} className="pl-1 text-zinc-700 leading-relaxed">{parseInline(content)}</p>;
        })}
      </div>
    );
  };

  // Helper to render G-Code with syntax highlighting inside slides
  const renderGCodeHighlight = (code: string) => {
    const lines = code.split("\n");
    return (
      <pre className="font-mono text-xs leading-relaxed text-zinc-300 bg-[#0d0d12] p-4 rounded-xl border border-zinc-800 overflow-x-auto max-h-[550px] select-text">
        {lines.map((line, idx) => {
          const commentIdx = line.indexOf("(");
          let mainCode = line;
          let comment = "";
          if (commentIdx !== -1) {
            mainCode = line.substring(0, commentIdx);
            comment = line.substring(commentIdx);
          }

          const tokens = mainCode.split(/(\s+)/);
          const highlightedTokens = tokens.map((token, tIdx) => {
            if (/^[NG]\d+/i.test(token)) {
              return <span key={tIdx} className="text-cyan-400 font-bold">{token}</span>;
            }
            if (/^[XYZFSTMWD]/i.test(token)) {
              const letter = token[0];
              const val = token.substring(1);
              return (
                <span key={tIdx}>
                  <span className="text-amber-400 font-semibold">{letter}</span>
                  <span className="text-emerald-400">{val}</span>
                </span>
              );
            }
            return <span key={tIdx}>{token}</span>;
          });

          return (
            <div key={idx} className="hover:bg-zinc-800/30 px-1 rounded transition">
              {highlightedTokens}
              {comment && <span className="text-zinc-500 italic">{comment}</span>}
            </div>
          );
        })}
      </pre>
    );
  };

  // Calculator states
  const [calcType, setCalcType] = useState<"rpm" | "feed" | "thread" | "conversor">("rpm");
  const [calcInchInput, setCalcInchInput] = useState<string>("1 e 1/4");
  const [calcMmInput, setCalcMmInput] = useState<string>("31.75");
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

  // Compute conversions
  const mmOutputFromInch = React.useMemo(() => {
    return fractionalInchToMm(calcInchInput);
  }, [calcInchInput]);

  const inchOutputFromMm = React.useMemo(() => {
    const val = parseLocaleFloat(calcMmInput);
    return mmToFractionalInch(val);
  }, [calcMmInput]);

  // Fetch tables on mount
  useEffect(() => {
    setSearchQuery("");
  }, []);

  // Compute outputs using useMemo for zero-lag reactivity on all devices
  const outputRpm = React.useMemo(() => {
    const vc = parseLocaleFloat(calcVc);
    const dia = parseLocaleFloat(calcDia);
    if (vc > 0 && dia > 0) {
      return Math.round((vc * 1000) / (Math.PI * dia));
    }
    return 0;
  }, [calcVc, calcDia]);

  const outputVf = React.useMemo(() => {
    const f = parseLocaleFloat(calcFeed);
    const rpm = parseLocaleFloat(calcRpm);
    if (f > 0 && rpm > 0) {
      return Math.round(f * rpm);
    }
    return 0;
  }, [calcFeed, calcRpm]);

  const outputVc = React.useMemo(() => {
    const rpm = parseLocaleFloat(calcRpm);
    const dia = parseLocaleFloat(calcDia);
    if (rpm > 0 && dia > 0) {
      return Math.round((Math.PI * dia * rpm) / 1000);
    }
    return 0;
  }, [calcRpm, calcDia]);

  const outputThreadHeight = React.useMemo(() => {
    const p = parseLocaleFloat(calcPitch);
    if (p > 0) {
      let multiplier = 0.65;
      if (threadProfile === "whitworth") {
        multiplier = 0.6403;
      } else if (threadProfile === "npt") {
        multiplier = 0.866;
      }
      return Math.round(multiplier * p * 1000); // in microns
    }
    return 0;
  }, [calcPitch, threadProfile]);

  const outputThreadRoot = React.useMemo(() => {
    const p = parseLocaleFloat(calcPitch);
    const dia = parseLocaleFloat(calcDia);
    if (p > 0 && dia > 0) {
      let minorDia = dia;
      if (threadDirection === "externa" || threadProfile === "npt") {
        minorDia = dia - 2 * (outputThreadHeight / 1000);
      } else {
        minorDia = dia - 1.0825 * p; // standard minor diameter for internal threads
      }
      return parseFloat(minorDia.toFixed(3));
    }
    return 0;
  }, [calcPitch, calcDia, threadDirection, outputThreadHeight, threadProfile]);

  const generateG76GCode = () => {
    const pitch = parseLocaleFloat(calcPitch);
    const dia = parseLocaleFloat(calcDia);
    const z_start = parseLocaleFloat(zStart);
    const z_end = parseLocaleFloat(zEnd);
    
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

  const renderNetworkUsinagemView = () => {
    const filteredExps = experiences.filter(exp => {
      if (!experiencesSearchQuery) return true;
      const q = experiencesSearchQuery.toLowerCase();
      return (
        exp.title.toLowerCase().includes(q) ||
        exp.message.toLowerCase().includes(q) ||
        exp.userName.toLowerCase().includes(q)
      );
    });

    const currentIsAdmin = localStorage.getItem("cnc_isAdmin") === "true";
    const clients = getClients();
    const currentToken = localStorage.getItem("cnc_token") || "";
    const currentClient = clients.find(c => c.token === currentToken);
    const isSharingBlocked = currentClient?.blockSharing === true;

    return (
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        {/* Header section with total posts & quick info */}
        <div className="mb-4 flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-cyan-950/40 text-cyan-400 rounded-lg border border-cyan-800/30">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
              </svg>
            </span>
            <div>
              <h4 className="text-sm font-bold text-zinc-150 uppercase tracking-wider">
                NETWORK USINAGEM - Rede de Experiências
              </h4>
              <p className="text-[10px] text-zinc-500 font-mono">
                Compartilhe e consulte conhecimentos práticos de usinagem com profissionais de torno CNC.
              </p>
            </div>
          </div>
          {currentIsAdmin && (
            <span className="text-[9px] px-2 py-1 bg-red-950/40 text-red-400 border border-red-900/30 rounded font-mono font-bold uppercase">
              Modo Administrador Ativo
            </span>
          )}
        </div>

        {/* Outer Split Layout */}
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
          
          {/* Left Column: List and Search */}
          <div className="w-[340px] shrink-0 flex flex-col gap-3 h-full border-r border-zinc-850 pr-4">
            
            {/* Search inputs */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-3 text-cyan-400 w-4 h-4" />
              <input
                type="text"
                value={experiencesSearchQuery}
                onChange={(e) => setExperiencesSearchQuery(e.target.value)}
                placeholder="Pesquisar termo na rede..."
                className="w-full bg-[#131317] border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-[#00f3ff] transition font-sans"
              />
            </div>

            {/* Post button */}
            {isSharingBlocked ? (
              <div className="w-full bg-red-950/25 border border-red-900/40 py-3 px-4 rounded-xl text-red-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 select-none" title="Bloqueio de compartilhamento de experiências ativo">
                <Lock className="w-3.5 h-3.5" />
                <span>Bloqueio de Compartilhamento</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowAddExperienceForm(true);
                  setShowPasswordDialog(true);
                  setPasswordVerified(false);
                  setPasswordInput("");
                  setPasswordError("");
                }}
                className="w-full bg-cyan-950/40 hover:bg-[#00f3ff] hover:text-zinc-950 text-[#00f3ff] border border-cyan-800/40 hover:border-cyan-400 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shrink-0 shadow-lg shadow-cyan-950/30"
              >
                <span>➕ Compartilhar Experiência</span>
              </button>
            )}

            {/* List label */}
            <div className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider pt-2 border-t border-zinc-900 shrink-0 flex justify-between items-center">
              <span>Experiências ({filteredExps.length}):</span>
              <span className="text-[#00f3ff] font-bold">Total</span>
            </div>

            {/* Scrollable Feed list */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 scrollbar-thin">
              {loadingExperiences ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-550 text-xs font-mono">
                  <div className="w-5 h-5 rounded-full border-2 border-t-cyan-400 border-zinc-800 animate-spin" />
                  <span>Sincronizando experiências...</span>
                </div>
              ) : filteredExps.map((exp, idx) => (
                <button
                  key={exp.id || idx}
                  onClick={() => setSelectedExperience(exp)}
                  className={`text-left p-3.5 rounded-xl border transition flex flex-col gap-2 ${
                    selectedExperience?.id === exp.id
                      ? "bg-cyan-950/20 text-[#00f3ff] border-cyan-400/40 shadow-lg shadow-cyan-950/10"
                      : "bg-[#111116] border-zinc-850/60 text-zinc-350 hover:text-zinc-200 hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="font-bold text-xs sm:text-sm text-zinc-100 truncate flex-1">{exp.title}</div>
                    {exp.image && (
                      <span className="text-[8px] bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        📷 FOTO
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-zinc-450 line-clamp-2 w-full leading-relaxed break-words">
                    {exp.message}
                  </p>

                  <div className="flex justify-between items-center w-full mt-1 border-t border-zinc-850/50 pt-2 text-[10px] text-zinc-500 font-mono">
                    <span className="truncate max-w-[140px] font-bold text-zinc-400 flex items-center gap-1">
                      👤 {exp.userName}
                    </span>
                    <span>
                      {exp.createdAt ? new Date(exp.createdAt).toLocaleDateString("pt-BR") : ""}
                    </span>
                  </div>
                </button>
              ))}

              {!loadingExperiences && filteredExps.length === 0 && (
                <div className="text-zinc-650 text-center py-16 text-xs font-mono px-4">
                  Nenhuma experiência de usinagem encontrada para a pesquisa.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Experience Detail View */}
          <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#111115] border border-zinc-850 rounded-2xl relative shadow-2xl">
            {selectedExperience ? (
              <div className="flex-1 flex flex-col justify-between h-full overflow-hidden p-6">
                {/* Header detail */}
                <div className="shrink-0 pb-4 border-b border-zinc-800 flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-zinc-100 leading-snug">
                      {selectedExperience.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 font-mono">
                      <span className="font-bold text-cyan-400 bg-cyan-950/30 border border-cyan-900/30 px-2 py-0.5 rounded">
                        👤 Autor: {selectedExperience.userName}
                      </span>
                      <span>
                        📅 {selectedExperience.createdAt ? new Date(selectedExperience.createdAt).toLocaleString("pt-BR") : ""}
                      </span>
                    </div>
                  </div>
                  
                  {/* Administrator actions directly on active post */}
                  {currentIsAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setConfirmDeleteExp(selectedExperience);
                        }}
                        className="p-2 bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/40 rounded-xl transition flex items-center gap-1.5 text-xs font-bold font-sans"
                        title="Apagar Experiência"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Apagar Post</span>
                      </button>
                      
                      {/* Block User Button */}
                      <button
                        onClick={() => {
                          const isBlocked = blockedTokens.includes(selectedExperience.userToken);
                          setConfirmBlockUser({
                            token: selectedExperience.userToken,
                            name: selectedExperience.userName,
                            shouldBlock: !isBlocked
                          });
                        }}
                        className={`px-3 py-2 border rounded-xl font-bold transition text-xs font-sans ${
                          blockedTokens.includes(selectedExperience.userToken)
                            ? "border-emerald-800 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/30"
                            : "border-red-800 bg-red-950/20 text-red-400 hover:bg-red-900/30"
                        }`}
                      >
                        {blockedTokens.includes(selectedExperience.userToken) ? "🔓 Desbloquear" : "🚫 Bloquear Autor"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Content detail panel */}
                <div className="flex-1 overflow-y-auto my-4 pr-1 scrollbar-thin flex flex-col gap-6">
                  {/* Experience description message */}
                  <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap font-sans bg-[#0c0c0f] p-5 rounded-xl border border-zinc-850/60 break-words">
                    {selectedExperience.message}
                  </div>

                  {/* Large visual attachment photo if available */}
                  {selectedExperience.image ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold font-mono">
                        📷 Foto Anexa:
                      </span>
                      <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/40 p-2 flex justify-center shadow-inner group transition-all duration-300">
                        <img
                          src={selectedExperience.image}
                          alt={selectedExperience.title}
                          className="max-h-[300px] object-contain rounded-lg shadow-md hover:scale-[1.02] transition duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-zinc-650 font-mono text-center text-xs border border-dashed border-zinc-800/40 p-6 rounded-xl bg-zinc-950/20">
                      Nenhuma foto foi anexada a esta experiência.
                    </div>
                  )}
                </div>

                {/* Footer detail panel info */}
                <div className="shrink-0 border-t border-zinc-850/60 pt-3 text-[10px] text-zinc-500 font-mono flex items-center justify-between">
                  <span>TORNO MASTER • COMPARTILHAMENTO DE CONHECIMENTO</span>
                  <span>ID do Post: {selectedExperience.id}</span>
                </div>
              </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 font-mono">
                  <svg className="w-12 h-12 text-zinc-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  <span>Nenhuma experiência selecionada.</span>
                  <span>Escolha um post ao lado ou compartilhe o seu!</span>
                </div>
              )}
          </div>

        </div>

        {/* MODAL overlay for password validation dialog */}
        {showPasswordDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#16161c] border border-cyan-400/30 rounded-2xl p-6 shadow-2xl relative">
              <button
                onClick={() => {
                  setShowPasswordDialog(false);
                  setShowAddExperienceForm(false);
                }}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-cyan-950/50 text-[#00f3ff] rounded-xl border border-cyan-800/30">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-zinc-100 uppercase tracking-wider">
                    Confirmação de Identidade
                  </h4>
                  <p className="text-xs text-zinc-450 mt-0.5 font-sans">Digite a sua senha de acesso para continuar.</p>
                </div>
              </div>

              <div className="space-y-4 my-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 font-mono">
                    Senha de Acesso (mesma do Login)
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Digite sua senha de 5 dígitos..."
                    className="w-full bg-[#0d0d11] text-zinc-100 px-4 py-3 rounded-xl border border-zinc-800 text-sm outline-none focus:border-cyan-400 transition font-sans"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyPassword();
                    }}
                  />
                  {passwordError && (
                    <p className="text-xs text-red-400 mt-2 font-semibold flex items-center gap-1.5 font-sans">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setShowAddExperienceForm(false);
                  }}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-wider transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleVerifyPassword}
                  className="px-5 py-2.5 bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-black rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5 font-sans"
                >
                  <span>Verificar Senha</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL overlay for creating/submitting experience form */}
        {showAddExperienceForm && passwordVerified && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#16161c] border border-cyan-400/40 rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
              <button
                onClick={() => {
                  setShowAddExperienceForm(false);
                  setPasswordVerified(false);
                }}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4 shrink-0 border-b border-zinc-850 pb-4">
                <div className="p-2.5 bg-cyan-950/50 text-[#00f3ff] rounded-xl border border-cyan-800/30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-zinc-100 uppercase tracking-wider">
                    Compartilhar Experiência Prática
                  </h4>
                  <p className="text-xs text-zinc-450 mt-0.5 font-sans">
                    Preenchendo como: <span className="text-[#00f3ff] font-bold">{verifiedUser?.name}</span>
                  </p>
                </div>
              </div>

              {/* Form content scroll container */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-3 scrollbar-thin">
                {postingError && (
                  <div className="p-3 bg-red-950/30 border border-red-900/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2 font-sans">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{postingError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-zinc-450 uppercase mb-1 font-mono">
                    Título do Assunto (ex: "Alinhamento G76", "Vibração pastilha")
                  </label>
                  <input
                    type="text"
                    value={newExpTitle}
                    onChange={(e) => setNewExpTitle(e.target.value)}
                    placeholder="Seja curto e direto ao assunto..."
                    className="w-full bg-[#0d0d11] text-zinc-100 px-4 py-2.5 rounded-xl border border-zinc-800 text-xs outline-none focus:border-cyan-400 transition font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-450 uppercase mb-1 font-mono">
                    Mensagem / Dica Prática (O que você aprendeu ou quer compartilhar)
                  </label>
                  <textarea
                    value={newExpMessage}
                    onChange={(e) => setNewExpMessage(e.target.value)}
                    placeholder="Descreva detalhadamente o problema e como você resolveu na prática..."
                    rows={8}
                    className="w-full bg-[#0d0d11] text-zinc-100 px-4 py-3 rounded-xl border border-zinc-800 text-xs outline-none focus:border-cyan-400 transition font-sans resize-none"
                  />
                </div>

                {/* Upload attachment Section */}
                <div className="border border-dashed border-zinc-800 rounded-xl p-4 bg-zinc-950/20">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h5 className="text-xs font-bold text-zinc-300 font-sans">Anexar Foto da Peça ou Desenho</h5>
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">Selecione uma imagem (JPEG/PNG) de até 2MB</p>
                    </div>
                    <label className="shrink-0 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl text-[10px] font-bold cursor-pointer transition flex items-center gap-1.5 uppercase font-sans">
                      <UploadCloud className="w-4 h-4 text-cyan-400" />
                      <span>Selecionar Imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              alert("A imagem é muito grande! Escolha um arquivo menor que 2MB.");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setNewExpImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {newExpImage && (
                    <div className="mt-3 flex items-center justify-between bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <img src={newExpImage} alt="Anexo" className="w-10 h-10 object-cover rounded-md border border-zinc-800" referrerPolicy="no-referrer" />
                        <span className="text-[10px] text-zinc-400 truncate font-mono">Imagem carregada com sucesso!</span>
                      </div>
                      <button
                        onClick={() => setNewExpImage("")}
                        className="px-2 py-1 hover:bg-red-950/50 rounded text-red-400 hover:text-red-300 transition text-[10px] font-bold font-sans"
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-3 shrink-0 border-t border-zinc-850">
                <button
                  onClick={() => {
                    setShowAddExperienceForm(false);
                    setPasswordVerified(false);
                  }}
                  className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-wider transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  disabled={postingExperience || !newExpTitle.trim() || !newExpMessage.trim()}
                  onClick={handleSubmitExperience}
                  className="px-6 py-2.5 bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-black rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed font-sans"
                >
                  {postingExperience ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-t-zinc-950 border-cyan-950 animate-spin" />
                      <span>Publicando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Publicar na Rede</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Confirmation Overlays */}
        {confirmDeleteExp && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="bg-[#17171e] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-red-400 mb-4">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h4 className="text-sm font-bold uppercase tracking-wider font-sans">Apagar Experiência?</h4>
              </div>
              <p className="text-xs text-zinc-350 mb-6 leading-relaxed font-sans">
                Você tem certeza que deseja excluir permanentemente o post <strong className="text-zinc-100">"{confirmDeleteExp.title}"</strong>? Esta ação é irreversível e removerá a postagem para todos os usuários.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmDeleteExp(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const expId = confirmDeleteExp.id;
                    setConfirmDeleteExp(null);
                    if (expId) {
                      await deleteExperienceFromCloud(expId);
                      setSelectedExperience(null);
                      await loadExperiences();
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition font-sans"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmBlockUser && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="bg-[#17171e] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-red-400 mb-4">
                <Lock className="w-6 h-6 shrink-0" />
                <h4 className="text-sm font-bold uppercase tracking-wider font-sans">
                  {confirmBlockUser.shouldBlock ? "Bloquear Autor?" : "Desbloquear Autor?"}
                </h4>
              </div>
              <p className="text-xs text-zinc-350 mb-6 leading-relaxed font-sans">
                {confirmBlockUser.shouldBlock ? (
                  <span>
                    Deseja realmente <strong className="text-red-400">BLOQUEAR</strong> o autor <strong className="text-zinc-100">"{confirmBlockUser.name}"</strong>? Ele será impedido de publicar novas experiências na rede.
                  </span>
                ) : (
                  <span>
                    Deseja <strong className="text-emerald-400">DESBLOQUEAR</strong> o autor <strong className="text-zinc-100">"{confirmBlockUser.name}"</strong> para permitir que ele publique novas experiências?
                  </span>
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmBlockUser(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const { token, shouldBlock } = confirmBlockUser;
                    setConfirmBlockUser(null);
                    let updated: string[];
                    if (shouldBlock) {
                      updated = [...blockedTokens, token];
                    } else {
                      updated = blockedTokens.filter(t => t !== token);
                    }
                    await saveBlockedTokensToCloud(updated);
                    setBlockedTokens(updated);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition font-sans ${
                    confirmBlockUser.shouldBlock
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                >
                  {confirmBlockUser.shouldBlock ? "Confirmar Bloqueio" : "Confirmar Desbloqueio"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const activeTable = tables[activeTab];

  return (
    <>
      <div className={`relative w-full h-full flex flex-col overflow-hidden ${isHighContrast ? 'bg-white text-black' : 'bg-[#1e1e24] text-zinc-100'}`}>
        
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
            
            {/* NETWORK USINAGEM TAB */}
            <div>
              <h4 className="text-xs font-bold text-cyan-400 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                <span>🌐 Rede CNC</span>
              </h4>
              <button
                onClick={() => {
                  setActiveMode("network-usinagem");
                }}
                className={`text-left text-xs p-3 rounded-xl border transition font-bold w-full flex items-center justify-between ${
                  activeMode === "network-usinagem"
                    ? "bg-cyan-950/40 text-[#00f3ff] border-[#00f3ff] shadow-lg shadow-cyan-950/25 font-black"
                    : "bg-[#1f1f26]/80 border-zinc-800/80 text-zinc-350 hover:text-white hover:border-zinc-750"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <span>🌐 NETWORK USINAGEM</span>
                </span>
                <ChevronRight className={`w-3.5 h-3.5 transition ${activeMode === "network-usinagem" ? "text-cyan-400 translate-x-0.5" : "text-zinc-600"}`} />
              </button>
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
                    setActiveMode("tables");
                    setCalcType("conversor");
                  }}
                  className={`text-left text-xs p-2.5 rounded-lg border transition flex items-center gap-2 ${
                    activeMode === "tables" && calcType === "conversor"
                      ? "bg-emerald-950/20 text-[#00f3ff] border-[#00f3ff]/40 font-bold"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5 text-[#00f3ff]" />
                  Conversor Pol. ⇄ mm
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

            {/* Calculadora Científica */}
            <div>
              <h4 className="text-xs font-bold text-zinc-500 tracking-wider mb-2 uppercase">
                Calculadora Científica
              </h4>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setIsFloatingCalcOpen(prev => !prev);
                  }}
                  className={`text-left text-xs p-2.5 rounded-lg border transition font-medium flex items-center justify-between w-full ${
                    isFloatingCalcOpen
                      ? "bg-[#00f3ff]/10 text-[#00f3ff] border-[#00f3ff]/40 font-bold"
                      : "bg-[#1f1f26] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-[#00f3ff]" />
                    <span>Calculadora Flutuante</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${isFloatingCalcOpen ? "bg-[#00f3ff] animate-pulse" : "bg-zinc-650"}`} />
                </button>
              </div>
            </div>

          </div>

          {/* Right main panel split */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[#0d0d11]">
            {activeMode === "network-usinagem" ? (
              renderNetworkUsinagemView()
            ) : false ? (
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
                        Navegue pelos slides práticos do manual oficial do SENAI, pesquise termos e copie códigos.
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 bg-cyan-950/40 text-cyan-400 border border-cyan-800/20 rounded font-mono font-bold uppercase">
                    Modo Slides / Manual Real
                  </span>
                </div>

                {/* Main panel split: Left list of chapters & slides / Right real photo slide canvas */}
                <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
                  
                  {/* Left list of chapters (Scrollable list with search) */}
                  <div className="w-[280px] shrink-0 flex flex-col gap-3 h-full border-r border-zinc-850 pr-4">
                    
                    {/* Search field */}
                    <div className="relative shrink-0">
                      <Search className="absolute left-2.5 top-2.5 text-zinc-555 w-3.5 h-3.5" />
                      <input
                        type="text"
                        value={bookSearchQuery}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBookSearchQuery(val);
                          if (val.trim() !== "") {
                            setSelectedChapterId("all");
                          }
                        }}
                        placeholder="Pesquisar termo no manual..."
                        className="w-full bg-[#131317] border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-[#00f3ff] font-sans transition"
                      />
                    </div>

                    {/* Chapter filter selector */}
                    <div className="shrink-0">
                      <label className="text-[10px] text-zinc-500 uppercase font-mono block mb-1">Filtrar por Capítulo:</label>
                      <select
                        value={selectedChapterId}
                        onChange={(e) => setSelectedChapterId(e.target.value)}
                        className="w-full bg-[#131317] border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-250 outline-none focus:border-[#00f3ff] transition"
                      >
                        <option value="all">📚 Todos os Capítulos ({SENAI_MANUAL_CHAPTERS.length})</option>
                        {SENAI_MANUAL_CHAPTERS.map(ch => (
                          <option key={ch.id} value={ch.id}>
                            {ch.title.length > 35 ? ch.title.substring(0, 35) + "..." : ch.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Slides Navigation list inside Sidebar */}
                    <div className="text-[10px] text-zinc-555 uppercase font-mono tracking-wider pt-2 border-t border-zinc-900 shrink-0 flex justify-between items-center">
                      <span>Slides do Manual:</span>
                      <span className="text-[#00f3ff] font-bold">({filteredSlides.length})</span>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                      {filteredSlides.map((slide, sIdx) => (
                        <button
                          key={slide.id}
                          onClick={() => setCurrentSlideIndex(sIdx)}
                          className={`text-left p-2.5 rounded-lg border transition text-xs flex flex-col gap-1 ${
                            currentSlideIndex === sIdx
                              ? "bg-cyan-950/20 text-[#00f3ff] border-cyan-400/40 font-bold"
                              : "bg-[#111116] border-zinc-850/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-mono text-[9px] bg-zinc-900 px-1.5 py-0.5 rounded font-bold text-zinc-400">
                              Pág. {slide.slideNumber}
                            </span>
                            <span className="text-[9px] text-zinc-555 font-mono italic truncate max-w-[120px] uppercase">
                              {slide.category}
                            </span>
                          </div>
                          <div className="font-bold truncate text-zinc-200 w-full mt-0.5">{slide.title}</div>
                        </button>
                      ))}

                      {filteredSlides.length === 0 && (
                        <div className="text-zinc-600 text-center py-12 text-[11px] font-mono">
                          Nenhum slide ou capítulo corresponde aos filtros.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Beautiful Slide presentation card ("Livro de Consulta como Foto/Slide") */}
                  <div className="flex-1 flex flex-col justify-between h-full min-h-0 overflow-hidden">
                    {(() => {
                      const currentSlide = filteredSlides[currentSlideIndex];
                      if (!currentSlide) {
                        return (
                          <div className="flex-1 flex items-center justify-center bg-[#131318] border border-zinc-800 rounded-xl p-8">
                            <p className="text-zinc-500 text-xs font-mono text-center">
                              Use a pesquisa para encontrar termos ou selecione um capítulo ao lado.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden h-full">
                          
                          {/* THE ACTUAL SLIDE / "FOTO" OF MANUAL */}
                          <div className="flex-1 bg-white text-zinc-900 rounded-xl border border-zinc-200 shadow-2xl flex flex-col justify-between overflow-hidden relative p-4 md:p-6 select-text">
                            
                            {/* Slide Top Decorative bar (looks exactly like the blue block in screenshot) */}
                            <div className="absolute top-0 left-0 right-0 h-2 bg-[#005fb8]" />
                            
                            {/* Slide Header */}
                            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-2 shrink-0">
                              <div className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-[#005fb8]" />
                                <span className="text-[10px] md:text-xs font-mono text-[#005fb8] uppercase font-black tracking-widest">
                                  SENAI CNC • {currentSlide.category}
                                </span>
                              </div>
                              <span className="text-[10px] md:text-xs font-mono text-zinc-400 font-bold bg-zinc-50 border border-zinc-150 px-2 py-0.5 rounded">
                                {currentSlide.slideRange}
                              </span>
                            </div>

                            {/* Slide Main Content Body */}
                            <div className="flex-1 overflow-y-auto pr-1 my-3 scrollbar-thin">
                              {currentSlide.isExample ? (
                                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                                  {/* Left column: Text info */}
                                  <div className="lg:col-span-2 flex flex-col space-y-4">
                                    <div className="space-y-3">
                                      <h3 className="text-xl font-black text-zinc-900 leading-tight">
                                        {currentSlide.title}
                                      </h3>
                                      <div className="text-sm text-zinc-650 leading-relaxed font-sans pr-2">
                                        {renderSlideContent(currentSlide.content)}
                                      </div>
                                    </div>

                                    {/* Geometric points if any */}
                                    {currentSlide.examplePoints && currentSlide.examplePoints.length > 0 && (
                                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-mono text-slate-700 mt-2">
                                        <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-1 uppercase text-[10px] tracking-wide">
                                          Coordenadas do Perfil:
                                        </div>
                                        <div className="grid grid-cols-3 gap-y-1 gap-x-2">
                                          {currentSlide.examplePoints.map((pt: any, pIdx: number) => (
                                            <div key={pIdx} className="flex justify-between border-b border-slate-100/60 pb-0.5">
                                              <span className="font-black text-[#005fb8]">{pt.pt}:</span>
                                              <span>X{pt.x} Z{pt.z}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right column: G-Code view with insert tools */}
                                  <div className="lg:col-span-3 flex flex-col bg-[#0b0b0f] p-4 rounded-xl border border-zinc-800 relative">
                                    <div className="flex justify-between items-center pb-2 mb-2 border-b border-zinc-850">
                                      <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                                        Código G Resolvido:
                                      </span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(currentSlide.exampleCode);
                                        }}
                                        className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition"
                                        title="Copiar Código"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    
                                    <div className="mb-3 w-full overflow-x-auto">
                                      {renderGCodeHighlight(currentSlide.exampleCode)}
                                    </div>

                                    <button
                                      onClick={() => {
                                        handleInsertCalculated(currentSlide.exampleCode);
                                      }}
                                      className="w-full bg-[#005fb8] hover:bg-[#004d96] text-white font-extrabold py-2 px-3 rounded-lg text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition shrink-0"
                                    >
                                      <span>⚡ Inserir Código Resolvido no Editor</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4 max-w-3xl">
                                  <h3 className="text-2xl font-black text-zinc-900 tracking-tight leading-tight border-b border-zinc-100 pb-2">
                                    {currentSlide.title}
                                  </h3>
                                  <div className="text-sm md:text-base text-zinc-750 leading-relaxed pr-2">
                                    {renderSlideContent(currentSlide.content)}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Slide Footer - STRICTLY CLEAN (No instructor names) */}
                            <div className="border-t border-zinc-100 pt-3 flex items-center justify-between text-[9px] md:text-[10px] font-mono text-zinc-400 tracking-wider shrink-0 mt-2">
                              <span>MANUAL DE PROGRAMAÇÃO DE TORNO CNC • SENAI</span>
                              <span className="font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded border border-zinc-150">
                                Slide {currentSlide.slideNumber}
                              </span>
                            </div>
                          </div>

                          {/* Navigation control overlay under the slide */}
                          <div className="flex justify-between items-center py-2 px-1 shrink-0">
                            <button
                              onClick={() => {
                                if (currentSlideIndex > 0) {
                                  setCurrentSlideIndex(currentSlideIndex - 1);
                                }
                              }}
                              disabled={currentSlideIndex === 0}
                              className={`flex items-center gap-1.5 py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition ${
                                currentSlideIndex === 0
                                  ? "text-zinc-600 bg-zinc-900/25 border border-zinc-800/40 cursor-not-allowed"
                                  : "bg-[#181822] text-zinc-200 border border-zinc-800 hover:bg-zinc-800 hover:text-white"
                              }`}
                            >
                              <ChevronLeft className="w-4 h-4" />
                              <span>Anterior</span>
                            </button>

                            <div className="text-center font-mono text-xs text-zinc-400">
                              Página <span className="text-[#00f3ff] font-bold">{currentSlideIndex + 1}</span> de <span className="font-bold">{filteredSlides.length}</span>
                            </div>

                            <button
                              onClick={() => {
                                if (currentSlideIndex < filteredSlides.length - 1) {
                                  setCurrentSlideIndex(currentSlideIndex + 1);
                                }
                              }}
                              disabled={currentSlideIndex === filteredSlides.length - 1}
                              className={`flex items-center gap-1.5 py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition ${
                                currentSlideIndex === filteredSlides.length - 1
                                  ? "text-zinc-650 bg-zinc-900/25 border border-zinc-800/40 cursor-not-allowed"
                                  : "bg-[#00f3ff] text-zinc-950 hover:bg-[#00f3ff]/90"
                              }`}
                            >
                              <span>Próximo</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>

                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>
            ) : true ? (
              <>
                {/* CNC Interactive calculators at top */}
                <div className="mb-6 p-4 bg-[#1b1b21] rounded-xl border border-zinc-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[11px] font-bold text-[#00f3ff] uppercase tracking-wider font-mono">
                      Calculadora Rápida {calcType === "rpm" ? "RPM / G96" : calcType === "feed" ? "Avanço Vf" : calcType === "thread" ? "Rosca G76" : "Conversor Pol/mm"}
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
                                type="text"
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
                                type="text"
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
                                type="text"
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
                                type="text"
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
                          type="text"
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
                          type="text"
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

                  {calcType === "conversor" && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                        <span className="text-[11px] font-bold text-[#00f3ff] uppercase tracking-wider font-mono">
                          Conversor de Medidas (Polegadas Fracionárias ⇄ Milímetros)
                        </span>
                        <span className="text-[10px] text-zinc-500 italic">
                          Conversor bidirecional de precisão mecânica conforme padrão SENAI (ex: 31,75mm = 1 e 1/4")
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Column 1: Inch to MM */}
                        <div className="p-4 bg-[#16161c] rounded-xl border border-zinc-800/80 flex flex-col gap-3">
                          <h4 className="text-xs font-bold text-cyan-400 uppercase font-sans">
                            Converter Polegada Fracionária para mm
                          </h4>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                              Fração em Polegada (ex: 1 e 1/4, 3/8, 1 1/2)
                            </label>
                            <input
                              type="text"
                              value={calcInchInput}
                              onChange={(e) => setCalcInchInput(e.target.value)}
                              placeholder="Ex: 1 e 1/4"
                              className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                            />
                          </div>

                          <div className="bg-[#0f0f13] p-3 rounded border border-zinc-800/60 flex flex-col justify-center text-center">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase font-sans">Resultado em Milímetros</span>
                            <span className="text-emerald-400 font-mono font-bold text-lg">
                              {mmOutputFromInch > 0 ? `${mmOutputFromInch.toString().replace(".", ",")} mm` : "---"}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              if (mmOutputFromInch > 0) {
                                handleInsertCalculated(`${mmOutputFromInch.toString().replace(".", ",")}`);
                              }
                            }}
                            className="w-full text-center text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg transition"
                          >
                            Inserir valor no G-Code
                          </button>
                        </div>

                        {/* Column 2: MM to Inch */}
                        <div className="p-4 bg-[#16161c] rounded-xl border border-zinc-800/80 flex flex-col gap-3">
                          <h4 className="text-xs font-bold text-cyan-400 uppercase font-sans">
                            Converter mm para Polegada Fracionária
                          </h4>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                              Valor em Milímetros (ex: 31.75 ou 31,75)
                            </label>
                            <input
                              type="text"
                              value={calcMmInput}
                              onChange={(e) => setCalcMmInput(e.target.value)}
                              placeholder="Ex: 31,75"
                              className="w-full bg-[#0d0d11] text-zinc-100 px-3 py-1.5 rounded border border-zinc-800 text-sm outline-none focus:border-cyan-400 font-mono"
                            />
                          </div>

                          <div className="bg-[#0f0f13] p-3 rounded border border-zinc-800/60 flex flex-col justify-center text-center">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase font-sans">Fração Equivalente</span>
                            <span className="text-emerald-400 font-mono font-bold text-lg">
                              {inchOutputFromMm || "---"}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              if (inchOutputFromMm) {
                                handleInsertCalculated(`${inchOutputFromMm}`);
                              }
                            }}
                            className="w-full text-center text-xs bg-[#00f3ff] hover:bg-[#00f3ff]/90 text-zinc-950 font-bold py-2 px-3 rounded-lg transition"
                          >
                            Inserir fração no G-Code
                          </button>
                        </div>
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
                              if (prof === "whitworth") {
                                setG76_A("55");
                                setCalcPitch("2.309"); // 11 TPI pitch (25.4 / 11)
                                setThreadTaper("paralela");
                              } else if (prof === "npt") {
                                setG76_A("60");
                                setCalcPitch("2.209"); // 11.5 TPI pitch (25.4 / 11.5)
                                setThreadTaper("conica");
                              } else {
                                setG76_A("60");
                                setCalcPitch("1.5");   // Standard metric pitch
                                setThreadTaper("paralela");
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
                            type="text"
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
                            type="text"
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
                            type="text"
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
                            type="text"
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
                            type="text"
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
            ) : null}
          </div>
        </div>
        {isFloatingCalcOpen && !onToggleFloatingCalculator && (
          <FloatingCalculator
            onClose={() => setIsFloatingCalcOpen(false)}
            onInsertValue={(val) => onInsertCode(val)}
          />
        )}
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
  },
  {
    nome: "Conversão: Polegadas Fracionárias em Milímetros (mm)",
    dados: [
      ["Polegada (Frações)", "Milímetros (mm)"],
      ["1/32\"", "0,794"],
      ["1/16\"", "1,588"],
      ["3/32\"", "2,381"],
      ["1/8\"", "3,175"],
      ["5/32\"", "3,969"],
      ["3/16\"", "4,763"],
      ["7/32\"", "5,556"],
      ["1/4\"", "6,350"],
      ["9/32\"", "7,144"],
      ["5/16\"", "7,938"],
      ["11/32\"", "8,731"],
      ["3/8\"", "9,525"],
      ["13/32\"", "10,319"],
      ["7/16\"", "11,113"],
      ["15/32\"", "11,906"],
      ["1/2\"", "12,700"],
      ["17/32\"", "13,494"],
      ["9/16\"", "14,288"],
      ["19/32\"", "15,081"],
      ["5/8\"", "15,875"],
      ["21/32\"", "16,669"],
      ["11/16\"", "17,463"],
      ["23/32\"", "18,256"],
      ["3/4\"", "19,050"],
      ["25/32\"", "19,844"],
      ["13/16\"", "20,638"],
      ["27/32\"", "21,431"],
      ["7/8\"", "22,225"],
      ["29/32\"", "23,019"],
      ["15/16\"", "23,813"],
      ["31/32\"", "24,605"],
      ["1\"", "25,400"],
      ["1 1/16\"", "26,988"],
      ["1 1/8\"", "28,575"],
      ["1 3/16\"", "30,163"],
      ["1 1/4\"", "31,750"],
      ["1 5/16\"", "33,338"],
      ["1 3/8\"", "34,925"],
      ["1 7/16\"", "36,513"],
      ["1 1/2\"", "38,100"],
      ["1 9/16\"", "39,688"],
      ["1 5/8\"", "41,275"],
      ["1 11/16\"", "42,863"],
      ["1 3/4\"", "44,450"],
      ["1 13/16\"", "46,038"],
      ["1 7/8\"", "47,625"],
      ["1 15/16\"", "49,213"],
      ["2\"", "50,800"],
      ["2 1/8\"", "53,975"],
      ["2 1/4\"", "57,150"],
      ["2 3/8\"", "60,325"],
      ["2 1/2\"", "63,500"],
      ["2 5/8\"", "66,675"],
      ["2 3/4\"", "69,850"],
      ["2 7/8\"", "73,025"],
      ["3\"", "76,200"],
      ["3 1/4\"", "82,550"],
      ["3 1/2\"", "88,900"],
      ["3 3/4\"", "95,250"],
      ["4\"", "101,600"],
      ["4 1/4\"", "107,950"],
      ["4 1/2\"", "114,300"],
      ["4 3/4\"", "120,650"],
      ["5\"", "127,000"],
      ["5 1/4\"", "133,350"],
      ["5 1/2\"", "139,700"],
      ["5 3/4\"", "146,050"],
      ["6\"", "152,400"],
      ["7\"", "177,800"],
      ["8\"", "203,200"],
      ["9\"", "228,600"],
      ["10\"", "254,000"],
      ["11\"", "279,400"],
      ["12\"", "304,800"],
      ["13\"", "330,200"],
      ["14\"", "355,600"],
      ["15\"", "381,000"],
      ["16\"", "406,400"],
      ["17\"", "431,800"],
      ["18\"", "457,200"],
      ["19\"", "482,600"],
      ["20\"", "508,000"]
    ]
  }
];
