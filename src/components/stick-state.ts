import { createComponent, Types } from '@iwsdk/core';

/** Racked -> Held -> Flying -> Settled, per docs/PLAN.md's state machine note. */
export const StickPhase = {
  Racked: 'RACKED',
  Held: 'HELD',
  Flying: 'FLYING',
  Settled: 'SETTLED',
} as const;

export const StickState = createComponent(
  'StickState',
  {
    phase: { type: Types.Enum, enum: StickPhase, default: StickPhase.Racked },
    /** Which hand last threw this stick — haptics (impact rumble) fire
     * on the throwing hand, not wherever the stick currently is. */
    lastThrowerHand: { type: Types.String, default: '' },
  },
  'Per-stick throw state machine: Racked -> Held -> Flying -> Settled',
);
