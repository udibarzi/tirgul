# English Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared English learning path from A1 to C1. It has themed units, a placement quiz, units that unlock in order, and a review mode. Phase 1 ships the first 3 units of every level, and a grade-less adult can use it as a third learner.

**Architecture:**
- Each ladder unit is an ordinary `"type": "vocab"` topic. Flashcards, the quiz kinds, recordings, `VocabStats` and tracking all work on it unchanged.
- A new pure module, `app/ladder.js`, holds the ladder logic: levels and units from the manifest, unit completion, the learner's position and unit states, the adaptive placement steps, and review picking.
- A new page, `app/ladder.html`, shows the map and runs placement. `index.html` gets a ladder card, and `quiz.html` gets a review mode.

**Tech Stack:**
- Vanilla JS, no build step.
- Tests with `node --test 'tests/*.test.js'`.
- Playwright e2e, run with `NODE_PATH=<scratchpad>/pw/node_modules`.
- Recordings with Kokoro, through `_build_audio.py`.

**Spec:** `docs/superpowers/specs/2026-11-26-english-ladder-design.md`

## Global Constraints

- **Code:** vanilla static site; browser files also `module.exports` for Node. Every `localStorage` access is in try/catch.
- **Syntax:** no `??` or `?.`, for older iPads. The test `browser code avoids syntax older iPads cannot parse` must cover `app/ladder.js`.
- **BiDi:** English goes only in `dir="ltr"` elements via `escapeHtml`, never through `fixBidi`. No Hebrew inside parentheses.
- **Levels:** `A1, A2, B1, B2, C1`, in that order. Hebrew names *(builder's call, fixed here)*:

  | Level | Hebrew name | Meaning |
  |---|---|---|
  | A1 | מתחילים | beginners |
  | A2 | בסיסי | basic |
  | B1 | ביניים | intermediate |
  | B2 | מתקדמים | advanced |
  | C1 | שוטף וטבעי | fluent and natural |

  The planned units per level are 12, 16, 20, 20 and 16.
- **Unit files:** `content/ladder-<level lowercase>-<NN>.json`, with `"type": "vocab"` and `"ladder": {"level", "unit"}`. Each has 20–30 `words` and 15–25 `sentences`, and every sentence has a `blank`.
- **Manifest entries:** `"track": "ladder"`, `"ladder": {"level","unit"}`, `"itemCount"` (words + sentences) and **no `grade`**. The manifest also gets `ladderLevels: [{id, name, description, plannedUnits}]`.
- **Hebrew:** first-person Hebrew is feminine. `heM` holds the masculine form only where it differs from `he`, and is shown when the learner's gender is `male`.
- **Unit unlocking:**
  - A unit is complete when it has at least 0.8 × `itemCount` known items. An item is known when it has a stats record and `!VocabStats.needsWork`.
  - Units open in order within the current level. "פתח בכל זאת" (open anyway) opens any locked unit in the current level.
  - The current level never moves backwards.
  - Units added later to a level below the current one are optional and marked "חדש" (new).
- **Placement:**
  - Blocks of 6 items: 4 "meaning" questions plus 2 fill-in questions. It starts at A2.
  - A score of 5 or more moves up a level, 3 or less moves down, and 4 sets the level.
  - Result:
    - a score of 4 at a level → that level;
    - otherwise the highest passed level plus one, capped at C1;
    - nothing passed → A1.
  - Levels below the result count as passed.
- **Review:** 20 items, only ones with a stats record, from units that are complete or in passed levels. Order: needs-work first, then oldest `t`. Records with no `t` count as oldest.
- **Storage:** position key `tirgul_ladder__<learner>`. No change to `_tracking/Code.gs`.
- **Content:** written by Claude, not copied from published lists. Content up to B1 must suit a 10-year-old; B2 and C1 must suit a 13-year-old.

## Review Focus

1. **Stats entries for items that are no longer in a unit** (edited content) inflate the known count. `unitStatus` caps known at `itemCount` → Task 1 test `known is capped at itemCount`.
2. **Learner placed at C1 with nothing practiced:** review is empty and must show a friendly message, not a broken quiz → Task 1 test `review is empty when nothing practiced`, Task 4 e2e `review with nothing practiced`.
3. **Grade-less sheet learner (the parent):** the home screen shows only the ladder, with no grade-picker dead end → Task 4 e2e `adult sees only the ladder`.
4. **Male learner:** `heM` must appear everywhere Hebrew is shown, including the wrong options in multiple choice and the word list → Task 2 test `localizes every he field`.
5. **Existing local girl profiles on an unconfigured device:** they see a ladder card that invites placement, and the grade topics are unchanged → Task 4 e2e `existing learner sees the ladder card`.

---

### Task 1: Ladder logic module

**Files:**
- Create: `app/ladder.js`
- Create: `tests/ladder.test.js`
- Modify: `tests/tracker.learners.test.js`: add `app/ladder.js` to the old-iPad syntax test's file list.

**Interfaces:**
- Produces (`app/ladder.js`; `window.Ladder` in the browser; `module.exports` the same in Node):
  - `LADDER_LEVELS = ['A1','A2','B1','B2','C1']`.
  - `ladderLevels(manifest) -> [{id, name, description, plannedUnits}]`, in `LADDER_LEVELS` order.
  - `ladderUnits(manifest) -> [{id, level, unit, name, itemCount}]`, sorted by level, then unit.
  - `unitStatus(itemCount, stats) -> {seen, known, total, complete}`:
    - `stats` is the `VocabStats.get()` object;
    - `known` is capped at `total`;
    - `complete` means `known >= 0.8 * total`.
  - `Position = { level: string|null, placedAt: string|null, opened: {[unitId]: true}, seen: string[] }`. Defaults: `{level:null, placedAt:null, opened:{}, seen:[]}`.
  - `ladderState(manifest, position, statsOf: unitId -> stats) -> { position, currentLevel, currentUnitId|null, newUnitIds: string[], levels: [{id, name, description, built, soon}], units: [{id, level, unit, name, state, status}] }`:
    - `state` is one of `'done'|'current'|'open'|'locked'|'new'`;
    - `soon` = `plannedUnits` − built units for that level;
    - the returned `position` has its level advanced when the current level is complete, and `seen` updated with every unit id rendered. The caller saves it.
  - `placementStep(history: [{level, correct, total}]) -> {next: levelId} | {result: levelId}`.
  - `reviewPick(units: [{id, items: Item[]}], statsOf, count = 20) -> [{unitId, item}]`.
  - `positionKey(name) -> 'tirgul_ladder__' + name`; `loadPosition(storage, name) -> Position`; `savePosition(storage, name, pos)`.

- [ ] **Step 1: Write failing tests** in `tests/ladder.test.js`. Use a fixture manifest with `ladderLevels` for all five levels (plannedUnits 3 each), units A1-1..3, A2-1..2, B1-1 (itemCount 10 each), and one grade-5 topic.
  - `units come from the manifest in level order`: `ladderUnits(m).map(u=>u.id)` lists A1 1..3, then A2, then B1; the grade topic is excluded.
  - `known is capped at itemCount`: 12 stats entries, all right, with `itemCount` 10 → `{known:10, complete:true}`. 7 known out of 10 → `complete:false`; 8 → `true`.
  - `fresh learner starts at A1 unit 1`: default position → `currentLevel 'A1'`, unit states `['current','locked','locked']` for A1, and A2 units `'locked'`.
  - `completing a unit opens the next`: A1-1 is complete → its state is `'done'` and A1-2 is `'current'`.
  - `open anyway`: with `opened['ladder-a1-03']` set → A1-3 is `'open'` while A1-2 is still `'current'`.
  - `level advances and never goes back`:
    - all three A1 units are complete → `currentLevel 'A2'` and `position.level 'A2'`;
    - then add a built unit A1-4 to the manifest, with `seen` from before → `currentLevel` is still `'A2'`, A1-4's state is `'new'`, and `newUnitIds` is `['ladder-a1-04']`;
    - a second call with the returned position → A1-4 is `'open'` and `newUnitIds` is `[]`.
  - `placement sets the level and passes the ones below`: `{placedAt:'B1', level:'B1'}` → A1 and A2 units are `'open'` (or `'done'` if complete), not `'locked'`, and B1-1 is `'current'`.
  - `soon counts unbuilt units`: `levels.find(l=>l.id==='A2').soon === 1`.
  - `placementStep`:
    - `[]` → `{next:'A2'}`;
    - `[{A2,5/6}]` → `{next:'B1'}`;
    - `[{A2,5},{B1,4}]` → `{result:'B1'}`;
    - `[{A2,5},{B1,6},{B2,2}]` → `{result:'B2'}`;
    - `[{A2,2}]` → `{next:'A1'}`;
    - `[{A2,2},{A1,6}]` → `{result:'A2'}`;
    - `[{A2,1},{A1,1}]` → `{result:'A1'}`;
    - `[{A2,6},{B1,6},{B2,6},{C1,6}]` → `{result:'C1'}`.
  - `review only uses practiced items`: two units, with stats for 3 items (one `last:0`, one `t:100`, one with no `t`) → the picks are those 3 and no others; the first pick is the `last:0` item, and the no-`t` item comes before `t:100`.
  - `review is empty when nothing practiced` → `[]`.
  - `position storage survives junk`: stored `'not json'` → defaults; `savePosition` then `loadPosition` round-trips; a storage that throws doesn't throw.
- [ ] **Step 2:** Run `node --test 'tests/*.test.js'` → FAIL: cannot find `../app/ladder.js`.
- [ ] **Step 3:** Implement `app/ladder.js`. `needsWork` comes from `VocabStats.needsWork` when that is defined, otherwise from the same rule copied in: `s.last === 0 || s.w > s.r`. Don't require `vocab.js`.
- [ ] **Step 4:** Run `node --test 'tests/*.test.js'` → PASS, including the old-iPad syntax test.
- [ ] **Step 5:** Commit: `git add app/ladder.js tests && git commit -m "ladder: levels, units, unlocking, placement and review logic"`

### Task 2: Engine, profiles and validator support

**Files:**
- Modify: `app/vocab.js`:
  - `VocabStats.record` stores `t: Date.now()`;
  - add `localizeVocabContent`;
  - add `buildReviewQuestions`;
  - export them.
- Modify: `app/tracker.js`:
  - `normProfile` keeps `ladderOnly: true`;
  - `mapLearner` also moves `tirgul_ladder__<from>` to `<to>` when the destination is empty;
  - add `tracker.ladderKey()`.
- Modify: `_validate.js`: ladder checks, and ladder topics need no `grade`.
- Test: `tests/vocab.test.js` (new), `tests/tracker.learners.test.js`, plus a temporary validator fixture run.

**Interfaces:**
- Consumes: Task 1 `positionKey`.
- Produces:
  - `localizeVocabContent(content, gender) -> content`: when `gender==='male'`, every item with `heM` gets `he = heM`. It returns a new object and doesn't mutate the original.
  - `buildReviewQuestions(picks: [{unitId, item, unitContent}]) -> Question[]`:
    - each question gets `q.topicId = unitId`;
    - the kind cycles through the unit level's allowed kinds, without `speak`, via `fitKind`;
    - distractors come from that unit's items.
  - `tracker.ladderKey(name?) -> 'tirgul_ladder__' + (name or current)`.
  - Profile gains an optional `ladderOnly: boolean`. Sheet learners with grade 0 are treated as ladder-only by callers.

- [ ] **Step 1: Write failing tests.**
  - `tests/vocab.test.js`. Load `vocab.js` with `global.shuffle` from `core.js` and an in-memory `global.localStorage`, as `engine_test.js` in the scratchpad does.
    - `record stores a timestamp`: `VocabStats.record('u','cat',true)` → `typeof get('u').cat.t === 'number'`.
    - `localizes every he field`: content with words `{en:'I am tired', he:'אני עייפה', heM:'אני עייף'}` and a sentence with `heM` → for `male`, both `he` values are the masculine forms and the original is unchanged. For `female`, the content is unchanged. Then build 50 `en-he` questions from the localized content → no option equals `'אני עייפה'`.
    - `review questions keep their unit`: picks from two units → every `q.topicId` matches its pick; no `speak` kind; sentence items never get `write`.
  - `tests/tracker.learners.test.js`:
    - `ladderOnly survives`: `addLocalProfile({name:'אבא', grade:0, gender:'male', ladderOnly:true})` → `getProfiles()[0].ladderOnly === true`;
    - `mapLearner moves the ladder position`: `tirgul_ladder__noa` → `tirgul_ladder__נועה`.
- [ ] **Step 2:** Run `node --test 'tests/*.test.js'` → the new tests FAIL.
- [ ] **Step 3:** Implement the code. `vocab.html`, `quiz.html` and the review build apply `localizeVocabContent(content, userGender)` right after loading content.
- [ ] **Step 4:** Update `_validate.js`. For topics with `track: 'ladder'`:
  - errors:
    - missing or invalid `ladder.level` or `ladder.unit`;
    - the content file's `ladder` differs from the manifest's;
    - a duplicate (level, unit);
    - `itemCount` ≠ words + sentences;
    - a sentence without a `blank`;
    - a `heM` equal to `he`;
    - a `grade` present;
    - the manifest is missing `ladderLevels`, or its ids are not exactly the five levels;
  - warning: word or sentence counts outside 20–30 or 15–25.

  Also skip the "no grade field" warning for ladder topics.

  Check it by temporarily adding a bad fixture, for example a unit with `itemCount` off by one → 1 error. Then remove the fixture.
- [ ] **Step 5:** Run `node --test 'tests/*.test.js'` → PASS, and `node _validate.js` → all validations pass.
- [ ] **Step 6:** Commit: `git commit -am "ladder: masculine Hebrew, review questions, stats timestamps, validator"`. Add `tests/vocab.test.js`.

### Task 3: Phase 1 content: placement and the first 3 units of every level

**Files:**
- Create: `content/ladder-placement.json`.
- Create the unit files:

  | Level | Unit 01 | Unit 02 | Unit 03 |
  |---|---|---|---|
  | A1 | `ladder-a1-01` (about me: hello, name, age, numbers to 20) | `ladder-a1-02` (my family and my home) | `ladder-a1-03` (food and drinks) |
  | A2 | `ladder-a2-01` (my day and time) | `ladder-a2-02` (shopping and clothes) | `ladder-a2-03` (last weekend: past simple) |
  | B1 | `ladder-b1-01` (plans and the future) | `ladder-b1-02` (opinions and feelings) | `ladder-b1-03` (common phrasal verbs 1: get up, find out, look for…) |
  | B2 | `ladder-b2-01` (around the house: chores, furniture, faucet, drawer, dishwasher) | `ladder-b2-02` (kitchen and cooking: peel, chop, colander, cutting board) | `ladder-b2-03` (errands and appointments: run errands, pick up, drop off, make an appointment) |
  | C1 | `ladder-c1-01` (small talk and reacting: "fair enough", "I hear you") | `ladder-c1-02` (softening and polite phrasing: "I was wondering if…", "would you mind…") | `ladder-c1-03` (everyday idioms: call it a day, on the same page) |

  All files are `.json` under `content/`.
- Modify: `content/manifest.json`: add `ladderLevels` and 15 topic entries.
- Create: `audio/en/*.mp3`, generated.

**Interfaces:**
- Consumes: Task 2 validator rules.
- Produces: `ladder-placement.json` = `{ "id": "ladder-placement", "type": "placement", "levels": { "A1": {"words":[{en,he}...], "sentences":[{en,he,blank,choices}...]}, ... } }`.
  - Each level has at least 12 words and at least 4 sentences, drawn from that level's whole planned scope, not only from units 01–03.
  - It's **not** listed in `manifest.topics`, so the validator and the home page skip it.
  - The validator checks it as a separate file: 5 levels, the counts above, and `choices` of 3 or more on every sentence.

- [ ] **Step 1:** Write the 15 unit files and the placement file.
  - Hebrew must be child-friendly up to B1. First person is feminine, with `heM` where the masculine differs.
  - Put `group` on word families: rooms, appliances, verbs and so on.
  - B2 and C1 must lean toward natural everyday English: phrasal verbs, collocations, idioms, and the household words learners miss.
  - Use one-off generator scripts in the scratchpad, not committed, like `make_test_more.py`. The script asserts that each sentence's `blank` appears exactly once as a whole word.
- [ ] **Step 2:** Add the manifest entries. Keep the existing `grades` formatting byte-for-byte; check `git diff --stat content/manifest.json` shows only additions.
- [ ] **Step 3:** Run `~/.cache/explain-skill/venv/bin/python -I _build_audio.py`. Expected: about 675 new files and no errors.
- [ ] **Step 4:** Run `node _validate.js` → all validations pass, with 0 missing recordings for ladder topics. Also run the scratchpad engine check: `node <scratchpad>/engine_test.js $PWD` → `bad 0`.
- [ ] **Step 5:** Commit: `git add content audio/en && git commit -m "ladder: placement and first 3 units of A1–C1"`

### Task 4: Ladder screens, home card, review, adult learner

**Files:**
- Create: `app/ladder.html`: the map, placement, a level chosen by hand, and the review entry.
- Modify: `index.html`:
  - a `#ladderCard` above `#topicsGrid`;
  - ladder-only learners see no topics grid, total stats or grade link;
  - the grade picker gets a card "מבוגר/ת — רק המסלול" (adult, path only), which saves `{grade:0, ladderOnly:true}`;
  - `route()` treats `cur.ladderOnly`, and sheet learners with grade 0, as complete and not needing a grade.
- Modify: `app/vocab.html`:
  - ladder topics default to the sentences tab and the Hebrew flashcard side (`getPref('side', isLadder ? 'he' : 'en')`);
  - the back link goes to `ladder.html`;
  - add `localizeVocabContent`.
- Modify: `app/quiz.html`:
  - the `ladder=review` param builds questions with `buildReviewQuestions`;
  - `recordResult` uses `q.topicId || topicId` for `VocabStats` and `progress`;
  - `Tracker.setPage({topic:'ladder-review', mode:'review'})`;
  - add `localizeVocabContent`;
  - with no picks, show "עוד אין מה לחזור עליו — תרגלו יחידה ותחזרו לכאן" (nothing to review yet: practice a unit and come back).
- Modify: `app/report.html`:
  - `topicNames['ladder-review'] = 'מסלול — חזרה'` (path: review) and `topicNames['ladder-placement'] = 'מסלול — מבחן רמה'` (path: level test);
  - under each learner's header, a line "במסלול: <name of the latest ladder unit in her events>" (on the path: …).
- Modify: `tests/e2e/tracking.e2e.js`: add ladder steps.

**Interfaces:**
- Consumes: Task 1 `Ladder.*`; Task 2 `localizeVocabContent`, `buildReviewQuestions`, `Tracker.ladderKey`; Task 3 content.
- **Ladder card copy:**
  - before placement: "המסלול שלי — בואו נמצא את הרמה שלך" (my path: let's find your level), with a button "למבחן רמה" (to the level test);
  - after placement: "רמה <id> · <level name> — יחידה <n>: <unit name>" (level, unit), a bar showing known/total, and the buttons "להמשיך" (continue) and "חזרה" (review), plus a link "למסלול המלא" (the full path);
  - when `newUnitIds` isn't empty, show "נוספו <k> יחידות חדשות ברמות קודמות" (k new units were added at earlier levels) once.
- **`ladder.html` without `?placement=1`:**
  - one section per level: its name and description, and a row per unit (state icon ✓, ▶, 🔓, 🔒 or 🆕), plus "בקרוב: <soon> יחידות" (coming soon: n units);
  - a locked unit in the current level shows "פתח בכל זאת" (open anyway);
  - buttons: "מבחן רמה מחדש" (retake the level test) and "לבחור רמה בעצמי" (choose a level myself). Choosing a level sets `placedAt` and `level`.
- **`ladder.html?placement=1`:**
  - one question at a time, multiple choice with `.option-btn`. Questions are built with `buildVocabQuestion` from `ladder-placement.json`: 4 `en-he` items plus 2 `cloze` items per block;
  - each answer records `Tracker.answer` with page topic `ladder-placement`;
  - after each block, call `placementStep`;
  - at the end, show the level reached, set `position.placedAt = position.level = result`, and offer a button to start it.
- Tracking pages:
  - the ladder map is `setPage({topic:'menu'})`;
  - placement is `setPage({topic:'ladder-placement', mode:'placement'})`.

- [ ] **Step 1: Write failing e2e steps** in `tests/e2e/tracking.e2e.js`. Extend the mock learners with `{"name":"אבא","grade":0,"gender":"male","minutesPerWeek":60,"daysPerWeek":3}`.
  - `existing learner sees the ladder card`: as נועה, `#ladderCard` contains "מבחן רמה", and the grade-5 topic cards are still present.
  - `placement lands on the expected level`:
    - open `app/ladder.html?placement=1`;
    - answer correctly for the A2 and B1 blocks and wrongly for B2;
    - the result shows `B2`;
    - back home, the card shows "רמה B2" and "יחידה 1".
  - `unit completion opens the next`:
    - for learner נועה, after placement at A1, write stats marking every item of `ladder-a1-01` correct in `localStorage` (`tirgul_vocab__נועה_ladder-a1-01`);
    - reload `ladder.html` → `ladder-a1-01` shows ✓, and `ladder-a1-02` is current.
  - `adult sees only the ladder`:
    - choose אבא → `#ladderCard` is visible, `#topicsGrid` is empty or hidden, `#changeGradeLink` is hidden, and no grade picker appears;
    - open `ladder-b2-01` flashcards → the Hebrew is masculine where `heM` exists. Pick one item with `heM` from the file and assert its text.
  - `review with nothing practiced`: as אבא, `quiz.html?ladder=review` shows the empty message, with no page errors.
  - `review keeps stats per unit`:
    - as נועה, after the A1-01 stats above, open review and answer 1 question;
    - the stats count for that item rises in `ladder-a1-01`'s key;
    - the event's topic is `ladder-review`.
  - `report shows the ladder line`: the report card for נועה contains "במסלול:".
- [ ] **Step 2:** Run the e2e → the new steps FAIL.
- [ ] **Step 3:** Implement the screens per the Interfaces above. Follow the existing styles (`.topic-card`, `.picker-card`, `.option-btn`, `.progress-bar`).
- [ ] **Step 4:** Run the full suite: unit tests, the e2e (all steps, old and new), `node _validate.js`, and the scratchpad regressions `r.js`, `reveal.js` and `sent.js` against `python3 -m http.server 5317` → all pass, with no page errors. Then take phone-size screenshots of:
  - the home card before and after placement;
  - `ladder.html`;
  - a placement question;
  - review.

  Check them for RTL and BiDi problems.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "ladder: home card, ladder page, placement, review, adult learner"`

### Task 5: Docs, deploy, live check

**Files:**
- Modify: `CLAUDE.md`: an "English ladder" section covering the files, unit file format, `heM`, manifest fields, how to add the next units (the same steps as word lists, plus `itemCount` and the `ladder` fields), and the build order of staying 2 units ahead of the furthest learner.
- Modify: `docs/CONTENT-FORMAT.md`: the ladder unit and placement file formats.
- Modify: `_tracking/SETUP.md`: one line saying an adult learner row can leave `grade` empty, to see only the path.

- [ ] **Step 1:** Update the docs. Run all tests, `_validate.js` and the e2e → they pass.
- [ ] **Step 2:** Final whole-branch review, per the execution skill. Then fast-forward `main` and `git push origin main`. Poll `https://udibarzi.github.io/tirgul/app/ladder.js` until it's served.
- [ ] **Step 3:** On the live site, with a fresh browser context and no setup:
  - add a learner using the adult card;
  - take placement;
  - open the current unit's flashcards → no page errors or 404s for scripts or content.
