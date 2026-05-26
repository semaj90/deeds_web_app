import { legalAIService } from '$lib/server/unified/legal-ai-service.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { COMMAND_CENTER_MANIFEST } from '$lib/command-center-manifest.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  const exec = async (query: ReturnType<typeof sql>): Promise<Record<string, unknown>> => {
    try {
      const result = await db.execute(query);
      const res = result as unknown as { rows?: Record<string, unknown>[] };
      return (res.rows ?? [])[0] ?? {};
    } catch {
      return {};
    }
  };

  const [health, cases, evidence, { user }] = await Promise.all([
    safe(legalAIService.healthCheck(), {
      postgresql: false,
      qdrant: false,
      seaweed: false,
      minio: false,
      overall: 'down' as const,
    }),
    exec(sql`SELECT
			COUNT(*) FILTER (WHERE status IN ('open', 'active', 'investigating')) as active,
			COUNT(*) as total
			FROM cases`),
    exec(sql`SELECT COUNT(*) as total FROM evidence`),
    parent(),
  ]);

  return {
    serviceHealth: health,
    metrics: {
      totalCases: Number(cases.total ?? 0),
      activeCases: Number(cases.active ?? 0),
      evidenceProcessed: Number(evidence.total ?? 0),
    },
    user,
    manifest: COMMAND_CENTER_MANIFEST,
  };
};
