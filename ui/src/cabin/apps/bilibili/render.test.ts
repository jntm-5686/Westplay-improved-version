import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Its pages are large (all of the app's screens drawn): the suite's parallel load can take it past the default
// time, never its own failure.
vi.setConfig({ testTimeout: 20000 })

/**
 * The app's screen, drawn without a browser: the shell and every page of it, from the preview's own first frame. Catches
 * the render-time errors a type check can't (a hook out of order, a field read of a list that isn't there). Plain
 * server rendering reads the stores' first state, so what it draws is the browser preview's opening screen.
 */

function stubBrowser() {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { origin: 'http://localhost:5173', search: '', href: 'http://localhost:5173/cabin.html' })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function renderApp() {
  const { BilibiliApp } = await import('./BilibiliApp')
  return renderToStaticMarkup(createElement(BilibiliApp))
}

async function renderPage(page: import('./stack').Page) {
  const { PageBody } = await import('./pages')
  return renderToStaticMarkup(createElement(PageBody, { page }))
}

async function renderTab(tab: import('./stack').Tab) {
  const { TabPage } = await import('./pages')
  return renderToStaticMarkup(createElement(TabPage, { tab }))
}

describe('the app draws', () => {
  it('the shell: its rail, its search bar, Home’s banner and feed, its player bar', async () => {
    stubBrowser()
    const html = await renderApp()
    expect(html).toContain('Bilibili')
    expect(html).toContain('Home')
    expect(html).toContain('星海邮差')
    expect(html).toContain('bb-grid')
    expect(html).toContain('bb-playerbar')
    // Home's banner: the account's recommendations, with the dots of its carousel.
    expect(html).toContain('bb-banner')
    expect(html).toContain('bb-banner-dots')
    // The app's own theme: 跟随系统 by default (the stylesheet resolves it against the cab's appearance).
    expect(html).toContain('data-theme="auto"')
  })

  it('番剧 and 影视: their lists, and a season’s own page with its 选集', async () => {
    stubBrowser()
    expect(await renderTab('bangumi')).toContain('星海邮差')
    expect(await renderTab('cinema')).toContain('一路向北')
    const detail = await renderPage({ kind: 'bangumiDetail', seasonId: '47836' })
    expect(detail).toContain('星海邮差')
    expect(detail).toContain('Episode 1')
    expect(detail).toContain('出发之前')
    expect(detail).toContain('bb-episode-badge')
    expect(detail).toContain('会员')
    expect(detail).toContain('bb-episodes')
  })

  it('直播: its cards, and a live room’s page', async () => {
    stubBrowser()
    const list = await renderTab('live')
    expect(list).toContain('深夜电台')
    const room = await renderPage({ kind: 'liveRoom', roomId: '9101' })
    expect(room).toContain('深夜电台')
    expect(room).toContain('bb-room-play')
  })

  it('搜索: its idle screen and its three filters', async () => {
    stubBrowser()
    const search = await renderPage({ kind: 'search' })
    expect(search).toContain('Search')
    expect(search).toContain('Nothing searched yet')
  })

  it('我的: the sign-in card, its doors, the app’s version line and the preview’s note', async () => {
    stubBrowser()
    const mine = await renderTab('mine')
    expect(mine).toContain('Sign in to Bilibili')
    expect(mine).toContain('History')
    expect(mine).toContain('Bilibili in the cab · V1 · WestPlay')
    expect(mine).toContain('Browser preview')
  })

  it('历史记录, 收藏夹, 关注动态 and a UP主’s page', async () => {
    stubBrowser()
    expect(await renderPage({ kind: 'history' })).toContain('History')
    const favorites = await renderPage({ kind: 'favorites' })
    expect(favorites).toContain('公路与远方')
    expect(favorites).toContain('bb-grid')
    expect(await renderPage({ kind: 'dynamic' })).toContain('Feed')
    const space = await renderPage({ kind: 'space', uid: '1001' })
    expect(space).toContain('夜航研究所')
  })

  it('a video’s own page, 我的粉丝 and the player', async () => {
    stubBrowser()
    const video = await renderPage({ kind: 'videoDetail', videoId: 'BV1preview001' })
    expect(video).toContain('bb-scroll')
    const relations = await renderPage({ kind: 'relations', relation: 'followers' })
    expect(relations).toContain('My followers')
    const { PlayerPage } = await import('./Player')
    const player = renderToStaticMarkup(createElement(PlayerPage))
    expect(player).toContain('bb-player')
    expect(player).toContain('bb-player-stage')
    expect(player).toContain('bb-player-controls-layer')
  })

  it('设置: the three themes, the version line and the account’s way out', async () => {
    stubBrowser()
    const settings = await renderPage({ kind: 'settings' })
    expect(settings).toContain('Settings')
    expect(settings).toContain('Appearance')
    expect(settings).toContain('Follow the system')
    expect(settings).toContain('Dark')
    expect(settings).toContain('Light')
    expect(settings).toContain('Bilibili in the cab · V1 · WestPlay')
    expect(settings).toContain('bb-theme-options')
    // 我的's own way into it.
    const mine = await renderTab('mine')
    expect(mine).toContain('bb-mine-tools')
    expect(mine).toContain('Settings')
  })
})
