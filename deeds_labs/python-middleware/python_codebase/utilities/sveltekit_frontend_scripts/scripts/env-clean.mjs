#!/usr/bin/env node
/**
 * env-clean.mjs
 * Defensive guard to ensure all VITE_* environment variables use valid JavaScript identifiers.
 * Runs before every build to prevent invalid identifier errors in esbuild.define.
 *
 * Rule: VITE_* keys must contain only letters, numbers, and underscores (no hyphens).
 */

import fs from 'fs';
import path from 'path';

const files = ['.env', '.env.local', '.env.production'];

for (const file of files) {
  const filePath = path.resolve(file);

  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️  Skipped ${file} (not found)`);
    continue;
  }

  let txt = fs.readFileSync(filePath, 'utf8');

  // Find all lines that match VITE_*=value where the key part contains hyphens
  const badLines = txt.match(/^VITE_[^=]*-[^=]*=.*$/gm);

  if (badLines) {
    console.warn(`⚠️  Found hyphenated VITE_* keys in ${file}:`);
    badLines.forEach(line => console.warn(`   ${line}`));

    // Replace hyphens only in the key part (before =), not in the value
    txt = txt.replace(/^(VITE_[^=]*)-([^=]*=)/gm, (match, before, after) => {
      return before.replace(/-/g, '_') + '_' + after.replace(/-/g, '_');
    });

    // More precise: replace hyphens in VITE_ key names only
    txt = txt.replace(/^VITE_[^=]*-[^=]*/gm, (match) => {
      return match.replace(/-/g, '_');
    });

    fs.writeFileSync(filePath, txt);
    console.log(`✅ Fixed hyphens → underscores in ${file}`);
  } else {
    console.log(`✅ ${file} is clean (no hyphenated VITE_* keys)`);
  }
}

console.log('\n✅ Environment validation complete');
