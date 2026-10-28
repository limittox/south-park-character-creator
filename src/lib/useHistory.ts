import { useCallback, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string;
  lastTime: number;
}

const LIMIT = 120;
const COALESCE_MS = 1200;

/**
 * Undo/redo for a value. Rapid edits sharing a `key` (typing a name, dragging a slider)
 * collapse into a single undo step.
 */
export function useHistory<T>(initial: T | (() => T)) {
  const [h, setH] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
    lastKey: '',
    lastTime: 0,
  }));

  const set = useCallback((next: T | ((prev: T) => T), key?: string) => {
    setH((s) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      const now = Date.now();
      if (key && key === s.lastKey && now - s.lastTime < COALESCE_MS) {
        return { ...s, present: value, future: [], lastTime: now };
      }
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [], lastKey: key ?? '', lastTime: now };
    });
  }, []);

  const undo = useCallback(() => {
    setH((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future], lastKey: '', lastTime: 0 };
    });
  }, []);

  const redo = useCallback(() => {
    setH((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest, lastKey: '', lastTime: 0 };
    });
  }, []);

  return { value: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
