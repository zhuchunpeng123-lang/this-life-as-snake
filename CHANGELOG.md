# CHANGELOG · 5.5 好玩基因融合版贪吃蛇

> 格式：日期 / 需求名 / 改动文件清单 / 一句话 / 是否动 §9 / 验收 ✅❌

---

## 2026-07-11 · 地基落地：Git + 文档体系 + 清理 .bak

- **改动文件**：新增 `docs/DEBT.md`、`docs/workflow.md`、`docs/plans/`、`docs/.gitignore`；更新 `CHANGELOG.md`（版本回滚改 Git）、`AGENTS.md`（文档地图）；删除 4 个 `*.bak-20250710.js`
- **一句话**：建立"长期记忆"地基——Git 版本管理 + 文档台账（债/流程），并清理冗余手动备份
- **是否动 §9**：否（纯工程/文档，无 gameplay 数值）
- **验收**：
  - [ ] `git log --oneline` 可见 baseline + 清理 .bak 两次提交
  - [ ] `docs/DEBT.md` 列出真实 TODO/🟡 占位（§9/表现/设计/工程四类债）
  - [ ] `docs/workflow.md` 含多窗口/调参沙盘/回滚/上云四节
  - [ ] 回滚测试通过：故意改→commit→`git revert`→历史完整
  - [ ] `03_core.js` / `04_collision.js` / `02_config.js` 未被改动
  - [ ] 4 个 `.bak` 已从工作区删除，内容保留在 baseline commit 可恢复

---

## 2025-07-10 · 需求 A：鼠标绝对瞄准

- **改动文件**：`14_main.js`（唯一）
- **一句话**：鼠标输入从「相对摇杆」改为「绝对瞄准」——光标换算世界坐标 + `CONFIG.PLAYER.deadZoneRadius=12` 死区 + 免按住 `pointermove` 常驻更新；键盘 WASD 不变
- **是否动 §9**：否（纯输入/工程，无平衡数值）
- **验收**：
  - [ ] 光标绕蛇头转一圈，蛇平滑 360° 无反向
  - [ ] 光标快速划过蛇头，不 180° 抽搐
  - [ ] 蛇贴世界边界时瞄准仍准确（camera 反算验证）
  - [ ] 不按住鼠标也能持续转向；键盘 WASD 仍可用
  - [ ] `03_core.js` / `04_collision.js` / `02_config.js` 未被触碰

---

## 2025-07-10 · editor 解锁 Combo 测试按钮

- **改动文件**：`13_editor.js`（唯一）
- **一句话**：调参面板（~ 键）新增「🔓 解锁全部 Combo（测试）」按钮，一键点亮 fire/ice/bolt/lightning + 触发 combo 检测
- **是否动 §9**：否（调试工具，无 gameplay 影响）
- **验收**：✅ Console 命令已通过；按钮见 editor 界面

---

## 2026-07-11 · 需求 B：技能视效可见化

- **改动文件**：`05_particle.js`（主）、`08_skill.js`（次，仅 steamExplosion 补 `fx:blast`）、`docs/DEBT.md`（§2 表现债更新）
- **一句话**：技能本体从「稀疏小点」升级为可见光束/电链/爆环——`fx:bolt` 白黄发光直线弹道、`fx:lightning` 蓝白折线电链、`fx:blast` 暖橙扩张爆环；外发光用廉价双描边（避免 `shadowBlur` 拖帧）；新图元画在 `Particle.drawWorld`（核心实体之下），零改 `11_render.js`
- **是否动 §9**：否（颜色/线宽/存活/抖动/爆点数均为表现债，顶部 `🟡 TODO + 2候选`，登记 DEBT §2；`CO.steamExplosion.radius` 直接复用，未动数值结构）
- **注**：本 commit 因会话前已 `git add` 暂存状态，附带含 2 个 GDD 文档重命名（纯文档改名、无害），非需求B 代码改动，不另拆 commit（依 AGENTS §八 计划外不动）
- **验收**：
  - [ ] 取得 bolt 后发射瞬间可见一条白黄发光直线弹道（非单点）
  - [ ] 取得 lightning（及其 combo electroTurret）后，可见沿敌人节点的蓝白连贯电链
  - [ ] 取得 fire+ice combo 后，蛇头周期（约 2s）出现可见暖橙扩张爆环（爆心对准真实 AOE 中心）
  - [ ] 火环/护盾球/冰痕 auras 仍在且未被新视效盖住（核心实体始终画在 beam/blast 之上）
  - [ ] 技能齐发时左上角 FPS HUD 保持绿档（≥55），且长时间游玩无 beam/blast 对象泄漏（走池回收）
  - [ ] 反向：`core:run_reset`（重开/菜单）后 beams/blasts 被 `clear()`，不残留、无 NaN

---

## 2025-07-10 · P1-② electroTurret + burningBarrage（追溯登记）

- **改动文件**：`07_enemy.js`、`08_skill.js`
- **一句话**：Combo 系统——燃烧弹幕（fire+bolt 飞镖点燃）+ 电磁炮台（bolt+lightning 链式电击）落地点灯
- **是否动 §9**：否（Combo 系统走真理源已登记字段 `CONFIG.COMBO.burningBarrage.*`、`CONFIG.COMBO.electroTurret.*`）
- **验收**：✅ Console 测试命令通过（`Registry.get('skill').pick('ice')` 触发 checkCombos 点亮 electroTurret + burningBarrage）

---

## 版本回滚（Git，本地优先）

- 本仓库已 `git init`，每次落地一个 commit，可精确回滚任意版本。
- 看历史：`git log --oneline`
- 撤单文件：`git checkout <hash> -- snake55/xx.js`
- 整体回退（保历史）：`git revert <hash>`
- 旧的 `.bak-YYYYMMDD.js` 手动备份机制已废弃并清理（2026-07-11）；Git 历史取代之。
- 推送到 Git 网站见 docs/workflow.md §4（需你建仓库 + 提供凭据）。
