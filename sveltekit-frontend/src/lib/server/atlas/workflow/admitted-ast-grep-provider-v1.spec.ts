import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readConfinedRepositorySourceBytesV1 } from './admitted-ast-grep-provider-v1.js';

describe('readConfinedRepositorySourceBytesV1', () => {
  let repositoryRoot: string | undefined;

  afterEach(async () => {
    if (repositoryRoot) await rm(repositoryRoot, { recursive: true, force: true });
    repositoryRoot = undefined;
  });

  it('returns exact file bytes for a contained relative source reference', async () => {
    repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-admitted-source-'));
    const sourcePath = path.join(repositoryRoot, 'src', 'sample.ts');
    const expected = Buffer.from([0x61, 0x00, 0xc3, 0xa9, 0x0a]);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, expected);

    const actual = await readConfinedRepositorySourceBytesV1(repositoryRoot, 'src/sample.ts');

    expect(Buffer.from(actual)).toEqual(await readFile(sourcePath));
    expect(Buffer.from(actual)).toEqual(expected);
  });

  it('rejects traversal and absolute paths before reading outside the repository', async () => {
    repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-admitted-source-'));

    await expect(readConfinedRepositorySourceBytesV1(repositoryRoot, '../outside.ts'))
      .rejects.toThrow('AST_GREP_SOURCE_PATH_NOT_CONTAINED');
    await expect(readConfinedRepositorySourceBytesV1(repositoryRoot, path.resolve(repositoryRoot, 'outside.ts')))
      .rejects.toThrow('AST_GREP_SOURCE_PATH_NOT_CONTAINED');
  });
});
