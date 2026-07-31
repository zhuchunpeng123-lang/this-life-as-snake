;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var STYLE = CONFIG.STYLE   // GATE B：UI 只读 STYLE 真源（禁散写 hex）
	var PLAYER = CONFIG.PLAYER, STAGE = CONFIG.STAGE, NARR = CONFIG.NARR
	var UI_ICONS = (CONFIG.UI && CONFIG.UI.icons) || {}
	var UI_ICON_ASSETS = UI_ICONS.assets || {}
	var UI_HUD_SKIN = (CONFIG.UI && CONFIG.UI.hudSkin) || {}

	var SKILL_LABEL = { fire: '火焰光环', ice: '冰霜领域', bolt: '追踪飞镖', shield: '守护力场', lightning: '连锁闪电' } // TODO: 待确认
	var SKILL_GLYPH = { fire: '火', ice: '冰', bolt: '镖', shield: '盾', lightning: '雷' }   // 技能栏单字徽标（文本，非 hex）
	var COMBO_LABEL = { steamExplosion: '蒸汽爆炸', electroTurret: '电磁炮台', burningBarrage: '灼烧弹幕' }
	var COMBO_EVENT = { steamExplosion: 'comboSteam', electroTurret: 'comboElectro', burningBarrage: 'comboBurn' }
	var COMBO_COLOR = { steamExplosion: STYLE.playerGlow, electroTurret: STYLE.ui, burningBarrage: STYLE.enemyCalm }   // GATE B：接 STYLE 真源（禁新 hex）；校验与 skillFx 五色(#d8ff7a/#ff7a3c/#7fc4ff/#bff0d8/#7a9bff)不撞
var SKILL_DESC = { fire: '灼烧周身敌人，持续掉血', ice: '减速并冻结范围内敌人', bolt: '自动发射追踪飞镖', shield: '环绕护盾球抵挡伤害', lightning: '闪电连锁跳跃劈敌' }   // 三选一卡片「一句效果描述」（纯展示文案，非 §9 数值）
var SCORE_ICON = { seg: '🐍', path: '🗺️', kills: '💀', streak: '🔥', score: '⭐', combo: '💥', verdict: '📜', highlight: '✨', lives: '🐉' }   // 结算九项图标（emoji，纯展示）

var root = null, froot = null, hud = null, hudStatus = null, hudLife = null, hudData = null, hudCenter = null, hudBoss = null, hudWave = null, hudBuild = null, hudSkills = null, hudCombo = null, choose = null, result = null, choiceBox = null, buildInfoLayer = null, buildInfoBox = null, stageName = '—'
var comboBanner = null, pauseBtn = null, pauseOverlay = null, fullscreenBtn = null, rotateChoiceEl = null, gmBtn = null, hudSys = null, gateEl = null
var isTouch = false   // 触屏设备标记：init 内赋值；移动端走重排布局、桌面保持原右上三联（供 applyUiScale/按钮文案判断）
	var _rotateHandler = null   // 竖屏选卡门控的 orientationchange/resize 监听句柄（模块级声明，避免严格模式下未定义 ReferenceError）
	var heartBreakUntil = 0, lostHeartIndex = -1
	var _lastHudRefresh = 0   // 性能：HUD 刷新节流时间戳（~10Hz），避免每帧 innerHTML 重建触发 DOM 回流
	var seqId = 0
	function editorAllowed() { var D = CONFIG.DEBUG || {}; return !!(D.enabled && D.editorEnabled) }
	var timers = []
	var usedChoiceIds = {}
	var chooseKeyHandler = null   // 三选一键盘 1/2/3 监听句柄（显示时挂载、hideChoose 时移除）
	var bossTagged = false, firstUpgradeTagged = false, choicesUsed = 0, choiceActive = false
	var ownedSkillIds = {}

	function mk(tag, css, parent) { var e = document.createElement(tag); if (css) { e.style.cssText = css } if (parent) { parent.appendChild(e) } return e }
	function iconText(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
	function iconMarkup(id, fallback, kind) {
		var spec = UI_ICON_ASSETS[id] || {}, frames = UI_ICONS.framePx || {}, frame = frames[kind] || frames.hud || 30
		var pad = UI_ICONS.paddingPx != null ? UI_ICONS.paddingPx : 2
		var scaleByKind = UI_ICONS.scaleByKind || {}, kindScale = scaleByKind[kind] != null ? scaleByKind[kind] : 1
		var scale = (spec.scale != null ? spec.scale : (UI_ICONS.scale != null ? UI_ICONS.scale : 1)) * kindScale
		var text = iconText(fallback), box = 'display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:' + frame + 'px;height:' + frame + 'px;padding:' + pad + 'px;overflow:hidden;flex:0 0 auto;line-height:1;text-align:center'
		if (!spec.src) { return '<span style="' + box + ';font:800 15px system-ui">' + text + '</span>' }
		var src = iconText(spec.src)
		return '<span style="' + box + '"><img src="' + src + '" alt="" style="display:block;max-width:100%;max-height:100%;object-fit:contain;transform:scale(' + scale + ')" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\'"><span style="display:none;align-items:center;justify-content:center;font:800 15px system-ui">' + text + '</span></span>'
	}
	function fmtTime(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss }
	function hexA(hex, a) {   // STYLE token → rgba（派生透明度，无新 hex 字面量）；用于面板底/描边/阴影
		var h = String(hex).replace('#', '')
		if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] }
		var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16)
		return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
	}
	function getUiTuning(path) {
		var v, ed = Registry.get('editor')
		if (ed && ed.rtGet) { v = ed.rtGet('UI.tuning.' + path); if (v !== undefined) { return v } }
		var cur = CONFIG.UI && CONFIG.UI.tuning, parts = path.split('.')
		for (var i = 0; cur && i < parts.length; i++) { cur = cur[parts[i]] }
		return cur
	}
	function uiVar(name, value, unit) { if (hud) { hud.style.setProperty(name, String(value) + (unit || '')) } }
	function ensureHudStyle() {
		if (document.getElementById('snake-ui-v1-style')) { return }
		var style = document.createElement('style')
		style.id = 'snake-ui-v1-style'
		style.textContent = ''
			+ '.ui-v1-hud{position:absolute;inset:0;pointer-events:none;z-index:10;color:var(--ui-text);font-family:system-ui,sans-serif}'
			+ '.ui-v1-status,.ui-v1-center,.ui-v1-build,.ui-v1-system{position:absolute;pointer-events:none;z-index:10}'
			+ '.ui-v1-status{left:calc(env(safe-area-inset-left) + var(--ui-edge) + var(--ui-status-x));top:calc(env(safe-area-inset-top) + var(--ui-top) + var(--ui-status-y));display:flex;flex-direction:column;gap:var(--ui-life-stats-gap);max-width:42vw}'
			+ '.ui-v1-center{left:50%;top:calc(env(safe-area-inset-top) + var(--ui-top));transform:translateX(-50%);display:flex;align-items:center;gap:4px;min-width:0}'
			+ '.ui-v1-build{right:calc(env(safe-area-inset-right) + var(--ui-edge) + var(--ui-build-x));top:calc(env(safe-area-inset-top) + var(--ui-top) + var(--ui-build-y));display:flex;flex-direction:column;align-items:flex-end;gap:var(--ui-cluster-gap);max-width:44vw}'
			+ '.ui-v1-system{left:calc(env(safe-area-inset-left) + var(--ui-edge) + var(--ui-system-x));bottom:calc(env(safe-area-inset-bottom) + var(--ui-edge) + var(--ui-system-y));display:flex;flex-direction:column;gap:var(--ui-system-gap);align-items:flex-start;pointer-events:auto;z-index:12}'
			+ '.ui-v1-panel{position:relative;box-sizing:border-box;background:var(--ui-panel-primary);border:0;border-radius:0;box-shadow:none;text-shadow:0 1px 2px var(--ui-shadow);background-repeat:no-repeat;background-position:center;background-size:100% 100%;overflow:visible}'
			+ '.ui-v1-stage,.ui-v1-boss,.ui-v1-skills,.ui-v1-combo,.ui-v1-system-btn{background-repeat:no-repeat;background-position:center;background-size:100% 100%;overflow:visible;flex:0 0 auto}'
			+ '.ui-v1-life{width:min(calc(var(--ui-life-width-vw) * 1vw),290px);aspect-ratio:var(--ui-life-ratio);display:flex;align-items:center;justify-content:center;padding:var(--skin-top) var(--skin-right) var(--skin-bottom) var(--skin-left);background-color:transparent;font-size:var(--ui-value);letter-spacing:1px;white-space:nowrap;transform:translate(var(--ui-life-x),var(--ui-life-y)) scale(var(--ui-life-scale));transform-origin:top left}'
			+ '.ui-v1-life-content{display:flex;align-items:center;justify-content:center;gap:0;transform:translate(var(--ui-life-content-x),var(--ui-life-content-y)) scale(var(--ui-life-content-scale));transform-origin:center}'
			+ '.ui-v1-life-count{margin-left:var(--ui-life-number-gap);font-size:var(--ui-life-number-size);font-weight:800;color:var(--ui-text)}.ui-v1-life-hearts{font-size:var(--ui-life-heart-size);letter-spacing:var(--ui-life-heart-gap);line-height:1}'
			+ '.ui-v1-data{position:relative;width:min(calc(var(--ui-stats-width-vw) * 1vw),300px);aspect-ratio:var(--ui-stats-ratio);display:block;max-width:100%;padding:0;background-color:transparent;font-size:var(--ui-body);line-height:1;color:var(--ui-text-dim);transform:translate(var(--ui-stats-x),var(--ui-stats-y)) scale(var(--ui-stats-scale));transform-origin:top left}.ui-v1-stats-content{position:relative;width:100%;height:100%;transform:translate(var(--ui-stats-content-x),var(--ui-stats-content-y)) scale(var(--ui-stats-content-scale));transform-origin:center}.ui-v1-stat-cell{position:absolute;left:var(--stat-x);top:var(--stat-y);width:25%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;white-space:nowrap;font-size:var(--ui-stats-font-size);text-align:center}'
			+ '.ui-v1-data strong{color:var(--ui-text);font-size:var(--ui-value);font-weight:800}'
			+ '.ui-v1-stage{position:relative;width:min(calc(var(--ui-stage-width-vw) * 1vw),240px);aspect-ratio:var(--ui-stage-ratio);display:block;min-height:22px;padding:0;background-color:transparent;color:var(--ui-text-dim);white-space:nowrap;overflow:visible;transform:translate(var(--ui-stage-x),var(--ui-stage-y)) scale(var(--ui-stage-scale));transform-origin:top center}.ui-v1-stage-content{position:absolute;inset:0;transform:translate(var(--ui-stage-content-x),var(--ui-stage-content-y)) scale(var(--ui-stage-content-scale));transform-origin:center}.ui-v1-stage-main{position:absolute;left:var(--stage-left);right:var(--stage-right);top:var(--stage-top);bottom:var(--stage-bottom);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.ui-v1-stage-main strong{position:relative;top:var(--ui-stage-title-y);font-size:var(--ui-stage-title-size);color:var(--ui-text)}.ui-v1-stage-time{position:relative;top:var(--ui-stage-timer-y);font-size:var(--ui-stage-timer-size);color:var(--ui-text-dim)}'
			+ '.ui-v1-stage.is-boss{color:var(--ui-text)}'
			+ '.ui-v1-stage-track{position:absolute;left:calc((100% - var(--ui-stage-progress-width)) / 2 + var(--ui-stage-progress-x));top:calc(100% - var(--stage-progress-bottom) - var(--ui-stage-progress-height) + var(--ui-stage-progress-y));width:var(--ui-stage-progress-width);height:var(--ui-stage-progress-height);border-radius:999px;overflow:hidden;background:transparent}.ui-v1-stage-fill{display:block;height:100%;border-radius:inherit;background:var(--ui-accent)}'
			+ '.ui-v1-boss{position:relative;display:none;width:min(var(--ui-boss-width),var(--ui-boss-max));aspect-ratio:var(--ui-boss-ratio);margin-top:var(--ui-boss-offset-y);padding:0;background:var(--ui-panel-secondary);text-align:center}.ui-v1-boss.is-active{display:block}.ui-v1-boss-label{position:absolute;left:var(--boss-left);right:var(--boss-right);top:var(--boss-top);bottom:var(--boss-bottom);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;margin:0;font-size:var(--ui-boss-label);font-weight:800;color:var(--ui-text)}.ui-v1-boss-name{font-size:var(--ui-title);color:var(--ui-text)}.ui-v1-boss-phase{font-size:var(--ui-meta);color:var(--ui-text-dim)}.ui-v1-boss.is-invuln .ui-v1-boss-label{color:var(--ui-boss)}.ui-v1-boss-track{position:absolute;left:var(--boss-hp-left);right:var(--boss-hp-right);bottom:var(--boss-hp-bottom);height:var(--boss-hp-height);overflow:hidden;border-radius:999px;background:var(--ui-boss-track)}.ui-v1-boss-fill{display:block;height:100%;border-radius:inherit;background:var(--ui-boss);transition:width .12s linear}.ui-v1-boss-hp-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:var(--ui-meta);font-weight:800;color:var(--ui-text)}'
			+ '.ui-v1-skills{position:relative;width:max(220px,min(44vw,330px));aspect-ratio:var(--ui-skills-ratio);display:block;padding:0;background-color:transparent}.ui-v1-skill{position:absolute;left:var(--slot-x);top:var(--slot-y);width:var(--slot-width);height:var(--slot-height);transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:0;border-radius:0;background:transparent;color:var(--skill-color)}.ui-v1-skill.is-empty{border:0;background:transparent;color:transparent}.ui-v1-icon-cell{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100%;padding:var(--ui-icon-pad);overflow:visible;line-height:1;text-align:center;flex:0 0 auto}.ui-v1-icon-cell img{display:block;max-width:100%;max-height:100%;object-fit:contain}.ui-v1-level{position:absolute;right:0;bottom:0;z-index:1;min-width:var(--ui-badge);height:var(--ui-badge);padding:0 2px;box-sizing:border-box;border-radius:999px;background:var(--ui-panel-primary);border:1px solid var(--skill-color);color:var(--skill-color);font:800 calc(var(--ui-badge) * .7)/calc(var(--ui-badge) - 1px) system-ui;text-align:center}'
			+ '.ui-v1-combo{position:relative;width:min(31vw,230px);aspect-ratio:var(--ui-combo-ratio);display:block;max-width:100%;padding:0;background-color:transparent}.ui-v1-combo-title{position:absolute;left:var(--combo-title-left);right:var(--combo-title-right);top:var(--combo-title-top);height:var(--combo-title-height);display:flex;align-items:center;justify-content:center;font-size:var(--ui-meta);font-weight:800;color:var(--ui-text-dim);white-space:nowrap}.ui-v1-combo-item{position:absolute;left:var(--slot-x);top:var(--slot-y);width:var(--slot-width);height:var(--slot-height);transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:0;background:transparent;font-size:0;line-height:1;white-space:nowrap}.ui-v1-combo-item.is-active{box-shadow:none}.ui-v1-combo-item .ui-v1-icon-cell{width:100%;height:100%;padding:var(--ui-icon-pad)}.ui-v1-combo-name{display:none}.ui-v1-combo-item:not(.is-active){opacity:.48}'
			+ '.ui-v1-system-btn{position:relative;width:132px;min-width:86px;aspect-ratio:var(--ui-system-ratio);box-sizing:border-box;padding:0;border:0;border-radius:0;background:var(--ui-system-panel);color:var(--ui-text);font:700 var(--ui-body)/1 system-ui;text-align:center;cursor:pointer;pointer-events:auto;white-space:nowrap}.ui-v1-system-btn:active{filter:brightness(1.15)}'
			+ '.ui-v1-stage,.ui-v1-boss,.ui-v1-skills,.ui-v1-combo,.ui-v1-system-btn{background-repeat:no-repeat;background-position:center;background-size:100% 100%;overflow:visible;flex:0 0 auto}'
			+ '.ui-v1-stage-main strong{top:0;transform:translateY(var(--ui-stage-title-y))}.ui-v1-stage-time{top:0;transform:translateY(var(--ui-stage-timer-y))}'
			+ '.ui-v1-skills{width:min(calc(var(--ui-skills-width-vw) * 1vw),330px);transform:translate(var(--ui-skills-x),var(--ui-skills-y)) scale(var(--ui-skills-scale));transform-origin:top right}'
			+ '.ui-v1-combo{width:min(calc(var(--ui-combo-width-vw) * 1vw),230px);transform:translate(var(--ui-combo-x),var(--ui-combo-y)) scale(var(--ui-combo-scale));transform-origin:top right}'
			+ '.ui-v1-system-btn{display:flex;align-items:center;justify-content:center;background-color:transparent}.ui-v1-system-label{position:absolute;left:var(--system-left);right:var(--system-right);top:var(--system-top);bottom:var(--system-bottom);display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:nowrap}'
			+ '.ui-v1-boss{background-color:transparent}.ui-v1-boss-name,.ui-v1-boss-time,.ui-v1-boss-phase,.ui-v1-boss-status{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap}.ui-v1-boss-name{left:var(--boss-name-x);top:var(--boss-name-y);font-size:var(--boss-name-size);font-weight:800;color:var(--ui-text)}.ui-v1-boss-time{left:var(--boss-time-x);top:var(--boss-time-y);font-size:var(--boss-time-size);color:var(--ui-text-dim)}.ui-v1-boss-phase{left:var(--boss-phase-x);top:var(--boss-phase-y);font-size:var(--boss-phase-size);color:var(--ui-text-dim)}.ui-v1-boss-status{left:var(--boss-status-x);top:var(--boss-status-y);font-size:var(--boss-status-size);color:var(--ui-boss)}.ui-v1-boss-track{left:calc(var(--boss-hp-x) - var(--boss-hp-width) / 2);right:auto;top:calc(var(--boss-hp-y) - var(--boss-hp-height) / 2);bottom:auto;width:var(--boss-hp-width);height:var(--boss-hp-height);background:transparent}'
			+ '.ui-v1-skill,.ui-v1-combo-item{pointer-events:auto;cursor:pointer}.ui-v1-build-info-layer{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;background:' + hexA(STYLE.bg, 0.72) + ';z-index:22;pointer-events:auto}.ui-v1-build-info{width:min(92vw,440px);max-height:82vh;overflow:auto;padding:18px;border:2px solid ' + STYLE.ui + ';border-radius:14px;background:' + hexA(STYLE.panel, 0.96) + ';color:var(--ui-text);box-shadow:0 0 18px ' + hexA(STYLE.ui, 0.28) + ';font:600 14px/1.5 system-ui}.ui-v1-build-info h3{margin:0 0 12px;font-size:20px;color:var(--ui-text)}.ui-v1-build-info-card{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:10px;border:1px solid ' + hexA(STYLE.ui, 0.45) + ';border-radius:10px;background:' + hexA(STYLE.bg, 0.34) + '}.ui-v1-info-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex:0 0 48px}.ui-v1-info-icon .ui-v1-icon-cell{width:100%;height:100%}.ui-v1-build-info-detail{color:var(--ui-text-dim);white-space:pre-line}.ui-v1-build-info-close{display:block;width:100%;margin-top:14px;padding:8px 12px;border:1px solid ' + STYLE.ui + ';border-radius:8px;background:transparent;color:var(--ui-text);font:700 14px system-ui;cursor:pointer}'
			+ '.ui-v1-build-info,.ui-v1-build-info h3,.ui-v1-build-info-close{color:' + STYLE.textMain + '}.ui-v1-build-info-detail{color:' + STYLE.textDim + '}.ui-v1-build-info-close{touch-action:manipulation}'
			+ '@media (max-width:620px){.ui-v1-status{max-width:39vw}.ui-v1-build{max-width:43vw}.ui-v1-data{gap:2px 5px}.ui-v1-system-btn{min-width:86px}.ui-v1-boss{max-width:52vw}}'
		document.head.appendChild(style)
	}
	function applyUiTuning() {
		if (!hud) { return }
		uiVar('--ui-edge', getUiTuning('layout.edgePad'), 'px'); uiVar('--ui-top', getUiTuning('layout.topPad'), 'px'); uiVar('--ui-cluster-gap', getUiTuning('layout.clusterGap'), 'px')
		uiVar('--ui-status-x', getUiTuning('layout.statusOffsetX'), 'px'); uiVar('--ui-status-y', getUiTuning('layout.statusOffsetY'), 'px'); uiVar('--ui-build-x', getUiTuning('layout.buildOffsetX'), 'px'); uiVar('--ui-build-y', getUiTuning('layout.buildOffsetY'), 'px'); uiVar('--ui-system-x', getUiTuning('layout.systemOffsetX'), 'px'); uiVar('--ui-system-y', getUiTuning('layout.systemOffsetY'), 'px')
		uiVar('--ui-life-stats-gap', getUiTuning('playerLife.statsGap'), 'px')
		uiVar('--ui-life-scale', getUiTuning('playerLife.overallScale')); uiVar('--ui-life-width-vw', getUiTuning('playerLife.widthVw'), ''); uiVar('--ui-life-x', getUiTuning('playerLife.offsetX'), 'px'); uiVar('--ui-life-y', getUiTuning('playerLife.offsetY'), 'px')
		uiVar('--ui-life-content-scale', getUiTuning('playerLife.contentScale')); uiVar('--ui-life-content-x', getUiTuning('playerLife.contentOffsetX'), 'px'); uiVar('--ui-life-content-y', getUiTuning('playerLife.contentOffsetY'), 'px'); uiVar('--ui-life-heart-size', getUiTuning('playerLife.heartSize'), 'px'); uiVar('--ui-life-heart-gap', getUiTuning('playerLife.heartGap'), 'px'); uiVar('--ui-life-number-size', getUiTuning('playerLife.numberSize'), 'px'); uiVar('--ui-life-number-gap', getUiTuning('playerLife.numberGap'), 'px')
		uiVar('--ui-stats-scale', getUiTuning('playerStats.overallScale')); uiVar('--ui-stats-width-vw', getUiTuning('playerStats.widthVw'), ''); uiVar('--ui-stats-x', getUiTuning('playerStats.offsetX'), 'px'); uiVar('--ui-stats-y', getUiTuning('playerStats.offsetY'), 'px'); uiVar('--ui-stats-content-scale', getUiTuning('playerStats.contentScale')); uiVar('--ui-stats-content-x', getUiTuning('playerStats.contentOffsetX'), 'px'); uiVar('--ui-stats-content-y', getUiTuning('playerStats.contentOffsetY'), 'px'); uiVar('--ui-stats-font-size', getUiTuning('playerStats.fontSize'), 'px')
		uiVar('--ui-stage-scale', getUiTuning('stage.overallScale')); uiVar('--ui-stage-width-vw', getUiTuning('stage.widthVw'), ''); uiVar('--ui-stage-x', getUiTuning('stage.offsetX'), 'px'); uiVar('--ui-stage-y', getUiTuning('stage.offsetY'), 'px'); uiVar('--ui-stage-content-scale', getUiTuning('stage.contentScale')); uiVar('--ui-stage-content-x', getUiTuning('stage.contentOffsetX'), '%'); uiVar('--ui-stage-content-y', getUiTuning('stage.contentOffsetY'), '%'); uiVar('--ui-stage-title-size', getUiTuning('stage.titleSize'), 'px'); uiVar('--ui-stage-title-y', getUiTuning('stage.titleOffsetY'), '%'); uiVar('--ui-stage-timer-size', getUiTuning('stage.timerSize'), 'px'); uiVar('--ui-stage-timer-y', getUiTuning('stage.timerOffsetY'), '%'); uiVar('--ui-stage-progress-width', getUiTuning('stage.progressWidth') * 100, '%'); uiVar('--ui-stage-progress-height', getUiTuning('stage.progressHeight') * 100, '%'); uiVar('--ui-stage-progress-x', getUiTuning('stage.progressOffsetX') * 100, '%'); uiVar('--ui-stage-progress-y', getUiTuning('stage.progressOffsetY') * 100, '%')
		uiVar('--ui-radius', getUiTuning('surface.cornerPx'), 'px'); uiVar('--ui-glow-blur', getUiTuning('surface.glowBlurPx'), 'px')
		uiVar('--ui-title', getUiTuning('type.titlePx'), 'px'); uiVar('--ui-value', getUiTuning('type.valuePx'), 'px'); uiVar('--ui-body', getUiTuning('type.bodyPx'), 'px'); uiVar('--ui-meta', getUiTuning('type.metaPx'), 'px')
		uiVar('--ui-slot', getUiTuning('skills.slotPx'), 'px'); uiVar('--ui-skill-icon', getUiTuning('skills.iconCellPx'), 'px'); uiVar('--ui-skill-gap', getUiTuning('skills.gapPx'), 'px'); uiVar('--ui-badge', getUiTuning('skills.badgePx'), 'px')
		uiVar('--ui-combo-icon', getUiTuning('combo.iconCellPx'), 'px'); uiVar('--ui-combo-font', getUiTuning('combo.fontPx'), 'px'); uiVar('--ui-combo-item-gap', getUiTuning('combo.itemGapPx'), 'px'); uiVar('--ui-combo-inner-gap', getUiTuning('combo.innerGapPx'), 'px'); uiVar('--ui-combo-pad-x', getUiTuning('combo.padX'), 'px'); uiVar('--ui-combo-pad-y', getUiTuning('combo.padY'), 'px')
		uiVar('--ui-boss-width', getUiTuning('bossBar.widthPct') * 100, 'vw'); uiVar('--ui-boss-max', getUiTuning('bossBar.maxWidthPx'), 'px'); uiVar('--ui-boss-height', getUiTuning('bossBar.heightPx'), 'px'); uiVar('--ui-boss-offset-y', getUiTuning('bossBar.offsetY'), 'px'); uiVar('--ui-boss-label', getUiTuning('bossBar.labelPx'), 'px'); uiVar('--boss-name-x', getUiTuning('bossBar.nameX') * 100, '%'); uiVar('--boss-name-y', getUiTuning('bossBar.nameY') * 100, '%'); uiVar('--boss-name-size', getUiTuning('bossBar.nameSize'), 'px'); uiVar('--boss-time-x', getUiTuning('bossBar.timeX') * 100, '%'); uiVar('--boss-time-y', getUiTuning('bossBar.timeY') * 100, '%'); uiVar('--boss-time-size', getUiTuning('bossBar.timeSize'), 'px'); uiVar('--boss-phase-x', getUiTuning('bossBar.phaseX') * 100, '%'); uiVar('--boss-phase-y', getUiTuning('bossBar.phaseY') * 100, '%'); uiVar('--boss-phase-size', getUiTuning('bossBar.phaseSize'), 'px'); uiVar('--boss-status-x', getUiTuning('bossBar.statusX') * 100, '%'); uiVar('--boss-status-y', getUiTuning('bossBar.statusY') * 100, '%'); uiVar('--boss-status-size', getUiTuning('bossBar.statusSize'), 'px'); uiVar('--boss-hp-x', getUiTuning('bossBar.hpX') * 100, '%'); uiVar('--boss-hp-y', getUiTuning('bossBar.hpY') * 100, '%'); uiVar('--boss-hp-width', getUiTuning('bossBar.hpWidth') * 100, '%'); uiVar('--boss-hp-height', getUiTuning('bossBar.hpHeight') * 100, '%'); uiVar('--boss-hp-text-size', getUiTuning('bossBar.hpTextSize'), 'px')
		uiVar('--ui-system-gap', getUiTuning('system.gapPx'), 'px')
		uiVar('--ui-skills-scale', getUiTuning('skills.overallScale')); uiVar('--ui-skills-width-vw', getUiTuning('skills.widthVw'), ''); uiVar('--ui-skills-x', getUiTuning('skills.offsetX'), 'px'); uiVar('--ui-skills-y', getUiTuning('skills.offsetY'), 'px')
		uiVar('--ui-combo-scale', getUiTuning('combo.overallScale')); uiVar('--ui-combo-width-vw', getUiTuning('combo.widthVw'), ''); uiVar('--ui-combo-x', getUiTuning('combo.offsetX'), 'px'); uiVar('--ui-combo-y', getUiTuning('combo.offsetY'), 'px')
		uiVar('--ui-system-local-x', getUiTuning('system.offsetX'), 'px'); uiVar('--ui-system-local-y', getUiTuning('system.offsetY'), 'px')
		uiVar('--ui-panel-primary', hexA(STYLE.panel, getUiTuning('surface.primaryAlpha'))); uiVar('--ui-panel-secondary', hexA(STYLE.panel, getUiTuning('surface.secondaryAlpha'))); uiVar('--ui-border', hexA(STYLE.ui, getUiTuning('surface.borderAlpha'))); uiVar('--ui-glow', hexA(STYLE.ui, getUiTuning('surface.glowAlpha'))); uiVar('--ui-shadow', hexA(STYLE.bg, 0.6)); uiVar('--ui-text', STYLE.textMain); uiVar('--ui-text-dim', STYLE.textDim); uiVar('--ui-accent', STYLE.ui); uiVar('--ui-track', hexA(STYLE.ui, 0.18)); uiVar('--ui-slot-empty', hexA(STYLE.panel, 0.45)); uiVar('--ui-boss', STYLE.boss); uiVar('--ui-boss-border', hexA(STYLE.boss, 0.62)); uiVar('--ui-boss-glow', hexA(STYLE.boss, getUiTuning('surface.glowAlpha'))); uiVar('--ui-boss-track', hexA(STYLE.boss, 0.18)); uiVar('--ui-system-panel', hexA(STYLE.panel, getUiTuning('system.alpha'))); uiVar('--ui-icon-pad', UI_ICONS.paddingPx != null ? UI_ICONS.paddingPx : 2, 'px')
		var skinKeys = ['life', 'stats', 'stage', 'boss', 'skills', 'combo', 'system']
		for (var si = 0; si < skinKeys.length; si++) { var sk = skinKeys[si], spec = UI_HUD_SKIN[sk]; if (spec && spec.ratio) { uiVar('--ui-' + sk + '-ratio', spec.ratio) } }
		applyHudSkin()
		_lastUiScale = -1
	}
	function applyHudSkin() {
		var map = { life: hudLife, stats: hudData, stage: hudWave, boss: hudBoss, skills: hudSkills, combo: hudCombo, system: null }
		var systemNodes = [pauseBtn, fullscreenBtn, gmBtn]
		function setVars(el, spec) {
			if (!el || !spec) { return }
			if (spec.content) {
				el.style.setProperty('--skin-left', (spec.content.left * 100) + '%'); el.style.setProperty('--skin-right', (spec.content.right * 100) + '%')
				el.style.setProperty('--skin-top', (spec.content.top * 100) + '%'); el.style.setProperty('--skin-bottom', (spec.content.bottom * 100) + '%')
				if (el.classList && el.classList.contains('ui-v1-system-btn')) {
					el.style.setProperty('--system-left', (spec.content.left * 100) + '%'); el.style.setProperty('--system-right', (spec.content.right * 100) + '%')
					el.style.setProperty('--system-top', (spec.content.top * 100) + '%'); el.style.setProperty('--system-bottom', (spec.content.bottom * 100) + '%')
				}
				if (el === hudWave) { el.style.setProperty('--stage-left', (spec.content.left * 100) + '%'); el.style.setProperty('--stage-right', (spec.content.right * 100) + '%'); el.style.setProperty('--stage-top', (spec.content.top * 100) + '%'); el.style.setProperty('--stage-bottom', (spec.content.bottom * 100) + '%') }
				if (el === hudBoss) { el.style.setProperty('--boss-left', (spec.content.left * 100) + '%'); el.style.setProperty('--boss-right', (spec.content.right * 100) + '%'); el.style.setProperty('--boss-top', (spec.content.top * 100) + '%'); el.style.setProperty('--boss-bottom', (spec.content.bottom * 100) + '%') }
			}
			if (spec.columns) { el.style.setProperty('--stat-y', ((spec.centerY || 0.5) * 100) + '%') }
			if (spec.progress) { el.style.setProperty('--stage-progress-left', (spec.progress.left * 100) + '%'); el.style.setProperty('--stage-progress-right', (spec.progress.right * 100) + '%'); el.style.setProperty('--stage-progress-bottom', (spec.progress.bottom * 100) + '%'); el.style.setProperty('--stage-progress-height', (spec.progress.height * 100) + '%') }
			if (spec.hp) { el.style.setProperty('--boss-hp-left', (spec.hp.left * 100) + '%'); el.style.setProperty('--boss-hp-right', (spec.hp.right * 100) + '%'); el.style.setProperty('--boss-hp-bottom', (spec.hp.bottom * 100) + '%'); el.style.setProperty('--boss-hp-height', (spec.hp.height * 100) + '%') }
			if (spec.title) { el.style.setProperty('--combo-title-left', (spec.title.left * 100) + '%'); el.style.setProperty('--combo-title-right', (spec.title.right * 100) + '%'); el.style.setProperty('--combo-title-top', (spec.title.top * 100) + '%'); el.style.setProperty('--combo-title-height', (spec.title.height * 100) + '%') }
		}
		for (var key in map) { if (!map.hasOwnProperty(key) || !map[key]) { continue } var skin = UI_HUD_SKIN[key]; if (skin && skin.src) { map[key].style.backgroundImage = 'url("' + skin.src.replace(/"/g, '') + '")'; setVars(map[key], skin) } }
		for (var i = 0; i < systemNodes.length; i++) { if (systemNodes[i] && UI_HUD_SKIN.system && UI_HUD_SKIN.system.src) { systemNodes[i].style.backgroundImage = 'url("' + UI_HUD_SKIN.system.src.replace(/"/g, '') + '")'; setVars(systemNodes[i], UI_HUD_SKIN.system) } }
	}
function capsuleEl(extra) {   // 胶囊芯片(§8.4)：chipBg=panel+panelAlpha 派生，chipBorder=ui 1px，字=textMain；统一柔发光(§四 P1-8)
    return mk('div', 'position:absolute;display:inline-flex;align-items:center;gap:8px;padding:5px 11px;line-height:1.2;border-radius:999px;background:' + hexA(STYLE.panel, STYLE.panelAlpha) + ';border:1px solid ' + STYLE.ui + ';box-shadow:0 0 10px ' + hexA(STYLE.ui, 0.22) + ';color:' + STYLE.textMain + ';font:600 clamp(12px,3.4vw,14px) system-ui;text-shadow:0 1px 2px ' + hexA(STYLE.bg, 0.6) + ';white-space:nowrap;' + extra, hud)
}
	function after(ms, fn) { var my = seqId; var t = global.setTimeout(function () { if (my === seqId) { fn() } }, ms); timers.push(t); return t }
	function clearTimers() { for (var i = 0; i < timers.length; i++) { global.clearTimeout(timers[i]); global.clearInterval(timers[i]) } timers.length = 0 }

	function init(stageRoot, fullRoot) {
		root = stageRoot || document.body   // 角落 HUD 层（贴 canvas 显示区）
		froot = fullRoot || document.body   // 全屏遮罩层（升级/结算/暂停/请横屏）
		// —— HUD 容器(inset:0 覆盖, pointer-events:none) + 四组胶囊(§8.4：生命框/数据框/波次条/技能栏) ——
		ensureHudStyle()
		hud = mk('div', '', root); hud.className = 'ui-v1-hud'
		isTouch = ('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0)   // 触屏设备：走移动端重排布局；桌面保持原右上三联布局
		hudStatus = mk('div', 'position:absolute;left:calc(16px + env(safe-area-inset-left));top:calc(16px + env(safe-area-inset-top));display:flex;flex-direction:column;gap:8px;pointer-events:none;z-index:10', hud)   // 左上：角色状态簇(两行一组,16px 安全边距)
		hudLife = capsuleEl('position:relative;left:auto;top:auto;width:fit-content;max-width:calc(100vw - 32px);white-space:nowrap;padding:6px 12px')   // ①生命(×coreHp 实心/空心)，fit-content 自然撑开、禁裁切；左右内边距≥12px
		hudStatus.appendChild(hudLife)
		hudData = capsuleEl('position:relative;left:auto;top:auto;width:fit-content;max-width:calc(100vw - 32px);display:inline-flex;flex-wrap:wrap;align-items:center;gap:0 2px;white-space:normal;line-height:1.6;padding:6px 12px')   // ②数据框：fit-content+换行、禁裁切、超宽自动两行(P0/HUD 硬约束)；左右内边距≥12px
		hudStatus.appendChild(hudData)
		hudWave = capsuleEl('left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%)')                  // 顶部居中：波次条(Boss 来切红闪 BOSS INCOMING)
		// —— 移动端重排：右上 hudRight=技能(row1)+combo(row2) 与左簇(hudStatus)生命(row1)/数据(row2)逐行对齐；系统按钮移左下竖排带文字；桌面保持原右上三联 ——
		if (isTouch) {
			var hudRight = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(16px + env(safe-area-inset-top));display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;z-index:10', hud)   // 右上：与左簇同 top+gap → 技能对齐生命、combo 对齐数据
			hudSkills = capsuleEl('position:relative;left:auto;top:auto')   // 移动端：技能栏进右簇 row1
			hudRight.appendChild(hudSkills)
			hudCombo = capsuleEl('position:relative;left:auto;top:auto;flex-wrap:wrap;gap:6px;max-width:min(72vw,360px)')   // 移动端：combo 进右簇 row2，与左数据行对齐
			hudRight.appendChild(hudCombo)
			hudSys = mk('div', 'position:absolute;left:calc(12px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;align-items:stretch;pointer-events:auto;z-index:12', root)   // 移动端：系统按钮组移左下竖排，stretch 使三按钮等宽对齐、避让右下摇杆区
		} else {
			hudSkills = capsuleEl('right:calc(12px + env(safe-area-inset-right));top:calc(58px + env(safe-area-inset-top))')   // 桌面：技能栏在系统按钮下方
			hudCombo = capsuleEl('right:calc(12px + env(safe-area-inset-right));top:calc(104px + env(safe-area-inset-top));flex-wrap:wrap;gap:6px;max-width:min(72vw,360px)')   // 桌面：Combo 在技能栏下方
			hudSys = mk('div', 'position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));display:flex;gap:8px;pointer-events:auto;z-index:12', root)   // 桌面：系统按钮右上顶部横排
		}
		// 濒死整框红脉冲 keyframes（STYLE.enemy 真源，无新 hex）
		// Normalize the legacy branches into one semantic HUD tree after creation.
		hudStatus.style.cssText = ''; hudStatus.className = 'ui-v1-status'
		hudLife.style.cssText = ''; hudLife.className = 'ui-v1-panel ui-v1-life'
		hudData.style.cssText = ''; hudData.className = 'ui-v1-panel ui-v1-data'
		hudCenter = mk('div', '', hud); hudCenter.className = 'ui-v1-center'
		hudWave.style.cssText = ''; hudWave.className = 'ui-v1-stage'; hudCenter.appendChild(hudWave)
		hudBoss = mk('div', '', hudCenter); hudBoss.className = 'ui-v1-boss'
		hudBuild = mk('div', '', hud); hudBuild.className = 'ui-v1-build'
		hudSkills.style.cssText = ''; hudSkills.className = 'ui-v1-skills'; hudBuild.appendChild(hudSkills)
		hudCombo.style.cssText = ''; hudCombo.className = 'ui-v1-combo'; hudBuild.appendChild(hudCombo)
		hudSys.style.cssText = ''; hudSys.className = 'ui-v1-system'; hud.appendChild(hudSys)
		applyUiTuning()
		var _nf = document.createElement('style')
		_nf.textContent = '.ui-near-death{animation:uiNearDeath .9s ease-in-out infinite}@keyframes uiNearDeath{0%,100%{box-shadow:0 0 0 ' + hexA(STYLE.enemy, 0) + '}50%{box-shadow:0 0 14px ' + STYLE.enemy + '}}'
		if (document.head) { document.head.appendChild(_nf) }
		choose = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:' + hexA(STYLE.bg, 0.72) + ';z-index:20;pointer-events:auto', froot)
		choiceBox = mk('div', 'position:absolute;left:50%;bottom:22%;max-width:min(92%,520px);transform:translateX(-50%);display:none;flex-direction:column;gap:8px;align-items:center;z-index:18;pointer-events:auto', root)   // bottom:22% 上移避让右下摇杆区；max-width 防极窄屏溢出；pointer-events:auto 使抉择按钮可点
		buildInfoLayer = mk('div', '', froot); buildInfoLayer.className = 'ui-v1-build-info-layer'
		buildInfoBox = mk('div', '', buildInfoLayer); buildInfoBox.className = 'ui-v1-build-info'
		buildInfoLayer.setAttribute('aria-hidden', 'true')
		buildInfoLayer.onclick = function (e) { if (e.target === buildInfoLayer) { e.preventDefault(); hideBuildInfo() } }
		buildInfoBox.onclick = function (e) { e.stopPropagation() }
		global.addEventListener('keydown', function (e) { if (e.key === 'Escape' && buildInfoLayer && buildInfoLayer.style.display !== 'none') { hideBuildInfo() } })
		hudSkills.addEventListener('click', function (e) { var target = findBuildInfoTarget(e.target, hudSkills, 'data-skill'); if (target) { Bus.emit('ui:feedback', { kind: 'press', id: 'skill_status' }); showBuildInfo('skill', target.getAttribute('data-skill')) } })
		hudCombo.addEventListener('click', function (e) { var target = findBuildInfoTarget(e.target, hudCombo, 'data-combo'); if (target) { Bus.emit('ui:feedback', { kind: 'press', id: 'combo_status' }); showBuildInfo('combo', target.getAttribute('data-combo')) } })
		hudSkills.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var target = findBuildInfoTarget(e.target, hudSkills, 'data-skill'); if (target) { e.preventDefault(); showBuildInfo('skill', target.getAttribute('data-skill')) } } })
		hudCombo.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var target = findBuildInfoTarget(e.target, hudCombo, 'data-combo'); if (target) { e.preventDefault(); showBuildInfo('combo', target.getAttribute('data-combo')) } } })
		result = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:' + hexA(STYLE.bg, 0.6) + ';z-index:30;pointer-events:auto', froot)   // 外层半透明：框外仍可看到游戏画面（更有氛围）
		comboBanner = mk('div', 'position:absolute;left:50%;top:calc(14% + env(safe-area-inset-top));transform:translateX(-50%);display:none;padding:10px 22px;border-radius:14px;font:800 clamp(18px,5vw,22px) system-ui;color:' + STYLE.textMain + ';text-shadow:0 2px 6px ' + hexA(STYLE.bg, 0.6) + ';pointer-events:none;z-index:15;opacity:0;transition:opacity .25s;white-space:nowrap', root)
		// 系统按钮：移动端带完整文字(⏸ 暂停 / ⛶ 全屏 / ⚙ GM)并等宽居中对齐；桌面保留原横排文字（hudSys 已在上方按 isTouch 定位）
		pauseBtn = mk('div', 'min-width:' + (isTouch ? '92px' : 'auto') + ';text-align:center;padding:' + (isTouch ? '9px 14px' : '10px 16px') + ';border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer', hudSys)
		pauseBtn.textContent = '⏸ 暂停'
		pauseBtn.onclick = function () { Bus.emit('game:toggle_pause') }
		// 全屏按钮：安卓/桌面一键全屏（经 Bus 由 main 调 API）；iPhone 不支持 JS 全屏→main 提示「添加到主屏幕」
		fullscreenBtn = mk('div', 'min-width:' + (isTouch ? '92px' : 'auto') + ';text-align:center;padding:' + (isTouch ? '9px 14px' : '10px 14px') + ';border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer', hudSys)
		fullscreenBtn.textContent = '⛶ 全屏'
		fullscreenBtn.onclick = function () { Bus.emit('ui:feedback', { kind: 'toggle', id: 'fullscreen' }); Bus.emit('ui:fullscreen_toggle') }
		// GM 测试面板按钮：仅触屏 + DEBUG 双开时创建；发布配置下 fail-closed。
		if (isTouch && editorAllowed()) {
			gmBtn = mk('div', 'min-width:92px;text-align:center;padding:9px 14px;border-radius:10px;background:' + hexA(STYLE.panel, 0.85) + ';color:' + STYLE.textMain + ';font:600 clamp(13px,3.6vw,15px) system-ui;cursor:pointer', hudSys)
			gmBtn.textContent = '⚙ GM'
			gmBtn.onclick = function () { Bus.emit('editor:toggle') }
		}
		pauseBtn.style.cssText = ''; pauseBtn.className = 'ui-v1-system-btn'
			fullscreenBtn.style.cssText = ''; fullscreenBtn.className = 'ui-v1-system-btn'
			if (gmBtn) { gmBtn.style.cssText = ''; gmBtn.className = 'ui-v1-system-btn' }
			pauseBtn.innerHTML = '<span class="ui-v1-system-label">⏸ 暂停</span>'
			fullscreenBtn.innerHTML = '<span class="ui-v1-system-label">⛶ 全屏</span>'
			if (gmBtn) { gmBtn.innerHTML = '<span class="ui-v1-system-label">⚙ GM</span>' }
			applyHudSkin()
		pauseOverlay = mk('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:' + hexA(STYLE.bg, 0.55) + ';z-index:25;color:' + STYLE.textMain + ';font:700 22px system-ui;cursor:pointer;pointer-events:auto', froot)
		pauseOverlay.innerHTML = '<div>⏸ 已暂停</div><div style="font:500 14px system-ui;opacity:.8">点此 / 按 P 或 Esc 继续</div>'
		pauseOverlay.onclick = function () { Bus.emit('game:toggle_pause') }
		// 竖屏选卡「请横屏」遮罩（全屏层）：竖屏触发升级/事件选择时盖住，横屏后自动露出选项
		rotateChoiceEl = mk('div', 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:' + hexA(STYLE.bg, 0.94) + ';color:' + STYLE.textMain + ';font:700 20px system-ui;text-align:center;z-index:35;pointer-events:auto;padding:24px', froot)
		rotateChoiceEl.innerHTML = '<div style="font-size:46px">📱↔️</div><div>请横屏以查看升级 / 选择</div><div style="font:500 14px system-ui;color:' + STYLE.ui + '">旋转手机至横屏后将自动显示选项</div>'
		// 强制横屏全屏遮罩（仅触屏设备由 main 触发；z-index:60 压所有层）：竖屏盖住、横屏隐藏
		gateEl = mk('div', 'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:' + hexA(STYLE.bg, 0.96) + ';color:' + STYLE.textMain + ';font:700 22px system-ui;text-align:center;padding:calc(env(safe-area-inset-top) + 24px) calc(env(safe-area-inset-right) + 24px) calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 24px);z-index:60;pointer-events:auto', froot)
		gateEl.innerHTML = '<div style="font-size:54px">📱↔️</div><div>请横屏以获得最佳体验</div><div style="font:500 14px system-ui;color:' + STYLE.ui + '">旋转手机至横屏即可继续</div>'
		Bus.on('ui:orientation_gate', function (d) { if (gateEl) { gateEl.style.display = (d && d.show) ? 'flex' : 'none' } })
		// 移动端(iOS Safari)音频解锁：pointerdown 不被 iOS 接受为解锁 AudioContext 的合法手势(需 touchstart/click 等)，
		// 故多事件兜底，首次任意交互即 resume；触发后移除全部监听（one-shot）
		var _unlockEvents = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown']
		var unlock = function () {
			var a = Registry.get('audio'); if (a) { a.unlock() }
			// 关键修复：仅在 ctx 真正 running 后才移除监听。原 one-shot 在首次(touchstart)即移除，
			// 而 iOS 常在 touchstart 内 resume 失败、需 touchend/click 内才成功 → 过早移除会丢失可靠兜底，致永久静音
			if (a && a.isRunning && a.isRunning()) {
				for (var i = 0; i < _unlockEvents.length; i++) { document.removeEventListener(_unlockEvents[i], unlock) }
			}
		}
		for (var i = 0; i < _unlockEvents.length; i++) { document.addEventListener(_unlockEvents[i], unlock, { passive: true }) }
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
		var lastLine = '', seenEvent = {}, seenStage = {}
		for (var i = 0; i < total; i++) {
			var p = (i + 1) / total, tok = toks[i], line = ''
			if (tok && tok.tag && fb.eventLines[tok.tag] && !seenEvent[tok.tag]) {
				line = fb.eventLines[tok.tag]; seenEvent[tok.tag] = true
			} else {
				var pool = p <= fb.stageThresholds.youngMax ? fb.stageLines.young : (p <= fb.stageThresholds.primeMax ? fb.stageLines.prime : fb.stageLines.old)
				// 候选1：未用过 且 ≠上一句(优先，保证不连续重复)；候选2：任何 ≠上一句(即便用过)；兜底：全池
				var a1 = [], a2 = []
				for (var k = 0; k < pool.length; k++) {
					if (pool[k] === lastLine) { continue }
					a2.push(pool[k])
					if (!seenStage[pool[k]]) { a1.push(pool[k]) }
				}
				if (a1.length) { line = a1[(Math.random() * a1.length) | 0] }
				else if (a2.length) { line = a2[(Math.random() * a2.length) | 0] }
				else { line = pool[(Math.random() * pool.length) | 0] }
				seenStage[line] = true
			}
			lines.push(line); lastLine = line
		}
		if (fb.headClosingLine !== lastLine) { lines.push(fb.headClosingLine) }   // 收尾句不与末句重复
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
		// 复用 HUD 同款 uiScale(画布显示高/540,钳0.55~1.0)：手机横屏(高~375)缩到~0.69 不显过大,PC 恒1.0 零回归
		var _s = computeUiScale()
		var stage = mk('div', 'width:min(560px,86vw);max-height:92vh;overflow:auto;transform:scale(' + _s + ');transform-origin:center center;color:' + STYLE.textMain + ';font:600 17px/1.7 system-ui;text-align:center;background:' + hexA(STYLE.bg, 0.97) + ';padding:26px 30px;border-radius:18px;border:1px solid ' + hexA(STYLE.ui, 0.25) + ';box-shadow:0 18px 60px ' + hexA(STYLE.bg, 0.7) + ',0 0 26px ' + hexA(STYLE.ui, 0.2) + '', result)   // 内层实底圆角卡片：框内不透光、内容清晰可读 + 霓虹外发光(P1-8)；transform:scale(_s) 让手机端结算整体等比缩小不显过大
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
		after(stillMs + flashMs + Math.min(3000, eulogyMs), function () { renderScoreboard(stage, cause, win) })   // Phase3 评级 + 再来一局按钮 + 九项卡(按钮已内置于 renderScoreboard,与评级同现、不沉底)
	}

	function computeRating() {   // P1-7：评级仅展示、不入数值（金标色用 STYLE.food，无新 hex）
		var pts = 0
		pts += Math.min(GS.maxSegments || 0, 40) * 2          // 长度（封顶 80）
		pts += Math.min(GS.kills || 0, 120)                   // 击杀（封顶 120）
		pts += Math.min((GS.score + GS.comboScore) || 0, 4000) / 14   // 得分（封顶 ~286）
		if (GS.bossDefeated) { pts += 220 }                  // 通关加成（封顶合计 ~706）
		if (pts >= 560) { return 'S' }
		if (pts >= 380) { return 'A' }
		if (pts >= 200) { return 'B' }
		return 'C'
	}
	function renderScoreboard(stage, cause, win) {
		var comboCount = GS.comboHighlights ? GS.comboHighlights.length : 0
		var verdict = NARR.scoreboard.verdictByDeathCause[cause] || '一条蛇的一生', runCount = 1
		try {
			var key = NARR.scoreboard.localStorageKey
			runCount = (parseInt(global.localStorage.getItem(key), 10) || 0) + 1
			global.localStorage.setItem(key, String(runCount))
		} catch (e) { runCount = 1 }
		// 评级金标（gold=STYLE.food，仅展示、不入数值）
		var rbadge = mk('div', 'margin:2px auto 14px;display:inline-flex;align-items:center;gap:8px;padding:6px 18px;border-radius:999px;background:' + hexA(STYLE.food, 0.16) + ';border:1px solid ' + STYLE.food + ';color:' + STYLE.food + ';font:800 15px system-ui;box-shadow:0 0 12px ' + hexA(STYLE.food, 0.4), stage)   // 恢复原始紧凑居中尺寸(不拉满宽)
		rbadge.innerHTML = '评级<span style="font-size:22px;margin-left:6px">' + computeRating() + '</span>'
		// 再来一局按钮：紧跟评级下方(与评级同时出现,不延迟、不沉底)；九项置于其下最底
		var btn = mk('button', 'display:block;margin:0 auto 16px;padding:13px 30px;border:2px solid ' + STYLE.player + ';border-radius:12px;background:' + STYLE.player + ';color:' + STYLE.bg + ';font:800 17px system-ui;cursor:pointer;box-shadow:0 0 14px ' + hexA(STYLE.player, 0.5), stage)   // 恢复原始紧凑居中尺寸(不拉满宽)
		btn.textContent = win ? '再来一局' : '再来一条蛇生'
		btn.onclick = function () { Bus.emit('ui:feedback', { kind: 'confirm', id: 'replay' }); var core = Registry.get('core'); if (core && core.resetRun) { core.resetRun() } }
		// 九项：图标 + 标签 + 数值 卡片行；整块=stage 宽度(与随身结语 euWrap 同宽,视觉一致)；三列固定→中列等列居中
		var rows = [
			[SCORE_ICON.seg, '此生长度', '长到 ' + GS.maxSegments + ' 节'],
			[SCORE_ICON.path, '走过的路', '抵达「' + (stageName !== '—' ? stageName : '前路') + '」'],
			[SCORE_ICON.kills, '斩获', '撞咬 ' + GS.kills + ' 次'],
			[SCORE_ICON.streak, '最高连杀', GS.killStreakMax + ' 连杀'],
			[SCORE_ICON.score, '割草得分', String(GS.score + GS.comboScore)],
			[SCORE_ICON.combo, '发现的羁绊', '羁绊 ' + comboCount + ' / 5'],
			[SCORE_ICON.verdict, '蛇生评语', verdict],
			[SCORE_ICON.highlight, '高光时刻', topComboLabel() ? ('Combo「' + topComboLabel() + '」') : '最朴素的一路'],
			[SCORE_ICON.lives, '第几条蛇生', '你的第 ' + runCount + ' 条蛇生']
		]
		var box = mk('div', 'margin-top:14px;width:100%;display:flex;flex-direction:column;gap:6px', stage)   // 整块=stage 宽(与随身结语同宽,不再压缩)
		for (var i = 0; i < rows.length; i++) {
			var card = mk('div', 'position:relative;box-sizing:border-box;width:100%;min-height:34px;padding:7px 14px;border-radius:10px;background:' + hexA(STYLE.panel, 0.35) + ';border:1px solid ' + hexA(STYLE.ui, 0.18) + ';border-left:3px solid ' + STYLE.ui, box)   // box-sizing:border-box→width:100% 含 padding/边框,消除右侧溢出(内嵌网页需往右拖的 bug)
			var ic = mk('span', 'position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:18px;line-height:1', card); ic.textContent = rows[i][0]   // 图标：绝对定位贴左、垂直居中(逐行平行对齐)
			var lab = mk('span', 'display:block;text-align:center;padding:0 44px;color:' + STYLE.textMain + ';font:600 14px system-ui', card); lab.textContent = rows[i][1]   // 标签：整卡满宽居中=与「再来一局」按钮同矢量居中(不再被右侧数值列挤偏)
			var val = mk('span', 'position:absolute;right:14px;top:50%;transform:translateY(-50%);max-width:168px;text-align:right;color:' + STYLE.textMain + ';font-weight:800;font:600 14px system-ui;white-space:normal', card); val.textContent = rows[i][2]   // 数值：绝对定位贴右、靠右、正常亮度、超宽换行禁截断
		}
		// 自动滚到评级/按钮(绕过较长结语与九项,免得 16" 全屏要下滚才看到按钮)
		try { if (stage.scrollTo) { stage.scrollTo({ top: Math.max(0, rbadge.offsetTop - 10), behavior: 'smooth' }) } else { stage.scrollTop = Math.max(0, rbadge.offsetTop - 10) } } catch (e) {}
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
		if (cb) { cb.onclick = function () { Bus.emit('ui:feedback', { kind: 'back', id: 'rotate_continue' }); finish() } }   // 兜底：竖屏也能继续，绝不卡死
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
			(function (c, idx) {
				var col = STYLE.skillFx[c.id] || STYLE.ui   // 读真源 skillFx[id]（守护力场=shield 薄荷绿、冰霜=ice 冰蓝，不撞色）
				var name = SKILL_LABEL[c.id] || c.id
				var desc = SKILL_DESC[c.id] || ''
				var lvlTxt = c.isNew ? '新技能' : ('升级 → Lv' + c.level)
				var card = mk('button', 'width:min(220px,78vw);padding:16px;border-radius:14px;border:2px solid ' + col + ';background:' + STYLE.panel + ';color:' + STYLE.textMain + ';cursor:pointer;font:600 clamp(14px,4vw,16px) system-ui;text-align:left;box-shadow:0 0 14px ' + hexA(col, 0.28), box)   // P0-3：skillFx 色图标 + 名 + 描述 + Lv 标记 + 1/2/3 提示；P1-8 发光
				card.innerHTML =
					'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
					+ '<span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:' + hexA(col, 0.18) + ';border:1.5px solid ' + col + ';color:' + col + ';font:800 18px system-ui">' + (SKILL_GLYPH[c.id] || '?') + '</span>'
					+ '<span style="font:700 18px system-ui;color:' + STYLE.textMain + '">' + name + '</span>'
					+ '</div>'
					+ '<div style="color:' + STYLE.textDim + ';font:500 13px/1.6 system-ui;min-height:42px">' + desc + '</div>'
					+ '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">'
					+ '<span style="padding:2px 10px;border-radius:999px;background:' + hexA(col, 0.16) + ';border:1px solid ' + col + ';color:' + col + ';font:700 12px system-ui">' + lvlTxt + '</span>'
					+ '<span style="padding:2px 10px;border-radius:8px;background:' + hexA(STYLE.ui, 0.12) + ';border:1px solid ' + hexA(STYLE.ui, 0.3) + ';color:' + STYLE.textDim + ';font:700 12px system-ui">按 ' + (idx + 1) + '</span>'
					+ '</div>'
				var cardIconSlot = card.querySelector('div > span')
				if (cardIconSlot) { cardIconSlot.outerHTML = iconMarkup(c.id, SKILL_GLYPH[c.id] || '?', 'card') }
				card.onclick = function () { Bus.emit('ui:feedback', { kind: 'press', id: 'skill_card' }); var s = Registry.get('skill'); if (s) { s.pick(c.id) } hideChoose() }
			})(choices[i], i)
		}
		// 键盘 1/2/3 选卡（与卡片底部提示一致）
		if (chooseKeyHandler) { global.removeEventListener('keydown', chooseKeyHandler); chooseKeyHandler = null }
		chooseKeyHandler = function (e) {
			var n = parseInt(e.key, 10)
			if (n >= 1 && n <= choices.length) { var cc = choices[n - 1]; var s = Registry.get('skill'); if (s && cc) { Bus.emit('ui:feedback', { kind: 'press', id: 'skill_card' }); s.pick(cc.id) } hideChoose() }
		}
		global.addEventListener('keydown', chooseKeyHandler)
		choose.style.display = 'flex'
	}
	function showChoose(choices) {
		if (isPortrait()) { showRotateChoice(function () { renderChooseCards(choices) }); return }
		renderChooseCards(choices)
	}
	function hideChoose() { if (choose) { choose.style.display = 'none' } if (chooseKeyHandler) { global.removeEventListener('keydown', chooseKeyHandler); chooseKeyHandler = null } hideRotateChoice() }
	function hideBuildInfo() {
		if (!buildInfoLayer) { return }
		buildInfoLayer.style.display = 'none'
		buildInfoLayer.setAttribute('aria-hidden', 'true')
	}
	function showBuildInfo(kind, id) {
		if (!buildInfoLayer || !buildInfoBox) { return }
		var owned = GS.ownedSkills || {}, title = '', icon = '', detail = ''
		if (kind === 'skill') {
			var level = owned[id] || 0, label = SKILL_LABEL[id] || id
			title = label
			icon = v1IconMarkup(id, SKILL_GLYPH[id] || '?', 'card')
			detail = level > 0 ? ('当前等级：Lv' + level + '\n状态：已获得') : '状态：尚未获得'
			if (SKILL_DESC[id]) { detail += '\n' + SKILL_DESC[id] }
		} else {
			var combo = CONFIG.COMBO && CONFIG.COMBO[id], parts = combo && combo.parts ? combo.parts : [], active = parts.length >= 2 && (owned[parts[0]] || 0) > 0 && (owned[parts[1]] || 0) > 0
			var comboName = COMBO_LABEL[id] || id, fallback = (SKILL_GLYPH[parts[0]] || '?') + '+' + (SKILL_GLYPH[parts[1]] || '?')
			title = comboName
			icon = v1IconMarkup(id, fallback, 'card')
			detail = active ? '状态：已激活' : '状态：未激活'
			if (parts.length >= 2) { detail += '\n构成：' + (SKILL_LABEL[parts[0]] || parts[0]) + ' + ' + (SKILL_LABEL[parts[1]] || parts[1]) }
		}
		buildInfoBox.innerHTML = '<h3>' + iconText(title) + '</h3><div class="ui-v1-build-info-card"><div class="ui-v1-info-icon">' + icon + '</div><div class="ui-v1-build-info-detail">' + iconText(detail) + '</div></div><button type="button" class="ui-v1-build-info-close">关闭</button>'
		var close = buildInfoBox.querySelector('.ui-v1-build-info-close')
		if (close) {
			close.onclick = function (e) { e.preventDefault(); e.stopPropagation(); hideBuildInfo() }
		}
		buildInfoLayer.setAttribute('aria-hidden', 'false')
		buildInfoLayer.style.display = 'flex'
	}
	function findBuildInfoTarget(node, rootNode, attr) {
		while (node && node !== rootNode) { if (node.getAttribute && node.getAttribute(attr)) { return node } node = node.parentNode }
		return null
	}

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
			Bus.emit('narrative:choice', { memory: opt.memory })
			GS.irreversibleChoices.push(opt.memory); tagLatest('choice')
			if (opt.seg && GS.segments < PLAYER.maxSegments) { for (var n = 0; n < opt.seg; n++) { Bus.emit('pickup:eat', { kind: 'narrative', id: -1, x: 0, y: 0 }) } }   // S2：叙事加节走独立 kind，豁免段 cap 仅受 maxSegments 硬顶（记忆 tag 上文已记，不受 cap 影响）
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
	function renderComboBadges() {                                   // P0-4：Combo 图标化——废除长句列表，改紧凑发光徽标，详情用 title 悬停，不铺长文(左上超框主因)
		var CO2 = CONFIG.COMBO, lv = GS.ownedSkills || {}, html = '', keys = CO2 ? Object.keys(CO2) : []
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i], c = CO2[key]
			if (!c || !c.parts || c.parts.length < 2) { continue }
			var a = c.parts[0], b = c.parts[1], aOwn = lv[a] > 0, bOwn = lv[b] > 0
			if (!aOwn && !bOwn) { continue }   // 一个都没持有：不显示
			var active = aOwn && bOwn
			var col = COMBO_COLOR[key] || STYLE.ui
			var gA = SKILL_GLYPH[a] || '?', gB = SKILL_GLYPH[b] || '?', name = COMBO_LABEL[key] || key
			var la = SKILL_LABEL[a] || a, lb = SKILL_LABEL[b] || b
			var title = active ? ('已激活：' + la + ' + ' + lb + ' → ' + name) : ('持有 ' + (aOwn ? la : lb) + '，再得 ' + (aOwn ? lb : la) + ' → ' + name)
			var glow = active ? ('box-shadow:0 0 8px ' + col) : ''
			var glyphCol = active ? col : hexA(STYLE.ui, 0.4)   // 未激活(仅持有其一,Combo 未成)：图标/文字置灰，明显区别于已激活高亮
			var nameCol = active ? col : hexA(STYLE.ui, 0.5)
			var comboIcon = UI_ICON_ASSETS[key] && UI_ICON_ASSETS[key].src ? iconMarkup(key, gA + '+' + gB, 'combo') : ''
			if (comboIcon) { gA = ''; gB = '' }
			html += '<span title="' + title + '" style="display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:9px;border:1px solid ' + hexA(col, active ? 0.85 : 0.3) + ';background:' + hexA(col, active ? 0.2 : 0.05) + ';' + glow + ';line-height:1;vertical-align:middle">' + comboIcon
				+ '<span style="color:' + glyphCol + ';font:800 12px system-ui">' + gA + '</span>'
				+ (comboIcon ? '' : '<span style="color:' + hexA(STYLE.ui, 0.45) + ';font:700 10px system-ui">+</span>')
				+ '<span style="color:' + glyphCol + ';font:800 12px system-ui">' + gB + '</span>'
				+ '<span style="display:inline-flex;align-items:center;color:' + nameCol + ';font:700 13px/1 system-ui;margin-left:1px;white-space:nowrap">' + (active ? name : '未激活') + '</span>'   // 未激活：仅「未激活」(短,与激活态长度一致)；激活：显 Combo 名
				+ '</span>'   // 仅当两部件皆持有(comboReady)才 active 高亮；单部件→灰色「未激活·X」
		}
		return html
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
			return '<span style="color:' + STYLE.enemy + ';font-weight:800">☠ ' + cur.name + '</span>'   // 去重：阶段名已是 Boss 期，不再叠 "BOSS 期"(P0-4①)
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
			var hudFrame = (UI_ICONS.framePx && UI_ICONS.framePx.hud) || 30
			var hudIcon = iconMarkup(id, g, 'hud')
			var slotStyle = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:' + hudFrame + 'px;height:' + hudFrame + 'px;border-radius:8px;background:' + hexA(col, 0.18) + ';border:2px solid ' + col + ';color:' + col + ';font:800 15px system-ui;flex:0 0 auto'
			if (lvl > 0) {
				html += '<span title="' + id + '" style="' + slotStyle + '"><span style="position:absolute;left:0;top:0;width:' + hudFrame + 'px;height:' + hudFrame + 'px;display:flex;align-items:center;justify-content:center">' + hudIcon + '</span><sub style="position:absolute;right:0;bottom:0;z-index:1;min-width:12px;height:12px;padding:0 2px;box-sizing:border-box;border-radius:6px;background:' + STYLE.panel + ';border:1px solid ' + col + ';color:' + col + ';font:800 9px/10px system-ui;text-align:center">' + lvl + '</sub></span>'
			} else {
				html += '<span title="' + id + '" style="display:inline-flex;align-items:center;justify-content:center;width:' + hudFrame + 'px;height:' + hudFrame + 'px;border-radius:8px;background:' + hexA(STYLE.panel, 0.5) + ';border:1px solid ' + hexA(STYLE.ui, 0.25) + ';color:' + hexA(STYLE.ui, 0.35) + ';font:800 15px system-ui;flex:0 0 auto">·</span>'
			}
		}
		return html
	}
	function v1IconMarkup(id, fallback, kind) {
		var spec = UI_ICON_ASSETS[id] || {}, scaleByKind = UI_ICONS.scaleByKind || {}, offset = (spec.offsetByKind && spec.offsetByKind[kind]) || {}
		var scale = (spec.scale != null ? spec.scale : (UI_ICONS.scale != null ? UI_ICONS.scale : 1)) * (scaleByKind[kind] != null ? scaleByKind[kind] : 1)
		var text = iconText(fallback)
		if (!spec.src) { return '<span class="ui-v1-icon-cell" style="font:800 15px system-ui">' + text + '</span>' }
		var src = iconText(spec.src)
		return '<span class="ui-v1-icon-cell"><img src="' + src + '" alt="" style="position:relative;left:' + ((offset.x || 0) * 100) + '%;top:' + ((offset.y || 0) * 100) + '%;transform:scale(' + scale + ')" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\'"><span style="display:none;align-items:center;justify-content:center;font:800 15px system-ui">' + text + '</span></span>'
	}
	function renderV1ComboBadges() {
		var CO2 = CONFIG.COMBO, lv = GS.ownedSkills || {}, html = '<span class="ui-v1-combo-title">COMBO</span>', keys = CO2 ? Object.keys(CO2) : [], skin = UI_HUD_SKIN.combo || {}, slots = skin.slots || []
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i], c = CO2[key]
			if (!c || !c.parts || c.parts.length < 2) { continue }
			var a = c.parts[0], b = c.parts[1], aOwn = lv[a] > 0, bOwn = lv[b] > 0
			var active = aOwn && bOwn, col = COMBO_COLOR[key] || STYLE.ui, name = COMBO_LABEL[key] || key
			var title = active ? ('已激活：' + (SKILL_LABEL[a] || a) + ' + ' + (SKILL_LABEL[b] || b) + ' → ' + name) : ('再获得 ' + (aOwn ? (SKILL_LABEL[b] || b) : (SKILL_LABEL[a] || a)) + ' 可激活')
			var fallback = (SKILL_GLYPH[a] || '?') + '+' + (SKILL_GLYPH[b] || '?')
			var pos = slots[i] || { x: (i + 1) / (keys.length + 1), y: 0.64 }, sw = skin.slotWidth || 0.22, sh = skin.slotHeight || 0.42
			html += '<span class="ui-v1-combo-item' + (active ? ' is-active' : '') + '" data-combo="' + key + '" role="button" tabindex="0" title="' + iconText(title) + '" style="--combo-color:' + col + ';--slot-x:' + (pos.x * 100) + '%;--slot-y:' + (pos.y * 100) + '%;--slot-width:' + (sw * 100) + '%;--slot-height:' + (sh * 100) + '%">' + v1IconMarkup(key, fallback, 'combo') + '<span class="ui-v1-combo-name">' + name + '</span></span>'
		}
		return html
	}
	function renderV1Wave() {
		var segs = STAGE.segments, t = GS.timeSec, cur = segs[0], next = null
		for (var k = 0; k < segs.length; k++) { if (t >= segs[k].startSec) { cur = segs[k]; next = segs[k + 1] || null } }
		var bossId = NARR.classify.deathCause.bossStageId, bossStage = null
		for (var b = 0; b < segs.length; b++) { if (segs[b].id === bossId) { bossStage = segs[b]; break } }
		if (bossStage && t >= bossStage.startSec - CONFIG.STAGE.bossWarnLeadSec && t < bossStage.startSec) { return { boss: true, html: '<div class="ui-v1-stage-content"><div class="ui-v1-stage-main"><strong>⚠ BOSS INCOMING</strong></div></div>' } }
		if (cur.id >= bossId) { return { boss: true, html: '<div class="ui-v1-stage-content"><div class="ui-v1-stage-main"><strong>☾ ' + cur.name + '</strong><span class="ui-v1-stage-time">' + fmtTime(t) + '</span></div></div>' } }
		var prog = next ? (t - cur.startSec) / (next.startSec - cur.startSec) : 1
		prog = Math.max(0, Math.min(1, prog))
		return { boss: false, html: '<div class="ui-v1-stage-content"><div class="ui-v1-stage-main"><strong>' + cur.name + '</strong><span class="ui-v1-stage-time">' + fmtTime(t) + '</span></div></div><span class="ui-v1-stage-track"><span class="ui-v1-stage-fill" style="width:' + Math.round(prog * 100) + '%"></span></span>' }
	}
	function renderV1Skills() {
		var list = CONFIG.SKILL.list, owned = GS.ownedSkills || {}, html = '', skin = UI_HUD_SKIN.skills || {}, slots = skin.slots || []
		for (var s = 0; s < list.length; s++) {
			var id = list[s], lvl = owned[id] || 0, g = SKILL_GLYPH[id] || '?', col = (STYLE.skillFx && STYLE.skillFx[id]) || STYLE.ui
			var pos = slots[s] || { x: (s + 1) / (list.length + 1), y: 0.51 }, sw = skin.slotWidth || 0.14, sh = skin.slotHeight || 0.54
			if (lvl > 0) {
				html += '<span class="ui-v1-skill" data-skill="' + id + '" role="button" tabindex="0" title="' + id + '" style="--skill-color:' + col + ';--slot-x:' + (pos.x * 100) + '%;--slot-y:' + (pos.y * 100) + '%;--slot-width:' + (sw * 100) + '%;--slot-height:' + (sh * 100) + '%">' + v1IconMarkup(id, g, 'hud') + '<sub class="ui-v1-level">' + lvl + '</sub></span>'
			} else {
				html += '<span class="ui-v1-skill is-empty" data-skill="' + id + '" role="button" tabindex="0" title="' + id + '" style="--skill-color:' + col + ';--slot-x:' + (pos.x * 100) + '%;--slot-y:' + (pos.y * 100) + '%;--slot-width:' + (sw * 100) + '%;--slot-height:' + (sh * 100) + '%"></span>'
			}
		}
		return html
	}
	function findActiveBoss() {
		var En = Registry.get('enemy'), list = En && En.list
		if (!list) { return null }
		for (var i = 0; i < list.length; i++) { if (list[i].active && list[i].type === 'boss') { return list[i] } }
		return null
	}
	function refreshV1Boss() {
		if (!hudBoss) { return }
		var boss = findActiveBoss()
		if (!boss || !boss.maxHp) { hudBoss.className = 'ui-v1-boss'; hudBoss.innerHTML = ''; return }
		var ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp)), inv = boss.invuln > 0
		hudBoss.className = 'ui-v1-boss is-active' + (inv ? ' is-invuln' : '')
		hudBoss.innerHTML = '<span class="ui-v1-boss-name">冠夜鸮</span><span class="ui-v1-boss-time">' + fmtTime(GS.timeSec) + '</span><span class="ui-v1-boss-phase">Phase ' + boss.phase + '</span><span class="ui-v1-boss-status">' + (inv ? '无敌' : '战斗') + '</span><div class="ui-v1-boss-track"><span class="ui-v1-boss-fill" style="width:' + (ratio * 100).toFixed(2) + '%"></span><span class="ui-v1-boss-hp-text" style="font-size:var(--boss-hp-text-size)">' + Math.ceil(boss.hp) + ' / ' + boss.maxHp + '</span></div>'
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
		hudLife.innerHTML = '<span class="ui-v1-life-content"><span class="ui-v1-life-hearts" aria-label="health">' + hearts + '</span><span class="ui-v1-life-count">' + GS.coreHp + '/' + PLAYER.coreHp + '</span></span>'
		var near = GS.coreHp <= 1   // 濒死(≤1 血)整框红脉冲
		if (near && !hudLife.classList.contains('ui-near-death')) { hudLife.classList.add('ui-near-death') }
		else if (!near && hudLife.classList.contains('ui-near-death')) { hudLife.classList.remove('ui-near-death') }
		var statSpec = UI_HUD_SKIN.stats || {}, statCols = statSpec.columns || [0.125, 0.375, 0.625, 0.875], statY = ((statSpec.centerY || 0.52) * 100) + '%'
		hudData.innerHTML = '<div class="ui-v1-stats-content">'
			+ '<span class="ui-v1-stat-cell" style="--stat-x:' + (statCols[0] * 100) + '%;--stat-y:' + statY + '">长度 ' + GS.segments + '</span>'
			+ '<span class="ui-v1-stat-cell" style="--stat-x:' + (statCols[1] * 100) + '%;--stat-y:' + statY + '">击杀 ' + GS.kills + '</span>'
			+ '<span class="ui-v1-stat-cell" style="--stat-x:' + (statCols[2] * 100) + '%;--stat-y:' + statY + '">得分 ' + (GS.score + GS.comboScore) + '</span>'
			+ '<span class="ui-v1-stat-cell" style="--stat-x:' + (statCols[3] * 100) + '%;--stat-y:' + statY + '">连杀 ×' + GS.killStreak + '</span>'
			+ '</div>'
		if (hudCombo) { hudCombo.innerHTML = renderV1ComboBadges() }
		var wave = renderV1Wave(); hudWave.innerHTML = wave.html; hudWave.className = 'ui-v1-stage' + (wave.boss ? ' is-boss' : '')
		hudSkills.innerHTML = renderV1Skills()
		refreshV1Boss()
		// CB 自检：HUD 状态簇零溢出(scrollWidth ≤ clientWidth)，破版即告警(供截图核验)
		if (hudLife && hudLife.scrollWidth > hudLife.clientWidth + 1) { Log.warn('[ui][CB] hudLife 溢出', hudLife.scrollWidth, hudLife.clientWidth) }
		if (hudData && hudData.scrollWidth > hudData.clientWidth + 1) { Log.warn('[ui][CB] hudData 溢出', hudData.scrollWidth, hudData.clientWidth) }
	}

	Bus.on('ui:tuning_changed', function () { applyUiTuning(); applyUiScale(); refreshHUD() })
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
		hideChoose(); hideBuildInfo(); if (choiceBox) { choiceBox.style.display = 'none' } if (result) { result.style.display = 'none'; result.innerHTML = '' }
		heartBreakUntil = 0; lostHeartIndex = -1; if (comboBanner) { comboBanner.style.display = 'none' }
	})

	// —— 移动端 HUD 等比缩放（必改1：每簇从各自屏角缩放，杜绝整体 top-left 内漂）——
	var _lastRootH = -1, _lastUiScale = -1
	function computeUiScale() {
		var h = root.getBoundingClientRect().height
		if (h === _lastRootH && _lastUiScale >= 0) { return _lastUiScale }   // 仅在画布显示高变化时重算，避免每帧样式抖动
		_lastRootH = h
		var designH = (CONFIG.GAME && CONFIG.GAME.logicalHeight) || 540   // 真实设计高度(画布逻辑分辨率)；HUD 与画布同缩放基准，非硬编码 900
		var clamp = { min: getUiTuning('layout.mobileScaleMin'), max: getUiTuning('layout.mobileScaleMax') }
		var s = (h > 0) ? h / designH : 1
		if (s < clamp.min) { s = clamp.min }   // 矮屏(高375→~0.69)压到 0.55 防溢出
		if (s > clamp.max) { s = clamp.max }
		s *= getUiTuning('layout.hudScale')
		_lastUiScale = s
		return s
	}
	function applyUiScale() {
		var s = computeUiScale()
		// 左上簇：top-left 缩放（右下延展，永不漂进画面）
		if (hudStatus) { hudStatus.style.transformOrigin = 'top left'; hudStatus.style.transform = 'scale(' + s + ')' }
		// 右上簇（系统按钮/技能栏/Combo）：top-right 缩放，保持贴右
		// 右上簇（系统按钮/技能栏/Combo）：桌面 top-right 缩放；移动端系统按钮已移左下(bottom-left)、combo 入右簇(row2)→top-right
		if (hudSys) { hudSys.style.transformOrigin = 'bottom left'; hudSys.style.transform = 'translate(var(--ui-system-local-x),var(--ui-system-local-y)) scale(' + (s * getUiTuning('system.buttonScale')) + ')' }
		if (hudBuild) { hudBuild.style.transformOrigin = 'top right'; hudBuild.style.transform = 'scale(' + s + ')' }
		// 顶部居中簇：中心缩放 + 保留 translateX(-50%) 居中
		if (hudCenter) { hudCenter.style.transformOrigin = 'top center'; hudCenter.style.transform = 'translateX(-50%) scale(' + s + ')' }
		if (comboBanner) { comboBanner.style.transformOrigin = 'top center'; comboBanner.style.transform = 'translateX(-50%) scale(' + s + ')' }
		// 底部居中抉择盒：bottom-center 缩放，保留居中并上移避让右下摇杆区
		if (choiceBox) { choiceBox.style.transformOrigin = 'bottom center'; choiceBox.style.transform = 'translateX(-50%) scale(' + s + ')' }
	}

	var UI = {
		init: init,
		update: function () {
			applyUiScale()   // 画布显示高变化(旋转/地址栏收起)→各簇按各自屏角等比缩放，互不漂移、不溢出
			var hn = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
			if (hn - _lastHudRefresh >= 100) { refreshHUD(); _lastHudRefresh = hn }   // ~10Hz 节流：分数/时间/蛇长慢变，10Hz 足够；消除每帧 innerHTML 重建的 DOM 重排回流（原每帧执行，未计入帧时间）
			if (pauseBtn) { pauseBtn.style.display = (GS.status === 'playing' || GS.status === 'paused') ? 'block' : 'none' }
			if (pauseOverlay) { pauseOverlay.style.display = (GS.status === 'paused') ? 'flex' : 'none' }
			// 四组胶囊仅 playing 时显示（暂停/死亡由遮罩层覆盖）
			if (hudLife) { hudLife.style.display = (GS.status === 'playing') ? 'flex' : 'none' }
			if (hudData) { hudData.style.display = (GS.status === 'playing') ? 'block' : 'none' }
			if (hudWave) { hudWave.style.display = (GS.status === 'playing' && !(hudBoss && hudBoss.classList.contains('is-active'))) ? 'block' : 'none' }
			if (hudBoss && GS.status !== 'playing') { hudBoss.className = 'ui-v1-boss'; hudBoss.innerHTML = '' }
			if (hudSkills) { hudSkills.style.display = (GS.status === 'playing') ? 'block' : 'none' }
			if (hudCombo) { hudCombo.style.display = (GS.status === 'playing') ? 'block' : 'none' }
			if (hudSys) { hudSys.style.display = (GS.status === 'playing' || GS.status === 'paused') ? 'flex' : 'none' }   // 系统按钮：游戏中/暂停可见（暂停时覆盖层在上方，暂停键仍可用）
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
