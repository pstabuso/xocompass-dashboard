import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const DatasetFileContext = createContext(null);

export const DatasetFileProvider = ({ children }) => {
  const [registry, setRegistry] = useState(() => new Map());

  const registerDatasetFile = useCallback((id, file, name, type = 'Primary', status = 'Raw') => {
    if (!id || !file) return;

    setRegistry((prev) => {
      const next = new Map(prev);
      next.set(id, {
        id,
        file,
        name,
        type,
        status,
        registeredAt: Date.now(),
      });
      return next;
    });
  }, []);

  const updateDatasetFileStatus = useCallback((id, status) => {
    setRegistry((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, { ...next.get(id), status });
      return next;
    });
  }, []);

  const removeDatasetFile = useCallback((id) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearDatasetFiles = useCallback(() => {
    setRegistry(new Map());
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
