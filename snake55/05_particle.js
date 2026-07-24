;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Core = global.Core, Log = global.Log
	var M = Core.M
	var COLORS = CONFIG.COLORS
	var STYLE = CONFIG.STYLE, SKFX = CONFIG.STYLE.skillFx   // §5.5 视觉真源 + 五技能标志色（键=代码技能 id）

	// —— 表现债：技能视效参数（🟡 纯表现层，待 ~ 调参器定稿，候选见 TODO；不动 §9）——
	var BOLT_COLOR = SKFX.bolt      // §5.5：飞镖/射击标志色（原白黄 #fff1a8 → STYLE.skillFx.bolt，避开 ui 青）
	var BOLT_LIFE = 0.2             // TODO: 弹道光束存活 0.2s（候选 0.15 / 0.25）
	var BEAM_W_PX = 3               // TODO: 光束线宽 3px（候选 2 / 4）
	var LIGHTNING_COLOR = SKFX.lightning // §5.5：闪电标志色（原蓝白 #9fd0ff → STYLE.skillFx.lightning）
	var LIGHTNING_W_PX = 2          // TODO: 电链线宽 2px（候选 3 / 1.5）
	var LIGHTNING_LIFE = 0.22       // TODO: 电链存活 0.22s（候选 0.18 / 0.28）
	var LIGHTNING_JAG = 14          // TODO: 电链折线抖动 14px（候选 10 / 20）
	var BLAST_COLOR = STYLE.enemyCalm  // §5.5：爆环暖橙（原 #ffb04d → STYLE.enemyCalm，统一暖橙语义）
	var BLAST_LIFE = 0.4            // TODO: 爆环存活 0.4s（候选 0.3 / 0.5）
	var BLAST_RING_W = 4            // TODO: 爆环线宽 4px（候选 3 / 6）
	var HIT_BURST_N = 6             // TODO: 命中爆点 6颗（候选 4 / 8）
	var BOLT_FLY_SEC = 0.14           // TODO: 飞镖视觉飞行时长（候选 0.12 / 0.18）；伤害仍即时判定，纯视觉飞行镖
	var DART_TRAIL_PX = 10            // TODO: 飞镖拖尾占比（候选 8 / 14）
	var DOT_TEXT_COLOR = '#ff7a3c'    // TODO: DOT 飘字专属橙红（候选 #ff6a2c / #ff944d）
	var DOT_TEXT_SIZE = 11            // TODO: DOT 飘字小字号（候选 10 / 12）；与瞬伤大白字 14/20 区分
	// —— B-4 增强：电磁 vs 基础闪电"一眼区分"靠 粗细 / 分叉结构 / 命中残留时长（非只色）· 纯表现 TODO 待 ~ 定稿 ——
	var ELECTRO_W_PX = 5          // TODO: 电磁电链线宽 5px（基础闪电 2px；粗弧拉开）候选 4 / 6
	var ELECTRO_LIFE = 0.34       // TODO: 电磁电链存活 0.34s（基础 0.22；停留更久留得住眼）候选 0.30 / 0.40
	var ELECTRO_JAG = 18          // TODO: 电磁电链折线抖动 18px（更狂野分叉感）候选 14 / 22
	var ELECTRO_BRANCH_N = 8      // TODO: 电磁节点放射分叉数 8（基础无分叉）候选 6 / 10
	var ELECTRO_BRANCH_LIFE = 0.2 // TODO: 电磁分叉/命中残留辉光存活 0.2s（基础无残留）候选 0.15 / 0.25
	var ELECTRO_GLOW_R = 16       // TODO: 电磁命中残留辉光半径 16px（基础无）候选 12 / 20
	// —— B-1 伤害来源标签（🟡 纯表现：飘字前缀+专属色，一眼分清谁打了多少；只读伤害值不碰计算，色板 TODO 待 ~ 定稿）——
	var SRC_STYLE = {
		bolt:      { label: '飞镖 ', color: SKFX.bolt },        // §5.5：飞镖标志色（原青 #2ad4ff → STYLE.skillFx.bolt，避开 ui 青）
		lightning: { label: '闪电 ', color: SKFX.lightning },   // §5.5：闪电标志色（→ STYLE.skillFx.lightning，与 fx:lightning 电链一致）
		electro:   { label: '⚡电磁 ', color: STYLE.elite },    // 电磁炮台连锁：紫（→ STYLE.elite，独立于基础闪电；src='electro' 由 08_skill doLightningChain 透传）
		fire:      { label: '🔥火墙 ', color: '#ff9a3c' },      // 火焰墙 DOT：橙（B-4 衍生：与灼烧引燃分源独立飘字，标签区分）
		burn:      { label: '🔥灼烧 ', color: '#ff5a2c' },      // 灼烧弹幕引燃：红橙（B-4 衍生：与火墙分源独立飘字，色比火墙红以辨识）
		burning:   { label: '🔥灼烧 ', color: '#ff7a3c' },      // 灼烧弹幕 combo：橙（B-4 验收①c 补全：bolt 命中经此标识，与 fx:burndart 橙镖/火环一致；仅飘字前缀，零 gameplay）
		shield:    { label: '🛡护盾 ', color: '#ffe6a3' },      // 护盾接触：白金（候选 #ffd166 / #fff0c2）
		steam:     { label: '💥蒸汽 ', color: '#ffb04d' }       // 蒸汽爆炸：暖橙（候选 #ff8a3d / #ffd27a）
	}

	function newParticle() { return { active: false, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', drag: 0.88, prio: 'high' } }
	function resetParticle(p) { p.active = false }
	function newText() { return { active: false, x: 0, y: 0, prevX: 0, prevY: 0, vy: -40, life: 0, maxLife: 1, text: '', color: '#fff', size: 14, prio: 'high' } }
	function resetText(t) { t.active = false }

	var particlePool = Core.createPool(newParticle, resetParticle, 512)   // b9 性能护栏：齐爆峰值防爆池增长 GC 尖刺（128→512，一次性内存廉价）
	var textPool = Core.createPool(newText, resetText, 32)
	// 光束（fx:bolt / fx:lightning / fx:electroarc 复用），curve=true 走 quadratic 折线；爆环（fx:steamblast）
	function newBeam() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0, curve: false, life: 0, maxLife: 1, width: 2, color: '#fff' } }
	function resetBeam(b) { b.active = false }
	function newBlast() { return { active: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, ringWidth: 4, color: '#fff' } }
	function resetBlast(b) { b.active = false }
	function newDart() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 1, color: '#fff' } }
	function resetDart(b) { b.active = false }
	var beamPool = Core.createPool(newBeam, resetBeam, 64)
	var blastPool = Core.createPool(newBlast, resetBlast, 96)   // b9：爆环池 32→96（蒸汽齐爆峰值）
	var particles = []
	var texts = []
	var beams = []
	var blasts = []
	var dartPool = Core.createPool(newDart, resetDart, 32)
	var darts = []
	var flashPool = Core.createPool(function () { return { active: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, color: '#fff' } }, function (f) { f.active = false }, 96)   // b9：闪核池 32→96（蒸汽白闪/电磁辉光峰值）
	var flashCores = []   // 叠加层实心闪核（蒸汽白闪/电磁辉光），drawOverlay 绘于实体之上
	var DBG = { ignite: 0, fireDot: 0, flashDrawn: 0, steamBlasts: 0, steamAoeCmp: 0 }   // b9-diag/measure：诊断计数器（仅 HUD，零 gameplay；不进 caps/伤害管线）；steamBlasts=本帧真引爆次数(未被 steamFxCap 门控)、steamAoeCmp=蒸汽 AOE 邻居比较总次数
	// b9：VFX 输出硬上限（门控所有进池写入，治"怪多+combo 多"draw 爆炸掉帧）
	//   maxParticles/maxTexts=活跃上限；spawnBudgetPerFrame=每帧生成预算（削平齐爆单帧尖峰）
	//   优先级：high=死亡爆点/蒸汽VFX/combo爆环/玩家受击（尽量保留）；low=enemy:hit 逐次命中火花+伤害飘字/冰减速标签（满时先丢）
	//   走 RT 热调（~ 调参器），不写裸数字；HUD「粒子」供实测下调
	function RT(path, fb) {
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	// §5.5 人工特效降级（叠加在 PerfTier/预算之上；只在生成入口乘倍率，不动池 update/draw）：high=1 / med=0.6 / low=0.3
	function fxScale() { var f = RT('STYLE.fxLevel', STYLE.fxLevel); return f === 'low' ? 0.3 : (f === 'med' ? 0.6 : 1) }
	function fxLow() { return RT('STYLE.fxLevel', STYLE.fxLevel) === 'low' }   // low 档：跳白闪核（overdraw 大头）保可读，飘字/爆环仍在
	function scN(n) { return Math.max(1, Math.round(n * fxScale())) }          // 生成颗数降级（≥1 保可见）；分叉类可另允 0
	function perfFB(field, def) { return (global.PerfTier && global.PerfTier[field] != null) ? global.PerfTier[field] : def }   // 自适应分级：RT 回退源改读 PerfTier 当前档（GM 经 editor.rtSet 仍优先，零双份真相源）
	function maxParticles() { return RT('PERF.maxParticles', perfFB('maxParticles', CONFIG.PERF.maxParticles)) }
	function maxTexts() { return RT('PERF.maxTexts', perfFB('maxTexts', CONFIG.PERF.maxTexts)) }
	function spawnBudget() { return RT('PERF.spawnBudgetPerFrame', perfFB('spawnBudget', CONFIG.PERF.spawnBudgetPerFrame)) }
	var frameSpawn = 0   // 每帧 VFX 生成计数（Particle.update 帧首清零；与 fixed-step 对齐）
	// 优先级挤占：满上限时，high 挤掉最旧 low；low 或无可挤则丢弃（drop-newest）
	function evictLow(pool) { for (var k = 0; k < pool.length; k++) { if (pool[k].prio === 'low') { return k } } return -1 }
	function emitParticle(x, y, vx, vy, life, size, color, drag, prio) {
		if (frameSpawn >= spawnBudget()) { return false }                 // 每帧预算耗尽：丢弃（削平齐爆尖峰）
		if (particles.length >= maxParticles()) {
			if (prio === 'high') { var ei = evictLow(particles); if (ei < 0) { return false } particlePool.release(particles[ei]); particles.splice(ei, 1) }
			else { return false }                                          // 低优先且已满：丢弃
		}
		var p = particlePool.acquire()
		p.active = true; p.x = x; p.y = y; p.prevX = x; p.prevY = y; p.vx = vx; p.vy = vy
		p.life = p.maxLife = life; p.size = size; p.color = color; p.drag = drag; p.prio = prio
		particles.push(p); frameSpawn++; return true
	}
	function emitText(x, y, str, color, size, prio) {
		if (frameSpawn >= spawnBudget()) { return false }
		if (texts.length >= maxTexts()) {
			if (prio === 'high') { var ei = evictLow(texts); if (ei < 0) { return false } textPool.release(texts[ei]); texts.splice(ei, 1) }
			else { return false }
		}
		var t = textPool.acquire()
		t.active = true; t.x = x; t.y = y; t.prevX = x; t.prevY = y; t.vy = -40
		t.life = t.maxLife = 0.8; t.text = str; t.color = color; t.size = size || 14; t.prio = prio
		texts.push(t); frameSpawn++; return true
	}
	function flashCoreCap() { return RT('PERF.flashCoreCap', 16) }   // 并发闪核硬上限：超量丢最旧(保最新视觉)，削平 402k overdraw 尖峰
	function spawnFlashCore(x, y, radius, color, life) {
		if (fxLow()) { return }   // §5.5 low 档：跳白闪核（overdraw 大头）保可读，爆环+飘字仍在
		if (frameSpawn >= spawnBudget()) { return }   // 每帧预算：削平齐爆白闪核尖峰
		if (flashCores.length >= flashCoreCap()) {    // 并发超上限 → 丢最旧(数组头最先老化)，保留最新视觉
			var old = flashCores.shift(); if (old) { flashPool.release(old) }
		}
		var f = flashPool.acquire()
		f.active = true; f.x = x; f.y = y; f.radius = radius; f.color = color
		f.life = f.maxLife = life
		flashCores.push(f); frameSpawn++
	}

	// 生成一段光束：from→to；jag>0 时于中点法向偏移出折线控制点（创建时一次性算，绘制零成本）
	function spawnBeam(x1, y1, x2, y2, color, width, life, jag) {
		if (frameSpawn >= spawnBudget()) { return }   // 每帧预算：削平电链/飞镖束尖峰
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
		if (frameSpawn >= spawnBudget()) { return }   // 每帧预算：削平齐爆爆环尖峰
		var b = blastPool.acquire()
		b.active = true; b.x = x; b.y = y; b.radius = radius; b.color = color; b.ringWidth = BLAST_RING_W
		b.life = b.maxLife = life
		blasts.push(b); frameSpawn++
	}
	function spawnDart(x1, y1, x2, y2, color, life) {   // 飞行镖：从 head 沿弹道插值飞向目标，纯视觉
		if (frameSpawn >= spawnBudget()) { return }   // 每帧预算：削平飞镖尖峰
		var b = dartPool.acquire()
		b.active = true; b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.color = color
		b.life = b.maxLife = life
		darts.push(b); frameSpawn++
	}

	function spawnBurst(x, y, count, color, speed, size, life, prio) {   // prio 默认 high；仅 enemy:hit 逐次命中火花传 'low'，满上限时优先丢弃
		prio = (prio === 'low') ? 'low' : 'high'
		count = scN(count)   // §5.5 特效降级：med/low 减颗数（生成入口，不动池逻辑）
		for (var i = 0; i < count; i++) {
			var a = Math.random() * M.PI2
			var sp = speed * (0.5 + Math.random() * 0.5)
			emitParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life, size * (0.7 + Math.random() * 0.6), color, 0.88, prio)
		}
	}
	function spawnText(x, y, str, color, size, prio) { emitText(x, y, str, color, size, (prio === 'low') ? 'low' : 'high') }   // prio 默认 high；仅 enemy:hit 伤害飘字传 'low'

	// 火墙余烬：视觉绑定「火源=蛇身」而非「敌数」——第三轮误删火 DOT 逐次火花后火墙无粒子感(用户反馈表现力弱)，
	//   但原"每敌每帧 3 颗"随敌数膨胀是 p 350/350 overdraw 真凶。改：每 fixed-step 沿蛇身随机取点喷 n 颗余烬，
	//   数量随火阶微增但受 spawnBudget + low 优先双重门控(池满优先保死亡/蒸汽/伤害 VFX)，总量恒定不随敌数涨(50 敌=5 敌)，零 gameplay
	function spawnFireEmbers() {
		// 自动关火(suppressFire)/GM T3 关火视觉 → 真正停喷余烬（消除 fill 爆炸主因）；与 render 同款读法(perfFB('suppressFire') 为回退源)，零双份真相源
		if (RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0) { return }
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var owned = sk.owned(); if (!(owned.fire > 0)) { return }   // 仅火墙激活
		if (particles.length >= maxParticles() * 0.5) { return }   // 余量门控：池忙(≥半满)时停喷余烬，留 GPU 呼吸低谷，治"焊死 240/240 常载拖帧"
		var s = Registry.get('snake'); if (!s || !s.segments || s.segments.length === 0) { return }
		var segs = s.segments, fi = owned.fire - 1
		var n = scN(Math.min(4, 2 + fi))   // 余烬数：1阶≈2 / 2阶≈3 / 3阶≈4 封顶 4；§5.5 med/low 再降
		for (var ei = 0; ei < n; ei++) {
			var sg = segs[(Math.random() * segs.length) | 0]   // 蛇身随机点（整条火墙燃烧，非单点）
			var a = Math.random() * M.PI2, sp = 30 + Math.random() * 50
			emitParticle(sg.x + (Math.random() * 2 - 1) * 6, sg.y + (Math.random() * 2 - 1) * 6,
				Math.cos(a) * sp, Math.sin(a) * sp - 30,        // 略带上飘：火苗上窜感
				0.35 + Math.random() * 0.2, 1.5 + Math.random() * 1.5,
				Math.random() < 0.5 ? '#ff9a3c' : '#ffd27a', 0.9, 'low')   // low 优先：池满让位死亡/蒸汽/伤害 VFX
		}
	}

	var Particle = {
		particles: particles, texts: texts, spawnBurst: spawnBurst, spawnText: spawnText, beams: beams, blasts: blasts, darts: darts, flashCores: flashCores,   // b9-measure：暴露 6 数组供 HUD 拆行（只读，零 gameplay）
		activeCount: function () { return particles.length + texts.length + beams.length + blasts.length + darts.length + flashCores.length },   // b9 HUD：活跃粒子总数（性能采样）
		DBG: DBG,   // b9-diag：诊断计数器暴露给 render HUD 读取
		incIgnite: function () { DBG.ignite++ },   // b9-diag：灼烧弹幕点燃直计（替代 Bus 事件，免热路径观察者效应；零 gameplay）
		update: function (dt) {
			var i
			frameSpawn = 0   // 每帧预算归零（fixed-step 末尾 sim 已结算，下次 step 重新计）
			spawnFireEmbers()   // 火墙余烬：每 fixed-step 沿蛇身喷（视觉绑定火源，不随敌数膨胀；见 spawnFireEmbers）
			for (i = particles.length - 1; i >= 0; i--) {
				var p = particles[i]
				p.life -= dt
				if (p.life <= 0) { particlePool.release(p); particles.splice(i, 1); continue }
				p.prevX = p.x; p.prevY = p.y; p.x += p.vx * dt; p.y += p.vy * dt
				p.vx *= p.drag; p.vy *= p.drag
			}
		for (i = texts.length - 1; i >= 0; i--) {
			var t = texts[i]
			t.life -= dt
			if (t.life <= 0) { textPool.release(t); texts.splice(i, 1); continue }
			t.prevX = t.x; t.prevY = t.y; t.y += t.vy * dt
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
		for (i = flashCores.length - 1; i >= 0; i--) {
			var fc = flashCores[i]; fc.life -= dt
			if (fc.life <= 0) { flashPool.release(fc); flashCores.splice(i, 1) }
		}
	},
		// 由 render 在世界坐标系下调用；粒子层绘于核心实体之下，飘字小号，永不盖核心信息（JUICE 不干扰）
		drawWorld: function (ctx, ra) {
			if (ra == null) { ra = 1 }
			var i
			for (i = 0; i < particles.length; i++) {
				var p = particles[i]
				var a = p.life / p.maxLife
				if (a < 0) { a = 0 }
				ctx.globalAlpha = a
				ctx.fillStyle = p.color
				ctx.beginPath(); ctx.arc(M.lerp(p.prevX, p.x, ra), M.lerp(p.prevY, p.y, ra), p.size * a, 0, M.PI2); ctx.fill()
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
		},
		// 叠加层：实心闪核（蒸汽白闪/电磁辉光）绘于实体之上；伤害飘字绘于白闪之后，永远不被白闪/实体遮挡
		drawOverlay: function (ctx, ra) {
			if (ra == null) { ra = 1 }
			DBG.flashDrawn = flashCores.length   // b9-diag：本帧白爆/闪核 draw 数（= 活跃闪核，每帧全绘）
			if (!(RT('PERF.suppressWhiteBurst', (global.PerfTier && global.PerfTier.suppressWhiteBurst) ? 1 : 0) > 0)) {   // b9-diag T1：关白爆 overlay 仅挡白闪核，不挡伤害飘字；回退源=PerfTier.suppressWhiteBurst(原写死 0→白爆永不关，本次接线)
				for (var i = 0; i < flashCores.length; i++) {
					var fc = flashCores[i]
					var a = fc.life / fc.maxLife; if (a < 0) { a = 0 }
					ctx.globalAlpha = a * 0.85
					ctx.fillStyle = fc.color
					ctx.beginPath(); ctx.arc(fc.x, fc.y, fc.radius * (1.25 - a * 0.25), 0, M.PI2); ctx.fill()
				}
			}
			// 伤害飘字绘于白闪之上（永远不被白闪/实体遮挡）
			ctx.globalAlpha = 1
			ctx.textAlign = 'center'
			for (var ti = 0; ti < texts.length; ti++) {
				var t = texts[ti]
				ctx.globalAlpha = M.clamp(t.life / t.maxLife * 1.5, 0, 1)
				ctx.fillStyle = t.color
				ctx.font = '700 ' + t.size + 'px system-ui, sans-serif'
				ctx.fillText(t.text, M.lerp(t.prevX, t.x, ra), M.lerp(t.prevY, t.y, ra))
			}
			ctx.globalAlpha = 1
		},
		clear: function () {
			while (particles.length) { particlePool.release(particles.pop()) }
			while (texts.length) { textPool.release(texts.pop()) }
			while (beams.length) { beamPool.release(beams.pop()) }
			while (blasts.length) { blastPool.release(blasts.pop()) }
			while (darts.length) { dartPool.release(darts.pop()) }
			while (flashCores.length) { flashPool.release(flashCores.pop()) }
		}
	}

	// —— 事件订阅（即时·夸张·层叠）——
	Bus.on('enemy:hit', function (d) {
		var dmg = Math.round(d.damage)
		if (dmg <= 0) { return }                                  // 过滤 ≤0 伤害：绝不显示「0」飘字（防小数/无效伤害刷屏）
		var st = (d.src && SRC_STYLE[d.src]) ? SRC_STYLE[d.src] : null   // B-1：按来源取标签+专属色（无来源则回退旧样式）
		var ty = d.y - 6 - (d.r || 0)   // 飘字生成在精灵上方（按命中体半径抬升，修 boss 大精灵盖住伤害数字）
		if (d.isDot) {                                            // ⑦ DOT：专属小橙红飘字（伤害必显）；停喷逐次火花粒子——火墙 MULTI-敌叠加会把粒子池顶爆→GPU overdraw 主因（5 敌 350/350 数据定因）；火墙光环+飘字已足够反馈，零 gameplay
			if (d.src === 'fire') { DBG.fireDot++ }               // b9-diag：火墙 DOT 命中计数（仅 HUD，零 gameplay）
			var dc = st ? st.color : DOT_TEXT_COLOR, dl = st ? st.label : ''
			spawnText(d.x, ty, dl + '-' + dmg, dc, DOT_TEXT_SIZE, 'high')   // 提权 high：火墙/灼烧飘字优先必显（用户要求「伤害一定要表现」），满池时不让位低优先
		} else {
			var col = d.crit ? COLORS.critText : (st ? st.color : COLORS.damageText)   // 暴击金优先，其次来源色
			var lbl = st ? st.label : ''
			spawnBurst(d.x, d.y, 5, st ? st.color : COLORS.damageText, 160, 3, 0.3, 'low')
			spawnText(d.x, ty, lbl + '-' + dmg, col, d.crit ? 20 : 14, 'high')   // 瞬伤/蒸汽飘字提权 high：满池时不让位 low 标签（冰减速等），确保伤害数字必现（修"假人无数字/蒸汽飘字不全"）
		}
	})
	Bus.on('enemy:die', function (d) { spawnBurst(d.x, d.y, 12, d.color || STYLE.enemy, 220, 4, 0.5) })   // 死亡爆花取威胁色（d.color 来自 07_enemy STYLE 色阶）
	Bus.on('pickup:eat', function (d) { if (d && d.x != null) { spawnBurst(d.x, d.y, 6, STYLE.food, 120, 3, 0.35) } })   // 吃拾取金色爆花
	Bus.on('snake:hurt', function (d) {                                   // 受击：红色爆花+红飘字（危险语义，配合 render 全屏红闪+蛇头红闪+轻震屏）
		spawnBurst(d.x, d.y, 10, STYLE.enemy, 200, 4, 0.5)
		spawnText(d.x, d.y - 10, '-' + (d.damage || 1), STYLE.enemy, 18)
	})
	// 需求B 技能视效接收（🟡 参数见顶部表现债常量块 TODO+候选，不动 §9）
	Bus.on('fx:bolt', function (d) {
		if (!d || !d.from || !d.to) { return }
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, BOLT_COLOR, BOLT_FLY_SEC)   // 飞行镖（纯视觉，伤害仍即时判定）
		spawnBurst(d.to.x, d.to.y, HIT_BURST_N, BOLT_COLOR, 90, 3, 0.25)                     // 少量命中爆点
	})
	// B-3：灼烧弹幕飞镖视觉（橙 #ff7a3c，与基础白黄 fx:bolt 区分；事件名全小写）
	Bus.on('fx:burndart', function (d) {
		if (!d || !d.from || !d.to) { return }
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, SKFX.fire, BOLT_FLY_SEC)   // 橙色飞行镖（燃烧弹，STYLE.skillFx.fire）
		spawnBurst(d.to.x, d.to.y, 10, SKFX.fire, 170, 4, 0.3)                  // 更大更亮橙焰爆点（命中处）
		spawnBurst(d.to.x, d.to.y, 5, '#ffd27a', 120, 3, 0.22)                   // 内芯亮黄爆点（层次）
	})
	Bus.on('fx:lightning', function (d) {
		if (!d || !d.chain || d.chain.length < 2) { return }
		for (var i = 1; i < d.chain.length; i++) {
			var a = d.chain[i - 1], b = d.chain[i]
			spawnBeam(a.x, a.y, b.x, b.y, LIGHTNING_COLOR, LIGHTNING_W_PX, LIGHTNING_LIFE, LIGHTNING_JAG)  // 蓝白折线电链
			spawnBurst(b.x, b.y, HIT_BURST_N, LIGHTNING_COLOR, 100, 3, 0.25)                               // 节点爆点
		}
	})
	// B-4 增强：电磁炮台连锁闪电视觉（紫 #c9a8ff）——
	// 与基础蓝白 fx:lightning 的区分维度＝粗弧(ELECTRO_W_PX) + 节点多分叉(ELECTRO_BRANCH_N) + 命中残留辉光(ELECTRO_BRANCH_LIFE)；
	// 基础闪电保持细/快/蓝白/单链/无残留，靠简洁对比；事件名全小写。零 gameplay（不改伤害/连锁/射程/冷却/判定）
	Bus.on('fx:electroarc', function (d) {
		if (!d || !d.chain || d.chain.length < 2) { return }
		var h0 = d.chain[0]
		spawnFlashCore(h0.x, h0.y, ELECTRO_GLOW_R + 4, 'rgba(201,168,255,0.55)', ELECTRO_BRANCH_LIFE + 0.05)  // 蛇头炮台紫辉光（实体之上，比基础闪电多一层残留）
		for (var i = 1; i < d.chain.length; i++) {
			var a = d.chain[i - 1], b = d.chain[i]
			spawnBeam(a.x, a.y, b.x, b.y, STYLE.elite, ELECTRO_W_PX, ELECTRO_LIFE, ELECTRO_JAG)   // 紫色粗弧电链（STYLE.elite；比基础闪电粗、存活更久）
			spawnBurst(b.x, b.y, HIT_BURST_N, STYLE.elite, 110, 3, 0.25)                          // 节点紫爆点
			spawnFlashCore(b.x, b.y, ELECTRO_GLOW_R, 'rgba(201,168,255,0.5)', ELECTRO_BRANCH_LIFE)  // 命中残留紫辉光（~0.2s afterglow；基础闪电无，靠此拉开停留时长）
			for (var r = 0; r < ELECTRO_BRANCH_N; r++) {                                        // 节点多分叉放射紫电芒（基础闪电无分叉）
				var ra = (r / ELECTRO_BRANCH_N) * M.PI2 + Math.random() * 0.3, rl = 16 + Math.random() * 14
				spawnBeam(b.x, b.y, b.x + Math.cos(ra) * rl, b.y + Math.sin(ra) * rl, STYLE.elite, 2, ELECTRO_BRANCH_LIFE, 0)
			}
		}
	})
	// 需求B：steamExplosion 等的周期爆闪（爆心由调用方传入真实坐标）
	Bus.on('fx:steamblast', function (d) {
		if (!d || d.x == null || d.y == null || !d.radius) { return }
		spawnFlashCore(d.x, d.y, d.radius * 0.7, 'rgba(255,255,255,0.92)', 0.22)   // 实心白闪核（绘于实体之上，不被盖；round6 稳定版，纯表现，零 gameplay）
		spawnBlast(d.x, d.y, d.radius, 'rgba(255,255,255,0.8)', 0.55)              // 白色蒸汽云扩张≈r90（亮度上调）
		spawnBlast(d.x, d.y, d.radius * 0.4, '#fff3d6', 0.18)                 // 中心暖橙/亮白爆闪（短命高亮）
		spawnBurst(d.x, d.y, HIT_BURST_N, BLAST_COLOR, 180, 4, 0.35)          // 少量暖橙爆散团（呼应原爆环色）
		for (var w = 0; w < 7; w++) {                                                // 上升白色蒸汽（vy<0，~0.5s）· high 优先（蒸汽 VFX 尽量保留）
			var px = d.x + (Math.random() * 2 - 1) * d.radius * 0.3
			var py = d.y + (Math.random() * 2 - 1) * d.radius * 0.3
			emitParticle(px, py, (Math.random() * 2 - 1) * 20, -(50 + Math.random() * 60), 0.5, 4 + Math.random() * 4, 'rgba(255,255,255,0.6)', 0.92, 'high')
		}
		for (var ic = 0; ic < 8; ic++) {                                            // 浅蓝冰晶碎屑（呼应冰只控）：径向迸射 · high 优先
			var ia = Math.random() * M.PI2, isp = 120 + Math.random() * 120
			emitParticle(d.x, d.y, Math.cos(ia) * isp, Math.sin(ia) * isp, 0.45, 2 + Math.random() * 2, SKFX.ice, 0.9, 'high')
		}
	})
	// b9-diag：灼烧弹幕点燃计数改为 direct DBG.ignite++（见 incIgnite），不在热路径发 Bus 事件（已确认无 gameplay listener，纯诊断噪声）
	// B-2：敌人进入冰区 → 蓝字「减速」+ 小爆点（坐标用敌人位置；跨层走 Bus，不直调；事件名须全小写以过 Bus 断言）
	Bus.on('fx:iceslow', function (d) {
		if (!d || d.x == null || d.y == null) { return }
		emitText(d.x, d.y - 6 - (d.r || 12), '减速', SKFX.ice, 12, 'low')   // 减速标签：low 优先（满上限时丢弃，不抢伤害飘字预算）
		spawnBurst(d.x, d.y, 3, SKFX.ice, 90, 2, 0.25)
	})
	// ⑥ 首测 A：冰锥从尾部甩出 → 飞向落点（纯视觉，伤害即时判定于池内）+ 落点霜环预告（读"要在这冻"）
	Bus.on('fx:ice_throw', function (d) {
		if (!d || !d.from || !d.to) { return }
		var travel = d.travel || 0.16   // 飞行时长与 08_skill ICE_THROW_SEC 同源
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, SKFX.ice, travel)   // 冰锥飞行（尾→落点）
		spawnBlast(d.to.x, d.to.y, d.r || 40, 'rgba(159,220,255,0.45)', 0.15)   // 落地预告霜环（极短，读"要在这冻"）
	})
	// ⑥ 首测 A：冰锥到达落点 → 霜环扩张淡出 + 冰晶爆点（冰池生长动画由 render 读 icePools.growT 承担）
	Bus.on('fx:ice_pool', function (d) {
		if (!d || d.x == null || d.y == null) { return }
		spawnBlast(d.x, d.y, d.r || 40, 'rgba(225,243,255,0.75)', 0.3)   // 落点霜环扩张淡出
		spawnBurst(d.x, d.y, 6, SKFX.ice, 110, 3, 0.28)                  // 冰晶爆点
	})
	Bus.on('core:run_reset', function () { Particle.clear() })

	Registry.register('particle', Particle)
	Log.info('particle 就绪：池 粒子512/字32/束64/爆96/镖32/闪96')

	// 📝 修改日志
	// 2026-07-20 · 性能根治第四轮 · 新增 spawnFireEmbers()：火墙余烬改绑定"火源=蛇身"(每 fixed-step 沿蛇身随机喷 n 颗，n=min(4,2+火阶))，受 spawnBudget+low 优先门控，总量恒定不随敌数膨胀(修第三轮删火 DOT 粒子后"火墙无粒子感/表现力弱"的反馈)；第三轮保留项：isDot 伤害飘字提权 high(伤害必显)、瞬伤/死亡/蒸汽/电磁/闪电 VFX 全保留；不动 §9/伤害管线
	// 2026-07-20 · view-scale-and-dot · enemy:hit 非DOT 瞬伤/蒸汽飘字提权 high(满池必现)；飘字绘制从 drawWorld 移至 drawOverlay 白闪之后(永远不被白闪遮挡，修假人无数字)；不动 §9/伤害管线
	// 2026-07-20 · 性能根治第六轮(还原) · 回退第五轮 spawnFlashCore 并发上限 FLASH_CORE_CAP 与 fx:steamblast 白闪核半径/alpha 收窄；还原 round6 闪核表现；余烬门控(round6 FPS 主修复)保留；不动 §9/伤害管线/判定

})(typeof window !== 'undefined' ? window : this)
