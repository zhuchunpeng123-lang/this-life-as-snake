;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	// —— 运行版本横幅：控制台见此行即代表新包已加载；若仍是旧版本号（20260723d 或更早）说明浏览器仍在喂旧缓存 ——
	console.log('%c[snake55] build v=20260724b（固定STEP累加器锁60Hz仿真+渲染插值；移除maxFps封顶旋钮——封顶跳帧丢时间致世界变慢bug，且实测不封顶已稳165）— 看到此行=新代码生效；若版本号更旧=缓存未清，请清站点数据/强刷', 'color:#5f9;font-weight:bold')
	var STEP = 1 / CONFIG.GAME.fps   // 固定仿真步长(秒)：累加器锁 60Hz 仿真，与刷新率解耦（回退 2026-07-20「原生帧时间步进」的 330Hz 仿真过载回归）
	var SUBSTEP = 1 / 240        // 旧：固定子步长(秒)——2026-07-24 已弃用（仿真过载根因），仅留作对照
	global.__FRAME_DT = 1 / CONFIG.GAME.fps   // 本帧真实时间(秒)初始值，main 每帧覆写；供相机/屏震帧率无关缓动
	// —— 自适应性能分级（跨端 FPS 根治）：状态对象 + 控制器（内联，不新增文件/不动 core/collision）——
	// 设计：RT 回退源 = PerfTier 当前档；editor 手动覆盖经 RT 仍优先（GM 链路不变，零双份真相源）。
	// 升降档：仅 playing 态按真实 FPS（render.diag().fps）累计，越阈持续 stabilize 秒才换挡（防抖）。
	var PERF = CONFIG.PERF
	function RT(path, fb) {   // 运行时标定桥（与 08_skill/05_particle/11_render 同款）：读 editor 覆盖，无覆盖回退冻结 CONFIG；仅 perf 阈值热调，零 gameplay
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	var TIER_ORDER = ['HIGH', 'MED', 'LOW', 'POTATO']
	var PerfTier = {
		tier: 'HIGH', auto: true,
		maxBackW: 2560, worldScale: 0.8, maxParticles: 240, maxTexts: 48, spawnBudget: 120,
		suppressFire: false, suppressIceFill: false, suppressShake: false, simpleVignette: false, suppressWhiteBurst: false,
		_downSec: 0, _upSec: 0, _emergencyCd: 0, _lastAppBackW: null, _fillSec: 0, _fillEma: null, _fireLockUntil: 0, _fireSuppressed: false, _recvSec: 0,
		_tierCfg: function (name) { var t = PERF.tiers[name]; return t || PERF.tiers.HIGH },
		apply: function (name, opts) {   // 写入当前档字段；opts.resize=false 时跳过 backing realloc（自动降/升档用，避免降级瞬间 canvas 重建卡顿）
			var t = this._tierCfg(name)
			this.tier = name
			this.maxBackW = t.maxBackW; this.worldScale = t.worldScale
			this.maxParticles = t.maxParticles; this.maxTexts = t.maxTexts; this.spawnBudget = t.spawnBudget
			this.suppressFire = t.suppressFire || !!this._fireSuppressed; this.suppressIceFill = t.suppressIceFill
			this.suppressShake = t.suppressShake; this.simpleVignette = t.simpleVignette
			this.suppressWhiteBurst = !!t.suppressWhiteBurst
			// 解耦：廉价旋钮(粒子/抑制/缩放)经 RT/PerfTier 字段即时生效；backing resize 默认仅在手动档/初始化触发。自动降升档传 {resize:false} 跳过 realloc（零卡顿），仅靠 suppressFire 等字段即时压主因
			var doResize = !opts || opts.resize !== false
			if (doResize) {
				var targetBackW = t.maxBackW
				if (this._lastAppBackW == null || Math.abs(targetBackW - this._lastAppBackW) >= 192) {
					this._lastAppBackW = targetBackW
					var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() }
				}
			}
		},
		setTier: function (name) { if (PERF.tiers[name]) { this._fireSuppressed = false; this.apply(name); Bus.emit('perf:tier', { tier: name, reason: '手动' }) } },
		// 二进制稳定关火开关：仅翻 fireSuppressed → 重算 suppressFire（驱动 render 关火墙 + 余烬停喷），绝不改 worldScale/maxBackW/tier（避免蛇缩小/画布变化）。手动档切换会清此态（用户主动接管）
		setFireSuppressed: function (b) {
			b = !!b
			if (b === this._fireSuppressed) { return }
			this._fireSuppressed = b
			this.suppressFire = this._tierCfg(this.tier).suppressFire || b   // 即时生效：render 下帧经 perfFB('suppressFire') 读到
			Bus.emit('perf:fire', { suppressed: b })
		},
		setAuto: function (on) {
			this.auto = !!on
			if (this.auto) {
				this._downSec = 0; this._upSec = 0; this._fillSec = 0; this._fillEma = null; this._fireLockUntil = 0; this._recvSec = 0; this._fireSuppressed = false
				this.suppressFire = this._tierCfg(this.tier).suppressFire
			} else {
				this._fireSuppressed = false; this.apply('HIGH')   // 关自动 → 回 HIGH 原默认（零回归）+ 清自动关火态
			}
		},
		forceTier: function (name) { this.auto = false; this.setTier(name) },   // GM 强制固定档位（~ 调参器）
		stepDown: function () { var i = TIER_ORDER.indexOf(this.tier); if (i < TIER_ORDER.length - 1) { var n = TIER_ORDER[i + 1]; this.apply(n, { resize: false }); Bus.emit('perf:tier', { tier: n, reason: '掉帧降级' }) } },
		stepUp: function () { var i = TIER_ORDER.indexOf(this.tier); if (i > 0) { var n = TIER_ORDER[i - 1]; this.apply(n, { resize: false }); Bus.emit('perf:tier', { tier: n, reason: '回升升级' }) } },
		tick: function (fps, dt) {   // dt=帧间隔(秒)；仅 auto 且 fps 有效时累计；二进制稳定关火开关，零档位切换
			if (!this.auto || !(fps > 0)) { return }
			// 仅 overdraw 填充率过载(EMA 平滑消抖)触发；自动降级 = 稳定「关火/余烬」开关，绝不切档 → 零蛇缩小、零画布变化、零乒乓球
			// 单位修正：阈值 fillDownThreshold=320 语义=overdraw≥~320k(px²)，故把 render.diag().overdraw(px²) 除 1000 转 k，与 config 注释对齐（修旧版误读 dc.fill 调用次数之 bug）
			var fillThr = RT('PERF.fillDownThreshold', 320)
			var fillStable = RT('PERF.fillDownStableSec', 0.8)
			var fillLock = RT('PERF.fillLockSec', 8)
			var fillRecover = RT('PERF.fillRecoverSec', 5)
			var rp = Registry.get('render')
			var ovK = (rp && rp.diag && rp.diag().overdraw != null) ? rp.diag().overdraw / 1000 : 0   // px² → k-px²（与 320 同单位）
			this._fillEma = (this._fillEma == null) ? ovK : (this._fillEma * 0.85 + ovK * 0.15)
			var emaFill = this._fillEma
			if (this._fireSuppressed) {
				// 关火锁定期内或 overdraw 仍高 → 不恢复（防关火→重燃→再关乒乓）；锁定结束且 overdraw 回落后须稳定 fillRecover 秒才重燃
				if (GS.timeSec >= this._fireLockUntil && emaFill < fillThr * 0.8) {
					this._recvSec += dt
					if (this._recvSec >= fillRecover) { this._recvSec = 0; this.setFireSuppressed(false) }
				} else { this._recvSec = 0 }
		} else {
			if (emaFill > fillThr) {
				this._fillSec += dt
				if (this._fillSec >= fillStable) { this._fillSec = 0; this._fireLockUntil = GS.timeSec + fillLock; this.setFireSuppressed(true) }
			} else { this._fillSec = 0 }
		}
	},
		seedTier: function () {   // 设备初判：手机中/低档起步，弱集显笔记本 MED 起步，不从高档起步
			var ua = (global.navigator && global.navigator.userAgent) || ''
			var isMobile = /Android|iPhone|iPod|iPad|Mobile|Windows Phone|HarmonyOS/i.test(ua)
			var shortSide = Math.min(global.innerWidth || 9999, global.innerHeight || 9999)
			var dpr = global.devicePixelRatio || 1
			var ds = PERF.deviceSeed
			if (isMobile) { return (shortSide <= ds.mobileShortSide) ? 'POTATO' : ds.mobileTier }
			if (shortSide <= ds.desktopShortSide || dpr <= ds.desktopDprFloor) { return 'MED' }
			return 'HIGH'
		},
		init: function () {
			this.auto = !!PERF.autoScale
			this._fireSuppressed = false; this._fillEma = null; this._fillSec = 0; this._fireLockUntil = 0; this._recvSec = 0   // 复位自动关火态（防上局残留）
			var start = this.auto ? this.seedTier() : 'HIGH'
			this.apply(start)
			Bus.emit('perf:tier', { tier: start, reason: this.auto ? '设备初判' : '手动(关自动)' })
		}
	}
	global.PerfTier = PerfTier
	Registry.register('perfTier', PerfTier)
	var HITSTOP_SEC = CONFIG.COMBAT.hitStopFrames / CONFIG.GAME.fps   // ⑥ 命中冻帧时长(秒)，刷新率无关（真理源 §2.2 hitStop 2帧@60→等效时长）
	var hitStopSec = 0

	var keys = {}, cursor = { on: false, wx: 0, wy: 0, angle: 0, touch: false, lastMoveT: -1, lx: null, ly: null }
	// —— DIAG（调试用，window.__SNAKE_DIAG=true 开启；排查直行 stutter + 鼠标自动转向）——
	var _diag = { t: 0, frames: 0, steps: {}, keyFrames: 0, mouseFrames: 0, mouseNoKey: 0, alphaMin: 1, alphaMax: 0, prevMouseNoKey: false,
		dtHist: {}, headHist: {}, freeze: 0, prevHx: null, prevHy: null }
	function _anyMoveKey() { return !!(keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp || keys.ArrowDown || keys.a || keys.A || keys.d || keys.D || keys.w || keys.W || keys.s || keys.S) }
	// DIAG：window.__SNAKE_DIAG=true 时每 ~1s 汇总：每帧模拟步数分布、插值 alpha、真实帧间隔 dt 直方图(抓环境/GC 抖动)、蛇头每帧位移直方图(抓直行"一顿一顿"：0=冻帧、尖峰=跳步)
	function _diagTick(steps, alpha, frameDt) {
		if (!global.__SNAKE_DIAG || GS.status !== 'playing') { return }
		var inp = readInput()
		var noKey = !_anyMoveKey()
		_diag.frames++
		_diag.steps[steps] = (_diag.steps[steps] || 0) + 1
		if (alpha < _diag.alphaMin) { _diag.alphaMin = alpha }
		if (alpha > _diag.alphaMax) { _diag.alphaMax = alpha }
		// 真实帧间隔(ms)直方图 → 若分布宽/有尖峰 = 帧节奏抖动(stutter 来自环境/主线程)，非算法
		var ms = Math.round((frameDt || 0) * 1000)
		var db = ms < 12 ? '<12' : (ms <= 16 ? '12-16' : (ms <= 20 ? '16-20' : (ms <= 30 ? '20-30' : (ms <= 50 ? '30-50' : '>=50'))))
		_diag.dtHist[db] = (_diag.dtHist[db] || 0) + 1
		// 蛇头渲染位移(世界px)/帧 → 直行匀速本应集中某桶；出现 0(冻帧) 或 >=3(跳步) 即定位"一顿一顿"
		var sn = Registry.get('snake'), h = sn && sn.head
		if (h) {
			var hx = h.x + (h.x - h.px) * alpha, hy = h.y + (h.y - h.py) * alpha
			if (_diag.prevHx != null) {
				var d = Math.hypot(hx - _diag.prevHx, hy - _diag.prevHy)
				var hb = d < 0.05 ? '0(冻)' : (d < 0.5 ? '<0.5' : (d < 1.5 ? '0.5-1.5' : (d < 3 ? '1.5-3' : '>=3')))
				_diag.headHist[hb] = (_diag.headHist[hb] || 0) + 1
				if (d < 0.05) { _diag.freeze++ }
			}
			_diag.prevHx = hx; _diag.prevHy = hy
		}
		if (inp.active) {
			if (inp.src === 'mouse') { _diag.mouseFrames++; if (noKey) { _diag.mouseNoKey++ } }
			else if (inp.src === 'key') { _diag.keyFrames++ }
		}
		// 事件：鼠标自动转向刚生效（鼠标输入生效 且 无键盘）→ 直接告警（直行自动转向根因）
		var mnk = (inp.src === 'mouse' && inp.active && noKey)
		if (mnk && !_diag.prevMouseNoKey) {
			console.log('[DIAG] ⚠ 鼠标转向生效(无键盘): cursor.on=' + (cursor.on ? 1 : 0) + ' angle=' + (cursor.angle * 180 / Math.PI).toFixed(0) + '°' +
				(h ? (' 蛇头角=' + (h.angle * 180 / Math.PI).toFixed(0) + '°') : '') + ' ← 鼠标不动应直行、动鼠标才转向')
		}
		_diag.prevMouseNoKey = mnk
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (now - _diag.t >= 1000) {
			console.log('[DIAG-H] steps/frame=' + JSON.stringify(_diag.steps) +
				' alpha[' + _diag.alphaMin.toFixed(2) + ',' + _diag.alphaMax.toFixed(2) + ']' +
				' dtMs=' + JSON.stringify(_diag.dtHist) +
				' 头位移/帧=' + JSON.stringify(_diag.headHist) +
				' 冻帧=' + _diag.freeze +
				' input: key=' + _diag.keyFrames + ' mouse=' + _diag.mouseFrames + ' mouseWhileNoKey=' + _diag.mouseNoKey +
				' cursorOn=' + (cursor.on ? 1 : 0) +
				(h ? (' headAng=' + (h.angle * 180 / Math.PI).toFixed(1) + '°') : ''))
			_diag.t = now; _diag.frames = 0; _diag.steps = {}; _diag.keyFrames = 0; _diag.mouseFrames = 0; _diag.mouseNoKey = 0; _diag.alphaMin = 1; _diag.alphaMax = 0
			_diag.dtHist = {}; _diag.headHist = {}; _diag.freeze = 0; _diag.prevHx = null; _diag.prevHy = null
		}
	}
	var startEl = null
	Bus.on('snake:hurt', function () { if (HITSTOP_SEC > hitStopSec) { hitStopSec = HITSTOP_SEC } })
	Bus.on('enemy:phase', function () { if (HITSTOP_SEC > hitStopSec) { hitStopSec = HITSTOP_SEC } })
	Bus.on('combo:found', function () { if (HITSTOP_SEC > hitStopSec) { hitStopSec = HITSTOP_SEC } })
	Bus.on('enemy:die', function (d) { if (d && (d.kind === 'elite' || d.kind === 'boss') && HITSTOP_SEC > hitStopSec) { hitStopSec = HITSTOP_SEC } })
	Bus.on('core:run_reset', function () { hitStopSec = 0 })
	Bus.on('game:toggle_pause', togglePause)   // 暂停按钮/遮罩经 Bus 触发（事件名全小写过断言）

	// 全屏：安卓/桌面调 requestFullscreen 一键生效；iPhone 的 Safari 不支持 JS 全屏 → 提示「添加到主屏幕」
	var fullscreenToast = null
	function showFsToast(msg) {
		if (!fullscreenToast) {
			fullscreenToast = document.createElement('div')
			fullscreenToast.style.cssText = 'position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;padding:12px 18px;border-radius:12px;background:rgba(8,10,20,.94);color:#ffd76b;font:600 14px/1.5 system-ui;text-align:center;max-width:86vw;z-index:70;pointer-events:none'
			document.body.appendChild(fullscreenToast)
		}
		fullscreenToast.textContent = msg
		fullscreenToast.style.display = 'block'
		clearTimeout(fullscreenToast._t)
		fullscreenToast._t = setTimeout(function () { fullscreenToast.style.display = 'none' }, 3200)
	}
	function isStandalone() {   // 检测已从主屏打开的 PWA（iOS navigator.standalone / 标准 display-mode:standalone）
		var nm = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches
		var nav = global.navigator && global.navigator.standalone === true
		return !!nm || !!nav
	}
	function toggleFullscreen() {
		var doc = global.document, ua = (global.navigator && global.navigator.userAgent) || ''
		var isIOS = /iPhone|iPad|iPod/i.test(ua)
		var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement
		if (fsEl) { var ex = doc.exitFullscreen || doc.webkitExitFullscreen; if (ex) { try { ex.call(doc) } catch (e) {} } return }
		if (isIOS) {
			if (isStandalone()) { showFsToast('已在全屏（主屏模式）'); return }   // 已是从主屏打开：本就无网址栏全屏，不再误导「加到主屏」
			showFsToast('iPhone：请把本页「添加到主屏幕」，从主屏打开即可全屏无网址栏'); return }
		var el = doc.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen
		if (req) { try { req.call(el) } catch (e) { showFsToast('当前浏览器不支持全屏，可尝试「添加到主屏幕」') } }
		else { showFsToast('当前浏览器不支持全屏，可尝试「添加到主屏幕」') }
	}
	Bus.on('ui:fullscreen_toggle', toggleFullscreen)   // 全屏按钮（#ui-stage 内）经 Bus 触发

	function startIfMenu() {
		if (GS.status === 'menu') {
			if (startEl) { startEl.style.display = 'none' }
			var core = Registry.get('core'); if (core && core.resetRun) { core.resetRun() }
		}
	}

	function readInput() {
		// #3 修复：键盘优先——任一移动键按下即用键盘方向，鼠标悬停不再永久屏蔽 WASD；无按键时回退鼠标绝对瞄准
		var kx = 0, ky = 0
		if (keys.ArrowLeft || keys.a || keys.A) { kx -= 1 }
		if (keys.ArrowRight || keys.d || keys.D) { kx += 1 }
		if (keys.ArrowUp || keys.w || keys.W) { ky -= 1 }
		if (keys.ArrowDown || keys.s || keys.S) { ky += 1 }
		if (kx !== 0 || ky !== 0) { var l = Math.sqrt(kx * kx + ky * ky); return { x: kx / l, y: ky / l, active: true, src: 'key' } }
		// 绝对瞄准：鼠标/触摸在 canvas 上且未用键盘时优先，死区用 CONFIG.PLAYER.deadZoneRadius
		if (cursor.on) {
			// 空闲门限：指针停止移动超过 mouseSteerIdleSec 即视为空闲 → 不再持续跟踪光标，蛇保持当前角直行（治悬停常驻转向导致的舌头一顿一顿）
			var idle = (CONFIG.INPUT && CONFIG.INPUT.mouseSteerIdleSec) || 0.12
			if (GS.timeSec - cursor.lastMoveT <= idle) {
				// 朝「鼠标相对中心角度」转向：鼠标动=360°自由转向；鼠标停=超出空闲门限后本分支不命中 → 下方返回 inactive=直行
				return { x: Math.cos(cursor.angle), y: Math.sin(cursor.angle), active: true, src: 'mouse' }
			}
		}
		return { x: 0, y: 0, active: false, src: 'none' }
	}

	function callSys(name, dt) { var s = Registry.get(name); if (s && s.update) { s.update(dt) } }

	function togglePause() {   // 仅 playing↔paused 切换；菜单/死亡态忽略，不触碰任何 gameplay 数值
		if (GS.status === 'playing') { GS.status = 'paused' }
		else if (GS.status === 'paused') { GS.status = 'playing' }
	}

	function step(dt) {
		if (GS.status !== 'playing') { return }   // 暂停/菜单/死亡：冻结世界（render/ui 仍每帧跑，镜头与逻辑分辨率不变）
		var inp = readInput()
		var sn = Registry.get('snake'); if (sn && sn.setInput) { sn.setInput(inp.x, inp.y, inp.active) }
		GS.timeSec += dt; GS.frame++
		callSys('collision', dt)
		callSys('skill', dt)
		callSys('snake', dt)
		callSys('enemy', dt)
		callSys('pickup', dt)
		callSys('wave', dt)
		callSys('particle', dt)
	}

	var last = 0
	var _acc = 0            // 仿真时间累加器（固定 STEP 累加器）
	var _dl = { frames: 0, steps: 0, zeroFrames: 0, aMin: 9, aMax: -9, aSum: 0, eMin: 9, eMax: -9, eSum: 0, t0: 0 }   // DIAG_LOG 累积器（纯只读诊断）
	function frame(now) {
		global.requestAnimationFrame(frame)
		var cpu0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (!last) { last = now }
		var elapsed = (now - last) / 1000; last = now
		var frameDt = elapsed
		if (global.document && global.document.hidden) { return }   // 标签页隐藏：跳过 step+draw，last 已新鲜，恢复不追帧
		if (elapsed > 0.05) { elapsed = 0.05 }   // 大间隔封顶 50ms：防穿模/突发多子步
		// 2026-07-24b 移除 maxFps 封顶旋钮：封顶跳帧在 _acc 累加前 return，但 last 已推进 → 被跳帧的真实时间永久丢失 → 世界整体变慢(165Hz 封 60 ≈ 1/3 速)；且实测不封顶已稳 165，无存在必要
		global.__FRAME_DT = elapsed   // 本帧真实时间，供相机/屏震做帧率无关缓动
		// 固定 STEP 累加器：把真实时间累积、每满 STEP=1/60s 推进一次 step(STEP) → 仿真死锁 60Hz，与刷新率解耦
		// → 165Hz 屏每秒仅 ~60 次 step()（旧「原生帧时间步进」为 ~330 次 = 5.5× 过载，致持续掉帧回归）；渲染经 _ix/_iy 按 alpha=_acc/STEP 插值保丝滑
		var _steps = 0
		if (hitStopSec > 0 && GS.status === 'playing') {
			hitStopSec -= elapsed   // ⑥ 冻帧：时间制，消费真实时间、不推进模拟
		} else {
			_acc += elapsed
			var _nn = 0
			while (_acc >= STEP) {
				step(STEP); _acc -= STEP; _steps++
				if (++_nn > 4) { _acc = 0; break }   // 防极端卡顿后追帧螺旋：最多 4 步/帧，余量丢弃
			}
		}
		var alpha = _acc / STEP; if (alpha > 1) alpha = 1; if (alpha < 0) alpha = 0   // 渲染插值系数：prev→cur 平滑，激活 _ix/_iy（消 60Hz→165Hz 微抖）
		_diagTick(_steps, alpha, frameDt)
		// 诊断采样：始终累计（供性能日志面板 15_profiler 读 step 率），仅 __DIAG_LOG 时打印控制台明细；零行为影响
		_dl.frames++; _dl.steps += _steps; if (_steps === 0) _dl.zeroFrames++
		if (alpha < _dl.aMin) _dl.aMin = alpha; if (alpha > _dl.aMax) _dl.aMax = alpha; _dl.aSum += alpha
		if (frameDt < _dl.eMin) _dl.eMin = frameDt; if (frameDt > _dl.eMax) _dl.eMax = frameDt; _dl.eSum += frameDt
		var _n = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (!_dl.t0) _dl.t0 = _n
		if (_n - _dl.t0 >= 1000) {
			var _sec = (_n - _dl.t0) / 1000
			var _fps = _dl.frames / _sec, _stp = _dl.steps / _sec
			global.__STEP_RATE = _stp   // 暴露 step 率供性能日志面板读取（验证主循环回退：回退后应≈60，旧~330）
			if (window.__DIAG_LOG) {
				var _hint = _fps > 65 ? ' [固定STEP累加器:仿真锁60Hz(解耦刷新率)→165Hz屏仅~60 step/s(旧~330=过载回归已修)；alpha 插值保丝滑；0-step 趋零]' : (_dl.zeroFrames / _dl.frames > 0.05 ? ' [偶发0-step帧→实体忽停忽跳]' : '')
				console.log('[DIAG] fps=' + _fps.toFixed(1) + ' steps/s=' + _stp.toFixed(1) + ' 0step帧占比=' + (_dl.zeroFrames / _dl.frames * 100).toFixed(1) + '%  alpha[min/avg/max]=' + _dl.aMin.toFixed(3) + '/' + (_dl.aSum / _dl.frames).toFixed(3) + '/' + _dl.aMax.toFixed(3) + '  frameDt[ms min/avg/max]=' + (_dl.eMin * 1000).toFixed(2) + '/' + (_dl.eSum / _dl.frames * 1000).toFixed(2) + '/' + (_dl.eMax * 1000).toFixed(2) + _hint)
			}
			_dl.frames = 0; _dl.steps = 0; _dl.zeroFrames = 0; _dl.aMin = 9; _dl.aMax = -9; _dl.aSum = 0; _dl.eMin = 9; _dl.eMax = -9; _dl.eSum = 0; _dl.t0 = _n
		}
		var r = Registry.get('render'); if (r && r.draw) { r.draw(alpha) }
		var ui = Registry.get('ui'); if (ui && ui.update) { ui.update() }
		var cpu1 = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (r && r.setCpuMs) { r.setCpuMs(cpu1 - cpu0) }   // 诊断：整帧主线程 JS 耗时(step+draw+ui)，与 HUD「帧」(仅 draw 命令下发) 对比 → 定 GPU 合成 / DOM 回流 / 逻辑 瓶颈归属
		if (GS.status === 'playing' && global.PerfTier) {   // 自适应分级：仅 playing 态按真实负载换挡（菜单 fps 不代表实战负载）
			var rp = Registry.get('render'); var rfps = (rp && rp.diag) ? rp.diag().fps : 0
			global.PerfTier.tick(rfps, elapsed)
		}
	}

function buildStart(wrap) {
		startEl = document.createElement('div')
		startEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#fff;font:700 24px system-ui;background:rgba(8,10,20,0.6);z-index:15;cursor:pointer'
		var t = document.createElement('div'); t.textContent = '5.5 好玩基因融合版贪吃蛇'; startEl.appendChild(t)
		var sub = document.createElement('div'); sub.style.cssText = 'font-size:16px;opacity:.8'; sub.textContent = '点击 / 方向键(WASD) 开始 · ~ 调参'; startEl.appendChild(sub)
		wrap.appendChild(startEl)
		startEl.addEventListener('pointerdown', startIfMenu)
	}

	function boot() {
		var canvas = document.getElementById('game-canvas')
		var wrap = document.getElementById('game-wrap') || document.body
		if (!canvas) { Log.error('main：未找到 #game-canvas'); return }

		var render = Registry.get('render'); if (render && render.init) { render.init(canvas) }
		if (global.PerfTier && global.PerfTier.init) { global.PerfTier.init() }   // 自适应分级：render.init 已建好画布 → 按设备初判设初档
		var ui = Registry.get('ui'); if (ui && ui.init) { ui.init(document.getElementById('ui-stage'), document.getElementById('ui-full')) }
		buildStart(wrap)

		// 鼠标瞄准：只存「相对屏幕中心的角度」。相机仅平移不旋转 → 屏幕角 = 世界角。
		// 鼠标不动 = 角度恒定 → 蛇朝该角度对齐后直行；动鼠标 = 角度更新 → 360°自由转向。
		// （旧实现把世界点烘焙死 → 蛇前进时方向漂移、持续绕点转 = 自动转向 bug）
		function aimFromEvent(e) {
			var rect = canvas.getBoundingClientRect()
			var sx = CONFIG.GAME.logicalWidth / rect.width, sy = CONFIG.GAME.logicalHeight / rect.height
			var mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy
			var dx = mx - CONFIG.GAME.logicalWidth / 2, dy = my - CONFIG.GAME.logicalHeight / 2
			// 相对死区：仅当指针相对上次记录位置移动超过 mouseMoveDeadPx 才更新瞄准角（滤掉 OS/浏览器悬停微抖 → 头不再每帧微转 → 舌头不再一顿一顿）；
			// 抖动帧仅保持 on（不丢输入），不更新角度、不刷新 lastMoveT（空闲门限据此判定"鼠标已停"→ 蛇直行）
			var DEAD = (CONFIG.INPUT && CONFIG.INPUT.mouseMoveDeadPx) || 3
			if (cursor.lx != null && (mx - cursor.lx) * (mx - cursor.lx) + (my - cursor.ly) * (my - cursor.ly) < DEAD * DEAD) {
				cursor.on = true; cursor.touch = (e.pointerType === 'touch'); return
			}
			if (dx * dx + dy * dy > 9) { cursor.angle = Math.atan2(dy, dx) }   // 中心极小死区：避免 atan2(0,0) 抖动
			cursor.lx = mx; cursor.ly = my; cursor.lastMoveT = GS.timeSec
			cursor.on = true; cursor.touch = (e.pointerType === 'touch')
		}
		canvas.addEventListener('pointerdown', function (e) {
			if (e.cancelable) { e.preventDefault() }   // 阻 iOS 双击缩放/滚动默认手势
			startIfMenu()
			aimFromEvent(e)   // 点哪朝哪：菜单→playing 首帧即对齐点击方向
		})
		canvas.addEventListener('pointermove', function (e) {
			if (e.cancelable) { e.preventDefault() }
			aimFromEvent(e)
		})
		canvas.addEventListener('pointerleave', function () { cursor.on = false; cursor.lx = null; cursor.ly = null })
		canvas.addEventListener('pointerup', function () { cursor.on = false })       // 松手保持最后方向（蛇按末向续行，不丢输入）
		canvas.addEventListener('pointercancel', function () { cursor.on = false })
		global.addEventListener('orientationchange', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })   // 手机旋屏重算 backing/CSS 尺寸
		global.addEventListener('keydown', function (e) {
			keys[e.key] = true
			// 调试：像素吸附开关（2026-07-24 FPS 回归 A/B；实测已证伪=对卡顿无影响，保留仅作对照）按 B
			if (e.key === 'b' || e.key === 'B') { window.__NO_DIR1 = !(window.__NO_DIR1 !== false); _statusBanner() }
			// 调试：重量级特效开关（2026-07-24 实测定因：白爆(T1)+火墙(T3)是 GPU 填充率尖峰主因）按 V
			if (e.key === 'v' || e.key === 'V') { _toggleVfx(); _statusBanner() }
			if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return }
			if (e.key !== '`' && e.key !== '~') { startIfMenu() }
		})
		function _toggleVfx() {   // 一键关掉最贵的两种 GPU 填充：白爆(T1=suppressWhiteBurst) + 火墙/余烬(T3=suppressFire)，并锁 MED 档防摆动；纯诊断用，不动数值结构
			var pt = global.PerfTier
			if (!pt) { return }
			window.__NO_VFX = !window.__NO_VFX
			if (window.__NO_VFX) {
				pt._savedAuto = pt.auto
				pt._savedWB = pt.suppressWhiteBurst
				pt._savedFire = pt.suppressFire
				pt._savedTier = pt.tier
				if (pt.forceTier) { pt.forceTier('MED') }   // 锁 MED（auto=false）：世界缩放适中且不随 FPS 抖动
				pt.suppressWhiteBurst = true                 // 强制关白爆（MED 默认开，这里覆盖）
				pt.suppressFire = true                       // 强制关火墙/余烬
			} else {
				if (pt._savedTier && pt.forceTier) { pt.forceTier(pt._savedTier) }
				pt.auto = !!pt._savedAuto
				pt.suppressWhiteBurst = !!pt._savedWB
				pt.suppressFire = !!pt._savedFire
			}
		}
		function _statusBanner() {   // 屏幕顶部横幅：同时显示像素吸附(B) 与 重量特效(V) 开关，非技术用户也能看懂
			var el = document.getElementById('snapBanner')
			if (!el) { el = document.createElement('div'); el.id = 'snapBanner'; el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;padding:4px 14px;border-radius:8px;font:700 13px system-ui;color:#fff;pointer-events:none;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4)'; document.body.appendChild(el) }
			var snap = window.__NO_DIR1 !== false
			var vfx = !window.__NO_VFX
			el.textContent = '像素' + (snap ? '吸附开' : '吸附关') + '(B) ｜ 重量特效' + (vfx ? '开' : '关·应流畅') + '(V)'
			el.style.background = vfx ? 'rgba(40,180,90,.92)' : 'rgba(220,60,60,.92)'
		}
		_statusBanner()   // 启动即显示当前状态
		global.addEventListener('keyup', function (e) { keys[e.key] = false })
		global.addEventListener('resize', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })

		Log.info('main 就绪：循环启动（固定 STEP 累加器 ' + STEP.toFixed(4) + 's · 锁 60Hz 仿真 + 渲染插值 · 不封顶跑满刷新率）')
		global.requestAnimationFrame(frame)
	}

	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot) } else { boot() }

})(typeof window !== 'undefined' ? window : this)

	// 📝 修改日志
	// 2025-07-10 · 鼠标绝对瞄准 · joy 相对摇杆 → cursor 世界坐标绝对瞄准 + deadZone(CONFIG.PLAYER.deadZoneRadius=12) + pointermove 免按住 · 不动 §9
	// 2026-07-20 · 性能根治第二轮 · 主循环：大间隔(>0.1s，卡顿/恢复/切后台)直接丢弃追帧(原 clamp 0.25 仍爆 ~15 步)，+ 标签页隐藏时跳过 step/draw 保持 last 新鲜 → 治最小化再点开卡顿；不动 core/collision
	// 2026-07-20 · 性能根治第六轮(还原) · pointermove 还原 1:1 世界坐标反算（视图缩放 worldScale 已移除，无需除）
	// 2026-07-20 · 视图缩放恢复 · pointermove 重新反除 worldScale（render.getWorldScale 取当前缩放），缩放下飞镖/锁敌瞄准点仍对准世界坐标
	// 2026-07-21 · overdraw 关火修复 · tick 读取信号由 render.diag().dc.fill(绘制调用次数,量级200~400) 改为 render.diag().overdraw/1000(px²→k)，与 config PERF.fillDownThreshold=320(overdraw≥~320k) 语义对齐；修「误关火+永久卡死」bug：旧版把同屏实体多(高 fill 调用数)当填充率过载关火，且空载基线 fill≈250~300 致 emaFill 永不<256k→火永久关死；火墙为单 path+2 stroke 不贡献 fill，真实瓶颈在粒子/白爆/爆环/光束，现已正确度量；阈值默认值/档位逻辑/二进制关火结构不动
