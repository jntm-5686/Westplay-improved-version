import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NeteasePlayerState, NeteaseSong } from './netease'

/**
 * The app's own queue: the list a song was played from, and how Next/Previous walk it (its own order, round and
 * round; at random within it; never a song NetEase's rights don't allow). The host's hidden page is stubbed the way
 * the app's other tests stub it, so the commands these tests read are the ones a real cabin page sends.
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function song(id: string, playable = true): NeteaseSong {
  return { id, title: `歌 ${id}`, artist: '人', duration: 200, playable }
}

/** What the page says plays: `mode` left out stands for a page that doesn't say it (an older one). */
function pageState(id: string, mode?: string): NeteasePlayerState {
  return {
    signedIn: true,
    signingIn: false,
    playing: true,
    ...(mode ? { mode } : {}),
    volume: 0.7,
    track: { ...song(id), album: '专辑', cover: null, position: 0 },
    liked: false,
    lists: [],
  }
}

const META = {
  id: 'p1',
  name: '夜航电台',
  cover: null,
  playCount: 0,
  trackCount: 3,
  updateFrequency: '',
  creator: '',
  description: '',
}

describe('the list what plays came from', () => {
  it('walks the day’s songs in their own order, round and round, and back again', async () => {
    const host = inHost()
    const { playDaily, receiveMessage, receiveState, skip, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: { songs: [song('d1'), song('d2'), song('d3')] },
      radar: null,
      personal: [],
      recommended: [],
    })
    playDaily()
    expect(host.commands()).toContainEqual({ action: 'play', value: 'd1', list: 'daily' })
    expect(useNetease.getState().from).toMatchObject({ kind: 'daily' })
    expect(useNetease.getState().from?.name).not.toBe('')

    receiveState(pageState('d1'))
    expect(skip(1)).toMatchObject({ id: 'd2', title: '歌 d2' })
    expect(host.commands().at(-1)).toEqual({ action: 'play', value: 'd2', list: 'daily' })

    receiveState(pageState('d2'))
    expect(skip(1)?.id).toBe('d3')

    // The end of the list: round to its first (列表循环).
    receiveState(pageState('d3'))
    expect(skip(1)?.id).toBe('d1')

    // Before its start: its last.
    receiveState(pageState('d1'))
    expect(skip(-1)?.id).toBe('d3')
    expect(host.commands().at(-1)).toEqual({ action: 'play', value: 'd3', list: 'daily' })
  })

  it('follows a playlist’s own order, and knows its name', async () => {
    const host = inHost()
    const { playPlaylist, playSong, receivePlaylist, receiveState, skip, useNetease } = await import('./netease')
    receivePlaylist('p1', [song('a'), song('b'), song('c')], META)
    playPlaylist('p1')
    expect(host.commands()).toContainEqual({ action: 'play', value: 'a', list: 'p1' })
    expect(useNetease.getState().from).toEqual({ kind: 'playlist', name: '夜航电台' })

    playSong('p1', song('b'))
    receiveState(pageState('b'))
    expect(skip(1)?.id).toBe('c')
    receiveState(pageState('c'))
    expect(skip(1)?.id).toBe('a')
    receiveState(pageState('a'))
    expect(skip(-1)?.id).toBe('c')
  })

  it('names a chart as a chart, and skips what NetEase’s rights don’t allow', async () => {
    const host = inHost()
    const { playSong, receiveMessage, receivePlaylist, receiveState, skip, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'rankings',
      rankings: [
        {
          id: 'r1',
          name: '飙升榜',
          cover: null,
          updateFrequency: '刚刚更新',
          trackCount: 3,
          playCount: 1,
          official: true,
        },
      ],
    })
    receivePlaylist('r1', [song('x'), song('vip', false), song('y')], { ...META, id: 'r1', name: '飙升榜' })
    playSong('r1', song('x'))
    expect(useNetease.getState().from).toEqual({ kind: 'ranking', name: '飙升榜' })
    receiveState(pageState('x'))
    // The song in between can't play: the chart's next is the one after it.
    expect(skip(1)?.id).toBe('y')
    expect(host.commands().at(-1)).toEqual({ action: 'play', value: 'y', list: 'r1' })
  })

  it('asks the page’s own next when the song is of no list the app has read', async () => {
    const host = inHost()
    const { receiveState, skip, useNetease } = await import('./netease')
    receiveState(pageState('nowhere'))
    expect(useNetease.getState().from).toBeNull()
    expect(skip(1)).toBeNull()
    expect(host.commands().at(-1)).toEqual({ action: 'next' })
    expect(skip(-1)).toBeNull()
    expect(host.commands().at(-1)).toEqual({ action: 'prev' })
  })

  it('finds the list again after the page’s own player moved the song', async () => {
    const host = inHost()
    const { playDaily, playFound, receiveMessage, receiveState, skip } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: { songs: [song('d1'), song('d2'), song('d3')] },
      radar: null,
      personal: [],
      recommended: [],
    })
    playDaily()
    // A song of no list the app has read (the app's own queue is forgotten), then the day's third song: the list is
    // known again from the song itself.
    playFound(song('elsewhere'))
    receiveState(pageState('d3'))
    expect(skip(1)?.id).toBe('d1')
    expect(host.commands().at(-1)).toEqual({ action: 'play', value: 'd1', list: 'daily' })
  })
})

describe('the play mode', () => {
  it('is read off the host’s own state message (the player bar’s button shows it)', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'state',
      state: {
        signedIn: true,
        signingIn: false,
        playing: true,
        mode: 'shuffle',
        volume: 0.7,
        track: { ...song('a'), album: '专辑', cover: null, position: 0 },
        lists: [],
      },
    })
    expect(useNetease.getState().mode).toBe('shuffle')
  })

  it('is read from the page’s state, and a page that doesn’t say it doesn’t undo it', async () => {
    inHost()
    const { receiveState, useNetease } = await import('./netease')
    receiveState(pageState('a', 'one'))
    expect(useNetease.getState().mode).toBe('one')
    // An older page's state (no mode): the app keeps the mode it shows.
    receiveState(pageState('a'))
    expect(useNetease.getState().mode).toBe('one')
  })

  it('goes to its next one at a press, and a state from before the page took it doesn’t undo it', async () => {
    const host = inHost()
    const { cycleMode, receiveState, useNetease } = await import('./netease')
    receiveState(pageState('a', 'list'))
    expect(cycleMode()).toBe('shuffle')
    expect(useNetease.getState().mode).toBe('shuffle')
    expect(host.commands().at(-1)).toEqual({ action: 'cycleMode' })
    // The page hasn't taken it yet (a state from just before the press): the button keeps the mode it went to.
    receiveState(pageState('a', 'list'))
    expect(useNetease.getState().mode).toBe('shuffle')
    // Its own answer stands.
    receiveState(pageState('a', 'shuffle'))
    expect(useNetease.getState().mode).toBe('shuffle')
  })

  it('shuffles within the list only, never the same song twice in a row', async () => {
    inHost()
    const { playDaily, receiveMessage, receiveState, skip, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: { songs: [song('d1'), song('d2'), song('d3'), song('d4')] },
      radar: null,
      personal: [],
      recommended: [],
    })
    playDaily()
    receiveState(pageState('d2', 'shuffle'))
    expect(useNetease.getState().mode).toBe('shuffle')
    const seen = new Set<string>()
    for (let press = 0; press < 24; press++) {
      const next = skip(1)
      expect(next).not.toBeNull()
      expect(['d1', 'd3', 'd4']).toContain(next!.id)
      seen.add(next!.id)
    }
    // Within this list, and not the same every time.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('still walks the list for a manual skip on 单曲循环 (only the song’s own end repeats)', async () => {
    inHost()
    const { playDaily, receiveMessage, receiveState, skip } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: { songs: [song('d1'), song('d2'), song('d3')] },
      radar: null,
      personal: [],
      recommended: [],
    })
    playDaily()
    receiveState(pageState('d2', 'one'))
    expect(skip(1)?.id).toBe('d3')
    expect(skip(-1)?.id).toBe('d1')
  })
})
