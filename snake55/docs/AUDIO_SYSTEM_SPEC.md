# 《此生为蛇》音频系统规范 — AUDIO-FINAL-1.0

状态：**封版基线 / Locked Baseline**  
日期：2026-08-08  
适用范围：BGM、UI、战斗 SFX、5 个技能、3 个 Combo、敌人/Boss危险提示、结算音效以及所有后续副本音频改动。

> 修改任何音频前，必须先阅读本文与 `AUDIO_EVENT_MATRIX.md`。如果新需求与本文冲突，先更新规范并说明原因，再改代码。禁止“先加一个声音试试”式增量堆叠。


## 0.1 配置所有权边界（封版约束）

音频表现参数不得再写入或要求覆盖 `02_config.js` 的 gameplay / balance 数值文件。

- `02_config.js -> AUDIO` 只允许保留用户级开关与总音量入口：`enabled / masterVolume / sfxVolume / uiVolume / bgmVolume`。
- Voice Budget、Bus Gain、Density、Cooldown、Duck、Limiter、技能/Combo 音色参数由 `10_audio.js` 与本规范拥有。
- 敌人/Boss 只负责发出语义事件；音频表现参数不得成为怪物数值真理源的一部分。
- 后续怪物血量、速度、阶段时间、成长曲线等修改不得要求重做音频补丁。
- 如果未来需要把音频调参外置，应使用独立 `audio_config` / 音频资产配置，而不是重新混入 gameplay CONFIG。

这条边界的目的：**音频封版后，数值迭代与声音系统互不阻塞。**

## 1. 第一性原理

游戏声音只承担四件事，按优先级排序：

1. **生存信息**：必须躲、正在受伤、Boss/Charger 即将攻击。
2. **操作确认**：按钮、暂停/恢复、选择、确认、返回、拾取。
3. **战斗身份**：玩家不用看屏幕，也能区分 5 技能与 3 Combo 的核心攻击。
4. **情绪与质感**：BGM、击杀塌落、胜利、材质细节。

声音数量不是品质。后期屏幕越忙，低价值声音越应该主动消失。

## 2. 播放环境

统一目标：**手机外放可读性优先，耳机不刺耳，电脑外放自然**。

- 关键身份必须主要落在约 180Hz–2.8kHz，不依赖超低频。
- 高频裂响可以出现，但不能靠 4kHz+ 的尖峰建立身份。
- 不用立体声定位承担关键信息；手机单扬声器仍需完整可读。
- 同一声音不因设备变化而改变玩法含义。

## 3. BGM 锁定规则

当前 Golden Master 单源 BGM 已验收，SFX 封版不得破坏以下不变量：

- 任意时刻 `mediaAudible.length <= 1`。
- 只保留 Protection / Growth / Mowing / Climax / Boss 五个 Loop。
- 不新增音乐 Transition Asset，不新增 Boss Warning BGM。
- 阶段切换保持 4 小节 phase-lock。
- 普通战斗密度**不允许**让 BGM 频繁 pumping；只有 P4/P5 关键事件可以短 Duck。
- Boss 打多久都由 Boss Loop 持续到 `boss:defeated`。

## 4. SFX 架构

### 4.1 Sample Bank

所有高频 SFX 在 `AudioContext` 首次建立时一次性生成确定性的短 `AudioBuffer`。运行时主要播放 `AudioBufferSourceNode`。

硬规则：

- **一个语义事件 ≈ 一个 Voice**。
- 多层材质（body/noise/click）必须预渲染进同一个 Buffer，不能在事件触发时临时创建 4–6 个 oscillator。
- Burning Barrage 三连属于三个真实错峰 projectile 事件，可以占三个短 Voice；它不是一个事件内部的多层浪费。
- 不引入在线素材/CDN；必须保持 `file://` 本地运行兼容。

### 4.2 Bus

- `ui`：菜单/按钮/选择/拾取。
- `player`：玩家受伤、临界、墙擦。
- `threat`：Charger/Boss 必须反应的预警。
- `skill`：5 个基础技能。
- `combo`：3 个 Combo。
- `impact`：低价值通用命中/暴击。
- `death`：普通/精英击杀聚合。
- `boss`：Boss攻击/阶段关键反馈。

## 5. 优先级

| Priority | 含义 | 典型事件 |
|---|---|---|
| P5 | 必须反应 / 生死 / 大状态 | 玩家受伤、Charger蓄力、Boss攻击预警、Boss阶段、Combo发现 |
| P4 | 关键战斗成果 | Boss发射、Combo主爆点、电磁炮齐射、技能获得 |
| P3 | 基础技能身份 | Lightning、Bolt volley、Ice、Shield有效接触 |
| P2 | 次级战斗信息 | Charger冲刺、Elite/群怪死亡、普通拾取 |
| P1 | 可牺牲细节 | 火墙接触、墙擦、普通命中 |

**P5/P4 不是“更响”，而是可以驱逐 P1/P2。**

总 SFX Voice 预算 12；UI 预算 4。高密度时：P3+ 保留，P1/P2 按密度直接丢弃。

## 6. BGM Duck

- `major`：玩家受伤/临界、Boss预警/阶段、Combo发现、技能获得等一次性重要信息。
- `light`：Charger/Boss攻击预警等短危险提示。
- **禁止**：普通命中、火DOT、护盾DOT、Bolt、Lightning常规攻击、电磁炮每轮齐射、Steam常规爆炸反复 Duck BGM。
- 普通密度不再用 density duck BGM；密度只淘汰低价值 SFX。

## 7. UI 声音语言

UI 只有固定语义家族：

- `press`：短、轻、即时。
- `confirm`：向上/完成感。
- `back`：向下/关闭感。
- `toggle`：状态切换。
- `pause_in`：收束。
- `pause_out`：恢复。

应用：开始、技能卡、技能/Combo状态、全屏、暂停/恢复、查看战绩、构筑详情关闭、叙事选择、再来一局。不要给每个按钮发明新音色。

## 8. 五技能声音身份

### Fire 火焰

- 身份：宽、温热、低中频火焰/余烬。
- 火 DOT 只作为稀疏的“活动反馈”，全局冷却约 360ms。
- 禁止形成固定 4–6Hz tick。

### Ice 冰霜

- 两段：`ice_throw` 冰锥飞行 + `ice_bloom` 落地霜场展开。
- 飞行偏高、轻；落地由低到高展开，不能像枪声。

### Bolt 飞镖

- 一次攻击轮次只有一个 `bolt_N` Voice；N=实际目标数 1–5。
- 多目标信息编码在同一个 Buffer 内的微错峰瞬态中。
- 不允许每个目标各自抢 Voice。

### Shield 护盾

- 圆润、晶体碰撞感。
- 全局冷却约 280ms；只表达“护盾正在有效接触”，不跟着每个 DOT tick 发声。

### Lightning 闪电

- 核心语言：**“啪 / 啪啪 / 啪啪啪啪”式短裂响**。
- 高频只做 crack，主体仍需在手机扬声器可读的中频。
- 每次链击一个 Buffer Voice；等级只改变裂响密度与重量，不叠独立尾奏层。

## 9. 三 Combo 声音身份

### Steam Explosion = Fire + Ice

`砰（低频/火） + 嘶（蒸汽/冰）`。一个爆炸事件一个 Voice。常规爆炸不反复 Duck BGM。

### Electro Turret = Bolt + Lightning

- Deploy：能量装置建立。
- Fire：核心是低中频 **“砰”**，与基础 Lightning 的“啪”明确分开。
- End：短收束。
- 每次齐射一个 Voice；不叠 4 个实时 oscillator。

### Burning Barrage = Fire + Bolt

- 必须听成真实的三连飞镖：`哒—哒—哒`。
- 音频时间读取 `visualDelay`，与三支飞镖视觉错峰一致。
- 后续 Burn DOT 静音；燃烧身份由投射物本身与视觉承担，防止持续节奏污染。

## 10. 敌人与危险提示

### Charger

- 进入 windup：`enemy:charger_warn`，P5；这是可行动的预警。
- 真正 charge：`enemy:charger_charge`，P4/P2级冲刺确认。
- 多个 Charger 同时蓄力会全局节流，不用声音数量表达数量。

### Boss

- 关卡 Boss warning：P5。
- 每轮弹幕在发射前约 0.28s 发送 `boss:attack_warn`：P5。
- 真正发射 `boss:attack_fire`：P4。
- Phase 2：P5 + major duck。
- Boss warning 不改变 BGM，只用 SFX。

## 11. 高频/持续事件规则

- Fire DOT：稀疏聚合。
- Shield DOT：稀疏聚合。
- Burn DOT：静音。
- Wall scrape：≥320ms 冷却。
- 普通 hit：≥120ms 冷却且 P1。
- Enemy death：约 70ms cluster 内聚合为一次塌落；数量只改变重量，不线性叠 Voice。
- 普通命中/死亡在高密度下可以完全不播。

## 12. 新副本/新技能扩展规则

新增声音前必须依次回答：

1. 这个声音告诉玩家什么信息？
2. 如果完全不播，玩家是否会做错决定？
3. 是否已有另一个声音拥有同一事件？
4. 它是一次性事件还是持续状态？持续状态能否改成进入/退出提示？
5. 属于哪个 Bus / Priority？
6. 高密度时能否被牺牲？
7. 是否会和现有 5技能/3Combo 的声音身份撞车？
8. 是否会导致 BGM反复 duck？若会，默认方案是“不 duck”。

禁止新增：

- 固定高频 tick 作为 DOT/接触反馈。
- 一个技能事件现场创建多条独立旋律/节奏声部。
- 每个敌人/每个 projectile 无限制各播一声。
- 用音量代替优先级。
- 用新 BGM Layer 解决 SFX问题。

## 13. 封版验收硬指标

- 正常 BGM：`mediaAudible.length <= 1`。
- 高频技能运行时单个语义事件通常只创建 1 个 Source Voice。
- 总 SFX Voice <= 12，UI <= 4；高价值事件可抢占低价值事件。
- 5技能盲听可区分；3 Combo 能听出父技能血统。
- Charger/Boss攻击有可行动的提前提示。
- Pause/Resume、查看战绩、构筑详情关闭、Replay 都有统一 UI反馈。
- 后期高密度下 BGM不因普通攻击持续 pumping。
- 手机外放仍能读出 Lightning“啪”与 Electro“砰”的差别；耳机不出现持续尖锐高频疲劳。

## Patch / ownership policy (V3)

Audio changes must not require whole-file hashes for gameplay or UI files that are expected to evolve.

- `02_config.js`, wave timing, monster balance and rendering files are not audio-owned.
- `07_enemy.js` may expose semantic threat events, but audio patches must modify it with context hunks / event anchors only.
- `12_ui.js` may expose semantic UI feedback events, but audio patches must modify it with context hunks / event anchors only.
- `10_audio.js` is the audio-owned implementation and may use a strict verified audio-state hash.
- Before an apply script writes anything, all target hunks and package payloads must pass preflight. No partial application.
- BGM assets are frozen unless a task explicitly reopens BGM composition.

This rule exists so later balance, art and level changes cannot accidentally block or overwrite the sealed audio system.

