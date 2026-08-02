/**
 * One-shot smoke test for the acquisition MVP: request -> outbox -> stream ->
 * worker -> Postgres result. Run from sveltekit-frontend/ so $lib resolves.
 *
 * Env-dependent modules are dynamically imported AFTER loadRuntimeEnv() —
 * static imports are hoisted and evaluate before any top-level code runs,
 * so db/client.ts's pool would otherwise be constructed with empty env.
 */
import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

async function main() {
  loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });

  const { requestAcquisition } = await import('../../src/lib/server/atlas/acquisition/acquisition-writer.js');
  const { runOutboxCycle } = await import('../../src/lib/server/agent/outbox-worker.js');
  const { runAcquisitionWorkerCycle } = await import('../../src/lib/server/atlas/acquisition/acquisition-worker.js');
  const { db } = await import('../../src/lib/server/db/client.js');
  const { atlasFetches, atlasFetchAttempts, atlasSourceRevisions } = await import('../../src/lib/server/db/schema.js');
  const { eq } = await import('drizzle-orm');

  console.log('--- 1. requestAcquisition ---');
  const req = await requestAcquisition({
    workspaceId: 'smoke-test',
    workspaceRevision: 1,
    query: 'smoke test acquisition MVP',
    requestedUrl: 'https://example.com',
    normalizedUrl: 'https://example.com',
  });
  console.log(JSON.stringify(req, null, 2));

  console.log('--- 2. runOutboxCycle (publish to Valkey stream) ---');
  const outboxResult = await runOutboxCycle({ batchSize: 10, verbose: true });
  console.log(JSON.stringify(outboxResult, null, 2));

  console.log('--- 3. runAcquisitionWorkerCycle (consume + fetch + persist) ---');
  const workerResult = await runAcquisitionWorkerCycle('smoke-worker-1', 5);
  console.log(JSON.stringify(workerResult, null, 2));

  console.log('--- 3b. Second request, SAME url + SAME research run (revalidation) ---');
  const req2 = await requestAcquisition({
    researchRunId: req.researchRunId,
    workspaceId: 'smoke-test',
    workspaceRevision: 1,
    query: 'smoke test acquisition MVP',
    requestedUrl: 'https://example.com',
    normalizedUrl: 'https://example.com',
    cachePolicyMode: 'revalidate',
  });
  console.log(JSON.stringify(req2, null, 2));
  await runOutboxCycle({ batchSize: 10, verbose: true });
  const workerResult2 = await runAcquisitionWorkerCycle('smoke-worker-1', 5);
  console.log('second worker cycle:', JSON.stringify(workerResult2, null, 2));

  const [attempt2] = await db
    .select()
    .from(atlasFetchAttempts)
    .where(eq(atlasFetchAttempts.fetchAttemptId, req2.fetchAttemptId));
  console.log('second attempt (should show conditional_fetch/exact_digest_reuse and validators sent):', JSON.stringify(attempt2, null, 2));

  console.log('--- 4. Verify Postgres state ---');
  const [fetch] = await db.select().from(atlasFetches).where(eq(atlasFetches.fetchId, req.fetchId));
  console.log('atlas_fetches:', JSON.stringify(fetch, null, 2));

  const [attempt] = await db
    .select()
    .from(atlasFetchAttempts)
    .where(eq(atlasFetchAttempts.fetchAttemptId, req.fetchAttemptId));
  console.log('atlas_fetch_attempts:', JSON.stringify(attempt, null, 2));

  if (attempt?.sourceRevisionId) {
    const [rev] = await db
      .select()
      .from(atlasSourceRevisions)
      .where(eq(atlasSourceRevisions.sourceRevisionId, attempt.sourceRevisionId));
    console.log('atlas_source_revisions:', JSON.stringify(rev, null, 2));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
