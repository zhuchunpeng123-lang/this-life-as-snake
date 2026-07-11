;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Core = global.Core, Log = global.Log
	var M = Core.M
	var COLORS = CONFIG.COLORS

	function newParticle() { return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', drag: 0.88 } }
	function resetParticle(p) { p.active = false }
	function newText() { return { active: false, x: 0, y: 0, vy: -40, life: 0, maxLife: 1, text: '', color: '#fff', size: 14 } }
	function resetText(t) { t.active = false }

	var particlePool = Core.createPool(newParticle, resetParticle, 128)
	var textPool = Core.createPool(newText, resetText, 32)
	var particles = []
	var texts = []

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
		}
	}

	// —— 事件订阅（即时·夸张·层叠）——
	Bus.on('enemy:hit', function (d) {
		var dmg = Math.round(d.damage)
		if (dmg <= 0) { return }                                  // 过滤 ≤0 伤害：绝不显示「0」飘字（防小数/无效伤害刷屏）
		spawnBurst(d.x, d.y, 5, COLORS.damageText, 160, 3, 0.3)
		spawnText(d.x, d.y - 6, '' + dmg, d.crit ? COLORS.critText : COLORS.damageText, d.crit ? 20 : 14)
	})
	Bus.on('enemy:die', function (d) { spawnBurst(d.x, d.y, 12, d.color || COLORS.enemyChaser, 220, 4, 0.5) })
	Bus.on('pickup:eat', function (d) { if (d && d.x != null) { spawnBurst(d.x, d.y, 6, COLORS.food, 120, 3, 0.35) } })
	Bus.on('snake:hurt', function (d) {
		spawnBurst(d.x, d.y, 10, COLORS.boss, 200, 4, 0.5)
		spawnText(d.x, d.y - 10, '-' + (d.damage || 1), COLORS.boss, 18)
	})
	// P1-5 技能视效接收（🟡 颜色/粒子数/步距为表现层占位，候选值见 TODO，待真理源量化后回填）
	Bus.on('fx:bolt', function (d) {
		if (!d || !d.from || !d.to) { return }
		var dx = d.to.x - d.from.x, dy = d.to.y - d.from.y
		var dist = Math.sqrt(dx * dx + dy * dy) || 1
		var steps = Math.max(2, (dist / 20) | 0)   // TODO: 步距 20px（候选 15 / 25）
		for (var s = 0; s <= steps; s++) {
			var t = s / steps
			spawnBurst(d.from.x + dx * t, d.from.y + dy * t, 1, '#ffffff', 30, 2, 0.12)   // TODO: 白色弹道粒子（候选 2颗/0.15s）
		}
		spawnBurst(d.to.x, d.to.y, 4, '#ffeeaa', 80, 3, 0.2)   // TODO: 命中爆点（候选 6颗/100px/0.25s）
	})
	Bus.on('fx:lightning', function (d) {
		if (!d || !d.chain || d.chain.length < 2) { return }
		for (var i = 1; i < d.chain.length; i++) {
			var ax = d.chain[i - 1].x, ay = d.chain[i - 1].y, bx = d.chain[i].x, by = d.chain[i].y
			var segLen = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1
			var steps2 = Math.max(2, (segLen / 25) | 0)   // TODO: 步距 25px（候选 20 / 30）
			for (var s2 = 0; s2 <= steps2; s2++) {
				var t2 = s2 / steps2
				spawnBurst(ax + (bx - ax) * t2, ay + (by - ay) * t2, 1, '#88ccff', 60, 2, 0.18)   // TODO: 蓝白链色（候选 #aaddff）
			}
			spawnBurst(bx, by, 5, '#5599ff', 90, 3, 0.25)   // TODO: 跳跃节点爆点（候选 8颗/110px/0.3s）
		}
	})
	Bus.on('core:run_reset', function () { Particle.clear() })

	Registry.register('particle', Particle)
	Log.info('particle 就绪：池 128/32')

})(typeof window !== 'undefined' ? window : this)
