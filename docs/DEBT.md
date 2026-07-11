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
| 08_skill.js | `SHIELD_ORBIT_SEC` | 1.6 | 1.2 / 2.0 | 实测手感 → 登记 §9 → 同步 config |
| 08_skill.js | `SHIELD_ORB_RADIUS` | 26 | 22 / 30 | 同上 |
| 08_skill.js | `ICE_SLOW_LINGER_SEC` | 0.5 | 0.3 / 0.8 | 同上 |
| 08_skill.js | `COMBO_STEAM_INTERVAL_SEC` | 2.0 | 1.5 / 3.0 | 同上 |
| 08_skill.js | `COMBO_ELECTRO_INTERVAL_SEC` | 2.0 | 1.5 / 3.0 | **待回写 §9**（真理源尚无此字段） |
| 07_enemy.js | `CHARGE_DURATION_SEC` | 0.4 | 0.35 / 0.5 | 实测 → 登记 §9 |
| 07_enemy.js | `WANDER_REDIR_SEC` | 1.5 | 1.2 / 2.0 | 同上 |
| 07_enemy.js | `BOSS_FIRE_INTERVAL_SEC` | 1.2 | 1.0 / 1.5 | 同上 |
| 07_enemy.js | `BOSS_FIRE_COUNT` | 6 | 5 / 8 | 同上 |
| 07_enemy.js | `BOSS_BULLET_RADIUS` | 9 | 8 / 10 | 同上 |
| 07_enemy.js | `BOSS_BULLET_LIFE_SEC` | 4.0 | 3 / 4 | 同上 |
| 07_enemy.js | `DOT_TEXT_MIN` | 10 | 8 / 15 | 表现聚合阈值，登记 §9 |
| 02_config.js | `STAGE.pool` | GDD 文字推断 | — | 待 §9 量化 stage pool |

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
| 10_audio.js | 各音效 freq/dur | 候选值 | ~ 调参器微调 |
| 13_editor.js | 调参清单 | 待确认 | 实测补全 |
| 12_ui.js | `SKILL_LABEL` | 待确认 | UX 复核 |

---

## §3 设计债（GDD 已规划、代码未实现，须 §八 计划）

- 🔴 **铁壁蛇阵**：需改 `03_core.js` / `04_collision.js` → 走 AGENTS.md §三 流程。
- 🔴 **Boss 召唤小怪**：`07_enemy.js` 当前未实现。
- 🔴 **技能沿蛇身铺开**：`08_skill.js` 当前仅落点生效，未沿蛇身延伸。
- 🔴 **满级后溢出转化**：成长系统未实现。

> 以上以《GDD v0.3》为准；落地前须在 `docs/plans/` 出 §四 计划并经你确认。

---

## §4 工程债

- 🔴 **render.js 硬编码护盾参数**：`11_render.js:94` 写死 `ORBIT_SEC=1.6, ORB_R=26`，未真正引用 `08_skill.js` 的 `SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS`（代码已注释"修改须同步"）。建议经 Registry 注入共享常量，消除双份真相源。
- ✅ **手动 .bak 备份**：已被 Git 取代（2026-07-11 落地时清理）。

---

## 还债顺序（呼应 AGENTS.md §七 / §十）

1. **§9 数值债**：实测 → 回写真理源 §9 → 同步 config.js → 登记 §9 Changelog。
2. **表现债**：~ 调参器试探 → 定稿 → 删 TODO 占位。
3. **设计债**：`docs/plans/` 出 §四 计划 → 你确认 → 落地 → CHANGELOG 登记。
