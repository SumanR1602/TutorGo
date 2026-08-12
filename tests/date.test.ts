import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  todayISO, currentYM, addDays, addMonthsClamped, daysInclusive,
  overlapDays, daysInMonth, toEpochDay, fromEpochDay, formatDate, formatDayMonth,
} from '@utils/date'

afterEach(() => vi.useRealTimers())

describe('addMonthsClamped', () => {
  it('keeps the day when the target month is long enough', () => {
    expect(addMonthsClamped('2026-07-15', 1)).toBe('2026-08-15')
    expect(addMonthsClamped('2026-01-10', 3)).toBe('2026-04-10')
  })

  it('clamps to the last day of a short month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('recovers the original day-of-month in a later long month', () => {
    // The intent is "the 31st", not "the 28th we were forced back to".
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-01-31', 4)).toBe('2026-05-31')
  })

  it('handles leap years', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('rolls across year boundaries', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonthsClamped('2026-12-31', 1)).toBe('2027-01-31')
  })
})

describe('epoch round-trips', () => {
  it('survives a full year of round-trips', () => {
    let d = '2026-01-01'
    for (let i = 0; i < 400; i++) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d)
      d = addDays(d, 1)
    }
    expect(d).toBe('2027-02-05')
  })

  it('adds and subtracts days across month and year ends', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('daysInclusive / overlapDays', () => {
  it('counts a single day as one', () => {
    expect(daysInclusive('2026-07-15', '2026-07-15')).toBe(1)
  })

  it('counts the users holiday window as 11 days', () => {
    expect(daysInclusive('2026-07-20', '2026-07-30')).toBe(11)
  })

  it('returns 0 for disjoint ranges', () => {
    expect(overlapDays('2026-07-01', '2026-07-10', '2026-08-01', '2026-08-10')).toBe(0)
  })

  it('counts only the intersecting portion', () => {
    expect(overlapDays('2026-07-20', '2026-08-20', '2026-07-15', '2026-07-31')).toBe(12)
  })

  it('handles full containment either way round', () => {
    expect(overlapDays('2026-07-20', '2026-07-25', '2026-07-01', '2026-07-31')).toBe(6)
    expect(overlapDays('2026-07-01', '2026-07-31', '2026-07-20', '2026-07-25')).toBe(6)
  })
})

describe('daysInMonth', () => {
  it('knows month lengths including leap Februaries', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 7)).toBe(31)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('todayISO — the UTC midnight bug', () => {
  it('returns the IST date, not the UTC date, just after midnight IST', () => {
    // 00:30 IST on 1 June 2026 === 19:00 UTC on 31 May 2026.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T19:00:00.000Z'))

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-05-31')  // the old bug
    expect(todayISO()).toBe('2026-06-01')                             // the fix
    expect(currentYM()).toBe('2026-06')
  })

  it('agrees with UTC during IST daytime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T09:00:00.000Z'))
    expect(todayISO()).toBe('2026-06-01')
  })
})

describe('formatting', () => {
  it('formats dates without timezone slippage', () => {
    expect(formatDate('2026-07-15')).toBe('15/07/2026')
    expect(formatDayMonth('2026-07-15')).toBe('15 Jul 2026')
    expect(formatDayMonth('2026-01-01')).toBe('1 Jan 2026')
  })
})
