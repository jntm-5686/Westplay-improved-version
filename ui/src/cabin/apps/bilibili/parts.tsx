import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useBilibiliWords } from './strings'
import type { BilibiliBangumi, BilibiliEpisode, BilibiliLiveRoom, BilibiliUp, BilibiliVideo } from './bilibili'
import { useBilibili, useIsPlaying } from './bilibili'
import { coverTint } from './cover'
import { formatClock } from './time'
import { PlayGlyph, TvGlyph } from './glyphs'

/**
 * The Bilibili app's shared pieces: covers (the host's pictures, or the app's own gradient where Bilibili gives none —
 * the browser preview has none), the cards the lists are made of, the section heads, the pills, the filters, and what
 * every page says while it waits, when nothing came and when it's empty.
 */

/** A cover: Bilibili's picture when there is one, the app's own gradient when there isn't. */
export function Cover({
  cover,
  title,
  wide = false,
  className = '',
}: {
  cover: string | null
  title: string
  wide?: boolean
  className?: string
}) {
  const [a, b] = coverTint(title)
  const style = { '--bb-cover-a': a, '--bb-cover-b': b } as CSSProperties
  return (
    <div className={`bb-cover ${wide ? 'wide' : ''} ${className}`.trim()} style={style}>
      {cover ? (
        <img src={cover} alt="" draggable={false} referrerPolicy="no-referrer" />
      ) : (
        <span className="bb-cover-fallback" aria-hidden>
          <TvGlyph />
          <b>{title.slice(0, 8)}</b>
        </span>
      )}
    </div>
  )
}

/** A video's length over its cover, or that it's a live stream. */
export function LengthBadge({ seconds, live = false }: { seconds: number; live?: boolean }) {
  const words = useBilibiliWords()
  if (live) return <span className="bb-length live">{words.home.liveNow}</span>
  if (seconds <= 0) return null
  return <span className="bb-length">{formatClock(seconds)}</span>
}

/** One video in a grid: its cover and length, its title, its UP主 and how often it's been watched. */
export function VideoCard({ video, onOpen }: { video: BilibiliVideo; onOpen(video: BilibiliVideo): void }) {
  const words = useBilibiliWords()
  const playing = useIsPlaying(video.id)
  return (
    <button
      type="button"
      className={playing ? 'bb-video playing' : 'bb-video'}
      aria-label={video.title}
      onClick={() => onOpen(video)}
    >
      <span className="bb-video-art">
        <Cover cover={video.cover} title={video.title} />
        <LengthBadge seconds={video.duration} />
        {playing && (
          <span className="bb-video-playing" aria-hidden>
            <PlayGlyph />
          </span>
        )}
      </span>
      <span className="bb-video-title">{video.title}</span>
      <span className="bb-video-meta">
        {video.up.name && <span className="bb-video-up">{video.up.name}</span>}
        <span>{words.home.views(video.views)}</span>
        {video.published && <span>{video.published}</span>}
      </span>
    </button>
  )
}

/** Every video of a list, in the app's grid (its columns follow the panel's width: bilibili.css). */
export function VideoGrid({ videos, onOpen }: { videos: BilibiliVideo[]; onOpen(video: BilibiliVideo): void }) {
  return (
    <div className="bb-grid">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} onOpen={onOpen} />
      ))}
    </div>
  )
}

/** A season's card (番剧 or 影视): its cover, how far it's updated, its title and its numbers. */
export function BangumiCard({ season, onOpen }: { season: BilibiliBangumi; onOpen(season: BilibiliBangumi): void }) {
  const words = useBilibiliWords()
  return (
    <button type="button" className="bb-season" aria-label={season.title} onClick={() => onOpen(season)}>
      <span className="bb-season-art">
        <Cover cover={season.cover} title={season.title} wide />
        {season.progress && <span className="bb-season-badge">{season.progress}</span>}
      </span>
      <span className="bb-season-title">{season.title}</span>
      <span className="bb-season-meta">
        {season.rating !== undefined && <b>{words.home.rating(season.rating)}</b>}
        {season.badge && <span>{season.badge}</span>}
        {season.episodes.length > 0 && <span>{words.home.episodes(season.episodes.length)}</span>}
      </span>
    </button>
  )
}

/** A live room's card: its picture, whether it's on air, its title and its streamer. */
export function LiveCard({ room, onOpen }: { room: BilibiliLiveRoom; onOpen(room: BilibiliLiveRoom): void }) {
  const words = useBilibiliWords()
  return (
    <button type="button" className="bb-livecard" aria-label={room.title} onClick={() => onOpen(room)}>
      <span className="bb-livecard-art">
        <Cover cover={room.cover} title={room.title} wide />
        <span className={room.live ? 'bb-livecard-badge on' : 'bb-livecard-badge'}>
          <i aria-hidden />
          {room.live ? words.live.liveNow : words.live.offline}
        </span>
        <span className="bb-livecard-online">{words.live.online(room.online)}</span>
      </span>
      <span className="bb-livecard-title">{room.title}</span>
      <span className="bb-livecard-meta">
        {room.uname && <span>{room.uname}</span>}
        {room.area && <span>{room.area}</span>}
      </span>
    </button>
  )
}

/** A section's head: its name, and a way further (Home's rows). */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?(): void }) {
  return (
    <div className="bb-section-head">
      <h3>{title}</h3>
      {action && onAction && (
        <button type="button" className="bb-section-more" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

/** One pill of a row (the category pills, a search's filters): on or off. */
export function Pill({ label, on, onClick, count }: { label: string; on: boolean; onClick(): void; count?: number }) {
  return (
    <button type="button" className={on ? 'bb-pill on' : 'bb-pill'} aria-pressed={on} onClick={onClick}>
      {label}
      {count !== undefined && <span className="bb-pill-count">{count}</span>}
    </button>
  )
}

/** An avatar: the account's or a UP主's picture, or the app's mark where there is none. */
export function Avatar({ user, size = 'normal' }: { user: BilibiliUp | null; size?: 'small' | 'normal' | 'large' }) {
  const [a, b] = coverTint(user?.name || 'bilibili')
  return (
    <span
      className={`bb-avatar ${size}`}
      style={{ '--bb-cover-a': a, '--bb-cover-b': b } as CSSProperties}
      aria-hidden={!user?.name}
    >
      {user?.avatar ? <img src={user.avatar} alt="" draggable={false} referrerPolicy="no-referrer" /> : <TvGlyph />}
    </span>
  )
}

/** What a page says while its list is still coming (a short line, not a tall empty block: nothing flashes open). */
export function Loading({ label }: { label?: string }) {
  const words = useBilibiliWords()
  return (
    <div className="bb-state bb-state-loading" role="status">
      <span className="bb-spinner" aria-hidden />
      <p>{label ?? words.loading}</p>
    </div>
  )
}

/** What a page says when the host's page didn't answer, with the way to ask again (and Bilibili's own reason, when it
 * gave one: signed out (`-101`), risk control (`-352`/`412`), or its error). */
export function Failed({ onRetry, label }: { onRetry(): void; label?: string }) {
  const words = useBilibiliWords()
  const failure = useBilibili((state) => state.failure)
  const signedOut = failure?.code === -101
  return (
    <div className="bb-state" role="alert">
      <b>{label ?? words.failed}</b>
      <p>{signedOut ? words.account.needed : failure?.message || words.failedHint}</p>
      <button type="button" className="bb-state-button" onClick={onRetry}>
        {words.retry}
      </button>
    </div>
  )
}

/** What a page (or a row of one) says when it's empty. */
export function Empty({
  title,
  hint,
  action,
  onAction,
}: {
  title: string
  hint: string
  action?: string
  onAction?(): void
}) {
  return (
    <div className="bb-state">
      <span className="bb-state-mark" aria-hidden>
        <TvGlyph />
      </span>
      <b>{title}</b>
      <p>{hint}</p>
      {action && onAction && (
        <button type="button" className="bb-state-button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

/** A page's head, over its list: the title and one line under it. */
export function PageHead({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <header className="bb-page-head">
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {children}
    </header>
  )
}

/** A season's 选集: an episode a button, the one playing marked, and the film's own one. */
/** One episode's words in a 选集 list: its number, its VIP mark (where Bilibili gives one) and its name. */
export function EpisodeBody({ episode }: { episode: BilibiliEpisode }) {
  const words = useBilibiliWords()
  return (
    <>
      <span className="bb-episode-line">
        <span className="bb-episode-no">{words.bangumi.episode(episode.index)}</span>
        {episode.badge && <span className="bb-episode-badge">{episode.badge}</span>}
      </span>
      <span className="bb-episode-name">{episode.title}</span>
    </>
  )
}

export function EpisodeGrid({
  episodes,
  currentId,
  onPlay,
}: {
  episodes: BilibiliEpisode[]
  currentId?: string
  onPlay(episode: BilibiliEpisode): void
}) {
  const words = useBilibiliWords()
  return (
    <div className="bb-episodes">
      {episodes.map((episode) => (
        <button
          key={episode.id}
          type="button"
          className={episode.id === currentId ? 'bb-episode on' : 'bb-episode'}
          title={`${words.bangumi.episode(episode.index)} · ${episode.title}`}
          onClick={() => onPlay(episode)}
        >
          <EpisodeBody episode={episode} />
          {episode.duration > 0 && <span className="bb-episode-time">{formatClock(episode.duration)}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * A bar dragged sideways: the player's progress and volume, and the previews' rows. Pressed or dragged, it moves the
 * app's own mark at once (`onInput`) and only sends what it came to when let go (`onCommit`): a drag across the cab's
 * screen asks the page once, not once a frame.
 */
export function Slider({
  value,
  label,
  onInput,
  onCommit,
  className = '',
  valueText,
  disabled = false,
}: {
  /** 0 to 1. */
  value: number
  label: string
  onInput?(share: number): void
  onCommit?(share: number): void
  className?: string
  valueText?: string
  disabled?: boolean
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = Math.min(1, Math.max(0, drag ?? value))
  const at = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = bar.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return 0
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  }
  return (
    <div
      ref={bar}
      className={`bb-slider ${drag !== null ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      style={{ '--share': shown } as CSSProperties}
      onPointerDown={(event) => {
        if (disabled) return
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
      <span className="bb-slider-track" />
      <span className="bb-slider-fill" />
      <span className="bb-slider-knob" />
    </div>
  )
}
