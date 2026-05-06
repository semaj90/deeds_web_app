import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ClusterData {
	id: string | number;
	label?: string;
	members?: string[];
	size?: number;
}

interface NodeData {
	id: string;
	label?: string;
	file?: string;
	cluster?: number;
}

export class GraphTreeProvider implements vscode.TreeDataProvider<TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private clusters: ClusterData[] = [];
	private nodes: NodeData[] = [];

	constructor(private readonly extensionPath: string) {
		this.reload();
	}

	reload() {
		const root = path.join(this.extensionPath, '..', 'sveltekit-frontend', 'docs', 'graph');
		try {
			const graph = JSON.parse(fs.readFileSync(path.join(root, 'codebase-graph.json'), 'utf8'));
			const clusterFile = JSON.parse(fs.readFileSync(path.join(root, 'hypergraph-clusters.json'), 'utf8'));
			this.nodes    = Array.isArray(graph.nodes) ? graph.nodes : [];
			this.clusters = Array.isArray(clusterFile) ? clusterFile : [];
		} catch {
			this.nodes = [];
			this.clusters = [];
		}
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(item: TreeItem): vscode.TreeItem { return item; }

	/** Returns workspace-relative file paths for all nodes in a given cluster index. */
	getClusterFiles(clusterIdx: string): string[] {
		const members = clusterIdx === '__none__'
			? this.nodes.filter(n => n.cluster === undefined || n.cluster === null)
			: this.nodes.filter(n => String(n.cluster) === clusterIdx);
		return members.slice(0, 50).map(n => (n.file ?? n.label ?? n.id ?? '').replace(/\\/g, '/'));
	}

	getClusterLabel(clusterIdx: string): string {
		const idx = parseInt(clusterIdx);
		const c = this.clusters[idx];
		return c ? (String(c.label ?? c.id ?? `cluster:${clusterIdx}`)) : `cluster:${clusterIdx}`;
	}

	getChildren(parent?: TreeItem): TreeItem[] {
		if (!parent) {
			// Root: one item per cluster + an "Unclustered" bucket
			const items: TreeItem[] = this.clusters.map((c, i) => {
				const memberCount = c.members?.length
					?? this.nodes.filter(n => n.cluster === i).length;
				return new TreeItem(
					`${c.label ?? c.id ?? `Cluster ${i}`}  (${memberCount})`,
					vscode.TreeItemCollapsibleState.Collapsed,
					'cluster',
					String(i)
				);
			});

			const unclustered = this.nodes.filter(n => n.cluster === undefined || n.cluster === null);
			if (unclustered.length) {
				items.push(new TreeItem(
					`Unclustered  (${unclustered.length})`,
					vscode.TreeItemCollapsibleState.Collapsed,
					'cluster',
					'__none__'
				));
			}
			return items;
		}

		if (parent.kind === 'cluster') {
			const cid = parent.clusterId;
			const members = cid === '__none__'
				? this.nodes.filter(n => n.cluster === undefined || n.cluster === null)
				: this.nodes.filter(n => String(n.cluster) === cid);

			return members.slice(0, 200).map(n => {
				const label = n.file ?? n.label ?? n.id ?? '(unknown)';
				const item = new TreeItem(
					path.basename(label),
					vscode.TreeItemCollapsibleState.None,
					'node',
					n.id
				);
				item.description  = path.dirname(label).replace(/^\./, '');
				item.tooltip      = label;
				item.resourceUri  = tryFileUri(path.join(this.extensionPath, '..', label));
				item.command      = item.resourceUri
					? { command: 'vscode.open', title: 'Open', arguments: [item.resourceUri] }
					: undefined;
				return item;
			});
		}

		return [];
	}
}

class TreeItem extends vscode.TreeItem {
	constructor(
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly kind: 'cluster' | 'node',
		public readonly clusterId: string
	) {
		super(label, collapsibleState);
		this.contextValue = kind;
		if (kind === 'cluster') {
			this.iconPath = new vscode.ThemeIcon('symbol-namespace');
		} else {
			this.iconPath = new vscode.ThemeIcon('symbol-file');
		}
	}
}

function tryFileUri(p: string): vscode.Uri | undefined {
	try {
		if (fs.existsSync(p)) return vscode.Uri.file(p);
	} catch { /* ignore */ }
	return undefined;
}
