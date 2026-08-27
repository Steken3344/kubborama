import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GrabHighlightSystem } from './systems/grabHighlight.js';
import { HudSystem } from './systems/hud.js';
import { ImpactSystem } from './systems/impact.js';
import { MenuSystem } from './systems/menu.js';
import { RoundSystem } from './systems/round.js';
import { SettingsSystem } from './systems/settings.js';
import { StatsSystem } from './systems/stats.js';
import { ThrowingSystem } from './systems/throwing.js';
import { ToppleSystem } from './systems/topple.js';
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
  // game-mode-driven topple angle, WindSystem's wind vector).
  world.registerSystem(SettingsSystem);
  // Default priority (0) runs after GrabSystem (-3) and PhysicsSystem
  // (-2), so both systems read up-to-date grab state and post-physics
  // velocities each frame.
  world.registerSystem(ThrowingSystem);
  world.registerSystem(ImpactSystem);
  world.registerSystem(WindSystem);
  world.registerSystem(MenuSystem);
  world.registerSystem(GrabHighlightSystem);
  // M3: ToppleSystem emits KubbFelled/KingFelled -> RoundSystem drives
  // the round reducer and emits RoundEnded -> StatsSystem records it
  // (must come before HudSystem, which reads StatsSystem.stats in the
  // same RoundEnded tick) -> HudSystem repaints the scoreboard.
  // MenuSystem (registered above) also subscribes to RoundEnded to
  // auto-reset. Order matters here, unlike the event-only systems
  // below.
  world.registerSystem(ToppleSystem);
  world.registerSystem(RoundSystem);
  world.registerSystem(StatsSystem);
  world.registerSystem(HudSystem);
  // Reads gameEvents emitted by ThrowingSystem/ImpactSystem — order
  // doesn't matter for correctness (subscriptions, not query timing),
  // but registering last keeps init order readable.
  world.registerSystem(TuningLabSystem);
});
