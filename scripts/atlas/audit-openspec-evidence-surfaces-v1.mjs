import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_PATH = process.env.OPENSPEC_EVIDENCE_SURFACES_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_SURFACES_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-surfaces-audit-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function inspectFile(relativePath, requiredPatterns) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return { path: relativePath, present: false, patterns: {}, checksum: null };
  const contents = fs.readFileSync(filePath, 'utf8');
  const patterns = Object.fromEntries(requiredPatterns.map(([name, pattern]) => [name, pattern.test(contents)]));
  return {
    path: relativePath,
    present: true,
    patterns,
    checksum: `sha256:${crypto.createHash('sha256').update(contents, 'utf8').digest('hex')}`,
  };
}

function main() {
  const studioServer = inspectFile('sveltekit-frontend/src/routes/atlas/studio/openspec/+page.server.ts', [
    ['evidenceHealthReader', /readOpenSpecEvidenceHealthSnapshot/],
    ['boardReader', /readOpenSpecBoardSnapshot/],
  ]);
  const studioPage = inspectFile('sveltekit-frontend/src/routes/atlas/studio/openspec/+page.svelte', [
    ['evidencePanel', /OpenSpec evidence fabric health/],
    ['workboardParity', /WORKBOARD PARITY/],
    ['promotionStatus', /promotion eligible/],
  ]);
  const mcpTools = inspectFile('sveltekit-frontend/src/mcp/openspec-evidence-tools.ts', [
    ['census', /registerTool\('openspec\.census'/],
    ['task', /registerTool\('openspec\.task'/],
    ['frontier', /registerTool\('openspec\.frontier'/],
    ['card', /registerTool\('evidence\.card'/],
    ['receipt', /registerTool\('evidence\.receipt'/],
    ['contradictions', /registerTool\('evidence\.contradictions'/],
    ['dependencies', /registerTool\('graph\.dependencies'/],
    ['search', /registerTool\('search\.evidence'/],
    ['context', /registerTool\('context\.build'/],
    ['noWrites', /writesPerformed: false/g],
  ]);
  const mcpServer = inspectFile('sveltekit-frontend/src/mcp/trace-mcp-server.ts', [
    ['registration', /registerOpenSpecEvidenceTools\(server\)/],
  ]);
  const files = [studioServer, studioPage, mcpTools, mcpServer];
  const requiredChecks = files.flatMap((file) => Object.values(file.patterns));
  const allPresent = files.every((file) => file.present);
  const allChecksPass = requiredChecks.length > 0 && requiredChecks.every(Boolean);
  const unsigned = {
    schema: 'atlas.openspec-evidence-surfaces-audit.v1',
    milestone: 'EVF-14_AND_EVF-15',
    status: allPresent && allChecksPass ? 'SURFACES_PRESENT_LIVE_HANDSHAKE_UNPROVEN' : 'SURFACE_CONTRACT_MISSING',
    mode: 'READ_ONLY_SOURCE_SURFACE_AUDIT',
    files,
    gates: {
      studioSurfacePresent: studioServer.present && studioPage.present,
      mcpToolSurfacePresent: mcpTools.present && Object.values(mcpTools.patterns).every(Boolean),
      mcpRegistrationPresent: mcpServer.present && Object.values(mcpServer.patterns).every(Boolean),
      handshakePerformed: false,
      healthVerified: false,
      writesPerformed: false,
    },
    invariants: [
      'Source registration and UI wiring do not establish a live MCP handshake or service health receipt.',
      'MCP responses remain bounded and read-only until the runtime gate is independently verified.',
      'PostgreSQL, receipt, and projection authorities remain outside the UI/MCP surface.',
    ],
    likely_cause: 'Studio and MCP surfaces can be source-wired before their live handshake and health receipts exist.',
    evidence: files.map((file) => file.path),
    patch_targets: ['scripts/atlas/audit-openspec-evidence-surfaces-v1.mjs', ...files.map((file) => file.path)],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-surfaces-v1.mjs',
    smoke_command: 'node --check scripts/atlas/audit-openspec-evidence-surfaces-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, gates: report.gates, output: OUTPUT_PATH }, null, 2));
}

main();
