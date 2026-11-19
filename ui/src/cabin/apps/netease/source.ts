import type { MediaSource } from '../../../shared/media'

/**
 * The app's state as the Dashboard's Now Playing and the Equalizer take it (`shared/media.ts`): the song,
 * its cover, whether it plays, and how far in it was when the host's state was read. Kept apart from the
 * app's module so it can be read without a browser (its tests do).
 */
interface NeteaseTrackLike {
  title: string
  artist: string
  album: string
  cover: string | null
  duration: number
  position: number
}

export function sourceOf(
  track: NeteaseTrackLike | null,
  playing: boolean,
  at: number,
): { source: MediaSource; artwork: string | null } | null {
  if (!track) return null
  return {
    source: {
      id: 'westplay-netease',
      service: 'netease',
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.cover,
      status: playing ? 'playing' : 'paused',
      positionMs: track.position * 1000,
      positionAt: Math.round(performance.timeOrigin + at),
      durationMs: track.duration * 1000,
      controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
      shuffle: false,
      repeat: 'off',
    },
    artwork: track.cover,
  }
}
