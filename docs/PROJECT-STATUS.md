# PROJECT-STATUS.md · 当前项目状态

> 更新时间：2026-07-27。本文记录“现在项目是什么状态”，不写历史流水。

## 当前基线

- 仓库：`https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`
- 主线：`main`
- Codex 接手标签：`codex-handoff-20260727`
- 当前工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`
- 运行方式：静态托管或本地 HTTP 打开 `snake55/index.html`
- 技术栈：原生 JS + Canvas + Web Audio，无构建流程

## 可演示能力

- 贪吃蛇基础移动、成长、碰撞、波次。
- Roguelike 技能与 Combo：火、冰、护盾、蒸汽、电磁等。
- 程序化 BGM 与音效 ducking。
- 移动端横屏、摇杆、HUD、iOS 音频解锁逻辑。
- 敌人 PNG 与蛇头素材接入。
- 性能分级、粒子/飘字池、fixed-step 主循环。

## 当前阻塞

- `P0` B-TUNE dev 工具未隔离，GA 前必须处理。
- `P0` iOS standalone 真机复验未完成。

## 近期待办

- 资料治理第二阶段完成后，开始静态检查脚本。
- 低风险修复：GM 碰撞盒 `headRadius`、CONFIG 深冻结/覆盖口径说明或修复。
- 用户复验：边缘撞墙回正、iOS standalone 音频。
- 设计拍板：AOE 判定口径、Boss 能力、满级溢出、移动端优先级。

## 正式审查入口

默认入口只读：

1. `AGENTS.md`
2. `docs/PROJECT-BRIEF.md`
3. `docs/PROJECT-STATUS.md`
4. `docs/DEBT.md`
5. `docs/ARCHITECTURE.md`
6. `docs/plans/STATUS.md`

按需再读：

- 设计规划：GDD 设计意图文档。
- 历史踩坑：`docs/RETRO.md`。
- Git/调参/文档治理：`docs/workflow.md`。
- 封版证据：`docs/archive/`、`docs/releases/`。
