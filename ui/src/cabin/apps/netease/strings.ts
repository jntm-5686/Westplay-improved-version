import { useText } from '../../state/text'
import { neteaseWords, type NeteaseWords } from './words'

/** The NetEase app's words in the cabin's language (words.ts has them; this reads which one). */
export { neteaseWords, type NeteaseWords } from './words'

export function useNeteaseWords(): NeteaseWords {
  return neteaseWords(useText().locale)
}
