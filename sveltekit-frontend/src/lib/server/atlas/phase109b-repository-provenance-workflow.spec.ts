// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workflowModulePromise = import('../../../../../scripts/atlas/phase109b-repository-provenance-workflow.mts');

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    stages: {
      validation: { pass: true },
      semantic: {
        status: 'PROVEN',
        embeddedFiles: 1,
        heuristicFiles: 0,
      },
    },
    ...overrides,
  };
}

describe('phase109b repository provenance workflow wrapper', () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    while (createdPaths.length > 0) {
      const target = createdPaths.pop();
      if (!target || !fs.existsSync(target)) continue;
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it('parses repo root before resolving relative output and corpus paths', async () => {
    const mod = await workflowModulePromise;
    const repoRoot = makeTempDir('phase109b-cli-');
    createdPaths.push(repoRoot);

    const options = mod.parseArgs([
      `--repo-root=${repoRoot}`,
      '--output-dir=reports',
      '--query-corpus=fixtures/queries.json',
      '--sample-limit=8',
      '--lexical-token-limit=64',
      '--representation-id=semantic_768',
      '--profile=production-projection',
    ]);

    expect(options.repoRoot).toBe(repoRoot);
    expect(options.outputDir).toBe(path.join(repoRoot, 'reports'));
    expect(options.queryCorpusPath).toBe(path.join(repoRoot, 'fixtures', 'queries.json'));
    expect(options.semanticSampleLimit).toBe(8);
    expect(options.lexicalTokenLimit).toBe(64);
    expect(options.representationId).toBe('semantic_768');
    expect(options.profile).toBe('production-projection');
    expect(options.apply).toBe(false);
  });

  it('rejects unknown flags and invalid numeric bounds', async () => {
    const mod = await workflowModulePromise;

    expect(() => mod.parseArgs(['--unknown-flag=1'])).toThrow('Unknown argument: --unknown-flag=1');
    expect(() => mod.parsePositiveInteger('0', 'sample-limit', 24, 100_000)).toThrow(
      'sample-limit must be between 1 and 100000, received 0',
    );
    expect(() => mod.parsePositiveInteger('abc', 'lexical-token-limit', 32, 4_096)).toThrow(
      'lexical-token-limit must be a positive integer, received "abc"',
    );
    expect(() => mod.parseProfile('not-a-profile')).toThrow('Unknown workflow profile: not-a-profile');
  });

  it('applies profile-aware success rules', async () => {
    const mod = await workflowModulePromise;

    expect(mod.evaluateWorkflowSuccess(makeReport(), 'semantic-sample')).toBe(true);
    expect(
      mod.evaluateWorkflowSuccess(
        makeReport({
          stages: {
            validation: { pass: true },
            semantic: {
              status: 'PROVEN',
              embeddedFiles: 1,
              heuristicFiles: 0,
            },
          },
        }),
        'semantic-full',
      ),
    ).toBe(true);
    expect(
      mod.evaluateWorkflowSuccess(
        makeReport({
          stages: {
            validation: { pass: true },
            semantic: {
              status: 'PARTIAL',
              embeddedFiles: 1,
              heuristicFiles: 0,
            },
          },
        }),
        'production-projection',
      ),
    ).toBe(false);
    expect(
      mod.evaluateWorkflowSuccess(
        makeReport({
          stages: {
            validation: { pass: true },
            semantic: {
              status: 'PROVEN',
              embeddedFiles: 1,
              heuristicFiles: 1,
            },
          },
        }),
        'production-projection',
      ),
    ).toBe(false);
  });

  it('copies reports atomically and skips self copies', async () => {
    const mod = await workflowModulePromise;
    const dir = makeTempDir('phase109b-copy-');
    createdPaths.push(dir);

    const source = path.join(dir, 'source.json');
    const destination = path.join(dir, 'nested', 'report.json');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(source, JSON.stringify({ ok: true }));

    mod.copyReport(source, destination);

    expect(fs.readFileSync(destination, 'utf8')).toBe('{"ok":true}');
    expect(() => mod.copyReport(destination, destination)).not.toThrow();
    expect(fs.readFileSync(destination, 'utf8')).toBe('{"ok":true}');
  });
});
