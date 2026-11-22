const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, keepsMissing, parseSetupHash, weekStartOf, addDays } = require('../app/report.js');
const { loadGas } = require('./gas-mocks.js');

const TZ = 'Asia/Jerusalem';
let n = 0;
const ev = (o = {}) => ({ id: 'e' + (++n), ts: '2026-11-23T08:00:00.000Z', learner: 'נועה', type: 'answer', topic: 'english-food-5', level: 'words', mode: 'mix', kind: 'en-he', item: 'apple', correct: 1, given: '', seconds: '', ...o });
const opts = (weekStart, extra = {}) => ({ weekStart, tz: TZ, topicNames: { 'english-food-5': 'אנגלית — אוכל' }, ...extra });

test('report week matches server week', () => {
  const events = [
    ev({ type: 'time', ts: '2026-11-21T21:58:00Z', seconds: 600 }),   // Sat 23:58 Israel
    ev({ type: 'time', ts: '2026-11-21T22:03:00Z', seconds: 400 }),   // Sun 00:03 Israel
    ev({ type: 'time', ts: '2026-11-22T10:00:00Z', seconds: 900, topic: 'menu' }),
  ];
  const g = loadGas();
  for (const wk of ['2026-11-22', '2026-11-15']) {
    const server = JSON.parse(JSON.stringify(g.gas.weekSummary(events, 'נועה', wk)));
    const mine = aggregate(events, opts(wk))['נועה'];
    assert.equal(mine.minutes, server.minutes, wk);
    assert.equal(mine.days.length, server.days, wk);
  }
  assert.equal(aggregate(events, opts('2026-11-22'))['נועה'].menuMinutes, 15);
  assert.deepEqual(aggregate(events, opts('2026-11-22'))['נועה'].days, ['2026-11-22']);
});

test('counts and percentages', () => {
  const events = [
    ev({ kind: 'write', correct: 1 }), ev({ kind: 'write', correct: 0, given: 'aple' }),
    ev({ kind: 'en-he', correct: 1 }), ev({ kind: 'listen', correct: 1 }),
    ev({ type: 'card', kind: 'card', correct: 1 }), ev({ type: 'card', kind: 'card', correct: 0 }),
    ev({ type: 'session' }), ev({ type: 'session' }),
    ev({ type: 'time', seconds: 125 }),
    ev({ learner: 'מאיה', correct: 0 }),
  ];
  const r = aggregate(events, opts('2026-11-22'));
  const w = r['נועה'];
  assert.equal(w.questions, 4);
  assert.equal(w.cards, 2);
  assert.equal(w.correct, 4);
  assert.equal(w.wrong, 2);
  assert.equal(w.sessions, 2);
  assert.deepEqual(w.byKind.find(k => k.kind === 'write'), { kind: 'write', questions: 2, pct: 50 });
  assert.deepEqual(w.byTopic, [{ topic: 'english-food-5', name: 'אנגלית — אוכל', minutes: 2, questions: 6, pct: 67 }]);
  assert.equal(r['מאיה'].wrong, 1);
  assert.equal(w.lastTs, '2026-11-23T08:00:00.000Z');
});

test('events outside the week only feed the trend', () => {
  const events = [
    ev({ type: 'time', ts: '2026-11-23T08:00:00Z', seconds: 600 }),   // this week
    ev({ type: 'time', ts: '2026-11-16T08:00:00Z', seconds: 1200 }),  // last week
    ev({ type: 'time', ts: '2026-10-12T08:00:00Z', seconds: 1800 }),  // 6 weeks back: outside the trend
    ev({ ts: '2026-11-16T08:00:00Z' }),
  ];
  const w = aggregate(events, opts('2026-11-22'))['נועה'];
  assert.equal(w.minutes, 10);
  assert.equal(w.questions, 0);
  assert.deepEqual(w.trend, [0, 0, 0, 0, 20, 10]);
});

test('keepsMissing', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const at = d => `2026-11-${d}T08:00:00Z`;
  const events = [
    // fixed: wrong 3x then right 2x
    ev({ item: 'banana', correct: 0, ts: at(10) }), ev({ item: 'banana', correct: 0, ts: at(11) }), ev({ item: 'banana', correct: 0, ts: at(12) }),
    ev({ item: 'banana', correct: 1, ts: at(13) }), ev({ item: 'banana', correct: 1, ts: at(14) }),
    // still missing: wrong 2x
    ev({ item: 'thirsty', kind: 'write', correct: 0, given: 'thursty', ts: at(15) }),
    ev({ item: 'thirsty', kind: 'write', correct: 0, given: 'thirstey', ts: at(16) }),
    // wrong 3x, then right once: still listed
    ev({ item: 'Wednesday', correct: 0, ts: at(17) }), ev({ item: 'Wednesday', correct: 0, ts: at(18) }),
    ev({ item: 'Wednesday', correct: 0, ts: at(19) }), ev({ item: 'Wednesday', correct: 1, ts: at(20) }),
    // too old
    ev({ item: 'old', correct: 0, ts: '2026-10-01T08:00:00Z' }),
    // someone else
    ev({ item: 'cat', correct: 0, learner: 'מאיה', ts: at(20) }),
  ];
  const list = keepsMissing(events, 'נועה', now);
  assert.deepEqual(list, [
    { item: 'Wednesday', wrong: 3, lastGiven: '' },
    { item: 'thirsty', wrong: 2, lastGiven: 'thirstey' },
  ]);
  const many = [];
  for (let i = 0; i < 15; i++) many.push(ev({ item: 'w' + i, correct: 0, ts: at(20) }));
  assert.equal(keepsMissing(many, 'נועה', now).length, 10);
});

test('dayDots', () => {
  const events = [
    ev({ type: 'time', ts: '2026-11-22T08:00:00Z', seconds: 300 }),   // Sunday
    ev({ type: 'time', ts: '2026-11-24T08:00:00Z', seconds: 360 }),   // Tuesday
    ev({ type: 'time', ts: '2026-11-25T08:00:00Z', seconds: 100 }),   // Wednesday, too short
  ];
  const w = aggregate(events, opts('2026-11-22'))['נועה'];
  assert.deepEqual(w.dayDots, [true, false, true, false, false, false, false]);
  assert.deepEqual(w.shortDays, [false, false, false, true, false, false, false]);
});

test('week helpers and setup hash', () => {
  assert.equal(weekStartOf(Date.parse('2026-11-21T21:58:00Z'), TZ), '2026-11-15');
  assert.equal(weekStartOf(Date.parse('2026-11-21T22:03:00Z'), TZ), '2026-11-22');
  assert.equal(addDays('2026-11-22', -35), '2026-10-18');
  const b = Buffer.from(JSON.stringify({ url: 'https://x/exec', key: 'p' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(parseSetupHash('#setup=' + b), { url: 'https://x/exec', key: 'p' });
  assert.equal(parseSetupHash('#nope'), null);
});
