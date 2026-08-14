---
name: roguelike-combat-balance-flow
description: Analyze and tune combat balance and flow for snake55 when work involves enemy density, enemy roles, HP/TTK, stage pressure, skill or combo balance, growth pacing, new combat stages, new dungeons, or playtest feedback about difficulty, challenge, mowing satisfaction, or flow. Use the project's current code, CONFIG, balance evidence, and real playtest results before changing gameplay values.
---

# Roguelike Combat Balance Flow

## 1. Scope

Use for combat balance, roguelike flow, enemy supply or pressure, HP/TTK, skills, Combos, growth, stage pacing, new dungeons/enemies, and playtest feedback about difficulty or satisfaction. Do not use for isolated UI, art, audio, narrative, or presentation work unless the task changes gameplay balance.

## 2. Required context

Read `AGENTS.md`, `snake55/02_config.js`, and the relevant gameplay source. Read `docs/design/GDD.md` only when design intent is part of the question; read `docs/STATUS.md` only when current completion, WIP, release, or open issues matter. Use `tools/simulate-balance.mjs` only when it answers the actual question. Use user playtest evidence and current worktree state; treat historical tuning and old balance documents as evidence, not defaults.

## 3. First-principles diagnostic loop

1. Define the desired player experience and turn the complaint into a falsifiable hypothesis.
2. Separate mechanism, player power, enemy supply, visible density, threat pressure, growth economy, TTK, readability, and operation problems.
3. Trace the current implementation and CONFIG values before proposing changes.
4. Compare player power, enemy pressure, player tolerance, growth feedback, and phase rhythm.
5. Identify the smallest causal lever that explains the evidence; do not jump from “too hard/easy” directly to HP or DPS.

## 4. Evidence selection

Choose evidence appropriate to the question: code path and CONFIG for facts, calculation or simulation for hypotheses, and natural playtest/recording for final pacing, density, readability, and flow. A simulator diagnoses; it does not replace a natural run.

## 5. Quantification / simulation

Quantify relevant measures such as ordinary TTK, visible enemies, active threats, special-enemy residence, damage reasons, power spikes, clear-screen gaps, and phase pressure. Keep assumptions explicit and avoid treating one run or one metric as the whole answer.

## 6. Smallest causally coherent intervention

Choose among supply, visibility, enemy behavior, HP, damage, growth, pressure, or other relevant levers from the evidence and causal relationship. Do not impose a fixed tuning order; select the smallest verifiable intervention that explains the current problem. Preserve unrelated WIP and gameplay contracts.

## 7. Validation

Validate normal and edge conditions relevant to the task. For a flow change, answer whether the player can act, whether danger is explainable, whether power growth is felt, whether high density remains readable, and whether a strong build is rewarded without deleting the game’s decisions. Report PASS, PARTIAL, FAIL, or BLOCKED with evidence.

## 8. Implementation-only mode

If the user supplies an approved value or exact implementation scope, verify the current baseline, apply only that scope, and run the relevant checks. Do not reopen design decisions unless the current code, WIP, or evidence creates a concrete conflict.

## 9. Adversarial review

Before delivery, ask whether the symptom could come from spawn visibility, target access, role failure, camera/readability, or measurement bias instead of raw strength. Check for side effects on other stages, builds, enemy roles, performance, and player agency.

## 10. Definition of done

The task has a stated experience diagnosis, current-code evidence, a scoped intervention or a justified no-change decision, relevant validation, preserved WIP, and explicit remaining uncertainty. Historical roles and past solutions may inform judgment but are not mandatory future answers.
