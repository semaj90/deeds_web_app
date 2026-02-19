const vscode = require("vscode");
const { analyzeWorkspace } = require("./diagnostics");
const { fixRunes } = require("./codeActions");

async function runAnalysis() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "YorHa UI Governor",
    cancellable: false
  }, async (progress) => {
    progress.report({ message: "Analyzing workspace..." });

    try {
      const diagnostics = await analyzeWorkspace();

      let totalIssues = 0;
      for (const fileDiagnostics of diagnostics.values()) {
        totalIssues += fileDiagnostics.length;
      }

      if (totalIssues === 0) {
        vscode.window.showInformationMessage("✅ YorHa Analysis Complete: No issues found!");
      } else {
        const files = diagnostics.size;
        vscode.window.showWarningMessage(
          `⚠️ YorHa Analysis Complete: ${totalIssues} issues found in ${files} files`
        );

        // Show detailed results
        const items = [];
        for (const [uri, fileDiagnostics] of diagnostics) {
          const relativePath = vscode.workspace.asRelativePath(uri);
          items.push({
            label: `${relativePath} (${fileDiagnostics.length} issues)`,
            uri: uri,
            diagnostics: fileDiagnostics
          });
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a file to view issues"
        });

        if (selected) {
          const document = await vscode.workspace.openTextDocument(selected.uri);
          await vscode.window.showTextDocument(document);

          // Show issues in a quick pick
          const issueItems = selected.diagnostics.map(d => ({
            label: `${d.severity === 0 ? '❌' : d.severity === 1 ? '⚠️' : 'ℹ️'} ${d.message}`,
            description: `Line ${d.range.start.line + 1}`,
            diagnostic: d
          }));

          const selectedIssue = await vscode.window.showQuickPick(issueItems, {
            placeHolder: "Select an issue to navigate to"
          });

          if (selectedIssue) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              editor.selection = new vscode.Selection(
                selectedIssue.diagnostic.range.start,
                selectedIssue.diagnostic.range.end
              );
              editor.revealRange(selectedIssue.diagnostic.range);
            }
          }
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`YorHa analysis failed: ${error.message}`);
      console.error(error);
    }
  });
}

async function showSettings() {
  const config = vscode.workspace.getConfiguration("yorha");

  const items = [
    {
      label: "Enable Rune Analysis",
      description: "Analyze Svelte 5 rune usage",
      picked: config.get("enableRuneAnalysis", true)
    },
    {
      label: "Enable UI Semantics",
      description: "Check semantic HTML and accessibility",
      picked: config.get("enableUISemantics", true)
    },
    {
      label: "Enable Style Compliance",
      description: "Enforce CSS naming and formatting rules",
      picked: config.get("enableStyleCompliance", true)
    },
    {
      label: "Auto-fix on Save",
      description: "Automatically fix issues when saving files",
      picked: config.get("autoFixOnSave", false)
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Configure YorHa UI Governor settings"
  });

  if (selected) {
    await config.update("enableRuneAnalysis", selected.some(i => i.label === "Enable Rune Analysis"));
    await config.update("enableUISemantics", selected.some(i => i.label === "Enable UI Semantics"));
    await config.update("enableStyleCompliance", selected.some(i => i.label === "Enable Style Compliance"));
    await config.update("autoFixOnSave", selected.some(i => i.label === "Auto-fix on Save"));

    vscode.window.showInformationMessage("YorHa settings updated!");
  }
}

async function generateReport() {
  const diagnostics = await analyzeWorkspace();

  let report = "# YorHa UI Governor Analysis Report\n\n";
  report += `Generated: ${new Date().toISOString()}\n\n`;

  let totalIssues = 0;
  const issueCounts = { error: 0, warning: 0, info: 0 };

  for (const [uri, fileDiagnostics] of diagnostics) {
    const relativePath = vscode.workspace.asRelativePath(uri);
    report += `## ${relativePath}\n\n`;

    for (const diagnostic of fileDiagnostics) {
      totalIssues++;
      const severity = diagnostic.severity === 0 ? 'error' :
                      diagnostic.severity === 1 ? 'warning' : 'info';
      issueCounts[severity]++;

      report += `- **${severity.toUpperCase()}**: ${diagnostic.message}\n`;
      report += `  - Line: ${diagnostic.range.start.line + 1}\n`;
      if (diagnostic.code) {
        report += `  - Code: ${diagnostic.code}\n`;
      }
      report += "\n";
    }
    report += "\n";
  }

  report += "## Summary\n\n";
  report += `- Total Issues: ${totalIssues}\n`;
  report += `- Errors: ${issueCounts.error}\n`;
  report += `- Warnings: ${issueCounts.warning}\n`;
  report += `- Info: ${issueCounts.info}\n`;

  // Create report file
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const reportUri = vscode.Uri.joinPath(workspaceFolder.uri, "yorha-report.md");
    await vscode.workspace.fs.writeFile(reportUri, Buffer.from(report, "utf8"));

    const document = await vscode.workspace.openTextDocument(reportUri);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage("YorHa report generated and opened!");
  }
}

module.exports = {
  runAnalysis,
  showSettings,
  generateReport
};