import * as vscode from 'vscode';
import { GraphPanel } from './graphPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('deeds.showGraph', () => {
            GraphPanel.createOrShow(context);
        })
    );
}

export function deactivate() {}
