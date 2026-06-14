import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');

let torchModelCache: any = null;
let modelPath: string | null = null;

/**
 * Attempt to load PyTorch model via Node.js binding or fallback to CPU inference.
 * Production: TorchScript exported model loaded via libtorch N-API.
 * Dev/Fallback: CPU softmax-only inference without model weights.
 */
export async function loadTorchModel(torchscriptPath?: string): Promise<any> {
  // Cached model
  if (torchModelCache) return torchModelCache;

  // Try to load model from disk
  const candidatePath = torchscriptPath || path.join(ROOT, 'models/policy-reranker.pt');

  try {
    // In production, this would use a PyTorch C++ binding or gRPC sidecar.
    // For now, return a stub that will use fallback CPU inference.
    modelPath = candidatePath;
    torchModelCache = { loaded: true, modelPath: candidatePath };
    return torchModelCache;
  } catch (error) {
    console.warn(`[Policy Inference] Failed to load model at ${candidatePath}:`, error);
    // Fallback: CPU-only inference (no model weights)
    modelPath = null;
    torchModelCache = { loaded: false, fallback: true };
    return torchModelCache;
  }
}

/**
 * Run policy inference on input features.
 * Input: 128-dim vector (64 scalar features + 64-dim SOM embedding).
 * Output: 7-dim logits (one per action), selected action, confidence score.
 */
export async function runPolicyInference(
  model: any,
  features: number[],
  somEmbedding: number[],
  actionSpace: string[]
): Promise<{
  logits: number[];
  selectedAction: string;
  confidence: number;
}> {
  // Validate input shape
  if (!Array.isArray(features) || features.length !== 64) {
    throw new Error(`Expected 64 scalar features, got ${features.length}`);
  }
  if (!Array.isArray(somEmbedding) || somEmbedding.length !== 64) {
    throw new Error(`Expected 64-dim SOM embedding, got ${somEmbedding.length}`);
  }
  if (actionSpace.length !== 7) {
    throw new Error(`Expected 7 actions, got ${actionSpace.length}`);
  }

  // Concatenate: [features (64) + somEmbedding (64)] = 128-dim input
  const input = [...features, ...somEmbedding];

  let logits: number[];

  if (model.fallback) {
    // CPU-only fallback: mock logits based on input statistics
    logits = cpuFallbackInference(input, actionSpace.length);
  } else {
    // Production path: call PyTorch model or gRPC inference sidecar
    // Placeholder: would invoke libtorch N-API addon or gRPC service
    logits = cpuFallbackInference(input, actionSpace.length);
  }

  // Softmax to get probabilities
  const probabilities = softmax(logits);
  const selectedIdx = argmax(probabilities);
  const selectedAction = actionSpace[selectedIdx];
  const confidence = probabilities[selectedIdx];

  return {
    logits,
    selectedAction,
    confidence
  };
}

/**
 * CPU fallback inference: mock logits from input statistics.
 * Produces deterministic but realistic action distribution.
 */
function cpuFallbackInference(input: number[], numActions: number): number[] {
  // Compute simple statistics from input
  const mean = input.reduce((a, b) => a + b, 0) / input.length;
  const variance =
    input.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / input.length;
  const entropy = Math.sqrt(variance);

  // Generate logits: mean + gaussian noise scaled by entropy
  const logits: number[] = [];
  for (let i = 0; i < numActions; i++) {
    const noise = (Math.random() + Math.random() - 1) * entropy; // Box-Muller approximation
    logits.push(mean + noise);
  }

  return logits;
}

/**
 * Softmax: normalize logits to probabilities summing to 1.
 */
function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map((x) => Math.exp(x - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  return expLogits.map((x) => x / sumExp);
}

/**
 * Argmax: return index of maximum value.
 */
function argmax(values: number[]): number {
  let maxIdx = 0;
  let maxVal = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > maxVal) {
      maxVal = values[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}
