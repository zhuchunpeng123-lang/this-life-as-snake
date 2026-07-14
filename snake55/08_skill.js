;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M, Formula = Core.Formula
	var SK = CONFIG.SKILL, CO = CONFIG.COMBO, ECON = CONFIG.ECON, CB = CONFIG.COMBAT

// 🟡 真理源未量化的表现/节奏，占位 + 候选，待回写
// ⚠ ICE_SLOW_LINGER_SEC 已废弃：减速跟随短窗改走 config SKILL.ice.slowLingerSec（B-2 必改项：L1–4 每帧刷新短窗，离开约 slowLingerSec 恢复；L5 冻结用 lv5FreezeSec）
var COMBO_STEAM_INTERVAL_SEC = 2.0  // TODO: 待确认（候选 1.5 / 3.0）
// —— B-2 冰冻真轨迹：蛇尾经过处滞留数秒的地面冰区（对象池 + 活动表，render 读此画）——
var ICE_ZONE_CAP = 256              // 🟡 perf 债：冰区池上限，防 lingerSec 拖大爆量；每帧「冰区×queryCircle」扫描已登 DEBT
var iceZonePool = Core.createPool(
  function () { return { x: 0, y: 0, r: 0, life: 0, expire: 0 } },
  function (z) { z.x = 0; z.y = 0; z.r = 0; z.life = 0; z.expire = 0 },
  ICE_ZONE_CAP
)
var iceZones = []                   // 活跃冰区（render.read）
var iceLastTail = null              // 上次采样尾点（间距判定，保证连续无缝）
	// ⚠ COMBO_ELECTRO_INTERVAL_SEC 已废弃：原周期 electroTurret 触发器已改为「bolt 命中触发 + 全局冷却」，
	//   冷却语义由 CONFIG.COMBO.electroTurret.cooldownSec（§9 2026-07-11 已登记，单源 config 支持 ~ 编辑器/localStorage 热调）承接，不再留作本地常量。

	var timer = { bolt: 0, lightning: 0, electro: 0 }   // ④ 移除 steam（改 per-enemy 冷却，见 enemy.steamCd）
	var foundCombo = {}

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
	function segmentsList() { var s = Registry.get('snake'); return (s && s.segments) ? s.segments : [] }   // B-2：沿蛇身逐节判定用

	// 局部 AOE：走 collision.queryCircle（半径有界）；过滤 bossBullet
	function enemiesIn(x, y, r) {
		var col = Registry.get('collision'); if (!col) { return [] }
		var raw = col.queryCircle(x, y, r), out = []
		for (var i = 0; i < raw.length; i++) { var e = raw[i]; if (e.active && e.type !== 'bossBullet') { out.push(e) } }
		return out
	}
	// 全屏索敌：走 Enemy.list（避免 queryCircle 大半径遍历海量空格子）
	function allEnemies() {
		var En = Registry.get('enemy'); if (!En || !En.list) { return [] }
		var out = [], l = En.list
		for (var i = 0; i < l.length; i++) { var e = l[i]; if (e.active && e.type !== 'bossBullet') { out.push(e) } }
		return out
	}
	function hurt(e, base, isDot, src) {   // src=伤害来源标签（B-1 纯表现，仅透传给飘字，不参与伤害计算）
		var crit = Math.random() < CB.critRate
		Registry.get('enemy').applyDamage(e, Formula.damage(base, GS.segments, crit), crit, isDot, src)   // ⑦ isDot 透传：DOT 由 enemy 聚合飘字
	}
	function hurtCombo(e, base, isDot, src) {   // Combo 独立口径：不叠 effectMul，仅保留暴击（§4.6 / §9 2026-07-11）
		var crit = Math.random() < CB.critRate
		Registry.get('enemy').applyDamage(e, Formula.comboDamage(base, crit), crit, isDot, src)
	}

	// —— 五技能主动效果（按拥有等级取数组）——
	function tickFire(dt) {
		var i = idx('fire')
		var segs = segmentsList(), step = SK.fire.segStep[i] || 1, r = RT('SKILL.fire.radius.' + i, SK.fire.radius[i])   // B-GM 实时标定桥：拖动即时生效
		var hit = {}   // B-2：同帧同敌去重，避免多节重叠重复结算 DOT
		for (var s = 0; s < segs.length; s += step) {
			var es = enemiesIn(segs[s].x, segs[s].y, r)
			for (var k = 0; k < es.length; k++) { if (hit[es[k].id]) { continue } hit[es[k].id] = true; hurt(es[k], SK.fire.dotPerSec[i] * dt, true, 'fire') }   // 火墙沿整蛇身（⑦ 标记 isDot）
		}
	}
	function tickIce(dt) {
		var i = idx('ice'), En = Registry.get('enemy')
		var segs = segmentsList()
		if (segs.length === 0) { return }
		var r = RT('SKILL.ice.trailWidth.' + i, SK.ice.trailWidth[i]) / 2   // B-2 对齐：命中半径=视觉半径（trailWidth/2）；B-GM 实时桥
		// —— 尾迹采样：仅在蛇尾移动 ≥ r 时生成冰区（真轨迹，不随蛇身移动；间距=r 保证连续无缝）——
		var tail = segs[segs.length - 1]
		if (!iceLastTail) { iceLastTail = { x: tail.x, y: tail.y } }
		var tdx = tail.x - iceLastTail.x, tdy = tail.y - iceLastTail.y
		if (tdx * tdx + tdy * tdy >= r * r && iceZones.length < ICE_ZONE_CAP) {   // 间距达 r → 生成；超上限暂停（防爆量）
			var linger = RT('SKILL.ice.lingerSec.' + i, SK.ice.lingerSec[i])       // 冰区滞留时长（🟡 初值待 §9 回填）
			var z = iceZonePool.acquire()
			z.x = tail.x; z.y = tail.y; z.r = r; z.life = linger; z.expire = GS.timeSec + linger
			iceZones.push(z)
			iceLastTail.x = tail.x; iceLastTail.y = tail.y
		}
		// —— 过期回收（原地滞留数秒后消失，不随蛇移动）——
		for (var k = iceZones.length - 1; k >= 0; k--) {
			if (iceZones[k].expire <= GS.timeSec) { iceZonePool.release(iceZones[k]); iceZones.splice(k, 1) }
		}
		// —— 减速施加（沿冰区精确圆-圆判定，与渲染冰区圆严格一致）——
		var pct = RT('SKILL.ice.slowPct.' + i, SK.ice.slowPct[i])
		var slowWin = RT('SKILL.ice.slowLingerSec', SK.ice.slowLingerSec)   // 减速跟随短窗：每帧刷新，离开约 slowLingerSec 恢复（≠ 冰区滞留时长）
		if (lvl('ice') >= SK.maxLevel) { pct = 1; slowWin = SK.ice.lv5FreezeSec }   // Lv5 冻结仍用 lv5FreezeSec
		for (var j = 0; j < iceZones.length; j++) {
			var zz = iceZones[j]
			var es = enemiesIn(zz.x, zz.y, zz.r)             // 🟡 perf 债：每帧每冰区一次 queryCircle 扫描（已登 DEBT）
			for (var m = 0; m < es.length; m++) {
				var e = es[m]
				var cdx = e.x - zz.x, cdy = e.y - zz.y, crr = zz.r + e.radius   // 精确圆-圆：与渲染冰区圆严格一致（看到的=打到的）
				if (cdx * cdx + cdy * cdy <= crr * crr) { En.applySlow(e, pct, slowWin); e._iceHit = true }
			}
		}
		// —— 进入检测（两遍法：本帧命中置 _iceHit，再判 inIce 变化触发飘字）——
		var all = allEnemies()
		for (var n = 0; n < all.length; n++) {
			var en = all[n]
			var was = en.inIce; en.inIce = !!en._iceHit; en._iceHit = false
			if (en.inIce && !was) { Bus.emit('fx:iceslow', { x: en.x, y: en.y, r: en.radius }) }   // 坐标用敌人位置；事件名全小写过 Bus 断言
		}
	}
	function tickBolt(dt) {
		var i = idx('bolt'); timer.bolt -= dt; timer.electro -= dt   // P2 修复：电磁冷却每帧推进（移出 return 之后）；恢复真源 §4.6 冻结的 cooldownSec=0.5s 真正生效（bug 修复非数值改动，不改 cooldownSec 值本身、不回写真源）
		if (timer.bolt > 0) { return }
		timer.bolt = 1 / SK.bolt.fireRate[i]
		var h = headPos(), es = allEnemies(), maxR2 = SK.bolt.maxRange[i] * SK.bolt.maxRange[i]   // P1-1 射程门控
		es.sort(function (a, b) { return M.distSq(h.x, h.y, a.x, a.y) - M.distSq(h.x, h.y, b.x, b.y) })
		var n = Math.min(SK.bolt.nodes[i], es.length), fired = 0
		for (var k = 0; k < es.length && fired < n; k++) {
			if (M.distSq(h.x, h.y, es[k].x, es[k].y) > maxR2) { break }   // 已按距离排序，后续只会更远
			var boltSrc = foundCombo.burningBarrage ? 'burning' : 'bolt'   // P1 修复：飞镖命中即飞镖伤害，标 'bolt' 青「飞镖」；电磁标签只留给连锁(doLightningChain 用 'electro')，不再误贴到 bolt 命中（曾误把每次飞镖伤害全贴『电磁』掩盖真连锁）；仅飘字前缀、零 gameplay；灼烧弹幕仍标 'burning' 橙
		hurt(es[k], SK.bolt.damage[i], false, boltSrc)
			Bus.emit(foundCombo.burningBarrage ? 'fx:burndart' : 'fx:bolt', { from: { x: h.x, y: h.y }, to: { x: es[k].x, y: es[k].y } })   // P1-5 弹道视效（灼烧弹幕走 fx:burndart 橙，其余白黄）
			if (foundCombo.burningBarrage) { Registry.get('enemy').ignite(es[k], CO.burningBarrage.burnSec, CO.burningBarrage.burnDps) }   // 灼烧弹幕：飞镖命中点燃（固定 dps，不经 Formula）
			if (foundCombo.electroTurret && timer.electro <= 0) {   // 电磁炮台：bolt 命中触发连锁闪电（§4.6/§9 2026-07-11）；走 comboDamage 不叠 effect；全局冷却防密集弹幕 DPS/性能失控
				timer.electro = CO.electroTurret.cooldownSec
				var li = idx('lightning'), emr2 = SK.lightning.maxRange[li] * SK.lightning.maxRange[li]
				doLightningChain(es[k].x, es[k].y, CO.electroTurret.chains, SK.lightning.damage[li] * CO.electroTurret.damageMul, emr2, true, 'fx:electroarc', 'electro')   // B-4 验收①a：电磁连锁伤害独立来源 'electro'
			}
			fired++
		}
	}
	// 链式选敌（lightning / electroTurret 共用，避免复制走样）。px,py=源点；hops=跳跃数；damageBase 经 hurt()（吃蛇长+暴击）；maxR2=首跳射程平方
	function doLightningChain(px, py, hops, damageBase, maxR2, useCombo, vfxEvent, srcTag) {   // useCombo=true → 走 comboDamage 不叠 effect；vfxEvent 默认 fx:lightning（基础蓝白），electro 显式传 fx:electroarc（紫）；srcTag=伤害来源标签（B-4 验收①a：电磁用 'electro' 独立标识，不再写死 'lightning'，仅透传飘字色，零 gameplay）
		var poolE = allEnemies(), hit = {}, chain = [{ x: px, y: py }]
		for (var c = 0; c < hops; c++) {
			var best = null, bd = Infinity
			for (var k = 0; k < poolE.length; k++) {
				var e = poolE[k]; if (hit[e.id]) { continue }
				var d = M.distSq(px, py, e.x, e.y)
				if (c === 0 && d > maxR2) { continue }   // 首跳射程门控；后续跳跃不限距（链式近战）
				if (d < bd) { bd = d; best = e }
			}
		if (!best) { break }
		hit[best.id] = true
		if (useCombo) { hurtCombo(best, damageBase, false, srcTag || 'lightning') } else { hurt(best, damageBase, false, srcTag || 'lightning') }   // B-4 验收①a：电磁连锁经 srcTag='electro' 走独立紫飘字 + 独立伤害数字
			chain.push({ x: best.x, y: best.y }); px = best.x; py = best.y   // 链式跳跃 + 收集链条节点
		}
		if (chain.length > 1) { Bus.emit(vfxEvent || 'fx:lightning', { chain: chain }) }   // P1-5 闪电链视效（事件名全小写以过 Bus 断言）
	}
	function tickLightning(dt) {
		var i = idx('lightning'); timer.lightning -= dt; if (timer.lightning > 0) { return }
		timer.lightning = SK.lightning.intervalSec[i]
		var h = headPos(), maxR2 = SK.lightning.maxRange[i] * SK.lightning.maxRange[i]   // P1-1 首跳射程门控
		doLightningChain(h.x, h.y, SK.lightning.chains[i], SK.lightning.damage[i], maxR2, false, undefined, 'lightning')   // 基础闪电：srcTag='lightning'（蓝白飘字，区别于电磁紫）
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
			if (comboReady(c) && !foundCombo[key]) {
				foundCombo[key] = true; GS.comboScore += ECON.comboFindScore; Bus.emit('combo:found', { id: key })
			}
		}
	}
function tickCombos(dt) {
	if (foundCombo.steamExplosion) {                 // ④ 火+冰：火墙扫到带冰敌 → 该敌位置引爆蒸汽 AOE；冰只作触发条件（slowT>0），无直伤；per-enemy 2.0s 节流（复用 COMBO_STEAM_INTERVAL_SEC，零新数值）
		var fi = idx('fire')
		var fr = RT('SKILL.fire.radius.' + fi, SK.fire.radius[fi])   // 火墙半径，与 tickFire 一致；B-GM 实时桥
		var segs = segmentsList(), step = SK.fire.segStep[fi] || 1
		var inFire = {}                                               // 本帧处于火墙内的敌人 id 集合
		for (var s = 0; s < segs.length; s += step) {
			var fs = enemiesIn(segs[s].x, segs[s].y, fr)
			for (var k = 0; k < fs.length; k++) { inFire[fs[k].id] = true }
		}
		var all = allEnemies()
		for (var n = 0; n < all.length; n++) {
			var e = all[n]
			if (!e.slowT || e.slowT <= 0) { continue }   // 带冰判定 = 复用冰减速/冻结 debuff（slowT>0；Lv5 冻结 pct=1 仍走 slowT，已覆盖）
			if (!inFire[e.id]) { continue }              // 火焰光环扫到
			if (e.steamCd > 0) { continue }              // per-enemy 节流（复用 COMBO_STEAM_INTERVAL_SEC=2.0，不新增数值）
			e.steamCd = COMBO_STEAM_INTERVAL_SEC          // 重置该敌冷却
			var es2 = enemiesIn(e.x, e.y, CO.steamExplosion.radius)
			for (var m = 0; m < es2.length; m++) {
				// §4.6/§9：基础伤害 = 火焰当前等级 DOT/s × damageMul，不叠 effectMul（comboDamage），保留暴击
				hurtCombo(es2[m], SK.fire.dotPerSec[fi] * CO.steamExplosion.damageMul, false, 'steam')
			}
			Bus.emit('fx:steamblast', { x: e.x, y: e.y, radius: CO.steamExplosion.radius })   // 爆环对准真实爆心（该敌位置）；事件名全小写以过 Bus 断言
		}
	}
	// electroTurret 已改为 bolt 命中触发（见 tickBolt）；冷却由 timer.electro + CO.electroTurret.cooldownSec 管控，此处不再周期触发
}

	// —— 3 选 1（保底 guaranteeAttack 攻 + guaranteeSurvival 生）——
	function isAttack(id) { return SK.attackSkills.indexOf(id) >= 0 }
	function candidates() {
		var out = [], k = SK.list
		for (var i = 0; i < k.length; i++) {
			var id = k[i], L = lvl(id)
			if (L === 0) { out.push({ id: id, level: 1, isNew: true }) }
			else if (L < SK.maxLevel) { out.push({ id: id, level: L + 1, isNew: false }) }
		}
		return out
	}
	function buildOffer() {
		var cand = candidates(); if (cand.length === 0) { return [] }
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
		var c = candidates(), ok = null
		for (var i = 0; i < c.length; i++) { if (c[i].id === id) { ok = c[i]; break } }
		if (!ok) { Log.warn('技能选择非法：' + id); return }
		GS.ownedSkills[id] = ok.level
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
		debugActivateCombo: debugActivateCombo, debugMaxAll: debugMaxAll, debugSetSkill: debugSetSkill,
		update: function (dt) {
			if (GS.status !== 'playing') { return }    // 依赖：本帧应在 collision.update 之后调用（queryCircle 哈希新鲜）
			if (owns('fire')) { tickFire(dt) }
			if (owns('ice')) { tickIce(dt) }
			if (owns('bolt')) { tickBolt(dt) }
			if (owns('lightning')) { tickLightning(dt) }
			if (owns('shield')) { tickShield(dt) }
		tickCombos(dt)
	},
	getIceZones: function () { return iceZones }   // B-2：render 读此画真实冰区（看到的=打到的）
}

	Bus.on('pickup:eat', function (d) { if (d && d.kind === 'skill') { offer() } })
	Bus.on('core:run_reset', function () {
		foundCombo = {}; timer.bolt = 0; timer.lightning = 0; timer.electro = 0   // ④ 移除 timer.steam（per-enemy 冷却在 enemy 侧复位）
		iceZones.length = 0; iceLastTail = null   // B-2：清空冰区池 + 复位尾点，防重开残留/NaN
	})

	Registry.register('skill', Skill)
	Log.info('skill 就绪：5 技能 × Lv' + SK.maxLevel)

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · P1-② electroTurret/burningBarrage · skill 侧：tickBolt burningBarrage 引燃、tickCombos electroTurret 链式电击（复用电磁炮台 timing + doLightningChain） · 不动 §9
// 2026-07-11 · Combo 契约修正（commit 1）· skill 侧：新增 Formula.comboDamage 不叠 effect 口径；hurtCombo 助手；doLightningChain 加 useCombo 开关；tickBolt 加「bolt 命中触发连锁闪电 + 全局冷却」取代原周期 electroTurret；tickCombos steamExplosion 改走 comboDamage（火焰 DOT/s ×2.5，冰只控不伤）、删除 electroTurret 周期块 · 真理源 §4.6/§9 已对齐
// 2026-07-14 · ④ 蒸汽状态引爆 · skill 侧：tickCombos 蒸汽分支由「蛇头周期 AOE」改为「火墙扫到带冰敌(e.slowT>0)×per-enemy 2.0s 冷却→该敌位置引爆」；移除全局 timer.steam（timer 声明与 run_reset 一并清理）；复用 enemiesIn(RT fire.radius/segStep) 判火墙内、hurtCombo(fire.dotPerSec×damageMul, src='steam')、fx:steamblast 爆环对准敌位；零新数值、不碰闪电/core/collision/config · 真源 §9 已回写
