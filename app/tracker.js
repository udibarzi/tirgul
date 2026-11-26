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
  const LADDER_BASE = 'tirgul_ladder__';   // same as ladder.js positionKey()
  const LEGACY_TOPIC_RE = /^math_app_(?!_)(?!username$|grade$|gender$)(.+)$/;
  const LEGACY_VOCAB_RE = /^tirgul_vocab_(?!_)(?!pref_)(.+)$/;
  const OUTBOX_CAP = 5000;
  const OUTBOX_CAP_UNCONFIGURED = 500;
  const SEND_MAX = 300;
  const BEACON_MAX = 100;               // sendBeacon payloads are limited to ~64 KB
  const SEND_INTERVAL_MS = 60000;
  const ACTIVE_WINDOW_MS = 60000;
  const PRACTICE_DAY_SECONDS = 300;
  const DAY_MS = 86400000;

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
    // Move a progress or vocab-stats key; when the destination already has data, merge the two.
    function moveKey(from, to) {
      const v = get(from);
      if (v == null) return;
      const existing = get(to);
      let next = v;
      if (existing != null) {
        next = mergeStored(to, existing, v);
        if (next == null) return;   // unknown shape: leave both untouched
      }
      set(to, next);
      if (get(to) === next) del(from);
    }
    function mergeStored(key, a, b) {
      let x, y;
      try { x = JSON.parse(a); y = JSON.parse(b); } catch (e) { return null; }
      if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return null;
      if (key.indexOf(PROGRESS_BASE) === 0) {
        const flagged = Array.from(new Set([].concat(x.flagged || [], y.flagged || [])));
        return JSON.stringify(Object.assign({}, x, {
          correct: (x.correct || 0) + (y.correct || 0),
          total: (x.total || 0) + (y.total || 0),
          bestStreak: Math.max(x.bestStreak || 0, y.bestStreak || 0),
          flagged,
        }));
      }
      if (key.indexOf(VOCAB_BASE) === 0) {
        const out = Object.assign({}, x);
        for (const w in y) {
          const p = x[w], q = y[w];
          if (!p || !q) { out[w] = p || q; continue; }
          const m = { r: (p.r || 0) + (q.r || 0), w: (p.w || 0) + (q.w || 0) };
          if (p.last !== undefined || q.last !== undefined) {
            m.last = Math.min(p.last === undefined ? 1 : p.last, q.last === undefined ? 1 : q.last);
          }
          if (typeof p.t === 'number' || typeof q.t === 'number') m.t = Math.max(p.t || 0, q.t || 0);
          out[w] = m;
        }
        return JSON.stringify(out);
      }
      return null;
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
      if (p.ladderOnly) out.ladderOnly = true;
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
      if (name !== currentName()) flushTime();
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
    function ladderKey(name) { return LADDER_BASE + (name == null ? currentName() : name); }

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
      const ladderFrom = get(LADDER_BASE + from);
      if (ladderFrom != null) {
        if (get(LADDER_BASE + to) == null) set(LADDER_BASE + to, ladderFrom);
        if (get(LADDER_BASE + to) != null) del(LADDER_BASE + from);
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

    // ---- events and outbox ----
    let page = { topic: '', level: '', mode: '' };
    let lastActivity = -Infinity;
    let pending = 0;          // active seconds not yet queued
    let pendingAt = 0;        // time of the last counted second
    let sending = false;

    function outbox() { const b = getJSON(KEYS.outbox, []); return Array.isArray(b) ? b : []; }
    function capOutbox(box) {
      // A device that is not set up never sends, so it keeps only a small recent history
      const cap = getConfig() ? OUTBOX_CAP : OUTBOX_CAP_UNCONFIGURED;
      let excess = box.length - cap;
      if (excess <= 0) return box;
      box = box.filter(e => !(excess > 0 && e && e.type === 'time' && excess-- > 0));
      return box.length > cap ? box.slice(box.length - cap) : box;
    }
    function enqueue(fields, tsMs) {
      const learner = currentName();
      if (!learner) return null;
      const ev = {
        id: env.uuid(), ts: new Date(tsMs == null ? env.now() : tsMs).toISOString(), learner,
        type: '', topic: page.topic, level: page.level, mode: page.mode,
        kind: '', item: '', correct: '', given: '', seconds: '',
        ...fields,
      };
      setJSON(KEYS.outbox, capOutbox(outbox().concat([ev])));
      return ev;
    }
    function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

    function setPage(ctx) {
      flushTime();
      page = { topic: clip(ctx && ctx.topic, 80), level: clip(ctx && ctx.level, 20), mode: clip(ctx && ctx.mode, 20) };
    }
    function session() { enqueue({ type: 'session' }); }
    function answer({ kind, item, correct, given }) {
      enqueue({ type: 'answer', kind: clip(kind, 30), item: clip(item, 200), correct: correct ? 1 : 0, given: kind === 'write' ? clip(given, 60) : '' });
    }
    function card({ item, correct }) { enqueue({ type: 'card', kind: 'card', item: clip(item, 200), correct: correct ? 1 : 0 }); }

    function activity() { lastActivity = env.now(); }
    function tick(visible) {
      const now = env.now();
      if (!visible || now - lastActivity > ACTIVE_WINDOW_MS) return;
      if (pending > 0 && dayKey(new Date(pendingAt)) !== dayKey(new Date(now))) flushTime();
      pending++;
      pendingAt = now;
    }
    function flushTime() {
      if (pending <= 0) return;
      const secs = pending, at = pendingAt;
      pending = 0;
      const ev = enqueue({ type: 'time', seconds: secs }, at);
      if (ev && ev.topic !== 'menu') addDaySeconds(ev.learner, dayKey(new Date(at)), secs);
    }
    function addDaySeconds(name, day, secs) {
      const days = getJSON(KEYS.days(name), {});
      days[day] = (days[day] || 0) + secs;
      const oldest = dayKey(new Date(env.now() - 60 * DAY_MS));
      for (const k in days) if (k < oldest) delete days[k];
      setJSON(KEYS.days(name), days);
    }
    function localWeek(name, nowMs) {
      const days = getJSON(KEYS.days(name), {});
      const start = weekStartKey(new Date(nowMs == null ? env.now() : nowMs));
      const end = addDaysKey(start, 7);
      let secs = 0, count = 0;
      for (const k in days) {
        if (k >= start && k < end) { secs += days[k]; if (days[k] >= PRACTICE_DAY_SECONDS) count++; }
      }
      return { minutes: Math.floor(secs / 60), days: count };
    }

    // ---- sending ----
    function body(events) { const c = getConfig(); return JSON.stringify({ key: c.key, events }); }
    async function send() {
      const c = getConfig();
      if (!c || sending) return { ok: false, sent: 0 };
      const batch = outbox().slice(0, SEND_MAX);
      if (!batch.length) return { ok: true, sent: 0 };
      sending = true;
      try {
        const r = await env.fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body(batch) });
        const j = await r.json();
        if (!j || !j.ok) return { ok: false, sent: 0 };
        const done = new Set([].concat(j.saved || [], j.dup || [], j.bad || []));
        setJSON(KEYS.outbox, outbox().filter(e => !(e && done.has(e.id))));
        return { ok: true, sent: batch.length };
      } catch (e) {
        return { ok: false, sent: 0 };
      } finally {
        sending = false;
      }
    }
    function beacon() {
      const c = getConfig();
      const batch = outbox().slice(0, BEACON_MAX);
      if (!c || !batch.length) return;
      try { env.sendBeacon(c.url, body(batch)); } catch (e) { /* ignore */ }
    }
    async function getJSONFrom(params) {
      const c = getConfig();
      if (!c) return null;
      const q = Object.entries({ ...params, key: c.key }).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
      try {
        const r = await env.fetch(c.url + (c.url.includes('?') ? '&' : '?') + q);
        const j = await r.json();
        return j && j.ok ? j : null;
      } catch (e) { return null; }
    }
    async function fetchLearners() {
      const j = await getJSONFrom({ action: 'learners' });
      if (!j || !Array.isArray(j.learners)) return null;
      setSheetLearners(j.learners);
      return sheetLearners();
    }
    async function fetchWeek(name) {
      const j = await getJSONFrom({ action: 'week', learner: name });
      return j ? { minutes: Number(j.minutes) || 0, days: Number(j.days) || 0 } : null;
    }

    // ---- browser wiring ----
    let attached = false;
    function attach() {
      if (attached || typeof document === 'undefined') return;
      attached = true;
      const onAct = () => activity();
      ['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, onAct, { passive: true, capture: true }));
      setInterval(() => tick(document.visibilityState === 'visible'), 1000);
      setInterval(() => { flushTime(); if (outbox().length) send(); }, SEND_INTERVAL_MS);
      const away = () => { flushTime(); beacon(); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); });
      window.addEventListener('pagehide', away);
      send();
    }

    return {
      getConfig, applySetupHash,
      getProfiles, addLocalProfile, setSheetLearners, getCurrent, setCurrent,
      progressPrefix, vocabKey, ladderKey, migrateLegacy, unmappedLocalNames, mapLearner,
      setPage, session, answer, card, activity, tick, flushTime, outbox,
      send, beacon, localWeek, fetchLearners, fetchWeek, attach,
    };
  }

  // ---- local-time date keys ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekStartKey(d) { return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())); }
  function addDaysKey(key, n) {
    const [y, m, dd] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, dd + n));
  }

  // ---- browser instance ----
  if (typeof window !== 'undefined') {
    let storage;
    try { storage = window.localStorage; storage.getItem('x'); } catch (e) {
      const m = {}; storage = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, key: i => (i < Object.keys(m).length ? Object.keys(m)[i] : null), get length() { return Object.keys(m).length; } };
    }
    window.Tracker = createTracker({
      storage,
      now: () => Date.now(),
      fetch: (...a) => window.fetch(...a),
      sendBeacon: (url, body) => { try { return navigator.sendBeacon(url, body); } catch (e) { return false; } },
      uuid: () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2)),
    });
    // Any page may be the first one opened after an update, so migrate here, not only on the home page
    window.Tracker.migrateLegacy();
  }

  if (typeof module !== 'undefined') module.exports = { createTracker, weekStartKey, dayKey };
})();
