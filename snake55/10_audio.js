;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = CONFIG.AUDIO

	// 主音量读真理源 AUDIO.masterVolume×sfxVolume；逐事件音效频率/时长为表现层（真理源未定义合成配方）
	var MASTER_GAIN = AUDIO.masterVolume * AUDIO.sfxVolume

	var ctx = null, master = null, muted = !AUDIO.enabled
	// —— BGM 子链（程序化 BGM v3，照《此生为蛇》音频规范 v0.1）——
	var bgmGain = null
	var layerGain = { explore: null, battle: null, boss: null }
	var bgmRunning = false, bgmTimer = null
	var absStep = 0, nextNoteTime = 0
	var stepDur = 60 / 88 / 4, targetStepDur = stepDur   // 16 分音符秒；explore 88BPM
	var curLayer = 'explore', battleHeat = 1.0, pauseMul = 1, eventDuckMul = 1, densityDuckMul = 1, chooseDuckMul = 1   // ⚠️ 暂停(硬暂停·归零)/事件duck/密度duck/三选一duck 四系数独立相乘（互不污染）；暂停可归零，其余仅压小

	function ensure() {
		if (ctx) { return true }
		var AC = global.AudioContext || global.webkitAudioContext
		if (!AC) { return false }
		ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER_GAIN; master.connect(ctx.destination)
		// BGM 子链：layerGain → bgmGain → master（与 SFX 共用 master 但分轨，BGM 垫在 SFX 之下）
		bgmGain = ctx.createGain(); bgmGain.gain.value = AUDIO.bgmVolume; bgmGain.connect(master)
		layerGain.explore = ctx.createGain(); layerGain.explore.gain.value = 1; layerGain.explore.connect(bgmGain)
		layerGain.battle = ctx.createGain(); layerGain.battle.gain.value = 0; layerGain.battle.connect(bgmGain)
		layerGain.boss = ctx.createGain(); layerGain.boss.gain.value = 0; layerGain.boss.connect(bgmGain)
		return true
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
	function tone(opt) {
		if (muted || !ensure()) { return }
		resume()
		var t = ctx.currentTime, dur = opt.dur || 0.12
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = opt.type || 'sine'
		o.frequency.setValueAtTime(opt.freq, t)
		if (opt.freqTo) { o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.freqTo), t + dur) }
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.005))
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02)
	}
	// 白噪爆破（爆炸/刮擦/死亡用）
	function noise(dur, gain) {
		if (muted || !ensure()) { return }
		resume()
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain || 0.2
		src.connect(g); g.connect(master); src.start()
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
		if (muted || !ensure()) { return }
		resume()
		var t = ctx.currentTime, dur = 0.30
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700
		var g = ctx.createGain()
		g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		src.connect(lp); lp.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02)
		var o = ctx.createOscillator(), og = ctx.createGain()
		o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(90, t + dur)
		og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.10, t + 0.03); og.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(og); og.connect(master); o.start(t); o.stop(t + dur + 0.02)
	}

	// 事件 → 音效（🟡 频率/时长为表现层候选值，可在调参器微调）
	Bus.on('snake:grow', function () { tone({ freq: 660, freqTo: 990, dur: 0.10, type: 'triangle', gain: 0.18 }) })
	Bus.on('snake:hurt', function () { sfxPing(); tone({ freq: 180, freqTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.30 }) })
	Bus.on('snake:wall', function () { noise(0.08, 0.12) })
	Bus.on('snake:dead', function () { tone({ freq: 320, freqTo: 50, dur: 0.70, type: 'sawtooth', gain: 0.35 }) })
	Bus.on('enemy:hit', function (d) {
		d = d || {}
		if (d.isDot && d.src === 'fire') {            // 火墙 DOT：暖火声 + 0.28s 节流（蛇身穿 Boss 不再连成电磁嗡鸣）
			sfxPing()
			throttled('hit:fire', 280, playFire)
		} else {                                       // 其余命中：降频 880→520Hz、三角波、50ms 节流（去电流感/防噪海）
			sfxPing()
			throttled('hit:other', 50, function () { tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.10 }) })
		}
	})
	Bus.on('enemy:die', function () { sfxPing(); throttled('enemy:die', 80, function () { noise(0.12, 0.18); tone({ freq: 220, freqTo: 110, dur: 0.12, type: 'square', gain: 0.12 }) }) })
	Bus.on('enemy:phase', function () { tone({ freq: 110, freqTo: 60, dur: 0.50, type: 'sawtooth', gain: 0.35 }) })
	Bus.on('skill:offer', function () { sfxPing(); chooseDuckMul = CHOOSE_DUCK; applyBgmGain(false); tone({ freq: 740, freqTo: 1180, dur: 0.18, type: 'sine', gain: 0.20 }) })   // 三选一：BGM 压小（保持可闻、音量变小），选完恢复
	Bus.on('skill:gained', function () { sfxPing(); chooseDuckMul = 1; applyBgmGain(false); tone({ freq: 520, freqTo: 1040, dur: 0.25, type: 'triangle', gain: 0.22 }) })   // 选完：BGM 恢复满
	Bus.on('combo:found', function () { sfxPing(); tone({ freq: 660, dur: 0.10, type: 'square', gain: 0.20 }); tone({ freq: 990, dur: 0.18, type: 'square', gain: 0.20 }) })
	Bus.on('wave:boss_warn', function () { sfxPing(); tone({ freq: 140, dur: 0.30, type: 'square', gain: 0.30 }) })
	Bus.on('wave:stage', function () { tone({ freq: 440, freqTo: 660, dur: 0.14, type: 'sine', gain: 0.14 }) })

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
		if (!ctx) { return }
		var o = ctx.createOscillator(), g = ctx.createGain()
		o.type = type; o.frequency.setValueAtTime(freq, t)
		var a = attack || 0.005, r = release || 0.02
		var susEnd = t + Math.max(a + 0.01, dur - r)
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(peak, t + a)
		g.gain.setValueAtTime(peak, susEnd)
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02)
	}
	// PAD：2× triangle，其一 +6 cent 宽度
	function playPad(freq, t, dur, dest) {
		playOsc(freq, 'triangle', t, dur, 0.06, dest, 0.4, 0.6)
		playOsc(freq * 1.00347, 'triangle', t, dur, 0.06, dest, 0.4, 0.6)
	}
	// 白噪（可定时，供 PERC 调度）
	function playNoiseAt(dur, gain, t, dest) {
		if (!ctx) { return }
		var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
		for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n) }
		var src = ctx.createBufferSource(); src.buffer = buf
		var g = ctx.createGain(); g.gain.value = gain
		src.connect(g); g.connect(dest); src.start(t)
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
		eventDuckMul = 0.5
		applyBgmGain(false)
		setTimeout(function () { eventDuckMul = 1; applyBgmGain(false) }, 250)
	}
	// 单步编曲（bar 0..3 = Am F C G；stepInBar 0..15）
	function scheduleStep(stepAbs, t) {
		var bar = Math.floor((stepAbs % 64) / 16)
		var s = stepAbs % 16
		var destE = layerGain.explore, destB = layerGain.battle, destS = layerGain.boss
		var isBattle = (curLayer === 'battle' || curLayer === 'boss')
		// [A.1] PAD：每小节步 0 持续整小节；boss pedal 覆盖整循环（bar0 触发）
		if (s === 0) {
			var chord = PAD[bar]
			for (var i = 0; i < chord.length; i++) { playPad(FREQ[chord[i]], t, 16 * stepDur, destE) }
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
		while (nextNoteTime < ctx.currentTime + 0.12) {
			scheduleStep(absStep, nextNoteTime)
			absStep++
			stepDur += (targetStepDur - stepDur) * 0.12   // 平滑 tempo 过渡，绝不重置时钟（无缝）
			nextNoteTime += stepDur
		}
	}
	function startBgm() {
		if (!ensure()) { return }
		resume(function () {     // 必须等 ctx 真正 running 再调度；suspended 期 currentTime 冻结，音符全堆在 0.1s 处永不会响(原 iOS 静音根因)
			if (bgmRunning) { return }
			bgmRunning = true
			absStep = 0
			stepDur = targetStepDur = 60 / STEP_BPM.explore / 4
			nextNoteTime = ctx.currentTime + 0.1
			applyBgmGain(true)
			bgmTimer = setInterval(_sched, 25)
			Log.info('[bgm] 启动 explore')
		})
	}
	function stopBgm() {
		bgmRunning = false
		if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null }
	}

	// —— BGM 事件订阅（追加，不动既有 12 事件音效行）——
	// 开局/重开局：在用户手势同步链内解锁音频并起 explore BGM。
	// 关键：AudioContext 必须在「用户手势」内创建+resume，否则浏览器 autoplay 策略会在主循环 rAF 内挡住→开局静音，
	// 要等后续手势(移动键/拾取音效里的 resume)才解锁。core:run_reset 由 startIfMenu→core.resetRun 同步触发，属手势内→合规解锁（修复 2026-07-26）
	Bus.on('core:run_reset', function () {
		pauseMul = 1; eventDuckMul = 1; densityDuckMul = 1; chooseDuckMul = 1   // 新一局清空暂停/duck/三选一系数（死亡→重开若残留，避免开局被压/静音）
		startBgm()                       // 手势内解锁+起 explore BGM；startBgm 内部 ensure+resume(含 ctx running 后真实出声解锁)+调度，自带 bgmRunning 守卫（重开时死亡已 stopBgm→会重启）
	})
	Bus.on('wave:stage', function (d) {            // 探索=1 / 战斗=2-4 / Boss=5（核对点1 映射 A）
		if (!bgmRunning) { startBgm() }           // 兜底：若 run_reset 未起（极少数路径），首波仍兜底起 BGM
		var sid = d && d.stageId
		var layer = 'explore'
		if (sid === 1) { layer = 'explore' }
		else if (sid >= 2 && sid <= 4) { layer = 'battle' }
		else if (sid === 5) { layer = 'boss' }
		battleHeat = (sid === 4) ? 2.0 : (sid === 3) ? 1.4 : 1.0   // 层内密度自适应
		setLayer(layer)
	})
	Bus.on('wave:boss_warn', function () {         // Boss 预警 → boss 层 + ducking
		if (!bgmRunning) { startBgm() }
		battleHeat = 2.0
		setLayer('boss')
		duck()
	})
	Bus.on('snake:dead', function () {            // 死亡：淡出 + 停调度器（音效行已在上方保留）
		duck()
		if (bgmGain && ctx) {
			var t = ctx.currentTime
			bgmGain.gain.cancelScheduledValues(t)
			bgmGain.gain.setValueAtTime(bgmGain.gain.value, t)
			bgmGain.gain.linearRampToValueAtTime(0.0001, t + 0.5)
		}
		stopBgm()
	})
	Bus.on('snake:hurt', duck)                    // 受击让路
	Bus.on('enemy:phase', duck)                   // 阶段切换让路
	Bus.on('skill:gained', duck)                  // 获得技能让路
	Bus.on('combo:found', duck)                   // 连续 combo 让路（防 combo 音效盖过 BGM）
	Bus.on('game:pause_changed', function () {     // 硬暂停(P/暂停按钮/遮罩)：画面冻结 + 音乐彻底停（pauseMul=0；经 0.15s ramp 防爆音）。三选一(choosing)是另态、走 chooseDuckMul 只压小不静音；监听后置事件 game:pause_changed（status 已切换后触发，脱离 Bus 注册顺序依赖，根治「按 P 音乐不暂停」）
		var st = (global.GS && global.GS.status)
		pauseMul = (st === 'paused') ? 0 : 1   // 硬暂停→BGM 归零静音；恢复→还原
		applyBgmGain(false)
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
