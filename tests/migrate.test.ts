import { describe, it, expect } from 'vitest'
import { migrateStudent, migrateStudents } from '@utils/migrate'
import { getStudentLedger } from '@utils/billingCore'
import { session, payment } from './factories'
import type { Student } from '@/types'

/**
 * A student exactly as store v1 wrote it: no anchor, no rate history.
 * Cast because the v2 type now requires the fields migration adds.
 */
function legacyStudent(over: Partial<Student> = {}): Student {
  return {
    id: 'stu-1',
    name: 'Sukhjinder',
    city: 'Ludhiana',
    timezone: 'Asia/Kolkata',
    ratePerHour: 5000,
    rateType: 'monthly',
    currency: 'INR',
    color: '#6366f1',
    createdAt: '2026-07-15T09:30:00.000Z',
    ...over,
  } as Student
}

describe('v1 → v2 student migration', () => {
  it('anchors billing to the join date', () => {
    const m = migrateStudent(legacyStudent(), [])
    expect(m.billingAnchorDate).toBe('2026-07-15')
  })

  it('anchors to the first session when classes predate the record', () => {
    const sessions = [session('2026-07-02'), session('2026-07-20')]
    const m = migrateStudent(legacyStudent(), sessions)
    expect(m.billingAnchorDate).toBe('2026-07-02')
  })

  it('keeps the join date when the first session came later', () => {
    const m = migrateStudent(legacyStudent(), [session('2026-08-01')])
    expect(m.billingAnchorDate).toBe('2026-07-15')
  })

  it('ignores another students sessions when picking the anchor', () => {
    const sessions = [session('2026-01-01', { studentId: 'someone-else' })]
    expect(migrateStudent(legacyStudent(), sessions).billingAnchorDate).toBe('2026-07-15')
  })

  it('seeds a rate history from the flat rate', () => {
    const m = migrateStudent(legacyStudent(), [])
    expect(m.rateHistory).toEqual([
      { effectiveFrom: '2026-07-15', ratePerHour: 5000, rateType: 'monthly' },
    ])
  })

  it('never overwrites an anchor or history that already exists', () => {
    const already = legacyStudent({
      billingAnchorDate: '2026-06-01',
      rateHistory: [{ effectiveFrom: '2026-06-01', ratePerHour: 4000, rateType: 'monthly' }],
    })
    const m = migrateStudent(already, [session('2026-01-01')])
    expect(m.billingAnchorDate).toBe('2026-06-01')
    expect(m.rateHistory[0].ratePerHour).toBe(4000)
  })

  it('is idempotent — running it twice changes nothing', () => {
    const once  = migrateStudent(legacyStudent(), [session('2026-07-02')])
    const twice = migrateStudent(once, [session('2026-07-02')])
    expect(twice).toEqual(once)
  })

  it('fills in a missing currency and rate type', () => {
    const bare = legacyStudent({
      currency: undefined as unknown as string,
      rateType: undefined as unknown as 'monthly',
    })
    const m = migrateStudent(bare, [])
    expect(m.currency).toBe('INR')
    expect(m.rateType).toBe('hourly')      // DEFAULT_RATE_TYPE
  })

  it('falls back to today when createdAt is missing', () => {
    const bare = legacyStudent({ createdAt: undefined as unknown as string })
    expect(migrateStudent(bare, [], '2026-09-09').billingAnchorDate).toBe('2026-09-09')
  })

  it('migrates a whole roster', () => {
    const roster = [legacyStudent(), legacyStudent({ id: 'stu-2', name: 'Aarti' })]
    const out = migrateStudents(roster, [])
    expect(out.every((s) => s.billingAnchorDate && s.rateHistory.length)).toBe(true)
  })
})

describe('migrated data bills correctly', () => {
  it('reproduces the reported scenario end-to-end after migration', () => {
    // v1 record: joined 15 May, ₹5,000/mo, one payment, three classes
    // — the last of them inside the paid cycle.
    const legacy = legacyStudent({ createdAt: '2026-05-15T09:00:00.000Z' })
    const sessions = [session('2026-05-20'), session('2026-05-27'), session('2026-06-10')]
    const payments = [payment('2026-05-15', 5000)]

    const migrated = migrateStudent(legacy, sessions)
    const ledger = getStudentLedger(migrated, sessions, payments, [], '2026-06-12')

    expect(migrated.billingAnchorDate).toBe('2026-05-15')
    expect(ledger.cycles).toHaveLength(1)
    expect(ledger.cycles[0].start).toBe('2026-05-15')
    expect(ledger.cycles[0].end).toBe('2026-06-14')
    expect(ledger.totalDue).toBe(5000)
    expect(ledger.balance).toBe(0)          // was ₹5,000 pending before the fix
  })

  it('leaves a migrated hourly student billing exactly as before', () => {
    const legacy = legacyStudent({ rateType: 'hourly', ratePerHour: 500 })
    const sessions = [session('2026-07-03', { hours: 2 }), session('2026-07-10', { hours: 1 })]
    const migrated = migrateStudent(legacy, sessions)
    expect(getStudentLedger(migrated, sessions, [], [], '2026-08-01').totalDue).toBe(1500)
  })
})
