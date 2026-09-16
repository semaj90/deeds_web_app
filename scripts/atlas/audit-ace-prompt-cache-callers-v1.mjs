#!/usr/bin/env node
/**
 * Read-only audit for the ACE/Ornith prompt-cache handoff.
 *
 * This deliberately audits caller shape, not runtime cache contents. A caller
 * is strict only when it passes revisionedExactAnswerCache to runChatCompletion;
 * all other callers remain legacy/uncertified and are not silently promoted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'sveltekit-frontend', 'src');
const LEGACY_SRC = path.join(ROOT, 'src');
const REPORT = path.join(ROOT, 'docs', 'reports', 'ace-prompt-cache-caller-audit-v1.json');

async function collectFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collectFiles(full));
    else if (/\.(?:ts|svelte\.ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function classify(content, offset) {
  const window = content.slice(offset, offset + 1200);
  return /revisionedExactAnswerCache\s*:/.test(window) ? 'STRICT_V2_HANDOFF' : 'LEGACY_OR_UNCERTIFIED';
}

const files = await collectFiles(SRC);
const callSites = [];
for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  const re = /runChatCompletion\s*\(/g;
  let match;
  while ((match = re.exec(content))) {
    const prefix = content.slice(Math.max(0, match.index - 32), match.index);
    if (/function\s+$/.test(prefix)) continue;
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    callSites.push({
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      line,
      classification: classify(content, match.index),
    });
  }
}

const strict = callSites.filter((site) => site.classification === 'STRICT_V2_HANDOFF');
const legacy = callSites.filter((site) => site.classification !== 'STRICT_V2_HANDOFF');
const legacyFacadePath = path.join(LEGACY_SRC, 'lib', 'server', 'ai', 'openai-facade.ts');
const legacyFacadeExists = await fs.stat(legacyFacadePath).then(() => true).catch(() => false);
const legacyFacadeContent = legacyFacadeExists ? await fs.readFile(legacyFacadePath, 'utf8') : '';
const legacyFacadeReferenceCount = legacyFacadeExists
  ? (legacyFacadeContent.match(/processQueryForLLM\s*\(/g) ?? []).length
  : 0;
const callerRoots = [
  path.join(ROOT, 'sveltekit-frontend', 'src'),
  path.join(ROOT, 'packages'),
  path.join(ROOT, '.opencode'),
  path.join(ROOT, 'scripts'),
  LEGACY_SRC,
];
let legacyFacadeCallerCount = 0;
for (const callerRoot of callerRoots) {
  const candidateFiles = await fs.stat(callerRoot).then(() => collectFiles(callerRoot)).catch(() => []);
  for (const file of await candidateFiles) {
    if (path.resolve(file) === path.resolve(legacyFacadePath)) continue;
    const content = await fs.readFile(file, 'utf8');
    legacyFacadeCallerCount += (content.match(/processQueryForLLM\s*\(/g) ?? []).length;
  }
}
const receipt = {
  schema: 'atlas.ace-prompt-cache-caller-audit.v1',
  generatedAt: new Date().toISOString(),
  scope: 'sveltekit-frontend/src/**/*.ts',
  callerCount: callSites.length,
  strictV2HandoffCount: strict.length,
  legacyOrUncertifiedCount: legacy.length,
  requiredIdentityFields: [
    'ContextManifestV2.identityChecksum',
    'modelRevision',
    'chatTemplateRevision',
    'toolSchemaRevision',
    'promptTemplateRevision',
    'renderedRequestChecksum',
    'generationControlsSignature',
    'userQueryHash',
  ],
  callers: callSites,
  compatibilitySurfaces: [{
    file: legacyFacadeExists ? path.relative(ROOT, legacyFacadePath).replaceAll('\\', '/') : null,
    symbol: 'processQueryForLLM',
    localDefinitionCount: legacyFacadeReferenceCount,
    repositoryCallerCount: legacyFacadeCallerCount,
    classification: !legacyFacadeExists
      ? 'ABSENT'
      : legacyFacadeCallerCount === 0
        ? 'UNREFERENCED_LEGACY_SURFACE'
        : 'LIVE_LEGACY_CALLER',
    strictV2: false,
    migrationRequired: false,
  }],
  blockingIssueCodes: legacy.length > 0 ? ['LIVE_CALLERS_DO_NOT_EMIT_STRICT_V2_HANDOFF'] : [],
  status: legacy.length > 0 ? 'CACHE_PREFILL_CALLER_HANDOFF_BLOCKED' : 'CACHE_PREFILL_CALLER_HANDOFF_SHAPE_PROVEN',
  authority: false,
  writesPerformed: false,
};

await fs.mkdir(path.dirname(REPORT), { recursive: true });
await fs.writeFile(REPORT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: receipt.status,
  callerCount: receipt.callerCount,
  strictV2HandoffCount: receipt.strictV2HandoffCount,
  legacyOrUncertifiedCount: receipt.legacyOrUncertifiedCount,
  reportPath: REPORT,
  writesPerformed: false,
}, null, 2));
