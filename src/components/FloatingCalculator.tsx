import React, { useState, useEffect, useRef } from "react";
import { X, CornerDownLeft, RotateCcw, Clock, Minimize2, Maximize2, Trash2, HelpCircle } from "lucide-react";

interface FloatingCalculatorProps {
  onClose: () => void;
  onInsertValue?: (value: string) => void; // Optional function to insert value into G-Code editor
}

export default function FloatingCalculator({ onClose, onInsertValue }: FloatingCalculatorProps) {
  const [expression, setExpression] = useState<string>("");
  const [liveResult, setLiveResult] = useState<string>("");
  const [isDegreeMode, setIsDegreeMode] = useState<boolean>(true);
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Position and dragging states
  // We place it at a default visible absolute position (e.g., right side of center)
  const [position, setPosition] = useState({ x: 340, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 340, posY: 150, currentX: 340, currentY: 150 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("cnc_calc_history_v2");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save history helper
  const saveHistory = (newHistory: { expr: string; result: string }[]) => {
    setHistory(newHistory);
    localStorage.setItem("cnc_calc_history_v2", JSON.stringify(newHistory));
  };

  // Draggable Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    setIsDragging(true);
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.posX = position.x;
    dragRef.current.posY = position.y;
    dragRef.current.currentX = position.x;
    dragRef.current.currentY = position.y;
  };

  // Touch event dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    setIsDragging(true);
    const touch = e.touches[0];
    dragRef.current.startX = touch.clientX;
    dragRef.current.startY = touch.clientY;
    dragRef.current.posX = position.x;
    dragRef.current.posY = position.y;
    dragRef.current.currentX = position.x;
    dragRef.current.currentY = position.y;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      
      // Calculate bounds (stay partially on screen)
      const newX = Math.max(-100, Math.min(window.innerWidth - 150, dragRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.posY + dy));
      
      dragRef.current.currentX = newX;
      dragRef.current.currentY = newY;
      
      // Directly update transform for 60fps buttery-smooth feel
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setPosition({ x: dragRef.current.currentX, y: dragRef.current.currentY });
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragRef.current.startX;
      const dy = touch.clientY - dragRef.current.startY;
      
      const newX = Math.max(-100, Math.min(window.innerWidth - 150, dragRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.posY + dy));
      
      dragRef.current.currentX = newX;
      dragRef.current.currentY = newY;

      // Directly update transform for 60fps buttery-smooth feel
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setPosition({ x: dragRef.current.currentX, y: dragRef.current.currentY });
    };

    if (isDragging) {
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging]);

  // Robust expression evaluator with degrees support
  const runEvaluation = (exprToEval: string): string => {
    if (!exprToEval.trim()) return "";
    try {
      // Clean up multiplication/division/special symbols for computer parsing
      let sanitized = exprToEval
        .replace(/,/g, ".")
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/π/g, "Math_PI")
        .replace(/e/g, "Math_E");

      // Replace functions so nested calls are parsed by our helper methods
      sanitized = sanitized
        .replace(/sin\(/g, "dSin(")
        .replace(/cos\(/g, "dCos(")
        .replace(/tan\(/g, "dTan(")
        .replace(/sqrt\(/g, "Math.sqrt(")
        .replace(/√\(/g, "Math.sqrt(")
        .replace(/log\(/g, "Math.log10(")
        .replace(/ln\(/g, "Math.log(")
        .replace(/\^/g, "**");

      // Define helper trig functions that check DEG vs RAD
      const dSin = (x: number) => isDegreeMode ? Math.sin(x * Math.PI / 180) : Math.sin(x);
      const dCos = (x: number) => isDegreeMode ? Math.cos(x * Math.PI / 180) : Math.cos(x);
      const dTan = (x: number) => isDegreeMode ? Math.tan(x * Math.PI / 180) : Math.tan(x);
      const Math_PI = Math.PI;
      const Math_E = Math.E;

      // Safe JS evaluation wrapper via Function constructor
      const evalFn = new Function(
        "dSin", "dCos", "dTan", "Math_PI", "Math_E",
        `return (${sanitized})`
      );

      const result = evalFn(dSin, dCos, dTan, Math_PI, Math_E);
      
      if (typeof result === "number" && !isNaN(result)) {
        // Limit to 6 decimal places to keep it tidy for machining
        return parseFloat(result.toFixed(6)).toString();
      }
      return "";
    } catch (err) {
      return "";
    }
  };

  // Run live evaluation when expression changes
  useEffect(() => {
    const res = runEvaluation(expression);
    setLiveResult(res);
  }, [expression, isDegreeMode]);

  // Handle button clicks
  const handleKeyClick = (value: string) => {
    if (value === "C") {
      setExpression("");
      setLiveResult("");
    } else if (value === "⌫") {
      setExpression(prev => prev.slice(0, -1));
    } else if (value === "=") {
      const finalRes = runEvaluation(expression);
      if (finalRes !== "") {
        // Add to history
        const newHistory = [{ expr: expression, result: finalRes }, ...history.slice(0, 19)];
        saveHistory(newHistory);
        setExpression(finalRes);
      }
    } else if (value === "sin" || value === "cos" || value === "tan" || value === "sqrt" || value === "log" || value === "ln") {
      setExpression(prev => prev + value + "(");
      inputRef.current?.focus();
    } else {
      setExpression(prev => prev + value);
      inputRef.current?.focus();
    }
  };

  // Safe insertion into G-code editor
  const handleInsertCode = () => {
    if (liveResult !== "" && onInsertValue) {
      onInsertValue(liveResult);
    } else if (expression !== "" && onInsertValue) {
      onInsertValue(expression);
    }
  };

  const clearHistory = () => {
    saveHistory([]);
  };

  return (
    <div
      ref={containerRef}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        position: "absolute",
        zIndex: 9999,
      }}
      className={`w-72 select-none bg-[#101015]/95 border border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col font-sans ${
        isMinimized ? "h-11" : "h-[432px]"
      }`}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="h-11 shrink-0 bg-[#16161f] border-b border-zinc-800/80 px-3.5 flex items-center justify-between cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          {/* Draggable Icon indicator */}
          <div className="flex flex-col gap-0.5 opacity-50">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 bg-zinc-400 rounded-full" />
              <span className="w-1 h-1 bg-zinc-400 rounded-full" />
            </div>
            <div className="flex gap-0.5">
              <span className="w-1 h-1 bg-zinc-400 rounded-full" />
              <span className="w-1 h-1 bg-zinc-400 rounded-full" />
            </div>
          </div>
          <span className="text-[10px] font-black tracking-wider text-[#00f3ff] uppercase">
            Calculadora Científica
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Expandir" : "Minimizar"}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition"
          >
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 hover:bg-red-950/40 rounded text-zinc-400 hover:text-red-400 transition"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* Toggle buttons row: History, DEG/RAD, Help */}
          <div className="bg-[#111116] border-b border-zinc-850 px-3 py-1 flex items-center justify-between shrink-0 text-[10px]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  setShowHelp(false);
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition ${
                  showHistory ? "bg-[#00f3ff]/15 text-[#00f3ff]" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                Histórico
              </button>
              <button
                onClick={() => {
                  setShowHelp(!showHelp);
                  setShowHistory(false);
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition ${
                  showHelp ? "bg-[#00f3ff]/15 text-[#00f3ff]" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <HelpCircle className="w-2.5 h-2.5" />
                Ajuda
              </button>
            </div>

            {/* DEG / RAD Toggle */}
            <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
              <button
                onClick={() => setIsDegreeMode(true)}
                className={`px-1 py-0.5 rounded font-black text-[8px] transition ${
                  isDegreeMode ? "bg-[#00f3ff] text-zinc-950" : "text-zinc-400"
                }`}
              >
                DEG
              </button>
              <button
                onClick={() => setIsDegreeMode(false)}
                className={`px-1 py-0.5 rounded font-black text-[8px] transition ${
                  !isDegreeMode ? "bg-[#00f3ff] text-zinc-950" : "text-zinc-400"
                }`}
              >
                RAD
              </button>
            </div>
          </div>

          {/* Calculator Screen / Display Section */}
          <div className="p-3.5 bg-[#0c0c10] border-b border-zinc-900 shrink-0 flex flex-col gap-2 relative min-h-[94px] justify-end">
            {/* Input expression display */}
            <input
              ref={inputRef}
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="Digite a equação..."
              className="w-full bg-transparent border-none text-right font-mono text-lg md:text-xl text-zinc-100 placeholder-zinc-700 outline-none focus:ring-0 px-1 py-0.5"
            />
            
            {/* Output live evaluation display */}
            <div className="flex items-center justify-between text-right font-mono text-sm text-zinc-400 px-1 min-h-[22px]">
              {onInsertValue && liveResult !== "" ? (
                <button
                  onClick={handleInsertCode}
                  className="text-[10px] font-black text-[#00f3ff] bg-[#00f3ff]/15 border border-[#00f3ff]/30 px-2 py-1 rounded-md hover:bg-[#00f3ff] hover:text-zinc-950 transition flex items-center gap-1 shadow-[0_0_8px_rgba(0,243,255,0.15)]"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  Inserir no Torno
                </button>
              ) : (
                <span />
              )}
              <span className={liveResult ? "text-[#00f3ff] font-bold text-base" : "text-zinc-650 text-xs"}>
                {liveResult ? `= ${liveResult}` : expression ? "equação incompleta" : "0"}
              </span>
            </div>
          </div>

          {/* Helper overlays */}
          {showHistory && (
            <div className="absolute inset-x-0 bottom-0 top-[96px] bg-[#101015] z-30 flex flex-col border-t border-zinc-800">
              <div className="p-1.5 border-b border-zinc-800 flex justify-between items-center text-[9px] text-zinc-400">
                <span className="font-bold">Histórico de Cálculos</span>
                <button
                  onClick={clearHistory}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  Limpar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1 font-mono text-[11px]">
                {history.length === 0 ? (
                  <div className="text-zinc-600 text-center py-8 italic text-[10px]">Nenhum cálculo recente</div>
                ) : (
                  history.map((h, i) => (
                    <div
                      key={i}
                      className="p-1 rounded bg-[#16161f] border border-zinc-850 hover:border-zinc-700 transition cursor-pointer group flex flex-col text-right"
                      onClick={() => setExpression(h.expr)}
                    >
                      <div className="text-zinc-400 group-hover:text-zinc-200 text-right text-[10px] truncate">
                        {h.expr}
                      </div>
                      <div className="text-[#00f3ff] font-bold text-[11px]">
                        = {h.result}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {showHelp && (
            <div className="absolute inset-x-0 bottom-0 top-[96px] bg-[#101015] z-30 flex flex-col border-t border-zinc-800 overflow-y-auto p-2.5 text-[11px] text-zinc-300 space-y-1.5">
              <h5 className="font-bold text-[#00f3ff] text-[10px]">Funções Científicas:</h5>
              <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">sin(x)</span> - Seno
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">cos(x)</span> - Cosseno
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">tan(x)</span> - Tangente
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">sqrt(x)</span> - Raiz Quad.
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">log(x)</span> - Log 10
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">ln(x)</span> - Log nat.
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">^</span> - Pot. (ex: 2^3)
                </div>
                <div className="bg-[#16161f] p-1 rounded">
                  <span className="text-[#00f3ff]">π</span> - Pi (3.141)
                </div>
              </div>
              <p className="text-[9px] text-zinc-500 italic mt-1 leading-tight">
                * Digite usando seu teclado físico! Use parênteses para agrupar as equações.
              </p>
            </div>
          )}

          {/* Keypad Grid */}
          <div className="flex-1 p-2 grid grid-cols-5 gap-1 bg-[#0f0f13]">
            {/* Scientific functions row 1 */}
            <button onClick={() => handleKeyClick("sin")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              sin
            </button>
            <button onClick={() => handleKeyClick("cos")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              cos
            </button>
            <button onClick={() => handleKeyClick("tan")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              tan
            </button>
            <button onClick={() => handleKeyClick("(")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              (
            </button>
            <button onClick={() => handleKeyClick(")")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              )
            </button>

            {/* Scientific functions row 2 */}
            <button onClick={() => handleKeyClick("sqrt")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              √
            </button>
            <button onClick={() => handleKeyClick("^")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              ^
            </button>
            <button onClick={() => handleKeyClick("π")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              π
            </button>
            <button onClick={() => handleKeyClick("log")} className="bg-[#1a1a24] text-zinc-350 text-[9px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              log
            </button>
            <button onClick={() => handleKeyClick("ln")} className="bg-[#1a1a24] text-zinc-350 text-[10px] font-bold py-1 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-[#222230] transition font-mono">
              ln
            </button>

            {/* Main keypad numbers & standard operators */}
            {/* Row 3 */}
            <button onClick={() => handleKeyClick("7")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              7
            </button>
            <button onClick={() => handleKeyClick("8")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              8
            </button>
            <button onClick={() => handleKeyClick("9")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              9
            </button>
            <button onClick={() => handleKeyClick("⌫")} className="bg-orange-950/40 text-orange-450 text-[10px] font-bold py-1 rounded-md border border-orange-900/30 hover:bg-orange-900/20 transition">
              ⌫
            </button>
            <button onClick={() => handleKeyClick("C")} className="bg-red-950/40 text-red-450 text-[10px] font-bold py-1 rounded-md border border-red-900/30 hover:bg-red-900/20 transition">
              C
            </button>

            {/* Row 4 */}
            <button onClick={() => handleKeyClick("4")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              4
            </button>
            <button onClick={() => handleKeyClick("5")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              5
            </button>
            <button onClick={() => handleKeyClick("6")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              6
            </button>
            <button onClick={() => handleKeyClick("*")} className="bg-zinc-900 text-zinc-300 text-xs font-semibold py-1 rounded-md hover:bg-zinc-800 transition">
              ×
            </button>
            <button onClick={() => handleKeyClick("/")} className="bg-zinc-900 text-zinc-300 text-xs font-semibold py-1 rounded-md hover:bg-zinc-800 transition">
              ÷
            </button>

            {/* Row 5 */}
            <button onClick={() => handleKeyClick("1")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              1
            </button>
            <button onClick={() => handleKeyClick("2")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              2
            </button>
            <button onClick={() => handleKeyClick("3")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              3
            </button>
            <button onClick={() => handleKeyClick("+")} className="bg-zinc-900 text-zinc-300 text-xs font-semibold py-1 rounded-md hover:bg-zinc-800 transition">
              +
            </button>
            <button onClick={() => handleKeyClick("-")} className="bg-zinc-900 text-zinc-300 text-xs font-semibold py-1 rounded-md hover:bg-zinc-800 transition">
              -
            </button>

            {/* Row 6 */}
            <button onClick={() => handleKeyClick("0")} className="col-span-2 bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              0
            </button>
            <button onClick={() => handleKeyClick(".")} className="bg-zinc-800 text-zinc-100 text-xs font-semibold py-1 rounded-md hover:bg-zinc-700 transition">
              .
            </button>
            <button onClick={() => handleKeyClick("=")} className="col-span-2 bg-[#00f3ff] text-zinc-950 text-xs font-black py-1 rounded-md hover:bg-[#00e0eb] transition shadow-[0_0_8px_rgba(0,243,255,0.25)]">
              =
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
