import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 39000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/api/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'knizhechka-'));
let proc;

const api = async (method, url, body) => {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

before(async () => {
  proc = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + 'health')).ok) return; } catch { /* ещё запускается */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('сервер не запустился');
});

after(async () => {
  proc.kill();
  await once(proc, 'exit');
  fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// Самый маленький корректный JPEG
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

test('рецепт, запись и фото: сохранить, прочитать, удалить', async () => {
  const id = 'recipe-0001';
  const recipe = { id, title: 'Блины', ingredientsText: 'Мука — 200 г', cover: null };
  assert.equal((await api('PUT', `recipes/${id}`, recipe)).status, 200);
  assert.deepEqual((await api('GET', `recipes/${id}`)).data, recipe);
  assert.equal((await api('GET', 'recipes')).data.length, 1);

  assert.equal((await api('PUT', 'entries/entry-0001', { id: 'entry-0001', recipeId: id, text: 'вкусно' })).status, 200);
  const meta = { id: 'photo-0001', recipeId: id, entryId: 'entry-0001', createdAt: '2026-10-13', thumb: JPEG };
  assert.equal((await api('PUT', 'photos/photo-0001', { meta, full: JPEG })).status, 200);
  assert.equal((await fetch(BASE + 'photos/photo-0001/full')).headers.get('content-type'), 'image/jpeg');

  assert.equal((await api('DELETE', 'entries/entry-0001')).status, 200);
  assert.equal((await api('GET', `recipes/${id}/photos`)).data.length, 0, 'фото записи удаляется вместе с ней');
  assert.equal(fs.readdirSync(path.join(DATA, 'trash')).length, 1, 'файл фото уходит в корзину');

  assert.equal((await api('DELETE', `recipes/${id}`)).status, 200);
  assert.equal((await api('GET', `recipes/${id}`)).status, 404);
});

test('ключ ИИ не сохраняется на сервере', async () => {
  await api('PUT', 'settings', { cupMl: 200, aiKey: 'sk-ant-secret' });
  assert.deepEqual((await api('GET', 'settings')).data, { cupMl: 200 });
});

test('плохие запросы отклоняются', async () => {
  assert.equal((await api('GET', 'recipes/../../etc')).status, 404);
  assert.equal((await api('PUT', 'recipes/bad')).status, 400);
  assert.equal((await api('PUT', 'recipes/recipe-0002', { id: 'other-id-1' })).status, 400);
  const notJpeg = { meta: { id: 'photo-0002', recipeId: 'recipe-0002', thumb: JPEG }, full: 'data:image/jpeg;base64,AAAA' };
  assert.equal((await api('PUT', 'photos/photo-0002', notJpeg)).status, 400);
});
