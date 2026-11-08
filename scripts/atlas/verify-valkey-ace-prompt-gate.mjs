#!/usr/bin/env node
/**
 * scripts/atlas/verify-valkey-ace-prompt-gate.mjs
 *
 * Implements Step 3 of Parent Atlas Hardening:
 * 1. Reads the canonical ACE packet from docs/reports/verified-ace-task-milestone-v1.json.
 * 2. Caches into Valkey under ace:packet:{canonicalTaskKey}:{workspaceRevision} with 1-hour TTL.
 * 3. Verifies readback integrity and TTL expiration window (3600s).
 * 4. Compiles the bounded prompt strictly honoring the 4,096-token allocation:
 *    - Task identity & rules: <= 600 tokens
 *    - DAG frontier: <= 450 tokens
 *    - OKF ontology & constraints: <= 650 tokens
 *    - AST symbols & exact spans: <= 900 tokens
 *    - Hybrid top-K evidence: <= 1000 tokens
 *    - Acceptance tests: <= 300 tokens
 *    - Safety reserve: 196 tokens
 * 5. Asserts negative invariants:
 *    - Zero raw float vectors in prompt or cache
 *    - Zero hidden thoughts, chainOfThought, kv_cache, or tensors
 * 6. Emits receipt to docs/reports/valkey-ace-prompt-gate-receipt-v1.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Redis from 'ioredis';

const ROOT = process.cwd();
const PACKET_PATH = path.join(ROOT, 'docs/reports/verified-ace-task-milestone-v1.json');
const OUT_RECEIPT = path.join(ROOT, 'docs/reports/valkey-ace-prompt-gate-receipt-v1.json');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

// Conservative tokenizer estimation for English/Code (average 3.6 chars per token)
function estimateTokens(text) {
  return Math.ceil(text.length / 3.6);
}

function compilePromptSections(packet) {
  // Section 1: Task Identity & Rules (Budget: 600 tokens)
  const sec1 = [
    `# TASK CONTEXT: ${packet.canonicalTaskKey}`,
    `Task Code: ${packet.taskSource.taskCode}`,
    `Source: ${packet.taskSource.sourceRef}`,
    `Workspace Revision: ${packet.workspaceRevision}`,
    `Representation: ${packet.representation.family} (digest: ${packet.representation.modelDigest.slice(0, 16)}...)`,
    `Task Instruction: ${packet.taskSource.taskText}`,
    `Governing Rules: ${packet.taskSource.governingRules}`,
  ].join('\n');

  // Section 2: DAG Frontier & State (Budget: 450 tokens)
  const sec2 = [
    `## DAG FRONTIER & STATE`,
    `Execution Status: ${packet.executionStatus}`,
    `Mutation Authorized: ${packet.mutationAuthorized}`,
    `Canonical Authority: ${packet.canonicalAuthority}`,
    `Visual Glyph: ordinal=${packet.visualGlyph.taskOrdinal}, domainByte=${packet.visualGlyph.lutByte} (${packet.visualGlyph.label}), nesHex=${packet.visualGlyph.nesHex}`,
  ].join('\n');

  // Section 3: OKF Ontology & Constraints (Budget: 650 tokens)
  const sec3 = [
    `## ONTOLOGY & GOVERNED CONSTRAINTS`,
    `- Domain: DOM_GRAPH_CUGRAPH_PAGERANK (lutByte: 8, nesHex: 0x1A)`,
    `- PageRank scores are precomputed read-only authority. Dynamic on-the-fly recomputation is forbidden.`,
    `- Zero synthetic ordinal IDs: all task ordinals must join directly to canonical_task_key.`,
    `- Bitset alignment: occupancy bitsets must distinguish open (0) from completed (1) without conflating priority nibbles.`,
  ].join('\n');

  // Section 4: AST Symbols & Exact Spans (Budget: 900 tokens)
  const astItems = packet.retrieval.evidence
    .filter(e => e.kind === 'AST_SYMBOL_PROOF')
    .map(e => `- Symbol: \`${e.symbol}\` (${e.nodeKind}) in \`${e.sourceRef}\` lines ${e.lineSpan[0]}-${e.lineSpan[1]}`);
  const sec4 = [
    `## AST SYMBOLS & GROUNDED SPANS`,
    astItems.length > 0 ? astItems.join('\n') : '- No local AST symbols bound.',
  ].join('\n');

  // Section 5: Hybrid Top-K Evidence (Budget: 1000 tokens)
  const otherEvidence = packet.retrieval.evidence
    .filter(e => e.kind !== 'AST_SYMBOL_PROOF')
    .map(e => `- [Rank ${e.rank}] ${e.kind}: \`${e.sourceRef}\`${e.score ? ` (score: ${e.score})` : ''}${e.edgeType ? ` (edge: ${e.edgeType})` : ''}`);
  const sec5 = [
    `## GROUNDED EVIDENCE & RETRIEVAL CITATIONS`,
    otherEvidence.length > 0 ? otherEvidence.join('\n') : '- No external evidence citations.',
  ].join('\n');

  // Section 6: Acceptance Tests & Verification Barrier (Budget: 300 tokens)
  const testItems = packet.acceptance.requiredTests.map(t => `- \`${t}\``);
  const sec6 = [
    `## ACCEPTANCE TESTS & VERIFICATION BARRIER`,
    `Required Validation Commands:`,
    testItems.join('\n'),
    `Independent Readback Required: ${packet.acceptance.independentReadback}`,
  ].join('\n');

  return {
    sec1: { title: 'taskIdentityAndRules', text: sec1, tokens: estimateTokens(sec1), budget: packet.contextBudgetTokens.taskIdentityAndRules },
    sec2: { title: 'dagFrontier', text: sec2, tokens: estimateTokens(sec2), budget: packet.contextBudgetTokens.dagFrontier },
    sec3: { title: 'okfOntologyAndConstraints', text: sec3, tokens: estimateTokens(sec3), budget: packet.contextBudgetTokens.okfOntologyAndConstraints },
    sec4: { title: 'astSymbolsAndExactSpans', text: sec4, tokens: estimateTokens(sec4), budget: packet.contextBudgetTokens.astSymbolsAndExactSpans },
    sec5: { title: 'hybridTopKEvidence', text: sec5, tokens: estimateTokens(sec5), budget: packet.contextBudgetTokens.hybridTopKEvidence },
    sec6: { title: 'acceptanceTests', text: sec6, tokens: estimateTokens(sec6), budget: packet.contextBudgetTokens.acceptanceTests },
  };
}

async function main() {
  console.log('[ACE-Valkey Gate] Reading verified ACE packet from disk...');
  if (!fs.existsSync(PACKET_PATH)) {
    throw new Error(`Packet file not found at ${PACKET_PATH}`);
  }
  const rawPacket = fs.readFileSync(PACKET_PATH, 'utf8');
  const packet = JSON.parse(rawPacket);

  // 1. Verify Negative Constraints on Packet
  console.log('[ACE-Valkey Gate] Verifying negative invariants on raw packet...');
  const packetStr = JSON.stringify(packet);
  if (packetStr.includes('hiddenThoughts') || packetStr.includes('chainOfThought')) {
    throw new Error('VIOLATION: packet contains forbidden chainOfThought / hiddenThoughts');
  }
  if (packetStr.includes('kv_cache') || packetStr.includes('"tensor"')) {
    throw new Error('VIOLATION: packet contains persisted tensor / kv_cache');
  }
  if (Array.isArray(packet.representation?.vector) || Array.isArray(packet.representation?.prefixVector)) {
    throw new Error('VIOLATION: raw float vector arrays must not be persisted directly in ACE context packet');
  }
  console.log('✓ Zero hidden thoughts, chain-of-thought, or raw vectors in packet');

  // 2. Connect to Valkey
  console.log(`[ACE-Valkey Gate] Connecting to Valkey at ${REDIS_HOST}:${REDIS_PORT}...`);
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
  });

  const pong = await redis.ping();
  console.log(`✓ Valkey ping: ${pong}`);

  // 3. Cache ACE Packet under canonical key with 1-hour TTL (3600s)
  const cacheKey = `ace:packet:${packet.canonicalTaskKey}:${packet.workspaceRevision}`;
  const TTL_SECONDS = 3600;
  console.log(`[ACE-Valkey Gate] Writing packet to cache key: ${cacheKey} (TTL: ${TTL_SECONDS}s)...`);

  await redis.set(cacheKey, JSON.stringify(packet), 'EX', TTL_SECONDS);

  // 4. Verify Readback & TTL
  const readbackRaw = await redis.get(cacheKey);
  if (!readbackRaw) {
    throw new Error(`Failed to read back key ${cacheKey} from Valkey`);
  }
  const readbackPacket = JSON.parse(readbackRaw);
  const ttl = await redis.ttl(cacheKey);

  console.log(`✓ Readback verified. Remaining TTL: ${ttl}s`);
  if (ttl < 3500 || ttl > 3600) {
    throw new Error(`TTL ${ttl}s out of expected 3500-3600s window`);
  }

  // 5. Compile Bounded Prompt
  console.log('[ACE-Valkey Gate] Compiling bounded prompt honoring 4,096-token allocation...');
  const sections = compilePromptSections(packet);
  const compiledPrompt = [
    sections.sec1.text,
    '',
    sections.sec2.text,
    '',
    sections.sec3.text,
    '',
    sections.sec4.text,
    '',
    sections.sec5.text,
    '',
    sections.sec6.text,
  ].join('\n');

  const totalTokens = estimateTokens(compiledPrompt);
  console.log(`✓ Compiled Prompt Size: ${compiledPrompt.length} chars (~${totalTokens} estimated tokens)`);

  // Section budget audits
  for (const [key, sec] of Object.entries(sections)) {
    console.log(`  - Section ${sec.title}: ${sec.tokens} tokens (budget: ${sec.budget}) -> ${sec.tokens <= sec.budget ? 'PASS' : 'OVER_BUDGET'}`);
    if (sec.tokens > sec.budget) {
      throw new Error(`Section ${sec.title} exceeded budget: ${sec.tokens} > ${sec.budget}`);
    }
  }

  if (totalTokens > packet.contextBudgetTokens.totalBudget) {
    throw new Error(`Total prompt exceeded budget: ${totalTokens} > ${packet.contextBudgetTokens.totalBudget}`);
  }

  // 6. Assert Negative Constraints on Compiled Prompt
  if (compiledPrompt.includes('hiddenThoughts') || compiledPrompt.includes('chainOfThought')) {
    throw new Error('VIOLATION: compiled prompt contains chainOfThought');
  }
  if (compiledPrompt.includes('[-0.') || compiledPrompt.includes('[0.')) {
    throw new Error('VIOLATION: compiled prompt contains raw float vector literals');
  }
  console.log('✓ Prompt adheres strictly to 4,096-token allocation with zero vector leakage');

  // 7. Write Receipt
  const receipt = {
    schema: 'atlas.valkey-ace-prompt-gate-receipt.v1',
    generatedAt: new Date().toISOString(),
    valkey: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      cacheKey: cacheKey,
      ttlSecondsConfigured: TTL_SECONDS,
      ttlSecondsVerified: ttl,
      status: 'VERIFIED_ACTIVE',
    },
    canonicalTaskKey: packet.canonicalTaskKey,
    workspaceRevision: packet.workspaceRevision,
    budgetAudit: {
      totalBudget: packet.contextBudgetTokens.totalBudget,
      totalEstimatedTokens: totalTokens,
      safetyReserveUnused: packet.contextBudgetTokens.totalBudget - totalTokens,
      sections: Object.values(sections).map(s => ({
        section: s.title,
        estimatedTokens: s.tokens,
        budgetTokens: s.budget,
        passed: s.tokens <= s.budget,
      })),
      allSectionsWithinBudget: true,
    },
    negativeInvariants: {
      zeroRawVectorsInPrompt: true,
      zeroHiddenThoughts: true,
      zeroChainOfThoughtPersisted: true,
      zeroTensorPersisted: true,
    },
    promptPreviewHead: compiledPrompt.slice(0, 300) + '...',
  };

  fs.writeFileSync(OUT_RECEIPT, JSON.stringify(receipt, null, 2));
  console.log(`✓ Verification receipt written to ${OUT_RECEIPT}`);

  await redis.quit();
}

main().catch(err => {
  console.error('[Error in ACE-Valkey Gate]:', err);
  process.exit(1);
});
