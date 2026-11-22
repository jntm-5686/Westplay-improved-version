import { call } from './bridge'

/** How often the page says it's alive: the app's watchdog calls it gone after five quiet seconds. */
const BEAT_MS = 1000

/**
 * Tells the app this page is alive, every second (the app's watchdog, `app/src/watchdog.rs`). WebView2's renderer
 * crashing leaves its error page where this page was: no timer runs, no heartbeat comes, and the app loads the
 * page again (or, after repeated failures, restarts with software rendering). Returns how to stop.
 */
export function startHeartbeat(): () => void {
  let stopped = false
  const beat = () => {
    if (stopped) return
    call('companion_heartbeat').catch((error: unknown) => {
      console.error('The companion heartbeat could not reach the app', error)
    })
  }
  beat()
  const timer = window.setInterval(beat, BEAT_MS)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
