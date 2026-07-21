;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Log = global.Log, Core = global.Core, M = Core.M
	var LS_KEY = 'snake55_tuning'

	// —— UI 滑块范围常量（集中，避免逻辑里散落魔法数字；dev 工具边界，非 gameplay 数值）——
	var RANGE = {
		snakeSpeed: [80, 400, 5], turnRate: [60, 360, 5], maxSegments: [5, 60, 1],
		bodyContactDps: [0, 40, 1], critRate: [0, 1, 0.01], foodCap: [1, 20, 1],
		enemyHp: [1, 400, 1], enemySpeed: [20, 300, 5], enemyAtk: [1, 10, 1], enemyRadius: [6, 60, 1],
		bossHpTotal: [1000, 40000, 500],
		fireDot: [0, 60, 1], boltDmg: [0, 80, 1], lightningDmg: [0, 80, 1], shieldDmg: [0, 60, 1],
		fireRadius: [20, 220, 2], icePoolR: [10, 120, 2], iceSeek: [50, 400, 5], iceFreezeCd: [0.5, 10, 0.25], icePoolLinger: [1, 12, 0.25], shieldOrbit: [20, 160, 2], iceSlow: [0, 1, 0.05],   // ⑥ 标定：冰池半径(px)/索敌射程(px)/冰冻CD(s)/冰池滞留(s) + 冰冻减速%
		comboMul: [0, 10, 0.1], burnDps: [0, 40, 1], comboRadius: [20, 200, 5], steamCap: [1, 24, 1], maxBackW: [1000, 2400, 50], worldScale: [0.6, 1.0, 0.05]   // b9-diag：蒸汽齐爆同帧上限滑条范围 + 画布上限W(render RT 桥，纯渲染表现) + 视图缩放(纯视觉,0.6–1.0 默认0.8)
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
		{ path: 'SKILL.bolt.damage', label: '飞镖伤害', rng: 'boltDmg', levels: 5 },
		{ path: 'SKILL.lightning.damage', label: '闪电伤害', rng: 'lightningDmg', levels: 5 },
		{ path: 'SKILL.shield.contactDamage', label: '护盾接触', rng: 'shieldDmg', levels: 5 }
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

	var panel = null, open = false, tuneTimer = null   // tuneTimer：面板打开时定时刷新等级显示（dev 实时）
	var diagWhiteOn = false, diagShakeOn = false, diagFireOn = false, diagIceFillOn = false, diagHudOn = false   // b9-diag：T1 关白爆 / T2 关屏震 / T3 关火焰系视觉 / T4 冰池只描边 / 性能HUD 开关态
	var SLIDERS = []   // { id, path, kind:'config' } kind 仅 config（GS 用按钮即时改，不存 override）
	// —— 实时标定（dev）：运行时覆盖层，拖动即时生效、免重载；不持久、不写 config 默认 ——
	var TUNING_ARR = [
		{ path: 'SKILL.fire.radius', label: '火焰半径', rng: 'fireRadius', levels: 5 },
		{ path: 'SKILL.ice.poolRadius', label: '冰池半径', rng: 'icePoolR', levels: 5 },
		{ path: 'SKILL.shield.orbitRadius', label: '护盾环半径', rng: 'shieldOrbit', levels: 5 },
		{ path: 'SKILL.ice.slowPct', label: '冰冻减速%', rng: 'iceSlow', levels: 5 },
		{ path: 'SKILL.ice.seekRange', label: '索敌射程', rng: 'iceSeek', levels: 5 },
		{ path: 'SKILL.ice.poolLingerSec', label: '冰池滞留s', rng: 'icePoolLinger', levels: 5 }   // ⑥ 系统性调整：poolLingerSec 改 5 级数组→并入按级标定（命 RT('…poolLingerSec.'+i)），移出 TUNING_SCALAR 标量
	]
	var rtTuning = {}
	function rtGet(path) { return rtTuning.hasOwnProperty(path) ? rtTuning[path] : undefined }
	function rtSet(path, val) { if (val == null) { delete rtTuning[path] } else { rtTuning[path] = val } }
	function rtResetGroup() { for (var k = 0; k < TUNING_ARR.length; k++) { var a = TUNING_ARR[k], base = getPath(a.path); if (Array.isArray(base)) { for (var lv = 0; lv < a.levels; lv++) { delete rtTuning[a.path + '.' + lv] } } } for (var ks = 0; ks < TUNING_SCALAR.length; ks++) { delete rtTuning[TUNING_SCALAR[ks].path] } }   // 同时清冰系标量（减速跟随窗）运行时覆盖
	Bus.on('perf:tier', function () { var el = panel && panel.querySelector('#perf_cur'); if (el && global.PerfTier) { el.textContent = global.PerfTier.tier + (global.PerfTier.auto ? '（自动）' : '（固定）') } })   // 自适应分级：档位变化即时刷新 GM 面板读数
	var TUNING_SLIDERS = []
	// 实时标定·标量（运行时 rtSet，免重载；与 SKILL_SCALAR 区分：后者写 config override 持久化需重载）
	var TUNING_SCALAR = [
		{ path: 'RENDER.maxBackW', label: '渲染分辨率上限W', rng: 'maxBackW', def: 1600, dec: 0 },   // 实时标定：拖动即改 backing 宽上限（RT 桥），触发 render.resize 重算画布；默认 1600 降填充成本治卡顿；注：只控渲染分辨率/填充率，不改实体尺寸
		{ path: 'RENDER.worldScale', label: '视图缩放(纯视觉)', rng: 'worldScale', def: 0.8, dec: 2 },   // 视图缩放：默认0.8 还原「更小更精致」蛇/怪画面；0.6–1.0 实时可调；纯渲染缩放，碰撞/世界坐标不变
		{ path: 'SKILL.ice.freezeCd', label: '冰冻CD s', rng: 'iceFreezeCd' },
		{ path: 'PERF.steamBurstCapPerFrame', label: '蒸汽齐爆上限/帧', rng: 'steamCap' }   // b9-diag：蒸汽齐爆同帧 VFX 上限，运行时热调（08_skill RT 读）
	]
	var TUNING_SCALAR_SLIDERS = []

	function sliderRow(id, label, path, v, r) {
		var mn = RANGE[r][0], mx = RANGE[r][1], st = RANGE[r][2]
		return '<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font:600 12px system-ui"><span>' + label + '</span><span id="v_' + id + '">' + v + '</span></div>' +
			'<input type="range" id="s_' + id + '" min="' + mn + '" max="' + mx + '" step="' + st + '" value="' + v + '" style="width:100%"></div>'
	}
	function tuningRow(id, label, v, def, r, pref) {   // 实时标定行：显示「当前 / 默认」防丢基准；pref 控制 id 前缀（per-level=ts / 标量=sc）避免与 config 滑条及彼此撞车
		pref = pref || 'ts'
		var mn = RANGE[r][0], mx = RANGE[r][1], st = RANGE[r][2]
		return '<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font:600 12px system-ui"><span>' + label + '</span><span id="' + pref + 'v_' + id + '">' + v + ' <span style="opacity:.5;font-weight:400">/ 默认 ' + def + '</span></span></div>' +
			'<input type="range" id="' + pref + '_' + id + '" min="' + mn + '" max="' + mx + '" step="' + st + '" value="' + v + '" style="width:100%"></div>'
	}
	function fmtTune(path, val, dec) { if (path.indexOf('slowPct') >= 0) { return Number(val).toFixed(2) } if (dec) { return Number(val).toFixed(dec) } return String(Math.round(val)) }   // 减速% 2 位小数；有 dec 按位小数（相机缩放 0.6–1.0 显示 2 位，否则被 Math.round 全显成 1）；其余半径/宽度取整
	function refreshTuneLevels() {   // 实时等级显示 + 高亮当前等级对应的标定滑条行（dev 辅助，便于知道该拖哪一级）
		if (!panel) { return }
		var el = panel.querySelector('#tune_levels'); if (el) {
			var list = CONFIG.SKILL.list, parts = []
			for (var n = 0; n < list.length; n++) {
				var id = list[n], lv = (GS.ownedSkills && GS.ownedSkills[id]) || 0
				parts.push(lv > 0 ? (id + ' Lv' + lv) : (id + ' 未解锁'))
			}
			el.textContent = '当前等级：' + parts.join('　')
		}
		var rows = panel.querySelectorAll('[data-skill]')
		for (var m = 0; m < rows.length; m++) {
			var sk = rows[m].getAttribute('data-skill'), lv2 = parseInt(rows[m].getAttribute('data-lv'), 10)
			var active = (GS.ownedSkills && GS.ownedSkills[sk]) || 0
			var on = (active === lv2)
			rows[m].style.background = on ? 'rgba(45,225,168,0.18)' : 'transparent'
			rows[m].style.boxShadow = on ? 'inset 0 0 0 1px #2de1a8' : 'none'
		}
	}
	function buildSections() {
		SLIDERS.length = 0; TUNING_SLIDERS.length = 0   // 每次重建清空，render() 可重入（复位/沙盒刷新面板）
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
		// —— 单 Combo 视觉预览（脱离实战，dev-only）：直接 Bus.emit 对应 fx: 事件 + 蛇头附近 spawn dummy 供链/镖瞄准 ——
		var pv = ''
		for (var pc = 0; pc < comboKeys.length; pc++) {
			var pvc = comboKeys[pc]
			pv += '<button data-preview="' + pvc + '" class="gm_preview" style="width:100%;padding:8px;margin:5px 0;border:1px solid #ff8c5b;border-radius:6px;background:transparent;color:#ff8c5b;cursor:pointer;font:700 12px system-ui">预览 VFX：' + pvc + '</button>'
		}
		secs.push({ title: '单 Combo 视觉预览（脱离实战）', body: pv, open: false })
		// —— GM 指令 ——
		var gm = ''
		gm += '<div style="display:flex;gap:6px;margin:6px 0"><button id="gm_inv_on" style="flex:1;padding:8px;border:0;border-radius:6px;background:#7CFC00;color:#063;font:700 12px system-ui;cursor:pointer">无限无敌</button>' +
			'<button id="gm_inv_off" style="flex:1;padding:8px;border:0;border-radius:6px;background:#555;color:#fff;font:700 12px system-ui;cursor:pointer">取消无敌</button></div>'
		gm += '<button id="gm_max" style="width:100%;padding:8px;margin:5px 0;border:0;border-radius:6px;background:#ffd166;color:#063;font:700 12px system-ui;cursor:pointer">立即满级（五技能 Lv5 + 检测 Combo）</button>'
		gm += '<button id="gm_clear" style="width:100%;padding:8px;margin:5px 0;border:0;border-radius:6px;background:#ff8c5b;color:#063;font:700 12px system-ui;cursor:pointer">清空敌人（清当前波）</button>'
		gm += '<button id="gm_box" style="width:100%;padding:8px;margin:5px 0;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">显示碰撞盒：关</button>'
		// 单技能精确激活（GM 指令区也放一份，方便测试；清空其余；B-2 修复：此前用户反馈 GM 找不到此功能）
		gm += '<div style="font:600 11px system-ui;opacity:.7;margin:8px 0 2px">单技能激活（清空其余）</div>'
		gm += '<div style="display:flex;gap:6px;margin:4px 0"><select id="gm_skill" style="flex:1;padding:6px;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px system-ui">'
		for (var gsk = 0; gsk < CONFIG.SKILL.list.length; gsk++) { gm += '<option value="' + CONFIG.SKILL.list[gsk] + '">' + CONFIG.SKILL.list[gsk] + '</option>' }
		gm += '</select><input id="gm_lvl" type="number" min="1" max="5" value="1" style="width:54px;padding:6px;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px system-ui"></div>'
		gm += '<button id="gm_skill_go" style="width:100%;padding:8px;margin:4px 0;border:0;border-radius:6px;background:#c9a8ff;color:#063;font:700 12px system-ui;cursor:pointer">仅激活此技能</button>'
		// 训练假人（超高血·不秒·站着），接 spawnDummy(count,hp)，默认 1/5000；B-GM 补回：此前只在「标定/Tuning」，现移入 GM 指令区可见位置
		gm += '<div style="font:600 11px system-ui;opacity:.7;margin:8px 0 2px">训练假人（默认 1 · 5000 血）</div>'
		gm += '<div style="display:flex;gap:6px;margin:4px 0"><input id="gm_dummy_n" type="number" min="1" max="50" value="1" title="数量" style="width:56px;padding:6px;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px system-ui"><input id="gm_dummy_hp" type="number" min="100" max="1000000" value="5000" title="血量" style="flex:1;padding:6px;border-radius:6px;border:1px solid #2a3358;background:#0d0f1a;color:#fff;font:12px system-ui"></div>'
		gm += '<button id="gm_dummy" style="width:100%;padding:8px;margin:4px 0;border:0;border-radius:6px;background:#ffd166;color:#063;font:700 12px system-ui;cursor:pointer">生成假人</button>'
		// 冰系手感（冰区滞留 / 减速跟随窗）已统一收口到「实时标定（手感沙盒）」，GM 指令只保留即时动作指令，避免重复控制、归类更清晰
		gm += '<div style="font:600 11px system-ui;opacity:.55;margin:6px 0 2px;border-top:1px dashed #2a3358;padding-top:6px">冰系手感滑条见「实时标定（手感沙盒）」</div>'
		secs.push({ title: 'GM 指令', body: gm, open: false })
		// —— 性能自适应（跨端 FPS 根治）：自动档位开关 + 强制固定档位（GM 调试；运行时即时）——
		var pa = '<div style="font:600 11px system-ui;opacity:.7;margin-bottom:4px">自动档位（按实时 FPS 升降，保可玩）：</div>'
		pa += '<div style="display:flex;gap:6px;margin:4px 0"><button id="perf_auto_on" style="flex:1;padding:8px;border:1px solid #7CFC00;border-radius:6px;background:transparent;color:#7CFC00;cursor:pointer;font:700 12px system-ui">自动：开</button>'
		pa += '<button id="perf_auto_off" style="flex:1;padding:8px;border:1px solid #ff6a6a;border-radius:6px;background:transparent;color:#ff6a6a;cursor:pointer;font:700 12px system-ui">自动：关</button></div>'
		pa += '<div style="font:600 11px system-ui;opacity:.7;margin:6px 0 2px">强制固定档位（关自动后生效）：</div>'
		pa += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0">'
		pa += '<button id="perf_h" style="flex:1;padding:8px;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">HIGH</button>'
		pa += '<button id="perf_m" style="flex:1;padding:8px;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">MED</button>'
		pa += '<button id="perf_l" style="flex:1;padding:8px;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">LOW</button>'
		pa += '<button id="perf_p" style="flex:1;padding:8px;border:1px solid #2ad4ff;border-radius:6px;background:transparent;color:#2ad4ff;cursor:pointer;font:700 12px system-ui">POTATO</button></div>'
		pa += '<div style="font:600 11px system-ui;opacity:.7;margin-top:4px">当前：<span id="perf_cur">—</span></div>'
		secs.push({ title: '性能自适应（跨端 FPS）', body: pa, open: false })
		// —— 性能诊断（b9 对照实验）：关白爆/关屏震 + 蒸汽上限（运行时即时，零 gameplay）——
		var diag = '<div style="font:600 11px system-ui;opacity:.7;margin-bottom:4px">对照实验开关（运行时即时，零 gameplay）：分离火焰掉帧主因</div>'
		diag += '<div style="display:flex;gap:6px;margin:4px 0"><button id="diag_t1" style="flex:1;padding:8px;border:1px solid #ff6a6a;border-radius:6px;background:transparent;color:#ff6a6a;cursor:pointer;font:700 12px system-ui">T1 关白爆overlay：关</button>'
		diag += '<button id="diag_t2" style="flex:1;padding:8px;border:1px solid #c9a8ff;border-radius:6px;background:transparent;color:#c9a8ff;cursor:pointer;font:700 12px system-ui">T2 关屏震：关</button></div>'
		diag += '<div style="display:flex;gap:6px;margin:4px 0"><button id="diag_t3" style="flex:1;padding:8px;border:1px solid #ff9a3c;border-radius:6px;background:transparent;color:#ff9a3c;cursor:pointer;font:700 12px system-ui">T3 关火焰系视觉：关</button>'
		diag += '<button id="diag_t4" style="flex:1;padding:8px;border:1px solid #5fd0ff;border-radius:6px;background:transparent;color:#5fd0ff;cursor:pointer;font:700 12px system-ui">T4 冰池只描边：关</button></div>'
		diag += '<div style="display:flex;gap:6px;margin:4px 0"><button id="diag_hud" style="flex:1;padding:8px;border:1px solid #7CFC00;border-radius:6px;background:transparent;color:#7CFC00;cursor:pointer;font:700 12px system-ui">性能HUD：关</button></div>'
		diag += '<div style="font:600 11px system-ui;opacity:.7;margin:6px 0 0">T3 关「火焰系 per-enemy 视觉」（点火演出+火焰光环+蓝环），与 T1/T2 配合一次录屏 isolate 全部嫌疑。蒸汽齐爆上限/帧 滑条见「实时标定（手感沙盒）」底部；拉到 <b>1</b> = 白爆骤减</div>'
		secs.push({ title: '性能诊断（b9 对照实验）', body: diag, open: true })
		// —— 阶段跳转（测试）：按 STAGE.segments 生成，点击即把 GS.timeSec 写到目标段起点，免手动熬时间 ——
		var jp = '<div style="font:600 11px system-ui;opacity:.7;margin-bottom:4px">点击直接跳到该阶段（写运行时 GS.timeSec，即时生效）</div>'
		var segsCfg = (CONFIG.STAGE && CONFIG.STAGE.segments) ? CONFIG.STAGE.segments : []
		for (var sg = 0; sg < segsCfg.length; sg++) {
			var seC = segsCfg[sg]
			jp += '<button data-stage="' + seC.startSec + '" data-last="' + (sg === segsCfg.length - 1 ? 1 : 0) + '" class="gm_stage" style="width:100%;padding:8px;margin:4px 0;border:1px solid #ffd166;border-radius:6px;background:transparent;color:#ffd166;cursor:pointer;font:700 12px system-ui">跳到 ' + seC.id + '·' + seC.name + '（' + seC.startSec + 's）</button>'
		}
		secs.push({ title: '阶段跳转（测试）', body: jp, open: false })
		// —— 实时标定（手感沙盒）：运行时即时滑条，免重载，仅当前会话（不写 config 默认）——
		var tb = '<div id="tune_levels" style="font:700 12px system-ui;margin:4px 0 10px;padding:6px 8px;border:1px solid #2de1a8;border-radius:6px;background:rgba(45,225,168,0.08);line-height:1.5">当前等级：加载中…</div>'
		tb += '<div style="font:700 11px system-ui;opacity:.85;margin:2px 0 2px;color:#2ad4ff">技能几何 / 手感（逐等级）</div>'
		for (var ta = 0; ta < TUNING_ARR.length; ta++) {
			var tarr = TUNING_ARR[ta], tbase = getPath(tarr.path)
			if (!Array.isArray(tbase)) { continue }
			for (var tlv = 0; tlv < tarr.levels; tlv++) {
				var tpath = tarr.path + '.' + tlv
				var tdef = (tbase[tlv] != null) ? tbase[tlv] : 0
			var tcur = (rtGet(tpath) !== undefined) ? rtGet(tpath) : tdef
			var tid = TUNING_SLIDERS.length; TUNING_SLIDERS.push({ id: tid, path: tpath, def: tdef })
			var skName = tarr.path.split('.')[1]   // 'SKILL.fire.radius' → 'fire'
			tb += '<div id="trow_' + tid + '" data-skill="' + skName + '" data-lv="' + (tlv + 1) + '" style="margin:2px 0;padding:3px 4px;border-radius:6px">' + tuningRow(tid, tarr.label + ' L' + (tlv + 1), fmtTune(tpath, tcur), tdef, tarr.rng, 'ts') + '</div>'
			}
		}
		// ❄ 冰系手感·标量（运行时 rtSet）：减速跟随窗（离开冰区后减速残留时长）；与「技能数值」持久版 slowLingerSec 区分——此处为运行时即时
		tb += '<div style="font:700 11px system-ui;opacity:.85;margin:10px 0 2px;color:#2ad4ff">❄ 冰系手感（标量 · 运行时）</div>'
		for (var tsa = 0; tsa < TUNING_SCALAR.length; tsa++) {
		var tsar = TUNING_SCALAR[tsa], tsbase = getPath(tsar.path)
		var tsdef = (tsar.def !== undefined) ? tsar.def : (isNum(tsbase) ? tsbase : 0)   // 优先用条目自带 def，再回退 getPath
		var tscur = (rtGet(tsar.path) !== undefined) ? rtGet(tsar.path) : tsdef
		var tsid = TUNING_SCALAR_SLIDERS.length; TUNING_SCALAR_SLIDERS.push({ id: tsid, path: tsar.path, def: tsdef, dec: tsar.dec })
		tb += '<div style="margin:2px 0">' + tuningRow(tsid, tsar.label, fmtTune(tsar.path, tscur, tsar.dec), tsdef, tsar.rng, 'sc') + '</div>'
		}
		tb += '<button id="tune_reset" style="width:100%;padding:8px;margin:6px 0;border:1px solid #2de1a8;border-radius:6px;background:transparent;color:#2de1a8;cursor:pointer;font:700 12px system-ui">复位本组默认</button>'
		tb += '<div style="margin-top:8px;border-top:1px solid #2a3358;padding-top:8px">'
		tb += '<button id="tune_sandbox" style="width:100%;padding:8px;margin:4px 0;border:1px solid #ff8c5b;border-radius:6px;background:transparent;color:#ff8c5b;cursor:pointer;font:700 12px system-ui">标定沙盒：关</button>'
		tb += '<div style="font:600 11px system-ui;opacity:.7;margin:6px 0 0">提示：单技能激活 / 生成假人 见「GM 指令」</div>'
		tb += '</div>'
		secs.push({ title: '实时标定（手感沙盒）', body: tb, open: true })
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
		// 实时标定滑条（拖动即时生效，免重载；不写 persistent override）；独立前缀 ts_/tv_ 避免与 config 滑条 id 撞车
		for (var tk = 0; tk < TUNING_SLIDERS.length; tk++) {
			var td = TUNING_SLIDERS[tk], tinp = panel.querySelector('#ts_' + td.id)
			if (!tinp) { continue }
			tinp.oninput = function () {
				var t = TUNING_SLIDERS[+this.id.split('_')[1]], val = parseFloat(this.value)
				if (!t) { return }
				rtSet(t.path, val)   // 写进 rtTuning 运行时层 → 08_skill RT() 即时生效到画面几何
				var tvl = document.getElementById('tsv_' + t.id)
				if (tvl) { tvl.innerHTML = fmtTune(t.path, val) + ' <span style="opacity:.5;font-weight:400">/ 默认 ' + t.def + '</span>' }   // 同步刷新当前值读数（B-3 修复：前缀 ts/sc 区分，读 rtTuning 回显而非写死默认）
			}
		}
		// 实时标定·标量（运行时 rtSet）：减速跟随窗等；独立前缀 sc_/scv_ 与逐等级 ts_ 区分
		for (var tsk2 = 0; tsk2 < TUNING_SCALAR_SLIDERS.length; tsk2++) {
			var tsd = TUNING_SCALAR_SLIDERS[tsk2], tsinp = panel.querySelector('#sc_' + tsd.id)
			if (!tsinp) { continue }
			tsinp.oninput = function () {
				var t = TUNING_SCALAR_SLIDERS[+this.id.split('_')[1]], val = parseFloat(this.value)
				if (!t) { return }
			rtSet(t.path, val)   // 写进 rtTuning 运行时层 → 08_skill RT() 即时生效
			if (t.path === 'RENDER.maxBackW') { var rr = Registry.get('render'); if (rr && rr.resize) { rr.resize() } }   // 改 backing 上限需重算画布尺寸才生效
		var tvl = document.getElementById('scv_' + t.id)
			if (tvl) { tvl.innerHTML = fmtTune(t.path, val, t.dec) + ' <span style="opacity:.5;font-weight:400">/ 默认 ' + t.def + '</span>' }
			}
		}
		panel.querySelector('#tune_reset').onclick = function () { rtResetGroup(); render() }   // 复位本组：仅清实时覆盖，不动其他 override
		panel.querySelector('#tune_sandbox').onclick = function () {
			GS.tuningSandbox = !GS.tuningSandbox
			this.textContent = '标定沙盒：' + (GS.tuningSandbox ? '开' : '关')
			this.style.color = GS.tuningSandbox ? '#7CFC00' : '#ff8c5b'
			this.style.borderColor = GS.tuningSandbox ? '#7CFC00' : '#ff8c5b'
			Log.info('[GM] 标定沙盒 ' + (GS.tuningSandbox ? '开（停掉落）' : '关'))
		}
		// 实时标定沙盒内不再重复放置「单技能激活 / 生成假人」按钮（已统一到 GM 指令区，避免重复入口）；原 handler 随元素移除一并删除
		// 单 combo
		var cb = panel.querySelectorAll('.gm_combo')
		for (var c = 0; c < cb.length; c++) {
			cb[c].onclick = function () {
				if (GS.status !== 'playing') { Log.warn('请先进入游戏再激活 Combo'); return }
				Registry.get('skill').debugActivateCombo(this.getAttribute('data-combo'))
			}
		}
		// 单 combo VFX 预览（脱离实战：无需敌人/冷却，直接发 fx: 事件 + 蛇头附近 spawn dummy）
		var pvBtns = panel.querySelectorAll('.gm_preview')
		for (var pc = 0; pc < pvBtns.length; pc++) {
			pvBtns[pc].onclick = function () { previewCombo(this.getAttribute('data-preview')) }
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
		// B-2 修复：GM 指令区单技能激活（与 标定/Tuning 同源，清空其余）
		panel.querySelector('#gm_skill_go').onclick = function () {
			if (GS.status !== 'playing') { Log.warn('请先进入游戏再激活技能'); return }
			var id = panel.querySelector('#gm_skill').value, lv = parseInt(panel.querySelector('#gm_lvl').value, 10) || 1
			Registry.get('skill').debugSetSkill(id, lv)
		}
		// B-GM 补回：GM 指令区「生成假人」接线（与 标定/Tuning 同源，调用 spawnDummy）
		panel.querySelector('#gm_dummy').onclick = function () {
			if (GS.status !== 'playing') { Log.warn('请先进入游戏再生成假人'); return }
			var n = parseInt(panel.querySelector('#gm_dummy_n').value, 10) || 1, hp = parseInt(panel.querySelector('#gm_dummy_hp').value, 10) || 5000
			Registry.get('enemy').spawnDummy(n, hp)
		}
		// 冰系手感（冰区滞留 / 减速跟随窗）已统一收口到「实时标定（手感沙盒）」运行时滑条，GM 指令不再重复放置；原 handler 随元素移除一并删除
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
		// b9-diag：T1/T2 对照实验开关（rtSet 即时，零 gameplay）
		var t1 = panel.querySelector('#diag_t1'), t2 = panel.querySelector('#diag_t2')
		if (t1) { t1.onclick = function () { diagWhiteOn = !diagWhiteOn; Editor.rtSet('PERF.suppressWhiteBurst', diagWhiteOn ? 1 : 0); this.textContent = 'T1 关白爆overlay：' + (diagWhiteOn ? '开' : '关'); this.style.color = diagWhiteOn ? '#7CFC00' : '#ff6a6a'; this.style.borderColor = diagWhiteOn ? '#7CFC00' : '#ff6a6a' } }
		if (t2) { t2.onclick = function () { diagShakeOn = !diagShakeOn; Editor.rtSet('PERF.suppressShake', diagShakeOn ? 1 : 0); this.textContent = 'T2 关屏震：' + (diagShakeOn ? '开' : '关'); this.style.color = diagShakeOn ? '#7CFC00' : '#c9a8ff'; this.style.borderColor = diagShakeOn ? '#7CFC00' : '#c9a8ff' } }
		var t3 = panel.querySelector('#diag_t3')
		if (t3) { t3.onclick = function () { diagFireOn = !diagFireOn; Editor.rtSet('PERF.suppressFireVisual', diagFireOn ? 1 : 0); this.textContent = 'T3 关火焰系视觉：' + (diagFireOn ? '开' : '关'); this.style.color = diagFireOn ? '#7CFC00' : '#ff9a3c'; this.style.borderColor = diagFireOn ? '#7CFC00' : '#ff9a3c' } }
	var t4 = panel.querySelector('#diag_t4')
	if (t4) { t4.onclick = function () { diagIceFillOn = !diagIceFillOn; Editor.rtSet('PERF.suppressIceFill', diagIceFillOn ? 1 : 0); this.textContent = 'T4 冰池只描边：' + (diagIceFillOn ? '开' : '关'); this.style.color = diagIceFillOn ? '#7CFC00' : '#5fd0ff'; this.style.borderColor = diagIceFillOn ? '#7CFC00' : '#5fd0ff' } }   // b9-measure T4：冰池只描边不填充（零 gameplay）
		var dh = panel.querySelector('#diag_hud')
		if (dh) { dh.onclick = function () { diagHudOn = !diagHudOn; Editor.rtSet('PERF.debugHud', diagHudOn ? 1 : 0); this.textContent = '性能HUD：' + (diagHudOn ? '开' : '关') } }   // b9-diag：默认关，开=显示 FPS/粒子/数组计数/T1-T4 开关态 HUD（零 gameplay，美术复查用）
		// 性能自适应：自动开关 + 强制固定档位（运行时即时，零 gameplay）
		function updPerfCur() { var el = panel && panel.querySelector('#perf_cur'); if (el && global.PerfTier) { el.textContent = global.PerfTier.tier + (global.PerfTier.auto ? '（自动）' : '（固定）') } }
		if (panel.querySelector('#perf_auto_on')) { panel.querySelector('#perf_auto_on').onclick = function () { if (global.PerfTier) { global.PerfTier.setAuto(true); updPerfCur() } } }
		if (panel.querySelector('#perf_auto_off')) { panel.querySelector('#perf_auto_off').onclick = function () { if (global.PerfTier) { global.PerfTier.setAuto(false); updPerfCur() } } }
		var perfForce = function (n) { if (global.PerfTier) { global.PerfTier.forceTier(n); updPerfCur() } }
		if (panel.querySelector('#perf_h')) { panel.querySelector('#perf_h').onclick = function () { perfForce('HIGH') } }
		if (panel.querySelector('#perf_m')) { panel.querySelector('#perf_m').onclick = function () { perfForce('MED') } }
		if (panel.querySelector('#perf_l')) { panel.querySelector('#perf_l').onclick = function () { perfForce('LOW') } }
		if (panel.querySelector('#perf_p')) { panel.querySelector('#perf_p').onclick = function () { perfForce('POTATO') } }
		updPerfCur()
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
		refreshTuneLevels()   // 标定面板渲染后即时刷新等级文字 + 高亮当前等级行
	}
	function relHp() { var el = panel && panel.querySelector('#gm_hp_val'); if (el) { el.textContent = (GS.coreHp | 0) } }
	// B-4：单 combo VFX 预览（dev-only，脱离实战）。直接合成 payload 发 fx: 事件，并在蛇头附近 spawn dummy 供链/镖瞄准，完全绕过 gameplay/冷却/敌人条件。
	function spawnDummiesNearHead(count) {
		var En = Registry.get('enemy'); if (!En || !En.spawnDummy) { return [] }
		En.spawnDummy(count, 5000)
		var s = Registry.get('snake'), h = (s && s.head) ? s.head : { x: CONFIG.GAME.worldWidth / 2, y: CONFIG.GAME.worldHeight / 2 }
		var all = [], dummies = []
		for (var i = 0; i < En.list.length; i++) { if (En.list[i].active && En.list[i].type === 'dummy') { all.push(En.list[i]) } }
		dummies = all.slice(-count)
		for (var j = 0; j < dummies.length; j++) {
			var ang = (j / Math.max(1, dummies.length)) * M.PI2 + 0.6, dist = 70 + j * 18
			dummies[j].x = h.x + Math.cos(ang) * dist
			dummies[j].y = h.y + Math.sin(ang) * dist
		}
		return dummies
	}
	function previewCombo(id) {
		var CO = CONFIG.COMBO
		if (!CO[id]) { Log.warn('[预览] 未知 combo：' + id); return }
		var s = Registry.get('snake'), h = (s && s.head) ? { x: s.head.x, y: s.head.y } : { x: CONFIG.GAME.worldWidth / 2, y: CONFIG.GAME.worldHeight / 2 }
		if (id === 'steamExplosion') {
			Bus.emit('fx:steamblast', { x: h.x, y: h.y, radius: CO.steamExplosion.radius })
			Log.info('[预览] 蒸汽爆炸：白色蒸汽云 + 冰晶碎屑 + 实心白闪核')
		} else if (id === 'electroTurret') {
			var ds = spawnDummiesNearHead(3)
			var chain = [{ x: h.x, y: h.y }]
			for (var i = 0; i < ds.length; i++) { chain.push({ x: ds[i].x, y: ds[i].y }) }
			Bus.emit('fx:electroarc', { chain: chain })
			Log.info('[预览] 电磁炮台：紫电链 + 节点放射电芒 + 蛇头紫辉光')
		} else if (id === 'burningBarrage') {
			var dn = spawnDummiesNearHead(3), En = Registry.get('enemy')
			for (var k = 0; k < dn.length; k++) {
				Bus.emit('fx:burndart', { from: h, to: { x: dn[k].x, y: dn[k].y } })
				if (En && En.ignite) { En.ignite(dn[k], CO.burningBarrage.burnSec, CO.burningBarrage.burnDps) }  // 点燃 → 敌身橙色灼烧环（drawBurnMark 即时显示）
			}
			Log.info('[预览] 灼烧弹幕：橙燃烧镖 + 命中橙焰爆 + 敌身火环')
		} else {
			Log.warn('[预览] 暂不支持的 combo：' + id)
		}
	}

	function toggle() { open = !open; panel.style.display = open ? 'block' : 'none'; if (open) { dirty = false; SLIDERS = []; render(); if (tuneTimer) { clearInterval(tuneTimer) } tuneTimer = setInterval(refreshTuneLevels, 300) } else { if (tuneTimer) { clearInterval(tuneTimer); tuneTimer = null } } }   // 面板开时每 300ms 实时刷新等级/高亮；关时清理

	document.addEventListener('keydown', function (e) { if (e.key === '`' || e.key === '~') { if (!panel) { build() } toggle() } })

	function build() {
		panel = document.createElement('div')
		panel.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:320px;display:none;overflow:auto;background:rgba(6,8,16,0.96);color:#fff;font:13px system-ui;padding:14px;z-index:40;box-shadow:-4px 0 18px #000'
		document.body.appendChild(panel)
		GS.tuningSandbox = GS.tuningSandbox || false   // B-GM 沙盒标志（dev，默认关）
		render()
	}

	var Editor = { init: function () { if (!panel) { build() } }, overrides: function () { return overrides }, LS_KEY: LS_KEY, rtGet: rtGet, rtSet: rtSet, rtResetGroup: rtResetGroup }
	Registry.register('editor', Editor)
	Log.info('editor 就绪：~ 键开关 GM 测试面板（config 滑块保存后重载生效，GM 指令即时）')

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2026-07-13 · B-GM · GM 面板系统性梳理 + B-1/B-2/B-3 修复 · ①冰系手感收口：移除 GM 指令里与「实时标定」重复的 冰区滞留/减速跟随窗 滑条，冰系统一到「实时标定（手感沙盒）」（默认展开），新增 TUNING_SCALAR 运行时标量滑条承载 减速跟随窗s（即时 rtSet，08_skill RT() 生效）；②去重：移除实时标定内重复的「单技能激活/生成假人」按钮（仅留 GM 指令），提示指路；③B-3 修复：实时标定滑条读 rtTuning 回显当前值（前缀 ts/sc 区分，重开面板不再回到默认）；④rtResetGroup 一并清冰系标量覆盖；⑤持久版 减速跟随窗s·持久 保留在「技能数值」（config override 范式，与运行时版区分）· 不动 §9 / core / collision
// 2026-07-12 · B-GM · editor 升级为分类 GM 测试面板 · 重写 13_editor.js：怪物/蛇/技能伤害分类 slider（沿 override+重载机制，路径自动生成，boss.hpTotal 单独处理）+ 单 Combo 激活按钮（debugActivateCombo）+ GM 指令（无限无敌/满级/清敌/碰撞盒）+ coreHp ±1 按钮 + 手动路径输入（GS. 即时 / config 重载）；08_skill.js 暴露 debugActivateCombo/debugMaxAll · 不动 §9 / core / collision
// 2025-07-10 · editor 解锁 Combo 测试按钮 · 调参面板新增「🔓 解锁全部 Combo（测试）」按钮（set fire/ice/bolt/lightning + pick→checkCombos） · 不动 §9
// 2026-07-20 · view-scale-and-dot · TUNING_SCALAR 加「视图缩放(纯视觉)」滑条(默认0.8，0.6–1.0)；「画布上限W」改名为「渲染分辨率上限W」并注明只控分辨率不改实体尺寸
