# English ladder: a learning path from A1 to C1 — design

Date: 2026-11-26 · Status: draft for approval, after a builder check. Decisions marked *(my call)* were made by Claude and are open to change.

## Why

The app's English is organized by school grade. Grade 5 sees one set of topics and grade 8 another. Inside a topic, the only levels are words and sentences. Nothing says "you've learned this, here's what's next". The parent wants:

- each learner to keep moving up instead of staying at one level;
- enough vocabulary and everyday sentences to express yourself well, all with recordings;
- the same path to work for three people:
  - the 5th grader (about A1–A2);
  - the 8th grader (about A2–B1);
  - the parent (45), whose technical English is strong from work in ML and deep learning, but who is missing everyday words (kitchen, house, errands, the body, feelings) and natural native phrasing: phrasal verbs, word pairs like "make a decision", small talk. The goal is to sound natural and fluent. The parent starts around B2–C1.

The way the girls use the app today is to see Hebrew, try to say it in English, then hear the recording. This should stay the core of the ladder.

## Goals

- One shared ladder, **A1 → A2 → B1 → B2 → C1**, made of short themed **units**. Each unit has about 25 words and 20 sentences, plus recordings for every item.
- A **placement quiz** of about 5 minutes sets where each learner starts.
- Units open in order. The next one opens once the current one is mostly known, so there's always a clear "next".
- Learned material keeps coming back in a **review** mode, so moving up doesn't mean forgetting.
- The upper levels (B2, C1) target natural everyday English:
  - everyday words natives use and learners miss: household, kitchen and cooking, errands and shopping, health and the body, money, cars and transport;
  - phrasal verbs, collocations (word pairs) and common idioms;
  - small talk, softening and polite phrasing ("I was wondering if…", "Would you mind…"), reacting in conversation, and agreeing and disagreeing.
- The school-test packs, grade topics and math are unchanged, and still shown next to the ladder.
- The parent can be a third learner, with no school grade.

## Non-goals

- Technical or ML vocabulary. The parent already has it.
- Grammar lessons with explanations. Grammar appears only through sentences, in fill-in, build-the-sentence and say-it.
- Real CEFR certification. The levels are an approximate guide, not an exam.
- Syncing a learner's ladder position across devices. In v1 it lives on the device (see Learner level).
- Any change to `_tracking/Code.gs`. The parent would have to paste it again and redeploy.

## Anti-goals

- A ladder that feels like a wall. A learner who is bored must be able to skip ahead, and one who is stuck must still see progress.
- Copying a published word list, such as Oxford 3000/5000, English Profile or Cambridge, verbatim. Claude writes the lists from its own knowledge of word frequency and level, and may use those lists as a general guide only.
- Childish content for the parent, or adult content unsuitable for the girls. Everything up to B1 must suit a 10-year-old. B2 and C1 must suit a 13-year-old.
- Breaking what exists today: the school packs, the tracking, or the per-learner progress.

## Approaches considered

1. **One shared ladder from A1 to C1 (chosen).** One system with placement, ordered units and review. The 8th grader grows into the levels the parent uses. This is the biggest build.
2. **Two tracks:** a kids' ladder and a separate natural-English track for the parent. The parent would get tuned content sooner, but there would be two sets of content and no shared path once the 8th grader outgrows hers.
3. **Keep adding topic packs.** This is the cheapest, but it has no path, which is the problem the parent raised.

## Design

### Content

- Each unit is an ordinary vocab topic file, so the whole existing engine applies unchanged: flashcards, every question kind, recordings, `VocabStats` and tracking events. Files are named `content/ladder-<level>-<NN>.json`, for example `ladder-a1-01.json`, and have `"type": "vocab"` plus `"ladder": {"level": "A1", "unit": 1}`.
- `content/manifest.json` gets a `ladderLevels` array:
  - each level has `{id: "A1", name: "מתחילים", description}` *(my call on the Hebrew names)*;
  - ladder topics get `"track": "ladder"` and **no `grade`**;
  - the grade filter on the home page must ignore them.
- **Unit size** *(my call)*: 20–30 words and 15–25 sentences. Every sentence has a `blank`, so fill-in works. Distractors prefer the same `group`.
- **Hebrew gender** *(my call)*:
  - First-person Hebrew in the ladder is written in the feminine, like the rest of the app.
  - Where the masculine form differs, the sentence also gets `heM`.
  - The engine shows `heM` when the current learner's gender is `male`.
  - The parent sets their own gender in the sheet's `learners` tab, so nothing about the parent is assumed.
- **Size of the full ladder**, as a guide:

  | Level | Units | Items |
  |---|---|---|
  | A1 | ~12 | ~550 |
  | A2 | ~16 | ~750 |
  | B1 | ~20 | ~900 |
  | B2 | ~20 | ~900 |
  | C1 | ~16 | ~700 |
  | **Total** | **~84** | **~3,800** |

  That's roughly 3,800 recordings, about 40 MB.
- **What each level covers:**
  - **A1:** the very first words and set phrases.
  - **A2:** daily life, past and future.
  - **B1:** opinions, plans, telling a story, and common phrasal verbs.
  - **B2:** everyday and household vocabulary in depth, collocations, phrasal verbs, and conversational phrases.
  - **C1:** idioms, nuance and register, softening, more precise everyday words, and natural replies.
  - The upper levels lean toward what the parent asked for.
- **Build order** *(my call)*:
  - Phase 1 ships the mechanism plus the first 3 units of every level, so all three learners can start the same day. That's 15 units, about 675 items.
  - After that, units are added level by level, staying at least 2 units ahead of the furthest learner at each level.
  - Each unit is generated with `_build_audio.py` and checked with `_validate.js`, exactly as today.

### Learner level

- Each learner has a ladder position: `{placedAt: "B2", unlocked: {"B2": 1, ...}}`. It's stored per learner in localStorage, under `tirgul_ladder__<name>`.
- On a device with the sheet set up, a learner whose grade is empty or 0 (the parent) sees only the ladder and no school topics. The minor issue "sheet grade not in manifest → dead end" must be fixed as part of this.
- Without setup, the local add-a-learner flow gets one extra option on the grade picker: "מבוגר/ת — רק המסלול" (adult, path only).

### Placement quiz

- It takes about 5 minutes, from the home screen: "בואו נמצא את הרמה שלך" (let's find your level). It's offered the first time a learner opens the ladder, and can be retaken.
- It's adaptive by level. Each level gets a block of about 6 items:
  - mostly "what does this mean?" multiple choice on words from across that level's full planned vocabulary;
  - plus 1–2 fill-in sentences.
- It starts at A2. Five or more right out of 6 moves up a level; 3 or fewer moves down; 4 means this is the level *(my call)*. It stops when the result settles.
- **Result:** the learner is placed at the highest level they passed, plus one. Earlier levels are marked as passed: open and reviewable, but not required.
- It's also possible to choose a level by hand, which covers the "I just want to start at B2" case.
- Placement items come from a separate `content/ladder-placement.json`, so placement doesn't depend on which units are built yet.

### Unlocking and progress

- **Units:** within a level, units are done in order. Unit N+1 opens when 80% of unit N's items have been seen and are not "needs work" (`VocabStats.needsWork`). A small "פתח בכל זאת" (open anyway) link opens the next unit early, so the ladder is never a wall.
- **Levels:** a level is complete when all its built units are complete. The next level then opens.
- **Units added later to a level already left** *(my call)*: they are optional extras. The learner's current level and "להמשיך" (continue) never move backwards. The ladder page marks the new units "חדש" (new), and the home card mentions them once. So the build order "at least 2 units ahead" is a goal, not a requirement.
- **Unbuilt units:** they appear as "בקרוב" (coming soon), so the path's length is visible.

### Review

- "חזרה" (review) draws 20 items from the units the learner has completed or passed, **only from items she has actually practiced** *(my call)*, meaning they have a stats record. Levels skipped through placement add nothing to review until she practices them. It prefers:
  - "needs work" items;
  - items not seen for the longest time.
- `VocabStats` records gain a `t` timestamp, the last-seen time, so "longest unseen" works. Practiced records without `t`, from before this change, count as long unseen.
- This is not a full spaced-repetition scheduler *(my call)*. It's simpler, and good enough for daily use.

### Screens

- **Home screen, a ladder card above the topics**:
  - the current level and unit;
  - unit progress, for example "18/45 ידועים";
  - a big "להמשיך" (continue) button that opens the current unit;
  - a "חזרה" (review) button.
- **Ladder page** `app/ladder.html`:
  - the levels as sections, with units listed in order: done ✓, current, open, locked, or coming soon;
  - placement entry and retake.
- **Unit page:** the existing `vocab.html` with that unit's topic id. The default level tab is sentences, and flashcards default to the Hebrew side.

### Tracking and report

- Ladder units are topics, so events (time, answers, cards, sessions) already flow, with no `Code.gs` change.
- The report's by-topic table shows unit names from the manifest.
- The report also shows each learner's latest ladder unit, inferred from the most recent ladder topic in their events *(my call)*. The true position stays on the device.
- Placement answers are recorded as normal `answer` events, with topic `ladder-placement`.

### Testing

- **Unit tests:** the unlock rule; review selection; the placement algorithm, given scripted answers; `heM` selection; grade-less learners.
- **`_validate.js`:** checks ladder files (level and unit fields, unique units per level, a `heM` only alongside first-person `he`) and the manifest's `ladderLevels`.
- **E2E:**
  - a fresh learner takes placement, lands at the expected level, completes a unit, and the next unit opens;
  - a grade-less learner sees only the ladder.

## Left to the builder

- The exact layout of the ladder card and page, following the existing style.
- The Hebrew level names and the unit themes inside each level.
- The placement items themselves.
- Whether review is a `quiz.html` mode or its own page.
