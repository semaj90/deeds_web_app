/**
 * DOC-13 read-only live proof.
 * Joins a grounded API-rule-shaped record to the existing symbol registry and
 * symbol-version owners. This script never inserts, updates, or deletes data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-13-symbol-mutual-index-live-v1.json');
const sourceAuthorityReportPath = path.resolve(root, 'docs/reports/current-source-authority-cohort-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

function matchApiRuleToSymbols(rule, rows) {
  const apiSymbol = String(rule.apiSymbol ?? '').trim();
  const documentationSourceRevision = String(rule.evidenceSpan?.sourceRevision ?? rule.sourceRevision ?? '').trim();
  if (!apiSymbol || !documentationSourceRevision) return { status: 'UNRESOLVED', reason: 'INCOMPLETE_DOCUMENT_PROVENANCE' };
  const named = rows.filter((row) => [row.canonical_qualified_name, row.canonical_name, row.canonical_key]
    .filter(Boolean).includes(apiSymbol));
  // The document extractor cannot author a code revision. Derive one only
  // from a unique exact-name SymbolVersion whose source revision is joined to
  // the admitted source-binding cohort by source_ref + revision + workspace
  // revision + content digest. Never compare doc and code revisions directly.
  const targetSourceRevision = String(rule.targetSourceRevision ?? '').trim();
  const qualified = named.filter((row) => row.binding_qualified === true);
  const revisionRows = targetSourceRevision
    ? qualified.filter((row) => row.source_revision === targetSourceRevision)
    : qualified;
  if (revisionRows.length === 0) {
    if (named.length === 0) return { status: 'UNRESOLVED', reason: 'SYMBOL_NOT_FOUND' };
    if (targetSourceRevision && qualified.length > 0) return { status: 'STALE_CODE_SOURCE', candidateCount: qualified.length };
    return { status: 'UNRESOLVED', reason: 'TARGET_CODE_SOURCE_REVISION_UNBOUND', candidateCount: named.length };
  }
  if (revisionRows.length > 1) return { status: 'AMBIGUOUS', candidateCount: revisionRows.length };
  const row = revisionRows[0];
  return {
    status: 'MATCHED_DOCUMENTATION_SYMBOL',
    stableSymbolId: row.stable_symbol_id,
    symbolVersionId: row.symbol_version_id,
    sourceRef: row.source_ref,
    documentationSourceRevision,
    codeSourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    registryRevision: row.registry_revision,
    targetRevisionDerivedFrom: targetSourceRevision ? 'EXPLICIT_EXACT_CODE_REVISION' : 'UNIQUE_EXACT_SYMBOL_SOURCE_BINDING',
    sourceAuthorityBinding: {
      sourceRef: row.binding_source_ref,
      sourceRevision: row.binding_source_revision,
      workspaceRevision: row.binding_workspace_revision,
      contentDigest: row.binding_content_digest,
      digestMatchesRevision: row.binding_digest_matches_revision === true,
    },
  };
}

const report = {
  schema: 'parent-atlas.doc-13-symbol-mutual-index-live.v1',
  gate: 'DOC-13',
  status: 'BLOCKED_UNPROVEN',
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  sourceOwners: ['atlas_symbol_registry', 'atlas_symbol_versions', 'atlas_workspace_source_bindings'],
  sourceAuthority: null,
  codeRevisionQualification: null,
  query: null,
  sample: null,
  match: null,
  evidence: [],
};

const pool = new pg.Pool({ connectionString });
try {
  const sourceAuthority = JSON.parse(await fs.readFile(sourceAuthorityReportPath, 'utf8'));
  const sourceAuthorityProven = sourceAuthority.status === 'CURRENT_SOURCE_AUTHORITY_PROVEN'
    && typeof sourceAuthority.workspaceRevision === 'string'
    && sourceAuthority.proof?.workspaceAuthorityProven === true
    && sourceAuthority.proof?.exactMembershipProven === true
    && sourceAuthority.proof?.sourceRevisionProven === true;
  report.sourceAuthority = {
    status: sourceAuthority.status ?? 'MISSING',
    workspaceRevision: sourceAuthority.workspaceRevision ?? null,
    sourceCount: sourceAuthority.sourceCount ?? null,
    receiptPath: path.relative(root, sourceAuthorityReportPath).replaceAll(path.sep, '/'),
    liveWorkingTreeDrift: sourceAuthority.liveWorkingTreeDrift ? {
      state: sourceAuthority.liveWorkingTreeDrift.state ?? null,
      admitted: sourceAuthority.liveWorkingTreeDrift.admitted ?? null,
      liveExactMatch: sourceAuthority.liveWorkingTreeDrift.liveExactMatch ?? null,
      changedSinceSeal: sourceAuthority.liveWorkingTreeDrift.changedSinceSeal ?? null,
      excludedNestedRepository: sourceAuthority.liveWorkingTreeDrift.excludedNestedRepository ?? null,
      unavailable: sourceAuthority.liveWorkingTreeDrift.unavailable ?? null,
      driftCount: sourceAuthority.liveWorkingTreeDrift.driftCount ?? null,
    } : null,
    admittedCohortProof: sourceAuthorityProven,
  };
  if (!sourceAuthorityProven) throw new Error('DOC13_CURRENT_SOURCE_AUTHORITY_COHORT_NOT_PROVEN');

  const result = await pool.query(`
    SELECT r.stable_symbol_id,
           r.canonical_key,
           r.canonical_name,
           r.canonical_qualified_name,
           r.registry_revision,
           v.symbol_version_id,
           v.source_ref,
           v.source_revision,
           v.workspace_revision,
           b.canonical_source_ref AS binding_source_ref,
           b.source_revision AS binding_source_revision,
           b.workspace_revision AS binding_workspace_revision,
           b.content_digest AS binding_content_digest,
           (v.source_revision = 'sha256:' || b.content_digest) AS binding_digest_matches_revision,
           TRUE AS binding_qualified
      FROM public.atlas_symbol_registry r
      JOIN public.atlas_symbol_versions v
        ON v.stable_symbol_id = r.stable_symbol_id
      JOIN public.atlas_workspace_source_bindings b
        ON b.repo_id = 'deeds-web-app'
       AND b.canonical_source_ref = v.source_ref
       AND b.source_revision = v.source_revision
       AND b.workspace_revision = v.workspace_revision
       AND v.source_revision = 'sha256:' || b.content_digest
     WHERE r.status = 'active'
       AND v.workspace_revision = $1
     ORDER BY r.canonical_key, v.source_ref, v.symbol_version_id
     LIMIT 200
  `, [sourceAuthority.workspaceRevision]);
  report.query = {
    tables: ['atlas_symbol_registry', 'atlas_symbol_versions', 'atlas_workspace_source_bindings'],
    rowsRead: result.rowCount,
    filter: 'active symbol versions in sealed source-authority workspace; exact source_ref/revision/workspace_revision/content_digest join',
    readOnly: true,
  };
  if (result.rowCount === 0) {
    report.evidence.push('ACTIVE_SYMBOL_VERSION_REGISTRY_EMPTY');
  } else {
    const row = result.rows[0];
    report.sample = {
      canonicalKey: row.canonical_key,
      canonicalName: row.canonical_name,
      canonicalQualifiedName: row.canonical_qualified_name,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
      registryRevision: row.registry_revision,
      symbolVersionId: row.symbol_version_id,
    };
    const apiSymbol = row.canonical_qualified_name || row.canonical_name || row.canonical_key;
    const text = `For version 1.0, use ${apiSymbol} with the documented default configuration.`;
    const sourceRevision = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
    const extractionResponse = await fetch('http://127.0.0.1:8095/extract/documentation-facts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        sourceUrl: 'https://example.invalid/doc-13-live-fixture',
        sourceRevision,
        productVersion: '1.0',
      }),
    });
    const extraction = await extractionResponse.json();
    report.extraction = {
      statusCode: extractionResponse.status,
      modelId: extraction.modelId ?? null,
      apiRuleCount: Array.isArray(extraction.apiRules) ? extraction.apiRules.length : 0,
      canonicalAuthority: extraction.canonicalAuthority ?? null,
    };
    const rules = Array.isArray(extraction.apiRules) ? extraction.apiRules : [];
    report.match = rules.length
      ? { extractedRule: rules[0], join: matchApiRuleToSymbols(rules[0], result.rows) }
      : { status: 'UNRESOLVED', reason: 'NO_API_RULE_EXTRACTED' };
    if (rules.length && report.match.join?.status === 'MATCHED_DOCUMENTATION_SYMBOL') {
      const matchedRule = rules[0];
      const matchedCodeRevision = report.match.join.codeSourceRevision;
      report.codeRevisionQualification = {
        status: 'QUALIFIED_FROM_UNIQUE_EXACT_SYMBOL_VERSION_BINDING',
        targetSourceRevisionWasSuppliedByExtractor: Boolean(matchedRule.targetSourceRevision),
        targetSourceRevisionDerivedByResolver: !matchedRule.targetSourceRevision,
        exactSourceBindingReadback: report.match.join.sourceAuthorityBinding,
        currentWorktreeEqualityClaimed: false,
      };
      const stale = matchApiRuleToSymbols({
        ...matchedRule,
        targetSourceRevision: 'sha256:stale-code-revision',
      }, result.rows);
      const unmapped = matchApiRuleToSymbols({
        ...matchedRule,
        apiSymbol: `${matchedRule.apiSymbol}.missing`,
      }, result.rows);
      const nameCounts = new Map();
      for (const candidate of result.rows) {
        for (const name of [candidate.canonical_qualified_name, candidate.canonical_name, candidate.canonical_key].filter(Boolean)) {
          const list = nameCounts.get(name) ?? [];
          if (!list.some((existing) => existing.symbol_version_id === candidate.symbol_version_id)) list.push(candidate);
          nameCounts.set(name, list);
        }
      }
      const ambiguousName = [...nameCounts.entries()].find(([, candidates]) => candidates.length > 1);
      const ambiguous = ambiguousName
        ? matchApiRuleToSymbols({ ...matchedRule, apiSymbol: ambiguousName[0] }, result.rows)
        : { status: 'NOT_OBSERVED', reason: 'NO_DUPLICATE_NAME_IN_READ_SAMPLE' };
      const unboundRows = result.rows.map((candidate) => ({ ...candidate, binding_qualified: false }));
      const unbound = matchApiRuleToSymbols(matchedRule, unboundRows);
      report.negativeMatrix = {
        staleCodeRevision: { status: stale.status, expected: 'STALE_CODE_SOURCE', passed: stale.status === 'STALE_CODE_SOURCE' },
        unmappedSymbol: { status: unmapped.status, expected: 'UNRESOLVED', passed: unmapped.status === 'UNRESOLVED' },
        unboundCodeRevision: { status: unbound.status, reason: unbound.reason, expected: 'TARGET_CODE_SOURCE_REVISION_UNBOUND', passed: unbound.status === 'UNRESOLVED' && unbound.reason === 'TARGET_CODE_SOURCE_REVISION_UNBOUND' },
        ambiguousLiveName: {
          name: ambiguousName?.[0] ?? null,
          status: ambiguous.status,
          expected: ambiguousName ? 'AMBIGUOUS' : 'NOT_OBSERVED',
          passed: ambiguousName ? ambiguous.status === 'AMBIGUOUS' : ambiguous.status === 'NOT_OBSERVED',
        },
        matchedCodeRevision,
      };
      report.evidence.push('LIVE_NEGATIVE_MATRIX_READ_ONLY');
      report.evidence.push('LIVE_CODE_SOURCE_REVISION_QUALIFIED_BY_SOURCE_BINDING');
    }
    report.evidence.push('READ_ONLY_EXACT_NAME_AND_SOURCE_REVISION_JOIN');
    if (report.match.join?.status === 'MATCHED_DOCUMENTATION_SYMBOL') report.status = 'LIVE_DOC_EXTRACTION_SYMBOL_JOIN_PROVEN';
  }
} catch (error) {
  report.status = 'BLOCKED_REGISTRY_QUERY';
  report.evidence.push(String(error?.message ?? error));
} finally {
  await pool.end();
}

report.reportChecksum = checksum({ ...report, reportChecksum: undefined });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, rowsRead: report.query?.rowsRead ?? null, writesPerformed: false }));
if (report.status === 'BLOCKED_REGISTRY_QUERY') process.exitCode = 1;
