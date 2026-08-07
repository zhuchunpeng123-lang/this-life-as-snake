# docs/RETRO.md — 跨会话复盘（截至 2026-07-21）

> 目的：沉淀「所有对话 + 多次调代码」的教训，避免重蹈覆辙。每条附出处（plan / commit / DEBT）。
> 配套使用：`docs/plans/STATUS.md` 管"文件状态"，本文件管"认知教训"。
> 性质：纯文档，零代码改动；仅记录结论，不重复 AGENTS 规则全文。
> 当前执行权限、计划、审查和状态更新以 `AGENTS.md`、`docs/workflow.md` 为准；本文的历史流程记录不新增硬性暂停条件。

## 0. 一句总纲
**先测后改、文件即记忆、双份真相源一律还 config、底层动必告知。** 多数返工都源于这四条没守住。

## 1. 性能排查：先测后改，绝不"凭直觉改再测"
- **现象**：2026-07-20 性能连翻 6 轮（round1~round6），多因"凭直觉改再测"。
- **具体踩坑**：
  - round1 误认"缩放 = 填充率回归"；
  - round5 误判"viewZoom 缩小增 overdraw" → 错误回滚，被 round6 推翻。
- **正确姿势（最终收敛）**：用 profiler「CPU帧 vs 帧(ms)」二分 + bisect 先锁根因（GPU 填充率 vs 主线程 JS/DOM），再针对性改。
- **出处**：`perf-fps28.md`（两轮实测驱动）、`perf-rootcause.md`、`round5-revert.md`（🗑）、`round6-cleanup.md`、`fps-regression-diagnosis.md`（🔍）。

## 2. WIP vs 已提交混淆
- **现象**：fps-regression-diagnosis 排查时，用户看到的掉帧实为**未提交 WIP**，非 committed baseline，导致误判"又卡了"。
- **正确**：排查前 `git stash` / `git commit` 隔离工作区，浏览器只跑纯提交态。
- **出处**：`fps-regression-diagnosis.md`。

## 3. 文件即记忆：状态散落聊天 → 反复踩坑
- **现象**：多轮反复的根因之一是状态散落聊天未落文件、`docs/plans` 缺总索引 → 衍生 round5 误判（没看到 round6 已推翻它）。
- **正确**：根因/结论写进正式文件；只有仍影响后续工作的计划或状态变化才更新 `STATUS.md`。
- **出处**：本整理方案 + `STATUS.md` 约定。

## 4. Bus 事件名：动作段允许驼峰，但 on/emit 必须同名；格式可疑仅 warn 不崩
- **现象**：Bus 事件名大小写不一致 → 订阅收不到；更严重的历史坑是「事件名含大写 → `Bus.on` 的 assert 致命崩溃 → 整模块 IIFE 中断未注册 → 整系统静默失效」，已发生 3 次（2026-07-13 粒子系统 `fx:iceSlow`、2026-07-22 collision `setRadii` 等）。
- **根因升级（2026-07-22 决策 A，2026-07-23 落地）**：真正要防的是「on 与 emit 不同名」，而非「用了大写」；强制全小写把"风格违规"升级成"致命崩溃"且漏防"下划线不一致"。故 `03_core.js` Bus 改为：正则放宽允许驼峰 `^[a-z0-9]+:[a-zA-Z0-9_]+$`，且 `on` 的 assert 改为 `Log.warn` 软拒绝（格式可疑仅告警+跳过注册，模块不崩）。
- **正确（新约定）**：①动作段允许大小写混写（驼峰 OK），但**仍建议全小写**以利审计；②**on 与 emit 必须同名**（这是唯一真正要防的 bug）；③新增事件登记到计划/DEBT。
- **出处**：`docs/DEBT.md` §4 工程债（第三次事故 + 决策 A）。

## 5. 双份真相源：业务数值禁写本地常量
- **现象**：SHIELD 曾写本地常量（已还 config）；ICE 仍 `lingerSec` / `slowLingerSec` 占位待回写 §9。
- **正确**：调参前先 `grep` 确认字段在 config 还是 js 本地常量；本地常量一律还 config + 登记 §9 Changelog。
- **出处**：`DEBT.md` §9 数值债 / `AGENTS.md` §六 铁律 / §七。

## 6. VFX 发射量：绑"来源(蛇身)"而非"敌数"
- **现象**：`spawnFireEmbers` 初版绑敌数 → 粒子池焊死 240/240 overdraw；改绑火源后恒定。
- **正确**：粒子/特效发射量以"稳定来源数"为基准，不随敌数线性膨胀。
- **出处**：perf 系列 + `DEBT.md`。

## 7. worldScale vs maxBackW：概念必须区分
- **现象**：曾混淆"改实体大小(worldScale)"与"改分辨率/填充率(maxBackW)"，GM 滑条命名/注释需防混淆。
- **正确**：`worldScale` = 视觉缩放（实体大小）；`maxBackW` = 画布上限宽（填充率）。二者解耦，UI 标注清楚。
- **出处**：`view-scale-and-dot.md`（✅）+ `DEBT.md`。

## 8. 粒子/文字池：硬上限 + 优先门控
- **现象**：beam / blast / dart / flashCores 曾无活跃数上限；飘字风暴需护栏。
- **正确**：所有池须硬上限 + 优先级门控（low 优先可被丢弃）；满屏时按预算丢弃低优飘字。
- **出处**：`perf-fps28.md` 验收 + `DEBT.md`。

## 9. DOT 语义：isDot 只结算血量，不刷物理反应
- **现象**：DOT 漏传 `src` → `SRC_STYLE.burn` 死配置；分源 `dotMap` 未独立聚合。
- **正确**：`isDot=true` 只结算血量、按 `DOT_TEXT_MIN` 聚合飘字，不击退/不硬直/不闪白；分源 `dotMap` 独立聚合；传 `src`。
- **出处**：`view-scale-and-dot.md` + `AGENTS.md` §六。

## 10. 调参推导与校验
- **现象**：用户给"手感"描述时易退化成"抄写员"（直接把 a 改成 b）。
- **正确**：保留目标、依据/推导、波及影响和验收；是否提供多个候选按问题是否存在实质取舍决定，不固定候选数量。
- **出处**：`AGENTS.md` §5、`docs/workflow.md` §2。

## 11. 开放风险（待跟进，勿忘）
> 本节状态项是对应时间点的历史快照；当前状态以 `docs/PROJECT-STATUS.md`、`docs/DEBT.md` 和当前代码为准。
- **⑥ 冰冻重做**：已 commit（5777395）、数值已回写 §9，用户确认重做已完成。
- **④ 蒸汽状态引爆**：已 commit（13c2e53）+ 实测绿，零新数值无需 §9 回写；④-B 屏震精修解除阻塞可推进（屏震四档已在 07-17 落地）。
- **性能"外部 gap"**：偶发尖峰为环境级（最小化恢复 / 后台切换），靠主循环丢追帧缓解，非渲染根治。
- **🔒 封版快照 2026-07-27（commit 5a5b5d6）**：内部冻结基线，非 GA。配套 `docs/releases/2026-07-27-freeze.md` + `docs/releases/2026-07-27-codebuddy-handoff.md`。**🔴 B-TUNE 发布硬阻塞仍开**：`13_editor.js`（GM 标定层 + `~` 键 + ⚙ 按钮）与 `07_enemy.js` `spawnDummy` 未受 `CONFIG.DEBUG.enabled` 门控，随包加载 → GA 前须 Codex 接手加 `if (CONFIG.DEBUG.editorEnabled)` 门控（详见 DEBT §4 / 交接快照 §7）。
- **iOS standalone 真机复验**：2026-07-27 第三轮音频解锁（手势内同步起振荡器 + ctx running 后起 BGM）逻辑应已根治「主屏打开无声」，但用户尚未真机复验绿，列为待复验项（非代码阻塞）。

## 12. 当前流程口径
当前执行权限、计划、审查和状态更新以 `AGENTS.md` 与 `docs/workflow.md` 为准；本文件只保留历史教训，不重复定义当前流程。

## 13. Codex 接手治理：先立主工作区，再精简入口
- **现象**：外层交接导出目录不是 Git 仓库；真实远程仓库已在 GitHub，且文档布局与外层导出不同。若直接在外层改，会丢提交历史和推送路径。
- **正确**：先克隆远程到 `_git-main`，打接手标签 `codex-handoff-20260727`，确认 `snake55` 代码与外层导出一致，再把 `_git-main` 设为后续唯一主工作区。
- **代理坑**：全局 Git 代理曾指向错误端口；当前仓库本地使用 `127.0.0.1:7897` + `http.sslBackend=openssl` 才能稳定访问 GitHub。换机器时必须重新检查代理，不盲用历史端口。
- **文档入口**：长交接文档保留作证据，但每日开工只读短 `AGENTS.md` + 任务相关文件；历史资料按“保留 / 归档 / 删除 / 合并”治理，避免 token 噪音压过当前事实。
