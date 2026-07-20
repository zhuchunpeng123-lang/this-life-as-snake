;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var STEP = 1 / CONFIG.GAME.fps
	var HITSTOP_FRAMES = CONFIG.COMBAT.hitStopFrames   // ⑥ 命中冻帧（真理源 §2.2 hitStop 2帧）
	var hitStop = 0

	var keys = {}, cursor = { on: false, wx: 0, wy: 0 }
	var startEl = null
	Bus.on('snake:hurt', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('enemy:phase', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('combo:found', function () { if (HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('enemy:die', function (d) { if (d && (d.kind === 'elite' || d.kind === 'boss') && HITSTOP_FRAMES > hitStop) { hitStop = HITSTOP_FRAMES } })
	Bus.on('core:run_reset', function () { hitStop = 0 })
	Bus.on('game:toggle_pause', togglePause)   // 暂停按钮/遮罩经 Bus 触发（事件名全小写过断言）

	function startIfMenu() {
		if (GS.status === 'menu') {
			if (startEl) { startEl.style.display = 'none' }
			var core = Registry.get('core'); if (core && core.resetRun) { core.resetRun() }
		}
	}

	function readInput() {
		// 绝对瞄准：鼠标在 canvas 上时优先，死区用 CONFIG.PLAYER.deadZoneRadius
		if (cursor.on) {
			var sn = Registry.get('snake'), h = sn && sn.head
			if (h) {
				var dx = cursor.wx - h.x, dy = cursor.wy - h.y
				var len = Math.sqrt(dx * dx + dy * dy)
				if (len > CONFIG.PLAYER.deadZoneRadius) { return { x: dx / len, y: dy / len, active: true } }
			}
			return { x: 0, y: 0, active: false }
		}
		var kx = 0, ky = 0
		if (keys.ArrowLeft || keys.a || keys.A) { kx -= 1 }
		if (keys.ArrowRight || keys.d || keys.D) { kx += 1 }
		if (keys.ArrowUp || keys.w || keys.W) { ky -= 1 }
		if (keys.ArrowDown || keys.s || keys.S) { ky += 1 }
		if (kx !== 0 || ky !== 0) { var l = Math.sqrt(kx * kx + ky * ky); return { x: kx / l, y: ky / l, active: true } }
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
		var ui = Registry.get('ui'); if (ui && ui.init) { ui.init(wrap) }
		buildStart(wrap)

		canvas.addEventListener('pointerdown', function (e) { startIfMenu() })
		canvas.addEventListener('pointermove', function (e) {
			var rect = canvas.getBoundingClientRect()
			var sx = CONFIG.GAME.logicalWidth / rect.width, sy = CONFIG.GAME.logicalHeight / rect.height   // contain 缩放：CSS px → 逻辑 px 反算（瞄准点对齐缩放后画布）
			var mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy
	var render = Registry.get('render'); var cam = render.camera; var ws = (render && render.getWorldScale) ? render.getWorldScale() : 1
	cursor.wx = cam.x + (mx - CONFIG.GAME.logicalWidth / 2) / ws   // 世界坐标 = cam + (逻辑点-中心)/worldScale；视图缩放后瞄准点须反除缩放，否则飞镖/锁敌偏位
	cursor.wy = cam.y + (my - CONFIG.GAME.logicalHeight / 2) / ws
		cursor.on = true
		})
		canvas.addEventListener('pointerleave', function () { cursor.on = false })
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
