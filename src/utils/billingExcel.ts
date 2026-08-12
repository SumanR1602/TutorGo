/**
 * billingExcel.ts
 * Excel export helpers (per-student and all-students summary).
 *
 * Every figure comes from the same ledger the Billing screen renders, so the
 * spreadsheet and the app can no longer disagree.
 */
import ExcelJS from 'exceljs'
import { getStudentLedger } from './billingCore'
import { formatDate, formatDayMonth, todayISO } from './date'
import { DEFAULT_CURRENCY } from '@constants'
import { applyBoldStyle, addSheetHeader } from './excel'
import type { Student, Session, Payment, Break } from '@/types'

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Human label for a cycle, including any break extension. */
function cycleLabel(c: { start: string; end: string; breakDays: number; proRated: boolean }): string {
  const base = `${formatDayMonth(c.start)} → ${formatDayMonth(c.end)}`
  const parts: string[] = []
  if (c.breakDays > 0) parts.push(`+${c.breakDays}d break`)
  if (c.proRated) parts.push('pro-rated')
  return parts.length ? `${base} (${parts.join(', ')})` : base
}

/**
 * Export per-student data as a .xlsx file.
 * Sheets: Sessions · Payments · Breaks · Summary
 */
export async function exportToExcel(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  breaks: Break[] = [],
): Promise<void> {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
  const ledger    = getStudentLedger(student, sessions, payments, breaks)

  const totalHours = sessions.reduce((sum, s) => sum + s.hours, 0)
  const myBreaks   = breaks.filter((b) => b.studentId === student.id)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Sessions sheet ──────────────────────────────────────────
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { key: 'date',   width: 14 },
    { key: 'type',   width: 12 },
    { key: 'hours',  width: 8  },
    { key: 'amount', width: 16 },
  ]
  addSheetHeader(sessionsSheet, 'SESSIONS', 4)
  applyBoldStyle(sessionsSheet.addRow({
    date: 'Date', type: 'Type', hours: 'Hours', amount: `Amount (${currency})`,
  }))
  sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((s) => {
      const isExtra = s.type === 'extra'
      const amount = isMonthly
        ? (isExtra ? (s.extraAmount ?? 0) : null)
        : (isExtra && typeof s.extraAmount === 'number'
            ? s.extraAmount
            : parseFloat((s.hours * student.ratePerHour).toFixed(2)))
      sessionsSheet.addRow({ date: formatDate(s.date), type: s.type, hours: s.hours, amount })
    })

  // ── Billing cycles sheet ────────────────────────────────────
  const cyclesSheet = wb.addWorksheet('Billing Cycles')
  cyclesSheet.columns = [
    { key: 'period',  width: 42 },
    { key: 'hours',   width: 9  },
    { key: 'fee',     width: 14 },
    { key: 'extra',   width: 14 },
    { key: 'amount',  width: 14 },
    { key: 'paid',    width: 14 },
    { key: 'balance', width: 14 },
  ]
  addSheetHeader(cyclesSheet, 'BILLING CYCLES', 7)
  applyBoldStyle(cyclesSheet.addRow({
    period: isMonthly ? 'Cycle' : 'Month', hours: 'Hours', fee: 'Fee',
    extra: 'Extras', amount: 'Total', paid: 'Paid', balance: 'Balance',
  }))
  ledger.cycles.forEach((c) => {
    cyclesSheet.addRow({
      period: isMonthly ? cycleLabel(c) : c.label,
      hours: c.hours, fee: c.baseAmount, extra: c.extraAmount,
      amount: c.amount, paid: c.paid, balance: c.balance,
    })
  })
  cyclesSheet.addRow({})
  applyBoldStyle(cyclesSheet.addRow({
    period: 'TOTAL', hours: totalHours, fee: '', extra: '',
    amount: ledger.totalDue, paid: ledger.totalPaid, balance: ledger.balance,
  }))

  // ── Payments sheet ──────────────────────────────────────────
  const paymentsSheet = wb.addWorksheet('Payments')
  paymentsSheet.columns = [
    { key: 'date',   width: 14 },
    { key: 'amount', width: 16 },
    { key: 'note',   width: 28 },
  ]
  addSheetHeader(paymentsSheet, 'PAYMENTS', 3)
  applyBoldStyle(paymentsSheet.addRow({ date: 'Date', amount: `Amount (${currency})`, note: 'Note' }))
  payments
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p) => paymentsSheet.addRow({
      date: formatDate(p.date), amount: p.amount, note: p.note ?? '',
    }))
  paymentsSheet.addRow({})
  applyBoldStyle(paymentsSheet.addRow({ date: 'TOTAL PAID',  amount: ledger.totalPaid }))
  applyBoldStyle(paymentsSheet.addRow({ date: 'BALANCE DUE', amount: ledger.balance }))
  if (ledger.credit > 0) {
    applyBoldStyle(paymentsSheet.addRow({ date: 'CREDIT IN HAND', amount: ledger.credit }))
  }

  // ── Breaks sheet ────────────────────────────────────────────
  if (myBreaks.length) {
    const breaksSheet = wb.addWorksheet('Breaks')
    breaksSheet.columns = [
      { key: 'from',   width: 14 },
      { key: 'to',     width: 14 },
      { key: 'days',   width: 8  },
      { key: 'reason', width: 30 },
    ]
    addSheetHeader(breaksSheet, 'BREAKS', 4)
    applyBoldStyle(breaksSheet.addRow({ from: 'From', to: 'To', days: 'Days', reason: 'Reason' }))
    myBreaks
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .forEach((b) => {
        const days =
          Math.round(
            (Date.parse(`${b.endDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`)) / 86_400_000,
          ) + 1
        breaksSheet.addRow({
          from: formatDate(b.startDate), to: formatDate(b.endDate), days, reason: b.reason ?? '',
        })
      })
  }

  // ── Summary sheet ────────────────────────────────────────────
  const summarySheet = wb.addWorksheet('Summary')
  summarySheet.columns = [{ key: 'k', width: 22 }, { key: 'v', width: 30 }]
  addSheetHeader(summarySheet, 'SUMMARY', 2)
  applyBoldStyle(summarySheet.addRow({ k: 'Field', v: 'Value' }))

  summarySheet.addRow({ k: 'Student',       v: student.name })
  summarySheet.addRow({ k: 'City',          v: student.city ?? '' })
  summarySheet.addRow({ k: 'Rate',          v: `${student.ratePerHour} ${currency}/${isMonthly ? 'month' : 'hr'}` })
  summarySheet.addRow({ k: 'Billing anchor', v: student.billingAnchorDate ? formatDate(student.billingAnchorDate) : '—' })
  if (student.endDate) summarySheet.addRow({ k: 'Left on', v: formatDate(student.endDate) })
  summarySheet.addRow({ k: 'Exported',      v: formatDate(todayISO()) })
  summarySheet.addRow({})
  summarySheet.addRow({ k: 'Total Hours',   v: totalHours })
  summarySheet.addRow({ k: 'Cycles Billed', v: ledger.cycles.length })
  summarySheet.addRow({ k: 'Total Earned',  v: ledger.totalDue })
  summarySheet.addRow({ k: 'Total Paid',    v: ledger.totalPaid })
  applyBoldStyle(summarySheet.addRow({ k: 'Balance Due', v: ledger.balance }))
  if (ledger.credit > 0) {
    applyBoldStyle(summarySheet.addRow({ k: 'Credit In Hand', v: ledger.credit }))
  }

  await downloadWorkbook(wb, `${student.name}-billing-${todayISO()}.xlsx`)
}

/**
 * Export ALL students summary as a .xlsx file.
 */
export async function exportAllStudentsSummaryExcel(
  students: Student[],
  sessions: Session[],
  payments: Payment[],
  breaks: Break[] = [],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Overview sheet ───────────────────────────────────────────
  const overviewSheet = wb.addWorksheet('Summary')
  overviewSheet.columns = [
    { key: 'student',  width: 18 },
    { key: 'period',   width: 40 },
    { key: 'hours',    width: 13 },
    { key: 'rate',     width: 12 },
    { key: 'earned',   width: 14 },
    { key: 'paid',     width: 14 },
    { key: 'balance',  width: 14 },
    { key: 'currency', width: 10 },
  ]

  overviewSheet.addRow(['TUTORSPAD', '', '', '', '', '', '', ''])
  overviewSheet.mergeCells('A1:H1')
  const overviewTitle = overviewSheet.getCell('A1')
  overviewTitle.value = 'TUTORSPAD'
  overviewTitle.font = { bold: true, size: 16 }
  overviewTitle.alignment = { horizontal: 'center', vertical: 'middle' }
  overviewSheet.getRow(1).height = 32

  const overviewHeader = overviewSheet.addRow({
    student: 'Student', period: 'Billing Period', hours: 'Hours Taught',
    rate: 'Rate', earned: 'Earned', paid: 'Paid', balance: 'Balance', currency: 'Currency',
  })
  applyBoldStyle(overviewHeader)

  students.forEach((student) => {
    const studentSessions = sessions.filter((x) => x.studentId === student.id)
    const ledger   = getStudentLedger(student, sessions, payments, breaks)
    const currency = student.currency ?? DEFAULT_CURRENCY
    const isMonthly = (student.rateType ?? 'hourly') === 'monthly'

    if (ledger.cycles.length === 0) {
      overviewSheet.addRow({
        student: student.name, period: '—', hours: 0,
        rate: student.ratePerHour, earned: 0, paid: 0, balance: 0, currency,
      })
    } else {
      ledger.cycles.forEach((c) =>
        overviewSheet.addRow({
          student: student.name,
          period: isMonthly ? cycleLabel(c) : c.label,
          hours: c.hours, rate: c.rate,
          earned: c.amount, paid: c.paid, balance: c.balance, currency,
        }),
      )
    }

    const totalHours = studentSessions.reduce((sum, x) => sum + x.hours, 0)
    const totalRow = overviewSheet.addRow({
      student: `${student.name} TOTAL`, period: 'ALL TIME', hours: totalHours,
      rate: '', earned: ledger.totalDue, paid: ledger.totalPaid,
      balance: ledger.balance, currency,
    })
    totalRow.font = { bold: true }
    overviewSheet.addRow({})
  })

  // ── One sheet per student ────────────────────────────────────
  students.forEach((student) => {
    const currency  = student.currency ?? DEFAULT_CURRENCY
    const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
    const studentSessions = sessions
      .filter((x) => x.studentId === student.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    const studentPayments = payments
      .filter((x) => x.studentId === student.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    const ledger = getStudentLedger(student, sessions, payments, breaks)

    const sheetName = student.name.replace(/[\\/:*?[\]]/g, '').slice(0, 31)
    const sheet = wb.addWorksheet(sheetName)
    sheet.columns = [
      { key: 'date',   width: 30 },
      { key: 'type',   width: 12 },
      { key: 'hours',  width: 8  },
      { key: 'amount', width: 16 },
    ]

    sheet.addRow(['TUTORSPAD', '', '', ''])
    sheet.mergeCells('A1:D1')
    const appTitleCell = sheet.getCell('A1')
    appTitleCell.value = 'TUTORSPAD'
    appTitleCell.font = { bold: true, size: 16 }
    appTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 32

    sheet.addRow([student.name, '', '', ''])
    sheet.mergeCells('A2:D2')
    const nameTitleCell = sheet.getCell('A2')
    nameTitleCell.value = student.name
    nameTitleCell.font = { bold: true, size: 13 }
    nameTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(2).height = 24

    sheet.addRow({})

    const studentHeader = sheet.addRow({
      date: 'Date', type: 'Type', hours: 'Hours', amount: `Amount (${currency})`,
    })
    applyBoldStyle(studentHeader)
    studentSessions.forEach((s) => {
      const isExtra = s.type === 'extra'
      sheet.addRow({
        date: formatDate(s.date), type: s.type, hours: s.hours,
        amount: isMonthly
          ? (isExtra ? (s.extraAmount ?? 0) : null)
          : (isExtra && typeof s.extraAmount === 'number'
              ? s.extraAmount
              : s.hours * student.ratePerHour),
      })
    })

    sheet.addRow({})
    const cycleHeader = sheet.addRow({ date: 'BILLING CYCLES', type: '', hours: 'Hours', amount: 'Total' })
    cycleHeader.font = { bold: true }
    ledger.cycles.forEach((c) =>
      sheet.addRow({
        date: isMonthly ? cycleLabel(c) : c.label, type: '', hours: c.hours, amount: c.amount,
      }),
    )

    sheet.addRow({})
    const totalHours = studentSessions.reduce((sum, s) => sum + s.hours, 0)
    applyBoldStyle(
      sheet.addRow({ date: 'TOTAL EARNED', type: '', hours: totalHours, amount: ledger.totalDue }),
    )

    sheet.addRow({})
    const paymentHeader = sheet.addRow({ date: 'PAYMENTS', type: `Amount (${currency})` })
    paymentHeader.font = { bold: true }
    studentPayments.forEach((p) =>
      sheet.addRow({ date: formatDate(p.date), type: '', hours: null, amount: p.amount }),
    )
    applyBoldStyle(sheet.addRow({ date: 'TOTAL PAID',  type: '', hours: null, amount: ledger.totalPaid }))
    applyBoldStyle(sheet.addRow({ date: 'BALANCE DUE', type: '', hours: null, amount: ledger.balance }))
    if (ledger.credit > 0) {
      applyBoldStyle(sheet.addRow({ date: 'CREDIT IN HAND', type: '', hours: null, amount: ledger.credit }))
    }
  })

  await downloadWorkbook(wb, `tutorspad-summary-${todayISO()}.xlsx`)
}
