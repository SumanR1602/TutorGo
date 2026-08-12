import { useState, useMemo } from 'react'
import useAppStore from '@store/useStore'
import { formatDate } from '@utils/billing'
import { getStudentLedger, findCycleForDate } from '@utils/billingCore'
import { formatDayMonth } from '@utils/date'
import { Trash2, BookOpen } from 'lucide-react'
import { useToast } from '@hooks/useToast'
import ConfirmModal from '../shared/ConfirmModal'
import type { Student } from '@/types'

interface StudentSessionHistoryProps {
  student: Student
}

export default function StudentSessionHistory({ student }: StudentSessionHistoryProps) {
  const allSessions   = useAppStore((s) => s.sessions)
  const payments      = useAppStore((s) => s.payments)
  const breaks        = useAppStore((s) => s.breaks)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const { showToast } = useToast()

  const sessions = useMemo(
    () => allSessions
      .filter((s) => s.studentId === student.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allSessions, student.id],
  )

  const ledger = useMemo(
    () => getStudentLedger(student, allSessions, payments, breaks),
    [student, allSessions, payments, breaks],
  )

  const totalHours = sessions.reduce((sum, s) => sum + s.hours, 0)
  /** Hours the cycles actually account for — differs if any session is unbilled. */
  const billedHours = ledger.cycles.reduce((sum, c) => sum + c.hours, 0)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function handleDelete(sessionId: string, sessionDate: string) {
    deleteSession(sessionId)
    showToast(`Session on ${sessionDate} removed`, 'info')
    setConfirmDeleteId(null)
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <BookOpen size={36} className="mb-3 opacity-40" />
        <p className="text-sm">No sessions logged yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-indigo-700">{totalHours.toFixed(1)}h</p>
          <p className="text-[10px] text-indigo-400 mt-0.5">Total hours</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-700">{sessions.length}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Sessions logged</p>
        </div>
      </div>

      {/* Any session outside every cycle contributes nothing — say so loudly. */}
      {ledger.unbilled.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-800 leading-snug">
            {ledger.unbilled.length} session{ledger.unbilled.length !== 1 ? 's fall' : ' falls'} outside
            {' '}{student.name}'s billing period ({billedHours.toFixed(1)}h of {totalHours.toFixed(1)}h
            are billed). Move the billing start date back, or delete them.
          </p>
        </div>
      )}

      <div className="space-y-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{session.hours}h</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  session.type === 'extra'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {session.type}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(session.date)}</p>
              {session.note && <p className="text-xs text-gray-500 truncate mt-0.5">{session.note}</p>}
            </div>
            <button
              onClick={() => setConfirmDeleteId(session.id)}
              aria-label="Delete session"
              className="p-1.5 ml-2 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const s = sessions.find((x) => x.id === confirmDeleteId)
          if (s) handleDelete(s.id, s.date)
        }}
        message={(() => {
          const s = sessions.find((x) => x.id === confirmDeleteId)
          if (!s) return 'Are you sure you want to delete this session? This cannot be undone.'

          // "Billed" means the cycle it belongs to is settled — not that some
          // payment happened to land in the same calendar month.
          const cycle = findCycleForDate(ledger.cycles, s.date)
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
