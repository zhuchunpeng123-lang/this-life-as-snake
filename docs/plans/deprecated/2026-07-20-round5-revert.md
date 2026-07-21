# 第五轮 · 回滚越界改动 + 修复 FPS 回归（待确认）

> 日期：2026-07-20
> 上下文：第三轮 FPS 已稳 150+（用户首条日志）；第四轮加 `spawnFireEmbers` + 删蛇头火舌后，用户实测 FPS 30+ 反复掉帧、且"飞镖效果变了"。
> 本轮不动第三轮已验证良性的部分，只回滚越界/回归改动。

## 1. 目标一句话
恢复原始画面大小与飞镖手感，消除 FPS 30+ 反复掉帧，退回"第三轮稳定高帧"基线；只动渲染/系统层，不碰 core/collision/§9/伤害管线。

## 2. 根因（相对 HEAD 逐文件核对结论）
- **飞镖效果变了 / 画面变小**：第二轮引入 `viewZoom=0.8`（`11_render.js:295` `ctx.scale(viewZoom,viewZoom)`），整世界缩小 20%，同屏多 25% 实体；提交版(HEAD) 无此缩放。属越界改动。
- **FPS 回归**：第四轮 `spawnFireEmbers` 每 fixed-step 喷 4 颗 `low` 余烬，把粒子池常驻补满 240/240，吃掉第三轮"池回落喘气"的低谷 → GPU overdraw 常驻满负荷（日志 CPU 仅 1-4ms 却 FPS 32，瓶颈在 GPU 合成/填充）。叠加 `viewZoom=0.8` 同屏实体更多，两点共推满 GPU。
- **不该改的东西**：`08_skill.js` 的 `enemiesIn`/`allEnemies` 改复用 `_aoeScratch`/`_enemySnap` 可变数组（GC 优化），非 FPS 真因且引入别名风险 → 回滚。

## 3. 具体改动点
1. `11_render.js`：`VIEW_ZOOM_FB` 0.8→1.0；`RT('RENDER.viewZoom', VIEW_ZOOM_FB)` 默认 0.8→1.0。画面恢复原始大小；`z=1` 时 `14_main.js` 瞄准公式等价于原始，飞镖落点恢复。
2. `05_particle.js`：`spawnFireEmbers` 开头加 `if (particles.length >= FIRE_EMBER_HEADROOM(=120)) return`。仅平静帧（池 <120）喷余烬保活火感；战斗爆发池 >120 时余烬让位、池回落 → FPS 回第三轮基线。
3. `08_skill.js`：整文件回滚到 HEAD（恢复分配版 `enemiesIn`/`allEnemies`，去掉 `_aoeScratch`/`_enemySnap` 复用与注释）。

## 4. 不动的（确认良性，保留）
- `02_config.js` `PERF.maxParticles:240`（第三轮基线，安全）。
- `14_main.js` 主循环丢追帧 + 标签页隐藏跳过（治"最小化再打开"）；`z=1` 时瞄准=原始。
- `11_render.js` 火墙火管 alpha0.16/热边加粗、敌人无 pop-in 剔除、resize scale>0 兜底、第四轮删蛇头火舌。
- `15_profiler.js` + `index.html`（诊断工具）。
- `03_core.js` / `04_collision.js`：不动。伤害管线：`Core.Formula.damage` / `applyDamage` 不动。

## 5. 验收标准
- 飞镖/整体画面恢复原始大小（无 0.8 缩小感）；飞镖落点正确。
- 50 敌 + 火墙冲扫：FPS 稳定高位（目标 ≥100），消除 30+ 反复掉帧；HUD `p` 平时回落 <120（呼吸），齐爆才冲 240。
- 火墙平静帧仍有橙黄余烬沿身飞溅（活火感），爆发时让位死亡/蒸汽 VFX。
- 蛇头无怪异圆点环。
- 按 `L` 复制日志复验。
- 回归：死亡/蒸汽/电磁/闪电/冰 VFX 保留；T1–T4、viewZoom 滑条(若保留)正常；`core:run_reset` 清空。
