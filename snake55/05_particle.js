;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Core = global.Core, Log = global.Log
	var M = Core.M
	var COLORS = CONFIG.COLORS

	// —— 表现债：技能视效参数（🟡 纯表现层，待 ~ 调参器定稿，候选见 TODO；不动 §9）——
	var BOLT_COLOR = '#fff1a8'      // TODO: 弹道光束色 白黄（候选 #ffffff / #ffe066）
	var BOLT_LIFE = 0.2             // TODO: 弹道光束存活 0.2s（候选 0.15 / 0.25）
	var BEAM_W_PX = 3               // TODO: 光束线宽 3px（候选 2 / 4）
	var LIGHTNING_COLOR = '#9fd0ff' // TODO: 电链色 蓝白（候选 #bfe3ff / #88ccff）
	var LIGHTNING_W_PX = 2          // TODO: 电链线宽 2px（候选 3 / 1.5）
	var LIGHTNING_LIFE = 0.22       // TODO: 电链存活 0.22s（候选 0.18 / 0.28）
	var LIGHTNING_JAG = 14          // TODO: 电链折线抖动 14px（候选 10 / 20）
	var BLAST_COLOR = '#ffb04d'     // TODO: 爆环色 暖橙（候选 #ff8a3d / #ffd27a）
	var BLAST_LIFE = 0.4            // TODO: 爆环存活 0.4s（候选 0.3 / 0.5）
	var BLAST_RING_W = 4            // TODO: 爆环线宽 4px（候选 3 / 6）
	var HIT_BURST_N = 6             // TODO: 命中爆点 6颗（候选 4 / 8）
	var BOLT_FLY_SEC = 0.14           // TODO: 飞镖视觉飞行时长（候选 0.12 / 0.18）；伤害仍即时判定，纯视觉飞行镖
	var DART_TRAIL_PX = 10            // TODO: 飞镖拖尾占比（候选 8 / 14）
	var DOT_TEXT_COLOR = '#ff7a3c'    // TODO: DOT 飘字专属橙红（候选 #ff6a2c / #ff944d）
	var DOT_TEXT_SIZE = 11            // TODO: DOT 飘字小字号（候选 10 / 12）；与瞬伤大白字 14/20 区分
	// —— B-1 伤害来源标签（🟡 纯表现：飘字前缀+专属色，一眼分清谁打了多少；只读伤害值不碰计算，色板 TODO 待 ~ 定稿）——
	var SRC_STYLE = {
		bolt:      { label: '飞镖 ', color: '#2ad4ff' },        // 飞镖：青（候选 #29c7ff / #3fe0ff）
		lightning: { label: '闪电 ', color: '#c9a8ff' },        // 闪电：紫（候选 #b98cff / #d8bcff）
		fire:      { label: '🔥DOT ', color: DOT_TEXT_COLOR },  // 火焰 DOT：橙（持续跳）
		burn:      { label: '🔥DOT ', color: DOT_TEXT_COLOR },  // 灼烧弹幕引燃：同火焰橙
		shield:    { label: '🛡护盾 ', color: '#ffe6a3' },      // 护盾接触：白金（候选 #ffd166 / #fff0c2）
		steam:     { label: '💥蒸汽 ', color: '#ffb04d' }       // 蒸汽爆炸：暖橙（候选 #ff8a3d / #ffd27a）
	}

	function newParticle() { return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', drag: 0.88 } }
	function resetParticle(p) { p.active = false }
	function newText() { return { active: false, x: 0, y: 0, vy: -40, life: 0, maxLife: 1, text: '', color: '#fff', size: 14 } }
	function resetText(t) { t.active = false }

	var particlePool = Core.createPool(newParticle, resetParticle, 128)
	var textPool = Core.createPool(newText, resetText, 32)
	// 光束（fx:bolt / fx:lightning 复用），curve=true 走 quadratic 折线；爆环（fx:blast）
	function newBeam() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0, curve: false, life: 0, maxLife: 1, width: 2, color: '#fff' } }
	function resetBeam(b) { b.active = false }
	function newBlast() { return { active: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, ringWidth: 4, color: '#fff' } }
	function resetBlast(b) { b.active = false }
	function newDart() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 1, color: '#fff' } }
	function resetDart(b) { b.active = false }
	var beamPool = Core.createPool(newBeam, resetBeam, 64)
	var blastPool = Core.createPool(newBlast, resetBlast, 32)
	var particles = []
	var texts = []
	var beams = []
	var blasts = []
	var dartPool = Core.createPool(newDart, resetDart, 32)
	var darts = []

	// 生成一段光束：from→to；jag>0 时于中点法向偏移出折线控制点（创建时一次性算，绘制零成本）
	function spawnBeam(x1, y1, x2, y2, color, width, life, jag) {
		var b = beamPool.acquire()
		b.active = true; b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.width = width; b.color = color
		b.curve = !!jag
		if (jag) {
			var mx = (x1 + x2) / 2, my = (y1 + y2) / 2
			var nx = -(y2 - y1), ny = (x2 - x1), nl = Math.sqrt(nx * nx + ny * ny) || 1
			var off = (Math.random() * 2 - 1) * jag
			b.cx = mx + (nx / nl) * off; b.cy = my + (ny / nl) * off
		}
		b.life = b.maxLife = life
		beams.push(b)
	}
	// 生成扩张爆环 + 少量爆散团（爆散团走小圆点粒子）
	function spawnBlast(x, y, radius, color, life) {
		var b = blastPool.acquire()
		b.active = true; b.x = x; b.y = y; b.radius = radius; b.color = color; b.ringWidth = BLAST_RING_W
		b.life = b.maxLife = life
		blasts.push(b)
	}
	function spawnDart(x1, y1, x2, y2, color, life) {   // 飞行镖：从 head 沿弹道插值飞向目标，纯视觉
		var b = dartPool.acquire()
		b.active = true; b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.color = color
		b.life = b.maxLife = life
		darts.push(b)
	}

	function spawnBurst(x, y, count, color, speed, size, life) {
		for (var i = 0; i < count; i++) {
			var p = particlePool.acquire()
			var a = Math.random() * M.PI2
			var sp = speed * (0.5 + Math.random() * 0.5)
			p.active = true; p.x = x; p.y = y
			p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp
			p.life = p.maxLife = life
			p.size = size * (0.7 + Math.random() * 0.6)
			p.color = color; p.drag = 0.88
			particles.push(p)
		}
	}
	function spawnText(x, y, str, color, size) {
		var t = textPool.acquire()
		t.active = true; t.x = x; t.y = y; t.vy = -40
		t.life = t.maxLife = 0.8; t.text = str; t.color = color; t.size = size || 14
		texts.push(t)
	}

	var Particle = {
		particles: particles, texts: texts, spawnBurst: spawnBurst, spawnText: spawnText,
		update: function (dt) {
			var i
			for (i = particles.length - 1; i >= 0; i--) {
				var p = particles[i]
				p.life -= dt
				if (p.life <= 0) { particlePool.release(p); particles.splice(i, 1); continue }
				p.x += p.vx * dt; p.y += p.vy * dt
				p.vx *= p.drag; p.vy *= p.drag
			}
		for (i = texts.length - 1; i >= 0; i--) {
			var t = texts[i]
			t.life -= dt
			if (t.life <= 0) { textPool.release(t); texts.splice(i, 1); continue }
			t.y += t.vy * dt
		}
		for (i = beams.length - 1; i >= 0; i--) {
			var b = beams[i]; b.life -= dt
			if (b.life <= 0) { beamPool.release(b); beams.splice(i, 1) }
		}
		for (i = blasts.length - 1; i >= 0; i--) {
			var bl = blasts[i]; bl.life -= dt
			if (bl.life <= 0) { blastPool.release(bl); blasts.splice(i, 1) }
		}
		for (i = darts.length - 1; i >= 0; i--) {
			var da = darts[i]; da.life -= dt
			if (da.life <= 0) { dartPool.release(da); darts.splice(i, 1) }
		}
	},
		// 由 render 在世界坐标系下调用；粒子层绘于核心实体之下，飘字小号，永不盖核心信息（JUICE 不干扰）
		drawWorld: function (ctx) {
			var i
			for (i = 0; i < particles.length; i++) {
				var p = particles[i]
				var a = p.life / p.maxLife
				if (a < 0) { a = 0 }
				ctx.globalAlpha = a
				ctx.fillStyle = p.color
				ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, M.PI2); ctx.fill()
			}
			// 光束：廉价双描边发光（宽+低透明打底 + 窄+高亮覆盖），避免 shadowBlur 拖帧（验收⑤）
			ctx.lineCap = 'round'
			for (i = 0; i < beams.length; i++) {
				var b = beams[i]
				var ba = b.life / b.maxLife
				if (ba < 0) { ba = 0 }
				ctx.beginPath()
				if (b.curve) { ctx.moveTo(b.x1, b.y1); ctx.quadraticCurveTo(b.cx, b.cy, b.x2, b.y2) }
				else { ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2) }
				ctx.globalAlpha = ba * 0.35; ctx.strokeStyle = b.color; ctx.lineWidth = b.width * 3; ctx.stroke()
			ctx.globalAlpha = ba; ctx.strokeStyle = b.color; ctx.lineWidth = b.width; ctx.stroke()
		}
		// 飞行镖（fx:bolt）：沿弹道插值飞行 + 拖尾，纯视觉（伤害即时判定）
		ctx.lineCap = 'round'
		for (i = 0; i < darts.length; i++) {
			var da = darts[i]
			var dtp = 1 - da.life / da.maxLife; if (dtp < 0) { dtp = 0 }
			var dax = da.x1 + (da.x2 - da.x1) * dtp, day = da.y1 + (da.y2 - da.y1) * dtp
			var daa = da.life / da.maxLife; if (daa < 0) { daa = 0 }
			var tb = Math.max(0, dtp - 0.35), tx2 = da.x1 + (da.x2 - da.x1) * tb, ty2 = da.y1 + (da.y2 - da.y1) * tb
			ctx.globalAlpha = daa * 0.5; ctx.strokeStyle = da.color; ctx.lineWidth = 3
			ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(dax, day); ctx.stroke()
			ctx.globalAlpha = daa; ctx.fillStyle = da.color
			ctx.beginPath(); ctx.arc(dax, day, 4 * daa + 2, 0, M.PI2); ctx.fill()
		}
		// 爆环：随寿命从中心扩张并淡出（p=1→0 进度）
			for (i = 0; i < blasts.length; i++) {
				var bl = blasts[i]
				var bla = bl.life / bl.maxLife
				if (bla < 0) { bla = 0 }
				var prog = 1 - bla
				ctx.globalAlpha = bla * 0.6; ctx.strokeStyle = bl.color; ctx.lineWidth = bl.ringWidth
				ctx.beginPath(); ctx.arc(bl.x, bl.y, Math.max(1, bl.radius * prog), 0, M.PI2); ctx.stroke()
			}
			ctx.globalAlpha = 1
			ctx.textAlign = 'center'
			for (i = 0; i < texts.length; i++) {
				var t = texts[i]
				ctx.globalAlpha = M.clamp(t.life / t.maxLife * 1.5, 0, 1)
				ctx.fillStyle = t.color
				ctx.font = '700 ' + t.size + 'px system-ui, sans-serif'
				ctx.fillText(t.text, t.x, t.y)
			}
			ctx.globalAlpha = 1
		},
		clear: function () {
			while (particles.length) { particlePool.release(particles.pop()) }
			while (texts.length) { textPool.release(texts.pop()) }
			while (beams.length) { beamPool.release(beams.pop()) }
			while (blasts.length) { blastPool.release(blasts.pop()) }
		while (darts.length) { dartPool.release(darts.pop()) }
		}
	}

	// —— 事件订阅（即时·夸张·层叠）——
	Bus.on('enemy:hit', function (d) {
		var dmg = Math.round(d.damage)
		if (dmg <= 0) { return }                                  // 过滤 ≤0 伤害：绝不显示「0」飘字（防小数/无效伤害刷屏）
		var st = (d.src && SRC_STYLE[d.src]) ? SRC_STYLE[d.src] : null   // B-1：按来源取标签+专属色（无来源则回退旧样式）
		var ty = d.y - 6 - (d.r || 0)   // 飘字生成在精灵上方（按命中体半径抬升，修 boss 大精灵盖住伤害数字）
		if (d.isDot) {                                            // ⑦ DOT：专属小橙红飘字 + 小爆点，与瞬伤大白字明显区分
			var dc = st ? st.color : DOT_TEXT_COLOR, dl = st ? st.label : ''
			spawnBurst(d.x, d.y, 3, dc, 120, 2, 0.25)
			spawnText(d.x, ty, dl + '-' + dmg, dc, DOT_TEXT_SIZE)
		} else {
			var col = d.crit ? COLORS.critText : (st ? st.color : COLORS.damageText)   // 暴击金优先，其次来源色
			var lbl = st ? st.label : ''
			spawnBurst(d.x, d.y, 5, st ? st.color : COLORS.damageText, 160, 3, 0.3)
			spawnText(d.x, ty, lbl + '-' + dmg, col, d.crit ? 20 : 14)
		}
	})
	Bus.on('enemy:die', function (d) { spawnBurst(d.x, d.y, 12, d.color || COLORS.enemyChaser, 220, 4, 0.5) })
	Bus.on('pickup:eat', function (d) { if (d && d.x != null) { spawnBurst(d.x, d.y, 6, COLORS.food, 120, 3, 0.35) } })
	Bus.on('snake:hurt', function (d) {
		spawnBurst(d.x, d.y, 10, COLORS.boss, 200, 4, 0.5)
		spawnText(d.x, d.y - 10, '-' + (d.damage || 1), COLORS.boss, 18)
	})
	// 需求B 技能视效接收（🟡 参数见顶部表现债常量块 TODO+候选，不动 §9）
	Bus.on('fx:bolt', function (d) {
		if (!d || !d.from || !d.to) { return }
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, BOLT_COLOR, BOLT_FLY_SEC)   // 飞行镖（纯视觉，伤害仍即时判定）
		spawnBurst(d.to.x, d.to.y, HIT_BURST_N, BOLT_COLOR, 90, 3, 0.25)                     // 少量命中爆点
	})
	Bus.on('fx:lightning', function (d) {
		if (!d || !d.chain || d.chain.length < 2) { return }
		for (var i = 1; i < d.chain.length; i++) {
			var a = d.chain[i - 1], b = d.chain[i]
			spawnBeam(a.x, a.y, b.x, b.y, LIGHTNING_COLOR, LIGHTNING_W_PX, LIGHTNING_LIFE, LIGHTNING_JAG)  // 蓝白折线电链
			spawnBurst(b.x, b.y, HIT_BURST_N, LIGHTNING_COLOR, 100, 3, 0.25)                               // 节点爆点
		}
	})
	// 需求B：steamExplosion 等的周期爆闪（爆心由调用方传入真实坐标）
	Bus.on('fx:blast', function (d) {
		if (!d || d.x == null || d.y == null || !d.radius) { return }
		spawnBlast(d.x, d.y, d.radius, BLAST_COLOR, BLAST_LIFE)          // 扩张暖橙爆环
		spawnBurst(d.x, d.y, HIT_BURST_N, BLAST_COLOR, 180, 4, 0.35)     // 少量爆散团
	})
	Bus.on('core:run_reset', function () { Particle.clear() })

	Registry.register('particle', Particle)
	Log.info('particle 就绪：池 128/32')

})(typeof window !== 'undefined' ? window : this)
