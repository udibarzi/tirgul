// Browser test for practice tracking. Needs Playwright (not committed) and Chrome:
//   NODE_PATH=<dir with playwright in node_modules> node tests/e2e/tracking.e2e.js
// Starts tests/mock-server.js on port 5318 (static site + fake Apps Script, keys w / p).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('node:assert/strict');

const PORT = 5318;
const B = `http://localhost:${PORT}`;
const LEARNERS = [
  { name: 'נועה', grade: 5, gender: 'female', minutesPerWeek: 60, daysPerWeek: 3 },
  { name: 'מאיה', grade: 8, gender: 'female', minutesPerWeek: 90, daysPerWeek: 3 },
];
const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const DEVICE_LINK = `${B}/#setup=${b64({ url: `${B}/gas`, key: 'w' })}`;
const REPORT_LINK = `${B}/app/report.html#setup=${b64({ url: `${B}/gas`, key: 'p' })}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.argv[2];

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'mock-server.js'), String(PORT)], {
      env: { ...process.env, MOCK_LEARNERS: JSON.stringify(LEARNERS) }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout.on('data', d => { if (String(d).includes('mock server')) resolve(p); });
    p.on('exit', c => reject(new Error('mock server exited ' + c)));
  });
}
async function sheetEvents() {
  const today = new Date();
  const from = new Date(today.getTime() - 40 * 864e5).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 2 * 864e5).toISOString().slice(0, 10);
  const j = await fetch(`${B}/gas?action=events&key=p&from=${from}&to=${to}`).then(r => r.json());
  assert.equal(j.ok, true, 'events read');
  return j.events;
}
async function flush(page) {
  await page.evaluate(async () => { Tracker.flushTime(); await Tracker.send(); });
}

const results = [];
async function step(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL', name, '\n  ', e.message.split('\n').slice(0, 6).join('\n   ')); }
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await step('setup link + chooser', async () => {
    await page.goto(DEVICE_LINK);
    await page.waitForSelector('#learnerScreen:not(.hidden)', { timeout: 5000 });
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.ok(await page.evaluate(() => !!Tracker.getConfig()));
    const text = await page.textContent('#learnerScreen');
    assert.ok(text.includes('מי מתרגלת?'), 'title');
    assert.ok(text.includes('נועה') && text.includes('מאיה'), 'both names');
    await page.click('#learnerScreen .picker-card:has-text("נועה")');
    await page.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await page.textContent('#displayName'), 'נועה');
    assert.equal(await page.textContent('#gradeBadge'), 'כיתה ה׳');
    assert.ok(await page.isVisible('a.topic-card[href*="english-food-5"]'), 'grade 5 topics');
    await page.waitForFunction(() => document.getElementById('weekLine').textContent.includes('/ 60'));
    assert.equal(await page.isVisible('#weekLine'), true);
    assert.equal(await page.isVisible('#changeGradeLink'), false, 'grade comes from the sheet');
    await page.screenshot({ path: path.join(process.env.SHOTS || '.', 'E-topics.png') });
  });

  await step('events reach the sheet', async () => {
    await page.goto(`${B}/app/vocab.html?topic=english-food-5`);
    await page.click('text=כרטיסיות');
    for (const knew of [true, true, false]) {
      await page.click('#flashcard');
      await page.click(knew ? '#cardYes' : '#cardNo');
    }
    await page.goto(`${B}/app/quiz.html?topic=english-food-5&mode=write&n=2&level=words`);
    await page.waitForSelector('#answerInput');
    const right = await page.evaluate(() => state.questions[0].correct[0]);
    await page.fill('#answerInput', right);
    await page.click('#submitBtn');
    await page.click('#nextBtn');
    await page.fill('#answerInput', 'qqqq');
    await page.click('#submitBtn');
    // leave the page: beacon, then reload sends whatever is left
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.reload();
    await page.waitForSelector('#answerInput');
    await sleep(800);
    await flush(page);
    const ev = (await sheetEvents()).filter(e => e.learner === 'נועה');
    assert.equal(ev.filter(e => e.type === 'card').length, 3, 'cards');
    assert.equal(ev.filter(e => e.type === 'card' && e.correct === 1).length, 2, 'cards knew');
    const answers = ev.filter(e => e.type === 'answer');
    assert.equal(answers.length, 2, 'answers');
    assert.ok(answers.every(a => a.kind === 'write' && a.topic === 'english-food-5' && a.level === 'words' && a.mode === 'write'));
    assert.ok(answers.some(a => a.given === 'qqqq' && a.correct === 0), 'typed answer kept');
    assert.ok(ev.filter(e => e.type === 'session').length >= 2, 'sessions');
    const all = await sheetEvents();
    assert.equal(new Set(all.map(e => e.id)).size, all.length, 'ids unique');
    assert.equal(await page.evaluate(() => Tracker.outbox().filter(e => e.type !== 'time').length), 0, 'outbox emptied');
  });

  await step('two learners on one device', async () => {
    await page.goto(`${B}/`);
    await page.waitForSelector('#topicsScreen:not(.hidden)');
    const noaFood = await page.textContent('a.topic-card[href*="english-food-5"] .stats');
    assert.match(noaFood, /1\/2/);
    await page.click('#changeNameLink');
    await page.waitForSelector('#learnerScreen:not(.hidden)');
    await page.click('#learnerScreen .picker-card:has-text("מאיה")');
    await page.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await page.textContent('#gradeBadge'), 'כיתה ח׳');
    assert.ok(await page.textContent('#weekLine').then(t => t.includes('/ 90')));
    await page.goto(`${B}/app/quiz.html?topic=english-unit2-8&mode=en-he&n=1&level=words`);
    await page.waitForSelector('.option-btn');
    await page.evaluate(() => document.querySelectorAll('.option-btn')[state.questions[0].correct].click());
    await flush(page);
    const mine = (await sheetEvents()).filter(e => e.type === 'answer' && e.topic === 'english-unit2-8');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].learner, 'מאיה');
    await page.goto(`${B}/`);
    await page.click('#changeNameLink');
    await page.click('#learnerScreen .picker-card:has-text("נועה")');
    await page.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await page.textContent('a.topic-card[href*="english-food-5"] .stats'), noaFood, 'נועה progress unchanged');
  });

  await step('offline then online', async () => {
    await page.goto(`${B}/app/quiz.html?topic=english-food-5&mode=en-he&n=2&level=words`);
    await page.waitForSelector('.option-btn');
    await ctx.setOffline(true);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => document.querySelectorAll('.option-btn')[state.questions[state.currentQ].correct].click());
      if (i === 0) await page.click('#nextBtn');
    }
    assert.deepEqual(await page.evaluate(() => Tracker.send()), { ok: false, sent: 0 });
    await ctx.setOffline(false);
    await page.reload();
    await page.waitForSelector('.option-btn');
    await sleep(800);
    await flush(page);
    await flush(page);
    const ev = (await sheetEvents()).filter(e => e.type === 'answer' && e.mode === 'en-he' && e.topic === 'english-food-5');
    assert.equal(ev.length, 2);
  });

  await step('mapping existing history', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(`${B}/content/manifest.json`);
    await p2.evaluate(() => {
      localStorage.setItem('math_app_username', 'noa');
      localStorage.setItem('math_app_grade', '5');
      localStorage.setItem('math_app_gender', 'female');
      localStorage.setItem('math_app_english-food-5', JSON.stringify({ correct: 7, total: 9, streak: 0, bestStreak: 3, flagged: [] }));
    });
    await p2.goto(DEVICE_LINK);
    await p2.waitForSelector('#mapScreen:not(.hidden)');
    assert.ok((await p2.textContent('#mapScreen')).includes('noa'));
    await p2.screenshot({ path: path.join(process.env.SHOTS || '.', 'E-map.png') });
    await p2.click('#mapScreen .map-row button:has-text("נועה")');
    await p2.waitForSelector('#learnerScreen:not(.hidden)');
    await p2.screenshot({ path: path.join(process.env.SHOTS || '.', 'E-chooser.png') });
    await p2.click('#learnerScreen .picker-card:has-text("נועה")');
    await p2.waitForSelector('#topicsScreen:not(.hidden)');
    assert.match(await p2.textContent('a.topic-card[href*="english-food-5"] .stats'), /7\/9/);
    await ctx2.close();
  });

  await step('unconfigured device keeps today\'s flow', async () => {
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', e => errors.push(e.message));
    await p3.goto(`${B}/`);
    await p3.waitForSelector('#nameScreen:not(.hidden)');
    await p3.fill('#nameInput', 'דנה');
    await p3.click('#startBtn');
    await p3.click('#gradeGrid .picker-card:has-text("כיתה ה׳")');
    await p3.click('#genderScreen .picker-card:has-text("בת")');
    await p3.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await p3.textContent('#displayName'), 'דנה');
    assert.equal(await p3.isVisible('#weekLine'), false);
    await p3.click('#changeNameLink');
    await p3.waitForSelector('#learnerScreen:not(.hidden)');
    assert.ok((await p3.textContent('#learnerScreen')).includes('דנה'));
    await p3.click('#learnerScreen .picker-card:has-text("הוספה")');
    await p3.waitForSelector('#nameScreen:not(.hidden)');
    await p3.fill('#nameInput', 'רון');
    await p3.click('#startBtn');
    await p3.click('#gradeGrid .picker-card:has-text("כיתה ד׳")');
    await p3.click('#genderScreen .picker-card:has-text("בן")');
    await p3.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await p3.evaluate(() => localStorage.getItem('math_app_gender')), 'male');
    await p3.click('#changeNameLink');
    await p3.click('#learnerScreen .picker-card:has-text("דנה")');
    await p3.waitForSelector('#topicsScreen:not(.hidden)');
    assert.equal(await p3.textContent('#gradeBadge'), 'כיתה ה׳');
    assert.equal(await p3.evaluate(() => localStorage.getItem('math_app_gender')), 'female');
    // math quiz still works
    await p3.goto(`${B}/app/quiz.html?topic=fractions-4`);
    await p3.waitForSelector('#questionText');
    await ctx3.close();
  });

  if (!ONLY || 'report'.includes(ONLY) || ONLY.includes('report')) {
    await step('report shows both girls', async () => {
      const r = await page.goto(REPORT_LINK);
      assert.ok(r.ok(), 'report.html exists');
      await page.waitForSelector('.learner-card');
      assert.equal(await page.evaluate(() => location.hash), '');
      const text = await page.textContent('body');
      assert.ok(text.includes('נועה') && text.includes('מאיה'));
      const qs = await page.textContent('.learner-card[data-learner="נועה"] [data-stat="questions"]');
      assert.ok(Number(qs) >= 2, 'questions ' + qs);
      await page.screenshot({ path: path.join(process.env.SHOTS || '.', 'E-report.png'), fullPage: true });
      await page.click('.learner-card[data-learner="נועה"] .edit-goal-btn');
      await page.fill('.learner-card[data-learner="נועה"] input[name="minutes"]', '75');
      await page.click('.learner-card[data-learner="נועה"] .save-goal-btn');
      await page.waitForFunction(() => document.querySelector('.learner-card[data-learner="נועה"] .goal-line').textContent.includes('/ 75'));
      await page.reload();
      await page.waitForSelector('.learner-card');
      assert.ok((await page.textContent('.learner-card[data-learner="נועה"] .goal-line')).includes('/ 75'));
    });
  }

  assert.deepEqual(errors, [], 'page errors');
  await browser.close();
  server.kill();
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
