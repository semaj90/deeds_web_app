/**
 * @module backfill-source-ref-hashes
 * @description Script to run a one-time, non-destructive audit and backfill of SourceReference hashes across all connected data stores.
 * This must be run after canonical-source-ref.mjs is stable.
 */

import {
  normalizeSourceRef,
  sourceRefHash,
  sourceRefVariants,
  isGeneratedPath,
  classifySourceRef
} from '../lib/canonical-source-ref.mjs';

function logCase(label, input) {
  const canonical = normalizeSourceRef(input);
  console.log(`\n[${label}] ${input}`);
  console.log(`  canonical: ${canonical}`);
  console.log(`  kind: ${classifySourceRef(input)}`);
  console.log(`  generated: ${isGeneratedPath(input)}`);
  console.log(`  hash: ${sourceRefHash(input)}`);
  console.log(`  variants: ${JSON.stringify(sourceRefVariants(input))}`);
}

export async function runDryRunAudit() {
  console.log('=========================================================');
  console.log('== SourceRef Canonical Helper Dry-Run Preflight ==');
  console.log('=========================================================');

  logCase('FILE', 'src/lib/db/client.ts');
  logCase('FEATURE', 'feature:database');
  logCase('GLOBAL', 'global:task:1');
  logCase('WINDOWS', 'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\db\\client.ts');
  logCase('GENERATED', '.svelte-kit/cache');

  const a = sourceRefHash('src/lib/db/client.ts');
  const b = sourceRefHash('src/lib/db/client.ts');

  console.log('\n[STABILITY]');
  console.log(`  first:  ${a}`);
  console.log(`  second: ${b}`);
  console.log(`  stable: ${a === b}`);

  if (a !== b) {
    throw new Error('sourceRefHash is not deterministic');
  }

  console.log('\nDry run complete. No data was written.');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  runDryRunAudit().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}