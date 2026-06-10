import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  prompt: z.string().min(1).describe('The user review request.'),
  document: z
    .string()
    .min(1)
    .describe('The architecture text, pasted plan, logs, or implementation notes to review.'),
  context: z
    .string()
    .optional()
    .describe('Optional repo phase, subsystem, or files involved.'),
});

type ReviewInput = z.infer<typeof inputSchema>;

export const reviewArchitecture = tool({
  description:
    'Review an architecture note or retrieval-system plan and return whether it is sound, what risks exist, and what safe read-only command should be run next.',

  inputSchema,

  execute: async ({ prompt, document, context }: ReviewInput) => {
    const text = `${prompt}\n${context ?? ''}\n${document}`.toLowerCase();

    const mentions = {
      postgres: /postgres|pgvector|drizzle/.test(text),
      qdrant: /qdrant|hnsw|embedding|vector/.test(text),
      neo4j: /neo4j|graph|relationship|topology/.test(text),
      redis: /redis|valkey|cache|ttl/.test(text),
      couchdb: /couchdb|document store|revision/.test(text),
      ace: /ace|packet|card|feature_id|source_ref|sourceref/.test(text),
    };

    const risks: string[] = [];

    if (mentions.qdrant && !/payload|source_ref|feature_id|metadata/.test(text)) {
      risks.push('Qdrant needs payload metadata such as sourceRef, feature_id, path, and cluster_id.');
    }

    if (mentions.neo4j && !/canonical|idempotent|merge/.test(text)) {
      risks.push('Neo4j graph writes should be idempotent with MERGE-style canonical IDs.');
    }

    if (mentions.redis && !/ttl|expire|cache invalidation/.test(text)) {
      risks.push('Redis/Valkey cache keys need TTL and invalidation rules.');
    }

    if (mentions.postgres && mentions.qdrant && !/postgres.*source|source.*postgres|durable/.test(text)) {
      risks.push('Postgres should remain the durable source of truth; Qdrant should be derived/indexed state.');
    }

    if (!/audit|validate|health|check/.test(text)) {
      risks.push('Add an audit/validation pass before any write or archive step.');
    }

    const domain =
      mentions.qdrant || mentions.ace || mentions.redis
        ? 'retrieval'
        : mentions.neo4j
          ? 'graph'
          : 'general';

    const verdict =
      risks.length === 0
        ? 'sound'
        : risks.length <= 2
          ? 'mostly-sound'
          : 'needs-validation';

    const safeNextCommand =
      domain === 'retrieval'
        ? 'rg -n "feature_id|sourceRef|source_ref|cluster_id|qdrant|embedding|cache" .opencode scripts src sveltekit-frontend/src --type ts --type mjs'
        : domain === 'graph'
          ? 'rg -n "MERGE|BELONGS_TO_CLUSTER|IMPORTS|neo4j|topology|graph" scripts src sveltekit-frontend/src --type ts --type mjs'
          : 'rg -n "TODO|FIXME|audit|validate|health|pipeline" scripts src sveltekit-frontend/src --type ts --type mjs';

    return {
      verdict,
      domain,
      confidence: risks.length === 0 ? 0.82 : 0.7,
      summary:
        'Architecture review completed. Use each store for its native strength: Postgres as durable truth, Qdrant as vector index, Neo4j as relationship traversal, Redis/Valkey as cache.',
      risks,
      safeNextCommand,
      recommendation:
        verdict === 'sound'
          ? 'Proceed to read-only validation, then wire an explicit audit before any mutation step.'
          : 'Fix the listed risks before allowing write, archive, or auto-repair actions.',
    };
  },
});