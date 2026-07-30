# 《此生为蛇》ASSET-SPEC

版本：v1.0
状态：当前美术资源技术真理源

## 1. 通用资源规则

资源默认使用PNG和透明Alpha，不把背景色烘焙进角色或图标。

命名应体现对象、状态和用途，例如：

* `skill_fire.png`
* `enemy_wanderer.png`
* `enemy_boss_idle_v1.png`

源文件画布尺寸、Alpha Bounding Box、主体占比、四周安全边距、视觉中心和游戏内显示尺寸必须在接入前检查。相同画布尺寸不代表相同的实际角色大小。

## 2. 当前V1实际视觉基准

记录日期：2026-07-30。以下值来自当前 `snake55/02_config.js`、渲染/UI代码和仓库内现有PNG，用作当前V1的视觉参考基线或参考区间。

这些值不是玩法碰撞尺寸，也不是永不可改的硬编码规则。后续视觉升级可以调整，但应说明相对本基线的差异；碰撞、伤害和玩法数值仍按各自代码真源处理。

玩家蛇：

| 项目 | 当前基线 |
| --- | --- |
| 蛇身 | `PLAYER.bodyRadius=12px`，当前视觉直径约 `24px` |
| 蛇头 | `PLAYER.headRadiusRender=28px`，`getSpriteOff()`按 `2r` 绘制，当前PNG显示足迹约 `56×56px` |
| 蛇头资源 | `snake_head.png` 为 `1024×1024`，Alpha BBox约 `1024×1023`；`solidDiameterPx=612` 是历史量测记录，当前不驱动显示缩放 |

普通敌人：

| 类型 | CONFIG半径 | spriteVisualScale | 当前名义视觉直径 |
| --- | ---: | ---: | ---: |
| Wanderer | `10px` | `2.4` | 约 `48px` |
| Chaser | `11px` | `2.6` | 约 `57.2px` |
| Charger | `14px` | `2.5` | 约 `70px` |
| Elite | `24px` | `2.3` | 约 `110.4px` |

上述名义直径按 `radius × 2 × spriteVisualScale` 计算，实际主体还受PNG Alpha BBox影响。当前V1资源主体BBox分别约为：Wanderer `796×654`、Chaser `900×448`、Charger `743×605`、Elite `845×757`（均来自 `1024×1024`源画布）。

Boss：

| 状态 | Alpha主体BBox | 当前scale | 当前名义画布显示直径 | 当前主体投影参考 |
| --- | ---: | ---: | ---: | ---: |
| Idle | `773×790` | `2.2` | 约 `264px` | 约 `199×204px` |
| Charge | `810×556` | `3.37` | 约 `404.4px` | 约 `320×220px` |

Boss表按当前 `radius=60px` 和渲染公式 `radius × 2 × scale` 推导。Idle/Charge主体投影不代表碰撞范围；切换时仍以头部、躯干核心视觉连续为验收标准。

UI图标：

| 位置 | 当前icon cell | 当前统一padding | 当前kind scale |
| --- | ---: | ---: | ---: |
| HUD技能槽 | `30px` | `2px` | `1.1` |
| Combo | `26px` | `2px` | `1.0` |
| 三选一卡牌 | `34px` | `2px` | `1.0` |

单图资源仍可有独立scale修正，例如当前 `lightning=1.06`、部分Combo为 `0.97`或`1.06`。这些是视觉校准，不改变icon cell的几何职责。

## 3. 几何术语

Asset-level 指资源本身：

* Alpha BBox：非透明像素包围盒。
* optical center：主体视觉重心，不一定等于画布几何中心。
* safe area：主体与画布边缘之间的安全区域。
* source scale：源画布中主体所占比例。

Component-level 指接入UI或场景后的组件：

* icon cell：固定的图标容器区域。
* image scale：图片在容器内的显示倍率。
* padding：容器内边距。
* overlay badge：等级、状态等独立角标。
* text：名称、等级和说明文字。

明确规则：**PNG/Alpha主体居中 ≠ 接入UI后一定居中。**

UI接入时，图标必须在独立 icon cell 内居中；等级数字、角标、标签和文字不得参与图标本体的几何居中计算。

## 4. UI图标

标准源画布：512×512，透明Alpha，主体建议占画布约70%～80%，四周安全边距尽量统一。

图标应保持统一视觉重量，不按原始PNG画布像素机械决定大小。接入时分别校准主体BBox、optical center、image scale和padding。

显示原则：

* HUD技能槽使用固定 icon cell，图标独立居中，等级使用独立 overlay badge。
* 三选一卡牌使用相同的图标居中规则，文字和效果不挤压图标。
* Combo区使用统一 icon cell、图文间距和垂直对齐；Combo图标不能因为胶囊尺寸变化而失去层级。
* 32px、48px、64px等实际尺寸需检查识别度、描边和发光重量。

PNG画布相同不等于实际视觉大小相同，必要时只能通过不改变宽高比的scale、padding和轻量位置补偿校准。

## 5. 普通敌人

标准源画布：1024×1024，透明Alpha，统一安全边距和基础视觉中心。

游戏内实际显示尺寸按敌人身份、主体BBox和视觉重量校准，不按原始画布机械缩放。

重点检查：

* 细长部位不能导致视觉中心漂移。
* 宽腿、尖刺、触角等外扩结构不能让主体被错误缩小。
* 透明边缘不得残留不属于角色的杂色或绿边。

## 6. Boss

同一Boss的多状态资源必须检查：Alpha BBox、头部尺寸、核心躯干宽高、视觉中心和 anchor/pivot。

核心主体尺寸差异目标控制在约±5%以内，翅膀等动作外扩区域除外。明确：**同样1024×1024 ≠ 实际角色一样大。**

Idle、Charge等状态切换前，以头部和躯干核心的连续性校准scale；动作外扩不得破坏Boss层级和碰撞视觉对应关系。详细冠夜鸮DNA见 Boss专项文档。

## 7. 玩家蛇

蛇头PNG与程序蛇身、未来蛇尾必须共享可校准的视觉接口：

* 头部主体宽度与第一节蛇身自然衔接。
* anchor/pivot应保持转向时的视觉中心稳定。
* 透明边距不能造成头身断层或漂移。
* 游戏内显示尺寸以主体BBox和连接处连续性为准，不以PNG外框直接决定。

## 8. 接入检查

资源接入前至少记录：源画布尺寸、Alpha BBox、主体占比、optical center、safe area、anchor/pivot和最终显示scale。

资源加载失败时必须保留已有fallback，不得因为单个PNG缺失导致对应UI或角色消失。
