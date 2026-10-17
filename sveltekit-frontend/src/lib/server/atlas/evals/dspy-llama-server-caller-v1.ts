import { ENV } from '$lib/server/env.server.js';
import type { ContextManifestV2 } from '../graph/context-manifest-v2.js';
import {
  parseDspyRepairOutputV1,
  type DspyRepairOutputV1,
} from './dspy-repair-output-v1.js';

export interface DspyLlamaCallerOptions {
  llamaServerUrl?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface DspyLlamaCallerResult {
  status: 'ADMITTED' | 'REJECTED_VALIDATION_FAILED' | 'LLAMA_SERVER_UNAVAILABLE';
  proposal: DspyRepairOutputV1 | null;
  rawText: string | null;
  error?: string;
  model: string;
  endpoint: string;
  kvCachePersisted: false;
  canonicalAuthority: false;
}

/**
 * Self-Prompting DSPy caller connecting to local llama-server on :8090.
 * Conforms to Self-Prompting DSPy & Llama-Server Boundary in openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md.
 *
 * Invariants:
 * 1. Model authority: ornith-1.5-9b on :8090 (or ENV.LLAMA_SERVER_URL).
 * 2. DSPy structured output strictly verified against admitted ContextManifestV2.
 * 3. Zero hidden thoughts, zero raw KV cache tensors persisted (kvCachePersisted: false).
 * 4. Zero mutations to canonical stores (canonicalAuthority: false).
 */
export async function executeDspyLlamaServerRepair(input: {
  manifest: ContextManifestV2;
  diagnosisContext?: string;
  options?: DspyLlamaCallerOptions;
}): Promise<DspyLlamaCallerResult> {
  const llamaUrl = input.options?.llamaServerUrl || ENV.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
  const model = input.options?.model || ENV.LLAMA_SERVER_MODEL || 'ornith-1.5-9b';
  const timeoutMs = input.options?.timeoutMs ?? 7000;

  const manifest = input.manifest;
  const manifestChecksum = `sha256:${manifest.identityChecksum}`;
  const allowedEvidence = manifest.v1.evidenceRefs;
  const allowedTargets = manifest.v1.selectedNodeKeys;

  const systemPrompt = [
    'You are Ornith 1.5 acting as a structured DSPy repair program.',
    'You must emit ONLY a valid JSON object conforming exactly to the following schema:',
    '{',
    '  "schema": "atlas.dspy-repair-output.v1",',
    `  "contextManifestChecksum": "${manifestChecksum}",`,
    '  "diagnosis": "<concise diagnosis string>",',
    '  "targetCandidates": [<subset of allowed target candidate keys>],',
    '  "patchPlan": "<actionable repair plan>",',
    '  "validationPlan": "<exact verification command>",',
    '  "evidenceRefs": [<subset of allowed evidence references>]',
    '}',
    '',
    `Allowed target candidates: ${JSON.stringify(allowedTargets)}`,
    `Allowed evidence references: ${JSON.stringify(allowedEvidence)}`,
    'Do not invent any candidate or evidence ID outside the allowed lists. Respond with JSON only.',
  ].join('\n');

  const userPrompt = [
    `Context Manifest Query: ${manifest.v1.query}`,
    input.diagnosisContext ? `Diagnosis Context:\n${input.diagnosisContext}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const res = await fetch(`${llamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: input.options?.temperature ?? 0.1,
        max_tokens: input.options?.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        status: 'LLAMA_SERVER_UNAVAILABLE',
        proposal: null,
        rawText: null,
        error: `HTTP ${res.status}: ${res.statusText}`,
        model,
        endpoint: llamaUrl,
        kvCachePersisted: false,
        canonicalAuthority: false,
      };
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() ?? '';

    // Strip markdown code fences if model wrapped the JSON
    const jsonMatch = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const validatedProposal = parseDspyRepairOutputV1(jsonMatch, manifest);
      return {
        status: 'ADMITTED',
        proposal: validatedProposal,
        rawText: rawContent,
        model,
        endpoint: llamaUrl,
        kvCachePersisted: false,
        canonicalAuthority: false,
      };
    } catch (valErr) {
      return {
        status: 'REJECTED_VALIDATION_FAILED',
        proposal: null,
        rawText: rawContent,
        error: valErr instanceof Error ? valErr.message : 'DSPY_VALIDATION_FAILED',
        model,
        endpoint: llamaUrl,
        kvCachePersisted: false,
        canonicalAuthority: false,
      };
    }
  } catch (netErr) {
    return {
      status: 'LLAMA_SERVER_UNAVAILABLE',
      proposal: null,
      rawText: null,
      error: netErr instanceof Error ? netErr.message : 'NETWORK_ERROR',
      model,
      endpoint: llamaUrl,
      kvCachePersisted: false,
      canonicalAuthority: false,
    };
  }
}
