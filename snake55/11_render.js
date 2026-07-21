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
	var worldScale = 1          // round6：视图缩放(0.8)已移除，还原 commit 无缩放原画面；worldScale 恒 1，碰撞/世界坐标不变，相机 1:1 跟随蛇身
	var cam = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 }
	var shakeMag = 0, shakeFrames = 0
	var trauma = 0   // ④-B 蒸汽引爆 trauma 通道（0..1）：与 impulse 通道叠加取大，封顶 maxComposite；时间窗内多次引爆不线性叠加
	// 任务2+❷：屏震分档节流 + 蒸汽齐爆帧末聚合状态
	var _traumaGateUntil = 0   // 节流窗口末（GS.timeSec）；窗口内同/低档请求丢弃
	var _traumaLastRank = 0    // 上次应用档位 rank（1=T1/2=T2/3=T3）
	var _steamThisFrame = 0    // 本帧 fx:steamblast 计数（帧末聚合→T1 一次，单体 T0 不震）
	var _lastSteamCount = 0    // HUD：上帧蒸汽齐爆数
	var _frameMs = 0           // HUD：本帧绘制耗时(ms)
	var _cpuMs = 0            // HUD：整帧主线程 JS 耗时(ms)，由 main 经 setCpuMs 写入（含 step+draw+ui，不含 GPU 合成）
	var _fpsLast = 0, _fpsAcc = 0, _fpsFrames = 0, _fps = 0, _fpsMin = Infinity   // b9+diag：_fpsMin=当前采样窗口内瞬时最低 FPS（防短暂掉帧被平均吃掉，漏采见 2026-07-21 对话）
	// b9+diag：绘制调用计数器（包 ctx 方法自增；每帧 draw 首清零、末快照→diag 暴露；坐实"绘制调用数/状态切换"是否 GPU 瓶颈，零 gameplay）
	var _dc = { fill: 0, stroke: 0, fillText: 0, drawImage: 0, fillRect: 0, beginPath: 0, arc: 0 }
	var _lastDc = { fill: 0, stroke: 0, fillText: 0, drawImage: 0, fillRect: 0, beginPath: 0, arc: 0 }
	var _lastOv = 0           // overdraw 估算(px²)：统一由 render 计算，作为唯一真相源，profiler(tick 关火判定) 与 日志 共用（零重复计算/单位错配；画布 1600x900=1440k px²，≥~320k 即显著）
	function wrapDc(c) {
		var names = ['fill', 'stroke', 'fillText', 'drawImage', 'fillRect', 'beginPath', 'arc']
		for (var _w = 0; _w < names.length; _w++) { (function (nm) { var o = c[nm]; if (typeof o === 'function') { c[nm] = function () { _dc[nm]++; return o.apply(c, arguments) } } })(names[_w]) }
	}
	function RT(path, fb) {    // 运行时标定桥（与 08_skill/05_particle 同步）：读 editor 覆盖，无覆盖回退冻结 CONFIG（仅显示/视觉用）
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	function perfFB(field, def) { return (global.PerfTier && global.PerfTier[field] != null) ? global.PerfTier[field] : def }   // 自适应分级：RT 回退源改读 PerfTier 当前档（GM 经 editor.rtSet 仍优先，零双份真相源）

	// 任务2：屏震分档节流（真源 §2.2.1「严禁单一强度轰炸·防脱敏」）
	//   rank: 1=T1 light / 2=T2 process / 3=T3 crit·death；gate 来自 SHK.gateSec
	//   规则：间隔内同档或更低档丢弃；高档可越级覆盖（如 crit 覆盖 light）
	function addTrauma(rank, s) {
		if (GS.timeSec < _traumaGateUntil && rank <= _traumaLastRank) { return }
		if (s && s.px) { trauma = Math.min(1, trauma + s.px / SHK.maxComposite) }
		_traumaLastRank = rank
		_traumaGateUntil = GS.timeSec + (SHK.gateSec[rank] || 0.5)
	}

	function init(canvasEl) { canvas = canvasEl; ctx = canvas.getContext('2d'); wrapDc(ctx); resize() }   // b9+diag：包装 ctx 计数绘制调用
	function resize() {
		if (!canvas) { return }
		var dprMon = Math.min(global.devicePixelRatio || 1, 2)   // 设备像素比安全上限 2
		var scale = Math.min(global.innerWidth / GAME.logicalWidth, global.innerHeight / GAME.logicalHeight)   // contain 等比：窗口内最大化、16:9 不裁切、比例不符留 letterbox（#game-wrap flex 居中）；禁用 cover 裁切边缘 HUD
		if (!(scale > 0)) { return }   // 窗口极小/最小化瞬间 scale 可能为 0 → 跳过，避免 backing 0 尺寸退化（恢复后真实 resize 重算；治"缩小再打开"偶发 0 尺寸帧）
		dpr = dprMon * scale   // 合成缩放：逻辑坐标 → 设备像素（HUD/世界文字 1:1 清晰，不再 2x 上采样糊字）
		// 🟡 性能护栏：backing 宽封顶 MAX_BACK_W，避免大屏/retina 下 dpr 乘积失控→每帧光栅(∝分辨率²)拖帧（fire 墙/冰池/粒子每帧绘制成本随 backing 放大）
		var MAX_BACK_W = RT('RENDER.maxBackW', perfFB('maxBackW', 1600))   // 自适应分级：回退源=PerfTier.maxBackW（HIGH 默认 1600）；GM 经 editor.rtSet 仍优先
		if (GAME.logicalWidth * dpr > MAX_BACK_W) { dpr = MAX_BACK_W / GAME.logicalWidth }
		canvas.width = Math.round(GAME.logicalWidth * dpr)   // backing 宽 ≤ MAX_BACK_W（= CSS 显示尺寸 × 设备像素比，仍清晰，但封顶控 fill 成本）
		canvas.height = Math.round(GAME.logicalHeight * dpr)
		canvas.style.width = (GAME.logicalWidth * scale) + 'px'
		canvas.style.height = (GAME.logicalHeight * scale) + 'px'
	}

	function updateCamera() {
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head
		var tx = h.x + Math.cos(h.angle) * CAM.lookAhead, ty = h.y + Math.sin(h.angle) * CAM.lookAhead
		var dx = tx - cam.x, dy = ty - cam.y, d = Math.sqrt(dx * dx + dy * dy)
		if (d > CAM.deadZone) { cam.x += dx * CAM.followLerp; cam.y += dy * CAM.followLerp }
	var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0)
	var halfW = GAME.logicalWidth / 2 / ws, halfH = GAME.logicalHeight / 2 / ws   // 缩放后可见半幅=半宽/worldScale（ws<1 时看得更广→clamp 边界更宽，避免视图越出世界）；ws=1 退化为原值
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
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉；GM 经 editor.rtSet 仍优先
		var l = En.list
		// 第一遍：普通本体按色批量 fill（同色假人 → 1 次 fill）；远敌不再视口剔除 → 回视/冲堆不 pop-in（灭"加载感"）；GPU 自动裁剪视口外几何，1 path 成本极低
		var byColor = {}
		for (var i = 0; i < l.length; i++) {
			var e = l[i]; if (!e.active) { continue }
			if (e.flashT > 0) { circle(e.x, e.y, e.radius, COL.damageText); continue }   // ⑥ 受击闪白（白）
			if (e.type === 'charger' && e.state === 'windup') {                          // ⑤ 冲锋怪蓄力 telegraph：闪红 + 方向箭头
				var blink = (Math.floor(GS.timeSec * TELEGRAPH_BLINK_HZ) % 2 === 0)
				circle(e.x, e.y, e.radius, blink ? COL.enemyChaser : e.color)
				drawChargeArrow(e); continue
			}
			var bc = e.color
			if (!byColor[bc]) { byColor[bc] = [] }
			byColor[bc].push(e)
		}
		for (var col in byColor) {
			var arr = byColor[col]
			ctx.beginPath()
			for (var j = 0; j < arr.length; j++) { var ee = arr[j]; ctx.moveTo(ee.x + ee.radius, ee.y); ctx.arc(ee.x, ee.y, ee.radius, 0, M.PI2) }
			ctx.fillStyle = col; ctx.fill()
		}
		// 第二遍：标记 + 血条（弱省，单敌少量，保留原逻辑；白闪/telegraph 已在首遍画过，跳过以免重画）
		for (var k = 0; k < l.length; k++) {
			var e2 = l[k]; if (!e2.active) { continue }
			if (!inView(e2.x, e2.y, e2.radius)) { continue }
			if (e2.flashT > 0) { continue }
			if (e2.type === 'charger' && e2.state === 'windup') { continue }
			if (e2.burnT > 0 && !T3) { drawBurnMark(e2) }       // ⑦ 燃烧标记：红脉动环 + 火苗（T3 关火焰系 per-enemy 视觉时跳过，零 gameplay）
			if (e2.slowT > 0 && !T3) { drawSlowMark(e2) }       // 冰冻/减速标记：蓝染环 + 冰晶（T3 一并关，零 gameplay）
			if (e2.type !== 'bossBullet' && e2.type !== 'boss') { drawHpBar(e2) }   // 小怪血条+数值（boss 用屏幕顶部大血条，bossBullet 不显示）
		}
	}
	function inView(x, y, r) {                                        // 世界点是否在镜头视口内（含半径余量；worldScale 缩放后真实可见半幅=半宽/worldScale）
		var hw = GAME.logicalWidth / 2 / worldScale, hh = GAME.logicalHeight / 2 / worldScale, m = (r || 0) + 20
		return x > cam.x - hw - m && x < cam.x + hw + m && y > cam.y - hh - m && y < cam.y + hh + m
	}
	function drawHpBar(e) {                                           // 小怪世界血条：纯 rect（去 fillText 数字·省绘制）；仅受伤且在视口内才画；数字仅 elite/Boss
		if (!e.maxHp || e.hp >= e.maxHp) { return }                   // 满血不画（省恒定 draw 成本）
		if (!inView(e.x, e.y, e.radius)) { return }                  // 视口外不画
		var ratio = M.clamp(e.hp / e.maxHp, 0, 1)
		var w = Math.max(e.radius * 2, 16), hgt = 3
		var bx = e.x - w / 2, by = e.y - e.radius - 9
		ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, w, hgt)
		ctx.fillStyle = ratio > 0.5 ? '#7CFC00' : (ratio > 0.25 ? '#ffd166' : '#ff5a5a')
		ctx.fillRect(bx, by, w * ratio, hgt)
		if (e.type === 'elite') {                                     // 数字仅精英（Boss 用顶部大血条）；普通小怪纯条，去掉每怪一次 fillText
			ctx.fillStyle = '#fff'; ctx.font = '600 9px monospace'; ctx.textAlign = 'center'
			ctx.fillText(Math.ceil(e.hp) + '/' + e.maxHp, e.x, by - 2)
		}
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
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉（含蛇身火墙）；GM 经 editor.rtSet 仍优先
		var T4 = RT('PERF.suppressIceFill', perfFB('suppressIceFill', false) ? 1 : 0) > 0   // 自适应分级：POTATO 档冰池只描边；GM 经 editor.rtSet 仍优先
		var h = s.head, owned = sk.owned(), SKC = CONFIG.SKILL
		function RTA(path, fb) { var ed = Registry.get('editor'); if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } } return fb }   // B-GM 标定：绘制读运行时覆盖，无覆盖回退冻结 CONFIG（与 08_skill RT() 同步，仅换视觉输入来源，几何算法不动）
		var segs = s.segments || []
		var flick = 0.7 + 0.3 * Math.sin(GS.timeSec * FIRE_FLICKER_HZ)   // 火跳动
		ctx.save()
		// —— 火：沿整条蛇身成火墙（与 tickFire 同 segStep 采样；视觉=判定）——
		if (owned.fire > 0 && !T3) {   // b9-diag T3：关火焰光环（仅视觉，零 gameplay；伤害结算照常）
			var fi = owned.fire - 1, fr = RTA('SKILL.fire.radius.' + fi, SKC.fire.radius[fi]), stepF = SKC.fire.segStep[fi] || 1
			// 火墙=沿蛇身的连续火管：单 path + 2 stroke 替代「每节点 arc+stroke+fill」(50 节=50 独立填充 pass 的 overdraw 主因)；纯渲染优化，几何/伤害判定不动
			ctx.beginPath()
			for (var sf = 0; sf < segs.length; sf += stepF) {
				var sg = segs[sf]
				if (sf === 0) { ctx.moveTo(sg.x, sg.y) } else { ctx.lineTo(sg.x, sg.y) }
			}
			ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		ctx.lineWidth = fr * 2; ctx.strokeStyle = 'rgba(255,90,0,' + (0.30 * flick).toFixed(2) + ')'; ctx.stroke()   // 软火带：宽 fr*2 / alpha 0.30（round6 稳定版；火墙为整条蛇身火管+沿身橙黄余烬，无"怪异蛇身细线"）
		ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,150,40,' + (0.72 * flick).toFixed(2) + ')'; ctx.stroke()   // 热边：加粗+提亮，整条蛇身火墙清晰可读（0.5→0.72 / 宽4→5，比 commit 更醒目）
		// （删除旧"14 火舌绕蛇头一圈"：第二轮"只围头部"回归遗留，被用户判为"蛇头外围怪异环绕粒子"；火墙表现改由蛇身火管+05_particle 沿身余烬承担，见 spawnFireEmbers）
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
		// —— 冰：CD 自动索敌冰池（读 Skill.getIcePools()，与 tickIce 判定严格一致；视觉=判定）——
		if (owned.ice > 0) {
			var pools = (sk.getIcePools ? sk.getIcePools() : null)
			if (pools) {
				for (var zi = 0; zi < pools.length; zi++) {
					var p = pools[zi]
					var premain = p.expire - GS.timeSec
					var plife = p.life > 0 ? p.life : 1
					var pratio = premain > 0 ? (premain / plife) : 0   // 剩余寿命占比 → 淡出
					var pa = (0.18 + 0.32 * pratio).toFixed(2)         // 冰池底色透明度随寿命衰减（不强到挡视线）
					var gr = (p.growDur > 0 && p.growT > 0) ? (1 - p.growT / p.growDur) : 1   // ⑥ 首测：生长 scale 0→1
					var pr = p.r * gr                                                  // 生长中半径（看到的=打到的，与 tickIce effR 一致）
				ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, M.PI2)
				if (!T4) { ctx.fillStyle = 'rgba(120,205,255,' + pa + ')'; ctx.fill() }   // 冰蓝霜池：T4 关填充只留描边（纯视觉，零 gameplay）
					ctx.strokeStyle = 'rgba(159,220,255,0.35)'; ctx.lineWidth = 2   // 冰池外环（强调大控制场边界，看到的=打到的）
					ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, M.PI2); ctx.stroke()
					ctx.fillStyle = 'rgba(225,243,255,0.5)'   // 霜点（固定亮，沿半径撒布填充大霜池）
					for (var fk = 0; fk < 6; fk++) {
						var fa = fk * 1.05 + zi * 1.7, fr2 = pr * 0.32 + (fk % 3) * (pr * 0.22)   // 放大后铺满大范围，不糊不错位
						ctx.beginPath(); ctx.arc(p.x + Math.cos(fa) * fr2, p.y + Math.sin(fa) * fr2, 1.3, 0, M.PI2); ctx.fill()
					}
				}
			}
		}
		ctx.restore()
	}

function draw() {
	if (!ctx) { return }
	_dc.fill = 0; _dc.stroke = 0; _dc.fillText = 0; _dc.drawImage = 0; _dc.fillRect = 0; _dc.beginPath = 0; _dc.arc = 0   // b9+diag：绘制调用计数清零（每帧）
	var tFrame0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
	var tnow = tFrame0
	if (_fpsLast) {
		var _dt = tnow - _fpsLast
		_fpsAcc += _dt / 1000
		_fpsFrames++
		// 瞬时 FPS = 1000/帧间隔；_dt>0 且 <1000ms 才计入（跳过 tab 切后台/暂停造成的伪长帧，避免把"切窗口"误记成 gameplay 掉帧）
		if (_dt > 0 && _dt < 1000) { var _inst = 1000 / _dt; if (_inst < _fpsMin) { _fpsMin = _inst } }
	}
	_fpsLast = tnow
	if (_fpsAcc >= 0.5) { _fps = Math.round(_fpsFrames / _fpsAcc); _fpsAcc = 0; _fpsFrames = 0 }
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.fillStyle = '#0d0f1a'; ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
	updateCamera()
	// 任务2+❷：本帧蒸汽齐爆聚合 → T1 轻档一次（addTrauma 节流防常震脱敏）；单体(<manyMin)→T0 不震
	_lastSteamCount = _steamThisFrame
	if (_steamThisFrame >= SHK.steam.manyMin) { addTrauma(1, SHK.light) }
	_steamThisFrame = 0
	var mag = 0
	if (shakeFrames > 0) { mag = Math.max(mag, shakeMag); shakeFrames--; if (shakeFrames <= 0) { shakeMag = 0 } else { shakeMag *= 0.85 } }
	var traumaMag = trauma * SHK.maxComposite   // ④-B：trauma 通道折算成屏震幅度（≤maxComposite）
	if (traumaMag > mag) { mag = traumaMag }
	if (RT('PERF.suppressShake', perfFB('suppressShake', false) ? 1 : 0) > 0) { mag = 0 }   // 自适应分级：POTATO 档关屏震；GM 经 editor.rtSet 仍优先
	trauma = Math.max(0, trauma - SHK.steam.decayPerSec / GAME.fps)   // ④-B：trauma 时间窗衰减，多次引爆不线性叠加（N爆≠N震）
	var ox = 0, oy = 0
	if (mag > 0) { ox = M.rand(-mag, mag); oy = M.rand(-mag, mag) }
	ctx.save()
	ctx.translate(GAME.logicalWidth / 2 + ox, GAME.logicalHeight / 2 + oy)   // 屏幕中心为锚（shake 在屏幕空间，不随缩放变）
	var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0); worldScale = ws
	ctx.scale(ws, ws)                       // ① 先缩放（围绕屏幕中心）：worldScale 仅改显示尺寸，不掺入相机平移
	ctx.translate(-cam.x, -cam.y)           // ② 再按世界坐标平移相机→cam=蛇世界坐标时蛇恒居屏幕中心（修复 round6 误撤后「缩放掺进平移→蛇不居中/视图不跟随」）；指针反算/ inView 已按此顺序对齐
	drawBounds()
	var p = Registry.get('particle'); if (p && p.drawWorld) { p.drawWorld(ctx) }
	drawPickups(); drawEnemies(); drawSnake(); drawSkillAura()
	if (p && p.drawOverlay) { p.drawOverlay(ctx) }   // B-4：combo 闪核叠加层（蒸汽白闪/电磁辉光），绘于实体之上、不长时间盖核心信息
	drawDebugHitboxes()
	ctx.restore()
	drawHurtVignette()
	drawBossWarn()
	drawBossHpBar()
	drawPerfBadge()
	drawDebugHud()
	if (p && p.DBG) { p.DBG.ignite = 0; p.DBG.fireDot = 0; p.DBG.flashDrawn = 0; p.DBG.steamBlasts = 0; p.DBG.steamAoeCmp = 0 }   // b9-diag/measure：计数器按帧归零（HUD 已读本帧值）
	_lastDc.fill = _dc.fill; _lastDc.stroke = _dc.stroke; _lastDc.fillText = _dc.fillText; _lastDc.drawImage = _dc.drawImage; _lastDc.fillRect = _dc.fillRect; _lastDc.beginPath = _dc.beginPath; _lastDc.arc = _dc.arc   // b9+diag：快照本帧绘制调用数供 profiler
	// overdraw 估算(px²)：叠加层半透明填充总面，直接反映 GPU 填充率负载（单一真相源；profiler 与 tick 关火判定共用，避免单位错配）。火墙已优化为单 path+2 stroke（不贡献 fill），故真实瓶颈在粒子/白爆/爆环/光束
	var ovk = 0
	var pp = Registry.get('particle')
	if (pp) {
		var _ps = pp.particles, _fc = pp.flashCores, _bl = pp.blasts, _bm = pp.beams, _i, _a, _r
		for (_i = 0; _i < _ps.length; _i++) { _a = _ps[_i].life / _ps[_i].maxLife; if (_a < 0) _a = 0; _r = _ps[_i].size * _a; ovk += Math.PI * _r * _r }                 // Σ πr²(粒子)
		for (_i = 0; _i < _fc.length; _i++) { _a = _fc[_i].life / _fc[_i].maxLife; if (_a < 0) _a = 0; _r = _fc[_i].radius * (1.25 - 0.25 * _a); ovk += Math.PI * _r * _r } // Σ πr²(闪核/白爆，最大项)
		for (_i = 0; _i < _bl.length; _i++) { _a = _bl[_i].life / _bl[_i].maxLife; if (_a < 0) _a = 0; _r = _bl[_i].radius * (1 - _a); ovk += 2 * Math.PI * _r * (_bl[_i].ringWidth || 4) } // 环带面积≈2πr·宽
		for (_i = 0; _i < _bm.length; _i++) { var _dx = _bm[_i].x2 - _bm[_i].x1, _dy = _bm[_i].y2 - _bm[_i].y1; ovk += Math.sqrt(_dx * _dx + _dy * _dy) * (_bm[_i].width || 2) * 3 } // 束长×宽×3(双描边近似)
	}
	_lastOv = ovk
	_frameMs = ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - tFrame0
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
	var _vignetteGrad = null   // 受击 vignette 径向渐变缓存：几何仅依赖逻辑分辨率(恒定)，建一次复用，免每帧 createRadialGradient 分配
	function getVignetteGrad() {
		if (_vignetteGrad) { return _vignetteGrad }
		var iw = GAME.logicalWidth, ih = GAME.logicalHeight
		var g = ctx.createRadialGradient(iw / 2, ih / 2, Math.min(iw, ih) * 0.3, iw / 2, ih / 2, Math.max(iw, ih) * 0.65)
		g.addColorStop(0, 'rgba(255,30,60,0)')
		g.addColorStop(1, 'rgba(255,30,60,1)')   // 边缘全不透明，运行时经 globalAlpha 调制峰值(≤0.5)
		_vignetteGrad = g
		return g
	}
	function drawHurtVignette() {                                    // 受击全屏红闪 vignette（屏幕空间，叠在实体之上）
		if (GS.timeSec >= hurtVignetteUntil) { return }
		var remain = hurtVignetteUntil - GS.timeSec
		var a = Math.min(1, remain / HURT_VIGNETTE_SEC) * 0.5       // 最大 0.5 透明度，避免过曝
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		if (global.PerfTier && global.PerfTier.simpleVignette) {    // 自适应分级 POTATO：纯色块替代每帧 createRadialGradient，省分配（零 gameplay）
			ctx.fillStyle = 'rgba(255,30,60,' + (a * 0.6).toFixed(2) + ')'
			ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
		} else {
			ctx.globalAlpha = a   // 复用缓存渐变，经 globalAlpha 调制峰值透明度(≤0.5)，免每帧分配
			ctx.fillStyle = getVignetteGrad()
			ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
			ctx.globalAlpha = 1
		}
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
	if (!RT('PERF.debugHud', CONFIG.PERF.debugHud)) { return }   // 收起 b9 诊断脚手架：默认关闭，GM 面板「性能HUD」一键开；正常运行不显示
	var En = Registry.get('enemy')
	var en = (En && En.countMobs) ? En.countMobs() : 0
	var pa = Registry.get('particle')
	var pc = pa && pa.particles ? pa.particles.length : 0
	var tc = pa && pa.texts ? pa.texts.length : 0
	var bc = pa && pa.beams ? pa.beams.length : 0        // b9-measure：光束活跃数
	var blc = pa && pa.blasts ? pa.blasts.length : 0     // b9-measure：爆环活跃数
	var dc = pa && pa.darts ? pa.darts.length : 0        // b9-measure：飞镖活跃数
	var fcc = pa && pa.flashCores ? pa.flashCores.length : 0   // b9-measure：闪核活跃数
	var fc = pa && pa.DBG ? pa.DBG.flashDrawn : 0           // 白爆/闪核 draw 数（= 活跃闪核，每帧全绘）
	var ig = pa && pa.DBG ? pa.DBG.ignite : 0              // 灼烧 ignite 数
	var fd = pa && pa.DBG ? pa.DBG.fireDot : 0             // 火墙 DOT 命中数
	var ov = (GS.timeSec < hurtVignetteUntil) ? 1 : 0      // 全屏 overlay（受击红 vignette）本帧 draw 数
	var pcMax = RT('PERF.maxParticles', perfFB('maxParticles', CONFIG.PERF.maxParticles))
	var tcMax = RT('PERF.maxTexts', perfFB('maxTexts', CONFIG.PERF.maxTexts))
	var gap = _fps > 0 ? Math.max(0, 1000 / _fps - _cpuMs) : 0   // 呈现gap=实际帧间隔(1000/fps)−主线程JS(cpuMs)；高 FPS(达刷新率上限)时≈vsync 空闲，掉帧时>0 即 JS 之外的等待(GPU 呈现/合成器/GC/系统调度)，坐实"非代码"掉帧
	ctx.save()
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.globalAlpha = 1
	ctx.fillStyle = _fps >= 55 ? '#7CFC00' : (_fps >= 40 ? '#ffd166' : '#ff6b6b')
	ctx.font = '700 13px monospace'
	ctx.textAlign = 'left'
	ctx.fillText('FPS ' + _fps + ' (min ' + (_fpsMin === Infinity ? '-' : Math.round(_fpsMin)) + ')  CPU ' + _cpuMs.toFixed(1) + 'ms' + '  帧 ' + _frameMs.toFixed(1) + 'ms' + '  外部 ' + gap.toFixed(1) + 'ms' + '  画布 ' + canvas.width + 'x' + canvas.height + '  敌 ' + en + '  节 ' + GS.segments + '  p ' + pc + '/' + pcMax + '  t ' + tc + '/' + tcMax, 8, 16)
	ctx.fillStyle = (fc > pcMax * 0.3) ? '#ff8c5b' : '#fff'   // 白爆偏多时高亮告警
	ctx.fillText('蒸汽(VFX) ' + _lastSteamCount + '  引爆(真) ' + (pa && pa.DBG ? pa.DBG.steamBlasts : 0) + '  AOE比较 ' + (pa && pa.DBG ? pa.DBG.steamAoeCmp : 0) + '  白爆(闪核) ' + fc + '  灼烧ignite ' + ig + '  火DOT ' + fd + '  全屏overlay ' + ov, 8, 34)
	var t1 = RT('PERF.suppressWhiteBurst', perfFB('suppressWhiteBurst', false) ? 1 : 0) > 0, t2 = RT('PERF.suppressShake', 0) > 0, t3 = RT('PERF.suppressFireVisual', 0) > 0, t4 = RT('PERF.suppressIceFill', 0) > 0   // b9-measure：T1 白爆抑制开关态（录屏可见，零 gameplay；回退源=PerfTier.suppressWhiteBurst）
	ctx.fillStyle = '#9fe'
	ctx.fillText('T1白爆:' + (t1 ? '关' : '开') + '  T2震:' + (t2 ? '关' : '开') + '  T3火视:' + (t3 ? '关' : '开') + '  T4冰描:' + (t4 ? '关' : '开'), 8, 52)
	ctx.fillStyle = '#9fe'   // b9-measure：6 数组活跃数拆行（看哪个飙到上千）
	ctx.fillText('p ' + pc + '  t ' + tc + '  beam ' + bc + '  blast ' + blc + '  dart ' + dc + '  flash ' + fcc, 8, 70)
	if (En && En.list) {   // BOSS DOT 源实时观测（仅诊断、零 gameplay）：不同来源 fire/shield/burn 加性叠加，同来源单条累计
		var _boss = null
		for (var _bi = 0; _bi < En.list.length; _bi++) { if (En.list[_bi].active && En.list[_bi].type === 'boss') { _boss = En.list[_bi]; break } }
		if (_boss && _boss.dotMap) {
			var _fv = _boss.dotMap.fire || 0, _sv = _boss.dotMap.shield || 0, _bv = _boss.dotMap.burn || 0
			ctx.fillStyle = '#fda'
			ctx.fillText('BOSS DOT: fire=' + _fv.toFixed(1) + '  shield=' + _sv.toFixed(1) + '  burn=' + _bv.toFixed(1), 8, 88)
		}
	}
	ctx.restore()
}

	// —— 屏震四档统一（单一入口 addTrauma；rank:1=T1轻/2=T2中/3=T3强，gating 见 addTrauma）——
	// T0 不震：撞墙滑行（反馈走刮擦火花）/ 普通命中 / 暴击 / 电磁·闪电每次命中（避免 N 敌=N 震）
	// —— 自适应性能分级：HUD 角标显示当前档位 + 换挡事件（不刷屏，仅一行，换挡后短暂高亮原因）——
	var _tierName = 'HIGH', _tierFlashUntil = 0, _tierReason = ''
	Bus.on('perf:tier', function (d) { if (!d) { return } _tierName = d.tier || _tierName; _tierFlashUntil = GS.timeSec + 2.5; _tierReason = d.reason || '' })
	function drawPerfBadge() {
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.font = '600 11px monospace'; ctx.textAlign = 'right'
		ctx.fillStyle = 'rgba(159,223,255,0.7)'
		ctx.fillText('画质 ' + _tierName, GAME.logicalWidth - 8, GAME.logicalHeight - 8)
		if (GS.timeSec < _tierFlashUntil && _tierReason) {
			ctx.fillStyle = 'rgba(255,209,102,0.9)'
			ctx.fillText('→ ' + _tierName + '（' + _tierReason + '）', GAME.logicalWidth - 8, GAME.logicalHeight - 22)
		}
		ctx.restore()
	}
	Bus.on('snake:hurt', function () { addTrauma(3, SHK.death); hurtVignetteUntil = GS.timeSec + HURT_VIGNETTE_SEC })   // 掉 coreHp → T3 强震 + 红闪
	Bus.on('snake:dead', function () { addTrauma(3, SHK.death) })   // game over → T3
	Bus.on('enemy:phase', function () { addTrauma(3, SHK.crit) })   // Boss 换阶段 → T3
	Bus.on('wave:boss_warn', function (d) { bossWarnUntil = GS.timeSec + (d && d.leadSec ? d.leadSec : 0); addTrauma(3, SHK.crit) })   // ⑤ Boss 预警：红边 + T3
	Bus.on('boss:defeated', function () { addTrauma(3, SHK.death) })   // 击败 Boss → T3 通关强震
	Bus.on('enemy:die', function (d) { if (d && d.kind === 'elite') { addTrauma(2, SHK.process) } })   // 精英死 → T2
	Bus.on('combo:found', function () { addTrauma(2, SHK.process) })   // combo 首触 → T2
	Bus.on('fx:steamblast', function (d) {   // 任务2+❷：仅计数；屏震改由 draw() 帧末聚合（≥manyMin→T1 轻档一次，单体 T0 不震）
		if (!d) { return }
		_steamThisFrame++
	})
	Bus.on('core:run_reset', function () { shakeMag = 0; shakeFrames = 0; trauma = 0; bossWarnUntil = 0; hurtVignetteUntil = 0; cam.x = GAME.worldWidth / 2; cam.y = GAME.worldHeight / 2; _traumaGateUntil = 0; _traumaLastRank = 0; _steamThisFrame = 0; _lastSteamCount = 0 })   // 任务2：屏震节流状态归零

	var Render = { init: init, resize: resize, draw: draw, camera: cam, getWorldScale: function () { return worldScale }, setCpuMs: function (v) { _cpuMs = v }, resetFpsMin: function () { _fpsMin = Infinity }, diag: function () { return { fps: _fps, fpsMin: (_fpsMin === Infinity ? 0 : Math.round(_fpsMin)), cpuMs: _cpuMs, frameMs: _frameMs, overlay: (hurtVignetteUntil > GS.timeSec) ? 1 : 0, dc: _lastDc, overdraw: _lastOv } } }   // setCpuMs：main 每帧写入整帧主线程耗时；resetFpsMin：profiler 每 2s 采样后清零窗口，使 fpsMin=窗口内瞬时最低；diag：暴露采样值供 15_profiler 环形日志（零 gameplay；fpsMin=窗口内瞬时最低 FPS，防短暂掉帧漏采；overlay=受击全屏红 vignette 本帧激活；dc=本帧绘制调用数，供坐实绘制调用数归因；overdraw=叠加层填充率估算(px²)唯一真相源）；getWorldScale：main 指针反算还原视图缩放
	Registry.register('render', Render)
	Log.info('render 就绪：镜头跟随 + 世界绘制 + 四档屏震')

	// 📝 修改日志
	// 2026-07-20 · 性能根治第四轮 · 删除"14 火舌绕蛇头一圈"(第二轮"只围头部"回归遗留，被用户判为"蛇头外围怪异环绕粒子"；火墙表现改由蛇身火管+05_particle 沿身余烬承担)；第三轮修复(火墙火管 alpha 0.06→0.16 / 热边提亮加粗 + 移除敌人 pop-in 剔除 + resize scale>0 兜底 + Render.diag) 保留；不动 core/collision/§9/伤害管线，纯渲染表现
	// 2026-07-20 · view-scale-and-dot · 加 worldScale 纯视觉视图缩放(默认0.8，GM滑条0.6–1.0)+getWorldScale 供指针反算；飘字移至白闪之上(修假人无数字)；inView 含 worldScale 半幅；debug HUD 加 BOSS DOT 分源观测；不动 core/collision/§9/伤害管线
	// 2026-07-20 · 性能根治第六轮(还原) · 回退第五轮：火墙软带回 fr*2/0.30(修"蛇身细线")；drawEnemies 复用桶还原 byColor；HUD 去「非JS」指标；并移除视图缩放 worldScale=0.8(还原 commit 1:1 原画面，相机清晰跟随蛇身、可见敌减少→填充率下降治偶发掉帧)；余烬门控(round6 FPS 主修复)保留；不动 core/collision/§9/伤害管线
	// 2026-07-20 · 视图缩放恢复 · 重新应用 worldScale=0.8 纯视觉缩放（draw 内 ctx.scale(ws,ws) + GM「视图缩放」滑条 + 指针反算除 worldScale + inView 已含 worldScale）；修复 round6 误撤导致的蛇/怪变大变糙；FPS 已证为电池能效节流(非填充率)，0.8 反而降 36% 像素量有益无碍；不动 core/collision/§9/伤害管线/蛇画法
	// 2026-07-20 · 视图缩放相机修复 · 变换顺序由「translate(-cam)→scale」改为「scale→translate(-cam)」（scale 在内层围绕屏幕中心）：旧序使 worldScale 掺入相机平移→蛇不居中、视图不紧跟随（下移时蛇被顶到屏幕顶）；新序 cam=蛇世界坐标即蛇恒居中心，且与 pointermove 反除公式、inView(ws 反算半幅) 完全一致；updateCamera clamp 半幅同步改 /ws；ws=1 退化为原行为零回归
	// 2026-07-21 · overdraw 真相源 · draw() 末尾统一估算 overdraw(px²) 存 _lastOv，diag() 暴露 overdraw 字段；原 profiler 自行重算 → 改为共用此唯一真相源，修复「tick 误读 dc.fill 调用次数(量级200~400)当 overdraw(px²)」的单位错配 bug（火被同屏实体多误关且永久卡死）；火墙已优化为单 path+2 stroke 不贡献 fill，真实瓶颈在粒子/白爆/爆环/光束，overdraw 语义与之对齐；不动 core/collision/§9/伤害管线

})(typeof window !== 'undefined' ? window : this)
