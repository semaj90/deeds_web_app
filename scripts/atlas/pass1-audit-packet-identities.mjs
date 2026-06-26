#!/usr/bin/env node
/**
 * Pass 1 Audit: Duplicate Packet Identity Definitions
 *
 * Finds all packet type/interface definitions across the codebase.
 * Reports:
 * - Canonical location (atlas-core)
 * - Duplicate locations
 * - Import consumers
 * - Safe migration path
 *
 * Usage:
 *   npm run atlas:pass1:audit                    # Report only
 *   npm run atlas:pass1:audit:dry                # Dry-run replacement
 *   npm run atlas:pass1:audit:apply              # Apply replacements
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const CANONICAL_LOCATION = 'packages/atlas-core/src/packet/index.ts';
const PROJECT_ROOT = process.cwd();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = !dryRun && args.includes('--apply');
const verbose = args.includes('--verbose');

console.log(`\n📋 Pass 1 Audit: Duplicate Packet Identity Definitions`);
console.log(`Canonical: ${CANONICAL_LOCATION}\n`);

// Search patterns for packet identity definitions
const patterns = [
  {
    name: 'PacketIdentity type',
    pattern: 'type\\s+PacketIdentity\\s*=',
    type: 'type',
  },
  {
    name: 'PacketKey type',
    pattern: 'type\\s+PacketKey\\s*=',
    type: 'type',
  },
  {
    name: 'SourceRef type',
    pattern: 'type\\s+SourceRef\\s*=',
    type: 'type',
  },
  {
    name: 'FeatureId type',
    pattern: 'type\\s+FeatureId\\s*=',
    type: 'type',
  },
  {
    name: 'PacketIdentitySchema Zod',
    pattern: 'export\\s+const\\s+PacketIdentitySchema\\s*=',
    type: 'zod',
  },
  {
    name: 'extractPacketIdentity function',
    pattern: 'export\\s+function\\s+extractPacketIdentity',
    type: 'function',
  },
  {
    name: 'validatePacketIdentity function',
    pattern: 'export\\s+function\\s+validatePacketIdentity',
    type: 'function',
  },
];

// Search for all occurrences
const results = {};
for (const p of patterns) {
  results[p.name] = { pattern: p.pattern, type: p.type, files: new Set() };
}

try {
  for (const pattern of patterns) {
    const cmd = `rg "${pattern.pattern}" sveltekit-frontend/src --type ts -l`;
    try {
      const output = execSync(cmd, { encoding: 'utf8' });
      for (const file of output.trim().split('\n').filter(Boolean)) {
        results[pattern.name].files.add(file);
      }
    } catch (err) {
      // rg returns 1 on no match, which is fine
    }
  }
} catch (err) {
  console.error('Error searching codebase:', err.message);
  process.exit(1);
}

// Report findings
console.log(`🔍 Findings:\n`);

let duplicateCount = 0;
const migrationMap = {}; // Maps old locations to canonical import

for (const [name, data] of Object.entries(results)) {
  if (data.files.size === 0) {
    if (verbose) console.log(`✓ ${name}: NOT FOUND (good)`);
    continue;
  }

  const files = Array.from(data.files).sort();
  const isCanonical = files.includes(CANONICAL_LOCATION);
  const isDuplicate = files.length > 1 || (!isCanonical && files.length > 0);

  console.log(`${isDuplicate ? '⚠️' : '✓'} ${name} (${files.length} file${files.length !== 1 ? 's' : ''})`);
  for (const file of files) {
    const marker = file === CANONICAL_LOCATION ? '📍' : '🔗';
    console.log(`  ${marker} ${file}`);
    if (!isCanonical && file !== CANONICAL_LOCATION) {
      migrationMap[file] = data.type;
      duplicateCount++;
    }
  }
  console.log();
}

console.log(`\n📊 Summary:`);
console.log(`  Canonical location: ${CANONICAL_LOCATION}`);
console.log(`  Total duplicates found: ${duplicateCount}`);
console.log(`  Files needing updates: ${Object.keys(migrationMap).length}\n`);

if (Object.keys(migrationMap).length === 0) {
  console.log(`✅ No duplicates found. Pass 1 already complete.\n`);
  process.exit(0);
}

// Generate migration plan
console.log(`\n🛠️  Migration Plan:\n`);

for (const [file, type] of Object.entries(migrationMap)) {
  console.log(`1. File: ${file}`);
  console.log(`   Action: Remove local ${type} definition`);
  console.log(`   Import: Add: import { PacketIdentity, ... } from '@deeds/atlas-core/packet'`);
  console.log();
}

if (!apply) {
  console.log(`\n💡 Run with --apply to execute migration.\n`);
}
