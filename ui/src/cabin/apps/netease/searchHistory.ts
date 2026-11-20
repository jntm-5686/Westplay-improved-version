import { create } from 'zustand'

/**
 * The searches Search has been asked: the newest first, at most three, each once — asking a word again moves it to
 * the front — and kept for the next session in the browser's storage. The list functions are pure (the tests read
 * them without a browser); the tiny store at the end is what the search page reads and the bar writes.
 */

/** How many searches are kept: three, a row of chips on the search page. */
export const HISTORY_MOST = 3

/** Where they're kept (the style and the app's own settings are kept beside it). */
export const HISTORY_KEY = 'westplay.netease.searchHistory'

/** The words as the search bar itself says them: trimmed, and at most 60 characters (`setQuery`'s own cut). */
function saidOf(query: string): string {
  return query.trim().slice(0, 60)
}

/** `history` cleaned: strings only, each trimmed and capped, no empty, no duplicate (however it's cased), `most`
 *  of them at the front of the list. */
export function keptSearches(history: readonly unknown[], most = HISTORY_MOST): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const entry of history) {
    if (typeof entry !== 'string') continue
    const said = saidOf(entry)
    const key = said.toLocaleLowerCase()
    if (!said || seen.has(key)) continue
    seen.add(key)
    kept.push(said)
    if (kept.length >= most) break
  }
  return kept
}

/** `history` with `query` remembered: at its front, once (a word asked again moves up), at most `most`; an empty
 *  query leaves the kept ones as they are. */
export function rememberSearch(history: readonly string[], query: string, most = HISTORY_MOST): string[] {
  const kept = keptSearches(history, most)
  const said = saidOf(query)
  if (!said) return kept
  const key = said.toLocaleLowerCase()
  return [said, ...kept.filter((entry) => entry.toLocaleLowerCase() !== key)].slice(0, most)
}

/** The kept searches, read from the browser's storage (`[]` for none, for storage blocked, or for what isn't a list
 *  of words). */
export function keptHistory(most = HISTORY_MOST): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const said: unknown = JSON.parse(raw)
    return Array.isArray(said) ? keptSearches(said, most) : []
  } catch {
    return []
  }
}

/** Keeps the searches for the next session (nothing kept when the browser's storage won't hold them). */
function saveHistory(history: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MOST)))
  } catch {
    // Storage blocked: kept for this session only.
  }
}

interface SearchHistoryStore {
  /** The newest first, at most three. */
  items: string[]
  /** A search asked (the return key, a kept word pressed): remembered, moved to the front if it was there. */
  add(query: string): void
  /** The whole history forgotten. */
  clear(): void
}

export const useSearchHistory = create<SearchHistoryStore>()((set, get) => ({
  items: keptHistory(),
  add: (query) => {
    const items = rememberSearch(get().items, query)
    saveHistory(items)
    set({ items })
  },
  clear: () => {
    saveHistory([])
    set({ items: [] })
  },
}))
