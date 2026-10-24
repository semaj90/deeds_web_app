// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { MessagePackEnvelopeSchema } from './messagepack-transport-v1.js';
import {
  buildPacketReductionDescriptorV1,
  decodePacketDescriptorV1,
  encodePacketDescriptorV1,
  type DescriptorExpectationV1,
  type ReduceReceiptInputV1,
} from './omr-feature-reduction-descriptor-v1.js';

const schema = JSON.parse(readFileSync(path.resolve(process.cwd(), '../.okf/schemas/tensor-kv-rpc-packet-v1.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

const H = (c: string) => `sha256:${c.repeat(64)}`;
const PACKET = { packet_key: 'pk-0001', source_revision: H('1'), feature_id: 'server', source_ref: 'src/lib/server/a.ts' };
const SNAPSHOT = H('a');
const REDUCE_RECEIPT_DIGEST = H('c');
const RECEIPT: ReduceReceiptInputV1 = {
  status: 'DIAGNOSTIC_ONLY',
  reducerVersion: 'omr-duckdb-reduce-v1@1',
  inputDigest: SNAPSHOT,
  outputFile: '.tmp/atlas/omr-msgpack/reduce/feature-reduction-test.json',
  outputDigest: H('b'),
  workspace_revision: 'NOT_ADMITTED',
};
const BUILD = { packet: PACKET, receipt: RECEIPT, snapshotDigest: SNAPSHOT, reduceReceiptDigest: REDUCE_RECEIPT_DIGEST };
const DESCRIPTOR = buildPacketReductionDescriptorV1(BUILD);
const EXPECT: DescriptorExpectationV1 = {
  packet_key: PACKET.packet_key,
  artifact_digest: H('b'),
  snapshot_digest: SNAPSHOT,
  reduce_receipt_digest: REDUCE_RECEIPT_DIGEST,
  workspace_revision: null,
};

describe('tensor-kv-rpc packet descriptor (diagnostic) over MESSAGEPACK-TRANSPORT-V1', () => {
  it('conforms to the DRAFT tensor-kv-rpc schema', () => {
    expect(validate(DESCRIPTOR), JSON.stringify(validate.errors)).toBe(true);
    expect(DESCRIPTOR.canonical_authority).toBe(false);
    expect(DESCRIPTOR.status).toBe('DRAFT');
    expect(DESCRIPTOR.schema_id).toBe('atlas.okf.tensor-kv-rpc-packet');
  });

  it('rejects an extra top-level field because the schema is closed', () => {
    expect(validate({ ...DESCRIPTOR, reducer_version: 'x' })).toBe(false);
  });

  it('encodes into the existing strict envelope and round-trips exactly', () => {
    const env = encodePacketDescriptorV1(DESCRIPTOR);
    expect(MessagePackEnvelopeSchema.safeParse(env).success).toBe(true);
    expect(env.canonicalAuthority).toBe(false);
    expect(decodePacketDescriptorV1(env, EXPECT)).toEqual(DESCRIPTOR);
  });

  it('refuses a tampered payload', () => {
    const env = encodePacketDescriptorV1(DESCRIPTOR);
    expect(() => decodePacketDescriptorV1({ ...env, payloadBytes: new Uint8Array(env.payloadBytes).fill(0) }, EXPECT)).toThrow();
  });

  it('refuses a packet identity mismatch', () => {
    const env = encodePacketDescriptorV1(DESCRIPTOR);
    expect(() => decodePacketDescriptorV1(env, { ...EXPECT, packet_key: 'pk-9999' })).toThrow('PACKET_IDENTITY_MISMATCH');
  });

  it('refuses artifact, snapshot and receipt digest mismatches', () => {
    const env = encodePacketDescriptorV1(DESCRIPTOR);
    expect(() => decodePacketDescriptorV1(env, { ...EXPECT, artifact_digest: H('d') })).toThrow('ARTIFACT_DIGEST_MISMATCH');
    expect(() => decodePacketDescriptorV1(env, { ...EXPECT, snapshot_digest: H('e') })).toThrow('SNAPSHOT_DIGEST_MISMATCH');
    expect(() => decodePacketDescriptorV1(env, { ...EXPECT, reduce_receipt_digest: H('f') })).toThrow('RECEIPT_DIGEST_MISMATCH');
  });

  it('cross-revision: a caller expecting an admitted workspace revision rejects the NOT_ADMITTED descriptor', () => {
    const env = encodePacketDescriptorV1(DESCRIPTOR);
    expect(() => decodePacketDescriptorV1(env, { ...EXPECT, workspace_revision: H('9') })).toThrow('WORKSPACE_REVISION_MISMATCH');
  });

  it('refuses construction rather than fabricating a missing or non-digest source revision', () => {
    expect(() => buildPacketReductionDescriptorV1({ ...BUILD, packet: { ...PACKET, source_revision: '' } })).toThrow('SOURCE_REVISION_NOT_DIGEST');
    expect(() => buildPacketReductionDescriptorV1({ ...BUILD, packet: { ...PACKET, packet_key: '' } })).toThrow('PACKET_KEY_MISSING');
  });

  it('refuses a non-diagnostic receipt, an admitted-looking receipt, or a snapshot that does not bind', () => {
    expect(() => buildPacketReductionDescriptorV1({ ...BUILD, receipt: { ...RECEIPT, status: 'ADMITTED' } })).toThrow('RECEIPT_NOT_DIAGNOSTIC_ONLY');
    expect(() => buildPacketReductionDescriptorV1({ ...BUILD, receipt: { ...RECEIPT, workspace_revision: H('9') } })).toThrow('RECEIPT_REVISION_NOT_ADMITTED_MARKER_MISSING');
    expect(() => buildPacketReductionDescriptorV1({ ...BUILD, snapshotDigest: H('7') })).toThrow('SNAPSHOT_BINDING_MISMATCH');
  });

  it('carries references and digests only: no tensors, relations or numeric arrays inline', () => {
    expect(DESCRIPTOR.tensors).toEqual([]);
    expect(DESCRIPTOR.relations).toEqual([]);
    for (const e of DESCRIPTOR.entries) expect(Array.isArray(e.value)).toBe(false);
  });
});
