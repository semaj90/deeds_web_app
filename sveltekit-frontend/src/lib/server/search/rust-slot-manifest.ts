/**
 * Rust Slot Manifest — Bijection mapping N-API slot numbers to packet identity
 *
 * The Rust N-API backend returns opaque slot numbers (0..N).
 * This frozen manifest resolves slot → packet_key, feature_id, source_ref, etc.
 *
 * Invariants:
 * - One slot = one manifest row (no duplicates)
 * - One manifest row = one slot (bijection)
 * - packet_key present, content_hash present, workspace_revision present
 * - Vector dimensions match index metadata
 * - Manifest hash matches native index metadata
 */

import { z } from 'zod';

export const RustSlotManifestRowSchema = z.object({
  slot: z.number().int().min(0),
  packetKey: z.string(),
  featureId: z.string().nullable(),
  treeNodeId: z.string().nullable(),
  sourceRef: z.string(),
  contentHash: z.string(),
  workspaceRevision: z.string(),
  vectorName: z.enum(['dense_768', 'dense_384_custom', 'latent_64', 'bm42']),
  embeddingModelVersion: z.string(),
  artifactKind: z.string(),
  domainIds: z.string(), // CSV or JSON array as string
});

export type RustSlotManifestRow = z.infer<typeof RustSlotManifestRowSchema>;

export const RustSlotManifestSchema = z.object({
  schemaId: z.literal('atlas:rust:slot:manifest'),
  schemaVersion: z.literal('1.0.0'),
  indexVersion: z.string(),
  vectorName: z.enum(['dense_768', 'dense_384_custom', 'latent_64', 'bm42']),
  dimensions: z.number().int().min(1),
  inputSnapshotSha256: z.string(),
  manifestSha256: z.string(),
  rows: z.array(RustSlotManifestRowSchema),
});

export type RustSlotManifest = z.infer<typeof RustSlotManifestSchema>;

/**
 * Validate manifest bijection and invariants
 */
export function validateRustSlotManifest(manifest: RustSlotManifest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check schema version
  if (manifest.schemaVersion !== '1.0.0') {
    errors.push(`Schema version mismatch: expected 1.0.0, got ${manifest.schemaVersion}`);
  }

  // Check bijection
  const seenSlots = new Set<number>();
  for (const row of manifest.rows) {
    if (seenSlots.has(row.slot)) {
      errors.push(`Duplicate slot: ${row.slot}`);
    }
    seenSlots.add(row.slot);

    // Check required fields
    if (!row.packetKey) {
      errors.push(`Row slot ${row.slot}: packet_key is required`);
    }
    if (!row.contentHash) {
      errors.push(`Row slot ${row.slot}: content_hash is required`);
    }
    if (!row.workspaceRevision) {
      errors.push(`Row slot ${row.slot}: workspace_revision is required`);
    }

    // Check vector name matches manifest
    if (row.vectorName !== manifest.vectorName) {
      errors.push(
        `Row slot ${row.slot}: vectorName mismatch (row: ${row.vectorName}, manifest: ${manifest.vectorName})`
      );
    }
  }

  // Check slot range (should be 0..rows.length-1)
  const slots = Array.from(seenSlots).sort((a, b) => a - b);
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== i) {
      errors.push(`Slot gaps detected: expected ${i}, got ${slots[i]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
