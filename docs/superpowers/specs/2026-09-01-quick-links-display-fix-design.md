# MoTab 快捷入口 — 页面展示修复

日期：2026-09-01
状态：待批准

## 背景

2026-08-28 已实现快捷入口的「添加 / 删除 / 排序 / 自动填充」完整闭环（`links.js` + 设置面板「快捷入口」标签）。但用户在页面上**看不到任何卡片**：齿轮 → 「快捷入口」标签可正常添加条目并写入 `chrome.storage.local`，但 `newtab.html` 主体上 `renderCards()` 渲染的 DOM 节点不在视口内。

## 根因

`newtab.html` 中 `<div id="cards" class="cards">` 是 `.stage` 的**兄弟节点**（在 `</main>` 之后），而 `style.css` 中：

- `.stage { height: 100%; ... }` —— 占据整个视口高度
- `html, body { overflow: hidden }` —— 截断超出视口的内容

结果：`.cards` 在文档流中位于 `.stage` 之下，被推到视口**底部之外**，用户看不见。`renderCards()`、`loadLinks()`、`chrome.storage.local` 都正常工作，只是渲染位置不可见。

## 目标

让快捷入口卡片在页面上**紧贴问候语下方**展示，全部展示不截断，极端数量可滚动。

## 需求决策（已确认）

| 决策点 | 结论 |
|---|---|
| 展示位置 | 问候语正下方，水平居中 |
| 数量 | 全部展示，超出自动换行（不做行数限制） |
| 极端情况 | 卡片过多时允许页面纵向滚动（不再被 `overflow: hidden` 截断） |
| 时钟位置 | 卡片多时整组（time/date/greeting/cards）整体上移；不单独保护时钟居中 |

## 方案：把 `#cards` 搬进 `.stage`

### HTML 改动（`newtab.html`）

把

```html
<main class="stage">
  <div id="time" class="time">...</div>
  <div id="date" class="date">...</div>
  <div id="greeting" class="greeting">...</div>
</main>
<div id="cards" class="cards" aria-label="快捷入口"></div>
```

改为

```html
<main class="stage">
  <div id="time" class="time">...</div>
  <div id="date" class="date">...</div>
  <div id="greeting" class="greeting">...</div>
  <div id="cards" class="cards" aria-label="快捷入口"></div>
</main>
```

### CSS 改动（`style.css`）

1. `.stage`：把 `height: 100%` 改为 `min-height: 100%`，允许内容多时垂直扩展
2. `.cards`：删除 `margin-top: 2rem`（flex `gap` 已经在 `.stage` 里设了 `1.2rem`，无需额外 margin），并加 `width: 100%`（因为 `.cards` 现在是 `.stage` 的 flex 子项；不显式给宽度会让 grid 容器收缩到自身最小内容宽度 `minmax(64, 96) × 1 = 64px`，所有卡片退化成纵向一列）
3. `html, body`：删除 `overflow: hidden`，让纵向滚动可用；保留 `height: 100%`

### 不变的部分

- `links.js` 的 `renderCards()` / `initLinks()` / `renderLinksList()` 全部不动
- `.cards` 的 grid 布局、`gap: 12px`、`justify-content: center`、`padding: 0 16px` 不动
- `.card` 单卡样式、`.card-icon-wrap` / `.card-icon` / `.card-fallback` / `.card-name` 全部不动
- z-index 层叠（`.bg` 0 → `.overlay` 1 → `.stage` 2 → `.cards` 3 → `.gear` 10 → `.panel` 11）保持
- 拖拽视觉（`.drop-before` / `.drop-after` / `.is-dragging`）不动

## 文件清单

| 文件 | 改动类型 | 行数估算 |
|---|---|---|
| `newtab.html` | HTML 结构调整 | 2 行（删一行、移一行） |
| `style.css` | CSS 调整 | 3 处微调（stage 高度、cards margin、body overflow） |

零 JS 改动。

## 数据流 / 错误处理

无变化，沿用现有 `sanitizeLinks` / `loadLinks` / `renderCards` 的行为。

## 测试

`tests/links.test.html` 是纯函数测试，不涉及 DOM 布局，无需新增用例。

浏览器真实验收清单：

1. 空状态：首次安装、无任何条目 → 页面正常（只有时钟/日期/问候，不应有多余空白或报错）
2. 单一卡片：齿轮 → 添加 1 条 → 卡片紧贴「早上好」下方居中
3. 多个卡片：添加 8 条 → 自动换行成 2 排，居中显示
4. 极端数量：手动注入 30 条 → 整组上移，页面可纵向滚动到底
5. 拖拽：页面卡片之间拖拽排序正常工作（视觉提示、落盘、刷新后保留）
6. 缩略图回退：favicon 404 时显示首字母色块，布局不抖动

## 范围外（YAGNI）

- 卡片行数限制 / 折叠展开
- 末位「+」加号卡（2026-08-28 spec 提到，本次不实现）
- 时钟单独居中、不被卡片顶动
- 分组、文件夹、导入导出

## 提交策略

单次提交，commit message 形如：

```
fix: render quick-link cards under greeting (move #cards into .stage)
```

不升版本号（修复 bug，不引入新功能）。
