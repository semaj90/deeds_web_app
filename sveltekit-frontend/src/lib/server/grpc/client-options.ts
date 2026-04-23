type GrpcChannelOptions = Record<string, string | number>;

export interface GrpcClientChannelOptionsParams {
  maxConnectionIdleMs?: number;
  maxConnectionAgeMs?: number;
  maxSendMessageLength?: number;
  maxReceiveMessageLength?: number;
  permitWithoutCalls?: 0 | 1;
  extra?: GrpcChannelOptions;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env?.[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_KEEPALIVE_TIME_MS = readPositiveIntEnv('GRPC_CLIENT_KEEPALIVE_TIME_MS', 55_000);
const DEFAULT_KEEPALIVE_TIMEOUT_MS = readPositiveIntEnv('GRPC_CLIENT_KEEPALIVE_TIMEOUT_MS', 10_000);

export function buildGrpcClientChannelOptions(
  params: GrpcClientChannelOptionsParams = {}
): GrpcChannelOptions {
  const options: GrpcChannelOptions = {
    // Avoid idle ping storms: only probe on active calls, and no more than once a minute.
    'grpc.keepalive_time_ms': DEFAULT_KEEPALIVE_TIME_MS,
    'grpc.keepalive_timeout_ms': DEFAULT_KEEPALIVE_TIMEOUT_MS,
    'grpc.keepalive_permit_without_calls': params.permitWithoutCalls ?? 0,
  };

  if (params.maxConnectionIdleMs !== undefined) {
    options['grpc.max_connection_idle_ms'] = params.maxConnectionIdleMs;
  }
  if (params.maxConnectionAgeMs !== undefined) {
    options['grpc.max_connection_age_ms'] = params.maxConnectionAgeMs;
  }
  if (params.maxSendMessageLength !== undefined) {
    options['grpc.max_send_message_length'] = params.maxSendMessageLength;
  }
  if (params.maxReceiveMessageLength !== undefined) {
    options['grpc.max_receive_message_length'] = params.maxReceiveMessageLength;
  }

  return {
    ...options,
    ...(params.extra ?? {}),
  };
}