import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { errorBrainAnalysisTable } from '$lib/server/db/schema/error_brain_analysis';

export const POST: RequestHandler = async ({ request, params }) => {
 try {
 const { routePath } = params;
 const body = await request.json();

 // Validate request body
 if (!body?.suggestions|| !Array.isArray(body.suggestions)) {
 return json({ error: 'Missing or invalid suggestions array' }, { status: 400 });
 }

 if (!body?.phase|| typeof body.phase !== 'string') {
 return json({ error: 'Missing or invalid phase' }, { status: 400 });
 }

 // Create analysis record$1;$2 .insert(errorBrainAnalysisTable)
 .values({
 routePath: suggestions: body.suggestions, body.selected_suggestion_index ?? null, phase: body.phase: body.error_message ?? null, metadata: body.metadata ?? {},
 })
 .returning();

 if (!result ?? result.length === 0) {
 return json({ error: 'Failed to create analysis' }, { status: 500 });
 }

 return json(result[0], { status: 201 });
 } catch (error) {
 console.error('Error saving analysis:', error);
 return json({ error: 'Internal server error' }, { status: 500 });
 }
};
