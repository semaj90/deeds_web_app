/**
 * GAN Audit Client Factory
 *
 * Provides default clients for GanAuditOrchestrator from SvelteKit context.
 * Use this factory when running in a SvelteKit environment (API routes, load functions).
 * For context-agnostic usage (standalone scripts), pass clients directly to GanAuditOrchestrator.
 */

import type { GanAuditDependencies } from './gan-audit-integration.js';
import type { WorkflowTrace } from './workflow-trace-logger.js';

/**
 * Create GAN audit dependencies from SvelteKit context
 * Does not reach into app-local `$lib` paths so the package can build standalone.
 */
export async function createGanAuditDependencies(
  overrides?: Partial<GanAuditDependencies>
): Promise<GanAuditDependencies> {
  const deps: GanAuditDependencies = overrides || {};

  if (!deps.nats) {
    try {
      const { getNatsClient } = await import('../nats/nats-client.js');
      deps.nats = getNatsClient();
    } catch (err) {
      console.warn('[GAN Audit] Could not import nats from ../nats/nats-client');
    }
  }

  if (!deps.logWorkflowTrace) {
    try {
      const {
        logWorkflowTracePostgres,
        logWorkflowTraceRedis,
      } = await import('./workflow-trace-logger.js');

      deps.logWorkflowTrace = async (trace: WorkflowTrace) => {
        // Log to all three tiers (Postgres → Redis → Qdrant)
        if (deps.db) {
          await logWorkflowTracePostgres(trace, deps.db).catch((err: any) => {
            console.warn(`[GAN Audit] Failed to log trace to Postgres: ${err.message}`);
          });
        }
        if (deps.redis) {
          await logWorkflowTraceRedis(trace, deps.redis).catch((err: any) => {
            console.warn(`[GAN Audit] Failed to log trace to Redis: ${err.message}`);
          });
        }
        // Qdrant requires embedding; skipped for now
      };
    } catch (err) {
      console.warn('[GAN Audit] Could not set up workflow trace logging');
    }
  }

  return deps;
}

/**
 * Create minimal GAN audit dependencies for standalone scripts
 * Requires explicit client instantiation outside this function
 */
export function createMinimalGanAuditDependencies(
  db?: any,
  redis?: any,
  nats?: any
): GanAuditDependencies {
  return { db, redis, nats };
}
