import { useState, useMemo } from 'react'
import {
  Plus, Download, ChevronDown, ChevronUp, FileText, FileSpreadsheet,
  Calendar, Receipt, PauseCircle, AlertTriangle,
} from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import PaymentEntry from '@components/billing/PaymentEntry'
import StudentAvatar from '@components/shared/StudentAvatar'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { getStudentLedger } from '@utils/billingCore'
import { todayISO, formatDayMonth } from '@utils/date'
import { exportToExcel, exportAllStudentsSummaryExcel } from '@utils/billingExcel'
import { openInvoicePDF } from '@utils/billingInvoice'
import { openReceiptPDF } from '@utils/billingReceipt'
import type { Student, Payment } from '@/types'

interface InvModal { student: Student; dateFrom: string; dateTo: string }
interface RcptModal { student: Student }

export default function Billing() {
  const students = useAppStore((s) => s.students)
  const sessions = useAppStore((s) => s.sessions)
  const payments = useAppStore((s) => s.payments)
  const breaks   = useAppStore((s) => s.breaks)
  const settings = useAppStore((s) => s.settings)

  const [showPayment,    setShowPayment]    = useState(false)
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({})
  const [invModal,       setInvModal]       = useState<InvModal | null>(null)
  const [rcptModal,      setRcptModal]      = useState<RcptModal | null>(null)

  const today = todayISO()

  /** One ledger per student, recomputed only when the underlying data moves. */
  const ledgers = useMemo(
    () => new Map(
      students.map((s) => [s.id, getStudentLedger(s, sessions, payments, breaks, today)]),
    ),
    [students, sessions, payments, breaks, today],
  )

  const invSessionCount = useMemo(() => {
    if (!invModal) return 0
    const { student, dateFrom, dateTo } = invModal
    return sessions.filter(
      (s) =>
        s.studentId === student.id &&
        (!dateFrom || s.date >= dateFrom) &&
        (!dateTo   || s.date <= dateTo),
    ).length
  }, [invModal, sessions])

  function toggleCycles(studentId: string) {
    setExpandedCycles((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  async function handleExportExcel(student: Student) {
    const ss = sessions.filter((s) => s.studentId === student.id)
    const ps = payments.filter((p) => p.studentId === student.id)
    await exportToExcel(student, ss, ps, breaks)
  }

  function generateInvoice() {
    if (!invModal) return
    const { student, dateFrom, dateTo } = invModal
    openInvoicePDF(student, sessions, payments, settings.teacherName, dateFrom, dateTo, breaks)
    setInvModal(null)
  }

  function generateReceipt(payment: Payment) {
    if (!rcptModal) return
    openReceiptPDF(rcptModal.student, sessions, payments, payment, settings.teacherName, breaks)
    setRcptModal(null)
  }

  async function handleSummaryExcel() {
    await exportAllStudentsSummaryExcel(students, sessions, payments, breaks)
  }

  return (
    <div>
      <Header
        title="Billing"
        action={
          <div className="flex items-center gap-2">
            {students.length > 0 && (
              <button
                onClick={handleSummaryExcel}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-xl px-2.5 py-2 transition-colors"
                title="Export all students summary as Excel"
              >
                <FileSpreadsheet size={14} /> All Excel
              </button>
            )}
            <button onClick={() => setShowPayment(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Payment
            </button>
          </div>
        }
      />

      <div className="px-4 space-y-4 pb-6">
        {students.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-sm">Add students first to track billing</p>
          </div>
        ) : (
          students.map((student) => {
            const ledger   = ledgers.get(student.id)!
            const currency = student.currency
            const cycles   = ledger.cycles.slice().reverse()   // newest first
            const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
            const expanded = expandedCycles[student.id]

            return (
              <div key={student.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <StudentAvatar name={student.name} color={student.color ?? '#6366f1'} size="sm" />
                    <div>
                      <span className="font-semibold text-gray-900 text-sm">{student.name}</span>
                      {student.endDate && (
                        <span className="ml-1.5 text-[10px] text-gray-400">
                          left {formatDayMonth(student.endDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInvModal({ student, dateFrom: '', dateTo: '' })}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors"
                      title="Open printable invoice (PDF)"
                    >
                      <FileText size={13} /> Invoice
                    </button>
                    <span className="text-gray-200 select-none">|</span>
                    <button
                      onClick={() => setRcptModal({ student })}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors"
                      title="Generate payment receipt"
                    >
                      <Receipt size={13} /> Receipt
                    </button>
                    <span className="text-gray-200 select-none">|</span>
                    <button
                      onClick={() => handleExportExcel(student)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Download Excel"
                    >
                      <Download size={13} /> Excel
                    </button>
                  </div>
                </div>

                {/* Totals */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-gray-400">Billed</p>
                    <p className="text-xs font-semibold text-gray-800">
                      {formatCurrency(ledger.totalDue, currency)}
                    </p>
                    <p className="text-[9px] text-gray-300 mt-0.5">
                      {ledger.cycles.length} {isMonthly ? 'cycle' : 'month'}{ledger.cycles.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-gray-400">Received</p>
                    <p className="text-xs font-semibold text-green-700">
                      {formatCurrency(ledger.totalPaid, currency)}
                    </p>
                    <p className="text-[9px] text-gray-300 mt-0.5">all time</p>
                  </div>
                  {ledger.balance > 0 ? (
                    <div className="rounded-xl p-2.5 text-center bg-red-50">
                      <p className="text-[10px] text-gray-400">Pending</p>
                      <p className="text-xs font-semibold text-red-600">
                        {formatCurrency(ledger.balance, currency)}
                      </p>
                      <p className="text-[9px] text-gray-300 mt-0.5">due now</p>
                    </div>
                  ) : ledger.credit > 0 ? (
                    <div className="rounded-xl p-2.5 text-center bg-indigo-50">
                      <p className="text-[10px] text-gray-400">Credit</p>
                      <p className="text-xs font-semibold text-indigo-600">
                        {formatCurrency(ledger.credit, currency)}
                      </p>
                      <p className="text-[9px] text-gray-300 mt-0.5">paid ahead</p>
                    </div>
                  ) : (
                    <div className="rounded-xl p-2.5 text-center bg-green-50">
                      <p className="text-[10px] text-gray-400">Pending</p>
                      <p className="text-xs font-semibold text-green-600">
                        {formatCurrency(0, currency)}
                      </p>
                      <p className="text-[9px] text-gray-300 mt-0.5">settled</p>
                    </div>
                  )}
                </div>

                {/* Sessions that fall in no cycle contribute nothing — surface them */}
                {ledger.unbilled.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 leading-snug">
                      {ledger.unbilled.length} session{ledger.unbilled.length !== 1 ? 's' : ''} outside
                      the billing period ({ledger.unbilled.map((s) => formatDayMonth(s.date)).join(', ')})
                      {' '}— not charged. Move the billing start date back under Students, or delete them.
                    </p>
                  </div>
                )}

                {/* Cycles */}
                {cycles.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium mb-2">
                      {isMonthly ? 'Billing cycles' : 'Monthly'}
                    </p>
                    <div className="space-y-1.5">
                      {(expanded ? cycles : cycles.slice(0, 3)).map((c) => (
                        <div key={c.key} className="flex items-start justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <span className="text-gray-600">{c.label}</span>
                            {c.breakDays > 0 && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                                <PauseCircle size={9} />
                                +{c.breakDays}d
                              </span>
                            )}
                            {c.proRated && (
                              <span className="ml-1.5 text-[10px] text-gray-400">pro-rated</span>
                            )}
                            {c.extraAmount > 0 && (
                              <span className="ml-1.5 text-[10px] text-amber-600">
                                +{formatCurrency(c.extraAmount, currency)} extra
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-gray-400">{c.hours}h</span>
                            {c.balance > 0 ? (
                              <span className="text-red-500 font-medium">
                                {formatCurrency(c.balance, currency)} due
                              </span>
                            ) : (
                              <span className="text-green-600">Paid</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {cycles.length > 3 && (
                      <button
                        onClick={() => toggleCycles(student.id)}
                        className="mt-2 flex items-center gap-1 text-[11px] text-indigo-600 font-medium"
                      >
                        {expanded
                          ? <><ChevronUp size={12} /> Show less</>
                          : <><ChevronDown size={12} /> Show all {cycles.length} {isMonthly ? 'cycles' : 'months'}</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Record payment">
        <PaymentEntry onClose={() => setShowPayment(false)} />
      </Modal>

      {/* Receipt payment-picker modal */}
      <Modal
        isOpen={!!rcptModal}
        onClose={() => setRcptModal(null)}
        title={rcptModal ? `Receipt — ${rcptModal.student.name}` : ''}
      >
        {rcptModal && (() => {
          const studentPayments = payments
            .filter((p) => p.studentId === rcptModal.student.id)
            .sort((a, b) =>
              b.date !== a.date
                ? b.date.localeCompare(a.date)
                : (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
            )
          return (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Select a payment to generate a receipt for:</p>
              {studentPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">💸</p>
                  <p className="text-sm">No payments recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {studentPayments.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => generateReceipt(p)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200 px-4 py-3 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">
                          {formatCurrency(p.amount, rcptModal.student.currency)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDayMonth(p.date)}</p>
                        {p.note && <p className="text-xs text-gray-400 italic mt-0.5">{p.note}</p>}
                      </div>
                      <Receipt size={15} className="text-gray-300 group-hover:text-green-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setRcptModal(null)} className="btn-secondary w-full">
                Cancel
              </button>
            </div>
          )
        })()}
      </Modal>

      {/* Invoice date-range modal */}
      <Modal
        isOpen={!!invModal}
        onClose={() => setInvModal(null)}
        title={invModal ? `Invoice — ${invModal.student.name}` : ''}
      >
        {invModal && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Leave both dates blank to invoice everything still outstanding. Set a range to
              invoice the cycles it covers instead.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="input"
                  value={invModal.dateFrom}
                  max={today}
                  onChange={(e) => setInvModal({ ...invModal, dateFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="input"
                  value={invModal.dateTo}
                  max={today}
                  onChange={(e) => setInvModal({ ...invModal, dateTo: e.target.value })}
                />
              </div>
            </div>

            <div className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 ${
              invModal.dateFrom || invModal.dateTo
                ? 'bg-indigo-50 text-indigo-700'
                : 'bg-gray-50 text-gray-500'
            }`}>
              <Calendar size={14} />
              {invModal.dateFrom || invModal.dateTo
                ? `${invSessionCount} session${invSessionCount !== 1 ? 's' : ''} in selected range`
                : (() => {
                    const l = ledgers.get(invModal.student.id)
                    const owing = l?.cycles.filter((c) => c.balance > 0).length ?? 0
                    return owing > 0
                      ? `${owing} unpaid cycle${owing !== 1 ? 's' : ''} · ${formatCurrency(l!.balance, invModal.student.currency)} due`
                      : 'Nothing outstanding — invoice will be empty'
                  })()
              }
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setInvModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={generateInvoice}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <FileText size={14} /> Generate Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
