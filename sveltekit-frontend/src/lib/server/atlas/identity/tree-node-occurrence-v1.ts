/**
 * TreeNodeOccurrenceV1 (S01-09D) — the canonical, declaration-scoped structural occurrence identity.
 *
 * Root cause this contract fixes (docs/reports/tree-node-occurrence-producer-census-v1.json): the earliest live
 * producer of `ast-entities.jsonl`, `scripts/atlas/run-ast-entity-prefill-yaml.mjs`, built each declaration row via
 * `{ ...packet, symbol_name, start_byte, end_byte, ... }` -- the `...packet` spread carries the PACKET's single
 * `tree_node_id` into EVERY declaration row extracted from that packet's file, verbatim, unoverridden. A file with N
 * declarations produced N rows sharing ONE tree_node_id. This is a FILE-SCOPED identifier value flowing through a
 * field that must be DECLARATION-SCOPED.
 *
 * Never conflate with (per the S01-08G design, restated here since it names the same axes):
 *   stableFileId          -- logical file lifecycle identity (S01-08, not yet built)
 *   sourceRevision         -- content/revision identity
 *   stableSymbolId          -- logical symbol identity (atlas_symbol_registry)
 *   symbolVersionId         -- revision-qualified symbol instance (atlas_symbol_versions)
 *   treeNodeOccurrenceId   -- ONE structural occurrence within ONE source revision (this contract)
 * Occurrence identity is NEVER: file_id, source_ref alone, stableFileId, packetKey, CandidateOrdinal, Qdrant point
 * ID, or GraphOrdinal.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';

export const TREE_NODE_OCCURRENCE_SCHEMA = 'atlas.tree-node-occurrence.v1' as const;
const REVISION_RE = /^sha256:[a-f0-9]{64}$/;

export type TreeNodeOccurrenceRejectionCode =
  | 'TREE_NODE_OCCURRENCE_MISSING'
  | 'TREE_NODE_OCCURRENCE_FILE_SCOPED'
  | 'TREE_NODE_OCCURRENCE_COLLISION'
  | 'TREE_NODE_SOURCE_REVISION_MISSING'
  | 'TREE_NODE_SPAN_INVALID'
  | 'TREE_NODE_PROVENANCE_MISSING';

export interface TreeNodeOccurrenceInputV1 {
  sourceRef: string;
  /** Not required to already be sha256:-qualified here (S01-09D is forward-correctness for occurrence identity,
   * not revision qualification -- that is S01-10B's separate, already-shipped contract). Only non-empty is required. */
  sourceRevision: string;
  nodeType: string;
  startByte: number;
  endByte: number;
  astPath?: string;
  parentAstPath?: string;
}

export interface TreeNodeOccurrenceV1 extends TreeNodeOccurrenceInputV1 {
  schema: typeof TREE_NODE_OCCURRENCE_SCHEMA;
  occurrenceId: string;
}

/** Deterministic, declaration-scoped derivation from the semantic tuple (sourceRef, sourceRevision, nodeType,
 * startByte, endByte[, astPath]) -- sha256 of canonical JSON, NOT a UUIDv8 byte-formatting (kept as a plain
 * sha256: string to match this repo's existing revision/checksum string convention rather than minting a new
 * UUID namespace for something that is not itself a database-row identity). */
export function deriveTreeNodeOccurrenceId(input: TreeNodeOccurrenceInputV1): string {
  const material = JSON.stringify({
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    nodeType: input.nodeType,
    startByte: input.startByte,
    endByte: input.endByte,
    astPath: input.astPath ?? null,
  });
  return `sha256:${createHash('sha256').update(material).digest('hex')}`;
}

export function buildTreeNodeOccurrenceV1(input: TreeNodeOccurrenceInputV1): TreeNodeOccurrenceV1 {
  return { schema: TREE_NODE_OCCURRENCE_SCHEMA, ...input, occurrenceId: deriveTreeNodeOccurrenceId(input) };
}

export interface TreeNodeOccurrenceValidationV1 { ok: boolean; reasons: TreeNodeOccurrenceRejectionCode[] }

/** Validates ONE occurrence in isolation: revision present, span valid, provenance (sourceRef) present. Does not
 * (and cannot, in isolation) detect collisions across a population -- see validateTreeNodeOccurrencePopulationV1. */
export function validateTreeNodeOccurrenceV1(occ: Partial<TreeNodeOccurrenceInputV1> & { occurrenceId?: string | null }): TreeNodeOccurrenceValidationV1 {
  const reasons: TreeNodeOccurrenceRejectionCode[] = [];
  if (!occ.sourceRef) reasons.push('TREE_NODE_PROVENANCE_MISSING');
  if (!occ.sourceRevision) reasons.push('TREE_NODE_SOURCE_REVISION_MISSING');
  if (occ.startByte === undefined || occ.endByte === undefined || !Number.isInteger(occ.startByte) || !Number.isInteger(occ.endByte) || occ.startByte >= occ.endByte) {
    reasons.push('TREE_NODE_SPAN_INVALID');
  }
  if (!occ.occurrenceId) reasons.push('TREE_NODE_OCCURRENCE_MISSING');
  return { ok: reasons.length === 0, reasons };
}

/**
 * Population-level check: within one (sourceRef, sourceRevision) file+revision, two DIFFERENT declaration
 * signatures/spans must never share an occurrenceId (TREE_NODE_OCCURRENCE_FILE_SCOPED / _COLLISION). This is the
 * exact check that would have caught the S01-09C defect before it ever reached ast-entities.jsonl.
 */
export function validateTreeNodeOccurrencePopulationV1(
  occurrences: readonly TreeNodeOccurrenceV1[],
): { ok: boolean; violations: Array<{ occurrenceId: string; sourceRef: string; code: TreeNodeOccurrenceRejectionCode; distinctSpanCount: number }> } {
  const byOccurrenceId = new Map<string, TreeNodeOccurrenceV1[]>();
  for (const occ of occurrences) {
    const list = byOccurrenceId.get(occ.occurrenceId) ?? [];
    list.push(occ);
    byOccurrenceId.set(occ.occurrenceId, list);
  }
  const violations: Array<{ occurrenceId: string; sourceRef: string; code: TreeNodeOccurrenceRejectionCode; distinctSpanCount: number }> = [];
  for (const [occurrenceId, group] of byOccurrenceId) {
    if (group.length < 2) continue;
    const distinctSpans = new Set(group.map((g) => `${g.startByte}:${g.endByte}:${g.nodeType}`));
    if (distinctSpans.size > 1) {
      // Same occurrenceId, genuinely different declarations -- exactly the file-scoped defect shape.
      const distinctRefs = new Set(group.map((g) => g.sourceRef));
      violations.push({ occurrenceId, sourceRef: [...distinctRefs][0], code: distinctRefs.size === 1 ? 'TREE_NODE_OCCURRENCE_FILE_SCOPED' : 'TREE_NODE_OCCURRENCE_COLLISION', distinctSpanCount: distinctSpans.size });
    }
  }
  return { ok: violations.length === 0, violations };
}

export const TreeNodeOccurrenceV1Schema = z
  .object({
    schema: z.literal(TREE_NODE_OCCURRENCE_SCHEMA),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    nodeType: z.string().min(1),
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
    astPath: z.string().optional(),
    parentAstPath: z.string().optional(),
    occurrenceId: z.string().min(1),
  })
  .strict();

export const REVISION_QUALIFIED_RE = REVISION_RE;
