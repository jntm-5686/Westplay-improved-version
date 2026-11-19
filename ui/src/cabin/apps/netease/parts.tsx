import { type CSSProperties, type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { useNeteaseWords } from './strings'
import { Equalizer, NoteGlyph, PlayGlyph, UnplayableGlyph } from './glyphs'
import { useIsPlaying, type NeteaseList, type NeteaseSong } from './netease'

/** The pieces the NetEase app's pages share: covers, cards, song rows, sliders, loading shapes. */

/** A colour for a cover there's no picture of: the same every time for the same name. */
function coverColour(name: string): string {
  const seed = [...name].reduce((sum, letter) => (sum * 17 + letter.charCodeAt(0)) % 997, 3)
  return `hsl(${(seed * 47) % 360} 34% 42%)`
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

/** A playlist card: its cover, its name, and how often it's been played. Pressed, its page. */
export function PlaylistCard({ list, onOpen }: { list: NeteaseList; onOpen(list: NeteaseList): void }) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-card" onClick={() => onOpen(list)}>
      <Cover name={list.name} cover={list.cover} className="ne-card-cover" />
      <span className="ne-card-name">{list.name}</span>
      <span className="ne-card-plays">
        <PlayGlyph />
        {words.plays(list.playCount)}
      </span>
    </button>
  )
}

/** `m:ss`, as the player's clocks write it. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * A song in a playlist's list: its number (the bars while it plays), its name and artist, its length, and
 * whether NetEase's rights let it play. Pressed, it plays (in WestPlay, the hidden page is asked to play the
 * playlist, v1's protocol having no per-song command).
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

/** A page's title, with what it says under it, and what's at its end (Refresh, Play all). */
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

/** Home's cards still coming: their shapes, breathing. */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="ne-grid ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="ne-card">
          <span className="ne-cover ne-skel" />
          <Line />
          <Line short />
        </span>
      ))}
    </div>
  )
}

/** A page's songs still coming. */
export function RowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="ne-songs ne-skeleton" role="progressbar" aria-label="…">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="ne-song">
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
