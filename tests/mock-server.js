// Local stand-in for GitHub Pages + the Apps Script web app, for browser tests.
// Usage: MOCK_LEARNERS='[...]' node tests/mock-server.js 5318
// Static files come from the repo root; /gas routes into Code.gs running on mocks.
// Keys are fixed: write key "w", parent key "p".
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./gas-mocks.js');

const port = Number(process.argv[2]) || 5318;
const root = path.join(__dirname, '..');
const learners = process.env.MOCK_LEARNERS ? JSON.parse(process.env.MOCK_LEARNERS) : [];
const g = loadGas({ props: { WRITE_KEY: 'w', PARENT_KEY: 'p' }, learners });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function sendJSON(res, out) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(out.getContent());
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/gas') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => sendJSON(res, g.gas.doPost({ postData: { contents: body } })));
    } else {
      sendJSON(res, g.gas.doGet({ parameter: Object.fromEntries(u.searchParams) }));
    }
    return;
  }
  let file = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('mock server on http://localhost:' + port));
