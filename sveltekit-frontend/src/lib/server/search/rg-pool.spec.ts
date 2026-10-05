// @vitest-environment node
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawn: spawnMock }));
vi.mock('$lib/server/logging', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { getRgPool } from './rg-pool';

function fakeProc(exitCode: number, stdout = '', stderr = '') {
  const proc: any = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 1;
  proc.kill = vi.fn();
  setImmediate(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('exit', exitCode);
  });
  return proc;
}

const match = JSON.stringify({ type: 'match', data: { path: { text: 'a.ts' }, line_number: 3, lines: { text: 'x' }, submatches: [{ start: 0, match: { text: 'x' } }] } });

describe('rg-pool command construction and failure semantics (KERNEL-REAL-02 blocker 2)', () => {
  beforeEach(() => spawnMock.mockReset());

  it('emits --fixed-strings with -e and never --literal; dash-leading queries stay a pattern', async () => {
    spawnMock.mockReturnValue(fakeProc(0, match + '\n'));
    await getRgPool().search({ query: '-dash-query', type: 'ts', cwd: '.' });
    const args: string[] = spawnMock.mock.calls[0]![1];
    expect(args).toContain('--fixed-strings');
    expect(args).not.toContain('--literal');
    expect(args[args.indexOf('-e') + 1]).toBe('-dash-query');
  });

  it('exit 0 with matches returns hits; exit 1 (no matches) returns []', async () => {
    spawnMock.mockReturnValueOnce(fakeProc(0, match + '\n'));
    expect(await getRgPool().search({ query: 'x', cwd: '.' })).toHaveLength(1);
    spawnMock.mockReturnValueOnce(fakeProc(1));
    expect(await getRgPool().search({ query: 'x', cwd: '.' })).toEqual([]);
  });

  it('rg exit 2 (execution/flag error) rejects instead of looking like zero hits', async () => {
    spawnMock.mockReturnValue(fakeProc(2, '', 'rg: unrecognized flag --literal'));
    await expect(getRgPool().search({ query: 'x', cwd: '.' })).rejects.toThrow(/rg exited with code 2/);
  });
});
