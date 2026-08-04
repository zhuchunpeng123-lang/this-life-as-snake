# PROJECT-BRIEF.md · 项目简报

> 给 ChatGPT 总控窗口、Codex 执行窗口和新协作者使用。目标是 3 分钟理解项目，不读长历史也能安全开工。

## 游戏定位

《此生为蛇》是网页版“贪吃蛇 + Roguelike + 叙事”融合原型。核心体验是用蛇身长度、技能组合、波次压力和叙事选择，做出比传统贪吃蛇更有成长感和策略感的轻量动作游戏。

当前技术形态是纯原生 JavaScript 静态网页：无框架、无构建、无 import/export，所有模块挂在 `window`，由 `snake55/index.html` 的脚本顺序驱动。

## 当前状态

- 主工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`。
- 远程仓库：`https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`。
- 当前主线：`main`；本次资料收口基线为 `fec168a`（2026-08-04），与 `origin/main` 同步。
- 5.5 封版为内部交接基线，不是 GA 发布。
- 桌面/移动端主流程可玩；iOS Safari/standalone 在关闭系统静音开关且媒体音量正常时已完成音频对照验收，静音开关无声按平台限制处理。
- 最近已完成音频分轨与暂停/死亡/Boss 结算收口、移动端 HUD/摇杆、安全区适配、火焰可读性回退、Boss 降噪、元素状态图标对齐，以及 Codex 执行与显式视觉验收治理。
- 当前工作树另有 `docs/DEBT.md`、`snake55/02_config.js` 和 UI/HUD 未提交 WIP，不属于本次完成基线。
- 当前资料已收口为短入口；CodeBuddy 长交接只作历史证据。

## 架构概要

- L1 数据：`snake55/02_config.js`，运行时配置落点。
- L3 引擎：`03_core.js`、`04_collision.js`，提供 Bus、Registry、Formula、GS、对象池、空间哈希。
- L5 系统：粒子、蛇、敌人、技能、波次、音频、UI、技能经济。
- L6 渲染：`11_render.js`，Canvas 渲染、相机、精灵、像素吸附。
- L7 调试：`13_editor.js`、`15_profiler.js`，GM 调参和性能日志。
- 入口：`14_main.js` fixed-step 主循环。

## 当前开放问题

- `P1` B-TUNE：dev 工具已代码门控，待三种 DEBUG 组合复验。
- `P1` CONFIG 深冻结未递归生效，运行时覆盖模型需要澄清。
- `P1` `RENDER.worldScale` 双源、RT 调参单位/索引和 AOE 判定口径仍需专项收口。
- `P1` AOE 判定口径：冰池精确，火墙/护盾/蒸汽 cell 语义，需设计拍板。
- `P1/P2` 撞墙回正待实测，Boss 召唤/子弹、满级溢出、电磁 Combo 可读性、移动端窄屏适配待排期。

详见 `docs/DEBT.md`。

## 禁止事项

- 不改 `snake55/index.html` 的脚本加载顺序。
- 禁止 import/export，全部继续挂 `window`。
- 业务代码不写裸数字，数值走 `CONFIG`。
- 不经确认不动 `03_core.js` / `04_collision.js`。
- 执行权限和确认边界以 AGENTS.md 为准；已授权的低风险任务不重复确认。
- 改任意 `snake55/*.js` 后必须同步 bump `index.html` 全部 `?v=` 缓存戳。
- Git 禁止 `git add -A`、`push -f`、`push --all`。

## 下一阶段建议

1. 完成当前提交基线的浏览器/真机验收，确认视觉降噪没有损害状态可读性。
2. 完成 B-TUNE 和撞墙回正复验，关闭已验证的待办。
3. 对 CONFIG 深冻结、RT 和 AOE 口径做专项分析；涉及玩法或平衡时先由总控拍板。
4. 再决定 Boss 玩法、满级溢出、电磁 Combo 和窄屏适配的顺序。

## 给 ChatGPT 总控窗口的建议

总控窗口优先读取 `docs/CHATGPT-CONTROL.md`，再按任务需要回读状态、债务、计划、GDD 或专项设计文档；具体实现、验证和交付按任务授权与可用工具协作完成，执行权限以 `AGENTS.md` 为准。
