import test from 'node:test';
import assert from 'node:assert/strict';

import {
  remoteTrainingExecutorSchema,
  cdcCalibrationSnapshotSchema,
  routerWeightedSaliencySchema,
  remoteQloraTrainingPlanSchema,
  adapterMergePlanSchema,
} from '../dist/core/remote-adapter-lifecycle.js';

const sha = 'a'.repeat(64);

test('hosted Colab is artifact-job only and never Atlas persistent ZMQ authority', () => {
  assert.throws(() => remoteTrainingExecutorSchema.parse({
    executor: 'COLAB_HOSTED_NOTEBOOK',
    execution_mode: 'PERSISTENT_JUPYTER',
    host_initiated_zmq: true,
    artifact_exchange: 'MANUAL_NOTEBOOK_UPLOAD',
    credential_owner: 'TYPESCRIPT_HOST',
  }), /hosted Colab/);

  const executor = remoteTrainingExecutorSchema.parse({
    executor: 'COLAB_HOSTED_NOTEBOOK',
    execution_mode: 'ONE_SHOT_ARTIFACT_JOB',
    host_initiated_zmq: false,
    artifact_exchange: 'MANUAL_NOTEBOOK_UPLOAD',
    credential_owner: 'TYPESCRIPT_HOST',
  });
  assert.equal(executor.host_initiated_zmq, false);
});

test('CDC calibration cannot become training truth without verified claim receipts', () => {
  assert.throws(() => cdcCalibrationSnapshotSchema.parse({
    snapshot_revision: 'cdc-r1',
    source: 'KAFKA_DEBEZIUM_OUTBOX',
    outbox_schema_revision: 'outbox-r1',
    partition_ranges: [{ topic: 'atlas.cdc', partition: 0, start_offset_inclusive: '1', end_offset_inclusive: '2', event_count: 2 }],
    event_id_checksum: sha,
    event_count: 2,
    payload_policy: 'VERIFIED_EVIDENCE_EXAMPLES',
    raw_prompt_payload_exported: false,
    verified_claim_receipt_ids: [],
    source_snapshot_revision: 'source-r1',
    producer_revision: 'producer-r1',
  }), /verified claim receipts/);
});

test('REAP naming is reserved for true model-native MoE experts', () => {
  assert.throws(() => routerWeightedSaliencySchema.parse({
    observation_id: 'saliency:1',
    model_revision: 'model-r1',
    calibration_snapshot_revision: 'cdc-r1',
    unit_id: 'module:q_proj',
    unit_kind: 'ADAPTER_MODULE',
    method: 'REAP_EXPERT_SALIENCY',
    routing_source: 'ATLAS_POLICY_ROUTER',
    mean_router_weight: 0.5,
    mean_activation_l2: 2.0,
    sample_count: 16,
    saliency: 1.0,
    input_checksum: sha,
    output_checksum: sha,
    producer_revision: 'producer-r1',
  }), /actual model-native MoE experts/);
});

test('dense-hybrid QLoRA plan cannot invent expert paths', () => {
  assert.throws(() => remoteQloraTrainingPlanSchema.parse({
    plan_revision: 'plan-r1',
    base_model_id: 'ornith',
    base_model_revision: 'model-r1',
    base_model_architecture: 'DENSE_HYBRID',
    dataset_revision: 'dataset-r1',
    dataset_checksum: sha,
    evidence_snapshot_revision: 'evidence-r1',
    calibration_snapshot_revision: 'cdc-r1',
    executor: {
      executor: 'COLAB_ENTERPRISE',
      execution_mode: 'ONE_SHOT_ARTIFACT_JOB',
      host_initiated_zmq: false,
      artifact_exchange: 'CLOUD_STORAGE',
      credential_owner: 'TYPESCRIPT_HOST',
    },
    quantization: { method: 'NF4', load_in_4bit: true, compute_dtype: 'BF16', double_quantization: true },
    gradient_checkpointing: true,
    seed: 7,
    targets: [{ module_path: 'model.layers.1.experts.0.up_proj', target_kind: 'LINEAR_MODULE', lora_rank: 16, lora_alpha: 32, saliency_observation_ids: [], head_analysis_ids: [] }],
    maximum_train_steps: 50,
    maximum_gpu_memory_bytes: null,
    output_adapter_artifact_id: 'adapter:1',
    producer_revision: 'producer-r1',
  }), /synthetic MoE expert paths/);
});

test('adapter merge requires an unquantized canonical base reload', () => {
  const plan = adapterMergePlanSchema.parse({
    merge_revision: 'merge-r1',
    base_model_id: 'ornith',
    base_model_revision: 'model-r1',
    adapter_artifact_id: 'adapter:1',
    adapter_checksum: sha,
    method: 'PEFT_MERGE_AND_UNLOAD',
    reload_unquantized_base_for_merge: true,
    merge_dtype: 'BF16',
    quantized_base_merge_forbidden: true,
    validation_dataset_revision: 'validation-r1',
    output_model_artifact_id: 'model:merged-r1',
    producer_revision: 'producer-r1',
  });
  assert.equal(plan.reload_unquantized_base_for_merge, true);
  assert.equal(plan.quantized_base_merge_forbidden, true);
});
