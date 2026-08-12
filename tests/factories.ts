/** Test factories — minimal, explicit, no hidden defaults that matter. */
import type { Student, Session, Payment, Break, RateType } from '@/types'

let seq = 0
const id = (p: string) => `${p}-${++seq}`

export function student(over: Partial<Student> = {}): Student {
  const anchor = over.billingAnchorDate ?? '2026-07-15'
  const rate = over.ratePerHour ?? 5000
  const rateType: RateType = over.rateType ?? 'monthly'
  return {
    id: 'stu-1',
    name: 'Sukhjinder',
    city: 'Ludhiana',
    timezone: 'Asia/Kolkata',
    ratePerHour: rate,
    rateType,
    currency: 'INR',
    color: '#6366f1',
    createdAt: `${anchor}T09:00:00.000Z`,
    billingAnchorDate: anchor,
    rateHistory: [{ effectiveFrom: anchor, ratePerHour: rate, rateType }],
    ...over,
  }
}

export function session(date: string, over: Partial<Session> = {}): Session {
  return {
    id: id('ses'),
    studentId: 'stu-1',
    date,
    hours: 1,
    type: 'regular',
    note: '',
    createdAt: `${date}T10:00:00.000Z`,
    ...over,
  }
}

export function payment(date: string, amount: number, over: Partial<Payment> = {}): Payment {
  return {
    id: id('pay'),
    studentId: 'stu-1',
    date,
    amount,
    note: '',
    createdAt: `${date}T10:00:00.000Z`,
    ...over,
  }
}

export function brk(startDate: string, endDate: string, over: Partial<Break> = {}): Break {
  return {
    id: id('brk'),
    studentId: 'stu-1',
    startDate,
    endDate,
    reason: 'Holiday',
    createdAt: `${startDate}T10:00:00.000Z`,
    ...over,
  }
}
