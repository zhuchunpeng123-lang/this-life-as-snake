;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var canvas = null   // 模块级：boot() 内赋值；摇杆/瞄准等模块级函数均依赖它取画布几何（此前误写为 boot() 局部 var → 全模块函数 ReferenceError: canvas is not defined，摇杆彻底失效）
	// —— 运行版本横幅：控制台见此行即代表新包已加载；若仍是旧版本号（20260723d 或更早）说明浏览器仍在喂旧缓存 ——
	console.log('%c[snake55] build v=20260724j（修"一进游戏卡暂停/只在点击后跑"：根因=updateJoyVisual 被误定义在 boot() 内的嵌套作用域，而 frame() 在模块级每帧调用它→playing 且未激活摇杆时抛 ReferenceError(307行在仿真循环前)→仿真永不执行像卡住，仅点击激活摇杆(joy.active=true 跳过该分支)才跑；提升 updateJoyVisual 为模块级函数修复。零改底层/§9）— 看到此行=新代码生效；若版本号更旧=缓存未清，请清站点数据/强刷', 'color:#5f9;font-weight:bold')
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
	// —— 固定锚点虚拟摇杆状态（需求 A 重做；仅输入层，零改 06_snake/core/collision/§9）——
	// dx/dy=指针相对「固定锚点」的逻辑位移(输入用，atan2→目标朝向)；pid=锁定的首根 pointerId(6② 多指不重置锚点)
	// 固定锚点：右侧安全区(INPUT.touch.baseFracX/Y，默认 0.84)，底座永不跑到屏幕中央盖住蛇（解决"乱窜/遮挡"）；PC 右手/手机右拇指握持
	var joy = { active: false, dx: 0, dy: 0, pid: null }
	var _gmOpen = false   // GM 编辑器打开标志：经 Bus('editor:toggle') 与 13_editor 内部 open 同步翻转（零改 editor）
	var joyBase = null, joyKnob = null   // 摇杆视觉 DOM（固定锚点、常驻淡显；pointer-events:none 不吞 UI 点击）
	// 6① 挂起：任一模态/面板打开时摇杆不接管（不误转向、不吞 UI 点击）——菜单 / 3选1 / 暂停 / 结算 / GM
	function inputBlocked() { return GS.status !== 'playing' || _gmOpen }
	function joyRelease() {
		joy.active = false; joy.pid = null; joy.dx = 0; joy.dy = 0
		if (joyKnob) { joyKnob.style.opacity = '0' }   // 底座常驻淡显由 frame() 驱动；仅推钮归零
	}
	// 固定锚点屏幕坐标（占画布显示区比例，随屏缩放，永不居中）
	function joyBaseScreen() {
		var r = canvas.getBoundingClientRect()
		var jc = (CONFIG.INPUT && CONFIG.INPUT.touch) || {}
		return { x: r.left + r.width * (jc.baseFracX != null ? jc.baseFracX : 0.84), y: r.top + r.height * (jc.baseFracY != null ? jc.baseFracY : 0.80) }
	}
	// 固定锚点逻辑坐标（输入死区判定用，与屏幕锚点同源）
	function joyBaseLogical() {
		var r = canvas.getBoundingClientRect()
		var s = joyBaseScreen()
		return { x: (s.x - r.left) * (CONFIG.GAME.logicalWidth / r.width), y: (s.y - r.top) * (CONFIG.GAME.logicalHeight / r.height) }
	}
	// 摇杆视觉定位（模块级：frame() 在模块作用域常驻调用，必须提升到 boot() 外，否则 ReferenceError: updateJoyVisual is not defined → 一进游戏卡暂停）
	function updateJoyVisual(clientX, clientY) {
		if (!joyBase) { return }
		var rect = canvas.getBoundingClientRect()
		var scale = rect.width / CONFIG.GAME.logicalWidth
		var jc = (CONFIG.INPUT && CONFIG.INPUT.touch) || {}
		var baseR = (jc.baseRadius || 72) * scale
		var knobR = (jc.knobRadius || 30) * scale
		var travel = (jc.travelFrac != null ? jc.travelFrac : 0.6) * baseR   // 推钮最大行程(占 baseRadius 比例，纯视觉)
		var bs = joyBaseScreen()
		var dxs = clientX - bs.x, dys = clientY - bs.y
		var dist = Math.hypot(dxs, dys)
		var ang = Math.atan2(dys, dxs)
		var t = dist > 1 ? Math.min(dist, travel) : 0   // 推柄视觉位移=方向×min(手指位移,maxDef)；方向恒等于手指向量，增益仅视觉(6②/红线)
		joyBase.style.width = (baseR * 2) + 'px'; joyBase.style.height = (baseR * 2) + 'px'
		joyBase.style.left = bs.x + 'px'; joyBase.style.top = bs.y + 'px'
		joyKnob.style.width = (knobR * 2) + 'px'; joyKnob.style.height = (knobR * 2) + 'px'
		joyKnob.style.left = bs.x + 'px'; joyKnob.style.top = bs.y + 'px'
		joyKnob.style.transform = 'translate(-50%,-50%) translate(' + (Math.cos(ang) * t) + 'px,' + (Math.sin(ang) * t) + 'px)'
	}
	Bus.on('editor:toggle', function () { _gmOpen = !_gmOpen; if (_gmOpen) { joyRelease() } })   // GM 面板打开即挂起摇杆（不误转向/不吞点击），与 13_editor 内部 open 同步
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
			// 不 display:none：隐藏元素会触发浏览器对本手势 pointer 的 pointercancel，把刚激活的摇杆瞬间释放（移动端触摸隐式捕获尤甚）→ 点开始后按住拖动全部失效
			// 改为透明+不可交互，元素仍留 DOM 不触发 cancel；下一拍(手势已离开/已捕获到 canvas)再彻底移除
			if (startEl) { startEl.style.pointerEvents = 'none'; startEl.style.opacity = '0'; setTimeout(function () { if (startEl) { startEl.style.display = 'none' } }, 400) }
			var core = Registry.get('core'); if (core && core.resetRun) { core.resetRun() }
		}
	}

	function readInput() {
		// #3 修复：键盘优先——任一移动键按下即用键盘方向，鼠标悬停不再永久屏蔽 WASD
		var kx = 0, ky = 0
		if (keys.ArrowLeft || keys.a || keys.A) { kx -= 1 }
		if (keys.ArrowRight || keys.d || keys.D) { kx += 1 }
		if (keys.ArrowUp || keys.w || keys.W) { ky -= 1 }
		if (keys.ArrowDown || keys.s || keys.S) { ky += 1 }
		if (kx !== 0 || ky !== 0) { var l = Math.sqrt(kx * kx + ky * ky); return { x: kx / l, y: ky / l, active: true, src: 'key' } }
		// 固定锚点摇杆（touch/鼠标/pen）：方向 = 指针相对「固定锚点(右侧安全区)」位移向量（底座永不居中→不盖蛇、不随点击乱窜；触摸端边缘漂移结构性消除，6③/6⑤）；
		// 死区内(l<deadZone)不转向、蛇沿当前方向直行；方向恒等于手指向量，摇杆距离不改速度（真源 §1 恒速 200）
		if (joy.active && !inputBlocked()) {
			var jl = Math.hypot(joy.dx, joy.dy)
			var jdz = (CONFIG.INPUT && CONFIG.INPUT.touch && CONFIG.INPUT.touch.deadZone) || 18
			if (jl >= jdz) {
				var ja = Math.atan2(joy.dy, joy.dx)
				return { x: Math.cos(ja), y: Math.sin(ja), active: true, src: 'joy' }   // 仅设目标朝向；限速转向由 06_snake angleLerp 负责（红线不可破）
			}
			return { x: 0, y: 0, active: false, src: 'joy' }   // 死区内：不转向、直行（鼠标/触摸统一走摇杆，不与旧绝对瞄准混用）
		}
		// 鼠标/笔悬停转向（桌面）：恢复「改摇杆前」灵敏手感——移动鼠标即转向、无需按住（键盘>摇杆>鼠标悬停>直行）
		if (cursor.on && !cursor.touch && !inputBlocked()) {
			return { x: Math.cos(cursor.angle), y: Math.sin(cursor.angle), active: true, src: 'mouse' }
		}
		// 无键盘/摇杆/鼠标悬停输入 → 蛇按当前方向直行（虚拟摇杆模型）
		return { x: 0, y: 0, active: false, src: 'none' }
	}

	function callSys(name, dt) { var s = Registry.get(name); if (s && s.update) { s.update(dt) } }

	function togglePause() {   // 仅 playing↔paused 切换；菜单/死亡态忽略，不触碰任何 gameplay 数值
		joyRelease()   // 6① 暂停即挂起摇杆（不误转向/不残留视觉）
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
		if (GS.status !== 'playing' && joy.active) { joyRelease() }   // 6① 任何非 playing 模态(3选1/暂停/结算/菜单)弹出即挂起摇杆（不误转向/不吞点击）
		// 固定锚点摇杆常驻：playing 且未开 GM → 底座淡显(常驻提示操作区)，激活时转亮；非 playing/GM → 整体隐藏（含推钮）
		var _jc = (CONFIG.INPUT && CONFIG.INPUT.touch) || {}
		var _showBase = (GS.status === 'playing' && !_gmOpen)
		if (joyBase) { joyBase.style.opacity = _showBase ? (joy.active ? String(_jc.activeOpacity != null ? _jc.activeOpacity : 0.96) : String(_jc.idleOpacity != null ? _jc.idleOpacity : 0.5)) : '0' }
		if (!_showBase && joyKnob) { joyKnob.style.opacity = '0' }
		if (_showBase && !joy.active) { var _bs = joyBaseScreen(); updateJoyVisual(_bs.x, _bs.y) }   // 常驻(未激活)时也把底座钉在固定锚点，否则停在初始 (0,0) 左上角
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
		canvas = document.getElementById('game-canvas')   // 赋值模块级 canvas（不再 var，避免局部遮蔽导致下方摇杆函数拿不到）
		var wrap = document.getElementById('game-wrap') || document.body
		if (!canvas) { Log.error('main：未找到 #game-canvas'); return }

		var render = Registry.get('render'); if (render && render.init) { render.init(canvas) }
		if (global.PerfTier && global.PerfTier.init) { global.PerfTier.init() }   // 自适应分级：render.init 已建好画布 → 按设备初判设初档
		var ui = Registry.get('ui'); if (ui && ui.init) { ui.init(document.getElementById('ui-stage'), document.getElementById('ui-full')) }
		buildStart(wrap)

		// —— 浮动虚拟摇杆视觉（需求 A；鼠标/触摸/pen 按下即激活、松手淡出；pointer-events:none 不拦截 UI 点击，满足 6①）——
		function buildJoy() {
			if (joyBase) { return }
			joyBase = document.createElement('div'); joyBase.id = 'joy-base'
			joyBase.style.cssText = 'position:fixed;left:0;top:0;border-radius:50%;transform:translate(-50%,-50%);' +
				'background:radial-gradient(circle at 50% 50%, rgba(36,46,74,.30) 0%, rgba(12,18,34,.55) 68%, rgba(8,12,24,.62) 100%);' +
				'border:2px solid rgba(77,255,195,.34);' +
				'box-shadow:0 0 26px rgba(39,201,138,.22), inset 0 0 22px rgba(0,0,0,.5), inset 0 0 0 7px rgba(77,255,195,.05);' +
				'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .2s;pointer-events:none;z-index:14'
			joyKnob = document.createElement('div'); joyKnob.id = 'joy-knob'
			joyKnob.style.cssText = 'position:fixed;left:0;top:0;border-radius:50%;transform:translate(-50%,-50%);' +
				'background:radial-gradient(circle at 34% 28%, #d4fff2 0%, #4dffc3 38%, #27c98a 72%, #169a6b 100%);' +
				'border:1px solid rgba(255,255,255,.28);' +
				'box-shadow:0 6px 18px rgba(0,0,0,.55), 0 0 22px rgba(77,255,195,.6), inset 0 3px 8px rgba(255,255,255,.45), inset 0 -4px 8px rgba(0,0,0,.25);' +
				'opacity:0;transition:opacity .2s, transform .045s linear;pointer-events:none;z-index:15'
			document.body.appendChild(joyBase); document.body.appendChild(joyKnob)
		}
		function showJoy() {
			if (!joyBase) { return }
			var jc = (CONFIG.INPUT && CONFIG.INPUT.touch) || {}
			joyBase.style.opacity = String(jc.activeOpacity != null ? jc.activeOpacity : 0.96)
			joyKnob.style.opacity = '1'
			var bs = joyBaseScreen()
			updateJoyVisual(bs.x, bs.y)   // 推钮初始居中（未拖动）
		}
		buildJoy()

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
		// 固定锚点摇杆：方向 = 指针相对「固定锚点(左下角安全区)」向量；touch/鼠标/pen 均走摇杆；旧绝对瞄准已移除
		function toLogical(e) {
			var rect = canvas.getBoundingClientRect()
			var sx = CONFIG.GAME.logicalWidth / rect.width, sy = CONFIG.GAME.logicalHeight / rect.height
			return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
		}
		function joyDown(e) {
			startIfMenu()                                // 点「开始/再来一局」先翻 playing，使本次按压的余下拖动即可转向（修开始遮罩吞 pointerdown→首手势摇杆不激活/蛇不转向）
			if (inputBlocked()) { return }             // 6① 模态打开不接管（翻态后仍被挡则不激活）
			if (joy.active) { return }                  // 6② 已锁定首指，多指忽略（不重置锚点）
			// HUD 按钮(暂停/全屏/GM，均在 #ui-stage 内且 pointer-events:auto)点击不误触摇杆；游戏画布/开始/结算遮罩不在 #ui-stage → 正常激活
			if (GS.status === 'playing' && e.target && e.target.closest && e.target.closest('#ui-stage')) { return }
			var p = toLogical(e), b = joyBaseLogical()
			joy.dx = p.x - b.x; joy.dy = p.y - b.y     // 方向=指针相对「固定锚点」向量（底座永不居中，不盖蛇）
			joy.active = true; joy.pid = e.pointerId
			try { canvas.setPointerCapture(e.pointerId) } catch (_) {}   // 捕获到稳定元素 canvas：即便开始遮罩被隐藏也不触发 pointercancel，首手势拖动可持续转向（移动端关键）
			showJoy()
		}
		function joyMove(e) {
			if (!joy.active || e.pointerId !== joy.pid) { return }   // 6② 仅锁定指更新位移，多指不重置锚点
			if (inputBlocked()) { joyRelease(); return }            // 模态中途弹出（如 3选1）→ 立即挂起
			var p = toLogical(e), b = joyBaseLogical()
			joy.dx = p.x - b.x; joy.dy = p.y - b.y
			updateJoyVisual(e.clientX, e.clientY)
		}
		function joyUp(e) {
			if (e.pointerId !== joy.pid) { return }   // 6② 仅锁定指释放，多指不误释放
			joyRelease()
		}
		// 摇杆监听挂 window（非 canvas）：开始遮罩/结算遮罩等 UI 层不再吞 pointerdown，首手势即可激活摇杆并转向（修「进游戏摇杆不出现/蛇不转向」）；HUD 按钮点击仍走各自 handler 不受影响
		global.addEventListener('pointerdown', function (e) {
			if (e.target === canvas && e.cancelable) { e.preventDefault() }   // 仅画布区阻 iOS 双击缩放/滚动；HUD 按钮不 preventDefault 保证 click 正常
			aimFromEvent(e)                             // 菜单首帧对齐点击方向（保留旧行为；正常态由摇杆接管）
			joyDown(e)                                  // 任意指针(鼠标/触摸/pen)按下即出浮动摇杆（6⑥ 全屏激活；落点=锚点）；joyDown 内先 startIfMenu 翻态
		})
		global.addEventListener('pointermove', function (e) {
			if (joy.active && e.pointerId === joy.pid) {
				if (e.cancelable) { e.preventDefault() }   // 仅在拖动摇杆时阻滚动/缩放，避免误吞 HUD 交互
				if (inputBlocked()) { joyRelease() } else { joyMove(e) }   // 按住态更新摇杆位移；模态中途弹出即挂起
				return
			}
			// 桌面鼠标/笔：悬停即转向，恢复「改摇杆前」灵敏手感（无需按住）；触摸走摇杆(joy 分支)，不抢
			if (e.pointerType && e.pointerType !== 'touch') { aimFromEvent(e) }
		})
		global.addEventListener('pointerup', function (e) { cursor.on = false; joyUp(e) })       // 松手保持最后方向（蛇按末向续行，不丢输入）
		global.addEventListener('pointercancel', function (e) { cursor.on = false; joyUp(e) })
		global.addEventListener('orientationchange', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })   // 手机旋屏重算 backing/CSS 尺寸
		global.addEventListener('keydown', function (e) {
			keys[e.key] = true
			// 调试：像素吸附开关（2026-07-24 FPS 回归 A/B；实测已证伪=对卡顿无影响，保留仅作对照）按 B
			if (e.key === 'b' || e.key === 'B') { window.__NO_DIR1 = !(window.__NO_DIR1 !== false) }   // 像素吸附诊断开关（仅改渲染，不再弹顶部横幅，避免遮挡波次条）
			// 调试：重量级特效开关（2026-07-24 实测定因：白爆(T1)+火墙(T3)是 GPU 填充率尖峰主因）按 V
			if (e.key === 'v' || e.key === 'V') { _toggleVfx() }   // 重量级特效诊断开关（仅改渲染，不再弹顶部横幅）
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
	// 2026-07-24e · 需求 A 摇杆重做：固定锚点(左下角安全区,INPUT.touch.baseFracX/Y)常驻表盘，方向=指针相对固定锚点向量→底座永不居中乱窜/盖蛇；传统手游质感(外环表盘+内嵌推钮+辉光，去掉连线)，常驻淡显(idleOpacity)/激活变亮(activeOpacity)；尺寸 baseRadius/knobRadius/travelFrac 随屏缩放；仅 14_main 输入层 + 02_config.INPUT.touch 表现值，06_snake/core/collision/§9 零改动。键盘>摇杆(鼠标/触摸/pen 按住即出)>移除旧鼠标悬停绝对瞄准；死区(deadZone=18)内不转向直行；摇杆距离不改速度(真源 §1 恒速 200)；限速转向仍由 06_snake angleLerp 负责(红线)；6① 任一模态(菜单/3选1/暂停/结算/GM)打开即挂起(底座隐藏)，不误转向/不吞 UI 点击；6② 锁首根 pointerId 多指不重置锚点；GM 打开标志经 Bus('editor:toggle') 与 13_editor 内部 open 同步(零改 editor)
	// 2026-07-24f · 修「进游戏摇杆不出现/按住移动蛇不转向」：根因=开始遮罩 startEl 吞掉首下 pointerdown(canvas 监听收不到)，且点开始与拖动常是同一手势→joy.active 永 false→拖动被拦、底座只剩 idleOpacity0.26 几乎不可见。修：摇杆事件改挂 window(遮罩不再吞)、joyDown 内先 startIfMenu 翻 playing 使首手势余下拖动可转向、#ui-stage 内 HUD 按钮点击不误触摇杆、idleOpacity0.26→0.5 常驻清晰。仅 14_main 输入层 + 02_config.INPUT.touch.idleOpacity，底层零改动。
	// 2026-07-24g · 对抗性复查真因：build f 仍「点开始后按住拖动不转向」= 首手势 pointerdown 命中开始遮罩→startIfMenu 把 startEl display:none→浏览器对「被隐藏的目标」立即派发 pointercancel→joyUp 释放刚激活的摇杆。修：startIfMenu 不再 display:none(改透明+pointer-events:none，下一拍再移除)；joyDown 对稳定元素 canvas setPointerCapture，遮罩隐藏也不丢手势；摇杆锚点 baseFracX 0.16→0.84(用户要求右侧：PC 右手/手机右拇指)；idleOpacity 0.5 常驻可见。仅 14_main 输入层 + 02_config.INPUT.touch.baseFracX，底层零改动。
	// 2026-07-24h · 真因（终于定位）：控制台稳定报 `Uncaught ReferenceError: canvas is not defined @14_main:133`——canvas 在 boot() 内用 `var` 局部声明，而 joyBaseScreen/joyBaseLogical/updateJoyVisual/aimFromEvent/toLogical/joyDown 及 window pointerdown handler 全部在模块作用域引用它→模块函数拿不到→每次 pointerdown 直接抛异常 handler 中断→摇杆永不激活、蛇不转向（build e/f/g 全坏皆因此，遮罩/pointercancel 是误诊）。修：canvas 提升为模块级变量(boot 内改赋值不 var)，所有引用复活；并修 idle 常驻只设 opacity 没定位→钉到固定锚点(否则停左上角 0,0)。仅 14_main 输入层，底层零改动。
	// 2026-07-24i · 修"按住才动/松手暂停/不灵敏"（用户实测反馈）：根因=build e 把 readInput 的鼠标悬停转向分支删了，只剩键盘+摇杆两个源；松手后 joy.active=false→转向输入归零→蛇只按当前方向直行(恒速前进不受 active 门控)→用户误以为"暂停/卡住"；且必须按住+相对右下角远锚点大动作才转向，比原"鼠标移动即转向"钝。修：① 桌面鼠标/笔恢复悬停即转向(pointermove 对非 touch 调 aimFromEvent + readInput 增 cursor 分支，键盘>摇杆>鼠标悬停>直行)，无需按住即灵敏；② 触屏/笔仍走右置摇杆(手机不受影响)；③ 摇杆死区 18→12(02_config.INPUT.touch.deadZone)更跟手。仅 14_main 输入层 + 02_config.INPUT.touch.deadZone，底层零改动。
	// 2026-07-24j · 修"一进游戏卡暂停/只在点击后跑"：根因=updateJoyVisual 误定义在 boot() 内嵌套作用域，而 frame() 在模块级每帧调用它(307行，在仿真循环 319 行之前)；playing 态且未激活摇杆时(!joy.active)每帧抛 ReferenceError→仿真循环永不执行→蛇不前进像卡住/暂停，仅点击激活摇杆(joy.active=true 跳过该分支)才跑。修：将 updateJoyVisual 提升为模块级函数(与 joyBaseScreen/joyBaseLogical 同级)，所有引用复活，崩溃消除→playing 态持续仿真。零改底层/§9/02_config。
