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
	var killsSinceSkill = 0, gotFirstSkill = false, healsThisRun = 0, healsBySeg = [0,0,0,0,0], firstSkillTimer = 0, lastSkillBallTime = 0   // S3：healsBySeg 每段治疗掉落计数（贪心悖论预算）

	function newOrb() { return { active: false, id: 0, kind: 'food', x: 0, y: 0, prevX: 0, prevY: 0, radius: PK.food.radius } }
	var orbPool = Core.createPool(newOrb, function (o) { o.active = false }, 32)

	function head() { var s = Registry.get('snake'); return s && s.head ? s.head : { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 } }
	function activeKind(kind) { var c = 0; for (var i = 0; i < foods.length; i++) { if (foods[i].active && foods[i].kind === kind) { c++ } } return c }
	function visibleWorldRect() {
		var r = Registry.get('render')
		if (r && r.getVisibleWorldRect) { return r.getVisibleWorldRect() }
		var h = head(), halfW = GAME.logicalWidth / 2, halfH = GAME.logicalHeight / 2
		return { left: h.x - halfW, top: h.y - halfH, right: h.x + halfW, bottom: h.y + halfH, width: halfW * 2, height: halfH * 2 }
	}

	// 视野内 + 离蛇头 safeDistance 外 + 彼此 minSpacing 外 采样（割草节奏：食物始终在可见可达范围）
	function sampleViewPos(out) {
		var h = head(), r = PK.food.radius, view = visibleWorldRect()
		var minX = Math.max(r, view.left + r + 30), maxX = Math.min(GAME.worldWidth - r, view.right - r - 30)
		var minY = Math.max(r, view.top + r + 30), maxY = Math.min(GAME.worldHeight - r, view.bottom - r - 30)
		if (minX > maxX || minY > maxY) { minX = r; maxX = GAME.worldWidth - r; minY = r; maxY = GAME.worldHeight - r }
		var safe2 = PK.food.safeDistance * PK.food.safeDistance, min2 = PK.food.minSpacing * PK.food.minSpacing
		for (var i = 0; i < 30; i++) {
			var x = M.rand(minX, maxX)
			var y = M.rand(minY, maxY)
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
				var src = cand[(Math.random() * cand.length) | 0], h = head(), r = PK.food.radius, view = visibleWorldRect()
				var minX = Math.max(r, view.left + r), maxX = Math.min(GAME.worldWidth - r, view.right - r)
				var minY = Math.max(r, view.top + r), maxY = Math.min(GAME.worldHeight - r, view.bottom - r)
				if (minX > maxX || minY > maxY) { minX = r; maxX = GAME.worldWidth - r; minY = r; maxY = GAME.worldHeight - r }
				var safe2 = PK.food.safeDistance * PK.food.safeDistance, min2 = PK.food.minSpacing * PK.food.minSpacing
				var rb = PK.dangerBias
				for (var t = 0; t < 30; t++) {
					var ang = Math.random() * M.PI2, off = M.rand(rb.ringMin, rb.ringMax)
					var x = M.clamp(src.x + Math.cos(ang) * off, minX, maxX)
					var y = M.clamp(src.y + Math.sin(ang) * off, minY, maxY)
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
		o.active = true; o.id = ++_pid; o.kind = kind; o.x = _p.x; o.y = _p.y; o.prevX = o.x; o.prevY = o.y; o.radius = PK.food.radius
		foods.push(o); return true
	}
	function spawnOrbAt(kind, x, y) {
		var o = orbPool.acquire(), r = PK.food.radius
		o.active = true; o.id = ++_pid; o.kind = kind
		o.x = M.clamp(x, r, GAME.worldWidth - r); o.y = M.clamp(y, r, GAME.worldHeight - r); o.prevX = o.x; o.prevY = o.y; o.radius = r
		foods.push(o)
	}
	function releaseOrb(id) {
		for (var i = 0; i < foods.length; i++) { if (foods[i].id === id) { orbPool.release(foods[i]); foods.splice(i, 1); return } }
	}

	// 技能掉落 roll（baseDropRate 随已拥有数衰减，floorRate 兜底；连杀 15 未掉必给。首技能保底已移至 Pickup.update 开局直给）
	function ownedSkillCount() { var c = 0, gs = GS.ownedSkills; for (var k in gs) { if (gs.hasOwnProperty(k) && gs[k] > 0) { c++ } } return c }
	// 返回掉落来源：'killStreak'(连杀保底) / 'gap'(常规随机掉率) / null(本次不掉) —— S4 技能经济仪表
	function rollSkillDrop() {
		var sk = PK.skill, pity = PK.skillPity
		if (GS.stageId !== 1 && killsSinceSkill >= pity.killStreakGuarantee) { return 'killStreak' }   // 连杀 15 保底（P1-2：段①暂停，防保护期技能过载）
		var chance = sk.baseDropRate - sk.perOwnedPenalty * ownedSkillCount()
		if (chance < sk.floorRate) { chance = sk.floorRate }
		return (Math.random() < chance) ? 'gap' : null
	}
	// 首技能保底（§5）：开局即在蛇头正前方 safeDistance 处给出第一个技能球（屏内可直达，绝不落世界原点）
	function spawnSkillInFront() { tryGiveSkill(0, 0, true, 'first') }   // S4：首球来源标 'first'（仪表分类）；经统一入口，地板/满级闸门同处判定

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
		Log.info('[GATE] spawnMaxedReward coreHp=' + GS.coreHp + '/' + PK.heal.maxHp)
		if (GS.coreHp < PK.heal.maxHp && activeKind('heal') < PK.heal.screenCap) {
			spawnOrbAt('heal', x, y)   // ❶ 血<3（状态上限3心，唯一致死柱石）随时可转回血；同屏上限1；不绑局上限（避免满级后空 food 回归）
			GS.skillMaxedOverflow = (GS.skillMaxedOverflow || 0) + 1; GS.skillMaxedOverflowHeal = (GS.skillMaxedOverflowHeal || 0) + 1   // S4：满级溢出→转回血计数
		} else if (activeKind('food') < PK.food.screenCap) {
			spawnOrbAt('food', x, y)   // ❷ 满血→食物（遵 §5 屏上限6；B：满节时该食物被吃→overflow→小分，复用同管线不新建类型）
			GS.skillMaxedOverflow = (GS.skillMaxedOverflow || 0) + 1; GS.skillMaxedOverflowFood = (GS.skillMaxedOverflowFood || 0) + 1   // S4：满级溢出→转食物计数
		}
		// 同屏已满则本次不产：沿用掉率、不补窗、不凭空堆叠
	}
	// 实际给出技能球（集三处掉落入口于一点；命中即重置计数/计时；被地板压制的触发不重置）
	function giveSkillBall(x, y, source) {   // S4：source 用于技能经济仪表分类
		spawnOrbAt('skill', x, y)
		killsSinceSkill = 0
		gotFirstSkill = true
		lastSkillBallTime = GS.timeSec
		GS.skillDropsTotal = (GS.skillDropsTotal || 0) + 1
		if (source && GS.skillDropsBySource && GS.skillDropsBySource[source] != null) { GS.skillDropsBySource[source]++ }
		var _gi = (GS.stageId || 1) - 1; if (_gi >= 0 && _gi < GS.skillDropsBySeg.length) { GS.skillDropsBySeg[_gi]++ }
	}
	// 统一技能球入口：满级→溢出转化；否则按段取值走升级间隔地板（含连杀保底那颗，维持上轮口径：压制不重置、超窗即给、不预支）
	function tryGiveSkill(x, y, inFront, source) {   // S4：source 透传 giveSkillBall 做仪表分类
		var am = allSkillsMaxed()
		if (am) { Log.info('[GATE] all-maxed → spawnMaxedReward (no skill ball)'); spawnMaxedReward(x, y); return }
		var arr = PK.upgradeMinGapSecBySeg, gi = GS.stageId - 1
		var gap = (gi >= 0 && gi < arr.length) ? arr[gi] : 0   // 按段取值；0/null＝地板失效、恢复原掉率
		if (gi === 2) { gap = RT('PICKUP.gapFarm', gap) }                    // 段③ 割草：RT 桥到「割草升级间隔s」
		else if (gi === 0 || gi === 1) { gap = RT('PICKUP.gapEarly', gap) }  // 段①②：RT 桥到「前期升级间隔s」
		if (gap > 0 && gotFirstSkill) {                                       // 值>0 才节流；首技能≤9s 一律不门控
			if (GS.timeSec - lastSkillBallTime < gap) { GS.skillGatedByFloor = (GS.skillGatedByFloor || 0) + 1; return }   // 地板压制：不 spawn、不计掉球；记录被压次数（S4 仪表观测段④⑤节流强度）
		}
		var px = x, py = y
		if (inFront) { var h = head(), ang = (typeof h.angle === 'number') ? h.angle : 0, d = PK.food.safeDistance; px = h.x + Math.cos(ang) * d; py = h.y + Math.sin(ang) * d }
		Log.info('[GATE] giveSkillBall owned=' + JSON.stringify(GS.ownedSkills) + ' allMaxed=' + am)   // A#3 诊断：满级后仍见此行且 allMaxed=false＝闸门漏判
		giveSkillBall(px, py, source)   // S4：透传掉落来源
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
			var fullSeg = GS.segments >= segCapNow()   // S2：满段（非仅满节）即稀疏化；叙事加节到 maxSegments 也走此分支（共用 segCapNow 语义一致）
			foodTimer = fullSeg ? PK.food.maxSegRefreshIntervalSec : PK.food.refreshIntervalSec   // B：满节后拉长期望刷新间隔（零星可吃、不遍地）
			var foodCap = fullSeg ? PK.food.maxSegScreenCap : PK.food.screenCap
			while (activeKind('food') < foodCap) { if (!spawnOrb('food')) { break } }
		}
		healTimer -= dt
		if (healTimer <= 0) {                         // 治疗：自然刷新；S3 贪婪悖论·多层节制
			healTimer = PK.heal.naturalRefreshSec
			var _gi = GS.stageId - 1
			var _segHealCap = (PK.heal.healStageCapByStage && PK.heal.healStageCapByStage[_gi] != null) ? PK.heal.healStageCapByStage[_gi] : 0
			if (GS.coreHp < PK.heal.maxHp   // S3：满血不出（掉血才出），保留 coreHp=3 唯一命门张力
				&& activeKind('heal') < PK.heal.screenCap   // 同屏≤1
				&& healsThisRun < PK.heal.perRunMax   // 整局上限
				&& healsBySeg[_gi] < _segHealCap) {   // S3：每段预算上限（段②④③2/段④1/段⑤0）
				if (sampleDangerPos(_p)) { spawnOrbAt('heal', _p.x, _p.y); healsThisRun++; healsBySeg[_gi]++ }   // C-lite 张力：回血球偏向敌群/弹幕密集区（贪心抉择）；无敌人回退安全位
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
	function hasExplicitBossSchema() {
		var segs = STAGE.segments || []
		for (var i = 0; i < segs.length; i++) {
			var s = segs[i]
			if (!s) { continue }
			if (Object.prototype.hasOwnProperty.call(s, 'boss') || Object.prototype.hasOwnProperty.call(s, 'isBoss') || Object.prototype.hasOwnProperty.call(s, 'musicState') || Object.prototype.hasOwnProperty.call(s, 'audioState')) { return true }
		}
		return false
	}
	var explicitBossSchema = hasExplicitBossSchema()
	function isBossSegment(seg) {
		if (!seg) { return false }
		if (explicitBossSchema) {
			if (seg.boss === true || seg.isBoss === true) { return true }
			return String(seg.musicState || seg.audioState || '').toLowerCase() === 'boss'
		}
		return seg === lastSeg   // Legacy compatibility: old configs used "last segment = Boss".
	}
	function musicStateOf(seg) { return seg ? (seg.musicState || seg.audioState || '') : '' }
	function activeDangerPulse(seg, now) {
		var table = STAGE.dangerPulseByStage, p = table && table[seg.id]
		if (!p) { return null }
		var local = now - seg.startSec, first = Math.max(0, Number(p.firstDelaySec) || 0), cycle = Math.max(0.1, Number(p.cycleSec) || 0), duration = Math.max(0, Number(p.durationSec) || 0)
		if (local < first || duration <= 0) { return null }
		return ((local - first) % cycle) < duration ? p : null
	}

	var Wave = {
		update: function (dt) {
			if (GS.status !== 'playing') { return }
			var now = GS.timeSec, seg = currentSegment(now), bossSeg = isBossSegment(seg), stageToken = String(seg.id) + '@' + String(seg.startSec) + '@' + musicStateOf(seg)
			GS.stageId = seg.id
			if (stageToken !== prevStageId) {
				prevStageId = stageToken
				Bus.emit('wave:stage', { stageId: seg.id, name: seg.name, musicState: musicStateOf(seg), isBoss: bossSeg })
			}
			var En = Registry.get('enemy'); if (!En) { return }
			var pulse = bossSeg ? null : activeDangerPulse(seg, now)
			var pulseCapBonus = pulse ? (Number(pulse.capBonus) || 0) : 0
			var cap = Math.min(seg.cap + pulseCapBonus, rookieCap(now))
			if (bossSeg) {                  // Explicit boss segment when configured; legacy configs fall back to last segment.
				var lead = Math.max(0, Number(seg.bossWarnLeadSec == null ? STAGE.bossWarnLeadSec : seg.bossWarnLeadSec) || 0)
				if (!bossWarned) { bossWarned = true; Bus.emit('wave:boss_warn', { leadSec: lead, stageId: seg.id, name: seg.name, musicState: 'boss' }) }
				if (!bossSpawned && now >= seg.startSec + lead && !En.hasBoss()) { bossSpawned = true; En.spawn('boss') }
			}
			var spawnRate = seg.spawnRate * (pulse ? (Number(pulse.spawnMul) || 1) : 1)
			var spawnPool = (pulse && pulse.pool && pulse.pool.length) ? pulse.pool : seg.pool
			spawnAcc += spawnRate * dt                // Final Wave：基础密度常驻；危险潮只短时提高补怪速度/上限/特殊怪权重。
			while (spawnAcc >= 1) {
				spawnAcc -= 1
				if (En.countMobs() >= cap) { spawnAcc = 0; break }
				En.spawn(M.pick(spawnPool))
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
		var _src = rollSkillDrop()   // S4：返回掉落来源 'killStreak'/'gap'/null
		if (!GS.tuningSandbox && _src) { tryGiveSkill(d.x, d.y, false, _src) }   // 统一入口：地板/满级闸门在此判定；B-GM 沙盒停击杀掉球
	})
	Bus.on('core:run_reset', function () {
		while (foods.length) { orbPool.release(foods.pop()) }
		_pid = 0; foodTimer = 0; healTimer = PK.heal.naturalRefreshSec
		spawnAcc = 0; bossWarned = false; bossSpawned = false; prevStageId = 0
		killsSinceSkill = 0; gotFirstSkill = false; healsThisRun = 0; healsBySeg = [0,0,0,0,0]; firstSkillTimer = 0; lastSkillBallTime = 0   // S3：每段治疗计数清零
	})

	Registry.register('pickup', Pickup)
	Registry.register('wave', Wave)
	Log.info('wave/pickup 就绪')

})(typeof window !== 'undefined' ? window : this)
