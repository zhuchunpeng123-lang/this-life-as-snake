# PROJECT-BRIEF.md · 项目简报

> 给 ChatGPT 总控窗口、Codex 执行窗口和新协作者使用。目标是 3 分钟理解项目，不读长历史也能安全开工。

## 游戏定位

《此生为蛇》是网页版“贪吃蛇 + Roguelike + 叙事”融合原型。核心体验是用蛇身长度、技能组合、波次压力和叙事选择，做出比传统贪吃蛇更有成长感和策略感的轻量动作游戏。

当前技术形态是纯原生 JavaScript 静态网页：无框架、无构建、无 import/export，所有模块挂在 `window`，由 `snake55/index.html` 的脚本顺序驱动。

## 当前状态

- 主工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`。
- 远程仓库：`https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`。
- 当前主线：`main`，Codex 接手标签 `codex-handoff-20260727`。
- 5.5 封版为内部交接基线，不是 GA 发布。
- 桌面/移动端主流程可玩；移动端 iOS standalone 音频仍需用户真机复验。
- 当前资料已收口为短入口；CodeBuddy 长交接只作历史证据。

## 架构概要

- L1 数据：`snake55/02_config.js`，运行时配置落点。
- L3 引擎：`03_core.js`、`04_collision.js`，提供 Bus、Registry、Formula、GS、对象池、空间哈希。
- L5 系统：粒子、蛇、敌人、技能、波次、音频、UI、技能经济。
- L6 渲染：`11_render.js`，Canvas 渲染、相机、精灵、像素吸附。
- L7 调试：`13_editor.js`、`15_profiler.js`，GM 调参和性能日志。
- 入口：`14_main.js` fixed-step 主循环。

## 当前开放问题

- `P0` iOS standalone：音频解锁逻辑已修，但仍待用户真机确认。
- `P1` B-TUNE：dev 工具已代码门控，待三种 DEBUG 组合复验。
- `P1` CONFIG 深冻结未递归生效，运行时覆盖模型需要澄清。
- `P1` GM 碰撞盒默认蛇头圈不画。
- `P1` AOE 判定口径：冰池精确，火墙/护盾/蒸汽 cell 语义，需设计拍板。
- `P1/P2` 撞墙回正待实测，Boss 召唤/子弹、满级溢出、电磁 Combo 可读性、移动端窄屏适配待排期。

详见 `docs/DEBT.md`。

## 禁止事项

- 不改 `snake55/index.html` 的脚本加载顺序。
- 禁止 import/export，全部继续挂 `window`。
- 业务代码不写裸数字，数值走 `CONFIG`。
- 不经确认不动 `03_core.js` / `04_collision.js`。
- 改代码前必须先出《计划》并等用户确认。
- 改任意 `snake55/*.js` 后必须同步 bump `index.html` 全部 `?v=` 缓存戳。
- Git 禁止 `git add -A`、`push -f`、`push --all`。

## 下一阶段建议

1. 先完成资料收口：归档已落地计划、旧审查，保持当前入口短而准。
2. 做一个静态检查脚本，自动检查脚本顺序、import/export、JS 语法、缓存戳一致性和文档链接。
3. 处理 P0：iOS standalone 复验；B-TUNE 按测试清单完成复验。
4. 处理低风险 P1：碰撞盒 `headRadius`、注释/口径修正。
5. 再做需要拍板的 gameplay 专项：AOE 判定口径、撞墙回正、Boss、技能可读性。

## 给 ChatGPT 总控窗口的建议

请让总控窗口先产出“优化需求池 + 优先级 + 风险 + 验收方式”，不要直接让它写代码。代码落地继续由 Codex 按 `AGENTS.md` 流程执行。
