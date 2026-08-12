/** Shared app-wide constants */

export const COLORS: string[] = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#f97316', '#14b8a6',
]

export const HOUR_OPTIONS: number[] = [0.5, 1, 1.5, 2, 2.5, 3]

export const CURRENCIES: { value: string; label: string }[] = [
  { value: 'INR', label: 'INR (₹)' },
  // Add more currencies here when needed
]

/**
 * Shown in Settings. Injected from package.json at build time so the number
 * can't drift from the released package — see `define` in vite.config.ts.
 */
export const APP_VERSION: string = __APP_VERSION__

export const TEACHER_TIMEZONE = 'Asia/Kolkata'
export const DEFAULT_TIMEZONE  = TEACHER_TIMEZONE
export const DEFAULT_CURRENCY = 'INR'
export const DEFAULT_RATE_TYPE = 'hourly' as const
export const STORE_NAME = 'tutorspad-store'
export const BOTTOM_NAV_HEIGHT_PX = 64
