import { useState } from 'react'
import { todayISO } from '@utils/date'
import type { Payment, Student } from '@/types'
import { DEFAULT_CURRENCY } from '@constants'

interface EditPaymentFormProps {
  payment: Payment
  student: Student
  onSave: (updates: Partial<Payment>) => void
  onClose: () => void
}

export default function EditPaymentForm({ payment, student, onSave, onClose }: EditPaymentFormProps) {
  const today = todayISO()
  const [form, setForm] = useState({
    date:   payment.date,
    amount: String(payment.amount),
    note:   payment.note ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!form.date) {
      setError('Pick a date.')
      return
    }
    if (form.date > today) {
      setError('A payment can\'t be dated in the future.')
      return
    }
    setError(null)
    onSave({ date: form.date, amount, note: form.note })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Date received</label>
        <input
          type="date"
          className="input"
          value={form.date}
          max={today}
          onChange={(e) => { setForm({ ...form, date: e.target.value }); setError(null) }}
        />
        <p className="text-xs text-gray-400 mt-1">
          For your records only — payments always clear the oldest unpaid cycle first.
        </p>
      </div>
      <div>
        <label className="label">Amount ({student.currency ?? DEFAULT_CURRENCY})</label>
        <input
          type="number"
          className={`input ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => { setForm({ ...form, amount: e.target.value }); setError(null) }}
          required
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
        <button type="submit" className="btn-primary flex-1">Save changes</button>
      </div>
    </form>
  )
}
