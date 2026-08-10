export const CPU_WORKER_MAX = 4;

export interface CpuFeatureTask {
  taskId: string;
  kind: 'HASH' | 'PARSE_CONTROL_JSON' | 'BUILD_TILE_KEY' | 'PREPARE_ARROW_BATCH';
  payload: unknown;
}

export interface CpuFeatureResult {
  taskId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface SharedWorkerCounters {
  submitted: number;
  completed: number;
  inflight: number;
  failed: number;
}

export function createSharedCounters(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 4));
}
