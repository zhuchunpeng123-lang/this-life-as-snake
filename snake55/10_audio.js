;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var AUDIO = CONFIG.AUDIO

	// 主音量读真理源 AUDIO.masterVolume×sfxVolume；逐事件音效频率/时长为表现层（真理源未定义合成配方）
	var MASTER_GAIN = AUDIO.masterVolume * AUDIO.sfxVolume

	var ctx = null, master = null, muted = !AUDIO.enabled
	function ensure() {
		if (ctx) { return true }
		var AC = global.AudioContext || global.webkitAudioContext
		if (!AC) { return false }
		ctx = new AC(); master = ctx.createGain(); master.gain.value = MASTER_GAIN; master.connect(ctx.destination)
		return true
	}
	function resume() { if (ctx && ctx.state === 'suspended') { ctx.resume() } }

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

	// 事件 → 音效（🟡 频率/时长为表现层候选值，可在调参器微调）
	Bus.on('snake:grow', function () { tone({ freq: 660, freqTo: 990, dur: 0.10, type: 'triangle', gain: 0.18 }) })
	Bus.on('snake:hurt', function () { tone({ freq: 180, freqTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.30 }) })
	Bus.on('snake:wall', function () { noise(0.08, 0.12) })
	Bus.on('snake:dead', function () { tone({ freq: 320, freqTo: 50, dur: 0.70, type: 'sawtooth', gain: 0.35 }) })
	Bus.on('enemy:hit', function () { tone({ freq: 880, dur: 0.04, type: 'square', gain: 0.08 }) })
	Bus.on('enemy:die', function () { noise(0.12, 0.18); tone({ freq: 220, freqTo: 110, dur: 0.12, type: 'square', gain: 0.12 }) })
	Bus.on('enemy:phase', function () { tone({ freq: 110, freqTo: 60, dur: 0.50, type: 'sawtooth', gain: 0.35 }) })
	Bus.on('skill:offer', function () { tone({ freq: 740, freqTo: 1180, dur: 0.18, type: 'sine', gain: 0.20 }) })
	Bus.on('skill:gained', function () { tone({ freq: 520, freqTo: 1040, dur: 0.25, type: 'triangle', gain: 0.22 }) })
	Bus.on('combo:found', function () { tone({ freq: 660, dur: 0.10, type: 'square', gain: 0.20 }); tone({ freq: 990, dur: 0.18, type: 'square', gain: 0.20 }) })
	Bus.on('wave:boss_warn', function () { tone({ freq: 140, dur: 0.30, type: 'square', gain: 0.30 }) })
	Bus.on('wave:stage', function () { tone({ freq: 440, freqTo: 660, dur: 0.14, type: 'sine', gain: 0.14 }) })

	var Audio = {
		setMuted: function (m) { muted = !!m; if (master) { master.gain.value = muted ? 0 : MASTER_GAIN } },
		isMuted: function () { return muted },
		unlock: function () { ensure(); resume() }
	}
	Registry.register('audio', Audio)
	Log.info('audio 就绪：Web Audio 纯合成')

})(typeof window !== 'undefined' ? window : this)
