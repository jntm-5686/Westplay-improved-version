import type { MediaSource } from '../../../shared/media'

/**
 * Bilibili's playing video as the Dashboard's Now Playing (and the Equalizer) read it (`shared/media.ts`): its cover,
 * its title, its UP主, whether it plays, and where it was when the host's state was read. Kept apart from the app's
 * module so it can be read without a browser (its tests do).
 */
interface BilibiliNowLike {
  title: string
  cover: string | null
  up?: { name: string } | null
  duration: number
  live: boolean
  kind: 'video' | 'bangumi' | 'live'
}

/** Its position at the state read: the server's seconds, and the page's clock when they were read. `duration` is the
 * host's own length (the state's), which an answer that names only the media may not carry in the now itself. */
export function sourceOf(
  now: BilibiliNowLike | null,
  playing: boolean,
  progress: number,
  progressAt: number,
  duration = 0,
): { source: MediaSource; artwork: string | null } | null {
  if (!now) return null
  const live = now.live === true
  const length = duration > 0 ? duration : Math.max(0, now.duration)
  return {
    source: {
      id: 'westplay-bilibili',
      service: 'bilibili',
      title: now.title,
      artist: now.up?.name ?? '',
      album: live ? '哔哩哔哩直播' : '哔哩哔哩',
      artwork: now.cover,
      status: playing ? 'playing' : 'paused',
      positionMs: Math.max(0, progress) * 1000,
      positionAt: Math.round((typeof performance === 'undefined' ? 0 : performance.timeOrigin) + progressAt),
      durationMs: live ? 0 : length * 1000,
      controls: { playPause: true, next: !live, previous: false, shuffle: false, repeat: false },
      shuffle: null,
      repeat: null,
    },
    artwork: now.cover,
  }
}
