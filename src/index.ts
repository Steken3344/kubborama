import { World } from '@iwsdk/core';
import { gameEvents } from './core/events.js';
import { debugContext } from './debug/debugContext.js';
import projectOptions from 'virtual:iwsdk-project';
import { installDebugRelay } from './debug/debugRelay.js';
import { loadServerConfig, serverConfig } from './serverConfig.js';
import { DebugWatchSystem } from './systems/debugWatch.js';
import { AdvantageLineSystem } from './systems/advantageLine.js';
import { WalkAreaSystem } from './systems/walkArea.js';
import { SpectatorSystem } from './systems/spectator.js';
import { StaticBatchSystem } from './systems/staticBatch.js';
import { ConfettiSystem } from './systems/confetti.js';
import { CourtLayoutSystem } from './systems/courtLayout.js';
import { CourtLinesSystem } from './systems/courtLines.js';
import { GateProbeSystem } from './systems/gateProbe.js';
import { GrabHighlightSystem } from './systems/grabHighlight.js';
import { HandoffSystem } from './systems/handoff.js';
import { HudSystem } from './systems/hud.js';
import { ImpactSystem } from './systems/impact.js';
import { InkastSystem } from './systems/inkast.js';
import { MenuSystem } from './systems/menu.js';
import { MatchRulesSystem } from './systems/matchRules.js';
import { PeerAvatarSystem } from './systems/peerAvatar.js';
import { MultiplayerSystem } from './systems/multiplayer.js';
import { OneShotAudioSystem } from './systems/oneShotAudio.js';
import { RoundSystem } from './systems/round.js';
import { ServerLinkSystem } from './systems/serverLink.js';
import { SettingsSystem } from './systems/settings.js';
import { SfxSystem } from './systems/sfx.js';
import { SimpleRulesSystem } from './systems/simpleRules.js';
import { StatsSystem } from './systems/stats.js';
import { StickGroundDampingSystem } from './systems/stickGroundDamping.js';
import { StickPullSystem } from './systems/stickPull.js';
import { ThrowingSystem } from './systems/throwing.js';
import { ToppleSystem } from './systems/topple.js';
import { TriggerGrabSystem } from './systems/triggerGrab.js';
import { TuningLabSystem } from './systems/tuningLab.js';
import { VoiceLinkSystem } from './systems/voiceLink.js';
import { WindSystem } from './systems/wind.js';

// NOT `await` at module top level — that breaks the production build
// (Rollup's entry-chunk bundling hangs forever on it; dev mode tolerates
// it fine). See docs/DECISIONS.md, 2026-08-27. First ask the page's own
// server for its config (src/serverConfig.ts), so every system reads a
// settled server mode; then the debug relay, before anything logs; then
// the world.
void loadServerConfig()
  .then(() => {
    installDebugRelay();
    return World.create(
      document.getElementById('scene-container') as HTMLDivElement,
      projectOptions,
    );
  })
  .then((world) => {
    // Test hook for the headless multiplayer checks when the server runs
    // in debug mode (scripts/
    // server-two-clients.mjs): the app's OWN bus and debug context —
    // importing their module URLs from a page breaks after an HMR update
    // (Vite adds ?t= to the app's imports, so the page gets a second copy).
    if (serverConfig.current?.debug === true) {
      const devHook: Record<string, unknown> = {
        gameEvents,
        debugContext,
        serverLink: () => world.getSystem(ServerLinkSystem),
        lastMatch: null,
      };
      gameEvents.on('MatchStateChanged', (e) => {
        devHook['lastMatch'] = e.state;
      });
      (globalThis as unknown as Record<string, unknown>)['__kubbDev'] = devHook;
    }
    // M4: SettingsSystem loads persisted settings + wires the i18n
    // translator before anything else reads settingsState/i18nState
    // (haptics scaling, MenuSystem/HudSystem's labels, ToppleSystem's
    // game-mode-driven topple angle, WindSystem's wind vector,
    // CourtLinesSystem's toggle).
    world.registerSystem(SettingsSystem);
    // M5: priority doesn't fix a same-frame race here (see
    // systems/handoff.ts) — just runs slightly ahead of GrabSystem (-3)
    // so a release is visible as early in the frame as possible.
    world.registerSystem(HandoffSystem, { priority: -4 });
    // StatsSystem next: MenuSystem's stats tab and HudSystem both read
    // StatsSystem.stats, so it must be registered (and its RoundEnded
    // subscription attached) before either of them.
    world.registerSystem(StatsSystem);
    // Default priority (0) runs after GrabSystem (-3) and PhysicsSystem
    // (-2), so both systems read up-to-date grab state and post-physics
    // velocities each frame.
    world.registerSystem(ThrowingSystem);
    // M5 feedback: keeps in-flight spin feel untouched while still
    // killing post-landing rolling — see stickGroundDamping.ts.
    world.registerSystem(StickGroundDampingSystem);
    world.registerSystem(ImpactSystem);
    world.registerSystem(WindSystem);
    // M5: sound + the kubbFelled/kingFelled/roundCleared haptic sequences
    // core/haptics.ts defined back in M3/M4 but nothing fired until now.
    world.registerSystem(SfxSystem);
    // Disposes every one-shot audio entity playSfxVariant creates, once
    // its clip finishes — order doesn't matter, it only ever touches
    // entities tagged OneShotAudio.
    world.registerSystem(OneShotAudioSystem);
    world.registerSystem(MenuSystem);
    // Reads GameModeChanged (SettingsSystem, registered above) and calls
    // into MenuSystem's applyCourtLayout — must come after both.
    world.registerSystem(CourtLayoutSystem);
    world.registerSystem(GrabHighlightSystem);
    // Erik's feedback: trigger should also grab a nearby stick, not
    // just squeeze — registered before StickPullSystem so a same-frame
    // trigger-grab's Grabbed tag already excludes the entity from that
    // system's query this same frame (see docs/DECISIONS.md).
    world.registerSystem(TriggerGrabSystem);
    // M5 feedback: replaces DistanceGrabbable (removed from sticks — see
    // docs/DECISIONS.md for why it conflicted with OneHandGrabbable).
    world.registerSystem(StickPullSystem);
    world.registerSystem(CourtLinesSystem);
    // M3: ToppleSystem emits KubbFelled/KingFelled -> RoundSystem drives
    // the round reducer and emits RoundEnded -> StatsSystem (registered
    // above) records it -> HudSystem repaints the scoreboard. MenuSystem
    // (registered above) also subscribes to RoundEnded to auto-reset.
    world.registerSystem(ToppleSystem);
    // Simple mode's rules (sin-bin removal + king-protected-until-
    // baseline-clear): reacts to ToppleSystem's KubbFelled and to
    // Reset, so it must come after ToppleSystem is at least registered
    // (subscriptions don't need strict ordering here, but this keeps
    // the round-mechanics systems grouped for readability).
    world.registerSystem(SimpleRulesSystem);
    world.registerSystem(RoundSystem);
    world.registerSystem(HudSystem);
    // Reads gameEvents emitted by ThrowingSystem/ImpactSystem — order
    // doesn't matter for correctness (subscriptions, not query timing),
    // but registering last keeps init order readable.
    world.registerSystem(TuningLabSystem);
    // Multiplayer (docs/PLAN.md §10). Its match logic reacts to
    // MenuSystem's Reset{cause:'roundEnd'} — emitted after MenuSystem's
    // own teleport — rather than to RoundEnded, and mirrors a home pose
    // captured at its own init(), so it is genuinely independent of
    // registration order (see MultiplayerSystem.onResetForMatch()).
    // Registered last only for readability.
    world.registerSystem(MultiplayerSystem);
    // MP5: link to the authoritative game server (only with ?server=1).
    world.registerSystem(ServerLinkSystem);
    // Voice through the game server's signaling (server mode only).
    world.registerSystem(VoiceLinkSystem);
    // MP3a: physical side of a multiplayer match (sin-bin per side, king
    // unprotected, auto-restart). Event-driven only — order irrelevant.
    world.registerSystem(MatchRulesSystem);
    // MP4: the physical inkast (kubb toss) — needs GrabSystem and
    // MultiplayerSystem (relay); event-driven plus a per-frame hand sample.
    world.registerSystem(InkastSystem);
    // MP4: the advantage line (shown, not enforced).
    world.registerSystem(AdvantageLineSystem);
    // Thumbstick locomotion: walkable ground, kept inside the garden.
    world.registerSystem(WalkAreaSystem);
    // The TV view for a browser that watches instead of playing.
    world.registerSystem(SpectatorSystem);
    // Merge the garden's static props per material once loaded (draw calls).
    world.registerSystem(StaticBatchSystem);
    // Confetti over the winner's side when a match is won.
    world.registerSystem(ConfettiSystem);
    // MP3b: remote players' avatars, fed by PeerPresence/PeerLeft events
    // from MultiplayerSystem — event-driven only, order irrelevant.
    world.registerSystem(PeerAvatarSystem);
    // Debug mode only (no-op unless ?debug=1): below-ground stick watchdog
    // and other breadcrumbs — registered last so it observes the frame's
    // final state.
    world.registerSystem(DebugWatchSystem);
    // Debug mode only: gate-report probes (docs/superpowers/specs/
    // 2026-09-26-gate-report-design.md). Must come after MultiplayerSystem
    // — see the class doc.
    world.registerSystem(GateProbeSystem);

    document.getElementById('splash')?.classList.add('splash-hidden');
  });
