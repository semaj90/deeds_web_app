#!/usr/bin/env node
/**
 * PRODUCE-AUTH-RESOURCE-MUTATION-01 (dry-run only, no Postgres writes)
 *
 * First producer for the OKF-specified `authorized_resource_mutation` predicate
 * (.okf/predicates/feature-relationships.yaml — allowed_degree: [ternary, nary] only,
 * required_entity_types: [feature, route, database_policy]). Per
 * openspec/changes/parent-atlas-ontology-kernel/tasks.md's
 * HYPERGRAPH-NARY-EVIDENCE-SOURCE-SURVEY-01 finding, zero producers referenced this
 * predicate anywhere in the repo before this script.
 *
 * Evidence source: the 18 real authenticated-mutating-route findings from root
 * CLAUDE.md's "G5 open finding — 18 authenticated mutating routes with zero Zod
 * validation" section (2026-09-01 /deep-audit) -- each row there already cites a
 * live-grepped auth-guard string per route. Reused here verbatim, not re-derived,
 * per this repo's Duplication Prevention rule (don't re-scan what's already
 * verified elsewhere).
 *
 * DRY RUN ONLY: builds + Zod-validates each candidate `FeatureRelationshipV1`
 * (participant_count / relationship_degree / relationship_degree_kind consistency,
 * cardinality-role checks -- all client-side, matching what
 * atlas_validate_relationship() would separately confirm in Postgres) and writes a
 * JSON receipt. Never calls persistRelationship() or touches the database. A real
 * --apply path is a separate, explicitly-authorized follow-up.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const { buildFeatureRelationship, featureRelationshipSchema } =
  await import(pathToFileURL(path.join(ROOT, 'packages/parent-atlas/dist/core/feature-intelligence.js')));

// Evidence: root CLAUDE.md, "G5 open finding" table (2026-09-01 /deep-audit).
// route: API path (leading slash, no method). authGuard: the literal grepped
// guard expression. file: the +server.ts this guard was found in.
const G5_ROUTES = [
  { route: '/api/admin/atlas/taxonomy-candidates', file: 'src/routes/api/admin/atlas/taxonomy-candidates/+server.ts', authGuard: 'requireAdmin(event)' },
  { route: '/api/admin/citations/discover', file: 'src/routes/api/admin/citations/discover/+server.ts', authGuard: 'locals.user || DEV_BYPASS_AUTH' },
  { route: '/api/admin/packets/enrich-labels', file: 'src/routes/api/admin/packets/enrich-labels/+server.ts', authGuard: "locals.user?.role !== 'admin'" },
  { route: '/api/analytics/research-summaries/[id]', file: 'src/routes/api/analytics/research-summaries/[id]/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/cases/[id]/export/pdf', file: 'src/routes/api/cases/[id]/export/pdf/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/codebase-index/cluster-assign', file: 'src/routes/api/codebase-index/cluster-assign/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/codebase-index/couchdb-pagerank', file: 'src/routes/api/codebase-index/couchdb-pagerank/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/codebase-index/index-stream', file: 'src/routes/api/codebase-index/index-stream/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/evidence/analyze', file: 'src/routes/api/evidence/analyze/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/evidence/[id]/gpu-analysis', file: 'src/routes/api/evidence/[id]/gpu-analysis/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/evidence/[id]/suggest-summary', file: 'src/routes/api/evidence/[id]/suggest-summary/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/files/[id]', file: 'src/routes/api/files/[id]/+server.ts', authGuard: 'locals.user || DEV_BYPASS_AUTH' },
  { route: '/api/library/ingest-codebase-docs', file: 'src/routes/api/library/ingest-codebase-docs/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/persons-of-interest/[id]/associates/[associateId]', file: 'src/routes/api/persons-of-interest/[id]/associates/[associateId]/+server.ts', authGuard: 'locals.user' },
  { route: '/api/persons-of-interest/[id]/gpu-analyze', file: 'src/routes/api/persons-of-interest/[id]/gpu-analyze/+server.ts', authGuard: 'locals.user?.id' },
  { route: '/api/phase89/analysis', file: 'src/routes/api/phase89/analysis/+server.ts', authGuard: 'locals.user' },
  { route: '/api/phase89/reindex', file: 'src/routes/api/phase89/reindex/+server.ts', authGuard: 'locals.user' },
  { route: '/api/reports/[id]/publish', file: 'src/routes/api/reports/[id]/publish/+server.ts', authGuard: 'locals.user' },
  { route: '/api/wiki/watch', file: 'src/routes/api/wiki/watch/+server.ts', authGuard: 'locals.user' },
];

function slugifyFeatureId(route) {
  const cleaned = route
    .replace(/^\/api\//, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `feature:${cleaned}`;
}

function classifyPolicy(authGuard) {
  if (authGuard.includes('requireAdmin')) return 'policy:admin-only';
  if (authGuard.includes("=== 'admin'") || authGuard.includes("!== 'admin'")) return 'policy:admin-only';
  if (authGuard.includes('DEV_BYPASS_AUTH')) return 'policy:authenticated-user-dev-bypass';
  return 'policy:authenticated-user';
}

const producerRevision = 'produce-authorized-resource-mutation-relationships-v1';
const relationshipRevision = 'dry-run-2026-09-07';
const sourceRevision = 'claude-md-g5-audit-2026-09-01';

const results = [];
for (const entry of G5_ROUTES) {
  const relationshipId = `rel:authorized_resource_mutation:${entry.route}`;
  const input = {
    relationship_id: relationshipId,
    relationship_type: 'authorized_resource_mutation',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: slugifyFeatureId(entry.route) },
      { role: 'route', entity_type: 'route', entity_id: `route:${entry.route}` },
      { role: 'database_policy', entity_type: 'database_policy', entity_id: classifyPolicy(entry.authGuard) },
    ],
    source_ref: entry.file,
    source_revision: sourceRevision,
    relationship_revision: relationshipRevision,
    producer_revision: producerRevision,
    confidence: 0.9,
    metadata: { authGuardLiteral: entry.authGuard, evidenceOrigin: 'CLAUDE.md G5 audit (2026-09-01 /deep-audit)' },
  };

  const built = buildFeatureRelationship(input);
  const parsed = featureRelationshipSchema.safeParse(built);

  results.push({
    route: entry.route,
    relationship_id: relationshipId,
    participant_count: built.participant_count,
    relationship_degree: built.relationship_degree,
    relationship_degree_kind: built.relationship_degree_kind,
    zodValid: parsed.success,
    zodErrors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
  });
}

const allValid = results.every((r) => r.zodValid);
const allTernary = results.every((r) => r.relationship_degree_kind === 'ternary');

const receipt = {
  schema: 'atlas.produce-authorized-resource-mutation-relationships.v1',
  status: allValid && allTernary ? 'DRY_RUN_PROVEN' : 'NOT_PROVEN',
  candidateCount: results.length,
  allZodValid: allValid,
  allTernary,
  postgresWritesPerformed: false,
  note: 'Zod-validated only (client-side, mirrors atlas_validate_relationship() semantics). No Postgres connection made. --apply is a separate, not-yet-built, explicitly-authorized follow-up.',
  results,
};

const outPath = path.join(ROOT, 'docs/reports/authorized-resource-mutation-dry-run-v1.json');
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2));

console.log(`Status: ${receipt.status}`);
console.log(`Candidates: ${receipt.candidateCount} | allZodValid: ${allValid} | allTernary: ${allTernary}`);
console.log(`Receipt: ${path.relative(ROOT, outPath)}`);
if (!allValid) {
  for (const r of results.filter((x) => !x.zodValid)) {
    console.log(`  INVALID ${r.route}: ${r.zodErrors.join('; ')}`);
  }
  process.exitCode = 1;
}
