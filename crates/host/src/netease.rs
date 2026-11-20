//! NetEase Cloud Music (网易云音乐): its own web player (music.163.com), in a WebView of its own, hidden under the
//! cabin page. The NetEase app the player sees is WestPlay's own (ui/src/cabin/apps/netease); the web player plays,
//! under its own account and quality, and answers the app with what its page says, from a script in it
//! (`netease.js`): its player's state read from its own play bar, and every reading of the account from the page's
//! own same-origin interface (`fetch('/api/…')`, its session's own cookies) — Home's day and shelves, the account's
//! playlists, NetEase's rankings and its own profile, a playlist's and a ranking's songs, a search, an artist's page,
//! the recent songs and the heart.
//!
//! The page is a shell of its own (`https://music.163.com/`) with the player at the bottom and the content in a frame
//! of the same origin (`#g_iframe`, on `https://music.163.com/discover`). v3 reads nothing of that frame but one row a
//! rescue plays from: no page is navigated for data (navigating rebuilds the player and loses its queue), and playing
//! is the page's own player's way, watched from the first moment and rescued at 1.2 s / 2.5 s / 4 s (`netease.js`).
//!
//! Signing in is NetEase's own QR code dialog, on its page, in a window on the PC's desktop (`signin.rs`), on this
//! WebView's profile (one of its own: signing out forgets NetEase's cookies alone); signed in there, the web player
//! here loads again, signed in (`netease_sign_in.js` says so, and the page's top bar then shows the account). Nothing
//! of the account passes through WestPlay: the page's session stays in the page; what comes out is what the app shows
//! (names, covers, what plays), only the fields below (anything else the page might say is dropped here), and whether
//! it's signed in. Nothing of it is kept or logged.
//!
//! Its sound comes from the truck's own speakers, as Spotify's does (`cab_sound.js`, told the truck's speakers, the
//! driver's head and the camera). The page's own audio element is the sound's source, as its page makes it.
//!
//! The app's protocol is its own (`netease` in ui/src/shared/host.ts), not Spotify's: messages are
//! `{"type":"netease","kind":"state",…}`, `{"type":"netease","kind":"playlist",…}`, `{"type":"netease","kind":"home",…}`,
//! `{"type":"netease","kind":"library",…}`, `{"type":"netease","kind":"search",…}`,
//! `{"type":"netease","kind":"artist",…}`, `{"type":"netease","kind":"recent",…}`,
//! `{"type":"netease","kind":"rankings",…}`, `{"type":"netease","kind":"profile",…}`,
//! `{"type":"netease","kind":"like",…}` and `{"type":"netease","kind":"lyric",…}` to the cabin page, and
//! `{"type":"netease","kind":"command","command":{…}}` from it (see [`Command`]). The whole protocol is written down in
//! notes/netease-v3-protocol.md.

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
    /// Play on, or a song (`value`: its NetEase id) — the page's own player's way (as its own links play a song),
    /// watched for its sound and rescued at once if it doesn't come. `list`: the list it's from, when the app knows
    /// it (a playlist's or a ranking's id, `daily`, `recent`, `search`, `artist:<id>`): the page then plays it in its
    /// own queue, so a switch is the page's own and near instant.
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        list: Option<String>,
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
    /// Its play mode's next one (列表循环 -> 随机 -> 单曲循环 -> 列表循环), as its own button presses it.
    CycleMode,
    /// Its volume for a fade (musicWithGame.ts, fade.ts): the sound's level alone, never the app's own choice of it.
    /// A fade out that set the player's volume would leave it silent if the player was left mid-fade, the app's
    /// volume as it was (`None` when it was never set).
    VolumeFade {
        value: f64,
    },
    /// A playlist's page (`value`: its NetEase id), whose songs the page answers with (`kind: "playlist"`).
    OpenPlaylist {
        value: String,
    },
    /// One of NetEase's rankings (`value`: its id, the playlist's own), whose own head and songs the page answers with
    /// (`kind: "playlist"`, `id`: the same).
    OpenRanking {
        value: String,
    },
    /// An artist's songs from `offset` on (their id; 200 a page), answered with (`kind: "artistSongs"`).
    ArtistSongs {
        value: String,
        #[serde(default)]
        offset: u32,
    },
    /// An artist's albums from `offset` on (their id; 60 a page), answered with (`kind: "artistAlbums"`).
    ArtistAlbums {
        value: String,
        #[serde(default)]
        offset: u32,
    },
    /// An artist's page (`value`: their NetEase id), whose name, picture and songs the page answers with
    /// (`kind: "artist"`).
    OpenArtist {
        value: String,
    },
    /// A song added to or taken from the account's 我喜欢的音乐 (`value`: the song's id; `liked`: whether it's to be
    /// liked), the page answering with `kind: "like"` once its own interface says so.
    SetLike {
        value: String,
        liked: bool,
    },
    /// Home: the account's cards and the day's own songs, answered with (`kind: "home"`).
    Home,
    /// The account's own playlists, by group (创建的歌单, 收藏的歌单), answered with (`kind: "library"`).
    Library,
    /// The page's own search of these words, whose songs it answers with (`kind: "search"`).
    Search {
        value: String,
    },
    /// The account's recent songs, answered with (`kind: "recent"`).
    Recent,
    /// NetEase's own rankings list, answered with (`kind: "rankings"`).
    Rankings,
    /// The account's own profile, answered with (`kind: "profile"`).
    Profile,
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
    /// The first artist's NetEase id, when the page gave a real one (the app opens their page from the playing
    /// song); left out otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_id: Option<String>,
    /// Each of its artists, with their own id (`None`: the answer gave none).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<ArtistRef>>,
    /// The song's album, when its answer said one (a playlist's songs, the recent ones, a search's).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub album: String,
    #[serde(default, deserialize_with = "some_f64")]
    pub duration: f64,
    #[serde(default)]
    pub playable: bool,
    /// How many times the account played it, when its list says (the recent songs: 本周播放). Zeo left out.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub play_count: u64,
}

impl Song {
    /// The song cleaned: its words as the app shows them (short), its times real, its own count sane, and only an
    /// artist id that's NetEase's own (digits).
    fn checked(mut self) -> Self {
        self.title = short(self.title, 300);
        self.artist = short(self.artist, 300);
        self.artist_id = self.artist_id.filter(|id| is_id(id));
        self.artists = self.artists.map(|artists| {
            artists
                .into_iter()
                .filter(|artist| is_id(&artist.id))
                .map(|artist| ArtistRef { id: artist.id, name: short(artist.name, 120) })
                .take(8)
                .collect::<Vec<_>>()
        });
        self.album = short(self.album, 300);
        self.duration = finite(self.duration);
        self.play_count = self.play_count.min(1_000_000);
        self
    }
}

/// One of an artist's albums, as their page lists them: its id, name, cover, its year and how many songs.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(default)]
    pub size: u32,
}

/// An artist's songs from `offset` on (their page of them), the page's answer to the app's `artistSongs`: what the
/// app's 全部歌曲 list shows, a page at a time.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistSongs {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub songs: Vec<Song>,
    /// Whether there are more after these (`false`: the list's end).
    #[serde(default)]
    pub more: bool,
}

/// An artist's albums from `offset` on, the page's answer to the app's `artistAlbums`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAlbums {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub albums: Vec<Album>,
    #[serde(default)]
    pub more: bool,
}

impl ArtistSongs {
    /// The answer cleaned: their id, their songs as a playlist's (at most 500 a page), the offset as asked.
    fn checked(mut self) -> Self {
        const MOST: usize = 500;
        self.id = if is_id(&self.id) { self.id } else { String::new() };
        self.songs = checked_songs(self.songs, MOST);
        if self.songs.is_empty() {
            self.more = false;
        }
        self
    }
}

impl ArtistAlbums {
    /// The answer cleaned: their id, only albums with an id and a name, a cover on NetEase's own image hosts, their
    /// year sane, at most 200 of them.
    fn checked(mut self) -> Self {
        const MOST: usize = 200;
        self.id = if is_id(&self.id) { self.id } else { String::new() };
        self.albums = self
            .albums
            .into_iter()
            .filter(|album| is_id(&album.id) && !album.name.is_empty())
            .map(|mut album| {
                album.name = short(album.name, 200);
                album.cover = album.cover.filter(|cover| is_net_ease_image(cover));
                album.year = album.year.filter(|year| (1900..=2200).contains(year));
                album.size = album.size.min(1000);
                album
            })
            .take(MOST)
            .collect();
        if self.albums.is_empty() {
            self.more = false;
        }
        self
    }
}

/// A playlist's (or a ranking's) songs: the page's answer to the app's `openPlaylist` / `openRanking`. Its own head
/// (cover, play count, update frequency, who made it, what it says of itself) is v3's, and left out when the page gave
/// none of it (a v2 answer is a v2 answer still).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Songs {
    /// The playlist's NetEase id (a ranking's own), as asked.
    pub id: String,
    /// Its name, as its page shows it (the app shows it as the playlist's title at once).
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub play_count: u64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub track_count: u64,
    /// How often a ranking updates, in NetEase's own words ("每天更新"); empty for a plain playlist.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub update_frequency: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub creator: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default)]
    pub songs: Vec<Song>,
}

impl Songs {
    /// The answer cleaned: only songs the app can show and ask to play (a NetEase id, a name), no duplicate, and not
    /// more than [`Songs::MOST`] of them (a list of thousands would hold up the page), its own head as short as the
    /// app shows it, its cover only on NetEase's own image hosts.
    fn checked(mut self) -> Self {
        const MOST: usize = 3000;
        self.name = short(self.name, 200);
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        self.update_frequency = short(self.update_frequency, 40);
        self.creator = short(self.creator, 60);
        self.description = short(self.description, 400);
        self.songs = checked_songs(self.songs, MOST);
        self
    }
}

/// The page's songs cleaned: only songs the app can show and ask to play (a NetEase id, a name), no duplicate, and
/// not more than `most` of them (a list of thousands would hold up the page).
fn checked_songs(songs: Vec<Song>, most: usize) -> Vec<Song> {
    let mut known = std::collections::HashSet::new();
    songs
        .into_iter()
        .filter(|song| is_id(&song.id) && !song.title.is_empty())
        .filter(|song| known.insert(song.id.clone()))
        .take(most)
        .map(Song::checked)
        .collect()
}

/// One artist of a song, as NetEase names them, with their own id (their page opens from the full-screen player).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRef {
    pub id: String,
    pub name: String,
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
    /// The first artist's NetEase id, when the page gave a real one (the full-screen player opens their page from
    /// it); left out otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_id: Option<String>,
    /// Each of the song's artists, with their own id (`None`: the page's answer gave none).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<ArtistRef>>,
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
    /// The song cleaned: its words as the app shows them (short), its times real, only a cover on NetEase's own
    /// image hosts (whatever else the page might say is dropped), and only an artist id that's NetEase's own.
    fn checked(mut self) -> Self {
        self.id = if is_id(&self.id) { self.id } else { String::new() };
        self.title = short(self.title, 300);
        self.artist = short(self.artist, 300);
        self.artist_id = self.artist_id.filter(|id| is_id(id));
        self.artists = self.artists.map(|artists| {
            artists
                .into_iter()
                .filter(|artist| is_id(&artist.id))
                .map(|artist| ArtistRef { id: artist.id, name: short(artist.name, 120) })
                .take(8)
                .collect::<Vec<_>>()
        });
        self.album = short(self.album, 300);
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        self.duration = finite(self.duration);
        self.position = finite(self.position).min(self.duration.max(0.0));
        self
    }
}

/// A recommended playlist: its NetEase id, name, cover (on NetEase's own image hosts) and how many times it's been
/// played.
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
    /// The playlist cleaned, as [`Track`]'s fields: an id and a name it can be shown by, a real play count, and only
    /// a cover on NetEase's own image hosts. "daily" (每日歌曲推荐, the app's own name for the day's page) is a list
    /// the app opens as any other; a card without a cover is still one (the day's card has none).
    fn checked(mut self) -> Option<Self> {
        if !is_list_id(&self.id) {
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

/// One of NetEase's own rankings (榜单): a playlist in NetEase's own right (its id opens it, `/api/toplist`).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ranking {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
    /// How often it updates, in NetEase's own words ("每天更新", "刚刚更新", "每周五更新").
    #[serde(default)]
    pub update_frequency: String,
    #[serde(default)]
    pub track_count: u64,
    #[serde(default)]
    pub play_count: u64,
    /// One of NetEase's own charts (飙升榜, 新歌榜, 原创榜, 热歌榜 and its partners): not a community list.
    #[serde(default)]
    pub official: bool,
}

impl Ranking {
    /// The ranking cleaned: an id and a name it can be shown and opened by, its own words short, its counts real, and
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
        self.update_frequency = short(self.update_frequency, 40);
        self.track_count = self.track_count.min(1_000_000);
        self.play_count = self.play_count.min(1_000_000_000_000);
        Some(self)
    }
}

/// NetEase's own rankings list: the page's answer to the app's `rankings`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rankings {
    #[serde(default)]
    pub rankings: Vec<Ranking>,
}

impl Rankings {
    /// The answer cleaned: the charts the app can show and open (a NetEase id, a name), no duplicate, at most
    /// [`Rankings::MOST`] of them.
    fn checked(mut self) -> Self {
        const MOST: usize = 100;
        let mut known = std::collections::HashSet::new();
        self.rankings = self
            .rankings
            .into_iter()
            .filter_map(Ranking::checked)
            .filter(|ranking| known.insert(ranking.id.clone()))
            .take(MOST)
            .collect();
        self
    }
}

/// Whose account it is, as NetEase's own user detail says it: its user id, name and picture, its signature, its music
/// level and its counts. The page's answer to the app's `profile`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// NetEase's own user id (digits).
    pub uid: String,
    pub name: String,
    #[serde(default)]
    pub avatar: Option<String>,
    /// The account's signature line (empty for one the page gives none).
    #[serde(default)]
    pub signature: String,
    /// The account's music level (网易云等级), 0 when the page doesn't say.
    #[serde(default)]
    pub level: u64,
    /// How many songs it has ever listened to.
    #[serde(default)]
    pub listen_songs: u64,
    /// How many accounts it follows.
    #[serde(default)]
    pub follows: u64,
    /// How many accounts follow it (the page's own `followeds`).
    #[serde(default)]
    pub fans: u64,
    /// How many playlists it has (created, collected and the heart's own).
    #[serde(default)]
    pub playlist_count: u64,
    /// How many days since the account was made.
    #[serde(default)]
    pub create_days: u64,
    /// NetEase's own vip flag (0: none; 11: 黑胶 VIP, as the page says it).
    #[serde(default)]
    pub vip_type: u64,
    /// The account page's own background picture, on NetEase's image hosts.
    #[serde(default)]
    pub background: Option<String>,
}

impl Profile {
    /// The profile cleaned: an id and a name the app can show, its words short, its counts real, and only pictures on
    /// NetEase's own image hosts.
    fn checked(mut self) -> Option<Self> {
        if !is_id(&self.uid) {
            return None;
        }
        self.name = short(self.name, 120);
        if self.name.is_empty() {
            return None;
        }
        self.avatar = self.avatar.filter(|avatar| is_net_ease_image(avatar));
        self.signature = short(self.signature, 200);
        self.background = self.background.filter(|background| is_net_ease_image(background));
        self.level = self.level.min(1_000);
        self.listen_songs = self.listen_songs.min(100_000_000);
        self.follows = self.follows.min(100_000_000);
        self.fans = self.fans.min(100_000_000);
        self.playlist_count = self.playlist_count.min(100_000);
        self.create_days = self.create_days.min(100_000);
        self.vip_type = self.vip_type.min(1_000);
        Some(self)
    }
}

/// An artist of a search: their NetEase id, name, and picture (on NetEase's own image hosts).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistCard {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
}

impl ArtistCard {
    /// The artist cleaned, as [`Playlist`]'s fields: an id and a name it can be shown by, and only a picture on
    /// NetEase's own image hosts.
    fn checked(mut self) -> Option<Self> {
        if !is_id(&self.id) {
            return None;
        }
        self.name = short(self.name, 120);
        if self.name.is_empty() {
            return None;
        }
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        Some(self)
    }
}

/// An artist's page: their id, name and alias, their picture, their brief introduction and their songs — the page's
/// answer to the app's `openArtist`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Their other names ("Jay Chou"), empty for one the page gives none of.
    #[serde(default)]
    pub alias: String,
    #[serde(default)]
    pub cover: Option<String>,
    /// Their brief introduction, empty for one the page gives none.
    #[serde(default)]
    pub description: String,
    /// Their own counts, as their page shows them (0 when the page's answer gives none).
    #[serde(default)]
    pub album_size: u64,
    #[serde(default)]
    pub music_size: u64,
    #[serde(default)]
    pub fans: u64,
    #[serde(default)]
    pub songs: Vec<Song>,
}

impl Artist {
    /// The answer cleaned: an id the app can ask for, a name it can show, a short alias and introduction, a picture on
    /// NetEase's own image hosts, and their songs as a playlist's (at most [`Artist::MOST`]).
    fn checked(mut self) -> Self {
        const MOST: usize = 50;
        self.id = if is_id(&self.id) { self.id } else { String::new() };
        self.name = short(self.name, 120);
        self.alias = short(self.alias, 120);
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        self.description = short(self.description, 600);
        self.songs = checked_songs(self.songs, MOST);
        self
    }
}

/// A playlist of the account's own (My Music's side): its NetEase id, name and cover, how many songs it has, and who
/// it's by (a collected one's owner, empty for one the account made).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPlaylist {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub song_count: u64,
    #[serde(default)]
    pub by: String,
}

impl LibraryPlaylist {
    /// The playlist cleaned, as [`Playlist`]'s fields, its songs' count real and its owner's name short.
    fn checked(mut self) -> Option<Self> {
        if !is_id(&self.id) {
            return None;
        }
        self.name = short(self.name, 200);
        if self.name.is_empty() {
            return None;
        }
        self.cover = self.cover.filter(|cover| is_net_ease_image(cover));
        self.song_count = self.song_count.min(1_000_000);
        self.by = short(self.by, 60);
        Some(self)
    }
}

/// One of My Music's side's groups of playlists (创建的歌单, 收藏的歌单): its title, how many it says it has, and its
/// playlists.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroup {
    pub title: String,
    #[serde(default)]
    pub count: u64,
    #[serde(default)]
    pub playlists: Vec<LibraryPlaylist>,
}

/// The account's own playlists, by group: the page's answer to the app's `library`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(default)]
    pub groups: Vec<LibraryGroup>,
}

impl Library {
    /// The answer cleaned: a named group (a title, its playlists the app can open), at most [`Library::GROUPS`]
    /// groups of [`Library::PLAYLISTS`] playlists each, its count read off the playlists it kept.
    fn checked(mut self) -> Self {
        const GROUPS: usize = 8;
        const PLAYLISTS: usize = 500;
        let mut total = 0;
        self.groups = self
            .groups
            .into_iter()
            .filter_map(|mut group| {
                group.title = short(group.title, 80);
                if group.title.is_empty() {
                    return None;
                }
                let room = PLAYLISTS.saturating_sub(total);
                group.playlists = group.playlists.into_iter().filter_map(LibraryPlaylist::checked).take(room).collect();
                if group.playlists.is_empty() {
                    return None;
                }
                total += group.playlists.len();
                group.count = group.playlists.len() as u64;
                Some(group)
            })
            .take(GROUPS)
            .collect();
        self
    }
}

/// The day's own songs (每日歌曲推荐), as its page lists them: a playlist's page's answer's songs.
#[derive(Clone, Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Daily {
    #[serde(default)]
    pub songs: Vec<Song>,
}

/// What Home shows: the day's songs, the account's 私人雷达, its other personalised playlists, and the recommended
/// playlists — the page's answer to the app's `home`. The day's songs are `null` while its page is still being read
/// (the cards are answered before them).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Home {
    #[serde(default)]
    pub daily: Option<Daily>,
    #[serde(default)]
    pub radar: Option<Playlist>,
    #[serde(default)]
    pub personal: Vec<Playlist>,
    #[serde(default)]
    pub recommended: Vec<Playlist>,
}

impl Home {
    /// What Home shows cleaned: the day's songs (at most [`Home::SONGS`]; none read still `null`), and the playlists
    /// the app can open, no duplicate (at most [`Home::LISTS`] each shelf).
    fn checked(mut self) -> Self {
        const SONGS: usize = 100;
        const LISTS: usize = 12;
        self.daily = self.daily.map(|mut daily| {
            daily.songs = checked_songs(daily.songs, SONGS);
            daily
        });
        self.radar = self.radar.and_then(Playlist::checked);
        let radar = self.radar.as_ref().map(|list| list.id.clone());
        let mut known = radar.into_iter().collect::<std::collections::HashSet<_>>();
        let mut shelf = |mut lists: Vec<Playlist>| {
            lists
                .drain(..)
                .filter_map(Playlist::checked)
                .filter(|list| known.insert(list.id.clone()))
                .take(LISTS)
                .collect()
        };
        self.personal = shelf(self.personal);
        self.recommended = shelf(self.recommended);
        self
    }
}

/// A search: the words asked, and the page's own results for them — its answer to the app's `search`. Its own
/// categories are read: its songs (单曲), its artists (歌手) and its playlists (歌单); each list is the first the page
/// gives of that kind, its total beside it (its own count).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Search {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub songs: Vec<Song>,
    #[serde(default)]
    pub artists: Vec<ArtistCard>,
    #[serde(default)]
    pub playlists: Vec<Playlist>,
    #[serde(default)]
    pub songs_total: u64,
    #[serde(default)]
    pub artists_total: u64,
    #[serde(default)]
    pub playlists_total: u64,
    /// Its own search interface refused (asked too often: "操作频繁"): an answer of nothing is not a "no matches".
    #[serde(default)]
    pub failed: bool,
}

impl Search {
    /// The answer cleaned: the words the app typed (short), the songs it can show and play (at most
    /// [`Search::MOST`]), and the artists and playlists it can open (at most [`Search::LISTS`] each), their totals
    /// real and never under the lists' own lengths.
    fn checked(mut self) -> Self {
        const MOST: usize = 60;
        const LISTS: usize = 30;
        self.query = short(self.query, 60);
        let songs = checked_songs(self.songs, MOST);
        let mut known = std::collections::HashSet::new();
        let artists: Vec<ArtistCard> = self
            .artists
            .into_iter()
            .filter_map(ArtistCard::checked)
            .filter(|artist| known.insert(format!("artist-{}", artist.id)))
            .take(LISTS)
            .collect();
        let playlists: Vec<Playlist> = self
            .playlists
            .into_iter()
            .filter_map(Playlist::checked)
            .filter(|list| known.insert(format!("playlist-{}", list.id)))
            .take(LISTS)
            .collect();
        self.songs_total = self.songs_total.max(songs.len() as u64).min(10_000_000);
        self.artists_total = self.artists_total.max(artists.len() as u64).min(10_000_000);
        self.playlists_total = self.playlists_total.max(playlists.len() as u64).min(10_000_000);
        self.songs = songs;
        self.artists = artists;
        self.playlists = playlists;
        self
    }
}

/// The account's recent songs: the page's answer to the app's `recent` (its 听歌排行 for the week, the closest its
/// web player keeps to 最近播放).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    #[serde(default)]
    pub songs: Vec<Song>,
}

impl Recent {
    /// The answer cleaned: only songs the app can show and play (at most [`Recent::MOST`]).
    fn checked(mut self) -> Self {
        const MOST: usize = 100;
        self.songs = checked_songs(self.songs, MOST);
        self
    }
}

/// A line of a song's words, as the page read them from its lyric interface: when it's sung (seconds), the words, and
/// their translation when the song has one (`tr`: NetEase's own `tlyric`, in Chinese). Only the lines with words are
/// here: a blank row of the page's file is its stanza gap, and a pure music's notice is not a line to sing.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    #[serde(default, deserialize_with = "some_f64")]
    pub t: f64,
    #[serde(default)]
    pub text: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tr: String,
}

/// The playing song's words (`netease` `lyric`): the page's own answer to its lyric interface (`/api/song/lyric`),
/// read into lines. The page also says what a song without words is: `instrumental` marks a pure music (the app says
/// 纯音乐 rather than showing nothing); a song whose words it couldn't collect is neither (the app says 暂无歌词).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyric {
    /// The song's NetEase id, as the page read its words for.
    pub id: String,
    #[serde(default)]
    pub instrumental: bool,
    #[serde(default)]
    pub lines: Vec<LyricLine>,
}

impl Lyric {
    /// The answer cleaned: only lines the app can show (a time, some words), so many lines, so long, in the song's
    /// own order (a page's file is in time, but never trusted to be), its translation as short as its words.
    fn checked(mut self) -> Self {
        const MOST: usize = 2000;
        const TEXT: usize = 300;
        self.lines.retain(|line| {
            line.t.is_finite() && (0.0..=86_400.0).contains(&line.t) && !line.text.trim().is_empty()
        });
        for line in &mut self.lines {
            line.text = short(line.text.trim().to_string(), TEXT);
            line.tr = short(line.tr.trim().to_string(), TEXT);
            line.t = (line.t * 1000.0).round() / 1000.0;
        }
        self.lines.sort_by(|one, other| one.t.partial_cmp(&other.t).unwrap_or(std::cmp::Ordering::Equal));
        self.lines.truncate(MOST);
        self
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

/// A play, timed by the page (netease.js's own watch): what was asked (`play`, `resume`, `next`, `previous`, or `heal`
/// for a player that says it plays while its sound doesn't), how long its sound took to move (`None`: it didn't in the
/// ladder's window), and each step's own record — its moments, the player's element at each rescue, which rescue came.
/// For the host's log only.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Timing {
    #[serde(default)]
    pub action: String,
    /// How many ms until its sound moved (the normal way); `null`: four seconds without a sound.
    #[serde(default)]
    pub sounding: Option<u64>,
    #[serde(default)]
    pub steps: String,
    /// The rescue that came (`1`, `2` or `3`; `null` for a play whose sound came at once).
    #[serde(default)]
    pub rescue: Option<u64>,
    /// Whether the page reloaded itself for the third rescue.
    #[serde(default)]
    pub reloading: Option<bool>,
}

/// A like asked of the page and what came of it (`kind: "like"`): the song's id, whether it was to be liked, and
/// whether the page's own answer said it landed (`ok`; `reason`: why not, the page's own word).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Like {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub liked: bool,
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub reason: String,
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
    /// Its play mode: `list` (列表循环), `shuffle` (随机) or `one` (单曲循环); `None` while its page shows none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default)]
    pub track: Option<Track>,
    /// The playing song's own liked state, as the page read it (`null`: not known yet, or signed out).
    #[serde(default)]
    pub liked: Option<bool>,
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
    mode: Option<String>,
    #[serde(default)]
    track: Option<Track>,
    #[serde(default)]
    liked: Option<bool>,
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
    /// A playlist's (or a ranking's) songs, the page's answer to the app's `openPlaylist` / `openRanking`.
    Playlist(Box<Songs>),
    /// An artist's page, the page's answer to the app's `openArtist`.
    Artist(Box<Artist>),
    /// An artist's songs from an offset on: the page's answer to the app's `artistSongs`.
    ArtistSongs(Box<ArtistSongs>),
    /// An artist's albums from an offset on: the page's answer to the app's `artistAlbums`.
    ArtistAlbums(Box<ArtistAlbums>),
    /// The account's own playlists, by group: the page's answer to the app's `library`.
    Library(Box<Library>),
    /// A search's songs, artists and playlists: the page's answer to the app's `search`.
    Search(Box<Search>),
    /// The account's recent songs: the page's answer to the app's `recent`.
    Recent(Box<Recent>),
    /// NetEase's own rankings: the page's answer to the app's `rankings`.
    Rankings(Box<Rankings>),
    /// The account's own profile (`None`: the page had none to say, signed out): the page's answer to the app's
    /// `profile`.
    Profile(Option<Box<Profile>>),
    /// A like asked for, and whether it landed: the page's answer to the app's `setLike`.
    Like(Box<Like>),
    /// The playing song's words, as the page read them (each line when it's sung; a pure music's own mark).
    Lyric(Box<Lyric>),
    /// A play timed by the page: for the host's log.
    Timing(Box<Timing>),
    /// What Home shows: the page's answer to the app's `home`.
    Home(Box<Home>),
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
    /// The recommended playlists last read (the v1 part of the state to the app).
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
        // Its sound reaches the cab's speakers (cab_sound.js, below), its audio coming from another host: its own
        // browser's cross-origin checks off for this profile alone (owner 2026-11-20; every other page of WestPlay's
        // keeps them). Without it a taken element plays silent (measured: the graph's analysers read 0).
        let view = OffscreenWebView::new_with_arguments(stage, width, height, user_data, "--disable-web-security")?;
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
            // A song, a playlist, a ranking, a search: only NetEase's own ids and the app's own words go into the page's
            // own addresses and lists (and a search's words stay short: its own page's search).
            Command::Play { value: Some(value), .. } if !is_id(value) => Ok(()),
            Command::Play { list: Some(list), .. } if !is_context(list) => Ok(()),
            Command::OpenPlaylist { value } if !is_list_id(value) => Ok(()),
            Command::OpenRanking { value } if !is_id(value) => Ok(()),
            Command::OpenArtist { value } if !is_id(value) => Ok(()),
            Command::SetLike { value, .. } if !is_id(value) => Ok(()),
            Command::Search { value } if value.trim().is_empty() || value.chars().count() > 60 => Ok(()),
            Command::Seek { value } if !value.is_finite() => Ok(()),
            Command::Volume { value } | Command::VolumeFade { value } if !value.is_finite() => Ok(()),
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
                            mode: page.mode.filter(|mode| matches!(mode.as_str(), "list" | "shuffle" | "one")),
                            track: page.track.map(Track::checked),
                            liked: page.liked,
                            lists: self.lists.borrow().clone(),
                            account: page.account,
                            audio: page.audio,
                        }));
                    }
                }
                Some(Message::Playlist(songs)) => reports.push(Report::Playlist(Box::new(songs.checked()))),
                Some(Message::Artist(artist)) => reports.push(Report::Artist(Box::new(artist.checked()))),
                Some(Message::ArtistSongs(songs)) => reports.push(Report::ArtistSongs(Box::new(songs.checked()))),
                Some(Message::ArtistAlbums(albums)) => {
                    reports.push(Report::ArtistAlbums(Box::new(albums.checked())))
                }
                Some(Message::Library(library)) => reports.push(Report::Library(Box::new(library.checked()))),
                Some(Message::Search(search)) => reports.push(Report::Search(Box::new(search.checked()))),
                Some(Message::Recent(recent)) => reports.push(Report::Recent(Box::new(recent.checked()))),
                Some(Message::Rankings(rankings)) => reports.push(Report::Rankings(Box::new(rankings.checked()))),
                Some(Message::Profile(profile)) => {
                    reports.push(Report::Profile(profile.and_then(Profile::checked).map(Box::new)))
                }
                Some(Message::Like(like)) => reports.push(Report::Like(Box::new(like))),
                Some(Message::Lyric(lyric)) => reports.push(Report::Lyric(Box::new(lyric.checked()))),
                Some(Message::Timing(timing)) => reports.push(Report::Timing(Box::new(timing))),
                Some(Message::Home(home)) => reports.push(Report::Home(Box::new(home.checked()))),
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
    /// A playlist's (or a ranking's) songs, answered.
    Playlist(Songs),
    /// An artist's page, answered.
    Artist(Artist),
    /// An artist's songs from an offset on, answered.
    ArtistSongs(ArtistSongs),
    /// An artist's albums from an offset on, answered.
    ArtistAlbums(ArtistAlbums),
    /// The account's own playlists, by group, answered.
    Library(Library),
    /// A search's songs, artists and playlists, answered.
    Search(Search),
    /// The account's recent songs, answered.
    Recent(Recent),
    /// NetEase's own rankings, answered.
    Rankings(Rankings),
    /// The account's own profile, answered (`None`: the page had none to say).
    Profile(Option<Profile>),
    /// A like asked for, answered.
    Like(Like),
    /// The playing song's words, answered (its lines, or the mark of a pure music).
    Lyric(Lyric),
    /// A play's own timing, said as it goes.
    Timing(Timing),
    /// What Home shows, answered.
    Home(Home),
}

fn read_message(message: &str) -> Option<Message> {
    let value: serde_json::Value = serde_json::from_str(message).ok()?;
    if value.get("ready").and_then(serde_json::Value::as_bool) == Some(true) {
        return Some(Message::Ready);
    }
    if let Some(playlist) = value.get("playlist") {
        return serde_json::from_value::<Songs>(playlist.clone()).ok().map(Message::Playlist);
    }
    if let Some(artist) = value.get("artist") {
        return serde_json::from_value::<Artist>(artist.clone()).ok().map(Message::Artist);
    }
    if let Some(songs) = value.get("artistSongs") {
        return serde_json::from_value::<ArtistSongs>(songs.clone()).ok().map(Message::ArtistSongs);
    }
    if let Some(albums) = value.get("artistAlbums") {
        return serde_json::from_value::<ArtistAlbums>(albums.clone()).ok().map(Message::ArtistAlbums);
    }
    if let Some(library) = value.get("library") {
        return serde_json::from_value::<Library>(library.clone()).ok().map(Message::Library);
    }
    if let Some(search) = value.get("search") {
        return serde_json::from_value::<Search>(search.clone()).ok().map(Message::Search);
    }
    if let Some(recent) = value.get("recent") {
        return serde_json::from_value::<Recent>(recent.clone()).ok().map(Message::Recent);
    }
    if let Some(rankings) = value.get("rankings") {
        return serde_json::from_value::<Rankings>(rankings.clone()).ok().map(Message::Rankings);
    }
    if let Some(profile) = value.get("profile") {
        return serde_json::from_value::<Option<Profile>>(profile.clone()).ok().map(Message::Profile);
    }
    if let Some(like) = value.get("like") {
        return serde_json::from_value::<Like>(like.clone()).ok().map(Message::Like);
    }
    // A song's words: only for a NetEase song's own id (the app shows them over the song that plays).
    if let Some(lyric) = value.get("lyric") {
        return serde_json::from_value::<Lyric>(lyric.clone())
            .ok()
            .filter(|lyric| is_id(&lyric.id))
            .map(Message::Lyric);
    }
    if let Some(timing) = value.get("timing") {
        return serde_json::from_value::<Timing>(timing.clone()).ok().map(Message::Timing);
    }
    if let Some(home) = value.get("home") {
        return serde_json::from_value::<Home>(home.clone()).ok().map(Message::Home);
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

/// `{"type":"netease","kind":"playlist","id":"…","name":"…","songs":[…]}`: a playlist's (or a ranking's) songs, the
/// page's answer to the app's `openPlaylist` / `openRanking`. Its head (cover, play count, update frequency, who made
/// it, its description) is there when the page gave one.
pub fn playlist_message(songs: &Songs) -> String {
    let mut value = serde_json::json!({
        "type": "netease",
        "kind": "playlist",
        "id": songs.id,
        "name": songs.name,
        "songs": songs.songs,
    });
    let map = value.as_object_mut().expect("an object");
    if let Some(cover) = &songs.cover {
        map.insert("cover".into(), cover.clone().into());
    }
    if songs.play_count > 0 {
        map.insert("playCount".into(), songs.play_count.into());
    }
    if songs.track_count > 0 {
        map.insert("trackCount".into(), songs.track_count.into());
    }
    if !songs.update_frequency.is_empty() {
        map.insert("updateFrequency".into(), songs.update_frequency.clone().into());
    }
    if !songs.creator.is_empty() {
        map.insert("creator".into(), songs.creator.clone().into());
    }
    if !songs.description.is_empty() {
        map.insert("description".into(), songs.description.clone().into());
    }
    value.to_string()
}

/// `{"type":"netease","kind":"artist","id":"…","name":"…","alias":"…","cover":…,"description":"…","songs":[…]}`: an
/// artist's page, the page's answer to the app's `openArtist`.
pub fn artist_message(artist: &Artist) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "artist",
        "id": artist.id,
        "name": artist.name,
        "alias": artist.alias,
        "cover": artist.cover,
        "description": artist.description,
        "albumSize": artist.album_size,
        "musicSize": artist.music_size,
        "fans": artist.fans,
        "songs": artist.songs,
    })
    .to_string()
}

/// `{"type":"netease","kind":"artistSongs","id":…,"offset":…,"songs":[…],"more":…}`: an artist's songs from an
/// offset on, the page's answer to the app's `artistSongs`.
pub fn artist_songs_message(songs: &ArtistSongs) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "artistSongs",
        "id": songs.id,
        "offset": songs.offset,
        "songs": songs.songs,
        "more": songs.more,
    })
    .to_string()
}

/// `{"type":"netease","kind":"artistAlbums","id":…,"offset":…,"albums":[…],"more":…}`: an artist's albums from an
/// offset on, the page's answer to the app's `artistAlbums`.
pub fn artist_albums_message(albums: &ArtistAlbums) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "artistAlbums",
        "id": albums.id,
        "offset": albums.offset,
        "albums": albums.albums,
        "more": albums.more,
    })
    .to_string()
}

/// `{"type":"netease","kind":"home","daily":{"songs":[…]},"radar":…,"personal":[…],"recommended":[…]}`: what Home
/// shows, the page's answer to the app's `home`.
pub fn home_message(home: &Home) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "home",
        "daily": home.daily,
        "radar": home.radar,
        "personal": home.personal,
        "recommended": home.recommended,
    })
    .to_string()
}

/// `{"type":"netease","kind":"library","groups":[{"title","count","playlists":[…]}]}`: the account's own playlists,
/// by group, the page's answer to the app's `library`.
pub fn library_message(library: &Library) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "library",
        "groups": library.groups,
    })
    .to_string()
}

/// `{"type":"netease","kind":"search","query":"…","songs":[…],"artists":[…],"playlists":[…],"songsTotal":…,
/// "artistsTotal":…,"playlistsTotal":…}`: a search's songs, artists and playlists, the page's answer to the app's
/// `search`.
pub fn search_message(search: &Search) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "search",
        "query": search.query,
        "songs": search.songs,
        "artists": search.artists,
        "playlists": search.playlists,
        "songsTotal": search.songs_total,
        "artistsTotal": search.artists_total,
        "playlistsTotal": search.playlists_total,
    })
    .to_string()
}

/// `{"type":"netease","kind":"recent","songs":[…]}`: the account's recent songs, the page's answer to the app's
/// `recent`.
pub fn recent_message(recent: &Recent) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "recent",
        "songs": recent.songs,
    })
    .to_string()
}

/// `{"type":"netease","kind":"rankings","rankings":[…]}`: NetEase's own rankings, the page's answer to the app's
/// `rankings`.
pub fn rankings_message(rankings: &Rankings) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "rankings",
        "rankings": rankings.rankings,
    })
    .to_string()
}

/// `{"type":"netease","kind":"profile","profile":{…}}` (`profile`: `null` when the page had none to say, signed out):
/// the account's own profile, the page's answer to the app's `profile`.
pub fn profile_message(profile: Option<&Profile>) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "profile",
        "profile": profile,
    })
    .to_string()
}

/// `{"type":"netease","kind":"lyric","id":"…","instrumental":false,"lines":[{"t":16.922,"text":"…","tr":"…"}]}`: the
/// playing song's words, as the page read them — each line with when it's sung (seconds) and its translation when the
/// song has one; `instrumental`: a pure music (no words to show, and the app says so).
pub fn lyric_message(lyric: &Lyric) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "lyric",
        "id": lyric.id,
        "instrumental": lyric.instrumental,
        "lines": lyric.lines,
    })
    .to_string()
}

/// `{"type":"netease","kind":"like","id":"…","liked":true,"ok":true,"reason":""}`: a like asked of the page, and
/// whether its own interface said it landed.
pub fn like_message(like: &Like) -> String {
    serde_json::json!({
        "type": "netease",
        "kind": "like",
        "id": like.id,
        "liked": like.liked,
        "ok": like.ok,
        "reason": like.reason,
    })
    .to_string()
}

/// A NetEase song's or playlist's id: digits (`5269469196`), nothing else.
fn is_id(id: &str) -> bool {
    (1..=20).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

/// An id the app opens a list by: NetEase's own (digits), or "daily" (每日歌曲推荐, the day's page the app names
/// itself: its card has no playlist id of NetEase's).
fn is_list_id(id: &str) -> bool {
    id == "daily" || is_id(id)
}

/// A list the app plays a song from, as the page names its own: NetEase's own (a playlist's or a ranking's id),
/// "daily" (the day's own songs), "recent" (its 听歌排行), "search" (its last search's songs) or "artist:<id>" (an
/// artist's songs). Anything else is no list of the page's, and the command is dropped.
fn is_context(list: &str) -> bool {
    is_list_id(list)
        || matches!(list, "recent" | "search")
        || list.strip_prefix("artist:").is_some_and(is_id)
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

/// Whether a count is zero (left out of a message when it is: a playlist's songs have no play count to show).
fn is_zero(value: &u64) -> bool {
    *value == 0
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
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play"}"#).unwrap(),
            Command::Play { value: None, list: None }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play","value":"3778678"}"#).unwrap(),
            Command::Play { value: Some("3778678".into()), list: None }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play","value":"3778678","list":"19723756"}"#).unwrap(),
            Command::Play { value: Some("3778678".into()), list: Some("19723756".into()) }
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
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"openRanking","value":"19723756"}"#).unwrap(),
            Command::OpenRanking { value: "19723756".into() }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"openArtist","value":"5770"}"#).unwrap(),
            Command::OpenArtist { value: "5770".into() }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"setLike","value":"168091","liked":true}"#).unwrap(),
            Command::SetLike { value: "168091".into(), liked: true }
        );
        assert_eq!(
            serde_json::to_string(&Command::SetLike { value: "168091".into(), liked: false }).unwrap(),
            r#"{"action":"setLike","value":"168091","liked":false}"#
        );
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"refresh"}"#).unwrap(), Command::Refresh);
        assert!(serde_json::from_str::<Command>(r#"{"action":"explode"}"#).is_err());
    }

    /// The page is told the app's commands as the app sent them (its own `action` names), but for the host's own.
    #[test]
    fn passes_the_page_its_commands_as_the_app_sent_them() {
        assert_eq!(
            serde_json::to_string(&Command::Play { value: Some("3778678".into()), list: None }).unwrap(),
            r#"{"action":"play","value":"3778678"}"#
        );
        assert_eq!(
            serde_json::to_string(&Command::Play { value: Some("3778678".into()), list: Some("daily".into()) }).unwrap(),
            r#"{"action":"play","value":"3778678","list":"daily"}"#
        );
        assert_eq!(serde_json::to_string(&Command::Play { value: None, list: None }).unwrap(), r#"{"action":"play"}"#);
        assert_eq!(serde_json::to_string(&Command::Prev).unwrap(), r#"{"action":"prev"}"#);
        assert_eq!(serde_json::to_string(&Command::Seek { value: 12.5 }).unwrap(), r#"{"action":"seek","value":12.5}"#);
        assert_eq!(
            serde_json::to_string(&Command::OpenPlaylist { value: "456".into() }).unwrap(),
            r#"{"action":"openPlaylist","value":"456"}"#
        );
        assert_eq!(
            serde_json::to_string(&Command::OpenRanking { value: "19723756".into() }).unwrap(),
            r#"{"action":"openRanking","value":"19723756"}"#
        );
        assert_eq!(serde_json::to_string(&Command::Rankings).unwrap(), r#"{"action":"rankings"}"#);
        assert_eq!(serde_json::to_string(&Command::Profile).unwrap(), r#"{"action":"profile"}"#);
        assert!(Command::Refresh.for_page() && Command::Play { value: None, list: None }.for_page());
        assert!(Command::Rankings.for_page() && Command::Profile.for_page());
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
                mode: None,
                track: None,
                liked: None,
                lists: None,
                account: None,
                audio: None,
            }))
        );
        let Some(Message::State(state)) = read_message(
            r##"{"state":{"signedIn":true,"playing":true,"volume":0.5,"track":{"id":"1","title":"歌名","artist":"歌手",
                "artistId":"5770","album":"专辑","cover":"https://p2.music.126.net/a.jpg?param=300y300","duration":240,
                "position":63,"playable":true},"lists":[{"id":"456","name":"歌单名","cover":null,"playCount":123456}]}}"##,
        ) else {
            panic!("not a state")
        };
        assert_eq!(state.signed_in, Some(true));
        let track = state.track.expect("a track");
        assert_eq!(track.duration, 240.0);
        assert_eq!(track.artist_id.as_deref(), Some("5770"), "the first artist's id comes through");
        assert_eq!(state.lists.expect("lists")[0].play_count, 123456);
        assert_eq!(read_message("not json"), None);
        assert_eq!(read_message(r#"{"state":"no"}"#), None);
    }

    #[test]
    fn reads_a_playlists_answer_cleaned() {
        let Some(Message::Playlist(songs)) = read_message(
            r##"{"playlist":{"id":"3778678","name":"热歌榜","cover":"https://p1.music.126.net/0.jpg",
                "playCount":14253657088,"trackCount":200,"updateFrequency":"每天更新","creator":"",
                "description":"","songs":[
                {"id":"1","title":"冬天又来临","artist":"歌手","artistId":"5770","album":"冬天又来临","duration":240.5,"playable":true},
                {"id":"1","title":"repeat","artist":"","duration":100,"playable":true},
                {"id":"","title":"no id","duration":1,"playable":false},
                {"id":"2","title":"","duration":1,"playable":false},
                {"id":"3","title":"a song","artist":"","artistId":"12x","duration":null,"playable":false}]}}"##,
        ) else {
            panic!("not a playlist")
        };
        let songs = songs.checked();
        assert_eq!(songs.id, "3778678");
        assert_eq!(songs.name, "热歌榜");
        assert_eq!(songs.cover.as_deref(), Some("https://p1.music.126.net/0.jpg"));
        assert_eq!((songs.play_count, songs.track_count), (14_253_657_088, 200));
        assert_eq!(songs.update_frequency, "每天更新");
        assert_eq!(songs.songs.len(), 2, "{songs:?}");
        assert_eq!(songs.songs[0].title, "冬天又来临");
        assert_eq!(songs.songs[0].album, "冬天又来临");
        assert_eq!(songs.songs[0].artist_id.as_deref(), Some("5770"));
        assert_eq!(songs.songs[1].duration, 0.0);
        assert_eq!(songs.songs[1].artist_id, None, "not an id the app opens a page by");
        assert!(read_message(r#"{"playlist":"no"}"#).is_none());
        // A v2 answer (no head at all) is read the same: no cover, no counts, the same songs.
        let Some(Message::Playlist(songs)) = read_message(r#"{"playlist":{"id":"456","name":"歌单名"}}"#) else {
            panic!("not a playlist")
        };
        let songs = songs.checked();
        assert_eq!((songs.cover, songs.play_count, songs.track_count), (None, 0, 0));
        assert!(songs.songs.is_empty());
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
            mode: page.mode,
            track: page.track.map(Track::checked),
            liked: page.liked,
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

    /// An artist's page: the first artist's NetEase id passes (the app opens their page from the playing song), only
    /// when it is one (digits), and is left out of the messages when there's none.
    #[test]
    fn carries_only_netease_artist_ids() {
        let song: Song = serde_json::from_str(r#"{"id":"1","title":"歌","artistId":"5770"}"#).unwrap();
        assert_eq!(song.artist_id.as_deref(), Some("5770"));
        assert_eq!(Song { artist_id: Some("12x".into()), ..song.clone() }.checked().artist_id, None);
        let track: Track = serde_json::from_str(r#"{"title":"歌","artistId":"abc"}"#).unwrap();
        assert_eq!(track.checked().artist_id, None);
        // Leave the field out when there's none (never an empty one), and say it when there is.
        let value: serde_json::Value = serde_json::to_value(Song { artist_id: None, ..song.clone() }).unwrap();
        assert!(value.get("artistId").is_none(), "{value}");
        let value: serde_json::Value = serde_json::to_value(Song { artist_id: Some("5770".into()), ..song }).unwrap();
        assert_eq!(value["artistId"], "5770");
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
            mode: Some("list".into()),
            track: Some(Track {
                id: "123".into(),
                title: "歌名".into(),
                artist: "歌手".into(),
                artist_id: None,
                artists: None,
                album: "专辑".into(),
                cover: Some("https://p2.music.126.net/a.jpg".into()),
                duration: 240.0,
                position: 63.0,
                playable: true,
            }),
            liked: Some(true),
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
            cover: Some("https://p1.music.126.net/a.jpg?param=300y300".into()),
            play_count: 0,
            track_count: 0,
            update_frequency: String::new(),
            creator: String::new(),
            description: String::new(),
            songs: vec![Song {
                id: "1".into(),
                title: "冬天又来临".into(),
                artist: "歌手".into(),
                artist_id: Some("5770".into()),
                artists: None,
                album: String::new(),
                duration: 240.5,
                playable: true,
                play_count: 0,
            }],
        };
        let message = playlist_message(&songs);
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(value["type"], "netease");
        assert_eq!(value["kind"], "playlist");
        assert_eq!(value["id"], "456");
        assert_eq!(value["name"], "歌单名");
        assert_eq!(value["cover"], "https://p1.music.126.net/a.jpg?param=300y300");
        assert_eq!(value["songs"][0]["playable"], true);
        assert_eq!(value["songs"][0]["duration"], 240.5);
        assert!(value["songs"][0].get("album").is_none(), "no album to show: {message}");
        assert!(value["playCount"].is_null() && value["trackCount"].is_null(), "no counts to show: {message}");
    }

    /// The v2 commands (Home, My Music's own playlists, a search, the recent songs): read from the app, passed to
    /// the page in its own action names; "daily" (每日歌曲推荐) is a list the app opens by its own name.
    #[test]
    fn reads_and_passes_the_apps_new_commands() {
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"home"}"#).unwrap(), Command::Home);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"library"}"#).unwrap(), Command::Library);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"recent"}"#).unwrap(), Command::Recent);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"rankings"}"#).unwrap(), Command::Rankings);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"profile"}"#).unwrap(), Command::Profile);
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"search","value":"周杰伦"}"#).unwrap(),
            Command::Search { value: "周杰伦".into() }
        );
        assert_eq!(serde_json::to_string(&Command::Home).unwrap(), r#"{"action":"home"}"#);
        assert_eq!(serde_json::to_string(&Command::Library).unwrap(), r#"{"action":"library"}"#);
        assert_eq!(serde_json::to_string(&Command::Recent).unwrap(), r#"{"action":"recent"}"#);
        assert_eq!(
            serde_json::to_string(&Command::Search { value: "泰勒".into() }).unwrap(),
            r#"{"action":"search","value":"泰勒"}"#
        );
        for command in [
            Command::Home,
            Command::Library,
            Command::Recent,
            Command::Rankings,
            Command::Profile,
            Command::Search { value: "x".into() },
            Command::OpenRanking { value: "19723756".into() },
        ] {
            assert!(command.for_page(), "{command:?} is the page's");
        }
        // A list the app opens by its id: NetEase's own (digits), or the day's page's own name.
        assert!(is_list_id("3778678") && is_list_id("daily"));
        assert!(!is_list_id("") && !is_list_id("Daily") && !is_list_id("daily/../x") && !is_list_id("12a"));
        // The lists a song is played from, as the page names them: its own ids and the day's/recent/search/artist.
        assert!(is_context("daily") && is_context("recent") && is_context("search") && is_context("artist:5770"));
        assert!(is_context("19723756"));
        assert!(!is_context("") && !is_context("Artist:5770") && !is_context("artist:") && !is_context("artist:12a"));
        assert!(!is_context("search:许巍") && !is_context("daily/../x"));
        // The day's own card (no cover, its own id): a playlist the app can show and open.
        let daily = Playlist {
            id: "daily".into(),
            name: "每日歌曲推荐".into(),
            cover: None,
            play_count: 0,
        }
        .checked()
        .expect("the day's own card");
        assert_eq!((daily.id.as_str(), daily.cover), ("daily", None));
    }

    /// The page's v2 answers: Home (its cards, then its day's songs), My Music's groups, a search and the recent
    /// songs — read as the app shows them (a NetEase id and a name, real times, NetEase's own covers), no duplicate.
    #[test]
    fn reads_the_pages_new_answers_cleaned() {
        // Home's cards first: the day's songs are still to come (`daily` null in that answer).
        let Some(Message::Home(home)) = read_message(
            r##"{"home":{"radar":{"id":"3136952023","name":"私人雷达",
                "cover":"https://p1.music.126.net/a.jpg?param=300y300","playCount":0},
                "personal":[{"id":"14060074166","name":"霸道总裁夜晚飙车进行曲","cover":null,"playCount":704},
                    {"id":"not-an-id","name":"x"}],
                "recommended":[{"id":"952897240","name":"热门歌单","cover":"https://evil.example/a.jpg","playCount":120000}]}}"##,
        ) else {
            panic!("not a home answer")
        };
        let home = home.checked();
        assert!(home.daily.is_none(), "the day's songs come after the cards");
        assert_eq!(home.radar.as_ref().expect("a radar").id, "3136952023");
        assert_eq!(home.personal.len(), 1, "only the playlist the app can open: {home:?}");
        assert_eq!(home.recommended[0].play_count, 120000);
        assert_eq!(home.recommended[0].cover, None, "not NetEase's image host");
        // The day's songs: cleaned (a NetEase id, a name), no duplicate, and the card's own cover kept away.
        let Some(Message::Home(home)) = read_message(
            r##"{"home":{"daily":{"songs":[{"id":"1","title":"歌","artist":"人","duration":200,"playable":true},
                {"id":"","title":"no id"},{"id":"1","title":"repeat"}]},
                "radar":{"id":"daily","name":"每日歌曲推荐","cover":null}}}"##,
        ) else {
            panic!("not a home answer")
        };
        let home = home.checked();
        assert_eq!(home.daily.expect("the day's songs").songs.len(), 1);
        assert_eq!(home.radar.expect("the day's card").id, "daily");
        // My Music's groups: named groups of playlists the app can open, their count read off what's kept.
        let Some(Message::Library(library)) = read_message(
            r##"{"library":{"groups":[
                {"title":"创建的歌单","count":5,"playlists":[
                    {"id":"2772893759","name":"我喜欢的音乐","cover":"https://p1.music.126.net/a.jpg?param=40y40",
                     "songCount":2747,"by":""},
                    {"id":"bad","name":"no id"}]},
                {"title":"","count":1,"playlists":[]},
                {"title":"收藏的歌单","count":19,"playlists":[
                    {"id":"14049111724","name":"欧美优质hiphop","cover":null,"songCount":129,"by":"微雨染尘埃"}]}]}}"##,
        ) else {
            panic!("not a library answer")
        };
        let library = library.checked();
        assert_eq!(library.groups.len(), 2, "a named group with playlists: {library:?}");
        assert_eq!(library.groups[0].title, "创建的歌单");
        assert_eq!(library.groups[0].count, 1, "read off the playlists kept");
        assert_eq!(library.groups[1].playlists[0].song_count, 129);
        assert_eq!(library.groups[1].playlists[0].by, "微雨染尘埃");
        // A search's songs: the page's own answer, at most 60.
        let songs: String = (1..=70).map(|n| format!(r#"{{"id":"{n}","title":"歌{n}","duration":60,"playable":true}}"#)).collect::<Vec<_>>().join(",");
        let Some(Message::Search(search)) = read_message(&format!(r#"{{"search":{{"query":"周杰伦","songs":[{songs}]}}}}"#))
        else {
            panic!("not a search answer")
        };
        let search = search.checked();
        assert_eq!(search.query, "周杰伦");
        assert_eq!(search.songs.len(), 60, "a search's answer is capped");
        assert!(search.artists.is_empty() && search.playlists.is_empty(), "an old answer: no other kinds");
        assert_eq!((search.songs_total, search.artists_total, search.playlists_total), (60, 0, 0));
        // A search's three kinds, as its page gives them: songs, artists (their picture and name) and playlists
        // (the cards the app opens), each cleaned, their totals the page's own and never under the lists' lengths.
        let Some(Message::Search(search)) = read_message(
            r##"{"search":{"query":"许巍","songs":[{"id":"168141","title":"故乡","artist":"许巍","album":"那一年",
                "duration":313,"playable":true}],
                "artists":[{"id":"5770","name":"许巍","cover":"https://p1.music.126.net/a.jpg?param=130y130"},
                    {"id":"5770","name":"许巍 again"},{"id":"bad","name":"no id"},{"id":"4721","name":""}],
                "playlists":[{"id":"8866695219","name":"听·许巍热门精选|蓝莲花",
                    "cover":"http://p1.music.126.net/b.jpg?param=140y140","playCount":3557000},
                    {"id":"8866695219","name":"again"},{"id":"bad","name":"no id"}],
                "songsTotal":296,"artistsTotal":14,"playlistsTotal":285}}"##,
        ) else {
            panic!("not a search answer")
        };
        let search = search.checked();
        assert_eq!((search.songs_total, search.artists_total, search.playlists_total), (296, 14, 285));
        assert_eq!(search.songs.len(), 1);
        assert_eq!(search.songs[0].album, "那一年");
        assert_eq!(search.artists.len(), 1, "only the artist the app can open: {search:?}");
        assert_eq!(search.artists[0].name, "许巍");
        assert_eq!(search.playlists.len(), 1, "only the playlist the app can open: {search:?}");
        assert_eq!(search.playlists[0].play_count, 3_557_000);
        assert_eq!(search.playlists[0].cover.as_deref(), Some("http://p1.music.126.net/b.jpg?param=140y140"));
        // An artist's page: their name, alias, picture and songs, as its own page gives them.
        let Some(Message::Artist(artist)) = read_message(
            r##"{"artist":{"id":"5770","name":"许巍","alias":"","cover":"http://p1.music.126.net/c.jpg?param=640y300",
                "description":"内地摇滚音乐界的重要人物。",
                "songs":[{"id":"168091","title":"蓝莲花","artist":"许巍","duration":270,"playable":true},
                    {"id":"","title":"no id"}]}}"##,
        ) else {
            panic!("not an artist answer")
        };
        let artist = artist.checked();
        assert_eq!(artist.id, "5770");
        assert_eq!(artist.name, "许巍");
        assert_eq!(artist.description, "内地摇滚音乐界的重要人物。");
        assert_eq!(artist.cover.as_deref(), Some("http://p1.music.126.net/c.jpg?param=640y300"));
        assert_eq!(artist.songs.len(), 1);
        // The recent songs: cleaned the same way, at most 100, each with the week's own count when it says one.
        let Some(Message::Recent(recent)) = read_message(
            r#"{"recent":{"songs":[{"id":"1","title":"歌","artist":"人","duration":201,"playable":true,"playCount":3},
                {"id":"","title":"no id"}]}}"#,
        ) else {
            panic!("not a recent answer")
        };
        let recent = recent.checked();
        assert_eq!(recent.songs.len(), 1);
        assert_eq!(recent.songs[0].play_count, 3);
        assert!(read_message(r#"{"library":"no"}"#).is_none() && read_message(r#"{"home":"no"}"#).is_none());
    }

    /// The v3 answers: NetEase's own rankings and the account's profile, read and cleaned as the app shows them.
    #[test]
    fn reads_the_rankings_and_the_profile() {
        let Some(Message::Rankings(rankings)) = read_message(
            r##"{"rankings":{"rankings":[
                {"id":"19723756","name":"飙升榜","cover":"https://p2.music.126.net/a.jpg","updateFrequency":"刚刚更新",
                 "trackCount":100,"playCount":6529254400,"official":true},
                {"id":"19723756","name":"again"},
                {"id":"71384707","name":"网易云古典榜","cover":"https://evil.example/a.jpg","updateFrequency":"每周更新",
                 "trackCount":100,"playCount":76434272,"official":false},
                {"id":"bad","name":"no id"},
                {"id":"3778678","name":""}]}}"##,
        ) else {
            panic!("not a rankings answer")
        };
        let rankings = rankings.checked();
        assert_eq!(rankings.rankings.len(), 2, "{rankings:?}");
        assert_eq!(rankings.rankings[0].name, "飙升榜");
        assert!(rankings.rankings[0].official);
        assert_eq!(rankings.rankings[0].update_frequency, "刚刚更新");
        assert_eq!(rankings.rankings[1].cover, None, "not NetEase's image host");
        assert!(!rankings.rankings[1].official);
        // The profile: the account's own name, picture, level and counts; a picture that isn't NetEase's is dropped,
        // and one the page had nothing of is no answer at all.
        let Some(Message::Profile(profile)) = read_message(
            r##"{"profile":{"uid":"1835963976","name":"dReLuNEstella",
                "avatar":"https://p1.music.126.net/a.jpg?param=140y140","signature":"皮粥",
                "level":8,"listenSongs":6682,"follows":46,"fans":7,"playlistCount":5,"createDays":2764,
                "vipType":11,"background":"https://evil.example/bg.jpg"}}"##,
        ) else {
            panic!("not a profile answer")
        };
        let profile = profile.expect("a profile").checked().expect("a profile the app shows");
        assert_eq!(profile.uid, "1835963976");
        assert_eq!(profile.name, "dReLuNEstella");
        assert_eq!((profile.level, profile.listen_songs, profile.follows, profile.fans), (8, 6682, 46, 7));
        assert_eq!((profile.playlist_count, profile.create_days, profile.vip_type), (5, 2764, 11));
        assert_eq!(profile.background, None, "not NetEase's image host");
        assert!(Message::Profile(None) == read_message(r#"{"profile":null}"#).unwrap(), "a signed-out page has none");
        assert!(read_message(r#"{"profile":"no"}"#).is_none());
        // A profile the page said without an id or a name is no profile.
        let empty = Profile {
            uid: "bad".into(),
            name: "someone".into(),
            avatar: None,
            signature: String::new(),
            level: 0,
            listen_songs: 0,
            follows: 0,
            fans: 0,
            playlist_count: 0,
            create_days: 0,
            vip_type: 0,
            background: None,
        };
        assert!(empty.checked().is_none());
    }

    /// The v3 answers to the cabin page: its protocol's own (`type`/`kind`), each kind with its own fields only.
    #[test]
    fn says_the_new_answers_the_way_the_app_reads_them() {
        let song = Song {
            id: "1".into(),
            title: "歌".into(),
            artist: "人".into(),
            artist_id: None,
            artists: None,
            album: String::new(),
            duration: 200.0,
            playable: true,
            play_count: 0,
        };
        let lists = Library {
            groups: vec![LibraryGroup {
                title: "创建的歌单".into(),
                count: 1,
                playlists: vec![LibraryPlaylist {
                    id: "2772893759".into(),
                    name: "我喜欢的音乐".into(),
                    cover: None,
                    song_count: 2747,
                    by: String::new(),
                }],
            }],
        }
        .checked();
        let value: serde_json::Value = serde_json::from_str(&library_message(&lists)).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("library")));
        assert_eq!(value["groups"][0]["title"], "创建的歌单");
        assert_eq!(value["groups"][0]["playlists"][0]["songCount"], 2747);

        let search = Search {
            query: "周杰伦".into(),
            songs: vec![song.clone()],
            artists: vec![ArtistCard {
                id: "6452".into(),
                name: "周杰伦".into(),
                cover: Some("https://p1.music.126.net/j.jpg?param=130y130".into()),
            }],
            playlists: vec![Playlist {
                id: "952897240".into(),
                name: "周杰伦精选".into(),
                cover: None,
                play_count: 120_000,
            }],
            songs_total: 1204,
            artists_total: 12,
            playlists_total: 386,
            failed: false,
        }
        .checked();
        let value: serde_json::Value = serde_json::from_str(&search_message(&search)).unwrap();
        assert_eq!(value["kind"], "search");
        assert_eq!(value["query"], "周杰伦");
        assert_eq!(value["songs"][0]["title"], "歌");
        assert_eq!(value["artists"][0]["name"], "周杰伦");
        assert_eq!(value["playlists"][0]["playCount"], 120_000);
        assert_eq!(
            (value["songsTotal"].as_u64(), value["artistsTotal"].as_u64(), value["playlistsTotal"].as_u64()),
            (Some(1204), Some(12), Some(386))
        );

        let artist = Artist {
            id: "6452".into(),
            name: "周杰伦".into(),
            alias: "Jay Chou".into(),
            cover: Some("https://p1.music.126.net/j.jpg?param=300y300".into()),
            description: "华语流行歌手。".into(),
            album_size: 40,
            music_size: 500,
            fans: 1000000,
            songs: vec![Song { id: "2".into(), title: "晴天".into(), artist: "周杰伦".into(), artist_id: Some("6452".into()), artists: None, album: String::new(), duration: 269.0, playable: true, play_count: 0 }],
        }
        .checked();
        let value: serde_json::Value = serde_json::from_str(&artist_message(&artist)).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("artist")));
        assert_eq!(value["name"], "周杰伦");
        assert_eq!(value["alias"], "Jay Chou");
        assert_eq!(value["description"], "华语流行歌手。");
        assert_eq!(value["songs"][0]["title"], "晴天");

        // The heart's answer, and a play's timing, each its own kind and fields.
        let like = Like { id: "168091".into(), liked: true, ok: true, reason: String::new() };
        let value: serde_json::Value = serde_json::from_str(&like_message(&like)).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("like")));
        assert_eq!((value["id"].as_str(), value["liked"].as_bool(), value["ok"].as_bool()), (Some("168091"), Some(true), Some(true)));
        assert_eq!(
            read_message(r#"{"timing":{"action":"play","sounding":1234,"steps":"command@0ms, sounding 1234ms"}}"#),
            Some(Message::Timing(Timing {
                action: "play".into(),
                sounding: Some(1234),
                steps: "command@0ms, sounding 1234ms".into(),
                rescue: None,
                reloading: None,
            }))
        );
        assert_eq!(
            read_message(r#"{"like":{"id":"168091","liked":false,"ok":false,"reason":"account"}}"#),
            Some(Message::Like(Like {
                id: "168091".into(),
                liked: false,
                ok: false,
                reason: "account".into(),
            }))
        );

        let recent = Recent { songs: vec![Song { play_count: 3, ..song.clone() }] }.checked();
        let value: serde_json::Value = serde_json::from_str(&recent_message(&recent)).unwrap();
        assert_eq!(value["kind"], "recent");
        assert_eq!(value["songs"][0]["duration"], 200.0);
        assert_eq!(value["songs"][0]["playCount"], 3);

        // NetEase's rankings, and the account's profile (and its own no-answer).
        let rankings = Rankings {
            rankings: vec![Ranking {
                id: "19723756".into(),
                name: "飙升榜".into(),
                cover: Some("https://p2.music.126.net/a.jpg?param=300y300".into()),
                update_frequency: "刚刚更新".into(),
                track_count: 100,
                play_count: 6_529_254_400,
                official: true,
            }],
        }
        .checked();
        let value: serde_json::Value = serde_json::from_str(&rankings_message(&rankings)).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("rankings")));
        assert_eq!(value["rankings"][0]["name"], "飙升榜");
        assert_eq!(value["rankings"][0]["updateFrequency"], "刚刚更新");
        assert_eq!(value["rankings"][0]["official"], true);

        let profile = Profile {
            uid: "1835963976".into(),
            name: "dReLuNEstella".into(),
            avatar: Some("https://p1.music.126.net/a.jpg?param=140y140".into()),
            signature: "皮粥".into(),
            level: 8,
            listen_songs: 6682,
            follows: 46,
            fans: 7,
            playlist_count: 5,
            create_days: 2764,
            vip_type: 11,
            background: None,
        }
        .checked()
        .expect("a profile");
        let value: serde_json::Value = serde_json::from_str(&profile_message(Some(&profile))).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("profile")));
        assert_eq!(value["profile"]["uid"], "1835963976");
        assert_eq!(value["profile"]["name"], "dReLuNEstella");
        assert_eq!((value["profile"]["level"].as_u64(), value["profile"]["fans"].as_u64()), (Some(8), Some(7)));
        let none: serde_json::Value = serde_json::from_str(&profile_message(None)).unwrap();
        assert!(none["profile"].is_null(), "a signed-out page has no profile: {none}");

        // Home: the day's songs are still null in the answer its cards come in, then a list (empty for a signed-out
        // account, never the cards' own null).
        let home = Home {
            daily: Some(Daily { songs: vec![song] }),
            radar: Some(Playlist {
                id: "3136952023".into(),
                name: "私人雷达".into(),
                cover: None,
                play_count: 0,
            }),
            personal: vec![],
            recommended: vec![],
        }
        .checked();
        let value: serde_json::Value = serde_json::from_str(&home_message(&home)).unwrap();
        assert_eq!(value["kind"], "home");
        assert_eq!(value["daily"]["songs"][0]["title"], "歌");
        assert_eq!(value["radar"]["id"], "3136952023");
        assert_eq!(value["personal"].as_array().map(Vec::len), Some(0));
        let cards_only = Home { daily: None, radar: None, personal: vec![], recommended: vec![] }.checked();
        let value: serde_json::Value = serde_json::from_str(&home_message(&cards_only)).unwrap();
        assert!(value["daily"].is_null(), "the cards' answer: its day's songs still to come");
    }

    /// The playing song's words: the page's own lines, each with when it's sung, its words and its translation, read
    /// as the app shows them — in the song's own order, only lines it can show, only a NetEase song's own id.
    #[test]
    fn reads_a_songs_words() {
        let Some(Message::Lyric(lyric)) = read_message(
            r##"{"lyric":{"id":"26896129","instrumental":false,"lines":[
                {"t":16.922,"text":"We were both young when I first saw you","tr":"第一次见到你的时候我们都很年轻"},
                {"t":20.569,"text":"I close my eyes and the flashback starts"},
                {"t":-1,"text":"a time that isn't one"},
                {"t":24,"text":"   "},
                {"t":23.98,"text":"I'm standing there on a balcony in summer air","tr":"我站在那里 在一个阳台上乘凉"}]}}"##,
        ) else {
            panic!("not a lyric")
        };
        let lyric = lyric.checked();
        assert_eq!(lyric.id, "26896129");
        assert!(!lyric.instrumental);
        assert_eq!(lyric.lines.len(), 3, "{lyric:?}");
        // The song's own order, whatever order its answer came in; a line with no translation says none.
        assert_eq!(lyric.lines[0].t, 16.922);
        assert_eq!(lyric.lines[1].t, 20.569);
        assert_eq!(lyric.lines[1].tr, "");
        assert_eq!(lyric.lines[2].text, "I'm standing there on a balcony in summer air");
        assert_eq!(lyric.lines[2].tr, "我站在那里 在一个阳台上乘凉");
        // Only a NetEase song's own id is words the app can put over the song that plays.
        assert_eq!(read_message(r#"{"lyric":{"id":"12x","lines":[]}}"#), None);
        assert_eq!(read_message(r#"{"lyric":"no"}"#), None);
    }

    /// A song without words: a pure music is marked as one (the app then says 纯音乐); a song whose words the page
    /// couldn't collect is neither a pure music nor a song with lines (the app says 暂无歌词).
    #[test]
    fn marks_a_pure_music_and_an_empty_answer() {
        let Some(Message::Lyric(pure)) = read_message(r#"{"lyric":{"id":"478507889","instrumental":true,"lines":[]}}"#)
        else {
            panic!("not a lyric")
        };
        let pure = pure.checked();
        assert!(pure.instrumental && pure.lines.is_empty());
        let Some(Message::Lyric(none)) = read_message(r#"{"lyric":{"id":"3433373114","instrumental":false}}"#) else {
            panic!("not a lyric")
        };
        let none = none.checked();
        assert!(!none.instrumental && none.lines.is_empty());
        assert_eq!(none.id, "3433373114");
    }

    /// The words to the cabin page: its own protocol (`type`/`kind`), a line's moment, words and translation (left
    /// out when the song has none), and a pure music's own mark.
    #[test]
    fn says_a_songs_words_the_way_the_app_reads_them() {
        let lyric = Lyric {
            id: "26896129".into(),
            instrumental: false,
            lines: vec![
                LyricLine { t: 16.922, text: "We were both young".into(), tr: "我们都很年轻".into() },
                LyricLine { t: 20.569, text: "I close my eyes".into(), tr: String::new() },
            ],
        };
        let message = lyric_message(&lyric);
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!((value["type"].as_str(), value["kind"].as_str()), (Some("netease"), Some("lyric")));
        assert_eq!(value["id"], "26896129");
        assert_eq!(value["instrumental"], false);
        assert_eq!(value["lines"][0]["t"], 16.922);
        assert_eq!(value["lines"][0]["text"], "We were both young");
        assert_eq!(value["lines"][0]["tr"], "我们都很年轻");
        assert!(value["lines"][1].get("tr").is_none(), "no translation to say: {message}");
        let pure = lyric_message(&Lyric { id: "478507889".into(), instrumental: true, lines: vec![] });
        let value: serde_json::Value = serde_json::from_str(&pure).unwrap();
        assert_eq!(value["instrumental"], true);
        assert_eq!(value["lines"].as_array().map(Vec::len), Some(0));
    }

    /// Only what the app can show passes: so many lines, so long (translation and words), times that are times.
    #[test]
    fn passes_only_words_the_app_can_show() {
        let lines: Vec<LyricLine> =
            (0..2500).map(|n| LyricLine { t: n as f64, text: "歌".repeat(400), tr: "tr".repeat(400) }).collect();
        let checked = Lyric { id: "1".into(), instrumental: false, lines }.checked();
        assert_eq!(checked.lines.len(), 2000);
        assert_eq!(checked.lines[0].text.chars().count(), 300);
        assert_eq!(checked.lines[0].tr.chars().count(), 300);
        let odd = Lyric {
            id: "1".into(),
            instrumental: false,
            lines: vec![
                LyricLine { t: f64::NAN, text: "not a time".into(), tr: String::new() },
                LyricLine { t: 90_000.0, text: "not a song's time".into(), tr: String::new() },
                LyricLine { t: 5.0, text: "  ".into(), tr: String::new() },
            ],
        }
        .checked();
        assert!(odd.lines.is_empty(), "{odd:?}");
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

    /// They page as it really is, with this module's script in it: the shell's play bar and account, and the data
    /// the interface answers with (Home, My Music, the rankings, the profile, a playlist's songs, a search, an
    /// artist), plus a song played (muted: never heard). Run it by hand (`cargo test -p westplay-host
    /// probes_neteases_page -- --ignored --nocapture`): it asks music.163.com on this PC's own signed-in profile.
    #[test]
    #[ignore = "asks music.163.com"]
    fn probes_neteases_page() {
        use std::time::{Duration, Instant};
        use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
        // SAFETY: COM on this test's own thread, once, before anything uses it.
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap() };
        let user_data = match std::env::var_os("WESTPLAY_NETEASE_PROFILE") {
            Some(profile) => std::path::PathBuf::from(profile),
            None => std::env::temp_dir().join(format!("westplay-netease-probe-{}", std::process::id())),
        };
        let kept_profile = std::env::var_os("WESTPLAY_NETEASE_PROFILE").is_some();
        let stage = Stage::new(1280, 720).unwrap();
        let netease = Netease::start(&stage, 1280, 720, &user_data).unwrap();
        // Muted (never heard): its own mute, retried while the WebView2 is still settling (it says "in use" for a
        // moment after an existing profile's own page closed); failing that, the player itself turned down.
        let mut muted = false;
        for _ in 0..15 {
            if netease.view.set_muted(true).is_ok() {
                muted = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        println!("muted: {muted}");
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
        // The answer of one of the app's own readings: the last report of its kind, or `None`.
        fn last<T>(reports: &[Report], pick: impl Fn(&Report) -> Option<T>) -> Option<T> {
            reports.iter().rev().find_map(pick)
        }
        // Waits for one of the app's own readings, as the host goes on: its time is up after `seconds`.
        let ask = |command: Command, seconds: f64, reports: &mut Vec<Report>, pick: &dyn Fn(&Report) -> bool| {
            netease.command(&command).unwrap();
            let until = Instant::now() + Duration::from_secs_f64(seconds);
            while Instant::now() < until {
                pump(0.25, reports);
                if last(reports, |report| if pick(report) { Some(()) } else { None }).is_some() {
                    return true;
                }
            }
            false
        };
        // What the page says of itself now, as its own test hook does (`window.westplayNetease`), or `null` while it
        // loads again.
        let page_now = |netease: &Netease| -> serde_json::Value {
            let said = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap_or_else(|_| "null".into());
            serde_json::from_str(&said).unwrap_or(serde_json::Value::Null)
        };
        // The plays the page said its timing of since `at` (the reports' own index).
        let timings_after = |reports: &Vec<Report>, at: usize| -> Vec<Timing> {
            reports
                .iter()
                .skip(at)
                .filter_map(|report| match report {
                    Report::Timing(timing) => Some((**timing).clone()),
                    _ => None,
                })
                .collect()
        };
        // The first play of `action` whose sound came since `at`, `None` inside `seconds`.
        let wait_timing = |reports: &mut Vec<Report>, at: usize, action: &str, seconds: f64| -> Option<Timing> {
            let until = Instant::now() + Duration::from_secs_f64(seconds);
            while Instant::now() < until {
                pump(0.1, reports);
                if let Some(timing) = timings_after(reports, at).into_iter().find(|timing| {
                    timing.action == action && timing.sounding.is_some()
                }) {
                    return Some(timing);
                }
            }
            None
        };
        pump(15.0, &mut reports);
        // The player turned down while the page's own mute wasn't there: never heard either way.
        if !muted {
            let _ = netease.command(&Command::Volume { value: 0.02 });
        }
        // The shell's page, as the raw DOM says it: the player's own bar and the account.
        let shell = netease
            .view
            .evaluate(
                r#"({
                    href: location.href,
                    ready: document.readyState,
                    playbar: Boolean(document.querySelector('.m-playbar')),
                    signedIn: Boolean(document.querySelector('.m-tophead [data-action="logout"]')),
                    accountName: document.querySelector('.m-tophead a.name')?.getAttribute('href') ?? null,
                    frame: document.getElementById('g_iframe')?.contentWindow?.location?.href ?? null,
                })"#,
            )
            .unwrap();
        println!("shell: {shell}");
        // This module's own script: what it says of the page.
        let page = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
        println!("page: {page}");
        let page: serde_json::Value = serde_json::from_str(&page).expect("the script's own report");
        assert_eq!(page["playAPI"], "function", "the page's own player isn't there: {page}");
        assert_eq!(page["signedIn"], true, "this profile isn't signed in: {page}");
        assert!(page["uid"].as_str().is_some_and(|uid| !uid.is_empty()), "no account id: {page}");
        // Home: the cards first (the day's songs still null), then its day's songs.
        assert!(ask(Command::Home, 30.0, &mut reports, &|report| matches!(report, Report::Home(_))), "no home answer");
        pump(10.0, &mut reports);
        let home = last(&reports, |report| match report {
            Report::Home(home) if home.daily.as_ref().is_some_and(|daily| !daily.songs.is_empty()) => Some(home.clone()),
            _ => None,
        })
        .expect("the day's own songs came");
        println!(
            "home: daily {} songs, radar {:?}, personal {}, recommended {}",
            home.daily.as_ref().map_or(0, |daily| daily.songs.len()),
            home.radar.as_ref().map(|radar| radar.name.clone()),
            home.personal.len(),
            home.recommended.len()
        );
        assert!(home.daily.as_ref().is_some_and(|daily| !daily.songs.is_empty()), "no day's songs: {home:?}");
        assert!(home.radar.is_some(), "no 私人雷达: {home:?}");
        // NetEase's rankings, and a ranking's own songs.
        assert!(ask(Command::Rankings, 20.0, &mut reports, &|report| matches!(report, Report::Rankings(_))), "no rankings answer");
        let rankings = last(&reports, |report| match report {
            Report::Rankings(rankings) => Some(rankings.clone()),
            _ => None,
        })
        .expect("the rankings came");
        println!("rankings: {} (first {:?})", rankings.rankings.len(), rankings.rankings.first());
        assert!(!rankings.rankings.is_empty(), "no rankings");
        let ranking = rankings.rankings.iter().find(|ranking| ranking.official).expect("an official ranking");
        let ranking_id = ranking.id.clone();
        assert!(ask(Command::OpenRanking { value: ranking_id.clone() }, 30.0, &mut reports, &|report| {
            matches!(report, Report::Playlist(songs) if songs.id == ranking_id)
        }), "no ranking songs");
        let ranked = last(&reports, |report| match report {
            Report::Playlist(songs) if songs.id == ranking_id => Some(songs.clone()),
            _ => None,
        })
        .expect("the ranking's songs came");
        println!("ranking {} ({}): {} songs, first {:?}", ranked.name, ranked.id, ranked.songs.len(), ranked.songs.first());
        assert!(!ranked.songs.is_empty(), "no songs in ranking {ranking_id}");
        // My Music, the account's profile and its recent songs.
        assert!(ask(Command::Library, 20.0, &mut reports, &|report| matches!(report, Report::Library(_))), "no library answer");
        let library = last(&reports, |report| match report {
            Report::Library(library) => Some(library.clone()),
            _ => None,
        })
        .expect("the library came");
        println!("library: {} groups, first {:?}", library.groups.len(), library.groups.first());
        assert!(!library.groups.is_empty(), "no groups of the account's own");
        assert!(ask(Command::Profile, 20.0, &mut reports, &|report| matches!(report, Report::Profile(_))), "no profile answer");
        let profile = last(&reports, |report| match report {
            Report::Profile(profile) => Some(profile.clone()),
            _ => None,
        })
        .expect("the profile came")
        .expect("this profile is signed in");
        println!("profile: {} (uid {}, level {}, {} playlists)", profile.name, profile.uid, profile.level, profile.playlist_count);
        assert_eq!(profile.uid, page["uid"].as_str().unwrap_or_default(), "the page's own uid");
        assert!(ask(Command::Recent, 20.0, &mut reports, &|report| matches!(report, Report::Recent(_))), "no recent answer");
        let recent = last(&reports, |report| match report {
            Report::Recent(recent) => Some(recent.clone()),
            _ => None,
        })
        .expect("the recent songs came");
        println!("recent: {} songs, first {:?}", recent.songs.len(), recent.songs.first());
        assert!(!recent.songs.is_empty(), "no recent songs");
        // A search of the page's own, and an artist's page.
        assert!(ask(Command::Search { value: "许巍".into() }, 30.0, &mut reports, &|report| {
            matches!(report, Report::Search(search) if search.query == "许巍" && !search.songs.is_empty())
        }), "no search answer");
        let search = last(&reports, |report| match report {
            Report::Search(search) if search.query == "许巍" => Some(search.clone()),
            _ => None,
        })
        .expect("the search came");
        println!("search: {} songs / {} artists / {} playlists, totals {:?}", search.songs.len(), search.artists.len(), search.playlists.len(), (search.songs_total, search.artists_total, search.playlists_total));
        assert!(!search.songs.is_empty(), "no songs for 许巍: {search:?}");
        let artist_id = search.artists.first().map(|artist| artist.id.clone()).unwrap_or_else(|| "5770".into());
        assert!(ask(Command::OpenArtist { value: artist_id.clone() }, 20.0, &mut reports, &|report| matches!(report, Report::Artist(_))), "no artist answer");
        let artist = last(&reports, |report| match report {
            Report::Artist(artist) => Some(artist.clone()),
            _ => None,
        })
        .expect("the artist's page came");
        println!("artist {} ({}): {} songs", artist.name, artist.id, artist.songs.len());
        assert!(!artist.songs.is_empty(), "no songs of the artist {artist_id}");
        // A song played: through the page's own player (`nm.x.ceo2i`), watched, and the app is told it plays (muted:
        // never heard).
        let Some(song) = ranked.songs.iter().find(|song| song.playable) else { return };
        println!("playing {} ({})", song.title, song.id);
        netease.command(&Command::Play { value: Some(song.id.clone()), list: Some(ranking_id.clone()) }).unwrap();
        pump(5.0, &mut reports);
        let playing = netease.view.evaluate("window.westplayNetease?.() ?? null").unwrap();
        println!("playing: {playing}");
        let playing: serde_json::Value = serde_json::from_str(&playing).unwrap();
        assert!(playing["playing"].as_bool() == Some(true), "it isn't playing: {playing}");
        let timing = last(&reports, |report| match report {
            Report::Timing(timing) => Some(timing.clone()),
            _ => None,
        });
        println!("the play's own timing: {timing:?}");
        let state = last(&reports, |report| match report {
            Report::State(state) => Some(state.clone()),
            _ => None,
        })
        .expect("the page said how it is");
        println!("state: playing={} track={:?}", state.playing, state.track);
        assert!(state.playing, "the app not told it plays");
        assert!(state.track.as_ref().is_some_and(|track| !track.title.is_empty()), "no title playing: {state:?}");
        // Its own controls: the volume the app sets, a seek, and a pause.
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
        // A song played, another switched to while it sounds, and its own next pressed: each says how long its sound
        // took (the page's own timing) and the wall clock from the command (a song switched to must sound without a
        // wait), and a player that says it plays while its sound stops is taken into the rescue ladder at once.
        let playable: Vec<&Song> = ranked.songs.iter().filter(|song| song.playable).collect();
        if playable.len() >= 2 {
            let (first, second) = (playable[0].id.clone(), playable[1].id.clone());
            let at = reports.len();
            netease.command(&Command::Play { value: Some(first.clone()), list: Some(ranking_id.clone()) }).unwrap();
            let timing = wait_timing(&mut reports, at, "play", 8.0);
            println!("a play of {first}: {timing:?}");
            assert!(timing.as_ref().is_some_and(|timing| timing.rescue.is_none()), "the first play needed a rescue: {timing:?}");
            pump(1.5, &mut reports);
            let at = reports.len();
            let sent = Instant::now();
            netease.command(&Command::Play { value: Some(second.clone()), list: Some(ranking_id.clone()) }).unwrap();
            let timing = wait_timing(&mut reports, at, "play", 4.0);
            let took = sent.elapsed();
            println!("a switch to {second}: {timing:?} (wall {took:?})");
            assert!(timing.is_some(), "the switch didn't sound: {timing:?}");
            assert!(timing.as_ref().is_some_and(|timing| timing.rescue.is_none()), "the switch needed a rescue: {timing:?}");
            assert!(took < Duration::from_secs(3), "a switch took too long: {took:?}");
            let page = page_now(&netease);
            assert_eq!(page["track"]["id"].as_str(), Some(second.as_str()), "the wrong song plays: {page}");
            let at = reports.len();
            let sent = Instant::now();
            netease.command(&Command::Next).unwrap();
            let timing = wait_timing(&mut reports, at, "next", 4.0);
            let took = sent.elapsed();
            println!("a next: {timing:?} (wall {took:?})");
            assert!(timing.is_some(), "the next didn't sound: {timing:?}");
            assert!(took < Duration::from_secs(3), "a next took too long: {took:?}");
            // A player that says it plays while its sound's clock stops (the page's own element frozen): healed at once.
            let frozen = netease
                .view
                .evaluate("window.westplayNeteaseTest?.freeze(0) ?? false")
                .unwrap_or_else(|_| "false".into());
            println!("frozen: {frozen}");
            assert_eq!(frozen, "true", "nothing playing to freeze");
            let at = reports.len();
            let started = Instant::now();
            let mut heal = None;
            while started.elapsed() < Duration::from_secs(10) {
                pump(0.25, &mut reports);
                heal = timings_after(&reports, at).into_iter().find(|timing| timing.action == "heal");
                if heal.is_some() {
                    break;
                }
            }
            println!("a frozen player: heal {heal:?} after {:?}", started.elapsed());
            assert!(heal.is_some(), "a player that says it plays while its sound stops wasn't healed");
            // Its clock let run again (the ladder's own play may not have reset it): the sound must come back.
            let _ = netease.view.evaluate("window.westplayNeteaseTest?.freeze(1) ?? false");
            let back = Instant::now();
            let mut sounding_again = false;
            while back.elapsed() < Duration::from_secs(20) {
                pump(0.4, &mut reports);
                let page = page_now(&netease);
                if page["audio"]["playing"].as_bool() == Some(true) {
                    let at1 = page["audio"]["at"].as_i64().unwrap_or(0);
                    pump(0.6, &mut reports);
                    if page_now(&netease)["audio"]["at"].as_i64().unwrap_or(0) > at1 {
                        sounding_again = true;
                        break;
                    }
                }
            }
            println!("the sound back after the freeze: {sounding_again} ({:?})", back.elapsed());
            assert!(sounding_again, "the sound didn't come back after the freeze");
        }
        // The heart: the playing song liked and unliked again (the same song both ways: the account left as it was),
        // each read back from the page's own 我喜欢的音乐.
        let id = state.track.as_ref().map(|track| track.id.clone()).unwrap_or_default();
        if is_id(&id) {
            netease.command(&Command::SetLike { value: id.clone(), liked: true }).unwrap();
            pump(4.0, &mut reports);
            let liked = last(&reports, |report| match report {
                Report::Like(like) if like.id == id => Some(like.clone()),
                _ => None,
            });
            println!("a like: {liked:?}");
            assert!(liked.as_ref().is_some_and(|like| like.ok), "the like didn't land: {liked:?}");
            netease.command(&Command::SetLike { value: id.clone(), liked: false }).unwrap();
            pump(4.0, &mut reports);
            let unliked = last(&reports, |report| match report {
                Report::Like(like) if like.id == id => Some(like.clone()),
                _ => None,
            });
            println!("an unlike: {unliked:?}");
            assert!(unliked.as_ref().is_some_and(|like| like.ok), "the unlike didn't land: {unliked:?}");
        }
        netease.close(&stage);
        if !kept_profile {
            let _ = std::fs::remove_dir_all(&user_data);
        }
    }
}
