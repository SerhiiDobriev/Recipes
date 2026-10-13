// Общее состояние приложения
import { densityContext } from './units.js';

export const app = {
  store: null,
  settings: null,
  ctx: null,
  recipes: [],
  // Что выбрано на экране рецепта: порции, режим единиц, отмеченные строки
  view: {},
};

export function setSettings(s) {
  app.settings = s;
  app.ctx = densityContext(s);
}

export async function refreshRecipes() {
  app.recipes = (await app.store.listRecipes()).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
  return app.recipes;
}

export const CATEGORIES = ['Торты', 'Выпечка', 'Десерты', 'Завтраки', 'Супы', 'Салаты', 'Горячее', 'Гарниры', 'Закуски', 'Соусы', 'Напитки', 'Заготовки'];

export function recipeUi(id) {
  if (!app.view[id]) app.view[id] = { servings: null, checkedIng: new Set(), checkedSteps: new Set() };
  return app.view[id];
}
