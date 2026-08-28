# MoTab 快捷入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新标签页里提供可自定义的快捷入口（图标 + 链接 + 名称），自动获取 + 可手改，支持拖拽排序，全部在现有齿轮面板内的「快捷入口」标签页管理。

**Architecture:** 纯 HTML/CSS/JS MV3 扩展。重构 settings.js 把共享工具抽到新 main.js；新增 links.js 承载所有快捷入口逻辑（纯函数 / 存储 / 页面卡片渲染 / 面板编辑 / 拖拽）；newtab.html 加载顺序 main → settings → links → app；面板用 `role="tablist"` + `location.hash` 同步两个标签。

**Tech Stack:** 无框架、无构建工具；HTML5 原生 Drag and Drop API；`crypto.randomUUID()`；DuckDuckGo Icons 服务（`icons.duckduckgo.com/ip3/{host}.ico`）。

**Spec:** `docs/superpowers/specs/2026-08-28-quick-links-design.md`

## Global Constraints

- 纯 HTML/CSS/JS，无构建工具、零第三方依赖；`app.js` 一行不动；favicon 仅用第三方 DDG Icons 服务，不引入任何外部 JS。
- Chrome MV3；permission 维持现状（`storage` 单一），manifest 不新增任何 permission；`fetch` 不需要 host_permissions 因为只对 `icons.duckduckgo.com` 单域（图片由 `<img>` 标签天然加载，跨域由浏览器/CORS 决定，不在 JS 层 fetch）。
- 共享工具放在 main.js（先加载）；settings.js 与 links.js 不互相 import，只消费 main.js 暴露的全局工具。
- 脚本加载顺序固定：`main.js → settings.js → links.js → app.js`。
- 数据存储双键并存：`chrome.storage.local["bg"]` 已有不动；新增 `chrome.storage.local["links"]`，值恒有 `items: []`。
- 固定参数：卡片图标 64×64，网格列 `auto-fill` 最小 64px 最大 96px，悬停放大 1.08，DDG 图标 URL 模板 `https://icons.duckduckgo.com/ip3/{host}.ico`，公共后缀白名单 `com cn net org io co app dev gov edu me ai tv cc info biz xyz tech`，拖拽防抖 200ms，拖拽与点击分界 200ms，名称首字母大写，favicon 失败回退色块用 `hsl(hash(hostname) % 360, 60%, 55%)`。
- UI 中文文案精确使用以下字符串：「设置」「背景」「快捷入口」「链接格式不正确」「+ 添加」「自动填充」「保存」「删除」「拖动改变顺序」「暂无快捷入口，点齿轮 + 开始添加」。
- 标签页 hash 同步：`#bg` / `#links`；无 hash 默认显示「背景」。
- 测试页模式沿用 `tests/background.test.html` / `tests/greeting.test.html`：无框架、输出 PASS/FAIL 行 + 末尾总计行，`<script src="...">` 引真实实现而非拷贝。
- 工作目录固定为仓库根 `/Users/puras/workspace/proj/106hz/motab`；直接 `main` 分支提交，不建分支（与上次背景功能一致）。

---

### Task 1: 抽出共享工具到 main.js

**Files:**
- Create: `main.js`
- Modify: `settings.js`（删除 5 个工具 + 修正调用前的位置依赖）
- Modify: `newtab.html`（在 `app.js` 之前插入 main.js；调整脚本顺序）

**Interfaces:**
- Consumes: 无
- Produces: `main.js` 在全局作用域提供以下 6 个函数（名与签名不可改）：
  - `clamp(v, min, max)` → Number；`v` 转 Number 后非有限返回 `min`
  - `clamp01(v)` → 限定 [0,1]
  - `clampBlur(v)` → 限定 [0,20]
  - `numOrDefault(v, fallback)` → `v` 是有限数则原样返回，否则 `fallback`
  - `debounce(fn, wait)` → trailing-edge 包装函数
  - `el(id)` → `document.getElementById(id)` 的简短包装
- `settings.js` 删除上述 5 个函数定义（`clamp` / `clamp01` / `clampBlur` / `numOrDefault` / `debounce`），保留 `el` 的一个 `function el(id){...}` 同名定义（仍是模块内局部，**不**与 main.js 冲突）—— 等等：删除 `el` 也行，因 main.js 暴露的 `el` 即可；统一选「删除 settings.js 的 `el` 局部版本，全用 main.js 的全局版本」。这样消除重复。

- [ ] **Step 1: 写 main.js**

创建 `main.js`：

```js
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
```

- [ ] **Step 2: 从 settings.js 删除同名定义**

在 `settings.js` 的「纯函数区」整段删除（行 15-27 区域）：`function clamp(v, min, max)`、`function clamp01(v)`、`function clampBlur(v)`、`function numOrDefault(v, fallback)` 四个函数体。

在「存储区」整段删除（行 130-140 区域附近）：

```js
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
```

在「面板交互区」删除 `function el(id) { return document.getElementById(id); }`（行 163 区域）。

注意：因 `clamp` / `numOrDefault` 是其他函数（`clamp01` / `clampBlur` / `sanitizeSettings`）的内部依赖，删除时连带其内部使用也调整：把 `sanitizeSettings` 内的 `clamp01(...)` 与 `clampBlur(...)` 保持原样即可，它们现在是跨文件调用。

- [ ] **Step 3: 修 newtab.html 加载顺序**

当前 newtab.html 底部（`</main>` 之后、`<script src="app.js"></script>` 之前）已有一段 `<script src="settings.js"></script>`，在它之前插入：

```html
<script src="main.js"></script>
```

调整后顺序：`main.js → settings.js → app.js`。

- [ ] **Step 4: 验证背景功能不破**

依次执行：

```bash
node --check main.js && node --check settings.js && echo SYNTAX_OK
```

然后用上次背景功能同款 Node vm harness 跑 `tests/background.test.html`：

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const html=fs.readFileSync("tests/background.test.html","utf8");
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const sb={}; sb.window=sb;
sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
vm.createContext(sb);
vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("settings.js","utf8")+"\n"+inline,sb);
console.log(sb.__out);
'
```

Expected: 末行 `总计 23 pass / 0 fail`。再跑问候测试页（同 harness 不带 main/settings 加载）应得 `11 pass / 0 fail`。

- [ ] **Step 5: 提交**

```bash
git add main.js settings.js newtab.html
git commit -m "refactor: extract shared utilities (clamp/debounce/el) to main.js"
```

---

### Task 2: links.js 纯函数层（TDD）

**Files:**
- Create: `tests/links.test.html`
- Create: `links.js`（本任务仅写「纯函数区」，后续任务在其下方追加）

**Interfaces:**
- Consumes: 无（不得访问 chrome.* 与 DOM）
- Produces（后续任务按这些精确签名调用，名字不可改）：
  - `STORAGE_KEY_LINKS` = `"links"`
  - `DEFAULT_LINKS` — 冻结对象 `{ items: [] }`
  - `PUBLIC_SUFFIXES` — 冻结字符串数组：`["com","cn","net","org","io","co","app","dev","gov","edu","me","ai","tv","cc","info","biz","xyz","tech"]`
  - `parseHost(input)` → String：返回 `www.` 去除后的 hostname；URL 解析失败返回 `""`
  - `nameFromHost(host)` → String：按公共后缀切分，首字母大写
  - `iconUrlForHost(host)` → String：返回 `https://icons.duckduckgo.com/ip3/{host}.ico` 模板
  - `validateLinkUrl(input)` → Boolean：`^https?://\S+$/i` 且无引号/空白
  - `sanitizeLinks(raw)` → 归一化的 `{ items: [...] }`，每个 item 含 `id` / `name` / `url` / `icon`，全字段缺失或非法 → `items: []`
  - `moveItem(items, fromId, toIndex)` → 新数组：把 `fromId` 对应项移到 `toIndex` 位置；id 不存在或参数非法 → 返回 `items.slice()`（不动）

- [ ] **Step 1: 写失败测试页**

创建 `tests/links.test.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>links 测试</title></head>
<body>
<h1>links 纯函数测试</h1>
<pre id="out">运行中...</pre>
<script src="../main.js"></script>
<script src="../links.js"></script>
<script>
let pass = 0, fail = 0;
const lines = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) pass++; else fail++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}  expect=${e}  got=${a}`);
}

// --- parseHost ---
check("parseHost https",   parseHost("https://github.com"), "github.com");
check("parseHost www 去前缀", parseHost("https://www.bbc.co.uk"), "bbc.co.uk");
check("parseHost 失败",     parseHost("not a url"), "");
check("parseHost 多段",     parseHost("https://mail.google.com/foo"), "mail.google.com");
check("parseHost 大小写",   parseHost("HTTPS://GitHub.COM/abc"), "github.com");
check("parseHost 空",       parseHost(""), "");
check("parseHost file",     parseHost("file:///etc"), "");

// --- nameFromHost ---
check("name github.com",          nameFromHost("github.com"), "Github");
check("name mail.google.com",     nameFromHost("mail.google.com"), "Mail");
check("name www 已被 parseHost 去掉", nameFromHost("github.com"), "Github");
check("name bbc.co.uk → 不在白名单则取尾段",
  nameFromHost("bbc.co.uk"), "Uk");
check("name 单段",                 nameFromHost("localhost"), "Localhost");
check("name io",                   nameFromHost("vercel.io"), "Vercel");
check("name gov",                  nameFromHost("usa.gov"), "Usa");
check("name edu",                  nameFromHost("mit.edu"), "Mit");
check("name app",                  nameFromHost("linear.app"), "Linear");
check("name dev",                  nameFromHost("vite.dev"), "Vite");
check("name 空",                   nameFromHost(""), "");

// --- iconUrlForHost ---
check("icon github",  iconUrlForHost("github.com"), "https://icons.duckduckgo.com/ip3/github.com.ico");
check("icon 含点",    iconUrlForHost("mail.google.com"), "https://icons.duckduckgo.com/ip3/mail.google.com.ico");
check("icon 空",      iconUrlForHost(""), "https://icons.duckduckgo.com/ip3/.ico");

// --- validateLinkUrl ---
check("v 合法 https",     validateLinkUrl("https://a.com"), true);
check("v 合法 http",      validateLinkUrl("http://a.com"), true);
check("v 缺协议",         validateLinkUrl("a.com"), false);
check("v 含空格",         validateLinkUrl("https://a .com"), false);
check("v 含引号",         validateLinkUrl('https://a"x.com'), false);
check("v ftp",            validateLinkUrl("ftp://a.com"), false);
check("v 空",             validateLinkUrl(""), false);

// --- sanitizeLinks 整体回退 ---
check("sanitize(undefined)", sanitizeLinks(undefined), DEFAULT_LINKS);
check("sanitize(null)",      sanitizeLinks(null), DEFAULT_LINKS);
check("sanitize(number)",    sanitizeLinks(42), DEFAULT_LINKS);
check("sanitize 空对象",      sanitizeLinks({}), { items: [] });
check("sanitize 缺 items",   sanitizeLinks({foo:1}), { items: [] });

// --- sanitizeLinks 字段净化 ---
const raw = { items: [
  { id: "l_a", name: "Gh",  url: "javascript:x", icon: '<svg onload=x>' },
  { id: "l_b", name: "Yt",  url: "https://yt.com", icon: "" },
  { id: "l_c", name: "",    url: "ftp://x.com", icon: "https://i.c/x.png" }
]};
const cleaned = sanitizeLinks(raw);
check("非法 url 项被剔除",
  cleaned.items.map(i=>i.id), ["l_b"]);
check("合法项保留 name/url/icon",
  cleaned.items[0],
  { id:"l_b", name:"Yt", url:"https://yt.com", icon:"" });

// --- moveItem ---
const arr = [{id:"a",n:1},{id:"b",n:2},{id:"c",n:3},{id:"d",n:4}];
check("move b → 末位",
  moveItem(arr, "b", 3).map(x=>x.id), ["a","c","d","b"]);
check("move d → 0 位",
  moveItem(arr, "d", 0).map(x=>x.id), ["d","a","b","c"]);
check("move a → 1 位",
  moveItem(arr, "a", 1).map(x=>x.id), ["b","a","c","d"]);
check("move 未知 id 不变",
  moveItem(arr, "z", 2).map(x=>x.id), ["a","b","c","d"]);
check("move 越界 toIndex 截断到末位",
  moveItem(arr, "a", 99).map(x=>x.id), ["b","c","d","a"]);
check("move 负 toIndex 钳到 0",
  moveItem(arr, "d", -5).map(x=>x.id), ["d","a","b","c"]);
check("move 非数组入参",
  moveItem(null, "a", 0), []);

lines.push("");
lines.push(`总计 ${pass} pass / ${fail} fail`);
document.getElementById("out").textContent = lines.join("\n");
</script>
</body>
</html>
```

- [ ] **Step 2: 验证测试失败**

跑 Node vm harness（确保 links.js 不存在时 inline 脚本能干净失败）：

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const html=fs.readFileSync("tests/links.test.html","utf8");
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const sb={}; sb.window=sb;
sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
vm.createContext(sb);
try { vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+inline,sb); }
catch(e){ console.log("THREW:",e.message); }
console.log((sb.__out||"").split("\n").filter(l=>l.startsWith("总计")||l.startsWith("FAIL")).slice(0,3).join("\n"));
'
```

Expected: 报错 `ReferenceError: parseHost is not defined`（因为 `tests/links.test.html` 里 `<script src="../links.js">` 在 vm 上下文里不会被执行，所以 inline 脚本访问不到 `parseHost` 等）。这就是期望的"失败"信号——脚本根本跑不完，更不会输出任何"总计"行。

- [ ] **Step 3: 写最小实现**

创建 `links.js`（本任务仅写纯函数区）：

```js
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
  if (typeof input !== "string" || !input.trim()) return "";
  let url;
  try { url = new URL(input); } catch (_) { return ""; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  const host = url.hostname.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function nameFromHost(host) {
  if (!host) return "";
  const parts = host.split(".");
  const tail = parts[parts.length - 1];
  const core = PUBLIC_SUFFIXES.includes(tail) && parts.length >= 2
    ? parts[parts.length - 2]
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
```

- [ ] **Step 4: 验证测试通过**

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const html=fs.readFileSync("tests/links.test.html","utf8");
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const sb={}; sb.window=sb;
sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
vm.createContext(sb);
vm.runInContext(
  fs.readFileSync("main.js","utf8")+"\n"+
  fs.readFileSync("links.js","utf8")+"\n"+
  inline, sb);
const out=(sb.__out||"").split("\n").filter(l=>l.startsWith("总计")||l.startsWith("FAIL")).join("\n");
console.log(out);
'
```

Expected: 仅一行 `总计 42 pass / 0 fail`（无任何 FAIL 行）。注：测试页共 42 个 `check()` 调用（7 parseHost + 11 nameFromHost + 3 iconUrlForHost + 7 validateLinkUrl + 5 sanitizeLinks 整体回退 + 2 sanitizeLinks 字段净化 + 7 moveItem）。

- [ ] **Step 5: 提交**

```bash
git add tests/links.test.html links.js
git commit -m "feat: pure-function layer for quick links (parse, sanitize, reorder)"
```

---

### Task 3: links.js 存储封装

**Files:**
- Modify: `links.js`（追加「存储区」三个函数）

**Interfaces:**
- Consumes: Task 2 的 `STORAGE_KEY_LINKS`、`DEFAULT_LINKS`、`sanitizeLinks`
- Produces:
  - `linksStorageAvailable()` → Boolean（与 settings.js 的 `storageAvailable` 等价；本文件内独立实现，因 main.js 未暴露，避免互相依赖）
  - `loadLinks()` → Promise<{items}>`；无存储/字段损坏 → `DEFAULT_LINKS` 浅拷贝
  - `saveLinks(links)` → Promise<void>；无存储 → resolve(void)

- [ ] **Step 1: 实现**

在 `links.js` 末尾追加「存储区」分区标题与函数：

```js
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
```

- [ ] **Step 2: vm 验证**

```bash
node -e '
const fs=require("fs"),vm=require("vm");
function run(extraSb){
  const sb=Object.assign({window:{}},extraSb||{});
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("links.js","utf8"),sb);
  return sb;
}
// 1) 无 chrome: 走默认
let r1=run();
r1.loadLinks().then(b=>console.log("no-chrome loadLinks:",JSON.stringify(b)));
// 2) 假 chrome: 写入后读回
let fake={storage:{local:{store:{},get(ks,cb){const out={};for(const k of ks)if(k in this.store)out[k]=this.store[k];cb(out);},set(o){Object.assign(this.store,o);}}}};
let r2=run({chrome:fake});
r2.saveLinks({items:[{id:"x",name:"X",url:"https://x.com",icon:""}]})
  .then(()=>r2.loadLinks())
  .then(b=>console.log("with-chrome roundtrip:",JSON.stringify(b)));
// 3) 损坏数据
fake.storage.local.store={links:{items:[{id:"y",name:"Y",url:"javascript:x"}]}};
r2.loadLinks().then(b=>console.log("corrupt data:",JSON.stringify(b)));
'
```

Expected: 末行输出三项依次：
- `no-chrome loadLinks: {"items":[]}`
- `with-chrome roundtrip: {"items":[{"id":"x","name":"X","url":"https://x.com","icon":""}]}`
- `corrupt data: {"items":[]}`（`javascript:` url 被 `validateLinkUrl` 拒绝，整条丢弃）

- [ ] **Step 3: 提交**

```bash
git add links.js
git commit -m "feat: chrome.storage layer for quick links"
```

---

### Task 4: 页面卡片渲染（首次进入即生效）

**Files:**
- Modify: `newtab.html`（在 `.stage` 之后插入 `<div id="cards" class="cards" aria-label="快捷入口"></div>`；插入 `<script src="links.js"></script>` 于 main.js 之后、settings.js 之前）
- Modify: `style.css`（追加 `.cards` 与 `.card` 样式）
- Modify: `links.js`（追加「渲染区」+ 启动行）

**Interfaces:**
- Consumes: Task 2 的 `nameFromHost`、`iconUrlForHost`；Task 3 的 `loadLinks`、`saveLinks`
- Produces:
  - `fallbackColor(host)` → 形如 `"hsl(123, 60%, 55%)"` 的稳定色（用于 favicon 失败时首字母色块）
  - `renderCard(item, index)` → 单个 `<a>` 元素的 DOM 构造（外层 `<a class="card" draggable="true">`，内含 `<img class="card-icon">` 与 `<span class="card-name">`）
  - `renderCards(items)` → 整体替换 `#cards` 内部
  - `initLinks()` → 加载并渲染；启动行末尾守卫

- [ ] **Step 1: 修 newtab.html**

在 `<main class="stage">...</main>` 闭合之后、`<button id="motab-gear">` 之前插入：

```html
<div id="cards" class="cards" aria-label="快捷入口"></div>
```

底部脚本块改为（保持 settings.js 已有）：

```html
<script src="main.js"></script>
<script src="links.js"></script>
<script src="settings.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 2: 修 style.css**

在文件末尾（`.status.is-error` 之后）追加：

```css
/* ---- 快捷入口卡片区 ---- */

.cards {
  position: relative;
  z-index: 3;
  margin-top: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 96px));
  gap: 12px;
  justify-content: center;
  padding: 0 16px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 64px;
  text-decoration: none;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  user-select: none;
  transition: transform 0.15s ease;
  cursor: grab;
}

.card:hover { transform: scale(1.08); }
.card.is-dragging { opacity: 0.4; cursor: grabbing; }

.card-icon-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 10px;
}

.card-fallback {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  border-radius: 10px;
}

.card.is-fallback .card-fallback { display: flex; }
.card.is-fallback .card-icon { display: none; }

.card-name {
  font-size: 12px;
  line-height: 1.2;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
```

- [ ] **Step 3: links.js 追加渲染与启动**

在「存储区」之后追加：

```js
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
```

- [ ] **Step 4: vm 验证（不依赖真实 favicon）**

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const sb={window:{}};
sb.document={createElement:(tag)=>{
  const el={tag,className:"",dataset:{},style:{},children:[],attributes:{},set href(v){el.href=v;},set src(v){el.src=v;},set textContent(v){el.__text=v;},appendChild(c){el.children.push(c);c.parentNode=el;},setAttribute(k,v){el[k]=v;},addEventListener(){}};
  el.replaceChildren=()=>{el.children=[];};
  el.querySelector=()=>null;
  return el;
},createTextNode:(t)=>({t}),getElementById:(id)=> id==="cards" ? {replaceChildren:()=>{},appendChild:()=>{}} : null};
vm.createContext(sb);
vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("links.js","utf8"),sb);
const fake={items:[{id:"l1",name:"Github",url:"https://github.com",icon:""},{id:"l2",name:"",url:"https://x.com",icon:"https://e/x.png"}]};
sb.renderCards(fake);
// fallbackColor 哈希稳定性
console.log("fallback github:", sb.fallbackColor("github.com"));
console.log("fallback github again:", sb.fallbackColor("github.com"));
console.log("fallback x.com:", sb.fallbackColor("x.com"));
'
```

Expected: 同一 host 两次调用返回相同 hsl 字符串；不同 host 颜色不同；无报错。

- [ ] **Step 5: 提交**

```bash
git add newtab.html style.css links.js
git commit -m "feat: render quick-link cards on the new-tab page"
```

---

### Task 5: 面板分标签 + 现有背景面板重构

**Files:**
- Modify: `newtab.html`（重构 `#motab-panel` 内部为 `role="tablist"` + 两个 `role="tabpanel"`）
- Modify: `style.css`（追加标签页样式 + 把面板宽度从 280px 适当扩到 320px）
- Modify: `settings.js`（齿轮 `aria-label` 改「设置」；面板点击外部关闭逻辑改为只对非标签元素生效；启动行保持；初始化不变）

**Interfaces:**
- Consumes: settings.js 现有全部背景交互函数
- Produces: 现有面板的 HTML 结构改造后，视觉与功能完全保留
  - `#motab-panel` 顶部增加 `<div class="tabs" role="tablist"><button role="tab" data-tab="bg" aria-selected="true">背景</button><button role="tab" data-tab="links" aria-selected="false">快捷入口</button></div>`
  - 现有所有背景控件包进 `<div class="tabpanel" data-tab="bg" role="tabpanel" hidden>...</div>`
  - 留一个空容器 `<div class="tabpanel" data-tab="links" role="tabpanel" hidden></div>`（Task 6 填充内容）
  - 标签切换脚本在 `links.js` 里统一实现（settings.js 不知道有哪些标签）—— 见 Step 2 协议

- [ ] **Step 1: newtab.html 改造面板 DOM**

把当前的：

```html
<section id="motab-panel" class="panel" hidden>
  <h2>背景设置</h2>
  <div class="row">...</div>
  ...
  <p id="bg-status" class="status" role="status"></p>
</section>
```

替换为：

```html
<section id="motab-panel" class="panel" hidden>
  <div class="tabs" role="tablist">
    <button type="button" class="tab" role="tab" data-tab="bg" aria-selected="true" aria-controls="panel-bg">背景</button>
    <button type="button" class="tab" role="tab" data-tab="links" aria-selected="false" aria-controls="panel-links">快捷入口</button>
  </div>
  <div id="panel-bg" class="tabpanel" data-tab="bg" role="tabpanel">
    <h2>背景设置</h2>
    <div class="row">
      <label class="btn-upload">上传图片<input type="file" id="bg-file" accept="image/*" hidden></label>
      <button type="button" id="bg-reset">恢复默认</button>
    </div>
    <div class="row">
      <input type="url" id="bg-url" placeholder="粘贴图片 URL（http/https）">
      <button type="button" id="bg-url-apply">应用</button>
    </div>
    <div class="slider-row">
      <span>蒙版深浅</span>
      <input type="range" id="bg-dim" min="0" max="100" step="1">
      <output id="bg-dim-val">25%</output>
    </div>
    <div class="slider-row">
      <span>背景模糊</span>
      <input type="range" id="bg-blur" min="0" max="20" step="1">
      <output id="bg-blur-val">0px</output>
    </div>
    <p id="bg-status" class="status" role="status"></p>
  </div>
  <div id="panel-links" class="tabpanel" data-tab="links" role="tabpanel" hidden></div>
</section>
```

齿轮按钮 `aria-label` 改为「设置」：

```html
<button id="motab-gear" class="gear" aria-label="设置">&#9881;</button>
```

- [ ] **Step 2: style.css 追加标签页样式**

在文件末尾追加：

```css
/* ---- 面板标签页 ---- */

.tabs {
  display: flex;
  gap: 4px;
  margin: -4px -4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 4px;
}

.tab {
  flex: 1;
  padding: 6px 0 8px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab[aria-selected="true"] {
  color: #fff;
  border-bottom-color: #fff;
}

.tab:hover { color: rgba(255, 255, 255, 0.85); }

.panel { width: 320px; } /* 覆写 280px */
```

- [ ] **Step 3: settings.js 启用 tab 协议 + 修复关闭逻辑**

`initSettings()` 之前插入「标签切换协议」实现 + 启动行追加。`bindPanel()` 内点击外部关闭逻辑改为忽略 `.tab` 区域（settings.js 不知道有哪些 tab 元素，所以用更宽松的「target 是 panel 内的非 tab 子元素时忽略」规则 —— 实际：保留「点 panel 外部关闭」，同时点 tab 时既不关闭也不冒泡，settings.js 不用改这段；切换逻辑统一由 links.js 的「标签总线」处理）。

在 `initSettings` 函数体内、`bindPanel()` 之前/之后插入：

```js
// --- 标签页协议：任何文件可调用 switchTab("bg"|"links") ---
window.switchTab = function(name) {
  document.querySelectorAll(".tab").forEach(b => {
    const sel = b.dataset.tab === name;
    b.setAttribute("aria-selected", sel ? "true" : "false");
  });
  document.querySelectorAll(".tabpanel").forEach(p => {
    p.hidden = p.dataset.tab !== name;
  });
  if (location.hash !== "#" + name) {
    history.replaceState(null, "", "#" + name);
  }
};

// 打开面板时根据 hash 决定默认标签
function openPanelToTab() {
  const hash = location.hash.replace("#", "");
  const target = (hash === "links" || hash === "bg") ? hash : "bg";
  switchTab(target);
}
```

修改 `openPanel` 闭包：把它改为调 `openPanelToTab` 而非 `panel.hidden = false; gear.classList.add("is-visible");`。原 `openPanel` 改成：

```js
const openPanel = () => {
  clearTimeout(idleTimer);
  openPanelToTab();
  gear.classList.add("is-visible");
};
```

点击外部关闭逻辑：原 `if (!panel.contains(e.target) && e.target !== gear) closePanel();` 保持不变——它点 panel 内部任何东西都不关闭，恰好兼容新结构。

- [ ] **Step 4: 验证背景功能不破**

- `node --check settings.js` PASS
- 跑 `tests/background.test.html` vm harness：仍 23 pass / 0 fail
- 跑 `tests/links.test.html` vm harness：仍 42 pass / 0 fail（注意 main.js + links.js 都要加载，但本任务不依赖 links.js 的标签切换函数，因此只验证两个测试不破即可）

- [ ] **Step 5: 提交**

```bash
git add newtab.html style.css settings.js
git commit -m "refactor: split settings panel into tabbed UI (bg / links)"
```

---

### Task 6: 快捷入口面板编辑器

**Files:**
- Modify: `links.js`（追加「面板编辑区」+ 启动行 + 注册 hash→tab 联动）
- Modify: `style.css`（追加列表行、添加表单、编辑按钮样式）

**Interfaces:**
- Consumes: Task 2 全部纯函数；Task 3 存储；Task 5 `window.switchTab` 协议；`el`、`debounce` 来自 main.js
- Produces:
  - `currentLinks` 模块级数组（启动时从 `loadLinks()` 填充）
  - `renderLinksList()` → 替换 `#link-list` 内部：每行含拖拽手柄、缩略图、name、url、删除按钮；空时显示提示文字
  - `bindLinksPanel()` → 挂载添加表单事件：Link `blur`/`Enter` → 自动填充 Name/Icon；保存按钮校验 URL；保存后清空表单并重新渲染
  - `bindPanelDropZone()` → 挂载列表内拖拽事件（实现同 Task 7 的 `moveItem` 流程；Task 7 再加页面卡片）
  - `initLinksPanel()` → 第一次挂载面板交互；同时在 `initLinks()` 之后挂载；面板 openPanel 时确保 #panel-links 已被 `bindLinksPanel` 初始化（仅一次）

- [ ] **Step 1: style.css 追加列表与表单样式**

在文件末尾追加：

```css
/* ---- 面板：快捷入口编辑器 ---- */

#panel-links .empty {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  text-align: center;
  padding: 12px 0;
}

.link-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.link-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  cursor: grab;
  font-size: 12px;
}

.link-row.is-dragging { opacity: 0.4; }
.link-row.drop-before { box-shadow: inset 0 2px 0 #fff; }
.link-row.drop-after  { box-shadow: inset 0 -2px 0 #fff; }

.link-row .handle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  user-select: none;
}

.link-row img {
  width: 20px; height: 20px; border-radius: 4px; object-fit: contain;
  background: rgba(255, 255, 255, 0.1);
}

.link-row .meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.link-row .meta strong {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-row .meta span {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-row button.del {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
}

.link-row button.del:hover { color: #ff9d9d; }

.link-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.link-form input {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 12px;
  outline: none;
}

.link-form .form-row {
  display: flex; gap: 6px;
}

.link-form button {
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.link-form button:hover { background: rgba(255, 255, 255, 0.22); }
.link-form button.primary { background: rgba(120, 200, 255, 0.4); }
.link-form button.primary:hover { background: rgba(120, 200, 255, 0.6); }

.link-form .hint {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}

.link-form .hint.is-error { color: #ff9d9d; }
```

- [ ] **Step 2: links.js 追加面板编辑区**

在「存储区」之后追加：

```js
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
    row.appendChild(del);
    root.appendChild(row);
  }
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

// 在 initLinks 末尾追加：首次加载后渲染列表（面板即使未打开也准备好）
async function initLinks() {
  const links = await loadLinks();
  currentLinks = links.items;
  renderCards(currentLinks);
  bindLinksPanel();
  renderLinksList();
}
```

注意：因 `initLinks` 在 Task 4 已定义，**本任务 Step 2 整体覆盖**原 `initLinks` 实现（在「渲染区」分区内已有的 `async function initLinks` 替换为上面这一版本）。

启动行守卫保持不变：

```js
if (typeof document !== "undefined" && document.getElementById("cards")) {
  initLinks();
}
```

- [ ] **Step 3: vm 验证**

```bash
node -e '
const fs=require("fs"),vm=require("vm");
// 最小 DOM stub：支持 getElementById 查 cards/link-list/link-form-*，
// panel-links 的 innerHTML 走真实赋值
const sb={window:{}};
const stubEl={replaceChildren(){},appendChild(c){this.children=this.children||[];this.children.push(c);},innerHTML:"",querySelector(){return null;},style:{},addEventListener(){},setAttribute(){},classList:{add(){},remove(){}}};
const ids=["cards","link-list","link-form-url","link-form-name","link-form-icon","link-form-autofill","link-form-save","panel-links","link-form-save-status"];
sb.document={getElementById:(id)=> ids.includes(id) ? Object.assign({},stubEl) : null,createElement:(t)=>Object.assign({tag:t,style:{},classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},appendChild(c){this.children=this.children||[];this.children.push(c);},querySelector(){return null;}},stubEl),createTextNode:(t)=>({t})};
vm.createContext(sb);
vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("links.js","utf8"),sb);
// 验证纯函数 export 可用
console.log("makeId:", sb.makeId());
console.log("validateLinkUrl ok:", sb.validateLinkUrl("https://x.com"));
console.log("parseHost:", sb.parseHost("https://gh.com"));
console.log("nameFromHost:", sb.nameFromHost("gh.com"));
console.log("iconUrlForHost:", sb.iconUrlForHost("gh.com"));
// renderLinksList 路径：空状态
sb.currentLinks=[];
try { sb.renderLinksList(); console.log("empty render OK"); } catch(e){ console.log("empty FAIL:",e.message); }
sb.currentLinks=[{id:"a",name:"Gh",url:"https://gh.com",icon:""}];
try { sb.renderLinksList(); console.log("with-item render OK"); } catch(e){ console.log("with-item FAIL:",e.message); }
'
```

Expected: 全部输出 OK，无抛错；`makeId()` 返回形如 `l_xxxxxxxx` 字符串。

- [ ] **Step 4: 提交**

```bash
git add links.js style.css
git commit -m "feat: quick-links panel editor (add form, list, delete, autofill)"
```

---

### Task 7: 页面卡片拖拽排序 + 列表拖拽

**Files:**
- Modify: `links.js`（追加「拖拽区」+ 把 `renderLinksList` 行的拖拽事件补齐）
- Modify: `style.css`（追加拖拽时容器级占位样式，本任务若不需新规则可不动）

**Interfaces:**
- Consumes: Task 2 的 `moveItem`；Task 4 的 `renderCard`；Task 6 的 `renderLinksList`
- Produces:
  - `bindCardDrag()` → 挂在 `#cards` 容器上（事件代理），统一处理页面卡片拖拽
  - `bindListDrag()` → 挂在 `#link-list` 容器上（事件代理），统一处理列表行拖拽
  - 两者共用同一组事件处理：dragstart 记录 fromId，dragover 算目标索引并加视觉 class，drop 重排 + 落盘 + 重渲染
  - 卡片点击 vs 拖拽：mousedown 起 200ms 计时；超 200ms 且未移动 → 进入拖拽预备态（实际是浏览器原生 `draggable=true` 自动处理）
  - 拖拽落盘用 `debounce(persistAndRender, 200)`，且 drop 末尾强制再调一次

- [ ] **Step 1: style.css 追加占位/视觉类**

在文件末尾追加：

```css
/* ---- 拖拽视觉 ---- */

.cards.drop-before { box-shadow: inset 0 2px 0 #fff; }
.cards.drop-after  { box-shadow: inset 0 -2px 0 #fff; }
```

- [ ] **Step 2: links.js 追加拖拽区**

在「面板编辑区」之后追加：

```js
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

// 在 initLinks 末尾追加：
async function initLinks() {
  const links = await loadLinks();
  currentLinks = links.items;
  renderCards(currentLinks);
  bindLinksPanel();
  renderLinksList();
  attachDragHandlers(document.getElementById("cards"), ".card");
  attachDragHandlers(document.getElementById("link-list"), ".link-row");
}
```

**关键改动**：本任务 Step 2 整体覆盖 Task 6 已定义的 `initLinks` —— 在它末尾追加两行 `attachDragHandlers` 调用。

- [ ] **Step 3: vm 验证 moveItem 与索引计算**

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const sb={window:{}};
const stub={replaceChildren(){},appendChild(){},addEventListener(){},innerHTML:"",style:{},classList:{add(){},remove(){}},setAttribute(){},querySelector(){return null;},querySelectorAll:()=>[]};
sb.document={getElementById:()=>null,createElement:()=>Object.assign({},stub),createTextNode:()=>({})};
vm.createContext(sb);
vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("links.js","utf8"),sb);
const arr=[{id:"a"},{id:"b"},{id:"c"}];
// moveItem 已测：这里只验 attachDragHandlers 不崩 + 索引计算函数
const fakeContainer={querySelectorAll:()=>[{getBoundingClientRect:()=>({top:0,height:10})},{getBoundingClientRect:()=>({top:50,height:10})},{getBoundingClientRect:()=>({top:100,height:10})}],addEventListener(){},classList:{add(){},remove(){},toggle(){}}};
console.log("indexFromPoint y=5:", sb.indexFromPoint(fakeContainer,0,5,".x"));   // 0
console.log("indexFromPoint y=55:", sb.indexFromPoint(fakeContainer,0,55,".x")); // 1
console.log("indexFromPoint y=200:", sb.indexFromPoint(fakeContainer,0,200,".x")); // 3 (尾)
console.log("findCardOrRow:", sb.findCardOrRow({closest:s=>s?{dataset:{id:"x"}}:null}).dataset.id);
'
```

Expected: 索引依次 `0 / 1 / 3`；`findCardOrRow` 返回 `{id:"x"}`；无抛错。

- [ ] **Step 4: 提交**

```bash
git add links.js style.css
git commit -m "feat: drag-to-reorder for page cards and panel list"
```

---

### Task 8: 文档与版本号

**Files:**
- Modify: `README.md`（功能列表追加快捷入口；新增「快捷入口」章节）
- Modify: `manifest.json`（version 1.1.0 → 1.2.0）
- Modify: `newtab.html`（如果需要，挂载 `links.js`）—— **已在 Task 4 步骤 1 完成**，本任务不再改

**Interfaces:**
- Consumes: 无
- Produces: 用户可见的文档与正确的版本号

- [ ] **Step 1: 升版本号**

`manifest.json` 中 `"version": "1.1.0"` 改为 `"version": "1.2.0"`，其他不动。

- [ ] **Step 2: README 追加「快捷入口」章节与项目结构**

「功能特性」段尾追加一条：

```markdown
- **快捷入口**:时钟下方可添加常用网站图标网格,支持上传/拖拽排序/DuckDuckGo 图标自动获取,设置面板「快捷入口」标签内可管理
```

在 `## 个性化问候名字` 之前插入新章节：

```markdown
## 快捷入口

新标签页时钟下方是一排快捷入口卡片,点击直达。点齿轮 → 「快捷入口」标签管理:

- **添加条目**:输入 Link,失焦或按回车自动从 DuckDuckGo 推导 Name 与 Icon,可手改后保存
- **拖拽排序**:页面卡片和面板列表均支持鼠标拖拽改变顺序
- **删除**:面板列表每行右侧 `×`
- **favicon 失败回退**:DDG 返回 404 时显示首字母色块,不报错

无需联网即可使用已添加的条目;首次拉取图标时需联网。

## 个性化问候名字
```

更新「项目结构」树:

```markdown
```
motab/
├── manifest.json              # Chrome MV3 扩展清单(覆盖新标签页)
├── main.js                    # 共享工具:el / debounce / clamp 们
├── newtab.html                # 页面结构:时钟 / 日期 / 问候 / 卡片 / 设置面板
├── style.css                  # 样式:背景图层 + 蒙版 + 面板标签页 + 卡片网格
├── app.js                     # 运行时逻辑:每秒刷新、问候分档
├── settings.js                # 背景设置(面板「背景」标签)
├── links.js                   # 快捷入口(渲染、面板、存储、拖拽)
├── assets/
│   └── wallpaper.jpg          # 内置默认背景图
├── tests/
│   ├── greeting.test.html     # greetingFor 分档边界测试页
│   ├── background.test.html   # 背景纯函数测试页
│   └── links.test.html        # 快捷入口纯函数测试页
└── docs/superpowers/          # 设计文档与实施计划
```
```
```

- [ ] **Step 3: 全套测试与语法体检**

```bash
node --check main.js && node --check settings.js && node --check links.js && node --check app.js && echo SYNTAX_OK
python3 -c "import json; [json.load(open(f)) and print('JSON_OK: '+f) for f in ['manifest.json']]"
```

然后并行跑两个 vm harness：

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const sb={window:{}}; sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
vm.createContext(sb);
vm.runInContext(fs.readFileSync("main.js","utf8")+"\n"+fs.readFileSync("settings.js","utf8")+"\n"+fs.readFileSync("background_test_inline.js","utf8"),sb);
' # 这里用 -e 直接内联读取 background.test.html
```

直接执行（更清晰）：

```bash
node -e '
const fs=require("fs"),vm=require("vm");
const runOne=(page,prefix)=>{
  const html=fs.readFileSync(page,"utf8");
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
  const sb={window:{}}; sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
  vm.createContext(sb);
  const loadFiles = (page==="tests/background.test.html") ? "main.js\nsettings.js\n" : (page==="tests/links.test.html") ? "main.js\nlinks.js\n" : "";
  const sources = loadFiles.split("\n").filter(Boolean).map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\n"+inline;
  vm.runInContext(sources,sb);
  const summary=(sb.__out||"").split("\n").filter(l=>l.startsWith("总计")).pop();
  console.log(page+": "+summary);
};
runOne("tests/background.test.html");
runOne("tests/links.test.html");
'
node -e '
const fs=require("fs"); const html=fs.readFileSync("tests/greeting.test.html","utf8");
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const vm=require("vm"); const sb={window:{}};
sb.document={getElementById:(id)=> id==="out" ? {set textContent(v){sb.__out=v;}} : null};
vm.createContext(sb); vm.runInContext(inline,sb);
console.log("tests/greeting.test.html: "+(sb.__out||"").split("\n").filter(l=>l.startsWith("总计")).pop());
'
```

Expected: 三个测试页分别 `总计 23 pass / 0 fail`、`总计 42 pass / 0 fail`、`总计 11 pass / 0 fail`；SYNTAX_OK；JSON_OK。

- [ ] **Step 4: 提交**

```bash
git add manifest.json README.md
git commit -m "docs: bump version 1.2.0, document quick links feature"
```

---

## 收工确认

- [ ] `git log --oneline` 自上而下：Task 8 → T7 → T6 → T5 → T4 → T3 → T2 → T1 的 8 个 feat/refactor/docs commit
- [ ] `grep -rn "TODO\|TBD\|FIXME" links.js main.js settings.js newtab.html style.css` 无结果
- [ ] 三个测试页全绿
- [ ] 工作区干净
- [ ] 人工验收（推迟到用户在真实 Chrome 扩展里执行）：
  1. 加载扩展后,新标签页时间/日期/问候正常显示,快捷入口区初始为空
  2. 移动鼠标 → 齿轮淡入 → 点击 → 面板弹出,「背景」标签为默认
  3. 切换到「快捷入口」标签,输入 `https://github.com` → 失焦,自动填入 Name=`Github`、Icon=`https://icons.duckduckgo.com/ip3/github.com.ico`
  4. 点保存,关闭面板,新标签页出现 Github 卡片
  5. 卡片 favicon 加载完成后显示真实图标;断网时显示「G」首字母色块
  6. 在面板里添加 2-3 个不同条目,关闭面板,拖拽页面卡片改变顺序,刷新页面后顺序保持
  7. 面板「快捷入口」标签里也可拖拽,顺序同步到页面卡片
  8. 删除某条目,刷新后该条目不再出现
  9. `chrome://extensions` 重新加载,所有数据保留
  10. URL 校验:输入 `not a url` 或 `ftp://...` → 状态提示「链接格式不正确」,不写入
  11. DevTools Console 全程无红色报错
  12. 关闭整个浏览器再启动,所有快捷入口与背景设置都保留
