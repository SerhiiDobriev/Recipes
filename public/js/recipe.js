// Экран рецепта: порции, единицы, шаги, заметки, журнал с фото.
import { app, recipeUi, refreshRecipes } from './state.js';
import { esc, icon, toast, openModal, confirmDialog, formatDate, todayISO, prefs } from './ui.js';
import { parseIngredients, parseSteps } from './parse.js';
import { presentAmount } from './units.js';
import { preparePhoto } from './photos.js';
import { printRecipeDialog } from './print.js';
import { uid } from './store.js';

let wakeLock = null;
export function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

const servingsWord = (n) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (Math.round(n) !== n) return 'порции';
  if (a > 10 && a < 20) return 'порций';
  if (b === 1) return 'порция';
  if (b >= 2 && b <= 4) return 'порции';
  return 'порций';
};

const fmtServ = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function sourceHtml(src) {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) {
    let host = src;
    try { host = new URL(src).hostname.replace(/^www\./, ''); } catch { /* оставим как есть */ }
    return `<a class="meta-item" href="${esc(src)}" target="_blank" rel="noopener">${icon('link')}${esc(host)}</a>`;
  }
  return `<span class="meta-item">${icon('book')}${esc(src)}</span>`;
}

export async function renderRecipe(host, id) {
  const recipe = await app.store.getRecipe(id);
  const root = document.createElement('div');
  host.replaceChildren(root);
  const rerender = async () => { const y = window.scrollY; await renderRecipe(host, id); window.scrollTo(0, y); };
  if (!recipe) {
    root.innerHTML = `<div class="page"><a class="back" href="#/">${icon('back')} Все рецепты</a><div class="empty"><h2>Рецепт не найден</h2><p>Возможно, его удалили.</p></div></div>`;
    return;
  }
  const ui = recipeUi(id);
  const base = recipe.servings || 1;
  if (ui.servings == null) ui.servings = base;
  let mode = prefs.get('unitMode', 'orig');

  const ingredients = parseIngredients(recipe.ingredientsText);
  const steps = parseSteps(recipe.stepsText);

  root.innerHTML = `
  <div class="page recipe-page">
    <header class="top">
      <a class="back" href="#/">${icon('back')}<span>Все рецепты</span></a>
      <div class="top-actions">
        <button class="iconbtn ${recipe.favorite ? 'on' : ''}" data-act="fav" title="Избранное" aria-pressed="${!!recipe.favorite}">${icon('star', 'star')}</button>
        <button class="iconbtn" data-act="wake" title="Не гасить экран, пока готовлю" aria-pressed="${!!wakeLock}">${icon('sun')}</button>
        <button class="iconbtn" data-act="print" title="Распечатать">${icon('print')}</button>
        <a class="iconbtn" href="#/edit/${esc(id)}" title="Изменить">${icon('edit')}</a>
      </div>
    </header>

    <div class="recipe-head ${recipe.cover?.thumb ? 'has-cover' : ''}">
      ${recipe.cover?.thumb ? `<button class="cover" data-photo="${esc(recipe.cover.photoId)}"><img src="${recipe.cover.thumb}" alt="${esc(recipe.title)}"></button>` : ''}
      <div class="titles">
        ${recipe.category ? `<div class="eyebrow">${esc(recipe.category)}</div>` : ''}
        <h1 class="recipe-title">${esc(recipe.title || 'Без названия')}</h1>
        <div class="meta">
          ${recipe.time ? `<span class="meta-item">${icon('clock')}${esc(recipe.time)}</span>` : ''}
          ${sourceHtml(recipe.source)}
        </div>
      </div>
    </div>

    <div class="recipe-grid">
      <section class="panel ingredients" aria-labelledby="h-ing">
        <h2 id="h-ing">Ингредиенты</h2>
        <div class="servings">
          <div class="stepper" role="group" aria-label="Количество порций">
            <button class="round" data-act="minus" aria-label="Меньше порций">${icon('minus')}</button>
            <div class="serv-value"><output id="serv-out">${fmtServ(ui.servings)}</output><span id="serv-word">${servingsWord(ui.servings)}</span></div>
            <button class="round" data-act="plus" aria-label="Больше порций">${icon('plus')}</button>
          </div>
          <div class="quick">
            <button class="chip" data-mult="0.5">×½</button>
            <button class="chip" data-mult="2">×2</button>
            <button class="chip" data-mult="3">×3</button>
            <button class="chip ghost" data-act="reset" id="serv-reset">как в рецепте: ${fmtServ(base)}</button>
          </div>
          ${recipe.servings ? '' : '<p class="hint">В рецепте не указано число порций, поэтому считаем его за 1. Его можно указать в редакторе.</p>'}
        </div>
        <div class="seg units" role="radiogroup" aria-label="Единицы">
          <label><input type="radio" name="unitmode" value="orig" ${mode === 'orig' ? 'checked' : ''}><span>Как в рецепте</span></label>
          <label><input type="radio" name="unitmode" value="metric" ${mode === 'metric' ? 'checked' : ''}><span>Граммы</span></label>
          <label><input type="radio" name="unitmode" value="spoons" ${mode === 'spoons' ? 'checked' : ''}><span>Ложки</span></label>
        </div>
        <ul class="ing-list" id="ing-list"></ul>
      </section>

      <section class="panel steps" aria-labelledby="h-steps">
        <h2 id="h-steps">Приготовление</h2>
        ${steps.length ? `<ol class="step-list">${steps.map((s, i) => `
          <li class="${ui.checkedSteps.has(i) ? 'done' : ''}" data-step="${i}"><span class="step-n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol>
          <p class="hint">Нажми на шаг, чтобы отметить его сделанным.</p>`
          : '<p class="muted">Шаги не записаны.</p>'}
      </section>
    </div>

    ${recipe.notes ? `<section class="notes-paper" aria-label="Мои заметки"><h2>Мои заметки</h2><p>${esc(recipe.notes).replace(/\n/g, '<br>')}</p></section>` : ''}

    <section class="journal" aria-labelledby="h-journal">
      <div class="section-head">
        <h2 id="h-journal">Как получилось</h2>
        <button class="btn primary small" data-act="entry">${icon('camera')} Добавить запись</button>
      </div>
      <div id="journal-list" class="journal-list"><p class="muted">Загружаю…</p></div>
    </section>

    <div class="danger-zone"><button class="btn ghost danger-text" data-act="delete">${icon('trash')} Удалить рецепт</button></div>
  </div>`;

  const list = root.querySelector('#ing-list');
  const drawIngredients = () => {
    const factor = ui.servings / base;
    list.innerHTML = ingredients.map((it, i) => {
      if (it.type === 'section') return `<li class="ing-sec">${esc(it.name)}</li>`;
      const a = presentAmount(it, factor, mode, app.ctx);
      return `<li class="ing ${ui.checkedIng.has(i) ? 'done' : ''}" data-ing="${i}">
        <span class="amt ${a.converted ? 'conv' : ''}">${esc(a.text)}</span>
        <span class="nm">${esc(it.name || '')}${it.note ? `<span class="note">, ${esc(it.note)}</span>` : ''}${a.hint ? `<span class="alt">≈ ${esc(a.hint)}</span>` : ''}</span>
      </li>`;
    }).join('') || '<li class="muted">Ингредиенты не записаны.</li>';
    root.querySelector('#serv-out').textContent = fmtServ(ui.servings);
    root.querySelector('#serv-word').textContent = servingsWord(ui.servings);
    root.querySelector('#serv-reset').classList.toggle('active', ui.servings === base);
  };
  drawIngredients();

  const setServings = (v) => {
    ui.servings = Math.max(0.25, Math.round(v * 100) / 100);
    drawIngredients();
  };

  root.querySelectorAll('input[name="unitmode"]').forEach((r) => r.addEventListener('change', () => {
    mode = r.value;
    prefs.set('unitMode', mode);
    drawIngredients();
  }));

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act], [data-mult], [data-ing], [data-step], [data-photo]');
    if (!t) return;
    if (t.dataset.mult) return setServings(ui.servings * +t.dataset.mult);
    if (t.dataset.ing != null) {
      const i = +t.dataset.ing;
      ui.checkedIng.has(i) ? ui.checkedIng.delete(i) : ui.checkedIng.add(i);
      return t.classList.toggle('done');
    }
    if (t.dataset.step != null) {
      const i = +t.dataset.step;
      ui.checkedSteps.has(i) ? ui.checkedSteps.delete(i) : ui.checkedSteps.add(i);
      return t.classList.toggle('done');
    }
    if (t.dataset.photo) return openPhoto(t.dataset.photo, recipe, rerender);
    switch (t.dataset.act) {
      case 'minus': return setServings(ui.servings > 1 ? Math.ceil(ui.servings) - 1 : ui.servings / 2);
      case 'plus': return setServings(ui.servings < 1 ? 1 : Math.floor(ui.servings) + 1);
      case 'reset': return setServings(base);
      case 'fav': {
        recipe.favorite = !recipe.favorite;
        t.classList.toggle('on', recipe.favorite);
        t.setAttribute('aria-pressed', recipe.favorite);
        await app.store.putRecipe(recipe);
        refreshRecipes();
        return toast(recipe.favorite ? 'Добавлено в избранное' : 'Убрано из избранного');
      }
      case 'wake': {
        if (wakeLock) { releaseWakeLock(); t.setAttribute('aria-pressed', 'false'); return toast('Экран снова гаснет как обычно'); }
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; t.setAttribute('aria-pressed', 'false'); });
          t.setAttribute('aria-pressed', 'true');
          toast('Экран не будет гаснуть, пока открыт рецепт');
        } catch { toast('Этот браузер не умеет держать экран включённым', 'err'); }
        return;
      }
      case 'print': return printRecipeDialog(recipe, { servings: ui.servings, mode });
      case 'entry': return entryDialog(recipe, null, rerender);
      case 'delete': {
        const ok = await confirmDialog({ title: 'Удалить рецепт?', text: `«${recipe.title}» удалится вместе с фото и записями. Вернуть его будет нельзя.` });
        if (!ok) return;
        await app.store.deleteRecipe(id);
        await refreshRecipes();
        toast('Рецепт удалён');
        location.hash = '#/';
        return;
      }
      case 'edit-entry': {
        const entries = await app.store.listEntries(id);
        return entryDialog(recipe, entries.find((x) => x.id === t.dataset.id), rerender);
      }
    }
  });

  drawJournal(root.querySelector('#journal-list'), recipe);
}

async function drawJournal(el, recipe) {
  const [entries, photos] = await Promise.all([app.store.listEntries(recipe.id), app.store.listPhotos(recipe.id)]);
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const loose = photos.filter((p) => !p.entryId || !entries.some((e) => e.id === p.entryId));
  if (!entries.length && !loose.length) {
    el.innerHTML = `<div class="journal-empty">
      <p>Здесь будут фото того, что получилось, и заметки к каждому разу: «в следующий раз меньше сахара», «печь на 5 минут дольше».</p>
    </div>`;
    return;
  }
  const thumbs = (list) => list.length ? `<div class="thumbs">${list.map((p) => `
      <button class="thumb" data-photo="${esc(p.id)}" aria-label="Открыть фото"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
  el.innerHTML = entries.map((e) => `
    <article class="entry">
      <div class="entry-date">${esc(formatDate(e.date))}</div>
      <div class="entry-body">
        ${e.text ? `<p class="entry-text">${esc(e.text).replace(/\n/g, '<br>')}</p>` : ''}
        ${thumbs(photos.filter((p) => p.entryId === e.id))}
        <button class="link-btn" data-act="edit-entry" data-id="${esc(e.id)}">Изменить</button>
      </div>
    </article>`).join('') + (loose.length ? `
    <article class="entry">
      <div class="entry-date">Фото рецепта</div>
      <div class="entry-body">${thumbs(loose)}</div>
    </article>` : '');
}

// Добавление и правка записи «Как получилось»
function entryDialog(recipe, entry, onDone) {
  const isNew = !entry;
  entry = entry || { id: uid(), recipeId: recipe.id, date: todayISO(), text: '', createdAt: new Date().toISOString() };
  const m = openModal(`
    <h2 class="modal-title">${isNew ? 'Как получилось' : 'Изменить запись'}</h2>
    <label class="field"><span>Дата</span><input type="date" id="en-date" value="${esc(entry.date)}"></label>
    <label class="field"><span>Заметка</span>
      <textarea id="en-text" rows="4" placeholder="Например: получилось очень нежно, в следующий раз сахара на 30 г меньше">${esc(entry.text)}</textarea></label>
    <div class="field">
      <span>Фото</span>
      <label class="photo-pick">${icon('camera')}<span>Сфотографировать или выбрать</span>
        <input type="file" id="en-files" accept="image/*" multiple></label>
      <div class="thumbs" id="en-preview"></div>
    </div>
    <div class="modal-actions">
      ${isNew ? '' : `<button class="btn ghost danger-text" data-del>${icon('trash')} Удалить</button>`}
      <span class="spacer"></span>
      <button class="btn ghost" data-close>Отмена</button>
      <button class="btn primary" data-save>Сохранить</button>
    </div>`);
  const files = [];
  const preview = m.el.querySelector('#en-preview');
  m.el.querySelector('#en-files').addEventListener('change', (e) => {
    for (const f of e.target.files) {
      files.push(f);
      const url = URL.createObjectURL(f);
      preview.insertAdjacentHTML('beforeend', `<span class="thumb"><img src="${url}" alt=""></span>`);
    }
    e.target.value = '';
  });
  m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    m.close();
    if (!(await confirmDialog({ title: 'Удалить запись?', text: 'Запись и её фото удалятся.' }))) return;
    await app.store.deleteEntry(entry.id);
    if (recipe.cover?.photoId && !(await app.store.listPhotos(recipe.id)).some((p) => p.id === recipe.cover.photoId)) {
      recipe.cover = null;
      await app.store.putRecipe(recipe);
    }
    toast('Запись удалена');
    onDone();
  });
  m.el.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = files.length ? 'Сохраняю фото…' : 'Сохраняю…';
    try {
      entry.date = m.el.querySelector('#en-date').value || todayISO();
      entry.text = m.el.querySelector('#en-text').value.trim();
      await app.store.putEntry(entry);
      let first = null;
      for (const f of files) {
        const { full, thumb } = await preparePhoto(f);
        const meta = { id: uid(), recipeId: recipe.id, entryId: entry.id, thumb, createdAt: new Date().toISOString() };
        await app.store.putPhoto(meta, full);
        first = first || meta;
      }
      if (first && !recipe.cover) {
        recipe.cover = { photoId: first.id, thumb: first.thumb };
        await app.store.putRecipe(recipe);
        refreshRecipes();
      }
      m.close();
      toast('Запись сохранена');
      onDone();
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.textContent = 'Сохранить';
      toast('Не получилось сохранить. Проверь интернет и попробуй ещё раз.', 'err');
    }
  });
}

// Просмотр фото крупно
async function openPhoto(photoId, recipe, onChange) {
  const m = openModal(`
    <div class="lightbox"><div class="lb-img"><p class="muted">Загружаю фото…</p></div>
      <div class="modal-actions">
        <button class="btn ghost danger-text" data-del>${icon('trash')} Удалить фото</button>
        <span class="spacer"></span>
        ${recipe.cover?.photoId === photoId ? '' : '<button class="btn ghost" data-cover>Сделать обложкой</button>'}
        <button class="btn primary" data-close>Закрыть</button>
      </div></div>`, { wide: true });
  const photos = await app.store.listPhotos(recipe.id);
  const meta = photos.find((p) => p.id === photoId);
  const full = (await app.store.getPhotoFull(photoId)) || meta?.thumb || recipe.cover?.thumb;
  m.el.querySelector('.lb-img').innerHTML = full ? `<img src="${full}" alt="">` : '<p class="muted">Фото не найдено.</p>';
  m.el.querySelector('[data-cover]')?.addEventListener('click', async () => {
    if (!meta) return;
    recipe.cover = { photoId: meta.id, thumb: meta.thumb };
    await app.store.putRecipe(recipe);
    refreshRecipes();
    m.close();
    toast('Обложка обновлена');
    onChange();
  });
  m.el.querySelector('[data-del]').addEventListener('click', async () => {
    m.close();
    if (!(await confirmDialog({ title: 'Удалить фото?', text: 'Фото удалится насовсем.' }))) return;
    await app.store.deletePhoto(photoId);
    if (recipe.cover?.photoId === photoId) {
      const left = (await app.store.listPhotos(recipe.id))[0];
      recipe.cover = left ? { photoId: left.id, thumb: left.thumb } : null;
      await app.store.putRecipe(recipe);
      refreshRecipes();
    }
    toast('Фото удалено');
    onChange();
  });
}
