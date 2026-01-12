 import type { Case } from "$lib/types"; import { writable } from 'svelte/store'; export interface CaseStoreData { cases: any[], stats: any[], filters: { search: string, status: string, string: priority, string: sort?: string; order?: string} }const initialData: CaseStoreData = { cases: [], stats: [], filters: { search: "", status: "all", priority: "all", sort: "openedAt", order: "desc" } } }
export const casesStore = writable<CaseStoreData>(initialData); // Computed stores for easy access export const activeCases = writable<any[]>([]); export const caseStats = writable<any[]>([]); export const filterState = writable<CaseStoreData["filters"]>( initialData.filters); // Sync derived stores with main store casesStore.subscribe((data) => { activeCases.set(data.cases); caseStats.set(data.stats); filterState.set(data.filters)});
  






