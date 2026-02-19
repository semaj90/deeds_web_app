#!/usr/bin/env node
/**
 * Component Usage Pattern Fixer
 * Removes unnecessary <svelte:component> usage for static components
 * 
 * Estimated impact: ~12,000 errors (10% of total)
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
let replacementsMade = 0;

console.log("🔧 Component Usage Pattern Fixer\n");
console.log(`Mode: ${APPLY ? "APPLY" : DRY_RUN ? "DRY-RUN" : "PREVIEW"}\n`);

for (const file of walk(ROOT)) {
  if (filesProcessed >= LIMIT) break;
  
  filesProcessed++;
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  
  // Pattern 1: <svelte:component this={StaticComponent} />
  // Only fix if component name starts with capital letter (static import)
  content = content.replace(
    /<svelte:component\s+this=\{([A-Z]\w+)\}\s*\/>/g,
    (match, componentName) => {
      replacementsMade++;
      return `<${componentName} />`;
    }
  );
  
  // Pattern 2: <svelte:component this={StaticComponent}> with children
  content = content.replace(
    /<svelte:component\s+this=\{([A-Z]\w+)\}([^>]*)>([\s\S]*?)<\/svelte:component>/g,
    (match, componentName, attrs, children) => {
      replacementsMade++;
      return `<${componentName}${attrs}>${children}</${componentName}>`;
    }
  );
  
  // Pattern 3: Remove this={Component} when it's a static reference
  content = content.replace(
    /<svelte:component\s+this=\{([A-Z]\w+)\}\s+([^>]+)\/>/g,
    (match, componentName, attrs) => {
      replacementsMade++;
      return `<${componentName} ${attrs}/>`;
    }
  );
  
  if (content !== original) {
    filesModified++;
    const relativePath = path.relative(ROOT, file);
    console.log(`   ✓ ${relativePath}`);
    
    if (APPLY) {
      // Create backup
      const backupPath = file + ".component-fix-backup";
      fs.copyFileSync(file, backupPath);
      
      // Write fixed content
      fs.writeFileSync(file, content, "utf8");
    }
  }
  
  if (filesProcessed % 100 === 0) {
    process.stdout.write(`\r   Processed ${filesProcessed} files...`);
  }
}

console.log(`\n\n${"=".repeat(70)}`);
console.log(`📊 Results:`);
console.log(`   Files processed: ${filesProcessed}`);
console.log(`   Files modified: ${filesModified}`);
console.log(`   Replacements made: ${replacementsMade}`);
console.log(`${"=".repeat(70)}\n`);

if (APPLY) {
  console.log("✅ Component usage fix applied!");
  console.log("\n📝 Next steps:");
  console.log("   1. Run: npx prettier --write \"src/**/*.svelte\"");
  console.log("   2. Test affected components");
  console.log("   3. Run: npx svelte-check --threshold error");
  console.log("   4. Verify component functionality");
} else if (DRY_RUN) {
  console.log("📋 Dry-run complete (no changes made)");
  console.log("\n   Run with --apply to make changes");
} else {
  console.log("📋 Preview complete");
  console.log(`\n   Would fix ${filesModified} files with ${replacementsMade} replacements`);
  console.log("   Run with --apply to make changes");
  console.log("   Run with --dry-run for detailed preview");
}

console.log("");
