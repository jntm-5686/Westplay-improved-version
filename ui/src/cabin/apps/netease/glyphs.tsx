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
