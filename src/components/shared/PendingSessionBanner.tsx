import { useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import useAppStore from '@store/useStore'
import { isReminderMuted } from '@utils/notifications'
import { todayISO } from '@utils/date'
import Modal from './Modal'
import SessionForm from '../sessions/SessionForm'
import StudentAvatar from './StudentAvatar'

export default function PendingSessionBanner() {
  const pendingReminders       = useAppStore((s) => s.pendingReminders)
  const students               = useAppStore((s) => s.students)
  const breaks                 = useAppStore((s) => s.breaks)
  const dismissPendingReminder = useAppStore((s) => s.dismissPendingReminder)

  const [logFor, setLogFor] = useState<string | null>(null)

  // A break added after the reminder fired should still silence it — otherwise
  // the banner asks for a session the form would refuse to accept.
  const today = todayISO()
  const visible = pendingReminders.filter((id) => {
    const student = students.find((s) => s.id === id)
    return student ? !isReminderMuted(student, breaks, today) : false
  })

  if (visible.length === 0) return null

  return (
    <>
      <div className="space-y-2">
        {visible.map((studentId) => {
          const student = students.find((s) => s.id === studentId)
          if (!student) return null

          return (
            <div
              key={studentId}
              className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3"
            >
              <StudentAvatar name={student.name} color={student.color ?? '#6366f1'} size="md" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-900 truncate">
                  Time to teach {student.name}!
                </p>
                <p className="text-xs text-indigo-500">Log today's session?</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setLogFor(studentId)}
                  className="flex items-center gap-1 bg-primary-600 text-white text-xs font-medium px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
                >
                  <CheckCircle size={12} />
                  Log
                </button>
                <button
                  onClick={() => dismissPendingReminder(studentId)}
                  aria-label="Dismiss reminder"
                  className="p-1.5 rounded-xl text-indigo-400 hover:bg-indigo-100 active:scale-95 transition-transform"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {logFor && (
        <Modal isOpen={true} onClose={() => setLogFor(null)} title="Log session">
        <SessionForm
            students={students}
            preselectedStudentId={logFor ?? undefined}
            onClose={() => {
              if (logFor) dismissPendingReminder(logFor)
              setLogFor(null)
              // SessionForm already shows a toast — no second toast here
            }}
          />
        </Modal>
      )}
    </>
  )
}
