/**
 * billing.ts
 * Formatting helpers and the legacy month-breakdown adapter.
 *
 * Calculations  → billingCore.ts   (the single source of truth)
 * Excel exports → billingExcel.ts
 * PDF invoice   → billingInvoice.ts
 * PDF receipt   → billingReceipt.ts
 */

import type { Student, Session, Payment, Break, MonthlyBreakdown } from '@/types'
import { getStudentLedger } from './billingCore'
import { DEFAULT_CURRENCY } from '@constants'

export { formatDate } from './date'

/**
 * Per-cycle breakdown for a student, newest first.
 *
 * Replaces the old calendar-month grouping: rows are now real billing cycles,
 * so a monthly student's row reads "15 Jul → 25 Aug 2026" rather than "July".
 */
export function getBillingBreakdown(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  breaks: Break[] = [],
): MonthlyBreakdown[] {
  return getStudentLedger(student, sessions, payments, breaks)
    .cycles
    .slice()
    .reverse()
    .map((c) => ({
      key: c.key,
      month: c.label,
      hours: c.hours,
      amount: c.amount,
      paid: c.paid,
      balance: c.balance,
    }))
}

/**
 * Format a number as currency.
 * Paise are shown only when they exist, so ₹5,000 stays ₹5,000 while a
 * pro-rated ₹1,612.90 is no longer silently rounded to ₹1,613.
 */
export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const value = Number.isFinite(amount) ? amount : 0
  const hasPaise = Math.abs(value % 1) > 0.004
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || DEFAULT_CURRENCY,
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(value)
}

/**
 * Open a printable HTML document in a new tab.
 * The "Save as PDF" button inside the tab handles the download.
 */
export function openPDFWindow(html: string, _filename: string): void {
  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
