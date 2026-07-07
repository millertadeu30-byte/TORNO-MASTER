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
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CNCEditor } from "./components/CNCEditor";
import { CNCSimulator } from "./components/CNCSimulator";
import { MachiningAssistant } from "./components/MachiningAssistant";
import { AdminPanel } from "./components/AdminPanel";
import { PolygonCalculator } from "./components/PolygonCalculator";
import { RPMCalculator } from "./components/RPMCalculator";
import { FeedCalculator } from "./components/FeedCalculator";
import { ThreadCalculator } from "./components/ThreadCalculator";
import { DrillingCalculator } from "./components/DrillingCalculator";
import { FloatingWindow } from "./components/FloatingWindow";
import { CNC_TEMPLATES } from "./data/templates";
import { localLogin, localRegister } from "./lib/licensing";

// Generate a random session ID on app load to track active devices (antifraud tracking)
const SESSION_ID = Math.random().toString(36).substring(2, 10).toUpperCase();

export default function App() {
  // Auth State
  const [authMode, setAuthMode] = useState<"login" | "register" | "token">("login");
  const [regName, setRegName] = useState<string>("");
  const [regEmail, setRegEmail] = useState<string>("");
  const [regPassword, setRegPassword] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  
  const [tokenInput, setTokenInput] = useState<string>("");
  const [token, setToken] = useState<string>(() => localStorage.getItem("cnc_token") || "");
  const [clientName, setClientName] = useState<string>(() => localStorage.getItem("cnc_clientName") || "");
  const [supportPhone, setSupportPhone] = useState<string>(() => localStorage.getItem("cnc_supportPhone") || "(18) 99999-5555");
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
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
    if (authMode === "token") {
      if (!tokenInput.trim()) {
        setLoginError("Por favor, digite seu token de acesso.");
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
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setLoginError("Por favor, preencha todos os campos do cadastro.");
      return;
    }

    setLoading(true);
    setLoginError("");

    const res = localRegister(regName.trim(), regEmail.trim(), regPassword.trim());

    setLoading(false);
    if (res.sucesso) {
      setToken(res.token || "");
      setClientName(res.clientName || "");
      setSupportPhone(res.supportPhone || "");
      setSubscriptionType(res.subscriptionType || "demo");
      setDaysLeft(res.daysLeft !== undefined ? res.daysLeft : 30);
      setIsAdmin(res.isAdmin || false);
      setIsAuthenticated(true);
      setOnlineSessionCount(1);
      alert("🎉 Cadastro realizado com sucesso! Sua versão Demo de 30 dias grátis foi ativada!");
    } else {
      setLoginError(res.msg);
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
    const text = editorTexts[activePaneIdx];
    // Simple append to bottom or selection point
    const updated = text + "\n" + code;
    updateEditorText(updated, activePaneIdx);
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
              className="bg-[#1e1e24] w-full max-w-md p-8 rounded-2xl border-2 border-cyan-400/50 shadow-2xl shadow-cyan-950/20 relative overflow-hidden flex flex-col text-center"
            >
              {/* Glow accent */}
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-400 rounded-full filter blur-[50px] opacity-25" />

              <div className="flex justify-center mb-2">
                <div className="bg-cyan-950/40 border border-cyan-400/30 p-2.5 rounded-2xl">
                  <Cpu className="w-6 h-6 text-cyan-400" />
                </div>
              </div>

              <h2 className="font-display font-black text-2xl tracking-tight text-white mb-1">
                TORNO <span className="text-cyan-400">MASTER</span>
              </h2>
              <p className="text-[11px] text-zinc-400 mb-5 max-w-xs mx-auto">
                Cadastre-se para obter uma versão Demo de 30 dias grátis, ou faça login com seu e-mail e senha.
              </p>

              {/* Navigation Tabs */}
              <div className="flex border-b border-zinc-800 mb-5 text-xs">
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setLoginError(""); }}
                  className={`flex-1 pb-2 font-bold border-b-2 transition-all ${
                    authMode === "login"
                      ? "text-cyan-400 border-cyan-400"
                      : "text-zinc-500 border-transparent hover:text-zinc-300"
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("register"); setLoginError(""); }}
                  className={`flex-1 pb-2 font-bold border-b-2 transition-all ${
                    authMode === "register"
                      ? "text-cyan-400 border-cyan-400"
                      : "text-zinc-500 border-transparent hover:text-zinc-300"
                  }`}
                >
                  Cadastrar-se
                </button>
              </div>

              {/* Form Content */}
              {authMode === "login" && (
                <form onSubmit={handleLogin} className="flex flex-col gap-3 text-left">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Seu E-mail"
                      required
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Sua Senha"
                      required
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-950 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Acessar Sistema
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {authMode === "register" && (
                <form onSubmit={handleRegister} className="flex flex-col gap-3 text-left">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Nome Completo"
                      required
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="Seu melhor E-mail"
                      required
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Crie uma Senha"
                      required
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>

                  <div className="text-[10px] text-zinc-400 bg-cyan-950/25 border border-cyan-500/15 p-3 rounded-lg leading-relaxed flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>Ao se cadastrar, você ativa a versão <strong>Demo Grátis de 30 dias</strong>. Após o período, o plano mensal custa R$ 11,90 ou R$ 49,90 semestral.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-950 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Criar Conta e Ativar Demo
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {authMode === "token" && (
                <div className="flex flex-col gap-3 text-left">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleLogin();
                      }}
                      placeholder="Token de Licença"
                      className="w-full bg-[#0d0d11] border border-zinc-800 text-zinc-100 pl-9 pr-4 py-2.5 rounded-xl font-mono text-center tracking-widest text-xs outline-none focus:border-cyan-400 transition"
                    />
                  </div>

                  <button
                    onClick={() => handleLogin()}
                    disabled={loading}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-950 text-zinc-950 font-extrabold text-xs tracking-wider uppercase py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Entrar com Token
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Login Error Msg */}
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
                    isAdmin || token === "CNC-MASTER-2026" ? 'bg-[#00f3ff]/25 text-[#00f3ff] border border-[#00f3ff]/30 font-black uppercase' :
                    subscriptionType === 'semestral' ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/30' :
                    subscriptionType === 'mensal' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {isAdmin || token === "CNC-MASTER-2026" ? 'Administrador' :
                     subscriptionType === 'semestral' ? 'Semestral' :
                     subscriptionType === 'mensal' ? 'Mensal' : 'Demo'}
                  </span>
                  {(isAdmin || token === "CNC-MASTER-2026") ? (
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

              {isAdmin && token === "CNC-MASTER-2026" && (
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
                />
              ))}
            </div>

            {/* Floating Simulator (Mini-TV Panel) */}
            {simMode === 'tv' && (
              <div
                className="absolute bg-[#14141a]/95 border border-zinc-700 rounded-xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col z-[40]"
                style={{
                  top: `${simPos.y}px`,
                  left: `${simPos.x}px`,
                  width: "480px",
                  height: "440px",
                  resize: "both",
                  minWidth: "320px",
                  minHeight: "280px",
                }}
                onPointerDown={handleSimPointerDown}
                onPointerMove={handleSimPointerMove}
                onPointerUp={handleSimPointerUp}
              >
                {/* Custom drag handle bar */}
                <div className="sim-drag-handle flex items-center justify-between bg-[#1d1d24] border-b border-zinc-800 px-3 py-1.5 cursor-move select-none text-[9px] text-zinc-500 font-mono">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-[#00f3ff] rounded-full animate-ping" />
                    ✥ ARRASTE PARA MOVER | 🎚 ARRASTE O CANTO P/ REDIMENSIONAR
                  </span>
                  <button
                    onClick={() => setSimMode('off')}
                    className="text-zinc-500 hover:text-red-400 font-bold px-1 transition"
                    title="Fixar na lateral"
                  >
                    ✕
                  </button>
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
        </div>
      )}
    </div>
  );
}
