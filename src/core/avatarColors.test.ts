import { describe, expect, it } from 'vitest';
import { shownAvatarColors } from './avatarColors.js';

describe('shownAvatarColors', () => {
  it('keeps two different choices as they are', () => {
    expect(
      shownAvatarColors({ mine: 0, theirs: 2, mySide: 'host', paletteSize: 5 }),
    ).toEqual({ mine: 0, theirs: 2 });
  });

  it('on a clash the guest wears the next color — seen from the host', () => {
    expect(
      shownAvatarColors({ mine: 0, theirs: 0, mySide: 'host', paletteSize: 5 }),
    ).toEqual({ mine: 0, theirs: 1 });
  });

  it('on a clash the guest wears the next color — seen from the guest', () => {
    expect(
      shownAvatarColors({
        mine: 0,
        theirs: 0,
        mySide: 'guest',
        paletteSize: 5,
      }),
    ).toEqual({ mine: 1, theirs: 0 });
  });

  it('wraps around the end of the palette', () => {
    expect(
      shownAvatarColors({ mine: 4, theirs: 4, mySide: 'host', paletteSize: 5 }),
    ).toEqual({ mine: 4, theirs: 0 });
  });

  it('compares the clamped indices (an out-of-range remote index)', () => {
    expect(
      shownAvatarColors({ mine: 4, theirs: 9, mySide: 'host', paletteSize: 5 }),
    ).toEqual({ mine: 4, theirs: 0 });
  });

  it('changes nothing before the opponent or my side is known', () => {
    expect(
      shownAvatarColors({
        mine: 3,
        theirs: null,
        mySide: 'guest',
        paletteSize: 5,
      }),
    ).toEqual({ mine: 3, theirs: null });
    expect(
      shownAvatarColors({ mine: 3, theirs: 3, mySide: null, paletteSize: 5 }),
    ).toEqual({ mine: 3, theirs: 3 });
  });

  it('a one-color palette cannot avoid the clash', () => {
    expect(
      shownAvatarColors({
        mine: 0,
        theirs: 0,
        mySide: 'guest',
        paletteSize: 1,
      }),
    ).toEqual({ mine: 0, theirs: 0 });
  });
});
