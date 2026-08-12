import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Student, Session, Payment, Break, Settings, StudentLedger } from '@/types'
import { STORE_NAME, DEFAULT_RATE_TYPE, DEFAULT_CURRENCY } from '@constants'
import { getStudentLedger } from '@utils/billingCore'
import { migrateStudent, migrateStudents } from '@utils/migrate'
import { todayISO } from '@utils/date'

/** Bump when the persisted shape changes; `migrate` below backfills. */
const STORE_VERSION = 2

/** Exactly what `partialize` writes to storage. */
interface PersistedState {
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks: Break[]
  settings: Settings
}

const DEFAULT_SETTINGS: Settings = {
  teacherName: 'Teacher',
  teacherTimezone: 'Asia/Kolkata',
  dailyReminderTime: '20:00',
  reminderEnabled: false,
  currency: DEFAULT_CURRENCY,
  onboardingCompleted: false,
}

interface StoreState {
  // ── State ────────────────────────────────────────────────────────────────
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks: Break[]
  pendingReminders: string[]  // studentIds — NOT persisted, in-memory only
  settings: Settings

  // ── Student actions ──────────────────────────────────────────────────────
  addStudent: (student: Omit<Student, 'id' | 'createdAt' | 'rateHistory'>) => void
  updateStudent: (id: string, updates: Partial<Student>) => void
  deleteStudent: (id: string) => void

  // ── Session actions ──────────────────────────────────────────────────────
  addSession: (session: Omit<Session, 'id' | 'createdAt'>) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void

  // ── Payment actions ──────────────────────────────────────────────────────
  addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => void
  updatePayment: (id: string, updates: Partial<Payment>) => void
  deletePayment: (id: string) => void

  // ── Break actions ────────────────────────────────────────────────────────
  addBreak: (brk: Omit<Break, 'id' | 'createdAt'>) => void
  updateBreak: (id: string, updates: Partial<Break>) => void
  deleteBreak: (id: string) => void
  getBreaksByStudent: (studentId: string) => Break[]

  // ── Settings ─────────────────────────────────────────────────────────────
  updateSettings: (updates: Partial<Settings>) => void

  // ── Selectors (computed) ─────────────────────────────────────────────────
  getStudentById: (id: string) => Student | undefined
  getSessionsByStudent: (studentId: string) => Session[]
  getPaymentsByStudent: (studentId: string) => Payment[]
  getTotalHours: (studentId: string) => number
  getLedger: (studentId: string) => StudentLedger
  getTotalDue: (studentId: string) => number
  getTotalPaid: (studentId: string) => number
  getBalance: (studentId: string) => number
  getCredit: (studentId: string) => number

  // ── Pending reminder actions ─────────────────────────────────────────────
  addPendingReminder: (studentId: string) => void
  dismissPendingReminder: (studentId: string) => void

  // ── Backup restore ───────────────────────────────────────────────────────
  restoreBackup: (
    students: Student[], sessions: Session[], payments: Payment[], breaks?: Break[],
  ) => void
}

const EMPTY_LEDGER: StudentLedger = {
  cycles: [], totalDue: 0, totalPaid: 0, balance: 0, credit: 0, unbilled: [],
}

const useAppStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // ── Initial state ─────────────────────────────────────────────────────
      students: [],
      sessions: [],
      payments: [],
      breaks: [],
      pendingReminders: [], // intentionally not persisted — resets on reload
      settings: DEFAULT_SETTINGS,

      // ── Student actions ───────────────────────────────────────────────────
      addStudent: (student) =>
        set((state) => {
          const anchor = student.billingAnchorDate || todayISO()
          return {
            students: [
              ...state.students,
              {
                ...student,
                billingAnchorDate: anchor,
                rateHistory: [{
                  effectiveFrom: anchor,
                  ratePerHour: student.ratePerHour,
                  rateType: student.rateType,
                }],
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
              },
            ],
          }
        }),

      /**
       * A rate change appends to the timeline instead of overwriting it, so
       * past cycles keep the price they were actually billed at. The new rate
       * takes effect today, which means the cycle in progress is unaffected
       * (cycles are priced on their start date) and the next one picks it up.
       */
      updateStudent: (id, updates) =>
        set((state) => ({
          students: state.students.map((s) => {
            if (s.id !== id) return s

            const next = { ...s, ...updates }
            const rateChanged =
              (updates.ratePerHour !== undefined && updates.ratePerHour !== s.ratePerHour) ||
              (updates.rateType !== undefined && updates.rateType !== s.rateType)

            if (!rateChanged) return next

            const effectiveFrom = todayISO()
            const history = [...(s.rateHistory ?? [])].filter(
              (r) => r.effectiveFrom !== effectiveFrom,
            )
            history.push({
              effectiveFrom,
              ratePerHour: next.ratePerHour,
              rateType: next.rateType,
            })
            history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
            return { ...next, rateHistory: history }
          }),
        })),

      deleteStudent: (id) =>
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
          sessions: state.sessions.filter((s) => s.studentId !== id),
          payments: state.payments.filter((p) => p.studentId !== id),
          breaks:   state.breaks.filter((b) => b.studentId !== id),
        })),

      // ── Session actions ───────────────────────────────────────────────────
      addSession: (session) =>
        set((state) => ({
          sessions: [
            ...state.sessions,
            { ...session, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updateSession: (id, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),

      // ── Payment actions ───────────────────────────────────────────────────
      addPayment: (payment) =>
        set((state) => ({
          payments: [
            ...state.payments,
            { ...payment, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updatePayment: (id, updates) =>
        set((state) => ({
          payments: state.payments.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      deletePayment: (id) =>
        set((state) => ({ payments: state.payments.filter((p) => p.id !== id) })),

      // ── Break actions ─────────────────────────────────────────────────────
      addBreak: (brk) =>
        set((state) => ({
          breaks: [
            ...state.breaks,
            { ...brk, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updateBreak: (id, updates) =>
        set((state) => ({
          breaks: state.breaks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),

      deleteBreak: (id) =>
        set((state) => ({ breaks: state.breaks.filter((b) => b.id !== id) })),

      getBreaksByStudent: (studentId) =>
        get()
          .breaks.filter((b) => b.studentId === studentId)
          .sort((a, b) => b.startDate.localeCompare(a.startDate)),

      // ── Backup restore ────────────────────────────────────────────────────
      restoreBackup: (students, sessions, payments, breaks = []) =>
        set({
          students: migrateStudents(students, sessions),
          sessions,
          payments,
          breaks,
        }),

      // ── Settings ──────────────────────────────────────────────────────────
      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),

      // ── Selectors ─────────────────────────────────────────────────────────
      getStudentById: (id) => get().students.find((s) => s.id === id),

      getSessionsByStudent: (studentId) =>
        get()
          .sessions.filter((s) => s.studentId === studentId)
          .sort((a, b) => b.date.localeCompare(a.date)),

      getPaymentsByStudent: (studentId) =>
        get()
          .payments.filter((p) => p.studentId === studentId)
          .sort((a, b) => b.date.localeCompare(a.date)),

      getTotalHours: (studentId) =>
        get()
          .sessions.filter((s) => s.studentId === studentId)
          .reduce((sum, s) => sum + s.hours, 0),

      /** Single computed source of truth — every billing figure comes from here. */
      getLedger: (studentId) => {
        const { students, sessions, payments, breaks } = get()
        const student = students.find((s) => s.id === studentId)
        if (!student) return EMPTY_LEDGER
        return getStudentLedger(student, sessions, payments, breaks)
      },

      getTotalDue:  (studentId) => get().getLedger(studentId).totalDue,
      getTotalPaid: (studentId) => get().getLedger(studentId).totalPaid,
      getBalance:   (studentId) => get().getLedger(studentId).balance,
      getCredit:    (studentId) => get().getLedger(studentId).credit,

      // ── Pending reminders ─────────────────────────────────────────────────
      addPendingReminder: (studentId) =>
        set((state) => ({
          pendingReminders: state.pendingReminders.includes(studentId)
            ? state.pendingReminders
            : [...state.pendingReminders, studentId],
        })),

      dismissPendingReminder: (studentId) =>
        set((state) => ({
          pendingReminders: state.pendingReminders.filter((id) => id !== studentId),
        })),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        students: state.students,
        sessions: state.sessions,
        payments: state.payments,
        breaks: state.breaks,
        settings: state.settings,
      }),
      /**
       * v1 → v2: adds billing anchors, rate history and the breaks list.
       * Backfills in place; no data is dropped or reset.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PersistedState>
        const sessions = state.sessions ?? []
        const students = state.students ?? []
        return {
          students: version < 2 ? migrateStudents(students, sessions) : students,
          sessions,
          payments: state.payments ?? [],
          breaks: state.breaks ?? [],
          settings: state.settings ?? DEFAULT_SETTINGS,
        }
      },
      /** Belt and braces: heal any record that slipped through half-formed. */
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.breaks ??= []
        state.students = state.students.map((s) => migrateStudent(s, state.sessions ?? []))
      },
    },
  ),
)

export default useAppStore
