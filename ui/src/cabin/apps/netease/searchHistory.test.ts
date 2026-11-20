import { describe, expect, it } from 'vitest'
import { HISTORY_MOST, keptSearches, rememberSearch } from './searchHistory'

describe('the searches kept', () => {
  it('keeps at most three, the newest first, each once', () => {
    let history: string[] = []
    history = rememberSearch(history, '周杰伦')
    history = rememberSearch(history, '许巍')
    history = rememberSearch(history, 'Taylor Swift')
    history = rememberSearch(history, '明日方舟')
    expect(history).toEqual(['明日方舟', 'Taylor Swift', '许巍'])
    expect(history).toHaveLength(HISTORY_MOST)
    // Asked again: moved up, once.
    expect(rememberSearch(history, '许巍')).toEqual(['许巍', '明日方舟', 'Taylor Swift'])
  })

  it('cleans what it is given: trimmed, capped, no blanks, no repeats however cased', () => {
    expect(keptSearches(['  周杰伦 ', '', 42, '周杰伦', 'zhou', 'ZHOU', '许巍', '明日方舟'])).toEqual([
      '周杰伦',
      'zhou',
      '许巍',
    ])
    expect(keptSearches(['x'.repeat(80)])[0]).toHaveLength(60)
    expect(keptSearches(null)).toEqual([])
  })

  it('an empty search leaves the kept ones as they are', () => {
    expect(rememberSearch(['周杰伦'], '   ')).toEqual(['周杰伦'])
  })
})
