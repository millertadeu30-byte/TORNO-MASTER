import React, { useState, useEffect, useRef } from "react";
import { X, Move } from "lucide-react";

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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Stagger window initial positions based on id to prevent complete overlap
  useEffect(() => {
    let offset = 0;
    if (id === "assistant") offset = 0;
    else if (id === "admin") offset = 30;
    else if (id === "rpm") offset = 60;
    else if (id === "feed") offset = 90;
    else if (id === "thread") offset = 120;
    else if (id === "drilling") offset = 150;
    else if (id === "polygon") offset = 180;

    // Center on screen as base
    if (typeof window !== "undefined") {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const parsedWidth = parseInt(defaultWidth) || 500;
      const parsedHeight = parseInt(defaultHeight) || 450;
      
      const centerX = Math.max(20, (w - parsedWidth) / 2 + offset);
      const centerY = Math.max(60, (h - parsedHeight) / 2 + offset - 40);
      setPosition({ x: centerX, y: centerY });
    }
  }, [id, defaultWidth, defaultHeight]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Only drag from the header or element inside the header with drag handle class
    if (target.closest(".drag-handle") && !target.closest("button")) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      target.setPointerCapture(e.pointerId);
      onFocus(id);
      e.preventDefault();
    } else {
      // Just focus on click
      onFocus(id);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
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
      onPointerDown={() => onFocus(id)}
      className={`fixed rounded-xl border flex flex-col overflow-hidden shadow-2xl transition-all duration-150 ${
        isActive
          ? "border-cyan-400 shadow-cyan-950/40 z-[999]"
          : "border-zinc-800 shadow-black/80 z-[80] opacity-95"
      }`}
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: defaultWidth,
        height: defaultHeight,
        resize: "both",
        minWidth: minWidth,
        minHeight: minHeight,
        maxWidth: "98vw",
        maxHeight: "92vh",
        backgroundColor: "#17171e",
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
            ✥ ARRASTE PARA MOVER | 🎚 CANTO PARA REDIMENSIONAR
          </span>
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
