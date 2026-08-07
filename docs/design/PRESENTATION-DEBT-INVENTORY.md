# Presentation Debt Inventory

静态审计日期：2026-08-08。只记录高价值遗留项；不以清零债务为理由扩大本次范围。

## Fix Tonight

- 已完成：统一 combat text tokens、T0–T4 resolver、DOT 降级优先级、普通怪 recent-hit HP bar、状态文字去重开关与静态护栏。

## Human Art Pass

- 确认最终字体族、描边视觉、元素 accent 强度和 Crit/Combo 的最终视觉差异。
- 观察 fire / ice / shield / steam 的最终美术方向；本 Goal 仅完成程序 VFX 收束，不替换最终 PNG/WebP。
- 检查新旧 PNG 的 Alpha BBox、optical center、anchor 和实际战场尺寸。
- 对 HUD skin 替换做桌面与移动端人工几何复标；本次不改任何 HUD 坐标。
- 由人工观看后决定 burn/slow marker 的最终形态和层级。

## Gameplay Balance Later

- DOT 聚合阈值、伤害数字频率和任何伤害/冷却/半径/敌人属性仅能在独立平衡流程中处理。
- 任何火焰、冰霜、护盾或蒸汽的伤害、CD、半径、命中规则与经济调整，须由后续独立平衡验收决定。

## Audio Listening Later

- 火焰持续、冰锥落地、护盾接触与蒸汽爆发的听觉节奏需人工戴耳机确认；本 Goal 未改 BGM 或音频资产。

## Architecture / Risk

- `03_core.js`、`04_collision.js` 的 Bus、对象池与伤害管线保持冻结；若未来需要改变事件结构，须按 AGENTS.md 高风险流程。
- `08_skill.js`、`10_audio.js` 仍是当前 WIP / 收敛区；本次仅记录 ownership，不改动。
