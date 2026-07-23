;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M
	var P = CONFIG.PLAYER

	var head = { x: 0, y: 0, angle: 0, px: 0, py: 0, pangle: 0 }   // px/py/pangle = 上一模拟步位姿（渲染插值用，消 fixed-step 一顿一顿）
	var segments = []            // 含头节(index 0)
	var path = []                // 头部历史轨迹（绳感跟随），最新在前
	var PATH_MAX = 1
	var inputDir = { x: 0, y: 0, active: false }
	var squash = { sx: 1, sy: 1, t: 0, dur: 0, from: 1, to: 1 }
	var wallScrape = { until: 0 }   // 撞墙刮擦减速：持续到 GS.timeSec 达此值（真理源 §2.1）

	// B-GM 实时标定桥（dev）：读 editor 运行时覆盖，无覆盖回退冻结 CONFIG 默认；仅替换 input 来源，不改判定/公式语义
	function RT(path, fb) {
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	// §1：转向速率随节数衰减，不低于 turnRateFloor（P0 手感三件套，支持 GM 运行时热调）
	function effectiveTurnRateDeg() {
		var base = RT('PLAYER.turnRate', P.turnRate)
		if (GS.segments <= P.initSegments) { return base }   // 短蛇（开局 3 节）不衰减，恒 = 基线
		var decay = RT('PLAYER.turnRateDecayPerSeg', P.turnRateDecayPerSeg * 100) / 100   // 单位陷阱规避：RT 用 %/节，热路径 /100（默认 1.0/节 → 0.010，2026-07-22 调参）
		var mul = 1 - decay * (GS.segments - P.initSegments)
		var v = base * mul
		var floor = RT('PLAYER.turnRateFloor', P.turnRateFloor)
		return v < floor ? floor : v
	}
	function setSegments(n) {
		while (segments.length < n) { segments.push({ x: head.x, y: head.y, px: head.x, py: head.y }) }   // px/py=上一模拟步位姿（渲染插值用，消身体一顿一顿）
		while (segments.length > n) { segments.pop() }
	}
	function triggerSquash(to, durMs) { squash.from = 1; squash.to = to; squash.t = 0; squash.dur = durMs / 1000 }

	function spawnAtCenter() {
		head.x = CONFIG.GAME.worldWidth / 2
		head.y = CONFIG.GAME.worldHeight / 2
		head.angle = 0
		head.px = head.x; head.py = head.y; head.pangle = head.angle   // 插值初值=当前，避免开局从原点飞入
		PATH_MAX = (P.maxSegments + 2) * P.segmentSpacing + 64
		segments.length = 0
		setSegments(GS.segments)
		path.length = 0
		for (var i = 0; i < PATH_MAX; i++) { path.push({ x: head.x - i, y: head.y }) }  // 预填防开局抽提
	}
	// 路径点复用（热路径零 new）
	function recordPath() {
		var pt = (path.length >= PATH_MAX) ? path.pop() : { x: 0, y: 0 }
		pt.x = head.x; pt.y = head.y
		path.unshift(pt)
	}
	// 绳感：按「累计弧长」沿历史路径取点（与帧率/速度无关）——第 s 节落在距蛇头弧长 s*segmentSpacing 处
	function updateFollow() {
		var spacing = P.segmentSpacing
		if (segments.length === 0) { return }
		segments[0].x = M.lerp(segments[0].x, path[0].x, P.followLerp)   // 第 0 节贴合蛇头
		segments[0].y = M.lerp(segments[0].y, path[0].y, P.followLerp)
		var acc = 0, pi = 1            // acc=path[0..pi-1] 累计弧长；pi 单调前进、跨节复用（O(节+路径)）
		for (var s = 1; s < segments.length; s++) {
			var targetDist = s * spacing
			while (pi < path.length && acc < targetDist) {
				acc += M.dist(path[pi - 1].x, path[pi - 1].y, path[pi].x, path[pi].y)
				pi++
			}
			var tx, ty
			if (acc < targetDist || pi < 2) {            // 路径不够长（开局/短蛇）：贴最末点
				var lp = path[path.length - 1]; tx = lp.x; ty = lp.y
			} else {                                     // 在 path[pi-2]→path[pi-1] 段内按越过量回插，定位精确弧长点
				var a = path[pi - 2], b = path[pi - 1]
				var segLen = M.dist(a.x, a.y, b.x, b.y) || 1
				var t = 1 - (acc - targetDist) / segLen
				if (t < 0) { t = 0 } else if (t > 1) { t = 1 }
				tx = M.lerp(a.x, b.x, t); ty = M.lerp(a.y, b.y, t)
			}
			var seg = segments[s]
			seg.x = M.lerp(seg.x, tx, P.followLerp)
			seg.y = M.lerp(seg.y, ty, P.followLerp)
		}
	}

	var Snake = {
		head: head, segments: segments, squash: squash,
		setInput: function (dx, dy, active) { inputDir.x = dx; inputDir.y = dy; inputDir.active = active },
		getEffectiveTurnRate: effectiveTurnRateDeg,
		update: function (dt) {
			if (GS.status !== 'playing') { return }
			head.px = head.x; head.py = head.y; head.pangle = head.angle   // 记录上一模拟步位姿（渲染插值基准）
			for (var _si = 0; _si < segments.length; _si++) { segments[_si].px = segments[_si].x; segments[_si].py = segments[_si].y }   // 各身体节同步记录 prev（渲染插值消 165Hz 一顿一顿）
			// 1) 转向：朝摇杆方向，受 effectiveTurnRate 限制
			if (inputDir.active && (inputDir.x !== 0 || inputDir.y !== 0)) {
				var targetAngle = Math.atan2(inputDir.y, inputDir.x)
				var maxStep = M.deg2rad(effectiveTurnRateDeg()) * dt
				head.angle = M.angleLerp(head.angle, targetAngle, maxStep)
			}
			// 2) 恒速前进（贴墙刮擦期降速到 wallScrapeSpeedMult，离墙 grace 秒后恢复全速）
			var speed = P.snakeSpeed
			if (CONFIG.GAME.wallSlide && GS.timeSec < wallScrape.until) { speed *= CONFIG.GAME.wallScrapeSpeedMult }
			head.x += Math.cos(head.angle) * speed * dt
			head.y += Math.sin(head.angle) * speed * dt
			// 3) 撞墙＝沿墙滑行（逐轴钳制→垂直分量归零、切向保速、不可穿越）+ 刮擦减速 grace（真理源 §2.1，非致死源）
			var r = RT('PLAYER.headRadius', P.headRadius), hitWall = false   // L2：墙碰半径实时跟随 GM 滑条（RT 桥），与视觉/判定同源
			if (head.x < r) { head.x = r; hitWall = true }
			if (head.y < r) { head.y = r; hitWall = true }
			if (head.x > CONFIG.GAME.worldWidth - r) { head.x = CONFIG.GAME.worldWidth - r; hitWall = true }
			if (head.y > CONFIG.GAME.worldHeight - r) { head.y = CONFIG.GAME.worldHeight - r; hitWall = true }
			if (hitWall) {
				wallScrape.until = GS.timeSec + CONFIG.GAME.wallScrapeGrace   // 接触后维持刮擦减速 grace 秒
				Bus.emit('snake:wall', { x: head.x, y: head.y })             // render→shakeLight、particle→刮擦火花（不致死）
			}
			// 4) 路径记录 + 跟随
			recordPath()
			updateFollow()
			// 5) squash/stretch 衰减（0→to→1体积守恒）
			if (squash.dur > 0) {
				squash.t += dt
				var k = M.clamp(squash.t / squash.dur, 0, 1)
				var v = k < 0.5 ? M.lerp(squash.from, squash.to, k * 2) : M.lerp(squash.to, 1, (k - 0.5) * 2)
				squash.sx = v; squash.sy = 2 - v
				if (k >= 1) { squash.dur = 0; squash.sx = 1; squash.sy = 1 }
			}
		}
	}

	Bus.on('core:run_reset', function () { spawnAtCenter(); squash.sx = 1; squash.sy = 1; squash.dur = 0 })
	Bus.on('pickup:eat', function (d) {
		if (d && d.kind && d.kind !== 'food') { return }   // 只有食物 +1 节
		if (GS.segments < P.maxSegments) {                 // B：以 maxSegments 为唯一真源门控（segCap 仅文档别名；二者现相等=25，杜绝配置漂移→区间静默吞食）
			GS.segments += CONFIG.PICKUP.food.gainSegments
			setSegments(GS.segments)
			triggerSquash(CONFIG.JUICE.squashEat.scale, CONFIG.JUICE.squashEat.durationMs)   // JUICE 吞噬挤压回弹
			Bus.emit('snake:grow', { segments: GS.segments })
		} else {
			GS.score += CONFIG.PICKUP.food.overflowScore    // B：满节溢出食物 → 小分占位（不+节、不回血；coreHp=3 是唯一命门，回血泛滥毁生存张力；score 用途未定仅占位）
			var _ph = Registry.get('particle')              // B：满节溢出飘字反馈（gold，让占位分可被感知/验收；放蛇头避免抉择路径 x:0 飘屏外）
			if (_ph && _ph.spawnText) { _ph.spawnText(head.x, head.y - 16, '+' + CONFIG.PICKUP.food.overflowScore + ' 满节溢出', '#ffd76b', 16, 'high') }
			Bus.emit('snake:overflow_food', { score: CONFIG.PICKUP.food.overflowScore })
		}
	})
	Bus.on('collision:head_enemy', function (d) {
		if (GS.status !== 'playing') { return }             // ④ 暂停/选择/死亡态不结算蛇头受击（防冤死）
		// B-1：训练假人是安全观察靶，蛇头蹭到不掉心、不触发受击表现（避免"碰自己假人掉血"反直觉）
		if (d && d.enemyId != null) {
			var _el = (Registry.get('enemy') || {}).list || []
			for (var _i = 0; _i < _el.length; _i++) { if (_el[_i].id === d.enemyId && _el[_i].isDummy) { return } }
		}
		var now = GS.timeSec
		if (now < GS.invincibleUntil) { return }            // 无敌帧
		var next = GS.coreHp - CONFIG.COMBAT.headHitDamage
		// 致死保护：前 lethalProtectSec 秒最低保留 lethalProtectMinHp
		if (now <= CONFIG.STAGE.lethalProtectSec && next < CONFIG.STAGE.lethalProtectMinHp) { next = CONFIG.STAGE.lethalProtectMinHp }
		GS.coreHp = next
		GS.invincibleUntil = now + CONFIG.COMBAT.invincibleFrames / CONFIG.GAME.fps
		GS.killStreak = 0
		triggerSquash(CONFIG.JUICE.squashHitDeath.scale, CONFIG.JUICE.squashHitDeath.durationMs)   // JUICE 受击形变
		Bus.emit('snake:hurt', { x: head.x, y: head.y, damage: CONFIG.COMBAT.headHitDamage, coreHp: GS.coreHp })
		if (GS.coreHp <= 0) { Bus.emit('snake:dead', { x: head.x, y: head.y }) }
	})

	Registry.register('snake', Snake)
	Log.info('snake 就绪')

})(typeof window !== 'undefined' ? window : this)
