import React, { useState, useEffect, useRef } from "react";
import { X, Move, Maximize2, Minimize2 } from "lucide-react";

interface FloatingWindowProps {
  title: string;
  onClose: () => void;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: string;
  defaultHeight?: string;
  minWidth?: string;
  minHeight?: string;
  children: React.ReactNode;
  id: string;
  activeWindowId: string;
  onFocus: (id: string) => void;
}

export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  title,
  onClose,
  defaultX = 100,
  defaultY = 80,
  defaultWidth = "600px",
  defaultHeight = "500px",
  minWidth = "350px",
  minHeight = "300px",
  children,
  id,
  activeWindowId,
  onFocus,
}) => {
  const [position, setPosition] = useState({ x: defaultX, y: defaultY });
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Position windows starting from top-right and ensure they fit inside the viewport
  useEffect(() => {
    let offset = 0;
    if (id === "assistant") offset = 0;
    else if (id === "admin") offset = 1;
    else if (id === "rpm") offset = 2;
    else if (id === "feed") offset = 3;
    else if (id === "thread") offset = 4;
    else if (id === "drilling") offset = 5;
    else if (id === "polygon") offset = 6;

    if (typeof window !== "undefined") {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const parsedWidth = parseInt(defaultWidth) || 500;
      const parsedHeight = parseInt(defaultHeight) || 450;
      
      // Scale down if screen is smaller than the window, ensuring complete visibility
      const actualWidth = Math.min(w - 40, parsedWidth);
      const actualHeight = Math.min(h - 100, parsedHeight);
      
      const staggerX = offset * 25;
      const staggerY = offset * 25;
      
      // Calculate top-right position
      const x = Math.max(10, w - actualWidth - 20 - staggerX);
      const y = Math.max(50, 50 + staggerY);
      
      setPosition({ x, y });
      setSize({ width: `${actualWidth}px`, height: `${actualHeight}px` });
    }
  }, [id, defaultWidth, defaultHeight]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMaximized) return; // Disable dragging when maximized
    const target = e.target as HTMLElement;
    // Only drag from the header or element inside the header with drag handle class
    if (target.closest(".drag-handle") && !target.closest("button")) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      target.setPointerCapture(e.pointerId);
      if (activeWindowId !== id) {
        onFocus(id);
      }
      e.preventDefault();
    } else {
      // Just focus on click if not already focused
      if (activeWindowId !== id) {
        onFocus(id);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging && !isMaximized) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      
      // Keep inside bounds
      const boundX = Math.max(10, Math.min(window.innerWidth - 100, newX));
      const boundY = Math.max(40, Math.min(window.innerHeight - 100, newY));
      setPosition({ x: boundX, y: boundY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const isActive = activeWindowId === id;

  return (
    <div
      ref={windowRef}
      onPointerDown={() => {
        if (activeWindowId !== id) {
          onFocus(id);
        }
      }}
      className={`fixed rounded-xl border flex flex-col overflow-hidden shadow-2xl transition-all duration-150 ${
        isActive
          ? "border-cyan-400 shadow-cyan-950/40"
          : "border-zinc-800 shadow-black/80 opacity-95"
      }`}
      style={{
        top: isMaximized ? "0px" : `${position.y}px`,
        left: isMaximized ? "0px" : `${position.x}px`,
        width: isMaximized ? "100vw" : size.width,
        height: isMaximized ? "100vh" : size.height,
        resize: isMaximized ? "none" : "both",
        minWidth: isMaximized ? "100vw" : minWidth,
        minHeight: isMaximized ? "100vh" : minHeight,
        maxWidth: "100vw",
        maxHeight: "100vh",
        backgroundColor: "#17171e",
        zIndex: isMaximized ? 99999 : (isActive ? 999 : 80),
      }}
    >
      {/* Window Header / Drag Handle */}
      <div
        className="drag-handle flex items-center justify-between bg-[#1d1d25] border-b border-zinc-800/80 px-4 py-2.5 cursor-move select-none shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2">
          <Move className={`w-3.5 h-3.5 ${isActive ? "text-[#00f3ff]" : "text-zinc-500"}`} />
          <span className={`text-xs font-bold font-sans uppercase tracking-wider ${isActive ? "text-[#00f3ff]" : "text-zinc-400"}`}>
            {title}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600 font-mono hidden md:inline mr-2">
            {isMaximized ? "✥ TELA INTEIRA ATIVADA" : "✥ ARRASTE PARA MOVER | 🎚 CANTO PARA REDIMENSIONAR"}
          </span>
          
          {/* Maximize Toggle Button */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="text-zinc-400 hover:text-[#00f3ff] p-1 hover:bg-zinc-800/60 rounded-md transition"
            title={isMaximized ? "Restaurar Janela" : "Maximizar / Tela Inteira"}
          >
            {isMaximized ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-red-400 p-1 hover:bg-zinc-800/60 rounded-md transition"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Window Content */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#0e0e12]">
        {children}
      </div>
    </div>
  );
};
