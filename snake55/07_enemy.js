;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M, Formula = Core.Formula
	var EN = CONFIG.ENEMIES, SPAWN = CONFIG.SPAWN, CB = CONFIG.COMBAT, COLORS = CONFIG.COLORS, GAME = CONFIG.GAME, ECON = CONFIG.ECON
	var lastKillSec = -999            // §7 连杀计时：最近一次击杀时刻（GS.timeSec），用于「resetSec 内无击杀→连杀清零」

	// 🟡 行为节奏：真理源未量化（仅给速度/半径/弹速），手感占位 + 候选，待回写真理源
	var CHARGE_DURATION_SEC = 0.4        // TODO: 待确认（候选 0.35 / 0.5）
	var WANDER_REDIR_SEC = 1.5           // TODO: 待确认（候选 1.2 / 2.0）
	var BOSS_FIRE_INTERVAL_SEC = 1.2     // TODO: 待确认（候选 1.0 / 1.5）
	var BOSS_FIRE_COUNT = 6              // TODO: 待确认（候选 5 / 8）
	var BOSS_BULLET_RADIUS = 9           // TODO: 待确认（候选 8 / 10）
	var BOSS_BULLET_LIFE_SEC = 4.0       // TODO: 待确认（候选 3 / 4）
	var DOT_TEXT_MIN = 4                 // ⑦ 表现层：DOT 累计到此值才飘伤害字（防每帧刷屏）；Commit A 由 10→4 让 DOT 飘字更频繁（视觉「持续小数字」），仅影响飘字聚合、不进伤害/命中判定；TODO 候选 3 / 6

	var colorByType = {
		chaser: COLORS.enemyChaser, wanderer: COLORS.enemyWanderer, charger: COLORS.enemyCharger,
		elite: COLORS.enemyElite, boss: COLORS.boss, bossBullet: COLORS.boss
	}

	var list = []
	var _id = 0
	function newEnemy() {
		return {
			active: false, id: 0, type: 'chaser',
			x: 0, y: 0, vx: 0, vy: 0, angle: 0,
			hp: 1, maxHp: 1, radius: 8, baseSpeed: 0, atk: 1, senseRange: -1, color: '#fff',
			kbImmune: false, state: 'seek', stateT: 0, cd: 0,
		contact: false, kbx: 0, kby: 0, stun: 0, slowT: 0, slowPct: 0, steamCd: 0,   // ④ per-enemy 蒸汽引爆冷却（默认 0；死亡经对象池复用复位）
		inIce: false, _iceHit: false,   // B-2：冰区进入标记（进入检测清零，防对象池复用残留）
		lifeT: 0, phase: 1, invuln: 0, fireT: 0, flashT: 0, dotMap: {},   // B-4 衍生：DOT 分源累加器（dotMap[src]=累计值），每来源独立 flush、独立标签（火墙🔥火墙/灼烧🔥灼烧），互不混
		burnT: 0, burnDps: 0   // ⑦ 燃烧 DOT 状态（默认 0；对象池复用与 bossBullet 走 spawnBullet 均靠此兜底，防残留）
	}
	}
	var pool = Core.createPool(newEnemy, function (e) { e.active = false }, 64)

	function inWorld(x, y, m) { return x >= m && y >= m && x <= GAME.worldWidth - m && y <= GAME.worldHeight - m }
	function clampWorld(e) { e.x = M.clamp(e.x, e.radius, GAME.worldWidth - e.radius); e.y = M.clamp(e.y, e.radius, GAME.worldHeight - e.radius) }

	// —— 刷怪位置：蛇头环形带，只在世界内有效弧段采样；贴墙/贴角时不足则内层兜底补齐 ——
	function pickSpawnPos(out, radius) {
		var snake = Registry.get('snake')
		var hx = snake && snake.head ? snake.head.x : GAME.worldWidth / 2
		var hy = snake && snake.head ? snake.head.y : GAME.worldHeight / 2
		var inner = SPAWN.ringInner, outer = SPAWN.ringOuter, m = radius + 4
		for (var i = 0; i < 24; i++) {                 // 1) 有效弧段重采样（贴墙时半数角度被否决）
			var ang = Math.random() * M.PI2
			var rad = M.rand(inner, outer)
			var x = hx + Math.cos(ang) * rad, y = hy + Math.sin(ang) * rad
			if (inWorld(x, y, m)) { out.x = x; out.y = y; return }
		}
		var toCx = GAME.worldWidth / 2 - hx, toCy = GAME.worldHeight / 2 - hy   // 2) 内层兜底：朝世界中心、内环半径、钳入世界
		var L = M.len(toCx, toCy) || 1
		out.x = M.clamp(hx + toCx / L * inner, m, GAME.worldWidth - m)
		out.y = M.clamp(hy + toCy / L * inner, m, GAME.worldHeight - m)
	}

	var _pos = { x: 0, y: 0 }
	function spawn(type) {
		var cfg = EN[type]
		if (!cfg) { Log.warn('未知敌人类型：' + type); return null }
		var e = pool.acquire()
		pickSpawnPos(_pos, cfg.radius || 12)
		e.active = true; e.id = ++_id; e.type = type
		e.x = _pos.x; e.y = _pos.y; e.vx = 0; e.vy = 0; e.radius = cfg.radius
		e.color = colorByType[type] || '#fff'
		e.contact = false; e.kbx = 0; e.kby = 0; e.stun = 0; e.slowT = 0; e.slowPct = 0; e.steamCd = 0; e.inIce = false; e._iceHit = false; e.isDummy = false   // B-GM：复用复位 isDummy + B-2 冰标记，防残留；④ 复位 per-enemy 蒸汽冷却
	e.burnT = 0; e.burnDps = 0   // ⑦ 燃烧状态复位（spawn/spawnBullet 双处，配合 newEnemy 默认字段）
		e.state = 'seek'; e.stateT = 0; e.cd = 0; e.lifeT = 0; e.flashT = 0; e.dotMap = {}   // B-4 衍生：对象池复用复位分源 DOT 累加器，防残留串味
		if (type === 'boss') {
			e.hp = e.maxHp = cfg.hpTotal; e.baseSpeed = cfg.speedPhase1; e.atk = cfg.atk
			e.phase = 1; e.invuln = 0; e.fireT = BOSS_FIRE_INTERVAL_SEC; e.kbImmune = true; e.senseRange = -1
		} else {
			e.hp = e.maxHp = cfg.hp; e.baseSpeed = cfg.speed; e.atk = cfg.atk
			e.senseRange = cfg.senseRange; e.kbImmune = (type === 'elite')
		}
		list.push(e)
		return e
	}
	function spawnBullet(x, y, ang) {
		var e = pool.acquire()
		e.active = true; e.id = ++_id; e.type = 'bossBullet'
		e.x = x; e.y = y; e.radius = BOSS_BULLET_RADIUS
		var sp = EN.boss.bulletSpeed
		e.vx = Math.cos(ang) * sp; e.vy = Math.sin(ang) * sp
		e.hp = e.maxHp = 1; e.kbImmune = true; e.color = colorByType.bossBullet
		e.lifeT = BOSS_BULLET_LIFE_SEC; e.contact = false; e.slowT = 0; e.slowPct = 0; e.steamCd = 0; e.inIce = false; e._iceHit = false; e.burnT = 0; e.burnDps = 0; e.isDummy = false
		list.push(e)
	}
	function releaseAt(i) { pool.release(list[i]); list.splice(i, 1) }
	function spawnDummy(count, hp) {                   // B-GM 标定沙盒：训练假人（超高血 / 不秒 / 站着），便于看 DOT 逐跳 / 减速时长 / 护盾扫敌
		count = count || 1; hp = hp || 5000
		for (var n = 0; n < count; n++) {
			var e = pool.acquire()
			pickSpawnPos(_pos, 24)
			e.active = true; e.id = ++_id; e.type = 'dummy'
			e.x = _pos.x; e.y = _pos.y; e.vx = 0; e.vy = 0; e.radius = 24
			e.color = '#ffd166'
			e.contact = false; e.kbx = 0; e.kby = 0; e.stun = 0; e.slowT = 0; e.slowPct = 0; e.steamCd = 0; e.inIce = false; e._iceHit = false
			e.burnT = 0; e.burnDps = 0
			e.state = 'idle'; e.stateT = 0; e.cd = 0; e.lifeT = 0; e.flashT = 0; e.dotMap = {}
			e.hp = e.maxHp = hp; e.baseSpeed = 0; e.atk = 0; e.senseRange = 0; e.kbImmune = true; e.isDummy = true
			list.push(e)
		}
		Log.info('[调试] 生成训练假人 ×' + count + ' (hp=' + hp + ')')
		return count
	}

	// 新手保护期降速（§6 rookieProtect）
	function rookieSpeedMul(now) {
		var rp = CONFIG.STAGE.rookieProtect
		for (var i = 0; i < rp.length; i++) { if (now >= rp[i].startSec && now < rp[i].endSec) { return rp[i].speedMul } }
		return 1
	}
	// 敌速 = min(raw, snakeSpeed×capRatio) × 新手mul × (1-slow)  → 保证玩家可甲脱
	function moveSpeed(e, raw, sm) {
		var cap = CONFIG.PLAYER.snakeSpeed * CB.enemySpeedCapRatio
		var s = (raw > cap ? cap : raw) * sm
		if (e.slowT > 0) { s *= (1 - e.slowPct) }
		return s
	}

	function die(e) {
		if (e.isDummy) { e.hp = e.maxHp; return }   // B-GM 训练假人：不秒、不计入击杀/分数/掉落；始终回满血，可无限反复测 DOT/减速/击退（避免血条卡死 1/maxHp 失观测意义）
		e.active = false
		GS.kills++
		GS.killStreak++                                   // 先自增连杀
		lastKillSec = GS.timeSec
		// §7 击杀计分：GS.score += scorePerKill[type] × 连杀倍率（自增后取倍率→第10连杀达封顶2.0；取整）
		var sb = (ECON.scorePerKill && typeof ECON.scorePerKill[e.type] === 'number') ? ECON.scorePerKill[e.type] : 0
		GS.score += Math.round(sb * Formula.killStreakMul(GS.killStreak))
		Bus.emit('enemy:die', { x: e.x, y: e.y, color: e.color, kind: e.type })   // kind=怪种（计分/掉落/统计用）
		if (e.type === 'boss') { Bus.emit('boss:defeated', { x: e.x, y: e.y }) }   // §7.4 击败 Boss = 通关结算（ui 走通关屏，非死亡屏）
	}
	// 外部（技能）受击入口。isDot=持续伤害（火光环/护盾接触/燃烧）：不逐帧飘字、不逐帧击退，累计到可读整数再飘（⑥⑦）
	// ⑦ 修正 DOT 每帧误刷 stun/flashT，收进 !isDot 分支；与 P0「DOT 不击退」口径统一（顺带修正火光环/护盾 DOT 把敌人冻住、白闪的 P0 遗漏）
	function applyDamage(e, amount, isCrit, isDot, src) {   // B-1：src=伤害来源标签（仅透传给飘字，不参与伤害计算）
		if (!e || !e.active || e.type === 'bossBullet' || e.invuln > 0) { return }
		e.hp -= amount
		if (!isDot) {                                                // ⑥ 仅即时伤害产生物理反应：受击闪白 + 击退；DOT 不刷 stun/flashT、不击退
			e.stun = Math.max(e.stun, CB.enemyHitStunFrames / GAME.fps)
			e.flashT = Math.max(e.flashT, CB.hitFlashFrames / GAME.fps)   // ⑥ 受击闪白（render 读 flashT）
			if (!e.kbImmune) {                                       // ⑥ 击退：远离蛇头 enemyKnockbackPx（精英/Boss 免疫）
				var sn = Registry.get('snake')
				var hx = sn && sn.head ? sn.head.x : e.x, hy = sn && sn.head ? sn.head.y : e.y
				var dx = e.x - hx, dy = e.y - hy, L = M.len(dx, dy) || 1
				e.kbx = dx / L * CB.enemyKnockbackPx; e.kby = dy / L * CB.enemyKnockbackPx
			}
		}
	if (isDot) {                                                  // ⑦ DOT 分源聚合飘字（B-4 衍生）：每来源独立累积/flush，互不混
		if (!src) { src = '_dot' }                              // 兜底 key（所有 DOT 调用均应传 src；兜底防 dotMap[undefined]）
		e.dotMap[src] = (e.dotMap[src] || 0) + amount
		if (e.hp <= 0) {                                        // 死亡：各来源残留 DOT 分别 flush（≥1 才出，杜绝「0」）
			for (var dk in e.dotMap) { if (e.dotMap[dk] >= 1) { Bus.emit('enemy:hit', { x: e.x, y: e.y, damage: e.dotMap[dk], crit: false, color: e.color, isDot: true, src: dk, r: e.radius }) } }
			die(e); return
		}
		for (var dk in e.dotMap) {                              // 周期 flush：各来源独立达 DOT_TEXT_MIN 即出独立飘字并清零该来源
			if (e.dotMap[dk] >= DOT_TEXT_MIN) {
				Bus.emit('enemy:hit', { x: e.x, y: e.y, damage: e.dotMap[dk], crit: false, color: e.color, isDot: true, src: dk, r: e.radius })
				e.dotMap[dk] = 0
			}
		}
		return
	}
		Bus.emit('enemy:hit', { x: e.x, y: e.y, damage: amount, crit: !!isCrit, color: e.color, isDot: !!isDot, src: src, r: e.radius })   // r=命中体半径：飘字偏移到精灵上方，防大体型（boss）盖住数字
		if (e.hp <= 0) { die(e) }
	}
	function applySlow(e, pct, dur) {
		if (!e || !e.active || e.type === 'bossBullet') { return }
		if (pct > e.slowPct || e.slowT <= 0) { e.slowPct = pct }
		e.slowT = Math.max(e.slowT, dur)
	}
	// ⑦ 点燃：刷新燃烧时长（不叠加 dps），供 burningBarrage 飞镖命中调用。DOT 在 updateOne 按 dt tick
	function ignite(e, sec, dps) {
		if (!e || !e.active || e.type === 'bossBullet' || e.invuln > 0) { return }
		e.burnT = Math.max(e.burnT, sec)
		e.burnDps = dps
	}

	function steer(e, tx, ty, spd, dt) {
		var dx = tx - e.x, dy = ty - e.y, L = M.len(dx, dy) || 1
		e.x += dx / L * spd * dt; e.y += dy / L * spd * dt
		e.angle = Math.atan2(dy, dx); clampWorld(e)
	}
	function wander(e, spd, dt) {
		e.cd -= dt
		if (e.cd <= 0) { e.angle = Math.random() * M.PI2; e.cd = WANDER_REDIR_SEC }
		e.x += Math.cos(e.angle) * spd * dt; e.y += Math.sin(e.angle) * spd * dt; clampWorld(e)
	}
	function sensesHead(e, hx, hy) { return e.senseRange < 0 ? true : M.distSq(e.x, e.y, hx, hy) <= e.senseRange * e.senseRange }
	function applyKnockback(e) {
		if (e.kbx !== 0 || e.kby !== 0) { e.x += e.kbx; e.y += e.kby; e.kbx = 0; e.kby = 0; clampWorld(e) }
	}
	function resolveContact(e, dt) { /* MVP no-op：蛇身接触不结算伤害（避免 bodyContactDps×dt≈0 触发 enemy:hit 飘字「0」刷屏）；「铁壁蛇阵」P1 再接入（§2.1） */ }

	function updateCharger(e, hx, hy, dt, sm) {
		var cfg = EN.charger
		if (e.state === 'seek') {
			if (sensesHead(e, hx, hy) && e.cd <= 0) { e.state = 'windup'; e.stateT = cfg.chargeWindupSec; e.angle = Math.atan2(hy - e.y, hx - e.x) }
			else { e.cd -= dt; steer(e, hx, hy, moveSpeed(e, e.baseSpeed, sm) * 0.7, dt) }
		} else if (e.state === 'windup') {
			e.stateT -= dt; e.angle = Math.atan2(hy - e.y, hx - e.x)
			if (e.stateT <= 0) { e.state = 'charge'; e.stateT = CHARGE_DURATION_SEC }
		} else if (e.state === 'charge') {
			e.stateT -= dt
			var cs = moveSpeed(e, cfg.chargeSpeed, sm)
			e.x += Math.cos(e.angle) * cs * dt; e.y += Math.sin(e.angle) * cs * dt; clampWorld(e)
			if (e.stateT <= 0) { e.state = 'stun'; e.stateT = cfg.stunSec }
		} else { e.stateT -= dt; if (e.stateT <= 0) { e.state = 'seek'; e.cd = cfg.stunSec } }
	}
	function updateBoss(e, hx, hy, dt, sm) {
		var cfg = EN.boss
		if (e.invuln > 0) { e.invuln -= dt }
		if (e.phase === 1 && e.hp <= cfg.hpTotal * (1 - cfg.phaseThresholdPct)) {
			e.phase = 2; e.baseSpeed = cfg.speedPhase2; e.invuln = cfg.transitionInvulnSec
			Bus.emit('enemy:phase', { phase: 2, x: e.x, y: e.y })
		}
		steer(e, hx, hy, moveSpeed(e, e.baseSpeed, sm), dt)
		e.fireT -= dt
		if (e.invuln <= 0 && e.fireT <= 0) {
			e.fireT = BOSS_FIRE_INTERVAL_SEC * (e.phase === 2 ? 0.7 : 1)
			var base = Math.atan2(hy - e.y, hx - e.x), spread = M.deg2rad(60)
			for (var i = 0; i < BOSS_FIRE_COUNT; i++) {
				var t = BOSS_FIRE_COUNT === 1 ? 0.5 : i / (BOSS_FIRE_COUNT - 1)
				spawnBullet(e.x, e.y, base - spread / 2 + spread * t)
			}
		}
	}

	function updateOne(e, dt, sm) {
		var snake = Registry.get('snake')
		var hx = snake && snake.head ? snake.head.x : e.x
		var hy = snake && snake.head ? snake.head.y : e.y
		if (e.slowT > 0) { e.slowT -= dt }
	if (e.steamCd > 0) { e.steamCd -= dt }   // ④ per-enemy 蒸汽引爆冷却（死亡经对象池复用复位）
		if (e.flashT > 0) { e.flashT -= dt }   // ⑥ 闪白计时衰减
		if (e.type === 'bossBullet') {
			e.lifeT -= dt; e.x += e.vx * dt; e.y += e.vy * dt
		if (e.lifeT <= 0 || !inWorld(e.x, e.y, -e.radius)) { e.active = false }
		return
	}
	if (e.burnT > 0) {                                          // ⑦ 燃烧 DOT：置于 bossBullet return 后、stun return 前
		e.burnT -= dt
		applyDamage(e, e.burnDps * dt, false, true, 'burn')  // 固定 dps、不经 Formula、isDot 分源聚合飘字、不击退（约束2：位置精确，避免子弹结算/眩晕期暂停）；B-4 ①b 像素级补完 + 衍生：补 src='burn' 透传进 dotMap 累计，引燃飘字带「🔥灼烧 」独立标签（否则 dotMap 不累计、SRC_STYLE.burn 成死配置）；纯标签零 gameplay
	}
	if (e.stun > 0) { e.stun -= dt; applyKnockback(e); resolveContact(e, dt); return }
		if (e.type === 'chaser' || e.type === 'elite') { steer(e, hx, hy, moveSpeed(e, e.baseSpeed, sm), dt) }
		else if (e.type === 'wanderer') {
			if (sensesHead(e, hx, hy)) { steer(e, hx, hy, moveSpeed(e, e.baseSpeed, sm), dt) }
			else { wander(e, moveSpeed(e, e.baseSpeed, sm) * 0.6, dt) }
		}
		else if (e.type === 'charger') { updateCharger(e, hx, hy, dt, sm) }
		else if (e.type === 'boss') { updateBoss(e, hx, hy, dt, sm) }
		applyKnockback(e)
		resolveContact(e, dt)
	}

	var Enemy = {
		list: list, spawn: spawn, spawnDummy: spawnDummy, applyDamage: applyDamage, applySlow: applySlow, ignite: ignite,
		countMobs: function () { var c = 0; for (var i = 0; i < list.length; i++) { if (list[i].active && list[i].type !== 'bossBullet' && !list[i].isDummy) { c++ } } return c },   // B-GM：假人不占刷怪 cap
		hasBoss: function () { for (var i = 0; i < list.length; i++) { if (list[i].active && list[i].type === 'boss') { return true } } return false },
		update: function (dt) {
			if (GS.status !== 'playing') { return }
			// §7 连杀清零：距上次击杀 ≥ resetSec 秒无新击杀（防挂机刷分）
			if (GS.killStreak > 0 && (GS.timeSec - lastKillSec) >= ECON.killStreak.resetSec) { GS.killStreak = 0 }
			var sm = rookieSpeedMul(GS.timeSec)
			for (var i = list.length - 1; i >= 0; i--) {
				updateOne(list[i], dt, sm)
				if (!list[i].active) { releaseAt(i) }
			}
		}
	}

	// 蛇身 × 敌人：MVP 阶段蛇身无任何交互（不伤害、不击退、不触发事件）——「铁壁蛇阵」为 P1 功能，留待后续启用（§2.1）
	Bus.on('collision:body_enemy', function () { /* MVP no-op */ })
	// 蛇头撞弹丸：弹丸销毁（伤害由 snake.js 的 collision:head_enemy 结算）
	Bus.on('collision:head_enemy', function (d) {
		for (var i = 0; i < list.length; i++) {
			if (list[i].id === d.enemyId && list[i].type === 'bossBullet') { list[i].active = false; return }
		}
	})
	Bus.on('core:run_reset', function () { while (list.length) { pool.release(list.pop()) } _id = 0; lastKillSec = -999 })
	// §7：蛇头扣心 → 连杀清零（不奖励以血换分）
	Bus.on('snake:hurt', function () { GS.killStreak = 0 })

	Registry.register('enemy', Enemy)
	Log.info('enemy 就绪：池 64')

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · P1-② electroTurret/burningBarrage · enemy 侧：newEnemy 新增 burnT/burnDps 字段、spawn 复位、spawnBullet 兜底、ignite() 点燃入口、updateOne 燃烧 DOT tick（bossBullet return 后→stun 前） · 不动 §9
// 2026-07-14 · ④ 蒸汽状态引爆 · enemy 侧：newEnemy + spawn/spawnBullet/spawnDummy 加 per-enemy steamCd 字段（默认 0、三处复位）；updateOne 每帧 steamCd -= dt（死亡经对象池复用自然复位，满足④「死亡清理」）；带冰判定读 e.slowT>0（Lv5 冻结 pct=1 仍走 slowT，已覆盖，无需独立 frozenT 字段）· 不动 §9
