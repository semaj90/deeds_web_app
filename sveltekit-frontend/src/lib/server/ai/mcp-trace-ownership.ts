/**
 * MCP Trace Ownership Handler
 *
 * Wires the complete trace chain:
 * prompt → tool → packet → proof → release
 *
 * Usage:
 *   const tracer = new McpTraceOwnership(agent, taskId, storyId);
 *   await tracer.beginTrace(traceId);
 *   await tracer.recordPrompt(promptHash);
 *   await tracer.recordToolCall(toolName);
 *   await tracer.recordPacket(packetKey);
 *   await tracer.recordProof(proofHash);
 *   await tracer.recordRelease(releaseHash);
 *   await tracer.closeTrace('CLOSED');
 */

import { db } from '$lib/server/db/client.js';
import { mcpTraceOwnership, agentMemoryRegistry } from '$lib/server/db/schema/agent-memory-registry.js';
import { eq } from 'drizzle-orm';

export class McpTraceOwnership {
  private agent: string;
  private taskId: string;
  private storyId: string;
  private traceId: string | null = null;
  private toolCalls: string[] = [];
  private packetKeys: string[] = [];
  private promptHash: string | null = null;
  private proofHash: string | null = null;
  private releaseHash: string | null = null;

  constructor(agent: string, taskId: string, storyId: string) {
    this.agent = agent;
    this.taskId = taskId;
    this.storyId = storyId;
  }

  async beginTrace(traceId: string): Promise<void> {
    this.traceId = traceId;

    // Create MCP trace ownership record
    await db.insert(mcpTraceOwnership).values({
      traceId,
      taskId: this.taskId,
      agent: this.agent,
      status: 'OPEN',
      metadata: {
        story_id: this.storyId,
        started_at: new Date().toISOString(),
      },
    });
  }

  async recordPrompt(promptHash: string): Promise<void> {
    this.promptHash = promptHash;

    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        promptHash,
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async recordToolCall(toolName: string): Promise<void> {
    this.toolCalls.push(toolName);

    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        toolCalls: this.toolCalls,
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async recordPacket(packetKey: string): Promise<void> {
    this.packetKeys.push(packetKey);

    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        packetKeys: this.packetKeys,
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async recordProof(proofHash: string): Promise<void> {
    this.proofHash = proofHash;

    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        proofHash,
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async recordRelease(releaseHash: string): Promise<void> {
    this.releaseHash = releaseHash;

    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        releaseHash,
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async closeTrace(status: 'OPEN' | 'CLOSED' | 'FAILED' = 'CLOSED'): Promise<void> {
    if (!this.traceId) throw new Error('Trace not begun');

    await db
      .update(mcpTraceOwnership)
      .set({
        status,
        closedAt: new Date(),
      })
      .where(eq(mcpTraceOwnership.traceId, this.traceId));
  }

  async claimPackets(
    packetKey: string,
    sourceRef: string,
    featureId: string,
    options?: {
      cacheNamespace?: string;
      retrievalStrategy?: string;
      gpuEligible?: boolean;
    }
  ): Promise<void> {
    // Create agent memory registry entry for this packet claim
    await db.insert(agentMemoryRegistry).values({
      taskId: this.taskId,
      storyId: this.storyId,
      agent: this.agent,
      traceId: this.traceId,
      packetKey,
      sourceRef,
      featureId,
      cacheNamespace: options?.cacheNamespace,
      retrievalStrategy: options?.retrievalStrategy,
      gpuEligible: options?.gpuEligible ?? false,
      status: 'CLAIMED',
      metadata: {
        tool_calls: this.toolCalls,
        proof_hash: this.proofHash,
      },
    });

    // Record the packet in the trace
    await this.recordPacket(packetKey);
  }

  async markVerifying(): Promise<void> {
    // Update agent registry to VERIFYING status
    const result = await db
      .select()
      .from(agentMemoryRegistry)
      .where(eq(agentMemoryRegistry.taskId, this.taskId))
      .limit(1);

    if (result.length > 0) {
      await db
        .update(agentMemoryRegistry)
        .set({ status: 'VERIFYING' })
        .where(eq(agentMemoryRegistry.taskId, this.taskId));
    }
  }

  async markPass(): Promise<void> {
    // Update agent registry to PASS status
    const result = await db
      .select()
      .from(agentMemoryRegistry)
      .where(eq(agentMemoryRegistry.taskId, this.taskId))
      .limit(1);

    if (result.length > 0) {
      await db
        .update(agentMemoryRegistry)
        .set({ status: 'PASS' })
        .where(eq(agentMemoryRegistry.taskId, this.taskId));
    }
  }

  async markFailed(reason: string): Promise<void> {
    // Update agent registry to FAILED status
    const result = await db
      .select()
      .from(agentMemoryRegistry)
      .where(eq(agentMemoryRegistry.taskId, this.taskId))
      .limit(1);

    if (result.length > 0) {
      await db
        .update(agentMemoryRegistry)
        .set({
          status: 'FAILED',
          metadata: { failure_reason: reason },
        })
        .where(eq(agentMemoryRegistry.taskId, this.taskId));
    }
  }
}
