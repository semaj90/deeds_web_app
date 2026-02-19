// scripts/phase5-report.mjs
// Phase 5 Report Dashboard - Visualizes cleanup statistics

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, "logs");

if (!fs.existsSync(LOG_DIR)) {
  console.log("📊 No Phase 5 logs found yet.");
  console.log("   Run: node scripts/fix-svelte-phase5-protected.mjs");
  process.exit(0);
}

const logs = fs.readdirSync(LOG_DIR).filter(f => f.startsWith("phase5-protected-"));

if (!logs.length) {
  console.log("📊 No Phase 5 logs found yet.");
  console.log("   Run: node scripts/fix-svelte-phase5-protected.mjs");
  process.exit(0);
}

// Get latest log
const latest = logs.sort().reverse()[0];
const data = JSON.parse(fs.readFileSync(path.join(LOG_DIR, latest), "utf8"));

console.log("\n" + "═".repeat(60));
console.log("📊 PHASE 5 REPORT DASHBOARD");
console.log("═".repeat(60));
console.log(`\nRun log: ${latest}`);
console.log(`Timestamp: ${data.timestamp}`);
console.log(`\n📈 Statistics:`);
console.log(`   Files scanned: ${data.scanned}`);
console.log(`   Files fixed:   ${data.fixed}`);
console.log(`   Protected:     ${data.protected} (already clean)`);

const fixRate = ((data.fixed / data.scanned) * 100).toFixed(1);
const protectRate = ((data.protected / data.scanned) * 100).toFixed(1);
console.log(`   Fix rate:      ${fixRate}%`);
console.log(`   Protect rate:  ${protectRate}%`);

console.log(`\n🎯 Subsystem Distribution:`);
const total = Object.values(data.subsystems).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(data.subsystems)) {
  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
  const bar = "█".repeat(Math.floor(pct / 2));
  console.log(`   • ${k.padEnd(12)} ${v.toString().padStart(4)} (${pct.toString().padStart(5)}%) ${bar}`);
}

if (data.changedFiles && data.changedFiles.length > 0) {
  console.log(`\n📝 Sample Changed Files (first 10):`);
  data.changedFiles.slice(0, 10).forEach((file, i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${file}`);
  });
  
  if (data.totalChangedFiles > 10) {
    console.log(`   ... and ${data.totalChangedFiles - 10} more`);
  }
}

console.log(`\n💾 Backup Location:`);
console.log(`   ${data.backupDir}`);

console.log(`\n🔒 Hash Cache:`);
console.log(`   ${data.hashCache}`);

console.log("\n" + "═".repeat(60));
console.log("✅ Phase 5 protection is active");
console.log("   Re-running the fixer will skip already-clean files");
console.log("═".repeat(60) + "\n");

// Historical trend if multiple logs exist
if (logs.length > 1) {
  console.log("\n📈 Historical Trend:");
  const history = logs.slice(0, 5).reverse().map(log => {
    const d = JSON.parse(fs.readFileSync(path.join(LOG_DIR, log), "utf8"));
    return {
      timestamp: new Date(d.timestamp).toLocaleString(),
      fixed: d.fixed,
      scanned: d.scanned
    };
  });
  
  history.forEach((h, i) => {
    console.log(`   ${i + 1}. ${h.timestamp} - Fixed: ${h.fixed}/${h.scanned}`);
  });
  console.log();
}
