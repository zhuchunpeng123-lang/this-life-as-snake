---
name: this-life-as-snake-vfx-implementation
description: Implement or debug battle skill and Combo visuals in 《此生为蛇》 after the visual direction is frozen. Use for Canvas VFX, PNG integration, layers, moving targets, hit feedback, level growth, performance, and verified patch application. Do not use to invent final art direction.
---

# VFX implementation workflow

## Required reads

1. `AGENTS.md`
2. `docs/design/ART-BIBLE.md`
3. `docs/design/ASSET-SPEC.md`
4. `docs/design/SKILL-VFX-GUIDE.md`
5. Current task brief
6. Relevant current source and assets

Read the electric retrospective only when the task involves similar layer, beam, moving-target, hit-flash, baseline, or handoff failures.

## Preconditions

- Confirm whether the task is:
  - Codex implementation; or
  - mechanical application of a ChatGPT verified patch.
- Never mix the two modes.
- Confirm Gameplay invariants and allowed files.
- If visual direction or final asset is not frozen, stop and report the missing decision.

## Code-chain review

Inspect as relevant:

```text
02_config.js
08_skill.js
05_particle.js
07_enemy.js
11_render.js
10_audio.js
index.html
```

Do not assume a Particle-only change is sufficient.

## Rules

- Keep PNG and program VFX responsibilities explicit.
- Draw a beam's outer layer, main line, core, and hit nodes as one logical unit unless a documented reason says otherwise.
- For moving targets, use target IDs for visual follow only; do not re-target or re-apply damage.
- Use source-specific hit feedback.
- Lv1 must be readable; Lv5 must show multi-dimensional growth.
- Set fixed maxima for targets, nodes, particles, and lifetimes.
- In dense mode, remove decoration before identity-defining feedback.
- Do not use per-frame random paths.
- Do not change Gameplay when it is frozen.

## Verified patch mode

- Check workspace and hashes.
- Run `git apply --check`.
- Stop on mismatch.
- Do not use `--3way`, `--reject`, manual conflict guessing, or full-file overwrite.
- Run specified checks and inspect actual diff.

## Definition of done

- Relevant JS syntax checks pass.
- Project static check passes.
- `git diff --check` passes.
- Actual changed files match scope.
- Gameplay invariants are unchanged.
- `index.html` cache stamps are updated when required.
- Report unverified real-device visual items honestly.
