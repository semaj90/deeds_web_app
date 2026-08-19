#!/usr/bin/env node
/**
 * Parent Atlas learning feedback-loop readiness audit.
 *
 * Fail-closed by design: file presence proves only that a seam exists. A runtime
 * or training capability is PROVEN only when an explicit proof artifact/receipt
 * exists. This script intentionally does not use `|| true` fallthroughs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '../..');

const read = (p) => {
  const full = path.join(ROOT, p);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
};
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function gate(id, status, detail, refs = []) {
  return { id, status, pass: status === 'PROVEN' || status === 'PRESENT', detail, refs };
}

const gates = [];

const executionLoop = read('sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts');
gates.push(gate(
  'EXECUTION_RECEIPT_PRESENT',
  executionLoop?.includes('interface ExecutionReceipt') ? 'PRESENT' : 'MISSING',
  'Existing agentic error workflow exposes an ExecutionReceipt contract.',
  ['sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts'],
));

gates.push(gate(
  'EXECUTION_LEARNING_RECORD_CONTRACT',
  exists('sveltekit-frontend/schemas/atlas/learning/execution-learning-record.v1.okf') ? 'PRESENT' : 'MISSING',
  'Receipt-derived learning projection exists; runtime materializer still requires proof.',
  ['sveltekit-frontend/schemas/atlas/learning/execution-learning-record.v1.okf'],
));

gates.push(gate(
  'TRAIN_EVAL_SNAPSHOT_CONTRACT',
  exists('sveltekit-frontend/schemas/atlas/learning/training-dataset-snapshot.v1.okf') ? 'PRESENT' : 'MISSING',
  'Immutable partition manifest contract exists; receipt-derived snapshot writer remains to be proven.',
  ['sveltekit-frontend/schemas/atlas/learning/training-dataset-snapshot.v1.okf'],
));

const qloraTasks = read('openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md');
const trainableBaseBlocked = Boolean(qloraTasks?.includes('Confirm whether a non-quantized trainable checkpoint') && !qloraTasks?.includes('[x] Confirm whether a non-quantized trainable checkpoint'));
gates.push(gate(
  'ORNITH_TRAINABLE_BASE',
  trainableBaseBlocked ? 'BLOCKED' : 'UNKNOWN',
  'Served Ornith GGUF is inference provenance; QLoRA remains blocked until a compatible trainable checkpoint is proven.',
  ['openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md'],
));

gates.push(gate(
  'QLORA_DATA_EXPORT',
  exists('scripts/atlas/generate-qlora-data.mjs') ? 'PRESENT' : 'MISSING',
  'Legacy QLoRA data/export path exists, but positive-label eligibility must migrate to validated ExecutionLearningRecordV1.',
  ['scripts/atlas/generate-qlora-data.mjs'],
));

gates.push(gate(
  'ADAPTER_TRAINING_RECEIPT_CONTRACT',
  exists('sveltekit-frontend/schemas/atlas/learning/adapter-training-receipt.v1.okf') ? 'PRESENT' : 'MISSING',
  'Training receipt schema exists; no real Ornith adapter run is claimed.',
  ['sveltekit-frontend/schemas/atlas/learning/adapter-training-receipt.v1.okf'],
));

gates.push(gate(
  'ADAPTER_EVALUATION_RECEIPT_CONTRACT',
  exists('sveltekit-frontend/schemas/atlas/learning/adapter-evaluation-receipt.v1.okf') ? 'PRESENT' : 'MISSING',
  'Held-out baseline-vs-candidate evaluation contract exists; promotion remains unproven.',
  ['sveltekit-frontend/schemas/atlas/learning/adapter-evaluation-receipt.v1.okf'],
));

gates.push(gate(
  'GYM_REPLAY_ENV',
  exists('sveltekit-frontend/python/parent_atlas_policy/parent_atlas_gym_env.py') ? 'PRESENT' : 'MISSING',
  'Offline Gymnasium replay environment exists; TorchRL/PPO training execution remains shadow/unproven.',
  ['sveltekit-frontend/python/parent_atlas_policy/parent_atlas_gym_env.py'],
));

gates.push(gate(
  'FINITE_PPO_ACTION_REWARD_BOUNDARY',
  exists('sveltekit-frontend/python/parent_atlas_policy/ppo_policy_env.py') ? 'PRESENT' : 'MISSING',
  'Finite PPO action/reward boundary exists and remains experiment-only.',
  ['sveltekit-frontend/python/parent_atlas_policy/ppo_policy_env.py'],
));

gates.push(gate(
  'TANG_QAS_POLICY',
  exists('sveltekit-frontend/schemas/atlas/sampling/tang-lane-policy.v1.okf') ? 'PRESENT' : 'MISSING',
  'Tang-inspired lifecycle policy is present; it remains routing/proposal evidence only.',
  ['sveltekit-frontend/schemas/atlas/sampling/tang-lane-policy.v1.okf'],
));

gates.push(gate(
  'TENSOR_HEAD_MOE_SHADOW',
  exists('python/parent_atlas_tensor_head_moe_experiment.py') && exists('sveltekit-frontend/src/lib/server/atlas/runtime/tensor-head-router.ts') ? 'PRESENT' : 'MISSING',
  'Tensor-head routing and PyTorch MoE shadow experiment exist; learned head promotion is not claimed.',
  ['python/parent_atlas_tensor_head_moe_experiment.py', 'sveltekit-frontend/src/lib/server/atlas/runtime/tensor-head-router.ts'],
));

gates.push(gate(
  'MTP_DRAFTER_EXPERIMENT',
  exists('scripts/test-mtp-matrix.ps1') && exists('sveltekit-frontend/schemas/atlas/sampling/mtp-state-policy.v1.okf') ? 'PRESENT' : 'MISSING',
  'llama-server MTP test/policy seams exist; model-specific Ornith MTP compatibility remains a runtime proof.',
  ['scripts/test-mtp-matrix.ps1', 'sveltekit-frontend/schemas/atlas/sampling/mtp-state-policy.v1.okf'],
));

gates.push(gate(
  'KANBAN_AGENTIC_WORKFLOW',
  exists('sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts') && Boolean(executionLoop) ? 'PRESENT' : 'MISSING',
  'Kanban projection and agentic error workflow both exist; learning labels must come from receipts/validation, not board status.',
  ['sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts', 'sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts'],
));

gates.push(gate(
  'MCP_GRPC_TOOL_SURFACE',
  exists('sveltekit-frontend/src/lib/server/ai/mcp-tool-dispatch.ts') && exists('sveltekit-frontend/src/lib/server/grpc/tool-router-client.ts') ? 'PRESENT' : 'MISSING',
  'MCP dispatcher and gRPC tool router exist; offline RL/eval must replay results instead of issuing live mutations.',
  ['sveltekit-frontend/src/lib/server/ai/mcp-tool-dispatch.ts', 'sveltekit-frontend/src/lib/server/grpc/tool-router-client.ts'],
));

const kafkaDoc = read('docs/okf/parent-atlas/integrations/kafka-debezium.md');
gates.push(gate(
  'KAFKA_CDC_PROJECTION',
  kafkaDoc?.includes('status: NOT_PROVEN') ? 'BLOCKED' : kafkaDoc ? 'UNKNOWN' : 'MISSING',
  'Kafka/Debezium remains a later projection after Postgres/outbox; no canonical learning state depends on it.',
  ['docs/okf/parent-atlas/integrations/kafka-debezium.md'],
));

const oldP7 = read('scripts/atlas/audit-p7-qlora-ppo-export.mjs');
const containsFalseGreen = Boolean(oldP7?.includes('|| true') || oldP7?.includes('Assume OK if table queries passed'));
gates.push(gate(
  'LEGACY_P7_FAIL_CLOSED',
  containsFalseGreen ? 'BLOCKED' : oldP7 ? 'PRESENT' : 'MISSING',
  containsFalseGreen
    ? 'Legacy P7 audit contains fail-open readiness logic and MUST NOT be used as final learning-loop proof.'
    : 'Legacy P7 audit does not contain the known fail-open patterns.',
  ['scripts/atlas/audit-p7-qlora-ppo-export.mjs'],
));

// DeepSpeed is intentionally not required for readiness: it is a challenger to
// plain Transformers/PEFT when the measured memory envelope requires offload.
gates.push(gate(
  'DEEPSPEED_OPTIONAL_CHALLENGER',
  'BLOCKED',
  'No workstation DeepSpeed training receipt is present; benchmark plain PEFT first, then add ZeRO/CPU/NVMe offload only if needed.',
  ['openspec/changes/parent-atlas-learning-feedback-loop/tasks.md'],
));

const blocking = gates.filter((g) => g.status === 'BLOCKED' || g.status === 'MISSING');
const report = {
  schema: 'atlas.learning-feedback-readiness-audit.v1',
  status: blocking.length === 0 ? 'PROVEN' : 'NOT_PROVEN',
  generatedAt: new Date().toISOString(),
  gates,
  blockingGateIds: blocking.map((g) => g.id),
  note: 'PRESENT means a contract/seam exists; only explicit receipts/proofs may upgrade runtime/training capabilities to PROVEN.',
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PROVEN' ? 0 : 1);
