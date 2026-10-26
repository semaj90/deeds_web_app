#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  resolveSnapshotSourceFile,
  validateProposalsForPersistence,
  verifySnapshotUtf8ByteSpan,
} from './lib/snapshot-bound-edge-extractor-v1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_SOURCE_REFS = [
  'sveltekit-frontend/src/lib/server/retrieval/cross-ranker.ts',
  'sveltekit-frontend/src/routes/api/ace/route/+server.ts',
  'scripts/atlas/symbol-reconciliation-writer-v1.mts',
  '.claude/AGENT_CONSTITUTION.md',
  'packages/parent-atlas/src/core/structural-reference-resolver.ts',
];
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/i;

const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const normalized = (value) => String(value ?? '').replaceAll('\\', '/').normalize('NFC');

function buildManifestIndex(manifest) {
  if (!Array.isArray(manifest.sources)) throw new Error('SNAPSHOT_SOURCES_REQUIRED');
  const index = new Map();
  for (const source of manifest.sources) {
    if (typeof source.sourceRef === 'string') index.set(normalized(source.sourceRef), source);
    if (typeof source.repositoryRelativePath === 'string') index.set(normalized(source.repositoryRelativePath), source);
  }
  return index;
}

function buildProposal({ source, workspaceRevision, edge, byteSpan, spanEvidence }) {
  const target = String(edge.to_evidence_key ?? '').trim();
  if (!target) throw new Error('CALL_TARGET_EVIDENCE_REQUIRED');
  const subject = edge.from_evidence_key == null ? null : String(edge.from_evidence_key);
  const proposal = {
    schema: 'atlas.graphify-edge-candidate.v1',
    workspace_revision: workspaceRevision,
    source_ref: source.sourceRef,
    source_revision: source.sourceRevision,
    predicate: 'CALLS',
    subject_symbol_id: null,
    subject_qualified_name: subject,
    subject_evidence_key: subject,
    object_symbol_id: null,
    unresolved_target: target,
    evidence_kind: 'tree_sitter_call_expression',
    evidence_span: {
      occurrence_byte_span: byteSpan,
      digest: spanEvidence.digest,
      start_line: spanEvidence.startLine,
      end_line: spanEvidence.endLine,
    },
    source_content_digest: source.contentDigest,
    source_byte_length: source.byteLength,
    confidence: 1,
    resolution_status: 'SYNTAX_ONLY',
    canonical_authority: false,
    admission_status: 'REVIEW_REQUIRED',
    persisted: false,
  };
  proposal.proposal_id = crypto.createHash('sha256').update(JSON.stringify([
    workspaceRevision,
    source.sourceRef,
    source.sourceRevision,
    proposal.predicate,
    subject,
    target,
    byteSpan,
  ])).digest('hex');
  return proposal;
}

export async function runSnapshotBoundEdgeExtractionCanaryV1({
  root = DEFAULT_ROOT,
  sourceRefs = DEFAULT_SOURCE_REFS,
  fetchImpl = globalThis.fetch,
  sidecarUrl = process.env.NLP_8095_URL || 'http://127.0.0.1:8095',
  runId = new Date().toISOString().replace(/[^0-9TZ-]/g, '-'),
  outputDir = path.join(root, '.tmp', 'atlas'),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED');
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) throw new Error('CANARY_SOURCE_REFS_REQUIRED');
  if (!/^[A-Za-z0-9-]{1,80}$/.test(runId)) throw new Error('RUN_ID_INVALID');
  const sidecarOrigin = new URL(sidecarUrl).origin;

  const admissionPath = path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
  const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  const workspaceRevision = String(admission.workspaceRevision ?? '');
  const snapshotRevision = String(admission.snapshotRevision ?? '');
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
    || admission.authority !== true
    || !SHA256_PATTERN.test(workspaceRevision)
    || !SHA256_PATTERN.test(snapshotRevision)) {
    throw new Error('ADMITTED_SNAPSHOT_REQUIRED');
  }

  const manifestPath = path.resolve(root, admission.manifestPath
    ?? `docs/reports/workspace-source-snapshots/${snapshotRevision.slice('sha256:'.length)}.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.snapshotRevision !== snapshotRevision) throw new Error('MANIFEST_SNAPSHOT_REVISION_MISMATCH');
  const snapshotRoot = path.join(root, '.tmp/workspace-source-snapshots', snapshotRevision.slice('sha256:'.length));
  if (!fs.existsSync(snapshotRoot)) throw new Error('MATERIALIZED_SNAPSHOT_ROOT_REQUIRED');
  const manifestIndex = buildManifestIndex(manifest);
  const proposals = [];
  const fileAudits = [];
  const rawEdgeTypes = {};
  let sidecarRequests = 0;
  let sidecarFailures = 0;
  let invalidSpans = 0;

  for (const requestedRef of sourceRefs) {
    const sourceRef = normalized(requestedRef);
    const resolved = resolveSnapshotSourceFile({
      snapshotRoot,
      manifestIndex,
      sourceRef,
      expectedWorkspaceRevision: workspaceRevision,
    });
    const source = {
      sourceRef: resolved.sourceRef,
      sourceRevision: resolved.sourceRevision,
      contentDigest: resolved.contentDigest,
      byteLength: resolved.byteLength,
      bytes: resolved.bytes,
    };
    const sourceBase = {
      sourceRef: source.sourceRef,
      sourceRevision: source.sourceRevision,
      sourceContentDigest: source.contentDigest,
      byteLength: source.byteLength,
    };

    if (path.extname(sourceRef).toLowerCase() === '.md') {
      fileAudits.push({ ...sourceBase, status: 'SKIPPED_NON_CODE_NO_REGEX' });
      continue;
    }
    if (!['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.svelte'].includes(path.extname(sourceRef).toLowerCase())) {
      fileAudits.push({ ...sourceBase, status: 'SKIPPED_UNSUPPORTED_LANGUAGE' });
      continue;
    }

    let sourceText;
    try {
      sourceText = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes);
    } catch {
      fileAudits.push({ ...sourceBase, status: 'REJECTED_INVALID_UTF8' });
      continue;
    }
    if (!Buffer.from(sourceText, 'utf8').equals(source.bytes)) throw new Error('SOURCE_UTF8_ROUNDTRIP_MISMATCH');

    sidecarRequests += 1;
    let response;
    try {
      response = await fetchImpl(`${sidecarUrl.replace(/\/$/, '')}/ast/chunk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          source: sourceText,
          file_path: source.sourceRef,
          language: 'typescript',
          source_ref: source.sourceRef,
          source_revision: source.sourceRevision,
          workspace_revision: workspaceRevision,
        }),
      });
    } catch (error) {
      sidecarFailures += 1;
      fileAudits.push({ ...sourceBase, status: 'SIDECAR_REQUEST_FAILED', error: String(error?.message ?? error) });
      continue;
    }
    if (!response.ok) {
      sidecarFailures += 1;
      fileAudits.push({ ...sourceBase, status: 'SIDECAR_HTTP_ERROR', httpStatus: response.status });
      continue;
    }

    let ast;
    try {
      ast = await response.json();
    } catch {
      sidecarFailures += 1;
      fileAudits.push({ ...sourceBase, status: 'SIDECAR_RESPONSE_INVALID_JSON' });
      continue;
    }
    if (ast.file_path !== source.sourceRef || ast.source_revision !== source.sourceRevision) {
      sidecarFailures += 1;
      fileAudits.push({ ...sourceBase, status: 'SIDECAR_LINEAGE_MISMATCH' });
      continue;
    }
    if (ast.syntax_status !== 'CLEAN') {
      fileAudits.push({
        ...sourceBase,
        status: 'PARSER_NOT_CLEAN_NO_PROPOSALS',
        syntaxStatus: ast.syntax_status ?? null,
        engine: ast.engine ?? null,
        engineVersion: ast.engine_version ?? null,
      });
      continue;
    }

    const localTypes = {};
    let validProposals = 0;
    for (const edge of ast.edges ?? []) {
      const type = String(edge.type ?? 'UNKNOWN');
      localTypes[type] = (localTypes[type] ?? 0) + 1;
      rawEdgeTypes[type] = (rawEdgeTypes[type] ?? 0) + 1;
      if (type !== 'CALLS') continue;
      const byteSpan = edge.occurrence_byte_spans?.[0];
      try {
        const spanEvidence = verifySnapshotUtf8ByteSpan({ bytes: source.bytes, byteSpan });
        if (!spanEvidence.text.trim()) {
          invalidSpans += 1;
          continue;
        }
        proposals.push(buildProposal({ source, workspaceRevision, edge, byteSpan, spanEvidence }));
        validProposals += 1;
      } catch {
        invalidSpans += 1;
      }
    }
    fileAudits.push({
      ...sourceBase,
      status: 'CLEAN',
      engine: ast.engine ?? null,
      engineVersion: ast.engine_version ?? null,
      rawEdgeTypes: localTypes,
      verifiedCallProposals: validProposals,
      diagnosticCount: Array.isArray(ast.diagnostics) ? ast.diagnostics.length : 0,
    });
  }

  const proposalsById = new Map();
  for (const proposal of proposals) {
    const existing = proposalsById.get(proposal.proposal_id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(proposal)) throw new Error('NONIDENTICAL_PROPOSAL_ID_COLLISION');
    if (!existing) proposalsById.set(proposal.proposal_id, proposal);
  }
  const uniqueProposals = [...proposalsById.values()].sort((left, right) =>
    left.source_ref.localeCompare(right.source_ref)
      || left.evidence_span.occurrence_byte_span[0] - right.evidence_span.occurrence_byte_span[0]
      || left.proposal_id.localeCompare(right.proposal_id));
  const proposalBytes = Buffer.from(uniqueProposals.map((proposal) => JSON.stringify(proposal)).join('\n')
    + (uniqueProposals.length ? '\n' : ''), 'utf8');
  const proposalsSha256 = digest(proposalBytes);
  const persistenceValidation = validateProposalsForPersistence({
    proposals: uniqueProposals,
    terminalExecutionReceipt: null,
    expectedWorkspaceRevision: workspaceRevision,
  });
  const outputSuffix = `-${runId}`;
  const proposalsName = `snapshot-bound-edge-proposals-canary-c636${outputSuffix}.jsonl`;
  const receiptName = `snapshot-bound-edge-canary-receipt-c636${outputSuffix}.json`;
  fs.mkdirSync(outputDir, { recursive: true });
  const proposalsPath = path.join(outputDir, proposalsName);
  const receiptPath = path.join(outputDir, receiptName);
  fs.writeFileSync(proposalsPath, proposalBytes, { flag: 'wx' });

  const relationCounts = {
    CALLS: uniqueProposals.filter((proposal) => proposal.predicate === 'CALLS').length,
    USES_DB: 0,
    USES_TOOL: 0,
  };
  const receiptBody = {
    schema: 'atlas.snapshot-bound-edge-canary-receipt.v1',
    status: sidecarFailures === 0 && invalidSpans === 0
      && !fileAudits.some((file) => file.status === 'PARSER_NOT_CLEAN_NO_PROPOSALS' || file.status === 'REJECTED_INVALID_UTF8')
      ? 'PROPOSALS_EMITTED_PERSISTENCE_GATED'
      : 'PROPOSAL_CANARY_PARTIAL',
    workspaceRevision,
    snapshotRevision,
    manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
    canaryFileCount: fileAudits.length,
    canaryFiles: fileAudits,
    sidecarRequests,
    sidecarFailures,
    sidecarOrigin,
    invalidSpans,
    duplicateProposalsRemoved: proposals.length - uniqueProposals.length,
    proposalCount: uniqueProposals.length,
    relationCounts,
    rawEdgeTypes,
    proposalArtifact: {
      path: path.relative(root, proposalsPath).replaceAll('\\', '/'),
      sha256: proposalsSha256,
      byteLength: proposalBytes.byteLength,
    },
    persistenceValidation,
    extractorImplementation: [
      {
        path: 'scripts/atlas/run-edge-extraction-canary-v1.mjs',
        sha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
      },
      {
        path: 'scripts/atlas/lib/snapshot-bound-edge-extractor-v1.mjs',
        sha256: digest(fs.readFileSync(path.join(__dirname, 'lib/snapshot-bound-edge-extractor-v1.mjs'))),
      },
    ],
    terminalExecutionLinkage: 'UNPROVEN',
    databaseWritesPerformed: false,
    canonicalAuthority: false,
    generatedAt: new Date().toISOString(),
  };
  const receipt = {
    ...receiptBody,
    checksumSha256: digest(JSON.stringify(receiptBody)),
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runId = process.argv.slice(2).find((argument) => argument.startsWith('--run-id='))?.slice('--run-id='.length);
  runSnapshotBoundEdgeExtractionCanaryV1({ ...(runId ? { runId } : {}) })
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error('[Canary] Failed:', error);
      process.exitCode = 1;
    });
}
