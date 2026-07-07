import React, { useRef, useEffect } from "react";
import { Search, Copy, CheckCircle2, Trash2 } from "lucide-react";

interface CNCEditorProps {
  paneIndex: number;
  text: string;
  onChange: (val: string) => void;
  activeLine: number;
  onLineSelect: (lineIndex: number) => void;
  isActive: boolean;
  onSetFocus: () => void;
  isHighContrast: boolean;
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
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [useHighlight, setUseHighlight] = React.useState(true);

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

  // Find a term inside the G-code and highlight it
  const handleSearch = () => {
    const term = prompt(`🔎 Buscar texto no Editor ${paneIndex + 1}:`);
    if (!term || !textareaRef.current) return;

    const codeUpper = text.toUpperCase();
    const termUpper = term.toUpperCase();
    const index = codeUpper.indexOf(termUpper);

    if (index !== -1) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(index, index + term.length);
      
      const lineIndex = text.substring(0, index).split(/\r?\n/).length - 1;
      onLineSelect(lineIndex);

      // Scroll to view
      const lineHeight = 24;
      textareaRef.current.scrollTop = lineIndex * lineHeight - textareaRef.current.clientHeight / 2;
    } else {
      alert("⚠️ Texto não localizado no editor!");
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
              className={isHighContrast ? "text-red-700" : "text-red-400"}
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
                ? isHighContrast ? "text-red-900" : "text-red-200"
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
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-cyan-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className={`text-xs tracking-wider uppercase ${isHighContrast ? 'text-black font-bold' : isActive ? "text-cyan-400" : "text-zinc-400"}`}>
            Editor {paneIndex + 1} {isActive && "(Ativo)"}
          </span>
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

      {/* Editor Canvas */}
      <div className={`flex-1 flex overflow-hidden relative text-base ${isHighContrast ? 'bg-white' : 'bg-[#0d0d11]'}`}>
        {/* Line Numbers column */}
        <div
          ref={lineNumbersRef}
          className={`w-12 text-right pr-2 font-mono select-none overflow-hidden py-4 border-r leading-6 text-sm ${isHighContrast ? 'bg-zinc-100 text-black border-black' : 'bg-[#08080c] text-zinc-600 border-zinc-900/60'}`}
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={`h-6 flex items-center justify-end px-1 ${
                i === Math.floor(activeLine) && isActive 
                  ? "bg-cyan-950/40 text-cyan-400 border-r-2 border-cyan-400" 
                  : ""
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea & Highlighter Grid */}
        <div className="flex-1 relative h-full overflow-hidden grid">
          {/* Active Line Highlight Layer */}
          <div
            ref={highlightRef}
            className={`grid-area-[1/1/2/2] pointer-events-none absolute inset-0 font-mono text-sm leading-6 p-4 overflow-hidden whitespace-pre select-none z-10 text-left align-top m-0 border-0 ${
              !useHighlight ? "hidden" : ""
            } ${
              isHighContrast ? "text-zinc-900" : "text-zinc-300"
            }`}
            style={{ tabSize: 4 }}
            aria-hidden="true"
          >
            {lines.map((line, i) => {
              const hasTool = /T\d+/i.test(line) && !line.trim().startsWith("(");
              const isActiveLine = i === Math.floor(activeLine) && isActive;
              return (
                <div
                  key={i}
                  className={`min-w-max h-[24px] ${
                    isActiveLine 
                      ? isHighContrast ? "bg-yellow-100" : "bg-cyan-950/45"
                      : hasTool 
                        ? isHighContrast ? "bg-red-50" : "bg-red-950/20"
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
            ref={textareaRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onClick={handleLineClick}
            onKeyUp={handleKeyUp}
            wrap="off"
            spellCheck="false"
            placeholder="Digite ou carregue seu código G-Code aqui..."
            className={`grid-area-[1/1/2/2] absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-4 font-mono text-sm leading-6 ${
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
