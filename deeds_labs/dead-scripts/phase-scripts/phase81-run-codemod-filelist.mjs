#!/usr/bin/env node

/**
 * Phase 81: Codemod File List Runner
 *
 * Runs a codemod script against a file list (one file at a time)
 * to avoid the "4,477 files processed" problem when you meant 1.
 *
 * Usage:
 *   node scripts/phase81-run-codemod-filelist.mjs --list=reports/hot-files.txt
 *   node scripts/phase81-run-codemod-filelist.mjs --list=reports/hot-files.txt --apply
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const listPath = process.argv.find(a => a.startsWith("--list="))?.split("=")[1] ?? "reports/hot-files.txt";
const script = process.argv.find(a => a.startsWith("--script="))?.split("=")[1] ?? "scripts/phase80-extended-codemod.mjs";
const outParam = process.argv.find(a => a.startsWith("--out="))?.split("=")[1];
const mode = process.argv.includes("--apply") ? "apply" : "dry-run";
const batch = process.argv.includes("--batch");

console.log(`\n📋 Phase 81: File List Codemod Runner`);
console.log(`   List: ${listPath}`);
console.log(`   Script: ${script}`);
console.log(`   Mode: ${mode}`);
console.log(`   Batch: ${batch}\n`);

if (batch) {
  const args = [
    script,
    `--list=${listPath}`,
    ...(mode === "dry-run" ? ["--dry-run"] : []),
    ...(outParam ? [`--out=${outParam}`] : [])
  ];

  console.log(`🚀 Executing batch command: node ${args.join(" ")}`);
  const r = spawnSync("node", args, { stdio: "inherit", shell: true });
  process.exit(r.status ?? 1);
}

const files = fs.readFileSync(listPath, "utf8")
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

console.log(`📊 Processing ${files.length} files...\n`);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/phase81-filelist-resolved.txt", files.join("\n"), "utf8");

// Clear previous log
fs.writeFileSync("reports/phase81-codemod.log", `Phase 81 Codemod Run - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`, "utf8");

let total = 0;
let modified = 0;
let errors = 0;

for (const f of files) {
  const args = [script, `--file=${f}`];
  if (mode === "dry-run") args.push("--dry-run");

  const r = spawnSync("node", args, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });

  // Keep logs lightweight
  const out = (r.stdout || "") + (r.stderr || "");
  fs.appendFileSync("reports/phase81-codemod.log", `\n${'='.repeat(80)}\n=== ${f} ===\n${'='.repeat(80)}\n${out}\n`, "utf8");

  total++;

  // Check if file was modified
  if (/Files modified:\s*[1-9]/i.test(out) || /modified:\s*[1-9]/i.test(out) || /Applied \d+ transformations/i.test(out)) {
    modified++;
    console.log(`✅ ${f.split('/').slice(-2).join('/')}: MODIFIED`);
  } else if (r.status !== 0) {
    errors++;
    console.log(`❌ ${f.split('/').slice(-2).join('/')}: ERROR`);
  } else {
    console.log(`⏭️  ${f.split('/').slice(-2).join('/')}: No changes`);
  }
}

const summary = {
  listPath,
  script,
  mode,
  totalFiles: total,
  filesModified: modified,
  errors,
  timestamp: new Date().toISOString()
};

fs.writeFileSync("reports/phase81-codemod-summary.json", JSON.stringify(summary, null, 2), "utf8");

console.log(`\n${'='.repeat(80)}`);
console.log(`📊 Summary:`);
console.log(`   Total files: ${total}`);
console.log(`   Modified: ${modified}`);
console.log(`   Errors: ${errors}`);
console.log(`   Success rate: ${((modified / total) * 100).toFixed(1)}%`);
console.log(`\n📁 Logs written to:`);
console.log(`   reports/phase81-codemod.log`);
console.log(`   reports/phase81-codemod-summary.json`);
console.log(`${'='.repeat(80)}\n`);

if (mode === "dry-run") {
  console.log(`✅ Dry-run complete! Review logs, then run with --apply to execute.`);
} else {
  console.log(`✅ Apply complete! Re-run TSC to measure impact.`);
}
