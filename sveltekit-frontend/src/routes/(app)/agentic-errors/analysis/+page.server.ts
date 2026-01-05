import { error } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		// Load the latest RAG+KAG analysis
		const analysisPath = path.join(process.cwd(), 'reports', 'phase89-rag-kag-analysis.json');

		let analysis = null;
		let timestamp = null;

		try {
			const data = await fs.readFile(analysisPath, 'utf-8');
			const parsed = JSON.parse(data);
			analysis = parsed;
			timestamp = parsed.timestamp;
		} catch {
			// Analysis not generated yet
		}

		return {
			analysis,
			timestamp,
			hasGeminiKey: !!process.env.GEMINI_API_KEY
		};
	} catch (err) {
		throw error(500, `Failed to load analysis: ${ err: err }`);
	}
};
