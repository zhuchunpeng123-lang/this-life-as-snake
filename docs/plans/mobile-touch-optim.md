# 计划 · 手机端触控 + 小屏适配优化

> 状态：草案（待用户确认后落地）｜依赖封版 `13c915b` 的 `PerfTier` 自适应分级（手机性能地基已就位）
> 模板：AGENTS.md §四 计划五要素 + §八 先确认硬墙

## ① 目标一句话
让游戏在手机浏览器（竖/横屏）可**正确显示**且**可触控操作**，桌面端零回归；性能已由封版 `PerfTier` 分级保障，本轮只补「显示适配 + 触控输入 + HUD 窄屏」。

## ② 涉及文件及理由
- `snake55/index.html`：`viewport` 与 `touch-action` 已就位（基本 OK）；补 `viewport-fit=cover` + 刘海安全区 + 可选竖屏提示层。
- `snake55/11_render.js`：`resize()` 补 `canvas.style.width/height` 为 **contain 适配后的 CSS 尺寸**（修手机溢出/裁切），并监听 `orientationchange` 重算；backing 仍封顶 `maxBackW`。
- `snake55/14_main.js`：触控输入打磨——菜单态 `pointerdown` 开始；游戏态拖动**绝对瞄准**（`pointermove` 已兼容 Pointer Events）；加 `preventDefault` 阻浏览器手势；处理「开始那一下不误触转向」。
- `snake55/12_ui.js`：HUD / 升级三选一 / 结果面板窄屏样式——字号 `clamp()`/`vw` 化、升级卡固定宽 `220px` → `min(220px,78vw)`、暂停按钮加大易点、`env(safe-area-inset-*)` 安全区。
- `snake55/02_config.js`：新增 `INPUT` 区触控参数（deadZone / 摇杆开关，非 §9 平衡值），供 `~` 调参热改。
- `snake55/13_editor.js`：GM 调参面板窄屏滚动/缩放（低优先，标注待调）。

## ③ 具体改动点（草案，待确认）
1. **resize contain 适配**：`canvas.style.width/height` = `contain(logicalW, logicalH, 可用视口)` 比例缩放后的 CSS 尺寸；backing = CSS尺寸 × dpr（封顶 `maxBackW`）。`pointermove` 反算已用 `getBoundingClientRect().width`，无需改公式，瞄准自动对齐。
2. **触控**：游戏内 `pointerdown` 因 `GS.status!=='menu'` 已不触发 `startIfMenu`；`pointermove` 拖动瞄准保持；`touch-action:none` 已有；补 `e.preventDefault()` 阻页面滚动/双击缩放；松手（`pointerup`/`pointercancel`）保持当前方向不丢输入。
3. **UI 窄屏**：HUD 字号 `clamp(12px, 3.4vw, 15px)`；升级卡 `width:min(220px,78vw)`（flex-wrap 已 wrap）；暂停按钮 padding 加大、`right/top` 用安全区；结果面板已用 `min(560px,86vw)` 保留。
4. **竖屏策略**（待用户选，见下「待定项」）：A 竖屏直接 contain 玩 / B 竖屏加「请横屏」提示层 / C 竖屏重排 UI。
5. **config**：加 `INPUT.touch = { deadZone, useJoystick }`（手感非强度值，不进 §9），`~` 调参可切。

## ④ 不动的底层
- 不动 `03_core.js` / `04_collision.js`（碰撞/对象池/公式）。
- 不动伤害管线 `Core.Formula` / `applyDamage` / 各技能 `hurt()`。
- 不动 §9 数值真理源（本轮纯输入/UI/渲染表现，无平衡数值；新增 `INPUT` 为触控手感非强度值）。
- 不动封版 `PerfTier` 分级逻辑（仅可能读取其档位做 UI 简化，不改动）。

## ⑤ 验收标准
- **正常**：桌面 Chrome 打开，显示/操作与封版前零差异（`viewport`/`touch-action` 已存在且不变）。
- **边界①**：iPhone SE 375×667 竖屏打开 → canvas 完整 contain 显示不溢出、瞄准点对齐；触控拖动蛇平滑转向；开始/暂停可点。
- **边界②**：`PerfTier` 手机按设备初判自动 LOW/POTATO/MED 起步；**实战掉帧不自动切档**（自动降级仅"稳定关火/余烬"二进制开关，overdraw 看门狗阈值 320k 远高于实战 ~3~35k 近乎休眠，绝不切档/不降分辨率；`stepDown/stepUp` 为死函数、`tierDownFps` 等为死配置）。本轮不动 PerfTier 分级逻辑，仅可能读取档位做 UI 简化。详见 CHANGELOG 2026-07-22 eval(perf)。
- **边界③**：升级三选一面板窄屏不溢出/不重叠；HUD 不被刘海遮挡（安全区）。
- **反向**：`03_core.js`/`04_collision.js`/§9/伤害管线未被触碰；`git diff --stat` 仅含 UI/input/render/config/editor 文件；桌面性能与显示无回归。

## 待定项（需用户拍板）
- **输入方案**：A 保持绝对瞄准（改动最小）/ B 加虚拟摇杆（左下半屏相对方向，更顺手）/ C 两者都做（默认绝对，GM 可切摇杆）。
- **竖屏策略**：A 竖屏直接 contain 玩 / B 竖屏加「请横屏」提示层 / C 竖屏重排 UI（工作量大）。
