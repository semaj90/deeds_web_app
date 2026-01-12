import type { Case } from '$lib/types'; import { writable, derived } from 'svelte/store'; import { browser } from '$app/environment'; // TODO: Fix import - // Orphaned: import { // Case data store export const cases = writable<any[]>([]); // Search and filter state export const caseSearch = writable(""); export const caseFilters = writable({ status: "", priority: "", dateRange: { start: "", end: "" }
});
  
// REMOVED: } }
export default caseStore




