import {
  packetToJsonTransport,
  packetToMsgpackTransport,
  packetToReferenceTransport,
  type CanonicalPacketTransportV1,
  type PacketTransportRevisionContext,
} from '$lib/server/atlas/transport/canonical-packet-transport.js';

export type ACPPacketTransportPreference = 'REFERENCE' | 'JSON' | 'MSGPACK';

export interface ACPPacketToolResultV1 {
  schema: 'atlas.acp-packet-tool-result.v1';
  toolId: string;
  requestId: string;
  success: boolean;
  packet?: CanonicalPacketTransportV1;
  error?: {
    code: string;
    message: string;
  };
  metrics?: {
    executionMs: number;
    grpcUsed?: boolean;
    quicUsed?: boolean;
  };
}

/**
 * Normalize a packet-bearing ACP/MCP result through the canonical transport
 * envelope. This adapter does not hydrate or mutate canonical packet state.
 */
export function buildACPPacketToolResult(args: {
  toolId: string;
  requestId: string;
  success: boolean;
  packet?: unknown;
  revisions?: PacketTransportRevisionContext;
  preference?: ACPPacketTransportPreference;
  errorCode?: string;
  errorMessage?: string;
  executionMs?: number;
  grpcUsed?: boolean;
  quicUsed?: boolean;
}): ACPPacketToolResultV1 {
  if (!args.success) {
    return {
      schema: 'atlas.acp-packet-tool-result.v1',
      toolId: args.toolId,
      requestId: args.requestId,
      success: false,
      error: {
        code: args.errorCode ?? 'ACP_PACKET_TOOL_ERROR',
        message: args.errorMessage ?? 'ACP packet tool failed',
      },
      metrics: {
        executionMs: args.executionMs ?? 0,
        grpcUsed: args.grpcUsed,
        quicUsed: args.quicUsed,
      },
    };
  }

  if (!args.packet || !args.revisions) {
    throw new Error('successful packet-bearing ACP result requires packet and revision context');
  }

  const revisions: PacketTransportRevisionContext = {
    ...args.revisions,
    requestId: args.requestId,
  };

  let packet: CanonicalPacketTransportV1;
  switch (args.preference ?? 'REFERENCE') {
    case 'JSON':
      packet = packetToJsonTransport(args.packet, revisions);
      break;
    case 'MSGPACK':
      packet = packetToMsgpackTransport(args.packet, revisions);
      break;
    case 'REFERENCE':
    default:
      packet = packetToReferenceTransport(args.packet, revisions);
      break;
  }

  return {
    schema: 'atlas.acp-packet-tool-result.v1',
    toolId: args.toolId,
    requestId: args.requestId,
    success: true,
    packet,
    metrics: {
      executionMs: args.executionMs ?? 0,
      grpcUsed: args.grpcUsed,
      quicUsed: args.quicUsed,
    },
  };
}
