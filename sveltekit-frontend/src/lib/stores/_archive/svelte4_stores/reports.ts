import { writable } from 'svelte/store';

export type ReportDraft = {
 id?: string;
 userId?: string;
 title?: string;
 content?: string;
};

export const reports = writable<ReportDraft[]>([]);
export const activeReport = writable<ReportDraft | null>(null);
export const isSaving = writable(false);

export async function saveReport(draft: ReportDraft): Promise<void> {
 isSaving.set(true);
 try {
 const res = await fetch('/api/reports/save', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(draft),
 });
 if (!res.ok) throw new Error(await res.text());
 const saved = await res.json();
 // update store
 reports.update((list) => {
 const idx = list.findIndex((r) => r.id === saved.id);
 if (idx >= 0) {
 list[idx] = saved;
 } else {
 list.unshift(saved);
 }
 return list;
 });
 activeReport.set(saved);
 return saved;
 } catch (e) {
 console.error('saveReport error', e);
 throw e;
 } finally {
 isSaving.set(false);
 }
}

export async function loadReports(): Promise<any> {
 try {
 const res = await fetch('/api/reports');
 if (!res.ok) return [];
 const list = await res.json();
 reports.set(list);
 if (list.length > 0) activeReport.set(list[0]);
 return list;
 } catch (e) {
 console.warn('loadReports failed', e);
 return [];
 }
}


