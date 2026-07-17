import React, { useRef, useEffect } from "react";
import { Search, Copy, CheckCircle2, Trash2, Calculator, Minus, Plus } from "lucide-react";

interface CNCEditorProps {
  paneIndex: number;
  text: string;
  onChange: (val: string) => void;
  activeLine: number;
  onLineSelect: (lineIndex: number) => void;
  isActive: boolean;
  onSetFocus: () => void;
  isHighContrast: boolean;
  fileName?: string;
  onToggleFloatingCalculator?: () => void;
  isFloatingCalculatorOpen?: boolean;
  allEditorTexts?: string[];
  layoutCount?: number;
}

export const CNCEditor: React.FC<CNCEditorProps> = ({
  paneIndex,
  text,
  onChange,
  activeLine,
  onLineSelect,
  isActive,
  onSetFocus,
  isHighContrast,
  fileName,
  onToggleFloatingCalculator,
  isFloatingCalculatorOpen,
  allEditorTexts,
  layoutCount,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [useHighlight, setUseHighlight] = React.useState(true);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = React.useState(false);
  const [findText, setFindText] = React.useState("");
  const [replaceText, setReplaceText] = React.useState("");

  // Handler to align channels on a specific M-code
  const handleAlignSync = (mCode: number, clickedLineIdx: number) => {
    if (!allEditorTexts || !layoutCount) return;

    for (let p = 0; p < layoutCount; p++) {
      const pText = allEditorTexts[p];
      if (!pText) continue;

      const pLines = pText.split(/\r?\n/);
      
      // Find all line indices where this mCode occurs
      const matchingIndices: number[] = [];
      for (let i = 0; i < pLines.length; i++) {
        const cleanLine = pLines[i].split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
        const matches = cleanLine.match(new RegExp(`\\bM\\s*${mCode}\\b`));
        if (matches) {
          matchingIndices.push(i);
        }
      }

      if (matchingIndices.length > 0) {
        // Find the matching index closest to clickedLineIdx
        let closestIdx = matchingIndices[0];
        let minDiff = Math.abs(closestIdx - clickedLineIdx);
        for (const idx of matchingIndices) {
          const diff = Math.abs(idx - clickedLineIdx);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        }

        const textarea = document.getElementById(`gcode-textarea-${p}`) as HTMLTextAreaElement;
        if (textarea) {
          const viewHeight = textarea.clientHeight;
          // Centering the matched line inside the viewport
          const targetScrollTop = closestIdx * lineHeight - (viewHeight / 2) + (lineHeight / 2);
          textarea.scrollTop = Math.max(0, targetScrollTop);
          textarea.dispatchEvent(new Event('scroll'));
        }
      }
    }
  };

  // Find all sync M-codes in each open editor
  const syncCodesByPane = React.useMemo(() => {
    if (!allEditorTexts || !layoutCount || layoutCount <= 1) return [];
    return allEditorTexts.slice(0, layoutCount).map((text) => {
      const codes = new Set<number>();
      if (!text) return codes;
      const linesList = text.split(/\r?\n/);
      for (const line of linesList) {
        const cleanLine = line.split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
        const matches = cleanLine.matchAll(/\bM\s*(\d+)\b/g);
        for (const match of matches) {
          const num = parseInt(match[1], 10);
          if (num >= 200) {
            codes.add(num);
          }
        }
      }
      return codes;
    });
  }, [allEditorTexts, layoutCount]);

  // Helper to check if an M-code is synchronized
  const checkSyncCode = (mNum: number): boolean => {
    if (syncCodesByPane.length <= 1) return true; // default if 1 or 0 open editors
    return syncCodesByPane.every((set) => set.has(mNum));
  };

  const [fontSize, setFontSize] = React.useState<number>(() => {
    const saved = localStorage.getItem("cnc-editor-font-size");
    return saved ? parseInt(saved, 10) : 14;
  });

  const lineHeight = Math.round(fontSize * 1.714);

  // Synchronize scrolling of textarea, highlight layer, and line numbers
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current && lineNumbersRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Set cursor and focus to a specific line
  const handleLineClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    onSetFocus();
    if (!textareaRef.current) return;
    
    const cursorOffset = textareaRef.current.selectionStart;
    const textBeforeCursor = textareaRef.current.value.substring(0, cursorOffset);
    const lineIndex = textBeforeCursor.split(/\r?\n/).length - 1;
    onLineSelect(lineIndex);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key)) {
      if (!textareaRef.current) return;
      const cursorOffset = textareaRef.current.selectionStart;
      const textBeforeCursor = textareaRef.current.value.substring(0, cursorOffset);
      const lineIndex = textBeforeCursor.split(/\r?\n/).length - 1;
      onLineSelect(lineIndex);
    }
  };

  // Find and replace implementation
  const handleSearch = () => {
    setIsFindReplaceOpen(prev => !prev);
  };

  const handleFindNext = (direction: "forward" | "backward" = "forward", inputTerm?: string) => {
    const term = inputTerm !== undefined ? inputTerm : findText;
    if (!term || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const currentText = textarea.value;

    const termUpper = term.toUpperCase();
    const textUpper = currentText.toUpperCase();

    let foundIndex = -1;

    if (direction === "forward") {
      const searchStart = textarea.selectionEnd;
      foundIndex = textUpper.indexOf(termUpper, searchStart);
      if (foundIndex === -1) {
        // Wrap around to start
        foundIndex = textUpper.indexOf(termUpper, 0);
      }
    } else {
      const searchStart = textarea.selectionStart - 1;
      foundIndex = textUpper.lastIndexOf(termUpper, searchStart);
      if (foundIndex === -1) {
        // Wrap around to end
        foundIndex = textUpper.lastIndexOf(termUpper);
      }
    }

    if (foundIndex !== -1) {
      textarea.focus();
      textarea.setSelectionRange(foundIndex, foundIndex + term.length);

      const lineIndex = currentText.substring(0, foundIndex).split(/\r?\n/).length - 1;
      onLineSelect(lineIndex);

      // Scroll to view
      const viewHeight = textarea.clientHeight;
      const targetScrollTop = lineIndex * lineHeight - viewHeight / 2;
      textarea.scrollTop = Math.max(0, targetScrollTop);
      handleScroll();
    } else {
      alert("⚠️ Texto não localizado!");
    }
  };

  const handleReplace = () => {
    if (!findText || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const currentText = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const selectedText = currentText.substring(start, end);
    
    if (selectedText.toUpperCase() === findText.toUpperCase()) {
      const newText = currentText.substring(0, start) + replaceText + currentText.substring(end);
      onChange(newText);
      
      // Set cursor right after the replacement and find next
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start + replaceText.length, start + replaceText.length);
          handleFindNext("forward");
        }
      }, 50);
    } else {
      // Find the first occurrence
      handleFindNext("forward");
    }
  };

  const handleReplaceAll = () => {
    if (!findText) return;

    const regex = new RegExp(findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), "gi");
    const count = (text.match(regex) || []).length;

    if (count > 0) {
      if (window.confirm(`Deseja substituir todas as ${count} ocorrências de "${findText}" por "${replaceText}"?`)) {
        const newText = text.replace(regex, replaceText);
        onChange(newText);
        alert(`✅ ${count} substituições realizadas com sucesso!`);
      }
    } else {
      alert("⚠️ Nenhuma ocorrência encontrada para substituir!");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setIsFindReplaceOpen(true);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split lines
  const lines = text.split(/\r?\n/);

  // Simple G-code Syntax Highlighting Function
  const highlightLineText = (lineText: string, isLineActive: boolean) => {
    if (!lineText.trim()) return lineText;

    // Parse inline comments
    // G-code can have inline comments like: G00 X100 (comment text)
    // Let's find parentheses comments
    const parts: { text: string; isComment: boolean }[] = [];
    let current = "";
    let inComment = false;

    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === "(") {
        if (current) {
          parts.push({ text: current, isComment: inComment });
          current = "";
        }
        inComment = true;
        current += char;
      } else if (char === ")") {
        current += char;
        parts.push({ text: current, isComment: inComment });
        current = "";
        inComment = false;
      } else {
        current += char;
      }
    }
    if (current) {
      parts.push({ text: current, isComment: inComment });
    }

    // Now render each part
    return parts.map((part, pIdx) => {
      if (part.isComment) {
        return (
          <span key={pIdx} className={isHighContrast ? "text-zinc-500 italic font-normal" : "text-zinc-500 italic"}>
            {part.text}
          </span>
        );
      }

      // Check if this line contains a T command (tool call) in its non-comment parts
      const hasToolCall = /T\d+/i.test(part.text);

      // Tokenize the code part
      const tokens = part.text.match(/([A-Za-z]+[-+]?\d*\.?\d*|[\(\)\;\,\.\+\-\*\/]|\s+|[^\sA-Za-z\(\)\;\,\.\+\-\*\/]+)/g) || [part.text];

      return tokens.map((token, tIdx) => {
        const cleanToken = token.trim().toUpperCase();
        if (!cleanToken) return token; // spaces

        const charCode = cleanToken[0];

        // Highlight T commands (Tool change)
        if (charCode === "T") {
          return (
            <span
              key={tIdx}
              className={isHighContrast ? "text-yellow-600 font-bold" : "text-yellow-400 font-bold"}
            >
              {token}
            </span>
          );
        }

        // Highlight F and S parameters
        if (charCode === "F" || charCode === "S") {
          return (
            <span
              key={tIdx}
              className={isHighContrast ? "text-purple-700" : "text-purple-400"}
            >
              {token}
            </span>
          );
        }

        // Standard G-code highlighting
        if (charCode === "G") {
          return (
            <span key={tIdx} className={isHighContrast ? "text-blue-700" : "text-cyan-400"}>
              {token}
            </span>
          );
        }
        if (charCode === "M") {
          return (
            <span key={tIdx} className={isHighContrast ? "text-yellow-700" : "text-yellow-400"}>
              {token}
            </span>
          );
        }
        if (charCode === "N") {
          return (
            <span key={tIdx} className="text-zinc-500">
              {token}
            </span>
          );
        }
        if (["X", "U", "I"].includes(charCode)) {
          return (
            <span key={tIdx} className={isHighContrast ? "text-emerald-700" : "text-emerald-400"}>
              {token}
            </span>
          );
        }
        if (["Z", "W", "K"].includes(charCode)) {
          return (
            <span key={tIdx} className={isHighContrast ? "text-orange-700" : "text-orange-400"}>
              {token}
            </span>
          );
        }

        // Default code text
        return (
          <span 
            key={tIdx} 
            className={`${
              hasToolCall 
                ? isHighContrast ? "text-yellow-800" : "text-yellow-100"
                : isHighContrast ? "text-zinc-800" : "text-zinc-350"
            }`}
          >
            {token}
          </span>
        );
      });
    });
  };

  // Sync scroll on mount/text change
  useEffect(() => {
    handleScroll();
  }, [text]);

  // Scroll to active line when it changes
  useEffect(() => {
    if (activeLine >= 0 && textareaRef.current) {
      const textarea = textareaRef.current;
      
      const currentScrollTop = textarea.scrollTop;
      const viewHeight = textarea.clientHeight;
      const lineY = Math.floor(activeLine) * lineHeight;
      
      // If line is near or outside the visible viewport range, scroll it to the middle
      if (lineY < currentScrollTop + (lineHeight * 2) || lineY > currentScrollTop + viewHeight - (lineHeight * 2)) {
        const targetScrollTop = Math.floor(activeLine) * lineHeight - viewHeight / 2;
        textarea.scrollTop = Math.max(0, targetScrollTop);
        // Sync custom highlight layover scroll position
        handleScroll();
      }
    }
  }, [activeLine, isActive, lineHeight]);

  return (
    <div
      onClick={onSetFocus}
      className={`flex flex-col flex-1 h-full min-w-[280px] border rounded-xl overflow-hidden transition-all duration-300 ${
        isHighContrast ? 'bg-white text-black border-black' : 'bg-[#1e1e24] text-zinc-100 border-zinc-800'
      } ${
        isActive 
          ? "border-cyan-400/50 shadow-lg shadow-cyan-950/20" 
          : "hover:border-zinc-700"
      }`}
    >
      {/* Editor Header */}
      <div className={`flex justify-between items-center px-4 py-2 border-b ${isHighContrast ? 'bg-zinc-200 border-black' : 'bg-[#25252f] border-zinc-800'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-cyan-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className={`text-xs tracking-wider uppercase ${isHighContrast ? 'text-black font-bold' : isActive ? "text-cyan-400" : "text-zinc-400"}`}>
            Editor {paneIndex + 1} {fileName ? `(${fileName})` : ""} {isActive && "(Ativo)"}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFindReplaceOpen(!isFindReplaceOpen);
            }}
            className={`ml-2 text-[10px] px-2 py-0.5 rounded transition duration-200 flex items-center gap-1 border border-dashed ${
              isFindReplaceOpen
                ? isHighContrast
                  ? "bg-cyan-100 text-cyan-800 border-cyan-400 font-bold"
                  : "bg-cyan-950/50 text-cyan-400 border-cyan-500/30 font-bold"
                : isHighContrast
                  ? "bg-zinc-100 text-zinc-800 border-zinc-350 hover:text-cyan-600 hover:border-cyan-400/50 font-medium"
                  : "bg-zinc-900/40 text-zinc-400 border-zinc-800/80 hover:text-cyan-400 hover:border-cyan-500/30"
            }`}
            title="Abrir ferramenta de Localizar e Substituir"
          >
            <Search className="w-2.5 h-2.5" />
            <span>Localizar / Substituir</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Notepad / Syntax Highlight Toggle */}
          <button
            onClick={() => setUseHighlight(!useHighlight)}
            className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-all duration-200 flex items-center gap-1 ${
              useHighlight
                ? isHighContrast
                  ? "bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200 font-bold"
                  : "bg-cyan-950/50 text-cyan-400 border-cyan-500/30 hover:bg-cyan-900/40"
                : isHighContrast
                  ? "bg-zinc-100 text-zinc-850 border-zinc-350 hover:bg-zinc-200 font-bold"
                  : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:bg-zinc-850/60"
            }`}
            title="Alternar entre visualização colorida e modo bloco de notas simples"
          >
            {useHighlight ? "🎨 Colorido" : "✍️ Bloco de Notas"}
          </button>

          {/* Scientific Calculator Toggle Button */}
          {onToggleFloatingCalculator && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFloatingCalculator();
              }}
              className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-all duration-200 flex items-center gap-1.5 ${
                isFloatingCalculatorOpen
                  ? isHighContrast
                    ? "bg-cyan-100 text-cyan-800 border-cyan-400 hover:bg-cyan-200 font-bold"
                    : "bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50 shadow-[0_0_8px_rgba(0,243,255,0.25)] font-bold animate-pulse"
                  : isHighContrast
                    ? "bg-zinc-100 text-zinc-850 border-zinc-350 hover:bg-zinc-250 font-bold"
                    : "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:bg-zinc-800 hover:text-white"
              }`}
              title="Abrir/Fechar Calculadora Científica Flutuante"
            >
              <Calculator className="w-3.5 h-3.5 text-[#00f3ff]" />
              <span>🧮 Calculadora</span>
            </button>
          )}

          {/* Font Size Adjuster Control */}
          <div className={`flex items-center border rounded px-2 py-1 gap-1.5 select-none ${isHighContrast ? 'bg-zinc-100 border-zinc-400 text-black' : 'bg-[#15151b] border-zinc-850 text-zinc-400'}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFontSize(prev => {
                  const val = Math.max(10, prev - 1);
                  localStorage.setItem("cnc-editor-font-size", val.toString());
                  return val;
                });
              }}
              title="Diminuir tamanho da fonte"
              className={`p-0.5 rounded hover:bg-zinc-800 transition ${isHighContrast ? 'hover:bg-zinc-300 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="text-[10px] font-mono font-bold leading-none min-w-[22px] text-center">
              {fontSize}px
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFontSize(prev => {
                  const val = Math.min(26, prev + 1);
                  localStorage.setItem("cnc-editor-font-size", val.toString());
                  return val;
                });
              }}
              title="Aumentar tamanho da fonte"
              className={`p-0.5 rounded hover:bg-zinc-800 transition ${isHighContrast ? 'hover:bg-zinc-300 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          <button
            onClick={handleCopy}
            title="Copiar Código"
            className={`p-1 rounded hover:bg-zinc-800 transition ${isHighContrast ? 'text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleSearch}
            title="Buscar texto neste Editor"
            className={`p-1 rounded hover:bg-zinc-800 transition ${isHighContrast ? 'text-black' : 'text-zinc-400 hover:text-cyan-400'}`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              onChange("");
              if (textareaRef.current) {
                textareaRef.current.focus();
              }
            }}
            title="Apagar todo o código"
            className={`p-1 rounded hover:bg-zinc-800 transition ${isHighContrast ? 'text-black' : 'text-zinc-400 hover:text-red-400'}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Find & Replace Panel */}
      {isFindReplaceOpen && (
        <div className={`border-b px-4 py-2 flex flex-wrap items-center gap-3 text-xs transition-all duration-300 ${
          isHighContrast ? "bg-zinc-100 border-zinc-300 text-black" : "bg-[#16161f] border-zinc-800 text-zinc-100"
        }`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-400 font-medium font-mono text-[10px] uppercase">Localizar:</span>
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleFindNext("forward");
                }
              }}
              placeholder="Texto a buscar..."
              className={`rounded px-2 py-1 text-xs outline-none font-mono min-w-[140px] ${
                isHighContrast
                  ? "bg-white border border-zinc-300 text-black focus:border-cyan-500"
                  : "bg-[#0d0d11] border border-zinc-800 text-zinc-100 focus:border-cyan-400"
              }`}
            />
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-400 font-medium font-mono text-[10px] uppercase">Substituir:</span>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleReplace();
                }
              }}
              placeholder="Substituir por..."
              className={`rounded px-2 py-1 text-xs outline-none font-mono min-w-[140px] ${
                isHighContrast
                  ? "bg-white border border-zinc-300 text-black focus:border-cyan-500"
                  : "bg-[#0d0d11] border border-zinc-800 text-zinc-100 focus:border-cyan-400"
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => handleFindNext("forward")}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition duration-200 ${
                isHighContrast
                  ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
              title="Buscar próximo resultado"
            >
              Localizar
            </button>
            <button
              onClick={handleReplace}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition duration-200 ${
                isHighContrast
                  ? "bg-zinc-200 hover:bg-zinc-300 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
              title="Substituir o item atual e buscar próximo"
            >
              Substituir
            </button>
            <button
              onClick={handleReplaceAll}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition duration-200 ${
                isHighContrast
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
              title="Substituir todas as ocorrências de uma só vez"
            >
              Subst. Tudo
            </button>
            <button
              onClick={() => setIsFindReplaceOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs ml-1 font-mono transition"
              title="Fechar painel"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Editor Canvas */}
      <div className={`flex-1 flex overflow-hidden relative text-base ${isHighContrast ? 'bg-white' : 'bg-[#0d0d11]'}`}>
        {/* Line Numbers column */}
        <div
          ref={lineNumbersRef}
          style={{ fontSize: `${fontSize - 1}px`, lineHeight: `${lineHeight}px` }}
          className={`w-12 text-right pr-2 font-mono select-none overflow-hidden py-4 border-r ${isHighContrast ? 'bg-zinc-100 text-black border-black' : 'bg-[#08080c] text-zinc-600 border-zinc-900/60'}`}
        >
          {lines.map((line, i) => {
            const isActiveLine = i === Math.floor(activeLine) && isActive;
            let lineNumClass = "";
            const cleanLine = line.split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
            const mMatch = cleanLine.match(/\bM\s*(\d+)\b/);
            if (mMatch && !isActiveLine && layoutCount && layoutCount > 1) {
              const mNum = parseInt(mMatch[1], 10);
              if (mNum >= 200) {
                const isSync = checkSyncCode(mNum);
                if (isSync) {
                  lineNumClass = isHighContrast ? "bg-emerald-100 text-emerald-900 border-r-2 border-emerald-600 font-bold" : "bg-emerald-400/30 text-emerald-300 border-r-2 border-emerald-400 font-bold";
                } else {
                  lineNumClass = isHighContrast ? "bg-red-100 text-red-900 border-r-2 border-red-600 font-bold" : "bg-red-400/30 text-red-300 border-r-2 border-red-400 font-bold";
                }
              }
            }
            return (
              <div
                key={i}
                style={{ height: `${lineHeight}px` }}
                className={`flex items-center justify-end px-1 ${
                  isActiveLine 
                    ? "bg-cyan-950/40 text-cyan-400 border-r-2 border-cyan-400" 
                    : lineNumClass
                }`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>

        {/* Textarea & Highlighter Grid */}
        <div className="flex-1 relative h-full overflow-hidden grid">
          {/* Active Line Highlight Layer */}
          <div
            ref={highlightRef}
            className={`grid-area-[1/1/2/2] pointer-events-none absolute inset-0 font-mono p-4 overflow-hidden whitespace-pre select-none z-10 text-left align-top m-0 border-0 ${
              !useHighlight ? "hidden" : ""
            } ${
              isHighContrast ? "text-zinc-900" : "text-zinc-300"
            }`}
            style={{ 
              fontSize: `${fontSize}px`, 
              lineHeight: `${lineHeight}px`, 
              tabSize: 4 
            }}
            aria-hidden="true"
          >
            {lines.map((line, i) => {
              const hasTool = /T\d+/i.test(line) && !line.trim().startsWith("(");
              const isActiveLine = i === Math.floor(activeLine) && isActive;
              
              let syncBgClass = "";
              const cleanLine = line.split(';')[0].replace(/\([^)]*\)/g, '').toUpperCase();
              const mMatch = cleanLine.match(/\bM\s*(\d+)\b/);
              if (mMatch && layoutCount && layoutCount > 1) {
                const mNum = parseInt(mMatch[1], 10);
                if (mNum >= 200) {
                  const isSync = checkSyncCode(mNum);
                  if (isSync) {
                    syncBgClass = isHighContrast 
                      ? "bg-emerald-100 border-l-4 border-emerald-600 pl-1 text-emerald-950 font-medium" 
                      : "bg-emerald-500/25 text-emerald-50 border-l-4 border-emerald-400 pl-1 font-medium";
                  } else {
                    syncBgClass = isHighContrast 
                      ? "bg-red-100 border-l-4 border-red-600 pl-1 text-red-950 font-medium" 
                      : "bg-red-500/25 text-red-50 border-l-4 border-red-400 pl-1 font-medium";
                  }
                }
              }

              return (
                <div
                  key={i}
                  style={{ height: `${lineHeight}px` }}
                  className={`min-w-max ${
                    isActiveLine 
                      ? isHighContrast ? "bg-cyan-100" : "bg-cyan-950/45"
                      : syncBgClass
                        ? syncBgClass
                        : hasTool 
                          ? isHighContrast ? "bg-yellow-50" : "bg-yellow-500/10"
                          : ""
                  }`}
                >
                  {highlightLineText(line, isActiveLine)}
                </div>
              );
            })}
          </div>

          {/* Actual Editable Textarea */}
          <textarea
            id={`gcode-textarea-${paneIndex}`}
            ref={textareaRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onClick={handleLineClick}
            onKeyUp={handleKeyUp}
            onKeyDown={handleKeyDown}
            wrap="off"
            spellCheck="false"
            placeholder="Digite ou carregue seu código G-Code aqui..."
            className={`grid-area-[1/1/2/2] absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-4 font-mono ${
              useHighlight
                ? `text-transparent ${
                    isHighContrast 
                      ? "caret-black selection:bg-blue-200 selection:text-transparent" 
                      : "caret-[#00f3ff] selection:bg-cyan-500/40 selection:text-transparent"
                  }`
                : isHighContrast
                  ? "text-zinc-950 caret-black selection:bg-blue-200"
                  : "text-zinc-100 caret-[#00f3ff] selection:bg-cyan-500/40"
            } overflow-auto z-20 whitespace-pre text-left align-top m-0`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              wordBreak: 'normal',
              overflowWrap: 'normal',
              tabSize: 4,
            }}
          />
        </div>
      </div>
    </div>
  );
};
