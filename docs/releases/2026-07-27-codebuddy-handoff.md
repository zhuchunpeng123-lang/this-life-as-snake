# HANDOFF-CODEX.md · 项目交接圣经（给接续 AI：Codex / 任意协作者）

> **2026-07-27 Codex 接手说明**：本文是 CodeBuddy 封版交接资料，保留作历史证据和深查入口；它不再是每日开工规则源。日常执行优先读根目录 `AGENTS.md`，Git/调参/文档治理流程读 `docs/workflow.md`。若本文与 `AGENTS.md`、当前代码或 `docs/workflow.md` 冲突，以后者为准。
> **当前主工作区**：`F:\贪吃蛇游戏项目-Codex\_git-main`；Codex 接手标签为 `codex-handoff-20260727`。

> **目标**：读毕即对整个项目了如指掌，可独立定位 bug、扩展特性、不踩历史巨坑。
> **读者**：接续本项目修 bug / 做特性的 AI（下称「你」）。人类项目负责人（用户）保留所有「计划确认 / §9 真源回写 / 发布开关」决策权。
> **配套文档**：`AGENTS.md`（守则·最高优先）、`CHANGELOG.md`（改动流水）、`docs/DEBT.md`（债台账）、`docs/plans/STATUS.md`（计划索引）、`docs/RETRO.md`（复盘教训）、`docs/workflow.md`（协作细则）、`docs/releases/2026-07-27-freeze.md`（封版快照）。

---

## 0. 30 秒速览

- **是什么**：网页版「贪吃蛇 + Roguelike + 叙事」融合玩法原型，代号「5.5 好玩基因融合版」。中文 UI。
- **技术栈**：纯原生 JS（ES5 风格、无框架、无构建步骤、无 npm、无 import/export）。全部模块挂 `window` 全局，靠 `<script>` 顺序加载。
- **规模**：`snake55/` 下 16 个 `.js` + `index.html` + `manifest.webmanifest` + `assets/`（5 张敌人 PNG + 1 张蛇头 PNG）。`docs/` 下 GDD/§9/DEBT/STATUS/RETRO/workflow/RELEASE/HANDOFF。
- **怎么跑**：静态托管 `snake55/` → 浏览器开 `index.html`。**移动端必须 http/https**（file:// 测不了音频手势解锁，且带 `?v=` 的脚本会 404）。
- **当前状态**：`2026-07-27` 封版快照，commit `5a5b5d6`。桌面/移动端可玩；**B-TUNE 发布硬阻塞未解**（见 §7）。

---

## 1. 项目定位与设计意图

- 玩法基因：贪吃蛇（恒速 200、吃食物成长）+ Roguelike（波次/三选一升级/技能 combo）+ 叙事（NARR 分区，叙事层）。
- **设计意图** → `docs/《此生为蛇》｜5.5 好玩基因融合版 · 全量 GDD v0.3 · 设计意图层》`。GDD 只给意图，**不给裸数字**。
- **数值真理源** → `docs/《此生为蛇》｜5.5 好玩基因融合版 · 数值策划文档（数值真理源 v0.3） 96a2f9cc...》`（简称 §9）。**这是唯一数值真源。**
- ⚠️ **铁律**：AI **绝不修改 §9 真源 MD**，也绝不改 `02_config.js` 的数值结构去「双写真相」。AI 只做：改 `02_config.js` 取值 + 在 `docs/DEBT.md` §9 回写清单记账 + 提示用户回写真源（顺序见 AGENTS.md §七，不可反）。

---

## 2. 最高优先 · 不可违反的硬规则（动手前必读）

> 以下来自 `AGENTS.md`。违反任一条都可能让整个游戏白屏/静默失效。

### §二 锁死清单（绝对不可动，除非走流程）
1. **脚本加载顺序**（`index.html` 的 15 个 `<script>` 顺序：L1 数据→L3 引擎→L5 系统→L6 渲染→L7 调试→入口）。禁止 import/export，全部挂 `window` 全局。
2. **`02_config.js` 的数值结构**：改数值走内置 `~` 调参器或明确申请；禁止在业务代码里写裸数字（§六 铁律）。
3. **`03_core.js` / `04_collision.js`** 默认不动；必须动时先走 §三 流程并**显式告知用户确认**。

### §八 改动前必先出计划（🔒 硬墙）
任何对代码的改动，动手前必须产出《计划》（目标 / 涉及文件 / 具体改动点 / 不动的底层 / 验收标准），**等用户确认**后才落地，落地后出《测试清单》供用户浏览器手动复验。
- 纯数值调参（仅改 config / 仅用 ~ 调参器，不动结构逻辑）→ 走 §十 轻量通道（仍须 ≥2 候选 + 推导 + 波及分析，**禁止降智抄写**）。
- 数值结构/公式/伤害管线变化 → 升级 §八 完整计划。

### §六 项目铁律（默认倾向，可带理由偏离但须标注）
- 数值只走 `CONFIG`（GDD 仅给意图，禁直填裸数字）。
- 系统间只通过 `Bus('系统:动作')` 通信，不跨层直调。
- **伤害一致性**：所有伤害经 `Core.Formula.damage(base, GS.segments, crit)`；技能层用 `hurt()` 包装，下游不自己算伤害。
- **DOT 语义**：`isDot=true` 只结算血量、按 `DOT_TEXT_MIN` 聚合飘字，不击退/不硬直/不闪白；分源 `dotMap` 独立聚合并传 `src`。

### Bus 事件名约定（血泪教训，见 §8）
- 正则已放宽允许驼峰：`^[a-z0-9]+:[a-zA-Z0-9_]+$`；**仍建议全小写**以利审计。
- **唯一真正要防的 bug：`on` 与 `emit` 必须同名**。格式可疑仅 `Log.warn` 软拒绝（模块不崩）。
- 新增事件登记到计划/DEBT。

---

## 3. 架构与文件职责（七层 + 入口 + 调试）

| 层 | 文件 | 职责 |
|---|---|---|
| L1 数据 | `02_config.js` | 数值真理源落地，纯数据零逻辑，`deepFreeze(CONFIG)`。所有可调参数集中此处 |
| L3 引擎 | `03_core.js` | `Bus`（事件总线）/ `Registry`（模块注册）/ `Formula`（伤害等公式）/ `GS`（游戏状态对象）/ 对象池 / `Log` / 启动自检 `selfCheck()` |
| L3 引擎 | `04_collision.js` | 空间哈希碰撞 `SpatialHash`（`queryCircle`/`query`）、`collision:setRadii` 等事件 |
| L5 系统 | `05_particle.js` | 粒子系统（火/电/爆环/光束/飘字），硬上限 + 优先级门控 |
| L5 系统 | `06_snake.js` | 蛇身/移动/转向（`angleLerp` 限速 `turnRate` 手感参数）/ 受击 |
| L5 系统 | `07_enemy.js` | 敌人 AI（wanderer/chaser/charger/elite/boss）、弹幕、`spawnDummy`（训练假人·dev） |
| L5 系统 | `08_skill.js` | 技能（火/冰/护盾/蒸汽引爆/电磁）+ combo 系统；`tickFire/Ice/Shield` 沿蛇身判定；`debugActivateCombo/MaxAll/SetSkill`（dev） |
| L5 系统 | `09_wave.js` | 波次 + 拾取（食物/技能球/危险偏向）；`tryGiveSkill` 读 RT 桥 |
| L5 系统 | `10_audio.js` | Web Audio 程序化 BGM + 音效；iOS 解锁链路（`_kickIos`/`resume(cb)`/`unlock`） |
| L5 系统 | `12_ui.js` | HUD（生命/数据/波次/技能栏/Combo/系统按钮）、摇杆由 14 管、强制横屏遮罩 |
| L6 渲染 | `11_render.js` | Canvas 渲染、相机缓动、`snapWX/Y` 相对相机单次取整（消中心闪）、精灵子系统、像素吸附 |
| L7 调试 | `13_editor.js` | GM 标定面板（`~` 键 + 移动端 ⚙ 按钮）、`rtTuning/rtSet` 运行时桥、**未 DEBUG 门控（B-TUNE 阻塞）** |
| 入口 | `14_main.js` | `fixed-step` 主循环（STEP=1/60 累加器 + 插值 `alpha`）、输入（摇杆+键盘）、`RT()` 桥、`PerfTier` 自适应、`editor:toggle` 同步 |
| 调试 | `15_profiler.js` | 自动性能日志（CPU 帧 vs 帧 ms） |
| L5 系统 | `16_skill_econ.js` | 技能经济仪表（升级间隔/首球耗时诊断） |

- **入口顺序**：`index.html` 顺序加载 → `14_main.js` 启动 `boot()` → `selfCheck()` 校验 CONFIG 分区齐全。
- **全局挂载**：`Core`/`Bus`/`Registry`/`CONFIG`/`GS`/`PerfTier`/`GMDBG`/`Log`/`Enemy`/`Skill`/`Wave`/`UI`/`Editor`/`Render`/`Profiler`/`SkillEcon` 均挂 `window`。

---

## 4. 核心运行时机制

### 4.1 主循环（fixed-step + 插值）
- `14_main.js`：`_acc += elapsed`；`while (_acc >= STEP) { step(STEP); _acc -= STEP }`（封顶 4 步/帧）；`alpha = clamp(_acc / STEP)` 传 `draw(alpha)`。
- **为何**：仿真锁 60Hz（廉价），渲染按屏幕刷新率插值（165Hz 也丝滑）。**勿改回逐帧原生步进**（曾致 165Hz 仿真过载 5.5× → 掉帧，见 RETRO/记忆）。
- 渲染插值：`_ix/_iy` 按 `alpha` 在 `prev→cur` 插值。

### 4.2 Bus / Registry / Formula / GS
- `Bus.on/emit('sys:action')`：系统间唯一通信通道，禁止跨层直调。
- `Registry.get('enemy'|'skill'|'editor'|...)`：取模块实例。
- `Core.Formula.damage(base, GS.segments, crit)`：统一伤害公式（§六）。
- `GS`：全局游戏状态（`status`: menu/playing/paused/choosing/dead；`segments`；`ownedSkills`；`timeSec` 等）。**无"按帧计数"玩法计时**，闪烁全用 `GS.timeSec`（回退仿真频率不改游戏速度）。

### 4.3 对象池 + 空间哈希
- 敌人/粒子走对象池（`pool.acquire/release`）避免 GC 抖动。
- `04_collision.js` `SpatialHash`：AOE 索敌复用每帧 `_enemySnap` 做 cell 覆盖相交（非精确圆），等价空间网格预筛、零每帧分配。

### 4.4 自适应 PerfTier + RT 桥
- `PerfTier`：按真实 FPS 自动升降档（HIGH/MED/LOW），仅 playing 态累计、防抖。
- `RT(path, fallback)`：`14_main`/`08_skill`/`05_particle`/`11_render` 共用运行时桥：优先读 `editor.rtGet`（GM 覆盖），无覆盖回退冻结 `CONFIG`/`PerfTier` 当前档。**零双份真相源**。

### 4.5 音频解锁链路（iOS 巨坑，已修三轮）
- `unlock()`：手势调用栈内 `ensure()` + **同步 `_kickIos()`（起极低增益振荡器真实出声）** + `resume(cb)`（ctx running 后起 BGM）。
- 根因史：①静音 buffer 解不开 iOS → 改非零振荡器；②在 `resume().then` 内出声脱离手势 → 改手势内同步；③suspended 期 `currentTime` 冻结致音符不前进 → `startBgm` 包进 `resume(cb)`。
- `_kicked` 一次性守卫：避免每次 `run_reset` 出咔哒。

### 4.6 渲染像素吸附
- `snapWX(v) = (round((v-_camX)*S) + round(_camX*S))/S`：相对相机**单次取整**，消除 `round(头)-round(相机)` 双取整 toggle → 消中心区蛇头闪（build 2026-07-23f）。边缘因相机 clamp 冻结本就不闪。
- 残留：吸附固有「1px 台阶」（清晰⇄平滑不可兼得），可接受或调 `followLerp`（手感三参之一，单开一轴按计划）。

### 4.7 输入
- **移动端**：右侧固定锚点摇杆（`INPUT.touch.baseFracX/Y≈0.84`，常驻淡显表盘）；方向=指针相对锚点向量；死区 `deadZone` 内不转向；多指锁首根 `pointerId`。`GM` 打开时外区仍可操控摇杆。
- **桌面**：键盘（WASD/方向键转向、`P`/`Esc` 暂停、`~` GM、`V` 特效诊断开关）；鼠标 hover 转向已屏蔽，仅摇杆+键盘。
- 强制横屏遮罩（`isTouch && isPortrait()` 激活）由 `12_ui.js` 创建。

---

## 5. 全局对象 / 常用 CONFIG 路径速查

- `CONFIG` 顶层分区：`GAME`/`PLAYER`/`COMBAT`/`JUICE`/`ENEMIES`/`SPAWN`/`SPATIAL`/`SKILL`/`COMBO`/`PICKUP`/`STAGE`/`ECON`/`NARR`/`COLORS`/`AUDIO`/`DEBUG`/`PERF`/`RENDER`。
- 常用路径：`CONFIG.GAME.fps`(60)、`CONFIG.PLAYER.*`、`CONFIG.SKILL.ice.*`/`fire.*`/`shield.*`、`CONFIG.COMBO.electroTurret.cooldownSec`(0.5)、`CONFIG.PICKUP.gapEarly/gapFarm`、`CONFIG.PERF.maxParticles/maxTexts/steamBurstCapPerFrame`、`CONFIG.RENDER.maxBackW`(2560)、`CONFIG.DEBUG.*`、`CONFIG.AUDIO.*`。
- `GS.status`、`GS.segments`、`GS.ownedSkills`、`GS.timeSec`。
- `window.PerfTier`、`window.GMDBG`（调试开关如 `showHitboxes`）、`window.__SNAKE_DIAG`（直行 stutter 诊断）、`window.__NO_DIR1`（像素吸附诊断）。

---

## 6. 如何运行 / 测试 / 部署

- **本地起服**：`cd snake55 && python -m http.server 8000` → 开 `http://localhost:8000`。
- **移动端真机**：同 WiFi 手机访 `http://<电脑IP>:8000`；iOS 进 standalone 需 Safari → 添加到主屏幕。
- **file:// 限制**：双击 `index.html` 须**去掉 `?v=`**（否则 Chrome 对带查询串的本地脚本 404 → 白屏）；且 file:// 下音频手势解锁/CORS 行为异常，**移动端测试务必用 http**。
- **强制刷新（让用户看到更新）**：改任意 `.js` 后，必须**统一 bump** `index.html` 内 15 处 `?v=<戳>`（如 `e392a72bd0`→新戳）。否则浏览器缓存旧版。
- **iOS PWA**：`manifest.webmanifest` 的 `theme_color`/`background_color` 已与页面统一 `#11162a`；改 manifest 后用户需重新「添加到主屏幕」才刷新。
- **全屏**：安卓/桌面 `requestFullscreen` 一键；iPhone 不支持 JS 全屏 → 提示「添加到主屏幕」。
- **诊断**：`15_profiler.js` 自动性能日志；GM 面板（~）含性能 HUD、中心闪诊断矩阵、碰撞盒显示。

---

## 7. 已知 Bug / 待修清单（你接手要处理的）

> 完整台账见 `docs/DEBT.md`。此处按「接手优先级」重排，并给每条位置/根因/修法。

### 🔴 发布硬阻塞（GA 前必须解）
- **B-TUNE 标定工具泄漏**：`13_editor.js` 始终加载、~ 键 + ⚙ 按钮可唤起；`07_enemy.js` `spawnDummy` 可生成。
  - 修法：整体包 `if (CONFIG.DEBUG.editorEnabled)`（init/`keydown`/`Bus.on('editor:toggle')`）；`spawnDummy` 调用点加 `DEBUG` 守卫；发布版 `CONFIG.DEBUG.editorEnabled=false`。
  - 影响：仅 dev 工具可见性，零 gameplay 变化；属整洁/安全硬要求。

### 🔴 iOS standalone 待用户复验
- 2026-07-27 第三轮修复（手势内同步起振荡器）逻辑应已根治「主屏打开无声」，但**用户尚未真机复验绿**。先等复验结论，再判断是否需要 `playSilent()` 抢占 / `webkitAudioContext` 兜底。

### 🟡 §9 数值债（代码已落值、§9 待用户回写）
- `PICKUP.food.overflowScore=10`、`PICKUP.dangerBias.ringMin=40/ringMax=150`、`SKILL.shield.orbitHitMul=0.5`。
- 你只改 `02_config.js` + DEBT 记账，**绝不碰 §9 真源 MD**。

### 🟡 表现债（纯视觉，~ 调参器定稿）
- combo 横幅配色 `COMBO_COLOR`；电磁 Combo(`fx:electroarc`) 与基础闪电链(`fx:lightning`) 视觉同质（满屏读不出联动）→ 建议独占色/专属音效/命中锚定弹体/更强分叉；`05_particle.js`/`11_render.js` 一众 VFX 字面量（`BOLT_COLOR`/`LIGHTNING_*`/`HIT_BURST_N`/`DOT_TEXT_*`/`SRC_STYLE.*` 等）待定稿。

### 🔴 设计债（GDD 已规划、代码未实现，落地前必出 §四 计划）
- 铁壁蛇阵（需动 core/collision → §三）、Boss 召唤小怪（`07_enemy.js` 未实现）、满级后溢出转化（成长系统未实现）。

### 🟡 美术债（接真图必办）
- `snake_head.png`：pivot 与 fallback 圆不一致、受击 squash / 无敌闪 alpha 未作用于精灵路径（接图后头挤压/无敌闪会消失，待定是否补进精灵路径）。
- `enemy_boss.png`：用户预期是「猫头鹰」但实际非猫头鹰 → 确认/覆盖猫头鹰图或改 `ENEMY_SPRITE_FILE`。
- `snake_tail`/`snake_body` 无图，走代码画（双绘 bug 已修，空 assets 时正常）。
- 放 PNG 后须整页刷新（`Image` 一次性 `new`，`onerror→failed` 永不重试）。

---

## 8. 历史巨坑（必看，别重蹈）

1. **性能先测后改**：凭直觉改再测连翻 6 轮。正确：profiler 二分 + bisect 锁根因（GPU 填充率 vs 主线程）。
2. **WIP vs 已提交**：看到的掉帧可能是未提交 WIP。改前 `git stash`/`commit` 隔离。
3. **双份真相源**：业务数值禁写本地常量，一律还 `CONFIG` + 登记 §9。
4. **Bus 事件名**：`on`/`emit` 必须同名（曾因 `fx:iceSlow`/`collision:setRadii` 大写触发 `Bus.on` 断言 → 整模块 IIFE 中断未注册 → 粒子/碰撞系统静默失效，发生 3 次）。
5. **像素吸附中心闪**：相机吸附 + 实体吸附双取整 toggle → 改相对相机单次取整 `snapWX/Y`（见 §4.6）。
6. **精灵 assets**：`ASSETS_BASE` 须写 `'assets/'`（非 `'snake55/assets/'`），否则任一服务方式拼成双 `snake55/` 全 404（被空 assets 静默掩盖，加真图才爆发）。
7. **?v= 缓存戳**：改脚本必须统一 bump `index.html` 15 处，否则用户看不到更新。
8. **manifest theme_color 一致性**：已装 PWA 用 manifest 的 `theme_color`（非 index.html meta）。本封版已同步 `#11162a`，改色后需重加主屏。
9. **file:// 404**：带 `?v=` 的本地脚本在 file:// 下 404 → 白屏；本地双击须去 `?v=`。
10. **autoplay 策略**：iOS 必须用户手势内真实出声才解锁 AudioContext（静音 buffer 无效、`.then` 内出声脱离手势无效）。
11. **相机 `__CAM_LOCK` 已移除**：硬锁蛇头绕过缓动反而顿，相机永远走 `updateCamera` 帧率无关缓动。
12. **GM/摇杆卡死**：`~`/`×` 曾绕开 `Bus.emit('editor:toggle')` 致 `_gmOpen` 卡 true → 摇杆失效；现已统一走 Bus。

---

## 9. 文档地图与协作纪律

| 文档 | 作用 | 你能改吗 |
|---|---|---|
| `AGENTS.md` | 守则（硬墙/锁死清单/流程） | 否（用户维护） |
| `CHANGELOG.md` | 改动流水（日期/需求/文件/一句话/动§9?/验收） | 落地后追加条目 |
| `docs/DEBT.md` | 债台账（§9 数值/表现/设计/工程债） | 更新状态/记账 |
| `docs/plans/STATUS.md` | 计划文件总索引 | 落地后更新状态 |
| `docs/RETRO.md` | 跨会话复盘教训 | 追加开放风险 |
| `docs/workflow.md` | 协作/调参 SOP | 否 |
| `docs/releases/2026-07-27-freeze.md` | 封版快照 | 历史快照 |
| `docs/releases/2026-07-27-codebuddy-handoff.md` | 本文件 | 历史交接 |
| `docs/《GDD v0.3》` | 设计意图 | 否 |
| `docs/《数值真理源 §9》` | 数值唯一真源 | **绝不改**（用户回写） |

- **协作纪律**：改码前出计划（§八）→ 用户确认 → 落地 → 写测试清单（复现步骤+预期+✅/❌）→ 提示 `git commit` → 更新 CHANGELOG/DEBT/STATUS。
- **验收方式**：用户手动浏览器实测；AI 出测试清单，不替用户测。
- **记忆靠文件不靠聊天**：状态散落聊天 → 反复踩坑（见 RETRO §3）。

---

## 10. 封版范围与接手边界

- **冻结**：代码逻辑 + 文档（2026-07-27 快照，commit `5a5b5d6`）。桌面 UI/音频维持现状；移动端已完成三轮修复。
- **可动（经流程）**：用户私列 bug（交你修）、B-TUNE 阻塞、§9 数值债（你改 config + 记账）、表现债（~ 调参）。
- **不可动（除非走 §三并告知用户）**：`03_core.js`/`04_collision.js`、加载顺序、全局挂载方式、`02_config.js` 数值结构。
- **你不做**：§9 真源 MD 回写（用户职责）、未经确认的计划落地、发布开关。

---

## 11. 快速定位：常见需求改哪

- **加/改技能** → `08_skill.js`（逻辑）+ `11_render.js`（视觉）+ `02_config.js`（数值）+ `05_particle.js`（特效）；combo 在 `08_skill.js` 的 `CO`。
- **加/改敌人** → `07_enemy.js`（`newEnemy`/`updateOne`）+ `02_config.js`（`ENEMIES`）+ `assets/`（PNG）+ `11_render.js`（`drawEnemySprite`）。
- **改数值** → 先 `02_config.js`；若影响强度/平衡 → 走 §七（你记账 DEBT，用户回写 §9）。
- **改 UI 布局** → `12_ui.js`（`isTouch` 分支：移动端重排 / 桌面原样）+ `index.html`（CSS）。
- **改手感** → `06_snake.js`（`turnRate` 等，手感参数走 §十）+ `02_config.js` `INPUT.*`。
- **改特效** → `05_particle.js` + `11_render.js`（字面量待 ~ 定稿）。
- **改音频** → `10_audio.js`（解锁链路见 §4.5）+ `02_config.js` `AUDIO.*`。
- **改性能** → 先 `15_profiler.js` 定位；`PERF.*`/`PerfTier` + `RT` 桥；勿动 core/collision 主算法。
- **改碰撞/底层** → `03_core.js`/`04_collision.js` → 必须 §三 流程 + 告知用户。

---

> **一句话收尾**：理解 §2 硬规则 + §3 文件职责 + §4 机制 + §7 待修清单 + §8 巨坑，你就能安全接手本项目。任何不确定，先出计划问用户，别闷头改底层。

---

## 12. Git 仓库配置与版本推送 SOP（给 Codex：无缝接手 + 帮你 push）

> 本仓库已建好远程、已可 push。下面是所有让 Codex 直接 `git push` 不掉坑的事实与命令。**发布决策（是否 GA、是否打 tag）仍由用户拍板**，但日常把改动推上 `origin/main` 是你可以直接做的。

### 12.1 远程与当前状态（已核实）
```
remote.origin.url = https://github.com/zhuchunpeng123-lang/this-life-as-snake.git
branch.main      → 跟踪 origin/main（已 up-to-date，working tree clean）
```
- 当前 HEAD：`main`，与 `origin/main` 同步，无未提交改动。Codex 可直接在此基础上工作。
- 仓库无 CI、无 hook（`.git/hooks/` 为空）、无保护分支规则 → push 是直推，无需 PR。
- 用户身份已配置（提交者）：`name=zhuchunpeng123-lang` / `email=zhuchunpeng123-lang@users.noreply.github.com`，**不要改**。

### 12.2 分支策略（重要：别乱 push）
| 分支 | 位置 | 含义 | Codex 操作 |
|---|---|---|---|
| `main` | 本地 + origin | **唯一发布基线**，封版快照 commit `5a5b5d6` | 日常改动推这里：`git push origin main` |
| `v0` | 本地 + origin | 早期旧基线（已弃用） | 别动、别删、别合 |
| `ab-13c915b` | 仅本地 | 实验快照：smooth 60Hz 累加器 FPS 版（性能对比用） | **别 push**（本地参考，丢了无妨但无远程） |
| `ab-52d076a` | 仅本地 | 实验快照：美术重写版 | **别 push** |

> ⚠️ `ab-*` 是本地独占的对照实验分支（验证 FPS 根因 / 美术重写用），**没有推到 origin，也不该推**。只维护 `main` 即可。

### 12.3 🔴 代理坑（最容易让 push 卡死）
`.git/config` 里写死了：
```
[http]
	proxy = http://127.0.0.1:7897
```
这是用户本机 Clash 类代理。若 Codex 跑在**另一台机器 / 不同网络**（代理不存在或端口不对），`git push`/`git fetch` 会**直接挂起或超时失败**。
- 若 Codex 环境不需要代理：`git config --unset http.proxy`（仅影响本仓库，安全）。
- 若 Codex 环境有自己的代理：改成对应地址，例如 `git config http.proxy http://127.0.0.1:<你的端口>`。
- 快速自检：`git config --get http.proxy` 看当前值；`git ls-remote origin` 试连，能列出 refs 即网络通。

### 12.4 认证（push 需要 GitHub 凭据）
- 远程是 **https** 协议 → push 时按 Token 认证（GitHub 已禁密码）。
- 用户名可任意（如 `zhuchunpeng123-lang`），**密码 = Personal Access Token（repo 权限）**。
- 若环境无凭据缓存，首次 push 会提示输入；可让用户提供 PAT，或配置凭据助手 `git config --global credential.helper store`（仅本机）。
- 本环境**无内置 GitHub 集成**，push 需用户授权/提供凭据，无法静默代建仓库。

### 12.5 提交信息约定（照抄，保持历史可读）
格式：`type(scope): 中文一句话`（scope 可省），可选末尾带 `build 20260727x` 戳。
- `type` 取值：`feat` / `fix` / `docs` / `tune` / `refactor` / `fix/feat`（混合）。
- 历史实例：`fix: iOS standalone 手势内同步解锁音频`、`feat(audio): 程序化 BGM v3`、`tune(progress): 加血道具=贪婪悖论 · S3`、`docs: 封版快照…`。
- 改动性质（是否动 §9 数值真源）按 `CHANGELOG.md` 顶部格式另记，commit 信息只写「做了什么」。

### 12.6 🔴 `?v=` 缓存戳必须同步 bump（否则玩家看不到更新）
`snake55/index.html` 中 **15 个 `<script>` 标签**共用同一个查询串 `?v=e392a72bd0`：
```
<script src="02_config.js?v=e392a72bd0"></script>  …（03~16 同值）…
```
- **改了 `snake55/` 下任意 `.js` 后，必须把这 15 处 `?v=` 同步改成同一个新值**（随便换一段唯一串，如 `f1a2b3c4d5`；习惯用提交 hash 前 10 位或随机串）。
- 不 bump → 玩家浏览器沿用旧缓存，线上「更新了但没更新」，是最常被漏的发布事故。
- 改法：在 `index.html` 里对 `?v=e392a72bd0` 做**全文替换**（15 处一起改，值必须全相同）。`file://` 本地双击打开时这串可去掉（见 §0 注释），但线上托管必须带且必须 bump。

### 12.7 标准推送流程（Codex 照做即可）
```bash
# 1) 改完代码后，确认 ?v= 已 bump（见 12.6），且只改了计划内文件
git status                      # 看改动范围，别误带 .codebuddy/ 或 _harness

# 2) 暂存（推荐显式加文件，避免 git add -A 误带忽略外产物）
git add snake55/02_config.js snake55/index.html docs/...

# 3) 提交（约定见 12.5）；如需引用封版基线，可在 body 写 commit 哈希
git commit -m "fix: 描述一句话"

# 4) 推（main 已跟踪 origin/main，直推即可）
git push origin main
```
- 不要 `git push --force` / `git push -f`：会覆盖远程历史，除非用户明确要求。
- 不要 `git push --all` / `git push --tags`：会顺手把 `ab-*` 本地实验分支和 `v0` 推上去（见 12.2）。
- 推荐显式 `git add <文件>` 而非 `git add -A`；`.gitignore` 已拦 `.codebuddy/`、`node_modules/`、`_harness*.js`、`*.harness.js`、OS 垃圾，但显式添加更稳。

### 12.8 版本号 / Tag（建议 Codex 起手即用，便于追溯）
- 当前「版本」= **commit 哈希**（`5a5b5d6`）+ `index.html` 的 `?v=` 戳 + commit 里的 `build` 串；**仓库尚未用 git tag**。
- 真正对外发布（GA）时，建议打 annotated tag 并推送，方便回滚：
  ```bash
  git tag -a v0.9 -m "封版快照 2026-07-27（B-TUNE 阻塞仍开）"
  git push origin v0.9
  ```
- Tag 命名随意，但与用户商定后再打；封版快照记录冻结 commit 哈希即可。

### 12.9 回滚 SOP（本地优先，安全）
```bash
git log --oneline                 # 看历史
git checkout <hash> -- snake55/xx.js   # 单文件回退到某版
git revert <hash>                 # 整体回退（生成新提交，保留历史，推荐）
git restore <file>                # 丢弃未提交改动
```
- 远程回退：revert 后正常 `git push origin main` 即可；**禁止 `git push -f` 改写已发布历史**。

### 12.10 一句话给 Codex
克隆/接手后先 `git config --get http.proxy` 自检网络、只维护 `main`、改完 JS 必 bump `?v=`、commit 用 `type: 中文`、推 `git push origin main`、绝不 force / 绝不 `--all`。这样你就能无缝替用户把版本推上 GitHub。
