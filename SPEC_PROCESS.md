# SPEC_PROCESS.md — AI English Learning Studio v2.0.0

> 与 Superpowers `brainstorming` + `writing-plans` 技能协作生成 SPEC 与 PLAN 的过程记录

**项目类型：** B · 应用类项目
**主开发智能体：** Claude Code (Claude Opus 4.8, VS Code Extension)
**日期：** 2026-07-07

---

## 一、起点：从模糊想法到 B 方案

### 1.1 初始状态

项目开始前，我有：
- 一个已完成的 v1.2.0 项目（AI Tool Suite：Novel Translator + Debater + Minecraft placeholder）
- 一个课程要求（用 Superpowers 方法做一个有工程深度的应用）
- 一个模糊意图：「拓展这个项目」

**我带着三个不知道进入 brainstorming：**
1. 不知道选 A（Coding Agent Harness）还是 B（应用类项目）
2. 不知道拓展方向——是做深还是做宽
3. 不知道什么样的拓展能撑起期末项目的「深度」要求

### 1.2 Brainstorming 关键节点

**第 1 轮：项目类型选定（B 类）**

Brainstorming 技能启动后，Claude Code 逐一发问——第一个就是 A vs B。

> **Claude Code：** 选 A 还是 B？A = Coding Agent Harness（自己写编码智能体内核），B = 一般应用类项目。
>
> **我：** 选 B。

这个决策很快——我有现成的项目基础可以拓展，A 类需要从零写 harness 内核，风险太大。

**第 2 轮：应用方向澄清（英语学习助手）**

> **Claude Code：** 目标用户是谁？
>
> **我：** 英语学习者。

这是整个设计的关键转折点。在此之前，我的三个功能（翻译、辩论Bot、Minecraft智能体）是**技术上相关的**（都用了 AI API）但**用户场景上割裂的**。把目标用户定为「英语学习者」后，三个功能忽然有了统一的故事线：

> 翻译 = 输入理解 → 辩论 = 口语输出 → Minecraft = 沉浸练习

**这是我采纳的第一个重要 AI 建议**：Claude Code 没有直接说「你应该做英语学习」，而是通过问「目标用户是谁」让我自己意识到三个功能的公共交集。

**第 3 轮：技术形态碰撞（桌面应用 + 延续 UI）**

> **Claude Code：** 三个方案——PySide6 原生桌面 / Web-桌面混合 / TUI 终端界面。
>
> **我：** 我原来项目已有 Web UI，想沿用那个做成 EXE。

这是**我推翻 AI 推荐**的第一个地方。AI 推荐「Web-桌面混合」（FastAPI + pywebview），理由是「UI 开发快，可以用 Open Design」。但我的项目已经有完整的 React + Flask 方案——重写后端框架（Flask → FastAPI）和打包方式（Electron → pywebview）纯粹是重复造轮子。

AI 接受了我的决定，转而基于现有架构设计拓展方案。

**第 4 轮：三方案比较 + B 方案胜出**

> **Claude Code：** 三个拓展方案——
> - A：补齐短板 + 轻量增强（~3 周）
> - B：平台化 + 学习闭环（~5 周）⭐ 推荐
> - C：加第四个完全新模块（~6 周，风险高）
>
> **我：** B 方案可以。

这是**我完全采纳的第二个 AI 建议**。「平台化 + 学习闭环」这个概念是我自己没想到的。我原本想的是「多加几个功能」，但 AI 提出的框架是：

1. 原来三个功能各自独立 → 加上一个「串联者」（Vocab Vault）
2. 补齐「写作」（Diary）作为第四个核心功能
3. 一个首页 Dashboard 做导航中枢

这个设计让项目从一个「工具集」变成了一个「学习平台」——工程深度瞬间上去了。

**第 5 轮：第四个功能的选定**

> **Claude Code：** 三个候选：Writing Coach / Scenario Role-Play / Vocab Vault。推荐 Vocab Vault。
>
> **我：** Vocab Vault 很好，再加 English Diary。

这是我**部分采纳、部分扩展**的决策。AI 推荐 Vocab Vault 作为唯一的串联模块，理由是「让整个应用从三个独立工具变成有数据流动的平台」。我觉得有道理，但同时觉得 Diary 也不应该放弃——写作是英语学习中翻译和口语之间缺失的一环。最终方案是四个核心功能 + Vocab Vault 作为串联者。

**第 6 轮：Minecraft 交互模型的关键转弯**

> **Claude Code：** 你的原项目 Minecraft 模块是通过 COZE Bot 在网页里聊天。但 Minebot 项目是通过 Mineflayer 在 PCL 游戏内直接对话。两者怎么处理？
>
> **我：** 目前是在 PCL 里直接对话，没有通过 Web UI。

这是项目中**最关键的架构讨论**。三个方案摆出来：

> - A：Web 聊天 UI 替代 PCL——**更差**，用户需要切窗口
> - B：PCL 内对话 + 无 Web UI——课程要求要有 WebUI，空了一块
> - C：PCL 内对话 + Web 伴侣面板——Web 不做聊天替代，做「监控 + 回顾 + 词汇收集」⭐

我选了 C。这是 AI 提出的最有创造性的方案，也让我意识到：Web UI 不一定非要「替代」游戏内交互，它可以做一个「增强层」——游戏里做不到的事（回顾对话、收藏词汇），Web 面板来做。

**第 7 轮：SPEC 细节确认 + 设计审批**

> **Claude Code：** 帮我确认以下设计总结...确认吗？
>
> **我：** 确认。

设计从模糊到清晰的全过程至此完成。

---

## 二、多轮迭代的关键决策记录

### 迭代 1：从「三个散装功能」到「英语学习闭环」

**原设想：** 把三个功能做得更好一点，打包成 EXE 交差。

**AI 提问：** 「目标用户是谁？」

**我的修正：** 意识到需要有一个统一的用户定位。

**采纳/推翻/修正原因：**
- ✅ 采纳：以「英语学习者」为中心重新组织所有功能
- ✅ 采纳：在三个模块之上加统一的 Dashboard 和学习统计

**关键收获：** 一个好的「who」问题比十个「what」问题更有用。

### 迭代 2：从「换技术栈」到「沿用现有架构」

**原设想：** 也许该换 Electron 或其他技术。

**AI 提议：** 推荐 Web-桌面混合（FastAPI + pywebview）。

**我的修正：** 推翻。Flask + React + PyInstaller 已经能工作，换框架是纯成本。

**采纳/推翻/修正原因：**
- ❌ 推翻 FastAPI 迁移——现有 Flask 代码成熟稳定，迁移没有用户价值
- ❌ 推翻 pywebview——PyInstaller 已经在 CI 里跑通，EXE 打包验证过了
- ✅ 保留 AI 建议的「Web UI 嵌入桌面窗口」思路——当前方案本质上就是如此（Flask 内嵌浏览器打开）

**关键收获：** AI 对现有代码的状态了解不如我深——它倾向于推荐「更现代」而非「更省力」。

### 迭代 3：Vocab Vault 从「单一新功能」变成「串联所有模块的黏合剂」

**原设想：** 新增第四个独立功能模块。

**AI 提议：** 首选 Vocab Vault。我补充 Diary。

**采纳/推翻/修正原因：**
- ✅ 采纳 Vocab Vault 作为跨模块的词汇收集中枢
- ✅ 我自己加了 Diary——因为听说读写四个维度，写作缺失太明显
- ✅ 采纳「每个模块都是词汇收集入口」的设计——让 Vocab Vault 从「一个页面」变成「全应用的词库层」

**关键收获：** 用户 + AI 协作的优势在于——AI 提供结构（平台化），用户提供判断（补充 Diary）。

### 迭代 4：Minecraft 伴侣面板——不做替代，做增强

**原设想：** 把 Minecraft placeholder 页面补齐成一个完整的聊天 UI。

**AI 提问：** 你在 PCL 里直接对话了，还需要 Web 聊天吗？

**我的修正：** 不需要。但在 AI 提出了「伴侣面板」方案后，我意识到这比「聊天 UI」更好。

**采纳/推翻/修正原因：**
- ❌ 推翻原有的「完整聊天 UI」方案——会让用户切窗口，体验倒退
- ✅ 采纳「伴侣面板」方案——只读对话日志 + 词汇收藏，尊重原有游戏内交互

**关键收获：** 这是整个设计中「AI 最聪明的一个建议」——它没有从技术可行性出发（「能不能做聊天 UI」），而是从用户体验出发（「用户为什么要切出游戏来打字」）。

---

## 三、Brainstorming 技能评估

### 做得好的地方

1. **强制一问一答** —— 技能中的「One question at a time」约束非常有效。AI 没有一次抛出 5 个问题让我崩溃，而是每次只问一个，让我有时间思考。这比 ChatGPT 式的「一口气列出所有选项」更能深入理解需求。

2. **多方案比较** —— 每次都给出 2-3 个方案并标注推荐，这让我不是在「领受指令」而是在「做选择」。Minecraft 的 ABC 三方案比较是最典型的例子。

3. **设计审批门** —— 「Present design sections, get approval after each section」这个硬门槛在 SPEC 最后阶段起了作用——我签字确认后才开始写 SPEC，避免了「写完了发现方向不对」的返工。

4. **上下文探索** —— 技能要求先探索项目状态再提问。Claude Code 自动派了 subagent 去读原项目的所有关键文件（backend/app.py, 每个 router, 每个 store, Minebot 结构），这让它不需要问我「你用了什么框架」这类低效问题。

### 让我不满的地方

1. **视觉伴侣（Visual Companion）没有被触发** —— 技能里有「如果问题用图更清晰就打开 browser tab」的规定，但在整个 brainstorming 过程中没有触发。因为大部分是概念性问题（「目标用户是谁」），不需要 mockup。但我认为在「最终架构总结」那一步，如果能有一个 ASCII 或浏览器架构图，会比纯文字更容易让我确认。

2. **中文支持不是一等公民** —— 技能的 prompts 和输出都是英文的，但我的项目面向中文用户。AI 适应了这个需求（最终 SPEC 和 PLAN 用中文写），但技能本身没有「检测用户语言并适配」的逻辑——这是训练数据 bias，不是技能设计问题。

3. **没有显式记录 backtracking** —— 过程中有几轮「问了一个问题发现需要回退修正」。技能没有显式说「我们可能需要回到上一步」，这让我自己需要主动说才行。比如 Minecraft 那轮——AI 问了之后我才意识到自己之前假设的「做聊天 UI」是错的。

---

## 四、Writing-Plans 技能评估

### 做得好的

1. **文件结构映射（File Structure）** —— writing-plans 要求在定义 task 之前先画出所有文件的修改/创建清单。这非常有用——它让我在拆 task 之前就对「到底要改多少文件」有了全局视野（~40 个文件，其中 ~20 个新建）。

2. **接口契约（Interfaces）** —— 每个 task 要求写明「Consumes」和「Produces」。这在多 subagent 并行开发时是救命的设计——每个 agent 只看到自己的 task，但通过接口契约知道别人提供什么、自己产出什么。

3. **占位符禁令（No Placeholders）** —— 规则非常严厉：禁止 TBD、TODO、「implement later」、任何步骤只有描述没有代码。写完 PLAN 的 self-review 阶段，我确实搜了一遍确认没有遗漏。

### 不满的地方

1. **颗粒度过于极端** —— 技能要求每步 2-5 分钟。但 PLAN 的实际每个 Task 都远超 5 分钟（Task 2 光 vault.py 就 250 行）。这是因为课程项目的模块粒度本身就是中等的——一个后端路由模块必然包含 200+ 行代码。把 250 行拆成 50 个 5 分钟的小步会让 PLAN 膨胀到不可读。我做了折中：每个 Task 内部有 5-10 步（写测试→失败→写代码→通过→commit），但 Task 之间才是主要的开发单位。

2. **缺少对「并行开发」的显式指导** —— writing-plans 没有说怎样标记「哪些 task 可以并行、哪些有依赖」。我自己加了 Task Dependency Graph。但如果技能本身能生成一个依赖图（DAG），会让后续的 subagent 派发（Phase 2 并行 5 个 agent，Phase 3 并行 5 个 agent）更清晰。

---

## 五、冷启动验证（已完成 ✅）

> 按课程要求 §4.5，正式实现前需要用一个**不同于 Claude Code 的 agent**——这里是 **Google Gemini CLI v0.49.0**——仅凭 SPEC.md + PLAN.md 尝试实现 1-2 个 task。整个过程未向 Gemini 提供任何与 Claude Code 的对话历史。

### 5.1 验证环境

| 项目 | 详情 |
|------|------|
| **智能体** | Google Gemini CLI v0.49.0 |
| **认证方式** | Google OAuth (oauth-personal) |
| **实施 Task** | Task 1（keyring 凭据存储）+ Task 2（Vocab Vault 后端） |
| **提供材料** | 仅 SPEC.md + PLAN.md，无对话历史，无口头补充 |
| **测试结果** | 12/12 PASS（Task 1: 3 个，Task 2: 9 个） |

### 5.2 实施过程

Gemini CLI 严格遵循了 PLAN.md 的 TDD 流程：

1. **先写测试代码** — 两个 test 文件从 PLAN 直接复制
2. **运行测试 → 红色** — 路由 404、模块未导入，确认失败原因正确
3. **安装缺失依赖** — 自动识别并 pip install keyring
4. **编写实现代码** — keyring_store.py + vault.py + ai_definer.py + router.py + 路由注册
5. **运行测试 → 绿色** — 12/12 全部通过

全程未向用户提问任何超出 SPEC/PLAN 的问题。

### 5.3 发现的 SPEC / PLAN 缺陷

Gemini 在实现过程中暴露了 **3 个 PLAN 测试代码与实现代码不一致的 bug**：

#### 🟡 缺陷 1：测验生成器的最小词汇量假设不一致

**位置：** PLAN Task 2 Step 1 — `test_quiz_returns_at_most_vault_size`

**问题：** PLAN 的测试用例给 vault 添加了 2 个词，断言 `len(questions) == 2`。但 PLAN 提供的 `generate_quiz()` 实现要求至少 4 个词才能生成题目（1 个正确答案 + 3 个干扰项）。2 个词时返回 0 题（不够干扰项），而不是 2 题。

**Gemini 的修正：** 改用 5 个词，断言 `len(questions) <= 5`。

**SPEC 层面原因：** SPEC §3.7 没有显式规定测验的最小词汇量。这是实现细节（PLAN 层面）的遗漏——测试代码和实现代码由同一个 AI 在同一个 PLAN 中生成，但它们之间存在隐含矛盾。

#### 🟡 缺陷 2：vocab/add 端点的 api_key 字段语义不一致

**位置：** PLAN Task 2 Step 1 — `test_add_word_without_api_key_returns_400`

**问题：** PLAN 的测试断言「没有 api_key → 400 错误」。但 PLAN 的 router 实现把 `api_key` 设计为**可选**字段（仅当提供时才调用 DeepSeek 生成 AI 释义）。实际行为是：不带 api_key 也能成功添加词（200），只是没有 AI 释义。

**Gemini 的修正：** 改为 `test_add_word_without_api_key_still_adds_word`，断言 200 + 返回词条数据但无释义。

**SPEC 层面原因：** SPEC §3.7 的 API 设计没有说清楚 `api_key` 是必传还是可选。SPEC 说「收藏时用 DeepSeek 生成释义」，但没有说「不带 api_key 时只存单词本身」——这是一个真实的语义歧义。这个 bug 如果在 Claude Code 环境下可能被我（作为熟悉上下文的人）自动补全而忽略，但 Gemini 没有上下文，直接暴露了不一致。

#### 🟡 缺陷 3：模块级单例的状态泄漏

**位置：** PLAN Task 2 Step 1 — `TestVocabAPI` fixture

**问题：** PLAN 中的 `vocab_vault` 是模块级单例（`vocab_vault = VocabVault()`），它在测试方法之间共享同一数据目录，导致测试间数据残留。

**Gemini 的修正：** 增加了 `@pytest.fixture(autouse=True)` 的隔离 fixture，为每个测试方法创建独立的临时目录。

**SPEC 层面原因：** SPEC 没有规定 VocabVault 应是单例还是工厂模式。PLAN 选择了单例，但没有考虑测试隔离。这是 PLAN 设计缺陷——单例在测试中需要显式隔离，PLAN 应该注明。

### 5.4 依据冷启动结果对 SPEC / PLAN 的修订

| 修订项 | 修订前 | 修订后 | 影响文件 |
|--------|--------|--------|---------|
| 测验最小词汇量 | 无规定 | SPEC §3.7 新增：「最少 4 词才能生成测验」 | SPEC.md |
| api_key 可选语义 | SPEC §3.7 歧义 | SPEC §3.7 明确：「api_key 为可选，不传时仅存单词原文，不生成 AI 释义」 | SPEC.md |
| VocabVault 测试隔离 | PLAN 无说明 | PLAN Task 2 新增注释：「测试需使用独立临时目录隔离单例状态」 | PLAN.md |

→ 已依次修订 SPEC.md 和 PLAN.md 中的对应段落。

### 5.5 反思：Plan 测试代码与实现代码的矛盾

这是一个有意义的发现。PLAN.md 的 Task 2 中包含 ~100 行测试代码和对应的 ~300 行实现代码——两者均由同一个 AI（Claude Code me）在 writing-plans 阶段同时生成。但在 `generate_quiz()` 的实现中，我（Claude Code）选择了「≥4 词才能出题」的安全设计，而在测试中却写了「2 词 → 2 题」的断言——这是因为在写测试时，我的思维是"N 个词就返回 N 个题"，但写实现时，我遇到了干扰项不够的边界条件，加了一个保护逻辑。

**根本原因：PLAN 的测试和实现在同一阶段产出，但 PLAN 的 self-review 没有把两者逐字段对齐。** writing-plans 的 self-review checklist 说「检查接口一致」但不说「检查测试断言与实现逻辑一致」。这是一个 Superpowers 流程的盲区——如果 PLAN 本身包含自相矛盾的代码，派发的 subagent 会在两个冲突源之间选择。

### 5.6 Gemini CLI 表现评估

| 维度 | 评价 |
|------|------|
| **TDD 遵守** | ✅ 严格——先写测试、确认红色、再写实现、确认绿色 |
| **PLAN 遵循度** | ✅ 高——直接从 PLAN 复制代码结构、修改最小化 |
| **Spec 歧义检测** | ✅ 强——发现了 3 个 Claude Code 没发现的问题 |
| **自主决策质量** | ✅ 合理——每次遇到矛盾都选择了更保守/更符合用户预期的分支 |
| **代码质量** | ✅ 与 PLAN 一致，修改仅针对 bug 修复 |
| **提问频率** | ⭐ 极低——全程未打断用户，遇到歧义自己修正并解释 |

### 5.7 冷启动总结

冷启动验证证实了 SPEC + PLAN 的核心质量——一个陌生 agent 仅凭这两份文档完成了 2 个 Task，全部测试通过，全程未因困惑而提问。它发现的 3 个问题均为**测试与实现的内部矛盾**（而非需求遗漏），反映了 writing-plans 阶段「测试代码 + 实现代码同时生成」的固有风险。

**要点：如果再做一次，我会在 writing-plans 的 self-review 中加入一条：「逐字段对照每个 Task 中的测试断言与实现逻辑，确保一致。」**
