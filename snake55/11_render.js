;(function (global) {
	'use strict'
	var CONFIG = global.CONFIG, Bus = global.Bus, Registry = global.Registry, GS = global.GS, Core = global.Core, Log = global.Log
	var M = Core.M
	var GAME = CONFIG.GAME, PLAYER = CONFIG.PLAYER, CAM = PLAYER.camera, COL = CONFIG.COLORS, SHK = CONFIG.COMBAT.shake
	var STYLE = CONFIG.STYLE   // §5.5 视觉真源（唯一引用；全文件禁再写 CONFIG.STYLE 或散色）

	// 配色红线：蛇身/蛇尾读 STYLE.player（= 蛇头 PNG 同一个绿）；旧 COL.snakeBody/snakeHead 仅兼容保留、新代码不引用
	var SNAKE_BODY = STYLE.player
	var SNAKE_HEAD = STYLE.player
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

	var canvas = null, ctx = null, dpr = 1, _snapGrid = 0   // _snapGrid：设备像素吸附网格(_snap=ws*dpr)；每帧在 draw() 写入，供 _ix/_iy/snapW 把移动实体也吸附到整数设备像素(相机只吸静态世界→移动实体仍亚像素闪，本次补齐)
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
	// 中心闪诊断(2026-07-23 · 供 GM 矩阵一键采样)：每帧算蛇头"显示屏幕设备像素位置"(受吸附,=round(ih·S)-round(cam·S))与"真值"(连续,=(ih-cam)·S)的逐帧差，矩阵据此检测双重取整 toggle。关 PIXEL_SNAP 时两者恒等→art=0(对照组基准)
	// 中心闪诊断(2026-07-23 · 方向1 双采样)：head=蛇头(烘焙位图)真实绘制坐标, body=蛇身中段(矢量圆)真实绘制坐标(均浮点,post-6拆)
	//   disp=实际矩阵(getTransform)作用到「真实绘制点」的设备像素(回读真值,非写死); true=理想连续 S·(wx−rcx)。
	//   disp≡true 仅当「6拆正确(绘制坐标=浮点)+补偿正确(实际矩阵有效中心=rcx)」成立→漏拆/符号错/补偿放错/坐标用混 任一事故→disp≠true→台阶>0 被矩阵抓出(结构性假阴性已消)。
	var _flkHead = { x: 0, y: 0, has: false }, _flkBody = { x: 0, y: 0, has: false }
	var _snakeMtx = null, _shakeOx = 0, _shakeOy = 0   // 蛇补偿后实际变换矩阵(getTransform 回读) + 本帧屏震偏移(设备px):disp 据真值算
	function diagFlickerTick(rcx, rcy, rcxS, rcyS) {
		if (GS.status !== 'playing' || !_snakeMtx || !_flkHead.has || !_flkBody.has) { return }
		var S = worldScale * dpr
		var CDX = dpr * GAME.logicalWidth / 2, CDY = dpr * GAME.logicalHeight / 2   // 屏幕中心(设备px)
		var SX = dpr * _shakeOx, SY = dpr * _shakeOy   // 屏震(设备px)常量:disp 须扣,否则随机 shake 污染台阶
		function setSample(o, wx, wy) {   // disp=实际矩阵作用到绘制点−中心/屏震常量=蛇真实设备偏移(与 true 同基准);true=理想连续
			o.dispX = _snakeMtx.a * wx + _snakeMtx.c * wy + _snakeMtx.e - CDX - SX
			o.dispY = _snakeMtx.b * wx + _snakeMtx.d * wy + _snakeMtx.f - CDY - SY
			o.trueX = S * (wx - rcx)
			o.trueY = S * (wy - rcy)
			o.has = true
		}
		setSample(_flkHead, _flkHead.x, _flkHead.y)   // 头(烘焙位图):wx=实际绘制的浮点头坐标
		setSample(_flkBody, _flkBody.x, _flkBody.y)   // 身(矢量圆):wx=实际绘制的浮点身节
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
	// 头 PNG 预渲染到「显示分辨率」离屏 canvas，并把旋转角烘焙进位图（按 ROT_BUCKET 分桶缓存）：同桶内角位图只栅格化一次→每帧 1:1 取用、零每帧旋转重采样→消头位图爬行/shimmer（矢量身体圆无此问题、故仅头显顿挫）；旧版只预渲染未旋转图、由 drawSnake 每帧 ctx.rotate 旋转该位图→每帧重采样=头闪根因
	var _spriteOff = {}
	var ROT_BUCKET = Math.PI / 60   // 旋转角缓存桶(3°)：桶内角共享同一预栅格化位图；跨桶才重栅格化→方向每 3° 干净跳变(非 shimmer)、肉眼无碍
	function getSpriteOff(key, r, angle) {
		var angQ = angle != null ? Math.round((angle || 0) / ROT_BUCKET) * ROT_BUCKET : 0
		var ck = key + '|' + r + '|' + angQ
		var o = _spriteOff[ck]
		if (o) { return o }
		var c = _spriteCache[key]
		if (!c || !c.ready || !c.img) { return null }
		var entry = SPRITE_MANIFEST[key]
		var sd = (entry.solidDiameterPx > 0) ? entry.solidDiameterPx : (c.img.naturalWidth || 1)
		var dispCss = r * 2
		var dpr = global.devicePixelRatio || 1
		var dispPx = Math.max(1, Math.round(dispCss * dpr))
		var cvSize = Math.max(1, Math.ceil(dispPx * 1.5))   // 留旋转余量(√2≈1.414<1.5)防裁角；内容居中于画布
		var cv = document.createElement('canvas'); cv.width = cvSize; cv.height = cvSize
		var g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
		g.translate(cvSize / 2, cvSize / 2); g.rotate(angQ)   // 绕画布中心烘焙旋转角一次(同桶复用)
		g.drawImage(c.img, -dispPx / 2, -dispPx / 2, dispPx, dispPx)
		o = { r: r, canvas: cv, sizeCss: cvSize / dpr }; _spriteOff[ck] = o
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
		var off = getSpriteOff(key, r, angle)                  // 预渲染离屏(已烘焙旋转角)→每帧 1:1 取用，消位图旋转爬行/shimmer
		if (off) {
			ctx.drawImage(off.canvas, -off.sizeCss / 2, -off.sizeCss / 2, off.sizeCss, off.sizeCss)   // 离屏已含旋转→不再旋转上下文(避免双重旋转)
		} else {
			ctx.rotate(angle || 0)
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
	function updateCamera() {   // 每渲染帧调用一次：用真实头 h.x/h.angle 推进相机目标；内部按 __FRAME_DT 做帧率无关缓动 → 原生刷新率平滑、与蛇头同源同步
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var h = s.head
		var tx = h.x + Math.cos(h.angle || 0) * CAM.lookAhead, ty = h.y + Math.sin(h.angle || 0) * CAM.lookAhead
		var dx = tx - cam.x, dy = ty - cam.y
		var _fdt = (global.__FRAME_DT) || (1 / GAME.fps)
		var _ck = 1 - Math.pow(1 - CAM.followLerp, _fdt * 60); cam.x += dx * _ck; cam.y += dy * _ck   // 2026-07-23·相机封板: 删 deadZone 闸门(原 if(d>deadZone) 在常速下冻结相机→30世界px冻-扑锯齿=中心顿, 实测 __CAM_DZ=0 消顿坐实), 改每帧帧率无关缓动连续跟随(followLerp=60Hz 步语义→任意步率手感一致)
		var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0)
		var halfW = GAME.logicalWidth / 2 / ws, halfH = GAME.logicalHeight / 2 / ws   // 缩放后可见半幅=半宽/worldScale（ws<1 时看得更广→clamp 边界更宽，避免视图越出世界）；ws=1 退化为原值
		cam.x = M.clamp(cam.x, halfW, GAME.worldWidth - halfW)
		cam.y = M.clamp(cam.y, halfH, GAME.worldHeight - halfH)
	}

	function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, M.PI2); ctx.fillStyle = color; ctx.fill() }

	// —— §5.5 视觉助手（STYLE 真源；护 FPS：发光受 glowMax 门控、静态光晕离屏缓存、fxLevel 生成入口降级）——
	var _glowCount = 0   // 每帧 shadowBlur 发光体计数（draw() 首归零）；超 STYLE.glowMax 退化平涂，护填充率
	var _haloCache = {}  // 静态呼吸光晕离屏缓存：key=用途|半径|色 → { canvas, R }；命中即取，不每帧 createRadialGradient
	function fxScale() { var f = RT('STYLE.fxLevel', STYLE.fxLevel); return f === 'low' ? 0.3 : (f === 'med' ? 0.6 : 1) }   // 全局特效降级倍率（GM 经 RT 热调）
	function hexToRgba(hex, a) {   // #rrggbb → rgba()（渐变/半透明用；STYLE 全 6 位十六进制）
		var h = hex.charAt(0) === '#' ? hex.slice(1) : hex
		var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
		return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
	}
	function withGlow(color, blur, alpha, drawCore) {   // 受控发光：未超 glowMax 才开 shadowBlur，否则平涂（零发光成本）
		if (_glowCount >= STYLE.glowMax) { drawCore(); return }
		ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; if (alpha != null) { ctx.globalAlpha = alpha }
		drawCore(); ctx.restore(); _glowCount++
	}
	function getHalo(key, r, color) {   // 静态呼吸光晕离屏预渲染（半径量化缓存）：返回 { canvas, R }；绘制时按 pulse 缩放 drawImage，不每帧重算
		var R = Math.max(2, Math.round(r))
		var ck = key + '|' + R + '|' + color
		var o = _haloCache[ck]; if (o) { return o }
		var d = global.devicePixelRatio || 1
		var size = R * 2
		var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(size * d)); cv.height = Math.max(1, Math.round(size * d))
		var g = cv.getContext('2d'); g.scale(d, d)
		var grd = g.createRadialGradient(R, R, R * 0.15, R, R, R)
		grd.addColorStop(0, hexToRgba(color, 0.85)); grd.addColorStop(0.5, hexToRgba(color, 0.32)); grd.addColorStop(1, hexToRgba(color, 0))
		g.fillStyle = grd; g.beginPath(); g.arc(R, R, R, 0, M.PI2); g.fill()
		o = { canvas: cv, R: R }; _haloCache[ck] = o; return o
	}
	function drawHalo(key, x, y, r, color, alpha) {   // 取缓存光晕并按当前半径缩放贴出（alpha 控呼吸强度）
		var o = getHalo(key, r, color)
		ctx.save(); if (alpha != null) { ctx.globalAlpha = alpha }
		ctx.drawImage(o.canvas, x - r, y - r, r * 2, r * 2); ctx.restore()
	}
	// 威胁色阶（靠色分敌，配合轮廓）：暖橙(散步)→红(追踪/冲锋)→紫(精英)→品红(Boss)
	function enemyColorByType(t) { return t === 'wanderer' ? STYLE.enemyCalm : (t === 'elite' ? STYLE.elite : (t === 'boss' ? STYLE.boss : STYLE.enemy)) }
	function skillColor(id) { return (STYLE.skillFx && STYLE.skillFx[id]) ? STYLE.skillFx[id] : STYLE.ui }   // 技能标志色（键=代码技能 id）

	function drawBounds() { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, GAME.worldWidth, GAME.worldHeight) }
	// —— 拾取物：三形各异（§8.1 圣经）食物=圆果 / 回血=红心 / 技能=宝石，形状区分身份、颜色第二层 ——
	function drawPickups() {
		var pk = Registry.get('pickup'); if (!pk || !pk.foods) { return }
		var f = pk.foods, t = GS.timeSec
		for (var i = 0; i < f.length; i++) {
			var o = f[i]; if (!o.active) { continue }
			var _px = snapWX(o.x), _py = snapWY(o.y)   // 相对相机单次取整吸附（消亚像素闪+中心闪）
			var vs = CONFIG.PICKUP.visualScale || { food: 1, heal: 1, skill: 1 }   // 仅视觉放大(不动碰撞 o.radius)
			var _vr = o.radius * (vs[o.kind] || 1)
			if (o.kind === 'skill') { drawSkillPickup(_px, _py, _vr, t) }
			else if (o.kind === 'heal') { drawHealPickup(_px, _py, _vr, t) }
			else { drawFoodPickup(_px, _py, o.radius, t) }
		}
	}
	function pickupLabel(x, y, text) {                               // 拾取物标签：清 shadow(防 withGlow 辉光污染文字→"写两遍"错觉) + 深色描边保任意背景可读 + 单次绘制
		ctx.save(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'
		ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
		ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(text, x, y)
		ctx.fillStyle = STYLE.textMain; ctx.fillText(text, x, y)
		ctx.restore()
	}
	function drawFoodPickup(x, y, r, t) {                             // 食物=金色圆果 + 呼吸光晕(离屏缓存,仅调 alpha 不换尺寸→单缓存) + 高光 + 果柄
		var pulse = 0.5 + 0.5 * Math.sin(t * 3)
		drawHalo('food', x, y, r * 2.1, STYLE.food, 0.22 + pulse * 0.16)
		circle(x, y, r, STYLE.food)
		ctx.globalAlpha = 0.5; circle(x - r * 0.32, y - r * 0.32, r * 0.32, '#ffffff'); ctx.globalAlpha = 1
		ctx.strokeStyle = STYLE.player; ctx.lineWidth = Math.max(1, r * 0.18)
		ctx.beginPath(); ctx.moveTo(x, y - r * 0.9); ctx.lineTo(x + r * 0.35, y - r * 1.5); ctx.stroke()
		pickupLabel(x, y - r * 1.55 - 10, '食物')   // 果柄上方标签
	}
	function heartPath(cx, cy, s) {                                   // 以中心为原点的心形 path（s≈半宽）
		ctx.beginPath()
		ctx.moveTo(cx, cy - s * 0.25)
		ctx.bezierCurveTo(cx - s * 0.55, cy - s * 0.95, cx - s * 1.15, cy - s * 0.1, cx, cy + s * 0.8)
		ctx.bezierCurveTo(cx + s * 1.15, cy - s * 0.1, cx + s * 0.55, cy - s * 0.95, cx, cy - s * 0.25)
		ctx.closePath()
	}
	function drawHealPickup(x, y, r, t) {                             // 回血=红心 + 强脉冲 + 白光边（玫红，靠心形一眼识别为增益）
		var pulse = 0.5 + 0.5 * Math.sin(t * 5)
		drawHalo('heal', x, y, r * 2.0, STYLE.heal, 0.2 + pulse * 0.24)
		heartPath(x, y, r * 1.15); ctx.fillStyle = STYLE.heal; ctx.fill()
		ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1
		pickupLabel(x, y - r * 1.3 - 6, '回血')   // 心形上方标签（拉近图标，避免文字离图标过远）
	}
	function drawGiftBox(x, y, r) {                                   // 礼物盒：青盒身+盒盖 + 白丝带十字 + 蝴蝶结（替代宝石，技能拾取物一眼识别）
		var bh = r * 0.62, bw = r * 0.82, lidH = r * 0.26, lidOver = r * 0.12
		var lidTop = y - bh - lidH
		ctx.fillStyle = STYLE.ui
		ctx.fillRect(x - bw, y - bh, bw * 2, bh * 2)                   // 盒身
		ctx.fillRect(x - bw - lidOver, lidTop, (bw + lidOver) * 2, lidH)   // 盒盖(出檐)
		ctx.fillStyle = '#eaf9ff'                                      // 丝带(白)
		ctx.fillRect(x - r * 0.13, lidTop, r * 0.26, bh * 2 + lidH)    // 竖丝带(过盒身+盖)
		ctx.fillRect(x - bw, y - r * 0.13, bw * 2, r * 0.26)           // 横丝带(盒身中)
		ctx.beginPath(); ctx.arc(x - r * 0.2, lidTop, r * 0.17, 0, M.PI2); ctx.fill()   // 蝴蝶结左环
		ctx.beginPath(); ctx.arc(x + r * 0.2, lidTop, r * 0.17, 0, M.PI2); ctx.fill()   // 右环
		ctx.beginPath(); ctx.arc(x, lidTop, r * 0.12, 0, M.PI2); ctx.fill()             // 结
	}
	function drawSkillPickup(x, y, r, t) {                            // 技能=礼物盒 + 旋转青光环 + 闪烁 + 头顶「技能」标签
		var pulse = 0.5 + 0.5 * Math.sin(t * 6), rot = t * 1.2
		ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
		ctx.strokeStyle = STYLE.ui; ctx.globalAlpha = 0.45 + pulse * 0.4; ctx.lineWidth = Math.max(1.5, r * 0.14)
		ctx.beginPath(); ctx.arc(0, 0, r + 5, -0.6, 0.6); ctx.moveTo(-(r + 5), 0); ctx.arc(0, 0, r + 5, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke()
		ctx.restore(); ctx.globalAlpha = 1
		withGlow(STYLE.ui, r * STYLE.glowBlur * 2, 0.6 + pulse * 0.3, function () { drawGiftBox(x, y, r) })
		pickupLabel(x, y - r * 1.05 - 14, '技能')   // 标签抬到蝴蝶结上方（清 shadow + 描边，修复"写两遍"错觉）
	}
	// —— 敌人轮廓（靠形状区分身份，威胁色阶为第二层）：追踪尖三角 / 散步圆钝团 / 冲锋梭形 / 精英带角硬壳 / Boss 专属 ——
	function polyPath(cx, cy, pts, ang) {   // 本地多边形按 ang 旋转+平移追加到当前 path（顶点世界坐标，免 ctx.rotate→可与他敌同批 1 次 fill）
		var ca = Math.cos(ang), sa = Math.sin(ang)
		for (var i = 0; i < pts.length; i++) {
			var lx = pts[i][0], ly = pts[i][1]
			var wx = cx + lx * ca - ly * sa, wy = cy + lx * sa + ly * ca
			if (i === 0) { ctx.moveTo(wx, wy) } else { ctx.lineTo(wx, wy) }
		}
		ctx.closePath()
	}
	function addSpikedShell(cx, cy, r, ang, spikes) {   // 带角硬壳（精英/Boss）：内外交替顶点成尖角环
		var n = spikes * 2
		for (var i = 0; i < n; i++) {
			var rr = (i % 2 === 0) ? r * 1.25 : r * 0.78
			var a = ang + i * M.PI2 / n
			var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr
			if (i === 0) { ctx.moveTo(px, py) } else { ctx.lineTo(px, py) }
		}
		ctx.closePath()
	}
	function addEnemyShape(e, ty, t, hx, hy, sc) {   // 把单敌轮廓追加到当前 path（同类型批量共用，末尾 1 次 fill）
		var x = _ix(e), y = _iy(e), r = e.radius * (sc || 1)
		if (ty === 'chaser') {
			var a = Math.atan2(hy - e.y, hx - e.x)   // 尖端指向蛇头
			polyPath(x, y, [[r * 1.35, 0], [-r * 0.8, -r * 0.95], [-r * 0.35, 0], [-r * 0.8, r * 0.95]], a)
		} else if (ty === 'charger') {
			polyPath(x, y, [[r * 1.5, 0], [r * 0.1, -r * 0.72], [-r * 1.15, 0], [r * 0.1, r * 0.72]], e.angle)   // 梭形/后掠
		} else if (ty === 'wanderer') {
			var sway = Math.sin(t * 1.6 + e.id) * (r * 0.12)   // 慢晃悠（纯视觉微动）
			ctx.moveTo(x + sway + r, y); ctx.arc(x + sway, y, r, 0, M.PI2)   // 圆钝软团
		} else if (ty === 'elite') {
			addSpikedShell(x, y, r, e.angle, 6)
		} else {
			ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, M.PI2)   // bossBullet/dummy/兜底：圆
		}
	}
	function drawEnemyFlash(e, hx, hy, t) {   // ⑥ 受击白闪：本型轮廓涂白（插值位姿消 165Hz 跳）
		ctx.beginPath(); addEnemyShape(e, e.type, t, hx, hy, 1); ctx.fillStyle = COL.damageText; ctx.fill()
	}
	function drawChargerWindup(e, t) {   // ⑤ 冲锋蓄力 telegraph：梭形沿朝向拉长闪（scale 视觉，不改 e.radius/碰撞）+ 方向箭头
		var x = _ix(e), y = _iy(e), r = e.radius
		var blink = (Math.floor(t * TELEGRAPH_BLINK_HZ) % 2 === 0)
		var stretch = 1.2 + 0.35 * Math.abs(Math.sin(t * 10))
		ctx.beginPath(); polyPath(x, y, [[r * 1.5 * stretch, 0], [r * 0.1, -r * 0.72], [-r * 1.15 * stretch, 0], [r * 0.1, r * 0.72]], e.angle)
		ctx.fillStyle = blink ? '#ffffff' : STYLE.enemy; ctx.fill()
		drawChargeArrow(e)
	}
	function drawEliteAura(e, t) {   // 精英光环呼吸（少量，单独描边；受 glowMax 门控）
		var x = _ix(e), y = _iy(e), r = e.radius, pulse = 0.5 + 0.5 * Math.sin(t * 3)
		withGlow(STYLE.elite, r * STYLE.glowBlur * 2, 0.4 + pulse * 0.3, function () {
			ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, M.PI2); ctx.strokeStyle = STYLE.elite; ctx.lineWidth = 2; ctx.stroke()
		})
	}
	function drawBossBody(b, t) {   // Boss 专属轮廓 + 读现有 boss.phase 分阶段变色（不新增字段/数值）+ 呼吸光环 + 无敌白热闪 + 受击浅闪
		var x = _ix(b), y = _iy(b), r = b.radius
		var col = b.phase >= 2 ? '#ff5ab0' : STYLE.boss           // 阶段2 更烈的品红
		if (b.invuln > 0 && Math.floor(t * 12) % 2 === 0) { col = '#ffffff' }   // 换阶段无敌期白热闪（读 invuln）
		else if (b.flashT > 0) { col = '#ffdff0' }               // 受击浅闪（读 flashT）
		var pulse = 0.5 + 0.5 * Math.sin(t * 2.5)
		drawHalo('boss', x, y, r * 1.9, col, 0.18 + pulse * 0.2)
		ctx.beginPath(); addSpikedShell(x, y, r, t * 0.4, 8); ctx.fillStyle = col; ctx.fill()
		ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, M.PI2); ctx.fillStyle = '#2a0a1e'; ctx.fill()
		ctx.globalAlpha = 0.6 + pulse * 0.4; circle(x, y, r * 0.3, col); ctx.globalAlpha = 1
	}
	function drawEnemies() {
		var En = Registry.get('enemy'); if (!En || !En.list) { return }
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉；GM 经 editor.rtSet 仍优先
		var l = En.list, t = GS.timeSec
		var sn = Registry.get('snake'), hx = sn && sn.head ? sn.head.x : 0, hy = sn && sn.head ? sn.head.y : 0
		// 第一遍：boss/白闪/charger蓄力 单独处理；其余按 type 分组，每型 1 path + 1 fill（延续"同色 1 次 fill"填充率优化，GPU 自动裁视口外几何）
		var groups = {}, elites = [], bosses = []
		for (var i = 0; i < l.length; i++) {
			var e = l[i]; if (!e.active) { continue }
			if (e.type === 'boss') { bosses.push(e); continue }
			if (e.flashT > 0) { drawEnemyFlash(e, hx, hy, t); continue }   // ⑥ 受击白闪
			if (e.type === 'charger' && e.state === 'windup') { drawChargerWindup(e, t); continue }   // ⑤ 蓄力 telegraph
			if (e.type === 'elite') { elites.push(e) }
			var ty = e.type; if (!groups[ty]) { groups[ty] = [] }; groups[ty].push(e)
		}
		for (var gk in groups) {
			var arr = groups[gk]
			ctx.beginPath()
			for (var j = 0; j < arr.length; j++) { addEnemyShape(arr[j], gk, t, hx, hy, 1) }
			ctx.fillStyle = enemyColorByType(gk); ctx.fill()
		}
		for (var ei = 0; ei < elites.length; ei++) { drawEliteAura(elites[ei], t) }   // 精英光环（少量）
		for (var bi = 0; bi < bosses.length; bi++) { drawBossBody(bosses[bi], t) }     // Boss 专属
		// 第二遍：标记 + 血条（单敌少量，保留原逻辑）
		for (var k = 0; k < l.length; k++) {
			var e2 = l[k]; if (!e2.active) { continue }
			if (!inView(e2.x, e2.y, e2.radius)) { continue }
			if (e2.burnT > 0 && !T3) { drawBurnMark(e2) }       // ⑦ 燃烧标记
			if (e2.slowT > 0 && !T3) { drawSlowMark(e2) }       // 减速标记
			if (e2.type !== 'bossBullet' && e2.type !== 'boss') { drawHpBar(e2, _ix(e2), _iy(e2)) }
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
		ctx.strokeStyle = STYLE.enemy; ctx.lineWidth = 3
		ctx.beginPath(); ctx.moveTo(_ex, _ey); ctx.lineTo(tx, ty); ctx.stroke()
			var ah = 7
			ctx.beginPath(); ctx.moveTo(tx, ty)
			ctx.lineTo(tx - Math.cos(a - 0.5) * ah, ty - Math.sin(a - 0.5) * ah)
			ctx.lineTo(tx - Math.cos(a + 0.5) * ah, ty - Math.sin(a + 0.5) * ah)
			ctx.closePath(); ctx.fillStyle = STYLE.enemy; ctx.fill()
	}
	// 最短弧角插值（渲染插值用）：返回 a→b 在 t∈[0,1] 间无回绕跳变的角度
	function lerpAngle(a, b, t) {
		var d = (b - a) % M.PI2
		if (d > Math.PI) { d -= M.PI2 } else if (d < -Math.PI) { d += M.PI2 }
		return a + d * t
	}
	// 相对相机单次取整吸附（中心闪修复·2026-07-23f）：旧 snapW 对「蛇头」与「相机」各自 round→头≈屏心时 round(头)-round(相机) 非单调 ±1 设备像素抖=中心闪。
	//   改为：先把坐标变到「相对相机」(v-_camX)→round 一次→再加回「相机吸附偏移」round(_camX*_snapGrid)/_snapGrid → 等价 round((v-rcx)*S) 单次取整；
	//   头相对相机平滑移动→屏幕位置单调步进→中心闪消除（边缘因相机冻结本就不闪，维持）。静态世界(边界/相机平移)仍走 -rcxS 整数设备像素→不丢 shimmer 修复。
	//   _camX/_camY 在 draw() 相机块后写入（未吸附真值 rcx/rcy），__PIXEL_SNAP=false 时 _snapGrid=0→snapWX/Y 直接返回 v（保留调试开关）。
	var _camX = 0, _camY = 0
	function snapWX(v) { return (_snapGrid > 0) ? (Math.round((v - _camX) * _snapGrid) + Math.round(_camX * _snapGrid)) / _snapGrid : v }
	function snapWY(v) { return (_snapGrid > 0) ? (Math.round((v - _camY) * _snapGrid) + Math.round(_camY * _snapGrid)) / _snapGrid : v }
	function snapAngle(a) { return (window.__HEAD_ROT_SNAP === false) ? (a || 0) : Math.round((a || 0) / ROT_BUCKET) * ROT_BUCKET }   // 头旋转角吸附 3° 桶：配合离屏烘焙→位图仅跨桶时重栅格化一次，消每帧旋转重采样爬行(shimmer)；__HEAD_ROT_SNAP=false 还原旧行为
	// 方向1 亚像素回归调试开关（2026-07-24）：FPS 46↔165 摇摆根因=蛇身/光球走浮点、落非整数设备像素→canvas 每 fill 做 AA 且成本随亚像素偏移量每帧波动。
	//   true(默认)=强制吸附蛇/光球到整数设备像素(复用敌人已验证的 snapWX/Y,残差<1设备像素肉眼不可见)；false=还原方向1 浮点(复现卡顿,用于A/B确诊)。确认后去开关永久吸附。
	function DIR1_SNAP() { return window.__NO_DIR1 !== false }
	// 渲染插值（CAM-STUTTER 修复·方案A）：任意带 prevX/prevY 扁平字段的实体，按同一 _ra（已 clamp[0,1]）在「上一步→当前步」间插值。判定位移/碰撞逻辑只读真实 x/y，不碰
	function _ix(o) { return snapWX((o.prevX != null) ? M.lerp(o.prevX, o.x, _ra) : o.x) }
	function _iy(o) { return snapWY((o.prevY != null) ? M.lerp(o.prevY, o.y, _ra) : o.y) }
	// 双眼/瞳孔：PNG 之上叠代码眼（PNG 自带眼/无眼都叠一层保证可见；瞳孔朝局部 +x=前进；全比例禁裸像素）
	// 身体：逐节离散步圆（与改动前一致、干净不丑）；各节 prev→cur 插值 → 165Hz 平滑（消身体一顿一顿）；颈缝=圆身(r≈12)略宽于 PNG 自带脖子(~7)，由头图盖住前段，与「改前」视觉一致
	function drawBodyTube(pts, headR, bodyR, bodyCol) {
		var c = bodyCol || SNAKE_BODY
		for (var i = 0; i < pts.length; i++) { circle(pts[i].x, pts[i].y, bodyR, c) }   // 从蛇头中心(0)起逐节圆：头下身体连续、消头颈缝断节（头图随后盖中心）；body 读 STYLE.player=蛇头同绿
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
		var _snap = DIR1_SNAP()   // 调试开关：true=吸附蛇到整数设备像素(消亚像素 AA 摇摆)；false=方向1 浮点(复现卡顿)
		var hx = _ih.x, hy = _ih.y, hAng = _ih.ang   // 方向1：蛇坐标走浮点(由外层残差补偿抵消相机锯齿),不再自身 snapWX→整条蛇连续投影
		if (_snap) { hx = snapWX(hx); hy = snapWY(hy) }
		var pts = [{ x: hx, y: hy }]
		for (var _i = 1; _i < segs.length; _i++) {
			var _g = segs[_i], _ix = _g.x, _iy = _g.y
			if (GS.status === 'playing' && _g.px != null) { _ix = M.lerp(_g.px, _g.x, _ra); _iy = M.lerp(_g.py, _g.y, _ra) }
			if (_snap) { _ix = snapWX(_ix); _iy = snapWY(_iy) }
			pts.push({ x: _ix, y: _iy })   // 方向1：身体逐节浮点(残差补偿后整条蛇连续投影,无链内接缝)
		}
		var _mi = Math.floor(pts.length / 2)   // 诊断采样点:身体中段(矢量圆)
		_flkHead.x = hx; _flkHead.y = hy; _flkHead.has = true   // 实际绘制头坐标(浮点,post-6拆)→诊断 disp 据此算真值
		_flkBody.x = pts[_mi].x; _flkBody.y = pts[_mi].y; _flkBody.has = true
		var hAngQ = snapAngle(hAng)   // 头旋转角量化(3°桶)→与离屏烘焙对齐、消每帧旋转重采样爬行(shimmer)；中心转向最明显
		var inv = GS.invincibleUntil > GS.timeSec
		var blink = inv && (Math.floor(GS.timeSec * 16) % 2 === 0)
		var _ba = blink ? 0.35 : 1   // 整蛇(身+头)同 alpha 闪：无敌时头下属身圆随头同淡出→不再单独露亮核=消"两个画面重叠闪烁"
		ctx.save(); ctx.globalAlpha = _ba
		var lowHp = GS.coreHp <= 1   // 蛇本体=主血条：低血时整蛇闪红（读现有 coreHp，不新增数值）
		var bodyCol = (lowHp && Math.floor(GS.timeSec * 2) % 3 === 0) ? STYLE.lowHp : SNAKE_BODY   // 低血闪：频率放慢(~0.67Hz)+降占空比(1/3 时间)+暗哑红(STYLE.lowHp)，不刺眼
		drawBodyTube(pts, headR, bodyR, bodyCol)        // 先画身体管（头/脖子图随后盖前段）
		if (!lowHp) { drawHalo('snakehead', hx, hy, headR * 1.9, STYLE.playerGlow, 0.22) }   // 蛇头光晕（离屏缓存，唯一常驻发光体，护 FPS；低血时让位红闪）
		// 蛇头：整角烘焙进离屏(量化角)1:1 取用→零每帧旋转重采样；无眼（PNG 已定稿造型，不再叠代码眼/瞳孔）
		ctx.save()
		ctx.translate(hx, hy)
		// 忠实绘制 PNG（整角=量化头角+具名 +90° 偏移=artForwardOffsetRad；离屏已烘焙旋转→drawSprite 不再旋转上下文）；缺图 fallback 圆同 STYLE 绿
		if (!drawSprite(ctx, 'snake_head', 0, 0, hAngQ + ART_FORWARD_OFFSET_RAD)) {
			circle(0, 0, headR, lowHp ? STYLE.enemy : SNAKE_HEAD)
		}
		// 蛇头受击红闪（复用 hurtVignetteUntil：与全屏红闪 + T3 轻震屏同步，头部叠一层红→受击更明确，非仅接色）
		if (GS.timeSec < hurtVignetteUntil) {
			var hf = (hurtVignetteUntil - GS.timeSec) / HURT_VIGNETTE_SEC
			ctx.globalAlpha = 0.55 * hf; circle(0, 0, headR, STYLE.enemy); ctx.globalAlpha = 1
		}
		ctx.restore(); ctx.restore()   // 恢复 _ba(整蛇淡出)
		if (inv) {                                                   // 无敌光环（白闪脉动）
			var ha = 0.3 + 0.3 * Math.sin(GS.timeSec * 16)
			ctx.globalAlpha = ha; ctx.beginPath(); ctx.arc(hx, hy, headR + 6, 0, M.PI2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1
		}
	}
	function drawSkillAura() {
		var sk = Registry.get('skill'); if (!sk || !sk.owned) { return }
		var s = Registry.get('snake'); if (!s || !s.head) { return }
		var T4 = RT('PERF.suppressIceFill', perfFB('suppressIceFill', false) ? 1 : 0) > 0   // 自适应分级：POTATO 档冰池只描边；GM 经 editor.rtSet 仍优先
		var h = s.head, owned = sk.owned(), SKC = CONFIG.SKILL
	var _ihA = interpHead() || h   // 护盾光球绕「插值头」公转（与所画蛇头同源），消 165Hz 光球相对头错位跳
	var _snapA = DIR1_SNAP()   // 调试开关：true=吸附光球/火墙到整数设备像素(消亚像素 AA 摇摆)；false=方向1 浮点(复现卡顿)
	var _iax = _ihA.x, _iay = _ihA.y   // 方向1：护盾/火墙基底浮点(残差补偿后随蛇一起连续投影)
	if (_snapA) { _iax = snapWX(_iax); _iay = snapWY(_iay) }
		function RTA(path, fb) { var ed = Registry.get('editor'); if (ed && typeof ed.rtGet === 'function') { var v = ed.rtGet(path); if (v !== undefined && v !== null) { return v } } return fb }   // B-GM 标定：绘制读运行时覆盖，无覆盖回退冻结 CONFIG（与 08_skill RT() 同步，仅换视觉输入来源，几何算法不动）
		ctx.save()
		// —— 火墙：用户验收反馈 v2——保留"范围火墙"软光带(可见火墙范围) + 去掉沿身亮热边/flick 跳变(原被用户判为"蛇身细线/一闪一闪")；火焰反馈同时由 05_particle spawnFireEmbers 沿身余烬承担（零 gameplay，伤害判定在 08_skill 不动）——
		var T3 = RT('PERF.suppressFireVisual', perfFB('suppressFire', false) ? 1 : 0) > 0   // 自适应分级：LOW/POTATO 档自动关火焰系 per-enemy 视觉（含蛇身火墙）；GM 经 editor.rtSet 仍优先
		var segs = s.segments || []
		if (owned.fire > 0 && !T3) {   // 范围火墙：软光带(连续火场)+无亮热边/无 flick(用户验收：不要蛇身细线、不要蛇闪)
			var fi = owned.fire - 1, fr = RTA('SKILL.fire.radius.' + fi, SKC.fire.radius[fi]), stepF = SKC.fire.segStep[fi] || 1
			ctx.save()
			ctx.globalCompositeOperation = 'lighter'   // 加色辉光：火墙=连续软光带(非蛇身细线)
			ctx.beginPath()
			for (var sf = 0; sf < segs.length; sf += stepF) {
				var sg = segs[sf]
				var sgx = (sg.px != null) ? M.lerp(sg.px, sg.x, _ra) : sg.x, sgy = (sg.py != null) ? M.lerp(sg.py, sg.y, _ra) : sg.y   // 方向1：火墙贴插值蛇身浮点(残差补偿后连续投影)
				if (_snapA) { sgx = snapWX(sgx); sgy = snapWY(sgy) }
				if (sf === 0) { ctx.moveTo(sgx, sgy) } else { ctx.lineTo(sgx, sgy) }
			}
			ctx.lineCap = 'round'; ctx.lineJoin = 'round'
			ctx.lineWidth = fr * 2; ctx.strokeStyle = 'rgba(255,95,30,0.22)'; ctx.stroke()   // 软火范围带：宽 fr*2(=火墙半径)/alpha 0.22 柔光，无亮热边、无 flick
			ctx.restore()
		}

		// —— 护盾：球绕蛇头公转，半径/周期读 config（与 tickShield 同 orbitRadius/orbitSec，消双份真相源）——
		if (owned.shield > 0) {
			var si = owned.shield - 1, sc = SKC.shield.count[si], orbR = RTA('SKILL.shield.orbitRadius.' + si, SKC.shield.orbitRadius[si])
			var base2 = (GS.timeSec / SKC.shield.orbitSec) * M.PI2
			for (var o = 0; o < sc; o++) {
			var a2 = base2 + o / sc * M.PI2
			var ox2 = _iax + Math.cos(a2) * orbR, oy2 = _iay + Math.sin(a2) * orbR   // 方向1：护盾球浮点(残差补偿后连续投影)
			var at = a2 - SHIELD_GLOW_TRAIL   // 拖影（沿轨道后方）
			var oxt = _iax + Math.cos(at) * orbR, oyt = _iay + Math.sin(at) * orbR   // 方向1：护盾拖影浮点(残差补偿后连续投影)
			if (_snapA) { ox2 = snapWX(ox2); oy2 = snapWY(oy2); oxt = snapWX(oxt); oyt = snapWY(oyt) }
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
	_glowCount = 0   // §5.5：每帧发光体计数归零（withGlow 超 glowMax 退化平涂，护填充率）
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
	// 相机(原生帧时间步进·2026-07-23t)：模拟按真实帧时间推进→蛇头/相机均渲染当前真实位姿(_ra=1)，运动=面板刷新率→零 judder。相机每帧按 __FRAME_DT 做帧率无关缓动(updateCamera 内部)，不再用 camPrev/_ra 二次插值
	var ws = M.clamp(RT('RENDER.worldScale', perfFB('worldScale', 0.8)), 0.5, 1.0); worldScale = ws   // ws 提到此处：供下方锁定模式 clamp 与像素吸附共用（单一真相源）
	var rcx, rcy
	// 相机(2026-07-23z·移除 __CAM_LOCK 失败实验)：永远走 updateCamera 帧率无关缓动(低通滤波消逐帧微抖动)。__CAM_LOCK 曾 1:1 硬锁蛇头→绕过缓动把蛇速逐帧起伏透传到世界滚动→中心区顿(用户实测确诊)；其默认本就关，删除杜绝 footgun
	updateCamera()
	rcx = cam.x; rcy = cam.y
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
	trauma = Math.max(0, trauma - SHK.steam.decayPerSec * (global.__FRAME_DT || (1 / GAME.fps)))   // ④-B：trauma 时间窗衰减(帧率无关，*真实帧时间)
	var ox = 0, oy = 0
	if (mag > 0) { ox = M.rand(-mag, mag); oy = M.rand(-mag, mag) }
	_shakeOx = ox; _shakeOy = oy   // 暴露本帧屏震偏移(设备px)给诊断:disp 须扣,否则随机 shake 污染台阶
	ctx.save()
	ctx.translate(GAME.logicalWidth / 2 + ox, GAME.logicalHeight / 2 + oy)   // 屏幕中心为锚（shake 在屏幕空间，不随缩放变）
	ctx.scale(ws, ws)                       // ① 先缩放（围绕屏幕中心）：ws 已在相机块计算（worldScale 仅改显示尺寸，不掺入相机平移）
	// ② 用插值相机(rcx/rcy)按世界坐标平移→整片视图随蛇头一起平滑，消 60Hz 咔咔（根因：相机未插值使整片世界每 2~3 帧突跳）
	// ②-B 像素吸附(2026-07-23i)：dpr·ws·rcx 常为非整数→整片世界(边界/拾取/敌人/粒子硬边)逐帧在设备像素网格上亚像素重采样=shimmer，
	//   且地图中段相机自由滚→抖、边缘 clamp 卡死→不抖，精确对应实测。吸附后世界永远落在像素网格上滚动、不再逐帧重采样，抖动消除。
	//   残差<1 设备像素(≈0.5 CSS px)肉眼不可见；蛇头仍用未吸附 rcx/rcy 画、不引入顿挫。性能零损耗(仅 2 次 Math.round/帧)。
	var rcxS = rcx, rcyS = rcy
	if (window.__PIXEL_SNAP !== false) { var _snap = ws * dpr; rcxS = Math.round(rcx * _snap) / _snap; rcyS = Math.round(rcy * _snap) / _snap; _snapGrid = _snap } else { _snapGrid = 0 }   // _snapGrid 暴露给 _ix/_iy/snapWX/Y：移动实体相对相机单次取整吸附→整片世界(含蛇)落整数设备像素滚动，亚像素重采样 shimmer 消除；中心闪修复见 snapWX/Y
	_camX = rcx; _camY = rcy   // 暴露未吸附真值相机给 snapWX/Y 做「相对相机单次取整」(中心闪修复·2026-07-23f)
	if (window.__DIAG_FLICKER) { diagFlickerTick(rcx, rcy, rcxS, rcyS) }   // 中心闪诊断：每帧采样蛇头屏幕位置(受吸附 vs 真值)，供 GM 矩阵检测双重取整 toggle
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
		ctx.fillStyle = STYLE.boss; ctx.fillRect(x, y, w * ratio, hgt)
		ctx.fillStyle = STYLE.textMain; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'
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
		ctx.strokeStyle = hexToRgba(STYLE.boss, +pulse.toFixed(2))   // §5.5 品红预警边（STYLE.boss）
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

	var Render = { init: init, resize: resize, draw: draw, camera: cam, getFlickerSample: function () { return { head: _flkHead, body: _flkBody } }, getWorldScale: function () { return worldScale }, setCpuMs: function (v) { _cpuMs = v }, resetFpsMin: function () { _fpsMin = Infinity }, diag: function () { return { fps: _fps, fpsMin: (_fpsMin === Infinity ? 0 : Math.round(_fpsMin)), cpuMs: _cpuMs, frameMs: _frameMs, overlay: (hurtVignetteUntil > GS.timeSec) ? 1 : 0, dc: _lastDc, overdraw: _lastOv } } }   // setCpuMs：main 每帧写入整帧主线程耗时；resetFpsMin：profiler 每 2s 采样后清零窗口，使 fpsMin=窗口内瞬时最低；diag：暴露采样值供 15_profiler 环形日志（零 gameplay；fpsMin=窗口内瞬时最低 FPS，防短暂掉帧漏采；overlay=受击全屏红 vignette 本帧激活；dc=本帧绘制调用数，供坐实绘制调用数归因；overdraw=叠加层填充率估算(px²)唯一真相源）；getWorldScale：main 指针反算还原视图缩放
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
