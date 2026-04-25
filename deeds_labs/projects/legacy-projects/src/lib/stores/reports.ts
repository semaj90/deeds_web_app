import { writable } from 'svelte/store';
import type { Report } from '$lib/types';

export const reports = writable<Report[]>([]);
export const activeReport = writable<Report | null>(null);
export const isSaving = writable(false);

export async function saveReport(report: Report) {
  isSaving.set(true);
  try {
    const res = await fetch('/api/reports/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!res.ok) throw new Error(await res.text());
    const saved = (await res.json()) as Report;
    reports.update((r) => r.map((x) => (x.id === saved.id ? saved : x)));
  } catch (err) {
    console.error('Save failed:', err);
  } finally {
    isSaving.set(false);
  }
}
