;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Log = global.Log, Core = global.Core
	var M = Core.M
	var HEAD_R = CONFIG.PLAYER.headRadius, BODY_R = CONFIG.PLAYER.bodyRadius

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

	Registry.register('collision', Collision)
	Log.info('collision 就绪：cellSize=' + CONFIG.SPATIAL.cellSize)

})(typeof window !== 'undefined' ? window : this)
