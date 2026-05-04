#!/usr/bin/env node
/**
 * generate-codebase-directory-map.mjs
 *
 * Generates a comprehensive codebase directory map by:
 *   1. Walking the entire src/ tree to collect structural metrics (Node.js-native, no shell)
 *   2. Fetching Redis wiki:note:dir:* entries for LLM summaries (if available)
 *   3. Computing production-readiness scores per directory
 *   4. Writing docs/CODEBASE_DIRECTORY_MAP.md
 *
 * Usage:
 *   node scripts/tests/generate-codebase-directory-map.mjs [options]
 *
 * Options:
 *   --dry-run        Print to stdout instead of writing file
 *   --no-redis       Skip Redis wiki note lookup (structural metrics only)
 *   --depth N        Max depth from src/ root to include (default: 4)
 *   --min-files N    Minimum files per directory to include (default: 1)
 *   --out PATH       Output file path (default: docs/CODEBASE_DIRECTORY_MAP.md)
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { createConnection } from 'net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');   // sveltekit-frontend/
const SRC       = path.join(ROOT, 'src');
const DOCS_DIR  = path.resolve(ROOT, '..', 'docs');  // repo root docs/

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_REDIS   = args.includes('--no-redis');
function getArg(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  return isNaN(parseInt(args[i + 1])) ? def : parseInt(args[i + 1]);
}
function getStrArg(flag, def) {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1];
}
const MAX_DEPTH  = getArg('--depth', 4);
const MIN_FILES  = getArg('--min-files', 1);
const OUT_PATH   = getStrArg('--out',
  path.resolve(ROOT, '..', 'docs', 'CODEBASE_DIRECTORY_MAP.md'));

const CODE_EXTS = new Set(['.ts', '.svelte', '.js', '.mjs', '.mts', '.cjs']);

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ── Node-native file helpers ──────────────────────────────────────────────────

function fileCount(dir) {
  let count = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && CODE_EXTS.has(path.extname(e.name))) count++;
    }
  } catch { /* unreadable */ }
  return count;
}

function lineCount(dir) {
  let total = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile() || !CODE_EXTS.has(path.extname(e.name))) continue;
      try { total += readFileSync(path.join(dir, e.name), 'utf8').split('\n').length; }
      catch { /* unreadable */ }
    }
  } catch { /* unreadable */ }
  return total;
}

function grepCount(re, dir, extFilter = null) {
  let count = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name);
      if (extFilter && !extFilter.includes(ext)) continue;
      if (!CODE_EXTS.has(ext)) continue;
      try {
        const m = readFileSync(path.join(dir, e.name), 'utf8').match(re);
        if (m) count += m.length;
      } catch { /* unreadable */ }
    }
  } catch { /* unreadable */ }
  return count;
}

// ── Directory walker ──────────────────────────────────────────────────────────

function walkDirs(root, maxDepth) {
  const result = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    const subDirs = entries.filter(
      e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules'
    );

    const nFiles = fileCount(dir);
    if (nFiles >= MIN_FILES) {
      const relPosix = path.relative(SRC, dir).replace(/\\/g, '/');
      result.push({ abs: dir, rel: relPosix || '.', depth, nFiles });
    }

    for (const sub of subDirs) {
      walk(path.join(dir, sub.name), depth + 1);
    }
  }
  walk(root, 0);
  return result;
}

// ── Redis single-key fetch via raw TCP (no npm package) ───────────────────────

function redisGet(key, redisUrl = 'redis://localhost:6379') {
  return new Promise((resolve) => {
    const url = new URL(redisUrl);
    const conn = createConnection({ host: url.hostname, port: parseInt(url.port || '6379') });
    let buf = '';
    const timer = setTimeout(() => { conn.destroy(); resolve(null); }, 2000);

    conn.on('connect', () => {
      conn.write(`*2\r\n$3\r\nGET\r\n$${key.length}\r\n${key}\r\n`);
    });
    conn.on('data', chunk => {
      buf += chunk.toString();
      if (buf.includes('\r\n')) {
        clearTimeout(timer);
        conn.destroy();
        if (buf.startsWith('$-1')) { resolve(null); return; }
        const m = buf.match(/^\$\d+\r\n([\s\S]*)\r\n$/);
        resolve(m ? m[1] : null);
      }
    });
    conn.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

function redisKeys(pattern, redisUrl = 'redis://localhost:6379') {
  return new Promise((resolve) => {
    const url = new URL(redisUrl);
    const conn = createConnection({ host: url.hostname, port: parseInt(url.port || '6379') });
    let buf = '';
    const timer = setTimeout(() => { conn.destroy(); resolve([]); }, 3000);

    conn.on('connect', () => {
      conn.write(`*2\r\n$4\r\nKEYS\r\n$${pattern.length}\r\n${pattern}\r\n`);
    });
    conn.on('data', chunk => {
      buf += chunk.toString();
      // Wait for complete response (ends with \r\n on last element)
      if (buf.match(/\r\n$/)) {
        clearTimeout(timer);
        conn.destroy();
        // Parse RESP array: *N\r\n$len\r\nval\r\n...
        const keys = [];
        const lines = buf.split('\r\n');
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].startsWith('$') && lines[i + 1]) {
            keys.push(lines[i + 1]);
            i++;
          }
        }
        resolve(keys);
      }
    });
    conn.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeScore(abs) {
  const m = {
    zodValidation:  grepCount(/import.*zod|from.*zod|z\.object|z\.string/gm, abs),
    authGuards:     grepCount(/locals\.user|requireAuth|getSession/gm, abs),
    todoCount:      grepCount(/TODO|FIXME|HACK|XXX/gm, abs),
    hardcodedUrls:  grepCount(/localhost|127\.0\.0\.1/gm, abs),
    fetchCalls:     grepCount(/fetch\('|fetch\(`/gm, abs),
    dbQueries:      grepCount(/db\.select|db\.insert|db\.update|pool\.query/gm, abs),
    svelte4:        grepCount(/export let |on:click|\$:/gm, abs, ['.svelte']),
    exports:        grepCount(/export (async function|function|class|const|interface|type)/gm, abs),
  };
  const hasZod    = m.zodValidation > 0 ? 20 : 0;
  const hasAuth   = (m.authGuards > 0 || m.fetchCalls === 0) ? 20 : 0;
  const lowTodo   = m.todoCount === 0 ? 15 : m.todoCount < 3 ? 10 : 0;
  const noHardUrl = m.hardcodedUrls === 0 ? 20 : 0;
  const noSvelte4 = m.svelte4 === 0 ? 15 : 0;
  const hasExp    = m.exports > 0 ? 10 : 0;
  return { score: hasZod + hasAuth + lowTodo + noHardUrl + noSvelte4 + hasExp, metrics: m };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold('\n📂 Codebase Directory Map Generator'));
  console.log(c.dim(`   Source: ${SRC}`));
  console.log(c.dim(`   Redis: ${NO_REDIS ? 'skip' : 'enabled'} | Depth: ${MAX_DEPTH} | DryRun: ${DRY_RUN}`));

  // Phase 1: Walk src/ tree
  console.log('\n' + c.cyan('Phase 1 — Walking src/ tree...'));
  const dirs = walkDirs(SRC, MAX_DEPTH);
  console.log(`  Found ${dirs.length} directories`);

  // Phase 2: Structural metrics (progress dots)
  console.log(c.cyan('Phase 2 — Computing structural metrics...'));
  process.stdout.write('  ');
  let dot = 0;
  for (const d of dirs) {
    const { score, metrics } = computeScore(d.abs);
    d.score   = score;
    d.metrics = metrics;
    d.lines   = lineCount(d.abs);
    if (++dot % 10 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');

  // Phase 3: Redis wiki notes
  const wikiNotes = new Map();
  if (!NO_REDIS) {
    console.log(c.cyan('Phase 3 — Fetching Redis wiki notes...'));
    try {
      const keys = await redisKeys('wiki:note:dir:*');
      if (keys.length > 0) {
        console.log(`  Found ${keys.length} wiki note keys`);
        for (const key of keys) {
          const raw = await redisGet(key);
          if (!raw) continue;
          try {
            const note = JSON.parse(raw);
            const dirPath = String(note.directoryPath ?? '');
            if (dirPath) wikiNotes.set(dirPath, note);
          } catch { /* parse error */ }
        }
        console.log(`  Loaded ${wikiNotes.size} valid notes`);
      } else {
        console.log(c.dim('  No wiki notes cached yet (run deep-directory-audit.mjs to populate)'));
      }
    } catch (e) {
      console.log(c.dim(`  Redis unavailable (${e.message}) — structural metrics only`));
    }
  }

  // Phase 4: Build markdown
  console.log(c.cyan('Phase 4 — Building markdown...'));

  const timestamp  = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const critical   = dirs.filter(d => d.score < 40);
  const warning    = dirs.filter(d => d.score >= 40 && d.score < 70);
  const good       = dirs.filter(d => d.score >= 70);
  const withNotes  = dirs.filter(d => wikiNotes.has(d.rel));

  // Summary table (all dirs)
  const tableRows = dirs
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map(d => {
      const note  = wikiNotes.get(d.rel);
      const tags  = note?.dominantTags?.slice(0, 4).join(', ') ?? '';
      const emoji = d.score >= 70 ? '🟢' : d.score >= 40 ? '🟡' : '🔴';
      const issues = [
        d.metrics.todoCount > 0      && `${d.metrics.todoCount}×TODO`,
        d.metrics.hardcodedUrls > 0  && `${d.metrics.hardcodedUrls}×URL`,
        d.metrics.svelte4 > 0        && 'svelte4',
        d.metrics.zodValidation === 0 && d.metrics.fetchCalls > 0 && 'no-zod',
        d.metrics.authGuards === 0   && d.metrics.dbQueries > 0  && 'no-auth',
      ].filter(Boolean).join(' ');
      return `| ${emoji} | \`${d.rel}/\` | ${d.nFiles} | ${d.lines.toLocaleString()} | ${d.score} | ${issues || '✅'} | ${tags} |`;
    })
    .join('\n');

  // Per-directory detail with wiki notes
  const notesSections = withNotes.length > 0
    ? withNotes
        .sort((a, b) => b.score - a.score)
        .map(d => {
          const note = wikiNotes.get(d.rel)!;
          const sum  = String(note.summary ?? note.purpose ?? '');
          const tags = (Array.isArray(note.dominantTags) ? note.dominantTags as string[] : []).join(', ');
          const as   = note.auditScore != null ? ` | Audit ${note.auditScore}/100` : '';
          return `### \`${d.rel}/\`\n\n> ${sum}\n\n**Tags:** ${tags || '_none_'}${as}\n`;
        })
        .join('\n')
    : '_No wiki notes found. Run `deep-directory-audit.mjs` (any target) to populate._\n';

  // Scoreboard per tier
  const tierSection = (label, emoji, arr) => arr.length === 0
    ? `### ${emoji} ${label}\n\n_None_\n`
    : `### ${emoji} ${label} (${arr.length})\n\n` +
      arr.sort((a, b) => a.rel.localeCompare(b.rel))
         .map(d => `- \`${d.rel}/\` — ${d.nFiles} files, ${d.lines.toLocaleString()} lines, score **${d.score}/100**`)
         .join('\n') + '\n';

  const md = `# Codebase Directory Map
> Generated: ${timestamp}
> Source: \`sveltekit-frontend/src/\`
> Script: \`scripts/tests/generate-codebase-directory-map.mjs\`
> Wiki notes from Redis: ${wikiNotes.size} / ${dirs.length} directories

## Overview

| Tier | Count | Description |
|------|-------|-------------|
| 🔴 Critical (score < 40) | ${critical.length} | Auth/Zod/hardcoded-URL gaps |
| 🟡 Warning (40–69) | ${warning.length} | Minor production gaps |
| 🟢 Good (≥ 70) | ${good.length} | Production-ready |
| **Total** | **${dirs.length}** | Directories with ≥${MIN_FILES} code file(s) |

**Score formula:** Zod(20) + Auth(20) + NoTODO(15) + NoHardURL(20) + NoSvelte4(15) + HasExports(10) = 100

---

## Full Directory Scoreboard

| Tier | Directory | Files | Lines | Score | Issues | Tags |
|------|-----------|-------|-------|-------|--------|------|
${tableRows}

---

## Tier Breakdown

${tierSection('Critical — needs immediate attention', '🔴', critical)}

${tierSection('Warning — production gaps', '🟡', warning)}

${tierSection('Good — production-ready', '🟢', good)}

---

## LLM Directory Summaries (KAG Wiki Notes)

${notesSections}

---

## How to Update This Map

\`\`\`bash
# Re-generate (structural metrics only):
node scripts/tests/generate-codebase-directory-map.mjs

# Populate Redis wiki notes first (uses TurboQuant/Ollama for AI summaries):
node scripts/tests/deep-directory-audit.mjs lib/server --direct --no-graph
node scripts/tests/deep-directory-audit.mjs routes/api --direct --no-graph
node scripts/tests/deep-directory-audit.mjs lib --direct --no-graph --depth 3

# Then re-generate with wiki notes:
node scripts/tests/generate-codebase-directory-map.mjs
\`\`\`

## Integration with ACE Context

Directory summaries cached in Redis under \`wiki:note:dir:*\` are automatically
injected into ACE context as KAG notes when queries match the directory path.

Key in Redis: \`wiki:note:dir:dir_{sanitized_path}\` (24h TTL)
Populated by: \`/api/codebase-index/summarize-dirs\` (POST) or \`deep-directory-audit.mjs\`
Consumed by: \`getDirectoryKAGContext()\` in \`community-graph.ts\`
Injected by: \`assembleACEContext()\` → \`webSearchContext\` → \`## KAG Directory Audit Notes\`
`;

  // Phase 5: Write or print
  if (DRY_RUN) {
    console.log('\n' + md.split('\n').slice(0, 60).join('\n'));
    console.log(c.dim(`\n... [${md.split('\n').length - 60} more lines — remove --dry-run to write]`));
  } else {
    const outDir = path.dirname(OUT_PATH);
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
    await writeFile(OUT_PATH, md, 'utf8');
    console.log(`\n  ${c.green('✅')} Written: ${c.cyan(OUT_PATH)}`);
  }

  console.log(`\n  ${c.bold('Summary:')} ${c.red(`${critical.length} critical`)}  ${c.yellow(`${warning.length} warning`)}  ${c.green(`${good.length} good`)}  (${dirs.length} total)\n`);
}

main().catch(e => { console.error(c.cyan('\n❌'), e.message); process.exit(1); });
