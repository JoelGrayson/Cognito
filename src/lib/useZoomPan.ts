import { useEffect, useRef, useState, type RefObject } from "react";

export interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN = 0.5;
const MAX = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Two-finger pinch / pan on touch, ctrl+wheel or trackpad pinch on desktop.
 */
export function useZoomPan(ref: RefObject<HTMLElement | null>) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last: { d: number; cx: number; cy: number } | null = null;

    const zoomAt = (factor: number, cx: number, cy: number, dx = 0, dy = 0) => {
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      const px = cx - r.left, py = cy - r.top;
      const scale = clamp(v.scale * factor, MIN, MAX);
      const k = scale / v.scale;
      setView({ scale, x: px - (px - v.x) * k + dx, y: py - (py - v.y) * k + dy });
    };

    const pinch = (t: TouchList) => {
      const [a, b] = [t[0], t[1]];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        last = pinch(e.touches);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !last) return;
      e.preventDefault();
      const cur = pinch(e.touches);
      zoomAt(cur.d / last.d, cur.cx, cur.cy, cur.cx - last.cx, cur.cy - last.cy);
      last = cur;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) last = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref]);

  const reset = () => setView({ scale: 1, x: 0, y: 0 });
  return { view, reset };
}
