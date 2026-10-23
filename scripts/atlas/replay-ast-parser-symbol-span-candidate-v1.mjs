#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAstParserSymbolSpanCandidateSourceV1,
  verifyAstParserSymbolSpanCandidateV1,
} from './lib/ast-parser-symbol-span-candidate-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(root, 'scripts/atlas/fixtures/ast-parser-symbol-span-match-candidate-v1.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const sourceBytes = loadAstParserSymbolSpanCandidateSourceV1(fixture, root);
const source = sourceBytes.toString('utf8');
const sidecarUrl = process.argv.find(value => value.startsWith('--sidecar-url='))?.slice('--sidecar-url='.length)
  ?? process.env.ATLAS_NLP_SIDECAR_URL
  ?? 'http://127.0.0.1:8095';

const healthResponse = await fetch(new URL('/health', sidecarUrl), { signal: AbortSignal.timeout(5000) });
if (!healthResponse.ok) throw new Error(`SIDECAR_HEALTH_HTTP_${healthResponse.status}`);
const health = await healthResponse.json();
if (health.status !== 'ok') throw new Error('SIDECAR_NOT_READY');

const parserResponse = await fetch(new URL('/ast/chunk', sidecarUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    source,
    language: 'typescript',
    filePath: fixture.source.sourceRef,
    sourceRef: fixture.source.sourceRef,
    sourceRevision: fixture.source.sourceRevision,
  }),
  signal: AbortSignal.timeout(15000),
});
const parsed = await parserResponse.json();
if (!parserResponse.ok) throw new Error(`AST_CHUNK_HTTP_${parserResponse.status}:${parsed.detail ?? 'NO_DETAIL'}`);

const verification = verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, parsed);
console.log(JSON.stringify({
  ...verification,
  parserHttpStatus: parserResponse.status,
  scanCompleteness: parsed.scan_completeness,
  syntaxStatus: parsed.syntax_status,
  chunkCount: parsed.chunks.length,
  sidecarContract: health.contract ?? null,
  sidecarRuntime: health.runtime ?? null,
  datastoreWritesPerformed: false,
}, null, 2));
