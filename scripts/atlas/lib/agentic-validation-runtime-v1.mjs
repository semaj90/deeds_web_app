export function parseMcpResponseV1(body) {
  const text = String(body ?? '').trim();
  if (!text) throw new Error('MCP_RESPONSE_EMPTY');
  const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith('data:'));
  const candidates = dataLines.length > 0
    ? dataLines.map((line) => line.slice(5).trim()).filter(Boolean)
    : [text];

  for (const candidate of candidates) {
    if (candidate === '[DONE]') continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error('MCP_RESPONSE_INVALID_JSON');
}

export function extractMcpTextV1(result) {
  if (result?.isError) throw new Error('MCP_TOOL_REPORTED_ERROR');
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks.find((block) => block?.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('MCP_TOOL_TEXT_MISSING');
  return text;
}

export function validateMiniforgeHealthV1(value) {
  if (value?.status !== 'success' || value?.ready !== true) {
    throw new Error('MINIFORGE_NLP_NOT_READY');
  }

  let sidecarUrl;
  try {
    sidecarUrl = new URL(value.sidecar_url);
  } catch {
    throw new Error('MINIFORGE_SIDECAR_URL_INVALID');
  }
  if (sidecarUrl.port !== '8095') throw new Error('MINIFORGE_SIDECAR_PORT_MISMATCH');

  const capabilities = value.capabilities && typeof value.capabilities === 'object'
    ? Object.fromEntries(
      Object.entries(value.capabilities).filter(([, enabled]) => typeof enabled === 'boolean'),
    )
    : null;

  return {
    sidecarUrl: sidecarUrl.origin,
    model: typeof value.model === 'string' ? value.model : null,
    capabilities,
  };
}

export function assertNoCommittedMcpWritesV1(result) {
  const receipt = result?.read_only_side_effect_receipt;
  if (!receipt || receipt.executionMode !== 'READ_ONLY') {
    throw new Error('READ_ONLY_SIDE_EFFECT_RECEIPT_MISSING');
  }
  if (receipt.committedWrites !== 0) throw new Error('MCP_COMMITTED_WRITES_DETECTED');
  return {
    attemptedWrites: Number.isInteger(receipt.attemptedWrites) ? receipt.attemptedWrites : null,
    committedWrites: receipt.committedWrites,
  };
}

export function classifyAgenticRuntimeStatusV1(input = {}) {
  if (input.failed === true) return 'FAIL';
  if (input.blocked === true) return 'BLOCKED';
  if (input.liveVerified === true) return 'LIVE_VERIFIED';
  if (input.mockOnly === true) return 'MOCK_ONLY';
  if (input.configured === true) return 'CONFIGURED';
  return 'NOT_RUN';
}

export function buildAgenticValidationReceiptV1(input) {
  const traceUrl = new URL(input.traceUrl);
  if (traceUrl.port !== '8788') throw new Error('TRACE_MCP_PORT_MISMATCH');
  if (!Number.isInteger(input.retrievalHits) || input.retrievalHits < 0) {
    throw new Error('TRACE_RETRIEVAL_HIT_COUNT_INVALID');
  }
  if (input.readOnlyEffects?.committedWrites !== 0) throw new Error('MCP_COMMITTED_WRITES_DETECTED');
  let sidecarUrl;
  try { sidecarUrl = new URL(input.health?.sidecarUrl); } catch { throw new Error('MINIFORGE_SIDECAR_URL_INVALID'); }
  if (sidecarUrl.port !== '8095') throw new Error('MINIFORGE_SIDECAR_PORT_MISMATCH');

  return {
    schema: 'atlas.agentic-validation-runtime.v1',
    verificationScope: 'HEALTH_AND_READ_ONLY_TOOL_ROUTING',
    traceMcp: {
      status: classifyAgenticRuntimeStatusV1({ configured: true, liveVerified: true }),
      endpoint: traceUrl.origin,
      toolCalls: ['atlas.query', 'miniforge.health'],
      retrievalHits: input.retrievalHits,
    },
    nlpSidecar: {
      status: classifyAgenticRuntimeStatusV1({ configured: true, liveVerified: true }),
      endpoint: sidecarUrl.origin,
      model: input.health.model,
      capabilities: input.health.capabilities,
      capabilitiesStatus: input.health.capabilities
        ? classifyAgenticRuntimeStatusV1({ configured: true, liveVerified: true })
        : classifyAgenticRuntimeStatusV1({ blocked: true }),
      capabilitiesBlocker: input.health.capabilities ? null : 'CAPABILITIES_NOT_RETURNED',
    },
    effects: {
      executionMode: 'READ_ONLY',
      attemptedWrites: input.readOnlyEffects.attemptedWrites,
      committedWrites: 0,
    },
    review: {
      status: 'ADVISORY_ONLY',
      humanApproval: 'NOT_GRANTED',
    },
    canonicalAuthority: false,
  };
}
