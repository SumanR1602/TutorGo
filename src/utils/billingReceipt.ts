/**
 * billingReceipt.ts
 * Builds a receipt for one payment.
 *
 * Frozen to `payment.date` — a session logged later, a break added later, or
 * "today" simply moving on must never change what a past receipt says. The
 * period a receipt covers is the window between the previous payment and
 * this one (mirrors billingInvoice.ts, which windows from the last payment
 * to today instead).
 *
 * A receipt confirms a payment — it isn't a second invoice, so it carries no
 * itemized session list. It states what came in, roughly what it covered,
 * and the account's resulting balance.
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getRateAt, getBillingCycles } from './billingCore'
import { formatDate, todayISO, formatDayMonth } from './date'
import { buildReceiptHTML } from './templates/receiptTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type { Student, Session, Payment, Break } from '@/types'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** What one hourly session costs, honoring rate history and per-session extras. */
function sessionCost(student: Student, s: Session): number {
  if (s.type === 'extra' && typeof s.extraAmount === 'number') return s.extraAmount
  return s.hours * getRateAt(student, s.date).ratePerHour
}

/** Payments in the order money actually arrived. */
function chronological(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  )
}

export async function openReceiptPDF(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  payment: Payment,
  teacherName: string = 'Teacher',
  breaks: Break[] = [],
): Promise<void> {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
  const fmt       = (n: number) => formatCurrency(n, currency)
  const today     = todayISO()
  const issued    = formatDayMonth(today)
  // payment.id is already a unique UUID — a short slice of it disambiguates
  // two same-day payments, which date+name alone would collide on.
  const recNo     = `REC-${payment.date.replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}-${payment.id.slice(0, 4).toUpperCase()}`

  const mine = chronological(payments.filter((p) => p.studentId === student.id))
  const idx  = mine.findIndex((p) => p.id === payment.id)
  if (idx === -1) return  // payment not in the list — nothing to receipt

  const prevPayment = idx > 0 ? mine[idx - 1] : null
  const boundary     = prevPayment?.date ?? null

  // Freeze the world to how it looked on the day this payment was made.
  const asOf = sessions
    .filter((s) => s.studentId === student.id && s.date <= payment.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  const prevPaymentsTotal = round2(
    mine.slice(0, idx).reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0),
  )

  let periodDue        = 0
  let costBeforePeriod = 0
  // null → the coverage line falls back to a generic "Tutoring fees"; only
  // monthly students get a real calendar period, since only their billing
  // has one (an hourly "since last payment" window isn't a clean period).
  let periodLabel: string | null = null

  if (isMonthly) {
    // Cycles as they stood on payment.date — never re-flowed by later edits.
    const startedCycles = getBillingCycles(student, asOf, breaks, payment.date).filter((c) => c.started)
    const touchedCycles = boundary ? startedCycles.filter((c) => c.end > boundary) : startedCycles
    costBeforePeriod = startedCycles
      .filter((c) => !touchedCycles.includes(c))
      .reduce((sum, c) => sum + c.amount, 0)
    periodDue = touchedCycles.reduce((sum, c) => sum + c.amount, 0)
    periodLabel = touchedCycles.length
      ? `${formatDate(touchedCycles[0].start)} → ${formatDate(touchedCycles[touchedCycles.length - 1].end)}`
      : null
  } else {
    // Hourly: no cycles. The window is purely date-bounded, exactly like the invoice.
    const covered      = boundary ? asOf.filter((s) => s.date > boundary) : asOf
    const beforePeriod = boundary ? asOf.filter((s) => s.date <= boundary) : []

    periodDue        = round2(covered.reduce((sum, s) => sum + sessionCost(student, s), 0))
    costBeforePeriod = round2(beforePeriod.reduce((sum, s) => sum + sessionCost(student, s), 0))
  }

  // +ve = credit carried in, −ve = arrears carried in
  const carryForward  = round2(prevPaymentsTotal - costBeforePeriod)
  // +ve = still in credit after paying, −ve = still owing
  const creditBalance = round2(carryForward + payment.amount - periodDue)
  const creditHours   = isMonthly || !student.ratePerHour ? null : round2(creditBalance / student.ratePerHour)

  const html = buildReceiptHTML({
    recNo, teacherName, issued, student, isMonthly,
    payment, periodLabel, carryForward, periodDue, creditBalance, creditHours, fmt,
  })

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `Receipt_${safeName}_${payment.date}_${recNo}`)
}
