/**
 * Entity extraction wrapper.
 * Delegates to the unified entityExtractor in entity-extractor-unified.ts.
 */

import { entityExtractor, type Entity as UnifiedEntity } from './entity-extractor-unified.js';

export interface Entity {
	text: string;
	label: string;
	score?: number;
	start?: number;
	end?: number;
	source?: 'llm' | 'regex';
}

/**
 * Extract entities using the unified entity extractor.
 */
export async function extractEntities(text: string, maxChars: number = 35_000): Promise<Entity[]> {
	if (!text) return [];
	const slice = text.length > maxChars ? text.slice(0, maxChars) : text;
	
	const result = await entityExtractor.extract({ text: slice });
	
	return result.entities.map((e) => ({
		text: e.value,
		label: String(e.type),
		score: e.confidence,
		start: e.position?.start,
		end: e.position?.end,
		source: e.source === 'custom' ? 'regex' : (e.source as 'llm' | 'regex'),
	}));
}
