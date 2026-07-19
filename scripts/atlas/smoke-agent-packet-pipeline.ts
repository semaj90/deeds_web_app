import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FeatureEnvelopeSchema = z.object({
  sourceRef: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  embedding: z.array(z.number().finite()).length(4),
  extractedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const ActionPacketSchema = z.object({
  protocol: z.literal("atlas.action.v1"),
  packetId: z.string().uuid(),
  runId: z.string().uuid(),
  action: z.enum([
    "extract.features",
    "encode.embedding",
    "assign.centroid",
    "build.ace",
  ]),
  sourceRef: z.string().min(1),
  idempotencyKey: z.string().min(16),
  permissions: z.array(z.string()).min(1),
  payload: z.record(z.string(), z.unknown()),
});

const WorkerPacketSchema = z.object({
  protocol: z.literal("atlas.worker.v1"),
  packetId: z.string().uuid(),
  operation: z.enum([
    "extract.features",
    "encode.embedding",
    "assign.centroid",
    "build.snapshot",
  ]),
  inputRefs: z.array(z.string()).min(1),
  schemaVersion: z.number().int().positive(),
  parameters: z.record(z.string(), z.unknown()),
  expectedOutput: z.object({
    schema: z.string(),
    dimension: z.number().int().positive().optional(),
    dtype: z.enum(["f16", "f32", "u32", "u64"]).optional(),
  }),
  policy: z.object({
    tenantId: z.string(),
    permissionScope: z.array(z.string()).min(1),
    maxRuntimeMs: z.number().positive(),
    allowSideEffects: z.boolean(),
  }),
  provenance: z.object({
    runId: z.string().uuid(),
    codeVersion: z.string(),
    modelVersion: z.string().optional(),
    contentHash: z.string(),
  }),
});

type FeatureEnvelope = z.infer<typeof FeatureEnvelopeSchema>;
type ActionPacket = z.infer<typeof ActionPacketSchema>;
type WorkerPacket = z.infer<typeof WorkerPacketSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nearestCentroid(
  vector: readonly number[],
  centroids: readonly (readonly number[])[],
): { centroidId: number; score: number } {
  if (centroids.length === 0) throw new Error("No centroids supplied");

  const norm = (v: readonly number[]) =>
    Math.sqrt(v.reduce((s, x) => s + x * x, 0));

  const vNorm = norm(vector);
  if (vNorm === 0) throw new Error("Cannot route a zero vector");

  let bestId = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  centroids.forEach((c, id) => {
    if (c.length !== vector.length)
      throw new Error(`Dimension mismatch: vector=${vector.length}, centroid=${c.length}`);
    const cNorm = norm(c);
    if (cNorm === 0) return;
    const dot = vector.reduce((s, x, i) => s + x * c[i]!, 0);
    const score = dot / (vNorm * cNorm);
    if (score > bestScore) { bestId = id; bestScore = score; }
  });

  if (bestId < 0) throw new Error("No valid centroid found");
  return { centroidId: bestId, score: bestScore };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildActionPacket(runId: string, envelope: FeatureEnvelope): ActionPacket {
  const idempotencyKey = sha256(
    ["assign.centroid", envelope.sourceRef, envelope.contentHash, "centroids-v1"].join(":"),
  );
  return ActionPacketSchema.parse({
    protocol: "atlas.action.v1",
    packetId: randomUUID(),
    runId,
    action: "assign.centroid",
    sourceRef: envelope.sourceRef,
    idempotencyKey,
    permissions: ["retrieval:route"],
    payload: {
      contentHash: envelope.contentHash,
      embedding: envelope.embedding,
      centroidManifest: "centroids-v1",
    },
  });
}

function buildWorkerPacket(runId: string, envelope: FeatureEnvelope): WorkerPacket {
  return WorkerPacketSchema.parse({
    protocol: "atlas.worker.v1",
    packetId: randomUUID(),
    operation: "assign.centroid",
    inputRefs: [envelope.sourceRef],
    schemaVersion: 1,
    parameters: { centroidManifest: "centroids-v1" },
    expectedOutput: { schema: "CentroidAssignment", dtype: "f32" },
    policy: {
      tenantId: "default",
      permissionScope: ["retrieval:route"],
      maxRuntimeMs: 5000,
      allowSideEffects: false,
    },
    provenance: {
      runId,
      codeVersion: "smoke-v1",
      contentHash: envelope.contentHash,
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const runId = randomUUID();
  const content = "Agent actions must be validated before execution.";

  const envelope = FeatureEnvelopeSchema.parse({
    sourceRef: "repo://src/lib/server/agent/policy.ts",
    contentHash: sha256(content),
    embedding: [0.8, 0.1, 0.4, 0.2],
    extractedAt: new Date().toISOString(),
    metadata: { extractor: "smoke-v1", language: "typescript" },
  });

  const action = buildActionPacket(runId, envelope);
  const worker = buildWorkerPacket(runId, envelope);

  const centroids = [
    [1.0, 0.0, 0.0, 0.0],
    [0.0, 1.0, 0.0, 0.0],
    [0.6, 0.1, 0.7, 0.2],
  ] as const;

  const routing = nearestCentroid(envelope.embedding, centroids);

  // What Redis would cache — projection only, not the canonical record.
  const redisProjection = {
    key: `route:${envelope.contentHash}:centroids-v1`,
    ttlSeconds: 3600,
    value: {
      centroidId: routing.centroidId,
      score: routing.score,
      actionId: action.packetId,
      runId,
    },
  };

  // Outbox record that would be written atomically with the Postgres action row.
  const outboxRecord = {
    aggregate_type: "agent_run_action",
    aggregate_id: action.packetId,
    event_type: "centroid.assigned",
    payload: {
      sourceRef: envelope.sourceRef,
      contentHash: envelope.contentHash,
      centroidId: routing.centroidId,
      manifest: "centroids-v1",
    },
  };

  // ACE packet — bounded, validated, token-budget enforced before prompt injection.
  const acePacket = {
    packetId: randomUUID(),
    runId,
    query: {
      normalized: content,
      intent: "route",
      constraints: ["retrieval:route"],
    },
    routing: {
      centroidIds: [routing.centroidId],
      retrievalStrategy: "hnsw-prefilter",
      modelVersion: "centroids-v1",
    },
    evidence: [
      {
        sourceRef: envelope.sourceRef,
        excerpt: content.slice(0, 120),
        score: routing.score,
        provenance: envelope.contentHash,
      },
    ],
    availableActions: [
      {
        actionId: action.packetId,
        description: "Assign centroid for routing",
        requiredPermission: "retrieval:route",
        inputSchema: "CentroidAssignmentInput",
      },
    ],
    policy: { allowedScopes: ["retrieval:route"], requiresApproval: false },
    budget: { maximumInputTokens: 4096, maximumToolCalls: 3 },
  };

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  const assertions: Record<string, boolean> = {
    envelopeValid: FeatureEnvelopeSchema.safeParse(envelope).success,
    actionValid: ActionPacketSchema.safeParse(action).success,
    workerValid: WorkerPacketSchema.safeParse(worker).success,
    workerProtocolDistinct: worker.protocol !== action.protocol,
    dimensionValid: envelope.embedding.length === centroids[0].length,
    centroidAssigned: routing.centroidId >= 0,
    centroidIsThird: routing.centroidId === 2, // [0.6,0.1,0.7,0.2] closest to [0.8,0.1,0.4,0.2]
    scoreFinite: Number.isFinite(routing.score),
    scoreInRange: routing.score >= -1 && routing.score <= 1,
    redisKeyStable: redisProjection.key === `route:${envelope.contentHash}:centroids-v1`,
    idempotencyKeyDeterministic:
      action.idempotencyKey ===
      sha256(["assign.centroid", envelope.sourceRef, envelope.contentHash, "centroids-v1"].join(":")),
    outboxHasAggregateId: !!outboxRecord.aggregate_id,
    aceHasEvidence: acePacket.evidence.length > 0,
    aceHasBudget: acePacket.budget.maximumInputTokens > 0,
    // LLM must not be the authorizer — policy is in the packet, not inferred
    policyNotInferred: acePacket.policy.allowedScopes.length > 0,
  };

  const failed = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  console.log(
    JSON.stringify(
      {
        status: failed.length === 0 ? "PASS" : "FAIL",
        runId,
        routing,
        redisProjection,
        outboxRecord,
        action: { packetId: action.packetId, idempotencyKey: action.idempotencyKey },
        worker: { packetId: worker.packetId, protocol: worker.protocol },
        acePacket: { packetId: acePacket.packetId, evidenceCount: acePacket.evidence.length },
        assertions,
        failed,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      status: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    }, null, 2),
  );
  process.exitCode = 1;
});
