//! NetEase Cloud Music (网易云音乐): its own web player (music.163.com), in a WebView of its own, hidden under the
//! cabin page. The NetEase app the player sees is WestPlay's own (ui/src/cabin/apps/netease); the web player
//! plays, under its own account and quality, and answers the app with what its page shows, from a script in it
//! (`netease.js`): the player's state read from its own DOM (its play bar), the recommended playlists and a
//! playlist's songs read from the page's own content, and the page's own buttons pressed.
//!
//! The page is a shell of its own (`https://music.163.com/`) with the player at the bottom and the content in a
//! frame of the same origin (`#g_iframe`, on `https://music.163.com/discover`): the frame's document is reachable
//! from the shell's page, so all of it is read there (in `netease.js`).
//!
//! Signing in is NetEase's own QR code dialog, on its page, in a window on the PC's desktop (`signin.rs`), on
//! this WebView's profile (one of its own: signing out forgets NetEase's cookies alone); signed in there, the web
//! player here loads again, signed in (`netease_sign_in.js` says so, and the page's top bar then shows the
//! account). Nothing of the account passes through WestPlay: the page's session stays in the page; what comes out
//! is what the app shows (names, covers, what plays), only the fields below (anything else the page might say is
//! dropped here), and whether it's signed in. Nothing of it is kept or logged.
//!
//! Its sound comes from the truck's own speakers, as Spotify's does (`cab_sound.js`, told the truck's speakers,
//! the driver's head and the camera). The page's own audio element is the sound's source, as its page makes it.
//!
//! The app's protocol is its own (`netease` in ui/src/shared/host.ts), not Spotify's: messages are
//! `{"type":"netease","kind":"state",…}` and `{"type":"netease","kind":"playlist",…}` to the cabin page, and
//! `{"type":"netease","kind":"command","command":{…}}` from it (see [`Command`]).

use std::cell::RefCell;
use std::path::Path;

use crate::signin::{self, Confirming, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

/// NetEase Cloud Music's web player.
pub const HOME: &str = "https://music.163.com/";

/// What the cabin page asks of NetEase (`netease` in ui/src/shared/host.ts).
#[derive(Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    /// Run (hidden), saying whether it's signed in: the NetEase app is open.
    Start,
    /// NetEase's sign-in (its QR code dialog), in a window on the desktop.
    SignIn,
    /// Forget the sign-in, and start again signed out.
    SignOut,
    /// Play on, or a song (`value`: its NetEase id) — the page's own list played from it where the page lists it
    /// (the list stays the queue), or its own player's way (as its own links play a song).
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Pause,
    Next,
    /// The previous song.
    Prev,
    /// Ask for `value` seconds into the song.
    Seek {
        value: f64,
    },
    /// The page's own player's volume, 0 to 1 (as the player shows it: the app's slider, not Spotify's per cent).
    Volume {
        value: f64,
    },
    /// A playlist's page (`value`: its NetEase id), whose songs the page answers with (`kind: "playlist"`).
    OpenPlaylist {
        value: String,
    },
    /// Read the state and the recommended playlists again (a page that reloaded does it itself).
    Refresh,
}

impl Command {
    /// For NetEase's page (all but the host's own: running, signing in and out).
    fn for_page(&self) -> bool {
        !matches!(self, Command::Start | Command::SignIn | Command::SignOut)
    }
}

/// A song of a playlist, as the app's list shows it.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default, deserialize_with = "some_f64")]
    pub duration: f64,
    #[serde(default)]
    pub playable: bool,
}

/// A playlist's songs: the page's answer to the app's `openPlaylist`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Songs {
    /// The playlist's NetEase id, as asked.
    pub id: String,
    /// Its name, as its page shows it (the app shows it as the playlist's title at once).
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub songs: Vec<Song>,
}

impl Songs {
    /// The answer cleaned: only songs the app can show and ask to play (a NetEase id, a name), no duplicate,
    /// and not more than [`Songs::MOST`] of them (a list of thousands would hold up the page).
    fn checked(mut self) -> Self {
        const MOST: usize = 500;
        let mut known = std::collections::HashSet::new();
        self.name = short(self.name, 200);
        self.songs = self
            .songs
            .into_iter()
            .filter(|song| is_id(&song.id) && !song.title.is_empty())
            .filter(|song| known.insert(song.id.clone()))
            .take(MOST)
            .map(|mut song| {
                song.title = short(song.title, 300);
                song.artist = short(song.artist, 300);
                song.duration = finite(song.duration);
                song
            })
            .collect();
        self
    }
}

/// What plays: the song's id, name, artist and album, its cover (on NetEase's own image hosts), how long it is
/// (seconds), how far into it (seconds), and whether it's playable (one the page plays is).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    #[serde(default)]
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default, deserialize_with = "some_f64")]
    pub duration: f64,
    #[serde(default, deserialize_with = "some_f64")]
    pub position: f64,
    #[serde(default)]
    pub playable: bool,
}

impl Track {
    /// The song cleaned: its words as the app shows them (short), its times real, and only a cover on NetEase's
    /// own image hosts (whatever else the page might say is dropped).
    fn checked(mut self) -> Self {
        self.id = if is_id(&self.id) { self.id } else { String::new() };
        self.title = short(self.title, 300);
        self.artist = short(self.artist, 300);
        self.album = short(self.album, 300);
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        self.duration = finite(self.duration);
        self.position = finite(self.position).min(self.duration.max(0.0));
        self
    }
}

/// A recommended playlist: its NetEase id, name, cover (on NetEase's own image hosts) and how many times it's
/// been played.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub play_count: u64,
}

impl Playlist {
    /// The playlist cleaned, as [`Track`]'s fields: an id and a name it can be shown by, a real play count, and
    /// only a cover on NetEase's own image hosts.
    fn checked(mut self) -> Option<Self> {
        if !is_id(&self.id) {
            return None;
        }
        self.name = short(self.name, 200);
        if self.name.is_empty() {
            return None;
        }
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        Some(self)
    }
}

/// Whose account it is, as NetEase's own top bar says it: a name, and the picture of it (NetEase's own URL).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
}

/// What the page's own sound element is doing, for the log when the play bar says playing and it isn't (the app's
/// screen moves on, nothing is heard): how many there are, whether one is playing, and how far in it is.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio {
    #[serde(default)]
    pub elements: usize,
    #[serde(default)]
    pub playing: bool,
    #[serde(default)]
    pub paused: Option<bool>,
    #[serde(default)]
    pub at: Option<i64>,
}

/// Whether the page is signed in, playing, the player's volume (0 to 1), what plays (`None`: nothing), the
/// recommended playlists, whose account it is and what its sound element is doing.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
    #[serde(default, deserialize_with = "some_f64")]
    pub volume: f64,
    #[serde(default)]
    pub track: Option<Track>,
    #[serde(default)]
    pub lists: Vec<Playlist>,
    #[serde(default)]
    pub account: Option<Account>,
    #[serde(default)]
    pub audio: Option<Audio>,
}

/// What the page says of itself (`netease.js`'s state): signed in, or not known yet (`None`: the page still
/// loading), playing, the volume, what plays, and (when they changed) the recommended playlists (`None`: as they
/// were).
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageState {
    signed_in: Option<bool>,
    #[serde(default)]
    playing: bool,
    #[serde(default, deserialize_with = "some_f64")]
    volume: f64,
    #[serde(default)]
    track: Option<Track>,
    #[serde(default)]
    lists: Option<Vec<Playlist>>,
    #[serde(default)]
    account: Option<Account>,
    #[serde(default)]
    audio: Option<Audio>,
}

/// What the host tells NetEase's page of the cab (never the cabin page's to send): the truck's speakers (`None`:
/// as it is, a truck whose speakers aren't known), the driver's head, the camera outside (its distance, metres; 0:
/// not known) and the game's menu up. As Spotify's (spotify.rs).
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum Cab {
    Speakers {
        speakers: Option<Vec<Speaker>>,
    },
    Head {
        #[serde(flatten)]
        head: Head,
    },
    Outside {
        on: bool,
        distance: f32,
    },
    /// The game's menu up (`up`) or gone: the page's sound silent then (the cab's speakers heard from outside its
    /// walls, as with the camera outside it), and back as the menu goes. Never the playback paused.
    Menu {
        up: bool,
    },
    /// The player's tone (the cab's Settings › Sound): bass, mid and treble, dB each.
    Equalizer {
        #[serde(flatten)]
        equalizer: Equalizer,
    },
    /// The music's spectrum wanted (the cab's Equalizer open) or not: the page says it as it plays.
    Spectrum {
        on: bool,
    },
}

/// What the page was told last of the cab (sent again to a page that loaded anew): the truck's speakers (none:
/// its sound as it is), and the speakers, head, camera, menu and tone messages.
#[derive(Debug, Default)]
struct Told {
    speakers: Option<Option<Vec<Speaker>>>,
    head: Option<Head>,
    camera: Option<(bool, f32)>,
    equalizer: Option<Equalizer>,
    spectrum: Option<bool>,
    menu: Option<bool>,
    messages: [Option<String>; 6],
}

#[derive(Debug, PartialEq)]
pub enum Report {
    /// The music's spectrum, while the cab's Equalizer asks for it ([`speakers::read_spectrum`]).
    Spectrum(Vec<u8>),
    State(State),
    /// A playlist's songs, the page's answer to the app's `openPlaylist`.
    Playlist(Box<Songs>),
    /// The sign-in window opened (`true`) or closed.
    SignInWindow(bool),
    /// Signed in in its window, and NetEase's page here is yet to say it's signed in (`true`), or it has (or took
    /// too long: `false`).
    Confirming(bool),
}

pub struct Netease {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    /// Signed in in its window, until the page here says it's signed in.
    confirming: Confirming,
    pending: RefCell<Vec<Report>>,
    /// The cab as the page was told it ([`Netease::cab`]).
    told: RefCell<Told>,
    /// The recommended playlists last read (the page sends them when they change; the state to the app always
    /// has them).
    lists: RefCell<Vec<Playlist>>,
}

impl Netease {
    /// Its WebView (performance.rs counts its processes).
    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    /// Opens NetEase's web player in a WebView of `stage`'s frame (`width` x `height`), hidden under the cabin
    /// page.
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("netease")?;
        view.show(false)?;
        stage.add(&view, false)?;
        // The truck speakers' sound first: the page's script makes its own of it.
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("netease.js")))?;
        view.navigate(HOME)?;
        Ok(Self {
            view,
            sign_in: RefCell::new(None),
            confirming: Confirming::default(),
            pending: RefCell::new(Vec::new()),
            told: RefCell::default(),
            lists: RefCell::default(),
        })
    }

    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Start => Ok(()),
            Command::SignIn => {
                self.open_sign_in();
                Ok(())
            }
            Command::SignOut => {
                self.view.delete_cookies()?;
                self.view.navigate(HOME)
            }
            // A song, a playlist: only NetEase's own ids (nothing else of the app's goes into the page's own
            // addresses and lists).
            Command::Play { value: Some(value) } if !is_id(value) => Ok(()),
            Command::OpenPlaylist { value } if !is_id(value) => Ok(()),
            Command::Seek { value } if !value.is_finite() => Ok(()),
            Command::Volume { value } if !value.is_finite() => Ok(()),
            _ if command.for_page() => self.view.post_json(&serde_json::to_string(command).unwrap_or_default()),
            _ => Ok(()),
        }
    }

    /// NetEase's sign-in window, opened (or brought forward if it is).
    fn open_sign_in(&self) {
        let mut sign_in = self.sign_in.borrow_mut();
        if let Some(window) = sign_in.as_ref() {
            window.bring_forward();
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::NETEASE) {
            Ok(window) => {
                *sign_in = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => crate::startup::mark(&format!("host: the NetEase sign-in window couldn't open: {e}")),
        }
    }

    /// The truck's speakers (none: its sound plays as it is), the driver's head, and whether the camera is outside
    /// the cab and how far (metres; 0: not known): the page is told the speakers as they change, the head as it
    /// moves, the camera as it goes in or out or a quarter metre further, the tone as it's set and the spectrum as
    /// it's wanted (as Spotify's: spotify.rs).
    pub fn cab(
        &self,
        speakers: Option<&[Speaker]>,
        head: Head,
        outside: bool,
        distance: f32,
        equalizer: Equalizer,
        spectrum: bool,
    ) -> windows::core::Result<()> {
        let mut told = self.told.borrow_mut();
        // The head first: the speakers' loudness is set from where it is as they're placed.
        if told.head != Some(head) && head.is_sound() {
            told.head = Some(head);
            let message = serde_json::to_string(&Cab::Head { head }).unwrap_or_default();
            told.messages[1] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.speakers.as_ref().map(Option::as_deref) != Some(speakers) {
            let speakers = speakers.map(<[_]>::to_vec);
            told.speakers = Some(speakers.clone());
            let message = serde_json::to_string(&Cab::Speakers { speakers }).unwrap_or_default();
            told.messages[0] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        let camera = (outside, if outside { (distance * 4.0).round() / 4.0 } else { 0.0 });
        if told.camera != Some(camera) && camera.1.is_finite() {
            told.camera = Some(camera);
            let message = serde_json::to_string(&Cab::Outside { on: camera.0, distance: camera.1 }).unwrap_or_default();
            told.messages[2] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.equalizer != Some(equalizer) {
            told.equalizer = Some(equalizer);
            let message = serde_json::to_string(&Cab::Equalizer { equalizer }).unwrap_or_default();
            told.messages[3] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.spectrum != Some(spectrum) {
            told.spectrum = Some(spectrum);
            let message = serde_json::to_string(&Cab::Spectrum { on: spectrum }).unwrap_or_default();
            told.messages[4] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        Ok(())
    }

    /// The game's menu up (`up`) or gone: the page's sound silent then (the cab's speakers heard from outside its
    /// walls, as with the camera outside it), and back as it goes. Sent as it changes, and again to a page that
    /// loaded anew. Never the playback paused.
    pub fn menu(&self, up: bool) -> windows::core::Result<()> {
        let mut told = self.told.borrow_mut();
        if told.menu == Some(up) {
            return Ok(());
        }
        told.menu = Some(up);
        let message = serde_json::to_string(&Cab::Menu { up }).unwrap_or_default();
        told.messages[5] = Some(message.clone());
        self.view.post_json(&message)
    }

    /// What NetEase's page said since the last call, and the sign-in window opening or closing (signed in, the web
    /// player here loads again, signed in).
    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());
        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(progress @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            if progress == Progress::SignedIn {
                let _ = self.view.navigate(HOME);
                self.confirming.start();
                reports.push(Report::Confirming(true));
            }
        }
        for message in self.view.take_page_messages() {
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            match read_message(&message) {
                // A page loaded anew: the cab as it is (speakers, head, camera), and a reading of it asked again.
                Some(Message::Ready) => {
                    for told in self.told.borrow().messages.iter().flatten() {
                        let _ = self.view.post_json(told);
                    }
                    let _ = self.view.post_json(&serde_json::json!({ "action": "refresh" }).to_string());
                }
                Some(Message::State(page)) => {
                    if let Some(lists) = page.lists {
                        *self.lists.borrow_mut() = lists.iter().cloned().filter_map(Playlist::checked).collect();
                    }
                    // The page still loading (it doesn't know whether it's signed in yet): nothing said of it.
                    if let Some(signed_in) = page.signed_in {
                        reports.push(Report::State(State {
                            signed_in,
                            playing: page.playing,
                            volume: volume_of(page.volume),
                            track: page.track.map(Track::checked),
                            lists: self.lists.borrow().clone(),
                            account: page.account,
                            audio: page.audio,
                        }));
                    }
                }
                Some(Message::Playlist(songs)) => reports.push(Report::Playlist(Box::new(songs.checked()))),
                None => {}
            }
        }
        let signed_in = reports.iter().rev().find_map(|report| match report {
            Report::State(state) => Some(state.signed_in),
            _ => None,
        });
        if self.confirming.ended(signed_in) {
            reports.push(Report::Confirming(false));
        }
        reports
    }

    /// Whether the WebView failed since the last call (it's then closed and started again when needed).
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    /// Takes the WebView off the frame; it closes as it's dropped.
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }
}

/// A message of NetEase's page (`netease.js`).
#[derive(Debug, PartialEq)]
enum Message {
    /// The page is ready (loaded anew).
    Ready,
    /// What the page says of itself (signed in, playing, what plays, and the lists when they changed).
    State(PageState),
    /// A playlist's songs, answered.
    Playlist(Songs),
}

fn read_message(message: &str) -> Option<Message> {
    let value: serde_json::Value = serde_json::from_str(message).ok()?;
    if value.get("ready").and_then(serde_json::Value::as_bool) == Some(true) {
        return Some(Message::Ready);
    }
    if let Some(playlist) = value.get("playlist") {
        return serde_json::from_value::<Songs>(playlist.clone()).ok().map(Message::Playlist);
    }
    if let Some(state) = value.get("state") {
        return serde_json::from_value::<PageState>(state.clone()).ok().map(Message::State);
    }
    None
}

/// `{"type":"netease","kind":"state","state":{…}}` (`state`: `null` when NetEase isn't running) for the cabin page
/// (`netease` in ui/src/shared/host.ts).
pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let state = state.map(|state| {
        let mut value = serde_json::to_value(state).unwrap_or_default();
        value["signingIn"] = signing_in.into();
        value
    });
    serde_json::json!({ "type": "netease", "kind": "state", "state": state }).to_string()
}

/// `{"type":"netease","kind":"playlist","id":"…","name":"…","songs":[…]}`: a playlist's songs, the page's answer
/// to the app's `openPlaylist`.
pub fn playlist_message(songs: &Songs) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "playlist",
        "id": songs.id,
        "name": songs.name,
        "songs": songs.songs,
    })
    .to_string()
}

/// A NetEase song's or playlist's id: digits (`5269469196`), nothing else.
fn is_id(id: &str) -> bool {
    (1..=20).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

/// A cover on NetEase's own image hosts (`https://p2.music.126.net/…`, `http://s4.music.126.net/…`): its CDN's
/// host is `p1.music.126.net`'s and like it, or `*.126.net`'s (`yp.music.126.net`, `s3.music.126.net`).
fn is_net_ease_image(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")) else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let Some(stem) = host.strip_suffix(".126.net") else { return false };
    // A host (`p1`, `s4`, `yp`, `m8011`) and a label or two of the site's own: no `..`, no port, no user info.
    !stem.is_empty()
        && (1..=64).contains(&stem.len())
        && stem.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
        && !stem.starts_with('.')
        && !stem.ends_with('.')
        && !stem.contains("..")
}

/// The page's player's volume, 0 to 1, as the app shows it (`0.8`: the player's own default, for one the page
/// hasn't said).
fn volume_of(value: f64) -> f64 {
    if value.is_finite() && value >= 0.0 { value.min(1.0) } else { 0.8 }
}

/// A time or length the app can use: not a nan, not infinite, not negative.
fn finite(value: f64) -> f64 {
    if value.is_finite() && value >= 0.0 { value } else { 0.0 }
}

/// A number the page says, `null` or missing taken as none (the page says `null` for what it doesn't know).
fn some_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(<Option<f64> as serde::Deserialize>::deserialize(deserializer)?.unwrap_or(0.0))
}

/// `text` as the app shows it: not longer than `most` characters (the page's own words, never anything else of
/// it).
fn short(text: String, most: usize) -> String {
    if text.chars().count() <= most { text } else { text.chars().take(most).collect() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_cabin_pages_commands() {
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"start"}"#).unwrap(), Command::Start);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"signIn"}"#).unwrap(), Command::SignIn);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"signOut"}"#).unwrap(), Command::SignOut);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"play"}"#).unwrap(), Command::Play { value: None });
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play","value":"3778678"}"#).unwrap(),
            Command::Play { value: Some("3778678".into()) }
        );
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"pause"}"#).unwrap(), Command::Pause);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"next"}"#).unwrap(), Command::Next);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"prev"}"#).unwrap(), Command::Prev);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"seek","value":120}"#).unwrap(), Command::Seek {
            value: 120.0
        });
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"volume","value":0.7}"#).unwrap(), Command::Volume {
            value: 0.7
        });
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"openPlaylist","value":"456"}"#).unwrap(),
            Command::OpenPlaylist { value: "456".into() }
        );
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"refresh"}"#).unwrap(), Command::Refresh);
        assert!(serde_json::from_str::<Command>(r#"{"action":"explode"}"#).is_err());
    }

    /// The page is told the app's commands as the app sent them (its own `action` names), but for the host's own.
    #[test]
    fn passes_the_page_its_commands_as_the_app_sent_them() {
        assert_eq!(
            serde_json::to_string(&Command::Play { value: Some("3778678".into()) }).unwrap(),
            r#"{"action":"play","value":"3778678"}"#
        );
        assert_eq!(serde_json::to_string(&Command::Play { value: None }).unwrap(), r#"{"action":"play"}"#);
        assert_eq!(serde_json::to_string(&Command::Prev).unwrap(), r#"{"action":"prev"}"#);
        assert_eq!(serde_json::to_string(&Command::Seek { value: 12.5 }).unwrap(), r#"{"action":"seek","value":12.5}"#);
        assert_eq!(
            serde_json::to_string(&Command::OpenPlaylist { value: "456".into() }).unwrap(),
            r#"{"action":"openPlaylist","value":"456"}"#
        );
        assert!(Command::Refresh.for_page() && Command::Play { value: None }.for_page());
        assert!(!Command::Start.for_page() && !Command::SignIn.for_page() && !Command::SignOut.for_page());
        // Only NetEase's own ids are passed into the page's own addresses and lists.
        assert!(is_id("3778678"));
        assert!(!is_id("") && !is_id("3778678/../x") && !is_id("37786 78") && !is_id("12a"));
        assert!(!is_id(&"1".repeat(21)));
    }

    #[test]
    fn reads_neteases_page() {
        assert_eq!(read_message(r#"{"ready":true}"#), Some(Message::Ready));
        // The page still loading: signed in not known yet, the rest as it is.
        assert_eq!(
            read_message(r#"{"state":{"signedIn":null,"playing":false,"volume":0.8,"track":null}}"#),
            Some(Message::State(PageState {
                signed_in: None,
                playing: false,
                volume: 0.8,
                track: None,
                lists: None,
                account: None,
                audio: None,
            }))
        );
        let Some(Message::State(state)) = read_message(
            r##"{"state":{"signedIn":true,"playing":true,"volume":0.5,"track":{"id":"1","title":"歌名","artist":"歌手",
                "album":"专辑","cover":"https://p2.music.126.net/a.jpg?param=300y300","duration":240,"position":63,
                "playable":true},"lists":[{"id":"456","name":"歌单名","cover":null,"playCount":123456}]}}"##,
        ) else {
            panic!("not a state")
        };
        assert_eq!(state.signed_in, Some(true));
        assert_eq!(state.track.expect("a track").duration, 240.0);
        assert_eq!(state.lists.expect("lists")[0].play_count, 123456);
        assert_eq!(read_message("not json"), None);
        assert_eq!(read_message(r#"{"state":"no"}"#), None);
    }

    #[test]
    fn reads_a_playlists_answer_cleaned() {
        let Some(Message::Playlist(songs)) = read_message(
            r##"{"playlist":{"id":"3778678","name":"热歌榜","songs":[
                {"id":"1","title":"冬天又来临","artist":"歌手","duration":240.5,"playable":true},
                {"id":"1","title":"repeat","artist":"","duration":100,"playable":true},
                {"id":"","title":"no id","duration":1,"playable":false},
                {"id":"2","title":"","duration":1,"playable":false},
                {"id":"3","title":"a song","artist":"","duration":null,"playable":false}]}}"##,
        ) else {
            panic!("not a playlist")
        };
        let songs = songs.checked();
        assert_eq!(songs.id, "3778678");
        assert_eq!(songs.name, "热歌榜");
        assert_eq!(songs.songs.len(), 2, "{songs:?}");
        assert_eq!(songs.songs[0].title, "冬天又来临");
        assert_eq!(songs.songs[1].duration, 0.0);
        assert!(read_message(r#"{"playlist":"no"}"#).is_none());
    }

    /// Only the fields the app shows pass, and only what it can use: a cover on NetEase's own hosts, real times.
    #[test]
    fn passes_on_only_what_the_app_shows() {
        let Some(Message::State(page)) = read_message(
            r##"{"state":{"signedIn":true,"playing":false,"volume":0.5,"track":{"id":"12x","title":"歌名","artist":"歌手",
                "album":"专辑","cover":"https://evil.example/cover.jpg","duration":-1,"position":900},
                "lists":[{"id":"a","name":"bad","playCount":1},{"id":"456","name":"好歌单","cover":"http://p1.music.126.net/x.jpg",
                "playCount":120000000}]},"account":"someone@example.com"}"##,
        ) else {
            panic!("not a state")
        };
        let state = State {
            signed_in: page.signed_in.expect("signed in"),
            playing: page.playing,
            volume: volume_of(page.volume),
            track: page.track.map(Track::checked),
            lists: page.lists.expect("lists").into_iter().filter_map(Playlist::checked).collect(),
            account: None,
            audio: None,
        };
        let track = state.track.as_ref().expect("a track");
        assert_eq!(track.id, "", "not an id");
        assert_eq!(track.cover, None, "not NetEase's image host");
        assert_eq!((track.duration, track.position), (0.0, 0.0), "not real times");
        assert_eq!(state.lists.len(), 1, "only the playlist the app can open");
        let message = state_message(Some(&state), false);
        let said: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(said["type"], "netease");
        assert_eq!(said["kind"], "state");
        assert_eq!(said["state"]["signedIn"], true);
        assert_eq!(said["state"]["signingIn"], false);
        assert!(said["state"]["track"]["cover"].is_null(), "not NetEase's image host: {message}");
        assert_eq!(said["state"]["lists"].as_array().map(Vec::len), Some(1), "only the playlist: {message}");
        assert!(!message.contains("someone"), "nothing of the account passes: {message}");
    }

    /// The state to the cabin page: its protocol's own (`type`/`kind`), `null` before NetEase runs, the sign-in
    /// window's state in it.
    #[test]
    fn says_the_state_the_way_the_app_reads_it() {
        assert_eq!(state_message(None, false), r#"{"kind":"state","state":null,"type":"netease"}"#);
        let state = State {
            signed_in: true,
            playing: true,
            volume: 0.8,
            track: Some(Track {
                id: "123".into(),
                title: "歌名".into(),
                artist: "歌手".into(),
                album: "专辑".into(),
                cover: Some("https://p2.music.126.net/a.jpg".into()),
                duration: 240.0,
                position: 63.0,
                playable: true,
            }),
            lists: vec![Playlist {
                id: "456".into(),
                name: "歌单名".into(),
                cover: None,
                play_count: 123456,
            }],
            account: Some(Account {
                name: "someone".into(),
                avatar: Some("https://p1.music.126.net/a.jpg?param=140y140".into()),
            }),
            audio: Some(Audio {
                elements: 1,
                playing: true,
                paused: Some(false),
                at: Some(63),
            }),
        };
        let message = state_message(Some(&state), true);
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(value["type"], "netease");
        assert_eq!(value["kind"], "state");
        assert_eq!(value["state"]["signingIn"], true);
        assert_eq!(value["state"]["track"]["title"], "歌名");
        assert_eq!(value["state"]["lists"][0]["playCount"], 123456);
        // It reads back as the Rust state, for the app's own: no field lost on the way.
        let mut read: State = serde_json::from_value(value["state"].clone()).unwrap();
        read.track = read.track.map(Track::checked);
        assert_eq!(read, state);
    }

    #[test]
    fn says_a_playlists_songs_the_way_the_app_reads_them() {
        let songs = Songs {
            id: "456".into(),
            name: "歌单名".into(),
            songs: vec![Song {
                id: "1".into(),
                title: "冬天又来临".into(),
                artist: "歌手".into(),
                duration: 240.5,
                playable: true,
            }],
        };
        let message = playlist_message(&songs);
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(value["type"], "netease");
        assert_eq!(value["kind"], "playlist");
        assert_eq!(value["id"], "456");
        assert_eq!(value["name"], "歌单名");
        assert_eq!(value["songs"][0]["playable"], true);
        assert_eq!(value["songs"][0]["duration"], 240.5);
    }

    #[test]
    fn passes_only_a_covers_host_of_neteases() {
        for cover in [
            "https://p2.music.126.net/a.jpg",
            "http://p1.music.126.net/abc==/1.jpg?param=300y300",
            "https://s4.music.126.net/style/web2/img/default/default_album.jpg",
            "https://yp.music.126.net/1.jpg",
            "https://m8011.music.126.net/1.jpg",
        ] {
            assert!(is_net_ease_image(cover), "{cover}");
        }
        for cover in [
            "",
            "https://evil.example/a.jpg",
            "https://evil.example/p2.music.126.net/a.jpg",
            "https://p2.music.126.net.evil.example/a.jpg",
            "https://user@p2.music.126.net/a.jpg",
            "https://p2.music.126.net:8443/a.jpg",
            "javascript:alert(1)",
            "data:image/png;base64,AAAA",
        ] {
            assert!(!is_net_ease_image(cover), "{cover}");
        }
    }

    /// The page as it really is, with this module's script in it: the shell's play bar and account, the content's
    /// frame (its recommended playlists), a playlist's songs, and a song played, paused, sought and turned down
    /// (muted: never heard). Run it by hand (`cargo test -p westplay-host probes_neteases_page -- --ignored
    /// --nocapture`): it asks music.163.com.
    #[test]
    #[ignore = "asks music.163.com"]
    fn probes_neteases_page() {
        use std::time::{Duration, Instant};
        use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
        // SAFETY: COM on this test's own thread, once, before anything uses it.
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap() };
        let user_data = std::env::temp_dir().join(format!("westplay-netease-probe-{}", std::process::id()));
        let stage = Stage::new(1280, 720).unwrap();
        let netease = Netease::start(&stage, 1280, 720, &user_data).unwrap();
        netease.view.set_muted(true).unwrap();
        let mut reports = Vec::new();
        // For `seconds`, as the host goes on: its messages pumped, the page's reports taken.
        let pump = |seconds: f64, reports: &mut Vec<Report>| {
            let until = Instant::now() + Duration::from_secs_f64(seconds);
            while Instant::now() < until {
                crate::pump_messages();
                std::thread::sleep(Duration::from_millis(20));
                reports.extend(netease.take_reports());
            }
        };
        pump(15.0, &mut reports);
        // The shell's page, as the raw DOM says it: the player's own bar, the account, the content's frame.
        let shell = netease
            .view
            .evaluate(
                r#"({
                    href: location.href,
                    ready: document.readyState,
                    playbar: Boolean(document.querySelector('.m-playbar')),
                    account: document.querySelector('.m-tophead')?.innerHTML.length ?? -1,
                    login: Boolean(document.querySelector('.m-tophead a[data-action="login"]')),
                    playClass: document.querySelector('#g_player .ply')?.className ?? null,
                    time: document.querySelector('.m-pbar .time')?.textContent ?? null,
                    frame: document.getElementById('g_iframe')?.contentWindow?.location?.href ?? null,
                    cards: document.getElementById('g_iframe')?.contentDocument?.querySelectorAll('.n-rcmd .m-cvrlst li').length ?? -1,
                    firstCard: document.getElementById('g_iframe')?.contentDocument?.querySelector('.n-rcmd .m-cvrlst li')?.innerHTML.slice(0, 900) ?? null,
                })"#,
            )
            .unwrap();
        println!("shell: {shell}");
        // The recommended cards, as the content's page has them: some are podcasts' (not playlists').
        let cards = netease
            .view
            .evaluate(
                r#"(() => {
                    const doc = document.getElementById('g_iframe')?.contentDocument
                    return [...(doc?.querySelectorAll('.n-rcmd .m-cvrlst li') ?? [])].map((card) => ({
                        link: card.querySelector('a.msk')?.getAttribute('href') ?? null,
                        name: card.querySelector('p.dec a.tit')?.getAttribute('title') ?? null,
                    }))
                })()"#,
            )
            .unwrap();
        println!("cards: {cards}");
        // This module's own script: what it says of the page.
        let page = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
        println!("page: {page}");
        let page: serde_json::Value = serde_json::from_str(&page).expect("the script's own report");
        assert!(page["frame"].as_str().is_some_and(|frame| frame.contains("music.163.com")), "no frame: {page}");
        assert!(page["cards"].as_i64().is_some_and(|cards| cards > 0), "no recommended playlists: {page}");
        assert_eq!(page["signedIn"], false, "signed out (this profile never signed in): {page}");
        // The host's own reports: the state as the page said it, with the recommended lists in it.
        let state = reports
            .iter()
            .rev()
            .find_map(|report| match report {
                Report::State(state) => Some(state.clone()),
                _ => None,
            })
            .expect("the page said how it is");
        println!("state: signedIn={} playing={} lists={:?}", state.signed_in, state.playing, state.lists);
        assert!(!state.lists.is_empty(), "the state has the recommended playlists");

        // A playlist's page: its songs answered with (the first recommended one).
        let id = state.lists[0].id.clone();
        netease.command(&Command::OpenPlaylist { value: id.clone() }).unwrap();
        let started = Instant::now();
        let mut songs = None;
        let mut said = 0;
        while songs.is_none() && started.elapsed() < Duration::from_secs(45) {
            pump(0.5, &mut reports);
            songs = reports.iter().rev().find_map(|report| match report {
                Report::Playlist(songs) if songs.id == id => Some(songs.clone()),
                _ => None,
            });
            // Where the wait is (the frame's address, its page's rows): printed now and then.
            let seconds = started.elapsed().as_secs();
            if songs.is_none() && seconds >= said + 4 {
                said = seconds;
                let seen = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
                println!("  waiting for playlist {id} ({seconds} s): {seen}");
            }
        }
        let songs = songs.expect("the playlist's songs");
        println!("playlist {} ({}): {} songs, first {:?}", songs.name, songs.id, songs.songs.len(), songs.songs.first());
        assert!(!songs.songs.is_empty(), "no songs in playlist {id}");
        assert!(!songs.name.is_empty(), "no name for playlist {id}");
        // The playlist's page, as its own table has it: the row's own play element (its song's id).
        let rows = netease
            .view
            .evaluate(
                r#"(() => {
                    const doc = document.getElementById('g_iframe')?.contentDocument
                    const row = doc?.querySelector('.m-table tbody tr')
                    return {
                        frame: document.getElementById('g_iframe')?.contentWindow?.location?.href ?? null,
                        rows: doc?.querySelectorAll('.m-table tbody tr').length ?? -1,
                        id: row?.querySelector('.hd .ply')?.getAttribute('data-res-id') ?? null,
                        first: row?.innerHTML.slice(0, 1200) ?? null,
                    }
                })()"#,
            )
            .unwrap();
        println!("rows: {rows}");

        // A song of it, played from its own row (muted: never heard).
        let Some(song) = songs.songs.iter().find(|song| song.playable) else { return };
        println!("playing {} ({})", song.title, song.id);
        netease.command(&Command::Play { value: Some(song.id.clone()) }).unwrap();
        // Played through the page's own player (its `nm.x.ceo2i`, what its own links call). Signed out, NetEase
        // doesn't play at all (its page's own rule): the play bar stays empty, and the test only says so.
        pump(6.0, &mut reports);
        let playing = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
        println!("playing: {playing}");
        let playing: serde_json::Value = serde_json::from_str(&playing).unwrap();
        assert_eq!(playing["playAPI"], "function", "the page's own player isn't there: {playing}");
        let heard = reports.iter().rev().find_map(|report| match report {
            Report::State(state) => Some(state.clone()),
            _ => None,
        });
        println!("state after the play: {heard:?}");
        // When it plays (an account's profile), the play bar has its own words, its own time and its own element,
        // and the app is told so: the volume asked for and a seek go into the page's own player.
        if playing["playing"].as_bool() == Some(true) {
            let track = &playing["track"];
            assert!(track["title"].as_str().is_some_and(|title| !title.is_empty()), "no title playing: {playing}");
            assert!(track["id"].as_str().is_some_and(|id| id.bytes().all(|b| b.is_ascii_digit())), "no id: {playing}");
            assert!(track["duration"].as_f64().is_some_and(|duration| duration > 0.0), "no length: {playing}");
            assert_eq!(heard.as_ref().map(|state| state.playing), Some(true), "the app not told it plays");
            netease.command(&Command::Volume { value: 0.42 }).unwrap();
            netease.command(&Command::Seek { value: 30.0 }).unwrap();
            pump(3.0, &mut reports);
            let after = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
            println!("after a volume and a seek: {after}");
            let after: serde_json::Value = serde_json::from_str(&after).unwrap();
            assert_eq!(after["volume"], 0.42, "the volume the app set");
            let position = after["track"]["position"].as_f64().unwrap_or(0.0);
            assert!((position - 30.0).abs() < 5.0, "not sought to 30 s: {after}");
            netease.command(&Command::Pause).unwrap();
            pump(2.0, &mut reports);
            let paused = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
            println!("after a pause: {paused}");
        } else {
            // The play bar's own buttons are the app's controls: they must be there to press.
            let buttons = netease
                .view
                .evaluate(
                    r#"({
                        play: Boolean(document.querySelector('#g_player .ply')),
                        previous: Boolean(document.querySelector('.m-playbar .prv')),
                        next: Boolean(document.querySelector('.m-playbar .nxt')),
                        time: document.querySelector('.m-pbar .time')?.textContent ?? null,
                        progress: Boolean(document.querySelector('.m-pbar .barbg .cur')),
                    })"#,
                )
                .unwrap();
            println!("the play bar's own buttons, for the app's controls: {buttons}");
            let buttons: serde_json::Value = serde_json::from_str(&buttons).unwrap();
            assert_eq!(
                (buttons["play"].as_bool(), buttons["previous"].as_bool(), buttons["next"].as_bool()),
                (Some(true), Some(true), Some(true))
            );
            assert_eq!(buttons["progress"].as_bool(), Some(true));
        }
        netease.close(&stage);
        let _ = std::fs::remove_dir_all(&user_data);
    }
}
