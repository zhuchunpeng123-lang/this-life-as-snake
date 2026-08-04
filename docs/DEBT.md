# DEBT.md · 当前开放问题台账

> 本文件只保留“未来仍要决策或修复”的事项。已落地流水看 `CHANGELOG.md`，历史审查原文看 `docs/archive/REVIEW-20260723.md`，踩坑教训看 `docs/RETRO.md`。

## 0. 读取方式

- `P0`：发布或接手硬阻塞，优先处理。
- `P1`：明显 bug 或协作风险，进入近期计划。
- `P2`：体验、表现或文档债，可排期。
- 代码修复前仍按 `AGENTS.md` 先出《计划》，等待用户确认。

## 1. P1 确认 bug / 工程护栏

| 项 | 影响 | 建议 |
|---|---|---|
| CONFIG 深冻结未真正递归生效 | `02_config.js` 顶层先 freeze，`03_core.deepFreeze` 早退，嵌套对象仍可写；运行时调参覆盖也依赖这个现状 | 单独计划修正“冻结 + 覆盖”口径，避免静默篡改或启动炸裂 |
| `RENDER.worldScale` 双源 | `CONFIG.RENDER.worldScale` 看似可调，但实际多走 `PERF.tiers`/RT，易误导调参 | 更新注释或统一取值模型 |
| RT path 单位/索引陷阱 | `turnRateDecayPerSeg` 百分比/小数双口径、`aggroRangeByStage` 1-based/0-based、虚拟 path 易误持久化 | 给 editor 调参通道加红线或统一命名 |
| AOE 判定口径不一 | 冰池精确圆判定；火墙/护盾/蒸汽沿用 SpatialHash cell 候选，实效半径大于标称 | 用户拍板：保留 cell 手感并写明，或改精确判定后重调数值 |

## 2. P1/P2 Gameplay 与体验债

| 项 | 状态 | 建议 |
|---|---|---|
| 边缘撞墙回正 | 已落地待用户实测 | 复验绿后归档；失败则重开计划 |
| 铁壁蛇阵 | GDD 有规划，需动 `03_core.js` / `04_collision.js` | 属底层改动，必须先确认影响面 |
| Boss 召唤小怪 | GDD 有规划，代码未实现 | 作为 Boss 玩法专项 |
| Boss 子弹命中蛇头伤害 | 审查确认仍待处理 | 需要先定伤害/反馈，再计划 |
| 满级后溢出转化 | 成长系统未实现 | 作为经济系统专项 |
| 电磁 Combo 可读性弱 | 与基础闪电链视觉同质 | 先做表现方案，不急改数值 |
| 移动端窄屏适配 | 主流程可玩，极端窄屏仍后置 | 等桌面手感主线稳定后处理 |

## 3. 数值与设计待确认

| 字段/主题 | 当前问题 | 建议 |
|---|---|---|
| `PICKUP.food.overflowScore` | 代码已有占位，旧数值文档未同步 | 后续按轻量调参自审确认 |
| `PICKUP.dangerBias.ringMin/ringMax` | 代码已有危险偏向距离 | 后续按轻量调参自审确认 |
| `SKILL.shield.orbitHitMul` | 几何命中因子待标定 | 通过 GM/实测校准 |
| `STAGE.pool` | 段位敌池来自设计文字推断 | 作为关卡节奏设计项确认 |
| 敌人/Boss 若干本地表现值 | 历史表内有候选，但未统一收口 | 做敌人专项时统一迁回 CONFIG 或注明表现值 |

## 4. 美术与发布表现债

| 项 | 影响 | 建议 |
|---|---|---|
| 根目录 `snake_head.png` | 疑似历史/备用素材，`snake55/assets/snake_head.png` 已存在 | 后续比对哈希和引用，确认无用再删 |
| Boss 图不符合“猫头鹰”预期 | 美术表达不准 | 美术替换专项 |
| snake body/tail 无图 | 仍由代码绘制 | 视觉升级时再处理 |

## 5. 已处理待复验

| 项 | 结果 | 复验 |
|---|---|---|
| B-TUNE dev 工具隔离 | 已按两级门控处理：GM/假人走 `DEBUG.enabled && editorEnabled`，Profiler/SkillEcon 走 `DEBUG.enabled` | 按 `docs/plans/B-TUNE-dev-tools-gating-测试清单.md` 做三种 DEBUG 组合复验 |
