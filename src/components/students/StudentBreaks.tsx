/**
 * StudentBreaks.tsx
 * Manage the holidays / pauses that extend a student's billing cycles.
 */
import { useState, useMemo } from 'react'
import { PauseCircle, Trash2, Plus } from 'lucide-react'
import useAppStore from '@store/useStore'
import { useToast } from '@hooks/useToast'
import ConfirmModal from '../shared/ConfirmModal'
import {
  getBillingCycles, findOverlappingBreaks, isRangeFullyCovered,
} from '@utils/billingCore'
import { todayISO, formatDayMonth, daysInclusive, addMonthsClamped } from '@utils/date'
import type { Student } from '@/types'

/** A holiday longer than this is almost certainly a mistyped year. */
const MAX_BREAK_DAYS = 365

interface StudentBreaksProps {
  student: Student
}

export default function StudentBreaks({ student }: StudentBreaksProps) {
  const sessions    = useAppStore((s) => s.sessions)
  const breaks      = useAppStore((s) => s.breaks)
  const addBreak    = useAppStore((s) => s.addBreak)
  const deleteBreak = useAppStore((s) => s.deleteBreak)
  const { showToast } = useToast()

  const today = todayISO()
  const [form, setForm] = useState({ startDate: today, endDate: today, reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const isMonthly = (student.rateType ?? 'hourly') === 'monthly'

  const myBreaks = useMemo(
    () => breaks
      .filter((b) => b.studentId === student.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [breaks, student.id],
  )

  /** Cycles as they stand now — so the effect of a break is visible. */
  const cycles = useMemo(
    () => getBillingCycles(student, sessions, breaks, today),
    [student, sessions, breaks, today],
  )

  const draftDays = form.startDate && form.endDate && form.startDate <= form.endDate
    ? daysInclusive(form.startDate, form.endDate)
    : 0

  /** Live clash detection, so the problem shows before you press Add. */
  const clashes = useMemo(
    () => findOverlappingBreaks(breaks, student.id, form.startDate, form.endDate),
    [breaks, student.id, form.startDate, form.endDate],
  )
  const blocked = clashes.length > 0 || draftDays === 0 || draftDays > MAX_BREAK_DAYS

  // Planned holidays are fine, typos are not — cap the picker two years out.
  const maxDate = addMonthsClamped(today, 24)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.startDate || !form.endDate) return

    if (form.endDate < form.startDate) {
      setError('The end date must be on or after the start date.')
      return
    }

    // A holiday before billing even starts would extend nothing.
    if (student.billingAnchorDate && form.endDate < student.billingAnchorDate) {
      setError(
        `This ends before ${student.name}'s billing starts (${formatDayMonth(student.billingAnchorDate)}), ` +
        'so it would have no effect.',
      )
      return
    }

    // Catch a mistyped year before it swallows a year of billing.
    if (draftDays > MAX_BREAK_DAYS) {
      setError(`That's ${draftDays} days — over a year. Check the dates.`)
      return
    }

    // The range must not already be covered. A second holiday inside an
    // existing one would otherwise look accepted while changing nothing.
    const clashes = findOverlappingBreaks(breaks, student.id, form.startDate, form.endDate)
    if (clashes.length) {
      const list = clashes
        .map((b) => `${formatDayMonth(b.startDate)} → ${formatDayMonth(b.endDate)}`)
        .join(', ')
      setError(
        isRangeFullyCovered(breaks, student.id, form.startDate, form.endDate)
          ? `Already covered by an existing break (${list}). Nothing to add.`
          : `This overlaps an existing break (${list}). Delete or shorten that one first, ` +
            'then add a single break covering the whole period.',
      )
      return
    }

    // A class logged inside the break contradicts it — say so rather than
    // silently extending the cycle past days that were actually taught.
    const taught = sessions.filter(
      (s) => s.studentId === student.id && s.date >= form.startDate && s.date <= form.endDate,
    )
    if (taught.length) {
      setError(
        `${taught.length} session${taught.length !== 1 ? 's are' : ' is'} already logged in this range. ` +
        'Delete them first, or pick different dates.',
      )
      return
    }
    setError(null)
    addBreak({
      studentId: student.id,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim(),
    })
    showToast(`${draftDays}-day break added — cycles extended`, 'success')
    setForm({ startDate: today, endDate: today, reason: '' })
  }

  function handleDelete(id: string) {
    deleteBreak(id)
    showToast('Break removed — cycles recalculated', 'info')
    setConfirmId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
        <PauseCircle size={15} className="text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-800 leading-snug">
          {isMonthly
            ? 'Break days push the cycle end date forward, so one fee always buys a full month of teaching. The billing day shifts by the same number of days, and class reminders are paused.'
            : `${student.name} is billed hourly, so a break changes no charges — no classes means nothing billed. It does pause their daily class reminder.`}
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input
              type="date"
              className={`input ${clashes.length ? 'border-red-400 focus:ring-red-400' : ''}`}
              value={form.startDate}
              min={student.billingAnchorDate || undefined}
              max={maxDate}
              onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setError(null) }}
              required
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              className={`input ${clashes.length ? 'border-red-400 focus:ring-red-400' : ''}`}
              value={form.endDate}
              min={form.startDate}
              max={maxDate}
              onChange={(e) => { setForm({ ...form, endDate: e.target.value }); setError(null) }}
              required
            />
          </div>
        </div>

        <div>
          <label className="label">Reason (optional)</label>
          <input
            className="input"
            placeholder="e.g. Exams, family trip, teacher unavailable"
            value={form.reason}
            maxLength={80}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Live clash notice — visible before you press Add */}
        {!error && clashes.length > 0 && (
          <p className="text-xs text-red-500">
            {isRangeFullyCovered(breaks, student.id, form.startDate, form.endDate)
              ? 'These dates are already covered by an existing break.'
              : 'These dates overlap an existing break.'}
            {' '}
            {clashes
              .map((b) => `${formatDayMonth(b.startDate)} → ${formatDayMonth(b.endDate)}`)
              .join(', ')}
          </p>
        )}

        {draftDays > MAX_BREAK_DAYS && (
          <p className="text-xs text-red-500">{draftDays} days is over a year — check the dates.</p>
        )}

        {draftDays > 0 && draftDays <= MAX_BREAK_DAYS && !error && !clashes.length && isMonthly && (
          <p className="text-xs text-gray-500">
            Adds <span className="font-semibold text-gray-700">{draftDays} day{draftDays !== 1 ? 's' : ''}</span> to
            the cycle it falls in.
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={blocked}
        >
          <Plus size={15} /> Add break
        </button>
      </form>

      {/* Existing breaks */}
      <div className="space-y-2">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          Breaks ({myBreaks.length})
        </p>
        {myBreaks.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">No breaks recorded</p>
        ) : (
          myBreaks.map((b) => (
            <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {formatDayMonth(b.startDate)} → {formatDayMonth(b.endDate)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {daysInclusive(b.startDate, b.endDate)} day
                  {daysInclusive(b.startDate, b.endDate) !== 1 ? 's' : ''}
                  {b.reason ? ` · ${b.reason}` : ''}
                </p>
              </div>
              <button
                onClick={() => setConfirmId(b.id)}
                aria-label="Delete break"
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors shrink-0 ml-2"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Resulting cycles */}
      {isMonthly && cycles.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            Resulting cycles
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {cycles.slice().reverse().map((c) => (
              <div key={c.key} className="flex items-center justify-between text-xs px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className="text-gray-600">
                  {formatDayMonth(c.start)} → {formatDayMonth(c.end)}
                </span>
                {c.breakDays > 0 && (
                  <span className="text-amber-600 font-medium shrink-0 ml-2">+{c.breakDays}d</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && handleDelete(confirmId)}
        message="Remove this break? The billing cycles after it will shift back."
      />
    </div>
  )
}
