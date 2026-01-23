import { sql } from '$lib/server/db';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
 try {
 // Load evidence with associated chat turns for keywords and suggestionsSELECT
 e.*,
 json_agg(
 json_build_object(
 'turn_id', ct.id,
 'query', ct.query,
 'answer', ct.answer,
 'keywords', ct.keywords,
 'key_phrases', ct.key_phrases,
 'suggestions', ct.suggestions,
 'created_at', ct.created_at
 )
 ) FILTER (WHERE ct.id IS NOT NULL) as chat_turns
 FROM evidence e
 LEFT JOIN chat_turns ct ON ct.case_id::text = e.case_id::text
 GROUP BY e.id
 ORDER BY e.created_at DESC
 `;

 return {
 evidence: evidenceWithChat,
 };
 } catch (error) {
 console.error('Error loading evidence board:', error);
 return {
 evidence: [],
 };
 }
};


