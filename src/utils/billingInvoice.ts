/**
 * billingInvoice.ts
 * Builds an invoice from the billing ledger.
 *
 * An invoice bills whole cycles, so it can no longer double-count a calendar
 * month that straddles the last payment — the defect in the previous version.
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getStudentLedger } from './billingCore'
import { formatDate, formatDayMonth, todayISO } from './date'
import { buildInvoiceHTML } from './templates/billingInvoiceTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type { Student, Session, Payment, Break, BillingCycle } from '@/types'

export async function openInvoicePDF(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  teacherName: string = 'Teacher',
  dateFrom: string = '',
  dateTo: string = '',
  breaks: Break[] = [],
): Promise<void> {
  const currency    = student.currency ?? DEFAULT_CURRENCY
  const isMonthly   = (student.rateType ?? 'hourly') === 'monthly'
  const fmt         = (n: number) => formatCurrency(n, currency)
  const todayIso    = todayISO()
  const issued      = formatDayMonth(todayIso)
  const invNo       = `INV-${todayIso.replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}`

  const ledger = getStudentLedger(student, sessions, payments, breaks, todayIso)

  // ── 1. Which cycles does this invoice cover? ───────────────────────
  // Default: everything still owed. With a date range: cycles overlapping it.
  const hasRange = Boolean(dateFrom || dateTo)
  const invoiced: BillingCycle[] = ledger.cycles.filter((c) => {
    if (!c.started) return false
    if (!hasRange) return c.balance > 0
    return (!dateTo || c.start <= dateTo) && (!dateFrom || c.end >= dateFrom)
  })

  const periodDue    = invoiced.reduce((sum, c) => sum + c.amount, 0)
  const amountDueNow = invoiced.reduce((sum, c) => sum + c.balance, 0)
  const carryForward = ledger.credit

  const mySessions = sessions.filter((s) => s.studentId === student.id)
  const covered = mySessions
    .filter((s) => invoiced.some((c) => s.date >= c.start && s.date <= c.end))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalHours   = covered.reduce((sum, s) => sum + s.hours, 0)
  const sessionCount = covered.length

  const periodLabel = invoiced.length
    ? `${formatDate(invoiced[0].start)} → ${formatDate(invoiced[invoiced.length - 1].end)}`
    : `up to ${formatDate(dateTo || todayIso)}`

  // ── 2. Line items, grouped by cycle ────────────────────────────────
  let sessionRows = ''
  for (const cycle of invoiced) {
    const inCycle = covered.filter((s) => s.date >= cycle.start && s.date <= cycle.end)

    for (const s of inCycle) {
      const isExtra   = s.type === 'extra'
      const lineTotal = isMonthly
        ? (isExtra ? (s.extraAmount ?? 0) : null)
        : (isExtra && typeof s.extraAmount === 'number'
            ? s.extraAmount
            : s.hours * cycle.rate)
      const lineRate = isMonthly
        ? (isExtra ? 'extra' : '—')
        : `${fmt(cycle.rate)}/hr`

      sessionRows += `<tr class="data-row">
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
      sessionRows += `<tr class="fee-row">
          <td colspan="2"><strong>${formatDayMonth(cycle.start)} → ${formatDayMonth(cycle.end)} — Monthly Fee</strong>${extended}${proRated}</td>
          <td class="c"><strong>${cycle.hours.toFixed(1)}h</strong></td>
          <td class="r">${fmt(cycle.rate)}/mo</td>
          <td class="r"><strong>${fmt(cycle.baseAmount)}</strong></td>
        </tr>`
    }
  }

  // ── 3. Render ──────────────────────────────────────────────────────
  const html = buildInvoiceHTML({
    invNo, teacherName, issued, student, isMonthly,
    periodLabel, sessionCount, totalHours, periodDue, carryForward, amountDueNow,
    sessionRows, fmt,
  })

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `Invoice_${safeName}_${invNo}`)
}
