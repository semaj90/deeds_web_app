/**
 * VS Code Extension integration for GPU-Accelerated JSON Parser
 * Provides high-performance JSON processing for large documents
 */

import * as vscode from "vscode";
import {
  GpuAcceleratedJsonParser,
  parseJson,
  parseJsonBatch,
} from "../wasm/gpu-json-parser";

interface JsonProcessingOptions {
  useCache?: boolean;
  useWorker?: boolean;
  formatOutput?: boolean;
  showMetrics?: boolean;
}

/**
 * VS Code extension for GPU-accelerated JSON processing
 */
export class JsonProcessorExtension {
  private parser: GpuAcceleratedJsonParser;
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.parser = new GpuAcceleratedJsonParser();
    this.outputChannel = vscode.window.createOutputChannel("GPU JSON Parser");
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("json-gpu-parser");

    this.registerCommands(context);
    this.registerProviders(context);
    this.setupStatusBar();
  }

  /**
   * Register VS Code commands
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    // Parse current JSON document
    const parseCommand = vscode.commands.registerCommand(
      "gpu-json-parser.parse",
      () => {
        this.parseCurrentDocument();
      }
    );

    // Format current JSON document
    const formatCommand = vscode.commands.registerCommand(
      "gpu-json-parser.format",
      () => {
        this.formatCurrentDocument();
      }
    );

    // Validate current JSON document
    const validateCommand = vscode.commands.registerCommand(
      "gpu-json-parser.validate",
      () => {
        this.validateCurrentDocument();
      }
    );

    // Show performance metrics
    const metricsCommand = vscode.commands.registerCommand(
      "gpu-json-parser.metrics",
      () => {
        this.showPerformanceMetrics();
      }
    );

    // Clear parser cache
    const clearCacheCommand = vscode.commands.registerCommand(
      "gpu-json-parser.clearCache",
      () => {
        this.clearCache();
      }
    );

    // Benchmark parser performance
    const benchmarkCommand = vscode.commands.registerCommand(
      "gpu-json-parser.benchmark",
      () => {
        this.runBenchmark();
      }
    );

    context.subscriptions.push(
      parseCommand,
      formatCommand,
      validateCommand,
      metricsCommand,
      clearCacheCommand,
      benchmarkCommand,
      this.outputChannel,
      this.statusBarItem,
      this.diagnosticCollection
    );
  }

  /**
   * Register document providers and handlers
   */
  private registerProviders(context: vscode.ExtensionContext): void {
    // JSON document hover provider
    const hoverProvider = vscode.languages.registerHoverProvider("json", {
      provideHover: this.provideJsonHover.bind(this),
    });

    // JSON document completion provider
    const completionProvider = vscode.languages.registerCompletionItemProvider(
      "json",
      {
        provideCompletionItems: this.provideJsonCompletion.bind(this),
      },
      '"',
      ":",
      ","
    );

    // JSON document formatting provider
    const formattingProvider =
      vscode.languages.registerDocumentFormattingEditProvider("json", {
        provideDocumentFormattingEdits: this.provideFormatting.bind(this),
      });

    // Document change listener for real-time validation
    const documentChangeListener = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.languageId === "json") {
          this.validateDocumentInBackground(event.document);
        }
      }
    );

    context.subscriptions.push(
      hoverProvider,
      completionProvider,
      formattingProvider,
      documentChangeListener
    );
  }

  /**
   * Setup status bar item
   */
  private setupStatusBar(): void {
    this.statusBarItem.text = "$(zap) GPU JSON";
    this.statusBarItem.tooltip = "GPU-Accelerated JSON Parser";
    this.statusBarItem.command = "gpu-json-parser.metrics";
    this.statusBarItem.show();
  }

  /**
   * Parse current active JSON document
   */
  private async parseCurrentDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "json") {
      vscode.window.showWarningMessage("Please open a JSON document");
      return;
    }

    try {
      this.statusBarItem.text = "$(loading~spin) Parsing...";
      const jsonText = editor.document.getText();

      const startTime = performance.now();
      const result = await this.parser.parse(jsonText, {
        useCache: true,
        useWorker: true,
      });
      const endTime = performance.now();

      if (result.success) {
        const metrics = await this.parser.getMetrics();
        this.outputChannel.appendLine(
          `✅ JSON parsed successfully in ${(endTime - startTime).toFixed(2)}ms`
        );
        this.outputChannel.appendLine(
          `📊 Metrics: ${JSON.stringify(metrics, null, 2)}`
        );

        vscode.window.showInformationMessage(
          `JSON parsed in ${(endTime - startTime).toFixed(2)}ms (${metrics.parseMethod})`
        );
      } else {
        this.outputChannel.appendLine(`❌ Parse error: ${result.errorMessage}`);
        vscode.window.showErrorMessage(
          `JSON Parse Error: ${result.errorMessage}`
        );
      }

      this.statusBarItem.text = "$(zap) GPU JSON";
    } catch (error) {
      this.outputChannel.appendLine(`💥 Parser error: ${error}`);
      vscode.window.showErrorMessage(`Parser Error: ${error}`);
      this.statusBarItem.text = "$(error) GPU JSON";
    }
  }

  /**
   * Format current JSON document
   */
  private async formatCurrentDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "json") {
      vscode.window.showWarningMessage("Please open a JSON document");
      return;
    }

    try {
      const jsonText = editor.document.getText();
      const parseResult = await this.parser.parse(jsonText, { useCache: true });

      if (parseResult.success) {
        const stringifyResult = await this.parser.stringify({ pretty: true });

        if (stringifyResult.success && stringifyResult.json) {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          );

          await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, stringifyResult.json!);
          });

          vscode.window.showInformationMessage("JSON formatted successfully");
        }
      } else {
        vscode.window.showErrorMessage(
          `Cannot format: ${parseResult.errorMessage}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Format Error: ${error}`);
    }
  }

  /**
   * Validate current JSON document with GPU acceleration
   */
  private async validateCurrentDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "json") {
      vscode.window.showWarningMessage("Please open a JSON document");
      return;
    }

    try {
      const jsonText = editor.document.getText();
      const validation = await this.parser.validateWithGpu(jsonText);

      this.diagnosticCollection.clear();

      if (validation.valid) {
        vscode.window.showInformationMessage("✅ JSON is valid");
        this.outputChannel.appendLine("✅ JSON validation passed");
      } else {
        const diagnostics: vscode.Diagnostic[] = validation.errors.map(
          (error) => {
            const diagnostic = new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 0),
              error,
              vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = "GPU JSON Parser";
            return diagnostic;
          }
        );

        this.diagnosticCollection.set(editor.document.uri, diagnostics);
        vscode.window.showErrorMessage(
          `❌ JSON validation failed: ${validation.errors.length} error(s)`
        );
        this.outputChannel.appendLine(
          `❌ JSON validation errors: ${validation.errors.join(", ")}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Validation Error: ${error}`);
    }
  }

  /**
   * Validate document in background for real-time feedback
   */
  private async validateDocumentInBackground(
    document: vscode.TextDocument
  ): Promise<void> {
    if (document.languageId !== "json") return;

    try {
      const jsonText = document.getText();
      if (jsonText.length > 100000) return; // Skip very large documents for real-time validation

      const result = await this.parser.parse(jsonText, { useCache: true });

      if (!result.success && result.errorMessage) {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(
            0,
            result.errorOffset || 0,
            0,
            (result.errorOffset || 0) + 1
          ),
          result.errorMessage,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = "GPU JSON Parser";

        this.diagnosticCollection.set(document.uri, [diagnostic]);
      } else {
        this.diagnosticCollection.delete(document.uri);
      }
    } catch (error) {
      // Silently fail for background validation
    }
  }

  /**
   * Show performance metrics
   */
  private async showPerformanceMetrics(): Promise<void> {
    try {
      const metrics = await this.parser.getMetrics();
      const cacheStats = await this.parser.getCacheStats();

      const metricsText = `
📊 GPU JSON Parser Metrics

⏱️  Last Parse Time: ${metrics.parseTime}ms
📄 Document Size: ${metrics.documentSize} bytes
🔧 Objects: ${metrics.objectCount}
📋 Arrays: ${metrics.arrayCount}
🎯 Parse Method: ${metrics.parseMethod}

💾 Cache Statistics:
   Hits: ${cacheStats.hits}
   Misses: ${cacheStats.misses}
   Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%
   Cache Size: ${cacheStats.cacheSize} documents
`;

      const panel = vscode.window.createWebviewPanel(
        "gpu-json-metrics",
        "GPU JSON Parser Metrics",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      panel.webview.html = this.getMetricsWebviewContent(metrics, cacheStats);
      this.outputChannel.appendLine(metricsText);
    } catch (error) {
      vscode.window.showErrorMessage(`Metrics Error: ${error}`);
    }
  }

  /**
   * Generate HTML content for metrics webview
   */
  private getMetricsWebviewContent(metrics: any, cacheStats: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPU JSON Parser Metrics</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .metric-card {
            background: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 16px;
            margin: 10px 0;
        }
        .metric-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-textLink-foreground);
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textPreformat-foreground);
        }
        .progress-bar {
            width: 100%;
            height: 8px;
            background: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            margin: 8px 0;
        }
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-background);
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <h1>🚀 GPU JSON Parser Metrics</h1>

    <div class="metric-card">
        <div class="metric-title">⏱️ Parse Time</div>
        <div class="metric-value">${metrics.parseTime}ms</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">📄 Document Size</div>
        <div class="metric-value">${metrics.documentSize} bytes</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">🔧 Objects</div>
        <div class="metric-value">${metrics.objectCount}</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">📋 Arrays</div>
        <div class="metric-value">${metrics.arrayCount}</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">🎯 Parse Method</div>
        <div class="metric-value">${metrics.parseMethod}</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">💾 Cache Hit Rate</div>
        <div class="metric-value">${(cacheStats.hitRate * 100).toFixed(1)}%</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${cacheStats.hitRate * 100}%"></div>
        </div>
    </div>

    <div class="metric-card">
        <div class="metric-title">📊 Cache Statistics</div>
        <div>Hits: ${cacheStats.hits} | Misses: ${cacheStats.misses} | Size: ${cacheStats.cacheSize}</div>
    </div>
</body>
</html>`;
  }

  /**
   * Clear parser cache
   */
  private async clearCache(): Promise<void> {
    try {
      await this.parser.clearCache();
      vscode.window.showInformationMessage("Parser cache cleared");
      this.outputChannel.appendLine("🗑️ Parser cache cleared");
    } catch (error) {
      vscode.window.showErrorMessage(`Clear Cache Error: ${error}`);
    }
  }

  /**
   * Run performance benchmark
   */
  private async runBenchmark(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "json") {
      vscode.window.showWarningMessage(
        "Please open a JSON document to benchmark"
      );
      return;
    }

    try {
      this.statusBarItem.text = "$(loading~spin) Benchmarking...";
      const jsonText = editor.document.getText();

      vscode.window.showInformationMessage(
        "Running benchmark... This may take a moment."
      );

      const benchmark = await this.parser.benchmark(jsonText, 50);

      const benchmarkText = `
🏃 Benchmark Results:

WebAssembly Time: ${benchmark.wasmTime.toFixed(2)}ms
Native JSON Time: ${benchmark.nativeTime.toFixed(2)}ms
Speedup: ${benchmark.speedup.toFixed(2)}x
Cache Hit Rate: ${(benchmark.cacheHitRate * 100).toFixed(1)}%
`;

      this.outputChannel.appendLine(benchmarkText);

      vscode.window.showInformationMessage(
        `Benchmark: ${benchmark.speedup.toFixed(2)}x speedup over native JSON.parse`
      );

      this.statusBarItem.text = "$(zap) GPU JSON";
    } catch (error) {
      vscode.window.showErrorMessage(`Benchmark Error: ${error}`);
      this.statusBarItem.text = "$(error) GPU JSON";
    }
  }

  /**
   * Provide hover information for JSON values
   */
  private async provideJsonHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    try {
      const jsonText = document.getText();
      const result = await this.parser.parse(jsonText, { useCache: true });

      if (result.success) {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);

        const hoverText = new vscode.MarkdownString();
        hoverText.appendMarkdown(`**JSON Value:** \`${word}\`\n\n`);
        hoverText.appendMarkdown("_Parsed with GPU-accelerated JSON parser_");

        return new vscode.Hover(hoverText, range);
      }
    } catch (error) {
      // Silently fail for hover
    }

    return undefined;
  }

  /**
   * Provide JSON completion items
   */
  private async provideJsonCompletion(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const completionItems: vscode.CompletionItem[] = [];

    // Add common JSON snippets
    const stringCompletion = new vscode.CompletionItem(
      '"string"',
      vscode.CompletionItemKind.Value
    );
    stringCompletion.insertText = new vscode.SnippetString('"${1:value}"');
    stringCompletion.detail = "JSON String";

    const numberCompletion = new vscode.CompletionItem(
      "number",
      vscode.CompletionItemKind.Value
    );
    numberCompletion.insertText = new vscode.SnippetString("${1:0}");
    numberCompletion.detail = "JSON Number";

    const booleanCompletion = new vscode.CompletionItem(
      "boolean",
      vscode.CompletionItemKind.Value
    );
    booleanCompletion.insertText = new vscode.SnippetString("${1|true,false|}");
    booleanCompletion.detail = "JSON Boolean";

    const arrayCompletion = new vscode.CompletionItem(
      "array",
      vscode.CompletionItemKind.Value
    );
    arrayCompletion.insertText = new vscode.SnippetString("[${1}]");
    arrayCompletion.detail = "JSON Array";

    const objectCompletion = new vscode.CompletionItem(
      "object",
      vscode.CompletionItemKind.Value
    );
    objectCompletion.insertText = new vscode.SnippetString("{${1}}");
    objectCompletion.detail = "JSON Object";

    completionItems.push(
      stringCompletion,
      numberCompletion,
      booleanCompletion,
      arrayCompletion,
      objectCompletion
    );

    return completionItems;
  }

  /**
   * Provide document formatting
   */
  private async provideFormatting(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    try {
      const jsonText = document.getText();
      const parseResult = await this.parser.parse(jsonText, { useCache: true });

      if (parseResult.success) {
        const stringifyResult = await this.parser.stringify({ pretty: true });

        if (stringifyResult.success && stringifyResult.json) {
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );

          return [vscode.TextEdit.replace(fullRange, stringifyResult.json)];
        }
      }
    } catch (error) {
      // Return empty array on error
    }

    return [];
  }

  /**
   * Dispose extension resources
   */
  dispose(): void {
    this.parser.dispose();
    this.outputChannel.dispose();
    this.statusBarItem.dispose();
    this.diagnosticCollection.dispose();
  }
}

/**
 * Activate the VS Code extension
 */
export function activate(context: vscode.ExtensionContext): void {
  const extension = new JsonProcessorExtension(context);
  context.subscriptions.push(extension);

  console.log("GPU-Accelerated JSON Parser extension activated");
}

/**
 * Deactivate the VS Code extension
 */
export function deactivate(): void {
  console.log("GPU-Accelerated JSON Parser extension deactivated");
}
