// Моя книжечка — запуск, переходы между экранами, главный экран, настройки.
import { app, setSettings, refreshRecipes } from './state.js';
import { ServerStore, exportAll, importAll, uid } from './store.js';
import { esc, icon, toast, openModal, confirmDialog, saveFile, prefs } from './ui.js';
import { renderRecipe, releaseWakeLock } from './recipe.js';
import { renderEdit } from './edit.js';
import { printOptionsForBook, printBook } from './print.js';
import { DENSITIES, normalizeName } from './units.js';
import { aiSettingsHtml, bindAiSettings } from './aikey.js';

const host = document.getElementById('app');
let installPrompt = null;

// ---------- Запуск ----------

async function boot() {
  try {
    app.store = new ServerStore();
    await app.store.init();
    await loadData();
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div class="page"><div class="empty"><h2>Не получилось открыть книжечку</h2>
      <p>Нет связи с сервером. Проверь интернет и обнови страницу.</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && currentRoute() === 'home') {
      await refreshRecipes();
      route();
    }
  });
  route();
}

async function loadData() {
  setSettings(await app.store.getSettings());
  await refreshRecipes();
}

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('/')[0] || 'home';
}

async function route() {
  releaseWakeLock();
  document.body.classList.remove('modal-open');
  document.getElementById('modal-root').innerHTML = '';
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [name, arg] = parts;
  try {
    switch (name) {
      case 'r': await renderRecipe(host, decodeURIComponent(arg)); break;
      case 'new': await renderEdit(host, null, { paste: arg === 'paste' }); break;
      case 'edit': await renderEdit(host, decodeURIComponent(arg)); break;
      case 'settings': renderSettings(); break;
      case 'book': renderBook(); break;
      default: renderHome();
    }
  } catch (e) {
    console.error(e);
    toast('Что-то пошло не так. Обнови страницу.', 'err');
  }
  window.scrollTo(0, 0);
}

// ---------- Главный экран ----------

let homeFilter = { q: '', cat: prefs.get('cat', 'all') };

function cardHtml(r) {
  const letter = esc((r.title || '?').trim().charAt(0).toUpperCase());
  const meta = [
    r.servings ? `${icon('people')}${esc(String(r.servings).replace('.', ','))}` : '',
    r.time ? `${icon('clock')}${esc(r.time)}` : '',
  ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');
  return `
    <a class="card" href="#/r/${encodeURIComponent(r.id)}">
      <div class="card-img">${r.cover?.thumb ? `<img src="${r.cover.thumb}" alt="" loading="lazy">` : `<span class="card-letter">${letter}</span>`}
        ${r.favorite ? `<span class="card-fav" title="В избранном">${icon('star', 'star')}</span>` : ''}</div>
      <div class="card-body">
        ${r.category ? `<div class="eyebrow">${esc(r.category)}</div>` : ''}
        <h3>${esc(r.title || 'Без названия')}</h3>
        ${meta ? `<div class="card-meta">${meta}</div>` : ''}
      </div>
    </a>`;
}

function renderHome() {
  const recipes = app.recipes;
  const counts = {};
  for (const r of recipes) if (r.category) counts[r.category] = (counts[r.category] || 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'ru'));
  if (homeFilter.cat !== 'all' && homeFilter.cat !== 'fav' && !counts[homeFilter.cat]) homeFilter.cat = 'all';
  const favCount = recipes.filter((r) => r.favorite).length;

  const root = document.createElement('div');
  host.replaceChildren(root);
  root.innerHTML = `
  <div class="page home">
    <header class="top">
      <div class="brand">${icon('book')}<span>Моя книжечка</span></div>
      <div class="top-actions">
        ${recipes.length ? `<a class="iconbtn" href="#/book" title="Распечатать книжечку">${icon('print')}</a>` : ''}
        <a class="iconbtn" href="#/settings" title="Настройки">${icon('settings')}</a>
      </div>
    </header>

    ${recipes.length ? `
    <div class="home-head">
      <h1 class="page-title">Мои рецепты <span class="count">${recipes.length}</span></h1>
      <div class="home-actions">
        <a class="btn ghost" href="#/new/paste">${icon('paste')} Вставить текст</a>
        <a class="btn primary" href="#/new">${icon('plus')} Новый рецепт</a>
      </div>
    </div>
    <div class="search">${icon('search')}<input id="q" type="search" placeholder="Найти рецепт или продукт: «медовик», «творог»" value="${esc(homeFilter.q)}" autocomplete="off"></div>
    <div class="chips" role="tablist">
      <button class="chip ${homeFilter.cat === 'all' ? 'active' : ''}" data-cat="all">Все</button>
      ${favCount ? `<button class="chip ${homeFilter.cat === 'fav' ? 'active' : ''}" data-cat="fav">${icon('star', 'star')} Избранное</button>` : ''}
      ${cats.map((c) => `<button class="chip ${homeFilter.cat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)} <span class="n">${counts[c]}</span></button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>`
    : `
    <section class="welcome">
      <h1>Здесь будет твоя книжечка рецептов</h1>
      <p>Собирай рецепты с сайтов и из книг в одном месте. Пересчитывай на нужное число порций, переводи граммы в ложки, добавляй фото того, что получилось, и печатай.</p>
      <div class="welcome-actions">
        <a class="btn primary big" href="#/new/paste">${icon('paste')} Вставить рецепт текстом</a>
        <a class="btn ghost big" href="#/new">${icon('edit')} Заполнить вручную</a>
      </div>
      <button class="link-btn" data-sample>Добавить пример рецепта, чтобы посмотреть, как всё работает</button>
    </section>`}
  </div>`;

  if (!recipes.length) {
    root.querySelector('[data-sample]').addEventListener('click', addSample);
    return;
  }

  const grid = root.querySelector('#grid');
  const draw = () => {
    const q = normalizeName(homeFilter.q.trim());
    const list = recipes.filter((r) => {
      if (homeFilter.cat === 'fav' && !r.favorite) return false;
      if (homeFilter.cat !== 'all' && homeFilter.cat !== 'fav' && r.category !== homeFilter.cat) return false;
      if (!q) return true;
      return normalizeName([r.title, r.category, r.ingredientsText, r.notes].join(' ')).includes(q);
    });
    grid.innerHTML = list.map(cardHtml).join('') || `<p class="muted grid-empty">Ничего не нашлось. Попробуй другое слово.</p>`;
  };
  draw();

  root.querySelector('#q').addEventListener('input', (e) => { homeFilter.q = e.target.value; draw(); });
  root.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    homeFilter.cat = b.dataset.cat;
    prefs.set('cat', homeFilter.cat);
    root.querySelectorAll('.chips .chip').forEach((c) => c.classList.toggle('active', c === b));
    draw();
  });
}

async function addSample() {
  const r = {
    id: uid(),
    title: 'Шарлотка с яблоками (пример)',
    category: 'Выпечка',
    servings: 6,
    time: '1 ч',
    source: 'Пример: можно удалить',
    ingredientsText: 'Для теста:\nЯйца — 4 шт.\nСахар — 200 г\nМука — 1 стакан\nРазрыхлитель — 1 ч. л.\nВанильный сахар — 1 пакетик\nСоль — щепотка\nДля начинки:\nЯблоки кислые — 4–5 шт.\nКорица — ½ ч. л.\nСливочное масло — 20 г, для формы',
    stepsText: 'Разогреть духовку до 180 °C. Смазать форму маслом.\nЯблоки очистить от семян и нарезать дольками, посыпать корицей.\nЯйца взбить с сахаром и солью до светлой пышной пены, 5–7 минут.\nВсыпать муку с разрыхлителем и ванильным сахаром, аккуратно перемешать лопаткой снизу вверх.\nВыложить яблоки в форму, залить тестом.\nВыпекать 35–40 минут до сухой шпажки. Остудить в форме 10 минут.',
    notes: 'Это пример. Попробуй поменять порции и переключить «Граммы / Ложки» над ингредиентами.',
    favorite: false,
    cover: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await app.store.putRecipe(r);
  await refreshRecipes();
  location.hash = '#/r/' + r.id;
}

// ---------- Печать книжечки ----------

function renderBook() {
  const recipes = app.recipes;
  const form = printOptionsForBook();
  const root = document.createElement('div');
  host.replaceChildren(root);
  root.innerHTML = `
  <div class="page book-page">
    <header class="top"><a class="back" href="#/">${icon('back')}<span>Все рецепты</span></a></header>
    <h1 class="page-title">Печать книжечки</h1>
    <p class="lead">Отметь рецепты, которые хочешь распечатать. Каждый начнётся с новой страницы, в том порядке, как в списке.</p>
    <div class="book-grid">
      <section class="panel">
        <div class="section-head">
          <h2>Рецепты</h2>
          <div><button class="link-btn" data-all>Выбрать все</button> · <button class="link-btn" data-none>Снять все</button></div>
        </div>
        <ul class="pick-list">${recipes.map((r) => `
          <li><label class="check"><input type="checkbox" value="${esc(r.id)}" checked>
            <span>${esc(r.title)}</span>${r.category ? `<small>${esc(r.category)}</small>` : ''}</label></li>`).join('')}</ul>
      </section>
      <section class="panel">
        <h2>Как печатать</h2>
        ${form.html}
        <button class="btn primary big full" data-go>${icon('print')} Печать <span id="book-n"></span></button>
      </section>
    </div>
  </div>`;
  const boxes = [...root.querySelectorAll('.pick-list input')];
  const upd = () => { root.querySelector('#book-n').textContent = `(${boxes.filter((b) => b.checked).length})`; };
  upd();
  root.querySelector('.pick-list').addEventListener('change', upd);
  root.querySelector('[data-all]').addEventListener('click', () => { boxes.forEach((b) => (b.checked = true)); upd(); });
  root.querySelector('[data-none]').addEventListener('click', () => { boxes.forEach((b) => (b.checked = false)); upd(); });
  root.querySelector('[data-go]').addEventListener('click', async () => {
    const ids = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
    if (!ids.size) return toast('Отметь хотя бы один рецепт', 'err');
    try { await printBook(recipes.filter((r) => ids.has(r.id)), form.read(root)); }
    catch (e) { console.error(e); toast('Не получилось подготовить печать', 'err'); }
  });
}

// ---------- Настройки ----------

function renderSettings() {
  const s = app.settings;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const rows = DENSITIES.map((d) => {
    const o = s.densityOverrides?.[d.name] || {};
    const v = (k) => o[k] ?? d[k] ?? '';
    return `<tr data-name="${esc(d.name)}"><th scope="row">${esc(d.name)}</th>
      <td><input inputmode="decimal" data-k="cup" value="${v('cup')}" aria-label="${esc(d.name)}, граммов в стакане"></td>
      <td><input inputmode="decimal" data-k="tbsp" value="${v('tbsp')}" aria-label="${esc(d.name)}, граммов в столовой ложке"></td>
      <td><input inputmode="decimal" data-k="tsp" value="${v('tsp')}" aria-label="${esc(d.name)}, граммов в чайной ложке"></td></tr>`;
  }).join('');
  const customRows = (s.customDensities || []).map((c, i) => `
    <tr data-custom="${i}"><th scope="row"><input data-k="name" value="${esc(c.name)}" aria-label="Название продукта"></th>
      <td><input inputmode="decimal" data-k="cup" value="${c.cup ?? ''}" aria-label="Граммов в стакане"></td>
      <td><input inputmode="decimal" data-k="tbsp" value="${c.tbsp ?? ''}" aria-label="Граммов в столовой ложке"></td>
      <td><input inputmode="decimal" data-k="tsp" value="${c.tsp ?? ''}" aria-label="Граммов в чайной ложке"></td>
      <td><button class="iconbtn small" data-del-custom="${i}" title="Удалить">${icon('close')}</button></td></tr>`).join('');

  const root = document.createElement('div');
  host.replaceChildren(root);
  root.innerHTML = `
  <div class="page settings-page">
    <header class="top"><a class="back" href="#/">${icon('back')}<span>Все рецепты</span></a></header>
    <h1 class="page-title">Настройки</h1>

    <section class="panel">
      <h2>Где хранятся рецепты</h2>
      <p>На сервере книжечки, поэтому рецепты одинаковые на всех устройствах. Каждый день сервер сам делает резервную копию.</p>
      <p class="hint">Книжечка открыта без пароля: кто знает адрес, может смотреть и менять рецепты. Поисковики её не показывают.</p>
    </section>

    ${!standalone ? `
    <section class="panel">
      <h2>Иконка на телефоне</h2>
      ${installPrompt ? `<p>Книжечку можно поставить как обычное приложение: со своей иконкой и без адресной строки.</p>
        <button class="btn primary" data-install>Установить на этот телефон</button>`
      : isIOS ? '<p>На iPhone: открой книжечку в Safari, нажми «Поделиться» (квадрат со стрелкой) и выбери «На экран „Домой“».</p>'
      : '<p>На Android: открой книжечку в Chrome, нажми ⋮ в правом верхнем углу и выбери «Добавить на главный экран» или «Установить приложение».</p>'}
    </section>` : ''}

    ${aiSettingsHtml()}

    <section class="panel">
      <h2>Размер стакана</h2>
      <div class="seg" role="radiogroup" aria-label="Размер стакана">
        <label><input type="radio" name="cup" value="250" ${s.cupMl !== 200 ? 'checked' : ''}><span>250 мл — обычный чайный</span></label>
        <label><input type="radio" name="cup" value="200" ${s.cupMl === 200 ? 'checked' : ''}><span>200 мл — гранёный</span></label>
      </div>
      <p class="hint">В старых книгах чаще гранёный стакан (200 мл), на сайтах обычно 250 мл.</p>
    </section>

    <section class="panel">
      <h2>Таблица мер</h2>
      <p class="hint">Сколько граммов продукта в стакане (250 мл), столовой и чайной ложке. Для сыпучих продуктов это ложка с небольшой горкой. Если у тебя другие ложки, поправь цифры, и пересчёт будет точнее.</p>
      <div class="table-wrap">
        <table class="measures" id="measures">
          <thead><tr><th>Продукт</th><th>Стакан, г</th><th>Ст. л., г</th><th>Ч. л., г</th><th></th></tr></thead>
          <tbody>${customRows}${rows}</tbody>
        </table>
      </div>
      <div class="row">
        <button class="btn ghost" data-add-custom>${icon('plus')} Добавить свой продукт</button>
        <button class="link-btn" data-reset-measures>Вернуть исходные цифры</button>
      </div>
    </section>

    <section class="panel">
      <h2>Резервная копия</h2>
      <p>Файл со всеми рецептами, заметками и фото. Его можно хранить на компьютере или в облачном диске и загрузить обратно.</p>
      <div class="row">
        <button class="btn ghost" data-export>${icon('download')} Сохранить копию</button>
        <label class="btn ghost">${icon('upload')} Загрузить из копии<input type="file" id="import-file" accept=".json,application/json" hidden></label>
      </div>
    </section>
  </div>`;

  const persist = async () => {
    await app.store.putSettings(app.settings);
    setSettings(app.settings);
  };

  root.querySelectorAll('input[name="cup"]').forEach((r) => r.addEventListener('change', async () => {
    app.settings.cupMl = +r.value;
    await persist();
    toast('Размер стакана сохранён');
  }));

  const table = root.querySelector('#measures');
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  table.addEventListener('change', async (e) => {
    const input = e.target.closest('input');
    if (!input) return;
    const tr = input.closest('tr');
    const k = input.dataset.k;
    if (tr.dataset.name) {
      const name = tr.dataset.name;
      const o = { ...(app.settings.densityOverrides?.[name] || {}) };
      o[k] = num(input.value);
      app.settings.densityOverrides = { ...(app.settings.densityOverrides || {}), [name]: o };
    } else {
      const i = +tr.dataset.custom;
      const list = [...(app.settings.customDensities || [])];
      list[i] = { ...list[i], [k]: k === 'name' ? input.value.trim() : num(input.value) };
      if (k === 'name') list[i].word = input.value.trim().split(/\s+/)[0];
      app.settings.customDensities = list;
    }
    await persist();
    toast('Сохранено');
  });
  table.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-custom]');
    if (!b) return;
    const list = [...(app.settings.customDensities || [])];
    list.splice(+b.dataset.delCustom, 1);
    app.settings.customDensities = list;
    await persist();
    renderSettings();
  });
  root.querySelector('[data-add-custom]').addEventListener('click', () => {
    const m = openModal(`
      <h2 class="modal-title">Свой продукт</h2>
      <label class="field"><span>Название</span><input id="c-name" placeholder="Например, рисовая мука" autofocus></label>
      <div class="field-row">
        <label class="field"><span>Стакан, г</span><input id="c-cup" inputmode="decimal"></label>
        <label class="field"><span>Ст. л., г</span><input id="c-tbsp" inputmode="decimal"></label>
        <label class="field"><span>Ч. л., г</span><input id="c-tsp" inputmode="decimal"></label>
      </div>
      <p class="hint">Продукт узнаётся по первому слову названия. Свои продукты проверяются раньше встроенных.</p>
      <div class="modal-actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-ok>Добавить</button></div>`);
    m.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const name = m.el.querySelector('#c-name').value.trim();
      if (!name) return toast('Напиши название продукта', 'err');
      const item = { name, word: name.split(/\s+/)[0], cup: num(m.el.querySelector('#c-cup').value), tbsp: num(m.el.querySelector('#c-tbsp').value), tsp: num(m.el.querySelector('#c-tsp').value) };
      app.settings.customDensities = [item, ...(app.settings.customDensities || [])];
      await persist();
      m.close();
      renderSettings();
      toast('Продукт добавлен');
    });
  });
  root.querySelector('[data-reset-measures]').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Вернуть исходные цифры?', text: 'Твои правки во встроенной таблице сбросятся. Свои продукты останутся.', ok: 'Вернуть', danger: false }))) return;
    app.settings.densityOverrides = {};
    await persist();
    renderSettings();
  });

  root.querySelector('[data-export]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const data = await exportAll(app.store);
      const d = new Date().toISOString().slice(0, 10);
      saveFile(`moya-knizhechka-${d}.json`, JSON.stringify(data));
      toast(`Сохранено рецептов: ${data.recipes.length}`);
    } catch (err) { console.error(err); toast('Не получилось сохранить копию', 'err'); }
    b.disabled = false;
  });
  root.querySelector('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const ok = await confirmDialog({ title: 'Загрузить рецепты из копии?', text: `В файле рецептов: ${data.recipes?.length ?? 0}. Они добавятся к текущим, а те, что уже загружались из этой копии, обновятся.`, ok: 'Загрузить', danger: false });
      if (!ok) return;
      const n = await importAll(app.store, data);
      await refreshRecipes();
      toast(`Загружено рецептов: ${n}`);
    } catch (err) { console.error(err); toast(err.message || 'Не получилось прочитать файл', 'err'); }
    e.target.value = '';
  });

  root.querySelector('[data-install]')?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderSettings();
  });
  bindAiSettings(root, renderSettings);
}

// ---------- Установка и офлайн ----------

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
