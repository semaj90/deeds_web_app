#!/usr/bin/env node
/**
 * Svelte 5 Migration Priority List Generator
 *
 * Analyzes the 462 remaining files that need Svelte 5 migration and:
 * 1. Ranks by import centrality (migrate shared components first)
 * 2. Groups by feature domain (evidence, cases, AI, etc.)
 * 3. Detects migration complexity (simple vs. complex patterns)
 * 4. Generates step-by-step migration plan
 *
 * Uses Qdrant indexed data + PostgreSQL dependency graph
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import pkg from 'pg';
const { Client: PgClient } = pkg;

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const pgClient = new PgClient({
  connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
});

// =============================================================================
// Svelte 5 Pattern Detection
// =============================================================================
const SVELTE5_PATTERNS = {
  hasRunes: /\$state|\$derived|\$effect|\$props/,
  hasOldReactive: /\$:\s*\w+\s*=/,
  hasExportLet: /export\s+let\s+\w+/,
  hasOnMount: /onMount\(/,
  hasStores: /import\s+{[^}]*writable|readable|derived[^}]*}\s+from\s+['"]svelte\/store['"]/,
  hasNewComponent: /new\s+\w+\(\{/,
  hasSlots: /<slot\s+/,
  hasBindThis: /bind:this=/
};

// =============================================================================
// Analyze File Migration Complexity
// =============================================================================
function analyzeMigrationComplexity(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');

    const complexity = {
      score: 0,
      patterns: [],
      difficulty: 'simple'
    };

    // Already migrated
    if (SVELTE5_PATTERNS.hasRunes.test(content)) {
      return { ...complexity, difficulty: 'already-migrated' };
    }

    // Check for old patterns
    if (SVELTE5_PATTERNS.hasOldReactive.test(content)) {
      complexity.score += 3;
      complexity.patterns.push('reactive-declarations');
    }

    if (SVELTE5_PATTERNS.hasExportLet.test(content)) {
      complexity.score += 2;
      complexity.patterns.push('export-let');
    }

    if (SVELTE5_PATTERNS.hasOnMount.test(content)) {
      complexity.score += 2;
      complexity.patterns.push('onMount');
    }

    if (SVELTE5_PATTERNS.hasStores.test(content)) {
      complexity.score += 4;
      complexity.patterns.push('writable-stores');
    }

    if (SVELTE5_PATTERNS.hasNewComponent.test(content)) {
      complexity.score += 5;
      complexity.patterns.push('new-component-instantiation');
    }

    if (SVELTE5_PATTERNS.hasSlots.test(content)) {
      complexity.score += 1;
      complexity.patterns.push('slots');
    }

    if (SVELTE5_PATTERNS.hasBindThis.test(content)) {
      complexity.score += 1;
      complexity.patterns.push('bind-this');
    }

    // Classify difficulty
    if (complexity.score === 0) {
      complexity.difficulty = 'simple';
    } else if (complexity.score <= 5) {
      complexity.difficulty = 'medium';
    } else {
      complexity.difficulty = 'complex';
    }

    return complexity;
  } catch (error) {
    return { score: 0, patterns: [], difficulty: 'error' };
  }
}

// =============================================================================
// Query Files Needing Migration
// =============================================================================
async function queryFilesNeedingMigration() {
  console.log('📡 Querying files that need Svelte 5 migration...\n');

  const result = await qdrant.scroll('phase89_code_units', {
    filter: {
      must: [
        { key: 'unit_kind', match: { value: 'component' } }
      ]
    },
    limit: 2000,
    with_payload: true
  });

  const allComponents = result.points;
  console.log(`   Found: ${allComponents.length} Svelte components\n`);

  // Filter for files needing migration
  const needsMigration = [];
  const alreadyMigrated = [];

  for (const comp of allComponents) {
    const filePath = join(process.cwd(), '..', comp.payload.file_path);

    if (!existsSync(filePath)) continue;

    const complexity = analyzeMigrationComplexity(filePath);

    if (complexity.difficulty === 'already-migrated') {
      alreadyMigrated.push(comp);
    } else {
      needsMigration.push({
        ...comp,
        complexity,
        filePath: comp.payload.file_path
      });
    }
  }

  console.log(`   ✅ Already migrated: ${alreadyMigrated.length}`);
  console.log(`   🔄 Needs migration: ${needsMigration.length}\n`);

  return { needsMigration, alreadyMigrated };
}

// =============================================================================
// Get Import Graph (Centrality)
// =============================================================================
async function getImportCentrality() {
  try {
    const result = await pgClient.query(`
      SELECT
        target_file,
        COUNT(*) as import_count
      FROM phase89_import_edges
      WHERE target_file LIKE '%.svelte'
      GROUP BY target_file
      ORDER BY import_count DESC
      LIMIT 500
    `);

    return result.rows.reduce((acc, row) => {
      acc[row.target_file] = row.import_count;
      return acc;
    }, {});
  } catch (error) {
    console.warn('Could not query import graph:', error.message);
    return {};
  }
}

// =============================================================================
// Rank Files by Priority
// =============================================================================
function rankByPriority(files, importCentrality) {
  return files.map(file => {
    const centrality = importCentrality[file.filePath] || 0;
    const complexity = file.complexity.score;

    // Priority formula: (centrality * 10) - complexity
    // High centrality + low complexity = highest priority
    const priority = (centrality * 10) - complexity;

    return {
      ...file,
      centrality,
      priority
    };
  }).sort((a, b) => b.priority - a.priority);
}

// =============================================================================
// Group by Feature Domain
// =============================================================================
function groupByFeature(files) {
  const groups = {
    evidence: [],
    cases: [],
    ai: [],
    citations: [],
    search: [],
    ui: [],
    auth: [],
    upload: [],
    visualization: [],
    other: []
  };

  for (const file of files) {
    const path = file.filePath.toLowerCase();
    const tags = file.payload?.feature_tags || '';

    if (path.includes('evidence') || tags.includes('evidence')) {
      groups.evidence.push(file);
    } else if (path.includes('case') || tags.includes('case')) {
      groups.cases.push(file);
    } else if (path.includes('ai') || path.includes('llm') || tags.includes('ai')) {
      groups.ai.push(file);
    } else if (path.includes('citation') || tags.includes('citation')) {
      groups.citations.push(file);
    } else if (path.includes('search') || tags.includes('search')) {
      groups.search.push(file);
    } else if (path.includes('/ui/') || tags === 'ui') {
      groups.ui.push(file);
    } else if (path.includes('auth') || tags.includes('auth')) {
      groups.auth.push(file);
    } else if (path.includes('upload') || tags.includes('upload')) {
      groups.upload.push(file);
    } else if (path.includes('viz') || path.includes('graph') || path.includes('canvas')) {
      groups.visualization.push(file);
    } else {
      groups.other.push(file);
    }
  }

  return groups;
}

// =============================================================================
// Generate Migration Report
// =============================================================================
function generateMigrationReport(ranked, grouped) {
  console.log('\n🔄 SVELTE 5 MIGRATION PRIORITY REPORT\n');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('📊 MIGRATION STATUS:\n');
  const total = ranked.length;
  const byDifficulty = {
    simple: ranked.filter(f => f.complexity.difficulty === 'simple').length,
    medium: ranked.filter(f => f.complexity.difficulty === 'medium').length,
    complex: ranked.filter(f => f.complexity.difficulty === 'complex').length
  };

  console.log(`   Total files to migrate: ${total}`);
  console.log(`   Simple (0-2 patterns): ${byDifficulty.simple}`);
  console.log(`   Medium (3-5 patterns): ${byDifficulty.medium}`);
  console.log(`   Complex (6+ patterns): ${byDifficulty.complex}\n`);

  console.log('🎯 TOP 20 HIGH-PRIORITY FILES (Migrate First):\n');
  ranked.slice(0, 20).forEach((file, i) => {
    console.log(`   ${i + 1}. ${file.filePath}`);
    console.log(`      Priority: ${file.priority.toFixed(0)} | Centrality: ${file.centrality} | Complexity: ${file.complexity.difficulty}`);
    if (file.complexity.patterns.length > 0) {
      console.log(`      Patterns: ${file.complexity.patterns.join(', ')}`);
    }
    console.log('');
  });

  console.log('📦 FILES BY FEATURE DOMAIN:\n');
  Object.entries(grouped).forEach(([domain, files]) => {
    if (files.length === 0) return;
    console.log(`   ${domain.toUpperCase()}: ${files.length} files`);
    files.slice(0, 3).forEach(f => {
      console.log(`      - ${f.filePath} (${f.complexity.difficulty})`);
    });
    if (files.length > 3) {
      console.log(`      ... and ${files.length - 3} more`);
    }
    console.log('');
  });

  console.log('📋 MIGRATION PLAN:\n');
  console.log('   Phase 1: Simple, High-Centrality Components (Week 1)');
  const phase1 = ranked.filter(f => f.complexity.difficulty === 'simple' && f.centrality > 5).slice(0, 20);
  console.log(`      Files: ${phase1.length}`);
  phase1.slice(0, 5).forEach(f => console.log(`         - ${f.filePath}`));
  console.log('');

  console.log('   Phase 2: Medium Complexity, Core Features (Week 2)');
  const phase2 = ranked.filter(f =>
    f.complexity.difficulty === 'medium' &&
    (f.filePath.includes('evidence') || f.filePath.includes('case') || f.filePath.includes('ai'))
  ).slice(0, 30);
  console.log(`      Files: ${phase2.length}`);
  phase2.slice(0, 5).forEach(f => console.log(`         - ${f.filePath}`));
  console.log('');

  console.log('   Phase 3: Complex Patterns + Stores (Week 3-4)');
  const phase3 = ranked.filter(f => f.complexity.difficulty === 'complex');
  console.log(`      Files: ${phase3.length}`);
  phase3.slice(0, 5).forEach(f => console.log(`         - ${f.filePath}`));
  console.log('');

  console.log('💡 MIGRATION TIPS:\n');
  console.log('   1. $: reactive → $derived() for computed values');
  console.log('   2. export let → const { prop } = $props()');
  console.log('   3. onMount(() => {}) → $effect(() => {})');
  console.log('   4. writable() → $state() for local component state');
  console.log('   5. <slot> → {@render children?.()} or snippets');
  console.log('   6. bind:this → refs with $state()\n');
}

// =============================================================================
// Save Migration Plan
// =============================================================================
async function saveMigrationPlan(ranked, grouped) {
  const { mkdirSync } = await import('fs');
  const { join: pathJoin } = await import('path');

  const plan = {
    timestamp: new Date().toISOString(),
    totalFiles: ranked.length,
    phases: {
      phase1: {
        name: 'Simple, High-Centrality',
        files: ranked
          .filter(f => f.complexity.difficulty === 'simple' && f.centrality > 5)
          .slice(0, 20)
          .map(f => ({
            path: f.filePath,
            priority: f.priority,
            centrality: f.centrality,
            patterns: f.complexity.patterns
          }))
      },
      phase2: {
        name: 'Medium Complexity, Core Features',
        files: ranked
          .filter(f =>
            f.complexity.difficulty === 'medium' &&
            (f.filePath.includes('evidence') || f.filePath.includes('case') || f.filePath.includes('ai'))
          )
          .slice(0, 30)
          .map(f => ({
            path: f.filePath,
            priority: f.priority,
            centrality: f.centrality,
            patterns: f.complexity.patterns
          }))
      },
      phase3: {
        name: 'Complex Patterns',
        files: ranked
          .filter(f => f.complexity.difficulty === 'complex')
          .map(f => ({
            path: f.filePath,
            priority: f.priority,
            centrality: f.centrality,
            patterns: f.complexity.patterns
          }))
      }
    },
    byFeature: Object.entries(grouped).reduce((acc, [domain, files]) => {
      acc[domain] = files.map(f => ({
        path: f.filePath,
        difficulty: f.complexity.difficulty,
        patterns: f.complexity.patterns
      }));
      return acc;
    }, {})
  };

  const reportDir = pathJoin(process.cwd(), 'reports');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  const planPath = pathJoin(reportDir, 'svelte5-migration-plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`💾 Migration plan saved: ${planPath}\n`);
}// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  try {
    await pgClient.connect();

    const { needsMigration, alreadyMigrated } = await queryFilesNeedingMigration();
    const importCentrality = await getImportCentrality();
    const ranked = rankByPriority(needsMigration, importCentrality);
    const grouped = groupByFeature(ranked);

    generateMigrationReport(ranked, grouped);
    await saveMigrationPlan(ranked, grouped);

  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
