const vscode = require("vscode");
const { fixRunes } = require("./src/features/codeActions");
const { runAnalysis } = require("./src/features/commands");

function activate(context) {
  console.log("YorHa UI Governor extension is now active!");

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("yorha.fixRunes", fixRunes),
    vscode.commands.registerCommand("yorha.inspect", runAnalysis)
  );

  // Register diagnostics
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("yorha");
  context.subscriptions.push(diagnosticCollection);

  // Watch for file changes
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{svelte,ts,js}");
  watcher.onDidChange(uri => {
    if (uri.fsPath.endsWith('.svelte')) {
      updateDiagnostics(uri, diagnosticCollection);
    }
  });
  watcher.onDidCreate(uri => {
    if (uri.fsPath.endsWith('.svelte')) {
      updateDiagnostics(uri, diagnosticCollection);
    }
  });
  context.subscriptions.push(watcher);

  // Initial scan
  scanWorkspace(diagnosticCollection);
}

async function updateDiagnostics(uri, diagnosticCollection) {
  const document = await vscode.workspace.openTextDocument(uri);
  const diagnostics = await require("./src/features/diagnostics").analyzeDocument(document);
  diagnosticCollection.set(uri, diagnostics);
}

async function scanWorkspace(diagnosticCollection) {
  const files = await vscode.workspace.findFiles("**/*.{svelte}", "**/node_modules/**");
  for (const file of files) {
    await updateDiagnostics(file, diagnosticCollection);
  }
}

function deactivate() {
  console.log("YorHa UI Governor extension deactivated");
}

module.exports = { activate, deactivate };