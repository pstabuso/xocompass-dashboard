import { useCallback, useState } from 'react'
import { FALLBACK } from '../domain/constants'

let sequence = 0

function createAuditEntry(action, detail, actor = 'user') {
  return Object.freeze({
    seq: ++sequence,
    ts: new Date().toISOString(),
    actor,
    action,
    detail,
  })
}

export function useModelLabConsole() {
  const [terminalLogs, setTerminalLogs] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [showAudit, setShowAudit] = useState(false)

  const addAudit = useCallback((action, detail, actor = 'user') => {
    setAuditLog((prev) => [...prev.slice(-99), createAuditEntry(action, detail, actor)])
  }, [])

  const addLog = useCallback((text, type = 'default') => {
    setTerminalLogs((prev) => {
      const next = [...prev, { text, type, ts: Date.now() }]
      return next.length > FALLBACK.MAX_LOGS
        ? next.slice(-FALLBACK.MAX_LOGS)
        : next
    })
  }, [])

  const clearTerminalLogs = useCallback(() => {
    setTerminalLogs([])
  }, [])

  const clearAuditLog = useCallback(() => {
    setAuditLog([])
  }, [])

  return {
    terminalLogs,
    setTerminalLogs,
    clearTerminalLogs,
    auditLog,
    setAuditLog,
    clearAuditLog,
    showAudit,
    setShowAudit,
    addAudit,
    addLog,
  }
}
