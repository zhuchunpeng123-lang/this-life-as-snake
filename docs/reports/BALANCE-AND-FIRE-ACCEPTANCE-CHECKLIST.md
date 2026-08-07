# Balance and Fire Acceptance Checklist

Use a fresh normal run. Do not enable GM overrides or change any CONFIG values. The intended run window is 5–8 minutes; record PASS/FAIL beside every item.

## A. Wave flow and enemy health

### 1. Protection phase (0–25 seconds)

Trigger: Start a new run and play normally until the stage changes.

PASS: Wanderers are readable single targets, the player gets the first skill choice without panic movement, and no wall of enemies forms before the build exists.

FAIL: The player is forced to kite constantly before the first choice, or ordinary enemies take so long to kill that the first skill has no visible payoff.

### 2. Growth phase (25–95 seconds)

Trigger: Continue with any legal three-choice selections. Fight both Wanderers and Chasers.

PASS: A level-1 attack skill starts clearing ordinary enemies in a few meaningful hits; upgrades create noticeable relief without making movement irrelevant.

FAIL: Every monster feels like an Elite, or the screen is already empty with no need to route or dodge.

### 3. Mowing phase (95–215 seconds)

Trigger: Reach the stage labelled 割草期 with at least two owned skills.

PASS: Packs visibly break when a build comes online, but Chargers and Elites still make the player reposition. The screen feels busy rather than clogged by long-lived health bars.

FAIL: There is no crowd to mow, or a dense pack becomes an immovable damage sponge despite a developed attack skill.

### 4. Climax phase (215–300 seconds)

Trigger: Reach 高潮期 and survive one continuous minute.

PASS: Threat returns through a visibly denser field; active steering and target routing matter, while normal enemies remain killable at a satisfying cadence.

FAIL: The phase is easier than 割草期, or the pressure comes only from enemies absorbing damage for too long.

### 5. Boss boundary

Trigger: Reach the Boss phase.

PASS: Boss health and phase behavior remain recognizably deliberate; it is not erased instantly by the normal-pack changes.

FAIL: Boss dies in a few routine attacks, or a normal-monster change has visibly altered its phase timing.

## B. Combo economy and strategic ceiling

### 6. Focused shared-Fire build

Trigger: Whenever offered, prioritize Fire, Bolt, and Ice; otherwise choose the lowest-level offered skill. Record every upgrade choice through 420 seconds.

PASS: The run provides roughly 14–16 total skill choices. A focused player can normally complete one Combo before or around the Boss boundary and can complete Steam Explosion plus Burning Barrage by the end because they share Fire. All three Combos do not naturally complete.

FAIL: All three Combos routinely cap without deliberate luck/strategy, no Combo can reasonably complete in a focused run, or fewer than about 13 choices appear in a healthy full run.

### 7. Non-focused build

Trigger: In a second fresh run, select a mix of attack and survival skills rather than forcing Fire/Bolt/Ice.

PASS: The run stays viable, but the player cannot accidentally cap every Combo. Choice tension is preserved.

FAIL: Generalist picks make the run unwinnable before the Boss, or the build still fills all Combo requirements automatically.

## C. Burning Barrage progression

### 8. Level 1 shared Combo

Trigger: Obtain Fire 1 and Bolt 1, then fight a durable target.

PASS: Three warm darts arrive before the burn marker/damage begins; the target receives a readable, modest three-second burn.

FAIL: The burn begins before the dart arrives, no burn occurs, or the Level 1 Combo instantly deletes Elites.

### 9. Level 5 shared Combo

Trigger: In a focused run, raise both Fire and Bolt toward level 5, then compare a durable target with the Level 1 test.

PASS: The burn is clearly stronger than Level 1 and contributes to late crowd clearing, but elite/boss encounters still require movement and repeated skill cycles.

FAIL: Damage is indistinguishable from Level 1, becomes zero/NaN, or single bursts erase Boss gameplay.

## D. Fire field readability

### 10. Fire level 1, movement and turns

Trigger: Take Fire, move in a wide curve and then a sharp turn near an enemy.

PASS: No flame PNG is stamped onto the snake body. A subtle warm band follows the whole damaging body path, and sparse warm arcs show the outer edge of the effective range. The arcs move continuously through turns and remain subordinate to enemies and pickups.

FAIL: Large repeated flame stickers cover the snake, the damage range has no visible cue, or the cue breaks/jumps away from the body during a turn.

### 11. Fire level 5, dense combat

Trigger: Raise Fire and enter a dense pack during 割草期 or 高潮期.

PASS: The larger field remains understandable without filling the screen with opaque orange. Enemies inside the visible band burn; enemies clearly outside do not receive the field damage.

FAIL: The visual radius is misleading, enemy/UI readability is lost, or the canvas reports an error/frame collapse while the field is active.

### 12. Low-performance fallback

Trigger: Test on a lower-end mobile device or force the existing low visual tier through the project’s normal performance path.

PASS: The fire field retains its essential range cue or degrades cleanly with no runtime error; gameplay damage remains unchanged.

FAIL: Fire disappears silently while still damaging, or the performance fallback creates visual artifacts/console exceptions.

## Result record

| Date / build | Device + browser | Sections passed | Failures and reproduction notes |
| --- | --- | --- | --- |
| | | | |
