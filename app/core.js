/**
 * Math Practice App — Core Library
 * 
 * Battle-tested utilities for Hebrew RTL math education apps.
 * Every function here has been iterated and proven through real-world usage.
 * 
 * Key solved problems:
 * - BiDi text handling for math expressions in RTL context
 * - Parentheses rendering in Hebrew text
 * - SVG geometry generation
 * - Interactive chart/graph rendering
 * - Progress persistence via localStorage
 * - Celebration animations
 */

// ============================================================
// 1. BIDI / RTL TEXT HANDLING
// ============================================================

/**
 * fixBidi — Wraps math expressions in LTR-isolated spans.
 * 
 * PROBLEM: In RTL (Hebrew) context, expressions like "210 ÷ 14 = 15"
 * get garbled — digits and operators reorder unpredictably.
 * 
 * SOLUTION: Detect math expressions via regex and wrap them in
 * <span dir="ltr" style="unicode-bidi:isolate">...</span>
 * 
 * Handles: regular digits, □ placeholders, Unicode fractions (½ ⅓ ¾),
 * superscripts/subscripts (²³₁₂), fraction slash (⁄), operators,
 * parentheses, ₪ currency, and percentage signs.
 * 
 * IMPORTANT RULE: Parentheses around Hebrew text WILL break.
 * Use em-dash (—) or rephrase instead.
 * Parentheses around MATH expressions are fine (fixBidi wraps them in LTR).
 * 
 * @param {string} text - Hebrew text potentially containing math expressions
 * @returns {string} - HTML string with LTR-isolated math spans
 */
function fixBidi(text) {
  if (!text) return '';
  
  // Character classes for math expression detection
  // mathChar: any character that can appear INSIDE a math expression
  const mathChar = '[\\d□÷×·+\\-−=≠<>≤≥\\/\\.\\,\\(\\)\\[\\]\\{\\}\\^²³₪%\\?\\s' +
    'a-zA-Z' +                      // algebraic variables (x, y, a, b, etc.)
    '\\|' +                          // absolute value bars |x|
    '\u221A' +                       // square root √
    '\u2192' +                       // right arrow →
    '\u2212' +                       // Unicode minus −
    '\u00B2\u00B3\u00B9' +          // superscripts ² ³ ¹
    '\u00BC-\u00BE' +                // vulgar fractions ¼ ½ ¾
    '\u2044' +                       // fraction slash ⁄
    '\u2070-\u207F' +                // superscript digits ⁰⁴⁵⁶⁷⁸⁹
    '\u2080-\u208F' +                // subscript digits ₀₁₂₃₄₅₆₇₈₉
    '\u2150-\u215F' +                // vulgar fractions ⅓ ⅔ ⅕ etc.
    ']';

  // mathStart: characters that can START a math expression
  const mathStart = '[\\d□\\(' +
    'a-zA-Z' +                       // variables: x + 8, a = 3
    '\\|' +                          // absolute value: |−5|
    '\u221A' +                       // square root: √25
    '\u2212' +                       // Unicode minus: −3x
    '\\-' +                          // regular minus: -3x
    '\u00B2\u00B3\u00B9' +
    '\u00BC-\u00BE' +
    '\u2044' +
    '\u2070-\u207F' +
    '\u2080-\u208F' +
    '\u2150-\u215F' +
    ']';

  // mathEnd: characters that can END a math expression
  const mathEnd = '[\\d□\\)\\?' +
    'a-zA-Z' +                       // variables: 5x, 3a
    '\\|' +                          // absolute value: |5|
    '\u00BC-\u00BE' +
    '\u2150-\u215F' +
    '\u2080-\u208F' +
    '\u00B2\u00B3\u00B9' +
    '\u2070-\u207F' +
    ']';
  
  // Build regex: mathStart, optionally followed by mathChars and mathEnd, optional trailing period
  const re = new RegExp('(' + mathStart + '(?:' + mathChar + '*' + mathEnd + ')?' + '\\.?)', 'g');
  
  const wrap = '<span dir="ltr" style="unicode-bidi:isolate">';
  const wrapEnd = '</span>';
  
  return text.replace(re, function(match) {
    // Split on ", " — comma-space is a Hebrew list separator, NOT math
    // Prevents "38, 9" from merging into one LTR block
    if (match.includes(', ')) {
      return match.split(', ').map(function(part) {
        return part.trim() ? wrap + part + wrapEnd : '';
      }).join(', ');
    }
    return wrap + match + wrapEnd;
  });
}

/**
 * setMixedText — Sets innerHTML of an element with bidi-fixed content.
 * Use this instead of directly setting textContent/innerHTML for any
 * Hebrew text that may contain math expressions.
 * 
 * @param {HTMLElement} el - Target element
 * @param {string} text - Hebrew text with potential math
 */
function setMixedText(el, text) {
  if (!el) return;
  el.innerHTML = fixBidi(text);
}


// ============================================================
// 2. MATH UTILITIES
// ============================================================

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function lcm(a, b) { return (a * b) / gcd(a, b); }

/**
 * Random integer between min and max (inclusive)
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array
 */
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Shuffle an array in place (Fisher-Yates)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Format a fraction as a string.
 * Returns whole number if denominator is 1, mixed number if > 1, etc.
 */
function formatFraction(num, den) {
  if (den === 1) return '' + num;
  if (num > den) {
    const whole = Math.floor(num / den);
    const remainder = num % den;
    if (remainder === 0) return '' + whole;
    return whole + ' ' + remainder + '/' + den;
  }
  return num + '/' + den;
}


// ============================================================
// 3. VISUAL RENDERERS (Charts, Graphs, Tables)
// ============================================================

/**
 * Render a visual element (chart, table, SVG geometry) into a container.
 * The visual object has a `type` field that determines the renderer.
 * 
 * Supported types:
 * - "bar-chart": Vertical bar chart with optional gridlines-only mode
 * - "grouped-bar": Grouped/clustered bar chart with legend
 * - "pie-chart": Pie/donut chart using CSS conic-gradient
 * - "table": Data table with headers and rows
 * - "pictograph": Symbol-based table (⭐ = N items)
 * - "svg-geometry": SVG drawing for geometry problems
 * 
 * @param {HTMLElement} container - Where to render
 * @param {Object} visual - Visual specification object
 */
function renderVisual(container, visual) {
  if (!visual || !container) return;
  
  container.style.display = 'block';
  container.innerHTML = '';
  
  switch (visual.type) {
    case 'bar-chart':
      renderBarChart(container, visual);
      break;
    case 'grouped-bar':
      renderGroupedBar(container, visual);
      break;
    case 'pie-chart':
      renderPieChart(container, visual);
      break;
    case 'table':
      renderTable(container, visual);
      break;
    case 'pictograph':
      renderPictograph(container, visual);
      break;
    case 'svg-geometry':
      renderSVGGeometry(container, visual);
      break;
    default:
      console.warn('Unknown visual type:', visual.type);
  }
}

/**
 * Bar chart renderer.
 * visual.showValues: if false, shows gridlines only (kid reads from grid)
 * visual.labels: array of category labels
 * visual.values: array of numeric values
 * visual.colors: optional array of bar colors
 * visual.title: optional chart title
 * visual.yMax: optional explicit y-axis maximum
 * visual.gridStep: optional grid interval
 */
function renderBarChart(container, visual) {
  const { labels, values, title, colors: customColors } = visual;
  const showValues = visual.showValues !== false;
  const maxVal = visual.yMax || Math.ceil(Math.max(...values) * 1.2);
  const gridStep = visual.gridStep || Math.ceil(maxVal / 5);
  
  const colors = customColors || ['#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  
  const chartDiv = document.createElement('div');
  chartDiv.style.cssText = 'position:relative;direction:ltr;margin:16px auto;padding:20px;max-width:400px;';
  
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:12px;font-size:1.05em;direction:rtl;';
    titleEl.innerHTML = fixBidi(title);
    chartDiv.appendChild(titleEl);
  }
  
  const chartArea = document.createElement('div');
  chartArea.style.cssText = 'position:relative;height:200px;display:flex;align-items:flex-end;justify-content:space-around;' +
    'padding:0 10px 30px 40px;border-right:2px solid #333;border-bottom:2px solid #333;';
  
  // Gridlines
  for (let g = gridStep; g <= maxVal; g += gridStep) {
    const line = document.createElement('div');
    const pct = (g / maxVal) * 100;
    line.style.cssText = `position:absolute;right:0;left:40px;bottom:${30 + (pct / 100) * 170}px;border-top:1px dashed #ccc;`;
    
    const label = document.createElement('span');
    label.style.cssText = 'position:absolute;left:0;top:-10px;font-size:0.75em;color:#666;width:35px;text-align:center;';
    label.textContent = g;
    line.appendChild(label);
    chartArea.appendChild(line);
  }
  
  // Bars
  values.forEach((val, i) => {
    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;max-width:60px;z-index:1;';
    
    if (showValues) {
      const valLabel = document.createElement('div');
      valLabel.style.cssText = 'font-size:0.8em;font-weight:bold;margin-bottom:2px;';
      valLabel.textContent = val;
      barWrap.appendChild(valLabel);
    }
    
    const bar = document.createElement('div');
    const heightPct = (val / maxVal) * 170;
    bar.style.cssText = `width:36px;background:${colors[i % colors.length]};border-radius:4px 4px 0 0;` +
      `height:${heightPct}px;transition:height 0.5s ease;min-height:4px;`;
    barWrap.appendChild(bar);
    
    const catLabel = document.createElement('div');
    catLabel.style.cssText = 'font-size:0.75em;margin-top:4px;text-align:center;direction:rtl;max-width:60px;word-wrap:break-word;';
    catLabel.textContent = labels[i];
    barWrap.appendChild(catLabel);
    
    chartArea.appendChild(barWrap);
  });
  
  chartDiv.appendChild(chartArea);
  container.appendChild(chartDiv);
}

/**
 * Grouped bar chart renderer.
 * visual.groups: array of group names
 * visual.series: array of { name, values, color }
 */
function renderGroupedBar(container, visual) {
  const { groups, series, title } = visual;
  const allValues = series.flatMap(s => s.values);
  const maxVal = Math.ceil(Math.max(...allValues) * 1.2);
  
  const chartDiv = document.createElement('div');
  chartDiv.style.cssText = 'position:relative;direction:ltr;margin:16px auto;padding:20px;max-width:450px;';
  
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:12px;direction:rtl;';
    titleEl.innerHTML = fixBidi(title);
    chartDiv.appendChild(titleEl);
  }
  
  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;justify-content:center;gap:16px;margin-bottom:8px;direction:rtl;';
  series.forEach(s => {
    const item = document.createElement('span');
    item.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${s.color};border-radius:2px;margin-left:4px;vertical-align:middle;"></span> ${s.name}`;
    item.style.fontSize = '0.85em';
    legend.appendChild(item);
  });
  chartDiv.appendChild(legend);
  
  const chartArea = document.createElement('div');
  chartArea.style.cssText = 'position:relative;height:200px;display:flex;align-items:flex-end;justify-content:space-around;' +
    'padding:0 10px 30px 10px;border-right:2px solid #333;border-bottom:2px solid #333;';
  
  groups.forEach((group, gi) => {
    const groupWrap = document.createElement('div');
    groupWrap.style.cssText = 'display:flex;align-items:flex-end;gap:3px;flex:1;justify-content:center;';
    
    series.forEach(s => {
      const bar = document.createElement('div');
      const heightPct = (s.values[gi] / maxVal) * 170;
      bar.style.cssText = `width:24px;background:${s.color};border-radius:3px 3px 0 0;height:${heightPct}px;min-height:4px;`;
      groupWrap.appendChild(bar);
    });
    
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:5px;font-size:0.75em;text-align:center;direction:rtl;';
    label.textContent = group;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;';
    wrapper.appendChild(groupWrap);
    wrapper.appendChild(label);
    chartArea.appendChild(wrapper);
  });
  
  chartDiv.appendChild(chartArea);
  container.appendChild(chartDiv);
}

/**
 * Pie chart renderer using CSS conic-gradient.
 * visual.slices: array of { label, value, color }
 */
function renderPieChart(container, visual) {
  const { slices, title } = visual;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  
  const pieDiv = document.createElement('div');
  pieDiv.style.cssText = 'margin:16px auto;max-width:350px;text-align:center;direction:rtl;';
  
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight:bold;margin-bottom:12px;font-size:1.05em;';
    titleEl.innerHTML = fixBidi(title);
    pieDiv.appendChild(titleEl);
  }
  
  // Build conic-gradient
  let gradientParts = [];
  let cumPct = 0;
  slices.forEach(s => {
    const pct = (s.value / total) * 100;
    gradientParts.push(`${s.color} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  });
  
  const circle = document.createElement('div');
  circle.style.cssText = `width:180px;height:180px;border-radius:50%;margin:0 auto 16px;` +
    `background:conic-gradient(${gradientParts.join(', ')});box-shadow:0 2px 8px rgba(0,0,0,0.15);`;
  pieDiv.appendChild(circle);
  
  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:8px 16px;';
  slices.forEach(s => {
    const pct = Math.round((s.value / total) * 100);
    const item = document.createElement('span');
    item.style.cssText = 'font-size:0.85em;display:flex;align-items:center;gap:4px;';
    item.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${s.color};border-radius:2px;"></span> ${s.label} (${pct}%)`;
    legend.appendChild(item);
  });
  pieDiv.appendChild(legend);
  
  container.appendChild(pieDiv);
}

/**
 * Data table renderer.
 * visual.headers: array of column header strings
 * visual.rows: array of row arrays
 * visual.title: optional table title
 */
function renderTable(container, visual) {
  const { headers, rows, title } = visual;
  
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin:16px auto;max-width:400px;direction:rtl;';
  
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:8px;';
    titleEl.innerHTML = fixBidi(title);
    wrapper.appendChild(titleEl);
  }
  
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.95em;';
  
  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.style.cssText = 'background:#4ECDC4;color:white;padding:8px 12px;text-align:center;font-weight:bold;';
    th.innerHTML = fixBidi(h);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Data rows
  const tbody = document.createElement('tbody');
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    tr.style.background = ri % 2 === 0 ? '#f8f9fa' : 'white';
    row.forEach(cell => {
      const td = document.createElement('td');
      td.style.cssText = 'padding:8px 12px;text-align:center;border-bottom:1px solid #e0e0e0;';
      td.innerHTML = fixBidi(String(cell));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

/**
 * Pictograph renderer.
 * visual.symbol: the symbol to use (e.g., "⭐")
 * visual.symbolValue: what each symbol represents (e.g., 10)
 * visual.categories: array of { label, count }
 * visual.legend: text describing the symbol meaning
 */
function renderPictograph(container, visual) {
  const { symbol, symbolValue, categories, legend, title } = visual;
  
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin:16px auto;max-width:400px;direction:rtl;';
  
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:8px;';
    titleEl.innerHTML = fixBidi(title);
    wrapper.appendChild(titleEl);
  }
  
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;';
  
  categories.forEach(cat => {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.style.cssText = 'padding:6px 12px;font-weight:bold;white-space:nowrap;border-bottom:1px solid #eee;';
    labelTd.textContent = cat.label;
    tr.appendChild(labelTd);
    
    const symbolTd = document.createElement('td');
    symbolTd.style.cssText = 'padding:6px;font-size:1.3em;direction:ltr;border-bottom:1px solid #eee;';
    const fullSymbols = Math.floor(cat.count / symbolValue);
    const halfRemain = (cat.count % symbolValue) >= (symbolValue / 2);
    symbolTd.textContent = symbol.repeat(fullSymbols) + (halfRemain ? '½' : '');
    tr.appendChild(symbolTd);
    
    table.appendChild(tr);
  });
  
  wrapper.appendChild(table);
  
  if (legend) {
    const legendEl = document.createElement('div');
    legendEl.style.cssText = 'text-align:center;font-size:0.85em;color:#666;margin-top:8px;';
    legendEl.innerHTML = fixBidi(legend);
    wrapper.appendChild(legendEl);
  }
  
  container.appendChild(wrapper);
}

/**
 * SVG geometry renderer.
 * visual.svg: raw SVG string to render
 * (The SVG should be pre-generated by the question generator)
 */
function renderSVGGeometry(container, visual) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin:16px auto;max-width:350px;text-align:center;';
  wrapper.innerHTML = visual.svg;
  
  // Ensure SVG is responsive
  const svg = wrapper.querySelector('svg');
  if (svg) {
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  }
  
  container.appendChild(wrapper);
}


// ============================================================
// 4. PROGRESS TRACKING
// ============================================================

/**
 * Progress manager using localStorage.
 * Key format: `math_progress_{storageKey}_{topicId}`
 * 
 * @param {string} storageKey - Unique prefix for this app instance
 */
class ProgressManager {
  constructor(storageKey = 'math_app') {
    this.storageKey = storageKey;
  }
  
  _key(topicId) {
    return `${this.storageKey}_${topicId}`;
  }
  
  getTopicProgress(topicId) {
    try {
      const data = localStorage.getItem(this._key(topicId));
      return data ? JSON.parse(data) : { correct: 0, total: 0, streak: 0, bestStreak: 0, flagged: [] };
    } catch (e) {
      return { correct: 0, total: 0, streak: 0, bestStreak: 0, flagged: [] };
    }
  }
  
  saveTopicProgress(topicId, progress) {
    try {
      localStorage.setItem(this._key(topicId), JSON.stringify(progress));
    } catch (e) {
      console.warn('Could not save progress:', e);
    }
  }
  
  recordAnswer(topicId, isCorrect) {
    const p = this.getTopicProgress(topicId);
    p.total++;
    if (isCorrect) {
      p.correct++;
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    } else {
      p.streak = 0;
    }
    this.saveTopicProgress(topicId, p);
    return p;
  }
  
  flagQuestion(topicId, questionIndex) {
    const p = this.getTopicProgress(topicId);
    if (!p.flagged.includes(questionIndex)) {
      p.flagged.push(questionIndex);
    }
    this.saveTopicProgress(topicId, p);
  }
  
  unflagQuestion(topicId, questionIndex) {
    const p = this.getTopicProgress(topicId);
    p.flagged = p.flagged.filter(i => i !== questionIndex);
    this.saveTopicProgress(topicId, p);
  }
  
  getAllProgress() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.storageKey + '_')) {
        const topicId = key.substring(this.storageKey.length + 1);
        try {
          result[topicId] = JSON.parse(localStorage.getItem(key));
        } catch (e) {}
      }
    }
    return result;
  }
  
  resetAll() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.storageKey + '_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
  
  getUserName() {
    try {
      return localStorage.getItem(this.storageKey + '_username') || '';
    } catch (e) {
      return '';
    }
  }
  
  setUserName(name) {
    try {
      localStorage.setItem(this.storageKey + '_username', name);
    } catch (e) {}
  }
}


// ============================================================
// 5. CONGRATULATORY MESSAGES
// ============================================================

/**
 * 100+ personalized congratulatory messages in Hebrew.
 * Use {name} placeholder — replaced at runtime with the child's name.
 * 
 * Categorized by enthusiasm level for streak-based selection.
 */
const CONGRATS_MESSAGES = {
  female: {
    normal: [
      "כל הכבוד {name}!",
      "מצוין {name}!",
      "נכון! יופי {name}!",
      "תשובה נכונה!",
      "בדיוק! {name} מדהימה!",
      "יפה מאוד {name}!",
      "נהדר {name}!",
      "את צודקת {name}!",
      "עבודה מצוינת {name}!",
      "את כוכבת {name}!",
      "מושלם!",
      "אין עליך {name}!",
      "את גאונה {name}!",
      "תותחית {name}!",
      "וואו, מהיר ונכון!",
      "בול! תשובה מעולה!",
      "את אלופה {name}!",
      "ראש גדול {name}!",
      "חזק מאוד!",
      "את מדהימה!",
    ],
    streak: [
      "רצף מדהים {name}! 🔥",
      "{name} בלתי ניתנת לעצירה!",
      "שלוש ברצף! {name} על אש!",
      "רצף! {name} שוברת שיאים!",
      "את מכונת חישוב {name}!",
      "אף אחד לא עוצר את {name}!",
      "רצף מטורף!",
      "את לוהטת {name}!",
      "{name} פשוט מעופפת!",
      "רצף ניצחונות! כל הכבוד!",
    ],
    superStreak: [
      "5 ברצף! {name} את מלכת המתמטיקה! 👑",
      "{name} — את פשוט גאונה!",
      "בלתי ייאמן! {name} מוכיחה שהיא הכי חכמה!",
      "את מופלאה {name}! אין מילים!",
      "רצף היסטורי! {name} שוברת את כל השיאים!",
      "{name} את אלופת העולם במתמטיקה!",
      "מדהים! {name} לא טועה!",
      "גאונות טהורה {name}! 🌟",
    ],
    legendary: [
      "10 ברצף!! {name} את אגדה! 🏆",
      "{name} — הפרופסורים יכולים ללמוד ממך!",
      "בלתי נתפס! {name} את בדרך לנובל!",
      "{name} שוברת את כל מה שאפשר לשבור!",
      "אגדת מתמטיקה חיה — {name}! ✨",
    ],
  },
  male: {
    normal: [
      "כל הכבוד {name}!",
      "מצוין {name}!",
      "נכון! יופי {name}!",
      "תשובה נכונה!",
      "בדיוק! {name} מדהים!",
      "יפה מאוד {name}!",
      "נהדר {name}!",
      "אתה צודק {name}!",
      "עבודה מצוינת {name}!",
      "אתה כוכב {name}!",
      "מושלם!",
      "אין עליך {name}!",
      "אתה גאון {name}!",
      "תותח {name}!",
      "וואו, מהיר ונכון!",
      "בול! תשובה מעולה!",
      "אתה אלוף {name}!",
      "ראש גדול {name}!",
      "חזק מאוד!",
      "אתה מדהים!",
    ],
    streak: [
      "רצף מדהים {name}! 🔥",
      "{name} בלתי ניתן לעצירה!",
      "שלוש ברצף! {name} על אש!",
      "רצף! {name} שובר שיאים!",
      "אתה מכונת חישוב {name}!",
      "אף אחד לא עוצר את {name}!",
      "רצף מטורף!",
      "אתה לוהט {name}!",
      "{name} פשוט מעופף!",
      "רצף ניצחונות! כל הכבוד!",
    ],
    superStreak: [
      "5 ברצף! {name} אתה מלך המתמטיקה! 👑",
      "{name} — אתה פשוט גאון!",
      "בלתי ייאמן! {name} מוכיח שהוא הכי חכם!",
      "אתה מופלא {name}! אין מילים!",
      "רצף היסטורי! {name} שובר את כל השיאים!",
      "{name} אתה אלוף העולם במתמטיקה!",
      "מדהים! {name} לא טועה!",
      "גאונות טהורה {name}! 🌟",
    ],
    legendary: [
      "10 ברצף!! {name} אתה אגדה! 🏆",
      "{name} — הפרופסורים יכולים ללמוד ממך!",
      "בלתי נתפס! {name} אתה בדרך לנובל!",
      "{name} שובר את כל מה שאפשר לשבור!",
      "אגדת מתמטיקה חיה — {name}! ✨",
    ],
  },
};

/**
 * Get a congratulatory message based on current streak.
 * @param {string} name - Child's name
 * @param {number} streak - Current correct-answer streak
 * @param {string} gender - 'male' or 'female' (default: 'female')
 * @returns {string} Personalized Hebrew congratulation
 */
function getCongratsMessage(name, streak, gender) {
  const msgs = CONGRATS_MESSAGES[gender === 'male' ? 'male' : 'female'];
  let pool;
  if (streak >= 10) pool = msgs.legendary;
  else if (streak >= 5) pool = msgs.superStreak;
  else if (streak >= 3) pool = msgs.streak;
  else pool = msgs.normal;

  const msg = randChoice(pool);
  return msg.replace(/\{name\}/g, name || '');
}


// ============================================================
// 6. CONFETTI ANIMATION
// ============================================================

/**
 * Launch confetti particles from the center of the screen.
 * Lightweight, CSS-only animation — no dependencies.
 * 
 * @param {number} count - Number of particles (default 30)
 */
function launchConfetti(count = 30) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF9FF3', '#54A0FF'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    const size = randInt(6, 12);
    const color = randChoice(colors);
    const startX = 50 + randInt(-10, 10);
    const startY = 50;
    const endX = randInt(-30, 130);
    const endY = randInt(-20, 40);
    const rotation = randInt(0, 720);
    const duration = 0.8 + Math.random() * 0.6;
    const delay = Math.random() * 0.2;
    
    particle.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${color};` +
      `border-radius:${Math.random() > 0.5 ? '50%' : '2px'};` +
      `left:${startX}%;top:${startY}%;opacity:1;` +
      `animation:confetti-fly ${duration}s ease-out ${delay}s forwards;`;
    
    particle.style.setProperty('--end-x', `${endX - startX}vw`);
    particle.style.setProperty('--end-y', `${endY - startY}vh`);
    particle.style.setProperty('--rotation', `${rotation}deg`);
    
    container.appendChild(particle);
  }
  
  setTimeout(() => container.remove(), 2000);
}

/**
 * Returns the CSS @keyframes rule needed for confetti.
 * Include this in your stylesheet.
 */
function getConfettiCSS() {
  return `
    @keyframes confetti-fly {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
      100% { transform: translate(var(--end-x), var(--end-y)) rotate(var(--rotation)); opacity: 0; }
    }
  `;
}


// ============================================================
// 7. CONTENT LOADING
// ============================================================

/**
 * Load a JSON content file.
 * Works both for local file:// and hosted (GitHub Pages) access.
 * 
 * @param {string} url - Path to JSON file (relative or absolute)
 * @returns {Promise<Object>} Parsed JSON content
 */
async function loadContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error(`Failed to load content from ${url}:`, e);
    return null;
  }
}

/**
 * Load the manifest and return topic metadata.
 * @param {string} manifestUrl - Path to manifest.json
 * @returns {Promise<Object>} Manifest with topics array
 */
async function loadManifest(manifestUrl = '../content/manifest.json') {
  return await loadContent(manifestUrl);
}


// ============================================================
// 8. EXPORTS (for module usage if needed)
// ============================================================

// In a browser context, these are all global.
// If using modules in the future:
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fixBidi, setMixedText, gcd, lcm, randInt, randChoice, shuffle,
    formatFraction, renderVisual, ProgressManager, getCongratsMessage,
    launchConfetti, getConfettiCSS, loadContent, loadManifest,
    CONGRATS_MESSAGES,
  };
}
