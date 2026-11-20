/** The NetEase app's symbols, drawn for WestPlay on a 24-unit grid (filled or round-capped strokes), a little
 * heavier for the truck's screen. */

/** The brand: NetEase's red disc with its note. */
export function LogoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M15.6 6.2v8.1a2.6 2.6 0 1 1-1.9-2.5V8.3l-4.9 1.2v6a2.6 2.6 0 1 1-1.9-2.5V7.4z"
        fill="var(--ne-brand-mark, #fff)"
      />
    </svg>
  )
}

export function HomeGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {on ? (
        <path d="M12 2.8 2.8 10.2v11h6.4v-6.4h5.6v6.4h6.4v-11z" fill="currentColor" />
      ) : (
        <path
          d="M12 4 4 10.4v9.6h4.8v-6.4h6.4v6.4H20v-9.6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** My Music: a shelf of records. */
export function LibraryGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9.4" cy="12" r="6.6" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
      {!on && <circle cx="9.4" cy="12" r="1.7" fill="currentColor" />}
      <path d="M18.5 3.4v13.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18.5 3.4 21.5 2.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.6" cy="10.6" r="7" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <path d="m15.8 15.8 5.3 5.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Now Playing: a note in a circle, filled while its page shows. */
export function NowGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="2" opacity={on ? 0 : 1} />
      {on && <circle cx="12" cy="12" r="10" fill="currentColor" />}
      <path
        d="M14.6 6.8v7.6a2.3 2.3 0 1 1-1.7-2.2V8.7l-3.9 1v5.9a2.3 2.3 0 1 1-1.7-2.2V7.7z"
        fill={on ? 'var(--ne-brand-mark, #fff)' : 'currentColor'}
      />
    </svg>
  )
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.4 4.6v14.8a1 1 0 0 0 1.5.86l12.3-7.5a1 1 0 0 0 0-1.72L8.9 3.74a1 1 0 0 0-1.5.86z"
        fill="currentColor"
      />
    </svg>
  )
}

export function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.6" y="3.6" width="4.5" height="16.8" rx="1.3" fill="currentColor" />
      <rect x="13.9" y="3.6" width="4.5" height="16.8" rx="1.3" fill="currentColor" />
    </svg>
  )
}

export function NextGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.6 4.8v14.4a.9.9 0 0 0 1.4.76l10.7-7.2a.9.9 0 0 0 0-1.52L6 4.04a.9.9 0 0 0-1.4.76z"
        fill="currentColor"
      />
      <rect x="17.4" y="3.8" width="2.8" height="16.4" rx="1.3" fill="currentColor" />
    </svg>
  )
}

export function PreviousGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ scale: '-1 1' }}>
      <path
        d="M4.6 4.8v14.4a.9.9 0 0 0 1.4.76l10.7-7.2a.9.9 0 0 0 0-1.52L6 4.04a.9.9 0 0 0-1.4.76z"
        fill="currentColor"
      />
      <rect x="17.4" y="3.8" width="2.8" height="16.4" rx="1.3" fill="currentColor" />
    </svg>
  )
}

/** The player's volume: the waves as many as it's loud; none, a cross. */
export function VolumeGlyph({ volume }: { volume: number }) {
  const waves = volume === 0 ? 0 : volume < 0.34 ? 1 : volume < 0.67 ? 2 : 3
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9.2h3.6L11.6 5v14L6.6 14.8H3z" fill="currentColor" strokeLinejoin="round" />
      {waves === 0 && (
        <path d="m15.4 9.6 4.8 4.8m0-4.8-4.8 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
      {waves >= 1 && (
        <path
          d="M14.4 9.6a3.4 3.4 0 0 1 0 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 2 && (
        <path
          d="M16.8 7.3a6.6 6.6 0 0 1 0 9.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 3 && (
        <path d="M19.2 5a9.8 9.8 0 0 1 0 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

/** Home's Refresh: a circular arrow. */
export function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.4-5.7M20 3.6V8h-4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** My Music's way into the recent songs: a clock, hands and all. */
export function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <path d="M12 6.6V12l3.8 2.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** The heart: filled (red) when the playing song is in the account's 我喜欢的音乐, an outline when it isn't. */
export function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.7 4.2 13a5.5 5.5 0 0 1 0-7.8 5.6 5.6 0 0 1 7.8 0 5.6 5.6 0 0 1 7.8 0 5.5 5.5 0 0 1 0 7.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 私人漫游's own (NetEase's phone app has it): a signal broadcast — a dot in its waves. */
export function RadioGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
      <path
        d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4.2 4.2a11 11 0 0 0 0 15.6M19.8 19.8a11 11 0 0 0 0-15.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 4.6 7.6 12l7.4 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The account: a person, without a picture of anyone. */
export function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.7" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.2 20.6c.6-4.2 3.8-6.8 7.8-6.8s7.2 2.6 7.8 6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 榜单: the bars of a chart, rising. Filled while its tab shows. */
export function ChartsGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.2" y="13.4" width="4.4" height="7.4" rx="1.2" fill="currentColor" opacity={on ? 1 : 0.55} />
      <rect x="9.8" y="8.4" width="4.4" height="12.4" rx="1.2" fill="currentColor" opacity={on ? 1 : 0.75} />
      <rect x="16.4" y="3.2" width="4.4" height="17.6" rx="1.2" fill="currentColor" />
      {!on && <path d="M2 21.2h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />}
    </svg>
  )
}

/** The settings' gear: a cog with its hole (filled, as the rail's and the page's entries draw it). */
export function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.6 2h2.8l.4 2.2c.7.2 1.4.5 2 .9l1.9-1.2 2 2-1.2 1.9c.4.6.7 1.3.9 2l2.2.4v2.8l-2.2.4c-.2.7-.5 1.4-.9 2l1.2 1.9-2 2-1.9-1.2c-.6.4-1.3.7-2 .9l-.4 2.2h-2.8l-.4-2.2c-.7-.2-1.4-.5-2-.9l-1.9 1.2-2-2 1.2-1.9c-.4-.6-.7-1.3-.9-2l-2.2-.4v-2.8l2.2-.4c.2-.7.5-1.4.9-2L4.3 5.5l2-2 1.9 1.2c.6-.4 1.3-.7 2-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"
        fill="currentColor"
      />
    </svg>
  )
}

/** A way in to another page: the chevron at the page's end. */
export function ChevronGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m9 4.6 7.4 7.4L9 19.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The day's card: a record, its grooves and its label (drawn where there's no picture of it). */
export function DiscGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  )
}

/** A song with no cover drawn: a note. */
export function NoteGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.6 4.4v10.2a3.4 3.4 0 1 1-2.2-3.2V7.4L8 8.6v7.8a3.4 3.4 0 1 1-2.2-3.2V6.4z" fill="currentColor" />
    </svg>
  )
}

/** NetEase's rights don't let a song play: a disc with a slash. */
export function UnplayableGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m6.2 17.8 11.6-11.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Playing: the four bars a list marks its song with, moving while it plays. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'ne-eq playing' : 'ne-eq'} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** The play mode's own mark, as the player bar's button shows it: the list round and round (`list`), its arrows
 * crossed (`shuffle`), the same arrows with the one song's own mark (`one`). */
export function ModeGlyph({ mode }: { mode: 'list' | 'shuffle' | 'one' }) {
  if (mode === 'shuffle') {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h3.2c1.2 0 2.2.6 2.9 1.6l5 7.2c.7 1 1.7 1.6 2.9 1.6H21" />
        <path d="M3 17.4h3.2c1.2 0 2.2-.6 2.9-1.6l1.3-1.9" />
        <path d="M13.6 8.1l1.5-2.1c.7-1 1.7-1.6 2.9-1.6H21" />
        <path d="M18.6 2.6 21 5l-2.4 2.4" />
        <path d="M18.6 14.9 21 17.3l-2.4 2.4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.4 4.5h11.2A3.4 3.4 0 0 1 21 7.9v8.2a3.4 3.4 0 0 1-3.4 3.4H6.4A3.4 3.4 0 0 1 3 16.1V7.9a3.4 3.4 0 0 1 3.4-3.4Z" />
      <path d="M8.6 10.4 10.6 8.4l2 2-2 2" />
      <path d="M15.4 13.6l-2 2-2-2 2-2" />
      {mode === 'one' ? (
        <text x="12" y="13.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">1</text>
      ) : null}
    </svg>
  )
}

/** A chevron pointing down: the full-screen player's own way back down into the player bar (its button at the page's
 * top left shows it; the page slides down as it is pressed). */
export function ChevronDownGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9.5 12 16.5 19 9.5" />
    </svg>
  )
}
