#!/usr/bin/env node
/**
 * ATLAS Directory SourceRef Map Builder
 *
 * P0 Task: Map directories (not loose files) to sourceRef, feature_id, and feature_label
 *
 * Reads file list from stdin (rg --files output) and produces:
 *   - directory_path
 *   - source_ref
 *   - feature_id
 *   - feature_label
 *   - packet_count
 *   - summary_count
 *   - cold_storage_status
 *   - qdrant_collection
 *   - redis_centroid_key
 *
 * Execution:
 *   rg --files --hidden --no-ignore \
 *     -g '!node_modules/**' \
 *     -g '!.git/**' \
 *     -g '!*.lock' \
 *     | node scripts/atlas/build-directory-source-map.mjs
 *
 * Output:
 *   - memory/reports/directory-source-map.json
 *   - memory/reports/directory-source-map.md
 *   - memory/exports/directory-source-map.jsonl
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OUTPUT_DIR = 'memory/reports';
const EXPORT_DIR = 'memory/exports';
const VERBOSE = process.argv.includes('--verbose');

// Directory patterns → sourceRef mapping
const DIRECTORY_PATTERNS = {
  // Source code
  'src/lib': { sourceRef: 'src_lib', feature: 'core_library', label: 'SvelteKit Library' },
  'src/routes': { sourceRef: 'src_routes', feature: 'api_routes', label: 'API Routes' },
  'src/components': { sourceRef: 'src_components', feature: 'ui_components', label: 'UI Components' },
  'sveltekit-frontend': { sourceRef: 'sveltekit_frontend', feature: 'frontend_app', label: 'SvelteKit Frontend' },
  'scripts': { sourceRef: 'scripts', feature: 'build_scripts', label: 'Build & Analysis Scripts' },
  'scripts/atlas': { sourceRef: 'scripts_atlas', feature: 'atlas_tools', label: 'Atlas Tools' },
  'simd-bridge': { sourceRef: 'simd_bridge', feature: 'native_bridge', label: 'Native N-API Bridge' },

  // Documentation
  'docs': { sourceRef: 'docs', feature: 'documentation', label: 'Documentation' },
  'docs/reports': { sourceRef: 'docs_reports', feature: 'audit_reports', label: 'Audit Reports' },
  'docs/architecture': { sourceRef: 'docs_architecture', feature: 'architecture_docs', label: 'Architecture Docs' },

  // Data & Config
  'memory': { sourceRef: 'memory', feature: 'project_memory', label: 'Project Memory' },
  'memory/exports': { sourceRef: 'memory_exports', feature: 'data_exports', label: 'Data Exports' },
  '.opencode': { sourceRef: 'opencode', feature: 'opencode_state', label: 'OpenCode State' },

  // Hidden artifacts (gitignored)
  '.tmp': { sourceRef: 'tmp_artifacts', feature: 'temporary_data', label: 'Temporary Artifacts' },
  'neschrom97': { sourceRef: 'neschrom97_cards', feature: 'semantic_cards', label: 'NES CHR97 Semantic Cards' },
  'static': { sourceRef: 'static_assets', feature: 'static_content', label: 'Static Assets' },
  'docker': { sourceRef: 'docker_config', feature: 'docker_compose', label: 'Docker Configuration' },
};

// Collections by directory
const COLLECTION_MAPPING = {
  'codebase_chunks': ['src', 'scripts', 'simd-bridge'],
  'legal_documents': ['docs', 'memory'],
  'semantic_cards': ['neschrom97', '.tmp'],
  'general': ['other'],
};

// ============================================================================
// DIRECTORY HIERARCHY
// ============================================================================

function getDirectoryKey(filePath) {
  const dir = path.dirname(filePath);
  return dir === '.' ? 'root' : dir;
}

function assignSourceRef(dirPath) {
  // Try exact match first
  for (const [pattern, config] of Object.entries(DIRECTORY_PATTERNS)) {
    if (dirPath === pattern || dirPath.startsWith(pattern + '/')) {
      return config;
    }
  }

  // Fallback: use first path component
  const parts = dirPath.split('/');
  const topLevel = parts[0];

  if (topLevel.startsWith('.')) {
    return {
      sourceRef: `hidden_${topLevel}`,
      feature: 'hidden_artifacts',
      label: `Hidden: ${topLevel}`,
    };
  }

  return {
    sourceRef: topLevel,
    feature: 'unclassified',
    label: `Unclassified: ${topLevel}`,
  };
}

function getQdrantCollection(dirPath) {
  for (const [collection, patterns] of Object.entries(COLLECTION_MAPPING)) {
    if (patterns.some(p => dirPath.includes(p))) {
      return collection;
    }
  }
  return 'general';
}

function getRedisCentroidKey(sourceRef, featureId) {
  return `centroid:directory:${sourceRef}:${featureId}`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const directories = new Map();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  console.error('📂 Reading file list from stdin...');

  let fileCount = 0;
  for await (const line of rl) {
    const filePath = line.trim();
    if (!filePath) continue;

    // Skip excluded patterns
    if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.endsWith('.lock')) {
      continue;
    }

    fileCount++;
    const dirPath = getDirectoryKey(filePath);

    if (!directories.has(dirPath)) {
      const config = assignSourceRef(dirPath);
      const featureId = crypto.createHash('sha256').update(dirPath).digest('hex').slice(0, 12);

      directories.set(dirPath, {
        directory_path: dirPath,
        source_ref: config.sourceRef,
        feature_id: featureId,
        feature_label: config.label,
        packet_count: 0,
        summary_count: 0,
        cold_storage_status: 'not_archived',
        qdrant_collection: getQdrantCollection(dirPath),
        redis_centroid_key: getRedisCentroidKey(config.sourceRef, featureId),
        file_count: 0,
      });
    }

    directories.get(dirPath).file_count++;
  }

  console.error(`✅ Processed ${fileCount} files across ${directories.size} directories\n`);

  // Sort by directory path
  const sorted = Array.from(directories.values())
    .sort((a, b) => a.directory_path.localeCompare(b.directory_path));

  // ========================================================================
  // OUTPUT: JSON
  // ========================================================================

  const jsonOutput = {
    timestamp: new Date().toISOString(),
    total_directories: sorted.length,
    total_files: fileCount,
    directories: sorted,
  };

  const jsonPath = path.join(OUTPUT_DIR, 'directory-source-map.json');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`✅ Wrote ${jsonPath}`);

  // ========================================================================
  // OUTPUT: MARKDOWN
  // ========================================================================

  let mdContent = `# Directory SourceRef Map

**Generated**: ${new Date().toISOString()}
**Total Directories**: ${sorted.length}
**Total Files**: ${fileCount}

## By SourceRef

`;

  // Group by sourceRef
  const bySourceRef = {};
  sorted.forEach(dir => {
    if (!bySourceRef[dir.source_ref]) bySourceRef[dir.source_ref] = [];
    bySourceRef[dir.source_ref].push(dir);
  });

  for (const [sourceRef, dirs] of Object.entries(bySourceRef)) {
    mdContent += `### ${sourceRef}\n\n`;
    dirs.forEach(dir => {
      mdContent += `- **${dir.directory_path}** (${dir.file_count} files)\n`;
      mdContent += `  - Feature: ${dir.feature_label}\n`;
      mdContent += `  - Feature ID: \`${dir.feature_id}\`\n`;
      mdContent += `  - Qdrant: \`${dir.qdrant_collection}\`\n`;
      mdContent += `  - Redis: \`${dir.redis_centroid_key}\`\n`;
      mdContent += `  - Cold Storage: ${dir.cold_storage_status}\n\n`;
    });
  }

  const mdPath = path.join(OUTPUT_DIR, 'directory-source-map.md');
  fs.writeFileSync(mdPath, mdContent);
  console.log(`✅ Wrote ${mdPath}`);

  // ========================================================================
  // OUTPUT: JSONL (Exports)
  // ========================================================================

  const jsonlPath = path.join(EXPORT_DIR, 'directory-source-map.jsonl');
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const jsonlLines = sorted.map(dir => JSON.stringify(dir)).join('\n');
  fs.writeFileSync(jsonlPath, jsonlLines);
  console.log(`✅ Wrote ${jsonlPath}`);

  // ========================================================================
  // SUMMARY
  // ========================================================================

  console.log(`
📊 Summary:
  Directories: ${sorted.length}
  Files: ${fileCount}
  SourceRefs: ${Object.keys(bySourceRef).length}
  Collections: ${new Set(sorted.map(d => d.qdrant_collection)).size}

📂 Outputs:
  - memory/reports/directory-source-map.json
  - memory/reports/directory-source-map.md
  - memory/exports/directory-source-map.jsonl

🎯 Next Step:
  node scripts/atlas/verify-feature-lineage.mjs
  `);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
