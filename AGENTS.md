# AGENTS.md · 《此生为蛇》Codex 项目守则

> 本文件只放每次开工必须加载的最小规则。详细流程、历史和设计资料按任务需要读取；聊天记录不是项目真理源。

## 0. 开工读取

- 主工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`；外层目录只作交接快照。
- 常规任务：本文件 + 当前任务相关源码。
- 状态/排期任务：加读 `docs/PROJECT-STATUS.md`、`docs/plans/STATUS.md`。
- Git、调参、多窗口或文档治理：加读 `docs/workflow.md`。
- 世界观/美术/设计任务：加读相关 GDD、`docs/design/` 文档。
- `DEBT`、`RETRO`、`HANDOFF`、`RELEASE`、`archive` 只在问题相关时读取，不默认全文扫描。

## 1. 执行权限与硬规则

- 项目内执行权限优先级：用户当前明确指令 → `AGENTS.md` → 当前任务专项真理源。流程、复盘、交接和历史文档不得增加新的暂停条件。
- 修改前先完成内部计划和自审。用户已明确要求执行，且未触及以下高风险边界时，直接连续完成，不重复请求确认：`03_core.js` / `04_collision.js`；脚本加载顺序或模块模型；玩法规则或平衡方向；重要删除、迁移、批量重命名、发布开关或 Git 历史改写；必须由用户选择的实质歧义；无法安全隔离的既有 WIP。
- 已授权范围内，AI 可自主决定低风险实现细节和完成任务所必需的伴随修改，并在交付时说明。
- 未经明确确认，不改变 `index.html` 脚本加载顺序，不引入 `import/export`；业务数值不得以裸数字散落在业务代码中。

## 2. 架构速查

- L1 数据：`02_config.js`，运行时配置唯一入口；业务数值必须来自 `CONFIG`。
- L3 引擎：`03_core.js`（Bus/Registry/Formula/GS/对象池）、`04_collision.js`（空间哈希）。
- L5 系统：`05_particle.js`、`06_snake.js`、`07_enemy.js`、`08_skill.js`、`09_wave.js`、`10_audio.js`、`12_ui.js`、`16_skill_econ.js`。
- L6 渲染：`11_render.js`；L7 调试：`13_editor.js`、`15_profiler.js`；入口：`14_main.js` fixed-step 主循环。
- 所有脚本由 `snake55/index.html` 顺序加载并挂到 `window` 全局。

## 3. 计划与验收

- 计划主要用于内部自审，不自动构成等待确认的关卡。至少覆盖目标、涉及文件、风险边界和验收方式。
- 仅高风险、跨模块、跨会话、需要长期跟踪或用户明确要求时，建立正式计划文件并更新 `docs/plans/STATUS.md`。
- 落地后执行当前环境可完成的检查并审查实际 diff，简要报告改动、验证结果、计划偏差和未验证事项。

## 4. 工程铁律

- 系统间优先通过 `Bus('系统:动作')` 通信；新增事件的 `on` 与 `emit` 必须同名。
- 所有伤害经 `Core.Formula.damage(base, GS.segments, crit)`；技能层用 `hurt()` 包装。
- `isDot=true` 只结算血量和 DOT 飘字，不击退、不硬直、不闪白；分源 `dotMap` 独立聚合并传 `src`。

## 5. 数值调参

- 仅调整 `02_config.js` 数值或使用 `~` 调参器试探时，先完成轻量调参自审：明确目标、依据、影响、CONFIG 落点和验收；是否提供多个候选由问题是否存在实质取舍决定。
- 改数值结构、公式或伤害管线时，完成完整影响分析与验证；触及第 1 节高风险边界时暂停确认。当前运行时以 `02_config.js` 为准。

## 6. 发布护栏

- Git、代理、认证、提交和推送流程见 `docs/workflow.md` 与 `docs/AI-COLLABORATION.md`；禁止 `push -f` / `push --all`。
- 修改任意 `snake55/*.js` 后，必须统一 bump `snake55/index.html` 中全部脚本的 `?v=` 缓存戳，避免线上假更新。
