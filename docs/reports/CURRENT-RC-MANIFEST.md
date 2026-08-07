# Current RC Manifest

## Current RC

Contains pre-existing user documentation WIP, Presentation Foundation v2, Run Experience / Autonomous Production changes, the subsequent fire/ice/shield/steam visual bug repair, and the post-repair ranged VFX audit for bolt, burning barrage, electro turret, and lightning. Detailed attribution: `CODEX-GOAL-CHANGE-AUDIT.md`.

## Known Good

- JavaScript syntax checks passed for all currently modified gameplay-facing scripts.
- `node tools/check-project.mjs` passed, including script-order/module/cache-stamp checks and Presentation Foundation guard.
- `git diff --check` passed.
- Local desktop controlled combat runs and mobile landscape startup produced no fatal console error.
- Generated ice burst has transparent alpha; existing fire/shield art loads through safe fallbacks.
- Ranged VFX review passed static checks and controlled desktop runtime capture: lightning now uses fixed target-following jumps; projectile and electro changes are render-only.

## Needs Human Acceptance

- Combat readability during a real non-GM 15–25 minute run.
- Narrative queue, timeout, death/eulogy/scoreboard timing, and two-run state reset.
- Exact gameplay-strength equivalence for every skill, stage, enemy, and Boss.
- Steam trigger readability during real combat; automated capture can be obscured by transient upgrade/narrative panels.
- Real mobile landscape readability of the four ranged skills during a full run; controlled desktop captures are evidence, not a substitute for play.

## Known Issues

1. Combat testing uses a right-side lead composition, so controlled screenshots can clip the snake near the edge; this was not changed in this RC.
2. `05_particle.js` has legacy event branches unreachable after the new combat-text resolver; safe today, but cleanup is deferred.
3. Some GM visual captures can be obscured by automatic progression modals; use the checklist’s deterministic preview plus real run.
4. The right-side lead composition can clip the combat focus in automated desktop captures; it remains outside this frozen RC scope.

## Deferred

- Final Art
- UI Redesign
- Gameplay Balance
- Wave Balance
- Audio polish
