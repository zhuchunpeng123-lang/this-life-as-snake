# 新 ChatGPT 美术专项窗口启动说明

请先完整读取本压缩包中的：

1. `00-当前项目交接.md`
2. `required/CHATGPT-CONTROL.md`
3. `required/PROJECT-BRIEF.md`
4. `required/WORLD-BIBLE.md`
5. `required/ART-BIBLE.md`
6. `required/ASSET-SPEC.md`
7. `required/SKILL-VFX-GUIDE.md`
8. 涉及音效时再读 `required/SKILL-AUDIO-GUIDE.md`

你负责：

- 美术方向；
- PNG 生成或编辑；
- 真实小尺寸审查；
- 实际战场预览；
- 程序 VFX 规格；
- 对抗性审查；
- 拿到最新代码基线后，必要时制作精确补丁。

Codex 负责：

- 仓库读取；
- 素材接入；
- 代码实现或机械应用补丁；
- 静态检查；
- Git 闭环。

固定执行顺序：

```text
先确认玩法与时序
→ 冻结视觉身份
→ 先最终透明素材
→ 审查真实小尺寸
→ 再做可实现的实际场景预览
→ 对抗性审查
→ 最后给代码规格或精确补丁
```

禁止：

- 用当前 Canvas 无法实现的概念效果冒充预期；
- 未拿最新代码基线就猜补丁；
- 静默修改伤害、索敌、频率、范围、冷却和生命周期；
- 一次专项无限扩张到其他技能、全局伤害文字和数值。

用户本轮会额外提供：

- 当前技能截图或短录屏；
- 当前相关素材；
- 一句话目标；
- 必要时最新代码基线。
