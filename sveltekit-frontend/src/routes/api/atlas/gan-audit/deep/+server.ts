/**
 * GAN Deep Audit API Route
 *
 * Integrates feature registry search, token savings analysis, production hardening,
 * and retrieval coverage analysis for comprehensive GAN audit pipeline.
 *
 * POST /api/atlas/gan-audit/deep
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';
// TODO: Import getNats from '$lib/server/nats.js' when module is created

const ganDeepAuditRequestSchema = z.object({
  operation: z.enum(['gan-audit']).default('gan-audit'),
  dryRun: z.boolean().default(false),
  verbose: z.boolean().default(false),
  batchSize: z.number().int().positive().default(500),
  includeTokenAnalysis: z.boolean().default(true),
  includeFeatureRecommendations: z.boolean().default(true),
  includeProductionHardening: z.boolean().default(true),
  includeRetrievalAnalysis: z.boolean().default(true),
});

type GanDeepAuditRequest = z.infer<typeof ganDeepAuditRequestSchema>;

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth guard
  if (!locals.user) {
    return json(
      { error: 'Unauthorized', code: '401_UNAUTH' },
      { status: 401 }
    );
  }

  try {
    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const config = ganDeepAuditRequestSchema.parse(body);

    // Wire atlas-core GAN audit (relative import from compiled dist)
    const { executeGanDeepAudit } = await import('../../../../../../../packages/atlas-core/dist/validation/gan-deep-audit.js');
    const { goSearchBridge } = await import('$lib/server/retrieval/go-search-bridge.js');

    // Get service clients with graceful fallback
    let redis;
    let nats;
    try {
      redis = getRedis();
    } catch (err) {
      if (config.verbose) console.warn('[GAN Deep Audit] Redis unavailable, continuing without cache');
    }

    try {
      // TODO: Wire NATS when $lib/server/nats.ts is implemented
      // For now, NATS is optional (non-blocking events deferred)
      // const { getNats } = await import('$lib/server/nats.js');
      // nats = getNats();
    } catch (err) {
      if (config.verbose) console.warn('[GAN Deep Audit] NATS unavailable, continuing without events');
    }

    // Inject SvelteKit context dependencies
    const deps = {
      db,
      redis,
      nats,
      goSearchBridge: config.includeRetrievalAnalysis ? goSearchBridge : undefined,
    };

    if (config.verbose) {
      console.log(`[GAN Deep Audit] Starting audit: operation=${config.operation}, batchSize=${config.batchSize}`);
    }

    // Execute comprehensive GAN deep audit
    const auditConfig = {
      operation: config.operation,
      dryRun: config.dryRun,
      batchSize: config.batchSize,
      includeTokenAnalysis: config.includeTokenAnalysis,
      includeFeatureRecommendations: config.includeFeatureRecommendations,
      includeProductionHardening: config.includeProductionHardening,
      includeRetrievalAnalysis: config.includeRetrievalAnalysis,
    };

    const auditDeps = {
      db,
      redis: redis || undefined,
      nats: nats || undefined,
      goSearchBridge: config.includeRetrievalAnalysis ? goSearchBridge : undefined,
    };

    const result = await executeGanDeepAudit(auditConfig, auditDeps);

    // Log to audit trail (non-blocking)
    try {
      if (redis) {
        const trace_id = result.trace_id || `audit:gan-deep:${Date.now()}`;
        await redis.setex(
          trace_id,
          3600,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            user_id: locals.user.id,
            operation: config.operation,
            processed: result.processed || 0,
            passed: result.passed || 0,
            hardFailures: result.hardFailures || 0,
            softWarnings: result.softWarnings || 0,
            total_potential_savings: result.total_potential_savings || 0,
            hardening_issues_count: result.production_hardening_issues?.length || 0,
            recommendations_count: result.agentic_recommendations?.length || 0,
          })
        );
        if (config.verbose) console.log(`[GAN Deep Audit] Audit trail written: ${trace_id}`);
      }
    } catch (err) {
      if (config.verbose) console.warn('[GAN Deep Audit] Audit trail write failed (non-blocking):', err);
    }

    return json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = err instanceof z.ZodError ? '400_VALIDATION' : '500_INTERNAL';

    console.error(`[GAN Deep Audit] ${code}:`, err);

    // Return degraded response with same shape (never 500 on GET-like requests)
    return json(
      {
        operation: 'gan-audit',
        trace_id: 'error:' + Date.now(),
        processed: 0,
        passed: 0,
        hardFailures: 0,
        softWarnings: 0,
        total_potential_savings: 0,
        token_analysis: [],
        production_hardening_issues: [],
        agentic_recommendations: [],
        error: message,
        code,
      },
      { status: code.startsWith('400') ? 400 : 500 }
    );
  }
};

/**
 * GET /api/atlas/gan-audit/deep
 * Returns schema and recent audit history
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const redis = getRedis();

    // Fetch recent audit summaries (last 10)
    const keys = await redis.keys('audit:gan-deep:*');
    const recent = await Promise.all(
      keys.slice(-10).map(async (key) => {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    return json(
      {
        schema: {
          operation: 'gan-audit',
          includeTokenAnalysis: true,
          includeFeatureRecommendations: true,
          includeProductionHardening: true,
          includeRetrievalAnalysis: true,
          dryRun: false,
          verbose: false,
          batchSize: 500,
        },
        recent_audits: recent.filter(Boolean),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[GAN Deep Audit GET] Error:', err);
    return json(
      {
        schema: {
          operation: 'gan-audit',
          includeTokenAnalysis: true,
          includeFeatureRecommendations: true,
          includeProductionHardening: true,
          includeRetrievalAnalysis: true,
          dryRun: false,
          verbose: false,
          batchSize: 500,
        },
        recent_audits: [],
      },
      { status: 200 }
    );
  }
};