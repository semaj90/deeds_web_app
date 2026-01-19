/**
 * Smart File Fixer - Validates error count reduction per file
 * Only keeps changes if they reduce the total error count
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getErrorCount() {
  try {
    const result = execSync('npx tsc --noEmit 2>&1', {
      encoding: 'utf8',
      timeout: 120000,
      cwd: process.cwd()
    });
    const matches = result.match(/error TS\d+/g);
    return matches ? matches.length : 0;
  } catch (e) {
    const output = e.stdout || e.message;
    const matches = output.match(/error TS\d+/g);
    return matches ? matches.length : 99999;
  }
}

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

  // Pattern 6: Fix {, prop: -> { prop:
  fixed = fixed.replace(/\{\s*,\s+(\w+):/g, '{ $1:');

  // Pattern 7: Fix let: any loop corruption
  fixed = fixed.replace(/let:\s*any\s+(\w+)\s*=/g, 'let $1 =');
  fixed = fixed.replace(/(\w+):\s*any\s*(<|<=|>=|>|===|!==)\s*/g, '$1 $2 ');
  fixed = fixed.replace(/(\w+):\s*any\+\+/g, '$1++');

  return fixed;
}

const targetFiles = [
  "src/lib/server/services/user-recommendation-service.ts",
  "src/lib/memory/nes-memory-architecture.ts",
  "src/sveltekit-gpu-cache-integration.ts",
  "src/lib/server/ai/rag-pipeline-enhanced.ts",
  "src/mcp-gpu-orchestrator.ts",
  "src/lib/services/enhanced-rag-pagerank.ts",
  "src/lib/server/rag-sync.ts",
  "src/som-webgpu-cache.ts",
  "src/lib/utils/simd-markdown-parser.ts",
  "src/lib/themes/design-system.ts"
];

async function main() {
  console.log('Gets baseline error count...');
  const baseline = getErrorCount();
  console.log(`Baseline errors: ${baseline}`);

  let currentErrors = baseline;

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping missing file: ${filePath}`);
      continue;
    }

    console.log(`\nTrying to fix: ${filePath}`);
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const fixedContent = fixCommonPatterns(originalContent);

    if (fixedContent === originalContent) {
      console.log('  No patterns found to fix');
      continue;
    }

    // Apply fix
    fs.writeFileSync(filePath, fixedContent);

    // Check new error count
    const newCount = getErrorCount();
    console.log(`  Errors after fix: ${newCount}`);

    if (newCount < currentErrors) {
      console.log(`  ✅ KEPT - Reduced errors by ${currentErrors - newCount}`);
      currentErrors = newCount;
    } else if (newCount === currentErrors) {
       console.log(`  ⚠️ NEUTRAL - No error reduction, keeping fix as syntax cleanup`);
    } else {
      console.log(`  ❌ REVERTED - Would increase errors by ${newCount - currentErrors} (Cascade effect)`);
      fs.writeFileSync(filePath, originalContent);
    }
  }

  console.log(`\nFinal error count: ${currentErrors} (started at ${baseline})`);
}

main().catch(console.error);
