---
name: this-life-as-snake-audio-implementation
description: Implement or debug audio in 此生为蛇 when work involves Web Audio event tracing, ownership, skill or combo feedback, throttling, priority, density, lifecycle, mix interaction, or mobile-safe verification. Use the current audio implementation and project audio contract; current sound aesthetics are not permanent answers.
---

# Audio implementation

## Scope

Use for audio implementation, event routing, ownership, density/voice management, lifecycle, mix interaction, and verification. Do not use to decide the project’s final creative sound direction without a current task and user acceptance.

## Required context

Read `AGENTS.md`, `docs/audio/AUDIO.md`, `snake55/10_audio.js`, the current task, and the event source in the relevant gameplay/UI module. Read other source only as needed to trace the event.

## Workflow

1. Trace the semantic event from trigger through damage/feedback to dedicated audio and lifecycle events.
2. Identify one main owner for each sound. Decide explicitly whether a generic hit, death, or UI cue is suppressed when a dedicated owner plays.
3. Check family gates, priority, density, voice budgets, BGM interaction, and mobile-speaker readability.
4. Check pause, resume, death, restart, mute, unlock, and page lifecycle reset paths.
5. Implement only the approved audio scope. Keep gameplay values, damage, VFX behavior, and unrelated WIP unchanged.
6. Run relevant syntax/static checks and describe what still requires human listening on desktop, phone, or standalone.

## Review standard

No unintended double trigger, no unbounded dense-event voice creation, clear ownership, valid lifecycle reset, and no accidental gameplay coupling. Do not copy a historical Lightning/Electro timbre, oscillator recipe, or event matrix as a permanent design answer.
