import { call } from './bridge'

/**
 * The companion window's own health, from the app's watchdog (mirrors `app::watchdog::CompanionDiagnostics`):
 * whether WebView2 draws without the GPU, and how often the window's page stopped answering. Seconds are as the
 * command answered; the About page asks again every few seconds while it's open.
 */
export interface CompanionDiagnostics {
  /** Whether this run was started with software rendering (the marker was there in `main`). */
  softwareRendering: boolean
  /** Whether the next start will draw without the GPU (the marker is there now). */
  softwareRenderingNextRun: boolean
  /** The marker's path, where it is. */
  softwareRenderingMarker: string | null
  /** The WebView2 version, as the host's status last said it. */
  webviewVersion: string | null
  /** How many times the watchdog found the page gone since WestPlay started. */
  crashes: number
  /** How many of those were within ten minutes. */
  crashesInWindow: number
  lastCrashSecondsAgo: number | null
  /** Why the watchdog called it gone (no heartbeat); WebView2's own crash code isn't reported to Tauri. */
  lastCrashReason: string | null
  /** What the watchdog did last (loaded the page again, made its window again, restarted WestPlay). */
  lastAction: string | null
  recoveries: number
  restarts: number
  /** How long since the page last beat (`null`: it never has). */
  heartbeatSecondsAgo: number | null
  watchdogRunning: boolean
}

/** The companion window's diagnostics. */
export function companionDiagnostics(): Promise<CompanionDiagnostics> {
  return call('companion_diagnostics')
}

/** Turns software rendering on or off for the next start (writes or removes the marker). */
export function companionSetSoftwareRendering(enabled: boolean): Promise<CompanionDiagnostics> {
  return call('companion_set_software_rendering', { enabled })
}

/** Removes the software-rendering marker: the next start draws with the GPU again. */
export function companionResetGpu(): Promise<CompanionDiagnostics> {
  return call('companion_reset_gpu')
}
