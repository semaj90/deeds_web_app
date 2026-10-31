#!/usr/bin/env node
/**
 * G7-REGISTRATION-01 Phase B — Six-Repository Authority Registration Manifest Builder.
 *
 * Reads submodule git facts and the live root identity (read-only), builds the 6
 * NestedRepositoryCandidateV1 records, and writes the authoritative candidate manifest
 * under .tmp/atlas/g7-six-repository-registration-manifest-v1.json.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestMod = await import(pathToFileURL(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/identity/nested-repository-registration-manifest-v1.ts')).href);
const { buildNestedRepositoryCandidateV1 } = manifestMod;

const ROOT_IDENTITY = {
  repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
  sourceAuthorityRepoId: 'deeds-web-app',
};

const SUBMODULE_PATHS = [
  'claude-mem',
  'granite-docling-258M',
  'mcp-server-mcp',
  'models/embeddinggemma_300m',
  'sites/parent-atlas-gateboard',
  'turbovec',
];

function runGit(args, cwd = root) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch (err) {
    return null;
  }
}

// 1. Gitlinks from index
const lsFiles = runGit(['ls-files', '-s', ...SUBMODULE_PATHS]);
const gitlinks = {};
for (const line of (lsFiles || '').split('\n').filter(Boolean)) {
  const parts = line.split(/\s+/);
  if (parts.length >= 4 && parts[0] === '160000') {
    gitlinks[parts[3]] = parts[1];
  }
}

// 2. Build candidate facts
const candidates = [];
for (const subPath of SUBMODULE_PATHS) {
  const gitmodulesUrl = runGit(['config', '-f', '.gitmodules', '--get', `submodule.${subPath}.url`]);
  const pinnedGitlink = gitlinks[subPath] ?? '';
  const subWorktreeDir = path.join(root, subPath);
  const worktreePresent = fs.existsSync(subWorktreeDir) && fs.existsSync(path.join(subWorktreeDir, '.git'));
  
  let worktreeHead = null;
  let worktreeOriginUrl = null;
  let dirtyEntryCount = 0;

  if (worktreePresent) {
    worktreeHead = runGit(['rev-parse', 'HEAD'], subWorktreeDir);
    worktreeOriginUrl = runGit(['remote', 'get-url', 'origin'], subWorktreeDir);
    const status = runGit(['status', '--porcelain'], subWorktreeDir);
    dirtyEntryCount = status ? status.split('\n').filter(Boolean).length : 0;
  }

  const candidate = buildNestedRepositoryCandidateV1({
    facts: {
      gitmodulePath: subPath,
      gitmodulesUrl: gitmodulesUrl || '',
      pinnedGitlink,
      worktreePresent,
      worktreeHead,
      worktreeOriginUrl,
      dirtyEntryCount,
    },
    root: ROOT_IDENTITY,
    existingRows: [],
  });

  candidates.push(candidate);
}

const manifest = {
  schema: 'atlas.g7-six-repository-registration-manifest.v1',
  generatedAt: new Date().toISOString(),
  target: 'deeds-web-app',
  rootIdentity: ROOT_IDENTITY,
  missingOperatorDecisions: [
    {
      decisionId: 'SOURCE_AUTHORITY_KEY_NAMING_CONVENTION',
      description: 'Select canonical sourceAuthorityRepoId naming format for nested submodules (e.g. bare submodule path vs submodule:<path> vs upstream vendor slug).',
      options: ['bare-path (e.g. turbovec)', 'prefixed-path (e.g. submodule:turbovec)', 'canonical-slug (e.g. github:RyanCodrai/turbovec)'],
      defaultProposed: 'bare-path (matches existing proposedSourceAuthorityRepoId proposals)',
    },
    {
      decisionId: 'ADMISSION_SCOPE_POLICY',
      description: 'Determine whether nested repositories are registered for Graphify scope/provenance resolution only or also admitted to canonical packet/stable-file tables.',
      options: ['GRAPHIFY_PROVENANCE_ONLY', 'FULL_CANONICAL_ADMISSION'],
      note: 'atlas_packet_identity_registry_v1 currently enforces CHECK (membership_repository_scope = repo:root). Full admission requires relaxing this check via schema migration.',
    },
    {
      decisionId: 'DIRTY_SUBMODULE_POLICY',
      description: '4 of 6 submodules have dirty worktree entries (claude-mem: 11, granite-docling-258M: 1, models/embeddinggemma_300m: 1, turbovec: 6). Determine if registration requires clean submodule worktrees or allows dirty.',
      options: ['ALLOW_DIRTY_WITH_AUDIT_LOG', 'REQUIRE_CLEAN_WORKTREE'],
      defaultProposed: 'ALLOW_DIRTY_WITH_AUDIT_LOG (registration binds to pinned commit OID, not dirty working tree)',
    },
  ],
  candidates,
};

const outPath = path.join(root, '.tmp/atlas/g7-six-repository-registration-manifest-v1.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated manifest at: ${path.relative(root, outPath)} (${candidates.length} candidates)`);
