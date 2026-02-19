import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ESLint } from 'eslint';
import prettier from 'prettier';

interface ASTIssue {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  fix?: {
    range: [number, number];
    text: string;
  };
}

interface FixResult {
  file: string;
  issuesFixed: number;
  issuesRemaining: number;
  appliedFixes: ASTIssue[];
}

interface BatchFixResult {
  totalFiles: number;
  filesFixed: number;
  totalIssuesFixed: number;
  totalIssuesRemaining: number;
  results: FixResult[];
}

interface WebSocketMessage {
  type: string;
  filePath?: string;
  applyFixes?: boolean;
  [key: string]: unknown;
}

class TSASTAutofixer {
  private eslint: ESLint;
  private prettierConfig: prettier.Options = {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    printWidth: 80,
  };
  private app: express.Application;
  private wss: WebSocket.Server;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  constructor() {
    this.app = express();
    this.wss = new WebSocket.Server({ port: 8084 });
    this.eslint = new ESLint({
      fix: true,
    } as ConstructorParameters<typeof ESLint>[0]);
    this.initializePrettier();
    this.initializeExpress();
    this.initializeWebSocket();
  }

  private async initializePrettier(): Promise<void> {
    try {
      const config = await prettier.resolveConfig(process.cwd());
      if (config) {
        this.prettierConfig = config;
      }
    } catch (error) {
      // Use default config
    }
  }

  private initializeExpress(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'ts-ast-autofixer' });
    });

    // Analyze file
    this.app.post('/analyze', this.handleAnalyzeFile.bind(this));

    // Fix file
    this.app.post('/fix', this.handleFixFile.bind(this));

    // Batch fix
    this.app.post('/batch-fix', this.handleBatchFix.bind(this));

    // Watch mode
    this.app.post('/watch', this.handleWatchMode.bind(this));
  }

  private initializeWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected to TS AST Autofixer');

      ws.on('message', (message: WebSocket.Data) => {
        try {
          const data = JSON.parse(message.toString()) as WebSocketMessage;
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          ws.send(
            JSON.stringify({
              type: 'error',
              error: errorMsg,
            })
          );
        }
      });
    });
  }

  async analyzeFile(filePath: string): Promise<ASTIssue[]> {
    const issues: ASTIssue[] = [];

    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse with TypeScript
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

      // Run ESLint
      const eslintResults = await this.eslint.lintFiles([filePath]);

      // Convert ESLint results to AST issues
      for (const result of eslintResults) {
        for (const message of result.messages) {
          issues.push({
            file: filePath,
            line: message.line || 1,
            column: message.column || 1,
            message: message.message,
            severity:
              message.severity === 2 ? 'error' : message.severity === 1 ? 'warning' : 'info',
            rule: message.ruleId || undefined,
            fix: message.fix
              ? {
                  range: [message.fix.range[0], message.fix.range[1]],
                  text: message.fix.text,
                }
              : undefined,
          });
        }
      }

      // Additional TypeScript-specific analysis
      const tsIssues = this.analyzeTypeScriptAST(sourceFile);
      issues.push(...tsIssues);

      // Svelte-specific analysis if it's a Svelte file
      if (filePath.endsWith('.svelte')) {
        const svelteIssues = await this.analyzeSvelteFile(filePath, content);
        issues.push(...svelteIssues);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      issues.push({
        file: filePath,
        line: 1,
        column: 1,
        message: `Analysis failed: ${errorMsg}`,
        severity: 'error',
      });
    }

    return issues;
  }

  private analyzeTypeScriptAST(sourceFile: ts.SourceFile): ASTIssue[] {
    const issues: ASTIssue[] = [];

    const visit = (node: ts.Node): void => {
      // Check for common TypeScript issues
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        // Check for implicit any
        if (!node.type && node.initializer) {
          issues.push({
            file: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
            message: `Variable '${node.name.text}' implicitly has 'any' type`,
            severity: 'warning',
            rule: 'typescript/no-implicit-any',
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private async analyzeSvelteFile(filePath: string, content: string): Promise<ASTIssue[]> {
    const issues: ASTIssue[] = [];

    // Check for Svelte 5 compatibility issues
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for old event handler syntax
      const eventHandlerRegex = /on:([a-zA-Z]+)=/g;
      let match;
      while ((match = eventHandlerRegex.exec(line)) !== null) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: match.index + 1,
          message: `Svelte 5: Use '${match[1]}' instead of 'on:${match[1]}'`,
          severity: 'warning',
          rule: 'svelte5/event-handlers',
          fix: {
            range: [
              content.indexOf(match[0], match.index),
              content.indexOf(match[0], match.index) + match[0].length,
            ],
            text: match[1],
          },
        });
      }

      // Check for old reactive statement syntax
      if (line.includes('$:') && !line.includes('let ')) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: line.indexOf('$:') + 1,
          message: 'Svelte 5: Use reactive statements with proper syntax',
          severity: 'warning',
          rule: 'svelte5/reactive-statements',
        });
      }
    }

    return issues;
  }

  async fixFile(filePath: string, applyFixes: boolean = false): Promise<FixResult> {
    const issues = await this.analyzeFile(filePath);
    const fixableIssues = issues.filter((issue) => issue.fix);

    if (!applyFixes || fixableIssues.length === 0) {
      return {
        file: filePath,
        issuesFixed: 0,
        issuesRemaining: issues.length,
        appliedFixes: [],
      };
    }

    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const appliedFixes: ASTIssue[] = [];

      // Sort fixes by range (end to start to avoid offset issues)
      fixableIssues.sort((a, b) => (b.fix?.range[0] ?? 0) - (a.fix?.range[0] ?? 0));

      for (const issue of fixableIssues) {
        if (issue.fix) {
          const [start, end] = issue.fix.range;
          content = content.slice(0, start) + issue.fix.text + content.slice(end);
          appliedFixes.push(issue);
        }
      }

      // Format with Prettier
      content = await prettier.format(content, {
        ...this.prettierConfig,
        filepath: filePath,
      });

      // Write back to file
      await fs.writeFile(filePath, content, 'utf-8');

      return {
        file: filePath,
        issuesFixed: appliedFixes.length,
        issuesRemaining: issues.length - appliedFixes.length,
        appliedFixes,
      };
    } catch (error) {
      return {
        file: filePath,
        issuesFixed: 0,
        issuesRemaining: issues.length,
        appliedFixes: [],
      };
    }
  }

  async batchFix(patterns: string[], applyFixes: boolean = false): Promise<BatchFixResult> {
    const spinner = ora('Finding files...').start();

    // Find all matching files
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
      });
      files.push(...matches);
    }

    spinner.text = `Found ${files.length} files to analyze`;

    const results: FixResult[] = [];
    let totalIssuesFixed = 0;
    let totalIssuesRemaining = 0;
    let filesFixed = 0;

    for (const file of files) {
      spinner.text = `Analyzing ${path.relative(process.cwd(), file)}`;
      const result = await this.fixFile(file, applyFixes);
      results.push(result);

      totalIssuesFixed += result.issuesFixed;
      totalIssuesRemaining += result.issuesRemaining;

      if (result.issuesFixed > 0) {
        filesFixed++;
      }
    }

    spinner.succeed(`Fixed ${totalIssuesFixed} issues in ${filesFixed} files`);

    return {
      totalFiles: files.length,
      filesFixed,
      totalIssuesFixed,
      totalIssuesRemaining,
      results,
    };
  }

  async startWatchMode(patterns: string[]): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }

    this.watcher = chokidar.watch(patterns, {
      ignored: ['node_modules/**', 'dist/**', '.git/**'],
      persistent: true,
    });

    console.log(chalk.blue('🔍 Starting watch mode for TS AST autofixing...'));

    this.watcher.on('change', async (filePath: string) => {
      console.log(chalk.yellow(`📝 File changed: ${path.relative(process.cwd(), filePath)}`));

      const result = await this.fixFile(filePath, true);

      if (result.issuesFixed > 0) {
        console.log(
          chalk.green(
            `✅ Fixed ${result.issuesFixed} issues in ${path.relative(process.cwd(), filePath)}`
          )
        );
      }

      // Notify WebSocket clients
      this.broadcastToClients({
        type: 'file_fixed',
        file: filePath,
        result,
      });
    });

    this.watcher.on('add', (filePath: string) => {
      console.log(chalk.blue(`📄 New file: ${path.relative(process.cwd(), filePath)}`));
    });
  }

  private broadcastToClients(data: unknown): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  private async handleAnalyzeFile(req: Request, res: Response): Promise<void> {
    try {
      const { filePath } = req.body as { filePath?: string };

      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }

      const issues = await this.analyzeFile(filePath);
      res.json({ file: filePath, issues });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMsg });
    }
  }

  private async handleFixFile(req: Request, res: Response): Promise<void> {
    try {
      const { filePath, applyFixes = false } = req.body as {
        filePath?: string;
        applyFixes?: boolean;
      };

      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }

      const result = await this.fixFile(filePath, applyFixes);
      res.json(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMsg });
    }
  }

  private async handleBatchFix(req: Request, res: Response): Promise<void> {
    try {
      const { patterns, applyFixes = false } = req.body as {
        patterns?: string[];
        applyFixes?: boolean;
      };

      if (!patterns || !Array.isArray(patterns)) {
        res.status(400).json({ error: 'patterns array is required' });
        return;
      }

      const result = await this.batchFix(patterns, applyFixes);
      res.json(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMsg });
    }
  }

  private async handleWatchMode(req: Request, res: Response): Promise<void> {
    try {
      const { patterns } = req.body as { patterns?: string[] };

      if (!patterns || !Array.isArray(patterns)) {
        res.status(400).json({ error: 'patterns array is required' });
        return;
      }

      await this.startWatchMode(patterns);
      res.json({ status: 'watch_mode_started', patterns });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMsg });
    }
  }

  private async handleWebSocketMessage(ws: WebSocket, data: WebSocketMessage): Promise<void> {
    try {
      switch (data.type) {
        case 'analyze_file': {
          const filePath = data.filePath as string;
          const issues = await this.analyzeFile(filePath);
          ws.send(
            JSON.stringify({
              type: 'analysis_result',
              file: filePath,
              issues,
            })
          );
          break;
        }

        case 'fix_file': {
          const filePath = data.filePath as string;
          const applyFixes = data.applyFixes as boolean;
          const result = await this.fixFile(filePath, applyFixes);
          ws.send(
            JSON.stringify({
              type: 'fix_result',
              result,
            })
          );
          break;
        }

        default:
          ws.send(
            JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${data.type}`,
            })
          );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      ws.send(
        JSON.stringify({
          type: 'error',
          error: errorMsg,
        })
      );
    }
  }

  async start(port: number = 3002): Promise<void> {
    this.app.listen(port, () => {
      console.log(`TS AST Autofixer server running on port ${port}`);
      console.log('WebSocket server running on port 8084');
    });
  }

  async cleanup(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }
    this.wss.close();
  }
}

// CLI Interface
async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.blue('TS AST Autofixer CLI'));
    console.log('');
    console.log('Usage:');
    console.log('  ts-ast-fix analyze <file>          Analyze a single file');
    console.log('  ts-ast-fix fix <file>              Fix a single file');
    console.log('  ts-ast-fix batch <pattern>...      Batch fix files matching patterns');
    console.log('  ts-ast-fix watch <pattern>...      Watch mode for automatic fixing');
    console.log('  ts-ast-fix server                  Start HTTP/WebSocket server');
    console.log('');
    return;
  }

  const fixer = new TSASTAutofixer();
  const command = args[0];

  try {
    switch (command) {
      case 'analyze': {
        if (!args[1]) {
          console.error('Please specify a file to analyze');
          process.exit(1);
        }
        const issues = await fixer.analyzeFile(args[1]);
        console.log(JSON.stringify(issues, null, 2));
        break;
      }

      case 'fix': {
        if (!args[1]) {
          console.error('Please specify a file to fix');
          process.exit(1);
        }
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'applyFixes',
            message: 'Apply fixes to the file?',
            default: false,
          },
        ]);
        const result = await fixer.fixFile(args[1], answers.applyFixes as boolean);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'batch': {
        const patterns = args.slice(1);
        if (patterns.length === 0) {
          console.error('Please specify file patterns');
          process.exit(1);
        }
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'applyBatchFixes',
            message: 'Apply fixes to all matching files?',
            default: false,
          },
        ]);
        const batchResult = await fixer.batchFix(patterns, answers.applyBatchFixes as boolean);
        console.log(JSON.stringify(batchResult, null, 2));
        break;
      }

      case 'watch': {
        let watchPatterns = args.slice(1);
        if (watchPatterns.length === 0) {
          watchPatterns = ['**/*.{ts,tsx,js,jsx,svelte}'];
        }
        await fixer.startWatchMode(watchPatterns);
        // Keep the process running
        process.on('SIGINT', async () => {
          console.log('\nStopping watch mode...');
          await fixer.cleanup();
          process.exit(0);
        });
        break;
      }

      case 'server':
        await fixer.start();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMsg);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  runCLI().catch((error) => {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fatal error:', errorMsg);
    process.exit(1);
  });
}

export type { ASTIssue, FixResult, BatchFixResult };
export { TSASTAutofixer };
