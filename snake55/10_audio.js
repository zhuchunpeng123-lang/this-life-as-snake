;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = CONFIG.AUDIO
	var MIX = AUDIO.mix || {}, MUSIC = AUDIO.music || {}, HIT_AUDIO = AUDIO.hit || {}, DEATH_AUDIO = AUDIO.death || {}, SKILL_SFX = AUDIO.skills || {}
	var ELECTRIC_AUDIO = AUDIO.electric

	var MASTER_GAIN = AUDIO.masterVolume
	var UI_VOLUME = AUDIO.uiVolume == null ? 0.68 : AUDIO.uiVolume

	var ctx = null, master = null, limiter = null, sfxGain = null, uiGain = null, muted = !AUDIO.enabled
	var sfxBus = { skill: null, combo: null, player: null, impact: null, death: null, boss: null }
	// —— BGM 子链（Phase 1.2：五阶段独立编曲、单一 Transport、与战斗 SFX 分轨）——
	var bgmRunning = false, bgmTimer = null, bgmWanted = false
	var bgmMedia = {}, bgmActive = null, bgmActiveKey = '', bgmStageRequestTimer = null, bossLoopAtGameTime = null
	var currentMusicState = 'protection', pendingMusicState = '', bossWarningActive = false
	var bgmLifecycleToken = 0, bgmTransportSerial = 0, bgmPlaySerial = 0
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
	var stageBpm = [88, 124, 124, 124, 136]
	var stageHeat = MUSIC.stageHeat || [0.00, 0.78, 1.50, 2.22, 2.90]
	var stageBgmGainByStage = MUSIC.stageBgmGainByStage || [0.94, 1.00, 1.06, 1.10, 1.13]
	var currentStage = 1, pendingMusicStage = 0, stepDur = 60 / stageBpm[0] / 4, targetStepDur = stepDur
	var curLayer = 'stage1', battleHeat = stageHeat[0], stageBgmMul = stageBgmGainByStage[0], stageTransitionPending = 0
	var pauseMul = 1, eventDuckMul = 1, densityDuckMul = 1, chooseDuckMul = 1

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
		sfxBus.skill = ctx.createGain(); sfxBus.skill.gain.value = MIX.skillBusGain == null ? 0.88 : MIX.skillBusGain; sfxBus.skill.connect(sfxGain)
		sfxBus.combo = ctx.createGain(); sfxBus.combo.gain.value = MIX.comboBusGain == null ? 0.98 : MIX.comboBusGain; sfxBus.combo.connect(sfxGain)
		sfxBus.player = ctx.createGain(); sfxBus.player.gain.value = MIX.playerBusGain == null ? 1.00 : MIX.playerBusGain; sfxBus.player.connect(sfxGain)
		sfxBus.impact = ctx.createGain(); sfxBus.impact.gain.value = MIX.impactBusGain == null ? 0.62 : MIX.impactBusGain; sfxBus.impact.connect(sfxGain)
		sfxBus.death = ctx.createGain(); sfxBus.death.gain.value = MIX.deathBusGain == null ? 0.72 : MIX.deathBusGain; sfxBus.death.connect(sfxGain)
		sfxBus.boss = ctx.createGain(); sfxBus.boss.gain.value = MIX.bossBusGain == null ? 1.00 : MIX.bossBusGain; sfxBus.boss.connect(sfxGain)
		return true
	}
	var VOICE_BUDGET = MIX.voiceBudget || {}
	function voiceCap(list) {
		if (list === sfxNodes) { return MIX.maxSfxVoices || 16 }
		if (list === uiNodes) { return MIX.maxUiVoices || 10 }
		return Infinity
	}
	function busFamily(out) {
		if (out === uiGain) { return 'ui' }
		for (var key in sfxBus) { if (sfxBus[key] === out) { return key } }
		return 'skill'
	}
	function familyCap(family) {
		var cap = VOICE_BUDGET[family]
		return cap == null ? Infinity : Math.max(1, cap)
	}
	function pickVictim(list, priority, family) {
		var pick = -1, lowest = Infinity, oldest = Infinity
		for (var i = 0; i < list.length; i++) {
			var rec = list[i]
			if (family && rec.family !== family) { continue }
			var p = rec.priority == null ? 2 : rec.priority, started = rec.startedAt || 0
			if (p < lowest || (p === lowest && started < oldest)) { lowest = p; oldest = started; pick = i }
		}
		if (pick < 0 || lowest > priority) { return -1 }
		return pick
	}
	function evictVoice(list, pick) {
		if (pick < 0) { return false }
		var old = list.splice(pick, 1)[0]
		try { old.node.stop(ctx.currentTime) } catch (_) {}
		return true
	}
	function reserveVoice(list, priority, family) {
		var famCap = familyCap(family), famCount = 0
		for (var i = 0; i < list.length; i++) { if (list[i].family === family) { famCount++ } }
		if (famCount >= famCap && !evictVoice(list, pickVictim(list, priority, family))) { return false }
		var cap = voiceCap(list)
		if (list.length >= cap && !evictVoice(list, pickVictim(list, priority, null))) { return false }
		return true
	}
	function trackVoice(list, node, priority, family) {
		var rec = { node: node, priority: priority == null ? 2 : priority, family: family || 'music', startedAt: ctx ? ctx.currentTime : 0 }
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
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes, family = busFamily(out)
		var priority = opt.priority == null ? 2 : opt.priority
		if (!reserveVoice(list, priority, family)) { return }
		var t = (when == null) ? ctx.currentTime : when, dur = opt.dur || 0.12
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = opt.type || 'sine'; o.frequency.setValueAtTime(opt.freq, t)
		if (opt.freqTo) { o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.freqTo), t + dur) }
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.005))
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(g); g.connect(out); trackVoice(list, o, priority, family); o.start(t); o.stop(t + dur + 0.02)
	}
	function noise(dur, gain, dest, when, priority) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes, family = busFamily(out), p = priority == null ? 2 : priority
		if (!reserveVoice(list, p, family)) { return }
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain || 0.2
		src.connect(g); g.connect(out); trackVoice(list, src, p, family); if (when == null) { src.start() } else { src.start(when) }
	}
	function filteredNoise(opt, dest, when) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		opt = opt || {}
		var out = dest || sfxBus.skill || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes, family = busFamily(out), priority = opt.priority == null ? 2 : opt.priority
		if (!reserveVoice(list, priority, family)) { return }
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
		src.connect(filter); filter.connect(g); g.connect(out); trackVoice(list, src, priority, family); src.start(t); src.stop(t + dur + 0.02)
	}

	// Phase 1 sample-ready 接口：当前不强制引入素材；Phase 2 可把已解码 AudioBuffer 注册到同一 Bus/priority/voice-budget 管线。
	var sampleBank = {}
	function registerSample(id, buffer) {
		if (!id || !buffer || typeof buffer.duration !== 'number') { return false }
		sampleBank[id] = buffer; return true
	}
	function playSample(id, opt) {
		if (muted || hardPaused || !ensure() || !sampleBank[id]) { return false }
		opt = opt || {}; resume()
		var out = opt.dest || (opt.family === 'ui' ? uiGain : sfxBus[opt.family]) || sfxBus.skill, list = (out === uiGain) ? uiNodes : sfxNodes, family = busFamily(out)
		var priority = opt.priority == null ? 2 : opt.priority
		if (!reserveVoice(list, priority, family)) { return false }
		var src = ctx.createBufferSource(), g = ctx.createGain(), t = opt.when == null ? ctx.currentTime : opt.when
		src.buffer = sampleBank[id]; src.playbackRate.value = opt.rate == null ? 1 : opt.rate; g.gain.value = opt.gain == null ? 1 : opt.gain
		src.connect(g); g.connect(out); trackVoice(list, src, priority, family); src.start(t); return true
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
			if (!densityOn) { densityOn = true; densityDuckMul = MIX.densityDuckMul == null ? 0.76 : MIX.densityDuckMul; applyBgmGain(false) }
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
		filteredNoise({ dur: a.noiseDuration || 0.07, gain: a.noiseGain || 0.052, filterType: 'bandpass', freq: a.noiseHz || 1320, freqTo: 760, q: 0.85, crackle: true, priority: 2 }, sfxBus.combo)
		tone({ freq: a.bodyStartHz || 460, freqTo: a.bodyEndHz || 205, dur: a.bodyDuration || 0.095, type: 'triangle', gain: a.bodyGain || 0.064, priority: 2 }, sfxBus.combo)
		tone({ freq: a.emberStartHz || 980, freqTo: a.emberEndHz || 610, dur: a.emberDuration || 0.06, type: 'square', gain: a.emberGain || 0.03, priority: 1 }, sfxBus.combo)
	}
	function playSteamBlast(d) {
		var a = SKILL_SFX.steam || {}, count = Math.max(1, Math.min(6, (d && d.hitCount) || 1)), weight = 1 + (count - 1) * 0.08
		sfxPing(1.35); duck('light')
		filteredNoise({ dur: a.noiseDuration || 0.145, gain: (a.noiseGain || 0.075) * weight, filterType: 'lowpass', freq: a.noiseHz || 1100, freqTo: 520, q: 0.65, priority: 3 }, sfxBus.combo)
		tone({ freq: a.bodyStartHz || 185, freqTo: a.bodyEndHz || 78, dur: a.bodyDuration || 0.155, type: 'triangle', gain: (a.bodyGain || 0.105) * weight, priority: 3 }, sfxBus.combo)
		tone({ freq: a.ventStartHz || 720, freqTo: a.ventEndHz || 1180, dur: a.ventDuration || 0.12, type: 'sine', gain: a.ventGain || 0.036, priority: 2 }, sfxBus.combo)
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
		tone({ freq: a.deployStartHz, freqTo: a.deployEndHz, dur: a.deployDuration, type: 'sine', gain: a.deployGain, attack: 0.012, priority: 2 }, sfxBus.combo, t)
		tone({ freq: a.deployBodyStartHz, freqTo: a.deployBodyEndHz, dur: a.deployDuration * 0.90, type: 'triangle', gain: a.deployBodyGain, attack: 0.010, priority: 2 }, sfxBus.combo, t)
	}
	function playElectroFire(d) {
		if (muted || hardPaused || !ensure()) { return }
		var a = ELECTRIC_AUDIO.electro, level = Math.max(1, Math.min(5, (d && d.comboLevel) || 1)), t = ctx.currentTime
		resume(); sfxPing(1.35); duck('light')
		tone({ freq: audioLevelValue(a.fireBodyStartHzByLevel, level, 175), freqTo: a.fireBodyEndHz, dur: audioLevelValue(a.fireBodyDurationByLevel, level, 0.12), type: 'triangle', gain: audioLevelValue(a.fireBodyGainByLevel, level, 0.16), attack: 0.002, priority: 4 }, sfxBus.combo, t)
		filteredNoise({ dur: a.blastNoiseDuration, gain: audioLevelValue(a.blastNoiseGainByLevel, level, 0.086), filterType: 'lowpass', freq: a.blastNoiseHz, freqTo: a.blastNoiseHz * 0.58, q: a.blastNoiseQ, priority: 3 }, sfxBus.combo, t)
		tone({ freq: a.fireClickStartHz, freqTo: a.fireClickEndHz, dur: a.fireClickDuration, type: 'square', gain: audioLevelValue(a.fireClickGainByLevel, level, 0.065), attack: 0.001, priority: 3 }, sfxBus.combo, t + 0.006)
		tone({ freq: audioLevelValue(a.energyStartHzByLevel, level, 810), freqTo: audioLevelValue(a.energyEndHzByLevel, level, 440), dur: a.energyDuration, type: 'triangle', gain: audioLevelValue(a.energyGainByLevel, level, 0.055), attack: 0.003, priority: 2 }, sfxBus.combo, t + 0.018)
	}
	function playElectroEnd(d) {
		if (muted || hardPaused || !ensure()) { return }
		var a = ELECTRIC_AUDIO.electro, t = ctx.currentTime
		resume(); sfxPing(0.35); tone({ freq: a.endStartHz, freqTo: a.endEndHz, dur: a.endDuration, type: 'sine', gain: a.endGain, attack: 0.006, priority: 1 }, sfxBus.combo, t)
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
		sfxPing(2); tone({ freq: 180, freqTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.30, priority: 5 }, sfxBus.player); duck('major')
	})
	Bus.on('snake:wall', function () { throttled('snake:wall', 110, function () { sfxPing(0.25); filteredNoise({ dur: 0.065, gain: 0.045, filterType: 'lowpass', freq: 720, freqTo: 360, q: 0.7, priority: 2 }, sfxBus.player) }) })
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
	Bus.on('enemy:phase', function () { sfxPing(2); tone({ freq: 110, freqTo: 60, dur: 0.50, type: 'triangle', gain: 0.26, priority: 5 }, sfxBus.boss); duck('major') })
	Bus.on('skill:offer', function () { sfxPing(1.2); chooseDuckMul = MIX.chooseDuckMul == null ? 0.50 : MIX.chooseDuckMul; applyBgmGain(false); playUiCue([520, 660, 880], 'sine', 0.14, 0.08) })
	Bus.on('skill:gained', function (d) { d = d || {}; chooseDuckMul = 1; applyBgmGain(false); playSkillCue(d.id, d.level); duck('major') })
	Bus.on('combo:found', function (d) { sfxPing(1.8); playComboCue(d && d.id) })
	Bus.on('wave:boss_warn', function () { sfxPing(2); tone({ freq: 92, freqTo: 46, dur: 0.20, type: 'triangle', gain: 0.13, attack: 0.003, priority: 4 }, sfxBus.boss); duck('major') })
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

	// ================= Golden-Master Single-Source BGM =================
	// Five clean loops only. No musical transition assets and no Boss-warning BGM.
	// Stage changes are phase-locked to the current 4-bar cycle; gameplay owns all durations.
	// Boss warning is SFX-only; Boss Loop runs until boss:defeated.
	var BGM_ASSET = {
		protection: 'assets/audio/bgm/golden_modular/bgm_protection_loop.wav',
		growth: 'assets/audio/bgm/golden_modular/bgm_growth_loop.wav',
		mowing: 'assets/audio/bgm/golden_modular/bgm_mowing_loop.wav',
		climax: 'assets/audio/bgm/golden_modular/bgm_climax_loop.wav',
		boss: 'assets/audio/bgm/golden_modular/bgm_boss_loop.wav'
	}
	var MUSIC_STATE_LOOP_KEY = { protection: 'protection', growth: 'growth', mowing: 'mowing', climax: 'climax', boss: 'boss' }
	var MUSIC_STATE_BPM = { protection: 88, growth: 124, mowing: 124, climax: 124, boss: 136 }
	var MUSIC_STATE_HEAT = { protection: 0.00, growth: 0.78, mowing: 1.50, climax: 2.22, boss: 2.90 }
	var MUSIC_LOOP_SEC = {
		protection: 16 * 60 / 88,
		growth: 16 * 60 / 124,
		mowing: 16 * 60 / 124,
		climax: 16 * 60 / 124,
		boss: 16 * 60 / 136
	}
	var MUSIC_STATE_ALIAS = {
		protection: 'protection', protect: 'protection', rookie: 'protection', intro: 'protection',
		growth: 'growth', grow: 'growth',
		mowing: 'mowing', mow: 'mowing', combat: 'mowing', battle: 'mowing', farm: 'mowing',
		climax: 'climax', high: 'climax', peak: 'climax',
		bosswarning: 'boss', bosswarn: 'boss', warning: 'boss',
		boss: 'boss'
	}

	function createBgmMedia(src) {
		var a = null
		if (global.document && global.document.createElement) { a = global.document.createElement('audio') }
		else if (global.Audio) { try { a = new global.Audio() } catch (_) {} }
		if (!a) { return null }
		a.preload = 'auto'; a.src = src; a.loop = false; a.volume = 0
		try { a.playsInline = true; a.load() } catch (_) {}
		return a
	}
	function ensureBgmMedia() {
		if (bgmMedia.protection) { return true }
		for (var key in BGM_ASSET) {
			if (!Object.prototype.hasOwnProperty.call(BGM_ASSET, key)) { continue }
			var media = createBgmMedia(BGM_ASSET[key]); if (!media) { return false }
			bgmMedia[key] = media
		}
		return true
	}
	function silenceInactiveBgmMedia(keep) {
		for (var key in bgmMedia) {
			if (!Object.prototype.hasOwnProperty.call(bgmMedia, key)) { continue }
			var media = bgmMedia[key]
			if (!media || media === keep) { continue }
			try {
				media.volume = 0
				media.onended = null
				if (!media.paused) { media.pause() }
			} catch (_) {}
		}
	}
	function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
	function applyBgmGain(immediate) {
		var v = (muted ? 0 : MASTER_GAIN * AUDIO.bgmVolume * pauseMul * eventDuckMul * densityDuckMul * chooseDuckMul * pressureBgmMul)
		v = clamp(v, 0, 1)
		for (var key in bgmMedia) {
			if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
			bgmMedia[key].volume = bgmMedia[key] === bgmActive ? v : 0
		}
	}
	function applySfxGain(immediate) {
		if (!sfxGain || !ctx) { return }
		var t = ctx.currentTime, g = sfxGain.gain, v = AUDIO.sfxVolume * sfxPauseMul; g.cancelScheduledValues(t)
		if (immediate) { g.setValueAtTime(v, t) } else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + AUDIO_MIX.pauseRampSec) }
	}
	function normalizeMusicState(value) {
		if (value == null) { return '' }
		var raw = String(value).replace(/[\s_-]+/g, '').toLowerCase()
		return MUSIC_STATE_ALIAS[raw] || ''
	}
	function inferMusicStateFromName(name) {
		var s = String(name == null ? '' : name).toLowerCase()
		if (/boss|首领|老板/.test(s)) { return 'boss' }
		if (/高潮|climax|peak/.test(s)) { return 'climax' }
		if (/割草|战斗|combat|battle|mow|farm/.test(s)) { return 'mowing' }
		if (/成长|growth|grow/.test(s)) { return 'growth' }
		if (/保护|新手|rookie|protect|intro/.test(s)) { return 'protection' }
		return ''
	}
	function legacyMusicStateByStageId(stageId) {
		var id = Number(stageId)
		return id === 1 ? 'protection' : id === 2 ? 'growth' : id === 3 ? 'mowing' : id === 4 ? 'climax' : id === 5 ? 'boss' : ''
	}
	function resolveMusicState(d) {
		d = d || {}
		return normalizeMusicState(d.musicState || d.audioState) || inferMusicStateFromName(d.name) || legacyMusicStateByStageId(d.stageId) || currentMusicState || 'protection'
	}
	function initialMusicDescriptor() {
		var segs = CONFIG.STAGE && CONFIG.STAGE.segments
		var seg = segs && segs.length ? segs[0] : null
		return seg ? { stageId: seg.id, name: seg.name, musicState: seg.musicState || seg.audioState || '', isBoss: !!(seg.boss || seg.isBoss) } : { stageId: 1, musicState: 'protection' }
	}
	function applyMusicState(state, stageId) {
		var next = normalizeMusicState(state) || state
		if (!MUSIC_STATE_BPM[next]) { next = 'protection' }
		currentMusicState = next; curLayer = next
		var id = Number(stageId)
		if (isFinite(id)) { currentStage = id }
		battleHeat = MUSIC_STATE_HEAT[currentMusicState] == null ? 1 : MUSIC_STATE_HEAT[currentMusicState]
		stageBgmMul = 1
		targetStepDur = 60 / (MUSIC_STATE_BPM[currentMusicState] || 124) / 4
	}
	function safeMediaPlay(media, serial) {
		if (!media || hardPaused || !bgmWanted) { return }
		try {
			var p = media.play()
			bgmRunning = true
			if (p && typeof p.catch === 'function') {
				p.catch(function () {
					if (serial === bgmPlaySerial && bgmActive === media && bgmWanted && !hardPaused) { bgmRunning = false }
				})
			}
		} catch (_) {
			if (serial === bgmPlaySerial && bgmActive === media) { bgmRunning = false }
		}
	}
	function playBgmSegment(key, loop, startAtSec) {
		if (!ensureBgmMedia()) { return false }
		var next = bgmMedia[key]; if (!next) { return false }
		var serial = ++bgmPlaySerial
		silenceInactiveBgmMedia(next)
		if (bgmActive) {
			try { bgmActive.pause(); bgmActive.onended = null; bgmActive.volume = 0 } catch (_) {}
		}
		bgmActive = next; bgmActiveKey = key
		next.loop = !!loop; next.onended = null
		try { next.currentTime = Math.max(0, Number(startAtSec) || 0) } catch (_) {}
		applyBgmGain(true); safeMediaPlay(next, serial)
		Log.info('[bgm] segment=' + key + ' loop=' + (!!loop) + ' state=' + currentMusicState + ' owner=' + serial + ' at=' + (Number(startAtSec) || 0).toFixed(3))
		return true
	}
	function playMusicStateLoop(state, startAtSec) {
		var key = MUSIC_STATE_LOOP_KEY[state] || MUSIC_STATE_LOOP_KEY.protection
		return playBgmSegment(key, true, startAtSec)
	}
	function currentCyclePhase(state) {
		if (!bgmActive || !isFinite(bgmActive.currentTime)) { return 0 }
		var len = MUSIC_LOOP_SEC[state] || 0
		if (!(len > 0)) { return 0 }
		var pos = bgmActive.currentTime % len
		if (pos < 0) { pos += len }
		return pos / len
	}
	function phaseStartFor(state, phase) {
		var len = MUSIC_LOOP_SEC[state] || 0
		if (!(len > 0)) { return 0 }
		return clamp(Number(phase) || 0, 0, 0.999999) * len
	}
	function clearStageRequestTimer() {
		if (bgmStageRequestTimer) { clearTimeout(bgmStageRequestTimer); bgmStageRequestTimer = null }
	}
	function nextBeatDelayMs() {
		if (!bgmActive || !isFinite(bgmActive.currentTime)) { return 0 }
		var bpm = MUSIC_STATE_BPM[currentMusicState] || 124, beat = 60 / bpm, phase = bgmActive.currentTime % beat
		var wait = beat - phase
		if (wait < 0.055 || wait > beat - 0.025) { return 0 }
		return Math.round(wait * 1000)
	}
	function beginMusicState(targetState, stageId, sourceState) {
		var target = normalizeMusicState(targetState) || targetState
		if (!MUSIC_STATE_BPM[target]) { target = 'protection' }
		if (hardPaused || !bgmWanted) { pendingMusicState = target; pendingMusicStage = Number(stageId) || 0; return }
		var from = sourceState || currentMusicState
		var phase = currentCyclePhase(from)
		applyMusicState(target, stageId); pendingMusicState = ''; pendingMusicStage = 0
		playMusicStateLoop(target, phaseStartFor(target, phase))
	}
	function setMusicState(d) {
		d = d || {}
		var target = resolveMusicState(d), stageId = Number(d.stageId) || 0
		if (target === 'boss') {
			pendingMusicState = 'boss'; pendingMusicStage = stageId; clearStageRequestTimer()
			bgmStageRequestTimer = setTimeout(function () {
				bgmStageRequestTimer = null
				if (bossWarningActive || pendingMusicState !== 'boss') { return }
				beginMusicState('boss', stageId, currentMusicState)
			}, 30)
			return
		}
		if (target === currentMusicState && !pendingMusicState) {
			if (isFinite(stageId)) { currentStage = stageId }
			return
		}
		var source = currentMusicState
		pendingMusicState = target; pendingMusicStage = stageId; clearStageRequestTimer()
		if (!bgmRunning || hardPaused || !bgmActive) { applyMusicState(target, stageId); pendingMusicState = ''; pendingMusicStage = 0; return }
		var delay = nextBeatDelayMs()
		bgmStageRequestTimer = setTimeout(function () {
			bgmStageRequestTimer = null
			if (pendingMusicState !== target) { return }
			beginMusicState(target, stageId, source)
		}, delay)
		Log.info('[bgm] state requested ' + source + ' -> ' + target + ' quantizeMs=' + delay)
	}
	function finishBossWarning(stageId) {
		var from = currentMusicState, phase = currentCyclePhase(from)
		bossLoopAtGameTime = null; bossWarningActive = false; pendingMusicState = ''; pendingMusicStage = 0
		applyMusicState('boss', stageId || currentStage)
		playMusicStateLoop('boss', phaseStartFor('boss', phase))
	}
	function beginBossWarning(d) {
		clearStageRequestTimer(); pendingMusicState = 'boss'; bossWarningActive = true
		var gs = global.GS || {}, leadSec = Math.max(0, Number(d && d.leadSec) || 0), stageId = Number(d && d.stageId)
		if (!isFinite(stageId)) { stageId = currentStage }
		pendingMusicStage = stageId
		bossLoopAtGameTime = (Number(gs.timeSec) || 0) + leadSec
		// Important: warning is SFX-only. Keep the current single BGM loop alive.
		if (leadSec <= 0) { finishBossWarning(stageId) }
	}
	var duckReleaseAt = 0
	function duck(kind) {
		var major = kind === 'major', mul = major ? (MIX.majorDuckMul == null ? 0.60 : MIX.majorDuckMul) : (MIX.lightDuckMul == null ? 0.82 : MIX.lightDuckMul)
		var sec = major ? (MIX.majorDuckSec == null ? 0.28 : MIX.majorDuckSec) : (MIX.lightDuckSec == null ? 0.16 : MIX.lightDuckSec)
		var now = Date.now(), releaseAt = now + sec * 1000
		eventDuckMul = Math.min(eventDuckMul, mul); duckReleaseAt = Math.max(duckReleaseAt, releaseAt); applyBgmGain(false)
		if (duckTimer) { clearTimeout(duckTimer) }
		duckTimer = setTimeout(function () { duckTimer = null; duckReleaseAt = 0; eventDuckMul = 1; applyBgmGain(false) }, Math.max(1, duckReleaseAt - now))
	}
	function updateMusicState() {
		if (!ctx || !bgmRunning || (ctx.currentTime - musicSampleAt) < AUDIO_MIX.stateSampleSec) { return }
		musicSampleAt = ctx.currentTime
		var gs = global.GS || {}, enemy = Registry && Registry.get ? Registry.get('enemy') : null
		var stateBase = { protection: 0.12, growth: 0.32, mowing: 0.56, climax: 0.82, boss: 1.05 }
		var stageBase = stateBase[currentMusicState] == null ? 0.32 : stateBase[currentMusicState]
		var mobs = enemy && enemy.countMobs ? enemy.countMobs() : 0, chasing = enemy && enemy.chasingCount ? enemy.chasingCount() : 0, boss = !!(enemy && enemy.hasBoss && enemy.hasBoss())
		var coreMax = CONFIG.PLAYER && CONFIG.PLAYER.coreHp ? CONFIG.PLAYER.coreHp : 3
		var hpPressure = clamp(1 - ((gs.coreHp == null ? coreMax : gs.coreHp) / coreMax), 0, 1)
		pressureTarget = clamp(stageBase + clamp(mobs / AUDIO_MIX.pressureMobCap, 0, 1) * AUDIO_MIX.pressureMobWeight + clamp(chasing / AUDIO_MIX.pressureChaseCap, 0, 1) * AUDIO_MIX.pressureChaseWeight + hpPressure * AUDIO_MIX.pressureHpWeight + (boss ? AUDIO_MIX.pressureBossWeight : 0), 0, 3)
		var owned = gs.ownedSkills || {}, ownedCount = 0, totalLevel = 0, maxed = 0, key
		for (key in owned) { if (Object.prototype.hasOwnProperty.call(owned, key)) { var level = Number(owned[key]) || 0; if (level > 0) { ownedCount++; totalLevel += Math.min(5, level); if (level >= 5) { maxed++ } } } }
		var comboCount = (gs.comboHighlights && gs.comboHighlights.length) || 0, streak = clamp((gs.killStreak || 0) / AUDIO_MIX.buildStreakCap, 0, 1)
		buildTarget = clamp(ownedCount * AUDIO_MIX.buildSkillWeight + totalLevel * AUDIO_MIX.buildLevelWeight + maxed * AUDIO_MIX.buildMaxedWeight + comboCount * AUDIO_MIX.buildComboWeight + streak * AUDIO_MIX.buildStreakWeight, 0, 3)
		pressureLevel += (pressureTarget - pressureLevel) * AUDIO_MIX.stateLerp; buildLevel += (buildTarget - buildLevel) * AUDIO_MIX.stateLerp
		var pressureStart = MIX.bgmPressureStart == null ? 1.20 : MIX.bgmPressureStart, pressureEnd = MIX.bgmPressureEnd == null ? 2.80 : MIX.bgmPressureEnd
		var pressureRatio = clamp((pressureLevel - pressureStart) / Math.max(0.01, pressureEnd - pressureStart), 0, 1)
		pressureBgmMul = 1 - pressureRatio * (1 - (MIX.bgmPressureFloor == null ? 0.92 : MIX.bgmPressureFloor))
		if (Math.abs(pressureBgmMul - lastPressureBgmMul) >= 0.01) { lastPressureBgmMul = pressureBgmMul; applyBgmGain(false) }
	}
	function _bgmTick() {
		if (!bgmRunning || hardPaused) { return }
		updateMusicState()
		silenceInactiveBgmMedia(bgmActive)
		if (bossWarningActive && bossLoopAtGameTime != null) {
			var gs = global.GS || {}
			if ((Number(gs.timeSec) || 0) >= bossLoopAtGameTime) { finishBossWarning(currentStage) }
		}
	}
	function startBgm() {
		bgmWanted = true
		if (hardPaused || !ensureBgmMedia()) { return }
		if (!bgmActive) { playMusicStateLoop(currentMusicState, 0) }
		else { silenceInactiveBgmMedia(bgmActive); applyBgmGain(true); safeMediaPlay(bgmActive, bgmPlaySerial) }
		if (!bgmTimer) { bgmTimer = setInterval(_bgmTick, 100) }
		bgmTransportSerial++
		if (pendingMusicState && pendingMusicState !== currentMusicState && !bossWarningActive) { setMusicState({ stageId: pendingMusicStage, musicState: pendingMusicState }) }
	}
	function pauseBgm() {
		clearStageRequestTimer(); bgmRunning = false
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
		if (bgmActive) { try { bgmActive.pause() } catch (_) {} }
	}
	function stopBgm() {
		bgmLifecycleToken++; bgmPlaySerial++; bgmWanted = false; bgmRunning = false; clearStageRequestTimer(); bossLoopAtGameTime = null; bossWarningActive = false; pendingMusicState = ''
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
		for (var key in bgmMedia) {
			if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
			try { bgmMedia[key].pause(); bgmMedia[key].onended = null; bgmMedia[key].currentTime = 0; bgmMedia[key].volume = 0 } catch (_) {}
		}
		bgmActive = null; bgmActiveKey = ''
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
		var initialMusic = initialMusicDescriptor(), initialState = resolveMusicState(initialMusic)
		densityOn = false; sfxCount = 0; sfxWinStart = 0; _lastAt = {}; electricGateAt.lightning = -Infinity; electricGateAt.electro = -Infinity; currentStage = Number(initialMusic.stageId) || 1; pendingMusicStage = 0; currentMusicState = initialState; pendingMusicState = ''; curLayer = initialState; battleHeat = MUSIC_STATE_HEAT[initialState] == null ? 0 : MUSIC_STATE_HEAT[initialState]; stageBgmMul = 1; stageTransitionPending = 0; bossWarningActive = false; bossLoopAtGameTime = null
		pressureLevel = 0; pressureTarget = 0; buildLevel = 0; buildTarget = 0; pressureBgmMul = 1; lastPressureBgmMul = 1; musicSampleAt = 0; runCount++
		if (ensure()) { applySfxGain(true); applyMusicState(initialState, currentStage) }
		startBgm()
		resume(function () { if (!skipStartCue) { playStartCue(runCount > 1) } })
	})
	Bus.on('wave:stage', function (d) {
		if (!bgmRunning) { startBgm() }
		setMusicState(d)
	})
	Bus.on('wave:boss_warn', function (d) { if (!bgmRunning) { startBgm() }; beginBossWarning(d) })
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
			hardPaused = true; clearAudioTimers(); stopVoices(uiNodes); pauseBgm(); stopVoices(sfxNodes); pauseMul = 0; sfxPauseMul = 0; applyBgmGain(false); applySfxGain(false)
		} else {
			hardPaused = false; pauseMul = 1; sfxPauseMul = 1; applyBgmGain(false); applySfxGain(false); startBgm(); resume(function () { playPauseCue() })
		}
	})

	function voiceSnapshot() {
		var out = { totalSfx: sfxNodes.length, ui: uiNodes.length, music: bgmNodes.length, byFamily: {} }
		for (var i = 0; i < sfxNodes.length; i++) { var f = sfxNodes[i].family || 'unknown'; out.byFamily[f] = (out.byFamily[f] || 0) + 1 }
		return out
	}
	var Audio = {
		setMuted: function (m) { muted = !!m; if (master) { master.gain.value = muted ? 0 : MASTER_GAIN }; applyBgmGain(true) },
		isMuted: function () { return muted },
		unlock: function () { ensure(); _kickIos(); resume(function () { _kickIos(); if (bgmWanted && !bgmRunning) { startBgm() } }); return !!(ctx && ctx.state === 'running') },
		isRunning: function () { return !!(ctx && ctx.state === 'running') },
		registerSample: registerSample,
		playSample: playSample,
		debugState: function () {
			var mediaPlaying = [], mediaAudible = []
			for (var key in bgmMedia) {
				if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
				var media = bgmMedia[key]
				if (!media.paused) { mediaPlaying.push(key) }
				if (!media.paused && media.volume > 0.0001) { mediaAudible.push(key) }
			}
			return { context: ctx ? ctx.state : 'none', bgmRunning: bgmRunning, bgmWanted: bgmWanted, transport: bgmTransportSerial, owner: bgmPlaySerial, stage: currentStage, musicState: currentMusicState, pendingMusicState: pendingMusicState, pendingStage: pendingMusicStage, bossWarningActive: bossWarningActive, layer: curLayer, mediaSegment: bgmActiveKey, mediaPlaying: mediaPlaying, mediaAudible: mediaAudible, bpm: MUSIC_STATE_BPM[currentMusicState] || 124, stageGain: stageBgmMul, heat: battleHeat, pressure: pressureLevel, build: buildLevel, voices: voiceSnapshot() }
		}
	}
	Registry.register('audio', Audio)
	Log.info('audio 就绪：Golden Master 单源相位锁定 BGM + 可选阶段/Boss + Voice Budget')

})(typeof window !== 'undefined' ? window : this)
