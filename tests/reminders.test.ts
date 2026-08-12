import { describe, it, expect, vi, afterEach } from 'vitest'
import { isReminderMuted } from '@utils/notifications'
import { convertISTtoTZ, isReasonableHour, zonedTimeToInstant, nowInTeacherTZ } from '@utils/timezone'
import { student, brk } from './factories'

const TODAY = '2026-08-20'

afterEach(() => vi.useRealTimers())

describe('reminders are muted when they would be useless', () => {
  const s = student({ billingAnchorDate: '2026-07-15', scheduledTime: '18:00' })

  it('fires on a normal day', () => {
    expect(isReminderMuted(s, [], TODAY)).toBe(false)
  })

  it('is muted while the student is on a break', () => {
    const breaks = [brk('2026-08-18', '2026-08-25')]
    expect(isReminderMuted(s, breaks, TODAY)).toBe(true)
  })

  it('resumes the day after the break ends', () => {
    const breaks = [brk('2026-08-10', '2026-08-19')]
    expect(isReminderMuted(s, breaks, TODAY)).toBe(false)
  })

  it('is muted on both boundary days of a break', () => {
    expect(isReminderMuted(s, [brk('2026-08-20', '2026-08-25')], TODAY)).toBe(true)
    expect(isReminderMuted(s, [brk('2026-08-10', '2026-08-20')], TODAY)).toBe(true)
  })

  it('is muted after the student has left', () => {
    const left = student({ billingAnchorDate: '2026-07-15', endDate: '2026-08-01' })
    expect(isReminderMuted(left, [], TODAY)).toBe(true)
  })

  it('is muted before billing starts', () => {
    const future = student({ billingAnchorDate: '2026-09-01' })
    expect(isReminderMuted(future, [], TODAY)).toBe(true)
  })

  it('ignores another students break', () => {
    const breaks = [brk('2026-08-18', '2026-08-25', { studentId: 'someone-else' })]
    expect(isReminderMuted(s, breaks, TODAY)).toBe(false)
  })
})

describe('IST conversion no longer depends on the device timezone', () => {
  it('resolves an IST wall-clock time to the right instant', () => {
    // 18:00 IST === 12:30 UTC.
    const instant = zonedTimeToInstant('2026-08-20', '18:00', 'Asia/Kolkata')
    expect(instant.toISOString()).toBe('2026-08-20T12:30:00.000Z')
  })

  it('gives the same answer whatever the host clock says', () => {
    // The old code built the Date in the *device's* zone, so this differed.
    vi.useFakeTimers()

    vi.setSystemTime(new Date('2026-08-20T02:00:00.000Z'))
    const a = convertISTtoTZ('18:00', 'America/New_York')

    vi.setSystemTime(new Date('2026-08-20T20:00:00.000Z'))
    const b = convertISTtoTZ('18:00', 'America/New_York')

    expect(a.time).toBe(b.time)
    expect(a.time).toBe('08:30 AM')   // 18:00 IST = 08:30 EDT
  })

  it('converts across the date line correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T06:00:00.000Z'))
    // 06:00 IST = 00:30 UTC = 20:30 the previous day in New York.
    expect(convertISTtoTZ('06:00', 'America/New_York').time).toBe('08:30 PM')
  })

  it('returns empty output for an empty time', () => {
    expect(convertISTtoTZ('', 'Asia/Kolkata')).toEqual({ time: '', date: '' })
  })

  it('flags an unreasonable hour for the student', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T06:00:00.000Z'))
    // 09:00 IST = 23:30 the night before in New York — not a class hour.
    expect(isReasonableHour('09:00', 'America/New_York')).toBe(false)
    // 18:00 IST = 08:30 EDT — fine.
    expect(isReasonableHour('18:00', 'America/New_York')).toBe(true)
  })

  it('reads the current IST time from IST, not the device', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:30:00.000Z'))
    expect(nowInTeacherTZ('Asia/Kolkata')).toBe('18:00')
  })
})
