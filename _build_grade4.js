#!/usr/bin/env node
/**
 * Generate 4th grade content from math-app.html generators.
 * Reimplements the question generators in Node.js and outputs static JSON files.
 *
 * Topics:
 *   - content/fractions-4.json     (fractions: concept, compare, add/sub, mixed, multiply)
 *   - content/multiply-divide-4.json (mul/div: 10/100/1000, tens, order, two-digit, relation, change)
 *   - content/geometry-4.json      (geometry: units, perimeter, area, combined)
 */
const fs = require('fs');
const path = require('path');

// ===== HELPERS =====
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function simplifyFrac(n, d) { if (n === 0) return [0, d]; const g = gcd(Math.abs(n), Math.abs(d)); return [n / g, d / g]; }
function fracToMixed(n, d) { return [Math.floor(n / d), n % d, d]; }
function fracStr(n, d) { return `${n}/${d}`; }
function mixedStr(w, n, d) { if (n === 0) return `${w}`; if (w === 0) return fracStr(n, d); return `${w} ${n}/${d}`; }

// ===== FRACTION GENERATORS =====
function genFracConcept() {
  const den = pick([2, 3, 4, 5, 6, 8, 10]), num = randInt(1, den - 1);
  const total = den * randInt(2, 6), ans = total * num / den;
  const items = pick(['תלמידים', 'ילדים', 'כדורים', 'ספרים', 'ממתקים', 'פרחים']);
  return {
    text: `בקבוצה ${total} ${items}. ${fracStr(num, den)} מהם הם בנות. כמה בנות?`,
    type: 'free-input',
    correct: [String(ans)],
    explanation: `${total} \u00F7 ${den} \u00D7 ${num} = ${ans}`,
  };
}

function genFracCompare() {
  const den = pick([3, 4, 5, 6, 8, 10]), n1 = randInt(1, den - 1), n2 = randInt(1, den - 1);
  if (n1 === n2) return genFracCompare();
  const sym = n1 > n2 ? '>' : '<';
  const bigger = Math.max(n1, n2), smaller = Math.min(n1, n2);
  return {
    text: `השלימו את הסימן: ${fracStr(n1, den)} ___ ${fracStr(n2, den)} — כתבו > או < או =`,
    type: 'free-input',
    correct: [sym],
    explanation: `${n1}/${den} ${sym} ${n2}/${den} כי ${bigger} חלקים > ${smaller} חלקים`,
  };
}

function genFracAddSub() {
  const op = pick(['+', '-']), den = pick([2, 3, 4, 5, 6, 8, 10]);
  let n1 = randInt(1, den - 1), n2 = randInt(1, den - 1);
  if (op === '-' && n1 <= n2) [n1, n2] = [Math.max(n1, n2), Math.min(n1, n2)];
  if (op === '-' && n1 === n2) return genFracAddSub();
  const ansNum = op === '+' ? n1 + n2 : n1 - n2;
  const [sn, sd] = simplifyFrac(ansNum, den);

  if (sn < sd) {
    return {
      text: `${fracStr(n1, den)} ${op} ${fracStr(n2, den)} = ?`,
      type: 'free-input',
      correct: [`${sn}/${sd}`],
      explanation: `${n1} ${op} ${n2} = ${ansNum}. תשובה: ${sn}/${sd}`,
    };
  }
  const [w, r, d] = fracToMixed(sn, sd);
  const [sr, srd] = simplifyFrac(r, d);
  const ansStr = sr === 0 ? `${w}` : `${w} ${sr}/${srd}`;
  return {
    text: `${fracStr(n1, den)} ${op} ${fracStr(n2, den)} = ?`,
    type: 'free-input',
    correct: [ansStr, sr === 0 ? `${w}` : `${w} ${sr}/${srd}`],
    explanation: `${n1} ${op} ${n2} = ${ansNum}/${den} = ${ansStr}`,
  };
}

function genFracMixed() {
  const den = pick([2, 3, 4, 5, 6, 8]), op = pick(['+', '-']);
  const w1 = randInt(1, 5), n1 = randInt(1, den - 1);
  const w2 = randInt(1, op === '-' ? Math.max(1, w1 - 1) : 4), n2 = randInt(1, den - 1);
  const t1 = w1 * den + n1, t2 = w2 * den + n2;
  if (op === '-' && t1 <= t2) return genFracMixed();
  const res = op === '+' ? t1 + t2 : t1 - t2;
  const [w, r, d] = fracToMixed(res, den);
  const [sr, sd] = simplifyFrac(r, d);
  const ansStr = sr === 0 ? `${w}` : `${w} ${sr}/${sd}`;
  return {
    text: `${mixedStr(w1, n1, den)} ${op} ${mixedStr(w2, n2, den)} = ?`,
    type: 'free-input',
    correct: [ansStr],
    explanation: `${t1}/${den} ${op} ${t2}/${den} = ${res}/${den} = ${ansStr}`,
  };
}

function genFracMultiply() {
  const den = pick([2, 3, 4, 5, 6, 8]), num = randInt(1, den - 1), mult = randInt(2, 6);
  const ansNum = num * mult;
  const [sn, sd] = simplifyFrac(ansNum, den);
  const text = `${fracStr(num, den)} \u00D7 ${mult} = ?`;

  if (sn < sd) {
    return { text, type: 'free-input', correct: [`${sn}/${sd}`], explanation: `${num}/${den} \u00D7 ${mult} = ${ansNum}/${den} = ${sn}/${sd}` };
  }
  const [w, r, d] = fracToMixed(sn, sd);
  const [sr, srd] = simplifyFrac(r, d);
  const ansStr = sr === 0 ? `${w}` : `${w} ${sr}/${srd}`;
  return { text, type: 'free-input', correct: [ansStr, String(sn / sd)], explanation: `${num}/${den} \u00D7 ${mult} = ${ansNum}/${den} = ${ansStr}` };
}

// ===== MULTIPLY/DIVIDE GENERATORS =====
function genMul10() {
  const f = pick([10, 100, 1000]), isDiv = pick([true, false]);
  if (isDiv) {
    const b = randInt(1, 50) * f, a = b / f;
    return { text: `${b.toLocaleString('en-US')} \u00F7 ${f.toLocaleString('en-US')} = ?`, type: 'free-input', correct: [String(a)], explanation: `${b.toLocaleString('en-US')} \u00F7 ${f.toLocaleString('en-US')} = ${a}` };
  }
  const b = randInt(1, 999), a = b * f;
  return { text: `${b} \u00D7 ${f.toLocaleString('en-US')} = ?`, type: 'free-input', correct: [String(a), a.toLocaleString('en-US')], explanation: `${b} \u00D7 ${f.toLocaleString('en-US')} = ${a.toLocaleString('en-US')}` };
}

function genMulTens() {
  const a = pick([20, 30, 40, 50, 60, 70, 80, 90]), b = pick([20, 30, 40, 50, 60, 70, 80, 90, 200, 300, 400, 500]);
  const ans = a * b;
  return { text: `${a} \u00D7 ${b} = ?`, type: 'free-input', correct: [String(ans), ans.toLocaleString('en-US')], explanation: `${a} \u00D7 ${b} = ${ans.toLocaleString('en-US')}` };
}

function genMulOrder() {
  const tpls = [
    () => { const a = randInt(2, 9), b = randInt(2, 9), c = randInt(1, 20); return { expr: `${c} + ${a} \u00D7 ${b}`, ans: c + a * b, exp: `כפל קודם: ${a}\u00D7${b}=${a * b}, ואז ${c}+${a * b}=${c + a * b}` }; },
    () => { const a = randInt(2, 9), b = randInt(2, 9), c = randInt(1, 9); return { expr: `${a} \u00D7 ${b} - ${c}`, ans: a * b - c, exp: `כפל קודם: ${a}\u00D7${b}=${a * b}, ואז ${a * b}-${c}=${a * b - c}` }; },
    () => { const a = randInt(2, 10), b = randInt(2, 8), c = randInt(2, 5); return { expr: `(${a} + ${b}) \u00D7 ${c}`, ans: (a + b) * c, exp: `סוגריים: ${a}+${b}=${a + b}, ואז ${a + b}\u00D7${c}=${(a + b) * c}` }; },
    () => { const a = randInt(10, 30), b = randInt(2, 8), c = randInt(2, 5); const r = a - b * c; if (r < 0) return null; return { expr: `${a} - ${b} \u00D7 ${c}`, ans: r, exp: `כפל קודם: ${b}\u00D7${c}=${b * c}, ואז ${a}-${b * c}=${r}` }; },
    () => { const a = randInt(2, 6), b = randInt(2, 6), c = randInt(2, 6), d = randInt(1, 10); return { expr: `${a} \u00D7 ${b} + ${c} \u00D7 ${d}`, ans: a * b + c * d, exp: `${a}\u00D7${b}=${a * b}, ${c}\u00D7${d}=${c * d}. סה"כ ${a * b + c * d}` }; },
  ];
  let t = null; while (!t) t = pick(tpls)();
  return { text: `חשבו: ${t.expr} = ?`, type: 'free-input', correct: [String(t.ans)], explanation: t.exp };
}

function genMulTwoDigit() {
  const a = randInt(11, 49), b = randInt(11, 49);
  return { text: `${a} \u00D7 ${b} = ?`, type: 'free-input', correct: [String(a * b), (a * b).toLocaleString('en-US')], explanation: `${a} \u00D7 ${b} = ${a * b}` };
}

function genMulRelation() {
  const a = randInt(3, 12), b = randInt(3, 12), p = a * b, type = randInt(0, 2);
  if (type === 0) return { text: `אם ${a} \u00D7 ${b} = ${p}, מה זה ${p} \u00F7 ${a}?`, type: 'free-input', correct: [String(b)], explanation: `${p} \u00F7 ${a} = ${b}` };
  if (type === 1) return { text: `אם ${p} \u00F7 ${b} = ${a}, מה זה ${a} \u00D7 ${b}?`, type: 'free-input', correct: [String(p)], explanation: `${a} \u00D7 ${b} = ${p}` };
  return { text: `${a} \u00D7 ___ = ${p}. מה המספר החסר?`, type: 'free-input', correct: [String(b)], explanation: `${p} \u00F7 ${a} = ${b}` };
}

function genMulChange() {
  const a = randInt(3, 12), b = randInt(3, 12), p = a * b, type = randInt(0, 2);
  if (type === 0) { const f = pick([2, 3]), np = a * f * b; return { text: `אם ${a} \u00D7 ${b} = ${p}, מה זה ${a * f} \u00D7 ${b}?`, type: 'free-input', correct: [String(np)], explanation: `הגורם הוכפל ב-${f} \u2192 ${p} \u00D7 ${f} = ${np}` }; }
  if (type === 1) { if (a % 2 !== 0) return genMulChange(); const na = a / 2, np = na * b; return { text: `אם ${a} \u00D7 ${b} = ${p}, מה זה ${na} \u00D7 ${b}?`, type: 'free-input', correct: [String(np)], explanation: `הגורם חולק ב-2 \u2192 ${p} \u00F7 2 = ${np}` }; }
  const f1 = pick([2, 3]), f2 = pick([2, 3]), np = a * f1 * b * f2;
  return { text: `אם ${a} \u00D7 ${b} = ${p}, מה זה ${a * f1} \u00D7 ${b * f2}?`, type: 'free-input', correct: [String(np)], explanation: `\u00D7${f1} ו-\u00D7${f2} \u2192 ${p} \u00D7 ${f1 * f2} = ${np}` };
}

// ===== GEOMETRY GENERATORS =====
function genGeoUnits() {
  const type = randInt(0, 2);
  if (type === 0) { const cm = randInt(100, 800), m = Math.floor(cm / 100), r = cm % 100; return { text: `${cm} ס"מ = כמה מטרים שלמים?`, type: 'free-input', correct: [String(m)], explanation: `${cm} \u00F7 100 = ${m} שארית ${r}. כלומר ${m} מ' ו-${r} ס"מ` }; }
  if (type === 1) { const m = randInt(1, 9), cm = randInt(0, 99), a = m * 100 + cm; return { text: `${m} מ' ו-${cm} ס"מ = ? ס"מ`, type: 'free-input', correct: [String(a)], explanation: `${m}\u00D7100 + ${cm} = ${a} ס"מ` }; }
  const cm = randInt(1, 30), mm = cm * 10;
  return { text: `${cm} ס"מ = ? מ"מ`, type: 'free-input', correct: [String(mm)], explanation: `${cm} \u00D7 10 = ${mm} מ"מ` };
}

function genGeoPerimeter() {
  if (randInt(0, 1) === 0) {
    const w = randInt(3, 20), h = randInt(3, 15), p = 2 * (w + h);
    return { text: `מה ההיקף של מלבן שאורכו ${w} ס"מ ורוחבו ${h} ס"מ?`, type: 'free-input', correct: [String(p)], explanation: `2 \u00D7 (${w}+${h}) = 2 \u00D7 ${w + h} = ${p} ס"מ` };
  }
  const n = pick([3, 5, 6]), names = { 3: 'משולש', 5: 'מחומש', 6: 'משושה' };
  let sum = 0; const sides = [];
  for (let i = 0; i < n; i++) { const l = randInt(3, 12); sides.push(l); sum += l; }
  return { text: `מה ההיקף של ${names[n]} שאורכי צלעותיו הם: ${sides.join(', ')} ס"מ?`, type: 'free-input', correct: [String(sum)], explanation: `${sides.join('+')} = ${sum} ס"מ` };
}

function genGeoArea() {
  const w = randInt(3, 20), h = randInt(3, 15), a = w * h;
  return { text: `מה השטח של מלבן שאורכו ${w} ס"מ ורוחבו ${h} ס"מ?`, type: 'free-input', correct: [String(a)], explanation: `${w} \u00D7 ${h} = ${a} ס"מ\u00B2` };
}

function genGeoCombined() {
  const type = randInt(0, 3);
  if (type === 0) {
    const w = randInt(4, 15), h = randInt(3, 12), p = 2 * (w + h);
    return { text: `ההיקף של מלבן הוא ${p} ס"מ ואורכו ${w} ס"מ. מה רוחבו?`, type: 'free-input', correct: [String(h)], explanation: `${p} = 2\u00D7(${w}+רוחב) \u2192 ${p / 2}=${w}+רוחב \u2192 רוחב=${h}` };
  }
  if (type === 1) {
    const w = randInt(5, 20), h = randInt(3, 15);
    return { text: `גינה מלבנית ${w} מ' על ${h} מ'. כמה מטרים של גדר צריך?`, type: 'free-input', correct: [String(2 * (w + h))], explanation: `היקף = 2\u00D7(${w}+${h}) = ${2 * (w + h)} מ'` };
  }
  if (type === 2) {
    const w = randInt(5, 20), h = randInt(3, 15);
    return { text: `חדר ${w} מ' על ${h} מ'. מה שטח הרצפה?`, type: 'free-input', correct: [String(w * h)], explanation: `שטח = ${w}\u00D7${h} = ${w * h} מ"ר` };
  }
  const side = randInt(3, 15), ask = pick(['area', 'peri']), ans = ask === 'area' ? side * side : 4 * side;
  return { text: ask === 'area' ? `שטח ריבוע שצלעו ${side} ס"מ?` : `היקף ריבוע שצלעו ${side} ס"מ?`, type: 'free-input', correct: [String(ans)], explanation: ask === 'area' ? `${side}\u00D7${side}=${ans} ס"מ\u00B2` : `4\u00D7${side}=${ans} ס"מ` };
}

// ===== GENERATE UNIQUE QUESTIONS =====
function generateUnique(gen, count, maxAttempts = 500) {
  const seen = new Set();
  const qs = [];
  let attempts = 0;
  while (qs.length < count && attempts < maxAttempts) {
    attempts++;
    try {
      const q = gen();
      if (!q) continue;
      const key = q.text + '|' + q.correct.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      qs.push(q);
    } catch (e) {
      // Generator may recurse too deep or fail — just retry
    }
  }
  return qs;
}

// ===== BUILD TOPICS =====
const contentDir = path.join(__dirname, 'content');

const topics = [
  {
    id: 'fractions-4',
    name: 'שברים פשוטים',
    icon: '🍕',
    description: 'מושג השבר, השוואה, חיבור וחיסור, מספרים מעורבים, כפל בשלם',
    generators: [
      { gen: genFracConcept, count: 8 },
      { gen: genFracCompare, count: 8 },
      { gen: genFracAddSub, count: 10 },
      { gen: genFracMixed, count: 8 },
      { gen: genFracMultiply, count: 8 },
    ],
  },
  {
    id: 'multiply-divide-4',
    name: 'כפל וחילוק',
    icon: '✖️',
    description: 'כפל ב-10/100/1000, עשרות שלמות, סדר פעולות, כפל דו-ספרתי',
    generators: [
      { gen: genMul10, count: 7 },
      { gen: genMulTens, count: 7 },
      { gen: genMulOrder, count: 8 },
      { gen: genMulTwoDigit, count: 7 },
      { gen: genMulRelation, count: 7 },
      { gen: genMulChange, count: 6 },
    ],
  },
  {
    id: 'geometry-4',
    name: 'גיאומטריה',
    icon: '📐',
    description: 'יחידות מידה, היקף ושטח של מלבנים ומצולעים',
    generators: [
      { gen: genGeoUnits, count: 10 },
      { gen: genGeoPerimeter, count: 10 },
      { gen: genGeoArea, count: 10 },
      { gen: genGeoCombined, count: 12 },
    ],
  },
];

for (const topic of topics) {
  let allQuestions = [];
  for (const { gen, count } of topic.generators) {
    const qs = generateUnique(gen, count);
    allQuestions = allQuestions.concat(qs);
  }

  const json = {
    id: topic.id,
    name: topic.name,
    icon: topic.icon,
    description: topic.description,
    questionsPerSession: 15,
    shuffle: true,
    questions: allQuestions,
  };

  const outPath = path.join(contentDir, `${topic.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`${topic.id}: ${allQuestions.length} questions → ${outPath}`);
}

console.log('Done!');
