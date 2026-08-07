# Ranged Skill VFX Adversarial Review

Date: 2026-08-08

Scope: presentation-only audit of `bolt`, `burningBarrage`, `electroTurret`, and `lightning`. No damage, cooldown, range, targeting, enemy, wave, collision, or skill-economy code was changed.

## Style contract used

- Night-garden mutation language: rounded, readable life-energy forms; no realistic weapons or heavy cyberpunk machinery.
- Projectile family: lime crystal-leaf body establishes direction; burning barrage keeps that body and adds a controlled warm flame layer rather than changing the weapon family.
- Electric family: basic lightning is cold-blue/white, target-to-target, and visibly jumps; electro turret is a purple/cyan life-crystal ring with a clear charge and short salvo.
- High-density rule: preserve body, path, core, and impact; decoration may yield first.

## Findings and resolution

| Skill | Adversarial finding | Resolution | Gameplay impact |
| --- | --- | --- | --- |
| Bolt | Tail and leaf-cut impact were too brief to retain identity beside dense damage text. | Configured a brighter two-layer tail and a slightly longer, larger leaf-cut impact. | None. |
| Burning barrage | It risked reading as the same projectile with a color swap. | Kept the crystal-leaf silhouette, but strengthened only the warm tail, hot core, and embered impact rhythm. | None. |
| Lightning | Straight center-to-center segments read as geometric laser lines. | Added deterministic, endpoint-following short kinks. Paths do not randomize per frame and chain targets are unchanged. | None. |
| Electro turret | The transparent world PNG could lose its silhouette in a cluster and impacts ended too quickly. | Strengthened the restrained deep-blue backing plate and extended/enlarged the existing cold impact feedback. | None. |

## Evidence captured

- `ranged-vfx-lightning-baseline.png`: before, straight-line lightning presentation.
- `ranged-vfx-lightning-after.png`: after, fixed short jump geometry while retaining cold-blue/white core and endpoint linkage.
- `ranged-vfx-turret-baseline.png` and `ranged-vfx-turret-after.png`: turret deploy/salvo review in the same combat context.
- `ranged-vfx-burn-baseline.png` and `ranged-vfx-burning-after.png`: burning barrage review in the same combat context.

All captures are stored outside the repository under the Codex visualization session directory. They are evidence only, not game assets.

## Automated verification

```text
node --check snake55/02_config.js     PASS
node --check snake55/05_particle.js   PASS
node tools/check-project.mjs           PASS
git diff --check                       PASS
```

## Human spot check

1. Give only bolt Lv1, then Lv5: crystal leaf, tail, and leaf-cut must remain visible without a permanent beam.
2. Trigger burning barrage: it must read as the same crystal leaf ignited by a warm flame, not a different weapon or an opaque orange field.
3. Trigger lightning through a two-or-more enemy chain: every segment must bend once or twice, land on actual targets, and remain cold blue/white.
4. Trigger electro turret in a small enemy group: the crystal ring must stay legible behind its beams; fire impacts should be short, cyan-white, and not cover the player or HUD.

## Asset decision

The existing world PNGs were retained. Their alpha, silhouettes, material language, and family consistency passed review; replacement image generation would not improve the observed runtime problem. The changes therefore target only the missing programmatic motion and readability layers specified by `SKILL-VFX-GUIDE.md`.
