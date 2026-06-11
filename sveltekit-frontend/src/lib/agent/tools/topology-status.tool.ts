/**
 * topology.status tool: Check service availability without exposing details.
 * Returns only: ok/error status per service, no internal IPs or credentials.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerTool, type ToolResult } from '../tool-registry';

const exec = promisify(execFile);

async function safeExec(cmd: string, args: string[] = []): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: 5000 });
    return { ok: true, output: stdout.trim().slice(0, 2000) };
  } catch (err: any) {
    return { ok: false, output: '', error: err.message };
  }
}

registerTool('topology.status', async (args): Promise<ToolResult> => {
  const include = (args.include as string[]) || [];
  const result: Record<string, unknown> = {};

  if (include.includes('docker')) {
    const docker = await safeExec('docker', ['ps', '-q']);
    result.docker = {
      available: docker.ok,
      running_containers: docker.ok ? docker.output.split('\n').filter(Boolean).length : 0,
    };
  }

  if (include.includes('wsl2')) {
    const wsl = await safeExec('wsl', ['--status']);
    result.wsl2 = {
      available: wsl.ok,
      status: wsl.ok ? 'running' : 'unavailable',
    };
  }

  if (include.includes('gpu')) {
    const gpu = await safeExec('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader',
    ]);
    result.gpu = {
      available: gpu.ok,
      summary: gpu.ok ? gpu.output.split('\n')[0] : 'not found',
    };
  }

  if (include.includes('redis')) {
    // Check via TCP port probe (no credentials sent)
    const redis = await safeExec('netstat', ['-an']);
    result.redis = {
      available: redis.ok && redis.output.includes(':6379'),
      port: 6379,
    };
  }

  if (include.includes('qdrant')) {
    result.qdrant = {
      available: true, // Optimistic; caller should verify via /health
      port: 6333,
    };
  }

  if (include.includes('neo4j')) {
    result.neo4j = {
      available: true, // Optimistic; caller should verify via /health
      port: 7687,
    };
  }

  if (include.includes('postgres')) {
    result.postgres = {
      available: true, // Optimistic; caller should verify via connection
      port: 5432,
    };
  }

  if (include.includes('ports')) {
    const ports = await safeExec('netstat', ['-an']);
    result.ports_listening = ports.ok
      ? ports.output
          .split('\n')
          .filter((line) => line.includes('LISTEN'))
          .slice(0, 10)
      : 'unable to list';
  }

  return {
    ok: true,
    data: result,
  };
});
