# docs/README.md · 文档入口

> 日常只读短入口；历史资料按需追溯。

> 分类口径：当前入口用于日常执行；专项资料按任务读取；归档资料只用于追溯。仓库内 `_exports/` 是导出副本，不是真理源，也不纳入默认阅读范围。

## 正式入口

- `PROJECT-BRIEF.md`：3 分钟项目简报，适合发给 ChatGPT 总控窗口。
- `CHATGPT-CONTROL.md`：当前 ChatGPT 总控资料包入口，统筹优先级与任务分流。
- `PROJECT-STATUS.md`：当前状态、阻塞、近期待办。
- `DEBT.md`：当前开放问题台账。
- `ARCHITECTURE.md`：架构和模块职责。
- `workflow.md`：Git、代理、调参、多窗口、文档治理细则。
- `DOCUMENT-RETENTION.md`：历史资料取舍表。
- `AI-COLLABORATION.md`：AI角色分工和工作流。
- 根目录 `CHANGELOG.md`：已落地版本变更摘要；只在版本回顾或更新日志任务中读取。

## 计划与验收

- `plans/STATUS.md`：计划文件总索引。
- `plans/README.md`：计划目录规则。
- `plans/archive/`：已落地计划。
- `plans/deprecated/`：被推翻或过时方案。
- `plans/diagnosis/`：诊断结论。

## 历史与设计

- `RETRO.md`：跨会话踩坑教训。
- `archive/`：旧审查等历史证据。
- `releases/`：封版、交接和版本快照。
- GDD 设计意图文档：玩法与叙事规划依据。
- `design/WORLD-BIBLE.md`：世界观真理源。
- `design/ART-BIBLE.md`：全局视觉风格真理源。
- `design/ASSET-SPEC.md`：美术资源技术生产与接入真理源。
- `design/BOSS-冠夜鸮-视觉设计规范.md`：冠夜鸮视觉生产规范。
- 旧 UI 图标规范：规则已迁移至 `ART-BIBLE.md` 与 `ASSET-SPEC.md`，不作为正式真相源。
- 旧数值文档：历史镜像；当前运行时以 `snake55/02_config.js` 为准。
- `RETRO`、`HANDOFF`、`RELEASE` 和归档资料只用于追溯，不定义当前执行权限。

## 推荐阅读顺序

### 日常执行

只读 `AGENTS.md`、当前任务相关文件和当前任务需要的专项真理源；不默认读取完整状态、计划、GDD 或历史资料。

### 总控规划

1. `AGENTS.md`
2. `CHATGPT-CONTROL.md`
3. `PROJECT-BRIEF.md`
4. `PROJECT-STATUS.md`
5. `DEBT.md`
6. `plans/STATUS.md`
7. 当前 GDD 设计意图文档

### 专项任务

按任务读取 `design/`、`audio/`、`qa/`、`plans/` 中的对应资料；不顺带扫描其他专项目录。

状态、开放债、历史资料和计划索引仅在任务相关时读取。

总控规划任务：

1. `docs/CHATGPT-CONTROL.md`
2. `docs/PROJECT-BRIEF.md`
3. `docs/PROJECT-STATUS.md`
4. `docs/DEBT.md`
5. `docs/plans/STATUS.md`
6. GDD 设计意图文档

视觉、UI、美术任务：

1. `design/ART-BIBLE.md`
2. `design/ASSET-SPEC.md`
3. 涉及世界设定时再读 `design/WORLD-BIBLE.md`
4. 涉及冠夜鸮时再读 `design/BOSS-冠夜鸮-视觉设计规范.md`
