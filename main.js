// ============================================================
// 共享工具：被 settings.js 与 links.js 共同使用，必须先于它们加载
// ============================================================

function clamp(v, min, max) {
  v = Number(v);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function clamp01(v) { return clamp(v, 0, 1); }

function clampBlur(v) { return clamp(v, 0, 20); }

function numOrDefault(v, fallback) {
  return (typeof v === "number" && Number.isFinite(v)) ? v : fallback;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function el(id) { return document.getElementById(id); }
