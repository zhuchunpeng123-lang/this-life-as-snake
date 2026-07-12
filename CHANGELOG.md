# CHANGELOG · 5.5 好玩基因融合版贪吃蛇

> 格式：日期 / 需求名 / 改动文件清单 / 一句话 / 是否动 §9 / 验收 ✅❌

---

## 2026-07-12 · feat(skill-geo): 技能沿蛇身判定+范围扩大(Commit B-2)

- **改动文件**：`02_config.js`（fire.radius `[60,75,90,108,128]`、ice.trailWidth `[30,40,48,60,75]`、新增 shield.orbitRadius `[44,58,72,86,100]`/orbitSec `1.6`、fire/ice.segStep `1`）、`08_skill.js`（tickFire/tickIce/tickShield 沿蛇身逐节判定、读 config、同帧去重；删写死 SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS）、`11_render.js`（drawSkillAura 沿蛇身绘制火墙/霜冻带+护盾读 config 公转；新增 drawDebugHitboxes 钩子承接 GM「显示碰撞盒」）、`03_core.js`（version 0.3-b7→0.3-b8）、数值真理源 §4.1/§4.2/§4.4/§9、docs/DEBT.md
- **一句话**：火/冰/护盾从"仅蛇头生效"升级为沿整条蛇身逐节判定（视觉=判定），并放大火半径/冰宽度、护盾环绕半径随等级扩大主动扫敌；消除渲染侧写死护盾参数的双份真相源
- **是否动 §9**：是（fire.radius / ice.trailWidth 放大 + 新增 shield.orbitRadius/orbitSec/fire·ice.segStep，均已回写 §4.1/§4.2/§4.4 与 §9 Changelog）
- **验收**：
  - [ ] 持火技能→整条蛇身拖出火墙，经过的小怪持续掉血（飘字 🔥）
  - [ ] 持冰技能→整条蛇身留霜冻带，小怪减速；Lv5 冻结 1s
  - [ ] 持护盾→球绕蛇头公转，半径随等级变大（Lv1~44px → Lv5~100px），碰到小怪掉血
  - [ ] 「显示碰撞盒」(GM)→绿圈=敌半径、红圈=蛇身/蛇头半径实时可见
  - [ ] 未碰：伤害公式 `Core.Formula.damage` / `04_collision.js` / `02_config.js` 数值结构
  - [ ] 🟡 fire/ice 初值为原值×1.5，待浏览器实测手感后回填 §9（已标注债务）

---

## 2026-07-12 · feat(editor): ~ 编辑器升级为 GM 测试面板(Commit B-GM)

- **改动文件**：`13_editor.js`（重写为分类 GM 面板：怪物/蛇/技能伤害 slider 自动从 CONFIG 生成、单 Combo 激活按钮、GM 指令、coreHp ±1、手动路径输入）、`08_skill.js`（暴露 `debugActivateCombo(id)` / `debugMaxAll()`）、本文件
- **一句话**：`~` 编辑器升级为可实战测试的 GM 面板——怪物 HP/速度/半径、蛇速/转向/节数、各技能逐等级伤害全部可滑；三个 Combo 各自按钮独立点亮；无限无敌/满级/清敌/碰撞盒开关即时生效；手动输入路径（config 重载 / `GS.` 即时）覆盖任意数值。仅为 dev 工具，不改任何 gameplay 默认值/公式
- **是否动 §9**：否（全部为 dev 调参/测试入口；config slider 走既有 override+重载机制，运行时指令走 `GS`/Registry，无数值结构变化）
- **碰撞盒可视化说明**：GM「显示碰撞盒」按钮写入运行时标志 `global.GMDBG.showHitboxes`，由 `11_render.js` 的 `drawDebugHitboxes` 绘制钩子实时呈现（已在 Commit B-2 一并落地：绿圈=敌半径、红圈=蛇身/蛇头半径）
- **验收**：
  - [ ] `~` 开关面板；怪物/蛇/技能分类清晰，slider 拖动后「保存并重载」生效（数值回写 localStorage `snake55_tuning`）
  - [ ] 怪物 HP/速度/半径、蛇速/转向/最大节数、飞镖/闪电/火/护盾逐等级伤害 slider 可拖动并保存
  - [ ] 三个 Combo 各自按钮：进入游戏后点击 → 对应横幅+音效亮起，不影响其余 Combo
  - [ ] 「立即满级」→ 五技能 Lv5 + Combo 检测触发；「无限无敌」→ 蛇头无敌光环常亮；「清空敌人」→ 场上怪清空
  - [ ] coreHp `+1/-1` 按钮即时改变心数显示
  - [ ] 手动输入 `GS.coreHp`/`GS.invincibleUntil` 即时生效；输入 `SKILL.fire.radius.2` 等路径加入覆盖（提示重载）
  - [ ] 未碰：伤害公式 / `02_config.js` 默认值 / `04_collision.js` / `03_core.js`
  - [x] 碰撞盒可视化已由 B-2 落地（`drawDebugHitboxes` + GM 按钮）

---

## 2026-07-12 · feat(skill-geo): 技能沿蛇身视觉对齐 + 伤害来源标签(Commit B-1)

- **改动文件**：`08_skill.js`（`hurt`/`hurtCombo` 加 `src` 形参并在 fire/bolt/lightning/shield/steam 调用点透传）、`07_enemy.js`（`applyDamage` 加 `src` 形参 + 三处 `enemy:hit` emit 带 `src`，燃烧 tick 标 `'burn'`）、`05_particle.js`（新增 `SRC_STYLE` 来源标签映射，`enemy:hit` 飘字按 `src` 加前缀+专属色）、本文件、`docs/DEBT.md`（§2 登 `SRC_STYLE` 表现债）
- **一句话**：伤害飘字标注来源+数值——`飞镖 -25`(青)/`闪电 -18`(紫)/`🔥DOT -4`(橙持续)/`🛡护盾 -14`(白金)/`💥蒸汽 -30`(暖橙)，一眼分清谁打了多少；冰无直伤不飘。纯表现层，只读现有伤害值与来源，不碰伤害计算
- **是否动 §9**：否（仅新增 `src` 透传形参与飘字前缀/色，`SRC_STYLE` 色板为表现债登记 DEBT §2；伤害数值、公式、命中判定均未变）
- **验收**：
  - [ ] bolt 命中飘 `飞镖 -N`（青）；lightning 链飘 `闪电 -N`（紫）
  - [ ] 火环/灼烧 DOT 飘 `🔥DOT -N`（橙，持续小字）；护盾接触飘 `🛡护盾 -N`（白金，DOT）
  - [ ] steam 爆炸飘 `💥蒸汽 -N`（暖橙）；暴击时金色优先、仍带来源前缀
  - [ ] 冰无直伤不飘伤害字（仅减速表现）
  - [ ] 伤害数值与改动前一致（未碰计算）；重开无残留/NaN
  - [ ] 未触碰：`02_config.js`/`04_collision.js`/`03_core.js`/`10_audio.js`

---

## 2026-07-11 · feat(skill-vfx): 技能视觉辨识+可读性大修(Commit A)

- **改动文件**：`07_enemy.js`（次：`DOT_TEXT_MIN` 10→4 + `enemy:hit` 透传 `isDot`）、`05_particle.js`（主：飞镖改飞行镖视觉 + DOT/即时飘字分色）、`11_render.js`（主：技能食物辉光/敌人燃烧·减速标记/无敌帧闪烁/受击红闪 vignette/火·冰·护盾光环增强/受击强震复用 `SHK.death`）、`12_ui.js`（次：combo 横幅 + 常驻配方提示 + 心碎闪烁）、`03_core.js`（仅 `version` 0.3-b6→0.3-b7，纯元数据）、`docs/DEBT.md`（§1 DOT_TEXT_MIN 值 + §2 新增表现债）、本文件
- **一句话**：五技能一眼可辨（飞镖=飞行镖 / 闪电=瞬时电弧 / 火=跳动火环 / 冰=霜冻 / 护盾=白金球+拖影）、DOT 持续小橙红飘字 + 敌人燃烧/减速可见、combo 横幅+配方提示、技能食物发光星标区分、受击红闪+心碎+无敌闪烁——纯表现层大修；沿蛇身几何/范围扩圈留给 Commit B
- **是否动 §9**：否（所有新值均为表现债，顶部 `🟡 TODO + 2候选`，登记 DEBT §2；`DOT_TEXT_MIN` 仅影响飘字聚合、不进伤害/命中判定）
- **§6 功能审计结论**：火焰 DOT（每帧 tick 掉血）、冰冻（真改 `slowT/slowPct` 移动）、护盾（轨道球接触 `hurt(isDot)`）三处逻辑**均存活**；本次只补视觉，零逻辑修复
- **验收**：
  - [ ] 五技能一眼可辨：飞镖=沿弹道飞行的发光镖+拖尾（伤害仍即时，玩法不变）；闪电=瞬时蓝白折线电弧连线、无飞行体；火=跳动橙红火环+火舌；冰=蓝白霜冻地带+霜点；护盾=白金发光球绕蛇转+拖影
  - [ ] DOT 有持续小橙红飘字（`DOT_TEXT_MIN`=4 更频繁）+ 敌人燃烧（红脉动环+火苗）/ 减速（蓝染环+冰晶）可见
  - [ ] combo 触发有横幅(~0.8s)+音效（audio 已挂）+ HUD 常驻配方提示（如「弹射 + 闪电 → 电磁炮台（已激活）」）；凑 combo 不再靠猜
  - [ ] 技能食物（发光呼吸+星标+头顶「!」）vs 普通食物（素色无光）一眼区分
  - [ ] 受击有全屏红闪 vignette + 心数💥碎裂 + 无敌帧蛇头闪烁（约 1s 可感）；强震复用 `SHK.death`，未新增魔法数字，3 心游戏不过猛
  - [ ] **⑥ 回验（关键）**：DOT（火环/护盾/灼烧）命中敌人**不闪白、不击退、不硬直**（仅掉血飘字）；bolt/lightning 即时命中**仍闪白+击退**——与 §9 combo 契约一致
  - [ ] 未触碰：`02_config.js`（gameplay 值）、`04_collision.js`、`08_skill.js`、`10_audio.js`；`03_core.js` 仅 version 字符串变更

---

## 2026-07-11 · fix(wave): 段③割草期补精英对齐真理源

- **改动文件**：`02_config.js`（仅 `STAGE.segments[2].pool` 加 `'elite'`）、`docs/《数值真理源》`（§9 段③补精英行）、`docs/DEBT.md`（§1 STAGE.pool 行）、本文件
- **一句话**：段③割草期（180–360s）敌群 pool 由 `['chaser','wanderer','charger']` 加 `'elite'`，对齐真理源 §6 段③「全类型+精英」
- **是否动 §9**：是（§9 2026-07-11「段③补精英」）
- **验收**：
  - [ ] 进入段③（游戏 180s 后）刷怪池出现 elite（紫大胖怪，HP 200）
  - [ ] 段④/段⑤ pool 不受影响（仍含 elite，符合预期）
  - [ ] `git diff --stat` 仅含上述 4 文件；`03_core.js` / `04_collision.js` / `08_skill.js` / `07_enemy.js` 无改动

---

## 2026-07-11 · fix(combo): 契约对齐-不叠effect+electro命中触发+DOT不刷硬直

- **改动文件**：`03_core.js`（新增 `Formula.comboDamage`）、`08_skill.js`（hurtCombo/doLightningChain/tickBolt/tickCombos 改造）、`02_config.js`（仅加 `COMBO.electroTurret.cooldownSec=0.5`）、`docs/《数值真理源》`（§4.6 steam 行 + §2.2 示例 + §9 契约修正行）、`docs/DEBT.md`（§1 COMBO_ELECTRO 行）、本文件
- **一句话**：三 Combo 统一「不叠 effect、保留暴击」口径（comboDamage）；steamExplosion 基础伤害 = 火焰当前等级 DOT/s ×2.5（冰只控不伤）；electroTurret 由周期触发改为「弹射子弹命中触发 + 全局冷却 0.5s」（连锁3、伤害×1.5、不叠 effect）；DOT 不刷硬直/闪白（07_enemy.applyDamage 早已 !isDot 门控，本 commit 仅核验、不改）
- **是否动 §9**：是（§4.6/§9 2026-07-11「Combo 契约修正」）
- **验收**：
  - [ ] 不叠 effect：fire+ice 时 steam 爆伤对长蛇不再随节数放大（同暴击下伤害与蛇长无关），暴击仍 ×1.8
  - [ ] steam 口径：火 Lv5（DOT 24/s）爆伤基础 = 24×2.5=60/跳；冰仅减速/冻结，无额外直伤
  - [ ] electro 命中触发：bolt+lightning 时连锁闪电只在弹射子弹命中敌人时出现（非每 2s 周期），连锁3跳、伤害×1.5、不叠 effect；高频弹幕下两次连锁间隔 ≥0.5s（核 `timer.electro`）
  - [ ] DOT 不刷硬直（须实跑）：火环/护盾/灼烧 DOT 命中敌人时**不闪白、不击退、不硬直**（仅掉血飘字），而 bolt/lightning 即时命中仍正常闪白击退；若仍刷白/击退，说明 applyDamage 未做 !isDot 门控，须补回本 commit
  - [ ] 未触碰：`git diff --stat` 仅含上述文件；`04_collision.js` / `07_enemy.js` / `02_config.js`（除 cooldownSec 外）无改动

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
