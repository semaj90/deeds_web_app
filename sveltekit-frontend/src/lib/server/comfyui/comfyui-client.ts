/**
 * comfyui-client.ts — minimal HTTP bridge to a running ComfyUI instance.
 *
 * Pure HTTP — no GLB processing, no DB writes, no queue publishing, no
 * model downloads. The bridge is just enough for an API route or smoke
 * script to:
 *   1. Probe ComfyUI's reachability.
 *   2. Submit a `workflow_api.json` payload (POST /prompt).
 *   3. Poll history (GET /history/<id>).
 *   4. Build a /view URL for a generated output file.
 *   5. Optionally wait until a prompt completes (with a timeout).
 *
 * Phase 0 of the ComfyUI integration. Subsequent phases add:
 *   - RabbitMQ `comfyui.render` queue producer (NOT here)
 *   - TRELLIS image→GLB workflow file (NOT here — operator drops it in)
 *   - GLB → MinIO upload + `evidence_3d_assets` row (NOT here)
 *   - Drag-drop canvas UI (NOT here)
 *
 * Env contract:
 *   COMFYUI_BASE_URL — default http://127.0.0.1:8188
 *
 * Failure mode: every method either resolves with a structured object
 * containing `ok:false` + `error` (for caller-handled degradation) or
 * throws a `ComfyUIError` for programmer errors (bad arguments). Network
 * unreachable / non-2xx is NEVER thrown — it returns a degraded result
 * so API routes can return 200 with `ok:false` instead of 500.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8188';

export class ComfyUIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComfyUIError';
  }
}

export interface HealthResult {
  ok:        boolean;
  baseUrl:   string;
  reachable: boolean;
  /** queue running + pending counts when /queue is reachable */
  queue?: {
    running: number;
    pending: number;
  };
  error?: string;
}

export interface SubmitResult {
  ok:        boolean;
  prompt_id: string | null;
  /** ComfyUI returns "node_errors" for graph validation errors, "error" for global */
  node_errors?: unknown;
  error?:    string;
}

export interface HistoryResult {
  ok:     boolean;
  done:   boolean;
  status?: 'running' | 'queued' | 'completed' | 'unknown';
  outputs?: Record<string, unknown>;
  error?:  string;
}

export interface ViewUrl {
  url:       string;
  filename:  string;
  subfolder: string;
  type:      'output' | 'temp' | 'input';
}

export interface ComfyUIClientOptions {
  baseUrl?:        string;
  defaultTimeout?: number; // ms — applies to single-request operations
}

export class ComfyUIClient {
  readonly baseUrl: string;
  private readonly defaultTimeout: number;

  constructor(opts: ComfyUIClientOptions = {}) {
    this.baseUrl        = (opts.baseUrl ?? process.env.COMFYUI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.defaultTimeout = opts.defaultTimeout ?? 5000;
  }

  /**
   * Probe reachability via /system_stats (cheap, always present) and
   * /queue (returns running + pending counts). Returns degraded
   * result on any network or non-2xx outcome.
   */
  async healthCheck(): Promise<HealthResult> {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), this.defaultTimeout);
      const res  = await fetch(`${this.baseUrl}/system_stats`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        return { ok: false, baseUrl: this.baseUrl, reachable: false, error: `HTTP ${res.status}` };
      }
      // Best-effort queue probe — failure is non-fatal, just omits the field.
      let queue: HealthResult['queue'] | undefined;
      try {
        const qCtrl = new AbortController();
        const qT    = setTimeout(() => qCtrl.abort(), this.defaultTimeout);
        const qRes  = await fetch(`${this.baseUrl}/queue`, { signal: qCtrl.signal });
        clearTimeout(qT);
        if (qRes.ok) {
          const q = await qRes.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
          queue = {
            running: Array.isArray(q.queue_running) ? q.queue_running.length : 0,
            pending: Array.isArray(q.queue_pending) ? q.queue_pending.length : 0,
          };
        }
      } catch { /* swallow */ }
      return { ok: true, baseUrl: this.baseUrl, reachable: true, queue };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, baseUrl: this.baseUrl, reachable: false, error: msg };
    }
  }

  /**
   * Submit a workflow to /prompt. `workflowApiJson` is the object exported
   * from ComfyUI Desktop via "Save (API Format)" / "Export (API)". Caller
   * may pass a `client_id` (any short string) so /history can be filtered
   * later.
   */
  async submitPrompt(workflowApiJson: unknown, clientId?: string): Promise<SubmitResult> {
    if (!workflowApiJson || typeof workflowApiJson !== 'object') {
      throw new ComfyUIError('submitPrompt: workflowApiJson must be an object exported from ComfyUI "Save (API Format)"');
    }
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), this.defaultTimeout);
      const body = JSON.stringify({
        prompt:    workflowApiJson,
        client_id: clientId ?? `deeds-${Date.now()}`,
      });
      const res  = await fetch(`${this.baseUrl}/prompt`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  ctrl.signal,
      });
      clearTimeout(t);
      const text = await res.text();
      let json: unknown;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok) {
        return { ok: false, prompt_id: null, node_errors: (json as { node_errors?: unknown })?.node_errors, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const promptId = (json as { prompt_id?: unknown }).prompt_id;
      if (typeof promptId !== 'string' || promptId.length === 0) {
        return { ok: false, prompt_id: null, error: 'ComfyUI did not return a prompt_id', node_errors: (json as { node_errors?: unknown })?.node_errors };
      }
      return { ok: true, prompt_id: promptId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, prompt_id: null, error: msg };
    }
  }

  /**
   * Fetch /history/<promptId>. ComfyUI returns an empty object while the
   * prompt is still in the queue, and a populated record once execution
   * finishes. We normalize that into `{ ok, done, status, outputs }`.
   */
  async getHistory(promptId: string): Promise<HistoryResult> {
    if (!promptId || typeof promptId !== 'string') {
      throw new ComfyUIError('getHistory: promptId must be a non-empty string');
    }
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), this.defaultTimeout);
      const res  = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        return { ok: false, done: false, error: `HTTP ${res.status}` };
      }
      const json = await res.json() as Record<string, unknown>;
      const entry = json[promptId] as { outputs?: Record<string, unknown>; status?: { status_str?: string } } | undefined;
      if (!entry) return { ok: true, done: false, status: 'queued' };
      const outputs = entry.outputs ?? {};
      const statusStr = entry.status?.status_str;
      const done = Object.keys(outputs).length > 0 || statusStr === 'success' || statusStr === 'error';
      return {
        ok:     true,
        done,
        status: done ? 'completed' : 'running',
        outputs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, done: false, error: msg };
    }
  }

  /**
   * Build a /view URL pointing at a generated file. Pure string assembly
   * — no network call. Caller fetches the URL directly to download the
   * image / GLB / video produced by the workflow.
   */
  getViewUrl(filename: string, subfolder = '', type: ViewUrl['type'] = 'output'): ViewUrl {
    if (!filename) throw new ComfyUIError('getViewUrl: filename is required');
    const params = new URLSearchParams({ filename, subfolder, type });
    return {
      url:       `${this.baseUrl}/view?${params.toString()}`,
      filename, subfolder, type,
    };
  }

  /**
   * Poll /history every `pollIntervalMs` until the prompt completes or
   * `timeoutMs` elapses. Returns the final HistoryResult either way.
   * Default: 60-second timeout, 1-second poll.
   */
  async waitForCompletion(
    promptId: string,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<HistoryResult> {
    const timeoutMs      = opts.timeoutMs      ?? 60_000;
    const pollIntervalMs = opts.pollIntervalMs ?? 1000;
    const deadline       = Date.now() + timeoutMs;
    let last: HistoryResult = { ok: false, done: false, error: 'no poll attempt yet' };
    while (Date.now() < deadline) {
      last = await this.getHistory(promptId);
      if (!last.ok)   return last;
      if (last.done)  return last;
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    return { ok: false, done: false, status: last.status, outputs: last.outputs, error: `waitForCompletion: timeout after ${timeoutMs}ms` };
  }
}

/** Default singleton bound to env at import time. Use `new ComfyUIClient()` for tests. */
export const comfyui = new ComfyUIClient();
