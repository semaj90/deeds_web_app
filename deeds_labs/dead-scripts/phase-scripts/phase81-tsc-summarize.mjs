#!/usr/bin/env node

/**
 * Phase 81: TSC Error Summarizer
 *
 * Converts raw TSC output into structured JSON for:
 * - Qdrant/PG error corpus ingestion
 * - Symbol index building (TS2304 mechanical fixes)
 * - Cluster analysis for next deterministic fixer
 *
 * Output: reports/tsc-summary.json
 * {
 *   tsErrorCount: number,
 *   topCodes: [{key: string, count: number}],
 *   topFiles: [{key: string, count: number}],
 *   sample: [{ file, line, col, code, msg }]
 * }
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("🔍 Phase 81: Running TSC baseline measurement...\n");

const out = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
  maxBuffer: 100 * 1024 * 1024 // 100MB buffer for large output
});

const text = (out.stdout || "") + (out.stderr || "");
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/tsc-latest.txt", text, "utf8");

console.log("✅ Raw TSC output written to reports/tsc-latest.txt\n");

const lines = text.split(/\r?\n/);
const errors = [];

for (const line of lines) {
  // Typical format: path(line,col): error TS1234: message
  const m = line.match(/^(.*)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
  if (!m) continue;

  errors.push({
    file: m[1].replace(/\\/g, '/'), // Normalize paths
    line: Number(m[2]),
    col: Number(m[3]),
    code: `TS${m[4]}`,
    msg: m[5],
  });
}

console.log(`📊 Parsed ${errors.length.toLocaleString()} TypeScript errors\n`);

// Aggregate by code
const byCode = new Map();
const byFile = new Map();
const byMessage = new Map();

for (const e of errors) {
  byCode.set(e.code, (byCode.get(e.code) ?? 0) + 1);
  byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);

  // Create message signature for clustering
  const msgSig = e.msg
    .replace(/'[^']+'/g, "'X'")      // Replace quoted strings
    .replace(/"[^"]+"/g, '"X"')      // Replace double-quoted strings
    .replace(/\d+/g, 'N')             // Replace numbers
    .substring(0, 100);               // Truncate

  byMessage.set(msgSig, (byMessage.get(msgSig) ?? 0) + 1);
}

// Helper to get top N entries from Map
const top = (m, n) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));

const summary = {
  generated: new Date().toISOString(),
  tsErrorCount: errors.length,
  topCodes: top(byCode, 20),
  topFiles: top(byFile, 30),
  topMessagePatterns: top(byMessage, 20),
  sample: errors.slice(0, 100), // First 100 for quick inspection
  allErrors: errors, // Full corpus for embedding ingestion

  // Cluster metadata for next fixer
  syntax: {
    TS1005: byCode.get('TS1005') || 0,  // ';' expected
    TS1128: byCode.get('TS1128') || 0,  // Declaration/statement expected
    TS1109: byCode.get('TS1109') || 0,  // Expression expected
  },
  imports: {
    TS2304: byCode.get('TS2304') || 0,  // Cannot find name
    TS2305: byCode.get('TS2305') || 0,  // Module has no exported member
    TS2307: byCode.get('TS2307') || 0,  // Cannot find module
  },
  types: {
    TS2339: byCode.get('TS2339') || 0,  // Property does not exist
    TS2345: byCode.get('TS2345') || 0,  // Argument not assignable
    TS2322: byCode.get('TS2322') || 0,  // Type not assignable
  }
};

fs.writeFileSync("reports/tsc-summary.json", JSON.stringify(summary, null, 2), "utf8");

console.log("✅ Structured summary written to reports/tsc-summary.json\n");

console.log("🔥 TOP 10 ERROR CODES:");
console.log("─".repeat(60));
for (const { key, count } of summary.topCodes.slice(0, 10)) {
  console.log(`   ${key.padEnd(10)} ${count.toLocaleString().padStart(8)} errors`);
}

console.log("\n📁 TOP 10 BROKEN FILES:");
console.log("─".repeat(60));
for (const { key, count } of summary.topFiles.slice(0, 10)) {
  const shortPath = key.split('/').slice(-3).join('/');
  console.log(`   ${shortPath.padEnd(45)} ${count.toLocaleString().padStart(6)} errors`);
}

console.log("\n📊 CLUSTER BREAKDOWN:");
console.log("─".repeat(60));
console.log(`   Syntax errors (TS1005/1128/1109):    ${(summary.syntax.TS1005 + summary.syntax.TS1128 + summary.syntax.TS1109).toLocaleString()}`);
console.log(`   Import errors (TS2304/2305/2307):    ${(summary.imports.TS2304 + summary.imports.TS2305 + summary.imports.TS2307).toLocaleString()}`);
console.log(`   Type errors (TS2339/2345/2322):      ${(summary.types.TS2339 + summary.types.TS2345 + summary.types.TS2322).toLocaleString()}`);

console.log("\n🎯 RECOMMENDED NEXT FIXER:");
console.log("─".repeat(60));

// Determine next target based on highest cluster
const clusters = [
  { name: 'Syntax desync (TS1005/1128)', count: summary.syntax.TS1005 + summary.syntax.TS1128, priority: 1 },
  { name: 'Missing imports (TS2304)', count: summary.imports.TS2304, priority: 2 },
  { name: 'Property errors (TS2339)', count: summary.types.TS2339, priority: 3 },
];

clusters.sort((a, b) => b.count - a.count);
const nextTarget = clusters[0];

console.log(`   Target: ${nextTarget.name}`);
console.log(`   Impact: ${nextTarget.count.toLocaleString()} errors`);
console.log(`   Priority: ${nextTarget.priority} (1=syntax, 2=imports, 3=types)`);

console.log("\n✅ Phase 81 complete! Use this data for:");
console.log("   - Qdrant/PG corpus ingestion");
console.log("   - Symbol index building");
console.log("   - Next deterministic fixer selection\n");

// Exit with TSC's exit code
process.exit(out.status ?? 1);
