// Runs _tracking/Code.gs in Node with small in-memory mocks of the Apps Script services.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeSheet(name) {
  const rows = [];
  const width = () => rows.reduce((m, r) => Math.max(m, r.length), 0);
  const sheet = {
    _rows: rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => width(),
    appendRow: r => { rows.push(r.slice()); return sheet; },
    setFrozenRows: () => sheet,
    getDataRange: () => sheet.getRange(1, 1, Math.max(rows.length, 1), Math.max(width(), 1)),
    getRange(row, col, numRows = 1, numCols = 1) {
      if (typeof row === 'string') return { setNumberFormat: () => {} };   // A1 notation: format only
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = rows[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] === undefined ? '' : src[col - 1 + c]);
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          if (values.length !== numRows || values.some(v => v.length !== numCols)) throw new Error('setValues: size mismatch');
          values.forEach((v, r) => {
            const i = row - 1 + r;
            while (rows.length <= i) rows.push([]);
            v.forEach((x, c) => { rows[i][col - 1 + c] = x; });
          });
        },
        setNumberFormat: () => {},
        setFontWeight: () => {},
      };
    },
  };
  return sheet;
}

function formatDate(date, tz, fmt) {
  const d = new Date(date);
  if (fmt === 'yyyy-MM-dd') return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (fmt === 'u') {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
    return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(w) + 1);
  }
  throw new Error('formatDate: unsupported format ' + fmt);
}

function loadGas({ props = {}, learners = [] } = {}) {
  const sheets = new Map();
  let tz = 'America/New_York';
  const ss = {
    getSheetByName: n => sheets.get(n) || null,
    insertSheet: n => { const s = makeSheet(n); sheets.set(n, s); return s; },
    setSpreadsheetTimeZone: t => { tz = t; },
    getSpreadsheetTimeZone: () => tz,
  };
  const store = { ...props };
  const logs = [];
  const sandbox = {
    module: { exports: {} },
    console,
    Logger: { log: (...a) => { logs.push(a.join(' ')); } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
    }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }),
    },
    Utilities: {
      formatDate,
      getUuid: () => crypto.randomUUID(),
      Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: s => Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/MOCK/exec' }) },
  };
  const src = fs.readFileSync(path.join(__dirname, '..', '_tracking', 'Code.gs'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Code.gs' });
  const gas = sandbox.module.exports;
  gas.setup();
  const ls = sheets.get('learners');
  for (const l of learners) {
    ls.appendRow([l.name, l.grade, l.gender, l.minutesPerWeek ?? '', l.daysPerWeek ?? '', l.active === undefined ? true : l.active]);
  }
  return {
    gas,
    props: store,
    logs,
    sheet: n => (sheets.get(n) ? sheets.get(n)._rows : null),
    tz: () => tz,
  };
}

// Helpers that mimic how the web app is called.
function post(g, obj) { return JSON.parse(g.gas.doPost({ postData: { contents: JSON.stringify(obj) } }).getContent()); }
function get(g, params) { return JSON.parse(g.gas.doGet({ parameter: params }).getContent()); }

module.exports = { loadGas, post, get, formatDate };
