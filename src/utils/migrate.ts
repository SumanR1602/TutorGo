/**
 * migrate.ts
 * Backfills records written before billing cycles existed (store v1 → v2).
 *
 * Kept out of the store so it can be tested without a browser, and so the
 * rules for "where does an existing student's anchor come from" live in one
 * readable place.
 */
import type { Student, Session, RateChange } from '@/types'
import { DEFAULT_RATE_TYPE, DEFAULT_CURRENCY } from '@constants'
import { todayISO } from './date'

/**
 * Give a v1 student a billing anchor and a rate timeline.
 *
 * The anchor is the earlier of the join date and their first logged session:
 * sessions are sometimes back-dated past the day the record was created, and
 * billing must not start after teaching did.
 */
export function migrateStudent(raw: Student, sessions: Session[], today = todayISO()): Student {
  const joined = (raw.createdAt ?? '').slice(0, 10) || today
  const firstSession = sessions
    .filter((s) => s.studentId === raw.id)
    .map((s) => s.date)
    .sort()[0]

  const anchor = raw.billingAnchorDate
    ?? (firstSession && firstSession < joined ? firstSession : joined)

  const rateType = raw.rateType ?? DEFAULT_RATE_TYPE
  const ratePerHour = raw.ratePerHour ?? 0

  const rateHistory: RateChange[] = raw.rateHistory?.length
    ? [...raw.rateHistory].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    : [{ effectiveFrom: anchor, ratePerHour, rateType }]

  return {
    ...raw,
    currency: raw.currency ?? DEFAULT_CURRENCY,
    rateType,
    ratePerHour,
    billingAnchorDate: anchor,
    rateHistory,
  }
}

/** Apply {@link migrateStudent} across a whole roster. */
export function migrateStudents(
  students: Student[], sessions: Session[], today = todayISO(),
): Student[] {
  return students.map((s) => migrateStudent(s, sessions, today))
}
