# SPEC.md — AI English Learning Studio v2.0.0

> **Type:** B · 应用类项目
> **Status:** Final — cold-start validation completed ✅
> **Created:** 2026-07-07
> **Brainstorming partner:** Claude Code (Claude Opus 4.8) via Superpowers `brainstorming` skill

---

## 1. 问题陈述

### 1.1 要解决的问题

英语学习者面临一个典型的碎片化困境：阅读工具、写作工具、口语练习工具、单词记忆工具散布在不同平台，学习数据互不相通。比如你在翻译阅读时查过一个生词，三天后在辩论练习中遇到同一个词却完全不记得——因为它从未被系统地记录下来。

### 1.2 目标用户

中国大学生（以 CET-4/6 备考为主要场景），需要在一个统一的桌面应用中完成英语学习的完整闭环：
- **输入** — 通过 AI 翻译阅读英语内容
- **输出** — 通过 AI 辩论/讨论进行口语和写作练习
- **沉浸** — 通过 Minecraft 游戏场景进行英语交互
- **沉淀** — 所有模块中遇到的生词自动汇聚到词汇宝库，支持闪卡复习和测验

### 1.3 为什么值得做

- 现有英语学习工具多为单一功能（只背单词、只翻译、只练口语），缺乏「数据串联者」角色
- 学习闭环（输入→输出→复习→再输入）已有认知科学支撑（间隔重复 + 情境学习）
- AI 使批改、评分、释义生成等原本昂贵的能力可以本地化、免费化（用户自带 API Key）
- 桌面 EXE 形态更适合自习场景——不需要网络、不被浏览器干扰、启动快

---

## 2. 用户故事

| # | 作为... | 我想要... | 以便... | 验收标准 |
|---|---------|----------|---------|---------|
| US1 | 备考 CET-4 的学生 | 上传中文小说并获得带四六级词汇高亮的英文翻译 | 在兴趣阅读中自然积累词汇 | 上传 TXT 后 30s 内返回翻译结果，词汇正确高亮 |
| US2 | 想练口语的学生 | 与 AI 就某个话题进行英语辩论 | 在对抗情境中提升口语流利度 | 多轮对话无丢失，支持语音输入和 COZE 语音播放 |
| US3 | 喜欢游戏的学生 | 在 Minecraft 中用英语与 AI 助手对话 | 在沉浸式场景中练习英语 | 发送消息后 2s 内收到回复，会话历史可回溯 |
| US4 | 想练写作的学生 | 每天写一篇英语日记并得到 AI 逐句批改 | 在每日练习中提升写作能力 | 提交后 10s 内返回逐句批改结果，支持打卡追踪 |
| US5 | 想系统背词的学生 | 将翻译/辩论/Minecraft/日记中遇到的生词一键加入词汇宝库 | 统一管理和复习所有学习场景中积累的词汇 | 任意模块点击收藏后 0.5s 内保存，闪卡复习可用 |
| US6 | 所有用户 | 在首次运行时安全录入 API Key，不被泄露 | 放心使用自己的付费 API | Key 通过密码输入框录入，存入 Windows Credential Manager，控制台/日志/文件中不可见 |
| US7 | 非技术用户 | 下载单个 EXE 文件双击即可运行 | 零配置开始学习 | EXE 启动后浏览器自动打开，无需手动安装 Python/Node/依赖 |

---

## 3. 功能规约

### 3.1 模块总览

```
AI English Learning Studio
├── 🏠 Dashboard        [新增]
├── 📖 Novel Translator  [已有 — 增强词汇收集]
├── ✍️ English Diary     [新增]
├── ⚔️ Debater           [已有 — 增强评分 + 词汇收集]
├── ⛏ Minecraft Companion [PCL 内对话 + Web 伴侣面板 + 词汇收集]
└── 📚 Vocab Vault       [新增 — 串联所有模块]
```

### 3.2 🏠 Dashboard（首页仪表盘）

| 项目 | 规格 |
|------|------|
| **输入** | 无——纯展示页面 |
| **行为** | 显示今日学习摘要（翻译字数、日记篇数、辩论场次、新增词汇数）、7 天连续打卡热力图、各模块快捷入口卡片 |
| **数据来源** | 从四个模块的数据目录 JSON 中读取统计信息 |
| **边界条件** | 首次使用（无任何数据）显示引导文案和快捷入口 |
| **错误处理** | 统计数据读取失败不影响模块入口跳转 |

### 3.3 📖 Novel Translator（翻译模块 — 增强）

**已有功能保持不变**（拖拽 TXT → DeepSeek 翻译 → 词汇高亮）。新增：

| 项目 | 规格 |
|------|------|
| **词汇收集** | hover 高亮词汇 → 弹出释义气泡 + ⭐ 收藏按钮 → 点击收藏写入 Vocab Vault |
| **释义 API** | DeepSeek 单次请求批量查询 hover 词汇的英文释义 + 中文释义 + 例句 |
| **边界条件** | 同一词汇重复收藏 → 幂等（不重复写入）；无 API Key 时收藏按钮灰显 |

### 3.4 ✍️ English Diary（日记模块 — 新增）

| 项目 | 规格 |
|------|------|
| **写作界面** | 左栏：日期 + 当日 AI 话题提示（可选） + textarea | 右栏：提交后的批改 diff 视图 |
| **AI 批改** | 提交原文 → DeepSeek 返回 JSON `[{sentence, corrections: [{original, suggestion, reason}]}]` → 前端渲染逐句对比 |
| **打卡系统** | 每日一篇，本地 JSON 记录日期列表 → Dashboard 热力图展示 |
| **优秀表达收集** | 批改中 AI 标注的高分表达 → 用户点击 ⭐ 加入 Vocab Vault |
| **回顾模式** | 日历组件 → 点日期查看当日日记原文 + 批改 |
| **边界条件** | 同一天多次提交 → 覆盖上一次；无 API Key 时提交按钮灰显 |
| **错误处理** | DeepSeek 返回格式不合法 → 回退显示原文 + 通用错误提示 |

### 3.5 ⚔️ Debater（辩论模块 — 增强）

**已有功能保持不变**（COZE Bot 辩论/讨论 + 语音输入输出）。新增：

| 项目 | 规格 |
|------|------|
| **辩论评分** | 每次辩论结束后，用户点击「评分」→ DeepSeek 分析对话历史 → 返回 `{grammar, vocabulary, logic, fluency}` 四项 1-10 分 + 改进建议 |
| **词汇收集** | 对消息气泡长按/右键 → 「收藏词汇」→ 选中词汇区域 → 写入 Vocab Vault |
| **边界条件** | 评分按钮在无对话时灰显；收藏功能无 API Key 时灰显 |

### 3.6 ⛏ Minecraft Companion（Minecraft 模块 — 伴侣面板）

**设计原则：不在 Web UI 中替代 PCL 的聊天功能。** 用户通过 PCL 游戏内聊天框与 Mineflayer Bot 对话（原体验不变），Web 面板作为「监控 + 回顾 + 词汇收集」的伴侣工具。

**交互模型：**
```
PCL 游戏内 ← 打字对话 → Mineflayer Bot (Minebot)
                              │
                    Bot 对话日志 → data/minecraft/sessions/
                              │
Web 面板 ← 读取日志 ←─────────┘
  ├── 实时/近实时显示对话记录（只读）
  ├── ⭐ 收藏词汇到 Vocab Vault
  └── 查看当日统计
```

| 项目 | 规格 |
|------|------|
| **面板布局** | 顶部状态栏（Bot 在线状态、玩家位置） + 中间对话记录列表（只读，自动滚动） + 底部统计栏（今日消息数、已收藏词数） |
| **对话记录** | 从 `backend/data/minecraft/` 的 session JSON 读取历史消息，按时间戳渲染为对话气泡，区分 user 和 assistant |
| **消息来源** | Minebot 运行时的 session JSON 文件。Web 面板通过定时轮询（`GET /api/minecraft/sessions` + `GET /api/minecraft/session?session_id=xxx`，每 3s 刷新）或手动刷新按钮获取最新对话 |
| **词汇收集** | 对 assistant 消息中的词汇右键/长按 → 「收藏到 Vocab Vault」→ `POST /api/vocab/add` → Toast 确认。这是 PCL 游戏内无法做到的核心能力 |
| **Web 内不可发消息** | 面板仅展示 + 收集，不提供发送功能。发消息在 PCL 游戏内完成（保持最自然的游戏体验） |
| **Minebot 集成** | Minebot 作为独立 Node.js 进程运行（连接 Minecraft 服务器），其 session 存储格式需与 Web 面板兼容——见数据模型 |
| **边界条件** | Bot 未连接时状态栏显示 "Offline" + 引导文案；无对话历史时显示空状态 |
| **错误处理** | 轮询失败静默重试；session JSON 格式不兼容时降级显示纯文本 |

### 3.7 📚 Vocab Vault（词汇宝库 — 新增）

| 项目 | 规格 |
|------|------|
| **词汇收集入口** | 四个模块的 ⭐ 按钮 / 右键菜单 → 写入 `backend/data/vocab/vault.json` |
| **词汇条目结构** | `{word, phonetic, definition_en, definition_zh, example_sentence, source_module, source_context, created_at, review_count, last_reviewed, next_review}` |
| **AI 释义生成** | 收藏时用 DeepSeek 生成：英文释义、中文释义、音标、例句（来自原上下文或 AI 生成） |
| **闪卡复习** | NES.css 像素风卡片翻转动画 — 正面：单词，背面：释义+例句；用户自评「知道/不确定/不知道」 |
| **SM-2 间隔复习** | 简单实现：初始间隔 1 天，正确 → 间隔 × 2.5，错误 → 重置为 1 天 |
| **每日测验** | 四选一词汇测试，从宝库中随机抽取 10 词，统计正确率 |
| **导出** | CSV 导出（word, definition_en, definition_zh, example, source, date） |
| **边界条件** | 空宝库时显示引导文案；同一词汇重复收藏幂等；最大 2000 词 |
| **错误处理** | AI 释义生成失败 → 仅存单词本身（用户可手动编辑） |

---

## 4. 非功能性需求

### 4.1 性能

| 指标 | 目标 |
|------|------|
| EXE 启动时间 | < 3 秒（到浏览器自动打开） |
| 翻译响应（2000 字） | < 30 秒 |
| 辩论消息延迟 | < 5 秒（含 COZE 轮询） |
| 日记批改响应 | < 10 秒 |
| 词汇收藏响应 | < 0.5 秒 |
| 前端页面切换 | < 200ms |

### 4.2 安全（含凭据威胁模型）

**威胁模型：**
| 威胁 | 风险等级 | 对策 |
|------|---------|------|
| API Key 硬编码在源码中 | 🔴 高 | 永不硬编码——前端以 `password` 类型 input 录入，发送请求时从 Zustand store 读取 |
| API Key 提交到 Git | 🔴 高 | `.gitignore` 已排除 `.env`、`config.json`、`data/`、`*.spec` |
| 浏览器 localStorage 明文存储 | 🟡 中 | 当前实现（v1.2）用 localStorage。v2.0 新增 **Windows Credential Manager** 集成——首次运行时引导用户安全录入，后续从凭据管理器读取 |
| 进程环境变量泄露 | 🟡 中 | 不使用环境变量传递 key（当前已做到——key 随请求体发送） |
| 日志/终端输出泄露 key | 🟡 中 | `coze_client.py` debug 输出到 stderr 仅含 chat_id/status，不含 key |
| 内存 dump 提取 key | 🟢 低 | 超出作业范围，风险接受 |

**凭据生命周期：**
```
录入（首次）→ 存储（Windows Credential Manager）→ 读取（应用启动时）
→ 更新（Settings 页面可修改）→ 清除（卸载时手动删除凭据）
```

**凭据存储方案：**
- 使用 `keyring` Python 库（跨平台，Windows 使用 Windows Credential Manager）
- 存储凭据：`keyring.set_password("AIEnglishStudio", "deepseek_api_key", key)`
- 读取凭据：`keyring.get_password("AIEnglishStudio", "deepseek_api_key")`
- 前端通过 `/api/config/status` 获取「是否已配置」（不返回明文）
- 设置/更新凭据通过 `/api/config/set` 接收（前端隐藏输入 → 后端写入 keyring）

### 4.3 可用性

- NES.css 像素复古风格统一所有页面
- 侧边栏导航（新增 Dashboard + Diary + Vocab Vault 入口）
- 首次使用引导流程：SetupModal → 配置 Key → 进入 Dashboard
- 所有新增模块响应式适配（≥900px 双栏，<900px 单栏堆叠）

### 4.4 可观测性

- Flask 请求日志（时间、端点、状态码）
- COZE API 调用日志（轮询次数、耗时）→ stderr
- 前端错误 Toast（非阻塞式错误提示）
- 学习统计数据每日写入本地 JSON（供 Dashboard 消费）

---

## 5. 系统架构

### 5.1 组件图

```
┌─────────────────────────────────────────────────────┐
│                   Desktop EXE (PyInstaller)           │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │           React 18 SPA (Vite, NES.css)        │    │
│  │                                                │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐│    │
│  │  │Dashbd│ │Novel │ │Diary │ │Debatr│ │Mine ││    │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬──┘│    │
│  │     │        │        │        │        │    │    │
│  │     └────────┴─────┬──┴────────┴────────┘    │    │
│  │                    │                           │    │
│  │              ┌─────┴─────┐                    │    │
│  │              │ VocabVault│  (跨模块词汇汇聚)    │    │
│  │              └───────────┘                    │    │
│  └──────────────────────┬───────────────────────┘    │
│                         │ /api/*                      │
│  ┌──────────────────────┴───────────────────────┐    │
│  │              Flask Backend                     │    │
│  │                                                │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │    │
│  │  │ Novel  │ │ Diary  │ │Debater │ │Minecraft│ │    │
│  │  │ Router │ │ Router │ │ Router │ │ Router  │ │    │
│  │  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ │    │
│  │      │          │          │          │       │    │
│  │  ┌───┴──────────┴──────────┴──────────┴───┐   │    │
│  │  │           Vocab Vault Router             │   │    │
│  │  └────────────────┬───────────────────────┘   │    │
│  │                   │                            │    │
│  │  ┌────────────────┴───────────────────────┐   │    │
│  │  │           Core Layer                    │   │    │
│  │  │  ┌───────────┐ ┌──────────┐ ┌───────┐  │   │    │
│  │  │  │coze_client│ │DeepSeek  │ │keyring│  │   │    │
│  │  │  │ (COZE v3) │ │(OpenAI)  │ │(WinCR)│  │   │    │
│  │  │  └───────────┘ └──────────┘ └───────┘  │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  │                                                │    │
│  │  外部 API:                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │    │
│  │  │ DeepSeek │  │COZE Bot  │  │Win Cred  │     │    │
│  │  │ API      │  │ API v3   │  │ Manager  │     │    │
│  │  └──────────┘  └──────────┘  └──────────┘     │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │         Minebot (可选独立组件)                  │    │
│  │  Mineflayer Bot → Minecraft Java Server       │    │
│  │  (本项目作为参考代码保留，不集成到 EXE 中)       │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 5.2 数据流

```
用户文本/语音 → React Component → Zustand Store → fetch(/api/*)
  → Flask Router → Core Layer (coze_client / OpenAI SDK)
  → 外部 LLM API → 响应解析 → JSON Response
  → Zustand Store 更新 → React 重新渲染

词汇收集流程：
  任意模块 ⭐ 按钮 → POST /api/vocab/add {word, context}
  → DeepSeek 生成释义/例句 → 写入 data/vocab/vault.json
  → 前端 Toast 确认

凭据流程：
  SetupModal 录入 → POST /api/config/set → keyring.set_password()
  应用启动 → GET /api/config/status → keyring 检查 → 返回 {configured: true/false}
```

---

## 6. 数据模型

### 6.1 Vocab Vault（核心新增）

```json
// backend/data/vocab/vault.json
{
  "version": 1,
  "words": {
    "abandon": {
      "word": "abandon",
      "phonetic": "/əˈbændən/",
      "definition_en": "to leave someone or something completely",
      "definition_zh": "抛弃；放弃",
      "example_sentence": "The crew abandoned the sinking ship.",
      "source_module": "novel",
      "source_context": "...翻译自《三体》第3章...",
      "created_at": "2026-07-07T14:30:00Z",
      "review_count": 3,
      "last_reviewed": "2026-07-07T16:00:00Z",
      "next_review": "2026-07-09T00:00:00Z",
      "easiness_factor": 2.5
    }
  }
}
```

### 6.2 Diary

```json
// backend/data/diary/entries.json
{
  "entries": [
    {
      "date": "2026-07-07",
      "original": "I go to park yesterday...",
      "corrections": [
        {"sentence": "I go to park yesterday", "issues": [
          {"original": "go", "suggestion": "went", "reason": "Past tense required"},
          {"original": "park", "suggestion": "the park", "reason": "Missing article"}
        ]},
        {"sentence": "...", "issues": [...]}
      ],
      "score": {"grammar": 6, "vocabulary": 5, "fluency": 5},
      "streak_day": 12,
      "created_at": "2026-07-07T20:00:00Z"
    }
  ]
}
```

### 6.3 Minecraft Session（兼容 Minebot）

```json
// backend/data/minecraft/<session_id>.json
// 可由 Minebot 进程写入，Web 面板读取
{
  "session_id": "mc-20260707-001",
  "bot_name": "EnglishBot",
  "status": "online",        // "online" | "offline"
  "last_seen": "2026-07-07T15:30:00Z",
  "messages": [
    {"timestamp": "2026-07-07T15:29:00Z", "role": "user", "content": "build a house"},
    {"timestamp": "2026-07-07T15:29:05Z", "role": "assistant", "content": "Sure! Let's gather some oak wood first. Oak is a type of tree..."}
  ]
}
```

### 6.4 Dashboard 统计（运行时从各 data/ 目录聚合，不单独存储）

```json
// 运行时聚合，格式示例：
{
  "today": {
    "novel_chars_translated": 3200,
    "diary_entries": 1,
    "debate_rounds": 3,
    "vocab_added": 8
  },
  "streak_days": 7,
  "total_vocab": 48
}
```

---

## 7. 凭据与分发设计

### 7.1 凭据存储方案

| 凭据 | 存储位置 | 访问方式 |
|------|---------|---------|
| DeepSeek API Key | Windows Credential Manager | `keyring` 库 |
| COZE API Key | Windows Credential Manager | `keyring` 库 |
| Debate Bot ID | Windows Credential Manager | `keyring` 库 |
| Discuss Bot ID | Windows Credential Manager | `keyring` 库 |
| Minecraft Bot ID | Windows Credential Manager | `keyring` 库 |

**过渡方案**：保留 Zustand + localStorage 作为前端缓存（应用运行期间使用），但持久化迁移到 keyring。首次启动检测 keyring 中是否有凭据，无则弹出 SetupModal；有则加载到 Zustand store。

**查看/更新/清除流程：**
- 查看：Settings 页面显示「已配置」状态，不显示明文
- 更新：重新输入 → POST `/api/config/set` → keyring 覆写
- 清除：Settings 页面「清除所有凭据」按钮 → keyring 删除 + localStorage 清除

### 7.2 分发形态

**目标形态：Windows 原生 EXE（单个文件）**

| 项目 | 规格 |
|------|------|
| 打包工具 | PyInstaller（已配置 `.spec` 文件） |
| 前端 | `npm run build` → `backend/static/` |
| 后端 | Flask 在 EXE 内嵌 daemon 线程运行 |
| 浏览器 | EXE 启动 → Flask 启动 → `webbrowser.open()` 打开默认浏览器 |
| 架构 | x86-64 Windows 10/11 |
| 签名 | 无（开源项目，首次运行 Windows SmartScreen 会警告——README 说明如何放行） |

### 7.3 CI/CD

- GitHub Actions `.github/workflows/release.yml`（已有，需更新）
- 触发：Git tag push
- Job：build frontend → copy to backend/static → PyInstaller EXE → 上传 Release
- 新增：`.gitlab-ci.yml`（课程要求）
- 新增：代码测试 job（unit-test）

### 7.4 目标机 key 配置（README 须说明）

1. 下载 EXE 到本地
2. 双击运行 → 浏览器自动打开
3. 首次运行 → SetupModal 引导输入 DeepSeek API Key + COZE API Key + Bot ID
4. Key 安全存储在 Windows Credential Manager 中
5. 后续运行自动从凭据管理器读取——无需重新输入

---

## 8. 技术选型与理由

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| **前端** | React 18 + Vite + NES.css | 已有完整实现；NES.css 独特的像素复古风格是项目辨识度；React 生态成熟 |
| **后端** | Python Flask | 已有完整实现；Python 生态对 LLM SDK 支持最好 |
| **AI 引擎** | DeepSeek API (翻译/评分/释义) + COZE Bot API v3 (辩论/Minecraft 对话) | 已有接入；中文场景性价比高；COZE 提供 Bot 编排能力 |
| **凭据存储** | `keyring` 库 | 跨平台，Windows 下直接使用 Windows Credential Manager |
| **打包** | PyInstaller | 已有 `.spec` 基础；产出单目录/单文件 EXE |
| **状态管理** | Zustand + localStorage | 已有实现；轻量、无 boilerplate |
| **测试** | pytest (后端) + Vitest (前端) | 课程要求 TDD |
| **CI/CD** | GitHub Actions + GitLab CI | 课程要求 |
| **UI 设计** | NES.css 主题（已有）| 像素复古风格 + 紫绿黑配色；不使用 Open Design（纯 CSS 框架已足够） |

**LLM 供应商选择理由：**
- DeepSeek：中文 + 英文双语能力强，价格低，API 兼容 OpenAI SDK
- COZE：Bot 编排适合结构化对话（辩论格式、Minecraft 指令），异步轮询模型对长响应友好

---

## 9. 验收标准

| # | 功能 | 验收标准 |
|---|------|---------|
| AC1 | Dashboard | 首页正确显示四个模块的今日统计 + streak + 快捷入口 |
| AC2 | Diary 批改 | 提交英语短文 → 10s 内返回逐句批改 + 评分 |
| AC3 | Diary 打卡 | 连续提交 3 天 → Dashboard 热力图显示 3 天 streak |
| AC4 | Minecraft UI | Minecraft 页面从 placeholder 变为伴侣面板（只读对话日志 + bot 在线状态 + 5s 轮询 + 词汇收藏），不提供发送消息 UI |
| AC5 | 词汇收藏 | Novel/Debater/Minecraft/Diary 任意模块点击 ⭐ → vault.json 新增条目 |
| AC6 | Vocab Vault 闪卡 | 闪卡翻转动画正常，SM-2 间隔正确计算 |
| AC7 | Vocab Vault 测验 | 四选一测验 → 10 题后显示正确率 |
| AC8 | 凭据安全 | 关闭应用后 localStorage/keyring 外的任何文件不含明文 key |
| AC9 | EXE 分发 | `双击 EXE → 浏览器自动打开 → Dashboard 正常显示` |
| AC10 | 一键测试 | `make test` 运行全部测试并通过 |
| AC11 | CI 通过 | GitLab CI unit-test job 最后一次执行 pass |
| AC12 | 零凭据泄露 | `git grep -i "sk-\|pat_\|api.key"` 未发现真实凭据 |

---

## 10. 风险与未决问题

### 10.1 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| COZE API 轮询超时（60s） | 辩论/Minecraft 消息失败 | 前端超时提示 + 重试按钮；必要时上调 POLL_TIMEOUT |
| DeepSeek 返回格式不合法（日记批改 JSON） | 批改结果无法渲染 | 回退到原文显示 + 通用错误提示；System Prompt 约束输出格式 |
| PyInstaller 打包体积过大 | EXE > 200MB，分发不便 | 精简依赖（当前 ~80MB）；使用 `--onefile` 的 UPX 压缩 |
| Minebot 与主项目的集成 | Minebot 是 Node.js 项目，主项目是 Python，运行时分离 | Minebot 作为独立组件保留代码参考，不集成到 EXE；Minecraft 模块用 COZE Bot 替代 |
| NES.css 像素字体中文支持 | "Press Start 2P" 不含中文字符 | 已配置 fallback `"Microsoft YaHei"`，中文可正常显示 |

### 10.2 未决问题

1. **语音输入跨浏览器兼容性**：当前 `SpeechRecognition` API 仅 Chrome/Edge 支持。是否需要在 EXE 中捆绑 Chromium？（当前决策：不捆绑，README 建议用户使用 Chrome/Edge 打开）
2. **Minecraft 双向交互**：Web 面板仅做「监控 + 回顾 + 词汇收集」——不在网页中发消息。发消息始终在 PCL 游戏内完成。面板的词汇收藏功能是 PCL 无法提供的增量价值。
3. **跨平台支持**：当前仅 Windows EXE。macOS/Linux 是否需要？（当前决策：v2.0 仅 Windows；跨平台在 v2.1 考虑）

---

## Appendix A: 与 v1.2.0 的变更摘要

| 变更类型 | 内容 |
|----------|------|
| **新增** | Dashboard 首页 |
| **新增** | English Diary 模块 |
| **新增** | Vocab Vault 模块（跨模块词汇汇聚 + 闪卡复习 + 测验） |
| **新增** | Windows Credential Manager 凭据存储 |
| **增强** | Novel Translator — hover 释义 + 词汇收藏 |
| **增强** | Debater — 辩论评分 + 词汇收藏 |
| **增强** | Minecraft Companion — 从 PCL placeholder 到伴侣面板（只读对话日志 + 词汇收藏 + bot 状态） |
| **增强** | Sidebar 从 3 个入口 → 6 个入口（Dashboard, Novel, Diary, Debater, Minecraft, Vocab Vault） |
| **变更** | 凭据从纯 localStorage → keyring + localStorage 混合 |
