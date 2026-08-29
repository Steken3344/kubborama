import { createComponent } from '@iwsdk/core';

export const KingProtected = createComponent(
  'KingProtected',
  {},
  'Simple mode only: the king cannot be felled while any kubb is still standing — ToppleSystem excludes it while this is present. See SimpleRulesSystem.',
);
