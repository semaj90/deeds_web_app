/**
 * Vitest globalSetup for the live-integration lane. Fails closed unless the operator opts in explicitly.
 *
 * These specs use real PostgreSQL, RabbitMQ and (for PageRank parity) WSL + Neo4j. The two outbox specs
 * WRITE rows to the configured database (see LIVE_INTEGRATION_WRITES below). They are not isolated yet:
 * pointing DATABASE_URL at a scratch database is the only way to keep canonical tables clean.
 */
export const LIVE_INTEGRATION_WRITES = [
  'workflow_runs (task outbox proof: inserted, cleaned in a finally block)',
  'workflow_outbox (task + code-evidence outbox rows)',
  'analysis_pass_results / ledger (code-evidence outbox spec; no cleanup in the spec)',
] as const;

function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

export default function setup(): void {
  if (process.env.ATLAS_LIVE_INTEGRATION_ALLOW_DB_WRITES !== '1') {
    throw new Error(
      [
        'LIVE_INTEGRATION_NOT_OPTED_IN: this lane writes to a database.',
        'Tables written: ' + LIVE_INTEGRATION_WRITES.join('; '),
        'Set ATLAS_LIVE_INTEGRATION_DATABASE_URL to a scratch database (name ending in _scratch) and',
        'ATLAS_LIVE_INTEGRATION_ALLOW_DB_WRITES=1. The lane never reads the normal DATABASE_URL.',
      ].join('\n'),
    );
  }
  // The config maps ATLAS_LIVE_INTEGRATION_DATABASE_URL onto DATABASE_URL for the test processes;
  // loadRuntimeEnv() does not override variables that are already set, so .env cannot swap it back.
  const name = databaseNameOf(process.env.ATLAS_LIVE_INTEGRATION_DATABASE_URL);
  if (!name || !name.endsWith('_scratch')) {
    throw new Error(
      `LIVE_INTEGRATION_DATABASE_NOT_SCRATCH: database name must end with "_scratch" (got ${name ?? 'none'}). ` +
      'Refusing to run against a canonical database.',
    );
  }
}
