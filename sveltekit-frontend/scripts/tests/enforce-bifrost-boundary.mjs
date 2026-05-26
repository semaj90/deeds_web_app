#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SERVER_ROOT = path.join(ROOT, 'src', 'lib', 'server');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'tests', 'bifrost-boundary-baseline.json');

const DIRECT_PATTERNS = [
  /ollamaFetch\(\s*`\$\{[^`]*\}\/api\/(chat|generate)/g,
  /fetch\(\s*`\$\{[^`]*OLLAMA_BASE_URL[^`]*\}\/api\/(chat|generate)/g,
  /fetch\(\s*`\$\{[^`]*ollamaUrl[^`]*\}\/api\/(chat|generate)/g,
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!full.endsWith('.ts')) continue;
    if (full.endsWith('.d.ts')) continue;
    if (full.endsWith('.spec.ts') || full.endsWith('.test.ts')) continue;
    out.push(full);
  }
  return out;
}

const files = walk(SERVER_ROOT);
const baseline = fs.existsSync(BASELINE_FILE)
  ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
  : { legacyDirectCallFiles: [] };
const baselineSet = new Set((baseline.legacyDirectCallFiles ?? []).map((p) => String(p)));
const violations = [];
let matchedDirectFiles = 0;
let baselineLegacyHits = 0;

for (const full of files) {
  const text = fs.readFileSync(full, 'utf8');
  const hasDirectCall = DIRECT_PATTERNS.some((re) => re.test(text));
  if (!hasDirectCall) continue;

  matchedDirectFiles++;
  const rel = path.relative(ROOT, full).replaceAll('\\', '/');

  // Canonical gateway module itself is allowed.
  if (rel === 'src/lib/server/ollama.ts') continue;

  // Any direct call outside the gateway requires explicit boundary assertion.
  const hasAssertion = text.includes('assertDirectOllamaAllowed(');
  if (hasAssertion) continue;

  // Legacy backlog is tolerated temporarily; gate only blocks new regressions.
  if (baselineSet.has(rel)) {
    baselineLegacyHits++;
    continue;
  }

  if (!hasAssertion) {
    violations.push({
      file: rel,
      reason:
        'Direct Ollama call found without assertDirectOllamaAllowed() boundary exemption and not present in baseline.',
    });
  }
}

if (violations.length > 0) {
  console.error('[audit:bifrost-boundary] FAILED');
  for (const v of violations) {
    console.error(` - ${v.file}: ${v.reason}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      scannedFiles: files.length,
      directCallFiles: matchedDirectFiles,
      baselineLegacyHits,
      message:
        'No new direct Ollama boundary regressions. Non-baseline direct calls must use assertDirectOllamaAllowed().',
    },
    null,
    2
  )
);
