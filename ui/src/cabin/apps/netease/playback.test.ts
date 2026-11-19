import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A song pressed before NetEase's page says it plays: the player bar and the song's row follow the press at
 * once, an old state arriving behind it doesn't take it back, and the page's own answer lets the mark go.
 */

function inHost() {
  vi.stubGlobal('window', {
    chrome: {
      webview: {
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: () => {},
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
}

const OLD = {
  id: 'old-1',
  title: '旧歌',
  artist: '旧人',
  album: '旧专辑',
  cover: null,
  duration: 180,
  position: 30,
  playable: true,
}

const PLAYED = {
  signedIn: true,
  signingIn: false,
  playing: true,
  volume: 0.8,
  track: OLD,
  liked: true,
  lists: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('a song pressed before the page says so', () => {
  it('goes on the player bar at once, and a state that still names the old song doesn’t take it back', async () => {
    inHost()
    const netease = await import('./netease')
    const playback = await import('./playback')
    netease.receiveState(PLAYED)
    expect(netease.useNetease.getState().track?.id).toBe('old-1')

    const song = { id: 'new-1', title: '新歌', artist: '新人', duration: 200, playable: true }
    playback.expectSong(song)
    const hoped = netease.useNetease.getState()
    expect(hoped.track).toMatchObject({ id: 'new-1', title: '新歌', artist: '新人', position: 0 })
    expect(hoped.playing).toBe(true)
    // The last song's heart isn't this song's: it waits for the page to say.
    expect(hoped.liked).toBeNull()
    expect(playback.usePlayback.getState().hoping).toEqual({ kind: 'play', id: 'new-1' })

    // The page pushes its state about once a second: the old song's, until it has played the new one.
    netease.receiveState(PLAYED)
    expect(netease.useNetease.getState().track).toMatchObject({ id: 'new-1', title: '新歌' })
    expect(playback.usePlayback.getState().hoping).toEqual({ kind: 'play', id: 'new-1' })

    // Its own answer names the new song: the hope lets go and the bar is the page's again.
    netease.receiveState({
      ...PLAYED,
      track: { ...OLD, id: 'new-1', title: '新歌', artist: '新人', cover: 'https://example.test/new.jpg' },
      liked: false,
    })
    expect(netease.useNetease.getState().track).toMatchObject({
      id: 'new-1',
      cover: 'https://example.test/new.jpg',
    })
    expect(netease.useNetease.getState().liked).toBe(false)
    expect(playback.usePlayback.getState().hoping).toBeNull()
    playback.forgetHope()
  })

  it('never hopes for a song NetEase’s rights don’t allow', async () => {
    inHost()
    const netease = await import('./netease')
    const playback = await import('./playback')
    netease.receiveState(PLAYED)
    playback.expectSong({ id: 'vip', title: '会员曲', artist: '人', duration: 100, playable: false })
    expect(netease.useNetease.getState().track?.id).toBe('old-1')
    expect(playback.usePlayback.getState().hoping).toBeNull()
    playback.forgetHope()
  })

  it('marks Next/Previous at once, and lets go when a song is named', async () => {
    inHost()
    const netease = await import('./netease')
    const playback = await import('./playback')
    netease.receiveState(PLAYED)
    playback.expectChange()
    expect(playback.usePlayback.getState().hoping).toEqual({ kind: 'change', id: null })
    // The page's next state names another song: the mark is done.
    netease.receiveState({ ...PLAYED, track: { ...OLD, id: 'next-1', title: '下一首' } })
    expect(netease.useNetease.getState().track?.id).toBe('next-1')
    expect(playback.usePlayback.getState().hoping).toBeNull()
    playback.forgetHope()
  })

  it('a new press replaces the hope before it (fast clicking never waits on the last one)', async () => {
    inHost()
    const netease = await import('./netease')
    const playback = await import('./playback')
    netease.receiveState(PLAYED)
    playback.expectSong({ id: 'first', title: '第一首', artist: '人', duration: 100, playable: true })
    playback.expectSong({ id: 'second', title: '第二首', artist: '人', duration: 100, playable: true })
    expect(netease.useNetease.getState().track).toMatchObject({ id: 'second', title: '第二首' })
    expect(playback.usePlayback.getState().hoping).toEqual({ kind: 'play', id: 'second' })
    netease.receiveState({
      ...PLAYED,
      track: { ...OLD, id: 'second', title: '第二首', artist: '人' },
    })
    expect(playback.usePlayback.getState().hoping).toBeNull()
    playback.forgetHope()
  })
})
