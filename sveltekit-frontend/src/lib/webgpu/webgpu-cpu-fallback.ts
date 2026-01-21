export interface CPUFallbackCapabilities {
  hasWebGL: boolean;
  maxTextureSize: number;
  supportedFloatTypes: string[];
  supportedIntTypes: string[];
  maxThreads: number;
}

export class WebGPUCPUFallback {
  private static instance: WebGPUCPUFallback;
  private capabilities: CPUFallbackCapabilities | null = null;

  private constructor() {}

  static getInstance(): WebGPUCPUFallback {
    if (!WebGPUCPUFallback.instance) {
      WebGPUCPUFallback.instance = new WebGPUCPUFallback();
    }
    return WebGPUCPUFallback.instance;
  }

  async initialize(): Promise<CPUFallbackCapabilities> {
    if (this.capabilities) return this.capabilities;

    this.capabilities = {
      hasWebGL: false,
      maxTextureSize: 0,
      supportedFloatTypes: ['float'],
      supportedIntTypes: ['int'],
      maxThreads: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
    };

    return this.capabilities;
  }

  async processLegalEmbeddings(
    embeddings: Float32Array,
    operation: 'normalize' | 'cosine' | 'euclidean'
  ): Promise<Float32Array> {
    const result = new Float32Array(embeddings.length);

    if (operation === 'normalize') {
      let sumSq = 0;
      for (let i = 0; i < embeddings.length; i++) {
        sumSq += embeddings[i] * embeddings[i];
      }
      const magnitude = Math.sqrt(sumSq) || 1;
      for (let i = 0; i < embeddings.length; i++) {
        result[i] = embeddings[i] / magnitude;
      }
    } else {
      // Identity fallback for others as they usually involve 2 vectors
      result.set(embeddings);
    }

    return result;
  }

  async matrixMultiply(
    a: Float32Array,
    b: Float32Array,
    rowsA: number,
    colsA: number,
    colsB: number
  ): Promise<Float32Array> {
    const result = new Float32Array(rowsA * colsB);
    for (let i = 0; i < rowsA; i++) {
      for (let j = 0; j < colsB; j++) {
        let sum = 0;
        for (let k = 0; k < colsA; k++) {
          sum += a[i * colsA + k] * b[k * colsB + j];
        }
        result[i * colsB + j] = sum;
      }
    }
    return result;
  }

  async softmax(input: Float32Array): Promise<Float32Array> {
    const maxVal = Math.max(...Array.from(input));
    const exps = input.map(x => Math.exp(x - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(x => x / sumExps);
  }

  async destroy(): Promise<void> {
    this.capabilities = null;
  }
}

export const cpuFallback = WebGPUCPUFallback.getInstance();



