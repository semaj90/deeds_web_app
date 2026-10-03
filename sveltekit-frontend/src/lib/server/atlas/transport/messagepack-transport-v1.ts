import { createHash } from 'node:crypto';
import { encode, decode } from '@msgpack/msgpack';
import { z } from 'zod';

/**
 * MESSAGEPACK-TRANSPORT-V1
 * 
 * Compact runtime cache and transport encoding for BitFrost/IPC.
 * Strictly adheres to the rule:
 * - Checksum is computed over canonical logical JSON, NOT transport MessagePack bytes.
 * - canonicalAuthority is always false.
 */

export const MessagePackEnvelopeSchema = z
  .object({
    schema: z.literal('atlas.messagepack-transport.v1'),
    canonicalJsonChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    payloadBytes: z.instanceof(Uint8Array),
    byteLength: z.number().int().min(0),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type MessagePackEnvelope = z.infer<typeof MessagePackEnvelopeSchema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function encodeMessagePackPayload<T extends Record<string, unknown>>(
  canonicalObject: T,
): MessagePackEnvelope {
  // 1. Compute checksum over canonical JSON representation
  const canonicalJson = JSON.stringify(canonicalObject);
  const canonicalJsonChecksum = sha256(canonicalJson);

  // 2. Encode to MessagePack binary
  const payloadBytes = encode(canonicalObject);

  return {
    schema: 'atlas.messagepack-transport.v1',
    canonicalJsonChecksum,
    payloadBytes,
    byteLength: payloadBytes.byteLength,
    canonicalAuthority: false,
  };
}

export function decodeMessagePackPayload<T = unknown>(
  envelope: MessagePackEnvelope,
): { data: T; verified: boolean } {
  MessagePackEnvelopeSchema.parse(envelope);
  const decoded = decode(envelope.payloadBytes) as T;
  const canonicalJson = JSON.stringify(decoded);
  const reconstructedChecksum = sha256(canonicalJson);

  return {
    data: decoded,
    verified: reconstructedChecksum === envelope.canonicalJsonChecksum,
  };
}
