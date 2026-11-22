import { describe, expect, it } from 'vitest'
import { bilibiliWords } from './words'

/** The app's own words, in the cab's language: Chinese for Chinese, English for the rest. */
describe('bilibiliWords', () => {
  it('writes the numbers Bilibili’s way, in each language', () => {
    const zh = bilibiliWords('zh-CN')
    const en = bilibiliWords('en-US')
    expect(zh.home.views(2_184_000)).toBe('218万播放')
    expect(en.home.views(2_184_000)).toBe('2.2M views')
    expect(zh.player.coinToast(1)).toBe('已投 1 枚硬币')
    expect(zh.search.filters.user).toBe('UP 主')
    expect(en.search.filters.user).toBe('Creators')
  })

  it('names the app and its five tabs', () => {
    expect(bilibiliWords('zh-TW').brand).toBe('哔哩哔哩')
    expect(bilibiliWords('en-GB').brand).toBe('Bilibili')
    expect(bilibiliWords('zh-CN').tabs).toEqual({
      home: '首页',
      bangumi: '番剧',
      cinema: '影视',
      live: '直播',
      mine: '我的',
    })
    expect(bilibiliWords('de-DE').tabs.home).toBe('Home')
  })

  it('carries the version line, as NetEase’s settings page has one', () => {
    expect(bilibiliWords('zh-CN').aboutApp).toBe('哔哩哔哩车机版 V1 · WestPlay')
    expect(bilibiliWords('en-US').aboutApp).toBe('Bilibili in the cab · V1 · WestPlay')
  })
})
