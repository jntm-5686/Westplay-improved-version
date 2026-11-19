import { describe, expect, it } from 'vitest'
import { imeCandidates } from './imeCandidates'
import { acceptedText, moreShown, panelCandidates, PANEL_STEP, shownCandidates } from './imePanel'

/**
 * The IME's expanded candidate panel (ImeBar.tsx's 展开全部候选), without a screen: the whole list behind the
 * bar's few, its pages, and picking a word from it.
 */

/** The letters still being spelled from a field's text (the bar reads its own this way). */
function typedIn(text: string): string {
  return /[a-z']+$/i.exec(text)?.[0] ?? ''
}

describe('the IME’s expanded candidates', () => {
  it('gives the panel every candidate, not the bar’s few', () => {
    const bar = imeCandidates('shi', 5)
    const all = panelCandidates('shi')
    expect(bar).toHaveLength(5)
    expect(all.length).toBeGreaterThan(bar.length)
    // The bar's own lead the whole list (the most common first, as the dictionary gives them).
    expect(all.slice(0, bar.length).map((candidate) => candidate.word)).toEqual(bar.map((candidate) => candidate.word))
    // A character the bar's five don't reach is in the whole list, which is what the panel is for.
    expect(all.map((candidate) => candidate.word)).toContain('是')
  })

  it('pages the list a screenful at a time, never past its end', () => {
    const all = panelCandidates('da')
    expect(all.length).toBeGreaterThan(PANEL_STEP)
    expect(shownCandidates(all, PANEL_STEP)).toHaveLength(PANEL_STEP)
    expect(shownCandidates(all, PANEL_STEP)[0]).toEqual(all[0])
    const next = moreShown(PANEL_STEP, all.length)
    expect(next).toBe(PANEL_STEP + PANEL_STEP)
    expect(shownCandidates(all, next)).toHaveLength(Math.min(next, all.length))
    // A list walked to its end stops there, and so does one near it.
    expect(moreShown(all.length, all.length)).toBe(all.length)
    expect(moreShown(all.length - 5, all.length)).toBe(all.length)
    // Nothing shown is nothing more.
    expect(shownCandidates(all, 0)).toEqual([])
  })

  it('writes the picked candidate where the letters were, and the bar folds away after it', () => {
    const [first] = panelCandidates('shi')
    expect(acceptedText('shi', 'shi', first)).toBe(first.word)
    expect(acceptedText('wo shi', 'shi', first)).toBe(`wo ${first.word}`)
    // A word of several characters is written whole.
    const beijing = panelCandidates('beijing').find((candidate) => candidate.word === '北京')
    expect(beijing).toBeDefined()
    expect(acceptedText('去 beijing', 'beijing', beijing!)).toBe('去 北京')
    // The letters are gone with it: the bar (and its panel) have no candidates left to show.
    expect(typedIn(acceptedText('wo shi', 'shi', first))).toBe('')
  })

  it('says nothing for letters that aren’t pinyin', () => {
    expect(panelCandidates('')).toEqual([])
    expect(panelCandidates('北京')).toEqual([])
    expect(panelCandidates('d a')).toEqual([])
  })
})
