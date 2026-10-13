// Уменьшаем фото перед сохранением: полное ~1400 px и миниатюра ~480 px.

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* ниже запасной путь */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src, maxSide, quality) {
  const w = src.width, h = src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

// Для распознавания текста нужно покрупнее, чтобы мелкий шрифт читался
export async function prepareForAI(file) {
  return render(await loadBitmap(file), 2000, 0.85);
}

export async function preparePhoto(file) {
  const bmp = await loadBitmap(file);
  return {
    full: render(bmp, 1400, 0.8),
    thumb: render(bmp, 480, 0.74),
  };
}
