const test = require('node:test');
const assert = require('node:assert/strict');
const { createTracker, weekStartKey, dayKey } = require('../app/tracker.js');
const { fakeEnv } = require('./helpers/fake-env.js');

const CFG = { url: 'https://script.example/exec', key: 'w1' };

function setup(opts = {}) {
  const env = fakeEnv(opts);
  if (opts.config !== false) env.storage.setItem('tirgul_sync', JSON.stringify(CFG));
  const t = createTracker(env);
  t.addLocalProfile({ name: 'נועה', grade: 5, gender: 'female' });
  t.setCurrent('נועה');
  t.setPage({ topic: 'english-food-5', level: 'words', mode: 'write' });
  return { env, t };
}
const jsonResponse = obj => Promise.resolve({ ok: true, json: () => Promise.resolve(obj) });

test('counts only visible and recently active seconds', () => {
  const { env, t } = setup();
  t.activity();
  for (let i = 0; i < 30; i++) { env.advance(1000); t.tick(true); }
  for (let i = 0; i < 70; i++) { env.advance(1000); t.tick(true); }
  t.flushTime();
  const time = t.outbox().filter(e => e.type === 'time');
  assert.equal(time.length, 1);
  assert.equal(time[0].seconds, 60);
  assert.equal(time[0].topic, 'english-food-5');
  assert.equal(time[0].learner, 'נועה');

  t.activity();
  for (let i = 0; i < 10; i++) { env.advance(1000); t.tick(false); }
  t.flushTime();
  assert.equal(t.outbox().filter(e => e.type === 'time').length, 1);
});

test('switching learner flushes pending time to the previous learner', () => {
  const { env, t } = setup();
  t.addLocalProfile({ name: 'מאיה', grade: 8, gender: 'female' });
  t.activity();
  for (let i = 0; i < 5; i++) { env.advance(1000); t.tick(true); }
  t.setCurrent('מאיה');
  t.answer({ kind: 'en-he', item: 'cat', correct: true });
  const box = t.outbox();
  assert.deepEqual(box.map(e => [e.type, e.learner]), [['time', 'נועה'], ['answer', 'מאיה']]);
  assert.equal(box[0].seconds, 5);
});

test('event fields', () => {
  const { t } = setup();
  t.answer({ kind: 'write', item: 'apple', correct: false, given: 'x'.repeat(80) });
  t.answer({ kind: 'free-input', item: 'q', correct: true, given: '42' });
  t.card({ item: 'banana', correct: true });
  t.session();
  const [a, b, c, s] = t.outbox();
  assert.equal(a.correct, 0);
  assert.equal(a.given.length, 60);
  assert.equal(a.learner, 'נועה');
  assert.ok(a.id && a.ts && !isNaN(Date.parse(a.ts)));
  assert.equal(a.topic, 'english-food-5');
  assert.equal(a.level, 'words');
  assert.equal(a.mode, 'write');
  assert.equal(a.kind, 'write');
  assert.equal(a.seconds, '');
  assert.equal(b.given, '');
  assert.equal(b.correct, 1);
  assert.equal(c.type, 'card');
  assert.equal(c.correct, 1);
  assert.equal(c.item, 'banana');
  assert.equal(s.type, 'session');
  assert.equal(new Set([a.id, b.id, c.id, s.id]).size, 4);
});

test('send removes only confirmed ids', async () => {
  let reply;
  const { env, t } = setup({ fetchImpl: () => jsonResponse(reply) });
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  t.answer({ kind: 'en-he', item: 'b', correct: true });
  t.answer({ kind: 'en-he', item: 'c', correct: true });
  const [e1, e2, e3] = t.outbox();
  reply = { ok: true, saved: [e1.id], dup: [e2.id] };
  const r = await t.send();
  assert.equal(r.ok, true);
  assert.equal(r.sent, 3);
  assert.deepEqual(t.outbox().map(e => e.id), [e3.id]);
  const call = env.fetchCalls[0];
  assert.equal(call.url, CFG.url);
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['Content-Type'], 'text/plain');
  const body = JSON.parse(call.opts.body);
  assert.equal(body.key, 'w1');
  assert.equal(body.events.length, 3);
});

test('events queued during a send are kept', async () => {
  let release;
  const { t } = setup({ fetchImpl: () => new Promise(res => { release = res; }) });
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  const id = t.outbox()[0].id;
  const p = t.send();
  t.answer({ kind: 'en-he', item: 'b', correct: true });
  release({ ok: true, json: () => Promise.resolve({ ok: true, saved: [id], dup: [] }) });
  await p;
  assert.deepEqual(t.outbox().map(e => e.item), ['b']);
});

test('outbox survives failures and caps', async () => {
  const { env, t } = setup();
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  const r = await t.send();
  assert.equal(r.ok, false);
  assert.equal(t.outbox().length, 1);

  const seed = [];
  for (let i = 0; i < 5005; i++) seed.push({ id: 'time-' + i, type: 'time', learner: 'נועה', seconds: 1 });
  env.storage.setItem('tirgul_outbox', JSON.stringify(seed));
  for (let i = 0; i < 5; i++) t.answer({ kind: 'en-he', item: 'w' + i, correct: true });
  const box = t.outbox();
  assert.equal(box.length, 5000);
  assert.equal(box.filter(e => e.type === 'answer').length, 5);
  assert.equal(box.some(e => e.id === 'time-0'), false);
  assert.equal(box.some(e => e.id === 'time-9'), false);
  assert.equal(box.some(e => e.id === 'time-10'), true);
});

test('a send carries at most 300 events', async () => {
  const { env, t } = setup({ fetchImpl: () => jsonResponse({ ok: true, saved: [], dup: [] }) });
  const seed = [];
  for (let i = 0; i < 700; i++) seed.push({ id: 'e' + i, type: 'answer', learner: 'נועה' });
  env.storage.setItem('tirgul_outbox', JSON.stringify(seed));
  await t.send();
  assert.equal(JSON.parse(env.fetchCalls[0].opts.body).events.length, 300);
});

test('beacon keeps events', () => {
  const { env, t } = setup();
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  const before = JSON.stringify(t.outbox());
  t.beacon();
  assert.equal(env.beaconCalls.length, 1);
  assert.equal(env.beaconCalls[0].url, CFG.url);
  const body = JSON.parse(env.beaconCalls[0].body);
  assert.equal(body.key, 'w1');
  assert.equal(body.events.length, 1);
  assert.equal(JSON.stringify(t.outbox()), before);
});

test('local week', () => {
  const { env, t } = setup();
  const at = (d, h) => new Date(2026, 10, d, h).getTime();   // Nov 2026: 22 = Sunday
  function practice(ms, secs, topic = 'english-food-5') {
    env.setNow(ms);
    t.setPage({ topic });
    t.activity();
    for (let i = 0; i < secs; i++) { env.advance(1000); t.tick(true); if (i % 50 === 49) t.activity(); }
    t.flushTime();
  }
  practice(at(23, 10), 200);
  practice(at(24, 10), 200);
  practice(at(25, 10), 400);
  practice(at(25, 12), 1000, 'menu');
  practice(at(20, 10), 900);             // previous week
  assert.deepEqual(t.localWeek('נועה', at(26, 9)), { minutes: 13, days: 1 });
  assert.deepEqual(t.localWeek('נועה', at(21, 9)), { minutes: 15, days: 1 });
  assert.deepEqual(t.localWeek('מאיה', at(26, 9)), { minutes: 0, days: 0 });
});

test('weekStartKey and dayKey use the local Sunday', () => {
  assert.equal(weekStartKey(new Date(2026, 10, 28, 23, 59)), '2026-11-22');
  assert.equal(weekStartKey(new Date(2026, 10, 22, 0, 1)), '2026-11-22');
  assert.equal(weekStartKey(new Date(2026, 10, 21, 23, 59)), '2026-11-15');
  assert.equal(dayKey(new Date(2026, 0, 5, 7)), '2026-01-05');
});

test('no config → send is a no-op', async () => {
  const { env, t } = setup({ config: false });
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  const r = await t.send();
  assert.deepEqual(r, { ok: false, sent: 0 });
  assert.equal(env.fetchCalls.length, 0);
  t.beacon();
  assert.equal(env.beaconCalls.length, 0);
  assert.equal(t.outbox().length, 1);
});

test('no current learner → nothing recorded', () => {
  const env = fakeEnv();
  const t = createTracker(env);
  t.setPage({ topic: 'x' });
  t.answer({ kind: 'en-he', item: 'a', correct: true });
  assert.equal(t.outbox().length, 0);
});

test('fetchLearners caches sheet learners; fetchWeek returns numbers', async () => {
  const { env, t } = setup({ fetchImpl: url => {
    if (url.includes('action=learners')) return jsonResponse({ ok: true, learners: [{ name: 'נועה', grade: 5, gender: 'female', minutesPerWeek: 60, daysPerWeek: 3 }] });
    if (url.includes('action=week')) return jsonResponse({ ok: true, minutes: 42, days: 2 });
    return Promise.reject(new Error('?'));
  } });
  const list = await t.fetchLearners();
  assert.deepEqual(list.map(p => p.name), ['נועה']);
  assert.equal(t.getProfiles()[0].fromSheet, true);
  assert.equal(t.getProfiles()[0].minutesPerWeek, 60);
  assert.ok(env.fetchCalls[0].url.startsWith(CFG.url + '?action=learners&key=w1'));
  assert.deepEqual(await t.fetchWeek('נועה'), { minutes: 42, days: 2 });
  assert.ok(env.fetchCalls[1].url.includes('learner=' + encodeURIComponent('נועה')));
});

test('fetch failures resolve to null', async () => {
  const { t } = setup();
  assert.equal(await t.fetchLearners(), null);
  assert.equal(await t.fetchWeek('נועה'), null);
});
