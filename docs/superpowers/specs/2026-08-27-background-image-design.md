# MoTab 自定义背景设置 — 设计文档

日期：2026-08-27
状态：已批准

## 目标

在不替换扩展文件的前提下，用户可以直接在新标签页里设置背景图，并对显示效果做微调。

## 需求决策（已确认）

| 决策点 | 结论 |
|---|---|
| 图片来源 | 上传本地图片 + 粘贴 URL，两者都支持 |
| 显示选项 | 蒙版深浅滑杆、恢复默认按钮、背景模糊滑杆 |
| 设置入口 | 右上角齿轮按钮，鼠标移动淡入、停止操作 2.5s 淡出 |
| 图片持久化 | Canvas 压缩成 Data URL 后存 `chrome.storage.local` |

已排除的备选：IndexedDB 存原始 Blob（需两套持久化机制并存，代码量翻倍，收益仅是保留原始字节）。

## 文件布局

保持纯 HTML/CSS/JS、无构建工具的路线，新增一个文件：

```
motab/
├── manifest.json          # 权限不变；实现时版本号 1.0.0 → 1.1.0
├── newtab.html            # 新增：背景层 div、齿轮按钮、设置面板 DOM
├── style.css              # 新增：背景层/齿轮/面板样式；body 背景迁移到专用图层
├── app.js                 # 不变（时钟 + 问候）
├── settings.js            # 新增：设置加载/保存、选图压缩、URL 校验、面板交互
├── assets/wallpaper.jpg   # 内置默认图（= 「恢复默认」的目标）
└── tests/background.test.html   # 新增：纯函数边界测试页（沿用 greeting.test.html 模式）
```

`app.js` 完全不动；所有背景逻辑集中在 `settings.js`。

## 数据模型（chrome.storage.local）

```json
{ "bg": {
    "type": "default | data | url",
    "data": "data:image/jpeg;base64,...",
    "url":  "https://...",
    "dim":  0.25,
    "blur": 0
} }
```

- 三种来源在渲染时归一为一条 CSS 字符串：`default` → `url("assets/wallpaper.jpg")`；`data`/`url` 分别取对应字段
- 存储读取失败、字段缺失或非法时，一律回退出厂值 `{type:"default", dim:0.25, blur:0}`

## 上传压缩管线与 URL 校验

**上传**：FileReader 读文件 → `<img>` 解码 → Canvas 重编码 JPEG（长边 ≤ 3840px、质量 0.85，超限图片先等比缩小）。结果通常几百 KB～2MB，远低于 `chrome.storage.local` 的 10MB 配额，无需新增权限。已知副作用（可接受）：动图变静帧、透明 PNG 叠加黑底。

**URL**：保存前用 `new Image()` 试加载（约 8 秒超时）；失败则面板内提示「无法加载该图片」，不写入存储。成功直接保存 URL 原串（不做跨域重编码）。

## 设置面板与交互

- **入口**：右上角齿轮。监听全页 `mousemove` 淡入，停止操作 2.5 秒后淡出；面板打开期间齿轮常显。
- **关闭方式**：Esc 或点击面板外部区域。
- **控件**：上传按钮（accept="image/*"）、URL 输入框 + 应用按钮、蒙版深浅滑杆（0–100%）、背景模糊滑杆（0–20px）、恢复默认按钮、一行状态提示（成功/错误信息）。面板打开时回显当前已存值。
- **实时性**：滑杆拖动即时预览（改 DOM），停止拖动 300ms 后才落盘；上传与 URL 成功后立即生效并落盘。
- **恢复默认**：完全回到出厂状态——`type=default` 且蒙版 0.25、模糊 0，面板滑杆同步回显。

## 渲染与层级

把现有写在 `body` 上的背景迁移到专用 `.bg` 图层（必要重构：模糊滤镜不能作用在含文字的 body 上）。z-index 层级：

```
.bg (0) → .overlay (1) → .stage 内容 (2) → 齿轮 (10) → 面板 (11)
```

- 蒙版深浅 → `.overlay` 的 opacity 直接映射 `dim`
- 背景模糊 → `.bg` 加 `filter: blur(Npx)`；当 blur > 0 时同时 `transform: scale(1.06)` 避免边缘发虚露边
- 页面初始底色保持深灰，避免图片异步加载前的白屏闪烁

## 错误处理

- 存储数据损坏/不完整 → `sanitizeSettings()` 静默回退出厂值，绝不白屏
- 上传非图片文件或解码失败 → 状态行提示「无法识别该图片」
- URL 试加载失败 → 状态行提示「无法加载该图片」，保留原设置不变

## 测试

可测逻辑抽成纯函数，进 `tests/background.test.html`（PASS/FAIL 列表，沿用现有测试页模式）：

- `sanitizeSettings(raw)` — 各字段缺失/越界/类型错误的回退
- `targetSize(w, h, maxEdge)` — 长边等比缩放计算
- `clamp01(n)` / `clampBlur(px)` — 滑杆取值边界

上传链路、URL 探测、持久化跨重启等走人工验证清单；README 同步更新使用说明。

## 版本与提交

实现前先把工作区中已有的 README 扩充与 manifest 键名修正（`new_tab` → `newtab`）单独提交，再在功能提交中将版本号升为 1.1.0。

## 范围外（YAGNI）

每日随机壁纸轮播、多壁纸收藏夹、设置云同步（storage.sync）、动图/视频背景、导出导入配置。以后需要再单独设计。
