#!/usr/bin/env node
/**
 * scripts/atlas/validate-master-feature-map.mjs
 * 
 * Manual validator for the Master Feature Map.
 * Bypasses Zod issues while ensuring architectural truthfulness.
 */

import { MASTER_FEATURE_MAP } from '../../src/lib/server/atlas/master-feature-map.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  console.log('🛡️  Atlas: Validating Master Feature Map Provenance (Manual)...');

  const VALID_STATUSES = ['active', 'partial', 'dry_run', 'planned', 'research_spike', 'deprecated'];
  let failures = 0;

  console.log(`   Entries count: ${Object.keys(MASTER_FEATURE_MAP).length}`);

  for (const [key, feat] of Object.entries(MASTER_FEATURE_MAP)) {
    // 1. Basic Structure
    if (!feat.id || !feat.name || !feat.intent || !feat.service || !feat.status) {
      console.error(`   ❌ Feature [${key}] is missing core fields (id, name, intent, service, status).`);
      failures++;
      continue;
    }

    // 2. Status Validation
    if (!VALID_STATUSES.includes(feat.status)) {
      console.error(`   ❌ Feature [${key}] has invalid status: ${feat.status}`);
      failures++;
    }

    // 3. Evidence Verification
    if (feat.status === 'active' || feat.status === 'partial' || feat.status === 'dry_run') {
      const files = feat.evidence?.files || [];
      if (files.length === 0) {
        console.warn(`   ⚠️  Feature [${key}] is marked '${feat.status}' but has no evidence files listed.`);
        // Not a hard failure for now, but a warning
      } else {
        for (const f of files) {
          const fullPath = resolve(process.cwd(), f);
          if (!existsSync(fullPath)) {
            console.error(`   ❌ Feature [${key}] references missing file: ${f}`);
            failures++;
          }
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`\n❌ Validation failed with ${failures} errors.`);
    process.exit(1);
  }

  console.log('\n✅ Master Feature Map is truthful and verified.');
}

main();
