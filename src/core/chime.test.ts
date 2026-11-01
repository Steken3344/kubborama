import { describe, expect, it } from 'vitest';
import { encodeWav, synthChime } from './chime.js';

const spec = {
  sampleRateHz: 8000,
  notes: [
    { freqHz: 1000, startS: 0 },
    { freqHz: 1500, startS: 0.1 },
  ],
  noteDurS: 0.3,
  decayPerS: 7,
  overtoneGain: 0.35,
  attackS: 0.004,
  peak: 0.8,
};

describe('felled chime', () => {
  it('lasts until the last note has rung out, peaking at `peak`', () => {
    const s = synthChime(spec);
    expect(s.length).toBe(Math.ceil(0.4 * 8000));
    const max = Math.max(...Array.from(s, Math.abs));
    expect(max).toBeCloseTo(0.8, 5);
  });

  it('starts silent and fades out', () => {
    const s = synthChime(spec);
    expect(Math.abs(s[0] ?? 1)).toBeLessThan(0.01);
    const tail = Array.from(s.slice(-50), Math.abs);
    expect(Math.max(...tail)).toBeLessThan(0.2);
  });

  it('encodes a valid mono 16-bit WAV', () => {
    const s = synthChime(spec);
    const wav = encodeWav(s, 8000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(s.length * 2);
    expect(wav.length).toBe(44 + s.length * 2);
  });
});
