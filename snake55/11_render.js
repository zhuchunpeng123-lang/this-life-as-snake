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
	var HURT_VIGNETTE_SEC = 0.45        // TODO: 受击红闪 vignette 时长（候选 0.35 / 0.6）
	var FIRE_FLICKER_HZ = 12            // TODO: 火环跳动频率（候选 10 / 16）
	var SHIELD_GLOW_TRAIL = 0.18        // TODO: 护盾拖影角度占比（候选 0.12 / 0.25）
	var bossWarnUntil = 0
	var hurtVignetteUntil = 0

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
			if (o.kind === 'skill') {                                  // 技能食物：发光 + 呼吸脉冲 + 星标 + 头顶「!」
				var pulse = 0.5 + 0.5 * Math.sin(GS.timeSec * 6)
				ctx.globalAlpha = 0.22 + pulse * 0.22
				ctx.beginPath(); ctx.arc(o.x, o.y, o.radius + 6 + pulse * 4, 0, M.PI2); ctx.fillStyle = COL.skillDrop; ctx.fill()
				ctx.globalAlpha = 1
				circle(o.x, o.y, o.radius, COL.skillDrop)
				drawStar(o.x, o.y, o.radius + 2)
				ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'
				ctx.fillText('!', o.x, o.y - o.radius - 6)
			} else {                                                   // 普通/回血：素色无光
				var c = o.kind === 'heal' ? COL.heal : COL.food
				circle(o.x, o.y, o.radius, c)
			}
		}
	}
	function drawStar(x, y, r) {                                       // 技能食物星标（四角星芒）
		ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9
		ctx.beginPath()
		for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
		ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1
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
			if (e.burnT > 0) { drawBurnMark(e) }       // ⑦ 燃烧标记：红脉动环 + 火苗
			if (e.slowT > 0) { drawSlowMark(e) }       // 冰冻/减速标记：蓝染环 + 冰晶
			if (e.type !== 'bossBullet' && e.type !== 'boss') { drawHpBar(e) }   // 小怪血条+数值（boss 用屏幕顶部大血条，bossBullet 不显示）
		}
	}
	function drawHpBar(e) {                                           // 小怪世界血条：细条 + 血量数字（🟡 数字每怪一次 fillText，怪多时可考虑距离裁剪，perf 债待观察）
		if (!e.maxHp) { return }
		var ratio = M.clamp(e.hp / e.maxHp, 0, 1)
		var w = Math.max(e.radius * 2, 16), hgt = 3
		var bx = e.x - w / 2, by = e.y - e.radius - 9
		ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, w, hgt)
		ctx.fillStyle = ratio > 0.5 ? '#7CFC00' : (ratio > 0.25 ? '#ffd166' : '#ff5a5a')
		ctx.fillRect(bx, by, w * ratio, hgt)
		ctx.fillStyle = '#fff'; ctx.font = '600 9px monospace'; ctx.textAlign = 'center'
		ctx.fillText(Math.ceil(e.hp) + '/' + e.maxHp, e.x, by - 2)
	}
	function drawBurnMark(e) {                                        // ⑦ 燃烧可见：红脉动环 + 头顶火苗
		var pulse = 0.5 + 0.5 * Math.sin(GS.timeSec * 18)
		ctx.globalAlpha = 0.35 + pulse * 0.3
		ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, M.PI2); ctx.strokeStyle = '#ff5a2c'; ctx.lineWidth = 2; ctx.stroke()
		ctx.globalAlpha = 1; ctx.fillStyle = '#ff8a3c'
		var fy = e.y - e.radius - 6 - pulse * 3
		ctx.beginPath(); ctx.moveTo(e.x, fy - 6); ctx.lineTo(e.x - 4, fy + 2); ctx.lineTo(e.x + 4, fy + 2); ctx.closePath(); ctx.fill()
	}
	function drawSlowMark(e) {                                        // 冰冻/减速可见：蓝染环 + 头顶冰晶
		ctx.globalAlpha = 0.4
		ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 2, 0, M.PI2); ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1.5; ctx.stroke()
		ctx.globalAlpha = 0.9; ctx.fillStyle = '#dff3ff'
		var cy = e.y - e.radius - 6
		ctx.beginPath()
		for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; var px = e.x + Math.cos(a) * 4, py = cy + Math.sin(a) * 4; if (k === 0) { ctx.moveTo(px, py) } else { ctx.lineTo(px, py) } }
		ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
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
		var inv = GS.invincibleUntil > GS.timeSec
		var blink = inv && (Math.floor(GS.timeSec * 16) % 2 === 0)   // 无敌帧：蛇头闪烁，直观「这 1 秒安全」
		ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.angle || 0); ctx.scale(sq.sx, sq.sy)
		if (blink) { ctx.globalAlpha = 0.35 }
		circle(0, 0, PLAYER.headRadius, GS.coreHp <= 1 ? COL.enemyChaser : SNAKE_HEAD)
		ctx.restore(); ctx.globalAlpha = 1
		if (inv) {                                                   // 无敌光环（白闪脉动）
			var ha = 0.3 + 0.3 * Math.sin(GS.timeSec * 16)
			ctx.globalAlpha = ha; ctx.beginPath(); ctx.arc(h.x, h.y, PLAYER.headRadius + 6, 0, M.PI2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1
		}
	}
	function drawSkillAura() {
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head, owned = sk.owned(), SKC = CONFIG.SKILL
		function RTA(path, fb) { var ed = Registry.get('editor'); if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } } return fb }   // B-GM 标定：绘制读运行时覆盖，无覆盖回退冻结 CONFIG（与 08_skill RT() 同步，仅换视觉输入来源，几何算法不动）
		var segs = s.segments || []
		var flick = 0.7 + 0.3 * Math.sin(GS.timeSec * FIRE_FLICKER_HZ)   // 火跳动
		ctx.save()
		// —— 火：沿整条蛇身成火墙（与 tickFire 同 segStep 采样；视觉=判定）——
		if (owned.fire > 0) {
			var fi = owned.fire - 1, fr = RTA('SKILL.fire.radius.' + fi, SKC.fire.radius[fi]), stepF = SKC.fire.segStep[fi] || 1
			for (var sf = 0; sf < segs.length; sf += stepF) {
				var sg = segs[sf]
				ctx.beginPath(); ctx.arc(sg.x, sg.y, fr, 0, M.PI2)
				ctx.strokeStyle = 'rgba(255,140,0,' + (0.32 * flick).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.stroke()
				ctx.fillStyle = 'rgba(255,100,0,' + (0.05 * flick).toFixed(2) + ')'; ctx.fill()
			}
			var tongues = 14   // 火舌只在蛇头外圈跳（焦点）
			ctx.fillStyle = 'rgba(255,150,40,0.5)'
			for (var t = 0; t < tongues; t++) {
				var a = t / tongues * M.PI2
				var fl = (0.5 + 0.5 * Math.sin(GS.timeSec * FIRE_FLICKER_HZ + t)) * 6
				var bx = h.x + Math.cos(a) * (fr + 2), by = h.y + Math.sin(a) * (fr + 2)
				ctx.beginPath(); ctx.arc(bx, by, 1.5 + fl * 0.3, 0, M.PI2); ctx.fill()
			}
		}
		// —— 护盾：球绕蛇头公转，半径/周期读 config（与 tickShield 同 orbitRadius/orbitSec，消双份真相源）——
		if (owned.shield > 0) {
			var si = owned.shield - 1, sc = SKC.shield.count[si], orbR = RTA('SKILL.shield.orbitRadius.' + si, SKC.shield.orbitRadius[si])
			var base2 = (GS.timeSec / SKC.shield.orbitSec) * M.PI2
			for (var o = 0; o < sc; o++) {
				var a2 = base2 + o / sc * M.PI2
				var ox2 = h.x + Math.cos(a2) * orbR, oy2 = h.y + Math.sin(a2) * orbR
				var at = a2 - SHIELD_GLOW_TRAIL   // 拖影（沿轨道后方）
				var oxt = h.x + Math.cos(at) * orbR, oyt = h.y + Math.sin(at) * orbR
				ctx.globalAlpha = 0.3; ctx.strokeStyle = 'rgba(255,225,140,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round'
				ctx.beginPath(); ctx.moveTo(oxt, oyt); ctx.lineTo(ox2, oy2); ctx.stroke(); ctx.globalAlpha = 1
				ctx.beginPath(); ctx.arc(ox2, oy2, 6, 0, M.PI2); ctx.fillStyle = 'rgba(255,235,160,0.95)'; ctx.fill()   // 发光球（白金）
				ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ox2, oy2, 9, 0, M.PI2); ctx.fillStyle = 'rgba(255,225,140,0.4)'; ctx.fill(); ctx.globalAlpha = 1
				ctx.beginPath(); ctx.arc(ox2, oy2, orbR * SKC.shield.orbitHitMul, 0, M.PI2); ctx.strokeStyle = 'rgba(255,225,140,0.20)'; ctx.lineWidth = 1.5; ctx.stroke()   // B-2 对齐修正：命中环=orbitRadius×orbitHitMul，让玩家看清烫区
			}
		}
		// —— 冰：真·轨迹——蛇尾经过处滞留的地面冰区（读 Skill.getIceZones()，与 tickIce 判定严格一致；视觉=判定）——
		if (owned.ice > 0) {
			var zones = (sk.getIceZones ? sk.getIceZones() : null)
			if (zones) {
				for (var zi = 0; zi < zones.length; zi++) {
					var z = zones[zi]
					var zremain = z.expire - GS.timeSec
					var zlife = z.life > 0 ? z.life : 1
					var zratio = zremain > 0 ? (zremain / zlife) : 0   // 剩余寿命占比 → 淡出
					var za = (0.18 + 0.32 * zratio).toFixed(2)         // 冰区底色透明度随寿命衰减（不强到挡视线）
					ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, M.PI2)
					ctx.fillStyle = 'rgba(120,205,255,' + za + ')'; ctx.fill()   // 冰蓝霜区
					ctx.fillStyle = 'rgba(225,243,255,0.5)'   // 霜点（固定亮，强调落点）
					for (var fk = 0; fk < 3; fk++) {
						var fa = fk * 2.1 + zi, fr2 = 4 + (fk % 2) * 3
						ctx.beginPath(); ctx.arc(z.x + Math.cos(fa) * fr2, z.y + Math.sin(fa) * fr2, 1.3, 0, M.PI2); ctx.fill()
					}
				}
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
		if (p && p.drawOverlay) { p.drawOverlay(ctx) }   // B-4：combo 闪核叠加层（蒸汽白闪/电磁辉光），绘于实体之上、不长时间盖核心信息
		drawDebugHitboxes()
		ctx.restore()
		drawHurtVignette()
		drawBossWarn()
		drawBossHpBar()
		drawDebugHud()
	}
	function drawBossHpBar() {                                       // Boss 屏幕顶部大血条：条 + 血量数值 + 阶段/无敌提示（无敌期说明伤害数字为何不跳）
		var En = Registry.get('enemy'); if (!En || !En.list) { return }
		var boss = null
		for (var i = 0; i < En.list.length; i++) { if (En.list[i].active && En.list[i].type === 'boss') { boss = En.list[i]; break } }
		if (!boss || !boss.maxHp) { return }
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		var w = GAME.logicalWidth * 0.6, hgt = 14, x = (GAME.logicalWidth - w) / 2, y = 30
		var ratio = M.clamp(boss.hp / boss.maxHp, 0, 1)
		ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, hgt + 4)
		ctx.fillStyle = '#3a0d18'; ctx.fillRect(x, y, w, hgt)
		ctx.fillStyle = '#ff2d6b'; ctx.fillRect(x, y, w * ratio, hgt)
		ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'
		var inv = boss.invuln > 0 ? '  [无敌]' : ''
		ctx.fillText('BOSS  ' + Math.ceil(boss.hp) + ' / ' + boss.maxHp + '  (阶段 ' + boss.phase + ')' + inv, GAME.logicalWidth / 2, y + 11)
		ctx.restore()
	}
	function drawHurtVignette() {                                    // 受击全屏红闪 vignette（屏幕空间，叠在实体之上）
		if (GS.timeSec >= hurtVignetteUntil) { return }
		var remain = hurtVignetteUntil - GS.timeSec
		var a = Math.min(1, remain / HURT_VIGNETTE_SEC) * 0.5       // 最大 0.5 透明度，避免过曝
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		var g = ctx.createRadialGradient(GAME.logicalWidth / 2, GAME.logicalHeight / 2, Math.min(GAME.logicalWidth, GAME.logicalHeight) * 0.3, GAME.logicalWidth / 2, GAME.logicalHeight / 2, Math.max(GAME.logicalWidth, GAME.logicalHeight) * 0.65)
		g.addColorStop(0, 'rgba(255,30,60,0)')
		g.addColorStop(1, 'rgba(255,30,60,' + a.toFixed(2) + ')')
		ctx.fillStyle = g; ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
		ctx.restore()
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
	function drawDebugHitboxes() {                         // B-GM：GM 面板「显示碰撞盒」实时绘制碰撞半径（世界坐标系内调用）
		var dbg = global.GMDBG; if (!dbg || !dbg.showHitboxes) { return }
		ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,170,0.9)'
		var En = Registry.get('enemy'); if (En && En.list) { for (var i = 0; i < En.list.length; i++) { var e = En.list[i]; if (!e.active) { continue }; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, M.PI2); ctx.stroke() } }
		var s = Registry.get('snake'); if (s && s.head) {
			ctx.strokeStyle = 'rgba(255,80,120,0.9)'
			var segs = s.segments || []; for (var j = 0; j < segs.length; j++) { ctx.beginPath(); ctx.arc(segs[j].x, segs[j].y, PLAYER.bodyRadius, 0, M.PI2); ctx.stroke() }
			ctx.beginPath(); ctx.arc(s.head.x, s.head.y, PLAYER.headRadius, 0, M.PI2); ctx.stroke()
		}
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
	Bus.on('snake:hurt', function () { addShake(SHK.death); hurtVignetteUntil = GS.timeSec + HURT_VIGNETTE_SEC })   // 受击强震复用 shakeDeath（不新增魔法数字）+ 红闪
	Bus.on('enemy:phase', function () { addShake(SHK.crit) })
	Bus.on('wave:boss_warn', function (d) { bossWarnUntil = GS.timeSec + (d && d.leadSec ? d.leadSec : 0); addShake(SHK.crit) })   // ⑤ Boss 预警：红边+震屏
	Bus.on('snake:dead', function () { addShake(SHK.death) })
	Bus.on('combo:found', function () { addShake(SHK.process) })
	Bus.on('core:run_reset', function () { shakeMag = 0; shakeFrames = 0; bossWarnUntil = 0; hurtVignetteUntil = 0; cam.x = GAME.worldWidth / 2; cam.y = GAME.worldHeight / 2 })

	var Render = { init: init, resize: resize, draw: draw, camera: cam }
	Registry.register('render', Render)
	Log.info('render 就绪：镜头跟随 + 世界绘制 + 四档屏震')

})(typeof window !== 'undefined' ? window : this)
