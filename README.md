# תרגול מתמטיקה — Math Practice App

Hebrew-language math practice application for elementary school students. Built as a static site for GitHub Pages — no server required.

## Quick Start

### Local Development
Open `index.html` in any browser. That's it — no build step, no dependencies.

### GitHub Pages Deployment
1. Push to GitHub
2. Settings → Pages → Source: `main` branch, root folder
3. Site is live at `https://{username}.github.io/{repo-name}/`

## Architecture

```
math-practice/
├── index.html              ← Landing page (name entry + topic grid)
├── app/
│   ├── quiz.html           ← Quiz engine (loads content dynamically)
│   ├── style.css           ← Shared styles (RTL-first, mobile responsive)
│   └── core.js             ← Core library (BiDi, charts, progress, confetti)
├── content/
│   ├── manifest.json       ← Topic registry
│   ├── fractions.json      ← Example: fractions topic
│   └── graphs-tables.json  ← Example: graphs with visuals
└── docs/
    └── CONTENT-FORMAT.md   ← JSON schema reference
```

### How It Works

1. **Landing page** (`index.html`): User enters their name (stored in localStorage). Shows topic grid with progress indicators.
2. **Topic selection**: Reads `content/manifest.json` to build the grid. Each card links to the quiz engine with `?topic={id}`.
3. **Quiz engine** (`app/quiz.html`): Loads `content/{topic-id}.json`, renders questions with full RTL/BiDi support, tracks progress.

### Core Library (`app/core.js`)

The core library contains battle-tested solutions for:

- **`fixBidi(text)`** — Detects math expressions in Hebrew text and wraps them in LTR-isolated spans. Handles Unicode fractions, superscripts, subscripts, operators, and the □ placeholder.
- **`renderVisual(container, visual)`** — Renders charts (bar, grouped bar, pie), tables, pictographs, and SVG geometry from JSON specs.
- **`ProgressManager`** — localStorage-based progress tracking with streak counting and question flagging.
- **`getCongratsMessage(name, streak)`** — 100+ personalized Hebrew congratulatory messages, scaled by streak length.
- **`launchConfetti(count)`** — CSS-only confetti animation.

## Adding Content

1. Create a new JSON file in `/content/` following the schema in `docs/CONTENT-FORMAT.md`
2. Register it in `content/manifest.json`
3. Push — GitHub Pages deploys automatically

### Quick Example

```json
{
  "id": "new-topic",
  "name": "נושא חדש",
  "icon": "📝",
  "questions": [
    {
      "text": "כמה זה 7 × 8?",
      "type": "free-input",
      "correct": ["56"],
      "explanation": "7 × 8 = 56"
    }
  ]
}
```

### Generating Content with Claude

Share `docs/CONTENT-FORMAT.md` with Claude and ask:
> "Generate 30 questions for {topic} following the schema in CONTENT-FORMAT.md. Mix multiple-choice and free-input types. Include Hebrew explanations."

## Key Design Decisions

### RTL / BiDi
Hebrew is right-to-left, but math expressions must render left-to-right. The `fixBidi` function solves this with regex-based detection and `unicode-bidi: isolate` wrapping. **Critical rule**: never use parentheses around Hebrew text — use em-dash (—) instead.

### No Build Step
Everything is vanilla HTML/CSS/JS. No framework, no bundler, no Node.js required. This maximizes portability and minimizes maintenance.

### localStorage for Progress
Progress persists per-device via localStorage. No server needed. Each topic tracks: correct/total answers, current streak, best streak, and flagged questions.

### Static JSON Content
Questions are plain JSON files loaded via `fetch()`. This separates content from presentation, enables version control on individual topics, and makes it easy to generate new content programmatically.

## Browser Support

- Chrome/Edge 80+
- Safari 13+
- Firefox 75+
- Mobile Safari / Chrome on iOS/Android

## License

MIT — Free for educational use.
