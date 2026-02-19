const vscode = require("vscode");
const { SvelteRuneFixer } = require("../analyzer/svelteRuneFixer");

async function fixRunes() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const document = editor.document;
  if (!document.fileName.endsWith('.svelte')) {
    vscode.window.showErrorMessage("This command only works on Svelte files");
    return;
  }

  const fixer = new SvelteRuneFixer();
  const code = document.getText();
  const fixedCode = fixer.fixAll(code);

  if (fixedCode !== code) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(code.length)
    );
    edit.replace(document.uri, fullRange, fixedCode);
    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage("Svelte runes fixed successfully!");
  } else {
    vscode.window.showInformationMessage("No rune issues found to fix");
  }
}

async function provideCodeActions(document, range, context, token) {
  const actions = [];

  // Check if we're in a Svelte file
  if (!document.fileName.endsWith('.svelte')) {
    return actions;
  }

  // Add quick fix for rune issues
  const fixer = new SvelteRuneFixer();
  const code = document.getText();
  const issues = fixer.analyzeCode(code);

  for (const issue of issues) {
    if (issue.line >= range.start.line && issue.line <= range.end.line) {
      const action = new vscode.CodeAction(
        `Fix ${issue.rune} rune usage`,
        vscode.CodeActionKind.QuickFix
      );

      action.edit = new vscode.WorkspaceEdit();
      const line = document.lineAt(issue.line - 1);
      const lineRange = new vscode.Range(
        new vscode.Position(issue.line - 1, 0),
        new vscode.Position(issue.line - 1, line.text.length)
      );

      action.edit.replace(
        document.uri,
        lineRange,
        fixer.generateFix(issue, line.text)
      );

      actions.push(action);
    }
  }

  return actions;
}

async function provideRefactorings(document, range, context, token) {
  const refactorings = [];

  // Add refactoring to convert to runes
  const refactoring = new vscode.CodeAction(
    "Convert to Svelte 5 runes",
    vscode.CodeActionKind.RefactorRewrite
  );

  refactoring.command = {
    command: "yorha.fixRunes",
    title: "Convert to Svelte 5 runes"
  };

  refactorings.push(refactoring);

  return refactorings;
}

module.exports = {
  fixRunes,
  provideCodeActions,
  provideRefactorings
};