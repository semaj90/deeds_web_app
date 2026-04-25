/**
 * Phase 72 Smart Fixer - Cluster Aware
 *
 * Workflow:
 * 1. Load clusters from svelte-check-clusters.json
 * 2. Identify top affected files from clusters
 * 3. Apply safe regex patterns
 * 4. Verify with tsc/svelte-check
 * 5. Keep or Revert based on error count reduction
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

// --- Patterns from smart-file-fixer.cjs ---
function fixCommonPatterns(content) {
  let fixed = content;

  // Pattern 1: ;, in interface properties -> just ;
  fixed = fixed.replace(/;\s*,\s+/g, '; ');

  // Pattern 2: Return type with , instead of :
  fixed = fixed.replace(/\)\s*,\s*Promise</g, '): Promise<');

  // Pattern 3: Object spread corruption
  fixed = fixed.replace(/\.\.\.(\w+):\s+(\w+),\s+/g, '...$1, $2: ');

  // Pattern 4: Object literal property corruption (prop, value -> prop: value)
  fixed = fixed.replace(/(\t|\n\s+)(\w+),\s+(\w+)(,|\s*\})/g, '$1$2: $3$4');
  fixed = fixed.replace(/(\t|\n\s+)(\w+),\s+(true|false|null|\d+|'[^']+'|"[^"]+")/g, '$1$2: $3');

  // Pattern 5: Type definitions (prop, type -> prop: type)
  fixed = fixed.replace(/(\t|\n\s+)(\w+),\s+(string|number|boolean|any|unknown|void|Date)(\[\])?;?/g, '$1$2: $3$4;');

  // Pattern 8: Floating point corruption (0?.0 -> 0.0)
  fixed = fixed.replace(/(\d+)\?\.(\d+)/g, '$1.$2');

  // Pattern 9: A11y Label fix (label -> span.label for non-input labels)
  // Only targets simple text labels common in the logs: <label>Phone</label>
  fixed = fixed.replace(/<label>([^<]+)<\/label>/g, '<span class="label">$1</span>');

  // Pattern 6: Fix {, prop: -> { prop:
  fixed = fixed.replace(/\{\s*,\s+(\w+):/g, '{ $1:');

  // Pattern 7: Fix let: any loop corruption
  fixed = fixed.replace(/let:\s*any\s+(\w+)\s*=/g, 'let $1 =');
  fixed = fixed.replace(/(\w+):\s*any\s*(<|<=|>=|>|===|!==)\s*/g, '$1 $2 ');
  fixed = fixed.replace(/(\w+):\s*any\+\+/g, '$1++');

  return fixed;
}

function getErrorCount() {
  try {
    // Using tsc for speed/reliability on syntax errors
    // svelte-check is better for .svelte files, but slower.
    const result = execSync('npx tsc --noEmit 2>&1', {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 120000 // 2 min timeout
    });
    return (result.match(/error TS\d+/g) || []).length;
  } catch (e) {
    const output = e.stdout || e.message;
    return (output.match(/error TS\d+/g) || []).length;
  }
}

async function main() {
  console.log('[Phase 72 Smart Fixer] Starting...');

  if (!fs.existsSync(CLUSTERS_FILE)) {
    console.error(`❌ Clusters file found: ${CLUSTERS_FILE}`);
    process.exit(1);
  }

  const clusters = JSON.parse(fs.readFileSync(CLUSTERS_FILE, 'utf8'));
  console.log(`Loaded ${clusters.length} clusters.`);

  // Collect unique files from top 10 clusters (most dense errors)
  const targetFiles = new Set();
  clusters.slice(0, 10).forEach(cluster => {
    cluster.files.forEach(f => targetFiles.add(f));
  });

  const files = Array.from(targetFiles).filter(f => fs.existsSync(path.join(ROOT, f)));
  console.log(`Targeting ${files.length} files from top clusters.`);

  if (files.length === 0) {
    console.log('No files to fix.');
    return;
  }

  console.log('Getting baseline error count...');
  const baseline = getErrorCount();
  console.log(`Baseline errors: ${baseline}`);

  let currentErrors = baseline;
  let fixedCount = 0;

  const BATCH_SIZE = 20;
  let batch = [];

  for (let i = 0; i < files.length; i++) {
    const relativePath = files[i];
    const fullPath = path.join(ROOT, relativePath);
    let originalContent;

    try {
        originalContent = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
        console.log(`Skipping (read error): ${relativePath}`);
        continue;
    }

    const fixedContent = fixCommonPatterns(originalContent);

    if (fixedContent !== originalContent) {
        batch.push({
            path: fullPath,
            relative: relativePath,
            original: originalContent,
            fixed: fixedContent
        });
    }

    // Process batch if full or last file
    if (batch.length >= BATCH_SIZE || i === files.length - 1) {
        if (batch.length === 0) continue;

        console.log(`\nProcessing Batch (${batch.length} files)...`);

        // Apply all in batch
        batch.forEach(item => fs.writeFileSync(item.path, item.fixed));

        const newCount = getErrorCount();
        const diff = currentErrors - newCount;

        if (diff > 0) {
            console.log(`  ✅ BATCH SUCCESS (-${diff} errors). ${newCount} remaining.`);
            currentErrors = newCount;
            fixedCount += batch.length;
        } else if (diff === 0) {
             console.log(`  ⚠️  NEUTRAL (0 change). Keeping fixes.`);
             fixedCount += batch.length;
        } else {
             console.log(`  ❌ REGRESSION (+${Math.abs(diff)}). Reverting batch.`);
             batch.forEach(item => fs.writeFileSync(item.path, item.original));
        }

        batch = []; // Clear batch
    }
  }

  console.log(`\nSession Complete.`);
  console.log(`Fixed ${fixedCount} files.`);
  console.log(`Errors: ${baseline} -> ${currentErrors}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
