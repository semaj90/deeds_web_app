import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function connectLdrMcpV1(env = process.env) {
  const child = spawn(process.execPath, [resolve(root, 'sveltekit-frontend/scripts/mcp/ldr-mcp.mjs')], {
    cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let sequence = 0;
  child.stderr.resume();
  const fail = () => {
    for (const waiter of pending.values()) waiter.reject(new Error('LDR_MCP_EXITED'));
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', fail);
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  function request(method, params) {
    return new Promise((resolveRequest, rejectRequest) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`LDR_MCP_TIMEOUT: ${method}`));
      }, 20000);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveRequest(value); },
        reject: (error) => { clearTimeout(timer); rejectRequest(error); },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  return {
    async initialize() {
      await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'atlas-ldr-report', version: '1.0.0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      return request('tools/list', {});
    },
    async call(name, args) {
      const result = await request('tools/call', { name, arguments: args });
      const value = JSON.parse(result.content.find((part) => part.type === 'text').text);
      if (result.isError || value.error) throw new Error(value.error ?? 'LDR_TOOL_FAILED');
      return value;
    },
    close() { fail(); lines.close(); child.stdin.end(); child.kill(); },
  };
}

export async function runLdrReportV1(args = process.argv.slice(2)) {
  const queryArg = args.find((arg) => arg.startsWith('--query='));
  const taskArg = args.find((arg) => arg.startsWith('--task-id='));
  if (args.some((arg) => !['--start', '--probe'].includes(arg) && !arg.startsWith('--query=') && !arg.startsWith('--task-id='))) throw new Error('Unknown argument');
  if (queryArg && (!args.includes('--start') || taskArg)) throw new Error('A query requires --start and cannot be combined with --task-id');
  if (args.includes('--start') && !queryArg) throw new Error('--start requires --query');
  const client = connectLdrMcpV1();
  const receipt = {
    schema: 'atlas.ldr.report.v1', executionId: randomUUID(), createdAt: new Date().toISOString(),
    query: queryArg?.slice(8) ?? null,
    status: 'NOT_EXECUTED', taskId: taskArg?.slice(10) ?? null,
    canonicalAuthority: false, canonicalWrites: false, researchStartAttempted: false,
    sourceRevisionDeferred: true, reportSha256: null,
  };
  let report = '';
  try {
    const listed = await client.initialize();
    receipt.tools = listed.tools.map((tool) => tool.name);
    if (queryArg) {
      receipt.researchStartAttempted = true;
      const started = await client.call('ldr.start_research', { query: queryArg.slice(8), max_iterations: 1, search_engines: ['searxng'] });
      receipt.taskId = started.taskId;
    }
    if (receipt.taskId) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const state = await client.call('ldr.poll_status', { taskId: receipt.taskId });
        receipt.researchStatus = state.status;
        if (state.status === 'completed') {
          const result = await client.call('ldr.get_report', { taskId: receipt.taskId });
          report = result.content;
          receipt.sourceCount = result.sources.length;
          receipt.status = 'UNREVIEWED_RESEARCH_EXPORTED';
          break;
        }
        if (['failed', 'error', 'cancelled', 'suspended'].includes(state.status)) throw new Error(`LDR_RESEARCH_${state.status}`);
        if (attempt < 11) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
      }
      if (!report) throw new Error('LDR_RESEARCH_PENDING: job may continue; resume with --task-id');
    } else {
      await client.call('ldr.search_history', { query: 'repository decomposition', limit: 1 });
      receipt.status = 'MCP_AND_HISTORY_REACHABLE';
    }
  } catch (error) {
    receipt.status = 'BLOCKED';
    receipt.error = error.message;
  } finally { client.close(); }
  if (!report) report = `# Parent Atlas LDR execution\n\nStatus: **${receipt.status}**\n\n${receipt.error ?? 'MCP and authenticated history reachable; no research started.'}\n\nNo LDR-generated research is claimed. No canonical Atlas writes were performed.\n`;
  const payload = `> Unreviewed derived research/diagnostic. Not canonical source evidence. Execution: ${receipt.executionId}.\n\n${report}`;
  receipt.reportSha256 = createHash('sha256').update(payload).digest('hex');
  const output = resolve(root, 'docs/ldr');
  const basename = `ldr-${receipt.createdAt.replace(/[:.]/g, '-')}-${receipt.executionId}`;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, `${basename}.md`), payload, { flag: 'wx' });
  await writeFile(resolve(output, `${basename}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...receipt, reportPath: resolve(output, `${basename}.md`) }, null, 2));
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLdrReportV1().then((receipt) => { if (receipt.status === 'BLOCKED') process.exitCode = 1; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
