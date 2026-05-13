import { spawnSync } from 'node:child_process';
import { getWikiStatus, searchWiki } from '../src/lib/server/kb/wiki-logic.js';
import { executePentagonSearch } from '../src/lib/server/kb/pentagon-search.js';
import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';
import { getRedis } from '../src/lib/server/redis.js';
import { db } from '../src/lib/server/db/client.js';
import { enhancedGraphMappings } from '../src/lib/server/db/schema/graph-mappings.js';
import { grpoMemorySticks } from '../src/lib/server/db/schema/features.js';
import { getNeo4jDriver } from '../src/lib/server/neo4j-driver.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';

function getWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function parseLastJsonObject(text) {
  const matches = text.match(/\{[\s\S]*\}/g);
  if (!matches || matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(matches[i]);
    } catch {
      // Try previous match.
    }
  }
  return null;
}

async function runSmoke() {
  console.log('🚀 Phase 3.8 Truth-and-Drift Smoke Test...');
  const warnings = [];
  const results = {
    phase: '3.8',
    status: 'fail',
    featureMap: {
      glyphMask: 0,
      redisKeys: 0,
      postgresRows: 0,
      qdrantPoints: 0,
      neo4jTriples: 0
    },
    wiki: {
      statusOk: false,
      searchOk: false,
      pages: 0
    },
    pentagon: {
      traceOk: false,
      pillars: {
        semantic: false,
        implementation: false,
        dependency: false,
        interface: false,
        storage: false
      }
    },
    warnings: warnings
  };

  let hardFail = false;

  const markRequired = (condition, message) => {
    if (!condition) {
      warnings.push(message);
      hardFail = true;
    }
  };

  const markWarning = (condition, message) => {
    if (!condition) warnings.push(message);
  };

  try {
    // 1. feature:compile:smoke must pass.
    const workspaceRoot = getWorkspaceRoot();
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const compileRun = spawnSync(npmCmd, ['run', 'feature:compile:smoke'], {
      cwd: workspaceRoot,
      encoding: 'utf8'
    });
    markRequired(compileRun.status === 0, 'feature:compile:smoke failed');

    const compileOut = `${compileRun.stdout ?? ''}\n${compileRun.stderr ?? ''}`;
    const compileJson = parseLastJsonObject(compileOut);
    results.featureMap.glyphMask = Number(compileJson?.glyphMask ?? 0);
    markRequired(results.featureMap.glyphMask === 119, `Feature glyph drift: expected 119, saw ${results.featureMap.glyphMask}`);

    // 2. Redis feature:* keys
    try {
      const redis = getRedis();
      const featureKeys = await redis.keys('feature:*');
      markRequired(featureKeys.length > 0, 'Redis feature:* keys missing');
      results.featureMap.redisKeys = featureKeys.length;
      console.log(`✅ Redis feature keys: ${featureKeys.length}`);

      // 3. GRPO memory stick
      const [grpoCountRow] = await db.select({ value: count() }).from(grpoMemorySticks);
      const grpoCount = Number(grpoCountRow?.value ?? 0);
      if (grpoCount === 0) {
        warnings.push('FeatureMap dry-run only');
      }
      console.log(`✅ GRPO memory sticks: ${grpoCount}`);
    } catch (err) {
      warnings.push(`FeatureMap dry-run only (${String(err?.message ?? 'redis/grpo unavailable')})`);
    }

    // 4. Postgres enhanced_graph_mappings has feature row.
    try {
      const [mappingRow] = await db
        .select({ id: enhancedGraphMappings.id })
        .from(enhancedGraphMappings)
        .where(eq(enhancedGraphMappings.kind, 'feature'))
        .limit(1);
      markRequired(Boolean(mappingRow), 'enhanced_graph_mappings has no feature row');
      results.featureMap.postgresRows = mappingRow ? 1 : 0;
      console.log('✅ Postgres mapping check');
    } catch (err) {
      markRequired(false, `Postgres lane unavailable: ${String(err?.message ?? err)}`);
    }

    // 5. Wiki Status
    try {
      const wikiStatus = await getWikiStatus();
      results.wiki.statusOk = true;
      results.wiki.pages = wikiStatus.pageCount;
      markRequired(typeof wikiStatus.pageCount === 'number', 'wiki.status did not return counts');
      try {
        const qdrant = new QdrantManager();
        const featureSummary = await qdrant.client.scroll('feature_maps', {
          limit: 1,
          with_payload: true,
          with_vector: false
        });
        results.featureMap.qdrantPoints = featureSummary.points?.length ?? 0;
        markWarning(results.featureMap.qdrantPoints > 0, 'Qdrant vector lane unavailable');
      } catch (err) {
        warnings.push(`Qdrant vector lane unavailable (${String(err?.message ?? err)})`);
      }

      const routeSvelte = path.join(workspaceRoot, 'src', 'routes', '(app)', 'admin', 'knowledge-base', '+page.svelte');
      const routeServer = path.join(workspaceRoot, 'src', 'routes', '(app)', 'admin', 'knowledge-base', '+page.server.ts');
      markRequired(fs.existsSync(routeSvelte) && fs.existsSync(routeServer), 'Knowledge Base Manager route missing');
      console.log('✅ Wiki status pass');
    } catch (err) {
      markRequired(false, `wiki.status lane unavailable: ${String(err?.message ?? err)}`);
    }

    // 6. Wiki Search
    try {
      const searchResult = await searchWiki('feature');
      results.wiki.searchOk = searchResult.length > 0 && searchResult.every((hit) =>
        hit && typeof hit.id === 'string' && typeof hit.kind === 'string' && typeof hit.label === 'string' && typeof hit.score === 'number'
      );
      markRequired(results.wiki.searchOk, 'wiki.search returned unnormalized hits');
      console.log('✅ Wiki search pass');
    } catch (err) {
      markRequired(false, `wiki.search lane unavailable: ${String(err?.message ?? err)}`);
    }

    // 7. Neo4j Triples
    try {
      const driver = getNeo4jDriver();
      const session = driver.session();
      try {
        const nResult = await session.run('MATCH (f:Feature)-[r]->() RETURN count(r) as count');
        const count = nResult.records[0].get('count').toNumber();
        results.featureMap.neo4jTriples = count;
        markWarning(count > 0, 'Neo4j graph lane unavailable');
      } finally {
        await session.close();
      }
      console.log('✅ Neo4j check');
    } catch (err) {
      warnings.push(`Neo4j graph lane unavailable (${String(err?.message ?? err)})`);
    }

    // 8. Pentagon Search
    try {
      const pentagon = await executePentagonSearch('feature', { dryRun: true, limit: 10 });
      results.pentagon.traceOk = !!pentagon.trace;
      if (pentagon.trace) {
        results.pentagon.pillars = {
          semantic: pentagon.trace.seedHits > 0,
          implementation: pentagon.trace.implementationNodes > 0,
          dependency: pentagon.trace.dependencyNodes > 0,
          interface: pentagon.trace.interfaceNodes > 0,
          storage: pentagon.trace.storageNodes > 0,
        };
      }
      markRequired(results.pentagon.traceOk, 'Pentagon search trace missing');
      markRequired(Object.values(results.pentagon.pillars).every(Boolean), 'Pentagon search did not hit all 5 pillars');
      console.log('✅ Pentagon search pass');
    } catch (err) {
      markRequired(false, `Pentagon search unavailable: ${String(err?.message ?? err)}`);
    }

    results.status = hardFail ? 'fail' : 'pass';
  } catch (err) {
    console.error('❌ Smoke test failed:', err);
    warnings.push(`Smoke crash: ${String(err?.message ?? err)}`);
    results.status = 'fail';
  }

  console.log('\n--- SMOKE RESULTS ---');
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'pass' ? 0 : 1);
}

runSmoke();
