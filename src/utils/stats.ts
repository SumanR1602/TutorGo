/**
 * stats.ts
 * Pure statistical utility functions for session/billing data.
 */

import type { Session } from '@/types'
import { todayISO, addDays } from './date'

/**
 * Calculate the current teaching streak in days.
 * A streak counts consecutive days (ending today or yesterday) with at least one session.
 */
export function calcStreak(sessions: Session[], today: string = todayISO()): number {
  if (!sessions.length) return 0
  const uniqueDates = [...new Set(sessions.map((s) => s.date))].sort((a, b) => b.localeCompare(a))
  const yesterday = addDays(today, -1)
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < uniqueDates.length; i++) {
    if (addDays(uniqueDates[i - 1], -1) === uniqueDates[i]) streak++
    else break
  }
  return streak
}
