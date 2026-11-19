import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreview } from './preview'
import { sourceOf } from './source'
import { neteaseWords } from './words'

/**
 * The NetEase app's own pieces: what the preview answers, how the player's clock reads, and the commands the
 * hidden page is sent (the host's page stubbed, as the Spotify app's tests stub its own).
 */

function inHost() {
  const posted: { type: string; kind?: string; command?: unknown }[] = []
  vi.stubGlobal('window', {
    chrome: {
      webview: {
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: (message: { type: string; kind?: string; command?: unknown }) => posted.push(message),
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
  return { commands: () => posted.filter((message) => message.type === 'netease').map((message) => message.command) }
}

const SONG = { id: 'song-1', title: '北环线的晚风', artist: '山雾乐队', duration: 240, playable: true }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the host’s hidden page', () => {
  it('is asked for a playlist as its page opens, and told the song by id when one is pressed', async () => {
    const host = inHost()
    const { receivePlaylist, openPlaylist, playSong } = await import('./netease')
    openPlaylist('list-7')
    expect(host.commands()).toContainEqual({ action: 'openPlaylist', value: 'list-7' })
    receivePlaylist('list-7', [SONG])
    playSong('list-7', SONG)
    expect(host.commands()).toContainEqual({ action: 'play', value: 'song-1' })
  })

  it('plays a playlist from its first playable song when Play all is pressed', async () => {
    const host = inHost()
    const { playPlaylist, receivePlaylist } = await import('./netease')
    const unplayable = { ...SONG, id: 'vip-only', title: '会员曲', playable: false }
    // Songs not known yet: Play all waits for them, then asks for the first it can play.
    playPlaylist('list-1')
    expect(host.commands()).toEqual([{ action: 'openPlaylist', value: 'list-1' }])
    receivePlaylist('list-1', [unplayable, SONG])
    expect(host.commands()).toContainEqual({ action: 'play', value: 'song-1' })
  })

  it('never asks for a song NetEase’s rights don’t allow', async () => {
    const host = inHost()
    const { playSong } = await import('./netease')
    playSong('list-1', { ...SONG, playable: false })
    expect(host.commands()).toEqual([])
  })

  it('keeps an unplayable song marked, and the position it was given', async () => {
    inHost()
    const { receiveState, useNetease } = await import('./netease')
    receiveState({
      signedIn: true,
      signingIn: false,
      playing: true,
      volume: 0.7,
      track: { ...SONG, album: '夜航电台', cover: null, position: 63, playable: false },
      lists: [{ id: 'list-1', name: '夜航电台', cover: null, playCount: 2184000 }],
    })
    const state = useNetease.getState()
    expect(state.track?.playable).toBe(false)
    expect(state.track?.position).toBe(63)
    expect(state.lists).toHaveLength(1)
    expect(state.heard).toBe(true)
  })
})

describe('the player’s clock', () => {
  it('runs on while playing, stops while paused, and never past the song', async () => {
    inHost()
    const { positionOf } = await import('./netease')
    const track = { ...SONG, album: 'x', cover: null, position: 30, playable: true }
    expect(positionOf(track, false, 0, 100_000)).toBe(30)
    expect(positionOf(track, true, 0, 5000)).toBe(35)
    expect(positionOf(track, true, 0, 1_000_000)).toBe(240)
  })
})

describe('the account', () => {
  it('says signing in over signed in or out, and unknown until the page has said', async () => {
    inHost()
    const { accountOf } = await import('./netease')
    expect(accountOf({ signedIn: null, signingIn: false })).toBe('unknown')
    expect(accountOf({ signedIn: false, signingIn: false })).toBe('out')
    expect(accountOf({ signedIn: true, signingIn: false })).toBe('in')
    expect(accountOf({ signedIn: false, signingIn: true })).toBe('signingIn')
  })
})

describe('the preview', () => {
  it('answers twelve playlists, each with its songs, a few of them unplayable', () => {
    const preview = createPreview()
    const state = preview.read()
    expect(state.signedIn).toBe(true)
    expect(state.lists).toHaveLength(12)
    expect(state.track).not.toBeNull()
    const songs = preview.songs(state.lists[0].id)
    expect(songs.length).toBeGreaterThan(10)
    expect(preview.songs('no-such-list')).toEqual([])
    const unplayable = state.lists.flatMap((list) => preview.songs(list.id).filter((song) => !song.playable))
    expect(unplayable.length).toBeGreaterThan(0)
  })

  it('plays what it is asked to, skips what NetEase wouldn’t, and seeks within the song', () => {
    const preview = createPreview()
    const first = preview.songs(preview.read().lists[2].id)
    preview.playSong(preview.read().lists[2].id, first[3])
    expect(preview.read().track?.title).toBe(first[3].title)
    preview.skip(1)
    const skipped = preview.read().track
    expect(skipped?.playable).toBe(true)
    preview.seek(9999)
    expect(preview.read().track?.position).toBe(skipped?.duration ?? 0)
    preview.play(false)
    expect(preview.read().playing).toBe(false)
  })
})

describe('the app’s words', () => {
  it('writes the same counts the cab does in Chinese and English', () => {
    expect(neteaseWords('zh-CN').plays(2_184_000)).toBe('218万次播放')
    expect(neteaseWords('en-US').plays(2_184_000)).toBe('2.2M plays')
    expect(neteaseWords('zh-CN').songs(14)).toBe('14 首')
  })
})

describe('what the Dashboard shows of it', () => {
  it('says the song, its cover, and how far in it is when the state was read', () => {
    const track = {
      id: '42',
      title: '夜航电台',
      artist: '北纬二十七',
      album: '公路与夜',
      cover: 'https://p1.music.126.net/a.jpg',
      duration: 240,
      position: 63,
      playable: true,
    }
    const now = sourceOf(track, true, 1000)
    expect(now?.source).toMatchObject({
      id: 'westplay-netease',
      service: 'netease',
      title: '夜航电台',
      artist: '北纬二十七',
      album: '公路与夜',
      status: 'playing',
      positionMs: 63_000,
      durationMs: 240_000,
    })
    expect(now?.source.controls).toMatchObject({ playPause: true, next: true, previous: true })
    expect(now?.artwork).toBe('https://p1.music.126.net/a.jpg')
    // The clock's place is the Unix time of the state, not of now.
    expect(Number.isInteger(now?.source.positionAt)).toBe(true)
    expect(now!.source.positionAt).toBeGreaterThan(1_000)

    const paused = sourceOf(track, false, 1000)
    expect(paused?.source.status).toBe('paused')
  })

  it('shows nothing without a song', () => {
    expect(sourceOf(null, false, 0)).toBeNull()
  })
})
