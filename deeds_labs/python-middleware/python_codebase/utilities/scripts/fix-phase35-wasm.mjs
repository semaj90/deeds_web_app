// scripts/fix-phase35-wasm.mjs
// Phase 35 – AssemblyScript / WASM repair

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "sveltekit-frontend", "src", "wasm");
const BACKUP = path.join(ROOT, "scripts", "backups", "phase35-wasm");

// Create backup directory
fs.mkdirSync(BACKUP, { recursive: true });

function fixAsm(text) {
  let t = text;

  // 1. Remove trailing commas before closing paren in params
  t = t.replace(/\(\s*([^)]*?),\s*\)/g, "($1)");

  // 2. Fix colon-to-comma in param lists (a: Type: b → a: Type, b)
  t = t.replace(/\(([^)]*?)([a-zA-Z0-9_$]+)\s*:\s*([a-zA-Z0-9_$<>\[\]]+)\s*:\s*/g, "($1$2: $3, ");

  // 3. Fix return type colon chains
  t = t.replace(/\):\s*([a-zA-Z0-9_$<>\[\]]+)\s*:\s*/g, "): $1 ");

  // 4. Remove extra commas in array / return type
  t = t.replace(/,\s*:\s*/g, ": ");
  t = t.replace(/,\s*;/g, ";");

  // 5. Strip trailing commas at line ends
  t = t.replace(/,\s*$/gm, "");

  // 6. Fix AssemblyScript specific types (f32, i32, etc.)
  t = t.replace(/:\s*(f32|i32|f64|i64|u32|u64|bool|void)\s*:/g, ": $1, ");

  // 7. Fix array type declarations
  t = t.replace(/(Float32Array|Float64Array|Int32Array|Uint32Array)\s*,\s*/g, "$1 ");

  // 8. Normalize indentation
  t = t.replace(/[ \t]+$/gm, "");

  // 9. Fix double commas
  t = t.replace(/,\s*,/g, ",");

  // 10. Fix missing commas between parameters
  t = t.replace(/([a-zA-Z0-9_$]+)\s*:\s*(f32|i32|f64|i64|u32|u64|Float32Array|Float64Array)\s+([a-zA-Z0-9_$]+)\s*:/g, "$1: $2, $3:");

  return t;
}

function process(f) {
  const orig = fs.readFileSync(f, "utf8");
  const fixed = fixAsm(orig);
  
  if (fixed !== orig) {
    const rel = path.relative(SRC, f);
    const dest = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
    fs.writeFileSync(f, fixed, "utf8");
    return true;
  }
  
  return false;
}

console.log("🔧 Phase 35: WASM AssemblyScript Repair");
console.log(`📁 Source: ${SRC}`);
console.log(`💾 Backup: ${BACKUP}\n`);

let changed = 0;
let scanned = 0;

if (fs.existsSync(SRC)) {
  for (const f of fs.readdirSync(SRC)) {
    if (!f.endsWith(".ts")) continue;
    
    const abs = path.join(SRC, f);
    scanned++;
    
    if (process(abs)) {
      changed++;
      console.log(`✅ Fixed: ${f}`);
    }
  }
} else {
  console.log(`⚠️  WASM directory not found: ${SRC}`);
}

const result = {
  phase: 35,
  target: "WASM/AssemblyScript",
  scanned,
  changed,
  backupDir: BACKUP,
  timestamp: new Date().toISOString()
};

console.log("\n" + "=".repeat(50));
console.log(`Phase 35-WASM fixed ${changed}/${scanned} files`);
console.log(JSON.stringify(result, null, 2));
console.log("=".repeat(50));

// Save report
const reportPath = path.join(ROOT, "scripts", "phase35-report.json");
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
console.log(`\n📊 Report saved: ${reportPath}`);
