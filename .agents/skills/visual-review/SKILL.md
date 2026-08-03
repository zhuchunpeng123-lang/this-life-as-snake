---
name: visual-review
description: Use for browser-visible changes in 此生为蛇, including UI, art integration, animation, VFX, responsive layout, and interaction feedback. Run the game, inspect the rendered result, and return reviewable visual evidence before claiming completion.
---

# visual-review

1. Understand the visual goal, affected scenario, and acceptance criteria; preserve unrelated WIP.
2. Run `snake55` over HTTP using the existing project method or the simplest reliable local server. Confirm that the app loads, the game Canvas exists, and no blocking boot or console error is present.
3. Choose the smallest evidence set that can reliably prove the task:
   - use matched before-and-after evidence when changing an existing visual state;
   - use the requested viewports for responsive work;
   - use key moments or a short recording only when motion cannot be judged from one frame.
4. Reproduce a stable and comparable state. Use an available debug freeze or Canvas capture method when animation makes capture unreliable; do not let a pause overlay hide the scene being reviewed.
5. Make the scoped change and run the relevant code and functional checks.
6. Capture the result under comparable conditions, inspect the evidence directly, and judge it against the requested visual outcome—not merely whether the code ran.
7. If a clear, safe, in-scope defect remains, make at most one autonomous correction and check the result again.
8. In the final response, display or attach the evidence and summarize the visible result, completed checks, and remaining uncertainty. Do not provide only local file paths.
9. If the evidence is unavailable or inconclusive, report that visual acceptance is blocked; do not claim completion or recommend Push.
