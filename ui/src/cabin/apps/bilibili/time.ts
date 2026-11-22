/** A video's time as Bilibili writes it: "0:41", "13:34", "1:02:10". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** What the player's progress bar reads (0 to 1): where it is, out of its length (`0` for a live stream or an
 * unknown length). */
export function progressShare(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(1, Math.max(0, position / duration))
}

/**
 * Where the playing video is now, in seconds: the host's last `progress` moved on by the time since it was read
 * (the `rate` it plays at) while it plays, and standing still while it's paused. Never past the end.
 */
export function playhead(
  playing: boolean,
  progress: number,
  progressAt: number,
  now: number,
  rate: number,
  duration: number,
): number {
  const base = Number.isFinite(progress) ? Math.max(0, progress) : 0
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1
  const moved = playing && Number.isFinite(progressAt) && Number.isFinite(now) ? ((now - progressAt) / 1000) * speed : 0
  const position = base + Math.max(0, moved)
  return Number.isFinite(duration) && duration > 0 ? Math.min(duration, position) : position
}
