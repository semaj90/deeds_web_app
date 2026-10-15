import { z } from 'zod';

const id = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/i);
const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

const registry = z.object({
  packetKey: z.string().regex(/^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  titleId: id,
  title: id,
  packetClass: id.nullable(),
  lutEncodingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i).nullable(),
  lutCode: z.number().int().min(0).max(255).nullable(),
}).strict().superRefine((value, ctx) => {
  const lutFields = [value.packetClass, value.lutEncodingRevision, value.lutCode];
  const allPresent = lutFields.every((field) => field !== null);
  const allAbsent = lutFields.every((field) => field === null);
  if (!allPresent && !allAbsent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lutEncodingRevision'], message: 'RPC_PACKET_LUT_FIELDS_MUST_BE_ALL_PRESENT_OR_NULL' });
  }
});

const lineage = z.object({
  sourceRef: id,
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict();

const requestBase = {
  schema: z.literal('atlas.rpc.packet.v1'),
  registry,
  lineage,
  callerId: id,
  rpcCallId: uuidV7,
  executionId: uuidV7,
  idempotencyKey: id,
  requestDigest: digest,
};

const readRequest = z.object({ ...requestBase, operation: z.literal('GET') }).strict();

const searchRequest = z.object({
  ...requestBase,
  operation: z.literal('SEARCH'),
  search: z.object({ query: z.string().trim().min(1).max(2048), limit: z.number().int().positive().max(100) }).strict(),
}).strict();

const createRequest = z.object({
  ...requestBase,
  operation: z.literal('CREATE'),
  mutation: z.object({
    eventId: uuidV7,
    contentArtifactRef: id,
    contentDigest: digest,
    schemaRef: id,
    schemaRevision: id,
  }).strict(),
}).strict();

const patchRequest = z.object({
  ...requestBase,
  operation: z.literal('PATCH'),
  expectedRevisionId: uuidV7,
  mutation: z.object({
    eventId: uuidV7,
    patchArtifactRef: id,
    patchDigest: digest,
    schemaRef: id,
    schemaRevision: id,
  }).strict(),
}).strict();

const transitionRequest = z.object({
  ...requestBase,
  operation: z.literal('TRANSITION'),
  expectedRevisionId: uuidV7,
  mutation: z.object({
    eventId: uuidV7,
    fromState: id,
    toState: id,
    reasonCode: id,
  }).strict(),
}).strict();

const analyzeRequest = z.object({
  ...requestBase,
  operation: z.literal('ANALYZE'),
  analysis: z.object({
    algorithm: z.enum(['PCA_LOW_RANK', 'SVD', 'GRAPH_TENSOR_METRICS', 'XGBOOST_RANKER']),
    inputArtifactRef: id,
    inputManifestChecksum: digest,
    parametersChecksum: digest,
    writePolicy: z.literal('PROPOSAL_ONLY'),
  }).strict(),
}).strict();

export const AtlasCustomRpcPacketV1Schema = z.discriminatedUnion('operation', [
  readRequest,
  searchRequest,
  createRequest,
  patchRequest,
  transitionRequest,
  analyzeRequest,
]);

export type AtlasCustomRpcPacketV1 = z.infer<typeof AtlasCustomRpcPacketV1Schema>;
export type AtlasCustomRpcOperationV1 = AtlasCustomRpcPacketV1['operation'];
