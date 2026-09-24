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
import { matchApiRuleToSymbols } from './lib/doc-symbol-mutual-index-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-13-symbol-mutual-index-live-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const report = {
  schema: 'parent-atlas.doc-13-symbol-mutual-index-live.v1',
  gate: 'DOC-13',
  status: 'BLOCKED_UNPROVEN',
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  sourceOwners: ['atlas_symbol_registry', 'atlas_symbol_versions'],
  query: null,
  sample: null,
  match: null,
  negativeMatrix: null,
  evidence: [],
};

const pool = new pg.Pool({ connectionString });
try {
  const result = await pool.query(`
    SELECT r.stable_symbol_id,
           r.canonical_key,
           r.canonical_name,
           r.canonical_qualified_name,
           r.registry_revision,
           v.symbol_version_id,
           v.source_ref,
           v.source_revision,
           v.workspace_revision
      FROM public.atlas_symbol_registry r
      JOIN public.atlas_symbol_versions v
        ON v.stable_symbol_id = r.stable_symbol_id
     WHERE r.status = 'active'
       AND v.source_revision ~ '^sha256:[0-9a-f]{64}$'
       AND v.workspace_revision ~ '^sha256:[0-9a-f]{64}$'
     ORDER BY r.canonical_key, v.source_ref, v.symbol_version_id
  `);
  report.query = {
    tables: ['atlas_symbol_registry', 'atlas_symbol_versions'],
    rowsRead: result.rowCount,
    filter: 'active registry rows with sha256 source_revision and workspace_revision',
    canonicalWrites: false,
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
    if (rules.length) {
      const matchedRule = rules[0];
      const stale = matchApiRuleToSymbols({
        ...matchedRule,
        targetSourceRevision: `sha256:${'c'.repeat(64)}`,
      }, result.rows);
      const unmapped = matchApiRuleToSymbols({
        ...matchedRule,
        apiSymbol: `${matchedRule.apiSymbol}.missing`,
      }, result.rows);
      const exactRevisionNameCounts = new Map();
      for (const candidate of result.rows) {
        for (const name of [candidate.canonical_qualified_name, candidate.canonical_name, candidate.canonical_key].filter(Boolean)) {
          const key = `${name}\u0000${candidate.source_revision}`;
          const list = exactRevisionNameCounts.get(key) ?? { name, sourceRevision: candidate.source_revision, rows: [] };
          if (!list.rows.some((existing) => existing.symbol_version_id === candidate.symbol_version_id)) list.rows.push(candidate);
          exactRevisionNameCounts.set(key, list);
        }
      }
      const ambiguousGroup = [...exactRevisionNameCounts.values()].find((group) => group.rows.length > 1);
      const ambiguous = ambiguousGroup
        ? matchApiRuleToSymbols({
          ...matchedRule,
          apiSymbol: ambiguousGroup.name,
          targetSourceRevision: ambiguousGroup.sourceRevision,
        }, result.rows)
        : { status: 'NOT_OBSERVED', reason: 'NO_DUPLICATE_NAME_AND_REVISION_GROUP' };
      const name = String(matchedRule.apiSymbol ?? '').trim();
      const registryCandidate = result.rows.find((candidate) =>
        [candidate.canonical_qualified_name, candidate.canonical_name, candidate.canonical_key]
          .filter(Boolean).includes(name),
      );
      const explicitRevisionControl = registryCandidate
        ? matchApiRuleToSymbols({
          ...matchedRule,
          targetSourceRevision: registryCandidate.source_revision,
        }, result.rows)
        : { status: 'UNRESOLVED', reason: 'NO_MATCHING_REGISTRY_NAME' };
      const missingCodeRevision = matchApiRuleToSymbols({
        ...matchedRule,
        targetSourceRevision: undefined,
      }, result.rows);
      report.negativeMatrix = {
        staleCodeRevision: { status: stale.status, expected: 'STALE_CODE_SOURCE', passed: stale.status === 'STALE_CODE_SOURCE' },
        unmappedSymbol: { status: unmapped.status, expected: 'UNRESOLVED', passed: unmapped.status === 'UNRESOLVED' },
        ambiguousLiveName: {
          name: ambiguousGroup?.name ?? null,
          exactCodeSourceRevision: ambiguousGroup?.sourceRevision ?? null,
          status: ambiguous.status,
          candidateCount: ambiguousGroup?.rows.length ?? 0,
          expected: ambiguousGroup ? 'AMBIGUOUS' : 'NOT_OBSERVED',
          passed: ambiguousGroup ? ambiguous.status === 'AMBIGUOUS' : ambiguous.status === 'NOT_OBSERVED',
        },
        explicitRevisionControl: {
          status: explicitRevisionControl.status,
          expected: 'MATCHED',
          passed: explicitRevisionControl.status === 'MATCHED',
          evidenceClass: 'registry-backed resolver control; not asserted to originate in documentation extraction',
        },
        missingCodeRevision: {
          status: missingCodeRevision.status,
          reason: missingCodeRevision.reason,
          expectedReason: 'TARGET_CODE_SOURCE_REVISION_MISSING',
          passed: missingCodeRevision.reason === 'TARGET_CODE_SOURCE_REVISION_MISSING',
        },
      };
      report.evidence.push('LIVE_SYMBOL_REVISION_FILTERED_COHORT', 'LIVE_NEGATIVE_MATRIX_READ_ONLY');
    }
    report.evidence.push('DOCUMENTATION_AND_CODE_REVISIONS_KEPT_SEPARATE');
    if (report.match.join?.status === 'MATCHED') report.status = 'LIVE_DOC_EXTRACTION_SYMBOL_JOIN_PROVEN';
    else if (report.match.join?.reason === 'TARGET_CODE_SOURCE_REVISION_MISSING') {
      report.status = 'LIVE_EXTRACTION_CODE_REVISION_UNBOUND';
    }
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
