// scripts/fix-svelte-phase5-protected.mjs
// -------------------------------------------------------------
// PHASE 5 PROTECTED CLEANUP TOOLKIT
//  • Safe, idempotent fix for Svelte + TS + WASM syntax
//  • Skips already-clean files (hash-verified)
//  • Records subsystem stats for report dashboard
// -------------------------------------------------------------

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND = path.join(__dirname, "..", "sveltekit-frontend", "src");
const BACKUP_DIR = path.join(__dirname, "backups", "phase5");
const LOG_DIR = path.join(__dirname, "logs");
const CACHE_DIR = path.join(__dirname, "cache");
const HASH_CACHE = path.join(CACHE_DIR, "phase5-hashes.json");

// Ensure directories exist
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Load previous hashes (for protection)
let hashCache = {};
try {
  if (fs.existsSync(HASH_CACHE)) {
    hashCache = JSON.parse(fs.readFileSync(HASH_CACHE, "utf8"));
  }
} catch (err) {
  console.warn("⚠️  Could not load hash cache, starting fresh:", err.message);
  hashCache = {};
}

let scanned = 0;
let fixed = 0;
const subsystemStats = { svelte: 0, ts: 0, wasm: 0, other: 0 };
const changedFiles = [];

/** Hash helper */
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");

/** Deep scan */
function* walk(dir) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
        yield* walk(f);
      } else if (/\.(svelte|ts|tsx|js|jsx)$/.test(e.name)) {
        yield f;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not read directory: ${dir}`);
  }
}

/** Check if file contains known corruption markers */
function isCorrupted(content) {
  return (
    /<script,/.test(content) ||
    /<script\s+module,/.test(content) ||
    /import,\s*\{/.test(content) ||
    /import\s*,/.test(content) ||
    /{\s*,/.test(content) ||
    /,\s*}(?!\s*\))/.test(content) || // Allow },) in destructuring
    /\breturn,\s+/.test(content) ||
    /\b(let|const)\s*:\s+/.test(content) ||
    /\bexport\s*,/.test(content) ||
    /;{2,}/.test(content) ||
    /\(\s*,/.test(content)
  );
}

/** Apply repairs */
function clean(content, ext) {
  let updated = content;
  
  if (ext === ".svelte") {
    // Svelte-specific fixes
    updated = updated
      .replace(/<script,\s*lang="ts">/g, '<script lang="ts">')
      .replace(/<script,\s*lang='ts'>/g, "<script lang='ts'>")
      .replace(/<script\s+module,\s*/g, "<script module ")
      .replace(/<script\s+context="module",?\s*/g, '<script context="module" ')
      .replace(/<\/script,>/g, "</script>");
  }
  
  // General syntax repairs
  updated = updated
    // Import statement fixes
    .replace(/\bimport\s*,\s*/g, "import ")
    .replace(/\bimport,\s*/g, "import ")
    .replace(/\bexport\s*,\s*/g, "export ")
    
    // Object/array syntax
    .replace(/{\s*,/g, "{ ")
    .replace(/,\s*}(?!\s*\))/g, " }")
    .replace(/\[\s*,/g, "[ ")
    .replace(/,\s*\]/g, " ]")
    
    // Function/statement fixes
    .replace(/\breturn,\s+/g, "return ")
    .replace(/\b(let|const)\s*:\s+/g, "$1 ")
    
    // Parameter list fixes
    .replace(/\(\s*,/g, "(")
    .replace(/,\s*\)/g, ")")
    
    // Semicolon cleanup
    .replace(/;{2,}/g, ";")
    
    // Trailing comma in function params
    .replace(/,\s*\)\s*:/g, "):")
    .replace(/,\s*\)\s*=>/g, ") =>")
    
    // Double commas
    .replace(/,\s*,/g, ",");
  
  return updated;
}

/** Main pass */
console.log("🔧 Phase 5: Protected Svelte + TS + WASM Cleanup");
console.log(`📁 Source: ${FRONTEND}`);
console.log(`💾 Backup: ${BACKUP_DIR}`);
console.log(`📊 Cache: ${HASH_CACHE}\n`);

for (const file of walk(FRONTEND)) {
  scanned++;
  const ext = path.extname(file);
  
  try {
    const text = fs.readFileSync(file, "utf8");
    const prevHash = hashCache[file];
    const currentHash = hash(text);

    // Skip unchanged or already-clean files
    if (prevHash === currentHash) {
      continue; // Already processed and unchanged
    }
    
    if (!isCorrupted(text)) {
      // Clean but not in cache - add to cache
      hashCache[file] = currentHash;
      continue;
    }

    const cleaned = clean(text, ext);
    const newHash = hash(cleaned);

    if (newHash !== currentHash) {
      fixed++;
      const rel = path.relative(FRONTEND, file);
      changedFiles.push(rel);

      // Detect subsystem
      if (file.includes(path.sep + "wasm" + path.sep)) {
        subsystemStats.wasm++;
      } else if (file.endsWith(".svelte")) {
        subsystemStats.svelte++;
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        subsystemStats.ts++;
      } else {
        subsystemStats.other++;
      }

      // Create backup with relative path structure
      const backupPath = path.join(BACKUP_DIR, rel);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, text, "utf8");
      
      // Write cleaned file
      fs.writeFileSync(file, cleaned, "utf8");
      hashCache[file] = newHash;
      
      console.log(`✅ Fixed: ${rel}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err.message);
  }
}

// Save hash cache and logs
fs.writeFileSync(HASH_CACHE, JSON.stringify(hashCache, null, 2), "utf8");

const summary = {
  phase: 5,
  timestamp: new Date().toISOString(),
  scanned,
  fixed,
  protected: scanned - fixed,
  subsystems: subsystemStats,
  changedFiles: changedFiles.slice(0, 50), // First 50 for report
  totalChangedFiles: changedFiles.length,
  backupDir: BACKUP_DIR,
  hashCache: HASH_CACHE
};

const LOG_PATH = path.join(LOG_DIR, `phase5-protected-${Date.now()}.json`);
fs.writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2), "utf8");

console.log("\n" + "═".repeat(60));
console.log("✨ PHASE 5 PROTECTED CLEANUP COMPLETE");
console.log("═".repeat(60));
console.log(`   Scanned:    ${scanned} files`);
console.log(`   Fixed:      ${fixed} files`);
console.log(`   Protected:  ${scanned - fixed} files (already clean)`);
console.log("\n   Subsystem Breakdown:");
console.log(`     • Svelte:     ${subsystemStats.svelte}`);
console.log(`     • TypeScript: ${subsystemStats.ts}`);
console.log(`     • WASM:       ${subsystemStats.wasm}`);
console.log(`     • Other:      ${subsystemStats.other}`);
console.log(`\n   Backup:  ${BACKUP_DIR}`);
console.log(`   Log:     ${LOG_PATH}`);
console.log(`   Cache:   ${HASH_CACHE}`);
console.log("═".repeat(60) + "\n");

// Exit with status
process.exit(fixed > 0 ? 0 : 0);
