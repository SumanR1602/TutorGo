import { describe, it, expect } from 'vitest'
import {
  checkSessionDate, findOverlappingBreaks, isRangeFullyCovered,
  getActiveRange, findBreakForDate, isOnBreak,
} from '@utils/billingCore'
import { student, brk } from './factories'

const TODAY = '2026-08-20'

// ───────────────────────────────────────────────────────────────────────────
describe('overlapping breaks are rejected', () => {
  const existing = [brk('2026-07-14', '2026-07-20')]

  it('rejects a range fully inside an existing break', () => {
    // The exact case: 14–20 Jul exists, adding 15–18 Jul.
    expect(findOverlappingBreaks(existing, 'stu-1', '2026-07-15', '2026-07-18')).toHaveLength(1)
    expect(isRangeFullyCovered(existing, 'stu-1', '2026-07-15', '2026-07-18')).toBe(true)
  })

  it('rejects an identical range', () => {
    expect(isRangeFullyCovered(existing, 'stu-1', '2026-07-14', '2026-07-20')).toBe(true)
  })

  it('flags a partial overlap at the start', () => {
    const hits = findOverlappingBreaks(existing, 'stu-1', '2026-07-10', '2026-07-16')
    expect(hits).toHaveLength(1)
    expect(isRangeFullyCovered(existing, 'stu-1', '2026-07-10', '2026-07-16')).toBe(false)
  })

  it('flags a partial overlap at the end', () => {
    const hits = findOverlappingBreaks(existing, 'stu-1', '2026-07-18', '2026-07-25')
    expect(hits).toHaveLength(1)
    expect(isRangeFullyCovered(existing, 'stu-1', '2026-07-18', '2026-07-25')).toBe(false)
  })

  it('flags a range that swallows an existing break', () => {
    expect(findOverlappingBreaks(existing, 'stu-1', '2026-07-01', '2026-07-31')).toHaveLength(1)
  })

  it('allows a range that merely touches the day after', () => {
    expect(findOverlappingBreaks(existing, 'stu-1', '2026-07-21', '2026-07-25')).toEqual([])
  })

  it('allows a range ending the day before', () => {
    expect(findOverlappingBreaks(existing, 'stu-1', '2026-07-01', '2026-07-13')).toEqual([])
  })

  it('reports every overlapping break, oldest first', () => {
    const many = [brk('2026-07-14', '2026-07-20'), brk('2026-08-01', '2026-08-05')]
    const hits = findOverlappingBreaks(many, 'stu-1', '2026-07-18', '2026-08-03')
    expect(hits.map((b) => b.startDate)).toEqual(['2026-07-14', '2026-08-01'])
  })

  it('ignores other students breaks', () => {
    const other = [brk('2026-07-14', '2026-07-20', { studentId: 'someone-else' })]
    expect(findOverlappingBreaks(other, 'stu-1', '2026-07-15', '2026-07-18')).toEqual([])
  })

  it('excludes the record being edited so saving it unchanged is allowed', () => {
    const one = brk('2026-07-14', '2026-07-20')
    expect(findOverlappingBreaks([one], 'stu-1', '2026-07-14', '2026-07-20', one.id)).toEqual([])
  })

  it('treats a backwards range as no overlap rather than crashing', () => {
    expect(findOverlappingBreaks(existing, 'stu-1', '2026-07-20', '2026-07-14')).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('session date checks', () => {
  const s = student({ billingAnchorDate: '2026-07-15' })

  it('accepts a date inside the active range', () => {
    expect(checkSessionDate(s, '2026-07-20', [], TODAY)).toBeNull()
  })

  it('accepts the anchor date itself', () => {
    expect(checkSessionDate(s, '2026-07-15', [], TODAY)).toBeNull()
  })

  it('accepts today', () => {
    expect(checkSessionDate(s, TODAY, [], TODAY)).toBeNull()
  })

  it('rejects a date before billing starts, and says what to do', () => {
    const msg = checkSessionDate(s, '2026-07-02', [], TODAY)
    expect(msg).toContain('billing starts')
    expect(msg).toContain('15 Jul 2026')
  })

  it('rejects a future date', () => {
    expect(checkSessionDate(s, '2026-09-01', [], TODAY)).toContain('future')
  })

  it('rejects a date after the student left', () => {
    const left = student({ billingAnchorDate: '2026-07-15', endDate: '2026-07-24' })
    expect(checkSessionDate(left, '2026-08-01', [], TODAY)).toContain('left on')
  })

  it('accepts a date on or before the leave date', () => {
    const left = student({ billingAnchorDate: '2026-07-15', endDate: '2026-07-24' })
    expect(checkSessionDate(left, '2026-07-24', [], TODAY)).toBeNull()
  })

  it('rejects a date inside a declared break, naming the break', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    const msg = checkSessionDate(s, '2026-07-25', breaks, TODAY)
    expect(msg).toContain('on a break')
    expect(msg).toContain('20 Jul 2026')
    expect(msg).toContain('30 Jul 2026')
  })

  it('accepts the day after a break ends', () => {
    const breaks = [brk('2026-07-20', '2026-07-30')]
    expect(checkSessionDate(s, '2026-07-31', breaks, TODAY)).toBeNull()
  })

  it('rejects an empty date', () => {
    expect(checkSessionDate(s, '', [], TODAY)).toBe('Pick a date.')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('active range', () => {
  it('runs from the anchor to today for an active student', () => {
    const s = student({ billingAnchorDate: '2026-07-15' })
    expect(getActiveRange(s, TODAY)).toEqual({ from: '2026-07-15', to: TODAY })
  })

  it('stops at the leave date once set', () => {
    const s = student({ billingAnchorDate: '2026-07-15', endDate: '2026-07-24' })
    expect(getActiveRange(s, TODAY).to).toBe('2026-07-24')
  })

  it('does not run past today for a future leave date', () => {
    const s = student({ billingAnchorDate: '2026-07-15', endDate: '2027-01-01' })
    expect(getActiveRange(s, TODAY).to).toBe(TODAY)
  })
})

describe('break lookups', () => {
  const breaks = [brk('2026-07-20', '2026-07-30')]

  it('finds the break covering a date', () => {
    expect(findBreakForDate(breaks, 'stu-1', '2026-07-25')?.startDate).toBe('2026-07-20')
    expect(findBreakForDate(breaks, 'stu-1', '2026-08-01')).toBeUndefined()
  })

  it('matches isOnBreak on the boundaries', () => {
    expect(isOnBreak(breaks, 'stu-1', '2026-07-20')).toBe(true)
    expect(isOnBreak(breaks, 'stu-1', '2026-07-30')).toBe(true)
    expect(isOnBreak(breaks, 'stu-1', '2026-07-19')).toBe(false)
    expect(isOnBreak(breaks, 'stu-1', '2026-07-31')).toBe(false)
  })
})
