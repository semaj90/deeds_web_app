#!/usr/bin/env node
/**
 * Phase 42 — Async Effect Validator for Svelte 5
 * ------------------------------------------------
 * Scans .svelte files for remaining async effect/onMount patterns.
 * Produces async-effect-report.json with per-file counts.
 * Optional: Stream to Redis for AI-enhanced analysis pipeline.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const REPORT = path.resolve(__dirname, "..", "async-effect-report.json");

// Redis integration (optional)
const USE_REDIS = process.env.ENABLE_REDIS_STREAM === "true";
let redisClient = null;

if (USE_REDIS) {
  try {
    const { createClient } = await import("redis");
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://:redis@localhost:6379/0",
    });
    await redisClient.connect();
    console.log("✅ Connected to Redis for AI pipeline streaming");
  } catch (err) {
    console.warn("⚠️  Redis unavailable, continuing without streaming:", err.message);
    redisClient = null;
  }
}

function* walk(dir) {
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && !e.startsWith(".") && e !== "node_modules") {
        yield* walk(full);
      } else if (full.endsWith(".svelte")) {
        yield full;
      }
    }
  } catch (err) {
    console.error(`Error walking directory ${dir}:`, err.message);
  }
}

// Enhanced regex patterns
const patterns = {
  asyncEffect: /\beffect\s*\(\s*async\s*\(\s*[^)]*\)\s*=>\s*\{/g,
  asyncOnMount: /\bonMount\s*\(\s*async\s*\(\s*[^)]*\)\s*=>\s*\{/g,
  asyncUntrack: /\buntrack\s*\(\s*async\s*\(\s*[^)]*\)\s*=>\s*\{/g,
};

const results = [];
let totalViolations = 0;
let filesScanned = 0;
let failedToParse = 0;
let filesPassed = 0;

console.log("🔍 Phase 42 — Async Effect Validator");
console.log(`📁 Scanning: ${ROOT}\n`);

for (const file of walk(ROOT)) {
  filesScanned++;
  let text;
  
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    failedToParse++;
    console.error(`❌ Failed to read ${path.relative(ROOT, file)}:`, err.message);
    continue;
  }

  const violations = [];
  let fileTotal = 0;

  // Check each pattern
  for (const [patternName, regex] of Object.entries(patterns)) {
    const matches = [...text.matchAll(regex)];
    if (matches.length > 0) {
      violations.push({
        pattern: patternName,
        count: matches.length,
        locations: matches.map((m) => ({
          index: m.index,
          line: text.substring(0, m.index).split("\n").length,
          snippet: text.substring(m.index, m.index + 80).replace(/\n/g, " "),
        })),
      });
      fileTotal += matches.length;
    }
  }

  if (fileTotal > 0) {
    const relativePath = path.relative(ROOT, file);
    const result = {
      file: relativePath,
      absolutePath: file,
      totalViolations: fileTotal,
      violations,
    };
    
    results.push(result);
    totalViolations += fileTotal;
    
    console.log(`⚠️  ${relativePath}: ${fileTotal} violation(s)`);
    
    // Stream to Redis for AI analysis
    if (redisClient) {
      try {
        await redisClient.xAdd("async-violations", "*", {
          file: relativePath,
          violations: JSON.stringify(violations),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("Redis stream error:", err.message);
      }
    }
  } else {
    filesPassed++;
  }
  
  // Progress indicator
  if (filesScanned % 100 === 0) {
    console.log(`   Scanned ${filesScanned} files...`);
  }
}

// Generate summary
const summary = {
  timestamp: new Date().toISOString(),
  phase: "Phase 42 - Async Effect Validation",
  statistics: {
    filesScanned,
    filesPassed,
    filesWithViolations: results.length,
    failedToParse,
    totalViolations,
  },
  topViolators: results
    .sort((a, b) => b.totalViolations - a.totalViolations)
    .slice(0, 20)
    .map((r) => ({ file: r.file, violations: r.totalViolations })),
  details: results,
  patterns: Object.keys(patterns),
  recommendations: generateRecommendations(results),
};

// Save report
fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));

// Cleanup Redis
if (redisClient) {
  await redisClient.quit();
}

// Print summary
console.log("\n" + "=".repeat(70));
console.log("📊 PHASE 42 VALIDATION COMPLETE");
console.log("=".repeat(70));
console.log(`📁 Files scanned: ${filesScanned}`);
console.log(`✅ Files passed: ${filesPassed}`);
console.log(`⚠️  Files with violations: ${results.length}`);
console.log(`❌ Failed to parse: ${failedToParse}`);
console.log(`🐛 Total violations: ${totalViolations}`);
console.log("=".repeat(70));

if (totalViolations === 0) {
  console.log("✅ SUCCESS: No async effect violations found!");
  console.log("   All async patterns follow Svelte 5 best practices.");
} else {
  console.log(`⚠️  ACTION REQUIRED: ${totalViolations} async violations need fixing`);
  console.log(`📝 Report saved to: ${path.relative(process.cwd(), REPORT)}`);
  
  if (results.length > 0) {
    console.log("\n🔝 Top 5 Violators:");
    summary.topViolators.slice(0, 5).forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.file} (${v.violations} violations)`);
    });
  }
}

console.log("\n💡 Next Steps:");
if (totalViolations > 0) {
  console.log("   1. Review async-effect-report.json");
  console.log("   2. Run: node fix-async-effects.mjs");
  console.log("   3. Re-validate: node scripts/phase42-validate-async-effects.mjs");
  console.log("   4. Test affected components");
} else {
  console.log("   1. Run svelte-check for other issues");
  console.log("   2. Proceed with Phase 42 Prettier/ESLint");
  console.log("   3. Build and test");
}

console.log("\n");

// Exit with error code if violations found
process.exit(totalViolations > 0 ? 1 : 0);

/**
 * Generate recommendations based on violations
 */
function generateRecommendations(results) {
  const recommendations = [];
  
  if (results.length === 0) {
    return ["All async patterns are correctly implemented. Proceed with testing."];
  }
  
  // Analyze patterns
  const byPattern = {};
  results.forEach((r) => {
    r.violations.forEach((v) => {
      byPattern[v.pattern] = (byPattern[v.pattern] || 0) + v.count;
    });
  });
  
  if (byPattern.asyncEffect > 0) {
    recommendations.push(
      `Fix ${byPattern.asyncEffect} async effect() patterns using IIFE wrapper`
    );
  }
  
  if (byPattern.asyncOnMount > 0) {
    recommendations.push(
      `Fix ${byPattern.asyncOnMount} async onMount() patterns using IIFE wrapper`
    );
  }
  
  if (byPattern.asyncUntrack > 0) {
    recommendations.push(
      `Fix ${byPattern.asyncUntrack} async untrack() patterns using IIFE wrapper`
    );
  }
  
  // Check for high-violation files
  const highViolators = results.filter((r) => r.totalViolations > 3);
  if (highViolators.length > 0) {
    recommendations.push(
      `${highViolators.length} files have 3+ violations - prioritize for manual review`
    );
  }
  
  recommendations.push("Run automated fixer: node fix-async-effects.mjs");
  recommendations.push("Test all components with cleanup functions");
  recommendations.push("Verify no memory leaks in DevTools");
  
  return recommendations;
}
