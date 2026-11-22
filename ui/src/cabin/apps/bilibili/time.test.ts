import { describe, expect, it } from 'vitest'
import { formatClock, playhead, progressShare } from './time'

describe('formatClock', () => {
  it('writes times as Bilibili does', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(41.9)).toBe('0:41')
    expect(formatClock(814)).toBe('13:34')
    expect(formatClock(3730)).toBe('1:02:10')
  })

  it('takes nonsense as zero', () => {
    expect(formatClock(-5)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
    expect(formatClock(Infinity)).toBe('0:00')
  })
})

describe('progressShare', () => {
  it('is where the bar is, 0 to 1', () => {
    expect(progressShare(30, 120)).toBe(0.25)
    expect(progressShare(-5, 120)).toBe(0)
    expect(progressShare(200, 120)).toBe(1)
  })

  it('is nothing without a length (a live stream)', () => {
    expect(progressShare(30, 0)).toBe(0)
    expect(progressShare(Number.NaN, 120)).toBe(0)
  })
})

describe('playhead', () => {
  const at = 1_000
  it('stands still while paused', () => {
    expect(playhead(false, 30, at, at + 10_000, 1, 120)).toBe(30)
  })

  it('moves on with the time since it was read, at its rate', () => {
    expect(playhead(true, 30, at, at + 10_000, 1, 120)).toBe(40)
    expect(playhead(true, 30, at, at + 10_000, 1.5, 120)).toBe(45)
  })

  it('never past the end', () => {
    expect(playhead(true, 115, at, at + 10_000, 1, 120)).toBe(120)
  })

  it('takes a nonsense rate as normal speed', () => {
    expect(playhead(true, 30, at, at + 10_000, 0, 120)).toBe(40)
    expect(playhead(true, 30, at, at + 10_000, Number.NaN, 120)).toBe(40)
  })
})
