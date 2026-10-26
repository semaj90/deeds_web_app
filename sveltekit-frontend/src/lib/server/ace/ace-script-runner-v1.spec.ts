import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { createAceScriptInvocationV1 } from './ace-script-runner-v1.js';

describe('createAceScriptInvocationV1', () => {
  it('keeps shell-significant query text in one argv element', () => {
    const query = '"; throw new Error("should remain data"); & `whoami`';
    const cwd = process.cwd();
    const invocation = createAceScriptInvocationV1('build-packet.mjs', query, cwd);

    expect(invocation.file).toBe(process.execPath);
    expect(invocation.args).toEqual([resolve(cwd, 'scripts', 'ace', 'build-packet.mjs'), query]);
    expect(invocation.options.shell).toBe(false);
  });

  it('allows only the two existing ACE script entrypoints', () => {
    expect(() => createAceScriptInvocationV1('../other.mjs' as never, 'query', 'C:\\repo'))
      .toThrow('ACE_SCRIPT_NOT_ALLOWED');
    expect(() => createAceScriptInvocationV1('ask-gemma4.mjs', '  ', 'C:\\repo'))
      .toThrow('ACE_QUERY_REQUIRED');
  });
});
