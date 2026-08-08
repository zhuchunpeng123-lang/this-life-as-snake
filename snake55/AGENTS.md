# Scoped project instructions — snake55

For any change that touches audio, BGM, SFX, UI feedback, skill/combo sound events, enemy/Boss warning sound, voice budgets, ducking, or audio assets:

1. Read `docs/AUDIO_SYSTEM_SPEC.md` and `docs/AUDIO_EVENT_MATRIX.md` first.
2. Treat `AUDIO-FINAL-1.0` as the locked baseline unless the user explicitly approves a spec revision.
3. Preserve the single-BGM-owner invariant (`mediaAudible.length <= 1`).
4. Do not add continuous periodic DOT/contact SFX, extra musical BGM layers, or multi-oscillator runtime stacks for one semantic event.
5. New SFX must declare: information purpose, bus, priority, density behavior, cooldown, and BGM-duck policy.
6. Phone-speaker readability is the first playback target; headphones must remain non-fatiguing.
7. If a requested change conflicts with the audio spec, surface the conflict and update the spec deliberately rather than silently bypassing it.
8. Do not put SFX mix/voice/density/cooldown tuning into `02_config.js`; keep gameplay/balance config independent from the audio-spec implementation.

9. Audio patches must not whole-file-gate gameplay/balance/render files. Use semantic events and context hunks; only the audio-owned implementation may use strict audio-state verification.
10. BGM is frozen at the Golden Master five-loop single-source baseline unless the user explicitly reopens BGM work.
