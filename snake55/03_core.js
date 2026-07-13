;(function (global) {
	'use strict'

	var CONFIG = global.CONFIG
	// 引导期防白屏守卫（非业务逻辑）
	if (!CONFIG) { throw new Error('[core] CONFIG 未加载：config.js 必须在 core.js 之前引入') }

	// ---------- Log ----------
	var Log = (function () {
		var P = '[5.5🐍]'
		return {
			info: function (m) { console.log(P, m) },
			warn: function (m) { console.warn(P, m) },
			error: function (m) { console.error(P, m) },
			group: function (m) { if (console.group) { console.group(P + ' ' + m) } },
			groupEnd: function () { if (console.groupEnd) { console.groupEnd() } }
		}
	})()

	// ---------- assert（防 NaN/防白屏第一道闸） ----------
	function assert(cond, msg) {
		if (!cond) { Log.error('断言失败：' + msg); throw new Error('[assert] ' + msg) }
		return cond
	}

	// ---------- deepFreeze ----------
	function deepFreeze(obj) {
		if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) { return obj }
		Object.freeze(obj)
		var keys = Object.keys(obj)
		for (var i = 0; i < keys.length; i++) { deepFreeze(obj[keys[i]]) }
		return obj
	}

	// ---------- Math 工具 ----------
	var M = {
		PI2: Math.PI * 2,
		clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) },
		lerp: function (a, b, t) { return a + (b - a) * t },
		dist: function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy) },
		distSq: function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy },
		len: function (x, y) { return Math.sqrt(x * x + y * y) },
		normAngle: function (a) { while (a > Math.PI) { a -= M.PI2 } while (a < -Math.PI) { a += M.PI2 } return a },
		angleLerp: function (cur, target, maxStep) {
			var d = M.normAngle(target - cur)
			if (d > maxStep) { d = maxStep }
			if (d < -maxStep) { d = -maxStep }
			return cur + d
		},
		rand: function (lo, hi) { return lo + Math.random() * (hi - lo) },
		randInt: function (lo, hi) { return (lo + Math.random() * (hi - lo + 1)) | 0 },
		pick: function (arr) { return arr[(Math.random() * arr.length) | 0] },
		deg2rad: function (d) { return d * Math.PI / 180 }
	}

	// ---------- Bus（事件名强制 系统:动作 小写） ----------
	var Bus = (function () {
		var map = {}
		var RE = /^[a-z0-9]+:[a-z0-9_]+$/
		return {
			on: function (evt, fn) {
				assert(RE.test(evt), 'Bus 事件名须为 系统:动作 小写 → ' + evt)
				if (!map[evt]) { map[evt] = [] }
				map[evt].push(fn)
				return fn
			},
			off: function (evt, fn) {
				var a = map[evt]; if (!a) { return }
				var i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1) }
			},
			emit: function (evt, payload) {
				var a = map[evt]; if (!a) { return }
				for (var i = 0; i < a.length; i++) {
					try { a[i](payload) } catch (e) { Log.error('Bus[' + evt + '] 回调异常：' + (e && e.message)) }
				}
			},
			clear: function () { map = {} }
		}
	})()

	// ---------- Registry（系统注册表，禁跨层直调） ----------
	var Registry = (function () {
		var sys = {}
		return {
			register: function (name, obj) { assert(!sys[name], 'Registry 重复注册：' + name); sys[name] = obj; return obj },
			get: function (name) { return sys[name] || null },
			has: function (name) { return !!sys[name] },
			all: function () { return sys }
		}
	})()

	// ---------- ObjectPool（热路径零 new） ----------
	function createPool(factory, reset, initial) {
		var free = [], used = 0, n = initial || 0
		for (var i = 0; i < n; i++) { free.push(factory()) }
		return {
			acquire: function () { var o = free.length ? free.pop() : factory(); used++; return o },
			release: function (o) { if (reset) { reset(o) } free.push(o); if (used > 0) { used-- } },
			activeCount: function () { return used },
			freeCount: function () { return free.length }
		}
	}

	// ---------- Formula（DSL 数值公式，集中实现，下游禁裸算） ----------
	var Formula = {
		// §1.1 效果系数
		effectMul: function (segments) {
			var e = CONFIG.PLAYER.effect
			var v = 1 + (segments - e.base) * e.coeff
			return v < e.floor ? e.floor : v
		},
		// §7 连杀倍率
		killStreakMul: function (streak) {
			var k = CONFIG.ECON.killStreak
			var v = k.startMul + k.step * streak
			return v > k.capMul ? k.capMul : v
		},
		// §2 伤害 = base * effectMul * critMul
		damage: function (base, segments, isCrit) {
			return base * Formula.effectMul(segments) * (isCrit ? CONFIG.COMBAT.critMultiplier : 1)
		},
		// §4.6 / 真理源 §9 2026-07-11：Combo 独立伤害口径——不乘 effectMul(segments)，仅保留暴击
		comboDamage: function (base, isCrit) {
			return base * (isCrit ? CONFIG.COMBAT.critMultiplier : 1)
		}
	}

	// ---------- GS 全局运行态 ----------
	var GS = {
		status: 'menu', timeSec: 0, frame: 0, score: 0, kills: 0, killStreak: 0,
		coreHp: 0, segments: 0, stageId: 0, waveIndex: 0,
		invincibleUntil: 0, buildPauseUntil: 0, comboScore: 0,
		ownedSkills: {}, shakeFrames: 0, shakeMag: 0, rngSeed: 0,
		// —— 叙事结算态（真理源 §8.2 / GDD §13.3 必清）——
		maxSegments: 0, maxStageId: 1, killStreakMax: 0,
		memoryTokens: [], buildSequence: [], comboHighlights: [], irreversibleChoices: [],
		deathCause: null, bossDefeated: false
	}

	// GDD §13.3：开新局重置一切运行态
	function resetRun() {
		GS.status = 'playing'
		GS.timeSec = 0; GS.frame = 0; GS.score = 0; GS.kills = 0; GS.killStreak = 0
		GS.coreHp = CONFIG.PLAYER.coreHp
		GS.segments = CONFIG.PLAYER.initSegments
		GS.stageId = 1; GS.waveIndex = 0
		GS.invincibleUntil = 0; GS.buildPauseUntil = 0; GS.comboScore = 0
		GS.ownedSkills = {}; GS.shakeFrames = 0; GS.shakeMag = 0
		// 叙事结算态清空（防上局残留：memoryTokens 等）
		GS.maxSegments = CONFIG.PLAYER.initSegments; GS.maxStageId = 1; GS.killStreakMax = 0
		GS.memoryTokens = []; GS.buildSequence = []; GS.comboHighlights = []; GS.irreversibleChoices = []
		GS.deathCause = null; GS.bossDefeated = false
		Bus.emit('core:run_reset', null)
		Log.info('resetRun：coreHp=' + GS.coreHp + ' segments=' + GS.segments)
	}

	// ---------- 启动自检（峰峰 Checklist 子集 · 防白屏/NaN/缺字段） ----------
	function selfCheck() {
		Log.group('启动自检')
		var need = ['GAME','PLAYER','COMBAT','JUICE','ENEMIES','SPAWN','SPATIAL','SKILL','COMBO','PICKUP','STAGE','ECON','NARR','COLORS','AUDIO','DEBUG']
		for (var i = 0; i < need.length; i++) { assert(CONFIG[need[i]], 'CONFIG 缺失分区：' + need[i]) }
		assert(CONFIG.GAME.fps > 0, 'fps 必须 > 0')
		assert(CONFIG.GAME.logicalWidth > 0 && CONFIG.GAME.logicalHeight > 0, '逻辑分辨率非法')
		assert(CONFIG.SPATIAL.cellSize >= CONFIG.ENEMIES.chaser.radius * 2, '格子须≥小怪直径')
		assert(CONFIG.PLAYER.coreHp >= 1, 'coreHp 非法')
		assert(!isNaN(CONFIG.PLAYER.snakeSpeed), 'snakeSpeed NaN')
		Log.info('CONFIG 分区齐全（16）+ 关键值非 NaN + 格子合法')
		Log.groupEnd()
	}

	// 调参编辑器联动（13_editor.js）：深冻结前合并 localStorage['snake55_tuning'] 覆盖，按路径写回 CONFIG（dev 调参·仅改已定义路径·不改 config.js 默认定义）
	function applyTuningOverrides() {
		var raw = null
		try { raw = global.localStorage && global.localStorage.getItem('snake55_tuning') } catch (e) { raw = null }
		if (!raw) { return }
		var ov = null
		try { ov = JSON.parse(raw) } catch (e) { return }
		if (!ov || typeof ov !== 'object') { return }
		var cnt = 0
		for (var p in ov) {
			if (!ov.hasOwnProperty(p)) { continue }
			var ks = p.split('.'), o = CONFIG, i
			for (i = 0; i < ks.length - 1; i++) { o = o && o[ks[i]] }
			if (o && ks.length && typeof o[ks[ks.length - 1]] !== 'undefined') { o[ks[ks.length - 1]] = ov[p]; cnt++ }
		}
		if (cnt > 0) { Log.warn('调参覆盖已应用 ' + cnt + ' 项（dev 模式·非默认数值）') }
	}
	applyTuningOverrides()
	deepFreeze(CONFIG)
	selfCheck()

	var Core = { M: M, createPool: createPool, deepFreeze: deepFreeze, Formula: Formula, selfCheck: selfCheck, resetRun: resetRun, version: '0.3-b11' }

	global.Log = Log
	global.assert = assert
	global.Bus = Bus
	global.Registry = Registry
	global.GS = GS
	global.Core = Core
	Registry.register('core', Core)

})(typeof window !== 'undefined' ? window : this)
