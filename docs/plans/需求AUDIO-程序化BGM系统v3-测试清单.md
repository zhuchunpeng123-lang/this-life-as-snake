# 需求 AUDIO · 程序化 BGM 系统 v3 — 测试清单

> 验收标准（规范 §⑦ + 用户纪律）。复现步骤基于浏览器实跑，autoplay 需**首次点击/触摸**解锁（12_ui 首次 pointerdown 调 unlock → 启动 BGM）。
> 提交纪律：本特性**独立 commit**，仅 `10_audio.js` + 本计划文件 + STATUS.md；`02_config.js`/`CHANGELOG.md` 当前改动属轴1 turnRate 残留，不并入。

## 正常路径
1. **探索 BGM 起播（规范 §⑦-1）**
   - 步骤：进游戏 → 首次点击画面任意处（解锁音频）→ 静默 1–2 秒。
   - 预期：听到暗色小调氛围 Pad（Am-F-C-G 循环）+ 稀疏 ARP；能在 ARP 乐句开头辨认蛇之动机 **A3→C4→E4**。无缝循环、无明显卡顿/爆音。
   - 边界：若游戏在菜单态就点击，探索 BGM 可能在菜单即响（设计允许，属 ambient）；进 playing 后仍正常。

2. **战斗层切换（规范 §⑦-2 · 核对点1 映射 A）**
   - 步骤：让游戏推进到 **stageId 2/3/4**（成长期起）。可借 GM/调试加速时间或自然游玩至 60s+。
   - 预期：`wave:stage` 触发 → battle 层 crossfade（~0.8s）叠入：八分 BASS 脉冲 + 十六分密 ARP + PERC（kick 步0/8、hat 步4/12）。不爆音、不双份叠播、节奏不断顿。
   - 边界：**stage 3 vs 4 升温**：stage4（高潮期）比 stage3（割草期）PERC 更密（满 offbeat hat + 加密感），体现层内密度自适应（不分层）。

3. **Boss 预警 → Boss 层（规范 §⑦-2）**
   - 步骤：推进到 stageId 5（Boss期，约 480s）或触发 `wave:boss_warn`。
   - 预期：Boss 层 crossfade 叠入：A2 pedal drone + 每拍 kick（步0/4/8/12）+ 每小节步14/15 半音张力 stab（A#4→B4）+ ducking 让路。之后回到下一波（若有 `wave:stage`）回落 battle/explore。

4. **Ducking 让路（规范 §⑦-3）**
   - 步骤：游玩中触发 受击 / 获得技能 / Boss 预警 / 敌人阶段切换 / 死亡。
   - 预期：BGM 瞬时压低约 −6dB（×0.5）持续 ~250ms 再回升；对应 SFX（受击/技能/预警音）清晰可辨、不被 BGM 盖过。

5. **暂停 / 恢复（规范 §⑦-4 · 核对点2）**
   - 步骤：游戏中按 `P` / `Esc` 或点暂停遮罩 → 再恢复。
   - 预期：暂停瞬间 BGM 压到 30% 并持续；恢复后回升至正常。读 `GS.status` 判定，零新增 emit。

6. **死亡淡出（规范 §⑦-4）**
   - 步骤：游戏中死亡（`snake:dead`）。
   - 预期：BGM 在 ~0.5s 内淡出并停调度器；死亡音效正常。重新开局（再收到 `wave:stage`）BGM 重启（explore）。

7. **静音开关（规范 §⑦-5）**
   - 步骤：开静音（setMuted(true)）→ 关静音。
   - 预期：静音同时停 BGM 与 SFX（BGM 在 master 之下）；恢复后两者同响。BGM 明显低于 SFX（有效 ≈0.224 vs SFX 峰值 ≈0.56）。

8. **桌面 + 移动（规范 §⑦-6）**
   - 步骤：桌面 Chrome 点画面；手机/移动模拟器触摸画面。
   - 预期：两者首次交互后均响（autoplay 合规）；桌面原有 12 事件音效不受影响。

## 回归 / 反向
- **R1 现有 12 事件音效零回归**：受击/成长/死亡/敌人命中/敌人死/技能/连击/boss预警/波次切换音效照旧触发（BGM 用追加订阅，未删改既有 `tone/noise` 行）。
- **R2 底层 diff 为空**：`git diff --stat` 中 `03_core/04_collision/06_snake/11_render/12_ui/13_editor/14_main` 必须为空；仅 `10_audio.js`（+ 计划文件 + STATUS）有改动；无新增 `<script>`、无 import/export、无新增裸全局。
- **R3 无双份叠播**：快速连续切层（如 boss_warn 紧接 wave:stage）不应出现两股同层音叠加爆音（crossfade 仅调层增益，不重启时钟/不双开调度器）。
- **R4 不爆音**：层切换、ducking、暂停恢复、死亡淡出全程无 click/pop（增益均走 ramp，无硬切）。

## 手动复验记录（由用户填写）
- [ ] 1 探索 BGM 起播 + 蛇之动机可辨
- [ ] 2 战斗层 crossfade 无缝
- [ ] 3 Boss 层 + 半音张力
- [ ] 4 Ducking 让路
- [ ] 5 暂停/恢复
- [ ] 6 死亡淡出 + 重开重启
- [ ] 7 静音同步 BGM/SFX + 音量垫在 SFX 下
- [ ] 8 桌面/移动均响
- [ ] R1-R4 回归全过
