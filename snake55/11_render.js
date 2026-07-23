;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M
	var GAME = CONFIG.GAME, PLAYER = CONFIG.PLAYER, CAM = PLAYER.camera, COL = CONFIG.COLORS, SHK = CONFIG.COMBAT.shake

	var SNAKE_BODY = COL.snakeBody
	var SNAKE_HEAD = COL.snakeHead
	// 蛇头朝向/眼睛约定（纯渲染，零 gameplay）
	// 内部渲染约定：局部 +x = 世界前进方向（ctx.rotate(heading) 后局部 +x 指向移动方向）。
	// 美术按「朝上=前进」交付（契约 §七），故对 snake_head 精灵加具名 +90° 偏移使其 snout 对齐 +x；fallback 圆对称、不受影响。
	var ART_FORWARD_OFFSET_RAD = Math.PI / 2
	// 眼睛/舌头：忠实绘制 PNG（PNG 自带靠后眼睛 + 圆舌头 + 露嘴）；并在其上叠代码眼（PNG 无眼/眼不明显时保底，且保证"一定有眼睛"；比例按 headR，瞳孔朝局部 +x=前进）
	// 身体已回退为「逐节离散步圆」（drawBodyTube），不再用收颈连续管 → 删除旧 NECK_R_FRAC/NECK_ARC_FRAC 死常量
	var TELEGRAPH_BLINK_HZ = 8          // TODO: 冲锋怪蓄力闪红频率（候选 6 / 10）
	var TELEGRAPH_ARROW_LEN = 22        // TODO: 蓄力方向箭头长度 px（候选 18 / 28）
	var BOSS_WARN_PULSE_HZ = 6          // TODO: Boss 预警红边脉动频率（候选 4 / 8）
	var BOSS_WARN_BORDER_PX = 8         // TODO: Boss 预警红边宽度 px（候选 6 / 12）
	var HURT_VIGNETTE_SEC = 0.45        // TODO: 受击红闪 vignette 时长（候选 0.35 / 0.6）
	var FIRE_FLICKER_HZ = 12            // TODO: 火环跳动频率（候选 10 / 16）
	var SHIELD_GLOW_TRAIL = 0.18        // TODO: 护盾拖影角度占比（候选 0.12 / 0.25）
	var bossWarnUntil = 0
	var hurtVignetteUntil = 0

	var canvas = null, ctx = null, dpr = 1
	var worldScale = 1          // round6：视图缩放(0.8)已移除，还原 commit 无缩放原画面；worldScale 恒 1，碰撞/世界坐标不变，相机 1:1 跟随蛇身
	var cam = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 }
	var camPrev = { x: cam.x, y: cam.y }   // 相机上一模拟步位姿：每模拟步(GS.frame 变化)推进一次(updateCamera 用模拟头 h.x)，渲染按 _ra 在 camPrev→cam 间线性插值 → 与蛇头(lerp(px,x,_ra))共用同一 _ra、同匀速 → 相对静止、零抖；2026-07-23e 误改"每帧追 interpHead"使相机 followLerp 指数追每帧因 _ra 变化的插值头→相对滑动=移动糊，已回退
	var shakeMag = 0, shakeFrames = 0
	var trauma = 0   // ④-B 蒸汽引爆 trauma 通道（0..1）：与 impulse 通道叠加取大，封顶 maxComposite；时间窗内多次引爆不线性叠加
	// 任务2+❷：屏震分档节流 + 蒸汽齐爆帧末聚合状态
	var _traumaGateUntil = 0   // 节流窗口末（GS.timeSec）；窗口内同/低档请求丢弃
	var _traumaLastRank = 0    // 上次应用档位 rank（1=T1/2=T2/3=T3）
	var _steamThisFrame = 0    // 本帧 fx:steamblast 计数（帧末聚合→T1 一次，单体 T0 不震）
	var _lastSteamCount = 0    // HUD：上帧蒸汽齐爆数
	var _frameMs = 0           // HUD：本帧绘制耗时(ms)
	var _ra = 1                // 渲染插值系数（main 经 draw(alpha) 写入 = 剩余累计时间/固定步长）；消 fixed-step 无插值导致的头部一顿一顿
	var _lastFrame = -1        // 相机步检测：GS.frame 变化=进入新模拟步（相机推进一次并记 camPrev），渲染按 _ra 在 camPrev→cam 间线性插值
	var _cpuMs = 0            // HUD：整帧主线程 JS 耗时(ms)，由 main 经 setCpuMs 写入（含 step+draw+ui，不含 GPU 合成）
	var _fpsLast = 0, _fpsAcc = 0, _fpsFrames = 0, _fps = 0, _fpsMin = Infinity   // b9+diag：_fpsMin=当前采样窗口内瞬时最低 FPS（防短暂掉帧被平均吃掉，漏采见 2026-07-21 对话）
	// b9+diag：绘制调用计数器（包 ctx 方法自增；每帧 draw 首清零、末快照→diag 暴露；坐实"绘制调用数/状态切换"是否 GPU 瓶颈，零 gameplay）
	var _dc = { fill: 0, stroke: 0, fillText: 0, drawImage: 0, fillRect: 0, beginPath: 0, arc: 0 }
	var _lastDc = { fill: 0, stroke: 0, fillText: 0, drawImage: 0, fillRect: 0, beginPath: 0, arc: 0 }
	var _lastOv = 0           // overdraw 估算(px²)：统一由 render 计算，作为唯一真相源，profiler(tick 关火判定) 与 日志 共用（零重复计算/单位错配；画布 1600x900=1440k px²，≥~320k 即显著）
	// DIAG（window.__SNAKE_DIAG=true）：相机每帧屏幕位移直方图——直行匀速时若大量帧位移≈0(冻结) 与 突进帧交替，即固定步长相机节奏破缺导致的「嘚嘚嘚」stutter
	var _diagCam = { x: 0, y: 0, init: false, hist: {}, zero: 0, frames: 0, t: 0 }
	function diagCamTick(cx, cy) {
		if (!global.__SNAKE_DIAG) { return }
		if (!_diagCam.init) { _diagCam.x = cx; _diagCam.y = cy; _diagCam.init = true; return }
		var dx = cx - _diagCam.x, dy = cy - _diagCam.y, d = Math.sqrt(dx * dx + dy * dy)
		var b = d < 0.01 ? '0' : (d < 0.5 ? '<0.5' : (d < 1 ? '0.5-1' : (d < 2 ? '1-2' : '>=2')))
		_diagCam.hist[b] = (_diagCam.hist[b] || 0) + 1
		if (d < 0.01) { _diagCam.zero++ }
		_diagCam.frames++
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (now - _diagCam.t >= 1000) {
			console.log('[DIAG-R] 相机屏幕位移/帧 hist ' + JSON.stringify(_diagCam.hist) + ' 冻结(≈0)=' + _diagCam.zero + '/' + _diagCam.frames + '（冻结多=直行 stutter 来自相机不平顺）')
			_diagCam.hist = {}; _diagCam.zero = 0; _diagCam.frames = 0; _diagCam.t = now
		}
		_diagCam.x = cx; _diagCam.y = cy
	}
	var _diagHead = { x: 0, y: 0, init: false, hist: {}, zero: 0, frames: 0, t: 0 }
	function diagHeadTick(rcx, rcy) {   // DIAG：蛇头在屏幕上的每帧位移直方图；head_screen=(ih-rcx)*ws+中心，ih=与所画蛇头同源的插值头
		if (!global.__SNAKE_DIAG || GS.status !== 'playing') { return }
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var ih = interpHead(); if (!ih) { return }
		var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0)
		var sx = (ih.x - rcx) * ws + GAME.logicalWidth / 2
		var sy = (ih.y - rcy) * ws + GAME.logicalHeight / 2
		if (!_diagHead.init) { _diagHead.x = sx; _diagHead.y = sy; _diagHead.init = true; return }
		var dx = sx - _diagHead.x, dy = sy - _diagHead.y, d = Math.sqrt(dx * dx + dy * dy)
		var b = d < 0.01 ? '0' : (d < 0.5 ? '<0.5' : (d < 1 ? '0.5-1' : (d < 2 ? '1-2' : '>=2')))
		_diagHead.hist[b] = (_diagHead.hist[b] || 0) + 1
		if (d < 0.01) { _diagHead.zero++ }
		_diagHead.frames++
		var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
		if (now - _diagHead.t >= 1000) {
			console.log('[DIAG-HS] 蛇头屏幕位移/帧 hist ' + JSON.stringify(_diagHead.hist) + ' 冻结(≈0)=' + _diagHead.zero + '/' + _diagHead.frames + '（冻结/突变多=相机与蛇头不同步；均匀=同步 OK，残留抖属 worldScale 缩小 shimmer）')
			_diagHead.hist = {}; _diagHead.zero = 0; _diagHead.frames = 0; _diagHead.t = now
		}
		_diagHead.x = sx; _diagHead.y = sy
	}
	function wrapDc(c) {
		var names = ['fill', 'stroke', 'fillText', 'drawImage', 'fillRect', 'beginPath', 'arc']
		for (var _w = 0; _w < names.length; _w++) { (function (nm) { var o = c[nm]; if (typeof o === 'function') { c[nm] = function () { _dc[nm]++; return o.apply(c, arguments) } } })(names[_w]) }
	}
	function RT(path, fb) {    // 运行时标定桥（与 08_skill/05_particle 同步）：读 editor 覆盖，无覆盖回退冻结 CONFIG（仅显示/视觉用）
		var ed = Registry.get('editor')
		if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } }
		return fb
	}

	// —— 精灵子系统（#M0 美术管线基建，全落 render 分区，不新建 10_assets.js）——
	// 职责：manifest 登记精灵 → init 一次性预载（每帧不 new/decode）→ drawSprite 按判定半径算缩放接图；无图/404/NaN 一律回退代码画（零破功）。
	// 铁律：①判定半径只读不改（getSpriteRadius 仅从冻结 CONFIG/RT 读）；②缩放系数由判定半径算，禁魔法数字；③保留代码画 fallback，绝不白屏/抛错。
	var ASSETS_BASE = 'assets/'   // 相对 index.html（index.html 与 assets/ 同处 snake55/）→ 任意服务/打开方式（项目根/ snake55/ 根 / file://）均正确；原 'snake55/assets/' 会被拼成 …/snake55/snake55/assets/ 全 404（#M0 复查修）
	var SPRITE_MANIFEST = {
		// file=待放 PNG（当前 assets 为空 → 全部 404 → 永远走 fallback）；radiusKey 即 RT 的 path，也是 SPRITE_BASELINE 的 key
		// solidDiameterPx = 头部「实际内容直径」(PNG 像素)，缩放 = 渲染半径*2 / solidDiameterPx（视觉=渲染半径·与碰撞解耦）；2026-07-23 用 Python 离线量得 snake_head 内容宽 628px（整张 1024 含脖子 795，脖子底部宽 315≈头宽一半）→ 按 628 缩放使视觉头直径=2×渲染半径(26)；碰撞圈独立用 headRadius(14)；旧按整张 1024 会让头显小、被迫把 headRadius 拉到 27；body/tail 待接真图时同理量取填入
		snake_head: { file: 'snake_head.png', radiusKey: 'PLAYER.headRadiusRender', solidDiameterPx: 628, pivot: [0.5, 0.5] }
		// snake_body/snake_tail 已不用：身体改纯代码逐节圆(drawBodyTube) → 删除其 manifest 项消 404 控制台噪音；待接真图时再加回并量 solidDiameterPx
	}
	var _spriteCache = {}   // key → Image（init 一次性创建，每帧复用，绝不 new）
	// SPRITE_BASELINE：半径读取基线，key = manifest.radiusKey（RT 的 path），值 = 冻结 CONFIG 基线。
	// 读取时机：本文件在 03_core.deepFreeze(CONFIG) 之后才加载（index.html 顺序）→ PLAYER.headRadiusRender 此刻已是 config-override 注入后的冻结值 → 视觉只读 headRadiusRender（渲染半径），与碰撞 headRadius 解耦（视觉≥判定）。
	var SPRITE_BASELINE = {
		'PLAYER.headRadiusRender': PLAYER.headRadiusRender,
		'PLAYER.bodyRadius': PLAYER.bodyRadius
	}
	var MIN_SPRITE_R = 8   // 与 04_collision.MIN_JUDGE_R / 13_editor RANGE.playerRadius 最小对齐：视觉安全下限，避免 localStorage 残留过小半径导致蛇画得过小（判定已回退 14，视觉须同步抬高，否则「小蛇大判定」不一致）
	function getSpriteRadius(radiusKey) {   // 单一半径读取：RT 运行时覆盖优先，缺失回退冻结基线；守卫 r>0 防 NaN/消失；MIN_SPRITE_R 防残留小半径视觉过小
		var base = SPRITE_BASELINE[radiusKey]
		var r = RT(radiusKey, base)   // 既有 RT 桥：有 runtime 覆盖取覆盖，否则回退 base
		var v = (typeof r === 'number' && r > 0) ? r : base
		return (v && v < MIN_SPRITE_R) ? MIN_SPRITE_R : v
	}
	function preloadSprites() {   // init 末尾一次性调用：每个 manifest 项创建一张 Image，onload→ready / onerror→failed；幂等（init 重入不重复 new）
		for (var key in SPRITE_MANIFEST) {
			if (!SPRITE_MANIFEST.hasOwnProperty(key)) { continue }
			if (_spriteCache[key]) { continue }   // 已建过（防 init 重入重复 new/发请求）
			var entry = SPRITE_MANIFEST[key]
			var img = new Image()
			var rec = { img: img, ready: false, failed: false }
			img.onload = (function (r) { return function () { r.ready = true } })(rec)   // 加载成功 → 标记 ready，drawSprite 才接图
			img.onerror = (function (r) { return function () { r.failed = true } })(rec)  // 404/损坏 → 标记 failed，drawSprite 永久走 fallback（永不重试）
			img.src = ASSETS_BASE + entry.file
			_spriteCache[key] = rec
		}
	}
	// 头 PNG 预渲染到「显示分辨率」离屏 canvas：仅半径(r)变化才重绘；每帧 drawSprite 只 1:1 平移+旋转该离屏图，消除「1024 大图每帧缩放+子像素重采样」导致的位图爬行/shimmer（矢量身体圆无此问题、故仅头显顿挫）
	var _spriteOff = {}
	function getSpriteOff(key, r) {
		var o = _spriteOff[key]
		if (o && o.r === r) { return o }
		var c = _spriteCache[key]
		if (!c || !c.ready || !c.img) { return null }
		var entry = SPRITE_MANIFEST[key]
		var sd = (entry.solidDiameterPx > 0) ? entry.solidDiameterPx : (c.img.naturalWidth || 1)
		var dispCss = r * 2
		var dispPx = Math.max(1, Math.round(dispCss * (global.devicePixelRatio || 1)))
		var cv = document.createElement('canvas'); cv.width = dispPx; cv.height = dispPx
		var g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
		g.drawImage(c.img, 0, 0, dispPx, dispPx)   // 整张 PNG 一次性缩到显示分辨率（内容直径=dispCss，pivot 居中）
		o = { r: r, canvas: cv, sizeCss: dispCss }; _spriteOff[key] = o
		return o
	}
	// 返回 true=已用图绘制；false=未就绪/不可用 → 调用方须 fallback 代码画。绝不抛错、绝不在函数内 new Image/发请求、绝不留半截 NaN 进 drawImage。
	// 硬短路：任何 ctx.save/translate/rotate 之前就判 failed/未 ready → 直接 return，不给每段蛇身白套一层变换开销。
	function drawSprite(ctx, key, x, y, angle) {
		var c = _spriteCache[key]
		if (!c || c.failed || !c.ready) { return false }   // 空 assets 恒走此（failed 标记后永不重试）→ fallback
		var entry = SPRITE_MANIFEST[key]
		var r = getSpriteRadius(entry.radiusKey)              // >0 保证（守卫在 getSpriteRadius）
		var img = c.img, nw = img.naturalWidth, nh = img.naturalHeight
		if (!(nw > 0 && nh > 0)) { return false }             // 兜底：naturalWidth=0（损坏）不进 drawImage
		var sd = (entry.solidDiameterPx > 0) ? entry.solidDiameterPx : nw   // 缩放基准：优先用「头部实际内容直径」(离线量取)，缺省回落整张 nw
		var scale = (r > 0) ? (r * 2 / sd) : 0   // 按内容直径缩放：视觉头 = 2r（看到=打到），不再被 PNG 透明留白/整张尺寸带偏（#M1 修正）
		if (!(scale > 0)) { return false }                    // !(scale>0) 同时兜住 NaN/0/负 → 永不进 drawImage
		ctx.save()
		ctx.translate(x, y)
		ctx.rotate(angle || 0)
		var off = getSpriteOff(key, r)                          // 预渲染离屏（显示分辨率）→ 每帧只 1:1 平移+旋转，消位图爬行/shimmer
		if (off) {
			ctx.drawImage(off.canvas, -off.sizeCss / 2, -off.sizeCss / 2, off.sizeCss, off.sizeCss)
		} else {
			ctx.scale(scale, scale)                            // 退化：直接用原图（首帧未就绪等）
			ctx.drawImage(img, -entry.pivot[0] * nw, -entry.pivot[1] * nh)
		}
		ctx.restore()
		return true
	}
	function perfFB(field, def) { return (global.PerfTier && global.PerfTier[field] != null) ? global.PerfTier[field] : def }   // 自适应分级：RT 回退源改读 PerfTier 当前档（GM 经 editor.rtSet 仍优先，零双份真相源）

	// 任务2：屏震分档节流（真源 §2.2.1「严禁单一强度轰炸·防脱敏」）
	//   rank: 1=T1 light / 2=T2 process / 3=T3 crit·death；gate 来自 SHK.gateSec
	//   规则：间隔内同档或更低档丢弃；高档可越级覆盖（如 crit 覆盖 light）
	function addTrauma(rank, s) {
		if (GS.timeSec < _traumaGateUntil && rank <= _traumaLastRank) { return }
		if (s && s.px) { trauma = Math.min(1, trauma + s.px / SHK.maxComposite) }
		_traumaLastRank = rank
		_traumaGateUntil = GS.timeSec + (SHK.gateSec[rank] || 0.5)
	}

	function init(canvasEl) { canvas = canvasEl; ctx = canvas.getContext('2d'); wrapDc(ctx); resize(); preloadSprites() }   // b9+diag：包装 ctx 计数绘制调用；#M0 一次性预载精灵（每帧不 new/decode，空 assets→全 404→永远走 fallback）
	function resize() {
		if (!canvas) { return }
		var dprMon = Math.min(global.devicePixelRatio || 1, 3)   // 设备像素比上限 3（retina 手机 dpr=3：用足原生像素→文字/画面清晰；桌面 dpr 通常≤2 不受此影响；填充率上升由 PerfTier 看门狗兜底）
		var scale = Math.min(global.innerWidth / GAME.logicalWidth, global.innerHeight / GAME.logicalHeight)   // contain 等比：窗口内最大化、16:9 不裁切、比例不符留 letterbox（#game-wrap flex 居中）；禁用 cover 裁切边缘 HUD
		if (!(scale > 0)) { return }   // 窗口极小/最小化瞬间 scale 可能为 0 → 跳过，避免 backing 0 尺寸退化（恢复后真实 resize 重算；治"缩小再打开"偶发 0 尺寸帧）
		dpr = dprMon * scale   // 合成缩放：逻辑坐标 → 设备像素（HUD/世界文字 1:1 清晰，不再 2x 上采样糊字）
		// 🟡 性能护栏：backing 宽封顶 MAX_BACK_W，避免大屏/retina 下 dpr 乘积失控→每帧光栅(∝分辨率²)拖帧（fire 墙/冰池/粒子每帧绘制成本随 backing 放大）
		var MAX_BACK_W = RT('RENDER.maxBackW', perfFB('maxBackW', 2560))   // 自适应分级：回退源=PerfTier.maxBackW（HIGH 默认 2560，消 1600 封顶拉伸导致的直行 shimmer）；GM 经 editor.rtSet 仍优先
		if (GAME.logicalWidth * dpr > MAX_BACK_W) { dpr = MAX_BACK_W / GAME.logicalWidth }
		canvas.width = Math.round(GAME.logicalWidth * dpr)   // backing 宽 ≤ MAX_BACK_W（= CSS 显示尺寸 × 设备像素比，仍清晰，但封顶控 fill 成本）
		canvas.height = Math.round(GAME.logicalHeight * dpr)
		canvas.style.width = (GAME.logicalWidth * scale) + 'px'
		canvas.style.height = (GAME.logicalHeight * scale) + 'px'
		// 同步 #stage 尺寸 = canvas 显示尺寸（contain 居中后的实际区域），使 #ui-stage 角标精确贴游戏框（治暂停按钮掉黑边外）
		var st = global.document && global.document.getElementById('stage')
		if (st) { st.style.width = canvas.style.width; st.style.height = canvas.style.height }
	}

	function interpHead() {   // 渲染插值后的蛇头位姿（与 drawSnake 同源）：相机跟随此基准 → 相机与所画蛇头用同一位置，直行时头相对相机恒定、无逐帧 bob（根因：旧相机跟模拟头 h.x、蛇头画插值位姿，两基准差随 _ra 周期振荡≈followLerp*(lookAhead+步长)≈7px → 直行抖、绕圈顺）
		var s = Registry.get('snake'); if (!s || !s.head) { return null }
		var h = s.head, x = h.x, y = h.y, a = h.angle || 0
		if (GS.status === 'playing' && h.px != null) { x = M.lerp(h.px, h.x, _ra); y = M.lerp(h.py, h.y, _ra); a = lerpAngle(h.pangle, h.angle || 0, _ra) }
		return { x: x, y: y, ang: a }
	}
	function updateCamera() {   // 每模拟步(GS.frame 变化)调用一次：用模拟头 h.x/h.angle 推进相机目标；渲染再按 _ra 在 camPrev→cam 间线性插值 → 与蛇头(lerp(px,x,_ra))同源同步、相对静止
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head
		var tx = h.x + Math.cos(h.angle || 0) * CAM.lookAhead, ty = h.y + Math.sin(h.angle || 0) * CAM.lookAhead
		var dx = tx - cam.x, dy = ty - cam.y, d = Math.sqrt(dx * dx + dy * dy)
		if (d > CAM.deadZone) { cam.x += dx * CAM.followLerp; cam.y += dy * CAM.followLerp }
		var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0)
		var halfW = GAME.logicalWidth / 2 / ws, halfH = GAME.logicalHeight / 2 / ws   // 缩放后可见半幅=半宽/worldScale（ws<1 时看得更广→clamp 边界更宽，避免视图越出世界）；ws=1 退化为原值
		cam.x = M.clamp(cam.x, halfW, GAME.worldWidth - halfW)
		cam.y = M.clamp(cam.y, halfH, GAME.worldHeight - halfH)
	}

	function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, M.PI2); ctx.fillStyle = color; ctx.fill() }

	function drawBounds() { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, GAME.worldWidth, GAME.worldHeight) }
	function drawPickups() {
		var pk = Registry.get('pickup'); if (!pk || !pk.foods) { return }
		var f = pk.foods
		for (var i = 0; i < f.length; i++) {
			var o = f[i]; if (!o.active) { continue }
			if (o.kind === 'skill') {                                  // 技能食物：发光 + 呼吸脉冲 + 星标 + 头顶「!」
				var pulse = 0.5 + 0.5 * Math.sin(GS.timeSec * 6)
				ctx.globalAlpha = 0.22 + pulse * 0.22
				ctx.beginPath(); ctx.arc(o.x, o.y, o.radius + 6 + pulse * 4, 0, M.PI2); ctx.fillStyle = COL.skillDrop; ctx.fill()
				ctx.globalAlpha = 1
				circle(o.x, o.y, o.radius, COL.skillDrop)
				drawStar(o.x, o.y, o.radius + 2)
				ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'
				ctx.fillText('!', o.x, o.y - o.radius - 6)
			} else {                                                   // 普通/回血：素色无光
				var c = o.kind === 'heal' ? COL.heal : COL.food
				circle(o.x, o.y, o.radius, c)
			}
		}
	}
	function drawStar(x, y, r) {                                       // 技能食物星标（四角星芒）
		ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9
		ctx.beginPath()
		for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
		ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1
	}
	function drawEnemies() {
		var En = Registry.get('enemy'); if (!En || !En.list) { return }
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉；GM 经 editor.rtSet 仍优先
		var l = En.list
		// 第一遍：普通本体按色批量 fill（同色假人 → 1 次 fill）；远敌不再视口剔除 → 回视/冲堆不 pop-in（灭"加载感"）；GPU 自动裁剪视口外几何，1 path 成本极低
		var byColor = {}
		for (var i = 0; i < l.length; i++) {
			var e = l[i]; if (!e.active) { continue }
			if (e.flashT > 0) { circle(_ix(e), _iy(e), e.radius, COL.damageText); continue }   // ⑥ 受击闪白（白，插值位姿消 165Hz 跳）
		if (e.type === 'charger' && e.state === 'windup') {                          // ⑤ 冲锋怪蓄力 telegraph：闪红 + 方向箭头（插值位姿，消 165Hz 跳）
			var blink = (Math.floor(GS.timeSec * TELEGRAPH_BLINK_HZ) % 2 === 0)
			circle(_ix(e), _iy(e), e.radius, blink ? COL.enemyChaser : e.color)
			drawChargeArrow(e); continue
		}
			var bc = e.color
			if (!byColor[bc]) { byColor[bc] = [] }
			byColor[bc].push(e)
		}
		for (var col in byColor) {
			var arr = byColor[col]
			ctx.beginPath()
			for (var j = 0; j < arr.length; j++) { var ee = arr[j]; var _ex = _ix(ee), _ey = _iy(ee); ctx.moveTo(_ex + ee.radius, _ey); ctx.arc(_ex, _ey, ee.radius, 0, M.PI2) }
			ctx.fillStyle = col; ctx.fill()
		}
		// 第二遍：标记 + 血条（弱省，单敌少量，保留原逻辑；白闪/telegraph 已在首遍画过，跳过以免重画）
		for (var k = 0; k < l.length; k++) {
			var e2 = l[k]; if (!e2.active) { continue }
			if (!inView(e2.x, e2.y, e2.radius)) { continue }
			if (e2.flashT > 0) { continue }
			if (e2.type === 'charger' && e2.state === 'windup') { continue }
			if (e2.burnT > 0 && !T3) { drawBurnMark(e2) }       // ⑦ 燃烧标记：红脉动环 + 火苗（T3 关火焰系 per-enemy 视觉时跳过，零 gameplay）
			if (e2.slowT > 0 && !T3) { drawSlowMark(e2) }       // 冰冻/减速标记：蓝染环 + 冰晶（T3 一并关，零 gameplay）
			if (e2.type !== 'bossBullet' && e2.type !== 'boss') { drawHpBar(e2, _ix(e2), _iy(e2)) }   // 小怪血条+数值（boss 用屏幕顶部大血条，bossBullet 不显示）
		}
	}
	function inView(x, y, r) {                                        // 世界点是否在镜头视口内（含半径余量；worldScale 缩放后真实可见半幅=半宽/worldScale）
		var hw = GAME.logicalWidth / 2 / worldScale, hh = GAME.logicalHeight / 2 / worldScale, m = (r || 0) + 20
		return x > cam.x - hw - m && x < cam.x + hw + m && y > cam.y - hh - m && y < cam.y + hh + m
	}
	function drawHpBar(e, ix, iy) {                                    // 小怪世界血条（插值版 ix/iy；剔除仍读真实 e.x/e.y）
		if (ix == null) { ix = e.x } if (iy == null) { iy = e.y }
		if (!e.maxHp || e.hp >= e.maxHp) { return }                   // 满血不画（省恒定 draw 成本）
		if (!inView(e.x, e.y, e.radius)) { return }                  // 视口外不画
		var ratio = M.clamp(e.hp / e.maxHp, 0, 1)
		var w = Math.max(e.radius * 2, 16), hgt = 3
		var bx = ix - w / 2, by = iy - e.radius - 9
		ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, w, hgt)
		ctx.fillStyle = ratio > 0.5 ? '#7CFC00' : (ratio > 0.25 ? '#ffd166' : '#ff5a5a')
		ctx.fillRect(bx, by, w * ratio, hgt)
		if (e.type === 'elite') {                                     // 数字仅精英（Boss 用顶部大血条）；普通小怪纯条，去掉每怪一次 fillText
			ctx.fillStyle = '#fff'; ctx.font = '600 9px monospace'; ctx.textAlign = 'center'
			ctx.fillText(Math.ceil(e.hp) + '/' + e.maxHp, ix, by - 2)
		}
	}
function drawBurnMark(e) {                                        // ⑦ 燃烧可见：红脉动环 + 头顶火苗（插值位姿消 165Hz 跳）
	var _ex = _ix(e), _ey = _iy(e)
	var pulse = 0.5 + 0.5 * Math.sin(GS.timeSec * 18)
	ctx.globalAlpha = 0.35 + pulse * 0.3
	ctx.beginPath(); ctx.arc(_ex, _ey, e.radius + 3, 0, M.PI2); ctx.strokeStyle = '#ff5a2c'; ctx.lineWidth = 2; ctx.stroke()
	ctx.globalAlpha = 1; ctx.fillStyle = '#ff8a3c'
	var fy = _ey - e.radius - 6 - pulse * 3
	ctx.beginPath(); ctx.moveTo(_ex, fy - 6); ctx.lineTo(_ex - 4, fy + 2); ctx.lineTo(_ex + 4, fy + 2); ctx.closePath(); ctx.fill()
}
function drawSlowMark(e) {                                        // 冰冻/减速可见：蓝染环 + 头顶冰晶（插值位姿消 165Hz 跳）
	var _ex = _ix(e), _ey = _iy(e)
	ctx.globalAlpha = 0.4
	ctx.beginPath(); ctx.arc(_ex, _ey, e.radius + 2, 0, M.PI2); ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1.5; ctx.stroke()
	ctx.globalAlpha = 0.9; ctx.fillStyle = '#dff3ff'
	var cy = _ey - e.radius - 6
	ctx.beginPath()
	for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; var px = _ex + Math.cos(a) * 4, py = cy + Math.sin(a) * 4; if (k === 0) { ctx.moveTo(px, py) } else { ctx.lineTo(px, py) } }
	ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
}
function drawChargeArrow(e) {
	var _ex = _ix(e), _ey = _iy(e)
	var len = e.radius + TELEGRAPH_ARROW_LEN, a = e.angle
	var tx = _ex + Math.cos(a) * len, ty = _ey + Math.sin(a) * len
	ctx.strokeStyle = COL.enemyChaser; ctx.lineWidth = 3
	ctx.beginPath(); ctx.moveTo(_ex, _ey); ctx.lineTo(tx, ty); ctx.stroke()
		var ah = 7
		ctx.beginPath(); ctx.moveTo(tx, ty)
		ctx.lineTo(tx - Math.cos(a - 0.5) * ah, ty - Math.sin(a - 0.5) * ah)
		ctx.lineTo(tx - Math.cos(a + 0.5) * ah, ty - Math.sin(a + 0.5) * ah)
		ctx.closePath(); ctx.fillStyle = COL.enemyChaser; ctx.fill()
	}
	// 最短弧角插值（渲染插值用）：返回 a→b 在 t∈[0,1] 间无回绕跳变的角度
	function lerpAngle(a, b, t) {
		var d = (b - a) % M.PI2
		if (d > Math.PI) { d -= M.PI2 } else if (d < -Math.PI) { d += M.PI2 }
		return a + d * t
	}
	// 渲染插值（CAM-STUTTER 修复·方案A）：任意带 prevX/prevY 扁平字段的实体，按同一 _ra（已 clamp[0,1]）在「上一步→当前步」间插值。判定位移/碰撞逻辑只读真实 x/y，不碰
	function _ix(o) { return (o.prevX != null) ? M.lerp(o.prevX, o.x, _ra) : o.x }
	function _iy(o) { return (o.prevY != null) ? M.lerp(o.prevY, o.y, _ra) : o.y }
	// 双眼/瞳孔：PNG 之上叠代码眼（PNG 自带眼/无眼都叠一层保证可见；瞳孔朝局部 +x=前进；全比例禁裸像素）
	// 身体：逐节离散步圆（与改动前一致、干净不丑）；各节 prev→cur 插值 → 165Hz 平滑（消身体一顿一顿）；颈缝=圆身(r≈12)略宽于 PNG 自带脖子(~7)，由头图盖住前段，与「改前」视觉一致
	function drawBodyTube(pts, headR, bodyR) {
		for (var i = 0; i < pts.length; i++) { circle(pts[i].x, pts[i].y, bodyR, SNAKE_BODY) }   // 从蛇头中心(0)起逐节圆：头下身体连续、消头颈缝断节（头图随后盖中心）
	}
	function drawSnake() {
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var segs = s.segments || []
		// 半径走 getSpriteRadius() 单一源（与精灵路径同经冻结 CONFIG）：渲染半径=headRadiusRender，与碰撞 headRadius 解耦（视觉≥判定，宁小勿大防冤死）
		var headR = getSpriteRadius('PLAYER.headRadiusRender')
		var bodyR = getSpriteRadius('PLAYER.bodyRadius')
		// 插值中心线（head + 各节 prev→cur 插值）：整条蛇平滑，消 fixed-step 无插值导致的身体一顿一顿（与头部同源，165Hz 不再逐帧跳）
		var h = s.head
		var _ih = interpHead()   // 与相机同源插值基准：所画蛇头位姿 == 相机跟随目标，直行无 bob
		var hx = _ih.x, hy = _ih.y, hAng = _ih.ang
		var pts = [{ x: hx, y: hy }]
		for (var _i = 1; _i < segs.length; _i++) {
			var _g = segs[_i], _ix = _g.x, _iy = _g.y
			if (GS.status === 'playing' && _g.px != null) { _ix = M.lerp(_g.px, _g.x, _ra); _iy = M.lerp(_g.py, _g.y, _ra) }
			pts.push({ x: _ix, y: _iy })
		}
		drawBodyTube(pts, headR, bodyR)                 // 先画身体管（头/脖子图随后盖前段）
		// 蛇头：旋转坐标系内画 PNG 头（具名 +90° 偏移对齐「朝上」）+ 叠代码眼（PNG 无眼时保底、且保证"有眼睛"）
		var inv = GS.invincibleUntil > GS.timeSec
		var blink = inv && (Math.floor(GS.timeSec * 16) % 2 === 0)
		ctx.save()
		ctx.translate(hx, hy)
		ctx.rotate(hAng)
		if (blink) { ctx.globalAlpha = 0.35 }  // 无敌帧：整头闪（含眼，忠实原图不挤压）
		// 忠实绘制 PNG（加 ART_FORWARD_OFFSET_RAD 使「朝上」图 snout 指向 +x=前进）；fallback 圆对称无影响
		if (!drawSprite(ctx, 'snake_head', 0, 0, ART_FORWARD_OFFSET_RAD)) {
			circle(0, 0, headR, GS.coreHp <= 1 ? COL.enemyChaser : SNAKE_HEAD)
		}
		// 代码眼睛（PNG 自带眼/无眼都叠一层，保证可见；局部 +x=前进，瞳孔朝前=朝向移动方向；全部按 headR 比例，零裸像素）
		var EYE_DX = headR * 0.18, EYE_DY = headR * 0.42, EYE_R = headR * 0.22, PUPIL_R = headR * 0.11, PUPIL_FWD = headR * 0.08
		for (var _ei = -1; _ei <= 1; _ei += 2) {
			var _ex = EYE_DX, _ey = EYE_DY * _ei
			circle(_ex, _ey, EYE_R, '#f7f7fa')                 // 眼白
			circle(_ex + PUPIL_FWD, _ey, PUPIL_R, '#0a0a0f')   // 瞳孔朝前
		}
		ctx.restore(); ctx.globalAlpha = 1
		if (inv) {                                                   // 无敌光环（白闪脉动）
			var ha = 0.3 + 0.3 * Math.sin(GS.timeSec * 16)
			ctx.globalAlpha = ha; ctx.beginPath(); ctx.arc(hx, hy, headR + 6, 0, M.PI2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1
		}
	}
	function drawSkillAura() {
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉（含蛇身火墙）；GM 经 editor.rtSet 仍优先
		var T4 = RT('PERF.suppressIceFill', perfFB('suppressIceFill', false) ? 1 : 0) > 0   // 自适应分级：POTATO 档冰池只描边；GM 经 editor.rtSet 仍优先
		var h = s.head, owned = sk.owned(), SKC = CONFIG.SKILL
	var _ihA = interpHead() || h   // 护盾光球绕「插值头」公转（与所画蛇头同源），消 165Hz 光球相对头错位跳
		function RTA(path, fb) { var ed = Registry.get('editor'); if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } } return fb }   // B-GM 标定：绘制读运行时覆盖，无覆盖回退冻结 CONFIG（与 08_skill RT() 同步，仅换视觉输入来源，几何算法不动）
		var segs = s.segments || []
		var flick = 0.7 + 0.3 * Math.sin(GS.timeSec * FIRE_FLICKER_HZ)   // 火跳动
		ctx.save()
		// —— 火：沿整条蛇身成火墙（与 tickFire 同 segStep 采样；视觉=判定）——
		if (owned.fire > 0 && !T3) {   // b9-diag T3：关火焰光环（仅视觉，零 gameplay；伤害结算照常）
			var fi = owned.fire - 1, fr = RTA('SKILL.fire.radius.' + fi, SKC.fire.radius[fi]), stepF = SKC.fire.segStep[fi] || 1
			// 火墙=沿蛇身的连续火管：单 path + 2 stroke 替代「每节点 arc+stroke+fill」(50 节=50 独立填充 pass 的 overdraw 主因)；纯渲染优化，几何/伤害判定不动
			ctx.beginPath()
			for (var sf = 0; sf < segs.length; sf += stepF) {
				var sg = segs[sf]
				var sgx = (sg.px != null) ? M.lerp(sg.px, sg.x, _ra) : sg.x, sgy = (sg.py != null) ? M.lerp(sg.py, sg.y, _ra) : sg.y   // 火墙贴插值蛇身（段 px/py 同 _ra），消 165Hz 火墙跳
				if (sf === 0) { ctx.moveTo(sgx, sgy) } else { ctx.lineTo(sgx, sgy) }
			}
			ctx.lineCap = 'round'; ctx.lineJoin = 'round'
		ctx.lineWidth = fr * 2; ctx.strokeStyle = 'rgba(255,90,0,' + (0.30 * flick).toFixed(2) + ')'; ctx.stroke()   // 软火带：宽 fr*2 / alpha 0.30（round6 稳定版；火墙为整条蛇身火管+沿身橙黄余烬，无"怪异蛇身细线"）
		ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,150,40,' + (0.72 * flick).toFixed(2) + ')'; ctx.stroke()   // 热边：加粗+提亮，整条蛇身火墙清晰可读（0.5→0.72 / 宽4→5，比 commit 更醒目）
		// （删除旧"14 火舌绕蛇头一圈"：第二轮"只围头部"回归遗留，被用户判为"蛇头外围怪异环绕粒子"；火墙表现改由蛇身火管+05_particle 沿身余烬承担，见 spawnFireEmbers）
	}
		// —— 护盾：球绕蛇头公转，半径/周期读 config（与 tickShield 同 orbitRadius/orbitSec，消双份真相源）——
		if (owned.shield > 0) {
			var si = owned.shield - 1, sc = SKC.shield.count[si], orbR = RTA('SKILL.shield.orbitRadius.' + si, SKC.shield.orbitRadius[si])
			var base2 = (GS.timeSec / SKC.shield.orbitSec) * M.PI2
			for (var o = 0; o < sc; o++) {
			var a2 = base2 + o / sc * M.PI2
			var ox2 = _ihA.x + Math.cos(a2) * orbR, oy2 = _ihA.y + Math.sin(a2) * orbR
			var at = a2 - SHIELD_GLOW_TRAIL   // 拖影（沿轨道后方）
			var oxt = _ihA.x + Math.cos(at) * orbR, oyt = _ihA.y + Math.sin(at) * orbR
				ctx.globalAlpha = 0.3; ctx.strokeStyle = 'rgba(255,225,140,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round'
				ctx.beginPath(); ctx.moveTo(oxt, oyt); ctx.lineTo(ox2, oy2); ctx.stroke(); ctx.globalAlpha = 1
				ctx.beginPath(); ctx.arc(ox2, oy2, 6, 0, M.PI2); ctx.fillStyle = 'rgba(255,235,160,0.95)'; ctx.fill()   // 发光球（白金）
				ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ox2, oy2, 9, 0, M.PI2); ctx.fillStyle = 'rgba(255,225,140,0.4)'; ctx.fill(); ctx.globalAlpha = 1
				ctx.beginPath(); ctx.arc(ox2, oy2, orbR * SKC.shield.orbitHitMul, 0, M.PI2); ctx.strokeStyle = 'rgba(255,225,140,0.20)'; ctx.lineWidth = 1.5; ctx.stroke()   // B-2 对齐修正：命中环=orbitRadius×orbitHitMul，让玩家看清烫区
			}
		}
		// —— 冰：CD 自动索敌冰池（读 Skill.getIcePools()，与 tickIce 判定严格一致；视觉=判定）——
		if (owned.ice > 0) {
			var pools = (sk.getIcePools ? sk.getIcePools() : null)
			if (pools) {
				for (var zi = 0; zi < pools.length; zi++) {
					var p = pools[zi]
					var premain = p.expire - GS.timeSec
					var plife = p.life > 0 ? p.life : 1
					var pratio = premain > 0 ? (premain / plife) : 0   // 剩余寿命占比 → 淡出
					var pa = (0.18 + 0.32 * pratio).toFixed(2)         // 冰池底色透明度随寿命衰减（不强到挡视线）
					var gr = (p.growDur > 0 && p.growT > 0) ? (1 - p.growT / p.growDur) : 1   // ⑥ 首测：生长 scale 0→1
					var pr = p.r * gr                                                  // 生长中半径（看到的=打到的，与 tickIce effR 一致）
				ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, M.PI2)
				if (!T4) { ctx.fillStyle = 'rgba(120,205,255,' + pa + ')'; ctx.fill() }   // 冰蓝霜池：T4 关填充只留描边（纯视觉，零 gameplay）
					ctx.strokeStyle = 'rgba(159,220,255,0.35)'; ctx.lineWidth = 2   // 冰池外环（强调大控制场边界，看到的=打到的）
					ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, M.PI2); ctx.stroke()
					ctx.fillStyle = 'rgba(225,243,255,0.5)'   // 霜点（固定亮，沿半径撒布填充大霜池）
					for (var fk = 0; fk < 6; fk++) {
						var fa = fk * 1.05 + zi * 1.7, fr2 = pr * 0.32 + (fk % 3) * (pr * 0.22)   // 放大后铺满大范围，不糊不错位
						ctx.beginPath(); ctx.arc(p.x + Math.cos(fa) * fr2, p.y + Math.sin(fa) * fr2, 1.3, 0, M.PI2); ctx.fill()
					}
				}
			}
		}
		ctx.restore()
	}

	function draw(alpha) {
		_ra = (typeof alpha === 'number') ? M.clamp(alpha, 0, 1) : 1   // 渲染插值系数（main 传 acc/STEP）
		if (!ctx) { return }
	_dc.fill = 0; _dc.stroke = 0; _dc.fillText = 0; _dc.drawImage = 0; _dc.fillRect = 0; _dc.beginPath = 0; _dc.arc = 0   // b9+diag：绘制调用计数清零（每帧）
	var tFrame0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now()
	var tnow = tFrame0
	if (_fpsLast) {
		var _dt = tnow - _fpsLast
		_fpsAcc += _dt / 1000
		_fpsFrames++
		// 瞬时 FPS = 1000/帧间隔；_dt>0 且 <1000ms 才计入（跳过 tab 切后台/暂停造成的伪长帧，避免把"切窗口"误记成 gameplay 掉帧）
		if (_dt > 0 && _dt < 1000) { var _inst = 1000 / _dt; if (_inst < _fpsMin) { _fpsMin = _inst } }
	}
	_fpsLast = tnow
	if (_fpsAcc >= 0.5) { _fps = Math.round(_fpsFrames / _fpsAcc); _fpsAcc = 0; _fpsFrames = 0 }
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.fillStyle = '#0d0f1a'; ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
	// 相机：每模拟步(GS.frame 变化)推进一次(updateCamera 用模拟头 h.x)；渲染按 _ra 在 camPrev→cam 间线性插值 → 与蛇头(lerp(px,x,_ra))共用同一 _ra、同匀速 → 头相对相机恒定、零抖（2026-07-23e 误改"每帧追 interpHead"已回退：该改使相机 followLerp 指数追每帧因 _ra 变化的插值头→相对滑动=移动糊）
	var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0); worldScale = ws   // ws 提到此处：供下方锁定模式 clamp 与像素吸附共用（单一真相源）
	var rcx, rcy
	if (window.__CAM_LOCK) {
		// 锁定插值头(A/B 候选·消头抖)：相机每帧直接 = interpHead + lookAhead，去除 followLerp 滞后与 camPrev/cam 插值节拍差 → 头相对屏幕恒定、彻底消"中段一顿一顿"。~ 调参器可开关
		var _ih = interpHead(); if (!_ih) { _ih = { x: cam.x, y: cam.y, ang: 0 } }
		var _lk = (CAM && CAM.lookAhead) || 0
		rcx = _ih.x + Math.cos(_ih.ang) * _lk; rcy = _ih.y + Math.sin(_ih.ang) * _lk
		var _hw = GAME.logicalWidth / 2 / ws, _hh = GAME.logicalHeight / 2 / ws   // 缩放后可见半幅（与 updateCamera 一致，clamp 边界不越界）
		rcx = M.clamp(rcx, _hw, GAME.worldWidth - _hw); rcy = M.clamp(rcy, _hh, GAME.worldHeight - _hh)
		cam.x = rcx; cam.y = rcy   // 回写 cam：inView 剔除(287) 与 profiler 可见数(15_profiler:35) 依赖 cam，锁模式须同步否则误剔除
	} else {
		// 默认：相机每模拟步推进一次(camPrev→cam)，渲染按 _ra 插值（旧逻辑，保留作对照）
		if (GS.frame !== _lastFrame) { _lastFrame = GS.frame; camPrev.x = cam.x; camPrev.y = cam.y; updateCamera() }
		rcx = M.lerp(camPrev.x, cam.x, _ra); rcy = M.lerp(camPrev.y, cam.y, _ra)
	}
	diagCamTick(rcx, rcy)   // DIAG：相机屏幕位移直方图（window.__SNAKE_DIAG=true 时生效）
	diagHeadTick(rcx, rcy)  // DIAG：蛇头屏幕位移直方图（区分"相对运动不同步" vs "worldScale shimmer"）
	// 任务2+❷：本帧蒸汽齐爆聚合 → T1 轻档一次（addTrauma 节流防常震脱敏）；单体(<manyMin)→T0 不震
	_lastSteamCount = _steamThisFrame
	if (_steamThisFrame >= SHK.steam.manyMin) { addTrauma(1, SHK.light) }
	_steamThisFrame = 0
	var mag = 0
	if (shakeFrames > 0) { mag = Math.max(mag, shakeMag); shakeFrames--; if (shakeFrames <= 0) { shakeMag = 0 } else { shakeMag *= 0.85 } }
	var traumaMag = trauma * SHK.maxComposite   // ④-B：trauma 通道折算成屏震幅度（≤maxComposite）
	if (traumaMag > mag) { mag = traumaMag }
	if (RT('PERF.suppressShake', perfFB('suppressShake', false) ? 1 : 0) > 0) { mag = 0 }   // 自适应分级：POTATO 档关屏震；GM 经 editor.rtSet 仍优先
	trauma = Math.max(0, trauma - SHK.steam.decayPerSec / GAME.fps)   // ④-B：trauma 时间窗衰减，多次引爆不线性叠加（N爆≠N震）
	var ox = 0, oy = 0
	if (mag > 0) { ox = M.rand(-mag, mag); oy = M.rand(-mag, mag) }
	ctx.save()
	ctx.translate(GAME.logicalWidth / 2 + ox, GAME.logicalHeight / 2 + oy)   // 屏幕中心为锚（shake 在屏幕空间，不随缩放变）
	ctx.scale(ws, ws)                       // ① 先缩放（围绕屏幕中心）：ws 已在相机块计算（worldScale 仅改显示尺寸，不掺入相机平移）
	// ② 用插值相机(rcx/rcy)按世界坐标平移→整片视图随蛇头一起平滑，消 60Hz 咔咔（根因：相机未插值使整片世界每 2~3 帧突跳）
	// ②-B 像素吸附(2026-07-23i)：dpr·ws·rcx 常为非整数→整片世界(边界/拾取/敌人/粒子硬边)逐帧在设备像素网格上亚像素重采样=shimmer，
	//   且地图中段相机自由滚→抖、边缘 clamp 卡死→不抖，精确对应实测。吸附后世界永远落在像素网格上滚动、不再逐帧重采样，抖动消除。
	//   残差<1 设备像素(≈0.5 CSS px)肉眼不可见；蛇头仍用未吸附 rcx/rcy 画、不引入顿挫。性能零损耗(仅 2 次 Math.round/帧)。
	var rcxS = rcx, rcyS = rcy
	if (window.__PIXEL_SNAP !== false) { var _snap = ws * dpr; rcxS = Math.round(rcx * _snap) / _snap; rcyS = Math.round(rcy * _snap) / _snap }
	ctx.translate(-rcxS, -rcyS)
	drawBounds()
	var p = Registry.get('particle'); if (p && p.drawWorld) { p.drawWorld(ctx) }
	drawPickups(); drawEnemies(); drawSnake(); drawSkillAura()
	if (p && p.drawOverlay) { p.drawOverlay(ctx) }   // B-4：combo 闪核叠加层（蒸汽白闪/电磁辉光），绘于实体之上、不长时间盖核心信息
	drawDebugHitboxes()
	ctx.restore()
	drawHurtVignette()
	drawBossWarn()
	drawBossHpBar()
	drawPerfBadge()
	drawDebugHud()
	if (p && p.DBG) { p.DBG.ignite = 0; p.DBG.fireDot = 0; p.DBG.flashDrawn = 0; p.DBG.steamBlasts = 0; p.DBG.steamAoeCmp = 0 }   // b9-diag/measure：计数器按帧归零（HUD 已读本帧值）
	_lastDc.fill = _dc.fill; _lastDc.stroke = _dc.stroke; _lastDc.fillText = _dc.fillText; _lastDc.drawImage = _dc.drawImage; _lastDc.fillRect = _dc.fillRect; _lastDc.beginPath = _dc.beginPath; _lastDc.arc = _dc.arc   // b9+diag：快照本帧绘制调用数供 profiler
	// overdraw 估算(px²)：叠加层半透明填充总面，直接反映 GPU 填充率负载（单一真相源；profiler 与 tick 关火判定共用，避免单位错配）。火墙已优化为单 path+2 stroke（不贡献 fill），故真实瓶颈在粒子/白爆/爆环/光束
	var ovk = 0
	var pp = Registry.get('particle')
	if (pp) {
		var _ps = pp.particles, _fc = pp.flashCores, _bl = pp.blasts, _bm = pp.beams, _i, _a, _r
		for (_i = 0; _i < _ps.length; _i++) { _a = _ps[_i].life / _ps[_i].maxLife; if (_a < 0) _a = 0; _r = _ps[_i].size * _a; ovk += Math.PI * _r * _r }                 // Σ πr²(粒子)
		for (_i = 0; _i < _fc.length; _i++) { _a = _fc[_i].life / _fc[_i].maxLife; if (_a < 0) _a = 0; _r = _fc[_i].radius * (1.25 - 0.25 * _a); ovk += Math.PI * _r * _r } // Σ πr²(闪核/白爆，最大项)
		for (_i = 0; _i < _bl.length; _i++) { _a = _bl[_i].life / _bl[_i].maxLife; if (_a < 0) _a = 0; _r = _bl[_i].radius * (1 - _a); ovk += 2 * Math.PI * _r * (_bl[_i].ringWidth || 4) } // 环带面积≈2πr·宽
		for (_i = 0; _i < _bm.length; _i++) { var _dx = _bm[_i].x2 - _bm[_i].x1, _dy = _bm[_i].y2 - _bm[_i].y1; ovk += Math.sqrt(_dx * _dx + _dy * _dy) * (_bm[_i].width || 2) * 3 } // 束长×宽×3(双描边近似)
	}
	_lastOv = ovk
	_frameMs = ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - tFrame0
}
	function drawBossHpBar() {                                       // Boss 屏幕顶部大血条：条 + 血量数值 + 阶段/无敌提示（无敌期说明伤害数字为何不跳）
		var En = Registry.get('enemy'); if (!En || !En.list) { return }
		var boss = null
		for (var i = 0; i < En.list.length; i++) { if (En.list[i].active && En.list[i].type === 'boss') { boss = En.list[i]; break } }
		if (!boss || !boss.maxHp) { return }
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		var w = GAME.logicalWidth * 0.6, hgt = 14, x = (GAME.logicalWidth - w) / 2, y = 30
		var ratio = M.clamp(boss.hp / boss.maxHp, 0, 1)
		ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, hgt + 4)
		ctx.fillStyle = '#3a0d18'; ctx.fillRect(x, y, w, hgt)
		ctx.fillStyle = '#ff2d6b'; ctx.fillRect(x, y, w * ratio, hgt)
		ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'
		var inv = boss.invuln > 0 ? '  [无敌]' : ''
		ctx.fillText('BOSS  ' + Math.ceil(boss.hp) + ' / ' + boss.maxHp + '  (阶段 ' + boss.phase + ')' + inv, GAME.logicalWidth / 2, y + 11)
		ctx.restore()
	}
	var _vignetteGrad = null   // 受击 vignette 径向渐变缓存：几何仅依赖逻辑分辨率(恒定)，建一次复用，免每帧 createRadialGradient 分配
	function getVignetteGrad() {
		if (_vignetteGrad) { return _vignetteGrad }
		var iw = GAME.logicalWidth, ih = GAME.logicalHeight
		var g = ctx.createRadialGradient(iw / 2, ih / 2, Math.min(iw, ih) * 0.3, iw / 2, ih / 2, Math.max(iw, ih) * 0.65)
		g.addColorStop(0, 'rgba(255,30,60,0)')
		g.addColorStop(1, 'rgba(255,30,60,1)')   // 边缘全不透明，运行时经 globalAlpha 调制峰值(≤0.5)
		_vignetteGrad = g
		return g
	}
	function drawHurtVignette() {                                    // 受击全屏红闪 vignette（屏幕空间，叠在实体之上）
		if (GS.timeSec >= hurtVignetteUntil) { return }
		var remain = hurtVignetteUntil - GS.timeSec
		var a = Math.min(1, remain / HURT_VIGNETTE_SEC) * 0.5       // 最大 0.5 透明度，避免过曝
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		if (global.PerfTier && global.PerfTier.simpleVignette) {    // 自适应分级 POTATO：纯色块替代每帧 createRadialGradient，省分配（零 gameplay）
			ctx.fillStyle = 'rgba(255,30,60,' + (a * 0.6).toFixed(2) + ')'
			ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
		} else {
			ctx.globalAlpha = a   // 复用缓存渐变，经 globalAlpha 调制峰值透明度(≤0.5)，免每帧分配
			ctx.fillStyle = getVignetteGrad()
			ctx.fillRect(0, 0, GAME.logicalWidth, GAME.logicalHeight)
			ctx.globalAlpha = 1
		}
		ctx.restore()
	}
	function drawBossWarn() {
		if (GS.timeSec >= bossWarnUntil) { return }
		var pulse = 0.35 + 0.30 * Math.abs(Math.sin(GS.timeSec * BOSS_WARN_PULSE_HZ))
		ctx.save()
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.strokeStyle = 'rgba(255,45,107,' + pulse.toFixed(2) + ')'   // ≈COL.boss #ff2d6b
		ctx.lineWidth = BOSS_WARN_BORDER_PX
		ctx.strokeRect(BOSS_WARN_BORDER_PX / 2, BOSS_WARN_BORDER_PX / 2, GAME.logicalWidth - BOSS_WARN_BORDER_PX, GAME.logicalHeight - BOSS_WARN_BORDER_PX)
		ctx.restore()
	}
	function drawDebugHitboxes() {                         // B-GM：GM 面板「显示碰撞盒」实时绘制碰撞半径（世界坐标系内调用）
		var dbg = global.GMDBG; if (!dbg || !dbg.showHitboxes) { return }
		ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,170,0.9)'
		var En = Registry.get('enemy'); if (En && En.list) { for (var i = 0; i < En.list.length; i++) { var e = En.list[i]; if (!e.active) { continue }; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, M.PI2); ctx.stroke() } }
		var s = Registry.get('snake'); if (s && s.head) {
			ctx.strokeStyle = 'rgba(255,80,120,0.9)'
			var segs = s.segments || []; for (var j = 0; j < segs.length; j++) { ctx.beginPath(); ctx.arc(segs[j].x, segs[j].y, getSpriteRadius('PLAYER.bodyRadius'), 0, M.PI2); ctx.stroke() }
			ctx.beginPath(); ctx.arc(s.head.x, s.head.y, getSpriteRadius('PLAYER.headRadius'), 0, M.PI2); ctx.stroke()
		}
		ctx.restore()
	}
function drawDebugHud() {
	if (!RT('PERF.debugHud', CONFIG.PERF.debugHud)) { return }   // 精简性能HUD：仅 FPS/CPU/GPU 帧耗时，常驻监测调参/美术性能回归；详细数据见 L 剖析面板
	var gap = _fps > 0 ? Math.max(0, 1000 / _fps - _cpuMs) : 0   // GPU/环境等待 = 实际帧间隔(1000/fps) − 主线程JS(cpuMs)；>0 即 JS 之外等待，坐实"非代码"掉帧
	ctx.save()
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.globalAlpha = 1
	ctx.font = '700 13px monospace'
	ctx.textAlign = 'left'
	ctx.fillStyle = _fps >= 55 ? '#7CFC00' : (_fps >= 40 ? '#ffd166' : '#ff6b6b')
	ctx.fillText('FPS ' + Math.round(_fps) + '  CPU ' + _cpuMs.toFixed(1) + 'ms  GPU ' + gap.toFixed(1) + 'ms', 8, GAME.logicalHeight - 10)   // 左下角单行，避开左上血量/长度 HUD、右上 L 面板、右下画质角标
	ctx.restore()
}

	// —— 屏震四档统一（单一入口 addTrauma；rank:1=T1轻/2=T2中/3=T3强，gating 见 addTrauma）——
	// T0 不震：撞墙滑行（反馈走刮擦火花）/ 普通命中 / 暴击 / 电磁·闪电每次命中（避免 N 敌=N 震）
	// —— 自适应性能分级：HUD 角标显示当前档位 + 换挡事件（不刷屏，仅一行，换挡后短暂高亮原因）——
	var _tierName = 'HIGH', _tierFlashUntil = 0, _tierReason = ''
	Bus.on('perf:tier', function (d) { if (!d) { return } _tierName = d.tier || _tierName; _tierFlashUntil = GS.timeSec + 2.5; _tierReason = d.reason || '' })
	function drawPerfBadge() {
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.font = '600 11px monospace'; ctx.textAlign = 'right'
		ctx.fillStyle = 'rgba(159,223,255,0.7)'
		ctx.fillText('画质 ' + _tierName, GAME.logicalWidth - 8, GAME.logicalHeight - 8)
		if (GS.timeSec < _tierFlashUntil && _tierReason) {
			ctx.fillStyle = 'rgba(255,209,102,0.9)'
			ctx.fillText('→ ' + _tierName + '（' + _tierReason + '）', GAME.logicalWidth - 8, GAME.logicalHeight - 22)
		}
		ctx.restore()
	}
	Bus.on('snake:hurt', function () { addTrauma(3, SHK.death); hurtVignetteUntil = GS.timeSec + HURT_VIGNETTE_SEC })   // 掉 coreHp → T3 强震 + 红闪
	Bus.on('snake:dead', function () { addTrauma(3, SHK.death) })   // game over → T3
	Bus.on('enemy:phase', function () { addTrauma(3, SHK.crit) })   // Boss 换阶段 → T3
	Bus.on('wave:boss_warn', function (d) { bossWarnUntil = GS.timeSec + (d && d.leadSec ? d.leadSec : 0); addTrauma(3, SHK.crit) })   // ⑤ Boss 预警：红边 + T3
	Bus.on('boss:defeated', function () { addTrauma(3, SHK.death) })   // 击败 Boss → T3 通关强震
	Bus.on('enemy:die', function (d) { if (d && d.kind === 'elite') { addTrauma(2, SHK.process) } })   // 精英死 → T2
	Bus.on('combo:found', function () { addTrauma(2, SHK.process) })   // combo 首触 → T2
	Bus.on('fx:steamblast', function (d) {   // 任务2+❷：仅计数；屏震改由 draw() 帧末聚合（≥manyMin→T1 轻档一次，单体 T0 不震）
		if (!d) { return }
		_steamThisFrame++
	})
	Bus.on('core:run_reset', function () { shakeMag = 0; shakeFrames = 0; trauma = 0; bossWarnUntil = 0; hurtVignetteUntil = 0; cam.x = GAME.worldWidth / 2; cam.y = GAME.worldHeight / 2; _traumaGateUntil = 0; _traumaLastRank = 0; _steamThisFrame = 0; _lastSteamCount = 0 })   // 任务2：屏震节流状态归零

	var Render = { init: init, resize: resize, draw: draw, camera: cam, getWorldScale: function () { return worldScale }, setCpuMs: function (v) { _cpuMs = v }, resetFpsMin: function () { _fpsMin = Infinity }, diag: function () { return { fps: _fps, fpsMin: (_fpsMin === Infinity ? 0 : Math.round(_fpsMin)), cpuMs: _cpuMs, frameMs: _frameMs, overlay: (hurtVignetteUntil > GS.timeSec) ? 1 : 0, dc: _lastDc, overdraw: _lastOv } } }   // setCpuMs：main 每帧写入整帧主线程耗时；resetFpsMin：profiler 每 2s 采样后清零窗口，使 fpsMin=窗口内瞬时最低；diag：暴露采样值供 15_profiler 环形日志（零 gameplay；fpsMin=窗口内瞬时最低 FPS，防短暂掉帧漏采；overlay=受击全屏红 vignette 本帧激活；dc=本帧绘制调用数，供坐实绘制调用数归因；overdraw=叠加层填充率估算(px²)唯一真相源）；getWorldScale：main 指针反算还原视图缩放
	Registry.register('render', Render)
	Log.info('render 就绪：镜头跟随 + 世界绘制 + 四档屏震')

	// 📝 修改日志
	// 2026-07-20 · 性能根治第四轮 · 删除"14 火舌绕蛇头一圈"(第二轮"只围头部"回归遗留，被用户判为"蛇头外围怪异环绕粒子"；火墙表现改由蛇身火管+05_particle 沿身余烬承担)；第三轮修复(火墙火管 alpha 0.06→0.16 / 热边提亮加粗 + 移除敌人 pop-in 剔除 + resize scale>0 兜底 + Render.diag) 保留；不动 core/collision/§9/伤害管线，纯渲染表现
	// 2026-07-20 · view-scale-and-dot · 加 worldScale 纯视觉视图缩放(默认0.8，GM滑条0.6–1.0)+getWorldScale 供指针反算；飘字移至白闪之上(修假人无数字)；inView 含 worldScale 半幅；debug HUD 加 BOSS DOT 分源观测；不动 core/collision/§9/伤害管线
	// 2026-07-20 · 性能根治第六轮(还原) · 回退第五轮：火墙软带回 fr*2/0.30(修"蛇身细线")；drawEnemies 复用桶还原 byColor；HUD 去「非JS」指标；并移除视图缩放 worldScale=0.8(还原 commit 1:1 原画面，相机清晰跟随蛇身、可见敌减少→填充率下降治偶发掉帧)；余烬门控(round6 FPS 主修复)保留；不动 core/collision/§9/伤害管线
	// 2026-07-20 · 视图缩放恢复 · 重新应用 worldScale=0.8 纯视觉缩放（draw 内 ctx.scale(ws,ws) + GM「视图缩放」滑条 + 指针反算除 worldScale + inView 已含 worldScale）；修复 round6 误撤导致的蛇/怪变大变糙；FPS 已证为电池能效节流(非填充率)，0.8 反而降 36% 像素量有益无碍；不动 core/collision/§9/伤害管线/蛇画法
	// 2026-07-20 · 视图缩放相机修复 · 变换顺序由「translate(-cam)→scale」改为「scale→translate(-cam)」（scale 在内层围绕屏幕中心）：旧序使 worldScale 掺入相机平移→蛇不居中、视图不紧跟随（下移时蛇被顶到屏幕顶）；新序 cam=蛇世界坐标即蛇恒居中心，且与 pointermove 反除公式、inView(ws 反算半幅) 完全一致；updateCamera clamp 半幅同步改 /ws；ws=1 退化为原行为零回归
	// 2026-07-21 · overdraw 真相源 · draw() 末尾统一估算 overdraw(px²) 存 _lastOv，diag() 暴露 overdraw 字段；原 profiler 自行重算 → 改为共用此唯一真相源，修复「tick 误读 dc.fill 调用次数(量级200~400)当 overdraw(px²)」的单位错配 bug（火被同屏实体多误关且永久卡死）；火墙已优化为单 path+2 stroke 不贡献 fill，真实瓶颈在粒子/白爆/爆环/光束，overdraw 语义与之对齐；不动 core/collision/§9/伤害管线
	// 2026-07-23 · 蛇头 360° 旋转 + 双眼/瞳孔跟随 · 重构 drawSnake 头部块：统一 save→translate→rotate(heading)→scale(sq)→画无眼头(sprite优先/fallback圆)→画眼(恒绘)→restore，根除「sprite 就绪后眼睛丢失」硬 bug；新增 ART_FORWARD_OFFSET_RAD=π/2 具名偏移使「朝上」PNG 对齐内部 +x=前进约定（契约 §七）；EYE{} 全比例(禁裸像素)；瞳孔朝局部 +x 或最近食物(世界目标先 rotate(-heading) 转局部再 clamp 眼白内)；foods 判空兜底朝前；blink 罩整头+眼；判定圈继续用 getSpriteRadius 与碰撞同源(看到=打到)；纯渲染，不动 core/collision/config/§9/伤害/06_snake 的 head.angle
	// 2026-07-23 · 顿挫/跟随/贴图三修 · ①渲染插值消 fixed-step 一顿一顿：main 经 draw(alpha=acc/STEP) 传插值系数，render 存 _ra，drawSnake 头部用 head.prev→cur 插值(M.lerp + 新增 lerpAngle 最短弧)，非 playing 用当前值防飘移；06_snake 每步记录 head.px/py/pangle、spawnAtCenter 初始化，避免开局从原点飞入；②眼睛跟移动：瞳孔改「前向为主(fwdW=1) + 食物瞟视为次(foodW=0.3)」，修旧版强指食物导致不跟转向 + 食物消失咔哒；③1024 PNG 巨大：drawSprite 缩放改按 PNG 实际像素尺寸(naturalWidth)，任意尺寸正确铺满 2r（solidDiameterPx 字段降级为预留）；跨 14_main/06_snake/11_render，均非 core/collision/config/§9 锁死区
	// 2026-07-23 · 尺寸/脖子缝/身体顿挫三修 · ①尺寸错位(曾被迫把 headRadius 拉到 27)：drawSprite 缩放由「整张 nw=1024」改回按「头部实际内容直径 solidDiameterPx=628」(Python 离线量得 snake_head 内容宽 628/整张含脖子 795/脖子底宽 315≈头宽一半)，headRadius=14 即「看到=打到」(旧整张缩放使视觉头≈内容占比偏小)；②脖子缝(圆身体叠在舌头后鼓包)：身体由「逐节离散圆」改「渐变连续管 drawBodyTube」——半径走「头(headR)→收颈(neckR≈0.5·headR)→回粗到身(bodyR)」收颈曲线(NECK_R_FRAC/NECK_ARC_FRAC 占 headR，PNG 量得)，前段被头/脖子图盖住、露出处已≈脖子宽，消除圆身体从细脖子两侧鼓包；密集采样(≤4px)保证颈区半径平滑无台阶无间隙；③身体顿挫(165Hz 仍一顿一顿)：上一版只插值头部，身体节仍是 60Hz 模拟分辨率 → 165Hz 逐帧跳；06_snake 每步记录各身体节 px/py，drawSnake 用插值中心线(pts)画管，整条蛇平滑；均非 core/collision/config/§9 锁死区
	// 2026-07-23 · 头部咔咔咔(165Hz 仍顿)根因修正 + 身体回退 · ①根因：头部其实已插值，顿挫来自 CAMERA——updateCamera 每帧用 60Hz 模拟头 h.x 且相机渲染时未插值，整片视图(含已平滑蛇头)相对屏幕每 2~3 帧突跳一次 = 用户感知的「高频刷新/咔咔」；修法：相机改为「每模拟步(GS.frame 变化)推进一次(保 60Hz 原手感)，渲染按 _ra 在 camPrev→cam 间插值」，与蛇头/身体同源平滑(新增 camPrev/_lastFrame、translate 改 -rcx/-rcy)；②身体回退：用户实测渐变连续管太丑，drawBodyTube 改回「逐节离散步圆」(与改动前一致、干净)，保留各节 prev→cur 插值保平滑；删除 NECK_R_FRAC/NECK_ARC_FRAC 死常量；均非 core/collision/config/§9 锁死区
	// 2026-07-23 · 残顿(头比身显顿)根治 + 头身配色统一 · ①残顿根因：相机/位置/旋转插值逻辑均无误(身体矢量圆已平滑)，头仍显顿是「位图精灵爬行/shimmer」——头 PNG 是 1024 大图每帧缩放(≈22x 降)到 ~45px 并子像素平移/旋转重采样，高频下重采样抖动被眼读出成顿挫，矢量身体圆无此问题故只头显；修法：drawSprite 改「头 PNG 预渲染到显示分辨率离屏 canvas(getSpriteOff，仅半径变才重绘)，每帧只 1:1 平移+旋转该离屏图」→ 消除每帧 1024→45 重采样爬行；②配色统一：Python 离线量得 head PNG 主填充 #20c088/#18c088，config COLORS.snakeBody 旧 #27c98a、snakeHead 旧 #3effa8 各偏亮一档→细微色差；02_config COLORS.snakeBody/snakeHead 统一为 #20c088(纯表现值、不在 §9 强度真理源)；均非 core/collision/§9 锁死区
	// 2026-07-23 · [回退] 直行抖(绕圈顺)修复误判 · 原以为"相机用模拟头 h.x、蛇头画插值头→两基准差 7px bob"，但实测相机渲染用 lerp(camPrev,cam,_ra) 与蛇头 lerp(px,x,_ra) 共用同一 _ra、同匀速→本就同步；误把相机改"每帧 followLerp 追 interpHead"反而破坏同步：相机指数追每帧因 _ra 变化的插值头→相对滑动=整个蛇移动时糊（撞墙降速→滑动误差骤降→暂时清楚，印证不同步）；已回退 camPrev/_ra 二次插值基线。模拟层(日志 headAng 恒定/头位移 0.5-1.5/冻帧 0)始终干净，问题 100% 在相机-蛇头同步。若回退后仍感直行抖，属 worldScale=0.8 缩小 shimmer(见 DIAG-HS 蛇头屏幕位移直方图判定)，非不同步；均非 core/collision/config/§9 锁死区

})(typeof window !== 'undefined' ? window : this)
