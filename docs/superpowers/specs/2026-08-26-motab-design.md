# MoTab 新标签页扩展 — 设计文档

日期：2026-08-26
状态：已批准

## 目标

在 Chrome 中打开新标签页（Ctrl+T）时，展示自定义页面：背景图 + 实时时钟 + 按时段动态问候。

## 方案选择

采用 **Chrome 扩展（Manifest V3）**，通过 `chrome_url_overrides.new_tab` 替换新标签页。零权限、无后台脚本。

备选方案（已排除）：
- 本地 HTML + Chrome 启动页设置：最轻，但 Ctrl+T 新标签页不生效
- 现成扩展（Momentum / Infinity New Tab 等）：排版受模板限制，无法完全自定义

## 工程结构

```
motab/
├── manifest.json      # MV3 清单，override new_tab → newtab.html
├── newtab.html        # 新标签页
├── style.css          # 样式
├── app.js             # 时钟刷新与问候逻辑
├── assets/
│   └── wallpaper.jpg  # 背景图（初始化用占位图，可整体替换）
└── README.md          # 加载扩展、换背景的使用说明
```

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "MoTab",
  "version": "0.1.0",
  "description": "自定义新标签页：背景 + 时钟 + 欢迎信息",
  "chrome_url_overrides": { "new_tab": "newtab.html" }
}
```

## 页面设计

- **背景**：`assets/wallpaper.jpg` 全屏 `background-size: cover`；叠加半透明暗色蒙版（约 `rgba(0,0,0,0.25)`）保证文字可读
- **布局**：内容垂直、水平居中，自上而下三行：
  1. 大号数字时钟 `HH:MM:SS`，细体大字（font-weight 200–300），每 1s 刷新
  2. 日期 + 星期，中文 locale，如「2026年8月26日 星期二」
  3. 动态问候语
- 文字白色，与暗色蒙版搭配

## 问候逻辑（app.js）

- 纯函数 `greetingFor(hour)`，按 24 小时制的 hour 分档：

  | 小时范围 | 问候 |
  |---|---|
  | 5 ≤ h < 11 | 早上好 |
  | 11 ≤ h < 13 | 中午好 |
  | 13 ≤ h < 18 | 下午好 |
  | 18 ≤ h < 23 | 晚上好 |
  | h ≥ 23 或 h < 5 | 夜深了 |

- 名字配置项：`app.js` 顶部 `const NAME = ''`；非空时显示「{问候}，{NAME}」，为空时仅显示问候
- 时钟：`setInterval` 每秒刷新；`toLocaleTimeString('zh-CN', { hour12: false })` 或手动补零
- 日期：`toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })`

## 使用方式

1. `chrome://extensions` → 开启开发者模式 → 「加载已解压的扩展程序」选择 motab 目录
2. Ctrl+T 查看效果；修改代码后在扩展卡片点「重新加载」
3. 换背景：替换 `assets/wallpaper.jpg`

## 范围外（YAGNI）

搜索框、快捷链接、待办、多背景轮播、主题切换。以后需要再单独设计。

## 验证

- 加载扩展后开新标签页人工验证：时钟走动、日期星期正确
- `greetingFor` 为纯函数，手动验证分档边界：5、11、13、18、23 点
