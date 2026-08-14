# Combat Feedback Grammar

Presentation Foundation v2 的战斗反馈语法。它只管理表现，不改变伤害、DOT、暴击、冷却、半径、AI、掉落或波次。

## T0–T4

| Tier | Role | 保留策略 | 文字规则 |
| --- | --- | --- | --- |
| T0 | `dot` / 连续状态 | 高密度下最先丢弃 | 小、短、安静；只显示聚合数值与可选元素 accent。 |
| T1 | `normal` | 可让位给 T2–T4 | 默认只显示数值；不得带技能名、长来源标签或 Emoji。 |
| T2 | `crit` | 优先于 T0/T1 | 提升字重、字号和描边，仍低于 Combo 与玩家危险。 |
| T3 | `combo` / major kill | 高密度下保留 | 可拥有更长生命周期与强调，但不重做单技能身份。 |
| T4 | `playerHurt` / player danger | 最高 | 与玩家输出明确区分；低层反馈不得覆盖。 |

`status` 是 T0 的状态提示 role：常态由稳定头顶图标表达，正式玩法不重复刷文字；仅 `debugSourceLabels=true` 时可显示调试文本。

## Token 与 resolver

唯一运行时入口是 `05_particle.js` 的 `resolveCombatText()` / `emitCombatText()`，token 位于 `CONFIG.STYLE.combatFx.text.tiers`。每个 role 集中定义：字号、字重、填充、描边、生命周期、上移速度和优先级。

元素与技能来源只能提供轻度 `accent`；VFX Skill 负责 projectile、beam、deploy、impact 等视觉 presentation identity。Audio 的事件 ownership、专属声音边界、密度与生命周期由 `docs/audio/AUDIO.md` 和 Audio Skill 管理。它们不能决定通用文字字号、通用暴击样式或文本优先级。

## 信息 ownership

- Combat text：`05_particle.js` resolver。
- DOT 聚合与伤害语义：`07_enemy.js` 的 `dotMap` 与 `enemy:hit` 事件；不在 Presentation 层重算伤害。
- 普通怪 HP 条：`11_render.js`，`combatFx.hpBar` 的 `recent-hit` policy；`lastVisualHitSec` 仅是表现时钟。
- 精英：受伤后持续显示；GM dummy：始终显示；Boss：继续使用既有专属 UI。
- Burn / slow：`11_render.js` 的稳定头顶 marker；冰减速文字只允许作为 debug 信息。
- Hit / death burst、屏震、音频：各自既有 Bus listener。专属 impact 已存在时，不叠加同权重 generic impact。

## 新技能接入契约

Gameplay / Skill 侧只提供 `source id`、`damage`、`isDot`、`isCrit` 与必要 target/event metadata，并通过既有 `enemy:hit` 事件进入。Presentation resolver 负责 role、文本、tier、priority、accent 和生命周期。

新技能不得自行拼接“技能名 + 数字”、添加 Emoji、发明通用 Crit 样式、绕过文本优先级、另建通用 HP 条或对刷新的持续 Debuff 反复发文本。

## Debug 与验收

`CONFIG.STYLE.combatFx.text.debugSourceLabels` 默认 `false`。开启后仅用于诊断来源信息，不能改变正式玩法表现。静态验收须确认 resolver 与全部 required tokens 存在；运行时视觉验收由后续人工 Art Pass 完成。
