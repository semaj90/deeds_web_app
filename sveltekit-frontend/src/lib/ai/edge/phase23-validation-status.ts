/** Phase 23 proof ledger. A scaffold is not runtime evidence. */
export type GateVerdict = 'PASS' | 'FAIL' | 'NOT_PROVEN';
export interface EdgeValidationGate {
  id: string;
  description: string;
  status: GateVerdict;
  missing: string[];
  proofRefs: string[];
}
export const PHASE23_EDGE_GATES: readonly EdgeValidationGate[] = [
  { id: 'EDGE-ASSET-01', description: 'Pinned model hash/license/tokenizer', status: 'NOT_PROVEN', missing: ['Exact release revision', 'SHA256', 'license review'], proofRefs: [] },
  { id: 'EDGE-ASSET-02', description: 'Downloaded asset GGUF/ONNX/LiteRT integrity', status: 'NOT_PROVEN', missing: ['Local bytes and verified digest', 'Format decode'], proofRefs: [] },
  { id: 'EDGE-03', description: 'Real browser LiteRT-LM loading', status: 'NOT_PROVEN', missing: ['Pinned browser package', 'compatible asset', 'generated tokens'], proofRefs: [] },
  { id: 'EDGE-04', description: 'Tokenizer and model result parity', status: 'NOT_PROVEN', missing: ['Frozen prompts', 'reference outputs', 'comparison thresholds'], proofRefs: [] },
  { id: 'EDGE-05', description: 'Cancel, dispose and isolation', status: 'NOT_PROVEN', missing: ['Browser unload', 'abort race proof', 'device-lost recovery'], proofRefs: [] },
  { id: 'EDGE-CACHE-01', description: 'Versioned IndexedDB', status: 'NOT_PROVEN', missing: ['Schema/revision key', 'quotas', 'data deletion'], proofRefs: [] },
  { id: 'EDGE-EVAL-01', description: 'SLM summarization and extraction Eval Gym', status: 'NOT_PROVEN', missing: ['Frozen tasks and labels', 'citation fidelity', 'contradiction scoring'], proofRefs: [] },
  { id: 'EDGE-EMB2-01', description: 'EmbeddingGemma 2 compatibility and retrieval', status: 'NOT_PROVEN', missing: ['Embedding space', 'isolated index', 'Recall/MRR benchmarks'], proofRefs: [] },
  { id: 'EDGE-MTP-01', description: 'Browser speculative decoding', status: 'NOT_PROVEN', missing: ['Trained draft weights', 'runtime support', 'acceptance/throughput parity'], proofRefs: [] },
  { id: 'EDGE-AGENT-01', description: 'ACP/A2A authorized repair', status: 'NOT_PROVEN', missing: ['TaskCard join owner', 'capabilities', 'approval/readback'], proofRefs: [] },
  { id: 'EDGE-SERVER-01', description: 'Ornith :8090 unchanged and healthy', status: 'NOT_PROVEN', missing: ['Live /props and /health readback'], proofRefs: [] },
];
export function summarizeEdgeGates(gates: readonly EdgeValidationGate[] = PHASE23_EDGE_GATES) {
  const ids = new Set<string>();
  for (const gate of gates) {
    if (ids.has(gate.id)) throw new Error('duplicate gate: ' + gate.id);
    ids.add(gate.id);
    if (gate.status === 'PASS' && (!gate.proofRefs.length || gate.missing.length)) throw new Error('unsupported PASS: ' + gate.id);
  }
  return {
    total: gates.length, pass: gates.filter(g => g.status === 'PASS').length,
    fail: gates.filter(g => g.status === 'FAIL').length,
    notProven: gates.filter(g => g.status === 'NOT_PROVEN').length,
    missing: gates.flatMap(g => g.status === 'PASS' ? [] : g.missing.map(item => ({ gate: g.id, item }))),
  };
}
// TODO: Bridge to existing OpenSpec evidence receipts, not another persisted receipt owner.
