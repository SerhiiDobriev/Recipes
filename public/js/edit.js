// Добавление и редактирование рецепта
import { app, refreshRecipes, CATEGORIES } from './state.js';
import { esc, icon, toast, prefs } from './ui.js';
import { parseIngredients, parseRecipeText } from './parse.js';
import { formatQty } from './units.js';
import { preparePhoto, prepareForAI } from './photos.js';
import { uid } from './store.js';
import { parseRecipeWithAI } from './ai.js';
import { ensureApiKey, saveApiKey } from './aikey.js';

const DRAFT_KEY = 'draft-new';

export async function renderEdit(host, id, { paste = false } = {}) {
  const isNew = !id;
  let recipe = isNew ? null : await app.store.getRecipe(id);
  if (!isNew && !recipe) { location.hash = '#/'; return; }
  const draft = isNew ? prefs.get(DRAFT_KEY, null) : null;
  recipe = recipe || {
    id: uid(), title: '', category: '', servings: null, time: '', source: '',
    ingredientsText: '', stepsText: '', notes: '', favorite: false, cover: null,
    ...(draft || {}),
  };
  let newCover = null;          // { file, url } — новое фото, ещё не сохранённое
  let removeCover = false;

  const cats = [...new Set([...CATEGORIES, ...app.recipes.map((r) => r.category).filter(Boolean)])];
  const root = document.createElement('div');
  host.replaceChildren(root);
  root.innerHTML = `
  <div class="page edit-page">
    <header class="top">
      <a class="back" href="${isNew ? '#/' : '#/r/' + esc(id)}">${icon('back')}<span>${isNew ? 'Все рецепты' : 'К рецепту'}</span></a>
      <div class="top-actions"><button class="btn primary small" data-save>Сохранить</button></div>
    </header>

    <h1 class="page-title">${isNew ? 'Новый рецепт' : 'Изменить рецепт'}</h1>

    ${isNew ? `
    <details class="paste-box" ${paste || !draft ? 'open' : ''}>
      <summary>${icon('paste')}<span><b>Вставить рецепт целиком</b><small>Скопируй рецепт с сайта или из заметок — я разложу его по полям</small></span></summary>
      <textarea id="paste-text" rows="8" placeholder="Например:\n\nШарлотка\nНа 6 порций\n\nИнгредиенты:\nЯйца — 4 шт.\nСахар — 1 стакан\nМука — 1 стакан\nЯблоки — 4 шт.\n\nПриготовление:\nВзбить яйца с сахаром...\n"></textarea>
      <div class="paste-actions">
        <label class="btn ghost photo-btn" id="ai-photo-btn">${icon('camera')} Фото из книги
          <input type="file" id="ai-photo" accept="image/*" multiple></label>
        <span class="spacer"></span>
        <button class="btn ghost" type="button" data-ai>${icon('sparkle')} Разобрать с ИИ</button>
        <button class="btn primary" type="button" data-parse>Разложить по полям</button>
      </div>
      <p class="hint paste-hint" id="ai-status">«Разложить по полям» работает бесплатно, даже без интернета. «Разобрать с ИИ» понимает любой текст и фото страниц из книги или тетради, но нужен ключ, и каждый рецепт стоит несколько центов.</p>
    </details>` : ''}

    <form class="edit-form" id="edit-form" novalidate>
      <div class="cover-field">
        <div class="cover-preview" id="cover-preview">${recipe.cover?.thumb ? `<img src="${recipe.cover.thumb}" alt="">` : icon('camera')}</div>
        <div class="cover-actions">
          <label class="btn ghost small photo-btn">${icon('camera')} <span id="cover-label">${recipe.cover ? 'Заменить фото' : 'Добавить фото'}</span>
            <input type="file" id="cover-file" accept="image/*"></label>
          <button type="button" class="link-btn" id="cover-remove" ${recipe.cover ? '' : 'hidden'}>Убрать фото</button>
        </div>
      </div>

      <label class="field"><span>Название</span>
        <input id="f-title" required value="${esc(recipe.title)}" placeholder="Например, Медовик" autocomplete="off"></label>

      <div class="field-row">
        <label class="field"><span>Категория</span>
          <input id="f-category" list="cat-list" value="${esc(recipe.category)}" placeholder="Торты" autocomplete="off">
          <datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field narrow"><span>Порций</span>
          <input id="f-servings" type="number" inputmode="decimal" min="0.5" step="0.5" value="${recipe.servings ?? ''}" placeholder="4"></label>
        <label class="field"><span>Время</span>
          <input id="f-time" value="${esc(recipe.time)}" placeholder="1 ч 30 мин"></label>
      </div>

      <label class="field"><span>Откуда рецепт</span>
        <input id="f-source" value="${esc(recipe.source)}" placeholder="Ссылка на сайт или название книги"></label>

      <div class="field">
        <label for="f-ing"><span>Ингредиенты</span></label>
        <p class="hint">Каждый ингредиент с новой строки: «Мука — 200 г», «2 ст. л. сахара», «Яйца — 3 шт.». Подзаголовок пиши с двоеточием: «Для крема:».</p>
        <div class="ing-editor">
          <textarea id="f-ing" rows="10" placeholder="Мука — 200 г\nСахар — 150 г\nЯйца — 3 шт.\nСоль — щепотка">${esc(recipe.ingredientsText)}</textarea>
          <div class="ing-preview" aria-live="polite">
            <div class="ing-preview-title">Так будут пересчитываться количества</div>
            <ul id="ing-preview"></ul>
          </div>
        </div>
      </div>

      <label class="field"><span>Приготовление</span>
        <textarea id="f-steps" rows="10" placeholder="Каждый шаг с новой строки.\nВзбить яйца с сахаром до пышной пены.\nВсыпать муку и аккуратно перемешать.">${esc(recipe.stepsText)}</textarea></label>

      <label class="field"><span>Мои заметки</span>
        <textarea id="f-notes" class="handwritten" rows="4" placeholder="Что поменять, на что заменить, с чем подавать">${esc(recipe.notes)}</textarea></label>

      <div class="row-end">
        <a class="btn ghost" href="${isNew ? '#/' : '#/r/' + esc(id)}">Отмена</a>
        <button class="btn primary" type="submit">Сохранить рецепт</button>
      </div>
    </form>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const ingInput = $('#f-ing');
  const preview = $('#ing-preview');
  const drawPreview = () => {
    const items = parseIngredients(ingInput.value);
    preview.innerHTML = items.map((it) => {
      if (it.type === 'section') return `<li class="sec">${esc(it.name)}</li>`;
      if (it.qty == null) return `<li class="plain"><span class="q">${esc(it.amountText || '—')}</span><span>${esc(it.name)}</span></li>`;
      return `<li><span class="q">${esc(formatQty(it.qty, it.qtyMax, it.unit))}</span><span>${esc(it.name)}${it.note ? `, ${esc(it.note)}` : ''}</span></li>`;
    }).join('') || '<li class="plain"><span>Пока пусто</span></li>';
  };
  drawPreview();
  ingInput.addEventListener('input', drawPreview);

  const collect = () => ({
    ...recipe,
    title: $('#f-title').value.trim(),
    category: $('#f-category').value.trim(),
    servings: parseFloat($('#f-servings').value.replace(',', '.')) || null,
    time: $('#f-time').value.trim(),
    source: $('#f-source').value.trim(),
    ingredientsText: ingInput.value.replace(/\s+$/, ''),
    stepsText: $('#f-steps').value.replace(/\s+$/, ''),
    notes: $('#f-notes').value.trim(),
  });

  // Черновик нового рецепта, чтобы ничего не потерялось
  if (isNew) {
    root.querySelector('#edit-form').addEventListener('input', () => {
      const { title, category, servings, time, source, ingredientsText, stepsText, notes } = collect();
      prefs.set(DRAFT_KEY, { title, category, servings, time, source, ingredientsText, stepsText, notes });
    });
  }

  // Заполняет поля разобранным рецептом
  const applyParsed = (p) => {
    if (p.title && !$('#f-title').value) $('#f-title').value = p.title;
    if (p.servings && !$('#f-servings').value) $('#f-servings').value = p.servings;
    if (p.time && !$('#f-time').value) $('#f-time').value = p.time;
    ingInput.value = p.ingredientsText;
    $('#f-steps').value = p.stepsText;
    if (p.notes && !$('#f-notes').value) $('#f-notes').value = p.notes;
    drawPreview();
    $('.paste-box').open = false;
    $('#edit-form').dispatchEvent(new Event('input'));
    toast('Готово. Проверь, всё ли встало на место');
    $('#f-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  $('[data-parse]')?.addEventListener('click', () => {
    const text = $('#paste-text').value;
    if (!text.trim()) return toast('Сначала вставь текст рецепта', 'err');
    applyParsed(parseRecipeText(text));
  });

  // Разбор с ИИ: текст из поля и/или фото страниц
  let aiController = null;
  const status = $('#ai-status');
  const statusDefault = status?.innerHTML;
  const runAI = async (files = []) => {
    const text = $('#paste-text').value;
    if (!text.trim() && !files.length) return toast('Вставь текст рецепта или выбери фото', 'err');
    const apiKey = await ensureApiKey();
    if (!apiKey) return;
    const controls = root.querySelectorAll('[data-ai], [data-parse], #ai-photo');
    controls.forEach((c) => (c.disabled = true));
    $('#ai-photo-btn').classList.add('disabled');
    aiController = new AbortController();
    status.innerHTML = `<span class="spinner" aria-hidden="true"></span> ИИ читает ${files.length ? 'фото' : 'рецепт'}… обычно 10–40 секунд. <button type="button" class="link-btn" data-ai-cancel>Отменить</button>`;
    status.classList.add('busy');
    try {
      const images = [];
      for (const f of files) images.push(await prepareForAI(f));
      const p = await parseRecipeWithAI({ apiKey, text, images, signal: aiController.signal });
      if (!p.title && !p.ingredientsText && !p.stepsText) {
        toast('ИИ не нашёл здесь рецепта', 'err');
      } else {
        applyParsed(p);
      }
    } catch (e) {
      console.error(e);
      if (e.code !== 'aborted') toast(e.message || 'Не получилось разобрать рецепт', 'err');
      if (e.code === 'auth') saveApiKey('');
    } finally {
      aiController = null;
      controls.forEach((c) => (c.disabled = false));
      $('#ai-photo-btn').classList.remove('disabled');
      status.innerHTML = statusDefault;
      status.classList.remove('busy');
    }
  };
  $('[data-ai]')?.addEventListener('click', () => runAI());
  $('#ai-photo')?.addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) runAI(files);
  });
  status?.addEventListener('click', (e) => { if (e.target.closest('[data-ai-cancel]')) aiController?.abort(); });

  $('#cover-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    newCover = { file: f, url: URL.createObjectURL(f) };
    removeCover = false;
    $('#cover-preview').innerHTML = `<img src="${newCover.url}" alt="">`;
    $('#cover-label').textContent = 'Заменить фото';
    $('#cover-remove').hidden = false;
  });
  $('#cover-remove').addEventListener('click', () => {
    newCover = null;
    removeCover = true;
    $('#cover-preview').innerHTML = icon('camera');
    $('#cover-label').textContent = 'Добавить фото';
    $('#cover-remove').hidden = true;
  });

  const save = async () => {
    const r = collect();
    if (!r.title) {
      toast('Напиши название рецепта', 'err');
      $('#f-title').focus();
      return;
    }
    const buttons = root.querySelectorAll('[data-save], button[type="submit"]');
    buttons.forEach((b) => (b.disabled = true));
    try {
      const now = new Date().toISOString();
      r.updatedAt = now;
      r.createdAt = r.createdAt || now;
      if (removeCover) r.cover = null;
      if (newCover) {
        const { full, thumb } = await preparePhoto(newCover.file);
        const meta = { id: uid(), recipeId: r.id, entryId: null, thumb, createdAt: now };
        await app.store.putPhoto(meta, full);
        r.cover = { photoId: meta.id, thumb };
      }
      await app.store.putRecipe(r);
      if (isNew) prefs.set(DRAFT_KEY, null);
      await refreshRecipes();
      toast('Рецепт сохранён');
      location.hash = '#/r/' + r.id;
    } catch (e) {
      console.error(e);
      buttons.forEach((b) => (b.disabled = false));
      toast('Не получилось сохранить. Попробуй ещё раз.', 'err');
    }
  };
  $('[data-save]').addEventListener('click', save);
  $('#edit-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
}
