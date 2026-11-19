import { describe, expect, it } from 'vitest'
import type { Destination } from '../maps/places'
import { breakClock, nearestRestStop } from './restStatus'

function place(kind: Destination['kind'], at: [number, number]): Destination {
  return { kind, at, node: '0' }
}

describe('the rest pill’s figures', () => {
  it('counts the time to the next mandatory break as hours and minutes', () => {
    expect(breakClock(0)).toBe('0:00')
    expect(breakClock(7)).toBe('0:07')
    expect(breakClock(65)).toBe('1:05')
    expect(breakClock(600)).toBe('10:00')
    // Rounded up, never "0:60".
    expect(breakClock(119.6)).toBe('2:00')
  })

  it('says nothing where the game gives no break time', () => {
    expect(breakClock(-1)).toBeNull()
    expect(breakClock(null)).toBeNull()
    expect(breakClock(undefined)).toBeNull()
  })

  it('finds the nearest rest stop, rest areas and service stations alike', () => {
    const from: [number, number] = [0, 0]
    const places = [
      place('city', [0.02, 0]), // ~2.2 km away, but not a rest stop
      place('service', [0.01, 0]), // ~1.1 km
      place('parking', [0.005, 0]), // ~557 m: the nearest
      place('fuel', [0.001, 0]), // closest of all, but no bed
    ]
    const stop = nearestRestStop(places, from)
    expect(stop?.at).toEqual([0.005, 0])
    expect(stop?.metres).toBeCloseTo(556.6, 0)
  })

  it('has nothing to say without places or a place to look from', () => {
    expect(nearestRestStop(null, [0, 0])).toBeNull()
    expect(nearestRestStop([], [0, 0])).toBeNull()
    expect(nearestRestStop([place('parking', [0.01, 0])], null)).toBeNull()
    expect(nearestRestStop([place('city', [0.01, 0])], [0, 0])).toBeNull()
  })
})
