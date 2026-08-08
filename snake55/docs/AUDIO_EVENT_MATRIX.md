# AUDIO-FINAL-1.0 Event Matrix

| Event / Source | Owner sound | Bus | Priority | Density / cooldown | BGM duck |
|---|---|---:|---:|---|---|
| `ui:feedback press` | `ui_press` | ui | P4 | UI cap | No |
| `ui:feedback confirm` | `ui_confirm` | ui | P4 | UI cap | No |
| `ui:feedback back` | `ui_back` | ui | P4 | UI cap | No |
| `ui:feedback toggle` | `ui_toggle` | ui | P4 | UI cap | No |
| pause | `ui_pause_in/out` | ui | P4 | one per transition | No |
| `skill:offer` | `ui_offer` | ui | P4 | one per offer | choice duck |
| `skill:gained` | `gain_<skill>` | ui | P4 | one | Major |
| `combo:found` | `found_<combo>` | ui | P5 | one | Major |
| food pickup | `pickup_food` | ui | P2 | 90ms | No |
| heal pickup | `pickup_heal` | ui | P3 | event | No |
| `snake:hurt` | hurt/critical | player | P5 | event | Major |
| `snake:wall` | `wall_scrape` | player | P1 | 320ms | No |
| Charger windup | `charger_warn` | threat | P5 | 180ms global | Light |
| Charger charge | `charger_charge` | threat | P4 | 150ms global | No |
| Boss stage warning | `boss_warn` | threat | P5 | event | Major |
| Boss attack prewarn | `boss_attack_warn` | threat | P5 | 220ms | Light |
| Boss bullet volley | `boss_attack_fire` | boss | P4 | 180ms | No |
| Boss phase | `boss_phase` | boss | P5 | event | Major |
| Fire DOT | `fire_contact` | skill | P1 | 360ms global | No |
| Shield DOT | `shield_contact` | skill | P2 | 280ms global | No |
| Burn DOT | **silent** | — | — | — | — |
| generic hit | `generic_hit` | impact | P1 | 120ms | No |
| crit | `crit_hit` | impact | P3 | 120ms | No |
| enemy deaths | collapse sample | death | P2/P3 | 70ms cluster | No |
| `fx:bolt` | `bolt_1..5` | skill | P3 | only shotIndex=0 | No |
| `fx:ice_throw` | `ice_throw` | skill | P3 | 115ms | No |
| `fx:ice_pool` | `ice_bloom` | skill | P3 | 160ms | No |
| `fx:lightning` | `lightning_1..5` | skill | P3 | one per chain | No |
| `fx:steamblast` | `steam_blast` | combo | P4 | 180ms | No |
| turret deploy | `electro_deploy` | combo | P3 | event | No |
| turret fire | `electro_fire` | combo | P4 | event | No |
| turret end | `electro_end` | combo | P2 | event | No |
| burning dart | `burn_dart` | combo | P3 | actual visualDelay | No |
| player death | `player_death` | ui/result | P5 | one | BGM stopped |
| boss defeat | `boss_defeat` | ui/result | P5 | one | BGM stopped |

## Voice budgets

- Global SFX: 12
- UI: 4
- skill 4 / combo 4 / player 2 / impact 2 / death 2 / boss 3 / threat 3 / ui 3

When density exceeds the soft/hard window, P1/P2 are dropped before P3+ identities or threats.
