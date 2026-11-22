import { describe, expect, it, vi } from 'vitest'
import { sourceOf } from './source'

const now = {
  title: '把车停在海边，等一场没有预告的日落',
  cover: 'https://example.invalid/cover.jpg',
  up: { name: '夜航研究所' },
  duration: 726,
  live: false,
  kind: 'video' as const,
}

describe('what the Dashboard shows of the app', () => {
  it('is nothing while nothing plays', () => {
    expect(sourceOf(null, true, 0, 0)).toBeNull()
  })

  it('is the video, its UP主, its cover, its position and its controls', () => {
    vi.stubGlobal('performance', { timeOrigin: 1_000, now: () => 2_000 })
    const shown = sourceOf(now, true, 42, 2_000)
    expect(shown?.artwork).toBe('https://example.invalid/cover.jpg')
    expect(shown?.source).toMatchObject({
      id: 'westplay-bilibili',
      service: 'bilibili',
      title: now.title,
      artist: '夜航研究所',
      album: '哔哩哔哩',
      status: 'playing',
      positionMs: 42_000,
      positionAt: 3_000,
      durationMs: 726_000,
    })
    expect(shown?.source.controls).toMatchObject({ playPause: true, next: true, previous: false })
    vi.unstubAllGlobals()
  })

  it('takes the host’s state length when the video’s name doesn’t carry it', () => {
    const shown = sourceOf({ ...now, duration: 0 }, true, 0, 0, 726)
    expect(shown?.source.durationMs).toBe(726_000)
  })

  it('is paused, with the last position, when the video is', () => {
    const shown = sourceOf(now, false, 12, 100)
    expect(shown?.source.status).toBe('paused')
    expect(shown?.source.positionMs).toBe(12_000)
  })

  it('has no duration nor next for a live room', () => {
    const live = { ...now, title: '夜航直播', live: true, kind: 'live' as const, duration: 0 }
    const shown = sourceOf(live, true, 0, 0)
    expect(shown?.source.durationMs).toBe(0)
    expect(shown?.source.controls.next).toBe(false)
  })
})
