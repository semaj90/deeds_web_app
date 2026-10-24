import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAgentIntegrationSmokeReceiptV1, classifyMastraToolRegistrationV1, compareOkfTaxonomyWithPostgresV1, summarizeTestProcessResultV1, VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1, verifyAgentIntegrationSmokeReceiptV1, verifyFirecrawlSinglePageSmokeReceiptV1, verifyMastraRouteReadbackReceiptV1, verifyWorkspaceCurrentnessReconciliationReceiptV1, verifyPostgresMessagePackDiagnosticArtifactsV1, verifyValkeyKeyCensusReceiptV1 } from './lib/agent-integration-smoke-v1.mjs';
import { sha256CouchDbV1 } from './lib/couchdb-offline-batch-v1.mjs';
import { verifyCouchDbDuckDbKanbanRollupV1 } from './lib/couchdb-duckdb-kanban-rollup-v1.mjs';
import { probeReadOnlyListenerV1 } from './lib/read-only-listener-probe-v1.mjs';
import { sha256CanonicalDomainCrosswalkV2, verifyDomainVocabularyCrosswalkReceiptV2 } from './lib/domain-vocabulary-crosswalk-census-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requestId = `agent-integration-smoke:${randomUUID()}`;
const timeoutMs = 3_000;
const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const { mapDiagnosticChainReceiptV1, mapKanbanReplayReceiptV1 } = await import(pathToFileURL(path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'observability', 'offline-receipt-telemetry-v1.ts')).href);
const { decode: decodeMessagePack } = createRequire(path.join(root, 'sveltekit-frontend', 'package.json'))('@msgpack/msgpack');

async function read(relativePath) {
  try { return await readFile(path.join(root, relativePath), 'utf8'); } catch { return null; }
}

async function readLatestVerifiedKanbanReplay() {
  const base = path.join(root, '.tmp', 'atlas', 'couchdb-duckdb-kanban-rollup');
  let runs;
  try { runs = (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse(); }
  catch { return null; }
  for (const runId of runs) {
    const relativePath = path.join('.tmp', 'atlas', 'couchdb-duckdb-kanban-rollup', runId, 'receipt.json');
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      const { receiptChecksum, ...body } = receipt;
      const pages = receipt.pages;
      const shapeValid = receipt.schema === 'atlas.couchdb-duckdb-kanban-replay-receipt.v1'
        && receipt.inputDatabase === 'phase19_tasks'
        && receipt.canonicalAuthority === false
        && receipt.sourceAdmission === 'NOT_ADMITTED'
        && receipt.persistentWrites === 0
        && receipt.mapReduceParity === 'DUCKDB_CPU_ORACLE_PASS'
        && Array.isArray(pages)
        && pages.length === receipt.inputPageCount
        && pages.at(-1)?.recordCount === 0
        && pages.reduce((total, page) => total + page.recordCount, 0) === receipt.inputChangeCount
        && pages.every((page) => /^sha256:[a-f0-9]{64}$/.test(page.batchDigest)
          && /^sha256:[a-f0-9]{64}$/.test(page.checkpointDigest)
          && /^sha256:[a-f0-9]{64}$/.test(page.exportReceiptChecksum))
        && pages.at(-1)?.checkpointDigest === receipt.finalCheckpointDigest;
      if (!shapeValid || receiptChecksum !== sha256CouchDbV1(body) || !verifyCouchDbDuckDbKanbanRollupV1(receipt.rollup).valid) continue;
      const telemetry = mapKanbanReplayReceiptV1(receipt);
      return {
        runId,
        path: relativePath,
        receiptChecksum,
        artifactSha256: createHash('sha256').update(bytes).digest('hex'),
        pageCount: pages.length,
        changeCount: receipt.inputChangeCount,
        liveDocumentCount: receipt.rollup.liveDocumentCount,
        tombstoneCount: receipt.rollup.tombstoneCount,
        conflictCount: receipt.rollup.conflictedDocumentCount,
        sourceReferenceCount: receipt.rollup.sourceReferenceCount,
        canonicalAuthority: receipt.canonicalAuthority,
        sourceAdmission: receipt.sourceAdmission,
        persistentWrites: receipt.persistentWrites,
        telemetry,
      };
    } catch {}
  }
  return null;
}

async function readLatestVerifiedPostgresMessagePackChain() {
  const base = path.join(root, '.tmp', 'atlas', 'omr-msgpack', 'runs');
  let runs;
  try { runs = (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse(); }
  catch { return { status: 'NOT_FOUND', detailCode: 'OMR_RUNS_NOT_FOUND' }; }
  const runId = runs[0];
  if (!runId) return { status: 'NOT_FOUND', detailCode: 'OMR_RUNS_NOT_FOUND' };
  const receiptRelativePath = path.join('.tmp', 'atlas', 'omr-msgpack', 'runs', runId, 'e2e', 'receipt.json');
  const readArtifact = async (relativePath) => {
    const normalized = String(relativePath).replaceAll('\\', '/');
    if (!normalized.startsWith('.tmp/atlas/omr-msgpack/')) throw new Error('OMR_ARTIFACT_PATH_OUT_OF_SCOPE');
    const absolutePath = path.resolve(root, normalized);
    const relativeToRoot = path.relative(root, absolutePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) throw new Error('OMR_ARTIFACT_PATH_OUT_OF_SCOPE');
    return { absolutePath, bytes: await readFile(absolutePath) };
  };
  try {
    const receiptArtifact = await readArtifact(receiptRelativePath);
    const receipt = JSON.parse(receiptArtifact.bytes.toString('utf8'));
    if (receipt.runId !== runId) throw new Error('OMR_RUN_ID_MISMATCH');
    const [snapshot, snapshotReceipt, reduceReceipt, reduceOutput, descriptor] = await Promise.all([
      readArtifact(receipt.links?.snapshot?.file),
      readArtifact(receipt.links?.snapshot?.receiptFile),
      readArtifact(receipt.links?.reduce?.file),
      readArtifact(receipt.links?.reduce?.outputFile),
      readArtifact(receipt.links?.messagepack?.descriptorFile),
    ]);
    const verified = verifyPostgresMessagePackDiagnosticArtifactsV1({
      receipt,
      receiptBytes: receiptArtifact.bytes,
      receiptArtifactSha256: `sha256:${createHash('sha256').update(receiptArtifact.bytes).digest('hex')}`,
      snapshotBytes: snapshot.bytes,
      snapshotReceiptBytes: snapshotReceipt.bytes,
      reduceReceiptBytes: reduceReceipt.bytes,
      reduceOutputBytes: reduceOutput.bytes,
      descriptorBytes: descriptor.bytes,
      decodeMessagePack: (bytes) => decodeMessagePack(bytes),
      mapTelemetry: mapDiagnosticChainReceiptV1,
    });
    return {
      status: 'VERIFIED',
      path: receiptRelativePath,
      artifactSha256: verified.receiptArtifactSha256,
      receiptChecksum: verified.receiptChecksum,
      runId,
      snapshotPath: receipt.links.snapshot.file,
      snapshotReceiptPath: receipt.links.snapshot.receiptFile,
      reduceReceiptPath: receipt.links.reduce.file,
      reduceOutputPath: receipt.links.reduce.outputFile,
      descriptorPath: receipt.links.messagepack.descriptorFile,
      ...verified,
    };
  } catch (error) {
    return { status: 'NOT_VERIFIED', path: receiptRelativePath, detailCode: error instanceof Error ? error.message : 'OMR_READBACK_FAILED' };
  }
}

async function readLatestMastraRouteReadback() {
  const base = path.join(root, '.tmp', 'atlas', 'telemetry-route-readback');
  let files;
  try { files = (await readdir(base)).filter((name) => name.endsWith('.json')); }
  catch { return null; }
  const valid = [];
  for (const name of files) {
    const relativePath = path.join('.tmp', 'atlas', 'telemetry-route-readback', name);
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      verifyMastraRouteReadbackReceiptV1(receipt);
      valid.push({ relativePath, bytes, receipt });
    } catch {}
  }
  valid.sort((left, right) => right.receipt.capturedAt.localeCompare(left.receipt.capturedAt));
  const latest = valid[0];
  if (!latest) return null;
  return {
    path: latest.relativePath,
    artifactSha256: createHash('sha256').update(latest.bytes).digest('hex'),
    receiptChecksum: latest.receipt.checksumSha256,
    requestId: latest.receipt.requestId,
    routeStatus: latest.receipt.route.httpStatus,
    refusalCode: latest.receipt.route.refusalCode,
    firstFailingBoundary: latest.receipt.route.firstFailingBoundary,
    agentExecutionStatus: latest.receipt.route.agentExecutionStatus,
    traceReadbackVerdict: latest.receipt.langfuse.readbackVerdict,
    tracesScanned: latest.receipt.langfuse.pagination.traceRecordsRead,
    traceId: latest.receipt.langfuse.observationReadback?.traceId ?? null,
    matchingRequestObservations: latest.receipt.langfuse.observationReadback?.requestIdMatches ?? 0,
    matchingObservationIds: latest.receipt.langfuse.observationReadback?.matchingObservationIds ?? [],
    writesPerformed: latest.receipt.route.writesPerformed,
  };
}

async function readLatestWorkspaceCurrentnessReconciliation() {
  const base = path.join(root, '.tmp', 'atlas', 'workspace-snapshot-scratch-v1', 'currentness-reconciliation');
  let files;
  try { files = (await readdir(base)).filter((name) => name.endsWith('.json')).sort().reverse(); }
  catch { return null; }
  for (const name of files) {
    const relativePath = path.join('.tmp', 'atlas', 'workspace-snapshot-scratch-v1', 'currentness-reconciliation', name);
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      verifyWorkspaceCurrentnessReconciliationReceiptV1(receipt);
      const { receiptChecksum, ...body } = receipt;
      return {
        path: relativePath,
        artifactSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        receiptChecksum,
        generatedAt: receipt.generatedAt,
        ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(receipt.generatedAt)) / 1000)),
        admittedSnapshotRevision: receipt.admission.snapshotRevision,
        admittedSourceCount: receipt.liveByteReadback.admittedSnapshot.sourceCount,
        admittedExactMatches: receipt.liveByteReadback.admittedSnapshot.exactMatches,
        admittedChangedSources: receipt.liveByteReadback.admittedSnapshot.violationCount,
        scratchSnapshotRevision: receipt.latestScratchFrame.snapshotRevision,
        scratchSourceCount: receipt.liveByteReadback.latestScratchFrame.sourceCount,
        scratchExactMatches: receipt.liveByteReadback.latestScratchFrame.exactMatches,
        scratchChangedSources: receipt.liveByteReadback.latestScratchFrame.violationCount,
        exactIdentityOverlap: receipt.manifestComparison.exactIdentityOverlap,
        differingDigests: receipt.manifestComparison.exactContentMismatches,
        addedSinceAdmission: receipt.manifestComparison.scratchAddedSinceAdmission,
        currentnessVerdict: receipt.verdict.firstFailingBoundary,
        writesPerformed: receipt.verdict.persistentWrites,
      };
    } catch {}
  }
  return null;
}

async function readLatestVerifiedValkeyCensus() {
  const base = path.join(root, '.tmp', 'atlas', 'valkey-census');
  let files;
  try { files = (await readdir(base)).filter((name) => name.startsWith('valkey-key-census-') && name.endsWith('.json')).sort().reverse(); }
  catch { return null; }
  for (const name of files) {
    const relativePath = path.join('.tmp', 'atlas', 'valkey-census', name);
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      verifyValkeyKeyCensusReceiptV1(receipt);
      return {
        path: relativePath,
        artifactSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        receiptChecksum: receipt.receiptChecksum,
        generatedAt: receipt.generatedAt,
        scannedKeys: receipt.keyspace.scannedKeys,
        namespaces: Object.keys(receipt.namespaces).length,
        ttlSampleSize: receipt.ttl.sampleSize,
        ttlWithout: receipt.ttl.withoutTtl,
        ttlWithoutByNamespace: receipt.ttl.withoutTtlByNamespace,
        maxmemoryPolicy: receipt.memory.maxmemoryPolicy,
        serverWideHitRatio: receipt.counters.hitRatio,
        canonicalAuthority: receipt.canonicalAuthority,
        writesPerformed: receipt.writesPerformed,
      };
    } catch {}
  }
  return null;
}

async function readLatestVerifiedDomainCrosswalk() {
  const base = path.join(root, '.tmp', 'atlas', 'domain-crosswalk-census');
  let runs;
  try { runs = (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse(); }
  catch { return null; }
  for (const runId of runs) {
    const relativePath = path.join('.tmp', 'atlas', 'domain-crosswalk-census', runId, 'receipt.json');
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      verifyDomainVocabularyCrosswalkReceiptV2(receipt);
      if (!receipt.sourceArtifacts) continue;
      for (const artifact of Object.values(receipt.sourceArtifacts)) {
        const resolved = path.resolve(root, artifact.path);
        if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('CROSSWALK_SOURCE_PATH_OUTSIDE_REPOSITORY');
        const sourceBytes = await readFile(resolved);
        if (`sha256:${createHash('sha256').update(sourceBytes).digest('hex')}` !== artifact.sha256) {
          throw new Error('CROSSWALK_SOURCE_ARTIFACT_DIGEST_MISMATCH');
        }
      }
      const sourceRowsDigest = `sha256:${sha256CanonicalDomainCrosswalkV2({
        crosswalkRows: receipt.legacyJoinRows,
        packetLabelRows: receipt.packetRowsByLabel,
      })}`;
      if (sourceRowsDigest !== receipt.sourceRowsDigestSha256) throw new Error('CROSSWALK_SOURCE_ROWS_DIGEST_MISMATCH');
      return {
        path: relativePath,
        artifactSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        receiptChecksum: receipt.checksumSha256,
        sourceRowsDigest: receipt.sourceRowsDigestSha256,
        sourceArtifactCount: Object.keys(receipt.sourceArtifacts).length,
        codeDomainCount: receipt.codeTaxonomy?.canonicalDomainIds?.length ?? null,
        codeDomainsWithoutExactGroupId: receipt.codeTaxonomy?.canonicalDomainsWithoutExactOkfGroupId ?? [],
        aliasReviewCount: receipt.codeTaxonomy?.legacyAliases?.filter((row) => row.disposition === 'REVIEW_REQUIRED').length ?? null,
        semanticCrosswalk: receipt.semanticCrosswalk,
        canonicalAuthority: receipt.canonicalAuthority,
        mappingsApplied: receipt.mappingsApplied,
        persistentWrites: receipt.persistentWrites,
      };
    } catch {}
  }
  return null;
}

async function readLatestFirecrawlSmoke() {
  const base = path.join(root, '.tmp', 'atlas', 'firecrawl-smoke');
  let files;
  try { files = (await readdir(base)).filter((name) => name.endsWith('.json')); }
  catch { return null; }
  const valid = [];
  for (const name of files) {
    const relativePath = path.join('.tmp', 'atlas', 'firecrawl-smoke', name);
    try {
      const bytes = await readFile(path.join(root, relativePath));
      const receipt = JSON.parse(bytes.toString('utf8'));
      const contentPath = path.resolve(root, receipt.contentArtifact?.path ?? '');
      const rawBase = `${path.resolve(root, '.tmp', 'atlas', 'firecrawl-smoke', 'raw')}${path.sep}`;
      if (!contentPath.startsWith(rawBase)) continue;
      const contentBytes = await readFile(contentPath);
      verifyFirecrawlSinglePageSmokeReceiptV1(receipt, contentBytes);
      valid.push({ relativePath, bytes, contentBytes, receipt });
    } catch {}
  }
  valid.sort((left, right) => right.receipt.capturedAt.localeCompare(left.receipt.capturedAt));
  const latest = valid[0];
  if (!latest) return null;
  return {
    path: latest.relativePath,
    artifactSha256: createHash('sha256').update(latest.bytes).digest('hex'),
    receiptSha256: latest.receipt.receiptSha256,
    contentArtifactPath: latest.receipt.contentArtifact.path,
    contentArtifactSha256: latest.receipt.contentArtifact.sha256,
    requestId: latest.receipt.requestId,
    sourceURL: latest.receipt.observed.sourceURL,
    title: latest.receipt.observed.title,
    statusCode: latest.receipt.observed.statusCode,
    contentSha256: latest.receipt.observed.contentSha256,
    contentBytes: latest.receipt.observed.contentBytes,
    scrapeId: latest.receipt.observed.scrapeId,
    sourceIdentity: latest.receipt.authority.sourceIdentity,
    contentBodyPersisted: true,
  };
}

async function httpStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return `HTTP_${response.status}`;
  } catch {
    return 'UNAVAILABLE';
  }
}

function runTests(args, cwd, countPattern) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return summarizeTestProcessResultV1(result, countPattern);
}

async function runRedisReadOnly() {
  const health = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', 'legal-ai-valkey'], {
    encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
  });
  const containerHealth = health.status === 0 ? health.stdout.trim() : 'UNAVAILABLE';
  const require = createRequire(path.join(root, 'package.json'));
  const dotenv = require('dotenv');
  const rootEnv = dotenv.parse(readFileSync(path.join(root, '.env')));
  for (const key of ['VALKEY_URL', 'REDIS_URL', 'VALKEY_PASSWORD', 'REDIS_PASSWORD', 'REDIS_HOST', 'REDIS_PORT']) {
    if (process.env[key] === undefined && rootEnv[key] !== undefined) process.env[key] = rootEnv[key];
  }
  const Redis = require('ioredis');
  const configuredUrl = process.env.VALKEY_URL ?? process.env.REDIS_URL
    ?? `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? '6379'}`;
  const connectionUrl = new URL(configuredUrl);
  if (!connectionUrl.password) connectionUrl.password = process.env.VALKEY_PASSWORD ?? process.env.REDIS_PASSWORD ?? '';
  const client = new Redis(connectionUrl.toString(), {
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  client.on('error', () => {});
  const namespacePatterns = VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1;
  let modules = null;
  let moduleRead = 'NOT_RUN';
  const namespaceCounts = [];
  let connected = false;
  let detailCode = null;
  try {
    await client.connect();
    connected = true;
    try {
      const rows = await client.call('MODULE', 'LIST');
      modules = Array.isArray(rows) ? rows.map((row) => {
        const values = Array.isArray(row) ? row : [];
        const fields = {};
        for (let index = 0; index + 1 < values.length; index += 2) fields[String(values[index])] = values[index + 1];
        return { name: String(fields.name ?? ''), version: String(fields.ver ?? '') };
      }) : [];
      moduleRead = 'PASS';
    } catch (error) {
      moduleRead = 'UNAVAILABLE';
      detailCode = error.code ?? 'MODULE_LIST_FAILED';
    }
    for (const pattern of namespacePatterns) {
      let cursor = '0';
      let keyCount = 0;
      let pages = 0;
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = String(result[0]);
        keyCount += result[1].length;
        pages += 1;
        if (pages >= 2_000 && cursor !== '0') break;
      } while (cursor !== '0');
      namespaceCounts.push({ pattern, keyCount, complete: cursor === '0', pages });
    }
  } catch (error) {
    detailCode = error.code ?? 'READ_ONLY_VALKEY_PROBE_FAILED';
  } finally {
    client.disconnect();
  }
  const namespaceScanComplete = namespaceCounts.length === namespacePatterns.length
    && namespaceCounts.every((entry) => entry.complete);
  const centroidKeyCount = namespaceCounts
    .filter((entry) => ['corpus:centroids:*', 'taxonomy:clusters:*'].includes(entry.pattern))
    .reduce((total, entry) => total + entry.keyCount, 0);
  const topologyCacheKeyCount = namespaceCounts.find((entry) => entry.pattern === 'gpu:karpathy:encoded')?.keyCount ?? null;
  return {
    status: connected && namespaceScanComplete ? 'READ_ONLY_CAPABILITIES_VERIFIED' : containerHealth === 'healthy' ? 'CONTAINER_HEALTHY_CAPABILITY_PROBE_INCOMPLETE' : containerHealth.toUpperCase(),
    invocation: `MODULE_LIST_${moduleRead};NAMESPACE_SCAN_${namespaceScanComplete ? 'PASS' : 'INCOMPLETE'}`,
    containerHealth,
    moduleRead,
    modules,
    moduleCount: modules?.length ?? null,
    centroidScan: namespaceScanComplete ? 'PASS' : 'INCOMPLETE',
    centroidKeyCount,
    topologyCacheKeyCount,
    namespaceCounts,
    detailCode: detailCode ?? (health.error?.code ?? (health.status === 0 ? null : 'DOCKER_INSPECT_FAILED')),
  };
}

function readPostgresTaxonomyState() {
  const sql = `BEGIN READ ONLY; SELECT json_build_object('serverVersion', current_setting('server_version'), 'database', current_database(), 'ontology', (SELECT coalesce(json_agg(json_build_object('groupId', group_id, 'groupLabel', group_label, 'parentGroupId', parent_group_id, 'taxonomyLevel', taxonomy_level) ORDER BY group_id), '[]'::json) FROM public.atlas_domain_ontology), 'legacyTaxonomy', (SELECT coalesce(json_agg(json_build_object('domainId', domain_id, 'label', label, 'parentDomainId', parent_domain_id) ORDER BY domain_id), '[]'::json) FROM public.domain_taxonomy_v1), 'keywordCorpusRelation', coalesce(to_regclass('public.keyword_corpus')::text, 'MISSING'))::text; ROLLBACK;`;
  const result = spawnSync('docker', [
    'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-X',
    '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql,
  ], { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (result.status !== 0) return { status: 'UNAVAILABLE', detailCode: result.error?.code ?? 'READ_ONLY_QUERY_FAILED' };
  try {
    const row = `${result.stdout ?? ''}`.split(/\r?\n/).find((line) => line.startsWith('{'));
    if (!row) return { status: 'INVALID_READBACK', detailCode: 'JSON_ROW_MISSING' };
    const census = JSON.parse(row);
    if (!/^18\./.test(census.serverVersion) || !Array.isArray(census.ontology)
      || !Array.isArray(census.legacyTaxonomy) || typeof census.keywordCorpusRelation !== 'string') {
      return { status: 'INVALID_READBACK', detailCode: 'CENSUS_SHAPE_INVALID' };
    }
    const require = createRequire(path.join(root, 'sveltekit-frontend/package.json'));
    const yaml = require('js-yaml');
    const taxonomy = yaml.load(readFileSync(path.join(root, '.okf', 'domains', 'atlas-domain-taxonomy.yaml'), 'utf8'));
    const crosswalk = compareOkfTaxonomyWithPostgresV1(taxonomy.groups, census.ontology, census.legacyTaxonomy);
    return {
      status: 'READ_ONLY_PASS',
      serverVersion: census.serverVersion,
      database: census.database,
      atlasDomainOntologyRows: census.ontology.length,
      domainTaxonomyRows: census.legacyTaxonomy.length,
      keywordCorpusRelation: census.keywordCorpusRelation,
      crosswalk,
    };
  } catch {
    return { status: 'INVALID_READBACK', detailCode: 'JSON_PARSE_FAILED' };
  }
}

function check(owner, registration, serviceHealth, invocation, evidenceValidity, evidenceRefs, firstFailingBoundary = null, probeDetails = null) {
  return { owner, registration, serviceHealth, invocation, evidenceValidity, evidenceRefs, firstFailingBoundary, probeDetails };
}

const [appHealth, couchDbHealth, mastraPackage, mastraTool, mastraAgent, mastraWorkflowSource, mastraAdapterSource, aguiPackage, otelSource, firecrawlSource, keywordMcpTool,
  hyperragSource, contextRuntime, nesPalette, redisOwner, centroidOwner, topkSpec, evidenceSpec] = await Promise.all([
  probeReadOnlyListenerV1(process.env.ATLAS_APP_HEALTH_URL ?? 'http://127.0.0.1:5173', timeoutMs),
  httpStatus(process.env.ATLAS_COUCHDB_HEALTH_URL ?? 'http://127.0.0.1:5984/_up'),
  read('packages/atlas-orchestrator/package.json'),
  read('packages/atlas-orchestrator/src/tools/verified-context-tool.ts'),
  read('packages/atlas-orchestrator/src/models/prompt-plan-agent.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts'),
  read('sveltekit-frontend/package.json'),
  read('sveltekit-frontend/src/lib/server/observability/opentelemetry.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts'),
  read('sveltekit-frontend/src/mcp/atlas-keyword-corpus-tools.ts'),
  read('sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/execution/verified-context-runtime-v1.ts'),
  read('scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs'),
  read('sveltekit-frontend/src/lib/server/redis.ts'),
  read('sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/execution/search-runtime-topk-caller-v1.spec.ts'),
  read('sveltekit-frontend/src/lib/server/atlas/execution/topk-evidence-pipeline-v1.spec.ts'),
]);

const orchestratorPackage = mastraPackage ? JSON.parse(mastraPackage) : {};
const frontendPackage = aguiPackage ? JSON.parse(aguiPackage) : {};
const mastraRegistration = classifyMastraToolRegistrationV1({
  toolContractPresent: Boolean(mastraTool && mastraAgent && orchestratorPackage.dependencies?.['@mastra/core']),
  appRuntimeImportPresent: /from\s+['"](?:@mastra\/core|@deeds\/atlas-orchestrator)/.test(`${mastraWorkflowSource ?? ''}\n${mastraAdapterSource ?? ''}`),
  agentToolBindingPresent: /tools\s*:\s*\{[^}]*atlas\.verified_context/s.test(mastraAgent ?? ''),
});
const appUp = appHealth === 'LISTENER_REACHABLE';
const couchDbUp = couchDbHealth === 'HTTP_200';
const offlineTests = runTests([
  '--test',
  'scripts/atlas/lib/couchdb-changes-export-v1.test.mjs',
  'scripts/atlas/lib/couchdb-offline-batch-v1.test.mjs',
  'scripts/atlas/lib/couchdb-duckdb-kanban-rollup-v1.test.mjs',
  'scripts/atlas/lib/couchdb-kanban-rollup-cpu-oracle-v1.test.mjs',
], root, /# tests (\d+)/);
const nesTests = runTests([
  '--test', 'scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.test.mjs',
], root, /# tests (\d+)/);
const contextTests = runTests([
  vitestEntry, 'run',
  'src/lib/server/atlas/execution/verified-context-service-v1.spec.ts',
  'src/lib/server/atlas/execution/verified-context-runtime-v1.spec.ts',
  'src/lib/server/trpc/routers/search.verified-context.spec.ts',
  'src/lib/server/atlas/mastra-agent-route.spec.ts',
  'src/lib/server/atlas/execution/search-runtime-topk-caller-v1.spec.ts',
  'src/lib/server/atlas/execution/topk-evidence-pipeline-v1.spec.ts',
  '--reporter=dot',
], path.join(root, 'sveltekit-frontend'), /Tests\s+(\d+) passed/);
const mastraTests = runTests([
  vitestEntry, 'run',
  'src/tools/verified-context-tool.spec.ts',
  'src/models/prompt-plan-agent.spec.ts',
  '--reporter=dot',
], path.join(root, 'packages', 'atlas-orchestrator'), /Tests\s+(\d+) passed/);
const firecrawlLineageTests = runTests([
  vitestEntry, 'run',
  'src/lib/server/atlas/docs/firecrawl-v2-capture.spec.ts',
  'src/lib/server/atlas/docs/external-doc-acquisition-handoff-v1.spec.ts',
  'src/lib/server/atlas/docs/external-doc-intelligence.spec.ts',
  'src/lib/server/atlas/docs/external-doc-retrieval-port.spec.ts',
  '--reporter=dot',
], path.join(root, 'sveltekit-frontend'), /Tests\s+(\d+) passed/);
const mcpCorpusTests = runTests([
  vitestEntry, 'run',
  'src/mcp/atlas-keyword-corpus-tools.spec.ts',
  'src/lib/server/atlas/keyword-corpus-search-v1.spec.ts',
  '--reporter=dot',
], path.join(root, 'sveltekit-frontend'), /Tests\s+(\d+) passed/);
const okfTaxonomyTests = runTests([
  '--test', 'scripts/atlas/lib/okf-domain-taxonomy-tie.test.mjs',
], root, /# tests (\d+)/);
const redisProbe = await runRedisReadOnly();
const postgresTaxonomy = readPostgresTaxonomyState();
const domainCrosswalk = await readLatestVerifiedDomainCrosswalk();
const kanbanReplay = await readLatestVerifiedKanbanReplay();
const postgresMessagePackChain = await readLatestVerifiedPostgresMessagePackChain();
const mastraRouteReadback = await readLatestMastraRouteReadback();
const workspaceCurrentness = await readLatestWorkspaceCurrentnessReconciliation();
const valkeyCensus = await readLatestVerifiedValkeyCensus();
const firecrawlLiveReadback = await readLatestFirecrawlSmoke();
const checks = [
  check('sveltekit-health', 'REGISTERED', appUp ? 'LISTENER_REACHABLE' : appHealth, 'TCP_CONNECT_ONLY;HTTP_ROUTE_NOT_CALLED', 'NOT_EVIDENCE_AUTHORITY', ['scripts/atlas/agent-integration-smoke-v1.mjs', 'sveltekit-frontend/src/routes/api/health/+server.ts']),
  check('couchdb-health', 'REGISTERED', couchDbUp ? 'AVAILABLE' : couchDbHealth, couchDbHealth, 'NOT_EVIDENCE_AUTHORITY', ['sveltekit-frontend/src/lib/server/config/couchdb-config.ts']),
  check('mastra-tool-agent', mastraRegistration, 'NOT_PROBED', `SYNTHESIS_DISABLED;FIXTURES_${mastraTests.status};TESTS_${mastraTests.testCount ?? 'UNKNOWN'}`, 'FIXTURE_ONLY', ['packages/atlas-orchestrator/src/tools/verified-context-tool.ts', 'packages/atlas-orchestrator/src/models/prompt-plan-agent.ts', 'sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts'], null, { testProcess: mastraTests }),
  check('copilotkit-ag-ui', frontendPackage.dependencies?.['@ag-ui/mastra'] || frontendPackage.dependencies?.['@copilotkit/runtime'] ? 'REGISTERED' : 'NOT_FOUND', 'NOT_CONFIGURED', 'NOT_INVOKED', 'NOT_VERIFIED', ['sveltekit-frontend/package.json']),
  check('opentelemetry-export-readback', otelSource ? 'OWNER_PRESENT' : 'NOT_FOUND', mastraRouteReadback ? 'LANGFUSE_API_READBACK_AVAILABLE' : 'NOT_VERIFIED', mastraRouteReadback ? `ROUTE_REFUSAL_${mastraRouteReadback.routeStatus};TRACE_${mastraRouteReadback.traceReadbackVerdict === 'REQUEST_TRACE_READBACK_VERIFIED' ? 'READBACK_VERIFIED' : 'NOT_FOUND'};MATCHES_${mastraRouteReadback.matchingRequestObservations};${mastraRouteReadback.requestId === requestId ? 'SMOKE_CORRELATION_VERIFIED' : 'SMOKE_CORRELATION_NOT_PROPAGATED'}` : `ROUTE_OUTCOME_SPAN_FIXTURE_${contextTests.status};TESTS_${contextTests.testCount ?? 'UNKNOWN'};EXPORT_READBACK_NOT_RUN`, mastraRouteReadback ? (mastraRouteReadback.traceReadbackVerdict === 'REQUEST_TRACE_READBACK_VERIFIED' ? 'TRACE_READBACK_VERIFIED' : 'REQUEST_TRACE_NOT_FOUND') : 'TELEMETRY_READBACK_NOT_VERIFIED', [
    'sveltekit-frontend/src/lib/server/observability/opentelemetry.ts',
    'sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts',
    ...(mastraRouteReadback ? [{ path: mastraRouteReadback.path, receiptChecksum: mastraRouteReadback.receiptChecksum, artifactSha256: mastraRouteReadback.artifactSha256 }] : []),
  ], mastraRouteReadback && mastraRouteReadback.traceReadbackVerdict !== 'REQUEST_TRACE_READBACK_VERIFIED' ? 'OTEL_REQUEST_TRACE_READBACK' : mastraRouteReadback && mastraRouteReadback.requestId !== requestId ? 'SMOKE_CORRELATION_NOT_PROPAGATED' : null, mastraRouteReadback ? {
    smokeCorrelationId: requestId,
    routeRequestId: mastraRouteReadback.requestId,
    relationship: mastraRouteReadback.requestId === requestId ? 'SAME_REQUEST' : 'INDEPENDENT_ROUTE_REFUSAL',
    routeStatus: mastraRouteReadback.routeStatus,
    refusalCode: mastraRouteReadback.refusalCode,
    routeFirstFailingBoundary: mastraRouteReadback.firstFailingBoundary,
    agentExecutionStatus: mastraRouteReadback.agentExecutionStatus,
    traceReadbackVerdict: mastraRouteReadback.traceReadbackVerdict,
    tracesScanned: mastraRouteReadback.tracesScanned,
    traceId: mastraRouteReadback.traceId,
    matchingRequestObservations: mastraRouteReadback.matchingRequestObservations,
    matchingObservationIds: mastraRouteReadback.matchingObservationIds,
    writesPerformed: mastraRouteReadback.writesPerformed,
  } : { spanAttributesFixture: contextTests.status, testProcess: contextTests, exporterReadback: 'NOT_RUN' }),
  check('firecrawl', firecrawlSource ? 'OWNER_PRESENT' : 'NOT_FOUND', firecrawlLiveReadback ? 'LIVE_SINGLE_PAGE_FETCHED' : 'NOT_PROBED', firecrawlLiveReadback ? `LIVE_HTTP_200;RAW_SCRATCH_DIGEST_REHASHED;APP_ARCHIVE_NOT_INVOKED;LINEAGE_FIXTURES_${firecrawlLineageTests.status};TESTS_${firecrawlLineageTests.testCount ?? 'UNKNOWN'}` : `CAPTURE_NOT_INVOKED_NO_APPROVED_FIXTURE_URL;LINEAGE_FIXTURES_${firecrawlLineageTests.status};TESTS_${firecrawlLineageTests.testCount ?? 'UNKNOWN'}`, firecrawlLiveReadback ? 'LIVE_CONTENT_BYTES_REHASHED_UNBOUND' : 'FIXTURE_ONLY', [
    'sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts',
    'sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.spec.ts',
    'sveltekit-frontend/src/lib/server/atlas/docs/external-doc-acquisition-handoff-v1.spec.ts',
    'sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence.spec.ts',
    'sveltekit-frontend/src/lib/server/atlas/docs/external-doc-retrieval-port.spec.ts',
    ...(firecrawlLiveReadback ? [{ path: firecrawlLiveReadback.path, artifactSha256: firecrawlLiveReadback.artifactSha256, receiptSha256: firecrawlLiveReadback.receiptSha256 }] : []),
  ], firecrawlLiveReadback ? 'SOURCE_IDENTITY_BINDING' : null, firecrawlLiveReadback ? {
    requestId: firecrawlLiveReadback.requestId,
    sourceURL: firecrawlLiveReadback.sourceURL,
    title: firecrawlLiveReadback.title,
    statusCode: firecrawlLiveReadback.statusCode,
    contentSha256: firecrawlLiveReadback.contentSha256,
    contentBytes: firecrawlLiveReadback.contentBytes,
    contentArtifactPath: firecrawlLiveReadback.contentArtifactPath,
    contentArtifactSha256: firecrawlLiveReadback.contentArtifactSha256,
    scrapeId: firecrawlLiveReadback.scrapeId,
    sourceIdentity: firecrawlLiveReadback.sourceIdentity,
    contentBodyPersisted: firecrawlLiveReadback.contentBodyPersisted,
    contentDigestIndependentlyRehashed: true,
    appArchiveInvoked: false,
    canonicalAuthority: false,
    writesPerformed: false,
  } : null),
  check('mcp-okf-reference-corpus', keywordMcpTool ? 'REGISTERED' : 'NOT_FOUND', postgresTaxonomy.status, `READ_ONLY_HANDLER_FIXTURES_${mcpCorpusTests.status};TESTS_${mcpCorpusTests.testCount ?? 'UNKNOWN'};OKF_SCHEMA_FIXTURES_${okfTaxonomyTests.status};TESTS_${okfTaxonomyTests.testCount ?? 'UNKNOWN'};POSTGRES_CENSUS_${postgresTaxonomy.status}`, 'FIXTURE_ONLY_NOT_CORPUS_ADMISSION', [
    'sveltekit-frontend/src/mcp/atlas-keyword-corpus-tools.ts',
    'sveltekit-frontend/src/mcp/atlas-keyword-corpus-tools.spec.ts',
    'sveltekit-frontend/src/lib/server/atlas/keyword-corpus-search-v1.spec.ts',
    'scripts/atlas/lib/okf-domain-taxonomy-tie.test.mjs',
    '.okf/corpora/keyword-corpus.yaml',
    '.okf/domains/atlas-domain-taxonomy.yaml',
    ...(domainCrosswalk ? [{ path: domainCrosswalk.path, receiptChecksum: domainCrosswalk.receiptChecksum, artifactSha256: domainCrosswalk.artifactSha256 }] : []),
  ], domainCrosswalk ? null : 'DOMAIN_CROSSWALK_RECEIPT_NOT_VERIFIED', { postgresTaxonomy, domainCrosswalk }),
  check('hyperrag-searchruntime', hyperragSource ? 'REGISTERED' : 'NOT_FOUND', 'NOT_PROBED', 'SKIPPED_WORKSPACE_AUTHORITY', 'NOT_ADMITTED', ['sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts'], 'WORKSPACE_AUTHORITY'),
  check('verified-context', contextRuntime ? 'REGISTERED_FAIL_CLOSED' : 'NOT_FOUND', appUp ? 'APP_AVAILABLE' : 'APP_UNAVAILABLE', 'SYNTHESIS_NOT_INVOKED', 'NOT_ADMITTED', ['sveltekit-frontend/src/lib/server/atlas/execution/verified-context-runtime-v1.ts'], 'WORKSPACE_AUTHORITY'),
  check('workspace-source-currentness', 'EXISTING_READBACK_VALIDATOR', workspaceCurrentness ? 'READBACK_RECEIPT_VERIFIED' : 'READBACK_NOT_FOUND', workspaceCurrentness ? `RECORDED_AT_${workspaceCurrentness.generatedAt};AGE_SECONDS_${workspaceCurrentness.ageSeconds};ADMITTED_CHANGED_${workspaceCurrentness.admittedChangedSources};SCRATCH_CHANGED_${workspaceCurrentness.scratchChangedSources};NOT_AN_AUTHORITY_GRANT` : 'CURRENTNESS_READBACK_NOT_AVAILABLE', 'CURRENT_SOURCE_DRIFT', workspaceCurrentness ? [{ path: workspaceCurrentness.path, receiptChecksum: workspaceCurrentness.receiptChecksum, artifactSha256: workspaceCurrentness.artifactSha256 }] : ['scripts/atlas/lib/workspace-snapshot-capture-v1.mts'], workspaceCurrentness ? 'CURRENT_SOURCE_DRIFT' : 'CURRENTNESS_READBACK_NOT_AVAILABLE', workspaceCurrentness ?? { authorityGranted: false, writesPerformed: 0 }),
  check('nes-palette', nesPalette ? 'OWNER_PRESENT' : 'NOT_FOUND', 'NOT_APPLICABLE', `FIXTURES_${nesTests.status};TESTS_${nesTests.testCount ?? 'UNKNOWN'}`, 'FIXTURE_ONLY', ['scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs']),
  check('redis-valkey-capabilities', redisOwner ? 'CLIENT_OWNER_PRESENT' : 'NOT_FOUND', redisProbe.status, `${redisProbe.invocation};TTL_CENSUS_${valkeyCensus ? 'VERIFIED' : 'NOT_FOUND'}`, 'NOT_VERIFIED', ['sveltekit-frontend/src/lib/server/cache/valkey-client.ts', ...(valkeyCensus ? [{ path: valkeyCensus.path, receiptChecksum: valkeyCensus.receiptChecksum, artifactSha256: valkeyCensus.artifactSha256 }] : [])], null, { containerHealth: redisProbe.containerHealth, moduleRead: redisProbe.moduleRead, modules: redisProbe.modules, namespaceCounts: redisProbe.namespaceCounts, centroidKeyCount: redisProbe.centroidKeyCount ?? null, topologyCacheKeyCount: redisProbe.topologyCacheKeyCount ?? null, failedCommand: redisProbe.detailCode ?? null, census: valkeyCensus ?? { firstFailingBoundary: 'VALKEY_CENSUS_RECEIPT' } }),
  check('centroid-retrieval', centroidOwner ? 'OWNER_PRESENT' : 'NOT_FOUND', 'NOT_INVOKED_UNQUALIFIED', 'QUERY_SKIPPED_NO_REVISION_BOUND_VECTOR;CACHE_MISS_PATH_MAY_POPULATE_VALKEY', 'NOT_VERIFIED', [
    'sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts',
    'sveltekit-frontend/src/lib/server/cache-keys.ts',
  ], 'CENTROID_REPRESENTATION_LINEAGE', {
    centroidCacheKeys: redisProbe.namespaceCounts?.filter((entry) => ['corpus:centroids:*', 'taxonomy:clusters:*'].includes(entry.pattern)) ?? [],
    topologyMetadataKeyCount: redisProbe.topologyCacheKeyCount ?? null,
    apiAcceptsRepresentationRevision: false,
    resultCarriesIndexRevision: false,
    nearestClusterColdPathMayWrite: Boolean(centroidOwner && /await\s+loadCentroidsFromDB\s*\(/.test(centroidOwner)),
  }),
  check('topk-source-evidence', topkSpec && evidenceSpec ? 'FIXTURE_TESTS_PRESENT' : 'NOT_FOUND', 'NOT_APPLICABLE', `FIXTURES_${contextTests.status};TESTS_${contextTests.testCount ?? 'UNKNOWN'}`, 'FIXTURE_ONLY', ['sveltekit-frontend/src/lib/server/atlas/execution/search-runtime-topk-caller-v1.spec.ts', 'sveltekit-frontend/src/lib/server/atlas/execution/topk-evidence-pipeline-v1.spec.ts'], 'WORKSPACE_AUTHORITY', { testProcess: contextTests }),
  check('offline-couchdb-duckdb', 'EXISTING_REPLAY_OWNER', 'NOT_APPLICABLE', `LIVE_RECEIPT_${kanbanReplay ? 'VERIFIED' : 'NOT_FOUND'};FIXTURES_${offlineTests.status};TESTS_${offlineTests.testCount ?? 'UNKNOWN'}`, 'DIAGNOSTIC_ONLY_NOT_ADMITTED', [
    'scripts/atlas/lib/couchdb-changes-export-v1.test.mjs',
    'scripts/atlas/lib/couchdb-duckdb-kanban-rollup-v1.test.mjs',
    ...(kanbanReplay ? [{ path: kanbanReplay.path, receiptChecksum: kanbanReplay.receiptChecksum, artifactSha256: kanbanReplay.artifactSha256 }] : []),
  ], null, kanbanReplay ? {
    runId: kanbanReplay.runId,
    pageCount: kanbanReplay.pageCount,
    changeCount: kanbanReplay.changeCount,
    liveDocumentCount: kanbanReplay.liveDocumentCount,
    tombstoneCount: kanbanReplay.tombstoneCount,
    conflictCount: kanbanReplay.conflictCount,
    sourceReferenceCount: kanbanReplay.sourceReferenceCount,
    canonicalAuthority: kanbanReplay.canonicalAuthority,
    sourceAdmission: kanbanReplay.sourceAdmission,
    persistentWrites: kanbanReplay.persistentWrites,
    telemetry: kanbanReplay.telemetry,
  } : { firstFailingBoundary: 'LIVE_REPLAY_RECEIPT' }),
  check('offline-postgres-msgpack-diagnostic', 'EXISTING_DIAGNOSTIC_CHAIN_OWNER', 'NOT_APPLICABLE', `LIVE_RECEIPT_${postgresMessagePackChain.status}`, postgresMessagePackChain.status === 'VERIFIED' ? 'DIGEST_VERIFIED' : 'NOT_VERIFIED', [
    'scripts/atlas/omr-msgpack-e2e-v1.mts',
    'scripts/atlas/omr-duckdb-reduce-v1.mjs',
    'sveltekit-frontend/src/lib/server/atlas/transport/messagepack-transport-v1.ts',
    ...(postgresMessagePackChain.status === 'VERIFIED' ? [
      { path: postgresMessagePackChain.path, receiptChecksum: postgresMessagePackChain.receiptChecksum, artifactSha256: postgresMessagePackChain.artifactSha256 },
      { path: postgresMessagePackChain.snapshotPath, digest: postgresMessagePackChain.snapshotDigest },
      { path: postgresMessagePackChain.snapshotReceiptPath, digest: postgresMessagePackChain.snapshotReceiptDigest },
      { path: postgresMessagePackChain.reduceReceiptPath, digest: postgresMessagePackChain.reduceReceiptDigest },
      { path: postgresMessagePackChain.reduceOutputPath, digest: postgresMessagePackChain.reduceOutputDigest },
      { path: postgresMessagePackChain.descriptorPath, digest: postgresMessagePackChain.descriptorDigest },
    ] : []),
  ], postgresMessagePackChain.status === 'VERIFIED' ? null : 'POSTGRES_MSGPACK_DIAGNOSTIC_READBACK', postgresMessagePackChain.status === 'VERIFIED' ? {
    runId: postgresMessagePackChain.runId,
    snapshotRows: postgresMessagePackChain.snapshotRows,
    uniquePacketKeys: postgresMessagePackChain.uniquePacketKeys,
    sourceQualifiedRows: postgresMessagePackChain.sourceQualifiedRows,
    excludedMissingSourceRevision: postgresMessagePackChain.excludedMissingSourceRevision,
    qualifiedRows: postgresMessagePackChain.qualifiedRows,
    distinctFeatures: postgresMessagePackChain.distinctFeatures,
    descriptorByteLength: postgresMessagePackChain.descriptorByteLength,
    packetKey: postgresMessagePackChain.packetKey,
    telemetry: postgresMessagePackChain.telemetry,
    canonicalAuthority: postgresMessagePackChain.canonicalAuthority,
    writesPerformed: postgresMessagePackChain.writesPerformed,
  } : { detailCode: postgresMessagePackChain.detailCode ?? 'OMR_RECEIPT_NOT_FOUND' }),
];

const blockedEvidence = checks.some((entry) => entry.evidenceValidity === 'NOT_ADMITTED');
const receipt = buildAgentIntegrationSmokeReceiptV1({
  requestId,
  capturedAt: new Date().toISOString(),
  checks,
  serviceHealth: 'PARTIAL',
  agentExecutionStatus: 'NOT_STARTED',
  canonicalEvidenceValidity: blockedEvidence ? 'NOT_ADMITTED' : 'NOT_VERIFIED',
  firstFailingBoundary: blockedEvidence ? 'WORKSPACE_AUTHORITY' : 'NOT_VERIFIED',
});
verifyAgentIntegrationSmokeReceiptV1(receipt);

const directory = path.join(root, '.tmp', 'atlas', 'agent-integration-smoke');
await mkdir(directory, { recursive: true });
const filePath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
const handle = await open(filePath, 'wx');
try {
  await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await handle.sync();
} finally {
  await handle.close();
}
process.stdout.write(`${JSON.stringify({ path: path.relative(root, filePath), requestId, checksumSha256: receipt.checksumSha256, serviceHealth: receipt.serviceHealth, agentExecutionStatus: receipt.agentExecutionStatus, canonicalEvidenceValidity: receipt.canonicalEvidenceValidity, firstFailingBoundary: receipt.firstFailingBoundary })}\n`);
