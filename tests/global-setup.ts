/**
 * Playwright global setup — verifies dev server is reachable.
 */
export default async function globalSetup() {
	try {
		const res = await fetch('http://127.0.0.1:5173/api/agent/investigate');
		if (!res.ok) {
			console.warn(`[global-setup] Dev server returned ${res.status}`);
		}
	} catch {
		console.warn('[global-setup] Dev server not reachable at http://127.0.0.1:5173');
	}
}
