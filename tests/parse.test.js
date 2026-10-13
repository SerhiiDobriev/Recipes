import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseRecipeText } from '../public/js/parse.js';
import { presentAmount, densityContext } from '../public/js/units.js';

const ctx = densityContext({ cupMl: 250 });
const amount = (line, factor = 1, mode = 'orig') => presentAmount(parseIngredient(line), factor, mode, ctx).text;

test('количество и единица в разных записях', () => {
  assert.equal(amount('Мука — 200 г'), '200 г');
  assert.equal(amount('200 г муки'), '200 г');
  assert.equal(amount('1/2 ч.л. соды'), '½ ч. л.');
  assert.equal(amount('Сахарная пудра 2-3 ст. ложки'), '2–3 ст. л.');
  assert.equal(parseIngredient('Сливки 33% — 200 мл').name, 'Сливки 33%');
  assert.equal(parseIngredient('Мука 1 сорта — 1 стакан').unit, 'cup');
});

test('числа словами', () => {
  assert.equal(amount('Два яйца'), '2');
  assert.equal(amount('полстакана сахара'), '½ стакана');
  assert.equal(amount('пол-литра молока'), '0,5 л');
  assert.equal(amount('полторы столовые ложки муки'), '1½ ст. л.');
  assert.equal(amount('Масло — пол пачки'), '½ пачки');
  assert.equal(amount('щепотка соли', 2), '2 щепотки');
});

test('пересчёт порций и перевод мер', () => {
  assert.equal(amount('Сахар — 200 г', 2), '400 г');
  assert.equal(amount('Сахар — 200 г', 1, 'spoons'), '1 стакан');
  assert.equal(amount('Мёд — 3 ст. л.', 1, 'metric'), '90 г');
  assert.equal(amount('Масло сливочное — 100 г', 1, 'spoons'), '5 ст. л.');
  assert.equal(amount('Творог — 500 г', 2), '1 кг');
  assert.equal(amount('Вода — 100 мл', 1, 'spoons'), '6½ ст. л.');
  assert.equal(amount('Изюм — 1,5 горсти', 2), '3 горсти');
});

test('рецепт целиком', () => {
  const r = parseRecipeText('Сырники\nТворог\n500 г\nЯйцо\n1 шт\nСмешать творог с яйцом.\nОбжарить с двух сторон.');
  assert.equal(r.title, 'Сырники');
  assert.equal(r.ingredientsText, 'Творог — 500 г\nЯйцо — 1 шт');
  assert.equal(r.stepsText.split('\n').length, 2);
});

test('таблица мер: в столовой ложке примерно 3 чайные', async () => {
  const { DENSITIES } = await import('../public/js/units.js');
  for (const d of DENSITIES) {
    const ratio = d.tbsp / d.tsp;
    assert.ok(ratio >= 2.5 && ratio <= 3.5, `${d.name}: ст. л. ${d.tbsp} г, ч. л. ${d.tsp} г`);
  }
});
