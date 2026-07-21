# CHANGELOG · 5.5 好玩基因融合版贪吃蛇

> 格式：日期 / 需求名 / 改动文件清单 / 一句话 / 是否动 §9 / 验收 ✅❌

---



## 2026-07-21 · perf(view): 视图缩放恢复 + 相机跟随修复 + profiler 可见敌数反算 worldScale

- **改动文件**：`15_profiler.js`（新增：自动性能日志，profiler 可见敌数反算 `worldScale` + 帧性能观测字段 external gap）、`11_render.js`（相机跟随修复 + `worldScale` 反算 + 视图缩放恢复）、`index.html`（挂 `15_profiler.js`）、`02_config.js`、`05_particle.js`、`08_skill.js`、`12_ui.js`、`13_editor.js`、`14_main.js`（fixed-step 主循环帧观测）、`docs/plans/*.md`（新增 6 份诊断/清理计划）
- **一句话**：恢复被 round5 误回滚的视图缩放；修正相机跟随；新增 `15_profiler.js` 自动性能日志，profiler 可见敌数反算 `worldScale`，明确区分"实体缩放(worldScale)"与"填充率(maxBackW)"（呼应 RETRO §7）
- **是否动 §9**：否（视图/观测层，无平衡数值）
- **验收**：
  - 视图缩放恢复，蛇身/敌人大小随 `worldScale` 变化且相机跟随正确不漂移
  - `15_profiler.js` 自动记录 FPS/敌数/`worldScale`，无需手动测量脚本
  - 未动 `03_core.js`/`04_collision.js`；`02_config.js` 仅挂接、不改动数值结构

---

## 2026-07-17 · perf(b9) 收口 + 玩法补充（6 提交）

- **改动文件**：`08_skill.js`（闪电内圈死区 bc01a11 + 每帧敌列快照 b6b380d + 收脚手架 270056d）、`09_wave.js`（补给危险偏向 0a5d871）、`07_enemy.js`/`11_render.js`/`12_ui.js`/`14_main.js`（测试基建 897d92b：暂停/等比缩放/指针反算/假人前置）、`11_render.js`/`02_config.js`（屏震四档映射 e5d3f7f）、`13_editor.js`/`05_particle.js`/`02_config.js`（收 b9 脚手架 270056d，dev 门控 + 删 auto-log）
- **一句话**：b9 性能专项收口——①闪电内圈死区（跳过蛇头火环半径内索敌，省无效链）；②每帧敌列快照消除重复 `allEnemies` 分配（零行为变化）；③屏震四档统一 `addTrauma`（删 `addShake`，补精英死/Boss 击败/蒸汽齐爆阈值 4）；④补给危险偏向（回血球刷敌群附近，制造贪心抉择）；⑤测试基建（暂停/缩放/指针反算/假人前置）；⑥收起 b9 诊断脚手架
- **是否动 §9**：是（屏震四档阈值、补给危险偏向相关数值已回写 §9；其余纯工程）
- **验收**：
  - 闪电不再对火环内敌人无效索敌；敌列每帧只算一次（快照），行为无变化
  - 屏震四档统一经 `addTrauma`；精英死/Boss 击败/蒸汽齐爆(≥4) 有震
  - 回血球出现在敌群附近而非安全区；dev 下可见诊断、release 无 auto-log
  - 未动 `03_core.js`/`04_collision.js` 行为；`02_config.js` 仅新增 b9 门控与少量数值

---

## 2026-07-15 · perf(b9) 三连：VFX 硬上限 + 小怪血条去 fillText + ⑥冰冻重做

- **改动文件**：`02_config.js`/`05_particle.js`（VFX 硬上限 937a87e：粒子/飘字活跃上限 + 每帧 spawn 预算 + 优先级门控覆盖所有池写入含 steamblast 直推；保死亡爆/伤害字）、`11_render.js`（小怪血条去 fillText 016d2b3：纯 rect + 仅 hp<maxHp 且视口内才画 + 数字仅 elite/Boss；HUD 拆显 粒/字 计数与上限）、`05_particle.js`/`08_skill.js`/`13_editor.js` + 数值真理源（⑥冰冻重做 5777395：CD 自动索敌冰池 + 蒸汽齐爆同帧上限 `steamBurstCapPerFrame` 仅门控视觉 Bus.emit 伤害始终结算 + 屏震分档节流 T1 + 优先级细化 + 冰调参滑块；数值回写 §9）
- **一句话**：b9 性能三连——①VFX 输出硬上限（优先级保死亡爆/伤害字，低优飘字先丢）；②小怪血条去 `fillText` 数字（纯 rect，仅 elite/Boss 显数字）；③⑥冰冻重做：trail→CD 自动索敌冰池 + 蒸汽齐爆同帧上限（只控视觉 emit，伤害恒结算）+ 屏震分档 + 冰调参滑块，数值回写 §9
- **是否动 §9**：是（VFX 硬上限数、冰 CD/索敌、蒸汽齐爆上限、屏震档位、冰调参滑块均回写 §9）
- **验收**：
  - 满屏粒子/飘字不超硬上限；死亡爆/伤害字优先保留，低优飘字超限被丢
  - 小怪血条无数字纯色条、仅受伤且在视口内画；elite/Boss 才显数字
  - ⑥ 冰冻：CD 自动索敌冰池生效；蒸汽齐爆同帧上限只控视觉、伤害不漏结算
  - 未动 `03_core.js`/`04_collision.js`；`02_config.js` 数值结构仅扩展（b9 上限 + 冰字段）

---

## 2026-07-14 · ④蒸汽状态引爆 + B-4 收尾建账 + 文档地图修正 + 真理源重命名

- **改动文件**：`07_enemy.js`/`08_skill.js`（④蒸汽状态引爆 13c2e53：火墙扫到带冰敌 `e.slowT>0` 按敌 2.0s 冷却在该敌位置引爆蒸汽 AOE；移除全局 `timer.steam`；零新数值、不碰 core/collision/config/闪电；用户浏览器实测绿）、`CHANGELOG.md`/`docs/DEBT.md`/`05_particle.js`/`07_enemy.js`/`08_skill.js`/`11_render.js`/`13_editor.js`（B-4 收尾 e72f884：VFX 区分 + DOT 分源 + 电磁/闪电演出增强 + P1/P2 修复——即 07-13 CHANGELOG 已登记的 B-4 条目，此处仅补全建账不重复）、`AGENTS.md`/`docs/workflow.md`（文档地图路径修正 01a8e1b：根《GDD/数值真理源》→ `docs/`）、`03_core.js`（version 0.3-b9→0.3-b11，991e5ac）、数值真理源镜像文件重命名（49eb69c：前缀「数值真理源」→「此生为蛇」，hash 后缀不变）
- **一句话**：④蒸汽状态引爆落地（火墙扫冰敌引爆蒸汽 AOE，实测绿）；B-4 收尾建账（与 07-13 CHANGELOG 已登记条目同源不重复）；文档地图路径修正；version bump；数值真理源文件重命名
- **是否动 §9**：④ 否（零新数值，无需 §9 回写——早期计划"待 Notion 回写触发口径"预判已证伪）；其余为文档/版本/路径，不涉及平衡数值
- **验收**：
  - ④：火墙扫过被冰缓/冻的敌人时，按敌 2.0s 冷却在该敌位置引爆蒸汽 AOE；无全局 timer
  - ④：零新数值、未碰 `03_core.js`/`04_collision.js`；用户浏览器实测已绿
  - 文档地图路径修正生效（AGENTS 指向 `docs/` 下文件）；真理源重命名后链接可达
  - `03_core.js` 仅 version 字符串变更

---

## 2026-07-13 · feat(combo-vfx): combo视觉可见性+GM单combo预览+视觉身份统一(Commit B-4)

- **改动文件**：`05_particle.js`（主：新增 `flashCores` 叠加闪核池 + `spawnFlashCore` + `drawOverlay`（绘于实体之上）；`fx:steamblast` 加实心白闪核+提亮蒸汽云+浅蓝冰晶碎屑；`fx:electroarc` 加蛇头紫辉光+节点放射紫电芒爆；`fx:burndart` 命中处加大加亮橙焰爆点；`SRC_STYLE` 修正：基础闪电 `lightning` 色板由紫 #c9a8ff 改蓝白 #9fd0ff（对齐 `fx:lightning` 电链色 LIGHTNING_COLOR），新增 `electro` 紫 #c9a8ff 独立来源标识（B-4 验收①a））、`11_render.js`（draw 实体绘制后调 `Particle.drawOverlay` 叠加闪核层）、`13_editor.js`（新增「单 Combo 视觉预览」分区：每 combo 一按钮，`previewCombo` 直接 `Bus.emit` 对应 fx: 事件+蛇头附近 `spawnDummy` 供链/镖瞄准，完全绕过 gameplay/冷却/敌人条件；`spawnDummiesNearHead` 排布 dummy）、`08_skill.js`（次：三 combo VFX 事件改名发射方联动——`fx:bolt→fx:burndart` / `fx:lightning→fx:electroarc` / `fx:blast→fx:steamblast`；`doLightningChain` 新增 `vfxEvent`/`srcTag` 形参，电磁连锁伤害走独立 `src='electro'` 来源标识，纯表现零 gameplay）、`03_core.js`（version 0.3-b10→0.3-b11）
- **备注（B-4 验收①自查补完）**：①a 原电磁连锁写死 `src='lightning'`、与基础闪电压色冲突；已补独立 `src='electro'` + `SRC_STYLE.electro` 紫飘字（`05_particle.js`/`08_skill.js`），基础闪电色板同步改蓝白对齐 VFX；①b 灼烧点火演出 VFX 本已具备（橙焰爆点 `fx:burndart` + 敌身红橙火环 `drawBurnMark`）；**但像素级质检发现**引燃飘字 `🔥DOT ` 橙前缀实际未出现——`07_enemy.js:242` 燃烧 DOT 调 `applyDamage(e, e.burnDps*dt, false, true)` **漏传第5参 `src`**，致 `dotSrc` 不写、`SRC_STYLE.burn` 成死配置，引燃只飘 `-N`；已补 `src='burn'` 透传（`07_enemy.js`，纯标签零 gameplay），现引燃正常带「🔥灼烧 -N」橙飘字；①c 三 combo 颜色/图标/飘字各异——**二次补完**：实测发现灼烧 combo 的 bolt 伤害写死 `src='bolt'`（飘 `飞镖 `）从未带"灼烧"名、且电磁 combo 名仅挂在连锁上（bolt 本身飘 `飞镖 `，易误认）；现 `tickBolt` 按激活 combo 改写 bolt 命中 `src`（`burningBarrage→'burning'` 橙 / 纯 `electroTurret→'electro'` 紫 / 无 combo→`'bolt'` 青），`SRC_STYLE.burning` 橙标新增，连锁仍独立 `electro`，三 combo 伤害飘字现均带各自名字且零 gameplay。**DOT 分源分离（B-4 衍生·用户实测要求）**：`07_enemy.js` DOT 累加器由单值 `dotAccum/dotSrc` 改为按来源字典 `dotMap[src]`，火墙与灼烧引燃各自独立数字+独立标签（`SRC_STYLE.fire`→`🔥火墙 ` 橙 `#ff9a3c` / `SRC_STYLE.burn`→`🔥灼烧 ` 红橙 `#ff5a2c`），不再混为同一数字；死亡时各来源残留 DOT 分别 flush、对象池复用 `dotMap={}` 防串味；零 gameplay（未动伤害/公式/判定）。**电磁/闪电演出区分增强（B-4 ①·用户实测未过项·并入 B-4 不单开）**：用户实测"⚡电磁 vs 基础闪电只差颜色、且都太快留不住眼"→ 未过 ①"一眼区分"。现改 `fx:electroarc` 拉开**三维度**：①粗弧（电链 `ELECTRO_W_PX=5` vs 基础 `LIGHTNING_W_PX=2`）；②节点多分叉放射紫电芒（`ELECTRO_BRANCH_N=8`，基础无分叉）；③命中点紫色残留辉光 `spawnFlashCore` `ELECTRO_BRANCH_LIFE=0.2s` afterglow + 电链存活更久 `ELECTRO_LIFE=0.34s`（基础无残留、仅 0.22s）。基础闪电 `fx:lightning` **零改动**（保持细/快/蓝白/单链/无残留，靠简洁对比）。新增常量 `ELECTRO_W_PX/ELECTRO_LIFE/ELECTRO_JAG/ELECTRO_BRANCH_N/ELECTRO_BRANCH_LIFE/ELECTRO_GLOW_R` 集中管理（`05_particle.js` 顶部 TODO 块，不动 §9、纯表现）。零 gameplay（不碰伤害/连锁/射程/冷却/触发判定；不动灼烧/蒸汽）；事件名仍全小写过 Bus 断言。**P1/P2 修复（用户实测反馈·并入 B-4 不单开）**：实测暴露两个关联问题——①用户实测"电磁 combo 下飞镖伤害全显示成⚡电磁、飞镖标签消失"：根因 P1 曾写 `electroTurret→'electro'` 把每次飞镖命中伤害误贴「电磁」掩盖真连锁；已删该分支，飞镖命中归位 `src='bolt'` 青「飞镖」（`burningBarrage→'burning'` 橙保留），电磁标签只留给连锁 `doLightningChain(src='electro')`，两笔各显其名。②用户实测"电磁很久不触发、只触发过几次"：根因 `timer.electro -= dt` 写在 `tickBolt` 的 `return` **之后**，仅在 bolt 开火帧推进一个 dt（~0.016s），`cooldownSec=0.5s` 实际需约 15s 才凑满——属 combo 契约修正遗留 bug（非本次 VFX 引入）；已按方案 A 将 `timer.electro -= dt` 移至 `return` **前**（每帧推进），恢复真源 §4.6 冻结的 `cooldownSec=0.5s` 真正生效，**不改 `cooldownSec` 值本身、不回写真源（bug 修复非数值改动）**；粗弧"一闪而过"主因即触发太少，触发正常后已看得清。电磁 DPS 是否过强本轮只记手感、不调数值（留 ③，若偏强下轮按 §七 回写 `cooldownSec`/`damageMul`）。
- **一句话**：B-4 解决 B-3 三 combo 视觉"看不见/无法独立预览"——①GM 单 combo 预览按钮（脱离实战，直接发 fx 事件+就近造假人）让用户随时单独看每个 combo VFX；②三 combo VFX 加粗加区分：蒸汽=白闪核+蒸汽云+冰晶碎屑、电磁=紫电链+节点放射电芒+蛇头紫辉光、灼烧=橙燃烧镖+大橙焰爆点；③闪核绘于实体之上不被盖；④视觉身份对齐（飞镖白黄/闪电蓝白/火橙/冰蓝/护盾白金/蒸汽白+暖橙/电磁紫/灼烧橙红，combo 比母技能更大更亮更炸、颜色不撞、命中标记贴怪身）；⑤burn 区分走方案 A（飘字不动，靠敌身橙色灼烧环 drawBurnMark 作唯一标识）
- **是否动 §9**：否（纯表现层零 gameplay 改动：未动伤害/冷却/连锁/半径/coreHp/射速/触发判定；新颜色为 inline 字面量，与文件顶部 TODO 块风格一致，登 DEBT §2）
- **验收**：
  - [ ] GM「单 Combo 视觉预览」三按钮：分别只看到 蒸汽白爆云 / 紫电链+节点电芒+蛇头紫辉光 / 橙燃烧镖+敌身火环，**无需敌人、无需 playing 态**
  - [ ] 实战：steam 爆明显（白闪核+冰晶）；electro 命中冒紫电链+节点电芒；burn 镖橙+敌身橙色灼烧环（drawBurnMark）
  - [ ] 三者与基础 bolt(白黄)/lightning(蓝白 #9fd0ff) 一眼区分；电磁紫 #c9a8ff ≠ 基础闪电蓝白 #9fd0ff
  - [ ] 未改任何数值：伤害/冷却/连锁/effect/半径/coreHp/射速/触发判定全不变；`02_config.js` 数值结构未动
  - [ ] 重开无 NaN；新事件名全小写（重申 Bus 断言 `/^[a-z0-9]+:[a-z0-9_]+$/`）；粒子全走对象池无运行时 new；60fps 不掉（闪核池 32、beams 复用）
  - [ ] 反向：基础闪电链仍是蓝白、未变紫；steam 半径/伤害/冷却不动；burn DOT 飘字色不变（方案 A，仅靠敌身火环标识）

---

## 2026-07-13 · feat(skill-geo): 冰冻真轨迹化+护盾贴头点防+冰冻减速反馈(Commit B-2)

- **改动文件**：`02_config.js`（fire.radius `[60,75,90,108,128]`、ice.trailWidth `[30,40,48,60,75]`、新增 shield.orbitRadius `[44,58,72,86,100]`/orbitSec `1.6`、fire/ice.segStep `1`、ice.lingerSec `[2.0,2.5,3.0,3.5,4.0]`、ice.slowLingerSec `0.4`）、`08_skill.js`（tickFire/tickIce/tickShield 沿蛇身逐节判定、读 config、同帧去重；删写死 SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS；tickIce 真轨迹化冰区沿蛇身落点铺霜冻带（视觉=判定）、L5 冻结用 `lv5FreezeSec`；新增 `fx:iceslow` 事件做减速飘字反馈；暴露 `debugSetSkill(id,lv)`/`debugActivateCombo`/`debugMaxAll`；RT() 实时桥接 tickFire/tickIce/tickShield + `drawSkillAura` 经 `RTA` 读覆盖层）、`05_particle.js`（`Bus.on('fx:iceslow')` 减速飘字）、`07_enemy.js`（spawnDummy 训练假人 isDummy/baseSpeed=0/die() 回满血不秒/countMobs 排除；applyDamage 透传 src/isDot）、`11_render.js`（drawSkillAura 沿蛇身绘制火墙/霜冻带+护盾读 config 公转；新增 GM「显示碰撞盒」`drawDebugHitboxes`）、`09_wave.js`（GS.tuningSandbox 守卫 Pickup.update 与 enemy:die 掉落，沙盒停刷）、`13_editor.js`（GM 面板系统梳理：实时标定滑条/标定沙盒/单技能精确激活/生成假人；冰系手感收口「实时标定（手感沙盒）」、去重入口、滑条回显修复）、`03_core.js`（version 0.3-b8→0.3-b9）、数值真理源 §4.1/§4.2/§4.4/§9、docs/DEBT.md
- **一句话**：B-2 整体提交——①冰冻真轨迹化：冰区沿整条蛇身落点铺霜冻带（视觉=判定，蛇尾经过处也有冰）；②护盾贴头点防：护盾环绕半径 `orbitRadius`(44→100) 刚好头外侧点防，不压火墙/不扩全身；③冰冻减速反馈：敌人入冰区发 `fx:iceslow` 飘「减速」字+蓝染减速环（L1–4 短窗 `slowLingerSec` 离场约 0.4s 恢复，L5 冻结约 1s）；④GM 实时标定滑条/沙盒/训练假人（`rtTuning` 运行时即时生效免重载）+ 单技能精确激活 `debugSetSkill` / 生成假人 `spawnDummy` 恢复；⑤回归修复：`fx:iceSlow` 大写被 `Bus` 断言拒收致 `05_particle` 加载崩溃（全特效/伤害数字消失）→ 收发统一全小写 `fx:iceslow`
- **是否动 §9**：是（fire.radius/ice.trailWidth 放大 + 新增 shield.orbitRadius/orbitSec/fire·ice.segStep/ice.lingerSec/ice.slowLingerSec，均已回写 §4.1/§4.2/§4.4 与 §9 Changelog）
- **验收**：
  - [ ] 持冰技能→整条蛇身留霜冻真轨迹，蛇尾经过处也有冰带（非仅蛇头）
  - [ ] 护盾球绕蛇头公转，半径随等级变大（Lv1~44px→Lv5~100px），落点恰头外侧点防，不压火墙/不扩全身
  - [ ] 敌人入冰区→飘「减速」字（`fx:iceslow` 触发）+ 蓝染减速环；离开约 0.4s 恢复；Lv5 冻结约 1s（僵直+冰晶）
  - [ ] GM 实时标定：拖 fire.radius L3 火墙即时胀缩、拖 ice.trailWidth 霜带即时变宽、拖 减速跟随窗s 减速残留时长即时变；显示「当前/默认」；「复位本组默认」弹回
  - [ ] 标定沙盒：开→停刷食物/技能球；「单技能精确激活」选 ice→其余清空只冰生效
  - [ ] 生成假人(1/5000)→黄色假人站着挨打：DOT 逐跳飘字、减速环、护盾扫敌可见，假人掉血不消失（die 回满）；蛇头蹭假人不掉心
  - [ ] 「显示碰撞盒」(GM)→绿圈=敌半径、红圈=蛇身/蛇头半径实时可见
  - [ ] 未碰：伤害公式 `Core.Formula.damage` / `04_collision.js` / `02_config.js` 数值结构（`SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS` 本地常量已删，渲染侧双份真相源已消）
  - [ ] 🟡 fire/ice 初值×1.5、ice.lingerSec/slowLingerSec/orbitRadius 等初值，待浏览器实测手感回填 §9（已登 DEBT §1）
  - [ ] 回归验证：`fx:iceSlow`→`fx:iceslow` 后 05_particle 正常注册、所有技能特效/伤害数字恢复；Node 沙盒加载全模块确认 particle 注册、`fx:iceslow` 进入触发一次飘字正常

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
