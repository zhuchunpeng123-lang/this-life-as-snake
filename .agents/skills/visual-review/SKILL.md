---
name: visual-review
description: Use only when the user explicitly invokes $visual-review for complex, high-risk, or difficult-to-judge browser-visible changes in 此生为蛇. Run the game, inspect the rendered result, and return minimal visual evidence before claiming completion.
---

# visual-review

- Trigger only on an explicit `$visual-review`. Do not use for routine UI adjustments, asset replacement, explicit reverts, or simple visual bugs.
- Understand the visual goal, affected scenario, and acceptance criteria; preserve unrelated WIP.
- Run `snake55` over HTTP, confirm the app loads, the game Canvas exists, and no blocking boot or console error is present.
- Choose the smallest reliable evidence set: matched before-and-after views, requested responsive viewports, or key moments/short recording when motion requires them.
- Reproduce a stable comparable state; use an available freeze or Canvas capture method when needed without hiding the scene under review.
- Make the scoped change, run relevant checks, inspect the evidence directly, and judge the rendered result rather than code execution alone.
- If a clear safe in-scope defect remains, make at most one autonomous correction and check again.
- Final output must display or attach the evidence, summarize the visible result, checks, and uncertainty; paths alone are insufficient.
- If evidence is unavailable or inconclusive, report visual acceptance as blocked; do not claim completion or recommend Push.
