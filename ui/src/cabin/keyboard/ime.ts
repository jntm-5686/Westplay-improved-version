import { pinyin } from 'pinyin-pro'

/**
 * The pinyin IME's candidates: the names the map's places have in Chinese, typed by their pinyin (owner
 * 2026-11-17: "做一个中文输入法…搜索地点的时候搜索不了"). A place is typed whole ("beijing") or by its
 * initials ("bj"), as a Chinese IME types a word; the candidates are its own Chinese names, so picking one
 * searches for it as the game names it.
 *
 * The index is built once per places list (a map of a few thousand) and kept: typing then walks it, which is
 * microseconds — nothing per frame, nothing while no Chinese is typed.
 */

export interface Candidate {
  /** What the field gets when it's picked: the place's name. */
  text: string
  /** Its name in letters, whole and by initials ("beijing", "bj"). */
  whole: string
  initials: string
}

const CHINESE = /[\u3400-\u9fff]/

/** The letters `name` is typed by: its whole pinyin, and its initials. */
export function pinyinOf(name: string): { whole: string; initials: string } {
  return {
    whole: pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase(),
    initials: pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase(),
  }
}

/** What a places list was indexed into, kept by its identity: the same list is only walked once. */
const INDEXED = new WeakMap<object, Candidate[]>()

/** The Chinese names of `places`, each with the letters it's typed by. */
export function placeIndex(places: readonly { name?: string; localized?: string }[] | null | undefined): Candidate[] {
  if (!places) return []
  const kept = INDEXED.get(places)
  if (kept) return kept
  const seen = new Set<string>()
  const index: Candidate[] = []
  for (const place of places) {
    for (const name of [place.name, place.localized]) {
      if (!name || !CHINESE.test(name) || seen.has(name)) continue
      seen.add(name)
      index.push({ text: name, ...pinyinOf(name) })
    }
  }
  INDEXED.set(places, index)
  return index
}

/**
 * At most `limit` of `places`' names whose pinyin `typed` begins: the whole pinyin's first ("beijing"), then
 * the initials' ("bj"), the shorter names first in each — a Chinese IME's candidates over the map.
 */
export function pinyinCandidates(
  places: readonly { name?: string; localized?: string }[] | null | undefined,
  typed: string,
  limit = 6,
): Candidate[] {
  const word = typed.toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return []
  const whole: Candidate[] = []
  const initials: Candidate[] = []
  for (const candidate of placeIndex(places)) {
    if (candidate.whole.startsWith(word)) whole.push(candidate)
    else if (candidate.initials.startsWith(word)) initials.push(candidate)
  }
  whole.sort((a, b) => a.whole.length - b.whole.length || a.text.length - b.text.length)
  return [...whole, ...initials].slice(0, limit)
}

/** Whether `typed` is pinyin being typed: Latin letters only, as the keyboard gives them. */
export function typingPinyin(typed: string): boolean {
  return /^[a-z']+$/i.test(typed.trim())
}
