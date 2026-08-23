/**
 * PHASE 85a: PACKET SUMMARY GENERATION PIPELINE
 *
 * End-to-end flow for summary generation with semantic diff gating:
 *   1. Fetch old summary (if exists)
 *   2. Generate new summary via Gemma4
 *   3. Gate via semantic diff (skip/metadata_only/regenerate/gan_review/full_regen)
 *   4. Run QA validation
 *   5. Store to artifact registry (atlas_artifacts)
 *   6. Invalidate Redis cache
 *   7. Return recommendation + artifact ID
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { semanticDiffGate } from './semantic-diff-gate.js';
import { storeSummaryArtifact } from './summary-qa.js';
import { logArtifact } from './artifact-logger.js';
import { extractPacketFeatures } from './feature-label-extractor.js';

export interface SummaryPipelineResult {
  packet_key: string;
  source_ref: string;
  recommendation: 'skip' | 'metadata_only' | 'regenerate' | 'gan_review' | 'full_regeneration';
  action_taken?: 'skip' | 'metadata_only' | 'regenerate' | 'gan_review' | 'full_regeneration';
  similarity?: number;
  artifact_id?: string;
  new_summary?: string;
  cost_saved_percent?: number;
  errors?: string[];
}

// ── Generate summary via llama-server (Gemma4) ────────────────────────────────

async function generateSummaryViaLlamaServer(sourceRef: string, context: string): Promise<string | null> {
  try {
    const baseUrl = String(ENV.LLAMA_SERVER_URL ?? process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
    const model = ENV.GEMMA4_MODEL ?? process.env.GEMMA4_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a code summarization expert. Summarize the following code/text in 1-3 sentences, capturing the core functionality or purpose.',
          },
          {
            role: 'user',
            content: `${context}\n\nProvide a concise summary.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Summary generation failed for ${sourceRef}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary || null;
  } catch (err) {
    console.error(`Failed to generate summary for ${sourceRef}:`, err);
    return null;
  }
}

// ── Main pipeline ──────────────────────────────────────────────────────────────

export async function runPacketSummaryPipeline(input: {
  packet_key: string;
  source_ref: string;
  feature_id?: string;
  context: string; // Code/text snippet to summarize
  trace_id?: string;
  git_commit?: string;
}): Promise<SummaryPipelineResult> {
  const result: SummaryPipelineResult = {
    packet_key: input.packet_key,
    source_ref: input.source_ref,
    recommendation: 'regenerate',
  };

  try {
    // Step 1: Fetch old summary from Postgres
    const packet = await db
      .select({ summary: atlasPackets.summary })
      .from(atlasPackets)
      .where(eq(atlasPackets.packetKey, input.packet_key))
      .limit(1);

    const oldSummary = packet.length > 0 ? packet[0].summary : null;

    // Step 2: Generate new summary via llama-server
    const newSummary = await generateSummaryViaLlamaServer(input.source_ref, input.context);

    if (!newSummary) {
      result.errors = ['Failed to generate summary via Gemma4'];
      return result;
    }

    result.new_summary = newSummary;

    // Step 3: Run semantic diff gate
    if (oldSummary) {
      const diffResult = await semanticDiffGate(
        input.packet_key,
        input.source_ref,
        oldSummary,
        newSummary,
        input.trace_id
      );

      result.recommendation = diffResult.recommendation;
      result.similarity = diffResult.similarity;
      result.cost_saved_percent = diffResult.costSaved;

      // If similarity is too high, skip regeneration
      if (diffResult.recommendation === 'skip' || diffResult.recommendation === 'metadata_only') {
        result.action_taken = diffResult.recommendation;

        // Log as a 'skip' artifact for audit trail
        await logArtifact({
          packet_key: input.packet_key,
          source_ref: input.source_ref,
          feature_id: input.feature_id,
          artifact_type: 'summary',
          generator: 'Gemma4',
          generator_version: 'rotorquant:latest',
          storage_backend: 'postgres_jsonb',
          status: 'generated',
          trace_id: input.trace_id,
          git_commit: input.git_commit,
          content: newSummary,
        });

        return result;
      }
    } else {
      result.recommendation = 'regenerate';
    }

    // Step 4: Run QA validation
    const qaResult = await storeSummaryArtifact({
      packet_key: input.packet_key,
      source_ref: input.source_ref,
      feature_id: input.feature_id,
      summary: newSummary,
      generator: 'Gemma4',
      generator_version: 'rotorquant:latest',
      trace_id: input.trace_id,
      git_commit: input.git_commit,
    });

    if ('error' in qaResult) {
      result.errors = [qaResult.error];
      result.action_taken = 'skip';
      return result;
    }

    result.artifact_id = qaResult.artifactId;
    result.action_taken = 'regenerate';

    // Step 5: Extract feature labels (P5 Feature Label Extraction)
    try {
      const featureResult = await extractPacketFeatures({
        packetKey: input.packet_key,
        sourceRef: input.source_ref,
        featureId: input.feature_id || 'unclassified',
        summary: newSummary,
        useSynthesis: true
      });

      // Log feature labels as artifact
      if (featureResult.extractedFeatures.labels.length > 0) {
        await logArtifact({
          packet_key: input.packet_key,
          source_ref: input.source_ref,
          feature_id: input.feature_id,
          artifact_type: 'feature_labels',
          generator: 'Gemma4',
          generator_version: 'rotorquant:latest',
          storage_backend: 'postgres_jsonb',
          status: featureResult.status,
          gan_validation_score: featureResult.extractedFeatures.confidence,
          generator_config: {
            labels: featureResult.extractedFeatures.labels,
            symbols: featureResult.extractedFeatures.symbols
          },
          content: JSON.stringify({
            labels: featureResult.extractedFeatures.labels,
            symbols: featureResult.extractedFeatures.symbols
          })
        });
      }
    } catch (err) {
      console.warn(`[P5] Feature extraction failed for ${input.packet_key}:`, err);
      // Non-blocking — continue without features
    }

    // Step 6: Update Postgres packet table
    await db
      .update(atlasPackets)
      .set({
        summary: newSummary,
        updatedAt: new Date(),
      })
      .where(eq(atlasPackets.packetKey, input.packet_key));

    // Step 6: Invalidate Redis cache
    const redis = getRedis();
    try {
      const cacheKeys = [
        `bitfrost:packet:${input.packet_key}`,
        `bitfrost:trace:${input.packet_key}`,
        `bifrost:${input.packet_key}`,
        `code:llm_output:path:${Buffer.from(input.source_ref).toString('hex')}`,
      ];

      await redis.del(...cacheKeys);
    } catch (err) {
      console.warn(`Failed to invalidate Redis cache for ${input.packet_key}:`, err);
    }

    return result;
  } catch (err) {
    result.errors = [err instanceof Error ? err.message : String(err)];
    return result;
  }
}

// ── Batch pipeline for multiple packets ────────────────────────────────────────

export async function runPacketSummaryPipelineBatch(
  packets: Array<{
    packet_key: string;
    source_ref: string;
    feature_id?: string;
    context: string;
    trace_id?: string;
    git_commit?: string;
  }>
): Promise<SummaryPipelineResult[]> {
  const results: SummaryPipelineResult[] = [];

  for (const packet of packets) {
    try {
      const result = await runPacketSummaryPipeline(packet);
      results.push(result);
    } catch (err) {
      results.push({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        recommendation: 'regenerate',
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return results;
}
