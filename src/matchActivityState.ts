/** Shared "a multiplayer match is in progress" flag — same module-state
 * pattern as settingsState.ts. Written ONLY by MatchRulesSystem (true on
 * the first MatchStateChanged, false on MultiplayerPeerDisconnected);
 * read by MenuSystem (which pieces a round-end reset may move, game-mode
 * button lock) and SimpleRulesSystem (solo-only rules switch off). It
 * only ever flips at connect/disconnect, so it is stable through the
 * whole synchronous round-end cascade. */
export const matchActivity: { current: { active: boolean } } = {
  current: { active: false },
};
