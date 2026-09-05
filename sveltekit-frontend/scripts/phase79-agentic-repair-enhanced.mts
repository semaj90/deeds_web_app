#!/usr/bin/env npx tsx
/**
 * Phase 79 Enhanced — compatibility shim.
 *
 * SUPERSEDED by scripts/phase79-agentic-repair.mts (Parent Atlas Agentic
 * Repair Loop v2). This file intentionally contains no model, embedding,
 * retrieval, cache, Qdrant, Redis/Valkey, Gemini, MiniLM, or mutation logic.
 *
 * Historical launchers still reference this path, so keep it as a thin
 * compatibility entrypoint rather than allowing the former duplicate runtime
 * ownership plane to remain executable.
 *
 * All arguments are forwarded unchanged. Therefore:
 * - no --apply => canonical Phase 79 remains dry-run by default
 * - --apply still requires ATLAS_AUTHORIZE_PHASE79_REPAIR=1
 * - high-risk apply still requires the canonical additional authorization
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const canonicalScript = path.join(__dirname, 'phase79-agentic-repair.mts');
const forwardedArgs = process.argv.slice(2);

console.warn(
  '[phase79-enhanced] LEGACY_SUPERSEDED_CANDIDATE: delegating to canonical ' +
    'scripts/phase79-agentic-repair.mts; no legacy Enhanced runtime is executed.'
);

const child = spawn(process.execPath, ['--import', 'tsx', canonicalScript, ...forwardedArgs], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.error('[phase79-enhanced] failed to launch canonical Phase 79:', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[phase79-enhanced] canonical Phase 79 terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
