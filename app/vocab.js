/**
 * vocab.js — English vocabulary practice engine.
 *
 * A vocab topic is a content JSON with "type": "vocab" and a "words" array:
 *   { "en": "flower", "he": "פרח", "group": "place", "alt": ["..."] }
 * (see docs/CONTENT-FORMAT.md). Questions are GENERATED at runtime from the
 * word list, so adding a new word list needs no question writing at all.
 *
 * Question kinds:
 *   en-he  — English word shown, pick the Hebrew meaning (multiple choice)
 *   he-en  — Hebrew shown, pick the English word (multiple choice)
 *   write  — Hebrew shown, type the English word (spelling)
 *
 * English text is NEVER passed through fixBidi() — it's rendered with
 * escapeHtml() inside dir="ltr" elements instead (fixBidi would split
 * words like "I'm sorry" around the apostrophe).
 *
 * Depends on core.js (shuffle).
 */

const VOCAB_MODES = {
  'mix':   { label: 'מבחן מעורב',       icon: '🎯' },
  'en-he': { label: 'מאנגלית לעברית',   icon: '🔤' },
  'he-en': { label: 'מעברית לאנגלית',   icon: '🇮🇱' },
  'write': { label: 'כתיבה באנגלית',    icon: '✍️' },
  'hard':  { label: 'מילים לחיזוק',     icon: '💪' },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Normalize typed English for comparison: case-insensitive, ignores
 * apostrophes and end punctuation, collapses spaces (but keeps them, so
 * "diningroom" is NOT accepted for "dining room").
 */
function vocabNormalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’‘'`´]/g, '')
    .replace(/[.!?,]/g, '')
    .replace(/[-‐–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Per-word stats (localStorage) ----
// Separate prefix from ProgressManager ('math_app_') so landing-page totals
// don't pick these up.
const VocabStats = {
  _key(topicId) { return 'tirgul_vocab_' + topicId; },
  get(topicId) {
    try { return JSON.parse(localStorage.getItem(this._key(topicId))) || {}; }
    catch (e) { return {}; }
  },
  record(topicId, en, isCorrect) {
    const all = this.get(topicId);
    const s = all[en] || { r: 0, w: 0 };
    if (isCorrect) s.r++; else s.w++;
    s.last = isCorrect ? 1 : 0;
    all[en] = s;
    try { localStorage.setItem(this._key(topicId), JSON.stringify(all)); } catch (e) {}
  },
  /** A word "needs work" if the last answer was wrong, or it was missed more than it was hit. */
  needsWork(s) { return !!s && (s.last === 0 || s.w > s.r); },
  hardWords(topicId, words) {
    const all = this.get(topicId);
    return words.filter(w => this.needsWork(all[w.en]));
  },
};

/** Pick `count` words, favoring ones she got wrong and ones not seen yet. */
function pickVocabWords(words, count, stats) {
  if (count >= words.length) return shuffle([...words]);
  const scored = words.map(w => {
    const s = stats[w.en];
    let score = Math.random() * 2;
    if (!s) score += 1;                       // unseen
    else score += (s.w - s.r) * 0.7 + (s.last === 0 ? 2 : 0);
    return { w, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return shuffle(scored.slice(0, count).map(x => x.w));
}

/** 3 distractors for `word` on `field` ('en' or 'he'), preferring the same group. */
function vocabDistractors(word, field, words) {
  const others = words.filter(o => o !== word && o[field] !== word[field]);
  const same = shuffle(others.filter(o => word.group && o.group === word.group));
  const rest = shuffle(others.filter(o => !(word.group && o.group === word.group)));
  const picked = [];
  const take = (list, n) => {
    for (const o of list) {
      if (picked.length >= n) break;
      if (!picked.includes(o[field])) picked.push(o[field]);
    }
  };
  take(same, 2);
  take(rest, 3);
  take(same, 3);
  return picked;
}

/** HTML for the letter-count hint shown in write mode: _ _ _ _   _ _ _ _ */
function vocabHintHtml(en) {
  return [...en].map(c => {
    if (/[a-z]/i.test(c)) return '<span class="hint-letter"></span>';
    if (c === ' ') return '<span class="hint-space"></span>';
    return '<span class="hint-char">' + escapeHtml(c) + '</span>';
  }).join('');
}

function buildVocabQuestion(word, kind, words) {
  const q = { vocab: true, kind, word };
  if (kind === 'write') {
    q.type = 'free-input';
    q.text = 'כתבו באנגלית:';
    q.correct = [word.en, ...(word.alt || [])];
    return q;
  }
  const field = kind === 'en-he' ? 'he' : 'en';
  const options = shuffle([word[field], ...vocabDistractors(word, field, words)]);
  q.type = 'multiple-choice';
  q.text = kind === 'en-he' ? 'מה הפירוש של המילה?' : 'איך אומרים באנגלית?';
  q.options = options;
  q.optionsLang = field;
  q.correct = options.indexOf(word[field]);
  return q;
}

/**
 * Generate a practice session.
 * @param {Object} content - vocab topic JSON
 * @param {string} mode - key of VOCAB_MODES
 * @param {number} count - number of questions (0 = all words)
 * @param {string} topicId
 */
function buildVocabQuestions(content, mode, count, topicId) {
  const words = content.words;
  const stats = VocabStats.get(topicId);
  let pool = words;
  if (mode === 'hard') {
    const hard = VocabStats.hardWords(topicId, words);
    if (hard.length) pool = hard;
  }
  const n = count > 0 ? count : pool.length;
  const chosen = pickVocabWords(pool, n, stats);

  let kinds;
  if (mode === 'en-he' || mode === 'he-en' || mode === 'write') {
    kinds = chosen.map(() => mode);
  } else {
    // mix / hard: even spread of all three kinds
    const cycle = ['en-he', 'he-en', 'write'];
    kinds = shuffle(chosen.map((_, i) => cycle[i % 3]));
  }
  return chosen.map((w, i) => buildVocabQuestion(w, kinds[i], words));
}

/** Render a vocab question's prompt (label + big word) into `el`. */
function renderVocabPrompt(el, q) {
  const showEn = q.kind === 'en-he';
  const text = showEn ? q.word.en : q.word.he;
  let html = '<div class="vocab-label">' + escapeHtml(q.text) + '</div>';
  html += '<div class="vocab-word" dir="' + (showEn ? 'ltr' : 'rtl') + '" lang="' + (showEn ? 'en' : 'he') + '">' +
          escapeHtml(text) +
          (showEn ? ' <button type="button" class="speak-btn" title="השמעה">🔊</button>' : '') +
          '</div>';
  if (q.kind === 'write') {
    html += '<div class="vocab-hint" dir="ltr">' + vocabHintHtml(q.word.en) + '</div>';
  }
  el.innerHTML = html;
  const sb = el.querySelector('.speak-btn');
  if (sb) sb.addEventListener('click', (e) => { e.stopPropagation(); speakEnglish(q.word.en); });
}

/** Read an English word aloud (browser text-to-speech). */
function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang && v.lang.startsWith('en'));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VOCAB_MODES, vocabNormalize, buildVocabQuestions, vocabDistractors, escapeHtml };
}
