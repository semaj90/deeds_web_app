#!/usr/bin/env node
/**
 * build-kag-fixture-and-materialize.mjs
 *
 * One-shot proof for KAG-04 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration):
 * runs build-kag-fixture.mts (builds one real HyperedgeV1 via the actual
 * createHyperedgeV1 factory + one real OntologyLinkedTupleV1) then invokes
 * the existing scripts/atlas/materialize-kag-contracts-v1.mts with --apply
 * against the live atlas_hyperedges/atlas_hyperedge_members/
 * atlas_ontology_linked_tuples tables. Bounded (2 records), test-tagged
 * IDs, safe to re-run (materializer upserts on conflict).
 *
 * Uses `node <tsx-cli.mjs>` directly rather than `npx tsx` (Windows-safe —
 * see NE-35D, openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md).
 *
 * Usage: node scripts/atlas/build-kag-fixture-and-materialize.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const frontendTsxCli = path.join(FRONTEND, 'node_modules/tsx/dist/cli.mjs');
const rootTsxCli = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs');
const tsxCli = existsSync(frontendTsxCli) ? frontendTsxCli : rootTsxCli;

const run = (script, args) =>
  console.log(execFileSync(process.execPath, [tsxCli, script, ...args], { cwd: ROOT, encoding: 'utf8' }));

run(path.join(ROOT, 'scripts/atlas/build-kag-fixture.mts'), []);
run(path.join(ROOT, 'scripts/atlas/materialize-kag-contracts-v1.mts'), [
  `--input=${path.join(ROOT, '.tmp/atlas/kag04-live-proof-fixture.jsonl')}`,
  '--apply',
]);
