#!/usr/bin/env node
/**
 * Validate all content JSON files and manifest.
 */
const fs = require('fs');
const path = require('path');

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
