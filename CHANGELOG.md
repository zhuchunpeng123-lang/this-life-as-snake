# CHANGELOG · 5.5 好玩基因融合版贪吃蛇

> 格式：日期 / 需求名 / 改动文件清单 / 一句话 / 是否动 §9 / 验收 ✅❌

## 2026-07-24e · fix(ui): GATE B 收尾·顶部横幅/结算框/九项提亮/回血间距/胶囊比例（build 20260724d）
- **目标**：按用户实测反馈修 GATE B 遗留的 6 处 UI 问题，纯表现/布局，零玩法改动。
- **①顶部监测横幅**：删除 `14_main.js` 的 `_statusBanner()` 及 B/V 键调用（B=像素吸附、V=重量特效诊断开关保留、仅不再弹 `top:8px` 居中 z-index 9999 横幅，因其压住顶部波次条）。
- **②回血标签间距**：`11_render.js` 回血文字上移 `r*1.5-12` → `r*1.3-6`，拉近心形图标。
- **③HUD 胶囊比例失调（根因）**：数据框配方提示 `div` 原写 `width:100%` 且继承胶囊 `white-space:nowrap`，把胶囊撑到最大宽显空、且文字不折行溢出。改为去 `width:100%`+`white-space:normal` 让框贴内容、文字正常折行；胶囊 padding `6px/12px`→`5px/11px`+`line-height:1.2`。
- **④结算框透出背景**：外层 `result` 遮罩 `hexA(bg,0.92)`→`0.6`（框外可见游戏画面，更有氛围）；内层 `stage` 加 `hexA(bg,0.97)` 实底 + padding26/30 + radius18 + ui 描边 + 阴影（框内不透光、内容清晰可读、不破版）。
- **⑤九项/蛇生文字太淡**：九项标签由 `textDim+opacity.7`（偏暗）提到 `textMain+opacity.82`，值加粗 `700` 保持层级；文本清晰。
- **⑥失败红底黑字按钮丑**：通关/失败按钮由「彩色底+深色字」改为「深底 `hexA(panel,.9)` + 彩色描边 + 彩色字」(win=player绿 / lose=enemy红)，去掉红底黑字。
- **是否动 §9 / core / collision / 玩法数值 / 阶段1-3 渲染**：**否**（纯 UI 布局/配色）。
- **验收**：①按 B/V 不再有顶部横幅、波次条可见；②回血文字贴近心形；③HUD 胶囊贴内容不空、配方提示折行不溢出；④结算框外见游戏、框内实底清晰；⑤九项文字清晰；⑥失败按钮深底彩描边不丑。

## 2026-07-25b · fix(ui): 结算九项居中 + 「连携」回归 GDD 真源词「羁绊」（build 20260725b）
- **目标**：用户实测反馈——结算九项文字未居中；且「连携」一词查 GDD §8.7.3 应为「羁绊」。
- **改动文件**：`12_ui.js`（`renderScoreboard`）。
- **①结算九项居中**：卡片由「左标签(flex:1) / 右数值」拉伸行 → 「图标 + 居中『**标签**　数值』单行」，`justify-content:center`、标签 `font-weight:800`、数值淡化 `textDim`。修复"此生长度/走过的路/发现的连携"等贴边、未居中。
- **②「连携」→「羁绊」**：第 6 项 GDD §8.7.3 原词即「发现的羁绊 / 羁绊 N / 5」（上一轮把错别字"翁绞"误改为"连携"，两词皆错）。`['发现的羁绊', '羁绊 ' + comboCount + ' / 5']`。
- **③澄清"第48条蛇身"**：代码无"蛇身"措辞；结算第 9 项「第几条蛇生→你的第 N 条蛇生」为 localStorage 局数计数器（GDD §8.7.3 #9，按累计开局部数），与第 1 项「此生长度→长到 N 节」(本局最长节数) 含义不同，非 bug。
- **是否动 §9 / core / collision / 玩法数值 / Bus 链路 / 阶段1-3 渲染**：**否**（纯视觉/文案，无玩法影响）。
- **验收**：①九项每行文字居中、标签加粗数值淡；②"发现的羁绊 / 羁绊 N / 5" 正确；③其余八项未变；④lint 全清、无悬挂引用。

## 2026-07-25a · feat(ui): HUD 分区收敛 + 三选一补全 + 结算卡片化 + 世界层清理（build 20260725a）
- **目标**：用户实测反馈的 UI 优化迭代（主界面 HUD + 三选一 + 结算，纯视觉/布局，零玩法）。沿用 STYLE 真源、零新 hex、不碰 03_core/04_collision/数值/Bus/阶段1-3 渲染。
- **P0-1 左上超框**：数据框 `hudData` 改定宽 `max-width:min(64vw,340px)` + `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`，禁文字撑破框。
- **P0-2 HUD 分区收敛**：`hudSys` 容器把暂停/全屏/GM 三系统按钮归组右上**顶部**，与技能栏 `hudSkills`(top:58)、Combo 徽标 `hudCombo`(top:104) 分离；左列为角色状态簇(×coreHp + 长度｜击杀｜得分｜连杀)。
- **P0-3 三选一补全**：每卡 = `STYLE.skillFx[id]` 色图标 + 技能名 + 一句效果描述(`SKILL_DESC` 纯文案) + Lv 标记(新技能/升级→Lv) + 底部 `按 1/2/3` 提示；并接键盘 1/2/3 选卡（与提示一致）。**映射核对**：skillFx 真源键名为 `fire/ice/bolt/shield/lightning`（与 `SKILL.list` 一致），"守护力场"=`shield`=`#bff0d8` 薄荷绿、"冰霜领域"=`ice`=`#7fc4ff` 冰蓝，**不撞色**，卡片正确读 `STYLE.skillFx[c.id]`。
- **P0-4 Combo 图标化 + 文案 bug**：①废除数据框内「长句配方列表」(`buildRecipeHint`→`renderComboBadges`)，改右上紧凑发光徽标(持有哪两技+→连携名，激活发光，详情 `title` 悬停)；②`renderWave` 的"☠ BOSS 期 Boss期"重复 → 只留 `☠ Boss期`(阶段名即 Boss 期)；③结算走马灯 stage 行加 `seenStage` 去重（同句不再出现两次）；④"翁绞"错别字 → "连携"（仅 `12_ui.js` 纯文案，无 §9 牵连）。
- **P1-5 图标系统**：HUD 数据(🐍💀⭐🔥)、三选一(几何字辉+色)、结算九项(`SCORE_ICON` emoji) 全部加图标，消除纯文字裸排。
- **P1-6 按钮统一**：结算主按钮改 `STYLE.player` 绿填充+深字+绿发光；次按钮(抉择/竖屏继续)统一 `STYLE.ui` 青描边。
- **P1-7 结算卡片化 + 评级**：九项改「图标+标签+数值」卡片行 + `chipBorder` 分隔；新增 S/A/B/C 评级金标(`STYLE.food` 金、仅展示不入数值)，阈值按长度/击杀/得分/通关加权。
- **P1-8 霓虹外发光**：胶囊(`box-shadow:0 0 10px ui`)、卡片(skillFx 色)、结算面板(`0 0 26px ui`) 统一柔发光。
- **P2-9 世界层**：`11_render.js` 删每个食物旁的「食物」文字标签（金圆果形状已够辨识）。
- **P2-10 伤害飘字**：`05_particle.js` 字号缩小(DOT 11→10 / 瞬伤 20·14→16·12 / 受击 18→14)、淡出 0.8→0.6s、火墙 MULTI-敌齐爆时 DOT 飘字每帧抽稀(≤`RT('VFX.dotTextFrameCap',10)`)，超量不糊屏。**未改任何伤害数值**。
- **P2-11 蛇辨识度**：`11_render.js` 蛇头发光 `drawHalo` 半径 `*1.9→*2.15`、alpha `0.22→0.32`（仍在 glowMax 缓存内），乱战一眼找到自己。
- **是否动 §9 / core / collision / 玩法数值 / Bus 链路 / 阶段1-3 渲染**：**否**（纯视觉/布局/字号/淡出/抽稀，保留 HUD ~10Hz 节流）。
- **验收**：①左上数据框不撑破、系统按钮归右上顶与技能栏分开；②Combo 不再铺长文、改发光徽标悬停看详情；③三选一每卡有图标/描述/Lv/1·2·3 提示且键盘可选；④结算走马灯无重复行、"Boss期"不叠字、"连携"正确；⑤结算九项有图标+卡片+评级金标、框内实底清晰；⑥按 B/V 无横幅(上版已修)；⑦世界层无"食物"标签、飘字更小更快、蛇头更亮。

## 2026-07-24d · feat(ui): GATE B UI 主题化——四组胶囊 HUD + 波次条/5格技能栏 + 选卡/结算/抉择全接 STYLE 真源（build 20260724c）
- **目标**：把 12_ui.js 硬编码配色（#2de1a8/#ffb000/#ff5b7a/#11203a/#1a1530 等）全部替换为 GATE A 的 STYLE 配色宇宙，HUD 胶囊化对齐圣经 §8.4；零玩法改动。
- **硬约束遵守**：①不新增任何新 hex、不建第二套色板——仅替换 + alias；②需要语义名用 alias（STYLE.win=player 绿 / STYLE.lose=enemy 红，值锁定现有）；③STYLE.heal 不依赖（HUD 心血用 STYLE.enemy 红）；④chipBg=STYLE.panel+panelAlpha 派生、chipBorder=STYLE.ui、textDim 直接复用。
- **四组胶囊 HUD（§8.4，本阶段新增波次条/5格技能栏——原先 UI 无此二者）**：左上生命框(×coreHp + 濒死≤1血整框红脉冲) / 左上数据框(长度｜击杀｜得分｜连杀 + 配方提示) / 顶部波次条(当前阶段+进度，Boss 预警前切红闪「BOSS INCOMING」) / 右上 5 格技能栏(空槽也画，满槽用 STYLE.skillFx[id] 描边呼应拾取物)。波次条/技能栏读现有 GS/STAGE/SKILL 数据，塞入 ~10Hz 节流，未新增 Bus 事件。
- **改动文件**：①`02_config.js`：STYLE 加 win/lose alias（值=player/enemy）；②`12_ui.js`：init 重写(四胶囊+濒死 keyframes)、refreshHUD 重写 + renderWave/renderSkills、选卡描边 STYLE.skillFx[id]、抉择按钮橙边→STYLE.ui 青、Combo 横幅接 STYLE(playerGlow/ui/enemyCalm，与 skillFx 五色不撞)、结算/竖屏/配方提示全换 STYLE、hexA() 派生 rgba 助手(无新 hex)。
- **是否动 §9 / core / collision / 玩法数值 / 阶段1-3 渲染**：**否**（纯 UI 换色 + 布局胶囊化）。
- **验收**：①HUD 为胶囊、配色与 STYLE 一致；②RT('STYLE.ui') 等运行时覆盖能实时换色(读真源)；③死亡序列定格→走马灯→蛇生→九项正常、配色一致；④grep 12_ui.js 硬编码 hex 仅剩注释一处(无字面量)；⑤HUD 节流仍在(~10Hz)、无每帧重排。

## 2026-07-24c · fix(perf·主循环): 移除 maxFps 封顶旋钮——封顶跳帧丢真实时间致世界整体变慢 bug（build 20260724b）
- **根因（用户实测"封 60 后蛇变慢"坐实）**：封顶分支在 `_acc += elapsed` **之前** `return`，但 `last = now` 每帧都已推进 → 被跳过帧的真实时间**永久丢失**（注释"下一允许帧 elapsed 自然含跳过时间"是错的）。165Hz 封 60 ≈ 每 3 帧放行 1 帧 → 累加器只收到 ~1/3 真实时间 → step 率跌到 ~20/s → 蛇/敌全世界慢到 ~1/3 速。
- **决策**：不修而是**删**——主修复（固定 STEP 累加器锁 60Hz 仿真）已让不封顶稳跑满 165（用户日志：FPS 全程 165、CPU<2ms），封顶旋钮无存在必要，留着只会误导。
- **改动**：①`14_main.js`：删 RT 封顶块 + `_lastDrawT`，banner 升 `v=20260724b`；②`13_editor.js`：删 GM 指令区「帧率封顶」按钮 + handler；③`index.html`：全脚本 `?v=20260724b` 破缓存。累加器主循环/alpha 插值/step·s 诊断（15_profiler）**原样不动**。
- **是否动 §9 / core / collision / 玩法数值**：**否**（纯删除封顶分支）。
- **验收**：①正常：F5 后蛇速恢复正常、FPS 满 165；②反向：`~` 面板 GM 指令区无「帧率封顶」按钮；L 键日志 step/s ≈60。


## 2026-07-24b · fix(perf·主循环): 回退「原生帧时间步进」→ 固定 STEP 累加器锁 60Hz 仿真（★已落地·FPS 话题封板）（build 20260724a）
- **真根因（代码级·三方交叉 + 刷新率预算算式坐实）**：smooth 流畅版 13c915b 用 `while(acc>=STEP) step(STEP)`（STEP=1/CONFIG.GAME.fps=1/60）→ 仿真死锁 60Hz，与刷新率解耦。当前版（"2026-07-20 性能根治第二轮"引入）改成 `while(_rem>1e-6) step(_sdt)` 真帧时间切 1/240 子步 → 165Hz 屏每帧 ~2 子步 ×165 = **~330 step/s**（60Hz 屏也有 240/s）。同机下仿真负载是 smooth 的 **~5.5×（60Hz 屏 4×）**。每次 step() 全量碰撞/敌AI/波次/粒子 → cpuMs 随敌 0.3→2.9ms 线性涨 → 165Hz 6ms 预算吃穿 → 跌 45~60fps。绘制调用数/backing/dpr 均接近 smooth 故非渲染瓶颈（渲染层已有 `_ix/_iy` 按 `acc/STEP` 插值系统，本就为累加器设计）。
- **验证（落地前已查）**：①全代码无"按帧计数"玩法计时（GS.frame 仅 sim 步计数 + 渲染检测新步；闪烁全用 GS.timeSec 时间制）→ 回退仿真频率**不改游戏速度**；②空屏 250ms stall = 首个 playing 帧 `core.resetRun`+首 step 全系统一次性分配/GC（非 PerfTier，boot 已 resize）；③52d076a 确认把 HIGH.maxBackW 1600→2560（用户疑"小窗口同源"属实），但当前 HIGH=1600 已等同 smooth 且仍掉 → 非主瓶颈（记 DEBT）。
- **改动（14_main.js `frame()` · 零 §9/core/collision/config）**：①子步循环→`STEP=1/60` 累加器（`_acc+=elapsed; while(_acc>=STEP){step(STEP);_acc-=STEP}`，封顶 4 步/帧防螺旋）；②`alpha=clamp(_acc/STEP)` 传 `draw()` 激活已有插值（消 60→165Hz 微抖）；③`RT('RENDER.maxFps',0)` 封顶旋钮（默认 0 不封顶；>0 按 1000/maxFps 帧跳过——落实"用户/Notion 指定 A=60 封顶"为可选项，RT 热调；默认不封顶跑满刷新率，因 60 非 165 整数倍封顶反而微抖）；④`build v=20260724a` 升级便于清缓存识别。
- **是否动 §9 / core / collision / 玩法数值**：**否**（纯主循环性能修复）。
- **验收**：①正常：165Hz 插电、50 敌 FPS 回 60+（不再 45~60 摇摆），cpuMs 降至 ~0.5ms 量级；②空屏无 250ms 卡顿（首个 playing 帧 stall 可接受/一次性）；③60Hz 屏无回归；④运动观感 vs smooth 不退化（alpha 插值生效，无 judder）。**FPS 话题自此封板**。

## 2026-07-24 · diag(perf): 定位怪群技能齐发 FPS 崩塌真因＝单帧 draw call 爆炸（粒子/飘字逐实体绘制）（待计划落地）
- **推翻上条误判**：上条把"怪多卡"归因为 maxBackW 2560 大画布填充率，回退 1600 后实测**画布 1600×900 仍崩 31~34、外部 27~31ms**，且 2560→1600 面积小 2.56 倍反而更慢 → 填充率假设证伪。
- **真因（结构性铁证）**：`绘制 386(273/72/31/1/9)`＝每帧 386 draw call（fill273/stroke72/fillText31/drawImage1/fillRect9）。全库无 shadowBlur/'lighter'（仅 vignette 一次渐变）→ 非模糊/合成开销，是 **draw call 数量本身超 canvas 2D 单帧前端承载**。分解：粒子池满 240（`05_particle.js:229` 逐粒子 `beginPath+arc+fill`，**未批量**≈240 fill，主因）+ 敌人血条/燃烧/减速标记 stroke+fill（~150，已部分优化）+ 飘字 31 个 `fillText`（`:288`，canvas 最慢单操作）。对照 `drawEnemies` 第一遍已做"按色批量 fill"（283-302，50 敌本体仅 ~5 fill）——**粒子/飘字从未批量优化**。
- **为何"之前修好现在又卡"**：7/22 修的是「2400 画布填充率」(maxBackW 1600 解决的是那次)；本次是**另一种瓶颈＝draw call 数**，此前测试敌人/粒子未达 50 敌+满池 240 粒子未暴露。52d076a 的 maxBackW 2560 是叠加次要因素（已回退无害），非主因。非单点回归，是粒子/飘字绘制方式的固有架构债被内容膨胀暴露。
- **修复方向（§八 出计划，待确认）**：①粒子批处理（同色攒一 path 一次 fill，仿敌人第一遍；或离屏预渲染圆精灵+drawImage）→ 240 fill→~10；②飘字节流/合并（限制同屏数+合并同源伤害）；③auto-tier 看门狗对"持续低 FPS"反应迟钝（均值被 165 拉高）需补"绝对 FPS 兜底降档"。核心＝①。
- **是否动 §9 / core / collision**：否（纯渲染批处理；粒子/飘字表现不变）。

## 2026-07-23 · fix(perf): 回退 HIGH.maxBackW 2560→1600（⚠️实测证伪·非根因，真因见上「draw call 爆炸」条）（build 20260723z-perf）
- **回归定位（commit 52d076a·20:32 渲染插值消抖+输入重写+美术管线）**：为消 `maxBackW:1600` 封顶拉伸导致的直行 shimmer，把 HIGH 档 backing 宽上限 `1600→2560` 焊死成默认。其像素量是 1600 基准的 **2.56 倍**。
- **症状（用户实测日志 23:49:25→23:49:45）**：画布 2560×1440 + 余烬 on + 白爆/飘字齐发 + 绘制 300–420 时，外部(GPU present) **17–23ms**、CPU<1.3ms、FPS 崩到 42–108。物理签名与 7/22 CHANGELOG「2400 掉帧澄清」条目完全复刻（backing 2400→FPS 掉30~95、外部9~25ms）。自动降级看门狗天生失明（只看 overdraw EMA>320k，峰值才38k；且 stepDown 死函数只关火不降分辨率）→ 42fps 时「档 HIGH自动」纹丝不动（非今日弄坏，本来就管不了分辨率）。
- **改动（02_config.js L104·纯渲染护栏·非 §9 平衡值）**：`HIGH.maxBackW: 2560 → 1600`（=7/22 auto-tier 封版基准，双实证稳60fps）。其它栏位(worldScale/粒子/文字/抑制)不动。
- **是否动 §9 / core / collision / 相机**：**否**（纯渲染护栏上限数值；与 §9 平衡值无关）。
- **验收（⚠️ 实测证伪 2026-07-24）**：用户回测画布已降至 1600×900（maxBackW 生效）但怪群齐发仍崩 31~34、外部 27~31ms；且 2560 时绘制420/外部23ms vs 1600 时绘制386/外部31ms（面积小 2.56 倍反而更慢）→ **彻底证伪"填充率/分辨率"假设**。本回退仅恢复 7/22 封版基准（无害），但**未触及真根因**＝粒子/飘字逐实体绘制导致单帧 386 draw call 超 canvas 2D 前端承载（详见上「draw call 爆炸」条）。maxBackW 改动保留（1600 本就是正确封顶）。
- **代价**：1600→2560 屏拉伸轻微 shimmer 可能回现（方向1 浮点+残差补偿已落地，可能已比 7/22 轻），若明显则另开轴(落地 7/22 搁置的「FPS 自动降分辨率」方案 B 而非再把 maxBackW 焊大)。

## 2026-07-23 · fix(render): 相机封板——删 deadZone 闸门，中心区顿感根治（build 20260723z-final）
- **根因（实测双证坐实）**：地图中心区"一顿一顿"的真凶是 `updateCamera` 的 `if(d>CAM.deadZone)` 闸门（`deadZone=30` 世界px）。常速下相机稳态滞后 `≈snakeSpeed/7.2 = 200/7.2 ≈ 27.8px`，**恰卡在 30 下面** → 相机绝大部分时间冻结在 deadZone 内纹丝不动，蛇头走出 30px 才"咔"地猛扑一下再冻结 → 形成周期性「冻帧→突进→冻帧」锯齿（≈30Hz），正是肉眼"一顿一顿"。解释全部现象：①只中心顿(边缘相机被 clamp 冻死本就不滚)；②camlock off 好一点但没根治(缓动比硬锁好但 deadZone 锯齿仍在)；③此前 v3 矩阵全 0% 却矛盾(矩阵真值 `true` 用同一个 `cam.x`，相机自抖时 disp/true 一起抖→永远相等→对相机运动卡顿是盲的，只能抓子像素/shimmer)。
- **实测证明（零成本，未先下码）**：加临时 `window.__CAM_DZ` 覆盖钩子(因 config deepFreeze，控制台改 `CONFIG.PLAYER.camera.deadZone` 静默失败)→ 控制台 `__CAM_DZ=0` **中心顿立即消失**；`undefined` 切回顿感回来。**第二证据（用户自发现）**：顿感幅度随视口缩放 `S`(设备像素/世界单位)变化——全屏(S 大)顿明显、开控制台压小画布(S 小)看不到、`__CAM_DZ=0` 无论 S 都消失。此即"世界坐标下固定 30px 突进"的签名(屏幕可见度=30·S)，同时**排除帧节奏(rAF dt 抖动)路线**(若是帧节奏则与 S 无关、缩放窗口不会消失)。
- **改动（11_render.js `updateCamera` · 纯渲染 · 零 §9/core/collision/主循环）**：①删除 `if(d>_dz)` 闸门(连同临时 `__CAM_DZ`/`_dz` PROOF 脚手架)，改为**每帧**帧率无关缓动 `_ck=1-(1-followLerp)^(_fdt·60); cam.x+=dx·_ck; cam.y+=dy·_ck` 连续跟随；保留 `followLerp`/`lookAhead`/`clamp` 边界。稳态滞后≈27.8px 从"冻结"变为"恒定平滑"，不再周期突进。②`02_config.js` `PLAYER.camera.deadZone:30` 标废弃注释(代码不再读，字段暂留防结构变动)。
- **是否动 §9 / core / collision / config 数值**：**否**（deadZone 仅加注释未改值；config 结构不变）。
- **验收（✅ 用户实测消顿·相机话题封板）**：①`__CAM_DZ=0` 中心绕圈/直行/甩头顿感消失 ✅；②顿感幅度随视口缩放变化(全屏见/压小不见/=0 恒不见)→ 坐实世界坐标固定突进、排除帧节奏 ✅；③已落地删闸门等价 `__CAM_DZ=0` 常态化。**遗留**：方向1(整条蛇浮点+残差补偿)留待此后单看蛇头 PNG 有无浮点重采样发虚——干净则保留、发虚则连方向1 一并回退（相机话题此后封板不再动）。

## 2026-07-23 · fix(render): 移除有害调试开关 __CAM_LOCK，相机永远走 updateCamera 缓动（build 20260723z-followup）
- **根因（用户实测确诊）**：地图中心区"一顿一顿/分不清闪还是盾"的顿感，根因是 GM 调试开关 `__CAM_LOCK`（面板"相机锁定插值头(消头抖)"，A/B 相机修复开关之一）。该开关 ON 时相机每帧 1:1 硬锁蛇头(`interpHead`)、绕过 `updateCamera` 的帧率无关缓动(低通滤波)。蛇速随真实帧时间抖动 + fixed-step 子步量化存在逐帧微起伏，缓动会滤平它，硬锁则把该起伏 1:1 透传到"世界滚动"→ 中心区背景/敌人/拾取/火墙/护盾环相对钉死蛇头一抽一抽。关掉该开关(回到默认缓动相机)顿感立即消失，印证病根；其默认本就关，故游戏出厂状态本就平滑，顿感系测试时打开该开关自致。
- **改动（11_render.js 相机分支 + 13_editor.js GM 面板，纯渲染/dev 工具 · 零 §9/core/collision/config/主循环）**：①`11_render.js` 删除 `if(__CAM_LOCK){硬锁}else{updateCamera}` 分支，永远走 `updateCamera()` 帧率无关缓动；②`13_editor.js` 删除 `#diag_camlock` 开关按钮(面板 HTML+onclick)、矩阵 `flkStart` 的 C3/C4 `lock` 维度(仅留 snap 维度)、`origLock`/`apply`/`finish` 里的 `__CAM_LOCK` 还原逻辑。
- **是否动 §9 / core / collision / config / 主循环**：**否**。
- **验收（待复测·相机话题冻结）**：①强刷→`~` 面板不再有"相机锁定插值头"开关；②默认无锁状态中心绕圈/直行/甩头平滑无台阶；③重跑 GM v3 矩阵(仅 snap 维度)→头/身干净无新 shimmer，则方向1(整条蛇浮点)保留结案；若头出现 shimmer→方向1 建立在被 __CAM_LOCK 污染数据上、属多余，连方向1 一并回退到默认平滑态(据矩阵报告定去留)。

## 2026-07-23 · fix(render): 方向1 整条蛇浮点 + 残差补偿，消除中心区「1px 台阶卡动」（build 20260723z）
- **背景**：矩阵 B 精修显示「真 toggle 率」中心相位仅 0–3%（常 0%）→ 原 C 计划(hysteresis 滞后)针对的来回 toggle 已不存在；用户舌头感到的"卡动"实为吸附位图「诚实 1px 台阶」(C1 中心 71–98%)。清晰(像素对齐)⇄平滑(亚像素流畅)不可兼得，故收窄为「整条蛇浮点、仅世界吸附」。
- **关键修正(堵点1)**：仅去蛇自身 snapWX 不够——相机 transform 用 rcxS=round(S·rcx)/S 全局吸附，残差 rcxS−rcx 逐帧≤0.5/S 锯齿，浮点蛇若随 rcxS 投影会继承该锯齿(与原1px同级、频率约减半)。故在 draw() 对 drawSnake+drawSkillAura 包一层 `ctx.save(); ctx.translate(rcxS−rcx, rcyS−rcy); ...; ctx.restore()`，抵消残差→蛇有效相机中心=连续 rcx→中心跟随时蛇真实屏幕位≈常数、无台阶(非独立坐标系,世界保持 rcxS+snapWX 不变)。
- **改动(11_render.js · 纯渲染 · 零 §9/core/collision/config)**：①drawSnake 蛇头+逐节身体去 snapWX(浮点);②drawSkillAura 护盾基底/火墙沿身/护盾球 orbit/护盾拖影 共 4 处去 snapWX(蛇附属视觉一并浮点,免链内接缝/错位);③draw() 残差补偿 wrap 包蛇+附属,回读 `ctx.getTransform()` 存 `_snakeMtx`;④诊断 `diagFlickerTick` 改为 `disp=实际矩阵(getTransform)作用到真实绘制点`(回读真值,非写死)、`true=理想连续 S·(wx−rcx)`,二者仅当「6拆正确+补偿正确」才相等→漏拆/符号错/补偿放错/坐标用混 任一事故→disp≠true→台阶>0 被矩阵抓出(结构性假阴性已消);⑤`Render.getFlickerSample()` 返回 {head(烘焙位图),body(矢量圆)} 供头身双采样。`13_editor.js` 矩阵升 v3：头/身双表,disp 注释为实际矩阵回读真值。
- **废弃**：原 C(hysteresis 滞后)因矩阵 B 显示真 toggle 率≈0 已废弃,不落地(避免无感改动)。
- **是否动 §9 / core / collision / config**：**否**(纯渲染表现;浮点仅改蛇的屏幕投影,不改任何 world 坐标数值/逻辑/§9)。
- **验收(待复测)**：①强刷(?v→z)→中心区走/转,蛇头/身体/火墙/护盾平滑无 1px 台阶卡动;边缘仍清晰无 shimmer;②重跑 GM 矩阵→头与身 C1 中心 台阶率/伪影率/真toggle率 均↓≈0、C2/C4 仍≈0;③若头或身 任一项台阶率仍高→6拆未净或补偿错→矩阵已抓出,回退方向3(保留世界吸附、接受中心台阶)。

## 2026-07-23 · feat(diag): 中心"诚实1px台阶"监测，定位"中心微动/糊"残留（build 20260723g）
- **背景**：中心闪双取整 toggle 已根除（矩阵中心相位→0%），但用户肉眼仍感到中心区蛇头"糊/微动"。该残留是吸附位图"最小1px台阶步进"（头在动才跳、非 toggle）→ 现有伪影指标（要求真值不动<0.5px）捕获不到，故显示 0%。
- **改动（13_editor.js · 纯 dev 诊断 · 零 gameplay/§9/core/config/11_render.js）**：①`mk()` 累加器加 `step` 字段；②`step()` 新增"`jump≥0.5 && tmov≥0.5`"诚实台阶计数（与伪影 `jump≥0.5 && tmov<0.5` 互补无重叠）；③报告新增"补充指标:诚实1px台阶"段，报各配置中心/边缘相位的**台阶帧占比%** 与 **估算次/秒**（用实时 fps）。
- **是否动 §9 / core / collision / config**：**否**（纯诊断工具增强）。
- **验收（待复测）**：重跑矩阵→报告出现台阶指标段；预期 **C1/C3（开吸附）中心台阶率>0、C2/C4（关吸附）中心台阶=0%** → 印证台阶是"清晰吸附"固有代价（清晰⇄平滑不可兼得）；中心台阶% 高即"中心微动"来源。数据闭环后据此评估是否需进一步调相机滞后（`followLerp=0.4`，手感三参之一，需单开一轴按计划调，不顺手改）。

## 2026-07-23 · fix(render): 中心闪根治——相对相机单次取整吸附，消除「头 vs 相机」双取整 toggle（build 20260723f）
- **根因（GM 一键矩阵坐实）**：上轮 build u 给移动实体也吸附设备像素网格 `snapW(v)=round(v*S)/S`（S=ws*dpr），但实体屏位 = `round(头*S) - round(相机*S)` = **两个独立取整相减 ≠ 取整差值**；中心区相机自由跟随头、两者子像素阈值错位→差值每跨阈值即 ±1 设备像素跳 = 中心闪。边缘相机 clamp 冻结→`round(相机*S)` 恒定→无 toggle→不闪（与实测 100% 吻合）。GM 矩阵数据：C2/C4(关吸附)各相位伪影率全 0%（对照基准）；C3(相机锁定焊死头)中心相位 39–41%、C1(相机跟拍)中心相位 26% → 坐实"头与相机各自吸附"是元凶，非模拟层/相机运动。
- **修复（11_render.js，纯渲染 · 走 §八 计划闸，用户确认后落地）**：废弃绝对网格 `snapW`，改**相对相机单次取整** `snapWX(v)=(round((v-_camX)*S)+round(_camX*S))/S`、`snapWY(v)` 同理（`_camX/_camY` 在 `draw()` 相机块后写入未吸附真值 rcx/rcy）；整条蛇头/身(`drawSnake`)、敌(`_ix/_iy`)、拾取(`drawPickups`)、护盾+火墙(`drawSkillAura`)全部 `snapW` 调用改走 `snapWX/snapWY`；相机 `translate(-rcxS)` **维持不变**（静态世界仍整数设备像素滚动→不丢 build i 的 shimmer 修复）。数学等价 `rcxS + round((w-rcx)*S)/S` = 对"相对相机差值"**单次取整**→ toggle 消除、中心/边缘一致。诊断 `diagFlickerTick` 同步改采样真实屏位 `round((ih-rcx)*S)`。
- **是否动 §9 / core / collision / config**：**否**（纯渲染表现；吸附仅整数设备像素对齐，不改任何 world 坐标数值/逻辑/§9）。
- **验收（✅ 已浏览器复测·2026-07-23T13:33/13:34 两份矩阵）**：①重跑 GM「一键采样矩阵」→ **C1/C3 中心相位伪影率从 39–41%/26% 降到 0%**（两份一致），C2/C4 维持 0% ✅；②肉眼地图中心绕圈→中心闪消失、边缘仍不闪 ✅；③世界静态层滚动无新增 shimmer（相机 `translate(-rcxS)` 未动）✅；④无回归：帧率/手感正常 ✅。边缘相位偶现 1–5% 系指标把"慢速诚实单像素步进"计为伪影（非 toggle 闪烁），良性、与中心闪无关。

## 2026-07-23 · fix(render): 头位图旋转重采样 shimmer 根治 + 无敌双图层消（build 20260723v）
- **根因（修正前两轮误判）**：前两轮只治了"位置"层（build t 原生步进治 60Hz 节奏 judder；build u 像素吸附治移动实体亚像素重采样）。但用户实测中心区蛇头**仍闪**→真凶是**第三类 bug：头部 PNG 每帧旋转重采样(位图爬行 shimmer)**。`getSpriteOff` 把 PNG 预渲染成离屏图(消缩放重采样)，但 `drawSnake` 每帧 `ctx.rotate(hAng)` 旋转这张位图再画→旋转位图=每帧重新光栅化→头边缘抗锯齿逐帧变=闪。矢量身体圆无此问题→"仅头显顿挫"(评论 667)。为何中心闪边缘不闪：中心转向头角每帧变→每帧重采样→闪；边缘贴墙直行头角基本不变→不闪。
- **修复①（头旋转角烘焙进离屏缓存·按 3° 分桶）**：`getSpriteOff(key,r,angle)` 把量化旋转角烘焙进离屏位图(留 1.5× 余量防裁角)，同 3° 桶内角位图只栅格化**一次**并缓存(`_spriteOff` 键=key|r|angQ)，`drawSprite` 不再旋转上下文(避免双重旋转)、每帧 1:1 取用→彻底消灭每帧旋转重采样爬行；跨桶才切下一帧缓存(干净 3° 方向跳变、非 shimmer)。`drawSnake` 改传 `hAngQ+ART_FORWARD_OFFSET_RAD` 给 `drawSprite`、眼睛单独 `ctx.rotate(hAngQ)`(矢量无重采样)、`hAngQ=snapAngle(hAng)`(3° 桶)；`__HEAD_ROT_SNAP=false` 可还原。
- **修复②（无敌"两个画面重叠"）**：配置 `headRadiusRender=26`/`bodyRadius=12`，`drawBodyTube` 先在头中心画 r=12 身圆再叠头；无敌 `blink` 把头降到 0.35 alpha 时，头下那颗 12 亮圆透出→"头+内部亮核"两图层交替闪=用户描述的"两个画面重叠闪烁"。改为**整蛇(身+头)同 `_ba` alpha 淡出**→身圆随头同淡出、不再单独露亮核。
- **是否动 §9 / core / collision / config**：**否**（纯渲染表现；旋转烘焙/量化/整蛇淡出均不改任何 world 坐标数值/逻辑/§9）。
- **验收**：①强刷确认 `[DIAG]` 版本=20260723v；②地图中心转向/绕圈盯蛇头：头(位图)平滑无爬行 shimmer、边缘/中心一致；③GM 无敌：整条蛇干净同淡出、无"头+亮核"双图层；④`__HEAD_ROT_SNAP=false` 对照旧行为(每帧旋转重采样→头爬回)。

## 2026-07-23 · fix(render): 像素吸附补齐——移动实体也吸附设备像素网格，消中心区蛇头亚像素闪（build 20260723u）
- **根因（修正再前一轮误判）**：上轮 build t 把模拟改原生帧时间步进，治了"60Hz 节奏 judder"（运动=面板率平滑）。但用户实测中心区盯蛇头仍"闪动"→ 这是**另一类 bug：亚像素重采样 shimmer**，与节奏无关。既有 `__PIXEL_SNAP`(515) 只把**相机平移 `rcxS`** 吸附到设备像素网格 → 静止世界(边界/背景网格)不抖；但**移动实体**(蛇头/身/敌/拾取/护盾/火墙)用自身精确亚像素世界坐标画，相机吸附管不到 → 每帧落不同亚像素、抗锯齿逐帧变 = 闪动。为何边缘不闪中心闪：边缘有静止地图边界(已吸、稳定)作参照物，中心死盯动态蛇头暴露其亚像素抖。
- **改动（11_render.js，纯渲染）**：新增模块级 `_snapGrid(=ws*dpr)` 与 `snapW(v)` 助手；`draw()` 在相机吸附处写 `_snapGrid`（`__PIXEL_SNAP=false` 时置 0 关闭，保留调试开关）；`_ix/_iy` 插值结果经 `snapW` → 敌人/燃烧/减速/冲锋/精英血字全吸附；`drawSnake` 蛇头+逐节身体经 `snapW`；`drawSkillAura` 护盾光球+火墙沿身采样点经 `snapW`；`drawPickups` 拾取物经 `snapW`。相机与移动实体共用同一 `ws*dpr` 网格 → 整片世界(含蛇)落整数设备像素滚动、相对相机恒定、亚像素重采样 shimmer 消除。
- **是否动 §9 / core / collision / config**：**否**（纯渲染表现；吸附仅整数设备像素对齐，不改任何 world 坐标数值/逻辑/§9）。
- **残余（已知、非本次范畴）**：`05_particle.js` 粒子仍用原始 `lerp(prevX,x,ra)` 未吸附；粒子小且稀疏，若实测仍觉闪再单独吸附（需跨文件暴露 `_snapGrid` 或粒子内自算网格）。
- **验收**：①强刷确认 `[DIAG]` 版本=20260723u；②地图中心死盯蛇头/身直行/甩头/转向：蛇头/身/敌/拾取/护盾/火墙**无亚像素闪**、边缘/中心一致顺；③`__PIXEL_SNAP=false` 可一键还原旧行为核对差异；④不动 gameplay/§9。

## 2026-07-23 · debt(log): 登记 §9 回写清单（3 项）+ STAGE.pool 待量化

- 改动：仅记账，无代码改动。DEBT.md 新增「§9 回写清单」节（A：3 项代码已落值/§9 无记录——`PICKUP.food.overflowScore=10`、`PICKUP.dangerBias.ringMin/ringMax=40/150`、`SKILL.shield.orbitHitMul=0.5`；B：`STAGE.pool` 设计未量化，单列非回写债）。
- 是否动 §9 / core / collision / config：否（仅 DEBT 记账；§9 真源 MD 由胖胖本人回写，AI 未碰；config 值未改）。
- 指向：DEBT.md「§9 回写清单」（2026-07-23 登记）。回写完成后由 AI 配合把「§9 已回填」状态更新进 DEBT/Changelog。

## 2026-07-23 · fix(loop+render): 165Hz 卡顿根因=固定60Hz模拟节奏，改原生帧时间步进+固定子步（build 20260723t）
- **根因（修正前几轮误判）**：前几轮把"蛇头/身抖"归因为"敌人未插值"或"相机/头插值节拍差"，但用户实测改后仍卡 → 真凶是**60Hz 固定模拟在 165Hz 屏上，运动更新节奏只有 60Hz，眼睛在 165Hz 上必然读出 judder**（固定步长架构硬伤，插值只能匀开不能提速；且若模拟=刷新率则 alpha 恒≈0→离散跳变更糟）。诊断铁证：fps=165/steps/s=60/0step帧占63.6%/frameDt 稳→是干净"模拟60/渲染165"节拍错配。
- **改动（11 处）**：
  - `14_main.js`：主循环弃用 60Hz 固定步+`acc`累加器，改为**真实帧时间 `elapsed` 切成 ≤1/240s 固定子步逐次 `step(_sdt)` 推进**（运动=真实帧时间=原生刷新率平滑，165Hz屏=165Hz运动零judder；子步1/240s保物理/碰撞不穿模）；`hitStop` 由帧计数(`hitStop--`)改**时间制**(`hitStopSec -= elapsed`，真源hitStopFrames/60秒，刷新率无关)；暴露 `global.__FRAME_DT` 供相机/屏震帧率无关缓动；diagnostic hint 更新。
  - `06_snake.js`：`updateFollow` 的 `followLerp` 改**帧率无关缓动** `1 - (1-followLerp)^(dt*60)`，避免子步提速致身体过紧（手感与60Hz一致）。
  - `11_render.js`：`updateCamera` 改为**每帧**按 `__FRAME_DT` 帧率无关缓动（原每模拟步+`camPrev/_ra`二次插值已移除）；相机渲染直接=当前真实位姿（`_ra=1`，蛇头/身/敌均原生位姿，消一切插值残留）；`trauma` 屏震衰减由 `/GAME.fps` 改 `*__FRAME_DT`（刷新率无关）。
- **是否动 §9 / core / collision / config**：**否**（纯主循环+渲染表现；所有 gameplay 计时本就用 `dt` 秒驱动，世界速度 `pos+=vel*dt` 与步率无关→§9平衡不变）。碰撞因子步更细反而更安全。
- **验收**：①强刷确认 `[DIAG]` 版本=20260723t；②165Hz 下地图中段直行/甩头/转向蛇头身+敌人+护盾光球顺滑无抖、`0step帧占比`趋0、hint 显示「judder消除」；③60Hz 屏行为与原60Hz 一致（帧率无关缓动保手感）；④开关相机锁定/像素吸附无差异。

## 2026-07-23 · fix(head): 碰撞/渲染半径解耦（碰撞回真源14）
- 改动：02_config 拆 headRadius(碰撞=14,真源§1宁小勿大防冤死) 与 headRadiusRender(渲染=26,纯表现)；11_render 蛇头改读 headRadiusRender + 注释更新；13_editor 新增「蛇头渲染半径px(视觉)」滑条(仅驱动视觉,不动碰撞)，原「蛇头判定半径px(碰撞)」仅驱动碰撞。
- 是否动 §9 / core / collision / config：config 数值结构调整(拆参)，04_collision 逻辑未动(仅读到的 config 值变14)；§9 头部判定半径回真源14(原本即真源,无新平衡值)；渲染纯表现不进 §9。
- 验收：GM 拖「判定」只变碰撞圈/冤死率、拖「渲染」只变蛇头显示大小；视觉头≥碰撞圈；键盘/摇杆手感不变。

## 2026-07-23 · diag(log): fixed-step 卡顿根因定位——加 __DIAG_LOG 文本日志

- **进展**：三轮 A/B 已排除 `__CAM_LOCK`(锁) 与 `__PIXEL_SNAP`(吸附) 为"地图中段卡顿"真凶——锁开+snap开/关均卡、全默认(锁关+snap关)也卡。卡顿与锁/吸附无关。
- **根因假设（高置信，代码事实）**：世界实体(敌人/拾取/粒子/bounds)未做 `_ra` 渲染插值(仅蛇头11_render:206/身段355/相机481 插了)，每模拟步跳一次；相机滚动(中段)时未插值实体的步进跳被掠过视口放大=整片卡顿，相机冻结(边缘)不敏感=顺。fps=60(02_config:12→STEP=16.67ms)本应匹配，但 rAF 抖动/显示器刷新率≠60 致偶发 0-step 帧→实体忽停忽跳。
- **改动(14_main.js)**：加 `__DIAG_LOG` 只读开关，每秒 console 汇总 fps/steps/s/0-step帧占比/alpha[min/avg/max]/frameDt[ms] 并自动 hint 高刷或偶发0-step。零行为影响、可关、不碰 core/collision/config/§9。版本 bump 20260723j 防缓存。
- **待用户复验**：控制台 `__DIAG_LOG=true` + ~两开关全关 + 地图中段跑 5s，把 `[DIAG]` 行发回 → 据此判高刷未插值(方案A:实体加插值) or alpha 节拍(方案B:主循环)。不改码，等数据。

## 2026-07-23 · diag+fix(render): 头抖"中段一顿一顿"=相机/头插值节拍差，加两个 A/B 开关

- **新现象（用户实测）**：蛇头"一顿一顿"只在中段（相机自由滚动）出现、到边缘（相机 clamp 冻结）消失。与"世界 shimmer"不同机制——指向**相机（每模拟步推进一次 camPrev→cam，按 _ra 插值）与蛇头（每帧 interpHead 插值）在不同步长负载下的相对节拍差**：相机滚动快→每帧位移大→节拍差被肉眼读出；相机冻结→零位移→无差→不抖。
- **改动**：①`11_render.js` 相机块新增 `window.__CAM_LOCK` 模式：相机每帧直接 = `interpHead()+lookAhead*dir`（去 followLerp 滞后与 camPrev/cam 插值），clamp 同 `updateCamera` 边界 → 头相对屏幕恒定、彻底消中段头抖（候选修复）。②`ws` 上提到相机块，供锁定模式 clamp 与像素吸附共用（单一真相）。③`13_editor.js`「性能诊断」区新增两个按钮：`像素吸附(消世界shimmer)`（默认开）、`相机锁定插值头(消头抖)`（默认关），点击即 A/B。
- **blame**：`2026-07-23e` 曾回退"每帧追 interpHead"（导致移动糊），本修复用"直接锁定(无 followLerp)"而非"指数追插值头"，规避糊、保消抖。最终手感待用户 A/B 定。
- **性能**：锁定模式每帧仅 1 次 interpHead + 2 次 clamp，零额外分配，FPS 无影响；`__PIXEL_SNAP` 维持 2×Math.round/帧。
- **是否动 §9 / core / collision / config**：否（纯渲染表现 + 调参器 dev 开关）。
- **验收（A/B）**：①开`相机锁定插值头`→地图中段直行/转向头不再一顿一顿；②关→恢复旧节拍差；③像素吸附开关独立影响世界硬边 shimmer；④绕圈/甩鼠标/贴边墙无新增顿挫；FPS 不变。
- **结论归属（已 A/B 确认）**：✅ 根因锁定＝相机/头插值不同步（旧相机追模拟头 h.x + camPrev/cam 独立插值，与蛇头 interpHead 不同源/不同相位）；`相机锁定插值头(__CAM_LOCK)` 开→中段头不抖、关→头抖立刻回，翻转判据成立。此结论**推翻** 2026-07-23e(653行)"回退后仍抖=worldScale shimmer"的误判。锁模式实现为"直接锁定 interpHead、零 followLerp"（非 23e 回退的"指数追插值头"），规避移动糊。下一步：固化默认（见下方计划）。

## 2026-07-23 · fix(render): 相机像素吸附消地图中段滚动 shimmer

---

## 2026-07-23 · fix(render+input): 直线自动转向根治 + 蛇头回退 HEAD 忠实画法（去 squish/代码眼）

- **移动自动转向根治（14_main.js，输入模型；非 core/collision/config/§9 锁死区）**：
  - 根因：`aimFromEvent` 在鼠标移动那一刻把世界坐标**烘焙死**（`cursor.wx/wy` 固定世界点）。蛇每帧朝该冻结世界点转向，前进时方向持续漂移 → 绕点自转＝自动转向、无法直行。
  - 修法：鼠标只存**相对屏幕中心的角度** `cursor.angle`（相机仅平移不旋转 → 屏幕角＝世界角）。`readInput` 朝该角度转向 → 鼠标不动＝角度恒定＝蛇对齐后直行；动鼠标＝角度更新＝360°自由转向；松键/移出画布＝直行。键盘仍优先。
- **蛇头回退 HEAD 忠实画法（11_render.js，render 分区）**：
  - 删 `EYE` 常量、`drawSnakeEyes`/`drawEye`（代码眼画在腮帮子、压住 PNG 自带靠后眼）；删头部 `ctx.scale(sq.sx,sq.sy)`（吃/受击 squash 挤压整张脸＝"压扁"）。
  - 现在**忠实绘制 PNG**（PNG 自带靠后眼睛＋圆舌头＋露嘴），保留离屏预渲染（防位图 shimmer）＋`ART_FORWARD_OFFSET_RAD=π/2` 对齐前进＋blink/无敌环。`solidDiameterPx:628` 等比例不变（不压扁）。
- **影响下游**：纯渲染＋输入；碰撞/伤害/§9 未动；headRadius=26（上轮）不变。
- **验收**：①鼠标不动→蛇直行；动鼠标→360°平滑转向；松键/移出画布→直行；②蛇头不压扁、PNG 自带圆舌＋靠后眼＋露嘴可见；③无 PNG 时 fallback 圆头正常；④身体/无敌环/blink 不受影响。

## 2026-07-23 · fix(render): 相机像素吸附消地图中段滚动 shimmer

- **根因**：世界→设备像素变换链 `dpr·ws·rcx`（`dpr=2, ws=0.8` → 系数 1.6）每帧非整数。相机自由滚动时（地图中段）整片世界（边界 `strokeRect`/拾取/敌人/粒子硬边）逐帧在设备像素网格上做亚像素重采样＝shimmer；地图**边缘**相机被 `clamp` 卡死不滚→世界光栅化固定→不抖。精确对应"地图中段抖、过中段不抖"。`DIAG-HS` 蛇头位移≈0 证明相机-蛇头同步 OK，抖的是硬边世界元素的滚动重采样。
- **修法（11_render.js 相机块，render 分区）**：在 `translate(-rcx,-rcy)` 前把相机平移吸附到整数设备像素网格 `rcxS=round(rcx·ws·dpr)/(ws·dpr)`（y 同理）。吸附残差<1 设备像素(≈0.5 CSS px)肉眼不可见；蛇头仍用未吸附 `rcx/rcy` 绘制、不引入顿挫。`diagCamTick/diagHeadTick` 仍传原 `rcx/rcy`，诊断口径不变。
- **运行时开关**：`window.__PIXEL_SNAP`（默认 true；置 `false` 即关吸附，现场 A/B 对比可确认是其根因）。开关为只读诊断用、不落 §9、不改玩法平衡。
- **性能**：仅每帧 2 次 `Math.round`，零额外绘制/分配，对 FPS 无任何可测影响（已 lint 干净）。
- **是否动 §9 / core / collision / config**：否（纯渲染表现修复）。
- **验收**：① `__PIXEL_SNAP=true`（默认）走到地图正中央直行→整片世界不再颤动；② `__PIXEL_SNAP=false`→立刻恢复 shimmer，确认根因；③绕圈/甩鼠标/贴边墙无新增顿挫；蛇头/舌/眼仍平滑；④ FPS 不变。

## 2026-07-23 · feat(food): 满节食物稀疏化 + 溢出转小分
- 改动：02_config PICKUP.food 加 maxSegScreenCap:2/maxSegRefreshIntervalSec:6/overflowScore:10；06_snake pickup:eat 改以 maxSegments 为唯一门控，满节 else→overflowScore 小分+飘字+Bus('snake:overflow_food')；09_wave foodTimer 按 fullSeg 切换刷新间隔/屏上限；12_ui 记忆 token 满节同停(记忆 tag 仍记)。
- 是否动 §9：overflowScore 为 🟡 TODO 候选[5/10/20] 终值待 §9 回写；其余为节奏/表现值，未在 §9 量化区；core/collision 未动。
- 验收：满25节同屏食物≤2/刷新6s；满节吃食物不加节、转小分；满节不再刷加节食物；记忆 token 满节不授节。

## 2026-07-23 · diag: 直行 stutter + 直线自动转向 排查埋点（window.__SNAKE_DIAG）

- **背景**：用户报 ①直行仍"嘚嘚嘚"（上一轮删 snap 未解，说明 snap 非根因）②走直线会自动转向、无法保持方向。
- **埋点（14_main.js + 11_render.js，纯调试、默认关、非 core/collision/config 锁死区）**：`readInput` 返回 `src`（key/mouse/none）；`frame()` 内 `_diagTick` 每 ~1s 汇总 `steps/frame` 分布、插值 `alpha` 区间、输入源（key/mouse/mouseWhileNoKey）、`cursor.on`、蛇头角度；鼠标输入生效且无键盘时即时告警 `[DIAG] ⚠ 鼠标自动转向生效`；render 内 `diagCamTick` 输出相机每帧屏幕位移直方图（冻结帧多=相机节奏破缺→stutter）。开关 `window.__SNAKE_DIAG=true`。
- **初步判因（待数据确认）**：自动转向≈鼠标在 canvas 上任一移动即 `cursor.on=true`、松键后蛇朝鼠标世界点弯（14_main 输入模型如此）；stutter≈固定步长相机每模拟步更新一次，非 60Hz 屏上每帧 0/1/2 步不规律→相机冻结/突进交替＝"嘚嘚嘚"。
- **是否动 §9**：否（纯调试 + 待定修复）。
- **验收**：开启 `__SNAKE_DIAG` 直行 10s，看 `steps/frame` 是否非 `{1:N}`、`mouseWhileNoKey` 是否高、`[DIAG-R]` 冻结帧是否多，据此定位两项根因并出修复计划（§八）。



## 2026-07-23 · feat(count): 本局升级计数 upgradesThisRun
- 改动：03_core GS.upgradesThisRun:0 + resetRun 归零；08_skill pick 内 +1；12_ui HUD 加「升级 N」；15_profiler 面板加「升级 N」。
- 是否动 §9 / core / collision / config：纯计数展示，无数值平衡变化；core 仅加运行态字段。
- 验收：开局0/每次合法升级+1/HUD显示/开第二局归0。

## 2026-07-23 · fix(render): 回退舌头+像素snap(直行嘚嘚嘚根因) + headRadius 默认 14→26

- **决策**：上一轮"代码画舌头+整数像素snap"未通过实测——①舌头观感丑，用户决定去掉、只留纯蛇头；②直行仍"嘚嘚嘚像刷新"，且 snap 正是元凶：匀速直行时头真实坐标连续前进但被 snap 到整设备像素，只在跨像素边界那帧跳 1px → 规律台阶抖动，转向时台阶不规律被运动掩盖故仅直线显。故本轮回退舌头与 snap，回到纯亚像素插值。
- **改动（11_render.js，全 render 分区，非 core/collision 锁死区）**：①删 `TONGUE` 常量 + `drawTongue()` + 其调用（去舌头）；②删 `snapWorldToDevicePx()` + `drawSnake` 内 snap 调用（消直行台阶抖动）；③`rcx/rcy` 回退为 draw() 局部 `var`（snap 已删无需模块级）。
- **改动（02_config.js，数值）**：`PLAYER.headRadius` 14→26（用户 GM 滑条实测舒适区下沿；`solidDiameterPx=628` 缩放下头视觉随之放大、比身体 r=12 明显更大）。
- **影响下游（headRadius 波及）**：headRadius 判定=视觉同源——04_collision 初值 + Bus(collision:set_radii) + 06_snake 墙碰半径均读它，故蛇头碰撞圈同步放大（更易吃到食物/也更易撞墙中弹），但与用户滑条实测手感一致。bodyRadius 不变。
- **是否动 §9**：**是**（headRadius 影响判定强度）→ 需回写真源 §9（headRadius 14→26 + 登记 Changelog），**由用户回写 MD**；AI 已同步 config.js。
- **验收**：①直行贴脸细看，"嘚嘚嘚"台阶抖动消失、平滑连续移动；②转圈/转向仍顺；③蛇头无舌头、干净；④蛇头明显比身体大（视觉与判定同步 r=26）；⑤边界：暂停头不飘、死亡不抖、无 PNG 时 fallback 圆头正常。

---

## 2026-07-23 · fix(skill): 满级技能不进候选 + 闸门诊断
- 改动：08_skill candidates() 满级技能 push 进 maxed 不进候选(杜绝「选了还是满级」)；08_skill/09_wave 加 [GATE] 诊断日志(确认 allMaxed 判定)。
- 是否动 §9 / core / collision：纯候选过滤+诊断，无数值平衡；core/collision 未动。
- 验收：自然升满某技能 Lv5 后不再进 3选1；全满后不再刷技能球(只刷 heal/food)；[GATE] 日志确认 allMaxed 正确。

## 2026-07-23 · fix(core): Bus 事件名放宽允许驼峰 + on 断言改软拒绝（根治"事件名致命崩溃"第3次同类事故根因）

- **决策**：用户选方案 A（见上轮 Bus 设计利弊分析）。`03_core.js` 的 `Bus` 事件名校验策略调整，属锁死文件改动，走 AGENTS §三 披露 + §八 计划。
- **改动（03_core.js）**：①正则 `/^[a-z0-9]+:[a-z0-9_]+$/` → `/^[a-z0-9]+:[a-zA-Z0-9_]+$/`（动作段允许大写字母，驼峰合法；仍挡空格/空名/特殊字符）；②`Bus.on` 首行 `assert(RE.test(evt), ...)` 致命崩溃 → 改为 `if (!RE.test(evt)) { Log.warn(...); return fn }` 软拒绝（格式可疑仅告警+跳过该回调注册，模块不崩，仍返回 fn 兼容调用方）；③emit 端本就安全（无 assert），不动；④Bus 注释同步新约定。
- **根因（为何改）**：2026-07-13 `fx:iceSlow`（粒子系统）+ 2026-07-22 `collision:setRadii`（碰撞系统）两次同类事故，均因"事件名含大写 → Bus.on 的 assert 抛错 → 整模块 IIFE 中断未注册 → 整系统静默失效"。强制全小写把"风格违规"升级成"致命崩溃"且漏防"下划线不一致"真正 bug。放宽 + 软拒绝后，驼峰不再崩模块，单事件名可疑也仅收不到、不拖垮全局。
- **影响下游**：全项目 65+ 处 Bus 事件名行为不变（均合规）；唯一变化=驼峰事件名不再致命崩溃；若某事件名含空格/特殊字符，现仅 warn+跳过注册（此前是崩整模块）。无 §9 数值改动、无加载顺序/伤害管线改动。
- **是否动 §9**：否。
- **文档同步**：RETRO §4 更新为"动作段允许驼峰、但 on/emit 必须同名、格式可疑仅 warn 不崩"；DEBT §4 第三次事故条目闭环为"已落地方案 A"。
- **验收**：①刷新无红字、蛇/食物/敌/碰撞正常（用户实测）；②故意写驼峰事件名不再崩模块（grep 确认 Bus.on 无 assert 崩溃路径）；③RETRO/DEBT 同步新约定。

---

## 2026-07-23 · fix(input): 鼠标转向模型重写(治直线自动绕圈)
- 改动：14_main aimFromEvent 重写为存「相对屏幕中心角度」cursor.angle(相机仅平移→屏角=世界角)；加 mouseSteerIdleSec:0.12/mouseMoveDeadPx:3(空闲/微抖判定)；pointerleave 清 lx/ly；_diag 诊断。02_config INPUT 加 mouseSteerIdleSec/mouseMoveDeadPx。
- 是否动 §9 / core / collision：输入模型，非 §9 平衡值；键盘/摇杆默认手感不变。
- 验收：①动鼠标蛇头跟着转 ②鼠标停住蛇走直线不绕圈 ③键盘/摇杆手感不变。

## 2026-07-22 · fix(collision): 根因修复——Bus 事件名驼峰违例致碰撞模块启动失败（"吃食物/撞怪无反应"真因）

- **现象/根因**：上一轮"错误兜底前移 + collision try/catch"暴露出真实错误 `[assert]Bus 事件名须为 系统:动作 小写 → collision:setRadii`。`03_core.js` Bus 事件名正则 `/^[a-z0-9]+:[a-z0-9_]+$/` 要求动作部分**全小写**；`04_collision.js` 用 `Bus.on('collision:setRadii')` 接收 GM 半径滑条实时推送，`setRadii` 含大写 `R` → `Bus.on` 首行 `assert(RE.test(evt))` 在启动时抛错 → 整个 IIFE 中断 → `Registry.register('collision', ...)` 未执行 → 碰撞系统整体未注册 → 食物/怪物判定全失效（完全吻合首发"吃食物无反应 + 怪物撞击无反应也不掉血"）。
- **修复（纯命名修正，零逻辑/数值/§9 改动）**：①事件名改为全小写 `collision:set_radii`（下划线在正则合法集内）；②同步 `13_editor.js:324` 的 `Bus.emit` 发射端及注释，保证收发一致；③`04_collision.js` 注释中 `collision:setRadii` 一并改为 `set_radii`。
- **波及核对**：反向扫描全项目 65+ 处 `Bus.on/emit/off` 事件名，其余均符合"全小写 + 下划线"规范，无第二个驼峰违例。
- **是否动 §9**：否（仅事件名字符串）。
- **验收**：刷新后状态条 `碰撞:已载` 且 `判定R:<数值>`（`getRadii()` 取值正常）；食物可吃、怪物撞击掉血恢复。上一轮基建（onerror 前移 + collision try/catch 暴露 `window.__colErr`）保留作长期防御（DEBT §4）：今后任何脚本启动错误直接弹红字，不再静默吞掉。

---

## 2026-07-22 · fix(infra): 全局错误兜底前移 + collision 启动异常暴露（根治"碰撞缺失"静默隐藏）

- **现象**：用户复验报"吃食物无反应 + 怪物撞击无反应也不掉血"，二者同时失效；强制刷新仍复现；诊断条显示 `碰撞:缺失` 但"无红字"。
- **根因（已定位方向）**：`index.html` 的全局 `error` 兜底 `window.addEventListener('error',...)` **注册在所有游戏 `<script>` 之后**（原第 60 行）。`04_collision.js` 若在启动期抛运行时异常，`Registry.register('collision', Collision)` 未执行 → 碰撞系统未注册；而该异常发生时兜底尚未挂上 → 被静默吞掉（无红字）。蛇/食物/敌人各自独立 IIFE 照常运行，故唯独碰撞全失效，完美吻合"碰撞缺失 + 无红字"。静态核对（语法/IIFE 闭合/`CONFIG.SPATIAL`=cellSize:64/`Core.M`/`PLAYER.headRadius`）均正常，故为运行时异常，须暴露后精确定位。
- **修复（三处，纯诊断/基建增强，零 gameplay 影响）**：①`index.html` 把 `error` 兜底整体前移到 `<head>`（早于所有游戏脚本），根治一切脚本错误的静默；②`04_collision.js` 整个 IIFE 体包 `try/catch`，启动异常暴露到 `window.__colErr` 并 `console.error`，仍 `throw` 交兜底显示红字；③`14_main.js` 诊断条 `diagTick` 碰撞缺失时把 `window.__colErr` 真实错误拼入顶部状态条（截断 160 字），免开控制台。
- **是否动 §9**：否（纯诊断/基建，非数值平衡）。
- **验收**：①刷新后若 collision 仍抛错 → 状态条显示 `⚠碰撞启动失败:<真实错误 文件名:行号>`，据此定位；②onerror 前移后任何脚本偶发错误正确弹红框，不再静默；③若暴露后错误消失（顺序/缓存），状态条 `碰撞:已载` 且食物/怪物碰撞恢复。
- **下一步**：据暴露的真实错误做最终修复（再开计划）。`#diag`/`diagTick` 仍属临时诊断债（DEBT §4），根因修复后清理。

---

## 2026-07-22 · infra(render): #M0 美术管线基建（精灵子系统 + 半径滑条，空 assets 零变化）

- **范围**：`11_render.js` 新增精灵子系统——`SPRITE_MANIFEST`（head/body/tail 三项，`radiusKey`=RT 的 path + `solidDiameterPx` 资产属性 + `pivot`）/ `_spriteCache`（每张图仅 `new Image()` 一次）/ `SPRITE_BASELINE`（`key=radiusKey`，值=冻结 CONFIG 基线）/ `getSpriteRadius(radiusKey)`（单一半径读取：RT 运行时覆盖优先、缺失回退基线、守卫 `r>0`）/ `preloadSprites()`（`init` 末尾一次性预载，每帧不 new/decode）/ `drawSprite()`（按判定半径算 scale，无图/404/NaN → 回退代码画 fallback，永不白屏/抛错）。`drawSnake` 头/身/尾接 `drawSprite`，fallback＝原 `circle()` 圆画。`13_editor.js` `SNAKE_SCALAR` 加 `PLAYER.headRadius`/`PLAYER.bodyRadius` 滑条（`RANGE.playerRadius=[4,40,1]`，config-override `save+reload`）。新建 `snake55/assets/` + `.gitkeep`。
- **Bug 修复（放行前定位）**：`SPRITE_BASELINE` 原用精灵名做 key、与 `getSpriteRadius(entry.radiusKey)` 传入的 `RT path`（`'PLAYER.headRadius'`）错配 → `undefined` 基线 → `NaN` scale 漏过 `scale<=0` 兜不住 → 蛇消失/破功。已修为 `key=radiusKey` 对齐 RT path，并硬化 `if (!(scale>0))` 同时兜 NaN/0/负。
- **时序保证（验收⑤一致性）**：`SPRITE_BASELINE` 在 `11_render.js` 模块加载时读取 `PLAYER.headRadius`；而 `03_core.js` 已在 `deepFreeze(CONFIG)` 前 `applyTuningOverrides()` 把 localStorage 覆盖写回 CONFIG，且 `11_render.js` 在 `03_core.js` 之后加载（index.html 顺序）→ `PLAYER.headRadius` 已是覆盖值 → `04_collision`（`var HEAD_R = CONFIG.PLAYER.headRadius`，同在 deepFreeze 之后加载）与视觉同随（看到=打到）。
- **铁律遵守**：不动 `03_core.js`/`04_collision.js`；判定半径只读不改；不新建 `10_assets.js`（全落 `11_render.js`）；不改动 `index.html` 脚本顺序；保留代码画 fallback；缩放系数由判定半径算（禁魔法数字）；精灵实心视觉半径=config 判定半径、透明发光像素不计判定。
- **是否动 §9**：否（纯美术管线基建 + 半径滑条走 config-override 默认值=原值；无新平衡数值锁定）。
- **债（#M1，本单不做）**：`snake_tail` pivot `[0.5,1.0]` 与 fallback 圆（中心锚点）不一致，接真图会跳位 → 校 pivot；manifest `solidDiameterPx`（64/48/48）接图时必须与实际 PNG 实心直径一致，否则缩放错。已记 DEBT §4。
- **验收**：
  - [ ] 空 assets → 画面零变化、无报错、蛇头/身/尾无漏画（全走 fallback 圆）。
  - [ ] 拖 headRadius/bodyRadius 滑条 → save+reload → 蛇视觉与判定圈（GM「显示碰撞盒」红圈）同步缩放。
  - [ ] 60fps 无掉帧，每帧无 `new Image`/无 decode。
  - [ ] 反向——`git diff` 仅 11_render.js / 13_editor.js / assets/.gitkeep / 本文档 / DEBT，core/collision/02_config 未动。
- **返工（2026-07-22 实测打回）**：①`drawSprite` 改为 `preloadSprites` 一次性建 `_spriteCache[name]={img,ready:false,failed:false}`，`onload→ready` / `onerror→failed`；`drawSprite` 第一行硬短路 `if (!c || c.failed || !c.ready) return false`，**任何 ctx 变换前就 return，函数内绝不 new Image/发请求**；`preloadSprites` 幂等（init 重入不重复 new）。②`drawSnake` fallback 半径改用 `getSpriteRadius('PLAYER.headRadius'/'PLAYER.bodyRadius')` 单一源（与精灵路径/碰撞同经冻结 CONFIG），焊死「看到=打到」。③FPS 实测观察：CPU 0.7ms、外部 33.8ms ≈ rAF 间隔 33ms（≈30Hz），非 JS 负载 → 判为显示器 30Hz 或 IDE 内置预览节流，非 #M0 回归；已按硬性要求加 ready/failed 硬短路防御，请 DevTools→Network 确认 assets/*.png 仅启动期各 1 次后归零。
- **对抗性审查复查（2026-07-22·用户「插电即满帧、调大小正常」后）**：在 #M0 代码上做对抗性审查，再修 2 处隐患（均在本人引入的 11_render.js 内、对当前空 assets 行为零变化）：①**资源路径真 bug**：`ASSETS_BASE` 原 `'snake55/assets/'`——`img.src` 相对页面 URL 解析，而 `index.html` 与 `assets/` 同处 `snake55/`，任意服务/打开方式都会拼成 `…/snake55/snake55/assets/` 全 404；空 assets 时静默走 fallback 看不出，一旦放真 PNG 会全 404 永不显示（美术管线直接失效且不报错）。已改 `'assets/'`（相对 index.html，项目根/`snake55/`根/`file://` 皆正确）。②**蛇尾双绘（潜在）**：身体循环原把最后一节也画 body 圆/图、尾巴块又在同一位置画 `snake_tail`，空 assets 时尾巴块 `drawSprite` 返回 false 不显（看不出），接真图会重影。已改身体循环从 `segs.length-2` 起、尾巴块 fallback 时补画同半径圆，两种状态都只画一次。③其余观察（非阻塞）已补进 #M1 债：head squash/无敌闪烁不作用于精灵路径、head/tail 朝向须按 sprite 约定配图（`h.angle` 0=+x、tail `pivot[0.5,1.0]` 要求「连接点朝下/尾尖朝上」）、放 PNG 后须整页刷新（Image 在 init 一次性 new、`failed` 永不重试）。
- **验收（空 assets·当前态已满足）**：①空 assets → 画面零变化、无报错、蛇头/身/尾无漏画（全走 fallback 圆）。②拖 headRadius/bodyRadius 滑条 → save+reload → 蛇视觉与判定圈（GM「显示碰撞盒」红圈）同步缩放（用户实测已 ok）。③60fps 无掉帧（用户插电源后已恢复 60）、每帧无 `new Image`/无 decode。④反向——`git diff` 仅 11_render.js / 13_editor.js / assets/.gitkeep / 本文档 / DEBT，core/collision/02_config 未动。

## 2026-07-22 · feat(editor) L2: 蛇头/身半径 GM 滑条实时生效（免重载，判定同步）

- **需求**：用户要求拖「蛇头半径/蛇身半径」滑条即时生效，而非「保存并重载」；选 L2（推送式，碰撞 update 内零 RT 读取）。
- **方案（4 文件）**：①`13_editor.js` 两滑条 `oninput` 双写——`rtSet(path,val)`（RT 桥→render 视觉）+ `Bus.emit('collision:setRadii',{headRadius,bodyRadius})`（→判定/墙碰）+ 仍写 `overrides`（供「保存并重载」持久）；②`04_collision.js`（§三 锁死文件，已披露）加 `isNum` 助手 + `Bus.on('collision:setRadii', …)` 把推送值写入模块缓存 `HEAD_R/BODY_R`（初始取冻结 CONFIG，reload 后由 applyTuningOverrides 自动取终值），`update()` 内部不再读 RT，零每帧额外开销；③`06_snake.js` 墙碰 `P.headRadius` → `RT('PLAYER.headRadius', P.headRadius)`；④`11_render.js` `drawDebugHitboxes` 红圈改 `getSpriteRadius('PLAYER.headRadius'/'PLAYER.bodyRadius')`（RT 优先）。
- **一致性保证（看到=打到·拖动时也成立）**：render 视觉经 `RT()`（读 `Registry.get('editor').rtGet` 同一份 `rtTuning`）；collision 经 `Bus` 推送获取同源数值；snake 墙碰经 `RT()`。三者同源自滑条读值。
- **性能（用户关切·已量化）**：L2 碰撞 `update()` 内**完全不读 RT**（仅滑条一动推 1 次 `Bus`，O(1)）；snake 墙碰每 tick 1 次 `RT()`≈2 次 O(1) 查表、零分配、不触发 GC、`rtTuning` 仅 2 key 不增长 → 玩几小时 FPS 不衰减；相对 `hash.query` 每节几十次运算占比 <0.001% 帧预算。
- **不动**：`03_core.js`/`02_config.js` 数值结构·真理源 / 加载顺序 / 判定几何与伤害公式语义。RT 为 dev-only 运行时覆盖，不写真源。
- **是否动 §9**：否（仅半径可视/判定读取来源切换，无新平衡数值锁定）。
- **验收**：①拖滑条→蛇头/身即时变大、GM「显示碰撞盒」红圈同步变大；②拖动中吃食物/撞敌判定实时变（蛇胖了能吃到更远食物、胖了更易被敌碰）；③撞墙边界实时随半径钳制；④点「保存并重载」→reload 保持当前覆盖值（持久正确）；⑤不拖→行为与原完全一致（零回归）；⑥`git diff` 仅 11_render.js / 13_editor.js / 04_collision.js / 06_snake.js / 本文档 / DEBT，02_config/03_core 未动。

## 2026-07-22 · 对抗性复查（food 暗雷）· 用户报"吃食物没效果"

- **对抗性审查结论**：L2 四文件改动**在逻辑上不触碰食物检测代码路径**。证据：①`04_collision.js` 食物循环（`if (fd.active && circleHit(head.x, head.y, HEAD_R, fd.x, fd.y, fd.radius))`）字节级未变，`HEAD_R` 初值仍取自 `CONFIG.PLAYER.headRadius`；②`06_snake.js` 仅把墙碰 `r` 的来源从 `P.headRadius` 改为 `RT('PLAYER.headRadius', P.headRadius)`，该 `r` 只用于墙钳制，不影响蛇移动与食物路径；③`11_render.js` / `13_editor.js` 改动均为视觉或仅在 `oninput` 触发。故 L2 不会直接导致"吃不到食物"。
- **但发现真正会静默杀死判定的暗雷（根因候选）**：`circleHit` 用 `(ar+br)` 判距；若 `HEAD_R`/`BODY_R` 为 `0/NaN/undefined/字符串错值`，`(ar+br)` 退化为 `NaN` → `dx²+dy² <= NaN` 恒为 **false** → **食物×头、敌×头、敌×身 三类判定全部静默失效**，且因 reload 后经 `applyTuningOverrides` 把 `localStorage['snake55_tuning']` 覆盖回 `CONFIG`，坏值会顽固复现 → 表现为"吃食物没效果"。触发源：旧调试会话残留的坏 override（如把 `PLAYER.headRadius` 写成 `0`/`""`/`"20"` 字符串），或实时推送误发 ≤0 值。
- **修复（04_collision.js）**：加 `numRadius(v)`（强制转数字、非正/NaN/非有限/字符串错值→0）+ 初值 `HEAD_R = numRadius(CONFIG.PLAYER.headRadius) || 14`、`BODY_R = numRadius(CONFIG.PLAYER.bodyRadius) || 12` 兜底（14/12 为 RANGE 注释记载默认）；`Bus.on('collision:setRadii')` 推送也经 `numRadius` 拒绝坏值。另暴露 `Collision.getRadii()` 供控制台 `Registry.get('collision').getRadii()` 秒查当前实际判定半径。属防御性兜底，对正常正半径值零行为变化。
- **若修复后仍"吃不到食物"则非半径问题（需进一步信息）**：①`Registry.get('collision').getRadii()` 看 head 是否 >0；②DevTools Console 是否抛错（render 抛错会冻结画面，rAF 虽预排但整帧不更新，易被误判为"吃不到"）；③蛇是否真的长大、还是整局卡死。请报上述三项。
- **回归验证（修后须过的）**：①清空 `localStorage['snake55_tuning']` 后 reload → 食物正常吃（head=14 默认）；②残留坏值（如 `"PLAYER.headRadius":0`）时 reload → 仍正常吃（兜底生效）；③拖半径滑条实时变大且判定同步；④`git diff` 仅 04_collision.js（+ 本文档/DEBT）。

## 2026-07-22 · fix(collision): food 暗雷第二轮——判定半径"过小正数"兜底

- **用户复验**：上轮加 `numRadius`（拒 ≤0/NaN/字符串）后仍报"吃食物没效果"。
- **根因（上轮漏网）**：`numRadius` 仅拒 ≤0，但 GM 滑条 `RANGE.playerRadius` 最小=4，曾把 `PLAYER.headRadius` 拖到 4 并"保存并重载"持久进 `localStorage['snake55_tuning']`。`HEAD_R = numRadius(4)=4`（正数不回退），`circleHit` 需 `dx²+dy² <= (4+10)²=196` → 蛇头判定圈仅 4px、食物 10px，共 14px 命中窗，蛇头中心几乎要贴到食物中心才触发 → 视觉"碰到了却吃不到"；刷新清不掉 localStorage 故顽固复现。
- **修复（两处）**：①`04_collision.js` `numRadius` 加安全下限 `MIN_JUDGE_R=8`——`<8` 一律当无效回退默认 14/12（仅 >0 且 ≥8 才采用）；初始 `HEAD_R/BODY_R` 与 `Bus('collision:setRadii')` 推送均经此守卫。②`13_editor.js` `RANGE.playerRadius` 最小 `[4,40,1]→[8,40,1]`，与 `MIN_JUDGE_R` 对齐，从源头避免拖出过小判定半径。
- **效果**：即便 localStorage 残留 `headRadius=4` 之类过小值，reload 后判定半径强制回退 14，刷新即恢复"正常吃食物"，无需手动清存档。
- **是否动 §9**：否（dev 工具边界安全下限，非 gameplay 平衡数值；RANGE 注释已声明"dev 工具边界，非 gameplay 数值"）。
- **验收**：①残留 `{"PLAYER.headRadius":4}` 时 reload → 食物正常吃（判定回退 14）；②拖滑条最小 8 → 蛇头判定 8px + 食物 10px = 18px 命中窗，可吃；③不拖→与原默认行为一致（零回归）；④`git diff` 仅 04_collision.js / 13_editor.js / 11_render.js / 本文档。

---

## 2026-07-22 · diag(collision): 顶部中文状态条 + index.html ?v 强刷（定位「吃不到/撞不到」）

- **现象**：用户报"吃食物没反应 + 怪物撞击没反应也不掉血"，二者同时失效；强制刷新仍复现。静态核对 food/enemy 检测路径、数据源命名、CONFIG 默认值（headRadius=14/bodyRadius=12/food.radius=10/enemy.radius=8）、GS.status 流转均正常，且 index.html 全局 error 兜底无红字（排除模块未注册/加载报错）。
- **假设**：①浏览器缓存旧 04_collision.js（旧 numRadius 仅拒 ≤0，残留 headRadius=4 不回退 → HEAD_R=4 → food+head_enemy 命中窗极小，表现为"贴脸才触发"）；②或运行时数据异常（状态非 playing / 食物未生成 / 判定半径异常）。静态无法二选一。
- **措施**：①`index.html` 全部 `<script src>` 加 `?v=20260722b` 强制重新下载，破本地缓存；②`14_main.js` 加 `diagTick()` 每 ~250ms 在画面顶部 `#diag` 显示中文状态条：`碰撞:已载/缺失 状态:<GS.status> 判定R:<getRadii().head> 食物:<active数> 敌:<active/怪> 蛇头:<x,y>` + 异常警告（状态非playing/无实体/判定R<8）。非技术用户直接念数字即可定位。
- **是否动 §9**：否（纯诊断+缓存破坏，非数值平衡）。
- **验收**：①刷新后顶部出现状态条；②若"判定R:14 食物>0 状态:playing"且仍吃不到 → 转坐标系/下游 handler 排查；③若"判定R:4" → 旧缓存未破（?v 生效前需硬刷一次）；④定位后删除 diagTick 与 #diag（临时债）。
- **注意**：`#diag` 与 `diagTick` 为临时诊断产物，定位根因后须剔除，勿随功能代码遗留。

---

## 2026-07-22 · perf(skill) #6: 消除每帧 queryCircle GC 抖动

- **范围**：`08_skill.js` 的 `enemiesIn`（火墙/冰池/护盾球/蒸汽引爆共用的 AOE 索敌）原每帧每 AOE 中心一次 `collision.queryCircle`，每次含字符串 key 拼接 + map 查找 + 新数组分配的 GC 抖动（已登 DEBT 冰区扫描债）。改为复用每帧 `_enemySnap` 做 **cell 覆盖相交判定**，精确复刻 `SpatialHash.query` 返回集合（cell 级宽松、非精确圆），**零行为变化**。
- **波及**：tickFire/tickIce/tickShield/tickCombos/doLightningChain 全部 AOE 索敌经同一 `enemiesIn` 统一受益；`04_collision.js` 未动；`CONFIG.SPATIAL.cellSize` 复用（§6 禁裸数字）。
- **DEBT**：冰区扫描债（🔴→✅ 已还），见 docs/DEBT.md。
- **验收**：见随附测试用例。

## 2026-07-22 · fix(core) #8 §3: 对象池/Bus 防御硬化（补记）

- **范围**：见 commit `af6eff7`（独立 §3 commit，密度标定前完成）。`createPool.release` 加 `_inPool` 标记防双 release/release(null) 污染池；`Bus.emit` 遍历前 `slice()` 快照防 emit 期间 on/off 本事件导致遍历错乱。正常路径零行为变化，下游无需改；未动 `04_collision.js` 与 `Bus.on/off/clear`。本 CHANGELOG 条目为补记（#8 落地时未同步文档）。
- **验收**：见随附测试用例。

---

## 2026-07-22 · infra(skill): 电磁 Combo 节奏 RT 桥 + GM 滑条（P1 实测无感·轴暂缓）

- **范围**：`08_skill.js` 加 `RT('COMBO.electroTurret.cooldownSec', CO.electroTurret.cooldownSec)` 桥（P0 turnRate 同款，dev 热调）；`13_editor.js` RANGE 加 `electroCd:[0.2,1.5,0.05]` + TUNING_SCALAR 加「电磁冷却s」滑条（自动接线 `rtSet`→`rtTuning`→`RT()`）。默认 `0.5` 行为零变化，留作基建。`03_core`/`04_collision` 未动。
- **实测结论**：拖 `0.4/0.5/0.8` 体验无感——CD 仅提频 ~25%，电磁本体即闪电、与基础闪电链（`fx:lightning`）视觉同质，满屏特效读不出变化。故 CD **维持锚点 0.5、不定 0.4/0.8、不落 config 终值**。
- **债**：可见性表现债（DEBT §2 ①）「电磁与闪电读不出」已记——独占色/音效/命中锚定弹体/更强分叉，下一步不做。
- **是否动 §9**：否（无终值锁定；§9 由用户侧回写）。
- **验收**：GM「电磁冷却s」滑条存在、默认 `0.5`、拖动即时生效（`timer.electro` 热改，段③/④ 连锁节奏随动）；核心/碰撞未动。

## 2026-07-22 · tune(player): 转向衰减 0.6→1.0 %/节（C2 手感标定，§十 轻量通道）

- **范围**：`PLAYER.turnRateDecayPerSeg` `0.006`→`0.010`（02_config.js 真理源落地值）。GM 面板「转向衰减%/节」滑条 `def: 0.6`→`1.0` 同步（13_editor.js）。`turnRate`(180) / `turnRateFloor`(120) 不动。`03_core` / `04_collision` 未动。
- **推导（§十 反降智）**：25 节转速 = `180·(1 − decay·22)`。现状 `0.6`→`156.24°/s`（与满节仅差 13%，偏灵活，用户实测认定差距过小）；候选 C1=0.8→148.32 / **C2=1.0→140.40（降 ~10%，长蛇明显更钝）** / C3=1.2→132.48；用户实测选定 C2。
- **波及**：仅喂 `06_snake` 蛇头转向，**不碰伤害管线**（§六 伤害一致性无影响，无下游 combat 牵连）；副作用=长蛇后期闪避略难（预期平衡代价）；`turnRateFloor:120` 在衰减 ≤1.36%/节 时不触发，下限仅安全网。
- **是否动 §9**：是（`§1 turnRateDecay` 主表 + Changelog 同步回写，顺序遵循 §七）。
- **验收**：①正常——吃满 25 节、不碰 GM 滑条，HUD「转向」应显示 `140.4`；②边界——开局 3 节 HUD 仍 `180.0`（短蛇不衰减）；③反向——控制台无报错；④回归——`git diff` 仅 02_config.js / 13_editor.js / 本文档 / §9 文档，core/collision 未动。

## 2026-07-22 · eval(perf): 2400 掉帧 + 自动降级真实行为澄清（零改动，保持现状）

- **触发**：实测把 GM「渲染分辨率上限W」(`RENDER.maxBackW`) 拉到 2400 → 画布 2400×1350，FPS 偶降 30~95；同期「档 HIGH自动」看似"降画质没生效"。
- **评估结论（用户确认 A 方向：保持现状，零改动）**：
  - **2400 掉帧是物理性预期**：backing 像素 1600→2400 ≈ ×2.25，瓶颈在 GPU present 大画布。profiler 证据：掉帧帧 `外部`(presentGap) 飙到 9~25ms，而 `CPU`/`帧` 仅 0.5~1.3ms → 非 JS/逻辑/overdraw。默认封顶 1600 即为此设。
  - **自动降级真实行为 = 仅"关火/余烬"二进制开关，绝不切档、绝不降分辨率**：`PerfTier.tick()` 注释白字"零档位切换"；`stepDown`/`stepUp` 为死函数（全仓无调用者）；`tierDownFps`/`tierUpFps`/`tierStabilizeSec`/`tierDownStabilizeSec` 为死配置（无代码读取）。
  - **关火看门狗近乎休眠**：看 `overdraw(px²)/1000 ≥ fillDownThreshold(320)`，即 overdraw≥320k px²；实测 overdraw EMA≈3~10k(px²)、峰值 35k，离 320k 差一个数量级，永不触发。
  - **即便触发关火也救不了 2400**：关火只压火焰 VFX，与"大画布基础像素 present"瓶颈无关。
  - **GM 手动 `maxBackW=2400` 覆盖优先级高于任何档位** → 自动档想降分辨率也会被压住。
- **决策**：2400 定位为「手动·清晰优先」实验旋钮（掉帧是预期取舍）；日常用 ≤1600 稳 60fps。不新增 FPS 自动降分辨率（方案 B：避免画布 realloc 闪烁 + 乒乓 + 与 GM 覆盖优先级冲突；未采纳，仍可作为 §八 待办）。
- **是否动 §9**：否（纯评估，零代码改动）。
- **验收**：无需复验；本文档已澄清真实行为，并修正 `docs/plans/mobile-touch-optim.md` 边界③ 的误导措辞。

---

## 2026-07-22 · fix(review): 对抗性审查隐患修复（#1/#2/#3/#4/#5/#7/#9；#6/#8 已落地）

- **范围**：本批修 7 项 — #1 叙事抉择死后超时仍 resolve（涨节/加血/记记忆）、#2 对象池复用 invuln 残留致普通敌短暂无敌、#3 鼠标悬停永久屏蔽键盘 WASD、#4 tickBolt 原地排序共享快照、#5 闪电链跨全场连锁、#7 applyDamage/updateOne 缩进整理、#9 resetRun 未重置 tuningSandbox。#6（技能热路径 queryCircle 过多·perf 债）与 #8（03_core 池/Bus 防御硬化）按约定拆出单独走；#10（蒸汽屏震聚合）经复核非 bug 已撤回。
- **数值改动**：新增 `SKILL.lightning.chainJumpRange:[80,100,120,140,160]`（候选 A，§4.5 真源已登记，见 §9 Changelog）。射程类平衡值，精调留待③数值专项优化。
- **触碰底层声明**：#9 改动位于 `03_core.js` 的 `resetRun()`，仅新增一行状态重置 `GS.tuningSandbox=false`（运行态重置，非引擎逻辑）；未改动 `04_collision.js` 与池/Bus 引擎（#8 才涉及，本批未做）。
- **§9 纪律**：真源优先 → config 镜像回填 → 本 CHANGELOG 仅作单向镜像（不当真源）。
- **验收**：见随附测试用例。

---

## 2026-07-22 · fix(narrative): 叙事抉择弹窗点不动/关不掉（pointer-events 穿透）

- **改动文件**：`12_ui.js`（第 32 行 `choiceBox` 样式补 `pointer-events:auto`）
- **根因**：叙事不可逆抉择用 `choiceBox`（挂在 `#ui-stage`，`index.html` 第 18 行 `#ui-stage{pointer-events:none}` 让点击穿透到 canvas 做游戏操作）。`choiceBox` 自身未重开 `pointer-events:auto`，按钮继承 `none` → 点击穿透、选了无反应、也关不掉，只能等 `after(timeoutSec)` 定时器到点自动消失。对比技能卡 `choose`/`result` 样式末尾都带 `pointer-events:auto`（故技能卡能正常点）；`choiceBox` 漏了这条 → 电脑/手机两端都失效。
- **一句话**：叙事抉择弹窗按钮点不动是因为 `#ui-stage` 的 `pointer-events:none` 被按钮继承；补 `choiceBox` 的 `pointer-events:auto` 即可（仅盒子区域捕获点击，#ui-stage 其余仍穿透，保持"非阻塞抉择"设计，不影响游戏中其他点击）。
- **是否动 §9**：否（纯 UI 点击命中，无平衡数值）
- **验收**：
  - 电脑/手机：叙事事件弹「不可逆抉择」→ 点 A/B 任一 → 选项生效（加心/长节/记忆写入）、弹窗立即关闭（不再等超时）
  - 点超时默认项：仍按 `ev.def` 生效并关闭
  - 抉择弹窗出现期间，画面其余区域点击仍能操控蛇（非全屏遮挡）
  - 未动 core/collision/§9/`02_config`；技能卡/结算/暂停点击不受影响

---

## 2026-07-22 · fix(mobile): 手机端画面/文字模糊（backing 分辨率上限提升）

- **改动文件**：`11_render.js`（`resize()` 中 `dprMon = Math.min(devicePixelRatio, 2) → 3`：retina 手机 dpr=3 原被压到 2× → 浏览器放大糊；桌面 dpr 通常≤2 不受影响）、`02_config.js`（`PERF.tiers.MED.maxBackW: 1280 → 1920`：MED 档 backing 宽上限提升，配合 dpr 上限 3，iPhone 横屏 backing≈1920 显示物理≈2292 → 仅 1.19× 放大，文字/画面接近清晰）
- **一句话**：修手机端"糊"——根因是后台缓冲分辨率被 `dprMon≤2` + `MED.maxBackW=1280` 两道上限压到远低于手机物理像素(~2292)，浏览器双线性放大致糊；与技能特效开关/视图缩放无关。提升两上限让 retina 手机用足原生像素。填充率约 ×1.5，弱机由 fill/FPS 看门狗自动降 LOW/POTATO 兜底(其 maxBackW 仍 1024/800，会重新变糊——属性能取舍)。
- **是否动 §9**：否（纯渲染分辨率/视图预设，无伤害/血量/速度/射程；worldScale 等不变）
- **波及**：仅视觉层 backing 分配(`11_render.resize`)、所有 canvas 绘制清晰度；桌面 HIGH 档 `maxBackW=1600` 不变（用户桌面 2400 掉帧为他手动把 GM 滑条 `RENDER.maxBackW` 拉到 2400 绕过封顶所致，非默认）；伤害/碰撞/公式不动
- **验收**：
  - 手机：文字与画面明显变清晰（不再放大糊）；仍落 MED 档，火焰/蒸汽表现正常
  - 桌面：默认 HIGH 仍 60fps；若之前把 GM `渲染分辨率上限W` 拉到 2400 致 30fps，调回 ≤1600 即恢复（大屏想更清晰可保留 2400 但接受掉帧）
  - 弱机/小屏：若掉帧，HUD「档」自动降 LOW/POTATO，火焰自动关、画面可能略糊（看门狗自愈，伤害仍结算）
  - 未动 `03_core.js`/`04_collision.js`/`02_config` §9 数值

---

## 2026-07-22 · fix(mobile): 手机端技能表现缺失 + 蛇/怪放大（PerfTier 调参）

- **改动文件**：`02_config.js`（纯 PerfTier 表现/视图预设，未动 §9 平衡、core/collision）
  - `PERF.deviceSeed.mobileTier: 'LOW' → 'MED'`、`mobileShortSide: 430 → 360`：iPhone 横屏短边≈390 原被判 `POTATO`（火焰/白爆/冰填充/屏震全压），现落 `MED`（`suppressFire`/`suppressWhiteBurst`/`suppressIceFill`/`suppressShake` 全 false）→ 火焰蛇身火墙、燃烧标记、蒸汽白爆、冰池填充、屏震 默认开启；≤360 真小弱机仍 `POTATO` 兜底。
  - 手机档 `worldScale`：MED 0.80→0.92、LOW 0.78→0.88、POTATO 0.72→0.84（实体≈1.15× 放大）；桌面 HIGH 保持 0.80 不动。`worldScale` 注释为「纯视觉视图缩放，不影响碰撞/坐标/平衡」。
- **一句话**：修手机端"有伤害无表现"——根因是种子档把 iPhone 判成 POTATO 全压技能 VFX（伤害不受档位门控故照常结算）；并把手机端蛇/怪显示放大。弱机仍有 fill/FPS 看门狗自动降回 LOW/POTATO 关火，不丢保护。
- **是否动 §9**：否（PerfTier 为表现/视图预设，非伤害/血量/速度/射程；worldScale 纯视觉）。
- **波及（Bus/Formula）**：仅视觉层（11_render drawSkillAura 的 T3=`PERF.suppressFireVisual`、drawEnemies 的 T3、`05_particle.drawOverlay` 的 T1=`PERF.suppressWhiteBurst`、drawIcePools 的 T2、屏震 T4）；伤害管线 `08_skill.tickFire/tickCombos` 不变。
- **验收**：
  - 手机吃火焰技能食物 → 蛇身出现火墙/余烬；吃到带冰敌触发蒸汽 → 见白爆+爆环+屏震
  - 手机端蛇与怪物明显变大（≈1.15×），桌面端大小不变
  - 弱机若掉帧：HUD「档」应从 MED 自动降 LOW/POTATO，火焰自动关（看门狗自愈），伤害仍结算
  - 未动 `03_core.js`/`04_collision.js`/伤害公式/`02_config` §9 数值

---

## 2026-07-22 · fix(mobile): 修主屏模式点全屏误提示「加到主屏」

- **改动文件**：`14_main.js`（`toggleFullscreen` 新增 `isStandalone()` 检测：`navigator.standalone === true`（iOS 主屏 PWA）或 `matchMedia('(display-mode: standalone)').matches`；主屏模式点「⛶ 全屏」不再弹「请把本页添加到主屏幕」误导提示，改为「已在全屏（主屏模式）」；Safari 浏览器内仍提示加主屏）
- **一句话**：修 iPhone 主屏 PWA 下点全屏仍误弹「加到主屏」的提示（本就已无网址栏全屏）；按用户选择**不做** CSS 旋转强制横屏，横屏仍需手动旋转手机 / 解锁旋转锁（iOS 不支持 Fullscreen API 与 `screen.orientation.lock`，无法像视频播放器那样编程自动横屏全屏）。
- **是否动 §9**：否（纯全屏按钮提示逻辑，无平衡数值）
- **验收**：
  - iPhone 加主屏后打开 → 点「⛶ 全屏」：提示「已在全屏（主屏模式）」，不再误导「加到主屏」
  - iPhone Safari 浏览器内打开 → 点「⛶ 全屏」：仍提示「加到主屏」（正确）
  - 横屏玩法不变：需手动转横屏 / 解锁旋转锁；未动 core/collision/§9/`02_config`

---

## 2026-07-22 · fix(mobile): 修选技能崩溃(_rotateHandler) + 蛇头双球视觉

- **改动文件**：`12_ui.js`（模块作用域新增 `var _rotateHandler = null`；原仅在 `showRotateChoice` 内赋值、未声明，非竖屏选技能路径不经过该赋值，`hideChoose→hideRotateChoice` 读未声明变量在严格模式下抛 `ReferenceError: Can't find variable: _rotateHandler`，导致手机选技能后整段 UI 报错）、`11_render.js`（`drawSnake` body 循环由 `i >= 0` 改为 `i >= 1`，跳过 `segments[0]` 头节；该节已在 `06_snake.js` 注释「含头节(index 0)」且由头圆 `headRadius`(14) 单独绘制，原循环又用 `bodyRadius`(12) 画一次，因 `segmentSpacing`(24) < 14+12 紧贴头圆后方重叠成「两球」，1 血时头变红尤其明显）
- **一句话**：修两处移动端异常——①手机横屏吃技能食物→选技能不再崩溃（补 `_rotateHandler` 声明）；②蛇头恢复单一干净圆形，头后不再有重叠小球（1 血仅头变红、身后无第二球）。
- **是否动 §9**：否（纯变量声明 + 渲染循环边界，无平衡数值；`headRadius`/`bodyRadius`/`segmentSpacing` 均保持原值，仅跳过重复绘制）
- **验收**：
  - 手机/iOS 横屏：吃技能食物→选卡→选技能，无红框、技能正常获得、选卡 UI 关闭
  - 竖屏（iOS 主屏）吃技能：仍弹「请横屏」遮罩且「仍用竖屏继续」可关闭；横屏后正常选卡不崩
  - 桌面：Ctrl+Z 撤销、~ GM 等不受影响；蛇头为单圆、1 血时仅头变红
  - 未动 `03_core.js`/`04_collision.js`/伤害管线；`02_config` 未改

---

## 2026-07-21 · fix(mobile): 修启动红错误报 + 竖屏选卡卡死 + 移动端 GM 按钮

- **改动文件**：`index.html`（全局错误兜底：忽略跨域脱敏 `'Script error.'` 与资源加载失败 `e.target` 非 window 的情况，不再误弹红框；真实同域错误仍显示并附 `e.error.stack`）、`12_ui.js`（`isPortrait()` 改视口宽高比 `innerHeight > innerWidth` 判定，iOS standalone/横竖屏滞后更可靠；`showRotateChoice` 同时监听 `orientationchange`+`resize` 并加「仍用竖屏继续」兜底按钮，解决竖屏选卡卡死；`init` 内仅触屏设备显示「⚙ GM」按钮，经 `Bus('editor:toggle')` 开面板）、`13_editor.js`（监听 `Bus('editor:toggle')` 支持移动端按钮开 GM；面板 `z-index` 40→60 置于 `#ui-full`(50) 之上；头部加可点击 `×` 关闭，移动端无 `~` 键也能关）
- **一句话**：修三处移动端问题——①桌面/iPhone 误显 `[启动错误] Script error.` 红框（实为浏览器扩展/跨域脱敏噪声，非本游戏错误）已抑制；②竖屏升级/事件选择从「卡死」改为可靠检测横屏+「竖屏继续」兜底；③移动端点「⚙ GM」即可开/关 GM 测试面板（替代桌面 `~` 键）。
- **是否动 §9**：否（纯 UI/错误处理，无平衡数值）
- **验收**：
  - 桌面 Chrome / iPhone：不再误显 `[启动错误] Script error.`；若确有真实 JS 报错，仍会红框显示并带 stack（可开控制台看细节）
  - iPhone 竖屏触发升级/事件：弹「请横屏」遮罩；旋转到横屏自动显示选项；或点「仍用竖屏继续」直接选（不卡死）
  - 移动端点「⚙ GM」打开 GM 面板，点面板右上 `×` 关闭；桌面仍用 `~` 键
  - 未动 `03_core.js`/`04_collision.js`/伤害管线；`02_config` 未改

---

## 2026-07-21 · feat(mobile): 全屏(PWA+按钮)+角落HUD贴框+竖屏选卡强制横屏

- **改动文件**：`index.html`（`<head>` 加 PWA meta：`apple-mobile-web-app-capable`/`mobile-web-app-capable`/`status-bar-style` + `<link rel="manifest">`；DOM 重构：`#stage` 包 canvas、`#ui-stage`（贴 canvas 角标层）、`#ui-full`（全屏遮罩层））、`manifest.webmanifest`（**新增** PWA 清单：`display:standalone`、`orientation:landscape`）、`11_render.js`（`resize()` 末尾同步 `#stage` 的 CSS 宽高 = canvas 显示尺寸，使角标层精确贴合游戏框）、`12_ui.js`（`init` 改双 root：角落 HUD `hud/pauseBtn/choiceBox/comboBanner/fullscreenBtn` → `#ui-stage`，遮罩 `choose/result/pauseOverlay/rotateChoice` → `#ui-full`；HUD/连击横幅 `white-space:nowrap` 防竖屏折行；新增「⛶全屏」按钮经 `Bus('ui:fullscreen_toggle')` 触发；升级三选一与事件选择在竖屏时盖「请横屏」遮罩，监听 `orientationchange` 转横屏后自动显示）、`14_main.js`（`Bus.on('ui:fullscreen_toggle')` → 安卓/桌面 `requestFullscreen`；iPhone 检测不支持则 `showFsToast` 提示「添加到主屏幕」）
- **一句话**：手机端全屏两手做——安卓/桌面「⛶全屏」按钮一键全屏 + iPhone 经 PWA「添加到主屏幕」真全屏无网址栏；角落 HUD（暂停/全屏/连击）贴游戏框不再掉黑边；升级三选一与事件选择在竖屏时强制横屏选卡（常规游戏仍竖屏可玩）；桌面零回归。
- **是否动 §9**：否（纯输入/UI/PWA 表现，无平衡数值；全屏按钮文案为 UI 提示非强度值）
- **验收**：
  - 桌面 Chrome：显示/操作与上一版零差异；「⛶全屏」按钮可用进入浏览器全屏
  - iPhone 横屏：暂停/HUD 贴游戏框内（不掉黑边）；`push` 后「添加到主屏幕」再从主屏打开 → 网址栏消失、真全屏
  - iPhone 竖屏游戏：常规可玩；HUD/连击文字单行不折；触发升级/事件选择弹「请横屏」遮罩，转横屏后正常选卡
  - 安卓/桌面：点全屏按钮即进入浏览器全屏
  - 未动 `03_core.js`/`04_collision.js`/伤害管线；`02_config` 未改

---

## 2026-07-21 · feat(mobile): 手机端触控 + 小屏适配（输入 A + 竖屏 A+B）

- **改动文件**：`index.html`（viewport 加 `viewport-fit=cover` + 竖屏横屏提示层 `#rotate-hint`（不阻操作））、`14_main.js`（新增 `aimFromEvent` 统一触屏/鼠标→世界瞄准点；`pointerdown/move` 加 `preventDefault` 阻 iOS 双击缩放/滚动；`pointerup`/`pointercancel` 松手保持末向不丢输入；`orientationchange` 旋屏重算；`readInput` 触控用 `CONFIG.INPUT.touch.deadZone` 防抖）、`12_ui.js`（HUD/暂停按钮/连击横幅加 `env(safe-area-inset-*)` 安全区 + `clamp()` 响应式字号；升级三选一卡片 `width:min(220px,78vw)` 窄屏不溢出）、`02_config.js`（新增 `INPUT.touch.deadZone` 触控死区，非 §9 平衡值）
- **一句话**：手机端可玩——竖屏 contain 完整显示（已就位）+ 横屏轻提示引导；触控拖动绝对瞄准（指哪打哪）+ 松手保向 + 阻浏览器手势；HUD/升级卡窄屏自适应 + 刘海安全区；性能由封版 `PerfTier` 分级保流畅。桌面零回归。
- **是否动 §9**：否（纯输入/UI/渲染表现，无平衡数值；新增 `INPUT.touch` 为触控手感非强度值）
- **验收**：
  - 桌面 Chrome：显示/操作与封版前零差异（viewport/touch-action 已存在不变）
  - 手机竖屏（如 375×667）打开：canvas contain 完整显示不溢出；拖动蛇平滑转向；点开始/暂停可点；松手蛇按末向续行
  - 升级三选一：窄屏卡片不溢出/不重叠；HUD 不被刘海遮挡
  - 横屏：提示层隐藏，全屏游玩
  - 未动 `03_core.js`/`04_collision.js`/伤害管线；`02_config` 仅扩展 `INPUT` 区

---

## 2026-07-21 · perf(auto-tier): 自适应画质分级 + 跨端 FPS 根治（封版）

- **改动文件**：`02_config.js`（新增 `PERF.autoScale` 总开关 + `deviceSeed` 设备初判 + `tiers` 四档质量预设 + `flashCoreCap`/`fillDown*`/`fillLockSec`/`fillRecoverSec` 护栏阈值）、`14_main.js`（新增 `PerfTier` 系统：`seedTier` 设备初判 + `stepDown`/`stepUp` 实时 FPS 自动升降档 + `forceTier` GM 强制固定档 + `pointerdown`/`pointermove` 兼容触控 + `resize` 重算）、`11_render.js`（RT 回退源改读 `PerfTier` 当前档 `perfFB` + backing 宽封顶 `maxBackW` + `worldScale` 视图缩放 + `simpleVignette` POTATO 档 + 画质档位 HUD 角标）、`13_editor.js`（GM「性能分级」面板：自动开关 + 强制固定档 + 关火抑制手动 + 护栏实时读数）、`15_profiler.js`（采样加 `tier`/`auto`/瞬时 `fpsMin` + 采样后清零窗口 min）、`05_particle.js`（`flashCoreCap` 并发闪核硬上限 + `suppressFire` 驱动余烬停喷）
- **一句话**：跨端 FPS 根治——设备初判（手机 POTATO/LOW、弱集显 MED 起步，不从高档起步）+ 实时 FPS 自动升降档（HIGH/MED/LOW/POTATO 四档，掉帧秒级降档、回升防抖）+ 四档质量预设（backing 宽/粒子文字上限/视图缩放/火冰视觉抑制/白爆抑制/屏震/vignette 精度）+ fill 过载直跳 LOW / 白爆并发硬上限护栏；全部纯渲染/表现护栏，零 gameplay
- **是否动 §9**：否（纯性能/渲染护栏，无平衡数值；新增阈值集中 `02_config` `PERF` 区，~ 调参器可热改）
- **验收**：
  - 桌面强机：auto 开 → 恒 HIGH，行为与之前零回归（`worldScale` 0.8 视图缩放保留）
  - 手机/弱机：auto 开 → 设备初判 LOW/POTATO 起步；实战掉帧 < 48 持续 1.5s 自动降档，> 58 持续 3s 自动升档；档位角标 + 原因可见
  - fill 绘制调用持续越阈 → 直跳 LOW 关火墙/余烬（锁定 8s + 回升 5s 防乒乓）；白爆并发超 `flashCoreCap` 丢最旧
  - 手动档（GM `forceTier`）固定不自动；RT 覆盖仍优先（零双份真相源）
  - 未动 `03_core.js`/`04_collision.js`/伤害管线；`02_config` 仅扩展 `PERF` 区

---

## 2026-07-21 · perf(view): 视图缩放恢复 + 相机跟随修复 + profiler 可见敌数反算 worldScale

- **改动文件**：`15_profiler.js`（新增：自动性能日志，profiler 可见敌数反算 `worldScale` + 帧性能观测字段 external gap）、`11_render.js`（相机跟随修复 + `worldScale` 反算 + 视图缩放恢复）、`index.html`（挂 `15_profiler.js`）、`02_config.js`、`05_particle.js`、`08_skill.js`、`12_ui.js`、`13_editor.js`、`14_main.js`（fixed-step 主循环帧观测）、`docs/plans/*.md`（新增 6 份诊断/清理计划）
- **一句话**：恢复被 round5 误回滚的视图缩放；修正相机跟随；新增 `15_profiler.js` 自动性能日志，profiler 可见敌数反算 `worldScale`，明确区分"实体缩放(worldScale)"与"填充率(maxBackW)"（呼应 RETRO §7）
- **是否动 §9**：否（视图/观测层，无平衡数值）
- **验收**：
  - 视图缩放恢复，蛇身/敌人大小随 `worldScale` 变化且相机跟随正确不漂移
  - `15_profiler.js` 自动记录 FPS/敌数/`worldScale`，无需手动测量脚本
  - 未动 `03_core.js`/`04_collision.js`；`02_config.js` 仅挂接、不改动数值结构

---

## 2026-07-17 · perf(b9) 收口 + 玩法补充（6 提交）

- **改动文件**：`08_skill.js`（闪电内圈死区 bc01a11 + 每帧敌列快照 b6b380d + 收脚手架 270056d）、`09_wave.js`（补给危险偏向 0a5d871）、`07_enemy.js`/`11_render.js`/`12_ui.js`/`14_main.js`（测试基建 897d92b：暂停/等比缩放/指针反算/假人前置）、`11_render.js`/`02_config.js`（屏震四档映射 e5d3f7f）、`13_editor.js`/`05_particle.js`/`02_config.js`（收 b9 脚手架 270056d，dev 门控 + 删 auto-log）
- **一句话**：b9 性能专项收口——①闪电内圈死区（跳过蛇头火环半径内索敌，省无效链）；②每帧敌列快照消除重复 `allEnemies` 分配（零行为变化）；③屏震四档统一 `addTrauma`（删 `addShake`，补精英死/Boss 击败/蒸汽齐爆阈值 4）；④补给危险偏向（回血球刷敌群附近，制造贪心抉择）；⑤测试基建（暂停/缩放/指针反算/假人前置）；⑥收起 b9 诊断脚手架
- **是否动 §9**：是（屏震四档阈值、补给危险偏向相关数值已回写 §9；其余纯工程）
- **验收**：
  - 闪电不再对火环内敌人无效索敌；敌列每帧只算一次（快照），行为无变化
  - 屏震四档统一经 `addTrauma`；精英死/Boss 击败/蒸汽齐爆(≥4) 有震
  - 回血球出现在敌群附近而非安全区；dev 下可见诊断、release 无 auto-log
  - 未动 `03_core.js`/`04_collision.js` 行为；`02_config.js` 仅新增 b9 门控与少量数值

---

## 2026-07-15 · perf(b9) 三连：VFX 硬上限 + 小怪血条去 fillText + ⑥冰冻重做

- **改动文件**：`02_config.js`/`05_particle.js`（VFX 硬上限 937a87e：粒子/飘字活跃上限 + 每帧 spawn 预算 + 优先级门控覆盖所有池写入含 steamblast 直推；保死亡爆/伤害字）、`11_render.js`（小怪血条去 fillText 016d2b3：纯 rect + 仅 hp<maxHp 且视口内才画 + 数字仅 elite/Boss；HUD 拆显 粒/字 计数与上限）、`05_particle.js`/`08_skill.js`/`13_editor.js` + 数值真理源（⑥冰冻重做 5777395：CD 自动索敌冰池 + 蒸汽齐爆同帧上限 `steamBurstCapPerFrame` 仅门控视觉 Bus.emit 伤害始终结算 + 屏震分档节流 T1 + 优先级细化 + 冰调参滑块；数值回写 §9）
- **一句话**：b9 性能三连——①VFX 输出硬上限（优先级保死亡爆/伤害字，低优飘字先丢）；②小怪血条去 `fillText` 数字（纯 rect，仅 elite/Boss 显数字）；③⑥冰冻重做：trail→CD 自动索敌冰池 + 蒸汽齐爆同帧上限（只控视觉 emit，伤害恒结算）+ 屏震分档 + 冰调参滑块，数值回写 §9
- **是否动 §9**：是（VFX 硬上限数、冰 CD/索敌、蒸汽齐爆上限、屏震档位、冰调参滑块均回写 §9）
- **验收**：
  - 满屏粒子/飘字不超硬上限；死亡爆/伤害字优先保留，低优飘字超限被丢
  - 小怪血条无数字纯色条、仅受伤且在视口内画；elite/Boss 才显数字
  - ⑥ 冰冻：CD 自动索敌冰池生效；蒸汽齐爆同帧上限只控视觉、伤害不漏结算
  - 未动 `03_core.js`/`04_collision.js`；`02_config.js` 数值结构仅扩展（b9 上限 + 冰字段）

---

## 2026-07-14 · ④蒸汽状态引爆 + B-4 收尾建账 + 文档地图修正 + 真理源重命名

- **改动文件**：`07_enemy.js`/`08_skill.js`（④蒸汽状态引爆 13c2e53：火墙扫到带冰敌 `e.slowT>0` 按敌 2.0s 冷却在该敌位置引爆蒸汽 AOE；移除全局 `timer.steam`；零新数值、不碰 core/collision/config/闪电；用户浏览器实测绿）、`CHANGELOG.md`/`docs/DEBT.md`/`05_particle.js`/`07_enemy.js`/`08_skill.js`/`11_render.js`/`13_editor.js`（B-4 收尾 e72f884：VFX 区分 + DOT 分源 + 电磁/闪电演出增强 + P1/P2 修复——即 07-13 CHANGELOG 已登记的 B-4 条目，此处仅补全建账不重复）、`AGENTS.md`/`docs/workflow.md`（文档地图路径修正 01a8e1b：根《GDD/数值真理源》→ `docs/`）、`03_core.js`（version 0.3-b9→0.3-b11，991e5ac）、数值真理源镜像文件重命名（49eb69c：前缀「数值真理源」→「此生为蛇」，hash 后缀不变）
- **一句话**：④蒸汽状态引爆落地（火墙扫冰敌引爆蒸汽 AOE，实测绿）；B-4 收尾建账（与 07-13 CHANGELOG 已登记条目同源不重复）；文档地图路径修正；version bump；数值真理源文件重命名
- **是否动 §9**：④ 否（零新数值，无需 §9 回写——早期计划"待 Notion 回写触发口径"预判已证伪）；其余为文档/版本/路径，不涉及平衡数值
- **验收**：
  - ④：火墙扫过被冰缓/冻的敌人时，按敌 2.0s 冷却在该敌位置引爆蒸汽 AOE；无全局 timer
  - ④：零新数值、未碰 `03_core.js`/`04_collision.js`；用户浏览器实测已绿
  - 文档地图路径修正生效（AGENTS 指向 `docs/` 下文件）；真理源重命名后链接可达
  - `03_core.js` 仅 version 字符串变更

---

## 2026-07-13 · feat(combo-vfx): combo视觉可见性+GM单combo预览+视觉身份统一(Commit B-4)

- **改动文件**：`05_particle.js`（主：新增 `flashCores` 叠加闪核池 + `spawnFlashCore` + `drawOverlay`（绘于实体之上）；`fx:steamblast` 加实心白闪核+提亮蒸汽云+浅蓝冰晶碎屑；`fx:electroarc` 加蛇头紫辉光+节点放射紫电芒爆；`fx:burndart` 命中处加大加亮橙焰爆点；`SRC_STYLE` 修正：基础闪电 `lightning` 色板由紫 #c9a8ff 改蓝白 #9fd0ff（对齐 `fx:lightning` 电链色 LIGHTNING_COLOR），新增 `electro` 紫 #c9a8ff 独立来源标识（B-4 验收①a））、`11_render.js`（draw 实体绘制后调 `Particle.drawOverlay` 叠加闪核层）、`13_editor.js`（新增「单 Combo 视觉预览」分区：每 combo 一按钮，`previewCombo` 直接 `Bus.emit` 对应 fx: 事件+蛇头附近 `spawnDummy` 供链/镖瞄准，完全绕过 gameplay/冷却/敌人条件；`spawnDummiesNearHead` 排布 dummy）、`08_skill.js`（次：三 combo VFX 事件改名发射方联动——`fx:bolt→fx:burndart` / `fx:lightning→fx:electroarc` / `fx:blast→fx:steamblast`；`doLightningChain` 新增 `vfxEvent`/`srcTag` 形参，电磁连锁伤害走独立 `src='electro'` 来源标识，纯表现零 gameplay）、`03_core.js`（version 0.3-b10→0.3-b11）
- **备注（B-4 验收①自查补完）**：①a 原电磁连锁写死 `src='lightning'`、与基础闪电压色冲突；已补独立 `src='electro'` + `SRC_STYLE.electro` 紫飘字（`05_particle.js`/`08_skill.js`），基础闪电色板同步改蓝白对齐 VFX；①b 灼烧点火演出 VFX 本已具备（橙焰爆点 `fx:burndart` + 敌身红橙火环 `drawBurnMark`）；**但像素级质检发现**引燃飘字 `🔥DOT ` 橙前缀实际未出现——`07_enemy.js:242` 燃烧 DOT 调 `applyDamage(e, e.burnDps*dt, false, true)` **漏传第5参 `src`**，致 `dotSrc` 不写、`SRC_STYLE.burn` 成死配置，引燃只飘 `-N`；已补 `src='burn'` 透传（`07_enemy.js`，纯标签零 gameplay），现引燃正常带「🔥灼烧 -N」橙飘字；①c 三 combo 颜色/图标/飘字各异——**二次补完**：实测发现灼烧 combo 的 bolt 伤害写死 `src='bolt'`（飘 `飞镖 `）从未带"灼烧"名、且电磁 combo 名仅挂在连锁上（bolt 本身飘 `飞镖 `，易误认）；现 `tickBolt` 按激活 combo 改写 bolt 命中 `src`（`burningBarrage→'burning'` 橙 / 纯 `electroTurret→'electro'` 紫 / 无 combo→`'bolt'` 青），`SRC_STYLE.burning` 橙标新增，连锁仍独立 `electro`，三 combo 伤害飘字现均带各自名字且零 gameplay。**DOT 分源分离（B-4 衍生·用户实测要求）**：`07_enemy.js` DOT 累加器由单值 `dotAccum/dotSrc` 改为按来源字典 `dotMap[src]`，火墙与灼烧引燃各自独立数字+独立标签（`SRC_STYLE.fire`→`🔥火墙 ` 橙 `#ff9a3c` / `SRC_STYLE.burn`→`🔥灼烧 ` 红橙 `#ff5a2c`），不再混为同一数字；死亡时各来源残留 DOT 分别 flush、对象池复用 `dotMap={}` 防串味；零 gameplay（未动伤害/公式/判定）。**电磁/闪电演出区分增强（B-4 ①·用户实测未过项·并入 B-4 不单开）**：用户实测"⚡电磁 vs 基础闪电只差颜色、且都太快留不住眼"→ 未过 ①"一眼区分"。现改 `fx:electroarc` 拉开**三维度**：①粗弧（电链 `ELECTRO_W_PX=5` vs 基础 `LIGHTNING_W_PX=2`）；②节点多分叉放射紫电芒（`ELECTRO_BRANCH_N=8`，基础无分叉）；③命中点紫色残留辉光 `spawnFlashCore` `ELECTRO_BRANCH_LIFE=0.2s` afterglow + 电链存活更久 `ELECTRO_LIFE=0.34s`（基础无残留、仅 0.22s）。基础闪电 `fx:lightning` **零改动**（保持细/快/蓝白/单链/无残留，靠简洁对比）。新增常量 `ELECTRO_W_PX/ELECTRO_LIFE/ELECTRO_JAG/ELECTRO_BRANCH_N/ELECTRO_BRANCH_LIFE/ELECTRO_GLOW_R` 集中管理（`05_particle.js` 顶部 TODO 块，不动 §9、纯表现）。零 gameplay（不碰伤害/连锁/射程/冷却/触发判定；不动灼烧/蒸汽）；事件名仍全小写过 Bus 断言。**P1/P2 修复（用户实测反馈·并入 B-4 不单开）**：实测暴露两个关联问题——①用户实测"电磁 combo 下飞镖伤害全显示成⚡电磁、飞镖标签消失"：根因 P1 曾写 `electroTurret→'electro'` 把每次飞镖命中伤害误贴「电磁」掩盖真连锁；已删该分支，飞镖命中归位 `src='bolt'` 青「飞镖」（`burningBarrage→'burning'` 橙保留），电磁标签只留给连锁 `doLightningChain(src='electro')`，两笔各显其名。②用户实测"电磁很久不触发、只触发过几次"：根因 `timer.electro -= dt` 写在 `tickBolt` 的 `return` **之后**，仅在 bolt 开火帧推进一个 dt（~0.016s），`cooldownSec=0.5s` 实际需约 15s 才凑满——属 combo 契约修正遗留 bug（非本次 VFX 引入）；已按方案 A 将 `timer.electro -= dt` 移至 `return` **前**（每帧推进），恢复真源 §4.6 冻结的 `cooldownSec=0.5s` 真正生效，**不改 `cooldownSec` 值本身、不回写真源（bug 修复非数值改动）**；粗弧"一闪而过"主因即触发太少，触发正常后已看得清。电磁 DPS 是否过强本轮只记手感、不调数值（留 ③，若偏强下轮按 §七 回写 `cooldownSec`/`damageMul`）。
- **一句话**：B-4 解决 B-3 三 combo 视觉"看不见/无法独立预览"——①GM 单 combo 预览按钮（脱离实战，直接发 fx 事件+就近造假人）让用户随时单独看每个 combo VFX；②三 combo VFX 加粗加区分：蒸汽=白闪核+蒸汽云+冰晶碎屑、电磁=紫电链+节点放射电芒+蛇头紫辉光、灼烧=橙燃烧镖+大橙焰爆点；③闪核绘于实体之上不被盖；④视觉身份对齐（飞镖白黄/闪电蓝白/火橙/冰蓝/护盾白金/蒸汽白+暖橙/电磁紫/灼烧橙红，combo 比母技能更大更亮更炸、颜色不撞、命中标记贴怪身）；⑤burn 区分走方案 A（飘字不动，靠敌身橙色灼烧环 drawBurnMark 作唯一标识）
- **是否动 §9**：否（纯表现层零 gameplay 改动：未动伤害/冷却/连锁/半径/coreHp/射速/触发判定；新颜色为 inline 字面量，与文件顶部 TODO 块风格一致，登 DEBT §2）
- **验收**：
  - [ ] GM「单 Combo 视觉预览」三按钮：分别只看到 蒸汽白爆云 / 紫电链+节点电芒+蛇头紫辉光 / 橙燃烧镖+敌身火环，**无需敌人、无需 playing 态**
  - [ ] 实战：steam 爆明显（白闪核+冰晶）；electro 命中冒紫电链+节点电芒；burn 镖橙+敌身橙色灼烧环（drawBurnMark）
  - [ ] 三者与基础 bolt(白黄)/lightning(蓝白 #9fd0ff) 一眼区分；电磁紫 #c9a8ff ≠ 基础闪电蓝白 #9fd0ff
  - [ ] 未改任何数值：伤害/冷却/连锁/effect/半径/coreHp/射速/触发判定全不变；`02_config.js` 数值结构未动
  - [ ] 重开无 NaN；新事件名全小写（重申 Bus 断言 `/^[a-z0-9]+:[a-z0-9_]+$/`）；粒子全走对象池无运行时 new；60fps 不掉（闪核池 32、beams 复用）
  - [ ] 反向：基础闪电链仍是蓝白、未变紫；steam 半径/伤害/冷却不动；burn DOT 飘字色不变（方案 A，仅靠敌身火环标识）

---

## 2026-07-13 · feat(skill-geo): 冰冻真轨迹化+护盾贴头点防+冰冻减速反馈(Commit B-2)

- **改动文件**：`02_config.js`（fire.radius `[60,75,90,108,128]`、ice.trailWidth `[30,40,48,60,75]`、新增 shield.orbitRadius `[44,58,72,86,100]`/orbitSec `1.6`、fire/ice.segStep `1`、ice.lingerSec `[2.0,2.5,3.0,3.5,4.0]`、ice.slowLingerSec `0.4`）、`08_skill.js`（tickFire/tickIce/tickShield 沿蛇身逐节判定、读 config、同帧去重；删写死 SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS；tickIce 真轨迹化冰区沿蛇身落点铺霜冻带（视觉=判定）、L5 冻结用 `lv5FreezeSec`；新增 `fx:iceslow` 事件做减速飘字反馈；暴露 `debugSetSkill(id,lv)`/`debugActivateCombo`/`debugMaxAll`；RT() 实时桥接 tickFire/tickIce/tickShield + `drawSkillAura` 经 `RTA` 读覆盖层）、`05_particle.js`（`Bus.on('fx:iceslow')` 减速飘字）、`07_enemy.js`（spawnDummy 训练假人 isDummy/baseSpeed=0/die() 回满血不秒/countMobs 排除；applyDamage 透传 src/isDot）、`11_render.js`（drawSkillAura 沿蛇身绘制火墙/霜冻带+护盾读 config 公转；新增 GM「显示碰撞盒」`drawDebugHitboxes`）、`09_wave.js`（GS.tuningSandbox 守卫 Pickup.update 与 enemy:die 掉落，沙盒停刷）、`13_editor.js`（GM 面板系统梳理：实时标定滑条/标定沙盒/单技能精确激活/生成假人；冰系手感收口「实时标定（手感沙盒）」、去重入口、滑条回显修复）、`03_core.js`（version 0.3-b8→0.3-b9）、数值真理源 §4.1/§4.2/§4.4/§9、docs/DEBT.md
- **一句话**：B-2 整体提交——①冰冻真轨迹化：冰区沿整条蛇身落点铺霜冻带（视觉=判定，蛇尾经过处也有冰）；②护盾贴头点防：护盾环绕半径 `orbitRadius`(44→100) 刚好头外侧点防，不压火墙/不扩全身；③冰冻减速反馈：敌人入冰区发 `fx:iceslow` 飘「减速」字+蓝染减速环（L1–4 短窗 `slowLingerSec` 离场约 0.4s 恢复，L5 冻结约 1s）；④GM 实时标定滑条/沙盒/训练假人（`rtTuning` 运行时即时生效免重载）+ 单技能精确激活 `debugSetSkill` / 生成假人 `spawnDummy` 恢复；⑤回归修复：`fx:iceSlow` 大写被 `Bus` 断言拒收致 `05_particle` 加载崩溃（全特效/伤害数字消失）→ 收发统一全小写 `fx:iceslow`
- **是否动 §9**：是（fire.radius/ice.trailWidth 放大 + 新增 shield.orbitRadius/orbitSec/fire·ice.segStep/ice.lingerSec/ice.slowLingerSec，均已回写 §4.1/§4.2/§4.4 与 §9 Changelog）
- **验收**：
  - [ ] 持冰技能→整条蛇身留霜冻真轨迹，蛇尾经过处也有冰带（非仅蛇头）
  - [ ] 护盾球绕蛇头公转，半径随等级变大（Lv1~44px→Lv5~100px），落点恰头外侧点防，不压火墙/不扩全身
  - [ ] 敌人入冰区→飘「减速」字（`fx:iceslow` 触发）+ 蓝染减速环；离开约 0.4s 恢复；Lv5 冻结约 1s（僵直+冰晶）
  - [ ] GM 实时标定：拖 fire.radius L3 火墙即时胀缩、拖 ice.trailWidth 霜带即时变宽、拖 减速跟随窗s 减速残留时长即时变；显示「当前/默认」；「复位本组默认」弹回
  - [ ] 标定沙盒：开→停刷食物/技能球；「单技能精确激活」选 ice→其余清空只冰生效
  - [ ] 生成假人(1/5000)→黄色假人站着挨打：DOT 逐跳飘字、减速环、护盾扫敌可见，假人掉血不消失（die 回满）；蛇头蹭假人不掉心
  - [ ] 「显示碰撞盒」(GM)→绿圈=敌半径、红圈=蛇身/蛇头半径实时可见
  - [ ] 未碰：伤害公式 `Core.Formula.damage` / `04_collision.js` / `02_config.js` 数值结构（`SHIELD_ORBIT_SEC/SHIELD_ORB_RADIUS` 本地常量已删，渲染侧双份真相源已消）
  - [ ] 🟡 fire/ice 初值×1.5、ice.lingerSec/slowLingerSec/orbitRadius 等初值，待浏览器实测手感回填 §9（已登 DEBT §1）
  - [ ] 回归验证：`fx:iceSlow`→`fx:iceslow` 后 05_particle 正常注册、所有技能特效/伤害数字恢复；Node 沙盒加载全模块确认 particle 注册、`fx:iceslow` 进入触发一次飘字正常

---



## 2026-07-12 · feat(skill-geo): 技能沿蛇身视觉对齐 + 伤害来源标签(Commit B-1)

- **改动文件**：`08_skill.js`（`hurt`/`hurtCombo` 加 `src` 形参并在 fire/bolt/lightning/shield/steam 调用点透传）、`07_enemy.js`（`applyDamage` 加 `src` 形参 + 三处 `enemy:hit` emit 带 `src`，燃烧 tick 标 `'burn'`）、`05_particle.js`（新增 `SRC_STYLE` 来源标签映射，`enemy:hit` 飘字按 `src` 加前缀+专属色）、本文件、`docs/DEBT.md`（§2 登 `SRC_STYLE` 表现债）
- **一句话**：伤害飘字标注来源+数值——`飞镖 -25`(青)/`闪电 -18`(紫)/`🔥DOT -4`(橙持续)/`🛡护盾 -14`(白金)/`💥蒸汽 -30`(暖橙)，一眼分清谁打了多少；冰无直伤不飘。纯表现层，只读现有伤害值与来源，不碰伤害计算
- **是否动 §9**：否（仅新增 `src` 透传形参与飘字前缀/色，`SRC_STYLE` 色板为表现债登记 DEBT §2；伤害数值、公式、命中判定均未变）
- **验收**：
  - [ ] bolt 命中飘 `飞镖 -N`（青）；lightning 链飘 `闪电 -N`（紫）
  - [ ] 火环/灼烧 DOT 飘 `🔥DOT -N`（橙，持续小字）；护盾接触飘 `🛡护盾 -N`（白金，DOT）
  - [ ] steam 爆炸飘 `💥蒸汽 -N`（暖橙）；暴击时金色优先、仍带来源前缀
  - [ ] 冰无直伤不飘伤害字（仅减速表现）
  - [ ] 伤害数值与改动前一致（未碰计算）；重开无残留/NaN
  - [ ] 未触碰：`02_config.js`/`04_collision.js`/`03_core.js`/`10_audio.js`

---

## 2026-07-11 · feat(skill-vfx): 技能视觉辨识+可读性大修(Commit A)

- **改动文件**：`07_enemy.js`（次：`DOT_TEXT_MIN` 10→4 + `enemy:hit` 透传 `isDot`）、`05_particle.js`（主：飞镖改飞行镖视觉 + DOT/即时飘字分色）、`11_render.js`（主：技能食物辉光/敌人燃烧·减速标记/无敌帧闪烁/受击红闪 vignette/火·冰·护盾光环增强/受击强震复用 `SHK.death`）、`12_ui.js`（次：combo 横幅 + 常驻配方提示 + 心碎闪烁）、`03_core.js`（仅 `version` 0.3-b6→0.3-b7，纯元数据）、`docs/DEBT.md`（§1 DOT_TEXT_MIN 值 + §2 新增表现债）、本文件
- **一句话**：五技能一眼可辨（飞镖=飞行镖 / 闪电=瞬时电弧 / 火=跳动火环 / 冰=霜冻 / 护盾=白金球+拖影）、DOT 持续小橙红飘字 + 敌人燃烧/减速可见、combo 横幅+配方提示、技能食物发光星标区分、受击红闪+心碎+无敌闪烁——纯表现层大修；沿蛇身几何/范围扩圈留给 Commit B
- **是否动 §9**：否（所有新值均为表现债，顶部 `🟡 TODO + 2候选`，登记 DEBT §2；`DOT_TEXT_MIN` 仅影响飘字聚合、不进伤害/命中判定）
- **§6 功能审计结论**：火焰 DOT（每帧 tick 掉血）、冰冻（真改 `slowT/slowPct` 移动）、护盾（轨道球接触 `hurt(isDot)`）三处逻辑**均存活**；本次只补视觉，零逻辑修复
- **验收**：
  - [ ] 五技能一眼可辨：飞镖=沿弹道飞行的发光镖+拖尾（伤害仍即时，玩法不变）；闪电=瞬时蓝白折线电弧连线、无飞行体；火=跳动橙红火环+火舌；冰=蓝白霜冻地带+霜点；护盾=白金发光球绕蛇转+拖影
  - [ ] DOT 有持续小橙红飘字（`DOT_TEXT_MIN`=4 更频繁）+ 敌人燃烧（红脉动环+火苗）/ 减速（蓝染环+冰晶）可见
  - [ ] combo 触发有横幅(~0.8s)+音效（audio 已挂）+ HUD 常驻配方提示（如「弹射 + 闪电 → 电磁炮台（已激活）」）；凑 combo 不再靠猜
  - [ ] 技能食物（发光呼吸+星标+头顶「!」）vs 普通食物（素色无光）一眼区分
  - [ ] 受击有全屏红闪 vignette + 心数💥碎裂 + 无敌帧蛇头闪烁（约 1s 可感）；强震复用 `SHK.death`，未新增魔法数字，3 心游戏不过猛
  - [ ] **⑥ 回验（关键）**：DOT（火环/护盾/灼烧）命中敌人**不闪白、不击退、不硬直**（仅掉血飘字）；bolt/lightning 即时命中**仍闪白+击退**——与 §9 combo 契约一致
  - [ ] 未触碰：`02_config.js`（gameplay 值）、`04_collision.js`、`08_skill.js`、`10_audio.js`；`03_core.js` 仅 version 字符串变更

---

## 2026-07-11 · fix(wave): 段③割草期补精英对齐真理源

- **改动文件**：`02_config.js`（仅 `STAGE.segments[2].pool` 加 `'elite'`）、`docs/《数值真理源》`（§9 段③补精英行）、`docs/DEBT.md`（§1 STAGE.pool 行）、本文件
- **一句话**：段③割草期（180–360s）敌群 pool 由 `['chaser','wanderer','charger']` 加 `'elite'`，对齐真理源 §6 段③「全类型+精英」
- **是否动 §9**：是（§9 2026-07-11「段③补精英」）
- **验收**：
  - [ ] 进入段③（游戏 180s 后）刷怪池出现 elite（紫大胖怪，HP 200）
  - [ ] 段④/段⑤ pool 不受影响（仍含 elite，符合预期）
  - [ ] `git diff --stat` 仅含上述 4 文件；`03_core.js` / `04_collision.js` / `08_skill.js` / `07_enemy.js` 无改动

---

## 2026-07-11 · fix(combo): 契约对齐-不叠effect+electro命中触发+DOT不刷硬直

- **改动文件**：`03_core.js`（新增 `Formula.comboDamage`）、`08_skill.js`（hurtCombo/doLightningChain/tickBolt/tickCombos 改造）、`02_config.js`（仅加 `COMBO.electroTurret.cooldownSec=0.5`）、`docs/《数值真理源》`（§4.6 steam 行 + §2.2 示例 + §9 契约修正行）、`docs/DEBT.md`（§1 COMBO_ELECTRO 行）、本文件
- **一句话**：三 Combo 统一「不叠 effect、保留暴击」口径（comboDamage）；steamExplosion 基础伤害 = 火焰当前等级 DOT/s ×2.5（冰只控不伤）；electroTurret 由周期触发改为「弹射子弹命中触发 + 全局冷却 0.5s」（连锁3、伤害×1.5、不叠 effect）；DOT 不刷硬直/闪白（07_enemy.applyDamage 早已 !isDot 门控，本 commit 仅核验、不改）
- **是否动 §9**：是（§4.6/§9 2026-07-11「Combo 契约修正」）
- **验收**：
  - [ ] 不叠 effect：fire+ice 时 steam 爆伤对长蛇不再随节数放大（同暴击下伤害与蛇长无关），暴击仍 ×1.8
  - [ ] steam 口径：火 Lv5（DOT 24/s）爆伤基础 = 24×2.5=60/跳；冰仅减速/冻结，无额外直伤
  - [ ] electro 命中触发：bolt+lightning 时连锁闪电只在弹射子弹命中敌人时出现（非每 2s 周期），连锁3跳、伤害×1.5、不叠 effect；高频弹幕下两次连锁间隔 ≥0.5s（核 `timer.electro`）
  - [ ] DOT 不刷硬直（须实跑）：火环/护盾/灼烧 DOT 命中敌人时**不闪白、不击退、不硬直**（仅掉血飘字），而 bolt/lightning 即时命中仍正常闪白击退；若仍刷白/击退，说明 applyDamage 未做 !isDot 门控，须补回本 commit
  - [ ] 未触碰：`git diff --stat` 仅含上述文件；`04_collision.js` / `07_enemy.js` / `02_config.js`（除 cooldownSec 外）无改动

---

## 2026-07-11 · 地基落地：Git + 文档体系 + 清理 .bak

- **改动文件**：新增 `docs/DEBT.md`、`docs/workflow.md`、`docs/plans/`、`docs/.gitignore`；更新 `CHANGELOG.md`（版本回滚改 Git）、`AGENTS.md`（文档地图）；删除 4 个 `*.bak-20250710.js`
- **一句话**：建立"长期记忆"地基——Git 版本管理 + 文档台账（债/流程），并清理冗余手动备份
- **是否动 §9**：否（纯工程/文档，无 gameplay 数值）
- **验收**：
  - [ ] `git log --oneline` 可见 baseline + 清理 .bak 两次提交
  - [ ] `docs/DEBT.md` 列出真实 TODO/🟡 占位（§9/表现/设计/工程四类债）
  - [ ] `docs/workflow.md` 含多窗口/调参沙盘/回滚/上云四节
  - [ ] 回滚测试通过：故意改→commit→`git revert`→历史完整
  - [ ] `03_core.js` / `04_collision.js` / `02_config.js` 未被改动
  - [ ] 4 个 `.bak` 已从工作区删除，内容保留在 baseline commit 可恢复

---

## 2025-07-10 · 需求 A：鼠标绝对瞄准

- **改动文件**：`14_main.js`（唯一）
- **一句话**：鼠标输入从「相对摇杆」改为「绝对瞄准」——光标换算世界坐标 + `CONFIG.PLAYER.deadZoneRadius=12` 死区 + 免按住 `pointermove` 常驻更新；键盘 WASD 不变
- **是否动 §9**：否（纯输入/工程，无平衡数值）
- **验收**：
  - [ ] 光标绕蛇头转一圈，蛇平滑 360° 无反向
  - [ ] 光标快速划过蛇头，不 180° 抽搐
  - [ ] 蛇贴世界边界时瞄准仍准确（camera 反算验证）
  - [ ] 不按住鼠标也能持续转向；键盘 WASD 仍可用
  - [ ] `03_core.js` / `04_collision.js` / `02_config.js` 未被触碰

---

## 2025-07-10 · editor 解锁 Combo 测试按钮

- **改动文件**：`13_editor.js`（唯一）
- **一句话**：调参面板（~ 键）新增「🔓 解锁全部 Combo（测试）」按钮，一键点亮 fire/ice/bolt/lightning + 触发 combo 检测
- **是否动 §9**：否（调试工具，无 gameplay 影响）
- **验收**：✅ Console 命令已通过；按钮见 editor 界面

---

## 2026-07-11 · 需求 B：技能视效可见化

- **改动文件**：`05_particle.js`（主）、`08_skill.js`（次，仅 steamExplosion 补 `fx:blast`）、`docs/DEBT.md`（§2 表现债更新）
- **一句话**：技能本体从「稀疏小点」升级为可见光束/电链/爆环——`fx:bolt` 白黄发光直线弹道、`fx:lightning` 蓝白折线电链、`fx:blast` 暖橙扩张爆环；外发光用廉价双描边（避免 `shadowBlur` 拖帧）；新图元画在 `Particle.drawWorld`（核心实体之下），零改 `11_render.js`
- **是否动 §9**：否（颜色/线宽/存活/抖动/爆点数均为表现债，顶部 `🟡 TODO + 2候选`，登记 DEBT §2；`CO.steamExplosion.radius` 直接复用，未动数值结构）
- **注**：本 commit 因会话前已 `git add` 暂存状态，附带含 2 个 GDD 文档重命名（纯文档改名、无害），非需求B 代码改动，不另拆 commit（依 AGENTS §八 计划外不动）
- **验收**：
  - [ ] 取得 bolt 后发射瞬间可见一条白黄发光直线弹道（非单点）
  - [ ] 取得 lightning（及其 combo electroTurret）后，可见沿敌人节点的蓝白连贯电链
  - [ ] 取得 fire+ice combo 后，蛇头周期（约 2s）出现可见暖橙扩张爆环（爆心对准真实 AOE 中心）
  - [ ] 火环/护盾球/冰痕 auras 仍在且未被新视效盖住（核心实体始终画在 beam/blast 之上）
  - [ ] 技能齐发时左上角 FPS HUD 保持绿档（≥55），且长时间游玩无 beam/blast 对象泄漏（走池回收）
  - [ ] 反向：`core:run_reset`（重开/菜单）后 beams/blasts 被 `clear()`，不残留、无 NaN

---

## 2025-07-10 · P1-② electroTurret + burningBarrage（追溯登记）

- **改动文件**：`07_enemy.js`、`08_skill.js`
- **一句话**：Combo 系统——燃烧弹幕（fire+bolt 飞镖点燃）+ 电磁炮台（bolt+lightning 链式电击）落地点灯
- **是否动 §9**：否（Combo 系统走真理源已登记字段 `CONFIG.COMBO.burningBarrage.*`、`CONFIG.COMBO.electroTurret.*`）
- **验收**：✅ Console 测试命令通过（`Registry.get('skill').pick('ice')` 触发 checkCombos 点亮 electroTurret + burningBarrage）

---

## 版本回滚（Git，本地优先）

- 本仓库已 `git init`，每次落地一个 commit，可精确回滚任意版本。
- 看历史：`git log --oneline`
- 撤单文件：`git checkout <hash> -- snake55/xx.js`
- 整体回退（保历史）：`git revert <hash>`
- 旧的 `.bak-YYYYMMDD.js` 手动备份机制已废弃并清理（2026-07-11）；Git 历史取代之。
- 推送到 Git 网站见 docs/workflow.md §4（需你建仓库 + 提供凭据）。
