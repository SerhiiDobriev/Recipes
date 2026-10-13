// Ключ API для разбора рецептов с ИИ. Хранится только в браузере этого устройства:
// книжечка открыта без пароля, и ключ на сервере мог бы увидеть кто угодно.
import { esc, openModal, toast, prefs } from './ui.js';

const HOW_TO = `
  <ol class="howto">
    <li>Открой <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> и войди (можно через Google).</li>
    <li>В разделе <b>Billing</b> пополни баланс. $5 хватит примерно на сотню рецептов: один разбор стоит 3–7 центов.</li>
    <li>В разделе <b>API Keys</b> нажми <b>Create Key</b> и скопируй ключ. Он начинается с <code>sk-ant-</code>.</li>
  </ol>`;

export const getApiKey = () => prefs.get('aiKey', '');
export function saveApiKey(key) { prefs.set('aiKey', key.trim()); }

// Возвращает ключ; если его нет — спрашивает. null, если пользователь передумал.
export function ensureApiKey() {
  if (getApiKey()) return Promise.resolve(getApiKey());
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`
      <h2 class="modal-title">Ключ для разбора с ИИ</h2>
      <p class="modal-text">Разбор с ИИ работает через Claude от компании Anthropic. Для этого нужен свой ключ, его делают один раз:</p>
      ${HOW_TO}
      <label class="field"><span>Ключ API</span>
        <input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." autofocus></label>
      <p class="hint">Ключ сохранится только на этом устройстве. На телефоне и компьютере его нужно ввести по разу. Никому его не пересылай.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-close>Отмена</button>
        <button class="btn primary" data-ok>Сохранить ключ</button>
      </div>`, { onClose: () => { if (!done) resolve(null); } });
    m.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const key = m.el.querySelector('#ai-key').value.trim();
      if (!/^sk-ant-/.test(key)) return toast('Ключ должен начинаться с sk-ant-', 'err');
      saveApiKey(key);
      done = true;
      m.close();
      resolve(key);
    });
  });
}

// Блок для экрана настроек
export function aiSettingsHtml() {
  const key = getApiKey();
  return `
    <section class="panel">
      <h2>Разбор с ИИ</h2>
      <p>Кнопка «Разобрать с ИИ» понимает любой текст рецепта и фото страниц из книги или тетради. Один разбор стоит 3–7 центов с твоего баланса в Anthropic. Ключ хранится только на этом устройстве.</p>
      ${key ? `<p>Ключ указан: <code>${esc(key.slice(0, 10))}…${esc(key.slice(-4))}</code></p>
        <div class="row"><button class="btn ghost" data-ai-change>Заменить ключ</button><button class="link-btn danger-text" data-ai-remove>Удалить ключ</button></div>`
      : `<p class="hint">Ключ пока не указан. Его попросят при первом разборе, или можно указать сейчас.</p>
        <div class="row"><button class="btn ghost" data-ai-change>Указать ключ</button></div>`}
    </section>`;
}

export function bindAiSettings(root, rerender) {
  root.querySelector('[data-ai-change]')?.addEventListener('click', async () => {
    const old = getApiKey();
    saveApiKey('');
    const key = await ensureApiKey();
    if (!key) saveApiKey(old);
    else toast('Ключ сохранён');
    rerender();
  });
  root.querySelector('[data-ai-remove]')?.addEventListener('click', async () => {
    saveApiKey('');
    toast('Ключ удалён');
    rerender();
  });
}
