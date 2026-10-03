#!/usr/bin/env node

/**
 * Retired placeholder for the former “Gate 2” autoencoder demo.
 *
 * This file never trained a model: its old --apply path printed fabricated
 * epochs, metrics, and checkpoint locations. Keep the path as a fail-closed
 * diagnostic so old callers cannot mistake simulated output for proof.
 *
 * The candidate implementation is python/train_latent_autoencoder.py. It reads
 * codebase_chunk_index.content_embedding_768 and defines the 768 -> 512 -> 256
 * -> 128 candidate architecture, with latent_64 derived from latent_128. It
 * still cannot train through this command until semantic-writer and per-row
 * input provenance are proven. Four-dimensional topology is a separate lane.
 * The separate legacy Redis/Qdrant trainer is
 * scripts/atlas/train-autoencoder-768-64.mjs; do not use it as the canonical
 * EmbeddingGemma-derived latent trainer.
 */

const args = new Set(process.argv.slice(2));
const architecture = {
  architectureRevision: 'atlas.latent-ae.768-512-256-128.v2',
  input: { representation: 'semantic_768', dimensions: 768, expectedModelFamily: 'EmbeddingGemma' },
  encoderDimensions: [768, 512, 256, 128],
  outputs: {
    latent_256: 'learned intermediate stage',
    latent_128: 'learned bottleneck',
    latent_64: 'normalized 64-coordinate prefix derived from latent_128',
    topology4d: 'separate revisioned projection from latent_256; not an AE output',
  },
  status: 'DEFINED_NOT_TRAINED',
  trainingAdmission: 'BLOCKED until canonical semantic writer and admitted per-row input provenance are proven',
};

if (args.has('--dry-run')) {
  console.log(JSON.stringify({ ...architecture, databaseRead: false, trainingPerformed: false, artifactWritten: false }, null, 2));
} else {
  console.error(JSON.stringify({ ...architecture, status: 'TRAINING_BLOCKED', databaseRead: false, trainingPerformed: false, artifactWritten: false }));
  process.exitCode = 78;
}
