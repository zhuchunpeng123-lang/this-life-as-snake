;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, Log = global.Log
	var LS_KEY = 'snake55_tuning'

	var FIELDS = [
		{ path: 'PLAYER.snakeSpeed', label: '蛇速', min: 80, max: 400, step: 5 },
		{ path: 'PLAYER.turnRate', label: '转向速率', min: 60, max: 360, step: 5 },
		{ path: 'GAME.wallScrapeSpeedMult', label: '撞墙刮擦减速', min: 0.72, max: 1, step: 0.01 }, // 硬下限 0.72
		{ path: 'COMBAT.bodyContactDps', label: '蛇身接触DPS', min: 0, max: 30, step: 1 },
		{ path: 'COMBAT.critRate', label: '暴击率', min: 0, max: 1, step: 0.01 },
		{ path: 'PICKUP.food.screenCap', label: '食物上限', min: 1, max: 20, step: 1 }
	] // TODO: 待确认完整实测调参清单

	function getPath(p) { var ks = p.split('.'), o = CONFIG; for (var i = 0; i < ks.length; i++) { if (o == null) { return undefined } o = o[ks[i]] } return o }
	var overrides = {}
	try { overrides = JSON.parse(global.localStorage.getItem(LS_KEY) || '{}') } catch (e) { overrides = {} }

	var panel = null, open = false
	function build() {
		panel = document.createElement('div')
		panel.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:300px;display:none;overflow:auto;background:rgba(6,8,16,0.95);color:#fff;font:13px system-ui;padding:14px;z-index:40;box-shadow:-4px 0 18px #000'
		document.body.appendChild(panel)
		render()
	}
	function render() {
		var html = '<div style="font:700 16px system-ui;margin-bottom:10px">调参编辑器 <span style="float:right;opacity:.6">~ 开关</span></div>'
		if (Object.keys(overrides).length) { html += '<div style="color:#fd6;margin-bottom:8px">有未生效覆盖，保存后重载</div>' }
		for (var i = 0; i < FIELDS.length; i++) {
			var f = FIELDS[i], v = (f.path in overrides) ? overrides[f.path] : getPath(f.path)
			html += '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between"><span>' + f.label + '</span><span id="v_' + i + '">' + v + '</span></div>' +
				'<input type="range" data-i="' + i + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '" style="width:100%">' + '</div>'
		}
		html += '<button id="ed_save" style="width:100%;padding:10px;margin-top:8px;border:0;border-radius:8px;background:#2de1a8;color:#063;font:700 14px system-ui;cursor:pointer">保存并重载</button>'
		html += '<button id="ed_copy" style="width:100%;padding:10px;margin-top:8px;border:1px solid #2de1a8;border-radius:8px;background:transparent;color:#2de1a8;cursor:pointer">复制覆盖 JSON</button>'
		html += '<button id="ed_reset" style="width:100%;padding:10px;margin-top:8px;border:0;border-radius:8px;background:#a33;color:#fff;cursor:pointer">清空覆盖并重载</button>'
		html += '<button id="ed_unlock_combos" style="width:100%;padding:10px;margin-top:12px;border:1px dashed #fd6;border-radius:8px;background:transparent;color:#fd6;cursor:pointer;font-size:12px">🔓 解锁全部 Combo（测试）</button>'
		panel.innerHTML = html
		var inputs = panel.querySelectorAll('input[type=range]')
		for (var j = 0; j < inputs.length; j++) {
			inputs[j].oninput = function () {
				var idx = +this.getAttribute('data-i'), val = parseFloat(this.value)
				overrides[FIELDS[idx].path] = val
				document.getElementById('v_' + idx).textContent = val
			}
		}
		panel.querySelector('#ed_save').onclick = function () { global.localStorage.setItem(LS_KEY, JSON.stringify(overrides)); global.location.reload() }
		panel.querySelector('#ed_copy').onclick = function () { var s = JSON.stringify(overrides, null, 2); try { global.navigator.clipboard.writeText(s) } catch (e) {} Log.info('覆盖JSON: ' + s) }
		panel.querySelector('#ed_reset').onclick = function () { global.localStorage.removeItem(LS_KEY); global.location.reload() }
		panel.querySelector('#ed_unlock_combos').onclick = function () {
			if (global.GS.status !== 'playing') { global.Log.warn('请先进入游戏再解锁 Combo'); return }
			global.GS.ownedSkills.fire = 1; global.GS.ownedSkills.ice = 1; global.GS.ownedSkills.bolt = 1; global.GS.ownedSkills.lightning = 1
			global.Registry.get('skill').pick('shield')
			global.Log.info('[调试] 已点亮 fire/ice/bolt/lightning + 触发 combo 检测')
		}
	}
	function toggle() { open = !open; panel.style.display = open ? 'block' : 'none'; if (open) { render() } }

	document.addEventListener('keydown', function (e) { if (e.key === '`' || e.key === '~') { if (!panel) { build() } toggle() } })

	var Editor = { init: function () { if (!panel) { build() } }, overrides: function () { return overrides }, LS_KEY: LS_KEY }
	Registry.register('editor', Editor)
	Log.info('editor 就绪：~ 键开关调参面板（保存后重载生效）')

})(typeof window !== 'undefined' ? window : this)

// 📝 修改日志
// 2025-07-10 · editor 解锁 Combo 测试按钮 · 调参面板新增「解锁全部 Combo（测试）」按钮（set fire/ice/bolt/lightning + pick→checkCombos） · 不动 §9
