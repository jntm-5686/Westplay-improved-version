import { describe, expect, it } from 'vitest'
import { type AppIconRole, appIcon } from './icons'

// The icon files there are (public/icons/westplay), as Vite sees them: WestPlay's own drawings, and the liquid
// glass pictures that stand for some roles now.
const PICTURES = Object.keys(import.meta.glob('../../public/icons/westplay/*.{svg,png}')).map((path) =>
  path.replace('../../public', ''),
)

const ROLES: AppIconRole[] = [
  'maps',
  'music',
  'spotify',
  'netease',
  'bilibili',
  'podcasts',
  'messages',
  'phone',
  'calendar',
  'settings',
  'weather',
  'youtube',
  'youtubeMusic',
  'player',
  'safari',
]

describe('appIcon', () => {
  it('gives every role an icon, and each file is there', () => {
    for (const role of ROLES) {
      for (const look of ['light', 'dark'] as const) {
        expect(PICTURES, `${role} (${look})`).toContain(appIcon(role, look))
      }
    }
    // The roles still drawn by WestPlay: light and dark, as they were.
    expect(appIcon('youtubeMusic', 'dark')).toBe('/icons/westplay/youtube-music.dark.svg')
    // The liquid glass theme: its picture, the same on both looks, for the roles it covers.
    expect(appIcon('phone', 'light', 'glass')).toBe('/icons/westplay/glass-phone.png')
    expect(appIcon('phone', 'dark', 'glass')).toBe(appIcon('phone', 'light', 'glass'))
    // Bilibili's own little TV: light and dark, and its glass picture.
    expect(appIcon('bilibili', 'light')).toBe('/icons/westplay/bilibili.light.svg')
    expect(appIcon('bilibili', 'dark')).toBe('/icons/westplay/bilibili.dark.svg')
    expect(appIcon('bilibili', 'dark', 'glass')).toBe('/icons/westplay/glass-bilibili.png')
    // Every role has its glass picture now, Podcasts' included.
    expect(appIcon('podcasts', 'dark', 'glass')).toBe('/icons/westplay/glass-podcasts.png')
  })
})
