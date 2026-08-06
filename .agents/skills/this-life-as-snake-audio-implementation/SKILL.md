---
name: this-life-as-snake-audio-implementation
description: Implement or debug skill and Combo audio in 《此生为蛇》 using Web Audio. Use for event routing, dedicated skill sounds, generic hit ownership, throttling, priority, reset behavior, level layers, and mobile-safe verification. Do not use for unrelated BGM composition.
---

# Skill audio implementation workflow

## Required reads

1. `AGENTS.md`
2. `docs/audio/SKILL-AUDIO-GUIDE.md`
3. Current task brief
4. `02_config.js`
5. `10_audio.js`
6. Skill event source in `08_skill.js`
7. Damage and enemy events when relevant

## First review the event chain

Trace:

```text
skill trigger
→ hurt/applyDamage
→ enemy:hit
→ dedicated fx event
→ enemy:dead
```

Never review only the dedicated `fx:*` listener.

## Ownership rule

For each source, identify one main sound owner.

If a source has a dedicated skill sound, explicitly decide whether generic `enemy:hit` is suppressed. Keep enemy death sound separate unless the task says otherwise.

## Gating rule

- Maintain per-family gates by default.
- Do not let lightning and electro share one gate unless the intended priority behavior is fully specified.
- Cross-family priority must not suppress the dedicated sound while leaving a generic hit sound audible.
- Reset gate state on run reset and relevant audio lifecycle events.

## Sound identity

Define:

- frequency range;
- transient;
- tail;
- level layers;
- volume;
- throttle;
- priority;
- mobile speaker readability.

Base skill and Combo must differ in more than pitch alone.

## Definition of done

- No unintended double trigger.
- Same level has stable sound identity.
- Dense events are throttled.
- Dedicated sound and generic hit ownership are explicit.
- Reset, pause, death, restart, mute, and mobile unlock paths remain valid.
- Gameplay and VFX files are unchanged unless explicitly allowed.
- JS syntax, project check, and diff check pass.
