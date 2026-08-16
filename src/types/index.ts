// ─── Core domain types ────────────────────────────────────────────────────────

export type RateType = 'hourly' | 'monthly'

/**
 * A rate as it applied from a given date onward. Cycles are priced with the
 * rate in force on their *start* date, so raising a rate never rewrites
 * history or re-prices an invoice you already sent.
 */
export interface RateChange {
  effectiveFrom: string   // "YYYY-MM-DD"
  ratePerHour: number     // per hour, or per cycle when rateType is 'monthly'
  rateType: RateType
}

export interface Student {
  id: string
  name: string
  city: string
  timezone: string        // IANA e.g. "America/Detroit"
  ratePerHour: number     // current rate — mirror of the latest rateHistory entry
  rateType: RateType
  currency: string        // "INR" | "USD" | "GBP" etc.
  color: string           // hex e.g. "#6366f1"
  scheduledTime?: string  // "HH:mm" in IST, optional
  label?: string          // optional batch/subject tag e.g. "Math", "Batch A"
  createdAt: string       // ISO date string

  /** Day 1 of billing cycle 1. Defaults to the join date. */
  billingAnchorDate: string   // "YYYY-MM-DD"
  /** Rate timeline, oldest first. Always has at least one entry. */
  rateHistory: RateChange[]
  /** Last day taught. Set when a student leaves; final cycle is pro-rated. */
  endDate?: string            // "YYYY-MM-DD"
}

export interface Session {
  id: string
  studentId: string
  date: string            // "YYYY-MM-DD"
  hours: number
  type: 'regular' | 'extra'
  note: string
  createdAt: string
  /**
   * Charge for an 'extra' session, billed on top of the monthly fee.
   * Monthly students only — hourly students bill extras at hours × rate.
   */
  extraAmount?: number
}

/**
 * A paused stretch — student holiday, teacher cancellation, exams.
 * Break days don't consume the cycle: they push its end date forward,
 * so a fee always buys a full month of actual teaching.
 */
export interface Break {
  id: string
  studentId: string
  startDate: string       // "YYYY-MM-DD" inclusive
  endDate: string         // "YYYY-MM-DD" inclusive
  reason: string
  createdAt: string
}

export interface Payment {
  id: string
  studentId: string
  date: string            // "YYYY-MM-DD"
  amount: number
  note: string
  createdAt: string
}

export interface Settings {
  teacherName: string
  teacherTimezone: string
  dailyReminderTime: string  // "HH:mm"
  reminderEnabled: boolean
  currency: string
  onboardingCompleted: boolean
}

// ─── Billing types ────────────────────────────────────────────────────────────

/**
 * One billing period. For monthly students this is an anchored cycle
 * (15 Jul → 14 Aug), extended by any breaks inside it. For hourly students
 * it's a calendar month. Always derived — never persisted — so that editing
 * a break or a session re-flows the whole timeline correctly.
 */
export interface BillingCycle {
  /** Stable id, e.g. "cycle-3" or "2026-07". */
  key: string
  /** 1-based, in chronological order. */
  index: number
  start: string           // "YYYY-MM-DD" inclusive
  end: string             // "YYYY-MM-DD" inclusive
  /** End before break extension — useful for showing "extended by N days". */
  nominalEnd: string
  label: string           // "15 Jul → 25 Aug 2026" or "July 2026"
  /** Break days that pushed `end` past `nominalEnd`. */
  breakDays: number
  hours: number
  /** Rate in force on `start`. */
  rate: number
  rateType: RateType
  /** Base charge: monthly fee (pro-rated on exit) or hours × rate. */
  baseAmount: number
  /** Extra sessions billed on top of the monthly fee. */
  extraAmount: number
  /** baseAmount + extraAmount. */
  amount: number
  /** Allocated from payments, oldest cycle first. */
  paid: number
  /** amount − paid, never negative; surplus becomes `credit` on the ledger. */
  balance: number
  /** True once `start` <= today. Future cycles are listed but not charged. */
  started: boolean
  /** True when the student left mid-cycle and this cycle was pro-rated. */
  proRated: boolean
}

/** Everything the UI needs for one student, computed in a single pass. */
export interface StudentLedger {
  cycles: BillingCycle[]
  totalDue: number
  totalPaid: number
  /** totalDue − totalPaid. Positive = owed, never negative. */
  balance: number
  /** Unallocated payment surplus sitting against future cycles. */
  credit: number
  /** Sessions falling in no cycle — should be empty; surfaced if not. */
  unbilled: Session[]
}

// ─── Timezone types ───────────────────────────────────────────────────────────

export interface TimezoneOption {
  label: string
  value: string
}

export interface ConvertedTime {
  time: string  // "10:30 AM"
  date: string  // "Mon, 23 May"
}

// ─── Toast types ─────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}
