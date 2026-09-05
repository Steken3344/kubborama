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
import { match, multiplayer } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import {
  initialMatchState,
  isFinished,
  kubbId,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from '../core/match.js';
import type { MatchState } from '../core/match.js';
import {
  buildMatchSyncMessage,
  MATCH_SYNC_SCHEMA_VERSION,
  parseMatchSyncMessage,
  peekSchemaVersion,
} from '../core/matchSync.js';
import type { MatchSyncMessage } from '../core/matchSync.js';
import { buildResetRequest, parseResetRequest } from '../core/resetRelay.js';
import type { ResetRequestMessage } from '../core/resetRelay.js';
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
import { activeFarBaselineZ } from './activeCourt.js';

// King, both kubb baselines, and every stick — MP2's shared court
// state (see class doc). A stick's initial throw is relayed
// separately (core/throwRelay.ts, needs velocity); once flying it's
// just another periodically-synced piece like this.
const NETWORKED_PIECE_IDS = [
  'king',
  ...Array.from({ length: KUBB_COUNT * 2 }, (_, i) => kubbId(i)),
  ...Array.from({ length: STICKS_PER_ROUND }, (_, i) => `stick-${i}`),
];

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
 *    the turn advance rides on `MenuSystem`'s `Reset{cause:'roundEnd'}`
 *    (emitted only after its own teleport of every stick back to the
 *    near rack), and `moveSticksToFarRack()` mirrors a home pose
 *    captured once at init() — so neither the timing nor the pose
 *    source depends on which order the two systems were registered
 *    in (see onResetForMatch()). This also means the off-turn player
 *    literally can't reach the sticks — a natural, non-invasive turn
 *    "enforcement" that needed none of the risky grab-component
 *    surgery flagged above.
 *
 * MP3a (Erik, 2026-09-05, docs/superpowers/specs/2026-09-05-match-
 * rules-design.md): a REAL match supersedes phase 3's "clear the
 * kubbs" win. The king decides — after every opponent kubb: the thrower
 * wins; earlier: the thrower loses — applied after a short grace so a
 * kubb toppled by the same stick counts first (`kingFelledAtS`).
 * `KingProtected` is not used in a match. Physical consequences
 * (sin-bin per side, auto-restart) live in systems/matchRules.ts; this
 * system only runs the reducer and syncs. A guest's "Ny runda" is
 * relayed to the host (`resetRequest`), since only the host resets.
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
  private micTrack: MediaStreamTrack | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly joinedAtMs = Date.now();
  private readonly peerJoinedAtMs = new Map<string, number>();
  private networkedPieces = new Map<string, Entity>();
  private entityIndexToPieceId = new Map<number, string>();
  private stickNearRackHomePoses = new Map<string, Pose>();
  private hasRepositionedAsGuest = false;
  private pendingMatchSync: {
    peerId: string;
    message: MatchSyncMessage;
  } | null = null;
  private pendingThrowRelay: ThrowRelayMessage | null = null;
  private resetRequestAction?: MessageAction<ResetRequestMessage>;
  /** MP3a: KingFelled is applied after `match.kingDecisionGraceS`, not
   * immediately — ToppleSystem emits per piece in rest order, so a kubb
   * toppled by the same stick must get counted first (spec review I1).
   * null = no decision pending. */
  private kingFelledAtS: number | null = null;

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
    // Captured once, here, at init() — code review, 2026-09-02:
    // moveSticksToFarRack() used to read each stick's CURRENT pose and
    // assume MenuSystem's own RoundEnded reset had already re-racked it
    // (an implicit src/index.ts registration-order contract). Capturing
    // the authored near-rack pose directly removes that dependency —
    // this system no longer cares what order resets ran in.
    for (let i = 0; i < STICKS_PER_ROUND; i++) {
      const entity = this.networkedPieces.get(`stick-${i}`);
      const object3D = entity?.object3D;
      if (!object3D) {
        continue;
      }
      this.stickNearRackHomePoses.set(`stick-${i}`, this.localPoseOf(object3D));
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
      // MP3b: avatars live in PeerAvatarSystem — hand the validated
      // message over on the bus rather than owning Object3Ds here.
      gameEvents.emit('PeerPresence', { peerId, message });
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
      this.applyPendingThrowRelay();
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
      const message = parseThrowRelayMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed throw-relay message', {});
        return;
      }
      // Only the actual host should ever act on a relayed throw — with
      // exactly 2 peers this is automatic (only a guest sends one), but
      // the check stays cheap and correct if a 3rd peer ever joins.
      // Before roles resolve, isHostNow() is false on BOTH clients (see
      // its own note) — a guest's throw arriving in that sub-second
      // window would previously be silently dropped forever (code
      // review, 2026-09-02, gh#9). Buffer the single most recent one
      // and retry once roles resolve, from the hello handler.
      if (!this.rolesResolved()) {
        this.pendingThrowRelay = message;
        return;
      }
      if (!this.isHostNow()) {
        return;
      }
      this.applyThrowRelay(message);
    };
    this.matchSyncAction = this.room.makeAction<MatchSyncMessage>('matchSync');
    this.matchSyncAction.onMessage = (data, { peerId }) => {
      const message = parseMatchSyncMessage(data);
      if (!message) {
        // With the PWA's autoUpdate one headset can run the previous
        // build until it reloads — make that diagnosable (spec review
        // I8) instead of a generic "malformed".
        const version = peekSchemaVersion(data);
        if (version !== null && version !== MATCH_SYNC_SCHEMA_VERSION) {
          log('warn', 'net', 'match-sync schema version mismatch', {
            peerId,
            theirs: version,
            ours: MATCH_SYNC_SCHEMA_VERSION,
          });
        } else {
          log('warn', 'net', 'dropped malformed match-sync message', {
            peerId,
          });
        }
        return;
      }
      this.applyMatchSync(peerId, message);
    };
    this.resetRequestAction =
      this.room.makeAction<ResetRequestMessage>('resetRequest');
    this.resetRequestAction.onMessage = (data, { peerId }) => {
      // A guest's "Ny runda" (spec review C2). Only the host acts, and
      // only for a peer that is actually in the room.
      if (!this.isHostNow() || !(peerId in (this.room?.getPeers() ?? {}))) {
        return;
      }
      if (!parseResetRequest(data)) {
        log('warn', 'net', 'dropped malformed reset request', { peerId });
        return;
      }
      log('info', 'net', 'guest requested a reset', { peerId });
      gameEvents.emit('ResetRequested', {});
    };
    this.cleanupFuncs.push(
      gameEvents.on('Thrown', (event) => {
        this.relayLocalThrowIfGuest(event);
      }),
      gameEvents.on('KubbFelled', (event) => {
        this.onKubbFelledForMatch(event.entityId);
      }),
      gameEvents.on('KingFelled', (event) => {
        if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
          return;
        }
        if (this.kingFelledAtS === null && !isFinished(this.matchState)) {
          // The event's own timestamp — same elics clock as update()'s
          // `time`, and current rather than last frame's.
          this.kingFelledAtS = event.timeS;
        }
      }),
      // No RoundEnded subscription on purpose — the turn advance rides
      // on MenuSystem's Reset{cause:'roundEnd'} instead; see
      // onResetForMatch()/advanceTurnForMatch() for why.
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
      gameEvents.emit('PeerLeft', { peerId });
      this.removeRemoteAudio(peerId);
      this.peerJoinedAtMs.delete(peerId);
      // Only clear match state once EVERY peer is gone, not on a leave
      // in a room with 3+ peers — hasMultiplayerPeer() reflects the
      // count AFTER this leave (getPeers() is already updated by the
      // time onPeerLeave fires). Code review, 2026-09-02 (gh#10): the
      // HUD's match-row/role-row otherwise stay visible with stale
      // text into subsequent solo play.
      if (!this.hasMultiplayerPeer()) {
        // Undo the physical side of the match too, not just the state
        // (second review, 2026-09-03): a former guest otherwise stays
        // standing at the far baseline — and if the host reloads and
        // rejoins with a later joinedAtMs, the stranded player becomes
        // host with the sticks at the near rack, out of reach of both.
        const sticksAtFarRack = this.matchState.currentTurn === 'guest';
        this.matchState = initialMatchState();
        this.pendingMatchSync = null;
        this.pendingThrowRelay = null;
        this.kingFelledAtS = null;
        if (this.hasRepositionedAsGuest) {
          const origin = defaultPose();
          this.player.position.set(...origin.position);
          this.player.quaternion.set(...origin.quaternion);
          this.hasRepositionedAsGuest = false;
          log('info', 'net', 'returned to default origin — room empty', {});
        }
        if (sticksAtFarRack) {
          this.moveSticksToNearRack();
        }
        gameEvents.emit('MultiplayerPeerDisconnected', {});
      }
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
    this.micTrack?.stop();
    this.micTrack = null;
    for (const peerId of [...this.remoteAudioElements.keys()]) {
      this.removeRemoteAudio(peerId);
    }
  }

  update(delta: number, time: number): void {
    if (
      this.kingFelledAtS !== null &&
      time - this.kingFelledAtS >= match.kingDecisionGraceS
    ) {
      this.applyPendingKingDecision();
    }
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
    // The far baseline of the ACTIVE court, not the default preset's
    // (Advanced plays on the 8 m tournament court) — see activeCourt.ts.
    const farOrigin = mirrorPoseToFarBaseline(
      defaultPose(),
      activeFarBaselineZ(),
    );
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
      pieces.push({ id, ...this.localPoseOf(object3D) });
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
        quaternion: this.localPoseOf(object3D).quaternion,
        linearVelocity: event.releaseVelocity,
        angularVelocity: event.angularVelocity,
        hand: event.handId,
      }),
    );
  }

  /** Applies a guest's relayed throw to the host's own copy of that
   * stick — the identical two-call pattern
   * ThrowingSystem.onRelease() uses for a local throw, so
   * ImpactSystem/ToppleSystem react exactly as if the host itself had
   * thrown it. `lastThrowerHand` is set from the relay message (code
   * review, 2026-09-02) — without it, a stick the host threw locally
   * earlier and the guest later re-threw kept the HOST's own last hand,
   * misattributing impact haptics to the wrong controller. */
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
    entity.setValue(StickState, 'lastThrowerHand', message.hand);
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
    if (!pieceId) {
      return;
    }
    // The reducer ignores non-kubb ids, duplicates and own-side
    // ricochets by returning the same reference — nothing to broadcast.
    const nextState = withKubbFelled(this.matchState, pieceId);
    if (nextState === this.matchState) {
      return;
    }
    this.setMatchState(nextState);
    this.broadcastMatchState();
  }

  /** The one Reset subscriber that cares WHY it was reset. MenuSystem
   * is the single emitter (src/systems/menu.ts resetAll()), and it
   * emits only AFTER teleporting every piece back to its home pose:
   *
   * - 'roundEnd' — RoundSystem's auto-continuation into the next
   *   round: advance the turn (and place sticks at whichever rack the
   *   new turn needs). Driving this from the nested Reset rather than
   *   from RoundEnded itself is what makes it independent of system
   *   registration order: no matter which order the two systems
   *   subscribed to RoundEnded in, the far-rack move here can never
   *   be undone by MenuSystem's teleport, because it only ever runs in
   *   response to that teleport having finished. (Second review,
   *   2026-09-03: the earlier RoundEnded-based version WAS order-
   *   dependent — flip the registration and the teleport would have
   *   wiped the far-rack placement — and gh#12 had been closed on the
   *   mistaken claim that it wasn't.)
   * - 'manual' — Reset button / mode-switch relayout: wipe the match.
   *   Sticks are already home (near rack) courtesy of the same
   *   teleport, which matches the fresh state's 'host' turn. */
  private onResetForMatch(cause: GameEvents['Reset']['cause']): void {
    if (cause === 'roundEnd') {
      this.advanceTurnForMatch();
      return;
    }
    if (!this.hasMultiplayerPeer()) {
      return;
    }
    if (!this.isHostNow()) {
      // Guest pressed "Ny runda" (spec review C2): not authoritative —
      // relay it. The host's resulting reset + fresh match state
      // overwrite the guest's local teleport via pieceSync/matchSync
      // within a tick.
      void this.resetRequestAction?.send(buildResetRequest());
      return;
    }
    this.kingFelledAtS = null;
    this.setMatchState(initialMatchState());
    this.broadcastMatchState();
  }

  /** Applies a deferred king decision (see kingFelledAtS) for whoever
   * holds the turn RIGHT NOW — so it must run before anything flips the
   * turn. Same-reference return from the reducer means nothing to do. */
  private applyPendingKingDecision(): void {
    this.kingFelledAtS = null;
    const next = withKingFelled(this.matchState);
    if (next === this.matchState) {
      return;
    }
    log('info', 'state', 'match decided by the king', {
      winner: next.winner,
      endReason: next.endReason,
    });
    this.setMatchState(next);
    this.broadcastMatchState();
  }

  private advanceTurnForMatch(): void {
    if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
      return;
    }
    // Code review, 2026-09-05 (Critical): the 6th stick can fell the king
    // and settle within the 1.5 s grace, ending the round — flipping the
    // turn BEFORE the deferred decision would attribute the king to the
    // wrong thrower and invert the result. Decide first; the reset that
    // triggered this has already teleported any still-falling kubb home,
    // so nothing the grace was waiting for can arrive anyway.
    if (this.kingFelledAtS !== null) {
      this.applyPendingKingDecision();
    }
    const nextState = withTurnAdvanced(this.matchState);
    this.setMatchState(nextState);
    if (nextState.currentTurn === 'guest') {
      this.moveSticksToFarRack();
    }
    this.broadcastMatchState();
  }

  /** Mirrors each stick's captured near-rack home pose
   * (`stickNearRackHomePoses`, set once in init()) to the far rack —
   * the same transform as the guest's own player teleport, not a
   * second hardcoded layout. */
  private moveSticksToFarRack(): void {
    this.placeSticks((nearRackPose) =>
      mirrorPoseToFarBaseline(nearRackPose, activeFarBaselineZ()),
    );
  }

  /** Back to the captured near-rack home pose — used when the room
   * empties while sticks were at the far rack (see onPeerLeave); the
   * normal turn-back-to-host path needs no call since MenuSystem's own
   * reset already puts them there. */
  private moveSticksToNearRack(): void {
    this.placeSticks((nearRackPose) => nearRackPose);
  }

  private placeSticks(transform: (nearRackPose: Pose) => Pose): void {
    for (let i = 0; i < STICKS_PER_ROUND; i++) {
      const entity = this.networkedPieces.get(`stick-${i}`);
      const nearRackPose = this.stickNearRackHomePoses.get(`stick-${i}`);
      if (!entity || !nearRackPose) {
        continue;
      }
      const target = transform(nearRackPose);
      this.physicsSystem.setBodyTransform(entity, {
        position: target.position,
        quaternion: target.quaternion,
      });
      entity.setValue(StickState, 'phase', StickPhase.Racked);
    }
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

  /** See throwRelayAction's onMessage — a guest's throw that arrived
   * before this client's own roles resolved. Applied only if roles now
   * say this client IS host; if they resolved the other way (this
   * client is actually the guest, so the message was never meant for
   * it), it's simply discarded rather than misapplied. */
  private applyPendingThrowRelay(): void {
    const pending = this.pendingThrowRelay;
    if (!pending || !this.rolesResolved()) {
      return;
    }
    this.pendingThrowRelay = null;
    if (this.isHostNow()) {
      this.applyThrowRelay(pending);
    }
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
      colorIndex: settingsState.current.avatarColorIndex,
    });
    void this.presenceAction.send(message);
  }

  /** A piece's LOCAL pose as a fresh Pose — pieces are direct children
   * of the level root, so local == world for them (unlike the player
   * rig parts writePose() below reads in WORLD space). Allocates, so
   * only for init/event paths and the 20 Hz send tick, which already
   * builds a fresh message — never per frame. Extracted on the third
   * copy of the same eleven-line array literal (second review,
   * 2026-09-03; CLAUDE.md's extract-on-second-occurrence rule). */
  private localPoseOf(object3D: Object3D): Pose {
    return {
      position: [object3D.position.x, object3D.position.y, object3D.position.z],
      quaternion: [
        object3D.quaternion.x,
        object3D.quaternion.y,
        object3D.quaternion.z,
        object3D.quaternion.w,
      ],
    };
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
}
