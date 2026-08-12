/**
 * StudentForm.tsx
 * Unified add / edit form for a Student.
 *
 * Add mode  — no `student` prop. Calls addStudent() and shows "Add student".
 * Edit mode — pass a `student` prop. Calls updateStudent() and shows "Save changes".
 */
import { useState, useMemo } from 'react'
import useAppStore from '@store/useStore'
import { TIMEZONE_OPTIONS } from '@utils/timezone'
import CityInput from '../shared/CityInput'
import TimePicker12h from '../shared/TimePicker12h'
import { useToast } from '@hooks/useToast'
import { validateName } from '@utils/validators'
import { todayISO, addDays, addMonthsClamped, formatDayMonth } from '@utils/date'
import { COLORS, CURRENCIES, DEFAULT_TIMEZONE, DEFAULT_CURRENCY, DEFAULT_RATE_TYPE } from '@constants'
import type { Student } from '@/types'

interface StudentFormState {
  name: string
  city: string
  timezone: string
  rateType: 'hourly' | 'monthly'
  ratePerHour: string
  currency: string
  color: string
  scheduledTime: string
  label: string
  billingAnchorDate: string
  endDate: string
}

const defaultForm: StudentFormState = {
  name: '', city: '', timezone: DEFAULT_TIMEZONE,
  rateType: DEFAULT_RATE_TYPE, ratePerHour: '', currency: DEFAULT_CURRENCY,
  color: COLORS[0], scheduledTime: '', label: '',
  billingAnchorDate: todayISO(), endDate: '',
}

interface StudentFormProps {
  student?: Student   // omit for add mode, provide for edit mode
  onClose: () => void
}

export default function StudentForm({ student, onClose }: StudentFormProps) {
  const addStudent    = useAppStore((s) => s.addStudent)
  const updateStudent = useAppStore((s) => s.updateStudent)
  const students      = useAppStore((s) => s.students)
  const sessions      = useAppStore((s) => s.sessions)
  const { showToast } = useToast()

  const isEdit = !!student

  const [nameError,    setNameError]    = useState<string | null>(null)
  const [rateError,    setRateError]    = useState<string | null>(null)
  const [anchorError,  setAnchorError]  = useState<string | null>(null)
  const [dupWarning,   setDupWarning]   = useState(false)

  const [form, setForm] = useState<StudentFormState>(
    isEdit
      ? {
          name:          student.name,
          city:          student.city ?? '',
          timezone:      student.timezone,
          rateType:      (student.rateType ?? 'hourly') as 'hourly' | 'monthly',
          ratePerHour:   String(student.ratePerHour),
          currency:      student.currency ?? DEFAULT_CURRENCY,
          color:         student.color ?? COLORS[0],
          scheduledTime: student.scheduledTime ?? '',
          label:         student.label ?? '',
          billingAnchorDate: student.billingAnchorDate ?? (student.createdAt ?? '').slice(0, 10),
          endDate:       student.endDate ?? '',
        }
      : defaultForm,
  )

  const rateChanged = isEdit && parseFloat(form.ratePerHour) !== student.ratePerHour
  const typeChanged = isEdit && form.rateType !== (student.rateType ?? 'hourly')

  const today = todayISO()
  /** A year ahead is generous for onboarding; beyond that it's a typo. */
  const maxAnchor = addMonthsClamped(today, 12)
  const anchorIsFuture = form.billingAnchorDate > today

  /** Moving the anchor forward past existing sessions would unbill them. */
  const earliestSession = useMemo(() => {
    if (!isEdit) return undefined
    return sessions
      .filter((s) => s.studentId === student.id)
      .map((s) => s.date)
      .sort()[0]
  }, [isEdit, sessions, student?.id])

  const sessionsBeforeAnchor = useMemo(() => {
    if (!isEdit || !form.billingAnchorDate) return 0
    return sessions.filter(
      (s) => s.studentId === student.id && s.date < form.billingAnchorDate,
    ).length
  }, [isEdit, sessions, student?.id, form.billingAnchorDate])

  /** Preview of the first cycle, so the anchor's effect is visible up front. */
  const firstCycle = form.rateType === 'monthly' && form.billingAnchorDate
    ? `${formatDayMonth(form.billingAnchorDate)} → ${formatDayMonth(addDays(addMonthsClamped(form.billingAnchorDate, 1), -1))}`
    : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = form.name.trim()

    // Name validation
    const err = validateName(trimmedName)
    if (err) { setNameError(err); return }
    setNameError(null)

    // Rate validation — a zero rate used to silently do nothing.
    const rate = parseFloat(form.ratePerHour)
    if (!Number.isFinite(rate) || rate <= 0) {
      setRateError('Enter a rate greater than zero.')
      return
    }
    setRateError(null)

    // Anchor validation — moving it forward past existing sessions would take
    // them out of every cycle, so their charges would silently disappear.
    if (!form.billingAnchorDate) {
      setAnchorError('Pick a billing start date.')
      return
    }
    if (sessionsBeforeAnchor > 0) {
      setAnchorError(
        `${sessionsBeforeAnchor} session${sessionsBeforeAnchor !== 1 ? 's' : ''} would fall outside ` +
        `billing. Set the start date to ${formatDayMonth(earliestSession!)} or earlier.`,
      )
      return
    }
    if (form.endDate && form.endDate < form.billingAnchorDate) {
      setAnchorError('The last day can\'t be before the billing start date.')
      return
    }
    setAnchorError(null)

    // Duplicate check (skip own record in edit mode)
    const isDuplicate = students.some(
      (s) =>
        s.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (!isEdit || s.id !== student.id),
    )
    if (isDuplicate && !dupWarning) {
      setDupWarning(true)
      return
    }
    setDupWarning(false)

    const data = {
      ...form,
      name: trimmedName,
      ratePerHour: rate,
      billingAnchorDate: form.billingAnchorDate || todayISO(),
      endDate: form.endDate || undefined,
    }
    if (isEdit) {
      updateStudent(student.id, data)
      showToast(`${trimmedName} updated`, 'success')
    } else {
      addStudent(data)
      showToast(`${trimmedName} added`, 'success')
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="label">Student name *</label>
        <input
          className={`input ${nameError ? 'border-red-400 focus:ring-red-400' : ''}`}
          placeholder="e.g. Shri Ram"
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value })
            setNameError(null)
            setDupWarning(false)
          }}
          maxLength={50}
          required
        />
        {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
        {dupWarning && !nameError && (
          <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700 font-medium">
              A student named "{form.name.trim()}" already exists.
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Add a label below to tell them apart, or submit again to save anyway.
            </p>
          </div>
        )}
      </div>

      {/* Label */}
      <div>
        <label className="label">Label / Batch <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          className="input"
          placeholder="e.g. Math, Batch A, Morning"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          maxLength={30}
        />
        <p className="text-xs text-gray-400 mt-1">Shown as a badge on the student card to tell apart students with the same name.</p>
      </div>

      {/* City (with autocomplete + timezone detection) */}
      <div>
        <label className="label">City</label>
        <CityInput
          value={form.city}
          onChange={(city) => setForm((f) => ({ ...f, city }))}
          onTimezoneDetected={(tz) => setForm((f) => ({ ...f, timezone: tz }))}
        />
      </div>

      {/* Timezone */}
      <div>
        <label className="label">Timezone *</label>
        <select
          className="input"
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* Rate type toggle + rate + currency */}
      <div>
        <label className="label">Rate type *</label>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-3">
          {(['hourly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, rateType: t })}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.rateType === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'hourly' ? 'Per Hour' : 'Per Month'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              {form.rateType === 'monthly' ? 'Monthly rate *' : 'Rate per hour *'}
            </label>
            <input
              className={`input ${rateError ? 'border-red-400 focus:ring-red-400' : ''}`}
              type="number"
              placeholder={form.rateType === 'monthly' ? '5000' : '500'}
              value={form.ratePerHour}
              onChange={(e) => { setForm({ ...form, ratePerHour: e.target.value }); setRateError(null) }}
              required
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="label">Currency</label>
            <select
              className="input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {rateError && <p className="text-xs text-red-500 mt-1">{rateError}</p>}

        {(rateChanged || typeChanged) && (
          <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
            <p className="text-xs text-indigo-700">
              {typeChanged
                ? `Switching to ${form.rateType === 'monthly' ? 'monthly' : 'hourly'} takes effect today. ` +
                  'The cycle in progress is pro-rated up to today, and everything before it keeps ' +
                  'the price it was billed at.'
                : 'The new rate applies from the next cycle onward. Cycles already billed keep ' +
                  'the price they were charged at.'}
            </p>
          </div>
        )}
      </div>

      {/* Billing cycle */}
      <div>
        <label className="label">
          {form.rateType === 'monthly' ? 'Billing start date *' : 'Start date'}
        </label>
        <input
          type="date"
          className={`input ${anchorError ? 'border-red-400 focus:ring-red-400' : ''}`}
          value={form.billingAnchorDate}
          max={maxAnchor}
          onChange={(e) => { setForm({ ...form, billingAnchorDate: e.target.value }); setAnchorError(null) }}
          required
        />
        {anchorError ? (
          <p className="text-xs text-red-500 mt-1">{anchorError}</p>
        ) : anchorIsFuture ? (
          <p className="text-xs text-amber-600 mt-1">
            Billing starts {formatDayMonth(form.billingAnchorDate)} — nothing is charged, and no
            sessions can be logged, before then.
          </p>
        ) : sessionsBeforeAnchor > 0 ? (
          <p className="text-xs text-red-500 mt-1">
            {sessionsBeforeAnchor} existing session{sessionsBeforeAnchor !== 1 ? 's fall' : ' falls'} before
            this date and would stop being billed. Move it back to {formatDayMonth(earliestSession!)}.
          </p>
        ) : firstCycle ? (
          <p className="text-xs text-gray-400 mt-1">
            First cycle runs <span className="font-medium text-gray-600">{firstCycle}</span>.
            Holidays logged under Breaks push these dates forward.
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">
            Hourly students are billed per calendar month, so this is for reference only.
          </p>
        )}
      </div>

      {/* Leave date — edit mode only */}
      {isEdit && (
        <div>
          <label className="label">
            Last day <span className="text-gray-400 font-normal">(only if they've left)</span>
          </label>
          <input
            type="date"
            className="input"
            value={form.endDate}
            min={form.billingAnchorDate}
            max={today}
            onChange={(e) => { setForm({ ...form, endDate: e.target.value }); setAnchorError(null) }}
          />
          <p className="text-xs text-gray-400 mt-1">
            {form.endDate
              ? 'The final cycle is charged pro-rata for the days actually taught; anything overpaid shows as credit.'
              : 'Leave blank while the student is still active.'}
          </p>
        </div>
      )}

      {/* Scheduled time */}
      <div>
        <label className="label">Scheduled class time (IST) — optional</label>
        <TimePicker12h
          value={form.scheduledTime}
          onChange={(v) => setForm({ ...form, scheduledTime: v })}
        />
        <p className="text-xs text-gray-400 mt-1">
          You'll get a reminder at this time each day to log a session.
        </p>
      </div>

      {/* Color picker */}
      <div>
        <label className="label">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              aria-label={`Select color ${c}`}
              className={`w-8 h-8 rounded-full transition-transform active:scale-95 ${
                form.color === c
                  ? 'ring-2 ring-offset-2 ring-primary-500 scale-110'
                  : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1">
          {isEdit ? 'Save changes' : 'Add student'}
        </button>
      </div>
    </form>
  )
}
