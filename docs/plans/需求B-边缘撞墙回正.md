# 需求 B · 边缘 / 墙角 / 撞墙回正（修 gameplay 核心 bug，对齐真源 §2.1）

> 来自需求文档「需求 B · 边缘/墙角/撞墙回正」。本件是 gameplay 核心改动，按 AGENTS §八 出计划、用户确认放行后落地。
> 配套：需求 A（虚拟摇杆唯一输入）已先落地；需求 B 不与 A 并批、独立 commit。

## ① 目标一句话
消除地图边缘「转圈/失控/像失灵」：撞墙时法向分量归零、切向保速，并平滑把蛇头朝向收敛到可行方向（不再只钳位置、放任角度指墙外→原地绕）；墙角不横跳不抖；保留撞墙宽容窗（一拍内转向可救回，仅撞墙生效）。

## ② 涉及文件及理由
- `snake55/06_snake.js`（唯一改动·gameplay 核心）：修改 `update()` 内「撞墙」块（原 `:103-112` 只做逐轴钳位置）。新增「撞墙后朝向收敛」。
- 不改 `14_main.js`、不改 `03_core.js`/`04_collision.js`、不动 §9 真源、不动任何数值。

## ③ 具体改动点（全部引用真源，零自创数字）
原块只钳位置，新块在 `hitWall` 内补「朝向收敛」，并用 `hitX/hitY=±1` 记录撞墙轴方向：

```js
var hitX = 0, hitY = 0   // ±1 = 墙外法向（左/右/上/下）
if (head.x < r) { head.x = r; hitWall = true; hitX = -1 }
if (head.y < r) { head.y = r; hitWall = true; hitY = -1 }
if (head.x > W - r) { head.x = W - r; hitWall = true; hitX = 1 }
if (head.y > H - r) { head.y = H - r; hitWall = true; hitY = 1 }
if (hitWall) {
    wallScrape.until = GS.timeSec + CONFIG.GAME.wallScrapeGrace   // 宽容窗：复用既有 §2.1 grace（0.2s），5.5 撞墙不死、"离墙即跟手"本身就是即时救回，不新增救回窗
    Bus.emit('snake:wall', {...})
    // 收敛仅在「玩家未朝墙外拨杆」时生效（补充 a）
    var _wantOut = false
    if (hitX !== 0 && Math.sign(inputDir.x) === hitX) _wantOut = true
    if (hitY !== 0 && Math.sign(inputDir.y) === hitY) _wantOut = true
    if (!_wantOut) {
        var _vx = Math.cos(head.angle), _vy = Math.sin(head.angle)
        if (hitX !== 0) _vx = 0          // 法向归零（沿墙滑行本质=速度投到墙面）
        if (hitY !== 0) _vy = 0
        if (_vx !== 0 || _vy !== 0) {
            var _slide = Math.atan2(_vy, _vx)
            var _max = M.deg2rad(effectiveTurnRateDeg()) * dt   // 收敛速率复用 §1 turnRate（与转向同速，最稳、零新数字）
            head.angle = M.angleLerp(head.angle, _slide, _max)
        }
        // 墙角(两轴同撞) → _vx=_vy=0 无可收敛方向 → 保持 head.angle 不变（不横跳不抖）
    }
    // 恒速/speed 仍在 step2 乘 wallScrapeSpeedMult 降速，本块不动（补充 b）
}
```

### 落地前用户补充的 3 条（已落地）
- **(a) 收敛只在「玩家输入无朝外法向分量」时生效**：用 `Math.sign(inputDir.x/y) === hitX/hitY` 判定玩家是否朝墙外拨杆；是则 `_wantOut=true` 跳过收敛，让 step1 的摇杆转向独占 → 拨杆即滑离、不被对拉。
- **(b) wallScrapeSpeedMult 刮擦减速仍生效**：step2「`if (wallSlide && timeSec < wallScrape.until) speed *= wallScrapeSpeedMult`」整段不动；「切向保速」=保留切向分量后**仍乘既有 scrape mult**，未静默废真源。
- **(c) 同帧 step1+墙块最高 ~2×turnRate，盯贴墙 escape 不发沉**：step1（摇杆转向）与墙块收敛各限 `effectiveTurnRateDeg()*dt`；最坏同向相加仅更快贴墙不突变。玩家拨离墙时 `_wantOut=true` 跳过收敛 → 仅 step1 转（1×）；无输入时 step1 不转、仅收敛转（1×）。故贴墙 escape 不会发沉。

## ④ 不动的底层
- `03_core.js` / `04_collision.js`：不动（碰撞仍是逐轴钳制，未改）。
- `02_config.js`：不动（全部用既有 `wallSlide / wallScrapeSpeedMult / wallScrapeGrace / headRadius` + `PLAYER.turnRate*`）。
- `14_main.js`：本件不动（已独立 commit「屏蔽桌面鼠标 hover 转向」；B 验收硬卡 `14_main diff` 为空指 B 这次 commit）。
- §9 真源：不碰；本件纯属把既有真源值「接生效」，无新平衡数字。

## ⑤ 验收标准（正常 + 边界/反向 + 验收加测）
- **正常**：贴上/下/左/右墙走 → 蛇沿墙顺滑滑行、不转圈不失控；离开墙或反向拨杆 → 朝向平滑回正、操控即时恢复；中心区手感不变。
- **边界**：四个墙角各方向顶入 → 不横跳不抖、不原地绕；拨杆即滑离。
- **反向**：不撞墙时行为完全不变（无回归）；宽容窗内转向救回有效。
- **验收加测（用户要求）**：
  1. 正对墙反向（180° 退化）：蛇头正对墙、玩家猛拨反向 → 平滑 180° 转回、不卡死不抖动。
  2. 墙角双轴冻结后拨出：蛇头挤进墙角（两轴同撞、angle 自由）→ 拨杆离开墙角方向 → 立即顺滑滑离、不横跳。
  3. 贴墙拨离跟手：贴墙滑行中把摇杆拨离墙 → 朝向立刻跟手回正、操控即时恢复（验证补充 a 不被对拉）。
  4. 与 A 摇杆联动无回归：摇杆操纵下撞墙收敛自然、不抢输入；松手直行遇墙仍沿墙滑。
  5. **硬卡 diff 为空**：本件 commit 后 `git diff` 中 `03_core.js`/`04_collision.js`/`14_main.js`/`docs/《数值真理源 §9》` 必须为空（仅 `06_snake.js` + 本计划/STATUS/测试清单）。

## ⑥ 实现备注
- 改动仅 `06_snake.js` 一处（撞墙块），约 +15 行；零新增 config 字段、零新增裸数字。
- `inputDir` 为 `setInput` 写入的 `{x,y,active}`；`effectiveTurnRateDeg()` 与 `M.angleLerp/M.deg2rad` 均为既有（step1 转向已用），无新依赖。
- 单独 commit（不与 A 并批）；输入层屏蔽（14_main）另行独立 commit。
