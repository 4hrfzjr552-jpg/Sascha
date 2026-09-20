import { PantItem } from "../types";

const DB_NAME = "vinted_ai_db";
const DB_VERSION = 2;
const STORE_PANTS = "pants";
const STORE_SETTINGS = "settings";
const STORE_BULK = "bulk_images";

/**
 * A staged bulk-upload image. The full compressed `dataUrl` lives ONLY in
 * IndexedDB and is never held in React state for large uploads. The tiny
 * `thumbUrl` is what the gallery renders.
 */
export interface BulkImageRecord {
  id: string;
  dataUrl: string; // full compressed JPEG (kept in IndexedDB only)
  thumbUrl: string; // small preview JPEG
  name: string;
  size: number;
  groupId: string | null;
  order: number;
  createdAt: number;
}

/** Lightweight projection kept in React state (no full dataUrl). */
export interface BulkImageMeta {
  id: string;
  thumbUrl: string;
  name: string;
  size: number;
  groupId: string | null;
  order: number;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB ist im Browser nicht verfügbar"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PANTS)) {
        db.createObjectStore(STORE_PANTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_BULK)) {
        db.createObjectStore(STORE_BULK, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error("IndexedDB Open Error:", (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getAllPants(): Promise<PantItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PANTS, "readonly");
      const store = transaction.objectStore(STORE_PANTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result || []) as PantItem[];
        // Sort by pant number ascending
        list.sort((a, b) => a.number - b.number);
        resolve(list);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("Failed to load pants from IndexedDB:", err);
    return [];
  }
}

export async function savePantToDB(pant: PantItem): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PANTS, "readwrite");
      const store = transaction.objectStore(STORE_PANTS);
      const request = store.put(pant);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to save pant to IndexedDB:", err);
  }
}

export async function saveMultiplePantsToDB(pants: PantItem[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PANTS, "readwrite");
      const store = transaction.objectStore(STORE_PANTS);

      pants.forEach((pant) => {
        store.put(pant);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("Failed to save multiple pants to IndexedDB:", err);
  }
}

export async function deletePantFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PANTS, "readwrite");
      const store = transaction.objectStore(STORE_PANTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to delete pant from IndexedDB:", err);
  }
}

export async function clearAllPantsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PANTS, "readwrite");
      const store = transaction.objectStore(STORE_PANTS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to clear pants from IndexedDB:", err);
  }
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_SETTINGS, "readonly");
      const store = transaction.objectStore(STORE_SETTINGS);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value as T);
        } else {
          // Check localStorage as fallback
          const localVal = localStorage.getItem(`vinted_ai_${key}`);
          if (localVal !== null) {
            try {
              resolve(JSON.parse(localVal) as T);
              return;
            } catch {
              resolve(localVal as unknown as T);
              return;
            }
          }
          resolve(defaultValue);
        }
      };

      request.onerror = () => {
        const localVal = localStorage.getItem(`vinted_ai_${key}`);
        if (localVal !== null) {
          try {
            resolve(JSON.parse(localVal) as T);
          } catch {
            resolve(localVal as unknown as T);
          }
        } else {
          resolve(defaultValue);
        }
      };
    });
  } catch {
    const localVal = localStorage.getItem(`vinted_ai_${key}`);
    if (localVal !== null) {
      try {
        return JSON.parse(localVal) as T;
      } catch {
        return localVal as unknown as T;
      }
    }
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  // Save to localStorage as quick sync backup
  try {
    localStorage.setItem(`vinted_ai_${key}`, typeof value === "string" ? value : JSON.stringify(value));
  } catch (e) {
    console.warn("LocalStorage setItem failed:", e);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORE_SETTINGS);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB setSetting error:", err);
  }
}

/* ------------------------------------------------------------------ *
 * Bulk upload staging store
 * ------------------------------------------------------------------ */

/** Persist a single staged bulk image (full dataUrl + thumbnail). */
export async function saveBulkImage(record: BulkImageRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readwrite");
    tx.objectStore(STORE_BULK).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load lightweight metadata for every staged image via a cursor, so the full
 * dataUrls are never all held in memory at once.
 */
export async function getAllBulkMeta(): Promise<BulkImageMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readonly");
    const req = tx.objectStore(STORE_BULK).openCursor();
    const result: BulkImageMeta[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const v = cursor.value as BulkImageRecord;
        result.push({
          id: v.id,
          thumbUrl: v.thumbUrl,
          name: v.name,
          size: v.size,
          groupId: v.groupId ?? null,
          order: v.order,
          createdAt: v.createdAt,
        });
        cursor.continue();
      } else {
        result.sort((a, b) => a.order - b.order);
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Fetch full records (with dataUrl) for a set of ids, preserving id order. */
export async function getBulkImagesByIds(
  ids: string[]
): Promise<BulkImageRecord[]> {
  if (ids.length === 0) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readonly");
    const store = tx.objectStore(STORE_BULK);
    const map = new Map<string, BulkImageRecord>();
    ids.forEach((id) => {
      const r = store.get(id);
      r.onsuccess = () => {
        if (r.result) map.set(id, r.result as BulkImageRecord);
      };
    });
    tx.oncomplete = () =>
      resolve(ids.map((id) => map.get(id)).filter(Boolean) as BulkImageRecord[]);
    tx.onerror = () => reject(tx.error);
  });
}

/** Assign (or clear) the groupId for many images in one transaction. */
export async function setBulkImagesGroup(
  ids: string[],
  groupId: string | null
): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readwrite");
    const store = tx.objectStore(STORE_BULK);
    ids.forEach((id) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result as BulkImageRecord | undefined;
        if (rec) {
          rec.groupId = groupId;
          store.put(rec);
        }
      };
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete staged images by id. */
export async function deleteBulkImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readwrite");
    const store = tx.objectStore(STORE_BULK);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove every staged image (used after "Gruppen übernehmen"). */
export async function clearBulkImages(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BULK, "readwrite");
    const req = tx.objectStore(STORE_BULK).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
