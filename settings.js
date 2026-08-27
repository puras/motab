// ============================================================
// 纯函数区：可独立测试，禁止访问 chrome.* 或面板 DOM
// ============================================================

const STORAGE_KEY = "bg";

const DEFAULT_BG = Object.freeze({
  type: "default", // "default" | "data" | "url"
  data: "",
  url: "",
  dim: 0.25,
  blur: 0
});

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

function targetSize(w, h, maxEdge = 3840) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    width:  Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale))
  };
}

function safeDataString(d) {
  return (typeof d === "string" && /^data:image\//i.test(d)) ? d : "";
}

function safeUrlString(u) {
  return (typeof u === "string" && /^https?:\/\//i.test(u) && !/[\s"']/.test(u))
    ? u : "";
}

function sanitizeSettings(raw) {
  const bg = (raw && typeof raw === "object") ? raw : {};
  let type = bg.type;
  if (type !== "default" && type !== "data" && type !== "url") type = "default";
  const data = safeDataString(bg.data);
  const url = safeUrlString(bg.url);
  if (type === "data" && !data) type = "default";
  if (type === "url" && !url) type = "default";
  return {
    type,
    data,
    url,
    dim:  clamp01(numOrDefault(bg.dim, DEFAULT_BG.dim)),
    blur: clampBlur(numOrDefault(bg.blur, DEFAULT_BG.blur))
  };
}

// ============================================================
// 渲染区：把 bg 设置应用到 DOM
// ============================================================

function backgroundSrcOf(bg) {
  if (bg.type === "data") return bg.data;
  if (bg.type === "url") return bg.url;
  return "assets/wallpaper.jpg";
}

function applyBackground(bg) {
  const bgEl = document.getElementById("bg-layer");
  const overlayEl = document.querySelector(".overlay");
  if (!bgEl || !overlayEl) return;

  bgEl.style.backgroundImage = `url("${backgroundSrcOf(bg)}")`;
  bgEl.style.filter = bg.blur > 0 ? `blur(${bg.blur}px)` : "";
  bgEl.style.transform = bg.blur > 0 ? "scale(1.06)" : "";
  overlayEl.style.opacity = String(bg.dim);
}

// 冒烟示例（仅在扩展真实页面里由控制台手动调用）：
window.__applyBackgroundDemo = () => applyBackground({ ...DEFAULT_BG, dim: 0.5 });