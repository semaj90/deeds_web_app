/**
 * API Client — Fetch wrapper for SvelteKit API routes
 * Used by app-store.svelte.ts for client-side data fetching
 */

// Types
export interface Case {
	id: string;
	title: string;
	description?: string;
	status: string;
	priority: string;
	createdAt: string;
	updatedAt: string;
	evidenceCount?: number;
	poiCount?: number;
}

export interface CaseStats {
	total: number;
	open: number;
	closed: number;
	investigating: number;
}

export interface Evidence {
	id: string;
	title: string;
	type: string;
	status: string;
	caseId?: string;
	createdAt: string;
}

export interface EvidenceStats {
	total: number;
	processed: number;
	pending: number;
}

export interface PersonOfInterest {
	id: string;
	name: string;
	status: string;
	threatLevel: string;
	createdAt: string;
}

export interface SearchResult {
	id: string;
	type: string;
	title: string;
	snippet: string;
	score: number;
}

export interface SystemMetrics {
	services: Record<string, { status: string; latency?: number }>;
	gpu?: any;
}

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
	try {
		const res = await fetch(url, init);
		return await res.json();
	} catch {
		return { success: false, error: 'Network error' };
	}
}

export const caseApi = {
	getCases: (params?: Record<string, any>) => {
		const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : '';
		return apiFetch<{ items: Case[] }>(`/api/cases${qs}`);
	},
	getCaseStats: () => apiFetch<CaseStats>('/api/cases/stats'),
	createCase: (data: any) => apiFetch<Case>('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
	updateCase: (id: string, data: any) => apiFetch<Case>(`/api/cases/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
};

export const evidenceApi = {
	getEvidence: (params?: Record<string, any>) => {
		const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : '';
		return apiFetch<{ items: Evidence[] }>(`/api/evidence${qs}`);
	},
	getEvidenceStats: () => apiFetch<EvidenceStats>('/api/evidence/stats'),
	uploadEvidence: (formData: FormData) => apiFetch<Evidence>('/api/evidence', { method: 'POST', body: formData }),
};

export const poiApi = {
	getPOIs: (params?: Record<string, any>) => {
		const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : '';
		return apiFetch<{ items: PersonOfInterest[] }>(`/api/persons-of-interest${qs}`);
	},
	createPOI: (data: any) => apiFetch<PersonOfInterest>('/api/persons-of-interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
};

export const searchApi = {
	searchGlobal: (query: string, filters?: any) => {
		const params = new URLSearchParams({ q: query });
		if (filters?.type) params.set('type', Array.isArray(filters.type) ? filters.type[0] : filters.type);
		if (filters?.limit) params.set('limit', String(filters.limit));
		return apiFetch<SearchResult[]>(`/api/search?${params}`);
	},
};

export const systemApi = {
	getMetrics: () => apiFetch<SystemMetrics>('/api/health'),
	getGPUMetrics: () => apiFetch<any>('/api/health/gpu'),
};
