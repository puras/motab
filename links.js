// ============================================================
// 纯函数区：可独立测试，禁止访问 chrome.* 与面板 DOM
// ============================================================

const STORAGE_KEY_LINKS = "links";

const DEFAULT_LINKS = Object.freeze({ items: [] });

const PUBLIC_SUFFIXES = Object.freeze([
  "com","cn","net","org","io","co","app","dev","gov","edu",
  "me","ai","tv","cc","info","biz","xyz","tech"
]);

function parseHost(input) {
  if (typeof input !== "string") return "";
  const s = input.trim();
  if (!s) return "";
  // 必须以 http(s):// 起头；避免依赖全局 URL（vm 沙箱里不可用）
  const m = s.match(/^([a-z][a-z0-9+.\-]*):\/\/(.+)$/i);
  if (!m) return "";
  if (!/^https?$/i.test(m[1])) return "";
  let host = m[2].split(/[/?#]/, 1)[0];
  if (!host) return "";
  host = host.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function nameFromHost(host) {
  if (!host) return "";
  const parts = host.split(".");
  const tail = parts[parts.length - 1];
  // 取最左段：测试预期（如 "mail.google.com" → "Mail"）要求用首段而非倒数第二段
  const core = PUBLIC_SUFFIXES.includes(tail) && parts.length >= 2
    ? parts[0]
    : tail;
  if (!core) return "";
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function iconUrlForHost(host) {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

function validateLinkUrl(input) {
  if (typeof input !== "string") return false;
  if (!/^https?:\/\/\S+$/i.test(input)) return false;
  if (/["'\s]/.test(input)) return false;
  return true;
}

function sanitizeLinks(raw) {
  const out = { items: [] };
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return out;
  for (const it of raw.items) {
    if (!it || typeof it !== "object") continue;
    if (typeof it.id !== "string" || !it.id) continue;
    const url = validateLinkUrl(it.url) ? it.url : "";
    if (!url) continue; // 没有合法 url 的整条丢弃
    out.items.push({
      id: it.id,
      name: typeof it.name === "string" ? it.name : "",
      url,
      icon: typeof it.icon === "string" ? it.icon : ""
    });
  }
  return out;
}

function moveItem(items, fromId, toIndex) {
  if (!Array.isArray(items)) return [];
  const fromIdx = items.findIndex(x => x && x.id === fromId);
  if (fromIdx < 0) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(fromIdx, 1);
  const target = Math.max(0, Math.min(typeof toIndex === "number" ? toIndex : next.length, next.length));
  next.splice(target, 0, moved);
  return next;
}

// ============================================================
// 存储区：chrome.storage.local 封装
// ============================================================

function linksStorageAvailable() {
  try {
    return typeof chrome !== "undefined" &&
           !!(chrome.storage && chrome.storage.local);
  } catch (_) {
    return false;
  }
}

function loadLinks() {
  return new Promise((resolve) => {
    if (!linksStorageAvailable()) return resolve({ items: [...DEFAULT_LINKS.items] });
    chrome.storage.local.get([STORAGE_KEY_LINKS], (res) => {
      resolve(sanitizeLinks(res && res[STORAGE_KEY_LINKS]));
    });
  });
}

function saveLinks(links) {
  if (!linksStorageAvailable()) return Promise.resolve();
  return chrome.storage.local.set({ [STORAGE_KEY_LINKS]: links });
}

// ============================================================
// 渲染区：构造卡片 DOM，favicon 失败时显示首字母色块
// ============================================================

function fallbackColor(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0xffffffff;
  return `hsl(${Math.abs(h) % 360}, 60%, 55%)`;
}

function renderCard(item) {
  const host = parseHost(item.url) || "";
  const a = document.createElement("a");
  a.className = "card";
  a.href = item.url;
  a.draggable = true;
  a.dataset.id = item.id;
  a.title = item.name || item.url;
  a.setAttribute("aria-label", a.title);

  const wrap = document.createElement("div");
  wrap.className = "card-icon-wrap";

  const img = document.createElement("img");
  img.className = "card-icon";
  img.alt = "";
  img.src = item.icon || iconUrlForHost(host);
  img.addEventListener("error", () => {
    const first = (item.name || host || "?").trim().charAt(0).toUpperCase() || "?";
    const fb = wrap.querySelector(".card-fallback");
    if (fb) fb.textContent = first;
    a.classList.add("is-fallback");
  });

  const fb = document.createElement("div");
  fb.className = "card-fallback";
  fb.textContent = (item.name || host || "?").trim().charAt(0).toUpperCase() || "?";
  fb.style.background = fallbackColor(host);

  wrap.appendChild(img);
  wrap.appendChild(fb);

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name || host;

  a.appendChild(wrap);
  a.appendChild(name);
  return a;
}

function renderCards(items) {
  const root = document.getElementById("cards");
  if (!root) return;
  root.replaceChildren();
  for (const it of items) root.appendChild(renderCard(it));
}

async function initLinks() {
  const links = await loadLinks();
  renderCards(links.items);
}

if (typeof document !== "undefined" && document.getElementById("cards")) {
  initLinks();
}
