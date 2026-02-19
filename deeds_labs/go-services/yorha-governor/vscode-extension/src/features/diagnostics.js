const vscode = require("vscode");
const { SvelteRuneFixer } = require("../analyzer/svelteRuneFixer");
const { UISemanticScanner } = require("../analyzer/uiSemanticScanner");
const { StyleComplianceChecker } = require("../analyzer/styleCompliance");

async function analyzeDocument(document) {
  const diagnostics = [];

  if (!document.fileName.endsWith('.svelte')) {
    return diagnostics;
  }

  const content = document.getText();

  // Rune analysis
  const runeFixer = new SvelteRuneFixer();
  const runeIssues = runeFixer.analyzeCode(content);

  for (const issue of runeIssues) {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(
        new vscode.Position(issue.line - 1, issue.column || 0),
        new vscode.Position(issue.line - 1, (issue.column || 0) + issue.rune.length)
      ),
      `Use '${issue.suggestion}' instead of '${issue.rune}' for Svelte 5 compatibility`,
      issue.type === 'rune-usage' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
    );

    diagnostic.code = 'yorha-rune-usage';
    diagnostic.source = 'YorHa UI Governor';
    diagnostics.push(diagnostic);
  }

  // UI semantic analysis
  const uiScanner = new UISemanticScanner();
  const uiIssues = uiScanner.analyzeComponent(content);

  for (const issue of uiIssues) {
    let severity;
    switch (issue.severity) {
      case 'error':
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case 'warning':
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      default:
        severity = vscode.DiagnosticSeverity.Information;
    }

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1), // Generic range since we don't have line info
      issue.message,
      severity
    );

    diagnostic.code = `yorha-${issue.type}`;
    diagnostic.source = 'YorHa UI Governor';
    diagnostics.push(diagnostic);
  }

  // Style compliance analysis
  const styleChecker = new StyleComplianceChecker();
  const styleIssues = styleChecker.analyzeSvelteStyles(content);

  for (const issue of styleIssues) {
    let severity;
    switch (issue.severity) {
      case 'error':
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case 'warning':
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      default:
        severity = vscode.DiagnosticSeverity.Information;
    }

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(issue.line - 1, 0, issue.line - 1, 1),
      issue.message,
      severity
    );

    diagnostic.code = `yorha-${issue.type}`;
    diagnostic.source = 'YorHa UI Governor';

    if (issue.suggestion) {
      diagnostic.relatedInformation = [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(document.uri, diagnostic.range),
          `Suggestion: ${issue.suggestion}`
        )
      ];
    }

    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

async function analyzeWorkspace() {
  const diagnostics = new Map();

  const files = await vscode.workspace.findFiles(
    "**/*.{svelte,ts,js}",
    "**/node_modules/**"
  );

  for (const file of files) {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      const fileDiagnostics = await analyzeDocument(document);
      if (fileDiagnostics.length > 0) {
        diagnostics.set(file, fileDiagnostics);
      }
    } catch (error) {
      console.error(`Error analyzing ${file.fsPath}:`, error);
    }
  }

  return diagnostics;
}

async function createDiagnosticCollection() {
  const collection = vscode.languages.createDiagnosticCollection("yorha");

  // Initial analysis
  const diagnostics = await analyzeWorkspace();
  for (const [uri, fileDiagnostics] of diagnostics) {
    collection.set(uri, fileDiagnostics);
  }

  // Watch for changes
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{svelte,ts,js}");
  watcher.onDidChange(async (uri) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const fileDiagnostics = await analyzeDocument(document);
      collection.set(uri, fileDiagnostics);
    } catch (error) {
      console.error(`Error updating diagnostics for ${uri.fsPath}:`, error);
    }
  });

  watcher.onDidCreate(async (uri) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const fileDiagnostics = await analyzeDocument(document);
      collection.set(uri, fileDiagnostics);
    } catch (error) {
      console.error(`Error creating diagnostics for ${uri.fsPath}:`, error);
    }
  });

  watcher.onDidDelete((uri) => {
    collection.delete(uri);
  });

  return collection;
}

module.exports = {
  analyzeDocument,
  analyzeWorkspace,
  createDiagnosticCollection
};