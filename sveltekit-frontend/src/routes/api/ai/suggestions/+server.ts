import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/ai/suggestions — Return suggested queries for the AI assistant */
export const GET: RequestHandler = async () => {
	const suggestions = [
		'Summarize the key evidence in this case',
		'What are the strongest legal arguments for the plaintiff?',
		'Identify potential weaknesses in the defense',
		'Draft a motion to compel discovery',
		'Analyze the timeline of events for inconsistencies',
		'What precedents apply to this jurisdiction?',
		'Assess the admissibility of the digital evidence',
		'Generate a case summary for the judge',
		'What are the potential damages in this case?',
		'Compare this case with similar recent rulings'
	];

	// Shuffle and return a subset for variety
	const shuffled = suggestions.sort(() => Math.random() - 0.5);
	return json({ suggestions: shuffled.slice(0, 5) });
};