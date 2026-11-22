const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, post, get } = require('./gas-mocks.js');
const plain = x => JSON.parse(JSON.stringify(x));

const KEYS = { WRITE_KEY: 'w', PARENT_KEY: 'p' };
const LEARNERS = [
  { name: 'נועה', grade: 5, gender: 'female', minutesPerWeek: 60, daysPerWeek: 3 },
  { name: 'מאיה', grade: 8, gender: 'female', minutesPerWeek: 90, daysPerWeek: 3 },
];
const ev = (o = {}) => ({ id: 'e1', ts: '2026-11-23T08:00:00.000Z', learner: 'נועה', type: 'answer', topic: 'english-food-5', level: 'words', mode: 'mix', kind: 'en-he', item: 'apple', correct: 1, given: '', seconds: '', ...o });

test('setup creates tabs, time zone and keys once', () => {
  const g = loadGas();
  assert.deepEqual(plain(g.sheet('events')[0]), ['id', 'ts', 'learner', 'type', 'topic', 'level', 'mode', 'kind', 'item', 'correct', 'given', 'seconds', 'received']);
  assert.deepEqual(plain(g.sheet('learners')[0]), ['name', 'grade', 'gender', 'minutesPerWeek', 'daysPerWeek', 'active']);
  assert.equal(g.tz(), 'Asia/Jerusalem');
  assert.match(g.props.WRITE_KEY, /^[0-9a-f]{32}$/);
  assert.match(g.props.PARENT_KEY, /^[0-9a-f]{32}$/);
  assert.notEqual(g.props.WRITE_KEY, g.props.PARENT_KEY);
  const before = { ...g.props };
  g.gas.setup();
  assert.deepEqual(g.props, before);
  assert.equal(g.sheet('events').length, 1);
});

test('rejects wrong key', () => {
  const g = loadGas({ props: KEYS });
  assert.deepEqual(post(g, { key: 'x', events: [ev()] }), { ok: false, error: 'key' });
  assert.deepEqual(post(g, { events: [ev()] }), { ok: false, error: 'key' });
  assert.equal(g.sheet('events').length, 1);
  assert.equal(get(g, { action: 'learners', key: 'x' }).ok, false);
});

test('same id twice saves once', () => {
  const g = loadGas({ props: KEYS });
  const r1 = post(g, { key: 'w', events: [ev()] });
  assert.deepEqual(r1, { ok: true, saved: ['e1'], dup: [], bad: [] });
  const r2 = post(g, { key: 'w', events: [ev(), ev({ id: 'e2' }), ev({ id: 'e2' })] });
  assert.deepEqual(r2, { ok: true, saved: ['e2'], dup: ['e1', 'e2'], bad: [] });
  assert.equal(g.sheet('events').length, 3);
  const row = g.sheet('events')[1];
  assert.equal(row[0], 'e1');
  assert.equal(row[2], 'נועה');
  assert.ok(row[12]);   // received
});

test('bad events are skipped, not saved', () => {
  const g = loadGas({ props: KEYS });
  const r = post(g, { key: 'w', events: [{ ts: 'x' }, ev({ id: 'e9', learner: '' }), ev({ id: 'ok', given: 'g'.repeat(500) })] });
  assert.deepEqual(r.saved, ['ok']);
  assert.deepEqual(r.bad, ['e9']);
  assert.equal(g.sheet('events').length, 2);
  assert.equal(g.sheet('events')[1][10].length, 60);
});

test('write key cannot read events', () => {
  const g = loadGas({ props: KEYS });
  post(g, { key: 'w', events: [ev()] });
  assert.equal(get(g, { action: 'events', key: 'w', from: '2026-11-22', to: '2026-11-28' }).ok, false);
  const r = get(g, { action: 'events', key: 'p', from: '2026-11-22', to: '2026-11-28' });
  assert.equal(r.ok, true);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].item, 'apple');
  assert.equal(r.events[0].correct, 1);
  assert.equal(get(g, { action: 'events', key: 'p', from: '2026-11-29', to: '2026-12-05' }).events.length, 0);
  assert.equal(get(g, { action: 'events', key: 'p', from: '2026-01-01', to: '2026-11-28' }).ok, false);   // > 84 days
});

test('week boundary Asia/Jerusalem', () => {
  const g = loadGas({ props: KEYS });
  const events = [
    ev({ id: 'a', type: 'time', ts: '2026-11-21T21:58:00Z', seconds: 600 }),   // Sat 23:58 Israel
    ev({ id: 'b', type: 'time', ts: '2026-11-21T22:03:00Z', seconds: 400 }),   // Sun 00:03 Israel
  ];
  assert.deepEqual(plain(g.gas.weekSummary(events, 'נועה', '2026-11-22')), { minutes: 6, days: 1 });
  assert.deepEqual(plain(g.gas.weekSummary(events, 'נועה', '2026-11-15')), { minutes: 10, days: 1 });
  assert.deepEqual(plain(g.gas.weekSummary(events, 'מאיה', '2026-11-22')), { minutes: 0, days: 0 });
});

test('menu time excluded', () => {
  const g = loadGas({ props: KEYS });
  const events = [
    ev({ id: 'a', type: 'time', topic: 'menu', seconds: 900 }),
    ev({ id: 'b', type: 'time', seconds: 120 }),
  ];
  assert.deepEqual(plain(g.gas.weekSummary(events, 'נועה', '2026-11-22')), { minutes: 2, days: 0 });
});

test('week action counts this week from the sheet', () => {
  const g = loadGas({ props: KEYS });
  post(g, { key: 'w', events: [ev({ id: 't1', type: 'time', ts: new Date().toISOString(), seconds: 400 })] });
  assert.deepEqual(get(g, { action: 'week', key: 'w', learner: 'נועה' }), { ok: true, minutes: 6, days: 1 });
  assert.deepEqual(get(g, { action: 'week', key: 'w', learner: 'מאיה' }), { ok: true, minutes: 0, days: 0 });
});

test('setGoal updates row', () => {
  const g = loadGas({ props: KEYS, learners: LEARNERS });
  const req = { action: 'setGoal', learner: 'נועה', minutesPerWeek: 90, daysPerWeek: 4 };
  assert.equal(post(g, { key: 'w', ...req }).ok, false);
  assert.deepEqual(post(g, { key: 'p', ...req }), { ok: true });
  const row = g.sheet('learners').find(r => r[0] === 'נועה');
  assert.equal(row[3], 90);
  assert.equal(row[4], 4);
  assert.equal(post(g, { key: 'p', ...req, learner: 'nobody' }).ok, false);
  assert.equal(post(g, { key: 'p', ...req, minutesPerWeek: -5 }).ok, false);
});

test('learners returns active only', () => {
  const g = loadGas({ props: KEYS, learners: [...LEARNERS, { name: 'old', grade: '4', gender: 'male', active: false }, { name: 'text-false', grade: 4, gender: 'male', active: 'FALSE' }] });
  g.sheet('learners')[1][1] = '5';   // typed as text in the sheet
  const r = get(g, { action: 'learners', key: 'w' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.learners, [
    { name: 'נועה', grade: 5, gender: 'female', minutesPerWeek: 60, daysPerWeek: 3 },
    { name: 'מאיה', grade: 8, gender: 'female', minutesPerWeek: 90, daysPerWeek: 3 },
  ]);
  assert.equal(get(g, { action: 'learners', key: 'p' }).ok, true);
});

test('showLinks logs device and parent links; ping adds a test row', () => {
  const g = loadGas({ props: KEYS });
  g.gas.showLinks();
  const all = g.logs.join('\n');
  const dev = /https:\/\/udibarzi\.github\.io\/tirgul\/#setup=([A-Za-z0-9_=-]+)/.exec(all);
  const par = /https:\/\/udibarzi\.github\.io\/tirgul\/app\/report\.html#setup=([A-Za-z0-9_=-]+)/.exec(all);
  assert.ok(dev && par);
  const dec = s => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.deepEqual(dec(dev[1]), { url: 'https://script.google.com/macros/s/MOCK/exec', key: 'w' });
  assert.deepEqual(dec(par[1]), { url: 'https://script.google.com/macros/s/MOCK/exec', key: 'p' });
  g.gas.ping();
  assert.equal(g.sheet('events').length, 2);
  assert.equal(g.sheet('events')[1][2], 'test');
});

test('writes keep working past the first 1,000 rows', () => {
  const g = loadGas({ props: KEYS });
  let saved = 0;
  for (let b = 0; b < 5; b++) {
    const batch = [];
    for (let i = 0; i < 300; i++) batch.push(ev({ id: `b${b}-${i}` }));
    const r = post(g, { key: 'w', events: batch });
    assert.equal(r.ok, true, 'batch ' + b + ' ' + JSON.stringify(r).slice(0, 120));
    saved += r.saved.length;
  }
  assert.equal(saved, 1500);
  assert.equal(g.sheet('events').length, 1501);
});

test('every written range is plain text and formulas are neutralised', () => {
  const g = loadGas({ props: KEYS });
  post(g, { key: 'w', events: [ev({ id: 'f1', kind: 'write', given: '=IMAGE("http://x")', item: '+apple' }), ev({ id: 'f2', given: '007', kind: 'write' })] });
  const sh = g.sheetObj('events');
  assert.ok(sh._formats.some(f => f.row === 2 && f.numRows === 2 && f.numCols === 13 && f.f === '@'), 'format on write range');
  const row = g.sheet('events')[1];
  assert.ok(!String(row[10]).startsWith('='), 'given stored as text');
  assert.ok(!String(row[8]).startsWith('+'), 'item stored as text');
  const back = get(g, { action: 'events', key: 'p', from: '2026-11-22', to: '2026-11-28' }).events;
  assert.equal(back.find(e => e.id === 'f1').given, '=IMAGE("http://x")');
  assert.equal(back.find(e => e.id === 'f1').item, '+apple');
  assert.equal(back.find(e => e.id === 'f2').given, '007');
});

test('errors come back as JSON', () => {
  const g = loadGas({ props: KEYS });
  g.ss.deleteSheet(g.sheetObj('events'));
  const r = post(g, { key: 'w', events: [ev()] });
  assert.equal(r.ok, false);
  assert.equal(get(g, { action: 'week', key: 'w', learner: 'נועה' }).ok, false);
});

test('showLinks refuses a dev URL and uses the pasted web app URL', () => {
  const dev = loadGas({ props: KEYS, serviceUrl: 'https://script.google.com/macros/s/ABC/dev' });
  dev.gas.showLinks();
  assert.ok(!dev.logs.join('\n').includes('#setup='), 'no links from a /dev URL');
  assert.ok(dev.logs.join('\n').includes('WEB_APP_URL'), 'tells the parent what to do');

  const pasted = loadGas({ props: KEYS, serviceUrl: 'https://script.google.com/macros/s/ABC/dev', webAppUrl: 'https://script.google.com/macros/s/REAL/exec' });
  pasted.gas.showLinks();
  const m = /#setup=([A-Za-z0-9_=-]+)/.exec(pasted.logs.join('\n'));
  assert.ok(m);
  const cfg = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.equal(cfg.url, 'https://script.google.com/macros/s/REAL/exec');

  const bad = loadGas({ props: KEYS, webAppUrl: 'https://script.google.com/macros/s/REAL/dev' });
  bad.gas.showLinks();
  assert.ok(!bad.logs.join('\n').includes('#setup='));
});
