import { useCallback, useMemo, useState } from "react";

/** Undo/redo stack around a single value. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], value: initial, future: [] as T[] });

  const set = useCallback((value: T) => {
    setState((s) => ({ past: [...s.past, s.value], value, future: [] }));
  }, []);
  const reset = useCallback((value: T) => setState({ past: [], value, future: [] }), []);
  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), value: s.past[s.past.length - 1], future: [s.value, ...s.future] };
    });
  }, []);
  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return { past: [...s.past, s.value], value: s.future[0], future: s.future.slice(1) };
    });
  }, []);

  return useMemo(
    () => ({ value: state.value, canUndo: state.past.length > 0, canRedo: state.future.length > 0, set, reset, undo, redo }),
    [state, set, reset, undo, redo],
  );
}
