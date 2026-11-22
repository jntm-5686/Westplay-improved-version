import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { bilibili, nextBilibili, seekTo, setVolume, useBilibili } from './bilibili'

/**
 * Bilibili as one of the cab's players (apps/musicWithGame.ts): so the media keybinds drive it, the newest to start
 * pauses the others (apps/oneAtATime.ts), and it pauses with the game's menu and plays on after, as they do. Kept
 * apart from the app's module (which the Dashboard's source reads) so that module stays free of the cab's game state.
 */
export const bilibiliPlayer: MusicPlayer = {
  name: 'bilibili',
  playingHere: () => useBilibili.getState().playing && useBilibili.getState().now !== null,
  pauseHere: () => bilibili({ action: 'pause' }),
  // Its own buttons' play: Bilibili's page plays on from where it paused.
  resumeHere: () => bilibili({ action: 'resume' }),
  volume: () => useBilibili.getState().volume,
  sendVolume: (share) => bilibili({ action: 'volume', value: Math.max(0, Math.min(1, share)) }),
  setVolume: (share) => setVolume(share),
  // Its Now Playing's next, or back to this video's start (as a music player's Back).
  skip: (direction) => {
    if (direction === 1) nextBilibili()
    else if (useBilibili.getState().now) seekTo(0)
  },
  subscribe: (changed) =>
    useBilibili.subscribe((now, before) => {
      if (now.playing && !before.playing) changed(true)
    }),
}

/** Bilibili with the game: the video pauses while the player is away from it, and plays on after. */
export function pauseBilibiliWithGame(): () => void {
  return pauseMusicWithGame(bilibiliPlayer)
}
