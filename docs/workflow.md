# workflow.md · 协作与调参操作细则

> AGENTS.md 是"守则"（能/不能），本文件是"怎么把活干漂亮"的细则。展开 §九（多窗口）与 §十（调参沙盘）。
> 配套：AGENTS.md、docs/DEBT.md（债从哪来）、CHANGELOG.md（债还了没）。

## 文档地图

| 文档 | 位置 | 作用 |
|---|---|---|
| AGENTS.md | 根 | AI 规矩（守则） |
| CHANGELOG.md | 根 | 版本更新日志（已落地改动） |
| docs/DEBT.md | docs/ | 技术债 / 设计债台账 |
| docs/workflow.md | docs/ | 本文（协作 + 调参细则） |
| 《GDD v0.3 设计意图层》 | 根 | 设计意图（数值已分离） |
| 《数值真理源 v0.3 §9》 | 根 | 数值唯一真理源 |

---

## §1 多窗口协作 SOP（对应 AGENTS.md §九）

目的：隔离"作者锚定偏见"与上下文膨胀；新窗口自动加载 AGENTS.md，读 docs/ 即可接手。

1. **窗口 A（作者）**：出 §四 计划 → 你确认 → 落地代码 → 写 `docs/plans/<需求>.md` + 测试清单。
2. **窗口 B（审查者）**：只读 A 交付的文件，做静态核对：
   - 代码 vs 计划（是否改了计划外文件）
   - 验收清单 vs 标准（✅/❌ 是否齐）
   - 规则违反（裸数字 / 跨层直调 / 动 core\|collision 未走 §三）
   - 输出差异报告（只报告，不改代码）。
3. 浏览器手动复验由你完成。

> 单窗口模式同样可用：上下文热、步骤连贯；B 仅在你想要独立审查时开。

---

## §2 数值调参沙盘 SOP（对应 AGENTS.md §十）

**触发判定**：仅改 config.js 数值 / ~ 调参器试探 → 走本轻量通道；数值结构或伤害管线变化 → 升级 §八 厚计划。判不准宁按 §八。

每笔调参必含：
1. **意图一句话**（手感，非裸数字）。
2. **≥2 候选数值 + 推导**：基准值 → 目标 delta → 公式依据（用 `Core.Formula`）。
3. **波及分析**：改 X 经 Bus/Formula 影响哪些系统、是否破坏 §六 一致性。
4. **§9 回写项**：新增 / 修订哪条。
5. **验收标准**：正常手感 + ≥1 边界 / 反向场景。

**护栏**：❌ 不抄写你给的数而不校验；❌ 不跳过量化的理由；✅ 主动指出连锁失衡。

---

## §3 版本回滚 SOP（Git，本地优先）

初始化（本仓库已做）：
```
git init
git add -A && git commit -m "baseline"
```
日常落地：
```
git add -A
git commit -m "YYYY-MM-DD · 需求X：一句话"
```
回滚（三档）：
- 看历史：`git log --oneline`
- 撤单文件到某版：`git checkout <hash> -- snake55/xx.js`
- 整体回退（保留历史）：`git revert <hash>`（生成新提交）或 `git checkout <hash>`（detached，再 commit 固定）
- 丢弃未提交改动：`git restore <file>`

> 本地回滚完全离线；推到 Git 网站见 §4。

---

## §4 推送到 Git 网站（GitHub / Gitee / GitLab）

Git 默认**只存在本地**。要上云需两步（账户相关，需你操作）：

1. **你**在网站建空仓库（需登录 / 建号）——AI 无法代建。
2. AI 可代为执行（需你的凭据 / 登录态）：
   ```
   git remote add origin <仓库URL>
   git branch -M main
   git push -u origin main
   ```

> 凭据（账号密码 / Token）由你提供；本环境无 GitHub 集成，push 需你的授权登录。
