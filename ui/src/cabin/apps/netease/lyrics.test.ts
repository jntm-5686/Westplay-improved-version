import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreview } from './preview'
import { lyricLineAt, lyricWindow, showsTranslation } from './lyrics'
import type { NeteaseLyric, NeteaseLyricLine } from './netease'

/**
 * The playing song's words: the line that's sung at a moment, the few the closed player shows around it, whether the
 * cabin shows a song's translation, how the hidden page's answer is read (and only for the song that plays), and the
 * preview's own invented words.
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

const line = (t: number, text: string, tr?: string): NeteaseLyricLine => (tr ? { t, text, tr } : { t, text })

/** What plays, as the host says it (`track`: the song's title and id). */
function state(title: string, id: string, position = 30) {
  return {
    signedIn: true,
    signingIn: false,
    playing: true,
    volume: 0.8,
    track: { id, title, artist: '山雾乐队', album: '夜航', cover: null, duration: 240, position, playable: true },
    lists: [],
  }
}

describe('the line that is sung', () => {
  const lines = [line(10, '一'), line(20, '二'), line(30, '三')]

  it('is the last line started, a moment before its time (the eye reads ahead), and -1 before the first', () => {
    expect(lyricLineAt(lines, 0)).toBe(-1)
    expect(lyricLineAt(lines, 9.5)).toBe(-1)
    // 10 - 0.2: the lead lights the next line a moment before the voice reaches it.
    expect(lyricLineAt(lines, 9.8)).toBe(0)
    expect(lyricLineAt(lines, 10)).toBe(0)
    expect(lyricLineAt(lines, 19.7)).toBe(0)
    expect(lyricLineAt(lines, 19.8)).toBe(1)
    expect(lyricLineAt(lines, 20)).toBe(1)
    expect(lyricLineAt(lines, 9_999)).toBe(2)
    expect(lyricLineAt([], 30)).toBe(-1)
  })
})

describe('the closed player’s few lines', () => {
  const lines = [line(1, '一'), line(2, '二'), line(3, '三'), line(4, '四'), line(5, '五')]

  it('keeps the sung line in the middle, the first lines at the start and the last at the end', () => {
    expect(lyricWindow(lines, -1, 3)).toEqual([0, 1, 2])
    expect(lyricWindow(lines, 0, 3)).toEqual([0, 1, 2])
    expect(lyricWindow(lines, 2, 3)).toEqual([1, 2, 3])
    expect(lyricWindow(lines, 4, 3)).toEqual([2, 3, 4])
    expect(lyricWindow(lines, 99, 3)).toEqual([2, 3, 4])
    // A song shorter than the window shows all it has.
    expect(lyricWindow(lines.slice(0, 2), 1, 3)).toEqual([0, 1])
    expect(lyricWindow([], 0, 3)).toEqual([])
  })
})

describe('the cabin’s language and a song’s translation', () => {
  it('shows a translation in Chinese only, for now', () => {
    expect(showsTranslation('zh-CN')).toBe(true)
    expect(showsTranslation('zh-Hans-CN')).toBe(true)
    expect(showsTranslation('zh-TW')).toBe(true)
    expect(showsTranslation('en-US')).toBe(false)
    expect(showsTranslation('de-DE')).toBe(false)
    expect(showsTranslation('ja-JP')).toBe(false)
    expect(showsTranslation('')).toBe(false)
  })
})

describe('the hidden page’s words', () => {
  it('keeps them for the song that plays, and never for the one before it', async () => {
    inHost()
    const { receiveMessage, receiveState, useNetease } = await import('./netease')
    receiveState(state('北环线的晚风', '1001'))
    receiveMessage({
      type: 'netease',
      kind: 'lyric',
      id: '1001',
      instrumental: false,
      lines: [line(6.5, '风穿过车窗', 'Wind through the window'), line(13, '路灯一盏盏')],
    })
    const lyric = useNetease.getState().lyric
    expect(lyric?.id).toBe('1001')
    expect(lyric?.lines).toHaveLength(2)
    expect(lyric?.lines[1]).toEqual({ t: 13, text: '路灯一盏盏' })
    // The next song: the last one's words leave with it, and an answer that was still on its way for them is dropped.
    receiveState(state('沿海公路', '1002'))
    expect(useNetease.getState().lyric).toBeNull()
    receiveMessage({ type: 'netease', kind: 'lyric', id: '1001', instrumental: false, lines: [line(1, '旧歌')] })
    expect(useNetease.getState().lyric).toBeNull()
    receiveMessage({ type: 'netease', kind: 'lyric', id: '1002', instrumental: false, lines: [line(2, '新歌')] })
    expect(useNetease.getState().lyric?.lines[0].text).toBe('新歌')
    // Nothing plays: nothing's words.
    receiveState({ ...state('沿海公路', '1002'), playing: false, track: null })
    expect(useNetease.getState().lyric).toBeNull()
  })

  it('reads only the lines it can show, and a pure music’s own mark', async () => {
    inHost()
    const { receiveMessage, receiveState, useNetease } = await import('./netease')
    receiveState(state('卡农', '2001'))
    receiveMessage({
      type: 'netease',
      kind: 'lyric',
      id: '2001',
      instrumental: true,
      lines: [
        line(6, '   '),
        { t: -1, text: '负数' },
        { t: 'nonsense', text: '不是时间' },
        line(12.345, '一句', ''),
        { text: '没有时间' },
      ],
    })
    const lyric = useNetease.getState().lyric
    expect(lyric?.instrumental).toBe(true)
    expect(lyric?.lines).toEqual([{ t: 12.345, text: '一句' }])
    // A message with no id, or not an object, is no answer at all.
    useNetease.setState({ lyric: null })
    receiveMessage({ type: 'netease', kind: 'lyric', instrumental: false, lines: [line(1, '一')] })
    receiveMessage({ type: 'netease', kind: 'lyric', id: '2001', lines: 'no' })
    expect(useNetease.getState().lyric?.id).toBe('2001')
    expect(useNetease.getState().lyric?.lines).toEqual([])
  })

  it('keeps the translation beside the line it belongs to (the cabin decides whether to show it)', async () => {
    inHost()
    const { receiveMessage, receiveState, useNetease } = await import('./netease')
    receiveState(state('Love Story', '26896129', 20))
    receiveMessage({
      type: 'netease',
      kind: 'lyric',
      id: '26896129',
      instrumental: false,
      lines: [
        line(16.922, 'We were both young when I first saw you', '第一次见到你的时候我们都很年轻'),
        line(20.569, 'I close my eyes and the flashback starts'),
      ],
    })
    const lines = useNetease.getState().lyric?.lines ?? []
    expect(lines[0].tr).toBe('第一次见到你的时候我们都很年轻')
    expect(lines[1].tr).toBeUndefined()
  })
})

describe('the preview’s words', () => {
  it('are there for its songs: lines from the start, a pure music and a song without words now and then', () => {
    const preview = createPreview()
    const songs = preview.songs(preview.read().lists[0].id)
    const lyricOf = (at: number): NeteaseLyric =>
      preview.lyric({
        id: songs[at].id,
        title: songs[at].title,
        artist: songs[at].artist,
        album: '',
        cover: null,
        duration: songs[at].duration,
        position: 0,
        playable: true,
      })
    // The first song of the first list: words, in time and from the song's start.
    const first = lyricOf(0)
    expect(first.instrumental).toBe(false)
    expect(first.lines.length).toBeGreaterThan(10)
    expect(first.lines[0].t).toBeGreaterThan(0)
    expect(first.lines.every((each, index) => index === 0 || each.t > first.lines[index - 1].t)).toBe(true)
    // Each kind shows up in a list of fourteen songs: a pure music, a song with no words, and a translated one.
    const all = songs.map((song) => preview.lyric({ ...song, album: '', cover: null, position: 0 }))
    expect(all.some((one) => one.instrumental)).toBe(true)
    expect(all.some((one) => !one.instrumental && one.lines.length === 0)).toBe(true)
    expect(all.some((one) => one.lines.some((each) => each.tr))).toBe(true)
  })

  it('follows the song the preview plays, without asking the host', () => {
    const preview = createPreview()
    const track = preview.read().track
    expect(track).not.toBeNull()
    expect(preview.lyric(track!).id).toBe(track!.id)
  })
})
