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
