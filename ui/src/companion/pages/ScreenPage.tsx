import { GAME_KINDS, GAME_NAMES } from '../setup'
import { setWestplayOpen } from '../useHostStatus'
import { Group, Note, Panel, Row, Status, Switch, Tick } from '../room/parts'
import { banner } from '../room/room'
import { GLOW, useScreenAt } from '../room/screen'
import { type PageProps, screenState } from './page'
import type { CoachSpeakers, ScreenOn } from '../useSettings'

/**
 * The truck's screen: where WestPlay is now (its headline), WestPlay on it or the truck's own, and the
 * connection from WestPlay to the game to the screen. On the room's screen, Home, and WestPlay saying the
 * same in a banner.
 */
export function ScreenPage({ status, settings, setup, cw }: PageProps) {
  const w = cw.screen
  const state = screenState(status)
  // Known once the cabin page has said (it owns the state): the switch waits for it.
  const open = status?.westplayOpen ?? null
  useScreenAt(
    state === 'original' ? 'dashboard' : 'home',
    GLOW.home,
    state === 'live'
      ? banner(w.banners.live)
      : state === 'original'
        ? banner(w.banners.original)
        : state === 'unsupported'
          ? banner(w.banners.unsupported)
          : state === 'notInCab'
            ? banner(w.banners.notInCab)
            : state === 'noGame'
              ? banner(w.banners.noGame, true)
              : null,
  )
  const fps = status?.framesPerSecond ?? 0
  // The game connected; else the games set up (else both).
  const kinds = status?.game ? [status.game] : setup.games.length ? setup.games.map((game) => game.kind) : GAME_KINDS
  const gameName = kinds.map((kind) => GAME_NAMES[kind]).join(' 路 ')
  return (
    <Panel place="page" title={w.titles[state]} sub={w.subs[state]}>
      <Group place={4}>
        <Row
          title={w.show}
          detail={w.showDetail}
          accessory={
            <Switch
              on={open ?? false}
              disabled={open === null || !status?.screenDrawing}
              label={w.show}
              change={(on) => {
                setWestplayOpen(on).catch((error: unknown) => console.error('WestPlay could not be switched', error))
              }}
            />
          }
        />
      </Group>
      <ScreenOnChooser settings={settings} cw={cw} />
      <Group title={w.connection} place={6}>
        <Row
          title={w.engine}
          value={status?.error ? cw.values.failed : status ? w.engineRunning : w.engineStarting}
          accessory={<Status tone={status?.error ? 'bad' : status ? 'good' : 'busy'} />}
        />
        <Row
          title={gameName}
          value={status?.gameConnected ? w.gameConnected : w.gameNotRunning}
          accessory={<Status tone={status?.gameConnected ? 'good' : 'idle'} />}
        />
        <Row
          title={w.truckScreen}
          value={
            state === 'unsupported'
              ? w.screenUnsupported
              : status?.screenDrawing
                ? w.screenLive.replace('{fps}', String(fps))
                : w.screenNotInView
          }
          accessory={
            <Status
              tone={
                state === 'unsupported'
                  ? 'idle'
                  : status?.screenDrawing
                    ? 'good'
                    : status?.gameConnected
                      ? 'busy'
                      : 'idle'
              }
            />
          }
        />
      </Group>
      {status?.gameElevated && (
        <Note tone="bad">
          <b>{w.elevated.title}</b> {w.elevated.text}
        </Note>
      )}
      <GpuChooser status={status} settings={settings} cw={cw} />
      <CoachChooser status={status} settings={settings} cw={cw} />
      {status?.error && <Note tone="bad">{status.error}</Note>}
    </Panel>
  )
}

/**
 * Which of a truck's two screens WestPlay shows on, in a truck that has both (owner 2026-11-16, a player's
 * request: a truck with its own screen and WestPlay's tablet fitted may keep the game's navigation and show
 * WestPlay on the tablet). The choice is WestPlay's own, not the truck's, so it shows in every truck: it's the mod
 * that leaves the trucks whose own screen isn't used with the game's navigation, and the tablet in them.
 */
function ScreenOnChooser({ settings: state, cw }: Pick<PageProps, 'settings' | 'cw'>) {
  const w = cw.screen
  const { settings, update } = state
  if (!settings) return null
  const chosen = settings.screen.on
  const choose = (on: ScreenOn) => {
    if (on !== chosen) void update({ ...settings, screen: { ...settings.screen, on } })
  }
  return (
    <>
      <Group title={w.screenOn} place={5}>
        <Row
          title={w.truckScreen}
          accessory={chosen === 'truckScreen' ? <Tick key="truckScreen" /> : undefined}
          onClick={() => choose('truckScreen')}
        />
        <Row title={w.tablet} accessory={chosen === 'tablet' ? <Tick key="tablet" /> : undefined} onClick={() => choose('tablet')} />
      </Group>
      <Note tone="calm">{w.screenOnNote}</Note>
    </>
  )
}

/**
 * The graphics card WestPlay's screen is drawn on: WestPlay's pick (the game's), or one the player chooses
 * when that one stutters, as iOS lists choices (a tick on the chosen, as the onboarding's game folders). The
 * one drawing it now says so; a choice starts WestPlay's screen again on that card. Only with more than one
 * card to choose from.
 */
function GpuChooser({ status, settings: state, cw }: Pick<PageProps, 'status' | 'settings' | 'cw'>) {
  const w = cw.screen
  const { settings, update } = state
  const adapters = status?.adapters ?? []
  if (!settings || adapters.length < 2) return null
  const chosen = adapters.some((adapter) => adapter.id === settings.graphics.gpu) ? settings.graphics.gpu : null
  const choose = (gpu: string | null) => {
    if (gpu !== settings.graphics.gpu) void update({ ...settings, graphics: { gpu } })
  }
  return (
    <>
      <Group title={cw.about.gpu} place={7}>
        <Row
          title={w.gpuAuto}
          detail={w.gpuAutoDetail}
          accessory={chosen === null ? <Tick key="auto" /> : undefined}
          onClick={() => choose(null)}
        />
        {adapters.map((adapter) => (
          <Row
            key={adapter.id}
            title={adapter.name}
            detail={adapter.name === status?.cabAdapter ? w.gpuInUse : undefined}
            accessory={chosen === adapter.id ? <Tick key={adapter.id} /> : undefined}
            onClick={() => choose(adapter.id)}
          />
        ))}
      </Group>
      <Note tone="calm">{w.gpuNote}</Note>
    </>
  )
}

/**
 * Which of a coach's speakers play (owner 2026-11-13): the driver's pair round the seat, or every unit over the
 * passengers' seats, as real coaches have a cockpit system and a passengers' one. A choice here, not in the cab; the
 * passengers' are many speakers at once, which a weak processor feels, so the note under it says how many in the coach
 * driven (its own count, from the host). Greyed out outside a coach (owner 2026-11-13).
 */
function CoachChooser({ status, settings: state, cw }: Pick<PageProps, 'status' | 'settings' | 'cw'>) {
  const w = cw.screen
  const { settings, update } = state
  if (!settings) return null
  const chosen = settings.sound.coach
  const count = status?.coachSpeakers ?? null
  const off = count === null
  const choose = (coach: CoachSpeakers) => {
    if (coach !== chosen) void update({ ...settings, sound: { ...settings.sound, coach } })
  }
  return (
    <>
      <Group title={w.coachSpeakers} place={8} disabled={off}>
        <Row
          title={w.coachDriver}
          detail={w.coachDriverDetail}
          accessory={chosen === 'driver' ? <Tick key="driver" /> : undefined}
          onClick={() => choose('driver')}
        />
        <Row
          title={w.coachPassengers}
          detail={w.coachPassengersDetail}
          accessory={chosen === 'passengers' ? <Tick key="passengers" /> : undefined}
          onClick={() => choose('passengers')}
        />
      </Group>
      <Note tone="calm" disabled={off}>
        {off ? w.coachNoteAny : w.coachNote.replace('{n}', String(count))}
      </Note>
    </>
  )
}
