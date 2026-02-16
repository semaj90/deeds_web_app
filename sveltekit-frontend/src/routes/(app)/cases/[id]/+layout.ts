import { browser } from '$app/environment';
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
 return { caseData: cached, fromCache: true, loadError: null };
 }
 }

 let res: Response;
 try {
 res = await fetch(`/api/cases/${params.id}`);
 } catch {
 return { caseData: null, fromCache: false, loadError: 'Network error loading case' };
 }

 if (!res.ok) {
 return { caseData: null, fromCache: false, loadError: `Failed to load case (${res.status})` };
 }

 let caseData: any;
 try {
 caseData = await res.json();
 } catch {
 return { caseData: null, fromCache: false, loadError: 'Invalid response from server' };
 }

 // Save to cache (5 minute TTL)
 if (browser && cacheService) {
 await cacheService.set(cacheKey, caseData, {
 memory: true,
 persistent: true,
 ttl: 300000 // 5 minutes
 });
 }

 return {
 caseData,
 fromCache: false,
 loadError: null
 };
};
