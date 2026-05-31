#!/usr/bin/env node
/**
 * feature-barrel-generator.mjs
 *
 * Phase 1 of the feature reorganization migration. NON-DESTRUCTIVE.
 *
 * Reads .tmp/feature-organization-proposal.json and creates:
 *   sveltekit-frontend/src/lib/server/features/<group>/index.ts
 *
 * Each barrel re-exports from the existing scattered source locations.
 * Zero file moves. Zero import changes. Downstream code can opt-in by
 * switching imports to the new pillar paths whenever convenient.
 *
 * Once >95% of consumers use the new pillar paths, Phase 3 can move actual files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import path from 'path';

const PROPOSAL = '.tmp/feature-organization-proposal.json';
const FEATURES_ROOT = 'sveltekit-frontend/src/lib/server/features';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function listTopLevelFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.js')))
    .filter(e => !e.name.endsWith('.test.ts') && !e.name.endsWith('.spec.ts'))
    .filter(e => e.name !== 'index.ts' && e.name !== 'index.js')
    .map(e => path.basename(e.name, path.extname(e.name)));
}

function main() {
  console.log('🛠️  Feature Barrel Generator (Phase 1)');
  console.log('   Mode:', APPLY ? 'APPLY (writes barrels)' : 'DRY-RUN (preview only)');
  console.log();

  if (!existsSync(PROPOSAL)) {
    console.error(`ERROR: ${PROPOSAL} not found. Run feature-organization-planner.mjs first.`);
    process.exit(1);
  }

  const proposal = JSON.parse(readFileSync(PROPOSAL, 'utf-8'));
  const groups = proposal.feature_groups || {};

  console.log(`[1/3] Loaded ${Object.keys(groups).length} feature groups`);

  // Build barrels
  const barrelsToWrite = [];

  for (const [groupName, group] of Object.entries(groups)) {
    const targetDir = group.target_dir; // e.g., sveltekit-frontend/src/lib/server/features/evidence/
    const scattered = group.current_scattered_dirs || [];

    if (scattered.length === 0) continue;

    // Build re-export lines from each scattered dir OR explicit sample_files
    const exportLines = [];
    const comments = [`/**
 * ${groupName} feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: ${group.purpose}
 * Confidence: ${group.confidence || 'medium'}
 * Generated: ${new Date().toISOString()}
 *
 * Scattered sources:`,
      ...scattered.map(d => ` *   - ${d}`),
      ' */',
      ''];

    // If the proposal provides explicit files, export only those exact files.
    const filesToExport = group.files || [];
    if (filesToExport.length > 0) {
      // de-duplicate
      const uniqueFiles = Array.from(new Set(filesToExport));
      for (const filePath of uniqueFiles) {
        const absolute = filePath.replace(/\\/g, '/');
        const fileDir = path.dirname(absolute);
        const fileBase = path.basename(absolute, path.extname(absolute));
        const fromDir = targetDir.replace(/\/$/, '');
        const relPath = path.relative(fromDir, fileDir).replace(/\\/g, '/');
        exportLines.push(`// From ${absolute}`);
        exportLines.push(`export * from '${relPath}/${fileBase}.js';`);
        exportLines.push('');
      }
    } else {
      // Fallback to the previous behavior (exporting top-level files in scattered dirs)
      for (const scatteredDir of scattered) {
        // Compute relative path from the barrel location to the scattered dir
        const fromDir = targetDir.replace(/\/$/, '');
        const toDir = scatteredDir.replace(/\/$/, '');
        const relPath = path.relative(fromDir, toDir).replace(/\\/g, '/');

        // List top-level files in the scattered dir (skip subdirs and tests)
        const files = listTopLevelFiles(scatteredDir);
        if (files.length === 0) {
          exportLines.push(`// (no exportable files found in ${scatteredDir})`);
          continue;
        }

        exportLines.push(`// From ${scatteredDir}`);
        for (const file of files) {
          exportLines.push(`export * from '${relPath}/${file}.js';`);
        }
        exportLines.push('');
      }
    }

    const content = comments.join('\n') + exportLines.join('\n');

    barrelsToWrite.push({
      group: groupName,
      path: path.join(targetDir, 'index.ts'),
      content,
      sourceCount: scattered.length,
    });
  }

  console.log(`[2/3] Built ${barrelsToWrite.length} barrels`);

  // Preview / write
  console.log();
  console.log('Barrel preview:');
  for (const b of barrelsToWrite) {
    console.log(`  ${b.path}`);
    console.log(`    └── re-exports from ${b.sourceCount} scattered dirs`);
  }

  if (APPLY) {
    console.log();
    console.log('[3/3] Writing barrels...');
    for (const b of barrelsToWrite) {
      const dir = path.dirname(b.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(b.path, b.content);
      console.log(`  ✓ ${b.path}`);
    }
  } else {
    console.log();
    console.log('[3/3] DRY-RUN — no files written. Use --apply to create barrels.');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Barrels ${APPLY ? 'created' : 'previewed'}: ${barrelsToWrite.length}`);
  console.log();
  console.log('Next steps (after operator review):');
  console.log('  1. Migrate imports incrementally to use feature/* paths');
  console.log('     e.g., import { foo } from "$lib/server/features/evidence"');
  console.log('  2. Once >95% adoption, run Phase 3 (actual file moves)');
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
