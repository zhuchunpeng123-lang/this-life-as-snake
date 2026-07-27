# AGENTS.md · 《此生为蛇》Codex 项目守则

> 本文件只放“每次开工必须加载”的最小规则。长交接、历史复盘、调参细则放在 `docs/`，按任务需要再读。记忆靠文件，不靠聊天历史。

## 0. 开工路径

- 主工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`。外层目录是交接导出快照，后续迭代默认不在那里改。
- 默认只读：本文件 + `docs/PROJECT-BRIEF.md` + `docs/DEBT.md` 的当前未结项 + 当前任务相关源码。
- 需要定位状态时读：`docs/PROJECT-STATUS.md`、`docs/plans/STATUS.md`、`docs/RETRO.md`。
- 需要设计依据时读：GDD 设计意图文档；旧数值文档只作历史参考。
- 需要 Git/调参/多窗口流程时读：`docs/workflow.md`。
- `docs/HANDOFF-CODEX.md`、`docs/RELEASE.md`、`docs/archive/` 和已归档计划是历史证据，不作为每日规则入口。

## 1. 两条硬墙

1. 任何代码改动前必须先出《计划》，等用户确认后再落地。纯文档整理可直接执行，但涉及删除、迁移、重命名或会影响协作入口时也要先说明方案。
2. 四项绝对禁令：不改 `index.html` 脚本加载顺序；禁止 import/export；业务代码禁止裸数字；动 `03_core.js` / `04_collision.js` 前必须显式告知影响面并等待确认。

## 2. 架构速查

- L1 数据：`02_config.js`，当前运行时配置入口。业务数值必须来自 `CONFIG`。
- L3 引擎：`03_core.js`（Bus/Registry/Formula/GS/对象池）、`04_collision.js`（空间哈希）。
- L5 系统：`05_particle.js`、`06_snake.js`、`07_enemy.js`、`08_skill.js`、`09_wave.js`、`10_audio.js`、`12_ui.js`、`16_skill_econ.js`。
- L6 渲染：`11_render.js`。
- L7 调试：`13_editor.js`、`15_profiler.js`。
- 入口：`14_main.js` fixed-step 主循环。
- 加载方式：全部挂 `window` 全局，由 `snake55/index.html` 顺序加载。

## 3. 代码改动计划模板

计划必须包含：

1. 目标一句话。
2. 涉及文件及理由。
3. 具体改动点。
4. 不动的底层：明确是否不碰 `03_core.js` / `04_collision.js`。
5. 验收标准：正常场景 + 至少 1 个边界或反向场景。

落地后必须输出测试清单，并说明是否改了计划外文件、是否意外触碰 core/collision。

## 4. 项目铁律

- 数值只走 `CONFIG`；GDD 给意图，不给业务裸数字。
- 系统间优先通过 `Bus('系统:动作')` 通信，不跨层直调。
- 所有伤害经 `Core.Formula.damage(base, GS.segments, crit)`；技能层用 `hurt()` 包装。
- `isDot=true` 只结算血量和 DOT 飘字，不击退、不硬直、不闪白；分源 `dotMap` 独立聚合并传 `src`。
- 新增 Bus 事件时，`on` 与 `emit` 必须同名；动作段建议全小写，历史驼峰允许但不鼓励。

## 5. 数值调参

- 仅改 `02_config.js` 数值或用 `~` 调参器试探，走轻量《调参提案》。
- 调参提案必须给至少 2 个候选、推导、波及分析、落点和验收。
- 数值结构、公式、伤害管线变化，升级为完整代码计划。
- 当前权威口径：`02_config.js` 是运行时配置落点；旧“数值真理源 v0.3”是历史镜像/设计依据。冲突时以当前代码为准，再按 `docs/workflow.md` 记录同步债务。

## 6. Git 与发布坑

- 远程：`origin = https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`，主线只维护 `main`。
- 本仓库需要 Clash 代理：`http.proxy` / `https.proxy` 使用 `http://127.0.0.1:7897`，SSL 后端使用 `openssl`。
- 提交只显式 `git add <文件>`；禁止 `git add -A`、`push -f`、`push --all`。
- 提交信息格式：`type(scope): 中文一句话`。
- 改任意 `snake55/*.js` 后，必须同步 bump `snake55/index.html` 中全部脚本的 `?v=` 缓存戳，否则线上可能“假更新”。
