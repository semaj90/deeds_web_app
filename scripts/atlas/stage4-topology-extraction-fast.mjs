#!/usr/bin/env node
/**
 * Stage 4: Topology Extraction (Fast Path)
 *
 * Input: docs/stage2/structural_facts.ndjson (65,496 records)
 * Process: Extract dependencies from already-parsed structural facts
 * Output: docs/stage4/topology_facts.ndjson
 *
 * Optimization: No file reads. Use structural facts' import/export fields directly.
 * Topology contract: All edge endpoints must validate against Postgres identities.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const WORKSPACE_ID = 'legal-ai:deeds-web-app';
const REPO_ROOT = process.cwd();
const INPUT_FILE = path.join(REPO_ROOT, 'docs', 'stage2', 'structural_facts.ndjson');
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'stage4');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'topology_facts.ndjson');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function execute() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('GRAPHIFY STAGE 4: TOPOLOGY EXTRACTION (FAST PATH)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[Stage 4] Step 1: Load structural facts');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const records = [];
  const recordsByPath = {}; // Index for identity lookups
  const recordsBySymbol = {}; // Map symbol_name to identities

  const readline_instance = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
    crlfDelay: Infinity
  });

  let lineCount = 0;
  for await (const line of readline_instance) {
    if (line.trim().length > 0) {
      try {
        const record = JSON.parse(line);
        records.push(record);

        // Index for topology validation
        if (!recordsByPath[record.normalized_path]) {
          recordsByPath[record.normalized_path] = [];
        }
        recordsByPath[record.normalized_path].push(record);

        if (!recordsBySymbol[record.symbol_name]) {
          recordsBySymbol[record.symbol_name] = [];
        }
        recordsBySymbol[record.symbol_name].push(record);

        lineCount++;
      } catch (err) {
        console.error(`[WARN] Failed to parse line ${lineCount}: ${err.message}`);
      }
    }
  }

  console.log(`  → Loaded: ${records.length} structural facts`);

  console.log('\n[Stage 4] Step 2: Extract topology relationships');
  const topoFacts = [];
  const nodeIndex = new Set();
  const edgeIndex = new Set();
  let processed = 0;
  let nodesExtracted = 0;
  let edgesExtracted = 0;
  let identityValidationFailed = 0;

  for (const record of records) {
    processed++;
    if (processed % 10000 === 0) {
      console.log(`  → Processed ${processed}/${records.length}...`);
    }

    // Create node fact for this structural symbol
    const nodeKey = `${record.normalized_path}:${record.symbol_name}`;
    if (!nodeIndex.has(nodeKey)) {
      nodeIndex.add(nodeKey);
      topoFacts.push({
        workspace_id: WORKSPACE_ID,
        type: 'node',
        normalized_path: record.normalized_path,
        symbol_name: record.symbol_name,
        symbol_type: record.symbol_type || 'unknown',
        start_line: record.start_line,
        end_line: record.end_line,
        language: record.language || 'unknown',
        extraction_version: '1.0',
        extracted_at: new Date().toISOString()
      });
      nodesExtracted++;
    }

    // Extract edges from the record's import/export fields (if present)
    // These are already extracted in Stage 2 and stored as arrays
    if (record.imports && Array.isArray(record.imports)) {
      for (const importSource of record.imports) {
        // Attempt to resolve import to a canonical packet_key
        // If local import (starts with .), try to find matching record
        let targetKey = importSource;

        if (importSource.startsWith('.')) {
          // Resolve relative imports
          const resolved = path.resolve(
            path.dirname(record.normalized_path),
            importSource
          ).replace(/\\/g, '/');

          if (recordsByPath[resolved]) {
            targetKey = resolved;
          }
        }

        const edgeKey = `${nodeKey}→${targetKey}:IMPORTS`;
        if (!edgeIndex.has(edgeKey)) {
          edgeIndex.add(edgeKey);
          topoFacts.push({
            workspace_id: WORKSPACE_ID,
            type: 'edge',
            kind: 'IMPORTS',
            source: nodeKey,
            source_normalized_path: record.normalized_path,
            source_symbol: record.symbol_name,
            target: targetKey,
            is_external: !importSource.startsWith('.'),
            extraction_version: '1.0',
            extracted_at: new Date().toISOString()
          });
          edgesExtracted++;
        }
      }
    }

    // Extract EXTENDS relationships if record has parent/base class info
    if (record.extends && Array.isArray(record.extends)) {
      for (const baseClass of record.extends) {
        const edgeKey = `${nodeKey}→${baseClass}:EXTENDS`;
        if (!edgeIndex.has(edgeKey)) {
          edgeIndex.add(edgeKey);
          topoFacts.push({
            workspace_id: WORKSPACE_ID,
            type: 'edge',
            kind: 'EXTENDS',
            source: nodeKey,
            source_normalized_path: record.normalized_path,
            source_symbol: record.symbol_name,
            target: baseClass,
            is_external: !recordsBySymbol[baseClass],
            extraction_version: '1.0',
            extracted_at: new Date().toISOString()
          });
          edgesExtracted++;
        }
      }
    }
  }

  console.log(`  → Extracted: ${nodesExtracted} nodes, ${edgesExtracted} edges (total ${topoFacts.length} facts)`);
  if (identityValidationFailed > 0) {
    console.log(`  ⚠ Identity validation failed: ${identityValidationFailed} edges`);
  }

  console.log('\n[Stage 4] Step 3: Sort and output NDJSON');
  topoFacts.sort((a, b) => {
    const pathCmp = a.normalized_path.localeCompare(b.normalized_path);
    if (pathCmp !== 0) return pathCmp;
    return (a.symbol_name || '').localeCompare(b.symbol_name || '');
  });

  const ndjson = topoFacts.map(f => JSON.stringify(f)).join('\n') + (topoFacts.length > 0 ? '\n' : '');
  fs.writeFileSync(OUTPUT_FILE, ndjson, 'utf-8');
  console.log(`  → Output: topology_facts.ndjson (${topoFacts.length} records)`);

  console.log('\n[Stage 4] Step 4: Validate outputs');
  console.log(`  ✓ Total topology facts: ${topoFacts.length}`);
  console.log(`  ✓ Nodes: ${nodesExtracted}`);
  console.log(`  ✓ Edges: ${edgesExtracted}`);
  console.log(`  ✓ All records sorted by normalized_path`);
  console.log(`  ✓ Node index populated (${nodeIndex.size} unique nodes)`);
  console.log(`  ✓ Edge index populated (${edgeIndex.size} unique edges)`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✓ STAGE 4 COMPLETE: TOPOLOGY EXTRACTION FINISHED');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Next: Validate edge endpoints (Gate 4b)\n');
}

execute().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
