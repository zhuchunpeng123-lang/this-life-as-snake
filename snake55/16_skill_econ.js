;(function (global) {
	'use strict'
	var Log = global.Log, Bus = global.Bus, Registry = global.Registry
	var DEBUG = (global.CONFIG && global.CONFIG.DEBUG) || {}
	if (!DEBUG.enabled) { return }
	var panel = null, contentEl = null, copyBtn = null, panelOn = false
	var SAMPLE_SEC = 1            // 仅面板开启时渲染，1s 刷新足矣（不抢 L 性能日志的密集采样）
	var timer = null

	function gs() { return global.GS }
	function cfg() { return global.CONFIG }

	// 读运行时快照（实时来自 GS + skill 模块，避免历史 ring 膨胀）
	function snapshot() {
		var G = gs(); if (!G) { return {} }
		var upgradesBySeg = G.upgradesBySeg || [0, 0, 0, 0, 0]
		var skillDropsBySeg = G.skillDropsBySeg || [0, 0, 0, 0, 0]
		var src = G.skillDropsBySource || { first: 0, gap: 0, killStreak: 0 }
		var drops = G.skillDropsTotal || 0
		var upgrades = G.upgradesThisRun || 0
		var unpicked = Math.max(0, drops - upgrades)   // 掉球未拾取＝掉球−升级；满级溢出不走 skillDropsTotal，故不混入
		var overflow = G.skillMaxedOverflow || 0
		var overflowHeal = G.skillMaxedOverflowHeal || 0
		var overflowFood = G.skillMaxedOverflowFood || 0
		var gated = G.skillGatedByFloor || 0
		var sk = Registry && Registry.get('skill')
		var owned = (sk && sk.owned) ? sk.owned() : (G.ownedSkills || {})
		var list = (cfg() && cfg().SKILL && cfg().SKILL.list) ? cfg().SKILL.list : []
		var maxLv = (cfg() && cfg().SKILL && cfg().SKILL.maxLevel) ? cfg().SKILL.maxLevel : 99
		var isMaxed = (sk && sk.allMaxed) ? sk.allMaxed() : false
		var ownedStr = list.map(function (k) { return k + ':' + (owned[k] || 0) }).join(' ')
		return {
			timeSec: G.timeSec || 0, stageId: G.stageId || 1, segments: G.segments || 0, firstPickSec: (G.firstSkillPickSec || 0),
			upgrades: upgrades, upgradesBySeg: upgradesBySeg,
			drops: drops, src: src, skillDropsBySeg: skillDropsBySeg, unpicked: unpicked,
			overflow: overflow, overflowHeal: overflowHeal, overflowFood: overflowFood, gated: gated,
			ownedStr: ownedStr, maxLv: maxLv, isMaxed: isMaxed
		}
	}

	function snapshotText(s, consoleMode) {
		if (!s) { s = snapshot() }
		var L = []
		L.push(consoleMode ? '==== 技能经济快照 ====' : '技能经济（K 开关）')
		L.push('时间 ' + s.timeSec.toFixed(1) + 's | 段' + s.stageId + ' | 节' + s.segments)
		L.push('首球拾取 ' + (s.firstPickSec ? s.firstPickSec.toFixed(1) + 's ' + (s.firstPickSec <= 30 ? '✅保护期内(≤30s)' : '⚠出保护期(>30s)') : '— 未拾取'))   // S4：首球掉出(t≈5s)≠拾取；此值才是"开局尝到升级"的真实时机
		L.push('升级  总' + s.upgrades + ' /段[' + s.upgradesBySeg.join('/') + ']')
		L.push('掉球  总' + s.drops + ' (首' + s.src.first + '/常规' + s.src.gap + '/连杀' + s.src.killStreak + ') /段[' + s.skillDropsBySeg.join('/') + ']')
		L.push('未拾取 ' + s.unpicked + ' (=掉球−升级)')
		L.push('满级溢出 总' + s.overflow + ' (回血' + s.overflowHeal + '/食物' + s.overflowFood + ')')
		L.push('地板节流 ' + s.gated + ' (段间隔压制掉的掉球机会)')
		L.push('技能等级 [' + s.maxLv + '满] ' + (s.ownedStr || '-') + (s.isMaxed ? '  ✅全满级' : ''))
		if (consoleMode) { L.push('================') }
		return L.join('\n')
	}

	function renderPanel() {
		if (panelOn && contentEl) { contentEl.textContent = snapshotText(null, false) }
	}

	// 终局自动 dump 到控制台（一局打完不用开面板也能看；死亡/通关两种收尾都覆盖）
	function dumpEnd(tag) {
		var txt = snapshotText(null, true)
		try { console.log('【技能经济·' + tag + '】\n' + txt) } catch (e) {}
		Log.info('[skillEcon] ' + tag + ' 终局快照已输出到控制台')
	}

	function buildPanel() {
		if (panel) { return }
		panel = global.document.createElement('div')
		panel.style.cssText = 'position:fixed;left:8px;top:8px;width:380px;max-height:62vh;overflow:auto;background:rgba(8,12,24,0.93);color:#b7f5c9;border:1px solid #2a5a3a;font:11px/1.45 monospace;padding:8px;z-index:31'
		var head = global.document.createElement('div')
		head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#cfe'
		copyBtn = global.document.createElement('button')
		copyBtn.textContent = '复制快照'; copyBtn.style.cssText = 'font:11px monospace;cursor:pointer;background:#143a24;color:#cfe;border:1px solid #3a8a5a;border-radius:4px;padding:2px 8px'
		copyBtn.onclick = function () { copyText(snapshotText(null, true)) }
		var title = global.document.createElement('span'); title.textContent = '技能经济（K 开关 · 终局自动 console）'
		head.appendChild(title); head.appendChild(copyBtn)
		contentEl = global.document.createElement('pre')
		contentEl.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-all'
		panel.appendChild(head); panel.appendChild(contentEl)
		panel.style.display = 'none'
		global.document.body.appendChild(panel)
	}

	function legacyCopy(txt) {
		try {
			var ta = global.document.createElement('textarea'); ta.value = txt
			ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0'; ta.style.left = '0'
			global.document.body.appendChild(ta); ta.select(); global.document.execCommand('copy'); global.document.body.removeChild(ta)
		} catch (e) {}
	}
	function copyText(txt) {
		if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
			global.navigator.clipboard.writeText(txt).catch(function () { legacyCopy(txt) })
		} else { legacyCopy(txt) }
		Log.info('[skillEcon] 快照已复制到剪贴板')
	}

	function init() {
		buildPanel()
		timer = global.setInterval(function () { if (panelOn) { renderPanel() } }, SAMPLE_SEC * 1000)
		global.addEventListener('keydown', function (e) {
			if (e.key === 'k' || e.key === 'K') {   // K 开关面板（不抢 L）
				panelOn = !panelOn
				if (panel) { panel.style.display = panelOn ? 'block' : 'none'; renderPanel() }
			}
		})
		if (Bus && Bus.on) {
			Bus.on('snake:dead', function () { dumpEnd('本局结束') })       // 死亡收尾：自动 dump
			Bus.on('boss:defeated', function () { dumpEnd('BOSS击破') })   // 通关收尾：自动 dump
		}
		global.SkillEcon = {
			toggle: function () { panelOn = !panelOn; if (panel) { panel.style.display = panelOn ? 'block' : 'none'; renderPanel() } },
			snapshot: function () { return snapshotText(null, true) },
			copy: function () { var t = snapshotText(null, true); copyText(t); return t }
		}
		Registry && Registry.register('skillEcon', global.SkillEcon)
		Log.info('skillEcon 就绪：快捷键 K 开关面板，终局(snake:dead/boss:defeated)自动 console 快照')
	}
	if (global.document) { if (global.document.readyState === 'loading') { global.document.addEventListener('DOMContentLoaded', init) } else { init() } }
	else { init() }
})(typeof window !== 'undefined' ? window : this)
