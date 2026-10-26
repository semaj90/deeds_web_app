/**
 * Plain-node mirror of sveltekit-frontend/src/lib/server/atlas/identity/tree-node-occurrence-v1.ts's
 * deriveTreeNodeOccurrenceId(). Kept as a direct sha256 implementation (not a tsx-register loader shim) because
 * the caller (run-ast-entity-prefill-yaml.mjs) is a hot-path script that walks the whole repository and must not
 * pay a per-run TS-registration cost. The algorithm MUST stay byte-identical to the TS module -- verified by a
 * parity check in `scripts/atlas/test-tree-node-occurrence-parity-v1.mts`; keep both implementations byte-identical.
 */
import { createHash } from 'node:crypto';

export function deriveTreeNodeOccurrenceId({ sourceRef, sourceRevision, nodeType, startByte, endByte, astPath = null }) {
  const material = JSON.stringify({ sourceRef, sourceRevision, nodeType, startByte, endByte, astPath });
  return `sha256:${createHash('sha256').update(material).digest('hex')}`;
}
