/** A round is 6 stick-throws, matching a real kubb team's baton count. */
export const STICKS_PER_ROUND = 6;

export interface RoundState {
  roundNumber: number;
  sticksThrownThisRound: number;
  sticksSettledThisRound: number;
  kubbsFelledThisRound: string[];
  kingFelledThisRound: boolean;
  /** Sticks thrown so far at the moment the king went down, for the
   * "fewest sticks to fell the king" stat — null until it happens. */
  sticksThrownWhenKingFelled: number | null;
}

export function initialRoundState(roundNumber = 1): RoundState {
  return {
    roundNumber,
    sticksThrownThisRound: 0,
    sticksSettledThisRound: 0,
    kubbsFelledThisRound: [],
    kingFelledThisRound: false,
    sticksThrownWhenKingFelled: null,
  };
}

export type ScoringEvent =
  | { type: 'StickThrown' }
  | { type: 'StickSettled' }
  | { type: 'KubbFelled'; entityId: string }
  | { type: 'KingFelled' };

/**
 * (state, event) -> state. Thrown/Settled are tracked separately:
 * round completion (isRoundComplete) waits for the last stick to
 * *settle* so the reset doesn't happen mid-flight, while the
 * king-felling stat wants how many sticks had been *thrown* at that
 * moment (the felling stick itself may still be in flight).
 */
export function scoringReducer(
  state: RoundState,
  event: ScoringEvent,
): RoundState {
  switch (event.type) {
    case 'StickThrown':
      return {
        ...state,
        sticksThrownThisRound: state.sticksThrownThisRound + 1,
      };
    case 'StickSettled':
      return {
        ...state,
        sticksSettledThisRound: state.sticksSettledThisRound + 1,
      };
    case 'KubbFelled':
      if (state.kubbsFelledThisRound.includes(event.entityId)) {
        return state;
      }
      return {
        ...state,
        kubbsFelledThisRound: [...state.kubbsFelledThisRound, event.entityId],
      };
    case 'KingFelled':
      if (state.kingFelledThisRound) {
        return state;
      }
      return {
        ...state,
        kingFelledThisRound: true,
        sticksThrownWhenKingFelled: state.sticksThrownThisRound,
      };
  }
}

export function isRoundComplete(state: RoundState): boolean {
  return state.sticksSettledThisRound >= STICKS_PER_ROUND;
}

export interface RoundResult {
  roundNumber: number;
  kubbsFelled: number;
  kingFelled: boolean;
  sticksThrownWhenKingFelled: number | null;
}

export function finishRound(state: RoundState): RoundResult {
  return {
    roundNumber: state.roundNumber,
    kubbsFelled: state.kubbsFelledThisRound.length,
    kingFelled: state.kingFelledThisRound,
    sticksThrownWhenKingFelled: state.sticksThrownWhenKingFelled,
  };
}

export function nextRoundState(state: RoundState): RoundState {
  return initialRoundState(state.roundNumber + 1);
}

export interface QuietCourtConfig {
  /** Every kubb and the king must have been at rest this long. */
  quietCourtS: number;
  /** …but never wait longer than this after the 6th stick settled (a
   * jittering piece must not block the round forever — same shape as
   * ThrowingSystem's maxFlightTimeS fallback). */
  maxWaitS: number;
}

/**
 * gh#17: `isRoundComplete` (all six sticks settled) used to END the
 * round on the spot, and the round-end reset then teleported every
 * piece home — a kubb or the king toppled by that last stick but still
 * needing up to restDurationS to come to rest was stood back up and
 * never counted. In a match that is a lost point or a lost king
 * decision. So the round becomes PENDING on the 6th settle and ends
 * only once the court has been quiet for `quietCourtS`, or `maxWaitS`
 * after it went pending, whichever comes first.
 *
 * @param quietForS  seconds every toppleable piece has been at rest,
 *                   or null while something is still moving
 * @param pendingForS seconds since the round became pending
 */
export function shouldEndPendingRound(
  quietForS: number | null,
  pendingForS: number,
  cfg: QuietCourtConfig,
): boolean {
  if (pendingForS >= cfg.maxWaitS) {
    return true;
  }
  return quietForS !== null && quietForS >= cfg.quietCourtS;
}
