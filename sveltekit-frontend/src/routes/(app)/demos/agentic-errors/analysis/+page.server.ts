import fs from 'fs/promises';
import path from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const analysisPath = path.join(process.cwd(), 'reports', 'phase89-rag-kag-analysis.json');

	let analysis = null;
	let timestamp = null;
	let loadError: string | null = null;

	try {
		const data = await fs.readFile(analysisPath, 'utf-8');
		const parsed = JSON.parse(data);
		analysis = parsed;
		timestamp = parsed.timestamp;
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


