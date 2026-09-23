/**
 * CanonicalIdentityV1 — thin discriminated-union envelope over Parent Atlas's
 * already-frozen identity taxonomy.
 *
 * This file does NOT mint, derive, or own any identity. It exists only so
 * cross-cutting code (receipts, logs, generic "what kind of identity is
 * this" dispatch) has one place to name the axes, instead of re-deriving or
 * duplicating the real contracts. The canonical logic for each kind lives in
 * the app (sveltekit-frontend/src/lib/server/atlas/identity/*), which this
 * package-side file cannot import (packages/atlas-core has no dependency on
 * the app — see packages/atlas-core/package.json). Each variant below is
 * therefore a structural mirror of the real shape, not a re-implementation:
 * if the real contract's field names or semantics change, this file must be
 * updated to match, never the other way around.
 *
 * Frozen taxonomy this envelope names (see each pointer for the true owner):
 *   STABLE_FILE          -- sveltekit-frontend .../identity/stable-file-identity-mint-v1.ts
 *                            (StableFileMintOutcomeV1) -- UUIDv7, lifecycle-minted, NEVER
 *                            derived from path or content.
 *   REPOSITORY           -- same file (RepositoryIdentityRowV1) -- UUIDv7, unique on
 *                            source_authority_repo_id.
 *   SOURCE_REVISION       -- sveltekit-frontend .../identity/current-source-authority-v1.ts
 *                            (SnapshotSourceV1.sourceRevision) -- sha256:<64-hex> content digest.
 *   WORKSPACE_REVISION    -- same file (workspaceRevision) -- sha256:<64-hex> over a sorted
 *                            manifest digest of an admitted workspace snapshot.
 *   PACKET                -- sveltekit-frontend .../embedding/semantic-packet-writer.ts +
 *                            packet-identity-resolver.ts (packet_key) -- packet/join identity,
 *                            NEVER a substitute for STABLE_FILE. See
 *                            docs/reports/packet-key-single-owner-convergence-v1.json:
 *                            lifecycle contract for this axis is UNDEFINED as of 2026-09-22 --
 *                            do not assume packet_key survives rename or is revision-qualified.
 *   TREE_NODE_OCCURRENCE   -- sveltekit-frontend .../identity/tree-node-occurrence-v1.ts
 *                            (TreeNodeOccurrenceV1.occurrenceId) -- sha256: derived, declaration-
 *                            scoped, revision-qualified. NEVER canonical source identity.
 *   STABLE_SYMBOL          -- sveltekit-frontend .../identity/symbol-identity-audit-v1.ts
 *                            (RegistryRowV1.stableSymbolId) -- logical symbol identity,
 *                            registry-authority only.
 *   SYMBOL_VERSION         -- same file (SymbolVersionRowV1.symbolVersionId) -- revision-bound
 *                            symbol instance.
 *   FEATURE                -- ./feature-identity.ts (this package, FeatureIdentity) -- the only
 *                            variant this file can import directly (same package).
 *
 * Explicitly NEVER a canonical identity kind in this envelope (per this repo's frozen
 * taxonomy): CandidateOrdinal, projectionOrdinal, gpuNodeId, Qdrant point ID, GraphOrdinal,
 * representation/execution/transport IDs. A future variant must not be added for any of these
 * without first changing the taxonomy at its true owning file, not here.
 */

import type { FeatureId, FeatureIdentity } from './feature-identity.js';

export type CanonicalIdentityKindV1 =
  | 'STABLE_FILE'
  | 'REPOSITORY'
  | 'SOURCE_REVISION'
  | 'WORKSPACE_REVISION'
  | 'PACKET'
  | 'TREE_NODE_OCCURRENCE'
  | 'STABLE_SYMBOL'
  | 'SYMBOL_VERSION'
  | 'FEATURE';

interface CanonicalIdentityBaseV1 {
  readonly kind: CanonicalIdentityKindV1;
}

export interface StableFileIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'STABLE_FILE';
  /** UUIDv7. Lifecycle-minted only -- never derived from path or content. */
  readonly stableFileId: string;
  readonly repositoryId: string;
}

export interface RepositoryIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'REPOSITORY';
  /** UUIDv7. Unique on source_authority_repo_id. */
  readonly repositoryId: string;
  readonly sourceAuthorityRepoId: string;
}

export interface SourceRevisionRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'SOURCE_REVISION';
  /** sha256:<64-hex> exact-content digest. */
  readonly sourceRevision: string;
  readonly sourceRef: string;
}

export interface WorkspaceRevisionRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'WORKSPACE_REVISION';
  /** sha256:<64-hex> over a sorted admitted-manifest digest. */
  readonly workspaceRevision: string;
}

export interface PacketIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'PACKET';
  /** Packet/join identity only. Never a stableFileId substitute. Lifecycle contract
   * (rename survival, revision qualification) is UNDEFINED as of the 2026-09-22
   * PACKET-KEY-SINGLE-OWNER-CONVERGENCE-01 gate -- do not assume either. */
  readonly packetKey: string;
  readonly sourceRef: string;
}

export interface TreeNodeOccurrenceRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'TREE_NODE_OCCURRENCE';
  /** sha256:<64-hex> derived from (sourceRef, sourceRevision, nodeType, startByte, endByte[, astPath]). */
  readonly occurrenceId: string;
  readonly sourceRevision: string;
}

export interface StableSymbolIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'STABLE_SYMBOL';
  readonly stableSymbolId: string;
}

export interface SymbolVersionIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'SYMBOL_VERSION';
  readonly symbolVersionId: string;
  readonly stableSymbolId: string;
  readonly sourceRevision: string | null;
}

export interface FeatureIdentityRefV1 extends CanonicalIdentityBaseV1 {
  readonly kind: 'FEATURE';
  readonly featureId: FeatureId;
}

/** The full discriminated union. Every branch must be handled (no default arm) by any
 * exhaustive switch over `.kind`, so adding a new identity kind is a compile-time-visible
 * change everywhere this union is consumed. */
export type CanonicalIdentityV1 =
  | StableFileIdentityRefV1
  | RepositoryIdentityRefV1
  | SourceRevisionRefV1
  | WorkspaceRevisionRefV1
  | PacketIdentityRefV1
  | TreeNodeOccurrenceRefV1
  | StableSymbolIdentityRefV1
  | SymbolVersionIdentityRefV1
  | FeatureIdentityRefV1;

export function isCanonicalIdentityKind(
  value: unknown,
  kind: CanonicalIdentityKindV1
): value is CanonicalIdentityV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { kind: unknown }).kind === kind
  );
}

export function featureIdentityRef(identity: FeatureIdentity): FeatureIdentityRefV1 {
  return { kind: 'FEATURE', featureId: identity.featureId };
}
