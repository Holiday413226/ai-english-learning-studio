# AI English Learning Studio v2.0.0

> **Type:** B · 应用类项目 | **Status:** Final | **Tests:** 51 passed | **Commits:** 33

AI 驱动的英语学习桌面应用 —— 六模块学习闭环：翻译阅读 → 日记写作 → 辩论口语 → Minecraft 沉浸 → 词汇宝库串联，一键打包为 Windows EXE。

---

## 功能

### 核心模块

| 模块 | 功能 | 技术 |
|------|------|------|
| 🏠 Dashboard | 今日学习统计（翻译字数、日记篇数、辩论场次、新增词汇）、连续打卡 streak、模块快捷入口 | Flask + React |
| 📖 Novel Translator | 拖拽上传中文小说 → DeepSeek AI 翻译 → CET-4/6 词汇高亮 → ⭐收藏生词 | DeepSeek API |
| ✍️ English Diary | AI 每日话题提示 → 写英语日记 → DeepSeek 逐句批改（语法/用词/流畅度）→ ⭐收藏高分表达 | DeepSeek API |
| ⚔️ Debater | COZE Bot 英语辩论/讨论 → 语音输入/输出 → 📊AI 辩论评分（语法/词汇/逻辑/流畅度）→ ⭐收藏单词 | COZE Bot API |
| ⛏ Minecraft Companion | PCL 游戏内与 AI Bot 对话 → Web 面板查看对话历史 + ⭐收藏词汇（只读面板，不发消息） | COZE Bot API + Mineflayer |
| 📚 Vocab Vault | 四模块词汇汇聚 → 闪卡复习（SM-2 间隔重复）→ 四选一测验 → CSV 导出 | 本地 JSON + DeepSeek |

### 工程特性

- 🔒 **凭据安全** — Windows Credential Manager 加密存储，零硬编码，零 Git 泄露
- 📦 **一键 EXE** — PyInstaller 打包，双击运行，浏览器自动打开
- ✅ **TDD 全覆盖** — 51 tests (pytest)，先红再绿再重构
- 🔄 **CI/CD** — GitLab CI unit-test job，GitHub Actions 自动构建 EXE
- 🎨 **NES.css 像素复古** — 紫绿黑主题 + "Press Start 2P" 字体

---

## 快速开始

### EXE 模式（推荐）

1. 下载 `AIEnglishStudio.exe`（51MB）
2. 双击运行 → 浏览器自动打开 `http://127.0.0.1:5000`
3. 首次运行点击 ⚙ Settings 配置 API Key：
   - 翻译/日记/评分：DeepSeek API Key（在 [platform.deepseek.com](https://platform.deepseek.com) 获取）
   - 辩论/Minecraft：COZE API Key + Bot ID（在 [coze.cn](https://www.coze.cn) 创建）
4. Key 安全存储在 Windows Credential Manager 中，后续自动读取

### 开发模式

```bash
# 安装依赖
make install-dev

# 启动开发服务器（Flask :5000 + Vite :5173）
make dev

# 运行测试
make test
```

### 手动启动

```bash
# 后端
cd backend
pip install -r requirements.txt
python app.py

# 前端（新终端）
cd frontend
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`

---

## 分发

| 形态 | 文件 | 大小 |
|------|------|------|
| Windows EXE | `backend/dist/AIEnglishStudio.exe` | 51MB |
| 源码 ZIP | `AI-English-Learning-Studio-v2.0.0-source.zip` | 575KB |
| Git Bundle | `AI-English-Studio-v2.0.0.bundle`（33 commits）| 605KB |

### EXE 构建

```bash
make build-exe
# Output: backend/dist/AIEnglishStudio.exe
```

### 已知限制

- **仅 Windows** — macOS/Linux 可通过源码运行（`make dev`），EXE 仅支持 Windows 10/11 x86-64
- **首次运行 SmartScreen 警告** — 开源项目未签名，点击「更多信息」→「仍要运行」
- **语音输入仅 Chrome/Edge** — 使用浏览器 SpeechRecognition API
- **Minecraft 模块需要在 PCL 中运行 Minebot** — Web 面板仅做历史回顾和词汇收集

---

## 安全

### 凭据威胁模型

| 威胁 | 对策 |
|------|------|
| API Key 硬编码 | 永不硬编码 — 前端录入，请求体传递 |
| API Key 提交 Git | `.gitignore` 排除 `.env`, `keys.json`, `config.json`, `data/`, `.claude/` |
| 浏览器 localStorage 明文 | v2.0 新增 Windows Credential Manager (keyring 库) |
| 进程环境变量泄露 | 不使用环境变量传递 key |
| 日志泄露 key | `coze_client.py` debug 输出仅含 chat_id/status，不含 key |

### Key 生命周期

```
录入（SetupModal 密码框）→ 存储（Windows Credential Manager）
→ 读取（应用启动时）→ 更新（⚙ Settings）→ 清除（Settings → Clear All）
```

### 首次配置

1. 启动应用 → ⚙ Settings
2. 填入 DeepSeek API Key (`sk-xxx`) + COZE API Key (`pat_xxx`) + Bot IDs
3. 点击 Save → Key 写入 Windows Credential Manager
4. 后续启动自动读取，无需重新输入
5. 查看状态：⚙ Settings 显示 "🔒 Stored" / "Not configured"（不回显明文）

---

## 项目结构

```
agent/
├── backend/
│   ├── app.py                           # Flask 应用入口
│   ├── shutdown.py                      # EXE 优雅退出
│   ├── core/
│   │   ├── config.py                    # 配置常量（端口、模型、system prompt）
│   │   └── coze_client.py              # COZE Bot API v3 异步客户端
│   ├── systems/
│   │   ├── config/                      # ⭐ 凭据管理（keyring）
│   │   │   └── keyring_store.py        # Windows Credential Manager CRUD
│   │   ├── novel/                       # 📖 翻译模块
│   │   │   ├── router.py               # POST /api/novel/translate, GET /define
│   │   │   ├── translator.py           # DeepSeek 翻译引擎 + 词汇释义
│   │   │   └── session_storage.py      # 翻译历史
│   │   ├── diary/                       # ✍️ 日记模块
│   │   │   ├── router.py               # POST /api/diary/submit, GET /entries, GET /streak
│   │   │   ├── grader.py               # DeepSeek 批改引擎
│   │   │   └── session_storage.py      # 日记持久化 + 打卡统计
│   │   ├── debater/                     # ⚔️ 辩论模块
│   │   │   ├── router.py               # POST /api/debater/chat, POST /score
│   │   │   ├── scorer.py               # DeepSeek 辩论评分引擎
│   │   │   └── session_storage.py      # 会话管理
│   │   ├── minecraft/                   # ⛏ Minecraft 伴侣
│   │   │   ├── router.py               # GET /companion/status, /sessions, /session
│   │   │   └── session_storage.py      # Bot 状态 + 会话管理
│   │   └── vocab/                       # 📚 词汇宝库
│   │       ├── router.py               # 8 端点 (add/list/review/quiz/export/…)
│   │       ├── vault.py                # SM-2 间隔重复 + 测验生成
│   │       └── ai_definer.py           # DeepSeek 单词释义
│   └── data/                            # 运行时 JSON（gitignored）
├── frontend/
│   └── src/
│       ├── App.jsx                      # 路由（6 页面）
│       ├── components/
│       │   ├── Sidebar.jsx             # 侧边导航（6 入口）
│       │   ├── SetupModal.jsx          # ⚙ 全局设置（API Key + Bot ID）
│       │   ├── vocab/VocabStar.jsx     # ⭐ 可复用词汇收藏按钮
│       │   └── debater/                # 辩论 UI 组件
│       └── systems/
│           ├── dashboard/              # 🏠 首页仪表盘
│           ├── novel/                  # 📖 翻译页面
│           ├── diary/                  # ✍️ 日记页面
│           ├── debater/                # ⚔️ 辩论页面
│           ├── minecraft/              # ⛏ Minecraft 伴侣
│           └── vocab/                  # 📚 词汇宝库（闪卡 + 测验）
├── Minebot/mindcraft/                   # Minecraft Bot（独立 Node.js 组件）
├── tests/                               # 51 个 pytest 测试
│   ├── test_config_status.py           # 3 tests
│   ├── test_vocab_vault.py             # 9 tests
│   ├── test_diary_grader.py            # 13 tests
│   ├── test_minecraft_companion.py     # 8 tests
│   ├── test_novel_define.py            # 8 tests
│   ├── test_debater_scorer.py          # 7 tests
│   └── test_dashboard_stats.py         # 3 tests
├── .github/workflows/release.yml        # GitHub Actions EXE 构建
├── .gitlab-ci.yml                       # GitLab CI unit-test job
├── Makefile                             # make test / make build-exe / make dev
├── SPEC.md                              # 设计文档（10 章节）
├── PLAN.md                              # 实现计划（18 tasks, 4 phases）
├── SPEC_PROCESS.md                      # 过程文档（brainstorming + 冷启动）
├── AGENT_LOG.md                         # Subagent 调用日志
└── REFLECTION.md                        # 反思报告（3000 字）
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + Vite 5 + NES.css + Zustand 4 |
| **后端** | Python Flask 3.x |
| **AI 引擎** | DeepSeek API (OpenAI SDK) + COZE Bot API v3 |
| **凭据存储** | keyring → Windows Credential Manager |
| **打包** | PyInstaller |
| **测试** | pytest (51 tests) |
| **CI/CD** | GitHub Actions + GitLab CI |
| **Minecraft** | Mineflayer (Node.js) + COZE Bot |

---

## 致谢

- [Superpowers](https://github.com/obra/superpowers) — AI 编程方法论框架
- [NES.css](https://nostalgic-css.github.io/NES.css/) — 像素复古 CSS 框架
- [Mineflayer](https://github.com/PrismarineJS/mineflayer) — Minecraft Bot 框架
- [DeepSeek](https://platform.deepseek.com/) — AI 翻译/批改/评分引擎
- [COZE](https://www.coze.cn/) — AI Bot 编排平台

---

## License

MIT
