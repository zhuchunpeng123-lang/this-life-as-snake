# docs/plans/ STATUS.md — 计划文件总索引

> 本文件是 `docs/plans/` 的**唯一总索引**。每次新增 / 落地 / 废弃计划，必须先更新本表，再动文件。
> 移动会断开文件间相对引用，故本表记录 supersede 关系与原始路径，保证跨文件可追溯（呼应 AGENTS §八 / §九）。

## 状态图例
- ✅ `archive/` 已落地：代码/配置已 commit，特性可用 → 落地后即移入并标记 ✅
- 🗑 `deprecated/` 废弃/被推翻：判断有误或被新方案取代，**保留不删**（git 可恢复 + 留作警示）
- 🔍 `diagnosis/` 诊断已结：仅排查未改码，结论已吸收
- 🟡 根目录 active：待办 / 被阻塞，留根目录持续跟进

## 索引（12 个计划文件）

| 文件 | 状态 | 处置 | 原始路径 | 互相关系 / 备注 |
|------|------|------|----------|----------------|
| [2026-07-20-perf-fps28.md](./archive/2026-07-20-perf-fps28.md) | ✅ 已落地 | archive/ | docs/plans/ | 与 perf-rootcause 互为「提案/实测两轮版」vs「根因提炼版」，同覆盖 07-20 性能根治（火墙单 path 2 stroke + 敌人批量 fill + 主循环丢追帧） |
| [2026-07-20-perf-rootcause.md](./archive/2026-07-20-perf-rootcause.md) | ✅ 已落地 | archive/ | docs/plans/ | 见上；另含自动性能日志（15_profiler.js） |
| [2026-07-20-round6-cleanup.md](./archive/2026-07-20-round6-cleanup.md) | ✅ 已落地 | archive/ | docs/plans/ | **supersedes** round5-revert（推翻其 viewZoom 误判）；已全盘核对 |
| [2026-07-20-view-scale-and-dot.md](./archive/2026-07-20-view-scale-and-dot.md) | ✅ 已落地 | archive/ | docs/plans/ | worldScale 视觉缩放 + 飘字提权 + DOT 叠加澄清 |
| [B-4-测试清单.md](./archive/B-4-测试清单.md) | ✅ 已落地 | archive/ | docs/plans/ | B-4 combo 视觉特性测试清单（B-4 已 commit baseline-b4） |
| [2026-07-20-round5-revert.md](./deprecated/2026-07-20-round5-revert.md) | 🗑 废弃 | deprecated/ | docs/plans/ | **superseded-by** round6-cleanup：误判「viewZoom 缩小增 overdraw」致错误回滚 |
| [b9-diag-test-script.md](./deprecated/b9-diag-test-script.md) | 🗑 废弃 | deprecated/ | docs/plans/ | 人工测量脚本法已被 `15_profiler.js` 自动日志取代，方法过时 |
| [2026-07-20-fps-regression-diagnosis.md](./diagnosis/2026-07-20-fps-regression-diagnosis.md) | 🔍 诊断已结 | diagnosis/ | docs/plans/ | bisect 排查；结论=掉帧为未提交 WIP，非 committed baseline；WIP 已 stash |
| [④-蒸汽状态引爆-计划.md](./④-蒸汽状态引爆-计划.md) | ✅ 已落地 | 根目录 | docs/plans/ | 13c2e53 已 commit + 用户浏览器实测绿；零新数值无需 §9 回写（早期"待 Notion 回写"预判已证伪） |
| [④-蒸汽状态引爆-测试清单.md](./④-蒸汽状态引爆-测试清单.md) | ✅ 已落地 | 根目录 | docs/plans/ | 随 ④ 已落地（实测绿） |
| [④-B-屏震打击感精修.md](./④-B-屏震打击感精修.md) | 🟡 待办 | 根目录 | docs/plans/ | ④ 已 commit 且实测绿，④-B 解除阻塞可推进（屏震四档已在 07-17 e5d3f7f 部分落地） |
| [⑥-冰冻机制重做-计划.md](./⑥-冰冻机制重做-计划.md) | ✅ 已落地 | 根目录 | docs/plans/ | 5777395 已 commit、数值已回写 §9；用户确认重做已完成 |

## 归档约定（防文件膨胀，详见 README.md）
1. 新增计划 → 建 `<需求名>.md` 并**立即在 STATUS.md 登记一行**（🟡 active）。
2. 落地（commit）→ 移 `archive/` 并改 ✅；前置未满足（如 §9 回写）→ 留 🟡 或转 🗑。
3. 被推翻/过时 → 移 `deprecated/` 并写明「被 X supersede / 为何废弃」，不默默删除。
4. 纯诊断 → 移 `diagnosis/`。
5. 移动前在「互相关系」列补 supersedes / superseded-by 与原始路径。
6. 每个计划/测试清单尽量自带验收标准 + 复现步骤。
