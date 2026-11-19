import { imeAllCandidates, type ImeCandidate } from './imeCandidates'

/**
 * The IME's whole candidate list, as the expanded panel offers it (ImeBar.tsx's 展开全部候选): the bar has room for
 * a few, and a rarer character — a name's, an uncommon one — is one of the hundreds behind them. Kept apart from
 * the component so the pages, the picking and the count are read without a screen (its tests).
 */

/** How many candidates the panel shows at first, and adds with each "more". */
export const PANEL_STEP = 48

/** The panel's whole list for the letters being typed, most common first (none when they aren't pinyin). */
export function panelCandidates(typed: string): ImeCandidate[] {
  return imeAllCandidates(typed)
}

/** The first `shown` of the list (what the panel draws). */
export function shownCandidates(all: readonly ImeCandidate[], shown: number): ImeCandidate[] {
  return all.slice(0, Math.max(0, shown))
}

/** How many the panel shows after another page, never past the whole list. */
export function moreShown(shown: number, total: number, step = PANEL_STEP): number {
  return Math.min(Math.max(0, total), Math.max(0, shown) + Math.max(1, step))
}

/** What the field becomes when `candidate` is picked: the letters still being spelled (`typed`) give way to it,
 *  and what was typed before them stays — the bar's own picking, and the panel's. */
export function acceptedText(text: string, typed: string, candidate: ImeCandidate): string {
  const kept = text.slice(0, Math.max(0, text.length - typed.length))
  return kept + candidate.word
}
