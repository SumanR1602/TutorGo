/**
 * billingInvoice.ts
 * Builds an invoice showing only what's changed since the last payment.
 *
 * Monthly students bill by cycle (a flat fee can't be sliced by date), so
 * "this period" is the latest cycle and any older unpaid cycles collapse
 * into carryForward. Hourly students bill per session, so "this period" is
 * simply every session logged after the last payment's date — no cycle
 * indirection, so a part-paid month never re-lists sessions already covered.
 *
 * Either way the money math reduces to the same identity:
 *   carryForward  = totalPaid − costBeforePeriod   (+ve credit, −ve still owed)
 *   amountDueNow  = periodDue − carryForward        (= total cost to date − total paid)
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getRateAt, getBillingCycles } from './billingCore'
import { formatDate, formatDayMonth, formatMonthLong, todayISO } from './date'
import { buildInvoiceHTML } from './templates/billingInvoiceTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type { Student, Session, Payment, Break, BillingCycle } from '@/types'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** What one hourly session costs, honoring rate history and per-session extras. */
function sessionCost(student: Student, s: Session): number {
  if (s.type === 'extra' && typeof s.extraAmount === 'number') return s.extraAmount
  return s.hours * getRateAt(student, s.date).ratePerHour
}

export async function openInvoicePDF(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  teacherName: string = 'Teacher',
  dateFrom: string = '',
  dateTo: string = '',
  breaks: Break[] = [],
): Promise<void> {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
  const fmt       = (n: number) => formatCurrency(n, currency)
  const todayIso  = todayISO()
  const issued    = formatDayMonth(todayIso)
  const invNo     = `INV-${todayIso.replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}`
  const hasRange  = Boolean(dateFrom || dateTo)
  const effectiveTo = dateTo || todayIso

  const mySessions = sessions
    .filter((s) => s.studentId === student.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  const totalPaid = payments
    .filter((p) => p.studentId === student.id)
    .reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0)

  let periodDue = 0
  let costBeforePeriod = 0
  let periodLabel = `up to ${formatDate(effectiveTo)}`
  let sessionRows = ''
  let covered: Session[] = []
  let invoicedCycles: BillingCycle[] = []

  if (isMonthly) {
    const startedCycles = getBillingCycles(student, sessions, breaks, todayIso)
      .filter((c) => c.started && c.start <= effectiveTo)

    if (hasRange) {
      invoicedCycles = startedCycles.filter(
        (c) => (!dateTo || c.start <= dateTo) && (!dateFrom || c.end >= dateFrom),
      )
      const firstIncluded = invoicedCycles[0]?.start
      costBeforePeriod = startedCycles
        .filter((c) => !invoicedCycles.includes(c) && (!firstIncluded || c.end < firstIncluded))
        .reduce((sum, c) => sum + c.amount, 0)
    } else {
      const latest = startedCycles[startedCycles.length - 1]
      invoicedCycles = latest ? [latest] : []
      costBeforePeriod = startedCycles
        .slice(0, -1)
        .reduce((sum, c) => sum + c.amount, 0)
    }

    periodDue = invoicedCycles.reduce((sum, c) => sum + c.amount, 0)
    covered = mySessions.filter((s) => invoicedCycles.some((c) => s.date >= c.start && s.date <= c.end))
    periodLabel = invoicedCycles.length
      ? `${formatDate(invoicedCycles[0].start)} → ${formatDate(invoicedCycles[invoicedCycles.length - 1].end)}`
      : periodLabel

    for (const cycle of invoicedCycles) {
      const inCycle = covered.filter((s) => s.date >= cycle.start && s.date <= cycle.end)
      for (const s of inCycle) {
        const isExtra   = s.type === 'extra'
        const lineTotal = isExtra ? (s.extraAmount ?? 0) : null
        sessionRows += `<tr class="data-row">
            <td>${formatDate(s.date)}</td>
            <td><span class="badge badge-${s.type}">${isExtra ? 'Extra' : 'Regular'}</span></td>
            <td class="c">${s.hours}h</td>
            <td class="r ${lineTotal === null ? 'muted' : ''}">${isExtra ? 'extra' : '—'}</td>
            <td class="r ${lineTotal === null ? 'muted' : ''}">${lineTotal === null ? '—' : fmt(lineTotal)}</td>
          </tr>`
      }
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
  } else {
    // ── Hourly: no cycles. "This period" is simply sessions since the boundary. ──
    let boundary: string | null = null
    if (hasRange) {
      boundary = dateFrom || null
    } else {
      const lastPaymentDate = payments
        .filter((p) => p.studentId === student.id)
        .map((p) => p.date)
        .sort()
        .pop()
      boundary = lastPaymentDate ?? null
    }

    covered = boundary
      ? mySessions.filter((s) => (hasRange ? s.date >= boundary! : s.date > boundary!) && s.date <= effectiveTo)
      : mySessions.filter((s) => s.date <= effectiveTo)
    const beforePeriod = boundary
      ? mySessions.filter((s) => (hasRange ? s.date < boundary! : s.date <= boundary!))
      : []

    periodDue         = round2(covered.reduce((sum, s) => sum + sessionCost(student, s), 0))
    costBeforePeriod   = round2(beforePeriod.reduce((sum, s) => sum + sessionCost(student, s), 0))
    periodLabel = covered.length
      ? `${formatDate(covered[0].date)} → ${formatDate(covered[covered.length - 1].date)}`
      : periodLabel

    // A window "since last payment" can cross a month boundary — when it
    // does, a flat list makes it hard to tell how much belonged to which
    // month, so break it up with a subtotal row per month. Not worth the
    // clutter when everything falls in one month, which is the common case.
    // The first month never gets a divider — it sits right under the table
    // header already, so announcing it again would just double up the bar.
    const monthsSpanned = new Set(covered.map((s) => s.date.slice(0, 7))).size
    let lastMonthKey = covered[0]?.date.slice(0, 7) ?? ''
    for (const s of covered) {
      const monthKey = s.date.slice(0, 7)
      if (monthsSpanned > 1 && monthKey !== lastMonthKey) {
        lastMonthKey = monthKey
        const monthSessionCount = covered.filter((x) => x.date.slice(0, 7) === monthKey).length
        sessionRows += `<tr class="month-row">
            <td colspan="5"><strong>${formatMonthLong(monthKey)}</strong> &middot; ${monthSessionCount} session${monthSessionCount !== 1 ? 's' : ''}</td>
          </tr>`
      }

      const isExtra   = s.type === 'extra'
      const rate      = getRateAt(student, s.date).ratePerHour
      const lineTotal = sessionCost(student, s)
      sessionRows += `<tr class="data-row">
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${isExtra ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${s.hours}h</td>
          <td class="r">${isExtra && typeof s.extraAmount === 'number' ? 'extra' : `${fmt(rate)}/hr`}</td>
          <td class="r">${fmt(lineTotal)}</td>
        </tr>`
    }
  }

  const carryForward = round2(totalPaid - costBeforePeriod)
  const amountDueNow  = round2(periodDue - carryForward)

  const totalHours   = covered.reduce((sum, s) => sum + s.hours, 0)
  const sessionCount = covered.length

  const html = buildInvoiceHTML({
    invNo, teacherName, issued, student, isMonthly,
    periodLabel, sessionCount, totalHours, periodDue, carryForward, amountDueNow,
    sessionRows, fmt,
  })

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `Invoice_${safeName}_${invNo}`)
}
