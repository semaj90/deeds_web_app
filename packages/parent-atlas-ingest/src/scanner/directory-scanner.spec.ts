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
});
