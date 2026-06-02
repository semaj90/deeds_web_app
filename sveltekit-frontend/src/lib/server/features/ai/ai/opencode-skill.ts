import { InjectSummaryArgsSchema, type InjectSummaryArgs } from '../../../ai/source-ref-schema.js';
import { db } from '$lib/server/db/client.js';
import { engramCards } from '$lib/server/db/schema.js';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../../../env.server.js';
import {
  claimNextAgentPickupTask,
  getCachedTaskSemanticPacketRecord,
  traceTaskPacketLifecycle,
} from '$lib/server/tasks/semantic-packets.js';
import { writeTaskSemanticPacketSnapshot, buildTaskSemanticPacketTuple } from '$lib/server/tasks/task-semantic-packet-tuple.js';
import { traceSpan } from '$lib/server/observability/langfuse.js';

// Validates that deterministic source refs point to actual files in the repo
async function validateSourceRefsExist(sourceRefs: string[]) {
  const missing: string[] = [];
  const valid: string[] = [];

  for (const ref of sourceRefs) {
    // Expected format: local:src/file.ts#sha256:abcd...
    const match = ref.match(/^local:(.+)#sha256:[a-f0-9]+$/);
    if (!match) {
      missing.push(ref);
      continue;
    }

    // We assume the CWD is sveltekit-frontend or deeds-web-app.
    // Usually it runs inside sveltekit-frontend/
    const relPath = match[1];
    const fullPath = path.resolve(process.cwd(), relPath);

    if (fs.existsSync(fullPath)) {
      valid.push(ref);
    } else {
      // Sometimes it might run from parent directory
      const altPath = path.resolve(process.cwd(), 'sveltekit-frontend', relPath);
      if (fs.existsSync(altPath)) {
        valid.push(ref);
      } else {
        missing.push(ref);
      }
    }
  }

  return {
    ok: missing.length === 0,
    valid,
    missing,
  };
}

async function saveAtlasCard(args: InjectSummaryArgs) {
  const memoryId = `atlas_card_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const labels = [
    'atlas_card',
    'kind:atlas_card',
    `trust_tier:${args.trustTier}`,
    args.featureKey ? `feature_key:${args.featureKey}` : null,
  ].filter(Boolean) as string[];

  await db.insert(engramCards).values({
    memoryId,
    scope: 'codebase',
    summary: args.summary,
    labels,
    sourceRefs: args.sourceRefs,
    ttlSeconds: 86400 * 365, // 1 year
  });

  return { id: memoryId };
}

async function dispatchLocalDeepResearch(args: {
  featureKey?: string;
  sourceRefs: string[];
  reason: string;
}) {
  // Fire and forget deep research. Do NOT await the response body/completion.
  const query = `Expand upon references: ${args.sourceRefs.join(', ')}. Context: ${args.reason}`;

  // Try LangGraph Synthesis first (port 8091)
  fetch(`${ENV.LANGGRAPH_URL}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Fallback to LDR MCP if LangGraph is unavailable
    fetch(`${ENV.LDR_BASE_URL}/api/research/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_iterations: 2 }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // Silent failure for background research fallback
    });
  });
}

export function adjustTrustTier(trustTier: number, action: 'promotion' | 'demotion') {
  const delta = action === 'promotion' ? 1 : -1;
  return Math.max(-1, Math.min(2, trustTier + delta));
}

export async function pickNextSemanticTaskPacket(
  options: { lane?: string; enqueueIfMissing?: boolean } = {}
) {
  const lane = options.lane ?? 'semantic_packet';
  return traceSpan('pick-next-semantic-task-packet', { lane, enqueueIfMissing: options.enqueueIfMissing ?? true }, async () => {
    const bundle = await claimNextAgentPickupTask(lane);

    if (!bundle) {
      await traceTaskPacketLifecycle(0, 'pickup:none', { lane });
      return null;
    }

    const semanticPacketTuple = buildTaskSemanticPacketTuple(bundle);
    const snapshot = await writeTaskSemanticPacketSnapshot(bundle);
    const cachedPacket = await getCachedTaskSemanticPacketRecord(bundle.taskId);

    await traceTaskPacketLifecycle(bundle.taskId, 'pickup:selected', {
      queueId: bundle.queueId,
      packetId: bundle.packetId,
      featureId: bundle.featureId,
      clusterId: bundle.clusterId,
    });

    return {
      queueId: bundle.queueId,
      taskId: bundle.taskId,
      packetId: bundle.packetId,
      workspaceId: bundle.workspaceId,
      featureId: bundle.featureId,
      summary: bundle.summary,
      nextAction: bundle.nextAction,
      confidence: bundle.confidence,
      status: bundle.status,
      relatedFeatureIds: bundle.relatedFeatureIds,
      relatedTaskIds: bundle.relatedTaskIds,
      relatedFilePaths: bundle.relatedFilePaths,
      clusterId: bundle.clusterId,
      centroidId: bundle.centroidId,
      semanticPacketTuple,
      semanticPacketSnapshotPath: snapshot.jsonPath,
      cachedTaskSemanticPacket: cachedPacket,
    };
  });
}

export async function injectSummary(rawArgs: unknown) {
  const args = InjectSummaryArgsSchema.parse(rawArgs);

  const existingRefs = await validateSourceRefsExist(args.sourceRefs);

  if (!existingRefs.ok) {
    return {
      ok: false,
      error: 'Invalid sourceRefs',
      missing: existingRefs.missing,
      furtherResearchRequired: true
    };
  }

  const card = await saveAtlasCard(args);

  if (args.furtherResearch) {
    await dispatchLocalDeepResearch({
      featureKey: args.featureKey,
      sourceRefs: args.sourceRefs,
      reason: 'User requested further research'
    });
  }

  return {
    ok: true,
    cardId: card.id,
    kind: 'atlas_card',
    trustTier: args.trustTier,
    featureKey: args.featureKey,
    sourceRefs: args.sourceRefs,
    furtherResearchQueued: args.furtherResearch
  };
}
