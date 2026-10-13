// Печать: один рецепт или «книжечка» из нескольких, формат А4 или А5.
import { app } from './state.js';
import { esc, formatDate, openModal, prefs, toast } from './ui.js';
import { parseIngredients, parseSteps } from './parse.js';
import { presentAmount } from './units.js';

function setPageSize(format) {
  let el = document.getElementById('page-size');
  if (!el) {
    el = document.createElement('style');
    el.id = 'page-size';
    document.head.appendChild(el);
  }
  el.textContent = format === 'A5'
    ? '@page { size: A5 portrait; margin: 11mm 11mm 12mm; }'
    : '@page { size: A4 portrait; margin: 15mm 16mm 16mm; }';
}

function ingredientsHtml(recipe, factor, mode) {
  return parseIngredients(recipe.ingredientsText).map((it) => {
    if (it.type === 'section') return `<li class="p-sec">${esc(it.name)}</li>`;
    const a = presentAmount(it, factor, mode, app.ctx);
    return `<li><span class="p-amt">${esc(a.text)}</span><span class="p-nm">${esc(it.name)}${it.note ? `, ${esc(it.note)}` : ''}</span></li>`;
  }).join('');
}

async function recipeHtml(recipe, opts, number) {
  const base = recipe.servings || 1;
  const servings = opts.servingsFor?.(recipe) ?? base;
  const factor = servings / base;
  const steps = parseSteps(recipe.stepsText);
  let photo = '';
  if (opts.photo && recipe.cover?.photoId) {
    const full = (await app.store.getPhotoFull(recipe.cover.photoId).catch(() => null)) || recipe.cover.thumb;
    if (full) photo = `<img class="p-photo" src="${full}" alt="">`;
  }
  let journal = '';
  if (opts.journal) {
    const entries = (await app.store.listEntries(recipe.id)).filter((e) => e.text).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (entries.length) journal = `<div class="p-block"><h3>Как получилось</h3>${entries.map((e) => `<p class="p-entry"><b>${esc(formatDate(e.date))}</b> — ${esc(e.text)}</p>`).join('')}</div>`;
  }
  const meta = [
    recipe.servings || servings !== base ? `${servings} ${servings === 1 ? 'порция' : servings < 5 ? 'порции' : 'порций'}` : '',
    recipe.time ? `Время: ${esc(recipe.time)}` : '',
  ].filter(Boolean).join(' · ');
  const source = recipe.source ? `<div class="p-source">Источник: ${esc(recipe.source)}</div>` : '';
  return `
    <article class="p-recipe">
      <header class="p-head">
        ${number ? `<div class="p-num">№ ${number}</div>` : ''}
        ${recipe.category ? `<div class="p-cat">${esc(recipe.category)}</div>` : ''}
        <h1>${esc(recipe.title || 'Без названия')}</h1>
        ${meta ? `<div class="p-meta">${meta}</div>` : ''}
      </header>
      ${photo}
      <div class="p-cols">
        <div class="p-ing"><h3>Ингредиенты</h3><ul>${ingredientsHtml(recipe, factor, opts.mode)}</ul></div>
        <div class="p-steps"><h3>Приготовление</h3><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      </div>
      ${opts.notes && recipe.notes ? `<div class="p-block p-notes"><h3>Мои заметки</h3><p>${esc(recipe.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
      ${journal}
      ${source}
    </article>`;
}

async function runPrint(recipes, opts) {
  const root = document.getElementById('print-root');
  setPageSize(opts.format);
  root.className = 'print-' + opts.format.toLowerCase();
  let html = '';
  if (opts.cover && recipes.length > 1) {
    html += `<section class="p-cover"><div class="p-cover-mark">Мои рецепты</div>
      <ol class="p-toc">${recipes.map((r, i) => `<li><span>№ ${i + 1}</span> ${esc(r.title)}</li>`).join('')}</ol></section>`;
  }
  for (let i = 0; i < recipes.length; i++) html += await recipeHtml(recipes[i], opts, recipes.length > 1 ? i + 1 : 0);
  root.innerHTML = html;
  await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  window.print();
}

function optionsForm(prefix, { many = false } = {}) {
  const p = prefs.get('print', { format: 'A4', photo: true, notes: true, journal: false, cover: true });
  return {
    html: `
      <fieldset class="field">
        <legend>Формат листа</legend>
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="${prefix}fmt" value="A4" ${p.format === 'A4' ? 'checked' : ''}><span>А4 — обычный лист</span></label>
          <label><input type="radio" name="${prefix}fmt" value="A5" ${p.format === 'A5' ? 'checked' : ''}><span>А5 — для книжечки</span></label>
        </div>
        <p class="hint">Для А5 два рецепта помещаются на один лист А4: в окне печати выбери «Страниц на листе: 2», потом разрежь или сложи лист пополам.</p>
      </fieldset>
      <div class="checks">
        <label class="check"><input type="checkbox" id="${prefix}photo" ${p.photo ? 'checked' : ''}> Фото блюда</label>
        <label class="check"><input type="checkbox" id="${prefix}notes" ${p.notes ? 'checked' : ''}> Мои заметки</label>
        <label class="check"><input type="checkbox" id="${prefix}journal" ${p.journal ? 'checked' : ''}> Записи «Как получилось»</label>
        ${many ? `<label class="check"><input type="checkbox" id="${prefix}cover" ${p.cover ? 'checked' : ''}> Обложка с оглавлением</label>` : ''}
      </div>`,
    read(el) {
      const o = {
        format: el.querySelector(`input[name="${prefix}fmt"]:checked`)?.value || 'A4',
        photo: el.querySelector(`#${prefix}photo`).checked,
        notes: el.querySelector(`#${prefix}notes`).checked,
        journal: el.querySelector(`#${prefix}journal`).checked,
        cover: many ? el.querySelector(`#${prefix}cover`).checked : p.cover,
      };
      prefs.set('print', o);
      return o;
    },
  };
}

// Печать одного рецепта — с теми порциями и единицами, что сейчас на экране
export function printRecipeDialog(recipe, { servings, mode }) {
  const form = optionsForm('pr-');
  const m = openModal(`
    <h2 class="modal-title">Печать рецепта</h2>
    <p class="modal-text">«${esc(recipe.title)}» напечатается так же, как сейчас на экране: на ${esc(String(servings).replace('.', ','))} ${servings === 1 ? 'порцию' : servings < 5 ? 'порции' : 'порций'} и в выбранных единицах.</p>
    ${form.html}
    <div class="modal-actions">
      <button class="btn ghost" data-close>Отмена</button>
      <button class="btn primary" data-go>Печать</button>
    </div>`);
  m.el.querySelector('[data-go]').addEventListener('click', async () => {
    const o = form.read(m.el);
    m.close();
    try { await runPrint([recipe], { ...o, mode, servingsFor: () => servings }); }
    catch (e) { console.error(e); toast('Не получилось подготовить печать', 'err'); }
  });
}

export function printOptionsForBook() { return optionsForm('bk-', { many: true }); }

export async function printBook(recipes, o) {
  await runPrint(recipes, { ...o, mode: 'orig' });
}
