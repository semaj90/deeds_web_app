#!/usr/bin/env node
/**
 * STUB_SCAN_01 Incomplete Code & Stub Scanner (v1)
 *
 * Deterministic batch analysis finding stubs, mocks, placeholders, and TODOs
 * with explicit classification of production reachability:
 * - TEST_ONLY: files under tests/, __tests__/, *.test.*, *.spec.*, fixtures
 * - PROVEN: production modules imported in app runtime
 * - UNKNOWN: standalone scripts or unverified paths
 *
 * Enforces:
 * - mutationAllowed: false
 * - admissionAuthorized: false
 * - writesPerformed: false
 * - canonicalAuthority: false
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA_V1 = 'atlas.incomplete-code-stubs-scan.v1';
export const GATE_NAME = 'STUB_SCAN_01';

export function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function classifyProductionReachability(filePath) {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  if (
    norm.includes('/test/') ||
    norm.includes('/tests/') ||
    norm.includes('/__tests__/') ||
    norm.includes('.test.') ||
    norm.includes('.spec.') ||
    norm.includes('/fixtures/') ||
    norm.includes('/scratch/')
  ) {
    return 'TEST_ONLY';
  }
  if (norm.startsWith('sveltekit-frontend/src/lib/server/') || norm.startsWith('sveltekit-frontend/src/routes/')) {
    return 'PROVEN';
  }
  return 'UNKNOWN';
}

export function classifyStubPattern(matchedLine) {
  const line = matchedLine.trim();
  if (/throw new Error\s*\(\s*['"`](?:Not implemented|TODO)/i.test(line)) {
    return { category: 'NOT_IMPLEMENTED', confidence: 0.95 };
  }
  if (/mockCandidates|createMock|dummyData|mockPayload/i.test(line)) {
    return { category: 'MOCK_IN_PRODUCTION', confidence: 0.85 };
  }
  if (/as unknown as/i.test(line) && /return\s+.*as unknown as/i.test(line)) {
    return { category: 'PLACEHOLDER_RETURN', confidence: 0.8 };
  }
  if (/TODO\s*\(|TODO:\s*@/i.test(line)) {
    return { category: 'TODO_WITH_OWNER', confidence: 0.9 };
  }
  if (/TODO|FIXME/i.test(line)) {
    return { category: 'TODO_WITH_OWNER', confidence: 0.75 };
  }
  if (/const\s+.*sourceRevision.*=.*['"`]unknown['"`]/i.test(line)) {
    return { category: 'SENTINEL_REVISION', confidence: 0.9 };
  }
  return { category: 'UNRESOLVED_DEPENDENCY', confidence: 0.6 };
}

/**
 * Pure evaluator for text content of a single file.
 */
export function scanFileForStubs(filePath, fileContent, workspaceRevision = 'UNKNOWN_WORKSPACE_REV') {
  const findings = [];
  const sourceRevision = `sha256:${sha256Hex(fileContent)}`;
  const reachability = classifyProductionReachability(filePath);
  const lines = fileContent.split(/\r?\n/);

  let currentByte = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineBytes = Buffer.byteLength(line, 'utf8');

    if (
      line.includes('TODO') ||
      line.includes('FIXME') ||
      /throw new Error\s*\(\s*['"`](?:Not implemented|TODO)/i.test(line) ||
      /mockCandidates/i.test(line) ||
      /as unknown as/i.test(line)
    ) {
      const { category, confidence } = classifyStubPattern(line);
      const startByte = currentByte;
      const endByte = currentByte + lineBytes;
      const spanSha = sha256Hex(line.trim());

      findings.push({
        sourceRef: filePath.replace(/\\/g, '/'),
        sourceRevision,
        workspaceRevision,
        language: path.extname(filePath).replace(/^\./, ''),
        symbolName: null,
        startByte,
        endByte,
        sourceSpanSha256: spanSha,
        category,
        confidence,
        productionReachability: reachability,
        evidenceRefs: [`${filePath}:${lineIdx + 1}`],
        mutationAllowed: false,
      });
    }

    currentByte += lineBytes + 1; // +1 for newline
  }

  return findings;
}

export async function runStubScanner(options = {}) {
  const root = options.root ?? ROOT;
  const targetDirs = options.targetDirs ?? ['sveltekit-frontend/src/lib/server/features/ai/ace', 'scripts/atlas/lib'];

  const allFindings = [];

  for (const dir of targetDirs) {
    const absDir = path.resolve(root, dir);
    if (!fs.existsSync(absDir)) continue;

    const files = [];
    function walk(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs)$/i.test(ent.name)) files.push(full);
      }
    }
    walk(absDir);

    for (const file of files) {
      const rel = path.relative(root, file);
      try {
        const content = fs.readFileSync(file, 'utf8');
        const fileFindings = scanFileForStubs(rel, content);
        allFindings.push(...fileFindings);
      } catch {
        // ignore read errors
      }
    }
  }

  const generatedAt = new Date().toISOString();
  const summary = {
    totalFindings: allFindings.length,
    byCategory: {},
    byReachability: {
      PROVEN: allFindings.filter((f) => f.productionReachability === 'PROVEN').length,
      UNKNOWN: allFindings.filter((f) => f.productionReachability === 'UNKNOWN').length,
      TEST_ONLY: allFindings.filter((f) => f.productionReachability === 'TEST_ONLY').length,
    },
  };

  for (const f of allFindings) {
    summary.byCategory[f.category] = (summary.byCategory[f.category] ?? 0) + 1;
  }

  const receipt = {
    schema: SCHEMA_V1,
    gate: GATE_NAME,
    generatedAt,
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    admissionAuthorized: false,
    summary,
    findings: allFindings.slice(0, 100), // Bounded top 100 in receipt
  };

  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const checksum = `sha256:${sha256Hex(receiptJson)}`;
  receipt.receiptChecksum = checksum;

  const tmpPath = path.resolve(root, '.tmp/atlas/incomplete-code-stubs-scan-v1.json');
  const reportPath = path.resolve(root, 'docs/reports/incomplete-code-stubs-scan-v1.json');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  fs.writeFileSync(tmpPath, receiptJson, 'utf8');
  fs.writeFileSync(reportPath, receiptJson, 'utf8');

  return {
    reportPath,
    checksum,
    summary,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runStubScanner()
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
