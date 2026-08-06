;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = CONFIG.AUDIO
	var MIX = AUDIO.mix || {}, HIT_AUDIO = AUDIO.hit || {}, DEATH_AUDIO = AUDIO.death || {}, SKILL_SFX = AUDIO.skills || {}
	var ELECTRIC_AUDIO = AUDIO.electric

	var MASTER_GAIN = AUDIO.masterVolume
	var UI_VOLUME = AUDIO.uiVolume == null ? 0.68 : AUDIO.uiVolume

	var ctx = null, master = null, limiter = null, sfxGain = null, uiGain = null, muted = !AUDIO.enabled
	var sfxBus = { skill: null, impact: null, death: null }
	// —— BGM 子链（程序化 BGM v4：动态留白、压力让位、与战斗 SFX 分轨）——
	var bgmGain = null
	var layerGain = { explore: null, battle: null, boss: null }
	var bgmRunning = false, bgmTimer = null
	var bgmNodes = [], sfxNodes = [], uiNodes = []
	var absStep = 0, nextNoteTime = 0
	var sfxPauseMul = 1, hardPaused = false, duckTimer = null, musicSampleAt = 0, pressureLevel = 0, pressureTarget = 0, buildLevel = 0, buildTarget = 0
	var pressureBgmMul = 1, lastPressureBgmMul = 1
	var runCount = 0, suppressStartCue = false

	// 表现层参数：只控制声音密度、层次和响应，不改变任何玩法数值。
	var AUDIO_MIX = {
		stateSampleSec: 0.25, stateLerp: 0.18, pressureMobCap: 12, pressureChaseCap: 4,
		pressureHpWeight: 0.55, pressureMobWeight: 0.75, pressureChaseWeight: 0.65, pressureBossWeight: 0.90,
		buildSkillWeight: 0.35, buildLevelWeight: 0.06, buildMaxedWeight: 0.25, buildComboWeight: 0.35,
		buildStreakCap: 8, buildStreakWeight: 0.20, buildHarmonyBand: 0.75, buildLeadBand: 1.65,
		pressurePulseBand: 1.0, pressureTensionBand: 2.0,
		pauseRampSec: MIX.pauseRampSec == null ? 0.06 : MIX.pauseRampSec
	}
	var UI_AUDIO = {
		press: { notes: [640], gain: 0.035, spacing: 0.04 },
		confirm: { notes: [520, 780], gain: 0.055, spacing: 0.06 },
		back: { notes: [400, 280], gain: 0.045, spacing: 0.06 },
		toggle: { notes: [480, 660], gain: 0.045, spacing: 0.06 }
	}
	var BOSS_AUDIO = {
		impactFreq: 92, impactEndHz: 38, impactDuration: 0.16, impactGain: 0.22,
		impactNoiseDuration: 0.14, impactNoiseGain: 0.14, restSec: 0.18,
		motive: [220, 330, 440, 554], motiveGain: 0.14, motiveSpacing: 0.09,
		atmosphereDelay: 0.68, atmosphereDuration: 0.58, atmosphereGain: 0.035,
		atmosphere: [370, 466, 622]
	}
	var SKILL_AUDIO = {
		fire: { base: 240, rise: 1.35, type: 'triangle' }, ice: { base: 430, rise: 1.25, type: 'sine' },
		bolt: { base: 720, rise: 1.35, type: 'square' }, shield: { base: 260, rise: 1.20, type: 'triangle' },
		lightning: { base: 880, rise: 1.50, type: 'sawtooth' }
	}
	var COMBO_AUDIO = {
		steamExplosion: { notes: [180, 270, 405], type: 'triangle' },
		electroTurret: { notes: [520, 780, 1170], type: 'square' },
		burningBarrage: { notes: [240, 360, 540], type: 'triangle' }
	}
	var stepDur = 60 / 88 / 4, targetStepDur = stepDur
	var curLayer = 'explore', battleHeat = 1.0, pauseMul = 1, eventDuckMul = 1, densityDuckMul = 1, chooseDuckMul = 1

	function ensure() {
		if (ctx) { return true }
		var AC = global.AudioContext || global.webkitAudioContext
		if (!AC) { return false }
		ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER_GAIN
		if (typeof ctx.createDynamicsCompressor === 'function') {
			limiter = ctx.createDynamicsCompressor()
			limiter.threshold.value = MIX.limiterThresholdDb == null ? -8 : MIX.limiterThresholdDb
			limiter.knee.value = MIX.limiterKneeDb == null ? 12 : MIX.limiterKneeDb
			limiter.ratio.value = MIX.limiterRatio == null ? 4 : MIX.limiterRatio
			limiter.attack.value = MIX.limiterAttackSec == null ? 0.003 : MIX.limiterAttackSec
			limiter.release.value = MIX.limiterReleaseSec == null ? 0.16 : MIX.limiterReleaseSec
			master.connect(limiter); limiter.connect(ctx.destination)
		} else { master.connect(ctx.destination) }
		sfxGain = ctx.createGain(); sfxGain.gain.value = AUDIO.sfxVolume; sfxGain.connect(master)
		uiGain = ctx.createGain(); uiGain.gain.value = UI_VOLUME; uiGain.connect(master)
		sfxBus.skill = ctx.createGain(); sfxBus.skill.gain.value = MIX.skillBusGain == null ? 0.94 : MIX.skillBusGain; sfxBus.skill.connect(sfxGain)
		sfxBus.impact = ctx.createGain(); sfxBus.impact.gain.value = MIX.impactBusGain == null ? 0.72 : MIX.impactBusGain; sfxBus.impact.connect(sfxGain)
		sfxBus.death = ctx.createGain(); sfxBus.death.gain.value = MIX.deathBusGain == null ? 0.82 : MIX.deathBusGain; sfxBus.death.connect(sfxGain)
		bgmGain = ctx.createGain(); bgmGain.gain.value = AUDIO.bgmVolume; bgmGain.connect(master)
		layerGain.explore = ctx.createGain(); layerGain.explore.gain.value = MIX.layerExploreGain == null ? 0.90 : MIX.layerExploreGain; layerGain.explore.connect(bgmGain)
		layerGain.battle = ctx.createGain(); layerGain.battle.gain.value = 0; layerGain.battle.connect(bgmGain)
		layerGain.boss = ctx.createGain(); layerGain.boss.gain.value = 0; layerGain.boss.connect(bgmGain)
		return true
	}
	function voiceCap(list) {
		if (list === sfxNodes) { return MIX.maxSfxVoices || 16 }
		if (list === uiNodes) { return MIX.maxUiVoices || 12 }
		return Infinity
	}
	function reserveVoice(list, priority) {
		var cap = voiceCap(list)
		if (list.length < cap) { return true }
		var pick = -1, lowest = Infinity, oldest = Infinity
		for (var i = 0; i < list.length; i++) {
			var rec = list[i], p = rec.priority == null ? 2 : rec.priority, started = rec.startedAt || 0
			if (p < lowest || (p === lowest && started < oldest)) { lowest = p; oldest = started; pick = i }
		}
		if (pick < 0 || lowest > priority) { return false }
		var old = list.splice(pick, 1)[0]
		try { old.node.stop(ctx.currentTime) } catch (_) {}
		return true
	}
	function trackVoice(list, node, priority) {
		var rec = { node: node, priority: priority == null ? 2 : priority, startedAt: ctx ? ctx.currentTime : 0 }
		list.push(rec)
		node.onended = function () { var i = list.indexOf(rec); if (i >= 0) { list.splice(i, 1) } }
		return node
	}
	function stopVoices(list) {
		if (!ctx) { list.length = 0; return }
		var t = ctx.currentTime
		while (list.length) { var rec = list.pop(); try { rec.node.stop(t) } catch (_) {} }
	}
	function resume(cb) {
		if (!ctx) { if (cb) { cb() } return }
		if (ctx.state === 'running') { if (cb) { cb() } return }
		if (ctx.state === 'closed' || typeof ctx.resume !== 'function') { return }
		try {
			var p = ctx.resume()
			if (p && p.then) {
				p.then(function () { if (ctx && ctx.state === 'running') { if (cb) { cb() } } }).catch(function () {})
			} else if (ctx.state === 'running' && cb) { cb() }
		} catch (_) {}
	}
	var _kicked = false
	function _kickIos() {
		if (!ctx || _kicked) { return }
		try {
			var o = ctx.createOscillator(), g = ctx.createGain()
			g.gain.value = 0.001; o.type = 'sine'; o.frequency.value = 440
			o.connect(g); g.connect(ctx.destination)
			var t = ctx.currentTime || 0
			o.start(0); o.stop(t + 0.05); _kicked = true
		} catch (e) {}
	}

	function tone(opt, dest, when) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		opt = opt || {}
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes
		var priority = opt.priority == null ? 2 : opt.priority
		if (!reserveVoice(list, priority)) { return }
		var t = (when == null) ? ctx.currentTime : when, dur = opt.dur || 0.12
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = opt.type || 'sine'; o.frequency.setValueAtTime(opt.freq, t)
		if (opt.freqTo) { o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.freqTo), t + dur) }
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.005))
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(g); g.connect(out); trackVoice(list, o, priority); o.start(t); o.stop(t + dur + 0.02)
	}
	function noise(dur, gain, dest, when, priority) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes, p = priority == null ? 2 : priority
		if (!reserveVoice(list, p)) { return }
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain || 0.2
		src.connect(g); g.connect(out); trackVoice(list, src, p); if (when == null) { src.start() } else { src.start(when) }
	}
	function filteredNoise(opt, dest, when) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		opt = opt || {}
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes, priority = opt.priority == null ? 2 : opt.priority
		if (!reserveVoice(list, priority)) { return }
		var t = when == null ? ctx.currentTime : when, dur = opt.dur || 0.08
		var n = Math.max(1, Math.floor(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, n, ctx.sampleRate), data = buf.getChannelData(0)
		for (var i = 0; i < n; i++) {
			var envelope = 1 - i / n, grain = opt.crackle ? (((i % 43) < 7) ? 1 : 0.34) : 1
			data[i] = (Math.random() * 2 - 1) * envelope * grain
		}
		var src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), g = ctx.createGain()
		src.buffer = buf; filter.type = opt.filterType || 'bandpass'
		filter.frequency.setValueAtTime(Math.max(20, opt.freq || 1200), t)
		if (opt.freqTo) { filter.frequency.exponentialRampToValueAtTime(Math.max(20, opt.freqTo), t + dur) }
		filter.Q.value = opt.q == null ? 0.8 : opt.q
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(opt.gain || 0.08, t + (opt.attack || 0.002))
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		src.connect(filter); filter.connect(g); g.connect(out); trackVoice(list, src, priority); src.start(t); src.stop(t + dur + 0.02)
	}

	var _lastAt = {}
	var electricGateAt = { lightning: -Infinity, electro: -Infinity }
	function throttled(key, ms, fn) {
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (_lastAt[key] && (now - _lastAt[key]) < ms) { return }
		_lastAt[key] = now; fn()
	}
	function electricGate(kind, fn) {
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now(), gate = ELECTRIC_AUDIO.gateMs
		var last = electricGateAt[kind] == null ? -Infinity : electricGateAt[kind]
		if (now - last < gate) { return }
		electricGateAt[kind] = now; fn()
	}
	var sfxCount = 0, sfxWinStart = 0, densityOn = false, densityTimer = null
	function sfxPing(weight) {
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		var win = MIX.densityWindowMs || 220, threshold = MIX.densityThreshold || 5
		if (!sfxWinStart || (now - sfxWinStart) > win) { sfxCount = 0; sfxWinStart = now }
		sfxCount += weight == null ? 1 : weight
		if (sfxCount > threshold) {
			if (!densityOn) { densityOn = true; densityDuckMul = MIX.densityDuckMul == null ? 0.70 : MIX.densityDuckMul; applyBgmGain(false) }
			if (densityTimer) { clearTimeout(densityTimer) }
			densityTimer = setTimeout(function () { densityTimer = null; densityOn = false; densityDuckMul = 1; applyBgmGain(false) }, MIX.densityReleaseMs || 260)
		}
	}

	function ownedLevel(id) {
		var gs = global.GS || {}, owned = gs.ownedSkills || {}
		return Math.max(1, Math.min(5, owned[id] || 1))
	}
	function playFire() {
		if (muted || hardPaused || !ensure()) { return }
		var dur = HIT_AUDIO.fireDuration || 0.15
		sfxPing(0.35)
		filteredNoise({ dur: dur, gain: HIT_AUDIO.fireNoiseGain || 0.066, filterType: 'bandpass', freq: (HIT_AUDIO.fireNoiseMinHz || 760) + Math.random() * ((HIT_AUDIO.fireNoiseMaxHz || 1040) - (HIT_AUDIO.fireNoiseMinHz || 760)), freqTo: HIT_AUDIO.fireNoiseMinHz || 760, q: 0.75, priority: 1 }, sfxBus.skill)
		tone({ freq: HIT_AUDIO.fireBodyStartHz || 235, freqTo: HIT_AUDIO.fireBodyEndHz || 155, dur: dur, type: 'triangle', gain: HIT_AUDIO.fireBodyGain || 0.032, priority: 1 }, sfxBus.skill)
	}
	function playGenericHit(d) {
		d = d || {}; sfxPing(d.crit ? 1.0 : 0.55)
		filteredNoise({ dur: HIT_AUDIO.genericNoiseDuration || 0.04, gain: HIT_AUDIO.genericNoiseGain || 0.04, filterType: 'lowpass', freq: HIT_AUDIO.genericNoiseHz || 980, freqTo: 520, q: 0.70, priority: d.crit ? 3 : 1 }, sfxBus.impact)
		if (d.crit) {
			tone({ freq: HIT_AUDIO.critBodyStartHz || 360, freqTo: HIT_AUDIO.critBodyEndHz || 125, dur: HIT_AUDIO.critBodyDuration || 0.09, type: 'triangle', gain: HIT_AUDIO.critBodyGain || 0.085, priority: 3 }, sfxBus.impact)
			duck('light')
		} else {
			tone({ freq: HIT_AUDIO.genericBodyStartHz || 270, freqTo: HIT_AUDIO.genericBodyEndHz || 165, dur: HIT_AUDIO.genericBodyDuration || 0.055, type: 'triangle', gain: HIT_AUDIO.genericBodyGain || 0.052, priority: 1 }, sfxBus.impact)
		}
	}
	function playShieldContact() {
		sfxPing(0.35)
		tone({ freq: HIT_AUDIO.shieldStartHz || 430, freqTo: HIT_AUDIO.shieldEndHz || 250, dur: HIT_AUDIO.shieldDuration || 0.075, type: 'triangle', gain: HIT_AUDIO.shieldGain || 0.05, priority: 1 }, sfxBus.skill)
	}
	function playBurnTick() {
		sfxPing(0.30)
		filteredNoise({ dur: HIT_AUDIO.burnDuration || 0.09, gain: HIT_AUDIO.burnNoiseGain || 0.04, filterType: 'bandpass', freq: HIT_AUDIO.burnNoiseHz || 1450, freqTo: 980, q: 0.8, crackle: true, priority: 1 }, sfxBus.skill)
		tone({ freq: HIT_AUDIO.burnBodyStartHz || 390, freqTo: HIT_AUDIO.burnBodyEndHz || 230, dur: HIT_AUDIO.burnDuration || 0.09, type: 'triangle', gain: HIT_AUDIO.burnBodyGain || 0.035, priority: 1 }, sfxBus.skill)
	}
	function playBolt() {
		var a = SKILL_SFX.bolt || {}, level = ownedLevel('bolt')
		sfxPing(0.75)
		filteredNoise({ dur: a.noiseDuration || 0.04, gain: audioLevelValue(a.noiseGainByLevel, level, 0.038), filterType: 'bandpass', freq: a.noiseHz || 1750, freqTo: 1120, q: 0.9, priority: 2 }, sfxBus.skill)
		tone({ freq: audioLevelValue(a.startHzByLevel, level, 890), freqTo: audioLevelValue(a.endHzByLevel, level, 525), dur: audioLevelValue(a.durationByLevel, level, 0.072), type: 'square', gain: audioLevelValue(a.gainByLevel, level, 0.078), attack: 0.001, priority: 2 }, sfxBus.skill)
	}
	function playIceThrow() {
		var a = SKILL_SFX.ice || {}, level = ownedLevel('ice')
		sfxPing(0.55)
		tone({ freq: audioLevelValue(a.throwStartHzByLevel, level, 1090), freqTo: a.throwEndHz || 520, dur: a.throwDuration || 0.105, type: 'sine', gain: audioLevelValue(a.throwGainByLevel, level, 0.064), priority: 2 }, sfxBus.skill)
	}
	function playIcePool() {
		var a = SKILL_SFX.ice || {}, level = ownedLevel('ice')
		sfxPing(0.60)
		filteredNoise({ dur: a.poolDuration || 0.17, gain: a.poolAirGain || 0.032, filterType: 'highpass', freq: 1250, freqTo: 1900, q: 0.6, priority: 1 }, sfxBus.skill)
		tone({ freq: audioLevelValue(a.poolStartHzByLevel, level, 455), freqTo: audioLevelValue(a.poolEndHzByLevel, level, 870), dur: a.poolDuration || 0.17, type: 'sine', gain: audioLevelValue(a.poolGainByLevel, level, 0.054), priority: 2 }, sfxBus.skill)
	}
	function playBurnDart() {
		var a = SKILL_SFX.burnDart || {}
		sfxPing(0.90)
		filteredNoise({ dur: a.noiseDuration || 0.07, gain: a.noiseGain || 0.052, filterType: 'bandpass', freq: a.noiseHz || 1320, freqTo: 760, q: 0.85, crackle: true, priority: 2 }, sfxBus.skill)
		tone({ freq: a.bodyStartHz || 460, freqTo: a.bodyEndHz || 205, dur: a.bodyDuration || 0.095, type: 'triangle', gain: a.bodyGain || 0.064, priority: 2 }, sfxBus.skill)
		tone({ freq: a.emberStartHz || 980, freqTo: a.emberEndHz || 610, dur: a.emberDuration || 0.06, type: 'square', gain: a.emberGain || 0.03, priority: 1 }, sfxBus.skill)
	}
	function playSteamBlast(d) {
		var a = SKILL_SFX.steam || {}, count = Math.max(1, Math.min(6, (d && d.hitCount) || 1)), weight = 1 + (count - 1) * 0.08
		sfxPing(1.35); duck('light')
		filteredNoise({ dur: a.noiseDuration || 0.145, gain: (a.noiseGain || 0.075) * weight, filterType: 'lowpass', freq: a.noiseHz || 1100, freqTo: 520, q: 0.65, priority: 3 }, sfxBus.skill)
		tone({ freq: a.bodyStartHz || 185, freqTo: a.bodyEndHz || 78, dur: a.bodyDuration || 0.155, type: 'triangle', gain: (a.bodyGain || 0.105) * weight, priority: 3 }, sfxBus.skill)
		tone({ freq: a.ventStartHz || 720, freqTo: a.ventEndHz || 1180, dur: a.ventDuration || 0.12, type: 'sine', gain: a.ventGain || 0.036, priority: 2 }, sfxBus.skill)
	}

	var deathCluster = { count: 0, kind: '', source: '', crit: false }, deathTimer = null
	function deathRank(kind) { return kind === 'elite' ? 4 : (kind === 'charger' ? 3 : (kind === 'chaser' ? 2 : 1)) }
	function clearDeathCluster() {
		if (deathTimer) { clearTimeout(deathTimer); deathTimer = null }
		deathCluster.count = 0; deathCluster.kind = ''; deathCluster.source = ''; deathCluster.crit = false
	}
	function queueEnemyDeath(d) {
		d = d || {}; if (d.kind === 'boss') { return }
		deathCluster.count = Math.min(DEATH_AUDIO.maxClusterCount || 6, deathCluster.count + 1)
		if (!deathCluster.kind || deathRank(d.kind) > deathRank(deathCluster.kind)) { deathCluster.kind = d.kind || 'wanderer' }
		deathCluster.source = d.source || deathCluster.source; deathCluster.crit = deathCluster.crit || !!d.crit
		if (!deathTimer) { deathTimer = setTimeout(flushEnemyDeath, DEATH_AUDIO.clusterMs || 55) }
	}
	function flushEnemyDeath() {
		deathTimer = null
		if (!deathCluster.count || muted || hardPaused || !ensure()) { clearDeathCluster(); return }
		var count = deathCluster.count, kind = deathCluster.kind || 'wanderer', src = deathCluster.source || '', elite = kind === 'elite'
		var countMul = 1 + Math.min(5, count - 1) * 0.075
		sfxPing(elite ? 1.6 : 0.8 + count * 0.12)
		filteredNoise({ dur: DEATH_AUDIO.noiseDuration || 0.095, gain: (DEATH_AUDIO.noiseGain || 0.08) * countMul, filterType: 'lowpass', freq: DEATH_AUDIO.noiseHz || 620, freqTo: 280, q: 0.65, priority: elite ? 3 : 2 }, sfxBus.death)
		var starts = DEATH_AUDIO.kindStartHz || {}, startHz = starts[kind] || starts.wanderer || 245
		tone({ freq: startHz, freqTo: Math.max(52, startHz * 0.48), dur: DEATH_AUDIO.bodyDuration || 0.11, type: 'triangle', gain: (DEATH_AUDIO.bodyGain || 0.06) * countMul, priority: elite ? 3 : 2 }, sfxBus.death)
		if (src === 'ice') { tone({ freq: 960, freqTo: 580, dur: 0.055, type: 'sine', gain: 0.022, priority: 1 }, sfxBus.death) }
		else if (src === 'fire' || src === 'burn' || src === 'burning' || src === 'steam') { filteredNoise({ dur: 0.055, gain: 0.022, filterType: 'bandpass', freq: 1380, freqTo: 880, q: 0.8, crackle: true, priority: 1 }, sfxBus.death) }
		else if (src === 'lightning' || src === 'electro') { tone({ freq: 1120, freqTo: 720, dur: 0.045, type: 'square', gain: 0.018, priority: 1 }, sfxBus.death) }
		if (elite) {
			tone({ freq: DEATH_AUDIO.eliteLowStartHz || 105, freqTo: DEATH_AUDIO.eliteLowEndHz || 48, dur: DEATH_AUDIO.eliteLowDuration || 0.18, type: 'triangle', gain: DEATH_AUDIO.eliteLowGain || 0.10, priority: 3 }, sfxBus.death)
			duck('light')
		}
		clearDeathCluster()
	}

	function playUiCue(notes, type, gain, spacing, when) {
		if (muted || hardPaused || !ensure()) { return }
		var t = when == null ? ctx.currentTime : when, step = spacing || 0.06
		for (var i = 0; i < notes.length; i++) { tone({ freq: notes[i], dur: 0.12 + i * 0.02, type: type, gain: gain, priority: 4 }, uiGain, t + i * step) }
	}
	function playSfxCue(notes, type, gain, spacing, when) {
		if (muted || hardPaused || !ensure()) { return }
		var t = when == null ? ctx.currentTime : when, step = spacing || 0.06
		for (var i = 0; i < notes.length; i++) { tone({ freq: notes[i], dur: 0.08 + i * 0.01, type: type, gain: gain, priority: 2 }, sfxBus.skill, t + i * step) }
	}
	function audioLevelValue(list, level, fallback) {
		var i = Math.max(0, Math.min(4, (level || 1) - 1))
		return list && list[i] != null ? list[i] : fallback
	}
	function playElectricLightning(d) {
		if (muted || hardPaused || !ensure()) { return }
		var meta = d && d.chain && d.chain.vfxMeta ? d.chain.vfxMeta : null
		var level = Math.max(1, Math.min(5, meta && meta.level ? meta.level : ((d && d.level) || 1))), a = ELECTRIC_AUDIO.lightning, t = ctx.currentTime
		var crackDur = audioLevelValue(a.crackleDurationByLevel, level, 0.10)
		resume(); sfxPing(1.0)
		filteredNoise({ dur: crackDur, gain: audioLevelValue(a.crackleGainByLevel, level, 0.09), filterType: 'bandpass', freq: audioLevelValue(a.crackleHzByLevel, level, 2700), freqTo: audioLevelValue(a.crackleHzByLevel, level, 2700) * 0.72, q: a.crackleQ, crackle: true, priority: 3 }, sfxBus.skill, t)
		tone({ freq: audioLevelValue(a.snapStartHzByLevel, level, 1200), freqTo: audioLevelValue(a.snapEndHzByLevel, level, 680), dur: audioLevelValue(a.snapDurationByLevel, level, 0.085), type: 'sawtooth', gain: audioLevelValue(a.snapGainByLevel, level, 0.12), attack: 0.002, priority: 3 }, sfxBus.skill, t)
		tone({ freq: audioLevelValue(a.tailStartHzByLevel, level, 1040), freqTo: audioLevelValue(a.tailEndHzByLevel, level, 1600), dur: audioLevelValue(a.tailDurationByLevel, level, 0.12), type: 'triangle', gain: audioLevelValue(a.tailGainByLevel, level, 0.043), attack: 0.004, priority: 2 }, sfxBus.skill, t + 0.012)
		var pulses = audioLevelValue(a.pulseCountByLevel, level, 1), pulseGain = audioLevelValue(a.pulseGainByLevel, level, 0.03)
		for (var i = 0; i < pulses; i++) {
			tone({ freq: 1680 - i * 150, freqTo: 1080 - i * 90, dur: a.pulseDurationSec, type: 'square', gain: pulseGain, attack: 0.001, priority: 2 }, sfxBus.skill, t + 0.018 + i * a.pulseSpacingSec)
		}
	}
	function playElectroDeploy(d) {
		if (muted || hardPaused || !ensure()) { return }
		var a = ELECTRIC_AUDIO.electro, t = ctx.currentTime
		resume(); sfxPing(0.75)
		tone({ freq: a.deployStartHz, freqTo: a.deployEndHz, dur: a.deployDuration, type: 'sine', gain: a.deployGain, attack: 0.012, priority: 2 }, sfxBus.skill, t)
		tone({ freq: a.deployBodyStartHz, freqTo: a.deployBodyEndHz, dur: a.deployDuration * 0.90, type: 'triangle', gain: a.deployBodyGain, attack: 0.010, priority: 2 }, sfxBus.skill, t)
	}
	function playElectroFire(d) {
		if (muted || hardPaused || !ensure()) { return }
		var a = ELECTRIC_AUDIO.electro, level = Math.max(1, Math.min(5, (d && d.comboLevel) || 1)), t = ctx.currentTime
		resume(); sfxPing(1.35); duck('light')
		tone({ freq: audioLevelValue(a.fireBodyStartHzByLevel, level, 175), freqTo: a.fireBodyEndHz, dur: audioLevelValue(a.fireBodyDurationByLevel, level, 0.12), type: 'triangle', gain: audioLevelValue(a.fireBodyGainByLevel, level, 0.16), attack: 0.002, priority: 4 }, sfxBus.skill, t)
		filteredNoise({ dur: a.blastNoiseDuration, gain: audioLevelValue(a.blastNoiseGainByLevel, level, 0.086), filterType: 'lowpass', freq: a.blastNoiseHz, freqTo: a.blastNoiseHz * 0.58, q: a.blastNoiseQ, priority: 3 }, sfxBus.skill, t)
		tone({ freq: a.fireClickStartHz, freqTo: a.fireClickEndHz, dur: a.fireClickDuration, type: 'square', gain: audioLevelValue(a.fireClickGainByLevel, level, 0.065), attack: 0.001, priority: 3 }, sfxBus.skill, t + 0.006)
		tone({ freq: audioLevelValue(a.energyStartHzByLevel, level, 810), freqTo: audioLevelValue(a.energyEndHzByLevel, level, 440), dur: a.energyDuration, type: 'triangle', gain: audioLevelValue(a.energyGainByLevel, level, 0.055), attack: 0.003, priority: 2 }, sfxBus.skill, t + 0.018)
	}
	function playElectroEnd(d) {
		if (muted || hardPaused || !ensure()) { return }
		var a = ELECTRIC_AUDIO.electro, t = ctx.currentTime
		resume(); sfxPing(0.35); tone({ freq: a.endStartHz, freqTo: a.endEndHz, dur: a.endDuration, type: 'sine', gain: a.endGain, attack: 0.006, priority: 1 }, sfxBus.skill, t)
	}

	function playUiSemantic(d) {
		d = d || {}
		var cue = UI_AUDIO[d.kind] || UI_AUDIO.press
		if (d.id === 'replay') { suppressStartCue = true }
		playUiCue(cue.notes, 'sine', cue.gain, cue.spacing)
	}
	function playSkillCue(id, level) {
		var a = SKILL_AUDIO[id] || SKILL_AUDIO.fire, lv = Math.max(1, level || 1)
		if (lv >= 5) {
			playUiCue([a.base, a.base * a.rise, a.base * a.rise * 1.25], a.type, 0.16, 0.07)
		} else if (lv > 1) {
			playUiCue([a.base * 0.85, a.base * a.rise], a.type, 0.13, 0.08)
		} else {
			playUiCue([a.base, a.base * a.rise], a.type, 0.12, 0.09)
		}
	}
	function playComboCue(id) {
		var a = COMBO_AUDIO[id]
		if (!a) { return }
		playUiCue(a.notes, a.type, 0.18, 0.09)
		duck('major')
	}
	function playPauseCue() { playUiCue([360, 540], 'triangle', 0.14, 0.07) }
	function playStartCue(replay) { playUiCue(replay ? [300, 450, 600] : [220, 330], 'sine', 0.12, 0.08) }
	function playDeathCue() {
		if (muted || hardPaused || !ensure()) { return }
		var at = ctx.currentTime + (MIX.deathSilenceSec == null ? 0.12 : MIX.deathSilenceSec)
		playUiCue([260, 190, 120], 'sawtooth', 0.16, 0.10, at)
	}
	function playBossDefeatCue() {
		if (muted || hardPaused || !ensure()) { return }
		var t = ctx.currentTime
		tone({ freq: BOSS_AUDIO.impactFreq, freqTo: BOSS_AUDIO.impactEndHz, dur: BOSS_AUDIO.impactDuration, type: 'triangle', gain: BOSS_AUDIO.impactGain, priority: 4 }, uiGain, t)
		noise(BOSS_AUDIO.impactNoiseDuration, BOSS_AUDIO.impactNoiseGain, uiGain, t, 4)
		var motiveAt = t + BOSS_AUDIO.restSec
		playUiCue(BOSS_AUDIO.motive, 'triangle', BOSS_AUDIO.motiveGain, BOSS_AUDIO.motiveSpacing, motiveAt)
		var atmosphereAt = t + BOSS_AUDIO.atmosphereDelay
		for (var i = 0; i < BOSS_AUDIO.atmosphere.length; i++) { tone({ freq: BOSS_AUDIO.atmosphere[i], dur: BOSS_AUDIO.atmosphereDuration, type: 'sine', gain: BOSS_AUDIO.atmosphereGain, priority: 4 }, uiGain, atmosphereAt + i * 0.04) }
	}

	Bus.on('ui:feedback', playUiSemantic)
	Bus.on('snake:hurt', function () {
		sfxPing(2); tone({ freq: 180, freqTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.30, priority: 4 }, sfxBus.impact); duck('major')
	})
	Bus.on('snake:wall', function () { throttled('snake:wall', 110, function () { sfxPing(0.25); filteredNoise({ dur: 0.065, gain: 0.045, filterType: 'lowpass', freq: 720, freqTo: 360, q: 0.7, priority: 1 }, sfxBus.impact) }) })
	Bus.on('enemy:hit', function (d) {
		d = d || {}
		if (d.isDot && d.src === 'fire') { throttled('hit:fire', HIT_AUDIO.fireThrottleMs || 190, playFire); return }
		if (d.isDot && d.src === 'shield') { throttled('hit:shield', HIT_AUDIO.shieldThrottleMs || 210, playShieldContact); return }
		if (d.isDot && d.src === 'burn') { throttled('hit:burn', HIT_AUDIO.burnThrottleMs || 250, playBurnTick); return }
		// 这些来源由对应 fx:* 事件拥有主要音效，禁止再叠通用命中音。
		if (d.src === 'bolt' || d.src === 'burning' || d.src === 'steam' || d.src === 'lightning' || d.src === 'electro') { return }
		throttled('hit:generic', HIT_AUDIO.genericThrottleMs || 85, function () { playGenericHit(d) })
	})
	Bus.on('enemy:die', queueEnemyDeath)
	Bus.on('enemy:phase', function () { sfxPing(2); tone({ freq: 110, freqTo: 60, dur: 0.50, type: 'sawtooth', gain: 0.30, priority: 4 }, sfxBus.death); duck('major') })
	Bus.on('skill:offer', function () { sfxPing(1.2); chooseDuckMul = MIX.chooseDuckMul == null ? 0.50 : MIX.chooseDuckMul; applyBgmGain(false); playUiCue([520, 660, 880], 'sine', 0.14, 0.08) })
	Bus.on('skill:gained', function (d) { d = d || {}; chooseDuckMul = 1; applyBgmGain(false); playSkillCue(d.id, d.level); duck('major') })
	Bus.on('combo:found', function (d) { sfxPing(1.8); playComboCue(d && d.id) })
	Bus.on('wave:boss_warn', function () { sfxPing(2); playUiCue([140, 110, 90], 'square', 0.18, 0.10); duck('major') })
	Bus.on('wave:stage', function () { throttled('wave:stage', 120, function () { sfxPing(0.8); tone({ freq: 440, freqTo: 660, dur: 0.14, type: 'sine', gain: 0.10, priority: 2 }, uiGain) }) })
	Bus.on('pickup:eat', function (d) {
		d = d || {}
		if (d.kind === 'skill') { return }   // 技能球由 skill:offer 拥有声音，避免同帧双提示。
		if (d.kind === 'heal') { sfxPing(0.8); playUiCue([300, 450], 'triangle', 0.10, 0.08) }
		else { throttled('pickup:food', 85, function () { sfxPing(0.35); tone({ freq: 760, freqTo: 940, dur: 0.065, type: 'triangle', gain: 0.060, priority: 2 }, uiGain) }) }
	})
	Bus.on('fx:bolt', function () { var a = SKILL_SFX.bolt || {}; throttled('fx:bolt', a.throttleMs || 95, playBolt) })
	Bus.on('fx:ice_throw', function () { var a = SKILL_SFX.ice || {}; throttled('fx:ice_throw', a.throwThrottleMs || 130, playIceThrow) })
	Bus.on('fx:ice_pool', function () { var a = SKILL_SFX.ice || {}; throttled('fx:ice_pool', a.poolThrottleMs || 190, playIcePool) })
	Bus.on('fx:lightning', function (d) { electricGate('lightning', function () { playElectricLightning(d) }) })
	Bus.on('fx:electroturretdeploy', function (d) { electricGate('electro', function () { playElectroDeploy(d) }) })
	Bus.on('fx:electroturretfire', function (d) { electricGate('electro', function () { playElectroFire(d) }) })
	Bus.on('fx:electroturretend', playElectroEnd)
	Bus.on('fx:steamblast', function (d) { var a = SKILL_SFX.steam || {}; throttled('fx:steamblast', a.throttleMs || 210, function () { playSteamBlast(d) }) })
	Bus.on('fx:burndart', function () { var a = SKILL_SFX.burnDart || {}; throttled('fx:burndart', a.throttleMs || 125, playBurnDart) })

	// ================= 程序化 BGM（v4 · 动态让位与分层混音） =================
	// 频率表(Hz) · A 自然小调
	var FREQ = { A2:110.00, F2:87.31, G2:98.00, C3:130.81, F3:174.61, G3:196.00, A3:220.00, B3:246.94, C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, As4:466.16, B4:493.88, C5:523.25, E5:659.25 }
	// PAD 每小节三和弦（bar0..3 = Am F C G），每小节步 0 触发、持续整小节
	var PAD = [['A3','C4','E4'], ['F3','A3','C4'], ['C4','E4','G4'], ['G3','B3','D4']]
	// BASS 每小节根音（explore 半音符步 0&8 / battle·boss 八分脉冲步 0,2..14）
	var BASS_ROOT = ['A2','F2','C3','G2']
	// ARP explore（八分步 0,2,4,6 · 蛇之动机 A→C→E 起头）
	var ARP_EXPLORE = [['A3','C4','E4','A4'], ['F3','A3','C4','F4'], ['C4','E4','G4','C5'], ['G3','B3','D4','G4']]
	// ARP battle/boss（十六分填满 16 步 · 蛇之动机 A→C→E 起头）
	var ARP_BATTLE = [
		['A3','C4','E4','A4','E4','C4','A3','C4','E4','A4','E4','C4','A3','C4','E4','A4'],
		['F3','A3','C4','F4','C4','A3','F3','A3','C4','F4','C4','A3','F3','A3','C4','F4'],
		['C4','E4','G4','C5','G4','E4','C4','E4','G4','C5','G4','E4','C4','E4','G4','C5'],
		['G3','B3','D4','G4','D4','B3','G3','B3','D4','G4','D4','B3','G3','B3','D4','G4']
	]
	var STEP_BPM = { explore: 88, battle: 124, boss: 136 }   // 16 分音符 = 60÷BPM÷4 秒

	// 单音（振荡器每音新建，Web Audio one-shot；层增益节点持久复用）
	function playOsc(freq, type, t, dur, peak, dest, attack, release) {
		if (!ctx || hardPaused) { return }
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = type; o.frequency.setValueAtTime(freq, t)
		var a = attack || 0.005, r = release || 0.02
		var susEnd = t + Math.max(a + 0.01, dur - r)
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(peak, t + a)
		g.gain.setValueAtTime(peak, susEnd)
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(g); g.connect(dest); trackVoice(bgmNodes, o); o.start(t); o.stop(t + dur + 0.02)
	}
	// PAD：2× triangle，其一 +6 cent 宽度
	function playPad(freq, t, dur, dest) {
		playOsc(freq, 'triangle', t, dur, 0.05, dest, 0.4, 0.6)
		playOsc(freq * 1.00347, 'triangle', t, dur, 0.05, dest, 0.4, 0.6)
	}
	// 白噪（可定时，供 PERC 调度）
	function playNoiseAt(dur, gain, t, dest) {
		if (!ctx || hardPaused) { return }
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain
		src.connect(g); g.connect(dest); trackVoice(bgmNodes, src); src.start(t)
	}
	// 层增益 crossfade（~0.8s 无缝）
	function rampGain(node, v, t, dur) {
		node.gain.cancelScheduledValues(t)
		node.gain.setValueAtTime(node.gain.value, t)
		node.gain.linearRampToValueAtTime(v, t + (dur || 0.8))
	}
	// 全局 BGM 增益 = bgmVolume × 暂停系数 × ducking 系数
	function applyBgmGain(immediate) {
		if (!bgmGain) { return }
		var v = AUDIO.bgmVolume * pauseMul * eventDuckMul * densityDuckMul * chooseDuckMul * pressureBgmMul
		var t = ctx.currentTime, g = bgmGain.gain
		g.cancelScheduledValues(t)
		if (immediate) { g.setValueAtTime(v, t) }
		else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + 0.15) }
	}
	function applySfxGain(immediate) {
		if (!sfxGain || !ctx) { return }
		var t = ctx.currentTime, g = sfxGain.gain, v = AUDIO.sfxVolume * sfxPauseMul
		g.cancelScheduledValues(t)
		if (immediate) { g.setValueAtTime(v, t) }
		else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + AUDIO_MIX.pauseRampSec) }
	}
	function setLayer(layer) {
		curLayer = layer
		targetStepDur = 60 / STEP_BPM[layer] / 4
		if (!ctx) { return }
		var t = ctx.currentTime
		if (layer === 'explore') {
			rampGain(layerGain.explore, MIX.layerExploreGain == null ? 0.90 : MIX.layerExploreGain, t)
			rampGain(layerGain.battle, 0, t); rampGain(layerGain.boss, 0, t)
		} else if (layer === 'battle') {
			rampGain(layerGain.explore, MIX.layerBattlePadGain == null ? 0.70 : MIX.layerBattlePadGain, t)
			rampGain(layerGain.battle, MIX.layerBattleGain == null ? 0.80 : MIX.layerBattleGain, t); rampGain(layerGain.boss, 0, t)
		} else {
			rampGain(layerGain.explore, 0, t); rampGain(layerGain.battle, 0, t)
			rampGain(layerGain.boss, MIX.layerBossGain == null ? 0.82 : MIX.layerBossGain, t)
		}
		Log.info('[bgm] layer -> ' + layer + '  heat=' + battleHeat)
	}
	var duckReleaseAt = 0
	function duck(kind) {
		var major = kind === 'major', mul = major ? (MIX.majorDuckMul == null ? 0.54 : MIX.majorDuckMul) : (MIX.lightDuckMul == null ? 0.78 : MIX.lightDuckMul)
		var sec = major ? (MIX.majorDuckSec == null ? 0.28 : MIX.majorDuckSec) : (MIX.lightDuckSec == null ? 0.16 : MIX.lightDuckSec)
		var now = Date.now(), releaseAt = now + sec * 1000
		eventDuckMul = Math.min(eventDuckMul, mul); duckReleaseAt = Math.max(duckReleaseAt, releaseAt); applyBgmGain(false)
		if (duckTimer) { clearTimeout(duckTimer) }
		duckTimer = setTimeout(function () { duckTimer = null; duckReleaseAt = 0; eventDuckMul = 1; applyBgmGain(false) }, Math.max(1, duckReleaseAt - now))
	}
	// 单步编曲（bar 0..3 = Am F C G；stepInBar 0..15）
	function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
	function updateMusicState() {
		if (!ctx || !bgmRunning || (ctx.currentTime - musicSampleAt) < AUDIO_MIX.stateSampleSec) { return }
		musicSampleAt = ctx.currentTime
		var gs = global.GS || {}, enemy = Registry && Registry.get ? Registry.get('enemy') : null
		var stage = clamp(gs.stageId || 1, 1, 5), stageBase = [0.12, 0.32, 0.56, 0.82, 1.05][stage - 1]
		var mobs = enemy && enemy.countMobs ? enemy.countMobs() : 0
		var chasing = enemy && enemy.chasingCount ? enemy.chasingCount() : 0
		var boss = !!(enemy && enemy.hasBoss && enemy.hasBoss())
		var coreMax = CONFIG.PLAYER && CONFIG.PLAYER.coreHp ? CONFIG.PLAYER.coreHp : 3
		var hpPressure = clamp(1 - ((gs.coreHp == null ? coreMax : gs.coreHp) / coreMax), 0, 1)
		pressureTarget = clamp(stageBase + clamp(mobs / AUDIO_MIX.pressureMobCap, 0, 1) * AUDIO_MIX.pressureMobWeight + clamp(chasing / AUDIO_MIX.pressureChaseCap, 0, 1) * AUDIO_MIX.pressureChaseWeight + hpPressure * AUDIO_MIX.pressureHpWeight + (boss ? AUDIO_MIX.pressureBossWeight : 0), 0, 3)
		var owned = gs.ownedSkills || {}, ownedCount = 0, totalLevel = 0, maxed = 0, key
		for (key in owned) {
			if (!Object.prototype.hasOwnProperty.call(owned, key)) { continue }
			var level = Number(owned[key]) || 0
			if (level > 0) { ownedCount++; totalLevel += Math.min(5, level); if (level >= 5) { maxed++ } }
		}
		var comboCount = (gs.comboHighlights && gs.comboHighlights.length) || 0
		var streak = clamp((gs.killStreak || 0) / AUDIO_MIX.buildStreakCap, 0, 1)
		buildTarget = clamp(ownedCount * AUDIO_MIX.buildSkillWeight + totalLevel * AUDIO_MIX.buildLevelWeight + maxed * AUDIO_MIX.buildMaxedWeight + comboCount * AUDIO_MIX.buildComboWeight + streak * AUDIO_MIX.buildStreakWeight, 0, 3)
		pressureLevel += (pressureTarget - pressureLevel) * AUDIO_MIX.stateLerp
		buildLevel += (buildTarget - buildLevel) * AUDIO_MIX.stateLerp
		var pressureStart = MIX.bgmPressureStart == null ? 1.15 : MIX.bgmPressureStart
		var pressureEnd = MIX.bgmPressureEnd == null ? 2.70 : MIX.bgmPressureEnd
		var pressureRatio = clamp((pressureLevel - pressureStart) / Math.max(0.01, pressureEnd - pressureStart), 0, 1)
		pressureBgmMul = 1 - pressureRatio * (1 - (MIX.bgmPressureFloor == null ? 0.80 : MIX.bgmPressureFloor))
		if (Math.abs(pressureBgmMul - lastPressureBgmMul) >= 0.01) { lastPressureBgmMul = pressureBgmMul; applyBgmGain(false) }
	}
	function scheduleStep(stepAbs, t) {
		var bar = Math.floor((stepAbs % 64) / 16)
		var s = stepAbs % 16
		var isBattle = (curLayer === 'battle' || curLayer === 'boss')
		var destE = layerGain.explore, destB = layerGain.battle, destS = layerGain.boss, padDest = (curLayer === 'boss' ? destS : destE)
		var dynamicDest = (curLayer === 'boss' ? destS : curLayer === 'battle' ? destB : destE)
		if (buildLevel >= AUDIO_MIX.buildHarmonyBand && (s === 4 || s === 12)) { playOsc(FREQ.A4, 'triangle', t, stepDur * 1.8, 0.035, dynamicDest, 0.01, 0.04) }
		if (buildLevel >= AUDIO_MIX.buildLeadBand && (s === 3 || s === 11)) { playOsc(FREQ.E5, 'sine', t, stepDur * 1.2, 0.028, dynamicDest, 0.005, 0.03) }
		if (isBattle && pressureLevel >= AUDIO_MIX.pressurePulseBand && (s === 6 || s === 14)) { playOsc(FREQ.A2, 'triangle', t, stepDur * 1.5, 0.035, dynamicDest, 0.005, 0.03) }
		if (curLayer === 'boss' && pressureLevel >= AUDIO_MIX.pressureTensionBand && (s === 1 || s === 9)) { playOsc(FREQ.As4, 'sawtooth', t, stepDur * 0.8, 0.028, destS, 0.003, 0.04) }
		// [A.1] PAD：每小节步 0 持续整小节；boss pedal 覆盖整循环（bar0 触发）
		if (s === 0) {
			var chord = PAD[bar]
			for (var i = 0; i < chord.length; i++) { playPad(FREQ[chord[i]], t, 16 * stepDur, padDest) }
			if (curLayer === 'boss' && bar === 0) { playOsc(FREQ.A2, 'triangle', t, 64 * stepDur, 0.10, destS, 0.4, 0.8) }
		}
		// [A.2] BASS
		var root = FREQ[BASS_ROOT[bar]]
		if (!isBattle) {
			if (s === 0 || s === 8) { playOsc(root, 'triangle', t, 8 * stepDur, 0.095, destE, 0.01, 0.05) }
		} else {
			if (s % 2 === 0) { playOsc(root, 'triangle', t, 2 * stepDur, 0.095, (curLayer === 'boss' ? destS : destB), 0.005, 0.04) }
		}
		// [A.3] ARP
		if (!isBattle) {
			if (s % 2 === 0) {
				var seq = ARP_EXPLORE[bar], idx = s / 2
				if (idx < seq.length) { playOsc(FREQ[seq[idx]], 'triangle', t, 2 * stepDur, 0.050, destE, 0.005, 0.03) }
			}
		} else {
			var seqB = ARP_BATTLE[bar]
			playOsc(FREQ[seqB[s]], 'square', t, stepDur * 0.9, 0.052, (curLayer === 'boss' ? destS : destB), 0.003, 0.02)
			if (curLayer === 'boss' && (s === 14 || s === 15)) {   // 半音张力 stab A#4→B4
				playOsc((s === 14 ? FREQ.As4 : FREQ.B4), 'sawtooth', t, stepDur * 0.9, 0.05, destS, 0.003, 0.05)
			}
		}
		// [A.4] PERC（仅 battle/boss）
		if (isBattle) {
			var pdest = (curLayer === 'boss' ? destS : destB)
			var isBoss = (curLayer === 'boss')
			var kickSteps = isBoss ? [0, 4, 8, 12] : [0, 8]
			var hatSteps = isBoss ? [2, 6, 10, 14] : [4, 12]
			if (kickSteps.indexOf(s) >= 0) { playNoiseAt(0.08, 0.10, t, pdest) }
			if (hatSteps.indexOf(s) >= 0) { playNoiseAt(0.02, 0.05, t, pdest) }
			// 层内密度自适应（用户裁定 stage3→4 升温，不新增层）：stage4 满 offbeat + 加密 kick 感；stage3 轻 hat
			if (!isBoss) {
				if (battleHeat >= 2.0) {
					if (s === 2 || s === 6 || s === 10 || s === 14) { playNoiseAt(0.02, 0.04, t, pdest) }
				} else if (battleHeat >= 1.4) {
					if (s === 2 || s === 10) { playNoiseAt(0.02, 0.035, t, pdest) }
				}
			}
		}
	}
	// lookahead 调度器（不进主循环、零每帧分配；~25ms 轮询）
	function _sched() {
		if (!bgmRunning || !ctx) { return }
		updateMusicState()
		while (nextNoteTime < ctx.currentTime + 0.12) {
			scheduleStep(absStep, nextNoteTime)
			absStep++
			stepDur += (targetStepDur - stepDur) * 0.12   // 平滑 tempo 过渡，绝不重置时钟（无缝）
			nextNoteTime += stepDur
		}
	}
	function startBgm() {
		if (hardPaused || !ensure()) { return }
		resume(function () {     // 必须等 ctx 真正 running 再调度；suspended 期 currentTime 冻结，音符全堆在 0.1s 处永不会响(原 iOS 静音根因)
			if (bgmRunning) { return }
			bgmRunning = true
			absStep = 0
			stepDur = targetStepDur = 60 / STEP_BPM[curLayer] / 4
			nextNoteTime = ctx.currentTime + 0.1
			applyBgmGain(true)
			bgmTimer = setInterval(_sched, 25)
			Log.info('[bgm] 启动 explore')
		})
	}
	function stopBgm() {
		bgmRunning = false
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
		stopVoices(bgmNodes)
	}
	function clearAudioTimers() {
		if (densityTimer) { clearTimeout(densityTimer); densityTimer = null }
		if (duckTimer) { clearTimeout(duckTimer); duckTimer = null }
		clearDeathCluster(); duckReleaseAt = 0
		densityOn = false; densityDuckMul = 1; eventDuckMul = 1
	}

	// —— BGM 事件订阅（追加，不动既有 12 事件音效行）——
	// 开局/重开局：在用户手势同步链内解锁音频并起 explore BGM。
	// 关键：AudioContext 必须在「用户手势」内创建+resume，否则浏览器 autoplay 策略会在主循环 rAF 内挡住→开局静音，
	// 要等后续手势(移动键/拾取音效里的 resume)才解锁。core:run_reset 由 startIfMenu→core.resetRun 同步触发，属手势内→合规解锁（修复 2026-07-26）
	Bus.on('core:run_reset', function () {
		var skipStartCue = suppressStartCue
		suppressStartCue = false; hardPaused = false; clearAudioTimers()
		stopBgm(); stopVoices(sfxNodes); stopVoices(uiNodes)
		pauseMul = 1; sfxPauseMul = 1; eventDuckMul = 1; densityDuckMul = 1; chooseDuckMul = 1
		densityOn = false; sfxCount = 0; sfxWinStart = 0; _lastAt = {}; electricGateAt.lightning = -Infinity; electricGateAt.electro = -Infinity; curLayer = 'explore'; battleHeat = 1.0
		pressureLevel = 0; pressureTarget = 0; buildLevel = 0; buildTarget = 0; pressureBgmMul = 1; lastPressureBgmMul = 1; musicSampleAt = 0; runCount++
		if (ensure()) { applySfxGain(true); setLayer('explore') }
		startBgm()
		resume(function () { if (!skipStartCue) { playStartCue(runCount > 1) } })
	})
	Bus.on('wave:stage', function (d) {
		if (!bgmRunning) { startBgm() }
		var sid = d && d.stageId, layer = sid === 5 ? 'boss' : (sid >= 2 ? 'battle' : 'explore')
		battleHeat = sid === 4 ? 2.0 : sid === 3 ? 1.4 : 1.0
		setLayer(layer)
	})
	Bus.on('wave:boss_warn', function () { if (!bgmRunning) { startBgm() }; battleHeat = 2.0; setLayer('boss') })
	Bus.on('snake:dead', function () {
		clearAudioTimers(); stopBgm(); stopVoices(sfxNodes); stopVoices(uiNodes)
		pauseMul = 0; sfxPauseMul = 0; applyBgmGain(true); applySfxGain(true); playDeathCue()
	})
	Bus.on('boss:defeated', function () {
		clearAudioTimers(); stopBgm(); stopVoices(sfxNodes); stopVoices(uiNodes)
		pauseMul = 0; sfxPauseMul = 0; applyBgmGain(true); applySfxGain(true); playBossDefeatCue()
	})
	Bus.on('narrative:choice', function () { playUiSemantic({ kind: 'confirm', id: 'narrative' }) })
	Bus.on('game:pause_changed', function () {
		var st = global.GS && global.GS.status
		if (st === 'paused') {
			hardPaused = true; clearAudioTimers(); stopVoices(uiNodes); stopBgm(); stopVoices(sfxNodes); pauseMul = 0; sfxPauseMul = 0; applyBgmGain(false); applySfxGain(false)
		} else {
			hardPaused = false; pauseMul = 1; sfxPauseMul = 1; applyBgmGain(false); applySfxGain(false); startBgm(); resume(function () { playPauseCue() })
		}
	})

	var Audio = {
		setMuted: function (m) { muted = !!m; if (master) { master.gain.value = muted ? 0 : MASTER_GAIN } },  // 静音同时静 BGM（BGM 在 master 之下）
		isMuted: function () { return muted },
		unlock: function () { ensure(); _kickIos(); resume(function () { _kickIos(); if (!bgmRunning) { startBgm() } }); return !!(ctx && ctx.state === 'running') },   // 首次交互：手势内同步起振荡器(解锁 iOS 管线,含 standalone)+ctx running 后起 BGM；返回 running 供 UI 判断
		isRunning: function () { return !!(ctx && ctx.state === 'running') }
	}
	Registry.register('audio', Audio)
	Log.info('audio 就绪：Web Audio 分层混音 + 程序化 BGM v4.1')

})(typeof window !== 'undefined' ? window : this)
