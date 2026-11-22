import { useText } from '../../state/text'
import { bilibiliWords, type BilibiliWords } from './words'

/** The Bilibili app's words in the cabin's language (words.ts has them; this reads which one). */
export { bilibiliWords, type BilibiliWords } from './words'

export function useBilibiliWords(): BilibiliWords {
  return bilibiliWords(useText().locale)
}
