import { type CSSProperties, type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { useNeteaseWords } from './strings'
import { ChevronGlyph, ClockGlyph, Equalizer, NoteGlyph, PlayGlyph, UnplayableGlyph } from './glyphs'
import {
  useIsPlaying,
  type NeteaseArtist,
  type NeteaseLibraryPlaylist,
  type NeteaseList,
  type NeteaseRanking,
  type NeteaseSong,
} from './netease'

/** The pieces the NetEase app's pages share: covers, cards, song rows, sliders, heads, loading shapes. */

/** A colour for a cover there's no picture of: the same every time for the same name. */
function coverColour(name: string): string {
  const seed = [...name].reduce((sum, letter) => (sum * 17 + letter.charCodeAt(0)) % 997, 3)
  return `hsl(${(seed * 47) % 360} 38% 40%)`
}

/**
 * A cover: the picture the hidden page gave, or — no picture (and in the preview, whose covers have none) —
 * one drawn in the name's colour, as NetEase's own covers are: a colour, its first letter, a note.
 */
export function Cover({ name, cover, className = '' }: { name: string; cover: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  const classes = `ne-cover ${className}`
  if (cover && !failed) {
    return (
      <span className={classes}>
        <img src={cover} alt="" draggable={false} onError={() => setFailed(true)} />
      </span>
    )
  }
  return (
    <span className={`${classes} drawn`} style={{ '--cover': coverColour(name) } as CSSProperties}>
      <NoteGlyph />
      <b>{[...name][0] ?? '♪'}</b>
    </span>
  )
}

/** How many times it's been played, compact and in the cabin's language ("218万次播放"). */
function Plays({ count }: { count: number }) {
  const words = useNeteaseWords()
  return (
    <span className="ne-card-plays">
      <PlayGlyph />
      {words.plays(count)}
    </span>
  )
}

/** A playlist's card (Home's shelf, a search's playlists): its cover, name and plays. Pressed, its page. */
export function PlaylistCard({ list, onOpen }: { list: NeteaseList; onOpen(list: NeteaseList): void }) {
  return (
    <button type="button" className="ne-card" onClick={() => onOpen(list)}>
      <Cover name={list.name} cover={list.cover} className="ne-card-cover" />
      <span className="ne-card-name">{list.name}</span>
      <Plays count={list.playCount} />
    </button>
  )
}

/** A playlist of the account's own (歌单's groups): its cover, name and songs (and who it's by for one collected). */
export function LibraryCard({
  list,
  onOpen,
}: {
  list: NeteaseLibraryPlaylist
  onOpen(list: NeteaseLibraryPlaylist): void
}) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-card" onClick={() => onOpen(list)}>
      <Cover name={list.name} cover={list.cover} className="ne-card-cover" />
      <span className="ne-card-name">{list.name}</span>
      <span className="ne-card-plays">
        {words.songs(list.songCount)}
        {list.by && ` · ${words.by(list.by)}`}
      </span>
    </button>
  )
}

/** One of NetEase's charts (榜单): its cover, its name, how often it updates and how long it is. */
export function RankingCard({ ranking, onOpen }: { ranking: NeteaseRanking; onOpen(ranking: NeteaseRanking): void }) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-rank-card" onClick={() => onOpen(ranking)}>
      <Cover name={ranking.name} cover={ranking.cover} className="ne-rank-cover" />
      <span className="ne-rank-text">
        <span className="ne-rank-name">
          {ranking.name}
          {ranking.official && <em>{words.official}</em>}
        </span>
        <span className="ne-rank-meta">
          {ranking.updateFrequency || words.rankingTracks(ranking.trackCount)}
          {ranking.updateFrequency && ` · ${words.rankingTracks(ranking.trackCount)}`}
        </span>
      </span>
      <span className="ne-rank-go" aria-hidden>
        <ChevronGlyph />
      </span>
    </button>
  )
}

/** An artist's card (a search's artists): their picture, their name. Pressed, their page. */
export function ArtistCard({ artist, onOpen }: { artist: NeteaseArtist; onOpen(artist: NeteaseArtist): void }) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-card artist" onClick={() => onOpen(artist)}>
      <Cover name={artist.name} cover={artist.cover} className="ne-card-cover" />
      <span className="ne-card-name">{artist.name}</span>
      <span className="ne-card-plays">{words.artist}</span>
    </button>
  )
}

/** `m:ss`, as the player's clocks write it. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * A song in a list: its number (the bars while it plays), its name and artist, its length, and whether
 * NetEase's rights let it play. Pressed, it plays.
 */
export function SongRow({
  song,
  index,
  onPlay,
}: {
  song: NeteaseSong
  index: number
  onPlay(song: NeteaseSong): void
}) {
  const words = useNeteaseWords()
  const playing = useIsPlaying(song)
  return (
    <button
      type="button"
      className={playing ? 'ne-song current' : 'ne-song'}
      aria-label={song.title}
      onClick={() => onPlay(song)}
    >
      <span className="ne-song-index">{playing ? <Equalizer playing /> : index + 1}</span>
      <span className="ne-song-text">
        <span className="ne-song-title">{song.title}</span>
        <span className="ne-song-artist">{song.artist}</span>
      </span>
      {!song.playable && (
        <span className="ne-badge" title={words.unplayableHint}>
          <UnplayableGlyph />
          {words.unplayable}
        </span>
      )}
      <span className="ne-song-time">{clock(song.duration)}</span>
    </button>
  )
}

/**
 * A bar dragged with the mouse (the truck's pointer): where it's dragged to is `onInput` at once and
 * `onCommit` when let go. A press anywhere on the bar goes there too (a tap seeks).
 */
export function Slider({
  value,
  label,
  onInput,
  onCommit,
  className = '',
  valueText,
}: {
  /** 0 to 1. */
  value: number
  label: string
  onInput?(share: number): void
  onCommit?(share: number): void
  className?: string
  valueText?: string
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = Math.min(1, Math.max(0, drag ?? value))
  const at = (event: PointerEvent) => {
    const box = bar.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  }
  return (
    <div
      ref={bar}
      className={`ne-bar ${drag !== null ? 'dragging' : ''} ${className}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={valueText}
      tabIndex={-1}
      style={{ '--share': shown } as CSSProperties}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        const share = at(event)
        setDrag(share)
        onInput?.(share)
      }}
      onPointerMove={(event) => {
        if (drag === null) return
        const share = at(event)
        setDrag(share)
        onInput?.(share)
      }}
      onPointerUp={(event) => {
        if (drag === null) return
        const share = at(event)
        setDrag(null)
        onCommit?.(share)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <span className="ne-bar-fill" />
      <span className="ne-bar-knob" />
    </div>
  )
}

/** A simple page's head: its title, the one line under it, and what's at its end (Refresh, Play all). */
export function PageHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <header className="ne-page-head">
      <div className="ne-page-head-text">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {action}
    </header>
  )
}

/** A section's title with its one line under it, and what's at its end (Play all, Refresh). */
export function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="ne-section-head">
      <div className="ne-section-title">
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </div>
      {action}
    </div>
  )
}

/** The way into a page (Recently played, Settings): its symbol, its name, its one line and a chevron. */
export function EntryRow({
  glyph,
  title,
  hint,
  busy = false,
  onClick,
}: {
  glyph: ReactNode
  title: string
  hint?: string
  /** Still coming: a spinner where the chevron is. */
  busy?: boolean
  onClick(): void
}) {
  return (
    <button type="button" className="ne-entry" onClick={onClick}>
      <span className="ne-entry-icon">{glyph}</span>
      <span className="ne-entry-text">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </span>
      <span className="ne-entry-go" aria-hidden>
        {busy ? <span className="ne-spinner" /> : <ChevronGlyph />}
      </span>
    </button>
  )
}

/** The way into the recent songs, with how many there are (or a spinner while they come). */
export function RecentEntry({ count, waiting, onOpen }: { count: number | null; waiting: boolean; onOpen(): void }) {
  const words = useNeteaseWords()
  return (
    <EntryRow
      glyph={<ClockGlyph />}
      title={words.recent}
      hint={count === null ? words.recentSource : `${words.recentSource} · ${words.songs(count)}`}
      busy={waiting && count === null}
      onClick={onOpen}
    />
  )
}

/** A page with nothing to show yet, or nothing at all. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="ne-empty">
      <span className="ne-empty-mark">
        <NoteGlyph />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

/** Something the hidden page couldn't do, and the way to ask again. */
export function Failed({ text, retry }: { text: string; retry(): void }) {
  const words = useNeteaseWords()
  return (
    <div className="ne-empty" role="alert">
      <span className="ne-empty-mark">
        <UnplayableGlyph />
      </span>
      <h3>{text}</h3>
      <button type="button" className="ne-pill" onClick={retry}>
        {words.retry}
      </button>
    </div>
  )
}

/** A line of words still coming. */
function Line({ short = false }: { short?: boolean }) {
  return <span className={short ? 'ne-skel-line short' : 'ne-skel-line'} />
}

/** A card still coming: its cover and its two lines. */
function CardShape() {
  return (
    <span className="ne-card">
      <span className="ne-cover ne-skel" />
      <Line />
      <Line short />
    </span>
  )
}

/** Cards still coming: their shapes, breathing. */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="ne-grid ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <CardShape key={index} />
      ))}
    </div>
  )
}

/** A page's songs still coming. */
export function RowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="ne-songs ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="ne-song static">
          <span className="ne-song-index">
            <Line short />
          </span>
          <span className="ne-song-text">
            <Line />
            <Line short />
          </span>
        </span>
      ))}
    </div>
  )
}

/** Home's day's card still coming: its big shape, breathing. */
export function HeroSkeleton() {
  return (
    <div className="ne-hero ne-skeleton" role="progressbar" aria-label="…">
      <span className="ne-hero-art ne-skel" />
      <span className="ne-hero-text">
        <Line short />
        <span className="ne-skel-line title" />
        <Line />
        <Line short />
      </span>
    </div>
  )
}

/** The charts still coming: their wide rows. */
export function RankingsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="ne-rank-grid ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="ne-rank-card">
          <span className="ne-cover ne-skel ne-rank-cover" />
          <span className="ne-rank-text">
            <Line />
            <Line short />
          </span>
        </span>
      ))}
    </div>
  )
}

/** An artist's cards still coming: their round pictures. */
export function ArtistsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="ne-artist-row ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="ne-card artist">
          <span className="ne-cover ne-skel ne-card-cover" />
          <Line />
        </span>
      ))}
    </div>
  )
}

/** The account's page still coming: its big head and its numbers. */
export function ProfileSkeleton() {
  return (
    <div className="ne-profile ne-skeleton" role="progressbar" aria-label="…">
      <span className="ne-profile-hero">
        <span className="ne-avatar ne-skel" />
        <span className="ne-profile-text">
          <Line short />
          <span className="ne-skel-line title" />
          <Line />
        </span>
      </span>
      <span className="ne-profile-stats">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="ne-stat">
            <Line short />
            <Line />
          </span>
        ))}
      </span>
    </div>
  )
}
