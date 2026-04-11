import { FALLBACK } from './constants'

function normaliseHeader(header) {
  return header.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsvLine(line) {
  return (
    line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)
      ?.map((cell) => cell.trim().replace(/^["']|["']$/g, '')) ??
    line.split(',').map((cell) => cell.trim())
  )
}

function parseFlexibleDate(rawDate) {
  if (!rawDate) return null

  let parsedDate = new Date(rawDate)

  if (isNaN(parsedDate.getTime()) && rawDate.includes('/')) {
    const parts = rawDate.split('/')
    parsedDate =
      parseInt(parts[0], 10) > 12
        ? new Date(`${parts[1]}/${parts[0]}/${parts[2]}`)
        : new Date(`${parts[0]}/${parts[1]}/${parts[2]}`)
  }

  if (isNaN(parsedDate.getTime()) && rawDate.includes('-')) {
    const parts = rawDate.split('-')
    if (parts[0].length === 2) {
      parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
    }
  }

  return isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function parseBookingCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim())

  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const normHeaders = rawHeaders.map(normaliseHeader)

  const dateCandidates = [
    'generationdate',
    'traveldate',
    'bookingdate',
    'transactiondate',
    'date',
    'period',
    'issueddate',
  ]

  const amountCandidates = [
    'netamount',
    'net',
    'amount',
    'commission',
    'basic',
    'fare',
  ]

  let dateCol = -1
  for (const candidate of dateCandidates) {
    dateCol = normHeaders.indexOf(candidate)
    if (dateCol !== -1) break
  }

  if (dateCol === -1) {
    throw new Error(`CSV missing a date column. Found: ${rawHeaders.join(', ')}`)
  }

  let amtCol = -1
  for (const candidate of amountCandidates) {
    amtCol = normHeaders.indexOf(candidate)
    if (amtCol !== -1) break
  }

  const statusCol = normHeaders.indexOf('status')
  const skipStatuses = new Set(['cancelled', 'refunded', 'voided', 'rejected'])

  const monthly = {}
  const errors = []

  lines.slice(1).forEach((line, index) => {
    const cols = parseCsvLine(line)
    const rawDate = cols[dateCol] || ''

    if (!rawDate) return

    if (statusCol !== -1 && skipStatuses.has((cols[statusCol] || '').toLowerCase().trim())) {
      return
    }

    const parsedDate = parseFlexibleDate(rawDate)
    if (!parsedDate) {
      errors.push(`Row ${index + 2}: bad date "${rawDate}"`)
      return
    }

    const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`

    let netAmt = FALLBACK.NET_COMMISSION_PHP
    if (amtCol !== -1) {
      const rawAmount = parseFloat((cols[amtCol] || '').replace(/,/g, ''))
      if (isFinite(rawAmount) && rawAmount >= 0) {
        netAmt = rawAmount
      }
    }

    if (!monthly[monthKey]) {
      monthly[monthKey] = { count: 0, revenue: 0 }
    }

    monthly[monthKey].count += 1
    monthly[monthKey].revenue += netAmt
  })

  const data = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      demand: value.count,
      trueRevenue: value.revenue,
      avgCommission:
        value.count > 0 ? value.revenue / value.count : FALLBACK.NET_COMMISSION_PHP,
    }))

  if (data.length < 3) {
    throw new Error(`Only ${data.length} valid month(s) — need at least 3`)
  }

  return {
    data,
    warnings: errors.slice(0, 5),
    headers: rawHeaders,
    normHeaders,
    dateCol,
    amtCol,
  }
}
