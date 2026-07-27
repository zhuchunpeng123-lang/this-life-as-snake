# RELEASE.md · 封版快照文档（Freeze Snapshot）

> 本文是「封版」时刻的项目快照：记录冻结版本、范围、已知问题与发布阻塞。
> 配套：AGENTS.md（守则）、CHANGELOG.md（改动流水）、docs/DEBT.md（债台账）、docs/plans/STATUS.md（计划索引）、docs/HANDOFF-CODEX.md（交接圣经）。
> **性质**：内部冻结快照 + 交接基线，**不是公开发布**（B-TUNE 发布硬阻塞仍未解，见 §三）。

---

## 一、版本标识

| 项 | 值 |
|---|---|
| 封版日期 | 2026-07-27 |
| 冻结 commit | `5a5b5d6`（HEAD，main） |
| 构建戳 `?v=` | `e392a72bd0`（index.html 内 15 个 `<script>` 统一） |
| 代号 | 封版快照 · 内部交付（Handoff Freeze），非 GA |
| 运行方式 | 静态托管 `snake55/` 目录（无构建步骤、无包管理、无 import/export） |

---

## 二、封版范围说明

- **冻结什么**：本次仅冻结「代码逻辑 + 文档」。用户明确「暂时先这样」——桌面端 UI/音频维持现状不动；移动端已完成 iOS 音频解锁 + UI 逐行对齐 + 刘海虚影消除（2026-07-27 三轮修复）。
- **不冻结什么**：用户将用 **Codex**（另一 AI）继续修一批 bug；这些 bug 由用户私下列清单交给 Codex。封版文档与《HANDOFF-CODEX.md》已把全部**已知开放债/坑**整理清楚，供 Codex 直接接手。
- **关键约束**：`02_config.js` 数值结构、`03_core.js`/`04_collision.js` 底层、脚本加载顺序、全局挂载方式——四项锁死清单（AGENTS.md §二）在封版期内**依然不可动**，除非走对应流程并经用户确认。

---

## 三、🔴 发布硬阻塞（封版前必须解决，否则不可 GA）

> 来源：docs/DEBT.md §4 工程债 · B-TUNE。记忆库已立「发布前硬阻塞」。

- **B-TUNE 标定工具未隔离**：`13_editor.js`（GM 标定层 `rtTuning`/`rtSet` + `~` 键 + 移动端 ⚙ 按钮）与 `07_enemy.js` 的 `spawnDummy`（训练假人）**当前始终加载、未受 `CONFIG.DEBUG.enabled` 门控**。
  - 后果：标定滑条 / 沙盒 / 假人会泄漏到玩家环境（dev-only 工具进 release 路径）。
  - 修复方向（建议，供 Codex）：将 `13_editor.js` 的初始化、`keydown` 监听、`Bus.on('editor:toggle')` 注册整体包进 `if (CONFIG.DEBUG.editorEnabled)`；`07_enemy.js` 的 `spawnDummy` 调用点加 `DEBUG` 守卫；发布版 `CONFIG.DEBUG = { enabled:false, editorEnabled:false, ... }`。
  - 影响面：仅 dev 工具可见性，不改变任何 gameplay/数值；但属安全/整洁硬要求。
- **iOS standalone 真机复验**：2026-07-27 已做第三轮音频解锁修复（手势内同步起振荡器 + ctx running 后起 BGM），逻辑上应已根治「添加到主屏幕后无声」。但**用户尚未在真机复验绿**——列为待用户/Codex 复验项，非代码阻塞。

---

## 四、本版包含（近期已落地、可演示）

- 程序化 BGM v3（Web Audio 纯合成，三层 explore/battle/boss crossfade + ducking + 暂停/死亡响应 + autoplay 合规）。
- 音效优化与 BGM 关系治理（暂停分流静音 / 三选一压小不静音 / 火墙 DOT 嗡鸣重做 / hit·die 节流 / combo ducking / 密度感知 duck）。
- 移动端：强制横屏拦截、右侧固定锚点摇杆、HUD/技能栏/Combo 逐行对齐、系统按钮左下竖排带字、刘海虚影消除（背景同色 + 触屏去光晕）、iOS 音频解锁。
- 玩法：技能沿蛇身铺开（火/冰/护盾）、蒸汽状态引爆、冰冻机制重做、铁壁蛇阵(未做)、Boss 召唤小怪(未做)等详见 DEBT §3。
- 敌人 PNG 接入（wanderer/chaser/charger/elite/boss），蛇头代码眼 + 受光渐变。
- 性能根治：fixed-step 累加器（STEP=1/60）+ 插值、自适应 PerfTier 分级、粒子/飘字硬上限门控、像素吸附相对相机单次取整（消中心闪）。

---

## 五、已知问题 / 开放债总览（详见 docs/DEBT.md）

| 类型 | 状态 | 摘要 |
|---|---|---|
| 工程债·B-TUNE | 🔴 发布阻塞 | GM 标定层 + 训练假人未 DEBUG 门控 |
| §9 数值债 | 🟡 | overflowScore / dangerBias.ring / orbitHitMul 代码已落值、§9 待用户回写 |
| 表现债 | 🟡 | combo 配色、电磁 Combo 视觉同质（与基础闪电链读不出联动）、一众粒子/渲染字面量待 ~ 调参定稿 |
| 设计债 | 🔴 | 铁壁蛇阵、Boss 召唤小怪、满级后溢出转化（GDD 已规划、代码未实现） |
| 美术债 | 🟡 | snake_head.png 精灵 pivot/受击 squash/无敌闪未作用于精灵路径；`enemy_boss.png` 非用户预期的「猫头鹰」；snake_tail/body 无图走代码画 |

---

## 六、部署 / 下发说明

- **托管**：任意静态服务器指向 `snake55/` 目录即可（`python -m http.server` / VS Code Live Server / Nginx）。根目录需可访问 `index.html` 与 `manifest.webmanifest`。
- **缓存破坏**：改任意脚本后必须**统一 bump** `index.html` 内 15 处 `?v=<戳>`（否则浏览器用旧缓存，用户看不到更新）。本封版戳 `e392a72bd0`。
- **移动端真机**：iOS Safari → 分享 →「添加到主屏幕」→ 主屏图标进入 standalone。注意：`manifest.webmanifest` 的 `theme_color`/`background_color` 已与页面统一为 `#11162a`（本封版已同步）。重新加到主屏才会刷新 manifest。
- **桌面**：Chrome/Edge/Firefox 直接开 `index.html` 经 http 即可；全屏按钮一键 `requestFullscreen`（iPhone 不支持 JS 全屏，提示「添加到主屏幕」）。

---

## 七、封版验收清单（用户/Codex 复验）

- [ ] 桌面端：开局 BGM 响、⏸ 暂停静音再按恢复、右上 HUD 三联 + 技能栏 + Combo 对齐、~ 调参器可用 ✅/❌
- [ ] 移动端（硬刷新）：iOS 主屏进入 → 点开始 → BGM 立即响；左上生命/数据 与 右上技能/combo 逐行对齐；左下 ⏸暂停/⛶全屏/⚙GM 等宽带字；横屏满屏无黑边 ✅/❌
- [ ] B-TUNE：发布构建下 `~`/⚙ 不可唤起 GM、无法生成训练假人（Codex 修后验收）✅/❌
- [ ] 重新「添加到主屏幕」后 manifest 主题色与游戏同色、无启动缝 ✅/❌

---

## 八、下一步（Codex 接手边界）

1. **先解 B-TUNE 发布阻塞**（§三），再谈 GA。
2. 用户私列 bug 清单 → Codex 逐条修，每修必出计划（见 AGENTS.md §八）经用户确认后落地 + 写测试清单。
3. §9 数值债：**Codex 只改 `02_config.js` + 在 DEBT §9 回写清单记账，绝不碰 §9 真源 MD**（真源由用户回写）。
4. 设计债（铁壁蛇阵等）落地前必须出 §四 计划并经用户确认（会动 core/collision，走 §三）。

> 封版即交接基线。`docs/HANDOFF-CODEX.md` 是给 Codex 的详尽圣经，读完即可独立开工。
