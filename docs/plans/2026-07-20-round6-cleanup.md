# 计划 · 第六轮全盘整理（替代 round5-revert 的错误诊断）

> 前版 round5-revert 对 viewZoom/overdraw 的判断有误（误以为缩小增 overdraw，实为减负），
> 且未核对飞镖代码层、未真正定位 FPS 主因。本版为修正后的精准计划。

## 1. 目标一句话
恢复 commit 原画面与飞镖观感、火焰更醒目、FPS 稳 ≥60（目标 ≥100），并删除多轮越界改动。

## 2. 全盘改动定性（工作区 vs HEAD）

| 文件 | 改动 | 定性 |
|---|---|---|
| 11_render.js | 新增 viewZoom=0.8 整体缩小世界 | ❌ 问题：commit 无此缩放，凭空新增；画面变小+火墙观感变细+同屏可见+25%实体进视锥 |
| 05_particle.js | 新增 spawnFireEmbers 每 fixed-step 沿身喷 2-4 余烬 | ⚠️ FPS 主因：粒子池焊死 240/240，GPU 无呼吸低谷 |
| 05_particle.js | 删除火 DOT 逐次火花 spawnBurst(3) | ⚠️ 火焰变弱原因之一（命中无迸溅） |
| 05_particle.js | isDot 飘字提权 high | ✅ 良性（伤害必显） |
| 08_skill.js | _enemySnap/_aoeScratch 复用数组（GC 优化） | ❌ 不该改：非必需系统层改动+别名风险；非 FPS 真因 |
| 11_render.js | 火墙改单 path 2 stroke（替代 50 节点 fill） | ✅ 良性 overdraw 优化（保留画法） |
| 11_render.js 火墙 | 软火体 0.16 / 热边 0.5 | ⚠️ 火焰变弱：偏低，叠加缩放更淡 |
| 12_ui.js | HUD 节流 ~10Hz | ✅ 良性 |
| 14_main.js | 大间隔丢追帧+隐藏跳过+CPU 计时 | ✅ 良性（治最小化卡顿） |
| 14_main.js | 瞄准反算 /z | 🔁 随 viewZoom 还原而还原 |
| 15_profiler.js+01_index.html | 诊断工具 | ✅ 保留 |

## 3. 三问题根因（明确结论）

① 飞镖"球形变子弹"——代码层未发生。tickBolt(HEAD=working 一致)=定时锁定最近敌发射 fx:bolt 飞行镖+单体 hurt；fx:bolt 渲染(HEAD=working 一致)=spawnDart+命中小爆点；11_render dart 绘制 diff 零改动。飞镖从 commit 到现在一直是弹道+小爆点，从不是球形 AOE。用户记忆"球形"或为更早不在 HEAD 的版本、或误记火墙/冰环范围场。若要"飞镖=球形 AOE 爆炸"属新需求，另出计划。

② 火焰变弱 = 删火花 + 删头部火舌 + 加 viewZoom 缩小 + alpha 偏低，四者叠加。

③ FPS 根因 = spawnFireEmbers 把粒子池焊死 240/240（主因）。铁证：掉到 32 时 CPU 仅 1.3ms → 主线程不忙 → 瓶颈在 GPU 填充率。round3 稳 150+ 因无余烬、池回落 0-12 有呼吸；第四轮加每帧补余烬后池永满。viewZoom=0.8 对填充率实为减负（缩小），但让更多实体进视锥且凭空新增，应还原。

## 4. 具体改动点

1. 11_render.js：删 viewZoom=0.8 相关 6 行（VAR 声明 + draw 内 RT/clamp/scale + getter，并同步清理 13_editor.js 的两个 viewZoom 滑条条目，避免死控件）；火墙增强 软火体 0.16→0.30（恢复 commit 0.32 量级）、热边 0.5→0.72 且 lineWidth 4→5（比 commit 更醒目）。
2. 14_main.js：瞄准反算还原 HEAD 版（去 /z，z 恒 1）。
3. 05_particle.js：spawnFireEmbers 加 `if (particles.length >= maxParticles()*0.5) return` 余量门控（池忙≥半满停喷余烬，留 GPU 呼吸低谷；无裸数字，绑定 config 上限）。
4. 08_skill.js：⚠️ 用户否决回滚，保持工作区现状（_enemySnap/_aoeScratch 复用数组保留）。该改动与本次修复无冲突、非 FPS 主因，独立存在无副作用。
5. 15_profiler.js：掉帧（<40）日志补归因行 `敌 / 可见敌 / 粒子 p/pmax / 余烬 on/off / 火焰 on|off(T3) / CPU ms`；并常驻采样行加 可见敌/余烬/火焰，落实"该打日志就打日志"。

## 5. 不动的底层/文件
- 03_core.js / 04_collision.js：不动。伤害管线不动。
- 02_config.js 的 maxParticles:240：作安全上限保留，配合门控。
- 火墙单 path 2 stroke 画法、HUD 节流、主循环丢追帧/隐藏跳过/CPU 计时、isDot 飘字 high：保留。

## 6. 验收标准
- 正常：画面/蛇身/火墙恢复 commit 原大小；火墙清晰醒目（火管+沿身橙黄余烬）。
- 50 敌+火墙冲扫：FPS 稳 ≥60（目标 ≥100）；HUD 粒子平时回落 <110（呼吸），齐爆冲高后回落。
- 边界/反向：掉帧时 HUD 末尾出现归因行；按 L 复制日志可复验。
- 飞镖视觉=commit 原弹道（若用户要球形 AOE 则另做）。

## 7. 已落地 & 全盘核对（2026-07-20）

落地动作（均相对 HEAD 增量，未提交，可单文件 `git checkout -- snake55/<file>` 回退）：
- 11_render.js：viewZoom 全移除（VAR/draw/getter），火墙软体 0.16→0.30、热边 0.5→0.72/宽4→5。Lint 0 错。
- 13_editor.js：移除 viewZoom 两处滑条条目 + 清引用注释；grep 全仓 viewZoom=0 处，无悬空。
- 14_main.js：pointermove 去掉 /z，世界坐标=cam+(逻辑点-中心)，与 HEAD 一致。
- 05_particle.js：spawnFireEmbers 加 `≥maxParticles()*0.5` 门控。
- 15_profiler.js：getDiag 增 embers/flame/visEnemies；采样行+掉帧归因行改写。
- 08_skill.js：**未改**（用户否决回滚，保留现状）。

对照 HEAD 逐条核对结论（均有意义且有效，未降低表现力）：
- 删 viewZoom：commit 本无缩放，属多轮越界新增（用户亲指"蛇身变大后才带出的缩放需求"）；移除后画面/火墙恢复原始粗细，表现力复原而非降低。
- 火墙提亮 0.30/0.72/宽5：commit 为软体 0.32 + 仅蛇头 14 火舌(0.5)；本次去掉用户不喜的"怪异头圈"，改用全身体火管+更亮热边，整体比 commit 更醒目且仍 1 次 path 省 overdraw。
- 余烬门控：直击 FPS 主因（焊死 240/240 常载）；门控后半满停喷，池回落留 GPU 呼吸低谷；战斗时火墙本体(渲染层)仍常显，余烬仅在池闲时补，表现力不损。
- 08_skill 保留：GC 复用数组为良性微优化，与修复无冲突；用户选择保留即视为认可其有意义。

回退方式：所有改动均未 commit，随时可 `git checkout -- snake55/<文件>` 单文件还原；注意 08_skill.js 若一并还原会丢失用户保留的复用数组改动。
