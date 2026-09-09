#!/usr/bin/env node
/**
 * REL-01A8: audit-feature-ontology-source-span-revision-v1.mjs
 *
 * Independent, read-only source-revision + span validation for the 298
 * REL-01A7 multilane fresh-ontology review candidates
 * (docs/reports/feature-ontology-fresh-extraction-multilane-v1.json). This is
 * the next gate that receipt itself records (`nextGate:
 * "REL_01A8_INDEPENDENT_SOURCE_SPAN_REVISION_VALIDATION"`), separate from
 * REL-01A6's schema/shape contract and the REL-01A6-derived candidate
 * validation receipt's own next gate
 * ("HUMAN_REVIEW_AND_GROUNDED_SEMANTIC_VALIDATION_BEFORE_REL_01B").
 *
 * What this proves, independently of the extraction/merge pipeline's own
 * bookkeeping: for each of the 6 approved source files, does the live file on
 * disk right now hash to the exact sourceRevision every candidate for that
 * file claims? A mismatch means the candidate's evidence was extracted from
 * source bytes that no longer exist in the current workspace — it must be
 * re-extracted, not promoted, no matter how well-formed its shape is.
 *
 * Secondarily: for any candidate that DOES carry a grounded sourceSpan (none
 * do in this cohort, per groundedSources=0 in the merge summary — this is
 * checked, not assumed), verify the span is a valid byte range inside the
 * current file. This makes the check meaningful again the moment a future
 * grounded-extraction lane starts populating spans.
 *
 * Zero writes to Postgres/Qdrant/Neo4j/Valkey. Zero rewrites of the input
 * receipt. Does not unlock REL-01B on its own.
 *
 * Usage: node scripts/atlas/audit-feature-ontology-source-span-revision-v1.mjs
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const INPUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'feature-ontology-fresh-extraction-multilane-v1.json');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'feature-ontology-source-span-revision-v1.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'feature-ontology-source-span-revision-v1.md');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`Input receipt missing: ${INPUT_PATH}`);
    process.exitCode = 1;
    return;
  }
  const input = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  const candidates = input.candidates ?? [];
  const headRevision = gitHead();

  // ── Per-source-file live revision check (independent of the extraction run) ──
  const bySourceRef = new Map();
  for (const c of candidates) {
    if (!bySourceRef.has(c.sourceRef)) bySourceRef.set(c.sourceRef, []);
    bySourceRef.get(c.sourceRef).push(c);
  }

  const sourceRevisionResults = [];
  for (const [sourceRef, group] of bySourceRef) {
    const claimedRevision = group[0].sourceRevision; // all candidates for one source share it
    const claimedRevisionConsistent = group.every((c) => c.sourceRevision === claimedRevision);
    const absPath = path.join(REPO_ROOT, sourceRef);
    let liveRevision = null;
    let fileExists = false;
    if (existsSync(absPath)) {
      fileExists = true;
      const bytes = readFileSync(absPath);
      liveRevision = `sha256:${sha256Hex(bytes)}`;
    }
    const revisionMatch = fileExists && liveRevision === claimedRevision;
    sourceRevisionResults.push({
      sourceRef,
      claimedSourceRevision: claimedRevision,
      claimedRevisionConsistentAcrossCandidates: claimedRevisionConsistent,
      fileExistsLive: fileExists,
      liveSourceRevision: liveRevision,
      revisionMatch,
      candidateCount: group.length,
      verdict: !fileExists ? 'SOURCE_FILE_MISSING' : revisionMatch ? 'SOURCE_REVISION_CURRENT' : 'SOURCE_REVISION_STALE',
    });
  }

  // ── Per-candidate span verification (checked, not assumed absent) ──
  const spanResults = candidates.map((c) => {
    if (!c.sourceSpan) {
      return { candidateId: c.candidateId, sourceRef: c.sourceRef, verdict: 'NO_SPAN_CLAIMED' };
    }
    const absPath = path.join(REPO_ROOT, c.sourceRef);
    if (!existsSync(absPath)) {
      return { candidateId: c.candidateId, sourceRef: c.sourceRef, verdict: 'SOURCE_FILE_MISSING' };
    }
    const text = readFileSync(absPath, 'utf8');
    // Real shape (found 2026-09-08 after this check falsely flagged every grounded span as
    // out-of-bounds): grounded spans use startChar/endChar, not start/end.
    const { startChar, endChar, text: claimedText } = c.sourceSpan;
    const inBounds =
      Number.isInteger(startChar) && Number.isInteger(endChar) &&
      startChar >= 0 && endChar <= text.length && startChar < endChar;
    const textMatches = inBounds && typeof claimedText === 'string'
      ? text.slice(startChar, endChar) === claimedText
      : null;
    return {
      candidateId: c.candidateId,
      sourceRef: c.sourceRef,
      verdict: !inBounds ? 'SPAN_OUT_OF_BOUNDS' : textMatches === false ? 'SPAN_TEXT_MISMATCH' : 'SPAN_IN_BOUNDS',
    };
  });

  const verdictCounts = (arr) =>
    arr.reduce((acc, r) => {
      acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
      return acc;
    }, {});

  const staleSourceCount = sourceRevisionResults.filter((r) => r.verdict === 'SOURCE_REVISION_STALE').length;
  const missingSourceCount = sourceRevisionResults.filter((r) => r.verdict === 'SOURCE_FILE_MISSING').length;
  const allCurrent = staleSourceCount === 0 && missingSourceCount === 0;

  const report = {
    schema: 'atlas.feature-ontology-source-span-revision.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_INDEPENDENT_VALIDATION',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipWrites: false,
    gate: 'REL_01A8_INDEPENDENT_SOURCE_SPAN_REVISION_VALIDATION',
    inputReceipt: 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json',
    inputWorkspaceRevision: input.workspaceRevision ?? null,
    repositoryHeadRevision: headRevision,
    candidateCount: candidates.length,
    sourceCount: sourceRevisionResults.length,
    sourceRevisionResults,
    sourceRevisionVerdictCounts: verdictCounts(sourceRevisionResults),
    spanVerdictCounts: verdictCounts(spanResults),
    allSourcesCurrent: allCurrent,
    status: allCurrent ? 'ALL_SOURCE_REVISIONS_CURRENT' : 'SOURCE_REVISION_DRIFT_DETECTED',
    nextGate: allCurrent
      ? 'HUMAN_REVIEW_AND_GROUNDED_SEMANTIC_VALIDATION_BEFORE_REL_01B'
      : 'RE_EXTRACT_STALE_SOURCES_BEFORE_HUMAN_REVIEW',
  };
  report.checksum = `sha256:${sha256Hex(Buffer.from(JSON.stringify(report)))}`;

  mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const md = `# REL-01A8 — Independent Source-Span/Revision Validation

**Read-only.** Zero Postgres/Qdrant/Neo4j/Valkey writes. Generated: ${report.generatedAt}
Repository HEAD: \`${headRevision}\`
Input receipt workspace revision: \`${report.inputWorkspaceRevision}\`

## Status: **${report.status}**

Next gate: \`${report.nextGate}\`

## Per-source revision check (${report.sourceCount} sources, ${report.candidateCount} candidates)

| Source | Verdict | Candidates | Claimed revision | Live revision |
|---|---|---|---|---|
${sourceRevisionResults.map((r) => `| \`${r.sourceRef}\` | ${r.verdict} | ${r.candidateCount} | \`${r.claimedSourceRevision}\` | \`${r.liveSourceRevision ?? 'N/A'}\` |`).join('\n')}

## Span verdict counts

${Object.entries(report.spanVerdictCounts).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Source revision verdict counts

${Object.entries(report.sourceRevisionVerdictCounts).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}
`;
  writeFileSync(REPORT_MD, md);

  console.log(JSON.stringify({
    status: report.status,
    nextGate: report.nextGate,
    sourceRevisionVerdictCounts: report.sourceRevisionVerdictCounts,
    spanVerdictCounts: report.spanVerdictCounts,
    reportPath: 'docs/reports/feature-ontology-source-span-revision-v1.json',
  }, null, 2));
}

main();
