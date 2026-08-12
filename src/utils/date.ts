/**
 * date.ts
 * Calendar helpers. Everything here works on plain "YYYY-MM-DD" strings and
 * never leans on the host timezone, because `new Date().toISOString()` is UTC
 * and silently returns *yesterday* for IST users between 00:00 and 05:30.
 */

import { TEACHER_TIMEZONE } from '@constants'

/** Today as "YYYY-MM-DD" in the teacher's timezone (not UTC). */
export function todayISO(tz: string = TEACHER_TIMEZONE): string {
  // "en-CA" formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

/** Current month as "YYYY-MM" in the teacher's timezone. */
export function currentYM(tz: string = TEACHER_TIMEZONE): string {
  return todayISO(tz).slice(0, 7)
}

/** Days in a given month. `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Parse "YYYY-MM-DD" into numeric parts. Throws on malformed input. */
function parts(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Invalid ISO date: "${iso}"`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** "YYYY-MM-DD" → days since epoch. Pure integer maths, no Date drift. */
export function toEpochDay(iso: string): number {
  const [y, m, d] = parts(iso)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Days since epoch → "YYYY-MM-DD". */
export function fromEpochDay(day: number): string {
  const dt = new Date(day * 86_400_000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shift an ISO date by N days (N may be negative). */
export function addDays(iso: string, n: number): string {
  return fromEpochDay(toEpochDay(iso) + n)
}

/**
 * Add N months, clamping the day to the target month's length.
 * The *original* day-of-month is preserved as the intent, so it recovers
 * whenever a later month is long enough:
 *   addMonthsClamped("2026-01-31", 1) → "2026-02-28"
 *   addMonthsClamped("2026-01-31", 2) → "2026-03-31"   (not the 28th)
 */
export function addMonthsClamped(iso: string, n: number): string {
  const [y, m, d] = parts(iso)
  const total = y * 12 + (m - 1) + n
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  const td = Math.min(d, daysInMonth(ty, tm))
  return `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`
}

/** Inclusive day count between two ISO dates. Same date → 1. */
export function daysInclusive(startIso: string, endIso: string): number {
  return toEpochDay(endIso) - toEpochDay(startIso) + 1
}

/** Days of [aStart, aEnd] that also fall inside [bStart, bEnd]. 0 if disjoint. */
export function overlapDays(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): number {
  const lo = Math.max(toEpochDay(aStart), toEpochDay(bStart))
  const hi = Math.min(toEpochDay(aEnd), toEpochDay(bEnd))
  return hi < lo ? 0 : hi - lo + 1
}

/** Min / max of two ISO dates. */
export const minIso = (a: string, b: string): string => (a <= b ? a : b)
export const maxIso = (a: string, b: string): string => (a >= b ? a : b)

/** "YYYY-MM-DD" → "DD/MM/YYYY" */
export function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "YYYY-MM-DD" → "15 Jul 2026" */
export function formatDayMonth(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = parts(iso)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
    month: 'short',
    timeZone: 'UTC',
  })
  return `${d} ${month} ${y}`
}

/** "YYYY-MM" → "May 2026" */
export function formatMonthLong(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "YYYY-MM" → "May '26" */
export function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}
