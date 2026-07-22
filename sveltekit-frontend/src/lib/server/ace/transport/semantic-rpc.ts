import { z } from 'zod';
import { v4 as uuidv4 } from 'crypto';

export const SemanticRpcMessageSchema = z.object({
  messageId: z.string().uuid(),
  runId: z.string().uuid(),

  method: z.string().min(1),
  destination: z.string().min(1),

  payload: z.record(z.unknown()),

  contractVersion: z.string().min(1),
  idempotencyKey: z.string().min(1),

  createdAt: z.string().datetime(),
  deadline: z.string().datetime().nullable()
}).strict();

export type SemanticRpcMessage = z.infer<typeof SemanticRpcMessageSchema>;

export interface SemanticRpcResponse {
  messageId: string;
  status: 'success' | 'failure' | 'timeout';
  result?: unknown;
  error?: string;
  respondedAt: string;
}

export class SemanticRpcEnvelope {
  static create(
    method: string,
    destination: string,
    payload: Record<string, unknown>,
    runId: string,
    contractVersion: string = '1.0'
  ): SemanticRpcMessage {
    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 60 * 1000); // 30 minute deadline

    return {
      messageId: uuidv4().toString(),
      runId,
      method,
      destination,
      payload,
      contractVersion,
      idempotencyKey: `${method}-${destination}-${Date.now()}`,
      createdAt: now.toISOString(),
      deadline: deadline.toISOString()
    };
  }

  static validate(message: unknown): message is SemanticRpcMessage {
    try {
      SemanticRpcMessageSchema.parse(message);
      return true;
    } catch {
      return false;
    }
  }

  static isExpired(message: SemanticRpcMessage): boolean {
    if (!message.deadline) {
      return false;
    }
    return new Date() > new Date(message.deadline);
  }
}
