/**
 * statusBar.ts — Right-side status bar showing TRACE health + chunk count.
 * Polls /api/code-intel/health every 30 s. Silent when server is offline.
 */

import * as vscode from 'vscode';
import { fetchHealth, fetchIndexStats } from './traceClient';

export class GraphStatusBar {
	private readonly item: vscode.StatusBarItem;
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.item.command = 'deeds.showGraph';
		this.item.text    = '$(graph) Deeds';
		this.item.tooltip = 'Deeds — Show Codebase Graph (click)';
		this.item.show();

		this.refresh();
		this.timer = setInterval(() => this.refresh(), 30_000);
	}

	private refresh() {
		// Prefer the richer health endpoint; fall back to stats endpoint
		fetchHealth()
			.then(h => {
				if (h.status === 'offline') {
					this.item.text = '$(graph) Deeds';
					this.item.backgroundColor = undefined;
					return;
				}
				const icon = h.status === 'ok' ? '$(graph)' : '$(warning)';
				const chunks = h.indexedChunks > 0 ? `  ${h.indexedChunks.toLocaleString()} chunks` : '';
				const clust  = h.clusters > 0     ? `  ${h.clusters} clusters` : '';
				this.item.text = `${icon} Deeds${chunks}${clust}`;
				this.item.tooltip = [
					`Deeds codebase index`,
					`Status: ${h.status}`,
					h.indexedChunks ? `Chunks: ${h.indexedChunks.toLocaleString()}` : '',
					h.clusters      ? `Clusters: ${h.clusters}` : '',
					h.lastIndexed   ? `Last indexed: ${h.lastIndexed}` : '',
					'Click to open graph',
				].filter(Boolean).join('\n');
				this.item.backgroundColor = h.status === 'degraded'
					? new vscode.ThemeColor('statusBarItem.warningBackground')
					: undefined;
			})
			.catch(() => {
				// Second attempt via stats endpoint
				fetchIndexStats()
					.then(s => {
						if (s.totalChunks > 0) {
							this.item.text = `$(graph) Deeds  ${s.totalChunks.toLocaleString()} chunks`;
						}
					})
					.catch(() => { /* stay neutral */ });
			});
	}

	/** Returns the current status bar text for use in Gemma4 context prompts. */
	getStatusText(): string {
		return this.item.text.replace(/\$\(\w[\w-]*\)\s*/g, '').trim();
	}

	dispose() {
		if (this.timer) clearInterval(this.timer);
		this.item.dispose();
	}
}
