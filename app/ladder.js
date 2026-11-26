/**
 * ladder.js — the English learning path, A1 → C1 (pure logic, no DOM).
 *
 * Each ladder unit is an ordinary vocab topic in the manifest with
 * "track": "ladder", "ladder": {level, unit} and "itemCount". This module
 * works out the learner's place on the path from the manifest, her saved
 * position and her per-unit VocabStats:
 *   - which units are done / current / open / locked / new,
 *   - when a level is finished and the next one starts,
 *   - the adaptive placement quiz steps,
 *   - which practiced items go into review.
 * Spec: docs/superpowers/specs/2026-11-26-english-ladder-design.md
 *
 * Browser: window.Ladder. Node: module.exports (same object).
 */
(function () {
  const LADDER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const COMPLETE_SHARE = 0.8;
  const BLOCK_SIZE = 6;
  const START_LEVEL = 'A2';
  const POSITION_PREFIX = 'tirgul_ladder__';

  function needsWork(s) {
    if (typeof VocabStats !== 'undefined' && VocabStats && VocabStats.needsWork) return VocabStats.needsWork(s);
    return !!s && (s.last === 0 || s.w > s.r);
  }

  const levelIndex = id => LADDER_LEVELS.indexOf(id);

  function ladderLevels(manifest) {
    const list = (manifest && Array.isArray(manifest.ladderLevels)) ? manifest.ladderLevels : [];
    return LADDER_LEVELS.map(id => {
      const l = list.find(x => x && x.id === id) || {};
      return { id, name: l.name || id, description: l.description || '', plannedUnits: Number(l.plannedUnits) || 0 };
    });
  }

  function ladderUnits(manifest) {
    const topics = (manifest && Array.isArray(manifest.topics)) ? manifest.topics : [];
    return topics
      .filter(t => t && t.track === 'ladder' && t.ladder && levelIndex(t.ladder.level) >= 0)
      .map(t => ({ id: t.id, level: t.ladder.level, unit: Number(t.ladder.unit) || 0, name: t.name, icon: t.icon, itemCount: Number(t.itemCount) || 0 }))
      .sort((a, b) => (levelIndex(a.level) - levelIndex(b.level)) || (a.unit - b.unit));
  }

  /** stats = VocabStats.get(unitId): {en: {r, w, last, t}}. */
  function unitStatus(itemCount, stats) {
    const total = Number(itemCount) || 0;
    let seen = 0, known = 0;
    const s = stats || {};
    for (const k of Object.keys(s)) {
      if (!s[k] || typeof s[k] !== 'object') continue;
      seen++;
      if (!needsWork(s[k])) known++;
    }
    known = Math.min(known, total);
    return { seen, known, total, complete: total > 0 && known >= COMPLETE_SHARE * total };
  }

  function defaultPosition() {
    return { level: null, placedAt: null, opened: {}, seen: [] };
  }

  function cleanPosition(p) {
    const d = defaultPosition();
    if (!p || typeof p !== 'object') return d;
    if (levelIndex(p.level) >= 0) d.level = p.level;
    if (levelIndex(p.placedAt) >= 0) d.placedAt = p.placedAt;
    if (p.opened && typeof p.opened === 'object' && !Array.isArray(p.opened)) {
      for (const k of Object.keys(p.opened)) if (p.opened[k]) d.opened[k] = true;
    }
    if (Array.isArray(p.seen)) d.seen = p.seen.filter(x => typeof x === 'string');
    return d;
  }

  /**
   * The learner's whole path. Returns a NEW position (level advanced when the
   * current level is finished, every rendered unit added to `seen`); the
   * caller saves it.
   */
  function ladderState(manifest, position, statsOf) {
    const pos = cleanPosition(position);
    const units = ladderUnits(manifest);
    const levels = ladderLevels(manifest);
    const withStatus = units.map(u => Object.assign({}, u, { status: unitStatus(u.itemCount, statsOf(u.id) || {}) }));

    let current = pos.level || pos.placedAt || LADDER_LEVELS[0];
    const levelDone = id => {
      const us = withStatus.filter(u => u.level === id);
      return us.length > 0 && us.every(u => u.status.complete);
    };
    while (levelIndex(current) < LADDER_LEVELS.length - 1 && levelDone(current)) {
      current = LADDER_LEVELS[levelIndex(current) + 1];
    }
    const ci = levelIndex(current);
    const seenBefore = pos.seen.slice();
    const hadSeen = seenBefore.length > 0;

    let currentUnitId = null;
    const out = withStatus.map(u => {
      const li = levelIndex(u.level);
      let state;
      if (li < ci) {
        if (u.status.complete) state = 'done';
        else if (hadSeen && seenBefore.indexOf(u.id) < 0) state = 'new';
        else state = 'open';
      } else if (li === ci) {
        if (u.status.complete) state = 'done';
        else if (!currentUnitId) { state = 'current'; currentUnitId = u.id; }
        else state = pos.opened[u.id] ? 'open' : 'locked';
      } else {
        state = pos.opened[u.id] ? 'open' : 'locked';
      }
      return { id: u.id, level: u.level, unit: u.unit, name: u.name, icon: u.icon, itemCount: u.itemCount, state, status: u.status };
    });

    const seen = seenBefore.slice();
    for (const u of units) if (seen.indexOf(u.id) < 0) seen.push(u.id);
    const newPos = { level: current, placedAt: pos.placedAt, opened: Object.assign({}, pos.opened), seen };

    return {
      position: newPos,
      currentLevel: current,
      currentUnitId,
      newUnitIds: out.filter(u => u.state === 'new').map(u => u.id),
      levels: levels.map(l => {
        const built = units.filter(u => u.level === l.id).length;
        return { id: l.id, name: l.name, description: l.description, built, soon: Math.max(0, l.plannedUnits - built) };
      }),
      units: out,
    };
  }

  /** Units whose practiced items may be reviewed: done, or in a level below the current one. */
  function reviewUnitIds(state) {
    const ci = levelIndex(state.currentLevel);
    return state.units.filter(u => u.state === 'done' || levelIndex(u.level) < ci).map(u => u.id);
  }

  /**
   * Adaptive placement. history = blocks answered so far, in order:
   * [{level, correct, total}]. ≥5 of 6 → up, ≤3 → down, 4 → this level.
   */
  function placementStep(history) {
    const h = Array.isArray(history) ? history : [];
    if (!h.length) return { next: START_LEVEL };
    const up = b => b.correct * BLOCK_SIZE >= 5 * b.total;
    const down = b => b.correct * BLOCK_SIZE <= 3 * b.total;
    const tested = h.map(b => b.level);
    let highestPassed = -1;
    for (const b of h) if (up(b)) highestPassed = Math.max(highestPassed, levelIndex(b.level));
    const settle = () => ({ result: LADDER_LEVELS[Math.min(highestPassed + 1, LADDER_LEVELS.length - 1)] });

    const last = h[h.length - 1];
    const li = levelIndex(last.level);
    if (up(last)) {
      if (li >= LADDER_LEVELS.length - 1) return { result: LADDER_LEVELS[LADDER_LEVELS.length - 1] };
      const next = LADDER_LEVELS[li + 1];
      return tested.indexOf(next) >= 0 ? settle() : { next };
    }
    if (down(last)) {
      if (li <= 0) return settle();
      const prev = LADDER_LEVELS[li - 1];
      return tested.indexOf(prev) >= 0 ? settle() : { next: prev };
    }
    return { result: last.level };
  }

  /**
   * Review: only items that have a stats record. Needs-work first, then the
   * longest unseen (no `t` = oldest). units = [{id, items}].
   */
  function reviewPick(units, statsOf, count) {
    const n = count == null ? 20 : count;
    const pool = [];
    for (const u of (units || [])) {
      const st = statsOf(u.id) || {};
      for (const item of (u.items || [])) {
        const s = item && st[item.en];
        if (!s || typeof s !== 'object') continue;
        pool.push({ unitId: u.id, item, nw: needsWork(s) ? 0 : 1, t: typeof s.t === 'number' ? s.t : -Infinity, i: pool.length });
      }
    }
    pool.sort((a, b) => (a.nw - b.nw) || (a.t - b.t) || (a.i - b.i));
    return pool.slice(0, n).map(p => ({ unitId: p.unitId, item: p.item }));
  }

  const positionKey = name => POSITION_PREFIX + name;

  function loadPosition(storage, name) {
    try {
      const raw = storage.getItem(positionKey(name));
      return cleanPosition(raw ? JSON.parse(raw) : null);
    } catch (e) { return defaultPosition(); }
  }

  function savePosition(storage, name, pos) {
    try { storage.setItem(positionKey(name), JSON.stringify(cleanPosition(pos))); } catch (e) { /* never break practice */ }
  }

  const api = {
    LADDER_LEVELS, ladderLevels, ladderUnits, unitStatus, defaultPosition, ladderState, reviewUnitIds,
    placementStep, reviewPick, positionKey, loadPosition, savePosition,
  };
  if (typeof window !== 'undefined') window.Ladder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
