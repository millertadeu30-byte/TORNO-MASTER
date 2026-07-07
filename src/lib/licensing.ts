import { ClientToken } from "../types";

const LOCAL_STORAGE_KEY = "cnc_master_clients_db";
const SUPPORT_PHONE_KEY = "cnc_master_support_phone";

const DEFAULT_CLIENTS: ClientToken[] = [
  { name: "Suporte Técnico", token: "CNC-MASTER-2026", expirationDate: "2030-12-31", supportPhone: "(18) 99999-9999", subscriptionType: "semestral" },
  { name: "Licença Demonstração", email: "demo@demo.com", password: "demo", token: "CNC-TRIAL-FREE", expirationDate: "2026-10-30", supportPhone: "(18) 99999-8888", subscriptionType: "demo" },
  { name: "Cliente Licença Expirada", email: "expirado@demo.com", password: "demo", token: "CNC-EXPIRADO", expirationDate: "2025-01-01", supportPhone: "(18) 99999-7777", subscriptionType: "demo" },
  { name: "Acesso Vitalício", email: "vitalicio@demo.com", password: "demo", token: "CNC-LIFETIME", expirationDate: null, supportPhone: "(18) 99999-6666", subscriptionType: "semestral" }
];

const DEFAULT_SUPPORT_PHONE = "(18) 99999-5555";

export function getClients(): ClientToken[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data) as ClientToken[];
      // Guarantee admin is always there
      const hasAdmin = parsed.some(c => c.token === "CNC-MASTER-2026");
      if (!hasAdmin) {
        parsed.push({
          name: "Suporte Técnico",
          token: "CNC-MASTER-2026",
          expirationDate: "2030-12-31",
          supportPhone: "(18) 99999-9999",
          subscriptionType: "semestral"
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {
    console.error("Erro ao carregar clientes do localStorage", e);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_CLIENTS));
  return DEFAULT_CLIENTS;
}

export function saveClients(clients: ClientToken[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clients));
  } catch (e) {
    console.error("Erro ao salvar clientes no localStorage", e);
  }
}

export function getGlobalSupportPhone(): string {
  return localStorage.getItem(SUPPORT_PHONE_KEY) || DEFAULT_SUPPORT_PHONE;
}

export function saveGlobalSupportPhone(phone: string) {
  localStorage.setItem(SUPPORT_PHONE_KEY, phone);
}

export interface AuthResponse {
  sucesso: boolean;
  msg: string;
  clientName?: string;
  token?: string;
  supportPhone?: string;
  subscriptionType?: "demo" | "mensal" | "semestral" | "vitalicio";
  expirationDate?: string | null;
  daysLeft?: number | null;
  isAdmin?: boolean;
}

export function localRegister(name: string, email: string, password: string): AuthResponse {
  const clients = getClients();
  const emailLower = email.trim().toLowerCase();
  const isDevAdmin = emailLower === "millertadeu30@gmail.com";

  if (isDevAdmin) {
    // Re-register reset
    const idx = clients.findIndex(c => (c.email && c.email.trim().toLowerCase() === emailLower) || c.token === "CNC-MASTER-2026");
    if (idx !== -1) {
      clients.splice(idx, 1);
    }
  } else {
    const existing = clients.find(c => c.email && c.email.trim().toLowerCase() === emailLower);
    if (existing) {
      return { sucesso: false, msg: "Este e-mail já está cadastrado. Por favor, faça login." };
    }
  }

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);
  const expirationDateStr = expDate.toISOString().split("T")[0];

  const generatedToken = isDevAdmin ? "CNC-MASTER-2026" : `CNC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const supportPhone = getGlobalSupportPhone();

  const newClient: ClientToken = {
    name: name.trim(),
    email: emailLower,
    password: password.trim(),
    token: generatedToken,
    expirationDate: isDevAdmin ? null : expirationDateStr,
    supportPhone: supportPhone,
    subscriptionType: "demo",
    registrationDate: new Date().toISOString().split("T")[0]
  };

  clients.push(newClient);
  saveClients(clients);

  return {
    sucesso: true,
    msg: "Cadastro realizado com sucesso! Seus 30 dias de teste grátis começaram.",
    clientName: newClient.name,
    token: newClient.token,
    supportPhone: newClient.supportPhone,
    subscriptionType: "demo",
    expirationDate: newClient.expirationDate,
    isAdmin: isDevAdmin,
    daysLeft: isDevAdmin ? null : 30
  };
}

export function localLogin(token?: string, email?: string, password?: string): AuthResponse {
  const clients = getClients();
  const supportPhone = getGlobalSupportPhone();

  let matched: ClientToken | undefined;

  if (email && password) {
    const emailLower = email.trim().toLowerCase();
    matched = clients.find(c => c.email && c.email.trim().toLowerCase() === emailLower && c.password === password.trim());
    if (!matched) {
      return { sucesso: false, msg: "E-mail ou Senha incorretos." };
    }
  } else if (token) {
    matched = clients.find(c => c.token.trim() === token.trim());
    if (!matched) {
      return { sucesso: false, msg: "Token de acesso incorreto ou não localizado." };
    }
  } else {
    return { sucesso: false, msg: "Por favor, digite seu e-mail e senha, ou use um Token de licença." };
  }

  const clientToken = matched.token;
  const clientEmail = matched.email || "";

  let daysLeft: number | null = null;
  if (matched.expirationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = matched.expirationDate.split("-").map(Number);
    const expDate = new Date(year, month - 1, day, 23, 59, 59, 999);

    const diffTime = expDate.getTime() - today.getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (today > expDate) {
      const formattedDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      const mailContact = "millertadeu30@gmail.com";
      return {
        sucesso: false,
        msg: `⚠️ <strong>Licença Expirada em ${formattedDate}</strong>.<br><br>Adquira um plano de acesso:<br>• <strong>Plano Mensal</strong>: R$ 11,90/mês<br>• <strong>Plano Semestral</strong>: R$ 49,90/semestre<br><br>Entre em contato com o desenvolvedor para renovar:<br>📧 E-mail: <strong>${mailContact}</strong><br>📞 WhatsApp: <strong>${supportPhone}</strong>`
      };
    }
  }

  const isAdminUser = clientEmail === "millertadeu30@gmail.com" || clientToken === "CNC-MASTER-2026";

  return {
    sucesso: true,
    msg: "Acesso Liberado!",
    clientName: matched.name,
    token: clientToken,
    supportPhone: matched.supportPhone || supportPhone,
    subscriptionType: isAdminUser ? "vitalicio" : (matched.subscriptionType || "demo"),
    expirationDate: isAdminUser ? null : matched.expirationDate,
    daysLeft: isAdminUser ? null : daysLeft,
    isAdmin: isAdminUser
  };
}
