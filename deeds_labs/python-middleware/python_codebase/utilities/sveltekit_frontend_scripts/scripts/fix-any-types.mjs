#!/usr/bin/env node
/**
 * Phase 43 — Any Type Fixer (Highest Impact Tool)
 * -------------------------------------------------
 * Replaces ': any' with inferred or safer types
 * Target: 27,928 instances (83% of patterns)
 * Expected impact: -40,000 errors
 * 
 * Usage:
 *   node scripts/fix-any-types.mjs --dry-run --sample 100
 *   node scripts/fix-any-types.mjs --apply
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Project } from "ts-morph";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../src");
const APPLY = process.argv.includes("--apply");
const SAMPLE = process.argv.includes("--sample") ? 
  parseInt(process.argv[process.argv.indexOf("--sample") + 1]) : null;

const results = {
  timestamp: new Date().toISOString(),
  mode: APPLY ? "apply" : "dry-run",
  filesProcessed: 0,
  filesModified: 0,
  totalReplacements: 0,
  details: []
};

console.log(`🔧 Any Type Fixer`);
console.log(`Mode: ${APPLY ? "APPLY FIXES" : "DRY RUN"}`);
if (SAMPLE) console.log(`Sample: ${SAMPLE} files\n`);
else console.log();

// Initialize TypeScript project
const project = new Project({
  tsConfigFilePath: path.resolve(__dirname, "../tsconfig.json"),
  skipAddingFilesFromTsConfig: true
});

function* walk(dir) {
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      
      if (stat.isDirectory()) {
        if (/backup|archive|bak|corrupted|node_modules/i.test(full)) continue;
        yield* walk(full);
      } else if (full.endsWith(".ts") || full.endsWith(".svelte")) {
        yield full;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Skipping ${dir}: ${err.message}`);
  }
}

// Type inference helpers
function inferTypeFromValue(value) {
  if (!value) return "unknown";
  
  // String literals
  if (value.match(/^['"`]/)) return "string";
  
  // Number literals
  if (value.match(/^\d+$/)) return "number";
  if (value.match(/^\d+\.\d+$/)) return "number";
  
  // Boolean literals
  if (value === "true" || value === "false") return "boolean";
  
  // Arrays
  if (value.match(/^\[/)) return "unknown[]";
  
  // Objects
  if (value.match(/^\{/)) return "Record<string, unknown>";
  
  // Functions
  if (value.match(/^(function|\(.*\)\s*=>)/)) return "(...args: unknown[]) => unknown";
  
  return "unknown";
}

function saferType(context) {
  // Context-based type inference
  if (context.includes("event") || context.includes("Event")) return "Event";
  if (context.includes("error") || context.includes("Error")) return "Error | unknown";
  if (context.includes("data") || context.includes("json")) return "Record<string, unknown>";
  if (context.includes("id")) return "string | number";
  if (context.includes("props")) return "Record<string, unknown>";
  if (context.includes("params")) return "Record<string, string>";
  if (context.includes("request")) return "Request";
  if (context.includes("response")) return "Response";
  
  return "unknown";
}

// Process files
let fileCount = 0;
for (const file of walk(ROOT)) {
  if (SAMPLE && fileCount >= SAMPLE) break;
  
  fileCount++;
  results.filesProcessed++;
  
  if (fileCount % 100 === 0) {
    console.log(`Processed ${fileCount} files...`);
  }

  const relativePath = path.relative(ROOT, file);
  let content;
  
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (err) {
    console.warn(`⚠️  Failed to read ${file}: ${err.message}`);
    continue;
  }

  // Skip if no ': any' found
  if (!content.includes(": any")) {
    continue;
  }

  let modified = content;
  let replacements = 0;
  const changes = [];

  // Pattern 1: Function parameters - (param: any)
  modified = modified.replace(/\(\s*(\w+)\s*:\s*any\s*\)/g, (match, param) => {
    replacements++;
    const inferred = saferType(param);
    changes.push({ pattern: "function-param", from: match, to: `(${param}: ${inferred})` });
    return `(${param}: ${inferred})`;
  });

  // Pattern 2: Variable declarations - let x: any
  modified = modified.replace(/\b(let|const|var)\s+(\w+)\s*:\s*any\b/g, (match, keyword, varName) => {
    replacements++;
    const inferred = saferType(varName);
    changes.push({ pattern: "variable-decl", from: match, to: `${keyword} ${varName}: ${inferred}` });
    return `${keyword} ${varName}: ${inferred}`;
  });

  // Pattern 3: Object properties - key: any
  modified = modified.replace(/(\w+)\s*:\s*any([,;}\]])/g, (match, key, delimiter) => {
    replacements++;
    const inferred = saferType(key);
    changes.push({ pattern: "object-property", from: match, to: `${key}: ${inferred}${delimiter}` });
    return `${key}: ${inferred}${delimiter}`;
  });

  // Pattern 4: Type annotations - : any[]
  modified = modified.replace(/:\s*any\[\]/g, (match) => {
    replacements++;
    changes.push({ pattern: "array-type", from: match, to: ": unknown[]" });
    return ": unknown[]";
  });

  // Pattern 5: Generic any - : any (catch-all)
  modified = modified.replace(/:\s*any\b(?!\[)/g, (match) => {
    replacements++;
    changes.push({ pattern: "generic-any", from: match, to: ": unknown" });
    return ": unknown";
  });

  if (replacements > 0) {
    results.filesModified++;
    results.totalReplacements += replacements;
    
    results.details.push({
      file: relativePath,
      replacements,
      changes
    });

    if (APPLY) {
      // Create backup
      const backupPath = file + ".any-backup";
      fs.copyFileSync(file, backupPath);
      
      // Write modified content
      fs.writeFileSync(file, modified, "utf8");
      console.log(`✅ Fixed ${replacements} type annotations in ${relativePath}`);
    } else {
      console.log(`📋 Would fix ${replacements} type annotations in ${relativePath}`);
    }
  }
}

// Write report
const reportPath = path.resolve(__dirname, "../any-type-fixes.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log("\n" + "=".repeat(70));
console.log(`📊 Any Type Fix Report`);
console.log("=".repeat(70));
console.log(`Files processed: ${results.filesProcessed}`);
console.log(`Files modified: ${results.filesModified}`);
console.log(`Total replacements: ${results.totalReplacements}`);
console.log(`Report: ${reportPath}`);

if (!APPLY) {
  console.log("\n⚠️  DRY RUN — No files were modified");
  console.log(`Run with --apply to apply fixes`);
}

console.log("\n💡 Next Steps:");
console.log("  1. Review changes in modified files");
console.log("  2. Run: npx prettier --write \"src/**/*.{ts,svelte}\"");
console.log("  3. Run: npx svelte-check to measure impact");
console.log("  4. Test affected components");

console.log("\n✨ Any Type Fixer complete");
