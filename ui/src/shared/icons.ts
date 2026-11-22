/**
 * App icons by role. The UI only ever asks for a role (and a look, light or dark), so replacing the icon set
 * means changing this file.
 *
 * WestPlay's own icons (public/icons/westplay), each in a light and a dark look: drawn in the logo's style, and
 * for the music services their companies' own marks, from their official files (on their own background in the
 * light look, on WestPlay's dark card in the dark look).
 */
export type AppIconRole =
  | 'maps'
  | 'music'
  | 'spotify'
  | 'netease'
  | 'bilibili'
  | 'podcasts'
  | 'messages'
  | 'phone'
  | 'calendar'
  | 'settings'
  | 'weather'
  | 'youtube'
  | 'youtubeMusic'
  | 'player'
  | 'safari'

/** Each role's files' name. */
const FILES: Record<AppIconRole, string> = {
  maps: 'maps',
  music: 'music',
  spotify: 'spotify',
  netease: 'netease',
  bilibili: 'bilibili',
  podcasts: 'podcasts',
  messages: 'messages',
  phone: 'phone',
  calendar: 'calendar',
  settings: 'settings',
  weather: 'weather',
  youtube: 'youtube',
  youtubeMusic: 'youtube-music',
  player: 'player',
  safari: 'safari',
}

/**
 * The roles drawn in liquid glass (Icons8's own icons, free licence: see THIRD_PARTY_NOTICES.md): one picture each,
 * the same on both looks. The roles not here are WestPlay's own, light and dark.
 */
const GLASS: Partial<Record<AppIconRole, string>> = {
  maps: 'glass-maps.png',
  music: 'glass-music.png',
  phone: 'glass-phone.png',
  messages: 'glass-messages.png',
  calendar: 'glass-calendar.png',
  weather: 'glass-weather.png',
  settings: 'glass-settings.png',
  spotify: 'glass-spotify.png',
  netease: 'glass-netease.png',
  bilibili: 'glass-bilibili.png',
  youtube: 'glass-youtube.png',
  youtubeMusic: 'glass-youtubeMusic.png',
  player: 'glass-player.png',
  podcasts: 'glass-podcasts.png',
  safari: 'glass-safari.png',
}

/** The icons' theme: WestPlay's own drawings, or the liquid glass set. */
export type IconTheme = 'original' | 'glass'

/** WestPlay's own icon for `role`, in `theme`, for a light or a dark screen. */
export function appIcon(role: AppIconRole, look: 'light' | 'dark' = 'light', theme: IconTheme = 'original'): string {
  const glass = theme === 'glass' ? GLASS[role] : undefined
  if (glass) return `/icons/westplay/${glass}`
  return `/icons/westplay/${FILES[role]}.${look}.svg`
}
