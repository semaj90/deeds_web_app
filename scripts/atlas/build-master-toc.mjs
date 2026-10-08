#!/usr/bin/env node
/**
 * Build the document-governance registry and human Master TOC.
 *
 * This is a deterministic projection only. It never edits, moves, archives,
 * or marks an original document superseded. Supersession must be explicit in
 * a future governance record or operator-reviewed receipt.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

const { documentGovernanceRegistryV1Schema } = await (await import('tsx/esm/api')).tsImport(
  '../../packages/parent-atlas/src/core/document-governance-record-v1.ts',
  import.meta.url,
);
const { extractDocumentGovernanceFrontmatterV1 } = await import('./document-governance-frontmatter-v1.mjs');
const { markDocumentGovernanceTopicConflictsV1 } = await import('./document-governance-topic-conflicts-v1.mjs');
const { attachClaudeInstructionScopeV1 } = await import('./document-governance-instruction-scope-v1.mjs');
const { parseTangInspiredShortlistReceiptV1 } = await import('./document-governance-experiment-receipt-v1.mjs');

const repoRoot = process.cwd();
const registryPath = join(repoRoot, 'docs', 'reports', 'document-governance-registry-v1.json');
const tocPath = join(repoRoot, 'docs', 'MASTER-TOC.md');
const architectureTocPath = join(repoRoot, 'docs', 'architecture', 'ARCH-TOC.md');
const workstationHelperPath = join(repoRoot, '.claude', 'skills', 'parent-atlas-workstation', 'SKILL.md');
const checkOnly = process.argv.includes('--check');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const repoPath = (value) => relative(repoRoot, value).split(sep).join('/');
const readJson = (pathname) => {
  try {
    return JSON.parse(readFileSync(join(repoRoot, pathname), 'utf8'));
  } catch {
    return null;
  }
};

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', '.svelte-kit', 'dist', 'build'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else out.push(absolute);
  }
  return out;
}

function discoverInstructionFiles() {
  const paths = execFileSync('rg', [
    '--files', '--hidden',
    '-g', '*[Cc][Ll][Aa][Uu][Dd][Ee].md',
    '-g', '*[Aa][Gg][Ee][Nn][Tt][Ss].md',
    '-g', '!**/.git/**',
    '-g', '!**/node_modules/**',
    '-g', '!**/.svelte-kit/**',
    '-g', '!**/dist/**',
    '-g', '!**/build/**',
  ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter((path) => path && /^(claude|agents)\.md$/i.test(basename(path)));
  return paths.map((path) => join(repoRoot, path));
}

function taskProgress(text) {
  const completed = (text.match(/- \[[xX]\]/g) ?? []).length;
  const total = (text.match(/- \[[ xX]\]/g) ?? []).length;
  return { completedTasks: completed, totalTasks: total, progressFraction: total ? completed / total : null };
}

function kindFor(pathname) {
  if (/(^|\/)CLAUDE\.md$/i.test(pathname) || /(^|\/)AGENTS\.md$/i.test(pathname)) return 'PROJECT_INSTRUCTIONS';
  if (pathname.startsWith('openspec/changes/')) return 'OPENSPEC';
  if (pathname.startsWith('docs/reports/')) return 'REPORT';
  if (pathname.startsWith('docs/')) return 'ARCHITECTURE_OR_DOCUMENTATION';
  return 'DOCUMENT';
}

function statusFor(pathname, kind, progress, experiment = null) {
  if (experiment) return 'EXPERIMENTAL';
  if (kind === 'OPENSPEC' && pathname.endsWith('/tasks.md')) {
    return 'ACTIVE_SUPPORTING';
  }
  if (kind === 'PROJECT_INSTRUCTIONS') return 'CANONICAL_CURRENT';
  return 'UNCLASSIFIED';
}

function documentKindFor(pathname, kind) {
  if (kind === 'PROJECT_INSTRUCTIONS') return /(^|\/)AGENTS\.md$/i.test(pathname) ? 'AGENT_INSTRUCTIONS' : 'CLAUDE_INSTRUCTIONS';
  if (kind === 'REPORT') return 'REPORT';
  if (kind === 'OPENSPEC') {
    if (pathname.endsWith('/proposal.md')) return 'OPENSPEC_PROPOSAL';
    if (pathname.endsWith('/design.md')) return 'OPENSPEC_DESIGN';
    if (pathname.endsWith('/tasks.md')) return 'OPENSPEC_TASKS';
    if (pathname.includes('/specs/')) return 'OPENSPEC_SPEC';
    return 'HISTORICAL';
  }
  if (pathname.startsWith('docs/architecture/')) return 'ARCHITECTURE';
  if (/runbook/i.test(pathname)) return 'RUNBOOK';
  return 'DOCUMENT';
}

const candidates = [
  ...discoverInstructionFiles(),
  ...walk(join(repoRoot, 'docs')).filter((p) => /\.md$/i.test(p) || /\.json$/i.test(p)),
  ...walk(join(repoRoot, 'openspec', 'changes')).filter((p) => /\.(md|json|ya?ml)$/i.test(p)),
].filter((value, index, all) => all.indexOf(value) === index)
  // Generated projections must not become inputs to their own checksum.
  .filter((value) => {
    const path = repoPath(value);
    if (path === repoPath(registryPath) || path === repoPath(tocPath) || path === repoPath(architectureTocPath)) return false;
    // Governance outputs are projections and must not feed their own input
    // registry or make replay checksums depend on audit execution time.
    if (/^docs\/reports\/(?:document-(governance|supersession)-|claude-instruction-supersession-plan-)/.test(path)) return false;
    if (path === 'docs/reports/document-governance-validation-v1.json'
      || path === 'docs/reports/graphify-daily-workflow-receipt.json'
      || path === 'docs/reports/openspec-workboard-v1.json') return false;
    // Session run receipts summarize this build and must not feed the registry
    // whose checksum they record, or each report refresh invalidates its input.
    if (/^docs\/reports\/(?:openspec-workboard-run-[^/]+|document-reference-census-v1)\.json$/.test(path)) return false;
    // Workboard outputs contain generatedAt and are projections of the same
    // OpenSpec task files already represented above. Including them would make
    // a TOC replay checksum change whenever the workboard is regenerated.
    if (path === 'docs/OPENSPEC-WORKBOARD.md' || path === 'docs/reports/openspec-workboard-v1.json') return false;
    return true;
  })
  .sort();

const extractedRecords = candidates.map((absolute) => {
  const path = repoPath(absolute);
  const content = readFileSync(absolute);
  const text = content.toString('utf8');
  const kind = kindFor(path);
  const experiment = path === 'docs/reports/atlas-candidate-shortlist-receipt-v1.json'
    ? parseTangInspiredShortlistReceiptV1(text)
    : null;
  const progress = path.endsWith('/tasks.md') ? taskProgress(text) : { completedTasks: null, totalTasks: null, progressFraction: null };
  const extracted = extractDocumentGovernanceFrontmatterV1(text, statusFor(path, kind, progress, experiment));
  return {
    schema: 'atlas.document-governance-record.v1',
    documentId: `doc:sha256:${sha256(Buffer.from(path.replaceAll('\\', '/'), 'utf8'))}`,
    path,
    sha256: sha256(content),
    bytes: content.byteLength,
    title: null,
    documentKind: documentKindFor(path, kind),
    status: extracted.status,
    topicIds: extracted.topicIds,
    canonicalForTopics: extracted.canonicalForTopics,
    topicOwnershipStatus: extracted.topicOwnershipStatus,
    supersedes: [],
    supersededBy: [],
    supersessionStatus: 'UNASSESSED',
    supersessionReason: null,
    openspec: {
      change: kind === 'OPENSPEC' ? path.match(/^openspec\/changes\/([^/]+)\//)?.[1] ?? null : null,
      taskRefs: [],
      ...progress,
    },
    validation: {
      status: extracted.validationStatus,
      linksChecked: false,
      referencesChecked: false,
      smokePassed: false,
      testsPassed: false,
      contradictions: extracted.contradictions,
      receiptRefs: [],
    },
    workflow: null,
    ...(experiment ? { experiment } : {}),
    archive: {
      eligible: false,
      blockedReasons: ['NO_EXPLICIT_SUPERSESSION_RECEIPT', 'NO_OPERATOR_ARCHIVE_AUTHORIZATION'],
      archivedPath: null,
    },
  };
});
const scopedRecords = attachClaudeInstructionScopeV1(extractedRecords);
const { records } = markDocumentGovernanceTopicConflictsV1(scopedRecords);

const registry = {
  schema: 'atlas.document.governance.registry.v1',
  generatedBy: 'scripts/atlas/build-master-toc.mjs',
  generatedAt: 'DETERMINISTIC',
  canonicalAuthority: 'DOCUMENT_STATUS_ONLY',
  supersessionPolicy: 'EXPLICIT_LINK_AND_RECEIPT_ONLY',
  records,
};
const validatedRegistry = documentGovernanceRegistryV1Schema.safeParse(registry);
if (!validatedRegistry.success) {
  const issues = validatedRegistry.error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`DOCUMENT_GOVERNANCE_REGISTRY_INVALID: ${issues.join('; ')}`);
}
const registryJson = JSON.stringify(registry, null, 2) + '\n';

const openSpecs = records.filter((r) => r.documentKind === 'OPENSPEC_TASKS'
  && !r.path.startsWith('openspec/changes/archive/')
  && r.openspec.completedTasks !== null
  && r.openspec.totalTasks !== null
  && r.openspec.completedTasks < r.openspec.totalTasks);
const canonicalSourceDocs = records.filter((r) => r.status === 'CANONICAL_CURRENT');
const canonicalTopicOwners = new Map();
for (const record of canonicalSourceDocs) {
  for (const topicId of record.canonicalForTopics) {
    const owners = canonicalTopicOwners.get(topicId) ?? [];
    owners.push(record);
    canonicalTopicOwners.set(topicId, owners);
  }
}
const supersededDocs = records.filter((r) => r.status === 'SUPERSEDED');
const archiveReadyDocs = records.filter((r) => r.archive.eligible);
const experiments = records.filter((r) => r.status === 'EXPERIMENTAL');
const conflicts = records.filter((r) => r.status === 'CONFLICT' || r.topicOwnershipStatus === 'CONFLICT');
const workflowEta = records.filter((r) => r.workflow?.etaMs != null);
const qdrantIdentity = readJson('docs/reports/lineage-qdrant-semantic-canary-v1.json');
const qdrantTargets = readJson('docs/reports/lineage-qdrant-projection-targets-v1.json');
const latentParity = readJson('docs/reports/latent256-ann-exact-parity-bounded-v2.json');
const neuralDecoderSeparation = readJson('docs/reports/neural-decoder-runtime-separation-v1.json');
const architectureDocs = records
  .filter((record) => record.documentKind === 'ARCHITECTURE')
  .sort((a, b) => a.path.localeCompare(b.path));
const workstationHelperText = existsSync(workstationHelperPath)
  ? readFileSync(workstationHelperPath, 'utf8')
  : '';
const ownerTable = workstationHelperText.match(/## Owners\b([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
const workstationOwnerRows = ownerTable
  .split(/\r?\n/)
  .filter((line) => /^\|/.test(line) && !/^\|\s*:?-{3,}/.test(line))
  .map((line) => line.trim());
const temporalArchitectureSnapshots = records
  .filter((record) => /^docs\/reports\/architecture-temporal-snapshots\/architecture-temporal-index-v1-[a-f0-9]{64}\.json$/.test(record.path))
  .map((record) => ({ record, report: readJson(record.path) }))
  .filter(({ report }) => report?.schema === 'atlas.architecture-temporal-snapshot.v1')
  .sort((a, b) => (a.report.captured_at ?? '').localeCompare(b.report.captured_at ?? '')
    || a.record.path.localeCompare(b.record.path));
const architectureDocLink = (record) => {
  const target = relative(join(repoRoot, 'docs', 'architecture'), join(repoRoot, record.path)).split(sep).join('/');
  const label = basename(record.path).replace(/\.(md|json)$/i, '');
  return `- [${label}](./${target})`;
};
const architectureMarkdownDocs = architectureDocs.filter((record) => /\.md$/i.test(record.path));
const architectureJsonDocs = architectureDocs.filter((record) => /\.json$/i.test(record.path));
const architectureToc = [
  '# Parent Atlas Architecture TOC (V2)',
  '',
  '> V2 adds explicit temporal snapshot receipts to the V1 navigation projection.',
  '> Generated from the document-governance registry and Parent Atlas workstation helper; this index is not canonical architecture or ownership authority.',
  '',
  '## Authority and routing sources',
  '',
  '- [Parent Atlas workstation helper](../../.claude/skills/parent-atlas-workstation/SKILL.md) — task routing and owner pointers.',
  '- [Runtime ownership registry](./runtime-ownership-registry.json) — re-check this registry before implementation; helper summaries can become stale.',
  '- [Master TOC](../MASTER-TOC.md) — repository-wide document navigation.',
  '',
  '## Workstation helper owner map',
  '',
  '> Snapshot extracted from the helper for navigation. The registry and implementation contracts remain authoritative.',
  ...(workstationOwnerRows.length ? workstationOwnerRows : ['| Need | Owner | Status |', '| --- | --- | --- |', '| Workstation helper unavailable | — | UNAVAILABLE |']),
  '',
  '## Temporal snapshot history',
  '',
  '- Contract owner: [TemporalDocumentIndexV1](../../packages/parent-atlas/src/core/temporal-indexing-fabric.ts); each receipt is content-addressed and noncanonical.',
  '- The first receipt is a baseline only. A delta is reported only when a previous snapshot path is supplied explicitly; no fuzzy path or “latest” selection is used.',
  ...(temporalArchitectureSnapshots.length
    ? temporalArchitectureSnapshots.map(({ record, report }) => {
      const temporalIndex = report.temporal_document_index;
      const artifacts = report.source_artifacts?.length ?? 0;
      const deltas = report.source_revision_deltas?.length ?? 0;
      const previous = report.previous_source_snapshot_revision ?? 'INITIAL_BASELINE_NO_PRIOR';
      return `- [${record.path.split('/').at(-1)}](../reports/${record.path.slice('docs/reports/'.length)}) — ${temporalIndex?.status ?? 'INVALID'}; ${artifacts} source artifacts; ${deltas} explicit deltas; previous=${previous}; index checksum \`${temporalIndex?.index_checksum ?? 'missing'}\`.`;
    })
    : ['- No architecture temporal snapshot receipts have been captured.']),
  '',
  '## Architecture documents',
  '',
  '### Markdown',
  '',
  ...(architectureMarkdownDocs.length ? architectureMarkdownDocs.map(architectureDocLink) : ['- None discovered.']),
  '',
  '### JSON registries and baselines',
  '',
  ...(architectureJsonDocs.length ? architectureJsonDocs.map(architectureDocLink) : ['- None discovered.']),
  '',
].join('\n');
const toc = [
  '# Parent Atlas Master TOC',
  '',
  '> Generated projection from `docs/reports/document-governance-registry-v1.json`.',
  '> This file is navigation, not canonical architecture or supersession authority.',
  '',
  `Registry checksum: \`${sha256(registryJson)}\``,
  '',
  '## Canonical source documents',
  '',
  ...(canonicalSourceDocs.length
    ? canonicalSourceDocs.map((r) => `- [${r.path}](${r.path}) — ${r.documentKind} — \`${r.sha256.slice(0, 12)}\``)
    : ['- No source document is explicitly classified CANONICAL_CURRENT.']),
  '',
  '## Canonical topics',
  '',
  ...(canonicalTopicOwners.size
    ? [...canonicalTopicOwners.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([topicId, owners]) => `- \`${topicId}\` — ${owners.map((r) => `[${r.path}](${r.path})`).join(', ')}`)
    : ['- No document currently declares an explicit canonical topic owner.']),
  '',
  '## Architecture index',
  '',
  '- [Parent Atlas Architecture TOC V2](architecture/ARCH-TOC.md) — complete navigation, workstation owner map, and explicit temporal snapshot receipts.',
  '',
  '## Code Capability Knowledge and Agentic DAG Retrieval',
  '',
  '- [Code-symbol semantic retrieval](architecture/code-symbol-semantic-retrieval-v1.md) — typed, source-grounded symbol evidence and existing DAG/OaK ownership boundaries.',
  '- [Repo-local capability-card contract](.okf/indexes/code-capability-knowledge-v1.yaml) — design-only `spec.card_kind` projections; canonical identity remains with Parent Atlas.',
  '- [CODE-KNOW-01..18](../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md) — open schema, evidence, transport, and admission gates; no datastore writes authorized.',
  '',
  '## NLP Grounding, Classification, and Retrieval Context',
  '',
  '> Navigation across existing owners; this is not a new registry or an admission claim. Domain/class labels, topics, extracted entities/concepts, clusters, ranked Top-K results, and future-context indexes are derived projections until their source, workspace, taxonomy, and representation revisions are qualified.',
  '',
  '- [Task/evidence-card grounding and tuple lineage](../openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md) — task proof join, `GroundedNlpFactV1`, deployed-schema check, tuple lineage, and read-only admission gates.',
  '- [OpenSpec task evidence cards](../openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md) — TaskCard/EvidenceCard receipts and predicate-level proof binding.',
  '- [NLP sidecar feature compiler](../openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md) — extraction, feature compilation, source spans, and sidecar/runtime boundaries.',
  '- [Domain classifier and taxonomy](../openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md) — domain/intent classification and non-authoritative routing signals.',
  '- [Feature-label derivation](../openspec/changes/feature-label-semantic-derivation/tasks.md) — sourceRef-to-feature labels and review-gated canonical reconciliation.',
  '- [Ontology kernel: entities, concepts, and tuples](../openspec/changes/parent-atlas-ontology-kernel/tasks.md) — ontology ownership, entity extraction, tuple lineage, and domain normalization.',
  '- [Feature intelligence: entity fanout and clustering](../openspec/changes/atlas-feature-intelligence/tasks.md) — entity/evidence admission, bounded fanout, feature convergence, and KMeans/SOM projections.',
  '- [Topology representation admission](../openspec/changes/parent-atlas-topology-representation-admission/tasks.md) — snapshot/ordinal-bound clustering and topology artifacts.',
  '- [Candidate feature execution](../openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md) — candidate feature production, ranking signals, and evidence-aligned feature rows.',
  '- [Retrieval lineage and DAG convergence](../openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md) — retrieval/top-K candidate flow, context assembly, and revision-bound downstream consumption.',
  '- [Semantic representation and retrieval](../openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md) — `semantic_768` representation lineage and retrieval projection gates.',
  '',
  '## Architecture documents',
  '',
  ...(architectureMarkdownDocs.length
    ? architectureMarkdownDocs.map((record) => `- [${basename(record.path).replace(/\.md$/i, '')}](${record.path}) — ${record.status}`)
    : ['- None discovered.']),
  '',
  '## Active OpenSpec task progress',
  '',
  ...(openSpecs.length
    ? openSpecs.map((r) => `- [${r.openspec.change}](${r.path.replace(/\/tasks\.md$/, '')}) — ${r.openspec.completedTasks}/${r.openspec.totalTasks} tasks (${r.openspec.progressFraction == null ? 'n/a' : `${Math.round(r.openspec.progressFraction * 100)}%`})`)
    : ['- No incomplete, non-archived OpenSpec task lists were discovered.']),
  '',
  '## Ordered workboard',
  '',
  '- [OpenSpec workboard](OPENSPEC-WORKBOARD.md) — priority-ordered open tasks with evidence-based ETA fields.',
  '',
  '## Superseded and archive candidates',
  '',
  ...(supersededDocs.length
    ? supersededDocs.map((r) => `- SUPERSEDED [${r.path}](${r.path})${r.supersededBy.length ? ` — replacement refs: ${r.supersededBy.join(', ')}` : ' — replacement reference unresolved'}`)
    : ['- No documents are classified SUPERSEDED.']),
  ...(archiveReadyDocs.length
    ? archiveReadyDocs.map((r) => `- ARCHIVE_READY [${r.path}](${r.path}) — candidacy only; archive apply remains separately authorized`)
    : ['- No documents are archive-ready.']),
  '- Original files remain in place until an explicit supersession and archive receipt exists.',
  '',
  '## Experiments and challengers',
  '',
  ...(experiments.length
    ? experiments.map((r) => r.experiment
      ? `- [${r.experiment.policy}](${r.path}) — ${r.experiment.receiptStatus}; ${r.experiment.inputCount}→${r.experiment.targetCount}, rank ${r.experiment.rank}; Recall@10 ${Math.round(r.experiment.quality.recallAt10 * 100)}%, Recall@24 ${Math.round(r.experiment.quality.recallAt24 * 100)}%, Top24 overlap ${Math.round(r.experiment.quality.top24Overlap * 100)}%, oracle NDCG@24 ${Math.round(r.experiment.quality.oracleNdcgAt24 * 100)}%; receipt dated ${r.experiment.observedAt.slice(0, 10)}. `
        + `Canonical authority is false; promotion remains gated by [NE-23E exact-rerank/quality evaluation](../openspec/changes/${r.experiment.sourceChange}/tasks.md).`
      : `- [${r.path}](${r.path}) — EXPERIMENTAL; not canonical authority`)
    : ['- No documents are explicitly classified EXPERIMENTAL.']),
  '',
  '## Conflicts',
  '',
  ...(conflicts.length
    ? conflicts.map((r) => `- [${r.path}](${r.path}) — ${r.validation.contradictions.join('; ') || 'governance conflict requires review'}`)
    : ['- No governance conflicts are recorded.']),
  '',
  '## Runtime ETA',
  '',
  ...(workflowEta.length
    ? workflowEta.map((r) => `- [${r.path}](${r.path}) — ${r.workflow.etaMs} ms${r.workflow.confidence == null ? '' : `, confidence ${r.workflow.confidence}`}${r.workflow.lastEventRef ? `, receipt ${r.workflow.lastEventRef}` : ''}`)
    : ['- ETA unavailable: no validated workflow event with `progress.etaMs` is present in the registry.']),
  '',
  '## Latest verified retrieval findings',
  '',
  `- [Latent256 exact/Qdrant parity](reports/latent256-ann-exact-parity-bounded-v2.json) — ${latentParity?.schema ?? 'NOT_FOUND'} — ${latentParity ? `sample ${latentParity.sample_size}, k=${latentParity.k}, mean overlap ${latentParity.mean_overlap_at_k}` : 'not available'}.`,
  `- [Qdrant semantic identity canary](reports/lineage-qdrant-semantic-canary-v1.json) — ${qdrantIdentity?.status ?? 'NOT_FOUND'} — ${qdrantIdentity ? `${qdrantIdentity.pointsReturned} points for ${qdrantIdentity.candidateCount} candidates; duplicates ${qdrantIdentity.duplicatePacketKeys?.length ?? 'n/a'}` : 'not available'}.`,
  `- [Qdrant projection targets](reports/lineage-qdrant-projection-targets-v1.json) — ${qdrantTargets?.status ?? 'NOT_FOUND'} — ${qdrantTargets ? `same-collection duplicates ${qdrantTargets.counts?.duplicateSameCollection ?? 'n/a'}, missing ${qdrantTargets.counts?.noTarget ?? 'n/a'}` : 'not available'}.`,
  '- Rebuild safety warning: the existing Qdrant backfill tool reads canonical vectors but still requires packet/workspace lineage reconciliation before apply; it is not a promotion-ready blue/green rebuild.',
  '- Promotion note: Qdrant remains a rebuildable projection; duplicate ownership must be reconciled before cutover or deletion.',
  '',
  '## Neural decoder and GPU runtime separation',
  '',
  `- [Neural decoder separation](reports/neural-decoder-runtime-separation-v1.json) — ${neuralDecoderSeparation?.status ?? 'NOT_FOUND'} — host PyTorch ${neuralDecoderSeparation?.separation?.hostReference?.torchVersion ?? 'n/a'} is reference-only; decoder ${neuralDecoderSeparation?.separation?.decoderService?.torchVersion ?? 'n/a'} on ${neuralDecoderSeparation?.separation?.decoderService?.url ?? 'n/a'} owns learned projection only.`,
  '- Decoder contract: `semantic_768` → physical `latent_256` → derived `latent_128`/`latent_64`; `canonicalAuthority=false`, `textSynthesis=false`, and `writesPerformed=false`.',
  '- Ornith remains the synthesis/tool-use owner; PostgreSQL remains canonical storage/lineage authority; Qdrant and GPU residency remain rebuildable execution/projection layers.',
  '- Open GPU gates: FEAT-04 envelope, owner-process residency reuse, decoder replay, cuTile parity, CUDA SIMT parity, and RMM allocator evaluation.',
  '',
].join('\n');

if (checkOnly) {
  const currentRegistry = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : null;
  const currentToc = existsSync(tocPath) ? readFileSync(tocPath, 'utf8') : null;
  const currentArchitectureToc = existsSync(architectureTocPath) ? readFileSync(architectureTocPath, 'utf8') : null;
  if (currentRegistry !== registryJson || currentToc !== toc || currentArchitectureToc !== architectureToc) {
    console.error('MASTER_TOC_CHECK_FAILED');
    process.exitCode = 1;
  } else {
    console.log(`MASTER_TOC_CHECK_OK ${sha256(registryJson)}`);
  }
} else {
  writeFileSync(registryPath, registryJson, 'utf8');
  writeFileSync(tocPath, toc, 'utf8');
  writeFileSync(architectureTocPath, architectureToc, 'utf8');
  console.log(`MASTER_TOC_BUILT ${sha256(registryJson)}`);
  console.log(`records=${records.length} openspecTasks=${openSpecs.length} archiveEligible=${records.filter((record) => record.archive.eligible).length}`);
}
