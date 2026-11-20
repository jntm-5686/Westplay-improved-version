import type { NeteaseLyricLine } from './netease'

/**
 * The playing song's words, as the player shows them: which line is sung now, the few the closed player shows around
 * it, and whether the cabin's language shows the song's translation. NetEase's own words come from the hidden page
 * (`netease` `lyric`, read from its own `/api/song/lyric`); only the reading of them is here.
 */

/** How far ahead of its time a line lights (the eye reads a moment before the voice sings it). */
const LEAD = 0.2

/** Whether the cabin shows a song's translation: Chinese only, for now. In any other language the words alone are
 * shown, whatever the song's own file carries (`notes/netease-v3-protocol.md`: 多语言规则). */
export function showsTranslation(locale: string): boolean {
  return locale.toLocaleLowerCase().startsWith('zh')
}

/** The line sung at `position` (seconds into the song): the last one started, -1 before the first. */
export function lyricLineAt(lines: NeteaseLyricLine[], position: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].t <= position + LEAD) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/** The lines the closed player shows around the sung one: `count` of them from one line before it (before the song's
 * first line, its first `count`; at its end, its last `count`), so the sung line stays in the middle. */
export function lyricWindow(lines: NeteaseLyricLine[], at: number, count = 3): number[] {
  const size = Math.min(count, lines.length)
  if (size === 0) return []
  const start = Math.min(Math.max(0, at < 0 ? 0 : at - 1), Math.max(0, lines.length - count))
  return Array.from({ length: size }, (_, index) => start + index)
}
