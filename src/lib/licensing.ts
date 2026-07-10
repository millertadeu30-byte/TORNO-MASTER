import { ClientToken } from "../types";
import { fetchLicensingFromCloud, saveLicensingToCloud } from "./firebase";

const LOCAL_STORAGE_KEY = "cnc_master_clients_db";
const SUPPORT_PHONE_KEY = "cnc_master_support_phone";

const DEFAULT_CLIENTS: ClientToken[] = [
  { name: "Suporte Técnico (Admin)", token: "8619", expirationDate: "2030-12-31", supportPhone: "17982129547", subscriptionType: "semestral" },
  { name: "Licença Demonstração", email: "demo@demo.com", password: "demo", token: "CNC-TRIAL-FREE", expirationDate: "2026-10-30", supportPhone: "(18) 99999-8888", subscriptionType: "demo" },
  { name: "Cliente Licença Expirada", email: "expirado@demo.com", password: "demo", token: "CNC-EXPIRADO", expirationDate: "2025-01-01", supportPhone: "(18) 99999-7777", subscriptionType: "demo" },
  { name: "Acesso Vitalício", email: "vitalicio@demo.com", password: "demo", token: "CNC-LIFETIME", expirationDate: null, supportPhone: "(18) 99999-6666", subscriptionType: "semestral" }
];

const DEFAULT_SUPPORT_PHONE = "(17) 98212-9547";

export function getClients(): ClientToken[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      let parsed = JSON.parse(data) as ClientToken[];
      
      // Migrate any old "CNC-MASTER-2026" to "8619" for the admin user
      let migrated = false;
      parsed = parsed.map(c => {
        if (c.token === "CNC-MASTER-2026") {
          migrated = true;
          return { ...c, token: "8619", name: "Suporte Técnico (Admin)" };
        }
        return c;
      });

      const hasAdmin = parsed.some(c => c.token === "8619" || c.name.toLowerCase().includes("suporte") || c.name.toLowerCase().includes("miller"));
      if (!hasAdmin) {
        parsed.push({
          name: "Suporte Técnico (Admin)",
          token: "8619",
          expirationDate: "2030-12-31",
          supportPhone: "17982129547",
          subscriptionType: "semestral"
        });
        migrated = true;
      }
      
      if (migrated) {
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
    
    // Salva no Firestore em nuvem para que fique disponível em qualquer navegador e dispositivo!
    saveLicensingToCloud(clients, getGlobalSupportPhone())
      .catch(err => console.error("Erro ao salvar no Firestore:", err));

    // Sincroniza também com o servidor local de forma assíncrona (como fallback secundário)
    fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clients)
    }).catch(err => console.error("Erro ao sincronizar clientes com o servidor local:", err));
  } catch (e) {
    console.error("Erro ao salvar clientes no localStorage", e);
  }
}

export function getGlobalSupportPhone(): string {
  try {
    const clients = getClients();
    const adminClient = clients.find(c => 
      c.token === "8619" || 
      c.name.toLowerCase().includes("suporte") || 
      c.name.toLowerCase().includes("miller") || 
      c.name.toLowerCase().includes("administrador")
    );
    if (adminClient && adminClient.supportPhone) {
      const phone = adminClient.supportPhone;
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length === 11) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
      } else if (cleaned.length === 10) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
      }
      return phone;
    }
  } catch (e) {
    console.error("Erro ao buscar número do ADM no banco de dados:", e);
  }

  const saved = localStorage.getItem(SUPPORT_PHONE_KEY);
  if (saved) {
    const cleaned = saved.replace(/\D/g, "");
    if (cleaned.length === 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
    } else if (cleaned.length === 10) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
    }
    return saved;
  }

  return DEFAULT_SUPPORT_PHONE;
}

export function saveGlobalSupportPhone(phone: string) {
  localStorage.setItem(SUPPORT_PHONE_KEY, phone);
  
  // Salva no Firestore em nuvem
  saveLicensingToCloud(getClients(), phone)
    .catch(err => console.error("Erro ao salvar no Firestore:", err));

  // Sincroniza também com o servidor local de forma assíncrona (como fallback secundário)
  fetch("/api/support-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supportPhone: phone })
  }).catch(err => console.error("Erro ao sincronizar telefone de suporte com o servidor local:", err));
}

export async function syncLicensingWithServer(): Promise<boolean> {
  let success = false;
  
  // 1. Prioridade máxima: Buscar do Firebase Firestore (Nuvem Persistente Global)
  try {
    const cloudData = await fetchLicensingFromCloud();
    if (cloudData) {
      if (Array.isArray(cloudData.clients) && cloudData.clients.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudData.clients));
        success = true;
      }
      if (cloudData.supportPhone) {
        localStorage.setItem(SUPPORT_PHONE_KEY, cloudData.supportPhone);
      }
      console.log("Sincronização bem-sucedida via Firebase Firestore!");
    } else {
      // Se não houver dados no Firestore (ex: primeira execução), inicializa a nuvem com os dados locais
      const localClients = getClients();
      const localSupport = getGlobalSupportPhone();
      await saveLicensingToCloud(localClients, localSupport);
      console.log("Firestore inicializado com dados locais padrão.");
    }
  } catch (err) {
    console.error("Erro ao sincronizar com Firebase Firestore:", err);
  }

  // 2. Fallback: Sincroniza também com a API local
  try {
    const res = await fetch("/api/clients");
    if (res.ok) {
      const serverClients = await res.json();
      if (Array.isArray(serverClients) && serverClients.length > 0 && !success) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverClients));
        success = true;
      }
    }
  } catch (err) {
    console.error("Erro ao carregar clientes do servidor local:", err);
  }

  try {
    const res = await fetch("/api/support-phone");
    if (res.ok) {
      const data = await res.json();
      if (data.supportPhone && !localStorage.getItem(SUPPORT_PHONE_KEY)) {
        localStorage.setItem(SUPPORT_PHONE_KEY, data.supportPhone);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar telefone de suporte do servidor local:", err);
  }

  return success;
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

export function localRegister(name: string, email: string, phone: string): AuthResponse {
  const clients = getClients();
  const emailLower = email.trim().toLowerCase();
  const isDevAdmin = emailLower === "millertadeu30@gmail.com";

  if (isDevAdmin) {
    // Re-register reset
    const idx = clients.findIndex(c => (c.email && c.email.trim().toLowerCase() === emailLower) || c.token === "8619" || c.token === "CNC-MASTER-2026");
    if (idx !== -1) {
      clients.splice(idx, 1);
    }
  } else {
    const existing = clients.find(c => c.email && c.email.trim().toLowerCase() === emailLower);
    if (existing) {
      return { 
        sucesso: false, 
        msg: `O e-mail <strong>${emailLower}</strong> já está cadastrado com o código de acesso <strong>${existing.token}</strong>. Se você esqueceu, entre em contato.` 
      };
    }
  }

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);
  const expirationDateStr = expDate.toISOString().split("T")[0];

  // Generate a random 5-digit numerical code/password
  const generatedToken = isDevAdmin ? "8619" : Math.floor(10000 + Math.random() * 90000).toString();
  const supportPhone = getGlobalSupportPhone();

  const newClient: ClientToken = {
    name: name.trim(),
    email: emailLower,
    phone: phone.trim(),
    password: generatedToken,
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
    msg: "Cadastro realizado com sucesso!",
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
    matched = clients.find(c => 
      c.token.trim() === token.trim() || 
      (c.password && c.password.trim() === token.trim())
    );
    if (!matched) {
      return { sucesso: false, msg: "Senha ou Token de acesso incorreto ou não localizado." };
    }
  } else {
    return { sucesso: false, msg: "Por favor, digite sua senha ou use seu Token de licença." };
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

  const isAdminUser = 
    clientEmail === "millertadeu30@gmail.com" || 
    clientToken === "CNC-MASTER-2026" || 
    clientToken === "8619" ||
    matched.name.toLowerCase().includes("suporte") ||
    matched.name.toLowerCase().includes("administrador") ||
    matched.name.toLowerCase().includes("miller");

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

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "server-id";
  }
  let deviceId = localStorage.getItem("cnc_device_id");
  if (!deviceId) {
    deviceId = "DEV_" + Math.random().toString(36).substring(2, 12).toUpperCase();
    localStorage.setItem("cnc_device_id", deviceId);
  }
  return deviceId;
}

export async function registerSessionHeartbeat(
  token: string,
  sessionId: string,
  deviceId: string
): Promise<{ success: boolean; activeDevices: number; blocked: boolean }> {
  if (!token) return { success: false, activeDevices: 0, blocked: false };
  try {
    const cloudData = await fetchLicensingFromCloud();
    let currentClients = cloudData ? cloudData.clients : getClients();
    const now = Date.now();
    let updated = false;
    let isBlocked = false;
    let totalActiveDevices = 0;

    currentClients = currentClients.map(client => {
      if (client.token.trim() === token.trim()) {
        let sessions = client.sessions || [];
        // Keep only active sessions from the last 2 minutes (120,000ms)
        sessions = sessions.filter(s => (now - s.lastActive) < 120000);

        // Get unique devices currently active (excluding the current session if it doesn't exist yet)
        const activeDevices = Array.from(new Set(sessions.map(s => s.deviceId)));
        
        // Find if this specific session is already registered
        const sessionIdx = sessions.findIndex(s => s.sessionId === sessionId);
        
        // If this is a new session/tab
        if (sessionIdx === -1) {
          // Check if the device is already in the list of active devices
          const isDeviceActive = activeDevices.includes(deviceId);
          
          // If the device is NOT active, and we already reached the limit of 3 distinct active devices
          if (!isDeviceActive && activeDevices.length >= 3) {
            isBlocked = true;
          } else {
            sessions.push({ sessionId, deviceId, lastActive: now });
            if (!isDeviceActive) {
              activeDevices.push(deviceId);
            }
          }
        } else {
          // If already registered, update its heartbeat
          sessions[sessionIdx].lastActive = now;
          // Ensure it has the deviceId associated with it
          sessions[sessionIdx].deviceId = deviceId;
        }

        if (!isBlocked) {
          client.sessions = sessions;
          client.activeSessionsCount = activeDevices.length; // Record active devices as active count!
          client.isOnline = activeDevices.length > 0;
          totalActiveDevices = activeDevices.length;
          updated = true;
        } else {
          totalActiveDevices = activeDevices.length;
        }
      }
      return client;
    });

    if (updated && !isBlocked) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentClients));
      await saveLicensingToCloud(currentClients, getGlobalSupportPhone());
    }

    return {
      success: !isBlocked,
      activeDevices: totalActiveDevices,
      blocked: isBlocked
    };
  } catch (err) {
    console.error("Erro no heartbeat da sessão:", err);
    return { success: true, activeDevices: 1, blocked: false };
  }
}

export async function clearAllSessions(): Promise<void> {
  try {
    const cloudData = await fetchLicensingFromCloud();
    let currentClients = cloudData ? cloudData.clients : getClients();

    currentClients = currentClients.map(client => {
      client.sessions = [];
      client.activeSessionsCount = 0;
      client.isOnline = false;
      return client;
    });

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentClients));
    await saveLicensingToCloud(currentClients, getGlobalSupportPhone());
  } catch (err) {
    console.error("Erro ao resetar todas as sessões:", err);
  }
}
