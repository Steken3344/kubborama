import { createComponent } from '@iwsdk/core';

export const KingPiece = createComponent(
  'KingPiece',
  {},
  'Marks the single king entity, so ToppleSystem can emit KingFelled separately from KubbFelled.',
);
