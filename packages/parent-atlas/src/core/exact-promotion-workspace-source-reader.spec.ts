import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceExactPromotionSourceReader } from './exact-promotion-workspace-source-reader.js';

const roots: string[] = [];
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('workspace exact promotion source reader', () => {
  it('hashes full file and exact UTF-8 byte span independently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-exact-promotion-'));
    roots.push(root);
    await mkdir(path.join(root, 'src'), { recursive: true });
    const bytes = Buffer.from('const π = 3.14;\n', 'utf8');
    await writeFile(path.join(root, 'src', 'math.ts'), bytes);

    const start = Buffer.from('const ', 'utf8').byteLength;
    const end = start + Buffer.from('π', 'utf8').byteLength;
    const reader = createWorkspaceExactPromotionSourceReader(root);
    const result = await reader({ source_ref: 'src/math.ts', span_start: start, span_end: end });

    expect(result.file_found).toBe(true);
    expect(result.span_found).toBe(true);
    expect(result.file_sha256).toBe(hash(bytes));
    expect(result.span_sha256).toBe(hash(Buffer.from('π', 'utf8')));
    expect(result.span_byte_length).toBe(2);
  });

  it('rejects traversal and spans outside the file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-exact-promotion-'));
    roots.push(root);
    await writeFile(path.join(root, 'file.ts'), 'abc', 'utf8');
    const reader = createWorkspaceExactPromotionSourceReader(root);

    expect((await reader({ source_ref: '../outside.ts', span_start: 0, span_end: 1 })).file_found).toBe(false);
    expect((await reader({ source_ref: 'file.ts', span_start: 0, span_end: 99 })).file_found).toBe(false);
  });
});
