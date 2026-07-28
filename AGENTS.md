# AGENTS.md · 《此生为蛇》Codex 项目守则

> 本文件只放每次开工必须加载的最小规则。详细流程、历史和设计资料按任务需要读取；聊天记录不是项目真理源。

## 0. 开工读取

- 主工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`；外层目录只作交接快照。
- 常规任务：本文件 + 当前任务相关源码。
- 状态/排期任务：加读 `docs/PROJECT-STATUS.md`、`docs/plans/STATUS.md`。
- Git、调参、多窗口或文档治理：加读 `docs/workflow.md`。
- 世界观/美术/设计任务：加读相关 GDD、`docs/design/` 文档。
- `DEBT`、`RETRO`、`HANDOFF`、`RELEASE`、`archive` 只在问题相关时读取，不默认全文扫描。

## 1. 硬规则

- 代码改动前必须先形成计划并完成自我审查；低风险任务可连续实施。涉及 `03_core.js`、`04_collision.js`、脚本加载顺序、玩法/数值规则、重要删除迁移或明显歧义时，必须先说明并等待确认。纯文档整理可直接执行。
- 禁止改 `index.html` 脚本加载顺序、使用 `import/export` 或在业务代码写裸数字。
- 修改 `03_core.js` / `04_collision.js` 前，必须说明影响面并等待确认。

## 2. 架构速查

- L1 数据：`02_config.js`，运行时配置唯一入口；业务数值必须来自 `CONFIG`。
- L3 引擎：`03_core.js`（Bus/Registry/Formula/GS/对象池）、`04_collision.js`（空间哈希）。
- L5 系统：`05_particle.js`、`06_snake.js`、`07_enemy.js`、`08_skill.js`、`09_wave.js`、`10_audio.js`、`12_ui.js`、`16_skill_econ.js`。
- L6 渲染：`11_render.js`；L7 调试：`13_editor.js`、`15_profiler.js`；入口：`14_main.js` fixed-step 主循环。
- 所有脚本由 `snake55/index.html` 顺序加载并挂到 `window` 全局。

## 3. 计划与验收

计划必须写清：目标、涉及文件及理由、改动点、不动的底层、正常与边界验收标准。

落地后输出测试清单，标明计划外文件、core/collision 是否被触碰及每项验收结果。

## 4. 工程铁律

- 系统间优先通过 `Bus('系统:动作')` 通信；新增事件的 `on` 与 `emit` 必须同名。
- 所有伤害经 `Core.Formula.damage(base, GS.segments, crit)`；技能层用 `hurt()` 包装。
- `isDot=true` 只结算血量和 DOT 飘字，不击退、不硬直、不闪白；分源 `dotMap` 独立聚合并传 `src`。

## 5. 数值调参

- 仅改 `02_config.js` 数值或用 `~` 调参器试探，走轻量《调参提案》：至少 2 个候选、推导、波及分析、落点和验收。
- 改数值结构、公式或伤害管线，升级为完整代码计划；当前运行时以 `02_config.js` 为准。

## 6. 发布护栏

- Git、代理、认证、提交和推送流程见 `docs/workflow.md` 与 `docs/AI-COLLABORATION.md`；禁止 `push -f` / `push --all`。
- 修改任意 `snake55/*.js` 后，必须统一 bump `snake55/index.html` 中全部脚本的 `?v=` 缓存戳，避免线上假更新。
