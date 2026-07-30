# 《此生为蛇》5.5

网页版“贪吃蛇 + Roguelike + 叙事”融合原型。当前主线由 Codex 接手维护，正式工作区是本 Git 仓库。

## 快速入口

- 项目简报：`docs/PROJECT-BRIEF.md`
- 当前状态：`docs/PROJECT-STATUS.md`
- Codex 守则：`AGENTS.md`
- 当前开放问题：`docs/DEBT.md`
- 架构概要：`docs/ARCHITECTURE.md`
- AI 协作规范：`docs/AI-COLLABORATION.md`
- 视觉总规范：`docs/design/ART-BIBLE.md`
- 美术资源技术规范：`docs/design/ASSET-SPEC.md`
- 世界观与冠夜鸮视觉规范：`docs/design/`
- 文档目录：`docs/README.md`

## 运行

静态托管 `snake55/` 目录，然后浏览器打开 `index.html`。

移动端和 iOS standalone 测试必须走 http/https；`file://` 不能可靠验证音频手势解锁。

## 重要约束

- 无构建流程、无 import/export。
- 所有脚本由 `snake55/index.html` 顺序加载。
- 改任意 `snake55/*.js` 后必须同步 bump `index.html` 的 `?v=` 缓存戳。
- 代码改动前必须先按 `AGENTS.md` 出计划并等用户确认。

## 提交前静态检查

在提交前执行：

```bash
node tools/check-project.mjs
```

该检查不需要 `npm install`，用于校验 `snake55/*.js` 语法、禁止的模块语法、`index.html` 脚本顺序与缓存戳，以及正式 Markdown 入口的本地链接。退出码 `0` 表示全部通过，非 `0` 表示至少存在一项错误。

## Git

- 远程：`https://github.com/zhuchunpeng123-lang/this-life-as-snake.git`
- 主线：`main`
- Codex 接手标签：`codex-handoff-20260727`
