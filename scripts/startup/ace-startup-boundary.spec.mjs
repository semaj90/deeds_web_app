import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ACE-STARTUP-BOUNDARY-01: static boundary between TRACE MCP startup, Graphify apply,
// Karpathy score-cache enrichment and ACE/BitFrost packet warming. Reads source only.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const packetStepRaw = read('scripts/atlas/graphify-daily-ace-packet-step-v1.mjs');
const packetStep = stripComments(packetStepRaw);
const dailyStartup = read('scripts/startup/run-graphify-daily-startup.mjs');
const karpathy = read('scripts/atlas/run-karpathy-gpu-admitted-v1.mjs');

const BITFROST_WRITE = /writeRevisionQualifiedV3ToBitfrost|bitfrost:(?:packet|trace|source)/;

test('ACE packet step performs no cache or canonical writes', () => {
  assert.match(packetStep, /cacheWrites: 0, canonicalWrites: 0/);
  assert.match(packetStep, /cacheWrites: 0, receipt:/);
  assert.doesNotMatch(packetStep, /ioredis|createClient|new Redis|\.hset\(|\.setex\(|\.set\(/);
  assert.doesNotMatch(packetStep, BITFROST_WRITE);
  assert.match(packetStep, /loadEmbedAllowedPacketKeysV1/);
  assert.doesNotMatch(packetStep, /ENRICHMENT_READINESS_CTE_V1|FROM lv/);
});

test('ACE packet step status vocabulary has no warmed/success state', () => {
  const statuses = [...packetStep.matchAll(/receipt\.status\s*=\s*([^;]+);/g)]
    .flatMap((m) => [...m[1].matchAll(/'([A-Z_]+)'/g)].map((q) => q[1]));
  assert.ok(statuses.includes('BLOCKED') && statuses.includes('ADMITTED_COMPOSITION_NOT_WIRED'));
  for (const s of statuses) assert.doesNotMatch(s, /^(OK|SUCCESS|WARMED|ADMITTED|COMPLETE)$/);
  assert.match(packetStepRaw, /PACKET_COMPOSITION_NOT_WIRED/);
});

test('ACE packet step is gated by the verdict-enforcing admission wrapper', () => {
  assert.match(packetStep, /require-canonical-projection-admission-v1\.mjs/);
  assert.match(packetStep, /NOT_SAFE_TO_PROJECT/);
});

test('Graphify daily startup and Karpathy enrichment do not write BitFrost packet keys', () => {
  assert.doesNotMatch(dailyStartup, BITFROST_WRITE);
  assert.doesNotMatch(karpathy, BITFROST_WRITE);
  assert.doesNotMatch(karpathy, /ace:packet|AcePacketWriter/);
});

test('BitFrost packet writer has no caller outside the packet writer and its test', () => {
  const callers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|mts|ts)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('writeRevisionQualifiedV3ToBitfrost')) {
        callers.push(path.relative(root, p).replaceAll('\\', '/'));
      }
    }
  };
  walk(path.join(root, 'scripts'));
  walk(path.join(root, 'sveltekit-frontend', 'src'));
  // The packet step names the writer only in its "not wired" comment; no production caller is allowed yet.
  const allowed = new Set([
    'scripts/atlas/graphify-daily-ace-packet-step-v1.mjs',
    'sveltekit-frontend/src/lib/server/ace/ace-packet-writer.ts',
    'sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-residency-warming-v1.test.ts',
    'scripts/startup/ace-startup-boundary.spec.mjs',
  ]);
  assert.deepEqual(callers.filter((c) => !allowed.has(c)), []);
});

test('TRACE MCP startup is separate from the Graphify daily chain and never touches ACE/BitFrost', () => {
  const ensure = stripComments(read('sveltekit-frontend/scripts/ensure-mcp-server.mjs'));
  assert.doesNotMatch(ensure, BITFROST_WRITE);
  assert.doesNotMatch(ensure, /AcePacketWriter|graphify|karpathy|ace:packet/i);
  const pkg = JSON.parse(read('sveltekit-frontend/package.json'));
  const chain = pkg.scripts['graphify:daily:chain'];
  assert.ok(chain.includes('graphify-daily-ace-packet-step-v1.mjs'));
  assert.doesNotMatch(chain, /ensure-mcp-server|mcp:trace|8788|karpathy/i);
});
