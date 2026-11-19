import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Telemetry } from '../../shared/host'

/** A player at no volume (so it is paused and played at once, without a fade), recording what it was asked. */
function player(playing = true) {
  const state = { playing, pauses: 0, resumes: 0 }
  const it = {
    name: `player-${Math.random()}`,
    playingHere: () => state.playing,
    pauseHere: () => {
      state.playing = false
      state.pauses += 1
    },
    resumeHere: () => {
      state.playing = true
      state.resumes += 1
    },
    volume: () => null,
    sendVolume: () => {},
    setVolume: () => {},
    skip: () => {},
    subscribe: () => () => {},
  }
  return { it, state }
}

/** The game's telemetry, as much as the game's pause needs. */
function telemetry(paused: boolean): Telemetry {
  return { paused, electricEnabled: true } as Telemetry
}

/** The stores and the player, loaded with the page inside the host (as the other tests load them). */
async function loaded(playing = true) {
  vi.stubGlobal('window', { chrome: { webview: { postMessage: () => {} } } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  const { useCabin, useLive } = await import('../state/store')
  const { pauseMusicWithGame } = await import('./musicWithGame')
  const music = player(playing)
  useCabin.setState({ power: { phase: 'on', since: 0, observed: true } })
  useLive.setState({ telemetry: telemetry(false), gameShown: true, menuGone: false })
  return { useLive, pauseMusicWithGame, music }
}

describe('the music with the game', () => {
  let stop: (() => void) | undefined
  afterEach(() => stop?.())

  it('pauses what plays as the game pauses (its Esc menu), and plays it on as the game runs again', async () => {
    const { useLive, pauseMusicWithGame, music } = await loaded()
    stop = pauseMusicWithGame(music.it)
    useLive.setState({ telemetry: telemetry(true) })
    expect(music.state.pauses).toBe(1)
    expect(music.state.playing).toBe(false)
    useLive.setState({ telemetry: telemetry(false) })
    expect(music.state.resumes).toBe(1)
    expect(music.state.playing).toBe(true)
  })

  it('the host saying the menu has gone while the game is still paused does not play it on', async () => {
    // ATS draws the cab again a moment after Esc, and the host's guess said the menu had gone (2026-11-18).
    const { useLive, pauseMusicWithGame, music } = await loaded()
    stop = pauseMusicWithGame(music.it)
    useLive.setState({ telemetry: telemetry(true) })
    useLive.setState({ menuGone: true })
    expect(music.state.resumes).toBe(0)
    expect(music.state.playing).toBe(false)
    useLive.setState({ menuGone: false })
    expect(music.state.resumes).toBe(0)
    // The game runs again: then it plays on, from where it stopped.
    useLive.setState({ telemetry: telemetry(false) })
    expect(music.state.resumes).toBe(1)
  })

  it('leaves what the player had paused paused, and never plays it on by itself', async () => {
    const { useLive, pauseMusicWithGame, music } = await loaded(false)
    stop = pauseMusicWithGame(music.it)
    useLive.setState({ telemetry: telemetry(true) })
    expect(music.state.pauses).toBe(0)
    useLive.setState({ telemetry: telemetry(false) })
    expect(music.state.resumes).toBe(0)
    expect(music.state.playing).toBe(false)
  })

  it('pauses with the game window hidden, and plays on as it shows again', async () => {
    const { useLive, pauseMusicWithGame, music } = await loaded()
    stop = pauseMusicWithGame(music.it)
    useLive.setState({ gameShown: false })
    expect(music.state.pauses).toBe(1)
    useLive.setState({ gameShown: true })
    expect(music.state.resumes).toBe(1)
  })

  it('the camera outside the cab is no reason to pause: only the game does (the host mutes)', async () => {
    const { useLive, pauseMusicWithGame, music } = await loaded()
    stop = pauseMusicWithGame(music.it)
    // Telemetry changing with the truck (the camera part is the host's) is not the game pausing.
    useLive.setState({ telemetry: { ...telemetry(false), speed: 20 } as Telemetry })
    expect(music.state.pauses).toBe(0)
    expect(music.state.resumes).toBe(0)
  })
})
