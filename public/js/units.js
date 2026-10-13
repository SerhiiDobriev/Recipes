// Единицы измерения, таблица мер (сколько граммов в ложке/стакане),
// пересчёт порций и форматирование количеств по-русски.

export const UNITS = {
  g:      { forms: ['г', 'г', 'г'], kind: 'mass', factor: 1 },
  kg:     { forms: ['кг', 'кг', 'кг'], kind: 'mass', factor: 1000 },
  ml:     { forms: ['мл', 'мл', 'мл'], kind: 'vol', factor: 1 },
  l:      { forms: ['л', 'л', 'л'], kind: 'vol', factor: 1000 },
  tsp:    { forms: ['ч. л.', 'ч. л.', 'ч. л.'], kind: 'spoon', ml: 5 },
  tbsp:   { forms: ['ст. л.', 'ст. л.', 'ст. л.'], kind: 'spoon', ml: 15 },
  cup:    { forms: ['стакан', 'стакана', 'стаканов'], kind: 'spoon' },
  pcs:    { forms: ['шт.', 'шт.', 'шт.'], kind: 'count' },
  clove:  { forms: ['зубчик', 'зубчика', 'зубчиков'], kind: 'count' },
  pinch:  { forms: ['щепотка', 'щепотки', 'щепоток'], kind: 'count' },
  bunch:  { forms: ['пучок', 'пучка', 'пучков'], kind: 'count' },
  sachet: { forms: ['пакетик', 'пакетика', 'пакетиков'], kind: 'count' },
  pack:   { forms: ['упаковка', 'упаковки', 'упаковок'], kind: 'count' },
  brick:  { forms: ['пачка', 'пачки', 'пачек'], kind: 'count' },
  can:    { forms: ['банка', 'банки', 'банок'], kind: 'count' },
  slice:  { forms: ['ломтик', 'ломтика', 'ломтиков'], kind: 'count' },
  sprig:  { forms: ['веточка', 'веточки', 'веточек'], kind: 'count' },
};

// Граница слова для кириллицы (\b в JS её не понимает)
const B = '(?=$|[\\s.,;:()\\-–—/])';

const UNIT_PATTERNS = [
  ['kg', 'кг|килограмм(?:а|ов)?|kg'],
  ['g', 'грамм(?:а|ов)?|гр|г|g|gr'],
  ['ml', 'миллилитр(?:а|ов)?|мл|ml'],
  ['l', 'литр(?:а|ов)?|л|l'],
  ['tsp', 'чайн(?:ая|ые|ых|ой|ую)\\s+ложк(?:а|и|ек|у)|ч\\.?\\s?ложк(?:а|и|ек|у)|ч\\.?\\s?л|tsp|teaspoons?'],
  ['tbsp', 'столов(?:ая|ые|ых|ой|ую)\\s+ложк(?:а|и|ек|у)|ст\\.?\\s?ложк(?:а|и|ек|у)|ст\\.?\\s?л|tbsp|tablespoons?'],
  ['cup', 'стакан(?:а|ов)?|стак|cups?'],
  ['pcs', 'штук(?:а|и)?|шт|pcs'],
  ['clove', 'зубчик(?:а|ов)?|зубч|зуб'],
  ['pinch', 'щепотк(?:а|и|у)|щепоток|щеп'],
  ['bunch', 'пучок|пучка|пучков|пуч'],
  ['sachet', 'пакетик(?:а|ов)?|пакет(?:а|ов)?|пак'],
  ['pack', 'упаковк(?:а|и|у)|упаковок|уп'],
  ['brick', 'пачк(?:а|и|у)|пачек'],
  ['can', 'банк(?:а|и|у)|банок'],
  ['slice', 'ломтик(?:а|ов)?|ломт'],
  ['sprig', 'веточк(?:а|и|у)|веточек|ветк(?:а|и|у)'],
].map(([key, p]) => [key, new RegExp('^(?:' + p + ')\\.?' + B, 'i')]);

export function matchUnit(s) {
  const t = s.replace(/^\s+/, '');
  const skipped = s.length - t.length;
  for (const [key, re] of UNIT_PATTERNS) {
    const m = t.match(re);
    if (m) return { unit: key, len: skipped + m[0].length };
  }
  return null;
}

// ---------- Числа ----------

const FRAC_CHARS = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
export const NUM = '(?:\\d+(?:[.,]\\d+)?\\s?[½¼¾⅓⅔⅛]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[½¼¾⅓⅔⅛])';

export function toNumber(s) {
  s = s.trim();
  if (FRAC_CHARS[s] != null) return FRAC_CHARS[s];
  let m;
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s?([½¼¾⅓⅔⅛])$/))) return parseFloat(m[1].replace(',', '.')) + FRAC_CHARS[m[2]];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s.replace(',', '.'));
}

const GLYPH = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];

// Дроби для ложек, стаканов, штук: 1½, ¾, 2⅓
function fraction(v, minStep) {
  let whole = Math.floor(v);
  let rest = v - whole;
  const allowed = GLYPH.filter(([f]) => {
    if (f === 0 || f === 1) return true;
    if (minStep === 1 / 2) return f === 1 / 2;
    if (minStep === 1 / 4) return [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4].includes(f);
    return true;
  });
  let best = allowed[0];
  for (const g of allowed) if (Math.abs(g[0] - rest) < Math.abs(best[0] - rest)) best = g;
  if (best[0] === 1) { whole += 1; best = [0, '']; }
  if (whole === 0 && !best[1]) return GLYPH.find(([f]) => f === minStep)?.[1] || '¼';
  return (whole ? String(whole) : '') + best[1];
}

function decimal(v, digits) {
  const p = Math.pow(10, digits);
  return String(Math.round(v * p) / p).replace('.', ',');
}

function roundMetric(v) {
  if (v >= 100) return Math.round(v / 5) * 5;
  if (v >= 20) return Math.round(v);
  return Math.round(v * 2) / 2;
}

export function formatNumber(v, unit) {
  if (v == null || isNaN(v)) return '';
  const kind = UNITS[unit]?.kind;
  if (unit === 'g' || unit === 'ml') return decimal(roundMetric(v), 1);
  if (unit === 'kg' || unit === 'l') return decimal(v, 2);
  if (unit === 'tsp') return fraction(v, v < 1 ? 1 / 8 : 1 / 4);
  if (kind === 'spoon') return fraction(v, 1 / 4);
  if (kind === 'count') return fraction(v, v < 1 ? 1 / 4 : 1 / 2);
  // без единицы (яйца, лимоны): целые и половинки
  if (v >= 10) return String(Math.round(v));
  return fraction(v, v < 1 ? 1 / 4 : 1 / 2);
}

function plural(n, forms) {
  if (Math.round(n) !== n) return forms[1];
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

function unitLabel(value, unit) {
  const u = UNITS[unit];
  if (!u) return '';
  return plural(value, u.forms);
}

// Число после округления — для правильного окончания («1 стакан», «1½ стакана»)
function displayedValue(text) {
  let total = 0;
  const m = text.match(/^(\d+)?([⅛¼⅓⅜½⅝⅔¾⅞])?$/);
  if (m) {
    if (m[1]) total += +m[1];
    if (m[2]) total += FRAC_CHARS[m[2]] ?? 0.5;
    return total;
  }
  return parseFloat(text.replace(',', '.'));
}

export function formatQty(q, qMax, unit) {
  const a = formatNumber(q, unit);
  const b = qMax != null ? formatNumber(qMax, unit) : null;
  const num = b && b !== a ? `${a}–${b}` : a;
  const label = unit ? unitLabel(displayedValue(b && b !== a ? b : a), unit) : '';
  return label ? `${num} ${label}` : num;
}

// ---------- Таблица мер ----------
// Граммы на стакан 250 мл, на столовую ложку и на чайную.
// Для сыпучих — ложка «с небольшой горкой», как в привычных кулинарных таблицах.

export const DENSITIES = [
  { name: 'Сахарная пудра', re: /сахарн\S*\s+пудр|пудр\S*\s+сахар|^пудр/, cup: 180, tbsp: 25, tsp: 10 },
  { name: 'Ванильный сахар', re: /ванил/, cup: null, tbsp: 12, tsp: 4 },
  { name: 'Сахар', re: /сахар/, cup: 200, tbsp: 25, tsp: 10 },
  { name: 'Мука', re: /мук/, cup: 160, tbsp: 25, tsp: 10 },
  { name: 'Крахмал', re: /крахмал/, cup: 200, tbsp: 30, tsp: 10 },
  { name: 'Какао-порошок', re: /какао/, cup: 130, tbsp: 20, tsp: 7 },
  { name: 'Разрыхлитель', re: /разрыхлит/, cup: null, tbsp: 12, tsp: 4 },
  { name: 'Сода', re: /(^|[^а-я])сод[аыуе]?(?![а-я])/, cup: null, tbsp: 22, tsp: 7 },
  { name: 'Соль', re: /(^|[^а-я])сол[ьи](?![а-я])/, cup: 325, tbsp: 30, tsp: 10 },
  { name: 'Дрожжи сухие', re: /сух\S*\s+дрожж|дрожж\S*\s+сух/, cup: null, tbsp: 9, tsp: 3 },
  { name: 'Желатин', re: /желатин/, cup: null, tbsp: 15, tsp: 5 },
  { name: 'Корица молотая', re: /кориц/, cup: null, tbsp: 8, tsp: 3 },
  { name: 'Манная крупа', re: /манк|манн/, cup: 200, tbsp: 25, tsp: 8 },
  { name: 'Рис', re: /(^|[^а-я])рис[аеу]?(?![а-я])/, cup: 230, tbsp: 25, tsp: 8 },
  { name: 'Гречка', re: /греч/, cup: 210, tbsp: 25, tsp: 8 },
  { name: 'Овсяные хлопья', re: /овсян|геркулес/, cup: 90, tbsp: 12, tsp: 4 },
  { name: 'Масло растительное', re: /(растительн|подсолнечн|оливков|кукурузн|рапсов)\S*\s+масл|масл\S*\s+(растительн|подсолнечн|оливков|кукурузн)/, cup: 230, tbsp: 17, tsp: 5, liquid: true },
  { name: 'Масло сливочное', re: /масл/, cup: 240, tbsp: 20, tsp: 5, spoonsOnly: true },
  { name: 'Маргарин', re: /маргарин/, cup: 230, tbsp: 15, tsp: 4, spoonsOnly: true },
  { name: 'Мёд', re: /(^|[^а-я])мед[аоуе]?(?![а-я])/, cup: 330, tbsp: 30, tsp: 10 },
  { name: 'Сгущённое молоко', re: /сгущ/, cup: 300, tbsp: 30, tsp: 12 },
  { name: 'Сметана', re: /сметан/, cup: 250, tbsp: 25, tsp: 10 },
  { name: 'Майонез', re: /майонез/, cup: 250, tbsp: 25, tsp: 10 },
  { name: 'Йогурт', re: /йогурт/, cup: 250, tbsp: 20, tsp: 7 },
  { name: 'Сливки', re: /сливк|сливок/, cup: 250, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Молоко', re: /молок/, cup: 255, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Кефир', re: /кефир|ряженк|простокваш|айран/, cup: 250, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Вода', re: /(^|[^а-я])вод[аыуе]?(?![а-я])|кипят/, cup: 250, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Сок', re: /(^|[^а-я])сок[а]?(?![а-я])/, cup: 250, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Уксус', re: /уксус/, cup: 250, tbsp: 15, tsp: 5, liquid: true },
  { name: 'Соевый соус', re: /соев/, cup: 270, tbsp: 18, tsp: 6, liquid: true },
  { name: 'Томатная паста', re: /томатн\S*\s+паст/, cup: 300, tbsp: 30, tsp: 10 },
  { name: 'Кетчуп', re: /кетчуп/, cup: 270, tbsp: 25, tsp: 8 },
  { name: 'Орехи рубленые', re: /орех|миндал|фундук|арахис|кешью/, cup: 140, tbsp: 15, tsp: 5 },
  { name: 'Изюм', re: /изюм/, cup: 190, tbsp: 25, tsp: 7 },
  { name: 'Мак', re: /(^|[^а-я])мак[аи]?(?![а-я])/, cup: 155, tbsp: 15, tsp: 5 },
  { name: 'Кокосовая стружка', re: /кокос/, cup: 85, tbsp: 10, tsp: 3 },
  { name: 'Панировочные сухари', re: /сухар/, cup: 125, tbsp: 15, tsp: 5 },
];

export function normalizeName(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е');
}

// Основа слова: «мука» → «мук», «корица» → «кориц»
export function stem(word) {
  let w = normalizeName(word).trim();
  if (w.length > 4) w = w.replace(/[аеиоуыэюяйь]+$/, '');
  return w;
}

// ctx = { cupMl, overrides: {name: {cup,tbsp,tsp}}, custom: [{name, word, cup, tbsp, tsp, liquid}] }
export function findDensity(name, ctx) {
  const n = normalizeName(name);
  if (!n) return null;
  for (const c of ctx.custom || []) {
    const s = stem(c.word || c.name);
    if (s && n.includes(s)) return c;
  }
  for (const d of DENSITIES) {
    if (d.re.test(n)) {
      const o = ctx.overrides?.[d.name];
      return o ? { ...d, ...o } : d;
    }
  }
  return null;
}

function gramsPer(d, unit, cupMl) {
  if (!d) return null;
  if (unit === 'tbsp') return d.tbsp || (d.tsp ? d.tsp * 3 : d.cup ? d.cup / 250 * 15 : null);
  if (unit === 'tsp') return d.tsp || (d.tbsp ? d.tbsp / 3 : d.cup ? d.cup / 250 * 5 : null);
  if (unit === 'cup') return d.cup ? d.cup * cupMl / 250 : null;
  if (unit === 'ml') return d.cup ? d.cup / 250 : d.tbsp ? d.tbsp / 15 : null;
  return null;
}

function toGrams(qty, unit, d, cupMl) {
  if (unit === 'g') return qty;
  if (unit === 'kg') return qty * 1000;
  if (unit === 'l') return toGrams(qty * 1000, 'ml', d, cupMl);
  const per = gramsPer(d, unit, cupMl);
  return per ? qty * per : null;
}

function toMl(qty, unit, cupMl) {
  if (unit === 'ml') return qty;
  if (unit === 'l') return qty * 1000;
  if (unit === 'tbsp') return qty * 15;
  if (unit === 'tsp') return qty * 5;
  if (unit === 'cup') return qty * cupMl;
  return null;
}

function metricOut(qty, unit) {
  if (unit === 'g' && qty >= 2000) return { qty: qty / 1000, unit: 'kg' };
  if (unit === 'ml' && qty >= 2000) return { qty: qty / 1000, unit: 'l' };
  return { qty, unit };
}

// Перевод в граммы (для жидкостей — в миллилитры)
function toMetric(qty, unit, name, ctx) {
  const kind = UNITS[unit]?.kind;
  if (kind === 'mass' || kind === 'vol') return null;
  if (kind !== 'spoon') return null;
  const d = findDensity(name, ctx);
  if (d?.liquid) return metricOut(toMl(qty, unit, ctx.cupMl), 'ml');
  const g = toGrams(qty, unit, d, ctx.cupMl);
  return g != null ? metricOut(g, 'g') : null;
}

// Перевод в ложки и стаканы
function toSpoons(qty, unit, name, ctx) {
  const kind = UNITS[unit]?.kind;
  if (kind !== 'mass' && kind !== 'vol') return null;
  const d = findDensity(name, ctx);
  let cups, tbsp, tsp;
  if (kind === 'vol') {
    const ml = toMl(qty, unit, ctx.cupMl);
    cups = ml / ctx.cupMl; tbsp = ml / 15; tsp = ml / 5;
  } else {
    if (!d) return null;
    const g = toGrams(qty, unit, d, ctx.cupMl);
    const pc = gramsPer(d, 'cup', ctx.cupMl), pT = gramsPer(d, 'tbsp', ctx.cupMl), pt = gramsPer(d, 'tsp', ctx.cupMl);
    cups = pc ? g / pc : null; tbsp = pT ? g / pT : null; tsp = pt ? g / pt : null;
  }
  if (cups != null && cups >= 0.75 && !d?.spoonsOnly) return { qty: cups, unit: 'cup' };
  if (tbsp != null && tbsp >= 0.9) return { qty: tbsp, unit: 'tbsp' };
  if (tsp != null) return { qty: tsp, unit: 'tsp' };
  if (tbsp != null) return { qty: tbsp, unit: 'tbsp' };
  return null;
}

// Готовая строка количества для показа: учитывает порции и выбранный режим
// mode: 'orig' | 'metric' | 'spoons'
export function presentAmount(item, factor, mode, ctx) {
  if (item.qty == null) return { text: item.amountText || '', hint: '' };
  const q = item.qty * factor;
  const qMax = item.qtyMax != null ? item.qtyMax * factor : null;
  const unit = item.unit;
  const conv = (fn) => {
    const a = fn(q, unit, item.name, ctx);
    if (!a) return null;
    const ratio = a.qty / q;
    return formatQty(a.qty, qMax != null ? qMax * ratio : null, a.unit);
  };
  const original = formatQty(q, qMax, unit);
  if (mode === 'metric') {
    const c = conv(toMetric);
    return c ? { text: c, hint: '', converted: true } : { text: original, hint: '' };
  }
  if (mode === 'spoons') {
    const c = conv(toSpoons);
    return c ? { text: c, hint: '', converted: true } : { text: original, hint: '' };
  }
  const hint = conv(toSpoons) || conv(toMetric) || '';
  return { text: original, hint: hint && hint !== original ? hint : '' };
}

export function densityContext(settings) {
  return {
    cupMl: settings?.cupMl || 250,
    overrides: settings?.densityOverrides || {},
    custom: settings?.customDensities || [],
  };
}
