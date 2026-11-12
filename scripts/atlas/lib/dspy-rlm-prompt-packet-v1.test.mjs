import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPromptContextChain,
  appendPromptNode,
  traversePromptNodes,
  compileDspyRlmPrompt,
  buildRtxRpcPacketDescriptor,
  probeLlamaServerBusyStatus,
  RPC_PACKET_ALIGNMENT_BYTES,
} from './dspy-rlm-prompt-packet-v1.mjs';

test('PromptContextChain: linked list appending and traversal', () => {
  const chain = createPromptContextChain({ chainId: 'test_chain_01' });
  assert.equal(chain.nodeCount, 0);
  assert.equal(chain.headId, null);

  const n1 = appendPromptNode(chain, { role: 'system', content: 'You are an AI legal assistant.' });
  const n2 = appendPromptNode(chain, {
    role: 'context',
    content: 'Cal. Civ. Code § 1542 general release rule.',
    acePacketRef: 'ace:packet:cal_civ_1542',
    featureLabel: 'CIVIL_RELEASE',
  });
  const n3 = appendPromptNode(chain, { role: 'user', content: 'Explain California section 1542.' });

  assert.equal(chain.nodeCount, 3);
  assert.equal(chain.headId, n1.id);
  assert.equal(chain.tailId, n3.id);
  assert.equal(n1.nextId, n2.id);
  assert.equal(n2.prevId, n1.id);
  assert.equal(n2.nextId, n3.id);
  assert.equal(n3.prevId, n2.id);
  assert.equal(n3.nextId, null);

  const forward = traversePromptNodes(chain, 'forward');
  assert.equal(forward.length, 3);
  assert.equal(forward[0].id, n1.id);
  assert.equal(forward[2].id, n3.id);

  const backward = traversePromptNodes(chain, 'backward');
  assert.equal(backward.length, 3);
  assert.equal(backward[0].id, n3.id);
  assert.equal(backward[2].id, n1.id);
});

test('DSPy / RLM compilation and 64B aligned RTX RPC descriptor', () => {
  const chain = createPromptContextChain({ chainId: 'test_chain_02' });
  appendPromptNode(chain, { role: 'system', content: 'You are an Ornith SSM agent.' });
  appendPromptNode(chain, {
    role: 'context',
    content: 'Summary of Evidence Exhibit A.',
    acePacketRef: 'ace:card:exhibit_a',
  });
  appendPromptNode(chain, { role: 'user', content: 'Analyze Exhibit A.' });

  const compiled = compileDspyRlmPrompt(chain, { query: 'Provide citations.' });
  assert.ok(compiled.promptText.includes('Summary of Evidence Exhibit A.'));
  assert.ok(compiled.promptText.includes('Provide citations.'));
  assert.equal(compiled.canonicalAuthority, false);

  const rpcDesc = buildRtxRpcPacketDescriptor(chain, compiled);
  assert.equal(rpcDesc.schema, 'atlas.rtx-rpc-packet-descriptor.v1');
  assert.equal(rpcDesc.alignmentBytes, 64);
  assert.equal(rpcDesc.headerBytes, 64);
  assert.equal(rpcDesc.totalBufferBytes % RPC_PACKET_ALIGNMENT_BYTES, 0, 'Buffer must be 64-byte aligned');
  assert.ok(rpcDesc.totalBufferBytes > rpcDesc.payloadRawBytes);
});

test('probeLlamaServerBusyStatus gracefully returns status or fallback', async () => {
  // Test with local port :8090 (or unreachable/mock behavior)
  const status = await probeLlamaServerBusyStatus({ timeoutMs: 500 });
  assert.ok(['ROUTE_TO_ORNITH_8090', 'ROUTE_TO_LANGEXTRACT_OR_COLAB', 'FALLBACK_SLOTS_UNAVAILABLE'].includes(status.recommendation));
  assert.equal(typeof status.isBusy, 'boolean');
});
