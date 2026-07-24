;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var STYLE = CONFIG.STYLE   // GATE B：UI 只读 STYLE 真源（禁散写 hex）
	var PLAYER = CONFIG.PLAYER, STAGE = CONFIG.STAGE, NARR = CONFIG.NARR

	var SKILL_LABEL = { fire: '火焰光环', ice: '冰霜领域', bolt: '追踪飞镖', shield: '守护力场', lightning: '连锁闪电' } // TODO: 待确认
	var SKILL_GLYPH = { fire: '火', ice: '冰', bolt: '镖', shield: '盾', lightning: '雷' }   // 技能栏单字徽标（文本，非 hex）
	var COMBO_LABEL = { steamExplosion: '蒸汽爆炸', electroTurret: '电磁炮台', burningBarrage: '灼烧弹幕' }
	var COMBO_EVENT = { steamExplosion: 'comboSteam', electroTurret: 'comboElectro', burningBarrage: 'comboBurn' }
	var COMBO_COLOR = { steamExplosion: STYLE.playerGlow, electroTurret: STYLE.ui, burningBarrage: STYLE.enemyCalm }   // GATE B：接 STYLE 真源（禁新 hex）；校验与 skillFx 五色(#d8ff7a/#ff7a3c/#7fc4ff/#bff0d8/#7a9bff)不撞

	var root = null, froot = null, hud = null, hudLife = null, hudData = null, hudWave = null, hudSkills = null, choose = null, result = null, choiceBox = null, stageName = '—'
	var comboBanner = null, pauseBtn = null, pauseOverlay = null, fullscreenBtn = null, rotateChoiceEl = null, gmBtn = null
	var _rotateHandler = null   // 竖屏选卡门控的 orientationchange/resize 监听句柄（模块级声明，避免严格模式下未定义 ReferenceError）
	var heartBreakUntil = 0, lostHeartIndex = -1
	var _lastHudRefresh = 0   // 性能：HUD 刷新节流时间戳（~10Hz），避免每帧 innerHTML 重建触发 DOM 回流
	var seqId = 0
	var timers = []
	var usedChoiceIds = {}
	var bossTagged = false, firstUpgradeTagged = false, choicesUsed = 0, choiceActive = false
	var ownedSkillIds = {}

	function mk(tag, css, parent) { var e = document.createElement(tag); if (css) { e.style.cssText = css } if (parent) { parent.appendChild(e) } return e }
	function fmtTime(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss }
	function hexA(hex, a) {   // STYLE token → rgba（派生透明度，无新 hex 字面量）；用于面板底/描边/阴影
		var h = String(hex).replace('#', '')
		if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] }
		var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16)
		return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
	}
	function capsuleEl(extra) {   // 胶囊芯片(§8.4)：chipBg=panel+panelAlpha 派生，chipBorder=ui 1px，字=textMain
		return mk('div', 'position:absolute;display:inline-flex;align-items:center;gap:8px;padding:5px 11px;line-height:1.2;border-radius:999px;background:' + hexA(STYLE.panel, STYLE.panelAlpha) + ';border:1px solid ' + STYLE.ui + ';color:' + STYLE.textMain + ';font:600 clamp(12px,3.4vw,14px) system-ui;text-shadow:0 1px 2px ' + hexA(STYLE.bg, 0.6) + ';white-space:nowrap;' + extra, hud)
	}
	function after(ms, fn) { var my = seqId; var t = global.setTimeout(function () { if (my === seqId) { fn() } }, ms); timers.push(t); return t }
	function clearTimers() { for (var i = 0; i < timers.length; i++) { global.clearTimeout(timers[i]); global.clearInterval(timers[i]) } timers.length = 0 }

	function init(stageRoot, fullRoot) {
		root = stageRoot || document.body   // 角落 HUD 层（贴 canvas 显示区）
		froot = fullRoot || document.body   // 全屏遮罩层（升级/结算/暂停/请横屏）
		// —— HUD 容器(inset:0 覆盖, pointer-events:none) + 四组胶囊(§8.4：生命框/数据框/波次条/技能栏) ——
		hud = mk('div', 'position:absolute;inset:0;pointer-events:none;z-index:10', root)
		hudLife = capsuleEl('left:calc(12px + env(safe-area-inset-left));top:calc(10px + env(safe-area-inset-top))')          // 左上：生命框(×coreHp，濒死整框红脉冲)
		hudData = capsuleEl('left:calc(12px + env(safe-area-inset-left));top:calc(52px + env(safe-area-inset-top));flex-wrap:wrap;max-width:min(72vw,520px)')   // 左上：数据框(长度｜击杀｜得分｜连杀)
		hudWave = capsuleEl('left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%)')                  // 顶部居中：波次条(Boss 来切红闪 BOSS INCOMING)
		hudSkills = capsuleEl('right:calc(12px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top))')     // 右上：5 格技能栏(空槽也画)
		// 濒死整框红脉冲 keyframes（STYLE.enemy 真源，无新 hex）
		var _nf = document.createElement('style')
		_nf.textContent = '.ui-near-death{animation:uiNearDeath .9s ease-in-out infinite}@keyframes uiNearDeath{0%,100%{box-shadow:0 0 0 ' + hexA(STYLE.enemy, 0) + '}50%{box-shadow:0 0 14px ' + STYLE.enemy + '}}'
		if (document.head) { document.head.appendChild(_nf) }
		choose = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:' + hexA(STYLE.bg, 0.72) + ';z-index:20;pointer-events:auto', froot)
		choiceBox = mk('div', 'position:absolute;left:50%;bottom:90px;transform:translateX(-50%);display:none;flex-direction:column;gap:8px;align-items:center;z-index:18;pointer-events:auto', root)   // pointer-events:auto：#ui-stage 为 none 让点击穿透到 canvas，此处重开 auto 使抉择按钮可点（非全屏，仅盒子区域捕获，保持非阻塞）
		result = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:' + hexA(STYLE.bg, 0.6) + ';z-index:30;pointer-events:auto', froot)   // 外层半透明：框外仍可看到游戏画面（更有氛围）
		comboBanner = mk('div', 'position:absolute;left:50%;top:calc(14% + env(safe-area-inset-top));transform:translateX(-50%);display:none;padding:10px 22px;border-radius:14px;font:800 clamp(18px,5vw,22px) system-ui;color:' + STYLE.textMain + ';text-shadow:0 2px 6px ' + hexA(STYLE.bg, 0.6) + ';pointer-events:none;z-index:15;opacity:0;transition:opacity .25s;white-space:nowrap', root)
		pauseBtn = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(54px + env(safe-area-inset-top));padding:10px 16px;border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer;pointer-events:auto;z-index:12;display:none', root)
		pauseBtn.textContent = '⏸ 暂停'
		pauseBtn.onclick = function () { Bus.emit('game:toggle_pause') }
		// 全屏按钮：安卓/桌面一键全屏（经 Bus 由 main 调 API）；iPhone 不支持 JS 全屏→main 提示「添加到主屏幕」
		fullscreenBtn = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(100px + env(safe-area-inset-top));padding:10px 14px;border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer;pointer-events:auto;z-index:12;display:block', root)
		fullscreenBtn.textContent = '⛶ 全屏'
		fullscreenBtn.onclick = function () { Bus.emit('ui:fullscreen_toggle') }
		// GM 测试面板按钮：仅触屏设备显示（移动端无 ~ 键，经 Bus 触发 editor.toggle；桌面用 ~ 键）
		var isTouch = ('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0)
		if (isTouch) {
			gmBtn = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(146px + env(safe-area-inset-top));padding:10px 14px;border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer;pointer-events:auto;z-index:12;display:block', root)
			gmBtn.textContent = '⚙ GM'
			gmBtn.onclick = function () { Bus.emit('editor:toggle') }
		}
		pauseOverlay = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:' + hexA(STYLE.bg, 0.55) + ';z-index:25;color:' + STYLE.textMain + ';font:700 22px system-ui;cursor:pointer;pointer-events:auto', froot)
		pauseOverlay.innerHTML = '<div>⏸ 已暂停</div><div style="font:500 14px system-ui;opacity:.8">点此 / 按 P 或 Esc 继续</div>'
		pauseOverlay.onclick = function () { Bus.emit('game:toggle_pause') }
		// 竖屏选卡「请横屏」遮罩（全屏层）：竖屏触发升级/事件选择时盖住，横屏后自动露出选项
		rotateChoiceEl = mk('div', 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:' + hexA(STYLE.bg, 0.94) + ';color:' + STYLE.textMain + ';font:700 20px system-ui;text-align:center;z-index:35;pointer-events:auto;padding:24px', froot)
		rotateChoiceEl.innerHTML = '<div style="font-size:46px">📱↔️</div><div>请横屏以查看升级 / 选择</div><div style="font:500 14px system-ui;color:' + STYLE.ui + '">旋转手机至横屏后将自动显示选项</div>'
		var unlock = function () { var a = Registry.get('audio'); if (a) { a.unlock() } document.removeEventListener('pointerdown', unlock) }
		document.addEventListener('pointerdown', unlock)   // 首次交互解锁 Web Audio
		if (PLAYER.maxSegments > 25) { Log.warn('[ui] maxSegments>25：走马灯需改用 §8.6 抽样契约（当前"全显示"实现已超设计边界）') }
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
		var stage = mk('div', 'width:min(560px,86vw);max-height:92vh;overflow:auto;color:' + STYLE.textMain + ';font:600 17px/1.7 system-ui;text-align:center;background:' + hexA(STYLE.bg, 0.97) + ';padding:26px 30px;border-radius:18px;border:1px solid ' + hexA(STYLE.ui, 0.25) + ';box-shadow:0 18px 60px ' + hexA(STYLE.bg, 0.7) + '', result)   // 内层实底圆角卡片：框内不透光、内容清晰可读
		var still = mk('div', 'font:800 30px system-ui;color:' + (win ? STYLE.win : STYLE.lose) + ';letter-spacing:4px;opacity:0;transition:opacity .6s', stage)
		still.textContent = win ? '通　关' : '死　亡'
		after(30, function () { still.style.opacity = '1' })
		after(stillMs, function () {   // Phase1 走马灯逐节点亮
			var fbWrap = mk('div', 'margin-top:18px;min-height:120px;display:flex;flex-direction:column;gap:6px;align-items:center;color:' + STYLE.textMain + ';font:500 16px/1.6 system-ui', stage)
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
			var euWrap = mk('div', 'margin-top:16px;padding:16px 18px;border-left:3px solid ' + (win ? STYLE.win : STYLE.lose) + ';background:' + hexA(STYLE.panel, 0.4) + ';color:' + STYLE.textMain + ';font:500 16px/1.9 system-ui;text-align:left;opacity:0;transition:opacity 1s', stage)
			euWrap.textContent = eulogy; after(30, function () { euWrap.style.opacity = '1' })
		})
		after(stillMs + flashMs + Math.min(3000, eulogyMs), function () { renderScoreboard(stage, cause, win) })   // Phase3 九项卡
		after(stillMs + flashMs + eulogyMs, function () {
			var btn = mk('button', 'margin-top:18px;padding:13px 28px;border:2px solid ' + (win ? STYLE.win : STYLE.lose) + ';border-radius:12px;background:' + hexA(STYLE.panel, 0.9) + ';color:' + (win ? STYLE.win : STYLE.lose) + ';font:800 17px system-ui;cursor:pointer', stage)
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
		var box = mk('div', 'margin-top:16px;width:100%;border-top:1px solid ' + hexA(STYLE.ui, 0.15) + ';padding-top:12px', stage)
		for (var i = 0; i < rows.length; i++) {
			var r = mk('div', 'display:flex;justify-content:space-between;gap:20px;color:' + STYLE.textMain + ';font:500 14px system-ui;padding:3px 0', box)
			mk('span', 'opacity:.82', r).textContent = rows[i][0]
			mk('span', 'color:' + STYLE.textMain + ';font-weight:700', r).textContent = rows[i][1]
		}
	}

	function isPortrait() { var w = global.innerWidth || 0, h = global.innerHeight || 0; return h > w }   // 用视口宽高比判定，iOS standalone/横竖屏滞后更可靠（比 matchMedia 稳）
	// 竖屏选卡：先盖「请横屏」遮罩，监听 orientationchange + resize，转横屏后自动渲染真实选项；并提供「竖屏继续」兜底避免卡死
	function showRotateChoice(thenRender) {
		if (!rotateChoiceEl) { thenRender(); return }
		if (!isPortrait()) { thenRender(); return }   // 已横屏（含判定滞后）直接渲染
		hideRotateChoice()   // 清掉上一次可能残留的监听，避免重复绑定
		rotateChoiceEl.innerHTML =
			'<div style="font-size:46px">📱↔️</div>' +
			'<div>请横屏以查看升级 / 选择</div>' +
			'<div style="font:500 14px system-ui;color:' + STYLE.ui + '">旋转手机至横屏后将自动显示选项</div>' +
			'<button id="rc_continue" style="margin-top:6px;padding:10px 18px;border:1px solid ' + STYLE.ui + ';border-radius:10px;background:transparent;color:' + STYLE.ui + ';font:600 14px system-ui;cursor:pointer">仍用竖屏继续</button>'
		rotateChoiceEl.style.display = 'flex'
		function finish() {
			if (_rotateHandler) { global.removeEventListener('orientationchange', _rotateHandler); global.removeEventListener('resize', _rotateHandler) }
			_rotateHandler = null
			rotateChoiceEl.style.display = 'none'
			thenRender()
		}
		_rotateHandler = function () { if (!isPortrait()) { finish() } }   // 转横屏才渲染（resize 也会触发，覆盖 iOS standalone 判定滞后）
		global.addEventListener('orientationchange', _rotateHandler)
		global.addEventListener('resize', _rotateHandler)
		var cb = rotateChoiceEl.querySelector('#rc_continue')
		if (cb) { cb.onclick = finish }   // 兜底：竖屏也能继续，绝不卡死
	}
	function hideRotateChoice() {
		if (_rotateHandler) { global.removeEventListener('orientationchange', _rotateHandler); global.removeEventListener('resize', _rotateHandler); _rotateHandler = null }
		if (rotateChoiceEl) { rotateChoiceEl.style.display = 'none' }
	}
	function renderChooseCards(choices) {
		choose.innerHTML = ''
		var box = mk('div', 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:880px', choose)
		mk('div', 'width:100%;text-align:center;color:' + STYLE.textMain + ';font:700 22px system-ui;margin-bottom:14px;white-space:nowrap', box).textContent = '三选一 · 升级'
		for (var i = 0; i < choices.length; i++) {
			(function (c) {
				var card = mk('button', 'width:min(220px,78vw);padding:18px;border-radius:14px;border:2px solid ' + STYLE.skillFx[c.id] + ';background:' + STYLE.panel + ';color:' + STYLE.textMain + ';cursor:pointer;font:600 clamp(14px,4vw,16px) system-ui', box)
				card.innerHTML = '<div style="font-size:20px;margin-bottom:8px">' + (SKILL_LABEL[c.id] || c.id) + '</div><div style="color:' + STYLE.textDim + '">' + (c.isNew ? '新技能' : '升级 → Lv' + c.level) + '</div>'
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
		mk('div', 'color:' + STYLE.textMain + ';font:600 15px system-ui;background:' + hexA(STYLE.panel, 0.8) + ';padding:8px 14px;border-radius:10px;max-width:520px;text-align:center', choiceBox).textContent = ev.desc
		var btns = mk('div', 'display:flex;gap:12px', choiceBox), resolved = false
		function resolve(opt) {
			if (resolved) { return }
			resolved = true; choiceActive = false; choiceBox.style.display = 'none'; hideRotateChoice()
			if (GS.status === 'dead' || GS.status === 'clear') { return }   // #1 修复：死亡/通关后超时默认抉择不再生效（不再涨节/加血/记记忆）
			GS.irreversibleChoices.push(opt.memory); tagLatest('choice')
			if (opt.seg && GS.segments < PLAYER.maxSegments) { for (var n = 0; n < opt.seg; n++) { Bus.emit('pickup:eat', { kind: 'food', id: -1, x: 0, y: 0 }) } }   // B：记忆 token 满节同停（满节不再授节，记忆 tag 仍记录）
			if (opt.hp) { var hp = GS.coreHp + opt.hp; GS.coreHp = hp > PLAYER.coreHp ? PLAYER.coreHp : hp }
		}
		function makeBtn(opt) {
			var b = mk('button', 'padding:10px 18px;border:2px solid ' + STYLE.ui + ';border-radius:10px;background:' + STYLE.panel + ';color:' + STYLE.textMain + ';font:600 14px system-ui;cursor:pointer', btns)
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
		var label = COMBO_LABEL[id] || id, col = COMBO_COLOR[id] || STYLE.textMain
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
		return '<div style="margin-top:4px;color:' + STYLE.textMain + ';font:600 13px system-ui;opacity:.9;white-space:normal">' + lines.join('<br>') + '</div>'
	}
	function renderWave() {   // 顶部波次条(§8.4)：当前阶段+进度；Boss 预警切红闪 BOSS INCOMING
		var segs = STAGE.segments, t = GS.timeSec, cur = segs[0], next = null
		for (var k = 0; k < segs.length; k++) { if (t >= segs[k].startSec) { cur = segs[k]; next = segs[k + 1] || null } }
		var bossId = NARR.classify.deathCause.bossStageId, bossStage = null
		for (var b = 0; b < segs.length; b++) { if (segs[b].id === bossId) { bossStage = segs[b]; break } }
		if (bossStage && t >= bossStage.startSec - CONFIG.STAGE.bossWarnLeadSec && t < bossStage.startSec) {
			return '<span style="color:' + STYLE.enemy + ';font-weight:800">⚠ BOSS INCOMING</span>'
		}
		if (cur.id >= bossId) {
			return '<span style="color:' + STYLE.enemy + ';font-weight:800">☠ BOSS 期</span> <span style="opacity:.7">' + cur.name + '</span>'
		}
		var prog = next ? (t - cur.startSec) / (next.startSec - cur.startSec) : 1
		prog = Math.max(0, Math.min(1, prog))
		var pct = Math.round(prog * 100)
		return '<span style="opacity:.85">' + cur.name + '</span> <span style="opacity:.6">' + fmtTime(t) + '</span> <span style="display:inline-block;width:90px;height:6px;border-radius:999px;background:' + hexA(STYLE.ui, 0.18) + ';overflow:hidden;vertical-align:middle"><span style="display:block;height:100%;width:' + pct + '%;background:' + STYLE.ui + ';border-radius:999px"></span></span>'
	}
	function renderSkills() {   // 右上 5 格技能栏(§8.4)：空槽也画；满槽用 STYLE.skillFx[id] 描边呼应拾取物/skillFx
		var list = CONFIG.SKILL.list, owned = GS.ownedSkills || {}, html = ''
		for (var s = 0; s < list.length; s++) {
			var id = list[s], lvl = owned[id] || 0, g = SKILL_GLYPH[id] || '?', col = (STYLE.skillFx && STYLE.skillFx[id]) || STYLE.ui
			if (lvl > 0) {
				html += '<span title="' + id + '" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:' + hexA(col, 0.18) + ';border:2px solid ' + col + ';color:' + col + ';font:800 15px system-ui">' + g + '<sub style="font-size:9px;margin-left:1px">' + lvl + '</sub></span>'
			} else {
				html += '<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:' + hexA(STYLE.panel, 0.5) + ';border:1px solid ' + hexA(STYLE.ui, 0.25) + ';color:' + hexA(STYLE.ui, 0.35) + ';font:800 15px system-ui">·</span>'
			}
		}
		return html
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
		hudLife.innerHTML = hearts
		var near = GS.coreHp <= 1   // 濒死(≤1 血)整框红脉冲
		if (near && !hudLife.classList.contains('ui-near-death')) { hudLife.classList.add('ui-near-death') }
		else if (!near && hudLife.classList.contains('ui-near-death')) { hudLife.classList.remove('ui-near-death') }
		var recipe = buildRecipeHint()
		hudData.innerHTML = '长度 ' + GS.segments + '　击杀 ' + GS.kills + '　得分 ' + (GS.score + GS.comboScore) + '　连杀 x' + GS.killStreak + (recipe ? '<div style="font-weight:500;opacity:.92;margin-top:2px;white-space:normal">' + recipe + '</div>' : '')
		hudWave.innerHTML = renderWave()
		hudSkills.innerHTML = renderSkills()
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
			// 四组胶囊仅 playing 时显示（暂停/死亡由遮罩层覆盖）
			if (hudLife) { hudLife.style.display = (GS.status === 'playing') ? 'inline-flex' : 'none' }
			if (hudData) { hudData.style.display = (GS.status === 'playing') ? 'inline-flex' : 'none' }
			if (hudWave) { hudWave.style.display = (GS.status === 'playing') ? 'inline-flex' : 'none' }
			if (hudSkills) { hudSkills.style.display = (GS.status === 'playing') ? 'inline-flex' : 'none' }
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
