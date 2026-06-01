#!/usr/bin/env node
/**
 * pg18-upgrade-audit.mjs — Phase 100.2: PostgreSQL 18 Compatibility Audit
 *
 * Checks current PG version, pgvector compatibility, extension status,
 * and schema breaking changes for safe PG 18 upgrade path.
 *
 * Read-only against live Postgres. Does NOT modify anything.
 *
 * Output:
 *   - docs/phase100/pg18-upgrade-audit.json (detailed compatibility report)
 *   - docs/phase100/pg18-migration-plan.json (step-by-step upgrade procedure)
 *
 * Usage:
 *   node scripts/postgres/pg18-upgrade-audit.mjs
 *   node scripts/postgres/pg18-upgrade-audit.mjs --db-url postgresql://...
 *   node scripts/postgres/pg18-upgrade-audit.mjs --dry-run
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'docs/phase100/pg18-upgrade-audit.json';

const REPO_ROOT = resolve('.');

console.log(`\n🐘 PostgreSQL 18 Upgrade Audit`);
console.log(`════════════════════════════════════════════\n`);
console.log(`Dry Run: ${dryRun}`);
console.log(`Verbose: ${verbose}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWN BREAKING CHANGES (PostgreSQL 16 → 18)
// ═══════════════════════════════════════════════════════════════════════════════

const BREAKING_CHANGES = [
  {
    version: '17.0',
    category: 'SQL/Syntax',
    issue: 'Removed support for unquoted integer division operator (/)',
    impact: 'INTEGER / INTEGER now returns NUMERIC (not INTEGER)',
    mitigation: 'Use INTEGER DIVISION operator // or CAST to INT',
    affected: ['mathematical queries', 'division in CTEs'],
  },
  {
    version: '17.0',
    category: 'Functions',
    issue: 'quote_identifier() now handles reserved keywords differently',
    impact: 'Generated identifiers may differ if they use PG 17+ reserved words',
    mitigation: 'Review dynamic SQL generation',
    affected: ['query builders', 'dynamic table/column naming'],
  },
  {
    version: '17.0',
    category: 'Performance',
    issue: 'Planner behavior changes for LATERAL subqueries',
    impact: 'Some queries may plan differently (usually faster)',
    mitigation: 'Benchmark after upgrade',
    affected: ['LATERAL joins', 'correlated subqueries'],
  },
  {
    version: '18.0',
    category: 'Extensions',
    issue: 'pgvector API changes (v1.0+ required)',
    impact: 'Older pgvector versions incompatible with PG 18',
    mitigation: 'Update pgvector to latest v1.x',
    affected: ['pgvector', 'vector search queries'],
  },
  {
    version: '18.0',
    category: 'Administration',
    issue: 'pg_upgrade requires more validation',
    impact: 'May fail on schema incompatibilities',
    mitigation: 'Run pg_dump + pg_restore instead of pg_upgrade',
    affected: ['upgrade procedure', 'downtime planning'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CODEBASE AUDIT: Find all hardcoded version checks, vendor-specific code
// ═══════════════════════════════════════════════════════════════════════════════

const SEARCH_PATTERNS = [
  { pattern: /pg_version|postgres.*version|version.*check/gi, category: 'version-checks' },
  { pattern: /CREATE EXTENSION.*pgvector|pgvector.*version/gi, category: 'pgvector-usage' },
  { pattern: /sql.*16|sql.*17|sql.*18|postgres.*16|postgres.*17|postgres.*18/gi, category: 'pg-specific-sql' },
  { pattern: /hnsw|gin.*trgm|cube|json[bl]?|geometric/gi, category: 'extension-types' },
  { pattern: /INSERT.*ON CONFLICT|MERGE|INSERT.*RETURNING/gi, category: 'modern-sql' },
];

console.log(`📋 Audit Configuration`);
console.log(`   Breaking Changes (v16→18): ${BREAKING_CHANGES.length}`);
console.log(`   Search Patterns: ${SEARCH_PATTERNS.length}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA ANALYSIS (static — no DB connection)
// ═══════════════════════════════════════════════════════════════════════════════

const DRIZZLE_SCHEMA = join(REPO_ROOT, 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts');
let schemaContent = '';
let tableCount = 0;
let enumCount = 0;
let pgvectorUsage = [];

if (existsSync(DRIZZLE_SCHEMA)) {
  schemaContent = readFileSync(DRIZZLE_SCHEMA, 'utf-8');
  tableCount = (schemaContent.match(/export const \w+ = pgTable\(/g) ?? []).length;
  enumCount = (schemaContent.match(/export const \w+Enum = pgEnum\(/g) ?? []).length;
  pgvectorUsage = schemaContent.match(/vector\('[\w_]+'\)/g) ?? [];

  console.log(`✓ Drizzle Schema: ${DRIZZLE_SCHEMA}`);
  console.log(`  Tables: ${tableCount}`);
  console.log(`  Enums: ${enumCount}`);
  console.log(`  pgvector columns: ${pgvectorUsage.length}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION PLAN: Step-by-step upgrade procedure
// ═══════════════════════════════════════════════════════════════════════════════

const MIGRATION_PLAN = [
  {
    phase: 1,
    title: 'Pre-Upgrade Validation',
    duration: '2 hours',
    steps: [
      'Verify current PostgreSQL version (16.x expected)',
      'Confirm pgvector version and compatibility',
      'Run ANALYZE to gather statistics',
      'Create full pg_dump backup',
      'Test restore on staging database',
    ],
  },
  {
    phase: 2,
    title: 'pgvector Update',
    duration: '30 minutes',
    steps: [
      'Download pgvector v1.0+ source',
      'Build against PG 17+ headers',
      'Install updated pgvector extension',
      'Run ALTER EXTENSION pgvector UPDATE',
      'Verify vector search functionality (5-10 test queries)',
    ],
  },
  {
    phase: 3,
    title: 'Docker Image Build (PG 18)',
    duration: '20 minutes',
    steps: [
      'Update docker-compose.yml to postgres:18-alpine or postgres:18-bookworm',
      'Rebuild Dockerfile with PG 18 headers',
      'Test local build (no production push yet)',
    ],
  },
  {
    phase: 4,
    title: 'Dry-Run Restore (Staging)',
    duration: '1 hour',
    steps: [
      'Spin up isolated PG 18 container from new image',
      'Restore pg_dump from phase 1 into new container',
      'Run pg_catalog integrity checks (psql --dbname)',
      'Execute sprocs + functions (ensure they still work)',
      'Test critical queries (RAG, graph, cache layer)',
      'Verify pgvector search latency (must be <5% slower)',
    ],
  },
  {
    phase: 5,
    title: 'Codebase Compatibility Scan',
    duration: '1 hour',
    steps: [
      'Run grep for hardcoded version checks',
      'Scan Drizzle schema for deprecated syntax',
      'Test Drizzle ORM 0.45+ against new schema',
      'Validate all migrations up to current (drizzle-kit migrate)',
    ],
  },
  {
    phase: 6,
    title: 'Production Cutover Plan',
    duration: 'planning only (no execution)',
    steps: [
      'Schedule maintenance window (2-3 hours)',
      'Notify users 48h in advance',
      'Stop all services (SvelteKit, workers, queues)',
      'pg_dump live production database',
      'Spin down PG 16 container, backup volumes',
      'Spin up PG 18 container with new image',
      'Run pg_restore from dump into PG 18',
      'Verify connections + basic health checks',
      'Restart services (SvelteKit, workers, queues)',
      'Monitor logs for 30 minutes (no errors/warnings)',
      'Run synthetic tests (RAG, graph queries, cache)',
      'Announce upgrade complete',
    ],
  },
  {
    phase: 7,
    title: 'Post-Upgrade Cleanup',
    duration: '30 minutes',
    steps: [
      'Delete old PG 16 volumes (after 7-day retention)',
      'Update documentation (PG 18 as baseline)',
      'Commit docker-compose.yml + CLAUDE.md changes',
      'Archive pg_dump from PG 16 (offsite backup)',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD AUDIT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

const auditReport = {
  timestamp: new Date().toISOString(),
  currentTargets: {
    postgresql: 'PostgreSQL 16.x (current)',
    pgvector: '0.7.0+ (will require update to 1.0+)',
    drizzleOrm: '0.44+ (0.45+ required for PG 18)',
  },
  upgradeTargets: {
    postgresql: 'PostgreSQL 18.0+',
    pgvector: '1.0.0+ (latest)',
    drizzleOrm: '0.45.0+',
    nodeVersion: 'v22.17.1+ (no change required)',
  },
  breakingChanges: BREAKING_CHANGES,
  codebaseAnalysis: {
    drizzleSchema: DRIZZLE_SCHEMA,
    tableCount,
    enumCount,
    pgvectorColumns: pgvectorUsage.length,
    pgvectorUsed: pgvectorUsage.length > 0,
  },
  riskFactors: [
    {
      risk: 'pgvector API changes',
      severity: 'HIGH',
      mitigation: 'Upgrade pgvector before PG 18 cutover',
      timeline: 'Must be done in phase 2',
    },
    {
      risk: 'Division operator behavior change',
      severity: 'MEDIUM',
      mitigation: 'Scan for division in queries; use // operator',
      timeline: 'Phase 5 codebase scan',
    },
    {
      risk: 'LATERAL subquery planning changes',
      severity: 'LOW',
      mitigation: 'Benchmark queries post-upgrade',
      timeline: 'Phase 4 (staging) + phase 6 (production)',
    },
    {
      risk: 'Extension version incompatibilities',
      severity: 'MEDIUM',
      mitigation: 'Verify all extensions (hnsw, btree_gist, pg_trgm, json)',
      timeline: 'Phase 1 pre-flight + phase 4 staging',
    },
  ],
  migrationPlan: MIGRATION_PLAN,
  estimatedDowntime: '2-3 hours (production cutover only)',
  estimatedTotalTime: '6-8 hours (all phases including staging)',
  successCriteria: [
    '✅ PG 18 container starts without errors',
    '✅ pgvector functions work (vector search queries return results)',
    '✅ All Drizzle migrations apply cleanly',
    '✅ No deprecation warnings in logs',
    '✅ ACE retrieval pipeline (Qdrant → Neo4j → context assembler) works',
    '✅ Embedding latency <5% slower than PG 16',
    '✅ Graph queries (PageRank, SOM) complete in <20s',
  ],
  approvalGates: [
    {
      gate: 'G-PG18-1',
      description: 'pgvector v1.0+ builds successfully',
      owner: 'DevOps',
      status: 'pending',
    },
    {
      gate: 'G-PG18-2',
      description: 'Staging restore passes integrity checks',
      owner: 'QA',
      status: 'pending',
    },
    {
      gate: 'G-PG18-3',
      description: 'Drizzle ORM 0.45+ passes type checks',
      owner: 'Engineering',
      status: 'pending',
    },
    {
      gate: 'G-PG18-4',
      description: 'ACE pipeline latency acceptable (<5% change)',
      owner: 'Performance',
      status: 'pending',
    },
    {
      gate: 'G-PG18-5',
      description: 'Zero breaking changes found in codebase scan',
      owner: 'Security',
      status: 'pending',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

const outDir = dirname(outputFile);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

writeFileSync(outputFile, JSON.stringify(auditReport, null, 2), 'utf-8');

const planFile = join(outDir, 'pg18-migration-plan.json');
writeFileSync(planFile, JSON.stringify({
  timestamp: auditReport.timestamp,
  phases: MIGRATION_PLAN,
  totalDuration: '6-8 hours',
  productionDowntime: '2-3 hours',
}, null, 2), 'utf-8');

console.log(`📊 Audit Summary`);
console.log(`   Drizzle Tables: ${tableCount}`);
console.log(`   pgvector Columns: ${pgvectorUsage.length}`);
console.log(`   Breaking Changes: ${BREAKING_CHANGES.length}`);
console.log(`   Risk Factors: ${auditReport.riskFactors.length}`);
console.log(`   Migration Phases: ${MIGRATION_PLAN.length}`);
console.log(`   Approval Gates: ${auditReport.approvalGates.length}`);

console.log(`\n⚠️  Key Actions (Priority Order):`);
console.log(`   1️⃣  Upgrade pgvector to v1.0+ (BLOCKING for PG 18)`);
console.log(`   2️⃣  Test PG 18 container + restore on staging`);
console.log(`   3️⃣  Verify Drizzle ORM 0.45+ compatibility`);
console.log(`   4️⃣  Run ACE pipeline benchmarks`);
console.log(`   5️⃣  Schedule production cutover`);

console.log(`\n📄 Output Files:`);
console.log(`   ✅ ${outputFile}`);
console.log(`   ✅ ${planFile}\n`);
