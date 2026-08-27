# KubbOrama — open questions for Erik

Batched here during autonomous work instead of blocking on them. Each
entry has a suggested default; delete the entry once answered (fold the
answer into docs/DECISIONS.md if it's worth remembering).

## M2: left-hand grab reportedly not working on headset

Erik's feedback (2026-08-27): "nu verkar bara funka med höger vill kunna
ta upp en med vänster hand" (only seems to work with the right hand).

Investigated via the emulator: moved `controller-left` onto a stick and
squeezed (gamepad button index 1, `OneHandGrabbable`'s expected input)
— `Grabbed` was added and `StickState.phase` went to `HELD` exactly
like the right hand. Same test with `controller-right` also works. No
hand-specific code path exists in `ThrowingSystem`/`GrabSystem` config
that would explain a left-only failure — `iwsdk.config.json`'s
`grabbing: true` and the scene's `OneHandGrabbable`/`DistanceGrabbable`
components are symmetric per hand.

**Suggested default (not yet applied):** likely a real-headset-specific
cause the emulator can't reproduce — e.g. squeeze vs. trigger confusion,
hand-tracking mode active on one hand, or a controller/battery issue.
**Need from Erik:** which button he used, and whether the stick's
grab-range highlight (new this session — see docs/DECISIONS.md) shows
up on the left hand at all when reaching for a stick. If it does show
but squeeze still doesn't grab, that narrows it to input mapping rather
than proximity detection.
