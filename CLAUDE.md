# Math Practice App (תרגול מתמטיקה)

Hebrew math practice app for kids. Deployed on GitHub Pages at https://udibarzi.github.io/tirgul/

## Architecture

**Vanilla static site** — no build step, no frameworks, no bundler. HTML + CSS + JS served directly via GitHub Pages.

### File structure
```
index.html              Landing page (name → grade → gender → topic grid)
app/
  core.js               Shared library (BiDi, progress, visuals, confetti)
  style.css             Shared styles
  quiz.html             Quiz engine (loads topic JSON, renders questions)
  vocab.js              English vocab engine — generates questions from a word list
  vocab.html            English topic menu: flashcards, word list, quiz modes
  ladder.js / ladder.html  English ladder A1→C1: unlocking, placement, review picking / map + placement page
  tracker.js            Practice tracking: learners, per-learner keys, active time, event outbox, sending
  report.html / report.js  Parent report page (weekly goals, activity, words she keeps missing)
  speed.html            Speed drill (timed multiplication/division practice)
content/
  manifest.json         Topic registry with grades array and topic list
  *.json                One JSON file per topic (questions array)
_build_grade4.js        Generator script for 4th grade content
_build_grade7.js        Extractor script for 7th grade content
_validate.js            Validates all content JSON + manifest
_build_audio.py         Generates English recordings → audio/en/*.mp3 (local Kokoro TTS)
audio/en/               One MP3 per English word/phrase, named by vocabSlug()
_tracking/Code.gs       Google Apps Script web app (runs in the parent's Google Sheet; holds no secrets)
_tracking/SETUP.md      Parent's one-time Google setup, in Hebrew
tests/                  node --test unit tests, Apps Script mocks, mock server, Playwright e2e
```

### Data flow
- `manifest.json` lists all topics with `id`, `name`, `icon`, `grade`, `order`
- Each topic has a `content/{id}.json` with a `questions` array
- Questions are loaded at runtime via `fetch()` (no server needed)
- Progress stored in `localStorage` via `ProgressManager` class in core.js

### Question types
- `free-input`: user types answer. `correct` is an array of accepted strings.
- `multiple-choice`: user picks from `options` array. `correct` is the index (number).

## Critical BiDi rules

This is an RTL (Hebrew) app with math expressions that must render LTR. The `fixBidi()` function in `core.js` handles this.

### NEVER put Hebrew text inside parentheses
Parentheses `()` in RTL context cause rendering chaos. Use em-dash `—` instead.
- Bad: `(לא תלוי ב-x)`
- Good: `— לא תלוי ב-x`

### fixBidi() is the single source of truth
All formatting fixes for math-in-Hebrew go in `core.js:fixBidi()`. It wraps math expressions in `<span dir="ltr" style="unicode-bidi:isolate">`. The three regex character classes (`mathChar`, `mathStart`, `mathEnd`) define what counts as math.

Currently handles: digits, operators, algebraic variables (a-z), square root (√), absolute value bars (|), nested brackets `[]{}()`, Unicode minus (−), fractions, superscripts/subscripts.

## Gender-aware Hebrew

The app tracks user gender (male/female) for grammatically correct Hebrew messages. Congratulations messages in `core.js:CONGRATS_MESSAGES` have `{ female: {...}, male: {...} }` structure. Gender is stored in `localStorage` as `math_app_gender` and passed via URL params.

## Content grades

Four grade levels: 4 (כיתה ד׳), 5 (כיתה ה׳), 7 (כיתה ז׳), 8 (כיתה ח׳). Grades 5 and 8 currently have English only — two different kids, one in each. Grade is stored in `localStorage` as `math_app_grade`. Topics are filtered by grade on the landing page. Speed drill (אלופי הכפל) is only shown for grade 4.

## Adding new content

1. Create `content/{topic-id}.json` with `name`, `questions` array
2. Add entry to `content/manifest.json` `topics` array with `grade`, `order`, etc.
3. Run `node _validate.js` to check for errors
4. For 7th grade math: make sure answers include both Unicode minus (−) and regular hyphen (-) variants

## English vocabulary (word lists from a photo)

The user will send photos of English word lists that a kid needs for a test: from a textbook page or a screenshot of an existing word list. Ask which grade if unclear: 5th grade is `english-words-N`, 8th grade is `english-unitN-8`. To add one:

1. Transcribe **every** word in the photo and count them against the photo.
2. Create `content/english-....json` with `"type": "vocab"` and a `words` array: `{ en, he, group?, alt? }`. See `docs/CONTENT-FORMAT.md`. Use child-friendly Hebrew meanings; use digits for number words; put `group` on months, numbers, places, verbs.
   Also add a `sentences` array: about 12–25 short example sentences, each using one list word as its `blank`. The user asked for a sentences level in every topic. Write first-person Hebrew in the feminine, since both learners are girls.
3. Add a manifest entry: `"type": "vocab"`, `"subject": "english"`, `"grade"` (5 or 8), next `order` within that grade.
4. Generate recordings: `~/.cache/explain-skill/venv/bin/python -I _build_audio.py`. It only creates missing files and uses the Kokoro voice `af_heart`.
5. `node _validate.js`. It warns about words that have no recording. No questions to write; `app/vocab.js` generates them.

Besides textbook lists, there are topic packs written by Claude: everyday words, conversation phrases, past-tense sentences, and grammar/tense packs. The goal is for both girls to be able to hold a conversation in English. A topic has up to two levels, `words` and `sentences`; the menu shows a tab for each level the topic has. Sentence-only packs, such as phrases, past and tenses, have only `sentences`. Tense practice is a sentence whose `blank` is the verb, with `choices` holding the wrong forms.

Question kinds:
- Words level: `en-he`, `he-en`, `write` (spelling), `listen` (hear the audio, pick the meaning).
- Sentences level: `order` (tap word tiles into order), `cloze` (pick the missing word), `en-he`, `he-en`, `listen`.
- Both levels: `speak` (say it; uses browser speech recognition, experimental). It's hidden when unsupported and never included in mix. Audio plays from `audio/en/{vocabSlug(en)}.mp3`; if the file is missing, the browser voice is used instead. `vocabSlug` in `app/vocab.js` and `vocab_slug` in `_build_audio.py` must stay identical.
Never pass English text through `fixBidi()`; vocab UI uses `escapeHtml()` inside `dir="ltr"` elements.
Per-word stats live in localStorage under `tirgul_vocab__{learner}_{topicId}` (see Practice tracking). They drive the "מילים לחיזוק" mode and weight question selection toward missed words.

## English ladder (A1 → C1)

Spec: `docs/superpowers/specs/2026-11-26-english-ladder-design.md`. One shared path for both girls and the parent: placement quiz → themed units in order → review.
- `app/ladder.js` (pure, tested in `tests/ladder.test.js`): levels/units from the manifest, unit completion (80% of items known), unit states (done / current / open / locked / new), level advance (never backwards), placement steps (blocks of 6, start A2, ≥5 up, ≤3 down, 4 = this level), review picking (practiced items only, needs-work then oldest `t`).
- Screens: `#ladderCard` on `index.html`; `app/ladder.html` (map, "פתח בכל זאת", choose a level, `?placement=1`); units open in `vocab.html` (sentences tab and Hebrew flashcard side by default); review is `quiz.html?ladder=review` (stats go to each item's own unit via `q.topicId`; events use topic `ladder-review`).
- Position per learner in localStorage `tirgul_ladder__<name>` (`Tracker.ladderKey()`); it stays on the device. Unit progress comes from the normal `VocabStats`, which now stores `t` (last seen).
- Ladder-only learners (the parent): a sheet learner with an empty/0/unknown grade, or a local profile made with the "מבוגר/ת — רק המסלול" card (`ladderOnly: true`). They see only the ladder card.
- Unit files, `heM` and manifest fields: see `docs/CONTENT-FORMAT.md` → "English ladder units".
- **Adding the next units** (same steps as a word list, plus the ladder fields): write `content/ladder-<level>-<NN>.json` with the next unit number, add the manifest entry with `track`, `ladder`, `itemCount` and no `grade`, run `_build_audio.py`, then `node _validate.js`. Phase 1 shipped units 1–3 of every level (2026-11-26). Build order: level by level, staying at least 2 units ahead of the furthest learner in each level. Units added to a level a learner already left show as "חדש" (optional) and never move her back.
- Content: written by Claude, not copied from published lists. Up to B1 suits a 10-year-old; B2–C1 suits a 13-year-old and leans to the parent's need: everyday household/errand words, collocations, phrasal verbs, idioms, small talk and polite softening.

## Practice tracking (goals and parent report)

Spec: `docs/superpowers/specs/2026-11-21-practice-tracking-design.md`.
- Each girl's device records events (`time`, `answer`, `card`, `session`) into a localStorage outbox (`tirgul_outbox`). It sends them to the parent's Google Apps Script (`_tracking/Code.gs`) on load, every 60 s, and by beacon when the page is hidden. Events leave the outbox only after the script confirms their ids; the script drops duplicate ids.
- Active time counts only while the page is visible and there was a tap or keypress in the last 60 s. Goal minutes exclude `topic: 'menu'`. A practice day is ≥ 5 minutes. The week is Sunday–Saturday, Asia/Jerusalem. `app/report.js` and `Code.gs:weekSummary` must agree; a test checks it.
- **No sheet URL or key in the repo, ever.** A device gets `{url, key}` from the hash link `#setup=<base64url JSON>`, which `showLinks()` in the script prints. It's stored in `tirgul_sync` (devices) or `tirgul_report` (parent), then stripped from the address bar. The write key adds events; the parent key reads events and edits goals.
- Learners: on a set-up device the sheet's `learners` tab is the source of truth, and the home page shows "מי מתרגלת?". Without setup, the old name → grade → gender flow stays, with per-learner profiles in `tirgul_profiles`.
- Per-learner local keys: topic progress `math_app__<name>_<topic>` via `new ProgressManager(Tracker.progressPrefix())`; vocab stats `tirgul_vocab__<name>_<topic>` via `VocabStats._key` → `Tracker.vocabKey()`. `Tracker.setCurrent()` keeps `math_app_username/grade/gender` in sync, because the speed drills read them. `migrateLegacy()` moves old un-prefixed keys once.
- New pages must load `tracker.js` after `core.js`, then call `Tracker.setPage({topic, level, mode})` and `Tracker.attach()`. Never let tracking break practice: every storage access is in try/catch.
- Store only a first name. No email, location or device ids. The only free text stored is typed spelling answers (`write` kind, 60 chars max).
- Tests: `node --test 'tests/*.test.js'` (Node 25 needs the quoted glob). Browser e2e: `NODE_PATH=<dir with playwright> node tests/e2e/tracking.e2e.js`. It starts `tests/mock-server.js`, which serves the site plus `Code.gs` on mocks at `/gas` (write key `w`, parent key `p`). Playwright is not committed.
- After changing `Code.gs`, the parent must publish a new version of the deployment (see SETUP.md); the URL stays the same.

## Common pitfalls

- **Phone caches after a deploy**: GitHub Pages lets browsers keep files for 10 minutes. Script tags carry `?v=<version>` (e.g. `core.js?v=20261126b`) so a new page never runs with an old script. **When you change any `app/*.js`, bump that version in every HTML file** (`grep -rl '?v=' index.html app/*.html`). Content JSON is fetched with `cache: 'no-cache'`, so it needs no bump.

- **Unicode minus vs hyphen**: 7th grade content uses U+2212 (−) but keyboards type U+002D (-). Always include both in `correct` arrays.
- **Screenshots**: macOS may block reading screenshot files. Describe the visual issue or paste the image directly.
- **Testing BiDi**: The best way to verify is to view the live site. `npx serve .` from project root works for local testing.
