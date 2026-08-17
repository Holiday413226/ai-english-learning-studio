# AI English Learning Studio — UI 优化方案

## 现状诊断

### 整体感受
当前 UI 给人的第一印象是**"像素复古游戏"**而非"学习工具"。NES.css 框架的像素风格主导了一切视觉元素——方块按钮、硬阴影、像素字体、大量 Emoji 图标。这种风格在游戏或创意工具中可能有趣，但对一个面向英语学习者的工具来说，缺乏专业感和沉浸感，容易让人分心。

### NES.css 像素风格的具体表现
1. **所有按钮**：全部使用 `nes-btn` 类，带有像素化硬阴影（`box-shadow: 4px 4px 0 #2d1050`），方块造型，无圆角
2. **所有输入框**：使用 `nes-input`，硬边框，像素字体
3. **容器/卡片**：使用 `nes-container is-rounded`（仅有微小圆角），`window` 类带硬阴影
4. **进度条**：`nes-progress` 像素风格
5. **Toggle 开关**：`nes-toggle` 像素风格 checkbox

### Emoji 问题
项目中几乎所有 UI 文案都以前缀 Emoji 开头：
- 标题：`🏠 Dashboard`、`📖 Novel Translator`、`✍️ English Diary`
- 按钮：`📌 Ready`、`💾 Download`、`🔄 Refresh`
- 占位符：`🔑 Enter your DeepSeek API Key...`
- 评分：`😰 Forgot`、`🤔 Unsure`、`😊 Got It`
- 导航：`🏠`、`📖`、`✍️`、`⚔️`、`⛏️`、`📚`

这些 Emoji 让界面显得廉价、不够严肃，与"认真学习"的定位冲突。

### 排版与字体问题
- **Press Start 2P 像素字体**：在 `body`、`.sidebar-item`、`.nes-btn`、`.sidebar-logo`、`header h1`、统计数字、评分数字等多处使用。小字号下（0.45rem-0.65rem）可读性极差
- 中文字体回退到 `Microsoft YaHei`，与像素英文字体混排不协调
- 字体大小层级混乱：从 0.4rem 到 1.8rem，无统一字号体系

### 布局问题
- Sidebar 220px 固定宽度，在小屏幕上过度压缩
- Novel 三栏布局在窄屏下改为垂直堆叠，但缺少优雅过渡
- 多处使用内联 `style` 覆盖样式，维护困难
- 模态框背景为纯色暗色遮罩（`rgba(5, 0, 15, 0.92)`），无毛玻璃效果

---

## 优化方案

### 设计系统

#### 按钮
- **基础样式**：`border-radius: 8px`，`border: 1px solid #5a2d8a`，`padding: 8px 16px`
- **背景**：默认 `transparent`，悬停 `rgba(80, 250, 123, 0.08)`
- **主按钮（Primary）**：`background: #2d8a4a`，`border-color: #50fa7b`，`color: #e0ffe0`
- **悬停效果**：`box-shadow: 0 0 12px rgba(80, 250, 123, 0.15)` + `border-color: #50fa7b`
- **禁用态**：`opacity: 0.4`，`cursor: not-allowed`
- **去掉**：所有 `box-shadow: 4px 4px 0` 硬阴影、`text-shadow` 像素阴影

#### 输入框
- **基础样式**：`border-radius: 6px`，`border: 1px solid #3d1a60`，`padding: 10px 14px`
- **背景**：`#0d001a`，`color: #e0dde8`
- **聚焦**：`border-color: #50fa7b`，`box-shadow: 0 0 0 2px rgba(80, 250, 123, 0.15)`
- **占位符**：`color: #4a3070`
- **去掉**：方块造型、像素字体

#### 卡片
- **基础样式**：`border-radius: 10px`，`border: 1px solid #2d1050`，`background: rgba(26, 10, 48, 0.6)`
- **悬停（可点击卡片）**：`border-color: #50fa7b`，`box-shadow: 0 0 16px rgba(80, 250, 123, 0.08)`
- **去掉**：`box-shadow: 4px 4px 0` 硬阴影、`window` 类的硬边框

#### 模态框
- **遮罩层**：`background: rgba(5, 0, 15, 0.6)` + `backdrop-filter: blur(8px)`
- **模态框本体**：`border-radius: 14px`，`border: 1px solid #3d1a60`，`background: rgba(26, 10, 48, 0.85)` + `backdrop-filter: blur(12px)`
- **去掉**：硬像素边框、`box-shadow: 8px 8px 0` 硬阴影

#### 字体/排版
- **去掉**：`Press Start 2P` 全部引用（从 `index.html` 移除 CDN 链接）
- **正文字体**：`system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
- **等宽/代码**：`"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace`
- **字号体系**：
  - 页面标题：`1.5rem`（font-weight: 600）
  - 区块标题：`1rem`（font-weight: 600）
  - 正文：`0.875rem`
  - 辅助文字：`0.75rem`
  - 微小文字：`0.7rem`

#### 颜色变量（CSS 自定义属性）
```css
:root {
  --bg-deep: #0d001a;
  --bg-card: rgba(26, 10, 48, 0.6);
  --bg-input: #0d001a;
  --border-default: #3d1a60;
  --border-accent: #5a2d8a;
  --text-primary: #e0dde8;
  --text-secondary: #9b8ab8;
  --text-muted: #6a5a8a;
  --accent: #50fa7b;
  --accent-dim: #2d8a4a;
  --danger: #ff6b8a;
  --danger-bg: #5a1a2a;
  --highlight: #87ceeb;
  --gold: #ffd700;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

---

### 组件改造计划

| 组件 | 当前问题 | 改造方向 |
|------|---------|---------|
| **Sidebar** | NES 像素边框，Press Start 2P 字体，Emoji 图标 + LAYER 标签混乱 | 去掉 NES 样式，用简洁 SVG 图标替代 Emoji，去掉 LAYER 列，品牌区保留"AI"文字 logo 但用现代字体，v2.0.0 版本号保留 |
| **DashboardPage** | 统计卡片用 NES window 硬阴影，Emoji 大图标，像素字体数字 | 卡片改为圆角毛玻璃风格，去掉 Emoji 图标改用小号文字标签，数字用现代字体+霓虹绿色，模块卡片 hover 微光效果 |
| **NovelPage** | 三栏 NES window，拖拽区 Emoji 提示，按钮像素风格 | 卡片圆角化，拖拽区虚线边框保留但去掉 Emoji，Ready 按钮改为精致圆角按钮，输出区保留动态高亮逻辑 |
| **DiaryPage** | 两栏 NES window，评分数字用像素字体+硬阴影，Emoji 标签 | 评分改为圆角卡片+数字+进度条，纠错 diff 保留功能但样式现代化，Prompt 区去掉 Emoji |
| **DebaterPage** | 聊天气泡 NES 硬边框，Emoji 头像，输入区像素字体，toggle 为 NES 像素风格 | 气泡改为圆角柔和边框，头像改为文字首字母圆形头像，输入框圆角化，toggle 改为简洁 CSS 开关 |
| **MinecraftPage** | 复用 Debater 的 NES 样式，像素字体状态标签，Emoji 列表 | 整体风格与 Debater 统一改造，状态标签改为简洁圆角徽章，刷新按钮精致化 |
| **VocabPage** | 单词卡片 NES window，像素字体单词，Emoji 评分按钮，Flashcard 像素字体大号文字 | 单词卡片改为圆角列表项，评分按钮改为文字标签，Flashcard 保留翻转动画但字体现代化 |
| **SetupModal** | NES 容器+硬阴影，Emoji 标题，像素字体标签，NES 按钮 | 模态框改为毛玻璃+圆角，标题去掉 Emoji，字段标签简洁化，按钮精致化，保留 API Key 输入功能 |
| **ReaderModal** | NES 容器+硬阴影，像素字体标题，NES 关闭按钮 | 改为毛玻璃遮罩+圆角面板，关闭按钮用 X 图标，字号加大提升阅读体验 |
| **ChatBubble** | Emoji 头像（👤🤖），NES 硬边框气泡 | 头像改为圆形首字母（You / AI），气泡圆角柔和边框 |
| **ChatInput** | NES 像素 toggle，NES 按钮，Emoji 占位符 | 自定义 CSS toggle 开关，按钮精致化，去掉 Emoji 占位符 |
| **VoiceButton** | NES 按钮，像素字体状态文字，Emoji 语言/性别按钮 | 按钮精致化，状态文字用现代字体，语言/性别切换改为简洁文字标签 |
| **PhoneRelayModal** | NES 容器，Emoji 标题 | 毛玻璃遮罩，圆角面板，去掉 Emoji 标题 |
| **VocabStar** | 纯 Emoji ⭐/☆/⏳ 状态 | 改为 SVG 星形图标，填充/空心/旋转动画，hover 微光 |
| **ApiKeyInput** | NES 输入框+按钮，Emoji 占位符和显示/隐藏按钮 | 输入框圆角化，显示/隐藏按钮改为文字标签，去掉 Emoji |

---

### 正文 Emoji 清理计划

以下 Emoji 将被移除或替换（保留功能，去掉 Emoji 前缀）：

| 位置 | 当前 | 改为 |
|------|------|------|
| Sidebar 导航项 | `🏠` `📖` `✍️` `⚔️` `⛏️` `📚` | 纯文字或 SVG 图标 |
| 页面标题 | `🏠 AI English Studio` | `AI English Studio` |
| 按钮文案 | `📌 Ready`、`💾 Download`、`📥 CSV` 等 | `Ready`、`Download`、`CSV` |
| 占位符 | `🔑 Enter your...` | `Enter your...` |
| 加载提示 | `⌛ Analyzing...` | `Analyzing...` |
| 评分按钮 | `😰 Forgot`、`🤔 Unsure`、`😊 Got It` | `Forgot`、`Unsure`、`Got It`（用颜色区分） |
| 聊天头像 | `👤` `🤖` `🧑` | 圆形首字母 `Y` / `A` |
| 语言切换 | `👩` `👨` | `Female` / `Male` 文字 |
| 历史按钮 | `📋`、`📖` | 纯文字 |
| 状态文字 | `📄`、`📂`、`📝`、`✅`、`❌`、`⭐`、`🟦` | 纯文字或颜色区分 |

---

### 实施顺序

#### 第一阶段：基础设计系统（App.css 重构）
1. 在 `App.css` 顶部添加 CSS 自定义属性（颜色、圆角、阴影变量）
2. 修改 `body` 字体为系统无衬线字体
3. 重写 `.nes-btn` 覆盖样式为现代圆角按钮
4. 重写 `.nes-input` 覆盖样式为现代圆角输入框
5. 重写 `.window` / `.nes-container` 为圆角卡片
6. 重写 `.nes-progress` 为简洁进度条
7. 重写 `.nes-toggle` 为自定义 CSS 开关
8. 添加模态框毛玻璃样式类
9. 统一滚动条样式

#### 第二阶段：全局组件改造
1. **Sidebar** — 去掉 Emoji、LAYER 标签、像素字体，简化为文字导航
2. **SetupModal** — 毛玻璃效果，圆角面板，去掉 Emoji
3. **ReaderModal** — 毛玻璃遮罩，圆角面板
4. **ApiKeyInput** — 输入框/按钮精致化
5. **VocabStar** — Emoji 替换为 SVG 星形图标

#### 第三阶段：页面改造
1. **DashboardPage** — 统计卡片圆角化，去掉 Emoji 大图标，模块卡片 hover 微光
2. **NovelPage** — 三栏卡片圆角化，拖拽区现代化
3. **DiaryPage** — 评分卡片精致化，纠错 diff 样式调整
4. **DebaterPage** — 聊天气泡圆角，头像首字母化，输入框/toggle 现代化
5. **MinecraftPage** — 与 Debater 统一风格
6. **VocabPage** — 单词卡片、Flashcard、Quiz 样式现代化

#### 第四阶段：收尾
1. 从 `index.html` 移除 `Press Start 2P` 字体 CDN 链接
2. 保留 `nes.css` CDN 链接（部分基础样式仍被引用，如 `nes-textarea`），但通过 App.css 完全覆盖其视觉效果
3. 检查所有内联 `style`，将可复用的样式提取到 CSS 类
4. 响应式断点微调

---

### 假设与决策

1. **保留 NES.css CDN 链接**：部分组件（如 `nes-textarea`）仍引用 NES 类名。我们不删除 CDN 链接，而是通过 App.css 的 `!important` 覆盖其视觉样式。未来可考虑完全移除 NES.css 依赖，但需要更多工作量。
2. **不引入新依赖**：所有改造通过纯 CSS 和有限 SVG 内联实现，不增加 npm 包。
3. **不修改 JS 逻辑**：所有功能代码、路由、状态管理完全不动，仅改 CSS 和 JSX 中的 Emoji 文案。
4. **Emoji 替换策略**：Sidebar 导航图标使用内联 SVG（简单几何图标），保持视觉引导但不喧宾夺主。VocabStar 的 ⭐ 替换为 SVG 星形图标，保留"收藏"的语义。
5. **毛玻璃效果范围**：仅在 SetupModal、ReaderModal、PhoneRelayModal 三个浮层使用 `backdrop-filter: blur()`，卡片和侧边栏不使用，避免性能问题和过度设计。
6. **颜色方案不变**：深紫背景 `#1a0a30`、霓虹绿强调 `#50fa7b`、紫色边框 `#5a2d8a` 全部保留。

---

### 验证步骤

1. 启动 `npm run dev`，确认所有页面正常渲染
2. 逐一检查 6 个模块页面：Dashboard、Novel、Diary、Debater、Minecraft、Vocab
3. 确认所有按钮可点击、输入框可输入、模态框可开关
4. 确认 SetupModal 的 API Key 保存/读取功能正常
5. 确认 Debater 的聊天发送、语音输入、评分功能正常
6. 确认 Novel 的拖拽上传、翻译、高亮、下载功能正常
7. 确认 Vocab 的单词列表、Flashcard 翻转、Quiz 答题功能正常
8. 确认响应式布局在 640px、900px、1000px 断点下正常
9. 确认 Diray 的日记提交、纠错显示功能正常
10. 确认 Minecraft 的 Bot 状态显示、会话切换正常