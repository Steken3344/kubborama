import { createComponent } from '@iwsdk/core';

export const OutOfPlay = createComponent(
  'OutOfPlay',
  {},
  'Simple mode only: a kubb that has been felled and moved to the sin-bin row beside the court. Cleared on Reset (still Resettable, so its position is already restored by then). See SimpleRulesSystem.',
);
