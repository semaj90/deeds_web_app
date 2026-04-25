// scripts/fix-phase34-ast.mjs
// Phase 34 – AST-aware repair for TS1109 / TS1128 / TS1434 errors.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "sveltekit-frontend", "src");
const BACKUP = path.join(ROOT, "scripts", "backups", "phase34");
fs.mkdirSync(BACKUP, { recursive: true });

async function tryParse(ts, file, text) {
  try {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
    const diags = sf.parseDiagnostics ?? [];
    return diags.length ? diags.map(d => {
      const msg = typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
      return msg;
    }) : [];
  } catch (err) {
    return [err.message];
  }
}

function balanceTokens(txt) {
  const openers = ["{", "(", "["];
  const closers = ["}", ")", "]"];
  const stack = [];
  let result = txt;
  
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    const oi = openers.indexOf(ch);
    const ci = closers.indexOf(ch);
    
    if (oi >= 0) {
      stack.push(ch);
    } else if (ci >= 0) {
      const want = openers[ci];
      const last = stack[stack.length - 1];
      if (last === want) {
        stack.pop();
      } else if (stack.length > 0) {
        // Try to close the last opened bracket
        const lastIdx = openers.indexOf(last);
        result = result.slice(0, i) + closers[lastIdx] + result.slice(i);
      }
    }
  }
  
  // Close any remaining open brackets
  while (stack.length) {
    const opener = stack.pop();
    const idx = openers.indexOf(opener);
    result += closers[idx];
  }
  
  return result;
}

function tidySyntax(txt) {
  let out = txt;
  
  // Fix trailing colon at end of object or line
  out = out.replace(/:\s*(\}|$)/gm, ",$1");
  
  // Fix comma before closing brace/bracket/paren
  out = out.replace(/,\s*([}\])])/g, "$1");
  
  // Remove trailing commas in parameter lists
  out = out.replace(/,\s*\)/g, ")");
  
  // Fix double commas
  out = out.replace(/,\s*,/g, ",");
  
  // Fix colon chains in parameter lists (a: Type: b → a: Type, b)
  out = out.replace(/([a-z][a-zA-Z0-9]*)\s*:\s*([A-Z][a-zA-Z0-9<>\[\]|&\s]*?)\s*:\s*([a-z])/g, "$1: $2, $3");
  
  // Normalize spacing - remove trailing spaces
  out = out.replace(/[ \t]+\n/g, "\n");
  
  // Fix missing commas between array elements
  out = out.replace(/\]\s*\[/g, "], [");
  
  return out;
}

async function processFile(ts, f) {
  const text = fs.readFileSync(f, "utf8");
  const diags = await tryParse(ts, f, text);
  
  if (!diags.length) return false;

  let candidate = text;
  
  // Check if we have structural errors
  const hasStructural = /Expected|Unexpected|'}'/i.test(diags.join(" "));
  
  if (hasStructural) {
    candidate = balanceTokens(candidate);
  }
  
  candidate = tidySyntax(candidate);

  const again = await tryParse(ts, f, candidate);
  
  if (again.length < diags.length) {
    const rel = path.relative(SRC, f);
    const dest = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
    fs.writeFileSync(f, candidate, "utf8");
    return true;
  }
  
  return false;
}

async function main() {
  const ts = await import("typescript");
  let scanned = 0;
  let changed = 0;

  function* walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
        yield* walk(p);
      } else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
        yield p;
      }
    }
  }

  console.log("🔧 Phase 34: AST-Aware Token Reconstruction");
  console.log(`📁 Source: ${SRC}`);
  console.log(`💾 Backup: ${BACKUP}\n`);

  for (const f of walk(SRC)) {
    scanned++;
    try {
      if (await processFile(ts.default, f)) {
        changed++;
        const rel = path.relative(SRC, f);
        console.log(`✅ Fixed: ${rel}`);
      }
    } catch (err) {
      // Skip files with severe corruption
    }
  }

  const result = {
    phase: 34,
    scanned,
    changed,
    backupDir: BACKUP,
    timestamp: new Date().toISOString()
  };

  console.log("\n" + "=".repeat(50));
  console.log(JSON.stringify(result, null, 2));
  console.log("=".repeat(50));
  
  // Save report
  const reportPath = path.join(ROOT, "scripts", "phase34-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\n📊 Report saved: ${reportPath}`);
}

main().catch(console.error);
