import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanDirectorySync } from './directory-scanner.js';

describe('directory scanner admission policy', () => {
  it('excludes generated, virtualenv, and agent roots by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-scanner-'));
    try {
      await writeFile(join(root, 'approved.ts'), 'export const approved = true;');
      for (const dir of ['.cache', '.agent', '.venv-cu130', '.venv-gemma4', '.python311', '.svelte-error-fixes-backup']) {
        await mkdir(join(root, dir), { recursive: true });
        await writeFile(join(root, dir, 'leak.ts'), 'export const generated = true;');
      }

      const files = await scanDirectorySync({ rootPath: root, gitIgnoreMode: 'off' });

      expect(files.map((file) => file.relativePath.replaceAll('\\', '/'))).toEqual(['approved.ts']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps nested Parent Atlas core source visible under the root crash-dump rule', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-scanner-core-'));
    try {
      await mkdir(join(root, 'packages', 'parent-atlas', 'src', 'core'), { recursive: true });
      await writeFile(join(root, 'packages', 'parent-atlas', 'src', 'core', 'contract.ts'), 'export const contract = true;');
      await mkdir(join(root, 'crates'), { recursive: true });
      await writeFile(join(root, 'crates', 'generated.rs'), 'pub fn generated() {}');

      const files = await scanDirectorySync({ rootPath: root, gitIgnoreMode: 'off' });

      expect(files.map((file) => file.relativePath.replaceAll('\\', '/'))).toEqual([
        'packages/parent-atlas/src/core/contract.ts',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes Windows paths before applying slash-form gitignore rules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-scanner-gitignore-'));
    try {
      await mkdir(join(root, 'tools', 'agentic-research', 'src'), { recursive: true });
      await writeFile(join(root, '.gitignore'), 'tools/agentic-research/src/\n');
      await writeFile(join(root, 'tools', 'agentic-research', 'src', 'ignored.ts'), 'export const ignored = true;');
      await writeFile(join(root, 'kept.ts'), 'export const kept = true;');

      const files = await scanDirectorySync({ rootPath: root, gitIgnoreMode: 'strict' });

      expect(files.map((file) => file.relativePath.replaceAll('\\', '/'))).toEqual(['kept.ts']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
