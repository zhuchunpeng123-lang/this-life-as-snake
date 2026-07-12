;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Log = global.Log
	var LS_KEY = 'snake55_tuning'

	// —— UI 滑块范围常量（集中，避免逻辑里散落魔法数字；dev 工具边界，非 gameplay 数值）——
	var RANGE = {
		snakeSpeed: [80, 400, 5], turnRate: [60, 360, 5], maxSegments: [5, 60, 1],
		bodyContactDps: [0, 40, 1], critRate: [0, 1, 0.01], foodCap: [1, 20, 1],
		enemyHp: [1, 400, 1], enemySpeed: [20, 300, 5], enemyAtk: [1, 10, 1], enemyRadius: [6, 60, 1],
		bossHpTotal: [1000, 40000, 500],
		fireDot: [0, 60, 1], boltDmg: [0, 80, 1], lightningDmg: [0, 80, 1], shieldDmg: [0, 60, 1],
		fireRadius: [20, 220, 2], iceWidth: [10, 180, 2], shieldOrbit: [20, 160, 2], iceSlow: [0, 1, 0.05],   // B-2 标定：火焰半径/冰冻宽度/护盾环半径(px) + 冰冻减速%
		comboMul: [0, 10, 0.1], burnDps: [0, 40, 1], comboRadius: [20, 200, 5]
	}
	// 怪物属性（每种类型一组 slider）；boss 的 hp 字段名为 hpTotal，单独映射
	var ENEMY_TYPES = Object.keys(CONFIG.ENEMIES)
	var ENEMY_STATS = [
		{ key: 'hp', label: 'HP', rng: 'enemyHp' },
		{ key: 'speed', label: '速度', rng: 'enemySpeed' },
		{ key: 'atk', label: '攻击', rng: 'enemyAtk' },
		{ key: 'radius', label: '半径', rng: 'enemyRadius' }
	]
	// 技能伤害（逐等级数组 → 每级一个 slider）；COMBO 标量另列
	var SKILL_ARR = [
		{ path: 'SKILL.fire.dotPerSec', label: '火 DOT/s', rng: 'fireDot', levels: 5 },
		{ path: 'SKILL.fire.radius', label: '火焰半径', rng: 'fireRadius', levels: 5 },        // B-2 标定核心
		{ path: 'SKILL.ice.trailWidth', label: '冰冻宽度', rng: 'iceWidth', levels: 5 },       // B-2 标定核心
		{ path: 'SKILL.ice.slowPct', label: '冰冻减速%', rng: 'iceSlow', levels: 5 },          // 冰整块之前未暴露，一并补上
		{ path: 'SKILL.bolt.damage', label: '飞镖伤害', rng: 'boltDmg', levels: 5 },
		{ path: 'SKILL.lightning.damage', label: '闪电伤害', rng: 'lightningDmg', levels: 5 },
		{ path: 'SKILL.shield.contactDamage', label: '护盾接触', rng: 'shieldDmg', levels: 5 },
		{ path: 'SKILL.shield.orbitRadius', label: '护盾环半径', rng: 'shieldOrbit', levels: 5 }   // B-2 标定核心
	]
	var SKILL_SCALAR = [
		{ path: 'COMBO.steamExplosion.damageMul', label: '蒸汽倍率', rng: 'comboMul' },
		{ path: 'COMBO.electroTurret.damageMul', label: '电磁倍率', rng: 'comboMul' },
		{ path: 'COMBO.burningBarrage.burnDps', label: '灼烧DPS', rng: 'burnDps' },
		{ path: 'COMBO.steamExplosion.radius', label: '蒸汽半径', rng: 'comboRadius' }
	]
	// 蛇/战斗 标量（走 override+重载）
	var SNAKE_SCALAR = [
		{ path: 'PLAYER.snakeSpeed', label: '蛇速', rng: 'snakeSpeed' },
		{ path: 'PLAYER.turnRate', label: '转向速率', rng: 'turnRate' },
		{ path: 'PLAYER.maxSegments', label: '最大节数', rng: 'maxSegments' },
		{ path: 'COMBAT.bodyContactDps', label: '蛇身接触DPS', rng: 'bodyContactDps' },
		{ path: 'COMBAT.critRate', label: '暴击率', rng: 'critRate' },
		{ path: 'PICKUP.food.screenCap', label: '食物上限', rng: 'foodCap' }
	]

	function getPath(p) { var ks = p.split('.'), o = CONFIG; for (var i = 0; i < ks.length; i++) { if (o == null) { return undefined } o = o[ks[i]] } return o }
	function isNum(v) { return typeof v === 'number' && isFinite(v) }
	function setPath(obj, p, val) { var ks = p.split('.'), o = obj; for (var i = 0; i < ks.length - 1; i++) { if (o == null) { return } o = o[ks[i]] } if (o != null) { o[ks[ks.length - 1]] = val } }

	var overrides = {}
	try { overrides = JSON.parse(global.localStorage.getItem(LS_KEY) || '{}') } catch (e) { overrides = {} }
	var dirty = false

	var panel = null, open = false
	var SLIDERS = []   // { id, path, kind:'config' } kind 仅 config（GS 用按钮即时改，不存 override）

	function sliderRow(id, label, path, v, r) {
		var mn = RANGE[r][0], mx = RANGE[r][1], st = RANGE[r][2]
		return '<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font:600 12px system-ui"><span>' + label + '</span><span id="v_' + id + '">' + v + '</span></div>' +
			'<input type="range" id="s_' + id + '" min="' + mn + '" max="' + mx + '" step="' + st + '" value="' + v + '" style="width:100%"></div>'
	}
	function buildSections() {
		var secs = []
		// —— 怪物 ——
		var h = ''
		for (var t = 0; t < ENEMY_TYPES.length; t++) {
			var type = ENEMY_TYPES[t], cfg = CONFIG.ENEMIES[type]
			for (var s = 0; s < ENEMY_STATS.length; s++) {
				var st = ENEMY_STATS[s]
				var key = (type === 'boss' && st.key === 'hp') ? 'hpTotal' : st.key
				var path = 'ENEMIES.' + type + '.' + key
				if (type === 'boss' && st.key === 'hp') { continue }   // boss HP 用 hpTotal 单独处理
				var v = (path in overrides) ? overrides[path] : getPath(path)
				if (!isNum(v)) { continue }
				var id = SLIDERS.length; SLIDERS.push({ id: id, path: path, kind: 'config' })
				h += sliderRow(id, type + '·' + st.label, path, v, st.rng)
			}
			if (type === 'boss') {   // boss 总血
				var bp = 'ENEMIES.boss.hpTotal', bv = (bp in overrides) ? overrides[bp] : getPath(bp)
				if (isNum(bv)) { var bid = SLIDERS.length; SLIDERS.push({ id: bid, path: bp, kind: 'config' }); h += sliderRow(bid, 'boss·总血', bp, bv, 'bossHpTotal') }
			}
		}
		secs.push({ title: '怪物属性', body: h, open: false })
		// —— 蛇 ——
		var sh = ''
		for (var i = 0; i < SNAKE_SCALAR.length; i++) {
			var f = SNAKE_SCALAR[i], vv = (f.path in overrides) ? overrides[f.path] : getPath(f.path)
			if (!isNum(vv)) { continue }
			var id2 = SLIDERS.length; SLIDERS.push({ id: id2, path: f.path, kind: 'config' })
			sh += sliderRow(id2, f.label, f.path, vv, f.rng)
		}
		// coreHp 用按钮即时改（运行时 GS）
		sh += '<div style="display:flex;gap:6px;margin:8px 0"><button id="gm_hp_add" style="flex:1;padding:8px;border:0;border-radius:6px;background:#2ad4ff;color:#063;font:700 12px system-ui;cursor:pointer">+1 心</button>' +
			'<button id="gm_hp_sub" style="flex:1;padding:8px;border:0;border-radius:6px;background:#ff6a6a;color:#fff;font:700 12px system-ui;cursor:pointer">-1 心</button></div>'
		sh += '<div style="font:600 12px system-ui;opacity:.7">当前心：<span id="gm_hp_val">—</span>（运行时，即时）</div>'
		secs.push({ title: '蛇属性', body: sh, open: false })
		// —— 技能伤害 ——
		var sk = ''
		for (var a = 0; a < SKILL_ARR.length; a++) {
			var arr = SKILL_ARR[a], base = getPath(arr.path)
			if (!Array.isArray(base)) { continue }
			for (var lv = 0; lv < arr.levels; lv++) {
				var p = arr.path + '.' + lv, v = (p in overrides) ? overrides[p] : (base[lv] != null ? base[lv] : 0)
				var id3 = SLIDERS.length; SLIDERS.push({ id: id3, path: p, kind: 'config' })
				sk += sliderRow(id3, arr.label + ' L' + (lv + 1), p, v, arr.rng)
			}
		}
		for (var b = 0; b < SKILL_SCALAR.length; b++) {
			var sf = SKILL_SCALAR[b], v2 = (sf.path in overrides) ? overrides[sf.path] : getPath(sf.path)
			if (!isNum(v2)) { continue }
			var id4 = SLIDERS.length; SLIDERS.push({ id: id4, path: sf.path, kind: 'config' })
			sk += sliderRow(id4, sf.label, sf.path, v2, sf.rng)
		}
		secs.push({ title: '技能伤害', body: sk, open: false })
		// —— 单 combo 激活 ——
		var cb = ''
		var comboKeys = Object.keys(CONFIG.COMBO)
		for (var c = 0; c < comboKeys.length; c++) {
			var cid = comboKeys[c]
			cb += '<button data-combo="' + cid + '" class="gm_combo" style="width:100%;padding:8px;margin:5px 0;border:1px solid #c9a8ff;border-radius:6px;background:transparent;color:#c9a8ff;cursor:pointer;font:700 12px system-ui">激活 Combo：' + cid + '</button>'
		}
		secs.push({ title: '单 Combo 激活（测试）', body: cb, open: false })
		// —— GM 指令 ——
		var gm = ''
		gm += '<div style="display:flex;gap:6px;margin:6px 0"><button id="gm_inv_on" style="flex:1;padding:8px;border:0;border-radius:6px;background:#7CFC00;color:#063;font:700 12px system-ui;cursor:pointer">无限无敌</button>' +
			'<button id="gm_inv_off" style="flex:1;padding:8px;border:0;border-radius:6px;background:#555;color:#fff;font:700 12px system-ui;cursor:pointer">取消无敌</button></div>'
		gm += '<button id="gm_max" style="width:100%;padding:8px;margin:5px 0;border:0;border-radius:6px;background:#ffd166;color:#063;font:700 12px system-ui;cursor:pointer">立即满级（五技能 Lv5 + 检测 Combo）</button>'
		gm += '<button id="gm_clear" style="width:100%;padding:8px;margin:5px 0;border:0;border-radius:6px;background:#ff8c5b;color:#063;font:700 12px system-ui;cursor:pointer">清空敌人（清当前波）</button>'
		gm += '<button id="gm_box" style="width:100%;padding:8px;margin:5px 0;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">显示碰撞盒：关</button>'
		secs.push({ title: 'GM 指令', body: gm, open: true })
		// —— 阶段跳转（测试）：按 STAGE.segments 生成，点击即把 GS.timeSec 写到目标段起点，免手动熬时间 ——
		var jp = '<div style="font:600 11px system-ui;opacity:.7;margin-bottom:4px">点击直接跳到该阶段（写运行时 GS.timeSec，即时生效）</div>'
		var segsCfg = (CONFIG.STAGE && CONFIG.STAGE.segments) ? CONFIG.STAGE.segments : []
		for (var sg = 0; sg < segsCfg.length; sg++) {
			var seC = segsCfg[sg]
			jp += '<button data-stage="' + seC.startSec + '" data-last="' + (sg === segsCfg.length - 1 ? 1 : 0) + '" class="gm_stage" style="width:100%;padding:8px;margin:4px 0;border:1px solid #ffd166;border-radius:6px;background:transparent;color:#ffd166;cursor:pointer;font:700 12px system-ui">跳到 ' + seC.id + '·' + seC.name + '（' + seC.startSec + 's）</button>'
		}
		secs.push({ title: '阶段跳转（测试）', body: jp, open: false })
		// —— 手动输入 ——
		var mi = '<div style="font:600 11px system-ui;opacity:.7;margin-bottom:4px">路径写 config 覆盖（重载生效）或以 GS. 开头即时改运行时</div>' +
			'<input id="mi_path" placeholder="如 SKILL.fire.radius.2 或 GS.coreHp" style="width:100%;padding:6px;margin:4px 0;box-sizing:border-box;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px monospace">' +
			'<input id="mi_val" type="number" placeholder="数值" style="width:100%;padding:6px;margin:4px 0;box-sizing:border-box;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px monospace">' +
			'<button id="mi_apply" style="width:100%;padding:8px;margin-top:4px;border:0;border-radius:6px;background:#2de1a8;color:#063;font:700 12px system-ui;cursor:pointer">应用</button>' +
			'<div id="mi_msg" style="font:600 11px system-ui;opacity:.8;margin-top:6px"></div>'
		secs.push({ title: '手动输入（路径→数值）', body: mi, open: false })
		return secs
	}

	function render() {
		var secs = buildSections()
		var html = '<div style="font:700 16px system-ui;margin-bottom:6px;display:flex;justify-content:space-between"><span>GM 测试面板</span><span style="opacity:.6;font:600 12px system-ui">~ 开关</span></div>'
		html += '<div id="ed_dirty" style="display:' + (dirty ? 'block' : 'none') + ';color:#fd6;margin-bottom:6px;font:600 12px system-ui">有未生效覆盖，保存后重载</div>'
		for (var i = 0; i < secs.length; i++) {
			var sec = secs[i]
			html += '<div style="margin:6px 0;border:1px solid #2a3358;border-radius:8px;overflow:hidden">' +
				'<div class="secH" data-sec="' + i + '" style="padding:8px 10px;background:#161c30;cursor:pointer;font:700 13px system-ui;display:flex;justify-content:space-between;align-items:center">' +
				'<span>' + sec.title + '</span><span class="arr">' + (sec.open ? '▾' : '▸') + '</span></div>' +
				'<div class="secB" data-b="' + i + '" style="padding:6px 10px;display:' + (sec.open ? 'block' : 'none') + '">' + sec.body + '</div></div>'
		}
		html += '<button id="ed_save" style="width:100%;padding:10px;margin-top:8px;border:0;border-radius:8px;background:#2de1a8;color:#063;font:700 14px system-ui;cursor:pointer">保存并重载</button>'
		html += '<button id="ed_copy" style="width:100%;padding:10px;margin-top:8px;border:1px solid #2de1a8;border-radius:8px;background:transparent;color:#2de1a8;cursor:pointer">复制覆盖 JSON</button>'
		html += '<button id="ed_reset" style="width:100%;padding:10px;margin-top:8px;border:0;border-radius:8px;background:#a33;color:#fff;cursor:pointer">清空覆盖并重载</button>'
		panel.innerHTML = html

		// 折叠
		var heads = panel.querySelectorAll('.secH')
		for (var h = 0; h < heads.length; h++) {
			heads[h].onclick = function () {
				var idx = +this.getAttribute('data-sec'), b = panel.querySelector('.secB[data-b="' + idx + '"]'), arr = this.querySelector('.arr')
				var show = b.style.display === 'none'
				b.style.display = show ? 'block' : 'none'
				arr.textContent = show ? '▾' : '▸'
			}
		}
		// 滑块
		for (var k = 0; k < SLIDERS.length; k++) {
			var sd = SLIDERS[k], inp = panel.querySelector('#s_' + sd.id)
			if (!inp) { continue }
			inp.oninput = function () {
				var s = SLIDERS[+this.id.split('_')[1]], val = parseFloat(this.value)
				overrides[s.path] = val; dirty = true
				var vl = document.getElementById('v_' + s.id); if (vl) { vl.textContent = val }
				var ban = document.getElementById('ed_dirty'); if (ban) { ban.style.display = 'block' }
			}
		}
		// 单 combo
		var cb = panel.querySelectorAll('.gm_combo')
		for (var c = 0; c < cb.length; c++) {
			cb[c].onclick = function () {
				if (GS.status !== 'playing') { Log.warn('请先进入游戏再激活 Combo'); return }
				Registry.get('skill').debugActivateCombo(this.getAttribute('data-combo'))
			}
		}
		// GM 指令
		panel.querySelector('#gm_hp_add').onclick = function () { GS.coreHp = Math.min(99, (GS.coreHp | 0) + 1); relHp() }
		panel.querySelector('#gm_hp_sub').onclick = function () { GS.coreHp = Math.max(0, (GS.coreHp | 0) - 1); relHp() }
		panel.querySelector('#gm_inv_on').onclick = function () { GS.invincibleUntil = 1e9; Log.info('[GM] 无限无敌 开') }
		panel.querySelector('#gm_inv_off').onclick = function () { GS.invincibleUntil = 0; Log.info('[GM] 无限无敌 关') }
		panel.querySelector('#gm_max').onclick = function () {
			if (GS.status !== 'playing') { Log.warn('请先进入游戏再满级'); return }
			Registry.get('skill').debugMaxAll()
		}
		panel.querySelector('#gm_clear').onclick = function () {
			if (GS.status !== 'playing') { Log.warn('请先进入游戏再清敌'); return }
			var En = Registry.get('enemy'); if (En && En.list) { for (var i = En.list.length - 1; i >= 0; i--) { En.list[i].active = false } }
			Log.info('[GM] 已清空敌人')
		}
		panel.querySelector('#gm_box').onclick = function () {
			global.GMDBG = global.GMDBG || {}; global.GMDBG.showHitboxes = !global.GMDBG.showHitboxes
			this.textContent = '显示碰撞盒：' + (global.GMDBG.showHitboxes ? '开' : '关')
			this.style.color = global.GMDBG.showHitboxes ? '#7CFC00' : '#2ad4ff'
			this.style.borderColor = global.GMDBG.showHitboxes ? '#7CFC00' : '#2ad4ff'
		}
		// 阶段跳转：写 GS.timeSec 到目标段起点；末段(Boss)额外 +bossWarnLeadSec 让 Boss 立即生成
		var stg = panel.querySelectorAll('.gm_stage')
		for (var si = 0; si < stg.length; si++) {
			stg[si].onclick = function () {
				if (GS.status !== 'playing') { Log.warn('请先进入游戏再跳阶段'); return }
				var t = parseFloat(this.getAttribute('data-stage'))
				if (this.getAttribute('data-last') === '1') { var lead = (CONFIG.STAGE && CONFIG.STAGE.bossWarnLeadSec) || 0; t += lead + 0.2 }   // 末段：越过预警提前量，触发 Boss 生成
				GS.timeSec = t
				Log.info('[GM] 阶段跳转 → timeSec=' + t.toFixed(1) + 's')
			}
		}
		// 手动输入
		panel.querySelector('#mi_apply').onclick = function () {
			var p = panel.querySelector('#mi_path').value.trim(), msg = panel.querySelector('#mi_msg')
			var raw = panel.querySelector('#mi_val').value, val = parseFloat(raw)
			if (!p || raw === '' || isNaN(val)) { msg.textContent = '路径/数值无效'; msg.style.color = '#ff6b6b'; return }
			if (p.indexOf('GS.') === 0) {
				setPath(GS, p.slice(3), val); msg.textContent = '已即时写入 ' + p; msg.style.color = '#7CFC00'
			} else {
				overrides[p] = val; dirty = true; msg.textContent = '已加入覆盖（保存后重载生效）'; msg.style.color = '#fd6'
			}
		}
		// 保存/复制/重置
		panel.querySelector('#ed_save').onclick = function () { global.localStorage.setItem(LS_KEY, JSON.stringify(overrides)); global.location.reload() }
		panel.querySelector('#ed_copy').onclick = function () { var s = JSON.stringify(overrides, null, 2); try { global.navigator.clipboard.writeText(s) } catch (e) {} Log.info('覆盖JSON: ' + s) }
		panel.querySelector('#ed_reset').onclick = function () { global.localStorage.removeItem(LS_KEY); global.location.reload() }
		relHp()
	}
	function relHp() { var el = panel && panel.querySelector('#gm_hp_val'); if (el) { el.textContent = (GS.coreHp | 0) } }

	function toggle() { open = !open; panel.style.display = open ? 'block' : 'none'; if (open) { dirty = false; SLIDERS = []; render() } }

	document.addEventListener('keydown', function (e) { if (e.key === '`' || e.key === '~') { if (!panel) { build() } toggle() } })

	function build() {
		panel = document.createElement('div')
		panel.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:320px;display:none;overflow:auto;background:rgba(6,8,16,0.96);color:#fff;font:13px system-ui;padding:14px;z-index:40;box-shadow:-4px 0 18px #000'
		document.body.appendChild(panel)
		render()
	}

	var Editor = { init: function () { if (!panel) { build() } }, overrides: function () { return overrides }, LS_KEY: LS_KEY }
	Registry.register('editor', Editor)
	Log.info('editor 就绪：~ 键开关 GM 测试面板（config 滑块保存后重载生效，GM 指令即时）')

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2026-07-12 · B-GM · editor 升级为分类 GM 测试面板 · 重写 13_editor.js：怪物/蛇/技能伤害分类 slider（沿 override+重载机制，路径自动生成，boss.hpTotal 单独处理）+ 单 Combo 激活按钮（debugActivateCombo）+ GM 指令（无限无敌/满级/清敌/碰撞盒）+ coreHp ±1 按钮 + 手动路径输入（GS. 即时 / config 重载）；08_skill.js 暴露 debugActivateCombo/debugMaxAll · 不动 §9 / core / collision
// 2025-07-10 · editor 解锁 Combo 测试按钮 · 调参面板新增「🔓 解锁全部 Combo（测试）」按钮（set fire/ice/bolt/lightning + pick→checkCombos） · 不动 §9
