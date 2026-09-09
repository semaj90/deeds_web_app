#!/usr/bin/env node

/**
 * Read-only ownership audit for the two addressable-packet materializer copies.
 *
 * This reports entrypoint ownership and static mutation scope. It does not
 * import or execute either materializer and does not connect to a datastore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..', '..');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'addressable-packet-materializer-ownership-v1.json');

function readText(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function packageCommands(relativePath, packageNames) {
  const raw = readText(relativePath);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const scripts = parsed.scripts ?? {};
  return Object.entries(scripts)
    .filter(([name, command]) => /addressable|graphify:materialize/.test(name) || /materialize-addressable-packets/.test(String(command)))
    .map(([name, command]) => ({ package: packageNames, name, command }));
}

function inspectMaterializer(relativePath) {
  const source = readText(relativePath);
  if (source === null) {
    return { path: relativePath, exists: false };
  }

  const hasApplyFlag = /--apply|process\.argv\.includes\(['"]--apply['"]\)/.test(source);
  const hasDryRunBranch = /APPLY_REQUESTED|\bAPPLY\b|dry-run/i.test(source);
  const readsDatabase = /SELECT\s+|information_schema|\.query\(/i.test(source);
  const writesDatabase = /INSERT\s+INTO|UPDATE\s+[^\n]+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i.test(source);
  const writesFiles = /writeFile|writeNdjson|writeManifest|writeOutputsAtomically/.test(source);
  const hasTransactionMarkers = /BEGIN|COMMIT|ROLLBACK/.test(source);

  return {
    path: relativePath,
    exists: true,
    sourceChecksum: sha256(source),
    hasApplyFlag,
    hasDryRunBranch,
    readsDatabase,
    writesDatabase,
    writesFiles,
    hasTransactionMarkers,
    staticScope: writesDatabase ? 'DATABASE_OR_FILE_WRITER' : writesFiles ? 'FILE_ARTIFACT_WRITER' : 'READ_ONLY_OR_UNKNOWN',
  };
}

const rootMaterializer = inspectMaterializer('scripts/atlas/materialize-addressable-packets.mjs');
const localMaterializer = inspectMaterializer('sveltekit-frontend/scripts/atlas/materialize-addressable-packets.mjs');
const rootCommands = packageCommands('package.json', 'root');
const svelteCommands = packageCommands('sveltekit-frontend/package.json', 'sveltekit-frontend');

const rootEntrypoints = [...rootCommands, ...svelteCommands].filter(({ command }) => /\.\.\/scripts\/atlas\/materialize-addressable-packets\.mjs|scripts\/atlas\/materialize-addressable-packets\.mjs/.test(command));
const localEntrypoints = [...rootCommands, ...svelteCommands].filter(({ command }) => /sveltekit-frontend\/scripts\/atlas\/materialize-addressable-packets\.mjs/.test(command));

const report = {
  schema: 'atlas.addressable-packet-materializer-ownership.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  status: rootEntrypoints.length > 0 && localEntrypoints.length === 0
    ? 'ROOT_MATERIALIZER_ENTRYPOINT_PROVEN_LOCAL_COPY_NOT_ENTRYPOINT'
    : 'MATERIALIZER_OWNERSHIP_REQUIRES_REVIEW',
  canonicalArtifactOwner: 'scripts/atlas/materialize-addressable-packets.mjs',
  candidates: [rootMaterializer, localMaterializer],
  packageEntrypoints: [...rootCommands, ...svelteCommands],
  resolvedEntrypoints: {
    rootMaterializer: rootEntrypoints,
    sveltekitLocalMaterializer: localEntrypoints,
  },
  interpretation: {
    root: 'The root materializer is the package-referenced addressable packet artifact writer; its --apply path publishes NDJSON/manifest outputs and is not a registry SQL writer.',
    sveltekitLocal: 'The SvelteKit-local copy is not referenced by the discovered package commands; retain as an audit candidate until a separate archive decision is made.',
    registryBoundary: 'Neither addressable materializer is admitted as the canonical atlas_packet_registry writer by this audit.',
  },
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  rootEntrypoints: rootEntrypoints.length,
  localEntrypoints: localEntrypoints.length,
  writesPerformed: false,
  reportPath: path.relative(repoRoot, reportPath).replaceAll('\\', '/'),
}, null, 2));
