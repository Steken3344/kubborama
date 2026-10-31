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

const opts = { minShotS: 2.5, closeUpS: 2 };
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
});

describe('director — camera poses', () => {
  const shots: Shot[] = [
    { kind: 'tour', side: null, focus: null, pieceId: null, startedAtS: 0 },
    {
      kind: 'overShoulder',
      side: 'host',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'overShoulder',
      side: 'guest',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'inkastWide',
      side: 'guest',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'closeUp',
      side: null,
      focus: [1, 0.1, -7],
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'follow',
      side: 'host',
      focus: [0.2, 2, -3],
      pieceId: 'stick-0',
      startedAtS: 0,
    },
    { kind: 'wide', side: 'guest', focus: null, pieceId: null, startedAtS: 0 },
  ];
  for (const preset of [
    { widthM: 5, lengthM: 8 },
    { widthM: 4, lengthM: 6 },
  ]) {
    const halves = courtHalves(preset);
    it(`stays above the grass and inside the garden (${preset.lengthM} m court)`, () => {
      for (const shot of shots) {
        for (const t of [0, 3, TOUR_SHOT_S * 2.5]) {
          const { position, target } = shotCameraPose(shot, halves, t);
          expect(position[1]).toBeGreaterThan(0.3);
          expect(Math.abs(position[0])).toBeLessThan(7);
          expect(position[2]).toBeGreaterThan(-12);
          expect(position[2]).toBeLessThan(5);
          expect(target.every(Number.isFinite)).toBe(true);
        }
      }
    });
  }

  it('over the shoulder looks down the court from behind the thrower', () => {
    const halves = courtHalves({ widthM: 5, lengthM: 8 });
    const host = shotCameraPose(
      {
        kind: 'overShoulder',
        side: 'host',
        focus: null,
        pieceId: null,
        startedAtS: 0,
      },
      halves,
      0,
    );
    expect(host.position[2]).toBeGreaterThan(halves.nearBaselineZ);
    expect(host.target[2]).toBeLessThan(halves.centreZ);
    const guest = shotCameraPose(
      {
        kind: 'overShoulder',
        side: 'guest',
        focus: null,
        pieceId: null,
        startedAtS: 0,
      },
      halves,
      0,
    );
    expect(guest.position[2]).toBeLessThan(halves.farBaselineZ);
    expect(guest.target[2]).toBeGreaterThan(halves.centreZ);
  });
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
    { kind: 'tour', side: null, focus: null, pieceId: null, startedAtS: 0 },
    {
      kind: 'overShoulder',
      side: 'host',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'overShoulder',
      side: 'guest',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'inkastWide',
      side: 'host',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    {
      kind: 'inkastWide',
      side: 'guest',
      focus: null,
      pieceId: null,
      startedAtS: 0,
    },
    { kind: 'wide', side: 'host', focus: null, pieceId: null, startedAtS: 0 },
    { kind: 'wide', side: 'guest', focus: null, pieceId: null, startedAtS: 0 },
    { kind: 'wide', side: null, focus: null, pieceId: null, startedAtS: 0 },
    // Close-ups and follows anywhere a piece can be on the court.
    ...[-2.4, 0, 2.4].flatMap((x) =>
      [halves.nearBaselineZ, halves.centreZ, halves.farBaselineZ].flatMap(
        (z) => [
          {
            kind: 'closeUp' as const,
            side: null,
            focus: [x, 0.1, z] as [number, number, number],
            pieceId: null,
            startedAtS: 0,
          },
          {
            kind: 'follow' as const,
            side: 'host' as const,
            focus: [x, 1.5, z] as [number, number, number],
            pieceId: 's',
            startedAtS: 0,
          },
          {
            kind: 'follow' as const,
            side: 'guest' as const,
            focus: [x, 1.5, z] as [number, number, number],
            pieceId: 's',
            startedAtS: 0,
          },
        ],
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
        for (let t = 0; t < TOUR_SHOT_S * 4; t += 0.5) {
          const [x, y, z] = shotCameraPose(shot, halves, t).position;
          for (const o of obstacles) {
            const inside = Math.hypot(x - o.x, z - o.z) < o.r && y < o.h;
            expect(
              inside,
              `${shot.kind} ${shot.side ?? ''} at t=${t} inside ${o.id} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
            ).toBe(false);
          }
        }
      }
    });
  }
});
