# MoTab 快捷入口 — 设计文档

日期：2026-08-28
状态：已批准

## 目标

在新标签页里提供一组可由用户自定义的快捷入口卡片（图标 + 名称 + 链接），支持拖拽排序与删除；新增条目时根据链接自动推导名称与图标，但用户可自由改写。

## 需求决策（已确认）

| 决策点 | 结论 |
|---|---|
| 自动获取方式 | 第三方 favicon 服务 + 域名推导名字 |
| favicon 服务 | DuckDuckGo Icons（`icons.duckduckgo.com/ip3/{host}.ico`），不打点、64px PNG、稳定 |
| 名称/图标可手改 | 自动填充作为默认值，用户可编辑 |
| 设置入口 | 现有齿轮面板内分两个标签：「背景」「快捷入口」 |
| 卡片布局 | 时钟下方一排 4 列图标网格，居中 |
| 排序 | 拖拽原生 HTML5 D&D（无依赖），面板内列表与页面卡片共用同一顺序 |

## 文件布局

保持「无构建工具、零依赖」。从 `settings.js` 抽出共享工具到新 `main.js`，新增 `links.js` 承载全部快捷入口逻辑。`app.js` 不变。

```
motab/
├── main.js                # 新增：el / debounce / clamp01 / clampBlur / sanitize 共用工具
├── settings.js            # 瘦身：只剩背景专有逻辑（消费 main.js）
├── links.js               # 新增：纯函数 / 渲染 / 存储 / 面板交互
├── newtab.html            # 新增：卡片区 DOM + 标签页 + 编辑表单
├── style.css              # 新增：卡片网格 + 标签页 + 编辑表单样式
├── app.js                 # 不变（时钟 + 问候）
├── tests/links.test.html  # 新增：纯函数边界测试页（沿用 greeting/background 模式）
└── manifest.json          # permissions 不变；版本 1.1.0 → 1.2.0
```

`main.js` 充当共享基础层；`settings.js` 与 `links.js` 互不依赖。

## 数据模型（chrome.storage.local）

```json
{ "links": { "items": [
  { "id":"l_xxxxx", "name":"Github", "url":"https://github.com", "icon":"https://icons.duckduckgo.com/ip3/github.com.ico" }
] } }
```

- 存储键 `"links"`，值恒有 `items` 数组
- `id` 用 `crypto.randomUUID()` 生成（MV3 全部环境可用）
- 出厂值：`{ items: [] }`，首次启动不渲染任何卡片
- 数组顺序即渲染顺序，拖拽改写顺序直接重排数组再落盘

## 自动获取实现

- **域名解析**：`new URL(input).hostname`，去掉 `www.` 前缀
- **名称推导 `nameFromHost(host)`**：
  - 公共后缀白名单：`com cn net org io co app dev gov edu me ai tv cc info biz xyz tech`
  - 去掉白名单后缀后取第一段，首字母大写
  - 例：`github.com` → `Github`；`mail.google.com` → `Mail.google`（已知白名单无 `google` 但仍能取到 `mail.google`，再切片第一段 `mail` 首字母大写）
  - 例：`bbc.co.uk` → 同样按规则白名单匹配，优先去除最后已知后缀
- **图标推导 `iconUrlForHost(host)`**：`https://icons.duckduckgo.com/ip3/{host}.ico`
- **回退**：`<img>` 元素挂 `onerror` 监听器，失败时隐藏并显示一个首字母色块，色块背景色用 `hsl(hostname 字符串哈希 % 360, 60%, 55%)` 生成保持稳定
- **触发时机**：添加表单「Link」输入框失焦（`blur`）或回车（`keydown Enter`）时自动填充 Name / Icon 输入框；用户可继续修改，保存时以输入框当前值为准

## UI 布局

页面布局（z-index 自下而上）：

```
.bg (0) → .overlay (1) → .stage (2) → .cards (3) → .gear (10) → .panel (11)
```

`.stage` 内三行（时钟 / 日期 / 问候）保持现有样式；其下新增 `.cards` 区块，grid 布局：

- 列数 `auto-fill`，最小 64px、最大 96px，间距 12px
- 单卡：方形图标 64×64 居中，名称 12px 居中下方，悬停放大 1.08
- 末位可放「+」加号卡（点击直接打开齿轮面板并切到「快捷入口」标签的添加表单）

## 面板分标签

齿轮标题改「设置」（`aria-label` 同步），面板内部：

```
┌──────────────────────┐
│ [背景] [快捷入口]    │  ← 标签条
├──────────────────────┤
│ <标签1 内容>         │
│ <标签2 内容>         │
└──────────────────────┘
```

- 标签用 `role="tablist"`，左右两个 `role="tab"`，点击切换对应 `role="tabpanel"`
- URL hash 同步：当前标签写入 `location.hash`（`#bg` / `#links`）；首次打开时若 hash 为 `#links` 直接显示「快捷入口」
- 「背景」标签放现有全部背景控件（保持原功能不变）
- 「快捷入口」标签：上半部分现有列表（缩略图行，每行有：拖拽手柄 + 图标 + 名称 + 链接 + 删除按钮），下半部分「+ 添加」表单（Link / Name / Icon 三输入框 + 「自动填充」按钮 + 「保存」按钮）

## 拖拽排序实现

- 拖拽源：列表项和页面卡片都设 `draggable="true"`
- `dragstart`：记录 `dataTransfer.setData("text/plain", id)`；源元素加 `.is-dragging` 类（透明度 0.4、`cursor: grabbing`）
- `dragover`：阻止默认行为（让 drop 生效），按鼠标 Y 坐标相对目标元素中线判断插入位置：上半则前插、下半则后插；目标元素加 `.drop-before` / `.drop-after` 类显示视觉提示
- `drop`：从 `dataTransfer` 取 id，在数组中按目标位置重排 → `saveLinks(items)` 落盘
- 防抖：拖拽过程触发频繁的 `saveLinks` 调用，套用 `debounce(200ms)` 避免写存储过多；最终释放时一定写一次
- 拖拽与点击共存：mousedown 计时 < 200ms 视为点击（打开链接）；≥ 200ms 进入拖拽预备态。`<a>` 包裹整个页面卡片，`preventDefault()` 在拖拽起始时调用
- 键盘可访问性（不在首期强制）：拖拽手柄是 `aria-grabbed` 元素，未来可加键盘排序；本次先支持鼠标

## 错误处理

- 损坏/不完整存储 → `sanitizeLinks(raw)` 静默回退 `{ items: [] }`，绝不白屏
- 添加表单 Link 解析失败 → 错误提示「链接格式不正确」，不写入
- favicon 加载失败 → `<img onerror>` 切首字母色块，不提示错误
- 删除操作 → 无确认弹窗（操作可由拖拽撤销，但当前未做历史栈，简化为「删除立即生效」）

## 测试

可测逻辑抽成纯函数，进 `tests/links.test.html`（PASS/FAIL 列表，沿用现有测试页模式）：

- `sanitizeLinks(raw)` — 各种损坏/越界/类型错误的回退
- `parseHost(input)` — `new URL` 解析 + `www.` 去除
- `nameFromHost(host)` — 公共后缀去除、域名分段、首字母大写
- `iconUrlForHost(host)` — DDG URL 构造
- `moveItem(items, fromId, toIndex)` — 重排（拖拽放置的核心）
- `validateLinkUrl(input)` — `^https?://\S+$/i` 且无引号空白的校验正则

浏览器真实验收：跟背景功能同等级别，在最终人工清单里逐条覆盖。

## 版本与提交

实现前工作树已是最新；功能提交中将版本号升为 1.2.0。

## 范围外（YAGNI）

分组、文件夹、导入/导出配置、排序上下箭头（被拖拽取代）、图标上传（用首字母色块回退）、快捷键打开、统计使用频率、历史栈（删除无确认无撤销）。
