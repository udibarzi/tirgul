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
  speed.html            Speed drill (timed multiplication/division practice)
content/
  manifest.json         Topic registry with grades array and topic list
  *.json                One JSON file per topic (questions array)
_build_grade4.js        Generator script for 4th grade content
_build_grade7.js        Extractor script for 7th grade content
_validate.js            Validates all content JSON + manifest
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

Three grade levels: 4 (כיתה ד׳), 5 (כיתה ה׳), 7 (כיתה ז׳). Grade is stored in `localStorage` as `math_app_grade`. Topics are filtered by grade on the landing page.

## Adding new content

1. Create `content/{topic-id}.json` with `name`, `questions` array
2. Add entry to `content/manifest.json` `topics` array with `grade`, `order`, etc.
3. Run `node _validate.js` to check for errors
4. For 7th grade math: make sure answers include both Unicode minus (−) and regular hyphen (-) variants

## Common pitfalls

- **Unicode minus vs hyphen**: 7th grade content uses U+2212 (−) but keyboards type U+002D (-). Always include both in `correct` arrays.
- **Screenshots**: macOS may block reading screenshot files. Describe the visual issue or paste the image directly.
- **Testing BiDi**: The best way to verify is to view the live site. `npx serve .` from project root works for local testing.
