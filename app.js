// ============================================================
// 问候分档：纯函数，不依赖 DOM / chrome.*
// ============================================================

function greetingFor(hour) {
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 13) return "中午好";
  if (hour >= 13 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

// ============================================================
// 问候设置：存储 + 校验
// ============================================================

const STORAGE_KEY_GREETING = "greeting";
const DEFAULT_GREETING = Object.freeze({ name: "", sub: "" });
const NAME_MAX = 20;
const SUB_MAX = 50;

function clampStr(s, max) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function sanitizeGreeting(raw) {
  const g = (raw && typeof raw === "object") ? raw : {};
  return {
    name: clampStr(g.name, NAME_MAX),
    sub:  clampStr(g.sub,  SUB_MAX)
  };
}

function storageAvailable() {
  try {
    return typeof chrome !== "undefined" &&
           !!(chrome.storage && chrome.storage.local);
  } catch (_) {
    return false;
  }
}

function loadGreeting() {
  return new Promise((resolve) => {
    if (!storageAvailable()) return resolve({ ...DEFAULT_GREETING });
    chrome.storage.local.get([STORAGE_KEY_GREETING], (res) => {
      resolve(sanitizeGreeting(res && res[STORAGE_KEY_GREETING]));
    });
  });
}

function saveGreeting(g) {
  if (!storageAvailable()) return Promise.resolve();
  return chrome.storage.local.set({ [STORAGE_KEY_GREETING]: sanitizeGreeting(g) });
}

// ============================================================
// 问候组合：把时段 + 个性化拼接成两行
// ============================================================

function composeGreeting(greeting, hour) {
  const g = greetingFor(hour);
  return {
    line1: greeting.name ? `${g}，${greeting.name}` : g,
    line2: greeting.sub  || ""
  };
}

// ============================================================
// 渲染：时钟每秒刷，问候只在配置变化时刷
// ============================================================

function pad2(n) { return n.toString().padStart(2, "0"); }

function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatDate(d) {
  return d.toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric", weekday: "long"
  });
}

let currentGreeting = { ...DEFAULT_GREETING };

function renderClock() {
  const now = new Date();
  const t = document.getElementById("time");
  const d = document.getElementById("date");
  if (t) t.textContent = formatTime(now);
  if (d) d.textContent = formatDate(now);
}

function renderGreeting() {
  const { line1, line2 } = composeGreeting(currentGreeting, new Date().getHours());
  const gEl = document.getElementById("greeting");
  const sEl = document.getElementById("sub-greeting");
  if (gEl) gEl.textContent = line1;
  if (sEl) {
    if (line2) {
      sEl.textContent = line2;
      sEl.hidden = false;
    } else {
      sEl.textContent = "";
      sEl.hidden = true;
    }
  }
}

// 同步面板输入框：仅在启动时把存储值回填到面板
function syncGreetingInputs() {
  const nameEl = document.getElementById("greeting-name");
  const subEl  = document.getElementById("greeting-sub");
  if (nameEl) nameEl.value = currentGreeting.name;
  if (subEl)  subEl.value  = currentGreeting.sub;
}

// 供面板调用：保存原始值 → 校验 → 更新 currentGreeting → 刷 DOM
window.applyGreeting = function(raw) {
  currentGreeting = sanitizeGreeting(raw);
  renderGreeting();
};

// 供面板读取当前生效配置（用于面板打开时回填）
window.getCurrentGreeting = function() {
  return { ...currentGreeting };
};

window.saveGreeting = saveGreeting;

(async function init() {
  currentGreeting = await loadGreeting();
  syncGreetingInputs();
  renderClock();
  renderGreeting();
  setInterval(renderClock, 1000);
})();