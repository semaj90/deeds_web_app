// scripts/phase82-fix-structural-corruption.mjs
import fs from "node:fs";
import path from "node:path";

function readText(p) { return fs.readFileSync(p, "utf8"); }
function writeText(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, "utf8"); }

function normalizeNewlines(s) { return s.replace(/\r\n/g, "\n"); }

function fixStatementJoiners(s) {
  return s.replace(
    /}\s*;\s*(?=(function|const|let|var|type|interface|export|class)\b)/g,
    '}\n\n'
  );
}

function fixFunctionReturnSplice(s) {
  return s.replace(
    /(function\s+[A-Za-z_$][\w$]*\s*\([^)]*\))\s*\|\s*(undefined|null)\b/g,
    (_m, head, tail) => `${head}: unknown | ${tail}`
  );
}

function fixArrowReturnSplice(s) {
  return s.replace(
    /(\=\s*\([^)]*\))\s*\|\s*(undefined|null)\s*=>/g,
    (_m, head, tail) => `${head}: unknown | ${tail} =>`
  );
}

function fixGenericTypeColons(s) {
  return s.replace(
    /\b(\w+)\s*<\s*([^,>]+?)\s*:\s*([^>]+?)\s*>/g,
    "$1<$2, $3>"
  );
}

function fixMethodSignatureDamage(s) {
  return s.replace(
    /(\([^)]+\)),\s*\/\*\s*PHASE82_COLON_CHAIN:\s*([^*]+?)\s*\*\/\s*(;|})/g,
    "$1: $2$3"
  );
}

function fixArrowFunctionDamage(s) {
  return s.replace(
    /(\(\s*\w+\s*),\s*\/\*\s*PHASE82_COLON_CHAIN:\s*([^*]+?)\s*\*\/\s*(,|}|;)/g,
    "$1: $2$3"
  );
}

function fixDottedKeys(s) {
  return s.replace(
    /([a-zA-Z0-9_$]+\.)+([a-zA-Z0-9_$]+)\s*:/g,
    "$2:"
  );
}

function fixBadCommaOperators(s) {
  return s.replace(
    /(\s[-+*\/])\s*,\s*/g,
    "$1 "
  );
}

function fixArrayColons(s) {
  return s.replace(
    /\[\s*([a-zA-Z0-9_$]+)\s*:\s*([a-zA-Z0-9_$!.()]+)\s*\]/g,
    "[$1, $2]"
  );
}

function fixBadFunctionCallColons(s) {
  let out = s.replace(
    /(lokiRedisCache\.set|console\.log|metrics\.push)\s*\(([^,():]+)\s*:\s*/g,
    "$1($2, "
  );
  return out;
}

function fixClassPropertyCommas(s) {
  return s.replace(
    /^\s*(private|protected|public|readonly)\s+([a-zA-Z0-9_$]+)\s*:\s*([^,;]+)\s*,\s*([a-zA-Z0-9_$]+)\s*:\s*([^;]+);/gm,
    (m, mod, p1, t1, p2, t2) => `  ${mod} ${p1}: ${t1};\n  ${mod} ${p2}: ${t2};`
  );
}

function fixDoubleValues(s) {
  return s.replace(
    /(\b\w+\s*:\s*)([^,:{}\n\s;]+)\s+\2\s*(,|}|;)/g,
    "$1$2$3"
  );
}

function fixColonChains(s) {
  return s.replace(
    /(\b(?<!\[)\w+\s*:\s*[^,:{}\n;]+)\s*:\s*([^,:{}\n;]+)\s*(,|}|;)/g,
    "$1, /* PHASE82_COLON_CHAIN: $2 */ $3"
  );
}

function fixColonChainDamage(s) {
  return s.replace(
    /(\b\w+\s*:\s*[^,:{}\n]+);\s*(\w+),\s*\/\*\s*PHASE82_COLON_CHAIN:\s*([^*]+?)\s*\*\/\s*(}|;)/g,
    "$1; $2: $3$4"
  );
}

function fixIndexSignatureDamage(s) {
  return s.replace(
    /\[\w+:\s*\w+\]\s*,\s*\/\*\s*PHASE82_COLON_CHAIN:\s*([^*]+?)\s*\*\/\s*(}|;)/g,
    (match, type, end) => {
      const indexSig = match.match(/^\[\w+:\s*\w+\]/)[0];
      return `${indexSig}: ${type}${end}`;
    }
  );
}

function fixNesMemoryCorruption(s) {
  return s.replace(
    /startAddress:\s*([^,]+),\s*([^,]+)\.end,\s*size:\s*used,/g,
    "startAddress: $1, endAddress: $2.end, size: $2.size, used: 0,"
  );
}

function fixSpecificRagDamage(s) {
  s = s.replace(
    /embedQuery\(input: string\),\s*\/\*.*?\*\/\s*;/g,
    "embedQuery(input: string): Promise<number[]>;"
  );
  s = s.replace(
    /invoke: \(input,\s*\/\*.*?\*\/\s*}/g,
    "invoke: (input: RunnableInvokeInput) => Promise<RunnableInvokeOutput> }"
  );
  return s;
}

function fixQloraOptions(s) {
  // Fix "temperature: rlGuidance.temperature, rlGuidance.maxTokens, true:"
  // -> "temperature: rlGuidance.temperature, maxTokens: rlGuidance.maxTokens, stream: true"
  return s.replace(
    /temperature:\s*([^,]+),\s*([^,]+)\.maxTokens,\s*true:/g,
    "temperature: $1, maxTokens: $2.maxTokens, stream: true"
  );
}

function dropImmediateDuplicateBlocks(s) {
  const lines = s.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!/^\s*(export\s+)?(function|const|let|type|interface)\b/.test(line)) {
      out.push(line); i++; continue;
    }
    const a40 = lines.slice(i, i + 40).join('\n');
    let j = i + 1;
    while (j < Math.min(lines.length, i + 160) && !/^\s*(export\s+)?(function|const|let|type|interface)\b/.test(lines[j])) j++;
    if (j >= lines.length) { out.push(line); i++; continue; }
    const b40 = lines.slice(j, j + 40).join('\n');
    if (a40.trim().length > 0 && a40 === b40) {
      out.push(lines[i]); i++;
      while (i < j) { out.push(lines[i]); i++; }
      out.push('// PHASE82_DUPLICATE_BLOCK_COMMENTED: ' + lines[j]);
      j++; i = j; continue;
    }
    out.push(line); i++;
  }
  return out.join('\n');
}

function applyFixes(input) {
  let s = normalizeNewlines(input);
  const before = s;

  s = fixStatementJoiners(s);
  s = fixFunctionReturnSplice(s);
  s = fixArrowReturnSplice(s);
  s = fixGenericTypeColons(s);
  s = fixMethodSignatureDamage(s);
  s = fixArrowFunctionDamage(s);
  s = fixDottedKeys(s);
  s = fixBadCommaOperators(s);
  s = fixArrayColons(s);
  s = fixBadFunctionCallColons(s);
  s = fixClassPropertyCommas(s);
  s = fixDoubleValues(s);
  s = fixColonChains(s);
  s = fixColonChainDamage(s);
  s = fixIndexSignatureDamage(s);
  s = fixNesMemoryCorruption(s);
  s = fixSpecificRagDamage(s);
  s = fixQloraOptions(s);
  s = dropImmediateDuplicateBlocks(s);

  return { text: s, changed: s !== before };
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.split("=");
    if (a === "--dry-run") args.dryRun = true;
    else if (k === "--list") args.list = v;
    else if (k === "--out") args.out = v;
    else if (k === "--skiplist") args.skiplist = v;
  }
  if (!args.list) throw new Error("Missing --list=PATH");
  return args;
}

function loadList(p) {
  return readText(p).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

function loadSkiplist(p) {
  if (!p || !fs.existsSync(p)) return new Set();
  return new Set(loadList(p));
}

const args = parseArgs(process.argv);
const outDir = args.out || "reports/phase82_structural";
const files = loadList(args.list);
const skip = loadSkiplist(args.skiplist);

let filesProcessed = 0;
let filesModified = 0;
let totalFixes = 0;

const patchesDir = path.join(outDir, "patches");
fs.mkdirSync(patchesDir, { recursive: true });

const results = [];

for (const rel of files) {
  if (skip.has(rel)) {
    results.push({ file: rel, skipped: true, reason: "skiplist" });
    continue;
  }
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) {
    results.push({ file: rel, skipped: true, reason: "missing" });
    continue;
  }

  filesProcessed++;
  const before = readText(abs);
  const { text: after, changed } = applyFixes(before);

  if (!changed) {
    results.push({ file: rel, changed: false, fixes: 0 });
    continue;
  }

  // crude "fix count": number of joiners repaired + return splices
  const joinFixes = (before.match(/}\s*;\s*(?=(function|const|let|var|type|interface|export|class)\b)/g) || []).length;
  const retFixes  = (before.match(/\)\s*\|\s*(undefined|null)\b/g) || []).length;
  const fixes = joinFixes + retFixes;
  totalFixes += fixes;

  filesModified++;
  results.push({ file: rel, changed: true, fixes });

  if (!args.dryRun) writeText(abs, after);

  // write a tiny diff-like patch artifact (not a true git diff, but proof)
  const proofPath = path.join(patchesDir, rel.replace(/[\/\\]/g, "__") + ".before_after.txt");
  writeText(proofPath, `--- BEFORE (${rel}) ---\n${before}\n\n--- AFTER (${rel}) ---\n${after}\n`);
}

const summary = {
  dryRun: !!args.dryRun,
  list: args.list,
  out: outDir,
  filesInList: files.length,
  filesProcessed,
  filesModified,
  totalFixes,
  timestamp: new Date().toISOString(),
};

fs.mkdirSync(outDir, { recursive: true });
writeText(path.join(outDir, "phase82-structural-summary.json"), JSON.stringify(summary, null, 2));
writeText(path.join(outDir, "phase82-structural-results.jsonl"), results.map(r => JSON.stringify(r)).join("\n") + "\n");

console.log(JSON.stringify(summary, null, 2));
