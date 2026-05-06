/**
 * claudePlan.ts — Generate a propose_only Claude Plan JSON from cluster + local context.
 *
 * Delivery options:
 *   • Copy to clipboard
 *   • Open in new editor tab (unsaved, JSON language)
 *   • Write to .claude/plans/<timestamp>.json and open
 *
 * Guardrail: extension NEVER modifies repo files directly.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ClaudePlan {
	task: string;
	source: 'vscode-extension';
	clusterKey?: string;
	filesToInspect: string[];
	evidence: Array<{ source: string; reason: string }>;
	commands: string[];
	patchPolicy: 'propose_only';
}

export async function createClaudePlan(
	context: vscode.ExtensionContext,
	selectedClusterKey?: string,
	selectedFiles?: string[]
): Promise<void> {
	const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!ws) {
		vscode.window.showErrorMessage('Deeds: No workspace folder open.');
		return;
	}

	const evidence: ClaudePlan['evidence'] = [];
	let filesToInspect: string[] = selectedFiles ?? [];
	const clusterKey = selectedClusterKey;

	if (filesToInspect.length === 0) {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const rel = path.relative(ws, editor.document.uri.fsPath).replace(/\\/g, '/');
			filesToInspect = [rel];
			evidence.push({ source: 'activeEditor', reason: 'Currently open file' });
		}
	} else {
		evidence.push({ source: 'graphTree', reason: 'Files belong to selected semantic cluster' });
	}

	if (clusterKey) {
		evidence.push({ source: 'graphTree', reason: `Cluster ${clusterKey} selected in Deeds tree` });
	}

	// G16 check — server routes without matching test stubs
	const missingTests = filesToInspect.filter(f => {
		if (!f.includes('+server')) return false;
		const base = f.replace(/\+server\.ts$/, '');
		const candidates = [
			path.join(ws, 'sveltekit-frontend', 'tests', 'routes', `${base}server.test.ts`),
			path.join(ws, 'sveltekit-frontend', 'tests', 'routes', 'auto', `${base}server.test.ts`),
		];
		return candidates.every(p => !fs.existsSync(p));
	});
	if (missingTests.length) {
		evidence.push({
			source: 'G16 route-test pairing audit',
			reason: `${missingTests.length} route(s) missing test stub: ${missingTests.slice(0, 3).join(', ')}`,
		});
	}

	const plan: ClaudePlan = {
		task: clusterKey
			? `Review Graphify cluster ${clusterKey} and propose safe improvements`
			: 'Review selected files and propose safe edits',
		source: 'vscode-extension',
		clusterKey,
		filesToInspect,
		evidence,
		commands: [
			'npm run typecheck:native',
			'npm run svelte-check',
			...(missingTests.length ? ['npm run audit:test-stubs:dry'] : []),
			'npm test',
		],
		patchPolicy: 'propose_only',
	};

	const json = JSON.stringify(plan, null, 2);

	const choice = await vscode.window.showQuickPick(
		[
			{ label: '$(clippy)  Copy to clipboard',   id: 'clipboard' },
			{ label: '$(file-code)  Open in editor',   id: 'editor'    },
			{ label: '$(save)  Write to .claude/plans/', id: 'file'    },
		],
		{ title: `Claude Plan — ${clusterKey ?? 'selection'}`, placeHolder: 'How should the plan be delivered?' }
	);
	if (!choice) return;

	if (choice.id === 'clipboard') {
		await vscode.env.clipboard.writeText(json);
		vscode.window.showInformationMessage('Claude plan copied to clipboard.');
		return;
	}

	if (choice.id === 'editor') {
		const doc = await vscode.workspace.openTextDocument({ language: 'json', content: json });
		await vscode.window.showTextDocument(doc, { preview: false });
		return;
	}

	const plansDir = path.join(ws, '.claude', 'plans');
	fs.mkdirSync(plansDir, { recursive: true });
	const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const planFile = path.join(plansDir, `${ts}-deeds-plan.json`);
	fs.writeFileSync(planFile, json, 'utf8');

	const rel = path.relative(ws, planFile).replace(/\\/g, '/');
	const act = await vscode.window.showInformationMessage(`Plan written to ${rel}`, 'Open');
	if (act === 'Open') {
		const doc = await vscode.workspace.openTextDocument(planFile);
		await vscode.window.showTextDocument(doc, { preview: false });
	}
}
