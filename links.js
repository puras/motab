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
  return `https://${host}/favicon.ico`;
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
  currentLinks = links.items;
  renderCards(currentLinks);
  bindLinksPanel();
  renderLinksList();
  attachDragHandlers(document.getElementById("cards"), ".card");
  attachDragHandlers(document.getElementById("link-list"), ".link-row");
}

// ============================================================
// 面板编辑区：表单 + 列表 + 删除
// ============================================================

let currentLinks = [];
let panelBound = false;

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return "l_" + crypto.randomUUID().slice(0, 8);
  return "l_" + Math.random().toString(36).slice(2, 10);
}

function renderLinksList() {
  const root = document.getElementById("link-list");
  if (!root) return;
  root.replaceChildren();
  if (currentLinks.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "暂无快捷入口";
    root.appendChild(e);
    return;
  }
  for (const it of currentLinks) {
    const row = document.createElement("div");
    row.className = "link-row";
    row.draggable = true;
    row.dataset.id = it.id;

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.textContent = "⋮⋮";

    const img = document.createElement("img");
    img.alt = "";
    img.src = it.icon || iconUrlForHost(parseHost(it.url) || "");
    img.addEventListener("error", () => { img.style.visibility = "hidden"; });

    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = it.name || it.url;
    const url = document.createElement("span");
    url.textContent = it.url;
    meta.appendChild(name);
    meta.appendChild(url);

    const edit = document.createElement("button");
    edit.className = "edit";
    edit.type = "button";
    edit.textContent = "✎";
    edit.title = "编辑";
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      enterEditMode(row, it);
    });

    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "×";
    del.title = "删除";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      currentLinks = currentLinks.filter(x => x.id !== it.id);
      await saveLinks({ items: currentLinks });
      renderLinksList();
      renderCards(currentLinks);
    });

    row.appendChild(handle);
    row.appendChild(img);
    row.appendChild(meta);
    row.appendChild(edit);
    row.appendChild(del);
    root.appendChild(row);
  }
}

function enterEditMode(row, item) {
  row.classList.add("is-editing");
  row.draggable = false;

  const urlVal = item.url;
  const host = parseHost(urlVal) || "";

  const pane = document.createElement("div");
  pane.className = "edit-pane";

  const nameIn = document.createElement("input");
  nameIn.type = "text";
  nameIn.className = "edit-name";
  nameIn.placeholder = "Name";
  nameIn.value = item.name || "";

  const urlIn = document.createElement("input");
  urlIn.type = "url";
  urlIn.className = "edit-url";
  urlIn.placeholder = "Link（http/https）";
  urlIn.value = urlVal;

  const iconIn = document.createElement("input");
  iconIn.type = "url";
  iconIn.className = "edit-icon";
  iconIn.placeholder = "Icon URL（可留空）";
  iconIn.value = item.icon || "";

  const hint = document.createElement("p");
  hint.className = "hint";

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  cancel.addEventListener("click", (e) => {
    e.stopPropagation();
    renderLinksList();
  });

  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary";
  save.textContent = "保存";
  save.addEventListener("click", async (e) => {
    e.stopPropagation();
    const newUrl = urlIn.value.trim();
    if (!validateLinkUrl(newUrl)) {
      hint.textContent = "链接格式不正确";
      hint.classList.add("is-error");
      return;
    }
    const newHost = parseHost(newUrl) || host;
    const newItem = {
      id: item.id,
      name: nameIn.value.trim() || nameFromHost(newHost),
      url: newUrl,
      icon: iconIn.value.trim() || iconUrlForHost(newHost)
    };
    const next = currentLinks.map(x => x.id === item.id ? newItem : x);
    await persistAndRender(next);
  });

  actions.appendChild(cancel);
  actions.appendChild(save);

  pane.appendChild(nameIn);
  pane.appendChild(urlIn);
  pane.appendChild(iconIn);
  pane.appendChild(actions);
  pane.appendChild(hint);

  // 隐藏视图态子节点
  for (const c of [...row.children]) c.style.display = "none";
  row.appendChild(pane);
  pane.querySelector(".edit-name").focus();
}

async function persistAndRender(newItems) {
  currentLinks = newItems;
  await saveLinks({ items: currentLinks });
  renderLinksList();
  renderCards(currentLinks);
}

function autofillFromUrl(url) {
  const host = parseHost(url);
  if (!host) return;
  const nameInput = el("link-form-name");
  const iconInput = el("link-form-icon");
  if (nameInput && !nameInput.value) nameInput.value = nameFromHost(host);
  if (iconInput && !iconInput.value) iconInput.value = iconUrlForHost(host);
}

function bindLinksPanel() {
  if (panelBound) return;
  panelBound = true;

  // 在 #panel-links 容器内插入结构
  const panelLinks = document.getElementById("panel-links");
  if (!panelLinks) return;
  panelLinks.innerHTML = `
    <h2>快捷入口</h2>
    <div id="link-list" class="link-list"></div>
    <div class="link-form">
      <input type="url" id="link-form-url" placeholder="Link（http/https）">
      <div class="form-row">
        <input type="text" id="link-form-name" placeholder="Name">
        <button type="button" id="link-form-autofill">自动填充</button>
      </div>
      <input type="url" id="link-form-icon" placeholder="Icon URL（可留空，自动从 Link 推导）">
      <div class="form-row">
        <button type="button" id="link-form-save" class="primary">保存</button>
      </div>
      <p class="hint">提示：填写 Link 后失焦或回车，会自动填入 Name 和 Icon</p>
    </div>
  `;

  const urlInput = el("link-form-url");
  const nameInput = el("link-form-name");
  const iconInput = el("link-form-icon");
  const hint = panelLinks.querySelector(".hint");

  urlInput.addEventListener("blur", () => autofillFromUrl(urlInput.value.trim()));
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); autofillFromUrl(urlInput.value.trim()); }
  });

  el("link-form-autofill").addEventListener("click", () => autofillFromUrl(urlInput.value.trim()));

  el("link-form-save").addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!validateLinkUrl(url)) {
      hint.textContent = "链接格式不正确";
      hint.classList.add("is-error");
      return;
    }
    const host = parseHost(url);
    const item = {
      id: makeId(),
      name: nameInput.value.trim() || nameFromHost(host),
      url,
      icon: iconInput.value.trim() || iconUrlForHost(host)
    };
    await persistAndRender([...currentLinks, item]);
    urlInput.value = "";
    nameInput.value = "";
    iconInput.value = "";
    hint.textContent = "已保存";
    hint.classList.remove("is-error");
  });
}

// ============================================================
// 拖拽区：HTML5 原生 D&D，#cards 与 #link-list 共用同一逻辑
// ============================================================

let dragFromId = null;

function findCardOrRow(target) {
  return target.closest && target.closest("[data-id]");
}

function indexFromPoint(container, x, y, selector) {
  const els = [...container.querySelectorAll(selector)];
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return els.length;
}

function attachDragHandlers(container, selector) {
  if (!container) return;

  const clearMarks = () => {
    container.classList.remove("drop-before", "drop-after");
    [...container.querySelectorAll(selector)].forEach(el =>
      el.classList.remove("is-dragging", "drop-before", "drop-after"));
  };

  container.addEventListener("dragstart", (e) => {
    const el = findCardOrRow(e.target);
    if (!el) return;
    dragFromId = el.dataset.id;
    el.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragFromId);
  });

  container.addEventListener("dragover", (e) => {
    if (!dragFromId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const idx = indexFromPoint(container, e.clientX, e.clientY, selector);
    [...container.querySelectorAll(selector)].forEach((el, i) => {
      el.classList.toggle("drop-before", i === idx);
      el.classList.toggle("drop-after", i === idx - 1);
    });
  });

  container.addEventListener("dragleave", (e) => {
    if (e.target === container) clearMarks();
  });

  container.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (!dragFromId) return;
    const idx = indexFromPoint(container, e.clientX, e.clientY, selector);
    const newItems = moveItem(currentLinks, dragFromId, idx);
    dragFromId = null;
    clearMarks();
    await persistAndRender(newItems);
  });

  container.addEventListener("dragend", () => {
    dragFromId = null;
    clearMarks();
  });
}

if (typeof document !== "undefined" && document.getElementById("cards")) {
  initLinks();
}
