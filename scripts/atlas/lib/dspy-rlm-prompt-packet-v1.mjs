/**
 * dspy-rlm-prompt-packet-v1.mjs
 *
 * Linked-list prompt node index and RTX array RPC packet builder for:
 * 1. DSPy / RLM contextual prompt compilation.
 * 2. Multi-turn AI chat RNN / SSM memory state.
 * 3. 64-byte aligned SharedArrayBuffer / CSR packet descriptor synthesis.
 * 4. Alignment with :8090 llama-server (Ornith 1.5-9b) with busy detection and
 *    LangExtract (:8095) / Colab GPU fallback routing.
 *
 * Schema: 'atlas.dspy-rlm-prompt-packet.v1'
 */

import { createHash } from 'node:crypto';

export const PROMPT_PACKET_SCHEMA = 'atlas.dspy-rlm-prompt-packet.v1';
export const RPC_PACKET_ALIGNMENT_BYTES = 64;

export function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex');
}

/**
 * Creates a new prompt context chain (doubly-linked list).
 */
export function createPromptContextChain({ chainId, domain = 'LEGAL_CIVIL', maxTokens = 8192 } = {}) {
  return {
    schema: PROMPT_PACKET_SCHEMA,
    chainId: chainId ?? `chain_${createHash('sha256').update(String(Date.now()), 'utf8').digest('hex').slice(0, 16)}`,
    domain,
    maxTokens,
    headId: null,
    tailId: null,
    nodeCount: 0,
    nodes: new Map(), // nodeId -> node
    canonicalAuthority: false,
  };
}

/**
 * Appends a conversation turn or retrieved ACE packet to the chain.
 */
export function appendPromptNode(chain, {
  role = 'user', // 'system' | 'user' | 'assistant' | 'context'
  content,
  sourceRefs = [],
  lspRange = null,
  acePacketRef = null,
  featureLabel = null,
  metadata = {},
}) {
  if (typeof content !== 'string') {
    throw new TypeError('content must be a string');
  }

  const turnIndex = chain.nodeCount;
  const nodeId = `node_${chain.chainId}_${turnIndex.toString().padStart(4, '0')}`;
  const prevId = chain.tailId;

  const node = {
    id: nodeId,
    chainId: chain.chainId,
    turnIndex,
    role,
    content,
    sourceRefs: Array.isArray(sourceRefs) ? [...sourceRefs] : [],
    lspRange: lspRange ? { ...lspRange } : null,
    acePacketRef: acePacketRef ?? null,
    featureLabel: featureLabel ?? null,
    prevId,
    nextId: null,
    createdAt: new Date().toISOString(),
    contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    metadata: { ...metadata },
  };

  if (prevId && chain.nodes.has(prevId)) {
    const prevNode = chain.nodes.get(prevId);
    prevNode.nextId = nodeId;
  }

  chain.nodes.set(nodeId, node);
  if (!chain.headId) {
    chain.headId = nodeId;
  }
  chain.tailId = nodeId;
  chain.nodeCount += 1;

  return node;
}

/**
 * Traverses the linked list from head to tail or tail to head.
 */
export function traversePromptNodes(chain, direction = 'forward') {
  const result = [];
  let currentId = direction === 'forward' ? chain.headId : chain.tailId;

  while (currentId && chain.nodes.has(currentId)) {
    const node = chain.nodes.get(currentId);
    result.push(node);
    currentId = direction === 'forward' ? node.nextId : node.prevId;
  }

  return result;
}

/**
 * Compiles the prompt context chain into a DSPy / RLM instruction string.
 */
export function compileDspyRlmPrompt(chain, { query, maxHistoryTurns = 6 } = {}) {
  const allNodes = traversePromptNodes(chain, 'backward');
  const recentNodes = allNodes.slice(0, maxHistoryTurns).reverse();

  const contextBlocks = [];
  const conversationTurns = [];

  for (const node of recentNodes) {
    if (node.role === 'context') {
      contextBlocks.push(`[CONTEXT_CARD ref=${node.acePacketRef ?? node.id} label=${node.featureLabel ?? 'NONE'}]\n${node.content}`);
    } else {
      conversationTurns.push(`<|im_start|>${node.role}\n${node.content}<|im_end|>`);
    }
  }

  const contextText = contextBlocks.length > 0 ? `\n# Retrieved Evidence Context:\n${contextBlocks.join('\n\n')}\n` : '';
  const promptBody = conversationTurns.join('\n');
  const finalPrompt = `${contextText}${promptBody}${query ? `\n<|im_start|>user\n${query}<|im_end|>\n<|im_start|>assistant\n` : ''}`;

  return {
    schema: 'atlas.dspy-compiled-prompt.v1',
    chainId: chain.chainId,
    domain: chain.domain,
    promptText: finalPrompt,
    turnCount: conversationTurns.length,
    contextCount: contextBlocks.length,
    promptSha256: createHash('sha256').update(finalPrompt, 'utf8').digest('hex'),
    canonicalAuthority: false,
  };
}

/**
 * Synthesizes a 64-byte aligned RTX array RPC packet header descriptor.
 */
export function buildRtxRpcPacketDescriptor(chain, compiledPrompt) {
  const textBytes = Buffer.byteLength(compiledPrompt.promptText, 'utf8');
  // Pad payload to multiple of 64 bytes
  const payloadPaddedBytes = Math.ceil(textBytes / RPC_PACKET_ALIGNMENT_BYTES) * RPC_PACKET_ALIGNMENT_BYTES;
  const headerBytes = RPC_PACKET_ALIGNMENT_BYTES; // Exactly 64-byte header
  const totalBufferBytes = headerBytes + payloadPaddedBytes;

  return {
    schema: 'atlas.rtx-rpc-packet-descriptor.v1',
    chainId: chain.chainId,
    promptSha256: compiledPrompt.promptSha256,
    alignmentBytes: RPC_PACKET_ALIGNMENT_BYTES,
    headerBytes,
    payloadRawBytes: textBytes,
    payloadPaddedBytes,
    totalBufferBytes,
    nodeCount: chain.nodeCount,
    headId: chain.headId,
    tailId: chain.tailId,
    memoryLayout: 'SHARED_ARRAY_BUFFER_OR_CSR',
    canonicalAuthority: false,
  };
}

/**
 * Checks live llama-server :8090 status and /slots occupancy.
 */
export async function probeLlamaServerBusyStatus({
  baseUrl = 'http://127.0.0.1:8090',
  timeoutMs = 1500,
} = {}) {
  try {
    const slotsRes = await fetch(`${baseUrl}/slots`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!slotsRes.ok) {
      return {
        reachable: true,
        isBusy: false,
        httpStatus: slotsRes.status,
        recommendation: 'FALLBACK_SLOTS_UNAVAILABLE',
      };
    }
    const slots = await slotsRes.json();
    if (Array.isArray(slots) && slots.length > 0) {
      const busySlots = slots.filter((s) => Boolean(s.is_processing)).length;
      const isBusy = busySlots === slots.length;
      return {
        reachable: true,
        isBusy,
        totalSlots: slots.length,
        busySlots,
        idleSlots: slots.length - busySlots,
        recommendation: isBusy ? 'ROUTE_TO_LANGEXTRACT_OR_COLAB' : 'ROUTE_TO_ORNITH_8090',
      };
    }
    return {
      reachable: true,
      isBusy: false,
      totalSlots: 0,
      busySlots: 0,
      idleSlots: 0,
      recommendation: 'ROUTE_TO_ORNITH_8090',
    };
  } catch (error) {
    return {
      reachable: false,
      isBusy: true,
      error: String(error?.message ?? error),
      recommendation: 'ROUTE_TO_LANGEXTRACT_OR_COLAB',
    };
  }
}
