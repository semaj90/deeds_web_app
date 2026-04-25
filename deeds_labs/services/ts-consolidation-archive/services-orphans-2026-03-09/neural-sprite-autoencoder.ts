export type Latent = number[];

export interface AutoencoderOptions {
  latentSize?: number;
  // Input/output domain. Default 0..1.
  clampMin?: number;
  clampMax?: number;
  // If true, encode maps values into 0..1 and decode maps back to clampMin..clampMax.
  // If false, it only clamps (no scaling).
  normalize?: boolean;
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default class NeuralSpriteAutoencoder {
  readonly latentSize: number;
  readonly clampMin: number;
  readonly clampMax: number;
  readonly normalize: boolean;

  constructor(opts: AutoencoderOptions = {}) {
    const latentSize = opts.latentSize ?? 16;
    if (!Number.isInteger(latentSize) || latentSize <= 0) {
      throw new TypeError('latentSize must be a positive integer');
    }

    const clampMin = opts.clampMin ?? 0;
    const clampMax = opts.clampMax ?? 1;
    if (!(clampMax > clampMin)) {
      throw new TypeError('clampMax must be > clampMin');
    }

    this.latentSize = latentSize;
    this.clampMin = clampMin;
    this.clampMax = clampMax;
    this.normalize = opts.normalize ?? true;
  }

  private toUnit(x: number): number {
    const c = clamp(x, this.clampMin, this.clampMax);
    if (!this.normalize) return c;
    return (c - this.clampMin) / (this.clampMax - this.clampMin); // 0..1
  }

  private fromUnit(u: number): number {
    const cu = clamp(u, 0, 1);
    if (!this.normalize) return clamp(u, this.clampMin, this.clampMax);
    return this.clampMin + cu * (this.clampMax - this.clampMin);
  }

  /**
   * Encode a flat numeric array into a compact latent vector.
   * - clamps inputs
   * - optionally normalizes into 0..1 before averaging
   */
  encode(input: number[]): Latent {
    if (!Array.isArray(input)) throw new TypeError('input must be a number[]');

    const n = input.length;
    if (n === 0) return new Array(this.latentSize).fill(this.normalize ? 0 : this.clampMin);

    const chunkSize = Math.max(1, Math.floor(n / this.latentSize));
    const latent = new Array<number>(this.latentSize).fill(0);
    const counts = new Array<number>(this.latentSize).fill(0);

    for (let i = 0; i < n; i++) {
      const idx = Math.min(Math.floor(i / chunkSize), this.latentSize - 1);
      latent[idx] += this.toUnit(input[i]);
      counts[idx] += 1;
    }

    for (let i = 0; i < this.latentSize; i++) {
      latent[i] = counts[i] > 0 ? latent[i] / counts[i] : 0;
      // keep latent in 0..1 if normalize, else in clamp range
      latent[i] = this.normalize ? clamp(latent[i], 0, 1) : clamp(latent[i], this.clampMin, this.clampMax);
    }

    return latent;
  }

  /**
   * Decode a latent vector back into a flat numeric array of requested length.
   * Uses linear interpolation for smoothness.
   */
  decode(latent: Latent, outputLength: number): number[] {
    if (!Array.isArray(latent)) throw new TypeError('latent must be a number[]');
    if (!Number.isInteger(outputLength) || outputLength < 0) {
      throw new TypeError('outputLength must be a non-negative integer');
    }
    if (outputLength === 0) return [];
    if (latent.length === 0) return new Array(outputLength).fill(this.normalize ? this.clampMin : this.clampMin);

    const L = latent.length;
    const out = new Array<number>(outputLength);

    // Map i -> position p in [0, L-1]
    for (let i = 0; i < outputLength; i++) {
      const p = outputLength === 1 ? 0 : (i / (outputLength - 1)) * (L - 1);
      const i0 = Math.floor(p);
      const i1 = Math.min(L - 1, i0 + 1);
      const t = p - i0;

      const a = latent[i0];
      const b = latent[i1];

      const u = lerp(a, b, t);
      out[i] = this.fromUnit(u);
    }

    // final clamp for safety
    for (let i = 0; i < out.length; i++) {
      out[i] = clamp(out[i], this.clampMin, this.clampMax);
    }

    return out;
  }

  reconstruct(input: number[], outputLength: number): number[] {
    return this.decode(this.encode(input), outputLength);
  }

  serialize(): string {
    return JSON.stringify({
      latentSize: this.latentSize,
      clampMin: this.clampMin,
      clampMax: this.clampMax,
      normalize: this.normalize
    });
  }

  static deserialize(s: string): NeuralSpriteAutoencoder {
    const parsed: any = JSON.parse(s);
    return new NeuralSpriteAutoencoder({
      latentSize: typeof parsed?.latentSize === 'number' ? parsed.latentSize : 16,
      clampMin: typeof parsed?.clampMin === 'number' ? parsed.clampMin : 0,
      clampMax: typeof parsed?.clampMax === 'number' ? parsed.clampMax : 1,
      normalize: typeof parsed?.normalize === 'boolean' ? parsed.normalize : true
    });
  }
}
