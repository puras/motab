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

// ============================================================
// 存储区：chrome.storage.local 封装
// ============================================================

function storageAvailable() {
  try {
    return typeof chrome !== "undefined" &&
           !!(chrome.storage && chrome.storage.local);
  } catch (_) {
    return false;
  }
}

function loadBg() {
  return new Promise((resolve) => {
    if (!storageAvailable()) return resolve({ ...DEFAULT_BG });
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(sanitizeSettings(res && res[STORAGE_KEY]));
    });
  });
}

function saveBg(bg) {
  if (!storageAvailable()) return Promise.resolve();
  return chrome.storage.local.set({ [STORAGE_KEY]: bg });
}

// ============================================================
// 上传处理区：文件压缩、URL 探测
// ============================================================

function normalizeImageToDataUrl(file, maxEdge = 3840, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const { width, height } = targetSize(img.naturalWidth, img.naturalHeight, maxEdge);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function probeImageUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; reject(new Error("timeout")); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(url); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("load-failed")); };
    img.src = url;
  });
}

// ============================================================
// 面板交互区
// ============================================================

let currentBg = { ...DEFAULT_BG };

function setStatus(msg, isError = false) {
  const s = el("bg-status");
  if (!s) return;
  s.textContent = msg;
  s.classList.toggle("is-error", isError);
}

function syncControls() {
  el("bg-dim").value = Math.round(currentBg.dim * 100);
  el("bg-dim-val").textContent = `${Math.round(currentBg.dim * 100)}%`;
  el("bg-blur").value = currentBg.blur;
  el("bg-blur-val").textContent = `${currentBg.blur}px`;
}

const debouncedSave = debounce(() => saveBg(currentBg), 300);

function bindPanel() {
  const gear = el("motab-gear");
  const panel = el("motab-panel");

  // --- 齿轮：鼠标移动淡入，闲置 2.5s 淡出；面板打开时常显 ---
  let idleTimer = null;
  const wakeGear = () => {
    if (!panel.hidden) return;
    gear.classList.add("is-visible");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => gear.classList.remove("is-visible"), 2500);
  };
  document.addEventListener("mousemove", wakeGear);

  const openPanel = () => {
    clearTimeout(idleTimer);
    panel.hidden = false;
    gear.classList.add("is-visible");
  };
  const closePanel = () => { panel.hidden = true; };

  gear.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });
  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (!panel.contains(e.target) && e.target !== gear) closePanel();
  });

  // --- 上传 ---
  el("bg-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await normalizeImageToDataUrl(file);
      currentBg = { ...currentBg, type: "data", data: dataUrl };
      applyBackground(currentBg);
      await saveBg(currentBg);
      syncControls();
      setStatus("背景已更新");
    } catch (_) {
      setStatus("无法识别该图片", true);
    }
  });

  // --- URL ---
  el("bg-url-apply").addEventListener("click", async () => {
    const url = el("bg-url").value.trim();
    if (!/^https?:\/\/\S+$/i.test(url) || /["'\s]/.test(url)) {
      setStatus("地址格式不正确", true);
      return;
    }
    const btn = el("bg-url-apply");
    btn.disabled = true;
    setStatus("正在加载图片...");
    try {
      await probeImageUrl(url);
      currentBg = { ...currentBg, type: "url", url };
      applyBackground(currentBg);
      await saveBg(currentBg);
      syncControls();
      setStatus("背景已更新");
    } catch (err) {
      setStatus(err.message === "timeout" ? "加载超时，请重试" : "无法加载该图片", true);
    } finally {
      btn.disabled = false;
    }
  });

  // --- 滑杆：拖动即时预览，停止 300ms 后落盘 ---
  el("bg-dim").addEventListener("input", (e) => {
    currentBg = { ...currentBg, dim: clamp01(Number(e.target.value) / 100) };
    el("bg-dim-val").textContent = `${Math.round(currentBg.dim * 100)}%`;
    applyBackground(currentBg);
    debouncedSave();
  });

  el("bg-blur").addEventListener("input", (e) => {
    currentBg = { ...currentBg, blur: clampBlur(Number(e.target.value)) };
    el("bg-blur-val").textContent = `${currentBg.blur}px`;
    applyBackground(currentBg);
    debouncedSave();
  });

  // --- 恢复默认：完全回出厂（图 + 蒙版 25% + 模糊 0）---
  el("bg-reset").addEventListener("click", async () => {
    currentBg = { ...DEFAULT_BG };
    applyBackground(currentBg);
    await saveBg(currentBg);
    syncControls();
    setStatus("已恢复默认");
  });
}

async function initSettings() {
  bindPanel();
  currentBg = await loadBg();
  applyBackground(currentBg);
  syncControls();
}

if (typeof document !== "undefined" && document.getElementById("motab-gear")) {
  initSettings();
}
