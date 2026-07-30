#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { runRepositoryProvenanceWorkflow } from '../../sveltekit-frontend/src/lib/server/atlas/repository-provenance-workflow.ts';

type WorkflowProfile = 'structural' | 'semantic-sample' | 'semantic-full' | 'production-projection';

type CliOptions = {
  repoRoot: string;
  outputDir: string;
  apply: boolean;
  profile: WorkflowProfile;
  semanticSampleLimit: number;
  lexicalTokenLimit: number;
  queryCorpusPath: string | null;
  representationId: string | null;
};

export function valueAfterEquals(arg: string): string | undefined {
  const separator = arg.indexOf('=');
  return separator > 0 ? arg.slice(separator + 1) : undefined;
}

export function parsePositiveInteger(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
  maximum: number
): number {
  if (rawValue === undefined) return fallback;
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${optionName} must be a positive integer, received ${JSON.stringify(rawValue)}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${optionName} must be between 1 and ${maximum}, received ${value}`);
  }
  return value;
}

export function parseProfile(raw: string | undefined): WorkflowProfile {
  const profile = (raw ?? 'semantic-sample') as WorkflowProfile;
  switch (profile) {
    case 'structural':
    case 'semantic-sample':
    case 'semantic-full':
    case 'production-projection':
      return profile;
    default:
      throw new Error(`Unknown workflow profile: ${profile}`);
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const knownPrefixes = ['--repo-root=', '--root=', '--output-dir=', '--sample-limit=', '--lexical-token-limit=', '--query-corpus=', '--profile=', '--representation-id='];

  for (const arg of argv) {
    if (arg === '--apply' || arg === '--dry-run') continue;
    if (!knownPrefixes.some((prefix) => arg.startsWith(prefix))) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (argv.includes('--apply') && argv.includes('--dry-run')) {
    throw new Error('Use only one of --apply or --dry-run');
  }

  // Parse repo root FIRST, before calculating outputDir
  const rootArg = argv.find((arg) => arg.startsWith('--repo-root=') || arg.startsWith('--root='));
  const resolvedRepoRoot = rootArg ? path.resolve(valueAfterEquals(rootArg) ?? '') : process.cwd();

  // Now calculate output dir relative to resolved repo root
  const outputArg = argv.find((arg) => arg.startsWith('--output-dir='));
  const resolvedOutputDir = outputArg
    ? (() => {
        const rawOutputDir = valueAfterEquals(outputArg) ?? '';
        return path.isAbsolute(rawOutputDir) ? rawOutputDir : path.resolve(resolvedRepoRoot, rawOutputDir);
      })()
    : path.join(resolvedRepoRoot, '.tmp', 'phase109b');

  const sampleArg = valueAfterEquals(argv.find((arg) => arg.startsWith('--sample-limit=')) ?? '');
  const lexicalArg = valueAfterEquals(argv.find((arg) => arg.startsWith('--lexical-token-limit=')) ?? '');
  const corpusArg = valueAfterEquals(argv.find((arg) => arg.startsWith('--query-corpus=')) ?? '');
  const profileArg = valueAfterEquals(argv.find((arg) => arg.startsWith('--profile=')) ?? '');
  const representationArg = valueAfterEquals(argv.find((arg) => arg.startsWith('--representation-id=')) ?? '');

  // Resolve corpus path relative to resolved repo root
  const corpusValue = corpusArg ? path.resolve(resolvedRepoRoot, corpusArg) : null;

  return {
    repoRoot: resolvedRepoRoot,
    outputDir: resolvedOutputDir,
    apply: argv.includes('--apply') && !argv.includes('--dry-run'),
    profile: parseProfile(profileArg),
    semanticSampleLimit: parsePositiveInteger(sampleArg, 'sample-limit', 24, 100_000),
    lexicalTokenLimit: parsePositiveInteger(lexicalArg, 'lexical-token-limit', 32, 4_096),
    queryCorpusPath: corpusValue,
    representationId: representationArg ?? null,
  };
}

export function copyReport(source: string, destination: string): void {
  if (!fs.existsSync(source)) {
    throw new Error(`Expected report does not exist: ${source}`);
  }
  if (path.resolve(source) === path.resolve(destination)) {
    return;
  }
  const temporaryPath = `${destination}.tmp`;
  fs.copyFileSync(source, temporaryPath);
  fs.renameSync(temporaryPath, destination);
}

export function evaluateWorkflowSuccess(
  report: Awaited<ReturnType<typeof runRepositoryProvenanceWorkflow>>,
  profile: WorkflowProfile,
): boolean {
  let success = report.stages.validation.pass;
  if (profile === 'semantic-full' || profile === 'production-projection') {
    success =
      success &&
      report.stages.semantic.status === 'PROVEN' &&
      (report.stages.semantic.embeddedFiles ?? 0) > 0 &&
      (report.stages.semantic.heuristicFiles ?? 0) === 0;
  }
  return success;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Setup interrupt handling for graceful checkpointing
  const controller = new AbortController();
  const handleSignal = () => controller.abort();
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    const report = await runRepositoryProvenanceWorkflow({
      repoRoot: options.repoRoot,
      outputDir: options.outputDir,
      apply: options.apply,
      semanticSampleLimit: options.semanticSampleLimit,
      lexicalTokenLimit: options.lexicalTokenLimit,
      queryCorpusPath: options.queryCorpusPath ?? undefined,
      representationId: options.representationId ?? undefined,
      signal: controller.signal,
    });

    if (options.apply) {
      const docsDir = path.join(options.repoRoot, 'docs', 'reports');
      fs.mkdirSync(docsDir, { recursive: true });
      copyReport(
        report.outputs.latestReportPath,
        path.join(docsDir, 'phase109b-repository-provenance-workflow.json'),
      );
      copyReport(
        report.outputs.markdownReportPath,
        path.join(docsDir, 'phase109b-repository-provenance-workflow.md'),
      );
    }

    const success = evaluateWorkflowSuccess(report, options.profile);

    console.log(
      JSON.stringify(
        {
          runId: report.runId,
          repositoryRevision: report.repositoryRevision,
          profile: options.profile,
          requestedRepresentationId: options.representationId,
          snapshot: report.stages.snapshot,
          inventory: report.stages.inventory,
          structural: {
            status: report.stages.structural.status,
            factCount: report.stages.structural.factCount,
            filesWithStructure: report.stages.structural.filesWithStructure,
          },
          semantic: {
            status: report.stages.semantic.status,
            sampledFiles: report.stages.semantic.sampledFiles,
            embeddedFiles: report.stages.semantic.embeddedFiles,
            heuristicFiles: report.stages.semantic.heuristicFiles,
            representation: (report.stages.semantic as Record<string, unknown>).representation ?? null,
          },
          validation: report.stages.validation,
          evaluation: report.stages.evaluation,
          incremental: report.stages.incremental,
          outputs: report.outputs,
        },
        null,
        2,
      ),
    );

    process.exitCode = success ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message === 'Repository provenance workflow aborted') {
    process.exitCode = 130;
    return;
  }
  console.error('[phase109b] workflow failed:', error);
  process.exitCode = 1;
});
