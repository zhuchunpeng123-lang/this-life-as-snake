# Codex Goal Change Audit

Baseline: `ed316f8` (`feat: apply dart v5.2 battle cohesion`). Evidence includes the pre-autonomous snapshot in `../autonomous-production-wip-snapshot/`, final binary snapshots in the repository parent, current diff, static checks, and local runtime runs. Historical patches were inspected only; none was applied.

## A. User WIP before all Goals

| Files | Purpose | Still present | Dependency / risk | Recommendation |
|---|---|---|---|---|
| `CHANGELOG.md`, `docs/CHATGPT-CONTROL.md`, `docs/DOCUMENT-RETENTION.md`, `docs/PROJECT-STATUS.md`, `docs/README.md`, `docs/RETRO.md`, `docs/workflow.md`, documented archive/release moves | User documentation and retention work | Yes, staged byte-for-byte unchanged from the pre-autonomous snapshot | Independent of both Goals; attribution is confirmed by `staged.patch` | Preserve |

## B. Presentation Foundation v2

| Files / functions | Purpose | Still present | Dependency / risk | Recommendation |
|---|---|---|---|---|
| `snake55/02_config.js` `STYLE.combatFx.text`, HP/status policy | Semantic combat-text tokens; presentation-only HP/status policy | Yes | No damage formula or skill values changed; pre-presentation snapshot is absent | Keep; human acceptance required |
| `snake55/05_particle.js` `resolveCombatText`, `enemy:hit`, `snake:hurt` | Routes text by semantic role and suppresses source-label noise | Yes | Presentation handler has early returns over legacy code; runtime works but legacy dead branches should be cleaned in a future refactor, not during RC | Keep |
| `snake55/07_enemy.js` `lastVisualHitSec` | Recent-hit display clock for normal enemy HP bars | Yes | Pool reset added; does not affect AI, damage, drops, or death | Keep |
| `snake55/11_render.js` `shouldDrawHpBar`, status marks | Draw-only HP/status policy | Yes | Depends on `lastVisualHitSec` | Keep |
| `tools/check-project.mjs` presentation guard | Detects missing presentation tokens/resolvers | Yes | Static coverage only | Keep |

`UNRESOLVED`: a repository-external pre-presentation patch was not found. The exact pre-autonomous unstaged snapshot proves the listed changes already existed before Autonomous Production, but cannot by itself prove that none overlapped with earlier user WIP.

## C. Run Experience / Autonomous Production

| Files / functions | Purpose | Still present | Dependency / risk | Recommendation |
|---|---|---|---|---|
| `snake55/02_config.js` `NARR.eulogyMinReadSec`, `chapterBeat*` | Run-flow timing and stage beats | Yes | Narrative-only timing | Keep pending human run-flow acceptance |
| `snake55/12_ui.js` narrative queue, result snapshot, chapter beat, scoreboard gate | Queues narrative choices, freezes world while choosing, snapshots results, delays scoreboard, resets run-local state | Yes | Depends on `14_main.js` status freeze contract; runtime choice appeared and no fatal console error was observed | Keep pending manual timing review |

## D. Bug Repair after the Goals

| Files / functions | Purpose | Still present | Dependency / risk | Recommendation |
|---|---|---|---|---|
| `snake55/02_config.js` `combatFx.fieldReadability`, `skillVfx` | Removes opaque fire/shield range overlays and centralizes VFX-only art parameters | Yes | Presentation only; no skill values changed | Keep |
| `snake55/05_particle.js` sprite bursts for ice/steam | Gives ice landing and steam trigger a short, bounded art-led read | Yes | Uses pooled burst state and config cap | Keep |
| `snake55/11_render.js` fire, ice, shield sprites | Uses existing fire/shield art and generated ice art instead of large generic shapes | Yes | Draw-only; asset-load fallback is safe | Keep |
| `snake55/assets/vfx/ice/vfx_ice_crystal_bloom_v1.png` | Generated chroma-keyed ice burst, alpha validated visually | Yes | New binary asset | Keep |
| `snake55/index.html` cache stamp | Uniformly reloads every script after JS change | Yes | Loading order unchanged | Keep |
| `snake55/02_config.js` `combatFx.skillVfx.ranged`, `VFX.electric` | Presentation-only tail, impact, deterministic lightning-kink, and electro-readability parameters | Yes | Does not overlap `CONFIG.SKILL` or `CONFIG.COMBO` gameplay values | Keep |
| `snake55/05_particle.js` ranged/electric draw paths | Fixed short target-following lightning kinks; bounded projectile tail/impact and turret backing-plate rendering | Yes | `fx:bolt`, `fx:burndart`, `fx:lightning`, and electro events retain their existing timing and payloads | Keep |
| `snake55/index.html` cache stamp + `docs/reports/RANGED-SKILL-VFX-ADVERSARIAL-REVIEW.md` | Reload guarantee and evidence-based review of bolt, burning barrage, electro turret, and lightning | Yes | Script loading order unchanged | Keep |

The temporary raw green-screen copy was removed after alpha processing; the source generated image remains outside the repository.

## E. Unresolved attribution

| Item | Evidence / status | Recommendation |
|---|---|---|
| `snake55/08_skill.js` appears modified in status but has no textual `git diff`, numstat, or raw diff | `UNRESOLVED`; do not normalize it during RC | Preserve as-is |
| `docs/design/ART-PASS-READINESS.md`, `COMBAT-FEEDBACK-GRAMMAR.md`, `PRESENTATION-DEBT-INVENTORY.md` | Untracked at audit time; no pre-task patch identifies their author | `UNRESOLVED`; preserve in checkpoint |

## Gameplay Difference Audit

### EXPECTED PRESENTATION CHANGE

- Combat text, HP-bar visibility, status-mark placement, field opacity, sprite drawing, steam/ice/fire/shield visual effects, narrative display flow, and cache stamps changed.
- The final ranged VFX audit changes only Canvas draw parameters and fixed visual geometry: bolt, burning barrage, electro turret, and lightning retain their gameplay event contracts and `CONFIG.SKILL` / `CONFIG.COMBO` values.
- Local controlled runs exercised five skills, single fire, single ice, single shield, steam preview, and mobile landscape startup. No fatal console errors were captured.

### UNEXPECTED GAMEPLAY CHANGE

No current-diff evidence of changed damage, CD, radius, DOT DPS, crit, targeting, enemy stats, spawn rate/cap, stage timing, skill economy, player movement, collision, or Boss gameplay was found. `03_core.js`, `04_collision.js`, and the textual contents of `08_skill.js` were not changed by this RC.

This is a diff audit, not a claim that balance has been playtested. Gameplay strength remains a human acceptance item.
