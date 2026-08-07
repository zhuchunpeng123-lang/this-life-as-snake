# Art Pass Readiness Map

本表是未来替换最终美术时的工程接入地图，不决定任何艺术方向，也不授权改变 Gameplay 或 HUD 几何。

| Surface | Asset / code owner | 当前显示与 anchor | Layer | 可调 presentation config | 人工决定 / 风险 |
| --- | --- | --- | --- | --- | --- |
| Player head | `snake_head.png`, `11_render.js` | `headRadiusRender=28`，头部中心随插值位姿旋转 | world entity | `STYLE.player*`、`RENDER` sprite metric | 必测 Alpha BBox、optical center、头身衔接；不得改碰撞半径。 |
| Player body/tail | `11_render.js` 程序绘制 | `bodyRadius` 跟随 segment | world entity | `STYLE.player/playerHi` | 新蛇身素材需验证首节衔接与转向 pivot。 |
| Skill icons | `STYLE.UI.icons.assets`, `12_ui.js` | 固定 HUD / Combo icon cell | frozen UI | icon asset source 与 per-kind scale | UI 几何已人工校准；换 skin 必须重做人工校验。 |
| Bolt / burning dart | `05_particle.js`, `assets/vfx/*` | world dart size / target follow | combat above entity | skill-local dart constants；通用文字 tokens | 飞镖 WIP 冻结；替图只审 asset bbox、anchor、移动目标落点。 |
| Fire / ice / shield / lightning | `05_particle.js` / `11_render.js` | 各自程序 VFX 与 marker | combat | `STYLE.skillFx`、`combatFx` 通用 token | 元素身份和已收敛电系形态不可被通用化抹平。 |
| Enemies | `assets/enemy_*`, `11_render.js` | `radius × spriteVisualScale`，实体中心 | world entity | `RENDER.spriteVisualScale`、`combatFx.hpBar/statusIcon` | 换图前需核对 bbox、optical center、HP/status 层级。 |
| Boss | boss idle/charge assets, `11_render.js`, `12_ui.js` | 专属 sprite metric 与顶部 Boss UI | boss / frozen UI | boss asset metric；不改 Boss UI 几何 | Idle/Charge 主体尺寸和 pivot 必须人工复核。 |
| HUD / panels | `assets/ui_*`, `12_ui.js` | 已校准 DOM geometry | UI | skin asset source only | 不得通过本地图调整列、offset、生命/Stage/Combo/Boss 布局。 |

## Integration checklist

每个新 PNG/WebP 先记录源画布、Alpha BBox、主体占比、safe area、optical center、anchor/pivot、运行时显示尺寸与 fallback。随后在人类主导的真实战场测试遮挡、移动目标、桌面和移动端。若需要调整只动明确资产入口与 presentation config，禁止以资产替换为由修改碰撞、伤害、波次或 UI 几何。
