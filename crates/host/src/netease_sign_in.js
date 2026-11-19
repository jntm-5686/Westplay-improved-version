// WestPlay, in NetEase Cloud Music's sign-in window (signin.rs): NetEase's own page (music.163.com), where signing
// in is its own QR code dialog — opened here through the page's own sign-in (the page's own `window.login()`, or
// its top bar's 登录 link), and scanned with the player's phone. The window is for signing in: once the page's own
// top bar shows the account (its sign of being signed in) this says it, and nothing more of it.
;(() => {
  if (location.hostname !== 'music.163.com' || window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  // The page's own sign of being signed in (its top bar's account), and its sign-in link (signed out).
  const SIGNED_IN = '.m-tophead [data-action="logout"], .m-tophead .head img, .m-tophead a.name'
  const LOGIN = '.m-tophead a[data-action="login"]'
  let asked = false
  // The page's own sign-in, as its top bar's 登录 asks it: the page's own function (the dialog's scripts load, and
  // the QR code shows), or its link pressed.
  const open = () => {
    try {
      if (typeof window.login === 'function') {
        window.login()
        return true
      }
    } catch {
      // Its own page's, changed: the link, then.
    }
    const link = document.querySelector(LOGIN)
    if (link) {
      link.click()
      return true
    }
    return false
  }
  const look = () => {
    if (document.querySelector(SIGNED_IN)) {
      post({ signedIn: true })
      return
    }
    // Asked for once the page is ready enough to ask (a page still loading its own scripts: again in a moment).
    if (!asked) asked = open()
    setTimeout(look, 500)
  }
  look()
})()
