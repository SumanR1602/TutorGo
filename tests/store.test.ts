/**
 * Exercises the real zustand persist path: v1 data sitting in localStorage,
 * rehydrated and migrated by the store itself. This is the code that runs
 * against existing installs, so it gets tested rather than assumed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORE_KEY = 'tutorspad-store'

/** Minimal synchronous localStorage, which is all zustand/persist needs. */
function installFakeStorage(seed?: string) {
  const map = new Map<string, string>()
  if (seed) map.set(STORE_KEY, seed)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  })
  return map
}

/** Exactly what store v1 wrote: no version field, no anchors, no breaks. */
const V1_PAYLOAD = JSON.stringify({
  state: {
    students: [{
      id: 'stu-1',
      name: 'Sukhjinder',
      city: 'Ludhiana',
      timezone: 'Asia/Kolkata',
      ratePerHour: 5000,
      rateType: 'monthly',
      currency: 'INR',
      color: '#6366f1',
      createdAt: '2026-05-15T09:00:00.000Z',
    }],
    sessions: [
      { id: 's1', studentId: 'stu-1', date: '2026-05-20', hours: 1, type: 'regular', note: '', createdAt: '' },
      { id: 's2', studentId: 'stu-1', date: '2026-06-10', hours: 1, type: 'regular', note: '', createdAt: '' },
    ],
    payments: [
      { id: 'p1', studentId: 'stu-1', date: '2026-05-15', amount: 5000, note: '', createdAt: '' },
    ],
    settings: {
      teacherName: 'Suman', teacherTimezone: 'Asia/Kolkata',
      dailyReminderTime: '20:00', reminderEnabled: false,
      currency: 'INR', onboardingCompleted: true,
    },
  },
  version: 0,
})

async function freshStore(seed?: string) {
  installFakeStorage(seed)
  vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` })
  vi.resetModules()
  return (await import('@store/useStore')).default
}

beforeEach(() => vi.unstubAllGlobals())

describe('rehydrating a v1 install', () => {
  it('backfills anchors and the breaks list without losing data', async () => {
    const store = await freshStore(V1_PAYLOAD)
    const s = store.getState()

    expect(s.students).toHaveLength(1)
    expect(s.sessions).toHaveLength(2)
    expect(s.payments).toHaveLength(1)
    expect(s.breaks).toEqual([])
    expect(s.settings.teacherName).toBe('Suman')

    expect(s.students[0].billingAnchorDate).toBe('2026-05-15')
    expect(s.students[0].rateHistory).toEqual([
      { effectiveFrom: '2026-05-15', ratePerHour: 5000, rateType: 'monthly' },
    ])
  })

  it('bills the migrated student by cycle, not by calendar month', async () => {
    const store = await freshStore(V1_PAYLOAD)

    // Pin the clock: the ledger counts cycles elapsed up to today, so without
    // this the expected count would drift with the real date.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T06:00:00.000Z'))
    try {
      const ledger = store.getState().getLedger('stu-1')

      // Both sessions sit inside 15 May → 14 Jun, so it is one cycle, not two.
      expect(ledger.cycles).toHaveLength(1)
      expect(ledger.cycles[0].end).toBe('2026-06-14')
      expect(ledger.totalDue).toBe(5000)
      expect(ledger.balance).toBe(0)     // ₹5,000 pending before the fix
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts clean when there is nothing stored', async () => {
    const store = await freshStore()
    const s = store.getState()
    expect(s.students).toEqual([])
    expect(s.breaks).toEqual([])
    expect(s.getLedger('nope')).toEqual({
      cycles: [], totalDue: 0, totalPaid: 0, balance: 0, credit: 0, unbilled: [],
    })
  })
})

describe('store actions', () => {
  it('records a rate change as history instead of overwriting it', async () => {
    const store = await freshStore(V1_PAYLOAD)
    store.getState().updateStudent('stu-1', { ratePerHour: 6000 })

    const s = store.getState().getStudentById('stu-1')!
    expect(s.ratePerHour).toBe(6000)
    expect(s.rateHistory).toHaveLength(2)
    expect(s.rateHistory[0]).toEqual({
      effectiveFrom: '2026-05-15', ratePerHour: 5000, rateType: 'monthly',
    })
    expect(s.rateHistory[1].ratePerHour).toBe(6000)
  })

  it('leaves history alone when the rate is untouched', async () => {
    const store = await freshStore(V1_PAYLOAD)
    store.getState().updateStudent('stu-1', { city: 'Amritsar' })
    expect(store.getState().getStudentById('stu-1')!.rateHistory).toHaveLength(1)
  })

  it('adds a break and extends the cycle', async () => {
    const store = await freshStore(V1_PAYLOAD)
    const before = store.getState().getLedger('stu-1').cycles[0].end

    store.getState().addBreak({
      studentId: 'stu-1', startDate: '2026-05-21', endDate: '2026-05-31', reason: 'Exams',
    })
    const after = store.getState().getLedger('stu-1').cycles[0]

    expect(before).toBe('2026-06-14')
    expect(after.end).toBe('2026-06-25')   // pushed out 11 days
    expect(after.breakDays).toBe(11)
  })

  it('removes a students breaks along with the student', async () => {
    const store = await freshStore(V1_PAYLOAD)
    store.getState().addBreak({
      studentId: 'stu-1', startDate: '2026-07-01', endDate: '2026-07-05', reason: '',
    })
    expect(store.getState().breaks).toHaveLength(1)

    store.getState().deleteStudent('stu-1')
    expect(store.getState().breaks).toEqual([])
    expect(store.getState().sessions).toEqual([])
    expect(store.getState().payments).toEqual([])
  })

  it('migrates students arriving through a restored backup', async () => {
    const store = await freshStore()
    store.getState().restoreBackup(
      [{
        id: 'x1', name: 'Aarti', city: '', timezone: 'Asia/Kolkata',
        ratePerHour: 4000, rateType: 'monthly', currency: 'INR', color: '#000',
        createdAt: '2026-03-08T00:00:00.000Z',
      } as never],
      [{ id: 's9', studentId: 'x1', date: '2026-03-05', hours: 1, type: 'regular', note: '', createdAt: '' }],
      [],
    )
    // Teaching started before the record existed, so the anchor moves back.
    expect(store.getState().students[0].billingAnchorDate).toBe('2026-03-05')
  })
})
