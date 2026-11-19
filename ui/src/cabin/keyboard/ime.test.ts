import { describe, expect, it } from 'vitest'
import { pinyinCandidates, pinyinOf, placeIndex, typingPinyin } from './ime'

/** Places as the map's list has them: Chinese names, and the same in another language for checks. */
const places = [
  { name: '北京', localized: ' Beijing ' },
  { name: '北京市' },
  { name: '上海' },
  { name: '哈尔滨' },
  { name: '济南' },
]

describe('the pinyin IME', () => {
  it('types a name by its whole pinyin and by its initials', () => {
    expect(pinyinOf('北京')).toEqual({ whole: 'beijing', initials: 'bj' })
    expect(pinyinOf('哈尔滨')).toEqual({ whole: 'haerbin', initials: 'heb' })
  })

  it('indexes only the names in Chinese, once each', () => {
    const index = placeIndex(places)
    expect(index.map((candidate) => candidate.text)).toEqual(['北京', '北京市', '上海', '哈尔滨', '济南'])
  })

  it('finds a place by its pinyin', () => {
    expect(pinyinCandidates(places, 'beijing').map((candidate) => candidate.text)).toEqual(['北京', '北京市'])
    expect(pinyinCandidates(places, 'shang').map((candidate) => candidate.text)).toEqual(['上海'])
  })

  it('finds it by its initials too, "bj" for 北京', () => {
    expect(pinyinCandidates(places, 'bj').map((candidate) => candidate.text)).toEqual(['北京', '北京市'])
    expect(pinyinCandidates(places, 'heb').map((candidate) => candidate.text)).toEqual(['哈尔滨'])
  })

  it('says nothing for a name no place has, or for what is not pinyin', () => {
    expect(pinyinCandidates(places, 'zzz')).toEqual([])
    expect(pinyinCandidates(places, '')).toEqual([])
    expect(pinyinCandidates(places, '北京')).toEqual([])
    expect(pinyinCandidates(null, 'bj')).toEqual([])
  })

  it('keeps the index, so the same list is only walked once', () => {
    expect(placeIndex(places)).toBe(placeIndex(places))
  })

  it('knows pinyin from what is not', () => {
    expect(typingPinyin('beijing')).toBe(true)
    expect(typingPinyin("xi'an")).toBe(true)
    expect(typingPinyin('北京')).toBe(false)
    expect(typingPinyin('beijing lu')).toBe(false)
  })
})
