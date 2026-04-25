// scripts/phase81-fix-colon-corruption.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const norm = (p) => p.replaceAll("\\", "/");
const cwd = process.cwd();

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, vEq] = a.slice(2).split("=", 2);
    const next = argv[i + 1];
    if (vEq !== undefined) out[k] = vEq;
    else if (next && !next.startsWith("--")) {
      out[k] = next;
      i++;
    } else out[k] = true;
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function tryResolveFile(p) {
  const raw = p;
  const candidates = [];

  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  candidates.push(abs);

  // Hot list variants:
  candidates.push(path.resolve(cwd, "src", "lib", raw));
  candidates.push(path.resolve(cwd, "src", raw));

  if (raw.startsWith("./")) {
    const r2 = raw.slice(2);
    candidates.push(path.resolve(cwd, r2));
    candidates.push(path.resolve(cwd, "src", "lib", r2));
    candidates.push(path.resolve(cwd, "src", r2));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

function walkDir(dirAbs) {
  const out = [];
  const stack = [dirAbs];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      const rel = norm(path.relative(cwd, full));
      if (
        rel.includes("node_modules/") ||
        rel.startsWith(".svelte-kit/") ||
        rel.startsWith("build/") ||
        rel.startsWith("dist/") ||
        rel.startsWith(".git/")
      ) continue;

      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
    }
  }
  return out;
}

function readListFile(listPath) {
  const abs = path.isAbsolute(listPath) ? listPath : path.resolve(cwd, listPath);
  if (!fs.existsSync(abs)) throw new Error(`--list not found: ${abs}`);
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return lines;
}

function readSkipList(skipPath) {
  if (!skipPath) return new Set();
  const abs = path.isAbsolute(skipPath) ? skipPath : path.resolve(cwd, skipPath);
  if (!fs.existsSync(abs)) return new Set();
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return new Set(lines.map(norm));
}

function writeDiffPatch(outDir, fileAbs, before, after) {
  const patchesDir = path.join(outDir, "patches");
  ensureDir(patchesDir);

  const safeName = norm(path.relative(cwd, fileAbs))
    .replaceAll("/", "__")
    .replaceAll(":", "_");

  const tmpA = path.join(os.tmpdir(), `${safeName}.before.ts`);
  const tmpB = path.join(os.tmpdir(), `${safeName}.after.ts`);

  fs.writeFileSync(tmpA, before, "utf8");
  fs.writeFileSync(tmpB, after, "utf8");

  const r = spawnSync("git", ["diff", "--no-index", "--", tmpA, tmpB], {
    encoding: "utf8",
    shell: true,
  });

  const diffText = (r.stdout || "") + (r.stderr || "");
  fs.writeFileSync(path.join(patchesDir, `${safeName}.diff`), diffText, "utf8");
}

function countUnescapedBackticks(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "`") {
      if (i > 0 && s[i - 1] === "\\") continue;
      n++;
    }
  }
  return n;
}

function delimiterBalanceOk(text) {
  let paren = 0, brace = 0, bracket = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;

    if (paren < 0 || brace < 0 || bracket < 0) return false;
  }
  if (paren !== 0 || brace !== 0 || bracket !== 0) return false;

  const bt = countUnescapedBackticks(text);
  if (bt % 2 !== 0) return false;

  return true;
}

async function typescriptParseOk(fileAbs, text) {
  // Extra guardrail: if TS parser says “syntax is broken”, skip.
  // If typescript isn't installed, we don't block.
  try {
    const ts = await import("typescript");
    const kind = fileAbs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(fileAbs, text, ts.ScriptTarget.Latest, true, kind);
    const diags = sf.parseDiagnostics || [];
    return diags.length === 0;
  } catch {
    return true;
  }
}

// -------------------------
// Fixers (conservative + iterated)
// -------------------------

function fixGenericColonUnions(line, stats) {
  // Promise<Float32Array: null> -> Promise<Float32Array | null>
  const before = line;
  const out = line.replace(/<([^>\n]*?)\s*:\s*(null|undefined|never|void)\b/g, (_m, lhs, rhs) => {
    stats["generic-colon-union"] = (stats["generic-colon-union"] ?? 0) + 1;
    return `<${lhs} | ${rhs}`;
  });
  return out !== before ? out : before;
}

function fixTypeAliasColonUnions(line, stats) {
  // type X = GPUDevice: undefined; -> type X = GPUDevice | undefined;
  if (!/^\s*type\s+\w+\s*=/.test(line)) return line;
  if (!line.includes(":")) return line;
  if (line.includes("{")) return line;

  const before = line;
  const rhs = line.split("=").slice(1).join("=");

  const rhsLooksSafe =
    /\b[A-Za-z_$][\w$]*\b\s*:\s*(undefined|null|never|void)\b/.test(rhs) ||
    (!rhs.includes(",") && /\b[A-Za-z_$][\w$]*\b\s*:\s*\b[A-Za-z_$][\w$]*\b/.test(rhs));

  if (!rhsLooksSafe) return line;

  const out = line.replace(/\s*:\s*/g, " | ");
  if (out !== before) stats["type-alias-colon-union"] = (stats["type-alias-colon-union"] ?? 0) + 1;
  return out;
}

function fixParamNameCommaTypePairs(line, stats) {
  // (key, string) -> (key: string)
  const before = line;

  const out = line.replace(/\(([^()\n]*)\)/g, (full, inner) => {
    let changed = false;
    let s = inner;

    s = s.replace(
      /(\b[A-Za-z_$][\w$]*\b)\s*,\s*(string|number|boolean|any|unknown|object)\b/g,
      (_m, name, t) => {
        changed = true;
        return `${name}: ${t}`;
      }
    );

    if (!changed) return full;
    stats["param-name-comma-type"] = (stats["param-name-comma-type"] ?? 0) + 1;
    return `(${s})`;
  });

  return out !== before ? out : before;
}

function fixSignatureTailExtraParam(line, stats) {
  // foo(x: string), any: Promise<...> -> foo(x: string, options: any): Promise<...>
  const before = line;

  if (!/\)\s*,\s*(any|unknown|string|number|boolean)\s*:/.test(line)) return line;
  if (!/(async\s+)?[A-Za-z_$][\w$]*\s*\(|private|public|protected|function/.test(line)) return line;

  const out = line.replace(/\)\s*,\s*(any|unknown|string|number|boolean)\s*:/g, (_m, t) => {
    stats["signature-tail-param"] = (stats["signature-tail-param"] ?? 0) + 1;
    return `, options: ${t}):`;
  });

  return out !== before ? out : before;
}

/**
 * IMPORTANT:
 * "object colon chains" are the dangerous ones that caused your autopsy.
 * We disable them by default. If you enable them, we only touch the
 * extremely specific pattern where we can prove it's a repeated "key:" chain.
 */
function fixObjectColonChainsLineWise(line, stats, enabled) {
  if (!enabled) return line;

  const before = line;
  const colonCount = (line.match(/:/g) ?? []).length;
  if (colonCount < 3) return line;

  // avoid type/interface/switch/URLs/ternary-ish
  if (/^\s*(type|interface|export\s+interface)\b/.test(line)) return line;
  if (/^\s*(case|default)\b/.test(line)) return line;
  if (line.includes("http://") || line.includes("https://")) return line;
  if (line.includes("?:")) return line;

  // Only convert if we can see "key: <non-colon stuff> , key2:"-style structure.
  // Specifically require the NEXT segment to be "identifier:" (not "this." or "svc." etc).
  // That means we require whitespace + identifier + whitespace + ":".
  let out = line;
  for (let i = 0; i < 10; i++) {
    const next = out.replace(
      /(\b[A-Za-z_$][\w$]*\b)\s*:\s*([^:\n{}()[\]]+?)\s*:\s*(\b[A-Za-z_$][\w$]*\b)\s*:/g,
      (_m, k1, v1, k2) => {
        stats["object-colon-chain"] = (stats["object-colon-chain"] ?? 0) + 1;
        return `${k1}: ${v1.trim()}, ${k2}:`;
      }
    );
    if (next === out) break;
    out = next;
  }

  return out !== before ? out : before;
}

function runPass(text, stats, enableObjectChains) {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    let s = line;
    s = fixGenericColonUnions(s, stats);
    s = fixTypeAliasColonUnions(s, stats);
    s = fixSignatureTailExtraParam(s, stats);
    s = fixParamNameCommaTypePairs(s, stats);
    s = fixObjectColonChainsLineWise(s, stats, enableObjectChains);
    return s;
  });
  return out.join("\n");
}

function applyFixersIterative(beforeText, enableObjectChains) {
  const stats = {};
  let text = beforeText;

  for (let i = 0; i < 3; i++) {
    const prev = text;
    text = runPass(text, stats, enableObjectChains);
    if (text === prev) break;
  }

  return { afterText: text, stats };
}

// -------------------------
// Main
// -------------------------

const args = parseArgv(process.argv.slice(2));
const dryRun = !!args["dry-run"] || !!args.dryrun;
const verbose = !!args.verbose;
const enableObjectChains = !!args["enable-object-chains"]; // OFF by default
const skipListPath = args.skiplist || ".phase81-colon-skiplist.txt";

const runId =
  String(args.out || "").trim() ||
  `reports/phase81-colon-${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;

const outDir = path.isAbsolute(runId) ? runId : path.resolve(cwd, runId);
ensureDir(outDir);
ensureDir(path.join(outDir, "patches"));

const skipSet = readSkipList(skipListPath);

let filesAbs = [];
if (args.file) {
  const resolved = tryResolveFile(args.file);
  if (!resolved) {
    console.error(`❌ --file not found (tried common prefixes): ${args.file}`);
    process.exit(2);
  }
  filesAbs = [resolved];
} else if (args.dir) {
  const dirAbs = path.isAbsolute(args.dir) ? args.dir : path.resolve(cwd, args.dir);
  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    console.error(`❌ --dir not found: ${dirAbs}`);
    process.exit(2);
  }
  filesAbs = walkDir(dirAbs);
} else if (args.list) {
  const lines = readListFile(args.list);
  for (const entry of lines) {
    const resolved = tryResolveFile(entry);
    if (!resolved) {
      // Still emit a record so the batch truth is explicit
      // (we’ll handle it in the loop as “missing”)
      filesAbs.push({ missing: true, entry });
    } else {
      filesAbs.push(resolved);
    }
  }
} else {
  console.error("Usage: node scripts/phase81-fix-colon-corruption.mjs --file=... | --dir=... | --list=... [--dry-run] [--out=...]");
  process.exit(2);
}

const filesToProcessPath = path.join(outDir, "phase81-fix-colon-files-to-process.txt");
const jsonlPath = path.join(outDir, "phase81-fix-colon-results.jsonl");
const summaryPath = path.join(outDir, "phase81-fix-colon-summary.json");

fs.writeFileSync(
  filesToProcessPath,
  filesAbs
    .map((f) => (typeof f === "string" ? norm(path.relative(cwd, f)) : `MISSING:${f.entry}`))
    .join("\n") + "\n",
  "utf8"
);
fs.writeFileSync(jsonlPath, "", "utf8");

let filesProcessed = 0;
let filesModified = 0;
let filesSkipped = 0;
let totalFixes = 0;

const perFile = [];

console.log(`📋 Phase 81: Fix Colon Corruption`);
console.log(`   Mode: ${dryRun ? "dry-run" : "apply"}`);
console.log(`   Files: ${filesAbs.length}`);
console.log(`   Out:  ${norm(path.relative(cwd, outDir))}`);
console.log(`   Skiplist: ${skipListPath} (${skipSet.size} entries)`);
console.log(`   Object-colon-chains: ${enableObjectChains ? "ENABLED (risky)" : "OFF (safe default)"}`);
console.log(`   Wrote: ${norm(path.relative(cwd, filesToProcessPath))}`);

for (const f of filesAbs) {
  filesProcessed++;

  if (typeof f !== "string") {
    filesSkipped++;
    const rec = { file: f.entry, changed: false, skipped: true, reason: "file-not-found" };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    console.log(`  ⛔ ${f.entry}: not found`);
    continue;
  }

  const fileAbs = f;
  const rel = norm(path.relative(cwd, fileAbs));

  if (skipSet.has(rel)) {
    filesSkipped++;
    const rec = { file: rel, changed: false, skipped: true, reason: "skiplist" };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    if (verbose) console.log(`  ⛔ ${rel}: skiplist`);
    continue;
  }

  let before = "";
  try {
    before = fs.readFileSync(fileAbs, "utf8");
  } catch (e) {
    filesSkipped++;
    const rec = { file: rel, changed: false, skipped: true, reason: "read-failed", error: String(e) };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    console.log(`  ⛔ ${rel}: read failed`);
    continue;
  }

  const { afterText, stats } = applyFixersIterative(before, enableObjectChains);
  const fixes = Object.values(stats).reduce((a, b) => a + b, 0);
  totalFixes += fixes;

  if (afterText === before) {
    const rec = { file: rel, changed: false, fixes: 0, breakdown: stats };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    if (verbose) console.log(`  ⏭️ ${rel}: no changes`);
    perFile.push({ file: rel, changed: false, skipped: false, fixes: 0 });
    continue;
  }

  // Always emit diff for review (even if we skip apply)
  writeDiffPatch(outDir, fileAbs, before, afterText);

  // Guardrail 1: delimiter balance
  if (!delimiterBalanceOk(afterText)) {
    filesSkipped++;
    const rec = { file: rel, changed: false, skipped: true, reason: "delimiter-balance-failed", fixes, breakdown: stats };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    console.log(`  ⚠️ ${rel}: ${fixes} fixes (SKIPPED: delimiter balance)`);
    perFile.push({ file: rel, changed: false, skipped: true, fixes });
    continue;
  }

  // Guardrail 2: TS parse
  const parseOk = await typescriptParseOk(fileAbs, afterText);
  if (!parseOk) {
    filesSkipped++;
    const rec = { file: rel, changed: false, skipped: true, reason: "ts-parse-failed", fixes, breakdown: stats };
    fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    console.log(`  ⚠️ ${rel}: ${fixes} fixes (SKIPPED: TS parse)`);
    perFile.push({ file: rel, changed: false, skipped: true, fixes });
    continue;
  }

  if (!dryRun) {
    fs.writeFileSync(fileAbs, afterText, "utf8");
  }

  filesModified++;
  const rec = { file: rel, changed: true, fixes, breakdown: stats };
  fs.appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
  console.log(`  ✅ ${rel}: ${fixes} fixes`);
  perFile.push({ file: rel, changed: true, skipped: false, fixes });
}

const topFiles = perFile
  .filter(r => r.changed)
  .sort((a, b) => (b.fixes || 0) - (a.fixes || 0))
  .slice(0, 20);

const summary = {
  dryRun,
  enableObjectChains,
  filesProcessed,
  filesModified,
  filesSkipped,
  totalFixes,
  outputs: {
    outDir: norm(path.relative(cwd, outDir)),
    filesToProcess: norm(path.relative(cwd, filesToProcessPath)),
    patchesDir: norm(path.relative(cwd, path.join(outDir, "patches"))),
    resultsJsonl: norm(path.relative(cwd, jsonlPath)),
    summaryJson: norm(path.relative(cwd, summaryPath)),
  },
  topFiles,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

console.log("================================================================================");
console.log(`📊 Summary: processed=${filesProcessed} modified=${filesModified} skipped=${filesSkipped} totalFixes=${totalFixes}`);
console.log(`📁 Proof artifacts (THIS RUN): ${norm(path.relative(cwd, outDir))}`);
console.log("================================================================================");

process.exit(0);
