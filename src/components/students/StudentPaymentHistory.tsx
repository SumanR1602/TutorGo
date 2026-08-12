import { useState, useMemo } from 'react'
import useAppStore from '@store/useStore'
import { formatCurrency, formatDate } from '@utils/billing'
import { getStudentLedger } from '@utils/billingCore'
import { DEFAULT_CURRENCY } from '@constants'
import { Trash2, CreditCard, Pencil } from 'lucide-react'
import { useToast } from '@hooks/useToast'
import Modal from '../shared/Modal'
import ConfirmModal from '../shared/ConfirmModal'
import EditPaymentForm from '../billing/EditPaymentForm'
import type { Student, Payment } from '@/types'

interface StudentPaymentHistoryProps {
  student: Student
}

export default function StudentPaymentHistory({ student }: StudentPaymentHistoryProps) {
  // Subscribe to the data, not to selector functions — see StudentCard.
  const allPayments   = useAppStore((s) => s.payments)
  const sessions      = useAppStore((s) => s.sessions)
  const breaks        = useAppStore((s) => s.breaks)
  const deletePayment = useAppStore((s) => s.deletePayment)
  const updatePayment = useAppStore((s) => s.updatePayment)
  const { showToast } = useToast()

  const [editPayment,      setEditPayment]      = useState<Payment | null>(null)
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<string | null>(null)

  const payments = useMemo(
    () => allPayments
      .filter((p) => p.studentId === student.id)
      .sort((a, b) =>
        a.date !== b.date
          ? b.date.localeCompare(a.date)
          : (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    [allPayments, student.id],
  )

  const ledger = useMemo(
    () => getStudentLedger(student, sessions, allPayments, breaks),
    [student, sessions, allPayments, breaks],
  )
  const totalPaid = ledger.totalPaid

  const money = ledger.balance > 0
    ? { label: 'Still pending', value: ledger.balance, box: 'bg-red-50', big: 'text-red-700', small: 'text-red-400' }
    : ledger.credit > 0
      ? { label: 'Paid ahead', value: ledger.credit, box: 'bg-indigo-50', big: 'text-indigo-700', small: 'text-indigo-400' }
      : { label: 'Fully paid', value: 0, box: 'bg-emerald-50', big: 'text-emerald-700', small: 'text-emerald-400' }

  function handleDelete(paymentId: string, paymentDate: string, paymentAmount: number) {
    deletePayment(paymentId)
    showToast(`Payment of ₹${paymentAmount.toLocaleString('en-IN')} on ${paymentDate} deleted`, 'info')
    setConfirmDeleteId(null)
  }

  function handleSaveEdit(updates: Partial<Payment>) {
    if (!editPayment) return
    updatePayment(editPayment.id, updates)
    showToast('Payment updated', 'success')
    setEditPayment(null)
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <CreditCard size={36} className="mb-3 opacity-40" />
        <p className="text-sm">No payments recorded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-700">
            {formatCurrency(totalPaid, student.currency ?? DEFAULT_CURRENCY)}
          </p>
          <p className="text-[10px] text-green-400 mt-0.5">Total received</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${money.box}`}>
          <p className={`text-lg font-bold ${money.big}`}>
            {formatCurrency(money.value, student.currency ?? DEFAULT_CURRENCY)}
          </p>
          <p className={`text-[10px] mt-0.5 ${money.small}`}>{money.label}</p>
        </div>
      </div>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {payments.map((payment) => (
          <div key={payment.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {formatCurrency(payment.amount, student.currency ?? DEFAULT_CURRENCY)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(payment.date)}</p>
              {payment.note && <p className="text-xs text-gray-500 truncate mt-0.5">{payment.note}</p>}
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button
                onClick={() => setEditPayment(payment)}
                aria-label="Edit payment"
                className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setConfirmDeleteId(payment.id)}
                aria-label="Delete payment"
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!editPayment} onClose={() => setEditPayment(null)} title="Edit payment">
        {editPayment && (
          <EditPaymentForm
            payment={editPayment}
            student={student}
            onSave={handleSaveEdit}
            onClose={() => setEditPayment(null)}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const p = payments.find((x) => x.id === confirmDeleteId)
          if (p) handleDelete(p.id, p.date, p.amount)
        }}
        message="Are you sure you want to delete this payment? This cannot be undone."
      />
    </div>
  )
}
