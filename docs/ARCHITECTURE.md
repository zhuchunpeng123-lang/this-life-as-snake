# 《此生为蛇》稳定架构契约

## 运行模型

- `snake55/index.html` 以固定顺序加载原生 JavaScript 文件；不使用构建流程、`import/export` 或模块打包。
- 各文件通过 `window` 暴露的全局对象连接；`14_main.js` 驱动 fixed-step 主循环和渲染调度。
- 运行时数值由 `snake55/02_config.js` 集中提供。设计文档描述意图，不回写或镜像运行时数值。

## 模块职责

| 层 | 文件 | 职责 |
|---|---|---|
| 数据 | `02_config.js` | CONFIG、表现配置、运行时开关和资源入口 |
| 引擎 | `03_core.js`、`04_collision.js` | Bus、Registry、Formula、GS、对象池、空间哈希与基础碰撞 |
| 系统 | `05_particle.js`、`06_snake.js`、`07_enemy.js`、`08_skill.js`、`09_wave.js`、`10_audio.js`、`12_ui.js`、`16_skill_econ.js` | 粒子、玩家、敌人、技能、波次、音频、UI、经济 |
| 表现 | `11_render.js` | Canvas 场景、HUD、实体和战斗反馈绘制 |
| 调试 | `13_editor.js`、`15_profiler.js` | 受开关保护的调试、运行时观察和性能信息 |
| 入口 | `14_main.js` | 初始化、输入、固定步进和循环编排 |

## 通信与伤害

- 系统间使用语义事件通信；新增事件必须保持 `Bus.on` 与 `Bus.emit` 名称一致，避免跨层直接调用。
- 伤害进入统一的 `Core.Formula.damage` / 既有 `hurt` 或技能包装；表现层只消费事件和元数据，不重新结算伤害。
- `isDot=true` 表示持续伤害语义：按既有 DOT 聚合和来源规则结算，不触发普通击退、硬直或闪白，除非当前玩法契约明确规定。
- 目标 ID、命中来源、技能等级等元数据可以供音频和 VFX 使用，但不得借表现事件重新触发 gameplay。

## 表现与资源边界

PNG/静态资源负责身份、姿态和基础材质；Canvas、粒子和音频负责运行时节奏、命中、状态与层级。资源入口由 CONFIG 或对应表现模块引用，具体资产状态以当前文件和代码为准。

当前 bug、WIP、发布阻塞和待用户验收项统一记录在 `docs/STATUS.md`，不在本架构文档复制进度表。
