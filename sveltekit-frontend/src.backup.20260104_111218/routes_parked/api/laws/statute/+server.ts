import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { enrichStatute } from '$lib/server/statute-enrichment';
import { logStatuteView } from '$lib/server/timeline-logger';

export const GET: RequestHandler = async ({ url, locals }) => {
 const citation = url.searchParams.get('citation')?.trim();

 if (!citation) {
 return json({ error: 'Citation required' }, { status: 400 });
 }

 try {
 const statute = enrichStatute(citation);

 if (!statute) {
 return json({ error: 'Statute not found' }, { status: 404 });
 }

 // Log the view to timeline if user is authenticated
 if (locals.user?.id) {
 await logStatuteView(locals.user.id, {
 citation: statute.citation,
 title: statute.title,
 severity: statute.severity,
 victimClass: statute.victimClass,
 bundled: statute.bundledCharges.map((c) => c.citation),
 });
 }

 return json(statute);
 } catch (error) {
 console.error('Statute fetch error:', error);
 return json({ error: 'Failed to fetch statute' }, { status: 500 });
 }
};
