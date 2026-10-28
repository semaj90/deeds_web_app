import fs from 'fs/promises';
import path from 'path';
import type { PageServerLoad } from './$types';

/** Minimal shape the page reads without optional chaining: metadata counters and a collections array. */
function isAnalysisReport(value: any): boolean {
	return (
		!!value &&
		typeof value === 'object' &&
		!!value.metadata &&
		typeof value.metadata.totalCollections === 'number' &&
		typeof value.metadata.totalPoints === 'number' &&
		!!value.knowledge &&
		Array.isArray(value.knowledge.collections)
	);
}

export const load: PageServerLoad = async () => {
	const analysisPath = path.join(process.cwd(), 'reports', 'phase89-rag-kag-analysis.json');

	let analysis = null;
	let timestamp = null;
	let loadError: string | null = null;

	try {
		const data = await fs.readFile(analysisPath, 'utf-8');
		const parsed = JSON.parse(data);
		// The saved file is the API response envelope { success, analysis: { metadata, knowledge, ... }, timestamp }.
		const candidate = parsed?.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : parsed;
		if (isAnalysisReport(candidate)) {
			analysis = candidate;
			timestamp = parsed.timestamp ?? candidate.timestamp ?? null;
		} else {
			loadError = `Analysis report has an unexpected format (top-level keys: ${Object.keys(parsed ?? {}).slice(0, 8).join(', ') || 'none'})`;
		}
	} catch {
		loadError = 'Analysis report not generated yet';
	}

	return {
    analysis,
    timestamp,
    hasGeminiKey: false,
    loadError,
  };
};


