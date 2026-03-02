#!/usr/bin/env node
/**
 * Extract 7th grade questions from math_advanced_150.html
 * Outputs 3 JSON files:
 *   - content/order-of-operations-7.json (Q1-50)
 *   - content/algebraic-expressions-7.json (Q51-100)
 *   - content/equations-7.json (Q101-150)
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '_sources', 'math_advanced_150.html'), 'utf-8');

// Normalize Unicode minus (U+2212 −) to regular hyphen-minus
function normMinus(s) {
  return s.replace(/\u2212/g, '-');
}

// Parse each question block
const questionRegex = /<!-- Q(\d+) --><div class="qc (l\d+)">([\s\S]*?)(?=<!-- Q\d+|<\/div>\s*\n*\s*<!-- =|<button class="btn-all")/g;

const questions = [];
let match;
while ((match = questionRegex.exec(html)) !== null) {
  const num = parseInt(match[1]);
  const level = parseInt(match[2].replace('l', ''));
  const block = match[3];

  // Extract question text from <div class="qt">
  const qtMatch = block.match(/<div class="qt">([\s\S]*?)<\/div>\s*<button/);
  if (!qtMatch) continue;

  let qtHtml = qtMatch[1];

  // Convert HTML to plain text with math expressions
  let questionText = qtHtml
    .replace(/<div class="mb">(.*?)<\/div>/g, ' $1')
    .replace(/<span class="m">(.*?)<\/span>/g, '$1')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract answer from <div class="ans">
  const ansMatch = block.match(/<div class="ans">([\s\S]*?)<\/div>/);
  let answerText = '';
  if (ansMatch) {
    answerText = ansMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract solution steps for explanation
  const solMatch = block.match(/<div class="ss">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  let explanation = '';
  if (solMatch) {
    explanation = solMatch[1]
      .replace(/<div class="ans">[\s\S]*?<\/div>/g, '')  // remove answer from explanation
      .replace(/<div class="mb">(.*?)<\/div>/g, '\n$1')   // math blocks on new line
      .replace(/<div class="step">(.*?)<\/div>/g, '\n$1')  // steps on new line
      .replace(/<[^>]+>/g, '')
      .replace(/\n+/g, '\n')
      .replace(/^\n/, '')
      .replace(/תשובה:.*$/m, '')
      .trim();
  }

  // Parse the correct answer(s)
  const correct = parseAnswer(answerText, num);

  questions.push({
    num,
    level,
    text: questionText,
    correct,
    explanation: explanation || answerText,
    answerText,
  });
}

console.log(`Extracted ${questions.length} questions`);

function parseAnswer(ansText, qNum) {
  // Remove "תשובה: " prefix
  let ans = ansText.replace(/^תשובה:\s*/, '').trim();

  // Special cases
  if (ans.includes('אין פתרון')) return ['אין פתרון'];
  if (ans.includes('כל מספר')) return ['אינסוף פתרונות', 'כל מספר הוא פתרון'];
  if (ans.startsWith('כן')) return ['כן'];

  // Normalize the minus sign for answer matching
  const ansNorm = normMinus(ans);

  // For equations (Q101-150), answers are like "x = 5" or "x = -1/3"
  const xMatch = ansNorm.match(/x\s*=\s*([\-\d\.\/]+)/);
  if (xMatch) {
    const val = xMatch[1];
    // Accept multiple formats: bare value, x=val, x = val
    // Include both Unicode minus and regular hyphen versions
    const answers = new Set();
    answers.add(val);
    answers.add(`x=${val}`);
    answers.add(`x = ${val}`);
    // Add Unicode minus variants if negative
    if (val.startsWith('-')) {
      const uniVal = val.replace(/^-/, '\u2212');
      answers.add(uniVal);
      answers.add(`x=${uniVal}`);
      answers.add(`x = ${uniVal}`);
    }
    // If fraction, also accept decimal
    if (val.includes('/')) {
      const parts = val.split('/');
      const dec = parseFloat(parts[0]) / parseFloat(parts[1]);
      const rounded = Math.round(dec * 100) / 100;
      answers.add(String(rounded));
    }
    return [...answers];
  }

  // For algebraic expressions, answers like "x + 8" or "-16x + 4" or "10x"
  if (ansNorm.match(/[a-z]/i)) {
    const answers = new Set();
    answers.add(ans); // original with Unicode minus
    answers.add(ansNorm); // with regular hyphen
    // Without spaces
    const noSpaces = ansNorm.replace(/\s+/g, '');
    answers.add(noSpaces);
    const noSpacesUni = ans.replace(/\s+/g, '');
    answers.add(noSpacesUni);
    return [...answers];
  }

  // Numeric answers - accept both minus forms
  const answers = new Set();
  answers.add(ans);
  answers.add(ansNorm);
  return [...answers];
}

// Split into 3 topics
const topics = [
  {
    id: 'order-of-operations-7',
    name: 'סדר פעולות חשבון',
    icon: '🔢',
    description: 'מספרים שליליים, חזקות, שורשים, ערך מוחלט',
    range: [1, 50],
  },
  {
    id: 'algebraic-expressions-7',
    name: 'ביטויים אלגבריים',
    icon: '📐',
    description: 'פישוט ביטויים, הצבה, סוגריים מקוננים',
    range: [51, 100],
  },
  {
    id: 'equations-7',
    name: 'משוואות',
    icon: '⚖️',
    description: 'פתרון משוואות — סוגריים, זהויות וסתירות',
    range: [101, 150],
  },
];

const contentDir = path.join(__dirname, 'content');

for (const topic of topics) {
  const topicQuestions = questions
    .filter(q => q.num >= topic.range[0] && q.num <= topic.range[1])
    .map(q => ({
      text: q.text,
      type: 'free-input',
      correct: q.correct,
      explanation: q.explanation,
      difficulty: q.level,
    }));

  const json = {
    id: topic.id,
    name: topic.name,
    icon: topic.icon,
    description: topic.description,
    questionsPerSession: 15,
    shuffle: true,
    questions: topicQuestions,
  };

  const outPath = path.join(contentDir, `${topic.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`  ${topic.id}: ${topicQuestions.length} questions → ${outPath}`);
}

console.log('Done!');
