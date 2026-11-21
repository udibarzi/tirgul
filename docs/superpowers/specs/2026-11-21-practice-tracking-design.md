# Practice tracking, goals and parent report — design

Date: 2026-11-21 · Status: draft for approval. Decisions marked *(my call)* were made by Claude after a review and are open to change.

## Why

Two girls use the app to improve their English: one in grade 5, one in grade 8. The parent wants to:

- set a weekly goal for each girl, for example "60 minutes a week, on at least 3 days";
- see whether each girl met it;
- see what she actually did: how much time, how many questions and flashcards, right and wrong answers, which topics, and which words she keeps missing.

The parent also wants each girl to see her own progress toward the goal.

The app today is a static GitHub Pages site. Everything it knows lives in `localStorage` on the device where she practices. For the parent to see a report, practice data has to leave the device. The parent chose to send it to **a Google Sheet in their own Google account**, through a small Google Apps Script web app.

## Goals

- Count **active** practice time: the page is visible **and** she interacted within the last 60 seconds. An app left open on the table, or running in the background, adds nothing.
- Count activity: questions answered (right/wrong), flashcards (knew / not yet), sessions and practice days. Break it down by topic, level (words/sentences) and exercise type.
- **Reliable delivery.** Nothing is lost if she just stops, closes the tab, loses internet, or the phone kills the browser; unsent data goes out the next time the app opens. Nothing is counted twice.
- One spreadsheet for both girls; the parent can browse the raw data, one row per event.
- A parent report page showing both girls side by side, with goals the parent can edit there.
- A weekly progress line on the girl's home screen, e.g. `השבוע: 42 / 60 דק׳ · 2 / 3 ימים`.
- A shared device works: a "מי מתרגלת?" (who's practicing?) step, and each girl's local progress kept separate.

## Non-goals

- Real accounts or logins.
- Tamper-proofing. A determined kid could send fake data, and that's accepted.
- Live, second-by-second reporting. A delay of about a minute is fine.
- Tracking the grade 4 speed drills (`speed.html`, `speed-semifinal.html`). Grade 4/7 math quizzes in `quiz.html` *are* tracked, because the same code path covers them for free.

## Anti-goals (would make it a failure even if it "works")

- The sheet address or any key in the public repo.
- Tracking that slows practice down, or that breaks the app when offline or before setup. Without setup, the app must behave as it does today, apart from "שינוי שם" becoming a learner chooser (see Learners).
- Storing anything personal beyond a first name or nickname: no email, location, device identifiers or free text the child typed. Typed spelling answers are stored, because they show *how* she misspelled; nothing else she types is.
- Mixing up the two girls' data.

## Constraints

- Vanilla static site, no build step (see `CLAUDE.md`). New code goes in plain JS files under `app/`.
- Hebrew RTL UI; follow the existing BiDi rules. English goes in its own `dir="ltr"` elements, never through `fixBidi()`.
- Apps Script web app limits: it must be deployed "execute as me, access: anyone". Requests must be "simple" CORS requests (POST with a `text/plain` body, GET with query params) to avoid preflight.
- The parent does the Google side by hand, about 5 minutes. We can't deploy it for them.

## Approaches considered

1. **Report on the girl's own device.** No server; a parent screen inside the app. Rejected: the parent has to pick up each girl's device, and the history disappears if the browser data is cleared.
2. **Google Sheet + Apps Script (chosen).** Free, and the data stays in the parent's Google account. The parent can open the raw sheet, and setup is small.
3. **Hosted database (Firebase/Supabase).** Rejected: accounts, API keys and rules to manage, which is overkill for two users.

## Design

### Pieces

| File | What it is |
|------|-----------|
| `app/tracker.js` | New. Learner profiles, active-time counting, event outbox, sending, the weekly-progress line. Loaded by `index.html`, `app/quiz.html`, `app/vocab.html`. |
| `_tracking/Code.gs` | New. The Apps Script source, committed. It holds **no secrets**: keys are generated into Script Properties at setup. |
| `_tracking/SETUP.md` | New. Step-by-step setup for the parent, in Hebrew. |
| `app/report.html` | New. The parent report page. |
| `index.html` | Who's-practicing step, setup-link handling, weekly-progress line. |
| `app/quiz.html`, `app/vocab.html` | Report each answer and flashcard to the tracker. |

### Keys and links (security)

- `setup()` in `Code.gs` generates two random keys into Script Properties: `WRITE_KEY` (lets the girls' devices add events and read their learner list, goals and own weekly totals) and `PARENT_KEY` (lets the report page read everything and edit goals).
- After deploying, the parent runs `showLinks()`. It logs two links built from `ScriptApp.getService().getUrl()`:
  - **Device setup link:** `https://udibarzi.github.io/tirgul/#setup=<base64url({url, key: WRITE_KEY})>`
  - **Parent report link:** `https://udibarzi.github.io/tirgul/app/report.html#setup=<base64url({url, key: PARENT_KEY})>`
- The config sits in the URL **hash**, so it is never sent to GitHub's servers. The page stores it in `localStorage` (`tirgul_sync` on devices, `tirgul_report` on the parent's device), then removes the hash from the address bar with `history.replaceState`.
- Every request carries the key, and the script rejects a missing or wrong key. A write key can't read events.

### Learners and the who's-practicing step

- The **`learners` tab** in the sheet is the source of truth for names: `name | grade | gender | minutesPerWeek | daysPerWeek | active`. The parent fills it in during setup, for example `נועה | 5 | female | 60 | 3`. Using exact names from the sheet means no typos split one girl into two.
- A configured device fetches the learner list on load (`GET ?action=learners&key=WRITE_KEY`) and caches it in `localStorage`, so it also works offline.
- **Home screen:**
  - **Configured device:** if more than one learner is active, show a "מי מתרגלת?" screen with a large card per girl. The chosen girl's grade and gender come from the sheet, so there are no grade or gender pickers. A small "החלפה" (switch) link on the topics screen goes back to the chooser. The last choice is remembered, but with 2+ learners the chooser is shown on every fresh app open, because a shared device is the risk. With exactly one learner, go straight in.
  - **Unconfigured device** *(my call)*: keep today's name → grade → gender flow for adding a learner, but grade and gender are now stored **per learner** in a local profile list (`tirgul_profiles`). "שינוי שם" becomes the same "מי מתרגלת?" chooser, listing the names used on this device plus "add new". This is the only change on an unconfigured device. Events are still recorded locally, capped (see Outbox), and are sent if setup happens later.
  - **Typed names vs sheet names** *(my call)*: when a device is set up for the first time and it already has local learners whose names aren't in the sheet's list, it asks once: "who was practicing on this device until now?", with one row per local name and a choice of the sheet's girls or "neither". The answer renames that learner's local progress keys and the events still waiting in the outbox. "Neither" leaves them as they are. The server **accepts** events for unknown names, so nothing is lost; the report shows them in a small "other names" section so the parent can spot a mix-up.
  - **History on an already shared device** *(my call)*: on an unconfigured device both girls may already share one set of un-prefixed keys. All of it goes to the learner currently in `math_app_username`. The amount is small (days of use), and splitting it afterwards isn't possible.
- **Separate local progress per learner.** The topic-card progress (`ProgressManager`, prefix `math_app_`) and the per-word stats (`VocabStats`, prefix `tirgul_vocab_`) are keyed by learner, e.g. `math_app__<learner>_<topic>` and `tirgul_vocab_<learner>_<topic>`. The current learner's name is available to all pages via `localStorage` (`tirgul_current_learner`) and the existing `name` URL param. **Migration:** on the first run after this change, existing un-prefixed keys are moved to the learner currently stored in `math_app_username`, so nothing she's done is lost.

### What gets recorded (events)

Each event is one row in the `events` tab:

| Column | Meaning |
|--------|---------|
| `id` | random UUID made on the device; used to drop duplicates |
| `ts` | ISO time on the device |
| `learner` | name, exactly as in the `learners` tab |
| `type` | `time` · `answer` · `card` · `session` |
| `topic` | topic id, e.g. `english-food-5` |
| `level` | `words` / `sentences` / empty for math |
| `mode` | session mode from the URL, e.g. `mix`, `order`, `cards` |
| `kind` | question kind, e.g. `cloze`, `write`, `listen`, `free-input` (math) |
| `item` | English item (`word.en`) for vocab; for math, the first 60 characters of the question text |
| `correct` | `1` / `0` for answer and card events (card: knew = 1) |
| `given` | only for the vocab `write` kind: what she typed, max 60 characters. Math typed answers are **not** stored *(my call)* |
| `seconds` | for `time` events: active seconds in that slice |

- `session`: one event when a quiz or flashcard deck starts, carrying topic, level and mode. This gives the session counts.
- `time`: once a minute while there is unsent active time, and on page hide. Each covers the active seconds since the last `time` event for that page. Its `topic` is whatever the page is showing, or `menu` on `index.html` / the vocab menu.
- **What counts toward the goal** *(my call)*: only practice time, meaning `time` events whose topic is **not** `menu`. That covers quizzes including their results screen, flashcards and the word list. Menu time is recorded but excluded from weekly minutes and from the 5-minute practice-day rule, both in `?action=week` and in the report. The report shows menu time as one small separate number.
- `answer`: from `recordResult` in `quiz.html`, for every question kind.
- `card`: from `answerCard` in `vocab.html`.

### Active-time rule

A per-page counter adds one second each second while `document.visibilityState === 'visible'` **and** the last `pointerdown` / `keydown` / `touchstart` was under 60 seconds ago. Audio playing does not count as activity, because the girl has to tap. Seconds go into the outbox as `time` events as described above.

### Outbox and sending

- Outbox: `localStorage['tirgul_outbox']`, a JSON array of events. It's capped at 5,000 events; past the cap, drop the oldest `time` events first, then the oldest of any type. Every write is wrapped in try/catch: storage failing must never break practice.
- **When it sends**
  - on page load;
  - every 60 seconds while the page is open and the outbox isn't empty;
  - on `visibilitychange` → hidden, and on `pagehide`.
- **How it sends**
  - Normal sends: `fetch(url, {method: 'POST', body: JSON.stringify({key, events}), headers: {'Content-Type': 'text/plain'}})`, at most 300 events per request. On a response `{ok: true, saved: [...ids], dup: [...ids]}`, remove those ids from the outbox. On any failure, keep them and retry on the next trigger.
  - On hide: `navigator.sendBeacon(url, body)`. There's no response, so the events **stay** in the outbox and are confirmed by the next normal send. The server drops the duplicates.
- **Server dedupe:** `doPost` takes a `LockService` script lock, reads the existing `id` column, appends only new ids, then releases the lock. That's fine at this size (thousands of rows a month).

### Apps Script API (`_tracking/Code.gs`)

All responses are JSON via `ContentService`.

| Request | Key | Returns / does |
|---------|-----|----------------|
| `POST {key, events}` | write | append new events → `{ok, saved, dup}` |
| `GET ?action=learners` | write | active learners with grade, gender and goals |
| `GET ?action=week&learner=X` | write | this week's active minutes and practice days for X, for the home-screen line |
| `GET ?action=events&from=YYYY-MM-DD&to=YYYY-MM-DD` | parent | raw events in the range, max 12 weeks |
| `POST {key, action: 'setGoal', learner, minutesPerWeek, daysPerWeek}` | parent | updates the `learners` row |

The week runs **Sunday to Saturday**, in time zone `Asia/Jerusalem`, set in the script and the sheet. A **practice day** is a day with at least 5 active minutes, so opening the app for 20 seconds doesn't count as a day.

### Home-screen progress line (for the girl)

- Shown on the topics screen under her name, only when she has a goal: `השבוע: 42 / 60 דק׳ · ימים: 2 / 3` with a small progress bar. When she meets the goal it changes to a celebratory line, gender-aware like the rest of the app.
- The numbers come from `?action=week` when online. If the request fails or the device isn't configured, it falls back to a local weekly summary that the tracker keeps on that device.

### Parent report (`app/report.html`)

- Opened via the parent link; later visits use the stored config. Without a config it shows a short explanation of how to set up.
- A week picker (this week, last week, …) and a column per girl, stacked on a phone:
  - **Goal:** minutes bar against the goal, and a Sun–Sat row of day dots with practice days filled in and the goal day count.
  - **Activity:** sessions, questions answered, flashcards, and the right/wrong share.
  - **By topic:** a table of topic name, minutes, questions, % right. Topic names come from `content/manifest.json`.
  - **By exercise type:** questions and % right per kind.
  - **Keeps missing:** the 10 items she most often got wrong in the last 4 weeks that she hasn't since got right twice in a row. Typed answers show what she wrote.
  - **Trend:** active minutes for each of the last 6 weeks.
- **Edit goals** per girl, saved through `setGoal`.
- All totals are computed in the page from the raw events, so the reports can change later without touching the script.

### Setup steps for the parent (`_tracking/SETUP.md`)

1. Create a Google Sheet named "tirgul". Then go to Extensions → Apps Script, paste in `Code.gs`, and save.
2. Run `setup` once and approve the permission request. There will be an "unverified app" warning: Advanced → Go to project. This creates the `events` and `learners` tabs and the keys.
3. Fill in the `learners` tab: one row per girl.
4. Deploy → New deployment → Web app: execute as **me**, access **anyone**. Copy nothing yet.
5. Run `showLinks` and copy the two links from the log. Open the device link once on each girl's device, and the parent link on your own phone.

### Testing

- **Node tests** for `tracker.js`: the active-time rule with a fake clock and fake visibility; the outbox cap; removal only after a confirmed send; the beacon path keeping events; and migrating local keys to learner prefixes.
- **Node tests** for `Code.gs`, with small mocks of `SpreadsheetApp`, `LockService` and `PropertiesService`: key checks, dedupe, the week calculation in Asia/Jerusalem, and `setGoal`.
- **Browser test (Playwright)** against a local mock of the web app: the chooser on a 2-learner device, then events flowing for a quiz and a flashcard deck, retry after a failed send, the home-screen line, and the report page rendering from mock events.
- The real Google deployment can only be checked once the parent completes setup. The SETUP.md includes a "send a test event" step: `showLinks` also offers a `ping` function that appends one test row.

## Left to the builder

- The exact UI layout and wording of the chooser, the home-screen line and the report, following the existing style.
- Internal structure of `tracker.js` and `Code.gs`, and how the Node mocks are built.
- Whether the report also shows a "last practiced" time for each girl. Nice, but optional.
