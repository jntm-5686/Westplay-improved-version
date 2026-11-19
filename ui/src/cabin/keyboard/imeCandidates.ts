import { createPinyinEngine, type PinyinEngine } from 'pinyin-ime'
import { dict } from 'pinyin-ime/dictionary/google_pinyin_dict'

/**
 * The pinyin IME's candidates: what the letters typed so far could be, as a Chinese IME offers them (owner
 * 2026-11-17: "做出这种的预览框 可以在游戏内用鼠标点击想要打的字"). The words come from Google Pinyin's
 * dictionary (pinyin-ime, MIT), whose common characters and words carry their frequency, so "da" offers 打 before
 * 答. Made once, on the first letters typed: nothing is read from the dictionary until Chinese is typed.
 */

let engine: PinyinEngine | null = null

/** The engine, made on first use (the dictionary is some thousands of entries: it costs nothing before then). */
function imeEngine(): PinyinEngine {
  engine ??= createPinyinEngine(dict)
  return engine
}

export interface ImeCandidate {
  /** The text picked: a character, or a word of several. */
  word: string
  /** How many of the typed letters it replaces (the rest stays, as an IME leaves it). */
  matched: number
}

/** At most `limit` of what `typed` could be, the most common first. */
export function imeCandidates(typed: string, limit = 6): ImeCandidate[] {
  const input = typed.trim().toLowerCase()
  if (!/^[a-z']+$/.test(input)) return []
  try {
    const { candidates } = imeEngine().getCandidates(input)
    return candidates.slice(0, limit).map((candidate) => ({ word: candidate.word, matched: candidate.matchedLength }))
  } catch {
    // A dictionary that won't read is no IME: the letters stay as typed.
    return []
  }
}

/** `typed` with the last `matched` letters replaced by `word` (the rest of the typing stays). */
export function pickCandidate(typed: string, candidate: ImeCandidate): string {
  return typed.slice(0, Math.max(0, typed.length - candidate.matched)) + candidate.word
}
