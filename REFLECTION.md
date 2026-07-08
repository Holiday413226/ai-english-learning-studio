# REFLECTION.md — AI English Learning Studio v2.0.0

> 按课程要求 §5 · 1500–2500 字反思报告
> **作者：** Holiday
> **日期：** 2026-07-08

---

## 一、Superpowers 技能：哪些发挥了最大作用，哪些「形式大于实质」

### 发挥最大作用的技能

**1. `brainstorming` — 「一问一答」的结构化设计**

这是整个项目中价值最高的技能。它的核心约束——一次只问一个问题、每次给 2-3 个选项、每个设计节点签字确认——让我从一个模糊的「拓展原项目」变成了一份 27KB 的完整 SPEC。

如果没有这个技能，我大概率会跳过设计阶段直接写代码，然后在中途不断回头修改——这正是我之前做 v1.2.0 时的教训。Minecraft 伴侣面板这个设计就是一个例证：如果我不被 brainstorming 强制追问「用户在游戏里已经能对话了，还需要 Web 聊天吗？」，我可能就直接造了一个没人用的 Web 聊天功能。

**2. `test-driven-development` — 不是阻碍，是放大器**

TDD 在 AI 协作场景下的效果让我惊讶。我的预期是「AI 写测试会浪费时间」，但实际效果恰恰相反：**测试让 AI 的产出更可靠，减少了人工 review 的时间。**

一个具体的例子：Task 7（Dashboard stats）的测试暴露了字符计数差异（测试断言 54 字符，实际 57）。如果这个差异不是在 tests 里发现的，而是用户用眼睛发现的，debug 成本会高得多。6 个 subagent 并行写代码、各自跑测试、最后合并——没有一个测试在合并后回归。这是 TDD 在多人（多 agent）开发场景中的经典价值，而 Superpowers 让它被严格执行了。

**3. `using-git-worktrees` — 让并行开发真正可行**

5 个 worktree 同时存在、5 个 subagent 同时在各自的隔离区修改文件——这个工作流本身就有工程价值。合并时只有 `app.py` 有一处冲突（Task 7 的 Dashboard endpoint 和 Task 3 的 Diary 路由注册在了同一个文件），其他所有文件都是零冲突合并。如果没有 worktree 隔离，5 个 agent 互相覆盖代码的风险是真实的。

**4. `writing-plans` — 接口契约在多 agent 场景中的价值**

每个 Task 的「Interfaces: Consumes / Produces」字段是 PLAN 中最被低估的设计元素。它让每个 subagent 在不知道其他 agent 存在的情况下，仍然能正确对接。Task 3（Diary）的 `POST /api/diary/submit` 返回 `{corrections, score, highlighted_expressions}`——Task 10（DiaryPage）就是按这个接口写的，即使它们在不同的 worktree、被不同的 agent 开发。

### 「形式大于实质」的技能

**1. `writing-skills`**

这个技能在这个项目中没有被用到。它是给插件开发者用的，对于期末项目来说，它出现在技能列表里更像是「功能完整性」的考虑，而非实际需求。

**2. `receiving-code-review`**

在两阶段评审中，我发现自己更依赖人工 review 而非这个技能。原因是 Review 技能在评审 AI 代码时，倾向于找「风格问题」而非「逻辑问题」——而风格问题在这个项目中并不重要（NES.css 是固定的），重要的是「这个 API 的行为是否符合 SPEC」。我最终改为手动对照 PLAN + SPEC checklist 来 review。

---

## 二、Subagent-Driven 工作流

### 智能体能自主运行多久而不偏离主题？

在我派发的 6 个 subagent 中，5 个在 ~6-8 分钟内独立完成了 Task，中间没有任何人工介入。唯一需要人工接手的是 Task 7（被前一个 agent 卡住后，我重新派发了第二个 agent）。

**我认为 Subagent 不会「偏离主题」的关键因素是 PLAN 的颗粒度。** 如果一个 Task 的粒度是"写一个文件 + 写好测试 + 跑通 + commit"，那么 agent 的工作范围是清晰闭合的。但如果任务描述是"实现 Diary 模块"（没有确切文件路径、没有接口契约），agent 一定会发散。

### 什么样的 Task 颗粒度最优？

经过这个项目，我的结论是：**最优颗粒度 = 一个可独立测试的 API 端点组（< 5 个端点）+ 对应的测试文件。**

- 太细（每个函数一个 task）→ PLAN 膨胀，agent 间的接口契约成本超过实施成本
- 太粗（整个子系统一个 task）→ agent 会在某个细节上卡住或偏离方向无人纠正
- 当前粒度（Task 2 = Vocab Vault 的 8 个端点 + vault.py + ai_definer.py + router.py）→ 保持了功能内聚性，同时测试可以在 task 结束时做完整的回归

---

## 三、SPEC / PLAN 质量如何影响实现质量

### 「规约不清导致 subagent 偏离」的具体案例

最典型的案例是冷启动验证中发现的 PLAN 缺陷 #2：**vocab/add 端点的 `api_key` 字段语义不一致。**

PLAN 的测试断言「不带 api_key → 400 错误」，但 PLAN 的 router 实现把 api_key 设计为可选字段。Gemini CLI 在运行测试时，发现它正面临一个选择：按测试来改实现，还是按实现来改测试？

它选择了更合理的一边（改测试——api_key 本来就该是可选字段，用户可能只想存单词不用 AI 释义）。但这个问题暴露了 SPEC 的一个盲区：**SPEC 没有明确说 «api_key 是必传还是可选»**——这个决定是在 PLAN 阶段做出的，但只在实现代码中体现，没有回写 SPEC。

这是一个典型的「规约→计划→实现」信息衰减链：我在写 SPEC 时假定了 api_key 是可选的（因为「用户不带 API Key 也能收藏单词」，例如从 Minecraft 面板收藏），但在写 PLAN 的测试代码时，我忘了这个假设，写了一个「不带 api_key → 400」的测试。

**教训：SPEC 不应在 PLAN 写完后被视为「只读文件」。PLAN 中的任何设计细化都应在 SPEC 中回写同步。**

---

## 四、最有效的 Prompt / Context 策略

### 策略 1：在 Subagent Prompt 中硬编码工作目录路径

每个 subagent prompt 都以「Your worktree is at: `C:/Users/Holiday/Desktop/agent-task3-diary`」开头。这避免了 agent 对「哪个目录是我的工作区」的歧义——agent 不会不小心改主目录的文件。

### 策略 2：PLAN 中的完整代码示例（而非描述）

writing-plans 的「No Placeholders」规则——禁止 TBD、TODO、「implement later」、只描述不展示代码的步骤——是 PLAN 能被 subagent 直接执行的前提。Task 2 的 PLAN 包含 ~250 行 `vault.py` 代码、~100 行测试代码——agent 不需要「设计」代码，只需要「实现」它。这消除了 agent 最大的一类错误来源：设计偏差。

### 策略 3：测试先行作为 Context 锚点

每个 subagent prompt 以「Write the failing test first」开头。这让 agent 在写任何实现代码之前，必须先理解「什么是正确的行为」。测试代码成为了实现代码的 spec-in-code，比任何自然语言描述都精确。

---

## 五、凭据与分发的工程启示

### 迫使我想清楚了什么？

**1. 凭据「在哪里」并不简单。**

Minebot 的 `keys.json` 是在项目迁移时被发现的——它一直在原项目目录里，但我从未意识到它的存在。如果不是课程的凭据安全要求，我可能把这个文件连同上一个 commit 一起推到了 GitHub。

**2. 分发不只是「打个包」。**

PyInstaller 打包看起来是一条命令的事，但实际涉及：
- 前端构建产物的路径映射（`backend/static/` → EXE 内部 `sys._MEIPASS`）
- EXE 模式下 Flask 的线程管理（daemon 线程 + watchdog 自动退出）
- 浏览器自动打开的时机（threading.Timer 1s 延迟确保 Flask 先启动）
- SmartScreen 警告的处理（README 需说明如何放行）

这些细节在 v1.2.0 中已经有了基础，但 v2.0 新增了 keyring 依赖——这又是一个在 PyInstaller 打包时需要特殊处理的点（keyring 的 DLL 依赖）。

**3. localStorage 作为唯一存储是不够的。**

v1.2.0 中 API Key 存 localStorage——这在功能上能工作，但从安全角度看，localStorage 是明文、可被浏览器开发者工具查看、不同浏览器不共享。Windows Credential Manager 的引入不只是「更安全」，而是在数据持久性和跨进程访问上提供了更好的保障。

---

## 六、如果重做我会改变什么

1. **在 brainstorming 阶段就引入数据流图。** 当前 SPEC 中有组件图但缺少显式的数据流图（哪个模块产生什么数据、哪个模块消费什么数据）。这导致 Vocab Vault 的跨模块集成在实现阶段才完全想清楚。

2. **PLAN 中的测试与实现相互验证。** writing-plans 的 self-review 没有检查「测试断言 vs 实现逻辑」的一致性。如果我写 PLAN 时做了一次逐字段对照，冷启动验证中的 3 个 bug 可以减少到 0 个。

3. **Dashboard stats endpoint 放在独立 router 中。** 直接放在 `app.py` 中导致了合并冲突。任何新增路由都应遵循现有的「独立 router + register 函数」模式——即使这个「router」只有 1 个端点。

4. **更早做一次端到端的「可运行性测试」。** 目前只做了后端 pytest（51 个通过），但前端和后端还没有一起跑起来过——`npm run build` + Flask serve 的「双击 EXE」体验还没有验证。这是下一阶段的优先级最高事项。

---

## 七、对 Superpowers 方法论的批判

### Superpowers 假设了什么？

它假设**「清晰的需求 → 严格的流程 → 可靠的产出」**是线性递进的。这在 80% 的情况下成立，但在 20% 的情况下不成立——当需求本身是在实现中才被发现的（"implementation-informed requirements"）。

Minecraft 伴侣面板就是这样的案例：我之前不知道「PCL 内聊天 + Web 回顾面板」是更好的体验，直到我被 brainstorming 追问「用户在游戏里已经能对话了，还需要 Web 聊天吗？」。这个发现发生在 brainstorming 阶段——但如果它发生在实现阶段呢？

Superpowers 把「需求澄清」严格限定在 brainstorming 阶段，后续的 writing-plans → TDD → review 都不允许偏离 SPEC。这保护了工程纪律，但也关上了「实现中的新发现反馈到设计」的窗口。我个人认为需要在 PLAN 中增加一个「design revisit」的检查点——在 Phase 2 完成后检视：是否有实现中发现的新知识需要修订 SPEC？

### 假设在我的项目里成立吗？

大部分成立。我的项目是一个「拓展已有项目」的类型，需求相对清晰（4 个核心模块 + 1 个串联模块 + 1 个首页），所以 Superpowers 的线性流程是适配的。

但对于更「探索性」的项目——比如从零发明一个新产品、或者做一个研究型的 feature——Superpowers 的线性假设可能会过强。在这种情况下，我会**在 brainstorming 之后保留一个「prototyping」阶段**（不被 TDD 约束，纯粹验证想法的可行性），然后再进入正式的 SPEC → PLAN → TDD 流程。

---

**总结：Superpowers 给了我一套可靠的「不犯错」的流程，但判断「什么是对的」仍然是我的责任。这就是课程说的——「当 AI 能完成大部分编码工作时，一个工程师的真正价值在哪里。」**
