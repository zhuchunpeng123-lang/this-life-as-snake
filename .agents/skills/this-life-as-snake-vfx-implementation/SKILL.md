---
name: this-life-as-snake-vfx-implementation
description: Implement or debug browser-visible battle skill and Combo VFX in 此生为蛇 after the current visual direction and asset scope are clear. Use for Canvas VFX, PNG integration, motion, hit feedback, level readability, performance, and verified implementation patches; do not use historical skills as final art direction.
---

# VFX implementation

## Scope and context

Use for skill, Combo, projectile, beam, area, summon, hit, status, and battle feedback presentation. Read `AGENTS.md`, the current task, `docs/design/ART-BIBLE.md`, and relevant source/assets. When the task adds or replaces an asset, also read `docs/design/ASSET-SPEC.md`; when it changes hit, damage, or status feedback, also read `docs/design/COMBAT-FEEDBACK-GRAMMAR.md`; when it depends on current WIP or acceptance state, read `docs/STATUS.md`.

## Workflow

1. Understand the current mechanic and build the complete mental sequence: `trigger → appear → attack → hit → end`.
2. Separate Gameplay from Presentation. Do not let VFX retarget, re-apply damage, change timing, or become a second gameplay truth source.
3. Define the visual identity for this task from current evidence; do not copy a historical skill’s exact shape, color, node layout, or motion as a universal answer.
4. Check real scale, motion, target follow, density, occlusion, level growth, and identity hierarchy in the actual scene.
5. Keep PNG/resource and program VFX responsibilities explicit; implement the smallest reliable layer set.
6. Check particle, text, beam, node, lifetime, and dense-mode budgets; remove decoration before identity-defining feedback.
7. Run relevant syntax/static/functional checks and conduct an adversarial review for readability, performance, and gameplay leakage.

## Visual evidence

Only when the user explicitly asks Codex for browser visual evidence should Codex run the game, capture/read screenshots or recordings, and self-review the rendered result. Otherwise complete engineering verification and mark final visual acceptance as user real-device acceptance. If requested evidence is unavailable or inconclusive, report visual acceptance as blocked.

## Patch safety and done

For an approved patch, verify the current worktree and anchors, run `git apply --check`, do not use `--3way`, `--reject`, manual conflict guessing, or rollback unrelated WIP, then inspect the final diff. Done means scoped files only, gameplay invariants preserved, relevant checks passed, and remaining visual uncertainty stated.
