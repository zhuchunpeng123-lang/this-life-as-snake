/*
 * AUDIO CHANGE CONTRACT
 * Before changing BGM, SFX, UI feedback, skill/combo sound, threat cues, voice budgets or ducking,
 * read: docs/AUDIO_SYSTEM_SPEC.md and docs/AUDIO_EVENT_MATRIX.md
 * Locked baseline: AUDIO-FINAL-1.1 (2026-08-08).
 */
;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = (CONFIG && CONFIG.AUDIO) || {}
	// AUDIO-FINAL-1.0 ownership rule:
	// gameplay CONFIG owns only user-facing master/BGM/SFX/UI volume + enabled state.
	// SFX mix/voice/density tuning is local to this module so gameplay/balance edits never collide with audio patches.
	var MIX = {
		maxSfxVoices: 16, maxUiVoices: 4,
		voiceBudget: { skill: 6, combo: 5, player: 2, impact: 1, death: 2, boss: 3, threat: 3, ui: 3 },
		skillBusGain: 0.98, comboBusGain: 1.02, playerBusGain: 1.00, impactBusGain: 0.36,
		deathBusGain: 0.52, bossBusGain: 0.96, threatBusGain: 1.00,
		lightDuckMul: 0.88, lightDuckSec: 0.14, majorDuckMul: 0.68, majorDuckSec: 0.24,
		chooseDuckMul: 0.56, pauseRampSec: 0.05, deathSilenceSec: 0.10,
		startHandoffSec: 0.18,
		limiterThresholdDb: -7, limiterKneeDb: 8, limiterRatio: 3.5, limiterAttackSec: 0.002, limiterReleaseSec: 0.14,
		bgmPressureStart: 1.35, bgmPressureEnd: 2.90, bgmPressureFloor: 0.94
	}
	var SFXCFG = {
		densityWindowMs: 220, densitySoft: 7, densityHard: 11,
		wallCooldownMs: 320, fireCooldownMs: 360, shieldCooldownMs: 280, genericHitCooldownMs: 120,
		deathClusterMs: 70, steamCooldownMs: 180,
		chargerWarnCooldownMs: 180, chargerChargeCooldownMs: 150,
		bossAttackWarnCooldownMs: 220, bossAttackFireCooldownMs: 180
	}
	var MASTER_GAIN = AUDIO.masterVolume == null ? 0.72 : AUDIO.masterVolume
	var UI_VOLUME = AUDIO.uiVolume == null ? 0.68 : AUDIO.uiVolume

	var ctx = null, master = null, limiter = null, sfxGain = null, uiGain = null, muted = AUDIO.enabled === false
	var sfxBus = { skill: null, combo: null, player: null, impact: null, death: null, boss: null, threat: null }

	// BGM state (single-owner media transport; BGM itself is frozen in this SFX pass).
	var bgmRunning = false, bgmTimer = null, bgmWanted = false
	var bgmMedia = {}, bgmActive = null, bgmActiveKey = '', bgmStageRequestTimer = null, bossLoopAtGameTime = null
	var currentMusicState = 'protection', pendingMusicState = '', bossWarningActive = false
	var bgmLifecycleToken = 0, bgmTransportSerial = 0, bgmPlaySerial = 0
	var bgmNodes = [], sfxNodes = [], uiNodes = []
	var sfxPauseMul = 1, hardPaused = false, duckTimer = null, musicSampleAt = 0, pressureLevel = 0, pressureTarget = 0, buildLevel = 0, buildTarget = 0
	var pressureBgmMul = 1, lastPressureBgmMul = 1
	var runCount = 0, suppressStartCue = false

	// BGM pressure model: performance/mix only; never changes gameplay.
	var AUDIO_MIX = {
		stateSampleSec: 0.25, stateLerp: 0.18, pressureMobCap: 12, pressureChaseCap: 4,
		pressureHpWeight: 0.55, pressureMobWeight: 0.75, pressureChaseWeight: 0.65, pressureBossWeight: 0.90,
		buildSkillWeight: 0.35, buildLevelWeight: 0.06, buildMaxedWeight: 0.25, buildComboWeight: 0.35,
		buildStreakCap: 8, buildStreakWeight: 0.20,
		pauseRampSec: MIX.pauseRampSec == null ? 0.05 : MIX.pauseRampSec
	}
	var currentStage = 1, pendingMusicStage = 0, targetStepDur = 60 / 88 / 4
	var curLayer = 'protection', battleHeat = 0, stageBgmMul = 1, stageTransitionPending = 0
	var pauseMul = 1, eventDuckMul = 1, densityDuckMul = 1, chooseDuckMul = 1
	var startHandoffTimer = null, startHandoffGain = 1

	// SFX density does NOT pump BGM. It only decides which low-value events may consume voices.
	var densityScore = 0, densityWinStart = 0
	var densityOn = false, densityTimer = null, sfxCount = 0, sfxWinStart = 0 // compatibility with old debug/reset names; always neutral for BGM.
	function nowMs() { return (global.performance && global.performance.now) ? global.performance.now() : Date.now() }
	function resetDensity() { densityScore = 0; densityWinStart = 0; densityOn = false; densityDuckMul = 1; sfxCount = 0; sfxWinStart = 0 }
	function admitByDensity(priority, weight) {
		var now = nowMs(), win = SFXCFG.densityWindowMs || 220
		if (!densityWinStart || now - densityWinStart > win) { densityWinStart = now; densityScore = 0 }
		var before = densityScore; densityScore += weight == null ? 1 : weight
		if (priority >= 3) { return true }
		if (priority === 2) { return before < (SFXCFG.densityHard == null ? 11 : SFXCFG.densityHard) }
		return before < (SFXCFG.densitySoft == null ? 7 : SFXCFG.densitySoft)
	}

	function ensure() {
		if (ctx) { return true }
		var AC = global.AudioContext || global.webkitAudioContext
		if (!AC) { return false }
		ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER_GAIN
		if (typeof ctx.createDynamicsCompressor === 'function') {
			limiter = ctx.createDynamicsCompressor()
			limiter.threshold.value = MIX.limiterThresholdDb == null ? -7 : MIX.limiterThresholdDb
			limiter.knee.value = MIX.limiterKneeDb == null ? 8 : MIX.limiterKneeDb
			limiter.ratio.value = MIX.limiterRatio == null ? 3.5 : MIX.limiterRatio
			limiter.attack.value = MIX.limiterAttackSec == null ? 0.002 : MIX.limiterAttackSec
			limiter.release.value = MIX.limiterReleaseSec == null ? 0.14 : MIX.limiterReleaseSec
			master.connect(limiter); limiter.connect(ctx.destination)
		} else { master.connect(ctx.destination) }
		sfxGain = ctx.createGain(); sfxGain.gain.value = AUDIO.sfxVolume == null ? 0.78 : AUDIO.sfxVolume; sfxGain.connect(master)
		uiGain = ctx.createGain(); uiGain.gain.value = UI_VOLUME; uiGain.connect(master)
		sfxBus.skill = ctx.createGain(); sfxBus.skill.gain.value = MIX.skillBusGain == null ? 0.86 : MIX.skillBusGain; sfxBus.skill.connect(sfxGain)
		sfxBus.combo = ctx.createGain(); sfxBus.combo.gain.value = MIX.comboBusGain == null ? 0.94 : MIX.comboBusGain; sfxBus.combo.connect(sfxGain)
		sfxBus.player = ctx.createGain(); sfxBus.player.gain.value = MIX.playerBusGain == null ? 1.00 : MIX.playerBusGain; sfxBus.player.connect(sfxGain)
		sfxBus.impact = ctx.createGain(); sfxBus.impact.gain.value = MIX.impactBusGain == null ? 0.48 : MIX.impactBusGain; sfxBus.impact.connect(sfxGain)
		sfxBus.death = ctx.createGain(); sfxBus.death.gain.value = MIX.deathBusGain == null ? 0.62 : MIX.deathBusGain; sfxBus.death.connect(sfxGain)
		sfxBus.boss = ctx.createGain(); sfxBus.boss.gain.value = MIX.bossBusGain == null ? 0.96 : MIX.bossBusGain; sfxBus.boss.connect(sfxGain)
		sfxBus.threat = ctx.createGain(); sfxBus.threat.gain.value = MIX.threatBusGain == null ? 1.00 : MIX.threatBusGain; sfxBus.threat.connect(sfxGain)
		buildSampleBank()
		return true
	}

	var VOICE_BUDGET = MIX.voiceBudget || {}
	function voiceCap(list) { return list === sfxNodes ? (MIX.maxSfxVoices || 12) : (list === uiNodes ? (MIX.maxUiVoices || 4) : Infinity) }
	function busFamily(out) {
		if (out === uiGain) { return 'ui' }
		for (var key in sfxBus) { if (sfxBus[key] === out) { return key } }
		return 'skill'
	}
	function familyCap(family) { var cap = VOICE_BUDGET[family]; return cap == null ? Infinity : Math.max(1, cap) }
	function pickVictim(list, priority, family) {
		var pick = -1, lowest = Infinity, oldest = Infinity
		for (var i = 0; i < list.length; i++) {
			var rec = list[i]; if (family && rec.family !== family) { continue }
			var p = rec.priority == null ? 2 : rec.priority, started = rec.startedAt || 0
			if (p < lowest || (p === lowest && started < oldest)) { lowest = p; oldest = started; pick = i }
		}
		// Identity rule: only a STRICTLY higher-priority event may cut an active voice.
		// Same-priority skills must finish their transient instead of chopping each other.
		if (pick < 0 || lowest >= priority) { return -1 }
		return pick
	}
	function evictVoice(list, pick) { if (pick < 0) { return false }; var old = list.splice(pick, 1)[0]; try { old.node.stop(ctx.currentTime) } catch (_) {}; return true }
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
		list.push(rec); node.onended = function () { var i = list.indexOf(rec); if (i >= 0) { list.splice(i, 1) } }; return node
	}
	function stopVoices(list) { if (!ctx) { list.length = 0; return }; var t = ctx.currentTime; while (list.length) { var rec = list.pop(); try { rec.node.stop(t) } catch (_) {} } }

	function resume(cb) {
		if (!ctx) { if (cb) { cb() }; return }
		if (ctx.state === 'running') { if (cb) { cb() }; return }
		if (ctx.state === 'closed' || typeof ctx.resume !== 'function') { return }
		try { var p = ctx.resume(); if (p && p.then) { p.then(function () { if (ctx && ctx.state === 'running' && cb) { cb() } }).catch(function () {}) } else if (ctx.state === 'running' && cb) { cb() } } catch (_) {}
	}
	var _kicked = false
	function _kickIos() {
		if (!ctx || _kicked) { return }
		try { var o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.0001; o.frequency.value = 440; o.connect(g); g.connect(ctx.destination); var t = ctx.currentTime || 0; o.start(0); o.stop(t + 0.02); _kicked = true } catch (_) {}
	}

	// ---------------- Deterministic in-memory Sample Bank ----------------
	// All runtime SFX below are AudioBufferSourceNode voices: internal layers are pre-rendered once.
	var sampleBank = {}, synthSeed = 0x51a7f00d
	function rngFor(salt) { var s = (synthSeed ^ salt) >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }
	function wave(type, ph) { var sn = Math.sin(ph); if (type === 'triangle') { return (2 / Math.PI) * Math.asin(sn) }; if (type === 'softsquare') { return Math.tanh(2.2 * sn) }; if (type === 'softsaw') { var x = ((ph / (2 * Math.PI)) % 1 + 1) % 1; return Math.tanh(1.8 * (2 * x - 1)) }; return sn }
	function envPerc(u, attack, power) { var a = attack <= 0 ? 1 : Math.min(1, u / attack); return a * Math.pow(Math.max(0, 1 - u), power == null ? 2 : power) }
	function addOsc(data, sr, start, dur, f0, f1, amp, type, attack, power) {
		var i0 = Math.max(0, Math.floor(start * sr)), n = Math.max(1, Math.floor(dur * sr)), phase = 0, ratio = f0 > 0 && f1 > 0 ? f1 / f0 : 1
		for (var j = 0; j < n && i0 + j < data.length; j++) { var u = j / n, f = f0 * Math.pow(ratio, u); phase += 2 * Math.PI * f / sr; data[i0 + j] += wave(type || 'sine', phase) * amp * envPerc(u, attack == null ? 0.03 : attack, power) }
	}
	function addNoise(data, sr, start, dur, amp, lowHz, highHz, attack, power, salt) {
		var i0 = Math.max(0, Math.floor(start * sr)), n = Math.max(1, Math.floor(dur * sr)), rnd = rngFor(salt || 1), lpHi = 0, lpLo = 0
		var ahi = Math.min(1, 2 * Math.PI * Math.max(80, highHz || 3000) / sr), alo = Math.min(1, 2 * Math.PI * Math.max(20, lowHz || 0) / sr)
		for (var j = 0; j < n && i0 + j < data.length; j++) {
			var x = rnd() * 2 - 1; lpHi += ahi * (x - lpHi); lpLo += alo * (x - lpLo)
			var y = lowHz > 0 ? (lpHi - lpLo) : lpHi, u = j / n
			data[i0 + j] += y * amp * envPerc(u, attack == null ? 0.015 : attack, power == null ? 2.5 : power)
		}
	}
	function normalizeSample(data, target) { var peak = 0; for (var i = 0; i < data.length; i++) { var a = Math.abs(data[i]); if (a > peak) { peak = a } }; var mul = peak > 0 ? (target || 0.86) / peak : 1; for (var j = 0; j < data.length; j++) { data[j] = Math.max(-0.98, Math.min(0.98, data[j] * mul)) } }
	function makeSample(id, dur, draw, target) { var sr = ctx.sampleRate, n = Math.max(32, Math.floor(dur * sr)), data = new Float32Array(n); draw(data, sr); normalizeSample(data, target || 0.86); var b = ctx.createBuffer(1, n, sr); if (b.copyToChannel) { b.copyToChannel(data, 0) } else { b.getChannelData(0).set(data) }; sampleBank[id] = b }
	function noteSeq(data, sr, notes, gap, dur, amp, type, start) { start = start || 0; for (var i = 0; i < notes.length; i++) { addOsc(data, sr, start + i * gap, dur, notes[i], notes[i] * 1.02, amp, type || 'triangle', 0.04, 2.2) } }
	function dartBurst(data, sr, count, gap, start, gain) {
		// Projectile identity = air snap + hard edge. Avoid repeated low-mid descending glides ("croak").
		for (var i = 0; i < count; i++) {
			var at = (start || 0) + i * gap
			addNoise(data, sr, at, 0.036, 0.48 * gain, 1100, 4200, 0.004, 3.6, 1200 + i)
			addOsc(data, sr, at, 0.042, 2050 - i * 35, 1320 - i * 20, 0.34 * gain, 'softsquare', 0.004, 3.8)
			addOsc(data, sr, at + 0.004, 0.050, 650 - i * 10, 430 - i * 8, 0.13 * gain, 'triangle', 0.005, 4.0)
		}
	}
	function buildSampleBank() {
		if (sampleBank.__ready || !ctx) { return }
		// UI language: press / confirm / back / toggle / pause. Short, mid-band, non-piercing.
		makeSample('ui_press', 0.075, function(d,s){ addOsc(d,s,0,0.07,760,610,0.72,'triangle',0.03,2.8); addNoise(d,s,0,0.028,0.16,700,2200,0.01,3,1) })
		makeSample('ui_confirm', 0.16, function(d,s){ addOsc(d,s,0,0.09,520,640,0.56,'triangle',0.04,2.4); addOsc(d,s,0.052,0.10,720,820,0.48,'triangle',0.04,2.3) })
		makeSample('ui_back', 0.15, function(d,s){ addOsc(d,s,0,0.09,600,430,0.55,'triangle',0.035,2.5); addOsc(d,s,0.05,0.09,400,285,0.40,'triangle',0.035,2.6) })
		makeSample('ui_toggle', 0.12, function(d,s){ addNoise(d,s,0,0.025,0.20,600,2200,0.005,3,2); addOsc(d,s,0.01,0.10,480,690,0.52,'triangle',0.035,2.4) })
		makeSample('ui_pause_in', 0.16, function(d,s){ addOsc(d,s,0,0.14,455,305,0.60,'triangle',0.025,2.0); addNoise(d,s,0,0.045,0.12,250,1200,0.01,3,3) })
		makeSample('ui_pause_out', 0.16, function(d,s){ addOsc(d,s,0,0.14,340,545,0.58,'triangle',0.03,2.0); addNoise(d,s,0.02,0.04,0.10,400,1500,0.01,3,4) })
		makeSample('ui_start', 0.28, function(d,s){ noteSeq(d,s,[240,330,440],0.07,0.12,0.48,'triangle',0); addNoise(d,s,0.12,0.10,0.10,500,1800,0.03,2.5,5) })
		makeSample('ui_replay', 0.24, function(d,s){ noteSeq(d,s,[300,440,600],0.055,0.10,0.48,'triangle',0) })
		makeSample('ui_offer', 0.23, function(d,s){ noteSeq(d,s,[500,650,820],0.06,0.105,0.40,'sine',0); addNoise(d,s,0.05,0.14,0.08,900,2600,0.03,2.8,6) })
		makeSample('pickup_food', 0.08, function(d,s){ addOsc(d,s,0,0.075,720,920,0.62,'triangle',0.025,2.8) })
		makeSample('pickup_heal', 0.20, function(d,s){ addOsc(d,s,0,0.13,300,430,0.50,'triangle',0.04,2.2); addOsc(d,s,0.065,0.12,430,610,0.38,'sine',0.04,2.2) })

		// Player / threat: strong information, centered in phone-speaker band.
		makeSample('player_hurt', 0.23, function(d,s){ addNoise(d,s,0,0.11,0.35,180,1400,0.005,2.5,10); addOsc(d,s,0,0.21,250,85,0.75,'softsquare',0.015,1.8) })
		makeSample('player_critical', 0.30, function(d,s){ addNoise(d,s,0,0.13,0.38,180,1500,0.005,2.4,11); addOsc(d,s,0,0.24,230,72,0.78,'softsquare',0.012,1.7); addOsc(d,s,0.08,0.16,520,390,0.34,'triangle',0.03,2.0) })
		makeSample('wall_scrape', 0.10, function(d,s){ addNoise(d,s,0,0.095,0.52,220,1150,0.01,2.7,12); addOsc(d,s,0,0.08,340,220,0.18,'triangle',0.02,2.7) })
		makeSample('charger_warn', 0.28, function(d,s){ addOsc(d,s,0,0.25,320,650,0.62,'softsquare',0.04,1.6); addNoise(d,s,0.04,0.18,0.18,500,1800,0.03,2.1,13) })
		makeSample('charger_charge', 0.18, function(d,s){ addNoise(d,s,0,0.16,0.48,120,1200,0.01,2.1,14); addOsc(d,s,0,0.17,210,90,0.68,'triangle',0.015,2.0) })
		makeSample('boss_warn', 0.24, function(d,s){ addOsc(d,s,0,0.22,105,48,0.78,'triangle',0.015,1.9); addNoise(d,s,0.015,0.12,0.25,180,1000,0.01,2.5,15); addOsc(d,s,0.055,0.12,470,350,0.28,'triangle',0.03,2.0) })
		makeSample('boss_attack_warn', 0.22, function(d,s){ addOsc(d,s,0,0.19,360,560,0.62,'softsquare',0.025,1.7); addNoise(d,s,0.03,0.14,0.20,650,1800,0.02,2.0,16) })
		makeSample('boss_attack_fire', 0.20, function(d,s){ addOsc(d,s,0,0.18,175,68,0.82,'triangle',0.008,1.9); addNoise(d,s,0,0.14,0.48,90,1150,0.004,2.4,17) })
		makeSample('boss_phase', 0.48, function(d,s){ addOsc(d,s,0,0.38,125,55,0.72,'triangle',0.02,1.5); addNoise(d,s,0,0.24,0.35,120,1400,0.008,2.2,18); addOsc(d,s,0.12,0.32,380,680,0.34,'triangle',0.06,1.7) })

		// Core skill identities.
		makeSample('fire_contact', 0.18, function(d,s){ addNoise(d,s,0,0.17,0.58,280,1250,0.015,2.0,20); addOsc(d,s,0,0.15,230,150,0.30,'triangle',0.03,2.2) })
		makeSample('shield_contact', 0.10, function(d,s){ addOsc(d,s,0,0.09,720,410,0.58,'triangle',0.015,2.7); addOsc(d,s,0.01,0.07,1320,880,0.20,'sine',0.02,2.8) })
		makeSample('generic_hit', 0.085, function(d,s){ addNoise(d,s,0,0.055,0.40,220,1100,0.005,3,21); addOsc(d,s,0,0.075,300,170,0.34,'triangle',0.01,2.8) })
		makeSample('crit_hit', 0.13, function(d,s){ addNoise(d,s,0,0.075,0.45,260,1500,0.005,2.6,22); addOsc(d,s,0,0.115,390,125,0.56,'triangle',0.008,2.3) })
		makeSample('ice_throw', 0.14, function(d,s){ addNoise(d,s,0,0.11,0.30,800,2800,0.008,2.5,23); addOsc(d,s,0,0.125,1320,590,0.60,'sine',0.018,2.3) })
		makeSample('ice_bloom', 0.24, function(d,s){ addOsc(d,s,0,0.20,420,900,0.48,'sine',0.045,1.8); addNoise(d,s,0.02,0.20,0.30,700,2600,0.035,1.9,24); addOsc(d,s,0.08,0.13,920,1220,0.24,'triangle',0.035,2.0) })

		// Bolt = one projectile volley voice. Count changes micro-click density, not the main timbre.
		for (var bv = 1; bv <= 5; bv++) { (function(count){
			makeSample('bolt_' + count, 0.082 + count * 0.010, function(d,s){
				addNoise(d,s,0,0.050,0.50,1200,4300,0.004,3.4,25+count)
				addOsc(d,s,0,0.055,1880 + count*35,1120 + count*22,0.42,'softsquare',0.004,3.5)
				addOsc(d,s,0.006,0.060,610,420,0.12,'triangle',0.005,4.0)
				for (var q=1;q<count;q++) {
					var at=0.012*q
					addNoise(d,s,at,0.018,0.16,1500,4600,0.003,4.0,1250+count*10+q)
					addOsc(d,s,at,0.023,2450-q*55,1640-q*35,0.13,'softsquare',0.003,4.2)
				}
			}, 0.80)
		})(bv) }

		// Lightning restores the older game-skill DNA, pre-rendered into ONE voice:
		// crackle + hard snap + electric tail + level-dependent pulses.
		for (var lv = 1; lv <= 5; lv++) { (function(level){
			var crackHz=[2350,2550,2750,3000,3300][level-1]
			var snap0=[1080,1140,1210,1290,1380][level-1], snap1=[610,640,680,730,790][level-1]
			var pulses=[1,1,2,2,3][level-1]
			makeSample('lightning_' + level, 0.155 + pulses*0.030, function(d,s){
				addNoise(d,s,0,0.085+level*0.010,0.72,1200,crackHz,0.0025,2.9,30+level)
				addOsc(d,s,0,0.076+level*0.006,snap0,snap1,0.72,'softsaw',0.003,3.0)
				addOsc(d,s,0.010,0.105+level*0.008,920+level*60,1380+level*100,0.26,'triangle',0.006,2.5)
				for (var p=0;p<pulses;p++) {
					addOsc(d,s,0.020+p*0.029,0.035,1760-p*130,1120-p*80,0.30,'softsquare',0.0025,3.4)
					addNoise(d,s,0.020+p*0.029,0.025,0.16,1350,3900,0.002,4.0,300+level*10+p)
				}
			}, 0.90)
		})(lv) }

		// Combo identities = parent-skill DNA with phone-readable mid-band body.
		makeSample('steam_blast', 0.29, function(d,s){
			addOsc(d,s,0,0.205,390,145,0.58,'triangle',0.006,2.0)
			addNoise(d,s,0,0.235,0.76,680,3200,0.005,1.9,40)
			addOsc(d,s,0.045,0.175,1180,2450,0.42,'sine',0.016,2.0)
			addNoise(d,s,0.075,0.17,0.32,1500,5000,0.016,2.1,401)
		}, 0.92)

		makeSample('electro_deploy', 0.20, function(d,s){
			addOsc(d,s,0,0.18,260,620,0.52,'sine',0.035,1.8)
			addOsc(d,s,0.015,0.15,430,330,0.30,'triangle',0.025,2.2)
			addNoise(d,s,0.02,0.07,0.16,700,2400,0.006,3.0,402)
		})
		makeSample('electro_fire', 0.205, function(d,s){
			// "砰": low body + phone-speaker mid punch + short electrical edge.
			addOsc(d,s,0,0.175,340,118,0.78,'triangle',0.004,2.1)
			addNoise(d,s,0,0.125,0.62,180,1900,0.003,2.7,41)
			addOsc(d,s,0.004,0.060,760,330,0.48,'softsquare',0.0025,3.5)
			addOsc(d,s,0.024,0.105,930,500,0.26,'triangle',0.008,2.8)
		}, 0.92)
		makeSample('electro_end', 0.14, function(d,s){ addOsc(d,s,0,0.13,440,180,0.44,'sine',0.025,2.4) })

		// Burning Barrage: the whole 3-dart volley is ONE buffer voice.
		for (var bl=1; bl<=5; bl++) { (function(level){
			makeSample('burn_barrage_' + level, 0.27, function(d,s){
				for (var q=0;q<3;q++) {
					var at=q*0.045
					dartBurst(d,s,1,0,at,0.86+level*0.025)
					addOsc(d,s,at+0.008,0.060,560+level*18,270+level*8,0.22,'triangle',0.004,3.2)
				}
				addNoise(d,s,0.065,0.18,0.28+level*0.012,500,1900,0.015,2.2,420+level)
				addOsc(d,s,0.075,0.15,900+level*25,620+level*18,0.16,'softsquare',0.010,2.8)
			}, 0.88)
		})(bl) }

		makeSample('burn_dart', 0.11, function(d,s){ dartBurst(d,s,1,0,0,0.88); addNoise(d,s,0.030,0.065,0.18,700,1900,0.012,2.8,42) })

		// Progress/reward identities.
		makeSample('gain_fire', 0.30, function(d,s){ addNoise(d,s,0,0.18,0.38,300,1300,0.02,2.0,50); noteSeq(d,s,[260,390,520],0.06,0.12,0.40,'triangle',0.04) })
		makeSample('gain_ice', 0.30, function(d,s){ addOsc(d,s,0,0.22,460,850,0.35,'sine',0.05,1.8); noteSeq(d,s,[620,820,1040],0.055,0.10,0.33,'sine',0.05) })
		makeSample('gain_bolt', 0.27, function(d,s){ dartBurst(d,s,3,0.035,0.02,0.68); addOsc(d,s,0.10,0.14,480,760,0.28,'triangle',0.04,2.0) })
		makeSample('gain_shield', 0.30, function(d,s){ noteSeq(d,s,[420,620,840],0.06,0.13,0.38,'triangle',0.02); addOsc(d,s,0.04,0.20,240,340,0.20,'sine',0.06,1.8) })
		makeSample('gain_lightning', 0.31, function(d,s){ addNoise(d,s,0,0.12,0.40,900,2800,0.005,2.4,51); addOsc(d,s,0,0.12,1100,650,0.44,'softsquare',0.01,2.5); noteSeq(d,s,[520,760,980],0.05,0.11,0.30,'triangle',0.10) })
		makeSample('found_steamExplosion', 0.38, function(d,s){ addOsc(d,s,0,0.20,190,80,0.66,'triangle',0.01,1.9); addNoise(d,s,0.03,0.25,0.38,500,1600,0.02,1.8,52); addOsc(d,s,0.14,0.18,720,1100,0.24,'sine',0.04,2.0) })
		makeSample('found_electroTurret', 0.38, function(d,s){ addOsc(d,s,0,0.17,220,560,0.38,'sine',0.04,1.9); addOsc(d,s,0.13,0.18,180,68,0.68,'triangle',0.01,2.0); addNoise(d,s,0.13,0.12,0.34,120,1100,0.005,2.7,53) })
		makeSample('found_burningBarrage', 0.34, function(d,s){ dartBurst(d,s,3,0.055,0.03,0.76); addNoise(d,s,0.10,0.20,0.25,380,1300,0.03,2.0,54) })

		// Enemy death/result. One event = one buffer voice even when internally layered.
		makeSample('death_small', 0.13, function(d,s){ addNoise(d,s,0,0.11,0.50,110,820,0.005,2.5,60); addOsc(d,s,0,0.12,250,120,0.36,'triangle',0.008,2.5) })
		makeSample('death_charger', 0.16, function(d,s){ addNoise(d,s,0,0.13,0.50,100,760,0.005,2.4,61); addOsc(d,s,0,0.15,205,90,0.48,'triangle',0.008,2.3) })
		makeSample('death_elite', 0.22, function(d,s){ addNoise(d,s,0,0.17,0.54,80,700,0.004,2.2,62); addOsc(d,s,0,0.21,150,58,0.68,'triangle',0.008,2.0) })
		makeSample('player_death', 0.72, function(d,s){ addNoise(d,s,0,0.24,0.36,120,1200,0.008,2.1,63); addOsc(d,s,0,0.62,285,82,0.60,'softsquare',0.02,1.5); noteSeq(d,s,[260,190,125],0.12,0.20,0.23,'triangle',0.08) })
		makeSample('boss_defeat', 0.95, function(d,s){ addOsc(d,s,0,0.22,105,42,0.80,'triangle',0.006,1.8); addNoise(d,s,0,0.18,0.48,80,1200,0.004,2.2,64); noteSeq(d,s,[220,330,440,554],0.10,0.22,0.32,'triangle',0.24); addOsc(d,s,0.48,0.40,370,555,0.16,'sine',0.08,1.5) })
		sampleBank.__ready = true
	}

	function registerSample(id, buffer) { if (!id || !buffer || typeof buffer.duration !== 'number') { return false }; sampleBank[id] = buffer; return true }
	var playbackSerial = 0
	function playBank(id, opt) {
		opt = opt || {}
		if (muted || hardPaused || !ensure() || !sampleBank[id]) { return false }
		var family = opt.family || 'skill', out = family === 'ui' ? uiGain : (sfxBus[family] || sfxBus.skill)
		var list = out === uiGain ? uiNodes : sfxNodes, priority = opt.priority == null ? 2 : opt.priority
		if (out !== uiGain && !admitByDensity(priority, opt.weight == null ? 1 : opt.weight)) { return false }
		if (!reserveVoice(list, priority, busFamily(out))) { return false }
		resume()
		var src = ctx.createBufferSource(), g = ctx.createGain(), when = opt.when == null ? ctx.currentTime : Math.max(ctx.currentTime, opt.when)
		src.buffer = sampleBank[id]
		var rate = opt.rate == null ? 1 : opt.rate
		if (opt.vary) { playbackSerial++; rate *= 1 + (((playbackSerial * 17) % 7) - 3) * 0.006 }
		src.playbackRate.value = Math.max(0.82, Math.min(1.22, rate)); g.gain.value = opt.gain == null ? 0.55 : opt.gain
		src.connect(g); g.connect(out); trackVoice(list, src, priority, busFamily(out)); src.start(when); return true
	}
	function playSample(id, opt) { return playBank(id, opt) }

	var _lastAt = {}
	function throttled(key, ms, fn) { var now = nowMs(); if (_lastAt[key] != null && now - _lastAt[key] < ms) { return }; _lastAt[key] = now; fn() }
	function ownedLevel(id) { var gs = global.GS || {}, owned = gs.ownedSkills || {}; return Math.max(1, Math.min(5, owned[id] || 1)) }

	// Death aggregation: many kills become one collapse, not a rhythm machine.
	var deathCluster = { count: 0, kind: '' }, deathTimer = null
	function deathRank(kind) { return kind === 'elite' ? 4 : (kind === 'charger' ? 3 : (kind === 'chaser' ? 2 : 1)) }
	function clearDeathCluster() { if (deathTimer) { clearTimeout(deathTimer); deathTimer = null }; deathCluster.count = 0; deathCluster.kind = '' }
	function queueEnemyDeath(d) {
		d = d || {}; if (d.kind === 'boss') { return }
		deathCluster.count = Math.min(8, deathCluster.count + 1)
		if (!deathCluster.kind || deathRank(d.kind) > deathRank(deathCluster.kind)) { deathCluster.kind = d.kind || 'wanderer' }
		if (!deathTimer) { deathTimer = setTimeout(flushEnemyDeath, SFXCFG.deathClusterMs || 70) }
	}
	function flushEnemyDeath() {
		deathTimer = null; if (!deathCluster.count) { return }
		var kind = deathCluster.kind, count = deathCluster.count, id = kind === 'elite' ? 'death_elite' : (kind === 'charger' ? 'death_charger' : 'death_small')
		var p = kind === 'elite' ? 3 : 2, gain = (kind === 'elite' ? 0.72 : 0.48) * (1 + Math.min(5, count - 1) * 0.045)
		playBank(id, { family: 'death', priority: p, gain: gain, rate: Math.max(0.88, 1 - Math.min(5, count - 1) * 0.012), weight: 0.8 + count * 0.22, vary: true })
		clearDeathCluster()
	}

	function playUiSemantic(d) {
		d = d || {}; if (!ensure()) { return }; var kind = d.kind || 'press', id = 'ui_' + kind
		if (kind === 'pause_in' || kind === 'pause_out') { id = 'ui_' + kind }
		else if (d.id === 'replay') { id = 'ui_replay'; suppressStartCue = true }
		if (!sampleBank[id]) { id = kind === 'confirm' ? 'ui_confirm' : (kind === 'back' ? 'ui_back' : (kind === 'toggle' ? 'ui_toggle' : 'ui_press')) }
		playBank(id, { family: 'ui', priority: 4, gain: kind === 'press' ? 0.38 : 0.48 })
	}
	function playSkillGain(d) { d = d || {}; var id = 'gain_' + (d.id || 'fire'); playBank(sampleBank[id] ? id : 'ui_confirm', { family: 'ui', priority: 4, gain: 0.58 }); duck('major') }
	function playComboFound(d) { d = d || {}; var id = 'found_' + d.id; if (!sampleBank[id]) { return }; playBank(id, { family: 'ui', priority: 5, gain: 0.68 }); duck('major') }
	function playStartCue(replay) { playBank(replay ? 'ui_replay' : 'ui_start', { family: 'ui', priority: 4, gain: 0.50 }) }
	function playPauseCue() { playUiSemantic({ kind: 'pause_out' }) }
	function playDeathCue() { var at = ctx ? ctx.currentTime + (MIX.deathSilenceSec == null ? 0.10 : MIX.deathSilenceSec) : null; playBank('player_death', { family: 'ui', priority: 5, gain: 0.72, when: at }) }
	function playBossDefeatCue() { playBank('boss_defeat', { family: 'ui', priority: 5, gain: 0.78 }) }

	// ---------------- Event ownership ----------------
	// P5: survival / must-react threat. P4: key outcome. P3: skill identity. P2/P1: expendable detail.
	Bus.on('ui:feedback', playUiSemantic)
	Bus.on('snake:hurt', function (d) { d = d || {}; var critical = Number(d.coreHp) <= 1; playBank(critical ? 'player_critical' : 'player_hurt', { family: 'player', priority: 5, gain: critical ? 0.84 : 0.76, weight: 2 }); duck('major') })
	Bus.on('snake:wall', function () { throttled('snake:wall', SFXCFG.wallCooldownMs || 320, function () { playBank('wall_scrape', { family: 'player', priority: 1, gain: 0.28, weight: 0.45, vary: true }) }) })
	Bus.on('enemy:charger_warn', function () { throttled('charger:warn', SFXCFG.chargerWarnCooldownMs || 180, function () { playBank('charger_warn', { family: 'threat', priority: 5, gain: 0.70, weight: 1.5 }); duck('light') }) })
	Bus.on('enemy:charger_charge', function () { throttled('charger:charge', SFXCFG.chargerChargeCooldownMs || 150, function () { playBank('charger_charge', { family: 'threat', priority: 4, gain: 0.66, weight: 1.2 }) }) })
	Bus.on('boss:attack_warn', function () { throttled('boss:attack_warn', SFXCFG.bossAttackWarnCooldownMs || 220, function () { playBank('boss_attack_warn', { family: 'threat', priority: 5, gain: 0.72, weight: 1.5 }); duck('light') }) })
	Bus.on('boss:attack_fire', function () { throttled('boss:attack_fire', SFXCFG.bossAttackFireCooldownMs || 180, function () { playBank('boss_attack_fire', { family: 'boss', priority: 4, gain: 0.76, weight: 1.3 }) }) })
	Bus.on('enemy:phase', function () { playBank('boss_phase', { family: 'boss', priority: 5, gain: 0.78, weight: 2 }); duck('major') })
	Bus.on('wave:boss_warn', function () { playBank('boss_warn', { family: 'threat', priority: 5, gain: 0.78, weight: 2 }); duck('major') })

	Bus.on('enemy:hit', function (d) {
		d = d || {}
		if (d.isDot && d.src === 'fire') { throttled('hit:fire', SFXCFG.fireCooldownMs || 360, function () { playBank('fire_contact', { family: 'skill', priority: 1, gain: 0.36, weight: 0.8, vary: true }) }); return }
		if (d.isDot && d.src === 'shield') { throttled('hit:shield', SFXCFG.shieldCooldownMs || 280, function () { playBank('shield_contact', { family: 'skill', priority: 2, gain: 0.40, weight: 0.7, vary: true }) }); return }
		if (d.isDot && d.src === 'burn') { return } // Burning Barrage projectile owns the audible identity; burn DOT is intentionally silent.
		if (d.src === 'bolt' || d.src === 'burning' || d.src === 'steam' || d.src === 'lightning' || d.src === 'electro') { return }
		throttled('hit:generic', SFXCFG.genericHitCooldownMs || 120, function () { playBank(d.crit ? 'crit_hit' : 'generic_hit', { family: 'impact', priority: d.crit ? 3 : 1, gain: d.crit ? 0.55 : 0.30, weight: d.crit ? 1.2 : 0.55, vary: !d.crit }) })
	})
	Bus.on('enemy:die', queueEnemyDeath)
	Bus.on('skill:offer', function () { chooseDuckMul = MIX.chooseDuckMul == null ? 0.56 : MIX.chooseDuckMul; applyBgmGain(false); playBank('ui_offer', { family: 'ui', priority: 4, gain: 0.52 }) })
	Bus.on('skill:gained', function (d) { chooseDuckMul = 1; applyBgmGain(false); playSkillGain(d) })
	Bus.on('combo:found', playComboFound)
	Bus.on('pickup:eat', function (d) { d = d || {}; if (d.kind === 'skill') { return }; if (d.kind === 'heal') { playBank('pickup_heal', { family: 'ui', priority: 3, gain: 0.50 }) } else { throttled('pickup:food', 90, function () { playBank('pickup_food', { family: 'ui', priority: 2, gain: 0.34 }) }) } })

	Bus.on('fx:bolt', function (d) { d = d || {}; if ((d.shotIndex || 0) !== 0) { return }; var count = Math.max(1, Math.min(5, Number(d.shotCount) || 1)), level = Math.max(1, Math.min(5, Number(d.level) || ownedLevel('bolt'))); playBank('bolt_' + count, { family: 'skill', priority: 2, gain: 0.38 + level * 0.018, rate: 0.99 + level * 0.006, weight: 0.85 }) })
	Bus.on('fx:ice_throw', function () { throttled('fx:ice_throw', 115, function () { playBank('ice_throw', { family: 'skill', priority: 3, gain: 0.46, weight: 1.0, vary: true }) }) })
	Bus.on('fx:ice_pool', function () { throttled('fx:ice_pool', 160, function () { playBank('ice_bloom', { family: 'skill', priority: 3, gain: 0.50, weight: 1.0, vary: true }) }) })
	Bus.on('fx:lightning', function (d) { d = d || {}; var meta = d.chain && d.chain.vfxMeta, level = Math.max(1, Math.min(5, Number(meta && meta.level) || ownedLevel('lightning'))); playBank('lightning_' + level, { family: 'skill', priority: 4, gain: 0.64 + level * 0.026, weight: 1.2 }) })
	Bus.on('fx:electroturretdeploy', function () { playBank('electro_deploy', { family: 'combo', priority: 4, gain: 0.58, weight: 1.0 }) })
	Bus.on('fx:electroturretfire', function (d) { d = d || {}; var level = Math.max(1, Math.min(5, Number(d.comboLevel) || 1)); playBank('electro_fire', { family: 'combo', priority: 5, gain: 0.70 + level * 0.020, rate: 1 - (level - 1) * 0.006, weight: 1.35 }) })
	Bus.on('fx:electroturretend', function () { playBank('electro_end', { family: 'combo', priority: 2, gain: 0.34, weight: 0.5 }) })
	Bus.on('fx:steamblast', function (d) { d = d || {}; throttled('fx:steamblast', SFXCFG.steamCooldownMs || 180, function () { var c = Math.max(1, Math.min(6, Number(d.hitCount) || 1)); playBank('steam_blast', { family: 'combo', priority: 5, gain: 0.68 + (c - 1) * 0.018, rate: 1 - (c - 1) * 0.004, weight: 1.45 }) }) })
	Bus.on('fx:burndart', function (d) { d = d || {}; if ((Number(d.shotIndex) || 0) !== 0) { return }; var level = Math.max(1, Math.min(5, Number(d.level) || 1)); playBank('burn_barrage_' + level, { family: 'combo', priority: 4, gain: 0.60 + level * 0.020, weight: 1.15 }) })
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
		var v = (muted ? 0 : MASTER_GAIN * (AUDIO.bgmVolume == null ? 0.37 : AUDIO.bgmVolume) * pauseMul * eventDuckMul * densityDuckMul * chooseDuckMul * pressureBgmMul * startHandoffGain)
		v = clamp(v, 0, 1)
		for (var key in bgmMedia) {
			if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
			bgmMedia[key].volume = bgmMedia[key] === bgmActive ? v : 0
		}
	}
	function applySfxGain(immediate) {
		if (!sfxGain || !ctx) { return }
		var t = ctx.currentTime, g = sfxGain.gain, v = (AUDIO.sfxVolume == null ? 0.78 : AUDIO.sfxVolume) * sfxPauseMul; g.cancelScheduledValues(t)
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
	function clearStartHandoff() {
		if (startHandoffTimer) { clearTimeout(startHandoffTimer); startHandoffTimer = null }
		startHandoffGain = 1
	}
	function beginStartHandoff() {
		clearStartHandoff(); startHandoffGain = 0
		var delayMs = Math.max(0, Math.round((MIX.startHandoffSec == null ? 0.18 : MIX.startHandoffSec) * 1000))
		if (!delayMs) { startHandoffGain = 1; return }
		startHandoffTimer = setTimeout(function () {
			startHandoffTimer = null; startHandoffGain = 1; applyBgmGain(true)
		}, delayMs)
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
		clearStageRequestTimer(); clearStartHandoff(); bgmRunning = false
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
		if (bgmActive) { try { bgmActive.pause() } catch (_) {} }
	}
	function stopBgm() {
		bgmLifecycleToken++; bgmPlaySerial++; bgmWanted = false; bgmRunning = false; clearStageRequestTimer(); clearStartHandoff(); bossLoopAtGameTime = null; bossWarningActive = false; pendingMusicState = ''
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
		for (var key in bgmMedia) {
			if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
			try { bgmMedia[key].pause(); bgmMedia[key].onended = null; bgmMedia[key].currentTime = 0; bgmMedia[key].volume = 0 } catch (_) {}
		}
		bgmActive = null; bgmActiveKey = ''
		stopVoices(bgmNodes)
	}
	function clearAudioTimers() {
		if (duckTimer) { clearTimeout(duckTimer); duckTimer = null }
		clearDeathCluster(); duckReleaseAt = 0; resetDensity(); eventDuckMul = 1
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
		resetDensity(); _lastAt = {}; currentStage = Number(initialMusic.stageId) || 1; pendingMusicStage = 0; currentMusicState = initialState; pendingMusicState = ''; curLayer = initialState; battleHeat = MUSIC_STATE_HEAT[initialState] == null ? 0 : MUSIC_STATE_HEAT[initialState]; stageBgmMul = 1; stageTransitionPending = 0; bossWarningActive = false; bossLoopAtGameTime = null
		pressureLevel = 0; pressureTarget = 0; buildLevel = 0; buildTarget = 0; pressureBgmMul = 1; lastPressureBgmMul = 1; musicSampleAt = 0; runCount++
		if (ensure()) { applySfxGain(true); applyMusicState(initialState, currentStage) }
		if (!skipStartCue) { playStartCue(runCount > 1) }
		beginStartHandoff()
		startBgm()
		resume()
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
			stopVoices(uiNodes); playUiSemantic({ kind: 'pause_in', id: 'pause' })
			hardPaused = true; clearAudioTimers(); pauseBgm(); stopVoices(sfxNodes); pauseMul = 0; sfxPauseMul = 0; applyBgmGain(false); applySfxGain(false)
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
		previewSfx: function (id) { return playBank(id, { family: 'ui', priority: 5, gain: 0.55 }) },
		listSfx: function () { ensure(); return Object.keys(sampleBank).filter(function (k) { return k !== '__ready' }).sort() },
		debugState: function () {
			var mediaPlaying = [], mediaAudible = []
			for (var key in bgmMedia) {
				if (!Object.prototype.hasOwnProperty.call(bgmMedia, key) || !bgmMedia[key]) { continue }
				var media = bgmMedia[key]
				if (!media.paused) { mediaPlaying.push(key) }
				if (!media.paused && media.volume > 0.0001) { mediaAudible.push(key) }
			}
			return { specVersion: 'AUDIO-FINAL-1.1', context: ctx ? ctx.state : 'none', bgmRunning: bgmRunning, bgmWanted: bgmWanted, transport: bgmTransportSerial, owner: bgmPlaySerial, stage: currentStage, musicState: currentMusicState, pendingMusicState: pendingMusicState, pendingStage: pendingMusicStage, bossWarningActive: bossWarningActive, layer: curLayer, mediaSegment: bgmActiveKey, mediaPlaying: mediaPlaying, mediaAudible: mediaAudible, bpm: MUSIC_STATE_BPM[currentMusicState] || 124, stageGain: stageBgmMul, heat: battleHeat, pressure: pressureLevel, build: buildLevel, sfxDensity: densityScore, sampleCount: Object.keys(sampleBank).length - (sampleBank.__ready ? 1 : 0), voices: voiceSnapshot() }
		}
	}
	Registry.register('audio', Audio)
	Log.info('audio 就绪：AUDIO-FINAL-1.1 · Golden Master BGM冻结 + 技能身份优先 Sample Bank + Priority/Voice Budget')

})(typeof window !== 'undefined' ? window : this)
