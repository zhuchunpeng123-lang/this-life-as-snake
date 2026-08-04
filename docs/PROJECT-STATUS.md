# PROJECT-STATUS.md · 当前项目状态

> 项目状态内容更新时间：2026-08-04；本次审计基线 HEAD：`fec168a`。本文记录“现在项目是什么状态”，不写历史流水。

## 当前基线

- 仓库：`https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`
- 主线：`main`
- 当前提交基线：`fec168a`，`main` 与 `origin/main` 同步。
- 当前工作区：`F:\贪吃蛇游戏项目-Codex\_git-main`
- 运行方式：静态托管或本地 HTTP 打开 `snake55/index.html`
- 技术栈：原生 JS + Canvas + Web Audio，无构建流程

## 已完成基线

- 音频：BGM、战斗 SFX、UI 反馈分轨；暂停、死亡、Boss 结算状态收口；iOS Safari/standalone 在关闭系统静音开关后完成对照验收。
- UI/移动端：横屏门控、HUD/技能/Combo/系统按钮布局、摇杆几何缓存和安全区适配已落地。
- VFX：火焰回退到可读基线；Boss 战斗环/闪烁降噪；燃烧、减速等元素状态改为头顶图标并完成并排对齐。
- 工程治理：静态检查脚本已归档；Codex 低风险执行、风险确认墙、三级视觉任务和显式 `$visual-review` 已进入正式规则。

## 可演示能力

- 贪吃蛇基础移动、成长、碰撞、波次。
- Roguelike 技能与 Combo：火、冰、护盾、蒸汽、电磁等。
- 程序化 BGM 与音效 ducking。
- 移动端横屏、摇杆、HUD、iOS 音频解锁逻辑。
- 敌人 PNG 与蛇头素材接入。
- 性能分级、粒子/飘字池、fixed-step 主循环。

## 当前阻塞

- 当前没有已确认的代码 P0；发布前仍需完成 B-TUNE 三种 DEBUG 组合复验和移动端回归。

## 进行中与待用户验收

- 发布硬化：B-TUNE 已代码门控，待按测试清单复验。
- 用户复验：最新火焰、Boss 降噪、元素图标、移动端横屏主流程和边缘撞墙回正。
- 设计拍板：CONFIG 深冻结、RT 调参单位/索引、AOE 判定口径、Boss 能力、满级溢出、电磁 Combo 和窄屏优先级。

## 当前工作树与开放问题

- 当前工作树有 `docs/DEBT.md`、`snake55/02_config.js` 的既有 WIP，以及 UI 规范和 HUD 资源未跟踪 WIP；这些内容不写成已完成，也不纳入本次资料包。
- 仍需按专项处理 `CONFIG` 深冻结、`RENDER.worldScale` 双源、RT path 单位/索引和 AOE 判定口径；其他开放债务以 `docs/DEBT.md` 为准。

## 正式审查入口

默认阅读范围遵循 `AGENTS.md` 与 `docs/README.md`：先读 `AGENTS.md`、当前任务相关文件和当前专项真理源；状态、开放债、历史资料和计划索引仅在任务相关时读取。

按需再读：

- 设计规划：GDD 设计意图文档。
- 历史踩坑：`docs/RETRO.md`。
- Git/调参/文档治理：`docs/workflow.md`。
- 封版证据：`docs/archive/`、`docs/releases/`。
