import { browser } from '$app/environment';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { PageLoad } from './$types.js';

// Dynamically import cache service
let cacheService: CachingTypes.UnifiedCache<unknown> | null = null;
if (browser) {
    import('$lib/cache/cache-service.svelte').then(mod => {
        cacheService = mod.cache;
    });
}

export const load: PageLoad = async ({ fetch, params }) => {
    const caseId = params.id;
    const evidenceKey = `evidence-${caseId}`;
    const personsKey = `persons-${caseId}`;

    let evidence = [];
    let persons = [];

    // Try cache first for evidence
    if (browser && cacheService) {
        const cachedEvidence = await cacheService.get(evidenceKey);
        const cachedPersons = await cacheService.get(personsKey);

        if (cachedEvidence && cachedPersons) {
            console.log('✅ Cache hit: evidence + persons for case ' + caseId);
            return {
                caseId,
                evidence: cachedEvidence,
                persons: cachedPersons,
                fromCache: true
            };
        }
    }

    // Cache miss - execute fetches in parallel
    console.log('📡 Fetching evidence + persons from API for case ' + caseId);
    const [evidenceRes, personsRes] = await Promise.all([
        fetch(`/api/v1/evidence/by-case/${caseId}`),
        fetch(`/api/v1/cases/${caseId}/persons`)
    ]);

    evidence = evidenceRes.ok ? await evidenceRes.json() : [];
    persons = personsRes.ok ? await personsRes.json() : [];

    // Cache results (10 minute TTL)
    if (browser && cacheService) {
        await Promise.all([
            cacheService.set(evidenceKey, evidence, {
                memory: true,
                persistent: true,
                ttl: 600000 // 10 minutes
            }),
            cacheService.set(personsKey, persons, {
                memory: true,
                persistent: true,
                ttl: 600000
            })
        ]);
        console.log('💾 Cached: evidence + persons for case ' + caseId);
    }

    return {
        caseId,
        evidence,
        persons,
    };
};
