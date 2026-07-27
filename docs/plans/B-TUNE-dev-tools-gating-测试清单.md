# B-TUNE dev 工具门控测试清单

> 测试基线：本需求提交。浏览器手测时记录 commit、浏览器、设备、分辨率和是否移动端。

## Release 配置

配置：`CONFIG.DEBUG.enabled=false`、`CONFIG.DEBUG.editorEnabled=false`。

- [ ] 桌面：按 `~` 不出现 GM 面板。
- [ ] 移动端：系统按钮区不出现 `⚙ GM`。
- [ ] 控制台调用 `Registry.get('enemy').spawnDummy(1, 5000)` 返回 `0`，敌人列表不新增 dummy。
- [ ] 按 `L` 不出现 Profiler 面板。
- [ ] 按 `K` 不出现 SkillEcon 面板。

## 半开配置

配置：`CONFIG.DEBUG.enabled=true`、`CONFIG.DEBUG.editorEnabled=false`。

- [ ] 桌面：按 `~` 不出现 GM 面板。
- [ ] 移动端：系统按钮区不出现 `⚙ GM`。
- [ ] 控制台调用 `Registry.get('enemy').spawnDummy(1, 5000)` 返回 `0`。
- [ ] 按 `L` 可打开 Profiler 面板。
- [ ] 按 `K` 可打开 SkillEcon 面板。

## Dev 配置

配置：`CONFIG.DEBUG.enabled=true`、`CONFIG.DEBUG.editorEnabled=true`。

- [ ] 桌面：按 `~` 可打开/关闭 GM 面板。
- [ ] 移动端：系统按钮区出现 `⚙ GM`，点击可打开 GM 面板。
- [ ] GM 面板生成训练假人可用。
- [ ] 按 `L` 可打开 Profiler 面板。
- [ ] 按 `K` 可打开 SkillEcon 面板。

## 回归

- [ ] 桌面：开始游戏正常，暂停/继续正常。
- [ ] 桌面：拾取技能球、三选一、死亡重开正常。
- [ ] 移动端：开始游戏、摇杆、暂停/继续正常。
- [ ] 移动端：技能拾取、死亡重开正常。

## 工程检查

- [ ] `node --check snake55/*.js` 全部通过。
- [ ] `snake55/index.html` 15 个 `<script>` 的 `?v=` 完全一致。
- [ ] `git diff --name-only -- snake55/03_core.js snake55/04_collision.js` 无输出。

## Codex 自动化结果（2026-07-28）

- [x] Release desktop/mobile：`~`、`editor:toggle`、GM 面板、移动端 GM、训练假人、`L`、`K` 均不可用；`spawnDummy()` 返回 `0`，dummy 数不变。
- [x] 半开 desktop/mobile：GM 与训练假人不可用；Profiler/SkillEcon 可打开。
- [x] Dev desktop/mobile：GM 可打开，训练假人可生成，Profiler/SkillEcon 可打开。
- [x] 回归 smoke：开始游戏、暂停/继续、技能拾取、死亡状态、`Core.resetRun()` 重开状态恢复正常。
- [x] 工程：JS 语法检查通过，15 个脚本缓存戳一致，未触碰 core/collision。

仍建议用户手动复验：

- [ ] 真机移动端横屏下确认 `DEBUG.enabled=false` 时没有 `⚙ GM`。
- [ ] 真机/桌面按实际游玩路径确认死亡结算页按钮“再来一条蛇生”可点击重开。
