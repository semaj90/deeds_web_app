import { browser } from '$app/environment';
import type { LayoutLoad } from './$types.js';

// Dynamically import cache service (browser only)
let cacheService: any = null;
if (browser) {
 import('$lib/cache/cache-service.svelte').then(mod => {
 cacheService = mod.cache;
 });
}

function normalizeCaseResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;

  const response = payload as Record<string, unknown>;
  const nestedCase = response.data;

  if (nestedCase && typeof nestedCase === 'object' && !Array.isArray(nestedCase)) {
    return nestedCase;
  }

  if ('id' in response && typeof response.id === 'string') {
    return response;
  }

  return null;
}

export const load: LayoutLoad = async ({ fetch, params }) => {
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id);
  if (!isValidUUID) {
    return { caseData: null, fromCache: false, loadError: 'Invalid case ID format' };
  }

  const cacheKey = `case-detail-${params.id}`;

  // Try cache first (if in browser)
  if (browser && cacheService) {
    const cached = await cacheService.get(cacheKey);
    const normalizedCachedCase = normalizeCaseResponse(cached);
    if (normalizedCachedCase) {
      return { caseData: normalizedCachedCase, fromCache: true, loadError: null };
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

  let caseData: unknown;
  try {
    caseData = await res.json();
  } catch {
    return { caseData: null, fromCache: false, loadError: 'Invalid response from server' };
  }

  const normalizedCase = normalizeCaseResponse(caseData);
  if (!normalizedCase) {
    return { caseData: null, fromCache: false, loadError: 'Invalid case response shape' };
  }

  // Save to cache (5 minute TTL)
  if (browser && cacheService) {
    await cacheService.set(cacheKey, normalizedCase, {
      memory: true,
      persistent: true,
      ttl: 300000, // 5 minutes
    });
  }

  return {
    caseData: normalizedCase,
    fromCache: false,
    loadError: null,
  };
};
