import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── KPI Config (inlined for serverless — cannot import from src/) ───

const STATUS_PATTERNS = {
  joined: [/\bjoin/i, /\bonboard/i],
  offer: [/\boffer\b/i, /offer extend/i, /extended/i],
  offerDrop: [/offer.*drop/i, /drop.*offer/i],
  shortlisted: [/shortlist/i, /screen pass/i, /l1 pass/i, /selected/i, /profile shar/i],
  interview: [/interview/i, /l1/i, /l2/i, /r1/i, /r2/i, /technical/i, /hr round/i],
  r1Reject: [/r1.*reject/i, /round.?1.*reject/i, /l1.*reject/i, /1st.*reject/i],
  r2Reject: [/r2.*reject/i, /round.?2.*reject/i, /l2.*reject/i, /2nd.*reject/i],
  noShow: [/no.?show/i, /absent/i],
  dropped: [/\bdrop\b/i, /candidate.*drop/i, /not interest/i, /withdrawn/i, /declined/i],
  screenReject: [/screen.*reject/i, /profile reject/i, /not shortlist/i, /rejected/i],
}

const VACANCY_PATTERNS = {
  filled: [/^1$/, /fill(ed)?/i, /close(d)?/i, /hired?/i, /placed?/i, /joined?/i, /onboard(ed|ing)?/i, /accepted/i, /offer.*accepted/i, /position.*filled/i],
  onHold: [/hold/i, /pause(d)?/i, /defer(red)?/i, /suspend(ed)?/i, /frozen/i, /postponed/i],
  inProcess: [/^0$/, /process/i, /progress/i, /open/i, /active/i, /ongoing/i, /live/i, /available/i, /recruiting/i, /in progress/i],
}

const COLUMN_CANDIDATES = {
  status: ['status', 'current status', 'stage', 'pipeline stage', 'recruitment status'],
  source: ['source', 'source channel', 'channel', 'source of application'],
  businessUnit: ['business unit', 'bu', 'company', 'division', 'department', 'entity'],
  position: ['position', 'role', 'job title', 'designation', 'opening', 'vacancy'],
  recruiter: ['recruiter', 'assigned to', 'hr', 'rm', 'talent acquisition', 'spoc'],
  applicationDate: ['application start', 'application start date', 'date', 'application date', 'applied date', 'date of application', 'received date'],
  quarter: ['quarter', 'q', 'fy quarter'],
  joiningDate: ['hired date', 'joining date', 'date of joining', 'doj', 'join date', 'onboarding date'],
}

const VACANCY_COLUMN_CANDIDATES = {
  status: ['number of positions closed', 'status', 'vacancy status', 'position status', 'stage'],
  businessUnit: ['business vertical', 'business unit', 'bu', 'company', 'division', 'department', 'entity'],
}

const TOP_POSITIONS_LIMIT = 14

function monthToQuarter(month: number): string {
  if (month >= 4 && month <= 6) return 'Q1'
  if (month >= 7 && month <= 9) return 'Q2'
  if (month >= 10 && month <= 12) return 'Q3'
  if (month >= 1 && month <= 3) return 'Q4'
  return 'Q1'
}

// ─── Default CSV URLs ────────────────────────────────────────

const DEFAULT_APPLICANTS_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJjDWZWvkAm7MVC5aA0vAjS3QMzbgc9CC8ZFJ8v5mHqXKLUBEO5N0xPWKl7MHUMEQ5yZ2_Omv0j42F/pub?gid=2138370345&single=true&output=csv'
const DEFAULT_VACANCIES_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJjDWZWvkAm7MVC5aA0vAjS3QMzbgc9CC8ZFJ8v5mHqXKLUBEO5N0xPWKl7MHUMEQ5yZ2_Omv0j42F/pub?gid=608034954&single=true&output=csv'

// ─── CSV Parsing ─────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]!).map(h => h.trim().toLowerCase().replace(/\s+/g, ' '))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })
    rows.push(row)
  }
  return rows
}

// ─── Helpers ─────────────────────────────────────────────────

function matchStatus(status: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(status))
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const s = dateStr.trim()

  const isoMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]!), parseInt(isoMatch[2]!) - 1, parseInt(isoMatch[3]!))
    if (!isNaN(d.getTime())) return d
  }

  const ddmmMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (ddmmMatch) {
    let day = parseInt(ddmmMatch[1]!)
    let month = parseInt(ddmmMatch[2]!)
    let year = parseInt(ddmmMatch[3]!)
    if (year < 100) year += 2000
    if (day > 12) {
      // day is indeed day
    } else if (month > 12) {
      const tmp = day; day = month; month = tmp
    }
    const d = new Date(year, month - 1, day)
    if (!isNaN(d.getTime())) return d
  }

  const fallback = new Date(s)
  if (!isNaN(fallback.getTime())) return fallback

  return null
}

function getQuarter(dateStr: string, quarter: string): string {
  if (quarter) {
    const q = quarter.trim().toUpperCase()
    if (/^Q[1-4]$/.test(q)) return q
    if (/^[1-4]$/.test(q)) return 'Q' + q
  }
  if (!dateStr) return 'Q1'
  const parsed = parseDate(dateStr)
  if (!parsed) return 'Q1'
  const month = parsed.getMonth() + 1
  if (month < 1 || month > 12) return 'Q1'
  return monthToQuarter(month)
}

function findCol(allKeys: string[], candidates: string[]): string {
  for (const c of candidates) {
    const lc = c.toLowerCase()
    if (allKeys.includes(lc)) return lc
    const partial = allKeys.find(k => k.includes(lc))
    if (partial) return partial
  }
  return candidates[0]!.toLowerCase()
}

// ─── Dashboard Computation ───────────────────────────────────

function computeDashboard(applicants: Record<string, string>[], vacancies: Record<string, string>[]) {
  const apps = applicants.filter(r => Object.values(r).some(v => v !== ''))

  const sample = apps[0] || {}
  const allKeys = Object.keys(sample)

  const statusKey    = findCol(allKeys, COLUMN_CANDIDATES.status)
  const sourceKey    = findCol(allKeys, COLUMN_CANDIDATES.source)
  const buKey        = findCol(allKeys, COLUMN_CANDIDATES.businessUnit)
  const posKey       = findCol(allKeys, COLUMN_CANDIDATES.position)
  const recruiterKey = findCol(allKeys, COLUMN_CANDIDATES.recruiter)
  const dateKey      = findCol(allKeys, COLUMN_CANDIDATES.applicationDate)
  const quarterKey   = findCol(allKeys, COLUMN_CANDIDATES.quarter)
  const joinDateKey  = findCol(allKeys, COLUMN_CANDIDATES.joiningDate)
  const reasonKey    = findCol(allKeys, ['reason for rejection', 'rejection reason', 'reason'])

  const totalApplicants = apps.length
  let shortlisted = 0, interviewed = 0, offered = 0, joined = 0
  let candidateDrops = 0, r1Rejects = 0, r2Rejects = 0, noShows = 0, offerDrops = 0, screenRejects = 0
  const timeToFillDays: number[] = []

  const sourceMap: Record<string, { total: number; joined: number }> = {}
  const buMap: Record<string, { total: number; joined: number }> = {}
  const recruiterMap: Record<string, { apps: number; offers: number; joined: number; offerDrops: number }> = {}
  const posMap: Record<string, { apps: number; joined: number }> = {}
  const quarterMap: Record<string, { applicants: number; joined: number }> = {}
  const rejectReasonMap: Record<string, number> = {}
  const offerDropReasonMap: Record<string, number> = {}
  const timeToFillByBUMap: Record<string, number[]> = {}

  for (const row of apps) {
    const status = (row[statusKey] || '').trim()
    const source = (row[sourceKey] || 'Unknown').trim() || 'Unknown'
    const bu = (row[buKey] || 'Unknown').trim() || 'Unknown'
    const position = (row[posKey] || 'Unknown').trim() || 'Unknown'
    const recruiter = (row[recruiterKey] || 'Unknown').trim() || 'Unknown'
    const dateStr = row[dateKey] || ''
    const quarterStr = row[quarterKey] || ''
    const quarter = getQuarter(dateStr, quarterStr)

    if (!quarterMap[quarter]) quarterMap[quarter] = { applicants: 0, joined: 0 }
    quarterMap[quarter].applicants++

    if (!sourceMap[source]) sourceMap[source] = { total: 0, joined: 0 }
    sourceMap[source].total++

    if (!buMap[bu]) buMap[bu] = { total: 0, joined: 0 }
    buMap[bu].total++

    if (!posMap[position]) posMap[position] = { apps: 0, joined: 0 }
    posMap[position].apps++

    if (!recruiterMap[recruiter]) recruiterMap[recruiter] = { apps: 0, offers: 0, joined: 0, offerDrops: 0 }
    recruiterMap[recruiter].apps++

    const isJoin      = matchStatus(status, STATUS_PATTERNS.joined)
    const isOfferDrop = matchStatus(status, STATUS_PATTERNS.offerDrop)
    const isOffer     = !isJoin && !isOfferDrop && matchStatus(status, STATUS_PATTERNS.offer)
    const isDrop      = !isJoin && !isOffer && !isOfferDrop && matchStatus(status, STATUS_PATTERNS.dropped)
    const isR1        = matchStatus(status, STATUS_PATTERNS.r1Reject)
    const isR2        = matchStatus(status, STATUS_PATTERNS.r2Reject)
    const isNoShow    = matchStatus(status, STATUS_PATTERNS.noShow)
    const isScreenReject = !isR1 && !isR2 && matchStatus(status, STATUS_PATTERNS.screenReject)

    const isShort     = matchStatus(status, STATUS_PATTERNS.shortlisted) || isOffer || isJoin || isOfferDrop || isR1 || isR2 || isNoShow
    const isInterview = matchStatus(status, STATUS_PATTERNS.interview) || isOffer || isJoin || isOfferDrop || isR1 || isR2

    if (isDrop || isR1 || isR2 || isScreenReject || isOfferDrop) {
      const reason = (row[reasonKey] || '').trim()
      if (reason && reason !== '-' && reason.toLowerCase() !== 'na' && reason.length > 2) {
        if (isOfferDrop) {
          offerDropReasonMap[reason] = (offerDropReasonMap[reason] || 0) + 1
        } else {
          rejectReasonMap[reason] = (rejectReasonMap[reason] || 0) + 1
        }
      }
    }

    if (isJoin) {
      joined++; shortlisted++; interviewed++; offered++
      sourceMap[source].joined++
      buMap[bu].joined++
      posMap[position].joined++
      recruiterMap[recruiter].joined++
      recruiterMap[recruiter].offers++
      quarterMap[quarter].joined++

      const appDate = parseDate(dateStr)
      const joinDate = parseDate(row[joinDateKey] || '')
      if (appDate && joinDate && joinDate > appDate) {
        const diffMs = joinDate.getTime() - appDate.getTime()
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays > 0 && diffDays < 365) {
          timeToFillDays.push(diffDays)
          if (!timeToFillByBUMap[bu]) timeToFillByBUMap[bu] = []
          timeToFillByBUMap[bu].push(diffDays)
        }
      }
    } else if (isOfferDrop) {
      offerDrops++; offered++; shortlisted++; interviewed++
      recruiterMap[recruiter].offers++
      recruiterMap[recruiter].offerDrops++
    } else if (isOffer) {
      offered++; shortlisted++; interviewed++
      recruiterMap[recruiter].offers++
    } else if (isDrop) {
      candidateDrops++
      if (isShort) shortlisted++
      if (isInterview) interviewed++
    } else if (isR1) {
      r1Rejects++; shortlisted++; interviewed++
    } else if (isR2) {
      r2Rejects++; shortlisted++; interviewed++
    } else if (isNoShow) {
      noShows++; shortlisted++
    } else if (isScreenReject) {
      screenRejects++
    } else if (isShort) {
      shortlisted++
    }
  }

  // Process vacancies
  const vacs = vacancies.filter(r => Object.values(r).some(v => v !== ''))
  const vacSample = vacs[0] || {}
  const vacKeys = Object.keys(vacSample)
  const vacStatusKey = findCol(vacKeys, VACANCY_COLUMN_CANDIDATES.status)
  const vacBUKey     = findCol(vacKeys, VACANCY_COLUMN_CANDIDATES.businessUnit)

  const totalVacancies = vacs.length
  let filledVacancies = 0, onHoldVacancies = 0, inProcessVacancies = 0
  const vacBUMap: Record<string, { total: number; filled: number; onHold: number; inProcess: number }> = {}

  for (const row of vacs) {
    const status = (row[vacStatusKey] || '').trim().toLowerCase()
    const bu = (row[vacBUKey] || 'Unknown').trim() || 'Unknown'
    if (!vacBUMap[bu]) vacBUMap[bu] = { total: 0, filled: 0, onHold: 0, inProcess: 0 }
    vacBUMap[bu].total++

    if (matchStatus(status, VACANCY_PATTERNS.filled)) {
      filledVacancies++; vacBUMap[bu].filled++
    } else if (matchStatus(status, VACANCY_PATTERNS.onHold)) {
      onHoldVacancies++; vacBUMap[bu].onHold++
    } else {
      inProcessVacancies++; vacBUMap[bu].inProcess++
    }
  }

  // Compute KPIs
  const offersExtended = offered
  const hiringRate = totalApplicants > 0 ? (joined / totalApplicants) * 100 : 0
  const offerDropRate = offered > 0 ? (offerDrops / offered) * 100 : 0
  const offerAcceptanceRate = offered > 0 ? (joined / offered) * 100 : 0
  const fillRate = totalVacancies > 0
    ? ((filledVacancies / totalVacancies) * 100 > 0 ? (filledVacancies / totalVacancies) * 100 : (joined / totalVacancies) * 100)
    : 0

  const avgTimeToFill = timeToFillDays.length > 0
    ? Math.round(timeToFillDays.reduce((a, b) => a + b, 0) / timeToFillDays.length)
    : null

  const sourceEfficiency = Object.entries(sourceMap)
    .map(([source, d]) => ({ source, total: d.total, joined: d.joined, rate: d.total > 0 ? (d.joined / d.total) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)

  const buPerformance = Object.entries(buMap)
    .map(([bu, d]) => ({ bu, total: d.total, joined: d.joined, rate: d.total > 0 ? (d.joined / d.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)

  const quarterlyTrend = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({
    quarter: q,
    applicants: quarterMap[q]?.applicants || 0,
    joined: quarterMap[q]?.joined || 0,
  }))

  const recruiterPerformance = Object.entries(recruiterMap)
    .filter(([name]) => name !== 'Unknown')
    .map(([recruiter, d]) => ({
      recruiter,
      applications: d.apps,
      offers: d.offers,
      joined: d.joined,
      convRate: d.apps > 0 ? (d.joined / d.apps) * 100 : 0,
      offerDropRate: d.offers > 0 ? (d.offerDrops / d.offers) * 100 : 0,
    }))
    .sort((a, b) => b.joined - a.joined)

  const topPositions = Object.entries(posMap)
    .filter(([p]) => p !== 'Unknown')
    .map(([position, d]) => ({ position, apps: d.apps, joined: d.joined }))
    .sort((a, b) => b.apps - a.apps)
    .slice(0, TOP_POSITIONS_LIMIT)

  const topRejectionReasons = Object.entries(rejectReasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const topOfferDropReasons = Object.entries(offerDropReasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const vacancyByBU = Object.entries(vacBUMap)
    .filter(([bu]) => bu !== 'Unknown')
    .map(([bu, d]) => ({ bu, ...d }))
    .sort((a, b) => b.total - a.total)

  const timeToFillByBU = Object.entries(timeToFillByBUMap)
    .filter(([bu]) => bu !== 'Unknown')
    .map(([bu, days]) => ({ bu, avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length) }))
    .sort((a, b) => b.avgDays - a.avgDays)

  return {
    kpis: {
      totalApplicants, joined, hiringRate, offersExtended, offerDropRate,
      offerAcceptanceRate, candidateDrops, screenRejects,
      totalVacancies, filledVacancies, onHoldVacancies, inProcessVacancies,
      fillRate, avgTimeToFill,
    },
    funnel: { applied: totalApplicants, shortlisted, interviewed, offered, joined },
    sourceEfficiency,
    buPerformance,
    topRejectionReasons,
    leakage: { candidateDrops, r1Rejects, r2Rejects, noShows, offerDrops, screenRejects },
    quarterlyTrend,
    recruiterPerformance,
    topPositions,
    vacancyByBU,
    topOfferDropReasons,
    timeToFillByBU,
    lastUpdated: new Date().toISOString(),
  }
}

// ─── Vercel Serverless Function Handler ──────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=300')

  try {
    const applicantsUrl = (req.query['applicants'] as string) || DEFAULT_APPLICANTS_URL
    const vacanciesUrl = (req.query['vacancies'] as string) || DEFAULT_VACANCIES_URL

    const [appsRes, vacsRes] = await Promise.all([
      fetch(applicantsUrl),
      fetch(vacanciesUrl),
    ])

    if (!appsRes.ok || !vacsRes.ok) {
      return res.status(502).json({
        error: 'Failed to fetch CSV data',
        applicantsStatus: appsRes.status,
        vacanciesStatus: vacsRes.status,
      })
    }

    const [appsText, vacsText] = await Promise.all([appsRes.text(), vacsRes.text()])
    const applicants = parseCSV(appsText)
    const vacancies = parseCSV(vacsText)
    const data = computeDashboard(applicants, vacancies)

    return res.status(200).json(data)
  } catch (err) {
    console.error('dashboard-data error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
