# 《此生为蛇》

网页端「贪吃蛇 + Roguelike 割草 + AI 叙事结算」项目，运行代码位于 `snake55/`。

## 快速入口

- 项目定位：`docs/PROJECT.md`
- 当前状态与开放问题：`docs/STATUS.md`
- Codex 工程规则：`AGENTS.md`
- 协作与验收：`docs/WORKFLOW.md`、`docs/QA.md`
- 稳定架构：`docs/ARCHITECTURE.md`
- 设计意图：`docs/design/GDD.md`
- 音频规范：`docs/audio/AUDIO.md`
- 当前运行时数值：`snake55/02_config.js`

## 运行

在 `snake55/` 上启动任意可靠的静态 HTTP 服务，再打开 `index.html`。移动端和 iOS standalone 验证必须使用 HTTP/HTTPS，不使用 `file://` 作为验收依据。

## 检查

```bash
node tools/check-project.mjs
git diff --check
```

检查器覆盖 JS 语法、模块语法、脚本顺序与 cache stamp、活动文档路径和治理入口回归；它不替代真实浏览器、移动设备或用户视觉验收。
