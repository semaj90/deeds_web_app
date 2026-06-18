import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.resolve(ROOT, 'docs', 'reports');
const CACHE_DIR = path.resolve(ROOT, '.cache', 'ace', 'planner-cache');

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  const stage = (label) => console.log(`[ace-planner-smoke] ${label}`);
  const withTimeout = async (promise, label, ms = 20000) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  stage('importing planner module');
  const { buildAceContextPlannerState, loadAceContextPlannerHit, storeAceContextPlannerHit } = await import(
    '../../src/lib/server/ace/context-cache-planner.ts'
  );
  stage('building planner state');

  const state = buildAceContextPlannerState({
    query: 'parent atlas identity spine',
    userId: 'codex',
    caseId: `planner-cache-smoke-${runId}`,
    conversationId: `planner-cache-smoke-${runId}`,
    filePath: 'src/lib/server/retrieval/hyperrag-fusion-service.ts',
    enableCodebaseContext: true,
    tokenAwarePacking: true,
    backend: 'openai-facade',
  });

  stage('loading before write');
  const packet = {
    featureId: 'atlas:planner-cache:smoke',
    glyphMask: 1,
    summary: 'ACE planner cache smoke packet',
    topFiles: ['src/lib/server/retrieval/hyperrag-fusion-service.ts'],
    topTriples: [['parent', 'atlas', 'identity']],
    selectedSourceIds: ['source:planner-cache-smoke'],
    cacheKeys: ['cache:planner-cache-smoke'],
    warnings: [],
  };

  const before = await withTimeout(loadAceContextPlannerHit(state).catch(() => null), 'load-before');
  stage('writing planner packet');
  await withTimeout(
    storeAceContextPlannerHit(state, packet, {
      source: 'miss',
      retrievedAt: new Date().toISOString(),
      deltaFields: [],
      estimatedPrefixTokens: 0,
    }),
    'store'
  );
  stage('loading after write');
  const after = await withTimeout(loadAceContextPlannerHit(state).catch(() => null), 'load-after');

  const report = {
    cacheKey: state.cacheKey,
    plannerState: {
      query: state.query,
      queryHash: state.queryHash,
      modelName: state.modelName,
      backend: state.backend,
      filePath: state.filePath,
      tokenAwarePacking: state.tokenAwarePacking,
    },
    beforeHit: Boolean(before),
    afterHit: Boolean(after),
    afterSource: after?.meta.source ?? null,
    afterDeltaFields: after?.meta.deltaFields ?? [],
    cacheHit: Boolean(after),
    packetSummary: after?.packet.summary ?? null,
    packetFeatureId: after?.packet.featureId ?? null,
    createdAt: new Date().toISOString(),
  };

  const fileBase = `ace_cache_hit_${runId}`;
  await fs.writeFile(path.join(REPORT_DIR, `${fileBase}.json`), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(
    path.join(REPORT_DIR, `${fileBase}.md`),
    [
      '# ACE Planner Cache-Hit Proof',
      '',
      `- cacheKey: \`${report.cacheKey}\``,
      `- beforeHit: ${report.beforeHit}`,
      `- afterHit: ${report.afterHit}`,
      `- afterSource: ${report.afterSource ?? 'null'}`,
      `- packetSummary: ${report.packetSummary ?? 'null'}`,
      `- packetFeatureId: ${report.packetFeatureId ?? 'null'}`,
    ].join('\n'),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));

  if (!report.afterHit) {
    process.exitCode = 1;
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
