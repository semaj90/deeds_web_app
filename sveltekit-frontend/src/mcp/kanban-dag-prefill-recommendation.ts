import type { Pool } from 'pg';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { selectKanbanDagPrefillAlgorithm } from '../../scripts/mcp/kanban-dag-algorithm-selector-v1.mjs';
import { readKanbanDagSnapshotV1 } from './kanban-dag-snapshot.js';

const MAX_TASKS = 128;
const MAX_PREFILL_TASKS = 32;

export const KanbanDagPrefillRecommendationInputV1Schema = z.object({
  featureId: z.string().trim().regex(/^(openspec:[a-z0-9][a-z0-9-]*|nextsteps:[a-z0-9_.-]+)$/),
  cohortLimit: z.number().int().min(1).max(MAX_TASKS).optional().default(64),
  maxPrefillTasks: z.number().int().min(1).max(MAX_PREFILL_TASKS).optional().default(16),
}).strict();

export type KanbanDagPrefillRecommendationInputV1 = z.input<typeof KanbanDagPrefillRecommendationInputV1Schema>;

type Queryable = Pick<Pool, 'connect'>;

export async function recommendKanbanDagPrefillV1(
  pool: Queryable,
  input: KanbanDagPrefillRecommendationInputV1,
) {
  const parsed = KanbanDagPrefillRecommendationInputV1Schema.parse(input);
  const snapshot = await readKanbanDagSnapshotV1(pool, {
    featureId: parsed.featureId,
    limit: parsed.cohortLimit,
  });
  return selectKanbanDagPrefillAlgorithm(snapshot, { maxPrefillTasks: parsed.maxPrefillTasks });
}

export function registerKanbanDagPrefillRecommendationTool(server: McpServer, pool: Queryable): void {
  server.registerTool(
    'atlas.kanban_dag_prefill_recommendation',
    {
      description:
        'Read a bounded OpenSpec Kanban cohort and recommend a deterministic prerequisite-respecting prefill order. ' +
        'Uses Kahn topological frontiers when dependency edges exist and stable task-ID order otherwise. ' +
        'Returns proposal-only candidates; it never dispatches, changes task state, or authorizes parallel execution.',
      inputSchema: KanbanDagPrefillRecommendationInputV1Schema,
    },
    async (input) => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify(await recommendKanbanDagPrefillV1(pool, input)),
      }],
    }),
  );
}
