import type { MatchSide } from '../../src/core/match.js';
import type { Intent } from '../../src/core/botPolicy.js';
import type { ProtocolBot } from './protocolBot.js';

/** A room action at the start of a scenario (the `room` scenario). */
export type RoomAction =
  { by: MatchSide; kind: 'reset' } | { by: MatchSide; kind: 'court' };

/** A debug-log line that proves part of a scenario: from the server
 * (the rules) or from player A's client (what a headset showed). The
 * guest is a bot without a client log, so gate checks that need BOTH
 * headsets cannot pass in a bot match — these lines replace them. */
export interface Evidence {
  label: string;
  role: 'server' | 'host';
  message: string;
  test?: (data: Record<string, unknown>) => boolean;
}

/**
 * One rule case for the bot match to provoke: how each side plays, when
 * it has happened (read from what the bot saw), how long to try, and
 * the log lines that prove it.
 */
export interface Scenario {
  name: string;
  timeBoxS: number;
  /** `side`'s intent for its `stickInTurn`-th stick in turn `turnIndex`. */
  intent(side: MatchSide, stickInTurn: number, turnIndex: number): Intent;
  /** False: toss this inkast attempt outside the court. */
  legalInkast(side: MatchSide, attempt: 1 | 2): boolean;
  roomActions?: RoomAction[];
  done(bot: ProtocolBot): boolean;
  evidence: Evidence[];
  /** False: only on request (`--scenario <name>`), not in `all`. */
  inAll?: boolean;
}

const hostHitsGuestMisses = (side: MatchSide): Intent =>
  side === 'host' ? 'hit' : 'miss';

/** Order matters for `all`: `room` switches the court, so it runs last. */
export const SCENARIOS: Scenario[] = [
  {
    name: 'foot-fault',
    timeBoxS: 60,
    intent: (side, stick) =>
      side === 'host' && stick === 0 ? 'footFault' : 'miss',
    legalInkast: () => true,
    done: (bot) =>
      bot.notices.some((n) => n.kind === 'footFault' && n.side === 'host'),
    evidence: [
      {
        label: 'server judged it',
        role: 'server',
        message: 'foot fault',
        test: (d) => d['side'] === 'host',
      },
      {
        label: "A's HUD told",
        role: 'host',
        message: 'foot fault',
        test: (d) => d['mine'] === true,
      },
    ],
  },
  {
    name: 'early-king',
    timeBoxS: 180,
    intent: (side) => (side === 'host' ? 'king' : 'miss'),
    legalInkast: () => true,
    done: (bot) => bot.match?.endReason === 'kingFelledEarly',
    evidence: [
      {
        label: 'server: thrower loses',
        role: 'server',
        message: 'king decision',
        test: (d) =>
          d['endReason'] === 'kingFelledEarly' && d['winner'] === 'guest',
      },
      {
        label: 'A saw the loss',
        role: 'host',
        message: 'match state',
        test: (d) => d['endReason'] === 'kingFelledEarly',
      },
    ],
  },
  {
    name: 'inkast-miss',
    timeBoxS: 300,
    intent: hostHitsGuestMisses,
    legalInkast: (side) => side !== 'guest',
    done: (bot) => (bot.match?.fieldKubbs.length ?? 0) > 0,
    evidence: [
      {
        label: 'first toss out',
        role: 'server',
        message: 'inkast landed',
        test: (d) => d['legal'] === false && d['attempt'] === 1,
      },
      {
        label: 'second toss out',
        role: 'server',
        message: 'inkast landed',
        test: (d) => d['legal'] === false && d['attempt'] === 2,
      },
      {
        label: 'raised inside (house rule)',
        role: 'server',
        message: 'kubb raised',
        test: (d) => d['reason'] === 'inkastClamped',
      },
    ],
  },
  {
    name: 'advantage',
    timeBoxS: 300,
    intent: hostHitsGuestMisses,
    legalInkast: () => true,
    done: (bot) =>
      bot.match?.currentTurn === 'host' &&
      bot.match.phase === 'throwing' &&
      bot.match.fieldKubbs.some((k) => k.half === 'host'),
    evidence: [
      {
        label: 'A shown the line',
        role: 'host',
        message: 'advantage line',
        test: (d) => d['side'] === 'host',
      },
    ],
  },
  {
    // The host tossing kubbs back (bot match, 2026-10-31: a match stalled
    // the first time the host had to inkast): the host fells, the guest
    // tosses in and then fells the field kubbs, so the host must inkast.
    name: 'host-inkast',
    timeBoxS: 420,
    intent: () => 'hit',
    legalInkast: () => true,
    done: (bot) => {
      const i = bot.phases.lastIndexOf('host/inkast');
      return i >= 0 && bot.phases.slice(i + 1).includes('host/throwing');
    },
    evidence: [
      {
        label: 'host toss landed',
        role: 'server',
        message: 'inkast landed',
      },
    ],
  },
  {
    name: 'win',
    timeBoxS: 900,
    intent: hostHitsGuestMisses,
    legalInkast: () => true,
    done: (bot) => bot.match?.winner === 'host',
    evidence: [
      {
        label: 'server: host wins',
        role: 'server',
        message: 'king decision',
        test: (d) =>
          d['winner'] === 'host' && d['endReason'] === 'allKubbsAndKing',
      },
      {
        label: 'A saw the win',
        role: 'host',
        message: 'match state',
        test: (d) => d['winner'] === 'host',
      },
      {
        label: 'restart after the win',
        role: 'server',
        message: 'match restart',
      },
      { label: 'confetti on A', role: 'host', message: 'confetti' },
    ],
  },
  {
    // A whole match as people play it: both sides aim at each other's
    // kubbs (with the aim spread), toss legally, and play on until one
    // wins. The evidence proves a decided match seen by A (and confetti);
    // the series (series.ts) reads the rest — rounds, inkast, raises.
    name: 'real-match',
    timeBoxS: 1800,
    inAll: false,
    intent: () => 'hit',
    legalInkast: () => true,
    done: (bot) =>
      bot.match?.winner !== null && bot.match?.winner !== undefined,
    evidence: [
      {
        label: 'server decided the king',
        role: 'server',
        message: 'king decision',
        test: (d) => d['winner'] === 'host' || d['winner'] === 'guest',
      },
      {
        label: 'A saw the result',
        role: 'host',
        message: 'match state',
        test: (d) => d['winner'] === 'host' || d['winner'] === 'guest',
      },
      { label: 'confetti on A', role: 'host', message: 'confetti' },
    ],
  },
  {
    name: 'room',
    timeBoxS: 30,
    intent: () => 'miss',
    legalInkast: () => true,
    roomActions: [
      { by: 'host', kind: 'reset' },
      { by: 'guest', kind: 'reset' },
      { by: 'host', kind: 'court' },
    ],
    done: (bot) => bot.rooms.length > 0,
    evidence: [
      // The window opens after the setup reset, so these are the
      // scenario's own presses (review, 2026-10-31).
      {
        label: 'host pressed Ny runda',
        role: 'server',
        message: 'reset pressed',
        test: (d) => d['side'] === 'host',
      },
      {
        label: 'guest pressed Ny runda',
        role: 'server',
        message: 'reset pressed',
        test: (d) => d['side'] === 'guest',
      },
      {
        label: 'court switch reached A',
        role: 'host',
        message: 'room court changed',
      },
    ],
  },
];
