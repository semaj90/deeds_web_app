import { z } from 'zod';

/**
 * Reconciles the already-existing AE trainer and latent producer artifacts.
 * This module does not train, load weights, or write latent vectors. It turns
 * discovered artifacts into one typed readiness receipt so callers do not
 * create a second AE owner.
 */
export const AeMetadataV1Schema = z.object({
  input_dim: z.literal(768),
  hidden_dim: z.literal(128),
  latent_dim: z.literal(64),
  n_train: z.number().int().positive(),
  n_val: z.number().int().positive(),
  epochs_run: z.number().int().positive(),
  best_val_loss: z.number().finite().nonnegative(),
  cuda: z.boolean(),
  device: z.string().min(1),
  timestamp: z.string().min(1),
  weight_files: z.array(z.string().min(1)).min(8),
}).passthrough();
export type AeMetadataV1 = z.infer<typeof AeMetadataV1Schema>;

export const AeArtifactStateSchema = z.enum([
  'MISSING_METADATA',
  'METADATA_INVALID',
  'WEIGHTS_INCOMPLETE',
  'TRAINED_UNVERIFIED',
  'LATENT_PRODUCER_PRESENT',
  'SHADOW_READY',
]);
export type AeArtifactState = z.infer<typeof AeArtifactStateSchema>;

export const AeArtifactReconciliationV1Schema = z.object({
  schema: z.literal('atlas.ae-artifact-reconciliation.v1'),
  state: AeArtifactStateSchema,
  semanticRepresentation: z.literal('semantic_768'),
  inputDimension: z.literal(768),
  hiddenDimension: z.literal(128),
  latentDimension: z.literal(64),
  trainerPath: z.string().min(1),
  latentProducerPath: z.string().min(1),
  metadataPath: z.string().min(1),
  metadataTimestamp: z.string().min(1).nullable(),
  metadataValLoss: z.number().finite().nonnegative().nullable(),
  expectedWeightFiles: z.array(z.string().min(1)).length(8),
  presentWeightFiles: z.array(z.string().min(1)).max(8),
  trainerPresent: z.boolean(),
  latentProducerPresent: z.boolean(),
  exactRecallBaselinePresent: z.boolean(),
  reconstructionValidationPresent: z.boolean(),
  routingOnlyUntilPromoted: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  onlineTrainingAllowed: z.literal(false),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type AeArtifactReconciliationV1 = z.infer<typeof AeArtifactReconciliationV1Schema>;

export const AE_EXPECTED_WEIGHT_FILES = [
  'W_enc_768_128.npy',
  'b_enc_128.npy',
  'W_enc_128_64.npy',
  'b_enc_64.npy',
  'W_dec_64_128.npy',
  'b_dec_128.npy',
  'W_dec_128_768.npy',
  'b_dec_768.npy',
] as const;

export interface AeArtifactInventory {
  trainerPresent: boolean;
  latentProducerPresent: boolean;
  metadata?: unknown;
  presentWeightFiles: readonly string[];
  exactRecallBaselinePresent: boolean;
  reconstructionValidationPresent: boolean;
}

export function reconcileAeArtifacts(input: {
  inventory: AeArtifactInventory;
  producerRevision: string;
  trainerPath?: string;
  latentProducerPath?: string;
  metadataPath?: string;
}): AeArtifactReconciliationV1 {
  const trainerPath = input.trainerPath ?? 'scripts/atlas/train-ae-pytorch.py';
  const latentProducerPath = input.latentProducerPath ?? 'scripts/atlas/backfill-latent-vectors.mjs';
  const metadataPath = input.metadataPath ?? 'models/autoencoder/ae_meta.json';
  const present = new Set(input.inventory.presentWeightFiles);
  const presentWeightFiles = AE_EXPECTED_WEIGHT_FILES.filter((file) => present.has(file));
  const reasonCodes: string[] = [];

  const parsed = input.inventory.metadata === undefined
    ? null
    : AeMetadataV1Schema.safeParse(input.inventory.metadata);

  let state: AeArtifactState;
  let metadata: AeMetadataV1 | null = null;

  if (!input.inventory.trainerPresent) reasonCodes.push('TRAINER_MISSING');
  if (!input.inventory.latentProducerPresent) reasonCodes.push('LATENT_PRODUCER_MISSING');

  if (input.inventory.metadata === undefined) {
    state = 'MISSING_METADATA';
    reasonCodes.push('AE_METADATA_MISSING');
  } else if (!parsed?.success) {
    state = 'METADATA_INVALID';
    reasonCodes.push('AE_METADATA_SCHEMA_MISMATCH');
  } else {
    metadata = parsed.data;
    if (presentWeightFiles.length !== AE_EXPECTED_WEIGHT_FILES.length) {
      state = 'WEIGHTS_INCOMPLETE';
      reasonCodes.push('AE_WEIGHTS_INCOMPLETE');
    } else if (!input.inventory.latentProducerPresent) {
      state = 'TRAINED_UNVERIFIED';
      reasonCodes.push('LATENT_PRODUCER_NOT_RECONCILED');
    } else if (!input.inventory.exactRecallBaselinePresent || !input.inventory.reconstructionValidationPresent) {
      state = 'LATENT_PRODUCER_PRESENT';
      if (!input.inventory.exactRecallBaselinePresent) reasonCodes.push('EXACT_RECALL_BASELINE_MISSING');
      if (!input.inventory.reconstructionValidationPresent) reasonCodes.push('RECONSTRUCTION_VALIDATION_MISSING');
    } else {
      state = 'SHADOW_READY';
      reasonCodes.push('AE_ARTIFACTS_RECONCILED');
      reasonCodes.push('SHADOW_ONLY_UNTIL_PROMOTION');
    }
  }

  if (reasonCodes.length === 0) reasonCodes.push('AE_RECONCILIATION_PENDING');

  return AeArtifactReconciliationV1Schema.parse({
    schema: 'atlas.ae-artifact-reconciliation.v1',
    state,
    semanticRepresentation: 'semantic_768',
    inputDimension: 768,
    hiddenDimension: 128,
    latentDimension: 64,
    trainerPath,
    latentProducerPath,
    metadataPath,
    metadataTimestamp: metadata?.timestamp ?? null,
    metadataValLoss: metadata?.best_val_loss ?? null,
    expectedWeightFiles: [...AE_EXPECTED_WEIGHT_FILES],
    presentWeightFiles,
    trainerPresent: input.inventory.trainerPresent,
    latentProducerPresent: input.inventory.latentProducerPresent,
    exactRecallBaselinePresent: input.inventory.exactRecallBaselinePresent,
    reconstructionValidationPresent: input.inventory.reconstructionValidationPresent,
    routingOnlyUntilPromoted: true,
    canonicalWritesAllowed: false,
    onlineTrainingAllowed: false,
    reasonCodes,
    producerRevision: input.producerRevision,
  });
}
