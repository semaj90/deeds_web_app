import { z } from 'zod';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const finiteVector = z.array(z.number().finite()).min(1);

export const TreeNodeIdentitySchema = z
  .object({
    packetKey: z.string().min(1),
    treeNodeId: z.string().min(1),
    sourceRef: z.string().min(1),
    corpusSnapshotId: z.string().min(1),
  })
  .strict();

export type TreeNodeIdentity = z.infer<typeof TreeNodeIdentitySchema>;

export function validateTreeNodeIdentities(rows: TreeNodeIdentity[]): void {
  const byTreeNode = new Map<string, TreeNodeIdentity[]>();
  for (const row of rows) {
    TreeNodeIdentitySchema.parse(row);
    const existing = byTreeNode.get(row.treeNodeId) ?? [];
    existing.push(row);
    byTreeNode.set(row.treeNodeId, existing);
  }

  for (const [treeNodeId, identities] of byTreeNode) {
    const packetKeys = new Set(identities.map((identity) => identity.packetKey));
    if (packetKeys.size > 1) {
      throw new Error(JSON.stringify({
        kind: 'TREE_NODE_ID_COLLISION',
        treeNodeId,
        packetKeys: [...packetKeys].sort(),
        sourceRefs: [...new Set(identities.map((identity) => identity.sourceRef))].sort(),
      }));
    }
  }
}

export const KMeansCentroidManifestSchema = z
  .object({
    modelId: z.string().min(1),
    corpusSnapshotId: z.string().min(1),
    vectorLaneId: z.string().min(1),
    dimension: z.number().int().positive(),
    centroids: z.array(z.object({ clusterId: z.number().int().nonnegative(), vector: finiteVector }).strict()).min(1),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    for (const [index, centroid] of manifest.centroids.entries()) {
      if (centroid.vector.length !== manifest.dimension) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['centroids', index, 'vector'], message: 'Centroid vector dimension does not match its manifest.' });
      }
    }
  });

export type KMeansCentroidManifest = z.infer<typeof KMeansCentroidManifestSchema>;

export interface KMeansRoutingPlan {
  status: 'ACTIVE' | 'DEGRADED';
  modelId: string;
  corpusSnapshotId: string;
  selectedClusterIds: number[];
  globalAnnFallback: true;
  warnings: string[];
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm === 0 || rightNorm === 0 ? -1 : dot / Math.sqrt(leftNorm * rightNorm);
}

export function planKMeansRouting(queryVector: number[], manifest: KMeansCentroidManifest, topClusters = 3): KMeansRoutingPlan {
  const parsed = KMeansCentroidManifestSchema.parse(manifest);
  if (queryVector.length !== parsed.dimension) {
    return {
      status: 'DEGRADED', modelId: parsed.modelId, corpusSnapshotId: parsed.corpusSnapshotId,
      selectedClusterIds: [], globalAnnFallback: true,
      warnings: [`KMEANS_DIMENSION_MISMATCH expected=${parsed.dimension} received=${queryVector.length}`],
    };
  }

  const selectedClusterIds = parsed.centroids
    .map((centroid) => ({ clusterId: centroid.clusterId, score: cosine(queryVector, centroid.vector) }))
    .sort((left, right) => right.score - left.score || left.clusterId - right.clusterId)
    .slice(0, Math.max(1, Math.min(topClusters, 10)))
    .map(({ clusterId }) => clusterId);

  return { status: 'ACTIVE', modelId: parsed.modelId, corpusSnapshotId: parsed.corpusSnapshotId, selectedClusterIds, globalAnnFallback: true, warnings: [] };
}

export const RgJsonMatchSchema = z
  .object({
    sourceRef: z.string().min(1),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    matchedText: z.string().min(1),
    keyword: z.string().min(1),
    matchKind: z.literal('exact_identifier'),
  })
  .strict();

export type RgJsonMatch = z.infer<typeof RgJsonMatchSchema>;

export function parseRgJsonLines(lines: Iterable<string>, workspaceRoot: string, keyword: string): RgJsonMatch[] {
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const matches: RgJsonMatch[] = [];

  for (const line of lines) {
    let event: any;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== 'match') continue;
    const pathText = String(event.data?.path?.text ?? '').replace(/\\/g, '/');
    const absolutePath = pathText.startsWith('/') || /^[A-Za-z]:\//.test(pathText) ? pathText : `${normalizedRoot}/${pathText}`;
    if (!(absolutePath === normalizedRoot || absolutePath.startsWith(`${normalizedRoot}/`))) continue;

    const lineNumber = Number(event.data?.line_number);
    const text = String(event.data?.lines?.text ?? '');
    const submatches = Array.isArray(event.data?.submatches) ? event.data.submatches : [];
    for (const submatch of submatches) {
      const start = Number(submatch?.start);
      const end = Number(submatch?.end);
      const matchedText = text.slice(start, end).trim();
      if (Number.isInteger(lineNumber) && lineNumber > 0 && Number.isInteger(start) && start >= 0 && matchedText) {
        matches.push(RgJsonMatchSchema.parse({
          sourceRef: absolutePath.slice(normalizedRoot.length + 1), line: lineNumber, column: start + 1,
          matchedText, keyword, matchKind: 'exact_identifier',
        }));
      }
    }
  }
  return matches;
}

export function buildRgJsonArgs(keywords: string[]): string[] {
  const normalized = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 50);
  if (normalized.length === 0) throw new Error('At least one exact keyword is required for rg evidence.');
  return ['--json', '--fixed-strings', '--line-number', '--column', '--hidden', '--glob', '!node_modules/**', '--glob', '!build/**', '--glob', '!dist/**', ...normalized.flatMap((keyword) => ['-e', keyword])];
}

export interface ExactLexicalResult {
  status: 'ACTIVE' | 'EMPTY' | 'UNAVAILABLE';
  matches: RgJsonMatch[];
  warnings: string[];
  latencyMs: number;
}

/** Runs ripgrep through spawn with a fixed workspace cwd and no shell interpolation. */
export async function runExactRgJson(input: {
  workspaceRoot: string;
  keywords: string[];
  maxResults?: number;
  timeoutMs?: number;
}): Promise<ExactLexicalResult> {
  const workspaceRoot = resolve(input.workspaceRoot);
  const maxResults = Math.max(1, Math.min(input.maxResults ?? 50, 100));
  const timeoutMs = Math.max(100, Math.min(input.timeoutMs ?? 10_000, 30_000));
  const args = [...buildRgJsonArgs(input.keywords), '--max-count', String(maxResults), '.'];
  const startedAt = Date.now();

  return new Promise((resolveResult) => {
    const child = spawn('rg', args, { cwd: workspaceRoot, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (result: ExactLexicalResult) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish({ status: 'UNAVAILABLE', matches: [], warnings: ['RG_TIMEOUT'], latencyMs: Date.now() - startedAt });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      finish({ status: 'UNAVAILABLE', matches: [], warnings: [error.code === 'ENOENT' ? 'RG_NOT_INSTALLED' : `RG_START_FAILED:${error.message}`], latencyMs: Date.now() - startedAt });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        finish({ status: 'UNAVAILABLE', matches: [], warnings: ['RG_TIMEOUT'], latencyMs: Date.now() - startedAt });
        return;
      }
      if (code !== 0 && code !== 1) {
        finish({ status: 'UNAVAILABLE', matches: [], warnings: [`RG_EXIT_${code}:${stderr.trim()}`], latencyMs: Date.now() - startedAt });
        return;
      }
      const matches = parseRgJsonLines(stdout.split(/\r?\n/), workspaceRoot, input.keywords[0] ?? '');
      finish({ status: matches.length > 0 ? 'ACTIVE' : 'EMPTY', matches: matches.slice(0, maxResults), warnings: [], latencyMs: Date.now() - startedAt });
    });
  });
}
