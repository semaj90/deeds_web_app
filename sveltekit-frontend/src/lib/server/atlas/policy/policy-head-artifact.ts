import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { PolicyHeadTrainingOptions, PolicyHeadTrainingResult } from './policy-head-trainer.js';
import { trainPolicyHeads } from './policy-head-trainer.js';
import { loadRouteTraceTrainingRows, type RouteTraceTrainingRow } from './policy-training.js';

export const POLICY_HEAD_ARTIFACT_REVISION = 'parent-atlas.policy-head-artifact.v1' as const;
export const POLICY_HEAD_ARTIFACT_DIR = 'memory/datasets/policy_training/artifacts' as const;

export interface SerializedLinearHead {
  revision: string;
  classes: readonly string[];
  featureCount: number;
  weights: number[][];
  bias: number[];
}

export interface PolicyHeadArtifact {
  revision: typeof POLICY_HEAD_ARTIFACT_REVISION;
  createdAt: string;
  sourceDatasetPath: string;
  sourceRowCount: number;
  sourceRowDigest: string;
  holdoutFraction: number;
  trainCount: number;
  holdoutCount: number;
  actionHead: SerializedLinearHead;
  modelHead: SerializedLinearHead;
  budgetHead: SerializedLinearHead;
  metrics: PolicyHeadTrainingResult['metrics'];
}

export interface BuildPolicyHeadArtifactInput {
  training: PolicyHeadTrainingResult;
  rows: readonly RouteTraceTrainingRow[];
  sourceDatasetPath: string;
  createdAt?: Date;
}

export interface SavePolicyHeadArtifactOptions {
  artifactDir?: string;
  filePath?: string;
  now?: Date;
}

export interface TrainPolicyHeadsFromReplayOptions {
  datasetDir?: string;
  datasetFilePath?: string;
  artifactDir?: string;
  artifactFilePath?: string;
  training?: PolicyHeadTrainingOptions;
  now?: Date;
}

export const SerializedLinearHeadSchema = z.object({
  revision: z.string().min(1),
  classes: z.array(z.string().min(1)),
  featureCount: z.number().int().positive(),
  weights: z.array(z.array(z.number().finite())),
  bias: z.array(z.number().finite()),
}).strict();

export const PolicyHeadArtifactSchema = z.object({
  revision: z.literal(POLICY_HEAD_ARTIFACT_REVISION),
  createdAt: z.string().datetime({ offset: true }),
  sourceDatasetPath: z.string().min(1),
  sourceRowCount: z.number().int().nonnegative(),
  sourceRowDigest: z.string().min(1),
  holdoutFraction: z.number().min(0).max(1),
  trainCount: z.number().int().nonnegative(),
  holdoutCount: z.number().int().nonnegative(),
  actionHead: SerializedLinearHeadSchema,
  modelHead: SerializedLinearHeadSchema,
  budgetHead: SerializedLinearHeadSchema,
  metrics: z.object({
    actionBaseline: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
    actionLearned: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
    modelLearned: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
    budgetLearned: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
    repairSuccessBaseline: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
    repairSuccessLearned: z.object({ total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict(),
  }).strict(),
}).strict();

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function serializeHead(head: PolicyHeadTrainingResult['actionHead']): SerializedLinearHead {
  return {
    revision: head.revision,
    classes: [...head.classes],
    featureCount: head.featureCount,
    weights: head.weights.map((row) => [...row]),
    bias: [...head.bias],
  };
}

function rootDirFromCwd(): string {
  return process.cwd().endsWith('sveltekit-frontend')
    ? resolve(process.cwd(), '..')
    : process.cwd();
}

export function buildPolicyHeadArtifact(input: BuildPolicyHeadArtifactInput): PolicyHeadArtifact {
  const sourceRowDigest = stableDigest(input.rows.map((row) => row.trainingDigest));
  return {
    revision: POLICY_HEAD_ARTIFACT_REVISION,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    sourceDatasetPath: input.sourceDatasetPath,
    sourceRowCount: input.rows.length,
    sourceRowDigest,
    holdoutFraction: input.training.holdoutFraction,
    trainCount: input.training.trainCount,
    holdoutCount: input.training.holdoutCount,
    actionHead: serializeHead(input.training.actionHead),
    modelHead: serializeHead(input.training.modelHead),
    budgetHead: serializeHead(input.training.budgetHead),
    metrics: input.training.metrics,
  };
}

export function resolvePolicyHeadArtifactPath(now = new Date(), artifactDir?: string): string {
  const rootDir = rootDirFromCwd();
  const dir = artifactDir ?? join(rootDir, POLICY_HEAD_ARTIFACT_DIR);
  return join(dir, `${now.toISOString().slice(0, 10)}.json`);
}

export async function savePolicyHeadArtifact(
  artifact: PolicyHeadArtifact,
  options: SavePolicyHeadArtifactOptions = {},
): Promise<string> {
  const filePath = options.filePath ?? resolvePolicyHeadArtifactPath(options.now ?? new Date(), options.artifactDir);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadPolicyHeadArtifact(filePath: string): Promise<PolicyHeadArtifact> {
  const raw = await readFile(filePath, 'utf8');
  return PolicyHeadArtifactSchema.parse(JSON.parse(raw));
}

export async function trainPolicyHeadsFromReplay(
  options: TrainPolicyHeadsFromReplayOptions = {},
): Promise<{ artifact: PolicyHeadArtifact; artifactPath: string; rows: RouteTraceTrainingRow[] }> {
  const rows = await loadRouteTraceTrainingRows({
    datasetDir: options.datasetDir,
    filePath: options.datasetFilePath,
  });
  if (rows.length < 4) {
    throw new Error(`Need at least 4 replay rows, found ${rows.length}.`);
  }

  const training = trainPolicyHeads(rows, options.training);
  const artifact = buildPolicyHeadArtifact({
    training,
    rows,
    sourceDatasetPath:
      options.datasetFilePath ??
      options.datasetDir ??
      join(rootDirFromCwd(), POLICY_HEAD_ARTIFACT_DIR),
    createdAt: options.now ?? new Date(),
  });
  const artifactPath = await savePolicyHeadArtifact(artifact, {
    artifactDir: options.artifactDir,
    filePath: options.artifactFilePath,
    now: options.now ?? new Date(),
  });

  return { artifact, artifactPath, rows };
}
