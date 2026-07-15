# ④-B 蒸汽引爆屏震打击感精修 · §四 执行计划

> 需求来源：用户第二批「A. ④-B 屏震打击感精修」。表现层 · 零 gameplay · 无 §9 数值改动。
> 前置：④ 已 commit（baseline-b5，浏览器实测绿）。本件在 ④ 之上精修蒸汽引爆的屏震反馈。

## 1. 目标一句话
把蒸汽引爆的屏震从「逐敌 crit 震（N 敌 = N 震、疲劳）」改为「按本次引爆命中敌数门控 + trauma 累积/衰减/封顶」：单敌/小引爆几乎不震（靠白闪+爆环）；多敌齐爆一次有份量的震；时间窗内多次引爆不线性叠加（N 爆 ≠ N 震）。

## 2. 涉及文件及理由
- `snake55/11_render.js`（主改动·表现层）：新增 trauma 通道；`fx:steamblast` 监听按 `hitCount` 映射 §2.2 四档并累加到 trauma（封顶 1）；`draw` 合成 trauma 幅度并按帧衰减；`enemy:hit` 跳过 `src==='steam'` 的逐敌 crit 震；`run_reset` 清零 trauma。
- `snake55/08_skill.js`（仅传参）：蒸汽引爆 `Bus.emit('fx:steamblast', …)` 补 `hitCount: es2.length`（即本次爆心 90px 内命中敌数）。
- `snake55/02_config.js`（仅加门控配置，引用 §2.2 四档，无裸数值）：`COMBAT.shake.steam = { manyMin: 3, decayPerSec: 1.6 }`。
- **未动**：`05_particle.js` 暂不改（可选爆环 scale-pop / 显著引爆 hit-stop 门控后手感已足，故不做；如后续要加再走小计划）。

## 3. 具体改动点（分条）
### 3.1 02_config.js：门控配置（引用 §2.2，无裸数值）
`COMBAT.shake` 下加：
```js
steam: { manyMin: 3, decayPerSec: 1.6 }
// manyMin：命中敌数 ≥ manyMin → 取 crit 档(显著)；单敌(1)→light 最低档；2→process
// decayPerSec：trauma 每秒衰减量，配合封顶 1 实现「时间窗内多次引爆不线性叠加」
```

### 3.2 11_render.js：trauma 通道 + 门控
- 全局 `var trauma = 0`（与既有 impulse 通道 `shakeMag/shakeFrames` 并列）。
- `draw()` 震屏幅度合成：
  ```js
  var mag = 0
  if (shakeFrames > 0) { mag = Math.max(mag, shakeMag); shakeFrames--; if (shakeFrames <= 0) { shakeMag = 0 } else { shakeMag *= 0.85 } }
  var traumaMag = trauma * SHK.maxComposite          // trauma 折算屏震幅度（≤maxComposite=18px）
  if (traumaMag > mag) { mag = traumaMag }
  trauma = Math.max(0, trauma - SHK.steam.decayPerSec / GAME.fps)   // 每帧衰减（用 fps 换算，无裸数字）
  var ox = 0, oy = 0
  if (mag > 0) { ox = M.rand(-mag, mag); oy = M.rand(-mag, mag) }
  ```
- `fx:steamblast` 监听（门控核心）：
  ```js
  Bus.on('fx:steamblast', function (d) {
      if (!d) { return }
      var hc = d.hitCount || 1
      var tier = hc <= 1 ? SHK.light : (hc >= SHK.steam.manyMin ? SHK.crit : SHK.process)
      trauma = Math.min(1, trauma + tier.px / SHK.maxComposite)   // 累积并封顶 1
  })
  ```
- `enemy:hit` 监听跳过蒸汽：`if (d && d.crit && d.src !== 'steam')` —— 蒸汽命中不再逐敌触发 crit 震，避免 N 敌=N 震。
- `core:run_reset`：`trauma = 0`。

### 3.3 08_skill.js：传 hitCount
蒸汽引爆 `Bus.emit('fx:steamblast', { x: e.x, y: e.y, radius: CO.steamExplosion.radius, hitCount: es2.length })`。

## 4. 不动的底层文件
- `03_core.js` / `04_collision.js`：不动（Formula / 空间哈希未触及）。
- `02_config.js` 既有数值（伤害/半径/冷却 §4.6 锁定）：不动；仅新增 `steam` 门控子结构，强度全部引用 §2.2 四档，无新增平衡裸数值。
- 闪电/电磁：不动。
- `05_particle.js`：暂不动（可选增强留待后续）。

## 5. 验收标准（正常 + 边界/反向）
**正常场景**
- [ ] 单敌引爆（1 个带冰敌在火墙内引爆）：几乎无屏震，靠白闪+爆环表达（tier=light=2px，基本不可感）。
- [ ] 多敌齐爆（同一引爆 hitCount≥3）：一次明确、有份量的震（tier=crit=8px，trauma 累积到 ~0.44）。
- [ ] 连续多次引爆：屏震不持续疲劳叠加——trauma 封顶 1（=18px）且按 decayPerSec 衰减，N 爆 ≠ N 震。
- [ ] 白闪/爆环/橙粒子视觉不变；「蒸汽最强 combo」高光感保留。

**边界 / 反向场景**
- [ ] 反向：仅火墙 DOT 命中（非蒸汽引爆，无 fx:steamblast）→ 走既有 enemy:hit crit 震（src≠'steam'），屏震行为不变。
- [ ] 边界：蒸汽命中但 hitCount=2 → process 档（4px，中等），介于安静与显著之间。
- [ ] 边界：run_reset 后 trauma 归零，无残留屏震。

## 6. 提交纪律
- 独立 commit + 独立 tag（建议 `baseline-b6`），用户浏览器实测绿才提交。
- 本件文档（本 md）随代码一同提交。
- 事件名 `fx:steamblast` 全小写，过 Bus 断言。
