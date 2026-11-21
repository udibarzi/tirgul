# Practice Tracking, Goals & Parent Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record each girl's active practice time and activity on her device, deliver it reliably to a Google Sheet through an Apps Script web app, and show goals and progress to the girl (a home-screen line) and to the parent (a report page).

**Architecture:**
- `app/tracker.js` is a pure, injectable module (`createTracker(env)`) with a thin browser wrapper. It owns learner profiles, per-learner storage keys, the active-time counter, the event outbox, sending, and the local weekly summary.
- `_tracking/Code.gs` is the Apps Script. It runs unchanged in Node through `tests/gas-mocks.js`, which also powers a local mock server for browser tests.
- `app/report.js` holds pure aggregation functions; `app/report.html` renders them.

**Tech Stack:**
- Vanilla JS, no build step.
- Google Apps Script (V8).
- Node's built-in test runner: `node --test`.
- Playwright for browser tests, installed in the session scratchpad and not committed. Run e2e with `NODE_PATH=<scratchpad>/pw/node_modules`.

**Spec:** `docs/superpowers/specs/2026-11-21-practice-tracking-design.md`

## Global Constraints

- Vanilla static site, no build step, no `package.json`. New browser code is plain `<script>` files that also `module.exports` for Node, like `app/vocab.js`.
- No sheet URL or key in the repo. Config arrives only through the URL hash `#setup=<base64url(JSON {url, key})>`, is stored in `localStorage` (`tirgul_sync` on devices, `tirgul_report` on the report page), and is then stripped with `history.replaceState`.
- Every `localStorage` access is wrapped in try/catch. Tracker failures must never break practice. Without config, the app behaves as today, except that "שינוי שם" becomes a learner chooser.
- Hebrew RTL UI: English text goes in `dir="ltr"` elements; no Hebrew inside parentheses (see `CLAUDE.md`).
- Requests are CORS-simple only: `POST` with `Content-Type: text/plain`, and `GET` with query params.
- **Week and goal rules:**
  - The week is Sunday to Saturday, time zone `Asia/Jerusalem`.
  - Only `time` events with `topic !== 'menu'` count toward goal minutes.
  - A practice day is a day with ≥ 5 active goal minutes (300 s).
- **Outbox:**
  - Capped at 5,000 events; past the cap, drop the oldest `time` events first, then the oldest of any type.
  - Each send carries at most 300 events.
  - Sends happen every 60 s, on load, and as a beacon on hide.
  - Active time requires the page to be visible and an interaction (`pointerdown` / `keydown` / `touchstart`) within the last 60 s.
- `given` is stored only for the vocab `write` kind, truncated to 60 chars. `item` for math is the first 60 chars of the question text.
- Storage keys: current learner `tirgul_current_learner`; profiles `tirgul_profiles`; sheet learner cache `tirgul_learners`; outbox `tirgul_outbox`; per-day seconds `tirgul_days__<name>`; topic progress prefix `math_app__<name>`; vocab stats `tirgul_vocab__<name>_<topicId>`; migration flag `tirgul_migrated_v1`. The legacy keys `math_app_username`, `math_app_grade` and `math_app_gender` stay in sync with the current learner, because `speed*.html` reads the gender key.

## Review Focus

1. **Shared device, two quick switches:** girl A practices, switches to B, B practices. Every event and progress key must land under the right name, including events still waiting in the outbox. → Task 1 test `switching learner does not relabel queued events`, Task 4 e2e `two learners on one device`.
2. **Server unreachable for days** (offline, or the script isn't deployed yet): the outbox keeps growing to the cap and then sends everything once it's reachable, with nothing duplicated in the sheet. → Task 2 test `outbox survives failures and caps`, Task 3 test `same id twice saves once`.
3. **Midnight and week boundaries in Israel time:** a session at Saturday 23:58 → Sunday 00:03 local splits correctly by day and week, and the server and report agree. → Task 3 test `week boundary Asia/Jerusalem`, Task 5 test `report week matches server week`.
4. **Existing users after the update:** a device with today's un-prefixed progress must show the same topic percentages and "words to strengthen" after migration, under the current name. → Task 1 test `migrates legacy keys once`.
5. **Hebrew names and odd characters** (`נועה`, spaces, the gershayim `״`) used as storage-key parts, in the sheet, and in URLs. → Task 1 test `hebrew names round-trip`, Task 4 e2e uses Hebrew names.

---

### Task 1: Tracker — learners, per-learner keys, migration

**Files:**
- Create: `app/tracker.js`
- Create: `tests/tracker.learners.test.js`
- Create: `tests/helpers/fake-env.js`

**Interfaces:**
- Produces (in `app/tracker.js`):
  - `createTracker(env) -> Tracker`. `env = { storage, now: () => ms, fetch, sendBeacon, uuid: () => string }`, where `storage` has the Web Storage API (`getItem`, `setItem`, `removeItem`, `key(i)`, `length`). In the browser, `window.Tracker = createTracker(browserEnv)` is created at load. Also `module.exports = { createTracker, weekStartKey, dayKey }`.
  - `Profile = { name, grade: number, gender: 'female'|'male', minutesPerWeek?: number, daysPerWeek?: number, fromSheet: boolean }`.
  - `tracker.getConfig() -> {url, key} | null`
  - `tracker.applySetupHash(hash: string) -> boolean`: parses `#setup=<base64url JSON>`, stores it in `tirgul_sync`, and returns true if applied.
  - `tracker.getProfiles() -> Profile[]`: sheet learners (active only) first, then local-only profiles.
  - `tracker.addLocalProfile(p: Profile)`
  - `tracker.setSheetLearners(list: Profile[])`: caches the list in `tirgul_learners`.
  - `tracker.getCurrent() -> Profile | null`
  - `tracker.setCurrent(name: string)`: also writes `math_app_username`, `math_app_grade` and `math_app_gender`.
  - `tracker.progressPrefix() -> string`, e.g. `'math_app__נועה'`, for `new ProgressManager(prefix)`.
  - `tracker.vocabKey(topicId) -> string`
  - `tracker.migrateLegacy()`: idempotent.
  - `tracker.unmappedLocalNames() -> string[]`: names of local profiles that aren't sheet learners.
  - `tracker.mapLearner(from: string, to: string | null)`: with `to` null, only marks the name as handled.
- `tests/helpers/fake-env.js` exports `fakeEnv({ now?, fetchImpl? }) -> env`, with an in-memory storage, a controllable clock (`env.advance(ms)`), a recorded `fetch`/`sendBeacon`, and a counter-based `uuid`.

- [ ] **Step 1: Write failing tests** in `tests/tracker.learners.test.js` (node:test + assert):
  - `migrates legacy keys once`: storage has `math_app_username='נועה'`, `math_app_food-5='{"correct":3,"total":4}'`, `tirgul_vocab_english-food-5='{"apple":{"r":1,"w":0}}'` and `tirgul_vocab_pref_n='20'`. After `migrateLegacy()`:
    - `math_app__נועה_food-5` and `tirgul_vocab__נועה_english-food-5` hold the old values;
    - the old topic keys are gone;
    - `tirgul_vocab_pref_n` and `math_app_username/grade/gender` are untouched;
    - a second call changes nothing.
  - `hebrew names round-trip`: `addLocalProfile({name:'נועה בר', grade:5, gender:'female'})`, then `setCurrent('נועה בר')` → `getCurrent().name === 'נועה בר'`, `progressPrefix() === 'math_app__נועה בר'`, `math_app_gender === 'female'`.
  - `sheet learners first and exact`: after `setSheetLearners([{name:'נועה',grade:5,gender:'female',minutesPerWeek:60,daysPerWeek:3,fromSheet:true}])` plus a local profile `'noa'` → `getProfiles().map(p=>p.name)` deep-equals `['נועה','noa']`, and `unmappedLocalNames()` deep-equals `['noa']`.
  - `mapLearner moves keys and queued events`: local `'noa'` has `math_app__noa_food-5` and one outbox event with `learner:'noa'`. `mapLearner('noa','נועה')` → the key becomes `math_app__נועה_food-5`, the event's learner is `'נועה'`, `'noa'` is no longer in `unmappedLocalNames()`, and the current learner, if it was `'noa'`, is now `'נועה'`.
  - `applySetupHash`: `'#setup=' + base64url(JSON.stringify({url:'https://x/exec',key:'k1'}))` → returns true and `getConfig()` deep-equals the object. `'#foo'` → false.
  - `switching learner does not relabel queued events`: write the outbox directly with an event for A, then `setCurrent('B')` → the event still says A.
- [ ] **Step 2:** Run `node --test tests/` → FAIL (`createTracker` is not defined).
- [ ] **Step 3: Implement** the Task 1 interface in `app/tracker.js`. Base64url decode: `atob` in the browser, `Buffer` in Node. Use `decodeURIComponent(escape(...))`-safe UTF-8 handling. Migration scans `storage.key(i)`:
  - topic keys match `^math_app_(?!_)(?!username$|grade$|gender$)(.+)$`;
  - vocab keys match `^tirgul_vocab_(?!_)(?!pref_)(.+)$`.
- [ ] **Step 4:** Run `node --test tests/` → PASS.
- [ ] **Step 5:** Commit: `git add app/tracker.js tests && git commit -m "tracker: learner profiles, per-learner keys, legacy migration"`

### Task 2: Tracker — events, active time, outbox, sending, local week

**Files:**
- Modify: `app/tracker.js`
- Create: `tests/tracker.events.test.js`

**Interfaces:**
- Consumes: Task 1 `createTracker`, `fakeEnv`.
- Produces:
  - `Event = { id, ts: ISO string, learner, type: 'time'|'answer'|'card'|'session', topic, level, mode, kind, item, correct: 1|0|'', given, seconds }`. Unused fields are `''`.
  - `tracker.setPage({topic, level?, mode?})`: the current page context; `topic` is `'menu'` for menus.
  - `tracker.session()`: queues a session event for the current page.
  - `tracker.answer({kind, item, correct: boolean, given?})`, `tracker.card({item, correct: boolean})`
  - `tracker.activity()`, `tracker.tick(visible: boolean)` (called once per second), `tracker.flushTime()`
  - `tracker.outbox() -> Event[]`
  - `tracker.send() -> Promise<{sent: number, ok: boolean}>`
  - `tracker.beacon()`
  - `tracker.localWeek(name, nowMs?) -> {minutes: number, days: number}`
  - `tracker.fetchLearners() -> Promise<Profile[]|null>`, `tracker.fetchWeek(name) -> Promise<{minutes, days}|null>`
  - Module exports `weekStartKey(date) -> 'YYYY-MM-DD'` (the Sunday of the local week) and `dayKey(date) -> 'YYYY-MM-DD'`, both in device local time.
  - Browser-only `tracker.attach()`:
    - listeners for `pointerdown`, `keydown` and `touchstart` call `activity()`;
    - a 1 s interval calls `tick(document.visibilityState === 'visible')`;
    - a 60 s interval calls `flushTime()` and then `send()` if the outbox isn't empty;
    - `visibilitychange` → hidden and `pagehide` call `flushTime()` and then `beacon()`;
    - on load it calls `send()`.

- [ ] **Step 1: Write failing tests** in `tests/tracker.events.test.js`:
  - `counts only visible and recently active seconds`:
    - `activity()`, then 30 × (`advance(1000)`; `tick(true)`), then 70 more ticks with no activity, then `flushTime()` → one time event with `seconds` 60;
    - 10 ticks with `tick(false)` after `activity()` → no time event.
  - `event fields`: after `setPage({topic:'english-food-5',level:'words',mode:'write'})`:
    - `answer({kind:'write',item:'apple',correct:false,given:'x'.repeat(80)})` → `correct===0`, `given.length===60`, learner is the current name, and `id` and `ts` are set;
    - `answer({kind:'free-input',item:'q',correct:true,given:'42'})` → `given===''`.
  - `send removes only confirmed ids`: queue 3 events; the fake fetch returns `{ok:true,saved:[id1],dup:[id2]}` → `outbox()` holds only id3. Check the request body JSON is `{key, events}` and the header is `text/plain`.
  - `outbox survives failures and caps`: fetch rejects → all events stay and `send()` resolves `{ok:false}`. Push 5,010 events (5,005 `time` + 5 `answer`) → length 5,000, all 5 answers kept, and the oldest time events dropped. 700 queued → `send()` posts 300.
  - `beacon keeps events`: `beacon()` calls `sendBeacon` once with the same body format, and the outbox is unchanged.
  - `local week`: time events of 200 s on two different days of the same week, plus 400 s on a third day → `localWeek(name)` is `{minutes: 13, days: 1}`. Menu time is ignored, and the days count only those ≥ 300 s. Minutes are rounded down from goal seconds.
  - `no config → send is a no-op`: `send()` resolves `{ok:false, sent:0}` without calling fetch, and the events stay queued.
- [ ] **Step 2:** Run `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** the Task 2 interface in `app/tracker.js`.
  - `tick` adds a second when `visible && now - lastActivity < 60000`.
  - Each time event adds its goal seconds into `tirgul_days__<name>` (`{dayKey: seconds}`, pruned to 60 days) as it's queued.
  - `fetchLearners`: `GET ${url}?action=learners&key=` → on success, `setSheetLearners`.
  - `fetchWeek`: `GET ?action=week&learner=` → `{minutes, days}`.
- [ ] **Step 4:** Run `node --test tests/` → PASS.
- [ ] **Step 5:** Commit: `git commit -am "tracker: events, active time, outbox and sending"` (stage the new test file too).

### Task 3: Apps Script + Node mocks + mock server + setup guide

**Files:**
- Create: `_tracking/Code.gs`
- Create: `_tracking/SETUP.md`
- Create: `tests/gas-mocks.js`
- Create: `tests/code-gs.test.js`
- Create: `tests/mock-server.js`

**Interfaces:**
- Produces (`_tracking/Code.gs`, which ends with `if (typeof module !== 'undefined') module.exports = {doGet, doPost, setup, showLinks, ping, weekSummary}`):
  - Sheet tabs:
    - `events`: columns `id, ts, learner, type, topic, level, mode, kind, item, correct, given, seconds, received`;
    - `learners`: `name, grade, gender, minutesPerWeek, daysPerWeek, active`.
  - `setup()`:
    - creates the tabs and headers if missing;
    - sets the spreadsheet time zone to `Asia/Jerusalem`;
    - stores `WRITE_KEY` and `PARENT_KEY` as 32 random hex chars in Script Properties, only if they're unset.
  - `showLinks()`: logs the device link `https://udibarzi.github.io/tirgul/#setup=…` and the parent link `https://udibarzi.github.io/tirgul/app/report.html#setup=…`, built from `ScriptApp.getService().getUrl()`.
  - `ping()`: appends one test event, learner `test`.
  - `doPost(e)`: body `JSON.parse(e.postData.contents)`.
    - `{key: WRITE|PARENT, events}` → takes the script lock, appends unseen ids, and returns `{ok, saved, dup}`.
    - `{key: PARENT, action:'setGoal', learner, minutesPerWeek, daysPerWeek}` → updates that `learners` row and returns `{ok}`.
    - A wrong key returns `{ok:false, error:'key'}`.
  - `doGet(e)`, by `e.parameter.action`:
    - `learners` (write or parent key) → `{ok, learners: Profile[]}` (active rows only);
    - `week&learner=` (write or parent key) → `{ok, minutes, days}` for the current week;
    - `events&from&to` (**parent key only**, range ≤ 84 days) → `{ok, events}`.
  - `weekSummary(events, learner, weekStartYmd) -> {minutes, days}` applies the Global Constraints rules, with day keys from `Utilities.formatDate(new Date(ts), 'Asia/Jerusalem', 'yyyy-MM-dd')`.
- `tests/gas-mocks.js` exports `loadGas({props?, learners?}) -> {gas, sheet(name) -> rows[][]}`. It evaluates `Code.gs` with in-memory mocks for `SpreadsheetApp`, `PropertiesService`, `LockService`, `ContentService`, `Utilities` (`formatDate` via `Intl` and `timeZone`; `getUuid`) and `ScriptApp`.
- `tests/mock-server.js PORT` serves the repo's static files and routes `/gas` GET/POST into `loadGas()`. It's seeded from the env var `MOCK_LEARNERS` (JSON) and `WRITE_KEY=w`, `PARENT_KEY=p`. Each response gets the header `Access-Control-Allow-Origin: *`.

- [ ] **Step 1: Write failing tests** in `tests/code-gs.test.js`:
  - `rejects wrong key`: POST with key `x` → `{ok:false,error:'key'}`, and no rows are added.
  - `same id twice saves once`: two POSTs with the same event → the first returns `saved:[id]`, the second `dup:[id]`, and the `events` tab has 1 data row.
  - `write key cannot read events`: GET `action=events` with the write key → `{ok:false}`; with the parent key → returns the events.
  - `week boundary Asia/Jerusalem`: time events at `2026-11-21T21:58:00Z` (Saturday 23:58 Israel) for 600 s and at `2026-11-21T22:03:00Z` (Sunday 00:03) for 400 s → `weekSummary(..., '2026-11-22')` is `{minutes: 6, days: 1}` and the previous week is `{minutes: 10, days: 1}`.
  - `menu time excluded`: a 900 s `menu` event plus a 120 s practice event → `{minutes: 2, days: 0}`.
  - `setGoal updates row`: with the parent key, `learners` row `נועה` gets `minutesPerWeek 90`, `daysPerWeek 4`. With the write key, the same request → `{ok:false}`.
  - `learners returns active only`: an `active=FALSE` row is excluded, and numbers come back as numbers.
- [ ] **Step 2:** Run `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** `Code.gs`, `gas-mocks.js` and `mock-server.js` per the interfaces. Dedupe reads column A once per POST, inside the lock. Write `_tracking/SETUP.md` in Hebrew with the spec's 5 steps, plus step 6: "run `ping`, open the report, see a `test` row". Explain the "unverified app" warning there.
- [ ] **Step 4:** Run `node --test tests/` → PASS. Then smoke-test the server: `node tests/mock-server.js 5318 &` and `curl "localhost:5318/gas?action=learners&key=w"` → `{"ok":true,...}`.
- [ ] **Step 5:** Commit: `git add _tracking tests && git commit -m "tracking: Apps Script, mocks, mock server, setup guide"`

### Task 4: Wire the tracker into the app pages

**Files:**
- Modify: `index.html` (init flow, new `learnerScreen` and `mapScreen`, week line, "שינוי שם" → chooser)
- Modify: `app/quiz.html` (around `progress` at :82, `recordResult` at :387, `init` at :97)
- Modify: `app/vocab.html` (`showMenu`, `startCards`, `answerCard`, `showList`)
- Modify: `app/vocab.js` (`VocabStats._key` uses `Tracker.vocabKey(topicId)` when `window.Tracker` exists)
- Modify: `app/style.css`
- Create: `tests/e2e/tracking.e2e.js`

**Interfaces:**
- Consumes: Tasks 1–2 `Tracker` API; Task 3 `tests/mock-server.js`.
- **Page wiring:**
  - Each page loads `core.js`, then `tracker.js`, then its own scripts, calls `Tracker.attach()`, and calls `Tracker.setPage()`:
    - `index.html` → `{topic:'menu'}`;
    - the vocab menu → `'menu'`;
    - the vocab cards and list screens → `{topic, level, mode:'cards'|'list'}`;
    - `quiz.html` → `{topic, level, mode}` from the URL.
  - `ProgressManager` is built as `new ProgressManager(Tracker.progressPrefix())` in `index.html` and `quiz.html`. The username, grade and gender come from `Tracker.getCurrent()`.
- **`index.html` init order:**
  1. `Tracker.migrateLegacy()`.
  2. `applySetupHash(location.hash)`; if applied, strip the hash.
  3. If configured, `await fetchLearners()` (errors ignored; use the cache).
  4. If configured and `unmappedLocalNames().length`, show `mapScreen`: one row per local name, with a button per sheet girl plus "אף אחת" (neither). Each choice calls `mapLearner`.
  5. Profiles:
     - configured with ≥ 2 sheet learners and no `sessionStorage['tirgul_chosen']` → `learnerScreen` ("מי מתרגלת?", one card per girl);
     - exactly 1 sheet learner → `setCurrent` and go on;
     - unconfigured → today's flow, saving the profile with `addLocalProfile` + `setCurrent`.
  - "שינוי שם" opens `learnerScreen`, listing the profiles plus "הוספה" (add), which starts today's name flow.
- **Events:**
  - `quiz.html` calls `Tracker.session()` once after questions load. In `recordResult` it calls `Tracker.answer({kind: q.vocab ? q.kind : q.type, item: q.vocab ? q.word.en : String(q.text).slice(0,60), correct, given})`, where `given` is the typed value only when `q.kind==='write'`.
  - `vocab.html` calls `Tracker.session()` in `startCards` and `Tracker.card({item: word.en, correct: knew})` in `answerCard`.
- **Week line:** an element `#weekLine` on the topics screen, shown when the current profile has `minutesPerWeek`. The text is `השבוע: ${m} / ${goal} דק׳ · ימים: ${d} / ${goalDays}` with a bar. When both goals are met it reads `🎉 עמדת ביעד השבוע!`, which is the same for both genders. The numbers come from `fetchWeek(name)`, falling back to `localWeek(name)`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/tracking.e2e.js`. It starts `tests/mock-server.js 5318` with `MOCK_LEARNERS=[{"name":"נועה","grade":5,"gender":"female","minutesPerWeek":60,"daysPerWeek":3},{"name":"מאיה","grade":8,"gender":"female","minutesPerWeek":90,"daysPerWeek":3}]`. Phone viewport 390×844. Asserts:
  - `setup link + chooser`: open `/#setup=<b64({url:'http://localhost:5318/gas',key:'w'})>` → the hash is stripped and the "מי מתרגלת?" screen shows both names. Choose נועה → the topics screen shows grade 5 topics and `#weekLine` contains `/ 60`.
  - `events reach the sheet`: open `english-food-5` → cards → answer 3 cards → quiz `mode=write` → answer 2 → trigger `visibilitychange` hidden, then reload → GET `/gas?action=events&key=p&from=…&to=…` → contains exactly 3 `card` events and 2 `answer` events with `learner==='נועה'`, plus ≥ 1 `session` event. Ids are unique.
  - `two learners on one device`: switch to מאיה via "שינוי שם", answer 1 quiz question, send → that event has `learner==='מאיה'`. נועה's topic progress on the cards is unchanged.
  - `offline then online`: stop the server, answer 2 questions, restart it, reload → both events arrive once.
  - `mapping existing history`: a fresh context where local storage already has `math_app_username='noa'` and progress, then open the setup link → `mapScreen` shows `noa`. Choose נועה → the topic card shows the old progress.
- [ ] **Step 2:** Run `NODE_PATH=<scratchpad>/pw/node_modules node tests/e2e/tracking.e2e.js` → FAIL.
- [ ] **Step 3: Implement** the page wiring per the Interfaces above. Reuse the `.picker-card` styles for chooser cards; give `#weekLine` a small bar like `.progress-bar`.
- [ ] **Step 4:** Run the e2e → PASS. Also run `node --test tests/`, `node _validate.js`, and the earlier math regression: open `app/quiz.html?topic=fractions-4` and answer one question; there must be no page errors.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "app: who's-practicing, per-learner progress, tracking events, weekly line"`

### Task 5: Parent report page

**Files:**
- Create: `app/report.js`
- Create: `app/report.html`
- Create: `tests/report.test.js`
- Modify: `tests/e2e/tracking.e2e.js` (add a report check)

**Interfaces:**
- Consumes: Task 3 GET `action=events` / `learners` and POST `setGoal`; `content/manifest.json` for topic names.
- Produces (`app/report.js`, exports for Node):
  - `aggregate(events, {weekStart: 'YYYY-MM-DD', tz: 'Asia/Jerusalem', topicNames: {id: name}}) -> {[learner]: LearnerWeek}`.
  - `LearnerWeek = { minutes, menuMinutes, days: string[] /* practice day keys */, dayDots: boolean[7] /* Sun..Sat */, sessions, questions, cards, correct, wrong, byTopic: [{topic, name, minutes, questions, pct}], byKind: [{kind, questions, pct}], trend: number[6] /* minutes, oldest→this week */ }`.
  - `keepsMissing(events, learner, nowMs) -> [{item, wrong, lastGiven}]`, up to 10 items. Looks back 28 days; drops items whose last 2 answers were correct.
  - Day and week keys use `Intl.DateTimeFormat('en-CA', {timeZone: tz})`, so they match the server.
- **`report.html`:**
  - reads `#setup=` into `tirgul_report` and strips the hash;
  - fetches learners plus 6 weeks of events (`from` = 5 weeks before this week's Sunday);
  - week picker (this week / previous);
  - one card per learner with the goal bar, day dots, activity counts, by-topic table, by-kind table, keeps-missing list (English in LTR spans) and a trend bar row;
  - an "עריכת יעד" (edit goal) form per learner that POSTs `setGoal` and refreshes;
  - names not in the learner list go to an "שמות אחרים" (other names) section;
  - a menu-time line;
  - without config: a Hebrew explanation that links to `_tracking/SETUP.md` on GitHub.

- [ ] **Step 1: Write failing tests** in `tests/report.test.js`:
  - `report week matches server week`: for the same fixture as Task 3's boundary test, `aggregate(...)['נועה'].minutes` equals `weekSummary` minutes for both weeks. Import `weekSummary` via `tests/gas-mocks.js`.
  - `counts and percentages`: 4 answers (3 correct) + 2 cards (1 knew) + 2 sessions → `questions 4`, `cards 2`, `correct 4`, `wrong 2`, `sessions 2`. `byKind` for `write` is `{questions: 2, pct: 50}` when 2 of the answers are write with 1 correct.
  - `keepsMissing`:
    - an item wrong 3× then right 2× → excluded;
    - an item wrong 2× (last `given: 'thirstey'`) → included with `lastGiven 'thirstey'`;
    - sorted by `wrong`, descending.
  - `dayDots`: practice on Sunday and Tuesday → `[true,false,true,false,false,false,false]`.
- [ ] **Step 2:** Run `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** `app/report.js` and `app/report.html` per the interfaces, in the existing visual style (`style.css` tokens, RTL, phone-first). In the e2e, add `report shows both girls`: open `/app/report.html#setup=<b64({url, key:'p'})>` → both names visible, and נועה's card shows `questions` ≥ 2. Change נועה's goal to 75 → after reload the bar reads `/ 75`.
- [ ] **Step 4:** Run `node --test tests/` and the e2e → PASS. Take phone-size screenshots of the report and the chooser and look at them for RTL/BiDi problems.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "report: parent report page with goals"`

### Task 6: Docs, deploy, verify live

**Files:**
- Modify: `CLAUDE.md` (a Tracking section: files, keys, storage keys, how to run tests `node --test tests/` and the e2e)
- Modify: `README.md` (one paragraph + a link to `_tracking/SETUP.md`)

- [ ] **Step 1:** Update the docs as listed. Run `node --test tests/`, `node _validate.js` and the e2e → all pass.
- [ ] **Step 2:** Commit, then `git push origin main`. Poll `https://udibarzi.github.io/tirgul/app/tracker.js` until it serves the new file.
- [ ] **Step 3:** On the live site with no setup: open the home page → today's flow works and no console errors appear. Then open `app/report.html` → the setup explanation shows.
- [ ] **Step 4:** Send the parent `_tracking/SETUP.md` and the "Code.gs" file, and wait for them to finish setup. Then ask them to run `ping` and open the parent link, and confirm that a `test` row shows up.
