/**
 * Practice tracker: learner profiles, per-learner storage keys, active-time
 * counting, an event outbox, and sending to the parent's Google Apps Script.
 *
 * createTracker(env) is pure and testable in Node; in the browser a ready
 * instance is exposed as window.Tracker. Nothing here may break practice:
 * every storage access is guarded, and without a setup link nothing is sent.
 */
(function () {
  'use strict';

  const KEYS = {
    sync: 'tirgul_sync',
    current: 'tirgul_current_learner',
    profiles: 'tirgul_profiles',
    learners: 'tirgul_learners',
    outbox: 'tirgul_outbox',
    migrated: 'tirgul_migrated_v1',
    days: name => 'tirgul_days__' + name,
    legacyName: 'math_app_username',
    legacyGrade: 'math_app_grade',
    legacyGender: 'math_app_gender',
  };
  const PROGRESS_BASE = 'math_app__';
  const VOCAB_BASE = 'tirgul_vocab__';
  const LEGACY_TOPIC_RE = /^math_app_(?!_)(?!username$|grade$|gender$)(.+)$/;
  const LEGACY_VOCAB_RE = /^tirgul_vocab_(?!_)(?!pref_)(.+)$/;

  function b64urlDecode(s) {
    let b = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b);
    return decodeURIComponent(escape(bin));
  }

  function createTracker(env) {
    // ---- guarded storage ----
    function get(k) { try { return env.storage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { env.storage.setItem(k, v); } catch (e) { /* ignore */ } }
    function del(k) { try { env.storage.removeItem(k); } catch (e) { /* ignore */ } }
    function getJSON(k, d) { try { const v = JSON.parse(get(k)); return v == null ? d : v; } catch (e) { return d; } }
    function setJSON(k, v) { try { set(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
    function allKeys() {
      const out = [];
      try { for (let i = 0; i < env.storage.length; i++) out.push(env.storage.key(i)); } catch (e) { /* ignore */ }
      return out;
    }
    function moveKey(from, to) {
      const v = get(from);
      if (v == null || get(to) != null) return;   // never overwrite existing data
      set(to, v);
      if (get(to) === v) del(from);
    }

    // ---- config ----
    function getConfig() {
      const c = getJSON(KEYS.sync, null);
      return c && typeof c.url === 'string' && typeof c.key === 'string' ? c : null;
    }
    function parseSetupHash(hash) {
      const m = /^#?setup=([A-Za-z0-9_-]+={0,2})$/.exec(String(hash || ''));
      if (!m) return null;
      try {
        const c = JSON.parse(b64urlDecode(m[1]));
        return c && typeof c.url === 'string' && /^https?:\/\//.test(c.url) && typeof c.key === 'string' && c.key ? { url: c.url, key: c.key } : null;
      } catch (e) { return null; }
    }
    function applySetupHash(hash) {
      const c = parseSetupHash(hash);
      if (!c) return false;
      setJSON(KEYS.sync, c);
      return true;
    }

    // ---- profiles ----
    function normProfile(p, fromSheet) {
      const out = { name: String(p.name || '').trim(), grade: Number(p.grade) || 0, gender: p.gender === 'male' ? 'male' : 'female', fromSheet: !!fromSheet };
      if (Number(p.minutesPerWeek) > 0) out.minutesPerWeek = Number(p.minutesPerWeek);
      if (Number(p.daysPerWeek) > 0) out.daysPerWeek = Number(p.daysPerWeek);
      if (!fromSheet && p.handled) out.handled = true;
      return out;
    }
    function sheetLearners() {
      const l = getJSON(KEYS.learners, []);
      return Array.isArray(l) ? l.filter(p => p && p.name && p.active !== false).map(p => normProfile(p, true)) : [];
    }
    function localProfiles() {
      const l = getJSON(KEYS.profiles, []);
      return Array.isArray(l) ? l.filter(p => p && p.name).map(p => normProfile(p, false)) : [];
    }
    function getProfiles() {
      const sheet = sheetLearners();
      const names = new Set(sheet.map(p => p.name));
      return sheet.concat(localProfiles().filter(p => !names.has(p.name)));
    }
    function addLocalProfile(p) {
      const prof = normProfile(p, false);
      if (!prof.name) return;
      const list = localProfiles().filter(x => x.name !== prof.name);
      list.push(prof);
      setJSON(KEYS.profiles, list.map(({ fromSheet, ...rest }) => rest));
    }
    function setSheetLearners(list) {
      if (!Array.isArray(list)) return;
      setJSON(KEYS.learners, list.map(p => { const { fromSheet, ...rest } = normProfile(p, true); return rest; }));
    }
    function currentName() { return get(KEYS.current) || get(KEYS.legacyName) || ''; }
    function getCurrent() {
      const name = currentName();
      if (!name) return null;
      const p = getProfiles().find(x => x.name === name);
      if (p) return p;
      return { name, grade: Number(get(KEYS.legacyGrade)) || 0, gender: get(KEYS.legacyGender) === 'male' ? 'male' : 'female', fromSheet: false };
    }
    function setCurrent(name) {
      name = String(name || '').trim();
      if (!name) return;
      set(KEYS.current, name);
      set(KEYS.legacyName, name);
      const p = getProfiles().find(x => x.name === name);
      if (p) {
        if (p.grade) set(KEYS.legacyGrade, String(p.grade));
        set(KEYS.legacyGender, p.gender);
      }
    }
    function progressPrefix(name) { return PROGRESS_BASE + (name == null ? currentName() : name); }
    function vocabKey(topicId, name) { return VOCAB_BASE + (name == null ? currentName() : name) + '_' + topicId; }

    // ---- migration and mapping ----
    function migrateLegacy() {
      if (get(KEYS.migrated)) return;
      const name = get(KEYS.legacyName);
      if (name) {
        if (!getProfiles().some(p => p.name === name)) {
          addLocalProfile({ name, grade: Number(get(KEYS.legacyGrade)) || 0, gender: get(KEYS.legacyGender) || 'female' });
        }
        if (!get(KEYS.current)) set(KEYS.current, name);
        for (const k of allKeys()) {
          let m = LEGACY_TOPIC_RE.exec(k);
          if (m) { moveKey(k, progressPrefix(name) + '_' + m[1]); continue; }
          m = LEGACY_VOCAB_RE.exec(k);
          if (m) moveKey(k, vocabKey(m[1], name));
        }
      }
      set(KEYS.migrated, '1');
    }
    function unmappedLocalNames() {
      const sheet = sheetLearners();
      if (!sheet.length) return [];
      const names = new Set(sheet.map(p => p.name));
      return localProfiles().filter(p => !names.has(p.name) && !p.handled).map(p => p.name);
    }
    function mapLearner(from, to) {
      const locals = localProfiles();
      if (to == null) {
        setJSON(KEYS.profiles, locals.map(({ fromSheet, ...p }) => (p.name === from ? { ...p, handled: true } : p)));
        return;
      }
      if (from === to) return;
      const fromP = PROGRESS_BASE + from + '_', toP = PROGRESS_BASE + to + '_';
      const fromV = VOCAB_BASE + from + '_', toV = VOCAB_BASE + to + '_';
      for (const k of allKeys()) {
        if (k.startsWith(fromP)) moveKey(k, toP + k.slice(fromP.length));
        else if (k.startsWith(fromV)) moveKey(k, toV + k.slice(fromV.length));
      }
      const fromDays = getJSON(KEYS.days(from), null);
      if (fromDays) {
        const toDays = getJSON(KEYS.days(to), {});
        for (const d in fromDays) toDays[d] = (toDays[d] || 0) + fromDays[d];
        setJSON(KEYS.days(to), toDays);
        del(KEYS.days(from));
      }
      const box = getJSON(KEYS.outbox, []);
      if (Array.isArray(box) && box.some(e => e && e.learner === from)) {
        setJSON(KEYS.outbox, box.map(e => (e && e.learner === from ? { ...e, learner: to } : e)));
      }
      setJSON(KEYS.profiles, locals.filter(p => p.name !== from).map(({ fromSheet, ...p }) => p));
      if (currentName() === from) setCurrent(to);
    }

    return {
      getConfig, applySetupHash,
      getProfiles, addLocalProfile, setSheetLearners, getCurrent, setCurrent,
      progressPrefix, vocabKey, migrateLegacy, unmappedLocalNames, mapLearner,
    };
  }

  // ---- browser instance ----
  if (typeof window !== 'undefined') {
    let storage;
    try { storage = window.localStorage; storage.getItem('x'); } catch (e) {
      const m = {}; storage = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, key: i => Object.keys(m)[i] ?? null, get length() { return Object.keys(m).length; } };
    }
    window.Tracker = createTracker({
      storage,
      now: () => Date.now(),
      fetch: (...a) => window.fetch(...a),
      sendBeacon: (url, body) => { try { return navigator.sendBeacon(url, body); } catch (e) { return false; } },
      uuid: () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2)),
    });
  }

  if (typeof module !== 'undefined') module.exports = { createTracker };
})();
