import { useState, useMemo } from 'react'
import { Plus, Trash2, Pencil, SlidersHorizontal, X } from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import ConfirmModal from '@components/shared/ConfirmModal'
import SessionForm from '@components/sessions/SessionForm'
import FilterPanel from '@components/sessions/FilterPanel'
import StudentAvatar from '@components/shared/StudentAvatar'
import useAppStore from '@store/useStore'
import { formatDate } from '@utils/billing'
import { getBillingCycles, findCycleForDate } from '@utils/billingCore'
import { formatMonthLong, formatDayMonth } from '@utils/date'
import { useToast } from '@hooks/useToast'
import type { Session } from '@/types'

export default function Sessions() {
  const students      = useAppStore((s) => s.students)
  const sessions      = useAppStore((s) => s.sessions)
  const breaks        = useAppStore((s) => s.breaks)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const { showToast } = useToast()

  const [showLog,           setShowLog]           = useState(false)
  const [editSession,       setEditSession]       = useState<Session | null>(null)
  const [showFilters,       setShowFilters]       = useState(false)
  const [activeMonth,       setActiveMonth]       = useState<string | null>(null)
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null)
  const [filters, setFilters] = useState({ studentId: 'all', dateFrom: '', dateTo: '' })

  const hasActiveFilters = filters.studentId !== 'all' || !!filters.dateFrom || !!filters.dateTo

  // All unique months that have at least one session, newest first
  const availableMonths = useMemo(() => {
    const set = new Set(sessions.map((s) => s.date.slice(0, 7)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [sessions])

  // Apply month tab + advanced filters together
  const filtered = useMemo(() => {
    return [...sessions]
      .filter((s) => !activeMonth || s.date.startsWith(activeMonth))
      .filter((s) => filters.studentId === 'all' || s.studentId === filters.studentId)
      .filter((s) => !filters.dateFrom || s.date >= filters.dateFrom)
      .filter((s) => !filters.dateTo   || s.date <= filters.dateTo)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [sessions, activeMonth, filters])

  function handleDelete(id: string) {
    deleteSession(id)
    showToast('Session removed', 'info')
    setConfirmDeleteId(null)
  }

  const subtitle = hasActiveFilters || activeMonth
    ? `${filtered.length} of ${sessions.length} sessions`
    : `${sessions.length} sessions`

  return (
    <div>
      <Header
        title="Sessions"
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`relative p-2 rounded-xl border transition-colors ${
                hasActiveFilters
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-primary-400 hover:text-primary-600'
              }`}
              aria-label="Filter sessions"
            >
              {showFilters ? <X size={16} /> : <SlidersHorizontal size={16} />}
              {hasActiveFilters && !showFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
              )}
            </button>
            <button onClick={() => setShowLog(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Log
            </button>
          </div>
        }
      />

      {/* ── Month tab strip ───────────────────────────────────────────────── */}
      {availableMonths.length > 1 && (
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveMonth(null)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                activeMonth === null
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              All
            </button>
            {availableMonths.map((ym) => {
              const count = sessions.filter((s) => s.date.startsWith(ym)).length
              return (
                <button
                  key={ym}
                  onClick={() => setActiveMonth(ym)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    activeMonth === ym
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  {formatMonthLong(ym)}
                  <span className={`ml-1.5 text-[10px] ${activeMonth === ym ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {showFilters && (
        <FilterPanel
          students={students}
          sessions={sessions}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({ studentId: 'all', dateFrom: '', dateTo: '' })}
        />
      )}

      {/* ── Session list ──────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📚</p>
            <p className="text-sm">
              {sessions.length === 0 ? 'No sessions logged yet' : 'No sessions match the filter'}
            </p>
          </div>
        ) : (
          filtered.map((session) => {
            const student = students.find((s) => s.id === session.studentId)
            return (
              <div key={session.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <StudentAvatar name={student?.name ?? '?'} color={student?.color ?? '#6366f1'} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {student?.name ?? 'Unknown'}
                      </p>
                      {session.type === 'extra' && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                          Extra
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {formatDate(session.date)}{session.note ? ` · ${session.note}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <p className="text-sm font-semibold text-gray-900 mr-1">{session.hours}h</p>
                  <button
                    onClick={() => setEditSession(session)}
                    aria-label="Edit session"
                    className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-300 hover:text-primary-500 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(session.id)}
                    aria-label="Delete session"
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Modal isOpen={showLog} onClose={() => setShowLog(false)} title="Log session">
        <SessionForm students={students} onClose={() => setShowLog(false)} />
      </Modal>

      <Modal
        isOpen={!!editSession}
        onClose={() => setEditSession(null)}
        title={`Edit – ${students.find((s) => s.id === editSession?.studentId)?.name ?? 'session'} session`}
      >
        {editSession && (
          <SessionForm
            session={editSession}
            students={students}
            onClose={() => setEditSession(null)}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        message={(() => {
          const s = sessions.find((x) => x.id === confirmDeleteId)
          if (!s) return 'Are you sure you want to delete this session? This cannot be undone.'

          // "Billed" means this session's own cycle is settled — not that some
          // payment happened to land in the same calendar month.
          const student = students.find((x) => x.id === s.studentId)
          if (!student) return 'Are you sure you want to delete this session? This cannot be undone.'

          const cycle = findCycleForDate(
            getBillingCycles(student, sessions, breaks), s.date,
          )
          const settled = cycle && cycle.amount > 0 && cycle.balance <= 0

          if (!cycle) {
            return 'This session falls outside every billing cycle, so deleting it will not change any amount.'
          }
          if (settled && s.type === 'extra' && (s.extraAmount ?? 0) > 0) {
            return `This extra class is part of a settled cycle (${formatDayMonth(cycle.start)} → ` +
              `${formatDayMonth(cycle.end)}). Deleting it removes its charge and will leave a credit balance.`
          }
          if (settled) {
            return `This session belongs to a cycle that's already paid up (${formatDayMonth(cycle.start)} → ` +
              `${formatDayMonth(cycle.end)}). Deleting it won't change the fee — the cycle is charged either way.`
          }
          return 'Are you sure you want to delete this session? This cannot be undone.'
        })()}
      />
    </div>
  )
}
