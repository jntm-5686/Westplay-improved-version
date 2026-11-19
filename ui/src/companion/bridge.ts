import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * The companion's line to the app (Tauri's commands and events). In the app it's Tauri's; opened in a plain
 * browser, to develop its pages, it's the preview's (preview.ts): sample answers and a status that ticks, so
 * every page can be seen without the app or the game.
 */
export const IN_APP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type Preview = typeof import('./preview')
let preview: Promise<Preview> | null = null
const loadPreview = () => (preview ??= import('./preview'))

/** Runs one of the app's commands. */
export function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (IN_APP) return invoke<T>(command, args)
  return loadPreview().then((p) => p.answer(command, args) as Promise<T>)
}

/** Whether the companion's window is the one in front: Windows' word in the app, the browser's in the preview. */
export function windowInFront(): Promise<boolean> {
  return IN_APP ? invoke<boolean>('window_in_front') : Promise.resolve(document.hasFocus())
}

/** Listens to one of the app's events; returns how to stop. */
export function on<T>(event: string, handler: (payload: T) => void): () => void {
  if (IN_APP) {
    const unlisten = listen<T>(event, (message) => handler(message.payload))
    return () => {
      unlisten.then((stop) => stop())
    }
  }
  let stop: (() => void) | null = null
  let stopped = false
  loadPreview().then((p) => {
    if (!stopped) stop = p.subscribe(event, handler as (payload: unknown) => void)
  })
  return () => {
    stopped = true
    stop?.()
  }
}

/** WestPlay's version: the app's own; in the preview, the workspace's (vite.config.ts). */
/**
 * This build's edition, shown after the version number, so every place the version is shown says which build it
 * is (owner 2026-11-18: "2.4.1 后面加上 r8 by estella 往后都这样"). Bumped with each release.
 */
const EDITION = 'by estella'

/** WestPlay's version as every screen shows it: its number, then the edition's. */
export function appVersion(): Promise<string> {
  const shown = (version: string) => (version ? `${version} ${EDITION}` : version)
  if (IN_APP) return import('@tauri-apps/api/app').then((app) => app.getVersion()).then(shown)
  return Promise.resolve(shown(__WESTPLAY_VERSION__))
}

/** In the preview only: `?tutorial` (or `?tutorial=launch`) opens the tutorial, as the onboarding's end does. */
export const PREVIEW_TUTORIAL: 'lesson' | 'launch' | null = IN_APP
  ? null
  : (() => {
      const value = new URLSearchParams(location.search).get('tutorial')
      return value === null ? null : value === 'launch' ? 'launch' : 'lesson'
    })()
