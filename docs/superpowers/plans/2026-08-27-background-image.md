# MoTab 自定义背景设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新标签页内提供背景图设置能力（上传/URL、蒙版滑杆、模糊滑杆、恢复默认），持久化到 `chrome.storage.local`。

**Architecture:** 纯 HTML/CSS/JS MV3 扩展。新增 `settings.js` 一个文件承载全部背景逻辑：底部为可在浏览器直接断言的纯函数层（数据清洗、尺寸计算），向上依次是渲染函数、存储封装、面板交互。`newtab.html` 增加背景图层与设置面板 DOM，`style.css` 增加对应样式并把 `body` 背景迁移到专用图层。

**Tech Stack:** 无框架、无构建工具的原生 JS；Chrome Extensions Manifest V3 API（仅 `chrome.storage.local`）。

**Spec:** `docs/superpowers/specs/2026-08-27-background-image-design.md`

## Global Constraints

- 纯 HTML/CSS/JS，无构建工具、零第三方依赖；`app.js` 不做任何修改。
- Chrome MV3；只使用已有 `storage` 权限，manifest 不新增任何 permission。
- 一切 `chrome.*` 访问必须经 `storageAvailable()` 守卫——在 `python3 -m http.server` 开发预览或 `file://` 下优雅降级为出厂值，绝不抛错白屏。
- 出厂默认值（所有代码共享同一常量）：`{ type:"default", data:"", url:"", dim:0.25, blur:0 }`。
- 固定参数：压缩长边 ≤ 3840px / JPEG 质量 0.85；齿轮闲置淡出 2500ms；滑杆落盘 debounce 300ms；URL 探测超时 8000ms；z-index 层级 `.bg`(0) → `.overlay`(1) → `.stage`(2) → `.gear`(10) → `.panel`(11)。
- UI 文案为中文，错误提示精确使用计划中给出的字符串：「无法识别该图片」「地址格式不正确」「无法加载该图片」「加载超时，请重试」「背景已更新」「已恢复默认」。
- 测试页模式沿用 `tests/greeting.test.html`：无框架、直接输出 PASS/FAIL 行 + 末尾总计行；但用 `<script src="../settings.js">` 引真实实现而非拷贝。
- 工作目录固定为仓库根 `/Users/puras/workspace/proj/106hz/motab`；沿用现有习惯直接在 `main` 分支提交，不建分支。

---

### Task 1: 预提交工作区既有修改

**Files:**
- Modify (commit only, 不改内容): `README.md`, `manifest.json`

**Interfaces:**
- Consumes: 无
- Produces: 干净的工作区；manifest 中正确的键名 `"chrome_url_overrides": { "newtab": "newtab.html" }`（后续任务在此基线上改版本号）

**背景说明（给零上下文的执行者）：** 工作区里有两个尚未提交的改动：README 大幅扩充、以及 manifest 中 `chrome_url_overrides` 键名从错误的 `new_tab` 修正为 MV3 正确的 `newtab`。spec 要求先把它们单独提交，再开始功能开发。这两个文件除了被提交外不做任何编辑。

- [ ] **Step 1: 确认改动内容符合预期**

Run: `git status --short && git diff --stat`
Expected: 输出包含 ` M README.md` 和 ` M manifest.json` 两行；diff stat 显示两者有改动且没有其他文件。

- [ ] **Step 2: 提交**

```bash
git add README.md manifest.json
git commit -m "chore: expand README, fix chrome_url_overrides key (new_tab -> newtab)"
```

- [ ] **Step 3: 验证工作区干净**

Run: `git status --short && git log --oneline -1`
Expected: 第一条命令无输出；log 最新一条为 `chore: expand README, fix chrome_url_overrides key (new_tab -> newtab)`。

---

### Task 2: 纯函数层（TDD）

**Files:**
- Create: `tests/background.test.html`
- Create: `settings.js`（本任务只写「纯函数区」，后续任务在其下方追加）

**Interfaces:**
- Consumes: 无（纯函数不得触碰 `chrome.*` 与面板 DOM）
- Produces（后续任务按这些精确签名调用，名字不可改动）:
  - `STORAGE_KEY` = `"bg"`
  - `DEFAULT_BG` — 冻结对象 `{ type:"default", data:"", url:"", dim:0.25, blur:0 }`
  - `clamp(v, min, max)` → Number；`v` 无法转为有限数时返回 `min`
  - `clamp01(v)` → 限定 [0,1]；`clampBlur(v)` → 限定 [0,20]
  - `numOrDefault(v, fallback)` → `v` 为有限数则原样返回，否则返回 `fallback`
  - `targetSize(w, h, maxEdge = 3840)` → `{ width, height }`；等比缩放使最长边等于 `maxEdge`，已在限内则原值返回，最小边长 1
  - `safeDataString(d)` → 以 `data:image/` 开头的字符串原样返回，否则 `""`
  - `safeUrlString(u)` → 以 `http://`/`https://` 开头且不含空白或引号的字符串原样返回，否则 `""`
  - `sanitizeSettings(raw)` → 归一化的 `{ type, data, url, dim, blur }` 对象

- [ ] **Step 1: 写失败测试页**

创建 `tests/background.test.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>background 测试</title></head>
<body>
<h1>background 纯函数测试</h1>
<pre id="out">运行中...</pre>
<script src="../settings.js"></script>
<script>
let pass = 0, fail = 0;
const lines = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) pass++; else fail++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}  expect=${e}  got=${a}`);
}

// --- sanitizeSettings 整体回退 ---
check("sanitize(undefined)", sanitizeSettings(undefined), DEFAULT_BG);
check("sanitize(null)", sanitizeSettings(null), DEFAULT_BG);
check("sanitize(number)", sanitizeSettings(42), DEFAULT_BG);

// --- sanitizeSettings 字段级 ---
check("合法 data 全字段",
  sanitizeSettings({ type:"data", data:"data:image/jpeg;base64,AA",
                     url:"javascript:x", dim:-2, blur:99 }),
  { type:"data", data:"data:image/jpeg;base64,AA", url:"", dim:0, blur:20 });
check("未知 type 回退 default",
  sanitizeSettings({ type:"bogus" }).type, "default");
check("dim 非数字取默认",
  sanitizeSettings({}).dim, 0.25);
check("blur 非数字取默认",
  sanitizeSettings({}).blur, 0);
check("url 类型缺 url 回退 default",
  sanitizeSettings({ type:"url", url:"" }).type, "default");
check("data 类型缺 data 回退 default",
  sanitizeSettings({ type:"data" }).type, "default");
check("非 http(s) URL 清空",
  sanitizeSettings({ type:"url", url:"ftp://a.com/x.png" }),
  { type:"default", data:"", url:"", dim:0.25, blur:0 });
check("含引号 URL 清空",
  sanitizeSettings({ type:"url", url:'https://a.com/x")y' }).url, "");

// --- clamp01 / clampBlur ---
check("clamp01 下界",   clamp01(-0.5), 0);
check("clamp01 中间值", clamp01(0.37), 0.37);
check("clamp01 上界",   clamp01(1.7),  1);
check("clamp01 NaN 返 min", clamp01(NaN), 0);
check("clampBlur 负值", clampBlur(-3),  0);
check("clampBlur 范围内", clampBlur(9.5), 9.5);
check("clampBlur 上界", clampBlur(25), 20);

// --- targetSize ---
check("小图原样", targetSize(1920, 1080), { width:1920, height:1080 });
check("宽图缩放", targetSize(8000, 4000), { width:3840, height:1920 });
check("竖图长边为准", targetSize(1000, 2000), { width:1000, height:2000 });
check("超大竖图", targetSize(2560, 9000), { width:1092, height:3840 });
check("四舍五入", targetSize(7000, 3000), { width:3840, height:1646 });

lines.push("");
lines.push(`总计 ${pass} pass / ${fail} fail`);
document.getElementById("out").textContent = lines.join("\n");
</script>
</body>
</html>
```

- [ ] **Step 2: 起本地服务并验证测试失败**

Run: `python3 -m http.server 8765`（后台运行），浏览器打开 `http://127.0.0.1:8765/tests/background.test.html`
Expected: 页面报错或全部 FAIL —— 因为 `../settings.js` 尚不存在（404）。总计行应显示大量 fail（如 `0 pass / 23 fail`）。若在 Claude Code 会话内执行，可用内置 browser 预览工具打开同一 URL 查看结果。

- [ ] **Step 3: 写最小实现**

创建 `settings.js`：

```js
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
```

- [ ] **Step 4: 验证测试通过**

浏览器刷新 `http://127.0.0.1:8765/tests/background.test.html`
Expected: 末行显示 `总计 23 pass / 0 fail`，且没有任何 FAIL 行。

- [ ] **Step 5: 提交**

```bash
git add settings.js tests/background.test.html
git commit -m "feat: pure-function layer for background settings (sanitizing, clamps, target size)"
```

---

### Task 3: 背景图层化渲染

**Files:**
- Modify: `newtab.html`（在 `<div class="overlay">` 之前插入背景层；`</main>` 之后挂载 settings.js）
- Modify: `style.css`（`body` 背景拆分；新增 `.bg` 规则；补全层级 z-index）
- Modify: `settings.js`（追加「渲染区」两个函数）

**Interfaces:**
- Consumes: Task 2 的 `DEFAULT_BG`、`sanitizeSettings` 签名（本任务只直接用到 `DEFAULT_BG` 作渲染示例入参）
- Produces:
  - HTML 元素：`<div id="bg-layer" class="bg" aria-hidden="true"></div>`，必须位于 `.overlay` 之前、`.stage` 之外
  - `backgroundSrcOf(bg)` → String：按 `bg.type` 返回 CSS 可用的图片源字符串（`"data"` → `bg.data`；`"url"` → `bg.url`；其余 → `"assets/wallpaper.jpg"`）
  - `applyBackground(bg)` → void：写 `#bg-layer` 的 `background-image`、`filter: blur(Npx)`、`scale(1.06)`（仅当 `blur > 0`），并写 `.overlay` 的 `opacity = dim`

- [ ] **Step 1: 修改 newtab.html**

将 body 开头的 `<div class="overlay"></div>` 替换为两行：

```html
<div id="bg-layer" class="bg" aria-hidden="true"></div>
<div class="overlay"></div>
```

在 `</main>` 之后、`<script src="app.js"></script>` 之前插入一行：

```html
<script src="settings.js"></script>
```

- [ ] **Step 2: 修改 style.css**

把现有规则：

```css
body {
  background: #1a1a1a url("assets/wallpaper.jpg") center/cover no-repeat fixed;
}
```

替换为：

```css
body {
  background: #1a1a1a;
}

/* 背景专用图层：模糊滤镜只作用于此层，不影响文字 */
.bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: #1a1a1a center/cover no-repeat;
}
```

给现有 `.overlay` 规则追加一行 `z-index: 1;`；给现有 `.stage` 规则追加一行 `z-index: 2;`（其原本已有 `position: relative`）。

- [ ] **Step 3: 在 settings.js 追加渲染函数**

在文件末尾追加：

```js
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
```

最后一行 demo 导出只为人工冒烟验证存在；确认后可在提交前保留（无害）或删除。删除则同步删去本步骤注释中提及它的句子。

- [ ] **Step 4: 人工回归验证（重构不改观感）**

1. 打开 `chrome://extensions/`，确保 MoTab 已以「加载已解压的扩展程序」方式载入并点击「重新加载」
2. 新开标签页
3. Expected: 外观与改造前完全一致（wallpaper.jpg 背景 + 25% 蒙版 + 时钟）；新标签页 DevTools Console 无红色报错；Elements 里能看到 `.bg` 图层且其 computed `opacity` 位于 `.overlay` 上（25%）
4. （可选）Console 执行 `__applyBackgroundDemo()` → 蒙版应变深至 50%，再次开新标签页恢复 25%

- [ ] **Step 5: 提交**

```bash
git add newtab.html style.css settings.js
git commit -m "feat: dedicated background layer with applyBackground renderer"
```

---

### Task 4: 存储封装

**Files:**
- Modify: `settings.js`（追加「存储区」三个函数 + `debounce`）

**Interfaces:**
- Consumes: Task 2 的 `STORAGE_KEY`、`DEFAULT_BG`（展开拷贝）、`sanitizeSettings(raw)`
- Produces:
  - `storageAvailable()` → Boolean
  - `loadBg()` → Promise&lt;Bg&gt;；`Bg` 指 `sanitizeSettings` 的返回形状。守卫失败立即 resolve `{...DEFAULT_BG}`
  - `saveBg(bg)` → Promise&lt;void&gt;；守卫失败 resolve(void)，成功写入 `{ [STORAGE_KEY]: bg }`
  - `debounce(fn, wait)` → 包装后的函数（标准 trailing-edge 实现）

- [ ] **Step 1: 实现（无自动化测试环境，靠 Step 2 的 DevTools 控制台逐条验证）**

在 `settings.js` 末尾追加：

```js
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

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
```

- [ ] **Step 2: DevTools 冒烟验证**

1. 「重新加载」扩展，新开标签页并打开 DevTools Console
2. 执行 `storageAvailable()` → Expected: `true`
3. 执行 `await loadBg()` → Expected: `{type: "default", data: "", url: "", dim: 0.25, blur: 0}`
4. 执行 `await saveBg({...DEFAULT_BG, dim: 0.6})`，然后 `await chrome.storage.local.get("bg")` → Expected: `dim` 为 `0.6`
5. 执行 `await saveBg({type:"data"})` 再 `await loadBg()` → Expected: `type` 被净化回 `"default"`（损坏数据不致崩溃）

- [ ] **Step 3: 还原测试写入的数据并提交**

在 Console 执行 `await chrome.storage.local.remove("bg")` 清掉冒烟残留，然后：

```bash
git add settings.js
git commit -m "feat: chrome.storage layer for background settings"
```

---

### Task 5: 设置面板完整交互 + 文档 + 版本号

**Files:**
- Modify: `newtab.html`（齿轮按钮 + 面板 DOM）
- Modify: `style.css`（齿轮淡入淡出 + 面板全套样式）
- Modify: `settings.js`(追加「上传处理区」「面板交互区」+ 启动行)
- Modify: `manifest.json`（version → `1.1.0`）
- Modify: `README.md`（更换背景章节重写 + 功能列表补充）

**Interfaces:**
- Consumes: 前 4 个任务的全部产物，逐字对照：
  - 函数：`applyBackground(bg)`、`loadBg()`、`saveBg(bg)`、`debounce(fn, wait)`、`sanitizeSettings`（间接）、`clamp01/clampBlur`（预览时夹取滑杆值）、`targetSize(w,h,maxEdge=3840)`
  - HTML id（本任务创建，JS 必须严格同名）：`motab-gear`、`motab-panel`、`bg-file`、`bg-url`、`bg-url-apply`、`bg-reset`、`bg-dim`、`bg-dim-val`、`bg-blur`、`bg-blur-val`、`bg-status`（`#bg-layer` 已存在于 Task 3）
- Produces:
  - `normalizeImageToDataUrl(file, maxEdge = 3840, quality = 0.85)` → Promise&lt;dataURL字符串&gt;
  - `probeImageUrl(url, timeoutMs = 8000)` → Promise&lt;url字符串&gt;
  - 异步启动入口 `initSettings()` + 文件末尾启动行 `if (typeof document !== "undefined" && document.getElementById("motab-gear")) { initSettings(); }`

- [ ] **Step 1: newtab.html 加入齿轮与面板**

在 `</main>` 之后、`<script src="settings.js"></script>` 之前插入：

```html
<button id="motab-gear" class="gear" aria-label="设置背景">&#9881;</button>
<section id="motab-panel" class="panel" hidden>
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
</section>
```

- [ ] **Step 2: style.css 追加面板样式**

在文件末尾追加：

```css
/* ---- 背景设置：齿轮按钮与面板 ---- */

.gear {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 18px;
  line-height: 36px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
  backdrop-filter: blur(4px);
}

.gear.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.gear:hover { background: rgba(255, 255, 255, 0.24); }

.panel {
  position: fixed;
  top: 62px;
  right: 18px;
  z-index: 11;
  width: 280px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(17, 17, 17, 0.88);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  color: #fff;
}

.panel h2 { font-size: 14px; font-weight: 500; margin: 0; }

.panel .row { display: flex; gap: 8px; }

.panel button,
.panel .btn-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.panel button:hover,
.panel .btn-upload:hover { background: rgba(255, 255, 255, 0.22); }

.panel button:disabled { opacity: 0.5; cursor: default; }

.panel .url-row input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  outline: none;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.85);
}

.slider-row input[type="range"] { flex: 1; accent-color: #fff; }

.slider-row output {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.status { min-height: 1em; margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.75); }
.status.is-error { color: #ff9d9d; }
```

- [ ] **Step 3: settings.js 追加上传处理与面板交互**

先在「存储区」之后追加「上传处理区」：

```js
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
```

再追加「面板交互区」（含启动逻辑）：

```js
// ============================================================
// 面板交互区
// ============================================================

let currentBg = { ...DEFAULT_BG };

function el(id) { return document.getElementById(id); }

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
```

同时把 Task 3 Step 3 加上的临时 `window.__applyBackgroundDemo` 行删掉。

- [ ] **Step 4: manifest.json 升版本**

`"version": "1.0.0"` 改为 `"version": "1.1.0"`（permission 数组不动）。

- [ ] **Step 5: 重写 README「更换背景」章节并补充功能特性**

`## 功能特性` 的第一条 `- **全屏背景**:...` 替换为：

```markdown
- **自定义背景**:页面右上角齿轮即可上传图片或粘贴 URL 作为背景，支持蒙版深浅、背景模糊调节，一键恢复默认；也可继续替换 `assets/wallpaper.jpg` 使用内置方式
```

`## 更换背景` 整节（原文标题到下一节标题前的全部内容）替换为：

```markdown
## 更换背景

在新标签页随意移动鼠标，右上角会出现 ⚙ 齿轮按钮，点击打开「背景设置」面板：

- **上传图片**：选择本地图片；自动压缩（长边 ≤ 3840px、JPEG 质量 0.85）后存入本地扩展存储，离线可用
- **粘贴 URL**：填入 http/https 图片地址点「应用」；保存前会先试加载，需联网显示
- **蒙版深浅**：拖动滑杆调节暗色蒙版透明度，保证时间文字清晰
- **背景模糊**：0–20px 磨砂效果
- **恢复默认**：回到内置壁纸及出厂蒙版/模糊设置

设置即时生效并自动保存（滑杆停止拖动约 0.3 秒后写入）。Esc 或点击面板外可关闭面板。

仍可直接替换 `assets/wallpaper.jpg` 并重新加载扩展使用静态背景（此时存储中没有自定义记录即可生效）。
```

- [ ] **Step 6: 全面人工验收清单**

按顺序逐条在真实扩展中验证（每步预期都写明，失败即止并修复再验）：

1. `chrome://extensions/` → 重新加载 → 新开标签页
2. 静置 3 秒 → 齿轮不可见；移动鼠标 → 右上角淡入；停住鼠标 2.5 秒 → 淡出
3. 点击齿轮 → 面板弹出，滑杆回显 `25%` / `0px`（对应上一步设置的当前值）；状态行为空
4. 拖蒙版滑杆 → 蒙版即时变化；松手等 1 秒 → 关闭标签页重开 → 蒙版保持拖后的值
5. 拖模糊滑杆到 6px → 背景糊化且四周无虚边缝隙；输出框显示 `6px`
6. 点「上传图片」选一张 >3840px 的大横图 → 秒级生效、文字仍清晰；重开标签页仍在；若选一张 `.txt` 或坏文件 → 状态行「无法识别该图片」且原背景不变
7. 在 `bg-url` 填 `not-a-url` 点应用 → 「地址格式不正确」
8. 填 `https://picsum.photos/1920/1080` 点应用 → 先「正在加载图片...」后「背景已更新」，背景变远程图；DevTools Network 断网后再开新标签页 → 该背景加载不出来（属 URL 来源固有约束），联网恢复即可
9. Esc → 面板关闭；再开面板，点击面板外空白处 → 关闭
10. 点「恢复默认」→ 内置 wallpaper.jpg 回归、滑杆回显 `25%`/`0px`、状态行「已恢复默认」
11. 关闭整个浏览器再启动，新开标签页 → 最后一次设置仍然生效（持久化跨重启）
12. 新标签页 DevTools Console 全程无红色报错

- [ ] **Step 7: 提交**

```bash
git add newtab.html style.css settings.js manifest.json README.md
git commit -m "feat: in-page background settings panel (upload/url, dim/blur sliders, reset)"
```

---

## 收工确认

- [ ] `git log --oneline` 自上而下出现：Task 5 feat → Task 4 → Task 3 → Task 2 → Task 1 chore
- [ ] `grep -rn "TODO\|TBD\|FIXME" settings.js newtab.html style.css` 无结果
- [ ] `tests/background.test.html` 打开后仍 `23 pass / 0 fail`
- [ ] README「项目结构」一节补充了 `settings.js` 与 `tests/background.test.html` 两个条目（结构树复制自下方，替换旧树）：

```markdown
```
motab/
├── manifest.json              # Chrome MV3 扩展清单(覆盖新标签页)
├── newtab.html                # 页面结构:时钟 / 日期 / 问候语 + 背景层与设置面板
├── style.css                  # 样式:背景图层 + 蒙版 + 设置面板 + 自适应字号
├── app.js                     # 运行时逻辑:每秒刷新、问候分档
├── settings.js                # 背景设置:纯函数层/渲染/存储/上传压缩/面板交互
├── assets/
│   └── wallpaper.jpg          # 内置默认背景图
├── tests/
│   ├── greeting.test.html     # greetingFor 分档边界测试页
│   └── background.test.html   # 背景纯函数测试页
└── docs/superpowers/          # 设计文档与实施计划
```
```
