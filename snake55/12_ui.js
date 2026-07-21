;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var PLAYER = CONFIG.PLAYER, STAGE = CONFIG.STAGE, NARR = CONFIG.NARR

	var SKILL_LABEL = { fire: '火焰光环', ice: '冰霜领域', bolt: '追踪飞镖', shield: '守护力场', lightning: '连锁闪电' } // TODO: 待确认
	var COMBO_LABEL = { steamExplosion: '蒸汽爆炸', electroTurret: '电磁炮台', burningBarrage: '灼烧弹幕' }
	var COMBO_EVENT = { steamExplosion: 'comboSteam', electroTurret: 'comboElectro', burningBarrage: 'comboBurn' }
	var COMBO_COLOR = { steamExplosion: '#ff9a3c', electroTurret: '#9fd0ff', burningBarrage: '#ff5a4c' }   // TODO: 横幅配色待 UX 复核

	var root = null, froot = null, hud = null, choose = null, result = null, choiceBox = null, stageName = '—'
	var comboBanner = null, pauseBtn = null, pauseOverlay = null, fullscreenBtn = null, rotateChoiceEl = null
	var heartBreakUntil = 0, lostHeartIndex = -1
	var _lastHudRefresh = 0   // 性能：HUD 刷新节流时间戳（~10Hz），避免每帧 innerHTML 重建触发 DOM 回流
	var seqId = 0
	var timers = []
	var usedChoiceIds = {}
	var bossTagged = false, firstUpgradeTagged = false, choicesUsed = 0, choiceActive = false
	var ownedSkillIds = {}

	function mk(tag, css, parent) { var e = document.createElement(tag); if (css) { e.style.cssText = css } if (parent) { parent.appendChild(e) } return e }
	function fmtTime(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss }
	function after(ms, fn) { var my = seqId; var t = global.setTimeout(function () { if (my === seqId) { fn() } }, ms); timers.push(t); return t }
	function clearTimers() { for (var i = 0; i < timers.length; i++) { global.clearTimeout(timers[i]); global.clearInterval(timers[i]) } timers.length = 0 }

	function init(stageRoot, fullRoot) {
		root = stageRoot || document.body   // 角落 HUD 层（贴 canvas 显示区）
		froot = fullRoot || document.body   // 全屏遮罩层（升级/结算/暂停/请横屏）
		hud = mk('div', 'position:absolute;left:calc(12px + env(safe-area-inset-left));top:calc(10px + env(safe-area-inset-top));font:600 clamp(12px,3.6vw,15px)/1.5 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;z-index:10;white-space:nowrap', root)
		choose = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,20,0.72);z-index:20;pointer-events:auto', froot)
		choiceBox = mk('div', 'position:absolute;left:50%;bottom:90px;transform:translateX(-50%);display:none;flex-direction:column;gap:8px;align-items:center;z-index:18', root)
		result = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(6,8,16,0.92);z-index:30;pointer-events:auto', froot)
		comboBanner = mk('div', 'position:absolute;left:50%;top:calc(14% + env(safe-area-inset-top));transform:translateX(-50%);display:none;padding:10px 22px;border-radius:14px;font:800 clamp(18px,5vw,22px) system-ui;color:#fff;text-shadow:0 2px 6px #000;pointer-events:none;z-index:15;opacity:0;transition:opacity .25s;white-space:nowrap', root)
		pauseBtn = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));padding:10px 16px;border-radius:10px;background:rgba(20,26,48,.85);color:#fff;font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer;pointer-events:auto;z-index:12;display:none', root)
		pauseBtn.textContent = '⏸ 暂停'
		pauseBtn.onclick = function () { Bus.emit('game:toggle_pause') }
		// 全屏按钮：安卓/桌面一键全屏（经 Bus 由 main 调 API）；iPhone 不支持 JS 全屏→main 提示「添加到主屏幕」
		fullscreenBtn = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));padding:10px 14px;border-radius:10px;background:rgba(20,26,48,.85);color:#fff;font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer;pointer-events:auto;z-index:12;display:block', root)
		fullscreenBtn.textContent = '⛶ 全屏'
		fullscreenBtn.onclick = function () { Bus.emit('ui:fullscreen_toggle') }
		pauseOverlay = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:rgba(8,10,20,.55);z-index:25;color:#fff;font:700 22px system-ui;cursor:pointer;pointer-events:auto', froot)
		pauseOverlay.innerHTML = '<div>⏸ 已暂停</div><div style="font:500 14px system-ui;opacity:.8">点此 / 按 P 或 Esc 继续</div>'
		pauseOverlay.onclick = function () { Bus.emit('game:toggle_pause') }
		// 竖屏选卡「请横屏」遮罩（全屏层）：竖屏触发升级/事件选择时盖住，横屏后自动露出选项
		rotateChoiceEl = mk('div', 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(6,8,16,0.94);color:#fff;font:700 20px system-ui;text-align:center;z-index:35;pointer-events:auto;padding:24px', froot)
		rotateChoiceEl.innerHTML = '<div style="font-size:46px">📱↔️</div><div>请横屏以查看升级 / 选择</div><div style="font:500 14px system-ui;color:#ffd76b">旋转手机至横屏后将自动显示选项</div>'
		var unlock = function () { var a = Registry.get('audio'); if (a) { a.unlock() } document.removeEventListener('pointerdown', unlock) }
		document.addEventListener('pointerdown', unlock)   // 首次交互解锁 Web Audio
		if (PLAYER.maxSegments > 25) { Log.warn('[ui] maxSegments>25：走马灯需改用 §8.6 抽样契约（当前“全显示”实现已超设计边界）') }
	}

	function tagLatest(tag) {
		var t = GS.memoryTokens
		if (!t.length) { t.push({ tag: tag }); return }
		var last = t[t.length - 1]
		if (last.tag) { t.push({ tag: tag }) } else { last.tag = tag }
	}

	function classifyDeathCause() {
		if (GS.bossDefeated) { return 'clear' }                               // boss:defeated → 通关
		var sid = GS.maxStageId || GS.stageId || 1
		if (sid >= NARR.classify.deathCause.bossStageId) { return 'boss' }    // 段⑤未通关死 → Boss前中
		if (sid <= NARR.classify.deathCause.greedyStageMax) { return 'greedy' }                // 段①②死 → 贪死
		return 'attrition'                                                    // 段③④死 → 血耗尽
	}
	function classifyBuildLean() {
		var lv = GS.ownedSkills || {}
		var fire = lv.fire || 0, ice = lv.ice || 0, bolt = lv.bolt || 0, light = lv.lightning || 0, shield = lv.shield || 0
		var total = fire + ice + bolt + light + shield
		if (total <= 0) { return 'mixed' }
		if (fire / total >= NARR.classify.buildLean.fireThreshold) { return 'fire' }
		if (ice > 0 && ice >= fire && ice >= bolt && ice >= light && ice >= shield) { return 'ice' }
		return 'mixed'
	}
	function topBuildLabel() {
		var lv = GS.ownedSkills || {}, best = null, bestv = 0
		for (var k in lv) { if (lv.hasOwnProperty(k) && lv[k] > bestv) { bestv = lv[k]; best = k } }
		return best ? (SKILL_LABEL[best] || best) : null
	}
	function topComboLabel() {
		var hl = GS.comboHighlights
		if (hl && hl.length) { var id = hl[hl.length - 1]; return COMBO_LABEL[id] || id }
		return null
	}

	function buildFlashbackLines() {
		var fb = NARR.flashback, toks = GS.memoryTokens || [], total = toks.length, lines = []
		if (total === 0) { return [fb.headClosingLine] }
		var lastLine = '', seenEvent = {}
		for (var i = 0; i < total; i++) {
			var p = (i + 1) / total, tok = toks[i], line = ''
			if (tok && tok.tag && fb.eventLines[tok.tag] && !seenEvent[tok.tag]) {
				line = fb.eventLines[tok.tag]; seenEvent[tok.tag] = true
			} else {
				var pool = p <= fb.stageThresholds.youngMax ? fb.stageLines.young : (p <= fb.stageThresholds.primeMax ? fb.stageLines.prime : fb.stageLines.old)
				line = pool[(Math.random() * pool.length) | 0]
				if (line === lastLine && pool.length > 1) { line = pool[(pool.indexOf(line) + 1) % pool.length] }
			}
			lines.push(line); lastLine = line
		}
		lines.push(fb.headClosingLine)
		return lines
	}

	function fillTemplate(t, vars) {
		return t.replace(/\{(\w+)\}/g, function (m, k) {
			var v = vars[k]
			if (v === undefined || v === '' || v === null) { v = NARR.eulogy.varDefaults[k] }
			return (v === undefined || v === null) ? '' : String(v)
		})
	}
	function buildEulogy(cause, lean) {
		var tpls = NARR.eulogy.templates
		var tpl = (tpls[cause] && tpls[cause][lean]) ? tpls[cause][lean] : NARR.eulogy.fallback
		return fillTemplate(tpl, {
			maxLen: GS.maxSegments || '', maxStage: (stageName !== '—' ? stageName : ''),
			build: topBuildLabel() || '', topCombo: topComboLabel() || '', kills: GS.kills || '',
			choice: (GS.irreversibleChoices.length ? GS.irreversibleChoices[GS.irreversibleChoices.length - 1] : '')
		})
	}

	function startSequence(cause) {
		if (GS.status === 'dead') { return }
		GS.status = 'dead'; GS.deathCause = cause
		var mySeqId = seqId
		hideChoose(); if (choiceBox) { choiceBox.style.display = 'none' }
		var win = cause === 'clear', lean = classifyBuildLean()
		var lines = buildFlashbackLines(), eulogy = buildEulogy(cause, lean)
		var stillMs = NARR.deathStillSec * 1000
		var flashMs = Math.min(NARR.carouselSec * 1000, NARR.flashback.samplingCapMs)
		var eulogyMs = NARR.aiTextSec * 1000, budget = NARR.staticHardcapSec * 1000
		if (flashMs + eulogyMs > budget) { flashMs = Math.max(1000, budget - eulogyMs) }   // 超限只压走马灯，不压短文
		result.innerHTML = ''; result.style.display = 'flex'
		var stage = mk('div', 'width:min(560px,86vw);max-height:92vh;overflow:auto;color:#dfe;font:600 17px/1.7 system-ui;text-align:center', result)
		var still = mk('div', 'font:800 30px system-ui;color:' + (win ? '#7cff6b' : '#ff5b7a') + ';letter-spacing:4px;opacity:0;transition:opacity .6s', stage)
		still.textContent = win ? '通　关' : '死　亡'
		after(30, function () { still.style.opacity = '1' })
		after(stillMs, function () {   // Phase1 走马灯逐节点亮
			var fbWrap = mk('div', 'margin-top:18px;min-height:120px;display:flex;flex-direction:column;gap:6px;align-items:center;color:#bfe;font:500 16px/1.6 system-ui', stage)
			var step = Math.max(60, Math.min(NARR.flashback.perNodeMs, flashMs / lines.length)), i = 0
			var iv = global.setInterval(function () {
				if (mySeqId !== seqId) { global.clearInterval(iv); return }
				if (i >= lines.length) { global.clearInterval(iv); return }
				var row = mk('div', 'opacity:0;transition:opacity .4s', fbWrap); row.textContent = lines[i]
				;(function (r) { after(20, function () { r.style.opacity = '1' }) })(row)
				if (fbWrap.childNodes.length > 5) { fbWrap.removeChild(fbWrap.firstChild) }
				i++
			}, step)
			timers.push(iv)
		})
		after(stillMs + flashMs, function () {   // Phase2 蛇生短文浮现
			var euWrap = mk('div', 'margin-top:16px;padding:16px 18px;border-left:3px solid ' + (win ? '#2de1a8' : '#ff5b7a') + ';background:rgba(255,255,255,0.04);color:#eef;font:500 16px/1.9 system-ui;text-align:left;opacity:0;transition:opacity 1s', stage)
			euWrap.textContent = eulogy; after(30, function () { euWrap.style.opacity = '1' })
		})
		after(stillMs + flashMs + Math.min(3000, eulogyMs), function () { renderScoreboard(stage, cause, win) })   // Phase3 九项卡
		after(stillMs + flashMs + eulogyMs, function () {
			var btn = mk('button', 'margin-top:18px;padding:13px 28px;border:0;border-radius:12px;background:' + (win ? '#2de1a8' : '#ff5b7a') + ';color:#062;font:800 17px system-ui;cursor:pointer', stage)
			btn.textContent = win ? '再来一局' : '再来一条蛇生'
			btn.onclick = function () { var core = Registry.get('core'); if (core && core.resetRun) { core.resetRun() } }
		})
	}

	function renderScoreboard(stage, cause, win) {
		var comboCount = GS.comboHighlights ? GS.comboHighlights.length : 0
		var verdict = NARR.scoreboard.verdictByDeathCause[cause] || '一条蛇的一生', runCount = 1
		try {
			var key = NARR.scoreboard.localStorageKey
			runCount = (parseInt(global.localStorage.getItem(key), 10) || 0) + 1
			global.localStorage.setItem(key, String(runCount))
		} catch (e) { runCount = 1 }
		var rows = [
			['此生长度', '长到 ' + GS.maxSegments + ' 节'],
			['走过的路', '抵达「' + (stageName !== '—' ? stageName : '前路') + '」'],
			['斩获', '撞咬 ' + GS.kills + ' 次'],
			['最高连杀', GS.killStreakMax + ' 连杀'],
			['割草得分', String(GS.score + GS.comboScore)],
			['发现的翁绞', '翁绞 ' + comboCount + ' / 5'],
			['蛇生评语', verdict],
			['高光时刻', topComboLabel() ? ('Combo「' + topComboLabel() + '」') : '最朴素的一路'],
			['第几条蛇生', '你的第 ' + runCount + ' 条蛇生']
		]
		var box = mk('div', 'margin-top:16px;width:100%;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px', stage)
		for (var i = 0; i < rows.length; i++) {
			var r = mk('div', 'display:flex;justify-content:space-between;gap:20px;color:#cfe;font:500 14px system-ui;padding:3px 0', box)
			mk('span', 'opacity:.7', r).textContent = rows[i][0]
			mk('span', 'color:#fff;font-weight:600', r).textContent = rows[i][1]
		}
	}

	function isPortrait() { return !!(global.matchMedia && global.matchMedia('(orientation:portrait)').matches) }
	// 竖屏选卡：先盖「请横屏」遮罩，监听 orientationchange，转横屏后自动渲染真实选项
	function showRotateChoice(thenRender) {
		if (!rotateChoiceEl) { thenRender(); return }
		if (rotateChoiceEl.style.display !== 'flex') { rotateChoiceEl.style.display = 'flex' }
		if (_rotateHandler) { global.removeEventListener('orientationchange', _rotateHandler) }
		_rotateHandler = function () {
			if (isPortrait()) { return }
			if (_rotateHandler) { global.removeEventListener('orientationchange', _rotateHandler); _rotateHandler = null }
			if (rotateChoiceEl) { rotateChoiceEl.style.display = 'none' }
			thenRender()
		}
		global.addEventListener('orientationchange', _rotateHandler)
	}
	function hideRotateChoice() {
		if (_rotateHandler) { global.removeEventListener('orientationchange', _rotateHandler); _rotateHandler = null }
		if (rotateChoiceEl) { rotateChoiceEl.style.display = 'none' }
	}
	function renderChooseCards(choices) {
		choose.innerHTML = ''
		var box = mk('div', 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:880px', choose)
		mk('div', 'width:100%;text-align:center;color:#fff;font:700 22px system-ui;margin-bottom:14px;white-space:nowrap', box).textContent = '三选一 · 升级'
		for (var i = 0; i < choices.length; i++) {
			(function (c) {
				var card = mk('button', 'width:min(220px,78vw);padding:18px;border-radius:14px;border:2px solid #2de1a8;background:#11203a;color:#fff;cursor:pointer;font:600 clamp(14px,4vw,16px) system-ui', box)
				card.innerHTML = '<div style="font-size:20px;margin-bottom:8px">' + (SKILL_LABEL[c.id] || c.id) + '</div><div style="color:#9fe">' + (c.isNew ? '新技能' : '升级 → Lv' + c.level) + '</div>'
				card.onclick = function () { var s = Registry.get('skill'); if (s) { s.pick(c.id) } hideChoose() }
			})(choices[i])
		}
		choose.style.display = 'flex'
	}
	function showChoose(choices) {
		if (isPortrait()) { showRotateChoice(function () { renderChooseCards(choices) }); return }
		renderChooseCards(choices)
	}
	function hideChoose() { if (choose) { choose.style.display = 'none' } hideRotateChoice() }

	function offerChoice(ev) {
		if (choiceActive || GS.status !== 'playing' || choicesUsed >= NARR.choicePerRunMax) { return }
		if (isPortrait()) { showRotateChoice(function () { renderOfferChoice(ev) }); return }
		renderOfferChoice(ev)
	}
	function renderOfferChoice(ev) {
		choiceActive = true; choicesUsed++; choiceBox.innerHTML = ''
		mk('div', 'color:#ffe;font:600 15px system-ui;background:rgba(8,10,20,0.8);padding:8px 14px;border-radius:10px;max-width:520px;text-align:center', choiceBox).textContent = ev.desc
		var btns = mk('div', 'display:flex;gap:12px', choiceBox), resolved = false
		function resolve(opt) {
			if (resolved) { return }
			resolved = true; choiceActive = false; choiceBox.style.display = 'none'; hideRotateChoice()
			GS.irreversibleChoices.push(opt.memory); tagLatest('choice')
			if (opt.seg) { for (var n = 0; n < opt.seg; n++) { Bus.emit('pickup:eat', { kind: 'food', id: -1, x: 0, y: 0 }) } }
			if (opt.hp) { var hp = GS.coreHp + opt.hp; GS.coreHp = hp > PLAYER.coreHp ? PLAYER.coreHp : hp }
		}
		function makeBtn(opt) {
			var b = mk('button', 'padding:10px 18px;border:2px solid #ffb000;border-radius:10px;background:#1a1530;color:#fff;font:600 14px system-ui;cursor:pointer', btns)
			b.textContent = opt.text; b.onclick = function () { resolve(opt) }
		}
		makeBtn(ev.a); makeBtn(ev.b); choiceBox.style.display = 'flex'
		after(NARR.choices.timeoutSec * 1000, function () { resolve(ev[ev.def]) })   // 超时走默认（不可逆）
	}
	function tryTriggerChoice(stageId) {
		if (choicesUsed >= NARR.choicePerRunMax) { return }
		var evs = NARR.choices.events
		for (var i = 0; i < evs.length; i++) {
			if (evs[i].segId === stageId && !usedChoiceIds[evs[i].id]) { usedChoiceIds[evs[i].id] = true; offerChoice(evs[i]); return }
		}
	}
	function countOwnedSkills() { var n = 0; for (var k in ownedSkillIds) { if (ownedSkillIds.hasOwnProperty(k)) { n++ } } return n }
	function tryTriggerChoiceBySkill(skillCount) {
		if (choicesUsed >= NARR.choicePerRunMax) { return }
		var evs = NARR.choices.events
		for (var i = 0; i < evs.length; i++) {
			var ev = evs[i]
			if (ev.skillCount && skillCount >= ev.skillCount && !usedChoiceIds[ev.id]) {
				usedChoiceIds[ev.id] = true
				;(function (e) { global.setTimeout(function () { offerChoice(e) }, 0) })(ev)   // 延后到 status→playing 再弹
				return
			}
		}
	}
	function tryTriggerChoiceFlex() {   // P1-3 CH-01 双条件：首技能已获得 AND 节数≥minSegments
		if (choicesUsed >= NARR.choicePerRunMax) { return }
		var evs = NARR.choices.events
		for (var i = 0; i < evs.length; i++) {
			var ev = evs[i]
			if (!ev.firstSkillRequired || usedChoiceIds[ev.id]) { continue }
			if (countOwnedSkills() > 0 && GS.segments >= ev.minSegments) {
				usedChoiceIds[ev.id] = true; offerChoice(ev); return
			}
		}
	}

	function showComboBanner(id) {                                  // §3 Combo 触发横幅（~0.8s）
		if (!comboBanner) { return }
		var label = COMBO_LABEL[id] || id, col = COMBO_COLOR[id] || '#fff'
		comboBanner.textContent = '⚡ ' + label + '！'
		comboBanner.style.background = 'linear-gradient(90deg, rgba(0,0,0,0), ' + col + '55, rgba(0,0,0,0))'
		comboBanner.style.color = col
		comboBanner.style.display = 'block'; comboBanner.style.opacity = '1'
		after(800, function () { if (comboBanner) { comboBanner.style.opacity = '0' } })
		after(1100, function () { if (comboBanner) { comboBanner.style.display = 'none' } })
	}
	function buildRecipeHint() {                                     // §3 常驻配方提示：凑什么出什么不再靠猜
		var CO2 = CONFIG.COMBO, lv = GS.ownedSkills || {}, lines = [], keys = CO2 ? Object.keys(CO2) : []
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i], c = CO2[key]
			if (!c || !c.parts || c.parts.length < 2) { continue }
			var a = c.parts[0], b = c.parts[1], aOwn = lv[a] > 0, bOwn = lv[b] > 0
			if (!aOwn && !bOwn) { continue }
			var name = COMBO_LABEL[key] || key, la = SKILL_LABEL[a] || a, lb = SKILL_LABEL[b] || b
			if (aOwn && bOwn) { lines.push('✦ ' + la + ' + ' + lb + ' → ' + name + '（已激活）') }
			else { var have = aOwn ? la : lb, need = aOwn ? lb : la; lines.push('◦ 持有 ' + have + '，再得 ' + need + ' → ' + name) }
		}
		if (!lines.length) { return '' }
		return '<div style="margin-top:4px;color:#ffe;font:600 13px system-ui;opacity:.9">' + lines.join('<br>') + '</div>'
	}
	function refreshHUD() {
		if (!hud) { return }
		var hearts = ''
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		var breaking = now < heartBreakUntil
		for (var i = 0; i < PLAYER.coreHp; i++) {
			if (i < GS.coreHp) { hearts += '❤' }
			else if (breaking && i === lostHeartIndex) { hearts += '💥' }   // 扣心瞬间：对应心碎裂闪烁
			else { hearts += '🖤' }
		}
		hud.innerHTML = '<div>' + hearts + '</div><div>得分 ' + (GS.score + GS.comboScore) + '　连杀 x' + GS.killStreak + '</div><div>击杀 ' + GS.kills + '　蛇长 ' + GS.segments + '</div><div>时间 ' + fmtTime(GS.timeSec) + '　阶段 ' + stageName + '</div>' + buildRecipeHint()
	}

	Bus.on('skill:offer', function (d) { if (d && d.choices) { showChoose(d.choices) } })
	Bus.on('skill:gained', function (d) {
		if (!d) { return }
		GS.buildSequence.push(d.id)
		if (!firstUpgradeTagged) { firstUpgradeTagged = true; tagLatest('firstUpgrade') }
		if (d.id) { ownedSkillIds[d.id] = true }
		tryTriggerChoiceBySkill(countOwnedSkills())   // ② CH-02 按技能计数精确触发
		tryTriggerChoiceFlex()                         // P1-3 CH-01 双条件检测
	})
	Bus.on('combo:found', function (d) { if (!d || !d.id) { return } GS.comboHighlights.push(d.id); var tg = COMBO_EVENT[d.id]; if (tg) { tagLatest(tg) }; showComboBanner(d.id) })
	Bus.on('snake:grow', function () { GS.memoryTokens.push({ tag: null }); tryTriggerChoiceFlex() })   // P1-3 每长一节检测 CH-01
	Bus.on('enemy:die', function (d) { if (d && d.kind === 'elite') { tagLatest('killElite') } })
	Bus.on('snake:hurt', function () { tagLatest('hurt'); lostHeartIndex = GS.coreHp; heartBreakUntil = (global.performance && global.performance.now ? global.performance.now() : Date.now()) + 500 })   // 扣心碎裂闪烁
	Bus.on('pickup:eat', function (d) { if (d && d.kind === 'heal') { tagLatest('heal') } })
	Bus.on('wave:stage', function (d) {
		if (d && d.name) { stageName = d.name }
		if (d && d.stageId >= NARR.classify.deathCause.bossStageId && !bossTagged) { bossTagged = true; tagLatest('bossEncounter') }
		if (d && d.stageId) { tryTriggerChoice(d.stageId) }
	})
	Bus.on('snake:dead', function () { startSequence(classifyDeathCause()) })
	Bus.on('boss:defeated', function () { GS.bossDefeated = true; startSequence('clear') })
	Bus.on('core:run_reset', function () {
		seqId++; clearTimers()
		stageName = '—'; bossTagged = false; firstUpgradeTagged = false; choicesUsed = 0; choiceActive = false; usedChoiceIds = {}
		ownedSkillIds = {}
		hideChoose(); if (choiceBox) { choiceBox.style.display = 'none' } if (result) { result.style.display = 'none'; result.innerHTML = '' }
		heartBreakUntil = 0; lostHeartIndex = -1; if (comboBanner) { comboBanner.style.display = 'none' }
	})

	var UI = {
		init: init,
		update: function () {
			var hn = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
			if (hn - _lastHudRefresh >= 100) { refreshHUD(); _lastHudRefresh = hn }   // ~10Hz 节流：分数/时间/蛇长慢变，10Hz 足够；消除每帧 innerHTML 重建的 DOM 重排回流（原每帧执行，未计入帧时间）
			if (pauseBtn) { pauseBtn.style.display = (GS.status === 'playing' || GS.status === 'paused') ? 'block' : 'none' }
			if (pauseOverlay) { pauseOverlay.style.display = (GS.status === 'paused') ? 'flex' : 'none' }
			if (GS.status === 'playing') {
				if (GS.segments > GS.maxSegments) { GS.maxSegments = GS.segments }
				if (GS.stageId > GS.maxStageId) { GS.maxStageId = GS.stageId }
				if (GS.killStreak > GS.killStreakMax) { GS.killStreakMax = GS.killStreak }
			}
		}
	}
	Registry.register('ui', UI)
	Log.info('ui 就绪：HUD / 三选一 / 死亡序列(定格→走马灯→蛇生→九项) / 抉择')

})(typeof window !== 'undefined' ? window : this)
