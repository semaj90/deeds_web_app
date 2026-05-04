import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const MetricsSchema = z.record(z.string(), z.unknown());

const RagSummarySchema = z
  .object({
    summary: z.string().nullable().optional(),
    summaries: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    chunkCount: z.number().optional(),
  })
  .passthrough();

const HyperedgeSchema = z
  .object({
    edgeCount: z.number().optional(),
    topGrade: z.string().optional(),
    avgReward: z.union([z.string(), z.number()]).optional(),
    clusters: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .passthrough();

const DirAuditEntrySchema = z.object({
  rel: z.string().min(1),
  score: z.number().min(0).max(100),
  metrics: MetricsSchema.default({}),
  ragSummary: z.union([z.string(), RagSummarySchema, z.null()]).default(null),
  agentSummary: z.string().nullable().default(null),
  hyperedge: z.union([z.string(), HyperedgeSchema, z.null()]).optional(),
});

const BodySchema = z.object({
  dirOutputs: z.array(DirAuditEntrySchema).min(1),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { ingestDirectorySummaries } = await import(
    '$lib/server/indexer/directory-summarizer.js'
  );

  const result = await ingestDirectorySummaries(parsed.data.dirOutputs);

  return json(result);
};
