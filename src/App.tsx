import React, { useState, useEffect, useRef } from "react";
import {
  FilePlus, 
  Wrench, 
  Cpu, 
  Database, 
  Save, 
  FolderOpen, 
  HelpCircle, 
  Phone, 
  ShieldAlert, 
  User, 
  Lock, 
  ArrowRight,
  Sparkles,
  LayoutGrid,
  Lightbulb,
  ChevronDown,
  List,
  Eye,
  EyeOff,
  Tv, X,
  Monitor,
  Hexagon,
  Calculator,
  RotateCw,
  AlertTriangle,
  Mail,
  UserPlus,
  LogOut,
  Trash2,
  Maximize2,
  Minimize2,
  Copy,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CNCEditor } from "./components/CNCEditor";
import { CNCSimulator } from "./components/CNCSimulator";
import { MachiningAssistant } from "./components/MachiningAssistant";
import FloatingCalculator from "./components/FloatingCalculator";
import { AdminPanel } from "./components/AdminPanel";
import { PolygonCalculator } from "./components/PolygonCalculator";
import { RPMCalculator } from "./components/RPMCalculator";
import { FeedCalculator } from "./components/FeedCalculator";
import { ThreadCalculator } from "./components/ThreadCalculator";
import { DrillingCalculator } from "./components/DrillingCalculator";
import { FloatingWindow } from "./components/FloatingWindow";
import { CNC_TEMPLATES } from "./data/templates";
import { localLogin, localRegister, syncLicensingWithServer, getGlobalSupportPhone, registerSessionHeartbeat, getOrCreateDeviceId } from "./lib/licensing";

// Generate a random session ID on app load to track active devices (antifraud tracking)
const SESSION_ID = Math.random().toString(36).substring(2, 10).toUpperCase();

export default function App() {
  // Auth State
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [regName, setRegName] = useState<string>("");
  const [regEmail, setRegEmail] = useState<string>("");
  const [regPhone, setRegPhone] = useState<string>("");
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  
  const [tokenInput, setTokenInput] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginMethod, setLoginMethod] = useState<"token" | "email">("token");
  const [copied, setCopied] = useState<boolean>(false);
  const [token, setToken] = useState<string>(() => localStorage.getItem("cnc_token") || "");
  const [clientName, setClientName] = useState<string>(() => localStorage.getItem("cnc_clientName") || "");
  const [supportPhone, setSupportPhone] = useState<string>(() => getGlobalSupportPhone());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem("cnc_isAuthenticated") === "true");
  const [loginError, setLoginError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  
  const [daysLeft, setDaysLeft] = useState<number | null>(() => {
    const val = localStorage.getItem("cnc_daysLeft");
    return val ? parseInt(val, 10) : null;
  });
  const [subscriptionType, setSubscriptionType] = useState<string>(() => localStorage.getItem("cnc_subscriptionType") || "demo");
  const [isAdmin, setIsAdmin] = useState<boolean>(() => localStorage.getItem("cnc_isAdmin") === "true");

  // Keep localStorage updated with auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("cnc_token", token);
      localStorage.setItem("cnc_clientName", clientName);
      localStorage.setItem("cnc_supportPhone", supportPhone);
      localStorage.setItem("cnc_subscriptionType", subscriptionType);
      localStorage.setItem("cnc_daysLeft", daysLeft !== null ? String(daysLeft) : "");
      localStorage.setItem("cnc_isAdmin", isAdmin ? "true" : "false");
      localStorage.setItem("cnc_isAuthenticated", "true");
    } else {
      localStorage.removeItem("cnc_token");
      localStorage.removeItem("cnc_clientName");
      localStorage.removeItem("cnc_supportPhone");
      localStorage.removeItem("cnc_subscriptionType");
      localStorage.removeItem("cnc_daysLeft");
      localStorage.removeItem("cnc_isAdmin");
      localStorage.removeItem("cnc_isAuthenticated");
    }
  }, [isAuthenticated, token, clientName, supportPhone, subscriptionType, daysLeft, isAdmin]);

  // Monitor online status & antifraud
  const [onlineSessionCount, setOnlineSessionCount] = useState<number>(1);
  const [hasFraudWarning, setHasFraudWarning] = useState<boolean>(false);
  const [isBlockedByDeviceLimit, setIsBlockedByDeviceLimit] = useState<boolean>(false);

  // Editors & Workspace Layout State
  const [layoutCount, setLayoutCount] = useState<number>(1); // 1, 2, or 3 panes
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  const [activePaneIdx, setActivePaneIdx] = useState<number>(0);
  const [editorTexts, setEditorTexts] = useState<string[]>(() => {
    const saved = localStorage.getItem("cnc_autoSaveTexts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed;
        }
      } catch (e) {
        // Fallback
      }
    }
    return [
      CNC_TEMPLATES[0].code, // Eixo Completo G71/G75/G76
      CNC_TEMPLATES[2].code, // Desbaste Interno Boring G71
      CNC_TEMPLATES[4].code, // Rosca G76 M30x2.0
    ];
  });
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isAutoSaveActive, setIsAutoSaveActive] = useState<boolean>(() => {
    return localStorage.getItem("cnc_autoSaveActive") === "true";
  });
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>("");

  // Modals
  const [showAssistant, setShowAssistant] = useState<boolean>(false);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showPolygonCalc, setShowPolygonCalc] = useState<boolean>(false);
  const [showRpmCalc, setShowRpmCalc] = useState<boolean>(false);
  const [showFeedCalc, setShowFeedCalc] = useState<boolean>(false);
  const [showThreadCalc, setShowThreadCalc] = useState<boolean>(false);
  const [showDrillingCalc, setShowDrillingCalc] = useState<boolean>(false);
  const [isFloatingCalcOpen, setIsFloatingCalcOpen] = useState<boolean>(false);

  // Floating Window management states
  const [activeWindowId, setActiveWindowId] = useState<string>("");
  const [showRibbon, setShowRibbon] = useState<boolean>(true);

  // Floating TV Simulator Layout States
  const [simMode, setSimMode] = useState<"tv" | "fixed" | "off">("tv");
  const [showLibraries, setShowLibraries] = useState<boolean>(false);
  const [hasTut, setHasTut] = useState<boolean>(false);
  const [fileNames, setFileNames] = useState<string[]>(["", "", ""]);
  const [simPos, setSimPos] = useState({ x: 700, y: 140 });
  const [isDraggingSim, setIsDraggingSim] = useState<boolean>(false);
  const [isSimMaximized, setIsSimMaximized] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sincronizar licenças com o banco de dados do servidor ao abrir o app
  useEffect(() => {
    syncLicensingWithServer().catch(err => {
      console.error("Erro na sincronização inicial das licenças:", err);
    });
  }, []);

  // Enviar heartbeat periódico da sessão para o Firestore (controle antifraude e visualização de quem está online)
  useEffect(() => {
    if (!token) return;

    const deviceId = getOrCreateDeviceId();

    const checkHeartbeat = async () => {
      try {
        const result = await registerSessionHeartbeat(token, SESSION_ID, deviceId);
        if (result.blocked) {
          setIsBlockedByDeviceLimit(true);
        } else {
          setIsBlockedByDeviceLimit(false);
          setOnlineSessionCount(result.activeDevices);
          setHasFraudWarning(result.activeDevices > 1);
        }
      } catch (err) {
        console.error("Erro no heartbeat:", err);
      }
    };

    // Executa imediatamente na inicialização/login
    checkHeartbeat();

    // E depois a cada 30 segundos
    const interval = setInterval(checkHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [token]);

  // Initial positioning from viewport dimensions
  useEffect(() => {
    if (typeof window !== "undefined") {
      const initialX = Math.max(30, window.innerWidth - 540);
      setSimPos({ x: initialX, y: 130 });
    }
  }, []);

  const handleSimPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".sim-drag-handle")) {
      setIsDraggingSim(true);
      dragStartRef.current = { x: e.clientX - simPos.x, y: e.clientY - simPos.y };
      target.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const handleSimPointerMove = (e: React.PointerEvent) => {
    if (isDraggingSim) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      const boundX = Math.max(10, Math.min(window.innerWidth - 200, newX));
      const boundY = Math.max(40, Math.min(window.innerHeight - 200, newY));
      setSimPos({ x: boundX, y: boundY });
    }
  };

  const handleSimPointerUp = (e: React.PointerEvent) => {
    if (isDraggingSim) {
      setIsDraggingSim(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // Canvas State Passed from Toolbar
  const [simInvertZ, setSimInvertZ] = useState<boolean>(false);
  const [isDriverActive, setIsDriverActive] = useState<boolean>(false);

  // Contextual Tutorial Tooltip State
  const [tutTitle, setTutTitle] = useState<string>("");
  const [tutBody, setTutBody] = useState<string>("");
  const [showTut, setShowTut] = useState<boolean>(false);

  // File IO
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse active line G-code to update context tooltips
  const analyzeActiveLine = (lineIdx: number) => {
    setActiveLine(lineIdx);
    const activeCode = editorTexts[activePaneIdx];
    const lines = activeCode.split("\n");
    const lineText = lines[lineIdx]?.trim().toUpperCase() || "";

    if (lineText.startsWith("G71")) {
      setTutTitle("📌 Ciclo G71 - Desbaste Longitudinal");
      setTutBody(
        "Sintaxe de duas linhas:\n" +
        "• G71 U(Profundidade de corte por passe) R(Distância de recuo)\n" +
        "• G71 P(Bloco inicial) Q(Bloco final) U(Sobramedia X) W(Sobramedia Z) F(Avanço)\n\n" +
        "⚠️ ATENÇÃO: Para usinagem interna (Furos), a profundidade U na primeira linha DEVE ser negativa (ex: U-1.5) para expandir o diâmetro!"
      );
      setHasTut(true);
    } else if (lineText.startsWith("G74")) {
      setTutTitle("📌 Ciclo G74 - Furação / Canal Facial (Quebra de Cavaco)");
      setTutBody(
        "Sintaxe:\n" +
        "• G74 R(Recuo rápido de alívio)\n" +
        "• G74 X(Diâmetro final) Z(Profundidade final) P(Passo corte em X em mícrons) Q(Profundidade picada em Z em mícrons) F(Avanço)\n\n" +
        "💡 Dica: Para furação simples na linha de centro (X0), use apenas G74 Z... Q... F... com recuo R na primeira linha!"
      );
      setHasTut(true);
    } else if (lineText.startsWith("G75")) {
      setTutTitle("📌 Ciclo G75 - Canal / Canaleta / Furação");
      setTutBody(
        "Sintaxe:\n" +
        "• G75 R(Recuo rápido)\n" +
        "• G75 X(Diâmetro final) Z(Comprimento final) P(Passo corte em X em microns) Q(Avanço lateral em Z) F(Avanço)\n\n" +
        "💡 Dica: No Fanuc de 1 linha, faça G75 X... Z... P... Q... R... (Mergulho direto com recuo R)."
      );
      setHasTut(true);
    } else if (lineText.startsWith("G76")) {
      setTutTitle("📌 Ciclo G76 - Rosca Múltipla");
      setTutBody(
        "Sintaxe de duas linhas:\n" +
        "• G76 P(Repetições/Chanfro/Ângulo filete) Q(Profundidade mínima) R(Passe de acabamento)\n" +
        "• G76 X(Diâmetro fundo da rosca) Z(Fim do filete) P(Altura do filete em microns) Q(Profundidade do 1º corte) F(Passo da Rosca)"
      );
      setHasTut(true);
    } else {
      setHasTut(false);
      setShowTut(false);
    }
  };

  // Perform local login (Email/Password or Token)
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setLoginError("");

    let res;
    if (loginMethod === "token") {
      if (!tokenInput.trim()) {
        setLoginError("Por favor, digite seu token ou senha de acesso.");
        setLoading(false);
        return;
      }
      res = localLogin(tokenInput.trim());
    } else {
      if (!loginEmail.trim() || !loginPassword.trim()) {
        setLoginError("E-mail e senha são obrigatórios.");
        setLoading(false);
        return;
      }
      res = localLogin(undefined, loginEmail.trim(), loginPassword.trim());
    }

    setLoading(false);
    if (res.sucesso) {
      setToken(res.token || "");
      setClientName(res.clientName || "");
      setSupportPhone(res.supportPhone || "");
      setSubscriptionType(res.subscriptionType || "demo");
      setDaysLeft(res.daysLeft !== undefined ? res.daysLeft : null);
      setIsAdmin(res.isAdmin || false);
      setIsAuthenticated(true);
      setOnlineSessionCount(1);
    } else {
      setLoginError(res.msg);
    }
  };

  // Perform local user registration
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPhone.trim()) {
      setLoginError("Por favor, preencha todos os campos do cadastro.");
      return;
    }

    setLoading(true);
    setLoginError("");

    const res = localRegister(regName.trim(), regEmail.trim(), regPhone.trim());

    setLoading(false);
    if (res.sucesso) {
      // Store generated details to show success modal
      setRegisteredCode(res.token || "");
      setRegisteredEmail(regEmail.trim());

      // Prepare login states
      setToken(res.token || "");
      setClientName(res.clientName || "");
      setSupportPhone(res.supportPhone || "");
      setSubscriptionType(res.subscriptionType || "demo");
      setDaysLeft(res.daysLeft !== undefined ? res.daysLeft : 30);
      setIsAdmin(res.isAdmin || false);
    } else {
      setLoginError(res.msg);
    }
  };

  const handleConfirmAccess = () => {
    setIsAuthenticated(true);
    setOnlineSessionCount(1);
    setRegisteredCode(null);
    setRegisteredEmail(null);
  };

  const handleCopyToClipboard = () => {
    if (registeredCode) {
      navigator.clipboard.writeText(registeredCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Monitor Keepalive (local and silent)
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    setOnlineSessionCount(1);
    setHasFraudWarning(false);
  }, [isAuthenticated, token]);

  // Keep ref of latest editor texts for stable auto-save interval
  const editorTextsRef = useRef<string[]>(editorTexts);
  useEffect(() => {
    editorTextsRef.current = editorTexts;
  }, [editorTexts]);

  // Auto-save timer effect (every 40 seconds)
  useEffect(() => {
    if (!isAutoSaveActive) return;

    const interval = setInterval(() => {
      const currentTexts = editorTextsRef.current;
      const hasContent = currentTexts.some((text) => text && text.trim().length > 0);
      if (hasContent) {
        localStorage.setItem("cnc_autoSaveTexts", JSON.stringify(currentTexts));
        const now = new Date();
        setLastAutoSaveTime(
          now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " (Backup Local)"
        );
      }
    }, 40000);

    return () => clearInterval(interval);
  }, [isAutoSaveActive]);

  const handleToggleAutoSave = (checked: boolean) => {
    setIsAutoSaveActive(checked);
    localStorage.setItem("cnc_autoSaveActive", String(checked));
    if (checked) {
      const currentTexts = editorTextsRef.current;
      const hasContent = currentTexts.some((text) => text && text.trim().length > 0);
      if (hasContent) {
        localStorage.setItem("cnc_autoSaveTexts", JSON.stringify(currentTexts));
        const now = new Date();
        setLastAutoSaveTime(
          now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " (Backup Local)"
        );
      }
    }
  };

  const handleSaveLocal = () => {
    const code = editorTexts[activePaneIdx];
    if (code === undefined) return;

    // Classic Fallback
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const name = fileNames[activePaneIdx] || `PROG_CNC_ED${activePaneIdx + 1}.nc`;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadLocal = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        updateEditorText(text, activePaneIdx);
        setFileNames((prev) => {
          const updated = [...prev];
          updated[activePaneIdx] = file.name;
          return updated;
        });
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset input
  };

  const updateEditorText = (val: string, index: number) => {
    const updated = [...editorTexts];
    updated[index] = val;
    setEditorTexts(updated);
    if (index === activePaneIdx) {
      setIsDriverActive(false); // Stop simulation running to reset coordinates
    }
  };

  const loadPresetTemplate = (code: string) => {
    updateEditorText(code, activePaneIdx);
  };

  // Insert generated code directly at current location
  const handleInsertCalculatedCode = (code: string) => {
    const textarea = document.getElementById(`gcode-textarea-${activePaneIdx}`) as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const originalText = textarea.value;
      const updated = originalText.substring(0, start) + code + originalText.substring(end);
      
      const savedScrollTop = textarea.scrollTop;
      const savedScrollLeft = textarea.scrollLeft;
      
      updateEditorText(updated, activePaneIdx);
      
      // Restore cursor position exactly after the inserted code and preserve scrolling
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + code.length, start + code.length);
        textarea.scrollTop = savedScrollTop;
        textarea.scrollLeft = savedScrollLeft;
        
        // Dispatch synthetic scroll event to sync the highlighted code backdrop
        textarea.dispatchEvent(new Event("scroll"));
      }, 50);
    } else {
      // Fallback
      const text = editorTexts[activePaneIdx];
      const updated = text + "\n" + code;
      updateEditorText(updated, activePaneIdx);
    }
  };

  return (
    <div className={`w-screen h-screen flex flex-col select-none overflow-hidden font-sans transition-all duration-300 ${
      isHighContrast 
        ? "bg-white text-black font-semibold text-[15px]" 
        : "bg-[#0b0b0e] text-zinc-100"
    }`}>
      
      {/* Cyberpunk Login Overlay */}
      <AnimatePresence>
        {!isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#07070a] z-[99999] flex flex-col items-center justify-center p-4 font-sans select-text"
          >
            <div className="absolute top-4 left-4 text-xs font-mono text-zinc-600 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              TORNO MASTER v2.4
            </div>

            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1e1e24] w-full max-w-md p-8 rounded-2xl border-2 border-cyan-400/50 shadow-2xl shadow-cyan-950/20 relative overflow-hidden flex flex-col"
            >
              {/* Glow accent */}
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-400 rounded-full filter blur-[50px] opacity-25" />

              <div className="flex justify-center mb-2">
                <div className="bg-cyan-950/40 border border-cyan-400/30 p-2.5 rounded-2xl">
                  <Cpu className="w-6 h-6 text-cyan-400" />
                </div>
              </div>

              <h2 className="font-display font-black text-2xl tracking-tight text-white mb-1 text-center">
                TORNO <span className="text-cyan-400">MASTER</span>
              </h2>

              {registeredCode ? (
                /* SUCCESS REGISTRATION MODE */
                <div className="flex flex-col text-center mt-4">
                  <div className="flex justify-center mb-3">
                    <div className="bg-emerald-950/40 border border-emerald-500/30 p-2 rounded-full">
                      <Sparkles className="w-8 h-8 text-emerald-400 animate-pulse" />
                    </div>
                  </div>
                  <h3 className="text-emerald-400 font-extrabold text-lg mb-2">
                    Cadastro Concluído!
                  </h3>
                  <p className="text-xs text-zinc-300 mb-5 leading-relaxed">
                    Sua conta grátis de 30 dias foi criada com sucesso! 
                    Use a senha gerada abaixo para fazer login no sistema sempre que precisar.
                  </p>

                  <div className="bg-[#0d0d11] border border-zinc-800 rounded-xl p-4 mb-5 relative flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">
                      Sua Senha / Token de Acesso:
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-xl font-black tracking-widest text-cyan-400">
                        {registeredCode}
                      </span>
                      <button
                        onClick={handleCopyToClipboard}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-2 rounded-lg transition border border-zinc-700 flex items-center gap-1 text-xs cursor-pointer"
                        title="Copiar código"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span className="font-sans font-medium text-[10px]">
                          {copied ? "Copiado!" : "Copiar"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="text-left text-xs bg-[#16161c] border border-zinc-800 rounded-lg p-3 mb-6 text-zinc-400 space-y-1">
                    <div>• <strong>Nome</strong>: {clientName}</div>
                    <div>• <strong>E-mail</strong>: {registeredEmail}</div>
                    <div className="text-[10px] text-zinc-500 mt-2 font-medium">
                      * Anote esta senha em local seguro. Enviamos uma cópia para o seu e-mail cadastrado.
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmAccess}
                    className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer w-full shadow-lg shadow-cyan-500/10"
                  >
                    Entrar no Sistema
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* REGULAR LOGIN & REGISTER TABS */
                <>
                  {/* Tabs Selector */}
                  <div className="flex border-b border-zinc-800 mb-6 mt-4">
                    <button
                      onClick={() => { setAuthTab("login"); setLoginError(""); }}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition relative ${
                        authTab === "login" ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Entrar
                      {authTab === "login" && (
                        <motion.div
                          layoutId="activeAuthTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                        />
                      )}
                    </button>
                    <button
                      onClick={() => { setAuthTab("register"); setLoginError(""); }}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition relative ${
                        authTab === "register" ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Criar Conta
                      {authTab === "register" && (
                        <motion.div
                          layoutId="activeAuthTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                        />
                      )}
                    </button>
                  </div>

                  {authTab === "login" ? (
                    /* LOGIN TAB */
                    <div className="flex flex-col text-left">
                      <p className="text-[11px] text-zinc-400 mb-5 text-center leading-relaxed">
                        Selecione a forma de entrada para liberar o sistema.
                      </p>

                      {/* Login Method Toggle */}
                      <div className="grid grid-cols-2 bg-[#0d0d11] border border-zinc-800 rounded-xl p-1 mb-5">
                        <button
                          type="button"
                          onClick={() => { setLoginMethod("token"); setLoginError(""); }}
                          className={`py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition ${
                            loginMethod === "token"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-400/25"
                              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                          }`}
                        >
                          Senha / Token
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLoginMethod("email"); setLoginError(""); }}
                          className={`py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition ${
                            loginMethod === "email"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-400/25"
                              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                          }`}
                        >
                          E-mail + Senha
                        </button>
                      </div>

                      {loginMethod === "token" ? (
                        /* TOKEN/PASSWORD FIELD */
                        <div className="space-y-4">
                          <div className="relative">
                            <span className="absolute left-3 top-3.5 text-zinc-500">
                              <Lock className="w-4 h-4 text-cyan-400" />
                            </span>
                            <input
                              type="password"
                              value={tokenInput}
                              onChange={(e) => setTokenInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleLogin();
                              }}
                              placeholder="Sua Senha / Token"
                              className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl font-mono text-center tracking-widest text-sm outline-none focus:border-cyan-400 transition"
                              autoFocus
                            />
                          </div>
                        </div>
                      ) : (
                        /* EMAIL + PASSWORD FIELDS */
                        <div className="space-y-3">
                          <div className="relative">
                            <span className="absolute left-3 top-3.5 text-zinc-500">
                              <Mail className="w-4 h-4 text-cyan-400" />
                            </span>
                            <input
                              type="email"
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleLogin();
                              }}
                              placeholder="Seu E-mail"
                              className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:border-cyan-400 transition"
                            />
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-3.5 text-zinc-500">
                              <Lock className="w-4 h-4 text-cyan-400" />
                            </span>
                            <input
                              type="password"
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleLogin();
                              }}
                              placeholder="Sua Senha"
                              className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:border-cyan-400 transition"
                            />
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => handleLogin()}
                        disabled={loading}
                        className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-950 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-4 w-full"
                      >
                        {loading ? (
                          <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            Entrar no Sistema
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* REGISTER TAB */
                    <form onSubmit={handleRegister} className="flex flex-col text-left space-y-3">
                      <p className="text-[11px] text-zinc-400 mb-3 text-center leading-relaxed">
                        Cadastre-se para obter um acesso de teste de <strong>30 dias grátis</strong>.
                      </p>

                      <div className="relative">
                        <span className="absolute left-3 top-3.5 text-zinc-500">
                          <User className="w-4 h-4 text-cyan-400" />
                        </span>
                        <input
                          type="text"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="Nome Completo"
                          className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:border-cyan-400 transition"
                          required
                        />
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-3.5 text-zinc-500">
                          <Mail className="w-4 h-4 text-cyan-400" />
                        </span>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="Seu Melhor E-mail"
                          className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:border-cyan-400 transition"
                          required
                        />
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-3.5 text-zinc-500">
                          <Phone className="w-4 h-4 text-cyan-400" />
                        </span>
                        <input
                          type="tel"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="WhatsApp / Celular com DDD"
                          className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:border-cyan-400 transition"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-950 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-4 w-full"
                      >
                        {loading ? (
                          <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            Solicitar Teste Grátis
                            <UserPlus className="w-4 h-4 text-zinc-950" />
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </>
              )}

              {/* Login/Register Error Msg */}
              {loginError && (
                <div 
                  className="mt-4 p-3 rounded-xl bg-red-950/35 border border-red-500/20 text-xs text-red-400 font-medium leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: loginError }}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Layout */}
      {isAuthenticated && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Top Header Toolbar */}
          <header className={`px-6 py-3 flex flex-wrap items-center justify-between gap-4 z-40 shadow-lg transition-all duration-300 ${
            isHighContrast 
              ? "bg-zinc-100 border-b-4 border-black text-black shadow-none" 
              : "bg-[#16161c] border-b-2 border-[#00f3ff] text-white shadow-black/40"
          }`}>
            <div className="flex items-center gap-3">
              <div className="bg-cyan-950/40 p-2 rounded-lg border border-cyan-500/20">
                <Cpu className="w-5 h-5 text-cyan-400" />
              </div>
               <div>
                <h1 className={`font-display font-black text-sm tracking-tight flex items-center gap-2 ${
                  isHighContrast ? 'text-black' : 'text-white'
                }`}>
                  TORNO <span className={isHighContrast ? 'text-[#e65400] font-black' : 'text-[#00f3ff]'}>MASTER</span>
                </h1>
                <p className={`text-[10px] font-mono flex items-center gap-1.5 flex-wrap ${
                  isHighContrast ? 'text-zinc-900 font-bold' : 'text-zinc-400'
                }`}>
                  <span>Sessão: {SESSION_ID}</span>
                  <span>|</span>
                  <span className="font-sans font-semibold text-zinc-200">{clientName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    isAdmin ? 'bg-[#00f3ff]/25 text-[#00f3ff] border border-[#00f3ff]/30 font-black uppercase' :
                    subscriptionType === 'semestral' ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/30' :
                    subscriptionType === 'mensal' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {isAdmin ? 'Administrador' :
                     subscriptionType === 'semestral' ? 'Semestral' :
                     subscriptionType === 'mensal' ? 'Mensal' : 'Demo'}
                  </span>
                  {isAdmin ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/35">
                      Acesso Vitalício
                    </span>
                  ) : (
                    daysLeft !== null && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        daysLeft <= 3 ? 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {daysLeft <= 0 ? 'Expirado' : `${daysLeft} dia${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`}
                      </span>
                    )
                  )}
                </p>
              </div>
            </div>

            {/* Antifraud status widget */}
            {hasFraudWarning && (
              <div className="bg-red-950/30 border border-red-500/30 rounded-lg px-3 py-1 text-xs text-red-400 flex items-center gap-2 animate-pulse">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span>⚠️ ALERTA: Seu token está ativo em outro dispositivo!</span>
              </div>
            )}

            {/* File IO and assistant switches */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => { setShowAssistant(true); setActiveWindowId("assistant"); }}
                className="bg-cyan-950/20 hover:bg-cyan-950/40 border border-[#00f3ff]/40 text-[#00f3ff] text-xs font-bold py-2 px-3.5 rounded-lg transition flex items-center gap-2 shadow"
              >
                <Wrench className="w-4 h-4" />
                Programador Virtual & Tabelas
              </button>

              {isAdmin && (
                <button
                  onClick={() => { setShowAdmin(true); setActiveWindowId("admin"); }}
                  className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5" />
                  Gerenciar Licenças
                </button>
              )}

              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setToken("");
                  setClientName("");
                  setIsAdmin(false);
                }}
                className="bg-red-950/20 hover:bg-red-950/50 border border-red-500/20 text-red-400 text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                title="Desconectar do Sistema"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>

              <span className="w-[1px] h-6 bg-zinc-800 mx-1" />

              <button
                onClick={handleSaveLocal}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                title="Salvar arquivo no disco local"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar
              </button>

              <button
                onClick={handleLoadLocal}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                title="Carregar arquivo do disco local"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Carregar
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pgm,.nc,.gcode"
                onChange={handleFileChange}
                className="hidden"
              />

              <span className="w-[1px] h-6 bg-zinc-800 mx-1" />

              {/* Layout splits switches */}
              <div className="bg-[#121216] p-1 rounded-lg border border-zinc-800 flex items-center gap-1">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    onClick={() => setLayoutCount(num)}
                    className={`text-xs font-bold px-2.5 py-1 rounded transition ${
                      layoutCount === num
                        ? "bg-[#39ff14]/10 text-[#39ff14]"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {num} {num === 1 ? "Tela" : "Telas"}
                  </button>
                ))}
              </div>

              <span className="w-[1px] h-6 bg-zinc-800 mx-1" />

              {/* High Contrast Toggle */}
              <button
                onClick={() => setIsHighContrast(!isHighContrast)}
                className={`p-2 rounded-lg border transition ${
                  isHighContrast
                    ? "bg-yellow-400/20 text-yellow-400 border-yellow-400/40"
                    : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-white"
                }`}
                title="Alternar Modo de Alto Contraste"
              >
                {isHighContrast ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>

              <span className="w-[1px] h-6 bg-zinc-800 mx-1" />

              {/* Floating Simulator Switch */}
              <button
                onClick={() => setSimMode(prev => prev === 'tv' ? 'fixed' : prev === 'fixed' ? 'off' : 'tv')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                  simMode === 'tv'
                    ? "bg-[#00f3ff]/15 text-[#00f3ff] border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.15)] animate-pulse"
                    : simMode === 'fixed' ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]" : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                title="Mover o simulador para uma janela flutuante arrastável (Mini-TV) ou manter fixado"
              >
                {simMode === 'tv' ? "📺 Mini-TV Ativa" : simMode === 'fixed' ? "🖥️ Simulador Fixo" : "👁️ Simulador Off"}
              </button>
            </div>
          </header>

          {/* Warning ribbon for trial expiration */}
          {showRibbon && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && (
            <div className="bg-amber-950/45 text-amber-200 border-b border-amber-500/25 px-6 py-2.5 flex flex-wrap items-center justify-between text-xs font-semibold select-text z-30 gap-3 font-sans">
              <span className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
                <span>
                  Sua licença do Torno Master expira em <strong>{daysLeft === 0 ? "hoje" : `${daysLeft} dia${daysLeft === 1 ? '' : 's'}`}</strong>! 
                  Para renovar e garantir o seu acesso, entre em contato com o desenvolvedor: 
                  <span className="text-cyan-400 ml-1.5 font-bold">📧 millertadeu30@gmail.com</span>
                  <span className="text-zinc-500 mx-2">|</span>
                  <span className="text-emerald-400 font-bold">📞 Whats: {supportPhone}</span>
                </span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/55${supportPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3 py-1 rounded-lg text-[10px] font-black uppercase transition shrink-0 flex items-center gap-1 shadow shadow-emerald-950/20"
                >
                  Falar no WhatsApp
                </a>
                <button
                  onClick={() => setShowRibbon(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-300 px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition shrink-0"
                  title="Ocultar esta mensagem"
                >
                  ✕ Ocultar
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Info Bar - Only when contextual advice is active */}
          {hasTut && (
            <div className="bg-[#0e0e12] border-b border-zinc-900 px-6 py-2 flex items-center justify-between z-10 select-none relative">
              <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Dica contextual ativa para a linha selecionada.
              </span>
              <button 
                onClick={() => setShowTut(!showTut)}
                className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded transition ${showTut ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-400 hover:text-orange-300'}`}
              >
                {showTut ? 'Ocultar Dica' : 'Ver Dica do Ciclo'}
              </button>
            </div>
          )}

          {/* Main workspace (split editor and simulator canvas) */}
          <main className="flex-1 flex flex-col lg:flex-row p-4 gap-4 overflow-hidden relative">
            
            {/* Dynamic tooltips layer centered at top */}
            <AnimatePresence>
              {showTut && (
                <motion.div
                  drag
                  dragMomentum={false}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{ touchAction: "none" }}
                  className="absolute top-10 left-10 bg-[#17171e]/96 border border-cyan-400 rounded-xl p-4 z-50 shadow-2xl shadow-black max-w-xl w-[90%] md:w-[500px] cursor-grab active:cursor-grabbing overflow-y-auto max-h-[80vh]"
                >
                  <div className="flex justify-between items-start mb-1 cursor-grab">
                    <h4 className="text-orange-500 font-display font-bold text-xs uppercase tracking-wider">
                      {tutTitle}
                    </h4>
                    <button 
                      onClick={() => setShowTut(false)}
                      className="text-zinc-500 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono pointer-events-auto">
                    {tutBody}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Left side Split Editors Column */}
            <div className="flex-1 flex flex-col md:flex-row gap-3 overflow-x-auto overflow-y-hidden pb-1">
              {Array.from({ length: layoutCount }).map((_, idx) => (
                <CNCEditor
                  key={idx}
                  paneIndex={idx}
                  text={editorTexts[idx]}
                  onChange={(val) => updateEditorText(val, idx)}
                  activeLine={activePaneIdx === idx ? activeLine : -1}
                  onLineSelect={analyzeActiveLine}
                  isActive={activePaneIdx === idx}
                  onSetFocus={() => setActivePaneIdx(idx)}
                  isHighContrast={isHighContrast}
                  fileName={fileNames[idx]}
                  onToggleFloatingCalculator={() => setIsFloatingCalcOpen(prev => !prev)}
                  isFloatingCalculatorOpen={isFloatingCalcOpen}
                />
              ))}
            </div>

            {/* Floating Simulator (Mini-TV Panel) */}
            {simMode === 'tv' && (
              <div
                className={`bg-[#14141a]/95 border border-zinc-700 shadow-2xl overflow-hidden flex flex-col ${
                  isDraggingSim ? "transition-none" : "transition-all duration-300"
                } ${
                  isSimMaximized ? "fixed inset-4 rounded-2xl z-[100] shadow-cyan-950/60" : "absolute rounded-xl shadow-cyan-950/40 z-[40]"
                }`}
                style={isSimMaximized ? {} : {
                  top: `${simPos.y}px`,
                  left: `${simPos.x}px`,
                  width: "480px",
                  height: "440px",
                  resize: "both",
                  minWidth: "320px",
                  minHeight: "280px",
                }}
                onPointerDown={isSimMaximized ? undefined : handleSimPointerDown}
                onPointerMove={isSimMaximized ? undefined : handleSimPointerMove}
                onPointerUp={isSimMaximized ? undefined : handleSimPointerUp}
              >
                {/* Custom drag handle bar */}
                <div className={`sim-drag-handle flex items-center justify-between bg-[#1d1d24] border-b border-zinc-800 px-3 py-1.5 select-none text-[9px] text-zinc-500 font-mono ${
                  isSimMaximized ? "cursor-default" : "cursor-move"
                }`}>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-[#00f3ff] rounded-full animate-ping" />
                    {isSimMaximized ? "📺 MODO FLUTUANTE (TELA CHEIA)" : "✥ ARRASTE PARA MOVER | ARRASTE O CANTO P/ REDIMENSIONAR"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsSimMaximized(!isSimMaximized)}
                      className="text-zinc-400 hover:text-cyan-400 p-0.5 rounded transition flex items-center justify-center"
                      title={isSimMaximized ? "Restaurar tamanho reduzido" : "Maximizar para tela cheia"}
                    >
                      {isSimMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => setSimMode('off')}
                      className="text-zinc-500 hover:text-red-400 font-bold px-1 transition text-[11px]"
                      title="Ocultar simulador"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <CNCSimulator
                    gcodeText={editorTexts[activePaneIdx]}
                    activeLine={activeLine}
                    onLineChange={analyzeActiveLine}
                    simInvertZ={simInvertZ}
                    onToggleZInvert={() => setSimInvertZ(!simInvertZ)}
                    isDriverActive={isDriverActive}
                    setIsDriverActive={setIsDriverActive}
                    isHighContrast={isHighContrast}
                    onError={setDiagnosticError}
                  />
                </div>
              </div>
            )}

            {/* Right side Simulator Stage (Only when NOT floating) */}
            {simMode === 'fixed' && (
              <div className="w-full lg:w-[480px] xl:w-[530px] shrink-0 h-[400px] lg:h-full">
                <CNCSimulator
                  gcodeText={editorTexts[activePaneIdx]}
                  activeLine={activeLine}
                  onLineChange={analyzeActiveLine}
                  simInvertZ={simInvertZ}
                  onToggleZInvert={() => setSimInvertZ(!simInvertZ)}
                  isDriverActive={isDriverActive}
                  setIsDriverActive={setIsDriverActive}
                  onError={setDiagnosticError}
                />
              </div>
            )}
          </main>

          {/* Virtual assistant dialog modal */}
          {showAssistant && (
            <FloatingWindow
              id="assistant"
              title="Programador Virtual & Tabelas - Torno Master"
              onClose={() => setShowAssistant(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="1024px"
              defaultHeight="700px"
              minWidth="500px"
              minHeight="400px"
            >
              <MachiningAssistant
                onClose={() => setShowAssistant(false)}
                onInsertCode={handleInsertCalculatedCode}
                onUpdateCode={(code) => updateEditorText(code, activePaneIdx)}
                activeGCode={editorTexts[activePaneIdx]}
                isHighContrast={isHighContrast}
                diagnosticError={diagnosticError}
                onToggleFloatingCalculator={() => setIsFloatingCalcOpen(prev => !prev)}
                isFloatingCalculatorOpen={isFloatingCalcOpen}
                onOpenCalculator={(type) => {
                  if (type === "rpm") { setShowRpmCalc(true); setActiveWindowId("rpm"); }
                  else if (type === "feed") { setShowFeedCalc(true); setActiveWindowId("feed"); }
                  else if (type === "thread") { setShowThreadCalc(true); setActiveWindowId("thread"); }
                  else if (type === "polygon") { setShowPolygonCalc(true); setActiveWindowId("polygon"); }
                  else if (type === "drilling") { setShowDrillingCalc(true); setActiveWindowId("drilling"); }
                }}
              />
            </FloatingWindow>
          )}

          {/* Administrative licensing modal */}
          {showAdmin && (
            <FloatingWindow
              id="admin"
              title="Painel Administrativo - Controle de Licenças"
              onClose={() => setShowAdmin(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="900px"
              defaultHeight="600px"
              minWidth="400px"
              minHeight="350px"
            >
              <AdminPanel
                onClose={() => setShowAdmin(false)}
                supportPhone={supportPhone}
                isAdmin={isAdmin}
              />
            </FloatingWindow>
          )}

          {/* Polygon machining calculator modal */}
          {showPolygonCalc && (
            <FloatingWindow
              id="polygon"
              title="Calculadora Polígono (G12.1)"
              onClose={() => setShowPolygonCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="900px"
              defaultHeight="650px"
              minWidth="400px"
              minHeight="350px"
            >
              <PolygonCalculator
                onClose={() => setShowPolygonCalc(false)}
                onInsertCode={handleInsertCalculatedCode}
                isHighContrast={isHighContrast}
              />
            </FloatingWindow>
          )}

          {/* RPM calculator modal */}
          {showRpmCalc && (
            <FloatingWindow
              id="rpm"
              title="Calculadora de Rotação (RPM) / Vc"
              onClose={() => setShowRpmCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="800px"
              defaultHeight="600px"
              minWidth="400px"
              minHeight="350px"
            >
              <RPMCalculator
                onClose={() => setShowRpmCalc(false)}
                onInsertCode={handleInsertCalculatedCode}
                isHighContrast={isHighContrast}
              />
            </FloatingWindow>
          )}

          {/* Feed rate calculator modal */}
          {showFeedCalc && (
            <FloatingWindow
              id="feed"
              title="Calculadora de Avanço de Trabalho (Vf)"
              onClose={() => setShowFeedCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="800px"
              defaultHeight="600px"
              minWidth="400px"
              minHeight="350px"
            >
              <FeedCalculator
                onClose={() => setShowFeedCalc(false)}
                onInsertCode={handleInsertCalculatedCode}
                isHighContrast={isHighContrast}
              />
            </FloatingWindow>
          )}

          {/* Thread G76 calculator modal */}
          {showThreadCalc && (
            <FloatingWindow
              id="thread"
              title="Calculadora de Rosca ISO Fanuc (G76)"
              onClose={() => setShowThreadCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="850px"
              defaultHeight="650px"
              minWidth="450px"
              minHeight="350px"
            >
              <ThreadCalculator
                onClose={() => setShowThreadCalc(false)}
                onInsertCode={handleInsertCalculatedCode}
                isHighContrast={isHighContrast}
              />
            </FloatingWindow>
          )}

          {/* Drilling G83 calculator modal */}
          {showDrillingCalc && (
            <FloatingWindow
              id="drilling"
              title="Calculadora Ciclo de Furação (G83)"
              onClose={() => setShowDrillingCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="800px"
              defaultHeight="620px"
              minWidth="400px"
              minHeight="350px"
            >
              <DrillingCalculator
                onClose={() => setShowDrillingCalc(false)}
                onInsertCode={handleInsertCalculatedCode}
                isHighContrast={isHighContrast}
              />
            </FloatingWindow>
          )}

          {/* Global Floating Scientific Calculator */}
          {isFloatingCalcOpen && (
            <FloatingCalculator
              onClose={() => setIsFloatingCalcOpen(false)}
              onInsertValue={handleInsertCalculatedCode}
            />
          )}
        </div>
      )}

      {/* Device Limit Block Overlay */}
      {isBlockedByDeviceLimit && (
        <div className="fixed inset-0 bg-[#0d0d11]/95 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-6 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-md w-full bg-[#16161c] border border-red-500/35 rounded-2xl p-8 shadow-2xl shadow-black"
          >
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
            </div>

            <h2 className="text-xl font-black text-white font-display mb-3 uppercase tracking-tight">
              Limite de Dispositivos Excedido
            </h2>
            
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Esta licença (<span className="text-cyan-400 font-mono font-bold">{token}</span>) já está sendo utilizada em <span className="text-red-400 font-bold">3 ou mais computadores/celulares</span> simultaneamente neste momento.
            </p>

            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 mb-6 text-left text-xs text-zinc-400 space-y-2">
              <p className="font-semibold text-red-400">Como resolver isso?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Feche as abas ou o navegador nos seus outros computadores ou celulares.</li>
                <li>Aguarde até 2 minutos para o sistema liberar o acesso automaticamente.</li>
                <li>Se você for o administrador, você pode limpar todas as sessões ativas no painel.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const deviceId = getOrCreateDeviceId();
                    const result = await registerSessionHeartbeat(token, SESSION_ID, deviceId);
                    if (!result.blocked) {
                      setIsBlockedByDeviceLimit(false);
                      setOnlineSessionCount(result.activeDevices);
                      setHasFraudWarning(result.activeDevices > 1);
                    }
                  } catch (e) {
                    console.error(e);
                  }
                  setLoading(false);
                }}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Tentar Novamente / Atualizar"
                )}
              </button>

              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setToken("");
                  setClientName("");
                  setIsAdmin(false);
                  setIsBlockedByDeviceLimit(false);
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 font-bold text-xs py-3 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                Voltar ao Login / Sair
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
