;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M
	var STAGE = CONFIG.STAGE, PK = CONFIG.PICKUP, GAME = CONFIG.GAME

	// ---------------- 模块运行态 ----------------
	var foods = []                       // 被 collision.js 读取：{active,x,y,radius,id,kind}
	var _pid = 0
	var foodTimer = 0, healTimer = PK.heal.naturalRefreshSec
	var spawnAcc = 0, bossWarned = false, bossSpawned = false, prevStageId = 0
	var killsSinceSkill = 0, gotFirstSkill = false, healsThisRun = 0, firstSkillTimer = 0

	function newOrb() { return { active: false, id: 0, kind: 'food', x: 0, y: 0, radius: PK.food.radius } }
	var orbPool = Core.createPool(newOrb, function (o) { o.active = false }, 32)

	function head() { var s = Registry.get('snake'); return s && s.head ? s.head : { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 } }
	function activeKind(kind) { var c = 0; for (var i = 0; i < foods.length; i++) { if (foods[i].active && foods[i].kind === kind) { c++ } } return c }

	// 视野内 + 离蛇头 safeDistance 外 + 彼此 minSpacing 外 采样（割草节奏：食物始终在可见可达范围）
	function sampleViewPos(out) {
		var h = head(), r = PK.food.radius
		var halfW = GAME.logicalWidth / 2 - 30, halfH = GAME.logicalHeight / 2 - 30
		var safe2 = PK.food.safeDistance * PK.food.safeDistance, min2 = PK.food.minSpacing * PK.food.minSpacing
		for (var i = 0; i < 30; i++) {
			var x = M.clamp(h.x + M.rand(-halfW, halfW), r, GAME.worldWidth - r)
			var y = M.clamp(h.y + M.rand(-halfH, halfH), r, GAME.worldHeight - r)
			if (M.distSq(x, y, h.x, h.y) < safe2) { continue }
			var ok = true
			for (var f = 0; f < foods.length; f++) { var o = foods[f]; if (o.active && M.distSq(x, y, o.x, o.y) < min2) { ok = false; break } }
			if (ok) { out.x = x; out.y = y; return true }
		}
		return false
	}
	var _p = { x: 0, y: 0 }
	function spawnOrb(kind) {
		if (!sampleViewPos(_p)) { return false }
		var o = orbPool.acquire()
		o.active = true; o.id = ++_pid; o.kind = kind; o.x = _p.x; o.y = _p.y; o.radius = PK.food.radius
		foods.push(o); return true
	}
	function spawnOrbAt(kind, x, y) {
		var o = orbPool.acquire(), r = PK.food.radius
		o.active = true; o.id = ++_pid; o.kind = kind
		o.x = M.clamp(x, r, GAME.worldWidth - r); o.y = M.clamp(y, r, GAME.worldHeight - r); o.radius = r
		foods.push(o)
	}
	function releaseOrb(id) {
		for (var i = 0; i < foods.length; i++) { if (foods[i].id === id) { orbPool.release(foods[i]); foods.splice(i, 1); return } }
	}

	// 技能掉落 roll（baseDropRate 随已拥有数衰减，floorRate 兜底；连杀 15 未掉必给。首技能保底已移至 Pickup.update 开局直给）
	function ownedSkillCount() { var c = 0, gs = GS.ownedSkills; for (var k in gs) { if (gs.hasOwnProperty(k) && gs[k] > 0) { c++ } } return c }
	function rollSkillDrop() {
		var sk = PK.skill, pity = PK.skillPity
		var chance = sk.baseDropRate - sk.perOwnedPenalty * ownedSkillCount()
		if (chance < sk.floorRate) { chance = sk.floorRate }
		if (GS.stageId !== 1 && killsSinceSkill >= pity.killStreakGuarantee) { return true }   // 连杀 15 保底（P1-2：段①暂停，防保护期技能过载）
		return Math.random() < chance
	}
	// 首技能保底（§5）：开局即在蛇头正前方 safeDistance 处给出第一个技能球（屏内可直达，绝不落世界原点）
	function spawnSkillInFront() {
		var h = head()
		var ang = (typeof h.angle === 'number') ? h.angle : 0
		var d = PK.food.safeDistance
		spawnOrbAt('skill', h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d)
	}

	// ---------------- Pickup 系统 ----------------
	var Pickup = {
		foods: foods,
		update: function (dt) {
			if (GS.status !== 'playing') { return }
			if (GS.tuningSandbox) { return }   // B-GM 标定沙盒：暂停所有道具/技能掉落刷新（不刷食物/治疗/首技能保底）
			// P0-1 首技能保底（§5 裁定 ≤10s）：倒计时 firstSkillGuaranteeSec(9s) 后在蛇头正前方给出，让玩家先熟悉操作
			if (!gotFirstSkill) { firstSkillTimer += dt; if (firstSkillTimer >= PK.skillPity.firstSkillGuaranteeSec) { spawnSkillInFront(); gotFirstSkill = true } }
			foodTimer -= dt
			if (foodTimer <= 0) {                         // 每 refreshIntervalSec 补满到 screenCap
				foodTimer = PK.food.refreshIntervalSec
				while (activeKind('food') < PK.food.screenCap) { if (!spawnOrb('food')) { break } }
			}
			healTimer -= dt
			if (healTimer <= 0) {                         // 治疗：自然刷新，单屏 cap，整局上限 perRunMax
				healTimer = PK.heal.naturalRefreshSec
				if (activeKind('heal') < PK.heal.screenCap && healsThisRun < PK.heal.perRunMax) {
					if (spawnOrb('heal')) { healsThisRun++ }
				}
			}
		}
	}

	// ---------------- Wave 调度器 ----------------
	function currentSegment(now) {
		var segs = STAGE.segments
		for (var i = 0; i < segs.length; i++) { if (now >= segs[i].startSec && now < segs[i].endSec) { return segs[i] } }
		return segs[segs.length - 1]                    // 超末段时停在末段
	}
	function rookieCap(now) {
		var rp = STAGE.rookieProtect
		for (var i = 0; i < rp.length; i++) { if (now >= rp[i].startSec && now < rp[i].endSec) { return rp[i].cap } }
		return Infinity
	}
	var lastSeg = STAGE.segments[STAGE.segments.length - 1]

	var Wave = {
		update: function (dt) {
			if (GS.status !== 'playing') { return }
			var now = GS.timeSec, seg = currentSegment(now)
			GS.stageId = seg.id
			if (seg.id !== prevStageId) { prevStageId = seg.id; Bus.emit('wave:stage', { stageId: seg.id, name: seg.name }) }
			var En = Registry.get('enemy'); if (!En) { return }
			var cap = Math.min(seg.cap, rookieCap(now))
			if (seg.id === lastSeg.id) {                  // Boss 段：预警 → 生成 Boss（双阶段在 enemy.js）
				if (!bossWarned) { bossWarned = true; Bus.emit('wave:boss_warn', { leadSec: STAGE.bossWarnLeadSec }) }
				if (!bossSpawned && now >= seg.startSec + STAGE.bossWarnLeadSec && !En.hasBoss()) { bossSpawned = true; En.spawn('boss') }
			}
			spawnAcc += seg.spawnRate * dt                // 持续刷怪 accumulator（只/秒），受 cap 限制
			while (spawnAcc >= 1) {
				spawnAcc -= 1
				if (En.countMobs() >= cap) { spawnAcc = 0; break }
				En.spawn(M.pick(seg.pool))
			}
		}
	}

	// ---------------- 事件 ----------------
	Bus.on('pickup:eat', function (d) {
		if (!d) { return }
		if (d.kind === 'heal') { var hp = GS.coreHp + PK.heal.gainHp; GS.coreHp = hp > PK.heal.maxHp ? PK.heal.maxHp : hp }
		// d.kind === 'skill' 由 skill.js 处理 offer；d.kind === 'food' 由 snake.js 处理 +1 节
		releaseOrb(d.id)                                // 任意拾取：回收该球
	})
	Bus.on('enemy:die', function (d) {
		killsSinceSkill++
		if (!GS.tuningSandbox && rollSkillDrop()) { spawnOrbAt('skill', d.x, d.y); killsSinceSkill = 0; gotFirstSkill = true }   // B-GM 沙盒：停击杀掉技能球
	})
	Bus.on('core:run_reset', function () {
		while (foods.length) { orbPool.release(foods.pop()) }
		_pid = 0; foodTimer = 0; healTimer = PK.heal.naturalRefreshSec
		spawnAcc = 0; bossWarned = false; bossSpawned = false; prevStageId = 0
		killsSinceSkill = 0; gotFirstSkill = false; healsThisRun = 0; firstSkillTimer = 0
	})

	Registry.register('pickup', Pickup)
	Registry.register('wave', Wave)
	Log.info('wave/pickup 就绪')

})(typeof window !== 'undefined' ? window : this)
