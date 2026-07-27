# B-TUNE dev 工具门控计划

## 目标

发布配置下彻底关闭 GM 面板、训练假人、Profiler、SkillEcon 等 dev-only 入口；开发配置下保持原调试能力。

## 涉及文件及理由

- `snake55/13_editor.js`：GM 面板、`~` 键、`editor:toggle` 的核心入口。
- `snake55/12_ui.js`：移动端 `⚙ GM` 按钮入口。
- `snake55/07_enemy.js`：训练假人公开方法 `spawnDummy`。
- `snake55/15_profiler.js`：`L` 性能面板。
- `snake55/16_skill_econ.js`：`K` 技能经济面板。
- `snake55/index.html`：任意 JS 修改后必须统一 bump `?v=` 缓存戳。
- `docs/DEBT.md`、`docs/PROJECT-STATUS.md`、`docs/plans/STATUS.md`：更新当前状态。

## 具体改动点

- GM、`~`、移动端 GM、`editor:toggle`、训练假人使用两级门控：`CONFIG.DEBUG.enabled && CONFIG.DEBUG.editorEnabled`。
- Profiler、SkillEcon 使用一级门控：`CONFIG.DEBUG.enabled`。
- 发布配置下不创建 GM UI、不注册 dev 快捷键、不注册有效 `editor:toggle`。
- `spawnDummy` 在门控关闭时直接返回 `0`，不创建对象、不改变状态、不抛错。
- 本次不新增 DEBUG 字段，不改调参功能，不改 gameplay。

## 不动的底层

- 不动 `03_core.js`。
- 不动 `04_collision.js`。
- 不改数值、伤害、碰撞、波次或技能逻辑。

## 验收标准

- Release：`DEBUG.enabled=false`、`editorEnabled=false` 时，`~`、移动端 GM、训练假人、`L`、`K` 全部不可用。
- 半开：`DEBUG.enabled=true`、`editorEnabled=false` 时，Profiler/SkillEcon 可用，GM 与训练假人不可用。
- Dev：`DEBUG.enabled=true`、`editorEnabled=true` 时，GM、假人、Profiler、SkillEcon 保持原行为。
- 回归：桌面/移动端开始游戏、暂停继续、技能拾取、死亡重开正常。
- 工程：所有 JS 语法检查通过，`index.html` 15 个脚本缓存戳完全一致。
