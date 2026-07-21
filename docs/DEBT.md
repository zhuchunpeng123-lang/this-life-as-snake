# DEBT.md · 技术债 / 设计债台账

> 本文件记录"已临时凑合、将来必补"的债。还债按对应流程回写：
> §9 数值债走 AGENTS.md §十；设计债走 §八；表现债走 ~ 调参器。
> 配套：AGENTS.md（守则）、docs/workflow.md（怎么还债）、CHANGELOG.md（已还的债）。

## 如何读这张表
- **类型**：§9 数值债 / 表现债 / 设计债 / 工程债
- **状态**：🔴 未还 / 🟡 部分 / ✅ 已还
- **回写动作**：见最后一列

---

## §1 §9 数值债（影响强度/平衡，须回写真理源 §9）

> 以下变量在代码中以 `🟡` + `TODO(候选)` 占位，真理源 §9 尚未量化，属"待回写债务"。

| 文件 | 变量 | 当前占位 | 候选值 | 回写动作 |
|---|---|---|---|---|
| 08_skill.js | `SHIELD_ORBIT_SEC`(已删) | — | — | ✅ 已还：B-2 迁 `CONFIG.SKILL.shield.orbitSec=1.6`（§9 2026-07-12 登记）；08_skill.js 本地常量已删，`11_render.js` drawSkillAura 已同步读 `orbitSec`（消双份真相源） |
| 08_skill.js | `SHIELD_ORB_RADIUS`(已删) | — | — | ✅ 已还：B-2 迁 `CONFIG.SKILL.shield.orbitRadius=[44,58,72,86,100]`（§9 2026-07-12 登记）；`11_render.js` drawSkillAura 已同步读 `orbitRadius` |
| 08_skill.js | `ICE_SLOW_LINGER_SEC` | 0.5 | 0.3 / 0.8 | ✅ 已还：B-2 迁 `CONFIG.SKILL.ice.slowLingerSec=0.4`（减速跟随短窗，L1–4 每帧刷新 `applySlow(e,pct,slowLingerSec)`，离开约 0.4s 恢复；L5 冻结仍用 `lv5FreezeSec`）；原本地常量已删，减速时长 ≠ 冰区滞留时长 |
| 08_skill.js | `COMBO_STEAM_INTERVAL_SEC` | 2.0 | 1.5 / 3.0 | 同上 |
| 08_skill.js | `COMBO_ELECTRO_INTERVAL_SEC` | 已废弃 | — | ✅ 已还：语义由 `CONFIG.COMBO.electroTurret.cooldownSec=0.5`（§9 2026-07-11）承接，本地常量已删 |
| 07_enemy.js | `CHARGE_DURATION_SEC` | 0.4 | 0.35 / 0.5 | 实测 → 登记 §9 |
| 07_enemy.js | `WANDER_REDIR_SEC` | 1.5 | 1.2 / 2.0 | 同上 |
| 07_enemy.js | `BOSS_FIRE_INTERVAL_SEC` | 1.2 | 1.0 / 1.5 | 同上 |
| 07_enemy.js | `BOSS_FIRE_COUNT` | 6 | 5 / 8 | 同上 |
| 07_enemy.js | `BOSS_BULLET_RADIUS` | 9 | 8 / 10 | 同上 |
| 07_enemy.js | `BOSS_BULLET_LIFE_SEC` | 4.0 | 3 / 4 | 同上 |
| 07_enemy.js | `DOT_TEXT_MIN` | 4 (原 10) | 3 / 6 | 表现聚合阈值，Commit A 由 10→4 让 DOT 飘字更频繁（视觉「持续小数字」）；**仅影响飘字聚合、不进伤害/命中判定**，登记 §9 |
| 02_config.js | `STAGE.pool` | GDD 文字推断 | — | 🟡 待 §9 量化 stage pool（段③割草期 pool 已补 elite，对齐 §6 段③「全类型+精英」，§9 2026-07-11 已登记） |
| 02_config.js | `SKILL.ice.lingerSec` | [2.0,2.5,3.0,3.5,4.0] (A) | 待实测标定 | 🟡 B-2 初值 A：冰区滞留时长（=减速持续初值，L1–4 每帧刷新短窗仍是 slowLingerSec）；实测后由 Notion 真理源 §9 回填 |
| 02_config.js | `SKILL.ice.slowLingerSec` | 0.4 | 待实测标定 | 🟡 B-2 初值：减速跟随短窗（≠ 滞留时长），离开冰区约 0.4s 恢复；实测回填 §9 |
| 02_config.js | `SKILL.shield.orbitRadius` | [30,40,50,60,70] (A) | 待实测标定 | 🟡 B-2 初值 A：护盾贴头点防曲线（headRadius=14，球落点刚好头外侧，不扩全身/不压火墙）；实测回填 §9 |

---

## §2 表现债（纯视觉/节奏，不影响平衡）

| 文件 | 位置 | 当前 | 候选 |
|---|---|---|---|
| 11_render.js | `TELEGRAPH_BLINK_HZ` | 8 | 6 / 10 |
| 11_render.js | `TELEGRAPH_ARROW_LEN` | 22 | 18 / 28 |
| 11_render.js | `BOSS_WARN_PULSE_HZ` | 6 | 4 / 8 |
| 11_render.js | `BOSS_WARN_BORDER_PX` | 8 | 6 / 12 |
| 11_render.js | 护盾描边/内晕 alpha | 0.45 / 0.06 | 0.35/0.55, 0.04/0.09 |
| 11_render.js | 护盾球半径 | 5px | 4 / 6 |
| 11_render.js | 冰域显示节数 | 5 | 4 / 8 |
| 05_particle.js | 弹道光束色 `BOLT_COLOR` | #fff1a8 | #ffffff / #ffe066 |
| 05_particle.js | 弹道光束存活 `BOLT_LIFE` | 0.2s | 0.15 / 0.25 |
| 05_particle.js | 光束线宽 `BEAM_W_PX` | 3px | 2 / 4 |
| 05_particle.js | 电链色 `LIGHTNING_COLOR` | #9fd0ff | #bfe3ff / #88ccff |
| 05_particle.js | 电链线宽 `LIGHTNING_W_PX` | 2px | 3 / 1.5 |
| 05_particle.js | 电链存活 `LIGHTNING_LIFE` | 0.22s | 0.18 / 0.28 |
| 05_particle.js | 电链抖动 `LIGHTNING_JAG` | 14px | 10 / 20 |
| 05_particle.js | 爆环色 `BLAST_COLOR` | #ffb04d | #ff8a3d / #ffd27a |
| 05_particle.js | 爆环存活 `BLAST_LIFE` | 0.4s | 0.3 / 0.5 |
| 05_particle.js | 爆环线宽 `BLAST_RING_W` | 4px | 3 / 6 |
| 05_particle.js | 命中/爆散爆点 `HIT_BURST_N` | 6颗 | 4 / 8 |
| 05_particle.js | 飞镖飞行时长 `BOLT_FLY_SEC` | 0.14s | 0.12 / 0.18 |
| 05_particle.js | 飞镖拖尾占比 `DART_TRAIL_PX` | 10 | 8 / 14 |
| 05_particle.js | DOT 飘字色 `DOT_TEXT_COLOR` | #ff7a3c | #ff6a2c / #ff944d |
| 05_particle.js | DOT 飘字字号 `DOT_TEXT_SIZE` | 11 | 10 / 12 |
| 05_particle.js | 来源标签色 `SRC_STYLE.bolt`（飞镖青） | #2ad4ff | #29c7ff / #3fe0ff |
| 05_particle.js | 来源标签色 `SRC_STYLE.lightning`（闪电紫） | #c9a8ff | #b98cff / #d8bcff |
| 05_particle.js | 来源标签色 `SRC_STYLE.shield`（护盾白金） | #ffe6a3 | #ffd166 / #fff0c2 |
| 05_particle.js | 来源标签色 `SRC_STYLE.steam`（蒸汽暖橙） | #ffb04d | #ff8a3d / #ffd27a |
| 11_render.js | 受击红闪时长 `HURT_VIGNETTE_SEC` | 0.45s | 0.35 / 0.6 |
| 11_render.js | 火环跳动频率 `FIRE_FLICKER_HZ` | 12 | 10 / 16 |
| 11_render.js | 护盾拖影占比 `SHIELD_GLOW_TRAIL` | 0.18 | 0.12 / 0.25 |
| 11_render.js | 护盾球半径（drawSkillAura） | 6px | 4 / 6 |
| 12_ui.js | combo 横幅配色 `COMBO_COLOR` | 候选值 | UX 复核 |
| 10_audio.js | 各音效 freq/dur | 候选值 | ~ 调参器微调 |
| 13_editor.js | 调参清单 | 待确认 | 实测补全 |
| 12_ui.js | `SKILL_LABEL` | 待确认 | UX 复核 |

---

> **B-4 combo VFX 表现债（2026-07-13）**：`05_particle.js` 新增 `flashCores` 叠层闪核（蒸汽白 `rgba(255,255,255,0.92)`/电磁紫 `rgba(201,168,255,0.55)`）、蒸汽白蒸汽云 `rgba(255,255,255,0.8)`/冰晶 `#9fdcff`、电磁紫电链 `#c9a8ff`、灼烧橙镖 `#ff7a3c`/内芯 `#ffd27a` —— 均为 inline 字面量，与文件顶部 `🟡 TODO` 块风格一致，待 ~ 调参器定稿并建议提进顶部 TODO 块常量（对齐 `SRC_STYLE.lightning` / `DOT_TEXT_COLOR` / 冰区 `COLORS`）。

## §3 设计债（GDD 已规划、代码未实现，须 §八 计划）

- 🔴 **铁壁蛇阵**：需改 `03_core.js` / `04_collision.js` → 走 AGENTS.md §三 流程。
- 🔴 **Boss 召唤小怪**：`07_enemy.js` 当前未实现。
- ✅ **技能沿蛇身铺开**：B-2 火/冰/护盾已沿蛇身逐节判定（`08_skill.js` tickFire/tickIce/tickShield 读 config 半径/宽度/`segStep`/`orbitRadius`/`orbitSec`，同帧去重），且 `11_render.js` drawSkillAura 已沿身绘制（火墙/霜冻带沿整条蛇、护盾读 config 公转），视觉=判定；真理源 §4.1/§4.2/§4.4/§9 已回写。
- 🔴 **满级后溢出转化**：成长系统未实现。

> 以上以《GDD v0.3》为准；落地前须在 `docs/plans/` 出 §四 计划并经你确认。

---

## §4 工程债

- ✅ **render.js 硬编码护盾参数**：B-2 已消除——`11_render.js` drawSkillAura 改为读 `CONFIG.SKILL.shield.orbitRadius/orbitSec`（取代写死 26/1.6），火/冰沿蛇身绘制，并补 GM「显示碰撞盒」`drawDebugHitboxes` 钩子（读 `global.GMDBG.showHitboxes`）。双份真相源已消（§1 对应债同步还）。
- ✅ **手动 .bak 备份**：已被 Git 取代（2026-07-11 落地时清理）。
- 🔴 **dev-only 标定工具隔离（B-TUNE）**：`13_editor.js` 运行时覆盖层 `rtTuning`（`RT()` 桥接 `08_skill.js` tickFire/tickIce/tickShield 实时读取，仅换输入来源、不写 config）与 `07_enemy.js` 训练假人 `spawnDummy`（`die()` 钳血 `e.hp=1` 不秒、`baseSpeed=0` 站着、`countMobs` 排除）均为**纯 dev 测试工具，不得进 release 路径**——发布前须由构建/打包流程剔除或加 `if (DEBUG)` 门控，避免标定滑条/沙盒/假人泄漏到玩家环境。
- ✅ **冰区减速每帧扫描（B-2 perf 债·#6 已还）**：`08_skill.js` 的 `enemiesIn`（火墙/冰池/护盾球/蒸汽引爆共用 AOE 索敌）原每帧每 AOE 中心一次 `collision.queryCircle`（含字符串 key 拼接/map 查找/新数组分配的 GC 抖动）。#6 改为复用每帧 `_enemySnap` 做 **cell 覆盖相交判定**，精确复刻 `SpatialHash.query` 返回集合（cell 级宽松、非精确圆），等价候选③「空间网格预筛」且更彻底——所有 AOE 索敌统一受益、零每帧分配；`04_collision.js` 未动；`CONFIG.SPATIAL.cellSize` 复用（§6 禁裸数字）。实测帧时不再卡。
- ✅ **B-2 回归·Bus 事件名大写导致粒子系统崩溃（2026-07-13 修复）**：`08_skill.js` 新增「敌人进入冰区」事件时用了 `fx:iceSlow`（含大写 `S`），而 `03_core.js` 的 `Bus` 断言强制事件名全小写（`/^[a-z0-9]+:[a-z0-9_]+$/`）。后果：`05_particle.js` 加载期 `Bus.on('fx:iceSlow',…)` 触发断言 **抛错 → 整个粒子系统未注册 → 所有技能特效（火/电/爆环/光束）与伤害数字全部消失**；同时 `08_skill.js` 的 `Bus.emit('fx:iceSlow')` 与监听名不一致 → 「减速」飘字永不发出。修复：两处（on/emit）统一改名为全小写 `fx:iceslow`。**教训**：新增 Bus 事件名必须全小写、且 on 与 emit 必须同名；建议后续在 `Bus.on/emit` 旁加注释提醒，或在代码评审清单里列一条「事件名全小写且收发同名」。**验证**：Node 沙盒加载全部模块确认 `particle` 注册、冰减速 280/400 帧生效、`fx:iceslow` 进入触发 1 次（飘字正常）。

---

## 还债顺序（呼应 AGENTS.md §七 / §十）

1. **§9 数值债**：实测 → 回写真理源 §9 → 同步 config.js → 登记 §9 Changelog。
2. **表现债**：~ 调参器试探 → 定稿 → 删 TODO 占位。
3. **设计债**：`docs/plans/` 出 §四 计划 → 你确认 → 落地 → CHANGELOG 登记。
