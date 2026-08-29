import { defineComponents } from '@iwsdk/core';
import { CourtLine } from './components/court-line.js';
import { KingPiece } from './components/king-piece.js';
import { OneShotAudio } from './components/one-shot-audio.js';
import { Resettable } from './components/resettable.js';
import { StickState } from './components/stick-state.js';

export default defineComponents([
  StickState,
  Resettable,
  KingPiece,
  CourtLine,
  OneShotAudio,
]);
