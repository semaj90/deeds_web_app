import { createHash } from 'node:crypto';
import { encodeMessagePackPayload, decodeMessagePackPayload, type MessagePackEnvelope } from './messagepack-transport-v1.js';

/**
 * OMR-MSGPACK-RPC-PACKET-01 Phase D: diagnostic descriptor for ONE qualified canonical packet.
 *
 * Shape follows the DRAFT schema `.okf/schemas/tensor-kv-rpc-packet-v1.schema.json` (schema_id
 * `atlas.okf.tensor-kv-rpc-packet`, status DRAFT, canonical_authority false). The transport is the existing
 * `messagepack-transport-v1.ts` owner. The descriptor holds references and digests only: no vectors, tensors or
 * source bytes. A decoded descriptor is a transport fact, never admission or synthesis permission.
 *
 * Refuses construction when a required field lacks trustworthy input evidence (no fabricated values).
 */

export const TENSOR_KV_RPC_SCHEMA_ID = 'atlas.okf.tensor-kv-rpc-packet';
export const DIAGNOSTIC_RPC_METHOD = 'atlas.feature_reduction.describe';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const sha256Text = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

export interface QualifiedPacketInputV1 {
  packet_key: string;
  source_revision: string;
  feature_id: string;
  source_ref: string;
}

export interface ReduceReceiptInputV1 {
  status: string;
  reducerVersion: string;
  inputDigest: string;
  outputFile: string;
  outputDigest: string;
  workspace_revision: string;
}

export interface KeyValueEntryV1 {
  key: string;
  value_type: 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'digest' | 'ref';
  value: string | number | boolean | null;
}

// A type alias (not an interface) so it satisfies the transport's Record<string, unknown> constraint.
export type TensorKvRpcDescriptorV1 = {
  version: 1;
  schema_id: typeof TENSOR_KV_RPC_SCHEMA_ID;
  status: 'DRAFT';
  canonical_authority: false;
  kind: 'KV_TENSOR_PACKET';
  packet_key: string;
  source_revision: string;
  workspace_revision: null;
  entries: KeyValueEntryV1[];
  tensors: [];
  relations: [];
  rpc: { method: string; request_id: string; payload_digest: string; max_bytes: number };
};

export interface DescriptorExpectationV1 {
  packet_key: string;
  artifact_digest: string;
  snapshot_digest: string;
  reduce_receipt_digest: string;
  workspace_revision: string | null;
}

/** Build the descriptor for one qualified packet. Refuses anything not diagnostic or not revision-qualified. */
export function buildPacketReductionDescriptorV1(args: {
  packet: QualifiedPacketInputV1;
  receipt: ReduceReceiptInputV1;
  snapshotDigest: string;
  reduceReceiptDigest: string;
  maxBytes?: number;
}): TensorKvRpcDescriptorV1 {
  const { packet, receipt } = args;
  if (!packet.packet_key) throw new Error('PACKET_KEY_MISSING');
  if (!DIGEST.test(packet.source_revision)) throw new Error('SOURCE_REVISION_NOT_DIGEST');
  if (receipt.status !== 'DIAGNOSTIC_ONLY') throw new Error('RECEIPT_NOT_DIAGNOSTIC_ONLY');
  if (receipt.workspace_revision !== 'NOT_ADMITTED') throw new Error('RECEIPT_REVISION_NOT_ADMITTED_MARKER_MISSING');
  if (!DIGEST.test(receipt.outputDigest) || !DIGEST.test(receipt.inputDigest)) throw new Error('RECEIPT_DIGEST_MALFORMED');
  if (!DIGEST.test(args.snapshotDigest) || !DIGEST.test(args.reduceReceiptDigest)) throw new Error('BINDING_DIGEST_MALFORMED');
  if (receipt.inputDigest !== args.snapshotDigest) throw new Error('SNAPSHOT_BINDING_MISMATCH');

  const entries: KeyValueEntryV1[] = [
    { key: 'packet.feature_id', value_type: 'string', value: packet.feature_id },
    { key: 'packet.source_ref', value_type: 'string', value: packet.source_ref },
    { key: 'packet.source_revision', value_type: 'digest', value: packet.source_revision },
    { key: 'snapshot.digest', value_type: 'digest', value: args.snapshotDigest },
    { key: 'reduce.receipt_digest', value_type: 'digest', value: args.reduceReceiptDigest },
    { key: 'reduce.artifact_digest', value_type: 'digest', value: receipt.outputDigest },
    { key: 'reduce.artifact_ref', value_type: 'ref', value: receipt.outputFile },
    { key: 'reduce.version', value_type: 'string', value: receipt.reducerVersion },
  ];
  // The request id is derived from the packet and artifact digest, never invented.
  const payloadDigest = sha256Text(JSON.stringify(entries));
  const requestId = sha256Text(`${packet.packet_key}|${receipt.outputDigest}|${payloadDigest}`);

  return {
    version: 1,
    schema_id: TENSOR_KV_RPC_SCHEMA_ID,
    status: 'DRAFT',
    canonical_authority: false,
    kind: 'KV_TENSOR_PACKET',
    packet_key: packet.packet_key,
    source_revision: packet.source_revision,
    workspace_revision: null,
    entries,
    tensors: [],
    relations: [],
    rpc: { method: DIAGNOSTIC_RPC_METHOD, request_id: requestId, payload_digest: payloadDigest, max_bytes: args.maxBytes ?? 65536 },
  };
}

export function encodePacketDescriptorV1(descriptor: TensorKvRpcDescriptorV1): MessagePackEnvelope {
  return encodeMessagePackPayload(descriptor);
}

/** Decode and verify: envelope checksum, packet identity, artifact and snapshot digests, revision scope, payload digest. */
export function decodePacketDescriptorV1(envelope: MessagePackEnvelope, expected: DescriptorExpectationV1): TensorKvRpcDescriptorV1 {
  const { data, verified } = decodeMessagePackPayload<TensorKvRpcDescriptorV1>(envelope);
  if (!verified) throw new Error('ENVELOPE_CHECKSUM_MISMATCH');
  if (data.schema_id !== TENSOR_KV_RPC_SCHEMA_ID || data.version !== 1) throw new Error('DESCRIPTOR_VERSION_UNSUPPORTED');
  if (data.packet_key !== expected.packet_key) throw new Error('PACKET_IDENTITY_MISMATCH');
  if (data.workspace_revision !== expected.workspace_revision) throw new Error('WORKSPACE_REVISION_MISMATCH');
  const entry = (key: string) => data.entries.find((e) => e.key === key)?.value;
  if (entry('reduce.artifact_digest') !== expected.artifact_digest) throw new Error('ARTIFACT_DIGEST_MISMATCH');
  if (entry('snapshot.digest') !== expected.snapshot_digest) throw new Error('SNAPSHOT_DIGEST_MISMATCH');
  if (entry('reduce.receipt_digest') !== expected.reduce_receipt_digest) throw new Error('RECEIPT_DIGEST_MISMATCH');
  if (sha256Text(JSON.stringify(data.entries)) !== data.rpc.payload_digest) throw new Error('PAYLOAD_DIGEST_MISMATCH');
  return data;
}
