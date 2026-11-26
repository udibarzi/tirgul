#!/usr/bin/env node
/**
 * Validate all content JSON files and manifest.
 */
const fs = require('fs');
const path = require('path');
const { vocabSlug } = require('./app/vocab.js');

const contentDir = path.join(__dirname, 'content');
const manifest = JSON.parse(fs.readFileSync(path.join(contentDir, 'manifest.json'), 'utf-8'));

let errors = 0;
let warnings = 0;
let totalQuestions = 0;
let bidiIssues = 0;

// Hebrew in parentheses check
const hebrewInParens = /\([^)]*[\u0590-\u05FF][^)]*\)/;

console.log('=== Validating manifest ===');

// ---- English ladder (see docs/CONTENT-FORMAT.md) ----
const LADDER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ladderTopics = manifest.topics.filter(t => t.track === 'ladder');
const ladderSeen = new Set();
if (ladderTopics.length || manifest.ladderLevels !== undefined) {
  const ids = Array.isArray(manifest.ladderLevels) ? manifest.ladderLevels.map(l => l && l.id) : null;
  if (!ids || ids.join() !== LADDER_LEVELS.join()) {
    console.error(`  ERROR: manifest "ladderLevels" must list exactly ${LADDER_LEVELS.join(', ')} in order`);
    errors++;
  } else {
    manifest.ladderLevels.forEach(l => {
      if (!l.name || !(Number(l.plannedUnits) > 0)) {
        console.error(`  ERROR: ladderLevels ${l.id}: needs "name" and "plannedUnits"`);
        errors++;
      }
    });
  }
}
function checkLadderTopic(topic, data) {
  const bad = msg => { console.error(`  ERROR: ${topic.id}: ${msg}`); errors++; };
  const lad = topic.ladder;
  if (!lad || !LADDER_LEVELS.includes(lad.level) || !(Number.isInteger(lad.unit) && lad.unit > 0)) {
    bad('"ladder" needs {level: A1–C1, unit: a positive whole number}');
    return;
  }
  if (!data.ladder || data.ladder.level !== lad.level || data.ladder.unit !== lad.unit) bad('"ladder" in the content file differs from the manifest');
  const key = lad.level + '-' + lad.unit;
  if (ladderSeen.has(key)) bad(`duplicate ladder unit ${lad.level} ${lad.unit}`);
  ladderSeen.add(key);
  if (topic.grade !== undefined) bad('ladder topics must not have a "grade"');
  const nw = (data.words || []).length, ns = (data.sentences || []).length;
  if (topic.itemCount !== nw + ns) bad(`"itemCount" is ${topic.itemCount}, but the file has ${nw + ns} items`);
  (data.sentences || []).forEach((it, i) => { if (!it.blank) bad(`sentence ${i + 1} "${it.en}" has no "blank"`); });
  (data.words || []).concat(data.sentences || []).forEach(it => { if (it.heM !== undefined && (!it.heM || it.heM === it.he)) bad(`"${it.en}": "heM" must differ from "he"`); });
  if (nw < 20 || nw > 30 || ns < 15 || ns > 25) {
    console.warn(`  WARN: ${topic.id}: ${nw} words and ${ns} sentences — a unit should have 20–30 words and 15–25 sentences`);
    warnings++;
  }
}
function checkPlacement() {
  const file = path.join(contentDir, 'ladder-placement.json');
  if (!fs.existsSync(file)) {
    if (ladderTopics.length) { console.error('  ERROR: ladder topics exist but content/ladder-placement.json is missing'); errors++; }
    return;
  }
  let p;
  try { p = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { console.error(`  ERROR: ladder-placement.json: ${e.message}`); errors++; return; }
  const lv = p && p.levels;
  for (const id of LADDER_LEVELS) {
    const L = lv && lv[id];
    const w = L && Array.isArray(L.words) ? L.words : [], st = L && Array.isArray(L.sentences) ? L.sentences : [];
    if (w.length < 12 || st.length < 4) { console.error(`  ERROR: ladder-placement ${id}: needs 12+ words and 4+ sentences (has ${w.length} + ${st.length})`); errors++; }
    w.concat(st).forEach(it => { if (!it || !it.en || !it.he) { console.error(`  ERROR: ladder-placement ${id}: item without "en"/"he"`); errors++; } });
    st.forEach(it => {
      if (!it.blank || !Array.isArray(it.choices) || it.choices.length < 3 || it.choices.includes(it.blank)) {
        console.error(`  ERROR: ladder-placement ${id} "${it.en}": needs a "blank" and 3+ wrong "choices"`); errors++;
      }
    });
  }
  console.log(`  ladder-placement: ${LADDER_LEVELS.map(id => id + ' ' + (lv && lv[id] ? ((lv[id].words || []).length + (lv[id].sentences || []).length) : 0)).join(', ')} ✓`);
}
checkPlacement();

// Check all topic files exist
for (const topic of manifest.topics) {
  const filePath = path.join(contentDir, `${topic.id}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`  ERROR: Missing file for topic "${topic.id}": ${filePath}`);
    errors++;
    continue;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`  ERROR: Invalid JSON in ${topic.id}.json: ${e.message}`);
    errors++;
    continue;
  }

  // Vocab topics (English words / sentences): questions are generated at runtime
  if (topic.type === 'vocab' || Array.isArray(data.words) || Array.isArray(data.sentences)) {
    if (topic.type !== 'vocab' || data.type !== 'vocab') {
      console.error(`  ERROR: ${topic.id}: vocab topics need "type": "vocab" in both manifest and content file`);
      errors++;
    }
    const levels = ['words', 'sentences'].filter(l => data[l] !== undefined);
    if (!levels.length) {
      console.error(`  ERROR: ${topic.id}: vocab topic needs a "words" and/or "sentences" array`);
      errors++;
      continue;
    }
    const KINDS = ['en-he', 'he-en', 'write', 'listen', 'order', 'cloze', 'speak'];
    for (const key of ['modes', 'sentenceModes']) {
      if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(k => !KINDS.includes(k)))) {
        console.error(`  ERROR: ${topic.id}: "${key}" must be an array of ${KINDS.join(', ')}`);
        errors++;
      }
    }
    let noAudio = 0;
    const counts = [];
    for (const level of levels) {
      const items = data[level];
      const kind = level === 'words' ? 'word' : 'sentence';
      if (!Array.isArray(items) || items.length < 4) {
        console.error(`  ERROR: ${topic.id}: "${level}" needs at least 4 items`);
        errors++;
        continue;
      }
      const seen = new Set();
      items.forEach((w, i) => {
        const where = `${topic.id} ${kind} ${i + 1}${w && w.en ? ` "${w.en}"` : ''}`;
        if (!w.en || typeof w.en !== 'string' || !/^[A-Za-z][A-Za-z0-9 '’.,!?-]*$/.test(w.en)) {
          console.error(`  ERROR: ${where}: "en" must be English letters/punctuation only`);
          errors++;
        }
        if (!w.he || typeof w.he !== 'string') {
          console.error(`  ERROR: ${where}: missing "he"`);
          errors++;
        }
        if (w.alt && !Array.isArray(w.alt)) {
          console.error(`  ERROR: ${where}: "alt" must be an array`);
          errors++;
        }
        if (w.blank !== undefined) {
          const esc = String(w.blank).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp('(^|[^A-Za-z’\'])' + esc + '(?![A-Za-z])', 'g');
          const hits = (String(w.en).match(re) || []).length;
          if (hits !== 1) {
            console.error(`  ERROR: ${where}: "blank" "${w.blank}" must appear exactly once as a whole word (found ${hits})`);
            errors++;
          }
          if (w.choices && (!Array.isArray(w.choices) || w.choices.length < 3 || w.choices.includes(w.blank))) {
            console.error(`  ERROR: ${where}: "choices" must be 3+ wrong options, not including the blank`);
            errors++;
          }
          if (!w.choices && !(data.words || []).some(x => x.en.toLowerCase() === String(w.blank).toLowerCase())) {
            console.warn(`  WARN: ${where}: blank "${w.blank}" is not in the word list and has no "choices" — distractors will be random`);
            warnings++;
          }
        }
        const key = String(w.en || '').toLowerCase();
        if (seen.has(key)) {
          console.error(`  ERROR: ${where}: duplicate`);
          errors++;
        }
        seen.add(key);
        if (w.en && !fs.existsSync(path.join(__dirname, 'audio', 'en', vocabSlug(w.en) + '.mp3'))) noAudio++;
        if (w.he && hebrewInParens.test(w.he)) {
          console.warn(`  BIDI: ${where}: Hebrew text in parentheses`);
          bidiIssues++;
        }
      });
      const groups = {};
      items.forEach(w => { if (w.group) groups[w.group] = (groups[w.group] || 0) + 1; });
      for (const [g, n] of Object.entries(groups)) {
        if (n < 3) {
          console.warn(`  WARN: ${topic.id}: group "${g}" has only ${n} item(s) — distractors work best with 3+`);
          warnings++;
        }
      }
      totalQuestions += items.length;
      counts.push(`${items.length} ${level}`);
    }
    if (noAudio) {
      console.warn(`  WARN: ${topic.id}: ${noAudio} item(s) have no recording — run _build_audio.py (browser voice is used meanwhile)`);
      warnings++;
    }
    if (topic.track === 'ladder') checkLadderTopic(topic, data);
    console.log(`  ${topic.id}: ${counts.join(' + ')} (vocab, ${topic.track === 'ladder' ? 'ladder ' + (topic.ladder && topic.ladder.level) : 'grade ' + (topic.grade || '?')}) ✓`);
    continue;
  }

  if (!data.questions || !Array.isArray(data.questions)) {
    console.error(`  ERROR: No questions array in ${topic.id}.json`);
    errors++;
    continue;
  }

  const qCount = data.questions.length;
  totalQuestions += qCount;

  // Validate each question
  data.questions.forEach((q, i) => {
    // Must have text
    if (!q.text || typeof q.text !== 'string') {
      console.error(`  ERROR: ${topic.id} Q${i + 1}: missing text`);
      errors++;
    }

    // Must have type
    if (!q.type || !['free-input', 'multiple-choice'].includes(q.type)) {
      console.error(`  ERROR: ${topic.id} Q${i + 1}: invalid type "${q.type}"`);
      errors++;
    }

    // Must have correct answer
    if (q.type === 'free-input') {
      if (!q.correct || !Array.isArray(q.correct) || q.correct.length === 0) {
        console.error(`  ERROR: ${topic.id} Q${i + 1}: free-input must have correct array`);
        errors++;
      }
    } else if (q.type === 'multiple-choice') {
      if (typeof q.correct !== 'number') {
        console.error(`  ERROR: ${topic.id} Q${i + 1}: multiple-choice must have numeric correct`);
        errors++;
      }
      if (!q.options || !Array.isArray(q.options)) {
        console.error(`  ERROR: ${topic.id} Q${i + 1}: multiple-choice must have options array`);
        errors++;
      }
    }

    // BiDi check: Hebrew in parentheses
    if (q.text && hebrewInParens.test(q.text)) {
      console.warn(`  BIDI: ${topic.id} Q${i + 1}: Hebrew text in parentheses`);
      bidiIssues++;
    }
  });

  // Check grade field
  if (!topic.grade && topic.track !== 'ladder') {
    console.warn(`  WARN: ${topic.id} has no grade field in manifest`);
    warnings++;
  }

  console.log(`  ${topic.id}: ${qCount} questions (grade ${topic.grade || '?'}) ✓`);
}

// Check grades array
if (!manifest.grades || !Array.isArray(manifest.grades)) {
  console.error('  ERROR: manifest missing grades array');
  errors++;
}

console.log('\n=== Summary ===');
console.log(`Topics: ${manifest.topics.length}`);
console.log(`Total questions: ${totalQuestions}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
console.log(`BiDi issues: ${bidiIssues}`);
console.log(errors === 0 ? '\n✅ All validations passed!' : '\n❌ Validation failed!');

process.exit(errors > 0 ? 1 : 0);
