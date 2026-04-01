export function sanitiseError(err) {
  if (!err) return 'Unknown error'

  return String(err.message || err)
    .replace(/at\s+\S+\s+\([^)]+\)/g, '')
    .replace(/\/[a-z0-9/_.-]+\.[a-z]+:\d+/gi, '[path]')
    .replace(/[a-zA-Z0-9+/]{40,}/g, '[token]')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200)
}
