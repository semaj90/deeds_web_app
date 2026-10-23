#!/usr/bin/env tsx
// NS-7 SOURCE-CLASS-SPLIT-V1 builder. Read-only over the frozen physical inventory.
// Writes scratch artifacts under .tmp/atlas/source-class-split-v1/<runId>/ and one stable report.
// Does not write any database, admit any source revision, or generate embeddings.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync, writeFileSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import {
  classifyRow,
  emptyClassTotals,
  normalizeExtension,
  reconcileBytes,
  SOURCE_CLASS_SPLIT_POLICY_REVISION,
  SOURCE_CLASSES,
  NOT_ADMITTED,
  type CensusEntry,
  type InventoryRow,
  type OwnershipContext,
  type SourceClass,
} from './lib/source-class-split-v1.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryPath = '.tmp/atlas/language-coverage/whole-repo-inclusive-20261022T204016Z/inventory.json';
const pathsPath = '.tmp/atlas/language-coverage/whole-repo-inclusive-20261022T204016Z/paths.jsonl';
const snapshotManifestPath = '.tmp/atlas/directory-intelligence/whole-repo-20261022t204016z/manifest.json';
const censusPath = '.tmp/atlas/directory-intelligence/embedding-coverage-20261022-v5/database-path-census.jsonl';
const EXPECTED_INVENTORY_SHA = '6154c72b0e280996ddff8b57dc8ea2d5c8ac0071558bd31566d3c9d952b2437d';
const EXPECTED_PATHS_SHA = '2d7c8415b60f040eb3037e1cd4a2b911e3d5b9c6b6419822721bd8b6605a94af';
const EXPECTED_ROWS = 1_367_300;
const STABLE_REPORT = 'docs/reports/source-class-split-v1.json';

const sha256File = (file: string) => {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
};

const sha256Stream = (file: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file)
    .on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolve(hash.digest('hex')))
    .on('error', reject);
});

async function* rowsOf(file: string): AsyncGenerator<{ ordinal: number; row: InventoryRow }> {
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let ordinal = 0;
  for await (const line of rl) {
    if (!line) continue;
    yield { ordinal: ordinal++, row: JSON.parse(line) as InventoryRow };
  }
}

function gitLines(cwd: string, args: string[], input?: Buffer): string[] {
  const out = execFileSync('git', args, { cwd, input, maxBuffer: 1024 ** 3, stdio: ['pipe', 'pipe', 'ignore'] });
  return out.toString('utf8').split('\0').filter(Boolean);
}

async function main() {
  const invSha = sha256File(path.join(root, inventoryPath));
  const pathsSha = await sha256Stream(path.join(root, pathsPath));
  // paths.jsonl is the row source and must match the recorded checksum exactly.
  if (pathsSha !== EXPECTED_PATHS_SHA) throw new Error(`PATHS_SHA_MISMATCH:${pathsSha}`);
  const snapshot = JSON.parse(readFileSync(path.join(root, snapshotManifestPath), 'utf8'));
  if (snapshot.pathManifestSha256 !== pathsSha || snapshot.rows !== EXPECTED_ROWS) throw new Error('SNAPSHOT_MANIFEST_BINDING_MISMATCH');
  // inventory.json's recorded checksum is not reproduced by any common serialization; keep it as a lineage exception.
  const inventoryChecksumReproduced = invSha === EXPECTED_INVENTORY_SHA;
  const inventoryJson = JSON.parse(readFileSync(path.join(root, inventoryPath), 'utf8'));
  const censusSha = await sha256Stream(path.join(root, censusPath));
  if (existsSync(path.join(root, STABLE_REPORT))) throw new Error('STABLE_REPORT_EXISTS_REFUSING_OVERWRITE');
  const head = gitHead();

  // Pass 1: nested repository roots, independent file totals, and per-owner untracked file lists.
  const nestedRepoRoots: string[] = [];
  const independent = { files: 0, bytes: 0, rows: 0, dirs: 0, links: 0 };
  const untrackedByOwner = new Map<string, string[]>();
  const nestedSeen: InventoryRow[] = [];
  for await (const { row } of rowsOf(path.join(root, pathsPath))) {
    independent.rows++;
    if (row.entryKind === 'FILE') { independent.files++; independent.bytes += row.sizeBytes ?? 0; }
    else if (row.entryKind === 'DIRECTORY') independent.dirs++;
    else independent.links++;
    if (/(^|\/)\.git$/.test(row.relativePath) && row.relativePath !== '.git') nestedSeen.push(row);
  }
  for (const row of nestedSeen) nestedRepoRoots.push(path.posix.dirname(row.relativePath));
  nestedRepoRoots.sort();
  if (independent.rows !== EXPECTED_ROWS) throw new Error(`ROW_COUNT_MISMATCH:${independent.rows}`);
  const ws = inventoryJson.workspace;
  const inventoryCountsReconcile = ws.enumeratedPathCount === independent.rows
    && ws.fileCount === independent.files && ws.directoryCountIncludingRoot === independent.dirs
    && ws.linkOnlyEntryCount === independent.links;
  const lineageExceptions: string[] = [];
  if (!inventoryChecksumReproduced) lineageExceptions.push('INVENTORY_JSON_CHECKSUM_NOT_REPRODUCED');
  if (!inventoryCountsReconcile) lineageExceptions.push('INVENTORY_JSON_COUNTS_DO_NOT_MATCH_PATH_STREAM');

  const owners = ['ROOT', ...nestedRepoRoots];
  const trackedByOwner = new Map<string, Set<string>>();
  const ownerGit: Record<string, { trackedCount: number; gitStatus: 'OK' | 'UNREADABLE' }> = {};
  for (const owner of owners) {
    const cwd = owner === 'ROOT' ? root : path.join(root, owner);
    try {
      const tracked = new Set(gitLines(cwd, ['ls-files', '-z']));
      trackedByOwner.set(owner, tracked);
      ownerGit[owner] = { trackedCount: tracked.size, gitStatus: 'OK' };
    } catch {
      trackedByOwner.set(owner, new Set());
      ownerGit[owner] = { trackedCount: 0, gitStatus: 'UNREADABLE' };
    }
    untrackedByOwner.set(owner, []);
  }
  const ownerOf = (p: string) => {
    let best = 'ROOT';
    for (const r of nestedRepoRoots) if ((p === r || p.startsWith(`${r}/`)) && r.length > best.length) best = r;
    return best;
  };
  for await (const { row } of rowsOf(path.join(root, pathsPath))) {
    if (row.entryKind !== 'FILE') continue;
    const owner = ownerOf(row.relativePath);
    const rel = owner === 'ROOT' ? row.relativePath : row.relativePath.slice(owner.length + 1);
    if (!trackedByOwner.get(owner)?.has(rel)) untrackedByOwner.get(owner)!.push(rel);
  }

  // Gitignore status is evaluated per owner and only for untracked files.
  const ignoredByOwner = new Map<string, Set<string>>();
  for (const owner of owners) {
    const cwd = owner === 'ROOT' ? root : path.join(root, owner);
    const list = untrackedByOwner.get(owner)!;
    const input = Buffer.from(list.join('\0') + (list.length ? '\0' : ''), 'utf8');
    let ignored: string[] = [];
    if (list.length) {
      try { ignored = gitLines(cwd, ['check-ignore', '--stdin', '-z'], input); } catch { ignored = []; }
    }
    ignoredByOwner.set(owner, new Set(ignored));
  }

  const census = new Map<string, CensusEntry>();
  for (const line of readFileSync(path.join(root, censusPath), 'utf8').split('\n')) {
    if (!line) continue;
    const entry = JSON.parse(line);
    census.set(entry.relativePath, {
      embedding768ChunkCount: entry.embedding768ChunkCount ?? 0,
      contentEmbeddingChunkCount: entry.contentEmbeddingChunkCount ?? 0,
    });
  }

  const ctx: OwnershipContext = {
    nestedRepoRoots,
    trackedByOwner,
    ignoredByOwner,
    censusByPath: census,
  };

  const runId = `source-class-split-v1-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')}`;
  const outDir = path.join(root, '.tmp/atlas/source-class-split-v1', runId);
  mkdirSync(outDir, { recursive: true });
  const rowsFile = path.join(outDir, 'classified-rows.jsonl');
  const rowsFd = openSync(rowsFile, 'wx');
  const rowsHash = createHash('sha256');
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    const data = Buffer.from(buffer, 'utf8');
    writeSync(rowsFd, data);
    rowsHash.update(data);
    buffer = '';
  };

  const totals = emptyClassTotals();
  const byExtension = new Map<string, Record<string, number>>();
  const byOwner = new Map<string, Record<string, number>>();
  const byEligibility = new Map<string, { rows: number; bytes: number }>();
  const unknownExt = new Map<string, number>();
  const unknownSamples: string[] = [];
  const conflictPairs = new Map<string, number>();
  const inventoryDisagreements = new Map<string, number>();
  const embeddingByClass = new Map<string, Record<string, number>>();
  const candidates: string[] = [];
  let conflictRows = 0;
  let trackedRows = 0;
  let ignoredRows = 0;

  const bump = (map: Map<string, Record<string, number>>, key: string, field: string, by = 1) => {
    const entry = map.get(key) ?? {};
    entry[field] = (entry[field] ?? 0) + by;
    map.set(key, entry);
  };

  let written = 0;
  for await (const { ordinal, row } of rowsOf(path.join(root, pathsPath))) {
    const result = classifyRow(row, ctx);
    const fileBytes = row.entryKind === 'FILE' ? row.sizeBytes ?? 0 : 0;
    const cls: SourceClass | null = result.sourceClass;
    if (cls && row.entryKind === 'FILE') {
      totals[cls].files += 1;
      totals[cls].bytes += fileBytes;
    }
    const ext = normalizeExtension(row.extension) || '<none>';
    if (row.entryKind === 'FILE') {
      bump(byExtension, ext, 'files');
      bump(byExtension, ext, 'bytes', fileBytes);
      bump(byExtension, ext, cls ?? 'NONE');
      bump(byOwner, result.owner, 'files');
      bump(byOwner, result.owner, 'bytes', fileBytes);
      bump(byOwner, result.owner, cls ?? 'NONE');
      const pol = byEligibility.get(result.embeddingPolicy) ?? { rows: 0, bytes: 0 };
      pol.rows += 1; pol.bytes += fileBytes;
      byEligibility.set(result.embeddingPolicy, pol);
      bump(embeddingByClass, cls ?? 'NONE', result.embedding768Status);
      if (cls === 'UNKNOWN') {
        unknownExt.set(ext, (unknownExt.get(ext) ?? 0) + 1);
        if (unknownSamples.length < 200) unknownSamples.push(row.relativePath);
      }
      if (result.conflictRules.length) {
        conflictRows++;
        for (const rule of result.conflictRules) conflictPairs.set(rule, (conflictPairs.get(rule) ?? 0) + 1);
      }
      // Existing classifier says CANONICAL_SOURCE for everything it does not exclude; anything else it said is a disagreement to report.
      const agreesWithExisting = result.inventoryClassification === 'CANONICAL_SOURCE'
        && (cls === 'FIRST_PARTY_SOURCE' || cls === 'OPENSPEC_REQUIREMENTS');
      if (!agreesWithExisting) {
        const invKey = `${result.inventoryClassification}->${cls}`;
        inventoryDisagreements.set(invKey, (inventoryDisagreements.get(invKey) ?? 0) + 1);
      }
      if (result.gitTracked) trackedRows++;
      if (result.gitIgnored) ignoredRows++;
      if (result.embeddingPolicy === 'PRIORITY_CANDIDATE_REVISION_PENDING' || result.embeddingPolicy === 'SECONDARY_CANDIDATE_UNTRACKED_REVISION_PENDING') {
        candidates.push(JSON.stringify({ o: ordinal, p: row.relativePath, c: cls, e: result.embeddingPolicy, w: result.owner, b: fileBytes, m: result.embedding768Status }));
      }
    }
    buffer += JSON.stringify({
      o: ordinal, p: row.relativePath, k: row.entryKind === 'SYMLINK_OR_JUNCTION' ? 'L' : row.entryKind === 'DIRECTORY' ? 'D' : 'F',
      c: cls, r: result.classRule, mr: result.matchedRules, cf: result.conflictRules, e: result.embeddingPolicy,
      w: result.owner, t: result.gitTracked ? 1 : 0, g: result.gitIgnored ? 1 : 0, b: fileBytes, x: ext,
      v: result.inventoryClassification, m: result.embedding768Status,
    }) + '\n';
    written++;
    if (buffer.length > 4 * 1024 * 1024) flush();
  }
  flush();
  closeSync(rowsFd);
  const rowsSha = rowsHash.digest('hex');
  if (written !== EXPECTED_ROWS) throw new Error(`WRITTEN_ROW_COUNT_MISMATCH:${written}`);

  const reconciliation = reconcileBytes(totals, independent.bytes, independent.files);
  const extensionTable = Object.fromEntries([...byExtension.entries()].sort((a, b) => (b[1].files ?? 0) - (a[1].files ?? 0)));
  const aggregates = {
    schema: 'atlas.source-class-split.aggregates.v1',
    policyRevision: SOURCE_CLASS_SPLIT_POLICY_REVISION,
    rows: written,
    classCounts: Object.fromEntries(SOURCE_CLASSES.map((c) => [c, totals[c]])),
    entryKinds: { files: independent.files, directories: independent.dirs, symlinksOrJunctions: independent.links },
    byEligibility: Object.fromEntries([...byEligibility.entries()].sort((a, b) => b[1].rows - a[1].rows)),
    byExtension: extensionTable,
    byRepository: Object.fromEntries([...byOwner.entries()].sort((a, b) => (b[1].files ?? 0) - (a[1].files ?? 0))),
    unknown: {
      count: totals.UNKNOWN.files,
      bytes: totals.UNKNOWN.bytes,
      byExtension: Object.fromEntries([...unknownExt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100)),
      sampleRelativePaths: unknownSamples,
    },
    ambiguity: {
      rowsWithConflictingRules: conflictRows,
      conflictRulePairs: Object.fromEntries([...conflictPairs.entries()].sort((a, b) => b[1] - a[1])),
      existingClassifierDisagreements: Object.fromEntries([...inventoryDisagreements.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100)),
    },
    gitScope: { trackedFileRows: trackedRows, gitignoredUntrackedFileRows: ignoredRows, ownerGit },
    embeddingStatusByClass: Object.fromEntries(embeddingByClass),
    reconciliation,
  };
  const aggregatesFile = path.join(outDir, 'aggregates.json');
  writeFileSync(aggregatesFile, JSON.stringify(aggregates, null, 2) + '\n', { flag: 'wx' });
  const candidatesFile = path.join(outDir, 'phase-b-candidates.jsonl');
  writeFileSync(candidatesFile, candidates.join('\n') + '\n', { flag: 'wx' });

  const handoff = {
    schema: 'atlas.embedding-coverage-phase-b-handoff.v1',
    status: 'HANDOFF_ONLY_NO_EMBEDDINGS_GENERATED',
    canonicalAuthority: false,
    sourceAdmission: NOT_ADMITTED,
    inputs: {
      classifiedRowsSha256: rowsSha,
      candidatesSha256: sha256File(candidatesFile),
      candidateCount: candidates.length,
      priorityCandidateCount: aggregates.byEligibility.PRIORITY_CANDIDATE_REVISION_PENDING?.rows ?? 0,
    },
    gate: 'Phase B contextual tensors need admitted source revisions for every input; none exist (workspaceRevision null, sourceQualified false).',
    existingEmbeddingEvidence: { path: censusPath, sha256: censusSha, exactProvenEmbedding768Chunks: 0 },
  };
  const handoffFile = path.join(outDir, 'handoff-phase-b.json');
  writeFileSync(handoffFile, JSON.stringify(handoff, null, 2) + '\n', { flag: 'wx' });

  const stable = {
    schema: 'atlas.source-class-split.report.v1',
    policyRevision: SOURCE_CLASS_SPLIT_POLICY_REVISION,
    classificationOnly: true,
    sourceAdmission: NOT_ADMITTED,
    lineageExceptions,
    classCounts: aggregates.classCounts,
    entryKinds: aggregates.entryKinds,
    byEligibility: aggregates.byEligibility,
    unknownCount: totals.UNKNOWN.files,
    reconciliation,
    artifacts: {
      runDirectory: path.posix.join('.tmp/atlas/source-class-split-v1', runId),
      classifiedRowsSha256: rowsSha,
      aggregatesSha256: sha256File(aggregatesFile),
      candidatesSha256: handoff.inputs.candidatesSha256,
      handoffSha256: sha256File(handoffFile),
    },
  };
  const verdictOk = reconciliation.bytesReconcile && reconciliation.filesReconcile && written === EXPECTED_ROWS;
  const receipt = {
    schema: 'atlas.source-class-split.receipt.v1',
    policyRevision: SOURCE_CLASS_SPLIT_POLICY_REVISION,
    runId,
    sourceClassSplitVerdict: !verdictOk ? 'FAIL_RECONCILIATION'
      : lineageExceptions.length ? 'PASS_CLASSIFICATION_ONLY_WITH_LINEAGE_EXCEPTIONS' : 'PASS_CLASSIFICATION_ONLY',
    lineageExceptions,
    canonicalAuthority: false,
    writesPerformed: false,
    databaseWrites: 0,
    embeddingsGenerated: 0,
    sourceAdmission: NOT_ADMITTED,
    inputs: {
      inventoryPath, inventorySha256: invSha, inventorySha256Recorded: EXPECTED_INVENTORY_SHA, inventoryChecksumReproduced,
      inventoryCountsReconcile,
      pathsPath, pathsSha256: pathsSha,
      snapshotManifestPath, snapshotManifestSha256: sha256File(path.join(root, snapshotManifestPath)),
      censusPath, censusSha256: censusSha,
      existingClassifier: 'scripts/atlas/lib/canonical-source-inventory-hygiene-v1.mts#classifyInventoryPath',
      classifierLib: 'scripts/atlas/lib/source-class-split-v1.mts',
      gitHead: head,
      nestedRepoRoots,
    },
    outputs: {
      classifiedRows: { path: path.posix.join('.tmp/atlas/source-class-split-v1', runId, 'classified-rows.jsonl'), sha256: rowsSha, rows: written },
      aggregates: { path: path.posix.join('.tmp/atlas/source-class-split-v1', runId, 'aggregates.json'), sha256: sha256File(aggregatesFile) },
      phaseBCandidates: { path: path.posix.join('.tmp/atlas/source-class-split-v1', runId, 'phase-b-candidates.jsonl'), sha256: handoff.inputs.candidatesSha256 },
      handoff: { path: path.posix.join('.tmp/atlas/source-class-split-v1', runId, 'handoff-phase-b.json'), sha256: sha256File(handoffFile) },
      stableReport: STABLE_REPORT,
    },
    reconciliation,
    snapshotStability: {
      frozenInventoryVerified: true,
      gitHeadAtStart: head,
      gitHeadAtEnd: gitHead(),
      worktreeByteDriftMeasured: false,
      note: 'Classification reads path metadata and git index state only; file bytes were not read or hashed.',
    },
    createdAt: new Date().toISOString(),
  };
  const receiptFile = path.join(outDir, 'receipt.json');
  writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(path.join(root, STABLE_REPORT), JSON.stringify({ ...stable, receiptPath: path.posix.join('.tmp/atlas/source-class-split-v1', runId, 'receipt.json') }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ runId, verdict: receipt.sourceClassSplitVerdict, classCounts: stable.classCounts, reconciliation, unknownCount: stable.unknownCount }, null, 2));
}

function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
