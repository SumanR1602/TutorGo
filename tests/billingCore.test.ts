import { describe, it, expect } from 'vitest'
import {
  getBillingCycles, getStudentLedger, allocatePayments,
  normalizeBreaks, getRateAt, getEarningsForMonth, findCycleForDate, isOnBreak,
} from '@utils/billingCore'
import { daysInclusive } from '@utils/date'
import { student, session, payment, brk } from './factories'

/** Compact [start, end] pairs for readable assertions. */
const spans = (cycles: { start: string; end: string }[]) =>
  cycles.map((c) => [c.start, c.end])

// ───────────────────────────────────────────────────────────────────────────
describe('cycle boundaries — no breaks', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('runs 15 Jul → 14 Aug, then 15 Aug → 14 Sep', () => {
    const cycles = getBillingCycles(s, [], [], '2026-10-01')
    expect(spans(cycles).slice(0, 3)).toEqual([
      ['2026-07-15', '2026-08-14'],
      ['2026-08-15', '2026-09-14'],
      ['2026-09-15', '2026-10-14'],
    ])
  })

  it('leaves no gap or overlap between consecutive cycles', () => {
    const cycles = getBillingCycles(s, [], [], '2027-02-01')
    for (let i = 1; i < cycles.length; i++) {
      expect(daysInclusive(cycles[i - 1].end, cycles[i].start)).toBe(2) // end, then next start
    }
  })

  it('generates nothing before the anchor arrives', () => {
    expect(getBillingCycles(s, [], [], '2026-07-01')).toEqual([])
  })

  it('starts exactly one cycle on the anchor date itself', () => {
    expect(getBillingCycles(s, [], [], '2026-07-15')).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('holiday extension — the drift rule', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('pushes the cycle end forward by the holiday length', () => {
    // Sukhjinder: onboarded 15 Jul, away 20–30 Jul (11 days).
    const breaks = [brk('2026-07-20', '2026-07-30')]
    const cycles = getBillingCycles(s, [], breaks, '2026-12-01')

    expect(cycles[0].start).toBe('2026-07-15')
    expect(cycles[0].nominalEnd).toBe('2026-08-14')
    expect(cycles[0].end).toBe('2026-08-25')
    expect(cycles[0].breakDays).toBe(11)
  })

  it('drifts every later cycle by the same amount', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    const cycles = getBillingCycles(s, [], breaks, '2026-12-01')
    expect(spans(cycles).slice(0, 3)).toEqual([
      ['2026-07-15', '2026-08-25'],
      ['2026-08-26', '2026-09-25'],
      ['2026-09-26', '2026-10-25'],
    ])
  })

  it('still charges exactly one fee per cycle after extending', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    const ledger = getStudentLedger(s, [], [], breaks, '2026-08-20')
    expect(ledger.cycles).toHaveLength(1)
    expect(ledger.totalDue).toBe(5000)
  })

  it('always leaves exactly one month of teaching days per cycle', () => {
    const breaks = [brk('2026-07-20', '2026-07-30'), brk('2026-09-01', '2026-09-05')]
    const cycles = getBillingCycles(s, [], breaks, '2027-01-01')
    for (const c of cycles) {
      const teachingDays = daysInclusive(c.start, c.end) - c.breakDays
      expect(teachingDays).toBe(daysInclusive(c.start, c.nominalEnd) - 0)
    }
  })

  it('absorbs a break that straddles the cycle boundary, in full', () => {
    // 10–20 Aug straddles the 14 Aug end; extending pulls the rest in too.
    const breaks = [brk('2026-08-10', '2026-08-20')]
    const cycles = getBillingCycles(s, [], breaks, '2026-12-01')
    expect(cycles[0].end).toBe('2026-08-25')
    expect(cycles[0].breakDays).toBe(11)
    expect(cycles[1].start).toBe('2026-08-26')
  })

  it('handles a break longer than a whole cycle', () => {
    const breaks = [brk('2026-07-15', '2026-09-30')] // 78 days
    const cycles = getBillingCycles(s, [], breaks, '2026-12-01')
    expect(cycles[0].end).toBe('2026-10-31')
    expect(cycles[0].breakDays).toBe(78)
    // One fee still buys 31 teaching days.
    expect(daysInclusive(cycles[0].start, cycles[0].end) - 78).toBe(31)
  })

  it('counts a day covered by two overlapping breaks only once', () => {
    const breaks = [brk('2026-07-20', '2026-07-25'), brk('2026-07-23', '2026-07-28')]
    const cycles = getBillingCycles(s, [], breaks, '2026-12-01')
    expect(cycles[0].breakDays).toBe(9)   // 20–28, not 6 + 6
  })

  it('ignores breaks belonging to another student', () => {
    const breaks = [brk('2026-07-20', '2026-07-30', { studentId: 'someone-else' })]
    expect(getBillingCycles(s, [], breaks, '2026-12-01')[0].end).toBe('2026-08-14')
  })
})

describe('normalizeBreaks', () => {
  it('merges overlapping and adjacent ranges', () => {
    const merged = normalizeBreaks([
      brk('2026-07-23', '2026-07-28'),
      brk('2026-07-20', '2026-07-25'),
      brk('2026-07-29', '2026-07-31'),   // adjacent — merges
      brk('2026-08-10', '2026-08-12'),   // separate
    ])
    expect(merged.map((b) => [b.startDate, b.endDate])).toEqual([
      ['2026-07-20', '2026-07-31'],
      ['2026-08-10', '2026-08-12'],
    ])
  })

  it('drops malformed ranges rather than counting them backwards', () => {
    expect(normalizeBreaks([brk('2026-07-30', '2026-07-20')])).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('payment date does not decide what a payment settles', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })
  const breaks = [brk('2026-07-20', '2026-07-30')]  // cycle 1 → 25 Aug
  const today = '2026-09-01'

  const paidOn = (date: string) =>
    getStudentLedger(s, [], [payment(date, 5000)], breaks, today)

  it('settles cycle 1 whether paid up front, at the end, or late', () => {
    for (const date of ['2026-07-15', '2026-08-14', '2026-08-25', '2026-08-28']) {
      const ledger = paidOn(date)
      expect(ledger.cycles[0].paid).toBe(5000)
      expect(ledger.cycles[0].balance).toBe(0)
    }
  })

  it('produces identical books for advance and arrears payment', () => {
    const advance = paidOn('2026-07-15')
    const arrears = paidOn('2026-08-25')
    expect(advance.cycles.map((c) => c.balance)).toEqual(arrears.cycles.map((c) => c.balance))
    expect(advance.balance).toBe(arrears.balance)
  })
})

describe('FIFO allocation', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('clears the oldest cycle first with a single lump payment', () => {
    const ledger = getStudentLedger(s, [], [payment('2026-08-20', 10_000)], [], '2026-09-01')
    expect(ledger.cycles.map((c) => [c.paid, c.balance])).toEqual([
      [5000, 0],
      [5000, 0],
    ])
    expect(ledger.balance).toBe(0)
    expect(ledger.credit).toBe(0)
  })

  it('leaves the newer cycle pending when only one month is paid', () => {
    const ledger = getStudentLedger(s, [], [payment('2026-08-20', 5000)], [], '2026-09-01')
    expect(ledger.cycles[0].balance).toBe(0)
    expect(ledger.cycles[1].balance).toBe(5000)
    expect(ledger.balance).toBe(5000)
  })

  it('records a partial payment against the cycle it lands on', () => {
    const ledger = getStudentLedger(s, [], [payment('2026-07-18', 3000)], [], '2026-08-01')
    expect(ledger.cycles[0].paid).toBe(3000)
    expect(ledger.cycles[0].balance).toBe(2000)
    expect(ledger.balance).toBe(2000)
  })

  it('holds an overpayment as credit, then spends it when the next cycle starts', () => {
    const early = getStudentLedger(s, [], [payment('2026-07-15', 12_000)], [], '2026-08-01')
    expect(early.totalDue).toBe(5000)
    expect(early.credit).toBe(7000)
    expect(early.balance).toBe(0)

    const later = getStudentLedger(s, [], [payment('2026-07-15', 12_000)], [], '2026-09-01')
    expect(later.cycles.map((c) => c.paid)).toEqual([5000, 5000])
    expect(later.credit).toBe(2000)
    expect(later.balance).toBe(0)
  })

  it('keeps spending the credit into each cycle as it starts', () => {
    // By 20 Sep a third cycle has begun, so the leftover ₹2,000 lands on it
    // and ₹3,000 of that cycle is still owed.
    const ledger = getStudentLedger(s, [], [payment('2026-07-15', 12_000)], [], '2026-09-20')
    expect(ledger.cycles.map((c) => c.paid)).toEqual([5000, 5000, 2000])
    expect(ledger.credit).toBe(0)
    expect(ledger.balance).toBe(3000)
  })

  it('never reports a negative balance', () => {
    const ledger = getStudentLedger(s, [], [payment('2026-07-15', 99_000)], [], '2026-08-01')
    expect(ledger.balance).toBe(0)
    expect(ledger.credit).toBe(94_000)
  })

  it('splits many small payments across cycles without losing paise', () => {
    const pays = [
      payment('2026-07-20', 1200.55),
      payment('2026-08-02', 3799.45),
      payment('2026-08-20', 2000),
    ]
    const ledger = getStudentLedger(s, [], pays, [], '2026-09-01')
    expect(ledger.cycles[0].paid).toBe(5000)
    expect(ledger.cycles[1].paid).toBe(2000)
    expect(ledger.totalPaid).toBe(7000)
    expect(ledger.balance).toBe(3000)
  })
})

describe('allocatePayments in isolation', () => {
  it('does not charge a cycle that has not started yet', () => {
    const base = getBillingCycles(student(), [], [], '2026-07-20')
    const future = [...base, { ...base[0], key: 'future', started: false, index: 2 }]
    const { cycles, credit } = allocatePayments(future, [payment('2026-07-20', 10_000)])
    expect(cycles[1].paid).toBe(0)
    expect(credit).toBe(5000)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('the original bug — regression guards', () => {
  const s = student({ billingAnchorDate: '2026-05-15', ratePerHour: 5000 })

  it('does not raise a second fee for a class inside the paid cycle', () => {
    // The reported bug: a class on 10 Jun opened a "June" charge even though
    // the cycle paid for on 15 May runs to 14 Jun.
    const sessions = [session('2026-05-20'), session('2026-05-27'), session('2026-06-10')]
    const ledger = getStudentLedger(s, sessions, [payment('2026-05-15', 5000)], [], '2026-06-12')

    expect(ledger.cycles).toHaveLength(1)
    expect(ledger.totalDue).toBe(5000)
    expect(ledger.balance).toBe(0)
  })

  it('charges exactly one fee once the next cycle genuinely starts', () => {
    const sessions = [session('2026-06-10'), session('2026-06-20')]
    const ledger = getStudentLedger(s, sessions, [payment('2026-05-15', 5000)], [], '2026-06-20')
    expect(ledger.totalDue).toBe(10_000)
    expect(ledger.balance).toBe(5000)
  })

  it('does not let a payment invent a charge', () => {
    // Money received before the first cycle begins is credit, not revenue.
    const future = student({ billingAnchorDate: '2026-08-01' })
    const ledger = getStudentLedger(future, [], [payment('2026-07-20', 5000)], [], '2026-07-20')
    expect(ledger.cycles).toEqual([])
    expect(ledger.totalDue).toBe(0)
    expect(ledger.credit).toBe(5000)
    expect(ledger.balance).toBe(0)
  })

  it('bills by elapsed cycles, not by how many months contain a session', () => {
    // One class in each of three calendar months, all inside two cycles.
    const sessions = [session('2026-05-16'), session('2026-06-10'), session('2026-06-16')]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-06-20')
    expect(ledger.cycles).toHaveLength(2)
    expect(ledger.totalDue).toBe(10_000)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('month-end anchors', () => {
  it('clamps February but recovers the 31st afterwards', () => {
    const s = student({ billingAnchorDate: '2026-01-31' })
    const cycles = getBillingCycles(s, [], [], '2026-06-01')
    expect(spans(cycles).slice(0, 4)).toEqual([
      ['2026-01-31', '2026-02-27'],
      ['2026-02-28', '2026-03-30'],
      ['2026-03-31', '2026-04-29'],
      ['2026-04-30', '2026-05-30'],
    ])
  })

  it('handles a 29 Feb anchor in a leap year', () => {
    const s = student({ billingAnchorDate: '2024-02-29' })
    const cycles = getBillingCycles(s, [], [], '2024-06-01')
    expect(spans(cycles).slice(0, 2)).toEqual([
      ['2024-02-29', '2024-03-28'],
      ['2024-03-29', '2024-04-28'],
    ])
  })

  it('handles a 30th anchor across February', () => {
    const s = student({ billingAnchorDate: '2026-01-30' })
    const cycles = getBillingCycles(s, [], [], '2026-05-01')
    expect(spans(cycles).slice(0, 3)).toEqual([
      ['2026-01-30', '2026-02-27'],
      ['2026-02-28', '2026-03-29'],
      ['2026-03-30', '2026-04-29'],
    ])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('extra classes billed on top', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('adds the amount set on the extra session to that cycle', () => {
    const sessions = [
      session('2026-07-20'),
      session('2026-07-22', { type: 'extra', extraAmount: 800 }),
    ]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-01')
    expect(ledger.cycles[0].baseAmount).toBe(5000)
    expect(ledger.cycles[0].extraAmount).toBe(800)
    expect(ledger.cycles[0].amount).toBe(5800)
    expect(ledger.totalDue).toBe(5800)
  })

  it('bills each extra into the cycle it actually falls in', () => {
    const sessions = [
      session('2026-07-20', { type: 'extra', extraAmount: 500 }),
      session('2026-08-20', { type: 'extra', extraAmount: 700 }),
    ]
    const cycles = getBillingCycles(s, sessions, [], '2026-09-01')
    expect(cycles[0].extraAmount).toBe(500)
    expect(cycles[1].extraAmount).toBe(700)
  })

  it('charges nothing extra when no amount was set', () => {
    const sessions = [session('2026-07-20', { type: 'extra' })]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-01')
    expect(ledger.cycles[0].extraAmount).toBe(0)
    expect(ledger.totalDue).toBe(5000)
  })

  it('lets an extra push a cycle beyond a full payment', () => {
    const sessions = [session('2026-07-22', { type: 'extra', extraAmount: 800 })]
    const ledger = getStudentLedger(s, sessions, [payment('2026-07-15', 5000)], [], '2026-08-01')
    expect(ledger.balance).toBe(800)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('pro-rated exit', () => {
  const s = (endDate: string) => student({ billingAnchorDate: '2026-07-15', endDate })

  it('charges only the days used when leaving mid-cycle', () => {
    // 15–24 Jul = 10 of 31 days.
    const ledger = getStudentLedger(s('2026-07-24'), [], [], [], '2026-09-01')
    expect(ledger.cycles).toHaveLength(1)
    expect(ledger.cycles[0].proRated).toBe(true)
    expect(ledger.cycles[0].baseAmount).toBe(1612.9)
  })

  it('refunds the unused part as credit', () => {
    const ledger = getStudentLedger(s('2026-07-24'), [], [payment('2026-07-15', 5000)], [], '2026-09-01')
    expect(ledger.balance).toBe(0)
    expect(ledger.credit).toBe(3387.1)
  })

  it('charges the full fee when leaving exactly on the cycle end', () => {
    const ledger = getStudentLedger(s('2026-08-14'), [], [], [], '2026-09-01')
    expect(ledger.cycles[0].proRated).toBe(false)
    expect(ledger.cycles[0].amount).toBe(5000)
  })

  it('stops generating cycles after the leave date', () => {
    const cycles = getBillingCycles(s('2026-08-20'), [], [], '2027-01-01')
    expect(cycles).toHaveLength(2)
    expect(cycles[1].proRated).toBe(true)
  })

  it('does not let a holiday dilute the pro-rata fraction', () => {
    // Away 16–20 Jul, leaves 24 Jul: 5 of the 10 elapsed days were a break,
    // so only 5 teaching days are charged out of 31.
    const breaks = [brk('2026-07-16', '2026-07-20')]
    const ledger = getStudentLedger(s('2026-07-24'), [], [], breaks, '2026-09-01')
    expect(ledger.cycles[0].baseAmount).toBe(806.45)  // 5000 × 5/31
  })

  it('still bills extras taken before leaving', () => {
    const sessions = [session('2026-07-20', { type: 'extra', extraAmount: 600 })]
    const ledger = getStudentLedger(s('2026-07-24'), sessions, [], [], '2026-09-01')
    expect(ledger.cycles[0].amount).toBe(2212.9)  // 1612.90 + 600
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('rate history', () => {
  const s = student({
    billingAnchorDate: '2026-07-15',
    ratePerHour: 6000,
    rateHistory: [
      { effectiveFrom: '2026-07-15', ratePerHour: 5000, rateType: 'monthly' },
      { effectiveFrom: '2026-09-15', ratePerHour: 6000, rateType: 'monthly' },
    ],
  })

  it('prices each cycle with the rate in force on its start date', () => {
    const cycles = getBillingCycles(s, [], [], '2026-11-01')
    expect(cycles.map((c) => c.amount)).toEqual([5000, 5000, 6000, 6000])
  })

  it('does not re-price cycles that already closed', () => {
    const ledger = getStudentLedger(s, [], [payment('2026-07-15', 5000)], [], '2026-11-01')
    expect(ledger.cycles[0].amount).toBe(5000)
    expect(ledger.cycles[0].balance).toBe(0)
  })

  it('falls back to the flat rate for records with no history', () => {
    const legacy = student({ billingAnchorDate: '2026-07-15', ratePerHour: 4000 })
    delete (legacy as { rateHistory?: unknown }).rateHistory
    expect(getRateAt(legacy, '2026-08-01').ratePerHour).toBe(4000)
    expect(getBillingCycles(legacy, [], [], '2026-08-01')[0].amount).toBe(4000)
  })

  it('uses the earliest entry for dates before any change', () => {
    expect(getRateAt(s, '2020-01-01').ratePerHour).toBe(5000)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('hourly students are unaffected', () => {
  const s = student({ rateType: 'hourly', ratePerHour: 500, billingAnchorDate: '2026-07-01' })

  it('bills hours × rate, grouped by calendar month', () => {
    const sessions = [
      session('2026-07-03', { hours: 2 }),
      session('2026-07-10', { hours: 1 }),
      session('2026-08-05', { hours: 1.5 }),
    ]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-09-01')
    expect(ledger.cycles.map((c) => [c.key, c.amount])).toEqual([
      ['2026-07', 1500],
      ['2026-08', 750],
    ])
    expect(ledger.totalDue).toBe(2250)
  })

  it('produces no cycles when nothing was taught', () => {
    expect(getBillingCycles(s, [], [], '2026-09-01')).toEqual([])
  })

  it('honours an explicit amount on an extra session', () => {
    const sessions = [
      session('2026-07-03', { hours: 2 }),
      session('2026-07-11', { hours: 1, type: 'extra', extraAmount: 900 }),
    ]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-01')
    expect(ledger.cycles[0].baseAmount).toBe(1000)
    expect(ledger.cycles[0].extraAmount).toBe(900)
    expect(ledger.totalDue).toBe(1900)
  })

  it('bills an extra with no amount as ordinary hours', () => {
    const sessions = [session('2026-07-11', { hours: 2, type: 'extra' })]
    expect(getStudentLedger(s, sessions, [], [], '2026-08-01').totalDue).toBe(1000)
  })

  it('handles fractional hours without float drift', () => {
    const sessions = Array.from({ length: 3 }, (_, i) =>
      session(`2026-07-0${i + 1}`, { hours: 0.1 }),
    )
    expect(getStudentLedger(s, sessions, [], [], '2026-08-01').totalDue).toBe(150)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('derived-not-stored: edits re-flow the timeline', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('recomputes past cycles when a holiday is logged retroactively', () => {
    const before = getBillingCycles(s, [], [], '2026-10-01')
    const after = getBillingCycles(s, [], [brk('2026-07-20', '2026-07-30')], '2026-10-01')
    expect(before[1].start).toBe('2026-08-15')
    expect(after[1].start).toBe('2026-08-26')   // whole timeline shifted
  })

  it('drops a cycle when a retroactive break pushes it past today', () => {
    expect(getBillingCycles(s, [], [], '2026-08-20')).toHaveLength(2)
    expect(getBillingCycles(s, [], [brk('2026-07-20', '2026-07-30')], '2026-08-20')).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('reporting helpers', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('recognises a straddling cycle in the month it starts', () => {
    // 15 Jul → 14 Aug is July revenue, not split across two months.
    expect(getEarningsForMonth(s, [], [], '2026-07', '2026-09-01')).toBe(5000)
    expect(getEarningsForMonth(s, [], [], '2026-08', '2026-09-01')).toBe(5000)
    expect(getEarningsForMonth(s, [], [], '2026-09', '2026-09-01')).toBe(0)
  })

  it('finds the cycle containing a date', () => {
    const cycles = getBillingCycles(s, [], [], '2026-10-01')
    expect(findCycleForDate(cycles, '2026-08-10')?.index).toBe(1)
    expect(findCycleForDate(cycles, '2026-08-15')?.index).toBe(2)
    expect(findCycleForDate(cycles, '2026-01-01')).toBeUndefined()
  })

  it('detects dates inside a declared break', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    expect(isOnBreak(breaks, 'stu-1', '2026-07-25')).toBe(true)
    expect(isOnBreak(breaks, 'stu-1', '2026-07-31')).toBe(false)
    expect(isOnBreak(breaks, 'other', '2026-07-25')).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('robustness', () => {
  it('ignores other students sessions and payments', () => {
    const s = student({ billingAnchorDate: '2026-07-15' })
    const ledger = getStudentLedger(
      s,
      [session('2026-07-20', { studentId: 'other', hours: 99 })],
      [payment('2026-07-20', 9999, { studentId: 'other' })],
      [],
      '2026-08-01',
    )
    expect(ledger.totalPaid).toBe(0)
    expect(ledger.balance).toBe(5000)
  })

  it('terminates on a very old anchor instead of looping forever', () => {
    const s = student({ billingAnchorDate: '2010-01-15' })
    const cycles = getBillingCycles(s, [], [], '2026-07-15')
    expect(cycles.length).toBeGreaterThan(190)
    expect(cycles[cycles.length - 1].end >= '2026-07-15').toBe(true)
  })

  it('handles a zero rate without producing NaN', () => {
    const s = student({ billingAnchorDate: '2026-07-15', ratePerHour: 0 })
    const ledger = getStudentLedger(s, [], [], [], '2026-08-01')
    expect(ledger.totalDue).toBe(0)
    expect(ledger.balance).toBe(0)
  })

  it('keeps money arithmetic exact to the paisa', () => {
    const s = student({ billingAnchorDate: '2026-07-15', ratePerHour: 3333.33 })
    const ledger = getStudentLedger(s, [], [payment('2026-07-15', 1111.11)], [], '2026-08-01')
    expect(ledger.cycles[0].balance).toBe(2222.22)
  })
})
