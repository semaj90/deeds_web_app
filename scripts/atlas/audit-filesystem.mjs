#!/usr/bin/env node
/**
 * audit-filesystem.mjs
 *
 * Scans the entire codebase (3000+ files) and classifies each into feature domains.
 * Generates a file→feature mapping for Phase 100.1 consolidation.
 *
 * Output: docs/phase100/file-consolidation-audit.json
 *
 * Usage:
 *   node scripts/atlas/audit-filesystem.mjs
 *   node scripts/atlas/audit-filesystem.mjs --verbose
 *   node scripts/atlas/audit-filesystem.mjs --output custom-audit.json
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, extname, relative, dirname } from 'path';
import { createHash } from 'crypto';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'docs/phase100/file-consolidation-audit.json';

const REPO_ROOT = resolve('.');
const SRC_ROOT = join(REPO_ROOT, 'sveltekit-frontend', 'src');

console.log(`\n📂 Filesystem Audit — Feature Domain Classification`);
console.log(`════════════════════════════════════════════════════\n`);
console.log(`Repo Root: ${REPO_ROOT}`);
console.log(`Scan Root: ${SRC_ROOT}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAIN PATTERNS: path → feature classification
// ═══════════════════════════════════════════════════════════════════════════════

const DOMAIN_PATTERNS = [
  {
    domain: 'auth',
    patterns: [/\/auth\//i, /\/lucia\//i, /login/i, /session/i, /password/i, /credential/i, /users\//i],
    priority: 10,
  },
  {
    domain: 'rag',
    patterns: [
      /\/rag\//i, /retrieval/i, /search/i, /embedding/i, /chunk/i,
      /context-assembler/i, /rag-pipeline/i, /semanticsearch/i, /hyperrag/i,
      /evidence.*search/i, /search.*evidence/i, /corpus/i, /ace-client/i,
    ],
    priority: 9,
  },
  {
    domain: 'graph',
    patterns: [
      /\/graph\//i, /neo4j/i, /topology/i, /pagerank/i, /hypergraph/i, /cluster/i,
      /gpu.*graph/i, /graph.*gpu/i,
    ],
    priority: 9,
  },
  {
    domain: 'vector',
    patterns: [
      /\/vector\//i, /qdrant/i, /pgvector/i, /codebase-chunks/i,
      /semantic/i, /embedding/i, /gemma.*embed/i, /embed.*gemma/i,
    ],
    priority: 8,
  },
  {
    domain: 'llm',
    patterns: [
      /gemma/i, /ollama/i, /inference/i, /generation/i, /chat/i,
      /bifrost/i, /turbo/i, /qwen/i, /llama/i, /client-router/i, /client-llm/i,
      /synthesis/i, /grpo/i, /quantizer/i,
    ],
    priority: 8,
  },
  {
    domain: 'ui',
    patterns: [
      /components/i, /svelte$/i, /\.svelte$/i, /ui\//i,
      /dialog/i, /panel/i, /modal/i, /button/i, /input/i,
    ],
    priority: 7,
  },
  {
    domain: 'cache',
    patterns: [
      /cache/i, /redis/i, /loki/i, /indexeddb/i, /bifrost/i,
      /exact-match/i, /cache-key/i,
    ],
    priority: 7,
  },
  {
    domain: 'admin',
    patterns: [
      /admin/i, /audit/i, /monitoring/i, /health/i, /stats/i,
      /configuration/i, /settings/i, /dashboard/i,
    ],
    priority: 6,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN FILESYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const files = [];
const stats = {
  total: 0,
  byExtension: {},
  byDomain: {},
  unclassified: 0,
};

function scanDirectory(dir, rel = '') {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = join(rel, entry.name);

    // Skip: hidden, node_modules, build artifacts, git, etc.
    if (
      entry.name.startsWith('.') ||
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      relPath.includes('/.next/') ||
      relPath.includes('/.svelte-kit/')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, relPath);
    } else {
      const ext = extname(entry.name);
      if (['.ts', '.tsx', '.js', '.mjs', '.json', '.sql', '.md', '.svelte'].includes(ext)) {
        files.push({
          fullPath,
          relPath: relPath.replace(/\\/g, '/'),
          name: entry.name,
          ext,
        });

        stats.total++;
        stats.byExtension[ext] = (stats.byExtension[ext] ?? 0) + 1;
      }
    }
  }
}

console.log(`🔍 Scanning directory...`);
scanDirectory(SRC_ROOT);
console.log(`   Found ${stats.total} source files\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFY FILES INTO DOMAINS
// ═══════════════════════════════════════════════════════════════════════════════

const classified = [];

for (const file of files) {
  let assigned = null;
  let score = -1;

  // Find best-matching domain
  for (const domainConfig of DOMAIN_PATTERNS) {
    const matches = domainConfig.patterns.filter(p => p.test(file.relPath));
    if (matches.length > 0) {
      if (domainConfig.priority > score) {
        score = domainConfig.priority;
        assigned = domainConfig.domain;
      }
    }
  }

  const entry = {
    relPath: file.relPath,
    name: file.name,
    ext: file.ext,
    domain: assigned ?? 'unclassified',
    confidence: score >= 0 ? (score / 10).toFixed(2) : '0.00',
  };

  classified.push(entry);
  stats.byDomain[entry.domain] = (stats.byDomain[entry.domain] ?? 0) + 1;

  if (entry.domain === 'unclassified') {
    stats.unclassified++;
  }

  if (verbose) {
    console.log(`  [${entry.domain}] ${entry.relPath}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE AUDIT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

const auditReport = {
  timestamp: new Date().toISOString(),
  scanRoot: SRC_ROOT,
  stats,
  files: classified.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    return a.relPath.localeCompare(b.relPath);
  }),
};

// Create output directory if needed
const outputDir = dirname(outputFile);
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

writeFileSync(outputFile, JSON.stringify(auditReport, null, 2), 'utf-8');

console.log(`📊 Classification Summary\n`);
console.log(`   Total Files: ${stats.total}`);
console.log(`   By Extension:`);
Object.entries(stats.byExtension)
  .sort((a, b) => b[1] - a[1])
  .forEach(([ext, count]) => {
    console.log(`     ${ext || '(no ext)'}: ${count}`);
  });

console.log(`\n   By Domain:`);
Object.entries(stats.byDomain)
  .sort((a, b) => b[1] - a[1])
  .forEach(([domain, count]) => {
    const pct = ((count / stats.total) * 100).toFixed(1);
    console.log(`     ${domain}: ${count} (${pct}%)`);
  });

console.log(`\n✅ Audit complete! Written to: ${outputFile}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE CONSOLIDATION RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const recommendations = {
  timestamp: new Date().toISOString(),
  phases: [
    {
      phase: 'Create Directories',
      steps: [
        'mkdir -p src/lib/features/auth',
        'mkdir -p src/lib/features/rag',
        'mkdir -p src/lib/features/graph',
        'mkdir -p src/lib/features/vector',
        'mkdir -p src/lib/features/llm',
        'mkdir -p src/lib/features/ui',
        'mkdir -p src/lib/features/cache',
        'mkdir -p src/lib/features/admin',
      ],
    },
    {
      phase: 'Move Files (git mv)',
      count: stats.unclassified,
      note: `${stats.unclassified} unclassified files need manual review`,
    },
    {
      phase: 'Update Imports',
      count: stats.total,
      estimatedLines: stats.total * 2,
      note: 'Average 2 import statements per file',
    },
  ],
};

const recFile = join(dirname(outputFile), 'consolidation-recommendations.json');
writeFileSync(recFile, JSON.stringify(recommendations, null, 2), 'utf-8');

console.log(`📋 Recommendations written to: ${recFile}\n`);
