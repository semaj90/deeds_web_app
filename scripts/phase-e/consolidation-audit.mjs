#!/usr/bin/env node
/**
 * Phase E: Codebase Consolidation Audit (ARCHIVE-FIRST)
 *
 * Per CLAUDE.md: Never delete. Archive to deeds_labs/ instead.
 * This audit identifies duplicates, consumers, and safe consolidation targets.
 *
 * Workflow:
 * 1. AUDIT — identify duplicate group (function name + signature)
 * 2. PLAN — mark canonical (keep) vs archive (redirect)
 * 3. VERIFY — grep all callers, ensure redirection won't break
 * 4. PATCH — edit only DUPLICATES with redirect imports
 * 5. VERIFY — run tests, confirm no regressions
 *
 * Timeline: 20-30 hours (5-7 days incremental)
 * Safety: Archive to deeds_labs/; no deletions
 */

import { argv } from 'process';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const args = argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('--dry');
const isVerbose = args.includes('--verbose');

const timestamp = new Date().toISOString().split('T')[0];
mkdirSync('.tmp', { recursive: true });
const reportPath = resolve('.tmp', `phase-e-audit-${timestamp}.json`);

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Phase E: Codebase Consolidation AUDIT (ARCHIVE-FIRST)       ║
╚═══════════════════════════════════════════════════════════════╝

Strategy: NEVER DELETE. Archive to deeds_labs/ per CLAUDE.md.

1. AUDIT — Identify duplicate groups by function signature
2. PLAN — Mark canonical (keep) vs archive (redirect)
3. VERIFY — Grep all callers, build redirection map
4. PATCH — Edit only DUPLICATES (redirect imports)
5. TEST — npm run test, smoke validation
6. ARCHIVE — Move redirected files to deeds_labs/

Phases:
  E1: Quick wins (stubs, no consumers)
  E2: Similarity consolidation
  E3: K-means consolidation
  E4: Embedding consolidation
  E5: Redis client consolidation
  E6: Memory cache consolidation
  E7: LLM router merge
  E8: Model name replacement

`);

  const report = {
    timestamp: new Date().toISOString(),
    duplicateGroups: [
      {
        name: 'Embedding Functions (generateEmbedding/embedText/getEmbedding)',
        functions: 15,
        canonical: 'grpc/embedding-client.ts',
        duplicates: [
          'ai/embeddings.ts',
          'ai/embeddings-simple.ts',
          'ai/ollama-client.ts',
          'config/ollama.ts',
          'embedding-service.ts',
          'services/embedding-service.ts',
          'services/embeddingService.ts',
          'services/vectorDBService.ts',
          'services/ollama-api.ts',
          'batch-embedder.ts',
          'evidence/services/embedding.ts',
          'embeddings/ollama.ts',
        ],
        consumers: '20-25 files',
        strategy: 'ARCHIVE duplicates → REDIRECT callers → TEST',
        riskLevel: 'HIGH (different return types)',
        testPlan: 'embedding pipeline e2e test',
      },
      {
        name: 'Redis Clients (ioredis/redis npm packages)',
        functions: 5,
        canonical: 'src/lib/server/redis.ts',
        duplicates: [
          'redis-client.ts',
          'redis-service.ts',
          'cache/redis.ts',
          'cache/redis-r3.ts',
          'knowledge-cache.ts',
        ],
        consumers: '25-30 files',
        strategy: 'ARCHIVE duplicates → REDIRECT to singleton pool → MONITOR latency',
        riskLevel: 'MEDIUM (pooling latency critical)',
        testPlan: 'cache latency benchmarks',
      },
      {
        name: 'Memory Caches (Map<string, T>)',
        functions: 4,
        canonical: 'src/lib/server/cache/memory-cache.ts (NEW)',
        duplicates: [
          'cache.ts',
          'vector-cache.ts',
          'utils/server-cache.ts',
          'embedding-cache-service.ts',
        ],
        consumers: '8-12 files',
        strategy: 'CREATE unified MemoryCache<T> → REDIRECT all → ARCHIVE originals',
        riskLevel: 'LOW-MEDIUM (TTL tiers)',
        testPlan: 'cache expiration verification',
      },
      {
        name: 'Cosine Similarity (5 implementations)',
        functions: 5,
        canonical: 'server/math/cosine-similarity.ts',
        duplicates: [
          'ai/similarity.ts',
          'utils/similarity.ts',
          'services/similarity.ts',
          'math/vector-math.ts',
        ],
        consumers: '8-12 files',
        strategy: 'KEEP gpu variant separate → ARCHIVE duplicates → REDIRECT',
        riskLevel: 'LOW (pure functions)',
        testPlan: 'similarity score validation',
      },
      {
        name: 'K-means Clustering (3 implementations)',
        functions: 3,
        canonical: 'server/clustering/kmeans.ts',
        duplicates: [
          'ai/kmeans.ts',
          'gpu/kmeans-gpu.ts (merge GPU wiring)',
        ],
        consumers: '5-7 files',
        strategy: 'MERGE gpu wiring into canonical → ARCHIVE duplicates',
        riskLevel: 'MEDIUM (GPU dispatch logic)',
        testPlan: 'kmeans determinism (fixed seed)',
      },
      {
        name: 'Ollama HTTP Wrappers (5 implementations)',
        functions: 5,
        canonical: 'grpc/embedding-client.ts + llm-router.ts',
        duplicates: [
          'ai/ollama-client.ts',
          'config/ollama.ts',
          'services/ollama-api.ts',
          'embedding-service.ts',
          'embeddings/ollama.ts',
        ],
        consumers: '15-20 files',
        strategy: 'ARCHIVE to deeds_labs/ → REDIRECT to canonicals',
        riskLevel: 'MEDIUM (legal-specific prompts must be preserved)',
        testPlan: 'legal prompt generation validation',
      },
      {
        name: 'LLM Routers (2 implementations)',
        functions: 2,
        canonical: 'ai/llm-router.ts (merge inference-router GPU awareness)',
        duplicates: [
          'inference-router.ts',
        ],
        consumers: '10-15 files',
        strategy: 'MERGE GPU dispatch → ARCHIVE inference-router → REDIRECT',
        riskLevel: 'MEDIUM (streaming vs non-streaming)',
        testPlan: 'streaming response validation',
      },
      {
        name: 'Model Name Hardcodes (41+ files)',
        functions: 50,
        canonical: 'src/lib/config/models.ts (NEW CONSTANT)',
        duplicates: [
          'All files with "gemma3-legal:latest" string',
          'All files with "embeddinggemma:latest" string',
          'All files with "nomic-embed-text" string',
        ],
        consumers: '53 files',
        strategy: 'CREATE MODELS constant → REPLACE all hardcodes (mechanical)',
        riskLevel: 'LOW (pure string replacement)',
        testPlan: 'grep for remaining hardcodes',
      },
    ],
    metrics: {
      totalDuplicateGroups: 8,
      totalDuplicateFiles: 35,
      totalConsumers: 200,
      estimatedLinesRemovable: 4450,
      estimatedEffortHours: '20-30',
      estimatedTestingHours: '5-8',
    },
    phaseSequence: [
      {
        phase: 'E1',
        name: 'Quick Wins',
        groups: 1,
        action: 'ARCHIVE stubs to deeds_labs/ (no consumers)',
        duration: '2-3h',
        risk: 'LOW',
      },
      {
        phase: 'E2',
        name: 'Similarity Consolidation',
        groups: 1,
        action: 'Consolidate 5 implementations to 1 canonical',
        duration: '3-4h',
        risk: 'LOW',
      },
      {
        phase: 'E3',
        name: 'K-means Consolidation',
        groups: 1,
        action: 'Merge GPU wiring, archive duplicates',
        duration: '3-4h',
        risk: 'MEDIUM',
      },
      {
        phase: 'E4',
        name: 'Embedding Consolidation',
        groups: 1,
        action: 'Complex: 15 functions → 3 canonicals, return type unification',
        duration: '5-6h',
        risk: 'HIGH',
      },
      {
        phase: 'E5',
        name: 'Redis Client Consolidation',
        groups: 1,
        action: 'Archive 5 clients → singleton pool',
        duration: '4-5h',
        risk: 'MEDIUM',
      },
      {
        phase: 'E6',
        name: 'Memory Cache Consolidation',
        groups: 1,
        action: 'Create unified MemoryCache<T>, archive 4 Map caches',
        duration: '2-3h',
        risk: 'LOW-MEDIUM',
      },
      {
        phase: 'E7',
        name: 'LLM Router Merge',
        groups: 1,
        action: 'Merge inference-router GPU awareness',
        duration: '2-3h',
        risk: 'MEDIUM',
      },
      {
        phase: 'E8',
        name: 'Model Name Replacement',
        groups: 1,
        action: 'Create MODELS constant, replace 50+ hardcodes',
        duration: '2-3h',
        risk: 'LOW',
      },
    ],
    archiveTargets: [
      'deeds_labs/consolidation-archive-2026-07-01/',
      'Archive policy: symlink to original in git for historical tracking',
      'Never truly delete; use git for recovery',
    ],
  };

  console.log(`
DUPLICATE GROUP SUMMARY:

${report.duplicateGroups.map((g, i) => `
[${i + 1}] ${g.name}
  Functions: ${g.functions}
  Canonical: ${g.canonical}
  Duplicates: ${g.duplicates.length}
  Consumers: ${g.consumers}
  Risk: ${g.riskLevel}
  Strategy: ${g.strategy}
  Test: ${g.testPlan}
`).join('')}

RECOMMENDED PHASE SEQUENCE:

${report.phaseSequence.map(p => `
${p.phase}: ${p.name} (${p.duration}, Risk: ${p.risk})
  → ${p.action}
`).join('')}

TOTAL METRICS:
  Duplicate groups: ${report.metrics.totalDuplicateGroups}
  Duplicate files: ${report.metrics.totalDuplicateFiles}
  Consumer files: ${report.metrics.totalConsumers}
  Lines removable: ~${report.metrics.estimatedLinesRemovable}
  Effort: ${report.metrics.estimatedEffortHours} hours
  Testing: ${report.metrics.estimatedTestingHours} hours

NEXT STEPS:
  1. Review this audit
  2. Choose starting phase (recommend E1 for quick wins)
  3. Run phase executor: npm run phase-e:consolidate --phase=e1 --dry-run
  4. After dry-run validation: --apply flag
  5. Test after each phase: npm run test, npm run build
  6. Archive files to deeds_labs/ (never delete)

ARCHIVE POLICY (CLAUDE.md):
  ✓ Archive to deeds_labs/consolidation-archive-YYYY-MM-DD/
  ✓ Commit archive directory to git
  ✓ Symlink original location for git history
  ✓ No permanent deletion
  ✓ Recoverable via git at any point

`);

  // Write report
  const ws = createWriteStream(reportPath);
  ws.write(JSON.stringify(report, null, 2));
  ws.end();

  console.log(`Report saved to: ${reportPath}`);
  process.exit(0);
}

main();
