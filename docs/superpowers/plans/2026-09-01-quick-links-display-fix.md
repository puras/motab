# MoTab 快捷入口 — 页面展示修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在 `newtab.html` 上看到自己添加的快捷入口卡片（紧贴问候语下方）。

**Architecture:** 把 `#cards` 容器从 `.stage` 的兄弟节点搬进 `.stage` 内作为最后一个子节点；CSS 改三处（`.stage` 用 `min-height`、`.cards` 删 `margin-top`、`html, body` 放开 `overflow`）。零 JS 改动。

**Tech Stack:** 无新增；仅 HTML 结构与 CSS 调整。

**Spec:** `docs/superpowers/specs/2026-09-01-quick-links-display-fix-design.md`

## Global Constraints

- 纯 HTML/CSS/JS，无构建工具、零第三方依赖；`links.js` / `settings.js` / `app.js` / `main.js` 一行不动。
- 工作目录固定为仓库根 `/Users/puras/workspace/proj/106hz/motab`；直接在 `main` 分支提交，不建分支（与项目既有约定一致）。
- CSS 颜色 / 字号 / 间距沿用现有变量与像素值，不引入新设计 token。
- z-index 层叠顺序保持：`.bg` 0 → `.overlay` 1 → `.stage` 2 → `.cards` 3 → `.gear` 10 → `.panel` 11。
- 浏览器视觉验证：本仓库沙箱无法起 HTTP 服务或 headless Chrome（见 `~/.claude/projects/.../memory/browser-verification-blocked.md`），故「页面布局可见」由开发者本人 `chrome://extensions` 加载扩展后人工验收；纯函数层无新增，无需新测试用例。

---

### Task 1: 把 `#cards` 搬进 `.stage`

**Files:**
- Modify: `newtab.html:11-16`（移动一行 HTML）

- [ ] **Step 1: 修改 newtab.html 结构**

把

```html
  <main class="stage">
    <div id="time" class="time" aria-label="当前时间">--:--:--</div>
    <div id="date" class="date" aria-label="当前日期">--</div>
    <div id="greeting" class="greeting" aria-label="欢迎信息">--</div>
  </main>
  <div id="cards" class="cards" aria-label="快捷入口"></div>
```

改成

```html
  <main class="stage">
    <div id="time" class="time" aria-label="当前时间">--:--:--</div>
    <div id="date" class="date" aria-label="当前日期">--</div>
    <div id="greeting" class="greeting" aria-label="欢迎信息">--</div>
    <div id="cards" class="cards" aria-label="快捷入口"></div>
  </main>
```

即把 `<div id="cards" class="cards" aria-label="快捷入口"></div>` 这一行从 `</main>` 之后**移动到** `</main>` 之前的同一缩进层级（4 空格）。文件其它部分保持不动。

- [ ] **Step 2: 验证文件结构**

运行：

```bash
grep -n -E 'main class="stage"|id="cards"|id="greeting"|aria-label="快捷入口"' newtab.html
```

期望输出（行号顺序）：

- 第 11 行：`main class="stage"`
- 第 12 行：`id="time"`
- 第 13 行：`id="date"`
- 第 14 行：`id="greeting"`
- 第 15 行：`id="cards"` （新位置，紧贴 `</main>` 之前）
- 第 16 行：`</main>`

确认 `</main>` 闭合在 `id="cards"` 之后，`id="cards"` 与 `id="greeting"` 共享同一个 `<main class="stage">` 父元素。

- [ ] **Step 3: 提交**

```bash
git add newtab.html
git commit -m "fix: move #cards into .stage so cards render under greeting"
```

---

### Task 2: 调整 CSS 让 stage 可扩展并解除 overflow 截断

**Files:**
- Modify: `style.css:4-10`（删除 `overflow: hidden`）
- Modify: `style.css:32-43`（`.stage` 高度改 `min-height`）
- Modify: `style.css:169-178`（`.cards` 删 `margin-top`）

- [ ] **Step 1: `html, body` 放开 `overflow`**

`style.css` 第 4–10 行当前为：

```css
html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
               "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  color: #fff;
  overflow: hidden;
}
```

删除最后一行 `overflow: hidden;`。最终为：

```css
html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
               "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  color: #fff;
}
```

- [ ] **Step 2: `.stage` 高度改 `min-height`**

`style.css` 第 32–43 行当前为：

```css
.stage {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 1.2rem;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}
```

把 `height: 100%;` 改成 `min-height: 100%;`。最终为：

```css
.stage {
  position: relative;
  z-index: 2;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 1.2rem;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}
```

- [ ] **Step 3: `.cards` 删除 `margin-top`**

`style.css` 第 169–178 行当前为：

```css
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
```

删除 `margin-top: 2rem;` 一行。最终为：

```css
.cards {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 96px));
  gap: 12px;
  justify-content: center;
  padding: 0 16px;
}
```

- [ ] **Step 4: 验证 CSS 改动正确**

按行号锚定检查 3 处：

```bash
sed -n '4,10p' style.css
```

期望输出（按行顺序，逐字比对）：

```text
html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
               "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  color: #fff;
}
```

确认 `overflow: hidden;` 在 4-10 行区间**已不存在**。

```bash
sed -n '32,43p' style.css
```

期望第 35 行是 `min-height: 100%;`（不再是 `height: 100%;`）。

```bash
sed -n '169,178p' style.css
```

期望第 169–178 行区间**不包含** `margin-top: 2rem;`（该行已被删除，第 169 行直接是 `.cards {`，第 170 行直接是 `position: relative;`，中间无 `margin-top`）。

```bash
grep -n 'margin-top: 2rem' style.css
```

期望输出为空（无任何匹配）。

- [ ] **Step 5: 提交**

```bash
git add style.css
git commit -m "fix: let .stage grow with cards and drop overflow:hidden"
```

---

### Task 3: 人工视觉验收（开发者本人）

**Files:** 无（仅肉眼检查）

- [ ] **Step 1: 加载扩展**

1. 打开 `chrome://extensions/`
2. 确认开发者模式已打开
3. 点击「重新加载」按钮刷新本扩展（若已加载）
4. 打开新标签页

期望（无条目）：页面只显示时钟 / 日期 / 问候，垂直居中，无空白行、无报错。

- [ ] **Step 2: 添加一个条目验证可见**

1. 移动鼠标出现齿轮 → 点击
2. 切到「快捷入口」标签
3. 输入 `https://github.com` → 失焦让 Name/Icon 自动填入 → 点「保存」
4. 关掉面板（Esc）

期望：页面在「夜深了 / 早上好」之类问候语**正下方**水平居中出现一张卡片（图标 + 「Github」文字），不再仅在面板里看到。

- [ ] **Step 3: 多条目换行验证**

1. 再添加 7 个不同链接的条目（合计 8 个）
2. 卡片应自动换行成 2 排，整体仍水平居中，紧贴问候语下方

- [ ] **Step 4: 拖拽验证**

1. 拖动页面卡片改变位置
3. 释放：落点指示线出现，松开即更新顺序，刷新页面顺序保持

- [ ] **Step 5: 极端情况（可选）**

1. 通过 DevTools console 临时注入 30 条 dummy 链接到 `chrome.storage.local`：

```js
chrome.storage.local.set({ links: { items: Array.from({length:30}, (_,i)=>({
  id: 'l_demo_'+i, name: 'demo'+i,
  url: 'https://example.com/'+i,
  icon: '' })) } }, () => location.reload());
```

2. 重新打开新标签页：整组上移，页面可纵向滚动到底查看所有卡片；背景图保持固定不滚动

- [ ] **Step 6: 完成**

人工验收通过，无需 commit（验收阶段不产代码）。