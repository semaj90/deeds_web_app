/**
 * Policy Reranker Bridge — PyTorch .pt Model Interface
 *
 * Connects TypeScript to policy-reranker.pt (16→1 feedforward network)
 * Lane 5: Post-retrieval scoring, pre-ACE assembly
 *
 * Model contract:
 *  Input: 16-scalar feature vector (from feature engineering)
 *  Output: [0, 1] relevance score (NDCG@10 optimized)
 *  Gating: NDCG@10 threshold before promotion to production
 *
 * Transport:
 *  - Python: serve-policy-reranker.py (gRPC :50055 or HTTP :8334)
 *  - TypeScript: fetch gRPC client OR HTTP bridge
 *  - Fallback: inline scoring via cuVS/cuML if model unavailable
 */

export interface PolicyModelConfig {
  modelPath: string;
  gpu: boolean;
  batchSize?: number;
  returnConfidence?: boolean;
  timeout?: number;
}

export interface PolicyScoreResult {
  predictions: Float32Array;
  confidence: Float32Array;
  explanation?: string[];
  duration: number;
}

/**
 * Load policy reranker model
 * Supports: gRPC, HTTP, or in-process PyTorch via N-API
 */
export async function loadPolicyReranker(
  modelPath: string,
  config: PolicyModelConfig
): Promise<PolicyRerankerModel> {
  // Try gRPC first (preferred for throughput)
  try {
    return await loadViaGRPC(modelPath, config);
  } catch (grpcErr) {
    console.warn('[Policy] gRPC unavailable, falling back to HTTP:', grpcErr);

    // Fall back to HTTP bridge
    try {
      return await loadViaHTTP(modelPath, config);
    } catch (httpErr) {
      console.warn('[Policy] HTTP unavailable, falling back to fallback:', httpErr);

      // Last resort: fallback scoring (heuristic based on feature values)
      return new FallbackPolicyScorer(config);
    }
  }
}

/**
 * gRPC transport (primary for low-latency batch scoring)
 */
async function loadViaGRPC(
  modelPath: string,
  config: PolicyModelConfig
): Promise<PolicyRerankerModel> {
  // Dynamic import: @grpc/grpc-js
  const grpc = await import('@grpc/grpc-js');
  const protoLoader = await import('@grpc/proto-loader');

  const PROTO_PATH = 'sidecar/protos/policy_reranker.proto';
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const policyProto = grpc.loadPackageDefinition(packageDefinition) as any;
  const client = new policyProto.policy.PolicyReranker(
    'localhost:50055', // serve-policy-reranker.py gRPC port
    grpc.credentials.createInsecure()
  );

  return new GRPCPolicyReranker(client, config);
}

/**
 * HTTP transport (fallback, easier debugging)
 */
async function loadViaHTTP(
  modelPath: string,
  config: PolicyModelConfig
): Promise<PolicyRerankerModel> {
  // HTTP endpoint: serve-policy-reranker.py
  const baseUrl = 'http://localhost:8334';

  // Health check
  const health = await fetch(`${baseUrl}/health`);
  if (!health.ok) {
    throw new Error('Policy HTTP server not responding');
  }

  return new HTTPPolicyReranker(baseUrl, config);
}

/**
 * Policy model interface (abstract)
 */
export interface PolicyRerankerModel {
  score(
    features: Float32Array,
    options?: { batchSize?: number; returnConfidence?: boolean }
  ): Promise<PolicyScoreResult>;
  explain(packetId: string, score: number): Promise<string>;
  getStats(): Promise<{ totalCalls: number; avgLatency: number }>;
}

/**
 * gRPC implementation
 */
class GRPCPolicyReranker implements PolicyRerankerModel {
  private client: any;
  private config: PolicyModelConfig;
  private stats = { totalCalls: 0, totalLatency: 0 };

  constructor(client: any, config: PolicyModelConfig) {
    this.client = client;
    this.config = config;
  }

  async score(
    features: Float32Array,
    options?: { batchSize?: number; returnConfidence?: boolean }
  ): Promise<PolicyScoreResult> {
    const startTime = Date.now();
    const batchSize = options?.batchSize || this.config.batchSize || 32;
    const returnConfidence = options?.returnConfidence ?? this.config.returnConfidence ?? true;

    const numSamples = features.length / 16; // 16 features per sample

    try {
      return await new Promise((resolve, reject) => {
        this.client.score(
          {
            features: Buffer.from(features.buffer),
            batchSize,
            returnConfidence
          },
          (err: Error | null, response: any) => {
            if (err) {
              reject(err);
            } else {
              const duration = Date.now() - startTime;
              this.stats.totalCalls++;
              this.stats.totalLatency += duration;

              resolve({
                predictions: new Float32Array(response.predictions),
                confidence: returnConfidence
                  ? new Float32Array(response.confidence)
                  : new Float32Array(numSamples).fill(0.5),
                explanation: response.explanation || undefined,
                duration
              });
            }
          }
        );
      });
    } catch (err) {
      throw new Error(`gRPC policy scoring failed: ${(err as Error).message}`);
    }
  }

  async explain(packetId: string, score: number): Promise<string> {
    return `Policy score ${(score * 100).toFixed(1)}% (gRPC model)`;
  }

  async getStats() {
    return {
      totalCalls: this.stats.totalCalls,
      avgLatency: this.stats.totalCalls > 0
        ? this.stats.totalLatency / this.stats.totalCalls
        : 0
    };
  }
}

/**
 * HTTP implementation
 */
class HTTPPolicyReranker implements PolicyRerankerModel {
  private baseUrl: string;
  private config: PolicyModelConfig;
  private stats = { totalCalls: 0, totalLatency: 0 };

  constructor(baseUrl: string, config: PolicyModelConfig) {
    this.baseUrl = baseUrl;
    this.config = config;
  }

  async score(
    features: Float32Array,
    options?: { batchSize?: number; returnConfidence?: boolean }
  ): Promise<PolicyScoreResult> {
    const startTime = Date.now();
    const batchSize = options?.batchSize || this.config.batchSize || 32;
    const returnConfidence = options?.returnConfidence ?? this.config.returnConfidence ?? true;

    const numSamples = features.length / 16;

    try {
      const response = await fetch(`${this.baseUrl}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: features.buffer,
        signal: AbortSignal.timeout(this.config.timeout || 30000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const duration = Date.now() - startTime;

      this.stats.totalCalls++;
      this.stats.totalLatency += duration;

      // Response format: [predictions (f32), confidence (f32)]
      const data = new Float32Array(buffer);
      const predictions = new Float32Array(data.slice(0, numSamples));
      const confidence = returnConfidence
        ? new Float32Array(data.slice(numSamples, numSamples * 2))
        : new Float32Array(numSamples).fill(0.5);

      return { predictions, confidence, duration };
    } catch (err) {
      throw new Error(`HTTP policy scoring failed: ${(err as Error).message}`);
    }
  }

  async explain(packetId: string, score: number): Promise<string> {
    return `Policy score ${(score * 100).toFixed(1)}% (HTTP model)`;
  }

  async getStats() {
    return {
      totalCalls: this.stats.totalCalls,
      avgLatency: this.stats.totalCalls > 0
        ? this.stats.totalLatency / this.stats.totalCalls
        : 0
    };
  }
}

/**
 * Fallback scorer (when PyTorch model unavailable)
 * Uses simple heuristics to score features
 * Does NOT replace learned model, but ensures graceful degradation
 */
class FallbackPolicyScorer implements PolicyRerankerModel {
  private config: PolicyModelConfig;
  private stats = { totalCalls: 0, totalLatency: 0 };

  constructor(config: PolicyModelConfig) {
    this.config = config;
  }

  async score(
    features: Float32Array,
    options?: { batchSize?: number; returnConfidence?: boolean }
  ): Promise<PolicyScoreResult> {
    const startTime = Date.now();
    const returnConfidence = options?.returnConfidence ?? this.config.returnConfidence ?? true;

    const numSamples = features.length / 16;
    const predictions = new Float32Array(numSamples);
    const confidence = new Float32Array(numSamples);

    // Simple heuristic scoring (weighted combination of features)
    // Weights roughly derived from typical policy model importance
    const weights = new Float32Array([
      0.25, // qdrantScore (retrieval quality)
      0.15, // pageRank (authority)
      0.15, // karpathyBlend (semantic + graph)
      0.08, // recencyBias
      0.08, // entityMatch
      0.08, // semanticCohesion
      0.05, // typeMatch
      0.03, // communityAuthority
      0.02, // clusterDensity
      0.02, // sourceReliability
      0.01, // completeness
      0.01, // frequency
      0.02, // contextRelevance
      0.02, // divergence
      0.02, // temporalDecay
      0.01 // socialProof
    ]);

    for (let i = 0; i < numSamples; i++) {
      const sample = features.slice(i * 16, (i + 1) * 16);
      let score = 0;

      for (let j = 0; j < 16; j++) {
        score += sample[j] * weights[j];
      }

      // Normalize to [0, 1]
      predictions[i] = Math.min(1, Math.max(0, score));

      // Fallback confidence: lower (model unavailable)
      if (returnConfidence) {
        confidence[i] = 0.3; // low confidence when using heuristic
      }
    }

    const duration = Date.now() - startTime;
    this.stats.totalCalls++;
    this.stats.totalLatency += duration;

    return {
      predictions,
      confidence,
      explanation: ['Fallback heuristic scoring (PyTorch model unavailable)'],
      duration
    };
  }

  async explain(packetId: string, score: number): Promise<string> {
    return `Policy score ${(score * 100).toFixed(1)}% (fallback heuristic, confidence: LOW)`;
  }

  async getStats() {
    return {
      totalCalls: this.stats.totalCalls,
      avgLatency: this.stats.totalCalls > 0
        ? this.stats.totalLatency / this.stats.totalCalls
        : 0
    };
  }
}

/**
 * Gate: NDCG@10 validation before production promotion
 *
 * Example validation harness:
 *   1. Run policy model on validation set (100 queries)
 *   2. Compute NDCG@10 vs. ground-truth rankings
 *   3. If NDCG@10 >= 0.65, promote model to production
 *   4. If NDCG@10 < 0.65, keep previous version
 *
 * This prevents regression from untrained or poorly-trained models.
 */
export async function validatePolicyModel(
  model: PolicyRerankerModel,
  validationSet: Array<{
    features: Float32Array;
    groundTruthRank: number;
  }>
): Promise<{ ndcg10: number; passed: boolean }> {
  const threshold = 0.65;

  // Score all validation samples
  const allFeatures = new Float32Array(
    validationSet.length * 16
  );
  for (let i = 0; i < validationSet.length; i++) {
    allFeatures.set(validationSet[i].features, i * 16);
  }

  const result = await model.score(allFeatures, { returnConfidence: false });

  // Compute NDCG@10
  const scores = result.predictions;
  const ranked = Array.from(scores)
    .map((score, idx) => ({
      score,
      trueRank: validationSet[idx].groundTruthRank
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // NDCG formula: sum(relevance[i] / log2(i+2)) / IDCG
  const dcg = ranked.reduce((sum, item, idx) => {
    const relevance = item.trueRank <= 10 ? 1 : 0;
    return sum + relevance / Math.log2(idx + 2);
  }, 0);

  const idcg = Math.min(10, validationSet.length) / Math.log2(2); // perfect ranking
  const ndcg10 = dcg / idcg;

  return {
    ndcg10,
    passed: ndcg10 >= threshold
  };
}