// Разбор рецепта с помощью Claude: сложный текст или фото страницы из книги.
// Нужен свой ключ API (Настройки → «Разбор с ИИ»). Каждый разбор стоит несколько центов.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.129.0/+esm';
const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'number', description: 'Число порций, 0 если не указано' },
    time: { type: 'string', description: 'Время приготовления как в рецепте, пустая строка если нет' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['title', 'servings', 'time', 'ingredients', 'steps', 'notes'],
  additionalProperties: false,
};

const SYSTEM = `Ты помогаешь вести домашнюю книгу рецептов. Тебе дают рецепт: текст, скопированный с сайта, или фото страницы из книги или тетради. Извлеки из него рецепт.

Правила:
- Пиши по-русски. Если рецепт на другом языке, переведи его.
- ingredients: один ингредиент в строке, в формате «Название — количество единица», например «Мука — 200 г», «Сахар — 1,5 стакана», «Яйца — 3 шт.», «Соль — по вкусу».
- Количество всегда цифрами: «2», «1,5», «1/2». Слова «два», «полстакана», «полторы» переводи в цифры.
- Единицы пиши так: г, кг, мл, л, ст. л., ч. л., стакан, шт., зубчик, щепотка, пучок, пачка, упаковка. Унции и фунты переведи в граммы, американскую cup пиши как «стакан».
- Если ингредиенты разбиты на группы (тесто, крем), перед группой поставь отдельную строку-подзаголовок с двоеточием, например «Для крема:».
- steps: каждый шаг отдельной строкой, без номеров. Не сокращай и не пересказывай шаги, сохрани температуры, время и важные подробности.
- notes: советы и примечания автора, если они есть. Иначе пустая строка.
- Ничего не придумывай. Если чего-то нет в рецепте, оставь пустым (servings = 0).
- Если на фото не видно рецепта, верни пустое название и пустые списки.`;

let sdkPromise = null;
const loadSdk = () => (sdkPromise ||= import(SDK_URL).then((m) => m.default));

export class AiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// images — массив dataURL (JPEG), text — вставленный текст
export async function parseRecipeWithAI({ apiKey, text = '', images = [], signal }) {
  if (!apiKey) throw new AiError('Не указан ключ API.', 'no_key');
  let Anthropic;
  try { Anthropic = await loadSdk(); }
  catch { throw new AiError('Не получилось загрузить модуль ИИ. Проверь интернет.', 'network'); }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const content = [
    ...images.map((url) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) },
    })),
    { type: 'text', text: text.trim() ? `Рецепт:\n\n${text.trim()}` : 'Извлеки рецепт с фото.' },
  ];

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    }, { signal });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Ключ API не подходит. Проверь его в настройках.', 'auth');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('У ключа нет доступа. Проверь аккаунт на console.anthropic.com.', 'auth');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Слишком много запросов. Подожди минуту и попробуй снова.', 'rate');
    if (e instanceof Anthropic.BadRequestError) {
      const msg = String(e.message || '');
      if (/credit|balance|billing/i.test(msg)) throw new AiError('На счёте API закончились деньги. Пополни баланс на console.anthropic.com.', 'billing');
      throw new AiError('ИИ не принял запрос. Возможно, фото слишком большое или текст пустой.', 'bad_request');
    }
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Нет связи с сервером ИИ. Проверь интернет.', 'network');
    if (e instanceof Anthropic.APIUserAbortError || e?.name === 'AbortError') throw new AiError('Отменено.', 'aborted');
    if (e instanceof Anthropic.APIError) throw new AiError('Сервер ИИ сейчас не отвечает. Попробуй чуть позже.', 'server');
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new AiError('ИИ отказался разбирать этот текст.', 'refusal');
  if (response.stop_reason === 'max_tokens') throw new AiError('Рецепт слишком длинный для одного разбора.', 'too_long');
  const block = response.content.find((b) => b.type === 'text');
  let data;
  try { data = JSON.parse(block?.text || ''); }
  catch { throw new AiError('ИИ ответил что-то непонятное. Попробуй ещё раз.', 'parse'); }

  return {
    title: data.title || '',
    servings: data.servings > 0 ? data.servings : null,
    time: data.time || '',
    ingredientsText: (data.ingredients || []).join('\n'),
    stepsText: (data.steps || []).join('\n'),
    notes: data.notes || '',
  };
}
