#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_FILE_BYTES = 1_000_000;
const MAX_EVIDENCE_PER_FEATURE = 40;
const ROOTS = [
  'scripts',
  'sveltekit-frontend/src',
  'sveltekit-frontend/scripts',
  'packages',
  'services',
  'openspec',
  'docker',
  '.okf',
  'docs/architecture',
];
const EXTENSIONS = new Set([
  '.cjs', '.go', '.js', '.json', '.md', '.mjs', '.mts', '.py', '.rs',
  '.svelte', '.sql', '.ts', '.tsx', '.yaml', '.yml',
]);
const IGNORED = /(^|[\\/])(node_modules|\.git|\.svelte-kit|dist|build|coverage|target|vendor)([\\/]|$)/i;
const STRUCTURAL_CALLS = [
  { id: 'routeQuery', pattern: 'routeQuery($$$ARGS)' },
  { id: 'buildRetrievalPlan', pattern: 'buildRetrievalPlan($$$ARGS)' },
  { id: 'selectMcpToolSubset', pattern: 'selectMcpToolSubset($$$ARGS)' },
  { id: 'requestAcquisition', pattern: 'requestAcquisition($$$ARGS)' },
];
const FEATURES = [
  { capability: 'lexical_exact', aliases: ['lexical[_ -]?exact', 'exact[_ -]?match', 'exact[_ -]?cache'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'lexical_fts', aliases: ['lexical[_ -]?fts', 'full[_ -]?text', 'tsvector', 'to_tsquery', 'websearch_to_tsquery'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'lexical_trigram', aliases: ['lexical[_ -]?trigram', 'trigram', 'pg_trgm', 'word_similarity'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'semantic_768', aliases: ['semantic[_ -]?768', 'content_embedding_768', 'EmbeddingGemma'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'ast_grep', aliases: ['ast[_ -]?grep', 'astgrep'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'graphify', aliases: ['graphify'], fanoutStage: 'EXPANSION' },
  { capability: 'packet_incidence', aliases: ['packet[_ -]?incidence', 'atlas_packet_incidence'], fanoutStage: 'EXPANSION' },
  { capability: 'ontology', aliases: ['ontology', 'ontology[_ -]?tuple'], fanoutStage: 'EXPANSION' },
  { capability: 'domain_classifier', aliases: ['domain[_ -]?classifier', 'DomainClassificationV1', 'domain_classification'], fanoutStage: 'CLASSIFICATION' },
  { capability: 'query_shape', aliases: ['query[_ -]?shape', 'queryShapeId'], fanoutStage: 'CLASSIFICATION' },
  { capability: 'task_intent', aliases: ['task[_ -]?intent', 'taskIntentId'], fanoutStage: 'CLASSIFICATION' },
  { capability: 'retrieval_intent', aliases: ['retrieval[_ -]?intent', 'retrievalIntentId'], fanoutStage: 'CLASSIFICATION' },
  { capability: 'centroid', aliases: ['centroid', 'centroids'], fanoutStage: 'ROUTING' },
  { capability: 'kmeans', aliases: ['k[_ -]?means', 'KMeans'], fanoutStage: 'ROUTING' },
  { capability: 'pca', aliases: ['PCA', 'principal component analysis'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'svd', aliases: ['SVD', 'singular value decomposition'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'umap', aliases: ['UMAP'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'pos', aliases: ['\\bPOS\\b', 'part[_ -]?of[_ -]?speech'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'entity', aliases: ['entity[_ -]?extraction', 'entities', 'LangExtract'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'searxng', aliases: ['SearXNG', 'searxng'], fanoutStage: 'EXPANSION' },
  { capability: 'mcp', aliases: ['\\bMCP\\b', 'Model Context Protocol'], fanoutStage: 'ROUTING' },
  { capability: 'ace_packet', aliases: ['AcePacketV3', 'ACE[_ -]?packet', 'ace_packet'], fanoutStage: 'PROMOTION' },
  { capability: 'context_manifest', aliases: ['ContextManifest', 'context_manifest'], fanoutStage: 'PROMOTION' },
  { capability: 'bitfrost', aliases: ['BitFrost', 'bitfrost'], fanoutStage: 'CACHE' },
  { capability: 'bifrost', aliases: ['Bifrost', 'bifrost'], fanoutStage: 'CACHE' },
  { capability: 'redis_valkey', aliases: ['Redis', 'Valkey', 'redis[_ -]?valkey'], fanoutStage: 'CACHE' },
  { capability: 'simdjson', aliases: ['simdjson', 'SIMDJSON'], fanoutStage: 'FEATURE_EXTRACTION' },
  { capability: 'cuvs', aliases: ['cuVS', 'cuvs', 'CAGRA'], fanoutStage: 'ROUTING' },
  { capability: 'cugraph', aliases: ['cuGraph', 'cugraph'], fanoutStage: 'EXPANSION' },
];
const CODE_EXTENSIONS = new Set(['.cjs', '.go', '.js', '.mjs', '.mts', '.py', '.rs', '.svelte', '.sql', '.ts', '.tsx']);
const TEST_OR_DOC = /(^|[\\/])(__tests__|tests?|fixtures?|examples?|docs?)([\\/]|$)|\.(?:spec|test)\.[^.]+$/i;
const IDENTITY_SIGNAL = /\b(?:canonicalId|canonical_id|packetKey|packet_key|stableKey|stable_key|logicalTaskKey)\b/i;
const REVISION_SIGNAL = /\b(?:sourceRevision|source_revision|workspaceRevision|workspace_revision|graphRevision|graph_revision|representationRevision|representation_revision|taskRevision|producerRevision|revisionChecksum)\b/i;
const EVIDENCE_SIGNAL = /\b(?:evidenceRefs?|sourceSpan|sourceRef|artifactRef|receiptRef|inputChecksum|lineageChecksum)\b/i;
const PROJECTION_CAPABILITIES = new Set(['centroid', 'kmeans', 'pca', 'svd', 'umap', 'cuvs', 'cugraph']);

function listFiles(root) {
  const found = [];
  for (const directory of ROOTS) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) continue;
    try {
      const output = execFileSync('rg', ['--files', '--hidden', absolute], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      found.push(...output.split(/\r?\n/).filter(Boolean));
    } catch {
      continue;
    }
  }
  return [...new Set(found.map((file) => path.relative(root, path.resolve(root, file)).replaceAll('\\', '/')))]
    .filter((file) => !IGNORED.test(file) && EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();
}

function classifyFile(file) {
  if (file.startsWith('openspec/')) return 'OPENSPEC';
  if (/package\.json$|(?:Cargo|go|pyproject|requirements).*\.(?:toml|mod|txt)$/.test(file)) return 'PACKAGE_MANIFEST';
  if (/registry|manifest|taxonomy/i.test(file)) return 'KNOWN_REGISTRY';
  if (/^(?:docker|\.okf)\//.test(file) || /(?:config|runtime|\.ya?ml$)/i.test(file)) return 'RUNTIME_CONFIG';
  if (/^docs\//.test(file) || /\.md$/i.test(file)) return 'DOCUMENTATION';
  return 'SOURCE';
}

function runStructuralSearch(root, definition) {
  const args = ['run', '--lang', 'ts', '--pattern', definition.pattern, '--json=stream', 'sveltekit-frontend/src'];
  const localExecutable = path.join(root, 'sveltekit-frontend', 'node_modules', '.bin', process.platform === 'win32' ? 'ast-grep.cmd' : 'ast-grep');
  const executable = fs.existsSync(localExecutable) ? localExecutable : process.platform === 'win32' ? 'ast-grep.cmd' : 'ast-grep';
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return { id: definition.id, pattern: definition.pattern, status: result.error?.code === 'ETIMEDOUT' ? 'TIMED_OUT' : 'UNAVAILABLE', error: result.error?.message ?? result.stderr?.trim() ?? `exit:${result.status}`, matches: [] };
  }
  const matches = [];
  for (const line of (result.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    try {
      const item = JSON.parse(line);
      matches.push({
        file: String(item.file ?? '').replaceAll('\\', '/'),
        line: Number(item.range?.start?.line ?? 0) + 1,
        text: String(item.text ?? '').trim().slice(0, 240),
      });
    } catch {
      matches.push({ file: null, line: null, text: line.slice(0, 240), parseError: true });
    }
  }
  return { id: definition.id, pattern: definition.pattern, status: 'SCANNED', matches };
}

function staticQualification(files) {
  const texts = files.map((item) => item.text);
  return {
    identityQualified: texts.length > 0 && texts.every((text) => IDENTITY_SIGNAL.test(text)),
    revisionQualified: texts.length > 0 && texts.every((text) => REVISION_SIGNAL.test(text)),
    evidenceLinked: texts.length > 0 && texts.every((text) => EVIDENCE_SIGNAL.test(text)),
  };
}

function auditFeature(feature, records, structuralSearches) {
  const expression = new RegExp(feature.aliases.map((alias) => `(?:${alias})`).join('|'), 'i');
  const declaredOwner = new RegExp(`(?:@fanout-owner\\s*:\\s*|fanoutOwner\\s*:\\s*)${feature.capability}\\b`, 'i');
  const hits = [];
  for (const record of records) {
    const lines = record.text.split(/\r?\n/);
    const matchedLines = [];
    lines.forEach((line, index) => {
      if (expression.test(line)) matchedLines.push({ line: index + 1, text: line.trim().slice(0, 240) });
    });
    if (matchedLines.length) hits.push({ ...record, matchedLines: matchedLines.slice(0, 8) });
  }

  const sourceHits = hits.filter((item) => CODE_EXTENSIONS.has(path.extname(item.file).toLowerCase()) && !TEST_OR_DOC.test(item.file));
  const testHits = hits.filter((item) => TEST_OR_DOC.test(item.file));
  const explicitOwners = sourceHits.filter((item) => declaredOwner.test(item.text) && /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|type|interface)\b/i.test(item.text));
  const callerFiles = new Set();

  const candidateFiles = sourceHits.filter((item) => explicitOwners.some((owner) => owner.file === item.file) || callerFiles.has(item.file));
  const qualification = staticQualification(candidateFiles);
  const cacheOnly = sourceHits.length > 0 && sourceHits.every((item) => /cache|valkey|redis|bifrost|bitfrost/i.test(item.file));
  const challenger = PROJECTION_CAPABILITIES.has(feature.capability) && sourceHits.some((item) => /challenger|shadow|experiment|benchmark|candidate/i.test(item.file) || /challenger[_ -]?only|shadow[_ -]?only/i.test(item.text));
  let status = 'MISSING';
  if (explicitOwners.length > 1) status = 'CONFLICT';
  else if (callerFiles.size === 0 && sourceHits.length === 0 && testHits.length > 0) status = 'TEST_ONLY';
  else if (explicitOwners.length === 1 && callerFiles.size === 0) status = 'DORMANT';
  else if (cacheOnly) status = 'CACHE_ONLY';
  else if (challenger) status = 'CHALLENGER';
  else if (explicitOwners.length === 1 && callerFiles.size > 0) status = 'CANONICAL_OWNER';
  else if (sourceHits.length > 0) status = 'DERIVED_FEATURE';

  const gaps = [];
  if (explicitOwners.length === 0 && sourceHits.length > 0) gaps.push('CANONICAL_OWNER_NOT_EXPLICITLY_TAGGED');
  if (callerFiles.size === 0) gaps.push('STRUCTURAL_CALLER_NOT_FOUND');
  if (!qualification.identityQualified) gaps.push('IDENTITY_SIGNAL_MISSING_OR_UNJOINED');
  if (!qualification.revisionQualified) gaps.push('REVISION_SIGNAL_MISSING_OR_UNJOINED');
  if (!qualification.evidenceLinked) gaps.push('EVIDENCE_SIGNAL_MISSING_OR_UNJOINED');
  if (cacheOnly && !qualification.identityQualified) gaps.push('CACHE_ADMISSION_GAP');
  gaps.push('FEATURE_SPECIFIC_CALLER_ATTRIBUTION_NOT_ESTABLISHED');

  const boundaryViolations = [];
  if (PROJECTION_CAPABILITIES.has(feature.capability)) {
    for (const hit of hits) {
      for (const match of hit.text.matchAll(/(?:canonicalId|canonical_id|packetKey|packet_key|stableKey|stable_key)\s*[:=]\s*[^,;}\n]*(?:cluster|centroid|latent|pca|umap|svd)[\w.-]*/gi)) {
        boundaryViolations.push({ file: hit.file, excerpt: match[0].slice(0, 200) });
      }
    }
  }
  if (boundaryViolations.length) gaps.push('SEMANTIC_BOUNDARY_VIOLATION_CANDIDATE');

  const matchedFiles = hits.slice(0, MAX_EVIDENCE_PER_FEATURE).map((item) => ({
    file: item.file,
    category: item.category,
    role: TEST_OR_DOC.test(item.file) ? 'TEST_OR_DOCUMENTATION' : callerFiles.has(item.file) ? 'CALLER_CANDIDATE' : explicitOwners.some((owner) => owner.file === item.file) ? 'OWNER_CANDIDATE' : 'REFERENCE',
    lines: item.matchedLines,
  }));
  return {
    capability: feature.capability,
    ownerPath: explicitOwners.length === 1 ? explicitOwners[0].file : undefined,
    ownerCandidates: explicitOwners.map((item) => item.file),
    referenceFileCount: sourceHits.length,
    callers: [...callerFiles].sort().slice(0, MAX_EVIDENCE_PER_FEATURE),
    callerCount: callerFiles.size,
    status,
    ...qualification,
    fanoutStage: feature.fanoutStage,
    gaps: [...new Set(gaps)],
    matchedFiles,
    structuralCallSites: [],
    callerAttribution: 'NOT_INFERRED_FROM_GENERIC_CALL_BOUNDARIES',
    boundaryViolations,
    qualificationBasis: 'STATIC_SIGNAL_COLOCATION_ONLY_NOT_LINEAGE_PROOF',
    classificationBasis: 'AST_STRUCTURAL_CALLS_AND_EXPLICIT_OWNER_TAGS_ONLY_NOT_RUNTIME_PROOF',
    canonicalAuthority: false,
  };
}

const allFiles = listFiles(ROOT);
const records = [];
let oversizedOrUnreadable = 0;
for (const file of allFiles) {
  const absolute = path.join(ROOT, file);
  try {
    const stat = fs.statSync(absolute);
    if (stat.size > MAX_FILE_BYTES) {
      oversizedOrUnreadable += 1;
      continue;
    }
    records.push({ file, category: classifyFile(file), text: fs.readFileSync(absolute, 'utf8') });
  } catch {
    oversizedOrUnreadable += 1;
  }
}

const structuralSearches = STRUCTURAL_CALLS.map((definition) => runStructuralSearch(ROOT, definition));
const capabilities = FEATURES.map((feature) => auditFeature(feature, records, structuralSearches));
const explicitOwnerConflicts = capabilities.filter((item) => item.ownerCandidates.length > 1).map((item) => item.capability);
const outputPath = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
const report = {
  schema: 'atlas.fanout-capability-audit.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STATIC_SOURCE_AUDIT',
  supersedes: 'fanout-capability-audit-v1',
  supersededReportPath: '%TEMP%/fanout-capability-audit-v1.json',
  supersededReportChecksum: 'sha256:f1b7f8419c69d82a5028277e82c9aebd978f3e00e35d2fad2f723b10995306b3',
  scannerRevision: 'audit-fanout-fabric-alignment-v2',
  probeRevision: 'AST_GREP_VARIADIC_ARGS_V2',
  scope: {
    roots: ROOTS.filter((directory) => fs.existsSync(path.join(ROOT, directory))),
    filesDiscovered: allFiles.length,
    filesScanned: records.length,
    filesSkippedForSizeOrReadError: oversizedOrUnreadable,
    structuralCallerScanner: structuralSearches.every((item) => item.status === 'SCANNED') ? 'ast-grep' : 'PARTIAL',
  },
  policy: {
    staticNamesAndimportsAreCandidatesNotProof: true,
    noEndpointOrDatabaseConnections: true,
    noLiveMutations: true,
    noGraphifyRefresh: true,
    canonicalAuthority: false,
    domainTaxonomiesRemainSeparate: true,
  },
  ownerConflictChecks: {
    explicitOwnerConflicts,
    dormant: capabilities.filter((item) => item.status === 'DORMANT').map((item) => item.capability),
    testOnly: capabilities.filter((item) => item.status === 'TEST_ONLY').map((item) => item.capability),
    revisionGaps: capabilities.filter((item) => !item.revisionQualified).map((item) => item.capability),
    cacheAdmissionGaps: capabilities.filter((item) => item.gaps.includes('CACHE_ADMISSION_GAP')).map((item) => item.capability),
    semanticBoundaryViolationCandidates: capabilities.filter((item) => item.boundaryViolations.length).map((item) => item.capability),
  },
  structuralSearches,
  findingDisposition: {
    structuralCallSitesAreReportedSeparatelyFromFeatureOwnership: true,
    selectMcpToolSubsetCallerStatus: structuralSearches.find((item) => item.id === 'selectMcpToolSubset')?.matches.length
      ? 'ACTIVE_CALLER_PROVEN'
      : 'UNRESOLVED',
    requestAcquisitionCallerStatus: structuralSearches.find((item) => item.id === 'requestAcquisition')?.matches.length
      ? 'CALLSITE_FOUND_OWNER_UNRESOLVED'
      : 'UNRESOLVED',
    runtimeReachabilityProven: false,
  },
  matrix: capabilities.map((item) => ({
    capability: item.capability,
    owner: item.ownerPath ?? (item.ownerCandidates.length ? 'CONFLICT' : 'UNPROVEN'),
    referenceFileCount: item.referenceFileCount,
    callerCount: item.callerCount,
    identityQualified: item.identityQualified,
    revisionQualified: item.revisionQualified,
    evidenceLinked: item.evidenceLinked,
    fanoutStage: item.fanoutStage,
    status: item.status,
  })),
  capabilities,
  writesPerformed: false,
  writeAccounting: {
    database: false,
    runtimeServices: false,
    graphify: false,
    canonicalState: false,
    localReportArtifactWritten: Boolean(outputPath),
  },
};
report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, generatedAt: null, semanticChecksum: null })).digest('hex')}`;

if (outputPath) {
  const absolute = path.resolve(ROOT, outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
if (process.argv.includes('--markdown')) {
  const rows = report.matrix.map((item) => `| ${item.capability} | ${item.owner} | ${item.referenceFileCount} | ${item.callerCount} | ${item.identityQualified} / ${item.revisionQualified} / ${item.evidenceLinked} | ${item.fanoutStage} | ${item.status} |`);
  console.log([
    '| Capability | Owner | Reference files | Structural callers | Identity / revision / evidence | Fan-out | Status |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
    ...rows,
    '',
    `Ast-grep: ${report.scope.structuralCallerScanner}; files scanned: ${report.scope.filesScanned}; semantic checksum: ${report.semanticChecksum}`,
  ].join('\n'));
} else {
  console.log(JSON.stringify(outputPath ? { reportPath: path.relative(ROOT, path.resolve(ROOT, outputPath)), summary: report.ownerConflictChecks, semanticChecksum: report.semanticChecksum, writesPerformed: false } : report, null, 2));
}
