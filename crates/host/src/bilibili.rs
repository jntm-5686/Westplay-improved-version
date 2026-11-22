//! Bilibili (哔哩哔哩车机版): the real bilibili.com in a WebView of its own, hidden under the cabin page, as the
//! engine that plays the video and reads the site: the site's own player plays in it (a video's page, a bangumi's
//! episode, a live room), its picture shown under the cabin page where the app's player goes, and everything the
//! app shows the site answers itself, from its own same-origin interface, signed in with the player's own account
//! (`bilibili.js`).
//!
//! Nothing of the account passes through WestPlay: the sign-in is Bilibili's own passport page, in a window on the
//! PC's desktop (signin.rs), on this WebView's profile; its page's QR code is scanned with the player's phone, and
//! what the page keeps (its cookies) is WebView2's. WestPlay only ever learns whether the page is signed in, and
//! what the app shows (the account's name and picture, the lists it asked for, what plays) — nothing kept, nothing
//! logged. The app itself is WestPlay's own (ui/src/cabin/apps/bilibili).
//!
//! Its sound comes from the truck's own speakers, as Spotify's and NetEase's do (`cab_sound.js`, told the truck's
//! speakers, the driver's head and the camera): the player's own audio element is the sound's source.
//!
//! The app's protocol is its own (`bilibili` in ui/src/cabin/apps/bilibili): messages are
//! `{"type":"bilibili","kind":"state",…}`, `{"type":"bilibili","kind":"home",…}`, `{"type":"bilibili","kind":"search",…}`,
//! `{"type":"bilibili","kind":"season",…}`, `{"type":"bilibili","kind":"like",…}` and so on to the cabin page, and
//! `{"type":"bilibili","kind":"command","command":{…}}` from it (see [`Command`]). The protocol is written down in
//! notes/bilibili-v1-host.md.

use std::cell::{Cell, RefCell};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::signin::{self, Confirming, Progress, SignInWindow};
use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

/// Bilibili's home page, where its hidden page opens (every play navigates from it to what plays).
pub const HOME: &str = "https://www.bilibili.com/";

/// What the cabin page asks of Bilibili (`bilibili` in ui/src/cabin/apps/bilibili).
#[derive(Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    /// Run (hidden), saying whether it's signed in: the Bilibili app is open.
    Start,
    /// Bilibili's sign-in (its QR code page), in a window on the desktop.
    SignIn,
    /// Forget the sign-in, and start again signed out.
    SignOut,
    /// The home feed's recommendations: its first page, a later one (`page`, 1 from the start), or the stream
    /// started again (`fresh`: its first page, its repeats forgotten), answered with (`kind: "home"`).
    Home {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fresh: Option<bool>,
    },
    /// The signed-in account's relations (`kind`: whom it follows, or who follows it), `page` from 1 on, answered
    /// with (`kind: "relations"`).
    Relations {
        kind: RelationKind,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        page: Option<u32>,
    },
    /// Bilibili's popular videos, answered with (`kind: "popular"`).
    Popular,
    /// Its rankings (`rid`: 0 all, or a region's tid), answered with (`kind: "ranking"`).
    Ranking {
        #[serde(default)]
        rid: u32,
    },
    /// A search of `value`, of `kind` (`video`, `user`, `bangumi`, `movie`, `live`), `page` from 1 on, answered
    /// with (`kind: "search"`).
    Search {
        value: String,
        #[serde(default)]
        kind: Option<SearchKind>,
        #[serde(default)]
        page: Option<u32>,
    },
    /// The bangumi (`seasonType` 1), films (2), documentaries (3), 国创 (4), series (5) or variety shows (7)
    /// index, answered with (`kind: "bangumi"`).
    Bangumi {
        #[serde(default)]
        season_type: u32,
        #[serde(default)]
        page: Option<u32>,
    },
    /// A season's own page (`value`: its season id, `ss…`), its episodes answered with (`kind: "season"`).
    Season { value: String },
    /// The live rooms Bilibili shows, answered with (`kind: "live"`).
    Live,
    /// The signed-in account's history (`max` and `viewAt`: its cursor, 0 for the first page), answered with
    /// (`kind: "history"`).
    History {
        #[serde(default)]
        max: Option<u64>,
        #[serde(default)]
        view_at: Option<u64>,
    },
    /// The account's own favourite folders, answered with (`kind: "favorites"`).
    Favorites,
    /// A favourite folder's videos (`value`: the folder's id), answered with (`kind: "favoriteItems"`).
    FavoriteItems {
        value: String,
        #[serde(default)]
        page: Option<u32>,
    },
    /// The account's following feed (`offset`: the cursor its last answer gave, empty for the first page),
    /// answered with (`kind: "dynamic"`).
    Dynamic {
        #[serde(default)]
        offset: Option<String>,
    },
    /// An UP's space (`value`: their mid), answered with (`kind: "space"`).
    Space {
        value: String,
        #[serde(default)]
        page: Option<u32>,
    },
    /// A video's own page (`value`: its `BV…` or its `av…` number), answered with (`kind: "detail"`).
    Detail { value: String },
    /// Play `value` — a video's id (`BV…`/`av…`, `page` of its parts), a bangumi's episode or season (`ep…`,
    /// `ss…`) — or a live room's (`kind`: `video`, `bangumi`, `live`). The site's own page for it loads, and its
    /// own player plays it.
    Play {
        value: String,
        #[serde(default)]
        kind: Option<PlayKind>,
        #[serde(default)]
        page: Option<u32>,
    },
    Pause,
    Resume,
    /// Play the next of what plays: a bangumi's next episode (its season's own list), a multi-part video's next
    /// part, or a video's first related one. Nothing to play: `failed` (its own action).
    Next,
    /// Play the previous of what plays: a bangumi's episode before this one, or a multi-part video's part before
    /// it. Nothing before it: `failed` (its own action).
    Prev,
    /// Ask for `value` seconds into what plays.
    Seek {
        value: f64,
    },
    /// The player's volume, 0 to 1 (as the app's slider shows it).
    Volume {
        value: f64,
    },
    /// The playback speed (0.25 to 3).
    Rate {
        value: f64,
    },
    /// The picture's quality: its qn (`80` 1080P, `64` 720P…), as Bilibili's own player takes it.
    Quality {
        #[serde(default)]
        value: u32,
    },
    /// Subtitles: this track (the page's own id for it; `null`: none), read from the page's own subtitle list and
    /// drawn over the video by the page's script.
    Caption {
        #[serde(default)]
        track: Option<String>,
    },
    /// Like the video `value` (`BV…`), or take the like back (`on`), answered with (`kind: "like"`).
    Like { value: String, on: bool },
    /// Give the video `value` `count` coins (1 or 2), answered with (`kind: "coin"`).
    Coin {
        value: String,
        #[serde(default)]
        count: Option<u32>,
        #[serde(default)]
        like: Option<bool>,
    },
    /// Put the video `value` in a favourite folder (`add`), or take it out of them, answered with
    /// (`kind: "favorite"`). `mediaId`: the folder to use (the account's default one when it isn't said).
    Favorite {
        value: String,
        #[serde(default)]
        add: Option<bool>,
        #[serde(default)]
        media_id: Option<u64>,
    },
    /// Show the picture at this rectangle of the frame (pixels), under the cabin page; `crop`: filling it, cropped
    /// (otherwise all of it, with bars where its shape isn't the rectangle's).
    Show {
        x: f32,
        y: f32,
        width: u32,
        height: u32,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        crop: bool,
    },
    /// The picture fills its page, cropped, or shows all of it (`Show`'s `crop`, as the page hears it).
    Crop {
        on: bool,
    },
    /// Show no picture (it plays on, heard).
    Hide,
    /// Done with Bilibili: the WebView goes.
    Close,
    /// Read the state and the account again (a page that reloaded does it itself).
    Refresh,
}

/// What a search is of.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchKind {
    Video,
    User,
    Bangumi,
    Movie,
    Live,
}

/// What a play is of.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayKind {
    Video,
    Bangumi,
    Live,
}

/// Whose relations a page of is: the account's followers, or the accounts it follows.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RelationKind {
    Followers,
    Following,
}

impl Command {
    /// Whether what it names is a thing Bilibili has: its own ids, words of a sensible length, numbers in range.
    fn is_sound(&self) -> bool {
        match self {
            Command::Search { value, page, .. } => {
                let words = value.trim();
                !words.is_empty() && words.chars().count() <= 60 && page.is_none_or(|page| (1..=1000).contains(&page))
            }
            Command::Bangumi { season_type, page } => {
                matches!(*season_type, 0 | 1..=8) && page.is_none_or(|page| (1..=1000).contains(&page))
            }
            Command::Season { value } => is_number(value),
            Command::History { max, view_at } => {
                max.is_none_or(|max| max <= 1 << 40) && view_at.is_none_or(|at| at <= 1 << 42)
            }
            Command::FavoriteItems { value, page } => {
                is_number(value) && page.is_none_or(|page| (1..=1000).contains(&page))
            }
            Command::Dynamic { offset } => offset.as_deref().is_none_or(is_token),
            Command::Space { value, page } => {
                is_number(value) && page.is_none_or(|page| (1..=1000).contains(&page))
            }
            Command::Detail { value } => is_video_id(value),
            Command::Play { value, kind, page } => match kind.unwrap_or(PlayKind::Video) {
                PlayKind::Video => is_video_id(value) && page.is_none_or(|page| (1..=1000).contains(&page)),
                PlayKind::Bangumi => is_bangumi_id(value),
                PlayKind::Live => is_number(value),
            },
            Command::Ranking { rid } => *rid <= 1000,
            Command::Seek { value } => value.is_finite() && (0.0..=1_000_000.0).contains(value),
            Command::Volume { value } => value.is_finite() && (0.0..=1.0).contains(value),
            Command::Rate { value } => value.is_finite() && (0.25..=3.0).contains(value),
            Command::Quality { value } => *value <= 127,
            Command::Caption { track } => track.as_deref().is_none_or(|track| track.len() <= 64 && is_token(track)),
            Command::Like { value, .. } => is_video_id(value),
            Command::Coin { value, count, .. } => {
                is_video_id(value) && count.is_none_or(|count| (1..=2).contains(&count))
            }
            Command::Favorite { value, media_id, .. } => {
                is_video_id(value) && media_id.is_none_or(|id| id <= 1 << 50)
            }
            Command::Home { page, .. } => page.is_none_or(|page| (1..=1000).contains(&page)),
            Command::Relations { page, .. } => page.is_none_or(|page| (1..=1000).contains(&page)),
            Command::Crop { .. } | Command::Refresh => true,
            Command::Popular | Command::Live | Command::Favorites | Command::Pause | Command::Resume
            | Command::Next | Command::Prev => true,
            // The host's own, which the page never hears.
            Command::Start | Command::SignIn | Command::SignOut | Command::Show { .. } | Command::Hide
            | Command::Close => false,
        }
    }
}

/// A Bilibili video's id: `BV` and 10 characters of letters and digits (its newer ids are 12, `av` numbers stand
/// in for them too, an `av` prefix or bare digits).
fn is_video_id(id: &str) -> bool {
    let id = id.trim();
    if let Some(rest) = id.strip_prefix("BV") {
        return (8..=12).contains(&rest.len()) && rest.bytes().all(|byte| byte.is_ascii_alphanumeric());
    }
    let digits = id.strip_prefix("av").unwrap_or(id);
    !digits.is_empty() && digits.len() <= 15 && digits.bytes().all(|byte| byte.is_ascii_digit())
}

/// A bangumi's episode or season id (`ep…`, `ss…`), or its number alone (a season's).
fn is_bangumi_id(id: &str) -> bool {
    let id = id.trim();
    let rest = id.strip_prefix("ep").or_else(|| id.strip_prefix("ss")).unwrap_or(id);
    !rest.is_empty() && rest.len() <= 12 && rest.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_number(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value.len() <= 20 && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Bilibili's own kind of token (a dynamic's cursor): letters, digits and a few signs.
fn is_token(token: &str) -> bool {
    token.len() <= 512 && token.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_=%".contains(&byte))
}

/// An UP or an account: its Bilibili id, its name, and its picture (on Bilibili's own image hosts).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    #[serde(default)]
    pub mid: u64,
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
}

impl User {
    /// Its name cut to a line, its picture kept to Bilibili's own hosts; `None` for one that has neither left.
    fn sound(mut self) -> Option<Self> {
        plain(&mut self.name, 80);
        self.avatar = image(self.avatar.take());
        (!self.name.is_empty() || self.avatar.is_some() || self.mid != 0).then_some(self)
    }
}

/// A video, as the app's cards show it (the home feed's, a search's, a favourite folder's, an UP's…).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    #[serde(default)]
    pub bvid: String,
    #[serde(default)]
    pub aid: u64,
    #[serde(default)]
    pub cid: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    /// Its length, seconds.
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub owner: Option<User>,
    #[serde(default)]
    pub views: u64,
    #[serde(default)]
    pub likes: u64,
    #[serde(default)]
    pub pubdate: u64,
}

/// A bangumi's or a film's season, as Bilibili's index and its search show it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    #[serde(default)]
    pub season_id: u64,
    #[serde(default)]
    pub media_id: u64,
    #[serde(default)]
    pub ep_id: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    /// Bilibili's own word for it ("9.7", "暂无评分").
    #[serde(default)]
    pub score: String,
    /// Its own progress text ("全8话", "更新至第1280话").
    #[serde(default, rename = "indexShow")]
    pub index_show: String,
    /// Its badge ("大会员", "独家"), when it has one.
    #[serde(default)]
    pub badge: String,
    #[serde(default)]
    pub season_type: u32,
    #[serde(default)]
    pub url: String,
    /// Bilibili's own word for its following ("1770.1万追番"), where its answer gives one.
    #[serde(default)]
    pub followers: String,
}

/// A live room, as the live home and a search show it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub room_id: u64,
    #[serde(default)]
    pub short_id: u64,
    #[serde(default)]
    pub uid: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub uname: String,
    #[serde(default)]
    pub face: Option<String>,
    /// Its own area's name ("英雄联盟", "颜值").
    #[serde(default)]
    pub area: String,
    /// How many watch it (its own popularity).
    #[serde(default)]
    pub online: u64,
    #[serde(default)]
    pub live: bool,
}

/// One of Bilibili's own cards: a video, a season or a live room.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Item {
    Video(Video),
    Media(Media),
    Live(Room),
}

/// An UP found by a search.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCard {
    pub mid: u64,
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub sign: String,
    #[serde(default)]
    pub fans: u64,
    #[serde(default)]
    pub videos: u64,
}

/// A video of the account's history, with how far it was watched.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    #[serde(default)]
    pub bvid: String,
    #[serde(default)]
    pub aid: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub owner: Option<User>,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub progress: u64,
    #[serde(default)]
    pub viewed_at: u64,
    #[serde(default)]
    pub live: bool,
}

/// One of the account's favourite folders.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: u64,
    pub title: String,
    #[serde(default, rename = "count")]
    pub count: u64,
    #[serde(default)]
    pub fav_state: u32,
}

/// One of a bangumi's episodes: its own id, the video behind it, its title and its length.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub ep_id: u64,
    #[serde(default)]
    pub cid: u64,
    #[serde(default)]
    pub bvid: String,
    pub title: String,
    #[serde(default)]
    pub index_title: String,
    #[serde(default)]
    pub cover: Option<String>,
    /// Seconds.
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub badge: String,
}

impl Episode {
    /// The episode with only what can be shown: its own ids, its texts cut, its picture on Bilibili's own hosts,
    /// its badge as the site words it (empty: free; "会员": its members' alone). `None` for one with no id at all.
    fn sound(mut self) -> Option<Self> {
        if self.ep_id == 0 && self.cid == 0 {
            return None;
        }
        plain(&mut self.title, 160);
        plain(&mut self.index_title, 40);
        plain(&mut self.badge, 20);
        if !self.bvid.is_empty() && !is_video_id(&self.bvid) {
            self.bvid.clear();
        }
        self.cover = image(self.cover.take());
        self.duration = finite(self.duration).clamp(0.0, 1_000_000.0);
        Some(self)
    }
}

/// A section of a season's page (its extras, its trailers…).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub title: String,
    #[serde(default)]
    pub episodes: Vec<Episode>,
}

impl Section {
    fn sound(mut self) -> Self {
        plain(&mut self.title, 80);
        self.episodes = self.episodes.into_iter().filter_map(Episode::sound).collect();
        self
    }
}

/// One part of a video (P1, P2…).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub cid: u64,
    pub page: u32,
    pub title: String,
    /// Seconds.
    #[serde(default)]
    pub duration: f64,
}

/// A video's own counts.
#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    #[serde(default)]
    pub views: u64,
    #[serde(default)]
    pub likes: u64,
    #[serde(default)]
    pub coins: u64,
    #[serde(default)]
    pub favorites: u64,
    #[serde(default)]
    pub danmaku: u64,
}

/// What plays, as the page found it (the video its address names, the bangumi's episode, the live room), with the
/// page's own title, its UP and its picture.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playing {
    /// `video`, `bangumi` or `live`.
    pub kind: String,
    #[serde(default)]
    pub bvid: String,
    #[serde(default)]
    pub aid: u64,
    #[serde(default)]
    pub cid: u64,
    #[serde(default)]
    pub ep_id: u64,
    #[serde(default)]
    pub season_id: u64,
    #[serde(default)]
    pub room_id: u64,
    pub title: String,
    #[serde(default)]
    pub owner: Option<User>,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub live: bool,
    /// Which of a video's parts plays (1 for its first).
    #[serde(default)]
    pub page: u32,
    /// How many parts it has.
    #[serde(default)]
    pub pages: u32,
}

/// One of the qualities a video has: Bilibili's qn and its own name for it ("1080P", "720P60").
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quality {
    pub qn: u32,
    #[serde(default)]
    pub label: String,
}

/// One of a video's subtitles: the page's own id for it, and its name ("中文（简体）").
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Caption {
    pub id: String,
    #[serde(default)]
    pub name: String,
}

/// Whether the page is signed in and what plays: playing or not, the player's volume (0 to 1) and speed, how far
/// into it, what plays (`None`: nothing), the qualities and the subtitles the page could find, and how loud the
/// truck's speakers hear it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
    /// Whether the page's own video has data to paint (its `readyState` at least 2): the host shows the picture
    /// only from then on, never a black frame in its place.
    #[serde(default)]
    pub ready: bool,
    #[serde(default)]
    pub volume: f64,
    #[serde(default)]
    pub rate: f64,
    #[serde(default)]
    pub time: f64,
    #[serde(default)]
    pub duration: f64,
    /// Its shape, width over height (`None`: not known yet, or a live stream the page doesn't give it for).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aspect: Option<f64>,
    #[serde(default)]
    pub media: Option<Playing>,
    #[serde(default)]
    pub qualities: Vec<Quality>,
    #[serde(default)]
    pub quality: u32,
    #[serde(default)]
    pub quality_label: String,
    #[serde(default)]
    pub captions: Vec<Caption>,
    #[serde(default)]
    pub caption: Option<String>,
    /// How loud the truck's speakers play in each ear (left, right), 0 to 1, and how much the limiter takes off
    /// (dB, 0 or less) (`None`: the sound plays as it is).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cab_level: Option<[f32; 3]>,
}

impl State {
    /// The state with only what can be shown: a real video, real qualities and subtitles, numbers in range, texts
    /// cut (they're bilibili.com's page's words).
    fn sound(mut self) -> Self {
        self.aspect = self.aspect.filter(|aspect| (0.1..=10.0).contains(aspect));
        if let Some(media) = &mut self.media {
            if !matches!(media.kind.as_str(), "video" | "bangumi" | "live") {
                self.media = None;
            } else {
                plain(&mut media.title, 160);
                if media.bvid.len() > 20 || (!media.bvid.is_empty() && !is_video_id(&media.bvid)) {
                    media.bvid.clear();
                }
                if let Some(owner) = media.owner.take() {
                    media.owner = owner.sound();
                }
                media.cover = image(media.cover.take());
                media.page = media.page.min(10_000);
                media.pages = media.pages.min(10_000);
            }
        }
        self.qualities.retain(|quality| quality.qn <= 127);
        self.qualities.truncate(16);
        for quality in &mut self.qualities {
            plain(&mut quality.label, 20);
        }
        self.captions.retain(|caption| !caption.id.is_empty() && is_token(&caption.id));
        self.captions.truncate(64);
        for caption in &mut self.captions {
            plain(&mut caption.name, 60);
        }
        if self.caption.as_deref().is_some_and(|id| !self.captions.iter().any(|caption| caption.id == id)) {
            self.caption = None;
        }
        self.volume = finite(self.volume).clamp(0.0, 1.0);
        self.rate = finite(self.rate).clamp(0.0, 16.0);
        if self.rate <= 0.0 {
            self.rate = 1.0;
        }
        self.time = finite(self.time).clamp(0.0, 100_000_000.0);
        self.duration = finite(self.duration).clamp(0.0, 100_000_000.0);
        plain(&mut self.quality_label, 20);
        self.cab_level = self.cab_level.filter(|level| level.iter().all(|value| value.is_finite())).map(
            |[left, right, limited]| [left.clamp(0.0, 1.0), right.clamp(0.0, 1.0), limited.clamp(-60.0, 0.0)],
        );
        self
    }
}

/// Whether Bilibili's page is signed in, and the account's name and picture, and how many it follows and how many
/// follow it. Nothing else of the account: WestPlay neither asks nor keeps it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub signed_in: bool,
    #[serde(default)]
    pub uid: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    /// How many accounts it follows, and how many follow it (its own nav's counts).
    #[serde(default)]
    pub following: u64,
    #[serde(default)]
    pub follower: u64,
}

impl Account {
    fn sound(mut self) -> Self {
        if !self.signed_in {
            self.uid = 0;
            self.name.clear();
            self.avatar = None;
            self.following = 0;
            self.follower = 0;
        } else {
            plain(&mut self.name, 80);
            self.avatar = image(self.avatar.take());
        }
        self
    }
}

/// An interface that refused, and why (Bilibili's own code and words: signed out, risk control, gone).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failed {
    pub action: String,
    pub code: i64,
    pub message: String,
}

impl Failed {
    fn sound(mut self) -> Self {
        plain(&mut self.action, 40);
        // A play's failure carries its details (the address, the player's wall, the video's error, the permission):
        // kept whole enough for the log to say why.
        plain(&mut self.message, 400);
        self
    }
}

/// The home feed's recommendations (`kind: "home"`): its cards, which page of the stream they are, and whether the
/// stream has another page.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Home {
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub more: bool,
}

/// An account of the account's relations: its own id, name, picture and signature (`kind: "relations"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationUser {
    #[serde(default)]
    pub uid: u64,
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub sign: String,
}

impl RelationUser {
    /// Its name and signature cut to a line, its picture kept to Bilibili's own hosts; `None` for one with no id.
    fn sound(mut self) -> Option<Self> {
        if self.uid == 0 {
            return None;
        }
        plain(&mut self.name, 80);
        plain(&mut self.sign, 300);
        self.avatar = image(self.avatar.take());
        Some(self)
    }
}

/// The account's relations (`kind: "relations"`): whether these are its followers or the accounts it follows, the
/// page of them, the accounts, and whether there is a page after it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relations {
    #[serde(default)]
    pub relation_kind: String,
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub items: Vec<RelationUser>,
    #[serde(default)]
    pub more: bool,
}

impl Relations {
    fn sound(mut self) -> Self {
        self.relation_kind = match self.relation_kind.as_str() {
            "followers" => "followers".into(),
            _ => "following".into(),
        };
        self.items = self.items.into_iter().filter_map(RelationUser::sound).collect();
        self.items.truncate(100);
        self.page = self.page.clamp(1, 1000);
        self
    }
}

/// Bilibili's popular videos (`kind: "popular"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Popular {
    #[serde(default)]
    pub items: Vec<Item>,
}

/// Its rankings (`kind: "ranking"`): the region (`rid`, 0 for all), Bilibili's own note, and the videos.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ranking {
    #[serde(default)]
    pub rid: u32,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub items: Vec<Item>,
}

/// A search's answer (`kind: "search"`): what was searched, its kind, its page and count, its videos, seasons or
/// live rooms, and the UPs found.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Search {
    pub query: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub users: Vec<UserCard>,
}

/// The bangumi/film index (`kind: "bangumi"`): the season type searched, the page, the count, the seasons.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bangumi {
    #[serde(default)]
    pub season_type: u32,
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub items: Vec<Item>,
}

/// A season's own page (`kind: "season"`): what it is and its episodes (the sections' too).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub season_id: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub evaluate: String,
    #[serde(default)]
    pub score: String,
    #[serde(default)]
    pub badge: String,
    #[serde(default)]
    pub episodes: Vec<Episode>,
    #[serde(default)]
    pub sections: Vec<Section>,
}

impl Season {
    /// The season with only what can be shown: its own texts cut, its picture on Bilibili's own hosts, its
    /// episodes (each with its badge: the site's "会员" where its members' alone, empty where free) kept.
    fn sound(mut self) -> Self {
        plain(&mut self.title, 160);
        plain(&mut self.evaluate, 500);
        plain(&mut self.score, 20);
        plain(&mut self.badge, 80);
        self.cover = image(self.cover.take());
        self.episodes = self.episodes.into_iter().filter_map(Episode::sound).collect();
        self.episodes.truncate(2_000);
        self.sections = self.sections.into_iter().map(Section::sound).collect();
        self.sections.truncate(50);
        self
    }
}

/// The live rooms Bilibili shows (`kind: "live"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    #[serde(default)]
    pub items: Vec<Item>,
}

/// The account's history (`kind: "history"`): its videos and the cursor for the next page.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    #[serde(default)]
    pub items: Vec<HistoryItem>,
    #[serde(default)]
    pub max: u64,
    #[serde(default)]
    pub view_at: u64,
}

/// The account's favourite folders (`kind: "favorites"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorites {
    #[serde(default)]
    pub folders: Vec<Folder>,
}

/// A favourite folder's videos (`kind: "favoriteItems"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItems {
    pub media_id: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub has_more: bool,
}

/// The account's following feed (`kind: "dynamic"`): its videos and the cursor for the next page.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dynamic {
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub offset: String,
}

/// An UP's space (`kind: "space"`): who they are, and their videos.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub mid: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub sign: String,
    #[serde(default)]
    pub level: u32,
    #[serde(default)]
    pub fans: u64,
    #[serde(default)]
    pub videos: u64,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub has_more: bool,
}

/// A video's own page (`kind: "detail"`): its parts, its UP, its counts, and what the account did with it.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub bvid: String,
    #[serde(default)]
    pub aid: u64,
    #[serde(default)]
    pub cid: u64,
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub desc: String,
    /// Seconds.
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub pubdate: u64,
    #[serde(default)]
    pub owner: Option<User>,
    #[serde(default)]
    pub pages: Vec<Part>,
    #[serde(default)]
    pub stat: Stats,
    /// The account's own state with it (`None`: signed out, or not known).
    #[serde(default)]
    pub like: Option<bool>,
    #[serde(default)]
    pub coin: Option<u32>,
    #[serde(default)]
    pub favorite: Option<bool>,
}

/// A like asked for, and what came of it (`kind: "like"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Like {
    pub bvid: String,
    pub on: bool,
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub reason: String,
}

/// A coin asked for, and what came of it (`kind: "coin"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coin {
    pub bvid: String,
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub reason: String,
}

/// A favourite asked for, and what came of it (`kind: "favorite"`).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub bvid: String,
    pub on: bool,
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub reason: String,
}

/// What Bilibili's page said since the last call (how it plays, a list, a count, whether it's signed in), or
/// whether the sign-in window is open.
#[derive(Debug, PartialEq)]
pub enum Report {
    /// The music's spectrum, while the cab's Equalizer asks for it ([`speakers::read_spectrum`]).
    Spectrum(Vec<u8>),
    State(Box<State>),
    Account(Box<Account>),
    Home(Box<Home>),
    Relations(Box<Relations>),
    Popular(Box<Popular>),
    Ranking(Box<Ranking>),
    Search(Box<Search>),
    Bangumi(Box<Bangumi>),
    Season(Box<Season>),
    Live(Box<Live>),
    History(Box<History>),
    Favorites(Box<Favorites>),
    FavoriteItems(Box<FavoriteItems>),
    Dynamic(Box<Dynamic>),
    Space(Box<Space>),
    Detail(Box<Detail>),
    Like(Box<Like>),
    Coin(Box<Coin>),
    Favorite(Box<Favorite>),
    /// An interface that refused: the app is told why its list is empty.
    Failed(Box<Failed>),
    /// The sign-in window opened (`true`) or closed.
    SignInWindow(bool),
    /// The picture's layer shown (`true`) or hidden (`false`): the app's own handshake with the host (only its
    /// `true` once the page's video is ready to paint, and `false` as it loads or navigates).
    Showing(bool),
    /// Signed in in its window, and Bilibili's page here is yet to say it's signed in (`true`), or it has (or took
    /// too long: `false`).
    Confirming(bool),
}

/// What the host tells Bilibili's page of the cab (never the cabin page's to send): the truck's speakers (`None`:
/// as it is, a truck whose speakers aren't known), the driver's head, the camera outside (its distance, metres; 0:
/// not known), the game's menu up, the player's tone and the spectrum wanted. As Spotify's and NetEase's
/// (spotify.rs, netease.rs), the page's script making the sound's own way of it (cab_sound.js).
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
    Menu {
        up: bool,
    },
    Equalizer {
        #[serde(flatten)]
        equalizer: Equalizer,
    },
    Spectrum {
        on: bool,
    },
}

/// What the page was told last of the cab (sent again to a page that loaded anew): the truck's speakers, the head,
/// the camera, the tone, the spectrum and the menu.
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

pub struct Bilibili {
    view: OffscreenWebView,
    /// The page's size, the picture kept within it.
    frame: PageSize,
    outbox: RefCell<Outbox>,
    /// The sign-in window while it's open.
    sign_in: RefCell<Option<SignInWindow>>,
    /// Once it closed signed in, until the page says it's signed in.
    confirming: Confirming,
    /// Reports of the host's own, for the next `take_reports`.
    pending: RefCell<Vec<Report>>,
    /// The cab as the page was told it ([`Bilibili::cab`]).
    told: RefCell<Told>,
    /// Whether the page's own video is ready to be seen (its own `ready`: its element has data to paint). The picture
    /// is shown only from then on, and hidden again as the page loads another (never a black frame in its place).
    ready: Cell<bool>,
    /// The picture's place the app last asked for, kept until the page is ready to show it (and for the page it
    /// loads again), cleared when it's hidden.
    show: RefCell<Option<(f32, f32, u32, u32)>>,
    /// What the app was told of the picture's layer, for the handshake: only what changed.
    showing: RefCell<Showing>,
}

/// What the app was told of the picture's layer, for the handshake: only what changed is told (`None` before it was
/// ever told anything).
#[derive(Debug, Default)]
struct Showing(Option<bool>);

impl Showing {
    /// `on`, when it's not what the app was last told: the message to tell it, or `None`.
    fn set(&mut self, on: bool) -> Option<bool> {
        if self.0 == Some(on) {
            return None;
        }
        self.0 = Some(on);
        Some(on)
    }
}

impl Bilibili {
    /// Its WebView (performance.rs counts its processes).
    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    /// Opens Bilibili's home page in a WebView of `stage`'s frame (`width` x `height`), hidden under the cabin page.
    /// Its own profile (signing out forgets its cookies alone), its browser's cross-origin checks off for it alone
    /// (its video is served from other hosts; taken into the cab's speakers' sound (cab_sound.js) it would come out
    /// silent otherwise, as NetEase's), its local network access checks off (its player's PCDN, and the player's own
    /// "网络状况异常" wall otherwise: measured 2026-11-21) and its player allowed to start without a press (the app's
    /// own play).
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new_with_arguments(
            stage,
            width,
            height,
            user_data,
            "--disable-web-security --disable-features=LocalNetworkAccessChecks",
        )?;
        view.log_as("bilibili")?;
        view.show(false)?;
        stage.add(&view, false)?;
        // The truck speakers' sound first: the page's script makes its own of it.
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("bilibili.js")))?;
        view.navigate(HOME)?;
        Ok(Self {
            view,
            frame: stage.page_size(),
            outbox: RefCell::new(Outbox::default()),
            sign_in: RefCell::new(None),
            confirming: Confirming::default(),
            pending: RefCell::new(Vec::new()),
            told: RefCell::default(),
            ready: Cell::new(false),
            show: RefCell::new(None),
            showing: RefCell::default(),
        })
    }

    /// Carries out the page's command (`Close` is the caller's: [`Bilibili::close`]).
    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Start => Ok(()),
            Command::SignIn => {
                self.open_sign_in();
                Ok(())
            }
            Command::SignOut => {
                self.view.delete_cookies()?;
                self.reload()
            }
            Command::Show { x, y, width, height, crop } => {
                self.pass(&Command::Crop { on: *crop })?;
                let page = self.frame.get();
                let (x, y, width, height) = crate::youtube::within(page, *x, *y, *width, *height);
                log!("[bilibili] picture asked at {x},{y} {width}x{height} (page {page:?})");
                // A small picture (the app's own player's) is the whole page scaled down: the site keeps playing at
                // the page's own size, ready to be full screen again; a large one is the page at its size.
                if width * 2 < page.0 {
                    self.view.fit(page, x, y, width, height)?;
                } else {
                    self.view.place(x, y, width, height)?;
                }
                *self.show.borrow_mut() = Some((x, y, width, height));
                // Its picture only once the page's own video has data to paint: before that the page is black there
                // (a transparent frame over the cab). Kept asked for, so the ready page shows it at once, and the
                // app is told (its own handshake, `showing`).
                self.apply_show().map(|_| ())
            }
            Command::Hide => {
                self.outbox.borrow_mut().transport = None;
                // Off first, the place forgotten after: a frame at the old place would show a black one.
                *self.show.borrow_mut() = None;
                self.apply_show()?;
                log!("[bilibili] picture hidden");
                Ok(())
            }
            Command::Close => Ok(()),
            command if !command.is_sound() => Ok(()),
            // A play (or its next) navigates to another page: its picture goes until that page's own video is
            // ready, never a black frame in its place (the app is told too, `showing: false`).
            Command::Play { .. } | Command::Next | Command::Prev => {
                self.ready.set(false);
                self.apply_show()?;
                self.pass(command)
            }
            command => self.pass(command),
        }
    }

    /// Bilibili's sign-in window, opened (or brought forward if it is).
    fn open_sign_in(&self) {
        let mut sign_in = self.sign_in.borrow_mut();
        if let Some(window) = sign_in.as_ref() {
            window.bring_forward();
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::BILIBILI) {
            Ok(window) => {
                *sign_in = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => crate::startup::mark(&format!("host: the Bilibili sign-in window couldn't open: {e}")),
        }
    }

    /// The truck's speakers (none: its sound plays as it is), the driver's head, and whether the camera is outside
    /// the cab and how far (metres; 0: not known), the player's tone and whether the spectrum is wanted: the page
    /// is told the speakers as they change, the head as it moves, the camera as it goes in or out or a quarter metre
    /// further, the tone as it's set and the spectrum as it's wanted (as Spotify's: spotify.rs).
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
    /// walls, as with the camera outside it), and back as it goes. Never the playback paused.
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

    /// Passes a command on to Bilibili's page (held until the page is there; its last volume, speed, quality,
    /// subtitles and pause kept for a page that loads again).
    fn pass(&self, command: &Command) -> windows::core::Result<()> {
        match self.outbox.borrow_mut().send(command) {
            Some(message) => self.view.post_json(&message),
            None => Ok(()),
        }
    }

    /// Bilibili's home page again (signed in or out since): it says what it is again ([`Outbox::ready`]).
    pub fn reload(&self) -> windows::core::Result<()> {
        // Its page's picture goes until the page it loads says its own video is ready.
        self.ready.set(false);
        let _ = self.apply_show();
        self.view.navigate(HOME)
    }

    /// Shows the picture at its place when the page's own video is ready to paint it (and the app asked for it), or
    /// keeps it hidden while the page loads: never a transparent, black frame where the picture goes. The app is told
    /// when that changes (`showing`), so its own layer knows when the picture may be seen.
    fn apply_show(&self) -> windows::core::Result<bool> {
        let visible = may_show(self.ready.get(), self.show.borrow().is_some());
        self.view.show(visible)?;
        self.tell_showing(visible);
        Ok(visible)
    }

    /// Tells the app the picture's layer shown or hidden, when that changes (its own handshake: `showing`).
    fn tell_showing(&self, on: bool) {
        if let Some(on) = self.showing.borrow_mut().set(on) {
            self.pending.borrow_mut().push(Report::Showing(on));
        }
    }

    /// What Bilibili's page said since the last call, and whether the sign-in window closed.
    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());
        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(progress @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            if progress == Progress::SignedIn {
                let _ = self.reload();
                self.confirming.start();
                reports.push(Report::Confirming(true));
            }
        }
        for message in self.view.take_page_messages() {
            if message == r#"{"ready":true}"# {
                for owed in self.outbox.borrow_mut().ready() {
                    let _ = self.view.post_json(&owed);
                }
                continue;
            }
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            match read_message(&message) {
                Some(Message::State(state)) => reports.push(Report::State(Box::new(state.sound()))),
                Some(Message::Account(account)) => reports.push(Report::Account(Box::new(account.sound()))),
                Some(Message::Home(home)) => reports.push(Report::Home(Box::new(home))),
                Some(Message::Relations(relations)) => reports.push(Report::Relations(Box::new(relations.sound()))),
                Some(Message::Popular(popular)) => reports.push(Report::Popular(Box::new(popular))),
                Some(Message::Ranking(ranking)) => reports.push(Report::Ranking(Box::new(ranking))),
                Some(Message::Search(search)) => reports.push(Report::Search(Box::new(search))),
                Some(Message::Bangumi(bangumi)) => reports.push(Report::Bangumi(Box::new(bangumi))),
                Some(Message::Season(season)) => reports.push(Report::Season(Box::new(season.sound()))),
                Some(Message::Live(live)) => reports.push(Report::Live(Box::new(live))),
                Some(Message::History(history)) => reports.push(Report::History(Box::new(history))),
                Some(Message::Favorites(favorites)) => reports.push(Report::Favorites(Box::new(favorites))),
                Some(Message::FavoriteItems(items)) => reports.push(Report::FavoriteItems(Box::new(items))),
                Some(Message::Dynamic(dynamic)) => reports.push(Report::Dynamic(Box::new(dynamic))),
                Some(Message::Space(space)) => reports.push(Report::Space(Box::new(space))),
                Some(Message::Detail(detail)) => reports.push(Report::Detail(Box::new(detail))),
                Some(Message::Like(like)) => reports.push(Report::Like(Box::new(like))),
                Some(Message::Coin(coin)) => reports.push(Report::Coin(Box::new(coin))),
                Some(Message::Favorite(favorite)) => reports.push(Report::Favorite(Box::new(favorite))),
                Some(Message::Failed(failed)) => reports.push(Report::Failed(Box::new(failed.sound()))),
                None => {}
            }
        }
        // Its picture only once the page's own video has data to paint; hidden again as the page loads another
        // (a play navigates, and the page it leaves said it was ready).
        let ready = reports.iter().rev().find_map(|report| match report {
            Report::State(state) => Some(state.ready && state.media.is_some()),
            _ => None,
        });
        if let Some(ready) = ready
            && self.ready.get() != ready
        {
            self.ready.set(ready);
            let _ = self.apply_show();
        }
        let signed_in = reports.iter().rev().find_map(|report| match report {
            Report::State(state) => Some(state.signed_in),
            Report::Account(account) => Some(account.signed_in),
            _ => None,
        });
        if self.confirming.ended(signed_in) {
            reports.push(Report::Confirming(false));
        }
        // What the picture's layer told the app as this call went (its page ready, or not): the app's own handshake.
        reports.append(&mut std::mem::take(&mut *self.pending.borrow_mut()));
        reports
    }

    /// The WebView2 process failure since the last check, if any: which process failed, why, and with what exit
    /// code (`crate::resilience`). A page's process failed: the page is loaded again ([`Bilibili::reload`]); the
    /// browser process: the WebView is gone, and it's started again when it's next needed.
    pub fn failure(&self) -> Option<webview::Failure> {
        self.view.take_failure()
    }

    /// Loads its page again (its process failed), its watch state (the player over the page) and the video's
    /// place kept in the page's own session (`bilibili.js`).
    pub fn recover(&self) -> windows::core::Result<()> {
        self.view.reload()
    }

    /// Takes the WebView off the frame; it closes as it's dropped.
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }
}

/// A message of Bilibili's page (`bilibili.js`).
#[derive(Debug, PartialEq)]
enum Message {
    State(State),
    Account(Account),
    Home(Home),
    Relations(Relations),
    Popular(Popular),
    Ranking(Ranking),
    Search(Search),
    Bangumi(Bangumi),
    Season(Season),
    Live(Live),
    History(History),
    Favorites(Favorites),
    FavoriteItems(FavoriteItems),
    Dynamic(Dynamic),
    Space(Space),
    Detail(Detail),
    Like(Like),
    Coin(Coin),
    Favorite(Favorite),
    Failed(Failed),
}

fn read_message(message: &str) -> Option<Message> {
    let mut value: serde_json::Value = serde_json::from_str(message).ok()?;
    let map = value.as_object_mut()?;
    let mut take = |name: &str| map.remove(name);
    if let Some(state) = take("state") {
        return serde_json::from_value::<State>(state).ok().map(Message::State);
    }
    if let Some(account) = take("account") {
        return serde_json::from_value::<Account>(account).ok().map(Message::Account);
    }
    if let Some(home) = take("home") {
        return serde_json::from_value::<Home>(home).ok().map(Message::Home);
    }
    if let Some(relations) = take("relations") {
        return serde_json::from_value::<Relations>(relations).ok().map(Message::Relations);
    }
    if let Some(popular) = take("popular") {
        return serde_json::from_value::<Popular>(popular).ok().map(Message::Popular);
    }
    if let Some(ranking) = take("ranking") {
        return serde_json::from_value::<Ranking>(ranking).ok().map(Message::Ranking);
    }
    if let Some(search) = take("search") {
        return serde_json::from_value::<Search>(search).ok().map(Message::Search);
    }
    if let Some(bangumi) = take("bangumi") {
        return serde_json::from_value::<Bangumi>(bangumi).ok().map(Message::Bangumi);
    }
    if let Some(season) = take("season") {
        return serde_json::from_value::<Season>(season).ok().map(Message::Season);
    }
    if let Some(live) = take("live") {
        return serde_json::from_value::<Live>(live).ok().map(Message::Live);
    }
    if let Some(history) = take("history") {
        return serde_json::from_value::<History>(history).ok().map(Message::History);
    }
    if let Some(favorites) = take("favorites") {
        return serde_json::from_value::<Favorites>(favorites).ok().map(Message::Favorites);
    }
    if let Some(items) = take("favoriteItems") {
        return serde_json::from_value::<FavoriteItems>(items).ok().map(Message::FavoriteItems);
    }
    if let Some(dynamic) = take("dynamic") {
        return serde_json::from_value::<Dynamic>(dynamic).ok().map(Message::Dynamic);
    }
    if let Some(space) = take("space") {
        return serde_json::from_value::<Space>(space).ok().map(Message::Space);
    }
    if let Some(detail) = take("detail") {
        return serde_json::from_value::<Detail>(detail).ok().map(Message::Detail);
    }
    if let Some(like) = take("like") {
        return serde_json::from_value::<Like>(like).ok().map(Message::Like);
    }
    if let Some(coin) = take("coin") {
        return serde_json::from_value::<Coin>(coin).ok().map(Message::Coin);
    }
    if let Some(favorite) = take("favorite") {
        return serde_json::from_value::<Favorite>(favorite).ok().map(Message::Favorite);
    }
    if let Some(failed) = take("failed") {
        return serde_json::from_value::<Failed>(failed).ok().map(Message::Failed);
    }
    None
}

/// The commands for Bilibili's page, as JSON. A message posted while the page loads goes nowhere, so its last
/// volume, speed, quality, subtitles and pause are kept, and the page that loads again (a play navigates) is told
/// them again as it says it's there.
#[derive(Default)]
struct Outbox {
    ready: bool,
    held: Vec<String>,
    volume: Option<String>,
    rate: Option<String>,
    quality: Option<String>,
    caption: Option<String>,
    crop: Option<String>,
    /// Playing (`Some(true)`) or paused (`Some(false)`) as the app last asked: a page that loads again is told.
    transport: Option<bool>,
}

impl Outbox {
    /// `command` as the message to post now, or `None`: held until the page is there.
    fn send(&mut self, command: &Command) -> Option<String> {
        let message = serde_json::to_string(command).expect("commands serialise");
        match command {
            Command::Volume { .. } => self.volume = Some(message.clone()),
            Command::Rate { .. } => self.rate = Some(message.clone()),
            Command::Quality { .. } => self.quality = Some(message.clone()),
            Command::Caption { .. } => self.caption = Some(message.clone()),
            Command::Crop { .. } => self.crop = Some(message.clone()),
            Command::Resume => self.transport = Some(true),
            Command::Pause => self.transport = Some(false),
            // A play (or its next) is to be playing: the page it loads says play, not the pause left from before
            // (which would leave a new video paused until the app's own play was pressed).
            Command::Play { .. } | Command::Next | Command::Prev => self.transport = Some(true),
            _ => {}
        }
        if self.ready {
            Some(message)
        } else {
            self.held.push(message);
            None
        }
    }

    /// The page says it's there: what to post to it, in order (the first time, what was held; after, the player's
    /// own settings and whether it's to play).
    fn ready(&mut self) -> Vec<String> {
        if std::mem::replace(&mut self.ready, true) {
            let mut owed: Vec<String> = [
                &self.crop,
                &self.volume,
                &self.rate,
                &self.quality,
                &self.caption,
            ]
            .into_iter()
            .flatten()
            .cloned()
            .collect();
            match self.transport {
                Some(true) => owed.push(serde_json::to_string(&Command::Resume).expect("commands serialise")),
                Some(false) => owed.push(serde_json::to_string(&Command::Pause).expect("commands serialise")),
                None => {}
            }
            owed
        } else {
            std::mem::take(&mut self.held)
        }
    }
}

/// A text of the page's kept to a line: its control characters away (they're bilibili.com's words, shown as they
/// are), and cut to `most` characters.
fn plain(text: &mut String, most: usize) {
    text.retain(|character| !character.is_control());
    if let Some((at, _)) = text.char_indices().nth(most) {
        text.truncate(at);
    }
}

/// A picture on Bilibili's own image hosts, as the app shows it (`None`: an address of anyone's, or one that isn't
/// an address at all).
fn image(url: Option<String>) -> Option<String> {
    let url = url?;
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split('/').next().unwrap_or_default();
    let own = [".hdslb.com", ".bilibili.com", ".bilivideo.com", ".biliapi.net"]
        .iter()
        .any(|suffix| host.ends_with(suffix));
    if !own || rest.chars().any(|character| character.is_whitespace() || character.is_control()) {
        return None;
    }
    Some(format!("https://{rest}"))
}

fn finite(value: f64) -> f64 {
    if value.is_finite() { value } else { 0.0 }
}

/// Whether the page's picture may be shown: its own video has data to paint (`ready`), and the app asked for its
/// place (`asked`). Never before: the page's black first frames would be a transparent rectangle over the cab.
fn may_show(ready: bool, asked: bool) -> bool {
    ready && asked
}

/// `{"type":"bilibili","kind":"state","state":{…}}` (`state`: `null` when Bilibili isn't running) for the cabin
/// page (`bilibili` in ui/src/cabin/apps/bilibili). `signingIn`: whether its sign-in window is open (or its sign-in
/// is being confirmed).
pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let state = state.map(|state| {
        let mut value = serde_json::to_value(state).unwrap_or_default();
        value["signingIn"] = signing_in.into();
        value
    });
    serde_json::json!({ "type": "bilibili", "kind": "state", "state": state }).to_string()
}

/// `{"type":"bilibili","kind":"account","account":{…}}`: whether its page is signed in, the account's name and
/// picture, and how many it follows and how many follow it.
pub fn account_message(account: &Account) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "account", "account": account }).to_string()
}

/// `{"type":"bilibili","kind":"home","items":[…],"page":1,"more":true}`: the home feed's recommendations, which page
/// of its stream they are, and whether another page follows.
pub fn home_message(home: &Home) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "home",
        "items": home.items,
        "page": home.page,
        "more": home.more,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"relations","relationKind":"followers","page":1,"items":[…],"more":true}`: the
/// account's followers or the accounts it follows, a page of them.
pub fn relations_message(relations: &Relations) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "relations",
        "relationKind": relations.relation_kind,
        "page": relations.page,
        "items": relations.items,
        "more": relations.more,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"popular","items":[…]}`: Bilibili's popular videos.
pub fn popular_message(popular: &Popular) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "popular", "items": popular.items }).to_string()
}

/// `{"type":"bilibili","kind":"ranking","rid":0,"note":"…","items":[…]}`: its rankings.
pub fn ranking_message(ranking: &Ranking) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "ranking",
        "rid": ranking.rid,
        "note": ranking.note,
        "items": ranking.items,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"search","query":"…","kind":"video","page":1,"total":…,"items":[…],"users":[…]}`:
/// a search's answer.
pub fn search_message(search: &Search) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "search",
        "query": search.query,
        "searchKind": search.kind,
        "page": search.page,
        "total": search.total,
        "items": search.items,
        "users": search.users,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"bangumi","seasonType":1,"page":1,"total":…,"items":[…]}`: the bangumi/film index.
pub fn bangumi_message(bangumi: &Bangumi) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "bangumi",
        "seasonType": bangumi.season_type,
        "page": bangumi.page,
        "total": bangumi.total,
        "items": bangumi.items,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"season","seasonId":…,"title":"…","episodes":[…],"sections":[…]}`: a season's page.
pub fn season_message(season: &Season) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "season",
        "seasonId": season.season_id,
        "title": season.title,
        "cover": season.cover,
        "evaluate": season.evaluate,
        "score": season.score,
        "badge": season.badge,
        "episodes": season.episodes,
        "sections": season.sections,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"live","items":[…]}`: the live rooms Bilibili shows.
pub fn live_message(live: &Live) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "live", "items": live.items }).to_string()
}

/// `{"type":"bilibili","kind":"history","items":[…],"max":…,"viewAt":…}`: the account's history.
pub fn history_message(history: &History) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "history",
        "items": history.items,
        "max": history.max,
        "viewAt": history.view_at,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"favorites","folders":[…]}`: the account's favourite folders.
pub fn favorites_message(favorites: &Favorites) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "favorites", "folders": favorites.folders }).to_string()
}

/// `{"type":"bilibili","kind":"favoriteItems","mediaId":…,"title":"…","items":[…],"hasMore":…}`: a folder's videos.
pub fn favorite_items_message(items: &FavoriteItems) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "favoriteItems",
        "mediaId": items.media_id,
        "title": items.title,
        "items": items.items,
        "hasMore": items.has_more,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"dynamic","items":[…],"offset":"…"}`: the account's following feed.
pub fn dynamic_message(dynamic: &Dynamic) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "dynamic",
        "items": dynamic.items,
        "offset": dynamic.offset,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"space","mid":…,"name":"…","items":[…],"hasMore":…}`: an UP's space.
pub fn space_message(space: &Space) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "space",
        "mid": space.mid,
        "name": space.name,
        "avatar": space.avatar,
        "sign": space.sign,
        "level": space.level,
        "fans": space.fans,
        "videos": space.videos,
        "items": space.items,
        "hasMore": space.has_more,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"detail",…}`: a video's own page, with its parts and the account's own state of it.
pub fn detail_message(detail: &Detail) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "detail",
        "bvid": detail.bvid,
        "aid": detail.aid,
        "cid": detail.cid,
        "title": detail.title,
        "cover": detail.cover,
        "desc": detail.desc,
        "duration": detail.duration,
        "pubdate": detail.pubdate,
        "owner": detail.owner,
        "pages": detail.pages,
        "stat": detail.stat,
        "like": detail.like,
        "coin": detail.coin,
        "favorite": detail.favorite,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"like","bvid":"…","on":…,"ok":…,"reason":""}`: a like asked for, done or not.
pub fn like_message(like: &Like) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "like",
        "bvid": like.bvid,
        "on": like.on,
        "ok": like.ok,
        "reason": like.reason,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"coin","bvid":"…","count":1,"ok":…,"reason":""}`: a coin asked for, done or not.
pub fn coin_message(coin: &Coin) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "coin",
        "bvid": coin.bvid,
        "count": coin.count,
        "ok": coin.ok,
        "reason": coin.reason,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"favorite","bvid":"…","on":…,"ok":…,"reason":""}`: a favourite asked for, done or not.
pub fn favorite_message(favorite: &Favorite) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "favorite",
        "bvid": favorite.bvid,
        "on": favorite.on,
        "ok": favorite.ok,
        "reason": favorite.reason,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"failed","action":"history","code":-101,"message":"…"}`: an interface that refused
/// (signed out, risk control), for the app to say why its list is empty.
pub fn failed_message(failed: &Failed) -> String {
    serde_json::json!({
        "type": "bilibili",
        "kind": "failed",
        "action": failed.action,
        "code": failed.code,
        "message": failed.message,
    })
    .to_string()
}

/// `{"type":"bilibili","kind":"signIn","open":…}`: whether the sign-in window is open.
pub fn sign_in_message(open: bool) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "signIn", "open": open }).to_string()
}

/// `{"type":"bilibili","kind":"showing","on":…}`: whether the picture's layer is really shown (the app's own
/// handshake: `true` only once the page's video is ready to paint, `false` while it loads or navigates, and as it's
/// hidden again).
pub fn showing_message(on: bool) -> String {
    serde_json::json!({ "type": "bilibili", "kind": "showing", "on": on }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_json() -> &'static str {
        r#"{"state":{"signedIn":true,"playing":true,"ready":true,"volume":0.8,"rate":1.25,"time":12.5,"duration":213,
            "media":{"kind":"video","bvid":"BV1GJ411x7h7","aid":80433022,"cid":137649199,"epId":0,"seasonId":0,
                     "roomId":0,"title":"【官方 MV】Never Gonna Give You Up - Rick Astley",
                     "owner":{"mid":486906719,"name":"索尼音乐中国","avatar":"https://i2.hdslb.com/bfs/face/a.jpg"},
                     "cover":"https://i1.hdslb.com/bfs/archive/b.jpg","live":false,"page":1,"pages":1},
            "qualities":[{"qn":80,"label":"1080P"},{"qn":64,"label":"720P"}],"quality":80,
            "qualityLabel":"1080P","captions":[{"id":"ai_sub_1","name":"中文（简体）"}],"caption":"ai_sub_1",
            "cabLevel":[0.5,0.5,0]}}"#
    }

    #[test]
    fn reads_the_pages_state() {
        let message = read_message(state_json()).expect("a state");
        let Message::State(state) = message else { panic!("not a state") };
        assert!(state.signed_in && state.playing);
        assert!(state.ready, "its own video has data to paint");
        assert_eq!(state.volume, 0.8);
        assert_eq!(state.rate, 1.25);
        assert_eq!(state.time, 12.5);
        let media = state.media.expect("what plays");
        assert_eq!(media.bvid, "BV1GJ411x7h7");
        assert_eq!(media.aid, 80433022);
        assert_eq!(media.owner.expect("its UP").name, "索尼音乐中国");
        assert_eq!(state.qualities.len(), 2);
        assert_eq!(state.caption.as_deref(), Some("ai_sub_1"));
    }

    /// Nothing of the page but what can be shown: a video's id that isn't one, a quality out of range, a subtitle
    /// that isn't there, a volume past its ends, and texts of control characters.
    #[test]
    fn passes_on_only_what_can_be_shown() {
        let message = r#"{"state":{"signedIn":true,"playing":false,"volume":9,"rate":0,"time":-4,"duration":3,
            "media":{"kind":"ad","bvid":"evil","title":"a\u0000b","page":1,"pages":1},
            "qualities":[{"qn":999,"label":"x"},{"qn":80,"label":"1080P"}],"quality":80,
            "qualityLabel":"1080P","captions":[{"id":"","name":"x"},{"id":"ok","name":"中文"}],"caption":"gone",
            "cabLevel":[2,-3,5]}}"#;
        let Some(Message::State(state)) = read_message(message) else { panic!("not a state") };
        let state = state.sound();
        // A card whose kind isn't one the app shows is dropped whole (`kind: "ad"` is the home feed's ads).
        assert!(state.media.is_none());
        assert_eq!(state.volume, 1.0);
        assert_eq!(state.rate, 1.0);
        assert_eq!(state.time, 0.0);
        assert_eq!(state.qualities.len(), 1);
        assert_eq!(state.qualities[0].qn, 80);
        assert_eq!(state.captions.len(), 1);
        assert_eq!(state.caption, None, "a caption the page no longer lists");
        assert_eq!(state.cab_level, Some([1.0, 0.0, 0.0]));
    }

    #[test]
    fn reads_an_account_and_keeps_nothing_of_one_signed_out() {
        let Some(Message::Account(account)) = read_message(
            r#"{"account":{"signedIn":true,"uid":486906719,"name":"索尼音乐中国",
                "avatar":"https://i2.hdslb.com/a.jpg","following":84,"follower":1378259}}"#,
        ) else {
            panic!("not an account")
        };
        let account = account.sound();
        assert!(account.signed_in);
        assert_eq!(account.uid, 486906719);
        assert_eq!(account.name, "索尼音乐中国");
        assert!(account.avatar.is_some());
        assert_eq!((account.following, account.follower), (84, 1_378_259));

        let Some(Message::Account(account)) = read_message(
            r#"{"account":{"signedIn":false,"uid":486906719,"name":"someone",
                "avatar":"https://i2.hdslb.com/a.jpg","following":84,"follower":1378259}}"#,
        ) else {
            panic!("not an account")
        };
        let account = account.sound();
        assert_eq!(
            (account.uid, account.name.as_str(), account.avatar, account.following, account.follower),
            (0, "", None, 0, 0)
        );
    }

    #[test]
    fn reads_the_pages_lists() {
        let Some(Message::Home(home)) = read_message(
            r#"{"home":{"items":[{"kind":"video","bvid":"BV1GJ411x7h7","aid":1,"title":"v","duration":213,
                "owner":{"mid":2,"name":"u"},"views":10},
                {"kind":"media","seasonId":47836,"title":"s","score":"9.7","indexShow":"全8话"},
                {"kind":"live","roomId":6,"title":"r","uname":"a","online":100}],"page":2,"more":true}}"#,
        ) else {
            panic!("not a home feed")
        };
        assert_eq!(home.items.len(), 3);
        assert_eq!((home.page, home.more), (2, true));
        assert!(matches!(home.items[0], Item::Video(_)));
        assert!(matches!(home.items[1], Item::Media(_)));
        assert!(matches!(home.items[2], Item::Live(_)));

        // The account's relations: its own ids, names, pictures and signatures, a page of them.
        let Some(Message::Relations(relations)) = read_message(
            r#"{"relations":{"relationKind":"followers","page":1,"more":true,
                "items":[{"uid":216844,"name":"玩偶菌","avatar":"https://i1.hdslb.com/a.jpg","sign":"签名"},
                         {"uid":2,"name":"碧诗","avatar":"https://evil.example/a.jpg","sign":""}]}}"#,
        ) else {
            panic!("not relations")
        };
        let relations = relations.sound();
        assert_eq!((relations.relation_kind.as_str(), relations.page, relations.more), ("followers", 1, true));
        assert_eq!(relations.items[0].uid, 216844);
        assert_eq!(relations.items[0].name, "玩偶菌");
        assert_eq!(relations.items[0].avatar.as_deref(), Some("https://i1.hdslb.com/a.jpg"));
        // A picture of anyone's is dropped; the account stays (its own id and name).
        assert_eq!(relations.items[1].avatar, None);
        assert_eq!(relations.items[1].name, "碧诗");

        let Some(Message::Search(search)) = read_message(
            r#"{"search":{"query":"原神","kind":"video","page":1,"total":1000,
                "items":[{"kind":"video","bvid":"BV1eoyhz6Eak","aid":1,"title":"v"}],
                "users":[{"mid":401742377,"name":"原神","fans":20970125}]}}"#,
        ) else {
            panic!("not a search")
        };
        assert_eq!(search.query, "原神");
        assert_eq!(search.users[0].mid, 401742377);

        let Some(Message::Season(season)) = read_message(
            r#"{"season":{"seasonId":47836,"title":"鬼灭之刃","episodes":[
                {"epId":826497,"cid":1,"title":"第一话","longTitle":null,"badge":"会员"},
                {"epId":826498,"cid":2,"title":"第二话","badge":""}],
                "sections":[{"title":"PV","episodes":[{"epId":2,"title":"预告","badge":"会员"}]}]}}"#,
        ) else {
            panic!("not a season")
        };
        assert_eq!(season.episodes[0].ep_id, 826497);
        // Its own badge, as the site words it: "会员" where its members' alone, empty where free.
        assert_eq!((season.episodes[0].badge.as_str(), season.episodes[1].badge.as_str()), ("会员", ""));
        assert_eq!(season.sections[0].episodes[0].badge, "会员");

        let Some(Message::History(history)) = read_message(
            r#"{"history":{"items":[{"bvid":"BV1GJ411x7h7","title":"v","duration":213,"progress":61}],"max":1,"viewAt":2}}"#,
        ) else {
            panic!("not a history")
        };
        assert_eq!(history.items[0].progress, 61);

        let Some(Message::Favorites(favorites)) = read_message(
            r#"{"favorites":{"folders":[{"id":4026748432,"title":"默认收藏夹","count":9}]}}"#,
        ) else {
            panic!("not favourites")
        };
        assert_eq!(favorites.folders[0].count, 9);

        let Some(Message::FavoriteItems(items)) = read_message(
            r#"{"favoriteItems":{"mediaId":1,"title":"默认收藏夹","hasMore":true,
                "items":[{"kind":"video","bvid":"BV1GJ411x7h7","title":"v"}]}}"#,
        ) else {
            panic!("not a folder")
        };
        assert!(items.has_more);

        let Some(Message::Space(space)) = read_message(
            r#"{"space":{"mid":2,"name":"碧诗","fans":100,"videos":8,"hasMore":false,
                "items":[{"kind":"video","bvid":"BV1ujNV6qEXg","title":"帮不帮？"}]}}"#,
        ) else {
            panic!("not a space")
        };
        assert_eq!(space.mid, 2);
        assert_eq!(space.items.len(), 1);

        let Some(Message::Detail(detail)) = read_message(
            r#"{"detail":{"bvid":"BV1GJ411x7h7","aid":80433022,"cid":137649199,"title":"v",
                "pages":[{"cid":137649199,"page":1,"title":"P1","duration":213}],
                "stat":{"views":1,"likes":2,"coins":3,"favorites":4,"danmaku":5},"like":true,"coin":2,"favorite":false}}"#,
        ) else {
            panic!("not a detail")
        };
        assert_eq!(detail.pages[0].cid, 137649199);
        assert_eq!(detail.stat.likes, 2);
        assert_eq!((detail.like, detail.coin, detail.favorite), (Some(true), Some(2), Some(false)));

        let Some(Message::Failed(failed)) = read_message(
            r#"{"failed":{"action":"history","code":-101,"message":"账号未登录"}}"#,
        ) else {
            panic!("not a failure")
        };
        assert_eq!(failed.code, -101);
        assert_eq!(failed.action, "history");
    }

    /// A season's page keeps only what can be shown: its episodes' badges (the free ones' empty, its members'
    /// "会员"), their texts cut, their pictures on Bilibili's own hosts, and no episode without an id.
    #[test]
    fn passes_on_what_can_be_shown_of_a_season() {
        let Some(Message::Season(season)) = read_message(
            r#"{"season":{"seasonId":33415,"title":"名侦探柯南（中配）\u0000","evaluate":"x","score":"8.8",
                "badge":"大会员","cover":"https://evil.example/a.jpg",
                "episodes":[
                  {"epId":323085,"cid":184593713,"bvid":"BV1wi4y1b7rM","title":"云霄飞车杀人事件",
                   "indexTitle":"1","duration":1494,"badge":""},
                  {"epId":7835631,"cid":43597695671,"bvid":"not an id","title":"x","duration":-1,
                   "badge":"会员\u0001\u0002 and very much longer than twenty characters"},
                  {"epId":0,"cid":0,"title":"no id"}],
                "sections":[{"title":"SP","episodes":[
                  {"epId":8014874,"cid":43794368995,"title":"预告","badge":"会员"}]}]}}"#,
        ) else {
            panic!("not a season")
        };
        let season = season.sound();
        assert_eq!(season.title, "名侦探柯南（中配）");
        assert!(season.cover.is_none(), "a picture of anyone's is dropped");
        assert_eq!(season.episodes.len(), 2, "the one with no id is dropped");
        assert_eq!(season.episodes[0].badge, "", "free: an empty badge");
        assert!(season.episodes[1].badge.starts_with("会员"), "its members' alone: {}", season.episodes[1].badge);
        assert!(season.episodes[1].badge.chars().count() <= 20);
        assert_eq!(season.episodes[1].bvid, "", "not a video's id");
        assert_eq!(season.episodes[1].duration, 0.0);
        assert_eq!(season.sections[0].episodes[0].badge, "会员");
    }

    #[test]
    fn reads_the_actions_answers() {
        let Some(Message::Like(like)) = read_message(r#"{"like":{"bvid":"BV1GJ411x7h7","on":true,"ok":true,"reason":""}}"#)
        else {
            panic!("not a like")
        };
        assert!(like.ok);
        let Some(Message::Coin(coin)) =
            read_message(r#"{"coin":{"bvid":"BV1GJ411x7h7","count":2,"ok":false,"reason":"already"}}"#)
        else {
            panic!("not a coin")
        };
        assert_eq!(coin.count, 2);
        assert!(!coin.ok);
        let Some(Message::Favorite(favorite)) =
            read_message(r#"{"favorite":{"bvid":"BV1GJ411x7h7","on":true,"ok":true,"reason":""}}"#)
        else {
            panic!("not a favourite")
        };
        assert!(favorite.on);
    }

    #[test]
    fn reads_the_pages_commands() {
        let read = |text: &str| serde_json::from_str::<Command>(text).ok();
        assert_eq!(read(r#"{"action":"home"}"#), Some(Command::Home { page: None, fresh: None }));
        assert_eq!(
            read(r#"{"action":"home","page":3,"fresh":true}"#),
            Some(Command::Home { page: Some(3), fresh: Some(true) })
        );
        assert_eq!(
            read(r#"{"action":"relations","kind":"followers","page":2}"#),
            Some(Command::Relations { kind: RelationKind::Followers, page: Some(2) })
        );
        assert_eq!(
            read(r#"{"action":"relations","kind":"following"}"#),
            Some(Command::Relations { kind: RelationKind::Following, page: None })
        );
        assert_eq!(
            read(r#"{"action":"play","value":"BV1GJ411x7h7","kind":"video","page":2}"#),
            Some(Command::Play { value: "BV1GJ411x7h7".into(), kind: Some(PlayKind::Video), page: Some(2) })
        );
        assert_eq!(
            read(r#"{"action":"search","value":"原神","kind":"bangumi"}"#),
            Some(Command::Search { value: "原神".into(), kind: Some(SearchKind::Bangumi), page: None })
        );
        assert_eq!(read(r#"{"action":"seek","value":61.5}"#), Some(Command::Seek { value: 61.5 }));
        assert_eq!(
            read(r#"{"action":"like","value":"BV1GJ411x7h7","on":true}"#),
            Some(Command::Like { value: "BV1GJ411x7h7".into(), on: true })
        );
        assert_eq!(
            read(r#"{"action":"coin","value":"BV1GJ411x7h7","count":2}"#),
            Some(Command::Coin { value: "BV1GJ411x7h7".into(), count: Some(2), like: None })
        );
        assert_eq!(
            read(r#"{"action":"favorite","value":"BV1GJ411x7h7","add":true,"mediaId":4026748432}"#),
            Some(Command::Favorite { value: "BV1GJ411x7h7".into(), add: Some(true), media_id: Some(4026748432) })
        );
        assert_eq!(
            read(r#"{"action":"show","x":0,"y":0,"width":1280,"height":720}"#),
            Some(Command::Show { x: 0.0, y: 0.0, width: 1280, height: 720, crop: false })
        );
        // A command of the app's it doesn't have: nothing.
        assert_eq!(read(r#"{"action":"nonsense"}"#), None);
        // What plays' next (or previous), as the dashboard's own buttons ask it.
        assert_eq!(read(r#"{"action":"next"}"#), Some(Command::Next));
        assert_eq!(read(r#"{"action":"prev"}"#), Some(Command::Prev));
    }

    /// Only Bilibili's own ids and words go into its page: what isn't one is dropped before it's sent.
    #[test]
    fn sends_on_only_sound_commands() {
        let sound = |text: &str| serde_json::from_str::<Command>(text).ok().is_some_and(|command| command.is_sound());
        assert!(sound(r#"{"action":"play","value":"BV1GJ411x7h7"}"#));
        assert!(sound(r#"{"action":"play","value":"av80433022"}"#));
        assert!(sound(r#"{"action":"play","value":"ep826497","kind":"bangumi"}"#));
        assert!(sound(r#"{"action":"play","value":"6","kind":"live"}"#));
        assert!(sound(r#"{"action":"detail","value":"BV1eoyhz6Eak"}"#));
        assert!(sound(r#"{"action":"space","value":"2"}"#));
        assert!(sound(r#"{"action":"favoriteItems","value":"4026748432"}"#));
        assert!(sound(r#"{"action":"search","value":"原神"}"#));
        assert!(sound(r#"{"action":"home","page":2,"fresh":false}"#));
        assert!(sound(r#"{"action":"relations","kind":"following","page":1}"#));
        assert!(sound(r#"{"action":"ranking","rid":1}"#));
        assert!(sound(r#"{"action":"volume","value":0.5}"#));
        assert!(sound(r#"{"action":"rate","value":1.5}"#));
        assert!(sound(r#"{"action":"quality","value":80}"#));
        assert!(sound(r#"{"action":"caption","track":"ai_sub_1"}"#));
        assert!(sound(r#"{"action":"next"}"#));
        assert!(sound(r#"{"action":"prev"}"#));
        // Not its ids: a made-up video, a search past a sentence, a place past the ends, a speed past the player's.
        assert!(!sound(r#"{"action":"play","value":"https://evil.example/"}"#));
        assert!(!sound(r#"{"action":"play","value":"BV1"}"#));
        assert!(!sound(r#"{"action":"play","value":"../etc"}"#));
        assert!(!sound(r#"{"action":"detail","value":"not an id"}"#));
        assert!(!sound(r#"{"action":"space","value":"2; DROP"}"#));
        assert!(!sound(r#"{"action":"search","value":""}"#));
        assert!(!sound(r#"{"action":"home","page":0}"#));
        assert!(!sound(r#"{"action":"home","page":1001}"#));
        assert!(!sound(r#"{"action":"relations","kind":"followers","page":0}"#));
        assert!(!sound(r#"{"action":"relations","kind":"strangers"}"#));
        assert!(!sound(&format!(r#"{{"action":"search","value":"{}"}}"#, "字".repeat(61))));
        assert!(!sound(r#"{"action":"volume","value":1.5}"#));
        assert!(!sound(r#"{"action":"volume","value":-0.1}"#));
        assert!(!sound(r#"{"action":"rate","value":0}"#));
        assert!(!sound(r#"{"action":"quality","value":200}"#));
        assert!(!sound(r#"{"action":"coin","value":"BV1GJ411x7h7","count":3}"#));
        // The host's own, never the page's.
        assert!(!sound(r#"{"action":"start"}"#));
        assert!(!sound(r#"{"action":"signIn"}"#));
        assert!(!sound(r#"{"action":"close"}"#));
    }

    /// A page that reloads gets its player's settings again: its volume, its speed and its tone, and whether it
    /// was to be paused. A play itself isn't replayed (it navigated).
    #[test]
    fn holds_the_pages_settings_for_a_page_that_reloads() {
        let outbox = std::cell::RefCell::new(Outbox::default());
        let send = |text: &str| {
            let command: Command = serde_json::from_str(text).expect("a command");
            outbox.borrow_mut().send(&command)
        };
        // Nothing is posted before the page is there.
        assert_eq!(send(r#"{"action":"pause"}"#), None);
        assert_eq!(send(r#"{"action":"volume","value":0.5}"#), None);
        assert_eq!(send(r#"{"action":"play","value":"BV1GJ411x7h7"}"#), None);
        let first = outbox.borrow_mut().ready();
        assert_eq!(first.len(), 3, "what was held, in order: {first:?}");
        assert!(first.iter().any(|message| message.contains(r#""action":"play""#)));
        assert!(first.iter().any(|message| message.contains(r#""action":"volume""#)));
        assert!(first.iter().any(|message| message.contains(r#""action":"pause""#)));
        // The page reloaded (a play navigated): its settings again, and to play (the play was the last thing asked;
        // the pause before it isn't the app's intent any more), never the play itself again.
        let again = outbox.borrow_mut().ready();
        assert!(again.iter().any(|message| message.contains(r#""action":"volume""#)));
        assert!(again.iter().any(|message| message.contains(r#""action":"resume""#)));
        assert!(!again.iter().any(|message| message.contains(r#""action":"pause""#)));
        assert!(!again.iter().any(|message| message.contains(r#""action":"play""#)));
        // Hiding the picture leaves nothing to pause it with (it plays on, hidden).
        let command: Command = serde_json::from_str(r#"{"action":"hide"}"#).expect("hide");
        assert_eq!(outbox.borrow_mut().send(&command), Some(r#"{"action":"hide"}"#.to_owned()));
    }

    /// A dashboard button pressed while the page loads: the pause (or the play) is held until the page is there,
    /// in the order pressed, and the page that loads again is told which one was last asked for.
    #[test]
    fn keeps_whether_the_page_is_to_play_while_it_loads() {
        let outbox = std::cell::RefCell::new(Outbox::default());
        let send = |text: &str| {
            let command: Command = serde_json::from_str(text).expect("a command");
            outbox.borrow_mut().send(&command)
        };
        // A pause, a play and a pause while it loads: nothing posted yet.
        assert_eq!(send(r#"{"action":"pause"}"#), None);
        assert_eq!(send(r#"{"action":"resume"}"#), None);
        assert_eq!(send(r#"{"action":"pause"}"#), None);
        let first = outbox.borrow_mut().ready();
        assert_eq!(first.len(), 3, "what was held, in order: {first:?}");
        assert_eq!(
            first.iter().filter(|message| message.contains(r#""action":"pause""#)).count(),
            2,
            "both pauses kept, in their order: {first:?}"
        );
        assert!(first.iter().any(|message| message.contains(r#""action":"resume""#)));
        // The page reloaded: only the last one (paused), never the pair again.
        let again = outbox.borrow_mut().ready();
        assert_eq!(again.len(), 1, "its transport alone: {again:?}");
        assert!(again[0].contains(r#""action":"pause""#));
        // Asked to play again: a page that loads again after it is told to play.
        assert_eq!(send(r#"{"action":"resume"}"#), Some(r#"{"action":"resume"}"#.to_owned()));
        let again = outbox.borrow_mut().ready();
        assert_eq!(again.len(), 1);
        assert!(again[0].contains(r#""action":"resume""#));
    }

    /// The picture is shown only once the page's own video has data to paint, and the app asked for its place.
    #[test]
    fn shows_the_picture_only_once_the_pages_video_is_ready() {
        assert!(!may_show(false, false));
        assert!(!may_show(false, true), "a black first frame is never shown");
        assert!(!may_show(true, false), "nothing was asked for");
        assert!(may_show(true, true));
    }

    /// The app's handshake: only what changed is told (`showing`), once.
    #[test]
    fn tells_the_picture_layer_change_once() {
        let mut showing = Showing::default();
        assert_eq!(showing.set(false), Some(false), "never told: the hidden layer is said once");
        assert_eq!(showing.set(false), None);
        assert_eq!(showing.set(true), Some(true));
        assert_eq!(showing.set(true), None);
        assert_eq!(showing.set(false), Some(false));
        let value: serde_json::Value = serde_json::from_str(&showing_message(true)).expect("a message");
        assert_eq!((value["type"].as_str(), value["kind"].as_str(), value["on"].as_bool()),
            (Some("bilibili"), Some("showing"), Some(true)));
        let hidden: serde_json::Value = serde_json::from_str(&showing_message(false)).expect("a message");
        assert_eq!(hidden["on"].as_bool(), Some(false));
    }

    /// A play (or its next) after a pause: the page it loads is told to play, not the pause left from before (which
    /// would leave the new video paused until the app's play was pressed).
    #[test]
    fn a_play_clears_the_pause_left_with_the_page() {
        let outbox = std::cell::RefCell::new(Outbox::default());
        let send = |text: &str| {
            let command: Command = serde_json::from_str(text).expect("a command");
            outbox.borrow_mut().send(&command)
        };
        // The page is there, and the app pauses it.
        outbox.borrow_mut().ready();
        assert_eq!(send(r#"{"action":"pause"}"#), Some(r#"{"action":"pause"}"#.to_owned()));
        // A play: its own page says so, and the page it loads is told to play.
        assert!(
            send(r#"{"action":"play","value":"BV1GJ411x7h7"}"#)
                .is_some_and(|message| message.contains(r#""action":"play""#)),
            "the play itself goes to the page it navigates"
        );
        let owed = outbox.borrow_mut().ready();
        assert!(owed.iter().any(|message| message.contains(r#""action":"resume""#)), "plays: {owed:?}");
        assert!(!owed.iter().any(|message| message.contains(r#""action":"pause""#)), "not paused: {owed:?}");
        // The same for a next: the next page is to play.
        assert_eq!(send(r#"{"action":"pause"}"#), Some(r#"{"action":"pause"}"#.to_owned()));
        outbox.borrow_mut().send(&serde_json::from_str(r#"{"action":"next"}"#).expect("next"));
        let owed = outbox.borrow_mut().ready();
        assert!(owed.iter().any(|message| message.contains(r#""action":"resume""#)));
        assert!(!owed.iter().any(|message| message.contains(r#""action":"pause""#)));
    }

    #[test]
    fn serialises_the_apps_messages() {
        let state = serde_json::from_str::<State>(&serde_json::to_value(read_state()).unwrap().to_string());
        let _ = state.expect("a state");
        let message = state_message(Some(&read_state()), true);
        let value: serde_json::Value = serde_json::from_str(&message).expect("a message");
        assert_eq!(value["type"], "bilibili");
        assert_eq!(value["kind"], "state");
        assert_eq!(value["state"]["signingIn"], true);
        assert_eq!(value["state"]["media"]["bvid"], "BV1GJ411x7h7");
        // Nothing running: `null`.
        let idle: serde_json::Value = serde_json::from_str(&state_message(None, false)).expect("a message");
        assert!(idle["state"].is_null());

        let account: serde_json::Value = serde_json::from_str(&account_message(&Account {
            signed_in: true,
            uid: 2,
            name: "碧诗".into(),
            avatar: None,
            following: 84,
            follower: 1_378_259,
        }))
        .expect("a message");
        assert_eq!((account["kind"].as_str(), account["account"]["name"].as_str()), (Some("account"), Some("碧诗")));
        assert_eq!((account["account"]["following"].as_u64(), account["account"]["follower"].as_u64()), (Some(84), Some(1_378_259)));

        let home = Home {
            items: vec![
                Item::Video(Video {
                    bvid: "BV1GJ411x7h7".into(),
                    aid: 80433022,
                    cid: 0,
                    title: "v".into(),
                    cover: None,
                    duration: 213.0,
                    owner: None,
                    views: 1,
                    likes: 2,
                    pubdate: 3,
                }),
                // The banner's own candidate: a season, its score, its badge and its following.
                Item::Media(Media {
                    season_id: 33415,
                    media_id: 28228813,
                    ep_id: 323085,
                    title: "名侦探柯南（中配）".into(),
                    cover: Some("https://i0.hdslb.com/bfs/bangumi/a.png".into()),
                    score: "8.8".into(),
                    index_show: "更新至第1281话".into(),
                    badge: "大会员".into(),
                    season_type: 1,
                    url: "https://www.bilibili.com/bangumi/play/ss33415".into(),
                    followers: "1770.1万追番".into(),
                }),
            ],
            page: 2,
            more: true,
        };
        let value: serde_json::Value = serde_json::from_str(&home_message(&home)).expect("a message");
        assert_eq!(value["kind"], "home");
        assert_eq!((value["page"].as_u64(), value["more"].as_bool()), (Some(2), Some(true)));
        assert_eq!(value["items"][1]["kind"], "media");
        assert_eq!(
            (
                value["items"][1]["score"].as_str(),
                value["items"][1]["badge"].as_str(),
                value["items"][1]["followers"].as_str(),
            ),
            (Some("8.8"), Some("大会员"), Some("1770.1万追番"))
        );
        assert_eq!(value["items"][0]["kind"], "video");
        assert_eq!(value["items"][0]["bvid"], "BV1GJ411x7h7");

        let season = Season {
            season_id: 33415,
            title: "名侦探柯南（中配）".into(),
            cover: None,
            evaluate: "…".into(),
            score: "8.8".into(),
            badge: "大会员".into(),
            episodes: vec![
                Episode {
                    ep_id: 7835631,
                    cid: 43597695671,
                    bvid: String::new(),
                    title: "女生聚会疑案5（上集）".into(),
                    index_title: "1280".into(),
                    cover: None,
                    duration: 1489.0,
                    badge: "会员".into(),
                },
                Episode {
                    ep_id: 323085,
                    cid: 184593713,
                    bvid: "BV1wi4y1b7rM".into(),
                    title: "云霄飞车杀人事件".into(),
                    index_title: "1".into(),
                    cover: None,
                    duration: 1494.0,
                    badge: String::new(),
                },
            ],
            sections: vec![],
        };
        let value: serde_json::Value = serde_json::from_str(&season_message(&season)).expect("a message");
        assert_eq!(value["kind"], "season");
        // Each episode's own badge, as the app's 选集 shows it: "会员" where its members' alone, empty where free.
        assert_eq!(
            (value["episodes"][0]["badge"].as_str(), value["episodes"][1]["badge"].as_str()),
            (Some("会员"), Some(""))
        );
        assert_eq!(value["episodes"][0]["duration"].as_f64(), Some(1489.0));

        let relations = Relations {
            relation_kind: "following".into(),
            page: 3,
            items: vec![RelationUser { uid: 216844, name: "玩偶菌".into(), avatar: None, sign: String::new() }],
            more: false,
        };
        let value: serde_json::Value = serde_json::from_str(&relations_message(&relations)).expect("a message");
        assert_eq!((value["kind"].as_str(), value["relationKind"].as_str()), (Some("relations"), Some("following")));
        assert_eq!((value["page"].as_u64(), value["items"][0]["uid"].as_u64()), (Some(3), Some(216844)));

        let search = Search {
            query: "原神".into(),
            kind: "video".into(),
            page: 1,
            total: 1000,
            items: vec![],
            users: vec![UserCard { mid: 401742377, name: "原神".into(), avatar: None, sign: String::new(), fans: 1, videos: 2 }],
        };
        let value: serde_json::Value = serde_json::from_str(&search_message(&search)).expect("a message");
        assert_eq!((value["kind"].as_str(), value["searchKind"].as_str()), (Some("search"), Some("video")));
        assert_eq!(value["users"][0]["mid"], 401742377);

        let failed = Failed { action: "history".into(), code: -101, message: "账号未登录".into() };
        let value: serde_json::Value = serde_json::from_str(&failed_message(&failed)).expect("a message");
        assert_eq!((value["kind"].as_str(), value["code"].as_i64()), (Some("failed"), Some(-101)));

        let like = Like { bvid: "BV1GJ411x7h7".into(), on: true, ok: true, reason: String::new() };
        let value: serde_json::Value = serde_json::from_str(&like_message(&like)).expect("a message");
        assert_eq!((value["kind"].as_str(), value["on"].as_bool()), (Some("like"), Some(true)));

        let coin = Coin { bvid: "BV1GJ411x7h7".into(), count: 2, ok: false, reason: "already".into() };
        let value: serde_json::Value = serde_json::from_str(&coin_message(&coin)).expect("a message");
        assert_eq!((value["kind"].as_str(), value["count"].as_u64()), (Some("coin"), Some(2)));

        let favorite = Favorite { bvid: "BV1GJ411x7h7".into(), on: true, ok: true, reason: String::new() };
        let value: serde_json::Value = serde_json::from_str(&favorite_message(&favorite)).expect("a message");
        assert_eq!(value["kind"], "favorite");

        let sign_in: serde_json::Value = serde_json::from_str(&sign_in_message(true)).expect("a message");
        assert_eq!((sign_in["kind"].as_str(), sign_in["open"].as_bool()), (Some("signIn"), Some(true)));
    }

    fn read_state() -> State {
        let Some(Message::State(state)) = read_message(state_json()) else { panic!("a state") };
        state
    }

    /// The sign-in is Bilibili's own passport page, whose QR code opens at once, and its own page says when the
    /// account is in: its address doesn't change before it does.
    #[test]
    fn signs_in_on_bilibilis_own_passport_page() {
        assert_eq!(signin::BILIBILI.sign_in, "https://passport.bilibili.com/login");
        assert_eq!(signin::BILIBILI.home, HOME);
        assert!(signin::BILIBILI.page_says.is_some(), "its page says when signed in");
        assert!(signin::BILIBILI.page_says.is_some_and(|script| script.contains("DedeUserID")));
    }

    /// Bilibili's own ids, as the app sends them: a video's (`BV…`, `av…`), a bangumi's (`ep…`, `ss…`), a number.
    #[test]
    fn knows_bilibilis_own_ids() {
        assert!(is_video_id("BV1GJ411x7h7"));
        assert!(is_video_id("BV1eoyhz6Eak"));
        assert!(is_video_id("av80433022"));
        assert!(is_video_id("80433022"));
        assert!(!is_video_id("BV1"));
        assert!(!is_video_id("BV1GJ411x7h7/../../evil"));
        assert!(!is_video_id(""));
        assert!(is_bangumi_id("ep826497"));
        assert!(is_bangumi_id("ss47836"));
        assert!(is_bangumi_id("47836"));
        assert!(!is_bangumi_id("ep"));
        assert!(!is_bangumi_id("ep-1"));
        assert!(is_number("6"));
        assert!(!is_number("6.5"));
        assert!(!is_number("6/evil"));
        assert!(is_token("2-1_0%3D"));
        assert!(!is_token("a b"));
    }
}
