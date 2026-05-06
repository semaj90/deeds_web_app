/**
 * GraphPanel — WebView topology viewer with WebGPU compute + Canvas 2D render.
 *
 * Cache layers:
 *   Layer 1 (session):  acquireVsCodeApi().setState()  — survives hide/show
 *   Layer 2 (durable):  workspaceState                 — survives VS Code restart
 *
 * Graph data is loaded via localGraphCache (worker_threads, non-blocking).
 * The media/topology-viewer.js script handles all rendering and interaction.
 * Selecting a node in the viewer opens the file in the editor.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { load as loadGraph, invalidate } from './localGraphCache';

const PANEL_ID  = 'deedsTopology';
const CACHE_KEY = 'deedsGraph.viewerState';

export class GraphPanel {
	private static current: GraphPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private readonly disposables: vscode.Disposable[] = [];

	static createOrShow(context: vscode.ExtensionContext) {
		if (GraphPanel.current) {
			GraphPanel.current.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}
		GraphPanel.current = new GraphPanel(context);
	}

	/** Highlight nodes in the open panel (called from tree-item selection). */
	static highlight(ids: string[]) {
		GraphPanel.current?.panel.webview.postMessage({ type: 'highlight', ids });
	}

	/** Reload graph data in the open panel (called on file-watcher change or refresh command). */
	static reload() {
		GraphPanel.current?.reload();
	}

	private constructor(context: vscode.ExtensionContext) {
		this.context = context;

		const mediaDir = vscode.Uri.file(path.join(context.extensionPath, 'media'));

		this.panel = vscode.window.createWebviewPanel(
			PANEL_ID,
			'Deeds — Topology',
			vscode.ViewColumn.Beside,
			{
				enableScripts:          true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					mediaDir,
					vscode.Uri.file(path.join(context.extensionPath, 'out')),
				],
			}
		);

		const viewerUri = this.panel.webview.asWebviewUri(
			vscode.Uri.file(path.join(context.extensionPath, 'media', 'topology-viewer.js'))
		);
		const savedState = context.workspaceState.get(CACHE_KEY, {});
		this.panel.webview.html = buildHtml(this.panel.webview, viewerUri, savedState);

		// Push graph data once the WebView signals it is ready (or after 300 ms)
		const pushData = () => {
			loadGraph(context.extensionPath).then(data => {
				// Cap nodes for rendering performance; edges already sliced in viewer
				const nodes    = data.nodes.slice(0, 1500);
				const edges    = data.edges.slice(0, 4000);
				const clusters = data.clusters;
				this.panel.webview.postMessage({ type: 'loadData', nodes, edges, clusters });
			});
		};

		// Give the WebView 300 ms to execute its bootstrap then push data.
		// If the viewer fires 'ready' we push sooner (handled in onDidReceiveMessage).
		let pushed = false;
		const timer = setTimeout(() => { pushed = true; pushData(); }, 300);

		this.panel.webview.onDidReceiveMessage(
			(msg: { type: string; id?: string; label?: string; cluster?: number; state?: unknown }) => {
				switch (msg.type) {
					case 'ready':
						if (!pushed) { clearTimeout(timer); pushed = true; pushData(); }
						break;

					case 'nodeSelected':
						if (msg.id) this.openNode(msg.id);
						break;

					case 'stateUpdate':
						context.workspaceState.update(CACHE_KEY, msg.state);
						break;
				}
			},
			null,
			this.disposables
		);

		// Save state on hide so workspaceState is fresh before restart
		this.panel.onDidChangeViewState(({ webviewPanel }) => {
			if (!webviewPanel.visible) {
				this.panel.webview.postMessage({ type: 'requestState' });
			}
		}, null, this.disposables);

		this.panel.onDidDispose(() => {
			clearTimeout(timer);
			GraphPanel.current = undefined;
			this.disposables.forEach(d => d.dispose());
		}, null, this.disposables);
	}

	private openNode(id: string) {
		// id is usually a workspace-relative path (e.g. "src/lib/server/graph/hypergraph-4d.ts")
		const root = path.join(this.context.extensionPath, '..', 'sveltekit-frontend');
		const candidates = [
			path.join(root, id),
			path.join(this.context.extensionPath, '..', id),
		];
		for (const p of candidates) {
			try {
				const uri = vscode.Uri.file(p);
				vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
				return;
			} catch { /* try next candidate */ }
		}
	}

	/** Reload graph data and push to viewer (e.g. after graphify run). */
	reload() {
		invalidate();
		loadGraph(this.context.extensionPath).then(data => {
			this.panel.webview.postMessage({
				type: 'loadData',
				nodes:    data.nodes.slice(0, 1500),
				edges:    data.edges.slice(0, 4000),
				clusters: data.clusters,
			});
		});
	}
}

function buildHtml(
	webview: vscode.Webview,
	viewerUri: vscode.Uri,
	savedState: unknown,
): string {
	const stateJson = JSON.stringify(savedState).replace(/</g, '\\u003c');
	const csp = [
		`default-src 'none'`,
		`script-src ${webview.cspSource} 'unsafe-inline'`,
		`style-src 'unsafe-inline'`,
		`img-src ${webview.cspSource} data:`,
	].join('; ');

	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Deeds — Topology</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-editor-background);
      overflow: hidden;
      width: 100vw; height: 100vh;
    }
    #canvas { display: block; width: 100%; height: 100%; }
    #overlay {
      position: fixed; top: 6px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 6px; align-items: center;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      pointer-events: none;
      opacity: 0.85;
    }
    #gpu-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="overlay">
    <span id="node-count">Loading…</span>
    <span id="gpu-badge" style="display:none">WebGPU</span>
  </div>

  <!-- Topology viewer: Canvas render + optional WebGPU compute boost -->
  <script src="${viewerUri}"></script>
  <script>
    // Patch the viewer's draw() to update the overlay counter after loadData.
    // The viewer fires window dispatchEvent('deedsDataLoaded') after initLayout().
    window.addEventListener('deedsDataLoaded', function(e) {
      const d = e.detail || {};
      document.getElementById('node-count').textContent =
        (d.nodeCount || 0) + ' nodes  •  ' + (d.edgeCount || 0) + ' edges';
      if (d.gpuBoosted) {
        document.getElementById('gpu-badge').style.display = '';
      }
    });

    // Restore durable state from workspaceState
    const _savedState = ${stateJson};
    if (_savedState && Object.keys(_savedState).length) {
      // The viewer initialises from vscode.getState() on its own;
      // workspaceState is the durable fallback — merge if session state is empty.
      if (!window.__deedsViewerStateRestored) {
        const vs = typeof acquireVsCodeApi === 'function'
          ? acquireVsCodeApi().getState()
          : null;
        if (!vs || !vs.zoom) {
          // Inject as session state so the viewer's own bootstrap picks it up
          try { acquireVsCodeApi().setState(_savedState); } catch {}
        }
      }
    }
  </script>
</body>
</html>`;
}
