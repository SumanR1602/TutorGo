import { useState, useEffect } from 'react'
import { Clock, RotateCcw } from 'lucide-react'
import useAppStore from '@store/useStore'
import { convertISTtoTZ, getCurrentTimeInTZ, isReasonableHour, nowInTeacherTZ } from '@utils/timezone'
import { TEACHER_TIMEZONE } from '@constants'
import TimePicker12h from '../shared/TimePicker12h'

/** Now in IST — reading the device clock instead would be wrong abroad. */
const getNowIST = () => nowInTeacherTZ(TEACHER_TIMEZONE)

export default function TimezoneConverter() {
  const students = useAppStore((s) => s.students)
  const [istTime, setIstTime] = useState<string>(getNowIST)

  // Tick every second to keep "Current IST" display live
  const [nowIST, setNowIST] = useState(() => getCurrentTimeInTZ(TEACHER_TIMEZONE))
  useEffect(() => {
    const id = setInterval(() => setNowIST(getCurrentTimeInTZ(TEACHER_TIMEZONE)), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-800">Timezone Converter</h2>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0">Enter time (IST)</label>
          <button
            type="button"
            onClick={() => setIstTime(getNowIST())}
            className="flex items-center gap-1 text-xs text-indigo-500 active:scale-95 transition-transform"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
        <TimePicker12h value={istTime} onChange={setIstTime} />
        <p className="text-xs text-gray-400 mt-1.5">
          Current IST: {nowIST}
        </p>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          Add students to see their local times
        </p>
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const result          = convertISTtoTZ(istTime, student.timezone)
            const isReasonableTime = isReasonableHour(istTime, student.timezone)
            return (
              <div
                key={student.id}
                className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: student.color ?? '#6366f1' }}
                  >
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{student.name}</p>
                    <p className="text-xs text-gray-400">{result.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{result.time}</p>
                  {!isReasonableTime && (
                    <span className="text-[10px] text-amber-600">⚠ Odd hours</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
