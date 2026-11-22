import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  addCoin,
  bilibili,
  clearPlayerHole,
  closePlayerPage,
  hidePicture,
  playEpisodeFrom,
  putPlayerHole,
  recordTimeline,
  requestSpace,
  setPicture,
  setPlayerCovers,
  setPlayerMenu,
  setRate,
  setVolume,
  settlePlayerPage,
  seekTo,
  startPlayerExit,
  toggleFavorite,
  toggleLike,
  togglePlay,
  useBilibili,
  usePlayhead,
  type BilibiliCovers,
  type BilibiliUp,
} from './bilibili'
import { rectInArea } from '../safari/hole'
import {
  CheckGlyph,
  ChevronDownGlyph,
  ChevronRightGlyph,
  CoinGlyph,
  ExitFullscreenGlyph,
  FullscreenGlyph,
  LikeGlyph,
  ListGlyph,
  PauseGlyph,
  PlayGlyph,
  SpeedGlyph,
  StarGlyph,
  VolumeGlyph,
} from './glyphs'
import { openPage } from './nav'
import { Avatar, Cover, EpisodeBody, Slider } from './parts'
import { coverTint } from './cover'
import { useBilibiliWords } from './strings'
import { formatClock, progressShare } from './time'

/** The speeds the player offers, fastest first (its 倍速 menu). */
const RATES = [2, 1.5, 1.25, 1, 0.75, 0.5]

/** How long after the sheet's way in the host's picture comes (its motion done; the cover until then), ms. Matches
 * bilibili.css's `--bb-player-in`. */
const PICTURE_DELAY_MS = 660

/** How close two clicks are one double click (the full screen's pause/play), ms. */
const DOUBLE_CLICK_MS = 250

/** How often the picture's rectangle is told to the host while it shows, and how little may change, ms / px. */
const RECONCILE_EVERY_MS = 90
const RECONCILE_BY_PX = 1

/** How a rate reads: "1.0×", "1.5×", "2×". */
function rateLabel(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : rate}×`
}

/**
 * The app's player. Its picture (the host's WebView through the page's cut, or the cover until it shows) keeps the
 * video's own shape (`state.aspect`): a portrait video stands up in the panel's middle, whole — never stretched nor
 * cropped, full screen included.
 *
 * Its two states: the ordinary one, the picture with its title and UP主 under it; and its own full screen, the picture
 * at the panel's edges with no other chrome. In both, a press on the picture brings the controls over it (progress,
 * play/pause, volume, 倍速, the three marks, full screen); a second press plays or pauses and puts them away.
 */
export function PlayerPage() {
  const words = useBilibiliWords()
  const stage = useBilibili((state) => state.stage)
  const now = useBilibili((state) => state.now)
  const playing = useBilibili((state) => state.playing)
  const duration = useBilibili((state) => state.duration)
  const volume = useBilibili((state) => state.volume)
  const aspect = useBilibili((state) => state.aspect)
  const rate = useBilibili((state) => state.rate)
  const liked = useBilibili((state) => state.liked)
  const coins = useBilibili((state) => state.coins)
  const favorited = useBilibili((state) => state.favorited)
  const acting = useBilibili((state) => state.acting)
  const menu = useBilibili((state) => state.playerMenu)
  const seasonId = now?.seasonId
  const season = useBilibili((state) =>
    seasonId
      ? (state.seasonDetails[seasonId] ??
        state.anime?.find((one) => one.seasonId === seasonId) ??
        state.cinema?.find((one) => one.seasonId === seasonId) ??
        null)
      : null,
  )
  const storedEpisodes = useBilibili((state) => state.episodes)
  const episodes = season?.episodes && season.episodes.length > 0 ? season.episodes : storedEpisodes
  const picture = useBilibili((state) => state.picture)
  const pictureShown = useBilibili((state) => state.pictureShown)
  const progress = useBilibili((state) => state.progress)
  const progressAt = useBilibili((state) => state.progressAt)
  const screen = useRef<HTMLDivElement>(null)
  const controlsBox = useRef<HTMLDivElement>(null)
  const menuBox = useRef<HTMLDivElement>(null)
  const reconcile = useRef<(force?: boolean) => void>(() => {})
  // The cut waits for the host's `showing` and then for its picture really moving: two state reports of it playing with
  // its clock running, at least 250 ms apart, and 450 ms after `showing`. Before that the cover stands in.
  const shownAt = useRef(0)
  const lastFramedAt = useRef(0)
  const framed = useRef(0)
  // One resume asked for as the page opens onto a paused page (the host's autoplay not caught yet): never again after
  // it has played once here, so a pause of the user's isn't undone.
  const resumeTried = useRef(false)
  const openedAt = useRef(0)
  const userPaused = useRef(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaving = useRef(false)
  // The page's way out begun: the rectangle loop stops telling the host `show` at once (no cut after the cover is in).
  const stopping = useRef(false)
  const position = usePlayhead()
  // The video in the whole panel (its own full screen); its controls layer is always there in the ordinary state and
  // hidden in the full screen until the picture is pressed.
  const [full, setFull] = useState(false)
  const [controls, setControls] = useState(false)
  const [seeking, setSeeking] = useState<number | null>(null)
  const live = now?.live === true
  const share = progressShare(seeking ?? position, duration)
  const controlsShown = !full || controls

  // A press on the picture. The ordinary state's controls are always out: a press plays or pauses. The full screen's
  // are the user's to toggle: one press (250 ms without a second) shows or puts them away; two presses pause or play,
  // and the controls stay as they were.
  const togglePlayHere = () => {
    const playingNow = useBilibili.getState().playing
    if (playingNow) userPaused.current = true
    togglePlay()
  }
  const pressPicture = () => {
    if (menu) {
      setPlayerMenu(null)
      return
    }
    if (!full) {
      togglePlayHere()
      return
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = undefined
      togglePlayHere()
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = undefined
      setControls((shown) => !shown)
    }, DOUBLE_CLICK_MS)
  }

  useEffect(() => () => clearTimeout(clickTimer.current), [])

  // The picture's cut: the controls and a menu over it are covers of the mask (their rectangle is closed in the page
  // cut, so they show over the video and take the press themselves).
  useEffect(() => {
    if (!picture) {
      setPlayerCovers({})
      return
    }
    const frame = requestAnimationFrame(() => {
      const covers: BilibiliCovers = {}
      const controlsRect = controlsShown && controlsBox.current ? rectInArea(controlsBox.current) : null
      if (controlsRect) covers.controls = controlsRect
      const menuRect = menu && menuBox.current ? rectInArea(menuBox.current.firstElementChild ?? menuBox.current) : null
      if (menuRect) covers.menu = menuRect
      setPlayerCovers(covers)
    })
    return () => cancelAnimationFrame(frame)
  }, [picture, controlsShown, menu])

  // The cut opens only when the host has said its picture is showing AND its video is really moving: two state reports
  // of `playing:true` with its clock running, at least 250 ms apart, and no sooner than 450 ms after `showing`. Before
  // that — and whenever it says `showing:false`, or another video/episode starts — the cover and the app's own ground
  // stand in (owner 2026-11-21: "洞已开但视频还没画出来" was a flash of black).
  const nowId = now?.id ?? null
  useEffect(() => {
    const allowed = stage === 'open' && nowId !== null && pictureShown
    if (!allowed) {
      shownAt.current = 0
      lastFramedAt.current = 0
      framed.current = 0
      setPicture(false)
      clearPlayerHole('showing off')
      return
    }
    // Already open on this showing: a pause or a further state report keeps its frame, never closes it.
    if (useBilibili.getState().picture) return
    if (shownAt.current === 0) shownAt.current = performance.now()
    // Only the state reports that came after `showing` count (its own `progressAt` is the report's arrival).
    if (progressAt <= shownAt.current) return
    if (playing && progress > 0) {
      if (lastFramedAt.current === 0 || progressAt - lastFramedAt.current >= 250) {
        framed.current += 1
        lastFramedAt.current = progressAt
      }
    } else {
      framed.current = 0
      lastFramedAt.current = 0
    }
    if (framed.current < 2) {
      setPicture(false)
      clearPlayerHole('waiting for frames')
      return
    }
    const open = () => {
      setPicture(true)
      const element = screen.current
      const hole = element ? rectInArea(element) : null
      if (hole) putPlayerHole(hole)
      reconcile.current(true)
      recordTimeline('picture ready', {
        afterShowing: Math.round(performance.now() - shownAt.current),
        frames: framed.current,
      })
    }
    const wait = Math.max(0, 450 - (performance.now() - shownAt.current))
    if (wait > 0) {
      const timer = setTimeout(open, wait)
      return () => clearTimeout(timer)
    }
    open()
  }, [stage, nowId, pictureShown, playing, progress, progressAt])

  // Its page came up on a paused video (Bilibili's page not self-starting): ask once for it to play, so opening the
  // player is enough (owner 2026-11-21). Only at its way in (a few seconds), never after its own pause of the user's.
  useEffect(() => {
    if (stage === 'open') openedAt.current = performance.now()
  }, [stage])
  useEffect(() => {
    if (stage !== 'open' || !nowId) return
    if (playing || resumeTried.current || userPaused.current) return
    if (openedAt.current > 0 && performance.now() - openedAt.current > 3_000) return
    resumeTried.current = true
    bilibili({ action: 'resume' })
  }, [stage, nowId, playing])

  // The host's picture at the screen: its rectangle told again every frame it moves (the page's way in and out, its
  // own full screen, the title or controls changing its size) and whenever it changes more than a pixel — never the
  // left-top corner a rect told before a reflow (owner 2026-11-21: "画面卡到左上角"). The `show` is not the cut: the
  // cut opens only on the host's `showing: true` (the effect above).
  useEffect(() => {
    if (stage !== 'open' || !nowId) {
      clearPlayerHole('stage or video change')
      return
    }
    let frame = 0
    let stopped = false
    let started = false
    let resized: ResizeObserver | null = null
    let last: { x: number; y: number; width: number; height: number } | null = null
    let sentAt = 0
    const place = (force = false) => {
      if (stopped || !started || stopping.current) return
      const element = screen.current
      const box = element?.getBoundingClientRect()
      if (!element || !box || box.width < 2 || box.height < 2) return
      const scale = window.devicePixelRatio || 1
      const next = {
        x: Math.round(box.left * scale),
        y: Math.round(box.top * scale),
        width: Math.round(box.width * scale),
        height: Math.round(box.height * scale),
      }
      const changed =
        !last ||
        Math.abs(next.x - last.x) > RECONCILE_BY_PX ||
        Math.abs(next.y - last.y) > RECONCILE_BY_PX ||
        Math.abs(next.width - last.width) > RECONCILE_BY_PX ||
        Math.abs(next.height - last.height) > RECONCILE_BY_PX
      const nowAt = performance.now()
      if (!force && (!changed || nowAt - sentAt < RECONCILE_EVERY_MS)) return
      last = next
      sentAt = nowAt
      bilibili({ action: 'show', ...next, crop: false })
      // The cut is the same rectangle as the picture — only when the host has said the picture is showing.
      if (useBilibili.getState().picture) {
        const hole = rectInArea(element)
        if (hole) putPlayerHole(hole)
      }
    }
    reconcile.current = (force = true) => place(force)
    const begin = () => {
      if (stopped) return
      started = true
      place(true)
      const follow = () => {
        if (stopped) return
        place()
        frame = requestAnimationFrame(follow)
      }
      frame = requestAnimationFrame(follow)
      resized = new ResizeObserver(() => place(true))
      const carplay = document.querySelector('.carplay')
      if (carplay) resized.observe(carplay)
      if (screen.current) resized.observe(screen.current)
      window.addEventListener('resize', onResize)
    }
    const onResize = () => place(true)
    // The sheet's way in settles before the host is told where to show (its picture is not shown under a moving page).
    const timer = setTimeout(begin, PICTURE_DELAY_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      resized?.disconnect()
      window.removeEventListener('resize', onResize)
      reconcile.current = () => {}
      clearPlayerHole('page or video change')
    }
  }, [stage, nowId])

  // A re-layout the observer may not see at once (its own full screen, the picture's shape arriving, the controls
  // layer coming or going): the rectangle told again.
  useEffect(() => {
    reconcile.current(true)
  }, [full, aspect, controlsShown])

  // A last frame's rectangle once the page is open and laid out (the first ones may be of a page still moving).
  useEffect(() => {
    if (stage !== 'open' || !picture) return
    const timers = [80, 220, 520].map((ms) => setTimeout(() => reconcile.current(true), ms))
    return () => timers.forEach(clearTimeout)
  }, [stage, picture])

  // Nothing of the picture is left behind when the page goes (the app's own bars under it: no video over Home). The
  // player's own timeline is printed once, here, for the next flash of black to be read (`window.__bbTimeline`).
  useEffect(
    () => () => {
      clearPlayerHole('unmount')
      bilibili({ action: 'hide' })
      setPicture(false)
      recordTimeline('player unmount')
      if (typeof window !== 'undefined') {
        const timeline = (window as Window & { __bbTimeline?: unknown[] }).__bbTimeline ?? []
        console.debug('[bilibili] player timeline', timeline)
      }
    },
    [],
  )
  // Coming up: the first painted frame is `enter`, and the next one after it opens the page (the transition's start
  // has to be drawn first). A page the browser keeps from painting opens anyway, a moment later.
  useLayoutEffect(() => {
    if (stage !== 'enter') return
    let inside = 0
    const outside = requestAnimationFrame(() => {
      inside = requestAnimationFrame(settlePlayerPage)
    })
    const fallback = setTimeout(settlePlayerPage, 90)
    return () => {
      cancelAnimationFrame(outside)
      cancelAnimationFrame(inside)
      clearTimeout(fallback)
    }
  }, [stage])

  // Out, in three steps, never a black frame between them: (a) the cut closed and the cover in its place (one frame);
  // (b) the host's video told to hide (its `showing: false`); (c) the sheet's way down, once all that has been painted.
  // The page under is the app's own opaque ground, never the game's black.
  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    stopping.current = true
    setControls(false)
    startPlayerExit()
    // The cut closed and the cover painted: two frames later the host's video is told to hide (rather the WebView
    // stays two frames longer than a cut with nothing under it).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hidePicture()
        requestAnimationFrame(() => {
          closePlayerPage()
          leaving.current = false
        })
      })
    })
  }

  const openCreator = (up: BilibiliUp | null) => {
    if (!up?.uid) return
    leave()
    openPage({ kind: 'space', uid: up.uid, name: up.name })
    requestSpace(up.uid)
  }

  const toggleFull = () => {
    setFull((on) => {
      const next = !on
      // The full screen's controls are hidden until the picture is pressed; the ordinary state's are always there.
      setControls(!next)
      return next
    })
  }

  // The sheet's own colours, from the video's cover (the cover's fallback gradient otherwise): never the near-black
  // ground under its way in/out. `data-picture` (the cut open on a really painted video) is the only pure black.
  const [sheetA, sheetB] = coverTint(now?.cover ?? now?.title ?? 'bilibili')
  const sheetStyle = { '--bb-sheet-a': sheetA, '--bb-sheet-b': sheetB } as CSSProperties

  return (
    <div
      className="bb-player"
      data-phase={stage}
      data-sheet={now?.cover ? 'cover' : 'app'}
      data-picture={picture ? '' : undefined}
      data-live={live ? '' : undefined}
      data-fullscreen={full ? '' : undefined}
      data-controls={controlsShown ? '' : undefined}
      style={sheetStyle}
      role="dialog"
      aria-modal="true"
      aria-label={words.player.nowPlaying}
    >
      <div className="bb-player-backdrop" aria-hidden>
        {now?.cover && <Cover cover={now.cover} title={now.title} wide className="bb-player-backdrop-cover" />}
      </div>
      <div className="bb-player-tints" aria-hidden />
      {!now ? (
        <div className="bb-player-nothing">
          <button type="button" className="bb-player-back" aria-label={words.player.collapse} onClick={leave}>
            <ChevronDownGlyph />
          </button>
          <div className="bb-state">
            <b>{words.player.noVideo}</b>
            <p>{words.player.noVideoHint}</p>
          </div>
        </div>
      ) : (
        <>
          {!full && (
            <header className="bb-player-head">
              <button
                type="button"
                className="bb-player-back"
                aria-label={words.player.collapse}
                title={words.player.collapse}
                onClick={leave}
              >
                <ChevronDownGlyph />
              </button>
              <div className="bb-player-brand">
                <b>{words.brand}</b>
                <span>{live ? words.player.live : words.player.nowPlaying}</span>
              </div>
              <div className="bb-player-head-end">
                {live && (
                  <span className="bb-player-live">
                    <i aria-hidden />
                    {words.player.live}
                  </span>
                )}
              </div>
            </header>
          )}

          <div className="bb-player-stage" onClick={pressPicture}>
            <div
              ref={screen}
              className={picture ? 'bb-player-screen shows-picture' : 'bb-player-screen'}
              style={{ '--bb-aspect': aspect } as CSSProperties}
            >
              <Cover cover={now.cover} title={now.title} wide className="bb-player-art" />
              <span className="bb-player-screen-veil" aria-hidden />
              {live && (
                <span className="bb-player-live-tag">
                  <i aria-hidden />
                  {words.player.live}
                </span>
              )}
              {!live && now.views > 0 && <span className="bb-player-screen-views">{words.home.views(now.views)}</span>}
            </div>
          </div>

          {!full && (
            <div className="bb-player-title-row">
              <div className="bb-player-title-text">
                <span className="bb-player-kicker">{live ? words.player.live : words.player.nowPlaying}</span>
                <h2 title={now.title}>{now.title}</h2>
                <p>
                  {now.up?.uid && (
                    <button
                      type="button"
                      className="bb-player-up"
                      onClick={() => openCreator(now.up)}
                      aria-label={`${words.videoDetail.by} ${now.up.name}`}
                    >
                      <Avatar user={now.up} size="small" />
                      <span>{now.up.name}</span>
                      <ChevronRightGlyph />
                    </button>
                  )}
                  {!live && duration > 0 && (
                    <span>{words.player.time(formatClock(position), formatClock(duration))}</span>
                  )}
                  {live && <span>{words.player.liveHint}</span>}
                </p>
              </div>
            </div>
          )}

          <div ref={controlsBox} className="bb-player-controls-layer" aria-hidden={controlsShown ? undefined : true}>
            {full && (
              <button
                type="button"
                className="bb-player-back bb-player-close"
                aria-label={words.player.collapse}
                onClick={leave}
              >
                <ChevronDownGlyph />
              </button>
            )}
            <div className="bb-player-controls">
              <div className="bb-player-progress">
                <span className="bb-player-time">{formatClock(position)}</span>
                <Slider
                  className="bb-player-progress-bar"
                  value={share}
                  label={words.player.progress}
                  valueText={words.player.time(formatClock(position), formatClock(duration))}
                  disabled={live || duration <= 0}
                  onInput={(next) => setSeeking(next)}
                  onCommit={(next) => {
                    setSeeking(null)
                    seekTo(next * duration)
                  }}
                />
                <span className="bb-player-time">{live ? 'LIVE' : formatClock(duration)}</span>
              </div>
              <div className="bb-player-buttons">
                <button
                  type="button"
                  className="bb-player-play"
                  aria-label={playing ? words.player.pause : words.player.play}
                  onClick={(event) => {
                    event.stopPropagation()
                    togglePlayHere()
                  }}
                >
                  {playing ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <VolumeControl
                  volume={volume}
                  label={words.player.volume}
                  mute={words.player.mute}
                  unmute={words.player.unmute}
                />
                <span className="bb-player-gap" />
                <Mark
                  label={liked ? words.player.liked : words.player.like}
                  on={liked}
                  busy={acting === 'like'}
                  onClick={toggleLike}
                  icon={<LikeGlyph on={liked} />}
                />
                <Mark
                  label={coins > 0 ? words.player.coins(coins) : words.player.coin}
                  on={coins > 0}
                  busy={acting === 'coin'}
                  onClick={() => addCoin(1)}
                  icon={<CoinGlyph />}
                />
                <Mark
                  label={favorited ? words.player.favorited : words.player.favorite}
                  on={favorited}
                  busy={acting === 'favorite'}
                  onClick={toggleFavorite}
                  icon={<StarGlyph on={favorited} />}
                />
                {episodes.length > 0 && (
                  <MenuButton
                    label={words.player.episodes}
                    on={menu === 'episodes'}
                    onClick={() => setPlayerMenu(menu === 'episodes' ? null : 'episodes')}
                    icon={<ListGlyph />}
                  >
                    <span className="bb-player-chip-value">{episodes.length}</span>
                  </MenuButton>
                )}
                <MenuButton
                  label={words.player.rate}
                  on={menu === 'rate'}
                  onClick={() => setPlayerMenu(menu === 'rate' ? null : 'rate')}
                  icon={<SpeedGlyph />}
                >
                  <span className="bb-player-chip-value">{rateLabel(rate)}</span>
                </MenuButton>
                <button
                  type="button"
                  className="bb-player-fullscreen"
                  aria-label={full ? words.player.exitFullscreen : words.player.fullscreen}
                  onClick={toggleFull}
                >
                  {full ? <ExitFullscreenGlyph /> : <FullscreenGlyph />}
                  <span>{full ? words.player.exitFullscreen : words.player.fullscreen}</span>
                </button>
              </div>
            </div>

            <div ref={menuBox} className="bb-player-menus">
              {menu === 'episodes' && (
                <PlayerMenu title={words.player.episodes} onClose={() => setPlayerMenu(null)}>
                  <div className="bb-player-episodes">
                    {episodes.map((episode) => (
                      <button
                        key={episode.id}
                        type="button"
                        className={episode.id === now.epId ? 'bb-episode on' : 'bb-episode'}
                        title={`${words.bangumi.episode(episode.index)} · ${episode.title}`}
                        onClick={() => {
                          setPlayerMenu(null)
                          if (now.seasonId) playEpisodeFrom(now.seasonId, episode)
                        }}
                      >
                        <EpisodeBody episode={episode} />
                      </button>
                    ))}
                  </div>
                </PlayerMenu>
              )}
              {menu === 'rate' && (
                <PlayerMenu title={words.player.rate} onClose={() => setPlayerMenu(null)}>
                  <div className="bb-player-choices">
                    {RATES.map((each) => (
                      <Choice key={each} label={rateLabel(each)} on={each === rate} onClick={() => setRate(each)} />
                    ))}
                  </div>
                </PlayerMenu>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** One of the player's three marks: lit when on, still while its receipt is coming. */
function Mark({
  label,
  on,
  busy,
  icon,
  onClick,
}: {
  label: string
  on: boolean
  busy: boolean
  icon: ReactNode
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`bb-mark ${on ? 'on' : ''} ${busy ? 'busy' : ''}`}
      aria-label={label}
      aria-pressed={on}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span className="bb-mark-icon">{icon}</span>
      <span className="bb-mark-label">{label}</span>
    </button>
  )
}

/** The player's volume: its speaker (pressed, it mutes) and its bar. */
function VolumeControl({
  volume,
  label,
  mute,
  unmute,
}: {
  volume: number
  label: string
  mute: string
  unmute: string
}) {
  const remembered = useRef(volume > 0 ? volume : 0.7)
  useEffect(() => {
    if (volume > 0) remembered.current = volume
  }, [volume])
  return (
    <div className="bb-player-volume" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="bb-player-icon"
        aria-label={volume === 0 ? unmute : mute}
        onClick={() => setVolume(volume > 0 ? 0 : remembered.current)}
      >
        <VolumeGlyph muted={volume === 0} />
      </button>
      <Slider className="bb-player-volume-bar" value={volume} label={label} onCommit={(share) => setVolume(share)} />
    </div>
  )
}

/** A control that opens one of the player's menus (选集, 倍速). */
function MenuButton({
  label,
  on,
  icon,
  children,
  onClick,
}: {
  label: string
  on: boolean
  icon: ReactNode
  children?: ReactNode
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={on ? 'bb-player-control on' : 'bb-player-control'}
      aria-label={label}
      aria-expanded={on}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {icon}
      <span className="bb-player-control-label">{label}</span>
      {children}
    </button>
  )
}

/** A menu over the player's controls: its title, the way to put it away, and its choices. */
function PlayerMenu({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const words = useBilibiliWords()
  return (
    <div className="bb-player-menu" role="menu" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="bb-player-menu-head">
        <b>{title}</b>
        <button type="button" className="bb-player-menu-close" aria-label={words.player.menu} onClick={onClose}>
          <ChevronDownGlyph />
        </button>
      </div>
      {children}
    </div>
  )
}

/** One choice of a menu: marked when it's what plays. */
function Choice({ label, on, onClick }: { label: string; on: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className={on ? 'bb-player-choice on' : 'bb-player-choice'}
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
    >
      <span>{label}</span>
      {on && (
        <span className="bb-player-choice-check" aria-hidden>
          <CheckGlyph />
        </span>
      )}
    </button>
  )
}
