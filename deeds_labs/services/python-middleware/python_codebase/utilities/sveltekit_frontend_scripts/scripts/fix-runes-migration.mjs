#!/usr/bin/env node
/**
 * Runes Migration Fixer
 * Converts Svelte 4 reactive patterns to Svelte 5 runes
 * 
 * Estimated impact: ~17,000 errors (15% of total)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");

const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1]) || Infinity;

function* walk(dir) {
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      if (fs.statSync(full).isDirectory()) {
        if (/backup|archive|bak|corrupted|node_modules/i.test(full)) continue;
        yield* walk(full);
      } else if (full.endsWith(".svelte")) {
        yield full;
      }
    }
  } catch (err) {
    console.warn(`Warning: ${err.message}`);
  }
}

let filesProcessed = 0;
let filesModified = 0;
const changesByType = {
  state: 0,
  derived: 0,
  effect: 0,
};

console.log("🔧 Runes Migration Fixer\n");
console.log(`Mode: ${APPLY ? "APPLY" : DRY_RUN ? "DRY-RUN" : "PREVIEW"}\n`);

for (const file of walk(ROOT)) {
  if (filesProcessed >= LIMIT) break;
  
  filesProcessed++;
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  let modified = false;
  
  // Extract script tag content
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    continue;
  }
  
  let scriptContent = scriptMatch[1];
  const scriptOriginal = scriptContent;
  
  // Pattern 1: Simple let declarations that should be $state
  // let count = 0; → let count = $state(0);
  scriptContent = scriptContent.replace(
    /\n\s*let\s+(\w+)\s*=\s*([^;]+);/g,
    (match, varName, value) => {
      // Skip if already using $state, $derived, or imports
      if (value.includes('$state') || value.includes('$derived') || 
          value.includes('import') || value.includes('from')) {
        return match;
      }
      
      // Skip if it's a destructuring or function
      if (value.includes('{') || value.includes('(') && value.includes('=>')) {
        return match;
      }
      
      changesByType.state++;
      return `\n  let ${varName} = $state(${value});`;
    }
  );
  
  // Pattern 2: Reactive declarations
  // $: doubled = count * 2; → let doubled = $derived(count * 2);
  scriptContent = scriptContent.replace(
    /\n\s*\$:\s+(\w+)\s*=\s*([^;]+);/g,
    (match, varName, expression) => {
      changesByType.derived++;
      return `\n  let ${varName} = $derived(${expression});`;
    }
  );
  
  // Pattern 3: Reactive statements (side effects)
  // $: { console.log(count); } → $effect(() => { console.log(count); });
  scriptContent = scriptContent.replace(
    /\n\s*\$:\s*\{([^}]+)\}/g,
    (match, body) => {
      changesByType.effect++;
      return `\n  $effect(() => {${body}});`;
    }
  );
  
  // Pattern 4: Reactive statements without braces
  // $: console.log(count); → $effect(() => console.log(count));
  scriptContent = scriptContent.replace(
    /\n\s*\$:\s+(?!(\w+\s*=))([^;]+);/g,
    (match, notAssignment, statement) => {
      changesByType.effect++;
      return `\n  $effect(() => ${statement});`;
    }
  );
  
  if (scriptContent !== scriptOriginal) {
    // Replace script content
    content = content.replace(scriptOriginal, scriptContent);
    modified = true;
  }
  
  if (modified) {
    filesModified++;
    const relativePath = path.relative(ROOT, file);
    console.log(`   ✓ ${relativePath}`);
    
    if (APPLY) {
      // Create backup
      const backupPath = file + ".runes-fix-backup";
      fs.copyFileSync(file, backupPath);
      
      // Write fixed content
      fs.writeFileSync(file, content, "utf8");
    }
  }
  
  if (filesProcessed % 100 === 0) {
    process.stdout.write(`\r   Processed ${filesProcessed} files...`);
  }
}

const totalChanges = Object.values(changesByType).reduce((sum, val) => sum + val, 0);

console.log(`\n\n${"=".repeat(70)}`);
console.log(`📊 Results:`);
console.log(`   Files processed: ${filesProcessed}`);
console.log(`   Files modified: ${filesModified}`);
console.log(`   Total changes: ${totalChanges}`);
console.log(`   $state conversions: ${changesByType.state}`);
console.log(`   $derived conversions: ${changesByType.derived}`);
console.log(`   $effect conversions: ${changesByType.effect}`);
console.log(`${"=".repeat(70)}\n`);

if (APPLY) {
  console.log("✅ Runes migration applied!");
  console.log("\n⚠️  Important notes:");
  console.log("   - Review $state conversions (some may need to stay as plain let)");
  console.log("   - Check $derived expressions (may need arrow functions)");
  console.log("   - Verify $effect cleanup functions");
  console.log("\n📝 Next steps:");
  console.log("   1. Run: npx prettier --write \"src/**/*.svelte\"");
  console.log("   2. Test reactive behavior");
  console.log("   3. Run: npx svelte-check --threshold error");
  console.log("   4. Manual review of complex patterns");
} else if (DRY_RUN) {
  console.log("📋 Dry-run complete (no changes made)");
  console.log("\n   Run with --apply to make changes");
} else {
  console.log("📋 Preview complete");
  console.log(`\n   Would fix ${filesModified} files with ${totalChanges} changes`);
  console.log("   Run with --apply to make changes");
  console.log("   Run with --dry-run for detailed preview");
}

console.log("");
