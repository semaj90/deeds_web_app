// src/lib/workers/gpu-tensor-worker.ts
// Consolidated GPU Tensor Worker (Restored)

export type MultiDimArray = {
  shape: number[];
  data: Float32Array | number[];
  layout?: string;
  cacheKey?: string;
  timestamp?: number;
  lodLevel?: number;
  dimensions?: number;
};| MultiDimArray
  | MultiDimArray[]
  | { goServiceUrl?: string; cacheLimit?: number }
  | { cleared?: boolean }
  | GPUProcessingStats
  | undefined;

export interface WorkerMessage {
  type: 'INITIALIZE' | 'PROCESS_TENSOR' | 'PROCESS_BATCH' | 'GET_STATS' | 'CLEAR_CACHE';
  id?: string;
  data?: WorkerMessageData;
  config?: { goServiceUrl?: string; cacheLimit?: number };
}

export interface WorkerResponse {
  type: 'INITIALIZED' | 'SUCCESS' | 'ERROR' | 'STATS';
  id?: string;
  data?: WorkerMessageData | unknown;
  error?: string;
}

export interface GPUProcessingStats {
  totalProcessed: number;
  cacheHitRate: number;
  averageProcessingTime: number;
  webgpuSupported: boolean;
  lastProcessedTime?: number;
}

class GPUTensorWorker {
  private cacheLimit = 100;
  private stats: GPUProcessingStats = {
    totalProcessed: 0,
    cacheHitRate: 0,
    averageProcessingTime: 0,
    webgpuSupported: false
  };

  async initialize(config?: { goServiceUrl?: string, cacheLimit?: number }): Promise<{ webgpuSupported, boolean }> {
    if (config?.cacheLimit) this.cacheLimit = config.cacheLimit;
    return { webgpuSupported, false }; // Stub
  }

  async processGPUTensor(tensor: MultiDimArray): Promise<MultiDimArray> {
    // Stub processing
    return { ...tensor, timestamp: Date.now() };
  }

  async processBatch(tensors: MultiDimArray[]): Promise<MultiDimArray[]> {
    return Promise.all(tensors.map(t => this.processGPUTensor(t)));
  }

  getStats() {
    return this.stats;
  }

  clearCache() {
    // No-op
  }
}

const worker = new GPUTensorWorker();

self.onmessage = async (ev: MessageEvent<WorkerMessage>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'INITIALIZE':
        const result = await worker.initialize(msg.config);
        self.postMessage({ type: 'INITIALIZED', id: msg.id, data: result });
        break;
      case 'PROCESS_TENSOR':
        const out = await worker.processGPUTensor(msg.data as MultiDimArray);
        self.postMessage({ type: 'SUCCESS', id: msg.id, data: out });
        break;
      case 'PROCESS_BATCH':
        const results = await worker.processBatch(msg.data as MultiDimArray[]);
        self.postMessage({ type: 'SUCCESS', id: msg.id, data: results });
        break;
      case 'GET_STATS':
        self.postMessage({ type: 'STATS', id: msg.id, data: worker.getStats() });
        break;
      case 'CLEAR_CACHE':
        worker.clearCache();
        self.postMessage({ type: 'SUCCESS', id: msg.id, data: { cleared, true } });
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', id: msg.id, error: String(err) });
  }
};
