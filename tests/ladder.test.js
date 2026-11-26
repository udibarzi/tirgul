const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../app/ladder.js');

const unit = (level, n, itemCount = 10) => ({
  id: `ladder-${level.toLowerCase()}-0${n}`, name: `${level} unit ${n}`, icon: '🪜', type: 'vocab', subject: 'english',
  track: 'ladder', ladder: { level, unit: n }, itemCount,
});
const manifest = (extra = []) => ({
  ladderLevels: ['A1', 'A2', 'B1', 'B2', 'C1'].map(id => ({ id, name: 'n' + id, description: 'd' + id, plannedUnits: 3 })),
  topics: [
    { id: 'english-food-5', name: 'food', grade: 5, order: 1, type: 'vocab' },
    unit('B1', 1), unit('A2', 2), unit('A1', 3), unit('A1', 1), unit('A2', 1), unit('A1', 2),
  ].concat(extra),
});
const allKnown = n => { const s = {}; for (let i = 0; i < n; i++) s['w' + i] = { r: 1, w: 0, last: 1 }; return s; };
const stats = map => id => map[id] || {};
const states = (st, level) => st.units.filter(u => u.level === level).map(u => u.state);

test('units come from the manifest in level order', () => {
  assert.deepEqual(L.ladderUnits(manifest()).map(u => u.id),
    ['ladder-a1-01', 'ladder-a1-02', 'ladder-a1-03', 'ladder-a2-01', 'ladder-a2-02', 'ladder-b1-01']);
  assert.deepEqual(L.ladderLevels(manifest()).map(l => l.id), L.LADDER_LEVELS);
  assert.deepEqual(L.LADDER_LEVELS, ['A1', 'A2', 'B1', 'B2', 'C1']);
});

test('known is capped at itemCount', () => {
  const r = L.unitStatus(10, allKnown(12));
  assert.equal(r.known, 10);
  assert.equal(r.complete, true);
  const seven = allKnown(7);
  seven.bad = { r: 0, w: 2, last: 0 };
  const s7 = L.unitStatus(10, seven);
  assert.deepEqual([s7.seen, s7.known, s7.total, s7.complete], [8, 7, 10, false]);
  assert.equal(L.unitStatus(10, allKnown(8)).complete, true);
  assert.equal(L.unitStatus(0, {}).complete, false);
});

test('fresh learner starts at A1 unit 1', () => {
  const st = L.ladderState(manifest(), L.defaultPosition(), stats({}));
  assert.equal(st.currentLevel, 'A1');
  assert.equal(st.currentUnitId, 'ladder-a1-01');
  assert.deepEqual(states(st, 'A1'), ['current', 'locked', 'locked']);
  assert.deepEqual(states(st, 'A2'), ['locked', 'locked']);
  assert.deepEqual(st.newUnitIds, []);
});

test('completing a unit opens the next', () => {
  const st = L.ladderState(manifest(), L.defaultPosition(), stats({ 'ladder-a1-01': allKnown(10) }));
  assert.deepEqual(states(st, 'A1'), ['done', 'current', 'locked']);
  assert.equal(st.currentUnitId, 'ladder-a1-02');
});

test('open anyway', () => {
  const pos = L.defaultPosition();
  pos.opened['ladder-a1-03'] = true;
  const st = L.ladderState(manifest(), pos, stats({}));
  assert.deepEqual(states(st, 'A1'), ['current', 'locked', 'open']);
});

test('level advances and never goes back', () => {
  const done = { 'ladder-a1-01': allKnown(10), 'ladder-a1-02': allKnown(10), 'ladder-a1-03': allKnown(10) };
  const st = L.ladderState(manifest(), L.defaultPosition(), stats(done));
  assert.equal(st.currentLevel, 'A2');
  assert.equal(st.position.level, 'A2');
  assert.equal(st.currentUnitId, 'ladder-a2-01');
  const m2 = manifest([unit('A1', 4)]);
  const st2 = L.ladderState(m2, st.position, stats(done));
  assert.equal(st2.currentLevel, 'A2');
  assert.equal(st2.units.find(u => u.id === 'ladder-a1-04').state, 'new');
  assert.deepEqual(st2.newUnitIds, ['ladder-a1-04']);
  const st3 = L.ladderState(m2, st2.position, stats(done));
  assert.equal(st3.units.find(u => u.id === 'ladder-a1-04').state, 'open');
  assert.deepEqual(st3.newUnitIds, []);
  assert.equal(st3.currentLevel, 'A2');
});

test('placement sets the level and passes the ones below', () => {
  const pos = Object.assign(L.defaultPosition(), { placedAt: 'B1', level: 'B1' });
  const st = L.ladderState(manifest(), pos, stats({ 'ladder-a2-01': allKnown(10) }));
  assert.equal(st.currentLevel, 'B1');
  assert.deepEqual(states(st, 'A1'), ['open', 'open', 'open']);
  assert.deepEqual(states(st, 'A2'), ['done', 'open']);
  assert.deepEqual(states(st, 'B1'), ['current']);
  assert.equal(st.currentUnitId, 'ladder-b1-01');
});

test('soon counts unbuilt units', () => {
  const st = L.ladderState(manifest(), L.defaultPosition(), stats({}));
  assert.equal(st.levels.find(l => l.id === 'A2').soon, 1);
  assert.equal(st.levels.find(l => l.id === 'A2').built, 2);
  assert.equal(st.levels.find(l => l.id === 'C1').soon, 3);
});

test('placementStep', () => {
  const h = (...xs) => xs.map(([level, correct]) => ({ level, correct, total: 6 }));
  assert.deepEqual(L.placementStep([]), { next: 'A2' });
  assert.deepEqual(L.placementStep(h(['A2', 5])), { next: 'B1' });
  assert.deepEqual(L.placementStep(h(['A2', 5], ['B1', 4])), { result: 'B1' });
  assert.deepEqual(L.placementStep(h(['A2', 5], ['B1', 6], ['B2', 2])), { result: 'B2' });
  assert.deepEqual(L.placementStep(h(['A2', 2])), { next: 'A1' });
  assert.deepEqual(L.placementStep(h(['A2', 2], ['A1', 6])), { result: 'A2' });
  assert.deepEqual(L.placementStep(h(['A2', 1], ['A1', 1])), { result: 'A1' });
  assert.deepEqual(L.placementStep(h(['A2', 6], ['B1', 6], ['B2', 6], ['C1', 6])), { result: 'C1' });
  assert.deepEqual(L.placementStep(h(['A2', 4])), { result: 'A2' });
});

test('review only uses practiced items', () => {
  const units = [
    { id: 'u1', items: [{ en: 'a' }, { en: 'b' }, { en: 'c' }] },
    { id: 'u2', items: [{ en: 'd' }, { en: 'e' }] },
  ];
  const st = { u1: { a: { r: 2, w: 0, last: 1, t: 100 }, b: { r: 1, w: 0, last: 1 } }, u2: { e: { r: 1, w: 1, last: 0, t: 500 } } };
  const picks = L.reviewPick(units, id => st[id] || {}, 20);
  assert.deepEqual(picks.map(p => p.item.en), ['e', 'b', 'a']);
  assert.deepEqual(picks.map(p => p.unitId), ['u2', 'u1', 'u1']);
  assert.equal(L.reviewPick(units, id => st[id] || {}, 2).length, 2);
});

test('review is empty when nothing practiced', () => {
  assert.deepEqual(L.reviewPick([{ id: 'u1', items: [{ en: 'a' }] }], () => ({}), 20), []);
  assert.deepEqual(L.reviewPick([], () => ({})), []);
});

test('position storage survives junk', () => {
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  assert.equal(L.positionKey('נועה'), 'tirgul_ladder__נועה');
  mem.set('tirgul_ladder__נועה', 'not json');
  assert.deepEqual(L.loadPosition(storage, 'נועה'), L.defaultPosition());
  const p = { level: 'B2', placedAt: 'B2', opened: { x: true }, seen: ['a'] };
  L.savePosition(storage, 'נועה', p);
  assert.deepEqual(L.loadPosition(storage, 'נועה'), p);
  mem.set('tirgul_ladder__x', '{"level":5,"opened":[],"seen":"no"}');
  assert.deepEqual(L.loadPosition(storage, 'x'), L.defaultPosition());
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.doesNotThrow(() => { L.savePosition(bad, 'a', p); assert.deepEqual(L.loadPosition(bad, 'a'), L.defaultPosition()); });
});

test('review units are done units and levels below the current one', () => {
  const pos = Object.assign(L.defaultPosition(), { placedAt: 'A2', level: 'A2' });
  const st = L.ladderState(manifest(), pos, stats({ 'ladder-a2-01': allKnown(10) }));
  assert.deepEqual(L.reviewUnitIds(st), ['ladder-a1-01', 'ladder-a1-02', 'ladder-a1-03', 'ladder-a2-01']);
});
