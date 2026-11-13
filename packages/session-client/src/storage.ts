export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

// The browser's localStorage when it works; otherwise memory for this page only (private modes can block storage).
export function defaultStorage(): KeyValueStorage {
  try {
    const storage = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (storage) {
      storage.setItem("malverdesoftware:probe", "1");
      storage.removeItem("malverdesoftware:probe");
      return storage;
    }
  } catch {
    // fall through
  }
  return memoryStorage();
}

// Never lets a full or blocked storage break the activity.
export function safeStorage(storage: KeyValueStorage) {
  return {
    get(key: string): string | null {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): boolean {
      try {
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key: string) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
