#!/usr/bin/env node
/**
 * Generate word-problems and geometry questions for 7th grade
 * from math_practice.html (sections 5 & 6).
 *
 * Produces:
 *   content/word-problems-7.json
 *   content/geometry-shapes-7.json
 */
const fs = require('fs');
const path = require('path');

function numAnswers(n) {
  const s = String(n);
  const results = [s];
  if (s.includes('-')) results.push(s.replace(/-/g, '\u2212'));
  return results;
}

// ============================================================
// Word Problems (שאלות מילוליות)
// ============================================================

const wordProblems = [];

// Q36: Three consecutive numbers summing to 48
wordProblems.push({
  text: 'שלושה מספרים עוקבים שסכומם 48. מהו המספר הקטן ביותר?',
  type: 'free-input',
  correct: ['15'],
  explanation: 'x + (x+1) + (x+2) = 48, אז 3x + 3 = 48, x = 15. המספרים: 15, 16, 17'
});
wordProblems.push({
  text: 'שלושה מספרים עוקבים שסכומם 48. מהו המספר הגדול ביותר?',
  type: 'free-input',
  correct: ['17'],
  explanation: 'המספרים: 15, 16, 17'
});

// Q37: Father 4x son's age, sum = 50
wordProblems.push({
  text: 'גיל האבא גדול פי 4 מגיל הבן. סכום גיליהם 50. מהו גיל הבן?',
  type: 'free-input',
  correct: ['10'],
  explanation: 'x + 4x = 50, אז 5x = 50, x = 10'
});
wordProblems.push({
  text: 'גיל האבא גדול פי 4 מגיל הבן. סכום גיליהם 50. מהו גיל האבא?',
  type: 'free-input',
  correct: ['40'],
  explanation: 'גיל הבן 10, גיל האבא 4 \u00D7 10 = 40'
});

// Q38: Rectangle perimeter 52, length is 6 more than width
wordProblems.push({
  text: 'היקף מלבן הוא 52 ס\u05F4מ. אורכו גדול מרוחבו ב-6 ס\u05F4מ. מהו רוחב המלבן?',
  type: 'free-input',
  correct: ['10'],
  explanation: '2(x + x + 6) = 52, אז 4x + 12 = 52, x = 10'
});
wordProblems.push({
  text: 'היקף מלבן 52 ס\u05F4מ, אורכו גדול מרוחבו ב-6. מהו שטח המלבן?',
  type: 'free-input',
  correct: ['160'],
  explanation: 'רוחב 10, אורך 16. שטח = 10 \u00D7 16 = 160'
});

// Q39: 32 students, girls 4 more than boys
wordProblems.push({
  text: 'בכיתה 32 תלמידים. מספר הבנות גדול ממספר הבנים ב-4. כמה בנים בכיתה?',
  type: 'free-input',
  correct: ['14'],
  explanation: 'x + (x + 4) = 32, אז 2x = 28, x = 14'
});
wordProblems.push({
  text: 'בכיתה 32 תלמידים. מספר הבנות גדול ממספר הבנים ב-4. כמה בנות בכיתה?',
  type: 'free-input',
  correct: ['18'],
  explanation: '14 + 4 = 18 בנות'
});

// Q40: Three friends collect money
wordProblems.push({
  text: 'שלושה חברים אספו כסף. השני אסף פי 2 מהראשון, והשלישי אסף 15 \u20AA יותר מהראשון. ביחד אספו 175 \u20AA. כמה אסף הראשון?',
  type: 'free-input',
  correct: ['40'],
  explanation: 'x + 2x + (x + 15) = 175, אז 4x = 160, x = 40'
});
wordProblems.push({
  text: 'שלושה חברים אספו כסף. השני אסף פי 2 מהראשון, והשלישי אסף 15 \u20AA יותר מהראשון. ביחד אספו 175 \u20AA. כמה אסף השני?',
  type: 'free-input',
  correct: ['80'],
  explanation: 'הראשון 40, השני 2 \u00D7 40 = 80'
});

// Q41: Rectangle sides 3x+1 and x+5, perimeter 60
wordProblems.push({
  text: 'צלעות מלבן הן 3x + 1 ו-x + 5. היקף המלבן 60 ס\u05F4מ. מהו x?',
  type: 'free-input',
  correct: ['6'],
  explanation: '2(3x + 1 + x + 5) = 60, אז 8x + 12 = 60, x = 6'
});
wordProblems.push({
  text: 'צלעות מלבן הן 3x + 1 ו-x + 5. אם x = 6, מהו שטח המלבן?',
  type: 'free-input',
  correct: ['209'],
  explanation: 'צלעות: 19 ו-11. שטח = 19 \u00D7 11 = 209'
});

// Q42: Magic square
wordProblems.push({
  text: 'במעגל קסם, סכום שורה 1: (x+2) + (2x\u22127) + x. סכום שורה 3: (x+1) + (x+10) + (x\u22126). הם שווים. מהו x?',
  type: 'free-input',
  correct: ['10'],
  explanation: '4x \u2212 5 = 3x + 5, אז x = 10'
});
wordProblems.push({
  text: 'במעגל קסם עם x = 10, סכום שורה 1 הוא 4x \u2212 5. מהו סכום כל שורה?',
  type: 'free-input',
  correct: ['35'],
  explanation: '4(10) \u2212 5 = 35'
});

// Q43: Right triangle area 60, one leg 7 longer
wordProblems.push({
  text: 'שטח משולש ישר-זווית הוא 60 סמ\u05F4ר. ניצב אחד ארוך מהשני ב-7 ס\u05F4מ. מהו הניצב הקצר?',
  type: 'free-input',
  correct: ['8'],
  explanation: 'x(x + 7) / 2 = 60, אז x(x + 7) = 120. ננסה x = 8: 8 \u00D7 15 = 120 \u2713'
});
wordProblems.push({
  text: 'שטח משולש ישר-זווית הוא 60 סמ\u05F4ר. ניצב אחד ארוך מהשני ב-7 ס\u05F4מ. מהו הניצב הארוך?',
  type: 'free-input',
  correct: ['15'],
  explanation: 'הניצב הקצר 8, הארוך 8 + 7 = 15'
});

// ============================================================
// Geometric Shapes (צורות גיאומטריות)
// ============================================================

const geometry = [];

// Q44: Rectangle 12x5
geometry.push({
  text: 'מלבן ABCD: אורך 12 ס\u05F4מ, רוחב 5 ס\u05F4מ. מהו היקף המלבן?',
  type: 'free-input',
  correct: ['34'],
  explanation: 'היקף = 2 \u00D7 (12 + 5) = 34'
});
geometry.push({
  text: 'מלבן ABCD: אורך 12 ס\u05F4מ, רוחב 5 ס\u05F4מ. מהו שטח המלבן?',
  type: 'free-input',
  correct: ['60'],
  explanation: 'שטח = 12 \u00D7 5 = 60'
});

// Q45: Triangle base 10, height 8
geometry.push({
  text: 'משולש: בסיסו 10 ס\u05F4מ וגובהו לבסיס 8 ס\u05F4מ. מהו שטח המשולש?',
  type: 'free-input',
  correct: ['40'],
  explanation: 'שטח = (10 \u00D7 8) / 2 = 40'
});

// Q46: Parallelogram AB=14, BC=9, height to AB = 6
geometry.push({
  text: 'מקבילית ABCD: AB = 14, BC = 9. מהו היקף המקבילית?',
  type: 'free-input',
  correct: ['46'],
  explanation: 'היקף = 2 \u00D7 (14 + 9) = 46'
});
geometry.push({
  text: 'מקבילית ABCD: AB = 14, גובה לצלע AB = 6. מהו שטח המקבילית?',
  type: 'free-input',
  correct: ['84'],
  explanation: 'שטח = בסיס \u00D7 גובה = 14 \u00D7 6 = 84'
});

// Q47: Parallelogram area 72, base 9
geometry.push({
  text: 'שטח מקבילית 72 סמ\u05F4ר ובסיסה 9 ס\u05F4מ. מהו גובה המקבילית?',
  type: 'free-input',
  correct: ['8'],
  explanation: 'גובה = 72 / 9 = 8'
});
geometry.push({
  text: 'מקבילית: בסיס 9 ס\u05F4מ, צלע שנייה 10 ס\u05F4מ. מהו היקפה?',
  type: 'free-input',
  correct: ['38'],
  explanation: 'היקף = 2 \u00D7 (9 + 10) = 38'
});

// Q48: Rectangle with point E on DC
geometry.push({
  text: 'מלבן ABCD: AB = DC = 12, BC = 6. E על DC כך ש-DE = 4, EC = 8. מהו שטח המלבן?',
  type: 'free-input',
  correct: ['72'],
  explanation: 'שטח = 12 \u00D7 6 = 72'
});
geometry.push({
  text: 'מלבן ABCD: AB = 12, BC = 6. E על DC. מהו שטח המשולש ABE?',
  type: 'free-input',
  correct: ['36'],
  explanation: 'בסיס AB = 12, גובה = 6. שטח = (12 \u00D7 6) / 2 = 36'
});
geometry.push({
  text: 'טרפז ABCE: AB = 12, EC = 8, גובה = 6. מהו שטח הטרפז?',
  type: 'free-input',
  correct: ['60'],
  explanation: 'שטח = ((12 + 8) \u00D7 6) / 2 = 60'
});

// Q49: Isosceles triangle perimeter 40, base 5 shorter than legs
geometry.push({
  text: 'היקף משולש שווה-שוקיים 40 ס\u05F4מ. הבסיס קצר מכל שוק ב-5. מהו אורך השוק?',
  type: 'free-input',
  correct: ['15'],
  explanation: 'x + x + (x \u2212 5) = 40, אז 3x = 45, x = 15'
});
geometry.push({
  text: 'היקף משולש שווה-שוקיים 40 ס\u05F4מ. הבסיס קצר מכל שוק ב-5. מהו אורך הבסיס?',
  type: 'free-input',
  correct: ['10'],
  explanation: 'שוק = 15, בסיס = 15 \u2212 5 = 10'
});
geometry.push({
  text: 'משולש שווה-שוקיים: בסיס 10 ס\u05F4מ, גובה לבסיס 12 ס\u05F4מ. מהו שטח המשולש?',
  type: 'free-input',
  correct: ['60'],
  explanation: 'שטח = (10 \u00D7 12) / 2 = 60'
});

// Q50: Rectangle with inscribed triangle AEF
geometry.push({
  text: 'מלבן ABCD: AB = 16, BC = 10. מהו שטח המלבן?',
  type: 'free-input',
  correct: ['160'],
  explanation: 'שטח = 16 \u00D7 10 = 160'
});
geometry.push({
  text: 'מלבן ABCD: AB = 16, BC = 10. E על BC כך ש-BE = 4. מהו שטח המשולש ABE?',
  type: 'free-input',
  correct: ['32'],
  explanation: 'שטח = (4 \u00D7 16) / 2 = 32'
});
geometry.push({
  text: 'מלבן ABCD: AB = 16, BC = 10. F על CD כך ש-CF = 3, DF = 13. מהו שטח המשולש ADF?',
  type: 'free-input',
  correct: ['65'],
  explanation: 'שטח = (13 \u00D7 10) / 2 = 65'
});
geometry.push({
  text: 'E על BC כך ש-EC = 6. F על CD כך ש-CF = 3. מהו שטח המשולש ECF?',
  type: 'free-input',
  correct: ['9'],
  explanation: 'שטח = (6 \u00D7 3) / 2 = 9'
});
geometry.push({
  text: 'מלבן ABCD: שטח 160. שטחי המשולשים ABE = 32, ADF = 65, ECF = 9. מהו שטח המשולש AEF?',
  type: 'free-input',
  correct: ['54'],
  explanation: 'שטח AEF = 160 \u2212 32 \u2212 65 \u2212 9 = 54'
});

// ============================================================
// Output
// ============================================================

const contentDir = path.join(__dirname, 'content');

// Word problems
const wpOut = {
  name: 'שאלות מילוליות',
  shuffle: true,
  questionsPerSession: 10,
  questions: wordProblems
};
const wpPath = path.join(contentDir, 'word-problems-7.json');
fs.writeFileSync(wpPath, JSON.stringify(wpOut, null, 2), 'utf-8');
console.log(`\u2705 Wrote ${wordProblems.length} word problems to ${wpPath}`);

// Geometry shapes
const geoOut = {
  name: 'צורות גיאומטריות',
  shuffle: true,
  questionsPerSession: 10,
  questions: geometry
};
const geoPath = path.join(contentDir, 'geometry-shapes-7.json');
fs.writeFileSync(geoPath, JSON.stringify(geoOut, null, 2), 'utf-8');
console.log(`\u2705 Wrote ${geometry.length} geometry questions to ${geoPath}`);
