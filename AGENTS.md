# 《此生为蛇》Codex 项目规则

本文件是每次任务的最小工程入口；当前用户指令优先，当前 worktree 与源码优先于历史文档。

## 1. 读取与范围

- 默认读取本文件、当前任务直接相关的源码和文档；只有涉及当前完成度、WIP、开放问题、发布或跨模块决策时才读取 `docs/STATUS.md`。不默认扫描 archive、旧报告或历史计划。
- 保护既有 staged、unstaged 和 untracked WIP；不得为获得干净基线而覆盖、回滚、stash 或混入无关修改。
- 只修改任务直接相关内容；发现无关问题先报告。

## 2. 工程契约

- `snake55/index.html` 的脚本加载顺序是硬契约；不引入 `import/export`，模块通过 `window` 全局连接。
- 运行时业务数值以 `snake55/02_config.js` 为唯一入口；不要在业务代码散落裸数值。
- 系统间通过同名 `Bus.on` / `Bus.emit` 事件通信；伤害统一经过 `Core.Formula.damage` 或既有技能包装；DOT 只承担既定持续伤害语义，不在表现层重算。
- `03_core.js`、`04_collision.js`、脚本加载模型、玩法/平衡方向和大范围迁移删除属于高风险范围，先说明影响与验收方式并等待确认。

## 3. 执行与验证

- 用户已明确授权的局部低风险任务可先做内部计划后连续实施；计划不自动构成等待关卡。
- 代码修改后按任务执行可用的语法、静态、功能或实机检查，审查实际 diff，并明确未验证事项。
- 正式落地的 JS 修改需要同步 `snake55/index.html` 的统一 `?v=` cache stamp；临时隔离实验除外。
- 用户提供精确 patch 时，先核对当前基线，使用 `git apply --check`；禁止 `--3way`、`--reject`、手工猜测合并或为应用 patch 回滚 WIP。
- 不在本规则中固化具体技能音色、VFX 造型、敌人分类、候选数量或历史成功方案。

## 4. 文档入口

- 项目定位与稳定产品事实：`docs/PROJECT.md`
- 当前状态、WIP、开放问题：`docs/STATUS.md`
- 稳定架构契约：`docs/ARCHITECTURE.md`
- 协作、Git、patch 与验收流程：`docs/WORKFLOW.md`
- 通用 QA 方法：`docs/QA.md`
- 设计意图：`docs/design/GDD.md` 与同目录领域文档
- 音频稳定原则：`docs/audio/AUDIO.md`
- 当前数值：`snake55/02_config.js`
- 历史资料：`docs/archive/`，默认不作为当前规则。
