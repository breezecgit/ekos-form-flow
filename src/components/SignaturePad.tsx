import { useEffect, useRef, useState } from "react";
import { Eraser, Redo2, Undo2 } from "lucide-react";

interface Props {
  value?: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

type Point = { x: number; y: number };
type Stroke = Point[];

const INK = "#07362E";

/**
 * Fluent Forms-style signature pad: full width × 200px, dashed gold border,
 * "Sign Here" under the bottom-left, undo / redo / clear bottom-right.
 * Produces a transparent PNG data URL.
 */
export function SignaturePad({ value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const baseImage = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const ctx2d = () => canvasRef.current?.getContext("2d") ?? null;

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = ctx2d();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (baseImage.current) ctx.drawImage(baseImage.current, 0, 0, rect.width, rect.height);
    for (const s of strokes.current) {
      if (!s.length) continue;
      ctx.beginPath();
      ctx.moveTo(s[0]!.x, s[0]!.y);
      if (s.length === 1) ctx.lineTo(s[0]!.x + 0.1, s[0]!.y + 0.1);
      for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  const emit = () => {
    const canvas = canvasRef.current;
    const empty = !strokes.current.length && !baseImage.current;
    onChange(empty || !canvas ? "" : canvas.toDataURL("image/png"));
    rerender();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    if (value) {
      const img = new Image();
      img.onload = () => {
        baseImage.current = img;
        redraw();
        rerender();
      };
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([pos(e)]);
    redoStack.current = [];
    redraw();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    strokes.current[strokes.current.length - 1]?.push(pos(e));
    redraw();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit();
  };

  const undo = () => {
    const s = strokes.current.pop();
    if (s) redoStack.current.push(s);
    else if (baseImage.current) baseImage.current = null;
    redraw();
    emit();
  };
  const redo = () => {
    const s = redoStack.current.pop();
    if (!s) return;
    strokes.current.push(s);
    redraw();
    emit();
  };
  const clear = () => {
    strokes.current = [];
    redoStack.current = [];
    baseImage.current = null;
    redraw();
    emit();
  };

  const iconBtn = "rounded p-1 text-ekos-field-text hover:text-brand disabled:opacity-40";

  return (
    <div>
      <div className="rounded-[7px] border border-dashed border-gold bg-card">
        <canvas
          ref={canvasRef}
          aria-label="Signature pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block h-[200px] w-full touch-none"
        />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-ekos-field-text">Sign Here</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Undo" title="Undo" className={iconBtn} disabled={disabled} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo"
            className={iconBtn}
            disabled={disabled || !redoStack.current.length}
            onClick={redo}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Clear" title="Clear" className={iconBtn} disabled={disabled} onClick={clear}>
            <Eraser className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
