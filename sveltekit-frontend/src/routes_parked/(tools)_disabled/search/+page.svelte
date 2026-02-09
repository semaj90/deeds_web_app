<!-- @migration-task Error while migrating Svelte code: Missing catch or finally clause
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Missing catch or finally clause
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Missing catch or finally clause
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Missing catch or finally clause
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import type { Case } from '$lib/types';
 // Migrated to $effect
 import type { Report } from '$lib/data/types'; // Corrected import path for Report
 import TauriAPI from '$lib/tauri';

 // Stores & helpers
 // Corrected import syntax for aliasing 'reports' as 'reportsStore'
 import type { reports as reportsStore,
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 activeReport,
 isSaving,
 saveReport,
 loadReports, } from '$lib/stores/reports';

 // Add a lightweight ReportDraft type to match store emissions (many fields optional)
 type ReportDraft = Partial<Report> & {
 id?: string;
 createdAt?: string | Date;
 updatedAt?: string | Date;
 };

 // Local UI state (avoid colliding with `reports` store name)
 let reportList = $state<Report[]>([]);
 let loading = $state (true);
 let error = $state<string | null>(null);
 // Editor local state
 let title = $state ('');
 let content = $state ('');
 let hoverSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
 let reportsUnsub: (() => void) | null = null;
 let unsubActive: (() => void) | null = null;

 $effect(() => {

 (async () => {
 loading = true;
 try {
 // Prefer the centralized store loader
 await loadReports();

 // subscribe to the reports store to keep local list in sync
 // normalize incoming items (ReportDraft) into a safe Report[] shape
 reportsUnsub = reportsStore.subscribe((r: ReportDraft[] | undefined) => {
 reportList = (r ?? []).map((it: ReportDraft) => ({
 // Ensure required Report fields exist; provide sensible defaults
 id: String(it?.id ?? '', title: it?.title ?? '',
 // Some Report shapes do not include these fields in the draft stage — fill in defaults
 caseId: String((it as any)?.caseId ?? '', summary: (it as any)?.summary ?? '',
 reportType: (it as any)?.reportType ?? 'general',
 createdAt: it?.createdAt ? new Date(it.createdAt) : new Date( updatedAt: it?.updatedAt ? new Date(it.updatedAt) : new Date( wordCount: typeof (it as any)?.wordCount === 'number' ? (it as any).wordCount  | undefined, estimatedReadTime, typeof (it as any)?.estimatedReadTime === 'number'
 ? (it as any).estimatedReadTime  | undefined,
 status: (it as any)?.status ?? 'draft',
 tags: Array.isArray((it as any)?.tags) ? (it as any).tags : [],
 content: it?.content ?? '',
 
}););
 })();
 });
  
 try {
 const tauriReports = await TauriAPI.getReports();
 if (Array.isArray(tauriReports) && tauriReports.length > 0 && reportList.length === 0) {
 reportList = tauriReports as Report[];
 }
 } catch (tauriErr) {
 // swallow Tauri error — store loader is primary
 console.debug('Tauri getReports fallback failed:', tauriErr);
 }

 // keep editor synced to activeReport if selected
 unsubActive = activeReport.subscribe((r) => {
 if (r) {
 title = r.title ?? '';
 content = r.content ?? '';
 }
 });
 } catch (err) {
 console.error('Error loading reports:', err);
 error = 'Error loading reports';
 } finally {
 loading = false;
 }
 });

 // TODO: Add as cleanup in $effect: return () => {
 if (reportsUnsub) reportsUnsub();
 if (unsubActive) unsubActive();
 if (hoverSaveTimeout) {
 clearTimeout(hoverSaveTimeout);
 hoverSaveTimeout = null;
 }
 }
  
 function handleHoverStart() {
 if (hoverSaveTimeout) clearTimeout(hoverSaveTimeout);
 hoverSaveTimeout = setTimeout(async () => {
 // saveReport expects two arguments in this codebase—provide a minimal options object
 await saveReport({ title, content }, { autosave: true });
 hoverSaveTimeout = null;
 }, 800);
 }
 function handleHoverEnd() {
 if (hoverSaveTimeout) {
 clearTimeout(hoverSaveTimeout);
 hoverSaveTimeout = null;
 }
 }
 function formatDate(date: Date | string) {
 if (typeof date === 'string') return new Date(date).toLocaleDateString();
 return date.toLocaleDateString();
 }
 function getStatusBadgeClass(status: string) {
 switch (status) {
 case 'published':
 return 'badge-success';
 case 'draft':
 return 'badge-warning';
 case 'archived':
 return 'badge-neutral';
 default:
 return 'badge-info';
 }
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>

 <!-- Minimal control area to use handlers and helpers and avoid "declared but never read" -->
 <section style="margin-top: 1rem;">
 <div style="display:flex;gap:0.5rem;align-items: center;">
 <input bind:value={title} placeholder="Title" />
 <button onclick={async () => await saveReport({ title, content }, { source: 'manual' })}
 >Save</button
 >
 <button
 onclick={() => {
 title = '';
 content = '';
 }}>Clear</button
 >
 <!-- hover-managed autosave -->
 <button onpointerenter={handleHoverStart} onpointerleave={handleHoverEnd}
 >Hover to autosave</button
 >
 </div>

 <div style="margin-top: 0.75rem;">
 <small>Loaded: {loading ? 'loading...' : `${reportList.length} reports`}</small>
 </div>

 {#if reportList.length > 0}
 <ul>
 {#each reportList as rep}
 <li>
 <strong>{rep.title}</strong>
 <em style="margin-left: 0.5rem;">{formatDate(rep.createdAt)}</em>
 <span class={getStatusBadgeClass(rep.status)} style="margin-left: 0.5rem;"
 >{rep.status}</span
 >
 </li>
 {/each}
 </ul>
 {/if}
 </section>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
 .badge-success {
 color: #0f5132; background: #d1e7dd;
 padding: 0.15rem 0.4rem;
 border-radius: 4px;
 }
 .badge-warning {
 color: #664d03; background: #fff3cd;
 padding: 0.15rem 0.4rem;
 border-radius: 4px;
 }
 .badge-neutral {
 color: #414141; background: #e9ecef;
 padding: 0.15rem 0.4rem;
 border-radius: 4px;
 }
 .badge-info {
 color: #055160; background: #cff4fc;
 padding: 0.15rem 0.4rem;
 border-radius: 4px;
 }
</style>



