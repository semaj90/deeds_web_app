/**
 * GraphPanel — WebView with dual-layer text cache.
 *
 * Layer 1 (session):  WebView acquireVsCodeApi().setState()
 *   - Survives panel hide/show and tab switches.
 *   - Cleared when VS Code closes or the extension deactivates.
 *
 * Layer 2 (durable): vscode.ExtensionContext.workspaceState
 *   - Survives VS Code restarts, stored in workspace SQLite DB.
 *   - Written when the panel is hidden or disposed.
 *   - Read on first open to restore last session.
 *
 * Text cached: search query, active cluster index, scroll position, expanded node IDs.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const PANEL_ID = 'deedsGraph';
const CACHE_KEY = 'deedsGraph.panelState';

interface PanelState {
    query: string;
    clusterIndex: number;
    scrollTop: number;
    expandedIds: string[];
}

const DEFAULT_STATE: PanelState = {
    query: '',
    clusterIndex: -1,
    scrollTop: 0,
    expandedIds: [],
};

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

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;

        this.panel = vscode.window.createWebviewPanel(
            PANEL_ID,
            'Deeds — Codebase Graph',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true, // Layer 1: keeps WebView alive on tab switch
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'out')),
                ],
            }
        );

        // Restore durable state → passed into HTML so WebView restores immediately
        const saved = context.workspaceState.get<PanelState>(CACHE_KEY, DEFAULT_STATE);
        this.panel.webview.html = buildHtml(saved, this.loadGraphData());

        // Save to workspaceState whenever panel hides (layer 2 write)
        this.panel.onDidChangeViewState(
            ({ webviewPanel }) => {
                if (!webviewPanel.visible) {
                    this.panel.webview.postMessage({ type: 'requestState' });
                }
            },
            null,
            this.disposables
        );

        // Messages from WebView
        this.panel.webview.onDidReceiveMessage(
            (msg: { type: string; state?: PanelState }) => {
                if (msg.type === 'stateUpdate' && msg.state) {
                    context.workspaceState.update(CACHE_KEY, msg.state);
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                GraphPanel.current = undefined;
                this.disposables.forEach(d => d.dispose());
            },
            null,
            this.disposables
        );
    }

    private loadGraphData(): { nodes: unknown[]; clusters: unknown[] } {
        const root = path.join(this.context.extensionPath, '..', 'sveltekit-frontend', 'docs', 'graph');
        try {
            const graph = JSON.parse(fs.readFileSync(path.join(root, 'codebase-graph.json'), 'utf8'));
            const clusters = JSON.parse(fs.readFileSync(path.join(root, 'hypergraph-clusters.json'), 'utf8'));
            return {
                nodes: Array.isArray(graph.nodes) ? graph.nodes.slice(0, 500) : [],
                clusters: Array.isArray(clusters) ? clusters : [],
            };
        } catch {
            return { nodes: [], clusters: [] };
        }
    }
}

function buildHtml(state: PanelState, data: { nodes: unknown[]; clusters: unknown[] }): string {
    const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
    const dataJson  = JSON.stringify(data).replace(/</g, '\\u003c');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <title>Deeds Graph</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #search {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      padding: 3px 8px;
      font: inherit;
    }
    #search:focus { outline: 1px solid var(--vscode-focusBorder); }
    #clusterSelect {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      padding: 3px 6px;
      font: inherit;
    }
    #count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    #list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .row {
      display: flex;
      align-items: center;
      padding: 3px 10px;
      cursor: pointer;
      gap: 6px;
      border-radius: 0;
    }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row.active { background: var(--vscode-list-activeSelectionBackground);
                  color: var(--vscode-list-activeSelectionForeground); }
    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      flex-shrink: 0;
    }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #empty {
      padding: 20px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
    }
  </style>
</head>
<body>
<div id="toolbar">
  <input id="search" type="text" placeholder="Filter nodes…" autocomplete="off" spellcheck="false">
  <select id="clusterSelect"><option value="-1">All clusters</option></select>
  <span id="count"></span>
</div>
<div id="list"></div>

<script>
  // ── VS Code API + dual-layer cache ────────────────────────────────────────
  const vscode = acquireVsCodeApi();

  // Layer 1: restore from session state (survives hide/show, set by VS Code)
  let state = vscode.getState() || ${stateJson};

  function saveState() {
    vscode.setState(state);                               // layer 1 (session)
    vscode.postMessage({ type: 'stateUpdate', state });   // layer 2 (durable)
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const DATA = ${dataJson};
  const nodes    = DATA.nodes    || [];
  const clusters = DATA.clusters || [];

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const searchEl  = document.getElementById('search');
  const selectEl  = document.getElementById('clusterSelect');
  const listEl    = document.getElementById('list');
  const countEl   = document.getElementById('count');

  // ── Populate cluster dropdown ─────────────────────────────────────────────
  clusters.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = (c.label || c.id || ('Cluster ' + i)) + ' (' + (c.members?.length ?? 0) + ')';
    selectEl.appendChild(opt);
  });

  // ── Restore toolbar state ─────────────────────────────────────────────────
  searchEl.value   = state.query       ?? '';
  selectEl.value   = String(state.clusterIndex ?? -1);

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const q   = state.query.toLowerCase();
    const cid = state.clusterIndex;

    const visible = nodes.filter(n => {
      const label = (n.id || n.label || n.file || '').toLowerCase();
      if (q && !label.includes(q)) return false;
      if (cid >= 0 && n.cluster !== cid) return false;
      return true;
    });

    countEl.textContent = visible.length + ' / ' + nodes.length;

    if (visible.length === 0) {
      listEl.innerHTML = '<div id="empty">No nodes match</div>';
      return;
    }

    listEl.innerHTML = '';
    visible.forEach(n => {
      const id    = String(n.id || n.label || n.file || '');
      const label = id;
      const cl    = n.cluster ?? '';

      const row = document.createElement('div');
      row.className = 'row' + (state.expandedIds.includes(id) ? ' active' : '');
      row.innerHTML =
        '<span class="label" title="' + escHtml(label) + '">' + escHtml(label) + '</span>' +
        (cl !== '' ? '<span class="badge">' + cl + '</span>' : '');

      row.addEventListener('click', () => {
        const idx = state.expandedIds.indexOf(id);
        if (idx >= 0) state.expandedIds.splice(idx, 1);
        else state.expandedIds.push(id);
        saveState();
        render();
      });

      listEl.appendChild(row);
    });

    // Restore scroll
    listEl.scrollTop = state.scrollTop ?? 0;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  searchEl.addEventListener('input', () => {
    state.query = searchEl.value;
    saveState();
    render();
  });

  selectEl.addEventListener('change', () => {
    state.clusterIndex = Number(selectEl.value);
    saveState();
    render();
  });

  listEl.addEventListener('scroll', () => {
    state.scrollTop = listEl.scrollTop;
    // throttle: only persist after scroll settles
    clearTimeout(listEl._scrollTimer);
    listEl._scrollTimer = setTimeout(() => saveState(), 300);
  });

  // Extension host requests state dump (on panel hide → workspaceState write)
  window.addEventListener('message', e => {
    if (e.data?.type === 'requestState') saveState();
  });

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  render();
</script>
</body>
</html>`;
}
