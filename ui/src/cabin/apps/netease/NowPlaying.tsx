import { type CSSProperties, useEffect, useLayoutEffect, useRef } from 'react'
import { useCoverPalette } from './coverColors'
import { Cover, Slider, clock } from './parts'
import { HeartGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph, UnplayableGlyph, VolumeGlyph } from './glyphs'
import { openTab, useNav } from './nav'
import { expectChange, usePlayback } from './playback'
import { playPause, positionOf, seek, setLiked, setVolume, showToast, skip, useNetease, useNow } from './netease'
import { useNeteaseWords } from './strings'

/** The NetEase app's player: the bar at the screen's foot (always there), and its Now Playing page. */

/** The heart (喜欢): the playing song in the account's 我喜欢的音乐, added or taken out by the hidden page. Filled
 * (red) when it's there; the heart changes only as the page's own answer says it landed, and a heart that didn't
 * land says so over the player. */
export function LikeButton({ large = false }: { large?: boolean }) {
  const words = useNeteaseWords()
  const track = useNetease((state) => state.track)
  const liked = useNetease((state) => state.liked)
  const liking = useNetease((state) => state.liking)
  const failure = useNetease((state) => state.likeFailure)
  const failureId = failure?.id ?? 0
  // A like that didn't land (or couldn't: signed out): one line over the player, once per answer.
  useEffect(() => {
    if (!failureId) return
    const reason = useNetease.getState().likeFailure?.reason
    showToast(reason === 'account' ? words.likeSignIn : words.likeFailed)
    // The words are the cabin's, read at this answer only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failureId])
  const known = Boolean(track?.id) && liked !== null
  return (
    <button
      type="button"
      className={`ne-like${liked ? ' liked' : ''}${liking ? ' waiting' : ''}${large ? ' large' : ''}`}
      aria-label={liked ? words.unlike : words.like}
      aria-pressed={Boolean(liked)}
      disabled={!known || liking}
      onClick={() => setLiked(!liked)}
    >
      <HeartGlyph filled={Boolean(liked)} />
    </button>
  )
}

/** The playing page's volume: the speaker (pressed, it mutes, or plays again as loud as it was) and its bar. */
function VolumeControl({ volume }: { volume: number }) {
  const words = useNeteaseWords()
  const before = useRef(volume || 0.8)
  const mute = () => {
    if (volume > 0) before.current = volume
    setVolume(volume > 0 ? 0 : before.current, true)
  }
  return (
    <div className="ne-volume">
      <button
        type="button"
        className="ne-icon-button"
        aria-label={volume === 0 ? words.unmute : words.mute}
        onClick={mute}
      >
        <VolumeGlyph volume={volume} />
      </button>
      <Slider
        className="ne-volume-bar"
        value={volume}
        label={words.volume}
        onInput={(share) => setVolume(share)}
        onCommit={(share) => setVolume(share, true)}
      />
    </div>
  )
}

/** The song's time: the bar (pressed or dragged, it seeks) and the times at its sides. */
function Progress({ position, duration }: { position: number; duration: number }) {
  const words = useNeteaseWords()
  const share = duration > 0 ? position / duration : 0
  return (
    <div className="ne-progress">
      <span className="ne-time">{clock(position)}</span>
      <Slider
        className="ne-progress-bar"
        value={share}
        label={words.nowPlaying}
        valueText={`${clock(position)} / ${clock(duration)}`}
        onCommit={(value) => seek(value * duration)}
      />
      <span className="ne-time">{clock(duration)}</span>
    </div>
  )
}

/** The controls: Previous, Play or Pause (big, in the accent), Next. Next and Previous say at once that a song
 * is on its way (the page names it a moment later); the buttons never wait for it. */
function Controls({ playing, disabled = false }: { playing: boolean; disabled?: boolean }) {
  const words = useNeteaseWords()
  const step = (direction: 1 | -1) => {
    expectChange()
    skip(direction)
  }
  return (
    <div className="ne-controls">
      <button
        type="button"
        className="ne-control"
        aria-label={words.previous}
        disabled={disabled}
        onClick={() => step(-1)}
      >
        <PreviousGlyph />
      </button>
      <button
        type="button"
        className="ne-control ne-play-button"
        aria-label={playing ? words.pause : words.play}
        disabled={disabled}
        onClick={playPause}
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button type="button" className="ne-control" aria-label={words.next} disabled={disabled} onClick={() => step(1)}>
        <NextGlyph />
      </button>
    </div>
  )
}

/**
 * The player at the screen's foot, as the desktop player's: the song's cover and names at the left (pressed,
 * its Now Playing page), the controls, the time, and the volume. It never steps aside: the app's own pages
 * make room for it.
 */
export function PlayerBar() {
  const words = useNeteaseWords()
  const track = useNetease((state) => state.track)
  const playing = useNetease((state) => state.playing)
  const volume = useNetease((state) => state.volume)
  const trackAt = useNetease((state) => state.trackAt)
  const hoping = usePlayback((state) => state.hoping)
  const now = useNow(playing)
  const position = positionOf(track, playing, trackAt, now)
  return (
    <footer className="ne-player" aria-label={words.nowPlaying} aria-busy={hoping ? true : undefined}>
      <button type="button" className="ne-player-song" onClick={() => openTab('now')} aria-label={words.nowPlaying}>
        <Cover name={track?.album || track?.title || '♪'} cover={track?.cover ?? null} className="ne-player-cover" />
        <span className="ne-player-text">
          <span className="ne-player-name">{track?.title ?? words.nothingPlaying}</span>
          <span className="ne-player-artist">{track?.artist ?? words.nothingPlayingHint}</span>
        </span>
        {hoping && <span className="ne-hop" role="status" aria-label={words.hoping} title={words.hoping} />}
      </button>
      <Controls playing={playing} disabled={!track} />
      <LikeButton />
      <Progress position={position} duration={track?.duration ?? 0} />
      <VolumeControl volume={volume} />
    </footer>
  )
}

/** Now Playing: the song large, its time, the controls and the volume, as NetEase's desktop player has it.
 *
 * Immersive as NetEase's own app: the cover fills the page's top as a blurred backdrop, a gradient made of the
 * cover's colours runs the whole page down into the dark, the cover sits large in front of it (breathing while the
 * song plays), and the song's own large words, the time, the controls, the volume and the heart are laid over that.
 * The colours come from the picture when it will give them (coverColors.ts), from the drawn cover's colour when
 * there's no picture, and from the app's own dark gradient when the picture won't — the page never waits on any of
 * it. The veil over the colours keeps white words and glyphs readable on any cover. */
export function NowPlayingPage() {
  const words = useNeteaseWords()
  const track = useNetease((state) => state.track)
  const playing = useNetease((state) => state.playing)
  const volume = useNetease((state) => state.volume)
  const trackAt = useNetease((state) => state.trackAt)
  const now = useNow(playing)
  const position = positionOf(track, playing, trackAt, now)
  // The drawn cover's name: the cover is named by its album, or by the song when it has none.
  const art = track ? track.album || track.title : ''
  const layers = useCoverPalette(track?.cover ?? null, art)
  // The page fades and scales in each time it's opened (it's kept mounted while another page shows, so the app's
  // own layer switch can't do it): the class is put back before the frame it shows in.
  const shown = useNav((state) => state.tab === 'now' && state.stacks.now.length === 0)
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = root.current
    if (!shown || !element) return
    element.classList.remove('entering')
    void element.offsetWidth
    element.classList.add('entering')
  }, [shown])
  if (!track) {
    return (
      <div className="ne-scroll">
        <div className="ne-empty">
          <span className="ne-empty-mark">
            <PlayGlyph />
          </span>
          <h3>{words.nothingPlaying}</h3>
          <p>{words.nothingPlayingHint}</p>
        </div>
      </div>
    )
  }
  const palette = layers.current.palette
  const tint = (colours: string[]): CSSProperties =>
    ({
      '--ne-now-a': colours[0],
      '--ne-now-b': colours[1],
      '--ne-now-c': colours[2],
    }) as CSSProperties
  return (
    <div
      ref={root}
      className={playing ? 'ne-now-page playing' : 'ne-now-page'}
      style={
        palette
          ? ({ '--ne-now-accent': palette.accent, '--ne-now-on-accent': palette.onAccent } as CSSProperties)
          : undefined
      }
    >
      <div className="ne-now-backdrop" aria-hidden="true">
        <Cover name={art} cover={track.cover} className="ne-now-backdrop-cover" />
      </div>
      <div className="ne-now-tints" aria-hidden="true">
        {layers.previous?.palette && (
          <div key={layers.previous.key} className="ne-now-tint" style={tint(layers.previous.palette.colors)} />
        )}
        <div
          key={`${layers.current.key}:${palette ? 'colour' : 'plain'}`}
          className="ne-now-tint live"
          style={palette ? tint(palette.colors) : undefined}
        />
      </div>
      <div className="ne-now-veil" aria-hidden="true" />
      <div className="ne-now-stage">
        <header className="ne-now-head">
          <span className="ne-kicker">{words.brand}</span>
          <h2>{words.nowPlaying}</h2>
        </header>
        <div className="ne-now-body">
          <div className="ne-now-art">
            <Cover name={art} cover={track.cover} className="ne-now-cover" />
          </div>
          <div className="ne-now-side">
            <h1 className="ne-now-title" title={track.title}>
              {track.title}
            </h1>
            <p className="ne-now-artist">{track.artist}</p>
            {track.album && (
              <p className="ne-now-album">
                {words.album} · {track.album}
              </p>
            )}
            {!track.playable && (
              <p className="ne-warn">
                <UnplayableGlyph />
                {words.unplayableHint}
              </p>
            )}
          </div>
        </div>
        <div className="ne-now-foot">
          <Progress position={position} duration={track.duration} />
          <div className="ne-now-tools">
            <VolumeControl volume={volume} />
            <Controls playing={playing} />
            <LikeButton large />
          </div>
        </div>
      </div>
    </div>
  )
}
