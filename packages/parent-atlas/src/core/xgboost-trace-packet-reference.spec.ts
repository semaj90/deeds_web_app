import { describe, expect, it } from 'vitest';
import {
  validateXgboostTracePacketReference,
  validateXgboostTracePacketReferences,
} from './xgboost-trace-packet-reference.js';

const reference = {
  packet_key: 'packet:canonical:1',
  source_ref: 'src/example.ts',
  workspace_revision: 'workspace-1',
  source_revision: 'source-1',
  representation_id: 'semantic_768',
  representation_revision: 'embeddinggemma-1',
  retrieval_rank: 0,
};

describe('XGBoost trace packet reference', () => {
  it('requires canonical identity and semantic_768 lineage', () => {
    expect(validateXgboostTracePacketReference(reference)).toEqual(reference);
    expect(() => validateXgboostTracePacketReference({ ...reference, representation_id: 'latent_128' }))
      .toThrow();
  });

  it('rejects duplicate packet identities in one trace', () => {
    expect(() => validateXgboostTracePacketReferences([reference, reference]))
      .toThrow('XGBOOST_TRACE_PACKET_REFERENCE_DUPLICATE_PACKET_KEY');
  });
});
