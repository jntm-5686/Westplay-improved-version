//! What WestPlay does when one of its WebView2 processes fails: which page it was, which of its processes failed
//! (the browser's own, a page's, and so on), why and with what exit code, how often it's been failing lately, how
//! long to wait before loading the page again, and when to stop trying and say so instead. The companion's
//! diagnostics show the same health ([`HealthReport`]).
//!
//! WebView2 reports a failure on the thread it was made on (the host's STA thread), one page at a time, so the
//! registry is that thread's own (`HOST`): no lock stands between an event and its answer, and a host started again
//! on another thread starts with a clean one. The rules themselves ([`Registry`]) take the time as an argument:
//! they're the same on any thread, and a test can run them without a WebView at all.

use std::cell::RefCell;
use std::time::{Duration, Instant};

/// The pages WestPlay runs in WebViews of their own: the cabin's, and the hidden ones the apps play through.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Page {
    Cabin,
    Youtube,
    YoutubeMusic,
    Spotify,
    AppleMusic,
    Netease,
    Bilibili,
    /// Player's own player (the game's music folder).
    Player,
}

impl Page {
    /// Every page, in the order the diagnostics list them: the cabin's first.
    pub const ALL: [Self; 8] = [
        Self::Cabin,
        Self::Youtube,
        Self::YoutubeMusic,
        Self::Spotify,
        Self::AppleMusic,
        Self::Netease,
        Self::Bilibili,
        Self::Player,
    ];

    /// The page as the log and the diagnostics name it.
    pub const fn name(self) -> &'static str {
        match self {
            Self::Cabin => "cabin",
            Self::Youtube => "youtube",
            Self::YoutubeMusic => "youtube music",
            Self::Spotify => "spotify",
            Self::AppleMusic => "apple music",
            Self::Netease => "netease",
            Self::Bilibili => "bilibili",
            Self::Player => "player",
        }
    }

    const fn index(self) -> usize {
        self as usize
    }
}

/// Which of a WebView's processes failed, as `COREWEBVIEW2_PROCESS_FAILED_KIND` says it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Process {
    /// The browser process exited: the WebView (every page of that profile) is gone.
    Browser,
    /// The page's own process exited: the page is blank until it's loaded again.
    Renderer,
    /// The page's process stopped responding: as above, until it's loaded again.
    Unresponsive,
    /// A frame's renderer process (a page's iframes).
    FrameRenderer,
    /// The GPU process: WebView2 starts another by itself.
    Gpu,
    /// A utility process (the network service and the like): WebView2 starts another by itself.
    Utility,
    /// A sandbox helper, a plugin's broker or plugin, or a kind this WebView2 doesn't say.
    Other(i32),
}

impl Process {
    /// The process a `COREWEBVIEW2_PROCESS_FAILED_KIND` names.
    pub const fn of_kind(kind: i32) -> Self {
        match kind {
            // COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED
            0 => Self::Browser,
            // COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
            1 => Self::Renderer,
            // COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
            2 => Self::Unresponsive,
            // COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED
            3 => Self::FrameRenderer,
            // COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED
            6 => Self::Gpu,
            // COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED
            4 => Self::Utility,
            kind => Self::Other(kind),
        }
    }

    /// The process as the log says it.
    pub const fn name(self) -> &'static str {
        match self {
            Self::Browser => "the browser process",
            Self::Renderer => "the page's process",
            Self::Unresponsive => "the page's process, unresponsive",
            Self::FrameRenderer => "a frame's process",
            Self::Gpu => "the GPU process",
            Self::Utility => "a utility process",
            Self::Other(_) => "a helper process",
        }
    }

    /// What a failure of this process takes to come back from, if WestPlay has to do anything: a page loaded
    /// again, or a WebView (a whole environment) started again. `None`: WebView2 restarts that process itself
    /// (its GPU's, a utility's, a frame's), and the page goes on.
    pub const fn outcome(self) -> Option<Outcome> {
        match self {
            Self::Browser => Some(Outcome::Recreate),
            Self::Renderer | Self::Unresponsive => Some(Outcome::Reload),
            Self::FrameRenderer | Self::Gpu | Self::Utility | Self::Other(_) => None,
        }
    }
}

/// How far back a failure sets a page: loaded again in its WebView, or its WebView (and the environment it was
/// made in) started again. Ordered by how much it takes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Outcome {
    /// The page's process failed: `ICoreWebView2::Reload` brings it back, the profile and cookies kept.
    Reload,
    /// The browser process exited: the WebView is gone, and only a new one (a new environment) comes back.
    Recreate,
}

/// Why a process failed, as `COREWEBVIEW2_PROCESS_FAILED_REASON` says it (WebView2's own word when it has one).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Why {
    Crashed,
    Unresponsive,
    /// Ended by something else (a task manager, a system shutdown beginning).
    Terminated,
    LaunchFailed,
    OutOfMemory,
    /// Its profile was deleted under it.
    ProfileDeleted,
    Unexpected,
    Other(i32),
}

impl Why {
    /// The reason a `COREWEBVIEW2_PROCESS_FAILED_REASON` names.
    pub const fn of_reason(reason: i32) -> Self {
        match reason {
            // COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED
            3 => Self::Crashed,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE
            1 => Self::Unresponsive,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED
            2 => Self::Terminated,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED
            4 => Self::LaunchFailed,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY
            5 => Self::OutOfMemory,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED
            6 => Self::ProfileDeleted,
            // COREWEBVIEW2_PROCESS_FAILED_REASON_UNEXPECTED
            0 => Self::Unexpected,
            reason => Self::Other(reason),
        }
    }

    /// The reason as the diagnostics say it (the column after the process').
    pub const fn name(self) -> &'static str {
        match self {
            Self::Crashed => "crashed",
            Self::Unresponsive => "stopped responding",
            Self::Terminated => "was ended",
            Self::LaunchFailed => "couldn't start",
            Self::OutOfMemory => "ran out of memory",
            Self::ProfileDeleted => "had its profile deleted",
            Self::Unexpected => "failed for no reason it gave",
            Self::Other(_) => "failed for a reason it didn't name",
        }
    }

    /// The reason in a sentence for the log (`the page stopped responding`).
    pub fn said(self) -> String {
        format!("it {}", self.name())
    }
}

/// A process failure as WebView2 reported it (`ICoreWebView2ProcessFailedEventArgs2`): which process, why, its
/// exit code, and what WebView2 called the process (`Renderer`, `Utility`), which a frame's or a plugin's names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Failure {
    pub process: Process,
    pub why: Why,
    /// The exit code WebView2 gave (Windows' own for the process, or one it made up).
    pub exit_code: Option<i32>,
    /// What WebView2 called the process: empty when it didn't say.
    pub description: String,
    pub at: Instant,
}

impl Failure {
    /// What it takes to come back from it (`None`: WebView2 restarts that process itself).
    pub fn outcome(&self) -> Option<Outcome> {
        self.process.outcome()
    }

    /// The failure in a line for the log: `the page's process failed: it crashed, exit code 0xC0000005,
    /// Renderer: the page is loaded again`, and what it takes to come back from it.
    pub fn line(&self) -> String {
        let mut said = format!("{} failed: {}", self.process.name(), self.why.said());
        if let Some(code) = self.exit_code {
            said.push_str(&format!(", exit code 0x{:08X}", code as u32));
        }
        // What WebView2 called the process (`Renderer`, `Utility`, `Network Service`), which a frame's or a
        // plugin's names: never anything of the page itself.
        if !self.description.is_empty() {
            said.push_str(", ");
            said.push_str(&self.description);
        }
        let outcome = match self.outcome() {
            Some(Outcome::Reload) => "the page is loaded again",
            Some(Outcome::Recreate) => "the WebView has to be made again",
            None => "WebView2 restarts it itself",
        };
        format!("{said}: {outcome}")
    }
}

/// How long each retry waits before the page is loaded again: the first failure's page is loaded again at once,
/// the ones after it wait these, and no more than [`MAX_RETRIES`] are tried.
pub const BACKOFF: [Duration; 3] = [
    Duration::from_millis(500),
    Duration::from_secs(2),
    Duration::from_secs(5),
];

/// How many times a page that keeps failing is loaded again after the first time, before WestPlay stops trying
/// (the cabin then shows an error of its own rather than a screen that comes back blank).
pub const MAX_RETRIES: u32 = BACKOFF.len() as u32;

/// A page failing this often within [`LOOP_WINDOW`] is failing in a loop: WestPlay stops trying to bring it back
/// and records it, rather than loading it again and again. (The retries' own limit stops a page failing at once;
/// this catches one that comes back and fails again, every minute or two for a while.)
pub const MAX_FAILURES: usize = 5;
pub const LOOP_WINDOW: Duration = Duration::from_secs(10 * 60);

/// A page that ran this long without failing is a page that's whole again: its failures start over.
pub const SETTLE: Duration = Duration::from_secs(30);

/// What the host does about a failure or a waiting retry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    /// Nothing more: WebView2 restarts that process itself (the GPU's, a utility's, a frame's).
    Nothing,
    /// Load the page again now (its process failed; the WebView and its profile stay).
    Reload,
    /// The WebView is gone (its browser process exited): make a new one.
    Recreate,
    /// Try again once the backoff is up: [`Registry::ready`] says when, and with which step.
    Waiting,
    /// No more tries: this page has failed too often too fast. Say so rather than load it again.
    Stop,
}

/// One page's health and attempts to come back.
#[derive(Clone, Debug, Default)]
struct State {
    /// Every failure since the host started (the diagnostics' "crashed N times").
    failures: u32,
    /// The failures within [`LOOP_WINDOW`], newest last: the loop's evidence.
    recent: Vec<Instant>,
    /// The failures since the page last settled: how many times it has been loaded again.
    attempts: u32,
    /// The last failure, if any (the diagnostics' "the last one: …).
    last: Option<Failure>,
    /// A retry waiting for its backoff, and what to do then.
    pending: Option<(Instant, Outcome)>,
    /// Stopped trying (the failures formed a loop, or the retries ran out).
    stopped: bool,
}

/// Every page's health and attempts to come back, under the host's own rules ([`failed`], [`ready`], [`closed`]).
#[derive(Clone, Debug, Default)]
pub struct Registry {
    pages: [State; Page::ALL.len()],
}

impl Registry {
    /// Whether `page` is stopped from coming back (the diagnostics say why from `last`).
    pub fn stopped(&self, page: Page) -> bool {
        self.pages[page.index()].stopped
    }

    /// `page`'s process failed: what to do about it now.
    ///
    /// The page's own process failing loads it again at once; the browser's makes the WebView again at once.
    /// Each failure after that waits its backoff ([`BACKOFF`]) before the next try, [`MAX_RETRIES`] tries in
    /// all; a page failing [`MAX_FAILURES`] times within [`LOOP_WINDOW`] is stopped instead (a loop, recorded).
    /// A failure of a process WebView2 restarts itself is recorded, and then nothing is done.
    pub fn failed(&mut self, page: Page, failure: &Failure) -> Step {
        let state = &mut self.pages[page.index()];
        state.failures = state.failures.saturating_add(1);
        let at = failure.at;
        // A page that ran a while without failing is whole again: its retries start over.
        if state.last.as_ref().is_none_or(|last| at.saturating_duration_since(last.at) >= SETTLE) {
            state.attempts = 0;
            state.pending = None;
        }
        state.last = Some(failure.clone());
        // The loop's evidence: the failures close enough together to be one.
        state.recent.retain(|seen| at.saturating_duration_since(*seen) < LOOP_WINDOW);
        state.recent.push(at);
        // A failure of a process WebView2 starts again itself says nothing of the page.
        let Some(outcome) = failure.outcome() else { return Step::Nothing };
        if state.recent.len() >= MAX_FAILURES {
            state.stopped = true;
            state.pending = None;
            return Step::Stop;
        }
        Self::next(state, outcome, at)
    }

    /// A retry that failed to carry out (the page wouldn't load again, a new WebView wouldn't start): the next
    /// one, as a failure's would be.
    pub fn retry(&mut self, page: Page, outcome: Outcome, now: Instant) -> Step {
        let state = &mut self.pages[page.index()];
        Self::next(state, outcome, now)
    }

    /// The step waiting for its backoff, once it's due (and it's then cleared).
    pub fn ready(&mut self, page: Page, now: Instant) -> Option<Step> {
        let state = &mut self.pages[page.index()];
        let (due, outcome) = state.pending?;
        if now < due {
            return None;
        }
        state.pending = None;
        Some(Self::step(outcome))
    }

    /// When the retry waiting for its backoff is due, if one is.
    pub fn waiting_until(&self, page: Page) -> Option<Instant> {
        self.pages[page.index()].pending.map(|(due, _)| due)
    }

    /// The page's last failure, if any (the error the cabin shows says what it was).
    pub fn last(&self, page: Page) -> Option<Failure> {
        self.pages[page.index()].last.clone()
    }

    /// The page's health as the companion's diagnostics show it.
    pub fn report(&self, page: Page, now: Instant) -> HealthReport {
        let state = &self.pages[page.index()];
        let age = state.last.as_ref().map(|last| now.saturating_duration_since(last.at));
        let recovering = state.pending.is_some() || age.is_some_and(|age| age < SETTLE);
        HealthReport {
            name: page.name(),
            state: if state.stopped {
                HealthState::Stopped
            } else if recovering {
                HealthState::Recovering
            } else {
                HealthState::Ok
            },
            failures: state.failures,
            last_kind: state.last.as_ref().map(|last| last.process.name()),
            last_reason: state.last.as_ref().map(|last| last.why.name()),
            last_exit_code: state.last.as_ref().and_then(|last| last.exit_code),
            last_ago_seconds: age.map(|age| age.as_secs()),
        }
    }

    /// The health of each of `pages`.
    pub fn reports(&self, pages: &[Page], now: Instant) -> Vec<HealthReport> {
        pages.iter().map(|page| self.report(*page, now)).collect()
    }

    /// The page is done with (closed as the app was, or the game closed): a retry waiting for its backoff isn't
    /// owed it, and a page stopped for failing in a loop may be tried again when it's next started (the app asking
    /// for it is a new try). Its failures within [`LOOP_WINDOW`] still count: a page failing again soon after it's
    /// started again is stopped at once (that's the loop, whatever its instances are).
    pub fn closed(&mut self, page: Page) {
        let state = &mut self.pages[page.index()];
        state.pending = None;
        state.stopped = false;
        state.attempts = 0;
    }

    /// The next step for a page that failed (or whose retry couldn't be carried out): at once the first time,
    /// then after each backoff, and no more than [`MAX_RETRIES`] times.
    fn next(state: &mut State, outcome: Outcome, now: Instant) -> Step {
        if state.stopped {
            return Step::Stop;
        }
        // The first failure of a run: the page is loaded again at once.
        if state.attempts == 0 {
            state.attempts = 1;
            return Self::step(outcome);
        }
        // The retries after it wait their backoff, in turn.
        let retry = state.attempts;
        if retry > MAX_RETRIES {
            state.stopped = true;
            state.pending = None;
            return Step::Stop;
        }
        state.attempts = retry + 1;
        state.pending = Some((now + BACKOFF[(retry - 1) as usize], outcome));
        Step::Waiting
    }

    /// `outcome` carried out now: the page reloaded, or its WebView made again.
    fn step(outcome: Outcome) -> Step {
        match outcome {
            Outcome::Reload => Step::Reload,
            Outcome::Recreate => Step::Recreate,
        }
    }
}

thread_local! {
    /// The host thread's registry: WebView2's failures come on the thread its WebViews were made on.
    static HOST: RefCell<Registry> = RefCell::new(Registry::default());
}

/// A page failed on the host thread: what to do about it.
pub fn failed(page: Page, failure: &Failure) -> Step {
    HOST.with_borrow_mut(|registry| registry.failed(page, failure))
}

/// A retry that couldn't be carried out on the host thread: the next one.
pub fn retry(page: Page, outcome: Outcome, now: Instant) -> Step {
    HOST.with_borrow_mut(|registry| registry.retry(page, outcome, now))
}

/// The host thread's step waiting for its backoff, once it's due.
pub fn ready(page: Page, now: Instant) -> Option<Step> {
    HOST.with_borrow_mut(|registry| registry.ready(page, now))
}

/// When the host thread's retry for `page` is due, if one is.
pub fn waiting_until(page: Page) -> Option<Instant> {
    HOST.with_borrow(|registry| registry.waiting_until(page))
}

/// The host thread's health for `page`, as the diagnostics show it.
pub fn report(page: Page, now: Instant) -> HealthReport {
    HOST.with_borrow(|registry| registry.report(page, now))
}

/// The host thread's health for each of `pages`.
pub fn reports(pages: &[Page], now: Instant) -> Vec<HealthReport> {
    HOST.with_borrow(|registry| registry.reports(pages, now))
}

/// The host thread's last failure of `page`, if any.
pub fn last_failure(page: Page) -> Option<Failure> {
    HOST.with_borrow(|registry| registry.last(page))
}

/// Whether the host thread's `page` is stopped from coming back.
pub fn stopped(page: Page) -> bool {
    HOST.with_borrow(|registry| registry.stopped(page))
}

/// The host thread's `page` is done with (closed, or never started again): its retries are dropped.
pub fn closed(page: Page) {
    HOST.with_borrow_mut(|registry| registry.closed(page))
}

/// A page's health, as the companion's diagnostics show it.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    /// The page (`["cabin", "youtube", …]`).
    pub name: &'static str,
    pub state: HealthState,
    /// How many times a process of its WebView failed since WestPlay started.
    pub failures: u32,
    /// The last failure's process (`"the page's process"`), its reason, and its exit code, when it said one.
    pub last_kind: Option<&'static str>,
    pub last_reason: Option<&'static str>,
    pub last_exit_code: Option<i32>,
    /// How long ago that was, in seconds.
    pub last_ago_seconds: Option<u64>,
}

/// A page's health as the diagnostics name it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthState {
    /// Whole: no failure, or the last one long enough ago that the page came back.
    Ok,
    /// Recovering: a retry is waiting for its backoff, or the last failure is recent.
    Recovering,
    /// Stopped: it failed too often, and WestPlay isn't loading it again.
    Stopped,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failure(process: Process, why: Why, exit_code: Option<i32>, at: Instant) -> Failure {
        Failure { process, why, exit_code, description: String::new(), at }
    }

    /// A page's process failure (a crash): the page is loaded again, at once the first time.
    fn crashed(at: Instant) -> Failure {
        failure(Process::Renderer, Why::Crashed, Some(-1073741819), at)
    }

    #[test]
    fn maps_every_kind_of_process_webview2_names() {
        assert_eq!(Process::of_kind(0), Process::Browser);
        assert_eq!(Process::of_kind(1), Process::Renderer);
        assert_eq!(Process::of_kind(2), Process::Unresponsive);
        assert_eq!(Process::of_kind(3), Process::FrameRenderer);
        assert_eq!(Process::of_kind(4), Process::Utility);
        assert_eq!(Process::of_kind(5), Process::Other(5));
        assert_eq!(Process::of_kind(6), Process::Gpu);
        assert_eq!(Process::of_kind(9), Process::Other(9));
        // What WestPlay does about each: the page loaded again, the WebView made again, or WebView2's own.
        assert_eq!(Process::Browser.outcome(), Some(Outcome::Recreate));
        assert_eq!(Process::Renderer.outcome(), Some(Outcome::Reload));
        assert_eq!(Process::Unresponsive.outcome(), Some(Outcome::Reload));
        assert_eq!(Process::FrameRenderer.outcome(), None);
        assert_eq!(Process::Gpu.outcome(), None);
        assert_eq!(Process::Utility.outcome(), None);
        assert_eq!(Process::Other(5).outcome(), None);
        // A browser's failure outranks a page's.
        assert!(Outcome::Recreate > Outcome::Reload);
    }

    #[test]
    fn maps_every_reason_webview2_names() {
        assert_eq!(Why::of_reason(0), Why::Unexpected);
        assert_eq!(Why::of_reason(1), Why::Unresponsive);
        assert_eq!(Why::of_reason(2), Why::Terminated);
        assert_eq!(Why::of_reason(3), Why::Crashed);
        assert_eq!(Why::of_reason(4), Why::LaunchFailed);
        assert_eq!(Why::of_reason(5), Why::OutOfMemory);
        assert_eq!(Why::of_reason(6), Why::ProfileDeleted);
        assert_eq!(Why::of_reason(7), Why::Other(7));
    }

    #[test]
    fn says_a_failure_in_a_line() {
        let at = Instant::now();
        let line = failure(Process::Renderer, Why::Crashed, Some(-1073741819), at).line();
        assert_eq!(
            line,
            "the page's process failed: it crashed, exit code 0xC0000005: the page is loaded again"
        );
        // What WebView2 called the process comes after its exit code.
        let line = Failure {
            process: Process::Browser,
            why: Why::Terminated,
            exit_code: Some(0),
            description: "Renderer".into(),
            at,
        }
        .line();
        assert_eq!(
            line,
            "the browser process failed: it was ended, exit code 0x00000000, Renderer: the WebView has to be made again"
        );
        // A process WebView2 restarts itself: nothing for WestPlay to do.
        let gpu = Failure { process: Process::Gpu, why: Why::Crashed, exit_code: Some(1), description: String::new(), at };
        let line = gpu.line();
        assert!(line.ends_with("WebView2 restarts it itself"), "{line}");
        assert_eq!(Why::Unresponsive.said(), "it stopped responding");
    }

    #[test]
    fn loads_a_page_again_at_once_then_after_each_backoff_and_then_stops() {
        let mut registry = Registry::default();
        let start = Instant::now();
        // The first failure: at once.
        assert_eq!(registry.failed(Page::Cabin, &crashed(start)), Step::Reload);
        // The ones after it: 0.5 s, 2 s, 5 s, and no more.
        for (index, backoff) in BACKOFF.into_iter().enumerate() {
            let at = start + Duration::from_secs(10 * (index as u64 + 1));
            assert_eq!(registry.failed(Page::Cabin, &crashed(at)), Step::Waiting, "retry {index}");
            assert_eq!(registry.waiting_until(Page::Cabin), Some(at + backoff));
            // Not due yet, then due: the page is loaded again (the failure's outcome).
            assert_eq!(registry.ready(Page::Cabin, at + backoff - Duration::from_millis(1)), None);
            assert_eq!(registry.ready(Page::Cabin, at + backoff), Some(Step::Reload));
            assert_eq!(registry.ready(Page::Cabin, at + backoff), None, "once");
        }
        // The retries are spent: the page isn't loaded again, and the diagnostics say it stopped.
        assert_eq!(registry.failed(Page::Cabin, &crashed(start + Duration::from_secs(60))), Step::Stop);
        assert!(registry.stopped(Page::Cabin));
        assert_eq!(registry.report(Page::Cabin, start + Duration::from_secs(60)).state, HealthState::Stopped);
    }

    /// A page that comes back each time and fails again, every minute or so, is failing in a loop too: WestPlay
    /// stops trying (the retries' own walks never run, the page settles between its failures).
    #[test]
    fn stops_a_page_failing_in_a_loop() {
        let mut registry = Registry::default();
        let start = Instant::now();
        let mut steps = Vec::new();
        for index in 0..MAX_FAILURES {
            // Forty seconds apart: each failure settles, and is loaded again at once.
            steps.push(registry.failed(Page::Youtube, &crashed(start + Duration::from_secs(40 * index as u64))));
        }
        assert_eq!(steps, [Step::Reload, Step::Reload, Step::Reload, Step::Reload, Step::Stop]);
        assert!(registry.stopped(Page::Youtube));
        let report = registry.report(Page::Youtube, start + Duration::from_secs(200));
        assert_eq!(report.state, HealthState::Stopped);
        assert_eq!(report.failures, MAX_FAILURES as u32);
        // The other pages are untouched.
        assert!(!registry.stopped(Page::Spotify));
        assert_eq!(registry.failed(Page::Spotify, &crashed(start)), Step::Reload);
        // Closed as the app was, and started again: it may be tried once more — but a failure this soon after
        // is the loop still, and it's stopped at once.
        registry.closed(Page::Youtube);
        assert!(!registry.stopped(Page::Youtube));
        assert_eq!(registry.failed(Page::Youtube, &crashed(start + Duration::from_secs(210))), Step::Stop);
    }

    /// A page that fails, comes back and runs on is whole again after a while: its retries start over.
    #[test]
    fn a_page_that_ran_a_while_starts_its_retries_over() {
        let mut registry = Registry::default();
        let start = Instant::now();
        assert_eq!(registry.failed(Page::Cabin, &crashed(start)), Step::Reload);
        assert!(matches!(registry.failed(Page::Cabin, &crashed(start + Duration::from_secs(10))), Step::Waiting));
        // Ten minutes later it failed again: that's a new run of failures.
        let later = start + Duration::from_secs(600);
        assert_eq!(registry.ready(Page::Cabin, later + Duration::from_secs(10)), Some(Step::Reload));
        assert_eq!(registry.failed(Page::Cabin, &crashed(later)), Step::Reload);
    }

    /// A process WebView2 restarts itself (its GPU's, a utility's) is recorded, and nothing is reloaded.
    #[test]
    fn leaves_a_process_webview2_restarts_itself_to_it() {
        let mut registry = Registry::default();
        let start = Instant::now();
        let gpu = failure(Process::Gpu, Why::Crashed, Some(1), start);
        assert_eq!(registry.failed(Page::Cabin, &gpu), Step::Nothing);
        assert_eq!(registry.waiting_until(Page::Cabin), None);
        let report = registry.report(Page::Cabin, start + Duration::from_secs(1));
        assert_eq!(report.failures, 1);
        assert_eq!(report.last_kind, Some("the GPU process"));
        // Its health stands (the page may still be whole), but the count says a process of it failed.
        assert_eq!(report.state, HealthState::Recovering);
        assert_eq!(report.last_ago_seconds, Some(1));
    }

    /// A browser's failure makes the WebView again (a new environment), and its retries wait as a page's do.
    #[test]
    fn makes_the_webview_again_after_the_browser_leaves() {
        let mut registry = Registry::default();
        let start = Instant::now();
        let gone = failure(Process::Browser, Why::Terminated, Some(0), start);
        assert_eq!(registry.failed(Page::Spotify, &gone), Step::Recreate);
        let at = start + Duration::from_secs(10);
        assert_eq!(registry.failed(Page::Spotify, &gone.clone().with(at)), Step::Waiting);
        assert_eq!(registry.ready(Page::Spotify, at + BACKOFF[0]), Some(Step::Recreate));
        // The next failure waits the second backoff; a stopped page says so.
        assert_eq!(registry.failed(Page::Spotify, &gone.with(at + Duration::from_secs(20))), Step::Waiting);
        assert_eq!(registry.ready(Page::Spotify, at + Duration::from_secs(22)), Some(Step::Recreate));
    }

    impl Failure {
        /// The same failure, reported at another time.
        fn with(mut self, at: Instant) -> Self {
            self.at = at;
            self
        }
    }

    /// A retry that couldn't be carried out counts as an attempt, as a failure does.
    #[test]
    fn a_retry_that_couldnt_be_carried_out_takes_the_next_one() {
        let mut registry = Registry::default();
        let start = Instant::now();
        assert_eq!(registry.failed(Page::Cabin, &crashed(start)), Step::Reload);
        // The reload itself failed (the page wouldn't load): the next try waits.
        assert_eq!(registry.retry(Page::Cabin, Outcome::Reload, start), Step::Waiting);
        assert_eq!(registry.waiting_until(Page::Cabin), Some(start + BACKOFF[0]));
    }

    #[test]
    fn says_a_pages_health_for_the_diagnostics() {
        let mut registry = Registry::default();
        let start = Instant::now();
        assert_eq!(registry.report(Page::Cabin, start), HealthReport {
            name: "cabin",
            state: HealthState::Ok,
            failures: 0,
            last_kind: None,
            last_reason: None,
            last_exit_code: None,
            last_ago_seconds: None,
        });
        let broken = Failure {
            process: Process::Renderer,
            why: Why::Crashed,
            exit_code: Some(-1073741819),
            description: "Renderer".into(),
            at: start,
        };
        registry.failed(Page::Cabin, &broken);
        let report = registry.report(Page::Cabin, start + Duration::from_secs(2));
        assert_eq!(report.failures, 1);
        assert_eq!(report.state, HealthState::Recovering);
        assert_eq!(report.last_reason, Some("crashed"));
        assert_eq!(report.last_exit_code, Some(-1073741819));
        assert_eq!(report.last_ago_seconds, Some(2));
        // The JSON the companion's status carries: camelCase, names only (never anything of the player's).
        let json = serde_json::to_string(&report).unwrap();
        assert_eq!(
            json,
            r#"{"name":"cabin","state":"recovering","failures":1,"lastKind":"the page's process","lastReason":"crashed","lastExitCode":-1073741819,"lastAgoSeconds":2}"#
        );
        // Long after it came back: whole, its count still saying it crashed once.
        let later = registry.report(Page::Cabin, start + SETTLE + Duration::from_secs(1));
        assert_eq!(later.state, HealthState::Ok);
        assert_eq!(later.failures, 1);
        let json = serde_json::to_string(&registry.reports(&[Page::Cabin, Page::Youtube], start)).unwrap();
        assert!(json.contains(r#""name":"youtube""#), "{json}");
        assert_eq!(serde_json::to_string(&HealthState::Stopped).unwrap(), r#""stopped""#);
    }
}
