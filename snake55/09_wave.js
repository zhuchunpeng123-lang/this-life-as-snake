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
	var killsSinceSkill = 0, gotFirstSkill = false, healsThisRun = 0, firstSkillTimer = 0, lastSkillBallTime = 0

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
	// C-lite 张力·补给危险偏向：回血/技能补给刻意刷在敌群附近，制造"要不要贪"的抉择。
	// 取随机活跃敌(非弹幕/非假人)附近落点：随机偏移环带 + 钳在视野内 + 离蛇头≥safeDistance 防贴脸；无敌人则回退安全采样。
	function sampleDangerPos(out) {
		var En = Registry.get('enemy')
		if (En && En.list) {
			var cand = []
			for (var i = 0; i < En.list.length; i++) {
				var e = En.list[i]
				if (!e.active || e.type === 'bossBullet' || e.type === 'dummy') { continue }
				cand.push(e)
			}
			if (cand.length) {
				var src = cand[(Math.random() * cand.length) | 0], h = head(), r = PK.food.radius
				var halfW = GAME.logicalWidth / 2 - 30, halfH = GAME.logicalHeight / 2 - 30
				var safe2 = PK.food.safeDistance * PK.food.safeDistance, min2 = PK.food.minSpacing * PK.food.minSpacing
				var rb = PK.dangerBias
				for (var t = 0; t < 30; t++) {
					var ang = Math.random() * M.PI2, off = M.rand(rb.ringMin, rb.ringMax)
					var x = M.clamp(src.x + Math.cos(ang) * off, h.x - halfW + r, h.x + halfW - r)
					var y = M.clamp(src.y + Math.sin(ang) * off, h.y - halfH + r, h.y + halfH - r)
					if (M.distSq(x, y, h.x, h.y) < safe2) { continue }
					var ok = true
					for (var f = 0; f < foods.length; f++) { var o = foods[f]; if (o.active && M.distSq(x, y, o.x, o.y) < min2) { ok = false; break } }
					if (ok) { out.x = x; out.y = y; return true }
				}
			}
		}
		return sampleViewPos(out)   // 无敌人或附近采样失败 → 回退安全采样（保持可达）
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
	function spawnSkillInFront() { tryGiveSkill(0, 0, true) }   // 经统一入口：首技能路径，地板/满级闸门同处判定

	// —— B-GM 实时标定桥（dev）：读 editor 运行时覆盖，无覆盖回退冻结 CONFIG 默认；仅替换 input 来源，不改判定/公式 ——
	function RT(path, fb) {
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	// 战线B：全技能满级闸门 → 复用 skill.js 同源判定（candidates 为空＝无更多有效升级），与 buildOffer/offer 完全同步，杜绝双份真相漂移
	function allSkillsMaxed() {
		var S = Registry.get('skill')
		if (S && typeof S.allMaxed === 'function') { return S.allMaxed() }
		var list = CONFIG.SKILL.list   // 兜底（skill 未就绪时）：与 candidates 等价判定
		for (var i = 0; i < list.length; i++) { if ((GS.ownedSkills[list[i]] || 0) !== CONFIG.SKILL.maxLevel) { return false } }
		return true
	}
	// 战线B：溢出转化（技能球掉率时机不变，产物换血/食物）——沿用原 skill 球落点
	function spawnMaxedReward(x, y) {
		if (GS.coreHp < PK.heal.maxHp && activeKind('heal') < PK.heal.screenCap) {
			spawnOrbAt('heal', x, y)   // ❶ 血<3（状态上限3心，唯一致死柱石）随时可转回血；同屏上限1；不绑局上限（避免满级后空 food 回归）
		} else if (activeKind('food') < PK.food.screenCap) {
			spawnOrbAt('food', x, y)   // ❷ 满血→食物（+1 节，遵 §5 屏上限6）
		}
		// 同屏已满则本次不产：沿用掉率、不补窗、不凭空堆叠
	}
	// 实际给出技能球（集三处掉落入口于一点；命中即重置计数/计时；被地板压制的触发不重置）
	function giveSkillBall(x, y) {
		spawnOrbAt('skill', x, y)
		killsSinceSkill = 0
		gotFirstSkill = true
		lastSkillBallTime = GS.timeSec
	}
	// 统一技能球入口：满级→溢出转化；否则按段取值走升级间隔地板（含连杀保底那颗，维持上轮口径：压制不重置、超窗即给、不预支）
	function tryGiveSkill(x, y, inFront) {
		if (allSkillsMaxed()) { spawnMaxedReward(x, y); return }
		var arr = PK.upgradeMinGapSecBySeg, gi = GS.stageId - 1
		var gap = (gi >= 0 && gi < arr.length) ? arr[gi] : 0   // 按段取值；0/null＝地板失效、恢复原掉率
		if (gi === 2) { gap = RT('PICKUP.gapFarm', gap) }                    // 段③ 割草：RT 桥到「割草升级间隔s」
		else if (gi === 0 || gi === 1) { gap = RT('PICKUP.gapEarly', gap) }  // 段①②：RT 桥到「前期升级间隔s」
		if (gap > 0 && gotFirstSkill) {                                       // 值>0 才节流；首技能≤9s 一律不门控
			if (GS.timeSec - lastSkillBallTime < gap) { return }             // 地板压制：不 spawn、不重置 killsSinceSkill（防计数漂移/反枯竭语义错）
		}
		var px = x, py = y
		if (inFront) { var h = head(), ang = (typeof h.angle === 'number') ? h.angle : 0, d = PK.food.safeDistance; px = h.x + Math.cos(ang) * d; py = h.y + Math.sin(ang) * d }
		giveSkillBall(px, py)
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
		if (foodTimer <= 0) {
			var fullSeg = GS.segments >= CONFIG.PLAYER.maxSegments
			foodTimer = fullSeg ? PK.food.maxSegRefreshIntervalSec : PK.food.refreshIntervalSec   // B：满节后拉长期望刷新间隔（零星可吃、不遍地）
			var foodCap = fullSeg ? PK.food.maxSegScreenCap : PK.food.screenCap
			while (activeKind('food') < foodCap) { if (!spawnOrb('food')) { break } }
		}
			healTimer -= dt
			if (healTimer <= 0) {                         // 治疗：自然刷新，单屏 cap，整局上限 perRunMax
				healTimer = PK.heal.naturalRefreshSec
				if (activeKind('heal') < PK.heal.screenCap && healsThisRun < PK.heal.perRunMax) {
					if (sampleDangerPos(_p)) { spawnOrbAt('heal', _p.x, _p.y); healsThisRun++ }   // C-lite 张力：回血球偏向敌群/弹幕密集区（贪心抉择）；无敌人回退安全位
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
		if (!GS.tuningSandbox && rollSkillDrop()) { tryGiveSkill(d.x, d.y, false) }   // 统一入口：地板/满级闸门在此判定；B-GM 沙盒停击杀掉球
	})
	Bus.on('core:run_reset', function () {
		while (foods.length) { orbPool.release(foods.pop()) }
		_pid = 0; foodTimer = 0; healTimer = PK.heal.naturalRefreshSec
		spawnAcc = 0; bossWarned = false; bossSpawned = false; prevStageId = 0
		killsSinceSkill = 0; gotFirstSkill = false; healsThisRun = 0; firstSkillTimer = 0; lastSkillBallTime = 0
	})

	Registry.register('pickup', Pickup)
	Registry.register('wave', Wave)
	Log.info('wave/pickup 就绪')

})(typeof window !== 'undefined' ? window : this)
