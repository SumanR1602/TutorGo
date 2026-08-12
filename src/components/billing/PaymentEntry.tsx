import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { todayISO, formatDayMonth } from '@utils/date'
import { useToast } from '@hooks/useToast'

interface PaymentEntryProps {
  onClose: () => void
}

export default function PaymentEntry({ onClose }: PaymentEntryProps) {
  const students   = useAppStore((s) => s.students)
  const payments   = useAppStore((s) => s.payments)
  const getBalance = useAppStore((s) => s.getBalance)
  const getCredit  = useAppStore((s) => s.getCredit)
  const addPayment = useAppStore((s) => s.addPayment)
  const { showToast } = useToast()

  const today = todayISO()
  const [form, setForm] = useState({
    studentId: students[0]?.id ?? '',
    date:      today,
    amount:    '',
    note:      '',
  })
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState(false)

  /** Same student, same day, same amount — almost certainly a double tap. */
  const duplicate = useMemo(() => {
    const amount = parseFloat(form.amount)
    if (!Number.isFinite(amount)) return undefined
    return payments.find(
      (p) => p.studentId === form.studentId && p.date === form.date && p.amount === amount,
    )
  }, [payments, form.studentId, form.date, form.amount])

  const selectedStudent = students.find((s) => s.id === form.studentId)
  const balance = selectedStudent ? getBalance(form.studentId) : 0
  const credit  = selectedStudent ? getCredit(form.studentId)  : 0

  // Owed / paid ahead / square — three states, styled honestly.
  const status = balance > 0
    ? { text: `Pending: ${formatCurrency(balance, selectedStudent?.currency)}`, cls: 'text-red-500' }
    : credit > 0
      ? { text: `In credit: ${formatCurrency(credit, selectedStudent?.currency)}`, cls: 'text-indigo-500' }
      : { text: 'All settled', cls: 'text-green-600' }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.studentId) return

    const amount = parseFloat(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (form.date > today) {
      setError('You can\'t record a payment in the future.')
      return
    }
    setError(null)

    if (duplicate && !dupWarning) { setDupWarning(true); return }
    setDupWarning(false)

    addPayment({ ...form, amount, note: form.note })
    const studentName = selectedStudent?.name ?? ''
    showToast(
      `Payment of ${formatCurrency(amount, selectedStudent?.currency)} from ${studentName} recorded`,
      'success',
    )
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {dupWarning && duplicate && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            An identical payment of {formatCurrency(duplicate.amount, selectedStudent?.currency)} on{' '}
            {formatDayMonth(duplicate.date)} is already recorded. Submit again to add a second one.
          </p>
        </div>
      )}

      <div>
        <label className="label">Student *</label>
        <select
          className="input"
          value={form.studentId}
          onChange={(e) => { setForm({ ...form, studentId: e.target.value }); setDupWarning(false) }}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {selectedStudent && (
          <p className={`text-xs mt-1 ${status.cls}`}>{status.text}</p>
        )}
      </div>

      <div>
        <label className="label">Date received</label>
        <input
          type="date"
          className="input"
          value={form.date}
          max={today}
          onChange={(e) => { setForm({ ...form, date: e.target.value }); setDupWarning(false) }}
        />
        <p className="text-xs text-gray-400 mt-1">
          Payments always clear the oldest unpaid cycle first, so this date is for your
          records — it doesn't change which cycle gets settled.
        </p>
      </div>

      <div>
        <label className="label">Amount received *</label>
        <input
          type="number"
          className={`input ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
          placeholder="0"
          value={form.amount}
          onChange={(e) => {
            setForm({ ...form, amount: e.target.value })
            setError(null)
            setDupWarning(false)
          }}
          required
          min="0"
          step="0.01"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Note (optional)</label>
          <span className={`text-xs ${form.note.length > 130 ? 'text-amber-500' : 'text-gray-400'}`}>
            {form.note.length}/150
          </span>
        </div>
        <input
          className="input"
          placeholder="e.g. UPI, Cash"
          value={form.note}
          maxLength={150}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn-primary flex-1">Record payment</button>
      </div>
    </form>
  )
}
