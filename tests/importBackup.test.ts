/**
 * The import path is how real data enters a fresh install, so it gets the
 * same scrutiny as the store migration.
 */
import { describe, it, expect } from 'vitest'
import { parseBackupJSON } from '@utils/storage'
import { getStudentLedger } from '@utils/billingCore'
import { migrateStudents } from '@utils/migrate'

/** Minimal stand-in for the browser File the picker hands us. */
const asFile = (obj: unknown) =>
  ({ text: async () => JSON.stringify(obj) } as unknown as File)

/** A backup exported by the OLD app: no version 2 fields anywhere. */
function v1Backup(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    exportedAt: '2026-08-01T00:00:00.000Z',
    students: [{
      id: 'stu-1', name: 'Sukhjinder', city: 'Ludhiana', timezone: 'Asia/Kolkata',
      ratePerHour: 5000, rateType: 'monthly', currency: 'INR', color: '#6366f1',
      createdAt: '2026-05-15T09:00:00.000Z',
    }],
    sessions: [
      { id: 's1', studentId: 'stu-1', date: '2026-05-20', hours: 1, type: 'regular', note: '', createdAt: '' },
      { id: 's2', studentId: 'stu-1', date: '2026-06-10', hours: 1, type: 'regular', note: '', createdAt: '' },
    ],
    payments: [
      { id: 'p1', studentId: 'stu-1', date: '2026-05-15', amount: 5000, note: 'UPI', createdAt: '' },
    ],
    ...over,
  }
}

describe('importing an old (v1) backup into a fresh install', () => {
  it('accepts it and defaults breaks to empty', async () => {
    const parsed = await parseBackupJSON(asFile(v1Backup()))
    expect(parsed.students).toHaveLength(1)
    expect(parsed.sessions).toHaveLength(2)
    expect(parsed.payments).toHaveLength(1)
    expect(parsed.breaks).toEqual([])
  })

  it('bills correctly once migrated, with no data loss', async () => {
    const parsed = await parseBackupJSON(asFile(v1Backup()))
    const students = migrateStudents(parsed.students, parsed.sessions)

    expect(students[0].billingAnchorDate).toBe('2026-05-15')
    const ledger = getStudentLedger(
      students[0], parsed.sessions, parsed.payments, parsed.breaks, '2026-06-12',
    )
    expect(ledger.cycles).toHaveLength(1)
    expect(ledger.totalDue).toBe(5000)
    expect(ledger.balance).toBe(0)
    expect(ledger.unbilled).toEqual([])
  })

  it('round-trips a v2 backup including breaks', async () => {
    const withBreaks = v1Backup({
      version: 2,
      breaks: [{
        id: 'b1', studentId: 'stu-1', startDate: '2026-07-01', endDate: '2026-07-10',
        reason: 'Exams', createdAt: '',
      }],
    })
    const parsed = await parseBackupJSON(asFile(withBreaks))
    expect(parsed.breaks).toHaveLength(1)
  })
})

describe('what the stricter validation now rejects', () => {
  const expectRejection = async (backup: unknown, match: RegExp) => {
    await expect(parseBackupJSON(asFile(backup))).rejects.toThrow(match)
  }

  it('rejects a zero-amount payment', async () => {
    await expectRejection(
      v1Backup({ payments: [{ id: 'p1', studentId: 'stu-1', date: '2026-05-15', amount: 0, note: '', createdAt: '' }] }),
      /greater than zero/,
    )
  })

  it('rejects a negative payment', async () => {
    await expectRejection(
      v1Backup({ payments: [{ id: 'p1', studentId: 'stu-1', date: '2026-05-15', amount: -500, note: '', createdAt: '' }] }),
      /greater than zero/,
    )
  })

  it('rejects a zero-hour session', async () => {
    await expectRejection(
      v1Backup({ sessions: [{ id: 's1', studentId: 'stu-1', date: '2026-05-20', hours: 0, type: 'regular', note: '', createdAt: '' }] }),
      /greater than zero/,
    )
  })

  it('rejects a zero rate', async () => {
    const b = v1Backup()
    b.students[0].ratePerHour = 0
    await expectRejection(b, /rate of 0/)
  })

  it('rejects a malformed date', async () => {
    await expectRejection(
      v1Backup({ sessions: [{ id: 's1', studentId: 'stu-1', date: '20-05-2026', hours: 1, type: 'regular', note: '', createdAt: '' }] }),
      /invalid date/,
    )
  })

  it('rejects duplicate ids', async () => {
    await expectRejection(
      v1Backup({ sessions: [
        { id: 's1', studentId: 'stu-1', date: '2026-05-20', hours: 1, type: 'regular', note: '', createdAt: '' },
        { id: 's1', studentId: 'stu-1', date: '2026-05-21', hours: 1, type: 'regular', note: '', createdAt: '' },
      ] }),
      /share the id/,
    )
  })

  it('rejects a session pointing at a missing student', async () => {
    await expectRejection(
      v1Backup({ sessions: [{ id: 's1', studentId: 'ghost', date: '2026-05-20', hours: 1, type: 'regular', note: '', createdAt: '' }] }),
      /unknown student/,
    )
  })

  it('rejects overlapping breaks for one student', async () => {
    await expectRejection(
      v1Backup({ breaks: [
        { id: 'b1', studentId: 'stu-1', startDate: '2026-07-14', endDate: '2026-07-20', reason: '', createdAt: '' },
        { id: 'b2', studentId: 'stu-1', startDate: '2026-07-15', endDate: '2026-07-18', reason: '', createdAt: '' },
      ] }),
      /Overlapping breaks/,
    )
  })

  it('rejects a file that is not JSON', async () => {
    const bad = { text: async () => 'not json at all' } as unknown as File
    await expect(parseBackupJSON(bad)).rejects.toThrow(/not valid JSON/)
  })
})
