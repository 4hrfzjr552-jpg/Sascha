import { PantItem } from "../types";

const DB_NAME = "vinted_ai_db";
const DB_VERSION = 1;
const STORE_PANTS = "pants";
const STORE_SETTINGS = "settings";

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
