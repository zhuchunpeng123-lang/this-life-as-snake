# workflow.md · 协作、调参、Git 与文档治理细则

> AGENTS.md 是"守则"（能/不能），本文件是"怎么把活干漂亮"的细则。展开 §九（多窗口）与 §十（调参沙盘）。
> 配套：AGENTS.md、docs/DEBT.md（债从哪来）、CHANGELOG.md（债还了没）。

## 文档地图

| 文档 | 位置 | 作用 |
|---|---|---|
| AGENTS.md | 根 | AI 规矩（守则） |
| CHANGELOG.md | 根 | 版本更新日志（已落地改动） |
| docs/DEBT.md | docs/ | 技术债 / 设计债台账 |
| docs/DOCUMENT-RETENTION.md | docs/ | 历史资料取舍表与后续治理顺序 |
| docs/PROJECT-BRIEF.md | docs/ | 项目简报，适合总控窗口 |
| docs/PROJECT-STATUS.md | docs/ | 当前状态与正式审查入口 |
| docs/ARCHITECTURE.md | docs/ | 架构概要 |
| docs/README.md | docs/ | 文档入口 |
| docs/workflow.md | docs/ | 本文（协作 + 调参细则） |
| docs/RETRO.md | docs/ | 跨会话踩坑教训 |
| docs/RELEASE.md | docs/ | 5.5 封版快照 |
| docs/HANDOFF-CODEX.md | docs/ | CodeBuddy 封版交接，历史参考 |
| 《GDD v0.3 设计意图层》 | docs/ | 设计意图（数值已分离） |
| 《数值真理源 v0.3 §9》 | docs/ | 旧数值镜像 / 历史参考；当前以 `snake55/02_config.js` 为准 |

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

## §3 Git 主工作区与版本 SOP

后续 Codex 迭代默认在 `F:\贪吃蛇游戏项目-Codex\_git-main` 执行。外层目录是交接导出快照，只用于对照，不再作为主工作区。

当前远程：

- `origin = https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`
- `main` 跟踪 `origin/main`
- Codex 接手标签：`codex-handoff-20260727`
- 本地实验分支 `ab-13c915b` / `ab-52d076a` 不推送；`v0` 弃用不动。

日常流程：

```bash
git status --short --branch
git pull --ff-only origin main
git add <改动文件>
git commit -m "type(scope): 中文一句话"
git push origin main
```

提交前先执行 `node tools/check-project.mjs`。该命令不依赖第三方包；退出码 `0` 表示静态检查全绿，非 `0` 表示存在需要处理的错误。

禁止事项：

- 禁止 `git add -A`，避免把本地脚手架或临时文件带进提交。
- 禁止 `push -f` / `push --all`。
- 不在同一提交里混多个独立改动。
- 发现计划外文件变化，先停下来说明，不顺手带入。

回滚优先用保留历史的方式：

```bash
git log --oneline
git revert <hash>
```

仅需撤回单文件到某版时：

```bash
git checkout <hash> -- snake55/xx.js
```

## §4 代理、认证与缓存戳

当前本机访问 GitHub 需要 Clash 代理，本仓库本地配置为：

```
http.proxy = http://127.0.0.1:7897
https.proxy = http://127.0.0.1:7897
http.sslBackend = openssl
```

换机器或换网络时先检查：

```bash
git config --show-origin --get-all http.proxy
git config --show-origin --get-all https.proxy
git ls-remote origin HEAD
```

如果不需要代理，移除本仓库代理；如果端口变化，改成本机真实端口。不要盲目沿用旧机器的 `127.0.0.1`。

GitHub 认证当前走 GitHub CLI，账号 `zhuchunpeng123-lang` 已有 `repo` 权限。不要在聊天里明文传 PAT；推送失败时优先检查 `gh auth status`。

改任意 `snake55/*.js` 后，必须同步 bump `snake55/index.html` 中 15 个 `<script>` 的 `?v=` 缓存戳。原因：玩家浏览器可能继续使用旧脚本，导致线上“假更新”。只改文档、图片或 manifest 时不需要 bump JS 缓存戳。

## §5 历史资料治理原则

历史资料按用途处理，不按来源情绪处理：

- 保留：能解释当前架构、玩法意图、发布状态、踩坑教训的资料。
- 归档：封版交接、旧审查、旧计划、旧数值镜像。它们有证据价值，但不作为每日开工入口。
- 删除：重复文件、断链索引、空占位、明显过期且已有替代的文件。
- 合并：同一信息在多个文件重复时，只保留一个当前入口，其余移到 release/archive 或删掉。

执行顺序建议：先精简入口，再列取舍表，再经用户确认后做删除或迁移。删除前必须确认 Git 已有可回退锚点。
