import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

const DatasetFileContext = createContext(null);

const DB_NAME = 'xocompass-dataset-files';
const DB_VERSION = 1;
const STORE_NAME = 'dataset_files';

const canUseIndexedDB = () => typeof window !== 'undefined' && 'indexedDB' in window;

const openDB = () => new Promise((resolve, reject) => {
  if (!canUseIndexedDB()) {
    reject(new Error('IndexedDB unavailable'));
    return;
  }

  const request = window.indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
});

const withStore = async (mode, handler) => {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      handler(store, resolve, reject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
};

const listStoredEntries = async () => {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Failed to read dataset files'));
    });
  } finally {
    db.close();
  }
};

const persistEntry = async (entry) => {
  await withStore('readwrite', (store) => {
    store.put(entry);
  });
};

const deleteStoredEntry = async (id) => {
  await withStore('readwrite', (store) => {
    store.delete(id);
  });
};

const clearStoredEntries = async () => {
  await withStore('readwrite', (store) => {
    store.clear();
  });
};

export const DatasetFileProvider = ({ children }) => {
  const [registry, setRegistry] = useState(() => new Map());
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!canUseIndexedDB()) {
        setStorageReady(true);
        return;
      }

      try {
        const stored = await listStoredEntries();
        if (cancelled) return;

        setRegistry(new Map(
          stored
            .filter((entry) => entry?.id && entry?.file)
            .map((entry) => [entry.id, entry])
        ));
      } catch (error) {
        console.warn('[XoCompass] Failed to restore dataset files from IndexedDB:', error?.message || error);
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, []);

  const registerDatasetFile = useCallback((id, file, name, type = 'Primary', status = 'Raw') => {
    if (!id || !file) return;

    const entry = {
      id,
      file,
      name,
      type,
      status,
      registeredAt: Date.now(),
    };

    setRegistry((prev) => {
      const next = new Map(prev);
      next.set(id, entry);
      return next;
    });

    persistEntry(entry).catch((error) => {
      console.warn('[XoCompass] Failed to persist dataset file:', error?.message || error);
    });
  }, []);

  const updateDatasetFileStatus = useCallback((id, status) => {
    let updatedEntry = null;

    setRegistry((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      updatedEntry = { ...next.get(id), status };
      next.set(id, updatedEntry);
      return next;
    });

    if (updatedEntry) {
      persistEntry(updatedEntry).catch((error) => {
        console.warn('[XoCompass] Failed to update dataset file metadata:', error?.message || error);
      });
    }
  }, []);

  const removeDatasetFile = useCallback((id) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    deleteStoredEntry(id).catch((error) => {
      console.warn('[XoCompass] Failed to remove dataset file from IndexedDB:', error?.message || error);
    });
  }, []);

  const clearDatasetFiles = useCallback(() => {
    setRegistry(new Map());
    clearStoredEntries().catch((error) => {
      console.warn('[XoCompass] Failed to clear stored dataset files:', error?.message || error);
    });
  }, []);

  const hasDatasetFile = useCallback((id) => registry.has(id), [registry]);

  const getDatasetEntry = useCallback((id) => {
    return registry.get(id) || null;
  }, [registry]);

  const getDatasetFile = useCallback((id) => {
    return registry.get(id)?.file || null;
  }, [registry]);

  const getDatasetText = useCallback(async (id) => {
    const entry = registry.get(id);
    if (!entry?.file) return null;

    try {
      return await entry.file.text();
    } catch {
      return null;
    }
  }, [registry]);

  const downloadDatasetFile = useCallback((id, fallbackName = 'dataset.csv') => {
    const entry = registry.get(id);
    if (!entry?.file) return false;

    const url = URL.createObjectURL(entry.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name || fallbackName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }, [registry]);

  const datasetFiles = useMemo(() => Array.from(registry.values()), [registry]);

  return (
    <DatasetFileContext.Provider
      value={{
        datasetFiles,
        registerDatasetFile,
        updateDatasetFileStatus,
        removeDatasetFile,
        clearDatasetFiles,
        hasDatasetFile,
        getDatasetEntry,
        getDatasetFile,
        getDatasetText,
        downloadDatasetFile,
        storageReady,
      }}
    >
      {children}
    </DatasetFileContext.Provider>
  );
};

export const useDatasetFiles = () => {
  const ctx = useContext(DatasetFileContext);
  if (!ctx) {
    throw new Error('useDatasetFiles must be used inside DatasetFileProvider');
  }
  return ctx;
};
