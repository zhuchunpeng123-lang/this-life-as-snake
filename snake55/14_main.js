;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var STEP = 1 / CONFIG.GAME.fps
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
		maxBackW: 1600, worldScale: 0.8, maxParticles: 240, maxTexts: 48, spawnBudget: 120,
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
	var HITSTOP_FRAMES = CONFIG.COMBAT.hitStopFrames   // ⑥ 命中冻帧（真理源 §2.2 hitStop 2帧）
	var hitStop = 0

	var keys = {}, cursor = { on: false, wx: 0, wy: 0, touch: false }
	var startEl = null
	Bus.on('snake:hurt', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('enemy:phase', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('combo:found', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('enemy:die', function (d) { if (d && (d.kind === 'elite' || d.kind === 'boss') && HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('core:run_reset', function () { hitStop = 0 })
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
		if (kx !== 0 || ky !== 0) { var l = Math.sqrt(kx * kx + ky * ky); return { x: kx / l, y: ky / l, active: true } }
		// 绝对瞄准：鼠标/触摸在 canvas 上且未用键盘时优先，死区用 CONFIG.PLAYER.deadZoneRadius
		if (cursor.on) {
			var sn = Registry.get('snake'), h = sn && sn.head
			if (h) {
				var dx = cursor.wx - h.x, dy = cursor.wy - h.y
				var len = Math.sqrt(dx * dx + dy * dy)
				var dz = cursor.touch ? CONFIG.INPUT.touch.deadZone : CONFIG.PLAYER.deadZoneRadius
				if (len > dz) { return { x: dx / len, y: dy / len, active: true } }
			}
			return { x: 0, y: 0, active: false }
		}
		return { x: 0, y: 0, active: false }
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

	var last = 0, acc = 0
	function frame(now) {
		global.requestAnimationFrame(frame)
		var cpu0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (!last) { last = now }
		var elapsed = (now - last) / 1000; last = now
		if (global.document && global.document.hidden) { acc = 0; return }   // 标签页隐藏(最小化/切后台)：跳过 step+draw，保持 last 新鲜，恢复瞬间不追帧爆发（治最小化再点开卡顿）
		if (elapsed > 0.1) { elapsed = 0; acc = 0 }   // 大间隔(卡顿/恢复/切后台残帧)：直接丢弃追帧，避免 while 连跑 ~15 步突发 stutter（原 clamp 0.25 仍会爆 15 步）
		else { acc += elapsed }
		while (acc >= STEP) {
			if (hitStop > 0 && GS.status === 'playing') { hitStop--; acc -= STEP; continue }   // ⑥ 冻帧：仅 playing 态消费时间不推进
			step(STEP); acc -= STEP
		}
		var r = Registry.get('render'); if (r && r.draw) { r.draw() }
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

		function aimFromEvent(e) {   // 触控/鼠标统一：屏幕坐标 → 世界瞄准点（contain 反算 + worldScale 反除）
			var rect = canvas.getBoundingClientRect()
			var sx = CONFIG.GAME.logicalWidth / rect.width, sy = CONFIG.GAME.logicalHeight / rect.height
			var mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy
			var r = Registry.get('render'); var cam = r && r.camera; var ws = (r && r.getWorldScale) ? r.getWorldScale() : 1
			cursor.wx = cam.x + (mx - CONFIG.GAME.logicalWidth / 2) / ws
			cursor.wy = cam.y + (my - CONFIG.GAME.logicalHeight / 2) / ws
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
		canvas.addEventListener('pointerleave', function () { cursor.on = false })
		canvas.addEventListener('pointerup', function () { cursor.on = false })       // 松手保持最后方向（蛇按末向续行，不丢输入）
		canvas.addEventListener('pointercancel', function () { cursor.on = false })
		global.addEventListener('orientationchange', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })   // 手机旋屏重算 backing/CSS 尺寸
		global.addEventListener('keydown', function (e) { keys[e.key] = true; if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return } if (e.key !== '`' && e.key !== '~') { startIfMenu() } })
		global.addEventListener('keyup', function (e) { keys[e.key] = false })
		global.addEventListener('resize', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })

		Log.info('main 就绪：循环启动（fixed step ' + STEP.toFixed(4) + 's）')
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
