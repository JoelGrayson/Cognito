/**
 * Stylus input repairs for the tldraw canvas, written for Android tablets (the
 * Samsung S Pen in particular) but harmless everywhere else.
 *
 * Two things go wrong out of the box:
 *
 * 1. ANDROID CANCELS THE PEN. When a palm lands, or the system decides the gesture
 *    belongs to it, the browser sends `pointercancel` (or silently drops the capture)
 *    instead of `pointerup`. tldraw 5.4.2 listens for neither, so the editor is left
 *    mid-stroke: `isPointing` stays true, the draw state never completes, and the pen
 *    does nothing until the page is reloaded. We end the stroke ourselves, which keeps
 *    what was already written.
 *
 * 2. PEN MODE LOCKS OUT THE FINGER. The first stylus stroke on a touch device turns
 *    tldraw's pen mode on, and from then on it drops every touch event - deliberately,
 *    so a resting palm cannot draw. But it takes one-finger panning with it, so on a
 *    worksheet that is taller than the screen there is no way to move down the page:
 *    the pen draws, and the finger does nothing at all. We pan the camera ourselves
 *    for a single finger, and leave deliberate two-finger gestures to tldraw.
 *    Contacts that overlap a pen stroke are palms until they lift, including a
 *    palm that landed first. They must never pan or start a native touch pinch.
 */
"use client";

import { useEffect } from "react";
import type { Editor } from "tldraw";

/** tldraw's event info carries the modifier keys; a cancelled stylus has none held. */
const NO_MODIFIERS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, accelKey: false } as const;

export function usePenInput(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return;
    const container = editor.getContainer();
    /** Touch pointers currently on the glass, so one finger can be told from two. */
    const touching = new Set<number>();
    const palms = new Set<number>();
    // tldraw queues pointer events until its next frame. Track contact immediately
    // instead of relying on isPointing, which can lag behind both down and up.
    let strokePointer: { id: number; isPen: boolean; button: number } | null = null;
    let suppressTouchGesture = false;
    /** Where the panning finger was last seen, in screen pixels. */
    let panFrom: { id: number; x: number; y: number } | null = null;

    const endPinch = (e: PointerEvent) => {
      if (editor.inputs.getIsPinching()) {
        editor.dispatch({
          type: "pinch",
          name: "pinch_end",
          point: { x: e.clientX, y: e.clientY, z: editor.getZoomLevel() },
          delta: { x: 0, y: 0, z: 0 },
          ...NO_MODIFIERS,
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const onCanvas = e.target instanceof Element && e.target.closest(".tl-canvas") !== null;
      if (!onCanvas) return;
      if (e.pointerType === "pen") {
        panFrom = null;
        touching.forEach((id) => palms.add(id));
        // A palm may have started a pinch before the pen arrived. End it before
        // tldraw receives pen-down, otherwise tldraw ignores the pen altogether.
        endPinch(e);
        strokePointer = { id: e.pointerId, isPen: true, button: e.button ?? 0 };
        return;
      }
      if (!strokePointer && !editor.getInstanceState().isPenMode) {
        strokePointer = { id: e.pointerId, isPen: false, button: e.button ?? 0 };
      }
      if (e.pointerType !== "touch") return;
      touching.add(e.pointerId);
      if (strokePointer?.isPen || palms.size > 0) {
        palms.add(e.pointerId);
        panFrom = null;
        return;
      }
      // Only a finger on the page itself, and only in pen mode: with no pen in play
      // tldraw handles the finger itself. Never while the pen is writing - that finger
      // is the palm, and panning under it would drag the half-written line away.
      const alone = touching.size === 1 && editor.getInstanceState().isPenMode && !editor.inputs.getIsPointing();
      panFrom = alone ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panFrom || e.pointerId !== panFrom.id) return;
      // A pen that comes down after the palm takes the gesture back.
      if (strokePointer?.isPen || palms.size > 0 || touching.size > 1 || editor.inputs.getIsPinching() || editor.inputs.getIsPointing()) {
        panFrom = null;
        return;
      }
      const { x, y, z } = editor.getCamera();
      editor.setCamera({ x: x + (e.clientX - panFrom.x) / z, y: y + (e.clientY - panFrom.y) / z, z }, { immediate: true });
      panFrom = { id: panFrom.id, x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      touching.delete(e.pointerId);
      palms.delete(e.pointerId);
      if (panFrom?.id === e.pointerId) panFrom = null;
      if (strokePointer?.id === e.pointerId) strokePointer = null;
    };

    /** Only the pointer that owns the stroke may finish it. A palm cancellation
     *  must not inject a touch pointer-up into a pen stroke or end its pinch. */
    const onPointerCancel = (e: PointerEvent) => {
      const stroke = strokePointer?.id === e.pointerId ? strokePointer : null;
      const wasGestureTouch = touching.has(e.pointerId) && !palms.has(e.pointerId);
      onPointerUp(e);
      if (stroke || wasGestureTouch) endPinch(e);
      if (!stroke) return;
      editor.dispatch({
        type: "pointer",
        target: "canvas",
        name: "pointer_up",
        point: { x: e.clientX, y: e.clientY, z: e.pressure },
        pointerId: stroke.id,
        button: stroke.button,
        isPen: stroke.isPen,
        ...NO_MODIFIERS,
      });
    };

    // Pen mode filters pointer events, but tldraw's native TouchEvent pinch handler
    // still sees pen/palm combinations. Stop those before they reach the canvas.
    const onTouch = (e: TouchEvent) => {
      const hasStylus = Array.from(e.touches).some((touch) =>
        (touch as Touch & { touchType?: string }).touchType === "stylus",
      );
      suppressTouchGesture ||= Boolean(strokePointer?.isPen || palms.size > 0 || hasStylus);
      if (suppressTouchGesture) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.touches.length === 0) suppressTouchGesture = false;
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp, true);
    container.addEventListener("pointercancel", onPointerCancel, true);
    // Fired when the capture goes away without a pointerup, which is how Chrome on
    // Android hands a stroke over to a system gesture.
    container.addEventListener("lostpointercapture", onPointerCancel, true);
    const touchEvents = ["touchstart", "touchmove", "touchend", "touchcancel"] as const;
    for (const name of touchEvents) container.addEventListener(name, onTouch, { capture: true, passive: false });
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp, true);
      container.removeEventListener("pointercancel", onPointerCancel, true);
      container.removeEventListener("lostpointercapture", onPointerCancel, true);
      for (const name of touchEvents) container.removeEventListener(name, onTouch, true);
    };
  }, [editor]);
}
