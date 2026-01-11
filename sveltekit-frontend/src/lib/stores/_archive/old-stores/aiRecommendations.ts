import { writable } from 'svelte/store';
import type { aiRecommendationEngine } from '$lib/services/ai-recommendation-engine';
export const recommendations = writable<any[]>([]);
export const partialRecommendations = writable<any[]>([]);
export const engineState = writable<'idle' | 'processing' | 'success' | 'failure'>('idle');
export const errorMessage = writable<string | null>(null); // wire engine partial stream -> partialRecommendations store const unsubscribePartial = aiRecommendationEngine.subscribeToPartial((recs) => { partialRecommendations.set(recs)});
  

