/**
 * timezone.ts
 * All timezone-related utilities using the native Intl API (no library needed)
 */

import type { TimezoneOption, ConvertedTime } from '@/types'
import { TEACHER_TIMEZONE } from '@constants'
import { todayISO } from './date'

/** Minutes `tz` is ahead of UTC at a given instant (handles DST). */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second,
  )
  return (asUTC - at.getTime()) / 60_000
}

/**
 * The real instant at which the clock in `tz` reads `HH:mm` on `dateIso`.
 *
 * Doing this properly matters: `new Date(y, m, d, h, min)` builds the time in
 * the *device's* zone, so every "IST" conversion below was silently wrong
 * whenever the teacher's device wasn't set to IST.
 */
export function zonedTimeToInstant(dateIso: string, timeHHmm: string, tz: string): Date {
  const [y, mo, d] = dateIso.split('-').map(Number)
  const [h, mi] = timeHHmm.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0)
  const offset = tzOffsetMinutes(tz, new Date(guess))
  return new Date(guess - offset * 60_000)
}

/** "HH:mm" right now in the teacher's timezone. */
export function nowInTeacherTZ(tz: string = TEACHER_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

// City name → IANA timezone lookup (case-insensitive)
export const CITY_TO_TIMEZONE: Record<string, string> = {
  // India
  'mumbai': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata', 'bengaluru': 'Asia/Kolkata', 'chennai': 'Asia/Kolkata',
  'hyderabad': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata', 'pune': 'Asia/Kolkata',
  'ahmedabad': 'Asia/Kolkata', 'jaipur': 'Asia/Kolkata', 'surat': 'Asia/Kolkata',
  'lucknow': 'Asia/Kolkata', 'india': 'Asia/Kolkata',
  // US East
  'new york': 'America/New_York', 'boston': 'America/New_York', 'miami': 'America/New_York',
  'atlanta': 'America/New_York', 'michigan': 'America/New_York', 'detroit': 'America/New_York',
  'philadelphia': 'America/New_York', 'washington': 'America/New_York', 'charlotte': 'America/New_York',
  'pittsburgh': 'America/New_York', 'cleveland': 'America/New_York', 'columbus': 'America/New_York',
  'jacksonville': 'America/New_York', 'orlando': 'America/New_York', 'tampa': 'America/New_York',
  // Canada East
  'toronto': 'America/Toronto', 'montreal': 'America/Toronto', 'ottawa': 'America/Toronto',
  // US Central
  'chicago': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
  'austin': 'America/Chicago', 'san antonio': 'America/Chicago', 'minneapolis': 'America/Chicago',
  'kansas city': 'America/Chicago', 'nashville': 'America/Chicago', 'memphis': 'America/Chicago',
  'new orleans': 'America/Chicago', 'oklahoma city': 'America/Chicago',
  // US Mountain
  'denver': 'America/Denver', 'salt lake city': 'America/Denver', 'albuquerque': 'America/Denver',
  'phoenix': 'America/Phoenix', 'tucson': 'America/Phoenix',
  // US Pacific
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'seattle': 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles',
  'portland': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles',
  'california': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles',
  // Canada West
  'vancouver': 'America/Vancouver', 'calgary': 'America/Denver',
  // UK
  'london': 'Europe/London', 'manchester': 'Europe/London', 'birmingham': 'Europe/London',
  'glasgow': 'Europe/London', 'edinburgh': 'Europe/London', 'leeds': 'Europe/London',
  // Europe
  'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin', 'rome': 'Europe/Rome',
  'madrid': 'Europe/Madrid', 'amsterdam': 'Europe/Amsterdam', 'brussels': 'Europe/Brussels',
  'vienna': 'Europe/Vienna', 'zurich': 'Europe/Zurich', 'stockholm': 'Europe/Stockholm',
  'oslo': 'Europe/Oslo', 'copenhagen': 'Europe/Copenhagen', 'warsaw': 'Europe/Warsaw',
  'prague': 'Europe/Prague', 'budapest': 'Europe/Budapest', 'lisbon': 'Europe/Lisbon',
  'barcelona': 'Europe/Madrid', 'milan': 'Europe/Rome',
  // Middle East
  'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', 'sharjah': 'Asia/Dubai',
  'riyadh': 'Asia/Riyadh', 'jeddah': 'Asia/Riyadh', 'kuwait': 'Asia/Kuwait',
  'doha': 'Asia/Qatar', 'muscat': 'Asia/Muscat', 'bahrain': 'Asia/Bahrain',
  // Asia-Pacific
  'singapore': 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur',
  'tokyo': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo', 'beijing': 'Asia/Shanghai',
  'shanghai': 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong', 'seoul': 'Asia/Seoul',
  'bangkok': 'Asia/Bangkok', 'jakarta': 'Asia/Jakarta', 'manila': 'Asia/Manila',
  'taipei': 'Asia/Taipei', 'ho chi minh': 'Asia/Ho_Chi_Minh', 'hanoi': 'Asia/Bangkok',
  'dhaka': 'Asia/Dhaka', 'karachi': 'Asia/Karachi', 'lahore': 'Asia/Karachi',
  'colombo': 'Asia/Colombo', 'kathmandu': 'Asia/Kathmandu',
  // Australia
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Sydney', 'canberra': 'Australia/Sydney',
  'brisbane': 'Australia/Brisbane', 'perth': 'Australia/Perth', 'adelaide': 'Australia/Adelaide',
  // Africa
  'cairo': 'Africa/Cairo', 'nairobi': 'Africa/Nairobi', 'lagos': 'Africa/Lagos',
  'johannesburg': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  // Americas
  'sao paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', 'bogota': 'America/Bogota',
  'lima': 'America/Lima', 'santiago': 'America/Santiago', 'mexico city': 'America/Mexico_City',
}

/** Given a city string, return the matching IANA timezone or null. */
export function guessTimezoneFromCity(city: string): string | null {
  if (!city) return null
  return CITY_TO_TIMEZONE[city.trim().toLowerCase()] ?? null
}

/** Common IANA timezones with display labels for the student add form. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { label: 'IST – India (Kolkata)',                  value: 'Asia/Kolkata' },
  { label: 'EST – US Eastern (New York / Michigan)', value: 'America/New_York' },
  { label: 'CST – US Central (Chicago)',             value: 'America/Chicago' },
  { label: 'MST – US Mountain (Denver)',             value: 'America/Denver' },
  { label: 'PST – US Pacific (California)',          value: 'America/Los_Angeles' },
  { label: 'GMT – London',                           value: 'Europe/London' },
  { label: 'CET – Central Europe (Paris, Berlin)',   value: 'Europe/Paris' },
  { label: 'GST – UAE (Dubai)',                      value: 'Asia/Dubai' },
  { label: 'SGT – Singapore',                        value: 'Asia/Singapore' },
  { label: 'JST – Japan (Tokyo)',                    value: 'Asia/Tokyo' },
  { label: 'AEST – Australia Eastern (Sydney)',      value: 'Australia/Sydney' },
  { label: 'EST – Canada (Toronto)',                 value: 'America/Toronto' },
]

/**
 * Convert an IST time string (HH:mm) to a given target timezone.
 * Returns { time: "10:30 AM", date: "Mon, 23 May" }
 */
export function convertISTtoTZ(istTimeStr: string, targetTimezone: string): ConvertedTime {
  if (!istTimeStr) return { time: '', date: '' }
  // Anchor to today's date *in IST*, not on the device, so the result is the
  // same whichever timezone the teacher's phone happens to be in.
  const istDate = zonedTimeToInstant(todayISO(TEACHER_TIMEZONE), istTimeStr, TEACHER_TIMEZONE)

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return {
    time: timeFormatter.format(istDate),
    date: dateFormatter.format(istDate),
  }
}

/**
 * Format a HH:MM (24-hour) string to "10:33 AM" style.
 * Returns empty string if input is falsy.
 */
export function format12h(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/** Get the current time in a timezone as a string, with seconds. */
export function getCurrentTimeInTZ(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date())
}

/** Get UTC offset label e.g. "UTC+5:30" for a timezone. */
export function getUTCOffsetLabel(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

/**
 * Returns true if the given IST time maps to a reasonable waking hour
 * (06:00–22:00) in the target timezone.
 */
export function isReasonableHour(istTimeStr: string, targetTimezone: string): boolean {
  if (!istTimeStr) return true
  const istDate = zonedTimeToInstant(todayISO(TEACHER_TIMEZONE), istTimeStr, TEACHER_TIMEZONE)
  const localHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: 'numeric',
    hour12: false,
  }).format(istDate)
  const localHour = parseInt(localHourStr, 10) % 24
  return localHour >= 6 && localHour <= 22
}
