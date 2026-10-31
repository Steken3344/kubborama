import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { courtHalves } from './inkast.js';
import {
  directorEvent,
  directorTick,
  initialDirector,
  shotCameraPose,
  TOUR_SHOT_S,
} from './director.js';
import type { DirectorState, Shot } from './director.js';

const opts = { minShotS: 2.5, closeUpS: 2, maxShotS: 5 };

/** A shot fixture: the given fields over sensible defaults. */
const at = (fields: Partial<Shot> & Pick<Shot, 'kind'>): Shot => ({
  side: null,
  focus: null,
  pieceId: null,
  startedAtS: 0,
  variant: 0,
  ...fields,
});
const step = (
  s: DirectorState,
  e: Parameters<typeof directorEvent>[1],
  t: number,
) => directorEvent(s, e, t, opts);

describe('director — which shot', () => {
  it('tours the garden while there is no match', () => {
    expect(initialDirector().shot.kind).toBe('tour');
    const s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    expect(step(s, { type: 'noMatch' }, 10).shot.kind).toBe('tour');
  });

  it("a turn starts over the thrower's shoulder; inkast goes wide", () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'guest', phase: 'throwing' },
      0,
    );
    expect(s.shot).toMatchObject({ kind: 'overShoulder', side: 'guest' });
    s = step(s, { type: 'turn', side: 'host', phase: 'inkast' }, 10);
    expect(s.shot).toMatchObject({ kind: 'inkastWide', side: 'host' });
  });

  it('a throw cuts to the follow cam at once, then back after landing', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    s = step(s, { type: 'throw', pieceId: 'stick-2' }, 0.5);
    expect(s.shot).toMatchObject({ kind: 'follow', pieceId: 'stick-2' });
    s = step(s, { type: 'landed' }, 1.0);
    // Too soon to cut (min shot length): it waits…
    expect(s.shot.kind).toBe('follow');
    s = directorTick(s, 3.1, opts);
    expect(s.shot).toMatchObject({ kind: 'overShoulder', side: 'host' });
  });

  it('a felled kubb gets a short close-up, then the play resumes', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    s = step(s, { type: 'felled', position: [0.6, 0.1, -6] }, 5);
    expect(s.shot).toMatchObject({ kind: 'closeUp', focus: [0.6, 0.1, -6] });
    s = directorTick(s, 6, opts);
    expect(s.shot.kind).toBe('closeUp');
    s = directorTick(s, 7.6, opts);
    expect(s.shot).toMatchObject({ kind: 'overShoulder', side: 'host' });
  });

  it('a second fell during a close-up does not restart it', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    s = step(s, { type: 'felled', position: [0, 0.1, -6] }, 5);
    const first = s.shot;
    s = step(s, { type: 'felled', position: [1, 0.1, -6] }, 5.5);
    expect(s.shot).toBe(first);
  });

  it('a win goes wide on the winner', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    s = step(s, { type: 'win', side: 'guest' }, 9);
    expect(s.shot).toMatchObject({ kind: 'wide', side: 'guest' });
  });

  it('a resting shot moves on to another angle of the same kind', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    const first = s.shot;
    s = directorTick(s, 4.9, opts);
    expect(s.shot).toBe(first);
    s = directorTick(s, 5.1, opts);
    expect(s.shot).toMatchObject({ kind: 'overShoulder', side: 'host' });
    expect(s.shot.variant).not.toBe(first.variant);
    expect(s.shot.startedAtS).toBe(5.1);
  });

  it('a follow cam is never re-angled mid-flight', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    s = step(s, { type: 'throw', pieceId: 'stick-1' }, 1);
    const follow = s.shot;
    s = directorTick(s, 9, opts);
    expect(s.shot).toBe(follow);
  });

  it('each cut takes the next angle, so repeats look different', () => {
    let s = step(
      initialDirector(),
      { type: 'turn', side: 'host', phase: 'throwing' },
      0,
    );
    const seen = new Set<number>();
    for (let i = 0; i < 3; i += 1) {
      const t = 1 + i * 4;
      s = step(s, { type: 'throw', pieceId: 'stick-0' }, t);
      seen.add(s.shot.variant);
      s = step(s, { type: 'landed' }, t + 3);
    }
    expect(seen.size).toBe(3);
  });
});

describe('director — camera poses', () => {
  const kinds = (halves: ReturnType<typeof courtHalves>): Shot[] => [
    at({ kind: 'tour' }),
    ...(['host', 'guest', null] as const).flatMap((side) =>
      [0, 1, 2, 3].flatMap((variant) => [
        at({ kind: 'overShoulder', side, variant }),
        at({ kind: 'inkastWide', side, variant }),
        at({ kind: 'wide', side, variant }),
      ]),
    ),
    // Close-ups and follows anywhere a piece can be on the court.
    ...[-2.4, 0, 2.4].flatMap((x) =>
      [halves.nearBaselineZ, halves.centreZ, halves.farBaselineZ].flatMap((z) =>
        [0, 1, 2].flatMap((variant) => [
          at({ kind: 'closeUp', focus: [x, 0.1, z], variant }),
          at({ kind: 'follow', side: 'host', focus: [x, 1.5, z], variant }),
          at({ kind: 'follow', side: 'guest', focus: [x, 1.5, z], variant }),
          at({ kind: 'follow', side: 'host', focus: [x, 3.5, z], variant }),
        ]),
      ),
    ),
  ];

  for (const preset of [
    { widthM: 5, lengthM: 8 },
    { widthM: 4, lengthM: 6 },
  ]) {
    const halves = courtHalves(preset);
    it(`stays above the grass and inside the garden (${preset.lengthM} m court)`, () => {
      for (const shot of kinds(halves)) {
        for (const t of [0, 3, 6, TOUR_SHOT_S * 2.5]) {
          const { position, target } = shotCameraPose(shot, halves, t, opts);
          expect(position[1]).toBeGreaterThan(0.3);
          expect(Math.abs(position[0])).toBeLessThan(7);
          expect(position[2]).toBeGreaterThan(-12);
          expect(position[2]).toBeLessThan(5);
          expect(target.every(Number.isFinite)).toBe(true);
        }
      }
    });

    it(`resting shots are camera moves, not stills (${preset.lengthM} m court)`, () => {
      for (const kind of ['overShoulder', 'inkastWide', 'wide'] as const) {
        for (const variant of [0, 1, 2, 3]) {
          const shot = at({ kind, side: 'host', variant });
          const a = shotCameraPose(shot, halves, 0, opts).position;
          const b = shotCameraPose(shot, halves, opts.maxShotS, opts).position;
          const movedM = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          expect(movedM, `${kind} ${variant}`).toBeGreaterThan(0.3);
        }
      }
    });
  }

  it('over the shoulder looks down the court from behind the thrower', () => {
    const halves = courtHalves({ widthM: 5, lengthM: 8 });
    // Variants 0–2 stand behind the thrower; 3 is the reverse angle.
    for (const variant of [0, 1, 2]) {
      const host = shotCameraPose(
        at({ kind: 'overShoulder', side: 'host', variant }),
        halves,
        0,
        opts,
      );
      expect(host.position[2]).toBeGreaterThan(halves.nearBaselineZ);
      expect(host.target[2]).toBeLessThan(halves.centreZ);
      const guest = shotCameraPose(
        at({ kind: 'overShoulder', side: 'guest', variant }),
        halves,
        0,
        opts,
      );
      expect(guest.position[2]).toBeLessThan(halves.farBaselineZ);
      expect(guest.target[2]).toBeGreaterThan(halves.centreZ);
    }
  });

  it('the reverse angle looks back at the thrower from the court', () => {
    const halves = courtHalves({ widthM: 5, lengthM: 8 });
    const pose = shotCameraPose(
      at({ kind: 'overShoulder', side: 'host', variant: 3 }),
      halves,
      0,
      opts,
    );
    expect(pose.position[2]).toBeLessThan(halves.nearBaselineZ);
    expect(pose.target[2]).toBe(halves.nearBaselineZ);
  });
});

describe('director — camera never inside a player', () => {
  // A player stands up to ~0.6 m behind the line, head at ~1.7 m: a
  // cylinder of 0.6 m radius up to 2 m (the bot match's first run had
  // the chase cam inside the guest's head).
  for (const preset of [
    { widthM: 5, lengthM: 8 },
    { widthM: 4, lengthM: 6 },
  ]) {
    it(`keeps clear of both throwers (${preset.lengthM} m court)`, () => {
      const halves = courtHalves(preset);
      // Throwers stand anywhere up to half a metre either side of centre.
      const players = [-0.5, 0, 0.5].flatMap((x) => [
        { x, z: halves.nearBaselineZ + 0.3 },
        { x, z: halves.farBaselineZ - 0.3 },
      ]);
      for (const side of ['host', 'guest'] as const) {
        const shots: Shot[] = [
          ...[0, 1, 2, 3].map((variant) =>
            at({ kind: 'overShoulder', side, variant }),
          ),
          ...[0, 1].map((variant) => at({ kind: 'inkastWide', side, variant })),
          ...[0, 1].map((variant) => at({ kind: 'wide', side, variant })),
          // Close-ups on kubbs at the thrower's own baseline.
          ...[-2, -1.3, 0, 1.3, 2].flatMap((x) =>
            [0, 1].map((variant) =>
              at({
                kind: 'closeUp',
                variant,
                focus: [
                  x,
                  0.1,
                  side === 'host' ? halves.nearBaselineZ : halves.farBaselineZ,
                ],
              }),
            ),
          ),
          // A follow cam right after the release, and mid-flight.
          ...[0, 1, 2].flatMap((variant) =>
            [0.5, 3].map((t) => {
              const own =
                side === 'host' ? halves.nearBaselineZ : halves.farBaselineZ;
              const z = own + (side === 'host' ? -t : t);
              return at({
                kind: 'follow',
                side,
                variant,
                focus: [0.2, 1.5, z],
              });
            }),
          ),
        ];
        for (const shot of shots) {
          for (let t = 0; t <= opts.maxShotS; t += 0.5) {
            const [x, y, z] = shotCameraPose(shot, halves, t, opts).position;
            for (const p of players) {
              const inside = Math.hypot(x - p.x, z - p.z) < 0.6 && y < 2;
              expect(
                inside,
                `${shot.kind} ${side} v${shot.variant} t=${t} in a player (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
              ).toBe(false);
            }
          }
        }
      }
    });
  }
});

describe('director — camera never inside the scenery', () => {
  // Conservative cylinders around every tree, rock, cliff and the HUD
  // sign in the real scene: a camera must be outside each one or above it.
  const scene = JSON.parse(
    readFileSync('public/scenes/main.iwsdk.scene.json', 'utf8'),
  ) as {
    nodes: Array<{
      id: string;
      transform?: { position?: number[]; scale?: number };
    }>;
  };
  const obstacles = scene.nodes.flatMap((n) => {
    const p = n.transform?.position;
    const scale = n.transform?.scale ?? 1;
    if (!p) return [];
    const [x = 0, , z = 0] = p;
    if (/^tree/u.test(n.id))
      return [{ id: n.id, x, z, r: 0.42 * scale, h: 1.3 * scale }];
    if (/^(rock|bush|campsite)/u.test(n.id))
      return [{ id: n.id, x, z, r: 0.3 * scale + 0.3, h: 0.5 * scale + 0.4 }];
    if (/^cliff/u.test(n.id)) return [{ id: n.id, x, z, r: 2, h: 5 }];
    if (n.id === 'hud-panel') return [{ id: n.id, x, z, r: 1.1, h: 2.7 }];
    return [];
  });

  const shotsAt = (halves: ReturnType<typeof courtHalves>): Shot[] => [
    at({ kind: 'tour' }),
    ...(['host', 'guest', null] as const).flatMap((side) =>
      [0, 1, 2, 3].flatMap((variant) => [
        at({ kind: 'overShoulder', side, variant }),
        at({ kind: 'inkastWide', side, variant }),
        at({ kind: 'wide', side, variant }),
      ]),
    ),
    // Close-ups and follows anywhere a piece can be on the court, and
    // a little beyond it (a stick sailing long).
    ...[-2.4, 0, 2.4].flatMap((x) =>
      [
        halves.nearBaselineZ + 1,
        halves.nearBaselineZ,
        halves.centreZ,
        halves.farBaselineZ,
        halves.farBaselineZ - 1,
      ].flatMap((z) =>
        [0, 1, 2].flatMap((variant) => [
          at({ kind: 'closeUp', focus: [x, 0.1, z], variant }),
          at({ kind: 'follow', side: 'host', focus: [x, 1.5, z], variant }),
          at({ kind: 'follow', side: 'guest', focus: [x, 1.5, z], variant }),
          at({ kind: 'follow', side: 'host', focus: [x, 0.2, z], variant }),
          at({ kind: 'follow', side: 'guest', focus: [x, 0.2, z], variant }),
        ]),
      ),
    ),
  ];

  for (const preset of [
    { widthM: 5, lengthM: 8 },
    { widthM: 4, lengthM: 6 },
  ]) {
    it(`clears every obstacle (${preset.lengthM} m court)`, () => {
      const halves = courtHalves(preset);
      for (const shot of shotsAt(halves)) {
        // The tour loops over its legs; every other move is done by
        // maxShotS (and a follow cam is live, not timed).
        const endS = shot.kind === 'tour' ? TOUR_SHOT_S * 4 : opts.maxShotS;
        for (let t = 0; t <= endS; t += 0.5) {
          const [x, y, z] = shotCameraPose(shot, halves, t, opts).position;
          for (const o of obstacles) {
            const inside = Math.hypot(x - o.x, z - o.z) < o.r && y < o.h;
            expect(
              inside,
              `${shot.kind} ${shot.side ?? ''} v${shot.variant} at t=${t} inside ${o.id} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
            ).toBe(false);
          }
        }
      }
    });
  }
});
