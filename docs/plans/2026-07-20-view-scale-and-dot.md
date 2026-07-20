# 计划 · 视图缩放回归 + 伤害飘字必现 + DOT 叠加澄清（2026-07-20）

> 背景：上一轮性能根治后 FPS 稳定 ≥70，但用户反馈 ①蛇与怪物变大了、GM「画布上限W」改不了蛇身大小；②蒸汽爆炸打假人无伤害数字、打小怪数字不全；③火焰/灼烧是否 DOT、BOSS 上 DOT 是否叠加无法确认。本计划全面排查后给出修复。

## 1. 目标一句话
回归「可 GM 调控的纯视觉视图缩放」让蛇/怪变小且可控；把蒸汽/瞬伤飘字提到高优先并绘于白闪之上，确保伤害数字必现；澄清 DOT 分源叠加语义（不改伤害管线、不碰 core/collision/§9）。

## 2. 已排查结论（根因）

### 问题① 蛇和怪物变大了 + GM 画布改不了大小
- 根因：上一轮清理删除了 `viewZoom=0.8`（渲染缩放），渲染回到 `scale 1.0`，相对之前的 0.8 整体放大 25%（蛇=config PLAYER.bodyRadius=12/headRadius=14，怪=各自 radius，均按世界坐标 1:1 绘制，无全局缩放）。
- 认知错配：GM「画布上限W」(`RENDER.maxBackW`) 是 **backing store 像素宽度上限**（仅影响渲染分辨率/填充率），**根本不改变实体尺寸**——所以用户拖它改不了蛇大小。
- 结论：需要一条**真正改变世界渲染尺寸的纯视觉缩放**通道（还原旧 viewZoom 思路，但做成 GM 滑条、默认 0.8），并明确标注「画布上限W」只是分辨率。

### 问题② 蒸汽爆炸飘字不全 / 假人无数字
- 根因 A（优先级丢弃）：`05_particle` 的 `enemy:hit` 非 DOT 分支里，`spawnText(..., 'low')` 把瞬伤/蒸汽数字标为 **low 优先**；当 `texts` 达 `maxTexts=48` 上限且满是 high 优先的火墙 DOT 飘字时，low 优先的蒸汽/瞬伤数字被 `emitText` 直接丢弃（`prio==='low' → return false`）。重战（火墙 DOT 高频 + 多敌）时尤甚 → 「小怪偶尔有、假人常无」（假人多在被火墙+波次包围、缓冲被 high 占满时测）。
- 根因 B（白闪遮挡）：`fx:steamblast` 的实心白闪核 `rgba(255,255,255,0.92)` 半径≈0.7×90=63，在 `drawOverlay` 绘制于**实体之上、且晚于飘字**（飘字在 `drawWorld` 末尾）。假人半径 24，飘字落在 `y-30` 处正好被白闪覆盖 0.22s，视觉上「像没数字」。小怪半径小、飘字偏出白闪范围，故可见。
- 结论：瞬伤/蒸汽飘字应 (1) 提权 high（不与 DOT 抢但压过 low 标签/火花），(2) 绘于白闪之上（挪到 drawOverlay 末、白闪之后）。

### 问题③ 火焰/灼烧是否 DOT、是否叠加
- 火焰墙 = **真·持续 DOT**：`tickFire` 每帧 `hurt(e, dotPerSec*dt, true, 'fire')`，无独立持续时间，仅在火墙内每帧 tick（`dotMap['fire']` 聚合）。
- 灼烧(burningBarrage) = **真·持续 DOT（带时长）**：`ignite()` 刷新 `burnT`（取 max，不叠加 dps），`updateOne` 每帧 `applyDamage(e, burnDps*dt, true, 'burn')`，引燃后持续 `burnSec` 秒（离开火墙也继续）。
- 护盾接触 = **DOT**：`tickShield` 每帧 `hurt(e, dmg*dt, true, 'shield')`。
- **是否叠加**：`applyDamage` 中 `e.hp -= amount` 对每条 DOT 每帧都结算；`dotMap[src]` 按来源分键——**不同来源（fire/shield/burn）各自独立累加并分别扣血 → 加性叠加**；**同来源只累加单条、不会多重实例**（`tickFire` 每帧按 `hit[e.id]` 去重，BOSS 再大也只 1 次火墙 DOT/帧）。
- 用户「围绕 BOSS 触发很多 DOT」= 多来源并存（火墙+护盾+灼烧三条独立飘字流）的视觉表现，**非 bug**；「被触碰一次就 DOT 一下」= 火墙每帧 tick / 灼烧引燃持续 burnSec，符合设计。
- 结论：无需改伤害管线；为消除「无法确认」，在 debug HUD 加一行 BOSS 当前活跃 DOT 源（fire/shield/burn 及累计值），让用户可现场验证叠加。

## 3. 具体改动点

### 3.1 `11_render.js`（纯渲染，零 gameplay）
- `draw()` 内 `ctx.translate(-cam.x,-cam.y)` 之后新增：`var ws = M.clamp(RT('RENDER.worldScale', 0.8), 0.5, 1.0); worldScale = ws; ctx.scale(ws, ws)`（整体缩小世界，碰撞/世界坐标不变）。
- 模块变量 `var worldScale = 1`，并在 `Render` 暴露 `getWorldScale`（供 main 指针反算）。
- `inView(x,y,r)`：`hw/hh` 改为 `(logicalWidth/2)/worldScale`（含缩放后真实可见半幅，避免边缘敌不画血条/标记）。
- `drawWorld` 末尾的**飘字绘制循环整体移除**；改到 `drawOverlay`：`DBG.flashDrawn` 后、白闪绘制**之后**再画飘字（`ctx.textAlign='center'` + 现有字体/alpha 逻辑），落实「伤害飘字永远盖在白闪/实体之上」。把 `PERF.suppressWhiteBurst` 早退只 guarding 白闪绘制，不挡飘字。
- `drawDebugHud`：若存在 boss，追加一行 `BOSS DOT: fire=.. shield=.. burn=..`（读 `boss.dotMap`，仅诊断、零 gameplay）。

### 3.2 `14_main.js`（指针反算）
- `pointermove`：`cursor.wx = cam.x + (mx - logicalWidth/2) / render.getWorldScale()`；`wy` 同理。确保缩放后瞄准点仍对准世界坐标（否则缩放下飞镖/锁敌偏位）。

### 3.3 `13_editor.js`（GM 面板）
- `ranges` 加 `worldScale: [0.6, 1.0, 0.05]`。
- 标量标定加 `{ path: 'RENDER.worldScale', label: '视图缩放(纯视觉)', rng: 'worldScale', def: 0.8, dec: 2 }`（默认 0.8 还原用户此前偏好的小尺寸；滑条 0.6–1.0 实时可调）。
- `RENDER.maxBackW` 标签由「画布上限W」改为「渲染分辨率上限W」，并在注释说明它只控分辨率/填率、不改实体尺寸，避免再次误解。

### 3.4 `05_particle.js`（飘字优先）
- `enemy:hit` 非 DOT 分支：`spawnText(d.x, ty, lbl+'-'+dmg, col, d.crit?20:14, 'low')` → `'high'`。瞬伤/蒸汽/飞镖/闪电/电磁数字提权，缓冲满时压过 low 的「减速」标签与命中火花，必现。

### 3.5 不动的底层
- `03_core.js` / `04_collision.js`：不动（缩放纯渲染、碰撞用世界坐标）。
- `07_enemy.js` / `08_skill.js` 伤害管线：不动（DOT 叠加为既有设计，仅加 HUD 观测）。

## 4. 验收标准
- 正常：加载即整体缩小到 ~0.8（蛇/怪/火墙均小一圈，FPS 不降反略升）；GM 拖「视图缩放」实时变大/变小，但瞄准点仍准（飞镖命中锁定的敌）。
- 边界/反向：拖到 0.6 极小、1.0 原始，画面不崩、指针反算仍准；「渲染分辨率上限W」拖动只改清晰度/帧率，实体尺寸不变（验证认知纠偏）。
- 飘字：50 敌 + 火墙 + 蒸汽齐爆下，按蒸汽的敌必出「💥蒸汽 -N」；打假人（火+冰）必见蒸汽数字且不被白闪盖住；debug HUD 开时 BOSS 行显 `fire/shield/burn` 三源累计，可现场确认叠加。
- 回归：核心/碰撞/§9 未动；`viewZoom` 旧名全仓 0 处（新名 worldScale）。

## 5. 回退
全部未提交，单文件 `git checkout -- snake55/<文件>` 可还原；注意 08_skill.js 现状（上一轮用户保留的复用数组）不受影响。
