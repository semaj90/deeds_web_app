import { writable } from 'svelte/store';
import type { Evidence } from '../types/api.js';

type EvidenceState = {
 /* primary shape used by consumers */
 evidence: Evidence[];
 isLoading: boolean;
 error: unknown | null;
 [k: string]: unknown;
};

const initialState: EvidenceState = {
 evidence: [],
 isLoading: false,
 error: null,
};

const { subscribe, set, update } = writable<EvidenceState>(initialState);

/**
 * Minimal evidenceStore compatible with existing consumers.
 * Exposes Svelte store subscribe and a few helper methods.
 */
export const evidenceStore = {
 subscribe,
 set,
 update,
 add(item: Evidence) {
 update((s) => ({ ...s, evidence: [...(s.evidence || []), item] }));
 },
 removeById(id: string) {
 update((s) => ({ ...s, evidence: (s.evidence || []).filter((e) => (e as any).id !== id) }));
 },
 clear() {
 set(initialState);
 },
 setLoading(v: boolean) {
 update((s) => ({ ...s, isLoading: v }));
 },
 setError(err: any) {
 update((s) => ({ ...s, error: err }));
 },
};
