import * as vscode from 'vscode';
import { GraphPanel }        from './graphPanel';
import { GraphTreeProvider } from './graphTree';
import { GraphStatusBar }    from './statusBar';
import { createClaudePlan }  from './claudePlan';
import { askGemma4AboutSelection } from './gemmaAsk';

export function activate(context: vscode.ExtensionContext) {
	// Tree view — cluster hierarchy in the Explorer sidebar
	const treeProvider = new GraphTreeProvider(context.extensionPath);
	const treeView = vscode.window.createTreeView('deedsGraphTree', {
		treeDataProvider: treeProvider,
		showCollapseAll:  true,
	});

	// Status bar — chunk count, polls SvelteKit dev server
	const statusBar = new GraphStatusBar();

	// WebView panel — search/filter with dual-layer text cache
	const showGraph = vscode.commands.registerCommand('deeds.showGraph', () => {
		GraphPanel.createOrShow(context);
	});

	// Reload tree + topology panel when graph JSON changes on disk
	const watcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(
			vscode.Uri.file(context.extensionPath + '/../sveltekit-frontend/docs/graph'),
			'*.json'
		)
	);
	watcher.onDidChange(() => { treeProvider.reload(); GraphPanel.reload(); });
	watcher.onDidCreate(() => { treeProvider.reload(); GraphPanel.reload(); });

	const refresh = vscode.commands.registerCommand('deeds.refreshGraph', () => {
		treeProvider.reload();
		GraphPanel.reload();
	});

	// Create Claude Plan — from tree item (cluster/node) or active editor
	const createPlan = vscode.commands.registerCommand(
		'deeds.createClaudePlan',
		async (item?: { kind?: string; clusterId?: string }) => {
			let clusterKey: string | undefined;
			let files: string[] | undefined;

			if (item?.kind === 'cluster' && item.clusterId) {
				clusterKey = treeProvider.getClusterLabel(item.clusterId);
				files = treeProvider.getClusterFiles(item.clusterId);
			} else if (item?.kind === 'node' && item.clusterId) {
				// Single file node — no cluster key, but pass the file
				const nodeFiles = treeProvider.getClusterFiles('__none__');
				files = nodeFiles.length ? [nodeFiles[0]] : undefined;
			}

			await createClaudePlan(context, clusterKey, files);
		}
	);

	// Ask Gemma4 — active editor selection, optionally cluster-context-aware
	const askGemma4 = vscode.commands.registerCommand(
		'deeds.askGemma4Selection',
		async (item?: { kind?: string; clusterId?: string }) => {
			let clusterKey: string | undefined;
			if (item?.kind === 'cluster' && item.clusterId) {
				clusterKey = treeProvider.getClusterLabel(item.clusterId);
			}
			const graphStatus = statusBar.getStatusText();
			await askGemma4AboutSelection(clusterKey, graphStatus);
		}
	);

	context.subscriptions.push(showGraph, refresh, createPlan, askGemma4, treeView, statusBar, watcher);
}

export function deactivate() {}