import { defineComponents } from '@iwsdk/core';
import { KingPiece } from './components/king-piece.js';
import { Resettable } from './components/resettable.js';
import { StickState } from './components/stick-state.js';

export default defineComponents([StickState, Resettable, KingPiece]);
