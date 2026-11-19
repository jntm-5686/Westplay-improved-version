import { create } from 'zustand'

/**
 * The app's own settings (UI only: nothing here changes how NetEase's page plays). They're kept in the
 * browser's storage, beside the style, and are read wherever they matter: the app's root sets the motion,
 * every play says its one-line word only if the player left the hints on.
 */

/** How much the app moves: its own page changes, its skeleton's breathing, its toast. */
export type Motion = 'full' | 'calm'

export interface Prefs {
  motion: Motion
  /** Whether a pressed song says over the player that it asked NetEase to play it. */
  playHints: boolean
}

const PREFS_KEY = 'westplay.netease.prefs'

/** What the player chose before, or the app's own defaults (all of it moving, the one-line words on). */
export function keptPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { motion: 'full', playHints: true }
    const said = JSON.parse(raw) as Partial<Prefs> | null
    return {
      motion: said?.motion === 'calm' ? 'calm' : 'full',
      playHints: said?.playHints !== false,
    }
  } catch {
    return { motion: 'full', playHints: true }
  }
}

function keep(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage blocked: kept for this session only.
  }
}

interface PrefStore extends Prefs {
  setMotion(motion: Motion): void
  setPlayHints(on: boolean): void
}

export const usePrefs = create<PrefStore>()((set, get) => ({
  ...keptPrefs(),
  setMotion: (motion) => {
    set({ motion })
    keep({ motion, playHints: get().playHints })
  },
  setPlayHints: (playHints) => {
    set({ playHints })
    keep({ motion: get().motion, playHints })
  },
}))
