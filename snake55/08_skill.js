;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M, Formula = Core.Formula
	var SK = CONFIG.SKILL, CO = CONFIG.COMBO, ECON = CONFIG.ECON, CB = CONFIG.COMBAT
	var FIRE_HEAT = (((CONFIG.STYLE || {}).combatFx || {}).skillVfx || {}).fire || {}
	FIRE_HEAT = FIRE_HEAT.heatScorch || {}   // Fire V1.7 Presentation-only：只读配置，不参与伤害/判定

// 🟡 真理源未量化的表现/节奏，占位 + 候选，待回写
var COMBO_STEAM_INTERVAL_SEC = 2.0  // TODO: 待确认（候选 1.5 / 3.0）
// —— ⑥ 冰冻机制重做：常驻尾迹 → CD 自动索敌冰池（对象池 + 活动表，render 读此画）——
//    每 freezeCd 秒触发一次：以蛇头为源、在 seekRange 内找最密敌群 → 在该点落一个冰池（poolRadius），存续 poolLingerSec；
//    池内敌人吃减速→冻结（applySlow；冻结＝pct=1）；④ 蒸汽引爆只读 slowT>0 不变。
var ICE_POOL_CAP = 64               // 冰池对象池上限（富余）；实际并发上限由 config SKILL.ice.maxActivePools=2 管控（dropIcePool 不新增第三片）
var icePoolPool = Core.createPool(
  function () { return { x: 0, y: 0, r: 0, life: 0, expire: 0, growT: 0, growDur: 0 } },
  function (p) { p.x = 0; p.y = 0; p.r = 0; p.life = 0; p.expire = 0; p.growT = 0; p.growDur = 0 },
  ICE_POOL_CAP
)
var icePools = []                   // 活跃冰池（render.read）
// ⑥ 首测修复 A（纯表现零 gameplay）：冰锥从尾部甩出 → 飞到落点 → 冰池生长动画；视觉常量（真理源未量化，🟡 + 候选，待 ~ 定稿）
var ICE_THROW_SEC = 0.16            // TODO: 冰锥飞行时长(s)（候选 0.15 / 0.20）；与 fx:ice_throw 的 travel 同源
var ICE_POOL_GROW_SEC = 0.15        // TODO: 冰池生长时长(s)，scale 0→1（候选 0.12 / 0.18）
var ICE_RETRY_SEC = 0.5             // TODO: 无目标时重试间隔(s)（候选 0.3 / 0.7）；避免蛇头远离敌群时空耗整轮 CD 导致节奏不稳
var BURN_BARRAGE_INTERVAL_SEC = 1.8 // V5 Final 最小机制：独立 Combo 周期；数值专项可再调
var BURN_BARRAGE_DARTS = 3, BURN_BARRAGE_STAGGER_SEC = 0.045, BURN_BARRAGE_TRAVEL_SEC = 0.24
var burnPending = [] // 火焰飞镖抵达后再施加 burn，避免状态图标先于投射物出现
var icePending = []                 // ⑥ 首测：延迟发出的 fx:ice_pool（等冰锥飞到落点再出霜环）；GS.timeSec 驱动，pause-safe
	// 电磁炮台只由有效飞镖命中部署，后续齐射由自身状态机驱动。

	var timer = { bolt: 0, lightning: 0, ice: 0, burningBarrage: 0 }   // ice CD；steam 使用 per-enemy 冷却
	var foundCombo = {}
	var fireContactPrev = {}   // 纯表现进入态：只用于 Fire 首次接触反馈；伤害仍由 tickFire 真判定结算
	var fireFieldVisualUntil = {}   // Fire V1.7：enemyId→热蚀视觉保留截止时刻；纯 Presentation，不写 burnT/burnDps
	var electroTurretState = { active: false, phase: 'inactive', x: 0, y: 0, age: 0, comboLevel: 1, shotsFired: 0, nextShotAt: 0, collapseSent: false, redeployCooldown: 0 }
	var _enemySnap = []   // 每帧敌列快照（原地填充复用，零每帧分配；b6b380d 性能优化的回归修复：原每帧 new 数组 → GC 偶发卡顿）
	var _aoeScratch = []   // enemiesIn 复用数组（AOE 索敌每帧多次调用，消除重复分配）
	var _fireBounds = {}, _steamFireBounds = {}, _fireSegScratch = []   // Fire 精判 scratch：头 + 可见身体中心线；AABB 先剔除，再做线段距离，零每帧对象分配
	var electroDiag = {
		electroAttempts: 0, electroSuccess: 0, electroNoTarget: 0, electroTargetsHit: 0,
		electroLastTriggerSec: -1, electroLastGapSec: 0
	}

	function lvl(id) { return GS.ownedSkills[id] || 0 }
	function idx(id) { return lvl(id) - 1 }
	function owns(id) { return lvl(id) > 0 }
	// B-GM 实时标定桥（dev）：读 editor 运行时覆盖，无覆盖回退冻结 CONFIG 默认；仅替换 input 来源，不改几何/判定/公式
	function RT(path, fb) {
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	function headPos() { var s = Registry.get('snake'); return s && s.head ? s.head : { x: 0, y: 0, angle: 0 } }
	function segmentsList() { var s = Registry.get('snake'); return (s && s.segments) ? s.segments : [] }   // 通用身体节列表（历史语义保留）
	function fireSegmentsList() {
		// Fire 真几何与屏幕上实际画出的蛇中心线同构：head + segments[1..]。
		// segments[0] 是追随头部的身体节；若把它当 Fire 起点，会让头部火域慢半拍，也会让“看到的墙”和实际判定在转弯时错位。
		_fireSegScratch.length = 0
		var s = Registry.get('snake'); if (!s) { return _fireSegScratch }
		if (s.head) { _fireSegScratch.push(s.head) }
		var segs = s.segments || []
		for (var i = 1; i < segs.length; i++) { _fireSegScratch.push(segs[i]) }
		return _fireSegScratch
	}
	function tailPos() { var segs = segmentsList(); return segs.length ? segs[segs.length - 1] : headPos() }

	// 局部 AOE：复用每帧 _enemySnap（Skill.update 已刷新），按 queryCircle 同语义(cell 级覆盖)过滤；
	// #6 优化：消除每帧每 AOE 中心一次 queryCircle（含字符串 key 拼接/map 查找/新数组分配的 GC 抖动，已登 DEBT）；
	// 零行为变化：cell 覆盖相交判定精确复刻 SpatialHash.query 返回集合（仅 active 非 bossBullet）——_enemySnap 已含此过滤
	var _cell = CONFIG.SPATIAL.cellSize   // 读写 config（§6 禁裸数字）；与 collision 同 cellSize
	function enemiesIn(x, y, r) {
		_aoeScratch.length = 0
		var c = _cell
		var qMinCX = ((x - r) / c) | 0, qMaxCX = ((x + r) / c) | 0
		var qMinCY = ((y - r) / c) | 0, qMaxCY = ((y + r) / c) | 0
		for (var i = 0; i < _enemySnap.length; i++) {
			var e = _enemySnap[i]
			var eMinCX = ((e.x - e.radius) / c) | 0, eMaxCX = ((e.x + e.radius) / c) | 0
			if (eMinCX > qMaxCX || eMaxCX < qMinCX) { continue }   // X 轴不相交 → 不在 queryCircle 返回集
			var eMinCY = ((e.y - e.radius) / c) | 0, eMaxCY = ((e.y + e.radius) / c) | 0
			if (eMinCY > qMaxCY || eMaxCY < qMinCY) { continue }   // Y 轴不相交
			_aoeScratch.push(e)
		}
		return _aoeScratch
	}
	// 全屏索敌：走 Enemy.list（避免 queryCircle 大半径遍历海量空格子）；原地填充 _enemySnap（零每帧分配，GC 友好）
	function allEnemies() {
		_enemySnap.length = 0
		var En = Registry.get('enemy')
		if (En && En.list) {
			var l = En.list
			for (var i = 0; i < l.length; i++) { var e = l[i]; if (e.active && e.type !== 'bossBullet') { _enemySnap.push(e) } }
		}
		return _enemySnap
	}
	function hurt(e, base, isDot, src) {   // src=伤害来源标签（B-1 纯表现，仅透传给飘字，不参与伤害计算）
		var crit = Math.random() < CB.critRate
		Registry.get('enemy').applyDamage(e, Formula.damage(base, GS.segments, crit), crit, isDot, src)   // ⑦ isDot 透传：DOT 由 enemy 聚合飘字
	}
	function hurtCombo(e, base, isDot, src) {   // Combo 独立口径：不叠 effectMul，仅保留暴击（§4.6 / §9 2026-07-11）
		var crit = Math.random() < CB.critRate
		Registry.get('enemy').applyDamage(e, Formula.comboDamage(base, crit), crit, isDot, src)
	}

	// Fire 真判定 = 敌人圆形碰撞体 与「蛇身中心折线 ⊕ Fire radius」的精确相交。
	// Spatial/AABB 只能做 broadphase；最终必须走本函数，保证 render 的连续火域与实际 DOT 几何一致。
	function pointSegDistSq(px, py, ax, ay, bx, by) {
		var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay
		var vv = vx * vx + vy * vy
		if (vv <= 0.000001) { return wx * wx + wy * wy }
		var t = (wx * vx + wy * vy) / vv
		if (t < 0) { t = 0 } else if (t > 1) { t = 1 }
		var dx = px - (ax + vx * t), dy = py - (ay + vy * t)
		return dx * dx + dy * dy
	}
	function buildFireBounds(segs, r, out) {
		out = out || {}
		if (!segs || !segs.length) { out.minX = out.maxX = out.minY = out.maxY = 0; return out }
		var minX = segs[0].x, maxX = minX, minY = segs[0].y, maxY = minY
		for (var i = 1; i < segs.length; i++) {
			var p = segs[i]
			if (p.x < minX) { minX = p.x } else if (p.x > maxX) { maxX = p.x }
			if (p.y < minY) { minY = p.y } else if (p.y > maxY) { maxY = p.y }
		}
		out.minX = minX - r; out.maxX = maxX + r; out.minY = minY - r; out.maxY = maxY + r
		return out
	}
	function enemyTouchesFireTube(e, segs, r, bounds) {
		if (!e || !segs || !segs.length) { return false }
		var er = e.radius || 0
		if (bounds && (e.x + er < bounds.minX || e.x - er > bounds.maxX || e.y + er < bounds.minY || e.y - er > bounds.maxY)) { return false }
		var rr = r + er, rr2 = rr * rr
		if (segs.length === 1) {
			var dx0 = e.x - segs[0].x, dy0 = e.y - segs[0].y
			return dx0 * dx0 + dy0 * dy0 <= rr2
		}
		for (var s = 1; s < segs.length; s++) {
			if (pointSegDistSq(e.x, e.y, segs[s - 1].x, segs[s - 1].y, segs[s].x, segs[s].y) <= rr2) { return true }
		}
		return false
	}

	// —— 五技能主动效果（按拥有等级取数组）——
	function tickFire(dt) {
		var i = idx('fire')
		var segs = fireSegmentsList(), r = RT('SKILL.fire.radius.' + i, SK.fire.radius[i])   // 头+身体连续 Fire tube；与 render 共用同一 radius 真源
		var bounds = buildFireBounds(segs, r, _fireBounds), now = {}
		var heatFade = FIRE_HEAT.exitFadeSec || 0.22, heatUntil = GS.timeSec + heatFade
		for (var k = 0; k < _enemySnap.length; k++) {
			var e = _enemySnap[k]
			if (!enemyTouchesFireTube(e, segs, r, bounds)) { continue }
			now[e.id] = true
			fireFieldVisualUntil[e.id] = heatUntil   // 只刷新热蚀视觉窗口；伤害仍只走下方 hurt()
			hurt(e, SK.fire.dotPerSec[i] * dt, true, 'fire')
			if (!fireContactPrev[e.id]) { Bus.emit('fx:firecontact', { x: e.x, y: e.y, r: e.radius || 0, level: i + 1 }) }   // 仅进入瞬间发视觉事件，不重复伤害
		}
		for (var pid in fireContactPrev) { if (fireContactPrev[pid] && !now[pid]) { fireFieldVisualUntil[pid] = GS.timeSec + heatFade } }
		for (var fid in fireFieldVisualUntil) { if (!now[fid] && fireFieldVisualUntil[fid] <= GS.timeSec) { delete fireFieldVisualUntil[fid] } }
		fireContactPrev = now
	}
	function getFireFieldVisualAlpha(enemyId) {
		if (!owns('fire')) { return 0 }
		if (fireContactPrev[enemyId]) { return 1 }
		var until = fireFieldVisualUntil[enemyId] || 0, fade = FIRE_HEAT.exitFadeSec || 0.22
		return until > GS.timeSec ? M.clamp((until - GS.timeSec) / fade, 0, 1) : 0
	}
	function tickIce(dt) {
		var i = idx('ice'), En = Registry.get('enemy')
		// —— CD 触发：每 freezeCd 秒落一个冰池（射程内最密敌群为落点）——
	timer.ice -= dt
	if (timer.ice <= 0) {
		// ⑥ 修复：无目标时不消耗整轮 CD，改短间隔重试 → 落点确定性、节奏稳定（不再因蛇头远离敌群现 3s+ 空缺）
		timer.ice = dropIcePool(i) ? RT('SKILL.ice.freezeCd', SK.ice.freezeCd) : ICE_RETRY_SEC
	}
	// —— 冰池存续 + 减速施加（每帧）——
	var pct = RT('SKILL.ice.slowPct.' + i, SK.ice.slowPct[i])
	var freeze = lvl('ice') >= SK.maxLevel
	var slowWin = freeze ? SK.ice.lv5FreezeSec : RT('SKILL.ice.poolLingerSec.' + i, SK.ice.poolLingerSec[i])   // ⑥ 系统性调整：Lv5 冻结时长 lv5FreezeSec；否则按等级取 poolLingerSec[i]（原 flat 4.0 → [4,5,6,7,8]）
	// ⑥ 首测：冰锥飞到落点 → 出霜环（pause-safe 延迟，由 GS.timeSec 驱动）
	for (var qi = icePending.length - 1; qi >= 0; qi--) {
		if (icePending[qi].at <= GS.timeSec) {
			var qp = icePending[qi]
			Bus.emit('fx:ice_pool', { x: qp.x, y: qp.y, r: qp.r, life: qp.life })   // 冰锥到达落点→霜环（纯表现）
			icePending.splice(qi, 1)
		}
	}
	// 过期回收
	for (var k = icePools.length - 1; k >= 0; k--) {
		if (icePools[k].expire <= GS.timeSec) { icePoolPool.release(icePools[k]); icePools.splice(k, 1) }
	}
	// 减速施加（圆-圆，与渲染冰池圆严格一致：看到的=打到的；生长中按 effR 缩放，视觉=判定）
	for (var j = 0; j < icePools.length; j++) {
		var pp = icePools[j]
		if (pp.growT > 0) { pp.growT -= dt; if (pp.growT < 0) { pp.growT = 0 } }   // 06 首测：生长计时
		var effR = pp.r
		if (pp.growT > 0) { effR = pp.r * (1 - pp.growT / pp.growDur) }            // 生长中半径按比例放大（看到的=打到的）
		var es = enemiesIn(pp.x, pp.y, effR)             // #6 已优化：enemiesIn 走 _enemySnap 遍历(cell 级等效)，不再每帧每冰池 queryCircle（GC 抖动消除）
		for (var m = 0; m < es.length; m++) {
			var e = es[m]
			var cdx = e.x - pp.x, cdy = e.y - pp.y, crr = effR + e.radius   // 精确圆-圆：与渲染冰池圆一致
			if (cdx * cdx + cdy * cdy <= crr * crr) { En.applySlow(e, pct, slowWin); e._iceHit = true }
		}
	}
		// 进入检测（两遍法：本帧命中置 _iceHit，再判 inIce 变化触发飘字）
		var all = _enemySnap
		for (var n = 0; n < all.length; n++) {
			var en = all[n]
			var was = en.inIce; en.inIce = !!en._iceHit; en._iceHit = false
			if (en.inIce && !was) { Bus.emit('fx:iceslow', { x: en.x, y: en.y, r: en.radius }) }   // 坐标用敌人位置；事件名全小写过 Bus 断言
		}
	}
	// ⑥ 系统性调整：索敌 + 落池（并发上限 maxActivePools）
	//   以蛇头为源、seekRange 内找「半径 poolR 邻域内敌数最多、且未被现有冰池覆盖」的敌群落点；
	//   未达并发上限→新增；已达上限→刷新「距新目标最近」那片并重定位（2 片稳定大控制场跟敌群走）；无未被覆盖敌群→本次不落
	function dropIcePool(i) {
		var h = headPos()
		var seekR = RT('SKILL.ice.seekRange.' + i, SK.ice.seekRange[i])
		var poolR = RT('SKILL.ice.poolRadius.' + i, SK.ice.poolRadius[i])
		var maxP = RT('SKILL.ice.maxActivePools', SK.ice.maxActivePools)
		var seekR2 = seekR * seekR
		var cands = _enemySnap
		if (cands.length === 0) { return false }           // 无敌人：本次不落池
		// 找射程内、且未被现有冰池覆盖的最密敌群（已覆盖＝逼出第二片场，杜绝小碎池刷屏）
		var best = null, bestN = -1
		for (var a = 0; a < cands.length; a++) {
			var ca = cands[a]
			if (M.distSq(h.x, h.y, ca.x, ca.y) > seekR2) { continue }   // 仅射程内索敌（复用飞镖/闪电以蛇头为源）
			if (isCovered(ca, icePools)) { continue }                    // ⑥ 并发：已被现有冰池覆盖的敌群不作落点
			var nn = 0
			for (var b = 0; b < cands.length; b++) {
				if (M.distSq(ca.x, ca.y, cands[b].x, cands[b].y) <= poolR * poolR) { nn++ }   // 邻域半径 = 池半径（含自身≥1）
			}
			if (nn > bestN) { bestN = nn; best = ca }
		}
		if (!best) { return false }                       // 射程内无未被覆盖敌群
		var linger = RT('SKILL.ice.poolLingerSec.' + i, SK.ice.poolLingerSec[i])   // ⑥：按等级取值[4,5,6,7,8]
		if (icePools.length < maxP) {
			spawnIcePool(best.x, best.y, poolR, linger)    // 未达并发上限：新增冰池
		} else {
			// 已达并发上限：刷新「距新目标最近」那片 + 重定位（2 片稳定大控制场跟敌群走，不新增第三片）
			var oi = 0, od = Infinity
			for (var q = 0; q < icePools.length; q++) {
				var d = M.distSq(icePools[q].x, icePools[q].y, best.x, best.y)
				if (d < od) { od = d; oi = q }
			}
			var old = icePools[oi]
			old.x = best.x; old.y = best.y; old.r = poolR; old.life = linger; old.expire = GS.timeSec + linger
			old.growT = ICE_POOL_GROW_SEC; old.growDur = ICE_POOL_GROW_SEC   // 重定位后重生长，读「新场形成」
			emitIceFx(best.x, best.y, poolR, linger)
		}
		return true
	}
	// ⑥ 并发：敌是否落在任一活跃冰池（含生长中 effR）半径内（与 tickIce 判定一致）
	function isCovered(e, pools) {
		for (var p = 0; p < pools.length; p++) {
			var pp = pools[p], er = pp.r
			if (pp.growT > 0) { er = pp.r * (1 - pp.growT / pp.growDur) }
			var r = er + e.radius, dx = e.x - pp.x, dy = e.y - pp.y
			if (dx * dx + dy * dy <= r * r) { return true }
		}
		return false
	}
	// ⑥：从对象池取冰池并初始化 + 发视觉（新增/重定位共用）
	function spawnIcePool(x, y, r, linger) {
		var p = icePoolPool.acquire()
		p.x = x; p.y = y; p.r = r; p.life = linger; p.expire = GS.timeSec + linger
		p.growT = ICE_POOL_GROW_SEC; p.growDur = ICE_POOL_GROW_SEC   // 落地后生长动画（scale 0→1）
		icePools.push(p)
		emitIceFx(x, y, r, linger)
	}
	// ⑥：尾部甩冰锥（fx:ice_throw）→ 落点延迟霜环（fx:ice_pool）；纯表现零 gameplay
	function emitIceFx(x, y, r, linger) {
		var s = Registry.get('snake'); var segs = (s && s.segments) ? s.segments : []
		var tail = segs.length ? segs[segs.length - 1] : { x: x, y: y }
		Bus.emit('fx:ice_throw', { from: { x: tail.x, y: tail.y }, to: { x: x, y: y }, r: r, travel: ICE_THROW_SEC })   // 事件名全小写过 Bus 断言
		icePending.push({ at: GS.timeSec + ICE_THROW_SEC, x: x, y: y, r: r, life: linger })   // 冰锥到达落点→出霜环（pause-safe 延迟）
	}
	function comboLevelFor(id, levels) {
		var c = CO[id]; if (!c || !c.parts || !c.parts.length) { return 0 }
		var min = SK.maxLevel, missing = false
		for (var i = 0; i < c.parts.length; i++) {
			var v = levels ? (levels[c.parts[i]] || 0) : lvl(c.parts[i])
			if (v <= 0) { missing = true } else { min = Math.min(min, v) }
		}
		return missing ? 0 : Math.max(0, Math.min(SK.maxLevel, min))
	}
	function comboTierFor(id) {
		var level = comboLevelFor(id)
		return level >= 5 ? '高阶' : (level >= 3 ? '中阶' : (level >= 1 ? '初阶' : '未激活'))
	}
	function previewComboChanges(skillId, nextLevel) {
		var result = [], keys = Object.keys(CO), hypothetical = {}
		for (var i = 0; i < SK.list.length; i++) { hypothetical[SK.list[i]] = lvl(SK.list[i]) }
		hypothetical[skillId] = Math.max(0, Math.min(SK.maxLevel, nextLevel | 0))
		for (var k = 0; k < keys.length; k++) {
			var id = keys[k], before = comboLevelFor(id), after = comboLevelFor(id, hypothetical)
			if (after !== before) { result.push({ id: id, from: before, to: after, unlocks: before === 0 && after > 0 }) }
		}
		return result
	}

	function turretArray(name, level, fallback) {
		var a = CO.electroTurret[name] || fallback
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function turretVfx() { return (((CONFIG.VFX || {}).electric || {}).electro) || {} }
	function turretRadius(level) {
		var a = turretVfx().radiusByLevel || [28, 32, 36, 40, 44]
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function clampTurretCoord(v, radius, max) { return Math.max(radius, Math.min(max - radius, v)) }
	function deployElectroTurretAtHit(enemy) {
		var s = electroTurretState
		if (!foundCombo.electroTurret || s.active || s.redeployCooldown > 0 || !enemy) { return false }
		var level = comboLevelFor('electroTurret'); if (level <= 0) { return false }
		var h = headPos(), dx = enemy.x - h.x, dy = enemy.y - h.y, len = Math.sqrt(dx * dx + dy * dy), angle = len > 0.001 ? Math.atan2(dy, dx) : (h.angle || 0)
		var radius = turretRadius(level), clearance = CO.electroTurret.deployClearancePx
		var distance = enemy.radius + radius * 0.75 + clearance
		s.x = clampTurretCoord(enemy.x - Math.cos(angle) * distance, radius, CONFIG.GAME.worldWidth)
		s.y = clampTurretCoord(enemy.y - Math.sin(angle) * distance, radius, CONFIG.GAME.worldHeight)
		s.active = true; s.phase = 'deploy'; s.age = 0; s.comboLevel = level; s.shotsFired = 0; s.collapseSent = false
		s.nextShotAt = CO.electroTurret.firstShotSec
		Bus.emit('fx:electroturretdeploy', { x: s.x, y: s.y, comboLevel: level, radius: radius })
		return true
	}
	function turretTargets(s) {
		var radius = turretArray('attackRadiusByLevel', s.comboLevel, [170, 190, 220, 245, 270]), radius2 = radius * radius
		var minRange = CO.electroTurret.preferredMinRange, preferred = [], near = []
		for (var i = 0; i < _enemySnap.length; i++) {
			var e = _enemySnap[i]
			if (!e || !e.active || e.type === 'bossBullet' || e.invuln > 0) { continue }
			var d2 = M.distSq(s.x, s.y, e.x, e.y); if (d2 > radius2) { continue }
			;(Math.sqrt(d2) >= minRange ? preferred : near).push({ enemy: e, d2: d2 })
		}
		preferred.sort(function (a, b) { return a.d2 - b.d2 }); near.sort(function (a, b) { return a.d2 - b.d2 })
		var want = turretArray('targetsPerSalvoByLevel', s.comboLevel, [2, 2, 3, 3, 3]), selected = [], seen = {}
		function take(list) { for (var i = 0; i < list.length && selected.length < want; i++) { var e = list[i].enemy; if (!seen[e.id]) { seen[e.id] = true; selected.push({ id: e.id, x: e.x, y: e.y, enemy: e }) } } }
		take(preferred); take(near)
		return selected
	}
	function fireElectroTurretSalvo(s) {
		var targets = turretTargets(s), now = typeof GS.timeSec === 'number' ? GS.timeSec : 0
		electroDiag.electroAttempts++; if (electroDiag.electroLastTriggerSec >= 0) { electroDiag.electroLastGapSec = now - electroDiag.electroLastTriggerSec }
		electroDiag.electroLastTriggerSec = now
		if (targets.length) { Bus.emit('fx:electroturretfire', { x: s.x, y: s.y, comboLevel: s.comboLevel, targets: targets.map(function (t) { return { id: t.id, x: t.x, y: t.y } }) }) }
		for (var i = 0; i < targets.length; i++) { hurtCombo(targets[i].enemy, SK.lightning.damage[s.comboLevel - 1] * CO.electroTurret.damageMul, false, 'electro') }
		if (targets.length) { electroDiag.electroSuccess++; electroDiag.electroTargetsHit += targets.length } else { electroDiag.electroNoTarget++ }
	}
	function tickElectroTurret(dt) {
		var s = electroTurretState, cfg = CO.electroTurret
		if (!s.active) { if (s.redeployCooldown > 0) { s.redeployCooldown = Math.max(0, s.redeployCooldown - dt) }; return }
		s.age += dt
		var salvoCount = turretArray('salvoCountByLevel', s.comboLevel, [3, 3, 4, 4, 4])
		var interval = turretArray('salvoIntervalSecByLevel', s.comboLevel, [1.10, 1.05, 0.95, 0.90, 0.85])
		var lastShotAt = CO.electroTurret.firstShotSec + (salvoCount - 1) * interval
		var collapseAt = lastShotAt + CO.electroTurret.postFireHoldSec
		var endAt = collapseAt + CO.electroTurret.collapseSec
		if (s.phase === 'deploy' && s.age >= CO.electroTurret.firstShotSec) { s.phase = 'firing' }
		if (s.phase === 'firing' && s.shotsFired < salvoCount && s.age >= s.nextShotAt) {
			fireElectroTurretSalvo(s); s.shotsFired++; s.nextShotAt += interval
			if (s.shotsFired >= salvoCount) { s.phase = 'postFire' }
		}
		if (s.phase === 'postFire' && s.age >= collapseAt) { s.phase = 'collapse'; s.collapseSent = true; Bus.emit('fx:electroturretend', { x: s.x, y: s.y, comboLevel: s.comboLevel, radius: turretRadius(s.comboLevel) }) }
		if (s.age >= endAt) { s.active = false; s.phase = 'inactive'; s.redeployCooldown = cfg.redeployCooldownSec }
	}
	function tickBolt(dt) {
		var i = idx('bolt'); timer.bolt -= dt
		if (timer.bolt > 0) { return }
		timer.bolt = 1 / SK.bolt.fireRate[i]
		var h = headPos(), es = _enemySnap.slice(), maxR2 = SK.bolt.maxRange[i] * SK.bolt.maxRange[i]   // #4 修复：拷贝快照本地排序，避免污染共享 _enemySnap；P1-1 射程门控
		es.sort(function (a, b) { return M.distSq(h.x, h.y, a.x, a.y) - M.distSq(h.x, h.y, b.x, b.y) })
		var n = Math.min(SK.bolt.nodes[i], es.length), fired = 0
		// V4.2 视觉节奏：Gameplay 射速/伤害不变；Lv2~5 仅将同轮多目标 VFX 依次错峰 16/18/20/22ms，减少机关枪式重叠。
		var visualStep = i >= 4 ? 0.050 : (i === 3 ? 0.045 : (i === 2 ? 0.040 : (i === 1 ? 0.030 : 0)))
		for (var k = 0; k < es.length && fired < n; k++) {
			if (M.distSq(h.x, h.y, es[k].x, es[k].y) > maxR2) { break }
			var target = es[k]
			hurt(target, SK.bolt.damage[i], false, 'bolt')
			Bus.emit('fx:bolt', {
				from: { x: h.x, y: h.y }, to: { x: target.x, y: target.y }, targetId: target.id, targetRadius: target.radius,
				level: i + 1, shotIndex: fired, shotCount: n, visualDelay: fired * visualStep, killed: !target.active
			})
			if (foundCombo.electroTurret) { deployElectroTurretAtHit(target) }
			fired++
		}
	}
	function queueBurn(target, at, burnDps) {
		if (!target) { return }
		for (var i = 0; i < burnPending.length; i++) { if (burnPending[i].targetId === target.id) { burnPending[i].at = Math.min(burnPending[i].at, at); burnPending[i].burnDps = Math.max(burnPending[i].burnDps, burnDps); return } }
		burnPending.push({ targetId: target.id, at: at, burnDps: burnDps })
	}
	function resolveBurnPending() {
		if (!burnPending.length) { return }
		var En = Registry.get('enemy'), list = En && En.list
		for (var i = burnPending.length - 1; i >= 0; i--) {
			var q = burnPending[i]; if (q.at > GS.timeSec) { continue }
			var target = null
			if (list) { for (var k = 0; k < list.length; k++) { if (list[k].active && list[k].id === q.targetId) { target = list[k]; break } } }
			if (target) {
				En.ignite(target, CO.burningBarrage.burnSec, q.burnDps)
				var _p = Registry.get('particle'); if (_p && _p.incIgnite) { _p.incIgnite() }
			}
			burnPending.splice(i, 1)
		}
	}
	function tickBurningBarrage(dt) {
		resolveBurnPending()
		if (!foundCombo.burningBarrage) { timer.burningBarrage = 0; burnPending.length = 0; return }
		timer.burningBarrage -= dt
		if (timer.burningBarrage > 0) { return }
		var bi = idx('bolt'), tail = tailPos(), maxR2 = SK.bolt.maxRange[bi] * SK.bolt.maxRange[bi], es = _enemySnap.slice()
		es.sort(function (a, b) { return M.distSq(tail.x, tail.y, a.x, a.y) - M.distSq(tail.x, tail.y, b.x, b.y) })
		var targets = []
		for (var i = 0; i < es.length && targets.length < BURN_BARRAGE_DARTS; i++) {
			if (M.distSq(tail.x, tail.y, es[i].x, es[i].y) > maxR2) { break }
			targets.push(es[i])
		}
		if (!targets.length) { timer.burningBarrage = 0.25; return }
		timer.burningBarrage = BURN_BARRAGE_INTERVAL_SEC
		var cl = Math.max(1, comboLevelFor('burningBarrage')), burnDps = CO.burningBarrage.burnDpsByLevel[cl - 1]
		for (var shot = 0; shot < BURN_BARRAGE_DARTS; shot++) {
			var target = targets[shot % targets.length]
			var dx = target.x - tail.x, dy = target.y - tail.y, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L
			var lane = (shot - 1) * 8, delay = shot * BURN_BARRAGE_STAGGER_SEC
			Bus.emit('fx:burndart', {
				from: { x: tail.x + nx * lane * 0.35, y: tail.y + ny * lane * 0.35 },
				to: { x: target.x, y: target.y }, targetId: target.id, targetRadius: target.radius,
				level: cl, shotIndex: shot, shotCount: BURN_BARRAGE_DARTS,
				visualDelay: delay, travel: BURN_BARRAGE_TRAVEL_SEC
			})
			var already = false
			for (var q = 0; q < shot; q++) { if (targets[q % targets.length].id === target.id) { already = true; break } }
			if (!already) { queueBurn(target, GS.timeSec + delay + BURN_BARRAGE_TRAVEL_SEC, burnDps) }
		}
	}

	// 链式选敌（lightning / electroTurret 共用，避免复制走样）。px,py=源点；hops=跳跃数；damageBase 经 hurt()（吃蛇长+暴击）；maxR2=首跳射程平方
	function doLightningChain(px, py, hops, damageBase, maxR2, useCombo, vfxEvent, srcTag, skipNearHeadR, impactRadius) {
		var poolE = _enemySnap, hit = {}, chain = [{ x: px, y: py }], hitCount = 0
		impactRadius = impactRadius != null ? impactRadius : 0
		chain.vfxMeta = { level: idx('lightning') + 1, originKind: 'head' }
		var li = idx('lightning'), jumpR2 = SK.lightning.chainJumpRange[li] * SK.lightning.chainJumpRange[li]   // #5 链跳跃半径门控（config 驱动，防跨全场连锁）
		for (var c = 0; c < hops; c++) {
			var best = null, bd = Infinity
			for (var k = 0; k < poolE.length; k++) {
				var e = poolE[k]; if (!e || !e.active || e.type === 'bossBullet' || hit[e.id]) { continue }
				var d = M.distSq(px, py, e.x, e.y)
			if (c === 0) {   // 首跳：射程门控 + ② 内圈死区（火环半径内不索敌，交给火墙/护盾）
				if (d > maxR2) { continue }
				if (skipNearHeadR > 0 && d < skipNearHeadR * skipNearHeadR) { continue }
			} else {   // 后续跳跃：链跳跃半径门控（SK.lightning.chainJumpRange，仅连附近敌，防跨全场）
				if (d > jumpR2) { continue }
			}
				if (d < bd) { bd = d; best = e }
			}
		if (!best) { break }
		hit[best.id] = true
		hitCount++
		if (useCombo) { hurtCombo(best, damageBase, false, srcTag || 'lightning') } else { hurt(best, damageBase, false, srcTag || 'lightning') }   // B-4 验收①a：电磁连锁经 srcTag='electro' 走独立紫飘字 + 独立伤害数字
			chain.push({ id: best.id, x: best.x, y: best.y }); px = best.x; py = best.y   // 链式跳跃 + 收集链条节点
		}
		if (chain.length > 1) { Bus.emit(vfxEvent || 'fx:lightning', { chain: chain }) }   // 基础闪电链视效保持原事件与链条
		return { chain: chain, hitCount: hitCount }
	}
	function tickLightning(dt) {
		var i = idx('lightning'); timer.lightning -= dt; if (timer.lightning > 0) { return }
		timer.lightning = SK.lightning.intervalSec[i]
		var h = headPos(), maxR2 = SK.lightning.maxRange[i] * SK.lightning.maxRange[i]   // P1-1 首跳射程门控
		var fi = idx('fire')
		var deadR = owns('fire') ? RT('SKILL.fire.radius.' + fi, SK.fire.radius[fi]) : 0   // ② 闪电内圈死区=当前火环半径（动态跟随火等级）；无火则 0（不跳过）
		doLightningChain(h.x, h.y, SK.lightning.chains[i], SK.lightning.damage[i], maxR2, false, undefined, 'lightning', deadR)   // 基础闪电：srcTag='lightning'（蓝白飘字，区别于电磁紫）；传死区半径
	}
	function tickShield(dt) {
		var i = idx('shield'), h = headPos()
		var count = SK.shield.count[i], dmg = SK.shield.contactDamage[i]
		var orbR = RT('SKILL.shield.orbitRadius.' + i, SK.shield.orbitRadius[i])   // B-2：读 config 环绕半径；B-GM 实时桥：拖动即时生效
		var base = (GS.timeSec / SK.shield.orbitSec) * M.PI2   // B-2：读 config 环绕周期（取代写死常量）
		for (var o = 0; o < count; o++) {
			var a = base + o / count * M.PI2
			var ox = h.x + Math.cos(a) * orbR, oy = h.y + Math.sin(a) * orbR
			var es = enemiesIn(ox, oy, orbR * SK.shield.orbitHitMul)   // ② 0.5 提进 config：护盾球命中半径=orbitRadius×orbitHitMul（消失落裸数字）
			for (var k = 0; k < es.length; k++) { hurt(es[k], dmg * dt, true, 'shield') }                  // MVP：接触按 dps 结算（⑦ 标记 isDot）
		}
	}

	// —— Combo 检测 + MVP 效果 ——
	function comboReady(c) { return owns(c.parts[0]) && owns(c.parts[1]) }
	function checkCombos() {
		var keys = Object.keys(CO)
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i], c = CO[key]
			var active = comboLevelFor(key) > 0, was = !!foundCombo[key]
			foundCombo[key] = active
			if (active && !was) { GS.comboScore += ECON.comboFindScore; Bus.emit('combo:found', { id: key }) }
		}
	}
function tickCombos(dt) {
	tickBurningBarrage(dt)
	var _pdbg = (function () { var _pp = Registry.get('particle'); return (_pp && _pp.DBG) ? _pp.DBG : null })()   // b9-measure：只读计数器句柄（蒸汽引爆/邻居比较），零 gameplay
	if (foundCombo.steamExplosion) {                 // ④ 火+冰：火墙扫到带冰敌 → 该敌位置引爆蒸汽 AOE；冰只作触发条件（slowT>0），无直伤；per-enemy 2.0s 节流（复用 COMBO_STEAM_INTERVAL_SEC，零新数值）
		var fi = idx('fire')
		var fr = RT('SKILL.fire.radius.' + fi, SK.fire.radius[fi])   // 与 tickFire 共用连续火域精确几何
		var segs = fireSegmentsList(), fireBounds = buildFireBounds(segs, fr, _steamFireBounds)
		var all = _enemySnap
		var steamFxCap = RT('PERF.steamBurstCapPerFrame', CONFIG.PERF.steamBurstCapPerFrame)   // 🟡 性能护栏(非 §9 平衡值·b9)：齐爆同帧 VFX 上限，候选 8/10/12；仅门控视觉，不影响平衡
		var steamFxCount = 0
		for (var n = 0; n < all.length; n++) {
			var e = all[n]
			if (!e.inIce) { continue }                   // ⑥ 修复：仅当敌本帧真在冰池内（inIce，tickIce 实时置位）才引爆；排除「离开冰池但 slowT 残留」误触发，杜绝冰圈外的蒸汽爆炸（tickIce 先于本函数，数据新鲜）
			if (!enemyTouchesFireTube(e, segs, fr, fireBounds)) { continue }   // Fire 与基础 DOT 共用同一精确连续范围
			if (e.steamCd > 0) { continue }              // per-enemy 节流（复用 COMBO_STEAM_INTERVAL_SEC=2.0，不新增数值）
		e.steamCd = COMBO_STEAM_INTERVAL_SEC          // 先置位冷却（消耗该敌 steam 窗口，防漏炸后永久逃逸）；视觉上限不影响伤害结算
		var es2 = enemiesIn(e.x, e.y, CO.steamExplosion.radius)
		if (_pdbg) { _pdbg.steamBlasts++; _pdbg.steamAoeCmp += es2.length }   // b9-measure：只读计数（真引爆次数 + AOE 邻居比较总次数），不改逻辑/伤害
			for (var m = 0; m < es2.length; m++) {
				// §4.6/§9：基础伤害 = 火焰当前等级 DOT/s × damageMul，不叠 effectMul（comboDamage），保留暴击
				hurtCombo(es2[m], SK.fire.dotPerSec[fi] * CO.steamExplosion.damageMul, false, 'steam')
			}
			if (steamFxCount < steamFxCap) {   // 仅门控视觉 VFX（白闪+爆环+橙粒）；伤害始终结算，敌仍死
				Bus.emit('fx:steamblast', { x: e.x, y: e.y, radius: CO.steamExplosion.radius, hitCount: es2.length })   // ④-B：带 hitCount 供 render 帧末聚合屏震；爆环对准真实爆心（该敌位置）；事件名全小写以过 Bus 断言
				steamFxCount++
			}
		}
	}
	// 电磁炮台部署与齐射由 tickBolt/tickElectroTurret 驱动；基础闪电仍只走 tickLightning。
}

	// —— 3 选 1（保底 guaranteeAttack 攻 + guaranteeSurvival 生）——
	function isAttack(id) { return SK.attackSkills.indexOf(id) >= 0 }
	function candidates(starterOnly) {
		var out = [], k = SK.list, maxed = []
		for (var i = 0; i < k.length; i++) {
			var id = k[i], L = lvl(id)
			if (L === 0 && (!starterOnly || SK.starterEligible[id])) { out.push({ id: id, level: 1, isNew: true }) }
			else if (L < SK.maxLevel) { out.push({ id: id, level: L + 1, isNew: false }) }
			else { maxed.push(id) }   // L>=maxLevel 不进候选 → 不会出现「选了还是满级」
		}
		Log.info('[GATE] candidates=' + out.length + ' maxedExcluded=' + (maxed.length ? maxed.join(',') : '—'))
		return out
	}
	function buildOffer() {
		var firstOffer = (GS.upgradesThisRun || 0) === 0
		var cand = candidates(firstOffer); if (cand.length === 0) { return [] }
		var atk = [], sur = [], i
		for (i = 0; i < cand.length; i++) { (isAttack(cand[i].id) ? atk : sur).push(cand[i]) }
		var picks = [], used = {}
		function take(arr) { if (!arr.length) { return } var j = (Math.random() * arr.length) | 0, c = arr[j]; if (used[c.id]) { return } used[c.id] = true; picks.push(c) }
		for (i = 0; i < ECON.guaranteeAttack; i++) { take(atk) }
		for (i = 0; i < ECON.guaranteeSurvival; i++) { take(sur) }
		var rest = []
		for (i = 0; i < cand.length; i++) { if (!used[cand[i].id]) { rest.push(cand[i]) } }
		while (picks.length < ECON.choiceCount && rest.length) {     // 按权重（新 newSkillWeight / 升级 upgradeWeight）补满
			var wsum = 0, wi
			for (wi = 0; wi < rest.length; wi++) { wsum += rest[wi].isNew ? ECON.newSkillWeight : ECON.upgradeWeight }
			var roll = Math.random() * wsum, acc = 0, chosen = rest.length - 1
			for (wi = 0; wi < rest.length; wi++) { acc += rest[wi].isNew ? ECON.newSkillWeight : ECON.upgradeWeight; if (roll <= acc) { chosen = wi; break } }
			used[rest[chosen].id] = true; picks.push(rest[chosen]); rest.splice(chosen, 1)
		}
		return picks
	}
	function offer() {
		var picks = buildOffer(); if (picks.length === 0) { return }
		GS.status = 'choosing'                         // 暂停世界，等 UI 选择
		Bus.emit('skill:offer', { choices: picks })
	}
	function pick(id) {
		var c = candidates((GS.upgradesThisRun || 0) === 0), ok = null
		for (var i = 0; i < c.length; i++) { if (c[i].id === id) { ok = c[i]; break } }
		if (!ok) { Log.warn('技能选择非法：' + id); return }
		GS.ownedSkills[id] = ok.level
		if (!GS.firstSkillPickSec && (GS.upgradesThisRun || 0) === 0) { GS.firstSkillPickSec = GS.timeSec }   // S4：记录本局首个技能(=首球)拾取时刻，验证"保护期内尝到升级"（首球5s掉、其余受20s地板压制，首个必为首球）
		GS.upgradesThisRun = (GS.upgradesThisRun || 0) + 1   // C：本局累计升级+1（每次选择=1次，口径与「点满5技能需25次」一致）
		var _gi = (GS.stageId || 1) - 1; if (_gi >= 0 && _gi < 5 && GS.upgradesBySeg) { GS.upgradesBySeg[_gi] = (GS.upgradesBySeg[_gi] || 0) + 1 }   // S4：技能经济仪表·每段升级计数
		Log.info('[GATE] pick ' + id + '→Lv' + ok.level + ' (upgradesThisRun=' + GS.upgradesThisRun + ')')   // A#1 诊断：确认选的是候选内合法技能
		Bus.emit('skill:gained', { id: id, level: ok.level })
		checkCombos()
		if (GS.status === 'choosing') { GS.status = 'playing' }
	}

	// —— B-GM 调试入口（仅 dev 测试用，不改 gameplay 默认值/公式）——
	function debugActivateCombo(id) {                 // 单 combo 激活：点亮对应横幅+音效，不影响其他
		if (!CO[id]) { Log.warn('[调试] 未知 combo：' + id); return }
		for (var k = 0; k < CO[id].parts.length; k++) { var p = CO[id].parts[k]; if (!owns(p)) { GS.ownedSkills[p] = 1 } }  // 部件未持有则先给 1 级
		if (!foundCombo[id]) { foundCombo[id] = true; GS.comboScore += ECON.comboFindScore; Bus.emit('combo:found', { id: id }) }
		Log.info('[调试] 激活 combo：' + id)
	}
	function debugMaxAll() {                          // 立即满级：五技能 Lv5 + 触发 combo 检测
		var ks = SK.list
		for (var i = 0; i < ks.length; i++) { GS.ownedSkills[ks[i]] = SK.maxLevel }
		checkCombos()
		Log.info('[调试] 全部技能满级 Lv' + SK.maxLevel)
	}
	function debugSetSkill(id, level) {               // 标定沙盒：仅给指定技能 Lv N，清空其余（不像 debugMaxAll 全塞）
		if (SK.list.indexOf(id) < 0) { Log.warn('[调试] 未知技能：' + id); return }
		level = Math.max(1, Math.min(SK.maxLevel, level | 0))
		GS.ownedSkills = {}
		GS.ownedSkills[id] = level
		checkCombos()
		Log.info('[调试] 单技能激活：' + id + ' Lv' + level)
	}

	var Skill = {
		owned: function () { return GS.ownedSkills }, offer: offer, pick: pick,
		getComboLevel: function (id) { return comboLevelFor(id) },
		getComboTier: function (id) { return comboTierFor(id) },
		previewComboChanges: function (skillId, nextLevel) { return previewComboChanges(skillId, nextLevel) },
		getElectricDiag: function () {
			return {
				electroAttempts: electroDiag.electroAttempts, electroSuccess: electroDiag.electroSuccess, electroNoTarget: electroDiag.electroNoTarget,
				electroTargetsHit: electroDiag.electroTargetsHit, electroLastTriggerSec: electroDiag.electroLastTriggerSec, electroLastGapSec: electroDiag.electroLastGapSec,
				electroRuntimeCooldown: CO.electroTurret.redeployCooldownSec, electroTimerRemaining: electroTurretState.redeployCooldown,
				electroTurretActive: electroTurretState.active, electroTurretPhase: electroTurretState.phase, electroTurretShotsFired: electroTurretState.shotsFired
			}
		},
		allMaxed: function () { return candidates().length === 0 },   // 战线B 满级闸门同源判定：候选为空＝无更多有效升级（与 buildOffer/offer 完全一致，杜绝双份真相漂移；09_wave 经此门控停刷技能球）
		debugActivateCombo: debugActivateCombo, debugMaxAll: debugMaxAll, debugSetSkill: debugSetSkill,
		update: function (dt) {
			if (GS.status !== 'playing') { return }    // 依赖：本帧应在 collision.update 之后调用（queryCircle 哈希新鲜）
			_enemySnap = allEnemies()   // 每帧一次敌列快照：tickBolt/dropIcePool/tickCombos/doLightningChain 复用，消除重复 allEnemies 分配（零行为变化）
			if (owns('fire')) { tickFire(dt) }
			if (owns('ice')) { tickIce(dt) }
			if (owns('bolt')) { tickBolt(dt) }
			tickElectroTurret(dt)
			if (owns('lightning')) { tickLightning(dt) }
			if (owns('shield')) { tickShield(dt) }
		tickCombos(dt)
	},
	getIcePools: function () { return icePools },   // ⑥：render 读此画真实冰池（看到的=打到的）
	getFireFieldVisualAlpha: getFireFieldVisualAlpha   // Fire V1.7：render 只读热蚀表现强度；不暴露/改变伤害状态
}

	Bus.on('pickup:eat', function (d) { if (d && d.kind === 'skill') { offer() } })
	Bus.on('core:run_reset', function () {
		electroDiag.electroAttempts = 0; electroDiag.electroSuccess = 0; electroDiag.electroNoTarget = 0; electroDiag.electroTargetsHit = 0
		electroDiag.electroLastTriggerSec = -1; electroDiag.electroLastGapSec = 0
		foundCombo = {}; fireContactPrev = {}; fireFieldVisualUntil = {}; timer.bolt = 0; timer.lightning = 0; timer.burningBarrage = 0; burnPending.length = 0
		electroTurretState.active = false; electroTurretState.phase = 'inactive'; electroTurretState.x = 0; electroTurretState.y = 0; electroTurretState.age = 0; electroTurretState.comboLevel = 1; electroTurretState.shotsFired = 0; electroTurretState.nextShotAt = 0; electroTurretState.collapseSent = false; electroTurretState.redeployCooldown = 0
		icePools.length = 0; icePending.length = 0; timer.ice = 0   // ⑥：清空冰池 + 延迟霜环队列 + 复位 CD，防重开残留/NaN
	})

	Registry.register('skill', Skill)
	Log.info('skill 就绪：5 技能 × Lv' + SK.maxLevel)

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · P1-② electroTurret/burningBarrage · skill 侧：tickBolt burningBarrage 引燃、tickCombos electroTurret 链式电击（复用电磁炮台 timing + doLightningChain） · 不动 §9
// 2026-07-11 · Combo 契约修正（commit 1）· skill 侧：新增 Formula.comboDamage 不叠 effect 口径；hurtCombo 助手；doLightningChain 加 useCombo 开关；tickBolt 加「bolt 命中触发连锁闪电 + 全局冷却」取代原周期 electroTurret；tickCombos steamExplosion 改走 comboDamage（火焰 DOT/s ×2.5，冰只控不伤）、删除 electroTurret 周期块 · 真理源 §4.6/§9 已对齐
// 2026-07-14 · ④ 蒸汽状态引爆 · skill 侧：tickCombos 蒸汽分支由「蛇头周期 AOE」改为「火墙扫到带冰敌(e.slowT>0)×per-enemy 2.0s 冷却→该敌位置引爆」；移除全局 timer.steam（timer 声明与 run_reset 一并清理）；复用 enemiesIn(RT fire.radius/segStep) 判火墙内、hurtCombo(fire.dotPerSec×damageMul, src='steam')、fx:steamblast 爆环对准敌位；零新数值、不碰闪电/core/collision/config · 真源 §9 已回写
// 2026-07-15 · ⑥ 冰冻机制重做 · skill 侧：tickIce 由「蛇尾常驻尾迹」重写为「freezeCd 周期触发 → 以蛇头为源 seekRange 内索敌最密敌群 → dropIcePool 落冰池(poolRadius, 存续 poolLingerSec)」；iceZones→icePools、getIceZones→getIcePools、timer.ice CD；池内圆-圆判定 applySlow(pct=freeze?1:slowPct, win=freeze?lv5FreezeSec:poolLingerSec)；发出 fx:ice_pool(尾→池, 纯表现)；④ 蒸汽引爆遍历 e.slowT>0 不变、07_enemy.applySlow 不变、core/collision 不动 · 数值全走 config + RT() 实时桥，禁硬编码
// 2026-07-15 · ⑥ 首测修复 · A(表现层·零 gameplay)：dropIcePool 改发 fx:ice_throw(尾→落点冰锥飞行 travel=ICE_THROW_SEC) + 延迟队列 icePending(GS.timeSec 驱动·pause-safe) 待冰锥到达再发 fx:ice_pool(霜环)；冰池加 growT/growDur 生长字段，tickIce 按 effR=poolR*(1-growT/growDur) 缩放判定、render 按同比例缩放视觉(看到的=打到的)；05_particle 拆 fx:ice_throw(冰锥+预告霜环)/fx:ice_pool(落点霜环) · B(数值·§4.2 真源)：poolRadius 改 [55,65,75,85,95](冻整簇·与蒸汽90px协调)；蒸汽半径90不动 · ICE_THROW_SEC/ICE_POOL_GROW_SEC 为 🟡 表现常量(候选待 ~ 定稿)，禁硬编码 gameplay 值
// 2026-07-15 · ⑥ 两处修复 · ①蒸汽误炸冰圈外：tickCombos 蒸汽触发 e.slowT>0 → e.inIce（仅本帧真在冰池内才引爆，排除离开冰池后 slowT 残留的误触发；tickIce 先于 tickCombos，inIce 新鲜）；②触发节奏不稳：dropIcePool 改返回 bool，无目标时不空耗整轮 CD、改 ICE_RETRY_SEC(0.5🟡) 短间隔重试，敌群进射程即落、有目标仍严格每 freezeCd。07_enemy/core/collision/config 不动、无新裸数字
// 2026-07-15 · ⑥ 系统性调整（大范围·持续控制场·首测后一次到位）· 数值(02_config SKILL.ice)：poolLingerSec 4.0 flat → 按等级[4,5,6,7,8]（冰池存续拉长·聚怪+火墙多次扫爆）；新增 maxActivePools=2（并发上限）；poolRadius [55..95]→[90,110,130,150,170]（全等级≥蒸汽90px·冰圈≥爆圈）；freezeCd=3.0/slowPct/Lv5冻结1s不动；蒸汽radius=90不动(选A·仅e.inIce防冰圈外凭空引爆)。机制(08_skill dropIcePool/tickIce)：索敌改为「射程内未被现有冰池覆盖的最密敌群」(isCovered 辅助·与判定一致)；未达并发上限→spawnIcePool 新增；已达上限→刷新「距新目标最近」那片并重定位(2片稳定大控制场跟敌群走·不新增第三片)；slowWin 按等级取 poolLingerSec[i]。表现(11_render)：冰池撒布霜点(沿 pr 半径·铺满大范围)+外环强调边界。无新致死源/不预调其它系统；放大后 DPS/密度平衡留 ③ 校验。config/core/collision 不动、无新裸数字
// 2026-07-15 · b9 性能/屏震专项 · ❷蒸汽齐爆 VFX 同帧上限(PERF.steamBurstCapPerFrame·仅门控视觉 Bus.emit，伤害 hurtCombo 始终结算、steamCd 先置位)；任务2 屏震分档节流由 render addTrauma(T1 轻档)承接，本文件不动屏震。core/collision 不动、无新裸数字

// 2026-08-07 · 飞镖技能族 V4 · tickBolt 仅增加 level/targetId/shotIndex/visualDelay/killed 表现元数据；伤害、点燃、电磁联动与所有 gameplay 数值保持原时点。
