#!/usr/bin/env node
/**
 * SvelteKit + Superforms v2 form contract auditor.
 *
 * Checks:
 *   1. Superforms schema declared at module top level (not inside functions)
 *   2. superValidate() present in server load/action that exports a form schema
 *   3. Action returns fail(400, { form }) on validation failure (not bare fail(400))
 *   4. Client <form> components wire use:enhance or call superForm()
 *   5. API routes (GET +server.ts) parse JSON body with Zod validation (not raw json())
 *   6. zod4 adapter used (not legacy zod adapter) — project uses zod v4
 *   7. Server-only imports (@db, server/) not leaked into client .svelte files
 *   8. Detected: schema defined but no matching load() export (orphaned schema)
 *
 * Usage:
 *   node scripts/atlas/audit-sveltekit-form-contracts.mjs [--json] [--dry-run]
 *
 * Output:
 *   docs/reports/sveltekit-form-contracts-report.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './_atlas-utils.mjs';

const FRONTEND    = join(REPO_ROOT, 'sveltekit-frontend');
const ROUTES_DIR  = join(FRONTEND, 'src', 'routes');
const REPORTS_DIR = join(REPO_ROOT, 'docs', 'reports');

const ARGS    = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const JSON_OUT = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

function rg(pattern, path, extraArgs = []) {
  const result = spawnSync('rg', [
    '-u', '--no-heading', '-n', '--color=never', pattern, path, ...extraArgs,
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return (result.stdout || '').trim();
}

function rgFiles(pattern, path, extraArgs = []) {
  const result = spawnSync('rg', [
    '-u', '-l', '--color=never', pattern, path, ...extraArgs,
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  return (result.stdout || '').trim().split('\n').filter(Boolean);
}

function readFile(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function rel(p) { return relative(REPO_ROOT, p); }

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Collect all route file pairs: for each directory under routes/ gather
 * +page.server.ts, +page.svelte, +server.ts, +layout.server.ts, +layout.svelte
 */
function collectRoutePairs() {
  const pairs = new Map(); // dir → { serverTs, pageSvelte, serverHandler, layoutServer, layoutSvelte }
  if (!existsSync(ROUTES_DIR)) return pairs;

  function walk(dir) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const p = pairs.get(dir) || {};
          if (entry.name === '+page.server.ts') p.pageServer = full;
          else if (entry.name === '+page.svelte') p.pageSvelte = full;
          else if (entry.name === '+server.ts') p.serverHandler = full;
          else if (entry.name === '+layout.server.ts') p.layoutServer = full;
          else if (entry.name === '+layout.svelte') p.layoutSvelte = full;
          pairs.set(dir, p);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }
  walk(ROUTES_DIR);
  return pairs;
}

// ── Check 1: Schema top-level declaration ─────────────────────────────────────
function checkSchemaTopLevel() {
  const findings = [];
  // superValidate( called but the schema variable is defined inside a function
  const serverFiles = rgFiles(
    'superValidate\\(',
    join(FRONTEND, 'src'),
    ['--type', 'ts'],
  );

  for (const f of serverFiles) {
    const text = readFile(f);
    const lines = text.split('\n');

    // Find lines with superValidate( and check if the schema arg is a local variable
    // defined inside a function (heuristic: defined at depth > 0)
    let currentDepth = 0;
    const localVarsByDepth = new Map(); // depth → Set of var names

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const opens  = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;

      // Track const/let declarations at current depth
      const decl = line.match(/(?:const|let)\s+(\w+)\s*=/);
      if (decl) {
        if (!localVarsByDepth.has(currentDepth)) localVarsByDepth.set(currentDepth, new Set());
        localVarsByDepth.get(currentDepth).add(decl[1]);
      }

      // Check superValidate( calls
      // These are data-source variables (FormData, Request, etc.), not schema names.
      // In Superforms v2: superValidate(formData, zod(schema)) — arg 1 is data, not schema.
      const DATA_SOURCE_NAMES = new Set(['formData', 'request', 'data', 'form', 'body', 'payload', 'req']);
      const svMatch = line.match(/superValidate\s*\(\s*(\w+)/);
      if (svMatch && currentDepth > 0) {
        const schemaArg = svMatch[1];
        // Check if schemaArg was defined inside a function (depth > 0) and is not a data source
        let isLocal = false;
        if (!DATA_SOURCE_NAMES.has(schemaArg)) {
          for (const [d, names] of localVarsByDepth) {
            if (d > 0 && names.has(schemaArg)) { isLocal = true; break; }
          }
        }
        if (isLocal) {
          findings.push({
            findingId: `forms:schema-not-top-level:${rel(f)}:${i + 1}`,
            severity: 'medium',
            layer: 'superforms',
            code: 'superforms_schema_not_top_level',
            file: rel(f),
            line: i + 1,
            problem: `Schema "${schemaArg}" passed to superValidate() appears to be defined inside a function scope — Superforms v2 requires schemas at module top level to avoid re-creation on every request.`,
            suggestedFix: `Move the ${schemaArg} schema definition to module top level (outside of any function/action/load).`,
          });
        }
      }

      currentDepth += opens - closes;
      if (currentDepth < 0) currentDepth = 0;
    }
  }
  return { check: 'schema_top_level', pass: findings.length === 0, findings };
}

// ── Check 2: superValidate without load/action pair ───────────────────────────
function checkSuperValidatePairing() {
  const findings = [];
  const pairs = collectRoutePairs();

  for (const [dir, files] of pairs) {
    if (!files.pageServer) continue;
    const text = readFile(files.pageServer);

    const hasValidate = text.includes('superValidate(');
    const hasLoad     = /export\s+(async\s+)?function\s+load\b/.test(text);
    const hasActions  = /export\s+const\s+actions\b/.test(text);

    // superValidate present but no load() and no actions
    if (hasValidate && !hasLoad && !hasActions) {
      findings.push({
        findingId: `forms:superValidate-without-load-or-actions:${rel(files.pageServer)}`,
        severity: 'high',
        layer: 'superforms',
        code: 'superValidate_without_matching_schema',
        file: rel(files.pageServer),
        problem: 'superValidate() called but neither load() nor actions are exported — the form data will never reach the client.',
        suggestedFix: 'Export a load() function that returns { form } or add form actions.',
      });
    }
  }
  return { check: 'superValidate_pairing', pass: findings.length === 0, findings };
}

// ── Check 3: Action missing fail(400, { form }) ───────────────────────────────
function checkActionFailContract() {
  const findings = [];
  const pairs = collectRoutePairs();

  for (const [dir, files] of pairs) {
    if (!files.pageServer) continue;
    const text = readFile(files.pageServer);
    if (!text.includes('actions')) continue;
    if (!text.includes('superValidate(')) continue;

    const hasFail400Form = /fail\s*\(\s*400\s*,\s*\{\s*form\b/.test(text);
    const hasFail        = /\bfail\s*\(/.test(text);

    if (hasFail && !hasFail400Form) {
      findings.push({
        findingId: `forms:action-missing-fail-400-form:${rel(files.pageServer)}`,
        severity: 'high',
        layer: 'superforms',
        code: 'action_missing_fail_400_form',
        file: rel(files.pageServer),
        problem: 'Form action calls fail() but does not include { form } in the payload — Superforms v2 requires fail(400, { form }) for the client to receive validation errors.',
        suggestedFix: "Change fail(status) to fail(400, { form }) where form is the validated superValidate result.",
      });
    }

    // Action returns form but no fail at all (also suspicious)
    if (text.includes('actions') && text.includes('superValidate(') && !hasFail) {
      findings.push({
        findingId: `forms:action-missing-return-form:${rel(files.pageServer)}`,
        severity: 'medium',
        layer: 'superforms',
        code: 'action_missing_return_form',
        file: rel(files.pageServer),
        problem: 'Form action uses superValidate() but has no fail() call — validation errors cannot reach the client form.',
        suggestedFix: "Add `if (!form.valid) return fail(400, { form });` after superValidate().",
      });
    }
  }
  return { check: 'action_fail_contract', pass: findings.length === 0, findings };
}

// ── Check 4: Client superForm without server load ─────────────────────────────
function checkClientSuperFormPairing() {
  const findings = [];
  const pairs = collectRoutePairs();

  for (const [dir, files] of pairs) {
    if (!files.pageSvelte) continue;
    const svelteText = readFile(files.pageSvelte);
    // Only flag pages that call superForm() — use:enhance is SvelteKit native and does not
    // require superforms. A page using plain use:enhance (no superForm()) is correct.
    if (!svelteText.includes('superForm(')) continue;

    // Check if the corresponding +page.server.ts exports a form in load()
    if (!files.pageServer) {
      findings.push({
        findingId: `forms:client-superForm-without-server-load:${rel(files.pageSvelte)}`,
        severity: 'medium',
        layer: 'superforms',
        code: 'client_superForm_without_server_load',
        file: rel(files.pageSvelte),
        problem: 'Client uses superForm() or use:enhance but there is no +page.server.ts — data.form will be undefined.',
        suggestedFix: 'Create a +page.server.ts that exports a load() returning { form: await superValidate(zod(schema)) }.',
      });
      continue;
    }

    const serverText = readFile(files.pageServer);
    const serverHasForm = serverText.includes('superValidate(') ||
                          /return\s+\{[^}]*\bform\b/.test(serverText);
    if (!serverHasForm) {
      findings.push({
        findingId: `forms:client-superForm-server-load-missing-form:${rel(files.pageSvelte)}`,
        severity: 'medium',
        layer: 'superforms',
        code: 'client_superForm_without_server_load',
        file: rel(files.pageSvelte),
        problem: 'Client calls superForm(data.form) but the server load() does not return a form object — data.form will be undefined.',
        suggestedFix: 'In +page.server.ts load(), return { form: await superValidate(zod(schema)) }.',
      });
    }
  }
  return { check: 'client_superForm_pairing', pass: findings.length === 0, findings };
}

// ── Check 5: API routes parsing JSON without Zod ──────────────────────────────
function checkApiRoutesZodValidation() {
  const findings = [];
  // Find +server.ts files with json() body parsing but no zod import
  const serverHandlers = rgFiles(
    '(?:request\\.json\\(\\)|await request\\.formData)',
    join(FRONTEND, 'src', 'routes'),
    ['--type', 'ts', '--glob', '+server.ts'],
  );

  for (const f of serverHandlers) {
    const text = readFile(f);
    const hasJson   = text.includes('request.json()') || text.includes('request.formData()');
    const hasZod    = /from\s+['"]zod['"]/i.test(text) || /import\s*\{[^}]*z[^}]*\}\s*from/i.test(text);
    const hasSchema = text.includes('.parse(') || text.includes('.safeParse(') || text.includes('superValidate(');

    if (hasJson && !hasZod && !hasSchema) {
      const method = text.includes('export async function POST') ? 'POST'
        : text.includes('export async function PUT') ? 'PUT'
        : text.includes('export async function PATCH') ? 'PATCH'
        : text.includes('export async function DELETE') ? 'DELETE' : 'UNKNOWN';

      findings.push({
        findingId: `forms:api-route-json-without-zod:${rel(f)}`,
        severity: 'high',
        layer: 'api-contract',
        code: 'api_route_parses_json_without_zod',
        file: rel(f),
        problem: `API route (${method}) reads request body via request.json()/formData() but does not validate it with Zod — untrusted input passes through unvalidated.`,
        suggestedFix: "Import Zod schema and call schema.safeParse(body) before using the data. Return 400 on parse failure.",
      });
    }
  }
  return { check: 'api_routes_zod_validation', pass: findings.length === 0, findings };
}

// ── Check 6: Legacy zod adapter (not zod4) ────────────────────────────────────
function checkZod4Adapter() {
  const findings = [];
  // The project uses Zod v4 and imports the zod4 adapter from sveltekit-superforms
  // Look for files still using legacy `import { zod } from 'sveltekit-superforms/adapters'`
  // (without the zod4 alias) alongside zod v3 imports
  const legacyAdapterFiles = rgFiles(
    "from 'sveltekit-superforms/adapters'",
    join(FRONTEND, 'src'),
    ['--type', 'ts', '--type', 'svelte'],
  );

  for (const f of legacyAdapterFiles) {
    const text = readFile(f);
    // Check for: import { zod } (not zod4)
    const importsLegacyZod = /\bimport\s+\{[^}]*\bzod\b(?!4)[^}]*\}\s*from\s*['"]sveltekit-superforms\/adapters['"]/.test(text);
    // Check for: import { zod4 as zod } — correct pattern for zod v4
    const importsZod4Alias = /\bzod4\s+as\s+zod\b/.test(text) || /\bzod4Client\s+as\s+zodClient\b/.test(text);

    if (importsLegacyZod && !importsZod4Alias) {
      findings.push({
        findingId: `forms:legacy-zod-adapter:${rel(f)}`,
        severity: 'medium',
        layer: 'superforms',
        code: 'legacy_zod_adapter',
        file: rel(f),
        problem: "File uses the legacy zod adapter from 'sveltekit-superforms/adapters' — project uses Zod v4, which requires importing `{ zod4 as zod }` or `{ zod4Client as zodClient }`.",
        suggestedFix: "Change: `import { zod } from 'sveltekit-superforms/adapters'` → `import { zod4 as zod } from 'sveltekit-superforms/adapters'`",
      });
    }
  }
  return { check: 'zod4_adapter', pass: findings.length === 0, findings };
}

// ── Check 7: Server imports leaked into client .svelte ────────────────────────
function checkServerImportLeak() {
  const findings = [];
  // Server-only modules that MUST NOT appear in .svelte files
  const serverOnlyPatterns = [
    { pattern: "from '$lib/server/", label: '$lib/server/ import in .svelte' },
    { pattern: "from '$lib/server", label: '$lib/server import in .svelte' },
    { pattern: "from '../server/", label: 'relative server import in .svelte' },
    { pattern: 'from \'drizzle-orm\'', label: 'drizzle-orm in .svelte' },
    { pattern: 'from "drizzle-orm"', label: 'drizzle-orm in .svelte' },
  ];

  const svelteFiles = rgFiles(
    "from.*['\"].*\\$lib/server",
    join(FRONTEND, 'src', 'routes'),
    ['--glob', '!+page.server.ts', '--glob', '!+layout.server.ts', '--glob', '!+server.ts', '--glob', '*.svelte'],
  );

  const libSvelteFiles = rgFiles(
    "from.*['\"].*\\$lib/server",
    join(FRONTEND, 'src', 'lib'),
    ['--glob', '*.svelte'],
  );

  const allFiles = [...new Set([...svelteFiles, ...libSvelteFiles])];

  for (const f of allFiles) {
    if (f.endsWith('.server.ts') || f.endsWith('.server.svelte')) continue;
    const text = readFile(f);
    for (const { pattern, label } of serverOnlyPatterns) {
      // Only flag VALUE imports — `import type` lines are erased at compile time
      // and are safe in .svelte files (TypeScript erases them before Svelte compiles).
      const lines = text.split('\n');
      const hasValueImport = lines.some(line => {
        const trimmed = line.trim();
        // Skip type-only imports: `import type { ... }` or `import type X`
        if (/^import\s+type\b/.test(trimmed)) return false;
        return trimmed.includes(pattern);
      });

      if (hasValueImport) {
        findings.push({
          findingId: `forms:server-import-in-svelte:${rel(f)}`,
          severity: 'high',
          layer: 'ssr-safety',
          code: 'server_import_leaked_to_client',
          file: rel(f),
          problem: `Client-facing .svelte file contains a server-only value import (${label}) — this will break SSR and may expose server credentials to the browser bundle.`,
          suggestedFix: 'Move server-only logic to +page.server.ts load() / +server.ts and pass data as props. Type-only imports (import type) are safe and do not need moving.',
        });
        break; // one finding per file
      }
    }
  }
  return { check: 'server_import_leak', pass: findings.length === 0, findings };
}

// ── Check 8: Orphaned schema files (defined but no route uses them) ───────────
function checkOrphanedSchemas() {
  const findings = [];
  // Schema files co-located with routes (e.g. src/routes/foo/schema.ts)
  const schemaFiles = rgFiles(
    'export\\s+(?:const|let)\\s+\\w+Schema\\s*=\\s*z\\.',
    join(FRONTEND, 'src', 'routes'),
    ['--type', 'ts', '--glob', '!+*.ts'],
  );

  for (const f of schemaFiles) {
    const routeDir = dirname(f);
    const routeFiles = existsSync(routeDir)
      ? readdirSync(routeDir).filter(n => n.startsWith('+') && n.endsWith('.ts'))
      : [];

    const schemaName = basename(f, '.ts');
    let isUsed = false;
    for (const rf of routeFiles) {
      const routeText = readFile(join(routeDir, rf));
      if (routeText.includes(schemaName) || routeText.includes('schema')) {
        isUsed = true;
        break;
      }
    }

    if (!isUsed) {
      findings.push({
        findingId: `forms:orphaned-schema:${rel(f)}`,
        severity: 'low',
        layer: 'superforms',
        code: 'zod_schema_not_connected_to_drizzle_table',
        file: rel(f),
        problem: `Schema file "${basename(f)}" defines exported Zod schemas but no adjacent +page.server.ts or +server.ts imports them.`,
        suggestedFix: 'Either import the schema in the route server file or move it to a shared $lib/schemas/ location.',
      });
    }
  }
  return { check: 'orphaned_schemas', pass: findings.length === 0, findings };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── SvelteKit + Superforms v2 Form Contract Audit ──${C.reset}\n`);
  }

  const checks = [
    checkSchemaTopLevel(),
    checkSuperValidatePairing(),
    checkActionFailContract(),
    checkClientSuperFormPairing(),
    checkApiRoutesZodValidation(),
    checkZod4Adapter(),
    checkServerImportLeak(),
    checkOrphanedSchemas(),
  ];

  const allFindings = checks.flatMap(c => c.findings ?? []);
  const allPass = checks.every(c => c.pass);

  if (!JSON_OUT) {
    for (const c of checks) {
      const icon = c.pass
        ? `${C.green}✓${C.reset}`
        : `${C.red}✗${C.reset}`;
      const count = c.findings?.length ?? 0;
      console.log(`  ${icon}  ${String(c.check).replace(/_/g,' ').padEnd(32)}  ${
        c.pass
          ? `${C.green}PASS${C.reset}`
          : `${C.red}${count} finding(s)${C.reset}`
      }`);
      if (!c.pass) {
        for (const f of (c.findings ?? []).slice(0, 3)) {
          const sev = f.severity === 'high' ? C.red : f.severity === 'medium' ? C.yellow : C.gray;
          console.log(`     ${sev}[${f.severity}]${C.reset}  ${f.file}  ${C.gray}${f.problem.slice(0, 80)}…${C.reset}`);
        }
        if ((c.findings ?? []).length > 3) {
          console.log(`     ${C.gray}… ${(c.findings ?? []).length - 3} more${C.reset}`);
        }
      }
    }
    console.log(`\n  ${allPass ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`}  ` +
      `${allFindings.filter(f => f.severity === 'high').length} high  ` +
      `${allFindings.filter(f => f.severity === 'medium').length} medium  ` +
      `${allFindings.filter(f => f.severity === 'low').length} low\n`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checks: checks.map(c => ({
      check: c.check,
      pass: c.pass,
      findingCount: (c.findings ?? []).length,
    })),
    findings: allFindings,
    summary: {
      total: allFindings.length,
      high: allFindings.filter(f => f.severity === 'high').length,
      medium: allFindings.filter(f => f.severity === 'medium').length,
      low: allFindings.filter(f => f.severity === 'low').length,
    },
    status: allPass ? 'pass' : 'fail',
  };

  if (!DRY_RUN) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      join(REPORTS_DIR, 'sveltekit-form-contracts-report.json'),
      JSON.stringify(report, null, 2),
    );
    if (!JSON_OUT) {
      console.log(`  ${C.gray}Report → docs/reports/sveltekit-form-contracts-report.json${C.reset}\n`);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(2); });