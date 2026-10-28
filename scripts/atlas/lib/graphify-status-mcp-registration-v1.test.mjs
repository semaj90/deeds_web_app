import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = fs.readFileSync(path.join(repoRoot, 'sveltekit-frontend/src/mcp/trace-mcp-server.ts'), 'utf8');
const registration = source.slice(source.indexOf("'graphify.status'"), source.indexOf("'atlas.workstation_status'"));

test('TRACE registers graphify.status as a no-argument receipt reader, not an executor', () => {
  assert.ok(registration.includes('inputSchema: z.object({})'));
  assert.ok(registration.includes('readGraphifyStatus({ repoRoot: ATLAS_REPOSITORY_ROOT })'));
  assert.ok(registration.includes('runsGraphify: false'));
  assert.ok(registration.includes('writesPerformed: false'));
  assert.doesNotMatch(registration, /exec(File|Sync)|spawn\(|graphify:daily|--apply/);
  assert.ok(source.includes("import { readGraphifyStatus } from '../../../scripts/atlas/lib/graphify-status-v1.mjs'"));
  assert.ok(registration.includes('serializeBoundedReadResult(status)'));
  assert.ok(registration.includes('pending other gates'));
});
