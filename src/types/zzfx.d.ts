declare module 'zzfx' {
  /** ZzFX parameters: volume, randomness, frequency, attack, sustain, release, shape, ... */
  export type ZzfxParams = (number | undefined)[];

  export function zzfx(...parameters: ZzfxParams): AudioBufferSourceNode;

  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    play(...parameters: ZzfxParams): AudioBufferSourceNode;
    playSamples(
      sampleChannels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean,
    ): AudioBufferSourceNode;
    buildSamples(...parameters: ZzfxParams): number[];
    getNote(semitoneOffset?: number, rootNoteFrequency?: number): number;
  };
}
