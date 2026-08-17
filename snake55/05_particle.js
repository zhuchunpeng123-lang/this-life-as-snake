;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Core = global.Core, Log = global.Log
	var M = Core.M
	var COLORS = CONFIG.COLORS
	var STYLE = CONFIG.STYLE, SKFX = CONFIG.STYLE.skillFx   // §5.5 视觉真源 + 五技能标志色（键=代码技能 id）
	var COMBAT_FX = STYLE.combatFx || {}, COMBAT_E = COMBAT_FX.electro || {}, COMBAT_TEXT = COMBAT_FX.text || {}, COMBAT_TIERS = COMBAT_TEXT.tiers || {}, SKILL_VFX = COMBAT_FX.skillVfx || {}, RANGED_VFX = SKILL_VFX.ranged || {}, BOLT_VFX = RANGED_VFX.bolt || {}, BURNING_VFX = RANGED_VFX.burning || {}

	// —— 表现债：技能视效参数（🟡 纯表现层，待 ~ 调参器定稿，候选见 TODO；不动 §9）——
	var BOLT_COLOR = SKFX.bolt      // §5.5：飞镖/射击标志色（原白黄 #fff1a8 → STYLE.skillFx.bolt，避开 ui 青）
	var BOLT_LIFE = 0.2             // TODO: 弹道光束存活 0.2s（候选 0.15 / 0.25）
	var BEAM_W_PX = 3               // TODO: 光束线宽 3px（候选 2 / 4）
	var LIGHTNING_COLOR = SKFX.lightning // §5.5：闪电标志色（原蓝白 #9fd0ff → STYLE.skillFx.lightning）
	var BLAST_COLOR = STYLE.enemyCalm  // §5.5：爆环暖橙（原 #ffb04d → STYLE.enemyCalm，统一暖橙语义）
	var BLAST_LIFE = 0.4            // TODO: 爆环存活 0.4s（候选 0.3 / 0.5）
	var BLAST_RING_W = 4            // TODO: 爆环线宽 4px（候选 3 / 6）
	var HIT_BURST_N = 6             // TODO: 命中爆点 6颗（候选 4 / 8）
	// 飞镖技能族 V4：世界实体保持小而扁平；强度来自齐射节奏/轨迹/命中，不靠 PNG 巨型化。伤害仍即时判定。
	var BOLT_FLY_MIN_BY_LEVEL = [0.30, 0.285, 0.27, 0.25, 0.23]
	var BOLT_FLY_MAX_BY_LEVEL = [0.42, 0.40, 0.37, 0.34, 0.31]   // V5.1：增加在屏时间；仍保留前慢后快
	var BOLT_KILL_FLY_MIN_SEC = 0.12, BOLT_KILL_FLY_MAX_SEC = 0.17
	var DART_TRAIL_PX = 14
	var BOLT_WORLD_PX = 34, BURN_DART_WORLD_PX = 44
	var DART_BODY_HEIGHT_SCALE = 1.0
	var BOLT_SPRITE_SRC = 'assets/vfx/bolt_world_v5_2_battletone.png'
	var BURN_DART_SPRITE_SRC = 'assets/vfx/burning_barrage_dart_v5_2_tailfire.png'
	var FIRE_HIT_SPRITE_SRC = 'assets/vfx/fire/vfx_fire_hit_burst_v1.png'
	var ICE_BLOOM_SPRITE_SRC = 'assets/vfx/ice/vfx_ice_crystal_bloom_v1.png'
	var STEAM_BURST_SPRITE_SRC = 'assets/vfx/steam/vfx_steam_blast_main_v1.png'
	var BURN_TRAIL = '#ff6f26', BURN_TRAIL_HOT = '#ffd36a'
	var DART_LAUNCH_LIFE = 0.06
	var DOT_TEXT_COLOR = '#ff7a3c'    // TODO: DOT 飘字专属橙红（候选 #ff6a2c / #ff944d）
	var DOT_TEXT_SIZE = 10            // P2-10：DOT 飘字缩小字号（候选 10/12）；与瞬伤 12/16 区分，别糊屏
	// —— B-1 伤害来源标签（🟡 纯表现：飘字前缀+专属色，一眼分清谁打了多少；只读伤害值不碰计算，色板 TODO 待 ~ 定稿）——
	var SRC_STYLE = {
		bolt:      { label: '飞镖 ', color: SKFX.bolt },        // §5.5：飞镖标志色（原青 #2ad4ff → STYLE.skillFx.bolt，避开 ui 青）
		lightning: { label: '闪电 ', color: SKFX.lightning },   // §5.5：闪电标志色（→ STYLE.skillFx.lightning，与 fx:lightning 电链一致）
		electro:   { label: '电磁 ', color: COMBAT_E.text },   // 电磁炮台：暂与现有来源标签体系一致，显示“电磁 数字”
		fire:      { label: '🔥火墙 ', color: '#ff9a3c' },      // 火焰墙 DOT：橙（B-4 衍生：与灼烧引燃分源独立飘字，标签区分）
		burn:      { label: '🔥灼烧 ', color: '#ff5a2c' },      // 灼烧弹幕引燃：红橙（B-4 衍生：与火墙分源独立飘字，色比火墙红以辨识）
		burning:   { label: '🔥灼烧 ', color: '#ff7a3c' },      // 灼烧弹幕 combo：橙（B-4 验收①c 补全：bolt 命中经此标识，与 fx:burndart 橙镖/火环一致；仅飘字前缀，零 gameplay）
		shield:    { label: '🛡护盾 ', color: '#ffe6a3' },      // 护盾接触：白金（候选 #ffd166 / #fff0c2）
		steam:     { label: '💥蒸汽 ', color: '#ffb04d' }       // 蒸汽爆炸：暖橙（候选 #ff8a3d / #ffd27a）
	}

	var ELECTRIC = ((CONFIG.VFX || {}).electric) || {}
	var ELECTRIC_L = ELECTRIC.lightning || {}
	var ELECTRIC_E = ELECTRIC.electro || {}
	var ELECTRO_COMBO = ((CONFIG.COMBO || {}).electroTurret) || {}
	var ELECTRIC_WHITE = STYLE.textMain
	var lightningFxState = null
	var electroVfxState = { active: false, phase: 'inactive', x: 0, y: 0, age: 0, comboLevel: 1, fireAge: 999, targets: [], scanAge: 999, deployAge: 0, collapseAge: 0, aimAngle: 0 }
	var electroImpacts = [
		{ active: false, targetId: null, x: 0, y: 0, age: 999 },
		{ active: false, targetId: null, x: 0, y: 0, age: 999 },
		{ active: false, targetId: null, x: 0, y: 0, age: 999 }
	]
	// 世界层专用夜庭晶环 PNG：只加载一次；程序层叠加呼吸、汇能、炮口、束线与命中。加载失败时回退程序化晶体节点。
	var electroSprite = null, electroSpriteReady = false
	if (global.Image && ELECTRIC_E.spriteSrc) {
		electroSprite = new global.Image()
		electroSprite.onload = function () { electroSpriteReady = true }
		electroSprite.onerror = function () { electroSpriteReady = false }
		electroSprite.src = ELECTRIC_E.spriteSrc
	}
	// 飞镖 V4.2 世界素材：UI 图标继续走原 skill_bolt/combo_burningBarrage；战斗实体按等级 22~25px 轻成长。
	var boltWorldSprite = null, boltWorldReady = false, burnDartWorldSprite = null, burnDartWorldReady = false
	if (global.Image) {
		boltWorldSprite = new global.Image()
		boltWorldSprite.onload = function () { boltWorldReady = true }
		boltWorldSprite.onerror = function () { boltWorldReady = false }
		boltWorldSprite.src = BOLT_SPRITE_SRC
		burnDartWorldSprite = new global.Image()
		burnDartWorldSprite.onload = function () { burnDartWorldReady = true }
		burnDartWorldSprite.onerror = function () { burnDartWorldReady = false }
		burnDartWorldSprite.src = BURN_DART_SPRITE_SRC
	}
	var fireHitSprite = null, fireHitSpriteReady = false, iceBloomSprite = null, iceBloomSpriteReady = false, steamBurstSprite = null, steamBurstSpriteReady = false
	if (global.Image) {
		fireHitSprite = new global.Image(); fireHitSprite.onload = function () { fireHitSpriteReady = true }; fireHitSprite.onerror = function () { fireHitSpriteReady = false }; fireHitSprite.src = FIRE_HIT_SPRITE_SRC
		iceBloomSprite = new global.Image(); iceBloomSprite.onload = function () { iceBloomSpriteReady = true }; iceBloomSprite.onerror = function () { iceBloomSpriteReady = false }; iceBloomSprite.src = ICE_BLOOM_SPRITE_SRC
		steamBurstSprite = new global.Image(); steamBurstSprite.onload = function () { steamBurstSpriteReady = true }; steamBurstSprite.onerror = function () { steamBurstSpriteReady = false }; steamBurstSprite.src = STEAM_BURST_SPRITE_SRC
	}

	function newParticle() { return { active: false, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', drag: 0.88, prio: 'high', soft: false } }
	function resetParticle(p) { p.active = false; p.soft = false }
	function newText() { return { active: false, x: 0, y: 0, prevX: 0, prevY: 0, vy: -40, life: 0, maxLife: 1, text: '', color: '#fff', size: 14, weight: 700, prio: 'high', strokeColor: null, strokeWidth: 0, iconId: null, iconColor: null } }
	function resetText(t) { t.active = false }

	var particlePool = Core.createPool(newParticle, resetParticle, 512)   // b9 性能护栏：齐爆峰值防爆池增长 GC 尖刺（128→512，一次性内存廉价）
	var textPool = Core.createPool(newText, resetText, 32)
	// 通用光束（fx:bolt / fx:lightning），curve=true 走 quadratic 折线；电磁炮台束由 drawElectroBeam 直接绘制；爆环（fx:steamblast）
	function newBeam() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0, curve: false, life: 0, maxLife: 1, width: 2, color: '#fff' } }
	function resetBeam(b) { b.active = false }
	function newBlast() { return { active: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, ringWidth: 4, color: '#fff', startA: 0, endA: M.PI2 } }
	function resetBlast(b) { b.active = false; b.startA = 0; b.endA = M.PI2 }
	function newDart() { return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 1, delay: 0, color: '#fff', burning: false, level: 1, shotIndex: 0, shotCount: 1, targetId: null } }
	function resetDart(b) { b.active = false; b.targetId = null }
	function newDartAccent() { return { active: false, kind: 'impact', x: 0, y: 0, life: 0, maxLife: 1, burning: false, angle: 0 } }
	function resetDartAccent(a) { a.active = false }
	function newSkillBurst() { return { active: false, kind: '', spriteKind: '', x: 0, y: 0, life: 0, maxLife: 1, delay: 0, size: 0, angle: 0, alphaMul: 1, growMul: 0, fadePower: 2 } }
	function resetSkillBurst(b) { b.active = false; b.kind = ''; b.spriteKind = ''; b.delay = 0; b.alphaMul = 1; b.growMul = 0; b.fadePower = 2 }
	var beamPool = Core.createPool(newBeam, resetBeam, 64)
	var blastPool = Core.createPool(newBlast, resetBlast, 96)   // b9：爆环池 32→96（蒸汽齐爆峰值）
	var particles = []
	var texts = []
	var beams = []
	var blasts = []
	var dartPool = Core.createPool(newDart, resetDart, 32)
	var darts = []
	var dartAccentPool = Core.createPool(newDartAccent, resetDartAccent, 48)
	var dartAccents = []   // 发射闪点/命中叶切：绘于实体之上，寿命极短，不参与 gameplay
	var skillBurstPool = Core.createPool(newSkillBurst, resetSkillBurst, 16)
	var skillBursts = []
	var flashPool = Core.createPool(function () { return { active: false, x: 0, y: 0, radius: 0, life: 0, maxLife: 1, color: '#fff' } }, function (f) { f.active = false }, 96)   // b9：闪核池 32→96（蒸汽白闪/电磁辉光峰值）
	var flashCores = []   // 叠加层实心闪核（蒸汽白闪/电磁辉光），drawOverlay 绘于实体之上
	var DBG = { ignite: 0, fireDot: 0, flashDrawn: 0, steamBlasts: 0, steamAoeCmp: 0, electricDecorDowngradeMode: 'cumulative' }   // b9-diag/measure：诊断计数器（仅 HUD，零 gameplay；不进 caps/伤害管线）；steamBlasts=本帧真引爆次数(未被 steamFxCap 门控)、steamAoeCmp=蒸汽 AOE 邻居比较总次数
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
	var dotTextThisFrame = 0   // P2-10：DOT 飘字每帧抽稀计数（火墙 MULTI-敌齐爆时限制同时刻飘字数，防糊屏）
	var steamFlashTime = -1   // 蒸汽同一 fixed-step 只保留一个主闪；爆环/粒子仍逐事件生成
	var skipNextSteamFlash = false
	// 优先级挤占：满上限时，high 挤掉最旧 low；low 或无可挤则丢弃（drop-newest）
	function evictLow(pool) { for (var k = 0; k < pool.length; k++) { if (pool[k].prio === 'low') { return k } } return -1 }
	function emitParticle(x, y, vx, vy, life, size, color, drag, prio, soft) {
		if (frameSpawn >= spawnBudget()) { return false }                 // 每帧预算耗尽：丢弃（削平齐爆尖峰）
		if (particles.length >= maxParticles()) {
			if (prio === 'high') { var ei = evictLow(particles); if (ei < 0) { return false } particlePool.release(particles[ei]); particles.splice(ei, 1) }
			else { return false }                                          // 低优先且已满：丢弃
		}
		var p = particlePool.acquire()
		p.active = true; p.x = x; p.y = y; p.prevX = x; p.prevY = y; p.vx = vx; p.vy = vy
		p.life = p.maxLife = life; p.size = size; p.color = color; p.drag = drag; p.prio = prio; p.soft = !!soft
		particles.push(p); frameSpawn++; return true
	}
	function emitText(x, y, str, color, size, prio, opts) {
		if (frameSpawn >= spawnBudget()) { return false }
		if (texts.length >= maxTexts()) {
			if (prio === 'high') { var ei = evictLow(texts); if (ei < 0) { return false } textPool.release(texts[ei]); texts.splice(ei, 1) }
			else { return false }
		}
		var t = textPool.acquire()
		t.active = true; t.x = x; t.y = y; t.prevX = x; t.prevY = y; t.vy = -(opts && opts.risePxPerSec ? opts.risePxPerSec : 36)
		t.life = t.maxLife = opts && opts.customLife ? opts.customLife : 0.6; t.text = str; t.color = color; t.size = size || 14; t.weight = opts && opts.weight ? opts.weight : 700; t.prio = prio; t.strokeColor = opts && opts.strokeColor ? opts.strokeColor : null; t.strokeWidth = opts && opts.strokeWidth ? opts.strokeWidth : 0; t.iconId = opts && opts.iconId ? opts.iconId : null; t.iconColor = opts && opts.iconColor ? opts.iconColor : null
		texts.push(t); frameSpawn++; return true
	}
	function flashCoreCap() { return RT('PERF.flashCoreCap', 16) }   // 并发闪核硬上限：超量丢最旧(保最新视觉)，削平 402k overdraw 尖峰
	function spawnFlashCore(x, y, radius, color, life) {
		if (skipNextSteamFlash) { skipNextSteamFlash = false; return }
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
	function maxBeams() {
		var tier = global.PerfTier && global.PerfTier.tier ? global.PerfTier.tier : 'HIGH'
		var caps = ELECTRIC.maxBeamsByTier || { HIGH: 32, MED: 24, LOW: 16, POTATO: 12 }
		return RT('PERF.maxBeams', (global.PerfTier && global.PerfTier.maxBeams != null) ? global.PerfTier.maxBeams : (caps[tier] || caps.HIGH))
	}
	function spawnBeam(x1, y1, x2, y2, color, width, life, jag, prio) {
		prio = prio || 'main'
		if (beams.length >= maxBeams()) {
			if (prio === 'low') { DBG.beamDrops = (DBG.beamDrops || 0) + 1; return false }
			var drop = -1
			for (var di = 0; di < beams.length; di++) { if (beams[di].prio === 'low') { drop = di; break } }
			if (drop < 0) { DBG.beamDrops = (DBG.beamDrops || 0) + 1; return false }
			beamPool.release(beams[drop]); beams.splice(drop, 1)
		}
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
		b.life = b.maxLife = life; b.prio = prio
		beams.push(b); frameSpawn++; return true
	}
	// 生成扩张爆环 + 少量爆散团（爆散团走小圆点粒子）
	function spawnBlast(x, y, radius, color, life, startA, endA) {
		if (frameSpawn >= spawnBudget()) { return }   // 每帧预算：削平齐爆爆环尖峰
		var b = blastPool.acquire()
		b.active = true; b.x = x; b.y = y; b.radius = radius; b.color = color; b.ringWidth = BLAST_RING_W
		b.startA = startA == null ? 0 : startA; b.endA = endA == null ? M.PI2 : endA
		b.life = b.maxLife = life
		blasts.push(b); frameSpawn++
	}
	function spawnDartAccent(kind, x, y, burning, angle, life) {
		if (frameSpawn >= spawnBudget()) { return false }
		var a = dartAccentPool.acquire()
		a.active = true; a.kind = kind; a.x = x; a.y = y; a.burning = !!burning; a.angle = angle || 0; a.life = a.maxLife = life
		dartAccents.push(a); frameSpawn++; return true
	}
	function dartWorldPx(da) {
		return (da.burning ? BURN_DART_WORLD_PX : BOLT_WORLD_PX) + (da.burning ? 0 : ((da.level >= 3 ? 1 : 0) + (da.level >= 4 ? 1 : 0) + (da.level >= 5 ? 1 : 0)))
	}
	function setDartTargetSurface(da, tx, ty, radius) {
		var dx = tx - da.x1, dy = ty - da.y1, dist = Math.sqrt(dx * dx + dy * dy)
		if (!radius || !isFinite(dist) || dist < 0.001) { da.x2 = tx; da.y2 = ty; return }
		var tipPad = dartWorldPx(da) * (da.burning ? 0.36 : 0.34)
		var stop = Math.max(0, radius + tipPad)
		da.x2 = tx - dx / dist * stop
		da.y2 = ty - dy / dist * stop
	}
	function spawnDart(x1, y1, x2, y2, color, life, opts) {   // 飞行镖：视觉层插值；支持多目标错峰/移动目标追踪/表面命中
		if (frameSpawn >= spawnBudget()) { return }
		var b = dartPool.acquire(); opts = opts || {}
		b.active = true; b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.color = color
		b.life = b.maxLife = life; b.delay = Math.max(0, opts.delay || 0); b.burning = !!opts.burning
		b.level = Math.max(1, Math.min(5, opts.level || 1)); b.shotIndex = opts.shotIndex || 0; b.shotCount = opts.shotCount || 1; b.targetId = opts.targetId != null ? opts.targetId : null
		if (opts.targetRadius) { setDartTargetSurface(b, x2, y2, opts.targetRadius) }
		darts.push(b); frameSpawn++
		if (b.shotIndex === 0) { spawnDartAccent('launch', x1, y1, b.burning, Math.atan2(b.y2 - y1, b.x2 - x1), DART_LAUNCH_LIFE) }
	}
	function syncDartTarget(da) {
		if (da.targetId == null) { return }
		var enemy = Registry.get('enemy'), list = enemy && enemy.list
		if (!list) { return }
		for (var i = 0; i < list.length; i++) {
			var e = list[i]
			if (e.active && e.id === da.targetId) { setDartTargetSurface(da, e.x, e.y, e.radius || 0); return }
		}
	}
	function dartDenseMode() {
		var tier = global.PerfTier && global.PerfTier.tier ? global.PerfTier.tier : 'HIGH'
		return tier === 'LOW' || tier === 'POTATO' || fxLow() || darts.length >= 9 || particles.length >= maxParticles() * 0.7
	}
	function dartFlightSec(from, to, killed, level, travelOverride) {
		if (travelOverride != null) { return travelOverride }
		var dx = to.x - from.x, dy = to.y - from.y, dist = Math.sqrt(dx * dx + dy * dy)
		var p = clamp01((dist - 70) / 190), li = Math.max(0, Math.min(4, (level || 1) - 1))
		if (killed) { return BOLT_KILL_FLY_MIN_SEC + (BOLT_KILL_FLY_MAX_SEC - BOLT_KILL_FLY_MIN_SEC) * p }
		return BOLT_FLY_MIN_BY_LEVEL[li] + (BOLT_FLY_MAX_BY_LEVEL[li] - BOLT_FLY_MIN_BY_LEVEL[li]) * p
	}
	function finishDart(da) {
		var ang = Math.atan2(da.y2 - da.y1, da.x2 - da.x1)
		var vfx = da.burning ? BURNING_VFX : BOLT_VFX
		spawnDartAccent('impact', da.x2, da.y2, da.burning, ang, vfx.impactLifeSec || 0.14)
		if (dartDenseMode()) { return }
		spawnBurst(da.x2, da.y2, da.burning ? 2 : 1, da.burning ? BURN_TRAIL : BOLT_COLOR, da.burning ? 95 : 70, da.burning ? 2.2 : 1.7, 0.18, 'low')
		if (da.burning) { spawnBurst(da.x2, da.y2, 1, BURN_TRAIL_HOT, 70, 1.8, 0.16, 'low') }
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
	function spawnText(x, y, str, color, size, prio, opts) { emitText(x, y, str, color, size, (prio === 'low') ? 'low' : 'high', opts) }   // prio 默认 high；仅 enemy:hit 伤害飘字传 'low'
	function spawnSkillBurst(kind, x, y, radius, angle, opts) {
		var style = SKILL_VFX[kind], o = opts || {}
		if (!style || skillBursts.length >= (o.maxBursts || style.maxBursts)) { return }
		var burst = skillBurstPool.acquire()
		burst.active = true; burst.kind = kind; burst.spriteKind = o.spriteKind || kind; burst.x = x; burst.y = y
		burst.life = burst.maxLife = o.lifeSec || style.burstLifeSec; burst.delay = o.delaySec || 0
		burst.size = radius * (o.sizeMul || style.burstSizeMul); burst.angle = angle || 0
		burst.alphaMul = o.alphaMul == null ? 1 : o.alphaMul; burst.growMul = o.growMul || 0; burst.fadePower = o.fadePower || 2
		skillBursts.push(burst)
	}

	// 火墙余烬：视觉绑定「火源=蛇身」而非「敌数」——第三轮误删火 DOT 逐次火花后火墙无粒子感(用户反馈表现力弱)，
	//   但原"每敌每帧 3 颗"随敌数膨胀是 p 350/350 overdraw 真凶。改：按固定间隔沿蛇身随机取点喷一颗余烬，
	//   受 spawnBudget + low 优先双重门控(池满优先保死亡/蒸汽/伤害 VFX)，总量恒定不随敌数涨(50 敌仍为固定频率)，零 gameplay
	function spawnFireEmbers() {
		// Fire V1.6：保持历史粒子总预算不变，只重做出生分布。目标：火域内部在燃烧 + 后段形成短尾焰；墙外不生成固定热点。
		if (RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0) { return }
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var owned = sk.owned(); if (!(owned.fire > 0)) { return }
		if (particles.length >= maxParticles() * 0.5) { return }
		var s = Registry.get('snake'); if (!s || !s.segments || s.segments.length === 0) { return }
		var segs = s.segments, fi = owned.fire - 1, fireStyle = SKILL_VFX.fire || {}, emberStyle = fireStyle.embers || {}
		var fr = RT('SKILL.fire.radius.' + fi, CONFIG.SKILL.fire.radius[fi])
		var n = scN(Math.min(4, 2 + fi))   // 不加总粒子数：仍沿用历史 2/3/4 封顶预算
		var tailShare = emberStyle.tailShare == null ? 0.34 : emberStyle.tailShare
		var edgeShare = emberStyle.innerEdgeShare == null ? 0.18 : emberStyle.innerEdgeShare
		var tailStart = Math.min(segs.length - 1, Math.max(0, Math.floor(segs.length * (emberStyle.tailStartRatio || 0.72))))
		var jitter = emberStyle.bodyJitterPx || 6, rise = emberStyle.riseSpeed || 24
		for (var ei = 0; ei < n; ei++) {
			var roll = Math.random(), tail = roll < tailShare, innerEdge = !tail && roll < tailShare + edgeShare
			var idx = tail ? tailStart + ((Math.random() * Math.max(1, segs.length - tailStart)) | 0) : ((Math.random() * segs.length) | 0)
			if (idx >= segs.length) { idx = segs.length - 1 }
			var sg = segs[idx], px = sg.x, py = sg.y, vx = 0, vy = 0, life = 0.4, size = 2, hotChance = emberStyle.hotChance == null ? 0.28 : emberStyle.hotChance
			var prev = segs[Math.max(0, idx - 1)], next = segs[Math.min(segs.length - 1, idx + 1)]
			var tx = next.x - prev.x, ty = next.y - prev.y, tl = Math.sqrt(tx * tx + ty * ty)
			if (tl < 0.001) { tx = 1; ty = 0; tl = 1 }
			tx /= tl; ty /= tl
			if (innerEdge) {
				// 火墙内侧余烬：出生在伤害区内部约 52%~68%R，寿命极短，尚未越出边界就衰减掉。
				var nx = -ty, ny = tx, side = Math.random() < 0.5 ? -1 : 1
				var minRR = emberStyle.innerEdgeMinRadiusRatio == null ? 0.52 : emberStyle.innerEdgeMinRadiusRatio
				var maxRR = emberStyle.innerEdgeMaxRadiusRatio == null ? 0.68 : emberStyle.innerEdgeMaxRadiusRatio
				var offset = fr * (minRR + Math.random() * Math.max(0, maxRR - minRR)), outSp = (emberStyle.edgeOutSpeedMin || 8) + Math.random() * ((emberStyle.edgeOutSpeedMax || 16) - (emberStyle.edgeOutSpeedMin || 8))
				px += nx * side * offset; py += ny * side * offset
				vx = nx * side * outSp + (Math.random() * 2 - 1) * 5; vy = ny * side * outSp - rise * 0.72
				life = (emberStyle.edgeLifeMin || 0.20) + Math.random() * ((emberStyle.edgeLifeMax || 0.28) - (emberStyle.edgeLifeMin || 0.20))
				size = ((emberStyle.sizeMin || 1.35) + Math.random() * ((emberStyle.sizeMax || 2.75) - (emberStyle.sizeMin || 1.35))) * (emberStyle.edgeSizeMul || 0.82)
			} else if (tail && idx > 0) {
				// 后 28% 身体段：沿“朝尾部”的切线短促甩出，形成移动时可读但不长驻的尾焰拖尾。
				var headward = segs[idx - 1], bx = sg.x - headward.x, by = sg.y - headward.y, bl = Math.sqrt(bx * bx + by * by)
				if (bl < 0.001) { bx = tx; by = ty; bl = 1 }
				bx /= bl; by /= bl
				var tailSp = (emberStyle.tailSpeedMin || 30) + Math.random() * ((emberStyle.tailSpeedMax || 54) - (emberStyle.tailSpeedMin || 30))
				px += (Math.random() * 2 - 1) * jitter * 0.55; py += (Math.random() * 2 - 1) * jitter * 0.55
				vx = bx * tailSp + (Math.random() * 2 - 1) * 8; vy = by * tailSp - rise * 0.62
				life = (emberStyle.tailLifeMin || 0.26) + Math.random() * ((emberStyle.tailLifeMax || 0.40) - (emberStyle.tailLifeMin || 0.26))
				size = (emberStyle.sizeMin || 1.35) + Math.random() * ((emberStyle.sizeMax || 2.75) - (emberStyle.sizeMin || 1.35))
				hotChance = emberStyle.tailHotChance == null ? 0.38 : emberStyle.tailHotChance
			} else {
				// 全身微燃：保持旧版“从蛇身冒火”的自然语义，不把粒子搬到墙外。
				var a = Math.random() * M.PI2, sp = (emberStyle.bodySpeedMin || 26) + Math.random() * ((emberStyle.bodySpeedMax || 50) - (emberStyle.bodySpeedMin || 26))
				px += (Math.random() * 2 - 1) * jitter; py += (Math.random() * 2 - 1) * jitter
				vx = Math.cos(a) * sp; vy = Math.sin(a) * sp - rise
				life = (emberStyle.bodyLifeMin || 0.34) + Math.random() * ((emberStyle.bodyLifeMax || 0.50) - (emberStyle.bodyLifeMin || 0.34))
				size = (emberStyle.sizeMin || 1.35) + Math.random() * ((emberStyle.sizeMax || 2.75) - (emberStyle.sizeMin || 1.35))
			}
			emitParticle(px, py, vx, vy, life, size, Math.random() < hotChance ? (emberStyle.hotColor || '#ffd27a') : (emberStyle.color || '#ff9a3c'), 0.9, 'low')
		}
	}
	function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v) }
	function electricLevel(id, fallback) {
		var sk = Registry.get('skill'), owned = sk && sk.owned ? sk.owned() : null
		return Math.max(1, Math.min(5, (owned && owned[id]) || fallback || 1))
	}
	function electricChain(chain, electro, level) {
		var out = [], kinks = [], max = ELECTRIC.maxChainPoints || 8, list = chain || []
		for (var i = 0; i < list.length && out.length < max; i++) {
			if (list[i] && list[i].x != null && list[i].y != null) { out.push({ id: list[i].id != null ? list[i].id : null, x: list[i].x, y: list[i].y }) }
		}
		var li = Math.max(0, Math.min(4, level - 1)), countList = ELECTRIC_L.kinkCountByLevel, ampList = ELECTRIC_L.kinkAmplitudeByLevel
		for (var c = 1; c < out.length; c++) {
			var a = out[c - 1], b = out[c], dx = b.x - a.x, dy = b.y - a.y, span = Math.sqrt(dx * dx + dy * dy)
			var count = countList[li] || 1, amp = Math.min(ampList[li] || 0, span * (ELECTRIC_L.kinkMaxSegmentRatio || 0.14)), segmentKinks = []
			for (var k = 0; k < count; k++) {
				// 固定参数化折点：随端点更新，绝不逐帧随机，避免电链看成激光或抖动软管。
				segmentKinks.push({ t: (k + 1) / (count + 1), offset: amp * (((c + k + level) % 2) ? -1 : 1) })
			}
			kinks.push(segmentKinks)
		}
		return { points: out, kinks: kinks }
	}
	function makeLightningState(d) {
		var chain = d && d.chain ? d.chain : [], meta = chain.vfxMeta || (d && d.vfxMeta) || {}, level = Math.max(1, Math.min(5, meta.level || d.level || electricLevel('lightning', 1))), c = electricChain(chain, false, level), li = level - 1
		var segmentCount = Math.max(0, c.points.length - 1), hop = ELECTRIC_L.hopDelayByLevel[li], impact = ELECTRIC_L.impactDurationByLevel[li], fade = ELECTRIC_L.fadeDurationByLevel[li]
		return { type: 'lightning', chain: c.points, kinks: c.kinks, originKind: meta.originKind || '', level: level, age: 0, phase: 'propagate', currentSegment: segmentCount ? 0 : -1,
			segmentCount: segmentCount, hopDelay: hop, impactDuration: impact, fadeDuration: fade, propagateEnd: segmentCount * hop, impactEnd: segmentCount * hop + impact, fadeEnd: segmentCount * hop + impact + fade,
			mainWidth: ELECTRIC_L.widthByLevel[li], finalBurstLife: level === 5 ? ELECTRIC_L.levelFiveBurstLifeSec : 0 }
	}
	function activeEnemyById(id) {
		if (id == null) { return null }
		var enemy = Registry.get('enemy'), list = enemy && enemy.list
		if (!list) { return null }
		for (var i = 0; i < list.length; i++) { var e = list[i]; if (e && e.active && e.id === id) { return e } }
		return null
	}
	function syncLightningAnchors(state) {
		if (!state || !state.chain || !state.chain.length) { return }
		if (state.originKind === 'head') {
			var snake = Registry.get('snake')
			if (snake && snake.head) { state.chain[0].x = snake.head.x; state.chain[0].y = snake.head.y }
		}
		for (var i = 1; i < state.chain.length; i++) {
			var point = state.chain[i], e = activeEnemyById(point.id)
			if (e) { point.x = e.x; point.y = e.y }
		}
	}
	function syncElectroTargets(state) {
		if (!state || !state.targets) { return }
		for (var i = 0; i < state.targets.length; i++) {
			var target = state.targets[i], e = activeEnemyById(target.id)
			if (e) { target.x = e.x; target.y = e.y }
			if (electroImpacts[i] && electroImpacts[i].active) { electroImpacts[i].x = target.x; electroImpacts[i].y = target.y }
		}
	}
	function resetElectroVfx() {
		electroVfxState.active = false; electroVfxState.phase = 'inactive'; electroVfxState.x = 0; electroVfxState.y = 0; electroVfxState.age = 0; electroVfxState.comboLevel = 1; electroVfxState.fireAge = 999; electroVfxState.targets.length = 0; electroVfxState.scanAge = 999; electroVfxState.deployAge = 0; electroVfxState.collapseAge = 0; electroVfxState.aimAngle = 0
		for (var i = 0; i < electroImpacts.length; i++) { electroImpacts[i].active = false; electroImpacts[i].targetId = null; electroImpacts[i].age = 999 }
	}
	function deployElectroVfx(d) {
		var s = electroVfxState; s.active = true; s.phase = 'deploy'; s.x = d.x; s.y = d.y; s.age = 0; s.deployAge = 0; s.comboLevel = d.comboLevel || 1; s.fireAge = 999; s.targets.length = 0; s.scanAge = 0; s.collapseAge = 0; s.aimAngle = 0
	}
	function fireElectroVfx(d) {
		var s = electroVfxState; if (!s.active) { return }
		s.phase = 'firing'; s.fireAge = 0; s.targets.length = 0
		for (var i = 0; i < electroImpacts.length; i++) { electroImpacts[i].active = false; electroImpacts[i].targetId = null; electroImpacts[i].age = 999 }
		for (var j = 0; d.targets && j < d.targets.length && j < 3; j++) {
			var target = d.targets[j]
			s.targets.push({ id: target.id != null ? target.id : null, x: target.x, y: target.y })
			electroImpacts[j].active = true; electroImpacts[j].targetId = target.id != null ? target.id : null; electroImpacts[j].x = target.x; electroImpacts[j].y = target.y; electroImpacts[j].age = 0
		}
		if (s.targets.length) { s.aimAngle = Math.atan2(s.targets[0].y - s.y, s.targets[0].x - s.x) }
	}
	function endElectroVfx(d) {
		var s = electroVfxState; if (!s.active) { return }
		s.phase = 'collapse'; s.fireAge = 999; s.targets.length = 0; s.collapseAge = 0
		if (d && d.x != null) { s.x = d.x; s.y = d.y }
	}
	function electricDenseMode() {
		var en = Registry.get('enemy'), count = en && en.countMobs ? en.countMobs() : 0
		var tier = global.PerfTier && global.PerfTier.tier
		var dense = count >= (ELECTRIC.denseEnemyMin || 28) || tier === 'LOW' || tier === 'POTATO'
		DBG.denseElectricMode = dense ? 1 : 0
		return dense
	}
	function electroLowMode(dense) {
		var tier = global.PerfTier && global.PerfTier.tier
		return !!dense || tier === 'LOW' || tier === 'POTATO'
	}
	function segmentPolyline(state, i) {
		var a = state.chain[i], b = state.chain[i + 1], mid = state.kinks[i] || []
		if (!a || !b) { return [] }
		var pts = [a]
		var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len
		for (var m = 0; m < mid.length; m++) {
			var knot = mid[m]
			pts.push(knot && knot.t != null ? { x: a.x + dx * knot.t + nx * knot.offset, y: a.y + dy * knot.t + ny * knot.offset } : knot)
		}
		pts.push(b)
		return pts
	}
	function traceChain(ctx, state, limit) {
		var n = Math.min(limit, state.segmentCount)
		ctx.beginPath()
		for (var i = 0; i < n; i++) {
			var pts = segmentPolyline(state, i)
			if (pts.length < 2 || (pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y)) { continue }
			ctx.moveTo(pts[0].x, pts[0].y)
			for (var p = 1; p < pts.length; p++) { ctx.lineTo(pts[p].x, pts[p].y) }
		}
	}
	function traceSegment(ctx, state, i) {
		var pts = segmentPolyline(state, i)
		if (pts.length < 2 || (pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y)) { return false }
		ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
		for (var p = 1; p < pts.length; p++) { ctx.lineTo(pts[p].x, pts[p].y) }
		return true
	}
	function pointOnSegment(state, i, progress) {
		var pts = segmentPolyline(state, i), t = clamp01(progress)
		if (pts.length < 2) { return pts[0] || { x: 0, y: 0 } }
		var lengths = [], total = 0
		for (var p = 1; p < pts.length; p++) { var dx = pts[p].x - pts[p - 1].x, dy = pts[p].y - pts[p - 1].y, len = Math.sqrt(dx * dx + dy * dy); lengths.push(len); total += len }
		if (!total) { return { x: pts[0].x, y: pts[0].y } }
		var wanted = total * t, acc = 0
		for (var q = 0; q < lengths.length; q++) {
			if (wanted <= acc + lengths[q] || q === lengths.length - 1) {
				var local = lengths[q] ? (wanted - acc) / lengths[q] : 0
				return { x: pts[q].x + (pts[q + 1].x - pts[q].x) * local, y: pts[q].y + (pts[q + 1].y - pts[q].y) * local }
			}
			acc += lengths[q]
		}
		return pts[pts.length - 1]
	}
	function tracePartialSegment(ctx, state, i, progress) {
		var pts = segmentPolyline(state, i), t = clamp01(progress)
		if (pts.length < 2 || t <= 0) { return false }
		var end = pointOnSegment(state, i, t), total = 0, lengths = []
		for (var p = 1; p < pts.length; p++) { var dx = pts[p].x - pts[p - 1].x, dy = pts[p].y - pts[p - 1].y, len = Math.sqrt(dx * dx + dy * dy); lengths.push(len); total += len }
		var wanted = total * t, acc = 0
		ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
		for (var q = 0; q < lengths.length; q++) {
			if (wanted <= acc + lengths[q]) { ctx.lineTo(end.x, end.y); break }
			ctx.lineTo(pts[q + 1].x, pts[q + 1].y); acc += lengths[q]
		}
		return true
	}
	function lightningRevealed(state) { return state.phase === 'propagate' ? Math.min(state.segmentCount, Math.floor(state.age / state.hopDelay)) : state.segmentCount }
	function lightningFade(state) { return state.phase === 'fade' ? clamp01(1 - (state.age - state.impactEnd) / state.fadeDuration) : 1 }
	function strokeLightningPath(ctx, s, fade, index, partialProgress) {
		var partial = partialProgress != null
		var ok = partial ? tracePartialSegment(ctx, s, index, partialProgress) : traceSegment(ctx, s, index)
		if (!ok) { return }
		ctx.globalAlpha = ELECTRIC_L.outerAlpha * fade; ctx.strokeStyle = LIGHTNING_COLOR; ctx.lineWidth = s.mainWidth * ELECTRIC_L.outerWidthRatio; ctx.stroke()
		if (partial) { tracePartialSegment(ctx, s, index, partialProgress) } else { traceSegment(ctx, s, index) }
		ctx.globalAlpha = (s.phase === 'fade' ? ELECTRIC_L.fadeMainAlpha * fade : ELECTRIC_L.mainAlpha); ctx.strokeStyle = LIGHTNING_COLOR; ctx.lineWidth = s.mainWidth; ctx.stroke()
	}
	function drawLightningWorld(ctx, dense) {
		var s = lightningFxState; if (!s || s.segmentCount < 1) { return }
		var fade = lightningFade(s)
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		if (s.phase === 'propagate') {
			var completed = Math.min(s.segmentCount, Math.floor(s.age / s.hopDelay))
			for (var i = 0; i < completed; i++) { strokeLightningPath(ctx, s, fade, i, null) }
			if (completed < s.segmentCount) { var pp = clamp01((s.age - completed * s.hopDelay) / s.hopDelay); strokeLightningPath(ctx, s, fade, completed, pp) }
		} else {
			for (var j = 0; j < s.segmentCount; j++) { strokeLightningPath(ctx, s, fade, j, null) }
		}
		ctx.restore()
	}
	function strokeLightningCore(ctx, s, index, partialProgress, alpha) {
		var partial = partialProgress != null
		var ok = partial ? tracePartialSegment(ctx, s, index, partialProgress) : traceSegment(ctx, s, index)
		if (!ok) { return }
		ctx.globalAlpha = alpha; ctx.strokeStyle = ELECTRIC_WHITE
		ctx.lineWidth = Math.max(0.9, s.mainWidth * (ELECTRIC_L.impactCoreWidthRatio || 0.28)); ctx.stroke()
	}
	function drawLightningNodePulse(ctx, s, nodeIndex, dense) {
		var np = s.chain[nodeIndex]; if (!np) { return }
		var life = ELECTRIC_L.nodePulseLifeSec || 0.095, localAge
		if (s.phase === 'propagate') { localAge = s.age - nodeIndex * s.hopDelay }
		else if (s.phase === 'impact') { localAge = s.age - s.propagateEnd }
		else { return }
		if (localAge < 0 || localAge > life) { return }
		var p = clamp01(localAge / life), alpha = 1 - p
		var radii = ELECTRIC_L.nodeImpactRadiusByLevel || [4.8, 5.3, 5.8, 6.4, 7.0]
		var rr = radii[Math.max(0, Math.min(4, s.level - 1))], ring = rr * (0.72 + p * (ELECTRIC_L.nodeImpactRingMul || 1.55))
		ctx.globalAlpha = alpha * 0.92; ctx.fillStyle = ELECTRIC_WHITE
		ctx.beginPath(); ctx.arc(np.x, np.y, Math.max(1.5, rr * (0.40 - p * 0.10)), 0, M.PI2); ctx.fill()
		if (!dense) {
			ctx.globalAlpha = alpha * 0.58; ctx.strokeStyle = LIGHTNING_COLOR; ctx.lineWidth = 1
			ctx.beginPath(); ctx.arc(np.x, np.y, ring, 0, M.PI2); ctx.stroke()
		}
	}
	function drawLightningJointNodes(ctx, s, dense, fade) {
		var radii = ELECTRIC_L.jointRadiusByLevel || [1.8, 2.0, 2.2, 2.5, 2.8]
		var r = radii[Math.max(0, Math.min(4, s.level - 1))]
		var maxNode = s.phase === 'propagate' ? Math.min(s.chain.length - 1, lightningRevealed(s)) : s.chain.length - 1
		for (var i = 1; i <= maxNode; i++) {
			var p = s.chain[i]; if (!p) { continue }
			if (!dense) { ctx.globalAlpha = 0.34 * fade; ctx.fillStyle = LIGHTNING_COLOR; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.75, 0, M.PI2); ctx.fill() }
			ctx.globalAlpha = 0.74 * fade; ctx.fillStyle = ELECTRIC_WHITE; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, M.PI2); ctx.fill()
		}
	}
	function drawLightningTravelTip(ctx, s, dense) {
		if (s.phase !== 'propagate' || s.segmentCount < 1) { return }
		var index = Math.min(s.segmentCount - 1, Math.floor(s.age / s.hopDelay))
		var a = s.chain[index], b = s.chain[index + 1]; if (!a || !b) { return }
		var p = clamp01((s.age - index * s.hopDelay) / s.hopDelay)
		var x = M.lerp(a.x, b.x, p), y = M.lerp(a.y, b.y, p)
		var radii = ELECTRIC_L.travelTipRadiusByLevel || [2.2, 2.4, 2.7, 3.0, 3.4], r = radii[Math.max(0, Math.min(4, s.level - 1))]
		if (!dense) { ctx.globalAlpha = 0.32; ctx.fillStyle = LIGHTNING_COLOR; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, M.PI2); ctx.fill() }
		ctx.globalAlpha = 0.96; ctx.fillStyle = ELECTRIC_WHITE; ctx.beginPath(); ctx.arc(x, y, r, 0, M.PI2); ctx.fill()
	}
	function drawLightningOverlay(ctx, dense) {
		var s = lightningFxState; if (!s || s.segmentCount < 1) { return }
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		var fade = lightningFade(s), coreAlpha
		if (s.phase === 'impact') { coreAlpha = s.level >= 3 ? ELECTRIC_L.impactCoreAlphaHigh : ELECTRIC_L.impactCoreAlphaLow }
		else if (s.phase === 'fade') { coreAlpha = (ELECTRIC_L.fadeCoreAlpha || 0.22) * fade }
		else { coreAlpha = ELECTRIC_L.propagateCoreAlpha || 0.48 }
		if (s.phase === 'propagate') {
			var completed = Math.min(s.segmentCount, Math.floor(s.age / s.hopDelay))
			for (var i = 0; i < completed; i++) { strokeLightningCore(ctx, s, i, null, coreAlpha) }
			if (completed < s.segmentCount) {
				var pp = clamp01((s.age - completed * s.hopDelay) / s.hopDelay)
				strokeLightningCore(ctx, s, completed, pp, coreAlpha)
			}
		} else {
			for (var j = 0; j < s.segmentCount; j++) { strokeLightningCore(ctx, s, j, null, coreAlpha) }
		}
		drawLightningJointNodes(ctx, s, dense, fade)
		drawLightningTravelTip(ctx, s, dense)
		var source = s.chain[0]
		if (source && s.phase !== 'fade') {
			ctx.globalAlpha = s.phase === 'impact' ? 0.72 : 0.46; ctx.fillStyle = ELECTRIC_WHITE
			ctx.beginPath(); ctx.arc(source.x, source.y, s.level >= 4 ? 2.1 : 1.7, 0, M.PI2); ctx.fill()
		}
		for (var ni = 1; ni < s.chain.length; ni++) { drawLightningNodePulse(ctx, s, ni, dense) }
		if (s.level === 5 && s.phase === 'impact' && s.age - s.propagateEnd <= s.finalBurstLife) {
			var last = s.chain[s.chain.length - 1]; ctx.globalAlpha = 0.94; ctx.fillStyle = ELECTRIC_WHITE
			ctx.beginPath(); ctx.arc(last.x, last.y, 2.4, 0, M.PI2); ctx.fill()
		}
		ctx.restore()
	}
	function easeOutCubic(v) { v = clamp01(v); return 1 - Math.pow(1 - v, 3) }
	function electroLevelValue(name, level, fallback) {
		var a = ELECTRIC_E[name] || fallback
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function electroSpriteWidth(level) { return electroLevelValue('spriteWidthByLevel', level, [62, 66, 70, 74, 78]) }
	function electroAttackRadius(level) {
		var a = ELECTRO_COMBO.attackRadiusByLevel || [170, 190, 220, 245, 270]
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function electroSalvoCount(level) {
		var a = ELECTRO_COMBO.salvoCountByLevel || [3, 3, 4, 4, 4]
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function electroSalvoInterval(level) {
		var a = ELECTRO_COMBO.salvoIntervalSecByLevel || [1.10, 1.05, 0.95, 0.90, 0.85]
		return a[Math.max(0, Math.min(a.length - 1, level - 1))]
	}
	function electroNextScheduledShot(s) {
		var first = ELECTRO_COMBO.firstShotSec || 0.28, interval = electroSalvoInterval(s.comboLevel), count = electroSalvoCount(s.comboLevel)
		if (s.age < first) { return first }
		var passed = Math.floor((s.age - first) / interval) + 1
		return passed < count ? first + passed * interval : -1
	}
	function electroChargeProgress(s) {
		if (!s.active || s.phase === 'collapse') { return 0 }
		var next = electroNextScheduledShot(s), lead = ELECTRIC_E.chargeLeadSec || 0.12
		if (next < 0) { return 0 }
		var remain = next - s.age
		return remain >= 0 && remain <= lead ? clamp01(1 - remain / lead) : 0
	}
	function electroSpriteMetrics(s) {
		var baseW = electroSpriteWidth(s.comboLevel), baseH = baseW / (ELECTRIC_E.spriteAspect || 1.60)
		var deploy = easeOutCubic(clamp01(s.age / (ELECTRO_COMBO.deploySec || 0.18)))
		var collapse = s.phase === 'collapse' ? clamp01(s.collapseAge / (ELECTRO_COMBO.collapseSec || 0.18)) : 0
		var phase = (s.age / (ELECTRIC_E.breathSec || 1.20)) * M.PI2
		var breath = Math.sin(phase) * (ELECTRIC_E.breathScale || 0.020)
		var hover = -(ELECTRIC_E.hoverLiftPx || 5) + Math.sin(phase * 0.82) * (ELECTRIC_E.hoverBobPx || 1.0)
		var charge = electroChargeProgress(s)
		var recoil = s.fireAge < (ELECTRIC_E.recoilRecoverSec || 0.18) ? 1 - clamp01(s.fireAge / (ELECTRIC_E.recoilRecoverSec || 0.18)) : 0
		var baseScale = (0.82 + deploy * 0.18) * (1 - collapse * 0.18)
		var sx = baseScale * (1 + breath) * (1 - charge * 0.045) * (1 + recoil * 0.090)
		var sy = baseScale * (1 - breath * 0.48) * (1 - charge * 0.075) * (1 - recoil * 0.120)
		var w = baseW * sx, h = baseH * sy, pivot = ELECTRIC_E.spritePivotY || 0.92
		return { w: w, h: h, left: s.x - w * 0.5, top: s.y + hover - h * pivot, alpha: (0.20 + deploy * 0.80) * (1 - collapse), charge: charge, recoil: recoil, breath: breath }
	}
	function electroCore(s, m) {
		return {
			x: m.left + m.w * (ELECTRIC_E.coreXRatio || 0.50),
			y: m.top + m.h * (ELECTRIC_E.coreYRatio || 0.49),
			rx: m.w * (ELECTRIC_E.ringRadiusXRatio || 0.17),
			ry: m.h * (ELECTRIC_E.ringRadiusYRatio || 0.105)
		}
	}
	function electroBudPoints(m) {
		var left = ELECTRIC_E.budLeft || [0.25, 0.31], right = ELECTRIC_E.budRight || [0.75, 0.31], front = ELECTRIC_E.budFront || [0.50, 0.74]
		return [
			{ x: m.left + m.w * left[0], y: m.top + m.h * left[1] },
			{ x: m.left + m.w * right[0], y: m.top + m.h * right[1] },
			{ x: m.left + m.w * front[0], y: m.top + m.h * front[1] }
		]
	}
	function drawFallbackElectroTurret(ctx, s, m) {
		var c = electroCore(s, m)
		ctx.save(); ctx.globalAlpha = m.alpha; ctx.lineJoin = 'round'
		ctx.fillStyle = COMBAT_E.dark; ctx.strokeStyle = COMBAT_E.edge; ctx.lineWidth = 1.4
		ctx.beginPath(); ctx.ellipse(s.x, s.y - m.h * 0.42, m.w * 0.46, m.h * 0.36, 0, 0, M.PI2); ctx.fill(); ctx.stroke()
		var buds = electroBudPoints(m)
		for (var i = 0; i < buds.length; i++) {
			ctx.fillStyle = COMBAT_E.body; ctx.beginPath()
			ctx.moveTo(buds[i].x, buds[i].y - m.h * 0.14); ctx.lineTo(buds[i].x + m.w * 0.05, buds[i].y + m.h * 0.05)
			ctx.lineTo(buds[i].x, buds[i].y + m.h * 0.09); ctx.lineTo(buds[i].x - m.w * 0.05, buds[i].y + m.h * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke()
		}
		ctx.fillStyle = COMBAT_E.core; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * 0.52, c.ry * 0.72, 0, 0, M.PI2); ctx.fill(); ctx.restore()
	}
	function drawElectroTurretWorld(ctx, s, dense) {
		var m = electroSpriteMetrics(s), low = electroLowMode(dense)
		ctx.save()
		ctx.globalAlpha = (0.16 + Math.abs(m.breath || 0) * 1.8) * m.alpha; ctx.fillStyle = COMBAT_E.dark
		ctx.beginPath(); ctx.ellipse(s.x, s.y + 1, m.w * (ELECTRIC_E.shadowScaleX || 0.40), m.h * (ELECTRIC_E.shadowScaleY || 0.115), 0, 0, M.PI2); ctx.fill()
		if (!low && s.age <= (ELECTRIC_E.scanDurationSec || 0.26)) {
			var p = clamp01(s.age / (ELECTRIC_E.scanDurationSec || 0.26)), rr = electroAttackRadius(s.comboLevel)
			ctx.globalAlpha = Math.sin(Math.PI * p) * 0.15; ctx.strokeStyle = COMBAT_E.impactEdge || COMBAT_E.edge; ctx.lineWidth = 1.3
			for (var q = 0; q < 4; q++) {
				var a0 = q * M.PI / 2 + 0.20, a1 = a0 + 0.58
				ctx.beginPath(); ctx.arc(s.x, s.y, rr * (0.20 + easeOutCubic(p) * 0.80), a0, a1); ctx.stroke()
			}
		}
		ctx.restore()
	}
	function drawElectroTurretBodyOverlay(ctx, s, m) {
		ctx.save()
		// 最高战斗层可读性底托：遮住主体脚下的敌人纹理，避免透明 PNG 在怪群中产生“被淹没”错觉。
		ctx.globalAlpha = ((ELECTRIC_E.bodyBackplateAlpha || 0.58) + m.charge * 0.08 + m.recoil * 0.10) * m.alpha
		ctx.fillStyle = COMBAT_E.dark
		ctx.beginPath(); ctx.ellipse(s.x, m.top + m.h * 0.57, m.w * (ELECTRIC_E.bodyBackplateWidthScale || 0.39), m.h * (ELECTRIC_E.bodyBackplateHeightScale || 0.24), 0, 0, M.PI2); ctx.fill()
		ctx.globalAlpha = m.alpha
		if (electroSpriteReady && electroSprite && electroSprite.naturalWidth) { ctx.drawImage(electroSprite, m.left, m.top, m.w, m.h) }
		else { drawFallbackElectroTurret(ctx, s, m) }
		ctx.restore()
	}
	function electroMuzzle(s, target, m, index, count) {
		var c = electroCore(s, m), a = Math.atan2(target.y - c.y, target.x - c.x)
		a += (index - (count - 1) * 0.5) * 0.035
		return { x: c.x + Math.cos(a) * c.rx, y: c.y + Math.sin(a) * c.ry, core: c }
	}
	function drawElectroIdleEnergy(ctx, s, m, low) {
		var c = electroCore(s, m), buds = electroBudPoints(m), pulse = 0.5 + 0.5 * Math.sin(s.age * M.PI2 / (ELECTRIC_E.breathSec || 1.15))
		var idleAlpha = (ELECTRIC_E.idleBudAlpha || 0.22) * (1 - m.charge) * m.alpha
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		ctx.fillStyle = COMBAT_E.impactEdge || COMBAT_E.edge
		for (var i = 0; i < buds.length; i++) {
			ctx.globalAlpha = idleAlpha * (0.72 + pulse * 0.28)
			ctx.beginPath(); ctx.arc(buds[i].x, buds[i].y, 1.05 + pulse * 0.45, 0, M.PI2); ctx.fill()
			if (!low) {
				ctx.globalAlpha = idleAlpha * 0.34; ctx.strokeStyle = COMBAT_E.edge; ctx.lineWidth = 0.75
				ctx.beginPath(); ctx.moveTo(buds[i].x, buds[i].y); ctx.lineTo(c.x, c.y); ctx.stroke()
			}
		}
		var orbitCount = low ? 1 : (ELECTRIC_E.idleOrbitCount || 3), orbitBase = s.age * 3.1
		for (var oi = 0; oi < orbitCount; oi++) {
			var oa = orbitBase + oi * M.PI2 / orbitCount
			ctx.globalAlpha = (0.38 + pulse * 0.28) * m.alpha; ctx.fillStyle = oi % 2 ? COMBAT_E.core : (COMBAT_E.impactEdge || COMBAT_E.edge)
			ctx.beginPath(); ctx.arc(c.x + Math.cos(oa) * c.rx * 1.02, c.y + Math.sin(oa) * c.ry * 1.08, low ? 1.0 : 1.25, 0, M.PI2); ctx.fill()
		}
		ctx.restore()
	}
	function drawElectroCharge(ctx, s, m, low) {
		if (m.charge <= 0) { return }
		var c = electroCore(s, m), buds = electroBudPoints(m), p = m.charge
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		ctx.strokeStyle = COMBAT_E.impactEdge || COMBAT_E.edge; ctx.lineWidth = low ? 0.85 : 1.15
		for (var i = 0; i < buds.length; i++) {
			var sx = buds[i].x + (c.x - buds[i].x) * p * 0.10, sy = buds[i].y + (c.y - buds[i].y) * p * 0.10
			ctx.globalAlpha = ((low ? 0.22 : 0.32) + p * (low ? 0.30 : 0.46)) * m.alpha
			ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(c.x, c.y); ctx.stroke()
			var travel = clamp01(p * 1.10), bx = sx + (c.x - sx) * travel, by = sy + (c.y - sy) * travel
			ctx.globalAlpha = (0.55 + p * 0.45) * m.alpha; ctx.fillStyle = COMBAT_E.core
			ctx.beginPath(); ctx.arc(sx, sy, (ELECTRIC_E.chargeBudGlowPx || 3.4) * (0.48 + p * 0.32), 0, M.PI2); ctx.fill()
			ctx.globalAlpha = (0.65 + p * 0.35) * m.alpha; ctx.beginPath(); ctx.arc(bx, by, low ? 1.2 : 1.55, 0, M.PI2); ctx.fill()
		}
		ctx.globalAlpha = (0.42 + p * 0.50) * m.alpha; ctx.strokeStyle = COMBAT_E.edge; ctx.lineWidth = low ? 1.15 : 1.65
		ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * (0.76 + p * 0.10), c.ry * (0.76 + p * 0.10), 0, 0, M.PI2); ctx.stroke()
		if (!low) {
			ctx.globalAlpha = p * 0.50 * m.alpha; ctx.strokeStyle = COMBAT_E.core; ctx.lineWidth = 0.9
			var arcs = ELECTRIC_E.chargeCoreArcCount || 3
			for (var ai = 0; ai < arcs; ai++) {
				var a0 = s.age * 5.4 + ai * M.PI2 / arcs
				ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * 1.22, c.ry * 1.38, 0, a0, a0 + 0.58); ctx.stroke()
			}
			ctx.globalAlpha = p * 0.24 * m.alpha; ctx.strokeStyle = COMBAT_E.impactEdge || COMBAT_E.edge; ctx.lineWidth = 1
			ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * (1.42 - p * 0.18), c.ry * (1.58 - p * 0.22), 0, 0, M.PI2); ctx.stroke()
		}
		ctx.restore()
	}
	function drawElectroFireAccent(ctx, s, m, low) {
		var life = ELECTRIC_E.fireAccentLifeSec || 0.16
		if (!(s.fireAge >= 0 && s.fireAge < life)) { return }
		var c = electroCore(s, m), p = 1 - clamp01(s.fireAge / life), expand = 1 + (1 - p) * 0.46
		ctx.save(); ctx.lineCap = 'round'
		ctx.globalAlpha = p * 0.72 * m.alpha; ctx.strokeStyle = COMBAT_E.core; ctx.lineWidth = low ? 1.15 : 1.65
		ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * expand, c.ry * expand, 0, 0, M.PI2); ctx.stroke()
		ctx.globalAlpha = p * 0.48 * m.alpha; ctx.strokeStyle = COMBAT_E.impactEdge || COMBAT_E.edge; ctx.lineWidth = 1
		var spokes = low ? 3 : (ELECTRIC_E.fireAccentSpokes || 6)
		for (var i = 0; i < spokes; i++) {
			var a = i * M.PI2 / spokes + 0.18, r1x = c.rx * 1.10, r1y = c.ry * 1.10
			var r2x = c.rx * (1.42 + (1 - p) * 0.18), r2y = c.ry * (1.58 + (1 - p) * 0.18)
			ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r1x, c.y + Math.sin(a) * r1y)
			ctx.lineTo(c.x + Math.cos(a) * r2x, c.y + Math.sin(a) * r2y); ctx.stroke()
		}
		ctx.globalAlpha = p * 0.92 * m.alpha; ctx.fillStyle = COMBAT_E.coreHot || COMBAT_E.core
		ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(2.0, c.rx * 0.34), Math.max(1.3, c.ry * 0.62), 0, 0, M.PI2); ctx.fill()
		var sparks = low ? 1 : (ELECTRIC_E.fireSparkCount || 3), travel = 1 - p
		for (var si = 0; si < sparks; si++) {
			var sa = s.aimAngle + (si - (sparks - 1) * 0.5) * 0.70 + Math.sin(si * 2.17) * 0.20
			var sr = c.rx * (1.10 + travel * 1.10)
			ctx.globalAlpha = p * 0.70 * m.alpha; ctx.fillStyle = si % 2 ? COMBAT_E.impactEdge : COMBAT_E.core
			ctx.beginPath(); ctx.arc(c.x + Math.cos(sa) * sr, c.y + Math.sin(sa) * c.ry * (1.10 + travel * 1.25), low ? 1.0 : 1.35, 0, M.PI2); ctx.fill()
		}
		ctx.restore()
	}
	function drawElectroBeam(ctx, s, target, low, index, count) {
		var full = ELECTRIC_E.beamFullSec || 0.08, fade = ELECTRIC_E.beamFadeSec || 0.10
		var visible = s.fireAge <= full ? 1 : clamp01(1 - (s.fireAge - full) / fade)
		if (s.fireAge >= full + fade || visible <= 0) { return false }
		var m = electroSpriteMetrics(s), mz = electroMuzzle(s, target, m, index, count)
		var li = Math.max(0, Math.min(4, s.comboLevel - 1))
		var main = (ELECTRIC_E.beamMainWidthByComboLevel || [5.0, 6.1, 7.3, 8.7, 10.2])[li]
		var core = (ELECTRIC_E.beamCoreWidthByComboLevel || [1.45, 1.75, 2.10, 2.50, 2.95])[li]
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		if (!low) {
			ctx.globalAlpha = visible * 0.22
			ctx.beginPath(); ctx.moveTo(mz.x, mz.y); ctx.lineTo(target.x, target.y)
			ctx.strokeStyle = COMBAT_E.edge; ctx.lineWidth = main * 1.82; ctx.stroke()
		}
		ctx.globalAlpha = visible
		ctx.beginPath(); ctx.moveTo(mz.x, mz.y); ctx.lineTo(target.x, target.y)
		ctx.strokeStyle = COMBAT_E.beam || COMBAT_E.edge; ctx.lineWidth = main; ctx.stroke()
		ctx.beginPath(); ctx.moveTo(mz.x, mz.y); ctx.lineTo(target.x, target.y)
		ctx.strokeStyle = COMBAT_E.beamCore || COMBAT_E.core; ctx.lineWidth = core; ctx.stroke()
		ctx.fillStyle = COMBAT_E.coreHot || COMBAT_E.core; ctx.beginPath(); ctx.arc(mz.x, mz.y, low ? 1.8 : 2.4, 0, M.PI2); ctx.fill(); ctx.restore()
		return true
	}
	function drawElectroImpact(ctx, impact, level, low) {
		if (!impact.active) { return }
		var life = ELECTRIC_E.impactLifeSec || 0.12, p = clamp01(impact.age / life), alpha = 1 - p
		var outer = electroLevelValue('impactRadiusByLevel', level, [10, 12, 14, 16, 18])
		ctx.save(); ctx.translate(impact.x, impact.y)
		ctx.globalAlpha = alpha; ctx.fillStyle = COMBAT_E.impact; ctx.beginPath(); ctx.arc(0, 0, 4.5 + (1 - p) * 1.2, 0, M.PI2); ctx.fill()
		if (!low) {
			ctx.globalAlpha = alpha * 0.78; ctx.strokeStyle = COMBAT_E.impactEdge || COMBAT_E.edge; ctx.lineWidth = 1.2
			ctx.beginPath(); ctx.arc(0, 0, outer * (0.82 + p * 0.18), 0, M.PI2); ctx.stroke()
			ctx.strokeStyle = COMBAT_E.core; ctx.lineWidth = 1
			for (var i = 0; i < 3; i++) {
				var a = -M.PI / 2 + i * M.PI2 / 3, r1 = outer * 0.62, r2 = outer * 0.94
				ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke()
			}
		}
		ctx.restore()
	}
	function drawElectroIcon(ctx, x, y, size, color) {
		ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
		ctx.globalAlpha *= 0.92; ctx.fillStyle = COMBAT_E.iconBg || COMBAT_E.dark; ctx.beginPath(); ctx.arc(0, 0, size * 0.50, 0, M.PI2); ctx.fill()
		ctx.strokeStyle = color || COMBAT_E.icon || COMBAT_E.edge; ctx.lineWidth = Math.max(1, size * 0.10)
		for (var i = 0; i < 3; i++) {
			var a = -M.PI / 2 + i * M.PI2 / 3, x2 = Math.cos(a) * size * 0.31, y2 = Math.sin(a) * size * 0.31
			ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x2, y2); ctx.stroke()
			ctx.fillStyle = COMBAT_E.core; ctx.beginPath(); ctx.arc(x2, y2, Math.max(1.2, size * 0.095), 0, M.PI2); ctx.fill()
		}
		ctx.fillStyle = COMBAT_E.core; ctx.beginPath(); ctx.moveTo(0, -size * 0.16); ctx.lineTo(size * 0.13, 0); ctx.lineTo(0, size * 0.16); ctx.lineTo(-size * 0.13, 0); ctx.closePath(); ctx.fill(); ctx.restore()
	}
	function drawElectroOverlay(ctx, dense) {
		var s = electroVfxState, low = electroLowMode(dense)
		DBG.electroTurretActive = s.active ? 1 : 0; DBG.electroTurretFireAge = s.fireAge; DBG.electroBeamCount = 0
		if (!s.active) { return }
		syncElectroTargets(s)
		ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		var m = electroSpriteMetrics(s), c = electroCore(s, m)
		drawElectroTurretBodyOverlay(ctx, s, m)
		drawElectroIdleEnergy(ctx, s, m, low)
		drawElectroCharge(ctx, s, m, low)
		drawElectroFireAccent(ctx, s, m, low)
		var idlePulse = 1 + Math.sin((s.age / (ELECTRIC_E.breathSec || 1.15)) * M.PI2) * 0.042
		var ringScale = idlePulse - m.charge * 0.12 + m.recoil * 0.16
		ctx.globalAlpha = (0.50 + m.charge * 0.30 + m.recoil * 0.26) * m.alpha
		ctx.strokeStyle = COMBAT_E.edge; ctx.lineWidth = 1.4
		ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx * ringScale, c.ry * ringScale, 0, 0, M.PI2); ctx.stroke()
		ctx.globalAlpha = (0.60 + m.charge * 0.30 + m.recoil * 0.32) * m.alpha
		ctx.fillStyle = COMBAT_E.core
		ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(1.9, c.rx * 0.28), Math.max(1.25, c.ry * 0.50), 0, 0, M.PI2); ctx.fill()
		var count = Math.min(3, s.targets.length)
		for (var i = 0; i < count; i++) { if (drawElectroBeam(ctx, s, s.targets[i], low, i, count)) { DBG.electroBeamCount++ } }
		for (var j = 0; j < electroImpacts.length; j++) { drawElectroImpact(ctx, electroImpacts[j], s.comboLevel, low) }
		ctx.restore()
	}
	function drawElectroGroundWorld(ctx, dense) {
		var s = electroVfxState
		if (s.active) { drawElectroTurretWorld(ctx, s, dense) }
	}
	function drawElectricWorld(ctx) { var dense = electricDenseMode(); drawElectroGroundWorld(ctx, dense) }
	function drawElectricOverlay(ctx) {
		var dense = electricDenseMode()
		if (lightningFxState) { syncLightningAnchors(lightningFxState); drawLightningWorld(ctx, dense); drawLightningOverlay(ctx, dense) }
		DBG.lightningActive = lightningFxState ? 1 : 0
	}
	function drawElectroTopOverlay(ctx) {
		// 专用最后战斗层：在敌人、蛇、普通粒子和白闪核之后绘制炮台；仅伤害文字位于其上。
		var dense = electricDenseMode(); drawElectroOverlay(ctx, dense)
	}
	function updateLightningPhase(state) {
		if (state.age < state.propagateEnd) { state.phase = 'propagate'; state.currentSegment = Math.min(state.segmentCount - 1, Math.floor(state.age / state.hopDelay)) }
		else if (state.age < state.impactEnd) { state.phase = 'impact'; state.currentSegment = -1 }
		else if (state.age < state.fadeEnd) { state.phase = 'fade'; state.currentSegment = -1 }
		else { state.phase = 'done'; state.currentSegment = -1 }
	}
	function electricTick(dt) {
		if (lightningFxState) { lightningFxState.age += dt; updateLightningPhase(lightningFxState); if (lightningFxState.phase === 'done') { lightningFxState = null } }
		var s = electroVfxState
		if (s.active) {
			s.age += dt; s.scanAge += dt; s.deployAge += dt
			if (s.fireAge < 999) { s.fireAge += dt }
			if (s.phase === 'collapse') { s.collapseAge += dt; if (s.collapseAge >= (ELECTRO_COMBO.collapseSec || 0.18)) { resetElectroVfx() } }
		}
		for (var i = 0; i < electroImpacts.length; i++) { if (electroImpacts[i].active) { electroImpacts[i].age += dt; if (electroImpacts[i].age >= (ELECTRIC_E.impactLifeSec || 0.12)) { electroImpacts[i].active = false } } }
	}
	function drawFallbackDart(ctx, burning, worldPx) {
		var w = worldPx, h = worldPx * 0.42
		ctx.fillStyle = burning ? BURN_TRAIL : BOLT_COLOR
		ctx.beginPath(); ctx.moveTo(w * 0.55, 0); ctx.lineTo(-w * 0.15, -h * 0.46); ctx.lineTo(-w * 0.50, 0); ctx.lineTo(-w * 0.15, h * 0.46); ctx.closePath(); ctx.fill()
		ctx.fillStyle = '#65a83d'; ctx.beginPath(); ctx.moveTo(w * 0.42, 0); ctx.lineTo(-w * 0.12, 0); ctx.lineTo(-w * 0.42, h * 0.30); ctx.lineTo(-w * 0.08, h * 0.36); ctx.closePath(); ctx.fill()
	}
	function drawDartBody(ctx, da, x, y, ang, alpha) {
		var burning = da.burning, sprite = burning ? burnDartWorldSprite : boltWorldSprite, ready = burning ? burnDartWorldReady : boltWorldReady
		var worldPx = (burning ? BURN_DART_WORLD_PX : BOLT_WORLD_PX) + (burning ? 0 : ((da.level >= 3 ? 1 : 0) + (da.level >= 4 ? 1 : 0) + (da.level >= 5 ? 1 : 0)))
		ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = Math.min(1, alpha * 1.05)
		if (ready && sprite && sprite.naturalWidth) {
			var h = worldPx * (sprite.naturalHeight / sprite.naturalWidth) * DART_BODY_HEIGHT_SCALE
			if (burning) {
				var flicker = 1 + Math.sin((GS.timeSec || 0) * 34 + da.shotIndex * 1.7) * 0.025
				ctx.scale(flicker, 1 + (flicker - 1) * 0.45)
				ctx.drawImage(sprite, -worldPx * 0.5, -h * 0.5, worldPx, h)
				ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.16
				ctx.drawImage(sprite, -worldPx * 0.52, -h * 0.52, worldPx * 1.04, h * 1.04)
				ctx.globalCompositeOperation = 'source-over'
			} else {
				ctx.drawImage(sprite, -worldPx * 0.5, -h * 0.5, worldPx, h)
			}
		} else { ctx.scale(1, DART_BODY_HEIGHT_SCALE); drawFallbackDart(ctx, burning, worldPx) }
		ctx.restore()
	}
	function drawDartsOverlay(ctx) {
		var dense = dartDenseMode(); ctx.lineCap = 'round'
		for (var i = 0; i < darts.length; i++) {
			var da = darts[i]; if (da.delay > 0) { continue }
			var p = 1 - da.life / da.maxLife; p = clamp01(p)
			var x = da.x1 + (da.x2 - da.x1) * p, y = da.y1 + (da.y2 - da.y1) * p
			var ang = Math.atan2(da.y2 - da.y1, da.x2 - da.x1), ca = Math.cos(ang), sa = Math.sin(ang)
			var alpha = Math.min(1, da.life / Math.min(0.055, da.maxLife))
			var trail = DART_TRAIL_PX + (da.level >= 3 ? 1 : 0) + (da.level >= 5 ? 1 : 0) + (da.burning ? 10 : 0), tx = x - ca * trail, ty = y - sa * trail
			var nx = -sa, ny = ca, bend = da.burning ? Math.sin((GS.timeSec || 0) * 28 + da.shotIndex * 1.3) * 4.0 : ((da.shotIndex % 2 ? 1 : -1) * 2.0)
			if (da.burning) {
				ctx.globalAlpha = alpha * (BURNING_VFX.trailOuterAlpha || 0.34); ctx.strokeStyle = BURN_TRAIL; ctx.lineWidth = BURNING_VFX.trailOuterWidthPx || 3.6
				ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + x) * 0.5 + nx * bend, (ty + y) * 0.5 + ny * bend, x, y); ctx.stroke()
				ctx.globalAlpha = alpha * (BURNING_VFX.trailCoreAlpha || 0.58); ctx.strokeStyle = BURN_TRAIL_HOT; ctx.lineWidth = BURNING_VFX.trailCoreWidthPx || 1.35
				ctx.beginPath(); ctx.moveTo(x - ca * trail * 0.62, y - sa * trail * 0.62); ctx.quadraticCurveTo(x - ca * trail * 0.3 + nx * bend * 0.35, y - sa * trail * 0.3 + ny * bend * 0.35, x, y); ctx.stroke()
			} else {
				ctx.globalAlpha = alpha * (BOLT_VFX.trailOuterAlpha || 0.12); ctx.strokeStyle = BOLT_COLOR; ctx.lineWidth = BOLT_VFX.trailOuterWidthPx || 2.2
				ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + x) * 0.5 + nx * bend, (ty + y) * 0.5 + ny * bend, x, y); ctx.stroke()
				ctx.globalAlpha = alpha * (BOLT_VFX.trailCoreAlpha || 0.20); ctx.strokeStyle = '#efffc7'; ctx.lineWidth = BOLT_VFX.trailCoreWidthPx || 0.7
				ctx.beginPath(); ctx.moveTo(x - ca * trail * 0.46, y - sa * trail * 0.46); ctx.lineTo(x, y); ctx.stroke()
			}
			drawDartBody(ctx, da, x, y, ang, alpha)
		}
		ctx.globalAlpha = 1
	}
	function drawDartAccents(ctx) {
		for (var i = 0; i < dartAccents.length; i++) {
			var a = dartAccents[i], life = clamp01(a.life / a.maxLife), p = 1 - life
			ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle)
			if (a.kind === 'launch') {
				ctx.globalAlpha = life * 0.85; ctx.fillStyle = a.burning ? BURN_TRAIL_HOT : '#efffc7'
				ctx.beginPath(); ctx.arc(0, 0, 2.1 + p * 1.7, 0, M.PI2); ctx.fill()
				ctx.strokeStyle = a.burning ? BURN_TRAIL : BOLT_COLOR; ctx.lineWidth = 1
				ctx.beginPath(); ctx.moveTo(-4.5 * life, 0); ctx.lineTo(4.5 * life, 0); ctx.moveTo(0, -3.5 * life); ctx.lineTo(0, 3.5 * life); ctx.stroke()
			} else {
				var impactVfx = a.burning ? BURNING_VFX : BOLT_VFX, len = (impactVfx.impactArcPx || (a.burning ? 11.5 : 10.0)) * (0.90 + p * 0.16), col = a.burning ? BURN_TRAIL_HOT : BOLT_COLOR
				ctx.globalAlpha = life * 0.92; ctx.strokeStyle = col; ctx.lineCap = 'round'
				ctx.lineWidth = a.burning ? 2.3 : 1.9
				ctx.beginPath(); ctx.arc(0, 0, len, -0.82, 0.72); ctx.stroke()
				ctx.globalAlpha = life * 0.75; ctx.lineWidth = a.burning ? 1.8 : 1.45
				ctx.beginPath(); ctx.moveTo(-len * 0.56, len * 0.38); ctx.lineTo(len * 0.62, -len * 0.45); ctx.stroke()
				ctx.globalAlpha = life * 0.88; ctx.fillStyle = a.burning ? '#ffe19a' : '#efffc7'; ctx.beginPath(); ctx.arc(0, 0, impactVfx.impactCorePx || (a.burning ? 2.5 : 2.0), 0, M.PI2); ctx.fill()
				if (a.burning) {
					ctx.fillStyle = BURN_TRAIL; ctx.globalAlpha = life * 0.72
					var emberCount = BURNING_VFX.emberCount || 3
					for (var sp = 0; sp < emberCount; sp++) { var sa2 = -1.25 + sp * 1.15; ctx.beginPath(); ctx.arc(Math.cos(sa2) * (8 + sp * 1.5), Math.sin(sa2) * (8 + sp * 1.5), 1.2, 0, M.PI2); ctx.fill() }
				}
			}
			ctx.restore()
		}
		ctx.globalAlpha = 1
	}

	var Particle = {
		particles: particles, texts: texts, spawnBurst: spawnBurst, spawnText: spawnText, beams: beams, blasts: blasts, darts: darts, dartAccents: dartAccents, flashCores: flashCores, skillBursts: skillBursts,
		activeCount: function () { return particles.length + texts.length + beams.length + blasts.length + darts.length + dartAccents.length + flashCores.length + skillBursts.length },
		DBG: DBG,   // b9-diag：诊断计数器暴露给 render HUD 读取
		incIgnite: function () { DBG.ignite++ },   // b9-diag：灼烧弹幕点燃直计（替代 Bus 事件，免热路径观察者效应；零 gameplay）
		update: function (dt) {
			var i
			electricTick(dt)
			frameSpawn = 0   // 每帧预算归零（fixed-step 末尾 sim 已结算，下次 step 重新计）
			dotTextThisFrame = 0   // P2-10：DOT 飘字抽稀计数归零
			spawnFireEmbers()   // 恢复 8 月 5 日前 Fire：每 fixed-step 沿蛇身随机喷余烬；函数内部已有 suppressFire / 粒子半池 / spawnBudget / low 优先门控。
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
		// 先老化上一帧 accent，再推进飞镖；本帧新生成的命中叶切不会被同一个 dt 立即吃掉寿命。
		for (i = dartAccents.length - 1; i >= 0; i--) {
			var dac = dartAccents[i]; dac.life -= dt
			if (dac.life <= 0) { dartAccentPool.release(dac); dartAccents.splice(i, 1) }
		}
		for (i = darts.length - 1; i >= 0; i--) {
			var da = darts[i], activeDt = dt
			if (da.delay > 0) {
				da.delay -= dt
				if (da.delay > 0) { continue }
				activeDt = Math.max(0, -da.delay); da.delay = 0
			}
			syncDartTarget(da); da.life -= activeDt
			if (da.life <= 0) { finishDart(da); dartPool.release(da); darts.splice(i, 1) }
		}
		for (i = flashCores.length - 1; i >= 0; i--) {
			var fc = flashCores[i]; fc.life -= dt
			if (fc.life <= 0) { flashPool.release(fc); flashCores.splice(i, 1) }
		}
		for (i = skillBursts.length - 1; i >= 0; i--) {
			var sb = skillBursts[i]
			if (sb.delay > 0) { sb.delay -= dt; continue }
			sb.life -= dt
			if (sb.life <= 0) { skillBurstPool.release(sb); skillBursts.splice(i, 1) }
		}
	},
		// 由 render 在世界坐标系下调用；粒子层绘于核心实体之下，飘字小号，永不盖核心信息（JUICE 不干扰）
		drawWorld: function (ctx, ra) {
			if (ra == null) { ra = 1 }
			var i
			drawElectricWorld(ctx)
			for (i = 0; i < skillBursts.length; i++) {
				var sb = skillBursts[i]
				if (sb.delay > 0) { continue }
				var skind = sb.spriteKind || sb.kind, sprite = skind === 'ice' ? iceBloomSprite : (skind === 'steam' ? steamBurstSprite : fireHitSprite)
				var ready = skind === 'ice' ? iceBloomSpriteReady : (skind === 'steam' ? steamBurstSpriteReady : fireHitSpriteReady)
				if (!ready || !sprite || !sprite.naturalWidth) { continue }
				var burstAlpha = Math.max(0, sb.life / sb.maxLife), progress = 1 - burstAlpha
				var drawSize = sb.size * (1 + progress * sb.growMul)
				ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(burstAlpha, sb.fadePower) * sb.alphaMul
				ctx.translate(sb.x, sb.y); ctx.rotate(sb.angle); ctx.drawImage(sprite, -drawSize, -drawSize, drawSize * 2, drawSize * 2); ctx.restore()
			}
			for (i = 0; i < particles.length; i++) {
				var p = particles[i]
				var a = p.life / p.maxLife
				if (a < 0) { a = 0 }
				ctx.fillStyle = p.color
				var pr = p.soft ? p.size * (0.68 + (1 - a) * 0.72) : p.size * a
				ctx.globalAlpha = p.soft ? a * 0.82 : a
				ctx.beginPath(); ctx.arc(M.lerp(p.prevX, p.x, ra), M.lerp(p.prevY, p.y, ra), pr, 0, M.PI2); ctx.fill()
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
		// 爆环：随寿命从中心扩张并淡出（p=1→0 进度）
			for (i = 0; i < blasts.length; i++) {
				var bl = blasts[i]
				var bla = bl.life / bl.maxLife
				if (bla < 0) { bla = 0 }
				var prog = 1 - bla
				ctx.globalAlpha = bla * 0.6; ctx.strokeStyle = bl.color; ctx.lineWidth = bl.ringWidth
				ctx.beginPath(); ctx.arc(bl.x, bl.y, Math.max(1, bl.radius * prog), bl.startA, bl.endA); ctx.stroke()
			}
			ctx.globalAlpha = 1
		},
		// 叠加层：飞镖本体/命中叶切压在敌人实体上方；V4.2 以 22~25px 轻成长提高怪海可读性。
		drawOverlay: function (ctx, ra) {
			if (ra == null) { ra = 1 }
			drawElectricOverlay(ctx)
			drawDartsOverlay(ctx)
			drawDartAccents(ctx)
			DBG.flashDrawn = flashCores.length   // b9-diag：本帧白爆/闪核 draw 数（= 活跃闪核，每帧全绘）
			if (!(RT('PERF.suppressWhiteBurst', (global.PerfTier && global.PerfTier.suppressWhiteBurst) ? 1 : 0) > 0)) {   // b9-diag T1：关白爆 overlay 仅挡白闪核，不挡伤害飘字；回退源=PerfTier.suppressWhiteBurst(原写死 0→白爆永不关，本次接线)
				for (var i = 0; i < flashCores.length; i++) {
					var fc = flashCores[i]
					var a = fc.life / fc.maxLife; if (a < 0) { a = 0 }
					ctx.globalAlpha = a * 0.7   // 白闪核封顶 alpha（修 25s 偶发纯白屏：多个蒸汽/电闪核同点叠加 source-over 时不再逼近 1.0 纯白）
					ctx.fillStyle = fc.color
					ctx.beginPath(); ctx.arc(fc.x, fc.y, fc.radius * (1.25 - a * 0.25), 0, M.PI2); ctx.fill()
				}
			}
			// 电磁炮台专用最后战斗层：确保怪物、蛇和其他特效均不能覆盖主体与齐射束。
			drawElectroTopOverlay(ctx)
			// 伤害飘字绘于白闪和炮台之上（永远不被实体遮挡）
			ctx.globalAlpha = 1
			ctx.textAlign = 'center'
			for (var ti = 0; ti < texts.length; ti++) {
				var t = texts[ti]
				ctx.globalAlpha = M.clamp(t.life / t.maxLife * 1.5, 0, 1)
				ctx.fillStyle = t.color
				ctx.font = t.weight + ' ' + t.size + 'px system-ui, sans-serif'
				var tx = M.lerp(t.prevX, t.x, ra), ty = M.lerp(t.prevY, t.y, ra), textX = tx
				if (t.iconId === 'electro') {
					var iconSize = COMBAT_TEXT.iconSizePx || 15, iconGap = COMBAT_TEXT.iconGapPx || 4, numWidth = Math.max(t.size * 0.72, t.text.length * t.size * 0.58)
					var totalWidth = iconSize + iconGap + numWidth, left = tx - totalWidth * 0.5
					textX = left + iconSize + iconGap + numWidth * 0.5
					drawElectroIcon(ctx, left + iconSize * 0.5, ty - t.size * 0.36, iconSize, t.iconColor || COMBAT_E.icon || COMBAT_E.edge)
				}
				if (t.strokeColor && t.strokeWidth > 0) { ctx.strokeStyle = t.strokeColor; ctx.lineWidth = t.strokeWidth; ctx.strokeText(t.text, textX, ty) }
				ctx.fillText(t.text, textX, ty)
			}
			ctx.globalAlpha = 1
		},
		clear: function () {
			lightningFxState = null; resetElectroVfx()
			while (particles.length) { particlePool.release(particles.pop()) }
			while (texts.length) { textPool.release(texts.pop()) }
			while (beams.length) { beamPool.release(beams.pop()) }
			while (blasts.length) { blastPool.release(blasts.pop()) }
			while (darts.length) { dartPool.release(darts.pop()) }
			while (dartAccents.length) { dartAccentPool.release(dartAccents.pop()) }
			while (skillBursts.length) { skillBurstPool.release(skillBursts.pop()) }
			while (flashCores.length) { flashPool.release(flashCores.pop()) }
		}
	}

	// —— 事件订阅（即时·夸张·层叠）——
	function resolveCombatText(role, source) {
		var tier = COMBAT_TIERS[role] || COMBAT_TIERS.normal || {}
		var accent = source && SRC_STYLE[source] ? SRC_STYLE[source].color : null
		return { size: tier.sizePx || 14, weight: tier.weight || 700, color: accent || tier.fill || COLORS.damageText, prio: tier.priority || 'low', strokeColor: tier.stroke || null, strokeWidth: tier.strokePx || 0, customLife: tier.lifeSec || 0.6, risePxPerSec: tier.risePxPerSec || 36 }
	}
	function emitCombatText(x, y, text, role, source) {
		var style = resolveCombatText(role, source)
		return spawnText(x, y, text, style.color, style.size, style.prio, style)
	}
	Bus.on('enemy:hit', function (d) {
		if (!d || d.x == null || d.y == null) { return }
		var presentationDamage = Math.round(d.damage)
		if (presentationDamage <= 0) { return }
		var presentationY = d.y - 6 - (d.r || 0)
		var debugPrefix = COMBAT_TEXT.debugSourceLabels && d.src && SRC_STYLE[d.src] ? SRC_STYLE[d.src].label : ''
		if (d.isDot) {
			if (d.src === 'fire') { DBG.fireDot++ }
			if (dotTextThisFrame < RT('VFX.dotTextFrameCap', 10)) { dotTextThisFrame++; emitCombatText(d.x, presentationY, debugPrefix + '-' + presentationDamage, 'dot', d.src) }
			return
		}
		var presentationRole = d.crit ? 'crit' : 'normal'
		var presentation = resolveCombatText(presentationRole, d.src)
		if (presentationRole === 'normal') { spawnBurst(d.x, d.y, 5, presentation.color, 160, 3, 0.3, 'low') }
		emitCombatText(d.x, presentationY, debugPrefix + String(presentationDamage), presentationRole, d.src)
		return
		if (dmg <= 0) { return }                                  // 过滤 ≤0 伤害：绝不显示「0」飘字（防小数/无效伤害刷屏）
		var st = (d.src && SRC_STYLE[d.src]) ? SRC_STYLE[d.src] : null   // B-1：按来源取标签+专属色（无来源则回退旧样式）
		var ty = d.y - 6 - (d.r || 0)   // 飘字生成在精灵上方（按命中体半径抬升，修 boss 大精灵盖住伤害数字）
		if (d.isDot) {                                            // ⑦ DOT：专属小橙红飘字（伤害必显）；停喷逐次火花粒子——火墙 MULTI-敌叠加会把粒子池顶爆→GPU overdraw 主因（5 敌 350/350 数据定因）；火墙光环+飘字已足够反馈，零 gameplay
			if (d.src === 'fire') { DBG.fireDot++ }               // b9-diag：火墙 DOT 命中计数（仅 HUD，零 gameplay）
			if (dotTextThisFrame < RT('VFX.dotTextFrameCap', 10)) { dotTextThisFrame++; spawnText(d.x, ty, dl + '-' + dmg, dc, DOT_TEXT_SIZE, 'high') }   // P2-10：DOT 飘字每帧抽稀（火墙 MULTI-敌齐爆不糊屏）；提权 high 满池不让位
		} else {
			var electro = d.src === 'electro'
			var col = electro ? COMBAT_E.text : (d.crit ? COLORS.critText : (st ? st.color : COLORS.damageText))
			if (!electro) { spawnBurst(d.x, d.y, 5, st ? st.color : COLORS.damageText, 160, 3, 0.3, 'low') }
			spawnText(d.x, ty, (electro ? ((st && st.label) || '电磁 ') : (st ? st.label : '')) + dmg, col, electro ? (d.crit ? 20 : 16) : (d.crit ? 20 : 14), 'high', electro ? { strokeColor: COMBAT_E.textStroke, strokeWidth: COMBAT_TEXT.outlinePx || 2.5, customLife: COMBAT_TEXT.comboLifeSec || 0.72 } : null)   // 当前战斗标签体系保持一致：显示“电磁 数字”，图标系统留待专项统一
		}
	})
	Bus.on('fx:firecontact', function (d) {
		if (!d || d.x == null || d.y == null) { return }
		var fireStyle = SKILL_VFX.fire || {}
		var lowFire = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0
		var emberCount = lowFire ? 1 : (fireStyle.hitEmberCount || 3)
		if (!lowFire) { spawnSkillBurst('fire', d.x, d.y, Math.max(18, d.r || 18)) }
		emitParticle(d.x, d.y, 0, -8, fireStyle.hitCoreLifeSec || 0.13, fireStyle.hitCoreSizePx || 3.0, fireStyle.hitCoreColor || '#fff0b0', 0.86, 'low')
		spawnBurst(d.x, d.y, emberCount, fireStyle.hitEmberColor || '#ff9d42', fireStyle.hitEmberSpeed || 72, fireStyle.hitEmberSizePx || 1.6, fireStyle.hitEmberLifeSec || 0.18, 'low')
		if (!lowFire && emberCount > 1) { spawnBurst(d.x, d.y, 1, fireStyle.hitEmberHotColor || '#ffd27a', (fireStyle.hitEmberSpeed || 72) * 0.72, (fireStyle.hitEmberSizePx || 1.6) * 0.9, fireStyle.hitEmberLifeSec || 0.18, 'low') }
	})
	Bus.on('enemy:die', function (d) { spawnBurst(d.x, d.y, 12, d.color || STYLE.enemy, 220, 4, 0.5) })   // 死亡爆花取威胁色（d.color 来自 07_enemy STYLE 色阶）
	Bus.on('pickup:eat', function (d) { if (d && d.x != null) { spawnBurst(d.x, d.y, 6, STYLE.food, 120, 3, 0.35) } })   // 吃拾取金色爆花
	Bus.on('snake:hurt', function (d) {                                   // 受击：红色爆花+红飘字（危险语义，配合 render 全屏红闪+蛇头红闪+轻震屏）
		if (!d || d.x == null || d.y == null) { return }
		var hurtStyle = resolveCombatText('playerHurt')
		spawnBurst(d.x, d.y, 10, hurtStyle.color, 200, 4, 0.5)
		emitCombatText(d.x, d.y - 10, '-' + (d.damage || 1), 'playerHurt')
		return
		spawnBurst(d.x, d.y, 10, STYLE.enemy, 200, 4, 0.5)
		spawnText(d.x, d.y - 10, '-' + (d.damage || 1), STYLE.enemy, 14)   // P2-10：受击飘字字号 18→14（缩小，别糊屏）
	})
	// 需求B 技能视效接收（🟡 参数见顶部表现债常量块 TODO+候选，不动 §9）
	Bus.on('fx:bolt', function (d) {
		if (!d || !d.from || !d.to) { return }
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, BOLT_COLOR, dartFlightSec(d.from, d.to, d.killed, d.level, d.travel), { delay: d.visualDelay, level: d.level, shotIndex: d.shotIndex, shotCount: d.shotCount, targetId: d.targetId, targetRadius: d.targetRadius })
	})
	// 灼烧弹幕：同一晶叶核心 + 火焰强化层。事件仍在发射时 emit（音效时序不变）；命中叶切/火星由投射物抵达后产生。
	Bus.on('fx:burndart', function (d) {
		if (!d || !d.from || !d.to) { return }
		spawnDart(d.from.x, d.from.y, d.to.x, d.to.y, BOLT_COLOR, dartFlightSec(d.from, d.to, false, d.level, d.travel), { delay: d.visualDelay, burning: true, level: d.level, shotIndex: d.shotIndex, shotCount: d.shotCount, targetId: d.targetId, targetRadius: d.targetRadius })
	})
	Bus.on('fx:lightning', function (d) {
		if (!d || !d.chain || d.chain.length < 2) { return }
		lightningFxState = makeLightningState(d)
	})
	Bus.on('fx:electroturretdeploy', function (d) { if (d && d.x != null && d.y != null) { deployElectroVfx(d) } })
	Bus.on('fx:electroturretfire', function (d) { if (d && d.x != null && d.y != null) { fireElectroVfx(d) } })
	Bus.on('fx:electroturretend', function (d) { endElectroVfx(d) })
	Bus.on('fx:steamblast', function (d) {
		if (!d || d.x == null || d.y == null || !d.radius) { return }
		var steamStyle = SKILL_VFX.steam || {}
		var steamFrame = Math.floor(((global.performance && global.performance.now) ? global.performance.now() : Date.now()) / (1000 / ((CONFIG.GAME && CONFIG.GAME.fps) || 60)))
		var steamTime = (typeof GS.timeSec === 'number' ? GS.timeSec : -1) + ':' + steamFrame
		skipNextSteamFlash = steamTime === steamFlashTime
		steamFlashTime = steamTime

		// 蒸汽爆炸 V4：父技能只负责“来源识别”，且必须同中心；Steam 是第三种结果和绝对主视觉。
		// V4B 实机修正：skillBursts 在 drawWorld 中按插入顺序绘制。
		// 必须先 Ice、再 Fire，才能得到“蓝冰外层 + 橙火前景热核”；V4 的 Fire→Ice 顺序会让 Ice 直接盖住 Fire。
		spawnSkillBurst('steam', d.x, d.y, d.radius, 0, { spriteKind: 'ice', sizeMul: steamStyle.iceBurstSizeMul || 1.02, lifeSec: steamStyle.iceBurstLifeSec || 0.18, alphaMul: steamStyle.iceBurstAlpha == null ? 0.30 : steamStyle.iceBurstAlpha, fadePower: steamStyle.iceBurstFadePower == null ? 1.10 : steamStyle.iceBurstFadePower })
		spawnSkillBurst('steam', d.x, d.y, d.radius, 0, { spriteKind: 'fire', sizeMul: steamStyle.fireBurstSizeMul || 0.92, lifeSec: steamStyle.fireBurstLifeSec || 0.24, alphaMul: steamStyle.fireBurstAlpha == null ? 1.00 : steamStyle.fireBurstAlpha, fadePower: steamStyle.fireBurstFadePower == null ? 0.72 : steamStyle.fireBurstFadePower })
		spawnSkillBurst('steam', d.x, d.y, d.radius, 0, { spriteKind: 'steam', sizeMul: steamStyle.burstSizeMul || 1.05, lifeSec: steamStyle.burstLifeSec || 0.34, delaySec: steamStyle.burstDelaySec || 0.13, alphaMul: steamStyle.burstAlpha == null ? 0.96 : steamStyle.burstAlpha, growMul: steamStyle.burstGrowMul || 0.36, fadePower: steamStyle.burstFadePower == null ? 1.08 : steamStyle.burstFadePower })
		spawnFlashCore(d.x, d.y, d.radius * (steamStyle.coreRadiusMul || 0.13), steamStyle.coreColor || 'rgba(255,205,112,0.78)', steamStyle.coreLifeSec || 0.10)

		// 仅保留两段程序化破碎压力弧，避免新增第四张 PNG，也避免完整蓝圈与 Ice Field 混淆。
		var arcLife = steamStyle.pressureArcLifeSec || 0.18, arcColor = steamStyle.pressureArcColor || 'rgba(184,241,255,0.70)', spin = Math.random() * M.PI2
		spawnBlast(d.x, d.y, d.radius, arcColor, arcLife, spin + 0.10, spin + 2.35)
		spawnBlast(d.x, d.y, d.radius * 0.95, 'rgba(247,254,255,0.62)', arcLife * 0.82, spin + 3.15, spin + 5.45)

		// Steam PNG 已承担主体，程序粒子只补少量体积与散逸，防止 Combo 变成多素材堆叠。
		var puffN = scN(steamStyle.puffCount || 6), pMin = steamStyle.puffSpeedMin || 30, pMax = steamStyle.puffSpeedMax || 62
		for (var w = 0; w < puffN; w++) {
			var pa = Math.random() * M.PI2, ps = pMin + Math.random() * Math.max(0, pMax - pMin)
			var psize = (steamStyle.puffSizeMin || 6) + Math.random() * Math.max(0, (steamStyle.puffSizeMax || 10) - (steamStyle.puffSizeMin || 6))
			var pcol = (w % 3 === 0) ? (steamStyle.puffCoolColor || 'rgba(190,242,255,0.34)') : (steamStyle.puffColor || 'rgba(247,254,255,0.46)')
			emitParticle(d.x, d.y, Math.cos(pa) * ps, Math.sin(pa) * ps - (steamStyle.puffRiseSpeed || 28), steamStyle.puffLifeSec || 0.24, psize, pcol, 0.91, 'high', true)
		}

		spawnBurst(d.x, d.y, steamStyle.warmSparkCount || 2, steamStyle.warmSparkColor || '#ffb05a', 105, 2.1, 0.15)
		var chipN = scN(steamStyle.iceChipCount || 2), chipMin = steamStyle.iceChipSpeedMin || 82, chipMax = steamStyle.iceChipSpeedMax || 125
		for (var ic = 0; ic < chipN; ic++) {
			var ia = Math.random() * M.PI2, isp = chipMin + Math.random() * Math.max(0, chipMax - chipMin)
			emitParticle(d.x, d.y, Math.cos(ia) * isp, Math.sin(ia) * isp, steamStyle.iceChipLifeSec || 0.22, steamStyle.iceChipSizePx || 1.9, SKFX.ice, 0.9, 'high')
		}
	})
	// b9-diag：灼烧弹幕点燃计数改为 direct DBG.ignite++（见 incIgnite），不在热路径发 Bus 事件（已确认无 gameplay listener，纯诊断噪声）
	// B-2：敌人进入冰区 → 蓝字「减速」+ 小爆点（坐标用敌人位置；跨层走 Bus，不直调；事件名须全小写以过 Bus 断言）
	Bus.on('fx:iceslow', function (d) {
		if (!d || d.x == null || d.y == null) { return }
		if (COMBAT_TEXT.debugSourceLabels) { emitCombatText(d.x, d.y - 6 - (d.r || 12), d.frozen ? '冻结' : '减速', 'debugSource', 'ice') }
		spawnBurst(d.x, d.y, 3, SKFX.ice, 90, 2, 0.25)
		return
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
		spawnSkillBurst('ice', d.x, d.y, d.r || 40)
		spawnBlast(d.x, d.y, d.r || 40, 'rgba(225,243,255,0.75)', 0.3)   // 落点霜环扩张淡出
		spawnBurst(d.x, d.y, 6, SKFX.ice, 110, 3, 0.28)                  // 冰晶爆点
	})
	Bus.on('core:run_reset', function () { steamFlashTime = -1; skipNextSteamFlash = false; Particle.clear() })

	Registry.register('particle', Particle)
	Log.info('particle 就绪：池 粒子512/字32/束64/爆96/镖32/闪96')

	// 📝 修改日志
	// 2026-07-20 · 性能根治第四轮 · 新增 spawnFireEmbers()：火墙余烬改绑定"火源=蛇身"(每 fixed-step 沿蛇身随机喷 n 颗，n=min(4,2+火阶))，受 spawnBudget+low 优先门控，总量恒定不随敌数膨胀(修第三轮删火 DOT 粒子后"火墙无粒子感/表现力弱"的反馈)；第三轮保留项：isDot 伤害飘字提权 high(伤害必显)、瞬伤/死亡/蒸汽/电磁/闪电 VFX 全保留；不动 §9/伤害管线
	// 2026-07-20 · view-scale-and-dot · enemy:hit 非DOT 瞬伤/蒸汽飘字提权 high(满池必现)；飘字绘制从 drawWorld 移至 drawOverlay 白闪之后(永远不被白闪遮挡，修假人无数字)；不动 §9/伤害管线
	// 2026-07-20 · 性能根治第六轮(还原) · 回退第五轮 spawnFlashCore 并发上限 FLASH_CORE_CAP 与 fx:steamblast 白闪核半径/alpha 收窄；还原 round6 闪核表现；余烬门控(round6 FPS 主修复)保留；不动 §9/伤害管线/判定

})(typeof window !== 'undefined' ? window : this)

// 2026-08-07 · 飞镖技能族 V4 · 18~19px 有机晶叶世界实体 + 多目标纯视觉错峰 + 移动目标追踪 + 抵达后叶切/火星命中 + 灼烧同核火焰强化 + 怪海降噪；伤害/射程/频率/目标数/音频事件时点零修改。
