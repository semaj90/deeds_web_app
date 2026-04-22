export {
  AceContextEnvelopeSchema,
  CacheHitMetadataSchema,
  JsonValueSchema,
  OllamaMessageSchema,
  PersistedPayloadEnvelopeSchema,
  PROTOCOL_SCHEMA_VERSION,
  ProtocolBoundarySchema,
  ResearchChunkSchema,
  SessionEdgePayloadSchema,
  ToolCallResponseSchema,
  coercePersistedPayloadEnvelope,
  createPersistedPayloadEnvelope,
  jsonValueFromUnknown,
} from '../../types/protocol.js';

export type {
  AceContextEnvelope,
  CacheHitMetadata,
  JsonRecord,
  JsonValue,
  OllamaMessage,
  PersistedPayloadEnvelope,
  ProtocolBoundary,
  ResearchChunk,
  SessionEdgePayload,
  ToolCallResponse,
} from '../../types/protocol.js';

export { PersistedPayloadEnvelopeSchema as PersistedEnvelopeSchema } from '../../types/protocol.js';

import type { JsonValue, PersistedPayloadEnvelope } from '../../types/protocol.js';

export type PersistedEnvelope<T extends JsonValue = JsonValue> = Omit<
  PersistedPayloadEnvelope,
  'payload'
> & {
  payload?: T;
};