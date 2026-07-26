# 需求 AUDIO · 程序化 BGM 系统 v3（音符级曲谱照谱实现）

> 对齐《此生为蛇》音频设计规范 v0.1。本单已含音符级曲谱，CB 零创作，只做"照谱转 Web Audio 代码"。
> 纪律：仅改 `10_audio.js` + `02_config.js`；不新增 `<script>` / 不 import-export（守 AGENTS §2）；现有 12 事件音效一行不动（仅叠加订阅）；§9 真源不碰；独立 commit，不与他并批。

## ① 目标一句话
补程序化 BGM（Web Audio 纯合成、零外部文件），暗色科技极简、A 自然小调；随战况自适应切换 探索/战斗/Boss 三层，crossfade 无缝不爆音；音量垫在 SFX 之下，关键事件自动 ducking。

## ② 涉及文件及理由
| 文件 | 改动 | 理由 |
|------|------|------|
| `snake55/10_audio.js` | 唯一实现 | 新增独立 `bgmGain` 子节点 + lookahead 音符调度器 + 三情绪层 + crossfade + ducking + 暂停/死亡响应。复用现有 `ctx/master/unlock()/setMuted()`，现有 12 个事件音效的 `Bus.on` 一行不动（BGM 用**追加**订阅）。 |
| `snake55/02_config.js` | 仅 AUDIO 段 | `AUDIO.bgmVolume = 0.4` **已存在**（确认 `02_config.js:371`），沿用即可，无需新增；曲谱 BPM/音符/波形/时长全为 🟡 表现层，不进 §9。 |

**不新增 emit 埋点**：BGM 仅订阅已在 `emit` 的 `wave:stage` / `wave:boss_warn` / `snake:dead` / `snake:hurt` / `enemy:phase` / `skill:gained` → `03_core/04_collision/06_snake/12_ui/14_main` diff 必须为空。

## ③ 具体改动点（10_audio.js 内聚）

### 3.1 节点图（复用 master，不新建链路末端）
```
oscillators ─┐
(tone/noise) ─┴─> master(0.56) ─> destination          // 既有 SFX 链，零改
BGM: layerGain(explore/battle/boss) ─> bgmGain(0.40) ─> master
```
- `bgmGain` 在 `ensure()` 内创建：`bgmGain = ctx.createGain(); bgmGain.gain.value = AUDIO.bgmVolume; bgmGain.connect(master)`。
- 三情绪层各一个持久 `layerGain` 节点（explore/battle/boss），均 `connect(bgmGain)`；层内乐器（PAD/BASS/ARP/PERC）发声时连到对应层 gain。层增益默认 explore=1、battle=0、boss=0。

### 3.2 lookahead 调度器（不进主循环、零每帧分配）
- 标准 Web Audio 调度范式（A Tale of Two Clocks）：`setInterval(_sched, 25)` 轮询，`scheduleAheadTime ≈ 0.12s`。
- 状态：`absStep`（全局步计数，仅增）、`nextNoteTime`。`stepDur` 由当前顶层情绪决定并**平滑 lerp** 到目标（见 3.5），避免 tempo 硬跳。
- 每步：`bar = Math.floor((absStep % 64) / 16)`（0=Am,1=F,2=C,3=G）；`stepInBar = absStep % 16`；按当前层与曲谱在该步触发乐器。
- 振荡器按 Web Audio 规范**每音新建**（one-shot，必须），但层 gain 节点持久复用；调度器只自己跑定时器，绝不在游戏 `step()/draw()` 里分配/触发。

### 3.3 曲谱编码（照需求单 ③，原样转常量，非裸数字散落业务）
- `FREQ` 表（Hz）：A2 110.00 · F2 87.31 · G2 98.00 · C3 130.81 · F3 174.61 · G3 196.00 · A3 220.00 · B3 246.94 · C4 261.63 · D4 293.66 · E4 329.63 · F4 349.23 · G4 392.00 · A4 440.00 · A#4 466.16 · B4 493.88 · C5 523.25 · E5 659.25。
- `PAD[bar]` = 三和弦（bar0 Am:A3,C4,E4 / bar1 F:F3,A3,C4 / bar2 C:C4,E4,G4 / bar3 G:G3,B3,D4），每小节步 0 触发、持续整小节（dur=16×stepDur），2×triangle 其一 +6cent，attack 0.4 / release 0.6，层内 gain 0.06。
- `BASS`：explore=半音符步 0&8 根音（[A2,F2,C3,G2]）；battle=八分脉冲步 0,2..14 全根音（同根音×8）；boss=整循环 A2 长音 pedal（dur=64×stepDur）+ 叠加 battle 八分根音。
- `ARP`：explore=八分步 0,2,4,6（Am:A3,C4,E4,A4 / F:F3,A3,C4,F4 / C:C4,E4,G4,C5 / G:G3,B3,D4,G4）；battle=十六分填满 16 步（按需求单逐音）；boss=同 battle + 每小节步 14/15 半音张力 stab A#4→B4。蛇之动机 A→C→E 为每条 arp 乐句起头（已含于序列）。square，gain 0.05–0.07。
- `PERC`（noise 爆破，仅 battle/boss）：battle kick 步 0/8(dur0.08,gain0.10) · hat 步 4/12(dur0.02,gain0.05)；boss kick 步 0/4/8/12（每拍）· hat offbeat 步 2/6/10/14。
- **层内密度自适应（用户裁定·stage3→4 升温）**：`battleHeat` 由 `global.GS.stageId` 取——stage2→1.0（base perc：kick0/8+hat4/12）；stage3→1.4（额外轻 hat 2/10）；stage4/boss→2.0（满 offbeat hat 2/6/10/14 + kick 加密）。不新增层，只在 battle/boss 层内按 heat 门控额外 perc 步。

### 3.4 混音与动态（规范 §3/§4）
- `bgmGain` 初值 = `AUDIO.bgmVolume(0.4)`；经 `master(0.56)` → BGM 有效 ≈0.224，明显低于 SFX 峰值 ≈0.56（已核对）。
- **Ducking**：`duck()` = `bgmGain` 在 ~0.05s 内压到 `0.4×0.5`（−6dB），`setTimeout 250ms` 后回升。订阅 `snake:dead / snake:hurt / wave:boss_warn / enemy:phase / skill:gained`。
- **暂停**：`Bus.on('game:toggle_pause', …)` 读 `global.GS.status`：`'paused'` → `bgmGain` 压到 `0.4×0.3`（30%）并平滑回升；不新增 emit。
- **死亡**：`Bus.on('snake:dead')` → `bgmGain` 0.5s 淡出 + 停调度器（`clearInterval`）；新一局若再收到 `wave:stage` 则重启调度器（幂等），覆盖重开。
- **静音**：`setMuted(true)` 设 `master.gain=0` → BGM 随 SFX 同静（满足"同时静音/暂停"）；`setMuted(false)` 恢复。BGM 调度器在 muted 下仍跑但无声，无回归。
- **autoplay**：在既有 `unlock()` 内追加 `startBgm()`（幂等启动调度器）；`12_ui.js:84` 首次 `pointerdown` 调 `unlock()`，故首次交互后才响，合规。桌面+移动同链。

### 3.5 三情绪层 + 状态机（crossfade 无缝）
- 层目标增益：`exploreGain≡1`（基底，进游戏即起）；`battleGain = layer∈{battle,boss}?1:0`；`bossGain = layer==='boss'?1:0`。
- 切换：`wave:boss_warn`→boss；`wave:stage` 按 stageId 映射：
  - stageId 1（保护期）→ **explore**
  - stageId 2/3/4（成长期/割草期/高潮期）→ **battle**
  - stageId 5（Boss期，由 boss_warn 触发）→ **boss**
- **tempo 平滑**：`targetStepDur` = 层对应 BPM（explore 88→0.170 / battle 124→0.121 / boss 136→0.110）；`stepDur` 每步向 target lerp（系数使约 0.8s 到位）。**绝不重置 `absStep`/时钟**，仅改步长 → 无缝、不重启、不双份叠播；层增益同步 ~0.8s `linearRampToValueAtTime` crossfade。禁硬切。

## ④ 不动的底层（验收须 diff 为空）
- `03_core.js` / `04_collision.js` / `06_snake.js` / `11_render.js` / `13_editor.js` / `12_ui.js` / `14_main.js`：全程零改（BGM 自订阅 Bus 事件，复用既有 emit）。
- `02_config.js` 除沿用既有 `AUDIO.bgmVolume` 外，不再动其他字段；曲谱表现值全内联于 `10_audio.js`（🟡，非 §9 平衡值）。
- 现有 12 个 `Bus.on(...tone/noise...)` 事件音效行：一行不删不改，BGM 用追加订阅。
- §9 真源不碰。

## ⑤ 验收标准
1. 首次交互后能听到探索 BGM，无缝循环、不卡顿；能听出小调暗色氛围 + 蛇之动机(A→C→E)。
2. Boss 预警→crossfade 到 Boss 层；下一波→回落。不爆音、不断顿、不双份叠播。
3. 触发死亡/受击/获得技能时能感到 BGM 短暂让路(ducking)，关键音清晰。
4. 暂停时 BGM 压低、恢复回升；死亡时淡出。
5. 静音开关同时停/恢复 BGM 与 sfx；BGM 明显低于 sfx。
6. 桌面 + 移动首次交互后都能响（autoplay 合规）。
7. `git diff` 仅在 `10_audio.js` + `02_config.js`；其余为空；无新增裸全局、无 import/export。

## ⑥ 落地顺序（纪律）
出计划 + STATUS（本文件）→ 改 `10_audio.js`（含曲谱常量+调度器+层+ducking+暂停/死亡+unlock 挂钩）→ 沿用 `AUDIO.bgmVolume` → 出测试清单 → 浏览器实测通过 → **独立 commit（不并批）** → 才进音频 B。
