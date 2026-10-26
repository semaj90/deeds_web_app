#!/usr/bin/env node
/**
 * plan-8095-calls-edge-population-c636.mjs
 *
 * Revision-bound dry-run plan wiring 8095 structural CALLS output
 * for admitted workspace revision sha256:c63620c4...
 *
 * Strict read-only: dbWritesPerformed is false. Zero database writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createGraphifySnapshotEvidenceBinderV1 } from './lib/graphify-snapshot-evidence-binder-v1.mjs';
import { verifySnapshotUtf8ByteSpan } from './lib/snapshot-bound-edge-extractor-v1.mjs';
import { qualifyGraphifyCallerSymbolV1 } from './lib/graphify-caller-symbol-qualification-v1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, '.tmp', 'atlas');

const NLP_8095_URL = process.env.NLP_8095_URL || 'http://localhost:8095';
const requestedLimit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 15);
if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 15) {
  throw new Error('LIMIT_MUST_BE_AN_INTEGER_FROM_1_TO_15');
}
const admission = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const manifestPath = path.resolve(ROOT, admission.manifestPath ?? '');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const snapshotRoot = path.join(ROOT, '.tmp/workspace-source-snapshots', manifest.snapshotRevision.replace(/^sha256:/, ''));
const sourceEvidenceBinder = createGraphifySnapshotEvidenceBinderV1({ admission, manifest, snapshotRoot });
const TARGET_WS_REVISION = admission.workspaceRevision;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  options: '-c default_transaction_read_only=on -c statement_timeout=15000',
  max: 2,
  idleTimeoutMillis: 5000,
});

function resolveLanguage(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  switch (ext) {
    case '.ts': case '.mts': return 'typescript';
    case '.js': case '.mjs': case '.cjs': return 'javascript';
    case '.svelte': return 'typescript';
    case '.py': return 'python';
    case '.cpp': case '.cc': case '.c': return 'cpp';
    default: return 'typescript';
  }
}

async function main() {
  console.log('=== 8095 CALLS Edge Population Dry-Run Plan (c636) ===');
  console.log(`Target Workspace Revision: ${TARGET_WS_REVISION}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Query sample candidate files from the committed 24,253 cohort
  const cohortRes = await pool.query(`
    SELECT f.file_id, f.source_ref, b.source_revision, count(s.symbol_id)::int as symbol_count
    FROM graphify_files f
    JOIN atlas_workspace_source_bindings b
      ON b.canonical_source_ref = f.source_ref
     AND b.workspace_revision = $1
     AND (b.source_revision = f.source_revision OR b.source_revision = f.code_source_revision)
     AND f.source_ref ~* '\\.(ts|tsx|js|jsx|mjs|cjs|svelte|py|cpp|cc|c)$'
     AND f.source_ref !~* '(^|/)(static|vendor|node_modules|dist|build)/'
     AND f.source_ref !~* '\\.min\\.(js|mjs|cjs)$'
    JOIN graphify_symbols s ON s.file_id = f.file_id
    GROUP BY f.file_id, f.source_ref, b.source_revision
    HAVING count(s.symbol_id) > 0
    ORDER BY count(s.symbol_id) DESC
    LIMIT $2
  `, [TARGET_WS_REVISION, requestedLimit]);

  console.log(`Audited candidate files with symbols: ${cohortRes.rows.length}`);

  const callsProposals = [];
  let filesScanned = 0;
  let filesWithCalls = 0;
  let totalCallsFound = 0;
  let callerSymbolsResolved = 0;
  let callerSymbolSpanMatches = 0;
  let callerSymbolLineageRejected = 0;
  let sidecarRequests = 0;
  let sidecarResponses = 0;
  let sidecarFailures = 0;
  let invalidCallSpans = 0;

  for (const row of cohortRes.rows) {
    let sourceEvidence;
    try {
      sourceEvidence = sourceEvidenceBinder.read({ sourceRef: row.source_ref });
    } catch (error) {
      console.log(`  Skip (snapshot readback refused): ${row.source_ref} (${error.message})`);
      continue;
    }
    if (sourceEvidence.sourceRevision !== row.source_revision) {
      console.log(`  Skip (database/snapshot revision mismatch): ${row.source_ref}`);
      continue;
    }
    const source = sourceEvidence.bytes.toString('utf8');

    // Query symbols for this file
    const symRes = await pool.query(`
      SELECT symbol_id, stable_symbol_key, qualified_name, start_byte, end_byte, metadata
      FROM graphify_symbols
      WHERE file_id = $1
      ORDER BY start_byte ASC
    `, [row.file_id]);

    const symbols = symRes.rows.map((s) => ({
      symbol_id: s.symbol_id,
      stable_symbol_key: s.stable_symbol_key,
      qualified_name: s.qualified_name,
      start_byte: Number(s.start_byte),
      end_byte: Number(s.end_byte),
      metadata: s.metadata,
    }));

    // Call 8095 /ast/chunk
    try {
      sidecarRequests++;
      const resp = await fetch(`${NLP_8095_URL}/ast/chunk`, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          file_path: row.source_ref,
          language: resolveLanguage(row.source_ref),
          source_ref: row.source_ref,
          source_revision: row.source_revision,
          workspace_revision: TARGET_WS_REVISION,
        }),
      });

      if (!resp.ok) {
        sidecarFailures++;
        const failureBody = (await resp.text()).replace(/\s+/g, ' ').slice(0, 300);
        console.log(`  8095 HTTP ${resp.status} on ${row.source_ref}: ${failureBody}`);
        continue;
      }

      sidecarResponses++;
      const astData = await resp.json();
      const rawCalls = (astData.edges || []).filter((e) => e.type === 'CALLS');
      filesScanned++;

      if (rawCalls.length > 0) {
        filesWithCalls++;
        totalCallsFound += rawCalls.length;

        for (const edge of rawCalls) {
          const byteSpan = edge.occurrence_byte_spans?.[0];
          if (!Array.isArray(byteSpan) || byteSpan.length !== 2
            || !Number.isSafeInteger(byteSpan[0]) || !Number.isSafeInteger(byteSpan[1])
            || byteSpan[0] < 0 || byteSpan[1] <= byteSpan[0] || byteSpan[1] > sourceEvidence.byteLength) {
            invalidCallSpans++;
            continue;
          }
          let spanEvidence;
          try {
            spanEvidence = verifySnapshotUtf8ByteSpan({ bytes: sourceEvidence.bytes, byteSpan });
          } catch (error) {
            invalidCallSpans++;
            continue;
          }
          const callStart = byteSpan[0];
          const callEnd = byteSpan[1];
          if (!spanEvidence.text.trim()) {
            console.log(`  Skip (empty byte span): ${row.source_ref}`);
            continue;
          }

          // Find innermost enclosing symbol in this file
          let enclosing = null;
          for (const sym of symbols) {
            if (sym.start_byte <= callStart && callEnd <= sym.end_byte) {
              if (!enclosing || (sym.end_byte - sym.start_byte) < (enclosing.end_byte - enclosing.start_byte)) {
                enclosing = sym;
              }
            }
          }

          let qualifiedEnclosing = null;
          if (enclosing) {
            callerSymbolSpanMatches++;
            const qualification = qualifyGraphifyCallerSymbolV1({
              symbol: enclosing,
              workspaceRevision: TARGET_WS_REVISION,
              sourceRevision: row.source_revision,
            });
            if (qualification.qualified) callerSymbolsResolved++;
            else callerSymbolLineageRejected++;
            if (qualification.qualified) qualifiedEnclosing = enclosing;
          }

          const proposalEdge = {
            schema: 'atlas.graphify-edge-candidate.v1',
            workspace_revision: TARGET_WS_REVISION,
            source_ref: row.source_ref,
            source_revision: row.source_revision,
            predicate: 'CALLS',
            subject_symbol_id: qualifiedEnclosing ? qualifiedEnclosing.symbol_id : null,
            subject_qualified_name: qualifiedEnclosing ? qualifiedEnclosing.qualified_name : null,
            subject_evidence_key: edge.from_evidence_key,
            object_symbol_id: null,
            unresolved_target: edge.to_evidence_key,
            evidence_kind: 'syntax_call_expression',
            evidence_span: {
              occurrence_byte_span: byteSpan,
              digest: spanEvidence.digest,
              start_line: spanEvidence.startLine,
              end_line: spanEvidence.endLine,
            },
            source_content_digest: sourceEvidence.contentDigest,
            source_byte_length: sourceEvidence.byteLength,
            confidence: 1.0,
            resolution_status: qualifiedEnclosing
              ? 'SUBJECT_RESOLVED_CALL_UNRESOLVED_TARGET'
              : enclosing
                ? 'SUBJECT_SYMBOL_CANDIDATE_UNQUALIFIED'
                : 'SUBJECT_UNRESOLVED',
            canonical_authority: false,
            admission_status: 'REVIEW_REQUIRED',
            persisted: false,
          };
          proposalEdge.proposal_id = crypto.createHash('sha256').update(JSON.stringify([
            proposalEdge.workspace_revision,
            proposalEdge.source_ref,
            proposalEdge.source_revision,
            proposalEdge.predicate,
            proposalEdge.subject_symbol_id,
            proposalEdge.unresolved_target,
            proposalEdge.evidence_span.occurrence_byte_span,
          ])).digest('hex');
          callsProposals.push(proposalEdge);
        }
      }
    } catch (err) {
      sidecarFailures++;
      console.log(`  Error querying 8095 on ${row.source_ref}: ${err.message}`);
    }
  }

  await pool.end();
  const uniqueProposals = [...new Map(callsProposals.map((proposal) => [proposal.proposal_id, proposal])).values()]
    .sort((left, right) => left.proposal_id.localeCompare(right.proposal_id));
  const runStamp = new Date().toISOString().replace(/[.:]/g, '-');
  const proposalArtifactPath = path.join(OUT_DIR, `calls-edge-proposals-${runStamp}.ndjson`);
  const proposalBytes = Buffer.from(uniqueProposals.map((proposal) => JSON.stringify(proposal)).join('\n') + (uniqueProposals.length ? '\n' : ''), 'utf8');
  fs.writeFileSync(proposalArtifactPath, proposalBytes);
  const proposalArtifactDigest = 'sha256:' + crypto.createHash('sha256').update(proposalBytes).digest('hex');

  const planReport = {
    schema: 'atlas.calls-edge-population-dryrun-plan.v1',
    generatedAt: new Date().toISOString(),
    status: sidecarResponses === 0 ? 'SIDECAR_UNAVAILABLE' : callsProposals.length === 0 ? 'NO_VALID_PROPOSALS' : 'PROPOSALS_EXTRACTED_REVIEW_REQUIRED',
    targetWorkspaceRevision: TARGET_WS_REVISION,
    dbWritesPerformed: false,
    canonicalAuthority: false,
    projectionWritesPerformed: false,
    sidecarSummary: { requests: sidecarRequests, successfulResponses: sidecarResponses, failures: sidecarFailures, invalidCallSpans },
    proposalArtifact: {
      path: path.relative(ROOT, proposalArtifactPath).replace(/\\/g, '/'),
      sha256: proposalArtifactDigest,
      byteLength: proposalBytes.byteLength,
      proposalCount: uniqueProposals.length,
      canonicalAuthority: false,
      persisted: false,
    },
    cohortSummary: {
      candidateFilesAudited: cohortRes.rows.length,
      filesScanned,
      filesWithCalls,
      totalCallsExtracted: totalCallsFound,
      validCallProposalCount: callsProposals.length,
      distinctProposalCount: uniqueProposals.length,
      callerSymbolsResolved,
      callerSymbolSpanMatches,
      callerSymbolLineageRejected,
      callerSymbolResolutionRate: totalCallsFound > 0 ? (callerSymbolsResolved / totalCallsFound) : 0,
    },
    sampleProposals: uniqueProposals.slice(0, 25),
    verificationStatement: sidecarResponses === 0
      ? 'No successful 8095 response was observed; no extraction success is claimed.'
      : callsProposals.length === 0
        ? '8095 returned responses but no byte-grounded CALLS proposals passed validation; no graph edge is claimed.'
        : '8095 CALLS observations were extracted from byte-verified snapshot sources. Caller symbol matches are byte-range containment candidates only; proposals remain review-required and no canonical graph resolution or persistence is claimed.',
  };

  const planPath = path.join(OUT_DIR, `calls-edge-population-plan-${runStamp}.json`);
  fs.writeFileSync(planPath, JSON.stringify(planReport, null, 2) + '\n');
  console.log(`\nDry-run plan saved: ${planPath}`);
  console.log(`Total CALLS extracted: ${totalCallsFound} across ${filesWithCalls} files`);
  console.log(`Revision-qualified caller symbols: ${callerSymbolsResolved}; span-only matches rejected by lineage: ${callerSymbolLineageRejected}`);
  console.log(`Review-only proposals: ${uniqueProposals.length}; artifact digest: ${proposalArtifactDigest}`);
  console.log('Zero database writes performed (read-only verification).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
