import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { getBillingCycles, earningsForMonthFromCycles } from '@utils/billingCore'
import { formatMonthShort, todayISO, currentYM as todayYM, addMonthsClamped } from '@utils/date'
import { DEFAULT_CURRENCY } from '@constants'
import type { Session, Student } from '@/types'

interface WindowOption {
  label: string
  size: number | null
}

interface MonthData {
  month: string
  totalHours: number
  totalEarnings: number
  perStudent: Array<{
    id: string
    name: string
    color: string
    hours: number
    earnings: number
  }>
}

function allSessionMonths(sessions: Session[]): string[] {
  const set = new Set(sessions.map((s) => s.date.slice(0, 7)))
  return [...set].sort()
}

function currentYM(): string {
  return todayYM()
}

const WINDOWS: WindowOption[] = [
  { label: '3M',  size: 3    },
  { label: '6M',  size: 6    },
  { label: '12M', size: 12   },
  { label: 'All', size: null },
]

type Mode = 'hours' | 'earnings'

// findLastIndex polyfill (ES2020 compatible)
function findLastIndexLE(arr: string[], cur: string): number {
  let idx = -1
  for (let i = 0; i < arr.length; i++) if (arr[i] <= cur) idx = i
  return idx
}

export default function StatsChart() {
  const students = useAppStore((s) => s.students)
  const sessions = useAppStore((s) => s.sessions)
  const breaks   = useAppStore((s) => s.breaks)

  // Only label the currency when every student shares one.
  const currencies = new Set(students.map((s) => s.currency ?? DEFAULT_CURRENCY))
  const currency   = currencies.size === 1 ? [...currencies][0] : DEFAULT_CURRENCY

  const [mode,        setMode]        = useState<Mode>('hours')
  const [winLabel,    setWinLabel]    = useState('6M')
  const [offset,      setOffset]      = useState(0)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)

  const win = WINDOWS.find((w) => w.label === winLabel)!

  const allMonths = useMemo(() => {
    const arr = allSessionMonths(sessions)
    const cur = currentYM()
    if (!arr.includes(cur)) arr.push(cur)
    return arr.sort()
  }, [sessions])

  const visibleMonths = useMemo(() => {
    if (win.size === null) return allMonths

    const cur    = currentYM()
    const endIdx = findLastIndexLE(allMonths, cur)
    if (endIdx < 0) return []

    const windowEnd   = endIdx - offset * win.size
    const windowStart = windowEnd - win.size + 1
    if (windowStart < 0) {
      const anchor = `${allMonths[Math.max(0, windowEnd)]}-01`
      const padded: string[] = []
      for (let i = win.size - 1; i >= 0; i--) {
        padded.push(addMonthsClamped(anchor, -i).slice(0, 7))
      }
      return padded
    }
    return allMonths.slice(windowStart, windowEnd + 1)
  }, [allMonths, win, offset])

  const canGoBack    = win.size !== null &&
    offset * win.size + win.size <= findLastIndexLE(allMonths, currentYM())
  const canGoForward = offset > 0

  const visibleWindows = useMemo(() => {
    const cur = currentYM()
    return WINDOWS.filter((w) => {
      if (w.size === null) return true
      const cutoffYM = addMonthsClamped(`${cur}-01`, -w.size).slice(0, 7)
      return sessions.some((s) => s.date >= cutoffYM)
    })
  }, [sessions])

  /** Build each student's cycles once, not once per visible month. */
  const cyclesByStudent = useMemo(() => {
    const today = todayISO()
    return new Map(students.map((s) => [s.id, getBillingCycles(s, sessions, breaks, today)]))
  }, [students, sessions, breaks])

  const data = useMemo<MonthData[]>(() => {
    return visibleMonths.map((month) => {
      const monthSessions = sessions.filter((s) => s.date.startsWith(month))
      let totalHours = 0, totalEarnings = 0

      const perStudent = students
        .map((student: Student) => {
          const studentSessions = monthSessions.filter((s) => s.studentId === student.id)
          // A monthly cycle is recognised in the month it starts, which can be
          // a month with no sessions of its own — so check earnings too.
          const earnings = earningsForMonthFromCycles(cyclesByStudent.get(student.id) ?? [], month)
          if (!studentSessions.length && earnings === 0) return null
          const hours = parseFloat(studentSessions.reduce((sum, s) => sum + s.hours, 0).toFixed(1))
          totalHours    += hours
          totalEarnings += earnings
          return { id: student.id, name: student.name, color: student.color ?? '#6366f1', hours, earnings }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)

      return {
        month,
        totalHours:    parseFloat(totalHours.toFixed(1)),
        totalEarnings: Math.round(totalEarnings),
        perStudent,
      }
    })
  }, [visibleMonths, sessions, students, cyclesByStudent])

  const maxVal = useMemo(
    () => Math.max(...data.map((d) => (mode === 'hours' ? d.totalHours : d.totalEarnings)), 1),
    [data, mode],
  )

  const getVal      = (d: MonthData) => mode === 'hours' ? d.totalHours : d.totalEarnings
  const fmtVal      = (d: MonthData) => mode === 'hours' ? `${d.totalHours}h` : formatCurrency(d.totalEarnings, currency)
  const fmtStudentV = (s: MonthData['perStudent'][number]) => mode === 'hours' ? `${s.hours}h` : formatCurrency(s.earnings, currency)
  const getStudentV = (s: MonthData['perStudent'][number]) => mode === 'hours' ? s.hours : s.earnings

  if (!sessions.length) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">Sessions</h2>
        <div className="flex items-center bg-gray-100 rounded-xl p-0.5 text-xs gap-0.5">
          {(['hours', 'earnings'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-lg font-medium capitalize transition-all ${
                mode === m ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {visibleWindows.length > 1 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center bg-gray-100 rounded-xl p-0.5 text-xs gap-0.5">
            {visibleWindows.map((w) => (
              <button
                key={w.label}
                onClick={() => { setWinLabel(w.label); setOffset(0); setActiveMonth(null) }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  winLabel === w.label ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {win.size !== null && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setOffset((o) => o + 1); setActiveMonth(null) }}
                disabled={!canGoBack}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 disabled:opacity-30 hover:bg-gray-200 transition-colors"
                aria-label="Earlier period"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[10px] text-gray-400 font-medium w-24 text-center select-none">
                {formatMonthShort(visibleMonths[0])} – {formatMonthShort(visibleMonths[visibleMonths.length - 1])}
              </span>
              <button
                onClick={() => { setOffset((o) => Math.max(0, o - 1)); setActiveMonth(null) }}
                disabled={!canGoForward}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 disabled:opacity-30 hover:bg-gray-200 transition-colors"
                aria-label="Later period"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {data.map((d) => {
          const pct      = maxVal > 0 ? (getVal(d) / maxVal) * 100 : 0
          const isEmpty  = d.totalHours === 0
          const isActive = activeMonth === d.month

          return (
            <div key={d.month}>
              <button
                className={`w-full text-left transition-opacity ${isEmpty ? 'opacity-30 cursor-default' : ''}`}
                onClick={() => !isEmpty && setActiveMonth(isActive ? null : d.month)}
                disabled={isEmpty}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-11 shrink-0 font-medium">
                    {formatMonthShort(d.month)}
                  </span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, #818cf8 0%, #4f46e5 100%)',
                        minWidth: pct > 0 ? '6px' : '0',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-700 w-14 text-right shrink-0">
                    {isEmpty ? '—' : fmtVal(d)}
                  </span>
                  {!isEmpty && (
                    <span className="text-gray-300 text-[9px] shrink-0 w-2">
                      {isActive ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </button>

              {isActive && d.perStudent.length > 0 && (
                <div className="mt-2 ml-[52px] space-y-1.5 pl-3 border-l-2 border-indigo-100 pb-1">
                  {d.perStudent.map((student) => {
                    const sv   = getStudentV(student)
                    const sPct = getVal(d) > 0 ? (sv / getVal(d)) * 100 : 0
                    return (
                      <div key={student.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: student.color }} />
                        <span className="text-[10px] text-gray-500 w-20 truncate shrink-0">{student.name}</span>
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${sPct}%`, backgroundColor: student.color }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-gray-600 w-14 text-right shrink-0">
                          {fmtStudentV(student)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
