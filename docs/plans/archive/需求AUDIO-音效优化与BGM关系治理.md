# 需求 AUDIO · 音效优化与 BGM 关系治理（补丁）

> 依赖：音频 A（程序化 BGM v3，10_audio.js 已落地未提交）。本单在其之上修三类音频问题，**仅改 10_audio.js，零跨层改动**，不碰 core/collision/§9。

## 一、目标（一句话）
修三类问题：①暂停时 BGM 压≈30%（对齐规范§4，**不归零**——本作暂停=3选1 升级、一局多次，归零反复掐断整段 BGM=更乱）；②火墙 DOT 引发的 `enemy:hit` 连发嗡鸣重做为有节制的温暖火声；③全局音效节流 + 扩展 BGM ducking（含密度感知 duck），杜绝多技能/多敌齐发时的"乱糟糟"。

> **前置校验（已通过·2026-07-26）**：`enemy:hit` 在 07_enemy.js 的全部 3 处 emit（死亡 flush / 周期 flush / 普通命中）payload **已带 `isDot` + `src`**，`10_audio.js` 纯读取即可，**零改 07_enemy.js（不破空 diff 边界）**。

## 二、涉及文件及理由（强内聚，仅 1 个）
- `10_audio.js`（唯一实现）：
  - 暂停 `pauseMul` 维持 **0.30**（≈0.25–0.30 区间对齐规范 §4，**不归零**；恢复回 1）。理由：本作暂停=3选1 升级、一局多次，归零会反复掐断整段 BGM=更乱；仅独立"真·硬暂停"可归零，此处不。
  - 新增 `throttle(key, ms)` 节流助手（基于 `ctx.currentTime` 的 lastPlay 表）。
  - 改写 `Bus.on('enemy:hit', …)`：读 `d.isDot / d.src`。`isDot && src==='fire'` → `playFire()`（节流 0.28s，替代 880 方波）；否则软化短 tick（880→520Hz、三角波、gain 0.06、dur 0.03，节流 50ms）。
  - 新增 `playFire()`：噪声→lowpass(~700Hz) + 低频锯齿(~150→90Hz) 0.3s 包络的温暖火/咆哮声，明显区别于方波嗡鸣。
  - `enemy:die` 加节流（80ms），防割草期死亡音爆。
  - `combo:found` 加入 ducking（原仅 snake:dead/hurt、enemy:phase、skill:gained、wave:boss_warn）。
- 不改其他文件：所有改动在 10_audio.js 内部，复用现有 Bus 订阅与 master 链，零新增 emit / 零新增 `<script>` / 零 import-export。

## 三、具体改动点
1. **暂停压≈30%（不归零）**：`game:toggle_pause` 处理 `pauseMul = paused ? 0.30 : 1`（≈0.25–0.30 区间对齐§4；applyBgmGain 经 0.15s ramp 平滑，防爆音）。理由同上：避免一局多次 3选1 暂停反复掐断整段 BGM。**含护栏**：仅改暂停系数，BGM 永不静音（三系数乘积下限≈0.07）。SFX 不受影响（暂停时仿真冻结本就不发技能音）。
2. **火墙音效重做**（`enemy:hit` 改写）：
   - 判定 `d && d.isDot && d.src === 'fire'` → `if (throttle('fire', 280)) playFire()`，不播方波。
   - 其余命中 → `if (throttle('hit', 50)) tone({ freq: 520, dur: 0.03, type: 'triangle', gain: 0.06 })`（降频+软波+节流，去"电流感"）。
3. **playFire() 设计**：噪声 buffer(0.3s 衰减) → `BiquadFilter lowpass 700Hz Q0.7` → gain 包络(0.0001→0.12→0.0001)；叠加锯齿 osc(160→90Hz exp) → lowpass 400 → gain 0.06。整体温暖、低频、无持续方波。
4. **enemy:die 节流**：`if (throttle('die', 80))` 包裹现有 noise+tone。
5. **combo:found ducking**：在该 handler 内调 `duckBgm()`（复用现有 -6dB/200–300ms 逻辑）。
6. **✅ SFX 密度感知 duck（用户裁定放行·2026-07-26）**：拆分 `duckMul` 为 `eventDuckMul` + `densityDuckMul` 两独立系数（互不污染）。`sfxPing()` 统计 200ms 窗口内音效触发数，`>3` 时 `densityDuckMul` 加深一档（-9dB≈×0.56）。**护栏**：①加深/回升经 applyBgmGain 0.15s 线性 ramp（150–250ms 平滑）；②保留 BGM 下限（三系数乘积下限≈0.07，永不静音）；③窗口/阈值/深度 `SFX_DENSITY_WINDOW=200 / SFX_DENSITY_TH=3 / SFX_DENSITY_MUL=0.56` 标 ⚠️ 可调。仅 10_audio.js。

## 四、不动的底层
- `03_core/04_collision/06_snake/07_enemy/08_skill/09_wave/11_render/12_ui/14_main`：diff 必须为空（节流/音色/暂停全在音频层解决，不回写伤害管线）。
- §9 真源不碰：所有音频参数为 🟡 表现层，无平衡值改动。
- BGM 的 lookahead/crossfade/时钟状态机结构不动，仅 pause 语义(0.3→0)与 ducking 事件集扩展。

## 五、验收标准（正常 + 边界/反向）
1. **暂停压≈30%（不归零）**：游戏内暂停 → BGM 降到≈30%（非全静、非归零）；恢复 → 淡入回来。多次 3选1 暂停不出现整段掐断/卡死感。
2. **火墙不嗡鸣**：火墙碰普通怪听到温暖火声（非电流嗡鸣）；蛇身持续穿 Boss → 火声约每 0.28s 一次、不再连成一片持续音。
3. **割草期不糊**：多敌同帧受击/齐死 → 音效经节流不叠成噪海，可分辨。
4. **技能让路**：连续 combo 时 BGM 明显让路，combo sting 清晰；与 BGM 同响不"乱糟糟"。
5. **静音/autoplay 不变**：setMuted 仍同步 BGM+SFX；首次交互后 BGM 起，合规不变。
6. **回归**：12 个既有事件音效仍触发（仅被节流/重音色）；diff 仅 10_audio.js，其余文件空；无新增裸全局、无 import/export。

## 六、提交纪律
- BGM(音频A) 与本次补丁同属"音频"工作流，合并为一次音频 commit（仍需在浏览器实测通过后）。
- 与已提交的摇杆版（9f191ea）严格分离，不回混。
