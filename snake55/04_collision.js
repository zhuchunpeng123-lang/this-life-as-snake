;(function (global) {
	'use strict'
	try {
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Log = global.Log, Core = global.Core
	var M = Core.M
	// 判定半径安全下限（对抗性修复）：GM 滑条曾可拖到 4 并持久化进 localStorage，导致 HEAD_R=4 → 判定圈缩到几乎吃不到食物（"吃食物没效果"根因）。<MIN_JUDGE_R 一律当无效 → 回退默认，刷新即可恢复，无需手动清 localStorage
	var MIN_JUDGE_R = 8   // dev 工具边界的安全下限（非 gameplay 数值）：过小判定半径会造成「看着碰到却吃不到」；与 13_editor RANGE.playerRadius 最小对齐
	function numRadius(v) { var n = (typeof v === 'number') ? v : parseFloat(v); if (!isFinite(n) || n <= 0) { return 0 }; if (n < MIN_JUDGE_R) { return 0 }; return n }   // 非数/非正/过小 → 0（交调用方回退默认 14/12）
	// L2：判定半径初始取冻结 CONFIG；运行时经 Bus('collision:set_radii') 推送更新（GM 蛇头/身半径滑条实时生效），update() 内部不再读 RT，零每帧额外开销；reload 后 applyTuningOverrides 把持久 override 写回 CONFIG 再冻结，故重载后自动取终值
	// 防御（对抗性复查）：若 CONFIG 被坏值覆盖（localStorage['snake55_tuning'] 残留 0/NaN/undefined/字符串/过小），半径须回退默认，否则 HEAD_R 过小 → circleHit 几乎永假 → 食物/敌判定全失效（"吃食物没效果"根因）；14/12 为 RANGE 注释记载默认
	var HEAD_R = numRadius(CONFIG.PLAYER.headRadius) || 14
	var BODY_R = numRadius(CONFIG.PLAYER.bodyRadius) || 12

	// 空间哈希（大实体按 AABB 跨格插入）
	function SpatialHash(cellSize) { this.cell = cellSize; this.map = {}; this._stamp = 0 }
	SpatialHash.prototype.clear = function () { this.map = {} }
	SpatialHash.prototype._key = function (cx, cy) { return cx + ',' + cy }
	SpatialHash.prototype.insert = function (ent) {
		var r = ent.radius, c = this.cell
		var minX = ((ent.x - r) / c) | 0, maxX = ((ent.x + r) / c) | 0
		var minY = ((ent.y - r) / c) | 0, maxY = ((ent.y + r) / c) | 0
		for (var gx = minX; gx <= maxX; gx++) {
			for (var gy = minY; gy <= maxY; gy++) {
				var k = this._key(gx, gy)
				if (!this.map[k]) { this.map[k] = [] }
				this.map[k].push(ent)
			}
		}
	}
	SpatialHash.prototype.query = function (x, y, r, out) {
		out = out || []; out.length = 0
		var c = this.cell
		var minX = ((x - r) / c) | 0, maxX = ((x + r) / c) | 0
		var minY = ((y - r) / c) | 0, maxY = ((y + r) / c) | 0
		this._stamp++
		var stamp = this._stamp
		for (var gx = minX; gx <= maxX; gx++) {
			for (var gy = minY; gy <= maxY; gy++) {
				var bucket = this.map[this._key(gx, gy)]
				if (!bucket) { continue }
				for (var i = 0; i < bucket.length; i++) {
					var e = bucket[i]
					if (e.__qstamp === stamp) { continue }
					e.__qstamp = stamp
					out.push(e)
				}
			}
		}
		return out
	}

	function circleHit(ax, ay, ar, bx, by, br) {
		var dx = bx - ax, dy = by - ay, rr = ar + br
		return (dx * dx + dy * dy) <= rr * rr
	}

	var hash = new SpatialHash(CONFIG.SPATIAL.cellSize)
	var _scratch = []

	var Collision = {
		hash: hash,
		circleHit: circleHit,
		queryCircle: function (x, y, r) { return hash.query(x, y, r, []) },
		// 诊断（对抗性复查）：控制台 `Registry.get('collision').getRadii()` 可看当前实际判定半径；若 head<=0 即命中"吃食物没效果"根因
		getRadii: function () { return { head: HEAD_R, body: BODY_R } },
		update: function () {
			if (GS.status !== 'playing') { return }   // ④ 非 playing（菜单/3选1/死亡）不检测碰撞：防暂停期冤死
			hash.clear()
			var enemySys = Registry.get('enemy')
			var enemies = (enemySys && enemySys.list) ? enemySys.list : null
			if (enemies) {
				for (var i = 0; i < enemies.length; i++) { if (enemies[i].active) { hash.insert(enemies[i]) } }
			}
			var snake = Registry.get('snake')
			if (!snake || !snake.head) { return }
			var head = snake.head

			// 1) 蛇头 × 食物
			var pickup = Registry.get('pickup')
			if (pickup && pickup.foods) {
				var foods = pickup.foods
				for (var f = 0; f < foods.length; f++) {
					var fd = foods[f]
					if (fd.active && circleHit(head.x, head.y, HEAD_R, fd.x, fd.y, fd.radius)) {
						Bus.emit('pickup:eat', { id: fd.id, kind: fd.kind, x: fd.x, y: fd.y })
					}
				}
			}

			if (enemies) {
				// 2) 蛇头 × 敌人（致命，受无敌帧约束 — 判定在 snake.js）
				var near = hash.query(head.x, head.y, HEAD_R + CONFIG.SPATIAL.cellSize, _scratch)
				for (var n = 0; n < near.length; n++) {
					var e2 = near[n]
					if (e2.active && circleHit(head.x, head.y, HEAD_R, e2.x, e2.y, e2.radius)) {
						Bus.emit('collision:head_enemy', { enemyId: e2.id })
					}
				}
				// 3) 蛇身 × 敌人（接触 dps + 击退 — 判定在 enemy.js）
				var segs = snake.segments
				if (segs) {
					for (var s = 1; s < segs.length; s++) {
						var sg = segs[s]
						var nb = hash.query(sg.x, sg.y, BODY_R + CONFIG.SPATIAL.cellSize, _scratch)
						for (var b = 0; b < nb.length; b++) {
							var e3 = nb[b]
							if (e3.active && circleHit(sg.x, sg.y, BODY_R, e3.x, e3.y, e3.radius)) {
								Bus.emit('collision:body_enemy', { enemyId: e3.id, segIndex: s })
							}
						}
					}
				}
			}
		}
	}

	// L2：GM 蛇头/身半径滑条实时推送（免重载）；与 render 的 RT 桥同源数值，保证「看到=打到」拖动时即时一致；numRadius 拒绝 ≤0/NaN/字符串错值，防止推送坏值使判定全失效
	Bus.on('collision:set_radii', function (d) {
		if (!d) { return }
		var h = numRadius(d.headRadius); if (h) { HEAD_R = h }
		var b = numRadius(d.bodyRadius); if (b) { BODY_R = b }
	})
	Registry.register('collision', Collision)
	Log.info('collision 就绪：cellSize=' + CONFIG.SPATIAL.cellSize)
	} catch (e) {
		if (global.console) { global.console.error('[collision] 启动失败：', e) }   // 长期防御：任一启动异常 → 控制台留痕 + 上抛给 index.html 前移的 onerror 兜底显示红字（不再静默）
		throw e   // 上抛，让 index.html 前移的 onerror 兜底显示红字
	}
})(typeof window !== 'undefined' ? window : this)
