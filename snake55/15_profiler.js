;(function (global) {
	'use strict'
	var Log = global.Log, Registry = global.Registry
	var ring = []                 // 环形日志（最新在末尾）
	var MAXLINES = 80
	var lastEnemies = -1, dropping = false
	var panel = null, contentEl = null, panelOn = false
	var SAMPLE_SEC = 2            // 每 2s 采样一次
	var FPS_DROP = 40, FPS_RECOVER = 50, ENEMY_DELTA = 10

	function gs() { return global.GS }
	function rtVal(path, fb) {   // 读 GM 运行时覆盖（与 render/particle RT 同桥），无覆盖回退 fb
		var ed = Registry && Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}
	function getDiag() {
	var r = Registry && Registry.get('render')
	var d = (r && r.diag) ? r.diag() : { fps: 0, cpuMs: 0, frameMs: 0, overdraw: 0 }
	// overdraw 估算(px²)：单一真相源在 render.diag().overdraw（draw 每帧算好，tick 关火判定同源共用），此处直接读取，不再重复计算（修「单位错配/重复估算」）；画布 1600x900=1440k px²，≥~320k 即显著
	var ov = (d && typeof d.overdraw === 'number') ? d.overdraw : 0
	var p = Registry && Registry.get('particle')
	var en = Registry && Registry.get('enemy')
		var sk = Registry && Registry.get('skill')
		var G = gs()
		var cv = (global.document && global.document.getElementById('game-canvas'))
		var pt = global.PerfTier
		var fireSupp = (pt && pt.suppressFire) ? true : false   // 读自动关火态(perfFB 回退源与 render 一致)，日志可观测是否真关火
		var owned = (sk && sk.owned) ? sk.owned() : null
		var embersOn = fireSupp ? 'off(关火)' : (owned && owned.fire > 0 ? 'on' : 'off')   // 余烬指标反映真实抑制态（非仅"是否拥有火技能"）
		var flameOn = rtVal('PERF.suppressFireVisual', fireSupp ? 1 : 0) > 0 ? 'off(T3)' : 'on'
		// 可见敌数（镜头视口内，含 20px 余量；与 render.inView 同口径）：掉帧归因此值可判断是否"同屏实体过多"
		var vis = 0
		if (r && r.camera && en && en.list) {
			var cam = r.camera, _ws = (r.getWorldScale ? r.getWorldScale() : 1), hw = global.CONFIG.GAME.logicalWidth / 2 / _ws, hh = global.CONFIG.GAME.logicalHeight / 2 / _ws, m = 20   // worldScale 缩放后真实可见半幅=半宽/ws（与 render.inView 同口径，否则 0.8 下少算 1.25× 可见敌→掉帧归因失真）
			for (var i = 0; i < en.list.length; i++) { var e = en.list[i]; if (!e.active) { continue }; if (e.x > cam.x - hw - m && e.x < cam.x + hw + m && e.y > cam.y - hh - m && e.y < cam.y + hh + m) { vis++ } }
		}
		return {
			fps: d.fps, fpsMin: (d && typeof d.fpsMin === 'number') ? d.fpsMin : 0, cpuMs: d.cpuMs, frameMs: d.frameMs,
			presentGap: d.fps > 0 ? Math.max(0, 1000 / d.fps - d.cpuMs) : 0,   // 呈现gap=帧间隔(1000/fps)−主线程JS(cpuMs)；高 FPS≈vsync 空闲，掉帧时>0=JS 外等待(环境)，坐实"非代码"掉帧
			particles: (p && p.particles) ? p.particles.length : 0,
			texts: (p && p.texts) ? p.texts.length : 0,
			pmax: (global.CONFIG && global.CONFIG.PERF) ? global.CONFIG.PERF.maxParticles : 0,
			enemies: (en && en.countMobs) ? en.countMobs() : 0,
			chasing: (en && en.chasingCount) ? en.chasingCount() : 0,   // 段③ aggro 读数：当前追蛇实敌数（HUD「追蛇/总数」占比）
			visEnemies: vis,
			embers: embersOn,
			flame: flameOn,
			flash: (p && p.flashCores) ? p.flashCores.length : 0,   // b9+diag：白爆/闪核活跃数（瞬时 overdraw 尖峰主因）
			t1: rtVal('PERF.suppressWhiteBurst', 0) > 0 ? '关' : '开',   // T1 关白爆 overlay 开关态
			t3: rtVal('PERF.suppressFireVisual', fireSupp ? 1 : 0) > 0 ? '关' : '开',   // T3 关火焰系视觉开关态（回退源=自动关火态 fireSupp，与 render 一致）
			overlay: (d && d.overlay) ? 1 : 0,   // 受击全屏红 vignette 本帧激活（全屏 overdraw 尖峰）
			overdraw: ov,   // Σ πr² 估算（px²）；画布 1600x900=1440k，≥~300k 即显著
			drawCalls: (d && d.dc) ? (d.dc.fill + d.dc.stroke + d.dc.fillText + d.dc.drawImage + d.dc.fillRect) : 0,   // b9+diag：本帧绘制调用总数（fill/stroke/fillText/drawImage/fillRect）；GPU 前端开销≈调用数，非填充面积
			dcDetail: (d && d.dc) ? (d.dc.fill + '/' + d.dc.stroke + '/' + d.dc.fillText + '/' + d.dc.drawImage + '/' + d.dc.fillRect) : '-',   // 各类型明细 fill/stroke/fillText/drawImage/fillRect
			segments: G ? G.segments : 0,
			tier: (global.PerfTier ? global.PerfTier.tier : '-'),
			auto: (global.PerfTier ? global.PerfTier.auto : true),
			canvas: cv ? (cv.width + 'x' + cv.height) : '-'
		}
	}
	function push(line) {
		ring.push('[' + new Date().toLocaleTimeString() + '] ' + line)
		if (ring.length > MAXLINES) { ring.shift() }
		if (panelOn && contentEl) { contentEl.textContent = ring.join('\n') }
	}
	function sample() {
		var s = getDiag()
		push('FPS ' + s.fps + '/min' + s.fpsMin + ' | CPU ' + s.cpuMs.toFixed(1) + 'ms | 帧 ' + s.frameMs.toFixed(1) + 'ms | 外部 ' + s.presentGap.toFixed(1) + 'ms | 绘制 ' + s.drawCalls + '(' + s.dcDetail + ') | 粒子 ' + s.particles + '/' + s.pmax + ' | 白爆 ' + s.flash + ' | 全屏 ' + s.overlay + ' | 飘字 ' + s.texts + ' | 敌 ' + s.enemies + '(可见 ' + s.visEnemies + ') | 追蛇 ' + s.chasing + '/' + s.enemies + ' | 余烬 ' + s.embers + ' | 火焰 ' + s.flame + ' | T1 ' + s.t1 + ' | T3 ' + s.t3 + ' | 档 ' + s.tier + (s.auto ? '自动' : '固定') + ' | overdraw≈' + (s.overdraw / 1000 | 0) + 'k | 节 ' + s.segments + ' | 画布 ' + s.canvas)
		if (s.fps > 0 && s.fps < FPS_DROP && !dropping) { dropping = true; push('⚠ FPS 掉至 ' + s.fps + '(瞬时 min ' + s.fpsMin + ')（敌 ' + s.enemies + ' 可见 ' + s.visEnemies + ' 粒子 ' + s.particles + '/' + s.pmax + ' 白爆 ' + s.flash + ' 全屏 ' + s.overlay + ' 绘制 ' + s.drawCalls + ' 余烬 ' + s.embers + ' 火焰 ' + s.flame + ' overdraw≈' + (s.overdraw / 1000 | 0) + 'k CPU ' + s.cpuMs.toFixed(1) + 'ms）') }
		else if (dropping && s.fps >= FPS_RECOVER) { dropping = false; push('✓ FPS 恢复至 ' + s.fps) }
		if (lastEnemies >= 0 && Math.abs(s.enemies - lastEnemies) >= ENEMY_DELTA) { push('➤ 敌数 ' + lastEnemies + ' → ' + s.enemies) }
		lastEnemies = s.enemies
		// 采样后清零窗口内瞬时最低 FPS（与 render.resetFpsMin 配对），使下一窗口从干净起点重新计 min
		var r = Registry && Registry.get('render')
		if (r && r.resetFpsMin) { r.resetFpsMin() }
	}
	function legacyCopy(txt) {
		try {
			var ta = global.document.createElement('textarea'); ta.value = txt
			ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0'; ta.style.left = '0'
			global.document.body.appendChild(ta); ta.select(); global.document.execCommand('copy'); global.document.body.removeChild(ta)
			Log.info('[profiler] 性能日志已复制到剪贴板(legacy)')
		} catch (e) { Log.warn('[profiler] 复制失败，见控制台/面板') }
	}
	function copyText(txt) {
		if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
			global.navigator.clipboard.writeText(txt).catch(function () { legacyCopy(txt) })
		} else { legacyCopy(txt) }
	}
	function copyReport() {
		var txt = ring.join('\n')
		copyText(txt)
		try { console.log('==== 性能日志 ====\n' + txt + '\n================') } catch (e) {}   // 无剪贴板环境兜底（如 file://）
		return txt
	}
	function buildPanel() {
		if (panel) { return }
		panel = global.document.createElement('div')
		panel.style.cssText = 'position:fixed;right:8px;top:54px;width:440px;max-height:62vh;overflow:auto;background:rgba(8,10,20,0.92);color:#9fe;border:1px solid #2a3a5a;font:11px/1.45 monospace;padding:8px;z-index:30'
		var head = global.document.createElement('div')
		head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#cfe'
		var btn = global.document.createElement('button')
		btn.textContent = '复制日志'; btn.style.cssText = 'font:11px monospace;cursor:pointer;background:#1b2a44;color:#cfe;border:1px solid #3a5a8a;border-radius:4px;padding:2px 8px'
		btn.onclick = copyReport
		var title = global.document.createElement('span'); title.textContent = '性能日志（L 开关 · 复制见下方按钮/Profiler.copy()）'
		head.appendChild(title); head.appendChild(btn)
		contentEl = global.document.createElement('pre')
		contentEl.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-all'
		panel.appendChild(head); panel.appendChild(contentEl)
		panel.style.display = 'none'
		global.document.body.appendChild(panel)
	}
	function renderPanel() { if (contentEl) { contentEl.textContent = ring.join('\n') } }
	function init() {
		buildPanel()
		global.setInterval(sample, SAMPLE_SEC * 1000)
		global.addEventListener('keydown', function (e) {
			if (e.key === 'l' || e.key === 'L') {
				panelOn = !panelOn
				if (panel) { panel.style.display = panelOn ? 'block' : 'none'; renderPanel() }
			}
		})
		global.Profiler = { copy: copyReport, log: function () { return ring.join('\n') }, clear: function () { ring = [] } }
		Registry && Registry.register('profiler', { copy: copyReport })
		Log.info('profiler 就绪：每 ' + SAMPLE_SEC + 's 采样，`L` 开面板，面板「复制日志」或控制台 Profiler.copy() 取全文')
	}
	if (global.document) { if (global.document.readyState === 'loading') { global.document.addEventListener('DOMContentLoaded', init) } else { init() } }
	else { init() }
})(typeof window !== 'undefined' ? window : this)
