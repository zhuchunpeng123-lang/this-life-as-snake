# ARCHITECTURE.md · 架构概要

> 本项目是无构建的原生 JavaScript 游戏。架构优先保持简单、显式、可静态审查。

## 加载模型

- `snake55/index.html` 按固定顺序加载脚本。
- 禁止 import/export。
- 模块通过 `window` 暴露全局对象。
- 改任意 JS 后必须同步更新所有脚本 `?v=` 缓存戳。

## 层级

| 层 | 文件 | 职责 |
|---|---|---|
| L1 数据 | `02_config.js` | 配置与数值落点，业务数值从 `CONFIG` 读取 |
| L3 引擎 | `03_core.js` | Bus、Registry、Formula、GS、对象池、自检 |
| L3 碰撞 | `04_collision.js` | SpatialHash、碰撞查询 |
| L5 粒子 | `05_particle.js` | 粒子、飘字、光束、爆环与特效预算 |
| L5 蛇 | `06_snake.js` | 蛇身、移动、转向、受击 |
| L5 敌人 | `07_enemy.js` | 敌人 AI、Boss、弹幕、训练假人 |
| L5 技能 | `08_skill.js` | 技能、Combo、伤害包装 |
| L5 波次 | `09_wave.js` | 波次、拾取、技能球、危险偏向 |
| L5 音频 | `10_audio.js` | Web Audio BGM 与音效 |
| L6 渲染 | `11_render.js` | Canvas 渲染、相机、精灵、调试绘制 |
| L5 UI | `12_ui.js` | HUD、按钮、移动端遮罩 |
| L7 调参 | `13_editor.js` | GM 面板、运行时调参桥 |
| 入口 | `14_main.js` | fixed-step 主循环、输入、启动 |
| L7 性能 | `15_profiler.js` | 性能日志 |
| L5 经济 | `16_skill_econ.js` | 技能经济诊断 |

## 核心约定

- 系统间优先通过 `Bus('system:action')` 通信。
- 伤害统一经 `Core.Formula.damage(base, GS.segments, crit)`。
- 技能层用 `hurt()` 包装伤害，不让下游各算各的。
- DOT 只结算血量和飘字，不触发击退/硬直/闪白。
- `03_core.js` / `04_collision.js` 是底层，默认不动。

## 已知架构风险

- CONFIG 深冻结实际未递归生效，需专项处理。
- RT 调参桥存在单位/索引双口径，需要加护栏。
- AOE 命中口径不统一，涉及手感与数值平衡，不能静默修。
- dev-only 工具未隔离，是发布前硬阻塞。
