import { describe, expect, it } from 'vitest';
import {
  buildFunctionRegistryRetrievalProofV1,
  functionRegistryEvidenceFromMetadataV1,
  type Candidate,
} from './search-runtime.js';

const digest = 'a'.repeat(64);

function metadata() {
  return {
    function_registry_snapshot_checksum: digest,
    canonical_function_id: 'function:stable-id',
    symbol_version_id: 'symbol-version:revision-id',
    tree_node_id: 'tree-node:native-id',
    source_content_hash: digest,
    byte_start: 8,
    byte_end: 24,
    evidence_checksum: digest,
  };
}

describe('Function Registry retrieval proof v1', () => {
  it('accepts only complete, identity-matched source evidence metadata', () => {
    const valid = functionRegistryEvidenceFromMetadataV1({
      metadata: metadata(),
      packetKey: 'packet:canonical',
      symbolVersionId: 'symbol-version:revision-id',
      treeNodeId: 'tree-node:native-id',
      sourceRevision: 'source-rev-1',
    });
    expect(valid?.startByte).toBe(8);
    expect(functionRegistryEvidenceFromMetadataV1({
      metadata: metadata(),
      packetKey: 'packet:canonical',
      symbolVersionId: 'symbol-version:other',
      treeNodeId: 'tree-node:native-id',
      sourceRevision: 'source-rev-1',
    })).toBeNull();
    expect(functionRegistryEvidenceFromMetadataV1({
      metadata: { ...metadata(), byte_end: 8 },
      packetKey: 'packet:canonical',
      symbolVersionId: 'symbol-version:revision-id',
      treeNodeId: 'tree-node:native-id',
      sourceRevision: 'source-rev-1',
    })).toBeNull();
  });

  it('records candidate-to-final-Top-K membership without claiming admission', () => {
    const evidence = functionRegistryEvidenceFromMetadataV1({
      metadata: metadata(),
      packetKey: 'packet:canonical',
      symbolVersionId: 'symbol-version:revision-id',
      treeNodeId: 'tree-node:native-id',
      sourceRevision: 'source-rev-1',
    });
    const candidate = {
      packetKey: 'packet:canonical',
      sourceRef: 'src/example.ts',
      sourceRevision: 'source-rev-1',
      workspaceRevision: 'workspace-rev-1',
      symbolVersionId: 'symbol-version:revision-id',
      functionRegistryEvidence: evidence,
    } as Candidate;
    const proof = buildFunctionRegistryRetrievalProofV1({
      enabled: true,
      readOnly: true,
      candidates: [candidate],
      finalPackets: [{
        packet_key: 'packet:canonical',
        symbol_version_id: 'symbol-version:revision-id',
        tree_node_id: 'tree-node:native-id',
        source_revision: 'source-rev-1',
        workspace_revision: 'workspace-rev-1',
        source_ref: 'src/example.ts',
      } as never],
    });
    expect(proof.status).toBe('QUALIFIED_CANDIDATES_PRESENT');
    expect(proof.qualifiedFinalCandidateCount).toBe(1);
    // Strict identity: a final packet carrying only packet_key is not the same qualified candidate.
    const keyOnly = buildFunctionRegistryRetrievalProofV1({
      enabled: true,
      readOnly: true,
      candidates: [candidate],
      finalPackets: [{ packet_key: 'packet:canonical' } as never],
    });
    expect(keyOnly.qualifiedFinalCandidateCount).toBe(0);
    expect(proof.contextManifestAdmitted).toBe(false);
    expect(proof.canonicalAuthority).toBe(false);
    expect(proof.writesSuppressed).toBe(true);
  });
});
