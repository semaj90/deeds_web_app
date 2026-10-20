import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const ACE_SCRIPT_NAMES = ['build-packet.mjs', 'ask-gemma4.mjs'] as const;

export type AceScriptNameV1 = (typeof ACE_SCRIPT_NAMES)[number];

export interface AceScriptInvocationV1 {
  file: string;
  args: [string, string];
  options: {
    cwd: string;
    encoding: 'utf8';
    shell: false;
    windowsHide: true;
  };
}

export function createAceScriptInvocationV1(
  scriptName: AceScriptNameV1,
  query: string,
  cwd = process.cwd(),
): AceScriptInvocationV1 {
  if (!(ACE_SCRIPT_NAMES as readonly string[]).includes(scriptName)) {
    throw new Error('ACE_SCRIPT_NOT_ALLOWED');
  }
  if (!query.trim()) throw new Error('ACE_QUERY_REQUIRED');

  return {
    file: process.execPath,
    args: [resolve(cwd, 'scripts', 'ace', scriptName), query],
    options: { cwd, encoding: 'utf8', shell: false, windowsHide: true },
  };
}

export async function runAceScriptV1(scriptName: AceScriptNameV1, query: string) {
  const invocation = createAceScriptInvocationV1(scriptName, query);
  return execFileAsync(invocation.file, invocation.args, invocation.options);
}
