import React, { useRef, useState } from "react";

/**
 * ResizableBox - Caixa que pode ser AUMENTADA ou DIMINUÍDA arrastando o cantinho (alça).
 * - Funciona com o dedo (tablet) e com o mouse.
 * - Tudo dentro da caixa cresce junto (letras, números e ícones).
 * - O tamanho escolhido fica salvo neste tablet (por "id"), e volta igual na próxima vez.
 * - Toque duplo / clique duplo na alça volta ao tamanho original (100%).
 *
 * anchor = canto que fica PARADO enquanto a caixa cresce:
 *   "tl" = em cima/esquerda (alça embaixo/direita)
 *   "bl" = embaixo/esquerda (alça em cima/direita)
 *   "tr" = em cima/direita (alça embaixo/esquerda)
 */
type Anchor = "tl" | "bl" | "tr";

interface ResizableBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  anchor?: Anchor;
  children?: React.ReactNode;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

export const ResizableBox: React.FC<ResizableBoxProps> = ({ id, anchor = "tl", className = "", style, children, ...rest }) => {
  const storageKey = "cnc_boxScale_" + id;
  const [scale, setScale] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem(storageKey) || "1");
      return isNaN(v) ? 1 : Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
    } catch {
      return 1;
    }
  });
  const dragRef = useRef<{ x: number; y: number; s: number } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const save = (s: number) => {
    try { localStorage.setItem(storageKey, String(s)); } catch { /* sem armazenamento */ }
  };

  // Alça fica no canto oposto ao canto fixo
  const handleRight = anchor !== "tr";
  const handleBottom = anchor !== "bl";
  const origin = anchor === "tl" ? "top left" : anchor === "bl" ? "bottom left" : "top right";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { x: e.clientX, y: e.clientY, s: scaleRef.current };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const dx = (e.clientX - dragRef.current.x) * (handleRight ? 1 : -1);
    const dy = (e.clientY - dragRef.current.y) * (handleBottom ? 1 : -1);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, dragRef.current.s + (dx + dy) / 300));
    setScale(next);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    save(scaleRef.current);
  };
  const resetSize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    save(1);
  };

  return (
    <div
      {...rest}
      className={className}
      style={{ ...style, transform: `scale(${scale})`, transformOrigin: origin }}
    >
      {children}
      {/* Alça de redimensionar (arraste para aumentar / diminuir) */}
      <div
        data-resize-handle="1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={resetSize}
        title="Arraste para aumentar ou diminuir a caixa (toque duplo = tamanho original)"
        className="absolute w-6 h-6 flex items-center justify-center pointer-events-auto cursor-nwse-resize opacity-70 hover:opacity-100 z-50"
        style={{
          touchAction: "none",
          ...(handleRight ? { right: -2 } : { left: -2 }),
          ...(handleBottom ? { bottom: -2 } : { top: -2 }),
          cursor: handleRight === handleBottom ? "nwse-resize" : "nesw-resize",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: `scaleX(${handleRight ? 1 : -1}) scaleY(${handleBottom ? 1 : -1})` }}>
          <path d="M13 5 L5 13 M13 9 L9 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-cyan-400" />
        </svg>
      </div>
    </div>
  );
};

export default ResizableBox;
