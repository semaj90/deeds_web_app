import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getLegalAutocomplete } from '$lib/server/legal-autocomplete';

export const GET: RequestHandler = async ({ url }) => {
 const query = url.searchParams.get('q')?.trim() || '';
 const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);

 if (!query || query.length < 1) {
 return json({ suggestions: [] });
 }

 try {
 const suggestions = getLegalAutocomplete(query, limit);
 return json({ suggestions });
 } catch (error) {
 console.error('Autocomplete error:', error);
 return json({ suggestions: [], error: 'Failed to fetch suggestions' }, { status: 500 });
 }
};


