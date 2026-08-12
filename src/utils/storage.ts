/**
 * storage.ts
 * Helpers for export/import of app data.
 * Uses useStore.getState() directly instead of receiving store as parameter.
 */
import ExcelJS from 'exceljs'
import useAppStore from '@store/useStore'
import { applyBoldStyle, addSheetHeader } from './excel'
import { DEFAULT_CURRENCY } from '@constants'
import { TIMEZONE_OPTIONS } from './timezone'
import { todayISO } from './date'
import type { Student, Session, Payment, Break, Settings } from '@/types'

function tzLabel(ianaValue: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === ianaValue)?.label ?? ianaValue
}

// ── JSON backup ───────────────────────────────────────────────────────────────

interface BackupFile {
  version: number
  exportedAt: string
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks?: Break[]        // added in v2
}

export function exportBackupJSON(): void {
  const { students, sessions, payments, breaks } = useAppStore.getState()
  const backup: BackupFile = {
    version: 2,
    exportedAt: new Date().toISOString(),
    students,
    sessions,
    payments,
    breaks,
  }
  try {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `tutorspad-backup-${todayISO()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    console.error('Backup export failed:', err)
    alert('Export failed. Please try again.')
  }
}

export interface ParsedBackup {
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks: Break[]
}

/** Reads and validates a .json backup file. Throws a descriptive error if invalid. */
export async function parseBackupJSON(file: File): Promise<ParsedBackup> {
  const text = await file.text()
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  if (!Array.isArray(data.students)) throw new Error('Missing or invalid "students" array.')
  if (!Array.isArray(data.sessions)) throw new Error('Missing or invalid "sessions" array.')
  if (!Array.isArray(data.payments)) throw new Error('Missing or invalid "payments" array.')

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

  // Basic field validation. Values that would corrupt billing — negative
  // amounts, non-positive hours, malformed dates, duplicate ids — are
  // rejected here rather than silently skewing every total downstream.
  const seenStudentIds = new Set<string>()
  data.students.forEach((s, i) => {
    if (!s.id || !s.name || s.ratePerHour == null)
      throw new Error(`Student at index ${i} is missing required fields (id, name, ratePerHour).`)
    if (seenStudentIds.has(s.id))
      throw new Error(`Two students share the id "${s.id}".`)
    seenStudentIds.add(s.id)
    if (!(Number(s.ratePerHour) > 0))
      throw new Error(`Student "${s.name}" has a rate of ${s.ratePerHour}; it must be greater than zero.`)
    if (s.billingAnchorDate && !ISO_DATE.test(s.billingAnchorDate))
      throw new Error(`Student "${s.name}" has an invalid billing start date.`)
    if (s.endDate && !ISO_DATE.test(s.endDate))
      throw new Error(`Student "${s.name}" has an invalid last day.`)
    if (s.endDate && s.billingAnchorDate && s.endDate < s.billingAnchorDate)
      throw new Error(`Student "${s.name}" has a last day before their billing start date.`)
  })

  const studentIds = seenStudentIds
  const seenIds = new Set<string>()

  data.sessions.forEach((s, i) => {
    if (!s.id || !s.studentId || !s.date || s.hours == null)
      throw new Error(`Session at index ${i} is missing required fields.`)
    if (seenIds.has(s.id)) throw new Error(`Two sessions share the id "${s.id}".`)
    seenIds.add(s.id)
    if (!studentIds.has(s.studentId))
      throw new Error(`Session at index ${i} references unknown student.`)
    if (!ISO_DATE.test(s.date))
      throw new Error(`Session at index ${i} has an invalid date "${s.date}".`)
    if (!(Number(s.hours) > 0))
      throw new Error(`Session at index ${i} has ${s.hours} hours; it must be greater than zero.`)
    if (s.extraAmount != null && !(Number(s.extraAmount) >= 0))
      throw new Error(`Session at index ${i} has a negative extra charge.`)
  })

  seenIds.clear()
  data.payments.forEach((p, i) => {
    if (!p.id || !p.studentId || !p.date || p.amount == null)
      throw new Error(`Payment at index ${i} is missing required fields.`)
    if (seenIds.has(p.id)) throw new Error(`Two payments share the id "${p.id}".`)
    seenIds.add(p.id)
    if (!studentIds.has(p.studentId))
      throw new Error(`Payment at index ${i} references unknown student.`)
    if (!ISO_DATE.test(p.date))
      throw new Error(`Payment at index ${i} has an invalid date "${p.date}".`)
    if (!(Number(p.amount) > 0))
      throw new Error(`Payment at index ${i} is ${p.amount}; amounts must be greater than zero.`)
  })

  // Breaks arrived in v2 — older backups simply have none.
  const breaks = Array.isArray(data.breaks) ? data.breaks : []
  seenIds.clear()
  breaks.forEach((b, i) => {
    if (!b.id || !b.studentId || !b.startDate || !b.endDate)
      throw new Error(`Break at index ${i} is missing required fields.`)
    if (seenIds.has(b.id)) throw new Error(`Two breaks share the id "${b.id}".`)
    seenIds.add(b.id)
    if (!studentIds.has(b.studentId))
      throw new Error(`Break at index ${i} references unknown student.`)
    if (!ISO_DATE.test(b.startDate) || !ISO_DATE.test(b.endDate))
      throw new Error(`Break at index ${i} has an invalid date.`)
    if (b.endDate < b.startDate)
      throw new Error(`Break at index ${i} ends before it starts.`)
  })

  // Overlapping breaks for one student would double-count the extension.
  const byStudent = new Map<string, typeof breaks>()
  for (const b of breaks) {
    const list = byStudent.get(b.studentId) ?? []
    list.push(b)
    byStudent.set(b.studentId, list)
  }
  for (const [, list] of byStudent) {
    const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate))
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startDate <= sorted[i - 1].endDate)
        throw new Error(
          `Overlapping breaks for one student (${sorted[i - 1].startDate}→${sorted[i - 1].endDate} ` +
          `and ${sorted[i].startDate}→${sorted[i].endDate}).`,
        )
    }
  }

  return {
    students: data.students,
    sessions: data.sessions,
    payments: data.payments,
    breaks,
  }
}

export async function exportAllData(): Promise<void> {
  const { students, sessions, payments, settings } = useAppStore.getState()
  const studentMap: Record<string, string> = Object.fromEntries(
    students.map((s) => [s.id, s.name]),
  )

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Students sheet ──────────────────────────────────────────
  const studentsSheet = wb.addWorksheet('Students')
  studentsSheet.columns = [
    { key: 'name',      width: 18 },
    { key: 'city',      width: 16 },
    { key: 'tz',        width: 30 },
    { key: 'rate',      width: 10 },
    { key: 'rateType',  width: 12 },
    { key: 'currency',  width: 10 },
    { key: 'scheduled', width: 16 },
    { key: 'added',     width: 14 },
  ]
  addSheetHeader(studentsSheet, 'STUDENTS', 8)
  applyBoldStyle(studentsSheet.addRow({
    name: 'Name', city: 'City', tz: 'Timezone',
    rate: 'Rate', rateType: 'Rate Type', currency: 'Currency',
    scheduled: 'Scheduled Time', added: 'Enrolled Since',
  }))
  students.forEach((s: Student) =>
    studentsSheet.addRow({
      name: s.name, city: s.city ?? '', tz: tzLabel(s.timezone ?? ''),
      rate: s.ratePerHour, rateType: s.rateType ?? 'hourly',
      currency: s.currency ?? DEFAULT_CURRENCY, scheduled: s.scheduledTime ?? '',
      added: s.createdAt ? s.createdAt.slice(0, 10) : '',
    }),
  )

  // ── Sessions sheet ──────────────────────────────────────────
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { key: 'student', width: 18 },
    { key: 'date',    width: 14 },
    { key: 'hours',   width: 8  },
    { key: 'type',    width: 10 },
    { key: 'note',    width: 30 },
  ]
  addSheetHeader(sessionsSheet, 'SESSIONS', 5)
  applyBoldStyle(sessionsSheet.addRow({
    student: 'Student', date: 'Date', hours: 'Hours', type: 'Type', note: 'Note',
  }))
  sessions
    .slice()
    .sort((a: Session, b: Session) => b.date.localeCompare(a.date))
    .forEach((s: Session) =>
      sessionsSheet.addRow({
        student: studentMap[s.studentId] ?? '',
        date: s.date, hours: s.hours, type: s.type, note: s.note ?? '',
      }),
    )

  // ── Payments sheet ──────────────────────────────────────────
  const paymentsSheet = wb.addWorksheet('Payments')
  paymentsSheet.columns = [
    { key: 'student', width: 18 },
    { key: 'date',    width: 14 },
    { key: 'amount',  width: 14 },
    { key: 'note',    width: 30 },
  ]
  addSheetHeader(paymentsSheet, 'PAYMENTS', 4)
  applyBoldStyle(paymentsSheet.addRow({
    student: 'Student', date: 'Date', amount: 'Amount', note: 'Note',
  }))
  payments
    .slice()
    .sort((a: Payment, b: Payment) => b.date.localeCompare(a.date))
    .forEach((p: Payment) =>
      paymentsSheet.addRow({
        student: studentMap[p.studentId] ?? '',
        date: p.date, amount: p.amount, note: p.note ?? '',
      }),
    )

  // ── Settings sheet ──────────────────────────────────────────
  const settingsSheet = wb.addWorksheet('Settings')
  settingsSheet.columns = [
    { key: 'k', width: 22 },
    { key: 'v', width: 30 },
  ]
  addSheetHeader(settingsSheet, 'SETTINGS', 2)
  applyBoldStyle(settingsSheet.addRow({ k: 'Key', v: 'Value' }))
  const s: Settings = settings
  settingsSheet.addRow({ k: 'Teacher Name',        v: s.teacherName ?? '' })
  settingsSheet.addRow({ k: 'Daily Reminder Time', v: s.dailyReminderTime ?? '' })
  settingsSheet.addRow({ k: 'Teacher Timezone',    v: s.teacherTimezone ?? '' })
  settingsSheet.addRow({ k: 'Currency',            v: s.currency ?? '' })
  settingsSheet.addRow({ k: 'Exported At',         v: new Date().toISOString() })

  try {
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tutorspad-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    console.error('Excel export failed:', err)
    alert('Export failed. Please try again.')
  }
}
