export type ZeroStage = 0 | 1 | 2 | 3;
export type OptimizerKind = 'ADAMW' | 'PAGED_ADAMW_8BIT' | 'DEEPSPEED_CPU_ADAM';
export type Placement = 'GPU' | 'CPU' | 'NVME';
export type CheckpointingMode = 'NONE' | 'SELECTIVE' | 'FULL';
export type PeftMethod = 'LORA' | 'QLORA' | 'LORA_FA';
export type Precision = 'FP32' | 'BF16' | 'FP16';

export interface TrainingEnvelope {
  trainableParameterCount: number;
  estimatedActivationBytes: number;
  freeGpuBytes: number;
  hostRamAvailableBytes: number;
  nvmeAvailableBytes: number;
  nvmeSequentialWriteMBps?: number;
  targetStepTimeMs?: number;
  deepspeedAvailable: boolean;
  bitsandbytesAvailable: boolean;
  bf16Supported: boolean;
}

export interface TrainingExecutionCandidate {
  zeroStage: ZeroStage;
  optimizer: OptimizerKind;
  optimizerPlacement: Placement;
  parameterPlacement: Placement;
  gradientCheckpointing: CheckpointingMode;
  microBatch: number;
  gradientAccumulation: number;
  effectiveBatch: number;
  learningRate: number;
  loraRank: number;
  loraAlpha: number;
  peftMethod: PeftMethod;
  targetModuleSetId: string;
  targetModules: string[];
  precision: Precision;
  quantizationMode: string;
  rationale: string[];
}

export interface ObservedTrainingMetrics {
  candidateId: string;
  heldoutQuality: number;
  samplesPerSecond: number;
  peakGpuBytes: number;
  peakHostBytes: number;
  nvmeOffloadBytes: number;
  stepTimeMs: number;
  loss?: number;
}

function assertCandidate(candidate: TrainingExecutionCandidate): void {
  if (candidate.optimizerPlacement !== 'GPU' && candidate.zeroStage < 1 && candidate.optimizer === 'DEEPSPEED_CPU_ADAM') {
    throw new Error('DeepSpeedCPUAdam offload requires ZeRO stage >= 1');
  }
  if (candidate.parameterPlacement !== 'GPU' && candidate.zeroStage !== 3) {
    throw new Error('parameter offload requires ZeRO stage 3');
  }
  if (candidate.optimizer === 'DEEPSPEED_CPU_ADAM' && candidate.optimizerPlacement === 'GPU') {
    throw new Error('DeepSpeedCPUAdam requires CPU/NVMe optimizer placement');
  }
  if (candidate.microBatch < 1 || candidate.gradientAccumulation < 1 || candidate.effectiveBatch < 1) {
    throw new Error('batch coordinates must be positive');
  }
  if (candidate.loraRank < 1 || candidate.learningRate <= 0) throw new Error('invalid LoRA/search coordinate');
}

/**
 * Produces a bounded coarse tournament in the order Parent Atlas should try it:
 * adapter structure/checkpointing -> paged 8-bit optimizer -> CPU optimizer
 * offload -> stage-3 parameter offload -> NVMe last.
 *
 * This is intentionally not an autotuner. It proposes exact categorical
 * configurations that must be executed and receipted.
 */
export function buildTrainingTournament(input: {
  envelope: TrainingEnvelope;
  targetModuleSetId: string;
  targetModules: string[];
  ranks?: number[];
  learningRates?: number[];
  microBatches?: number[];
  gradientAccumulations?: number[];
}): TrainingExecutionCandidate[] {
  const ranks = input.ranks ?? [8, 16, 32];
  const learningRates = input.learningRates ?? [5e-5, 1e-4, 2e-4];
  const microBatches = input.microBatches ?? [1, 2];
  const accumulations = input.gradientAccumulations ?? [4, 8, 16];
  const precision: Precision = input.envelope.bf16Supported ? 'BF16' : 'FP16';
  const candidates: TrainingExecutionCandidate[] = [];

  const push = (c: TrainingExecutionCandidate) => { assertCandidate(c); candidates.push(c); };

  for (const rank of ranks) {
    for (const learningRate of learningRates) {
      for (const microBatch of microBatches) {
        for (const gradientAccumulation of accumulations) {
          const base = {
            microBatch,
            gradientAccumulation,
            effectiveBatch: microBatch * gradientAccumulation,
            learningRate,
            loraRank: rank,
            loraAlpha: rank * 2,
            targetModuleSetId: input.targetModuleSetId,
            targetModules: [...input.targetModules],
            precision,
            quantizationMode: 'bnb_nf4_4bit',
          } as const;

          push({
            ...base,
            zeroStage: 0,
            optimizer: input.envelope.bitsandbytesAvailable ? 'PAGED_ADAMW_8BIT' : 'ADAMW',
            optimizerPlacement: 'GPU',
            parameterPlacement: 'GPU',
            gradientCheckpointing: 'FULL',
            peftMethod: 'QLORA',
            rationale: ['LEVEL_0_1: QLoRA + checkpointing + paged/standard AdamW before DeepSpeed offload'],
          });

          if (input.envelope.deepspeedAvailable) {
            push({
              ...base,
              zeroStage: 2,
              optimizer: 'DEEPSPEED_CPU_ADAM',
              optimizerPlacement: 'CPU',
              parameterPlacement: 'GPU',
              gradientCheckpointing: 'FULL',
              peftMethod: 'QLORA',
              rationale: ['LEVEL_2: optimizer state/update on CPU; model parameters remain GPU-resident'],
            });

            push({
              ...base,
              zeroStage: 3,
              optimizer: 'DEEPSPEED_CPU_ADAM',
              optimizerPlacement: 'CPU',
              parameterPlacement: 'CPU',
              gradientCheckpointing: 'FULL',
              peftMethod: 'QLORA',
              rationale: ['LEVEL_3: ZeRO-3 CPU parameter + optimizer offload only if GPU-resident tournament is infeasible'],
            });

            if (input.envelope.nvmeAvailableBytes > 0) {
              push({
                ...base,
                zeroStage: 3,
                optimizer: 'DEEPSPEED_CPU_ADAM',
                optimizerPlacement: 'NVME',
                parameterPlacement: 'NVME',
                gradientCheckpointing: 'FULL',
                peftMethod: 'QLORA',
                rationale: ['LEVEL_4: ZeRO-Infinity-style NVMe offload is last resort and must prove usable wall-clock throughput'],
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}

/** Pareto-front selection: maximize held-out quality and throughput, minimize memory/time/offload. */
export function paretoTrainingResults(rows: ObservedTrainingMetrics[]): ObservedTrainingMetrics[] {
  const dominates = (a: ObservedTrainingMetrics, b: ObservedTrainingMetrics) => {
    const noWorse =
      a.heldoutQuality >= b.heldoutQuality &&
      a.samplesPerSecond >= b.samplesPerSecond &&
      a.peakGpuBytes <= b.peakGpuBytes &&
      a.peakHostBytes <= b.peakHostBytes &&
      a.nvmeOffloadBytes <= b.nvmeOffloadBytes &&
      a.stepTimeMs <= b.stepTimeMs;
    const better =
      a.heldoutQuality > b.heldoutQuality || a.samplesPerSecond > b.samplesPerSecond ||
      a.peakGpuBytes < b.peakGpuBytes || a.peakHostBytes < b.peakHostBytes ||
      a.nvmeOffloadBytes < b.nvmeOffloadBytes || a.stepTimeMs < b.stepTimeMs;
    return noWorse && better;
  };
  return rows.filter((row) => !rows.some((other) => other !== row && dominates(other, row)));
}
