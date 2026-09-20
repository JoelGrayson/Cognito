/**
 * The learner's uploaded worksheets, kept in this browser. Browser only.
 *
 * IndexedDB rather than the server: a sheet is a multi-megabyte file that only ever
 * needs to come back to the device it was uploaded from, and IndexedDB stores the Blob
 * as-is. The original file is kept, not the rendered pages, so reopening goes through
 * the same pagesOf() path as a fresh upload.
 */
import type { PageImage } from "./pdf";

export interface SavedSheet {
  /** Name and size, so uploading the same file twice replaces rather than duplicates. */
  id: string;
  name: string;
  pages: number;
  /** Small JPEG data URL of the first page. */
  thumb: string;
  openedAt: number;
}

interface StoredSheet extends SavedSheet {
  file: Blob;
  type: string;
}

const DB_NAME = "whiteboard-library";
const STORE = "sheets";
const THUMB_WIDTH = 360;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function thumbOf(page: PageImage): Promise<string> {
  const img = new Image();
  img.src = page.src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round((page.h / page.w) * THUMB_WIDTH);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export const sheetId = (file: File) => `${file.name}:${file.size}`;

/** Most recently opened first. */
export async function listSheets(): Promise<SavedSheet[]> {
  const all = await run<StoredSheet[]>("readonly", (s) => s.getAll());
  return all
    .map(({ id, name, pages, thumb, openedAt }) => ({ id, name, pages, thumb, openedAt }))
    .sort((a, b) => b.openedAt - a.openedAt);
}

export async function saveSheet(file: File, pages: PageImage[]): Promise<void> {
  const stored: StoredSheet = {
    id: sheetId(file),
    name: file.name,
    pages: pages.length,
    thumb: await thumbOf(pages[0]),
    openedAt: Date.now(),
    file,
    type: file.type,
  };
  await run("readwrite", (s) => s.put(stored));
}

export async function fileOf(id: string): Promise<File | null> {
  const stored = await run<StoredSheet | undefined>("readonly", (s) => s.get(id));
  return stored ? new File([stored.file], stored.name, { type: stored.type }) : null;
}

export async function deleteSheet(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}
