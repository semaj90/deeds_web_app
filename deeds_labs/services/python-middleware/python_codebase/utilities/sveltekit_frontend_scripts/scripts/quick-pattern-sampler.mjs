#!/usr/bin/env node
/**
 * Phase 43 — Quick Error Pattern Sampler
 * ----------------------------------------
 * Samples .svelte files to identify common error patterns
 * without running full svelte-check (which runs out of memory)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../src");

const patterns = {
  // Runes migrations needed
  oldProps: /\bexport\s+let\s+(\w+)\s*[=:;]/g,
  oldReactive: /\$:\s+/g,
  oldStore: /\$(\w+Store)/g,
  
  // Component patterns  
  svelteComponent: /<svelte:component\s+this=/g,
  slotPattern: /<slot\s+name=/g,
  
  // Type issues
  anyType: /:\s*any\b/g,
  missingType: /function\s+\w+\s*\([^)]*\)\s*\{/g,
  
  // Import issues
  relativeImport: /from\s+['"]\.\./g,
  missingImport: /\b(Component|onMount|createEventDispatcher)\b/g,
  
  // Event handlers (should be migrated)
  colonEvent: /\bon:/g,
};

function* walk(dir) {
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      
      if (stat.isDirectory()) {
        if (/backup|archive|bak|corrupted|node_modules/i.test(full)) continue;
        yield* walk(full);
      } else if (full.endsWith(".svelte") || full.endsWith(".ts")) {
        yield full;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Skipping ${dir}: ${err.message}`);
  }
}

const results = {
  timestamp: new Date().toISOString(),
  filesScanned: 0,
  patterns: {},
  topFiles: [],
  recommendations: []
};

// Initialize pattern counts
for (const key of Object.keys(patterns)) {
  results.patterns[key] = { count: 0, files: [] };
}

console.log(`🔍 Sampling ${ROOT} for error patterns...\\n`);

let fileCount = 0;
const filePatternCounts = new Map();

for (const file of walk(ROOT)) {
  fileCount++;
  results.filesScanned++;
  
  if (fileCount % 100 === 0) {
    console.log(`Scanned ${fileCount} files...`);
  }

  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (err) {
    continue;
  }

  let fileHasPatterns = 0;

  // Check each pattern
  for (const [key, regex] of Object.entries(patterns)) {
    const matches = content.match(regex);
    if (matches) {
      const count = matches.length;
      results.patterns[key].count += count;
      fileHasPatterns += count;
      
      if (results.patterns[key].files.length < 10) {
        results.patterns[key].files.push({
          file: path.relative(ROOT, file),
          count
        });
      }
    }
  }

  if (fileHasPatterns > 0) {
    filePatternCounts.set(file, fileHasPatterns);
  }
}

// Top files with most patterns
results.topFiles = Array.from(filePatternCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([file, count]) => ({
    file: path.relative(ROOT, file),
    patternCount: count
  }));

// Generate recommendations
const sorted = Object.entries(results.patterns)
  .sort((a, b) => b[1].count - a[1].count);

for (const [pattern, data] of sorted) {
  if (data.count === 0) continue;

  let recommendation = {
    pattern,
    count: data.count,
    priority: "MEDIUM",
    script: "Manual review",
    estimatedImpact: data.count,
    effort: "MEDIUM"
  };

  switch (pattern) {
    case "oldProps":
      recommendation.priority = "HIGH";
      recommendation.script = "scripts/migrate-props-to-runes.mjs (TO BUILD)";
      recommendation.effort = "HIGH";
      recommendation.description = "Convert 'export let prop' to $props()";
      break;
    
    case "oldReactive":
      recommendation.priority = "HIGH";
      recommendation.script = "scripts/migrate-reactive-to-derived.mjs (TO BUILD)";
      recommendation.effort = "HIGH";
      recommendation.description = "Convert '$: derived' to $derived()";
      break;
    
    case "colonEvent":
      recommendation.priority = "LOW";
      recommendation.script = "Already migrated (verify)";
      recommendation.effort = "LOW";
      recommendation.description = "Event directives should be onclick/oninput";
      break;
    
    case "svelteComponent":
      recommendation.priority = "MEDIUM";
      recommendation.script = "scripts/fix-dynamic-components.mjs (TO BUILD)";
      recommendation.effort = "MEDIUM";
      recommendation.description = "Review <svelte:component> usage";
      break;
    
    case "anyType":
      recommendation.priority = "MEDIUM";
      recommendation.script = "TypeScript strict mode fixes";
      recommendation.effort = "HIGH";
      recommendation.description = "Replace 'any' with proper types";
      break;
  }

  results.recommendations.push(recommendation);
}

// Write report
const reportPath = path.resolve(__dirname, "../pattern-analysis.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log("\\n" + "=".repeat(70));
console.log("📊 Pattern Analysis Report");
console.log("=".repeat(70));
console.log(`Files scanned: ${results.filesScanned}`);
console.log("\\n🔍 Top Patterns Found:");

for (const [pattern, data] of sorted.slice(0, 10)) {
  if (data.count > 0) {
    console.log(`  ${pattern.padEnd(20)} ${data.count.toString().padStart(6)}`);
  }
}

console.log("\\n📋 Top Recommendations:");
for (const rec of results.recommendations.slice(0, 5)) {
  console.log(`\\n  ${rec.priority} | ${rec.pattern} (${rec.count} instances)`);
  console.log(`       ${rec.description}`);
  console.log(`       → ${rec.script}`);
  console.log(`       Effort: ${rec.effort}`);
}

console.log(`\\n📁 Full report: ${reportPath}`);
console.log("\\n✨ Analysis complete\\n");
