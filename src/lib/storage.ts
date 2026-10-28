import type { CharacterState } from '../types';
import { normalizeCharacter } from '../data/defaults';

const KEY_CURRENT = 'ptcc.current.v1';
const KEY_CREW = 'ptcc.crew.v1';
const KEY_PREFS = 'ptcc.prefs.v1';

export interface CrewMember {
  id: string;
  savedAt: number;
  c: CharacterState;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrent(): CharacterState | null {
  const raw = read<Partial<CharacterState> | null>(KEY_CURRENT, null);
  return raw ? normalizeCharacter(raw) : null;
}

export function saveCurrent(c: CharacterState): void {
  if (!write(KEY_CURRENT, c)) write(KEY_CURRENT, { ...c, photoFace: null, usePhotoFace: false });
}

export function loadCrew(): CrewMember[] {
  const raw = read<CrewMember[]>(KEY_CREW, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({ id: m.id, savedAt: Number(m.savedAt) || Date.now(), c: normalizeCharacter(m.c) }));
}

/** Returns false when storage is full even after dropping photo faces. */
export function saveCrew(crew: CrewMember[]): boolean {
  if (write(KEY_CREW, crew)) return true;
  return write(
    KEY_CREW,
    crew.map((m) => ({ ...m, c: { ...m.c, photoFace: null, usePhotoFace: false } })),
  );
}

export function getPref<T>(name: string, fallback: T): T {
  const prefs = read<Record<string, unknown>>(KEY_PREFS, {});
  return name in prefs ? (prefs[name] as T) : fallback;
}

export function setPref(name: string, value: unknown): void {
  const prefs = read<Record<string, unknown>>(KEY_PREFS, {});
  prefs[name] = value;
  write(KEY_PREFS, prefs);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
