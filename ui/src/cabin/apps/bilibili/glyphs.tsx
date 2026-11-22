/**
 * The Bilibili app's symbols, drawn for WestPlay on a 24-unit grid (filled or round-capped strokes), a little heavier
 * for the truck's screen. The little TV is Bilibili's own mark, drawn here: a rounded screen with two antennae and two
 * eyes, in the app's pink.
 */

/** The brand: Bilibili's little TV, on the app's pink. */
export function TvGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.2 2.1 12 5.2l3.8-3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2.2" y="5" width="19.6" height="15" rx="4.4" fill="currentColor" />
      <rect x="6.1" y="9.4" width="2.7" height="5.2" rx="1.35" fill="var(--bb-tv-eye, #fff)" />
      <rect x="15.2" y="9.4" width="2.7" height="5.2" rx="1.35" fill="var(--bb-tv-eye, #fff)" />
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

/** 番剧: a little TV with a play mark in it. */
export function BangumiGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.6 2.6 12 5.8l4.4-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="2.4"
        y="5.4"
        width="19.2"
        height="15.2"
        rx="4"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M10 9.4v7.2l5.8-3.6z" fill={on ? 'var(--bb-rail-mark, #fff)' : 'currentColor'} />
    </svg>
  )
}

/** 影视: a film reel / clapper. */
export function CinemaGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2.6"
        y="5.2"
        width="18.8"
        height="13.6"
        rx="3"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
      />
      {[5.6, 9.105, 12.61, 16.115].map((x) => (
        <rect
          key={x}
          x={x}
          y="8"
          width="2.3"
          height="2.3"
          rx="0.7"
          fill={on ? 'var(--bb-rail-mark, #fff)' : 'currentColor'}
        />
      ))}
      {[5.6, 9.105, 12.61, 16.115].map((x) => (
        <rect
          key={`b${x}`}
          x={x}
          y="13.7"
          width="2.3"
          height="2.3"
          rx="0.7"
          fill={on ? 'var(--bb-rail-mark, #fff)' : 'currentColor'}
        />
      ))}
    </svg>
  )
}

/** 直播: a broadcast mark. */
export function LiveGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {on ? (
        <circle cx="12" cy="12.6" r="3.4" fill="currentColor" />
      ) : (
        <circle cx="12" cy="12.6" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      )}
      <path
        d="M5.2 5.6a9.4 9.4 0 0 0 0 14M18.8 5.6a9.4 9.4 0 0 1 0 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M8.3 8.5a5.6 5.6 0 0 0 0 8.2M15.7 8.5a5.6 5.6 0 0 1 0 8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 我的: a person. */
export function PersonGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {on ? (
        <>
          <circle cx="12" cy="7.6" r="4.4" fill="currentColor" />
          <path d="M3.6 21c.7-4.4 4.1-7 8.4-7s7.7 2.6 8.4 7z" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7.6" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M4.6 20.4c.6-4 3.9-6.6 7.4-6.6s6.8 2.6 7.4 6.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
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

export function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.6 4.8 7.4 12l7.2 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronRightGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m9.4 4.8 7.2 7.2-7.2 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronDownGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m4.8 9.4 7.2 7.2 7.2-7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 4.6v14.8L20 12z" fill="currentColor" />
    </svg>
  )
}

export function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="4.4" width="4.4" height="15.2" rx="1.5" fill="currentColor" />
      <rect x="13.6" y="4.4" width="4.4" height="15.2" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function LikeGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.2 21V10.1l4.6-7.1c1.8.4 2.7 1.7 2.4 3.6l-.6 3.1h5.1c1.5 0 2.5 1.2 2.2 2.6l-1.4 6.4c-.2 1.2-1.3 2.3-2.8 2.3z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="2.4" y="10.2" width="3.2" height="10.8" rx="1.1" fill="currentColor" />
    </svg>
  )
}

/** 硬币: Bilibili's coin, a disc with its mark. */
export function CoinGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <path
        d="M8.4 7.8h7.2M8.4 11.4h7.2M9.8 7.8v5.6c0 1.7 1 2.8 2.6 2.8s2.6-1.1 2.6-2.8V7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="m11 16.4.9 2.2h2.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

/** 收藏: a star (Bilibili's own 收藏 mark is a star). */
export function StarGlyph({ on = false }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 2.9 2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-1z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 历史记录: a clock turning back. */
export function HistoryGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.4 5.2V9h3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.7 9a8.4 8.4 0 1 1-1.1 5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M12 7.4V12l3.4 2.1" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

/** 关注动态: a bell. */
export function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8c3.6 0 6.1 2.6 6.1 6.2v3.5l1.7 3.1c.4.8-.1 1.8-1 1.8H5.2c-.9 0-1.4-1-1-1.8l1.7-3.1V9c0-3.6 2.5-6.2 6.1-6.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9.7 20.2a2.5 2.5 0 0 0 4.6 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** 我的主页: a TV with a person on it. */
export function SpaceGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.4" y="4.4" width="19.2" height="15.2" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10.4" r="2.4" fill="currentColor" />
      <path d="M7.6 16.8c.5-2.1 2.2-3.4 4.4-3.4s3.9 1.3 4.4 3.4z" fill="currentColor" />
    </svg>
  )
}

export function VolumeGlyph({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 9.2h3.8L12.4 5v14l-5.2-4.2H3.4z" fill="currentColor" />
      {muted ? (
        <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <path
            d="M15.4 8.9a4.4 4.4 0 0 1 0 6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M18.3 6.4a8.2 8.2 0 0 1 0 11.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

/** 选集: a list. */
export function ListGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {[6.4, 12, 17.6].map((y) => (
        <g key={y}>
          <circle cx="4.4" cy={y} r="1.5" fill="currentColor" />
          <rect x="8" y={y - 1.3} width="12.6" height="2.6" rx="1.3" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

/** 画质: a screen. */
export function ScreenGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.6" y="4.4" width="18.8" height="12.8" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.4 20.6h7.2M12 17.2v3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** 倍速: a double chevron. */
export function SpeedGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 5.6 11 12l-7.6 6.4z" fill="currentColor" />
      <path d="M12.4 5.6 20 12l-7.6 6.4z" fill="currentColor" />
    </svg>
  )
}

export function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m4.6 12.6 4.6 4.6 10.2-10.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The screen expanded to the whole panel (the player's own full screen, where it isn't already). */
export function FullscreenGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Back from the whole panel to the player's own shape. */
export function ExitFullscreenGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 设置: a gear. */
export function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
