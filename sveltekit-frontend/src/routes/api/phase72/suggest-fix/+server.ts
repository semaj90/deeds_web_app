import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const PHASE72_BACKEND_URL = process.env.PHASE72_BACKEND_URL ?? 'http://127.0.0.1:8000';

interface SuggestFixRequest {
 route?: string;
 errors?: Array<{ code: string; message: string; severity: string;
 file_path?: string;
 line?: number;
 }>;
 context?: string;
}

interface SuggestFixResponse { plan: string; suggestions: string[];
 related_routes: string[];
}

export const POST: RequestHandler = async ({ request }) => {
 try {
 const payload: SuggestFixRequest = await request.json();

 // If no backend is configured;
 return placeholder suggestions
 if (!PHASE72_BACKEND_URL || PHASE72_BACKEND_URL === 'http://127.0.0.1:8000') {
 console.warn('Phase72 backend not configured, returning placeholder suggestions');
 return json({
 plan: '### Fix Suggestions\n\n1. **Run svelte-check** to identify type errors\n2. **Update route layout** if component props changed\n3. **Check imports** for missing or misnamed components',
 suggestions: [
 'Review TypeScript errors in page.ts or layout.ts',
 'Check component prop compatibility',
 'Verify all imports are correct'],
 related_routes: payload.route ? [payload.route] : [],
 } as SuggestFixResponse);
 }

 // Call Phase 78 brain backend for AI-powered suggestions
 const response = await fetch(`${PHASE72_BACKEND_URL}/api/phase72/suggest-fix`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });

 if (!response.ok) {
 const text = await response.text();
 console.error('Phase72 backend error:', response.status, text);
 return json(
 {
 plan: 'Could not generate fix suggestions. Please try again.',
 suggestions: [],
 related_routes: [],
 } as SuggestFixResponse,
 { status: 502 }
 );
 }

 const data = (await response.json()) as SuggestFixResponse;
 return json({
 plan: data.plan ?? '',
 suggestions: data.suggestions ?? [],
 related_routes: data.related_routes ?? [],
 });
 } catch (err) {
 console.error('Phase72 suggest-fix error:', err);
 return json(
 {
 plan: 'Error: Could not connect to Phase72 brain service.',
 suggestions: [],
 related_routes: [],
 } as SuggestFixResponse,
 { status: 503 }
 );
 }
};




