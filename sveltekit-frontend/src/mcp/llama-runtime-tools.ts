import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { z } from 'zod/v3';
import {
  LLAMA_PROFILES,
  llamaControlReceiptSchema,
  llamaNoInputSchema,
  llamaStartInputSchema,
  llamaSwitchInputSchema,
  llamaUnloadInputSchema,
  type LlamaControlAction,
  type LlamaControlProfile,
} from './llama-runtime-contracts.js';
import { createLlamaLifecycleGate, type LlamaLifecycleGate } from './llama-runtime-gate.js';

export type { LlamaControlAction, LlamaControlProfile } from './llama-runtime-contracts.js';

const executeFile = promisify(execFile);
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError: boolean };
type ToolServer = {
  registerTool(name: string, registration: {
    description: string;
    inputSchema: z.AnyZodObject;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  }, handler: (args: unknown) => Promise<ToolResult>): unknown;
};

export type LlamaControlRunner = (action: LlamaControlAction, profile?: LlamaControlProfile) => Promise<unknown>;

export const runLlamaControl: LlamaControlRunner = async (action, profile) => {
  if (process.platform !== 'win32') throw new Error('WINDOWS_RUNTIME_CONTROL_ONLY');
  const scriptPath = fileURLToPath(new URL('../../../scripts/atlas/llama-server-control.ps1', import.meta.url));
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', action];
  if (action !== 'status') args.push('-ConfirmControl', '-Caller', 'mcp-gate-v1');
  if ((action === 'start' || action === 'switch') && profile) args.push('-Profile', profile);
  // A switch may load twice (target, then rollback). Killing the controller mid-way would lose the rollback.
  const timeout = action === 'switch' ? 540_000 : 240_000;
  try {
    const { stdout } = await executeFile('pwsh', args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (stdout?.trim()) return llamaControlReceiptSchema.parse(JSON.parse(stdout.trim()));
    throw error;
  }
};

const text = (value: unknown, isError: boolean): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  isError,
});

const failure = (action: LlamaControlAction, error: string, serviceMutationPerformed: boolean | null) =>
  text({
    schema: 'atlas.llama-runtime-control.v1', action, port: 8090, status: 'ERROR',
    serviceMutationPerformed, before: null, after: null, memoryDeltas: [],
    memoryReleaseObserved: null, error,
  }, true);

export function registerLlamaRuntimeTools(
  server: unknown,
  runner: LlamaControlRunner = runLlamaControl,
  gate: LlamaLifecycleGate = createLlamaLifecycleGate(),
) {
  if (!server || typeof server !== 'object' || !('registerTool' in server) || typeof server.registerTool !== 'function') {
    throw new Error('MCP_TOOL_REGISTRATION_UNAVAILABLE');
  }
  const registerTool: ToolServer['registerTool'] = server.registerTool.bind(server);

  const invoke = async (action: LlamaControlAction, profile?: LlamaControlProfile) => {
    try {
      const receipt = llamaControlReceiptSchema.parse(await runner(action, profile));
      if (receipt.action !== action) throw new Error('RUNTIME_RECEIPT_ACTION_MISMATCH');
      return { result: text(receipt, receipt.status === 'ERROR'), receipt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RUNTIME_CONTROL_FAILED';
      return { result: failure(action, message, null), receipt: null };
    }
  };

  const mutate = async (action: Exclude<LlamaControlAction, 'status'>, profile: LlamaControlProfile | undefined) => {
    let grantNonce: string;
    try {
      const verdict = gate.authorize(action, profile ?? null);
      // `in` narrows the union even with this project's strict mode off. Anything without a grant is refused.
      if (!('grantNonce' in verdict)) {
        const reason = 'reason' in verdict ? verdict.reason : 'LIFECYCLE_GATE_FAILED';
        gate.audit({ action, profile: profile ?? null, outcome: 'REFUSED', reason, serviceMutationPerformed: false });
        return failure(action, reason, false);
      }
      grantNonce = verdict.grantNonce;
      // Recorded before acting, so an interrupted call still leaves a trace. A failed write blocks the action.
      gate.audit({ action, profile: profile ?? null, outcome: 'STARTED', grantNonce, serviceMutationPerformed: null });
    } catch (error) {
      return failure(action, error instanceof Error ? error.message : 'LIFECYCLE_GATE_FAILED', false);
    }
    const { result, receipt } = await invoke(action, profile);
    try {
      gate.audit({
        action, profile: profile ?? null, outcome: receipt?.status ?? 'UNKNOWN', grantNonce,
        serviceMutationPerformed: receipt?.serviceMutationPerformed ?? null, error: receipt?.error ?? null,
      });
    } catch (error) {
      // The action already ran: still return what happened.
      console.error('[llama-runtime] outcome audit write failed:', error);
    }
    return result;
  };

  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  const approval = 'Refused unless the operator has run scripts/atlas/grant-llama-lifecycle.ps1 for this exact request. Never run that script or write its grant file yourself.';

  registerTool('llama_server.status', {
    description: 'Read local llama-server :8090 ownership, health, idle slots, model ID, vision, the matching profile and NVIDIA used/free VRAM. Does not start or stop services.',
    inputSchema: llamaNoInputSchema,
    annotations: readOnly,
  }, async () => (await invoke('status')).result);

  registerTool('llama_server.profiles', {
    description: 'List the launch profiles (Gemma 4 and Ornith 1.5, text or vision) accepted by start and switch. Static list; loads nothing.',
    inputSchema: llamaNoInputSchema,
    annotations: readOnly,
  }, async () => text({ schema: 'atlas.llama-runtime-profiles.v1', profiles: LLAMA_PROFILES }, false));

  registerTool('llama_server.unload', {
    description: `Stop ONLY an idle llama-server owning :8090 to free VRAM, saving its profile for restore. Rejects busy slots, unexpected owners and unrecognised models; never force-kills. ${approval}`,
    inputSchema: llamaUnloadInputSchema,
    annotations: destructive,
  }, async (input) => {
    llamaUnloadInputSchema.parse(input);
    return mutate('unload', undefined);
  });

  registerTool('llama_server.start', {
    description: `Start llama-server :8090 when nothing is running; without a profile it restores the last unloaded one, else Gemma 4 text. Verifies model and vision. ${approval}`,
    inputSchema: llamaStartInputSchema,
    annotations: destructive,
  }, async (input) => mutate('start', llamaStartInputSchema.parse(input).profile));

  registerTool('llama_server.switch', {
    description: `Replace the model on :8090 in one locked operation: check target files exist, require idle slots, stop, load the target, verify it; if loading fails and the port is empty, restore the previous model. ${approval}`,
    inputSchema: llamaSwitchInputSchema,
    annotations: destructive,
  }, async (input) => mutate('switch', llamaSwitchInputSchema.parse(input).profile));
}
