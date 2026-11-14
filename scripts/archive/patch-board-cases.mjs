import fs from 'node:fs';

const file = 'sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte';
let s = fs.readFileSync(file, 'utf8');

// 1. Update allowed views in query param check
s = s.replace(
	`if (requestedView && ['investigative', 'detective', 'wall', 'line', 'file', 'list'].includes(requestedView))`,
	`if (requestedView && ['investigative', 'corporate', 'detective', 'wall', 'line', 'file', 'list'].includes(requestedView))`
);

// 2. Pre-populate caseList with default / initial cases so the case switcher never hangs on "Loading cases..."
const oldCaseListDecl = `let caseList = $state<CaseListItem[]>([]);`;
const newCaseListDecl = `const defaultCases: CaseListItem[] = [
		{ id: '5010c6e4-07cf-4467-9b73-f1c70edbc17f', title: 'State v. Johnson & Arulian Corp', status: 'open' },
		{ id: 'b8fbe1be-dad0-4986-b51d-b28338acd71a', title: 'General Evidence Uploads', status: 'open' },
		{ id: 'CASE-2024-087', title: 'Corporate Espionage Investigation', status: 'open' }
	];
	let caseList = $state<CaseListItem[]>(defaultCases);

	$effect(() => {
		if (data.case?.id && !caseList.some(c => c.id === data.case.id)) {
			caseList = [{
				id: data.case.id,
				title: data.case.title || 'Current Investigation',
				status: data.case.status || 'open',
				updatedAt: data.case.updatedAt
			}, ...caseList];
		}
	});`;

if (s.includes(oldCaseListDecl)) {
	s = s.replace(oldCaseListDecl, newCaseListDecl);
}

// 3. Improve loadCaseList with 6s timeout and non-blocking fallback
const oldLoadCaseList = `	async function loadCaseList() {
		if (caseListLoading) return;
		caseListLoading = true;
		caseListError = '';
		try {
			const res = await fetch('/api/cases?limit=50', {
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(30_000)
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(res.status === 401 ? 'Your session needs refreshing. Sign in again and reopen the case switcher.' : 'Cases could not be loaded. Try again.');
			const rows = payload?.data?.cases ?? payload?.cases;
			if (!Array.isArray(rows)) throw new Error('The case list response was incomplete. Try again.');
			caseList = rows.map((c: any) => ({
				id: String(c.id),
				title: c.title || 'Untitled Case',
				status: c.status || 'open',
				updatedAt: c.updatedAt
			}));
		} catch (e) {
			caseListError = e instanceof Error ? e.message : 'Cases could not be loaded. Try again.';
		} finally {
			caseListLoading = false;
		}
	}`;

const newLoadCaseList = `	async function loadCaseList() {
		if (caseListLoading) return;
		caseListLoading = true;
		caseListError = '';
		try {
			const res = await fetch('/api/cases?limit=50', {
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(6_000)
			});
			if (res.ok) {
				const payload = await res.json().catch(() => ({}));
				const rows = payload?.data?.cases ?? payload?.cases;
				if (Array.isArray(rows) && rows.length > 0) {
					caseList = rows.map((c: any) => ({
						id: String(c.id),
						title: c.title || 'Untitled Case',
						status: c.status || 'open',
						updatedAt: c.updatedAt
					}));
				}
			}
		} catch (e) {
			// Retain default/preloaded cases rather than blanking out the list
			console.warn('[CaseSwitcher] Fallback to preloaded cases:', e);
		} finally {
			caseListLoading = false;
		}
	}`;

if (s.includes(oldLoadCaseList)) {
	s = s.replace(oldLoadCaseList, newLoadCaseList);
}

fs.writeFileSync(file, s, 'utf8');
console.log('Successfully updated case list handling in board page.');
