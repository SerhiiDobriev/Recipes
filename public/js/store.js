// Хранилище рецептов на своём сервере (папка server/ в проекте).
// Рецепты общие для всех устройств: что сохранили на телефоне, видно и на компьютере.

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const DEFAULT_SETTINGS = { cupMl: 250, densityOverrides: {}, customDensities: [] };

async function call(method, url, body) {
  let res;
  try {
    res = await fetch('api/' + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверь интернет.');
  }
  if (res.status === 404 && method === 'GET') return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Сервер не принял изменения');
  return data;
}

const enc = encodeURIComponent;

export class ServerStore {
  async init() { await call('GET', 'health'); }

  async listRecipes() { return (await call('GET', 'recipes')) || []; }
  getRecipe(id) { return call('GET', `recipes/${enc(id)}`); }
  putRecipe(r) { return call('PUT', `recipes/${enc(r.id)}`, r); }
  deleteRecipe(id) { return call('DELETE', `recipes/${enc(id)}`); }

  async listEntries(recipeId) { return (await call('GET', `recipes/${enc(recipeId)}/entries`)) || []; }
  putEntry(e) { return call('PUT', `entries/${enc(e.id)}`, e); }
  deleteEntry(id) { return call('DELETE', `entries/${enc(id)}`); }

  async listPhotos(recipeId) { return (await call('GET', `recipes/${enc(recipeId)}/photos`)) || []; }
  putPhoto(meta, full) { return call('PUT', `photos/${enc(meta.id)}`, { meta, full }); }
  // Адрес полного фото: годится для <img src>
  async getPhotoFull(id) { return `api/photos/${enc(id)}/full`; }
  deletePhoto(id) { return call('DELETE', `photos/${enc(id)}`); }

  async getSettings() { return { ...DEFAULT_SETTINGS, ...((await call('GET', 'settings')) || {}) }; }
  putSettings(value) { return call('PUT', 'settings', value); }
}

// ---------- Резервная копия ----------

async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

export async function exportAll(store) {
  const recipes = await store.listRecipes();
  const out = { app: 'moya-knizhechka', version: 1, exportedAt: new Date().toISOString(), settings: await store.getSettings(), recipes: [] };
  for (const r of recipes) {
    const photos = [];
    for (const p of await store.listPhotos(r.id)) photos.push({ ...p, full: await toDataUrl(await store.getPhotoFull(p.id)) });
    out.recipes.push({ recipe: r, entries: await store.listEntries(r.id), photos });
  }
  return out;
}

// Добавляет рецепты из копии; уже существующие (тот же id) перезаписывает
export async function importAll(store, data, { withSettings = false } = {}) {
  if (data?.app !== 'moya-knizhechka') throw new Error('Это не файл копии «Моей книжечки».');
  let n = 0;
  for (const { recipe, entries = [], photos = [] } of data.recipes || []) {
    await store.putRecipe(recipe);
    for (const e of entries) await store.putEntry(e);
    for (const { full, ...meta } of photos) await store.putPhoto(meta, full || meta.thumb);
    n++;
  }
  if (withSettings && data.settings) await store.putSettings(data.settings);
  return n;
}
