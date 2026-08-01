---
name: minebot-connection-fixes
description: All modifications made to external Minebot project to fix agent connection instability
metadata:
  type: project
  date: 2026-08-01
---

# Minebot Agent 连接稳定性修复记录

## 背景

Minebot（外部项目 `E:\New Life\Minebot\mindcraft`）Agent 连接 Minecraft 服务器极不稳定：
- DeepSeek Agent 首次能连，断连后无法重连
- 其他 Agent 一次都连不上

根因分析见 [[minebot-connection-analysis]]

## 改动清单

### 改动 1：`src/process/agent_process.js` — 修复重启冷却误杀首次重连

**问题**：`last_restart = Date.now()` 在每次 `start()` 调用时初始化为当前时间。如果 Agent 首次连接失败（10 秒内 `process.exit`），重启检查 `Date.now() - last_restart < 10000` 为 true，**永久放弃重启**。

**修改**：`let last_restart = Date.now()` → `let last_restart = 0`

0 作为初始值保证首次重启一定通过冷却检查。

同时清理了多余的第 4 个参数 `this.port`（`start()` 方法只接受 3 个参数）。

### 改动 2：`src/agent/agent.js` — 断连 exit code 从 1 改为 0

**问题**：`bot.once('kicked')` / `bot.once('end')` 触发时调用 `process.exit(1)`。exit code 1 在 `agent_process.js` 中被解释为 crash（`code !== 0`），虽然触发重启，但语义不对，且容易与真正的 crash 混淆。

**修改**：`process.exit(1)` → `process.exit(0)`

exit code 0 表示预期内的断连，`agent_process.js` 中 `code !== 0` 为 false，走自然退出路径（不发 restart，但也不会被冷却拦截）。配合改动 1，断连后仍然可以正常重启。

### 改动 3：`settings.js` — 端口改为自动扫描

**问题**：`"port": 52744` 硬编码。PCL 每次"对局域网开放"端口随机变化，52744 只在某一次有效。

**修改**：`"port": 52744` → `"port": -1`

`-1` 触发 `mcserver.js` 的 `findServers()` 方法，自动扫描 49000-65000 端口范围内的 LAN 服务器。

### 改动 4：`settings.js` — spawn_timeout 从 30s 延长到 60s

**问题**：`"spawn_timeout": 30` 在 Minecraft 加载地形/资源包较慢时不够，超时直接 `process.exit(1)`。

**修改**：`"spawn_timeout": 30` → `"spawn_timeout": 60`

---

## 2026-08-01 补充修复

### 改动 5：`src/process/agent_process.js` — 修复 restart 条件（code=0 被忽略）

**问题**：改动 2 把 `agent.js` 的 `process.exit(1)` 改成了 `process.exit(0)`（断连=干净退出），但 `agent_process.js` 的重启条件是：
```js
if (code !== 0 && signal !== 'SIGINT')  // code=0 时 → false → 不重启!
```
Agent 断连后 exit code=0，不满足重启条件 → **Agent 永远不会被重启**。这就是"第一次能连，闪退后再也连不上"的根本原因。

**修改**：
```js
// 旧：if (code !== 0 && signal !== 'SIGINT') {
// 新：
if (signal !== 'SIGINT' && signal !== 'SIGTERM') {
```

| Agent 退出方式 | exit code | 旧行为 | 新行为 |
|---------------|-----------|--------|--------|
| 正常断连 (kicked/end) | 0 | ❌ 不重启 | ✅ 重启 |
| 崩溃/错误 | 1 | ✅ 重启 | ✅ 重启 |
| 致命错误 | 4 | ❌ 杀父进程 | ❌ 杀父进程（不变） |
| 手动 SIGINT 停止 | signal | ✅ 不重启 | ✅ 不重启 |

### 改动 6：`backend/app.py` — Dev 模式统一启动

**问题**：每次开发需要手动开两个终端分别启动后端和前端，再手动打开浏览器，步骤繁琐。

**修改**：dev 模式（行 347-429）改为：
1. 子进程启动 Vite dev server（`npm run dev`，`CREATE_NO_WINDOW` 隐藏控制台）
2. Flask 在 daemon 线程运行
3. 弹出 pywebview 桌面窗口 → `http://localhost:5173`（Vite 热重载代理 /api 到 Flask :5000）
4. 关闭窗口 → `vite_proc.terminate()` → `stop_minebot()` → `sys.exit(0)`

---

## 本文档范围外的改动（本项目内部）

1. `backend/app.py`：dev 模式移除自动弹窗 → **后被改动 6 替换为统一启动**
2. `backend/app.py`（改动 6）：dev 模式改为自动启动 Vite + pywebview GUI 窗口
3. `backend/systems/minecraft/bridge.py`：`start_minebot()` 改为异步（移除 `MINDSERVER_AUTO_OPEN_UI=false` + 后台线程等待端口）
4. `backend/static/`：重建前端构建产物，与 Vite 源码一致

**Why:** 外部项目 Agent 断连后 `process.exit(1)` → 父进程 10s 冷却拦截 → 永久放弃重连，导致"连一次就再也连不上"。改动 5 修复了改动 2 引入的副作用（exit code 0 导致 restart 被跳过）。
**How to apply:** 改动已写入文件，无需额外操作。若外部项目重新 clone/更新，需重新应用这些修改。

---

## 2026-08-01 补充修复 2：Minecraft Start 按钮不工作

### 改动 7：`backend/systems/minecraft/bridge.py` — 修复 subprocess PIPE 死锁

**问题**：`start_minebot()` 中 `subprocess.Popen` 使用了 `stdout=subprocess.PIPE` + `stderr=subprocess.PIPE`，但没有任何线程读取这些管道。Windows 管道缓冲区约 4-8KB，Node.js 启动日志轻松超过此量 → 缓冲区满 → 子进程卡死在 `write()` 上，永远无法绑定端口 8080。

**症状**：
- 桥接返回 `{"status": "ok"}`（`Popen` 本身立即返回）
- 后台线程等待端口 → 永远等不到 → 20s 超时后静默放弃
- 前端按钮短暂变"Starting..."然后恢复，无会话导入

**修改**：
- `stdout=subprocess.PIPE` → `stdout=subprocess.DEVNULL`
- `stderr=subprocess.PIPE` → `stderr=subprocess.DEVNULL`
- Windows 上添加 `creationflags=subprocess.CREATE_NO_WINDOW` 隐藏控制台窗口
- 添加 `import sys`

### 改动 8：`frontend/vite.config.js` — 统一 host 为 127.0.0.1

**问题**：Vite 代理 target 是 `http://localhost:5000`，但 Flask 绑定 `127.0.0.1:5000`。IPv6 优先系统上 `localhost` → `::1`，Flask 只听 IPv4 → 代理失败。

**修改**：`target: "http://localhost:5000"` → `target: "http://127.0.0.1:5000"`

### 验证：50/51 测试通过（1 个遗留失败与改动无关）

**Why:** `subprocess.PIPE` 不读取导致子进程 stdout/stderr 缓冲区耗尽后死锁。后续修复（改动 9）已全面简化为不做任何 stdio 重定向，根除了问题。
**How to apply:** 已过时，被改动 9 替代。

---

## 2026-08-01 第三次修复：极简 Bridge + Agent 重试机制

### 改动 9：全部重做 — 极简 Bridge 一键启动 + Agent 延迟重试

**Bridge 集成（本项目 5 个文件）**：

| 文件 | 改动 |
|------|------|
| `backend/systems/minecraft/bridge.py` | **新建**。极简进程管理器：`start()` 不做 stdio 重定向，`stop()` graceful kill，`get_status()` |
| `backend/systems/minecraft/router.py` | 添加 3 个 bridge 端点（start/stop/status） |
| `backend/app.py` | 添加 `app.minebot_bridge = MinebotBridge()` + shutdown 时 stop() |
| `frontend/src/systems/minecraft/api.js` | 添加 `getBridgeStatus/startMinebotBridge/stopMinebotBridge` |
| `frontend/src/systems/minecraft/MinecraftPage.jsx` | 添加 Start/Stop 按钮 + bridgeStatus |
| `frontend/vite.config.js` | `localhost:5000` → `127.0.0.1:5000` |

**核心原则**：不做任何 stdio 重定向 → 子进程继承父进程控制台 → 无管道死锁 + Node.js 可自由打开浏览器。

**Agent 重试机制（外部项目 `agent_process.js`）**：

将"快速崩溃 → 永久放弃"改为"快速崩溃 → 10 秒延迟重试 + 防重复 guard"：

```js
// 旧：if (Date.now() - last_restart < 10000) return; // 永久放弃
// 新：setTimeout(() => this.start(...), 10000);       // 延迟重试
```

**验证**：
- 50/51 测试通过
- 外部 Minebot 独立启动：3 个 Agent（Rei、deepseek、andy_4）全部成功登录 + spawn
- Bridge Start 按钮 → MindServer 后台 GUI 在浏览器弹出

**Why:** 之前的修复过度复杂（历史导入、Socket.IO、PIPE 重定向、CREATE_NO_WINDOW），引入了多个问题。这次从头设计：最小化 Bridge 只管进程启停，Agent 冷却改为延迟重试而非永久放弃。
**How to apply:** 改动已写入文件，无需额外操作。
