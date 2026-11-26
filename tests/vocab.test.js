const test = require('node:test');
const assert = require('node:assert/strict');

// vocab.js expects core.js globals (shuffle) and a browser localStorage.
global.shuffle = require('../app/core.js').shuffle;
const mem = new Map();
global.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const V = require('../app/vocab.js');

const content = () => ({
  type: 'vocab',
  words: [
    { en: 'I am tired', he: 'אני עייפה', heM: 'אני עייף' },
    { en: 'happy', he: 'שמח' }, { en: 'sad', he: 'עצוב' }, { en: 'angry', he: 'כועס' }, { en: 'bored', he: 'משועמם' },
  ],
  sentences: [
    { en: 'I am ready to go.', he: 'אני מוכנה ללכת.', heM: 'אני מוכן ללכת.', blank: 'ready' },
    { en: 'She is at home.', he: 'היא בבית.', blank: 'home' },
    { en: 'We like pizza a lot.', he: 'אנחנו אוהבים פיצה מאוד.', blank: 'pizza' },
    { en: 'They play in the park.', he: 'הם משחקים בפארק.', blank: 'park' },
  ],
});

test('record stores a timestamp', () => {
  V.VocabStats.record('u', 'cat', true);
  const s = V.VocabStats.get('u').cat;
  assert.equal(typeof s.t, 'number');
  assert.ok(Math.abs(s.t - Date.now()) < 5000);
  assert.deepEqual([s.r, s.w, s.last], [1, 0, 1]);
});

test('localizes every he field', () => {
  const c = content();
  const before = JSON.stringify(c);
  const m = V.localizeVocabContent(c, 'male');
  assert.equal(m.words[0].he, 'אני עייף');
  assert.equal(m.sentences[0].he, 'אני מוכן ללכת.');
  assert.equal(m.words[1].he, 'שמח');
  assert.equal(JSON.stringify(c), before, 'original unchanged');
  assert.deepEqual(V.localizeVocabContent(c, 'female'), c);
  for (let i = 0; i < 50; i++) {
    for (const q of V.buildVocabQuestions(m, 'en-he', 0, 'loc', 'words')) {
      assert.ok(!q.options.includes('אני עייפה'), 'feminine form leaked into options');
    }
  }
});

test('review questions keep their unit', () => {
  const a = content(), b = content();
  b.words = b.words.map(w => Object.assign({}, w, { en: w.en + ' b' }));
  const picks = [
    { unitId: 'ua', item: a.words[1], unitContent: a },
    { unitId: 'ua', item: a.sentences[0], unitContent: a },
    { unitId: 'ub', item: b.words[2], unitContent: b },
    { unitId: 'ub', item: b.sentences[1], unitContent: b },
  ];
  for (let i = 0; i < 30; i++) {
    const qs = V.buildReviewQuestions(picks);
    assert.equal(qs.length, 4);
    for (const q of qs) {
      const p = picks.find(x => x.item === q.word);
      assert.ok(p, 'question for a picked item');
      assert.equal(q.topicId, p.unitId);
      assert.notEqual(q.kind, 'speak');
      if (p.unitContent.sentences.includes(q.word)) assert.notEqual(q.kind, 'write');
      if (q.options) for (const o of q.options) {
        const pool = p.unitContent.words.concat(p.unitContent.sentences).map(x => x[q.optionsLang]).concat(p.unitContent.sentences.map(s => s.blank));
        assert.ok(pool.includes(o), 'option from the same unit: ' + o);
      }
    }
  }
  assert.deepEqual(V.buildReviewQuestions([]), []);
});
