;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var NARR = CONFIG.NARR, V2 = NARR.v2 || {}, V3 = NARR.v3 || {}, RISK = V2.risk || {}, MEMORY = V2.memory || {}, WEIGHTS = MEMORY.weights || {}
	var SKILL_LIST = (CONFIG.SKILL && CONFIG.SKILL.list) || [], COMBOS = CONFIG.COMBO || {}, STAGE_LIST = (CONFIG.STAGE && CONFIG.STAGE.segments) || []
	var SKILL_LABEL = { fire: '火焰光环', ice: '冰霜领域', bolt: '追踪飞镖', shield: '守护力场', lightning: '连锁闪电' }
	var COMBO_LABEL = { steamExplosion: '蒸汽爆炸', electroTurret: '电磁炮台', burningBarrage: '灼烧弹幕' }
	var bossEncountered = false, finalEventType = null

	function makeStats() {
		return {
			foodPickups: 0, riskyFoodPickups: 0, lowHpRiskyFoodPickups: 0,
			healPickups: 0, riskyHealPickups: 0, skillPickups: 0, riskySkillPickups: 0, lowHpRiskyPickups: 0,
			skillChoices: 0, newSkillChoices: 0, upgradeChoices: 0,
			hits: 0, nearDeathHits: 0, heals: 0, eliteKills: 0, enemyKills: 0, comboFoundCount: 0
		}
	}
	function makeBehavior() { return { greedEvidence: 0, resilienceEvidence: 0, combatPressureEvidence: 0 } }
	function makeEchoState() { return { count: 0, lastTime: -Infinity, shown: {}, history: [], skillMaxSeen: false, pendingHighEcho: false } }
	function ensureRun() {
		if (!GS.narrativeRun || !Array.isArray(GS.narrativeRun.events)) {
			GS.narrativeRun = { events: [], nextSeq: 0, stats: makeStats(), behavior: makeBehavior(), lastRiskyFood: null, lastLethalHit: null, pendingSkillOffer: null, pendingSkillPickup: null, lastStageName: '', echoState: makeEchoState() }
		}
		var run = GS.narrativeRun
		if (typeof run.nextSeq !== 'number') { run.nextSeq = 0 }
		if (!run.stats) { run.stats = makeStats() }
		if (!run.behavior) { run.behavior = makeBehavior() }
		if (!run.events) { run.events = [] }
		if (!run.echoState) { run.echoState = makeEchoState() }
		if (!run.echoState.shown) { run.echoState.shown = {} }
		if (!Array.isArray(run.echoState.history)) { run.echoState.history = [] }
		if (typeof run.echoState.count !== 'number') { run.echoState.count = 0 }
		if (typeof run.echoState.lastTime !== 'number') { run.echoState.lastTime = -Infinity }
		if (typeof run.echoState.skillMaxSeen !== 'boolean') { run.echoState.skillMaxSeen = false }
		if (!Object.prototype.hasOwnProperty.call(run, 'pendingSkillOffer')) { run.pendingSkillOffer = null }
		if (!Object.prototype.hasOwnProperty.call(run, 'pendingSkillPickup')) { run.pendingSkillPickup = null }
		if (!Object.prototype.hasOwnProperty.call(run, 'lastStageName')) { run.lastStageName = '' }
		return run
	}
	function resetState() {
		var run = ensureRun()
		bossEncountered = false; finalEventType = null
		run.events = []; run.nextSeq = 0; run.stats = makeStats(); run.behavior = makeBehavior()
		run.lastRiskyFood = null; run.lastLethalHit = null; run.pendingSkillOffer = null; run.pendingSkillPickup = null; run.lastStageName = ''; run.echoState = makeEchoState()
	}
	function clone(value) {
		if (value === null || value === undefined || typeof value !== 'object') { return value }
		if (Array.isArray(value)) { return value.map(clone) }
		var out = {}
		for (var k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) { out[k] = clone(value[k]) } }
		return out
	}
	function clampHp(value) {
		var maxHp = Number(CONFIG.PICKUP.heal.maxHp) || Number(CONFIG.PLAYER.coreHp) || 0
		return Math.max(0, Math.min(maxHp, Number(value) || 0))
	}
	function updateRunMaxima() {
		if (GS.segments > (GS.maxSegments || 0)) { GS.maxSegments = GS.segments }
		if (GS.stageId > (GS.maxStageId || 0)) { GS.maxStageId = GS.stageId }
		if (GS.killStreak > (GS.killStreakMax || 0)) { GS.killStreakMax = GS.killStreak }
	}
	function baseEvent(type) {
		updateRunMaxima()
		return { type: type, time: Number(GS.timeSec) || 0, stageId: Number(GS.stageId) || 0, hp: clampHp(GS.coreHp), segments: Number(GS.segments) || 0 }
	}
	function stableHash(text) {
		var hash = 2166136261, value = String(text || '')
		for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) }
		return hash >>> 0
	}
	function pickCopy(list, seed) {
		if (!Array.isArray(list) || !list.length) { return '' }
		return String(list[stableHash(seed) % list.length] || '')
	}
	function pickCopyAvoiding(list, seed, avoidText) {
		if (!Array.isArray(list) || !list.length) { return '' }
		var avoid = String(avoidText || ''), start = stableHash(seed) % list.length
		for (var i = 0; i < list.length; i++) {
			var text = String(list[(start + i) % list.length] || '')
			if (text && (!avoid || text !== avoid)) { return text }
		}
		return ''
	}
	function copyAt(path, fallback) {
		var cur = V3.copy, parts = String(path || '').split('.')
		for (var i = 0; cur && i < parts.length; i++) { cur = cur[parts[i]] }
		return cur || fallback || []
	}
	function renderCopy(text, data) {
		return String(text || '').replace(/\{(\w+)\}/g, function (_, key) { return data && data[key] !== undefined ? String(data[key]) : '' })
	}
	function offerEcho(spec) {
		var run = ensureRun(), echo = V3.echo || {}, event = spec && spec.event
		if (!V3.enabled || !echo.enabled || GS.status !== 'playing' || !spec || !spec.key || echo.count >= (Number(echo.maxEventEchoes) || 3)) { return false }
		var now = Number(GS.timeSec) || 0, copy = spec.copy
		if (now < (Number(echo.earliestSec) || 0) || run.echoState.shown[spec.key] || now - run.echoState.lastTime < (Number(echo.minGapSec) || 0) || !Array.isArray(copy) || !copy.length) { return false }
		var text = pickCopy(copy, spec.key + '|' + (event && event.seq || '') + '|' + (event && event.type || '') + '|' + (event && (event.id || event.comboId || event.skillId) || ''))
		if (!text) { return false }
		var evidenceSeq = spec.evidenceSeq ? spec.evidenceSeq.slice() : (event && event.seq ? [event.seq] : [])
		run.echoState.count++; run.echoState.lastTime = now; run.echoState.shown[spec.key] = true
		run.echoState.history.push({ key: spec.key, type: spec.type || 'echo', time: now, text: text, evidenceSeq: evidenceSeq })
		while (run.echoState.history.length > (Number(echo.maxEventEchoes) || 3)) { run.echoState.history.shift() }
		Bus.emit('narrative:echo', { text: text, type: spec.type || 'echo', delaySec: spec.delaySec == null ? 0 : spec.delaySec, priority: spec.priority || 1, evidenceSeq: evidenceSeq })
		return true
	}
	function offerEchoWhenPlaying(spec) {
		if (GS.status === 'playing') { if (Number(spec.priority) >= 3) { ensureRun().echoState.pendingHighEcho = false } return offerEcho(spec) }
		if (GS.status === 'choosing' && global.setTimeout) { global.setTimeout(function () { if (GS.status === 'playing' && (!ensureRun().echoState.pendingHighEcho || Number(spec.priority) >= 3)) { if (Number(spec.priority) >= 3) { ensureRun().echoState.pendingHighEcho = false } offerEcho(spec) } }, 0) }
		return false
	}
	var EVICTION_PRIORITY = { food_pickup: 10, heal_pickup: 20, hurt: 20, skill_pickup: 25, stage_enter: 30, elite_kill: 40, skill_gain: 70, combo_found: 80, boss_encounter: 90 }
	function eventEvictionPriority(event) { return Object.prototype.hasOwnProperty.call(EVICTION_PRIORITY, event.type) ? EVICTION_PRIORITY[event.type] : 50 }
	function pushEvent(event) {
		var run = ensureRun(), cap = Math.max(1, Number(V2.ledgerMaxEvents) || 160)
		event.seq = ++run.nextSeq
		run.events.push(event)
		if (event.type === 'food_pickup' && event.risky) { run.lastRiskyFood = clone(event) }
		if (event.type === 'skill_pickup') { run.pendingSkillPickup = { seq: event.seq, time: event.time, risky: !!event.risky, riskScore: event.riskScore, nearbyEnemyCount: event.nearbyEnemyCount, nearbyThreatCount: event.nearbyThreatCount } }
		if (event.type === 'hurt' && Number(event.hp) <= 0) { run.lastLethalHit = clone(event) }
		while (run.events.length > cap) {
			var drop = -1
			var dropPriority = Infinity
			var dropSeq = Infinity
			for (var i = 0; i < run.events.length; i++) {
				var candidate = run.events[i]
				var referenced = (run.lastRiskyFood && run.lastRiskyFood.seq === candidate.seq) || (run.pendingSkillPickup && run.pendingSkillPickup.seq === candidate.seq) || (run.lastLethalHit && run.lastLethalHit.seq === candidate.seq)
				if (candidate.type === 'death' || candidate.type === 'clear' || referenced) { continue }
				var priority = eventEvictionPriority(candidate)
				if (priority < dropPriority || priority === dropPriority && candidate.seq < dropSeq) { drop = i; dropPriority = priority; dropSeq = candidate.seq }
			}
			if (drop < 0) { break }
			run.events.splice(drop, 1)
		}
		return event
	}
	function pickupRisk(d, hpOverride) {
		var x = Number(d && d.x), y = Number(d && d.y), radius = Number(RISK.nearbyRadiusPx) || 0, radius2 = radius * radius
		var nearbyEnemyCount = 0, nearbyThreatCount = 0, enemies = Registry.get('enemy'), list = enemies && enemies.list ? enemies.list : []
		for (var i = 0; i < list.length; i++) {
			var e = list[i]
			if (!e || !e.active || e.type === 'bossBullet' || e.type === 'dummy') { continue }
			var dx = e.x - x, dy = e.y - y
			if (dx * dx + dy * dy > radius2) { continue }
			nearbyEnemyCount++
			if (e.type === 'charger' || e.type === 'elite' || e.type === 'boss') { nearbyThreatCount++ }
		}
		var riskScore = 0
		if (nearbyEnemyCount >= (Number(RISK.nearbyEnemyCount) || 0)) { riskScore += 2 }
		if (nearbyThreatCount >= 1) { riskScore += 2 }
		var hp = hpOverride === undefined ? GS.coreHp : hpOverride
		if (hp <= (Number(RISK.lowHpThreshold) || 0) && nearbyEnemyCount >= 1) { riskScore += 2 }
		return { x: x, y: y, nearbyEnemyCount: nearbyEnemyCount, nearbyThreatCount: nearbyThreatCount, riskScore: riskScore, risky: riskScore >= 2 }
	}
	function applyRisk(event, risk) {
		for (var k in risk) { if (Object.prototype.hasOwnProperty.call(risk, k)) { event[k] = risk[k] } }
		return event
	}
	function recordStage(d) {
		if (!d || d.stageId == null) { return }
		var run = ensureRun(); GS.stageId = d.stageId; GS.maxStageId = Math.max(GS.maxStageId || 0, d.stageId); run.lastStageName = d.name || ''
		var stage = baseEvent('stage_enter'); stage.stageName = d.name || ''; stage.isBoss = !!d.isBoss; pushEvent(stage)
		if (stage.isBoss && !bossEncountered) {
			bossEncountered = true
			var encounter = baseEvent('boss_encounter'); encounter.stageName = stage.stageName; encounter.isBoss = true; pushEvent(encounter)
		}
	}
	function recordFood(d) {
		if (!d || d.kind !== 'food') { return }
		var run = ensureRun(), risk = pickupRisk(d); run.stats.foodPickups++
		if (!risk.risky) { updateRunMaxima(); return }
		var event = applyRisk(baseEvent('food_pickup'), risk); pushEvent(event)
		run.stats.riskyFoodPickups++
		if (GS.coreHp <= (Number(RISK.lowHpThreshold) || 0)) { run.stats.lowHpRiskyFoodPickups++; run.stats.lowHpRiskyPickups++ }
		run.lastRiskyFood = { seq: event.seq, time: event.time, x: event.x, y: event.y, stageId: event.stageId, hp: event.hp, nearbyEnemyCount: event.nearbyEnemyCount, nearbyThreatCount: event.nearbyThreatCount, riskScore: event.riskScore }
	}
	function latestRecoveryHurt(run, time) {
		var windowSec = Number(MEMORY.recoveryWindowSec) || 0
		for (var i = run.events.length - 1; i >= 0; i--) {
			var hurt = run.events[i]
			if (hurt.type === 'hurt' && hurt.hp === (Number(RISK.lowHpThreshold) || 0) && time >= hurt.time && time - hurt.time <= windowSec) { return hurt }
		}
		return null
	}
	function recordHeal(d) {
		if (!d || d.kind !== 'heal') { return }
		var run = ensureRun(), afterHp = clampHp(GS.coreHp), gain = Number(CONFIG.PICKUP.heal.gainHp) || 0, beforeHp = clampHp(afterHp - gain)
		var event = applyRisk(baseEvent('heal_pickup'), pickupRisk(d, beforeHp)); event.hpBefore = beforeHp; event.hpAfter = afterHp; event.x = d.x; event.y = d.y; pushEvent(event)
		run.stats.healPickups++; run.stats.heals++
		if (event.risky) { run.stats.riskyHealPickups++; if (beforeHp <= (Number(RISK.lowHpThreshold) || 0)) { run.stats.lowHpRiskyPickups++ } }
		var hurt = latestRecoveryHurt(run, event.time)
		if (hurt && event.hpAfter > event.hpBefore) { offerEchoWhenPlaying({ key: 'near_death_recovery', type: 'near_death_recovery', event: event, priority: 3, copy: copyAt('echo.nearDeathRecovery'), evidenceSeq: [hurt.seq, event.seq] }) }
	}
	function recordSkillPickup(d) {
		if (!d || d.kind !== 'skill') { return }
		var run = ensureRun(), event = applyRisk(baseEvent('skill_pickup'), pickupRisk(d)); event.x = d.x; event.y = d.y; pushEvent(event)
		run.stats.skillPickups++
		if (event.risky) { run.stats.riskySkillPickups++; if (event.hp <= (Number(RISK.lowHpThreshold) || 0)) { run.stats.lowHpRiskyPickups++ } }
		run.pendingSkillPickup = { seq: event.seq, time: event.time, risky: !!event.risky, riskScore: event.riskScore, nearbyEnemyCount: event.nearbyEnemyCount, nearbyThreatCount: event.nearbyThreatCount }
	}
	function sanitizeOffer(d) {
		var choices = [], input = d && d.choices ? d.choices : []
		for (var i = 0; i < input.length; i++) {
			if (!input[i] || !input[i].id) { continue }
			choices.push({ id: input[i].id, level: Number(input[i].level) || 0, isNew: !!input[i].isNew })
		}
		return choices
	}
	function recordSkillOffer(d) {
		var run = ensureRun(), now = Number(GS.timeSec) || 0
		if (run.pendingSkillPickup && run.pendingSkillPickup.time !== now) { run.pendingSkillPickup = null }
		run.pendingSkillOffer = { time: now, stageId: Number(GS.stageId) || 0, choices: sanitizeOffer(d) }
		run.stats.skillChoices++
	}
	function recordSkillGain(d) {
		if (!d || !d.id) { return }
		var run = ensureRun(), now = Number(GS.timeSec) || 0, offer = run.pendingSkillOffer && run.pendingSkillOffer.time === now ? run.pendingSkillOffer : null
		var pickup = run.pendingSkillPickup && run.pendingSkillPickup.time === now ? run.pendingSkillPickup : null
		var choices = offer ? clone(offer.choices) : [], chosen = null
		for (var i = 0; i < choices.length; i++) { if (choices[i].id === d.id) { chosen = choices[i]; break } }
		var level = Number(d.level) || 0, event = baseEvent('skill_gain')
		event.skillId = d.id; event.level = level; event.isNew = level === 1; event.offerChoices = choices; event.offerCount = choices.length; event.chosenWasNew = chosen ? !!chosen.isNew : null
		if (pickup) { event.pickupSeq = pickup.seq; event.pickupRisky = pickup.risky; event.pickupRiskScore = pickup.riskScore; event.pickupNearbyEnemyCount = pickup.nearbyEnemyCount; event.pickupNearbyThreatCount = pickup.nearbyThreatCount }
		pushEvent(event)
		if (offer) { if (event.isNew) { run.stats.newSkillChoices++ } else { run.stats.upgradeChoices++ } }
		if (level === CONFIG.SKILL.maxLevel && !run.echoState.skillMaxSeen) {
			run.echoState.skillMaxSeen = true
			offerEchoWhenPlaying({ key: 'skill_max_any', type: 'skill_max', event: event, copy: copyAt('echo.skillMax.' + d.id, copyAt('echo.skillMax')) })
		}
		if (event.pickupRisky && pickup) { offerEchoWhenPlaying({ key: 'risky_skill_any', type: 'risky_skill', event: event, copy: copyAt('echo.riskySkill'), evidenceSeq: [pickup.seq, event.seq] }) }
		run.pendingSkillOffer = null; run.pendingSkillPickup = null
	}
	function recordCombo(d) {
		if (!d || !d.id) { return }
		var run = ensureRun(), event = baseEvent('combo_found'); event.comboId = d.id; pushEvent(event)
		GS.comboHighlights = GS.comboHighlights || []
		if (GS.comboHighlights.indexOf(d.id) < 0) { GS.comboHighlights.push(d.id); run.stats.comboFoundCount++ }
		var comboCount = GS.comboHighlights.length
		if (comboCount === 1) { offerEchoWhenPlaying({ key: 'combo_first', type: 'combo', event: event, priority: 2, delaySec: Number(V3.echo && V3.echo.comboDelaySec) || 0.9, copy: copyAt('echo.combo.' + d.id) }) }
		else if (comboCount === 3) { run.echoState.pendingHighEcho = true; offerEchoWhenPlaying({ key: 'combo_third', type: 'multi_combo', event: event, priority: 3, delaySec: Number(V3.echo && V3.echo.comboDelaySec) || 0.9, copy: copyAt('echo.multiCombo') }) }
	}
	function recordHurt(d) {
		if (!d) { return }
		var run = ensureRun(), event = baseEvent('hurt'), keys = ['enemyId', 'enemyType', 'enemyX', 'enemyY', 'coreHp', 'damage', 'x', 'y']
		for (var i = 0; i < keys.length; i++) { if (d[keys[i]] !== undefined) { event[keys[i]] = d[keys[i]] } }
		event.hp = clampHp(d.coreHp); pushEvent(event); run.stats.hits++
		if (event.hp === (Number(RISK.lowHpThreshold) || 0)) { run.stats.nearDeathHits++ }
		if (event.hp <= 0) { run.lastLethalHit = clone(event) }
	}
	function recordEnemyDie(d) {
		if (!d || !d.kind || d.kind === 'bossBullet' || d.kind === 'dummy') { return }
		var run = ensureRun()
		run.stats.enemyKills++
		if (d.kind !== 'elite') { updateRunMaxima(); return }
		var event = baseEvent('elite_kill')
		event.enemyType = d.kind; event.source = d.source || ''; event.x = d.x; event.y = d.y; pushEvent(event)
		run.stats.eliteKills++
		updateRunMaxima()
	}
	function secondsSinceRiskyFood() {
		var run = ensureRun()
		return run.lastRiskyFood ? Math.max(0, (Number(GS.timeSec) || 0) - run.lastRiskyFood.time) : null
	}
	function finalEvent() {
		var events = ensureRun().events
		for (var i = events.length - 1; i >= 0; i--) { if (events[i].type === 'death' || events[i].type === 'clear') { return events[i] } }
		return null
	}
	function classifyDeathCause() {
		ensureRun()
		if (GS.bossDefeated || finalEventType === 'clear' || finalEvent() && finalEvent().type === 'clear') { return 'clear' }
		var bossStageId = NARR.classify.deathCause.bossStageId, reachedStage = Math.max(Number(GS.stageId) || 0, Number(GS.maxStageId) || 0)
		if (reachedStage >= bossStageId) { return 'boss' }
		var risky = GS.narrativeRun.lastRiskyFood, now = Number(GS.timeSec) || 0
		if (risky && now - risky.time <= (Number(RISK.greedyDeathWindowSec) || 0)) { return 'greedy' }
		return 'attrition'
	}
	function finalize(type, cause) {
		if (finalEventType) { return }
		var run = ensureRun(), event = baseEvent(type); event.cause = cause
		event.stageName = stageNameFor(run); event.enemyKills = run.stats.enemyKills; event.maxSegments = GS.maxSegments || 0; event.maxStageId = GS.maxStageId || 0; event.killStreakMax = GS.killStreakMax || 0
		if (type === 'death') { event.lethalEnemyType = run.lastLethalHit ? (run.lastLethalHit.enemyType || '') : ''; event.secondsSinceRiskyFood = secondsSinceRiskyFood() }
		pushEvent(event); finalEventType = type; GS.deathCause = cause; run.pendingSkillOffer = null; run.pendingSkillPickup = null
	}
	function buildProfile() {
		var levels = GS.ownedSkills || {}, primarySkillId = null, primarySkillLevel = 0, ownedSkillCount = 0, totalSkillLevels = 0
		for (var i = 0; i < SKILL_LIST.length; i++) {
			var id = SKILL_LIST[i], level = Number(levels[id]) || 0
			if (level > 0) { ownedSkillCount++; totalSkillLevels += level }
			if (level > primarySkillLevel) { primarySkillId = id; primarySkillLevel = level }
		}
		var activeCombos = [], comboKeys = Object.keys(COMBOS)
		for (var k = 0; k < comboKeys.length; k++) {
			var combo = COMBOS[comboKeys[k]], parts = combo && combo.parts || []
			if (parts.length >= 2 && (Number(levels[parts[0]]) || 0) > 0 && (Number(levels[parts[1]]) || 0) > 0) { activeCombos.push(comboKeys[k]) }
		}
		var fire = Number(levels.fire) || 0, ice = Number(levels.ice) || 0, total = totalSkillLevels, legacyLean = 'mixed'
		if (total > 0 && NARR.classify.buildLean && fire / total >= NARR.classify.buildLean.fireThreshold) { legacyLean = 'fire' }
		else if (total > 0 && NARR.classify.buildLean && ice > 0 && ice >= (Number(levels.fire) || 0) && ice >= (Number(levels.bolt) || 0) && ice >= (Number(levels.lightning) || 0) && ice >= (Number(levels.shield) || 0)) { legacyLean = 'ice' }
		return { primarySkillId: primarySkillId, primarySkillLevel: primarySkillLevel, ownedSkillCount: ownedSkillCount, totalSkillLevels: totalSkillLevels, activeCombos: activeCombos, legacyLean: legacyLean }
	}
	function stageNameFor(run) {
		if (run.lastStageName) { return run.lastStageName }
		var id = Number(GS.maxStageId || GS.stageId) || 0
		for (var i = 0; i < STAGE_LIST.length; i++) { if (STAGE_LIST[i].id === id) { return STAGE_LIST[i].name || '' } }
		return ''
	}
	function formatNumber(value) {
		var n = Math.max(0, Number(value) || 0), text = n.toFixed(1)
		return text.replace(/\.0$/, '')
	}
	function skillName(id) { return SKILL_LABEL[id] || id || '未知技能' }
	function comboName(id) { return COMBO_LABEL[id] || id || '未知Combo' }
	function primaryPhenomenon(id, maxed, seed) {
		return pickCopy(copyAt('primarySkill.' + (maxed ? 'max.' : 'normal.') + id), seed || ('primary:' + id)) || pickCopy(copyAt('genericBuild'), seed || ('primary:' + id))
	}
	function buildArcPhenomenon(comboCount, comboId, seed) {
		var source = copyAt('buildArc.' + Math.min(3, comboCount)), list = comboCount === 1 && source && source[comboId] ? source[comboId] : source
		return pickCopy(list, seed || ('build:' + comboCount + ':' + (comboId || ''))) || pickCopy(copyAt('genericBuild'), seed || ('build:' + comboCount))
	}
	function weight(name) { return Number(WEIGHTS[name]) || 0 }
	function makeCandidate(type, event, text, confidence, evidenceSeq, score, key, summary, role) { return { type: type, time: Number(event && event.time) || 0, text: text, confidence: confidence || 'fact', evidenceSeq: evidenceSeq || [], score: score || 0, key: key || type, summary: !!summary, role: role || 'summary' } }
	function findEvent(events, seq) { for (var i = 0; i < events.length; i++) { if (events[i].seq === seq) { return events[i] } } return null }
	function latestEvent(events, type) { for (var i = events.length - 1; i >= 0; i--) { if (events[i].type === type) { return events[i] } } return null }
	function directorScore(name, fallback) { var scores = V3.director && V3.director.scores || {}; return Number(scores[name]) || fallback || 0 }
	function uniqueComboEvents(events) {
		var out = [], seen = {}
		for (var i = 0; i < events.length; i++) { var e = events[i]; if (e.type === 'combo_found' && e.comboId && !seen[e.comboId]) { seen[e.comboId] = true; out.push(e) } }
		return out
	}
	function latestSkillGain(events, id) {
		var best = null
		for (var i = 0; i < events.length; i++) { var e = events[i]; if (e.type === 'skill_gain' && e.skillId === id && (!best || e.level > best.level || e.level === best.level && e.time > best.time)) { best = e } }
		return best
	}
	function buildSummaryCandidates(snapshot, terminal) {
		var events = snapshot.ledger, stageEvent = latestEvent(events, 'stage_enter'), anchor = stageEvent || terminal, out = []
		if (anchor) { out.push(makeCandidate('summary_growth', anchor, pickCopy(copyAt('summary'), 'summary:growth:' + anchor.seq), 'fact', [anchor.seq], directorScore('summary', 20), 'summary:growth', true, 'summary')) }
		if (terminal) { out.push(makeCandidate('summary_path', terminal, pickCopy(copyAt('summary'), 'summary:path:' + terminal.seq), 'fact', [terminal.seq], directorScore('summary', 20), 'summary:path', true, 'summary')) }
		return out
	}
	function buildTerminalCandidate(snapshot, seedPrefix, avoidText) {
		var terminal = snapshot.terminal
		if (!terminal) { return null }
		var food = snapshot.lastRiskyFood && findEvent(snapshot.ledger, snapshot.lastRiskyFood.seq), data = { seconds: formatNumber(snapshot.secondsSinceRiskyFood) }, prefix = seedPrefix || 'ending'
		if (snapshot.cause === 'greedy' && food && snapshot.secondsSinceRiskyFood != null) {
			var greedyList = copyAt('ending.greedy'), greedyText = '', greedyStart = stableHash(prefix + ':greedy:' + terminal.seq) % Math.max(1, greedyList.length)
			for (var gi = 0; gi < greedyList.length; gi++) {
				var rendered = renderCopy(greedyList[(greedyStart + gi) % greedyList.length], data)
				if (rendered && (!avoidText || rendered !== avoidText)) { greedyText = rendered; break }
			}
			if (!greedyText) { greedyText = renderCopy(pickCopy(greedyList, prefix + ':greedy:' + terminal.seq), data) }
			return makeCandidate(terminal.type || 'ending', terminal, greedyText, 'correlation', [food.seq, terminal.seq], 0, 'ending:' + terminal.seq, false, 'ending')
		}
		var cause = snapshot.cause === 'clear' || snapshot.cause === 'boss' || snapshot.cause === 'attrition' ? snapshot.cause : 'attrition'
		var text = pickCopyAvoiding(copyAt('ending.' + cause), prefix + ':' + cause + ':' + terminal.seq, avoidText) || pickCopy(copyAt('ending.' + cause), prefix + ':' + cause + ':' + terminal.seq)
		return makeCandidate(terminal.type || 'ending', terminal, text, 'fact', [terminal.seq], 0, 'ending:' + terminal.seq, false, 'ending')
	}
	function buildCandidates(snapshot) {
		var events = snapshot.ledger, candidates = [], combos = uniqueComboEvents(events), profile = snapshot.buildProfile || {}, primary = profile.primarySkillId ? latestSkillGain(events, profile.primarySkillId) : null, comboSeqs = [], lastBuildEvent = null
		for (var i = 0; i < combos.length; i++) { comboSeqs.push(combos[i].seq); if (!lastBuildEvent || combos[i].time > lastBuildEvent.time) { lastBuildEvent = combos[i] } }
		if (combos.length) {
			var arcText = buildArcPhenomenon(combos.length, combos[0].comboId, 'build:' + comboSeqs.join(','))
			candidates.push(makeCandidate('build_arc', lastBuildEvent, arcText, 'fact', comboSeqs.slice(), directorScore('buildArc' + Math.min(3, combos.length), 86), 'build:' + comboSeqs.join(','), false, 'build'))
		} else if (primary) {
			var primaryText = primaryPhenomenon(primary.skillId, profile.primarySkillLevel >= CONFIG.SKILL.maxLevel, 'primary:' + primary.skillId + ':' + primary.level)
			candidates.push(makeCandidate('primary_skill', primary, primaryText, 'fact', [primary.seq], directorScore('primarySkill', 72), 'skill:' + primary.skillId, false, 'growth'))
		}
		if (!combos.length) {
			var stageEvent = latestEvent(events, 'stage_enter')
			if (stageEvent && stageEvent.stageId >= 2) { candidates.push(makeCandidate('growth', stageEvent, pickCopy(copyAt('chapter.' + stageEvent.stageId + '.lines'), 'growth:' + stageEvent.seq), 'fact', [stageEvent.seq], directorScore('growth', 36), 'growth:' + stageEvent.stageId, false, 'growth')) }
		}
		var recovery = null, recoveryHurt = null
		for (var h = events.length - 1; h >= 0 && !recovery; h--) {
			if (events[h].type !== 'hurt' || events[h].hp !== (Number(RISK.lowHpThreshold) || 0)) { continue }
			for (var he = h + 1; he < events.length; he++) { if (events[he].type === 'heal_pickup' && events[he].time >= events[h].time && events[he].time - events[h].time <= (Number(MEMORY.recoveryWindowSec) || 0) && events[he].hpAfter > events[he].hpBefore) { recovery = events[he]; recoveryHurt = events[h]; break } }
		}
		if (recovery) { candidates.push(makeCandidate('near_death_recovery', recovery, pickCopy(copyAt('trial.nearDeathRecovery'), 'recovery:' + recovery.seq), 'fact', [recoveryHurt.seq, recovery.seq], directorScore('recovery', 84), 'recovery:' + recovery.seq, false, 'trial')) }
		var riskyGain = null, riskyPickup = null
		for (var si = 0; si < events.length; si++) { if (events[si].type === 'skill_gain' && events[si].pickupRisky && events[si].pickupSeq && findEvent(events, events[si].pickupSeq)) { riskyGain = events[si]; riskyPickup = findEvent(events, events[si].pickupSeq) } }
		if (riskyGain) { candidates.push(makeCandidate('risky_skill', riskyGain, pickCopy(copyAt('trial.riskySkill'), 'risky-skill:' + riskyGain.seq), 'fact', [riskyPickup.seq, riskyGain.seq], directorScore('riskySkill', 82), 'risky-skill:' + riskyGain.seq, false, 'trial')) }
		var kills = Number(snapshot.stats.enemyKills) || 0, milestone = kills >= (Number(V3.eulogy && V3.eulogy.killMilestoneHigh) || 1000) ? 'killHigh' : kills >= (Number(V3.eulogy && V3.eulogy.killMilestoneMid) || 500) ? 'killMid' : ''
		if (milestone && snapshot.terminal) { candidates.push(makeCandidate('kill_milestone', snapshot.terminal, pickCopy(copyAt('feat.' + milestone), 'kills:' + kills), 'fact', [snapshot.terminal.seq], directorScore('killMilestone', 78), 'kills:' + milestone, false, 'feat')) }
		var elite = latestEvent(events, 'elite_kill')
		if (elite) { candidates.push(makeCandidate('elite_feat', elite, pickCopy(copyAt('trial.elite'), 'elite:' + elite.seq), 'fact', [elite.seq], directorScore('elite', 62), 'elite:' + elite.seq, false, 'feat')) }
		var boss = latestEvent(events, 'boss_encounter')
		if (boss && (snapshot.cause === 'boss' || snapshot.cause === 'clear')) { candidates.push(makeCandidate('threshold', boss, pickCopy(copyAt('threshold'), 'threshold:' + boss.seq), 'fact', [boss.seq], directorScore('threshold', 90), 'threshold:' + boss.seq, false, 'threshold')) }
		var summaries = buildSummaryCandidates(snapshot, snapshot.terminal), terminal = buildTerminalCandidate(snapshot)
		return { candidates: candidates, summaries: summaries, terminal: terminal }
	}
	function evidenceExists(snapshot, candidate) { for (var i = 0; i < candidate.evidenceSeq.length; i++) { if (!findEvent(snapshot.ledger, candidate.evidenceSeq[i])) { return false } } return candidate.evidenceSeq.length > 0 }
	function selectHighlights(snapshot, eulogyPlan) {
		var built = buildCandidates(snapshot), max = Math.max(1, Number(MEMORY.maxHighlights) || 5), min = Math.max(1, Number(MEMORY.minHighlights) || 3), selected = [], usedKeys = {}, avoidText = eulogyPlan && eulogyPlan.signatureText || ''
		var ranked = built.candidates.slice().sort(function (a, b) { return b.score - a.score || a.time - b.time || a.evidenceSeq[0] - b.evidenceSeq[0] })
		function add(candidate) {
			if (!candidate || selected.length >= max - 1 || usedKeys[candidate.key] || !evidenceExists(snapshot, candidate) || avoidText && candidate.text === avoidText) { return false }
			selected.push(candidate); usedKeys[candidate.key] = true
			return true
		}
		function firstRole(role) { for (var i = 0; i < ranked.length; i++) { if (ranked[i].role === role && add(ranked[i])) { return true } } return false }
		firstRole('build'); if (!selected.length) { firstRole('growth') }
		if (snapshot.cause === 'boss' || snapshot.cause === 'clear') { firstRole('threshold') }
		var trials = 0
		for (var t = 0; t < ranked.length && selected.length < max - 1 && trials < 2; t++) { if ((ranked[t].role === 'trial' || ranked[t].role === 'feat') && add(ranked[t])) { trials++ } }
		for (var c = 0; c < ranked.length && selected.length < max - 1; c++) { if (ranked[c].role !== 'build' && ranked[c].role !== 'growth' && ranked[c].role !== 'threshold' && ranked[c].role !== 'trial' && ranked[c].role !== 'feat') { add(ranked[c]) } }
		var summaries = built.summaries.slice().sort(function (a, b) { return a.time - b.time || a.evidenceSeq[0] - b.evidenceSeq[0] })
		for (var s = 0; selected.length < min - 1 && s < summaries.length; s++) { add(summaries[s]) }
		while (selected.length < min - 1 && summaries.length) { var fallback = summaries[selected.length % summaries.length]; if (!usedKeys[fallback.key]) { add(fallback) } else { break } }
		selected.sort(function (a, b) { return a.time - b.time || a.evidenceSeq[0] - b.evidenceSeq[0] })
		var out = []
		for (var o = 0; o < selected.length; o++) { out.push({ type: selected[o].type, role: selected[o].role, time: selected[o].time, text: selected[o].text, confidence: selected[o].confidence, evidenceSeq: selected[o].evidenceSeq.slice() }) }
		if (built.terminal) { out.push({ type: built.terminal.type, role: built.terminal.role, time: built.terminal.time, text: built.terminal.text, confidence: built.terminal.confidence, evidenceSeq: built.terminal.evidenceSeq.slice() }) }
		return out
	}
	function buildVerdict(snapshot) { return pickCopy(copyAt('verdict.' + snapshot.cause, ['这一局结束']), 'verdict:' + snapshot.cause + ':' + (snapshot.terminal && snapshot.terminal.seq || '')) }
	function latestRecoveryPair(events) {
		for (var e = events.length - 1; e >= 0; e--) {
			if (events[e].type !== 'heal_pickup' || events[e].hpAfter <= events[e].hpBefore) { continue }
			for (var h = e - 1; h >= 0; h--) {
				if (events[h].type === 'hurt' && events[h].hp === (Number(RISK.lowHpThreshold) || 0) && events[e].time - events[h].time <= (Number(MEMORY.recoveryWindowSec) || 0)) { return { hurt: events[h], heal: events[e] } }
			}
		}
		return null
	}
	function latestRiskySkillGain(events) {
		for (var i = events.length - 1; i >= 0; i--) { if (events[i].type === 'skill_gain' && events[i].pickupRisky) { return events[i] } }
		return null
	}
	function buildLifeSignature(snapshot, memoryCandidates) {
		var profile = snapshot.buildProfile || {}, events = snapshot.ledger, combos = uniqueComboEvents(events), avoid = '', signature = '', family = 'generic', evidenceSeq = []
		function candidateText(type) {
			for (var i = 0; i < memoryCandidates.length; i++) { if (memoryCandidates[i].type === type) { return memoryCandidates[i].text || '' } }
			return ''
		}
		if (combos.length) {
			avoid = candidateText('build_arc')
			signature = pickCopyAvoiding(combos.length === 1 ? copyAt('buildArc.1.' + combos[0].comboId) : copyAt('buildArc.' + Math.min(3, combos.length)), 'eulogy:build:' + combos.map(function (e) { return e.seq }).join(','), avoid) || buildArcPhenomenon(combos.length, combos[0].comboId, 'eulogy:build:' + combos.map(function (e) { return e.seq }).join(','))
			family = 'build'
			for (var c = 0; c < combos.length; c++) { evidenceSeq.push(combos[c].seq) }
		} else if (profile.primarySkillId) {
			avoid = candidateText('primary_skill')
			var primaryList = copyAt('primarySkill.' + (profile.primarySkillLevel >= CONFIG.SKILL.maxLevel ? 'max.' : 'normal.') + profile.primarySkillId)
			signature = pickCopyAvoiding(primaryList, 'eulogy:skill:' + profile.primarySkillId + ':' + profile.primarySkillLevel, avoid) || primaryPhenomenon(profile.primarySkillId, profile.primarySkillLevel >= CONFIG.SKILL.maxLevel, 'eulogy:skill:' + profile.primarySkillId + ':' + profile.primarySkillLevel)
			family = 'skill:' + profile.primarySkillId
			var primary = latestSkillGain(events, profile.primarySkillId); if (primary) { evidenceSeq.push(primary.seq) }
		} else {
			var recovery = latestRecoveryPair(events), risky = latestRiskySkillGain(events), kills = Number(snapshot.stats.enemyKills) || 0
			if (recovery) {
				avoid = candidateText('near_death_recovery')
				signature = pickCopyAvoiding(copyAt('trial.nearDeathRecovery'), 'eulogy:recovery:' + recovery.heal.seq, avoid) || pickCopy(copyAt('trial.nearDeathRecovery'), 'eulogy:recovery:' + recovery.heal.seq)
				family = 'recovery'; evidenceSeq = [recovery.hurt.seq, recovery.heal.seq]
			} else if (risky) {
				avoid = candidateText('risky_skill')
				signature = pickCopyAvoiding(copyAt('trial.riskySkill'), 'eulogy:risky:' + risky.seq, avoid) || pickCopy(copyAt('trial.riskySkill'), 'eulogy:risky:' + risky.seq)
				family = 'risky_skill'; evidenceSeq = [risky.seq]
			} else if (kills >= (Number(V3.eulogy && V3.eulogy.killMilestoneHigh) || 1000)) {
				signature = pickCopy(copyAt('feat.killHigh'), 'eulogy:kills:high'); family = 'kills:high'
			} else if (kills >= (Number(V3.eulogy && V3.eulogy.killMilestoneMid) || 500)) {
				signature = pickCopy(copyAt('feat.killMid'), 'eulogy:kills:mid'); family = 'kills:mid'
			} else {
				signature = pickCopy(copyAt('genericBuild'), 'eulogy:generic'); family = 'generic'
			}
		}
		return { text: signature, family: family, evidenceSeq: evidenceSeq }
	}
	function buildEulogyV4(snapshot) {
		var memoryBuilt = buildCandidates(snapshot), life = buildLifeSignature(snapshot, memoryBuilt.candidates || []), memoryEnding = memoryBuilt.terminal
		var outcome = buildTerminalCandidate(snapshot, 'eulogy-ending', memoryEnding && memoryEnding.text)
		var signature = life.text || pickCopy(copyAt('genericBuild'), 'eulogy:generic'), ending = outcome && outcome.text || ''
		if (!ending) { ending = pickCopy(copyAt('summary'), 'eulogy:summary:' + (snapshot.terminal && snapshot.terminal.seq || '')) }
		var connector = life.family === 'recovery' && snapshot.cause !== 'clear' ? '可' : ''
		return { text: [signature, connector + ending].filter(Boolean).join(''), signatureText: signature, signatureFamily: life.family, signatureEvidenceSeq: life.evidenceSeq || [], endingText: ending }
	}
	function buildBaseSnapshot(cause) {
		var run = ensureRun(), events = clone(run.events), profile = buildProfile(), final = finalEvent(), finalCause = cause || GS.deathCause || (final && final.cause) || null
		if (cause && !finalEventType) { finalize(cause === 'clear' ? 'clear' : 'death', cause); final = finalEvent(); finalCause = cause; events = clone(run.events) }
		var behavior = getBehaviorProfile(), stageName = stageNameFor(run)
		return {
			cause: finalCause, time: Number(GS.timeSec) || 0, stageId: Number(GS.stageId) || 0, stageName: stageName, maxStageId: GS.maxStageId || 0,
			segments: GS.segments || 0, maxSegments: GS.maxSegments || 0, kills: GS.kills || 0, killStreakMax: GS.killStreakMax || 0,
			score: GS.score || 0, comboScore: GS.comboScore || 0, bossDefeated: !!GS.bossDefeated,
			lethalEnemyType: run.lastLethalHit ? (run.lastLethalHit.enemyType || '') : '', secondsSinceRiskyFood: secondsSinceRiskyFood(),
			lastRiskyFood: clone(run.lastRiskyFood), lastLethalHit: clone(run.lastLethalHit), stats: clone(run.stats), behavior: behavior, echoHistory: clone(run.echoState.history),
			buildProfile: profile, comboHighlights: clone(GS.comboHighlights || []), ownedSkills: clone(GS.ownedSkills || {}), ledger: events,
			terminal: clone(final)
		}
	}
	function snapshot(cause) {
		var out = buildBaseSnapshot(cause), eulogyPlan = buildEulogyV4(out)
		out.highlights = selectHighlights(out, eulogyPlan); out.verdict = buildVerdict(out); out.eulogy = eulogyPlan.text
		var best = null
		for (var i = 0; i < out.highlights.length; i++) { var item = out.highlights[i]; if (item.role === 'build') { best = item; break } if (!best && (item.role === 'growth' || item.role === 'trial' || item.role === 'feat' || item.role === 'threshold')) { best = item } }
		out.primaryHighlight = best ? best.text : (out.highlights.length ? out.highlights[0].text : '这一局结束了。')
		return out
	}
	function getBehaviorProfile() {
		var run = ensureRun(), stats = run.stats
		run.behavior.greedEvidence = stats.riskyFoodPickups + stats.lowHpRiskyFoodPickups
		run.behavior.resilienceEvidence = stats.nearDeathHits + stats.heals
		run.behavior.combatPressureEvidence = stats.eliteKills + stats.comboFoundCount
		return clone(run.behavior)
	}
	Bus.on('core:run_reset', resetState)
	Bus.on('wave:stage', recordStage)
	Bus.on('pickup:eat', recordFood)
	Bus.on('pickup:eat', recordHeal)
	Bus.on('pickup:eat', recordSkillPickup)
	Bus.on('skill:offer', recordSkillOffer)
	Bus.on('skill:gained', recordSkillGain)
	Bus.on('combo:found', recordCombo)
	Bus.on('snake:hurt', recordHurt)
	Bus.on('enemy:die', recordEnemyDie)
	Bus.on('snake:dead', function () { finalize('death', classifyDeathCause()) })
	Bus.on('boss:defeated', function () { GS.bossDefeated = true; finalize('clear', 'clear') })
	ensureRun(); resetState()
	var Narrative = {
		snapshot: snapshot,
		classifyDeathCause: classifyDeathCause,
		getBuildProfile: buildProfile,
		getLedger: function () { return clone(ensureRun().events) },
		getBehaviorProfile: getBehaviorProfile
	}
	Registry.register('narrative', Narrative)
	Log.info('narrative V2 就绪：Ledger / Memory Director / Renderer')
})(typeof window !== 'undefined' ? window : this)
