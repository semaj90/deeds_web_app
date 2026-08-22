/**
 * Autoencoder session manager — wraps the N-API LibTorch addon's autoencoder
 * encode/decode ops with warm-up state tracking.
 *
 * Pattern:
 *   1. First two calls (warmup phase) JIT-compile CUDA kernels and prime caches.
 *   2. After warmup, calls are routed to the captured CUDA-Graph path (lower latency).
 *   3. A pending-queue drains on warmup completion so callers don't block.
 *
 * This is intentionally a thin orchestration layer. All tensor math lives in
 * tensorrt_bridge.node (C++/CUDA). This module manages lifecycle only.
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const esmRequire = createRequire(import.meta.url);

// ── Addon loader (mirrors libtorch-bridge.ts pattern) ─────────────────────────

const ADDON_CANDIDATES = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
];

interface TensorrtAddon {
  autoencoderEncode?: (input: Float32Array, inputDim: number, latentDim: number) => Float32Array;
  autoencoderDecode?: (latent: Float32Array, latentDim: number, outputDim: number) => Float32Array;
  isCudaAvailable?: () => boolean;
}

function loadAddon(): TensorrtAddon | null {
  for (const p of ADDON_CANDIDATES) {
    if (existsSync(p)) {
      try { return esmRequire(p) as TensorrtAddon; }
      catch { /* try next */ }
    }
  }
  return null;
}

const addon = loadAddon();

// ── Session state ──────────────────────────────────────────────────────────────

// Two warmup calls JIT-compile kernels; subsequent calls hit the captured graph.
const WARMUP_ROUNDS = 2;

type PendingCall = {
  resolve: (v: Float32Array) => void;
  reject:  (e: Error) => void;
  fn:      () => Float32Array;
};

class AutoencoderSession {
  private warmupCount = 0;
  private warm = false;
  private pending: PendingCall[] = [];

  readonly inputDim:  number;
  readonly latentDim: number;

  constructor(inputDim = 768, latentDim = 64) {
    this.inputDim  = inputDim;
    this.latentDim = latentDim;
  }

  /** Encode a 768-dim embedding to 64-dim latent vector. */
  async encode(input: Float32Array): Promise<Float32Array> {
    return this.dispatch(() => {
      if (!addon?.autoencoderEncode) throw new Error('autoencoderEncode not available');
      return addon.autoencoderEncode(input, this.inputDim, this.latentDim);
    });
  }

  /** Decode a 64-dim latent vector back to 768-dim. */
  async decode(latent: Float32Array): Promise<Float32Array> {
    return this.dispatch(() => {
      if (!addon?.autoencoderDecode) throw new Error('autoencoderDecode not available');
      return addon.autoencoderDecode(latent, this.latentDim, this.inputDim);
    });
  }

  get isWarm(): boolean { return this.warm; }

  get cudaAvailable(): boolean { return addon?.isCudaAvailable?.() ?? false; }

  private dispatch(fn: () => Float32Array): Promise<Float32Array> {
    if (this.warm) {
      return Promise.resolve().then(fn);
    }

    // During warmup: execute synchronously, drain pending queue after last warmup round.
    return new Promise<Float32Array>((resolve, reject) => {
      this.pending.push({ resolve, reject, fn });
      this.runWarmup();
    });
  }

  private runWarmup(): void {
    if (this.warmupCount >= WARMUP_ROUNDS) return;

    // Process all queued calls sequentially for warmup
    while (this.pending.length > 0 && this.warmupCount < WARMUP_ROUNDS) {
      const call = this.pending.shift()!;
      this.warmupCount++;
      try {
        const result = call.fn();
        call.resolve(result);
      } catch (e) {
        call.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }

    if (this.warmupCount >= WARMUP_ROUNDS) {
      this.warm = true;
      // Drain any remaining pending calls now that kernels are warmed
      for (const call of this.pending.splice(0)) {
        try { call.resolve(call.fn()); }
        catch (e) { call.reject(e instanceof Error ? e : new Error(String(e))); }
      }
    }
  }
}

// ── Singleton (shared across SSR requests — encode/decode is stateless) ───────

const _session = new AutoencoderSession(768, 64);

export function getAutoencoderSession(): AutoencoderSession { return _session; }

export async function autoencoderEncode(input: Float32Array): Promise<Float32Array> {
  return _session.encode(input);
}

export async function autoencoderDecode(latent: Float32Array): Promise<Float32Array> {
  return _session.decode(latent);
}

export function isAutoencoderWarm(): boolean { return _session.isWarm; }
export function isAutoencoderCudaAvailable(): boolean { return _session.cudaAvailable; }
