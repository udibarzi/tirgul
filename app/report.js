/**
 * Parent report: pure functions that turn raw tracking events into weekly numbers.
 * Day and week keys use the Asia/Jerusalem calendar, exactly like _tracking/Code.gs,
 * so the report and the girl's home-screen line agree.
 */
(function () {
  'use strict';

  const PRACTICE_DAY_SECONDS = 300;
  const TREND_WEEKS = 6;
  const MISSING_LOOKBACK_DAYS = 28;
  const MISSING_MAX = 10;
  const fmtCache = {};

  function dayKey(ts, tz) {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
    return f.format(new Date(ts));
  }
  function ymdUtc(k) { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(k, n) { return new Date(ymdUtc(k) + n * 86400000).toISOString().slice(0, 10); }
  function dow(k) { return new Date(ymdUtc(k)).getUTCDay(); }               // 0 = Sunday
  function weekOfDay(k) { return addDays(k, -dow(k)); }
  function weekStartOf(ts, tz) { return weekOfDay(dayKey(ts, tz)); }

  function emptyWeek() {
    return {
      minutes: 0, menuMinutes: 0, days: [], dayDots: [false, false, false, false, false, false, false],
      shortDays: [false, false, false, false, false, false, false],
      sessions: 0, questions: 0, cards: 0, correct: 0, wrong: 0,
      byTopic: [], byKind: [], trend: new Array(TREND_WEEKS).fill(0), lastTs: '',
    };
  }
  const pct = (r, t) => (t ? Math.round((r / t) * 100) : 0);

  /** Weekly numbers per learner for the week starting weekStart (a Sunday, yyyy-MM-dd). */
  function aggregate(events, { weekStart, tz = 'Asia/Jerusalem', topicNames = {} }) {
    const weekEnd = addDays(weekStart, 7);
    const trendStart = addDays(weekStart, -7 * (TREND_WEEKS - 1));
    const out = {};
    const acc = {};   // per learner scratch: seconds per day, per-topic, per-kind
    for (const e of events) {
      if (!e || !e.learner) continue;
      const day = dayKey(e.ts, tz);
      if (day < trendStart || day >= weekEnd) continue;
      const w = out[e.learner] || (out[e.learner] = emptyWeek());
      const a = acc[e.learner] || (acc[e.learner] = { daySecs: {}, menuSecs: 0, topics: {}, kinds: {} });
      if (!w.lastTs || e.ts > w.lastTs) w.lastTs = e.ts;
      const secs = Number(e.seconds) || 0;
      if (e.type === 'time' && e.topic !== 'menu') {
        const wi = Math.floor((ymdUtc(weekOfDay(day)) - ymdUtc(trendStart)) / (7 * 86400000));
        w.trend[wi] += secs;
      }
      if (day < weekStart) continue;

      const topic = e.topic || '';
      const t = a.topics[topic] || (a.topics[topic] = { secs: 0, items: 0, right: 0 });
      if (e.type === 'time') {
        if (topic === 'menu') { a.menuSecs += secs; continue; }
        a.daySecs[day] = (a.daySecs[day] || 0) + secs;
        t.secs += secs;
      } else if (e.type === 'session') {
        w.sessions++;
      } else if (e.type === 'answer' || e.type === 'card') {
        const ok = Number(e.correct) === 1;
        if (e.type === 'answer') w.questions++; else w.cards++;
        if (ok) w.correct++; else w.wrong++;
        t.items++; if (ok) t.right++;
        const kind = e.type === 'card' ? 'card' : (e.kind || '');
        const k = a.kinds[kind] || (a.kinds[kind] = { n: 0, right: 0 });
        k.n++; if (ok) k.right++;
      }
    }
    for (const name in out) {
      const w = out[name], a = acc[name];
      w.trend = w.trend.map(s => Math.floor(s / 60));
      let total = 0;
      for (const d of Object.keys(a.daySecs).sort()) {
        total += a.daySecs[d];
        const i = dow(d);
        if (a.daySecs[d] >= PRACTICE_DAY_SECONDS) { w.days.push(d); w.dayDots[i] = true; }
        else if (a.daySecs[d] > 0) w.shortDays[i] = true;
      }
      w.minutes = Math.floor(total / 60);
      w.menuMinutes = Math.floor(a.menuSecs / 60);
      w.byTopic = Object.entries(a.topics)
        .filter(([id, t]) => id !== 'menu' && (t.secs || t.items))
        .map(([id, t]) => ({ topic: id, name: topicNames[id] || id, minutes: Math.floor(t.secs / 60), questions: t.items, pct: pct(t.right, t.items) }))
        .sort((x, y) => y.minutes - x.minutes || y.questions - x.questions);
      w.byKind = Object.entries(a.kinds)
        .map(([kind, k]) => ({ kind, questions: k.n, pct: pct(k.right, k.n) }))
        .sort((x, y) => y.questions - x.questions);
    }
    return out;
  }

  /** Items she keeps getting wrong in the last 28 days, unless her last 2 tries were right. */
  function keepsMissing(events, learner, nowMs) {
    const since = new Date(nowMs - MISSING_LOOKBACK_DAYS * 86400000).toISOString();
    const items = {};
    events
      .filter(e => e && e.learner === learner && (e.type === 'answer' || e.type === 'card') && e.item && e.ts >= since)
      .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
      .forEach(e => {
        const it = items[e.item] || (items[e.item] = { item: e.item, wrong: 0, lastGiven: '', recent: [] });
        const ok = Number(e.correct) === 1;
        if (!ok) { it.wrong++; if (e.given) it.lastGiven = String(e.given); }
        it.recent.push(ok);
      });
    return Object.values(items)
      .filter(it => it.wrong > 0 && !(it.recent.length >= 2 && it.recent.slice(-2).every(Boolean)))
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, MISSING_MAX)
      .map(({ item, wrong, lastGiven }) => ({ item, wrong, lastGiven }));
  }

  function parseSetupHash(hash) {
    const m = /^#?setup=([A-Za-z0-9_-]+={0,2})$/.exec(String(hash || ''));
    if (!m) return null;
    try {
      let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const c = JSON.parse(decodeURIComponent(escape(atob(b))));
      return c && typeof c.url === 'string' && /^https?:\/\//.test(c.url) && typeof c.key === 'string' && c.key ? { url: c.url, key: c.key } : null;
    } catch (e) { return null; }
  }

  const api = { aggregate, keepsMissing, parseSetupHash, weekStartOf, addDays, dayKey, emptyWeek, TREND_WEEKS };
  if (typeof window !== 'undefined') window.Report = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
