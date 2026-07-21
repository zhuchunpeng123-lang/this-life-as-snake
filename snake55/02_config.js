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
			touch: { deadZone: 18 }   // 🟡 触控死区(px 逻辑)：触控精度低于鼠标，略大于 PLAYER.deadZoneRadius(12) 防抖；纯输入手感，不进 §9
		},

		// —— §1 PLAYER ——
		PLAYER: {
			snakeSpeed: 200,
			turnRate: 180,
			turnRateDecayPerSeg: 0.006,
			turnRateFloor: 120,
			segmentSpacing: 24,
			followLerp: 0.4,
			initSegments: 3,
			maxSegments: 25,
			coreHp: 3,
			headRadius: 14,
			bodyRadius: 12,
			headKnockback: 0,
			buildPauseCdMs: 800,
			deadZoneRadius: 12,
			camera: { followLerp: 0.12, lookAhead: 60, deadZone: 30 },
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
				HIGH:   { maxBackW: 1600, worldScale: 0.80, maxParticles: 240, maxTexts: 48, spawnBudget: 120, suppressFire: false, suppressIceFill: false, suppressShake: false, suppressWhiteBurst: false, simpleVignette: false },
				MED:    { maxBackW: 1280, worldScale: 0.92, maxParticles: 170, maxTexts: 40, spawnBudget: 90,  suppressFire: false, suppressIceFill: false, suppressShake: false, suppressWhiteBurst: false, simpleVignette: false },
				LOW:    { maxBackW: 1024, worldScale: 0.88, maxParticles: 120, maxTexts: 32, spawnBudget: 70,  suppressFire: true,  suppressIceFill: false, suppressShake: false, suppressWhiteBurst: true,  simpleVignette: false },
				POTATO: { maxBackW: 800,  worldScale: 0.84, maxParticles: 80,  maxTexts: 24, spawnBudget: 50,  suppressFire: true,  suppressIceFill: true,  suppressShake: true,  suppressWhiteBurst: true,  simpleVignette: true }
			}
		},
		// —— 纯视觉渲染（非 §9 平衡值；视图缩放仅改世界显示尺寸，不影响碰撞/坐标/平衡）——
		RENDER: {
			worldScale: 0.8          // 视图缩放默认 0.8（还原「更小更精致」蛇/怪画面）；GM「视图缩放(纯视觉)」滑条 0.6–1.0 实时可调；×1.0=原始 1:1（注：此值仅作文档真理源，render 实际由 RT('RENDER.worldScale',0.8) 取、editor 覆盖优先）
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
			chaser: { hp: 20, atk: 1, speed: 120, senseRange: -1, radius: 11 },
			wanderer: { hp: 15, atk: 1, speed: 80, senseRange: 250, radius: 10 },
			charger: { hp: 25, atk: 1, speed: 90, chargeSpeed: 160, senseRange: 350, radius: 14, chargeWindupSec: 0.7, stunSec: 1.0 },
			elite: { hp: 200, atk: 1, speed: 60, senseRange: -1, radius: 24 },
			boss: { hpTotal: 17500, hpPhase1: 8750, hpPhase2: 8750, atk: 1, speedPhase1: 110, speedPhase2: 70, phaseThresholdPct: 0.5, transitionInvulnSec: 2.0, bulletSpeed: 140, radius: 60 }
		},

		SPAWN: { ringInner: 520, ringOuter: 760 },

		SPATIAL: { cellSize: 64 },

		// —— §4 SKILL（每技能 5 级数组）+ §4.6 COMBO ——
		SKILL: {
			maxLevel: 5,
			list: ['fire', 'ice', 'bolt', 'shield', 'lightning'],
			attackSkills: ['fire', 'bolt', 'lightning'],
			survivalSkills: ['ice', 'shield'],
		fire: { dotPerSec: [6, 9, 13, 18, 24], radius: [60, 75, 90, 108, 128], segStep: 1, lv5: 'spreadBurn' },  // B-2：半径放大×1.5初值，沿蛇身铺开（真理源 §4.1，待实测回填）
		ice: { slowPct: [0.20, 0.30, 0.40, 0.50, 0.60], lv5FreezeSec: 1.0, freezeCd: 3.0, poolLingerSec: [4, 5, 6, 7, 8], maxActivePools: 2, poolRadius: [90, 110, 130, 150, 170], seekRange: [100, 140, 180, 220, 260] },  // ⑥ 系统性调整（大范围·持续控制场）：poolLingerSec 改按等级[4,5,6,7,8](冰池存续拉长·供敌群聚拢+火墙多次扫爆)·新增 maxActivePools=2(并发冰池上限·2片稳定大控制场)·poolRadius[5]=[90,110,130,150,170](全等级≥蒸汽90px·冰圈≥爆圈)·freezeCd=3.0不动·slowPct/Lv5冻结1s不动；蒸汽COMBO.steamExplosion.radius=90不动(选A·仅e.inIce防冰圈外凭空引爆)；真理源§4.2回写，③校验DPS/密度
		bolt: { damage: [10, 13, 16, 20, 25], nodes: [1, 2, 3, 4, 5], fireRate: [2.0, 2.2, 2.5, 2.8, 3.2], maxRange: [100, 140, 180, 220, 260], lv5: 'pierce+1' },  // P1-1 射程门控（px）
		shield: { count: [1, 2, 3, 4, 5], contactDamage: [8, 11, 14, 18, 22], orbitRadius: [30, 40, 50, 60, 70], orbitSec: 1.6, orbitHitMul: 0.5, lv5: 'reflect' },  // B-2：orbitRadius 收紧为贴头点防曲线 A[30,40,50,60,70]（headRadius=14，球落点刚好头外侧，不扩全身/不压火墙）；orbitSec 取代写死常量 1.6（§4.4 待实测回填）；orbitHitMul=护盾球命中半径占 orbitRadius 比例（🟡 几何因子，待标定回填 §9）
			lightning: { damage: [9, 12, 15, 19, 24], chains: [2, 3, 4, 5, 7], intervalSec: [1.2, 1.1, 1.0, 0.9, 0.8], maxRange: [120, 155, 190, 225, 240], lv5: 'stun' }  // P1-1 首跳射程门控（px）
		},

		COMBO: {
			steamExplosion: { parts: ['fire', 'ice'], damageMul: 2.5, radius: 90 },
			electroTurret: { parts: ['bolt', 'lightning'], chains: 3, damageMul: 1.5, cooldownSec: 0.5 },
			burningBarrage: { parts: ['fire', 'bolt'], burnDps: 8, burnSec: 3 }
		},

		// —— §5 PICKUP ——
		PICKUP: {
			// ✅ 确认 food.radius=10
			food: { screenCap: 6, refreshIntervalSec: 2.5, segCap: 25, gainSegments: 1, safeDistance: 180, minSpacing: 80, radius: 10 },
			skill: { baseDropRate: 0.12, perOwnedPenalty: 0.02, floorRate: 0.03 },
			skillPity: { killStreakGuarantee: 15, firstSkillGuaranteeSec: 9 },   // P0-1 裁定：≤10s（9s）内给首技能
			heal: { gainHp: 1, maxHp: 3, naturalRefreshSec: 45, perRunMin: 2, perRunMax: 3, screenCap: 1 },
			dangerBias: { ringMin: 40, ringMax: 150 }   // 🟡 补给危险偏向：敌身周围偏移环带(px)，落点钳视野内且不贴脸；候选 ringMin 30/40 · ringMax 120/150/180，待实测量化回写 §9
		},

		// —— §6 STAGE（cap/rate/时间窗=确认；🟡 pool=GDD 文字推断） ——
		STAGE: {
			segments: [
				{ id: 1, name: '保护期', startSec: 0, endSec: 60, cap: 4, spawnRate: 0.5, pool: ['chaser'] },
				{ id: 2, name: '成长期', startSec: 60, endSec: 180, cap: 12, spawnRate: 2.8, pool: ['chaser', 'wanderer'] },
				{ id: 3, name: '割草期', startSec: 180, endSec: 360, cap: 28, spawnRate: 7, pool: ['chaser', 'wanderer', 'charger', 'elite'] },
				{ id: 4, name: '高潮期', startSec: 360, endSec: 480, cap: 50, spawnRate: 16, pool: ['chaser', 'wanderer', 'charger', 'elite'] },
				{ id: 5, name: 'Boss期', startSec: 480, endSec: 600, cap: 8, spawnRate: 1.5, pool: ['chaser', 'elite'] }
			],
			rookieProtect: [
				{ startSec: 0, endSec: 10, speedMul: 0.6, cap: 2 },
				{ startSec: 10, endSec: 30, speedMul: 0.8, cap: 4 }
			],
			lethalProtectSec: 30,
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
			newSkillWeight: 0.70,
			upgradeWeight: 0.30,
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
			deathStillSec: 1.0,
			carouselSec: 4, carouselCountMin: 3, carouselCountMax: 5,
			aiTextSec: 12, aiTextSecMin: 10, aiTextSecMax: 14,
			staticHardcapSec: 20,
			choicePerRunMin: 1, choicePerRunMax: 2,
			templateSkeletonMin: 12,
			aiTextCharMin: 80, aiTextCharMax: 120,

			// §8.6 走马灯节点文案池（蛇尾→蛇头逐节点亮；无事件节点按生命阶段 p=节序/总长 取）
			flashback: {
				stageThresholds: { youngMax: 0.33, primeMax: 0.70 },
				perNodeMs: 600,
				samplingCapMs: 5000,
				headClosingLine: '……然后，故事停在了这里。',
				stageLines: {
					young: ['最初那一口，它还不懂贪婪的滋味', '世界很小，够吃就好', '第一次伸长，连影子也长了一寸', '那时转弯还笨拙，却什么都不怕'],
					prime: ['它学会了挑食物吃，也学会了为一口涉险', '身后跟着越来越长的自己，它开始回不了头', '火力盖过恐惧的那一段，最像活着', '越长越强，它以为这趟没有尽头'],
					old: ['靠近头的这几口，是最舍不得、也最后悔的', '它已经很长了，长到每一步都要算计', '「再贪一口」——这个念头，它听过很多次', '光开始变暗，它还在往前']
				},
				eventLines: {
					firstUpgrade: '它第一次选择成为什么——从此身上多了名字以外的东西',
					comboSteam: '有一年，它让冰与火同时炸开，半片天都亮了',
					comboElectro: '它把闪电拴在弹道上，那是它火力的巅峰',
					comboBurn: '它燃烧着前进，连退路都点着了',
					killElite: '它扳倒过比自己大一圈的庞然，没人记得，但它记得',
					bossEncounter: '终点的守卫挡在那里，它听见了自己的心跳',
					hurt: '这一口差点要了它的命，疤就留在这一节',
					heal: '悬崖边上，有什么把它轻轻拉了回来',
					choice: '它在岔路上选了一条，另一条永远不会知道通向哪'
				}
			},

			// §8.7 蛇生短文模板库（死法4 × 构筑倾向3 = 12 骨架；槽位 {maxLen}/{maxStage}/{build}/{topCombo}/{kills}）
			eulogy: {
				varDefaults: { maxLen: '没长多少', maxStage: '前路', build: '它的本事', topCombo: '它的看家招式', kills: '数不清的', choice: '' },
				templates: {
					greedy: {
						fire: '这条蛇死得太早。才 {maxLen} 节长，火还没烧旺，就为一口够不着的食物把头探进了怪潮。{build} 的火光，只照亮了它最后扑空的方向。它没活到燎原那天——急着长大，急着变强，急着证明自己配得上更远的地方。然后，急着死了。',
						ice: '它算计了一切，唯独算错了自己的贪心。才 {maxLen} 节，它就想用 {build} 冻住整片场地，再从容收割——可那一口食物太诱人，它探出去的半秒，没有谁来得及替它减速。聪明的蛇，也会死在自己最得意的那一步上。',
						mixed: '一条本可以走得很远的蛇。它稳，它忍，它把 {build} 铺得周全——可再周全的人，也有沉不住气的一瞬。{maxLen} 节，它为多吃一口赌了一把，输了。墓碑上该写：它什么都防住了，除了自己伸出去的那一下。'
					},
					attrition: {
						fire: '它燃尽了。{maxLen} 节的身躯一路烧到 {maxStage}，{kills} 具残骸铺在身后。火系的蛇从不退，它只是一直烧、一直烧，直到最后一颗火星也照不亮下一个敌人。不是它不够强——是它太想烧光所有黑暗，忘了火也会灭。',
						ice: '它一寸寸被磨穿。{build} 把进攻拖成了消耗，怪潮却比它的耐心更长。{maxLen} 节，走到 {maxStage}，它冻住了无数次冲锋，唯独没能冻住时间。最冷静的蛇，最后输给了不肯停下的潮水。',
						mixed: '它坚守到了最后一刻。{kills} 次干净的格挡与反击，{maxLen} 节身躯当过盾、也当过墙，一直撑到 {maxStage} 才力竭。没有惊天动地的死法，只有一句配得上它的话——它尽力了，比谁都尽力。'
					},
					boss: {
						fire: '只差一步。{maxLen} 节、闯到 {maxStage}，它带着烧穿一路的气势撞到终点守卫面前——火力够猛，却在最后那道防线前耗尽了最后一口气。{topCombo} 的余烬还在闪，它却没能看见守卫倒下的样子。烈火常常这样：照亮了终点，偏偏烧不到那里。',
						ice: '终局的寒霜。它一路控、一路算，把 {build} 打磨到几乎能冻住时间——可守卫的血条，比它的从容厚了那么一点点。{maxLen} 节的算计，停在了离胜利最近的地方。它输得很安静，像一局快要解开、却终究没解开的棋。',
						mixed: '守门人的遗憾。它几乎什么都做对了：稳健的 {build}、{kills} 次不慌不忙的击杀、{maxLen} 节恰到好处的身躯——只差一点运气，只差最后一口血。它倒在终点的门槛上，姿势依然周全。'
					},
					clear: {
						fire: '燎原功成。这条蛇用 {maxLen} 节的身躯、一路烧穿的 {kills} 次击杀，把终点守卫也烧成了灰。{topCombo} 是它的高光，也是它的注脚——它从最小的一口食物，一直贪到了世界的尽头。而这一次，贪婪带它赢了。',
						ice: '冰封王座。它没有最猛的火，却有最冷的头脑。{build} 一层层冻住了所有冲锋，{maxLen} 节身躯像一张缓缓收拢的网，把终点守卫困死在最后一寸。它赢得不喧哗，却赢得彻底。',
						mixed: '周全的胜利。{maxLen} 节，{kills} 次击杀，没有一次该退时硬撑，也没有一次该进时犹豫。它把每一份贪婪，都恰好换成了够用的强大，稳稳走到了终点。这条蛇，活成了它想成为的样子。'
					}
				},
				fallback: '一条蛇走完了它的一生。{maxLen} 节，{kills} 次撕咬，最终倒在了 {maxStage}。它贪过、强过、也怕过——这就够了，这就是它的蛇生。'
			},

			// §8.7.3 分类阈值（死法主判据=关卡段深度 split：段≤greedyStageMax→贪死 / 段≥bossStageId→Boss前中 / 其间(段③④)→血耗尽 / 击杀Boss→通关；构筑倾向按技能等级占比 MVP）
			classify: {
				deathCause: { greedyStageMax: 2, bossStageId: 5 },
				buildLean: { fireThreshold: 0.5 }
			},

			// §8.8 不可逆抉择事件库（每局 ≤choicePerRunMax 次，非阻塞 overlay，超时走默认；记忆标签喂 §8.6/§8.7）
			// 触发口径：含 segId→按关卡段触发；含 skillCount→按「不同技能计数」精确触发（CH-02 首次满 3 技能、不再用段③；CH-05 段④近似=MVP 待实测校准）
			choices: {
				timeoutSec: 8,
				events: [
					{ id: 'CH-01', firstSkillRequired: true, minSegments: 5, desc: '一团食物挤在怪堆里，身后却是空旷的安全地带。', a: { text: '探进去抢', seg: 2, memory: '贪婪的少年' }, b: { text: '绕开求稳', seg: 0, memory: '谨慎的少年' }, def: 'b' },  // P1-3：双条件触发（移除 segId:1）
					{ id: 'CH-02', skillCount: 3, desc: '一个没见过的新技能道具，和一个熟悉技能的升级，同时出现在眼前。', a: { text: '赌新技能', memory: '不安分的一生' }, b: { text: '深耕已有', memory: '专注的一生' }, def: 'b' },
					{ id: 'CH-03', segId: 3, desc: '一只精英守着回血道具，旁边小怪正在涌来。', a: { text: '先抢回血', hp: 1, memory: '惜命的人' }, b: { text: '先清场再说', memory: '逞强的人' }, def: 'a' },
					{ id: 'CH-04', segId: 5, desc: '终点的门已经能看见。要不要回头，把落下的食物吃干净？', a: { text: '回头吃满', seg: 1, memory: '不留遗憾' }, b: { text: '直奔终点', memory: '一往无前' }, def: 'b' },
					{ id: 'CH-05', segId: 4, desc: '一段金光闪动的记忆碎片，偏偏落在弹幕最密处。', a: { text: '冒死去取', memory: '放不下的执念' }, b: { text: '放手', memory: '学会了释然' }, def: 'b' }
				]
			},

			// §8.9 结算屏战绩九项（评语映射 + 局数本地键）
			scoreboard: {
				localStorageKey: 'snake55_runCount',
				verdictByDeathCause: { greedy: '贪婪的少年', attrition: '燃尽的烈火', boss: '功亏一篑的守门人', clear: '周全的胜者' }
			}
		},

		// —— §5 色彩语义（GDD §5 · 资产豁免） ——
		COLORS: {
			background: '#11162a',
			worldBorder: '#2a3358',
			snakeHead: '#3effa8',
			snakeBody: '#27c98a',
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

		// —— 音频（Web Audio 合成 · 资产豁免） ——
		AUDIO: { enabled: true, masterVolume: 0.7, sfxVolume: 0.8, bgmVolume: 0.4 },

		// —— Debug ——
		DEBUG: { enabled: false, showHitboxes: false, showSpatialGrid: false, showFps: true, editorEnabled: false }
	}

	global.CONFIG = CONFIG
	Object.freeze(CONFIG)

})(typeof window !== 'undefined' ? window : this)
