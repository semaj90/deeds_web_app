// src/lib/ai/ai-service.ts - Unified AI service wrapper for the Detective Board
import { gpuService as gpuAI } from '$lib/services/gpu-ai-service';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface AIAnalysisResult {
	summary: string;
	key_points?: string[];
	legal_implications?: string[];
	confidence_score?: number;
	recommendations?: string[];
}

/**
 * Analyze a single piece of evidence
 */
export async function analyzeEvidence(caseId: string, evidence: any): Promise<AIAnalysisResult> {
	try {
		const id = typeof evidence === 'string' ? evidence : evidence.id;
		console.log(`[AI] Analyzing evidence: ${id} in case ${caseId}`);
		const result = await gpuAI.analyzeEvidence(id, typeof evidence === 'object' ? evidence.description : '');

		// If the result has the expected shape, return it, otherwise parse it
		if (result && result.text) {
			try {
				// Try to parse JSON from the response if present
				const jsonMatch = result.text.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					return JSON.parse(jsonMatch[0]);
				}
			} catch (e) {
				console.warn('[AI] Failed to parse JSON from AI response, returning raw text as summary');
			}
			return {
				summary: result.text,
				confidence_score: 0.8
			};
		}

		return {
			summary: 'Analysis completed successfully but no detailed summary was returned.',
			confidence_score: 0.5
		};
	} catch (error) {
		console.error('[AI] analyzeEvidence error:', error);
		return {
			summary: 'System encountered an error during analysis.',
			confidence_score: 0
		};
	}
}

/**
 * Find connections between multiple pieces of evidence
 */
export async function findEvidenceConnections(caseId: string, evidenceIds: string[]): Promise<any> {
	try {
		console.log(`[AI] Finding connections between ${evidenceIds.length} items in case ${caseId}`);
		const result = await gpuAI.findEvidenceConnections(evidenceIds);
		return result.text || 'No connections discovered.';
	} catch (error) {
		console.error('[AI] findEvidenceConnections error:', error);
		return 'Error identifying connections.';
	}
}
