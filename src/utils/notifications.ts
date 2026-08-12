/**
 * notifications.ts
 * Web Notifications API wrapper for daily class reminders
 */

import type { Student, Break } from '@/types'
import { todayISO } from './date'
import { isOnBreak } from './billingCore'

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (Notification.permission !== 'granted') return
  // Prefer SW notification (works when app is backgrounded on Android PWA)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, { body, icon: '/icon-192.png' })
      return
    } catch {
      // fall through to page-level notification
    }
  }
  new Notification(title, { body, icon: '/icon-192.png' })
}

/**
 * Starts a daily reminder scheduler.
 * Returns a cleanup function to cancel the scheduler.
 */
export function startReminderScheduler(timeStr: string, message: string): () => void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return () => {}

  const [targetH, targetM] = timeStr.split(':').map(Number)

  function checkAndFire() {
    const now = new Date()
    const todayKey = now.toDateString()
    const storageKey = `daily-reminder-${todayKey}`
    try { if (sessionStorage.getItem(storageKey)) return } catch { /* private browsing */ }

    const totalNow    = now.getHours() * 60 + now.getMinutes()
    const totalTarget = targetH * 60 + targetM
    // fire only at or after target, within a 2-minute catch-up window
    if (totalNow >= totalTarget && totalNow <= totalTarget + 2) {
      try { sessionStorage.setItem(storageKey, '1') } catch { /* private browsing */ }
      void showNotification('TutorsPad – Daily Reminder', message)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAndFire()
  }

  const interval = setInterval(checkAndFire, 15000)
  document.addEventListener('visibilitychange', onVisible)
  checkAndFire()

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * True when today is a day this student shouldn't be nudged about: they're on
 * a declared break, they've left, or their billing hasn't started yet.
 */
export function isReminderMuted(
  student: Student, breaks: Break[], today: string = todayISO(),
): boolean {
  if (student.endDate && today > student.endDate) return true
  if (student.billingAnchorDate && today < student.billingAnchorDate) return true
  return isOnBreak(breaks, student.id, today)
}

/**
 * Starts per-student reminder schedulers.
 * The in-app banner (onReminder) fires regardless of notification permission.
 * Browser notification only fires if permission is granted.
 *
 * Students on a break — or who have left, or haven't started — are skipped, so
 * a holiday actually stops the daily "time for their class!" nudge instead of
 * prompting for a session the app would then refuse to accept.
 */
export function startPerStudentReminders(
  students: Student[],
  onReminder: (studentId: string) => void,
  breaks: Break[] = [],
): () => void {
  const scheduled = students.filter((s) => s.scheduledTime)
  if (scheduled.length === 0) return () => {}

  function checkAndFire() {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const todayKey = now.toDateString()
    const today = todayISO()

    scheduled.forEach((student) => {
      if (!student.scheduledTime) return
      if (isReminderMuted(student, breaks, today)) return
      const [targetH, targetM] = student.scheduledTime.split(':').map(Number)
      const storageKey = `reminder-${student.id}-${todayKey}`

      const totalNow    = h * 60 + m
      const totalTarget = targetH * 60 + targetM
      // fire only at or after target, within a 2-minute catch-up window
      let alreadyFired = false
      try { alreadyFired = !!sessionStorage.getItem(storageKey) } catch { /* private browsing */ }
      if (totalNow >= totalTarget && totalNow <= totalTarget + 2 && !alreadyFired) {
        try { sessionStorage.setItem(storageKey, '1') } catch { /* private browsing */ }
        onReminder(student.id)
        if (Notification.permission === 'granted') {
          void showNotification(
            `TutorsPad – Class Reminder`,
            `Time for ${student.name}'s class!`,
          )
        }
      }
    })
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAndFire()
  }

  const interval = setInterval(checkAndFire, 15000)
  document.addEventListener('visibilitychange', onVisible)
  checkAndFire()

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
