import { describe, expect, it } from 'vitest'
import { HISTORY_MOST, keptSearches, rememberSearch } from './searchHistory'

/** The searches kept: the last three, each once, and the newest at their front. */
describe('the searches Search keeps', () => {
  it('keeps the newest three, each once', () => {
    expect(HISTORY_MOST).toBe(3)
    expect(rememberSearch([], '星海邮差')).toEqual(['星海邮差'])
    let kept: string[] = []
    for (const word of ['公路', '夜航', '雨', '雾']) kept = rememberSearch(kept, word)
    expect(kept).toEqual(['雾', '雨', '夜航'])
  })

  it('moves a word asked again to the front, however it’s cased', () => {
    const kept = rememberSearch(['公路', 'Night', '雨'], 'night')
    expect(kept).toEqual(['night', '公路', '雨'])
  })

  it('says nothing for an empty word', () => {
    expect(rememberSearch(['公路'], '   ')).toEqual(['公路'])
  })

  it('cleans what wasn’t written by the bar', () => {
    expect(keptSearches(['  a  ', 'A', 42, '', null, 'b'])).toEqual(['a', 'b'])
    expect(keptSearches(null)).toEqual([])
  })
})
