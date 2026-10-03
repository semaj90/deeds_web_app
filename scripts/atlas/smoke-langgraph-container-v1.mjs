#!/usr/bin/env node
/**
 * Read-only container import smoke for the LangGraph synthesis sidecar.
 *
 * It runs an ephemeral container without compose dependencies and with
 * checkpoint setup disabled. It does not contact backing stores or create a
 * checkpoint schema.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] ?? '.');
const reportPath = path.resolve(
  process.argv[3] ?? 'docs/reports/langgraph-serde-runtime-smoke-v1.json',
);
const python = [
  '-c',
  "from importlib.metadata import version; import langchain,langgraph; import langgraph.checkpoint; import langgraph.checkpoint.postgres; import app; print({'langchain':version('langchain'),'langgraph':version('langgraph'),'checkpoint':version('langgraph-checkpoint'),'checkpoint_postgres':version('langgraph-checkpoint-postgres'),'app_import':'ok','checkpoint_enabled':app.LANGGRAPH_CHECKPOINT_ENABLED,'schema':app.LANGGRAPH_CHECKPOINT_SCHEMA})",
];
const args = [
  'compose', 'run', '--rm', '--no-deps',
  '-e', 'LANGGRAPH_CHECKPOINT_ENABLED=false',
  '-e', 'LANGGRAPH_CHECKPOINT_SETUP=false',
  'langgraph-synthesis', 'python', ...python,
];
const result = spawnSync('docker', args, {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
const stdout = String(result.stdout ?? '').trim();
const stderr = String(result.stderr ?? '').trim();
const inputChecksum = `sha256:${crypto.createHash('sha256').update(args.join('\0')).digest('hex')}`;
const passed = result.status === 0 && /app_import['"]?: ['"]?ok/.test(stdout) &&
  /checkpoint_enabled['"]?: False/.test(stdout) && /langgraph_py/.test(stdout);
const report = {
  schema: 'atlas.langgraph-serde-runtime-smoke.v1',
  generatedAt: new Date().toISOString(),
  inputChecksum,
  command: 'docker compose run --rm --no-deps langgraph-synthesis python import-smoke',
  status: passed ? 'RUNTIME_IMPORT_PROVEN' : 'RUNTIME_IMPORT_FAILED',
  exitCode: result.status,
  stdout,
  stderr,
  dependencies: { contacted: false, checkpointSetup: false },
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, status: report.status, exitCode: result.status, writesPerformed: false }, null, 2));
process.exitCode = passed ? 0 : 1;
