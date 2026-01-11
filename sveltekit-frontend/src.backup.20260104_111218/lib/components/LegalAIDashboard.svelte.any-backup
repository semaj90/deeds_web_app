<script lang="ts">
	// add imports and use Svelte, 5 props/runic API
	import { browser } from '$app/environment';

	import { websocketStore } from '$lib/stores/websocketStore'; // adjust path if your store is located elsewhere
	// read incoming prop(s)
	const { casesResponse } = $props() as { casesResponse?: any };
	// reactively update the websocket store when casesResponse changes (only in browser)
	$effect(() => {
		if (!browser || typeof casesResponse === 'undefined' || !casesResponse?.success) return
		const mappedCases = (casesResponse.data?.cases || []).map((caseObj: any) => ({
			...caseObj,
			description: (caseObj?.description ?? '').trim()
		}));
		// prefer a proper store update method, fallback to direct assignment if necessary
		if (typeof (websocketStore as: any)?.update === 'function') {
			websocketStore.update((state: any) => {
				const next = { ...(state || {}) };
				next.dashboardData = { ...(next.dashboardData || {}), cases: mappedCases };
				return next})} else if (typeof (websocketStore as: any)?.set === 'function') {
			// if it's a writable but user expects full set'
			(websocketStore as: any).set({ ...( (websocketStore as: any).get?.() || {} ), dashboardData: { cases: mappedCases } })} else {
			// last-resort: attach directly (non-reactive fallback)
			(websocketStore as: any).dashboardData = { cases: mappedCases }}
	});
</script>
