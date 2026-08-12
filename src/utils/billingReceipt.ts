/**
 * billingReceipt.ts
 * Builds a receipt for one payment.
 *
 * Which cycles a payment settles is decided by FIFO allocation, not by the
 * date it arrived — so a receipt for money paid a month late still names the
 * cycle it actually cleared.
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getStudentLedger } from './billingCore'
import { formatDate, formatDayMonth, todayISO } from './date'
import { buildReceiptHTML } from './templates/receiptTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type { Student, Session, Payment, Break } from '@/types'

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
  const recNo     = `REC-${payment.date.replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}`

  const mine    = chronological(payments.filter((p) => p.studentId === student.id))
  const idx     = mine.findIndex((p) => p.id === payment.id)
  if (idx === -1) return  // payment not in the list — nothing to receipt

  // ── 1. Ledger immediately before and after this payment ────────────
  const before = getStudentLedger(student, sessions, mine.slice(0, idx), breaks, today)
  const after  = getStudentLedger(student, sessions, mine.slice(0, idx + 1), breaks, today)

  // ── 2. Cycles this payment actually moved ──────────────────────────
  const touched = after.cycles.filter((c, i) => c.paid > (before.cycles[i]?.paid ?? 0))
  const periodDue = touched.reduce((sum, c) => sum + c.amount, 0)

  // +ve = credit carried in, −ve = arrears carried in
  const carryForward = before.credit - before.balance
  // +ve = still in credit after paying, −ve = still owing
  const creditBalance = after.credit - after.balance
  const creditHours = isMonthly || !student.ratePerHour
    ? null
    : creditBalance / student.ratePerHour

  // ── 3. Sessions inside those cycles ────────────────────────────────
  const covered = sessions
    .filter((s) => s.studentId === student.id)
    .filter((s) => touched.some((c) => s.date >= c.start && s.date <= c.end))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalHours   = covered.reduce((sum, s) => sum + s.hours, 0)
  const sessionCount = covered.length

  const periodLabel = touched.length
    ? `${formatDate(touched[0].start)} → ${formatDate(touched[touched.length - 1].end)}`
    : `Advance payment · received ${formatDate(payment.date)}`

  // ── 4. Line items, grouped by cycle ────────────────────────────────
  let sessionRows = ''
  for (const cycle of touched) {
    const inCycle = covered.filter((s) => s.date >= cycle.start && s.date <= cycle.end)

    for (const s of inCycle) {
      const isExtra = s.type === 'extra'
      const lineTotal = isMonthly
        ? (isExtra ? (s.extraAmount ?? 0) : null)
        : (isExtra && typeof s.extraAmount === 'number'
            ? s.extraAmount
            : s.hours * cycle.rate)
      const lineRate = isMonthly
        ? (isExtra ? 'extra' : '—')
        : `${fmt(cycle.rate)}/hr`

      sessionRows += `<tr>
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${isExtra ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${s.hours}h</td>
          <td class="r ${lineTotal === null ? 'muted' : ''}">${lineRate}</td>
          <td class="r ${lineTotal === null ? 'muted' : ''}">${lineTotal === null ? '—' : fmt(lineTotal)}</td>
        </tr>`
    }

    if (isMonthly) {
      const extended = cycle.breakDays > 0
        ? ` <span style="font-weight:400">(extended ${cycle.breakDays} day${cycle.breakDays !== 1 ? 's' : ''} for breaks)</span>`
        : ''
      const proRated = cycle.proRated ? ' <span style="font-weight:400">(pro-rated)</span>' : ''
      sessionRows += `<tr style="background:#f0fdf4">
          <td colspan="2" style="color:#15803d;font-weight:600">${formatDayMonth(cycle.start)} → ${formatDayMonth(cycle.end)} — Monthly Fee${extended}${proRated}</td>
          <td class="c" style="color:#15803d;font-weight:600">${cycle.hours.toFixed(1)}h</td>
          <td class="r" style="color:#15803d">${fmt(cycle.rate)}/mo</td>
          <td class="r" style="color:#15803d;font-weight:600">${fmt(cycle.baseAmount)}</td>
        </tr>`
    }
  }

  // ── 5. Render ──────────────────────────────────────────────────────
  const html = buildReceiptHTML({
    recNo, teacherName, issued, student, isMonthly,
    payment, periodLabel, sessionRows, sessionCount, totalHours,
    carryForward, periodDue, creditBalance, creditHours, fmt,
  })

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `Receipt_${safeName}_${payment.date}_${recNo}`)
}
