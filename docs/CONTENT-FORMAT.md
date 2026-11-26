# Content Format Reference

This document defines the JSON schema for question content files. Follow this schema precisely when generating new topics or questions — the quiz engine relies on exact field names and types.

## File Structure

Each topic is a single JSON file in `/content/` named `{topic-id}.json`:

```json
{
  "id": "topic-id",
  "name": "שם הנושא בעברית",
  "icon": "📝",
  "version": "1.0.0",
  "shuffle": true,
  "questionsPerSession": 15,
  "questions": [ ... ]
}
```

### Top-level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique ID, matches filename (no spaces, lowercase + hyphens) |
| `name` | string | ✅ | Hebrew display name |
| `icon` | string | ✅ | Emoji icon for the topic card |
| `version` | string | ❌ | Semver for tracking content updates |
| `shuffle` | boolean | ❌ | Randomize question order (default: true) |
| `questionsPerSession` | number | ❌ | Limit questions per practice session (default: all) |
| `questions` | array | ✅ | Array of question objects |

## Question Object

```json
{
  "text": "חשבו: ⅓ + ¼ = ?",
  "type": "multiple-choice",
  "options": ["7/12", "2/7", "1/7", "5/12"],
  "correct": 0,
  "explanation": "מוצאים מכנה משותף...",
  "visual": { ... }
}
```

### Question Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | ✅ | Question text in Hebrew (see BiDi rules below) |
| `type` | string | ✅ | `"multiple-choice"` or `"free-input"` |
| `options` | string[] | MC only | Array of answer options |
| `correct` | number \| string \| string[] | ✅ | For MC: index (0-based). For free-input: accepted answer(s) |
| `explanation` | string | ✅ | Hebrew explanation shown on wrong answer |
| `visual` | object | ❌ | Visual element (chart, table, SVG) — see below |

## Question Types

### Multiple Choice

```json
{
  "text": "מהו 48 ÷ 6?",
  "type": "multiple-choice",
  "options": ["6", "7", "8", "9"],
  "correct": 2,
  "explanation": "48 ÷ 6 = 8"
}
```

- `correct` is the **0-based index** into `options`
- Typically 3–4 options
- Options can contain math expressions (fixBidi handles them)

### Free Input

```json
{
  "text": "חשבו: 15 × 3 = ?",
  "type": "free-input",
  "correct": ["45"],
  "explanation": "15 × 3 = 45"
}
```

- `correct` is an **array of accepted answers** (strings)
- Include alternate formats: `["2/3", "⅔"]` or `["0.5", "1/2"]`
- Comparison is whitespace-insensitive

## Visual Specifications

### Bar Chart

```json
{
  "type": "bar-chart",
  "title": "מספר תלמידים",
  "labels": ["כיתה א'", "כיתה ב'", "כיתה ג'"],
  "values": [30, 25, 35],
  "showValues": true,
  "colors": ["#FF6B6B", "#4ECDC4", "#45B7D1"],
  "yMax": 50,
  "gridStep": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `labels` | string[] | ✅ | Category labels |
| `values` | number[] | ✅ | Bar values |
| `showValues` | boolean | ❌ | Show numbers on bars (default: true). Set `false` for gridline-only reading |
| `colors` | string[] | ❌ | Custom bar colors |
| `yMax` | number | ❌ | Y-axis maximum (auto-calculated if omitted) |
| `gridStep` | number | ❌ | Grid line interval (auto-calculated if omitted) |
| `title` | string | ❌ | Chart title |

**Gridline-only mode** (`showValues: false`): Set `yMax` and `gridStep` explicitly so the child can read values from the grid. Make sure values fall on grid lines or clearly between them.

### Grouped Bar Chart

```json
{
  "type": "grouped-bar",
  "title": "מכירות לפי יום",
  "groups": ["ראשון", "שני", "שלישי"],
  "series": [
    {"name": "עוגיות", "values": [10, 15, 20], "color": "#FF6B6B"},
    {"name": "שוקולד", "values": [8, 12, 18], "color": "#4ECDC4"}
  ]
}
```

### Pie Chart

```json
{
  "type": "pie-chart",
  "title": "חלוקת תקציב",
  "slices": [
    {"label": "אוכל", "value": 40, "color": "#FF6B6B"},
    {"label": "בילויים", "value": 30, "color": "#4ECDC4"},
    {"label": "חיסכון", "value": 30, "color": "#45B7D1"}
  ]
}
```

### Data Table

```json
{
  "type": "table",
  "title": "ציונים במבחן",
  "headers": ["שם", "מתמטיקה", "עברית", "אנגלית"],
  "rows": [
    ["דנה", 95, 88, 92],
    ["יוסי", 82, 91, 87]
  ]
}
```

### Pictograph

```json
{
  "type": "pictograph",
  "title": "פירות שנאספו",
  "symbol": "🍎",
  "symbolValue": 5,
  "legend": "כל 🍎 = 5 פירות",
  "categories": [
    {"label": "דנה", "count": 15},
    {"label": "יוסי", "count": 25}
  ]
}
```

### SVG Geometry

```json
{
  "type": "svg-geometry",
  "svg": "<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>...</svg>"
}
```

- Provide complete, self-contained SVG
- Use `viewBox` for responsive sizing
- Label sides and angles with Hebrew text where needed
- Use clear, contrasting colors

## English Vocabulary Topics (`"type": "vocab"`)

A vocab topic has **no `questions`**: it holds a `words` list, and `app/vocab.js`
generates the questions at runtime (multiple choice in both directions plus
spelling). The landing page opens vocab topics in `app/vocab.html`, a menu with
flashcards, the word list, and the quiz modes.

```json
{
  "id": "english-words-2",
  "name": "אנגלית — מילים 2",
  "icon": "🔤",
  "type": "vocab",
  "questionsPerSession": 20,
  "words": [
    { "en": "flower", "he": "פרח" },
    { "en": "April", "he": "אפריל", "group": "month" },
    { "en": "fifteen", "he": "15", "group": "number" },
    { "en": "I'm sorry", "he": "אני מצטער / סליחה", "alt": ["I am sorry"] }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `en` | ✅ | English word or phrase, spelled exactly as in the book (capitals matter for display; typing is case-insensitive) |
| `he` | ✅ | Hebrew meaning. Several meanings: separate with ` / `. Numbers: use digits (`"15"`). No parentheses around Hebrew |
| `group` | ❌ | Words in the same group are used as wrong-answer options for each other: `month`, `number`, `place`, `verb`. Use groups of 3+ words |
| `alt` | ❌ | Other accepted spellings for the typing question |

### Sentences level

Add a `"sentences"` array; a topic can have `words`, `sentences`, or both. When it has both, the menu shows a words / sentences tab.

```json
"sentences": [
  { "en": "I'm hungry. Can I have some bread?", "he": "אני רעבה. אפשר קצת לחם?", "blank": "hungry" },
  { "en": "I went to the beach yesterday.", "he": "הלכתי לים אתמול.", "blank": "went", "choices": ["go", "goes", "going"] }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `en`, `he` | ✅ | The sentence and its translation. Keep sentences short, 3–10 words, because they become word tiles |
| `blank` | ❌ | The word or phrase hidden in the fill-in question. It must appear exactly once in `en` as a whole word, and must not be the sentence's first word, since the capital letter would give it away. It's best when it is a word from this topic's `words` list |
| `choices` | ❌ | 3+ wrong options for the gap. Use these for tense practice, e.g. `went` with `go`/`goes`/`going`. Without them, the wrong options come from the word list |

Optional `"modes"` (words level) and `"sentenceModes"` (sentences level) limit the question kinds. Words: `en-he`, `he-en`, `write`, `listen`, `speak`. Sentences: `order`, `cloze`, `en-he`, `he-en`, `listen`, `speak`. The default is all of them; `cloze` needs `blank`, and `speak` needs browser support.

Recordings: run `~/.cache/explain-skill/venv/bin/python -I _build_audio.py` after adding words. It creates `audio/en/{slug}.mp3` for any word that doesn't have one yet.

The manifest entry needs `"type": "vocab"` (plus `"subject": "english"`).
Apostrophes, end punctuation and letter case are ignored when checking typed answers; spaces are not.

### English ladder units (`"track": "ladder"`)

The ladder (A1 → C1) is made of ordinary vocab topics with a few extra fields. Spec: `docs/superpowers/specs/2026-11-26-english-ladder-design.md`.

- File: `content/ladder-<level lowercase>-<NN>.json`, e.g. `ladder-b2-04.json`.
- Content file: everything above, plus `"ladder": {"level": "B2", "unit": 4}`. 20–30 `words` and 15–25 `sentences`; **every sentence has a `blank`**.
- `heM` (optional, on any item): the masculine Hebrew, only where it differs from `he`. First-person `he` is feminine; a male learner sees `heM` instead (`localizeVocabContent` in `app/vocab.js`).
- Manifest entry: `"type": "vocab"`, `"subject": "english"`, `"track": "ladder"`, the same `"ladder"` object, `"itemCount"` (= words + sentences), and **no `grade`**. `name` is the Hebrew unit title only; screens add the level and unit number.
- Manifest `ladderLevels`: `[{id, name, description, plannedUnits}]` for exactly A1, A2, B1, B2, C1. `plannedUnits` minus the built units shows as "בקרוב".

```json
{ "id": "ladder-b2-04", "name": "בריאות והגוף", "icon": "🩺", "description": "...", "type": "vocab", "subject": "english",
  "track": "ladder", "ladder": { "level": "B2", "unit": 4 }, "itemCount": 47 }
```

`content/ladder-placement.json` (not in the manifest) holds the placement quiz: `{"levels": {"A1": {"words": [{en, he}], "sentences": [{en, he, blank, choices}]}, ...}}`, 12+ words and 4+ sentences per level, each sentence with 3+ wrong `choices`. Hebrew meanings within a level must all differ (they are each other's wrong options). `_validate.js` checks the ladder fields, unit numbering, `itemCount`, blanks, `heM` and the placement file.

## BiDi / RTL Rules

These rules are **critical** for correct rendering:

### ✅ DO

- Write math expressions naturally: `"חשבו: 3 × 4 = ?"` — `fixBidi` wraps them automatically
- Use parentheses around **math**: `"חשבו: (3 + 4) × 2"` — works fine
- Use Unicode fractions where readable: `½ ⅓ ¼ ¾`
- Use `□` for blanks in equations: `"□ + 5 = 12"`

### ❌ DON'T

- **NEVER** use parentheses around **Hebrew text**: `"20 כדורים (אדום וכחול)"` → BROKEN
- Instead use em-dash: `"20 כדורים — אדום וכחול"` → correct
- Or rephrase: `"20 כדורים, אדום וכחול"` → correct
- Don't use arrow symbols (→, ←, ⊂) in explanations — use Hebrew words instead

### Why?

In RTL context, parentheses are "mirrored" by the Unicode BiDi algorithm. When `fixBidi` wraps math expressions in LTR isolation, parentheses around math work correctly. But Hebrew text inside parentheses stays in RTL context, causing the opening `(` and closing `)` to appear on the wrong sides.

## Manifest Registration

After creating a content file, add it to `content/manifest.json`:

```json
{
  "id": "your-topic-id",
  "name": "שם הנושא",
  "icon": "📝",
  "description": "תיאור קצר",
  "difficulty": 2,
  "order": 9
}
```

## Content Generation Tips

When asking Claude to generate questions:

1. Reference this document: "Generate questions following the schema in CONTENT-FORMAT.md"
2. Specify the topic and difficulty level
3. Request a mix of `multiple-choice` and `free-input` types
4. For graph/table questions, specify `showValues: false` for harder questions
5. Always include Hebrew explanations
6. Test BiDi by checking for Hebrew text inside parentheses
7. Provide multiple accepted answers for free-input: `["2/3", "⅔", "0.667"]`
