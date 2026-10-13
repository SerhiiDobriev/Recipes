// Сервер «Моей книжечки»: отдаёт сайт и хранит рецепты, записи и фото.
// Без внешних библиотек: Node 24 (встроенные http и sqlite).
//
// Данные лежат в DATA_DIR:
//   recipes.sqlite      — рецепты, записи «Как получилось», миниатюры фото, настройки
//   photos/<id>.jpg     — фото в полном размере
//   trash/              — удалённые фото (хранятся 30 дней)
//   backups/            — копия базы раз в сутки (последние 14)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(HERE, '..', 'public'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, '..', 'data'));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const PHOTOS = path.join(DATA_DIR, 'photos');
const TRASH = path.join(DATA_DIR, 'trash');
const BACKUPS = path.join(DATA_DIR, 'backups');
for (const d of [DATA_DIR, PHOTOS, TRASH, BACKUPS]) fs.mkdirSync(d, { recursive: true });

// ---------- База ----------

const db = new DatabaseSync(path.join(DATA_DIR, 'recipes.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS entries_recipe ON entries(recipe_id);
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    entry_id TEXT,
    created_at TEXT NOT NULL,
    thumb TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS photos_recipe ON photos(recipe_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

const q = {
  listRecipes: db.prepare('SELECT data FROM recipes'),
  getRecipe: db.prepare('SELECT data FROM recipes WHERE id = ?'),
  putRecipe: db.prepare('INSERT INTO recipes (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
  deleteRecipe: db.prepare('DELETE FROM recipes WHERE id = ?'),
  listEntries: db.prepare('SELECT data FROM entries WHERE recipe_id = ?'),
  getEntry: db.prepare('SELECT recipe_id FROM entries WHERE id = ?'),
  putEntry: db.prepare('INSERT INTO entries (id, recipe_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET recipe_id = excluded.recipe_id, data = excluded.data'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  deleteEntriesOf: db.prepare('DELETE FROM entries WHERE recipe_id = ?'),
  listPhotos: db.prepare('SELECT id, recipe_id AS recipeId, entry_id AS entryId, created_at AS createdAt, thumb FROM photos WHERE recipe_id = ?'),
  photosOfEntry: db.prepare('SELECT id FROM photos WHERE entry_id = ?'),
  putPhoto: db.prepare('INSERT INTO photos (id, recipe_id, entry_id, created_at, thumb) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET recipe_id = excluded.recipe_id, entry_id = excluded.entry_id, created_at = excluded.created_at, thumb = excluded.thumb'),
  deletePhoto: db.prepare('DELETE FROM photos WHERE id = ?'),
  getSettings: db.prepare("SELECT data FROM settings WHERE key = 'main'"),
  putSettings: db.prepare("INSERT INTO settings (key, data) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data"),
};

const parseRows = (rows) => rows.map((r) => JSON.parse(r.data));

// Удалённое фото не стираем сразу, а переносим в корзину
function trashPhoto(id) {
  q.deletePhoto.run(id);
  const file = path.join(PHOTOS, id + '.jpg');
  if (fs.existsSync(file)) fs.renameSync(file, path.join(TRASH, `${Date.now()}-${id}.jpg`));
}

function deleteRecipe(id) {
  db.exec('BEGIN');
  try {
    for (const p of q.listPhotos.all(id)) trashPhoto(p.id);
    q.deleteEntriesOf.run(id);
    q.deleteRecipe.run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function deleteEntry(id) {
  for (const p of q.photosOfEntry.all(id)) trashPhoto(p.id);
  q.deleteEntry.run(id);
}

// ---------- Резервные копии ----------

function backup() {
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUPS, `recipes-${day}.sqlite`);
  try {
    if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.sqlite')).sort().slice(0, -14);
    for (const f of old) fs.unlinkSync(path.join(BACKUPS, f));
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(TRASH)) if (parseInt(f, 10) < monthAgo) fs.unlinkSync(path.join(TRASH, f));
  } catch (e) {
    console.error('backup failed', e);
  }
}
backup();
setInterval(backup, 6 * 3600 * 1000).unref();

// ---------- HTTP ----------

const ID = /^[A-Za-z0-9-]{8,64}$/;
const JPEG_DATA_URL = /^data:image\/jpeg;base64,/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
      catch { reject(new HttpError(400, 'Неверный JSON')); }
    });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'same-origin',
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function checkId(id) {
  if (!ID.test(id || '')) throw new HttpError(400, 'Неверный id');
  return id;
}

function cleanRecipe(body, id) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Нужен рецепт');
  if (body.id !== id) throw new HttpError(400, 'id не совпадает');
  if (body.cover && (typeof body.cover.thumb !== 'string' || !JPEG_DATA_URL.test(body.cover.thumb))) body.cover = null;
  return body;
}

async function api(req, res, parts) {
  const m = req.method;
  const [a, id, b] = parts; // /api/<a>/<id>/<b>

  if (a === 'health' && m === 'GET') return send(res, 200, { ok: true });

  if (a === 'settings') {
    if (m === 'GET') { const row = q.getSettings.get(); return send(res, 200, row ? JSON.parse(row.data) : {}); }
    if (m === 'PUT') {
      const body = await readJson(req, 200_000);
      if (!body || typeof body !== 'object') throw new HttpError(400, 'Нужны настройки');
      delete body.aiKey; // ключ ИИ хранится только в браузере
      q.putSettings.run(JSON.stringify(body));
      return send(res, 200, { ok: true });
    }
  }

  if (a === 'recipes') {
    if (!id && m === 'GET') return send(res, 200, parseRows(q.listRecipes.all()));
    checkId(id);
    if (!b) {
      if (m === 'GET') { const row = q.getRecipe.get(id); return row ? send(res, 200, JSON.parse(row.data)) : send(res, 404, { error: 'Рецепт не найден' }); }
      if (m === 'PUT') {
        const body = cleanRecipe(await readJson(req, 1_000_000), id);
        q.putRecipe.run(id, JSON.stringify(body), new Date().toISOString());
        return send(res, 200, { ok: true });
      }
      if (m === 'DELETE') { deleteRecipe(id); return send(res, 200, { ok: true }); }
    }
    if (b === 'entries' && m === 'GET') return send(res, 200, parseRows(q.listEntries.all(id)));
    if (b === 'photos' && m === 'GET') return send(res, 200, q.listPhotos.all(id));
  }

  if (a === 'entries') {
    checkId(id);
    if (m === 'PUT') {
      const body = await readJson(req, 200_000);
      if (!body || body.id !== id) throw new HttpError(400, 'id не совпадает');
      checkId(body.recipeId);
      q.putEntry.run(id, body.recipeId, JSON.stringify(body));
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { deleteEntry(id); return send(res, 200, { ok: true }); }
  }

  if (a === 'photos') {
    checkId(id);
    if (b === 'full' && m === 'GET') {
      const file = path.join(PHOTOS, id + '.jpg');
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Фото не найдено' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
      return fs.createReadStream(file).pipe(res);
    }
    if (!b && m === 'PUT') {
      const body = await readJson(req, 12_000_000);
      const meta = body?.meta;
      if (!meta || meta.id !== id) throw new HttpError(400, 'id не совпадает');
      checkId(meta.recipeId);
      if (meta.entryId) checkId(meta.entryId);
      if (!JPEG_DATA_URL.test(meta.thumb || '') || meta.thumb.length > 400_000) throw new HttpError(400, 'Нужна миниатюра JPEG');
      if (!JPEG_DATA_URL.test(body.full || '')) throw new HttpError(400, 'Нужно фото JPEG');
      const bytes = Buffer.from(body.full.slice(body.full.indexOf(',') + 1), 'base64');
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpError(400, 'Это не JPEG');
      fs.writeFileSync(path.join(PHOTOS, id + '.jpg'), bytes);
      q.putPhoto.run(id, meta.recipeId, meta.entryId || null, String(meta.createdAt || new Date().toISOString()), meta.thumb);
      return send(res, 200, { ok: true });
    }
    if (!b && m === 'DELETE') { trashPhoto(id); return send(res, 200, { ok: true }); }
  }

  throw new HttpError(404, 'Нет такого адреса');
}

// ---------- Файлы сайта ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Запрещено');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Не найдено');
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // Сайт часто обновляется — браузер всегда сверяется с сервером (ответ 304, если не менялось)
      'Cache-Control': file.includes(`${path.sep}icons${path.sep}`) ? 'public, max-age=86400' : 'no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      await api(req, res, url.pathname.slice(5).split('/').filter(Boolean));
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      send(res, 405, 'Метод не поддерживается');
    }
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Ошибка сервера' });
  }
});

server.listen(PORT, HOST, () => console.log(`Книжечка: http://${HOST}:${PORT}  данные: ${DATA_DIR}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
