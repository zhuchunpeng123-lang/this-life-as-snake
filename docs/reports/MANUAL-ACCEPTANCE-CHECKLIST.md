# Manual Acceptance Checklist

Use a normal browser at `snake55/index.html`; for mobile, use landscape. Spend 15–25 minutes in the order below. Record PASS/FAIL against the current checkpoint.

## A — Presentation Foundation

| Test | Trigger | PASS | FAIL |
|---|---|---|---|
| Normal damage | Hit a non-lethal normal enemy | Small readable number appears without source-label spam | Missing, permanent, or screen-filling text |
| DOT | Keep an enemy in fire | Small periodic orange damage feedback, no knockback-style flash spam | No feedback or dense wall of labels |
| Crit | Obtain a crit-capable hit | Larger outlined critical number is clearly prioritized | Looks identical to DOT/normal text |
| Combo | Activate any combo and hit | Combo damage stays readable over VFX | Combo text is hidden by effect layers |
| Player hurt | Take one safe hit | Red player-damage feedback is visible | No feedback or normal-damage color |
| Slow / burn | Let an enemy enter ice then burn | Separate icy and flame status marks can coexist | Marks overlap HP bar or one silently disappears |
| Normal HP bar | Damage but do not kill a normal enemy | Bar shows shortly after hit, then fades | Permanent bar, no bar, or Elite/Boss policy changed |
| Elite HP bar | Damage an Elite | Damaged Elite bar remains appropriate | Ordinary enemy policy applied to Elite |
| Dummy | GM: spawn a dummy, damage it | Dummy bar remains readable | Bar missing or detached |
| Dense group | GM: five-skill + dummies | Damage, enemy, snake, and core effects remain distinguishable | One layer hides the combat state |

## B — Run Experience

| Test | Trigger | PASS | FAIL |
|---|---|---|---|
| Skill / narrative conflict | Cause a level choice near a narrative trigger | One modal resolves before the next; no overlap | Two choice layers compete |
| Narrative focus | Open narrative choice | World stops while choice is open | Enemies/time continue during choice |
| Choice timeout | Leave a narrative choice untouched | It resolves safely and play resumes | Soft-lock or repeated modal |
| Chapter beat | Reach stages 2–5 | Short beat appears without blocking controls | Persistent/blocking beat |
| Death still | Die normally | Death hold precedes flashback | Immediate score screen or frozen game |
| Flashback count | Finish a run with memories | 3–5 prioritized lines, no stale previous-run lines | Empty loop, too many lines, or prior-run leakage |
| Eulogy choice | Make a narrative choice then die | Latest choice is reflected once in eulogy | Choice absent, duplicated, or stale |
| Scoreboard timing | Die and wait / use 查看战绩 | Button can reveal score early; automatic score appears after eulogy | Scoreboard appears at 3s before eulogy or never appears |
| Replay | Use replay | New run clears result UI and input handlers | Old result/modal remains |
| Two consecutive runs | Replay once and repeat | No queued choice, chapter beat, or score data crosses runs | Any prior-run state leaks |

## C — Autonomous Skills (gameplay strength must not change)

| Skill | Original gameplay behavior | This RC only changes | Fast test | PASS | FAIL |
|---|---|---|---|---|---|
| fire | Body-adjacent DOT | Small anchored flame art; no opaque red field | GM fire Lv5 + dummy | Flames follow body; DOT behavior unchanged | Damage/range/CD differs or field hides play |
| ice | Periodic targeted slow/freeze pool | Ice crystal landing/core art | GM ice Lv5 + 5000 HP dummy | Crystal identifies pool center and edge still communicates area | Radius/slow/CD differs or pool is unreadable |
| shield | Orbiting contact damage | Shield entities replace generic hit circles | GM shield Lv5 + dummy | Orbiters are distinct and readable | Count/radius/contact behavior changes |
| steamExplosion | Fire hits ice-slowed enemy | Short orange/cyan trigger burst | GM five skills + dummies; use VFX preview for timing | Trigger is visibly distinct without white-out | No trigger, white-out, or changed damage/radius/cooldown |

If any FAIL changes gameplay strength, stop and report it before changing numbers.
