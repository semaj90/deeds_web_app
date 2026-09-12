import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'docker-storage-retention-v1.json');
const gib = (bytes) => Math.round((bytes / 1024 ** 3) * 100) / 100;

function command(command, args) {
  try {
    return { available: true, output: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 64 * 1024 * 1024 }).trim() };
  } catch (error) {
    return { available: false, error: error?.message ?? String(error) };
  }
}

function parseContainerRows(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, image, size, status] = line.split('\t');
    return { name, image, size, status };
  });
}

function parseSize(text) {
  const match = String(text ?? '').match(/^(\d+(?:\.\d+)?)(kB|MB|GB|TB)/i);
  if (!match) return null;
  const factor = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }[match[2].toLowerCase()];
  return Number(match[1]) * factor;
}

function diffCounts(containerName) {
  const result = command('docker', ['diff', containerName]);
  if (!result.available) return { available: false, additions: null, changes: null, deletions: null, error: result.error };
  const counts = { A: 0, C: 0, D: 0 };
  for (const line of result.output.split(/\r?\n/)) {
    const kind = line.slice(0, 1);
    if (kind in counts) counts[kind] += 1;
  }
  return { available: true, additions: counts.A, changes: counts.C, deletions: counts.D };
}

function fileSize(filePath) {
  try { return fs.statSync(filePath).size; } catch { return null; }
}

function directorySize(dirPath, maxEntries = 200000) {
  let total = 0;
  let entriesSeen = 0;
  const stack = [dirPath];
  while (stack.length && entriesSeen < maxEntries) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (++entriesSeen > maxEntries) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        try { total += fs.statSync(full).size; } catch { /* transient file */ }
      }
    }
  }
  return { bytes: total, complete: entriesSeen < maxEntries, entriesSeen };
}

function listFiles(dirPath, pattern) {
  const result = [];
  const stack = [dirPath];
  while (stack.length && result.length < 10000) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (pattern.test(entry.name)) {
        const size = fileSize(full);
        if (size !== null) result.push({ path: path.relative(root, full).replaceAll('\\', '/'), bytes: size, gib: gib(size) });
      }
    }
  }
  return result.sort((a, b) => b.bytes - a.bytes);
}

function immediateDirectorySizes(dirPath) {
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => {
    const relativePath = path.relative(root, path.join(dirPath, entry.name)).replaceAll('\\', '/');
    const result = directorySize(path.join(dirPath, entry.name));
    return { path: relativePath, bytes: result.bytes, gib: gib(result.bytes), complete: result.complete };
  }).sort((a, b) => b.bytes - a.bytes);
}

const vhdxPath = 'C:/Users/james/AppData/Local/Docker/wsl/disk/docker_data.vhdx';
const knownDirs = ['.tmp', 'logs', 'backups', 'docs/reports'];
const localSizes = knownDirs.map((relativePath) => {
  const full = path.join(root, relativePath);
  const result = directorySize(full);
  return { path: relativePath, bytes: result.bytes, gib: gib(result.bytes), complete: result.complete, entriesSeen: result.entriesSeen };
});
const temporaryDirectorySizes = immediateDirectorySizes(path.join(root, '.tmp'));

const qdrantSnapshotFiles = [
  ...listFiles(path.join(root, 'backups'), /qdrant.*snapshot|\.snapshot$/i),
  ...listFiles(path.join(root, 'docs', 'reports'), /qdrant.*snapshot/i),
];
const qdrantSnapshotInventoryResult = command('docker', [
  'exec', 'legal-ai-qdrant', 'sh', '-c',
  "find /qdrant/snapshots -type f -printf '%T@\\t%s\\t%p\\n' 2>/dev/null",
]);
const qdrantSnapshotInventoryRows = qdrantSnapshotInventoryResult.available
  ? qdrantSnapshotInventoryResult.output.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^([0-9.]+)\t(\d+)\t(.+)$/);
    if (!match) return null;
    const timestamp = Number(match[1]);
    const bytes = Number(match[2]);
    const snapshotPath = match[3];
    return {
      path: snapshotPath,
      directory: snapshotPath.replace(/^\/qdrant\/snapshots\//, '').split('/')[0] || '.',
      bytes,
      gib: gib(bytes),
      modifiedAt: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null,
    };
  }).filter(Boolean)
  : [];
const qdrantSnapshotDirectories = Object.values(qdrantSnapshotInventoryRows.reduce((groups, row) => {
  const current = groups[row.directory] ?? {
    directory: row.directory,
    fileCount: 0,
    bytes: 0,
    gib: 0,
    oldestAt: null,
    newestAt: null,
  };
  current.fileCount += 1;
  current.bytes += row.bytes;
  current.gib = gib(current.bytes);
  if (row.modifiedAt && (!current.oldestAt || row.modifiedAt < current.oldestAt)) current.oldestAt = row.modifiedAt;
  if (row.modifiedAt && (!current.newestAt || row.modifiedAt > current.newestAt)) current.newestAt = row.modifiedAt;
  groups[row.directory] = current;
  return groups;
}, {})).sort((a, b) => b.bytes - a.bytes);
function classifyQdrantSnapshot(directory) {
  if (directory === 'codebase_chunks_768') return { role: 'ACTIVE_PROJECTION_CHECKPOINT', retention: 'KEEP' };
  if (directory === 'codebase_chunks_768_v2') return { role: 'COMPARISON_CHALLENGER_CHECKPOINT', retention: 'KEEP_FOR_REVIEW' };
  if (/^codebase_chunks_(384|384_hybrid)$/.test(directory)) return { role: 'LEGACY_SEMANTIC_CHECKPOINT', retention: 'REVIEW_BEFORE_CLEANUP' };
  if (/^codebase_chunks_512$|latent|topology|phase110/i.test(directory)) return { role: 'DERIVED_EXPERIMENT_CHECKPOINT', retention: 'REVIEW_BEFORE_CLEANUP' };
  if (/cache|memory|response/i.test(directory)) return { role: 'CACHE_CHECKPOINT', retention: 'REVIEW_BEFORE_CLEANUP' };
  return { role: 'HISTORICAL_OR_UNCLASSIFIED_CHECKPOINT', retention: 'REVIEW_BEFORE_CLEANUP' };
}
const qdrantSnapshotRetentionInventory = qdrantSnapshotDirectories.map((entry) => ({
  ...entry,
  ...classifyQdrantSnapshot(entry.directory),
  deletionAuthorized: false,
}));
const qdrantSnapshotInventorySummary = {
  available: qdrantSnapshotInventoryResult.available,
  error: qdrantSnapshotInventoryResult.available ? null : qdrantSnapshotInventoryResult.error,
  fileCount: qdrantSnapshotInventoryRows.length,
  directoryCount: qdrantSnapshotDirectories.length,
  totalBytes: qdrantSnapshotInventoryRows.reduce((total, row) => total + row.bytes, 0),
  totalGib: gib(qdrantSnapshotInventoryRows.reduce((total, row) => total + row.bytes, 0)),
};
const qdrantVolumePaths = [
  '/qdrant/snapshots',
  '/qdrant/storage/collections',
  '/qdrant/snapshots/codebase_chunks_768',
  '/qdrant/snapshots/codebase_chunks_768_v2',
];
const qdrantVolumeStatsResult = command('docker', [
  'exec', 'legal-ai-qdrant', 'sh', '-c',
  `du -sk ${qdrantVolumePaths.join(' ')} 2>/dev/null`,
]);
const qdrantVolumeStats = qdrantVolumeStatsResult.available
  ? Object.fromEntries(qdrantVolumeStatsResult.output.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\s+(.+)$/);
    const bytes = match ? Number(match[1]) * 1024 : null;
    return match ? [match[2], { allocatedBytes: bytes, allocatedGib: gib(bytes) }] : null;
  }).filter(Boolean))
  : { error: qdrantVolumeStatsResult.error };

const dockerInfo = command('docker', ['info', '--format', '{{json .}}']);
const dockerDisk = command('docker', ['system', 'df', '-v']);
const containerListing = command('docker', ['ps', '-as', '--format', '{{.Names}}\t{{.Image}}\t{{.Size}}\t{{.Status}}']);
const containers = containerListing.available
  ? parseContainerRows(containerListing.output).map((container) => ({ ...container, writableBytes: parseSize(container.size), writableDiff: diffCounts(container.name) }))
  : [];
const dockerfiles = listFiles(path.join(root, 'docker'), /^Dockerfile(?:\..*)?$/i).map(({ path: filePath }) => filePath);
const buildImageReferences = dockerfiles.flatMap((relativePath) => {
  let text;
  try { text = fs.readFileSync(path.join(root, relativePath), 'utf8'); } catch { return []; }
  return [...text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+).*$/gim)].map((match) => ({
    relativePath,
    image: match[1],
    imageWithoutDigest: match[1].split('@')[0],
  }));
});
const imageListing = command('docker', ['image', 'ls', '-a', '--no-trunc', '--format', '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}']);
const dockerImageInventory = imageListing.available
  ? imageListing.output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, repository, tag, size] = line.split('\t');
    const references = command('docker', ['ps', '-a', '--filter', `ancestor=${id}`, '-q']);
    const containerIds = references.available ? references.output.split(/\r?\n/).filter(Boolean) : [];
    const imageReference = `${repository}:${tag}`;
    const buildReferences = buildImageReferences.filter(({ imageWithoutDigest }) => imageWithoutDigest === imageReference);
    return {
      id,
      repository,
      tag,
      size,
      allocatedBytes: parseSize(size),
      containerIds,
      buildReferences,
      unreferencedByContainers: references.available && containerIds.length === 0,
      requiredByBuild: buildReferences.length > 0,
      reviewRequired: true,
      deletionAuthorized: false,
    };
  })
  : [];
const dockerImageDeletionCandidates = dockerImageInventory.filter((image) => image.unreferencedByContainers && !image.requiredByBuild);
const dockerImageBuildDependencies = dockerImageInventory.filter((image) => image.requiredByBuild);
const vhdxBytes = fileSize(vhdxPath);
const danglingVolumes = command('docker', ['volume', 'ls', '-qf', 'dangling=true']);
const danglingVolumeNames = danglingVolumes.available ? danglingVolumes.output.split(/\r?\n/).filter(Boolean) : [];
const neo4jInspect = command('docker', ['inspect', 'legal-ai-neo4j']);
let neo4jTempGuard = { available: false, browserEnabled: null, tmpfs: null, bounded: false };
if (neo4jInspect.available) {
  try {
    const [container] = JSON.parse(neo4jInspect.output);
    const environment = container?.Config?.Env ?? [];
    const modules = environment.find((value) => value.startsWith('NEO4J_server_http__enabled__modules=')) ?? '';
    const tmpfs = container?.HostConfig?.Tmpfs?.['/tmp'] ?? null;
    neo4jTempGuard = {
      available: true,
      browserEnabled: /(^|,)BROWSER(,|$)/.test(modules.split('=').slice(1).join('=')),
      tmpfs,
      bounded: typeof tmpfs === 'string' && /size=\d+(?:[kmg])/i.test(tmpfs) && /(?:^|,)exec(?:,|$)/.test(tmpfs),
    };
  } catch {
    // Keep the audit read-only and report unavailable inspection data.
  }
}
const writableLayerHotspots = containers
  .filter(({ writableBytes }) => writableBytes !== null && writableBytes >= 100 * 1024 ** 2)
  .sort((a, b) => b.writableBytes - a.writableBytes)
  .map(({ name, image, size, writableBytes, writableDiff }) => ({ name, image, size, writableBytes, writableDiff }));

const report = {
  schema: 'DockerStorageRetentionAuditV1',
  generatedAt: new Date().toISOString(),
  writesPerformed: false,
  destructiveActionsPerformed: false,
  docker: {
    available: dockerInfo.available,
    infoError: dockerInfo.available ? null : dockerInfo.error,
    systemDf: dockerDisk.available ? dockerDisk.output : null,
    systemDfError: dockerDisk.available ? null : dockerDisk.error,
    containers,
    writableLayerHotspots,
    imageDeletionCandidates: dockerImageDeletionCandidates,
    imageBuildDependencies: dockerImageBuildDependencies,
  },
  host: {
    dockerDataVhdx: { path: vhdxPath, bytes: vhdxBytes, gib: vhdxBytes === null ? null : gib(vhdxBytes) },
  },
  localWorkspace: localSizes,
  temporaryDirectorySizes,
  qdrantSnapshotFiles,
  qdrantSnapshotInventorySummary,
  qdrantSnapshotInventory: qdrantSnapshotDirectories,
  qdrantSnapshotRetentionInventory,
  qdrantVolumeStats,
  storageFindings: {
    danglingVolumeCount: danglingVolumeNames.length,
    danglingVolumeNames,
    writableLayerHotspots,
    neo4jWritableLayerRequiresProducerReview: writableLayerHotspots.some(({ name }) => name === 'legal-ai-neo4j'),
    neo4jTempGuard,
    imageDeletionCandidateCount: dockerImageDeletionCandidates.length,
    imageBuildDependencyCount: dockerImageBuildDependencies.length,
    snapshotReviewCandidates: qdrantSnapshotRetentionInventory
      .filter(({ retention }) => retention !== 'KEEP')
      .map(({ directory, role, retention, bytes, gib: size }) => ({ directory, role, retention, bytes, gib: size, deletionAuthorized: false })),
  },
  retentionPolicy: {
    postgres: 'KEEP_CANONICAL',
    qdrantLiveStorage: 'KEEP_DERIVED_RUNTIME; REBUILDABLE_FROM_POSTGRES',
    qdrantSnapshots: 'KEEP_ONE_LATEST_KNOWN_GOOD_AND_ONE_PRE_MIGRATION_CHECKPOINT; REVIEW_OLDER_FILES',
    graphAndProjectionExports: 'KEEP_ONLY_REVISION_QUALIFIED_RECEIPTS_OR_EXPLICIT_ROLLBACK_CHECKPOINTS',
    buildCache: 'RECLAIMABLE_AFTER_DOCKER_HEALTH_AND_BUILD_REPRODUCIBILITY_CHECK',
    oldTaggedImages: 'RECLAIMABLE_ONLY_AFTER_ACTIVE_CONTAINER_IMAGE_PARITY_CHECK',
    vhdxCompaction: 'RUN_ONLY_AFTER_RECLAIMING_CONTENT_AND_WITH_DOCKER_STOPPED',
  },
  blockers: [
    ...(vhdxBytes !== null && vhdxBytes > 150 * 1024 ** 3 ? ['DOCKER_VHDX_LARGE'] : []),
    ...(dockerInfo.available ? [] : ['DOCKER_ENGINE_UNAVAILABLE']),
    'RETENTION_CANDIDATES_REQUIRE_EXPLICIT_REVIEW',
  ],
  nextGate: 'DOCKER_STORAGE_RETENTION_REVIEW_V1',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.tmp-${process.pid}`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`);
fs.renameSync(tempPath, reportPath);

console.log(JSON.stringify({
  status: report.blockers.length === 1 ? 'STORAGE_AUDIT_PROVEN' : 'STORAGE_REVIEW_REQUIRED',
  dockerAvailable: report.docker.available,
  dockerDataVhdxGiB: report.host.dockerDataVhdx.gib,
  qdrantSnapshotFileCount: qdrantSnapshotInventorySummary.available
    ? qdrantSnapshotInventorySummary.fileCount
    : qdrantSnapshotFiles.length,
  qdrantSnapshotDirectoryCount: qdrantSnapshotInventorySummary.available
    ? qdrantSnapshotInventorySummary.directoryCount
    : null,
  localSizes: localSizes.map(({ path: itemPath, gib: size }) => ({ path: itemPath, gib: size })),
  blockers: report.blockers,
  reportPath,
}, null, 2));
