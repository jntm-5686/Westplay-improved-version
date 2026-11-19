import { useEffect, useState } from 'react'
import { formatTripDistance } from '../../shared/format'
import { usePlaces } from '../maps/places'
import { toLngLat } from '../maps/projection'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import { breakClock, nearestRestStop } from './restStatus'

/** How long each of the pill's figures shows: they alternate every ten seconds (owner 2026-11-17). */
const EVERY_MS = 10_000
/** How often the nearest rest stop is worked out while that figure shows: once a second, no more. */
const LOOK_EVERY_MS = 1000

/**
 * The map's rest pill, at its top: the in-game time left until the driver's next mandatory break (the game's
 * `mandatory.break`), and how far the nearest rest stop is — the closest rest area or service station in the
 * map's places, from where the truck is, in kilometres or miles as the profile counts them. One figure at a
 * time, changing every ten seconds (owner 2026-11-17: "显示10秒钟后切换下一项").
 *
 * The distance is worked out once a second while its figure shows, in one pass over the places: no sorting, no
 * extra frames, nothing while the other figure shows.
 */
export function RestPill() {
  // Only what the figures show: the telemetry changes many times a second, the break time rarely, and a render
  // for every frame of it would be work for nothing.
  const minutes = useLive((state) => state.telemetry?.mandatoryBreak)
  const mph = useLive((state) => state.mph)
  const text = useText()
  const places = usePlaces()
  const [figure, setFigure] = useState<0 | 1>(0)
  const [metres, setMetres] = useState<number | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setFigure((showing) => (showing === 0 ? 1 : 0)), EVERY_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (figure !== 1) return
    // Read from the store, not the render: where the truck is now, not as it was when this last drew.
    const look = () => {
      const telemetry = useLive.getState().telemetry
      const from = telemetry ? toLngLat(telemetry.x, telemetry.z) : null
      setMetres(nearestRestStop(places, from)?.metres ?? null)
    }
    look()
    const timer = setInterval(look, LOOK_EVERY_MS)
    return () => clearInterval(timer)
  }, [figure, places])

  const clock = breakClock(minutes)
  return (
    <div className="rest-pill glass" data-figure={figure} aria-live="polite">
      {figure === 0 ? (
        <span className="rest-figure" key="break">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 2.2V12l4.3 2.6-.9 1.5L10.6 13V5.2Z" />
          </svg>
          <span className="rest-label">{text.restBreak}</span>
          <b>{clock ?? '—'}</b>
        </span>
      ) : (
        <span className="rest-figure" key="stop">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.6A2.6 2.6 0 1 1 14.6 9 2.6 2.6 0 0 1 12 11.6Z" />
          </svg>
          <span className="rest-label">{text.restStop}</span>
          <b>{metres === null ? '—' : formatTripDistance(metres, text.decimal, mph)}</b>
        </span>
      )}
    </div>
  )
}
