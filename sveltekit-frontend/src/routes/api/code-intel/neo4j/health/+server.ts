/**
 * GET /api/code-intel/neo4j/health
 *
 * Probes Neo4j connectivity, APOC availability, and GDS availability.
 * Used by the D33 audit gate and the VS Code extension status bar.
 *
 * Response:
 *   { ok: true,  neo4j: true, apoc: true,  gds: true,  gdsVersion: '2.x.y' }
 *   { ok: false, neo4j: false, apoc: false, gds: false, error: '...' }
 *
 * Requires auth — public health leaks plugin version info.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

const DEGRADED = { ok: false, neo4j: false, apoc: false, gds: false, gdsVersion: null as string | null };

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ ...DEGRADED, error: 'Unauthorized' }, { status: 401 });

  let driver;
  try {
    driver = getNeo4jDriver();
  } catch {
    return json({ ...DEGRADED, error: 'Neo4j driver not configured' });
  }

  const session = driver.session();
  const t0 = Date.now();

  let neo4j = false;
  let apoc  = false;
  let gds   = false;
  let gdsVersion: string | null = null;
  let apocCount: number | null = null;

  try {
    // Gate 1 — basic connectivity
    try {
      await session.run('RETURN 1 AS ok');
      neo4j = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ...DEGRADED, error: `Neo4j unreachable: ${msg}`, durationMs: Date.now() - t0 });
    }

    // Gate 2 — APOC
    try {
      const r = await session.run(`CALL apoc.help('apoc') YIELD name RETURN count(name) AS apocCount`);
      apocCount = Number(r.records[0]?.get('apocCount') ?? 0);
      apoc = apocCount > 0;
    } catch { /* APOC not installed */ }

    // Gate 3 — GDS version
    try {
      const r = await session.run(`CALL gds.version() YIELD version RETURN version`);
      gdsVersion = r.records[0]?.get('version') ?? null;
      gds = gdsVersion !== null;
    } catch { /* GDS not installed */ }

    return json({
      ok: neo4j && apoc && gds,
      neo4j,
      apoc,
      gds,
      gdsVersion,
      apocProcedures: apocCount,
      durationMs: Date.now() - t0,
    });
  } finally {
    await session.close();
  }
};