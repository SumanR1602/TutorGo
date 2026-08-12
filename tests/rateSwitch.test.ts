import { describe, it, expect } from 'vitest'
import {
  getBillingCycles, getStudentLedger, getRateSegments, getUnbilledSessions,
} from '@utils/billingCore'
import { student, session, payment, brk } from './factories'

const spans = (cs: { start: string; end: string }[]) => cs.map((c) => [c.start, c.end])

// ───────────────────────────────────────────────────────────────────────────
describe('rate-type segments', () => {
  it('is a single segment when the type never changes', () => {
    const s = student({ billingAnchorDate: '2026-05-15' })
    expect(getRateSegments(s, '2026-08-20')).toEqual([
      { start: '2026-05-15', end: '2026-08-20', rateType: 'monthly' },
    ])
  })

  it('does not split on a rate change that keeps the same type', () => {
    const s = student({
      billingAnchorDate: '2026-05-15',
      ratePerHour: 6000,
      rateHistory: [
        { effectiveFrom: '2026-05-15', ratePerHour: 5000, rateType: 'monthly' },
        { effectiveFrom: '2026-07-01', ratePerHour: 6000, rateType: 'monthly' },
      ],
    })
    expect(getRateSegments(s, '2026-08-20')).toHaveLength(1)
  })

  it('splits at a monthly → hourly switch', () => {
    const s = student({
      billingAnchorDate: '2026-05-15',
      rateType: 'hourly', ratePerHour: 500,
      rateHistory: [
        { effectiveFrom: '2026-05-15', ratePerHour: 5000, rateType: 'monthly' },
        { effectiveFrom: '2026-08-12', ratePerHour: 500, rateType: 'hourly' },
      ],
    })
    expect(getRateSegments(s, '2026-08-20')).toEqual([
      { start: '2026-05-15', end: '2026-08-11', rateType: 'monthly' },
      { start: '2026-08-12', end: '2026-08-20', rateType: 'hourly' },
    ])
  })

  it('stops segments at the leave date', () => {
    const s = student({ billingAnchorDate: '2026-05-15', endDate: '2026-06-30' })
    expect(getRateSegments(s, '2026-08-20')[0].end).toBe('2026-06-30')
  })

  it('is empty before the anchor arrives', () => {
    const s = student({ billingAnchorDate: '2027-01-01' })
    expect(getRateSegments(s, '2026-08-20')).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('monthly → hourly switch (the corruption bug)', () => {
  const s = student({
    billingAnchorDate: '2026-05-15',
    rateType: 'hourly', ratePerHour: 500,
    rateHistory: [
      { effectiveFrom: '2026-05-15', ratePerHour: 5000, rateType: 'monthly' },
      { effectiveFrom: '2026-08-12', ratePerHour: 500, rateType: 'hourly' },
    ],
  })
  const sessions = [
    session('2026-05-20', { hours: 2 }),
    session('2026-06-20', { hours: 2 }),
    session('2026-08-15', { hours: 3 }),   // after the switch
  ]

  it('keeps past monthly cycles at the monthly fee', () => {
    const cycles = getBillingCycles(s, sessions, [], '2026-08-20')
    const monthly = cycles.filter((c) => c.rateType === 'monthly')
    expect(monthly.map((c) => c.rate)).toEqual([5000, 5000, 5000])
    expect(monthly.slice(0, 2).map((c) => c.amount)).toEqual([5000, 5000])
  })

  it('pro-rates the monthly cycle the switch cut short', () => {
    const cycles = getBillingCycles(s, sessions, [], '2026-08-20')
    const monthly = cycles.filter((c) => c.rateType === 'monthly')
    const cut = monthly[monthly.length - 1]
    // 15 Jul → 11 Aug is 28 of the 31 days in 15 Jul → 14 Aug.
    expect(cut.start).toBe('2026-07-15')
    expect(cut.end).toBe('2026-08-11')
    expect(cut.proRated).toBe(true)
    expect(cut.amount).toBe(4516.13)      // 5000 × 28/31
  })

  it('bills post-switch time hourly at the hourly rate', () => {
    const cycles = getBillingCycles(s, sessions, [], '2026-08-20')
    const hourly = cycles.filter((c) => c.rateType === 'hourly')
    expect(hourly).toHaveLength(1)
    expect(hourly[0].rate).toBe(500)
    expect(hourly[0].hours).toBe(3)
    expect(hourly[0].amount).toBe(1500)   // 3h × ₹500, NOT 3 × ₹5,000
  })

  it('totals correctly instead of multiplying the monthly fee by hours', () => {
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-20')
    // 5000 + 5000 + 4516.13 + 1500
    expect(ledger.totalDue).toBe(16_016.13)
  })

  it('clips the hourly month to the segment when the switch lands mid-month', () => {
    const cycles = getBillingCycles(s, sessions, [], '2026-08-20')
    const hourly = cycles.filter((c) => c.rateType === 'hourly')[0]
    expect(hourly.start).toBe('2026-08-12')   // not 2026-08-01
    expect(hourly.end).toBe('2026-08-20')
  })

  it('handles the reverse switch, hourly → monthly', () => {
    const rev = student({
      billingAnchorDate: '2026-05-01',
      rateType: 'monthly', ratePerHour: 5000,
      rateHistory: [
        { effectiveFrom: '2026-05-01', ratePerHour: 500, rateType: 'hourly' },
        { effectiveFrom: '2026-07-01', ratePerHour: 5000, rateType: 'monthly' },
      ],
    })
    const ss = [session('2026-05-10', { hours: 2 }), session('2026-07-10', { hours: 1 })]
    const cycles = getBillingCycles(rev, ss, [], '2026-08-15')

    expect(cycles[0].rateType).toBe('hourly')
    expect(cycles[0].amount).toBe(1000)
    const monthly = cycles.filter((c) => c.rateType === 'monthly')
    expect(spans(monthly)).toEqual([
      ['2026-07-01', '2026-07-31'],
      ['2026-08-01', '2026-08-31'],
    ])
    expect(monthly[0].amount).toBe(5000)
  })

  it('gives every cycle a unique key across segments', () => {
    const cycles = getBillingCycles(s, sessions, [], '2026-08-20')
    expect(new Set(cycles.map((c) => c.key)).size).toBe(cycles.length)
  })

  it('does not pro-rate merely because today is mid-cycle', () => {
    const plain = student({ billingAnchorDate: '2026-08-01' })
    const cycles = getBillingCycles(plain, [], [], '2026-08-15')
    expect(cycles[0].proRated).toBe(false)
    expect(cycles[0].amount).toBe(5000)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('unbilled sessions are surfaced, not swallowed', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('reports a session logged before the anchor', () => {
    const sessions = [
      session('2026-07-02', { hours: 2 }),
      session('2026-07-20', { hours: 1 }),
    ]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-01')
    expect(ledger.unbilled.map((x) => x.date)).toEqual(['2026-07-02'])
  })

  it('reports an out-of-range extra whose charge would otherwise vanish', () => {
    const sessions = [session('2026-07-02', { type: 'extra', extraAmount: 900 })]
    const ledger = getStudentLedger(s, sessions, [], [], '2026-08-01')
    expect(ledger.unbilled).toHaveLength(1)
    expect(ledger.unbilled[0].extraAmount).toBe(900)
  })

  it('reports sessions logged after the student left', () => {
    const left = student({ billingAnchorDate: '2026-07-15', endDate: '2026-07-24' })
    const ledger = getStudentLedger(left, [session('2026-08-05')], [], [], '2026-09-01')
    expect(ledger.unbilled.map((x) => x.date)).toEqual(['2026-08-05'])
  })

  it('is empty when everything falls in a cycle', () => {
    const sessions = [session('2026-07-20'), session('2026-08-20')]
    expect(getStudentLedger(s, sessions, [], [], '2026-09-01').unbilled).toEqual([])
  })

  it('ignores other students sessions', () => {
    const sessions = [session('2020-01-01', { studentId: 'other' })]
    expect(getStudentLedger(s, sessions, [], [], '2026-08-01').unbilled).toEqual([])
  })

  it('counts a session as billed even when it sits in a break-extended stretch', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    const sessions = [session('2026-08-20')]   // inside the extended cycle 1
    const ledger = getStudentLedger(s, sessions, [], breaks, '2026-09-01')
    expect(ledger.unbilled).toEqual([])
  })

  it('exposes the same list through getUnbilledSessions', () => {
    const sessions = [session('2026-07-02')]
    const cycles = getBillingCycles(s, sessions, [], '2026-08-01')
    expect(getUnbilledSessions(s, sessions, cycles)).toHaveLength(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('negative amounts cannot inflate what is owed', () => {
  it('ignores a negative payment instead of increasing the balance', () => {
    const s = student({ billingAnchorDate: '2026-07-15' })
    const ledger = getStudentLedger(s, [], [payment('2026-07-20', -3000)], [], '2026-08-01')
    expect(ledger.totalPaid).toBe(0)
    expect(ledger.balance).toBe(5000)   // was ₹8,000 before the guard
  })

  it('still counts the positive payments alongside it', () => {
    const s = student({ billingAnchorDate: '2026-07-15' })
    const pays = [payment('2026-07-20', -3000), payment('2026-07-21', 5000)]
    const ledger = getStudentLedger(s, [], pays, [], '2026-08-01')
    expect(ledger.totalPaid).toBe(5000)
    expect(ledger.balance).toBe(0)
  })
})
