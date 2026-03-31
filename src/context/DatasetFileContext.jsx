/**
 * DatasetFileContext.jsx
 * ======================
 * Bridges DataHub CSV uploads to the SARIMAX Lab (ModelLab).
 *
 * Problem: DataHub stores File objects in a module-local Map.
 * ModelLab needs the actual CSV text content for its parser.
 * This context acts as a session-scoped registry:
 *
 *   DataHub.jsx → registerDatasetFile(id, file, name, type)
 *   ModelLab.jsx → datasetFiles, getDatasetText(id)
 *
 * Files are kept in memory only (not serialised), cleared on sign-out.
 * This is intentional: File objects cannot cross tabs or survive reload.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const DatasetFileContext = createContext(null);

/**
 * Registry entry shape:
 * {
 *   id: string,        — matches AppContext dataset id
 *   file: File,        — the raw File object
 *   name: string,      — original filename
 *   type: string,      — "Primary" | "Exogenous"
 *   status: string,    — "Raw" | "Cleaned" | "Verified"
 *   registeredAt: number  — Date.now()
 * }
 */

export const DatasetFileProvider = ({ children }) => {
  // Map<id, RegistryEntry> — not serialisable, session only
  const [registry, setRegistry] = useState(() => new Map());

  /**
   * Called by DataHub when a file is uploaded.
   * Overwrites any previous entry for the same id.
   */
  const registerDatasetFile = useCallback((id, file, name, type = 'Primary', status = 'Raw') => {
    if (!id || !file) return;
    setRegistry(prev => {
      const next = new Map(prev);
      next.set(id, { id, file, name, type, status, registeredAt: Date.now() });
      return next;
    });
  }, []);

  /**
   * Update status when DataHub edits a dataset's metadata.
   */
  const updateDatasetFileStatus = useCallback((id, status) => {
    setRegistry(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, { ...next.get(id), status });
      return next;
    });
  }, []);

  /**
   * Remove when a dataset is deleted from DataHub.
   */
  const removeDatasetFile = useCallback((id) => {
    setRegistry(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /**
   * Clear all files (called on sign-out).
   */
  const clearDatasetFiles = useCallback(() => {
    setRegistry(new Map());
  }, []);

  /**
   * Read file text by id. Returns null if not registered.
   * @returns {Promise<string|null>}
   */
  const getDatasetText = useCallback(async (id) => {
    const entry = registry.get(id);
    if (!entry?.file) return null;
    try {
      return await entry.file.text();
    } catch {
      return null;
    }
  }, [registry]);

  /**
   * Snapshot of all registered entries (as array) for UI listing.
   */
  const datasetFiles = Array.from(registry.values());

  /**
   * Check if a specific dataset id has a file registered.
   */
  const hasDatasetFile = useCallback((id) => registry.has(id), [registry]);

  return (
    <DatasetFileContext.Provider value={{
      datasetFiles,
      registerDatasetFile,
      updateDatasetFileStatus,
      removeDatasetFile,
      clearDatasetFiles,
      getDatasetText,
      hasDatasetFile,
    }}>
      {children}
    </DatasetFileContext.Provider>
  );
};

export const useDatasetFiles = () => {
  const ctx = useContext(DatasetFileContext);
  if (!ctx) throw new Error('useDatasetFiles must be used inside DatasetFileProvider');
  return ctx;
};
