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
 *    for a single finger, and leave two fingers to tldraw's own pinch handling.
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
    /** Where the panning finger was last seen, in screen pixels. */
    let panFrom: { id: number; x: number; y: number } | null = null;

    /** Close out a stroke the browser took away from us. */
    const endStroke = (e: PointerEvent) => {
      if (editor.inputs.getIsPinching()) {
        editor.dispatch({
          type: "pinch",
          name: "pinch_end",
          point: { x: e.clientX, y: e.clientY, z: editor.getZoomLevel() },
          delta: { x: 0, y: 0, z: 0 },
          ...NO_MODIFIERS,
        });
      }
      if (!editor.inputs.getIsPointing()) return;
      editor.dispatch({
        type: "pointer",
        target: "canvas",
        name: "pointer_up",
        point: { x: e.clientX, y: e.clientY, z: e.pressure },
        pointerId: e.pointerId,
        button: 0,
        isPen: e.pointerType === "pen",
        ...NO_MODIFIERS,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touching.add(e.pointerId);
      // Only a finger on the page itself, and only in pen mode: with no pen in play
      // tldraw handles the finger itself. Never while the pen is writing - that finger
      // is the palm, and panning under it would drag the half-written line away.
      const onCanvas = e.target instanceof Element && e.target.closest(".tl-canvas") !== null;
      const alone = onCanvas && touching.size === 1 && editor.getInstanceState().isPenMode && !editor.inputs.getIsPointing();
      panFrom = alone ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panFrom || e.pointerId !== panFrom.id) return;
      // A pen that comes down after the palm takes the gesture back.
      if (touching.size > 1 || editor.inputs.getIsPinching() || editor.inputs.getIsPointing()) {
        panFrom = null;
        return;
      }
      const { x, y, z } = editor.getCamera();
      editor.setCamera({ x: x + (e.clientX - panFrom.x) / z, y: y + (e.clientY - panFrom.y) / z, z }, { immediate: true });
      panFrom = { id: panFrom.id, x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      touching.delete(e.pointerId);
      if (panFrom?.id === e.pointerId) panFrom = null;
    };

    const onPointerCancel = (e: PointerEvent) => {
      onPointerUp(e);
      endStroke(e);
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerCancel);
    // Fired when the capture goes away without a pointerup, which is how Chrome on
    // Android hands a stroke over to a system gesture.
    container.addEventListener("lostpointercapture", endStroke);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerCancel);
      container.removeEventListener("lostpointercapture", endStroke);
    };
  }, [editor]);
}
