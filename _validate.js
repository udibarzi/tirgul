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
    console.log(`  ${topic.id}: ${counts.join(' + ')} (vocab, grade ${topic.grade || '?'}) ✓`);
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
  if (!topic.grade) {
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
