import {
  createSystem,
  Grabbed,
  Object3D,
  PhysicsManipulation,
  PhysicsSystem,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { joinRoom, selfId } from 'trystero';
import type { MessageAction, Room } from 'trystero';
import { StickPhase, StickState } from '../components/stick-state.js';
import { defaultCourtPreset, getCourtPreset, multiplayer } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import {
  initialMatchState,
  kubbSide,
  withKubbFelled,
  withTurnAdvanced,
} from '../core/match.js';
import type { MatchState } from '../core/match.js';
import {
  buildMatchSyncMessage,
  parseMatchSyncMessage,
} from '../core/matchSync.js';
import type { MatchSyncMessage } from '../core/matchSync.js';
import {
  buildHelloMessage,
  isHost,
  parseHelloMessage,
  resolveHostId,
} from '../core/multiplayerAuthority.js';
import type {
  HelloMessage,
  PeerJoinInfo,
} from '../core/multiplayerAuthority.js';
import {
  buildPieceSyncMessage,
  parsePieceSyncMessage,
} from '../core/pieceSync.js';
import type { PieceSyncMessage, PieceTransform } from '../core/pieceSync.js';
import {
  buildPresenceMessage,
  defaultPose,
  mirrorPoseToFarBaseline,
  parsePresenceMessage,
} from '../core/presence.js';
import type { Pose, PresenceMessage } from '../core/presence.js';
import {
  buildThrowRelayMessage,
  parseThrowRelayMessage,
} from '../core/throwRelay.js';
import type { ThrowRelayMessage } from '../core/throwRelay.js';
import { STICKS_PER_ROUND } from '../core/scoring.js';
import { log } from '../core/log.js';
import { settingsState } from '../settingsState.js';

// King, both kubb baselines, and every stick — MP2's shared court
// state (see class doc). A stick's initial throw is relayed
// separately (core/throwRelay.ts, needs velocity); once flying it's
// just another periodically-synced piece like this.
const NETWORKED_PIECE_IDS = [
  'king',
  ...Array.from({ length: KUBB_COUNT * 2 }, (_, i) => `kubb-${i}`),
  ...Array.from({ length: STICKS_PER_ROUND }, (_, i) => `stick-${i}`),
];

// The other headset spawns at the far baseline — the one you normally
// throw at — facing back toward you (Erik, 2026-09-01). Not preset-
// aware per game mode switch (MultiplayerSystem has no
// GameModeChanged subscription); good enough for MP1, revisit if the
// far baseline moves mid-session becomes something players actually
// do.
const FAR_Z = -getCourtPreset(defaultCourtPreset).lengthM;

/**
 * MP1 co-presence (docs/PLAN.md §10, Erik's 2 Quests, 2026-08-31):
 * broadcasts local head + hand transforms over Trystero and renders
 * every other peer as a placeholder avatar (`peer-avatar` asset — see
 * .claude/skills/iwsdk-scene-composer, materials.ts's avatarMaterial).
 * (Shared match state — king/kubb sync — arrived in MP2 phase 1,
 * documented further down; still true that sticks stay MP1-local.)
 *
 * Room: `?room=<code>` in the URL, defaulting to a fixed lobby id so
 * two headsets opening the plain deployed URL land in the same room
 * with zero setup — good enough for Erik's first test with 2 known
 * devices, not a real room/matchmaking UI (friend-link rooms are a
 * later step per the plan).
 *
 * Placement: both players' own tracked origin is (0,0,0) by default
 * (no authored player.transform, see CLAUDE.md), so a remote peer's
 * raw position would otherwise exactly coincide with the local
 * player's own body. Erik's 2026-09-01 decision: the other headset
 * appears at the far baseline (the one you normally throw at), facing
 * back toward you — see core/presence.ts's mirrorPoseToFarBaseline().
 *
 * Voice (docs/PLAN.md §10's "voice chat built in" — Trystero's
 * addStream/onPeerStream, not IWSDK's own AudioSystem, which only
 * plays pre-loaded clips through a private, unexposed AudioListener,
 * not live WebRTC MediaStreams). Deliberately NOT spatial audio for
 * this first pass — a plain hidden `<audio>` element per peer, global
 * stereo, not panned to the avatar's position — proper 3D voice needs
 * its own AudioListener wired to the camera, cut here to keep this
 * pass's scope to "can we hear each other" rather than reimplementing
 * part of IWSDK's audio pipeline. Muted by default
 * (settings.micMuted — plan's own "mute button mandatory"); toggled
 * live via the settings menu, checked every tick rather than only on
 * toggle since this system has no settings-changed subscription.
 *
 * MP2 phase 1 (Erik, 2026-09-01, interviewed for the design): shared
 * court state, using core/multiplayerAuthority.ts's "först in äger
 * spelet" rule — whichever peer joined the room first is the
 * authoritative host for king/kubb/stick positions, broadcasting them
 * (core/pieceSync.ts) at the same ~20Hz as presence. The guest applies
 * every incoming snapshot directly via `PhysicsSystem.setBodyTransform`
 * (the same API MenuSystem's reset uses) rather than switching those
 * bodies to Kinematic — changing a body's motion state at runtime
 * needs "deliberate lifecycle handling" per the physics skill
 * reference (remove+recreate the body), which is real surgery on 17
 * pieces for a first pass; periodic snap-correction is simpler and
 * safe, at the cost of a small amount of visible drift between
 * network ticks while local gravity briefly acts on an otherwise-
 * mirrored body. A piece the LOCAL player is actively holding
 * (`Grabbed`) is skipped — otherwise a stale host snapshot would fight
 * the guest's own hand-tracking while they're aiming.
 *
 * MP2 phase 2 (same session): "both should be able to throw" needed
 * more than adding sticks to the sync list above — a GUEST's own local
 * throw physics can't be authoritative once the host owns the shared
 * court. `ThrowingSystem` is untouched; this system just also
 * subscribes to the SAME `Thrown` event it already emits
 * (core/events.ts's bus was built with exactly this in mind — see its
 * own doc comment) and, only if I'm not the host, relays the release
 * (position/orientation read at that instant, since `Thrown` fires
 * synchronously before physics steps again — plus velocity, already in
 * the event payload) via core/throwRelay.ts. The host applies it to
 * ITS copy of that stick with the identical two-call pattern
 * `ThrowingSystem.onRelease()` uses for a local throw
 * (`setBodyTransform` then a one-shot `PhysicsManipulation`), so
 * `ImpactSystem`/`ToppleSystem` react exactly as if the host itself
 * had thrown it. The guest's own local stick keeps flying in parallel
 * (untouched, free client-side prediction) and gets pulled back in
 * line by the regular pieces broadcast once it's no longer `Grabbed` —
 * client prediction + server reconciliation, not synchronized/locked
 * step.
 *
 * MP2 phase 3 (same session, Erik: "fortsätt"): a real match needs a
 * winner. `core/match.ts`'s `MatchState` splits the 10 kubbs into two
 * sides by their existing scene ids (`kubbSide()`: kubb-0..4 is the
 * far baseline, guest's side; kubb-5..9 is near, host's) — no kubb
 * repositioning needed, this is exactly how phase 1's far-baseline
 * placement already lines up. Only the HOST computes state
 * transitions (from `KubbFelled`/`RoundEnded`, events
 * `SimpleRulesSystem`/`RoundSystem` already emit — neither of those
 * systems is touched) and broadcasts the result
 * (`core/matchSync.ts`) event-driven, not at 20 Hz like the physics
 * syncs above, since match state changes rarely. The guest trusts and
 * applies whatever the host sends.
 *
 * DELIBERATE simplification, not an oversight: real kubb's win move is
 * felling the king, but `KingProtected` is a GLOBAL rule (all 10
 * kubbs, both sides) with no per-side concept — see `core/match.ts`'s
 * own doc comment for why that wasn't reworked here. Phase 3 v1's win
 * condition is "clear the opponent's kubbs first," full stop; no
 * king-felling win yet.
 *
 * NOT enforced: whose turn it is. `MatchState.currentTurn` is tracked
 * and synced, but nothing stops the off-turn player from physically
 * grabbing a stick — real enforcement means gating `OneHandGrabbable`
 * per-player, which needs the same kind of runtime component surgery
 * flagged as too risky for a first pass back in phase 1's collider
 * discussion. Honor system for now, same as two friends at a real
 * kubb court. Also still unhandled: two players grabbing the exact
 * same physical stick at once (host's local grab wins in practice) —
 * an edge case, not the common path with 6 sticks to choose from.
 *
 * MP2 phase 4 (Erik, 2026-09-02, a real finding from thinking through
 * the design, not a live test): mirroring the REMOTE avatar (phase 1)
 * was never enough — the GUEST's own physical presence stayed at world
 * (0,0,0), same as solo play, so a guest would actually be standing on
 * top of the host and reaching for the HOST's stick rack. Two fixes:
 *
 * 1. `maybeRepositionAsGuest()` moves the guest's own XR rig
 *    (`this.player`) to the far baseline once role is known — reusing
 *    `mirrorPoseToFarBaseline()` on the identity pose rather than a
 *    separately hardcoded transform. Everything downstream (head/hand
 *    world positions, presence broadcasts) is correct for free after
 *    that, since it all reads through this same moved transform — so
 *    `applyPoseToPart()` no longer mirrors an incoming pose at all;
 *    both peers now send already-world-correct positions.
 * 2. A second physical rack (`stick-rack-2`/`-collider`, scene JSON —
 *    the exact mirror of the near rack's own authored pose, computed
 *    with the same function, not hand-derived) exists at the far
 *    baseline. Sticks move there when it becomes the guest's turn:
 *    `MenuSystem`'s own `RoundEnded`/`Reset` handler already resets
 *    every stick to its authored NEAR-rack home pose (registered, so
 *    subscribed, before this system — see src/index.ts), so
 *    `moveSticksToFarRack()` only needs to run AFTER that and mirror
 *    each stick's now-current (near-rack) pose, rather than
 *    maintaining a second hardcoded layout. This also means the
 *    off-turn player literally can't reach the sticks — a natural,
 *    non-invasive turn "enforcement" that needed none of the risky
 *    grab-component surgery flagged above.
 */
export class MultiplayerSystem extends createSystem({}) {
  private room?: Room;
  private presenceAction?: MessageAction<PresenceMessage>;
  private pieceSyncAction?: MessageAction<PieceSyncMessage>;
  private helloAction?: MessageAction<HelloMessage>;
  private throwRelayAction?: MessageAction<ThrowRelayMessage>;
  private matchSyncAction?: MessageAction<MatchSyncMessage>;
  private matchState: MatchState = initialMatchState();
  private physicsSystem!: PhysicsSystem;
  private sendTimerS = 0;
  private peerAvatars = new Map<string, Entity>();
  private micTrack: MediaStreamTrack | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly joinedAtMs = Date.now();
  private readonly peerJoinedAtMs = new Map<string, number>();
  private networkedPieces = new Map<string, Entity>();
  private entityIndexToPieceId = new Map<number, string>();
  private hasRepositionedAsGuest = false;
  private pendingMatchSync: {
    peerId: string;
    message: MatchSyncMessage;
  } | null = null;

  // Reused every send tick instead of allocated fresh — see
  // .claude/rules (never allocate in update()); the throttled ~20Hz
  // send path mutates these in place rather than building new objects.
  private readonly headPose: Pose = defaultPose();
  private readonly leftPose: Pose = defaultPose();
  private readonly rightPose: Pose = defaultPose();
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'MultiplayerSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    for (const id of NETWORKED_PIECE_IDS) {
      const entity = this.world.requireSceneEntity(id);
      this.networkedPieces.set(id, entity);
      this.entityIndexToPieceId.set(entity.index, id);
    }

    const roomId = this.roomIdFromUrl();
    this.room = joinRoom({ appId: multiplayer.appId }, roomId);
    this.presenceAction = this.room.makeAction<PresenceMessage>('presence');
    this.presenceAction.onMessage = (data, { peerId }) => {
      const message = parsePresenceMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed presence message', { peerId });
        return;
      }
      this.applyPeerPresence(peerId, message);
    };
    this.helloAction = this.room.makeAction<HelloMessage>('hello');
    this.helloAction.onMessage = (data, { peerId }) => {
      const message = parseHelloMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed hello message', { peerId });
        return;
      }
      this.peerJoinedAtMs.set(peerId, message.joinedAtMs);
      this.maybeRepositionAsGuest();
      this.announceMatchStartIfHost();
      this.applyPendingMatchSync();
    };
    this.pieceSyncAction = this.room.makeAction<PieceSyncMessage>('pieceSync');
    this.pieceSyncAction.onMessage = (data, { peerId }) => {
      // Apply a court snapshot only from the peer we ourselves resolve
      // as host — code review, 2026-09-02: previously accepted from
      // ANY sender, so a second/rogue peer broadcasting on this same
      // action could teleport the shared court on every client.
      if (peerId !== this.resolvedHostPeerId()) {
        return;
      }
      const message = parsePieceSyncMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed piece-sync message', {
          peerId,
        });
        return;
      }
      this.applyPieceSync(message);
    };
    this.throwRelayAction =
      this.room.makeAction<ThrowRelayMessage>('throwRelay');
    this.throwRelayAction.onMessage = (data) => {
      // Only the actual host should ever act on a relayed throw — with
      // exactly 2 peers this is automatic (only a guest sends one), but
      // the check stays cheap and correct if a 3rd peer ever joins.
      if (!this.isHostNow()) {
        return;
      }
      const message = parseThrowRelayMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed throw-relay message', {});
        return;
      }
      this.applyThrowRelay(message);
    };
    this.matchSyncAction = this.room.makeAction<MatchSyncMessage>('matchSync');
    this.matchSyncAction.onMessage = (data, { peerId }) => {
      const message = parseMatchSyncMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed match-sync message', { peerId });
        return;
      }
      this.applyMatchSync(peerId, message);
    };
    this.cleanupFuncs.push(
      gameEvents.on('Thrown', (event) => {
        this.relayLocalThrowIfGuest(event);
      }),
      gameEvents.on('KubbFelled', (event) => {
        this.onKubbFelledForMatch(event.entityId);
      }),
      gameEvents.on('RoundEnded', () => {
        this.onRoundEndedForMatch();
      }),
      gameEvents.on('Reset', (event) => {
        this.onResetForMatch(event.cause);
      }),
    );
    this.room.onPeerJoin = (peerId) => {
      log('info', 'net', 'peer joined', { peerId, roomId });
      void this.helloAction?.send(buildHelloMessage(this.joinedAtMs), {
        target: peerId,
      });
    };
    this.room.onPeerLeave = (peerId) => {
      log('info', 'net', 'peer left', { peerId });
      this.removePeerAvatar(peerId);
      this.removeRemoteAudio(peerId);
      this.peerJoinedAtMs.delete(peerId);
    };
    this.room.onPeerStream = (stream, peerId) => {
      this.playRemoteAudio(peerId, stream);
    };
    log('info', 'net', 'joined multiplayer room', {
      roomId,
      appId: multiplayer.appId,
    });
    void this.setUpMicrophone();
  }

  destroy(): void {
    this.room?.leave();
    for (const entity of this.peerAvatars.values()) {
      entity.dispose();
    }
    this.peerAvatars.clear();
    this.micTrack?.stop();
    this.micTrack = null;
    for (const peerId of [...this.remoteAudioElements.keys()]) {
      this.removeRemoteAudio(peerId);
    }
  }

  update(delta: number): void {
    if (this.micTrack) {
      this.micTrack.enabled = !settingsState.current.micMuted;
    }
    this.sendTimerS += delta;
    if (this.sendTimerS < multiplayer.sendIntervalS) {
      return;
    }
    this.sendTimerS = 0;
    this.sendPresence();
    if (this.isHostNow()) {
      this.sendPieceSync();
    }
  }

  /** True once every currently-connected peer's `hello` has arrived —
   * before that, host/guest status can't be trusted yet (a race right
   * after connecting, see isHostNow()'s own note). Alone in the room
   * (peers.length === 0) trivially counts as resolved. */
  private rolesResolved(): boolean {
    const peerIds = Object.keys(this.room?.getPeers() ?? {});
    return peerIds.every((id) => this.peerJoinedAtMs.has(id));
  }

  /** Only meaningful once rolesResolved() — see its own note. A solo
   * session (no peers) trivially counts as host (harmless — no one's
   * listening). */
  private isHostNow(): boolean {
    if (!this.rolesResolved()) {
      return false;
    }
    const peerIds = Object.keys(this.room?.getPeers() ?? {});
    const peers: PeerJoinInfo[] = peerIds.map((id) => ({
      id,
      joinedAtMs: this.peerJoinedAtMs.get(id) ?? 0,
    }));
    return isHost({ id: selfId, joinedAtMs: this.joinedAtMs }, peers);
  }

  /** The peerId this client itself resolves as host, or null if that's
   * either itself or not yet resolvable (see rolesResolved()) — used to
   * verify an incoming network message actually came from the peer
   * we'd trust, not merely accept whoever's sending it (see
   * pieceSyncAction's onMessage above). */
  private resolvedHostPeerId(): string | null {
    if (!this.rolesResolved()) {
      return null;
    }
    const peerIds = Object.keys(this.room?.getPeers() ?? {});
    const peers: PeerJoinInfo[] = peerIds.map((id) => ({
      id,
      joinedAtMs: this.peerJoinedAtMs.get(id) ?? 0,
    }));
    const hostId = resolveHostId(
      { id: selfId, joinedAtMs: this.joinedAtMs },
      peers,
    );
    return hostId === selfId ? null : hostId;
  }

  /** Root cause of Erik's "ingen är Spelare A" (2026-09-02, second
   * 2-headset test): match state was only ever emitted/broadcast
   * REACTIVELY on its first mutation — the earliest of which is round
   * 1's own RoundEnded turn flip to 'guest'. So the match-row stayed
   * hidden on BOTH clients through the host's entire first turn, and
   * the first label anyone ever saw was "Spelare B:s tur." The role
   * election itself was never wrong — both peers always compare the
   * same two (id, joinedAtMs) pairs, so they can't disagree.
   * Announcing the initial state as soon as roles resolve makes both
   * HUDs show the match — and that it's Player A's turn — from the
   * start. Re-runs harmlessly on every hello (idempotent), which also
   * refreshes a re-joining guest. */
  private announceMatchStartIfHost(): void {
    if (
      !this.rolesResolved() ||
      !this.isHostNow() ||
      !this.hasMultiplayerPeer()
    ) {
      return;
    }
    this.setMatchState(this.matchState);
    this.broadcastMatchState();
  }

  /** Erik's finding, 2026-09-02 — see the class doc's phase-4 note.
   * Runs at most once per session (the flag), as soon as this client's
   * role is known to be guest. */
  private maybeRepositionAsGuest(): void {
    if (
      this.hasRepositionedAsGuest ||
      !this.rolesResolved() ||
      this.isHostNow()
    ) {
      return;
    }
    const farOrigin = mirrorPoseToFarBaseline(defaultPose(), FAR_Z);
    this.player.position.set(...farOrigin.position);
    this.player.quaternion.set(...farOrigin.quaternion);
    this.hasRepositionedAsGuest = true;
    log('info', 'net', 'repositioned to far baseline as guest', {});
  }

  /** Match tracking only means anything with an actual opponent —
   * gates MatchStateChanged so solo play never shows match/turn UI. */
  private hasMultiplayerPeer(): boolean {
    return Object.keys(this.room?.getPeers() ?? {}).length > 0;
  }

  private sendPieceSync(): void {
    if (!this.pieceSyncAction) {
      return;
    }
    const pieces: PieceTransform[] = [];
    for (const [id, entity] of this.networkedPieces) {
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      pieces.push({
        id,
        position: [
          object3D.position.x,
          object3D.position.y,
          object3D.position.z,
        ],
        quaternion: [
          object3D.quaternion.x,
          object3D.quaternion.y,
          object3D.quaternion.z,
          object3D.quaternion.w,
        ],
      });
    }
    void this.pieceSyncAction.send(buildPieceSyncMessage(pieces));
  }

  private applyPieceSync(message: PieceSyncMessage): void {
    for (const piece of message.pieces) {
      const entity = this.networkedPieces.get(piece.id);
      if (!entity || entity.hasComponent(Grabbed)) {
        // Skip a piece the LOCAL player is actively holding — a stale
        // host snapshot would otherwise fight their own hand-tracking
        // while aiming. Kubbs/king are never grabbable, so this only
        // ever matters for sticks.
        continue;
      }
      this.physicsSystem.setBodyTransform(entity, {
        position: piece.position,
        quaternion: piece.quaternion,
      });
    }
  }

  /** Only a non-host relays — the host's own throws are already
   * authoritative and get shared for free via the regular pieces
   * broadcast above. */
  private relayLocalThrowIfGuest(event: GameEvents['Thrown']): void {
    if (this.isHostNow() || !this.throwRelayAction) {
      return;
    }
    const pieceId = this.entityIndexToPieceId.get(Number(event.stickId));
    const entity = pieceId ? this.networkedPieces.get(pieceId) : undefined;
    const object3D = entity?.object3D;
    if (!pieceId || !object3D) {
      return;
    }
    // Thrown fires synchronously from ThrowingSystem.onRelease(),
    // before physics steps again this frame — the stick's current
    // orientation IS its release orientation.
    void this.throwRelayAction.send(
      buildThrowRelayMessage({
        stickId: pieceId,
        position: event.releasePosition,
        quaternion: [
          object3D.quaternion.x,
          object3D.quaternion.y,
          object3D.quaternion.z,
          object3D.quaternion.w,
        ],
        linearVelocity: event.releaseVelocity,
        angularVelocity: event.angularVelocity,
      }),
    );
  }

  /** Applies a guest's relayed throw to the host's own copy of that
   * stick — the identical two-call pattern
   * ThrowingSystem.onRelease() uses for a local throw, so
   * ImpactSystem/ToppleSystem react exactly as if the host itself had
   * thrown it. */
  private applyThrowRelay(message: ThrowRelayMessage): void {
    const entity = this.networkedPieces.get(message.stickId);
    if (!entity) {
      return;
    }
    this.physicsSystem.setBodyTransform(entity, {
      position: message.position,
      quaternion: message.quaternion,
    });
    entity.addComponent(PhysicsManipulation, {
      force: [0, 0, 0],
      linearVelocity: message.linearVelocity,
      angularVelocity: message.angularVelocity,
    });
    entity.setValue(StickState, 'phase', StickPhase.Flying);
    log('info', 'net', 'applied relayed throw', { stickId: message.stickId });
  }

  /** Only the host computes match transitions — a guest's own local
   * KubbFelled/RoundEnded/Reset still fire (SimpleRulesSystem/
   * RoundSystem run on every client independently), but the guest's
   * copy of MatchState comes from the host via matchSyncAction, never
   * computed locally, so this bails out immediately for a guest. */
  private onKubbFelledForMatch(entityId: string): void {
    if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
      return;
    }
    const pieceId = this.entityIndexToPieceId.get(Number(entityId));
    const kubbIndexMatch = pieceId?.match(/^kubb-(\d+)$/);
    if (!kubbIndexMatch) {
      return; // the king, or a piece this session doesn't track — fine
    }
    const side = kubbSide(Number(kubbIndexMatch[1]));
    if (!side) {
      return;
    }
    const nextState = withKubbFelled(this.matchState, side);
    if (nextState.winner) {
      log('info', 'state', 'match won', { winner: nextState.winner });
    }
    this.setMatchState(nextState);
    this.broadcastMatchState();
  }

  private onRoundEndedForMatch(): void {
    if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
      return;
    }
    const nextState = withTurnAdvanced(this.matchState);
    this.setMatchState(nextState);
    if (nextState.currentTurn === 'guest') {
      this.moveSticksToFarRack();
    }
    this.broadcastMatchState();
  }

  /** MenuSystem's own RoundEnded handler already reset every stick to
   * its authored NEAR-rack home pose by the time this runs (it's
   * registered, so subscribed, before MultiplayerSystem — see
   * src/index.ts) — mirror each stick's now-current pose to place it
   * at the far rack instead, reusing the exact same transform as the
   * guest's own player teleport rather than a second hardcoded
   * layout. Turning turn back to 'host' needs no corresponding call:
   * MenuSystem's next reset already puts sticks back at the near
   * rack. */
  private moveSticksToFarRack(): void {
    for (let i = 0; i < STICKS_PER_ROUND; i++) {
      const entity = this.networkedPieces.get(`stick-${i}`);
      const object3D = entity?.object3D;
      if (!entity || !object3D) {
        continue;
      }
      const nearRackPose: Pose = {
        position: [
          object3D.position.x,
          object3D.position.y,
          object3D.position.z,
        ],
        quaternion: [
          object3D.quaternion.x,
          object3D.quaternion.y,
          object3D.quaternion.z,
          object3D.quaternion.w,
        ],
      };
      const farRackPose = mirrorPoseToFarBaseline(nearRackPose, FAR_Z);
      this.physicsSystem.setBodyTransform(entity, {
        position: farRackPose.position,
        quaternion: farRackPose.quaternion,
      });
      entity.setValue(StickState, 'phase', StickPhase.Racked);
    }
  }

  /** Only a genuine 'manual' reset (Reset button, or a mode-switch
   * relayout) wipes MatchState. RoundSystem's own auto-continuation
   * emits Reset with cause 'roundEnd' via MenuSystem's nested
   * resetAll() call (see src/core/events.ts's own note) — that must
   * NOT touch MatchState, since onRoundEndedForMatch() (subscribed to
   * the same outer RoundEnded event, running right after this one —
   * see src/index.ts's registration order) still needs the
   * pre-round-end matchState to compute the turn advance from.
   * Verified by reproduction (docs/DECISIONS.md, 2026-09-02): without
   * this guard, every round-end wiped kubb counts and turn back to
   * their initial values. */
  private onResetForMatch(cause: GameEvents['Reset']['cause']): void {
    if (cause !== 'manual' || !this.isHostNow() || !this.hasMultiplayerPeer()) {
      return;
    }
    this.setMatchState(initialMatchState());
    this.broadcastMatchState();
  }

  /** Applies a match-state snapshot only when the sender is the peer
   * this client itself resolves as host — code review, 2026-09-02: the
   * same sender-authentication gap pieceSync had; any peer in the
   * public lobby could previously end/derail the guest's match
   * (including setting `winner`). The host-side "ignore incoming
   * matchSync" behavior falls out of the same check: for a host,
   * resolvedHostPeerId() is null, so no sender ever matches. Before
   * roles resolve the sender can't be verified yet, so the message is
   * BUFFERED and retried from the hello handler once they do —
   * otherwise the host's initial announce (announceMatchStartIfHost)
   * would race its own hello to the guest and could be silently
   * dropped, regressing the "match visible from the start" fix. */
  private applyMatchSync(peerId: string, message: MatchSyncMessage): void {
    if (!this.rolesResolved()) {
      this.pendingMatchSync = { peerId, message };
      return;
    }
    if (peerId !== this.resolvedHostPeerId()) {
      return;
    }
    this.setMatchState(message.state);
  }

  private applyPendingMatchSync(): void {
    const pending = this.pendingMatchSync;
    if (!pending || !this.rolesResolved()) {
      return;
    }
    this.pendingMatchSync = null;
    this.applyMatchSync(pending.peerId, pending.message);
  }

  private broadcastMatchState(): void {
    void this.matchSyncAction?.send(buildMatchSyncMessage(this.matchState));
  }

  /** The single place MatchState is mutated — always paired with
   * telling the HUD (`MatchStateChanged`, only once an opponent is
   * actually present, so solo play never shows match/turn UI). */
  private setMatchState(state: MatchState): void {
    this.matchState = state;
    if (this.hasMultiplayerPeer()) {
      gameEvents.emit('MatchStateChanged', {
        state,
        mySide: this.isHostNow() ? 'host' : 'guest',
      });
    }
  }

  private async setUpMicrophone(): Promise<void> {
    if (!this.room || !navigator.mediaDevices?.getUserMedia) {
      log('warn', 'net', 'microphone unavailable — voice chat disabled', {});
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const [track] = stream.getAudioTracks();
      if (!track) {
        return;
      }
      track.enabled = !settingsState.current.micMuted;
      this.micTrack = track;
      this.room.addStream(stream);
      log('info', 'net', 'microphone connected', {});
    } catch (error) {
      log('warn', 'net', 'microphone permission denied or unavailable', {
        error: String(error),
      });
    }
  }

  private playRemoteAudio(peerId: string, stream: MediaStream): void {
    this.removeRemoteAudio(peerId);
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    this.remoteAudioElements.set(peerId, audio);
    log('info', 'net', 'peer voice connected', { peerId });
  }

  private removeRemoteAudio(peerId: string): void {
    const audio = this.remoteAudioElements.get(peerId);
    if (!audio) {
      return;
    }
    audio.pause();
    audio.srcObject = null;
    this.remoteAudioElements.delete(peerId);
  }

  private roomIdFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || multiplayer.defaultRoomId;
  }

  private sendPresence(): void {
    if (!this.presenceAction) {
      return;
    }
    this.writePose(this.player.head, this.headPose);
    this.writePose(this.player.gripSpaces.left, this.leftPose);
    this.writePose(this.player.gripSpaces.right, this.rightPose);
    const message = buildPresenceMessage({
      head: this.headPose,
      leftHand: this.leftPose,
      rightHand: this.rightPose,
    });
    void this.presenceAction.send(message);
  }

  private writePose(object3D: Object3D, target: Pose): void {
    object3D.getWorldPosition(this.tmpPos);
    object3D.getWorldQuaternion(this.tmpQuat);
    target.position[0] = this.tmpPos.x;
    target.position[1] = this.tmpPos.y;
    target.position[2] = this.tmpPos.z;
    target.quaternion[0] = this.tmpQuat.x;
    target.quaternion[1] = this.tmpQuat.y;
    target.quaternion[2] = this.tmpQuat.z;
    target.quaternion[3] = this.tmpQuat.w;
  }

  private applyPeerPresence(peerId: string, message: PresenceMessage): void {
    const avatarEntity = this.peerAvatars.get(peerId);
    if (!avatarEntity) {
      // First message from a new peer — instantiate its avatar
      // asynchronously; messages that arrive before it resolves are
      // simply dropped (the next ~20Hz tick catches up).
      void this.createPeerAvatar(peerId, message);
      return;
    }
    const object3D = avatarEntity.object3D;
    if (!object3D) {
      return;
    }
    this.applyPoseToPart(object3D, 'head', message.head);
    this.applyPoseToPart(object3D, 'leftHand', message.leftHand);
    this.applyPoseToPart(object3D, 'rightHand', message.rightHand);
  }

  /** No mirroring here anymore (2026-09-02) — now that
   * maybeRepositionAsGuest() physically moves the guest's own rig,
   * BOTH peers' outgoing presence is already in correct shared-world
   * coordinates; the receiver just applies it as-is. */
  private applyPoseToPart(root: Object3D, name: string, pose: Pose): void {
    const part = root.getObjectByName(name);
    if (!part) {
      return;
    }
    this.tmpPos.set(...pose.position);
    part.position.copy(this.tmpPos);
    part.quaternion.set(...pose.quaternion);
  }

  private async createPeerAvatar(
    peerId: string,
    firstMessage: PresenceMessage,
  ): Promise<void> {
    if (this.peerAvatars.has(peerId)) {
      return;
    }
    const object3D =
      await this.world.assets.instantiate<Object3D>('peer-avatar');
    const entity = this.world.createTransformEntity(object3D);
    this.peerAvatars.set(peerId, entity);
    log('info', 'net', 'peer avatar created', { peerId });
    this.applyPoseToPart(object3D, 'head', firstMessage.head);
    this.applyPoseToPart(object3D, 'leftHand', firstMessage.leftHand);
    this.applyPoseToPart(object3D, 'rightHand', firstMessage.rightHand);
  }

  private removePeerAvatar(peerId: string): void {
    const entity = this.peerAvatars.get(peerId);
    if (!entity) {
      return;
    }
    entity.dispose();
    this.peerAvatars.delete(peerId);
  }
}
