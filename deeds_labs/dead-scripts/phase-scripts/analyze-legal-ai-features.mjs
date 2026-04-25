#!/usr/bin/env node
/**
 * Analyze Legal-AI Feature Matching from Indexed Files
 *
 * Queries Qdrant phase89_code_units collection to:
 * 1. Identify all legal-ai related components/services
 * 2. Classify by feature (evidence, cases, AI, citations, etc.)
 * 3. Detect experiments vs. production code
 * 4. Flag Python/Go microservice bridges (CUDA, gRPC)
 * 5. Generate recommendations for cleanup
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import pkg from 'pg';
const { Client: PgClient } = pkg;

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const pgClient = new PgClient({
  connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
});

// =============================================================================
// Legal-AI Feature Categories
// =============================================================================
const LEGAL_FEATURES = {
  evidence: {
    keywords: ['evidence', 'exhibit', 'chain-of-custody', 'artifact'],
    critical: true,
    description: 'Evidence management and tracking'
  },
  cases: {
    keywords: ['case', 'matter', 'docket', 'proceeding'],
    critical: true,
    description: 'Case file management'
  },
  ai: {
    keywords: ['ai', 'llm', 'gemma', 'claude', 'gpt', 'ollama', 'rag'],
    critical: true,
    description: 'AI/LLM integration'
  },
  citations: {
    keywords: ['citation', 'statute', 'law', 'precedent', 'case-law'],
    critical: true,
    description: 'Legal citations and references'
  },
  search: {
    keywords: ['search', 'query', 'find', 'lookup'],
    critical: true,
    description: 'Search functionality'
  },
  upload: {
    keywords: ['upload', 'file', 'document', 'minio', 's3'],
    critical: true,
    description: 'Document upload and storage'
  },
  auth: {
    keywords: ['auth', 'login', 'user', 'session', 'jwt'],
    critical: true,
    description: 'Authentication and authorization'
  },
  database: {
    keywords: ['database', 'postgres', 'drizzle', 'sql', 'query'],
    critical: true,
    description: 'Database operations'
  },
  cache: {
    keywords: ['cache', 'redis', 'memory', 'store'],
    critical: true,
    description: 'Caching layer'
  },
  visualization: {
    keywords: ['graph', 'viz', 'canvas', '3d', 'neo4j', 'webgpu'],
    critical: false,
    description: 'Data visualization (optional)'
  },
  gaming: {
    keywords: ['n64', 'nes', 'game', 'retro', 'gaming'],
    critical: false,
    description: 'Gaming UI experiments (removable)'
  },
  experiments: {
    keywords: ['demo', 'test', 'experiment', 'prototype', '_archive'],
    critical: false,
    description: 'Experimental features (review for removal)'
  },
  bridges: {
    keywords: ['cuda', 'grpc', 'go-service', 'python', 'microservice'],
    critical: false,
    description: 'Language bridges (Python/Go/CUDA)'
  }
};

// =============================================================================
// Query All Files from Qdrant
// =============================================================================
async function queryAllFiles() {
  console.log('📡 Querying Qdrant for all indexed files...\n');

  const result = await qdrant.scroll('phase89_code_units', {
    limit: 5000,
    with_payload: true,
    with_vector: false
  });

  console.log(`   Found: ${result.points.length} indexed files\n`);
  return result.points;
}

// =============================================================================
// Classify Files by Legal-AI Feature
// =============================================================================
function classifyByFeature(files) {
  const classified = {};
  const unclassified = [];

  // Initialize categories
  Object.keys(LEGAL_FEATURES).forEach(key => {
    classified[key] = [];
  });

  for (const file of files) {
    const path = file.payload?.file_path || '';
    const tags = file.payload?.feature_tags || '';
    const signature = file.payload?.signature_text || '';
    const combined = `${path} ${tags} ${signature}`.toLowerCase();

    let matched = false;

    for (const [category, config] of Object.entries(LEGAL_FEATURES)) {
      const hasKeyword = config.keywords.some(kw => combined.includes(kw));

      if (hasKeyword) {
        classified[category].push({
          path,
          kind: file.payload?.unit_kind,
          tags,
          category
        });
        matched = true;
      }
    }

    if (!matched) {
      unclassified.push({ path, kind: file.payload?.unit_kind, tags });
    }
  }

  return { classified, unclassified };
}

// =============================================================================
// Detect Experiments and Removable Code
// =============================================================================
function detectRemovable(classified) {
  const removable = {
    experiments: [],
    gaming: [],
    oldArchived: [],
    unusedBridges: []
  };

  // Experiments and demos
  removable.experiments = classified.experiments.filter(f =>
    f.path.includes('demo') ||
    f.path.includes('test-') ||
    f.path.includes('experiment')
  );

  // Gaming UI (not core legal-ai)
  removable.gaming = classified.gaming;

  // Archived old code
  removable.oldArchived = Object.values(classified).flat().filter(f =>
    f.path.includes('_archive') ||
    f.path.includes('svelte4')
  );

  // Unused microservice bridges
  removable.unusedBridges = classified.bridges.filter(f =>
    f.path.includes('cuda') && f.path.includes('bridge') ||
    f.path.includes('grpc') && !f.path.includes('legal-engine')
  );

  return removable;
}

// =============================================================================
// Generate Feature Report
// =============================================================================
function generateReport(classified, unclassified, removable) {
  console.log('\n📊 LEGAL-AI FEATURE ANALYSIS REPORT\n');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('1️⃣  CORE FEATURES (Critical for Legal-AI App):\n');
  const critical = Object.entries(LEGAL_FEATURES)
    .filter(([_, config]) => config.critical);

  critical.forEach(([category, config]) => {
    const count = classified[category].length;
    const status = count > 0 ? '✅' : '⚠️';
    console.log(`   ${status} ${category.toUpperCase()}: ${count} files`);
    console.log(`      ${config.description}`);

    if (count > 0 && count <= 5) {
      classified[category].forEach(f => {
        console.log(`      - ${f.path}`);
      });
    }
    console.log('');
  });

  console.log('2️⃣  OPTIONAL FEATURES:\n');
  const optional = Object.entries(LEGAL_FEATURES)
    .filter(([_, config]) => !config.critical);

  optional.forEach(([category, config]) => {
    const count = classified[category].length;
    console.log(`   ${category.toUpperCase()}: ${count} files`);
    console.log(`      ${config.description}`);
    console.log('');
  });

  console.log('3️⃣  REMOVABLE CODE:\n');
  console.log(`   🗑️  Experiments/Demos: ${removable.experiments.length} files`);
  if (removable.experiments.length > 0) {
    removable.experiments.slice(0, 5).forEach(f => {
      console.log(`      - ${f.path}`);
    });
    if (removable.experiments.length > 5) {
      console.log(`      ... and ${removable.experiments.length - 5} more`);
    }
  }
  console.log('');

  console.log(`   🎮 Gaming UI: ${removable.gaming.length} files`);
  if (removable.gaming.length > 0) {
    removable.gaming.slice(0, 5).forEach(f => {
      console.log(`      - ${f.path}`);
    });
  }
  console.log('');

  console.log(`   📦 Archived Code: ${removable.oldArchived.length} files`);
  if (removable.oldArchived.length > 0) {
    removable.oldArchived.slice(0, 5).forEach(f => {
      console.log(`      - ${f.path}`);
    });
  }
  console.log('');

  console.log(`   🌉 Unused Bridges: ${removable.unusedBridges.length} files`);
  if (removable.unusedBridges.length > 0) {
    removable.unusedBridges.forEach(f => {
      console.log(`      - ${f.path}`);
    });
  }
  console.log('');

  console.log('4️⃣  UNCLASSIFIED FILES:\n');
  console.log(`   ❓ ${unclassified.length} files (review needed)`);
  if (unclassified.length > 0) {
    unclassified.slice(0, 10).forEach(f => {
      console.log(`      - ${f.path}`);
    });
    if (unclassified.length > 10) {
      console.log(`      ... and ${unclassified.length - 10} more`);
    }
  }
  console.log('\n');

  console.log('5️⃣  RECOMMENDATIONS:\n');

  const totalRemovable =
    removable.experiments.length +
    removable.gaming.length +
    removable.oldArchived.length +
    removable.unusedBridges.length;

  console.log(`   📊 Total files analyzed: ${Object.values(classified).flat().length + unclassified.length}`);
  console.log(`   ✅ Core legal-ai files: ${critical.reduce((sum, [cat]) => sum + classified[cat].length, 0)}`);
  console.log(`   🗑️  Removable files: ${totalRemovable}`);
  console.log(`   📈 Potential cleanup: ${((totalRemovable / (Object.values(classified).flat().length + unclassified.length)) * 100).toFixed(1)}%\n`);

  console.log('   🎯 Next Steps:');
  console.log('      1. Review and remove gaming UI components (not core to legal-ai)');
  console.log('      2. Delete _archive and svelte4 folders');
  console.log('      3. Remove demo/test/experiment files');
  console.log('      4. Evaluate unused microservice bridges (CUDA/gRPC)');
  console.log('      5. Ensure all critical features have implementations\n');
}

// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  try {
    await pgClient.connect();

    const files = await queryAllFiles();
    const { classified, unclassified } = classifyByFeature(files);
    const removable = detectRemovable(classified);

    generateReport(classified, unclassified, removable);

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: files.length,
        classified: Object.values(classified).flat().length,
        unclassified: unclassified.length,
        removable: Object.values(removable).flat().length
      },
      byFeature: Object.entries(classified).map(([cat, items]) => ({
        category: cat,
        count: items.length,
        critical: LEGAL_FEATURES[cat].critical,
        files: items.map(f => f.path)
      })),
      removable: {
        experiments: removable.experiments.map(f => f.path),
        gaming: removable.gaming.map(f => f.path),
        archived: removable.oldArchived.map(f => f.path),
        bridges: removable.unusedBridges.map(f => f.path)
      },
      unclassified: unclassified.map(f => f.path)
    };

    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const reportPath = join(process.cwd(), 'reports', 'legal-ai-feature-analysis.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`💾 Detailed report saved: ${reportPath}\n`);

  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
