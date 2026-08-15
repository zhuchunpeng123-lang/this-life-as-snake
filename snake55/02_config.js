;(function (global) {
	'use strict'
	// 5.5 好玩基因融合版贪吃蛇 · CONFIG（L1 唯一数值层 · 纯数据零逻辑）
	// 唯一来源：数值真理源 v0.3；GDD 仅给意图，禁直填裸数字。
	// 深冻结由 core.js deepFreeze(CONFIG) 在启动自检执行。🟡=真理源未量化、按依据推断。

	var CONFIG = {
		META: { project: '5.5-fusion-snake', version: '0.3', truthSource: '数值真理源 v0.3', builtAt: '2026-06-05' },

		// —— §0 全局 + 屏幕/世界 ——
		GAME: {
			fps: 60,
			logicalWidth: 960,
			logicalHeight: 540,
			inputDelayMaxMs: 50,
			staticHardcapSec: 20,
			// ✅ 确认 2400×1600（短边1600≥刷怪环直径1520）
			worldWidth: 2400,
			worldHeight: 1600,
			// ✅ 撞墙裁定（真理源 §2.1）：沿墙滑行+刮擦减速，非致死源（0 coreHp 伤害）
			wallSlide: true,                // true=沿墙滑行(切向保速·不可穿越)；false=硬停
			wallScrapeSpeedMult: 0.85,      // 接触期刮擦减速倍率（0.75–0.90，硬下限 0.72）
			wallScrapeGrace: 0.2            // 离墙后维持减速的宽限秒数
		},

		// —— §0.1 输入（触控手感，非 §9 平衡值）——
		INPUT: {
			touch: {
			deadZone: 12,        // 🟡 触控死区(px 逻辑)：原18偏钝(用户反馈摇杆"慢半拍")，降到12更跟手；纯输入手感，不进 §9
			baseFracX: 0.84,     // 🟡 固定摇杆锚点 X(占画布显示宽比例)：右侧安全区(用户要求；PC 鼠标右手 / 手机右拇指握持)，底座永不跑到屏幕中央盖住蛇；纯输入手感，不进 §9
			baseFracY: 0.80,     // 🟡 固定摇杆锚点 Y(占画布显示高比例)；纯输入手感，不进 §9
			baseRadius: 72,      // 🟡 外环半径(px 逻辑)：表盘大小，随屏缩放；纯视觉，不进 §9
			knobRadius: 30,      // 🟡 推钮半径(px 逻辑)；纯视觉，不进 §9
			travelFrac: 0.6,     // 🟡 推钮最大行程(占 baseRadius 比例)：阻尼手感；纯视觉，不进 §9
			idleOpacity: 0.5,    // 🟡 未按压时常驻透明度(像手游常驻摇杆，提示操作区；0.26 太淡进游戏几乎看不见，升 0.5 清晰可见)；纯视觉，不进 §9
			activeOpacity: 0.96, // 🟡 按压激活时透明度+辉光；纯视觉，不进 §9
			minScreenRadius: 64   // 🟡 摇杆底座屏幕半径下限(px)：小屏 contain 缩放后底座过小捏不住，钳到该下限保可操作性；纯输入表现，不进 §9
		},   // ⚠ 改动守则：本段纯输入手感表现值，非 §9 平衡值；不得在此写 gameplay 裸数字（§6）
			mouseSteerIdleSec: 0.12,   // 🟡 鼠标转向空闲门限(s)：指针停止移动超过该时长即视为"空闲"→蛇保持当前角直行（治悬停常驻跟踪导致的舌头一顿一顿）；纯输入手感，不进 §9
			mouseMoveDeadPx: 3         // 🟡 鼠标相对死区(px 逻辑)：指针移动小于该距离不更新瞄准角，滤 OS/浏览器微抖；纯输入手感，不进 §9
		},

		// —— §1 PLAYER ——
		PLAYER: {
			snakeSpeed: 200,
		turnRate: 300,                // 🟡 手感调参(2026-07-26)：180→300，U-turn 1.0s→0.6s 更跟手；轴2 长度衰减(decay/floor)暂不动，后续单独轴。真源 §1 回写待用户完成
		turnRateDecayPerSeg: 0.010,
		turnRateFloor: 120,
			segmentSpacing: 24,
			followLerp: 0.4,
		initSegments: 3,
		maxSegments: 25,                 // 长度线硬顶（叙事加节仅受此限；普通食物额外受段 cap 卡）
		segCapByStage: [6, 14, 20, 25, 25],   // 兼容回退：若成长曲线不可用，按阶段使用该段 cap；正常运行优先读取 segCapCurve。
		segCapCurve: [
			{ timeSec: 0, cap: 4 },
			{ timeSec: 10, cap: 5 },
			{ timeSec: 25, cap: 6 },
			{ timeSec: 95, cap: 14 },
			{ timeSec: 215, cap: 20 },
			{ timeSec: 300, cap: 25 }
		],   // First Wave：长度上限随局内时间逐步开放，避免成长期早早封顶；普通食物受该曲线门控，叙事加节仍只受 maxSegments
		coreHp: 3,
			headRadius: 14,            // 碰撞判定半径（真理源 §1：宁小勿大防冤死，回真源 14；渲染半径见下方 headRadiusRender）
			headRadiusRender: 28,      // 渲染半径(px)：纯表现，配合 snake_head.png；与碰撞 headRadius 解耦（视觉≥判定，防冤死）；getSpriteOff 整图缩到 2r → 视觉头宽≈1.2×此值(≈34px，比身体24px略大、协调)；用户最新：蛇头从30再小一点点→28（"蛇头有点大"），缩放回退「之前版本」(dispCss=r*2)
			bodyRadius: 12,
			headKnockback: 0,
			buildPauseCdMs: 800,
			deadZoneRadius: 12,
			camera: { followLerp: 0.12, lookAhead: 60, deadZone: 30 },   // ⚠️deadZone 已废弃(2026-07-23 相机封板)：updateCamera 不再读它。原 if(d>deadZone) 闸门在常速下(稳态滞后≈v/7.2≈27.8px<30)冻结相机→30世界px「冻-扑」锯齿=中心顿(实测 __CAM_DZ=0 消顿+顿感幅度随视口缩放 S 变化 双证)。字段保留仅防结构变动，可下次清理时删
			// §1.1 效果系数：1 + (segments - base) * coeff，下限 floor
			effect: { base: 3, coeff: 0.08, floor: 1.0, formula: '1 + (segments - 3) * 0.08' }
		},

		// —— §2 COMBAT（含 §2.2 反馈四档屏震） ——
		COMBAT: {
			headHitDamage: 1,
			invincibleFrames: 60,
			critRate: 0.10,
			critMultiplier: 1.8,
			hitStopFrames: 2,
			hitFlashFrames: 3,
			enemyHitStunFrames: 4,
			enemyKnockbackPx: 12,
			bodyContactDps: 8,
			enemySpeedCapRatio: 0.8,
			damageFormula: 'base * effectMul * critMul',
			shake: {
				light: { px: 2, frames: 4 },
				process: { px: 4, frames: 6 },
				crit: { px: 8, frames: 12 },
				death: { px: 16, frames: 30 },
			maxComposite: 18,
			gateSec: { 1: 0.35, 2: 0.5, 3: 0.5 },   // 任务2：屏震分档最小重触发间隔(s)·T1=0.35(蒸汽齐爆轻档)/T2=0.5(process)/T3=0.5(crit·death，仅 coreHp/Boss/大招)；间隔内同/低档丢弃、高档越级覆盖
			steam: { manyMin: 4, decayPerSec: 1.6 }   // ④-B+任务2：蒸汽引爆屏震门控·真源 §2.2.1「严禁单一强度轰炸·防脱敏」。本帧齐爆数≥manyMin→T1 轻档(light)一次(禁映射 crit/T3)；单体(<manyMin)→T0 不震；decayPerSec=trauma 衰减(每秒)，多次引爆不线性叠加(N爆≠N震)；manyMin 3→4 对齐"≥N,N>3"
		}
		},

		// —— §性能护栏（非 §9 平衡值；🟡 待实测+候选，归 b9 性能专项）——
		PERF: {
			steamBurstCapPerFrame: 10,  // 🟡 蒸汽齐爆同帧 VFX 上限（仅门控视觉 fx:steamblast 的 Bus.emit，伤害 hurtCombo 始终结算）；候选 8 / 10 / 12，实测再收。保住"大 AOE 齐爆"读感
			maxParticles: 240,          // 🟡 全局粒子活跃上限（门控所有进池写入，含 fx:steamblast 直 push 旁路，否则齐爆打爆池）；350→240：火墙 DOT 粒子已停喷（见 05_particle），给余量，HUD「粒子」实测可调；候选 220/240/300，RT 热调
			maxTexts: 48,              // 🟡 全局飘字活跃上限（门控最贵的 fillText 飘字）；候选 40/48/60，RT 热调
			spawnBudgetPerFrame: 120,  // 🟡 每帧 VFX 生成预算（削平齐爆单帧尖峰，覆盖 burst/text/blast/beam/flash/dart）；候选 100/120/150，RT 热调
			debugHud: false,           // b9-diag：性能诊断 HUD（FPS/粒子/数组计数/T1-T4 开关态）默认关闭；GM 面板「性能HUD」一键开（仅 dev 用，零 gameplay）
			// —— 自适应性能分级（跨端 FPS 根治）· 纯渲染/表现护栏，非 §9 平衡值；数值集中此处，~ 调参器/后续可热改 ——
			autoScale: true,                 // 自适应总开关：false→恒 HIGH(=原默认，行为零回归)；true→设备初判 + 实时 FPS 自动升降档
			tierDownFps: 48,                 // 实时均值 < 此值并持续 down stabilize 秒 → 降一档（45→48：覆盖高刷下持续 "50 多" 平均，治偶发掉档）
			tierUpFps: 58,                   // 实时均值 > 此值并持续 stabilize 秒 → 升一档（目标 60，留余量防抖动）
			tierStabilizeSec: 3,             // 升档防抖稳定时长(秒)：越阈须持续这么久才升档，防档位抖动(thrashing)
			tierDownStabilizeSec: 1.5,       // 降档防抖稳定时长(秒)：比升档更短 → 掉帧秒级反应（治 26/30 尖峰），仍留余量防误降
			flashCoreCap: 16,                // 🟡 并发闪核(白爆/辉光)硬上限：超量丢最旧(保最新视觉)，削平 402k overdraw 尖峰(suppressWhiteBurst 未接线时的根因)；候选 12/16/20，RT 热调
			fillDownThreshold: 320,          // 🟡 火/余烬 fill 绘制调用量过载阈值：自动档下该值持续越阈且处于 HIGH/MED → 直跳 LOW 关火/余烬(压主因 fill 爆炸)；与 FPS 触发并存；候选 280/320/360，RT 热调
			fillDownStableSec: 0.8,          // 🟡 fill 过载降 LOW 稳定时长(秒)：越阈须持续这么久才直跳 LOW，防误伤；候选 0.6/0.8/1.0，RT 热调
			fillLockSec: 8,                   // 🟡 fill 关火后回升锁定时长(秒)：关火后锁定这么久才允许回升，避免「关火→回升重燃火→再关」乒乓；候选 6/8/10，RT 热调
			fillRecoverSec: 5,                // 🟡 fill 关火后回升稳定时长(秒)：过锁定+fill 回落后须持续这么久才重燃火，防抖动；候选 4/5/6，RT 热调
			deviceSeed: {                    // 启动设备初判（粗判，避免手机高档起步卡顿后再降）
				mobileShortSide: 360,        // 手机短边 ≤ 此值 → POTATO 起步（小屏弱机）；360 让 iPhone 横屏短边(≈375-430)落 MED 而非 POTATO，火焰/蒸汽表现默认开
				mobileTier: 'MED',           // 其余手机/平板 → MED 起步（关火/白爆的 LOW/POTATO 仅作自动降档兜底；火焰/蒸汽表现默认开，弱机由 fill/FPS 看门狗自动压回）
				desktopShortSide: 720,       // 桌面短边 ≤ 此值 或 dpr ≤ desktopDprFloor → MED 起步（弱集显笔记本）
				desktopDprFloor: 1           // devicePixelRatio ≤ 此值视为弱集显 → MED 起步
			},
			tiers: {                         // 四档质量预设（HIGH=原默认，零回归基准）；每档控制 backing 宽上限/粒子文字上限/视图缩放/火冰视觉抑制/白爆抑制/屏震/vignette 精度
				HIGH:   { maxBackW: 1600, worldScale: 0.80, maxParticles: 240, maxTexts: 48, spawnBudget: 120, suppressFire: false, suppressIceFill: false, suppressShake: false, suppressWhiteBurst: false, simpleVignette: false },   // ⚠️2026-07-23 回退: maxBackW 2560→1600。2560 是 7/22「2400 掉帧」坑的复刻(画布2560×1440+余烬/白爆/飘字齐发→外部17-23ms→FPS崩42, 见CHANGELOG「2400 掉帧澄清」); 1600=7/22 auto-tier 封版基准(双实证稳60fps)。2560 是 commit 52d076a 为消1600拉伸shimmer误焊成默认, 今回归。shimmer 若明显另开轴(如落地7/22搁置的FPS自动降分辨率)
				MED:    { maxBackW: 1920, worldScale: 0.92, maxParticles: 170, maxTexts: 40, spawnBudget: 90,  suppressFire: false, suppressIceFill: false, suppressShake: false, suppressWhiteBurst: false, simpleVignette: false },
				LOW:    { maxBackW: 1024, worldScale: 0.88, maxParticles: 120, maxTexts: 32, spawnBudget: 70,  suppressFire: true,  suppressIceFill: false, suppressShake: false, suppressWhiteBurst: true,  simpleVignette: false },
				POTATO: { maxBackW: 800,  worldScale: 0.84, maxParticles: 80,  maxTexts: 24, spawnBudget: 50,  suppressFire: true,  suppressIceFill: true,  suppressShake: true,  suppressWhiteBurst: true,  simpleVignette: true }
			}
		},
		// —— 纯视觉渲染（非 §9 平衡值；视图缩放仅改世界显示尺寸，不影响碰撞/坐标/平衡）——
	RENDER: {
		worldScale: 0.8,         // 视图缩放默认 0.8（还原「更小更精致」蛇/怪画面）；GM「视图缩放(纯视觉)」滑条 0.6–1.0 实时可调；×1.0=原始 1:1（注：此值仅作文档真理源，render 实际由 RT('RENDER.worldScale',0.8) 取、editor 覆盖优先）
		// 敌人贴图视觉微调系数（只缩放显示，不动碰撞/血量/速度/伤害；纯视觉，允许视觉≥判定）。
		// 2026-07-24p · 贴图显示直径仍以碰撞半径为基线，但各 PNG 按透明主体占比做视觉校准，不改判定半径。
		//   wanderer/chaser/charger/elite 为角色定位倍率；bossIdle/bossCharge 独立校准，保证收翼核心与张翼核心连续。
		//   boss 仍保持明显高于普通敌人的视觉层级；GM 经 editor.rtSet('RENDER.spriteVisualScale.*') 可实时覆调，零 gameplay。
		spriteVisualScale: { wanderer: 2.4, chaser: 2.6, charger: 2.5, elite: 2.3, boss: 2.2, bossIdle: 2.2, bossCharge: 3.37 },
		// Boss PNG v2：主体指标来自当前透明像素包围盒，视觉参数只影响显示，不改变碰撞或攻击。
		bossVisual: {
			idleBreathPeriodSec: 3.8,
			idleBreathMaxRatio: 0.025,
			preWarnSec: 0.6,
			chargeSec: 0.45,
			preWarnMaxRatio: 1.08,
			releaseHoldSec: 0.16,
			releaseFlashSec: 0.14,
			recoverySec: 0.48,
			recoveryRetractSec: 0.30,
			recoveryCrossfadeSec: 0.18,
			spriteTransitionSec: 0.10,
			idleRingAlpha: 0.04,
			idleRingPulseAlpha: 0.02,
			idleSprite: { width: 773, height: 790, centerX: 511.5, centerY: 501 },
			chargeSprite: { width: 810, height: 556, centerX: 511, centerY: 489 }
		}
	},

		// —— §2.3 JUICE 手感基因（新增） ——
		JUICE: {
			squashEat: { scale: 1.15, durationMs: 120 },
			squashHitDeath: { scale: 0.85, durationMs: 150 },
			trail: { length: 4, alphaStart: 0.5, alphaDecay: 0.12 },
			motionBlur: 0.2,
			principles: ['即时', '夸张', '层叠', '不干扰']
		},

		// —— §3 ENEMIES（senseRange: -1 = 全屏/无限） ——
		ENEMIES: {
			chaser: { hp: 20, atk: 1, speed: 120, speedByStage: [120, 120, 140, 155, 120], senseRange: -1, radius: 11 },   // Third Wave：成长期保持120；割草/高潮逐步升至140/155制造路线压力；Boss段回120，本轮不改Boss压力。
			wanderer: { hp: 15, atk: 1, speed: 80, senseRange: 250, radius: 10, aggroRangeByStage: [800, 800, 800, 800, 0], approachRadius: 80, wanderRedirSec: 1.5 },   // Third Wave：继续用800 aggro保证进场，但只靠近蛇头周边约80px，不再精准锁头；定位固定为低威胁割草素材。
			charger: { hp: 60, hpByStage: [60, 60, 90, 130, 60], atk: 1, speed: 90, chargeSpeed: 215, senseRange: 350, radius: 14, chargeWindupSec: 0.7, stunSec: 1.0, maxConcurrentChargesByStage: [0, 0, 2, 3, 0] },   // Final Wave：普通阶段保留60；割草/高潮90/130，目标是让青蛙有机会完成一次冲锋；同时威胁上限2/3只，防多方向随机夹杀。
			elite: { hp: 260, hpByStage: [260, 260, 260, 360, 260], atk: 1, speed: 60, senseRange: -1, radius: 24 },   // Final Wave：只在高潮期提高驻场到360；仍是“绕”的战场锚点，不增加新机制。
			boss: { hpTotal: 17500, hpPhase1: 8750, hpPhase2: 8750, atk: 1, speedPhase1: 110, speedPhase2: 70, phaseThresholdPct: 0.5, transitionInvulnSec: 2.0, fireIntervalSec: 3.4, phase2FireIntervalSec: 2.6, bulletSpeed: 140, radius: 60 }
		},

		SPAWN: { ringInner: 520, ringOuter: 760 },

		SPATIAL: { cellSize: 64 },

		// —— §4 SKILL（每技能 5 级数组）+ §4.6 COMBO ——
		SKILL: {
			maxLevel: 5,
			list: ['fire', 'ice', 'bolt', 'shield', 'lightning'],
			attackSkills: ['fire', 'bolt', 'lightning'],
			survivalSkills: ['ice', 'shield'],
			starterEligible: { fire: true, ice: false, bolt: true, shield: true, lightning: true },
		fire: { dotPerSec: [6, 9, 13, 18, 24], radius: [60, 75, 90, 108, 128], segStep: 1, lv5: 'spreadBurn' },  // B-2：半径放大×1.5初值，沿蛇身铺开（真理源 §4.1，待实测回填）
		ice: { slowPct: [0.20, 0.30, 0.40, 0.50, 0.60], lv5FreezeSec: 1.0, freezeCd: 3.0, poolLingerSec: [4, 5, 6, 7, 8], maxActivePools: 2, poolRadius: [90, 110, 130, 150, 170], seekRange: [100, 140, 180, 220, 260] },  // ⑥ 系统性调整（大范围·持续控制场）：poolLingerSec 改按等级[4,5,6,7,8](冰池存续拉长·供敌群聚拢+火墙多次扫爆)·新增 maxActivePools=2(并发冰池上限·2片稳定大控制场)·poolRadius[5]=[90,110,130,150,170](全等级≥蒸汽90px·冰圈≥爆圈)·freezeCd=3.0不动·slowPct/Lv5冻结1s不动；蒸汽COMBO.steamExplosion.radius=90不动(选A·仅e.inIce防冰圈外凭空引爆)；真理源§4.2回写，③校验DPS/密度
		bolt: { damage: [10, 13, 16, 20, 25], nodes: [1, 2, 3, 4, 5], fireRate: [2.0, 2.2, 2.5, 2.8, 3.2], maxRange: [100, 140, 180, 220, 260], lv5: 'pierce+1' },  // P1-1 射程门控（px）
		shield: { count: [1, 2, 3, 4, 5], contactDamage: [8, 11, 14, 18, 22], orbitRadius: [30, 40, 50, 60, 70], orbitSec: 1.6, orbitHitMul: 0.5, lv5: 'reflect' },  // B-2：orbitRadius 收紧为贴头点防曲线 A[30,40,50,60,70]（headRadius=14，球落点刚好头外侧，不扩全身/不压火墙）；orbitSec 取代写死常量 1.6（§4.4 待实测回填）；orbitHitMul=护盾球命中半径占 orbitRadius 比例（🟡 几何因子，待标定回填 §9）
			lightning: { damage: [9, 12, 15, 19, 24], chains: [2, 3, 4, 5, 7], intervalSec: [1.2, 1.1, 1.0, 0.9, 0.8], maxRange: [120, 155, 190, 225, 240], chainJumpRange: [80, 100, 120, 140, 160], lv5: 'stun' }  // P1-1 首跳射程门控（px）；chainJumpRange=每跳连敌半径门控（候选 A，防跨全场连锁，待③数值专项优化精调）
		},

		COMBO: {
			steamExplosion: { parts: ['fire', 'ice'], damageMul: 2.5, radius: 90 },
			electroTurret: {
				parts: ['bolt', 'lightning'], damageMul: 1.5,
				redeployCooldownSec: 1.0, deploySec: 0.18, firstShotSec: 0.28, postFireHoldSec: 0.40, collapseSec: 0.18,
				salvoCountByLevel: [3, 3, 4, 4, 4], salvoIntervalSecByLevel: [1.10, 1.05, 0.95, 0.90, 0.85],
				targetsPerSalvoByLevel: [2, 2, 3, 3, 3], attackRadiusByLevel: [170, 190, 220, 245, 270],
				preferredMinRange: 70, deployClearancePx: 12
			},
			// Burning Barrage remains length-independent; shared Fire/Bolt level controls its late-run contribution.
			burningBarrage: { parts: ['fire', 'bolt'], burnDpsByLevel: [8, 12, 17, 23, 30], burnSec: 3 }
		},

		// —— §5 PICKUP ——
		PICKUP: {
			// ✅ 确认 food.radius=10
			food: { screenCap: 6, refreshIntervalSec: 2.5, segCap: 25, gainSegments: 1, safeDistance: 180, minSpacing: 80, radius: 10, maxSegScreenCap: 2, maxSegRefreshIntervalSec: 6, overflowScore: 10 },  // B：满节后食物稀疏化(屏上限2/刷新6s)+溢出转小分(🟡 TODO 候选[5/10/20] 终值待 §9；score 用途未定仅占位)
			skill: { baseDropRate: 0.12, perOwnedPenalty: 0.02, floorRate: 0.03 },
			skillPity: { killStreakGuarantee: 12, firstSkillGuaranteeSec: 5 },   // 单局节奏调优：首技能5s保底；连杀12保底（保护期内仍暂停连杀保底）
		upgradeMinGapSecBySeg: [14, 18, 20, 18, 60],   // First Wave：前中期更快形成构筑；Boss 段保持 60s，不在本轮调整
			heal: { gainHp: 1, maxHp: 3, naturalRefreshSec: 20, healStageCapByStage: [0, 2, 2, 1, 0], perRunMin: 2, perRunMax: 3, screenCap: 1 },   // S3·贪婪悖论：naturalRefreshSec 45→20(heal间冷却≥20s)；healStageCapByStage 索引=stageId-1（段①0/段②2/段③2/段④1/段⑤0 Boss纯决战）；满血(coreHp<maxHp)才出、偏敌簇勾引冒险
			visualScale: { food: 1.3, heal: 1.8, skill: 1.8 },   // 拾取物【仅视觉】放大倍率(不动 o.radius 碰撞)；用户验收：heal/skill 定 1.8x，food(加节数) 1.3x；待实测量化回写 §9
			dangerBias: { ringMin: 40, ringMax: 150 }   // 🟡 补给危险偏向：敌身周围偏移环带(px)，落点钳视野内且不贴脸；候选 ringMin 30/40 · ringMax 120/150/180，待实测量化回写 §9
		},

		// —— §6 STAGE（cap/rate/时间窗=确认；🟡 pool=GDD 文字推断） ——
		STAGE: {
		segments: [
			{ id: 1, name: '保护期', startSec: 0, endSec: 25, cap: 4, spawnRate: 0.7, pool: ['wanderer'] },
			{ id: 2, name: '成长期', startSec: 25, endSec: 95, cap: 14, spawnRate: 3.2, pool: ['wanderer', 'chaser'] },
			{ id: 3, name: '割草期', startSec: 95, endSec: 215, cap: 36, spawnRate: 10.0, pool: ['wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'chaser', 'chaser', 'chaser', 'chaser', 'chaser', 'charger', 'charger', 'charger', 'elite', 'elite'] },   // Final Wave：基础密度约+20%，普通怪比例不变；目标是更持续的可见怪潮。
			{ id: 4, name: '高潮期', startSec: 215, endSec: 300, cap: 60, spawnRate: 18.0, pool: ['wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'chaser', 'chaser', 'chaser', 'chaser', 'chaser', 'charger', 'charger', 'charger', 'charger', 'elite', 'elite', 'elite'] },   // Final Wave：50→60；16/s→18/s。普通怪继续脆，用供应量承接强Build。
			{ id: 5, name: 'Boss期', startSec: 300, endSec: 420, cap: 6, spawnRate: 1.0, pool: ['chaser', 'elite'] }
		],
		dangerPulseByStage: {
			3: { firstDelaySec: 18, cycleSec: 26, durationSec: 7, capBonus: 4, spawnMul: 1.25, pool: ['wanderer', 'wanderer', 'wanderer', 'wanderer', 'wanderer', 'chaser', 'chaser', 'chaser', 'chaser', 'chaser', 'charger', 'charger', 'charger', 'charger', 'charger', 'charger', 'elite', 'elite', 'elite', 'elite'] },   // 25%草 / 25%追 / 30%躲 / 20%绕；约每26s出现7s压力峰。
			4: { firstDelaySec: 13, cycleSec: 22, durationSec: 7, capBonus: 6, spawnMul: 1.22, pool: ['wanderer', 'wanderer', 'wanderer', 'wanderer', 'chaser', 'chaser', 'chaser', 'chaser', 'chaser', 'charger', 'charger', 'charger', 'charger', 'charger', 'charger', 'charger', 'elite', 'elite', 'elite', 'elite'] }   // 20%草 / 25%追 / 35%躲 / 20%绕；高潮期峰值更偏特殊威胁，但冲锋并发仍由2/3只硬限制。
		},
			rookieProtect: [
				{ startSec: 0, endSec: 10, speedMul: 0.6, cap: 2 },
				{ startSec: 10, endSec: 25, speedMul: 0.8, cap: 4 }
			],
			lethalProtectSec: 25,
			lethalProtectMinHp: 1,
			waveSafeIntervalSec: 2.0,
			waveNewElementMax: 2,
			bossWarnLeadSec: 3.0,
			totalWaves: 10
		},

		// —— §7 ECON ——
		ECON: {
			choiceCount: 3,
			skillSlots: 5,
			skillMaxLevel: 5,
			newSkillWeight: 0.45,
			upgradeWeight: 0.55,
			guaranteeAttack: 1,
			guaranteeSurvival: 1,
			comboFindScore: 500,
			// §7 击杀基础分（威胁度阶梯，键=敌人 type）：GS.score += scorePerKill[type] × killStreakMul(连杀)
			scorePerKill: { wanderer: 5, chaser: 10, charger: 20, elite: 100, boss: 2000 },
			// §7 连杀倍率：每连杀 +step、封顶 capMul；扣心 / resetSec 秒内无击杀 → 归零（防挂机刷分）
			killStreak: { startMul: 1.0, step: 0.1, capMul: 2.0, resetSec: 3 }
		},

		// —— §8 NARR（叙事结算 · 真理源 §8.4/§8.6–§8.9；文案=资产豁免）——
		NARR: {
			// Narrative V2：只定义事实识别与结算阈值，不改变玩法强度。
			v2: {
				enabled: true,
				runCountLocalStorageKey: 'snake55_runCount',
				ledgerMaxEvents: 160,
				risk: {
					nearbyRadiusPx: 150,
					nearbyEnemyCount: 3,
					lowHpThreshold: 1,
					greedyDeathWindowSec: 3.0
				},
				memory: {
					minHighlights: 3,
					maxHighlights: 5,
					dedupeWindowSec: 5,
					recoveryWindowSec: 8,
					weights: {
						greedyCorrelation: 100,
						clear: 100,
						bossEncounter: 90,
						comboFound: 86,
						nearDeathRecovery: 84,
						riskySkillChoice: 82,
						riskyHeal: 80,
						riskyFood: 76,
						firstSkill: 72,
						maxSkill: 70,
						nearDeath: 68,
						eliteKill: 62,
						skillGain: 52,
						stageEnter: 36,
						summary: 20
					}
				}
			},
			v3: {
				enabled: true,
				echo: {
					enabled: true,
					earliestSec: 20,
					maxEventEchoes: 3,
					minGapSec: 18,
					durationSec: 2.2,
					comboDelaySec: 0.9
				},
				presentation: { memoryBeatSec: 1.2, terminalBeatSec: 1.35, memoryMaxChars: 28, autoStatsDelaySec: 6 },
				eulogy: { version: 4, killMilestoneHigh: 1000, killMilestoneMid: 500, preferredMinChars: 28, preferredMaxChars: 55 },
				director: {
					scores: { buildArc3: 94, buildArc2: 90, buildArc1: 86, primarySkill: 72, riskySkill: 82, recovery: 84, killMilestone: 78, threshold: 90, elite: 62, growth: 36, summary: 20 }
				},
				copy: {
					chapter: {
						2: { title: '成长期', lines: ['蛇身开始变长，路也跟着远了起来。', '吃下去的每一口，都开始留在蛇身上。'] },
						3: { title: '割草期', lines: ['怪越来越多了，真正的厮杀才刚开始。', '怪潮挤了上来，前路开始难走。'] },
						4: { title: '高潮期', lines: ['怪潮越来越密，已经没有多少空路了。', '这一段最挤，也最危险。'] },
						5: { title: '终点', lines: ['终点终于出现在前面。', '最后的守卫，已经出现在前面。'] }
					},
					echo: {
						combo: {
							steamExplosion: ['冰和火撞在一起，蒸汽一下炸开了。', '冰火接上了，蛇身多了一次蒸汽爆发。'],
							electroTurret: ['电光停了下来，开始守住一块地方。', '飞出去的电，第一次留在原地继续开火。'],
							burningBarrage: ['火追着飞镖出去，开始跟着怪潮烧。', '飞镖带上了火，余烬一路跟着怪走。']
						},
						multiCombo: ['第三道羁绊接上时，它已经和出发时完全不同。', '三道羁绊都接起来，这一生有了自己的路数。'],
						skillMax: {
							fire: ['一路养大的火，终于烧到了最旺。', '火越烧越旺，已经没有多少余地再长。'],
							ice: ['寒意一层层压下来，已经冷到了最深。', '冰霜一路铺开，已经没有多少余地再冷。'],
							bolt: ['飞出去的光越来越熟，已经成了最常见的一招。', '那些追出去的光，已经陪它走了很远。'],
							shield: ['护住蛇身的光越来越厚，已经撑到了最满。', '那层护光一层层变厚，已经不能再厚多少。'],
							lightning: ['电光越连越远，已经一路接到了最远处。', '闪电一段段接开，已经穿过了更深的怪潮。']
						},
						nearDeathRecovery: ['只剩最后一颗心，它还是把命续了回来。', '命只剩一线，后来又一点点补了回来。'],
						riskySkill: ['怪已经贴到身边，它还是接下了那束异光。', '敌人就在身侧，那束异光还是进了蛇身。']
					},
					buildArc: {
						1: {
							steamExplosion: ['冰和火撞在一起，蒸汽从蛇身里炸开。', '它把冰和火接到了一起，相撞就成了蒸汽爆发。'],
							electroTurret: ['飞出去的电光停了下来，变成守在原地的炮台。', '电不再只往前冲，它开始留下来守住一片地方。'],
							burningBarrage: ['飞镖带着火追出去，余烬一路跟着怪潮。', '火追上了飞镖，从此攻击走到哪，余烬就跟到哪。']
						},
						2: ['两道羁绊接上以后，这条蛇终于有了自己的路数。', '两种力量都接了起来，这一生开始走出自己的路数。'],
						3: ['三道羁绊全都接上，这条蛇已经和出发时完全不同。', '三道羁绊都成了形，这一生终于走出了自己的路数。']
					},
					primarySkill: {
						max: {
							fire: ['一路养大的火，最后烧到了最旺。', '火一路烧大，最后已经没有多少余地再长。'],
							ice: ['寒意越积越深，最后冷到了最深。', '冰霜一层层铺开，最后已经没有多少余地再冷。'],
							bolt: ['一路追出去的光，陪它走了很远。', '飞出去的光越来越熟，最后成了最常见的一招。'],
							shield: ['护住蛇身的光越来越厚，最后撑到了最满。', '那层护光一点点变厚，最后已经不能再厚多少。'],
							lightning: ['电光越连越远，最后一路接到了最远处。', '闪电在怪潮间一段段接开，最后穿进了更深处。']
						},
						normal: {
							fire: ['火越烧越旺，慢慢成了这条蛇最常用的力量。'],
							ice: ['冰霜一层层铺开，寒意慢慢跟上了蛇身。'],
							bolt: ['飞出去的光越来越多，渐渐成了熟悉的轨迹。'],
							shield: ['护住蛇身的光，一层层厚了起来。'],
							lightning: ['电光越连越远，慢慢穿进了更深的怪潮。']
						}
					},
					trial: {
						nearDeathRecovery: ['只剩最后一颗心，它还是把命续了回来。', '命只剩一线，那一段却没有断在这里。'],
						riskySkill: ['怪已经贴到身边，它还是接下了那束异光。', '敌人就在身侧，那束异光还是进了蛇身。'],
						elite: ['有一只精英怪，最后倒在了它身后。']
					},
					feat: {
						killHigh: ['这一生，倒在它身后的怪超过了一千只。'],
						killMid: ['它一路杀过来，身后已经倒下五百多个怪。']
					},
					threshold: ['终点终于出现在前面。', '守在最后一段的家伙，终于露了面。'],
					ending: {
						greedy: ['那一口刚吞下去，{seconds}秒后，它也倒下了。', '它从怪身边抢下那一口。{seconds}秒后，这一生停在这里。'],
						attrition: ['前路还没走完，它先倒在了这里。', '还没走到终点，这条蛇已经走不动了。'],
						boss: ['终点就在眼前，它却倒在最后一步。', '它已经走到最后一战，可这一生没能再往前一步。'],
						clear: ['它走过了最后一道门。这一生，真的走完了。', '最后的守卫倒下以后，这条蛇把这一生完整走完了。']
					},
					closing: {
						death: ['它停下来以后，夜色又安静了。', '最后，蛇身不再往前。'],
						clear: ['终点过去了，这条蛇也把这一生走完了。', '最后一段路走完，这一生终于完整。'],
						element: {
							fire: ['火慢慢熄下去，蛇身也停了。'],
							ice: ['冰霜一点点散开，蛇身也停了。'],
							lightning: ['电光暗下去，蛇身也停了。'],
							shield: ['护光熄下去，蛇身也停了。'],
							bolt: ['飞出去的光不再回来，蛇身也停了。']
						}
					},
					genericBuild: ['这一生没有走成固定的路，却也一点点长出了自己的样子。'],
					verdict: { greedy: ['那一口之后'], attrition: ['前路未尽'], boss: ['只差最后一步'], clear: ['此生走完'] },
					summary: ['它一路吃、一路长，也一路走到这里。只是前路还没走完。', '这一路已经够长，故事就停在这一段。']
				}
			},
			deathStillSec: 1.0,
			carouselSec: 4, carouselCountMin: 3, carouselCountMax: 5,
			aiTextSec: 12, aiTextSecMin: 10, aiTextSecMax: 14,
			eulogyMinReadSec: 6,
			chapterBeatSec: 2.4,
			chapterBeats: {
				2: { title: '成长期', line: '开始懂得，贪一口会长得更快。' },
				3: { title: '割草期', line: '火力盖过压力。' },
				4: { title: '高潮期', line: '越强，越没有退路。' },
				5: { title: 'Boss期', line: '终点就在前面。' }
			},
			staticHardcapSec: 20,
			choicePerRunMin: 1, choicePerRunMax: 2,
			templateSkeletonMin: 12,
			aiTextCharMin: 80, aiTextCharMax: 120,

			// Narrative V2 仅保留冻结的事实阈值、记忆权重与章节节拍。

			// §8.7.3 兼容分类阈值；greedyStageMax 已 deprecated，Narrative V2 禁止用它判 greedy。
			classify: {
				deathCause: { greedyStageMax: 2, bossStageId: 5 },
				buildLean: { fireThreshold: 0.5 }
			},

		},

		// —— §5 色彩语义（GDD §5 · 资产豁免） ——
		COLORS: {
			background: '#11162a',
			worldBorder: '#2a3358',
	snakeHead: '#21c78f',   // 与头 PNG 主色 EXACT 统一（2026-07-24 Python 离线重量：蛇头 PNG 主填充 (33,199,143)=#21c78f；仅 PNG 缺失 fallback 用）
	snakeBody: '#21c78f',   // 与头 PNG 主色 EXACT 统一（同上 #21c78f，蛇头贴图与代码身体零色差·肉眼无缝）
			food: '#ffd84d',
			heal: '#7cff6b',
			skillDrop: '#ffb000',
			enemyChaser: '#ff5b5b',
			enemyWanderer: '#ff8c5b',
			enemyCharger: '#d65bff',
			enemyElite: '#b04bff',
			boss: '#ff2d6b',
			damageText: '#ffffff',
			critText: '#ffe14d',
			neutral: '#8a93b2'
		},

		// —— §5.5 STYLE 视觉真源（纯表现，非 §9 强度值；世界/HUD/卡片/结算全渲染共读，禁散写魔法值）——
		// 统一暗色霓虹语言：同一套色板 + 发光 + 圆角 + 降级常量。COLORS 保留兼容，新代码只读 STYLE。
		// 颜色语义见 GDD §5；比例类常量（cornerRatio/glowBlur/strokeRatio）供「按半径×比例」换算，禁写死像素。
		STYLE: {
			bg: '#11162a',            // 世界底
			player: '#20c088',        // 蛇身/蛇尾主绿（真源）= snake_head.png 主填充 EXACT 一致(#20c088·Python 量得 dominant (32,192,136))→ 头身零色差·肉眼无缝
		playerGlow: '#4dffc3',    // 蛇头光晕（较主绿更亮）
		playerHi: '#3ad6a0',      // 身体高光衍生色（主绿向亮提一档）= snake_head.png 高光带(128,240,192)同系→身体径向渐变中心，使平涂圆身与带光影PNG头读成同一料（消"头身色差"观感·纯渲染）
		lowHp: '#b8465c',         // 低血(1血)蛇身闪色：暗哑红（比 STYLE.enemy 不显眼，仅低血提示，零 gameplay）
			food: '#ffd54a',          // 食物金
			heal: '#ff6b8a',          // 回血红心（玫红·区别于敌红 enemy，靠心形+粉红一眼识别为增益）
			enemyCalm: '#ff9f5a',     // 威胁色阶·暖橙（散步 wanderer）
			enemy: '#ff4d6d',         // 威胁色阶·红（追踪 chaser / 冲锋 charger）
			elite: '#b06bff',         // 威胁色阶·紫（精英 elite）
			boss: '#ff2d95',          // 威胁色阶·品红（Boss）
			ui: '#8becff',            // UI 青（描边 / 高亮 / 技能宝石）
			textMain: '#eaf2ff',      // 主文字
		textDim: '#7f8bad',       // 次文字
		win: '#27c98a',           // alias=player：胜/通关绿（禁新色，值必须等于 player）
		lose: '#ff4d6d',          // alias=enemy：败/死亡红（禁新色，值必须等于 enemy）
		panel: '#1b2340',         // 面板底
			cornerRatio: 0.5,         // 圆角 = 高 × 此比例（胶囊 = 半高）
			glowBlur: 0.6,            // 发光模糊 = 半径 × 此比例
			glowAlpha: 0.55,          // 发光透明度基准
			strokeRatio: 0.08,        // 描边宽 = 半径 × 此比例
			fxLevel: 'high',          // 人工特效降级：high/med/low（叠加在 PerfTier 之上；仅生成入口乘倍率，不动池 update/draw）；GM 经 RT('STYLE.fxLevel') 热调
			particleCap: 300,         // 特效密度参考（实际硬上限仍由 PERF.maxParticles / PerfTier 管控）
			glowMax: 12,              // 每帧 shadowBlur 发光体上限（超出退化平涂，护 FPS）
			panelAlpha: 0.7,          // 面板底透明度
			hudEdgePad: 16,           // HUD 安全边距 px
			hudIconSize: 20,          // HUD 图标基准 px
			// 五技能标志色（键 = 代码实际技能 id：fire/ice/bolt/shield/lightning）
			// 沿用修正版色值 + 撞色规避；仅 shoot→bolt / frost→ice / magnet→lightning 重键到代码真实标识（代码第 5 技能是闪电非磁吸）
			skillFx: {
				bolt:      '#d8ff7a',   // 飞镖/射击（避开 ui 青）
				fire:      '#ff7a3c',   // 火焰
				ice:       '#7fc4ff',   // 冰霜（比 ui 更冷更蓝）
				shield:    '#bff0d8',   // 护盾（避开 food 黄）
			lightning: '#6fa8ff'    // 闪电：更偏冷蓝，与电磁紫青阵地束拉开
			},
			combatFx: {
				electro: {
					// 电磁阵地：冷蓝晶体主体 + 青白高能核心；避开敌方红/品红危险色域。
					body: '#4F67D8', bodyHi: '#8A72E8', edge: '#A483FF', core: '#E9FFFF', coreHot: '#FFFFFF', dark: '#202B66',
					ground: '#536FD8', beam: '#A06CFF', beamCore: '#E9FFFF', impact: '#F4FFFF', impactEdge: '#69E7FF',
					boltAccent: '#D8FF7A', text: '#E3D6FF', textStroke: '#111830', icon: '#C0AFFF', iconBg: '#18234F', hitFlash: '#D9FFFF', hitFlashSec: 0.07
				},
				// Presentation Foundation v2：战斗文字只按语义 role 取 token；元素只可作为轻度 accent，不得自带来源标签或 Emoji。
				text: {
					debugSourceLabels: false,
					tiers: {
						dot: { sizePx: 10, weight: 600, fill: '#ff7a3c', stroke: null, strokePx: 0, lifeSec: 0.6, risePxPerSec: 36, priority: 'low' },
						normal: { sizePx: 14, weight: 700, fill: '#ffd166', stroke: null, strokePx: 0, lifeSec: 0.6, risePxPerSec: 36, priority: 'low' },
						crit: { sizePx: 20, weight: 800, fill: '#fff1a8', stroke: '#1b2340', strokePx: 2.5, lifeSec: 0.72, risePxPerSec: 42, priority: 'high' },
						combo: { sizePx: 18, weight: 800, fill: '#e3d6ff', stroke: '#111830', strokePx: 2.5, lifeSec: 0.72, risePxPerSec: 42, priority: 'high' },
						playerHurt: { sizePx: 14, weight: 800, fill: '#ff4d6d', stroke: '#1b2340', strokePx: 2, lifeSec: 0.6, risePxPerSec: 36, priority: 'high' },
						status: { sizePx: 12, weight: 600, fill: '#7fc4ff', stroke: null, strokePx: 0, lifeSec: 0.45, risePxPerSec: 30, priority: 'low' },
						debugSource: { sizePx: 11, weight: 600, fill: '#7f8bad', stroke: null, strokePx: 0, lifeSec: 0.45, risePxPerSec: 30, priority: 'low' }
					}
				},
				priority: { low: 0, normal: 1, high: 2, danger: 3 },
				// Fire V3：范围必须明显可读，但常驻态不与 Combo 抢峰值。底色负责“这里会烧”，PNG/炽痕负责“这是火”。
				fieldReadability: { fireFillAlpha: 0.120, iceFillBaseAlpha: 0.04, iceFillLifeAlpha: 0.06, shieldHitRingAlpha: 0 },
				skillVfx: {
					fire: {
						// Fire先锋候选：方向中性的近圆簇火。大小只靠 scale，不再使用细长 accent 火舌。
						coreSpriteSrc: 'assets/vfx/fire/vfx_fire_cluster_round_v1.png',
						accentSpriteSrc: 'assets/vfx/fire/vfx_fire_cluster_round_v1.png',
						fillOuterColor: '#ff5f27', fillOuterAlphaByLevel: [0.080, 0.084, 0.088, 0.092, 0.096],
						// 火苗位置：按真实中心线生成左右/头尾 exposed candidates；数量随 Tube 周长增长。
						candidateCenterSpacing: 22, targetVisibleSpacingByLevel: [92, 90, 88, 86, 84], minVisibleFlames: 6, maxVisibleFlames: 18,
						occlusionInsetPx: 3, capCandidateCount: 5, mediumMinDistancePx: 128,
						smallProbabilityByLevel: [0.80, 0.80, 0.79, 0.79, 0.78], mediumProbabilityByLevel: [0.20, 0.20, 0.21, 0.21, 0.22],
						// 单个更小、整体更多：中火只负责节奏，不再出现超长火苗。
						smallHeightMin: 12, smallHeightMax: 17, mediumHeightMin: 18, mediumHeightMax: 24,
						flameRootInset: 3, flameAlpha: 0.82, flameSpriteBaseOffset: 0.90,
						// 近圆簇火不随边界360°旋转；仅做极小固定倾角 + 呼吸/剪切，降低动态噪声。
						staticLeanRad: 0.035, leanRad: 0.020, swayPx: 1.15, breathHz: 0.92, breathScaleY: 0.040, breathScaleX: 0.020,
						rimCoreColor: '#ff9a45', rimGlowColor: '#ff5727', rimCoreWidth: 2.2, rimGlowWidth: 7, rimGlowAlpha: 0.080, rimCoreAlpha: 0.18, rimActivityByLevel: [0.70, 0.76, 0.82, 0.88, 0.94],
						contactAlphaBoost: 0.16, cinderProbability: 0.28, cinderLifetime: 0.38, cinderRisePx: 8, cinderSpreadPx: 3, cinderSizePx: 0.95, cinderAlpha: 0.22, contactCinderAlphaBoost: 0.20, cinderColor: '#ffd06b',
						contactDuration: 0.20, contactHeightBoost: 1.22, contactRimBoost: 0.70, contactAnchorSearchPx: 78, contactGlowRadiusPx: 22,
						hitCoreColor: '#fff0b0', hitCoreLifeSec: 0.13, hitCoreSizePx: 3.2,
						hitEmberColor: '#ff9d42', hitEmberHotColor: '#ffd27a', hitEmberCount: 3, hitEmberSpeed: 72, hitEmberSizePx: 1.6, hitEmberLifeSec: 0.18
					},
					ice: { poolCoreSizePx: 74, poolCoreAlpha: 0.5, burstSizeMul: 1.05, burstLifeSec: 0.34, maxBursts: 8 },
					shield: { orbSpriteSizePx: 30, trailAlpha: 0.18, trailWidthPx: 4, trailColor: '#79ffe5' },
					steam: { burstSizeMul: 1.15, burstLifeSec: 0.28, maxBursts: 8, coreRadiusMul: 0.34, coreColor: 'rgba(190,245,255,0.72)', coreLifeSec: 0.14, outerColor: 'rgba(173,238,255,0.62)', outerLifeSec: 0.42, innerColor: '#ffb05a', innerLifeSec: 0.16 },
					// 远程技能共用节奏：保持晶叶投射物的清爽方向感，燃烧弹幕只加强暖色层与命中余韵，不扩张判定或伤害。
					ranged: {
						bolt: { trailOuterAlpha: 0.16, trailCoreAlpha: 0.44, trailOuterWidthPx: 2.7, trailCoreWidthPx: 1.1, impactLifeSec: 0.17, impactArcPx: 10, impactCorePx: 2.2 },
						burning: { trailOuterAlpha: 0.38, trailCoreAlpha: 0.78, trailOuterWidthPx: 4.2, trailCoreWidthPx: 1.6, impactLifeSec: 0.20, impactArcPx: 13, impactCorePx: 2.8, emberCount: 3 }
					}
				},
				hpBar: { normalMode: 'recent-hit', normalRecentHitSec: 0.7, eliteMode: 'damaged', dummyMode: 'always', heightPx: 3, offsetYPx: 9 },
				statusIcon: { sizePx: 13, maxPerEnemy: 3, offsetYPx: 23, pairGapPx: 9, burn: { outer: '#ff632f', core: '#ffd36b' }, slow: { ring: '#8ceaff', core: '#dff3ff' } }
			}
		},

	// —— UI（仅移动端表现值 · 非 §9 平衡真源） ——
	// 仅控制 HUD/摇杆在手机上的缩放与下限，不牵动任何玩法强度/平衡。
		UI: {
				hudSkin: {
				life: { src: 'assets/ui_hud_v1_extracted/ui_player_life_frame.png', ratio: 3.13, content: { left: 0.22, right: 0.22, top: 0.27, bottom: 0.20 } },
			stats: { src: 'assets/ui_hud_v1_refined/ui_player_stats_compact_v2.png', ratio: 5, columns: [0.159, 0.398, 0.601, 0.840], columnWidths: [0.2766, 0.2031, 0.2016, 0.2766], centerY: 0.48 },
				stage: { src: 'assets/ui_hud_v1_refined/ui_stage_compact_v1.png', ratio: 2.8, content: { left: 0.18, right: 0.18, top: 0.18, bottom: 0.26 }, progress: { left: 0.18, right: 0.18, bottom: 0.16, height: 0.10 } },
				boss: { src: 'assets/ui_hud_v1_refined/ui_boss_wide_refined_v1.png', ratio: 2.875, content: { left: 0.20, right: 0.20, top: 0.20, bottom: 0.24 }, hp: { left: 0.18, right: 0.18, bottom: 0.23, height: 0.14 } },
				skills: { src: 'assets/ui_hud_v1_extracted/ui_skill_bar_frame.png', ratio: 2.83, slots: [{ x: 0.18, y: 0.51 }, { x: 0.34, y: 0.51 }, { x: 0.50, y: 0.51 }, { x: 0.66, y: 0.51 }, { x: 0.82, y: 0.51 }], slotWidth: 0.14, slotHeight: 0.54 },
				combo: { src: 'assets/ui_hud_v1_refined/ui_combo_quiet_v1.png', ratio: 1.8343195266, title: { left: 0.24, right: 0.24, top: 0.08, height: 0.22 }, slots: [{ x: 0.25, y: 0.62 }, { x: 0.50, y: 0.62 }, { x: 0.75, y: 0.62 }], slotWidth: 0.22, slotHeight: 0.42 },
				system: { src: 'assets/ui_hud_v1_refined/ui_system_button_minimal_v1.png', ratio: 1.6923076923, content: { left: 0.18, right: 0.18, top: 0.24, bottom: 0.22 } }
			},
			choiceSkin: {
				panelSrc: 'assets/ui_hud_v1_refined/ui_choice_panel_v1.png',
				normalCardSrc: 'assets/ui_hud_v1_refined/ui_choice_card_normal_v1.png',
				selectedCardSrc: 'assets/ui_hud_v1_refined/ui_choice_card_selected_v1.png'
			},
			openingPage: {
				standardBackgroundSrc: 'assets/ui_hud_v1_refined/opening_background_standard_2560x1440.png',
				wideBackgroundSrc: 'assets/ui_hud_v1_refined/opening_background_wide_2560x1170.png',
				logoSrc: 'assets/ui_hud_v1_refined/this_life_as_snake_logo_night_garden_final_2400.png',
				buttonSrc: 'assets/ui_hud_v1_refined/start_snake_life_button_2x.png',
				wideAspectBreakpoint: 1.95,
				standard: { logo: { left: 3.5, top: 8, width: 54 }, button: { left: 10.5, top: 61, width: 39 }, bgFocusX: 50 },
				wide: { logo: { left: 4, top: 11, width: 40 }, button: { left: 7.5, top: 60, width: 31 }, bgFocusX: 50 }
			},
			icons: {
			paddingPx: 2,
			scale: 1,
			scaleByKind: { card: 1, hud: 1.1, combo: 1 },
			framePx: { card: 34, hud: 30, combo: 26 },
			assets: {
				fire: { src: 'assets/skill_fire_v1.png' },
				ice: { src: 'assets/skill_ice_v1.png' },
				bolt: { src: 'assets/skill_bolt_v1.png' },
				shield: { src: 'assets/skill_shield_v1.png' },
				lightning: { src: 'assets/skill_lightning_v1.png', scale: 1.06 },
				steamExplosion: { src: 'assets/combo_steamExplosion_v1.png', scale: 0.97 },
				electroTurret: { src: 'assets/combo_electroTurret_v1.png', scale: 0.97, offsetByKind: { combo: { x: 0, y: -0.05 } } },
				burningBarrage: { src: 'assets/combo_burningBarrage_v1.png', scale: 1.06, offsetByKind: { combo: { x: 0.04, y: 0 } } }
			}
		},
		// HUD V1 表现参数真源：仅控制界面几何与质感，不参与玩法或碰撞。
		tuning: {
			layout: {
				hudScale: 1, edgePad: 16, topPad: 12, clusterGap: 8,
				statusOffsetX: 0, statusOffsetY: 0, buildOffsetX: 0, buildOffsetY: 0,
				systemOffsetX: 0, systemOffsetY: 0, mobileScaleMin: 0.55, mobileScaleMax: 1.0, mobileHudScale: 1
			},
			playerLife: { overallScale: 0.6, widthVw: 24, offsetX: 1, offsetY: 15, contentScale: 1.27, contentOffsetX: 3, contentOffsetY: 0, heartSize: 28, heartGap: 25, statsGap: 0 },
			playerStats: { overallScale: 0.8, widthVw: 34, offsetX: 6, offsetY: -56, contentScale: 0.74, contentOffsetX: -25, contentOffsetY: 0, labelSize: 17, valueSize: 15, labelValueGap: 1, lengthOffsetX: 0.01, killsOffsetX: 0.08, scoreOffsetX: 0.14, streakOffsetX: 0.19 },
			stage: { overallScale: 1.05, widthVw: 34, offsetX: 0, offsetY: 0, contentScale: 0.90, contentOffsetX: 0, contentOffsetY: 0, titleSize: 20, titleOffsetY: 0, timerSize: 13, timerOffsetY: 0, progressWidth: 0.77, progressHeight: 0.13, progressOffsetX: -0.01, progressOffsetY: -0.02 },
			type: { titlePx: 13, valuePx: 16, bodyPx: 13, metaPx: 11 },
			result: { maxWidthPx: 720, maxHeightPx: 450, mobileCompactHeightPx: 330, memoryHeightPx: 120, memoryMobileHeightPx: 90, eulogyHeightPx: 145, eulogyMobileHeightPx: 100 },
			opening: {
				standard: { logoOffsetX: 0, logoOffsetY: 0, logoScale: 1, buttonOffsetX: 0, buttonOffsetY: 0, buttonScale: 0.8, bgFocusX: 50 },
				wide: { logoOffsetX: 0, logoOffsetY: 0, logoScale: 1, buttonOffsetX: 0, buttonOffsetY: 0, buttonScale: 0.8, bgFocusX: 50 }
			},
      choice: { overallScale: 1.20, maxWidthPx: 881, gapPx: 0, cardWidthPx: 219, cardHeightPx: 265, cardPaddingPx: 39, cardPaddingTopPx: 60, cardPaddingBottomPx: 58, titleSizePx: 22, nameSizePx: 18, descSizePx: 12, badgeSizePx: 11, iconFramePx: 26, iconGapPx: 7, footerGapPx: 10, panelPaddingPx: 38, cardOffsetYPx: -17, titleOffsetYPx: -31 },
			skills: { overallScale: 0.9, widthVw: 34, offsetX: 6, offsetY: 14, badgePx: 17 },
			combo: { overallScale: 0.75, widthVw: 24, offsetX: 0, offsetY: -16, icon1OffsetX: -4, icon1OffsetY: -8, icon2OffsetX: 0, icon2OffsetY: -6, icon3OffsetX: 2, icon3OffsetY: -7 },
			bossBar: { widthPct: 0.58, maxWidthPx: 560, offsetY: -24, nameX: 0.50, nameY: 0.40, nameSize: 21, subtitleX: 0.50, subtitleY: 0.73, subtitleSize: 14, hpX: 0.50, hpY: 0.58, hpWidth: 0.76, hpHeight: 0.20, hpTextSize: 17 },
			system: { buttonScale: 0.55, textSize: 19, offsetX: 8, offsetY: -68, gapPx: 0 },
			// iPhone / Android 横屏只覆盖内部排版：外层锚点继续由 env(safe-area-inset-*) 负责，桌面值保持不变。
			mobile: { lifeContentScale: 1.12, systemButtonScale: 0.80, systemLocalOffsetY: 0 }
		},
		mobileScaleClamp: { min: 0.55, max: 1.0 }  // 🟡 HUD 等比缩放 uiScale 钳制区间：矮屏(高375→~0.69)压到 0.55 防溢出；上限 1.0=原始尺寸→桌面(画布显示高>540)缩放恒为 1 不变，零回归
	},

	// —— 音频（Web Audio 合成 · 资产豁免） ——
		AUDIO: {
			enabled: true,
			masterVolume: 0.72,
			sfxVolume: 0.78,
			uiVolume: 0.68,
			bgmVolume: 0.37,
			mix: {
				// Phase 1：声音先分语义、再竞争声部。高优先级反馈可以替换低优先级噪声，不能靠所有声音一起变响。
				maxSfxVoices: 16, maxUiVoices: 10,
				voiceBudget: { skill: 6, combo: 5, player: 4, impact: 4, death: 4, boss: 5, ui: 6 },
				skillBusGain: 0.88, comboBusGain: 0.98, playerBusGain: 1.00, impactBusGain: 0.62, deathBusGain: 0.72, bossBusGain: 1.00,
				densityWindowMs: 220, densityThreshold: 5, densityDuckMul: 0.80, densityReleaseMs: 260,
				lightDuckMul: 0.82, lightDuckSec: 0.16, majorDuckMul: 0.60, majorDuckSec: 0.28,
				chooseDuckMul: 0.54, pauseRampSec: 0.06, deathSilenceSec: 0.12,
				limiterThresholdDb: -8, limiterKneeDb: 12, limiterRatio: 4, limiterAttackSec: 0.003, limiterReleaseSec: 0.16,
				bgmPressureStart: 1.20, bgmPressureEnd: 2.80, bgmPressureFloor: 0.92
			},
			music: {
				// Phase 1.2: five exclusive arrangements share one bright night-garden motif.
				// Stages transition on a bar boundary; the previous arrangement fades OUT instead of remaining underneath.
				stageBpm: [92, 104, 116, 130, 142],
				stageHeat: [0.00, 0.78, 1.50, 2.22, 2.90],
				stageBgmGainByStage: [0.94, 1.00, 1.06, 1.10, 1.13],
				padGainByStage: [0.026, 0.028, 0.025, 0.021, 0.018],
				padCutoffByStage: [2200, 2400, 2650, 2900, 3150],
				padStepsByStage: [11, 12, 10, 8, 7],
				padAttackSec: 0.30, padReleaseSec: 0.42,
				motiveGainByStage: [0.041, 0.047, 0.052, 0.058, 0.062],
				bassGainByStage: [0.000, 0.043, 0.056, 0.066, 0.074],
				arpGainByStage: [0.000, 0.012, 0.024, 0.032, 0.036],
				kickGainByStage: [0.000, 0.000, 0.043, 0.057, 0.067],
				snareGainByStage: [0.000, 0.000, 0.024, 0.032, 0.038],
				hatGainByStage: [0.000, 0.006, 0.014, 0.020, 0.024],
				transitionGainByStage: [0.000, 0.045, 0.052, 0.060, 0.068],
				kickFilterHz: 520, snareFilterHz: 1500, hatFilterHz: 3400,
				stageCrossfadeSec: 0.72
			},
			hit: {
				// 同一次伤害只保留一个主要音效所有者：专属技能事件拥有声音时，通用命中音静音。
				genericThrottleMs: 85,
				genericNoiseDuration: 0.040, genericNoiseGain: 0.040, genericNoiseHz: 980,
				genericBodyStartHz: 270, genericBodyEndHz: 165, genericBodyDuration: 0.055, genericBodyGain: 0.052,
				critBodyStartHz: 360, critBodyEndHz: 125, critBodyDuration: 0.090, critBodyGain: 0.085,
				fireThrottleMs: 190, fireDuration: 0.150, fireNoiseGain: 0.066, fireNoiseMinHz: 760, fireNoiseMaxHz: 1040,
				fireBodyStartHz: 235, fireBodyEndHz: 155, fireBodyGain: 0.032,
				shieldThrottleMs: 210, shieldStartHz: 430, shieldEndHz: 250, shieldDuration: 0.075, shieldGain: 0.050,
				burnThrottleMs: 250, burnNoiseHz: 1450, burnNoiseGain: 0.040, burnDuration: 0.090,
				burnBodyStartHz: 390, burnBodyEndHz: 230, burnBodyGain: 0.035
			},
			death: {
				// 同一小时间窗内的群怪死亡聚合为一次“塌落”，数量增加层次而不是线性叠音量。
				clusterMs: 55, maxClusterCount: 6,
				noiseDuration: 0.095, noiseGain: 0.080, noiseHz: 620,
				bodyDuration: 0.110, bodyGain: 0.060,
				kindStartHz: { wanderer: 245, chaser: 225, charger: 195, elite: 145, dummy: 245 },
				eliteLowStartHz: 105, eliteLowEndHz: 48, eliteLowDuration: 0.180, eliteLowGain: 0.100
			},
			skills: {
				bolt: {
					throttleMs: 95, noiseDuration: 0.040, noiseGainByLevel: [0.032, 0.035, 0.038, 0.042, 0.046], noiseHz: 1750,
					startHzByLevel: [820, 850, 890, 940, 1000], endHzByLevel: [480, 500, 525, 555, 590],
					durationByLevel: [0.065, 0.068, 0.072, 0.076, 0.082], gainByLevel: [0.070, 0.074, 0.078, 0.083, 0.089]
				},
				ice: {
					throwThrottleMs: 130, throwStartHzByLevel: [980, 1030, 1090, 1160, 1240], throwEndHz: 520,
					throwDuration: 0.105, throwGainByLevel: [0.055, 0.059, 0.064, 0.070, 0.077],
					poolThrottleMs: 190, poolStartHzByLevel: [410, 430, 455, 485, 520], poolEndHzByLevel: [760, 810, 870, 940, 1020],
					poolDuration: 0.170, poolGainByLevel: [0.045, 0.049, 0.054, 0.060, 0.067], poolAirGain: 0.032
				},
				steam: {
					throttleMs: 210, noiseDuration: 0.145, noiseGain: 0.075, noiseHz: 1100,
					bodyStartHz: 185, bodyEndHz: 78, bodyDuration: 0.155, bodyGain: 0.105,
					ventStartHz: 720, ventEndHz: 1180, ventDuration: 0.120, ventGain: 0.036
				},
				burnDart: {
					throttleMs: 125, noiseDuration: 0.070, noiseGain: 0.052, noiseHz: 1320,
					bodyStartHz: 460, bodyEndHz: 205, bodyDuration: 0.095, bodyGain: 0.064,
					emberStartHz: 980, emberEndHz: 610, emberDuration: 0.060, emberGain: 0.030
				}
			},
			electric: {
				// 电系音频结项：基础闪电=高频裂响/滋滋尾音；电磁炮台=低频炮击/能量回响。只控制表现，不参与玩法。
				gateMs: 120,
				lightning: {
					crackleDurationByLevel: [0.09, 0.10, 0.11, 0.12, 0.13],
					crackleGainByLevel: [0.075, 0.085, 0.095, 0.105, 0.115],
					crackleHzByLevel: [2350, 2550, 2750, 3000, 3300], crackleQ: 0.75,
					snapStartHzByLevel: [1080, 1140, 1210, 1290, 1380],
					snapEndHzByLevel: [610, 640, 680, 730, 790],
					snapDurationByLevel: [0.075, 0.080, 0.085, 0.090, 0.100],
					snapGainByLevel: [0.100, 0.110, 0.120, 0.130, 0.140],
					tailStartHzByLevel: [920, 980, 1040, 1120, 1220],
					tailEndHzByLevel: [1380, 1480, 1600, 1740, 1900],
					tailDurationByLevel: [0.10, 0.11, 0.12, 0.13, 0.14],
					tailGainByLevel: [0.034, 0.038, 0.043, 0.048, 0.054],
					pulseCountByLevel: [1, 1, 2, 2, 3], pulseSpacingSec: 0.026, pulseDurationSec: 0.034,
					pulseGainByLevel: [0.028, 0.030, 0.032, 0.035, 0.038]
				},
				electro: {
					deployStartHz: 180, deployEndHz: 560, deployDuration: 0.16, deployGain: 0.065,
					deployBodyStartHz: 240, deployBodyEndHz: 330, deployBodyGain: 0.035,
					fireBodyStartHzByLevel: [185, 180, 175, 170, 165], fireBodyEndHz: 72,
					fireBodyDurationByLevel: [0.110, 0.115, 0.120, 0.130, 0.140],
					fireBodyGainByLevel: [0.140, 0.150, 0.160, 0.175, 0.190],
					fireClickStartHz: 560, fireClickEndHz: 220, fireClickDuration: 0.045,
					fireClickGainByLevel: [0.055, 0.060, 0.065, 0.070, 0.075],
					blastNoiseHz: 760, blastNoiseQ: 0.75, blastNoiseDuration: 0.065,
					blastNoiseGainByLevel: [0.070, 0.078, 0.086, 0.095, 0.105],
					energyStartHzByLevel: [720, 760, 810, 870, 940],
					energyEndHzByLevel: [380, 410, 440, 480, 520], energyDuration: 0.085,
					energyGainByLevel: [0.045, 0.050, 0.055, 0.060, 0.068],
					endStartHz: 360, endEndHz: 130, endDuration: 0.12, endGain: 0.035
				}
			}
		},

		// —— Debug ——
		VFX: {
			electric: {
				denseEnemyMin: 28, maxChainPoints: 8, residueDenseMul: 0.95, maxBeamsByTier: { HIGH: 32, MED: 24, LOW: 16, POTATO: 12 },
				lightning: {
					// V4.6：整条电链统一在实体上层绘制；使用固定的短折点保持“跳链”身份，不逐帧随机、不重算伤害。
					widthByLevel: [3.8, 4.6, 5.5, 6.6, 7.8],
					hopDelayByLevel: [0.055, 0.052, 0.049, 0.046, 0.043],
					impactDurationByLevel: [0.065, 0.070, 0.078, 0.086, 0.098],
					fadeDurationByLevel: [0.110, 0.120, 0.132, 0.145, 0.160],
					kinkCountByLevel: [1, 1, 1, 2, 2], kinkAmplitudeByLevel: [4.5, 5.5, 6.5, 7.5, 8.5], kinkMaxSegmentRatio: 0.14,
					outerWidthRatio: 1.78, outerAlpha: 0.18, mainAlpha: 0.96, fadeMainAlpha: 0.24,
					impactCoreAlphaLow: 0.70, impactCoreAlphaHigh: 0.96, impactCoreWidthRatio: 0.34,
					propagateCoreAlpha: 0.60, fadeCoreAlpha: 0.28, nodePulseLifeSec: 0.120,
					nodeImpactRadiusByLevel: [5.8, 6.5, 7.3, 8.3, 9.5], nodeImpactRingMul: 1.68, levelFiveBurstLifeSec: 0.12,
					travelTipRadiusByLevel: [2.2, 2.4, 2.7, 3.0, 3.4], jointRadiusByLevel: [1.8, 2.0, 2.2, 2.5, 2.8]
				},
				electro: {
					// V4.6：低空悬浮炮台在怪群中由克制的深蓝承托稳住本体；成长仍交给齐射和命中，不改变攻击范围或次数。
					radiusByLevel: [28, 32, 36, 40, 44],
					spriteSrc: 'assets/vfx/electro_turret_world_v4_final.png',
					spriteWidthByLevel: [62, 66, 70, 74, 78], spriteAspect: 1.60, spritePivotY: 0.92,
					coreXRatio: 0.50, coreYRatio: 0.49, ringRadiusXRatio: 0.17, ringRadiusYRatio: 0.105,
					budLeft: [0.25, 0.31], budRight: [0.75, 0.31], budFront: [0.50, 0.74],
					breathSec: 1.15, breathScale: 0.030, hoverLiftPx: 6, hoverBobPx: 1.25, chargeLeadSec: 0.26,
					shadowScaleX: 0.40, shadowScaleY: 0.115, scanDurationSec: 0.26,
					beamFullSec: 0.12, beamFadeSec: 0.13, recoilRecoverSec: 0.22, impactLifeSec: 0.15,
					idleBudAlpha: 0.27, idleOrbitCount: 3, chargeBudGlowPx: 4.0, chargeCoreArcCount: 3,
					fireAccentLifeSec: 0.18, fireAccentSpokes: 8, fireSparkCount: 4,
					beamMainWidthByComboLevel: [5.0, 6.1, 7.3, 8.7, 10.2],
					beamCoreWidthByComboLevel: [1.45, 1.75, 2.10, 2.50, 2.95],
					impactRadiusByLevel: [12, 14, 16, 19, 22], impactLifeSec: 0.19, bodyBackplateAlpha: 0.64, bodyBackplateWidthScale: 0.50, bodyBackplateHeightScale: 0.34
				}
			}
		},
		DEBUG: { enabled: true, showHitboxes: false, showSpatialGrid: false, showFps: true, editorEnabled: true }
	}

	global.CONFIG = CONFIG
	Object.freeze(CONFIG)

})(typeof window !== 'undefined' ? window : this)
