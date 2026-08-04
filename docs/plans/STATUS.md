# docs/plans/STATUS.md · 计划文件总索引

> 本文件是 `docs/plans/` 的唯一索引。新增、归档、废弃计划时先更新本表，再移动文件。

## 状态图例

- ✅ `archive/`：已落地或已验收，低频追溯。
- 🗑 `deprecated/`：判断被推翻或方法过时，保留少量作为反例。
- 🔍 `diagnosis/`：只诊断不改码，结论已吸收。
- 🟡 根目录：当前仍需跟进、拍板或用户复验。

## 当前 active

| 文件 | 状态 | 下一步 |
|---|---|---|
| [④-B-屏震打击感精修.md](./④-B-屏震打击感精修.md) | 🟡 待办 | 可被后续总控优化路线重新评估 |
| [B-TUNE-dev-tools-gating.md](./B-TUNE-dev-tools-gating.md) | 🟡 已提交待用户验收 | 代码门控已在 HEAD；Release 默认 DEBUG 关闭，工作树开启是 WIP；按清单完成三组合复验后归档 |
| [B-TUNE-dev-tools-gating-测试清单.md](./B-TUNE-dev-tools-gating-测试清单.md) | 🟡 待复验清单 | 覆盖 Release/半开/Dev 三种 DEBUG 组合 |
| [mobile-touch-optim.md](./mobile-touch-optim.md) | 🟡 部分落地 | 移动端窄屏/表现微调后置 |
| [需求B-边缘撞墙回正.md](./需求B-边缘撞墙回正.md) | 🟡 已提交待用户实测 | 实现已在 HEAD；用户浏览器复验，绿后归档 |
| [需求B-边缘撞墙回正-测试清单.md](./需求B-边缘撞墙回正-测试清单.md) | 🟡 待实测清单 | 跟随需求B复验结果处理 |
| [IOS-STANDALONE-CHECKLIST.md](../qa/IOS-STANDALONE-CHECKLIST.md) | 🟡 基础对照已完成 / A 级待记录 | 基础 Safari/standalone 与静音条件已对照；A 级主流程待记录，B 级按音频/启动改动触发，C 级发布前或故障时执行 |

## 已归档

| 文件 | 状态 | 备注 |
|---|---|---|
| [static-check-project.md](./archive/static-check-project.md) | ✅ | 最小静态检查脚本已落地并完成用户验收 |
| [static-check-project-test-checklist.md](./archive/static-check-project-test-checklist.md) | ✅ | 基线与五类故障注入均通过 |
| [2026-07-20-perf-fps28.md](./archive/2026-07-20-perf-fps28.md) | ✅ | 性能根治实测 |
| [2026-07-20-perf-rootcause.md](./archive/2026-07-20-perf-rootcause.md) | ✅ | 性能根因提炼 |
| [2026-07-20-round6-cleanup.md](./archive/2026-07-20-round6-cleanup.md) | ✅ | 推翻 round5 误判 |
| [2026-07-20-view-scale-and-dot.md](./archive/2026-07-20-view-scale-and-dot.md) | ✅ | worldScale 与 DOT 语义 |
| [B-4-测试清单.md](./archive/B-4-测试清单.md) | ✅ | Combo 视觉测试 |
| [④-蒸汽状态引爆-计划.md](./archive/④-蒸汽状态引爆-计划.md) | ✅ | 已落地实测绿 |
| [④-蒸汽状态引爆-测试清单.md](./archive/④-蒸汽状态引爆-测试清单.md) | ✅ | 已落地测试清单 |
| [⑥-冰冻机制重做-计划.md](./archive/⑥-冰冻机制重做-计划.md) | ✅ | 已落地，用户确认完成 |
| [需求AUDIO-程序化BGM系统v3.md](./archive/需求AUDIO-程序化BGM系统v3.md) | ✅ | BGM v3 已落地 |
| [需求AUDIO-程序化BGM系统v3-测试清单.md](./archive/需求AUDIO-程序化BGM系统v3-测试清单.md) | ✅ | BGM v3 测试清单 |
| [需求AUDIO-音效优化与BGM关系治理.md](./archive/需求AUDIO-音效优化与BGM关系治理.md) | ✅ | 音效与 BGM 治理已落地 |

## 废弃 / 诊断

| 文件 | 状态 | 备注 |
|---|---|---|
| [2026-07-20-round5-revert.md](./deprecated/2026-07-20-round5-revert.md) | 🗑 | 被 round6-cleanup 推翻 |
| [b9-diag-test-script.md](./deprecated/b9-diag-test-script.md) | 🗑 | 被 `15_profiler.js` 自动日志取代 |
| [2026-07-20-fps-regression-diagnosis.md](./diagnosis/2026-07-20-fps-regression-diagnosis.md) | 🔍 | 结论：掉帧来自未提交 WIP，非 committed baseline |

## 归档约定

1. 新计划先登记到 active。
2. 落地并确认后移入 `archive/`。
3. 被推翻后移入 `deprecated/` 并说明原因。
4. 只诊断不改码的文件移入 `diagnosis/`。
5. 每个计划尽量自带验收方式，方便浏览器手测和静态审查。
