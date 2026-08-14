# 《此生为蛇》协作与验收流程

## 1. 任务边界

先根据当前用户指令明确目标、允许文件和验收标准；再读取当前 worktree、相关源码和专项真理源。普通局部低风险任务可在授权范围内连续完成；用户只要求计划、使用 Plan 模式或未授权执行时，不修改文件。高风险边界以 `AGENTS.md` 为准。

既有 staged、unstaged、untracked WIP 都属于需要保护的工作。不得用 reset、restore、checkout、stash、强制覆盖或无关批量操作制造“干净基线”。任务必需的伴随修改要在交付中列明，无法安全隔离时暂停。

## 2. 计划与证据

计划主要用于内部自审，覆盖目标、文件范围、风险和验收方式。只有高风险、跨模块、跨会话、长期跟踪或用户明确要求时，才建立正式计划文件。不要为简单任务创建空洞清单。

把“太难、太吵、看不清、没反馈”等主观反馈转成可验证假设，先检查机制、事件链、CONFIG、资源和实际场景，再选择最小因果改动。不要把历史成功方案、固定候选数量或某个技能的视觉/声音答案当作默认规则。

## 3. Patch 与 Git 安全

- 精确 patch 先核对当前文件和必要的 hash，再执行 `git apply --check`；应用后检查实际 diff。
- 禁止 `--3way`、`--reject`、手工猜测冲突或为应用 patch 回滚无关 WIP。
- 正式 JS 改动完成后，按项目规则更新统一 cache stamp；只改文档/Skill 不修改游戏 cache stamp。
- 只暂存本任务文件；提交前检查 `git diff --cached --name-only` 和 `git status --short`。未获明确授权不提交、不推送。

## 4. 验证层级

按风险选择最小充分证据：语法/静态检查、功能测试、HTTP 浏览器测试、移动端/standalone 测试和用户人工验收。命令成功不等于视觉或手感通过。视觉最终结论必须说明证据来源；没有可靠截图、录屏或实机证据时，不宣称视觉验收完成。

只有用户明确要求浏览器运行态视觉证据时，才执行截图和视觉自审；普通 UI、素材替换或明确回退可交由用户快速实机验收。

## 5. 文档更新

- 稳定产品事实写 `docs/PROJECT.md`；当前状态、WIP 和开放问题写 `docs/STATUS.md`。
- 稳定架构只写 `docs/ARCHITECTURE.md`；流程只写本文件；通用 QA 写 `docs/QA.md`。
- GDD 只维护设计意图；运行时数值只认 `snake55/02_config.js`；历史资料只作追溯。
- 交付报告简要列出实际改动、验证结果、未验证事项和与既有 WIP 的隔离情况。

## 6. Documentation impact routing

仅在 durable fact 或 contract 改变时按 owner 路由：

- 稳定运行时/模块架构 → `docs/ARCHITECTURE.md`；当前完成状态/开放问题 → `docs/STATUS.md`；核心设计意图 → `docs/design/GDD.md`。
- 持久的世界观、美术、音频或资产规则 → 对应 canonical domain document；可复用的跨任务 Agent 方法 → 对应 Skill，一次实现成功不足以修改 Skill。
- 仓库级永久运行规则 → `AGENTS.md`；Git/协作/发布流程 → `docs/WORKFLOW.md`；有意义的持久项目里程碑 → 需要时写入 `CHANGELOG.md`。
- 运行时参数/数值只改代码或 CONFIG，不把数字镜像到文档。

以上是 owner routing，不要求每类任务都更新文档。事实未变时不修改项目文档；未确认 WIP 不升级为正式事实；CHANGELOG 不是逐任务日志。不要为此预读全部 docs，只在影响存在或 owner 不明确时读取必要文件。
