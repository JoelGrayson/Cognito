/* Per-browser preferences, kept in localStorage. */

export interface Settings {
  /** Write every lesson of a new or revised roadmap in the background. */
  autoGenerateLessons: boolean;
}

const KEY = "sl:settings";
export const DEFAULT_SETTINGS: Settings = { autoGenerateLessons: true };

const listeners = new Set<() => void>();
let cache: Settings | null = null;

export function readSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache;
}

export function writeSettings(patch: Partial<Settings>): void {
  cache = { ...readSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable: the change lasts until the page reloads
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore; also follows changes made in other tabs. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The server has no storage, so it renders the defaults. */
export function serverSettings(): Settings {
  return DEFAULT_SETTINGS;
}
