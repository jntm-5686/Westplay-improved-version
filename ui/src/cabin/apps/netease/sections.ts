import type { NeteaseSearch } from './netease'

/**
 * A search's results as one page, in NetEase's own order of importance: the artists it found first (a search
 * for a singer is nearly always about the singer), then the songs, then the playlists. Only what the answer
 * actually has is a section, so a search that found an artist but no songs leads with the artist.
 */

/** A result section's kind, in the order they're drawn. */
export type ResultKind = 'artists' | 'songs' | 'playlists'

/** One section of a search's page, and how many the page says it found of it (not just the first few it sent). */
export interface ResultSection {
  kind: ResultKind
  total: number
}

/** The sections of a search's page, in their order (nothing searched: nothing at all). */
export function searchSections(search: NeteaseSearch | null): ResultSection[] {
  if (!search) return []
  const sections: ResultSection[] = []
  if (search.artists.length > 0) sections.push({ kind: 'artists', total: search.artistsTotal })
  if (search.songs.length > 0) sections.push({ kind: 'songs', total: search.songsTotal })
  if (search.playlists.length > 0) sections.push({ kind: 'playlists', total: search.playlistsTotal })
  return sections
}

/** Whether the answer has anything at all to draw. */
export function hasResults(search: NeteaseSearch | null): boolean {
  if (!search) return false
  return search.artists.length > 0 || search.songs.length > 0 || search.playlists.length > 0
}

/** The counts a search's page says it found, for its one-line summary. */
export function resultCounts(search: NeteaseSearch): { songs: number; artists: number; playlists: number } {
  return { songs: search.songsTotal, artists: search.artistsTotal, playlists: search.playlistsTotal }
}
