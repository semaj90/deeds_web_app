/**
 * Shared canonical Ornith/llama-server adapter for the Workstation
 * synthesis boundary. Both the dry-run discovery script and the live
 * fixture-generation script delegate to this one owner instead of each
 * carrying its own model-discovery/SSE-parsing implementation.
 *
 * Discovery-only usage (dry-run) and generation usage (fixture proof) both
 * go through discoverOrnithModel(); only the fixture path also calls
 * streamChatCompletion().
 */
import crypto from 'node:crypto';

export const ORNITH_ALLOWLIST_PATTERN = /^ornith-1\.5(?:-|$)/i;

/**
 * Discover the loaded model set at the given llama-server endpoint and
 * resolve exactly one allowlisted ornith-1.5* model.
 * Throws on: unreachable endpoint, empty model list, zero or >1 allowlisted
 * models. Never falls back to a different model family.
 */
export async function discoverOrnithModel(endpoint, { timeoutMs = 5000 } = {}) {
  const response = await fetch(`${endpoint}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`MODEL_DISCOVERY_HTTP_${response.status}`);
  const body = await response.json();
  const modelIds = Array.isArray(body?.data) ? body.data.map((item) => String(item?.id ?? '')).filter(Boolean) : [];
  if (modelIds.length === 0) throw new Error('NO_LOADED_MODEL');
  const allowed = modelIds.filter((id) => ORNITH_ALLOWLIST_PATTERN.test(id));
  if (allowed.length === 0) throw new Error(`ORNITH_MODEL_NOT_LOADED:${modelIds.join(',')}`);
  if (allowed.length > 1) throw new Error(`AMBIGUOUS_ORNITH_MODELS:${allowed.join(',')}`);
  return { modelIds, loadedModel: allowed[0] };
}

/**
 * One bounded, real streamed chat completion against the resolved model.
 * Always stream:true per this repo's canonical llama-server rule. Returns
 * the assembled content, the last observed finish_reason, and checksums of
 * the exact request/response bytes -- treat these as an execution receipt,
 * not a cross-run determinism guarantee (model/runtime output need not be
 * bit-identical across executions even for a fixed prompt).
 */
export async function streamChatCompletion(endpoint, model, messages, { maxTokens = 32, temperature = 0, timeoutMs = 90_000 } = {}) {
  const requestBody = { model, messages, max_tokens: maxTokens, temperature, stream: true };
  const requestChecksum = sha256(JSON.stringify(requestBody));
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error(`GENERATION_HTTP_${response.status}`);

  const decoder = new TextDecoder();
  let buf = '';
  let assembled = '';
  let finishReason = null;
  let rawEventBytes = '';
  for await (const chunk of response.body) {
    const decoded = decoder.decode(chunk, { stream: true });
    rawEventBytes += decoded;
    buf += decoded;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        assembled += parsed.choices?.[0]?.delta?.content ?? '';
        finishReason = parsed.choices?.[0]?.finish_reason ?? finishReason;
      } catch {
        // skip malformed SSE line
      }
    }
  }
  assembled = assembled.trim();
  return {
    assembled,
    finishReason,
    streamed: true,
    requestChecksum,
    responseChecksum: sha256(rawEventBytes),
  };
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
