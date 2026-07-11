;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M, Formula = Core.Formula
	var SK = CONFIG.SKILL, CO = CONFIG.COMBO, ECON = CONFIG.ECON, CB = CONFIG.COMBAT

	// 🟡 真理源未量化的表现/节奏，占位 + 候选，待回写
	var SHIELD_ORBIT_SEC = 1.6          // TODO: 待确认（候选 1.2 / 2.0）
	var SHIELD_ORB_RADIUS = 26          // TODO: 待确认（候选 22 / 30）
	var ICE_SLOW_LINGER_SEC = 0.5       // TODO: 待确认（候选 0.3 / 0.8）
	var COMBO_STEAM_INTERVAL_SEC = 2.0  // TODO: 待确认（候选 1.5 / 3.0）
	// ⚠ COMBO_ELECTRO_INTERVAL_SEC 不是纯表现值：它决定电磁炮台 DPS 节奏，属 gameplay 值。
	//   目前与蒸汽一致作占位先跑，但为「待回写数值真理源 §9 的债务」——后续实测后必须登记 §9，勿当常量长期留。
	var COMBO_ELECTRO_INTERVAL_SEC = 2.0  // TODO: 待回写 §9（候选 1.5 / 3.0）

	var timer = { bolt: 0, lightning: 0, steam: 0, electro: 0 }
	var foundCombo = {}

	function lvl(id) { return GS.ownedSkills[id] || 0 }
	function idx(id) { return lvl(id) - 1 }
	function owns(id) { return lvl(id) > 0 }
	function headPos() { var s = Registry.get('snake'); return s && s.head ? s.head : { x: 0, y: 0, angle: 0 } }

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
	function hurt(e, base, isDot) {
		var crit = Math.random() < CB.critRate
		Registry.get('enemy').applyDamage(e, Formula.damage(base, GS.segments, crit), crit, isDot)   // ⑦ isDot 透传：DOT 由 enemy 聚合飘字
	}

	// —— 五技能主动效果（按拥有等级取数组）——
	function tickFire(dt) {
		var i = idx('fire'), h = headPos(), es = enemiesIn(h.x, h.y, SK.fire.radius[i])
		for (var k = 0; k < es.length; k++) { hurt(es[k], SK.fire.dotPerSec[i] * dt, true) }   // 火光环 DOT（⑦ 标记 isDot）
	}
	function tickIce(dt) {
		var i = idx('ice'), h = headPos(), En = Registry.get('enemy')
		var es = enemiesIn(h.x, h.y, SK.ice.trailWidth[i])
		var pct = SK.ice.slowPct[i], dur = ICE_SLOW_LINGER_SEC
		if (lvl('ice') >= SK.maxLevel) { pct = 1; dur = SK.ice.lv5FreezeSec }            // Lv5 冻结
		for (var k = 0; k < es.length; k++) { En.applySlow(es[k], pct, dur) }
	}
	function tickBolt(dt) {
		var i = idx('bolt'); timer.bolt -= dt; if (timer.bolt > 0) { return }
		timer.bolt = 1 / SK.bolt.fireRate[i]
		var h = headPos(), es = allEnemies(), maxR2 = SK.bolt.maxRange[i] * SK.bolt.maxRange[i]   // P1-1 射程门控
		es.sort(function (a, b) { return M.distSq(h.x, h.y, a.x, a.y) - M.distSq(h.x, h.y, b.x, b.y) })
		var n = Math.min(SK.bolt.nodes[i], es.length), fired = 0
		for (var k = 0; k < es.length && fired < n; k++) {
			if (M.distSq(h.x, h.y, es[k].x, es[k].y) > maxR2) { break }   // 已按距离排序，后续只会更远
			hurt(es[k], SK.bolt.damage[i])
			Bus.emit('fx:bolt', { from: { x: h.x, y: h.y }, to: { x: es[k].x, y: es[k].y } })   // P1-5 弹道视效
			if (foundCombo.burningBarrage) { Registry.get('enemy').ignite(es[k], CO.burningBarrage.burnSec, CO.burningBarrage.burnDps) }   // 灼烧弹幕：飞镖命中点燃（固定 dps，不经 Formula）
			fired++
		}
	}
	// 链式选敌（lightning / electroTurret 共用，避免复制走样）。px,py=源点；hops=跳跃数；damageBase 经 hurt()（吃蛇长+暴击）；maxR2=首跳射程平方
	function doLightningChain(px, py, hops, damageBase, maxR2) {
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
			hit[best.id] = true; hurt(best, damageBase)
			chain.push({ x: best.x, y: best.y }); px = best.x; py = best.y   // 链式跳跃 + 收集链条节点
		}
		if (chain.length > 1) { Bus.emit('fx:lightning', { chain: chain }) }   // P1-5 闪电链视效
	}
	function tickLightning(dt) {
		var i = idx('lightning'); timer.lightning -= dt; if (timer.lightning > 0) { return }
		timer.lightning = SK.lightning.intervalSec[i]
		var h = headPos(), maxR2 = SK.lightning.maxRange[i] * SK.lightning.maxRange[i]   // P1-1 首跳射程门控
		doLightningChain(h.x, h.y, SK.lightning.chains[i], SK.lightning.damage[i], maxR2)
	}
	function tickShield(dt) {
		var i = idx('shield'), h = headPos()
		var count = SK.shield.count[i], dmg = SK.shield.contactDamage[i]
		var base = (GS.timeSec / SHIELD_ORBIT_SEC) * M.PI2
		for (var o = 0; o < count; o++) {
			var a = base + o / count * M.PI2
			var ox = h.x + Math.cos(a) * SHIELD_ORB_RADIUS, oy = h.y + Math.sin(a) * SHIELD_ORB_RADIUS
			var es = enemiesIn(ox, oy, SHIELD_ORB_RADIUS * 0.5)
			for (var k = 0; k < es.length; k++) { hurt(es[k], dmg * dt, true) }                  // MVP：接触按 dps 结算（⑦ 标记 isDot）
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
		if (foundCombo.steamExplosion) {                 // 火+冰：周期 AOE。其余 combo 仅登记加成（待真理源补节奏）
			timer.steam -= dt
			if (timer.steam <= 0) {
				timer.steam = COMBO_STEAM_INTERVAL_SEC
				var h = headPos(), es = enemiesIn(h.x, h.y, CO.steamExplosion.radius)
				for (var k = 0; k < es.length; k++) { hurt(es[k], SK.fire.dotPerSec[idx('fire')] * CO.steamExplosion.damageMul) }
				Bus.emit('fx:blast', { x: h.x, y: h.y, radius: CO.steamExplosion.radius })   // 需求B：爆环对准真实爆心（即 AOE 中心 h）
			}
		}
		if (foundCombo.electroTurret) {                   // 电磁炮台 bolt+lightning：周期链式电击（伤害=闪电等级×damageMul，走 hurt 吃蛇长+暴击）
			timer.electro -= dt
			if (timer.electro <= 0) {
				timer.electro = COMBO_ELECTRO_INTERVAL_SEC
				var h2 = headPos(), li = idx('lightning')
				var mr2 = SK.lightning.maxRange[li] * SK.lightning.maxRange[li]   // 首跳门控复用 lightning 射程
				doLightningChain(h2.x, h2.y, CO.electroTurret.chains, SK.lightning.damage[li] * CO.electroTurret.damageMul, mr2)
			}
		}
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

	var Skill = {
		owned: function () { return GS.ownedSkills }, offer: offer, pick: pick,
		update: function (dt) {
			if (GS.status !== 'playing') { return }    // 依赖：本帧应在 collision.update 之后调用（queryCircle 哈希新鲜）
			if (owns('fire')) { tickFire(dt) }
			if (owns('ice')) { tickIce(dt) }
			if (owns('bolt')) { tickBolt(dt) }
			if (owns('lightning')) { tickLightning(dt) }
			if (owns('shield')) { tickShield(dt) }
			tickCombos(dt)
		}
	}

	Bus.on('pickup:eat', function (d) { if (d && d.kind === 'skill') { offer() } })
	Bus.on('core:run_reset', function () { foundCombo = {}; timer.bolt = 0; timer.lightning = 0; timer.steam = 0; timer.electro = 0 })

	Registry.register('skill', Skill)
	Log.info('skill 就绪：5 技能 × Lv' + SK.maxLevel)

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · P1-② electroTurret/burningBarrage · skill 侧：tickBolt burningBarrage 引燃、tickCombos electroTurret 链式电击（复用电磁炮台 timing + doLightningChain） · 不动 §9
