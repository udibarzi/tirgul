const test = require('node:test');
const assert = require('node:assert/strict');
const { createTracker } = require('../app/tracker.js');
const { fakeEnv } = require('./helpers/fake-env.js');

const b64url = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('migrates legacy keys once', () => {
  const env = fakeEnv({ storage: {
    math_app_username: 'נועה',
    math_app_grade: '5',
    math_app_gender: 'female',
    'math_app_food-5': '{"correct":3,"total":4}',
    'tirgul_vocab_english-food-5': '{"apple":{"r":1,"w":0}}',
    tirgul_vocab_pref_n: '20',
  } });
  const t = createTracker(env);
  t.migrateLegacy();
  const s = env.storage;
  assert.equal(s.getItem('math_app__נועה_food-5'), '{"correct":3,"total":4}');
  assert.equal(s.getItem('tirgul_vocab__נועה_english-food-5'), '{"apple":{"r":1,"w":0}}');
  assert.equal(s.getItem('math_app_food-5'), null);
  assert.equal(s.getItem('tirgul_vocab_english-food-5'), null);
  assert.equal(s.getItem('tirgul_vocab_pref_n'), '20');
  assert.equal(s.getItem('math_app_username'), 'נועה');
  assert.equal(s.getItem('math_app_grade'), '5');
  assert.equal(s.getItem('math_app_gender'), 'female');
  const snapshot = JSON.stringify([...s._map.entries()]);
  t.migrateLegacy();
  assert.equal(JSON.stringify([...s._map.entries()]), snapshot);
});

test('migration creates a local profile for the legacy user', () => {
  const env = fakeEnv({ storage: { math_app_username: 'noa', math_app_grade: '5', math_app_gender: 'female' } });
  const t = createTracker(env);
  t.migrateLegacy();
  assert.deepEqual(t.getProfiles().map(p => [p.name, p.grade, p.gender]), [['noa', 5, 'female']]);
  assert.equal(t.getCurrent().name, 'noa');
});

test('hebrew names round-trip', () => {
  const env = fakeEnv();
  const t = createTracker(env);
  t.addLocalProfile({ name: 'נועה בר', grade: 5, gender: 'female' });
  t.setCurrent('נועה בר');
  assert.equal(t.getCurrent().name, 'נועה בר');
  assert.equal(t.progressPrefix(), 'math_app__נועה בר');
  assert.equal(t.vocabKey('english-food-5'), 'tirgul_vocab__נועה בר_english-food-5');
  assert.equal(env.storage.getItem('math_app_gender'), 'female');
  assert.equal(env.storage.getItem('math_app_username'), 'נועה בר');
  assert.equal(env.storage.getItem('math_app_grade'), '5');
  // survives a fresh tracker on the same storage
  assert.equal(createTracker(env).getCurrent().name, 'נועה בר');
});

test('sheet learners first and exact', () => {
  const t = createTracker(fakeEnv());
  t.setSheetLearners([{ name: 'נועה', grade: 5, gender: 'female', minutesPerWeek: 60, daysPerWeek: 3, fromSheet: true }]);
  t.addLocalProfile({ name: 'noa', grade: 5, gender: 'female' });
  assert.deepEqual(t.getProfiles().map(p => p.name), ['נועה', 'noa']);
  assert.equal(t.getProfiles()[0].fromSheet, true);
  assert.deepEqual(t.unmappedLocalNames(), ['noa']);
});

test('mapLearner moves keys and queued events', () => {
  const env = fakeEnv({ storage: {
    'math_app__noa_food-5': '{"correct":1,"total":1}',
    'tirgul_vocab__noa_english-food-5': '{"x":1}',
    tirgul_outbox: JSON.stringify([{ id: 'e1', learner: 'noa', type: 'answer' }]),
  } });
  const t = createTracker(env);
  t.addLocalProfile({ name: 'noa', grade: 5, gender: 'female' });
  t.setCurrent('noa');
  t.setSheetLearners([{ name: 'נועה', grade: 5, gender: 'female', fromSheet: true }]);
  t.mapLearner('noa', 'נועה');
  assert.equal(env.storage.getItem('math_app__נועה_food-5'), '{"correct":1,"total":1}');
  assert.equal(env.storage.getItem('math_app__noa_food-5'), null);
  assert.equal(env.storage.getItem('tirgul_vocab__נועה_english-food-5'), '{"x":1}');
  assert.equal(JSON.parse(env.storage.getItem('tirgul_outbox'))[0].learner, 'נועה');
  assert.deepEqual(t.unmappedLocalNames(), []);
  assert.equal(t.getCurrent().name, 'נועה');
});

test('mapLearner to null only marks the name handled', () => {
  const env = fakeEnv({ storage: { 'math_app__noa_food-5': '{}' } });
  const t = createTracker(env);
  t.addLocalProfile({ name: 'noa', grade: 5, gender: 'female' });
  t.setSheetLearners([{ name: 'נועה', grade: 5, gender: 'female', fromSheet: true }]);
  t.mapLearner('noa', null);
  assert.deepEqual(t.unmappedLocalNames(), []);
  assert.equal(env.storage.getItem('math_app__noa_food-5'), '{}');
});

test('applySetupHash', () => {
  const env = fakeEnv();
  const t = createTracker(env);
  assert.equal(t.getConfig(), null);
  const cfg = { url: 'https://x/exec', key: 'k1' };
  assert.equal(t.applySetupHash('#setup=' + b64url(JSON.stringify(cfg))), true);
  assert.deepEqual(t.getConfig(), cfg);
  assert.equal(t.applySetupHash('#foo'), false);
  assert.equal(t.applySetupHash('#setup=@@notbase64'), false);
  assert.deepEqual(t.getConfig(), cfg);
});

test('switching learner does not relabel queued events', () => {
  const env = fakeEnv({ storage: { tirgul_outbox: JSON.stringify([{ id: 'e1', learner: 'A', type: 'answer' }]) } });
  const t = createTracker(env);
  t.addLocalProfile({ name: 'A', grade: 5, gender: 'female' });
  t.addLocalProfile({ name: 'B', grade: 8, gender: 'female' });
  t.setCurrent('A');
  t.setCurrent('B');
  assert.equal(JSON.parse(env.storage.getItem('tirgul_outbox'))[0].learner, 'A');
  assert.equal(t.getCurrent().name, 'B');
  assert.equal(env.storage.getItem('math_app_grade'), '8');
});

test('broken storage never throws', () => {
  const env = fakeEnv();
  env.storage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, get length() { throw new Error('x'); } };
  const t = createTracker(env);
  assert.doesNotThrow(() => { t.migrateLegacy(); t.addLocalProfile({ name: 'a', grade: 5, gender: 'female' }); t.setCurrent('a'); t.getProfiles(); t.getCurrent(); });
});
