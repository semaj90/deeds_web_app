import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildXgboostTraceLabelBridge,
  buildXgboostTraceLabelPacketLookup,
  resolveXgboostTraceLabelPacketKeys,
  validateXgboostTraceLabelBridge,
} from '../dist/core/xgboost-trace-label-bridge.js';

function makeBridge(entries = [{
  trace_label: 'database_orm',
  packet_keys: ['packet-key-b', 'packet-key-a'],
  mapping_method: 'REVIEWED_MAPPING',
  evidence_refs: ['review:1'],
}]) {
  return buildXgboostTraceLabelBridge({
    workspace_revision: 'workspace:r1',
    source_revision: 'source:r1',
    bridge_revision: 'bridge:r1',
    entries,
  });
}

test('builds a checksummed, non-promoting bridge and resolves exact keys', () => {
  const bridge = makeBridge();
  assert.equal(bridge.promotion_allowed, false);
  assert.deepEqual(resolveXgboostTraceLabelPacketKeys(bridge, 'database_orm'), ['packet-key-b', 'packet-key-a']);
  assert.deepEqual(resolveXgboostTraceLabelPacketKeys(bridge, 'unknown'), []);
  assert.equal(validateXgboostTraceLabelBridge(bridge).bridge_checksum.length, 64);
});

test('builds packet rows only from exact bridge keys, never feature labels', () => {
  const bridge = makeBridge();
  const packetRows = [
    { packet_key: 'packet-key-a', feature_id: 'not-the-label' },
    { packet_key: 'packet-key-b', feature_id: 'database_orm' },
    { packet_key: 'unrelated', feature_id: 'database_orm' },
  ];
  const lookup = buildXgboostTraceLabelPacketLookup(bridge, ['database_orm'], packetRows);
  assert.deepEqual(lookup.get('database_orm')?.map((packet) => packet.packet_key), ['packet-key-b', 'packet-key-a']);
  assert.throws(() => buildXgboostTraceLabelPacketLookup(bridge, ['missing'], packetRows), /UNMAPPED_TRACE_LABEL/);
  assert.throws(() => buildXgboostTraceLabelPacketLookup(bridge, ['database_orm'], [packetRows[0]]), /PACKET_KEY_NOT_FOUND/);
  assert.throws(() => buildXgboostTraceLabelPacketLookup(bridge, ['database_orm'], [packetRows[0], packetRows[0]]), /DUPLICATE_PACKET_ROW/);
});

test('rejects duplicate labels, duplicate packet keys, and checksum tampering', () => {
  assert.throws(() => validateXgboostTraceLabelBridge(makeBridge([
    { trace_label: 'x', packet_keys: ['a'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['review:1'] },
    { trace_label: 'x', packet_keys: ['b'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['review:2'] },
  ])), /XGBOOST_TRACE_LABEL_BRIDGE_DUPLICATE_LABEL/);
  assert.throws(() => validateXgboostTraceLabelBridge(makeBridge([
    { trace_label: 'x', packet_keys: ['a', 'a'], mapping_method: 'EXPLICIT_ALIAS', evidence_refs: ['review:1'] },
  ])), /XGBOOST_TRACE_LABEL_BRIDGE_DUPLICATE_PACKET_KEY/);
  const bridge = makeBridge();
  assert.throws(() => validateXgboostTraceLabelBridge({ ...bridge, entries: [] }), /XGBOOST_TRACE_LABEL_BRIDGE_CHECKSUM_MISMATCH/);
});
