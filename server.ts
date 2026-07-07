import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Path to a simple JSON database file for persistence
const DB_FILE = path.join(process.cwd(), "db.json");

interface ClientToken {
  name: string;
  email?: string;
  password?: string;
  token: string;
  expirationDate: string | null; // "YYYY-MM-DD" or null for lifetime
  supportPhone: string;
  subscriptionType?: "demo" | "mensal" | "semestral";
  registrationDate?: string;
}

// Global sessions store: { [token]: { [sessionId]: timestamp } }
let activeSessions: Record<string, Record<string, number>> = {};
const SESSION_TIMEOUT_MS = 90000; // 90 seconds timeout for inactive sessions

// Default clients if database is empty
const DEFAULT_CLIENTS: ClientToken[] = [
  { name: "Suporte Técnico", token: "CNC-MASTER-2026", expirationDate: "2030-12-31", supportPhone: "(18) 99999-9999", subscriptionType: "semestral" },
  { name: "Licença Demonstração", email: "demo@demo.com", password: "demo", token: "CNC-TRIAL-FREE", expirationDate: "2026-10-30", supportPhone: "(18) 99999-8888", subscriptionType: "demo" },
  { name: "Cliente Licença Expirada", email: "expirado@demo.com", password: "demo", token: "CNC-EXPIRADO", expirationDate: "2025-01-01", supportPhone: "(18) 99999-7777", subscriptionType: "demo" },
  { name: "Acesso Vitalício", email: "vitalicio@demo.com", password: "demo", token: "CNC-LIFETIME", expirationDate: null, supportPhone: "(18) 99999-6666", subscriptionType: "semestral" }
];

let globalSupportPhone = "(18) 99999-5555";

function loadDatabase(): ClientToken[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed.clients) {
        if (parsed.supportPhone) globalSupportPhone = parsed.supportPhone;
        
        let list: ClientToken[] = parsed.clients;
        const hasAdmin = list.some(c => c.token === "CNC-MASTER-2026");
        if (!hasAdmin) {
          list.push({
            name: "Suporte Técnico",
            token: "CNC-MASTER-2026",
            expirationDate: "2030-12-31",
            supportPhone: "(18) 99999-9999",
            subscriptionType: "semestral"
          });
          try {
            fs.writeFileSync(DB_FILE, JSON.stringify({ clients: list, supportPhone: globalSupportPhone }, null, 2), "utf-8");
          } catch (e) {
            console.error("Erro ao salvar admin inserido:", e);
          }
        }
        return list;
      }
    }
  } catch (error) {
    console.error("Erro ao ler banco de dados JSON, usando defaults:", error);
  }
  
  // Write defaults if database doesn't exist
  saveDatabase(DEFAULT_CLIENTS, globalSupportPhone);
  return DEFAULT_CLIENTS;
}

function saveDatabase(clients: ClientToken[], supportPhone: string) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ clients, supportPhone }, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao gravar banco de dados JSON:", error);
  }
}

// Preloaded engineering tables for "Programador Virtual" (Machining Assistant)
const ENGINEERING_TABLES = [
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
      ["M14", "2.00", "12.00", "Broca Ø 12.0 mm", "1.227"],
      ["M16", "2.00", "14.00", "Broca Ø 14.0 mm", "1.227"],
      ["M18", "2.50", "15.50", "Broca Ø 15.5 mm", "1.534"],
      ["M20", "2.50", "17.50", "Broca Ø 17.5 mm", "1.534"],
      ["M22", "2.50", "19.50", "Broca Ø 19.5 mm", "1.534"],
      ["M24", "3.00", "21.00", "Broca Ø 21.0 mm", "1.840"]
    ]
  },
  {
    nome: "Roscas Polegada Whitworth (BSW)",
    dados: [
      ["Diâmetro Nominal", "Fios por Polegada (FPP)", "Diâmetro Furo (mm)", "Broca Recomendada", "Passo Equivalente (mm)"],
      ["1/8\"", "40", "2.50", "Broca Ø 2.5 mm", "0.635"],
      ["5/32\"", "32", "3.20", "Broca Ø 3.2 mm", "0.794"],
      ["3/16\"", "24", "3.70", "Broca Ø 3.7 mm", "1.058"],
      ["1/4\"", "20", "5.10", "Broca Ø 5.1 mm", "1.270"],
      ["5/16\"", "18", "6.50", "Broca Ø 6.5 mm", "1.411"],
      ["3/8\"", "16", "7.90", "Broca Ø 7.9 mm", "1.587"],
      ["7/16\"", "14", "9.30", "Broca Ø 9.3 mm", "1.814"],
      ["1/2\"", "12", "10.50", "Broca Ø 10.5 mm", "2.116"],
      ["5/8\"", "11", "13.50", "Broca Ø 13.5 mm", "2.309"],
      ["3/4\"", "10", "16.50", "Broca Ø 16.5 mm", "2.540"],
      ["7/8\"", "9", "19.25", "Broca Ø 19.3 mm", "2.822"],
      ["1\"", "8", "22.00", "Broca Ø 22.0 mm", "3.175"]
    ]
  },
  {
    nome: "Velocidades de Corte e Avanços (Pastilha de Metal Duro)",
    dados: [
      ["Material", "Dureza Brinell", "Vc Desbaste (m/min)", "Vc Acabamento (m/min)", "Avanço f (mm/rot)", "Fluido Recomendado"],
      ["Aço Baixo Carbono (1020)", "125 HB", "180 - 250", "220 - 300", "0.15 - 0.35", "Óleo Solúvel / Emulsão"],
      ["Aço Médio Carbono (1045)", "180 HB", "140 - 200", "180 - 240", "0.12 - 0.30", "Óleo Solúvel / Emulsão"],
      ["Aço Liga (4140 / 8620)", "220 HB", "110 - 160", "140 - 190", "0.10 - 0.25", "Óleo Integral de Corte"],
      ["Aço Inox (AISI 304)", "175 HB", "90 - 140", "120 - 170", "0.08 - 0.20", "Óleo Solúvel Sintético"],
      ["Ferro Fundido Cinzento", "190 HB", "120 - 180", "150 - 220", "0.15 - 0.40", "Seco / Ar Comprimido"],
      ["Alumínio e Ligas", "75 HB", "300 - 800", "400 - 1200", "0.10 - 0.45", "Solúvel ou Querosene"],
      ["Latão e Cobre", "90 HB", "150 - 250", "200 - 350", "0.10 - 0.35", "Seco / Emulsão Leve"]
    ]
  },
  {
    nome: "Ciclos G e Códigos M - Torno CNC (Fanuc)",
    dados: [
      ["Código G/M", "Função Primária", "Exemplo de Sintaxe", "Descrição e Aplicação"],
      ["G00", "Posicionamento Rápido", "G00 X40.0 Z2.0;", "Movimento rápido sem usinagem até o ponto alvo."],
      ["G01", "Interpolação Linear", "G01 X50.0 Z-30.0 F0.2;", "Corte linear controlado com avanço F especificado."],
      ["G02", "Interpolação Circular Horária", "G02 X30.0 Z-5.0 R5.0 F0.12;", "Arco no sentido horário com raio R ou centros I/K."],
      ["G03", "Interpolação Circular Anti-Horária", "G03 X40.0 Z-10.0 R5.0 F0.12;", "Arco no sentido anti-horário com raio R."],
      ["G54", "Sistema de Coordenadas de Trabalho", "G54 G90;", "Ativa o zero-peça (referência de coordenadas cadastradas)."],
      ["G96", "Velocidade de Corte Constante (VCC)", "G96 S180 M03;", "Rotação varia de acordo com o diâmetro para manter Vc (S em m/min)."],
      ["G97", "Rotação Constante (RPM Direto)", "G97 S1200 M03;", "Fixa o RPM direto (S em RPM) independente do diâmetro."],
      ["G71", "Ciclo Automático de Desbaste", "G71 U2.0 R1.0;\nG71 P10 Q20 U0.4 W0.2 F0.25;", "Desbaste longitudinal automático camada por camada."],
      ["G75", "Ciclo de Canal / Faceamento", "G75 X20.0 Z-15.0 P1500 Q1000 F0.1;", "Executa ranhura ou corte pica-pau controlado."],
      ["G76", "Ciclo de Rosca Múltipla", "G76 P021060 Q100 R0.05;\nG76 X18.4 Z-25.0 P920 Q250 F1.5;", "Abre roscas cilíndricas ou cônicas em passes progressivos."],
      ["M03 / M04", "Rotação Horária / Anti-Horária", "M03 S1500;", "Liga a placa principal (M3 rosca normal, M4 rosca esquerda/瑞士)."],
      ["M05", "Parar Árvore", "M05;", "Desliga a placa do torno."],
      ["M08 / M09", "Refrigeração On / Off", "M08;", "Liga (M8) ou desliga (M9) a bomba de refrigerante."],
      ["M30", "Fim de Programa", "M30;", "Termina a execução do programa e reinicia o ponteiro de leitura."]
    ]
  }
];

// Helper to check and cleanup inactive sessions
function getActiveSessionCount(token: string): number {
  const sessions = activeSessions[token] || {};
  const now = Date.now();
  let count = 0;
  for (const id in sessions) {
    if (now - sessions[id] > SESSION_TIMEOUT_MS) {
      delete sessions[id];
    } else {
      count++;
    }
  }
  return count;
}

// ------------------------------------------
// API ENDPOINTS
// ------------------------------------------

// 1. CADASTRAR NOVO USUÁRIO (VERSÃO DEMO 30 DIAS)
app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ sucesso: false, msg: "Nome, e-mail e senha são obrigatórios." });
  }

  const clients = loadDatabase();
  const emailLower = email.trim().toLowerCase();

  // Verifica se e-mail já existe
  const isDevAdmin = emailLower === "millertadeu30@gmail.com";
  
  if (isDevAdmin) {
    // Permite re-cadastrar para resetar a senha ou nome
    const existingIdx = clients.findIndex(c => (c.email && c.email.trim().toLowerCase() === emailLower) || c.token === "CNC-MASTER-2026");
    if (existingIdx !== -1) {
      clients.splice(existingIdx, 1);
    }
  } else {
    const existingClient = clients.find(c => c.email && c.email.trim().toLowerCase() === emailLower);
    if (existingClient) {
      return res.status(400).json({ sucesso: false, msg: "Este e-mail já está cadastrado. Por favor, faça login." });
    }
  }

  // Gera data de expiração (30 dias a partir de hoje)
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);
  const expirationDateStr = expDate.toISOString().split("T")[0]; // Formato YYYY-MM-DD

  // Gera um token de acesso para compatibilidade retrógrada
  const generatedToken = isDevAdmin ? "CNC-MASTER-2026" : `CNC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const adminClient = clients.find(c => c.token === "CNC-MASTER-2026");
  const devSupportPhone = adminClient && adminClient.supportPhone ? adminClient.supportPhone : globalSupportPhone;

  const newClient: ClientToken = {
    name: name.trim(),
    email: emailLower,
    password: password.trim(),
    token: generatedToken,
    expirationDate: isDevAdmin ? null : expirationDateStr, // Vitalício se for o dono
    supportPhone: globalSupportPhone,
    subscriptionType: "demo",
    registrationDate: new Date().toISOString().split("T")[0]
  };

  clients.push(newClient);
  saveDatabase(clients, globalSupportPhone);

  res.json({
    sucesso: true,
    msg: "Cadastro realizado com sucesso! Seus 30 dias de teste grátis começaram.",
    clientName: newClient.name,
    token: newClient.token,
    supportPhone: devSupportPhone,
    subscriptionType: "demo",
    expirationDate: newClient.expirationDate,
    isAdmin: isDevAdmin
  });
});

// 2. VALIDAR LOGIN (E-MAIL + SENHA OU TOKEN)
app.post("/api/login", (req, res) => {
  const { token, email, password, sessionId } = req.body;

  const clients = loadDatabase();
  const adminClient = clients.find(c => c.token === "CNC-MASTER-2026");
  const devSupportPhone = adminClient && adminClient.supportPhone ? adminClient.supportPhone : globalSupportPhone;

  let matchedClient: ClientToken | undefined;

  if (email && password) {
    const emailLower = email.trim().toLowerCase();
    matchedClient = clients.find(c => c.email && c.email.trim().toLowerCase() === emailLower && c.password === password.trim());
    if (!matchedClient) {
      return res.status(401).json({ sucesso: false, msg: "E-mail ou Senha incorretos." });
    }
  } else if (token) {
    matchedClient = clients.find(c => c.token.trim() === token.trim());
    if (!matchedClient) {
      return res.status(401).json({ sucesso: false, msg: "Token de acesso incorreto ou não localizado." });
    }
  } else {
    return res.status(400).json({ sucesso: false, msg: "Por favor, digite seu e-mail e senha, ou use um Token de licença." });
  }

  const clientToken = matchedClient.token;
  const clientEmail = matchedClient.email || "";

  // Check Expiration Date
  let daysLeft: number | null = null;
  if (matchedClient.expirationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = matchedClient.expirationDate.split("-").map(Number);
    const expDate = new Date(year, month - 1, day, 23, 59, 59, 999);

    const diffTime = expDate.getTime() - today.getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (today > expDate) {
      const formattedDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      const mailContact = "millertadeu30@gmail.com";
      const phoneContact = devSupportPhone;
      return res.status(403).json({ 
        sucesso: false, 
        msg: `⚠️ <strong>Licença Expirada em ${formattedDate}</strong>.<br><br>Adquira um plano de acesso:<br>• <strong>Plano Mensal</strong>: R$ 11,90/mês<br>• <strong>Plano Semestral</strong>: R$ 49,90/semestre<br><br>Entre em contato com o desenvolvedor para renovar:<br>📧 E-mail: <strong>${mailContact}</strong><br>📞 WhatsApp: <strong>${phoneContact}</strong>` 
      });
    }
  }

  // Register session
  if (sessionId) {
    if (!activeSessions[clientToken]) {
      activeSessions[clientToken] = {};
    }
    activeSessions[clientToken][sessionId] = Date.now();
  }

  const totalActive = getActiveSessionCount(clientToken);
  const isAdminUser = clientEmail === "millertadeu30@gmail.com" || clientToken === "CNC-MASTER-2026";

  res.json({
    sucesso: true,
    msg: "Acesso Liberado!",
    clientName: matchedClient.name,
    token: clientToken,
    supportPhone: devSupportPhone,
    activeSessions: totalActive,
    subscriptionType: isAdminUser ? "vitalicio" : (matchedClient.subscriptionType || "demo"),
    expirationDate: isAdminUser ? null : matchedClient.expirationDate,
    daysLeft: isAdminUser ? null : daysLeft,
    isAdmin: isAdminUser
  });
});

// 2. KEEPALIVE / MANTER SESSÃO VIVA (MONITOR ANTIFRAUDE)
app.post("/api/keepalive", (req, res) => {
  const { token, sessionId } = req.body;
  if (!token || !sessionId) {
    return res.status(400).json({ sucesso: false, msg: "Parâmetros inválidos." });
  }

  const clients = loadDatabase();
  const matchedClient = clients.find(c => c.token === token);

  if (!matchedClient) {
    return res.status(404).json({ sucesso: false, msg: "Token não localizado." });
  }

  if (!activeSessions[token]) {
    activeSessions[token] = {};
  }
  activeSessions[token][sessionId] = Date.now();

  const count = getActiveSessionCount(token);
  res.json({ sucesso: true, activeSessions: count });
});

// 3. RETORNAR TABELAS DO PROGRAMADOR VIRTUAL
app.get("/api/tables", (req, res) => {
  res.json(ENGINEERING_TABLES);
});

// 4. ADMIN: LISTAR CLIENTES E SESSÕES ATIVAS
app.get("/api/admin/clients", (req, res) => {
  const clients = loadDatabase();
  const list = clients.map(c => {
    const activeCount = getActiveSessionCount(c.token);
    return {
      ...c,
      activeSessionsCount: activeCount,
      isOnline: activeCount > 0
    };
  });
  res.json({ clients: list, globalSupportPhone });
});

// 5. ADMIN: CRIAR OU ATUALIZAR CLIENTE
app.post("/api/admin/clients", (req, res) => {
  const { name, email, password, token, expirationDate, supportPhone, subscriptionType } = req.body;
  if (!name || !token) {
    return res.status(400).json({ sucesso: false, msg: "Nome e Token são obrigatórios." });
  }

  let clients = loadDatabase();
  const existingIdx = clients.findIndex(c => c.token === token);

  let clientData: ClientToken;

  if (existingIdx !== -1) {
    // Merge safely with existing client to avoid clearing credentials
    clients[existingIdx] = {
      ...clients[existingIdx],
      name,
      token,
      supportPhone: supportPhone || clients[existingIdx].supportPhone || globalSupportPhone,
      subscriptionType: subscriptionType || clients[existingIdx].subscriptionType || "demo",
      expirationDate: expirationDate !== undefined ? expirationDate : clients[existingIdx].expirationDate
    };
    if (email) clients[existingIdx].email = email;
    if (password) clients[existingIdx].password = password;
    clientData = clients[existingIdx];
  } else {
    clientData = {
      name,
      email: email || undefined,
      password: password || undefined,
      token,
      expirationDate: expirationDate || null,
      supportPhone: supportPhone || globalSupportPhone,
      subscriptionType: subscriptionType || "demo"
    };
    clients.push(clientData);
  }

  saveDatabase(clients, globalSupportPhone);
  res.json({ sucesso: true, msg: "Token gravado com sucesso!", client: clientData });
});

// 6. ADMIN: EXCLUIR CLIENTE
app.delete("/api/admin/clients/:token", (req, res) => {
  const tokenToDelete = req.params.token;
  let clients = loadDatabase();
  const initialLength = clients.length;
  clients = clients.filter(c => c.token !== tokenToDelete);

  if (clients.length === initialLength) {
    return res.status(404).json({ sucesso: false, msg: "Token não localizado." });
  }

  // Cleanup active session
  delete activeSessions[tokenToDelete];

  saveDatabase(clients, globalSupportPhone);
  res.json({ sucesso: true, msg: "Token excluído com sucesso!" });
});

// 7. ADMIN: ATUALIZAR TELEFONE DE SUPORTE GLOBAL
app.post("/api/admin/support", (req, res) => {
  const { supportPhone } = req.body;
  if (!supportPhone) {
    return res.status(400).json({ sucesso: false, msg: "Telefone é obrigatório." });
  }

  globalSupportPhone = supportPhone;
  const clients = loadDatabase();
  saveDatabase(clients, globalSupportPhone);
  res.json({ sucesso: true, msg: "Telefone de suporte global atualizado!", supportPhone: globalSupportPhone });
});

// 8. ADMIN: RESETAR SESSÕES ATIVAS
app.post("/api/admin/reset-sessions", (req, res) => {
  activeSessions = {};
  res.json({ sucesso: true, msg: "Sessões ativas limpas com sucesso!" });
});

// 9. IA COPILOT: CHAT COM REFERÊNCIA DE MANUAIS E G-CODE
app.post("/api/gemini/chat", async (req, res) => {
  const { message, documentContext, activeGCode } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(200).json({
      sucesso: false,
      msg: "A chave de API do Gemini (GEMINI_API_KEY) não está configurada nos Secrets do AI Studio.",
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemInstruction = `Você é o CNC-Master IA, o assistente virtual definitivo especializado em programação de tornos CNC e usinagem mecânica industrial, estritamente alinhado ao material didático do SENAI.
Sua missão é ajudar o operador a criar códigos G e M corretos, decodificar os ciclos Fanuc/Siemens ISO, tirar dúvidas trigonométricas e sugerir parâmetros.

Padrões SENAI de Programação CNC (Sua Referência Principal):
- Cabeçalho padrão: N10 G21 G40 G90 G95 (Em Siemens, iniciar com N10 G291).
- G71 (Desbaste longitudinal): G71 U(passe raio) R(recuo); G71 P(início) Q(fim) U(sobremetal X diâmetro) W(sobremetal Z) F(avanço)
- G72 (Desbaste transversal): G72 W(passe Z) R(recuo); G72 P Q U W F
- G73 (Desbaste paralelo ao perfil): G73 U(remoção X raio) W(rem. Z) R(passes); G73 P Q U W F
- G70 (Acabamento): G70 P Q F (O G70 ativa compensação de raio automaticamente).
- G75 (Canais/Faceamento): G75 R(recuo); G75 X Z P(inc. X microns) Q(inc. Z/canais microns) F
- G74 (Furação): G74 R(recuo); G74 Z Q(inc. furação microns) F
- G83 (Furação profunda): G83 Z Q(inc. microns) (P_ permanência ms) (R_ plano ref) F
- G84 (Macho rígido): M29 (ativa macho rígido); G84 Z F(passo)
- G85 (Mandrilamento): G85 Z F
- G78 (Roscamento semi-auto): G78 X Z (R conicidade) F(passo)
- G33 (Roscamento simples): G33 X Z Q(ângulo entrada) R(conicidade) F(passo)
- G76 (Roscamento auto): G76 P(rep. acab)(saída)(ângulo) Q(prof. min microns) R(acabamento); G76 X Z R(cone) P(alt. filete microns) Q(prof. 1º passe microns) F(passo)
  - Cálculo Rosca (Métrica): Altura P = 0.65 * passo. Profundidade 1º passe Q = P / sqrt(nº passes). 
  - Cálculo Rosca (Polegada): mm = pol * 25.4. Passo = 25.4 / fpp. Altura P = 0.65 * passo.

Compensação de Raio:
- G40 (Cancela), G41 (Esquerda), G42 (Direita). O 1º deslocamento deve ser maior que o raio do inserto.

Aqui está o contexto do manual de referência que o usuário selecionou:
"${documentContext || "Nenhum manual específico selecionado. Responda com base no conhecimento Fanuc/Romi padrão."}"

Aqui está o código G-code atual na tela de programação ativa:
\`\`\`gcode
${activeGCode || "Nenhum programa ativo na tela no momento."}
\`\`\`

Dê respostas extremamente claras, amigáveis, técnicas e focadas na prática da oficina mecânica. Use listas, tópicos e formatações em negrito para facilitar a leitura rápida na tela do torno CNC. Escreva suas respostas em português do Brasil, adotando rigorosamente as convenções do SENAI apresentadas acima.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    res.json({
      sucesso: true,
      text: response.text || "Sem resposta da IA.",
    });
  } catch (error: any) {
    console.error("Erro na chamada do Gemini API:", error);
    res.status(200).json({
      sucesso: false,
      msg: error.message || "Erro desconhecido ao chamar a API do Gemini.",
    });
  }
});


// ------------------------------------------
// VITE DEV SERVER OR STATIC SERVING IN PRODUCTION
// ------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MASTER CNC] Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
