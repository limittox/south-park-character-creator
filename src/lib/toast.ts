import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3200) {
  const t = { id: nextId++, text, tone };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, ms);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}

/* The news ticker is a tiny store too, so any component can file a story. */
let headline = '';
const newsListeners = new Set<() => void>();

export function news(text: string) {
  headline = text;
  newsListeners.forEach((l) => l());
}

export function useHeadline(): string {
  return useSyncExternalStore(
    (l) => {
      newsListeners.add(l);
      return () => newsListeners.delete(l);
    },
    () => headline,
  );
}
