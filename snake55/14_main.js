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

	function step(dt) {
		var inp = readInput()
		var sn = Registry.get('snake'); if (sn && sn.setInput) { sn.setInput(inp.x, inp.y, inp.active) }
		if (GS.status === 'playing') { GS.timeSec += dt; GS.frame++ }
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
		if (!last) { last = now }
		var elapsed = (now - last) / 1000; last = now
		if (elapsed > 0.25) { elapsed = 0.25 }   // 防卡顿后追帧爆炸
		acc += elapsed
		while (acc >= STEP) {
			if (hitStop > 0 && GS.status === 'playing') { hitStop--; acc -= STEP; continue }   // ⑥ 冻帧：仅 playing 态消费时间不推进
			step(STEP); acc -= STEP
		}
		var r = Registry.get('render'); if (r && r.draw) { r.draw() }
		var ui = Registry.get('ui'); if (ui && ui.update) { ui.update() }
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
			var mx = e.clientX - rect.left, my = e.clientY - rect.top
			var cam = Registry.get('render').camera
			cursor.wx = mx - CONFIG.GAME.logicalWidth / 2 + cam.x
			cursor.wy = my - CONFIG.GAME.logicalHeight / 2 + cam.y
			cursor.on = true
		})
		canvas.addEventListener('pointerleave', function () { cursor.on = false })
		global.addEventListener('keydown', function (e) { keys[e.key] = true; if (e.key !== '`' && e.key !== '~') { startIfMenu() } })
		global.addEventListener('keyup', function (e) { keys[e.key] = false })
		global.addEventListener('resize', function () { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } })

		Log.info('main 就绪：循环启动（fixed step ' + STEP.toFixed(4) + 's）')
		global.requestAnimationFrame(frame)
	}

	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot) } else { boot() }

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · 鼠标绝对瞄准 · joy 相对摇杆 → cursor 世界坐标绝对瞄准 + deadZone(CONFIG.PLAYER.deadZoneRadius=12) + pointermove 免按住 · 不动 §9
