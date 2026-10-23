// NS-7 SOURCE-CLASS-SPLIT-V1: pure classification of frozen physical inventory rows.
// Classification only. Source admission, revision qualification and embedding
// eligibility are separate fields and never implied by a class.
import { classifyInventoryPath, normalizeInventoryPath } from './canonical-source-inventory-hygiene-v1.mts';

export const SOURCE_CLASS_SPLIT_POLICY_REVISION = 'atlas.source-class-split.2026-10-22.v1' as const;
export const NOT_ADMITTED = 'NOT_ADMITTED_NO_WORKSPACE_REVISION' as const;

export const SOURCE_CLASSES = [
  'FIRST_PARTY_SOURCE',
  'OPENSPEC_REQUIREMENTS',
  'EXTERNAL_DEPENDENCY',
  'GENERATED_SOURCE',
  'TELEMETRY_REPORT',
  'MODEL_ARTIFACT',
  'BINARY_ASSET',
  'ENVIRONMENT_CACHE',
  'UNKNOWN',
] as const;
export type SourceClass = typeof SOURCE_CLASSES[number];

export const EMBEDDING_POLICIES = [
  'PRIORITY_CANDIDATE_REVISION_PENDING',
  'SECONDARY_CANDIDATE_UNTRACKED_REVISION_PENDING',
  'SELECTED_API_SURFACE_ONLY',
  'SELECTIVE_ONLY',
  'STRUCTURED_EXTRACTION_ONLY',
  'EXCLUDED_DEFAULT',
  'EXCLUDED_GITIGNORED',
  'EXCLUDED_DUPLICATE_OR_SCRATCH',
  'EXCLUDED_SYMLINK_NOT_FOLLOWED',
  'EXCLUDED_NOT_CONTENT',
  'EXCLUDED_UNCLASSIFIED',
] as const;
export type EmbeddingPolicy = typeof EMBEDDING_POLICIES[number];

export type InventoryEntryKind = 'FILE' | 'DIRECTORY' | 'SYMLINK_OR_JUNCTION';

export type InventoryRow = {
  relativePath: string;
  entryKind: InventoryEntryKind;
  extension: string | null;
  role: string;
  sizeBytes: number | null;
};

export type CensusEntry = { embedding768ChunkCount: number; contentEmbeddingChunkCount: number };

export type OwnershipContext = {
  // Sorted nested repository roots relative to the workspace root (root itself excluded).
  nestedRepoRoots: readonly string[];
  // Owner ('ROOT' or nested root) -> owner-relative tracked / gitignored paths.
  trackedByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  ignoredByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  censusByPath?: ReadonlyMap<string, CensusEntry>;
};

export type ClassificationResult = {
  sourceClass: SourceClass | null;
  classRule: string | null;
  matchedRules: string[];
  conflictRules: string[];
  inventoryClassification: string;
  owner: string;
  gitTracked: boolean;
  gitIgnored: boolean;
  embeddingPolicy: EmbeddingPolicy;
  embedding768Status: 'HAS_UNQUALIFIED_768_VECTORS' | 'NO_768_VECTOR' | 'NOT_APPLICABLE';
  admissionState: typeof NOT_ADMITTED;
};

const MODEL_EXT = new Set(['gguf', 'safetensors', 'pt', 'pth', 'ckpt', 'onnx', 'ubj', 'pkl', 'joblib', 'h5', 'tflite', 'keras', 'mlmodel']);
const BINARY_EXT = new Set([
  'exe', 'dll', 'so', 'dylib', 'node', 'obj', 'o', 'lib', 'pdb', 'pyd', 'ilk', 'exp', 'wasm', 'pb',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'pdf',
  'zip', 'gz', 'br', 'tgz', 'tar', '7z', 'rar', 'xz', 'bz2', 'mp3', 'mp4', 'wav', 'ogg', 'mov', 'avi',
  'duckdb', 'sqlite', 'db', 'arrow', 'parquet', 'feather', 'npy', 'npz', 'mmap', 'bin', 'dat',
]);
const GENERATED_EXT = new Set(['map', 'd', 'timestamp', 'rmeta']);
const PYC_EXT = new Set(['pyc', 'pyo']);
const TELEMETRY_EXT = new Set(['jsonl', 'ndjson', 'log', 'err', 'out']);
const DATAISH_EXT = new Set(['json', 'md', 'txt', 'csv', 'yaml', 'yml']);
const OPENSPEC_EXT = new Set(['md', 'yaml', 'yml', 'json', 'txt', 'toml']);
const CODE_EXT = new Set([
  'ts', 'mts', 'cts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'svelte', 'py', 'pyi', 'rs', 'go', 'cu', 'cuh',
  'c', 'cc', 'cpp', 'h', 'hpp', 'hh', 'sql', 'sh', 'ps1', 'psm1', 'bat', 'cmd', 'proto', 'wgsl', 'java',
  'cs', 'kt', 'swift', 'rb', 'php', 'lua', 'zig', 'toml', 'yaml', 'yml', 'json', 'jsonc', 'json5', 'ini',
  'cfg', 'conf', 'env', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'md', 'mdx', 'txt', 'rst',
  'adoc', 'graphql', 'gql', 'cmake', 'sln', 'slnx', 'vcxproj', 'props', 'targets', 'gitignore', 'gitattributes',
  'editorconfig', 'npmrc', 'nvmrc', 'prettierrc', 'dockerignore', 'csv', 'tsv', 'cypher',
]);
const EXTENSIONLESS_SOURCE_NAMES = new Set(['dockerfile', 'makefile', 'license', 'readme', 'codeowners', 'justfile', 'procfile', 'gemfile', 'rakefile']);
const TELEMETRY_SEGMENTS = new Set(['logs', 'reports', 'receipts', 'telemetry', '.tmp']);
const ENV_SEGMENTS = new Set(['__pycache__', '.pytest_cache', '.cache', '.venv', 'venv', '.python311', 'python311']);

function segmentsOf(path: string): string[] {
  return normalizeInventoryPath(path).toLowerCase().split('/').filter(Boolean);
}

// Inventory stores extensions with a leading dot (".ts"). Every rule set here is undotted.
export function normalizeExtension(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/^\./, '').toLowerCase();
}

function extensionOf(row: InventoryRow): string {
  const declared = normalizeExtension(row.extension);
  if (declared) return declared;
  const base = segmentsOf(row.relativePath).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

// Nearest nested repository owning the path; 'ROOT' when none.
export function owningRepository(path: string, nestedRepoRoots: readonly string[]): string {
  const normalized = normalizeInventoryPath(path);
  let best = 'ROOT';
  for (const root of nestedRepoRoots) {
    if ((normalized === root || normalized.startsWith(`${root}/`)) && root.length > (best === 'ROOT' ? 0 : best.length)) best = root;
  }
  return best;
}

export function ownerRelativePath(path: string, owner: string): string {
  const normalized = normalizeInventoryPath(path);
  return owner === 'ROOT' ? normalized : normalized.slice(owner.length + 1);
}

type RuleHit = { id: string; sourceClass: SourceClass; fallback: boolean };

// Precedence order = evaluation order. Conflicts are every other matched class.
export function matchRules(row: InventoryRow, inventoryClassification: string): RuleHit[] {
  const path = normalizeInventoryPath(row.relativePath);
  const segs = segmentsOf(path);
  const ext = extensionOf(row);
  const base = segs[segs.length - 1] ?? '';
  const hits: RuleHit[] = [];
  const add = (id: string, sourceClass: SourceClass, fallback = false) => hits.push({ id, sourceClass, fallback });

  if (segs.includes('.git')) add('GIT_INTERNAL', 'ENVIRONMENT_CACHE');
  if (row.role === 'VIRTUAL_ENVIRONMENT' || inventoryClassification === 'VENDORED_RUNTIME'
    || segs.some((s) => ENV_SEGMENTS.has(s)) || PYC_EXT.has(ext)) add('ENV_OR_RUNTIME', 'ENVIRONMENT_CACHE');
  if (inventoryClassification === 'EXTERNAL_DEPENDENCY' || row.role === 'DEPENDENCY_TREE') add('EXTERNAL_DEPENDENCY_TREE', 'EXTERNAL_DEPENDENCY');
  if (MODEL_EXT.has(ext) || base.endsWith('.onnx.data')) add('MODEL_EXTENSION', 'MODEL_ARTIFACT');
  if (BINARY_EXT.has(ext)) add('BINARY_EXTENSION', 'BINARY_ASSET');
  if (TELEMETRY_EXT.has(ext) || (DATAISH_EXT.has(ext) && segs.some((s) => TELEMETRY_SEGMENTS.has(s)))) add('TELEMETRY_OR_REPORT', 'TELEMETRY_REPORT');
  if (row.role === 'GENERATED_OR_BUILD_ARTIFACT' || GENERATED_EXT.has(ext)) add('GENERATED_OR_BUILD', 'GENERATED_SOURCE');
  if (segs.includes('openspec') && OPENSPEC_EXT.has(ext)) add('OPENSPEC_PATH', 'OPENSPEC_REQUIREMENTS');
  if (CODE_EXT.has(ext) || (ext === '' && EXTENSIONLESS_SOURCE_NAMES.has(base))) add('FIRST_PARTY_EXTENSION', 'FIRST_PARTY_SOURCE', true);
  return hits;
}

export function classifyRow(row: InventoryRow, ctx: OwnershipContext): ClassificationResult {
  const path = normalizeInventoryPath(row.relativePath);
  const owner = owningRepository(path, ctx.nestedRepoRoots);
  const ownerRel = ownerRelativePath(path, owner);
  const inventoryClassification = classifyInventoryPath(path);
  const tracked = ctx.trackedByOwner.get(owner)?.has(ownerRel) ?? false;
  const ignored = (ctx.ignoredByOwner.get(owner)?.has(ownerRel) ?? false) && !tracked;
  const census = ctx.censusByPath?.get(path);
  const embedding768Status = row.entryKind !== 'FILE' ? 'NOT_APPLICABLE'
    : (census?.embedding768ChunkCount ?? 0) > 0 ? 'HAS_UNQUALIFIED_768_VECTORS' : 'NO_768_VECTOR';

  if (row.entryKind === 'DIRECTORY') {
    return {
      sourceClass: null, classRule: null, matchedRules: [], conflictRules: [], inventoryClassification,
      owner, gitTracked: false, gitIgnored: false, embeddingPolicy: 'EXCLUDED_NOT_CONTENT', embedding768Status, admissionState: NOT_ADMITTED,
    };
  }

  const hits = matchRules(row, inventoryClassification);
  const winner = hits[0] ?? null;
  const sourceClass: SourceClass = winner?.sourceClass ?? 'UNKNOWN';
  const conflictRules = hits
    .filter((hit) => !hit.fallback && winner && hit.sourceClass !== winner.sourceClass)
    .map((hit) => `${hit.id}->${hit.sourceClass}`);
  const matchedRules = hits.map((hit) => hit.id);
  const segs = segmentsOf(path);
  const duplicateOrScratch = !segs.includes('.git')
    && (segs.includes('.tmp') || inventoryClassification === 'WORKTREE_DUPLICATE' || inventoryClassification === 'BACKUP_OR_ARCHIVE');

  let embeddingPolicy: EmbeddingPolicy;
  if (row.entryKind === 'SYMLINK_OR_JUNCTION') embeddingPolicy = 'EXCLUDED_SYMLINK_NOT_FOLLOWED';
  else if (ignored) embeddingPolicy = 'EXCLUDED_GITIGNORED';
  else if ((sourceClass === 'FIRST_PARTY_SOURCE' || sourceClass === 'OPENSPEC_REQUIREMENTS') && duplicateOrScratch) embeddingPolicy = 'EXCLUDED_DUPLICATE_OR_SCRATCH';
  else if (sourceClass === 'FIRST_PARTY_SOURCE' || sourceClass === 'OPENSPEC_REQUIREMENTS') {
    embeddingPolicy = tracked ? 'PRIORITY_CANDIDATE_REVISION_PENDING' : 'SECONDARY_CANDIDATE_UNTRACKED_REVISION_PENDING';
  } else if (sourceClass === 'EXTERNAL_DEPENDENCY') embeddingPolicy = 'SELECTED_API_SURFACE_ONLY';
  else if (sourceClass === 'GENERATED_SOURCE') embeddingPolicy = 'SELECTIVE_ONLY';
  else if (sourceClass === 'TELEMETRY_REPORT') embeddingPolicy = 'STRUCTURED_EXTRACTION_ONLY';
  else if (sourceClass === 'UNKNOWN') embeddingPolicy = 'EXCLUDED_UNCLASSIFIED';
  else embeddingPolicy = 'EXCLUDED_DEFAULT';

  return {
    sourceClass, classRule: winner?.id ?? null, matchedRules, conflictRules, inventoryClassification,
    owner, gitTracked: tracked, gitIgnored: ignored, embeddingPolicy, embedding768Status, admissionState: NOT_ADMITTED,
  };
}

export type ClassTotals = Record<SourceClass, { files: number; bytes: number }>;

export function emptyClassTotals(): ClassTotals {
  return Object.fromEntries(SOURCE_CLASSES.map((c) => [c, { files: 0, bytes: 0 }])) as ClassTotals;
}

// Byte reconciliation: class totals must equal the independently summed file bytes.
export function reconcileBytes(totals: ClassTotals, independentFileBytes: number, independentFileCount: number) {
  const classBytes = SOURCE_CLASSES.reduce((sum, c) => sum + totals[c].bytes, 0);
  const classFiles = SOURCE_CLASSES.reduce((sum, c) => sum + totals[c].files, 0);
  return {
    classBytes,
    classFiles,
    independentFileBytes,
    independentFileCount,
    bytesReconcile: classBytes === independentFileBytes,
    filesReconcile: classFiles === independentFileCount,
  };
}
