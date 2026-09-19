import type { ProviderId } from "@/lib/providers/types";
import type { Lesson, MindMap } from "@/lib/schema";

/* Roadmaps are kept in this browser's localStorage so a lesson link opened in a
   new tab (Cmd/Ctrl+click, middle click, "Open link in new tab") can rebuild the
   page. Every generated or revised map gets its own id.

   Tabs never read-modify-write a shared key, because storage reaches other tabs
   with a delay and a stale copy would overwrite a newer one. Only the tab that
   generated a map writes its map key; each finished lesson has a key of its own.
   All of this is best effort: storage can be full, blocked or cleared. */

export interface SavedMap {
  topic: string;
  provider: ProviderId;
  map: MindMap;
  /** False while the generating tab is still streaming the map in. */
  complete: boolean;
  /** For a revised map: the change the learner asked for. */
  instruction?: string;
  /** What the learner added about their goal and what they already know. */
  details?: string;
  savedAt: number;
}

export interface SavedRoadmap extends SavedMap {
  /** Finished lessons, by lesson key. */
  lessons: Record<string, Lesson>;
}

const MAP_PREFIX = "sl:roadmap:";
const LESSON_PREFIX = "sl:lesson:";
/** Roadmaps kept per browser; older ones and their lessons are dropped. */
const KEEP = 30;

/* Change notifications, so the home page's list can follow this tab's writes
   and, through `storage` events, other tabs'. */
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: call `listener` whenever saved roadmaps change. */
export function subscribeRoadmaps(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(MAP_PREFIX) || e.key.startsWith(LESSON_PREFIX)) changed();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Bumped on every change; a cheap snapshot for useSyncExternalStore. */
export function roadmapsVersion(): number {
  return version;
}

/** Storage key of a map, for matching `storage` events. */
export function roadmapStorageKey(id: string): string {
  return MAP_PREFIX + id;
}

function lessonPrefix(id: string): string {
  return `${LESSON_PREFIX}${id}:`;
}

export function newRoadmapId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Address of a roadmap, or of one block's lesson in it. */
export function roadmapUrl(id: string, lesson?: string): string {
  const params = new URLSearchParams({ r: id });
  if (lesson) params.set("lesson", lesson);
  return `/?${params}`;
}

export function loadMap(id: string): SavedMap | null {
  try {
    const raw = localStorage.getItem(MAP_PREFIX + id);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedMap;
    if (typeof saved?.topic !== "string" || !Array.isArray(saved?.map?.stages)) return null;
    return saved;
  } catch {
    return null;
  }
}

export function loadRoadmap(id: string): SavedRoadmap | null {
  const saved = loadMap(id);
  if (!saved) return null;
  const lessons: Record<string, Lesson> = {};
  try {
    const prefix = lessonPrefix(id);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        lessons[key.slice(prefix.length)] = JSON.parse(localStorage.getItem(key) ?? "null") as Lesson;
      } catch {
        // skip an unreadable lesson
      }
    }
  } catch {
    // storage unavailable
  }
  return { ...saved, lessons };
}

/** One saved roadmap, as the home page lists it. */
export interface RoadmapSummary {
  id: string;
  /** What the learner typed. */
  topic: string;
  /** The map's own cleaned-up title. */
  title: string;
  instruction?: string;
  blocks: number;
  lessonsWritten: number;
  savedAt: number;
}

/** Finished roadmaps saved in this browser, newest first. */
export function listRoadmaps(): RoadmapSummary[] {
  const found: RoadmapSummary[] = [];
  const lessonCounts = new Map<string, number>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LESSON_PREFIX)) continue;
      const id = key.slice(LESSON_PREFIX.length).split(":")[0];
      lessonCounts.set(id, (lessonCounts.get(id) ?? 0) + 1);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(MAP_PREFIX)) continue;
      const id = key.slice(MAP_PREFIX.length);
      const saved = loadMap(id);
      if (!saved?.complete || saved.map.stages.length === 0) continue;
      found.push({
        id,
        topic: saved.topic,
        title: saved.map.topic || saved.topic,
        instruction: saved.instruction,
        blocks: saved.map.stages.reduce((n, s) => n + 1 + s.supporting.length, 0),
        lessonsWritten: lessonCounts.get(id) ?? 0,
        savedAt: saved.savedAt,
      });
    }
  } catch {
    // storage unavailable
  }
  return found.sort((a, b) => b.savedAt - a.savedAt);
}

/** Forget a roadmap and its lessons. */
export function deleteRoadmap(id: string): void {
  try {
    localStorage.removeItem(MAP_PREFIX + id);
    const prefix = lessonPrefix(id);
    const lessonKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) lessonKeys.push(key);
    }
    for (const key of lessonKeys) localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
  changed();
}

/** A finished lesson another tab may already have written. */
export function loadLesson(id: string, key: string): Lesson | null {
  try {
    const raw = localStorage.getItem(lessonPrefix(id) + key);
    return raw ? (JSON.parse(raw) as Lesson) : null;
  } catch {
    return null;
  }
}

/** Save a map. Only the tab that generated it calls this. */
export function saveMap(id: string, entry: Omit<SavedMap, "savedAt">): void {
  let isNew = true;
  try {
    isNew = localStorage.getItem(MAP_PREFIX + id) === null;
  } catch {
    return;
  }
  if (isNew) prune(KEEP - 1);
  write(MAP_PREFIX + id, JSON.stringify({ ...entry, savedAt: Date.now() }));
  changed();
}

/** Save one finished lesson. Any tab may call this. */
export function saveLesson(id: string, key: string, lesson: Lesson): void {
  write(lessonPrefix(id) + key, JSON.stringify(lesson));
  changed();
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Probably full: keep only the newest few roadmaps and try once more.
    prune(3);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Give up quietly; the page works without it.
    }
  }
}

/** Keep the `keep` most recently created roadmaps, with their lessons. */
function prune(keep: number): void {
  try {
    const maps: { id: string; savedAt: number }[] = [];
    const lessonKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(LESSON_PREFIX)) {
        lessonKeys.push(key);
      } else if (key.startsWith(MAP_PREFIX)) {
        let savedAt = 0;
        try {
          savedAt = Number(JSON.parse(localStorage.getItem(key) ?? "{}").savedAt) || 0;
        } catch {
          // unreadable entries go first
        }
        maps.push({ id: key.slice(MAP_PREFIX.length), savedAt });
      }
    }
    maps.sort((a, b) => b.savedAt - a.savedAt);
    const kept = new Set(maps.slice(0, Math.max(0, keep)).map((m) => m.id));
    for (const { id } of maps) if (!kept.has(id)) localStorage.removeItem(MAP_PREFIX + id);
    for (const key of lessonKeys) {
      const id = key.slice(LESSON_PREFIX.length).split(":")[0];
      if (!kept.has(id)) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}
