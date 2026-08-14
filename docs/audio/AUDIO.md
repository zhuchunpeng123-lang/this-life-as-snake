# 《此生为蛇》音频规范

## 当前状态

当前音频是可工作的 baseline：BGM、UI、战斗 SFX、事件路由、暂停/死亡/重开和基础移动端解锁路径已经存在。BGM 可继续作为当前基线使用，但整体声音不是最终 creative golden master；Skill / Combo SFX 明确允许未来重新设计。

精确实现以 `snake55/10_audio.js` 和当前事件来源为准。本文件不复制易漂移的完整 event matrix、当前 oscillator 配方或某个版本的音频参数。

## 声音职责

声音优先服务：生存信息、操作确认、技能/Combo 身份和情绪质感。声音数量不等于品质；高密度战斗中应优先保护危险、玩家受伤、关键技能和重要结果，主动牺牲低价值重复事件。

整体声音应延续“夜庭生命”的高层幻想：深色、克制、带生命感与危险感，但具体音色由当前专项目标和真实设备验收决定，不由历史技能案例永久锁定。

## 工程原则

- 每个语义事件有明确 owner；避免 generic hit 与 dedicated skill/combo 声音意外双播。
- Gameplay 发出语义事件，音频模块负责声音身份、优先级、节流、voice budget 和混音；音频不反向改变伤害、目标和波次。
- 处理完整生命周期：unlock、pause、resume、death、restart、mute 和后台/页面状态。
- 密集事件按 priority、density 和 voice budget 管理；不靠持续增大音量解决信息冲突。
- BGM 与 SFX ownership 清楚；普通命中和持续 DOT 不应造成持续 pumping 或声音墙。
- 手机单扬声器仍应读出关键事件，耳机不应因持续尖锐高频产生疲劳。
- 新事件先回答它提供什么决策信息、是否已有 owner、属于哪个 bus/priority、密集时是否可牺牲，再接入代码。

## 修改边界

音频实现通常集中在 `10_audio.js`，相关 gameplay 模块只提供语义事件。不要为改音频顺手改变 CONFIG gameplay 数值、伤害管线、VFX 机制或 UI 逻辑；如确需跨边界修改，按 `AGENTS.md` 和 `docs/WORKFLOW.md` 单独说明。

具体 Lightning、Electro、Fire 或其他技能的创意声音不是本规范的永久答案。通过代码检查后，桌面、手机外放和 standalone 的最终听感仍由用户验收。
