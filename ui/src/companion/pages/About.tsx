import { useEffect, useState } from 'react'
import { appVersion } from '../bridge'
import { Button, Group, Panel, Row, Status } from '../room/parts'
import { banner } from '../room/room'
import { GLOW, useScreenAt } from '../room/screen'
import { lookForUpdate } from '../update'
import { GAME_NAMES, type GameInfo } from '../setup'
import { appLogPlace, type HostStatus, type WebviewHealth } from '../useHostStatus'
import { type PageProps, screenState } from './page'

/** How long the screen says the report was copied. */
const COPIED_MS = 3200

/**
 * WestPlay itself: its version and whether there's an update (looked for as the page opens; one found opens
 * its sheet), and the live details of WestPlay and the game for when something isn't
 * right, with a report of them to copy for whoever helps, and where the logs are (app.log in WestPlay's own
 * folder where Documents refused it). On the room's screen, the Dashboard; a banner says when the report's
 * copied.
 */
export function About({ status, setup, cw, update, showUpdate }: PageProps) {
  const w = cw.about
  const [version, setVersion] = useState('')
  const [copied, setCopied] = useState(false)
  // Whether there's an update: the one found, or none after looking again.
  const [looked, setLooked] = useState(false)
  // Where this run's app.log is; null if it couldn't be made anywhere.
  const [appLog, setAppLog] = useState<string | null>(null)
  useEffect(() => {
    appVersion().then(setVersion, () => setVersion(''))
    appLogPlace().then(setAppLog, () => setAppLog(null))
    lookForUpdate().then(
      () => setLooked(true),
      () => setLooked(true),
    )
  }, [])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  useScreenAt('dashboard', GLOW.dashboard, copied ? banner(w.copied) : null)

  const copy = () => {
    const text = report(version, status, setup.games, appLog)
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      (error: unknown) => console.error('The report could not be copied', error),
    )
  }

  return (
    <Panel
      place="page"
      title={w.title}
      sub={w.sub}
      action={
        <Button glass onClick={copy}>
          {w.copy}
        </Button>
      }
    >
      <Group place={4}>
        <Row title={w.version} value={version} />
        {update ? (
          <Row
            title={cw.update.row}
            value={cw.update.available.replace('{version}', update.version)}
            link
            onClick={showUpdate}
          />
        ) : (
          <Row title={cw.update.row} value={looked ? cw.update.upToDate : undefined} />
        )}
      </Group>
      <Group title={w.diagnostics} place={5}>
        <Row
          title={w.frames}
          value={status?.screenDrawing ? w.perSecond.replace('{n}', String(status.framesPerSecond)) : '—'}
        />
        <Row title={w.dropped} value={status ? String(status.droppedTotal) : '—'} />
        <Row title={w.cabGpu} detail={status?.cabAdapter ?? '—'} />
        <Row title={w.gameGpu} detail={status?.gameAdapter ?? w.waitingForGame} />
        <Row title={w.webview} value={status?.webviewVersion || '—'} />
        {/* Each WebView WestPlay runs, and how it's been: whole, recovering from a failed process (the host
            loads the page again, or makes the WebView again), or stopped after failing too often. */}
        {status?.webviews?.map((view) => (
          <Row
            key={view.name}
            title={PAGE_NAMES[view.name] ?? view.name}
            detail={healthDetail(view)}
            accessory={<Status tone={view.state === 'ok' ? 'good' : view.state === 'recovering' ? 'busy' : 'bad'} />}
          />
        ))}
        <Row title={w.log} detail="Documents\WestPlay\logs\plugin.log" />
        <Row title={w.appLog} detail={appLog ?? '—'} />
      </Group>
    </Panel>
  )
}

/** WestPlay's pages, as the diagnostics name them (the host's own names: `youtube music`). */
const PAGE_NAMES: Record<string, string> = {
  cabin: 'WestPlay screen',
  youtube: 'YouTube',
  'youtube music': 'YouTube Music',
  spotify: 'Spotify',
  'apple music': 'Apple Music',
  netease: 'NetEase Cloud Music',
  bilibili: 'Bilibili',
  player: 'Player',
}

/** A WebView's health in a line: nothing failed, or how many did, which process last, and when. */
function healthDetail(view: WebviewHealth): string | undefined {
  if (!view.failures) return undefined
  const said = [`${view.failures} ${view.failures === 1 ? 'failure' : 'failures'}`]
  if (view.lastKind) said.push(`last: ${view.lastKind} ${view.lastReason ?? ''}`.trim())
  if (view.lastAgoSeconds !== null) said.push(ago(view.lastAgoSeconds))
  return said.join(', ')
}

/** How long ago, in a word (`45 s ago`, `3 min ago`, `2 h ago`). */
function ago(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

/** The report to copy: plain facts, in English (for whoever helps), nothing of the player's accounts. */
function report(version: string, status: HostStatus | null, games: GameInfo[], appLog: string | null): string {
  return [
    `WestPlay ${version}`,
    ...(games.length
      ? games.map((game) => `Game: ${GAME_NAMES[game.kind]} ${game.version ?? 'unknown'} (${game.dir})`)
      : ['Game: none set up']),
    `State: ${screenState(status)}`,
    `Engine: ${status?.error ? `stopped: ${status.error}` : status ? 'running' : 'starting'}`,
    `Game connected: ${status?.gameConnected ? (status.game ? GAME_NAMES[status.game] : 'yes') : 'no'}`,
    `Screen drawing: ${status?.screenDrawing ? `yes, ${status.framesPerSecond} fps` : 'no'}`,
    `Dropped frames: ${status?.droppedTotal ?? '—'}`,
    `GPU: ${status?.cabAdapter ?? '—'} (game: ${status?.gameAdapter ?? '—'}; all: ${
      status?.adapters.map((adapter) => adapter.name).join(', ') || '—'
    })`,
    `WebView2: ${status?.webviewVersion || '—'}`,
    `WebViews: ${
      status?.webviews
        ?.map((view) => `${view.name} ${view.state}${healthDetail(view) ? ` (${healthDetail(view)})` : ''}`)
        .join('; ') || '—'
    }`,
    `Map: ${status?.map.state ?? 'unknown'}`,
    `App log: ${appLog ?? 'not written'}`,
    `Windows: ${navigator.userAgent}`,
  ].join('\n')
}
