#!/usr/bin/env node
/**
 * Generate coordinate geometry questions for 7th grade
 * from worksheet.html (מערכת צירים במישור).
 *
 * Produces: content/coordinate-geometry-7.json
 */
const fs = require('fs');
const path = require('path');

// ============================================================
// SVG Coordinate System Generator (Node.js port)
// ============================================================

function createCoordSVG(config) {
  const {
    xMin, xMax, yMin, yMax,
    points = [],
    shapes = [],
    lines = [],
    width = 320, height = 320
  } = config;

  const margin = 32;
  const w = width - 2 * margin;
  const h = height - 2 * margin;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  function sx(x) { return margin + (x - xMin) / xRange * w; }
  function sy(y) { return margin + (yMax - y) / yRange * h; }

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;">`;

  // Grid
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
    const px = sx(x);
    svg += `<line x1="${px}" y1="${margin}" x2="${px}" y2="${height - margin}" stroke="#d4dce4" stroke-width="0.5"/>`;
  }
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
    const py = sy(y);
    svg += `<line x1="${margin}" y1="${py}" x2="${width - margin}" y2="${py}" stroke="#d4dce4" stroke-width="0.5"/>`;
  }

  // Axes
  const ox = sx(0), oy = sy(0);
  if (xMin <= 0 && xMax >= 0) {
    svg += `<line x1="${ox}" y1="${margin - 5}" x2="${ox}" y2="${height - margin + 5}" stroke="#2c2c2c" stroke-width="1.5"/>`;
    svg += `<polygon points="${ox - 4},${margin + 2} ${ox + 4},${margin + 2} ${ox},${margin - 8}" fill="#2c2c2c"/>`;
    svg += `<text x="${ox + 8}" y="${margin - 2}" font-family="sans-serif" font-size="12" font-weight="600" fill="#2d6a9f">y</text>`;
  }
  if (yMin <= 0 && yMax >= 0) {
    svg += `<line x1="${margin - 5}" y1="${oy}" x2="${width - margin + 5}" y2="${oy}" stroke="#2c2c2c" stroke-width="1.5"/>`;
    svg += `<polygon points="${width - margin - 2},${oy - 4} ${width - margin - 2},${oy + 4} ${width - margin + 8},${oy}" fill="#2c2c2c"/>`;
    svg += `<text x="${width - margin + 10}" y="${oy + 4}" font-family="sans-serif" font-size="12" font-weight="600" fill="#2d6a9f">x</text>`;
  }

  // Axis numbers
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
    if (x === 0) continue;
    const px = sx(x);
    if (yMin <= 0 && yMax >= 0) {
      svg += `<line x1="${px}" y1="${oy - 3}" x2="${px}" y2="${oy + 3}" stroke="#2c2c2c" stroke-width="1"/>`;
      svg += `<text x="${px}" y="${oy + 14}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#6b7280">${x}</text>`;
    }
  }
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
    if (y === 0) continue;
    const py = sy(y);
    if (xMin <= 0 && xMax >= 0) {
      svg += `<line x1="${ox - 3}" y1="${py}" x2="${ox + 3}" y2="${py}" stroke="#2c2c2c" stroke-width="1"/>`;
      svg += `<text x="${ox - 8}" y="${py + 4}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#6b7280">${y}</text>`;
    }
  }

  // Shapes
  shapes.forEach(shape => {
    const pts = shape.points.map(p => `${sx(p[0])},${sy(p[1])}`).join(' ');
    const dash = shape.dash ? ' stroke-dasharray="4,2"' : '';
    svg += `<polygon points="${pts}" fill="rgba(45,106,159,0.08)" stroke="#2d6a9f" stroke-width="1"${dash}/>`;
  });

  // Lines
  lines.forEach(line => {
    svg += `<line x1="${sx(line[0][0])}" y1="${sy(line[0][1])}" x2="${sx(line[1][0])}" y2="${sy(line[1][1])}" stroke="#2d6a9f" stroke-width="1.5" stroke-dasharray="4,2"/>`;
  });

  // Points
  points.forEach(p => {
    const px = sx(p.x), py = sy(p.y);
    svg += `<circle cx="${px}" cy="${py}" r="4" fill="#e8734a"/>`;
    const dx = p.labelDx || 6;
    const dy = p.labelDy || -8;
    svg += `<text x="${px + dx}" y="${py + dy}" font-family="sans-serif" font-size="11" font-weight="600" fill="#2c2c2c">${p.label}</text>`;
  });

  svg += '</svg>';
  return svg;
}

// ============================================================
// Helper: coordinate answer variants
// ============================================================

// Accept (x,y) with optional parens, spaces, and both minus types
function coordAnswers(x, y) {
  const xs = [String(x)];
  const ys = [String(y)];
  if (x < 0) xs.push(String(x).replace('-', '\u2212'));
  if (y < 0) ys.push(String(y).replace('-', '\u2212'));

  const results = [];
  for (const xv of xs) {
    for (const yv of ys) {
      results.push(`(${xv},${yv})`);
      results.push(`(${xv}, ${yv})`);
      results.push(`${xv},${yv}`);
      results.push(`${xv}, ${yv}`);
    }
  }
  return results;
}

function numAnswers(n) {
  const s = String(n);
  const results = [s];
  if (s.includes('-')) results.push(s.replace(/-/g, '\u2212'));
  return results;
}

// ============================================================
// Questions
// ============================================================

const questions = [];

// ---- Q1: 6 points, read coordinates + triangle areas ----
const diag1 = createCoordSVG({
  xMin: -6, xMax: 7, yMin: -1, yMax: 6,
  points: [
    { x: 2, y: 5, label: 'A' }, { x: 6, y: 5, label: 'B' }, { x: 4, y: 1, label: 'C' },
    { x: -3, y: 4, label: 'D' }, { x: -5, y: 1, label: 'E' }, { x: -1, y: 1, label: 'F' }
  ]
});

questions.push({
  text: 'מהם שיעורי הנקודה A בסרטוט?',
  type: 'free-input',
  correct: coordAnswers(2, 5),
  visual: { type: 'svg-geometry', svg: diag1 },
  explanation: 'A(2,5)'
});
questions.push({
  text: 'מהם שיעורי הנקודה D בסרטוט?',
  type: 'free-input',
  correct: coordAnswers(-3, 4),
  visual: { type: 'svg-geometry', svg: diag1 },
  explanation: 'D(\u22123,4)'
});
questions.push({
  text: 'חשבו את שטח המשולש ABC בסרטוט — בסיס AB = 4, גובה = 4',
  type: 'free-input',
  correct: ['8'],
  visual: { type: 'svg-geometry', svg: diag1 },
  explanation: 'שטח = \u00BD \u00D7 4 \u00D7 4 = 8 יח\u05F4ש'
});
questions.push({
  text: 'חשבו את שטח המשולש DEF בסרטוט — בסיס EF = 4, גובה = 3',
  type: 'free-input',
  correct: ['6'],
  visual: { type: 'svg-geometry', svg: diag1 },
  explanation: 'שטח = \u00BD \u00D7 4 \u00D7 3 = 6 יח\u05F4ש'
});

// ---- Q2: Rectangle ABCD ----
const diag2 = createCoordSVG({
  xMin: -1, xMax: 9, yMin: 0, yMax: 8,
  points: [
    { x: 1, y: 6, label: 'A' }, { x: 7, y: 6, label: 'B' },
    { x: 7, y: 2, label: 'C' }, { x: 1, y: 2, label: 'D' }
  ],
  shapes: [{ points: [[1, 6], [7, 6], [7, 2], [1, 2]] }]
});

questions.push({
  text: 'מהו אורך הצלע AB במלבן בסרטוט?',
  type: 'free-input',
  correct: ['6'],
  visual: { type: 'svg-geometry', svg: diag2 },
  explanation: 'AB = 7 \u2212 1 = 6'
});
questions.push({
  text: 'מהו שטח המלבן ABCD בסרטוט?',
  type: 'free-input',
  correct: ['24'],
  visual: { type: 'svg-geometry', svg: diag2 },
  explanation: 'AB = 6, BC = 4, שטח = 6 \u00D7 4 = 24'
});
questions.push({
  text: 'מהו היקף המלבן ABCD בסרטוט?',
  type: 'free-input',
  correct: ['20'],
  visual: { type: 'svg-geometry', svg: diag2 },
  explanation: 'היקף = 2(6 + 4) = 20'
});
questions.push({
  text: 'M נמצאת באמצע הצלע AB — A(1,6) ו-B(7,6). מהם שיעורי M?',
  type: 'free-input',
  correct: coordAnswers(4, 6),
  visual: { type: 'svg-geometry', svg: diag2 },
  explanation: 'M = ((1+7)/2, 6) = (4,6)'
});
questions.push({
  text: 'M(4,6) נמצאת באמצע AB. מהו שטח המשולש MDC כאשר D(1,2) ו-C(7,2)?',
  type: 'free-input',
  correct: ['12'],
  visual: { type: 'svg-geometry', svg: diag2 },
  explanation: 'בסיס DC = 6, גובה = 4. שטח = \u00BD \u00D7 6 \u00D7 4 = 12'
});

// ---- Q3: Square crossing Q1/Q2 ----
const diag3 = createCoordSVG({
  xMin: -5, xMax: 4, yMin: -2, yMax: 7,
  points: [
    { x: -3, y: 5, label: 'A' }, { x: 2, y: 5, label: 'B' },
    { x: 2, y: 0, label: 'C' }, { x: -3, y: 0, label: 'D' }
  ],
  shapes: [{ points: [[-3, 5], [2, 5], [2, 0], [-3, 0]] }]
});

questions.push({
  text: 'מהו שטח הריבוע ABCD בסרטוט?',
  type: 'free-input',
  correct: ['25'],
  visual: { type: 'svg-geometry', svg: diag3 },
  explanation: 'צלע = 5, שטח = 25'
});
questions.push({
  text: 'הריבוע ABCD: A(\u22123,5) B(2,5) C(2,0) D(\u22123,0). הנקודה P(\u22121,3) נמצאת:',
  type: 'multiple-choice',
  options: ['בתוך הריבוע', 'מחוץ לריבוע', 'על אחת מצלעות הריבוע'],
  correct: 0,
  visual: { type: 'svg-geometry', svg: diag3 },
  explanation: 'x = \u22121 בין \u22123 ל-2, y = 3 בין 0 ל-5 — בתוך הריבוע'
});

// ---- Q4: Points in all quadrants ----
const diag4 = createCoordSVG({
  xMin: -6, xMax: 7, yMin: -5, yMax: 5,
  points: [
    { x: -4, y: 3, label: 'A' }, { x: 3, y: 3, label: 'B' },
    { x: 5, y: -2, label: 'C' }, { x: 1, y: -4, label: 'D' },
    { x: -2, y: -1, label: 'E' }
  ]
});

questions.push({
  text: 'באיזה רביע נמצאת הנקודה A(\u22124,3)?',
  type: 'multiple-choice',
  options: ['רביע I', 'רביע II', 'רביע III', 'רביע IV'],
  correct: 1,
  explanation: 'x שלילי, y חיובי — רביע II'
});
questions.push({
  text: 'באיזה רביע נמצאת הנקודה C(5,\u22122)?',
  type: 'multiple-choice',
  options: ['רביע I', 'רביע II', 'רביע III', 'רביע IV'],
  correct: 3,
  explanation: 'x חיובי, y שלילי — רביע IV'
});
questions.push({
  text: 'באיזה רביע נמצאת הנקודה E(\u22122,\u22121)?',
  type: 'multiple-choice',
  options: ['רביע I', 'רביע II', 'רביע III', 'רביע IV'],
  correct: 2,
  explanation: 'x שלילי, y שלילי — רביע III'
});
questions.push({
  text: 'A(\u22124,3) ו-B(3,3) נמצאות באותו y. מהו אורך הקטע AB?',
  type: 'free-input',
  correct: ['7'],
  visual: { type: 'svg-geometry', svg: diag4 },
  explanation: 'AB = 3 \u2212 (\u22124) = 7'
});
questions.push({
  text: 'מהו שטח המשולש AOB כאשר A(\u22124,3), B(3,3) ו-O(0,0)?',
  type: 'free-input',
  correct: ['10.5'],
  visual: { type: 'svg-geometry', svg: diag4 },
  explanation: 'בסיס AB = 7, גובה = 3. שטח = \u00BD \u00D7 7 \u00D7 3 = 10.5'
});

// ---- Q5: Right triangle on axes ----
const diag5 = createCoordSVG({
  xMin: -2, xMax: 8, yMin: -1, yMax: 6,
  points: [
    { x: 0, y: 4, label: 'A', labelDx: -18 },
    { x: 6, y: 0, label: 'B' },
    { x: 0, y: 0, label: 'C', labelDx: -15, labelDy: 14 }
  ],
  shapes: [{ points: [[0, 4], [6, 0], [0, 0]] }]
});

questions.push({
  text: 'A(0,4), B(6,0), C(0,0). מהו סוג המשולש ABC?',
  type: 'multiple-choice',
  options: ['ישר-זווית', 'שווה-שוקיים', 'שווה-צלעות', 'קהה-זווית'],
  correct: 0,
  visual: { type: 'svg-geometry', svg: diag5 },
  explanation: 'הזווית ב-C היא ישרה — צלעות AC ו-BC על הצירים'
});
questions.push({
  text: 'A(0,4), B(6,0), C(0,0). מהו שטח המשולש ABC?',
  type: 'free-input',
  correct: ['12'],
  visual: { type: 'svg-geometry', svg: diag5 },
  explanation: 'AC = 4, BC = 6. שטח = \u00BD \u00D7 6 \u00D7 4 = 12'
});

// ---- Q6: Rectangle crossing all quadrants ----
const diag6 = createCoordSVG({
  xMin: -6, xMax: 5, yMin: -4, yMax: 5,
  points: [
    { x: -4, y: 3, label: 'A', labelDx: -15 },
    { x: 3, y: 3, label: 'B' },
    { x: 3, y: -2, label: 'C' },
    { x: -4, y: -2, label: 'D', labelDx: -15 }
  ],
  shapes: [{ points: [[-4, 3], [3, 3], [3, -2], [-4, -2]] }]
});

questions.push({
  text: 'מלבן ABCD: A(\u22124,3) B(3,3) C(3,\u22122) D(\u22124,\u22122). מהו שטח המלבן?',
  type: 'free-input',
  correct: ['35'],
  visual: { type: 'svg-geometry', svg: diag6 },
  explanation: 'AB = 7, AD = 5. שטח = 7 \u00D7 5 = 35'
});
questions.push({
  text: 'מלבן ABCD: A(\u22124,3) B(3,3) C(3,\u22122) D(\u22124,\u22122). מהו היקף המלבן?',
  type: 'free-input',
  correct: ['24'],
  visual: { type: 'svg-geometry', svg: diag6 },
  explanation: 'היקף = 2(7 + 5) = 24'
});
questions.push({
  text: 'מלבן ABCD: A(\u22124,3) B(3,3). מהם שיעורי הנקודה על AB ששיעור ה-x שלה הוא 0?',
  type: 'free-input',
  correct: coordAnswers(0, 3),
  visual: { type: 'svg-geometry', svg: diag6 },
  explanation: 'על AB: y = 3, x = 0 — הנקודה (0,3)'
});
questions.push({
  text: 'מלבן ABCD: A(\u22124,3) D(\u22124,\u22122). מהם שיעורי הנקודה על AD ששיעור ה-y שלה הוא 0?',
  type: 'free-input',
  correct: coordAnswers(-4, 0),
  visual: { type: 'svg-geometry', svg: diag6 },
  explanation: 'על AD: x = \u22124, y = 0 — הנקודה (\u22124,0)'
});
questions.push({
  text: 'המלבן ABCD משתרע מ-x = \u22124 עד x = 3 ומ-y = \u22122 עד y = 3. האם W(0,0) בתוך המלבן?',
  type: 'multiple-choice',
  options: ['כן, W בתוך המלבן', 'לא, W מחוץ למלבן', 'W על צלע המלבן'],
  correct: 0,
  visual: { type: 'svg-geometry', svg: diag6 },
  explanation: 'x = 0 בין \u22124 ל-3, y = 0 בין \u22122 ל-3 — W בתוך המלבן'
});

// ---- Q7: Square in Q3 ----
const diag7 = createCoordSVG({
  xMin: -7, xMax: 2, yMin: -7, yMax: 1,
  points: [
    { x: -5, y: -1, label: 'A', labelDx: -15 },
    { x: -1, y: -1, label: 'B' },
    { x: -1, y: -5, label: 'C' },
    { x: -5, y: -5, label: 'D', labelDx: -15 }
  ],
  shapes: [{ points: [[-5, -1], [-1, -1], [-1, -5], [-5, -5]] }]
});

questions.push({
  text: 'מהו שטח הריבוע ABCD בסרטוט?',
  type: 'free-input',
  correct: ['16'],
  visual: { type: 'svg-geometry', svg: diag7 },
  explanation: 'צלע = 4, שטח = 16'
});
questions.push({
  text: 'ריבוע ABCD: x מ-\u22125 עד \u22121, y מ-\u22125 עד \u22121. האם (\u22124,\u22123) בתוך הריבוע?',
  type: 'multiple-choice',
  options: ['כן, בתוך הריבוע', 'לא, מחוץ לריבוע', 'על צלע הריבוע'],
  correct: 0,
  visual: { type: 'svg-geometry', svg: diag7 },
  explanation: 'x = \u22124 בין \u22125 ל-\u22121, y = \u22123 בין \u22125 ל-\u22121 — בתוך'
});
questions.push({
  text: 'ריבוע ABCD: x מ-\u22125 עד \u22121, y מ-\u22125 עד \u22121. האם (\u22126,\u22124) בתוך הריבוע?',
  type: 'multiple-choice',
  options: ['כן, בתוך הריבוע', 'לא, מחוץ לריבוע', 'על צלע הריבוע'],
  correct: 1,
  visual: { type: 'svg-geometry', svg: diag7 },
  explanation: 'x = \u22126 קטן מ-\u22125 — מחוץ לריבוע'
});

// ---- Q8: No diagram, text only ----
questions.push({
  text: 'A(\u22122,4) ו-B(4,4). מהו אורך הקטע AB?',
  type: 'free-input',
  correct: ['6'],
  explanation: 'AB = 4 \u2212 (\u22122) = 6'
});
questions.push({
  text: 'שטח מלבן ABCD הוא 18 יח\u05F4ש, וצלע AB = 6. מהו אורך הצלע BC?',
  type: 'free-input',
  correct: ['3'],
  explanation: '18 = 6 \u00D7 BC, אז BC = 3'
});

// ---- Q9: Rectangle with partial coordinates ----
const diag9 = createCoordSVG({
  xMin: -5, xMax: 6, yMin: -5, yMax: 7,
  points: [
    { x: -3, y: 5, label: 'A' },
    { x: 4, y: 5, label: 'B(4,5)' },
    { x: 4, y: -3, label: 'C' },
    { x: -3, y: -3, label: 'D(\u22123,\u22123)', labelDx: -70 }
  ],
  shapes: [{ points: [[-3, 5], [4, 5], [4, -3], [-3, -3]] }]
});

questions.push({
  text: 'B(4,5) ו-D(\u22123,\u22123) הם קדקודים נגדיים במלבן. מהם שיעורי A?',
  type: 'free-input',
  correct: coordAnswers(-3, 5),
  visual: { type: 'svg-geometry', svg: diag9 },
  explanation: 'A בפינה שמאלית-עליונה: A(\u22123,5)'
});
questions.push({
  text: 'מלבן ABCD: A(\u22123,5) B(4,5) C(4,\u22123) D(\u22123,\u22123). מהו שטח המלבן?',
  type: 'free-input',
  correct: ['56'],
  visual: { type: 'svg-geometry', svg: diag9 },
  explanation: 'AB = 7, AD = 8. שטח = 7 \u00D7 8 = 56'
});
questions.push({
  text: 'נקודה P על הצלע AD ועל ציר ה-x. AD: x = \u22123. מהם שיעורי P?',
  type: 'free-input',
  correct: coordAnswers(-3, 0),
  visual: { type: 'svg-geometry', svg: diag9 },
  explanation: 'על AD: x = \u22123, על ציר x: y = 0, אז P(\u22123,0)'
});

// ---- Q10: Right triangle in Q2/Q3 ----
const diag10 = createCoordSVG({
  xMin: -6, xMax: 4, yMin: -8, yMax: 2,
  points: [
    { x: -4, y: 0, label: 'A', labelDx: -15, labelDy: -8 },
    { x: -4, y: -6, label: 'B', labelDx: -15 },
    { x: 2, y: -6, label: 'C' }
  ],
  shapes: [{ points: [[-4, 0], [-4, -6], [2, -6]] }]
});

questions.push({
  text: 'A(\u22124,0) B(\u22124,\u22126) C(2,\u22126). באיזו נקודה הזווית הישרה?',
  type: 'multiple-choice',
  options: ['A', 'B', 'C'],
  correct: 1,
  visual: { type: 'svg-geometry', svg: diag10 },
  explanation: 'AB אנכית ו-BC אופקית — הזווית הישרה ב-B'
});
questions.push({
  text: 'מהו שטח המשולש ABC כאשר AB = 6 ו-BC = 6?',
  type: 'free-input',
  correct: ['18'],
  visual: { type: 'svg-geometry', svg: diag10 },
  explanation: 'שטח = \u00BD \u00D7 6 \u00D7 6 = 18'
});
questions.push({
  text: 'A(\u22124,0) B(\u22124,\u22126) C(2,\u22126) D(2,0). מהו סוג המרובע ABCD?',
  type: 'multiple-choice',
  options: ['מלבן', 'ריבוע', 'מקבילית', 'טרפז'],
  correct: 1,
  visual: { type: 'svg-geometry', svg: diag10 },
  explanation: 'AB = BC = AD = DC = 6 — ריבוע'
});
questions.push({
  text: 'A(\u22124,0) B(\u22124,\u22126) C(2,\u22126) D(2,0). מהו שטח המרובע ABCD?',
  type: 'free-input',
  correct: ['36'],
  visual: { type: 'svg-geometry', svg: diag10 },
  explanation: 'צלע = 6. שטח = 6 \u00D7 6 = 36'
});

// ---- Q11: Obtuse triangle ----
const diag11 = createCoordSVG({
  xMin: -4, xMax: 6, yMin: -3, yMax: 7,
  points: [
    { x: -2, y: 5, label: 'A', labelDx: -15 },
    { x: 4, y: -1, label: 'B' },
    { x: -2, y: -1, label: 'C', labelDx: -15 }
  ],
  shapes: [{ points: [[-2, 5], [4, -1], [-2, -1]] }]
});

questions.push({
  text: 'A(\u22122,5) B(4,\u22121) C(\u22122,\u22121). מהו אורך BC?',
  type: 'free-input',
  correct: ['6'],
  visual: { type: 'svg-geometry', svg: diag11 },
  explanation: 'BC = 4 \u2212 (\u22122) = 6'
});
questions.push({
  text: 'A(\u22122,5) B(4,\u22121) C(\u22122,\u22121). מהו שטח המשולש?',
  type: 'free-input',
  correct: ['18'],
  visual: { type: 'svg-geometry', svg: diag11 },
  explanation: 'BC = 6, AC = 6. שטח = \u00BD \u00D7 6 \u00D7 6 = 18'
});

// ---- Q12: Triangle with base on x-axis ----
const diag12 = createCoordSVG({
  xMin: -5, xMax: 7, yMin: -2, yMax: 6,
  points: [
    { x: 2, y: 4, label: 'A' },
    { x: -3, y: 0, label: 'B', labelDx: -15 },
    { x: 5, y: 0, label: 'C' }
  ],
  shapes: [{ points: [[2, 4], [-3, 0], [5, 0]] }]
});

questions.push({
  text: 'A(2,4) B(\u22123,0) C(5,0). BC נמצאת על ציר ה-x. מהו הגובה מ-A לצלע BC?',
  type: 'free-input',
  correct: ['4'],
  visual: { type: 'svg-geometry', svg: diag12 },
  explanation: 'BC על ציר x — y = 0. גובה = |4 \u2212 0| = 4'
});
questions.push({
  text: 'A(2,4) B(\u22123,0) C(5,0). מהו שטח המשולש ABC?',
  type: 'free-input',
  correct: ['16'],
  visual: { type: 'svg-geometry', svg: diag12 },
  explanation: 'BC = 8, גובה = 4. שטח = \u00BD \u00D7 8 \u00D7 4 = 16'
});

// ---- Q13: Quadrants for special conditions ----
questions.push({
  text: 'נקודות שבהן x = y נמצאות ברבעים:',
  type: 'multiple-choice',
  options: ['I ו-III', 'I ו-II', 'II ו-IV', 'I ו-IV'],
  correct: 0,
  explanation: 'x = y: שניהם חיוביים — רביע I, שניהם שליליים — רביע III'
});
questions.push({
  text: 'נקודות שבהן y = \u2212x נמצאות ברבעים:',
  type: 'multiple-choice',
  options: ['I ו-III', 'II ו-IV', 'I ו-II', 'III ו-IV'],
  correct: 1,
  explanation: 'y = \u2212x: x חיובי ו-y שלילי — IV, x שלילי ו-y חיובי — II'
});

// ---- Q14: Pentagon area ----
const diag14 = createCoordSVG({
  xMin: -6, xMax: 5, yMin: -6, yMax: 6,
  points: [
    { x: -4, y: 4, label: 'A', labelDx: -15 },
    { x: 3, y: 4, label: 'B' },
    { x: 3, y: -1, label: 'C' },
    { x: 0, y: -4, label: 'D' },
    { x: -4, y: -1, label: 'E', labelDx: -15 }
  ],
  shapes: [{ points: [[-4, 4], [3, 4], [3, -1], [0, -4], [-4, -1]] }]
});

questions.push({
  text: 'מצולע ABCDE בסרטוט. AB = 7, AE = 5, בסיס EC = 7, גובה משולש ECD = 3. מהו השטח הכולל?',
  type: 'free-input',
  correct: ['45.5'],
  visual: { type: 'svg-geometry', svg: diag14 },
  explanation: 'מלבן ABCE = 7 \u00D7 5 = 35. משולש ECD = \u00BD \u00D7 7 \u00D7 3 = 10.5. סה\u05F4כ 45.5'
});

// ---- Q15: Rectangle with dividers ----
questions.push({
  text: 'מלבן ABCD: A(\u22125,3) B(1,3) C(1,\u22121) D(\u22125,\u22121). מהו שטח המלבן?',
  type: 'free-input',
  correct: ['24'],
  explanation: 'AB = 6, AD = 4. שטח = 6 \u00D7 4 = 24'
});
questions.push({
  text: 'E(\u22122,3) על AB ו-F(\u22122,\u22121) על DC. EF מחלק את המלבן לשניים. מהם שטחי שני המלבנים?',
  type: 'multiple-choice',
  options: ['12 ו-12', '16 ו-8', '18 ו-6', '14 ו-10'],
  correct: 0,
  explanation: 'מלבן שמאלי: 3 \u00D7 4 = 12. מלבן ימני: 3 \u00D7 4 = 12'
});
questions.push({
  text: 'E(\u22122,3) B(1,3) G(1,1). מהו שטח המשולש EBG?',
  type: 'free-input',
  correct: ['3'],
  explanation: 'EB = 3, BG = 2. שטח = \u00BD \u00D7 3 \u00D7 2 = 3'
});

// ---- Q16: Isosceles triangle ----
const diag16 = createCoordSVG({
  xMin: -6, xMax: 6, yMin: -2, yMax: 8,
  points: [
    { x: 0, y: 6, label: 'A', labelDx: 6, labelDy: -8 },
    { x: -4, y: 0, label: 'B', labelDx: -18 },
    { x: 4, y: 0, label: 'C' }
  ],
  shapes: [{ points: [[0, 6], [-4, 0], [4, 0]] }]
});

questions.push({
  text: 'A(0,6) B(\u22124,0) C(4,0). מהו שטח המשולש ABC?',
  type: 'free-input',
  correct: ['24'],
  visual: { type: 'svg-geometry', svg: diag16 },
  explanation: 'BC = 8, גובה = 6. שטח = \u00BD \u00D7 8 \u00D7 6 = 24'
});
questions.push({
  text: 'A(0,6) B(\u22124,0) C(4,0). המשולש סימטרי. מהו ציר הסימטריה?',
  type: 'multiple-choice',
  options: ['ציר ה-y — x = 0', 'ציר ה-x — y = 0', 'הישר y = x', 'הישר y = 3'],
  correct: 0,
  visual: { type: 'svg-geometry', svg: diag16 },
  explanation: 'A על ציר y, B ו-C סימטריים סביבו — ציר ה-y'
});
questions.push({
  text: 'A(0,6) B(\u22124,0) C(4,0) D(0,\u22126). מהו סוג המרובע ABDC?',
  type: 'multiple-choice',
  options: ['מלבן', 'ריבוע', 'דלתון', 'מעוין'],
  correct: 2,
  visual: { type: 'svg-geometry', svg: diag16 },
  explanation: 'A ו-D סימטריים ביחס ל-BC. שני זוגות צלעות שוות סמוכות — דלתון'
});
questions.push({
  text: 'A(0,6) B(\u22124,0) C(4,0) D(0,\u22126). מהו שטח הדלתון ABDC?',
  type: 'free-input',
  correct: ['48'],
  visual: { type: 'svg-geometry', svg: diag16 },
  explanation: 'שני משולשים: ABC = 24, BDC = 24. סה\u05F4כ = 48'
});

// ---- Q17: Nested rectangles ----
questions.push({
  text: 'מלבן גדול: A(\u22126,4) B(6,4) C(6,\u22122) D(\u22126,\u22122). מהו שטח המלבן?',
  type: 'free-input',
  correct: ['72'],
  explanation: 'AB = 12, AD = 6. שטח = 72'
});
questions.push({
  text: 'מלבן קטן בתוך הגדול: E(\u22123,3) F(3,3) G(3,0) H(\u22123,0). מהו שטח המלבן הקטן?',
  type: 'free-input',
  correct: ['18'],
  explanation: 'EF = 6, EH = 3. שטח = 18'
});
questions.push({
  text: 'שטח המלבן הגדול 72, שטח הקטן 18. מהו שטח האזור שביניהם?',
  type: 'free-input',
  correct: ['54'],
  explanation: '72 \u2212 18 = 54'
});

// ---- Q18: Center and midpoints ----
questions.push({
  text: 'מלבן ABCD: A(1,5) B(7,5) C(7,1) D(1,1). מהם שיעורי מרכז המלבן — נקודת חיתוך האלכסונים?',
  type: 'free-input',
  correct: coordAnswers(4, 3),
  explanation: 'מרכז = ((1+7)/2, (5+1)/2) = (4,3)'
});
questions.push({
  text: 'מלבן ABCD: A(1,5) B(7,5). מהם שיעורי E — אמצע AB?',
  type: 'free-input',
  correct: coordAnswers(4, 5),
  explanation: 'E = ((1+7)/2, 5) = (4,5)'
});
questions.push({
  text: 'E(4,5) ו-F(4,1) — אמצעי צלעות AB ו-CD. מהו אורך EF?',
  type: 'free-input',
  correct: ['4'],
  explanation: 'EF = |5 \u2212 1| = 4'
});

// ---- Q19: Reflections ----
questions.push({
  text: 'A(3,2). מהם שיעורי A\u05F3 — שיקוף A דרך ציר ה-x?',
  type: 'free-input',
  correct: coordAnswers(3, -2),
  explanation: 'שיקוף דרך ציר x: שיעור y מתהפך. A\u05F3(3,\u22122)'
});
questions.push({
  text: 'A(3,2). מהם שיעורי A\u05F4 — שיקוף A דרך ציר ה-y?',
  type: 'free-input',
  correct: coordAnswers(-3, 2),
  explanation: 'שיקוף דרך ציר y: שיעור x מתהפך. A\u05F4(\u22123,2)'
});
questions.push({
  text: 'A(3,2). מהם שיעורי השיקוף של A דרך ראשית הצירים?',
  type: 'free-input',
  correct: coordAnswers(-3, -2),
  explanation: 'שיקוף דרך ראשית: שני השיעורים מתהפכים. (\u22123,\u22122)'
});
questions.push({
  text: 'A(3,2) A\u05F3(3,\u22122) A\u05F4(\u22123,2) A\u2034(\u22123,\u22122). מהו סוג המרובע?',
  type: 'multiple-choice',
  options: ['ריבוע', 'מלבן', 'מעוין', 'טרפז'],
  correct: 1,
  explanation: 'צלעות: 6 ו-4. כל הזוויות ישרות — מלבן'
});
questions.push({
  text: 'מרובע עם קדקודים (3,2) (3,\u22122) (\u22123,\u22122) (\u22123,2). מהו שטחו?',
  type: 'free-input',
  correct: ['24'],
  explanation: 'אורך = 6, רוחב = 4. שטח = 24'
});

// ---- Q20: Building shapes ----
questions.push({
  text: 'שטח ריבוע הוא 16 יח\u05F4ש ומרכזו ב-(0,0). מהו אורך צלע הריבוע?',
  type: 'free-input',
  correct: ['4'],
  explanation: '\u221A16 = 4'
});
questions.push({
  text: 'מלבן: היקפו 20 יח\u05F4א ושטחו 24 יח\u05F4ש. a + b = 10 ו-a \u00D7 b = 24. מהם אורכי הצלעות?',
  type: 'multiple-choice',
  options: ['4 ו-6', '3 ו-8', '2 ו-12', '5 ו-5'],
  correct: 0,
  explanation: 'a + b = 10, a \u00D7 b = 24. הצלעות: 4 ו-6'
});

// ============================================================
// Output
// ============================================================

const output = {
  name: 'מערכת צירים במישור',
  shuffle: true,
  questionsPerSession: 15,
  questions
};

const outPath = path.join(__dirname, 'content', 'coordinate-geometry-7.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`✅ Wrote ${questions.length} questions to ${outPath}`);
