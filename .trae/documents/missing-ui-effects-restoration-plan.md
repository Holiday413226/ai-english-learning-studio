# Missing UI Effects Restoration Plan

## Summary

将 `ui-preview.html` 中已完成但未迁移到 Agent 项目的 4 个视觉效果补齐到实际代码中，同时确保不损害任何后端功能逻辑。

---

## Current State Analysis

通过对比 [ui-preview.html](file:///e:/项目合并/agent/frontend/public/ui-preview.html) 与当前 React 项目代码，发现以下 4 个特性完全缺失：

| # | 特性 | CSS 状态 | JS/JSX 状态 |
|---|------|----------|-------------|
| 1 | Navi 线框地球图标（设置面板内） | 缺失 | 缺失 |
| 2 | 3D 双生花笼环绕效果（设置面板外围） | 缺失 | 缺失 |
| 3 | 绿色方块入侵按钮效果 | 已有 | 缺失（JS 动态创建方块逻辑） |
| 4 | 标题红白故障闪烁（退出设置面板时） | 缺失 | 缺失 |

---

## Proposed Changes

### 1. Navi 线框地球图标（设置面板内右上角）

**文件**: [App.css](file:///e:/项目合并/agent/frontend/src/App.css) + [SetupModal.jsx](file:///e:/项目合并/agent/frontend/src/components/SetupModal.jsx)

**What**: 在设置面板内部右上角添加一个伪 3D 线框地球，由 12 条经纬线环（6 条 Y 轴 + 6 条 X 轴）+ 2 条对角线环 + 5 个闪烁像素点组成，持续自转。

**How**:
- **CSS** — 在 App.css 末尾添加：
  - `.globe-container` — 绝对定位容器（`pointer-events: none; z-index: 0`），位于面板右上角
  - `.globe-container::before` — 脉冲光晕背景
  - `.globe` — 3D 透视容器，`transform-style: preserve-3d`，`animation: rotateGlobe 20s ease-in-out infinite`
  - `.globe .ring` / `.ring-y` / `.ring-x` / `.ring-d` — 各角度的线框环
  - `.globe .pixel-dot` — 闪烁像素点
  - `@keyframes rotateGlobe` — 20s 循环 360° 三轴旋转
  - `@keyframes globeGlow` — 光晕脉冲
  - `@keyframes pixelBlink` — 像素点闪烁
- **JSX** — 在 `SetupModal.jsx` 的 `.debater-modal-setup` 内部最顶部添加 globe 容器 DOM 结构（14 个环 + 5 个像素点）

**Why safe**: 所有 globe 元素设置 `pointer-events: none`，不影响表单交互。

---

### 2. 3D 双生花笼环绕效果（设置面板外围）

**文件**: [App.css](file:///e:/项目合并/agent/frontend/src/App.css) + [SetupModal.jsx](file:///e:/项目合并/agent/frontend/src/components/SetupModal.jsx)

**What**: 设置面板外围包裹一个由 12 条 3D 圆环组成的"双生花笼"结构（6 条 Y 轴 + 6 条 X 轴），持续缓慢旋转（18°/s），鼠标悬停时快速旋转回正（~0.55s 内完成当前 360° 周期），移开后无缝恢复旋转。

**How**:
- **CSS** — 在 App.css 末尾添加：
  - `.modal-cage` — 包裹容器，`transform-style: preserve-3d`，`width: 90%; max-width: 520px`
  - `.cage-ring` — 绝对定位的 560×560 圆形边框环，`pointer-events: none`
  - `.cage-ring.flower-a:nth-of-type(1-6)` — Y 轴 6 条环（每 30°）
  - `.cage-ring.flower-b:nth-of-type(7-12)` — X 轴 6 条环（每 30°）
- **JSX** — 在 `SetupModal.jsx` 中，将 `.debater-modal-setup` 包裹在 `.modal-cage` 内，并在 cage 内添加 12 个 `.cage-ring` 元素
- **JS** — 在 `SetupModal.jsx` 中添加 `useEffect` + `useRef`：
  - 使用 `requestAnimationFrame` 驱动 cage 的 `rotateY` + `rotateX`（±4° 正弦倾斜）
  - 空闲速度：18°/s（360° 需 20s）
  - 鼠标悬停：计算到下一个 360° 倍数的剩余角度，以减速方式在 ~0.55s 内到达
  - 鼠标离开：恢复空闲旋转，从当前位置无缝衔接

**Why safe**: 所有 cage-ring 设置 `pointer-events: none`，不影响表单交互。`useEffect` 在组件卸载时自动清理 `requestAnimationFrame`。

---

### 3. 绿色方块入侵按钮效果

**文件**: [App.jsx](file:///e:/项目合并/agent/frontend/src/App.jsx)（CSS 已在 App.css 中）

**What**: 当用户鼠标悬停在 `.btn-primary` / `.nes-btn.is-primary` 按钮上时，绿色不规则方块从左侧涌入，模拟"紫色被绿色瓦解"的视觉效果，方块完全覆盖按钮后消除缝隙。

**How**:
- **CSS** — 已存在于 App.css 第 443-454 行（`.btn-primary .block-invader`），无需修改
- **JS** — 在 `App.jsx` 中添加一个 `useEffect`：
  1. 查找所有 `.btn-primary` 和 `.nes-btn.is-primary` 按钮
  2. 为每个按钮：
     - 将文本子节点包裹在 `<span style="position:relative;z-index:1">` 中
     - 生成 10-14 个高度不规则的方块（3%-55% 随机高度，归一化到 100%）
     - 每个方块设置随机 `transitionDuration`（0.08-0.35s）和 `transitionDelay`（0-0.15s）
     - 绑定 `mouseenter` → 设置 `width: 100%`；`mouseleave` → 设置 `width: 0`
  3. 使用 `MutationObserver` 监听 DOM 变化，自动为新出现的按钮应用方块效果

**Why safe**: 方块元素 `pointer-events: none; z-index: 0`，文本包裹在 `z-index: 1` 的 span 中，不影响点击、表单提交等任何功能。`MutationObserver` 确保动态渲染的按钮（如路由切换后的页面）也能获得效果。

---

### 4. 标题红白故障闪烁（退出设置面板时）

**文件**: [App.css](file:///e:/项目合并/agent/frontend/src/App.css) + [App.jsx](file:///e:/项目合并/agent/frontend/src/App.jsx) + [DashboardPage.jsx](file:///e:/项目合并/agent/frontend/src/systems/dashboard/DashboardPage.jsx) + [SetupModal.jsx](file:///e:/项目合并/agent/frontend/src/components/SetupModal.jsx)

**What**: 用户点击设置面板的 Cancel 或 Save 按钮退出时，Dashboard 页面的 "AI English Studio" 大标题触发一次大规模红白故障色闪动（0.7s，steps(4)），红色通道向左偏移，白色通道向右偏移。

**How**:
- **CSS** — 在 App.css 末尾添加：
  - `.logo-glitch` — 相对定位容器
  - `.logo-glitch::before` — 红色鬼影通道（`color: #ff2020`，初始 `opacity: 0`）
  - `.logo-glitch::after` — 白色鬼影通道（`color: #ffffff`，初始 `opacity: 0`）
  - `.logo-glitch.glitch-trigger::before` — 触发 `glitchRedBurst` 动画
  - `.logo-glitch.glitch-trigger::after` — 触发 `glitchWhiteBurst` 动画
  - `@keyframes glitchRedBurst` — 红色通道闪烁序列（0.7s，steps(4)）
  - `@keyframes glitchWhiteBurst` — 白色通道闪烁序列（0.7s，steps(4)）
- **JSX** — 在 `DashboardPage.jsx` 中，将标题 `<h1>AI English Studio</h1>` 改为 `<h1><span className="logo-glitch" id="main-title-glitch">AI English Studio</span></h1>`
- **JS** — 在 `App.jsx` 中：
  1. 添加 `triggerGlitchBurst()` 工具函数（通过 classList remove → reflow → add 触发 CSS 动画重播）
  2. 通过 `SettingsContext` 暴露 `triggerGlitch` 给 SetupModal
  3. SetupModal 在 `handleSave` 和 `onClose`（Cancel）时调用 `triggerGlitch()`

**Why safe**: 故障闪烁仅修改 CSS class，不影响任何数据流或 API 调用。动画在 0.7s 后自动结束（`forwards` 填充模式停留在 `opacity: 0`）。

---

## Implementation Order

按依赖关系和风险从低到高排列：

1. **Feature 1 + 2**（地球图标 + 笼环绕）— 纯 CSS + 静态 JSX + 独立 JS，不涉及跨组件通信
2. **Feature 4**（标题故障闪烁）— 涉及 App.jsx → SetupModal.jsx → DashboardPage.jsx 的跨组件通信，需要修改 SettingsContext
3. **Feature 3**（方块入侵按钮）— 需要 MutationObserver 全局监听，放在最后以确保不干扰前几个特性的按钮

---

## Assumptions & Decisions

- 所有装饰性元素（globe、cage-ring、block-invader）均设置 `pointer-events: none`，确保不干扰用户交互
- `requestAnimationFrame` 在组件卸载时通过 `useEffect` 的 cleanup 函数自动取消
- 方块入侵效果的 `MutationObserver` 在 `App.jsx` 的 `useEffect` cleanup 中 `disconnect()`
- 不修改任何后端 API 调用、状态管理逻辑（Zustand configStore）、路由逻辑
- 地球图标和笼环绕的动画使用 CSS 和 requestAnimationFrame，不依赖任何第三方库

---

## Verification

1. 打开设置面板 → 确认右上角出现自转的线框地球图标，面板外围有 12 条环组成的笼状结构持续旋转
2. 鼠标悬停在设置面板上 → 笼结构快速旋转回正（~0.5s），松开后恢复缓慢旋转
3. 鼠标悬停在任何 `.btn-primary` 按钮上 → 绿色不规则方块从左侧涌入覆盖按钮，松开后撤回
4. 在设置面板中点击 Cancel 或 Save → 面板关闭后，Dashboard 标题 "AI English Studio" 触发红白故障闪烁
5. 确认所有按钮功能正常（点击、表单提交、API 调用不受影响）