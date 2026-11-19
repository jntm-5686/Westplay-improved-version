import { create } from 'zustand'
import { useNetease, type NeteaseSong, type NeteaseTrack } from './netease'

/**
 * What the player is about to do, shown before NetEase's page says it did it: a pressed song goes onto the
 * player bar at once (its title, singer and a drawn cover), the row under it lights up, and the bar keeps a
 * small "coming" mark until the page's own state says that song is playing. Next/Previous can't know the song
 * before the page does, so they only raise that mark.
 *
 * The page's state arrives about a second later, and until it names the hoped-for song the app would show the
 * one before it: while a song is hoped for, a state that names another is put back to the hope — that's the
 * "instant" part. A hope that never comes (the page failed) lets go after a moment, so the bar tells the truth.
 */

/** The extra mark over the player bar while a press is on its way through NetEase's page. */
export interface Hoping {
  /** A song was pressed (`id`: its own), or Next/Previous (`id`: null): the page hasn't said yet. */
  kind: 'play' | 'change'
  id: string | null
}

interface PlaybackUi {
  hoping: Hoping | null
}

/** What the player bar shows of a press not yet answered (a small pulsing mark, never a skeleton). */
export const usePlayback = create<PlaybackUi>()(() => ({ hoping: null }))

/** How long a pressed song's hope holds before the page's silence is believed (the page's own answer is ~1 s). */
const SONG_HOPE = 2400

/** How long Next/Previous wait for a new song before the bar stops marking it. */
const CHANGE_HOPE = 1400

let hope: { id: string; track: NeteaseTrack } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
/** Set while the hope is put back after a state that named another song (so its own change doesn't count). */
let putting = false
let stop: (() => void) | undefined

function clear(): void {
  hope = null
  clearTimeout(timer)
  if (usePlayback.getState().hoping) usePlayback.setState({ hoping: null })
}

/** Watches the page's states once: the hope is confirmed when the page names its song, and held while it
 * names another; Next/Previous's mark is done as soon as any song changes. */
function watch(): void {
  if (stop) return
  stop = useNetease.subscribe((now, before) => {
    if (putting || now.track === before.track) return
    if (hope) {
      if (now.track?.id === hope.id) {
        clear()
        return
      }
      // The page still says the song before: keep the pressed one on the bar (the page is on its way).
      putting = true
      useNetease.setState({ track: hope.track })
      putting = false
      return
    }
    clear()
  })
}

/** A song pressed: on the player bar (and in its list) at once, before the page says it plays. */
export function expectSong(song: NeteaseSong): void {
  if (!song.playable) return
  clear()
  const track: NeteaseTrack = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album ?? '',
    cover: null,
    duration: song.duration,
    position: 0,
    playable: song.playable,
  }
  hope = { id: song.id, track }
  watch()
  usePlayback.setState({ hoping: { kind: 'play', id: song.id } })
  // The song, its restart, and the heart of a song the app doesn't know yet: undone when the page answers.
  // (The app's own change isn't the page answering: `putting` keeps the watcher off it.)
  putting = true
  useNetease.setState({
    track,
    playing: true,
    liked: null,
    liking: false,
    trackAt: performance.now(),
  })
  putting = false
  timer = setTimeout(clear, SONG_HOPE)
}

/** Next or Previous pressed: the bar marks the change until a new song is named (the song itself is the page's). */
export function expectChange(): void {
  clear()
  watch()
  usePlayback.setState({ hoping: { kind: 'change', id: null } })
  timer = setTimeout(clear, CHANGE_HOPE)
}

/** Lets go of a hope (the tests, and a page closed before its answer). */
export function forgetHope(): void {
  clear()
}
