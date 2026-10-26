import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod/v3';

const executeFile = promisify(execFile);
const actionSchema = z.enum(['status', 'start', 'unload']);
const profileSchema = z.enum(['ornith-1.5', 'ornith-1.5-vlm']);
const startSchema = z.object({ confirm: z.literal(true), profile: profileSchema.default('ornith-1.5') }).strict();
const unloadSchema = z.object({ confirm: z.literal(true) }).strict();
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError: boolean };
type ToolServer = {
  registerTool(name: string, registration: {
    description: string;
    inputSchema: z.AnyZodObject;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  }, handler: (args: unknown) => Promise<ToolResult>): unknown;
};
const receiptSchema = z.object({
  schema: z.literal('atlas.llama-runtime-control.v1'),
  action: actionSchema,
  port: z.literal(8090),
  status: z.enum(['ERROR', 'RUNNING', 'STOPPED', 'UNHEALTHY', 'ALREADY_RUNNING']),
  serviceMutationPerformed: z.boolean(),
  before: z.unknown(),
  after: z.unknown(),
  memoryDeltas: z.array(z.object({ uuid: z.string(), usedMiBChange: z.number(), freeMiBChange: z.number() })),
  memoryReleaseObserved: z.boolean().nullable(),
  error: z.string().nullable(),
});

export type LlamaControlAction = z.infer<typeof actionSchema>;
export type LlamaControlProfile = z.infer<typeof profileSchema>;
export type LlamaControlRunner = (action: LlamaControlAction, profile?: LlamaControlProfile) => Promise<unknown>;

export const runLlamaControl: LlamaControlRunner = async (action, profile = 'ornith-1.5') => {
  if (process.platform !== 'win32') throw new Error('WINDOWS_RUNTIME_CONTROL_ONLY');
  const scriptPath = fileURLToPath(new URL('../../../scripts/atlas/llama-server-control.ps1', import.meta.url));
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', action];
  if (action !== 'status') args.push('-ConfirmControl');
  if (action === 'start') args.push('-Profile', profile);
  try {
    const { stdout } = await executeFile('pwsh', args, { windowsHide: true, timeout: 240_000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (stdout?.trim()) return receiptSchema.parse(JSON.parse(stdout.trim()));
    throw error;
  }
};

export function registerLlamaRuntimeTools(server: unknown, runner: LlamaControlRunner = runLlamaControl) {
  if (!server || typeof server !== 'object' || !('registerTool' in server) || typeof server.registerTool !== 'function') {
    throw new Error('MCP_TOOL_REGISTRATION_UNAVAILABLE');
  }
  const registerTool: ToolServer['registerTool'] = server.registerTool.bind(server);
  const invoke = async (action: LlamaControlAction, profile?: LlamaControlProfile) => {
    try {
      const receipt = receiptSchema.parse(await runner(action, profile));
      if (receipt.action !== action) throw new Error('RUNTIME_RECEIPT_ACTION_MISMATCH');
      return { content: [{ type: 'text' as const, text: JSON.stringify(receipt) }], isError: receipt.status === 'ERROR' };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          schema: 'atlas.llama-runtime-control.v1', action, port: 8090, status: 'ERROR',
          serviceMutationPerformed: null, before: null, after: null, memoryDeltas: [],
          memoryReleaseObserved: null, error: error instanceof Error ? error.message : 'RUNTIME_CONTROL_FAILED',
        }) }],
        isError: true,
      };
    }
  };
  registerTool('llama_server.status', {
    description: 'Read local Ornith :8090 ownership, health, idle slots, model ID, and NVIDIA used/free VRAM. Does not start or stop services.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => invoke('status'));
  registerTool('llama_server.start', {
    description: 'Operator-approved start of Ornith :8090 using the existing launcher with NoEvict. Never unloads Ollama or automatically restarts an existing server. Obtain explicit user approval before confirm=true.',
    inputSchema: startSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async (input) => {
    const { profile } = startSchema.parse(input);
    return invoke('start', profile);
  });
  registerTool('llama_server.unload', {
    description: 'Operator-approved stop of ONLY an idle llama-server owning :8090. Rejects busy/unknown slots and unexpected owners; verifies shutdown and reports VRAM deltas without force-killing. Obtain explicit user approval before confirm=true.',
    inputSchema: unloadSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async (input) => {
    unloadSchema.parse(input);
    return invoke('unload');
  });
}
