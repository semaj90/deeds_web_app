/**
 * RG-Atlas Search Pipeline — Top-level Orchestrator
 * Based on Section 2 and 3 of docs/design/2026-05-11_rg-atlas-search-pipeline.md
 */

import { v4 as uuidv4 } from 'uuid';
import { runRg } from '../../../../scripts/rg-atlas/run-rg.mjs';
import { rewriteQuery } from './multi-query.js';
import { getQdrantUnionHits } from './qdrant-union.js';
import { getKarpathyBlendScores } from './karpathy-blend.js';
import { rerankWithCrossEncoder } from '$lib/server/retrieval/cross-encoder-reranker.js';
import { rerankWithLangExtractGRPO } from '$lib/server/retrieval/langextract-reranker.js';
import { clusterHits } from './kmeans-cluster.js';
import { cosineBlend, DEFAULT_WEIGHTS } from './cosine-blend.js';
import { persistRgAtlasResult } from './persist.js';
import { getBatchedEmbeddings } from './embed.js';
import type { RgSearchAtlasOptions, RgSearchAtlasResult, RankedHit } from './types.js';

/**
 * Top-level orchestrator for the RG-Atlas Search Pipeline.
 */
export async function runRgSearchAtlas(
    opts: RgSearchAtlasOptions
): Promise<RgSearchAtlasResult> {
    const startTime = performance.now();
    const runId = `rg_${Date.now()}_${uuidv4().slice(0, 8)}`;
    
    const diagnostics = {
        rgMs: 0,
        embedMs: 0,
        gpuMs: 0,
        qdrantMs: 0,
        marcoMs: 0,
        langExtractMs: 0,
        totalMs: 0,
        rgHitCount: 0,
        qdrantHitCount: 0,
        finalHitCount: 0,
        persistedToDb: false
    };

    // --- Stage 1 & 2: rg lexical sweep & runId persist ---
    const rgStart = performance.now();
    const rgHits = runRg(opts.query, opts.paths ?? ['src']);
    diagnostics.rgMs = Math.round(performance.now() - rgStart);
    diagnostics.rgHitCount = rgHits.length;

    // --- Stage 4: Multi-query rewriter ---
    const variants = await rewriteQuery(opts.query, opts.variantCount ?? 3);

    // --- Stage 6: Qdrant multi-query union ---
    const qdrantStart = performance.now();
    const qdrantHits = await getQdrantUnionHits(variants, opts.topKPerLane ?? 20);
    diagnostics.qdrantMs = Math.round(performance.now() - qdrantStart);
    diagnostics.qdrantHitCount = qdrantHits.length;

    // --- Stage 3: GPU Karpathy blend ---
    const gpuStart = performance.now();
    // Gather all unique file paths from rg and qdrant hits
    const allPaths = Array.from(new Set([
        ...rgHits.map(h => h.file),
        ...qdrantHits.map(h => h.file_path)
    ]));
    const karpathyScoresList = await getKarpathyBlendScores(opts.query, allPaths);
    const karpathyScoreMap = new Map(allPaths.map((p, i) => [p, karpathyScoresList[i]]));
    diagnostics.gpuMs = Math.round(performance.now() - gpuStart);

    // Prepare combined candidates for reranking
    // We union rg hits and qdrant hits
    const candidateMap = new Map<string, Partial<RankedHit> & { content: string }>();

    // Add rg hits
    for (const h of rgHits) {
        const key = `${h.file}:${h.line}`;
        candidateMap.set(key, {
            filePath: h.file,
            lineNumber: h.line,
            snippet: h.snippet,
            source: 'rg',
            content: h.snippet,
            scores: {
                rgMatch: 1,
                karpathy: karpathyScoreMap.get(h.file) ?? 0,
                qdrantCosine: 0,
                marco: 0,
                langExtract: 0,
                final: 0
            }
        });
    }

    // Add qdrant hits
    for (const h of qdrantHits) {
        const key = h.stable_key;
        const existing = candidateMap.get(key);
        if (existing) {
            existing.source = 'union';
            existing.scores!.qdrantCosine = h.semantic_score;
        } else {
            candidateMap.set(key, {
                filePath: h.file_path,
                snippet: h.content,
                source: 'qdrant',
                content: h.content,
                scores: {
                    rgMatch: 0,
                    karpathy: karpathyScoreMap.get(h.file_path) ?? 0,
                    qdrantCosine: h.semantic_score,
                    marco: 0,
                    langExtract: 0,
                    final: 0
                }
            });
        }
    }

    const initialCandidates = Array.from(candidateMap.values());

    // --- Stage 7: Cross-encoder rerank ---
    const marcoStart = performance.now();
    let marcoResults = [];
    if (opts.enableMarcoRerank !== false) {
        const marcoRerankInput = initialCandidates.map(c => ({
            documentId: `${c.filePath}:${c.lineNumber ?? 0}`,
            content: c.content,
            retrievalScore: c.scores!.qdrantCosine || 0.5
        }));
        const crossEncoderRes = await rerankWithCrossEncoder(opts.query, marcoRerankInput, { topN: 100, returnTopK: 100 });
        const crossEncoderScoreMap = new Map(crossEncoderRes.results.map(r => [r.doc.documentId, r.rerankScore]));
        
        for (const c of initialCandidates) {
            const key = `${c.filePath}:${c.lineNumber ?? 0}`;
            c.scores!.marco = crossEncoderScoreMap.get(key) ?? 0;
        }
    }
    diagnostics.marcoMs = Math.round(performance.now() - marcoStart);

    // --- Stage 8: LangExtract validation ---
    const langStart = performance.now();
    if (opts.enableLangExtract !== false) {
        const langInput = initialCandidates.map(c => ({
            content: c.content,
            score: c.scores!.marco || c.scores!.qdrantCosine || 0.5,
            source: c.source!
        }));
        const langRes = await rerankWithLangExtractGRPO(opts.query, langInput);
        const langScoreMap = new Map(langRes.map(r => [r.chunk.content, r]));
        
        for (const c of initialCandidates) {
            const res = langScoreMap.get(c.content);
            if (res) {
                c.scores!.langExtract = res.grpoReward;
                // Note: Entities could be attached here
            }
        }
    }
    diagnostics.langExtractMs = Math.round(performance.now() - langStart);

    // --- Stage 9: Cosine final blend ---
    const rankedHits = cosineBlend(initialCandidates as any, opts.weights ?? DEFAULT_WEIGHTS);
    diagnostics.finalHitCount = rankedHits.length;

    // --- Stage 5: Qdrant centroid clustering ---
    const clusterStart = performance.now();
    const clusterKeys = rankedHits.map(h => `${h.filePath}:${h.lineNumber ?? 0}`);
    const clusterEmbeds = await getBatchedEmbeddings(rankedHits.map(h => h.snippet ?? ''));
    const clusters = await clusterHits(clusterKeys, clusterEmbeds.filter(e => e && e.length > 0) as number[][]);
    
    // Assign clusterIds back to hits
    const clusterMap = new Map<string, number>();
    clusters.forEach(c => c.memberKeys.forEach(k => clusterMap.set(k, c.id)));
    for (const h of rankedHits) {
        h.clusterId = clusterMap.get(`${h.filePath}:${h.lineNumber ?? 0}`) ?? -1;
    }
    // diagnostics.embedMs is part of cluster/marco/etc. but we can estimate
    diagnostics.totalMs = Math.round(performance.now() - startTime);

    const finalResult: RgSearchAtlasResult = {
        runId,
        query: opts.query,
        hits: rankedHits,
        clusters: clusters.map(c => ({
            id: c.id,
            centroid: c.centroid,
            memberFiles: Array.from(new Set(c.memberKeys.map(k => k.split(':')[0])))
        })),
        diagnostics
    };

    // --- Stage 10: Persist results ---
    if (opts.persist !== false) {
        finalResult.diagnostics.persistedToDb = await persistRgAtlasResult(finalResult, opts.userId);
    }

    return finalResult;
}
