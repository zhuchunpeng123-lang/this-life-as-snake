;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = CONFIG.AUDIO

	// masterVolume controls the master bus; sfxVolume and UI_VOLUME stay on their own buses.
	var MASTER_GAIN = AUDIO.masterVolume
	var UI_VOLUME = AUDIO.uiVolume == null ? 0.72 : AUDIO.uiVolume

	var ctx = null, master = null, sfxGain = null, uiGain = null, muted = !AUDIO.enabled
	// —— BGM 子链（程序化 BGM v3，照《此生为蛇》音频规范 v0.1）——
	var bgmGain = null
	var layerGain = { explore: null, battle: null, boss: null }
	var bgmRunning = false, bgmTimer = null
	var bgmNodes = [], sfxNodes = [], uiNodes = []
	var absStep = 0, nextNoteTime = 0
	var sfxPauseMul = 1, hardPaused = false, duckTimer = null, musicSampleAt = 0, pressureLevel = 0, pressureTarget = 0, buildLevel = 0, buildTarget = 0
	var runCount = 0, suppressStartCue = false

	// 表现层参数：只控制声音密度、层次和响应，不改变任何玩法数值。
	var AUDIO_MIX = {
		stateSampleSec: 0.25, stateLerp: 0.18, pressureMobCap: 12, pressureChaseCap: 4,
		pressureHpWeight: 0.55, pressureMobWeight: 0.75, pressureChaseWeight: 0.65, pressureBossWeight: 0.90,
		buildSkillWeight: 0.35, buildLevelWeight: 0.06, buildMaxedWeight: 0.25, buildComboWeight: 0.35,
		buildStreakCap: 8, buildStreakWeight: 0.20, buildHarmonyBand: 0.75, buildLeadBand: 1.65,
		pressurePulseBand: 1.0, pressureTensionBand: 2.0, duckMul: 0.72, duckSec: 0.18,
		pauseRampSec: 0.06
	}
	var FIRE_AUDIO = {
		dotDuration: 0.16, dotThrottleMs: 180, noiseGain: 0.09, noiseMinHz: 720, noiseMaxHz: 980,
		toneStartHz: 250, toneEndHz: 165, toneGain: 0.045, dartDuration: 0.10, dartGain: 0.07,
		steamDuration: 0.14, steamNoiseGain: 0.08, steamToneGain: 0.10, dartThrottleMs: 140, steamThrottleMs: 220
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
	var stepDur = 60 / 88 / 4, targetStepDur = stepDur   // 16 分音符秒；explore 88BPM
	var curLayer = 'explore', battleHeat = 1.0, pauseMul = 1, eventDuckMul = 1, densityDuckMul = 1, chooseDuckMul = 1   // ⚠️ 暂停(硬暂停·归零)/事件duck/密度duck/三选一duck 四系数独立相乘（互不污染）；暂停可归零，其余仅压小

	function ensure() {
		if (ctx) { return true }
		var AC = global.AudioContext || global.webkitAudioContext
		if (!AC) { return false }
		ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER_GAIN; master.connect(ctx.destination)
		sfxGain = ctx.createGain(); sfxGain.gain.value = AUDIO.sfxVolume; sfxGain.connect(master)
		uiGain = ctx.createGain(); uiGain.gain.value = UI_VOLUME; uiGain.connect(master)
		// BGM 子链：layerGain → bgmGain → master（与 SFX 共用 master 但分轨，BGM 垫在 SFX 之下）
		bgmGain = ctx.createGain(); bgmGain.gain.value = AUDIO.bgmVolume; bgmGain.connect(master)
		layerGain.explore = ctx.createGain(); layerGain.explore.gain.value = 1; layerGain.explore.connect(bgmGain)
		layerGain.battle = ctx.createGain(); layerGain.battle.gain.value = 0; layerGain.battle.connect(bgmGain)
		layerGain.boss = ctx.createGain(); layerGain.boss.gain.value = 0; layerGain.boss.connect(bgmGain)
		return true
	}
	function trackVoice(list, node) {
		list.push(node)
		node.onended = function () { var i = list.indexOf(node); if (i >= 0) { list.splice(i, 1) } }
		return node
	}
	function stopVoices(list) {
		if (!ctx) { list.length = 0; return }
		var t = ctx.currentTime
		while (list.length) { var node = list.pop(); try { node.stop(t) } catch (_) {} }
	}
	function resume(cb) {
		if (!ctx) { if (cb) { cb() } return }
		if (ctx.state === 'running') { if (cb) { cb() } return }
		if (ctx.state === 'closed' || typeof ctx.resume !== 'function') { return }
		try {
			var p = ctx.resume()   // Safari standalone 可能报告 interrupted；所有非 running/closed 状态都走同一恢复路径
			if (p && p.then) {
				p.then(function () { if (ctx && ctx.state === 'running') { if (cb) { cb() } } }).catch(function () {})
			} else if (ctx.state === 'running' && cb) { cb() }
		} catch (_) {}
	}
	var _kicked = false   // iOS 解锁只需真实出声一次；跑过后不再 kick，避免重复 run_reset 出咔哒声
	// iOS Safari 经典解锁：须在用户手势内「实际输出非零音频」才解锁管线。关键：手势调用栈内同步 start 振荡器(即便 ctx 尚 suspended，
	// start(0) 进队列、紧接 resume() 翻 running 后即真实出声)；仅 resume() 或静音 buffer 在多数 iOS 版本无效(含添加到主屏幕的 standalone 模式)
	function _kickIos() {
		if (!ctx || _kicked) { return }
		try {
			var o = ctx.createOscillator(), g = ctx.createGain()
			g.gain.value = 0.001   // 极低增益：人耳近乎无声，但音频图仍处理非零信号→iOS 解锁
			o.type = 'sine'; o.frequency.value = 440
			o.connect(g); g.connect(ctx.destination)
			var t = ctx.currentTime || 0
			o.start(0); o.stop(t + 0.05)
			_kicked = true
		} catch (e) {}
	}

	// 单振荡器音 + 包络（freqTo 做扫频，type 选波形）
	function tone(opt, dest, when) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		var t = (when == null) ? ctx.currentTime : when, dur = opt.dur || 0.12
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = opt.type || 'sine'
		o.frequency.setValueAtTime(opt.freq, t)
		if (opt.freqTo) { o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.freqTo), t + dur) }
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.005))
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		var out = dest || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes
		o.connect(g); g.connect(out); trackVoice(list, o); o.start(t); o.stop(t + dur + 0.02)
	}
	// 白噪爆破（爆炸/刮擦/死亡用）
	function noise(dur, gain, dest, when) {
		if (muted || hardPaused || !ensure()) { return }
		if (when == null) { resume() }
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain || 0.2
		var out = dest || sfxGain || master, list = (out === uiGain) ? uiNodes : sfxNodes
		src.connect(g); g.connect(out); trackVoice(list, src); if (when == null) { src.start() } else { src.start(when) }
	}

	// —— 节流器：同 key 在 ms 内只触发一次（防割草期/持续伤害音效堆叠成噪海）——
	var _lastAt = {}
	function throttled(key, ms, fn) {
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (_lastAt[key] && (now - _lastAt[key]) < ms) { return }
		_lastAt[key] = now
		fn()
	}
	// —— 密度感知 duck：窗口内音效 >阈值 自动再压一档（多技能齐发/BGM 不打架，见 §十 密度 duck）——
	var sfxCount = 0, sfxWinStart = 0, densityOn = false, densityTimer = null
	var SFX_DENSITY_WINDOW = 200, SFX_DENSITY_TH = 3, SFX_DENSITY_MUL = 0.56   // ⚠️ 可调：窗口(ms)/阈值(次)/深度(×0.56≈−9dB)；回升 220ms、ramp 150ms
	var CHOOSE_DUCK = 0.5   // ⚠️ 三选一技能(choosing)期间 BGM 压小系数（×0.5≈−6dB，保持可闻、音量变小；硬暂停另走 pauseMul 归零）
	function sfxPing() {
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (!sfxWinStart || (now - sfxWinStart) > SFX_DENSITY_WINDOW) { sfxCount = 0; sfxWinStart = now }
		sfxCount++
		if (sfxCount > SFX_DENSITY_TH) {
			if (!densityOn) { densityOn = true; densityDuckMul = SFX_DENSITY_MUL; applyBgmGain(false) }
			if (densityTimer) { clearTimeout(densityTimer) }
			densityTimer = setTimeout(function () { densityOn = false; densityDuckMul = 1; applyBgmGain(false) }, 220)
		}
	}
	// 暖火声（火墙 DOT）：噪声→lowpass 700Hz + 低频锯齿 150→90Hz 咆哮，0.3s 包络（替代原 880Hz 方波，消除"电磁嗡鸣"）
	function playFire() {
		if (muted || hardPaused || !ensure()) { return }
		resume()
		var t = ctx.currentTime, dur = FIRE_AUDIO.dotDuration
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = FIRE_AUDIO.noiseMinHz + Math.random() * (FIRE_AUDIO.noiseMaxHz - FIRE_AUDIO.noiseMinHz); filter.Q.value = 0.8
		var g = ctx.createGain()
		g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(FIRE_AUDIO.noiseGain, t + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		src.connect(filter); filter.connect(g); g.connect(sfxGain || master); trackVoice(sfxNodes, src); src.start(t); src.stop(t + dur + 0.02)
		var o = ctx.createOscillator(), og = ctx.createGain()
		o.type = 'triangle'; o.frequency.setValueAtTime(FIRE_AUDIO.toneStartHz, t); o.frequency.exponentialRampToValueAtTime(FIRE_AUDIO.toneEndHz, t + dur)
		og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(FIRE_AUDIO.toneGain, t + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(og); og.connect(sfxGain || master); trackVoice(sfxNodes, o); o.start(t); o.stop(t + dur + 0.02)
	}

	// 事件 → 音效（🟡 频率/时长为表现层候选值，可在调参器微调）
	function playBurnDart() {
		if (muted || hardPaused || !ensure()) { return }
		noise(FIRE_AUDIO.dartDuration, FIRE_AUDIO.dartGain)
		tone({ freq: 300, freqTo: 180, dur: FIRE_AUDIO.dartDuration, type: 'triangle', gain: FIRE_AUDIO.dartGain })
	}
	function playSteamBlast() {
		if (muted || hardPaused || !ensure()) { return }
		noise(FIRE_AUDIO.steamDuration, FIRE_AUDIO.steamNoiseGain)
		tone({ freq: 180, freqTo: 95, dur: FIRE_AUDIO.steamDuration, type: 'triangle', gain: FIRE_AUDIO.steamToneGain })
	}



	function playUiCue(notes, type, gain, spacing, when) {
		if (muted || hardPaused || !ensure()) { return }
		var t = when == null ? ctx.currentTime : when, step = spacing || 0.06
		for (var i = 0; i < notes.length; i++) { tone({ freq: notes[i], dur: 0.12 + i * 0.02, type: type, gain: gain }, uiGain, t + i * step) }
	}
	function playSfxCue(notes, type, gain, spacing, when) {
		if (muted || hardPaused || !ensure()) { return }
		var t = when == null ? ctx.currentTime : when, step = spacing || 0.06
		for (var i = 0; i < notes.length; i++) { tone({ freq: notes[i], dur: 0.08 + i * 0.01, type: type, gain: gain }, sfxGain, t + i * step) }
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
		duck()
	}
	function playPauseCue() { playUiCue([360, 540], 'triangle', 0.14, 0.07) }
	function playStartCue(replay) { playUiCue(replay ? [300, 450, 600] : [220, 330], 'sine', 0.12, 0.08) }
	function playDeathCue() { playUiCue([260, 190, 120], 'sawtooth', 0.16, 0.10) }
	function playBossDefeatCue() {
		if (muted || hardPaused || !ensure()) { return }
		var t = ctx.currentTime
		tone({ freq: BOSS_AUDIO.impactFreq, freqTo: BOSS_AUDIO.impactEndHz, dur: BOSS_AUDIO.impactDuration, type: 'triangle', gain: BOSS_AUDIO.impactGain }, uiGain, t)
		noise(BOSS_AUDIO.impactNoiseDuration, BOSS_AUDIO.impactNoiseGain, uiGain, t)
		var motiveAt = t + BOSS_AUDIO.restSec
		playUiCue(BOSS_AUDIO.motive, 'triangle', BOSS_AUDIO.motiveGain, BOSS_AUDIO.motiveSpacing, motiveAt)
		var atmosphereAt = t + BOSS_AUDIO.atmosphereDelay
		for (var i = 0; i < BOSS_AUDIO.atmosphere.length; i++) { tone({ freq: BOSS_AUDIO.atmosphere[i], dur: BOSS_AUDIO.atmosphereDuration, type: 'sine', gain: BOSS_AUDIO.atmosphereGain }, uiGain, atmosphereAt + i * 0.04) }
	}

	Bus.on('ui:feedback', playUiSemantic)
	Bus.on('snake:grow', function () { throttled('snake:grow', 90, function () { tone({ freq: 660, freqTo: 990, dur: 0.10, type: 'triangle', gain: 0.12 }) }) })
	Bus.on('snake:hurt', function () { sfxPing(); tone({ freq: 180, freqTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.30 }); duck() })
	Bus.on('snake:wall', function () { throttled('snake:wall', 100, function () { noise(0.08, 0.10) }) })
	Bus.on('enemy:hit', function (d) {
		d = d || {}
		if (d.isDot && d.src === 'fire') { throttled('hit:fire', FIRE_AUDIO.dotThrottleMs, playFire) }
		else { throttled('hit:other', 70, function () { tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.08 }) }) }
	})
	Bus.on('enemy:die', function (d) {
		d = d || {}
		if (d.kind === 'boss' || d.kind === 'elite') { sfxPing(); duck() }
		throttled('enemy:die', 90, function () { noise(0.10, 0.12); tone({ freq: 220, freqTo: 110, dur: 0.10, type: 'square', gain: 0.08 }) })
	})
	Bus.on('enemy:phase', function () { tone({ freq: 110, freqTo: 60, dur: 0.50, type: 'sawtooth', gain: 0.30 }); duck() })
	Bus.on('skill:offer', function () { sfxPing(); chooseDuckMul = CHOOSE_DUCK; applyBgmGain(false); playUiCue([520, 660, 880], 'sine', 0.14, 0.08) })
	Bus.on('skill:gained', function (d) { d = d || {}; chooseDuckMul = 1; applyBgmGain(false); playSkillCue(d.id, d.level); duck() })
	Bus.on('combo:found', function (d) { playComboCue(d && d.id) })
	Bus.on('wave:boss_warn', function () { sfxPing(); playUiCue([140, 110, 90], 'square', 0.18, 0.10); duck() })
	Bus.on('wave:stage', function () { throttled('wave:stage', 120, function () { tone({ freq: 440, freqTo: 660, dur: 0.14, type: 'sine', gain: 0.10 }) }) })
	Bus.on('pickup:eat', function (d) {
		d = d || {}
		if (d.kind === 'skill') { playUiCue([620, 930], 'sine', 0.12, 0.08) }
		else if (d.kind === 'heal') { playUiCue([300, 450], 'triangle', 0.10, 0.08) }
		else { throttled('pickup:food', 80, function () { tone({ freq: 780, dur: 0.06, type: 'triangle', gain: 0.07 }) }) }
	})
	Bus.on('fx:bolt', function () { throttled('fx:bolt', 110, function () { tone({ freq: 720, freqTo: 980, dur: 0.07, type: 'square', gain: 0.08 }) }) })
	Bus.on('fx:ice_throw', function () { throttled('fx:ice_throw', 140, function () { tone({ freq: 900, freqTo: 500, dur: 0.10, type: 'sine', gain: 0.08 }) }) })
	Bus.on('fx:ice_pool', function () { throttled('fx:ice_pool', 220, function () { tone({ freq: 500, freqTo: 900, dur: 0.16, type: 'sine', gain: 0.08 }) }) })
	Bus.on('fx:lightning', function () { throttled('fx:lightning', 120, function () { tone({ freq: 860, freqTo: 1300, dur: 0.08, type: 'sawtooth', gain: 0.10 }) }) })
	Bus.on('fx:electroarc', function () { throttled('fx:electroarc', 120, function () { playSfxCue([520, 780, 1170], 'square', 0.08, 0.035) }) })
	Bus.on('fx:steamblast', function () { throttled('fx:steamblast', FIRE_AUDIO.steamThrottleMs, playSteamBlast) })
	Bus.on('fx:burndart', function () { throttled('fx:burndart', FIRE_AUDIO.dartThrottleMs, playBurnDart) })

	// ================= 程序化 BGM（v3 · 照《此生为蛇》音频规范 v0.1 音符级曲谱） =================
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
		playOsc(freq, 'triangle', t, dur, 0.06, dest, 0.4, 0.6)
		playOsc(freq * 1.00347, 'triangle', t, dur, 0.06, dest, 0.4, 0.6)
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
		var v = AUDIO.bgmVolume * pauseMul * eventDuckMul * densityDuckMul * chooseDuckMul   // 四系数相乘；暂停(硬)归零→静音，其余仅压小（三选一 chooseDuckMul）
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
		rampGain(layerGain.explore, 1, t)
		rampGain(layerGain.battle, (layer === 'battle' || layer === 'boss') ? 1 : 0, t)
		rampGain(layerGain.boss, layer === 'boss' ? 1 : 0, t)
		Log.info('[bgm] layer -> ' + layer + '  heat=' + battleHeat)
	}
	// Ducking：关键事件瞬时压低 −6dB(×0.5) ~250ms 再回升（平滑 150ms）
	function duck() {
		eventDuckMul = AUDIO_MIX.duckMul
		applyBgmGain(false)
		if (duckTimer) { clearTimeout(duckTimer) }
		duckTimer = setTimeout(function () { duckTimer = null; eventDuckMul = 1; applyBgmGain(false) }, AUDIO_MIX.duckSec * 1000)
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
		if (curLayer === 'boss' && pressureLevel >= AUDIO_MIX.pressureTensionBand && (s === 1 || s === 9)) { playOsc(FREQ.As4, 'sawtooth', t, stepDur * 0.8, 0.035, destS, 0.003, 0.04) }
		var isBattle = (curLayer === 'battle' || curLayer === 'boss')
		// [A.1] PAD：每小节步 0 持续整小节；boss pedal 覆盖整循环（bar0 触发）
		if (s === 0) {
			var chord = PAD[bar]
			for (var i = 0; i < chord.length; i++) { playPad(FREQ[chord[i]], t, 16 * stepDur, padDest) }
			if (curLayer === 'boss' && bar === 0) { playOsc(FREQ.A2, 'triangle', t, 64 * stepDur, 0.10, destS, 0.4, 0.8) }
		}
		// [A.2] BASS
		var root = FREQ[BASS_ROOT[bar]]
		if (!isBattle) {
			if (s === 0 || s === 8) { playOsc(root, 'triangle', t, 8 * stepDur, 0.11, destE, 0.01, 0.05) }
		} else {
			if (s % 2 === 0) { playOsc(root, 'triangle', t, 2 * stepDur, 0.11, (curLayer === 'boss' ? destS : destB), 0.005, 0.04) }
		}
		// [A.3] ARP
		if (!isBattle) {
			if (s % 2 === 0) {
				var seq = ARP_EXPLORE[bar], idx = s / 2
				if (idx < seq.length) { playOsc(FREQ[seq[idx]], 'square', t, 2 * stepDur, 0.06, destE, 0.005, 0.03) }
			}
		} else {
			var seqB = ARP_BATTLE[bar]
			playOsc(FREQ[seqB[s]], 'square', t, stepDur * 0.9, 0.06, (curLayer === 'boss' ? destS : destB), 0.003, 0.02)
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
		densityOn = false; densityDuckMul = 1; eventDuckMul = 1
	}

	// —— BGM 事件订阅（追加，不动既有 12 事件音效行）——
	// 开局/重开局：在用户手势同步链内解锁音频并起 explore BGM。
	// 关键：AudioContext 必须在「用户手势」内创建+resume，否则浏览器 autoplay 策略会在主循环 rAF 内挡住→开局静音，
	// 要等后续手势(移动键/拾取音效里的 resume)才解锁。core:run_reset 由 startIfMenu→core.resetRun 同步触发，属手势内→合规解锁（修复 2026-07-26）
	Bus.on('core:run_reset', function () {
		var skipStartCue = suppressStartCue
		suppressStartCue = false; hardPaused = false
		if (densityTimer) { clearTimeout(densityTimer); densityTimer = null }
		if (duckTimer) { clearTimeout(duckTimer); duckTimer = null }
		stopBgm(); stopVoices(sfxNodes); stopVoices(uiNodes)
		pauseMul = 1; sfxPauseMul = 1; eventDuckMul = 1; densityDuckMul = 1; chooseDuckMul = 1
		densityOn = false; sfxCount = 0; sfxWinStart = 0; curLayer = 'explore'; battleHeat = 1.0
		pressureLevel = 0; pressureTarget = 0; buildLevel = 0; buildTarget = 0; musicSampleAt = 0; runCount++
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
	Bus.on('wave:boss_warn', function () { if (!bgmRunning) { startBgm() }; battleHeat = 2.0; setLayer('boss'); duck() })
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
			hardPaused = true; stopVoices(uiNodes); stopBgm(); stopVoices(sfxNodes); pauseMul = 0; sfxPauseMul = 0; applyBgmGain(false); applySfxGain(false)
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
	Log.info('audio 就绪：Web Audio 纯合成 + 程序化 BGM v3')

})(typeof window !== 'undefined' ? window : this)
