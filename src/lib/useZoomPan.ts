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
 * With `fingerPans`, a single finger (not a stylus) also pans.
 */
export function useZoomPan(ref: RefObject<HTMLElement | null>, fingerPans: boolean) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fingerPansRef = useRef(fingerPans);
  fingerPansRef.current = fingerPans;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last: { d: number; cx: number; cy: number } | null = null;
    let drag: { x: number; y: number } | null = null;

    const isFinger = (t: Touch) => !("touchType" in t && (t as Touch & { touchType: string }).touchType === "stylus");

    const zoomAt = (factor: number, cx: number, cy: number, dx = 0, dy = 0) => {
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      // Focal point relative to the page's untransformed layout origin (offsetLeft/Top ignore transforms).
      const page = el.firstElementChild as HTMLElement | null;
      const px = cx - r.left - (page?.offsetLeft ?? 0), py = cy - r.top - (page?.offsetTop ?? 0);
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
        drag = null;
        last = pinch(e.touches);
      } else if (e.touches.length === 1 && fingerPansRef.current && isFinger(e.touches[0])) {
        e.preventDefault();
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && last) {
        e.preventDefault();
        const cur = pinch(e.touches);
        zoomAt(cur.d / last.d, cur.cx, cur.cy, cur.cx - last.cx, cur.cy - last.cy);
        last = cur;
      } else if (e.touches.length === 1 && drag) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
        drag = { x: t.clientX, y: t.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) last = null;
      if (e.touches.length === 0) drag = null;
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
