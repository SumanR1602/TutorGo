import { useState, useEffect, useMemo } from 'react'
import { Clock, Trash2, Pencil, History, CreditCard, PauseCircle } from 'lucide-react'
import useAppStore from '@store/useStore'
import ConfirmModal from '../shared/ConfirmModal'
import { format12h, convertISTtoTZ, getUTCOffsetLabel } from '@utils/timezone'
import { formatCurrency } from '@utils/billing'
import { getStudentLedger } from '@utils/billingCore'
import { DEFAULT_CURRENCY } from '@constants'
import { useToast } from '@hooks/useToast'
import Modal from '../shared/Modal'
import StudentForm from './StudentForm'
import StudentAvatar from '../shared/StudentAvatar'
import StudentSessionHistory from './StudentSessionHistory'
import StudentPaymentHistory from './StudentPaymentHistory'
import StudentBreaks from './StudentBreaks'
import type { Student } from '@/types'

interface StudentCardProps {
  student: Student
}

export default function StudentCard({ student }: StudentCardProps) {
  // Subscribe to the DATA, not to the selector functions — a function
  // reference never changes, so subscribing to one leaves the card showing
  // stale figures after a session or payment is edited.
  const sessions      = useAppStore((s) => s.sessions)
  const payments      = useAppStore((s) => s.payments)
  const breaks        = useAppStore((s) => s.breaks)
  const deleteStudent = useAppStore((s) => s.deleteStudent)
  const { showToast } = useToast()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEdit,      setShowEdit]      = useState(false)
  const [showHistory,   setShowHistory]   = useState(false)
  const [showPayments,  setShowPayments]  = useState(false)
  const [showBreaks,    setShowBreaks]    = useState(false)

  const ledger = useMemo(
    () => getStudentLedger(student, sessions, payments, breaks),
    [student, sessions, payments, breaks],
  )

  const hours  = useMemo(
    () => sessions.filter((s) => s.studentId === student.id).reduce((sum, s) => sum + s.hours, 0),
    [sessions, student.id],
  )
  const tzAbbr = getUTCOffsetLabel(student.timezone)

  // Owed, paid ahead, or square — three distinct states, not two.
  const money = ledger.balance > 0
    ? { label: 'Pending', value: ledger.balance, box: 'bg-red-50',    text: 'text-red-600' }
    : ledger.credit > 0
      ? { label: 'Credit', value: ledger.credit, box: 'bg-indigo-50', text: 'text-indigo-600' }
      : { label: 'Paid up', value: 0,            box: 'bg-green-50',  text: 'text-green-600' }

  // Live local time — ticks every minute (no seconds needed here)
  function getLocalTime(tz: string) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date())
  }
  const [currentTime, setCurrentTime] = useState(() => getLocalTime(student.timezone))
  useEffect(() => {
    setCurrentTime(getLocalTime(student.timezone))
    const id = setInterval(() => setCurrentTime(getLocalTime(student.timezone)), 60_000)
    return () => clearInterval(id)
  }, [student.timezone])

  function handleDelete() {
    deleteStudent(student.id)
    showToast(`${student.name} deleted successfully`, 'success')
  }

  return (
    <>
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StudentAvatar name={student.name} color={student.color ?? '#6366f1'} size="lg" />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-900 text-sm">{student.name}</p>
                {student.label && (
                  <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                    {student.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">{student.city}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdit(true)}
              aria-label="Edit student"
              className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-colors"
            >
              <Pencil size={15} />
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete student"
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Local time ({tzAbbr})</p>
            <p className="text-xs font-semibold text-gray-800">{currentTime}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Hours</p>
            <p className="text-xs font-semibold text-gray-800">{hours.toFixed(1)}h</p>
          </div>
          <div className={`rounded-xl p-2.5 text-center ${money.box}`}>
            <p className="text-[10px] text-gray-400 mb-0.5">{money.label}</p>
            <p className={`text-xs font-semibold ${money.text}`}>
              {formatCurrency(money.value, student.currency ?? DEFAULT_CURRENCY)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            Rate: {formatCurrency(student.ratePerHour, student.currency ?? DEFAULT_CURRENCY)}
            {(student.rateType ?? 'hourly') === 'monthly' ? '/mo' : '/hr'}
          </span>
          {student.scheduledTime && (
            <div className="text-right">
              <span className="flex items-center gap-1 text-indigo-500">
                <Clock size={10} />
                {format12h(student.scheduledTime)} IST
              </span>
              <span className="text-[10px] text-gray-400">
                = {convertISTtoTZ(student.scheduledTime, student.timezone).time} local
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-1 pt-1 border-t border-gray-100">
          <button
            onClick={() => setShowHistory(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <History size={13} /> Sessions
          </button>
          <button
            onClick={() => setShowPayments(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <CreditCard size={13} /> Payments
          </button>
          <button
            onClick={() => setShowBreaks(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <PauseCircle size={13} /> Breaks
          </button>
        </div>
      </div>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit student info">
        <StudentForm student={student} onClose={() => setShowEdit(false)} />
      </Modal>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`${student.name} – Sessions`}>
        <StudentSessionHistory student={student} />
      </Modal>

      <Modal isOpen={showPayments} onClose={() => setShowPayments(false)} title={`${student.name} – Payments`}>
        <StudentPaymentHistory student={student} />
      </Modal>

      <Modal isOpen={showBreaks} onClose={() => setShowBreaks(false)} title={`${student.name} – Breaks`}>
        <StudentBreaks student={student} />
      </Modal>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        message={`Are you sure you want to delete ${student.name}'s info? All their sessions and payments will also be removed.`}
      />
    </>
  )
}
