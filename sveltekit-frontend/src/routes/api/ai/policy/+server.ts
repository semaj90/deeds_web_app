import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { policyRerankerMetadata } from '$lib/server/db/schema-postgres.js';
import { loadTorchModel, runPolicyInference } from '$lib/server/policy/inference.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { features, somEmbedding } = body;

    if (!features || !somEmbedding) {
      return json({ error: 'Missing features or somEmbedding' }, { status: 400 });
    }

    // Fetch active policy model metadata
    const metadata = await db
      .select()
      .from(policyRerankerMetadata)
      .where(eq(policyRerankerMetadata.isDefault, true))
      .limit(1);

    if (!metadata.length) {
      return json({ error: 'No active policy model found' }, { status: 500 });
    }

    const model = metadata[0];
    const startTime = Date.now();

    // Load model and run inference
    const torchModel = await loadTorchModel(model.metadata.torchscriptExportPath);
    const { logits, selectedAction, confidence } = await runPolicyInference(
      torchModel,
      features,
      somEmbedding,
      model.metadata.actionSpace.actions
    );

    const inferenceTime = Date.now() - startTime;

    // Update inference stats
    const currentStats = model.inferenceStats as any;
    currentStats.totalCalls = (currentStats.totalCalls ?? 0) + 1;
    currentStats.successfulCalls = (currentStats.successfulCalls ?? 0) + 1;
    currentStats.averageLatencyMs =
      ((currentStats.averageLatencyMs ?? 0) * (currentStats.successfulCalls - 1) + inferenceTime) /
      currentStats.successfulCalls;
    currentStats.p95LatencyMs = Math.max(currentStats.p95LatencyMs ?? 0, inferenceTime * 0.95);
    currentStats.p99LatencyMs = Math.max(currentStats.p99LatencyMs ?? 0, inferenceTime * 0.99);
    currentStats.lastUsedAt = new Date().toISOString();

    await db
      .update(policyRerankerMetadata)
      .set({ inferenceStats: currentStats })
      .where(eq(policyRerankerMetadata.id, model.id));

    return json({
      action: selectedAction,
      confidence,
      logits,
      latencyMs: inferenceTime,
      modelVersion: model.modelVersion
    });
  } catch (error) {
    console.error('[Policy Inference] Error:', error);
    return json(
      {
        action: null,
        confidence: 0,
        logits: [],
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Inference failed'
      },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ models: [], total: 0 }, { status: 200 });
  }

  try {
    const models = await db.select().from(policyRerankerMetadata).orderBy(policyRerankerMetadata.trainedAt);

    return json({
      models: models.map((m) => ({
        id: m.id,
        version: m.modelVersion,
        isDefault: m.isDefault,
        status: m.status,
        trainedAt: m.trainedAt,
        accuracy: m.metadata.validationMetrics.accuracy,
        latencyMs: m.metadata.validationMetrics.inferenceLatencyMs,
        inferenceStats: m.inferenceStats
      })),
      total: models.length
    });
  } catch (error) {
    console.error('[Policy Models] Error:', error);
    return json({ models: [], total: 0 }, { status: 200 });
  }
};
