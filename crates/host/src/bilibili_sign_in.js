// WestPlay, in Bilibili's sign-in window (signin.rs): the site's own passport page (passport.bilibili.com/login),
// where signing in is its own QR code, scanned with the player's phone. The window is for signing in: once the
// page has the account's own cookie (its DedeUserID, which the page's script can read; the session's SESSDATA is
// the page's alone), or its top bar shows the account, this says so, and nothing more of it. The address it goes
// to afterwards is Bilibili's own; the hidden player's page, on the same profile, loads again signed in.
;(() => {
  if (!/(^|\.)bilibili\.com$/.test(location.hostname) || window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  // The page's own sign of the account: its cookie (DedeUserID; the page keeps SESSDATA to itself), or its top
  // bar's own picture (once the page has drawn it).
  const signedIn = () =>
    /(?:^|;\s*)DedeUserID=\d{1,20}(?:;|$)/.test(document.cookie) ||
    Boolean(document.querySelector('.header-avatar-wrap, .bili-avatar, .header-entry-avatar, .bili-header__avatar'))
  let said = false
  const look = () => {
    if (signedIn()) {
      if (!said) {
        said = true
        post({ signedIn: true })
      }
      return
    }
    setTimeout(look, 500)
  }
  look()
})()
