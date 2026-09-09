# AI English Learning Studio · AI 英语学习工作室

一款面向中国大学生（CET-4/6 备考）的桌面英语学习应用，把**翻译阅读 → 日记写作 → 辩论口语 → Minecraft 沉浸 → 词汇宝库**整合到一个原生 Windows 窗口里，学习数据互通。

## 功能模块

| 模块 | 说明 |
|------|------|
| 🏠 Dashboard | 今日学习统计 + 连续打卡 streak |
| 📖 Novel Translator | 上传 TXT → AI 翻译 → 四六级词汇高亮 + ⭐ 收藏 |
| ✍️ English Diary | AI 每日话题 + 逐句批改 + 评分 |
| ⚔️ Debater | AI 英语辩论/讨论 + 语音输入 |
| ⛏ Minecraft Companion | Minecraft 游戏内与 AI 对话 |
| 📚 Vocab Vault | 四模块词汇汇聚 + SM-2 闪卡复习 + 测验 + CSV 导出 |

## 快速开始

1. 从 [Releases](../../releases) 下载最新版 `AIEnglishStudio-vX.X.X.zip`。
2. 解压后双击 `AIEnglishStudio.exe`。
   - 首次运行若弹出 Windows SmartScreen 警告，点「更多信息 → 仍要运行」。
3. 首次启动在「设置」里选择**「激活码」**模式，填写服务器地址 + 激活码（由发行方提供），点「验证激活码」。
4. 开始使用。

> **无需自备任何 API Key**：本应用采用「托管」模式，AI 密钥由服务端统一管理，你只需一个激活码即可使用全部功能。

> Minecraft「我的世界 AI 伙伴」模块需要解压后的 `runtime/` 文件夹与 EXE 放在同一目录（ZIP 里已包含）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite 5 + NES.css + Zustand |
| 桌面壳 | pywebview（Edge WebView2）+ PyInstaller |
| 后端 | Python Flask |
| AI 引擎 | DeepSeek + COZE |
| Minecraft Bot | Mineflayer（Node.js） |
| 测试 | pytest |

## 从源码运行

```bash
make install-dev   # 安装依赖
make dev           # 启动开发服务器（Flask :5000 + Vite :5173）
make test          # 运行测试
```

## 项目结构

```
agent/
├── backend/          # Flask 后端（core + systems 各模块）
├── frontend/         # React 前端（6 个页面）
├── gateway/          # 托管网关服务（激活码鉴权 + AI 分发）
├── Minebot/mindcraft # Minecraft Bot（独立 Node.js 组件）
├── tests/            # pytest 测试
├── scripts/          # 打包/构建脚本
└── Makefile
```

## License

MIT
