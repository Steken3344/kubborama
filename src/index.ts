import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CourtLayoutSystem } from './systems/courtLayout.js';
import { CourtLinesSystem } from './systems/courtLines.js';
import { GrabHighlightSystem } from './systems/grabHighlight.js';
import { HandoffSystem } from './systems/handoff.js';
import { HudSystem } from './systems/hud.js';
import { ImpactSystem } from './systems/impact.js';
import { MenuSystem } from './systems/menu.js';
import { RoundSystem } from './systems/round.js';
import { SettingsSystem } from './systems/settings.js';
import { SfxSystem } from './systems/sfx.js';
import { StatsSystem } from './systems/stats.js';
import { StickGroundDampingSystem } from './systems/stickGroundDamping.js';
import { StickPullSystem } from './systems/stickPull.js';
import { ThrowingSystem } from './systems/throwing.js';
import { ToppleSystem } from './systems/topple.js';
import { TriggerGrabSystem } from './systems/triggerGrab.js';
import { TuningLabSystem } from './systems/tuningLab.js';
import { WindSystem } from './systems/wind.js';

// NOT `await World.create(...)` at module top level — that breaks the
// production build (Rollup's entry-chunk bundling hangs forever on it;
// dev mode tolerates it fine). See docs/DECISIONS.md, 2026-08-27.
World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
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
  world.registerSystem(RoundSystem);
  world.registerSystem(HudSystem);
  // Reads gameEvents emitted by ThrowingSystem/ImpactSystem — order
  // doesn't matter for correctness (subscriptions, not query timing),
  // but registering last keeps init order readable.
  world.registerSystem(TuningLabSystem);

  document.getElementById('splash')?.classList.add('splash-hidden');
});
