import { type CSSProperties, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCoverPalette } from './coverColors'
import { Cover, Slider, clock } from './parts'
import {
  BackGlyph,
  HeartGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  UnplayableGlyph,
  VolumeGlyph,
  ModeGlyph,
} from './glyphs'
import { openTab, useNav } from './nav'
import { expectChange, expectSong, usePlayback } from './playback'
import {
  cycleMode,
  playPause,
  positionOf,
  seek,
  setLiked,
  setVolume,
  showToast,
  skip,
  useNetease,
  useNow,
} from './netease'
import { fullScreen, leftFullScreen } from './stack'
import { useNeteaseWords } from './strings'

/** The name its own play mode goes by in the bar's words. */
function modeName(words: ReturnType<typeof useNeteaseWords>, mode: 'list' | 'shuffle' | 'one'): string {
  return mode === 'shuffle' ? words.modeShuffle : mode === 'one' ? words.modeOne : words.modeList
}

/** Its play mode's button (the player bar's, and the full-screen player's): pressed, the next mode, said over the
 * player at once ("随机播放"), while the page's own bar takes it a moment later. The mark is the mode it is: the list
 * round and round, its arrows crossed, the one song's own mark. */
export function ModeButton({ large = false }: { large?: boolean }) {
  const words = useNeteaseWords()
  const mode = useNetease((state) => state.mode)
  const name = modeName(words, mode)
  const press = () => {
    // The toast names the mode the press went to (the page's own state confirms it a moment later).
    showToast(modeName(words, cycleMode()))
  }
  return (
    <button
      type="button"
      className={`ne-player-mode${large ? ' large' : ''}`}
      onClick={press}
      aria-label={`${words.mode} · ${name}`}
      title={`${words.mode} · ${name}`}
      data-mode={mode}
    >
      <ModeGlyph mode={mode} />
    </button>
  )
}

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
 * is on its way: with the list known, the song they go to is already known and goes on the bar by its own name; a
 * page's own next (no list known) names it a moment later. */
function Controls({ playing, disabled = false }: { playing: boolean; disabled?: boolean }) {
  const words = useNeteaseWords()
  const step = (direction: 1 | -1) => {
    const next = skip(direction)
    if (next) expectSong(next)
    else expectChange()
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
 * The player at the screen's foot, as the desktop player's: the song's time across the whole top (its bar, and the
 * two times at its sides), and under it the song's cover and names at the left (pressed, its Now Playing page), the
 * controls in the middle, and the play mode, the heart and the volume at the right. It never steps aside: the app's
 * own pages make room for it.
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
      <Progress position={position} duration={track?.duration ?? 0} />
      <div className="ne-player-row">
        <button type="button" className="ne-player-song" onClick={() => openTab('now')} aria-label={words.nowPlaying}>
          <Cover name={track?.album || track?.title || '♪'} cover={track?.cover ?? null} className="ne-player-cover" />
          <span className="ne-player-text">
            <span className="ne-player-name">{track?.title ?? words.nothingPlaying}</span>
            <span className="ne-player-artist">{track?.artist ?? words.nothingPlayingHint}</span>
          </span>
          {hoping && <span className="ne-hop" role="status" aria-label={words.hoping} title={words.hoping} />}
        </button>
        <Controls playing={playing} disabled={!track} />
        <div className="ne-player-actions">
          <ModeButton />
          <LikeButton />
          <VolumeControl volume={volume} />
        </div>
      </div>
    </footer>
  )
}

/** Where the full-screen page is in its way in or out: `enter` is its first painted frame (at the player bar's
 * place), `open` the page itself, `leave` its way back down into that bar. */
type Phase = 'enter' | 'open' | 'leave'

/** How long the page's way out takes, as the stylesheet has it for this screen and this setting (`--ne-now-out`:
 * 340 ms, less on the short and 7" screens, 120 ms calm), plus a frame so the transition has certainly finished when
 * the app's page behind is shown again. */
function leaveDuration(element: HTMLElement | null): number {
  if (!element) return 360
  const said = Number.parseFloat(getComputedStyle(element).getPropertyValue('--ne-now-out'))
  return Number.isFinite(said) ? said + 20 : 360
}

/** Now Playing: the song large, its time, the controls and the volume, as NetEase's desktop player has it.
 *
 * Immersive as NetEase's own app: the cover fills the page's top as a blurred backdrop, a gradient made of the
 * cover's colours runs the whole page down into the dark, the cover sits large in front of it (breathing while the
 * song plays), and the song's own large words, the time, the controls, the volume and the heart are laid over that.
 * The colours come from the picture when it will give them (coverColors.ts), from the drawn cover's colour when
 * there's no picture, and from the app's own dark gradient when the picture won't — the page never waits on any of
 * it. The veil over the colours keeps white words and glyphs readable on any cover.
 *
 * It's the app's full screen (NeteaseApp.tsx sets the app's `data-immersive` from `stack.ts`'s `fullScreen`): the
 * app's rail, top bar and player bar are out of sight under it, and the page itself carries the way back, a round
 * button at its top left — Back out of the app's history, or Home where there's none behind it.
 *
 * Both ways are one state machine (NowPlaying.tsx's `Phase`): opened, it grows up out of the player bar at the foot
 * (the iOS sheet's own feel: the backdrop's colours first, the cover after it, the words and the controls after
 * that); closed, it shrinks back into that bar and fades, and only then does the app show the page behind it. The
 * stylesheet has the curves and times (netease.css's `--ne-now-*`), so the calm setting, the cab's reduced motion and
 * the 7" screen each get their own (`leaveDuration` reads the time back). */
export function NowPlayingPage() {
  const words = useNeteaseWords()
  const track = useNetease((state) => state.track)
  const playing = useNetease((state) => state.playing)
  const volume = useNetease((state) => state.volume)
  const trackAt = useNetease((state) => state.trackAt)
  const style = useNetease((state) => state.style)
  const now = useNow(playing)
  const position = positionOf(track, playing, trackAt, now)
  // The drawn cover's name: the cover is named by its album, or by the song when it has none.
  const art = track ? track.album || track.title : ''
  const layers = useCoverPalette(track?.cover ?? null, art)
  const shown = useNav(fullScreen)
  const open = useNav((state) => state.open)
  const root = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('open')
  const leaving = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Opened: the page starts at the player bar's place, a hair small and clear of the screen's foot, and comes up on
  // the next frame — the start has to be painted before the transition to the open one can run.
  useLayoutEffect(() => {
    if (!shown) return
    leaving.current = false
    setPhase('enter')
    let inside = 0
    const outside = requestAnimationFrame(() => {
      inside = requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      cancelAnimationFrame(outside)
      cancelAnimationFrame(inside)
    }
  }, [shown])
  // The page left some other way while its own way out was on its way: the app's bars are its own again.
  useEffect(() => {
    if (shown || !leaving.current) return
    leaving.current = false
    clearTimeout(timer.current)
    useNav.setState({ leaving: false })
    setPhase('open')
  }, [shown])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      leaving.current = false
      useNav.setState({ leaving: false })
    },
    [],
  )
  /** Out of the full screen: the page shrinks back into the player bar and fades, and only then does the app go back
   * to the page behind it (Back out of the app's history, or Home where there's none behind it). A press while it's
   * on its way out does nothing: the way out is one. */
  const leave = () => {
    if (leaving.current || !shown) return
    leaving.current = true
    setPhase('leave')
    // The app's own bars come back under it as it goes down, so what is behind is there before it is shown again.
    useNav.setState({ leaving: true })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      leaving.current = false
      useNav.setState((nav) => ({ ...leftFullScreen(nav), leaving: false }))
    }, leaveDuration(root.current))
  }
  if (!track) {
    return (
      <div ref={root} className="ne-now-page" data-phase={phase}>
        <div className="ne-now-stage">
          <header className="ne-now-head">
            <button type="button" className="ne-now-back" aria-label={words.back} title={words.back} onClick={leave}>
              <BackGlyph />
            </button>
            <span className="ne-kicker">{words.brand}</span>
            <h2>{words.nowPlaying}</h2>
          </header>
          <div className="ne-now-empty">
            <div className="ne-empty">
              <span className="ne-empty-mark">
                <PlayGlyph />
              </span>
              <h3>{words.nothingPlaying}</h3>
              <p>{words.nothingPlayingHint}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const palette = layers.current.palette
  // Its artists, each with the id their own page opens by (`artistId` is the first, for an answer of the older
  // shape): the full-screen player links every one of them, and Back comes back to it.
  const artists =
    track.artists && track.artists.length > 0
      ? track.artists
      : track.artist
          .split('/')
          .map((name, index) => ({ id: index === 0 ? (track.artistId ?? '') : '', name: name.trim() }))
          .filter((artist) => artist.name)
  // The cover's accent, on WestPlay's own skin; NetEase's red keeps NetEase's own accent on the app's controls.
  const accent =
    palette && style !== 'red'
      ? ({ '--ne-now-accent': palette.accent, '--ne-now-on-accent': palette.onAccent } as CSSProperties)
      : undefined
  const tint = (colours: string[]): CSSProperties =>
    ({
      '--ne-now-a': colours[0],
      '--ne-now-b': colours[1],
      '--ne-now-c': colours[2],
    }) as CSSProperties
  return (
    <div ref={root} className={playing ? 'ne-now-page playing' : 'ne-now-page'} data-phase={phase} style={accent}>
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
          <button type="button" className="ne-now-back" aria-label={words.back} title={words.back} onClick={leave}>
            <BackGlyph />
          </button>
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
            <p className="ne-now-artist">
              {artists.map((artist, index) => (
                <Fragment key={`${artist.id}:${artist.name}:${index}`}>
                  {index > 0 && <span className="ne-now-artist-sep"> / </span>}
                  {/^\d{1,20}$/.test(artist.id) ? (
                    <button
                      type="button"
                      className="ne-now-artist-link"
                      title={`${words.artist} · ${artist.name}`}
                      onClick={() => open({ kind: 'artist', id: artist.id, name: artist.name, cover: track.cover })}
                    >
                      {artist.name}
                    </button>
                  ) : (
                    <span>{artist.name}</span>
                  )}
                </Fragment>
              ))}
            </p>
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
            <div className="ne-now-actions">
              <ModeButton large />
              <LikeButton large />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
