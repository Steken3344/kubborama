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

## Future feature idea: baseline foul warning ("don't step over the line")

Erik's idea (2026-08-28), for a future version — not scoped to any
current milestone: a real kubb rule is that you must throw from behind
the baseline. Warn the player when their feet cross it — e.g. tint the
held stick red — rather than silently allowing an illegal throw.

**The hard part, per Erik's own framing:** foot position is what
matters, not head position, and Quest 2 has no leg/foot tracking. His
proposed approximation: head position minus ~30cm forward, to account
for leaning in to throw. Discussed refinement: a fixed world-space
`-30cm` on one axis only works if the player always faces the same
direction, but this court has kastare throwing from both baselines
(facing opposite ways) — so the offset needs to follow the head's own
forward direction instead: take the head's forward vector, flatten it
onto the ground plane (drop the up/down tilt component), normalize,
and subtract ~30cm along _that_ flattened direction from the head's
XZ position. That gives a lean-corrected foot estimate regardless of
which end of the court the player is standing at. This is the standard
practical substitute for real foot tracking in headset-only VR.

**Open sub-questions for whenever this gets scoped:**

- Which baseline is "behind" depends on whose throw it is / which end
  of the court is active — ties into `config.ts`'s existing court/
  baseline data, not a new concept.
- When should the warning be live — only while a stick is held and the
  player is aiming/about to throw, or continuously? Continuous is
  probably too noisy (flags "wrong" foot position even when just
  walking around, not throwing).
- Warning-only (red stick tint) vs. an actual rule enforcement (e.g.
  invalidating/voiding a throw released from an illegal position) —
  Erik only asked for a warning so far, not enforcement.

Not investigated or prototyped yet — logged per Erik's request so it
isn't lost, to be picked up in a later session.

## MP3a: the guest's "Ny runda" flickers for one round trip

Erik decided "Ny runda" aborts the match from either headset. On the
GUEST the button still runs the local teleport-home first, then relays the
request; until the host's reset lands (~1 network round trip) the host's
`pieceSync` snaps the sin-binned kubbs back into the sin-bin, then
everything goes home for real. Functionally correct, cosmetically a
double jump. Three options, pick one when it bothers you in the headset:

1. **Accept the flicker** (current) — zero extra state, it is ~50-100 ms.
2. **Guest skips the local teleport** while a match is active and it is
   not authoritative — needs a "who is host" bit in shared state
   (`matchActivity`) so `MenuSystem` can tell; cleanest visually.
3. **Host echoes the reset faster** — no real gain over 1, the round trip
   is the floor.

Suggested default: 1 until it is actually noticed in play.
