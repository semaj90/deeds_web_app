<script lang="ts">
	import type { PageData } from './$types';
	import type { FeeComparisonRow, FeeSyncManifest } from '$lib/server/fee-sync/types.js';

	let { data }: { data: PageData } = $props();
	let fiscalYear = $state('FY 2026-27');
	let environment = $state('DEV');
	let busy = $state(false);
	let errorMessage = $state('');
	let warnings = $state<string[]>([]);
	let sourceName = $state('');
	let sourceSha256 = $state('');
	let rows = $state<FeeComparisonRow[]>([]);
	let summary = $state({ matched: 0, changed: 0, review: 0, duplicates: 0, unchanged: 0 });
	let manifest = $state<FeeSyncManifest | null>(null);
	let deployResult = $state<any>(null);
	let filter = $state<'ALL' | 'CHANGED' | 'FLAT' | 'FORMULA' | 'TIER' | 'EXCEPTIONS'>('ALL');

	const visibleRows = () => rows.filter((row) => {
		if (filter === 'ALL') return true;
		if (filter === 'CHANGED') return row.changeRequired;
		if (filter === 'FLAT') return row.calculationType === 'Flat Fee';
		if (filter === 'FORMULA') return row.calculationType === 'Multiplier Fee';
		if (filter === 'TIER') return row.calculationType === 'Tier Fee';
		return !['UNCHANGED', 'CHANGED_FLAT'].includes(row.status);
	});

	async function analyze(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		errorMessage = '';
		manifest = null;
		deployResult = null;
		try {
			const form = new FormData(event.currentTarget as HTMLFormElement);
			form.set('action', 'analyze');
			const response = await fetch('/api/admin/fee-sync', { method: 'POST', body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? 'Analysis failed');
			sourceName = payload.sourceName;
			sourceSha256 = payload.sourceSha256;
			rows = payload.rows;
			summary = payload.summary;
			warnings = payload.warnings ?? [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Analysis failed';
		} finally {
			busy = false;
		}
	}

	async function approve() {
		busy = true;
		errorMessage = '';
		try {
			const form = new FormData();
			form.set('action', 'approve');
			form.set('rows', JSON.stringify(rows));
			form.set('fiscalYear', fiscalYear);
			form.set('environment', environment);
			form.set('sourceName', sourceName);
			form.set('sourceSha256', sourceSha256);
			const response = await fetch('/api/admin/fee-sync', { method: 'POST', body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? 'Approval failed');
			manifest = payload.manifest;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Approval failed';
		} finally {
			busy = false;
		}
	}

	async function deploy() {
		if (!manifest) return;
		busy = true;
		errorMessage = '';
		try {
			const form = new FormData();
			form.set('action', 'deploy');
			form.set('manifest', JSON.stringify(manifest));
			const response = await fetch('/api/admin/fee-sync', { method: 'POST', body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? 'Deployment failed');
			deployResult = payload;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Deployment failed';
		} finally {
			busy = false;
		}
	}

	function toggleApproval(index: number) {
		rows = rows.map((row, i) => i === index ? { ...row, approved: !row.approved } : row);
	}
</script>

<svelte:head><title>Fee Sync · Admin</title></svelte:head>

<div class="shell">
	<header>
		<div>
			<p class="eyebrow">Clariti / Salesforce</p>
			<h1>Master Fee Schedule Sync</h1>
			<p class="subtitle">Upload the official schedule, compare against active Salesforce fees, review changes, approve an immutable manifest, then deploy only verified DEV updates.</p>
		</div>
		<div class="connection" class:ok={data.status.salesforceConfigured}>
			<span class="dot"></span>
			{data.status.salesforceConfigured ? 'Salesforce connected' : 'Salesforce not configured'}
			<small>{data.status.writesEnabled ? 'writes enabled' : 'writes disabled'}</small>
		</div>
	</header>

	<form class="upload-card" onsubmit={analyze}>
		<div>
			<label for="pdf">Master Fee Schedule PDF</label>
			<input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" required />
		</div>
		<div>
			<label for="fiscalYear">Fiscal year</label>
			<input id="fiscalYear" bind:value={fiscalYear} />
		</div>
		<div>
			<label for="environment">Environment</label>
			<select id="environment" bind:value={environment}><option>DEV</option><option>QA</option><option>UAT</option><option>PROD</option></select>
		</div>
		<button type="submit" disabled={busy}>{busy ? 'Working…' : 'Upload & compare'}</button>
	</form>

	{#if errorMessage}<div class="alert error">{errorMessage}</div>{/if}
	{#each warnings as warning}<div class="alert warning">{warning}</div>{/each}

	<section class="metrics">
		<div><strong>{summary.matched}</strong><span>matched</span></div>
		<div><strong>{summary.changed}</strong><span>changed</span></div>
		<div><strong>{summary.review}</strong><span>review</span></div>
		<div><strong>{summary.duplicates}</strong><span>duplicates</span></div>
		<div><strong>{summary.unchanged}</strong><span>unchanged</span></div>
	</section>

	{#if rows.length}
		<section class="review-card">
			<div class="toolbar">
				<div class="filters">
					{#each ['ALL','CHANGED','FLAT','FORMULA','TIER','EXCEPTIONS'] as item}
						<button type="button" class:active={filter === item} onclick={() => filter = item as typeof filter}>{item}</button>
					{/each}
				</div>
				<button class="approve" type="button" onclick={approve} disabled={busy || summary.duplicates > 0}>Create approved manifest</button>
			</div>
			<div class="table-wrap">
				<table>
					<thead><tr><th>Approve</th><th>Template</th><th>SSF Code</th><th>Name</th><th>Type</th><th>Current</th><th>Published</th><th>Proposed</th><th>Status</th><th>Reason</th></tr></thead>
					<tbody>
						{#each visibleRows() as row}
							{@const sourceIndex = rows.findIndex((candidate) => candidate.canonicalKey === row.canonicalKey && candidate.salesforceId === row.salesforceId)}
							<tr class:changed={row.changeRequired} class:blocked={row.status.startsWith('DUPLICATE')}>
								<td><input type="checkbox" checked={row.approved ?? false} disabled={!row.changeRequired || row.status !== 'CHANGED_FLAT'} onchange={() => toggleApproval(sourceIndex)} /></td>
								<td class="mono">{row.canonicalKey}</td><td>{row.ssfCode ?? '—'}</td><td>{row.name}</td><td>{row.calculationType}</td>
								<td>{row.currentValue ?? '—'}</td><td>{row.publishedValue ?? '—'}</td><td>{row.proposedValue ?? '—'}</td>
								<td><span class="status">{row.status}</span></td><td>{row.reason ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	{#if manifest}
		<section class="manifest-card">
			<div><p class="eyebrow">Approved manifest</p><h2>{manifest.rows.length} approved changes</h2><code>{manifest.hash}</code><p>{manifest.sourceName} · {manifest.fiscalYear} · {manifest.environment}</p></div>
			<button type="button" onclick={deploy} disabled={busy || !data.status.writesEnabled}>{data.status.writesEnabled ? 'Deploy DEV' : 'Deploy disabled by server'}</button>
		</section>
	{/if}

	{#if deployResult}
		<section class="verified" class:failed={!deployResult.verified}><strong>{deployResult.verified ? '✓ VERIFIED' : '✕ VERIFY FAILED'}</strong><span>{deployResult.verification?.filter((r: any) => r.ok).length ?? 0}/{deployResult.verification?.length ?? 0} read back successfully</span></section>
	{/if}
</div>

<style>
	.shell{padding:2rem;max-width:1500px;margin:0 auto;color:#e8edf3}.shell header{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;margin-bottom:1.5rem}.eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.16em;color:#8da0b6;margin:0 0 .45rem}h1{margin:0;font-size:2.2rem}.subtitle{max-width:800px;color:#a9b5c4}.connection{padding:.8rem 1rem;border:1px solid #5a3440;background:#21171b;border-radius:10px;display:grid;grid-template-columns:auto 1fr;gap:.2rem .5rem;align-items:center}.connection.ok{border-color:#315b46;background:#14231b}.connection small{grid-column:2;color:#98a6b6}.dot{width:9px;height:9px;border-radius:50%;background:#d05a6d}.connection.ok .dot{background:#55c486}.upload-card,.review-card,.manifest-card,.metrics,.verified{background:#111820;border:1px solid #263341;border-radius:14px}.upload-card{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:1rem;padding:1rem;align-items:end}.upload-card label{display:block;font-size:.78rem;color:#9cacbd;margin-bottom:.35rem}.upload-card input,.upload-card select{width:100%;background:#0b1118;border:1px solid #344150;color:#e8edf3;border-radius:8px;padding:.65rem}.upload-card button,.approve,.manifest-card button{background:#e2b85b;color:#18130a;border:0;border-radius:8px;padding:.7rem 1rem;font-weight:700}.upload-card button:disabled,.approve:disabled,.manifest-card button:disabled{opacity:.45}.metrics{display:grid;grid-template-columns:repeat(5,1fr);margin:1rem 0}.metrics div{padding:1rem;border-right:1px solid #263341}.metrics div:last-child{border-right:0}.metrics strong{font-size:1.7rem;display:block}.metrics span{color:#95a4b4;font-size:.8rem}.toolbar{display:flex;justify-content:space-between;gap:1rem;padding:1rem}.filters{display:flex;gap:.4rem;flex-wrap:wrap}.filters button{background:#17222d;color:#aebac8;border:1px solid #304152;border-radius:999px;padding:.45rem .7rem}.filters button.active{background:#31465d;color:white}.table-wrap{overflow:auto;border-top:1px solid #263341}table{width:100%;border-collapse:collapse;min-width:1200px}th,td{text-align:left;padding:.72rem;border-bottom:1px solid #202d39;vertical-align:top}th{font-size:.72rem;text-transform:uppercase;color:#8fa0b3;background:#121c26;position:sticky;top:0}td{font-size:.86rem}.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.changed td{background:#211d13}.blocked td{background:#28171b}.status{font-size:.72rem;background:#202f3e;padding:.25rem .45rem;border-radius:6px;white-space:nowrap}.manifest-card{margin-top:1rem;padding:1rem;display:flex;justify-content:space-between;align-items:center}.manifest-card h2{margin:.1rem 0 .5rem}.manifest-card code{font-size:.72rem;color:#9fb0c2}.verified{margin-top:1rem;padding:1rem;display:flex;gap:1rem;align-items:center;border-color:#315b46}.verified.failed{border-color:#773b48}.alert{padding:.8rem 1rem;border-radius:8px;margin-top:.75rem}.alert.error{background:#2d171c;border:1px solid #773b48}.alert.warning{background:#2a2415;border:1px solid #6e5a25}@media(max-width:900px){.upload-card{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.shell header{flex-direction:column}}
</style>
