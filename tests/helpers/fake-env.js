// In-memory browser-like environment for tracker tests.
function memoryStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
}

function fakeEnv({ now = Date.parse('2026-11-23T08:00:00Z'), fetchImpl, storage } = {}) {
  let t = now;
  let n = 0;
  const env = {
    storage: memoryStorage(storage),
    now: () => t,
    advance: ms => { t += ms; },
    setNow: ms => { t = ms; },
    uuid: () => 'id-' + (++n),
    fetchCalls: [],
    beaconCalls: [],
    fetch: (url, opts) => {
      env.fetchCalls.push({ url, opts });
      return fetchImpl ? fetchImpl(url, opts) : Promise.reject(new Error('offline'));
    },
    sendBeacon: (url, body) => { env.beaconCalls.push({ url, body }); return true; },
  };
  return env;
}

module.exports = { fakeEnv, memoryStorage };
