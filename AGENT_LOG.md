# AGENT_LOG.md — AI English Learning Studio v2.0.0

> 按课程要求 §4.9，按时间顺序记录 Superpowers 技能触发、subagent 调用、人工干预、学到的教训。

---

## Phase 0: 项目启动 (2026-07-07)

### [14:00] 项目初始化

| 项目 | 详情 |
|------|------|
| **触发技能** | `brainstorming`（Superpowers 七步工作流第一步） |
| **关键决策** | 选定 B 类项目（应用类），方向：基于已有 v1.2.0 项目拓展为英语学习平台 |
| **Agent** | Claude Code (Claude Opus 4.8, VS Code Extension) |
| **人工干预** | 否决了 AI 提出的「换 FastAPI + pywebview」方案，坚持沿用 Flask + React + PyInstaller；否决了「Web 聊天替代 PCL」方案，改为伴侣面板 |
| **教训** | AI 倾向于推荐「更现代」的技术栈而非「更省力」的方案。用户对现有代码的熟悉度是技术选型的关键约束 |

### [14:30] Superpowers 安装

| 项目 | 详情 |
|------|------|
| **操作** | 手动克隆 `obra/superpowers` 到 `.claude/skills/superpowers/`，再复制 14 个技能到 `.claude/skills/` |
| **问题** | `/plugin install` 命令在 VS Code Extension 中不可用（需要 CLI 版本）；GitHub 直连被墙 |
| **解决** | 通过 ghproxy.net 镜像克隆成功 |

### [14:55] 原项目迁移

| 项目 | 详情 |
|------|------|
| **操作** | 将 `26.6.4英语化小说C版`（Flask + React v1.2.0）和 `Minebot/mindcraft` 复制到 `agent/` 目录 |
| **Git 历史** | 9 个原始 commit 完整保留 |
| **凭据检查** | 发现 `Minebot/mindcraft/keys.json` 含真实 DeepSeek API Key（`sk-8a415b...`）→ 立即删除并确认未进入 Git 历史 |
| **教训** | 迁移第三方项目时，凭据文件是最高优先级检查项。`.gitignore` 应提前配置而非事后补救 |

---

## Phase 1: 规格与计划 (2026-07-07)

### [15:00-16:30] Brainstorming — 7 轮关键迭代

| 轮次 | 主题 | AI 建议 | 我的决策 |
|------|------|---------|---------|
| 1 | 项目类型 | A vs B 比较 | 选 B（应用类） |
| 2 | 目标用户 | 英语学习者 | 采纳 ✅ |
| 3 | 技术形态 | FastAPI + pywebview | 推翻 ❌ → 保持 Flask + PyInstaller |
| 4 | 拓展方向 | 平台化 + 学习闭环（方案 B） | 采纳 ✅ |
| 5 | 第四功能 | Vocab Vault 或 Diary | 两个都要 |
| 6 | Minecraft | 伴侣面板（方案 C） | 采纳 ✅ — 不做 Web 聊天替代 PCL |
| 7 | 设计审批 | 完整设计总结 | 签字确认 |

**关键 prompt：** Claude Code 的「One question at a time」约束非常有效——每次只问一个选择，让我有时间思考并做出有意义的决策。

### [16:30] SPEC.md — 10 章节设计文档

| 项目 | 详情 |
|------|------|
| **文件** | `SPEC.md`（27KB） |
| **涵盖** | 问题陈述、6 用户故事、6 模块功能规约、非功能需求、系统架构图、数据模型、凭据威胁模型、分发设计、技术选型、验收标准 12 项、风险 5 项 |
| **Agent** | Claude Code (Opus 4.8) |
| **人工修订** | 补充了 Diary + Vocab Vault 的具体 API 设计、Minecraft 伴侣面板的交互模型 |

### [17:00] PLAN.md — 18-Task 实现计划

| 项目 | 详情 |
|------|------|
| **触发技能** | `writing-plans` |
| **文件** | `PLAN.md`（65KB） |
| **结构** | 4 Phase、18 Task，每个 Task 含确切文件路径、接口契约、TDD 步骤（测试代码→红色→实现→绿色→commit） |
| **自审** | Spec coverage check 确认所有 SPEC 章节有对应 Task ✅ |
| **发现** | writing-plans 的「每步 2-5 分钟」粒度对中等模块过于极端——折中为 5-10 步/Task |

### [17:30] SPEC_PROCESS.md — 过程文档

| 项目 | 详情 |
|------|------|
| **内容** | 7 轮关键迭代记录、4 次 AI 建议采纳/推翻分析、Brainstorming 技能评估（好/不满）、Writing-Plans 技能评估 |

---

## Phase 2: 冷启动验证 (2026-07-07 — 07-08)

### [21:00] Codex CLI 尝试（失败）

| 项目 | 详情 |
|------|------|
| **Agent** | Codex CLI v0.142.5 |
| **问题** | 登录取决于 ChatGPT Plus 订阅，且 npm 直连超时 |
| **解决** | 改用 npmmirror 镜像安装成功，但 API Key 认证失败（用了 DeepSeek Key 对 OpenAI API） |
| **教训** | Codex 的 `auth.json` 中发现了之前的 DeepSeek API Key——Codex 把用户手动输入的 Key 明文存储在了 `~/.codex/auth.json`。已从 Codex 配置中清除 |

### [22:00] Gemini CLI 尝试（成功 ✅）

| 项目 | 详情 |
|------|------|
| **Agent** | Google Gemini CLI v0.49.0 |
| **安装** | `npm install -g @google/gemini-cli`，通过 OAuth (oauth-personal) 登录 |
| **认证问题** | 配置格式试错 5 次（`"api-key"` vs `"oauth"` vs `"use_gemini_api_key"` vs `"oauth-personal"`），最终 `"oauth-personal"` 正确 |
| **教训** | Gemini CLI 的 `settings.json` 文档不够清晰——`selectedType` 的合法值没有在安装文档中列出 |

### [10:00 07-08] 冷启动验收

| 项目 | 详情 |
|------|------|
| **实施 Task** | Task 1（keyring 凭据存储）+ Task 2（Vocab Vault 后端） |
| **结果** | 12/12 测试通过（3 keyring + 9 vocab），TDD 严格遵循 |
| **发现缺陷** | 3 个测试与实现不一致的 bug（详见 [SPEC_PROCESS.md §5.3](SPEC_PROCESS.md)） |
| **修订** | SPEC + PLAN 针对 3 个发现做了修订 |

---

## Phase 3: 并行实现 Phase 2 后端 (2026-07-08)

### [10:30] Worktree 创建 + 5 Subagent 并行派发

| 项目 | 详情 |
|------|------|
| **触发技能** | `using-git-worktrees` + `dispatching-parallel-agents` |
| **Worktrees** | `feat/task-3-diary-backend`, `feat/task-4-minecraft-companion`, `feat/task-5-novel-define`, `feat/task-6-debater-score`, `feat/task-7-dashboard-stats` |
| **Subagent 类型** | `general-purpose`（5 个同时后台运行） |
| **每个 agent 的 prompt** | 包含 Task 编号、确切工作目录路径、TDD 要求：「先写失败测试→确认红色→写最少实现→确认绿色→commit」 |

### Task 3: Diary Backend ✅

| 项目 | 详情 |
|------|------|
| **Agent** | `general-purpose` (ID: af602ffde64c2fb82) |
| **耗时** | ~8 分钟 |
| **产出** | `grader.py`（120 行）、`router.py`（87 行）、`session_storage.py`（167 行）、`test_diary_grader.py`（215 行，13 测试） |
| **Commit** | `1b7bbeb` |
| **Token** | ~57K |

### Task 4: Minecraft Companion Endpoints ✅

| 项目 | 详情 |
|------|------|
| **Agent** | `general-purpose` (ID: ab62e07e421706baa) |
| **耗时** | ~7 分钟 |
| **产出** | `session_storage.py`（+81 行 bot_status）、`router.py`（+63 行 companion 路由）、`test_minecraft_companion.py`（134 行，8 测试） |
| **Commit** | `7b64dcd` |
| **Token** | ~57K |

### Task 5: Novel Define API ✅

| 项目 | 详情 |
|------|------|
| **Agent** | `general-purpose` (ID: a7f4405cdcdd708c0) |
| **耗时** | ~7 分钟 |
| **产出** | `translator.py`（+91 行 quick_define）、`router.py`（+34 行 GET /define）、`test_novel_define.py`（169 行，8 测试） |
| **Commit** | `d0fd9f1` |
| **Token** | ~56K |

### Task 6: Debater Scoring Endpoint ✅

| 项目 | 详情 |
|------|------|
| **Agent** | `general-purpose` (ID: a22e21f8cf951ac42) |
| **耗时** | ~6 分钟 |
| **产出** | `scorer.py`（128 行）、`session_storage.py`（+14 行 get_messages_for_scoring）、`router.py`（+40 行 POST /score）、`test_debater_scorer.py`（152 行，7 测试） |
| **Commit** | `3287a10` |
| **Token** | ~53K |

### Task 7: Dashboard Stats Endpoint ⚠️ + 手动修复

| 项目 | 详情 |
|------|------|
| **Agent 1** | `general-purpose` (ID: a852a26cc5f9c2673) — 写了测试后被 kill（卡住） |
| **Agent 2** | `general-purpose` (ID: aa68d74bd8749ea24) — 实现了 endpoint（`app.py` +395 行），但 1/3 测试失败（字符数差异） |
| **手动修复** | 修正测试断言字符数（54→57）+ 解决 macOS/Linux 合并冲突标记残留 |
| **最终** | 3/3 测试通过 ✅，commit `6007e72` + `8091ccc` |
| **教训** | Dashboard endpoint 直接放在 `app.py` 中导致后续合并冲突（Task 3 也改了 `app.py`）。后续类似任务应放在独立 router 文件中 |

### [11:00] 合并 5 个 Worktree 分支

```
feat/task-3-diary-backend       ├── 1b7bbeb
feat/task-4-minecraft-companion ├── 7b64dcd
feat/task-5-novel-define        ├── d0fd9f1
feat/task-6-debater-score       ├── 3287a10
feat/task-7-dashboard-stats     └── 6007e72
```

合并后全量测试 **51/51 通过 ✅**

---

## Phase 4: 前端实现 (2026-07-08)

### [11:15] 前端页面 + 组件

**Agent:** 本次未使用 subagent（前端变化较多，直接在主 session 中实现更快）。

**产出：**

| 文件 | 行数 | 内容 |
|------|------|------|
| `Sidebar.jsx` | ~50 | 3→6 导航项，版本号 v1.2.0→v2.0.0 |
| `App.jsx` | ~45 | 3→6 Route |
| `DashboardPage.jsx` | ~100 | 今日 4 统计卡片 + streak/total 栏 + 5 模块启动卡片 |
| `DiaryPage.jsx` | ~130 | 双栏：写作 textarea + AI 批改 diff + VocabStar 集成 |
| `VocabPage.jsx` | ~260 | 三 Tab：Word List（排序/过滤/CSV）+ Flashcards（翻转 + SM-2）+ Quiz（四选一 10 题） |
| `MinecraftPage.jsx` | ~140 | 全改写：status bar + 会话列表 + 消息只读 + 5s 轮询 + VocabStar |
| `VocabStar.jsx` | ~40 | 可复用 ⭐ 按钮组件 |
| `api.js` × 3 | ~100 | Dashboard + Diary + Vocab API 函数 |

**设计原则：** 100% 沿用 NES.css 紫绿黑像素主题 + "Press Start 2P" 字体 + Microsoft YaHei fallback。所有新页面使用相同的 `window`/`nes-btn`/`debater-*` CSS class。

---

## Phase 5: CI/CD + 文档 (2026-07-08 待续)

| Task | 状态 |
|------|------|
| `Makefile` | ✅ commit `9e5d5b8` |
| `.gitlab-ci.yml` | ✅ commit `9e5d5b8`，含 unit-test job |
| `README.md` | ⬜ 待更新（v1.2.0 → v2.0.0） |
| `REFLECTION.md` | ⬜ 待写 |
| GitHub Actions 更新 | ⬜ |

---

## 统计

| 指标 | 数值 |
|------|------|
| **Claude Code subagent 调用** | 5（Phase 2 并行）+ 1（冷启动 Task 7 修复）= 6 |
| **外部 agent** | Gemini CLI v0.49.0（冷启动验证） |
| **Git commits** | 20+（含 v1.2.0 原有 9 个） |
| **测试覆盖** | 51 tests（config 3 + vocab 9 + diary 13 + minecraft 8 + novel 8 + debater 7 + dashboard 3） |
| **Superpowers 技能使用** | brainstorming, writing-plans, using-git-worktrees, dispatching-parallel-agents, test-driven-development |
| **凭据泄露事件** | 1（Minebot keys.json → 立即删除 + .gitignore 加固） |
