export type SerializationKind = 'JSON' | 'MSGPACK' | 'PROTOBUF' | 'ARROW_IPC' | 'RAW_BINARY' | 'BASE64' | 'HEX';

export interface SerializationDecision {
  kind: SerializationKind;
  allowed: boolean;
  reason: string;
}

export function chooseSerialization(input: {
  purpose: 'control' | 'typed_rpc' | 'bulk_numeric' | 'debug';
  bytes?: number;
  requiresHumanReadable?: boolean;
}): SerializationDecision {
  if (input.purpose === 'bulk_numeric') return { kind: 'ARROW_IPC', allowed: true, reason: 'bulk numeric artifacts use Arrow IPC' };
  if (input.purpose === 'typed_rpc') return { kind: 'PROTOBUF', allowed: true, reason: 'optional typed process boundary' };
  if (input.purpose === 'debug') return { kind: input.requiresHumanReadable ? 'HEX' : 'BASE64', allowed: true, reason: 'debug/text boundary only' };
  return { kind: 'JSON', allowed: true, reason: 'small control plane message' };
}

export function assertNoTextTensorEncoding(kind: SerializationKind, bytes: number): void {
  if ((kind === 'BASE64' || kind === 'HEX') && bytes > 64 * 1024) {
    throw new Error('large tensors must not use base64/hex');
  }
}
