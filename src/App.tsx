import React, { useState, useEffect, useRef, useMemo } from "react";
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
  ChevronUp,
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
  Check,
  Box,
  RefreshCw,
  Palette,
  Smartphone,
  Paperclip,
  FileDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CNCEditor } from "./components/CNCEditor";
import { CNCSimulator, CursorStyle, CURSOR_STYLE_PADRAO } from "./components/CNCSimulator";
import { CNCSimulator3D, saveStepText, loadStepText } from "./components/CNCSimulator3D";
import { MachiningAssistant } from "./components/MachiningAssistant";
import FloatingCalculator from "./components/FloatingCalculator";
import { AdminPanel } from "./components/AdminPanel";
import { PolygonCalculator } from "./components/PolygonCalculator";
import { RPMCalculator } from "./components/RPMCalculator";
import { FeedCalculator } from "./components/FeedCalculator";
import { ThreadCalculator } from "./components/ThreadCalculator";
import { DrillingCalculator } from "./components/DrillingCalculator";
import { CycleGenerator } from "./components/CycleGenerator";
import { extractLatheProfile, profileToLathe, PartProfile, PartZeroConfig } from "./utils/stepProfile";
import { ToleranceCalculator } from "./components/ToleranceCalculator";
import { FloatingWindow } from "./components/FloatingWindow";
import { CNC_TEMPLATES } from "./data/templates";
import { localLogin, localRegister, syncLicensingWithServer, getGlobalSupportPhone, registerSessionHeartbeat, getOrCreateDeviceId } from "./lib/licensing";

// Generate a random session ID on app load to track active devices (antifraud tracking)
const SESSION_ID = Math.random().toString(36).substring(2, 10).toUpperCase();
// ===== O APP ABRE VAZIO =====
// Tira do caminho o que era da peça anterior (programas, STEP, desenho, fixações). As preferências ficam.
// O último trabalho não salvo fica guardado em "cnc_ultimoTrabalho" (dá para recuperar depois).
try {
  const anterior = localStorage.getItem("cnc_autoSaveTexts");
  if (anterior) localStorage.setItem("cnc_ultimoTrabalho", anterior);
  ["cnc_autoSaveTexts", "cnc_ops_painel", "cnc_partProfile", "cnc_stockProfile", "cnc_sketch2D", "cnc_fixacoes2D"].forEach((k) => localStorage.removeItem(k));
} catch { /* sem armazenamento */ }

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
  const [isHeaderMinimized, setIsHeaderMinimized] = useState<boolean>(() => {
    // Começa com a barra compacta (tela limpa). Se o usuário expandir, a escolha fica salva no tablet.
    const v = localStorage.getItem("cnc_headerCompacto_v2");
    return v === null ? true : v === "true";
  });

  useEffect(() => {
    localStorage.setItem("cnc_headerCompacto_v2", String(isHeaderMinimized));
  }, [isHeaderMinimized]);

  const [isSyncWidgetMinimized, setIsSyncWidgetMinimized] = useState<boolean>(false);
  const [syncWidgetPos, setSyncWidgetPos] = useState({ x: 30, y: 180 });
  const [syncWidgetSize, setSyncWidgetSize] = useState<{ width: number; height: number }>(() => {
    const saved = localStorage.getItem("cnc_syncWidgetSize");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.width && parsed.height) return parsed;
      } catch (e) {}
    }
    return { width: 340, height: 320 };
  });

  useEffect(() => {
    localStorage.setItem("cnc_syncWidgetSize", JSON.stringify(syncWidgetSize));
  }, [syncWidgetSize]);
  const [isSyncWidgetResizing, setIsSyncWidgetResizing] = useState(false);
  const syncWidgetResizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const [isSyncWidgetDragging, setIsSyncWidgetDragging] = useState(false);
  const syncWidgetDragStart = useRef({ x: 0, y: 0 });
  const syncWidgetClickStartPos = useRef({ x: 0, y: 0 });
  const [ignoredSyncCodes, setIgnoredSyncCodes] = useState<string[]>([]);
  const [codeToConfirmIgnore, setCodeToConfirmIgnore] = useState<string | null>(null);
  const [syncIncludeNoP, setSyncIncludeNoP] = useState<boolean>(() => {
    const saved = localStorage.getItem("cnc_syncIncludeNoP");
    return saved !== null ? saved === "true" : true;
  });
  const [syncIncludeWithP, setSyncIncludeWithP] = useState<boolean>(() => {
    const saved = localStorage.getItem("cnc_syncIncludeWithP");
    return saved !== null ? saved === "true" : true;
  });
  const [syncIncludeM2000, setSyncIncludeM2000] = useState<boolean>(() => {
    const saved = localStorage.getItem("cnc_syncIncludeM2000");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("cnc_syncIncludeNoP", String(syncIncludeNoP));
  }, [syncIncludeNoP]);

  useEffect(() => {
    localStorage.setItem("cnc_syncIncludeWithP", String(syncIncludeWithP));
  }, [syncIncludeWithP]);

  useEffect(() => {
    localStorage.setItem("cnc_syncIncludeM2000", String(syncIncludeM2000));
  }, [syncIncludeM2000]);

  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  // Aparência: fundo do editor (escuro/branco) e do gráfico (cor livre) - escolhas independentes, salvas no tablet
  const [editorBg, setEditorBg] = useState<"escuro" | "branco">(() => localStorage.getItem("cnc_editorBg") === "branco" ? "branco" : "escuro");
  const [graphBg, setGraphBg] = useState<string>(() => localStorage.getItem("cnc_graphBg") || "");
  const [showAppearance, setShowAppearance] = useState<boolean>(false);
  useEffect(() => { localStorage.setItem("cnc_editorBg", editorBg); }, [editorBg]);
  useEffect(() => { localStorage.setItem("cnc_graphBg", graphBg); }, [graphBg]);
  // Aparência da MIRA e do QUADRADINHO do desenho (cor na linha, cor no canto/emenda e tamanho %)
  const [cursorStyle, setCursorStyle] = useState<CursorStyle>(() => {
    try { return { ...CURSOR_STYLE_PADRAO, ...JSON.parse(localStorage.getItem("cnc_cursorStyle") || "{}") }; } catch { return CURSOR_STYLE_PADRAO; }
  });
  useEffect(() => { try { localStorage.setItem("cnc_cursorStyle", JSON.stringify(cursorStyle)); } catch {} }, [cursorStyle]);
  // Layout Mobile (tablet / celular): botão 📱 liga/desliga. Na 1ª vez liga sozinho em telas pequenas.
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => {
    const v = localStorage.getItem("cnc_mobileLayout");
    if (v !== null) return v === "true";
    return typeof window !== "undefined" && window.innerWidth < 900;
  });
  const [mobileView, setMobileView] = useState<"programa" | "grafico" | "dividido">(() => {
    const v = localStorage.getItem("cnc_mobileView");
    return v === "programa" || v === "grafico" ? v : "dividido";
  });
  useEffect(() => { localStorage.setItem("cnc_mobileLayout", String(isMobileLayout)); }, [isMobileLayout]);
  useEffect(() => { localStorage.setItem("cnc_mobileView", mobileView); }, [mobileView]);
  // =================== PEÇA e BRUTO importados do STEP (perfil de torno) - ficam salvos no tablet
  const loadJSON = <T,>(key: string, def: T): T => {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : def;
    } catch {
      return def;
    }
  };
  const saveJSON = (key: string, val: unknown) => {
    try {
      if (val === null || val === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* arquivo grande demais para guardar no tablet */
    }
  };
  const [partProfile, setPartProfile] = useState<PartProfile | null>(() => loadJSON<PartProfile | null>("cnc_partProfile", null));
  const [stockProfile, setStockProfile] = useState<PartProfile | null>(() => loadJSON<PartProfile | null>("cnc_stockProfile", null));
  const [partZero, setPartZero] = useState<PartZeroConfig>(() => loadJSON<PartZeroConfig>("cnc_partZero", { face: "direita", offsetZ: 0 }));
  const [zSinal, setZSinal] = useState<1 | -1>(() => loadJSON<1 | -1>("cnc_zSinal", 1)); // -1 = cabeçote SUÍÇO na origem 1 (Z positivo entrando na peça)
  useEffect(() => saveJSON("cnc_zSinal", zSinal), [zSinal]);
  const [stockZero, setStockZero] = useState<PartZeroConfig>(() => loadJSON<PartZeroConfig>("cnc_stockZero", { face: "direita", offsetZ: 0 }));
  // Cor das linhas: "auto" = cinza que se ajusta ao fundo | azul | laranja
  const [layerColors, setLayerColors] = useState<{ peca: string; bruto: string }>(() => loadJSON("cnc_layerColors", { peca: "auto", bruto: "#f59e0b" }));
  const [showPart, setShowPart] = useState<boolean>(true);
  const [showStock, setShowStock] = useState<boolean>(true);
  const [stepTarget, setStepTarget] = useState<"peca" | "bruto">("peca"); // qual STEP o painel está mexendo
  const [showPartPanel, setShowPartPanel] = useState<boolean>(false);
  const [partError, setPartError] = useState<string | null>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => saveJSON("cnc_partProfile", partProfile), [partProfile]);
  useEffect(() => saveJSON("cnc_stockProfile", stockProfile), [stockProfile]);
  useEffect(() => saveJSON("cnc_partZero", partZero), [partZero]);
  useEffect(() => saveJSON("cnc_stockZero", stockZero), [stockZero]);
  useEffect(() => saveJSON("cnc_layerColors", layerColors), [layerColors]);
  // Linhas da peça e do bruto já no sistema do torno (X diâmetro, Z com o zero escolhido) para desenhar no gráfico
  // SUÍÇO: o gráfico mostra a peça com o Z virado (igual ao programa)
  const zFlip = (cs: { x: number; z: number }[][]) => (zSinal === 1 ? cs : cs.map((c) => c.map((p) => ({ x: p.x, z: -p.z }))));
  const partLayers = useMemo(() => {
    const L: { id: string; label: string; color: string; dashed: boolean; curves: { x: number; z: number }[][] }[] = [];
    if (stockProfile && showStock) L.push({ id: "bruto", label: "BRUTO", color: layerColors.bruto, dashed: true, curves: zFlip(profileToLathe(stockProfile, stockZero)) });
    if (partProfile && showPart) L.push({ id: "peca", label: "PEÇA", color: layerColors.peca, dashed: false, curves: zFlip(profileToLathe(partProfile, partZero)) });
    return L.length ? L : undefined;
  }, [partProfile, stockProfile, partZero, stockZero, showPart, showStock, layerColors, zSinal]);
  // Peça REAL no 3D (com rasgos): eixo achado no STEP + zero da peça, para montar o sólido no simulador 3D
  const partSolid = useMemo(() => {
    if (!partProfile || !showPart) return null;
    return { key: "peca", name: partProfile.name, axis: partProfile.axis, aMin: partProfile.aMin, aMax: partProfile.aMax, face: partZero.face, offsetZ: partZero.offsetZ };
  }, [partProfile, showPart, partZero]);
  // Lê o arquivo STEP escolhido e monta o perfil (vai para a PEÇA ou para o BRUTO, conforme a caixinha marcada)
  const handleStepFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const target = stepTarget;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const prof = extractLatheProfile(String(reader.result || ""), file.name);
        prof.name = file.name;
        if (target === "peca") {
          setPartProfile(prof);
          saveStepText("peca", String(reader.result || "")); // guarda o arquivo no aparelho para a peça REAL no 3D
          setShowPart(true);
        } else {
          setStockProfile(prof);
          setShowStock(true);
        }
        setPartError(null);
        setShowPartPanel(true);
        if (simMode === "off") setSimMode("fixed");
      } catch (err: any) {
        setPartError(err?.message || "Não consegui ler o arquivo STEP.");
        setShowPartPanel(true);
      }
    };
    reader.onerror = () => {
      setPartError("Não consegui abrir o arquivo.");
      setShowPartPanel(true);
    };
    reader.readAsText(file);
  };
  // PG: ponto tocado no perfil da peça vira uma linha do programa (G01 X.. Z..;) logo abaixo da linha do cursor
  const handleInsertProgramPoint = (x: number, z: number) => {
    const f = (n: number) => {
      let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "");
      if (s.endsWith(".")) s += "0";
      if (s === "-0.0") s = "0.0";
      return s;
    };
    const line = `G01 X${f(x)} Z${f(z)};`;
    const textarea = document.getElementById(`gcode-textarea-${activePaneIdx}`) as HTMLTextAreaElement | null;
    const text = textarea ? textarea.value : editorTexts[activePaneIdx] || "";
    const caret = textarea ? textarea.selectionEnd : text.length;
    let eol = text.indexOf("\n", caret);
    if (eol === -1) eol = text.length;
    const sep = text.length ? "\n" : "";
    const updated = text.slice(0, eol) + sep + line + text.slice(eol);
    updateEditorText(updated, activePaneIdx);
    const newCaret = eol + sep.length + line.length;
    if (textarea) {
      setTimeout(() => {
        textarea.setSelectionRange(newCaret, newCaret);
        textarea.dispatchEvent(new Event("scroll"));
      }, 30);
    }
  };
  const [activePaneIdx, setActivePaneIdx] = useState<number>(0);
  const [projVer, setProjVer] = useState<number>(0); // muda ao carregar um projeto (simuladores recarregam)
  const [showIniciar, setShowIniciar] = useState<boolean>(false); // assistente ▶ Iniciar Programa
  const [regiaoSel, setRegiaoSel] = useState<{ opId: string; modo: "cf" | "linha" } | null>(null); // escolhendo região no simulador
  const [regiaoPick, setRegiaoPick] = useState<{ seq: number; r: { z: number; x: number; za?: number; zb?: number } } | null>(null);
  const [painelRegioes, setPainelRegioes] = useState<TMRegiao[]>([]);
  const [fixComando, setFixComando] = useState<{ seq: number; zones: TMFixZone[] } | null>(null);
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
    return ["", "", ""]; // o app abre VAZIO (sem programa de exemplo)
  });
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isAutoSaveActive, setIsAutoSaveActive] = useState<boolean>(() => {
    return localStorage.getItem("cnc_autoSaveActive") === "true";
  });
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>("");

  // Helper to parse all sync declarations from all active editors (M >= 200)
  const syncCodesAnalysis = useMemo(() => {
    const analysis: {
      [mCode: string]: {
        pVal: string;
        declaredIn: { [channelIdx: number]: { line: number; text: string; pVal: string } };
        targets: number[]; // 1-based channel numbers, e.g., [1, 2, 3]
        isSynchronized: boolean;
        missingChannels: number[];
        mismatchedChannels: number[];
        isIgnored: boolean;
      };
    } = {};

    if (!editorTexts || !layoutCount) return analysis;

    // First pass: gather all Mxxx declarations where number >= 200
    for (let c = 0; c < layoutCount; c++) {
      const textVal = editorTexts[c];
      if (!textVal) continue;
      const linesList = textVal.split(/\r?\n/);

      linesList.forEach((line, idx) => {
        const cleanLine = line.split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
        // Match both MxxxP123 and simply Mxxx (allowing flexible whitespace and preceding N-numbers like N7M2008P12)
        const matches = cleanLine.matchAll(/(?<![A-Z])(M\s*\d+)\s*(?:P\s*([123]{2,3}))?(?!\d)/gi);
        for (const match of matches) {
          const mCode = match[1].replace(/\s+/g, "").toUpperCase(); // e.g. "M2005" or "M300"
          const mNum = parseInt(mCode.substring(1), 10);
          if (mNum >= 200) {
            // Clean pVal and sort its digits to ignore order variations (e.g., P12 and P21 are identical)
            const rawP = match[2] || "";
            const pVal = rawP ? rawP.replace(/\s+/g, "").split("").sort().join("") : "";

            const isM2000Range = mNum >= 2000 && mNum <= 2999;

            if (isM2000Range) {
              if (!syncIncludeM2000) {
                continue;
              }
              if (pVal && !syncIncludeWithP) {
                continue;
              }
              if (!pVal && !syncIncludeNoP) {
                continue;
              }
            } else {
              // RULE: Non-M2000 M-code with 4 or more digits MUST have P suffix to be considered sync code
              if (mCode.substring(1).length >= 4 && !pVal) {
                continue;
              }

              if (pVal && !syncIncludeWithP) {
                continue;
              }
              if (!pVal && !syncIncludeNoP) {
                continue;
              }
            }

            if (!analysis[mCode]) {
              analysis[mCode] = {
                pVal: pVal,
                declaredIn: {},
                targets: [],
                isSynchronized: false,
                missingChannels: [],
                mismatchedChannels: [],
                isIgnored: ignoredSyncCodes.includes(mCode),
              };
            }

            if (pVal && !analysis[mCode].pVal) {
              analysis[mCode].pVal = pVal;
            }

            analysis[mCode].declaredIn[c] = {
              line: idx + 1,
              text: line.trim(),
              pVal: pVal,
            };
          }
        }
      });
    }

    // Second pass: evaluate synchronization status for each Mxxx code >= 200
    Object.keys(analysis).forEach((mCode) => {
      const syncInfo = analysis[mCode];
      const pVal = syncInfo.pVal;

      const targets: number[] = [];
      if (pVal) {
        for (const char of pVal) {
          const num = parseInt(char, 10);
          if (!isNaN(num) && !targets.includes(num)) {
            targets.push(num);
          }
        }
      } else {
        for (let i = 1; i <= layoutCount; i++) {
          targets.push(i);
        }
      }
      syncInfo.targets = targets.sort();

      const missingChannels: number[] = [];
      const mismatchedChannels: number[] = [];

      targets.forEach((channelNum) => {
        const channelIdx = channelNum - 1;
        if (channelIdx < layoutCount) {
          const decl = syncInfo.declaredIn[channelIdx];
          if (!decl) {
            missingChannels.push(channelNum);
          } else {
            const thisPVal = decl.pVal || "";
            if (pVal !== thisPVal) {
              mismatchedChannels.push(channelNum);
            }
          }
        } else {
          missingChannels.push(channelNum);
        }
      });

      for (let c = 0; c < layoutCount; c++) {
        const channelNum = c + 1;
        if (syncInfo.declaredIn[c] && !targets.includes(channelNum)) {
          mismatchedChannels.push(channelNum);
        }
      }

      syncInfo.missingChannels = missingChannels;
      syncInfo.mismatchedChannels = mismatchedChannels;
      syncInfo.isSynchronized = missingChannels.length === 0 && mismatchedChannels.length === 0;
    });

    return analysis;
  }, [editorTexts, layoutCount, ignoredSyncCodes, syncIncludeNoP, syncIncludeWithP, syncIncludeM2000]);

  // Helper to align all open editors on a specific sync M-code
  const handleAlignAllEditorsToMCode = (mCode: string) => {
    for (let p = 0; p < layoutCount; p++) {
      const pText = editorTexts[p];
      if (!pText) continue;

      const pLines = pText.split(/\r?\n/);
      let targetIdx = -1;
      for (let i = 0; i < pLines.length; i++) {
        const cleanLine = pLines[i].split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
        if (cleanLine.includes(mCode)) {
          targetIdx = i;
          break;
        }
      }

      if (targetIdx !== -1) {
        const textarea = document.getElementById(`gcode-textarea-${p}`) as HTMLTextAreaElement;
        if (textarea) {
          const viewHeight = textarea.clientHeight;
          const fontSizeSaved = localStorage.getItem("cnc-editor-font-size");
          const fontSize = fontSizeSaved ? parseInt(fontSizeSaved, 10) : 14;
          const lineHeight = Math.round(fontSize * 1.714);

          const targetScrollTop = targetIdx * lineHeight - (viewHeight / 2) + (lineHeight / 2);
          textarea.scrollTop = Math.max(0, targetScrollTop);
          textarea.dispatchEvent(new Event('scroll'));
        }
      }
    }
  };

  // Drag and click handlers for the floating sync widget
  const handleSyncWidgetPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Only drag if clicking the handle or if minimized (the whole thing is a handle when minimized)
    if (isSyncWidgetMinimized || (target.closest(".drag-handle") && !target.closest("button"))) {
      setIsSyncWidgetDragging(true);
      syncWidgetDragStart.current = { x: e.clientX - syncWidgetPos.x, y: e.clientY - syncWidgetPos.y };
      syncWidgetClickStartPos.current = { x: e.clientX, y: e.clientY };
      target.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const handleSyncWidgetPointerMove = (e: React.PointerEvent) => {
    if (isSyncWidgetDragging) {
      const newX = e.clientX - syncWidgetDragStart.current.x;
      const newY = e.clientY - syncWidgetDragStart.current.y;
      
      // Keep inside bounds of the screen
      const boundX = Math.max(10, Math.min(window.innerWidth - 120, newX));
      const boundY = Math.max(40, Math.min(window.innerHeight - 80, newY));
      setSyncWidgetPos({ x: boundX, y: boundY });
    }
  };

  const handleSyncWidgetPointerUp = (e: React.PointerEvent) => {
    if (isSyncWidgetDragging) {
      setIsSyncWidgetDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      // If they clicked it and didn't move it much, toggle minimize/maximize
      const distance = Math.hypot(e.clientX - syncWidgetClickStartPos.current.x, e.clientY - syncWidgetClickStartPos.current.y);
      if (distance < 5 && isSyncWidgetMinimized) {
        setIsSyncWidgetMinimized(false);
      }
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsSyncWidgetResizing(true);
    syncWidgetResizeStart.current = {
      width: syncWidgetSize.width,
      height: syncWidgetSize.height,
      x: e.clientX,
      y: e.clientY,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (isSyncWidgetResizing) {
      e.stopPropagation();
      const deltaX = e.clientX - syncWidgetResizeStart.current.x;
      const deltaY = e.clientY - syncWidgetResizeStart.current.y;
      
      const maxW = Math.max(260, window.innerWidth - syncWidgetPos.x - 20);
      const maxH = Math.max(180, window.innerHeight - syncWidgetPos.y - 20);

      const newWidth = Math.max(220, Math.min(maxW, syncWidgetResizeStart.current.width + deltaX));
      const newHeight = Math.max(160, Math.min(maxH, syncWidgetResizeStart.current.height + deltaY));
      
      setSyncWidgetSize({ width: newWidth, height: newHeight });
    }
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (isSyncWidgetResizing) {
      e.stopPropagation();
      setIsSyncWidgetResizing(false);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // Modals
  const [showAssistant, setShowAssistant] = useState<boolean>(false);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showPolygonCalc, setShowPolygonCalc] = useState<boolean>(false);
  const [showRpmCalc, setShowRpmCalc] = useState<boolean>(false);
  const [showFeedCalc, setShowFeedCalc] = useState<boolean>(false);
  const [showThreadCalc, setShowThreadCalc] = useState<boolean>(false);
  const [showDrillingCalc, setShowDrillingCalc] = useState<boolean>(false);
  const [showCycleGen, setShowCycleGen] = useState<boolean>(false); // Gerador de Ciclos Fanuc
  const [showToleranceCalc, setShowToleranceCalc] = useState<boolean>(false);
  const [isFloatingCalcOpen, setIsFloatingCalcOpen] = useState<boolean>(false);

  // Floating Window management states
  const [activeWindowId, setActiveWindowId] = useState<string>("");
  const [showRibbon, setShowRibbon] = useState<boolean>(true);

  // Floating TV Simulator Layout States
  const [simMode, setSimMode] = useState<"tv" | "fixed" | "off">("fixed");
  const [showLibraries, setShowLibraries] = useState<boolean>(false);
  const [hasTut, setHasTut] = useState<boolean>(false);
  const [fileNames, setFileNames] = useState<string[]>(["", "", ""]);
  const [simPos, setSimPos] = useState({ x: 700, y: 140 });
  const [isDraggingSim, setIsDraggingSim] = useState<boolean>(false);
  const [isSimMaximized, setIsSimMaximized] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 3D Simulator State (X, Y, Z, C Axis Milling)
  const [show3DSimulator, setShow3DSimulator] = useState<boolean>(false);

  // Auto detect Y-axis in active editor code
  const hasYAxisInActiveEditor = useMemo(() => {
    const currentText = editorTexts[activePaneIdx] || "";
    return /(?<![A-Z])Y\s*[-+]?\d/i.test(currentText);
  }, [editorTexts, activePaneIdx]);

  const handleToggle3DSimulator = () => {
    setShow3DSimulator(prev => {
      const nextVal = !prev;
      if (nextVal && simMode === 'off') {
        setSimMode('fixed');
      }
      return nextVal;
    });
  };

  // Fixed Simulator Width & Drag-Resize state
  const [fixedSimWidth, setFixedSimWidth] = useState<number>(() => {
    const saved = localStorage.getItem("cnc_fixedSimWidth");
    return saved ? parseInt(saved, 10) : 520;
  });
  const [isResizingFixedSim, setIsResizingFixedSim] = useState<boolean>(false);
  const fixedSimResizeStartRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 520 });

  const handleFixedSimResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsResizingFixedSim(true);
    fixedSimResizeStartRef.current = {
      startX: e.clientX,
      startWidth: fixedSimWidth,
    };
  };

  const handleFixedSimResizeMove = (e: React.PointerEvent) => {
    if (!isResizingFixedSim) return;
    const deltaX = fixedSimResizeStartRef.current.startX - e.clientX; // Dragging left increases simulator width
    const maxWidth = Math.max(320, window.innerWidth - 300);
    const newWidth = Math.max(300, Math.min(maxWidth, fixedSimResizeStartRef.current.startWidth + deltaX));
    setFixedSimWidth(newWidth);
  };

  const handleFixedSimResizeUp = (e: React.PointerEvent) => {
    if (isResizingFixedSim) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setIsResizingFixedSim(false);
      localStorage.setItem("cnc_fixedSimWidth", String(fixedSimWidth));
    }
  };

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
          setHasFraudWarning(!!result.exceeded);
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
    if (!regName.trim() || !regEmail.trim()) {
      setLoginError("Por favor, preencha todos os campos do cadastro.");
      return;
    }

    setLoading(true);
    setLoginError("");

    const res = localRegister(regName.trim(), regEmail.trim(), "N/A");

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

  // ===================== PROJETO DA PEÇA =====================
  // SALVAR grava TUDO num arquivo só (.torno): programas dos 3 canais, nº de telas, STEP (peça e bruto),
  // desenhos, zero da peça, giro do STEP no 3D, cores, Sincro Z, posição/tamanho das caixas, etc.
  // CARREGAR abre o projeto e deixa tudo exatamente igual (também continua abrindo .nc / .txt antigos).
  const PROJ_KEYS_FORA = [
    "cnc_token", "cnc_clientName", "cnc_isAuthenticated", "cnc_daysLeft", "cnc_subscriptionType", "cnc_isAdmin",
    "cnc_supportPhone", "cnc_device_id", "cnc_autoSaveTexts", "cnc_autoSaveActive", "cnc_calc_history_v2",
    "cnc_mobileLayout", "cnc_mobileView", "cnc_ultimoTrabalho",
  ]; // login / licença / histórico deste tablet: NÃO vão para o projeto
  const baixarArquivo = (conteudo: string, nome: string, tipo = "text/plain") => {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleSaveLocal = async () => {
    const storage: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^cnc/.test(k) || PROJ_KEYS_FORA.includes(k)) continue;
        const v = localStorage.getItem(k);
        if (v !== null) storage[k] = v;
      }
    } catch { /* sem armazenamento */ }
    const stepPeca = await loadStepText("peca"); // arquivo STEP inteiro (para a peça REAL no 3D)
    const proj = {
      tipo: "TORNO_MASTER_PROJETO",
      versao: 1,
      salvoEm: new Date().toISOString(),
      app: {
        layoutCount, editorTexts, fileNames, activePaneIdx, simMode, simInvertZ, show3DSimulator,
        showPart, showStock, editorBg, graphBg, cursorStyle, partProfile, stockProfile, partZero, stockZero,
        layerColors, syncIncludeNoP, syncIncludeWithP, syncIncludeM2000, ignoredSyncCodes, fixedSimWidth,
      },
      storage,
      stepPeca,
    };
    const base = (fileNames.find((n) => n && n.trim()) || (partProfile && partProfile.name) || "PECA").replace(/\.[^.]+$/, "");
    baixarArquivo(JSON.stringify(proj), base + ".torno", "application/json");
  };

  // Exporta só os programas (.nc), um arquivo por canal que tem texto
  const handleExportNc = () => {
    const n = Math.max(1, Math.min(3, layoutCount || 1));
    let atraso = 0;
    for (let i = 0; i < n; i++) {
      const code = editorTexts[i];
      if (!code || !code.trim()) continue;
      const nome = fileNames[i] || `PROG_CNC_ED${i + 1}.nc`;
      setTimeout(() => baixarArquivo(code, /\.\w+$/.test(nome) ? nome : nome + ".nc"), atraso);
      atraso += 500;
    }
  };

  // Abre um projeto .torno e deixa tudo como estava quando foi salvo
  const aplicarProjeto = async (texto: string) => {
    let p: any;
    try {
      p = JSON.parse(texto);
    } catch {
      alert("Não consegui ler este arquivo de projeto.");
      return;
    }
    if (!p || p.tipo !== "TORNO_MASTER_PROJETO") {
      alert("Este arquivo não é um projeto do Torno Master.");
      return;
    }
    try {
      const apagar: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^cnc/.test(k) && !PROJ_KEYS_FORA.includes(k)) apagar.push(k);
      }
      apagar.forEach((k) => localStorage.removeItem(k)); // tira o que era da peça anterior
      Object.entries(p.storage || {}).forEach(([k, v]) => {
        if (/^cnc/.test(k) && !PROJ_KEYS_FORA.includes(k) && typeof v === "string") localStorage.setItem(k, v);
      });
    } catch { /* sem armazenamento */ }
    if (typeof p.stepPeca === "string" && p.stepPeca) await saveStepText("peca", p.stepPeca);
    const a = p.app || {};
    const tem = (k: string) => Object.prototype.hasOwnProperty.call(a, k);
    const tres = (arr: any) => {
      const t = Array.isArray(arr) ? arr.map((x: any) => (typeof x === "string" ? x : "")) : [];
      while (t.length < 3) t.push("");
      return t;
    };
    if (tem("layoutCount")) setLayoutCount(a.layoutCount);
    if (tem("editorTexts")) setEditorTexts(tres(a.editorTexts));
    if (tem("fileNames")) setFileNames(tres(a.fileNames));
    if (tem("activePaneIdx")) setActivePaneIdx(a.activePaneIdx);
    if (tem("simMode")) setSimMode(a.simMode);
    if (tem("simInvertZ")) setSimInvertZ(a.simInvertZ);
    if (tem("show3DSimulator")) setShow3DSimulator(a.show3DSimulator);
    if (tem("showPart")) setShowPart(a.showPart);
    if (tem("showStock")) setShowStock(a.showStock);
    if (tem("editorBg")) setEditorBg(a.editorBg);
    if (tem("graphBg")) setGraphBg(a.graphBg);
    if (tem("cursorStyle")) setCursorStyle({ ...CURSOR_STYLE_PADRAO, ...(a.cursorStyle || {}) });
    if (tem("partProfile")) setPartProfile(a.partProfile);
    if (tem("stockProfile")) setStockProfile(a.stockProfile);
    if (tem("partZero")) setPartZero(a.partZero);
    if (tem("stockZero")) setStockZero(a.stockZero);
    if (tem("layerColors")) setLayerColors(a.layerColors);
    if (tem("syncIncludeNoP")) setSyncIncludeNoP(a.syncIncludeNoP);
    if (tem("syncIncludeWithP")) setSyncIncludeWithP(a.syncIncludeWithP);
    if (tem("syncIncludeM2000")) setSyncIncludeM2000(a.syncIncludeM2000);
    if (tem("ignoredSyncCodes")) setIgnoredSyncCodes(a.ignoredSyncCodes || []);
    if (tem("fixedSimWidth")) setFixedSimWidth(a.fixedSimWidth);
    setProjVer((v) => v + 1); // recarrega os simuladores 2D/3D com o desenho, caixas e opções do projeto
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
      if (text && text.trimStart().startsWith("{") && text.includes("TORNO_MASTER_PROJETO")) {
        aplicarProjeto(text); // arquivo de PROJETO (.torno): carrega tudo
        return;
      }
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
                          placeholder="Nome e Sobrenome"
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
                          placeholder="E-mail"
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
          
      {/* Arquivo STEP (escondido) + Painel "Peça / Bruto (STEP)" */}
      <input ref={stepInputRef} type="file" accept=".stp,.step,.STP,.STEP" onChange={handleStepFile} className="hidden" />
      {showPartPanel && (
        <div className="fixed top-14 right-4 z-[200] w-80 max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-white text-zinc-800 border border-zinc-300 rounded-xl shadow-2xl p-4 font-sans select-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-sky-600" /> Peça e Bruto (STEP)
            </span>
            <button onClick={() => setShowPartPanel(false)} className="p-1 rounded hover:bg-zinc-100 text-zinc-500" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Caixinhas: escolher se o STEP é da PEÇA ou do BRUTO */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(["peca", "bruto"] as const).map((id) => {
              const loaded = id === "peca" ? !!partProfile : !!stockProfile;
              const sel = stepTarget === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setStepTarget(id);
                    setPartError(null);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-sm font-bold transition ${sel ? "border-sky-500 ring-2 ring-sky-200" : "border-zinc-300 hover:border-zinc-400"}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-sky-600 border-sky-600 text-white" : "border-zinc-400"}`}>
                    {sel && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    {id === "peca" ? "Peça" : "Bruto"}
                    <span className={`text-[10px] font-semibold ${loaded ? "text-emerald-600" : "text-zinc-400"}`}>{loaded ? "● carregado" : "vazio"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {partError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mb-3">{partError}</div>}

          {(() => {
            const isPeca = stepTarget === "peca";
            const prof = isPeca ? partProfile : stockProfile;
            const zero = isPeca ? partZero : stockZero;
            const setZero = isPeca ? setPartZero : setStockZero;
            const shown = isPeca ? showPart : showStock;
            const setShown = isPeca ? setShowPart : setShowStock;
            const doNome = isPeca ? "da peça" : "do bruto";
            const oNome = isPeca ? "a peça" : "o bruto";
            const colorNow = isPeca ? layerColors.peca : layerColors.bruto;
            if (!prof) {
              return (
                <button
                  onClick={() => stepInputRef.current?.click()}
                  className="w-full text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg px-3 py-2.5 flex items-center justify-center gap-2"
                >
                  <Paperclip className="w-4 h-4" /> Anexar STEP {doNome}
                </button>
              );
            }
            return (
              <>
                <div className="text-xs mb-3 leading-relaxed">
                  <b className="block truncate" title={prof.name}>{prof.name}</b>
                  Ø máximo <b>{(prof.rMax * 2).toFixed(3)}</b> mm · comprimento <b>{(prof.aMax - prof.aMin).toFixed(3)}</b> mm
                  {prof.rMinBore !== null && (
                    <>
                      {" "}· furo Ø<b>{(prof.rMinBore * 2).toFixed(3)}</b>
                    </>
                  )}
                </div>
                {prof.facesUsed < prof.facesTotal && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                    {prof.facesTotal - prof.facesUsed} face(s) que não são de torno (rasgos, sextavados, furos fora do centro) não aparecem no perfil.
                  </div>
                )}
                <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Ponto zero (Z0) {doNome}</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {([["direita", "Face direita"], ["esquerda", "Face esquerda (virada)"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setZero((z) => ({ ...z, face: v }))}
                      className={`px-2 py-2 rounded-lg border text-xs font-semibold transition ${zero.face === v ? "border-sky-500 ring-2 ring-sky-200 text-sky-800" : "border-zinc-300 hover:border-zinc-400"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between gap-2 text-xs mb-3">
                  <span className="text-zinc-600">Deslocar o zero em Z (mm)</span>
                  <input
                    key={stepTarget + prof.name + zero.face}
                    type="text"
                    inputMode="decimal"
                    defaultValue={zero.offsetZ}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(",", "."));
                      setZero((z) => ({ ...z, offsetZ: isNaN(v) ? 0 : v }));
                    }}
                    className="w-20 border border-zinc-300 rounded px-1.5 py-1 text-right font-mono focus:outline-none focus:border-sky-500"
                  />
                </label>
                {/* Cor das linhas (3 caixinhas) */}
                <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Cor das linhas {doNome}</div>
                <div className="flex items-center gap-2 mb-3">
                  {[
                    { v: "auto", label: "Cinza", show: "#94a3b8" },
                    { v: "#0ea5e9", label: "Azul", show: "#0ea5e9" },
                    { v: "#f59e0b", label: "Laranja", show: "#f59e0b" },
                  ].map((c) => {
                    const sel = colorNow === c.v;
                    return (
                      <button
                        key={c.v}
                        onClick={() => setLayerColors((prev) => ({ ...prev, [isPeca ? "peca" : "bruto"]: c.v }))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-semibold transition ${sel ? "border-sky-500 ring-2 ring-sky-200" : "border-zinc-300 hover:border-zinc-400"}`}
                      >
                        <span className="w-4 h-4 rounded border border-zinc-400 flex items-center justify-center text-white" style={{ background: c.show }}>
                          {sel && <Check className="w-3 h-3" />}
                        </span>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer">
                  <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} className="accent-sky-600" />
                  Mostrar {oNome} no gráfico
                </label>
                <div className="flex gap-2">
                  <button onClick={() => stepInputRef.current?.click()} className="flex-1 text-xs font-semibold border border-zinc-300 rounded-lg px-2 py-1.5 hover:bg-zinc-100">
                    Trocar arquivo
                  </button>
                  <button
                    onClick={() => {
                      if (isPeca) setPartProfile(null);
                      else setStockProfile(null);
                      setPartError(null);
                    }}
                    className="flex-1 text-xs font-semibold border border-rose-300 text-rose-700 rounded-lg px-2 py-1.5 hover:bg-rose-50"
                  >
                    Tirar {oNome}
                  </button>
                </div>
              </>
            );
          })()}
          <p className="text-[10px] text-zinc-500 leading-snug mt-3">
            O perfil é tirado direto das medidas do CAD (diâmetros, faces, chanfros e raios). A peça aparece em linha cheia e o bruto em linha
            tracejada. A Mira mede as linhas da peça, e com o botão PG do gráfico você toca nos pontos da peça e eles viram linhas do programa.
          </p>
        </div>
      )}
      {/* Painel "Aparência": fundo do editor e do gráfico (escolhas independentes, salvas no tablet) */}
      {showAppearance && (
        <div className="fixed top-14 right-4 z-[200] w-72 bg-white text-zinc-800 border border-zinc-300 rounded-xl shadow-2xl p-4 font-sans select-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold flex items-center gap-1.5"><Palette className="w-4 h-4 text-violet-600" /> Aparência</span>
            <button onClick={() => setShowAppearance(false)} className="p-1 rounded hover:bg-zinc-100 text-zinc-500" title="Fechar"><X className="w-4 h-4" /></button>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Fundo do Editor (programas)</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {([["escuro", "Escuro", "#0d0d11"], ["branco", "Branco", "#ffffff"]] as const).map(([val, label, cor]) => (
              <button key={val} onClick={() => setEditorBg(val)} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-semibold transition ${editorBg === val ? "border-violet-500 ring-2 ring-violet-200" : "border-zinc-300 hover:border-zinc-400"}`}>
                <span className="w-5 h-5 rounded border border-zinc-300" style={{ background: cor }} />
                {label}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Fundo do Gráfico (simulador 2D e 3D)</div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {["", "#ffffff", "#f1f5f9", "#d4d4d8", "#1e293b", "#0b0b12", "#000000"].map((cor) => (
              <button key={cor || "padrao"} onClick={() => setGraphBg(cor)} title={cor ? cor : "Padrão do simulador"} className={`w-7 h-7 rounded-lg border transition text-[9px] font-bold ${graphBg === cor ? "border-violet-500 ring-2 ring-violet-200" : "border-zinc-300 hover:border-zinc-400"}`} style={cor ? { background: cor } : undefined}>
                {cor ? "" : "Auto"}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer" title="Escolher qualquer cor">
              <input type="color" value={graphBg || "#0b0b12"} onChange={(e) => setGraphBg(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-zinc-300 bg-transparent p-0" />
              Outra
            </label>
          </div>
          {/* Mira e quadradinho do desenho: cor em cima da linha, cor no canto/emenda e tamanho */}
          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5 mt-1">Mira e quadradinho do desenho (simulador 2D)</div>
          {([
            ["mira", "Mira", "miraLinha", "miraCanto", "miraTam"],
            ["quad", "Quadradinho do desenho", "quadLinha", "quadCanto", "quadTam"],
          ] as const).map(([k, nome, cLinha, cCanto, tam]) => (
            <div key={k} className="mb-2 rounded-lg border border-zinc-200 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold">{nome}</span>
                <button
                  onClick={() => setCursorStyle((s) => ({ ...s, [cLinha]: CURSOR_STYLE_PADRAO[cLinha], [cCanto]: CURSOR_STYLE_PADRAO[cCanto], [tam]: CURSOR_STYLE_PADRAO[tam] }))}
                  className="text-[10px] text-zinc-500 hover:text-zinc-800 underline"
                  title="Voltar às cores e tamanho originais"
                >
                  padrão
                </button>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
                <label className="flex items-center gap-1 cursor-pointer" title="Cor quando está em cima de uma linha">
                  <input type="color" value={cursorStyle[cLinha]} onChange={(e) => setCursorStyle((s) => ({ ...s, [cLinha]: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border border-zinc-300 bg-transparent p-0" />
                  Na linha
                </label>
                <label className="flex items-center gap-1 cursor-pointer" title="Cor quando acha um canto / emenda do perfil">
                  <input type="color" value={cursorStyle[cCanto]} onChange={(e) => setCursorStyle((s) => ({ ...s, [cCanto]: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border border-zinc-300 bg-transparent p-0" />
                  Canto / emenda
                </label>
                <label className="flex items-center gap-1.5 flex-1 min-w-[150px]" title="Tamanho (100% = original)">
                  Tamanho
                  <input type="range" min={50} max={300} step={10} value={cursorStyle[tam]} onChange={(e) => setCursorStyle((s) => ({ ...s, [tam]: Number(e.target.value) }))} className="flex-1" />
                  <span className="w-10 text-right">{cursorStyle[tam]}%</span>
                </label>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-zinc-500 leading-snug">As escolhas ficam salvas neste tablet. Linhas e textos do gráfico se ajustam sozinhos para continuar legíveis.</p>
        </div>
      )}

          {/* Top Header Toolbar (Collapsible / Minimizable) */}
          {isHeaderMinimized ? (
            <header className={`px-4 py-1.5 flex items-center justify-between gap-2 z-40 shadow-md transition-all duration-200 ${
              isHighContrast 
                ? "bg-zinc-100 border-b-2 border-black text-black" 
                : "bg-[#141418] border-b border-cyan-500/30 text-white"
            }`}>
              <div className="flex items-center gap-2 shrink-0">
                <div className="bg-cyan-950/40 p-1 rounded border border-cyan-500/20">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="font-display font-black text-xs tracking-tight">
                  TORNO <span className={isHighContrast ? "text-[#e65400] font-black" : "text-[#00f3ff]"}>MASTER</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">|</span>
                <span className="text-[10px] font-sans font-semibold text-zinc-300 hidden sm:inline">{clientName}</span>
                <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold hidden md:inline ${
                  isAdmin ? 'bg-[#00f3ff]/20 text-[#00f3ff]' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {isAdmin ? 'Admin' : subscriptionType}
                </span>
              </div>

              {/* Quick compact shortcuts in minimized mode */}
              <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto *:shrink-0">
                {/* Assistant quick button */}
                <button
                  onClick={() => { setShowAssistant(true); setActiveWindowId("assistant"); }}
                  className="bg-cyan-950/20 hover:bg-cyan-950/40 border border-[#00f3ff]/30 text-[#00f3ff] text-[10px] font-bold py-1 px-2 rounded transition flex items-center gap-1"
                  title="Programador Virtual & Tabelas"
                >
                  <Wrench className="w-3 h-3" />
                  <span className="hidden lg:inline">Tabelas</span>
                </button>

          {/* ▶ INICIAR PROGRAMA: assistente que monta o programa a partir da máquina + STEP */}
          <button
            onClick={() => { setRegiaoSel(null); setShowIniciar((v) => !v); }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-2 rounded transition flex items-center gap-1"
            title="Iniciar Programa: escolher máquina, peça (STEP), fixação e operações — o app monta o programa"
          >
            <span>▶</span>
            <span className="hidden lg:inline">Iniciar</span>
          </button>

                {/* Save quick button */}
                <button
                  onClick={handleSaveLocal}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold py-1 px-2 rounded transition flex items-center gap-1"
                  title="Salvar arquivo no disco local"
                >
                  <Save className="w-3 h-3" />
                  <span className="hidden lg:inline">Salvar</span>
                </button>
          {/* Exportar .nc: um arquivo por canal, só os programas (para mandar para a máquina) */}
          <button
            onClick={handleExportNc}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold py-1 px-2 rounded transition flex items-center gap-1"
            title="Exportar só os programas (.nc), um arquivo por canal"
          >
            <FileDown className="w-3 h-3" />
            <span className="hidden lg:inline">.nc</span>
          </button>

            {/* Carregar quick button */}
            <button
              onClick={handleLoadLocal}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold py-1 px-2 rounded transition flex items-center gap-1"
              title="Carregar arquivo do disco local"
            >
              <FolderOpen className="w-3 h-3" />
              <span className="hidden lg:inline">Carregar</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".torno,.txt,.pgm,.nc,.gcode" onChange={handleFileChange} className="hidden" />

                {/* 1 / 2 / 3 Telas compact */}
                <div className="bg-[#101014] p-0.5 rounded border border-zinc-800 flex items-center">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      onClick={() => setLayoutCount(num)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${
                        layoutCount === num
                          ? "bg-[#39ff14]/15 text-[#39ff14]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      title={`${num} ${num === 1 ? "Tela" : "Telas"}`}
                    >
                      {num}T
                    </button>
                  ))}
                </div>

                {/* Quick 3D switch */}
                <button
                  onClick={handleToggle3DSimulator}
                  className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                    show3DSimulator
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                      : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title="Simulador 3D"
                >
                  <Box className="w-3 h-3 text-amber-400" />
                  <span className="hidden md:inline">3D</span>
                </button>

            {/* Simulador (Mini-TV / Fixo / Desligado) quick switch */}
            <button
              onClick={() => setSimMode(prev => prev === "tv" ? "fixed" : prev === "fixed" ? "off" : "tv")}
              className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                simMode !== "off"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Simulador: Mini-TV → Fixo → Desligado"
            >
              <Monitor className="w-3 h-3" />
              <span className="hidden md:inline">{simMode === "tv" ? "Mini-TV" : simMode === "fixed" ? "Fixo" : "Sim. Off"}</span>
            </button>

                {/* Quick Sincronismos switch */}
                <button
                  onClick={() => {
                    if (layoutCount === 1) setLayoutCount(2);
                    setIsSyncWidgetMinimized(prev => !prev);
                  }}
                  className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                    layoutCount > 1 && !isSyncWidgetMinimized
                      ? "bg-cyan-950/50 text-cyan-300 border-cyan-400/70"
                      : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title="Sincronismo de Canais (M200+)"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>Sincronismos</span>
                </button>

            {/* Aparência (fundo do editor e do gráfico) */}
            <button
              onClick={() => setShowAppearance(v => !v)}
              className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                showAppearance
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/50"
                  : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Aparência: fundo do editor e do gráfico"
            >
              <Palette className="w-3 h-3" />
              <span className="hidden md:inline">Aparência</span>
            </button>

                {/* Peça (STEP): anexar o desenho 3D da peça */}
                <button
                  onClick={() => setShowPartPanel((v) => !v)}
                  className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                    partProfile || stockProfile
                      ? "bg-sky-500/15 text-sky-300 border-sky-500/50"
                      : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title="Peça (STEP): anexar o desenho 3D da peça para ver o perfil no gráfico"
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="hidden md:inline">{partProfile || stockProfile ? "Peça" : "STEP"}</span>
                </button>
                {/* Layout Mobile (tablet / celular) - liga/desliga */}
                <button
                  onClick={() => {
                    // Ao ligar o modo mobile, a barra do topo fica compacta para sobrar espaço (o botão Menu continua abrindo tudo)
                    if (!isMobileLayout) setIsHeaderMinimized(true);
                    setIsMobileLayout(!isMobileLayout);
                  }}
                  className={`text-[10px] font-bold px-2 py-1 rounded border transition flex items-center gap-1 cursor-pointer ${
                    isMobileLayout
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                      : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title={isMobileLayout ? "Layout Mobile LIGADO (tablet/celular) - toque para voltar ao layout normal" : "Ligar Layout Mobile (tablet/celular)"}
                >
                  <Smartphone className="w-3 h-3" />
                </button>

                {/* Expand Button */}
                <button
                  onClick={() => setIsHeaderMinimized(false)}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold py-1 px-2 rounded transition flex items-center gap-1 cursor-pointer ml-1"
                  title="Expandir barra superior completa com todos os menus"
                >
                  <ChevronDown className="w-3 h-3" />
                  <span>Menu</span>
                </button>
              </div>
            </header>
          ) : (
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
                  <span>⚠️ ALERTA: Seu acesso está ativo em outro dispositivo!</span>
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
                    onClick={handleExportNc}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                    title="Exportar só os programas (.nc), um arquivo por canal"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    Exportar .nc
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
                  accept=".torno,.txt,.pgm,.nc,.gcode"
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

          {/* Aparência (fundo do editor e do gráfico) */}
          <button
            onClick={() => setShowAppearance(v => !v)}
            className={`p-2 rounded-lg border transition ${
              showAppearance
                ? "bg-violet-500/20 text-violet-300 border-violet-500/50"
                : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-white"
            }`}
            title="Aparência: fundo do editor e do gráfico"
          >
            <Palette className="w-4 h-4" />
          </button>

          {/* Peça (STEP): anexar o desenho 3D da peça */}
          <button
            onClick={() => setShowPartPanel((v) => !v)}
            className={`text-xs font-bold px-3 py-2 rounded-lg border transition flex items-center gap-1.5 ${
              partProfile || stockProfile
                ? "bg-sky-500/15 text-sky-300 border-sky-500/50"
                : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-white"
            }`}
            title="Peça (STEP): anexar o desenho 3D da peça para ver o perfil no gráfico"
          >
            <Paperclip className="w-4 h-4" />
            {partProfile || stockProfile ? "Peça" : "STEP"}
          </button>
          {/* Layout Mobile (tablet / celular) - liga/desliga */}
          <button
            onClick={() => {
                    // Ao ligar o modo mobile, a barra do topo fica compacta para sobrar espaço (o botão Menu continua abrindo tudo)
                    if (!isMobileLayout) setIsHeaderMinimized(true);
                    setIsMobileLayout(!isMobileLayout);
                  }}
            className={`p-2 rounded-lg border transition ${
              isMobileLayout
                ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-white"
            }`}
            title={isMobileLayout ? "Layout Mobile LIGADO (tablet/celular) - toque para voltar ao layout normal" : "Ligar Layout Mobile (tablet/celular)"}
          >
            <Smartphone className="w-4 h-4" />
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

                {/* 3D Simulator Switch (Eixo Y / C - Centro de Usinagem) */}
                <button
                  onClick={handleToggle3DSimulator}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                    show3DSimulator
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-extrabold"
                      : hasYAxisInActiveEditor
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse hover:bg-amber-500/25"
                      : "bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title="Simulador Gráfico 3D para usinagem em Centro de Usinagem / Torno com Eixo Y e C"
                >
                  <Box className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulador 3D</span>
                  {hasYAxisInActiveEditor && (
                    <span className="bg-amber-500 text-black font-extrabold text-[9px] px-1.5 py-0.2 rounded-full uppercase tracking-tighter shadow-sm">
                      Eixo Y
                    </span>
                  )}
                </button>

                <span className="w-[1px] h-6 bg-zinc-800 mx-1" />

                {/* Minimize Header Button */}
                <button
                  onClick={() => setIsHeaderMinimized(true)}
                  className="bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 text-xs font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow ml-0.5"
                  title="Minimizar barra superior para ter mais espaço na tela"
                >
                  <ChevronUp className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold">Minimizar</span>
                </button>

                {/* Sincronismos Button */}
                <button
                  onClick={() => {
                    if (layoutCount === 1) setLayoutCount(2);
                    setIsSyncWidgetMinimized(prev => !prev);
                  }}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition flex items-center gap-1.5 cursor-pointer shadow ml-1 ${
                    layoutCount > 1 && !isSyncWidgetMinimized
                      ? "bg-cyan-950/50 text-cyan-300 border-cyan-400/70 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                      : "bg-[#121216] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700"
                  }`}
                  title="Exibir/Ocultar Painel de Sincronismo de Canais (M200+)"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Sincronismos</span>
                  {Object.keys(syncCodesAnalysis).filter(k => !syncCodesAnalysis[k].isIgnored).length > 0 && (
                    <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold text-[9px] px-1.5 py-0.2 rounded-full">
                      {Object.keys(syncCodesAnalysis).filter(k => !syncCodesAnalysis[k].isIgnored).length}
                    </span>
                  )}
                </button>

                {/* ▶ INICIAR PROGRAMA (também no cabeçalho normal, não só no minimizado) */}
                <button
                  onClick={() => { setRegiaoSel(null); setShowIniciar((v) => !v); }}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition flex items-center gap-1.5 ${showIniciar ? "bg-emerald-600 border-emerald-400 text-white" : "bg-emerald-700/80 hover:bg-emerald-600 border-emerald-500/60 text-white"}`}
                  title="Iniciar Programa: escolher máquina, peça (STEP), fixação e operações — o app monta o programa"
                >
                  <span>▶</span>
                  <span>Iniciar Programa</span>
                </button>
              </div>
            </header>
          )}

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
          <main className={`flex-1 flex flex-col ${isMobileLayout ? "p-2 gap-2" : "lg:flex-row p-4 gap-4"} overflow-hidden relative`}>
            {/* Layout Mobile: escolha o que ver - Programa, Dividido (os dois) ou Gráfico */}
            {isMobileLayout && (
              <div className="flex items-center gap-1 shrink-0 bg-[#121216] border border-zinc-800 rounded-lg p-1 self-center">
                {([["programa", "📝 Programa"], ["dividido", "⇅ Dividido"], ["grafico", "📈 Gráfico"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => {
                      setMobileView(v);
                      if (v !== "programa" && simMode === "off") setSimMode("fixed");
                    }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-md transition ${
                      mobileView === v ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            
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

            {/* Multi-channel Sync Codes Floating Widget */}
            {layoutCount > 1 && (
              <div
                onPointerDown={handleSyncWidgetPointerDown}
                onPointerMove={handleSyncWidgetPointerMove}
                onPointerUp={handleSyncWidgetPointerUp}
                style={{
                  position: "fixed",
                  left: `${syncWidgetPos.x}px`,
                  top: `${syncWidgetPos.y}px`,
                  width: isSyncWidgetMinimized ? "auto" : `${syncWidgetSize.width}px`,
                  height: isSyncWidgetMinimized ? "auto" : `${syncWidgetSize.height}px`,
                  zIndex: 100000,
                  touchAction: "none",
                }}
                className={`flex flex-col shadow-2xl transition-shadow duration-200 pointer-events-auto select-none relative ${
                  isSyncWidgetMinimized 
                    ? "rounded-full border border-cyan-500/30 bg-[#121217]/95 p-1.5 px-3 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-[#181822]/95" 
                    : "rounded-xl border border-zinc-850 bg-[#121217]/95 p-3 cursor-default"
                }`}
              >
                {isSyncWidgetMinimized ? (
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        Object.values(syncCodesAnalysis).every((info: any) => info.isSynchronized) 
                          ? "bg-emerald-400" 
                          : "bg-rose-400"
                      }`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        Object.values(syncCodesAnalysis).every((info: any) => info.isSynchronized) 
                          ? "bg-emerald-500" 
                          : "bg-rose-500"
                      }`} />
                    </span>
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-mono cursor-pointer">
                      Sincronismo ({Object.keys(syncCodesAnalysis).filter(k => !syncCodesAnalysis[k].isIgnored).length})
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col h-full w-full relative overflow-hidden">
                    {/* Header */}
                    <div className="drag-handle flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-2 cursor-grab active:cursor-grabbing shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            Object.values(syncCodesAnalysis).every((info: any) => info.isSynchronized) 
                              ? "bg-emerald-400" 
                              : "bg-rose-400"
                          }`} />
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${
                            Object.values(syncCodesAnalysis).every((info: any) => info.isSynchronized) 
                              ? "bg-emerald-500" 
                              : "bg-rose-500"
                          }`} />
                        </span>
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                          Sincronismo de Canais
                        </span>
                      </div>
                      <button
                        onClick={() => setIsSyncWidgetMinimized(true)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition"
                        title="Minimizar painel"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-[10px] text-zinc-500 mb-1.5 font-sans leading-snug shrink-0">
                      Clique em um código abaixo para alinhar todas as telas de programa nele.
                    </p>

                    {/* Types of Sync Toggles */}
                    <div className="flex flex-wrap items-center gap-2 py-1.5 px-2 mb-2 bg-zinc-900/50 border border-zinc-850 rounded-lg shrink-0 text-[10px] font-sans">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Analisar:</span>
                      <label className="flex items-center gap-1 cursor-pointer text-zinc-300 hover:text-white select-none" title="Analisar códigos M200+ sem sufixo P">
                        <input
                          type="checkbox"
                          checked={syncIncludeNoP}
                          onChange={(e) => setSyncIncludeNoP(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 bg-zinc-900 cursor-pointer"
                        />
                        <span>M200+ Sem P</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-zinc-300 hover:text-white select-none" title="Analisar códigos M com sufixo P">
                        <input
                          type="checkbox"
                          checked={syncIncludeWithP}
                          onChange={(e) => setSyncIncludeWithP(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 bg-zinc-900 cursor-pointer"
                        />
                        <span>M200+ Com P</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-zinc-300 hover:text-white select-none" title="Analisar sincronismos M2000 até M2999">
                        <input
                          type="checkbox"
                          checked={syncIncludeM2000}
                          onChange={(e) => setSyncIncludeM2000(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 bg-zinc-900 cursor-pointer"
                        />
                        <span className="text-cyan-300 font-bold">M2000-M2999</span>
                      </label>
                    </div>

                    {/* Code List */}
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 min-h-0">
                      {Object.keys(syncCodesAnalysis)
                        .sort()
                        .filter((mCode) => !syncCodesAnalysis[mCode].isIgnored)
                        .map((mCode) => {
                          const info = syncCodesAnalysis[mCode];
                          const label = info.pVal ? `${mCode}P${info.pVal}` : mCode;
                          
                          if (codeToConfirmIgnore === mCode) {
                            return (
                              <div key={mCode} className="text-[11px] w-full p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex flex-col gap-1.5 shrink-0">
                                <span className="font-sans text-yellow-200 text-[10px] leading-tight">Ignorar sincronismo do {label}?</span>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => setCodeToConfirmIgnore(null)}
                                    className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white text-[9px] font-sans"
                                  >
                                    Não
                                  </button>
                                  <button
                                    onClick={() => {
                                      setIgnoredSyncCodes(prev => [...prev, mCode]);
                                      setCodeToConfirmIgnore(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700 text-[9px] font-sans font-bold"
                                  >
                                    Sim, ignorar
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={mCode}
                              onClick={() => handleAlignAllEditorsToMCode(mCode)}
                              className={`text-[11px] w-full px-2 py-1.5 rounded-lg font-mono font-bold transition duration-200 flex items-center justify-between border shrink-0 cursor-pointer ${
                                info.isSynchronized
                                  ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15"
                                  : "bg-rose-500/5 text-rose-400 border-rose-500/20 hover:bg-rose-500/15"
                              }`}
                              title={
                                info.isSynchronized
                                  ? `✓ Sincronizado nos Canais ${info.targets.join(", ")}. Clique para alinhar.`
                                  : `⚠️ Problema no Sincronismo!\n` +
                                    (info.missingChannels.length > 0 ? `• Faltando nos Canais: ${info.missingChannels.join(", ")}\n` : "") +
                                    (info.mismatchedChannels.length > 0 ? `• Divergente nos Canais: ${info.mismatchedChannels.join(", ")}\n` : "") +
                                    `Clique para tentar alinhar.`
                              }
                            >
                              <div className="flex items-center gap-2">
                                <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    onChange={() => setCodeToConfirmIgnore(mCode)}
                                    className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 cursor-pointer bg-zinc-900 shrink-0"
                                    title="Desconsiderar sincronismo"
                                  />
                                </div>
                                <span className="flex items-center gap-1.5 text-left">
                                  <span className={`w-1.5 h-1.5 rounded-full ${info.isSynchronized ? "bg-emerald-400" : "bg-rose-400"}`} />
                                  <span>{label}</span>
                                </span>
                              </div>
                              <span className="text-[9px] opacity-75 font-normal px-1 bg-black/30 rounded shrink-0">
                                {info.isSynchronized ? "OK" : info.missingChannels.length > 0 ? `Falta C${info.missingChannels.join(",")}` : "Diverg."}
                              </span>
                            </div>
                          );
                        })}

                      {Object.keys(syncCodesAnalysis).filter((mCode) => !syncCodesAnalysis[mCode].isIgnored).length === 0 && (
                        <div className="flex flex-col items-center justify-center py-6 text-zinc-500 text-[11px] font-sans text-center">
                          Nenhum código de sincronismo ativo.
                        </div>
                      )}
                    </div>

                    {/* Sincronizar de Novo button if there are ignored codes */}
                    {ignoredSyncCodes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/50 shrink-0">
                        <button
                          onClick={() => setIgnoredSyncCodes([])}
                          className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 font-sans flex items-center justify-center gap-1 py-1 px-2 border border-cyan-500/20 rounded-md bg-cyan-500/5 hover:bg-cyan-500/10 transition-all"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Sincronizar de novo ({ignoredSyncCodes.length})</span>
                        </button>
                      </div>
                    )}

                    {/* Prominent, easy-to-grab resizing handle in bottom right */}
                    <div
                      onPointerDown={handleResizePointerDown}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      className="absolute bottom-1 right-1 cursor-se-resize w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-cyan-300 active:text-cyan-200 transition bg-zinc-800/90 hover:bg-zinc-700 rounded-md border border-zinc-700/80 shadow-lg z-50 group"
                      title="Clique e arraste para redimensionar a janela de sincronismo"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current text-zinc-400 group-hover:text-cyan-300 transition">
                        <path d="M8 0 L10 0 L10 10 L0 10 L0 8 L5 8 L5 5 L3 5 L3 3 L5 3 L5 0 Z" opacity="0.4" />
                        <path d="M10 10 L0 10 L10 0 Z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ▶ PAINEL "Programa da peça" (fica no lugar dos editores enquanto você monta) */}
            {showIniciar && (
              <PainelPrograma
                key={"painel" + projVer}
                partProfile={partProfile}
                partZero={partZero}
                setPartZero={setPartZero}
                onSentidoZ={setZSinal}
                stockProfile={stockProfile}
                showStock={showStock}
                setShowStock={setShowStock}
                onAnexarStep={(alvo) => { setStepTarget(alvo); setTimeout(() => stepInputRef.current?.click(), 0); }}
                regiaoSel={regiaoSel}
                setRegiaoSel={setRegiaoSel}
                pick={regiaoPick}
                onRegioes={setPainelRegioes}
                onFix={(zones) => setFixComando((c) => ({ seq: (c ? c.seq : 0) + 1, zones }))}
                onGerar={(r, vivo) => {
                  // programa ÚNICO no CANAL 1 (H1/H2 marcado em cada ferramenta); o canal 2 não é mexido
                  setEditorTexts((t) => [r.textos[0], t[1] || "", t[2] || ""]);
                  setFileNames((f) => [r.nomes[1], f[1] || "", f[2] || ""]);
                  setActivePaneIdx(0);
                  if (!vivo) {
                    setRegiaoSel(null);
                    setShowIniciar(false);
                  }
                }}
                onClose={() => { setRegiaoSel(null); setShowIniciar(false); }}
              />
            )}
            {/* Left side Split Editors Column */}
            <div className={`flex-1 min-w-0 min-h-0 flex flex-col md:flex-row gap-3 overflow-x-auto overflow-y-hidden pb-1 ${(isMobileLayout && mobileView === "grafico") || showIniciar ? "hidden" : ""}`}>
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
                  isHighContrast={isHighContrast || editorBg === "branco"}
                  fileName={fileNames[idx]}
                  onToggleFloatingCalculator={() => setIsFloatingCalcOpen(prev => !prev)}
                  isFloatingCalculatorOpen={isFloatingCalcOpen}
                  allEditorTexts={editorTexts}
                  layoutCount={layoutCount}
                  syncCodesAnalysis={syncCodesAnalysis}
                  syncIncludeNoP={syncIncludeNoP}
                  syncIncludeWithP={syncIncludeWithP}
                  syncIncludeM2000={syncIncludeM2000}
                />
              ))}
            </div>

            {/* Floating Simulator (Mini-TV Panel) */}
            {!isMobileLayout && simMode === 'tv' && (
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
                  {show3DSimulator ? (
                    <CNCSimulator3D
                      key={"proj" + projVer}
                      partLayers={partLayers}
                      partSolid={partSolid}
                      gcodeText={editorTexts[activePaneIdx]}
                      activeLine={activeLine}
                      onLineChange={analyzeActiveLine}
                      isHighContrast={isHighContrast}
                      onClose={() => setShow3DSimulator(false)}
                bgColor={graphBg || undefined}
                    />
                  ) : (
                    <CNCSimulator
                      key={"proj" + projVer}
                      regiaoModo={showIniciar && regiaoSel ? regiaoSel.modo : null}
                      onRegiaoPick={(r) => setRegiaoPick((p) => ({ seq: (p ? p.seq : 0) + 1, r }))}
                      regioes={showIniciar ? painelRegioes : undefined}
                      fixComando={fixComando}
                      gcodeText={editorTexts[activePaneIdx]}
                      activeLine={activeLine}
                      onLineChange={analyzeActiveLine}
                      simInvertZ={simInvertZ}
                      onToggleZInvert={() => setSimInvertZ(!simInvertZ)}
                      isDriverActive={isDriverActive}
                      setIsDriverActive={setIsDriverActive}
                      isHighContrast={isHighContrast}
                      onError={setDiagnosticError}
                bgColor={graphBg || undefined}
                cursorStyle={cursorStyle}
                partLayers={partLayers}
                onInsertPoint={handleInsertProgramPoint}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Right side Simulator Stage (Only when NOT floating) */}
            {(isMobileLayout ? simMode !== 'off' : simMode === 'fixed') && (
              <div 
                className={isMobileLayout ? `relative flex w-full min-h-0 flex-1 select-none ${mobileView === "programa" ? "hidden" : ""}` : "relative flex shrink-0 w-full max-w-full h-[400px] lg:h-full group select-none"}
                style={isMobileLayout ? undefined : { width: `${fixedSimWidth}px` }}
              >
                {/* Resizable Left Edge Handle */}
                <div
                  onPointerDown={handleFixedSimResizeDown}
                  onPointerMove={handleFixedSimResizeMove}
                  onPointerUp={handleFixedSimResizeUp}
                  onPointerCancel={handleFixedSimResizeUp}
                  className={`${isMobileLayout ? "hidden " : ""}absolute -left-3 top-0 bottom-0 w-5 z-30 cursor-ew-resize flex items-center justify-center select-none group/handle touch-none`}
                  title="Clique e arraste para a esquerda ou direita para ajustar o tamanho do simulador"
                >
                  <div className={`w-2 h-14 rounded-full transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
                    isResizingFixedSim 
                      ? "bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)] scale-y-110" 
                      : "bg-zinc-700/80 hover:bg-cyan-400 group-hover/handle:bg-cyan-400 group-hover/handle:shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                  }`}>
                    <div className="w-0.5 h-1 bg-white/70 rounded-full" />
                    <div className="w-0.5 h-1 bg-white/70 rounded-full" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 h-full">
                  {show3DSimulator ? (
                    <CNCSimulator3D
                      key={"proj" + projVer}
                      partLayers={partLayers}
                      partSolid={partSolid}
                      gcodeText={editorTexts[activePaneIdx]}
                      activeLine={activeLine}
                      onLineChange={analyzeActiveLine}
                      isHighContrast={isHighContrast}
                      onClose={() => setShow3DSimulator(false)}
                bgColor={graphBg || undefined}
                    />
                  ) : (
                    <CNCSimulator
                      key={"proj" + projVer}
                      regiaoModo={showIniciar && regiaoSel ? regiaoSel.modo : null}
                      onRegiaoPick={(r) => setRegiaoPick((p) => ({ seq: (p ? p.seq : 0) + 1, r }))}
                      regioes={showIniciar ? painelRegioes : undefined}
                      fixComando={fixComando}
                      gcodeText={editorTexts[activePaneIdx]}
                      activeLine={activeLine}
                      onLineChange={analyzeActiveLine}
                      simInvertZ={simInvertZ}
                      onToggleZInvert={() => setSimInvertZ(!simInvertZ)}
                      isDriverActive={isDriverActive}
                      setIsDriverActive={setIsDriverActive}
                      onError={setDiagnosticError}
                bgColor={graphBg || undefined}
                cursorStyle={cursorStyle}
                partLayers={partLayers}
                onInsertPoint={handleInsertProgramPoint}
                    />
                  )}
                </div>
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
                  else if (type === "tolerance") { setShowToleranceCalc(true); setActiveWindowId("tolerance"); }
                else if (type === "ciclos") { setShowCycleGen(true); setActiveWindowId("ciclos"); }
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

          {/* Gerador de Ciclos Fanuc (G71, G72, G73, G90, G94, G75, G74, G83/84/85, G92, G76) */}
          {showCycleGen && (
            <FloatingWindow
              id="ciclos"
              title="Gerador de Ciclos Fanuc"
              onClose={() => setShowCycleGen(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="980px"
              defaultHeight="680px"
              minWidth="360px"
              minHeight="320px"
            >
              <CycleGenerator onInsertCode={handleInsertCalculatedCode} />
            </FloatingWindow>
          )}

          {/* Tolerance & Fit Calculator modal */}
          {showToleranceCalc && (
            <FloatingWindow
              id="tolerance"
              title="Ajustes e Tolerâncias ISO / Cota Ideal"
              onClose={() => setShowToleranceCalc(false)}
              activeWindowId={activeWindowId}
              onFocus={setActiveWindowId}
              defaultWidth="900px"
              defaultHeight="650px"
              minWidth="450px"
              minHeight="350px"
            >
              <ToleranceCalculator
                onClose={() => setShowToleranceCalc(false)}
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
              Esta licença já está sendo utilizada em <span className="text-red-400 font-bold">3 ou mais computadores/celulares</span> simultaneamente neste momento.
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
      {/* (▶ o assistente virou o painel "Programa da peça", no lugar dos editores) */}
    </div>
  );
}


/* =====================================================================================
 * ▶ PROGRAMA DA PEÇA - painel de operações (estilo árvore do SolidCAM, simples)
 * Fica no lugar do editor enquanto você monta; a peça fica no simulador 2D ao lado.
 * Cada operação: ferramenta, ciclo ligado/desligado, dados de corte e a REGIÃO que ela usina
 * (marcada clicando na peça: começo/fim ou linha por linha). Fixações liga/desliga.
 * Gera o CANAL 1 (lado 1 / HEAD1, arquivo .P-2) e o CANAL 2 (lado 2 / HEAD2, contrafuso).
 * Máquina desta versão: Ergomat TBSy 60. SEMPRE conferir o programa antes de rodar.
 * ===================================================================================== */
type TMPt = { x: number; z: number };
type TMIntervalo = { zA: number; zB: number; xa: number; xb: number };
type TMFaixa = [number, number];
type TMOpTipo = "face" | "desbExt" | "acabExt" | "canal" | "canalInt" | "roscaExt" | "centro" | "furo" | "desbInt" | "acabInt" | "roscaInt" | "macho" | "corte";
interface TMOp {
  id: string;
  tipo: TMOpTipo;
  ativo: boolean;
  ferr: string;
  ciclo: boolean;
  cor: string;
  faixas: TMFaixa[];
  p: Record<string, number>;
  nomeFerr?: string; // nome da ferramenta
  cab?: "H1" | "H2"; // onde fica na máquina: H1 = HEAD1 torre inferior (canal 1) | H2 = HEAD2 torre superior (canal 2)
  cicloSel?: string; // qual ciclo foi escolhido quando a operação tem mais de um (ex.: faceamento G94 / G72 / G75)
  orig?: number; // origem (zero peça) 1 = G54, 2 = G55... definida na seção ORIGENS
}
type TMParam = { k: string; rot: string; def: number; step: number; so?: string[]; rotPor?: Record<string, string>; opcoes?: string[]; soUso?: number[]; check?: boolean; quando?: [string, number[]] }; // check = caixinha; quando = só aparece se outro campo tiver esse valor // soUso = só aparece nesse "Uso do ciclo" (0 auto, 1 canal, 2 faceamento) // so = só aparece nesses ciclos ("LINHA" = sem ciclo)
// Caixa de número: fica parada, seleciona tudo ao clicar, aceita vírgula e sinal de menos
const TMNum: React.FC<{ v: number; set: (n: number) => void; cls: string }> = ({ v, set, cls }) => {
  const [txt, setTxt] = useState<string | null>(null);
  const mostra = txt !== null ? txt : String(v).replace(".", ",");
  return (
    <input
      type="text"
      inputMode="decimal"
      value={mostra}
      onFocus={(e) => { setTxt(String(v).replace(".", ",")); const el = e.target; setTimeout(() => el.select(), 0); }}
      onChange={(e) => { const t = e.target.value; setTxt(t); const n = parseFloat(t.replace(",", ".")); if (!isNaN(n)) set(n); }}
      onClick={(e) => (e.target as HTMLInputElement).select()}
      onBlur={() => setTxt(null)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cls}
    />
  );
};
// explicação do ciclo escolhido (aparece dentro da operação)
const TM_CICLO_DICA: Record<string, string> = {
  LINHA: "Sem ciclo: o app escreve linha a linha (G00 / G01).",
  G94: "G94 X(Ø final) Z(face) F — ciclo de FACE: uma passada por Z, repete só o Z a cada passe.",
  G72: "G72 W(passe) R(recuo) / G72 P Q U W F — desbaste TRANSVERSAL pelo perfil (passes em Z, corte em X).",
  G75: "G75 R / G75 X(Ø final) Z P(pica-pau X) Q(passo Z) F — ferramenta de CANAL (bedame) mergulhando em X.",
  G74: "G74 R / G74 X(Ø final) Z P(passo X) Q(pica-pau Z) F — avanço em Z (axial) e passo em X.",
  G71: "G71 U(passe) R(recuo) / G71 P Q U W F — desbaste LONGITUDINAL pelo perfil.",
  G70: "G70 P Q — acabamento pelo mesmo perfil do G71/G72.",
  G76: "G76 P(mmrraa) Q R / G76 X Z P(altura) Q(1º passe) F(passo) — rosca.",
  G83: "G83 X0 Z Q(pica-pau) F — furação com quebra-cavaco.",
  G84: "G84 Z F(passo) — macho rígido.",
};

const TM_CORES = ["#22d3ee", "#a3e635", "#f472b6", "#fb923c", "#c084fc", "#facc15", "#60a5fa", "#34d399", "#f87171", "#e879f9", "#fbbf24", "#2dd4bf"];

const TM_TIPOS: Record<TMOpTipo, { nome: string; grupo: string; regiao: boolean; ciclo: string; ferr: string; params: TMParam[]; ciclos?: string[] }> = {
  face: { nome: "Faceamento", grupo: "EXTERNO", regiao: true, ciclo: "G94", ciclos: ["G94", "G72", "G75", "G74"], ferr: "T0101", params: [
    { k: "vc", rot: "Vc m/min", def: 180, step: 5 }, { k: "mr", rot: "Rotação", def: 0, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.15, step: 0.01 }, { k: "sobre", rot: "Sobremetal face mm", def: 0.5, step: 0.1 }, { k: "ap", rot: "Prof. por passe Z mm", def: 1.5, step: 0.1, so: ["LINHA", "G94"] }, { k: "xi", rot: "Ø inicial X (0 = fora do bruto)", def: 0, step: 0.1 }, { k: "xf", rot: "Ø final X (centro = -1.6)", def: -1.6, step: 0.1 },
    { k: "pw", rot: "Passe W (prof. por passe) mm", def: 1, step: 0.1, so: ["G72"] }, { k: "ru", rot: "Sobremetal U (X) mm", def: 0, step: 0.05, so: ["G72"] }, { k: "rw", rot: "Sobremetal W (Z) mm", def: 0, step: 0.05, so: ["G72"] },
    { k: "re", rot: "Recuo R (1º bloco) mm", def: 0.5, step: 0.1, so: ["G72", "G75", "G74"] },
    { k: "pp", rot: "Pica-pau mm", def: 1, step: 0.1, so: ["G75", "G74"], rotPor: { G75: "Pica-pau em X (P) mm", G74: "Pica-pau em Z (Q) mm" } },
    { k: "ps", rot: "Passo mm (0 = 80% da largura)", def: 0, step: 0.1, so: ["G75", "G74"], rotPor: { G75: "Passo em Z (Q) mm (0 = 80% larg.)", G74: "Passo em X (P) mm (0 = 80% larg.)" } },
    { k: "ra", rot: "Alívio no fundo R (2º bloco) mm", def: 0.2, step: 0.05, so: ["G75", "G74"], soUso: [0, 2] },
    { k: "uso", rot: "Uso do ciclo", def: 0, step: 1, so: ["G75", "G74"], opcoes: ["Automático", "Canal (sem alívio)", "Faceamento"] },
    { k: "larg", rot: "Largura da ferramenta mm (para a conta)", def: 3, step: 0.1, so: ["G75", "G74"] }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  desbExt: { nome: "Desbaste externo", grupo: "EXTERNO", regiao: true, ciclo: "G71", ferr: "T0101", params: [
    { k: "vc", rot: "Vc m/min", def: 180, step: 5 }, { k: "mr", rot: "Rotação", def: 0, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.25, step: 0.01 }, { k: "ap", rot: "Prof. por passe mm", def: 1.5, step: 0.1 }, { k: "u", rot: "Sobremetal X (U) mm", def: 0.4, step: 0.05 }, { k: "w", rot: "Sobremetal Z (W) mm", def: 0.1, step: 0.05 }, { k: "real", rot: "Entrar nos rebaixos (1=sim)", def: 0, step: 1, so: ["LINHA"] }, { k: "pas", rot: "Pastilha (limita o mergulho)", def: 2, step: 1, opcoes: ["CNMG/WNMG 80° (0°)", "DNMG 55° (27°)", "TNMG 60° (27°)", "VNMG/VBMT 35° (50°)"] }, { k: "ang", rot: "Ângulo de mergulho ° (0 = o da pastilha)", def: 0, step: 1 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  acabExt: { nome: "Acabamento externo", grupo: "EXTERNO", regiao: true, ciclo: "G70", ferr: "T0202", params: [
    { k: "vc", rot: "Vc m/min", def: 220, step: 5 }, { k: "mr", rot: "Rotação", def: 0, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.1, step: 0.01 }, { k: "real", rot: "Entrar nos rebaixos (1=sim)", def: 0, step: 1 }, { k: "pas", rot: "Pastilha (limita o mergulho)", def: 2, step: 1, opcoes: ["CNMG/WNMG 80° (0°)", "DNMG 55° (27°)", "TNMG 60° (27°)", "VNMG/VBMT 35° (50°)"] }, { k: "ang", rot: "Ângulo de mergulho ° (0 = o da pastilha)", def: 0, step: 1 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  canal: { nome: "Canal", grupo: "EXTERNO", regiao: true, ciclo: "G75", ferr: "T0303", params: [
    { k: "vc", rot: "Vc m/min", def: 120, step: 5 }, { k: "mr", rot: "Rotação", def: 1, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.05, step: 0.01 }, { k: "larg", rot: "Largura bedame mm", def: 3, step: 0.1 }, { k: "pk", rot: "Pica-pau em X (P) mm", def: 1, step: 0.1 }, { k: "ps", rot: "Passo em Z (Q) mm (0 = 80% larg.)", def: 0, step: 0.1, so: ["G75"] }, { k: "re", rot: "Recuo R (1º bloco) mm", def: 0.5, step: 0.1, so: ["G75"] }, { k: "ra", rot: "Alívio no fundo R (2º bloco) mm", def: 0.2, step: 0.05, so: ["G75"], soUso: [2] }, { k: "uso", rot: "Uso do ciclo", def: 0, step: 1, so: ["G75"], opcoes: ["Automático (canal)", "Canal (sem alívio)", "Faceamento"] },
    { k: "ref", rot: "Lado de referência do bedame", def: 0, step: 1, so: ["LINHA"], opcoes: ["Lado 1 (frente, Z+)", "Lado 2 (placa, Z-)"] }, { k: "inc", rot: "Incremento por passada Z mm (0 = 80% larg.)", def: 0, step: 0.1, so: ["LINHA"] },
    { k: "sx", rot: "Sobremetal X p/ acabamento (Ø) mm", def: 0.2, step: 0.05, so: ["LINHA"] }, { k: "sz", rot: "Sobremetal Z p/ acabamento mm", def: 0.1, step: 0.05, so: ["LINHA"] },
    { k: "acab", rot: "Passe de acabamento no perfil", def: 0, step: 1, so: ["LINHA"], check: true }, { k: "fa", rot: "Avanço do acabamento mm/v", def: 0.03, step: 0.01, so: ["LINHA"], quando: ["acab", [1]] }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  canalInt: { nome: "Canal interno", grupo: "INTERNO", regiao: true, ciclo: "G75", ferr: "T1010", params: [
    { k: "vc", rot: "Vc m/min", def: 120, step: 5 }, { k: "mr", rot: "Rotação", def: 1, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.05, step: 0.01 }, { k: "larg", rot: "Largura bedame mm", def: 3, step: 0.1 }, { k: "pk", rot: "Pica-pau em X (P) mm", def: 1, step: 0.1 }, { k: "ps", rot: "Passo em Z (Q) mm (0 = 80% larg.)", def: 0, step: 0.1, so: ["G75"] }, { k: "re", rot: "Recuo R (1º bloco) mm", def: 0.5, step: 0.1, so: ["G75"] }, { k: "ra", rot: "Alívio no fundo R (2º bloco) mm", def: 0.2, step: 0.05, so: ["G75"], soUso: [2] }, { k: "uso", rot: "Uso do ciclo", def: 0, step: 1, so: ["G75"], opcoes: ["Automático (canal)", "Canal (sem alívio)", "Faceamento"] },
    { k: "ref", rot: "Lado de referência do bedame", def: 0, step: 1, so: ["LINHA"], opcoes: ["Lado 1 (frente, Z+)", "Lado 2 (placa, Z-)"] }, { k: "inc", rot: "Incremento por passada Z mm (0 = 80% larg.)", def: 0, step: 0.1, so: ["LINHA"] },
    { k: "sx", rot: "Sobremetal X p/ acabamento (Ø) mm", def: 0.2, step: 0.05, so: ["LINHA"] }, { k: "sz", rot: "Sobremetal Z p/ acabamento mm", def: 0.1, step: 0.05, so: ["LINHA"] },
    { k: "acab", rot: "Passe de acabamento no perfil", def: 0, step: 1, so: ["LINHA"], check: true }, { k: "fa", rot: "Avanço do acabamento mm/v", def: 0.03, step: 0.01, so: ["LINHA"], quando: ["acab", [1]] }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 }, { k: "fi", rot: "Recuo X interno Ø mm (afasta da parede)", def: 1, step: 0.1 }, { k: "bm", rot: "Diâmetro máximo da barra mm (0 = não conferir)", def: 0, step: 0.5 } ] },
  roscaExt: { nome: "Rosca externa", grupo: "EXTERNO", regiao: true, ciclo: "G76", ferr: "T0404", params: [
    { k: "rpm", rot: "Rotação rpm", def: 800, step: 50 }, { k: "passo", rot: "Passo mm", def: 1.5, step: 0.05 }, { k: "h", rot: "Altura filete mm (0=auto)", def: 0, step: 0.01 }, { k: "q", rot: "1º passe mm", def: 0.25, step: 0.01 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  centro: { nome: "Furo de centro", grupo: "INTERNO", regiao: true, ciclo: "", ferr: "T0505", params: [
    { k: "rpm", rot: "Rotação rpm", def: 1500, step: 50 }, { k: "f", rot: "Avanço mm/v", def: 0.08, step: 0.01 }, { k: "prof", rot: "Profundidade mm", def: 2, step: 0.1 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  furo: { nome: "Furação", grupo: "INTERNO", regiao: true, ciclo: "G83", ferr: "T0606", params: [
    { k: "rpm", rot: "Rotação rpm", def: 1200, step: 50 }, { k: "f", rot: "Avanço mm/v", def: 0.1, step: 0.01 }, { k: "d", rot: "Ø broca mm", def: 8, step: 0.1 }, { k: "q", rot: "Pica-pau Q mm", def: 5, step: 0.5 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  desbInt: { nome: "Desbaste interno", grupo: "INTERNO", regiao: true, ciclo: "G71", ferr: "T0707", params: [
    { k: "vc", rot: "Vc m/min", def: 150, step: 5 }, { k: "mr", rot: "Rotação", def: 0, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.2, step: 0.01 }, { k: "ap", rot: "Prof. por passe mm", def: 1, step: 0.1 }, { k: "u", rot: "Sobremetal X (U) mm", def: 0.3, step: 0.05 }, { k: "w", rot: "Sobremetal Z (W) mm", def: 0.1, step: 0.05 }, { k: "d0", rot: "Ø pré-furo mm", def: 8, step: 0.1 }, { k: "real", rot: "Entrar nos rebaixos (1=sim)", def: 0, step: 1, so: ["LINHA"] }, { k: "pas", rot: "Pastilha (limita o mergulho)", def: 2, step: 1, opcoes: ["CNMG/WNMG 80° (0°)", "DNMG 55° (27°)", "TNMG 60° (27°)", "VNMG/VBMT 35° (50°)"] }, { k: "ang", rot: "Ângulo de mergulho ° (0 = o da pastilha)", def: 0, step: 1 }, { k: "fi", rot: "Recuo X interno Ø mm (afasta da parede)", def: 1, step: 0.1 }, { k: "bm", rot: "Diâmetro máximo da barra mm (0 = não conferir)", def: 0, step: 0.5 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  acabInt: { nome: "Acabamento interno", grupo: "INTERNO", regiao: true, ciclo: "G70", ferr: "T0808", params: [
    { k: "vc", rot: "Vc m/min", def: 180, step: 5 }, { k: "mr", rot: "Rotação", def: 0, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.08, step: 0.01 }, { k: "d0", rot: "Ø pré-furo mm", def: 8, step: 0.1 }, { k: "real", rot: "Entrar nos rebaixos (1=sim)", def: 0, step: 1 }, { k: "pas", rot: "Pastilha (limita o mergulho)", def: 2, step: 1, opcoes: ["CNMG/WNMG 80° (0°)", "DNMG 55° (27°)", "TNMG 60° (27°)", "VNMG/VBMT 35° (50°)"] }, { k: "ang", rot: "Ângulo de mergulho ° (0 = o da pastilha)", def: 0, step: 1 }, { k: "fi", rot: "Recuo X interno Ø mm (afasta da parede)", def: 1, step: 0.1 }, { k: "bm", rot: "Diâmetro máximo da barra mm (0 = não conferir)", def: 0, step: 0.5 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  roscaInt: { nome: "Rosca interna", grupo: "INTERNO", regiao: true, ciclo: "G76", ferr: "T0909", params: [
    { k: "rpm", rot: "Rotação rpm", def: 600, step: 50 }, { k: "passo", rot: "Passo mm", def: 1.5, step: 0.05 }, { k: "h", rot: "Altura filete mm (0=auto)", def: 0, step: 0.01 }, { k: "q", rot: "1º passe mm", def: 0.2, step: 0.01 }, { k: "d0", rot: "Ø menor (furo) mm", def: 0, step: 0.1 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  macho: { nome: "Rosca com macho", grupo: "INTERNO", regiao: true, ciclo: "G84", ferr: "T1010", params: [
    { k: "rpm", rot: "Rotação rpm", def: 300, step: 10 }, { k: "passo", rot: "Passo mm", def: 1.5, step: 0.05 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
  corte: { nome: "Corte", grupo: "FINAL", regiao: true, ciclo: "", ferr: "T0404", params: [
    { k: "vc", rot: "Vc m/min", def: 100, step: 5 }, { k: "mr", rot: "Rotação", def: 1, step: 1, opcoes: ["G96 Vc constante + G92 limite", "G97 rotação fixa"] }, { k: "lim", rot: "Limite de rotação G92 S (rpm)", def: 3000, step: 100, quando: ["mr", [0]] }, { k: "rpm", rot: "Rotação fixa G97 S rpm (0 = calcula pela Vc)", def: 0, step: 50, quando: ["mr", [1]] }, { k: "f", rot: "Avanço mm/v", def: 0.05, step: 0.01 }, { k: "larg", rot: "Largura bedame mm", def: 3, step: 0.1 }, { k: "xf", rot: "Ø final X", def: -0.5, step: 0.1 }, { k: "rp", rot: "Raio da ponta da ferramenta mm", def: 0.4, step: 0.1 }, { k: "apz", rot: "Folga Z no início do ciclo (mm)", def: 2, step: 0.5 }, { k: "ax", rot: "Ponto de aproximação X Ø (0 = auto)", def: 0, step: 0.5 }, { k: "az", rot: "Ponto de aproximação Z", def: 2, step: 0.5 } ] },
};

const tmFmt = (n: number) => {
  let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (s === "-0.0") s = "0.0";
  return s;
};
const tmNaFaixa = (z: number, faixas: TMFaixa[]) => faixas.some(([a, b]) => z >= Math.min(a, b) - 1e-6 && z <= Math.max(a, b) + 1e-6);

// Para cada trecho em Z: maior diâmetro (externo) e, onde tem furo, o menor diâmetro (interno)
function tmEnvelopes(curves: TMPt[][]) {
  const segs: [TMPt, TMPt][] = [];
  curves.forEach((c) => { for (let i = 0; i < c.length - 1; i++) segs.push([c[i], c[i + 1]]); });
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const zset = new Set<number>();
  segs.forEach(([a, b]) => { zset.add(r4(a.z)); zset.add(r4(b.z)); });
  const zs = Array.from(zset).sort((a, b) => b - a);
  const xAt = (s: [TMPt, TMPt], z: number) => {
    const dz = s[1].z - s[0].z;
    if (Math.abs(dz) < 1e-9) return Math.max(s[0].x, s[1].x);
    return s[0].x + ((z - s[0].z) / dz) * (s[1].x - s[0].x);
  };
  const ext: TMIntervalo[] = [];
  const int: TMIntervalo[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const zA = zs[i];
    const zB = zs[i + 1];
    if (zA - zB < 1e-4) continue;
    const zm = (zA + zB) / 2;
    const cobre: { s: [TMPt, TMPt]; x: number }[] = [];
    for (const s of segs) {
      const lo = Math.min(s[0].z, s[1].z);
      const hi = Math.max(s[0].z, s[1].z);
      if (hi - lo < 1e-6 || zm < lo || zm > hi) continue;
      const x = xAt(s, zm);
      if (x > 0.01) cobre.push({ s, x });
    }
    if (!cobre.length) continue;
    cobre.sort((a, b) => b.x - a.x);
    const top = cobre[0].s;
    ext.push({ zA, zB, xa: xAt(top, zA), xb: xAt(top, zB) });
    if (cobre.length >= 2) {
      const bot = cobre[cobre.length - 1].s;
      int.push({ zA, zB, xa: xAt(bot, zA), xb: xAt(bot, zB) });
    }
  }
  return { ext, int };
}

// Monta o perfil para o ciclo: externo = diâmetro só cresce indo para trás; interno = só diminui.
// Onde a peça "afunda" (externo) vira CANAL.
function tmPerfil(iv: TMIntervalo[], interno: boolean, real = false) {
  let cur = interno ? Infinity : 0;
  const mono: TMIntervalo[] = [];
  const canais: { zStart: number; zEnd: number; fundo: number; topo: number }[] = [];
  let ab: { zStart: number; zEnd: number; fundo: number; topo: number } | null = null;
  iv.forEach((s) => {
    const na = real ? s.xa : interno ? Math.min(s.xa, cur) : Math.max(s.xa, cur);
    const nb = real ? s.xb : interno ? Math.min(s.xb, na) : Math.max(s.xb, na);
    cur = nb;
    mono.push({ zA: s.zA, zB: s.zB, xa: na, xb: nb });
    if (!interno) {
      const afunda = s.xa < na - 0.01 || s.xb < nb - 0.01;
      if (afunda) {
        if (!ab) ab = { zStart: s.zA, zEnd: s.zB, fundo: Math.min(s.xa, s.xb), topo: nb };
        else { ab.zEnd = s.zB; ab.fundo = Math.min(ab.fundo, s.xa, s.xb); ab.topo = Math.max(ab.topo, nb); }
      } else if (ab) { canais.push(ab); ab = null; }
    }
  });
  if (ab) canais.push(ab);
  const pts: TMPt[] = [];
  mono.forEach((s) => {
    if (!pts.length) pts.push({ x: s.xa, z: s.zA });
    else if (Math.abs(pts[pts.length - 1].x - s.xa) > 1e-3 || Math.abs(pts[pts.length - 1].z - s.zA) > 1e-3) pts.push({ x: s.xa, z: s.zA });
    pts.push({ x: s.xb, z: s.zB });
  });
  const simp: TMPt[] = [];
  pts.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-6) simp.pop();
    }
    simp.push(p);
  });
  return { pts: simp, canais };
}

const TM_MAT_FATOR: Record<string, { vc: number; f: number }> = {
  "Aço carbono": { vc: 1, f: 1 },
  "Aço inox": { vc: 0.65, f: 0.8 },
  "Alumínio": { vc: 1.9, f: 1.2 },
  "Latão": { vc: 1.4, f: 1 },
};

type TMGeo = {
  ext: TMIntervalo[];
  int: TMIntervalo[];
  zFront: number;
  zBack: number;
  L: number;
  dMax: number;
  dTras: number;
  intZmin: number;
  intZmax: number;
  intDmin: number;
};

function tmGeo(partProfile: PartProfile | null, partZero: PartZeroConfig): TMGeo | null {
  if (!partProfile) return null;
  const { ext, int } = tmEnvelopes(profileToLathe(partProfile, partZero));
  if (!ext.length) return null;
  const zFront = ext[0].zA;
  const zBack = ext[ext.length - 1].zB;
  const pf = tmPerfil(ext, false);
  return {
    ext, int, zFront, zBack, L: zFront - zBack,
    dMax: Math.max(...pf.pts.map((p) => p.x)),
    dTras: ext[ext.length - 1].xb,
    intZmin: int.length ? Math.min(...int.map((s) => s.zB)) : 0,
    intZmax: int.length ? Math.max(...int.map((s) => s.zA)) : 0,
    intDmin: int.length ? Math.min(...int.map((s) => Math.min(s.xa, s.xb))) : 0,
  };
}

function tmNovaOp(tipo: TMOpTipo, faixas: TMFaixa[], i: number, material: string): TMOp {
  const fat = TM_MAT_FATOR[material] || TM_MAT_FATOR["Aço carbono"];
  const p: Record<string, number> = {};
  TM_TIPOS[tipo].params.forEach((pr) => {
    let v = pr.def;
    if (pr.k === "vc") v = Math.round(pr.def * fat.vc);
    if (pr.k === "f") v = Math.round(pr.def * fat.f * 1000) / 1000;
    p[pr.k] = v;
  });
  return { id: tipo + "_" + Date.now().toString(36) + "_" + i, tipo, ativo: true, ferr: TM_TIPOS[tipo].ferr, nomeFerr: TM_TIPOS[tipo].nome.toUpperCase(), cab: "H1", ciclo: !!TM_TIPOS[tipo].ciclo && tipo !== "face", cor: TM_CORES[i % TM_CORES.length], faixas, p };
}

// região padrão das operações que antes eram "peça toda" (o usuário pode mudar o Começo/Fim)
function tmFaixaPadrao(tipo: TMOpTipo, geo: TMGeo, p: Record<string, number>): TMFaixa[] | null {
  if (tipo === "face") return [[geo.zFront, geo.zFront + (p.sobre !== undefined ? p.sobre : 0.5)]];
  if (tipo === "centro") return [[geo.zFront - (p.prof !== undefined ? p.prof : 2), geo.zFront]];
  if (tipo === "corte") return [[geo.zBack, geo.zBack]];
  return null;
}

function tmOpsPadrao(geo: TMGeo, material: string): TMOp[] {
  const toda: TMFaixa[] = [[geo.zBack, geo.zFront]];
  const ops: TMOp[] = [];
  let i = 0;
  ops.push(tmNovaOp("face", [[geo.zFront, geo.zFront + 0.5]], i++, material));
  ops.push(tmNovaOp("desbExt", toda, i++, material));
  ops.push(tmNovaOp("acabExt", toda, i++, material));
  const canais = tmPerfil(geo.ext, false).canais.filter((c) => !(Math.abs(c.zEnd - geo.zBack) < 1e-3 && c.zStart - c.zEnd <= 3 + 1e-6)); // chanfro/raio do lado do corte não vira canal
  if (canais.length) ops.push(tmNovaOp("canal", canais.map((c) => [c.zEnd, c.zStart] as TMFaixa), i++, material));
  if (geo.int.length) {
    const furo: TMFaixa[] = [[geo.intZmin, geo.intZmax]];
    ops.push(tmNovaOp("centro", [[geo.zFront - 2, geo.zFront]], i++, material));
    const fu = tmNovaOp("furo", furo, i++, material);
    fu.p.d = Math.max(1, Math.floor(geo.intDmin * 0.9 * 10) / 10);
    ops.push(fu);
    const di = tmNovaOp("desbInt", furo, i++, material);
    di.p.d0 = fu.p.d;
    ops.push(di);
    const ai = tmNovaOp("acabInt", furo, i++, material);
    ai.p.d0 = fu.p.d;
    ops.push(ai);
  }
  ops.push(tmNovaOp("corte", [[geo.zBack, geo.zBack]], i++, material));
  return ops;
}

// zona Z onde o perfil (externo: diâmetro crescendo) alcança o diâmetro xAlvo
function tmZOnde(pts: TMPt[], xAlvo: number, interno: boolean) {
  const passou = (x: number) => (interno ? x <= xAlvo : x >= xAlvo);
  if (passou(pts[0].x)) return pts[0].z;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!passou(a.x) && passou(b.x)) {
      if (Math.abs(b.x - a.x) < 1e-9) return a.z;
      return a.z + ((xAlvo - a.x) / (b.x - a.x)) * (b.z - a.z);
    }
  }
  return pts[pts.length - 1].z;
}

// CANAL SEM INVADIR O PERFIL: o bedame (referência no lado direito, corpo até Z - largura) só desce
// até o MAIOR diâmetro REAL da peça que fica debaixo dele naquela posição.
function tmPlanoCanal(geo: TMGeo, c: { zStart: number; zEnd: number; topo: number }, L: number, lc: number, bD: number) {
  const xi = (q: TMIntervalo, z: number) => (q.zA - q.zB < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((q.zA - z) / (q.zA - q.zB)) * (q.xb - q.xa));
  // maior diâmetro da peça entre zL e zR (passar do corte = barra da próxima peça = proibido)
  const maxEntre = (zL: number, zR: number) => {
    let m = 0;
    if (zL < geo.zBack - lc - 1e-6) m = bD;
    for (const q of geo.ext) {
      const a = Math.min(zR, q.zA);
      const b = Math.max(zL, q.zB);
      if (a - b < 1e-6) continue;
      m = Math.max(m, xi(q, a), xi(q, b));
    }
    return m;
  };
  const xMono = (z: number) => maxEntre(z, geo.zFront); // o que o desbaste deixou (diâmetro só cresce indo para trás)
  const fundoEm = (z: number) => maxEntre(z - L, z); // até onde o bedame pode descer com o lado direito em z
  const passo = L * 0.8;
  const cand: number[] = [];
  geo.ext.forEach((q) => {
    if (q.zB < c.zEnd - 1e-6 || q.zA > c.zStart + 1e-6) return;
    if (Math.min(q.xa, q.xb) >= xMono(q.zA) - 0.01) return; // trecho que o desbaste já deixou pronto
    const ini = q.zA;
    const fim = q.zB + L;
    if (fim >= ini - 1e-6) { cand.push(fundoEm(fim) < fundoEm(ini) - 1e-6 ? fim : ini); return; }
    for (let z = ini; z > fim + 1e-6; z -= passo) cand.push(z);
    cand.push(fim);
  });
  const merg: { z: number; d: number }[] = [];
  cand.sort((a, b) => b - a).forEach((z) => {
    const r = Math.round(z * 1000) / 1000;
    if (merg.some((m) => Math.abs(m.z - r) < 0.01)) return;
    const d = fundoEm(r);
    if (d < xMono(r - L) - 0.01) merg.push({ z: r, d });
  });
  // mergulhos vizinhos com o mesmo fundo viram UM ciclo G75
  const grupos: { z: number; d: number }[][] = [];
  merg.forEach((m) => {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g[g.length - 1].d - m.d) < 1e-3 && g[g.length - 1].z - m.z <= L + 1e-6) g.push(m);
    else grupos.push([m]);
  });
  // sobra material em flanco inclinado / raio que o bedame reto não alcança?
  let sobra = false;
  for (let z = c.zStart; z >= c.zEnd; z -= 0.05) {
    const real = maxEntre(z - 0.001, z + 0.001);
    const feito = Math.min(xMono(z), ...merg.filter((m) => z <= m.z + 1e-9 && z >= m.z - L - 1e-9).map((m) => m.d));
    if (feito > real + 0.05) { sobra = true; break; }
  }
  const xSeg = Math.min(bD, Math.max(c.topo, maxEntre(c.zEnd - L, c.zStart))) + 2;
  return { grupos, sobra, xSeg };
}

// COMPENSAÇÃO DO RAIO DA PONTA (feita pelo app, sem G41/G42): devolve o caminho da PONTA TEÓRICA
// (ponto que a máquina usa no zeramento) para que o raio r encoste no perfil sem invadir.
// Externo: ponta = centro - r em X e - r em Z (direção 3). Interno: ponta = centro + r em X e - r em Z (direção 2).
// ÂNGULO DE MERGULHO: a ferramenta de tornear não desce mais íngreme que o ângulo que a pastilha aguenta.
// Onde o perfil desce mais que isso (rebaixo/canal), o caminho fica numa rampa e o resto sobra para o bedame.
const TM_PASTILHA_ANG = [0, 27, 27, 50]; // aproximado para suporte 93°/95° - conferir no catálogo do fabricante
function tmLimitaMergulho(pts: TMPt[], angGraus: number): TMPt[] {
  if (!(angGraus >= 0) || angGraus >= 89.9 || pts.length < 2) return pts;
  const k = 2 * Math.tan((angGraus * Math.PI) / 180); // quanto o Ø pode cair por mm em Z
  const am: TMPt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.abs(a.z - b.z) / 0.02));
    for (let j = 0; j < n; j++) am.push({ z: a.z + ((b.z - a.z) * j) / n, x: a.x + ((b.x - a.x) * j) / n });
  }
  am.push(pts[pts.length - 1]);
  const out: TMPt[] = [];
  am.forEach((p, i) => {
    if (!i) { out.push({ z: p.z, x: p.x }); return; }
    const q = out[out.length - 1];
    out.push({ z: p.z, x: Math.max(p.x, q.x - k * Math.max(0, q.z - p.z)) });
  });
  const simp: TMPt[] = [];
  out.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-5) simp.pop();
    }
    simp.push(p);
  });
  return simp;
}

function tmCompensar(pts: TMPt[], r: number, interno: boolean): TMPt[] {
  if (!(r > 0) || pts.length < 2) return pts;
  const z0 = pts[0].z;
  const zE = pts[pts.length - 1].z;
  const segs: [TMPt, TMPt][] = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  const profAt = (z: number) => {
    let v = interno ? Infinity : -Infinity;
    let achou = false;
    for (const [a, b] of segs) {
      const lo = Math.min(a.z, b.z);
      const hi = Math.max(a.z, b.z);
      if (z < lo - 1e-9 || z > hi + 1e-9) continue;
      achou = true;
      const x = hi - lo < 1e-9 ? (interno ? Math.min(a.x, b.x) : Math.max(a.x, b.x)) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x);
      v = interno ? Math.min(v, x) : Math.max(v, x);
    }
    if (!achou) return z < zE ? pts[pts.length - 1].x : pts[0].x; // na frente do início: continua o Ø do início (entra reto em Z, sem arredondar/cavucar) // atrás: continua o último Ø; na frente: ar
    return v;
  };
  const vz = pts.map((p) => p.z);
  const centroX = (cz: number) => {
    let m = interno ? Infinity : -Infinity;
    const am: number[] = [];
    for (let z = cz - r; z <= cz + r + 1e-9; z += 0.01) am.push(z);
    am.push(cz + r);
    vz.forEach((z) => { if (z >= cz - r - 1e-9 && z <= cz + r + 1e-9) am.push(z); });
    am.forEach((z) => {
      const x = profAt(z);
      if (!isFinite(x)) return;
      const h = 2 * Math.sqrt(Math.max(0, r * r - (z - cz) * (z - cz)));
      m = interno ? Math.min(m, x - h) : Math.max(m, x + h);
    });
    return m;
  };
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const ini = z0 + r;
  const czs = new Set<number>();
  for (let z = ini; z >= zE + r - 1e-9; z -= 0.02) czs.add(r4(z)); // termina com a ponta teórica no fim da região (não passa do Z final)
  czs.add(r4(zE + r));
  vz.forEach((z) => [z + r, z - r, z, z + r - 0.0005, z - r + 0.0005].forEach((c) => { if (c <= ini + 1e-9 && c >= zE + r - 1e-9) czs.add(r4(c)); }));
  const out: TMPt[] = [];
  Array.from(czs).sort((a, b) => b - a).forEach((cz) => {
    const c = centroX(cz);
    if (!isFinite(c)) return;
    out.push({ z: cz - r, x: interno ? c + 2 * r : c - 2 * r });
  });
  const simp: TMPt[] = [];
  out.forEach((p) => {
    if (simp.length >= 2) {
      const a = simp[simp.length - 2];
      const b = simp[simp.length - 1];
      if (Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < 1e-5) simp.pop();
    }
    simp.push(p);
  });
  return simp.length >= 2 ? simp : pts;
}

function tmGerar(ops: TMOp[], geo: TMGeo, cfg: { nome: string; bD: number; rpmMax: number; material: string; origens?: TMOrigem[]; zero?: PartZeroConfig }) {
  const f = tmFmt;
  const out: string[] = [];
  const h2: string[] = []; // operações da torre superior (H2) vão para o CANAL 2
  let alvo = out;
  // PONTO DE APROXIMAÇÃO: depois do ponto escolhido na operação, o 1º G00 com X e Z é dividido em dois
  // (externo: Z primeiro por cima do bruto e depois X | interno: X primeiro na frente e depois Z) - nunca em diagonal
  let pendAp: { x: number; z: number; interno: boolean } | null = null;
  const W = (s: string) => {
    if (pendAp && /^(G0[0-3]|G7[0-6]|G8[0-9]|G9[04])\b/.test(s)) { // G92 S (limite de rotação) não é movimento
      const ap = pendAp;
      pendAp = null;
      const m = s.match(/^G00 X(-?[\d.]+) Z(-?[\d.]+)(.*)$/);
      if (m) {
        const tx = parseFloat(m[1]);
        const tz = parseFloat(m[2]);
        if (Math.abs(tz - ap.z) > 1e-6 && Math.abs(tx - ap.x) > 1e-6) {
          const xPrimeiro = ap.interno || tx > ap.x;
          if (xPrimeiro) { alvo.push("G00 X" + m[1] + ";"); alvo.push("G00 Z" + m[2] + m[3]); }
          else { alvo.push("G00 Z" + m[2] + ";"); alvo.push("G00 X" + m[1] + m[3]); }
          return;
        }
      }
    }
    alvo.push(s);
  };
  const data = new Date().toLocaleDateString("pt-BR");
  const nm = cfg.nome || "PECA";
  const bD = cfg.bD;
  const zF = geo.zFront;
  // ROTAÇÃO escolhida em cada ferramenta: G96 (Vc constante) com G92 limitando, ou G97 rotação fixa
  const fuso = (p: Record<string, number>, dRef: number, padrao: number, coment = "") => {
    const modo = p.mr !== undefined ? p.mr : padrao;
    if (modo === 1) {
      const n = (p.rpm ?? 0) > 0 ? p.rpm : Math.min(cfg.rpmMax, Math.round((p.vc * 1000) / (Math.PI * Math.max(dRef, 1))));
      W("G97 S" + n + " M03;" + coment);
    } else {
      W("G92 S" + ((p.lim ?? 0) > 0 ? p.lim : cfg.rpmMax) + "; (LIMITE DE ROTACAO)");
      W("G96 S" + p.vc + " M03;" + coment);
    }
  };
  const recuar = () => { W("G00 X" + f(bD + 20) + ";"); W("G00 Z50.0; (RECUO - CONFERIR)"); };
  const ativos = ops.filter((o) => o.ativo);
  const corteOp = ativos.find((o) => o.tipo === "corte");
  const largCorte = corteOp ? corteOp.p.larg : 3;
  const acabExt = ativos.find((o) => o.tipo === "acabExt");
  const acabInt = ativos.find((o) => o.tipo === "acabInt");
  const ciclos: Record<string, { p: number; q: number; rp?: number }> = {};
  let nIdx = 1;
  // RESPEITA o Começo/Fim: junta as faixas e CORTA cada trecho do perfil no limite (não usina além do que foi escolhido)
  const sub = (iv: TMIntervalo[], faixas: TMFaixa[]) => {
    const fx = faixas.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((p1, p2) => p1[0] - p2[0]);
    const uni: number[][] = [];
    fx.forEach((g) => { const u = uni[uni.length - 1]; if (u && g[0] <= u[1] + 1e-6) u[1] = Math.max(u[1], g[1]); else uni.push([g[0], g[1]]); });
    const r: TMIntervalo[] = [];
    iv.forEach((q) => {
      if (q.zA - q.zB < 1e-9) { if (uni.some((u) => q.zA >= u[0] - 1e-6 && q.zA <= u[1] + 1e-6)) r.push(q); return; }
      const xz = (z: number) => q.xa + ((q.zA - z) / (q.zA - q.zB)) * (q.xb - q.xa);
      uni.forEach((u) => {
        const a = Math.min(q.zA, u[1]);
        const b = Math.max(q.zB, u[0]);
        if (a - b > 1e-4) r.push(a === q.zA && b === q.zB ? q : { ...q, zA: a, zB: b, xa: xz(a), xb: xz(b) });
      });
    });
    return r;
  };

  W("O0001 (" + nm + " - LADO 1 - HEAD1);");
  W("(MAQUINA: ERGOMAT TBSY 60 - PROGRAMA UNICO - H1/H2 MARCADO EM CADA FERRAMENTA);");
  W("(GERADO PELO TORNO MASTER EM " + data + " - CONFERIR ANTES DE RODAR);");
  W("(PECA L" + f(geo.L) + " - D MAX " + f(geo.dMax) + " - BRUTO D" + f(bD) + " - " + cfg.material.toUpperCase() + ");");
  W("");
  W("G18 G40 G97 G99; (CONFERIR CABECALHO PADRAO DA MAQUINA)");
  W("(ORIGENS: " + (cfg.origens || []).map((o, k) => (k + 1) + "=" + o.g + (o.tipo === "suico" ? " SUICO" : "")).join(" ") + ");");

  const contorno = (pts: TMPt[], fAcab: number, xSaida: number, n1: number | null, n2: number | null, passaCorte: boolean, tipo2 = false) => {
    W((n1 ? "N" + n1 + " " : "") + "G00 X" + f(pts[0].x) + (tipo2 ? " Z" + f(pts[0].z + 1) : "") + ";" + (tipo2 ? " (G71 TIPO II - COM REBAIXOS)" : ""));
    W("G01 Z" + f(pts[0].z) + " F" + fAcab + ";");
    for (let i = 1; i < pts.length; i++) W("G01 X" + f(pts[i].x) + " Z" + f(pts[i].z) + ";");
    if (passaCorte) W("G01 Z" + f(geo.zBack - largCorte - 0.5) + "; (PASSA DO CORTE)");
    W((n2 ? "N" + n2 + " " : "") + "G01 X" + f(xSaida) + ";");
  };

  const marcas: { ini: number; op: TMOp }[] = []; // onde começa cada operação no programa (para aplicar a origem)
  ativos.forEach((op, i) => {
    const T = TM_TIPOS[op.tipo];
    marcas.push({ ini: out.length, op });
    pendAp = null;
    const p = op.p;
    const aprox = p.apz !== undefined ? p.apz : 2; // aproximação em Z antes da região (campo da operação)
    const chave = JSON.stringify(op.faixas);
    alvo = out; // programa único: H1/H2 fica marcado na ferramenta
    W("");
    W("(OP " + (i + 1) + " - " + T.nome.toUpperCase() + (T.ciclo && op.ciclo ? " " + (op.cicloSel || T.ciclo) : T.ciclo ? " SEM CICLO" : "") + ");");
    const fxs: TMFaixa[] = op.faixas.length ? op.faixas : tmFaixaPadrao(op.tipo, geo, p) || []; // sem região marcada: usa a padrão (face, centro, corte)
    if (T.regiao && !fxs.length) { W("(SEM REGIAO MARCADA NA PECA - OPERACAO PULADA);"); return; }
    W(op.ferr + " (" + (op.nomeFerr || T.nome.toUpperCase()) + " - " + (op.cab || "H1") + ");");
    const og = (cfg.origens || [])[(op.orig || 1) - 1] || (cfg.origens || [])[0];
    if (og) W(og.g + "; (ORIGEM " + (op.orig || 1) + (og.tipo === "suico" ? " - SUICO" : "") + ")");
    // PONTO DE APROXIMAÇÃO (campos X e Z da operação; X 0 = automático): chega num ponto seguro antes de entrar na peça
    const interno = T.grupo === "INTERNO";
    const apX = (p.ax ?? 0) > 0 ? p.ax : interno ? 0 : bD + 2;
    const apZ = p.az !== undefined ? p.az : 2;
    if (apZ < zF - 1e-6) { alvo.push("G00 X" + f(apX) + ";"); alvo.push("G00 Z" + f(apZ) + "; (PONTO DE APROXIMACAO)"); }
    else alvo.push("G00 X" + f(apX) + " Z" + f(apZ) + "; (PONTO DE APROXIMACAO)");
    pendAp = { x: apX, z: apZ, interno };
    // INTERNO PELA MESMA LÓGICA DO EXTERNO: o X do perfil interno é espelhado (x' = KM - x), o programa é gerado pelo
    // mesmo código do externo (desbaste, acabamento, canal) e depois o X volta ao normal. Afastamento: menor furo - folga.
    const intE = op.tipo === "desbInt" || op.tipo === "acabInt" || op.tipo === "canalInt";
    const KM = 1000;
    const sIntM = intE ? sub(geo.int, op.faixas) : [];
    const dMinI = sIntM.length ? Math.min(...sIntM.map((q) => Math.min(q.xa, q.xb))) : 0;
    const dSegM = intE ? (op.tipo === "desbInt" && (p.d0 ?? 0) > 0 ? p.d0 : dMinI) : bD; // menor furo por onde a ferramenta passa
    const folIn = intE ? ((p.fi ?? 0) > 0 ? p.fi : 1) : 2; // RECUO: quanto afasta da parede (Ø)
    const fol2 = intE && op.tipo !== "desbInt" && (p.bm ?? 0) > 0 ? Math.max(0.1, Math.min(folIn, dSegM - p.bm)) : folIn; // a barra não pode encostar do outro lado do furo (no desbaste o furo vai abrindo)
    const recX = intE ? fol2 : 1; // recuo depois de cada passe
    // BARRA: não entra onde o furo (perfil pronto) é menor que o Ø máximo da barra; tudo atrás desse ponto fica de fora
    let faixasM = op.faixas;
    if (intE && (p.bm ?? 0) > 0) {
      const dInt = (z: number) => { let m = Infinity; geo.int.forEach((g) => { if (z <= g.zA + 1e-9 && z >= g.zB - 1e-9) m = Math.min(m, g.zA - g.zB < 1e-9 ? Math.min(g.xa, g.xb) : g.xa + ((g.zA - z) / (g.zA - g.zB)) * (g.xb - g.xa)); }); return m; };
      let zLim = -Infinity;
      const zIniCheck = zF - 0.01;
      const zFimCheck = Math.min(zIniCheck, geo.zBack);
      let gZ = 0;
      for (let z = zIniCheck; gZ++ < 5000 && z >= zFimCheck - 1e-9; z -= 0.02) { const d = dInt(z); if (isFinite(d) && d < p.bm + folIn - 1e-6) { zLim = z; break; } /* a barra tem que caber E ter espaço para o recuo */ }
      if (zLim > -Infinity) {
        faixasM = op.faixas.map(([a, b]) => [Math.max(Math.min(a, b), zLim + 0.02), Math.max(a, b)] as TMFaixa).filter((g) => g[1] > g[0] + 1e-6);
        W("(BARRA D" + f(p.bm) + " + RECUO " + f(folIn) + " NAO PASSA NO FURO EM Z" + f(zLim) + (faixasM.length ? " - USINA SO ATE ESSE PONTO" : "") + ");");
      }
    }
    const geoM: TMGeo = intE ? { ...geo, ext: geo.int.map((q) => ({ ...q, xa: KM - q.xa, xb: KM - q.xb })) } : geo;
    const bDM = intE ? KM - dSegM : bD;
    const opM: TMOp = intE ? { ...op, faixas: faixasM, tipo: op.tipo === "desbInt" ? "desbExt" : op.tipo === "acabInt" ? "acabExt" : "canal" } : op;
    const fimInt = () => {
      if (!intE) return;
      for (let k = iniM; k < out.length; k++) out[k] = espelha(out[k]);
      iniM = out.length;
      W("G00 Z" + f(zF + aprox) + "; (SAI DO FURO)");
    };
    if (intE && (p.bm ?? 0) > 0 && (!faixasM.length || (op.tipo === "desbInt" ? dSegM + 2 * (p.ap ?? 1) < p.bm : dSegM < p.bm))) { // desbaste: a barra entra no furo que o 1º passe abre
      W("(ALARME: BARRA D" + f(p.bm) + " NAO ENTRA NO FURO D" + f(dSegM) + " - OPERACAO NAO GERADA);");
      fimInt();
      recuar();
      return;
    }
    const acabM = intE ? acabInt : acabExt;
    const espelha = (ln: string) => {
      const ip = ln.indexOf("(");
      let cod = ip >= 0 ? ln.slice(0, ip) : ln;
      const com = ip >= 0 ? ln.slice(ip).replace("PONTA TEORICA DIRECAO 3", "PONTA TEORICA DIRECAO 2").replace("SEM PERFIL EXTERNO", "SEM PERFIL INTERNO") : "";
      cod = cod.replace(/X(-?\d+(?:\.\d*)?)/g, (_m, v) => "X" + f(KM - parseFloat(v)));
      if (/^(N\d+ )?G71 P/.test(cod)) cod = cod.replace(/ U(\d)/, " U-$1"); // sobremetal interno: U negativo
      return cod + com;
    };
    if (intE && fol2 < folIn - 1e-6 && dSegM >= (p.bm ?? 0)) W("(RECUO LIMITADO A " + f(fol2) + " - A BARRA D" + f(p.bm) + " ENCOSTARIA DO OUTRO LADO DO FURO D" + f(dSegM) + ");");
    let iniM = out.length;

    if (op.tipo === "face") {
      // Começo/Fim em Z (região) e em X (Ø inicial / Ø final). Ciclo: linhas, G94, G72, G75 ou G74.
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zTopo = zIni - zFim < 0.001 ? zFim + p.sobre : zIni; // marcou só a linha da face: usa o sobremetal
      const xi = p.xi > 0 ? p.xi : bD + 2;
      const xf = p.xf !== undefined ? p.xf : -1.6;
      const cic = op.ciclo ? op.cicloSel || "G94" : "";
      W("(FACE DE Z" + f(zTopo) + " ATE Z" + f(zFim) + " - DE X" + f(xi) + " ATE X" + f(xf) + ");");
      fuso(p, bD, 0);
      W("G00 X" + f(xi) + " Z" + f(zTopo + aprox) + " M08;");
      const passos: number[] = [];
      let z = zTopo;
      const apFace = Math.max(0.01, (p.ap ?? 1) > 0 ? p.ap : 1);
      let gFace = 0;
      while (gFace++ < 2000 && z - apFace > zFim + 1e-6) { z -= apFace; passos.push(z); }
      passos.push(zFim);
      // G75 / G74: o app identifica se é CANAL (parede dos dois lados) ou FACEAMENTO (lado aberto)
      const xPeca = (zz: number) => { let m = 0; geo.ext.forEach((q) => { if (zz <= q.zA + 1e-9 && zz >= q.zB - 1e-9) { const t = q.zA - q.zB < 1e-9 ? 0 : (q.zA - zz) / (q.zA - q.zB); m = Math.max(m, q.xa + t * (q.xb - q.xa)); } }); return m; };
      const Lg = p.larg !== undefined && p.larg >= 0 ? p.larg : 3; // largura 0 = referência na ponta (usa o valor digitado, nunca troca por 3)
      const passoT = (p.ps ?? 0) > 0 ? p.ps : Lg * 0.8;
      const pica = (p.pp ?? 0) > 0 ? p.pp : 1;
      const R1 = p.re ?? 0.5;
      const fechado = xPeca(zTopo + 0.05) > Math.max(xf, 0) + 0.01 && xPeca(zFim - 0.05) > Math.max(xf, 0) + 0.01; // na frente da peça (ar) não é parede
      const usoCanal = p.uso === 1 || (!p.uso && fechado);
      const R2 = usoCanal ? 0 : p.ra ?? 0;
      const usoTxt = usoCanal ? "USO CANAL - SEM ALIVIO NO FUNDO" : "USO FACEAMENTO" + (R2 > 0 ? " - ALIVIO NO FUNDO R" + f(R2) : "");
      if (cic === "G94") {
        passos.forEach((zp, k) => W(k === 0 ? "G94 X" + f(xf) + " Z" + f(zp) + " F" + p.f + ";" : "Z" + f(zp) + ";"));
      } else if (cic === "G72") {
        const n1 = nIdx * 100; const n2 = n1 + 50; nIdx++;
        W("G72 W" + f(p.pw ?? 1) + " R" + f(R1) + ";");
        W("G72 P" + n1 + " Q" + n2 + " U" + f(p.ru ?? 0) + " W" + f(p.rw ?? 0) + " F" + p.f + ";");
        W("N" + n1 + " G00 Z" + f(zFim) + ";");
        W("N" + n2 + " G01 X" + f(xf) + ";");
      } else if (cic === "G74" || cic === "G75") {
        if (Lg > 0 && passoT > Lg + 1e-6) W("(ATENCAO: PASSO MAIOR QUE A LARGURA DA FERRAMENTA L" + f(Lg) + " - VAI SOBRAR DEGRAU);");
        if (p.uso === 2 && fechado) W("(ATENCAO: REGIAO COM PAREDE DOS DOIS LADOS - ALIVIO NO FUNDO PODE RASPAR A PAREDE);");
        if (!usoCanal && R2 <= 0) W("(FACEAMENTO SEM ALIVIO NO FUNDO - INFORME O R DO 2O BLOCO);");
        if (cic === "G74") {
          W("G00 Z" + f(zTopo + aprox) + ";");
          W("G74 R" + f(R1) + ";");
          W("G74 X" + f(xf) + " Z" + f(zFim) + " P" + Math.round(passoT * 1000) + " Q" + Math.round(pica * 1000) + (R2 > 0 ? " R" + f(R2) : "") + " F" + p.f + "; (" + usoTxt + ")");
        } else {
          const zE = zFim + Lg; // Z programado = quina de referência (lado direito): desconta a largura
          const zS = Math.max(zTopo, zE);
          W("G00 Z" + f(zS) + "; (FERRAMENTA L" + f(Lg) + " - REFERENCIA NO LADO DIREITO)");
          W("G75 R" + f(R1) + ";");
          W("G75 X" + f(xf) + " Z" + f(zE) + " P" + Math.round(pica * 1000) + " Q" + Math.round(passoT * 1000) + (R2 > 0 ? " R" + f(R2) : "") + " F" + p.f + "; (" + usoTxt + ")");
        }
        W("(P E Q EM MILESIMO - CONFERIR RAIO/DIAMETRO NA MAQUINA);");
      } else {
        passos.forEach((zp) => { W("G00 Z" + f(zp) + ";"); W("G01 X" + f(xf) + " F" + p.f + ";"); W("G00 Z" + f(zp + 1) + ";"); W("G00 X" + f(xi) + ";"); });
      }
      recuar();
      return;
    }
    if (op.tipo === "desbExt" || op.tipo === "acabExt" || op.tipo === "desbInt" || op.tipo === "acabInt") {
      // interno usa este mesmo código com o X espelhado (ver INTERNO PELA MESMA LÓGICA)
      const geo = geoM;
      const bD = bDM;
      const op = opM;
      const acabExt = acabM;
      let s = sub(geo.ext, op.faixas);
      // COMEÇA ANTES DO PERFIL: tira a face da frente (não começa lá embaixo no X) e estende em Z até o "Começa em Z" escolhido
      let gS = 0;
      while (gS++ < 500 && s.length > 1 && s[0].zA - s[0].zB < 1e-9) s = s.slice(1);
      const zCom = op.faixas.length ? Math.max(...op.faixas.map((g) => Math.max(g[0], g[1]))) : -1e9;
      if (s.length && zCom > s[0].zA + 1e-6) {
        // prolonga o 1º elemento (ex.: chanfro) para trás até o "Começa em Z": a ferramenta já entra na direção do chanfro
        const q0 = s[0];
        const k = q0.zA - q0.zB > 1e-9 ? (q0.xb - q0.xa) / (q0.zA - q0.zB) : 0;
        let xIni = q0.xa - k * (zCom - q0.zA);
        const xPerf = (z: number) => { let m = 0; geo.ext.forEach((g) => { if (z <= g.zA + 1e-9 && z >= g.zB - 1e-9) m = Math.max(m, g.zA - g.zB < 1e-9 ? Math.max(g.xa, g.xb) : g.xa + ((g.zA - z) / (g.zA - g.zB)) * (g.xb - g.xa)); }); return m; };
        let ok = xIni >= 0;
        for (let z = q0.zA + 0.005; z <= zCom + 1e-9 && ok; z += 0.005) if (q0.xa - k * (z - q0.zA) < xPerf(z) - 1e-6) ok = false; // a reta prolongada não pode entrar na peça
        if (!ok) xIni = q0.xa; // se entraria na peça: chega reto no Ø do início
        s = [{ ...q0, zA: zCom, zB: q0.zA, xa: xIni, xb: q0.xa }, ...s];
      }
      if (!s.length) { W("(REGIAO SEM PERFIL EXTERNO);"); fimInt(); return; }
      const real = p.real === 1 && !(op.tipo === "desbExt" && op.ciclo); // G71 Fanuc normal: nunca entra em rebaixo (perfil só cresce)
      const angM = real ? ((p.ang ?? 0) > 0 ? p.ang : TM_PASTILHA_ANG[p.pas ?? 2] ?? 27) : 90; // ângulo de mergulho (só quando entra nos rebaixos)
      const pts = tmCompensar(tmLimitaMergulho(tmPerfil(s, false, real).pts, angM), p.rp ?? 0.4, false); // mergulho limitado + raio da ponta compensado
      if (real) W("(MERGULHO LIMITADO A " + f(angM) + " GRAUS - O QUE A PASTILHA NAO ALCANCA SOBRA PARA O BEDAME);");
      if ((p.rp ?? 0.4) > 0) W("(PERFIL COMPENSADO PELO RAIO DA PONTA R" + f(p.rp ?? 0.4) + " - SEM G41/G42 - PONTA TEORICA DIRECAO 3);");
      const zS = s[0].zA;
      const zE = s[s.length - 1].zB;
      const passa = false; // vai só até o fim da região marcada (o corte é feito pela operação Corte)
      const xSai = Math.max(bD + fol2 / 2, pts[pts.length - 1].x + 1);
      const fAc = acabExt ? acabExt.p.f : 0.1;
      fuso(p, intE ? dSegM : bD, 0);
      W("G00 X" + f(bD + fol2) + " Z" + f(zS + aprox) + " M08;");
      if (op.tipo === "desbExt") {
        if (op.ciclo) {
          const n1 = nIdx * 100; const n2 = n1 + 50; nIdx++;
          ciclos[(intE ? "I" : "E") + chave + (real ? "R" : "")] = { p: n1, q: n2, rp: p.rp ?? 0.4 };
          W("G71 U" + f(p.ap) + " R0.5;");
          W("G71 P" + n1 + " Q" + n2 + " U" + f(p.u) + " W" + f(p.w) + " F" + p.f + ";");
          contorno(pts, fAc, xSai, n1, n2, passa, real);
        } else {
          // SEM CICLO - 1) desbaste por fora até o envelope (o diâmetro só cresce indo para a placa)
          const mono = real ? tmCompensar(tmPerfil(s, false, false).pts, p.rp ?? 0.4, false) : pts;
          const monoU = mono.map((q) => ({ x: q.x + p.u, z: q.z })); // sobremetal U em TODO o perfil (nenhum passe chega na medida)
          const xMin = Math.min(...monoU.map((q) => q.x));
          const platE = Array.from(new Set(monoU.filter((q, k) => k < monoU.length - 1 && Math.abs(monoU[k + 1].x - q.x) < 2e-3 && Math.abs(monoU[k + 1].z - q.z) > 0.05).map((q) => Math.round(q.x * 1000) / 1000))).sort((a, b) => b - a); // diâmetros retos (+U)
          let xp = bD;
          const apDesb = Math.max(0.01, (p.ap ?? 1) > 0 ? p.ap : 1);
          let gXp = 0;
          while (gXp++ < 5000 && xp > xMin + 1e-6) {
            // próximo passe: desce a profundidade, mas PARA no diâmetro reto da peça + U (ex.: Ø15,2 + 0,1 = Ø15,3) se ele estiver no caminho
            let nx = Math.max(xMin, xp - 2 * apDesb);
            const pl = platE.find((v) => v < xp - 1e-6 && v > nx + 1e-6);
            if (pl !== undefined) nx = pl;
            if (nx >= xp - 1e-6) break; // nunca trava se o diâmetro não diminuir
            xp = nx;
            const zl = tmZOnde(monoU, xp + 1e-6, false);
            if (zl >= zS - 1e-6) continue;
            W("G00 X" + f(xp) + " Z" + f(zS + aprox) + ";");
            W("G01 Z" + f(zl + p.w) + " F" + p.f + ";");
            W("G01 X" + f(xp + recX) + ";");
            W("G00 Z" + f(zS + aprox) + ";");
          }
          // 2) REBAIXOS (entrar nos rebaixos = 1): corta sempre no sentido da placa, entra pela rampa já usinada,
          //    não volta para a frente da peça, respeita o ângulo da pastilha e o raio (pts já limitado e compensado)
          if (real) {
            const valEm = (lst: TMPt[], z: number) => {
              let v = -Infinity;
              for (let i = 0; i < lst.length - 1; i++) {
                const a = lst[i];
                const b = lst[i + 1];
                const lo = Math.min(a.z, b.z);
                const hi = Math.max(a.z, b.z);
                if (z < lo - 1e-9 || z > hi + 1e-9) continue;
                v = Math.max(v, hi - lo < 1e-9 ? Math.max(a.x, b.x) : a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
              }
              return v;
            };
            const comSobre = (lst: TMPt[], z: number) => {
              let m = -Infinity;
              [-p.w, -p.w / 2, 0, p.w / 2, p.w].forEach((dz) => { m = Math.max(m, valEm(lst, z + dz)); });
              return m + p.u;
            };
            const passo = 0.02;
            const zFimR = s[s.length - 1].zB;
            const ZG: number[] = [];
            for (let z = zS; z >= zFimR - 1e-9; z -= passo) ZG.push(z);
            const TA = ZG.map((z) => comSobre(pts, z)); // alvo (perfil que a pastilha alcança + sobremetal)
            const MA = ZG.map((z) => comSobre(mono, z)); // envelope já desbastado por fora
            const dAp = Math.max(0.02, 2 * ((p.ap ?? 1) > 0 ? p.ap : 1));
            const r1 = Math.min(1, dAp * 0.8);
            const rebs: [number, number][] = [];
            let ini = -1;
            ZG.forEach((_z, i) => {
              const fundo = TA[i] < MA[i] - 0.02;
              if (fundo && ini < 0) ini = i;
              if ((!fundo || i === ZG.length - 1) && ini >= 0) { rebs.push([ini, fundo ? i : i - 1]); ini = -1; }
            });
            rebs.forEach(([i0, i1], ir) => {
              const idx: number[] = [];
              for (let i = i0; i <= i1; i++) idx.push(i);
              const topo = Math.max(...idx.map((i) => MA[i]));
              const fundoMin = Math.min(...idx.map((i) => TA[i]));
              W("(REBAIXO " + (ir + 1) + " Z" + f(ZG[i0]) + " A Z" + f(ZG[i1]) + " - ENTRA PELA RAMPA, SEMPRE NO SENTIDO DA PLACA);");
              W("G00 X" + f(bD + fol2) + ";");
              W("G00 Z" + f(ZG[i0]) + ";");
              let curX = MA[i0] + 0.5;
              let curZi = i0;
              W("G00 X" + f(curX) + ";");
              let L = topo;
              let g = 0;
              while (g++ < 500 && L > fundoMin + 1e-6) {
                const prevL = L;
                L = Math.max(fundoMin, L - dAp);
                const runs: [number, number][] = [];
                let a = -1;
                idx.forEach((i, k) => {
                  const corta = TA[i] < L - 1e-6 && MA[i] > L + 1e-6;
                  if (corta && a < 0) a = i;
                  if ((!corta || k === idx.length - 1) && a >= 0) { runs.push([a, corta ? i : i - 1]); a = -1; }
                });
                runs.forEach(([ia, ib]) => {
                  // entrada: volta pela rampa até onde ela alcança o nível anterior (área já usinada)
                  let ie = ia;
                  let gIe = 0;
                  while (gIe++ < 500 && ie - 1 >= i0 && TA[ie - 1] < prevL - 1e-6) ie--;
                  if (ie - 1 >= i0) ie--;
                  const xEnt = Math.min(prevL, TA[ie]);
                  // viagem segura: acima do perfil e do nível anterior entre onde está e a entrada
                  let H = Math.max(prevL, curX);
                  for (let i = Math.min(curZi, ie); i <= Math.max(curZi, ie); i++) H = Math.max(H, TA[i] + 0.5);
                  H = Math.min(H, bD + fol2);
                  W("G00 X" + f(H) + ";");
                  W("G00 Z" + f(ZG[ie]) + ";");
                  W("G00 X" + f(xEnt + 0.2) + ";");
                  W("G01 X" + f(xEnt) + " F" + p.f + ";");
                  const ramp: TMPt[] = [{ x: xEnt, z: ZG[ie] }];
                  for (let i = ie + 1; i <= ia; i++) ramp.push({ x: Math.max(L, Math.min(prevL, TA[i])), z: ZG[i] });
                  ramp.push({ x: L, z: ZG[ia] });
                  const rs: TMPt[] = [];
                  ramp.forEach((q) => {
                    if (rs.length >= 2) {
                      const u = rs[rs.length - 2];
                      const v = rs[rs.length - 1];
                      if (Math.abs((v.x - u.x) * (q.z - u.z) - (v.z - u.z) * (q.x - u.x)) < 1e-4) rs.pop();
                    }
                    rs.push(q);
                  });
                  for (let k = 1; k < rs.length; k++) W("G01 X" + f(rs[k].x) + " Z" + f(rs[k].z) + ";");
                  W("G01 Z" + f(ZG[ib]) + ";");
                  curX = Math.min(L + r1, prevL);
                  curZi = ib;
                  W("G01 X" + f(curX) + "; (SOBE DENTRO DA AREA JA USINADA)");
                });
              }
              W("G00 X" + f(bD + fol2) + "; (SAI DO REBAIXO POR CIMA)");
            });
          }
        }
      } else {
        const c = ciclos[(intE ? "I" : "E") + chave + (real ? "R" : "")];
        const mesmoRaio = !!c && Math.abs((c.rp ?? 0.4) - (p.rp ?? 0.4)) < 1e-6; // G70 usa o perfil do desbaste: só serve se o raio da ponta for igual
        if (op.ciclo && c && !mesmoRaio) W("(RAIO DA PONTA DIFERENTE DO DESBASTE - ACABAMENTO ESCRITO LINHA A LINHA);");
        if (op.ciclo && c && mesmoRaio) W("G70 P" + c.p + " Q" + c.q + ";");
        else contorno(pts, p.f, xSai, null, null, passa);
      }
      fimInt();
      recuar();
      return;
    }
    if (op.tipo === "canal" || op.tipo === "canalInt") {
      // canal interno usa este mesmo código com o X espelhado (ver INTERNO PELA MESMA LÓGICA)
      const geo = geoM;
      const bD = bDM;
      const op = opM;
      const s = sub(geo.ext, op.faixas);
      if (!s.length) { W("(REGIAO SEM PERFIL EXTERNO);"); return; }
      let canais = tmPerfil(s, false).canais;
      if (!canais.length) canais = [{ zStart: s[0].zA, zEnd: s[s.length - 1].zB, fundo: Math.min(...s.map((q) => Math.min(q.xa, q.xb))), topo: Math.max(...s.map((q) => Math.max(q.xa, q.xb))) }];
      // chanfro / raio no fim da peça (lado do corte) não é canal: fica para o acabamento ou para o corte
      canais = canais.filter((c) => {
        const fimPeca = Math.abs(c.zEnd - geo.zBack) < 1e-3 && c.zStart - c.zEnd <= p.larg + 1e-6;
        if (fimPeca) W("(Z" + f(c.zStart) + " A Z" + f(c.zEnd) + ": CHANFRO/RAIO NO LADO DO CORTE - FAZER NO ACABAMENTO OU NO CORTE);");
        return !fimPeca;
      });
      if (!canais.length) { fimInt(); recuar(); return; }
      const topoMax = Math.max(...canais.map((c) => c.topo));
      fuso(p, intE ? dSegM : topoMax, 1, " (BEDAME L" + f(p.larg) + " - REFERENCIA NO LADO DIREITO)");
      canais.forEach((c) => {
        const larg = c.zStart - c.zEnd;
        const pl = tmPlanoCanal(geo, c, p.larg, largCorte, bD);
        W("(CANAL Z" + f(c.zStart) + " A Z" + f(c.zEnd) + " - FUNDO SEGUE O PERFIL REAL SEM INVADIR);");
        if (larg < p.larg - 0.01) W("(ATENCAO: CANAL MAIS ESTREITO QUE O BEDAME - CONFERIR);");
        if (!op.ciclo) {
          // SEM CICLO (segue o perfil): bedame com lado de referência, sobremetal X/Z, incremento por passada,
          // sempre sobe para o X maior antes de andar em Z, e passe de acabamento opcional no perfil marcado
          const Lb = p.larg > 0 ? p.larg : 0;
          const ladoEsq = p.ref === 1;
          const sx = p.sx ?? 0.2;
          const sz = p.sz ?? 0.1;
          const inc = (p.inc ?? 0) > 0 ? p.inc : Math.max(Lb * 0.8, 0.1);
          const xiq = (q: TMIntervalo, zz: number) => (q.zA - q.zB < 1e-9 ? Math.max(q.xa, q.xb) : q.xa + ((q.zA - zz) / (q.zA - q.zB)) * (q.xb - q.xa));
          const maxEntre = (zL: number, zR: number) => {
            let m = 0;
            if (zL < geo.zBack - largCorte - 1e-6) m = bD;
            for (const q of geo.ext) {
              const a = Math.min(zR, q.zA);
              const b = Math.max(zL, q.zB);
              if (a - b < -1e-6) continue; // intervalo fechado: parede que encosta na borda do bedame também conta
              m = Math.max(m, xiq(q, a), xiq(q, b));
            }
            return m;
          };
          const zProg = (zR: number) => (ladoEsq ? zR - Lb : zR); // Z escrito = quina de referência escolhida
          const xSeg = (intE ? KM - dSegM + fol2 : pl.xSeg);
          const zIniR = c.zStart;
          // no fim da peça (lado do corte) o bedame pode passar para dentro da largura do corte para usinar os chanfros do fundo
          const naTraseira = Math.abs(c.zEnd - geo.zBack) < 1e-3;
          const zFimR = Math.min(c.zStart, naTraseira ? Math.max(c.zEnd, geo.zBack - largCorte + Lb + sz) : c.zEnd + Lb);
          const posR: number[] = [];
          let gPos = 0;
          for (let zz = zIniR; gPos++ < 5000 && zz > zFimR + 1e-6; zz -= inc) posR.push(zz);
          posR.push(zFimR);
          const passoX = (p.pk ?? 0) > 0 ? 2 * p.pk : 1e9;
          W("(CANAL SEM CICLO - BEDAME L" + f(Lb) + " - REFERENCIA LADO " + (ladoEsq ? "2 - PLACA" : "1 - FRENTE") + " - SOBREMETAL X" + f(sx) + " Z" + f(sz) + ");");
          W("G00 X" + f(bD + fol2) + " Z" + f(zProg(posR[0])) + " M08; (CHEGA POR FORA)");
          W("G00 X" + f(xSeg) + ";");
          posR.forEach((zR) => {
            const d = maxEntre(zR - Lb - sz, zR + sz) + sx; // nunca passa do perfil + sobremetal
            if (d >= xSeg - 2 - 0.01) return;
            W("G00 Z" + f(zProg(zR)) + "; (ANDA EM Z SEMPRE NO X MAIOR)");
            let x = xSeg - 1;
            W("G00 X" + f(x) + ";");
            let gPk = 0;
            while (gPk++ < 2000 && x > d + 1e-6) {
              const nx = Math.max(d, x - passoX);
              W("G01 X" + f(nx) + " F" + p.f + ";");
              if (nx >= x - 1e-6) break;
              x = nx;
              if (x > d + 1e-6) { W("G00 X" + f(x + 0.5) + "; (PICA-PAU)"); W("G01 X" + f(x) + ";"); }
            }
            W("G00 X" + f(xSeg) + ";");
          });
          // CONTORNO NO PERFIL: depois dos mergulhos o bedame reto não acompanha rampa/raio, então passa no perfil
          // deixando o sobremetal X/Z igual em tudo; se marcar acabamento, faz ainda o passe final na medida
          const perfilCanal = (ox: number, oz: number) => {
            const zs = new Set<number>();
            let gZs = 0;
            for (let zz = zIniR; gZs++ < 5000 && zz > zFimR; zz -= 0.05) zs.add(Math.round(zz * 1000) / 1000);
            zs.add(Math.round(zFimR * 1000) / 1000);
            geo.ext.forEach((q) => [q.zA, q.zB, q.zA + Lb, q.zB + Lb, q.zA - oz, q.zB - oz, q.zA + Lb + oz, q.zB + Lb + oz].forEach((z0) => [z0, z0 - 0.001, z0 + 0.001].forEach((zz) => { if (zz <= zIniR + 1e-9 && zz >= zFimR - 1e-9) zs.add(Math.round(zz * 1000) / 1000); }))); // ±0,001: subida/descida na parede fica reta (sem diagonal)
            const lista = Array.from(zs).sort((a, b) => b - a).map((zR) => ({ z: zR, x: maxEntre(zR - Lb - oz, zR + oz) + ox }));
            const simp: { z: number; x: number }[] = [];
            lista.forEach((pt) => {
              if (simp.length >= 2) {
                const a = simp[simp.length - 2];
                const b = simp[simp.length - 1];
                if (Math.abs((b.x - a.x) * (pt.z - a.z) - (b.z - a.z) * (pt.x - a.x)) < 1e-6) simp.pop();
              }
              simp.push(pt);
            });
            return simp;
          };
          const passaPerfil = (simp: { z: number; x: number }[], fx: number) => {
            W("G00 Z" + f(zProg(simp[0].z)) + ";");
            W("G00 X" + f(xSeg - 1) + ";");
            W("G01 X" + f(simp[0].x) + " F" + fx + ";");
            for (let k = 1; k < simp.length; k++) W("G01 X" + f(simp[k].x) + " Z" + f(zProg(simp[k].z)) + ";");
            W("G01 X" + f(xSeg - 1) + ";");
            W("G00 X" + f(xSeg) + ";");
          };
          if (Lb > 0 && zIniR - zFimR > 1e-6 && (sx > 0 || sz > 0)) {
            W("(CONTORNO NO PERFIL DEIXANDO SOBREMETAL X" + f(sx) + " Z" + f(sz) + " - F" + p.f + ");");
            passaPerfil(perfilCanal(sx, sz), p.f);
          }
          if (p.acab === 1 && Lb > 0 && zIniR - zFimR > 1e-6) {
            const fa = (p.fa ?? 0) > 0 ? p.fa : p.f;
            W("(PASSE DE ACABAMENTO NO PERFIL DO CANAL - F" + fa + ");");
            passaPerfil(perfilCanal(0, 0), fa);
          }
          return;
        }
        if (!pl.grupos.length) { W("(NADA PARA CORTAR SEM INVADIR O PERFIL - CONFERIR BEDAME E REGIAO);"); return; }
        W("G00 X" + f(bD + fol2) + " Z" + f(pl.grupos[0][0].z) + " M08; (CHEGA POR FORA)");
        W("G00 X" + f((intE ? KM - dSegM + fol2 : pl.xSeg)) + ";");
        pl.grupos.forEach((g) => {
          const zi = g[0].z;
          const zf = g[g.length - 1].z;
          const fundo = g[0].d;
          W("G00 Z" + f(zi) + ";");
          if (op.ciclo) {
            if ((p.ps ?? 0) > p.larg + 1e-6) W("(ATENCAO: PASSO Q MAIOR QUE A LARGURA DO BEDAME - VAI SOBRAR DEGRAU);");
            W("G75 R" + f(p.re ?? 0.5) + ";");
            W("G75 X" + f(fundo) + " Z" + f(zf) + " P" + Math.round(p.pk * 1000) + " Q" + Math.round(((p.ps ?? 0) > 0 ? p.ps : p.larg * 0.8) * 1000) + (p.uso === 2 && (p.ra ?? 0) > 0 ? " R" + f(p.ra) : "") + " F" + p.f + "; (" + (p.uso === 2 ? "USO FACEAMENTO" : "USO CANAL - SEM ALIVIO NO FUNDO") + ")");
          } else {
            let z = zi;
            for (;;) {
              W("G00 Z" + f(z) + ";");
              W("G01 X" + f(fundo) + " F" + p.f + ";");
              W("G00 X" + f((intE ? KM - dSegM + fol2 : pl.xSeg)) + ";");
              if (z <= zf + 1e-6) break;
              z = Math.max(zf, z - p.larg * 0.8);
            }
          }
          W("G00 X" + f((intE ? KM - dSegM + fol2 : pl.xSeg)) + ";");
        });
        if (pl.sobra) W("(SOBRA MATERIAL NOS FLANCOS OU RAIOS DO CANAL - ACABAR COM ACABAMENTO ENTRAR NOS REBAIXOS 1);");
      });
      fimInt(); recuar();
      return;
    }
    if (op.tipo === "roscaExt") {
      const s = sub(geo.ext, op.faixas);
      if (!s.length) { W("(REGIAO SEM PERFIL EXTERNO);"); return; }
      const maior = Math.max(...s.map((q) => Math.max(q.xa, q.xb)));
      const h = p.h > 0 ? p.h : 0.6134 * p.passo;
      const zS = s[0].zA;
      const zE = s[s.length - 1].zB;
      W("(ROSCA EXTERNA D" + f(maior) + " X PASSO " + f(p.passo) + " - Z" + f(zS) + " A Z" + f(zE) + ");");
      W("G97 S" + p.rpm + " M03;");
      W("G00 X" + f(bD + 2) + " Z" + f(zS + aprox) + " M08; (CHEGA POR FORA)");
      W("G00 X" + f(maior + 2) + ";");
      W("G76 P010060 Q50 R0.05;");
      W("G76 X" + f(maior - 2 * h) + " Z" + f(zE) + " P" + Math.round(h * 1000) + " Q" + Math.round(p.q * 1000) + " F" + p.passo + ";");
      recuar();
      return;
    }
    if (op.tipo === "centro") {
      // Começo/Fim em Z: pode começar dentro de um furo que já existe
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1])));
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      W("(CENTRO DE Z" + f(zIni) + " ATE Z" + f(zFim) + ");");
      W("G97 S" + p.rpm + " M03;");
      W("G00 X0.0 Z" + f(zF + aprox) + " M08;");
      if (zIni < zF - 0.01) W("G00 Z" + f(zIni + aprox) + "; (COMECA DENTRO DO FURO JA FEITO)");
      W("G01 Z" + f(zFim) + " F" + p.f + ";");
      W("G00 Z" + f(zF + aprox) + ";");
      recuar();
      return;
    }
    if (op.tipo === "furo" || op.tipo === "macho") {
      const zFim = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1])));
      const zIni = Math.max(...fxs.map((fx) => Math.max(fx[0], fx[1]))); // começo: pode ser dentro de um furo já feito
      if (op.tipo === "furo") {
        W("(BROCA D" + f(p.d) + " ATE Z" + f(zFim) + ");");
        W("G97 S" + p.rpm + " M03;");
        W("G00 X0.0 Z" + f(zF + aprox) + " M08;");
        if (zIni < zF - 0.01) W("G00 Z" + f(zIni + aprox) + "; (COMECA DENTRO DO FURO JA FEITO)");
        if (op.ciclo) {
          W("G83 X0.0 Z" + f(zFim) + " Q" + Math.round(p.q * 1000) + " F" + p.f + "; (Q EM MILESIMO)");
          W("G80;");
        } else {
          let z = Math.min(zF, zIni);
          const qVal = Math.max(0.1, (p.q ?? 5) > 0 ? p.q : 5);
          let gFuro = 0;
          while (gFuro++ < 2000 && z > zFim + 1e-6) {
            z = Math.max(zFim, z - qVal);
            W("G01 Z" + f(z) + " F" + p.f + ";");
            W("G00 Z" + f(zF + aprox) + ";");
            if (z > zFim + 1e-6) W("G00 Z" + f(z + 0.5) + ";");
          }
        }
      } else {
        W("(MACHO PASSO " + f(p.passo) + " ATE Z" + f(zFim) + ");");
        W("M29 S" + p.rpm + "; (MACHO RIGIDO - CONFERIR)");
        W("G00 X0.0 Z" + f(zF + aprox) + " M08;");
        if (zIni < zF - 0.01) W("G00 Z" + f(zIni + aprox) + "; (COMECA DENTRO DO FURO JA FEITO)");
        W("G84 Z" + f(zFim) + " F" + p.passo + ";");
        W("G80;");
      }
      recuar();
      return;
    }
    // (desbaste/acabamento interno agora usam o bloco do externo com X espelhado)
    if (op.tipo === "roscaInt") {
      const s = sub(geo.int, op.faixas);
      if (!s.length) { W("(REGIAO SEM PERFIL INTERNO);"); return; }
      const menor = p.d0 > 0 ? p.d0 : Math.min(...s.map((q) => Math.min(q.xa, q.xb)));
      const h = p.h > 0 ? p.h : 0.5413 * p.passo;
      const zS = s[0].zA;
      const zE = s[s.length - 1].zB;
      W("(ROSCA INTERNA - MENOR D" + f(menor) + " X PASSO " + f(p.passo) + ");");
      W("G97 S" + p.rpm + " M03;");
      W("G00 X" + f(menor - 1) + " Z" + f(zS + aprox) + " M08;");
      W("G76 P010060 Q50 R0.05;");
      W("G76 X" + f(menor + 2 * h) + " Z" + f(zE) + " P" + Math.round(h * 1000) + " Q" + Math.round(p.q * 1000) + " F" + p.passo + ";");
      W("G00 Z" + f(zF + aprox) + "; (SAI DO FURO)");
      recuar();
      return;
    }
    if (op.tipo === "corte") {
      const zc = Math.min(...fxs.map((fx) => Math.min(fx[0], fx[1]))); // Z do corte (Começo/Fim)
      const xfc = p.xf !== undefined ? p.xf : -0.5; // Ø final do corte
      W("M400; (SINC: ESPERA O CONTRAFUSO PEGAR A PECA - CONFERIR NUMERO)");
      fuso(p, bD, 1, " (BEDAME L" + f(p.larg) + " - REFERENCIA NO LADO DIREITO)");
      W("G00 X" + f(bD + 2) + " Z" + f(zc) + " M08;");
      if (xfc < 1) W("G01 X1.0 F" + p.f + ";");
      W("G01 X" + f(xfc) + " F" + f(xfc < 1 ? p.f * 0.6 : p.f) + ";");
      W("G00 X" + f(bD + 2) + ";");
      W("M401; (SINC: CORTE TERMINADO - CONTRAFUSO PODE RECUAR)");
      W("(AVANCO DA BARRA PARA A PROXIMA PECA - COMPLETAR CONFORME A MAQUINA);");
      recuar();
    }
  });
  alvo = out;
  const fimOps = out.length;
  W("");
  W("G00 X" + f(bD + 20) + " M09;");
  W("G00 Z50.0;");
  W("M30;");

  // ORIGENS: cada operação sai no zero da sua origem (G54, G55...) e no sentido do Z da máquina (normal ou SUÍÇO)
  const z0 = cfg.zero || { face: "direita", offsetZ: 0 };
  const trf = (k: number) => {
    const os = cfg.origens || [];
    const og = os[k - 1] || os[0];
    if (!og) return null;
    const face = k === 1 ? z0.face : og.face;
    const off = k === 1 ? z0.offsetZ : og.desl;
    const vira = face !== z0.face; // zero na outra face = peça virada
    const sg = og.tipo === "suico" ? -1 : 1;
    if (!vira && Math.abs(off - z0.offsetZ) < 1e-9 && sg === 1) return null;
    return (linha: string) => linha.replace(/(^|[^A-Z])([ZW])(-?\d+(?:\.\d*)?)/g, (_m: string, pre: string, eixo: string, num: string) => {
      const v = parseFloat(num);
      if (eixo === "W") return pre + "W" + f(sg * (vira ? -1 : 1) * v);
      const zn = v - z0.offsetZ;
      const zk = vira ? -zn - geo.L + off : zn + off;
      return pre + "Z" + f(sg * zk);
    });
  };
  marcas.forEach((m, j) => {
    const t = trf(m.op.orig || 1);
    if (!t) return;
    const fim = j + 1 < marcas.length ? marcas[j + 1].ini : fimOps;
    for (let q = m.ini; q < fim; q++) out[q] = t(out[q]);
  });
  const t1 = trf(1);
  if (t1) for (let q = fimOps; q < out.length; q++) out[q] = t1(out[q]);
  const g: string[] = [];
  const G = (s: string) => g.push(s);
  G("O0002 (" + nm + " - LADO 2 - HEAD2 / CONTRAFUSO);");
  G("(MAQUINA: ERGOMAT TBSY 60 - CANAL 2 / HEAD2 - TORRE SUPERIOR);");
  G("(CONTRAFUSO NA POSICAO T1 - TRABALHA COM T521, T22, T23);");
  G("(GERADO PELO TORNO MASTER EM " + data + " - CONFERIR ANTES DE RODAR);");
  G("");
  G("G18 G40 G97 G99; (CONFERIR CABECALHO PADRAO DA MAQUINA)");
  if (h2.length) {
    G("");
    G("(=== OPERACOES DA TORRE SUPERIOR H2 NO LADO 1 - CONFERIR SINCRONISMO COM O HEAD1 ===);");
    h2.forEach((s) => G(s));
    G("");
  }
  G("(1 - CONTRAFUSO PEGA A PECA NO D" + f(geo.dTras) + ", PERTO DO CORTE);");
  G("(COMPLETAR: CHAMADA DO CONTRAFUSO / ABRIR PINCA / AVANCO ATE A PEGA);");
  G("M400; (SINC: CONTRAFUSO PEGOU - HEAD1 PODE CORTAR)");
  G("M401; (SINC: ESPERA O CORTE TERMINAR)");
  G("(2 - RECUO DO CONTRAFUSO COM A PECA);");
  G("(3 - LADO 2: FACEAR O LADO DO CORTE ATE O COMPRIMENTO FINAL L" + f(geo.L) + ");");
  G("(COMPLETAR COM T521 / T22 / T23 CONFORME O LAYOUT DA TORRE);");
  G("M30;");
  return { textos: [out.join("\n"), g.join("\n")] as [string, string], nomes: [nm + ".P-2", nm] as [string, string] };
}

export type TMOrigem = { g: string; fuso: "principal" | "contrafuso"; tipo: "normal" | "suico"; face: "direita" | "esquerda"; desl: number };
const TM_CODIGOS_ORIGEM = ["G54", "G55", "G56", "G57", "G58", "G59"];
const TM_ORIGENS_PADRAO: TMOrigem[] = [
  { g: "G54", fuso: "principal", tipo: "normal", face: "direita", desl: 0 },
  { g: "G55", fuso: "contrafuso", tipo: "normal", face: "esquerda", desl: 0 },
];

export type TMRegiao = { cor: string; faixas: [number, number][]; ativa: boolean; grupo?: string };
export type TMFixZone = { lado: 1 | 2; za: number; zb: number; d: number };

export const PainelPrograma: React.FC<{
  partProfile: PartProfile | null;
  partZero: PartZeroConfig;
  setPartZero: (z: PartZeroConfig) => void;
  onSentidoZ: (s: 1 | -1) => void;
  stockProfile: PartProfile | null;
  showStock: boolean;
  setShowStock: (v: boolean) => void;
  onAnexarStep: (alvo: "peca" | "bruto") => void;
  regiaoSel: { opId: string; modo: "cf" | "linha" } | null;
  setRegiaoSel: (v: { opId: string; modo: "cf" | "linha" } | null) => void;
  pick: { seq: number; r: { z: number; x: number; za?: number; zb?: number } } | null;
  onRegioes: (r: TMRegiao[]) => void;
  onFix: (z: TMFixZone[]) => void;
  onGerar: (r: { textos: [string, string]; nomes: [string, string] }, vivo?: boolean) => void;
  onClose: () => void;
}> = ({ partProfile, partZero, setPartZero, onSentidoZ, stockProfile, showStock, setShowStock, onAnexarStep, regiaoSel, setRegiaoSel, pick, onRegioes, onFix, onGerar, onClose }) => {
  const ler = <T,>(k: string, padrao: T): T => {
    try { const v = localStorage.getItem(k); return v ? { ...padrao, ...JSON.parse(v) } : padrao; } catch { return padrao; }
  };
  const [cfg, setCfg] = useState(() => ler("cnc_painel_cfg", { maq: "TBSY", material: "Aço carbono", nome: "", rpmMax: 3000, l1: true, saida: 5, pega1: 15, l2: true, pega2: 10, origens: TM_ORIGENS_PADRAO as TMOrigem[] }));
  const [ops, setOps] = useState<TMOp[]>(() => {
    try { const v = JSON.parse(localStorage.getItem("cnc_ops_painel") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [aberta, setAberta] = useState<string | null>(null);
  const [addTipo, setAddTipo] = useState<string>("");
  const [confSugerir, setConfSugerir] = useState<boolean>(false); // "sugerir de novo" pede Sim/Não no próprio painel
  const [aoVivo, setAoVivo] = useState<boolean>(true); // programa e gráfico atualizam sozinhos a cada mudança
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [podeArrastar, setPodeArrastar] = useState<string | null>(null); // só arrasta pelo cabeçalho, nunca pelas caixas de digitar
  const primeiroRef = useRef<number | null>(null);
  useEffect(() => { try { localStorage.setItem("cnc_painel_cfg", JSON.stringify(cfg)); } catch {} }, [cfg]);
  useEffect(() => { try { localStorage.setItem("cnc_ops_painel", JSON.stringify(ops)); } catch {} }, [ops]);

  const geo = useMemo(() => tmGeo(partProfile, partZero), [partProfile, partZero]);
  // sentido do Z da ORIGEM 1: suíço = Z positivo entrando na peça (o gráfico e as regiões viram junto)
  const sZ: 1 | -1 = cfg.origens && cfg.origens[0] && cfg.origens[0].tipo === "suico" ? -1 : 1;
  useEffect(() => { onSentidoZ(sZ); }, [sZ]);
  const bD = stockProfile && showStock ? stockProfile.rMax * 2 : geo ? geo.dMax + 2 : 0;

  // peça nova sem operações: sugere as operações
  useEffect(() => {
    if (geo && !ops.length) setOps(tmOpsPadrao(geo, cfg.material));
    if (partProfile && !cfg.nome) setCfg((c) => ({ ...c, nome: partProfile.name.replace(/\.[^.]+$/, "").toUpperCase().replace(/[^A-Z0-9_\-]/g, "_").slice(0, 20) }));
  }, [geo]);

  // regiões pintadas na peça
  useEffect(() => {
    onRegioes(ops.filter((o) => o.ativo && TM_TIPOS[o.tipo].regiao).map((o) => ({ cor: o.cor, faixas: o.faixas.map((fx) => [fx[0] * sZ, fx[1] * sZ] as [number, number]), grupo: TM_TIPOS[o.tipo].grupo, ativa: aberta === o.id || (regiaoSel ? regiaoSel.opId === o.id : false) })));
  }, [ops, aberta, regiaoSel, sZ]);

  // fixações ligadas/desligadas viram zonas FIX no simulador
  useEffect(() => {
    if (!geo) { onFix([]); return; }
    const corteOp = ops.find((o) => o.tipo === "corte" && o.ativo);
    const lc = corteOp ? corteOp.p.larg : 3;
    const z: TMFixZone[] = [];
    if (cfg.l1) z.push({ lado: 1, za: geo.zBack - lc - cfg.saida - cfg.pega1, zb: geo.zBack - lc - cfg.saida, d: bD });
    if (cfg.l2) z.push({ lado: 2, za: geo.zBack, zb: geo.zBack + cfg.pega2, d: geo.dTras });
    onFix(sZ === 1 ? z : z.map((q) => ({ ...q, za: -q.zb, zb: -q.za })));
  }, [geo, cfg.l1, cfg.l2, cfg.saida, cfg.pega1, cfg.pega2, bD, ops, sZ]);

  // toque na peça (vem do simulador) vira região da operação escolhida
  useEffect(() => {
    if (!pick || !regiaoSel) return;
    const r = sZ === 1 ? pick.r : { ...pick.r, z: -pick.r.z, za: pick.r.za === undefined ? undefined : -pick.r.za, zb: pick.r.zb === undefined ? undefined : -pick.r.zb };
    const sel = regiaoSel;
    if (sel.modo === "linha") {
      if (r.za === undefined || r.zb === undefined) return;
      const nova: TMFaixa = [Math.min(r.za, r.zb), Math.max(r.za, r.zb)];
      setOps((arr) => arr.map((o) => {
        if (o.id !== sel.opId) return o;
        const ja = o.faixas.findIndex((fx) => Math.abs(fx[0] - nova[0]) < 1e-3 && Math.abs(fx[1] - nova[1]) < 1e-3);
        return { ...o, faixas: ja >= 0 ? o.faixas.filter((_, k) => k !== ja) : [...o.faixas, nova] };
      }));
      return;
    }
    if (primeiroRef.current === null) { primeiroRef.current = r.z; return; }
    const z1 = primeiroRef.current;
    primeiroRef.current = null;
    setOps((arr) => arr.map((o) => (o.id === sel.opId ? { ...o, faixas: [[Math.min(z1, r.z), Math.max(z1, r.z)]] } : o)));
    setRegiaoSel(null);
  }, [pick ? pick.seq : -1]);

  const setOp = (id: string, mud: Partial<TMOp>) => setOps((arr) => arr.map((o) => (o.id === id ? { ...o, ...mud } : o)));
  const mover = (id: string, d: number) => setOps((arr) => {
    const i = arr.findIndex((o) => o.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    const c = [...arr];
    const t = c[i]; c[i] = c[j]; c[j] = t;
    return c;
  });
  const escolherRegiao = (id: string, modo: "cf" | "linha") => {
    primeiroRef.current = null;
    if (regiaoSel && regiaoSel.opId === id && regiaoSel.modo === modo) setRegiaoSel(null);
    else setRegiaoSel({ opId: id, modo });
  };
  const textoRegiao = (o: TMOp) => {
    if (!TM_TIPOS[o.tipo].regiao) return "peça toda";
    if (!o.faixas.length) return geo && tmFaixaPadrao(o.tipo, geo, o.p) ? "padrão da peça (abra para mudar)" : "sem região";
    return o.faixas.map((fx) => "Z" + tmFmt(sZ * Math.max(fx[0], fx[1])) + "→Z" + tmFmt(sZ * Math.min(fx[0], fx[1]))).join("  ");
  };
  const toda = (o: TMOp): TMFaixa[] => {
    if (!geo) return [];
    const pad = tmFaixaPadrao(o.tipo, geo, o.p);
    if (pad) return pad;
    const grupo = TM_TIPOS[o.tipo].grupo;
    if (grupo === "INTERNO") return geo.int.length ? [[geo.intZmin, geo.intZmax]] : [];
    return [[geo.zBack, geo.zFront]];
  };
  const gerar = () => {
    if (!geo) return;
    onGerar(tmGerar(ops, geo, { nome: cfg.nome, bD, rpmMax: cfg.rpmMax, material: cfg.material, origens: cfg.origens, zero: partZero }));
  };
  // AO VIVO: cada mudança no painel já refaz o programa e o simulador mostra na hora
  useEffect(() => {
    if (!aoVivo || !geo) return;
    const t = setTimeout(() => onGerar(tmGerar(ops, geo, { nome: cfg.nome, bD, rpmMax: cfg.rpmMax, material: cfg.material, origens: cfg.origens, zero: partZero }), true), 400);
    return () => clearTimeout(t);
  }, [ops, cfg, bD, geo, aoVivo, partZero]);
  // arrastar operação para cima / para baixo na árvore
  const soltarEm = (alvoId: string) => {
    if (!arrastando || arrastando === alvoId) return;
    setOps((arr) => {
      const de = arr.findIndex((x) => x.id === arrastando);
      const para = arr.findIndex((x) => x.id === alvoId);
      if (de < 0 || para < 0) return arr;
      const c = [...arr];
      const [m] = c.splice(de, 1);
      c.splice(para, 0, m);
      return c;
    });
    setArrastando(null);
  };

  const inp = "bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white";
  const sw = (on: boolean, onClick: () => void, rot: string) => (
    <button onClick={onClick} className={"text-[10px] font-bold px-2 py-0.5 rounded border transition " + (on ? "bg-emerald-600/80 border-emerald-400 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-500")}>
      {rot} {on ? "ON" : "OFF"}
    </button>
  );
  const num = (v: number, set: (n: number) => void, step = 0.1, w = "w-16") => (
    <TMNum v={v} set={set} cls={inp + " " + w + (step ? "" : "")} />
  );

  return (
    <div className="flex-1 min-w-0 min-h-[60vh] md:min-h-0 flex flex-col bg-[#111118] border border-zinc-800 rounded-xl overflow-hidden text-zinc-100">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#0d0d14]">
        <div className="text-sm font-bold text-emerald-400">▶ Programa da peça</div>
        <div className="flex items-center gap-2">
          <select value={cfg.maq} onChange={(e) => setCfg({ ...cfg, maq: e.target.value })} className={inp}>
            <option value="TBSY">Ergomat TBSy 60</option>
            <option value="X" disabled>Star SR38 (em cadastro)</option>
            <option value="Y" disabled>Citizen (em cadastro)</option>
            <option value="Z" disabled>Index ABC (em cadastro)</option>
          </select>
          <button onClick={onClose} className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-zinc-700" title="Fechar o painel e voltar aos programas">Programas ✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* PEÇA E BRUTO */}
        <div className="rounded-lg border border-zinc-800 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-sky-300">PEÇA</span>
            <button onClick={() => onAnexarStep("peca")} className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-700 hover:bg-sky-600">{partProfile ? "Trocar STEP" : "Anexar STEP"}</button>
          </div>
          {geo && partProfile ? (
            <div className="text-xs text-zinc-300 flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-bold text-white truncate max-w-[180px]">{partProfile.name}</span>
              <span>L {tmFmt(geo.L)}</span>
              <span>Ø máx {tmFmt(geo.dMax)}</span>
              {geo.int.length > 0 && <span>Furo Ø{tmFmt(geo.intDmin)}</span>}
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Anexe o STEP da peça para montar as operações.</div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span className="text-zinc-400">Nome</span>
            <input value={cfg.nome} onChange={(e) => setCfg({ ...cfg, nome: e.target.value.toUpperCase() })} className={inp + " w-32"} />
            <span className="text-zinc-400">Material</span>
            <select value={cfg.material} onChange={(e) => setCfg({ ...cfg, material: e.target.value })} className={inp}>
              {Object.keys(TM_MAT_FATOR).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-zinc-400">G92 S</span>
            {num(cfg.rpmMax, (n) => setCfg({ ...cfg, rpmMax: n }), 100)}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span className="text-zinc-400">Bruto:</span>
            {stockProfile ? sw(showStock, () => setShowStock(!showStock), "STEP do bruto Ø" + tmFmt(stockProfile.rMax * 2)) : <span className="text-zinc-500">sem STEP do bruto (usando Ø{tmFmt(bD)})</span>}
            <button onClick={() => onAnexarStep("bruto")} className="text-[10px] font-bold px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500">{stockProfile ? "Trocar bruto" : "Anexar bruto (opcional)"}</button>
          </div>
        </div>

        {/* ORIGENS (ZERO PEÇA): G54, G55... cada operação escolhe a sua */}
        <div className="rounded-lg border border-cyan-900/60 p-2">
          <div className="text-[11px] font-bold text-cyan-300 mb-1">ORIGENS (zero peça) <span className="font-normal text-zinc-500">— cada operação escolhe a sua no botão G54/G55</span></div>
          <div className="space-y-1">
            {(cfg.origens || []).map((og: TMOrigem, k: number) => {
              const face = k === 0 ? partZero.face : og.face;
              const desl = k === 0 ? partZero.offsetZ : og.desl;
              const mud = (m: Partial<TMOrigem>) => {
                if (k === 0 && (m.face !== undefined || m.desl !== undefined)) setPartZero({ ...partZero, face: m.face !== undefined ? m.face : partZero.face, offsetZ: m.desl !== undefined ? m.desl : partZero.offsetZ });
                setCfg((c) => ({ ...c, origens: (c.origens || []).map((x: TMOrigem, j: number) => (j === k ? { ...x, ...m } : x)) }));
              };
              return (
                <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="w-5 text-center font-bold text-cyan-300">{k + 1}</span>
                  <select value={og.g} onChange={(e) => mud({ g: e.target.value })} className={inp}>
                    {TM_CODIGOS_ORIGEM.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select value={og.fuso} onChange={(e) => mud({ fuso: e.target.value as TMOrigem["fuso"] })} className={inp}>
                    <option value="principal">Fuso principal</option>
                    <option value="contrafuso">Contrafuso</option>
                  </select>
                  <select value={og.tipo} onChange={(e) => mud({ tipo: e.target.value as TMOrigem["tipo"] })} className={inp} title="Torno normal: Z negativo entrando na peça | Suíço: Z positivo entrando na peça">
                    <option value="normal">Torno normal (Z−)</option>
                    <option value="suico">Suíço (Z+)</option>
                  </select>
                  <select value={face} onChange={(e) => mud({ face: e.target.value as TMOrigem["face"] })} className={inp}>
                    <option value="direita">Zero na face direita</option>
                    <option value="esquerda">Zero na face esquerda</option>
                  </select>
                  <span className="text-zinc-400">desloc. Z</span>
                  {num(desl, (n) => mud({ desl: n }), 0.1, "w-16")}
                  {k > 0 && (
                    <button
                      onClick={() => {
                        setCfg((c) => ({ ...c, origens: (c.origens || []).filter((_x: TMOrigem, j: number) => j !== k) }));
                        setOps((arr) => arr.map((o) => ((o.orig || 1) - 1 === k ? { ...o, orig: 1 } : (o.orig || 1) - 1 > k ? { ...o, orig: (o.orig || 1) - 1 } : o)));
                      }}
                      className="text-zinc-500 hover:text-red-400"
                      title="Apagar esta origem (as operações dela voltam para a origem 1)"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setCfg((c) => {
              const os: TMOrigem[] = c.origens || [];
              const usados = os.map((x) => x.g);
              const g = TM_CODIGOS_ORIGEM.find((x) => !usados.includes(x)) || "G59";
              return { ...c, origens: [...os, { g, fuso: "principal", tipo: os[0] ? os[0].tipo : "normal", face: "direita", desl: 0 } as TMOrigem] };
            })}
            className="mt-1 text-[10px] font-bold px-2 py-0.5 rounded border border-cyan-700 text-cyan-300 hover:border-cyan-500"
          >
            + Origem
          </button>
          <div className="text-[10px] text-zinc-500 mt-1">A origem 1 é o zero do desenho no simulador (o mesmo do painel da peça). Suíço na origem 1 vira o sentido do Z no gráfico também.</div>
        </div>
        {/* FIXAÇÕES */}
        <div className="rounded-lg border border-red-900/60 p-2">
          <div className="text-[11px] font-bold text-red-300 mb-1">FIXAÇÕES (zona proibida)</div>
          <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
            {sw(cfg.l1, () => setCfg({ ...cfg, l1: !cfg.l1 }), "Lado 1")}
            <span className="text-zinc-400">placa: pega</span>{num(cfg.pega1, (n) => setCfg({ ...cfg, pega1: n }), 0.5, "w-14")}
            <span className="text-zinc-400">dist. do corte</span>{num(cfg.saida, (n) => setCfg({ ...cfg, saida: n }), 0.5, "w-14")}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {sw(cfg.l2, () => setCfg({ ...cfg, l2: !cfg.l2 }), "Lado 2")}
            <span className="text-zinc-400">contrafuso (T1): pega</span>{num(cfg.pega2, (n) => setCfg({ ...cfg, pega2: n }), 0.5, "w-14")}
          </div>
        </div>

        {/* OPERAÇÕES */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="flex items-center gap-1.5 cursor-pointer" title="Ticar / desticar todas as operações">
              <input type="checkbox" className="w-3 h-3 opacity-70" checked={ops.length > 0 && ops.every((o) => o.ativo)} ref={(el) => { if (el) el.indeterminate = ops.some((o) => o.ativo) && !ops.every((o) => o.ativo); }} onChange={(e) => { const v = e.target.checked; setOps((arr) => arr.map((o) => ({ ...o, ativo: v }))); }} />
              <span className="text-[11px] font-bold text-amber-300">ÁRVORE DE OPERAÇÕES — LADO 1</span>
            </label>
            {/* confirmação dentro do painel (o confirm() do navegador é bloqueado na prévia do AI Studio) */}
            {geo && (confSugerir ? (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="text-amber-300 font-bold">Trocar pelas sugeridas?</span>
                <button onClick={() => { setOps(tmOpsPadrao(geo, cfg.material)); setAberta(null); setConfSugerir(false); }} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Sim</button>
                <button onClick={() => setConfSugerir(false)} className="px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:text-white">Não</button>
              </span>
            ) : (
              <button onClick={() => setConfSugerir(true)} className="text-[10px] text-zinc-400 hover:text-white underline">sugerir de novo</button>
            ))}
          </div>
          {regiaoSel && (
            <div className="text-[11px] font-bold bg-amber-500/20 border border-amber-500/60 text-amber-200 rounded px-2 py-1 mb-2">
              {regiaoSel.modo === "cf" ? "Toque na peça no COMEÇO e depois no FIM da região" : "Toque nas LINHAS da peça (toque de novo para tirar). Clique em OK quando terminar."}
              <button onClick={() => setRegiaoSel(null)} className="ml-2 px-2 rounded bg-amber-600 text-white">OK</button>
            </div>
          )}
          <div className="space-y-1.5">
            {ops.map((o, i) => {
              const T = TM_TIPOS[o.tipo];
              const aberto = aberta === o.id;
              const escolhendo = regiaoSel && regiaoSel.opId === o.id;
              return (
                <div
                  key={o.id}
                  draggable={podeArrastar === o.id}
                  onMouseDown={(e) => setPodeArrastar((e.target as HTMLElement).closest("input, select, textarea, button") ? null : o.id)}
                  onDragStart={() => setArrastando(o.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => soltarEm(o.id)}
                  onDragEnd={() => setArrastando(null)}
                  className={"rounded-lg border " + (arrastando && arrastando !== o.id ? "border-dashed " : "") + (aberto || escolhendo ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50") + (o.ativo ? "" : " opacity-50") + (arrastando === o.id ? " opacity-40" : "")}
                  title="Arraste para mudar a ordem"
                >
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <input type="checkbox" checked={o.ativo} onChange={(e) => setOp(o.id, { ativo: e.target.checked })} title="Usar esta operação" />
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: o.cor }} />
                    <button onClick={() => setAberta(aberto ? null : o.id)} className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-bold truncate">{i + 1}. {T.nome} <span className="text-[9px] text-zinc-500">{T.grupo}</span></div>
                      <div className="text-[10px] text-zinc-400 truncate">{textoRegiao(o)}</div>
                    </button>
                    <input value={o.ferr} onChange={(e) => setOp(o.id, { ferr: e.target.value.toUpperCase() })} className={inp + " w-16 text-amber-300"} title="Ferramenta" />
                    {T.ciclo && (
                      T.ciclos ? (
                        <select value={o.ciclo ? o.cicloSel || T.ciclos[0] : ""} onChange={(e) => { const v = e.target.value; setOp(o.id, v ? { ciclo: true, cicloSel: v } : { ciclo: false }); }} className={"text-[10px] font-bold px-1 py-0.5 rounded border bg-zinc-950 " + (o.ciclo ? "border-cyan-500 text-cyan-300" : "border-zinc-700 text-zinc-500")} title="Escolha o ciclo desta operação (os campos mudam conforme o ciclo)">
                          <option value="">sem ciclo</option>
                          {T.ciclos.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setOp(o.id, { ciclo: !o.ciclo })} className={"text-[10px] font-bold px-1.5 py-0.5 rounded border " + (o.ciclo ? "border-cyan-500 text-cyan-300" : "border-zinc-700 text-zinc-500")} title="Usar ciclo ou escrever linha a linha">
                          {o.ciclo ? T.ciclo : "sem ciclo"}
                        </button>
                      )
                    )}
                    <button onClick={() => setOp(o.id, { cab: o.cab === "H2" ? "H1" : "H2" })} className={"text-[10px] font-bold px-1.5 py-0.5 rounded border " + (o.cab === "H2" ? "border-purple-500 text-purple-300" : "border-sky-600 text-sky-300")} title="Onde a ferramenta está: H1 = HEAD1 torre inferior (canal 1) | H2 = HEAD2 torre superior (canal 2)">{o.cab || "H1"}</button>
                    <button onClick={() => { const n = (cfg.origens || []).length || 1; setOp(o.id, { orig: ((o.orig || 1) % n) + 1 }); }} className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-700 text-cyan-300 hover:border-cyan-500" title="Origem (zero peça) desta operação — clique para trocar. Configure na seção ORIGENS">{((cfg.origens || [])[(o.orig || 1) - 1] || { g: "G54" }).g}</button>
                    <button
                      onClick={() => {
                        const c: TMOp = { ...o, id: o.tipo + "_" + Date.now().toString(36), cor: TM_CORES[ops.length % TM_CORES.length], faixas: o.faixas.map((fx) => [fx[0], fx[1]] as TMFaixa), p: { ...o.p } };
                        setOps((arr) => { const k = arr.findIndex((x) => x.id === o.id); return [...arr.slice(0, k + 1), c, ...arr.slice(k + 1)]; });
                        setAberta(c.id);
                      }}
                      className="text-zinc-500 hover:text-white text-xs"
                      title="Copiar esta operação (depois é só mudar região, parâmetros ou ferramenta)"
                    >
                      ⧉
                    </button>
                    <button onClick={() => mover(o.id, -1)} className="text-zinc-500 hover:text-white text-xs" title="Subir">▲</button>
                    <button onClick={() => mover(o.id, 1)} className="text-zinc-500 hover:text-white text-xs" title="Descer">▼</button>
                    <button onClick={() => { setOps((arr) => arr.filter((x) => x.id !== o.id)); if (escolhendo) setRegiaoSel(null); }} className="text-zinc-500 hover:text-red-400 text-xs" title="Apagar">✕</button>
                  </div>
                  {aberto && (
                    <div className="px-2 pb-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 pt-1.5 text-[11px]">
                        <span className="text-zinc-400">Nome da ferramenta</span>
                        <input value={o.nomeFerr || ""} onChange={(e) => { const nf = e.target.value.toUpperCase(); const pz = /CNMG|WNMG|CCMT|CNMA|WNMA/.test(nf) ? 0 : /DNMG|DCMT|DNMA/.test(nf) ? 1 : /TNMG|TCMT|TNMA/.test(nf) ? 2 : /VNMG|VBMT|VCMT|VNMA/.test(nf) ? 3 : -1; setOp(o.id, pz >= 0 ? { nomeFerr: nf, p: { ...o.p, pas: pz, ang: TM_PASTILHA_ANG[pz] } } : { nomeFerr: nf }); }} className={inp + " flex-1"} placeholder="EX: PASTILHA VNMG 1604" />
                      </div>
                      {T.regiao && (
                        <div className="flex flex-wrap items-center gap-1.5 py-1.5">
                          <span className="text-[10px] text-zinc-400">Região:</span>
                          <button onClick={() => escolherRegiao(o.id, "cf")} className={"text-[10px] font-bold px-2 py-0.5 rounded border " + (escolhendo && regiaoSel && regiaoSel.modo === "cf" ? "bg-amber-600 border-amber-400 text-white" : "border-zinc-600 hover:border-zinc-400")}>Começo / Fim</button>
                          <button onClick={() => escolherRegiao(o.id, "linha")} className={"text-[10px] font-bold px-2 py-0.5 rounded border " + (escolhendo && regiaoSel && regiaoSel.modo === "linha" ? "bg-amber-600 border-amber-400 text-white" : "border-zinc-600 hover:border-zinc-400")}>Linha por linha</button>
                          <button onClick={() => setOp(o.id, { faixas: toda(o) })} className="text-[10px] px-2 py-0.5 rounded border border-zinc-600 hover:border-zinc-400">Toda</button>
                          <button onClick={() => setOp(o.id, { faixas: [] })} className="text-[10px] px-2 py-0.5 rounded border border-zinc-600 hover:border-red-400">Limpar</button>
                          <button onClick={() => { const t = toda(o); setOp(o.id, { faixas: [...o.faixas, (t.length ? [t[0][0], t[0][1]] : [0, 0]) as TMFaixa] }); }} className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-600 text-emerald-300 hover:border-emerald-400" title="Cria um trecho para você DIGITAR o Z de começo e de fim">+ Digitar Z início/fim</button>
                        </div>
                      )}
                      {T.regiao && o.faixas.length > 0 && (
                        <div className="space-y-1 pb-1.5">
                          {(() => {
                    // UM só Começo/Fim (mesmo com várias linhas escolhidas): mostra o começo e o fim do conjunto e, ao mudar, corta/estende as linhas
                    const hi = Math.max(...o.faixas.map((g) => Math.max(g[0], g[1])));
                    const lo = Math.min(...o.faixas.map((g) => Math.min(g[0], g[1])));
                    const ajusta = (nLo: number, nHi: number) => setOp(o.id, { faixas: o.faixas.map((g) => { const gLo = Math.min(g[0], g[1]); const gHi = Math.max(g[0], g[1]); return [Math.abs(gLo - lo) < 1e-9 ? nLo : Math.max(gLo, nLo), Math.abs(gHi - hi) < 1e-9 ? nHi : Math.min(gHi, nHi)] as TMFaixa; }).filter((g) => g[1] >= g[0] - 1e-9) });
                    return (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-zinc-400">Começa em Z</span>
                        {num(sZ * hi, (n) => ajusta(lo, n * sZ), 0.1, "w-20")}
                        <span className="text-zinc-400">termina em Z</span>
                        {num(sZ * lo, (n) => ajusta(n * sZ, hi), 0.1, "w-20")}
                        <button onClick={() => setOp(o.id, { faixas: [] })} className="text-zinc-500 hover:text-red-400" title="Tirar a região">✕</button>
                        {o.faixas.length > 1 && <span className="text-[10px] text-zinc-500">({o.faixas.length} linhas)</span>}
                      </div>
                    );
                  })()}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {T.params.filter((pr) => (!pr.so || pr.so.includes(o.ciclo ? o.cicloSel || T.ciclo : "LINHA")) && (!pr.soUso || pr.soUso.includes(o.p.uso ?? 0)) && (!pr.quando || pr.quando[1].includes(o.p[pr.quando[0]] ?? 0))).map((pr) => (
                          <label key={pr.k} className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                            <span className="truncate">{(pr.rotPor && pr.rotPor[(o.ciclo ? o.cicloSel || T.ciclo : "LINHA")]) || pr.rot}</span>
                            {pr.check ? (
                              <input type="checkbox" className="w-4 h-4" checked={(o.p[pr.k] !== undefined ? o.p[pr.k] : pr.def) === 1} onChange={(e) => setOp(o.id, { p: { ...o.p, [pr.k]: e.target.checked ? 1 : 0 } })} />
                            ) : pr.opcoes ? (
                              <select value={o.p[pr.k] !== undefined ? o.p[pr.k] : pr.def} onChange={(e) => { const v = Number(e.target.value); setOp(o.id, { p: { ...o.p, [pr.k]: v, ...(pr.k === "pas" ? { ang: TM_PASTILHA_ANG[v] } : {}) } }); }} className={inp + " w-28"}>
                                {pr.opcoes.map((t, k) => <option key={k} value={k}>{t}</option>)}
                              </select>
                            ) : (
                              num(o.p[pr.k] !== undefined ? o.p[pr.k] : pr.def, (n) => setOp(o.id, { p: { ...o.p, [pr.k]: n } }), pr.step, "w-16")
                            )}
                          </label>
                        ))}
                      </div>
                      {(T.ciclo || T.ciclos) && <div className="text-[10px] text-cyan-300/80 mt-1">{TM_CICLO_DICA[o.ciclo ? o.cicloSel || T.ciclo : "LINHA"] || ""}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <select value={addTipo} onChange={(e) => setAddTipo(e.target.value)} className={inp + " flex-1"}>
              <option value="">+ Adicionar operação…</option>
              {(["EXTERNO", "INTERNO", "FINAL"] as const).map((gr) => (
                <optgroup key={gr} label={gr}>
                  {(Object.keys(TM_TIPOS) as TMOpTipo[]).filter((t) => TM_TIPOS[t].grupo === gr).map((t) => <option key={t} value={t}>{TM_TIPOS[t].nome}</option>)}
                </optgroup>
              ))}
            </select>
            <button
              disabled={!addTipo}
              onClick={() => {
                const t = addTipo as TMOpTipo;
                const nova = tmNovaOp(t, [], ops.length, cfg.material);
                nova.faixas = geo ? toda(nova) : [];
                const iCorte = ops.findIndex((x) => x.tipo === "corte");
                setOps((arr) => (iCorte >= 0 && t !== "corte" ? [...arr.slice(0, iCorte), nova, ...arr.slice(iCorte)] : [...arr, nova]));
                setAberta(nova.id);
                setAddTipo("");
              }}
              className={"text-xs font-bold px-3 py-1 rounded " + (addTipo ? "bg-emerald-700 hover:bg-emerald-600" : "bg-zinc-800 text-zinc-500")}
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-zinc-800 flex items-center justify-between gap-2 bg-[#0d0d14]">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-300" title="Cada mudança já refaz o programa no CANAL 1 e o simulador mostra na hora">
          <input type="checkbox" checked={aoVivo} onChange={(e) => setAoVivo(e.target.checked)} />
          Ao vivo
        </label>
        <span className="text-[10px] text-amber-400">⚠ Conferir antes de rodar</span>
        <button disabled={!geo} onClick={gerar} className={"text-sm font-bold px-4 py-1.5 rounded-lg " + (geo ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-500")}>
          ✔ Gerar e ver o programa
        </button>
      </div>
    </div>
  );
};
