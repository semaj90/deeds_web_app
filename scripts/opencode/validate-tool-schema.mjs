#!/usr/bin/env node
/**
 * validate-tool-schema.mjs
 *
 * Scans tool/command schemas and validates discipline rules:
 *   .opencode/tools/*.ts            — Vercel AI SDK tools (Zod)
 *   sveltekit-frontend/scripts/mcp/*.mjs — MCP servers (inputSchema JSON Schema)
 *   opencode.json                   — command description fields
 *
 * Rules:
 *   1. Every tool/command has a non-empty string description
 *   2. Every inputSchema property has a description string
 *   3. No anyOf / oneOf / $ref (banned complexity)
 *   4. MCP tools use inputSchema (not args/schema/parameters)
 *   5. Vercel AI SDK tools use z.object() + .describe() on every field
 *   6. execute must be async
 *
 * Exits 0 = all pass, 1 = failures found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '..', '..');

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', reset: '\x1b[0m' };
let failures = 0;
let passes   = 0;

function fail(rel, msg) {
  failures++;
  console.log(`${C.red}FAIL${C.reset}  ${rel}  →  ${msg}`);
}
function ok(rel, msg) {
  passes++;
  console.log(`${C.green}PASS${C.reset}  ${rel}  →  ${msg}`);
}
function warn(rel, msg) {
  console.log(`${C.yellow}WARN${C.reset}  ${rel}  →  ${msg}`);
}
function rel(p) { return path.relative(ROOT, p); }

// ── Vercel AI SDK tools (.opencode/tools/*.ts) ─────────────────────────────────

function checkZodTool(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const r = rel(filePath);

  if (!/export\s+const\s+\w+\s*=\s*tool\s*\(/.test(src)) {
    // Plain function stubs (no tool() export) — warn only, not a discipline violation
    warn(r, 'stub file — no export const X = tool({...}), skipping schema checks');
    return;
  }

  // description: non-empty string
  if (!/description\s*:\s*['"`][\s\S]{5,}/.test(src)) {
    fail(r, 'description missing or too short');
  }

  // parameters: z.object
  if (!/parameters\s*:\s*z\.object\s*\(/.test(src)) {
    fail(r, 'parameters must be z.object({...})');
  }

  // every z.TYPE() field must have .describe( within 150 chars
  const fieldRe = /z\.(string|number|boolean|array|enum)\s*\([^)]*\)/g;
  let m;
  const missing = [];
  while ((m = fieldRe.exec(src)) !== null) {
    const after = src.slice(m.index, m.index + 150);
    if (!after.includes('.describe(')) {
      missing.push(after.slice(0, 60).replace(/\n/g, ' ').trim());
    }
  }
  if (missing.length) {
    fail(r, `${missing.length} field(s) missing .describe() — first: ${missing[0]}`);
    return;
  }

  // banned complexity
  if (/anyOf|oneOf|\$ref/.test(src)) {
    fail(r, 'contains banned anyOf/oneOf/$ref');
    return;
  }

  // execute async
  if (!/execute\s*:\s*async/.test(src)) {
    fail(r, 'execute must be async');
    return;
  }

  ok(r, 'Zod tool valid');
}

// ── MCP servers (sveltekit-frontend/scripts/mcp/*.mjs) ────────────────────────

function checkMcpServer(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  if (!src.includes('inputSchema')) return; // not a tool-serving MCP

  const r = rel(filePath);
  const toolNames = [...src.matchAll(/name\s*:\s*['"](\w+)['"]/g)].map(m => m[1]);

  let allOk = true;

  for (const name of toolNames) {
    const idx = src.indexOf(`name: '${name}'`) !== -1
      ? src.indexOf(`name: '${name}'`)
      : src.indexOf(`name: "${name}"`);
    if (idx === -1) continue;

    const block = src.slice(idx, idx + 3000);

    // description must be a string
    if (!/description\s*:\s*['"`\n]/.test(block.slice(0, 500))) {
      fail(r, `tool "${name}" missing description`);
      allOk = false;
    }

    // every property must have description
    const propsMatch = block.match(/properties\s*:\s*\{([\s\S]+?)\n\s*\},/);
    if (propsMatch) {
      const propNames = [...propsMatch[1].matchAll(/^\s{8}(\w+)\s*:/gm)].map(m => m[1]).filter(n => n !== 'items' && n !== 'type' && n !== 'description');
      for (const prop of propNames) {
        const propRe = new RegExp(prop + '\\s*:\\s*\\{([^}]+)\\}');
        const pm = propsMatch[1].match(propRe);
        if (pm && !pm[1].includes('description')) {
          fail(r, `tool "${name}" property "${prop}" missing description`);
          allOk = false;
        }
      }
    }

    // banned complexity
    if (block.slice(0, 2000).match(/anyOf|oneOf|\$ref/)) {
      fail(r, `tool "${name}" uses banned anyOf/oneOf/$ref`);
      allOk = false;
    }
  }

  if (allOk && toolNames.length > 0) {
    ok(r, `MCP inputSchema valid (${toolNames.length} tool(s): ${toolNames.join(', ')})`);
  }
}

// ── opencode.json command descriptions ────────────────────────────────────────

function checkOpencodeJson(filePath) {
  if (!fs.existsSync(filePath)) { warn(rel(filePath), 'not found'); return; }
  const r = rel(filePath);

  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { fail(r, `JSON parse error: ${e.message}`); return; }

  const cmds = cfg.command ?? {};
  let cmdOk = true;
  for (const [name, cmd] of Object.entries(cmds)) {
    if (!cmd.description || typeof cmd.description !== 'string' || cmd.description.trim().length < 5) {
      fail(r, `command "${name}" has missing/empty description`);
      cmdOk = false;
    }
    if ('template' in cmd && typeof cmd.template !== 'string') {
      fail(r, `command "${name}" template must be a string`);
      cmdOk = false;
    }
  }
  if (cmdOk) ok(r, `${Object.keys(cmds).length} command(s) all have valid descriptions`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('\n=== validate-tool-schema ===\n');

// 1. Zod tools
const toolsDir = path.join(ROOT, '.opencode', 'tools');
if (fs.existsSync(toolsDir)) {
  for (const f of fs.readdirSync(toolsDir).filter(f => /\.(ts|mjs)$/.test(f))) {
    checkZodTool(path.join(toolsDir, f));
  }
} else {
  warn('.opencode/tools/', 'directory not found');
}

// 2. MCP servers
const mcpDir = path.join(ROOT, 'sveltekit-frontend', 'scripts', 'mcp');
if (fs.existsSync(mcpDir)) {
  for (const f of fs.readdirSync(mcpDir).filter(f => f.endsWith('.mjs'))) {
    checkMcpServer(path.join(mcpDir, f));
  }
}

// 3. opencode.json
checkOpencodeJson(path.join(ROOT, 'opencode.json'));

console.log(`\n--- ${passes} pass, ${failures} fail ---`);
if (failures > 0) {
  console.log(`\n${C.red}FAIL${C.reset}  Fix all FAIL entries above.\n`);
  process.exit(1);
} else {
  console.log(`\n${C.green}PASS${C.reset}  All schemas valid.\n`);
  process.exit(0);
}
