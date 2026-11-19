import { useRef } from 'react'
import { Cover, Slider, clock } from './parts'
import { NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph, UnplayableGlyph, VolumeGlyph } from './glyphs'
import { openTab, playPause, positionOf, seek, setVolume, skip, useNetease, useNow } from './netease'
import { useNeteaseWords } from './strings'

/** The NetEase app's player: the bar at the screen's foot (always there), and its Now Playing page. */

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

/** The controls: Previous, Play or Pause (big, in the accent), Next. */
function Controls({ playing, disabled = false }: { playing: boolean; disabled?: boolean }) {
  const words = useNeteaseWords()
  return (
    <div className="ne-controls">
      <button
        type="button"
        className="ne-control"
        aria-label={words.previous}
        disabled={disabled}
        onClick={() => skip(-1)}
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
      <button type="button" className="ne-control" aria-label={words.next} disabled={disabled} onClick={() => skip(1)}>
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
  const now = useNow(playing)
  const position = positionOf(track, playing, trackAt, now)
  return (
    <footer className="ne-player" aria-label={words.nowPlaying}>
      <button type="button" className="ne-player-song" onClick={() => openTab('now')} aria-label={words.nowPlaying}>
        <Cover name={track?.album || track?.title || '♪'} cover={track?.cover ?? null} className="ne-player-cover" />
        <span className="ne-player-text">
          <span className="ne-player-name">{track?.title ?? words.nothingPlaying}</span>
          <span className="ne-player-artist">{track?.artist ?? words.nothingPlayingHint}</span>
        </span>
      </button>
      <Controls playing={playing} disabled={!track} />
      <Progress position={position} duration={track?.duration ?? 0} />
      <VolumeControl volume={volume} />
    </footer>
  )
}

/** Now Playing: the song large, its time, the controls and the volume, as NetEase's desktop player has it. */
export function NowPlayingPage() {
  const words = useNeteaseWords()
  const track = useNetease((state) => state.track)
  const playing = useNetease((state) => state.playing)
  const volume = useNetease((state) => state.volume)
  const trackAt = useNetease((state) => state.trackAt)
  const now = useNow(playing)
  const position = positionOf(track, playing, trackAt, now)
  if (!track) {
    return (
      <div className="ne-scroll ne-now-page">
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
  return (
    <div className="ne-scroll ne-now-page">
      <header className="ne-now-head">
        <span className="ne-now-kicker">{words.brand}</span>
        <h2>{words.nowPlaying}</h2>
      </header>
      <div className="ne-now-body">
        <Cover name={track.album || track.title} cover={track.cover} className="ne-now-cover" />
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
          <Progress position={position} duration={track.duration} />
          <Controls playing={playing} />
          <VolumeControl volume={volume} />
        </div>
      </div>
    </div>
  )
}
