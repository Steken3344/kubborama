/**
 * A cheerful little "pling-pling-pling" when a kubb falls (Erik,
 * 2026-11-01: "liten ljudeffekt när man fäller en kubb, något roligt").
 * Synthesised, not a recording: a few bell notes — a sine plus a softer
 * octave overtone, a fast attack and an exponential decay — rendered to
 * 16-bit PCM and wrapped as a WAV in memory, played through the same
 * audio path as every other sound. Notes and shape live in
 * src/data/audio.json (`felledChime`). Pure: numbers in, bytes out.
 */
export interface ChimeSpec {
  sampleRateHz: number;
  notes: ReadonlyArray<{ freqHz: number; startS: number }>;
  noteDurS: number;
  decayPerS: number;
  overtoneGain: number;
  attackS: number;
  /** Highest sample value (0–1) after mixing. */
  peak: number;
}

export function synthChime(spec: ChimeSpec): Float32Array {
  const lastStartS = Math.max(0, ...spec.notes.map((n) => n.startS));
  const length = Math.ceil((lastStartS + spec.noteDurS) * spec.sampleRateHz);
  const out = new Float32Array(length);
  for (const note of spec.notes) {
    const first = Math.floor(note.startS * spec.sampleRateHz);
    const count = Math.floor(spec.noteDurS * spec.sampleRateHz);
    for (let i = 0; i < count && first + i < length; i++) {
      const t = i / spec.sampleRateHz;
      const envelope =
        Math.min(1, t / spec.attackS) * Math.exp(-spec.decayPerS * t);
      const phase = 2 * Math.PI * note.freqHz * t;
      out[first + i] =
        (out[first + i] ?? 0) +
        envelope * (Math.sin(phase) + spec.overtoneGain * Math.sin(2 * phase));
    }
  }
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? spec.peak / max : 0;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * scale;
  return out;
}

/** Mono 16-bit PCM WAV bytes. */
export function encodeWav(
  samples: Float32Array,
  sampleRateHz: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return bytes;
}
