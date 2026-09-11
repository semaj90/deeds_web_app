#!/usr/bin/env node
/**
 * NEURAL-RESIDENCY-BINDING-01
 *
 * Reconciles the existing FEAT-04 envelope, the existing real-CUDA residency
 * proof, and (optionally) a ContextManifest. This is a read-only admission
 * audit: it does not create a new FEAT-04 format and does not mutate any
 * database, vector store, cache, graph, container, model, or GPU allocation.
 *
 * A manifest is considered fully bound only when it explicitly carries the
 * same candidate snapshot revision, ordinal-map checksum, and feature snapshot
 * checksum as the FEAT-04 artifact. Current legacy manifests may carry only
 * ordinal_map_checksum; those are classified as PARTIAL rather than silently
 * promoted.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256_HEX = /^[0-9a-f]{64}$/i;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function equalArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function push(blockers, condition, code, detail) {
  if (!condition) blockers.push({ code, detail });
}

export function evaluateNeuralResidencyBinding({ feat04, residency, manifest = null, paths = {} }) {
  const blockers = [];

  push(blockers, feat04?.schema === 'atlas.candidate-feature-gpu-feat04-envelope.v1',
    'FEAT04_SCHEMA_INVALID', feat04?.schema ?? null);
  push(blockers, typeof feat04?.candidateSnapshotRevision === 'string' && feat04.candidateSnapshotRevision.length > 0,
    'FEAT04_CANDIDATE_SNAPSHOT_REVISION_MISSING', null);
  push(blockers, SHA256_HEX.test(String(feat04?.ordinalMapChecksum ?? '')),
    'FEAT04_ORDINAL_MAP_CHECKSUM_INVALID', feat04?.ordinalMapChecksum ?? null);
  push(blockers, SHA256_HEX.test(String(feat04?.featureSnapshotChecksum ?? '')),
    'FEAT04_FEATURE_SNAPSHOT_CHECKSUM_INVALID', feat04?.featureSnapshotChecksum ?? null);
  push(blockers, SHA256_HEX.test(String(feat04?.pack?.gpuPackChecksum ?? '')),
    'FEAT04_GPU_PACK_CHECKSUM_INVALID', feat04?.pack?.gpuPackChecksum ?? null);
  push(blockers, Array.isArray(feat04?.selectedOrdinals) && feat04.selectedOrdinals.length > 0,
    'FEAT04_SELECTED_ORDINALS_MISSING', null);
  push(blockers, feat04?.identityAuthority === false && feat04?.canonicalOwnerChanged === false && feat04?.writesPerformed === false,
    'FEAT04_NONAUTHORITY_FLAGS_INVALID', null);

  push(blockers, residency?.schema === 'atlas.candidate-feature-gpu-residency-proof.v1',
    'RESIDENCY_SCHEMA_INVALID', residency?.schema ?? null);
  push(blockers, residency?.status === 'CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN',
    'RESIDENCY_STATUS_NOT_PROVEN', residency?.status ?? null);
  push(blockers, residency?.gpuExecutionObserved === true && residency?.ownerProcessResident === true,
    'RESIDENCY_GPU_OWNER_PROCESS_NOT_PROVEN', null);
  push(blockers, residency?.storeWrites === false,
    'RESIDENCY_STORE_WRITES_NOT_FALSE', residency?.storeWrites ?? null);
  push(blockers, residency?.ordinalParity === true && residency?.featureValueParity === true &&
    residency?.featurePresenceParity === true && residency?.laneMaskParity === true &&
    residency?.degradedIdentityParity === true,
    'RESIDENCY_PARITY_NOT_PROVEN', null);
  push(blockers, residency?.residentReuse?.h2dTransfers === 1,
    'RESIDENCY_INITIAL_H2D_TRANSFER_COUNT_INVALID', residency?.residentReuse?.h2dTransfers ?? null);
  push(blockers, residency?.residentReuse?.reuseH2dTransfers === 0,
    'RESIDENCY_REUSE_H2D_TRANSFER_OBSERVED', residency?.residentReuse?.reuseH2dTransfers ?? null);
  push(blockers, residency?.residentReuse?.sameProcess === true && residency?.residentReuse?.sameResidentTensorObjects === true,
    'RESIDENCY_SAME_PROCESS_TENSOR_REUSE_NOT_PROVEN', null);
  push(blockers, residency?.postReleaseAccessBlocked === true,
    'RESIDENCY_POST_RELEASE_ACCESS_NOT_BLOCKED', residency?.postReleaseAccessBlocked ?? null);

  const observation = residency?.observation ?? {};
  push(blockers, observation?.candidateSnapshotRevision === feat04?.candidateSnapshotRevision,
    'CANDIDATE_SNAPSHOT_REVISION_MISMATCH', {
      feat04: feat04?.candidateSnapshotRevision ?? null,
      residency: observation?.candidateSnapshotRevision ?? null,
    });
  push(blockers, observation?.ordinalMapChecksum === feat04?.ordinalMapChecksum,
    'ORDINAL_MAP_CHECKSUM_MISMATCH', {
      feat04: feat04?.ordinalMapChecksum ?? null,
      residency: observation?.ordinalMapChecksum ?? null,
    });
  push(blockers, observation?.featureSnapshotChecksum === feat04?.featureSnapshotChecksum,
    'FEATURE_SNAPSHOT_CHECKSUM_MISMATCH', {
      feat04: feat04?.featureSnapshotChecksum ?? null,
      residency: observation?.featureSnapshotChecksum ?? null,
    });
  push(blockers, residency?.sourceGpuPackChecksum === feat04?.pack?.gpuPackChecksum,
    'GPU_PACK_CHECKSUM_MISMATCH', {
      feat04: feat04?.pack?.gpuPackChecksum ?? null,
      residency: residency?.sourceGpuPackChecksum ?? null,
    });
  push(blockers, equalArray(residency?.gather?.selectedOrdinals, feat04?.selectedOrdinals),
    'SELECTED_ORDINALS_MISMATCH', null);

  const artifactBlockerCount = blockers.length;
  const manifestIdentity = manifest?.identity ?? null;
  if (manifest) {
    push(blockers, Boolean(manifestIdentity), 'PREFILL_MANIFEST_IDENTITY_MISSING', null);
    if (manifestIdentity) {
      push(blockers, manifestIdentity.complete === true,
        'PREFILL_MANIFEST_IDENTITY_INCOMPLETE', manifestIdentity.complete ?? null);
      push(blockers, manifestIdentity.ordinal_map_checksum === feat04?.ordinalMapChecksum,
        'PREFILL_MANIFEST_ORDINAL_MAP_MISMATCH', {
          feat04: feat04?.ordinalMapChecksum ?? null,
          manifest: manifestIdentity.ordinal_map_checksum ?? null,
        });
      push(blockers, manifestIdentity.candidate_snapshot_revision === feat04?.candidateSnapshotRevision,
        'PREFILL_MANIFEST_CANDIDATE_SNAPSHOT_NOT_BOUND', {
          required: feat04?.candidateSnapshotRevision ?? null,
          observed: manifestIdentity.candidate_snapshot_revision ?? null,
        });
      push(blockers, manifestIdentity.feature_snapshot_checksum === feat04?.featureSnapshotChecksum,
        'PREFILL_MANIFEST_FEATURE_SNAPSHOT_NOT_BOUND', {
          required: feat04?.featureSnapshotChecksum ?? null,
          observed: manifestIdentity.feature_snapshot_checksum ?? null,
        });
    }
  }

  const artifactPairProven = artifactBlockerCount === 0;
  const manifestChecked = Boolean(manifest);
  const manifestFullyBound = manifestChecked && blockers.length === 0;
  const status = manifestFullyBound
    ? 'NEURAL_RESIDENCY_BINDING_PROVEN'
    : artifactPairProven
      ? (manifestChecked
        ? 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_BINDING_BLOCKED'
        : 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_UNCHECKED')
      : 'NEURAL_RESIDENCY_BINDING_BLOCKED';

  const bindingIdentity = {
    candidateSnapshotRevision: feat04?.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: feat04?.ordinalMapChecksum ?? null,
    featureSnapshotChecksum: feat04?.featureSnapshotChecksum ?? null,
    gpuPackChecksum: feat04?.pack?.gpuPackChecksum ?? null,
    residencyObservationChecksum: observation?.observationChecksum ?? null,
    manifestId: manifest?.manifest_id ?? null,
    candidateOrdinalSetChecksum: manifestIdentity?.candidate_ordinal_set_checksum ?? null,
    evidenceRevisionChecksum: manifestIdentity?.evidence_revision_checksum ?? null,
  };

  return {
    schema: 'atlas.neural-residency-binding-audit.v1',
    status,
    gate: 'NEURAL-RESIDENCY-BINDING-01',
    artifactPairProven,
    manifestChecked,
    manifestFullyBound,
    bindingIdentity,
    bindingChecksum: checksum(bindingIdentity),
    residency: {
      gpuExecutionObserved: residency?.gpuExecutionObserved === true,
      ownerProcessResident: residency?.ownerProcessResident === true,
      h2dTransfers: residency?.residentReuse?.h2dTransfers ?? null,
      reuseH2dTransfers: residency?.residentReuse?.reuseH2dTransfers ?? null,
      sameProcess: residency?.residentReuse?.sameProcess === true,
      sameResidentTensorObjects: residency?.residentReuse?.sameResidentTensorObjects === true,
      postReleaseAccessBlocked: residency?.postReleaseAccessBlocked === true,
      ordinalParity: residency?.ordinalParity === true,
      featureValueParity: residency?.featureValueParity === true,
      featurePresenceParity: residency?.featurePresenceParity === true,
      laneMaskParity: residency?.laneMaskParity === true,
      degradedIdentityParity: residency?.degradedIdentityParity === true,
    },
    blockers,
    paths,
    prefillCallerMode: 'SHADOW_READONLY',
    rankingPromotion: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value?.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args.set(key, true);
    else {
      args.set(key, next);
      index += 1;
    }
  }
  return args;
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
  const feat04Path = args.get('feat04');
  const residencyPath = args.get('residency');
  const manifestPath = args.get('manifest');
  const outputPath = args.get('output');

  if (typeof feat04Path !== 'string' || typeof residencyPath !== 'string') {
    throw new Error('NEURAL_RESIDENCY_BINDING_REQUIRES_FEAT04_AND_RESIDENCY');
  }

  const feat04 = readJson(feat04Path);
  const residency = readJson(residencyPath);
  const manifest = typeof manifestPath === 'string' ? readJson(manifestPath) : null;
  const receipt = evaluateNeuralResidencyBinding({
    feat04,
    residency,
    manifest,
    paths: {
      feat04: feat04Path,
      residency: residencyPath,
      manifest: typeof manifestPath === 'string' ? manifestPath : null,
    },
  });

  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (typeof outputPath === 'string') writeFileSync(outputPath, text, 'utf8');
  process.stdout.write(text);
  return receipt.status === 'NEURAL_RESIDENCY_BINDING_PROVEN' ||
    receipt.status === 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_UNCHECKED' ||
    receipt.status === 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_BINDING_BLOCKED'
    ? 0
    : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  }
}
