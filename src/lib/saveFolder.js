/**
 * Dialog-free saving with the File System Access API (Chrome / Edge on desktop).
 * The user picks a folder ONCE; the folder is remembered (IndexedDB) and every
 * later save is written straight into it, with no "Save as" window.
 * Browsers block the Downloads folder itself, so pick a folder inside it,
 * e.g. Downloads\BlindCoder.
 */

const DB = "blindcoder";
const STORE = "handles";
const KEY = "saveFolder";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const folderSaveSupported = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window && window.isSecureContext && window.self === window.top;

const NAME_KEY = "blindcoder.saveFolderName";
let cached;

/** Name of the remembered folder, without touching IndexedDB (cheap, safe on page load). */
export function rememberedFolderName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

function rememberName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

/** The remembered folder handle. Only loaded when actually saving. */
export async function getSaveFolder() {
  if (cached !== undefined) return cached;
  if (!rememberedFolderName()) return (cached = null);
  try {
    cached = (await idb("readonly", (s) => s.get(KEY))) || null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Opens the folder picker. Needs a key press or click (browser rule). Throws AbortError if cancelled. */
export async function chooseSaveFolder() {
  const handle = await window.showDirectoryPicker({ id: "blindcoder-save", mode: "readwrite", startIn: "downloads" });
  cached = handle;
  rememberName(handle.name);
  try {
    await idb("readwrite", (s) => s.put(handle, KEY));
  } catch {
    /* still works for this visit */
  }
  return handle;
}

export async function forgetSaveFolder() {
  cached = null;
  rememberName("");
  try {
    await idb("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

async function readIfExists(dir, name) {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null; // doesn't exist
  }
}

/** Never silently overwrite a different file: prime_numbers.py -> prime_numbers_2.py.
 * Java is the exception: its file name must match the class, so it's updated in place. */
async function pickName(dir, name, content) {
  const existing = await readIfExists(dir, name);
  if (existing === null || existing === content) return { name, replaced: false };
  if (name.endsWith(".java")) return { name, replaced: true };
  const dot = name.lastIndexOf(".");
  const base = name.slice(0, dot);
  const ext = name.slice(dot);
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}_${i}${ext}`;
    const other = await readIfExists(dir, candidate);
    if (other === null || other === content) return { name: candidate, replaced: false };
  }
  return { name: `${base}_${Date.now()}${ext}`, replaced: false };
}

/**
 * Writes the file into the remembered folder.
 * Returns { saved: true, name, folder, replaced } or { saved: false, reason }.
 */
export async function saveToFolder(name, content) {
  const dir = await getSaveFolder();
  if (!dir) return { saved: false, reason: "no-folder" };
  try {
    let permission = await dir.queryPermission({ mode: "readwrite" });
    // Chrome asks once per visit at most ("Allow on every visit" makes it permanent).
    if (permission === "prompt") permission = await dir.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") return { saved: false, reason: "denied" };

    const picked = await pickName(dir, name, content);
    const file = await dir.getFileHandle(picked.name, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return { saved: true, name: picked.name, folder: dir.name, replaced: picked.replaced };
  } catch (err) {
    // Folder deleted/moved, or permission problem: fall back to a normal download.
    if (err?.name === "NotFoundError") await forgetSaveFolder();
    return { saved: false, reason: err?.name || "error" };
  }
}
