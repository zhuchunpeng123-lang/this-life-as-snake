# 掉帧回归诊断（plan-first · 仅诊断，未改代码）

> 日期：2026-07-20 · 目标：定位 baseline-b9 之上把高潮段掉帧带回来的 commit；并复核「本次计划改动（worldScale）」是否会再引发 FPS 不稳。

## 0. 关键事实澄清（最重要）
- `baseline-b9` **等于** `270056d`（tag 指向该 commit）。
- 因此用户说的「现状 270056d 掉帧」与「baseline-b9 封版良好」指向**同一 commit**，逻辑上只能这样统一：
  **用户浏览器里看到掉帧的，是未提交的 WIP（8 个 modified 文件 + 15_profiler.js），不是提交的 270056d。**
- 已执行 `git stash push -u` 把 WIP 暂存；`git bisect` 现在检出的是**纯提交态**代码。浏览器此刻跑的是提交的 `0a5d871`，请实测这个，不要混进 WIP。

## 1. 二分已就位
- `git bisect start` / `bad HEAD(=b6b380d)` / `good baseline-b9(=270056d)`
- 范围 = `baseline-b9..HEAD` 共 **5 个 commit**（用户口述 6 个，实为 5；270056d 即 baseline-b9 本身）：
  `bc01a11`(闪电内圈死区) → `0a5d871`(补给危险偏向) → `897d92b`(暂停/等比缩放/指针反算) → `e5d3f7f`(屏震统一·蒸汽阈值4) → `b6b380d`(敌列快照)
- **当前待实测版本：`0a5d871`**（已检出到工作树）。
- 用户实测后回 good/bad，我继续 `git bisect good/bad` 收敛；约 2~3 步锁定首坏 commit。
- ⚠️ 若 `baseline-b9`(=270056d) 实测也掉帧 → 立刻停，说明问题不在 5 个 commit 内，转查 937a87e 那批（b9 性能工作）。

## 2. 静态排查结论（提交态）
### (a) 缩放不是 fill-rate 回归源（推翻 Notion-AI 的缩放假设）
- `baseline-b9` 与提交的 `897d92b`/当前 HEAD 的 `resize()`：**backing store 都是 `logicalWidth × devicePixelRatio`**（固定），contain 缩放只改 CSS 显示尺寸，不改渲染像素数。
- 所以 897d92b 的等比缩放**没有**放大 backing store → 不是 fill-rate 回归。
- 用户 WIP 里的「fancy resize」(`dpr = dprMon*scale` + `MAX_BACK_W=1600` 上限) 是**未提交**改动，且它把 backing 封顶在 1600×900，**比提交的 1920×1080( retina )更小** → 若它导致掉帧，反直觉，需另查（见第 4 节 fallback）。

### (b) 350 上限运行时确实生效（已确认）
- 提交态 `02_config.js`：`maxParticles:350`、`maxTexts:48`、`spawnBudgetPerFrame:120`。
- `05_particle.js`：`emitParticle/emitText` 里 `particles.length >= maxParticles()` / `texts.length >= maxTexts()` 硬上限 + `frameSpawn >= spawnBudget()` 每帧预算门控 → **350 是真实生效的硬上限**。
- ⚠️ 但 `beams / blasts / darts / flashCores` **只有每帧预算、无活跃数硬上限**（仅 particles/texts 有硬上限）。蒸汽齐爆时 `flashCores`(白闪实心核) 会随 0.22s 寿命跨帧累积，高峰可能数百，每个全帧重绘 → 潜在 overdraw。该结构在 baseline-b9 已存在（非 5 commit 新引入），但值得 HUD 盯 `flash` 行。

### (c) 嫌疑排序（提交态 5 commit）
1. **`897d92b` pointermove 反算**：`canvas.getBoundingClientRect()` 在**每次 pointermove** 调用 → 若布局脏会强制同步重排；全程移鼠标瞄准时持续触发，与「高潮段（边打边瞄）掉帧」高度相关。最强嫌疑，但需 bisect/HUD 实测确认（纯移鼠标才抖 = 此因）。
2. `e5d3f7f` 屏震统一：`steam.manyMin` 3→4（**更少**震动）+ 删 addShake 改 addTrauma → **减少**工作量，非回归。
3. `b6b380d` 敌列快照：`_enemySnap = allEnemies()` 每帧 1 次，**替代**原本 tickFire/Ice/Bolt/Combos 各自 `allEnemies()` → **减少**分配，非回归。
4. `0a5d871`(补给危险偏向) / `bc01a11`(闪电内圈死区)：轻微实体增减 / 跳过近头索敌 → 倾向减负，低嫌疑。

## 3. 诊断 HUD 怎么开（无需改代码）
- 提交态各版本 GM 面板（`~` 打开）有「**性能HUD：关**」按钮 → 点一下变「开」即可显示：FPS / CPU帧(ms) / 帧(ms) / 画布尺寸 / 敌·节 / p·t 计数与上限 / 蒸汽·白爆·灼烧ignite·火DOT / T1~T4 开关态 / 6 数组(beam/blast/dart/flash) 活跃数。
- 判因：窗口越大帧越糟→fill-rate（指向缩放，但已排除）；帧耗时锯齿+粒子/数组数高→GC/分配（指向某处每帧新分配）；纯移鼠标抖→重排（指向 897d92b 反算）。
- 缺口：HUD 不显示「本帧新建对象数」（GC 直接指标），p/t/数组计数为代理。如需真·每帧分配计数，要加一个计数器（属代码改动，等确认后再做）。

## 4. 本次计划改动（worldScale）的 FPS 风险评估 → 结论：安全，前提守一条护栏
计划内容：渲染加 `worldScale`(默认0.8，纯视觉) + `getWorldScale`；指针反算除以 worldScale；GM 滑条；飘字绘于白闪之上；BOSS DOT HUD；瞬伤/蒸汽飘字提权 high。
- **安全点**：worldScale 仅作绘制变换（`ctx.scale(s,s)` 包 drawWorld），**不改 `canvas.width/height`（backing store 固定 logical×dpr）** → 渲染像素数不变或略减（实体更小、覆盖像素更少）→ fill-rate 中性偏优。
- 指针反算：仅 `/worldScale` 算术，**不新增 `getBoundingClientRect`** → 不引入重排。
- 飘字提权 / 绘序 / HUD 行：仅 z-order 与少量文本，无每帧新分配。
- 🔒 **唯一护栏（落地时必须守）**：**绝不能用 worldScale 去乘 `canvas.width/height`**（那才会放大 backing → fill-rate 回归）。keep backing store = `logicalWidth×dpr`（或沿用现有 `MAX_BACK_W` 封顶），worldScale 只作用于绘制变换。
- 结论：按上述护栏实现，本次计划**不会**重现 FPS 不稳。

## 5. 下一步
- 用户：实测当前检出版本 `0a5d871`（WIP 已 stash，跑的是纯提交态），开 GM「性能HUD」，打到高潮段看 FPS/帧(ms)/p·flash 行，回 good/bad。
- 若 5 个 commit 全 good → 回归在 WIP：对 8 个 modified 文件做 `git diff 270056d` 逐文件排查（重点 11_render.js fancy resize / 14_main.js pointermove / 05_particle.js / 02_config.js(350→240)）。
- 锁定首坏 commit 后，再出修复方案（§八 计划闸），不在此阶段改代码。
