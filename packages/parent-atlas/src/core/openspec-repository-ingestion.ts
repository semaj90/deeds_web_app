import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  compileOpenSpecEvidence,
  type OpenSpecCompilationReceiptV1,
} from './openspec-evidence-compiler.js';
import type { OpenSpecEvidencePayloadV1 } from './evidence-entity-extractors.js';

const revision = z.string().min(1);

export const openSpecRepositoryIngestionReceiptSchema = z.object({
  schema: z.literal('atlas.openspec-repository-ingestion-receipt.v1').default('atlas.openspec-repository-ingestion-receipt.v1'),
  workspace_revision: revision,
  roots: z.array(z.string().min(1)),
  document_count: z.number().int().nonnegative(),
  requirement_count: z.number().int().nonnegative(),
  scenario_count: z.number().int().nonnegative(),
  task_count: z.number().int().nonnegative(),
  rename_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  failures: z.array(z.object({ source_ref: z.string().min(1), error: z.string().min(1) }).strict()),
  source_checksums: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  output_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  database_write_performed: z.literal(false).default(false),
}).strict();

export type OpenSpecRepositoryIngestionReceiptV1 = z.infer<typeof openSpecRepositoryIngestionReceiptSchema>;

export type OpenSpecCompiledDocumentV1 = {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  payload: OpenSpecEvidencePayloadV1;
  receipt: OpenSpecCompilationReceiptV1;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function outputHash(value: unknown): string {
  return sha256(stable(value));
}

function normalizeRef(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) out.push(target);
    }
  }
  await visit(root);
  return out;
}

function isOpenSpecArtifact(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return /\/openspec\/specs\/[^/]+\/spec\.md$/i.test(`/${normalized}`)
    || /\/openspec\/changes\/[^/]+\/specs\/[^/]+\/spec\.md$/i.test(`/${normalized}`)
    || /\/openspec\/changes\/[^/]+\/tasks\.md$/i.test(`/${normalized}`);
}

/**
 * Traverse one or more explicit OpenSpec roots and compile every recognized
 * main spec, delta spec and tasks ledger through the parser-owned identity
 * compiler.
 *
 * Document revision is content-addressed (`content:<sha256>`); workspaceRevision
 * is carried separately so identical document bytes in two workspaces remain
 * distinguishable at ingestion time without changing OpenSpec identity.
 */
export async function ingestOpenSpecRepository(input: {
  repo_root: string;
  workspace_revision: string;
  openspec_roots?: string[];
  producer_revision: string;
  fail_on_document_error?: boolean;
}): Promise<{ documents: OpenSpecCompiledDocumentV1[]; receipt: OpenSpecRepositoryIngestionReceiptV1 }> {
  const repoRoot = path.resolve(input.repo_root);
  const roots = (input.openspec_roots?.length ? input.openspec_roots : ['openspec'])
    .map((root) => path.resolve(repoRoot, root));
  const candidateFiles = [...new Set((await Promise.all(roots.map(walk))).flat())]
    .filter(isOpenSpecArtifact)
    .sort((a, b) => a.localeCompare(b));

  const documents: OpenSpecCompiledDocumentV1[] = [];
  const failures: Array<{ source_ref: string; error: string }> = [];
  const sourceChecksums: Record<string, string> = {};

  for (const absolutePath of candidateFiles) {
    const sourceRef = normalizeRef(repoRoot, absolutePath);
    try {
      const markdown = await readFile(absolutePath, 'utf8');
      const checksum = sha256(markdown);
      sourceChecksums[sourceRef] = checksum;
      const sourceRevision = `content:${checksum}`;
      const compiled = compileOpenSpecEvidence({
        source_ref: sourceRef,
        source_revision: sourceRevision,
        markdown,
        producer_revision: input.producer_revision,
      });
      documents.push({
        source_ref: sourceRef,
        source_revision: sourceRevision,
        workspace_revision: input.workspace_revision,
        payload: compiled.payload,
        receipt: compiled.receipt,
      });
    } catch (error) {
      failures.push({ source_ref: sourceRef, error: error instanceof Error ? error.message : String(error) });
      if (input.fail_on_document_error) throw error;
    }
  }

  const counts = documents.reduce((acc, document) => {
    acc.requirements += document.receipt.requirement_count;
    acc.scenarios += document.receipt.scenario_count;
    acc.tasks += document.receipt.task_count;
    acc.renames += document.receipt.rename_count;
    return acc;
  }, { requirements: 0, scenarios: 0, tasks: 0, renames: 0 });

  const receipt = openSpecRepositoryIngestionReceiptSchema.parse({
    workspace_revision: input.workspace_revision,
    roots: roots.map((root) => normalizeRef(repoRoot, root)),
    document_count: documents.length,
    requirement_count: counts.requirements,
    scenario_count: counts.scenarios,
    task_count: counts.tasks,
    rename_count: counts.renames,
    failed_count: failures.length,
    failures,
    source_checksums: sourceChecksums,
    output_checksum: outputHash(documents.map((document) => ({
      source_ref: document.source_ref,
      source_revision: document.source_revision,
      payload: document.payload,
      receipt: document.receipt,
    }))),
    producer_revision: input.producer_revision,
    database_write_performed: false,
  });

  return { documents, receipt };
}

export function describeOpenSpecRepositoryIngestion(): string {
  return [
    'OpenSpec repository ingestion traverses explicit OpenSpec roots only.',
    'Every document is content-addressed and compiled by the parser-owned OpenSpec identity compiler.',
    'Workspace revision is retained separately from content revision for replay and stale-evidence checks.',
    'The ingestion stage performs no database writes; atlas_evidence_entities population remains a later canonical materialization step.',
  ].join(' ');
}
