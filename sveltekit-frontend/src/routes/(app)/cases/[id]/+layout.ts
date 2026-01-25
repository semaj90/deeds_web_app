import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types.js';

// Dynamically import cache service (browser only)
let cacheService: any = null;
if (browser) {
 import('$lib/cache/cache-service.svelte').then(mod => {
 cacheService = mod.cache;
 });
}

export const load: LayoutLoad = async ({ fetch, params }) => {
 const cacheKey = `case-detail-${params.id}`;

 // Try cache first (if in browser)
 if (browser && cacheService) {
 const cached = await cacheService.get(cacheKey);
 if (cached) {
 console.log('✅ Cache hit: case-detail-' + params.id);
 return { caseData: cached, fromCache: true };
 }
 }

 // Cache miss - fetch from API
 console.log('📡 Fetching case from API: ' + params.id);
 const res = await fetch(`/api/v1/cases/${params.id}`);

 if (!res.ok) {
 throw error(res.status, `Failed to load case ${params.id}`);
 }

 const caseData = await res.json();

 // Save to cache (5 minute TTL)
 if (browser && cacheService) {
 await cacheService.set(cacheKey, caseData, {
 memory: true,
 persistent: true,
 ttl: 300000 // 5 minutes
 });
 console.log('💾 Cached: case-detail-' + params.id);
 }

 return {
 caseData,
 };
};
