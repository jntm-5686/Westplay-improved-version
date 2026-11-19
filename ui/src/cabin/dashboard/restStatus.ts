import type { Destination } from '../maps/places'
import { metresBetween } from '../maps/projection'

/**
 * The rest pill's figures: the game's next mandatory break, and how far the nearest rest stop is (owner
 * 2026-11-17: "距离下一次强制休息还有多久" / "距离您最近的休息站有多少公里").
 */

/** Its place in the map's places: the game rests at a rest area and at a service station's, both with a bed. */
const REST_KINDS: readonly Destination['kind'][] = ['parking', 'service']

export interface RestStop {
  at: [number, number]
  /** Metres from where it was looked for. */
  metres: number
}

/**
 * `from`'s nearest rest stop among `places`: the closest rest area or service station. One pass over the places,
 * keeping the smallest distance (no sort, no copy): a map of a few thousand places, asked once a second while the
 * figure shows, is a few microseconds. `null` with no places, no `from`, or none of them.
 */
export function nearestRestStop(
  places: readonly Destination[] | null | undefined,
  from: [number, number] | null,
): RestStop | null {
  if (!places || !from) return null
  let best: RestStop | null = null
  for (const place of places) {
    if (!REST_KINDS.includes(place.kind)) continue
    const metres = metresBetween(place.at, from)
    if (!best || metres < best.metres) best = { at: place.at, metres }
  }
  return best
}

/**
 * The in-game time until the driver's next mandatory break (`mandatory.break`, minutes) as the pill shows it
 * ("1:25"); `null` where the game gives none (-1: no route, or the mandatory break simulation off).
 */
export function breakClock(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || minutes < 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  // Rounded up to the next hour: "1:00", never "0:60".
  return rest === 60 ? `${hours + 1}:00` : `${hours}:${String(rest).padStart(2, '0')}`
}
