import { describe, expect, it } from 'vitest'
import { imeCandidates, pickCandidate } from './imeCandidates'

describe('the pinyin IME’s candidates', () => {
  it('offers the common characters a syllable could be, most common first', () => {
    const words = imeCandidates('da').map((candidate) => candidate.word)
    expect(words.length).toBeGreaterThan(0)
    // 大 and 打 head the dictionary's "da": an IME's first pages.
    expect(words.slice(0, 4)).toContain('大')
  })

  it('offers whole words for their pinyin', () => {
    expect(imeCandidates('beijing', 10).map((candidate) => candidate.word)).toContain('北京')
  })

  it('replaces the letters it matched, keeping what was typed before them', () => {
    const [first] = imeCandidates('da')
    expect(pickCandidate('da', first)).toBe(first.word)
    expect(pickCandidate('xda', first)).toBe(`x${first.word}`)
  })

  it('says nothing for what is not pinyin', () => {
    expect(imeCandidates('北京')).toEqual([])
    expect(imeCandidates('')).toEqual([])
    expect(imeCandidates('d a')).toEqual([])
  })

  it('offers no more than asked', () => {
    expect(imeCandidates('shi', 3).length).toBeLessThanOrEqual(3)
  })
})
