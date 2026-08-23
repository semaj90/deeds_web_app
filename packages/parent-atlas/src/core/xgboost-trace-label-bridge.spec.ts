import { describe, expect, it } from 'vitest';
import {
  buildXgboostTraceLabelBridge,
  validateXgboostTraceLabelBridge,
} from './xgboost-trace-label-bridge.js';

describe('XGBoost trace-label bridge', () => {
  it('builds a deterministic non-promoting bridge', () => {
    const bridge = buildXgboostTraceLabelBridge({
      workspace_revision: 'workspace:r1',
      source_revision: 'source:r1',
      bridge_revision: 'bridge:v1',
      entries: [{
        trace_label: 'ui_components',
        packet_keys: ['packet:b', 'packet:a'],
        mapping_method: 'REVIEWED_MAPPING',
        evidence_refs: ['review:1'],
      }],
    });

    expect(bridge.promotion_allowed).toBe(false);
    expect(validateXgboostTraceLabelBridge(bridge).bridge_checksum).toHaveLength(64);
  });

  it('rejects duplicate labels and packet identities', () => {
    expect(() => validateXgboostTraceLabelBridge(buildXgboostTraceLabelBridge({
      workspace_revision: 'workspace:r1',
      source_revision: 'source:r1',
      bridge_revision: 'bridge:v1',
      entries: [
        { trace_label: 'x', packet_keys: ['packet:a'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['e:1'] },
        { trace_label: 'x', packet_keys: ['packet:b'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['e:2'] },
      ],
    }))).toThrow('XGBOOST_TRACE_LABEL_BRIDGE_DUPLICATE_LABEL');
  });

  it('rejects checksum tampering', () => {
    const bridge = buildXgboostTraceLabelBridge({
      workspace_revision: 'workspace:r1',
      source_revision: 'source:r1',
      bridge_revision: 'bridge:v1',
      entries: [{ trace_label: 'x', packet_keys: ['packet:a'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['e:1'] }],
    });
    expect(() => validateXgboostTraceLabelBridge({ ...bridge, entries: [] }))
      .toThrow('XGBOOST_TRACE_LABEL_BRIDGE_CHECKSUM_MISMATCH');
  });
});
