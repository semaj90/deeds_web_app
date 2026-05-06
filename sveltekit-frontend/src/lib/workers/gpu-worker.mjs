/**
 * GPU Worker — offloads heavy synchronous N-API addon calls off the main event loop.
 *
 * Launched by libtorch-bridge.ts async wrappers.  Each worker handles one task
 * then terminates — no pooling needed because these are infrequent (pipeline runs,
 * not per-request ops).
 *
 * Protocol (parentPort):
 *   receive: { fn, addonPath, args: [...] }
 *   send:    { ok: true,  result: <plain JS value> }
 *         or { ok: false, error: <string> }
 *
 * All TypedArray results are copied to fresh regular ArrayBuffers before
 * postMessage so they can be transferred (external/pool-backed N-API buffers
 * are non-transferable).
 *
 * Supported fns and their result shapes:
 *   kmeansWithCentroids → { assignments: Int32Array, centroids: Float32Array, reseeded: number }
 *   trainSOM            → { weights: Float32Array, bmu: Int32Array }
 *   graphSimilarity     → Float32Array  (n*n)
 *   pageRankGPU         → Float32Array  (n)
 *   attentionScoreGPU   → Float32Array  (n)
 *   rewardScoreGPU      → Float32Array  (n)
 */

import { workerData, parentPort } from 'worker_threads';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

function copyTyped(src) {
  const buf = new ArrayBuffer(src.byteLength);
  new Uint8Array(buf).set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength));
  return src instanceof Int32Array ? new Int32Array(buf) : new Float32Array(buf);
}

try {
  const { fn, addonPath, libPath, args } = workerData;

  // Add LibTorch DLLs to PATH so the addon can init CUDA
  if (libPath) {
    process.env.PATH = libPath + ';' + (process.env.PATH || '');
  }

  const addon = _require(addonPath);

  let raw;
  switch (fn) {
    case 'kmeansWithCentroids': {
      // args: [data_f32, n, dim, k, maxIters]
      raw = addon.kmeansWithCentroids(...args);
      const assignments = copyTyped(raw.assignments);
      const centroids   = copyTyped(raw.centroids);
      parentPort.postMessage(
        { ok: true, result: { assignments, centroids, reseeded: raw.reseeded ?? 0 } },
        [assignments.buffer, centroids.buffer],
      );
      break;
    }
    case 'trainSOM': {
      // args: [data_f32, n, dim, gw, gh, iters, lrI, lrF, rI, rF]
      raw = addon.trainSOM(...args);
      const weights = copyTyped(raw.weights);
      const bmu     = copyTyped(raw.bmu);
      parentPort.postMessage(
        { ok: true, result: { weights, bmu } },
        [weights.buffer, bmu.buffer],
      );
      break;
    }
    case 'graphSimilarity': {
      // args: [embs_f32, n, dim]
      raw = addon.graphSimilarity(...args);
      const out = copyTyped(raw);
      parentPort.postMessage({ ok: true, result: out }, [out.buffer]);
      break;
    }
    case 'pageRankGPU': {
      // args: [adj_f32, n, damping, iters]
      raw = addon.pageRankGPU(...args);
      const out = copyTyped(raw);
      parentPort.postMessage({ ok: true, result: out }, [out.buffer]);
      break;
    }
    case 'attentionScoreGPU': {
      // args: [query_f32, dim, keys_f32, n]
      raw = addon.attentionScoreGPU(...args);
      const out = copyTyped(raw);
      parentPort.postMessage({ ok: true, result: out }, [out.buffer]);
      break;
    }
    case 'rewardScoreGPU': {
      // args: [gen_f32, ref_f32, n, dim]
      raw = addon.rewardScoreGPU(...args);
      const out = copyTyped(raw);
      parentPort.postMessage({ ok: true, result: out }, [out.buffer]);
      break;
    }
    default:
      throw new Error(`gpu-worker: unknown fn "${fn}"`);
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message ?? e) });
}
