// Разбор текста рецепта: строки ингредиентов и рецепт, вставленный целиком.
import { NUM, toNumber, matchUnit } from './units.js';

const BULLET = /^\s*(?:[-–—•*·▪●◦✓✔]|\d+[.)](?!\d))\s*/;
const QTY_RE = new RegExp('(^|[\\s:—–\\-(])(' + NUM + ')(?:\\s*(?:-|–|—|до)\\s*(' + NUM + '))?', 'g');

// ---------- Числа словами ----------
// «два яйца» → «2 яйца», «полстакана» → «0,5 стакана», «полторы ложки» → «1,5 ложки»

const L = '[а-яё]';
const WORD_NUMBERS = [
  ['полтора|полторы', '1,5'],
  ['половина|половину|половинка|половинку', '0,5'],
  ['четверть', '1/4'],
  ['треть', '1/3'],
  ['один|одна|одно|одну', '1'],
  ['два|две|пара|пару', '2'],
  ['три', '3'],
  ['четыре', '4'],
  ['пять', '5'],
  ['шесть', '6'],
  ['семь', '7'],
  ['восемь', '8'],
  ['девять', '9'],
  ['десять', '10'],
  ['дюжина|дюжину', '12'],
].map(([w, n]) => [new RegExp(`(^|[^а-яё])(?:${w})(?!${L})`, 'gi'), n]);

// «пол» слитно или через дефис перед мерой: полстакана, пол-литра, пол чайной ложки
const HALF = new RegExp(`(^|[^а-яё])пол(?:\\s|-)?(?=(?:стакан|ложк|чайн|столов|литр|килограмм|кило|банк|пачк|упаковк|пакет|плитк|лимон|луковиц|головк|кочан|батон|буханк|ст\\.|ч\\.|кг|л(?!${L})))`, 'gi');

export function wordsToNumbers(s) {
  let out = s.replace(/(^|[^а-яё])полкило(?![а-яё])/gi, '$10,5 кг').replace(HALF, '$10,5 ');
  for (const [re, n] of WORD_NUMBERS) out = out.replace(re, `$1${n}`);
  return out;
}

const clean = (s) => s.replace(/^[\s:—–\-,;.]+/, '').replace(/[\s:—–\-,;]+$/, '').trim();

// «Мука — 200 г», «200 г муки», «Соль по вкусу», «Для крема:»
export function parseIngredient(raw) {
  let s = wordsToNumbers(raw.trim().replace(/^\s*[-–—•*·▪●◦✓✔]\s*/, ''));
  if (!s) return null;
  QTY_RE.lastIndex = 0;
  const hasQty = QTY_RE.test(s);
  if (/[:：]\s*$/.test(s) && !hasQty) return { type: 'section', name: s.replace(/[:：]\s*$/, '').trim() };

  QTY_RE.lastIndex = 0;
  let m;
  while ((m = QTY_RE.exec(s))) {
    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    const after = s.slice(end);
    const u = matchUnit(after);
    const tail = u ? after.slice(u.len) : after;
    const atStart = start === 0;
    const endsHere = /^\s*[.,;)]?\s*$/.test(after);
    const followedByNote = /^\s*[,(]/.test(after);
    // «1 сорта», «33%», «C1» — это часть названия, а не количество
    if (!atStart && !u && !endsHere && !followedByNote) continue;
    if (atStart && !u && /^\s*%/.test(after)) continue;
    const qty = toNumber(m[2]);
    const qtyMax = m[3] ? toNumber(m[3]) : null;
    if (isNaN(qty)) continue;
    if (atStart) {
      return { type: 'item', qty, qtyMax, unit: u?.unit || null, name: clean(tail), note: '' };
    }
    return { type: 'item', qty, qtyMax, unit: u?.unit || null, name: clean(s.slice(0, start)), note: clean(tail) };
  }
  // Мера без числа в начале: «стакан муки», «щепотка соли» = 1
  const lead = matchUnit(s);
  if (lead && clean(s.slice(lead.len))) return { type: 'item', qty: 1, qtyMax: null, unit: lead.unit, name: clean(s.slice(lead.len)), note: '' };
  // Без числа: «Соль — щепотка», «Перец по вкусу» — количество просто текстом
  const soft = s.match(/^(.+?)\s+(по вкусу|на кончике ножа|по желанию|для подачи|для смазывания|для жарки)$/i)
    || s.match(/^(.+?)\s*(?:\s[—–-]|:)\s+(.+)$/);
  if (soft) {
    // «Соль — щепотка» = 1 щепотка, тогда её тоже можно умножать
    const u = matchUnit(soft[2]);
    if (u && !clean(soft[2].slice(u.len))) return { type: 'item', qty: 1, qtyMax: null, unit: u.unit, name: clean(soft[1]), note: '' };
    return { type: 'item', qty: null, qtyMax: null, unit: null, name: clean(soft[1]), note: '', amountText: clean(soft[2]) };
  }
  return { type: 'item', qty: null, qtyMax: null, unit: null, name: s, note: '' };
}

export function parseIngredients(text) {
  return (text || '').split('\n').map(parseIngredient).filter(Boolean);
}

// Шаги: каждая непустая строка — отдельный шаг, нумерацию убираем
export function parseSteps(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(шаг\s*)?\d+\s*[.):]?$/i.test(l))
    .map((l) => l.replace(/^шаг\s*\d+\s*[.):—–-]?\s*/i, '').replace(BULLET, '').trim())
    .filter(Boolean);
}

// ---------- Рецепт целиком ----------

const ING_HDR = /^(ингредиенты|состав|продукты|понадобится|вам понадобится|нам понадобится|что нужно|что понадобится|ingredients)(?![а-яa-z])/i;
const STEP_HDR = /^(приготовление|способ приготовления|как приготовить|как готовить|пошаговый рецепт|рецепт приготовления|инструкция приготовления|инструкция|шаги приготовления|шаги|ход приготовления|directions|instructions|method)(?![а-яa-z])/i;
const NOTE_HDR = /^(примечани|совет|заметк|хитрост|секрет|важно)/i;
const JUNK = /ккал|калорийн|белки|жиры|углевод|добавить в|в корзину|поделиться|реклама|подписат|комментари|в избранное|распечатать|сохранить рецепт|показать ещё|оценк|рейтинг|просмотр/i;

const isHeader = (line, re) => re.test(line) && line.length < 60;

function looksLikeQtyOnly(line) {
  const p = parseIngredient(line);
  return p && p.type === 'item' && p.qty != null && !p.name && !p.note
    || /^(по вкусу|на кончике ножа|щепотка|для подачи|для смазывания|по желанию)$/i.test(line.trim());
}

function looksLikeIngredient(line) {
  if (/по вкусу|на кончике ножа|для подачи|для смазывания|по желанию/i.test(line) && line.length < 70) return true;
  const p = parseIngredient(line);
  if (p?.type === 'section') return true;
  return p?.type === 'item' && p.qty != null && (p.unit || line.length < 50) && line.length < 90;
}

export function parseRecipeText(text) {
  const out = { title: '', servings: null, time: '', ingredientsText: '', stepsText: '', notes: '' };
  const all = (text || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n').map((l) => l.trim());

  const sv = (text || '').match(/(?:порци[йия]|количество порций|персон|выход)\s*[:\-–—]?\s*(\d{1,2})(?!\d)/i)
    || (text || '').match(/(?:^|[^\d])(\d{1,2})\s*(?:порци|персон)/i);
  if (sv) out.servings = +sv[1];
  const tm = (text || '').match(/(?:время приготовления|время готовки|время)\s*[:\-–—]?\s*([^\n]{1,30})/i);
  if (tm) out.time = tm[1].trim();

  const meta = (l) => /^(порци|количество порций|персон|выход|время приготовления|время готовки|время|сложность|кухня)/i.test(l);
  const lines = all.filter((l) => !(l.length < 60 && JUNK.test(l)));

  // Название — первая содержательная строка
  let i = 0;
  while (i < lines.length && (!lines[i] || meta(lines[i]))) i++;
  if (i < lines.length && !isHeader(lines[i], ING_HDR) && !isHeader(lines[i], STEP_HDR) && lines[i].length < 120) {
    out.title = lines[i].replace(/[.:]$/, '');
    i++;
  }
  const rest = lines.slice(i);

  const ing = [], steps = [], notes = [];
  const hasHeaders = rest.some((l) => isHeader(l, ING_HDR) || isHeader(l, STEP_HDR));

  if (hasHeaders) {
    let section = 'pre';
    for (const l of rest) {
      if (!l) continue;
      if (isHeader(l, ING_HDR)) { section = 'ing'; continue; }
      if (isHeader(l, STEP_HDR)) { section = 'steps'; continue; }
      if (NOTE_HDR.test(l) && section === 'steps' && (l.length < 40 || /^[^:]{0,20}:/.test(l))) {
        section = 'notes';
        // «Совет: дайте торту пропитаться» — текст после двоеточия тоже заметка
        const after = l.includes(':') ? l.slice(l.indexOf(':') + 1).trim() : '';
        if (after) notes.push(after);
        continue;
      }
      if (meta(l)) continue;
      if (section === 'ing') ing.push(l);
      else if (section === 'steps') steps.push(l);
      else if (section === 'notes') notes.push(l);
      else if (looksLikeIngredient(l)) ing.push(l);
      else notes.push(l);
    }
  } else {
    // Без заголовков: короткие строки с количеством — ингредиенты, длинные — шаги
    let inSteps = false;
    for (const l of rest) {
      if (!l || meta(l)) continue;
      if (!inSteps && (looksLikeIngredient(l) || (looksLikeQtyOnly(l) && ing.length))) ing.push(l);
      else if (!inSteps && l.length < 45 && !/[.!]$/.test(l) && !steps.length) ing.push(l);
      else { inSteps = true; steps.push(l); }
    }
  }

  // Сайты часто ставят количество отдельной строкой: «Мука» / «200 г»
  const merged = [];
  for (const l of ing) {
    const prev = merged[merged.length - 1];
    if (prev && looksLikeQtyOnly(l) && parseIngredient(prev)?.qty == null && !/[:：]$/.test(prev)) {
      merged[merged.length - 1] = `${prev} — ${l}`;
    } else merged.push(l.replace(/^\s*[-–—•*·▪●◦✓✔]\s*/, ''));
  }

  out.ingredientsText = merged.join('\n');
  out.stepsText = parseSteps(steps.join('\n')).join('\n');
  out.notes = notes.join('\n');
  return out;
}
