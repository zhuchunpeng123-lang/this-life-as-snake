;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M
	var GAME = CONFIG.GAME, PLAYER = CONFIG.PLAYER, CAM = PLAYER.camera, COL = CONFIG.COLORS, SHK = CONFIG.COMBAT.shake

	var SNAKE_BODY = COL.snakeBody
	var SNAKE_HEAD = COL.snakeHead
	var TELEGRAPH_BLINK_HZ = 8          // TODO: 冲锋怪蓄力闪红频率（候选 6 / 10）
	var TELEGRAPH_ARROW_LEN = 22        // TODO: 蓄力方向箭头长度 px（候选 18 / 28）
	var BOSS_WARN_PULSE_HZ = 6          // TODO: Boss 预警红边脉动频率（候选 4 / 8）
	var BOSS_WARN_BORDER_PX = 8         // TODO: Boss 预警红边宽度 px（候选 6 / 12）
	var bossWarnUntil = 0

	var canvas = null, ctx = null, dpr = 1
	var cam = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 }
	var shakeMag = 0, shakeFrames = 0
	var _fpsLast = 0, _fpsAcc = 0, _fpsFrames = 0, _fps = 0

	function addShake(s) {
		if (!s) { return }
		shakeMag = Math.min(shakeMag + s.px, SHK.maxComposite)
		if (s.frames > shakeFrames) { shakeFrames = s.frames }
	}

	function init(canvasEl) { canvas = canvasEl; ctx = canvas.getContext('2d'); resize() }
	function resize() {
		if (!canvas) { return }
		dpr = global.devicePixelRatio || 1
		canvas.width = GAME.logicalWidth * dpr; canvas.height = GAME.logicalHeight * dpr
		canvas.style.width = GAME.logicalWidth + 'px'; canvas.style.height = GAME.logicalHeight + 'px'
	}

	function updateCamera() {
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head
		var tx = h.x + Math.cos(h.angle) * CAM.lookAhead, ty = h.y + Math.sin(h.angle) * CAM.lookAhead
		var dx = tx - cam.x, dy = ty - cam.y, d = Math.sqrt(dx * dx + dy * dy)
		if (d > CAM.deadZone) { cam.x += dx * CAM.followLerp; cam.y += dy * CAM.followLerp }
		var halfW = GAME.logicalWidth / 2, halfH = GAME.logicalHeight / 2
		cam.x = M.clamp(cam.x, halfW, GAME.worldWidth - halfW)
		cam.y = M.clamp(cam.y, halfH, GAME.worldHeight - halfH)
	}

	function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, M.PI2); ctx.fillStyle = color; ctx.fill() }

	function drawBounds() { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, GAME.worldWidth, GAME.worldHeight) }
	function drawPickups() {
		var pk = Registry.get('pickup'); if (!pk || !pk.foods) { return }
		var f = pk.foods
		for (var i = 0; i < f.length; i++) {
			var o = f[i]; if (!o.active) { continue }
			var c = o.kind === 'heal' ? COL.heal : (o.kind === 'skill' ? COL.skillDrop : COL.food)
			circle(o.x, o.y, o.radius, c)
		}
	}
	function drawEnemies() {
		var En = Registry.get('enemy'); if (!En || !En.list) { return }
		var l = En.list
		for (var i = 0; i < l.length; i++) {
			var e = l[i]; if (!e.active) { continue }
			if (e.flashT > 0) { circle(e.x, e.y, e.radius, COL.damageText); continue }   // ⑥ 受击闪白（白）
			if (e.type === 'charger' && e.state === 'windup') {                          // ⑤ 冲锋怪蓄力 telegraph：闪红 + 方向箭头
				var blink = (Math.floor(GS.timeSec * TELEGRAPH_BLINK_HZ) % 2 === 0)
				circle(e.x, e.y, e.radius, blink ? COL.enemyChaser : e.color)
				drawChargeArrow(e)
			} else { circle(e.x, e.y, e.radius, e.color) }
		}
	}
	function drawChargeArrow(e) {
		var len = e.radius + TELEGRAPH_ARROW_LEN, a = e.angle
		var tx = e.x + Math.cos(a) * len, ty = e.y + Math.sin(a) * len
		ctx.strokeStyle = COL.enemyChaser; ctx.lineWidth = 3
		ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(tx, ty); ctx.stroke()
		var ah = 7
		ctx.beginPath(); ctx.moveTo(tx, ty)
		ctx.lineTo(tx - Math.cos(a - 0.5) * ah, ty - Math.sin(a - 0.5) * ah)
		ctx.lineTo(tx - Math.cos(a + 0.5) * ah, ty - Math.sin(a + 0.5) * ah)
		ctx.closePath(); ctx.fillStyle = COL.enemyChaser; ctx.fill()
	}
	function drawSnake() {
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var segs = s.segments || []
		for (var i = segs.length - 1; i >= 0; i--) { circle(segs[i].x, segs[i].y, PLAYER.bodyRadius, SNAKE_BODY) }
		var h = s.head, sq = s.squash || { sx: 1, sy: 1 }
		ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.angle || 0); ctx.scale(sq.sx, sq.sy)
		circle(0, 0, PLAYER.headRadius, GS.coreHp <= 1 ? COL.enemyChaser : SNAKE_HEAD)
		ctx.restore()
	}
	function drawSkillAura() {
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head, owned = sk.owned(), SKC = CONFIG.SKILL
		var ORBIT_SEC = 1.6, ORB_R = 26   // TODO: 复用 skill.js SHIELD_ORBIT_SEC / SHIELD_ORB_RADIUS，修改须同步
		ctx.save()
		if (owned.fire > 0) {
			var fi = owned.fire - 1, fr = SKC.fire.radius[fi]
			ctx.beginPath(); ctx.arc(h.x, h.y, fr, 0, M.PI2)
			ctx.strokeStyle = 'rgba(255,140,0,0.45)'; ctx.lineWidth = 3; ctx.stroke()   // TODO: 描边透明度候选 0.35/0.55
			ctx.fillStyle = 'rgba(255,100,0,0.06)'; ctx.fill()                           // TODO: 内晕候选 0.04/0.09
		}
		if (owned.shield > 0) {
			var si = owned.shield - 1, sc = SKC.shield.count[si]
			var base2 = (GS.timeSec / ORBIT_SEC) * M.PI2
			for (var o = 0; o < sc; o++) {
				var a2 = base2 + o / sc * M.PI2
				ctx.beginPath(); ctx.arc(h.x + Math.cos(a2) * ORB_R, h.y + Math.sin(a2) * ORB_R, 5, 0, M.PI2)   // TODO: 球半径 5px 候选 4/6
				ctx.fillStyle = 'rgba(60,255,160,0.85)'; ctx.fill()                       // TODO: 绿色候选 rgba(80,255,170,0.9)
			}
		}
		if (owned.ice > 0) {
			var segs2 = s.segments || [], iceMax = Math.min(5, segs2.length)   // TODO: 显示节数 5 候选 4/8
			for (var q = 1; q <= iceMax; q++) {
				var sg = segs2[q]; if (!sg) { continue }
				var ia = (1 - q / (iceMax + 1)) * 0.7
				ctx.beginPath(); ctx.arc(sg.x, sg.y, 10, 0, M.PI2)             // TODO: 圆半径 10px 候选 9/12
				ctx.fillStyle = 'rgba(100,200,255,' + ia.toFixed(2) + ')'; ctx.fill()   // TODO: 冰蓝候选 rgba(120,220,255)
			}
		}
		ctx.restore()
	}

	function draw() {
		if (!ctx) { return }
		var tnow = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (_fpsLast) { _fpsAcc += (tnow - _fpsLast) / 1000; _fpsFrames++ }
		_fpsLast = tnow
		if (_fpsAcc >= 0.5) { _fps = Math.round(_fpsFrames / _fpsAcc); _fpsAcc = 0; _fpsFrames = 0 }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.fillStyle = '#0d0f1a'; ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
		updateCamera()
		var ox = 0, oy = 0
		if (shakeFrames > 0) { ox = M.rand(-shakeMag, shakeMag); oy = M.rand(-shakeMag, shakeMag); shakeFrames--; if (shakeFrames <= 0) { shakeMag = 0 } else { shakeMag *= 0.85 } }
		ctx.save()
		ctx.translate(GAME.logicalWidth / 2 - cam.x + ox, GAME.logicalHeight / 2 - cam.y + oy)
		drawBounds()
		var p = Registry.get('particle'); if (p && p.drawWorld) { p.drawWorld(ctx) }
		drawPickups(); drawEnemies(); drawSnake(); drawSkillAura()
		ctx.restore()
		drawBossWarn()
		drawDebugHud()
	}
	function drawBossWarn() {
		if (GS.timeSec >= bossWarnUntil) { return }
		var pulse = 0.35 + 0.30 * Math.abs(Math.sin(GS.timeSec * BOSS_WARN_PULSE_HZ))
		ctx.save()
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.strokeStyle = 'rgba(255,45,107,' + pulse.toFixed(2) + ')'   // ≈COL.boss #ff2d6b
		ctx.lineWidth = BOSS_WARN_BORDER_PX
		ctx.strokeRect(BOSS_WARN_BORDER_PX / 2, BOSS_WARN_BORDER_PX / 2, GAME.logicalWidth - BOSS_WARN_BORDER_PX, GAME.logicalHeight - BOSS_WARN_BORDER_PX)
		ctx.restore()
	}
	function drawDebugHud() {
		var En = Registry.get('enemy')
		var en = (En && En.countMobs) ? En.countMobs() : 0
		ctx.save()
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.globalAlpha = 1
		ctx.fillStyle = _fps >= 55 ? '#7CFC00' : (_fps >= 40 ? '#ffd166' : '#ff6b6b')
		ctx.font = '700 13px monospace'
		ctx.textAlign = 'left'
		ctx.fillText('FPS ' + _fps + '  敌 ' + en + '  节 ' + GS.segments, 8, 16)
		ctx.restore()
	}

	Bus.on('snake:wall', function () { addShake(SHK.light) })
	Bus.on('enemy:hit', function (d) { if (d && d.crit) { addShake(SHK.crit) } })
	Bus.on('snake:hurt', function () { addShake(SHK.process) })
	Bus.on('enemy:phase', function () { addShake(SHK.crit) })
	Bus.on('wave:boss_warn', function (d) { bossWarnUntil = GS.timeSec + (d && d.leadSec ? d.leadSec : 0); addShake(SHK.crit) })   // ⑤ Boss 预警：红边+震屏
	Bus.on('snake:dead', function () { addShake(SHK.death) })
	Bus.on('combo:found', function () { addShake(SHK.process) })
	Bus.on('core:run_reset', function () { shakeMag = 0; shakeFrames = 0; bossWarnUntil = 0; cam.x = GAME.worldWidth / 2; cam.y = GAME.worldHeight / 2 })

	var Render = { init: init, resize: resize, draw: draw, camera: cam }
	Registry.register('render', Render)
	Log.info('render 就绪：镜头跟随 + 世界绘制 + 四档屏震')

})(typeof window !== 'undefined' ? window : this)
